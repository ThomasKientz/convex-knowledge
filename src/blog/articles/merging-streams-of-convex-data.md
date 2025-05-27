# Merging Streams of Convex data

![Lee Danilek's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F3c79cdc687d19f0b05080ae217ed23e00b239f79-594x603.jpg&w=3840&q=75)

[Lee Danilek](https://stack.convex.dev/author/lee-danilek)

2 months ago

# Merging Streams of Convex data

![Merging Streams of Convex data](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Fc4d107b71fb621f093ddc845d315ca750666442d-1452x956.png&w=3840&q=75)

## TL;DR

New convex-helpers are available now for fetching streams of documents, merging them together, filtering them them out, and paginating the results. With these helpers, you can replicate patterns you may know from SQL: [`UNION ALL`](https://stack.convex.dev/merging-streams-of-convex-data#unions), [`JOIN`](https://stack.convex.dev/merging-streams-of-convex-data#streamed-joins-flatmap), [`DISTINCT`](https://stack.convex.dev/merging-streams-of-convex-data#distinct), [`GROUP BY`](https://stack.convex.dev/translate-sql-into-convex-queries/#group-by), and [`WHERE`](https://stack.convex.dev/merging-streams-of-convex-data#filtering) clauses where index fields are skipped.

```ts
1import { stream, mergedStream } from "convex-helpers/server/stream";
2import schema from "./schema";
3
4export const conversation = query({
5  args: { u1: v.id("users"), u2: v.id("users"), paginationOpts: paginationOptsValidator },
6  handler: async (ctx, { u1, u2, paginationOpts }) => {
7
8    // Stream of messages from u1 -> u2, oldest to newest
9    const messages1 = stream(ctx.db, schema)
10      .query("messages")
11      .withIndex("from_to", (q) => q.eq("from", u1).eq("to", u2));
12
13    // Stream of messages from u2 -> u1, oldest to newest
14    const messages2 = stream(ctx.db, schema)
15      .query("messages")
16      .withIndex("from_to", (q) => q.eq("from", u2).eq("to", u1));
17
18    // Merged stream of messages between u1 <-> u2, oldest to newest
19    const messages = mergedStream([messages1, messages2], ["_creationTime"]);
20
21    // Filter out archived messages, with arbitrary TypeScript predicates
22    const activeMessages = messages.filterWith(async (m) => !m.archived);
23
24    // Paginate the result
25    return activeMessages.paginate(paginationOpts);
26  },
27});
28
```

Check out the [companion article](https://stack.convex.dev/translate-sql-into-convex-queries) for more examples of patterns with vanilla Convex and query streams.

![Merge the streams](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F8fcc1e68d76cf1b97e9c10aadc53b5a6e2534251-480x201.tif&w=3840&q=75)Merge the streams

## Writing Queries as Code

Convex lets you query your database with plain TypeScript, so you can run many npm libraries _within_ a database call. Your query is automatically reactive, cached, and with no race conditions.

When fetching database records, you might find the interface a bit limited. The core interface is designed to be a [good abstraction over your data](https://www.youtube.com/watch?v=dS9jtih4dI4&t=1802s), but with only the ability to read index ranges, advanced patterns may feel out of your grasp.

If you’re approaching Convex from a SQL background, you’re used to a language with many features to union, aggregate, group, join, filter, and otherwise munge data. How can you do all of these things with index ranges? You have all of TypeScript to work with, and by the power of Turing completeness, you can write code that does anything. But we software engineers don’t like to reinvent the wheel; why write code when someone (or some LLM) can write it for you.

We at Convex have written many helpers for you, so you can read your data with the patterns you’re familiar with.

- Joins, with [Relationship helpers](https://stack.convex.dev/functional-relationships-helpers) or [Ents](https://stack.convex.dev/ents)
- [Filters](https://stack.convex.dev/complex-filters-in-convex)
- [Aggregates](https://www.convex.dev/components/aggregate)

What’s missing?

## Unions

![unions](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F35911efc2cae374074daff01200c6497a8e43c22-250x177.jpg&w=3840&q=75)unions

Well, you might think, unions are easy: just query both ranges and concatenate the results.

Suppose you have messages stored with this schema:

```tsx
1messages: defineTable({
2  from: v.id("users"),
3  to: v.id("users"),
4  body: v.string(),
5}).index("from_to", ["from", "to"]),
6// Note: in Convex, every index implicitly ends in "_creationTime"
7
```

#### Union via Raw Convex Queries

To get all of the messages in a two-way conversation, you can write this query:

```tsx
1export const conversationMessages = query({
2  args: { u1: v.id("users"), u2: v.id("users") },
3  handler: async (ctx, args) => {
4		const messages1 = await ctx.db.query("messages")
5			.withIndex("from_to", q => q.eq("from", args.u1).eq("to", args.u2))
6			.collect();
7    const messages2 = await ctx.db.query("messages")
8			.withIndex("from_to", q => q.eq("from", args.u2).eq("to", args.u1))
9			.collect();
10		return [...messages1, ...messages2]
11			.sort((a, b) => b._creationTime - a._creationTime);
12});
13
```

There’s our union! However, you may notice a limitation: you need to fetch all of the messages from both parts of the union, so you can combine them and sort.

What if you only want the first 5 messages? What if you want to paginate the conversation, getting one page of messages at a time? If there are too many messages to read them all at once, you shouldn’t have to collect them all just to union them, sort them, and take the first few.

We’re aiming for the equivalent of this SQL query:

```sql
1SELECT * FROM messages
2  WHERE (`from` = 'u1' AND `to` = 'u2')
3  OR (`from` = 'u2' AND `to` = 'u1')
4  ORDER BY _creationTime DESC LIMIT 5;
5
```

And we can achieve it in Convex by streaming documents. Here’s how!

## Stream the documents

The `convex-helpers` library introduces a new concept to Convex queries: streams. A stream is an [async iterable](https://javascript.info/async-iterators-generators) of documents, ordered by indexed fields. If you have a stream of messages ordered by creation time, you can imagine them flowing out of the stream, so you can read them one at a time.

You can create multiple streams, which don’t do anything until you start consuming them. Here’s an example of some streamed messages, where each from/to pair is streamed separately, in order of creation time.

![multiple streams](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F0953fa01edc24dc8649f91e29b9d72d72544507f-2548x692.png&w=3840&q=75)multiple streams

You create streams with a similar syntax to querying data. Instead of `ctx.db.query`, you’ll be using `stream(ctx.db, schema).query` . Streams and queries have the same interface, so you apply index and order in the same way. And after constructing a stream you can get documents like with any query, so `.first()` , `.unique()`, `.take(n)`, `.collect()`, and `.paginate(opts)` all work.

```tsx
1import { stream } from "convex-helpers/server/stream";
2import schema from "./schema";
3
4const messages = await stream(ctx.db, schema)
5  .query("messages")
6  .withIndex("from_to", q => q.eq("from", u1).eq("to", u2))
7  .order("desc")
8  .collect();
9
```

From that example you can see the syntax is familiar, just requiring wrapping `ctx.db` in a `stream(ctx.db, schema)`. So what can you do with streams?

## Merge the streams

With data streaming in from multiple index ranges, we can merge them to generate new streams, and treat the combined stream in the same way — combine it some more, or get results.

![merged streams](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F5a16ac87e26dc91a443c80b8dea8ea0f9f3dfdda-2498x258.png&w=3840&q=75)merged streams

In code, you can do this with a `mergedStream` . If `messages1` and `messages2` are the two streams, you merge them like so:

```tsx
1import { mergedStream } from "convex-helpers/server/stream";
2
3const conversation = mergedStream([messages1, messages2], ["_creationTime"]);
4// From the resulting stream you can fetch results as needed.
5const startOfConversation = await conversation.take(10);
6
```

The second argument ( `["_creationTime"]` in the example) determines the order used for merging. Under the hood, mergedStream looks at all of the potential next documents from each stream, and yields the one that comes next in this order. In order to work, _each stream must already be ordered in that way_. So `messages1` and `messages2` must be ordered by `["_creationTime"]`.

So does that mean the second argument _must_ be `["_creationTime"]`? Nope, it still gives you extra flexibility. Imagine that `messages1` is composed of messages from user Egon to user Peter, and `messages2` is messages from Peter to Egon. Since “from” and “to” fields are constant within each stream, each stream is _also_ ordered by `["from", "to", "_creationTime"]`. So what happens if you merge in that order instead? Then all of Egon’s messages will be before Peter’s in the mergedStream.

Concretely, you’re allowed to merge with documents using a prefix of index fields, which are then ordered based on the rest of the index’s fields, similar to using `.withIndex` with `q.eq(field, value)`.

Using a mergedStream, you can take a union of individual streams and interleave the results into exactly the documents you want to return from your query.

## Streamed Joins (flatMap)

![a flat map](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Fb92b7643837e29ece467473ec29fe71137db4842-300x138.jpg&w=3840&q=75)a flat map

While joins are already supported by [Relationship helpers](https://stack.convex.dev/functional-relationships-helpers) or [Ents](https://stack.convex.dev/ents), those patterns don’t support pagination easily. They support getting a page of results and fetching a join object for each one, but you can’t get arbitrarily many objects for each one. How can we use the streaming pattern to paginate a more complex join?

Each stream needs to be consumed in order, so it supports a `flatMap` interface, which may be familiar from languages like [JavaScript](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/flatMap) or [Rust](https://docs.rs/futures-util/latest/futures_util/stream/trait.StreamExt.html#method.flat_map). Each item becomes a stream of items, and all of the streams are concatenated into a single stream.

![flatMap of streams](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Fab1771430cfcfcb10d6e40529d31a63a635de4d8-2466x696.png&w=3840&q=75)flatMap of streams

If we start with a stream of friends, and do `flatMap` so each friend expands into a stream of messages, we end up with a stream of messages. These messages are ordered first by the friend, then by the message’s creation time.

In this example, we have a friends table which has all of the friends for a user, and we want to paginate through all messages sent to this user by friends.

```tsx
1import { stream } from "convex-helpers/server/stream";
2import schema from "./schema";
3
4export const messagesFromFriends = query({
5  args: { user: v.id("users"), paginationOpts: paginationOptsValidator },
6  handler: async (ctx, { user, paginationOpts }) => {
7    // Stream of the friends for args.user
8    const friends = stream(ctx.db, schema)
9      .query("friends")
10      .withIndex("user", q => q.eq("userId", args.user));
11    // For each friend, get a stream of the messages they sent to args.user.
12    // The flatMap makes this a stream of messages, ordered by [friendId, _creationTime]
13    const messagesFromFriends = friends
14	    .flatMap((friend) => stream(ctx.db, schema)
15			  .query("messages")
16	      .withIndex("from_to", q => q.eq("from", friend.friendId).eq("to", args.user)),
17				["from", "to"],
18	    );
19		// Paginate the result
20		return messagesFromFriends.paginate(args.paginationOpts);
21	},
22});
23
```

Note the second argument of `flatMap` is the indexed fields of the inner stream. In this example, `flatMap` turns each friend into a stream of messages with the "from\_to" index, so the second argument to `flatMap` is the fields of that index: `["from", "to"]`.

Now we have flat-mapped a stream into a larger stream, but we’ve lost information from the original stream. What if there’s some information on the “friend” document and we want every one of their messages to be tagged with that information. Let’s build some true JOIN-like behavior, with fields from both tables coming together so the result has the fields of both.

Enter: the `map` method.

You can map documents in a stream to any value. You can add fields, remove fields, do a one-to-one join, etc. After a `map`, the stream will have the same index keys and pagination cursors, but the values returned will be modified according to the mapping function. Here’s a simple example:

```tsx
1const pageOfMessageBodies = stream(ctx.db, schema)
2  .query("messages")
3  .map((message) => message.body)
4  .paginate(args.paginationOpts);
5
```

And here’s an example of using it alongside a join, to combine the fields of both tables onto the final documents:

```tsx
1const friends = stream(ctx.db, schema)
2  .query("friends")
3  .withIndex("user", q => q.eq("userId", args.user));
4const messagesFromFriends = friends
5	.flatMap((friend) => stream(ctx.db, schema)
6	  .query("messages")
7		.withIndex("from_to", q => q.eq("from", friend.friendId).eq("to", args.user))
8		// for each message, include relevant fields from the friend that sent it
9		.map((message) => ({
10		  fromBestFriend: friend.isBest,
11			friendshipStarted: friend._creationTime,
12		  ...message
13		}),
14		["from", "to"],
15	);
16// Paginate the result
17return messagesFromFriends.paginate(args.paginationOpts);
18
```

## Filtering

Filtering with TypeScript predicates is already possible, either with Array.filter or the [`filter` helper](https://stack.convex.dev/complex-filters-in-convex). However, these filters can cause unwanted behavior with pagination: they can cause small or empty pages if the filter excludes most documents.

The alternative, if you want your pages to be full, would be to keep reading documents until you have enough to fill a page. The built-in function `.filter` does this, but it has restricted operations. It can’t run arbitrary TypeScript, and it certainly can’t do database lookups to filter based on a join-table.

Introducing `.filterWith`, which excludes documents from a stream before applying pagination, and also allows arbitrary async TypeScript.

```tsx
1const messagesByActiveUsers = stream(ctx.db, schema)
2  .query("messages")
3  .withIndex("by_creation_time")
4  .order("desc")
5  .filterWith(async (message) => {
6    const author = await ctx.db.get(message.from);
7    return !author.isBanned;
8  });
9return messagesByActiveUsers.paginate(paginationOpts);
10
```

The filtered stream is still a stream, and it’s still ordered by the same fields as before. You can construct `mergedStream` s from filtered streams, and vice versa.

The downside of this method, and the reason I still personally prefer the `filter` helper, is you might read too much data and slow down or crash your query. To avoid that, you can pass in `maximumRowsRead` to the `paginationOpts`.

## Distinct

The article [SELECT DISTINCT without SQL](https://stack.convex.dev/select-distinct) describes how you can get the distinct values for a field, in a Convex query. This behavior, using the same algorithm, is available on streams with a nice syntax. You give it a set of indexed fields like `["to"]` and it returns the first streamed item with each distinct set of fields, e.g. the first message for each possible value of `message.to`. The distinct fields must be a prefix of the index fields, after discounting equality checks (similar to `mergedStreams` fields).

```ts
1const messageRecipients = stream(ctx.db, stream)
2  .query("messages")
3	.withIndex("from_to", q => q.eq("from", args.user))
4	.distinct(["to"])
5	.map(async (message) => (await ctx.db.get(message.to))!);
6return messageRecipients.paginate(args.paginationOpts);
7
```

This example starts with a stream of messages "from" the current user. Then it skips through the list to find the first message sent "to" each recipient. Finally, for each of these messages, it looks up the recipient user's details.

### Index Skip Scan

Databases with query planners occasionally use an [Index Skip Scan](https://oracle-base.com/articles/9i/index-skip-scanning) plan (although you can never rely on a query planner to do something efficient; it can and will choose to scan the whole table when you're not looking).

Convex streams can do that plan too (reliably). The idea of an Index Skip Scan is that for each prefix of an index key, you do a separate query on that subset of the table. Once you phrase it like that, you can see how to achieve the plan with methods we've already introduced: distinct and flatMap.

Suppose each message has a priority which is a number, and you want to find recent messages of high priority. That is, we want to find messages `WHERE priority > 5 AND _creationTime > now-24h`. This isn't a contiguous range of any index, so we need an Index Skip Scan plan:

1. Start with an index on `.index("priority", ["priority"])`
2. Find the distinct priorities greater than 5
3. flatMap each of those priorities into recently created messages.

```ts
1const priorities = stream(ctx.db, schema).query("messages")
2  .withIndex("priority", q => q.gt("priority", 5))
3	.order("desc")
4  .distinct(["priority"])
5  .map(async (message) => message.priority);
6
7const messages = priorities.flatMap(async (priority) =>
8  stream(ctx.db, schema).query("messages").withIndex("priority", q =>
9    q.eq("priority", priority).gt("_creationTime", Date.now() - 24*60*60*1000)
10  ).order("desc"),
11	["priority", "_creationTime"],
12);
13const results = await messages.paginate(args.paginationOpts);
14
```

These results will be in descending order of `["priority", "_creationTime"]`. If you want the order to ignore priority, instead of `flatMap` you would get all priorities up-front and use `mergedStream`.

```ts
1const allPriorities = await stream(ctx.db, schema).query("messages")
2  .withIndex("priority", q => q.gt("priority", 5))
3  .distinct(["priority"])
4  .map(async (message) => message.priority)
5	.collect();
6const messages = mergedStream(allPriorities.map((priority) =>
7	stream(ctx.db, schema).query("messages").withIndex("priority", q =>
8    q.eq("priority", priority).gt("_creationTime", Date.now() - 24*60*60*1000)
9	).order("desc"),
10	["_creationTime"]
11);
12const results = await messages.paginate(args.paginationOpts);
13
```

## Composing Patterns

You saw some examples in the [Distinct](https://stack.convex.dev/merging-streams-of-convex-data#distinct) section, but it's worth noting that all of the above patterns compose with each other.

For example, you can get the `.distinct` values for a field, `.filterWith` to remove some of them, `.flatMap` them into an Index Skip Scan of the table, `mergedStreams` them to interleave the results with documents from another table, `.filterWith` again to remove some more results you don't like, and `.map` the result to join with another table and remove some fields.

You're just writing TypeScript code, so you can choose to split each pattern into [TypeScript functions in different files](https://docs.convex.dev/understanding/best-practices#use-helper-functions-to-write-shared-code). You can build queries dynamically, choosing to use a different index based on function arguments: [build the query dynamically](https://stack.convex.dev/dynamic-query-builders) with the types `import { StreamQueryInitializer, StreamQuery, OrderedStreamQuery } from "convex-helpers/server/stream"`.

If you can imagine a way to fetch your data, you can implement it in code. Use streams to help realize that vision.

## Pagination Warnings

Streams are built to work well with `stream(...).<query>.paginate(opts)`, but there are some pitfalls when compared to the vanilla `ctx.db.<query>.paginate(opts)`.

1. Indexed fields, including those from filtered-out documents, are encoded into pagination cursors without encryption. If you use filtering to exclude documents that the client should not know about, their index keys may be leaked to the client. For example,





```tsx
1// Pagination cursors come from index keys on documents,
2// even if the documents are filtered out.
3// So you might be telling the client the
4// ["from", "to", "_creationTime"] fields of any message,
5// even if `haveAccess` is false.
6const messagesCheckAccessControl = await stream(ctx.db, schema)
7  .query("messages")
8  .withIndex("from_to")
9  .filterWith(async (message) => haveAccess(ctx, message))
10  .paginate(args.paginationOpts);
11
```

2. Pagination cursors only work when passed back into the same stream, constructed in the same way. If your query is data-dependent, paginated queries might get confused. For example,





```tsx
1const newestUser = await ctx.db.query("users").order("desc").first();
2return await stream(ctx.db, schema)
3	.query("messages")
4	.withIndex("from_to", q => q.eq("from", newestUser._id))
5	.paginate(paginationOpts);
6
```





This query looks at a different index range depending on data in the “users” table. If a new user is created, pages will try to reload using cursors that correspond to the original user.

When using `.paginate` on a native `ctx.db.query`, we detect this case and throw an error which causes the client to discard all pages and start over. But with `stream` pagination, you would have to identify this issue yourself.

3. Reactive pagination allows the native `ctx.db.query().paginate` to keep pages contiguous even as documents are added and removed. See the [Fully Reactive Pagination](https://stack.convex.dev/fully-reactive-pagination) post. But streaming pagination doesn’t have this guarantee automatically. If you’re using reactive pagination, like the React `usePaginatedQuery` hook, holes or overlaps may develop between pages. To avoid such problems, you can pass the `continueCursor` back in as `endCursor` to pagination opts, which will ensure that a page ends at the same place where the next page starts. This requires calling each query twice, since you don't know the continueCursor until after the first execution. If you’re calling your paginated query in a non-reactive context like an action, this won’t be an issue.


To get all the pagination features you know and love from vanilla Convex, make sure to (1) not use `.filterWith` for access control, (2) keep query definitions stable even if data changes, and (3) use non-reactive pagination or pass `endCursor` through.

## Recap

Streams are a new way to fetch data from Convex.

- Start with the abstraction of documents arriving in a stream, generated by `stream(ctx.db, schema)` and otherwise familiar query syntax
- Merge streams in adjustable merge order with `mergedStream`
- Expand each item in a stream into multiple items, potentially streamed from a JOIN table, with `.flatMap`
- Modify the stream’s values with `.map`
- Filter documents out of the stream by calling `.filterWith`
- Get results with the query functions you’re already familiar with: `.first`, `.unique`, `.take`, `.collect`, and crucially `.paginate`.

Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started