# Translate SQL into Convex Queries

![Lee Danilek's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F3c79cdc687d19f0b05080ae217ed23e00b239f79-594x603.jpg&w=3840&q=75)

[Lee Danilek](https://stack.convex.dev/author/lee-danilek)

2 months ago

# Translate SQL into Convex Queries

![Translate SQL to Convex](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F814f6f76a2304f0d6c43271d210f242032fac09d-1452x956.png&w=3840&q=75)

Here’s a cheatsheet with examples of conversions between SQL queries and Convex queries. This article is geared towards developers (and LLMs) who have familiarity with SQL and want to translate those familiar patterns into Convex queries. You'll learn how to [`UNION`](https://stack.convex.dev/translate-sql-into-convex-queries#union), [`JOIN`](https://stack.convex.dev/translate-sql-into-convex-queries#one-to-one-join), [`DISTINCT`](https://stack.convex.dev/translate-sql-into-convex-queries#distinct), [`GROUP BY`](https://stack.convex.dev/translate-sql-into-convex-queries#group-by), do [`WHERE`](https://stack.convex.dev/translate-sql-into-convex-queries#arbitrary-filter) clauses, and [`SELECT`](https://stack.convex.dev/translate-sql-into-convex-queries#select-fields) fields.

For this article we’ll imagine you’re building a Slack-like chat app, where “users” send “messages” in “channels”. The translation should work with any app you can imagine building on a relational database with regular BTree-backed indexes. See [this article](https://stack.convex.dev/databases-are-spreadsheets) to help understand how databases are organized by indexes.

While each snippet will describe a single query, you can combine them however you like. In SQL you could use sub-queries, `UNION ALL`, or multiple statements in a transaction. In Convex you can compose the patterns as you would compose any TypeScript code.

**About the snippets:**

The SQL snippet describes what data you’re trying to fetch.

- The query will return the whole data set but could be modified with additional `LIMIT` or `OFFSET` or extra `WHERE` clauses to read incrementally.

- The SQL syntax should usually match PostgreSQL, although similar syntax is usually possible in MySQL or other variants.


Each Convex query snippet shows how to fetch equivalent data in Convex.

- The Convex query will use equivalent indexes and have equivalent performance to the SQL query.

- This translation will `.collect` all results, because yielding results incrementally is difficult without streams.


The Convex [QueryStream helper](https://stack.convex.dev/merging-streams-of-convex-data) enables you to read results incrementally, without collecting them all.

- The snippet shows how to call `.paginate` [1](https://stack.convex.dev/translate-sql-into-convex-queries#user-content-fn-1), although you can also choose to call `.take`, `.first`, `.unique`, or `.collect`.

- To use QueryStreams you would `import { stream, mergedStream } from "convex-helpers/server/stream"`. QueryStreams were added in convex-helpers version 0.1.72.


### Why Translate?

While the Convex queries below may look more complicated, there are a lot of benefits that empower your Convex queries to do exactly what you want:

- They’re guaranteed to be efficient. Unlike SQL, which can decide to stop using an index and do full table scans whenever it wants, your Convex queries use exactly the indexes you specify.
- Using code gives you a lot more expressive power and ability to build abstractions.
- Type-safety from your database schema that match runtime values, instead of templating a sql query string or hoping your ORM schema matches your database at runtime.
- Convex-powered reactivity, where [queries subscribe to changes](https://docs.convex.dev/tutorial/#how-convex-works).

For more SQL comparisons, see [this article](https://stack.convex.dev/not-sql) and [this video](https://www.youtube.com/watch?v=dS9jtih4dI4).

## Union

#### SQL

```sql
1CREATE INDEX author ON messages (author, _creationTime);
2
3SELECT * FROM messages WHERE author IN ('Alice', 'Bob')
4ORDER BY _creationTime DESC;
5-- or equivalently
6SELECT * FROM messages WHERE author = 'Alice' OR author = 'Bob'
7ORDER BY _creationTime DESC;
8-- or equivalently
9(SELECT * FROM messages WHERE author = 'Alice') UNION ALL
10(SELECT * FROM messages WHERE author = 'Bob')
11ORDER BY _creationTime DESC;
12
```

#### Convex

Collect results from the two queries, union the arrays, then sort the results[2](https://stack.convex.dev/translate-sql-into-convex-queries#user-content-fn-2).

```tsx
1messages: defineTable(...).index("author", ["author"])
2
3async function authoredMessages(author: string) {
4  return await ctx.db.query("messages")
5    .withIndex("author", q => q.eq("author", author)).order("desc")
6    .collect();
7}
8
9const allMessages = await Promise.all(["Alice", "Bob"].map(authoredMessages));
10const messages = messages.flat()
11  .sort((a, b) => b._creationTime - a._creationTime);
12
```

#### Convex QueryStreams

```tsx
1messages: defineTable(...).index("author", ["author"])
2
3function authoredMessages(author: string) {
4  return stream(ctx.db, schema).query("messages")
5    .withIndex("author", q => q.eq("author", author)).order("desc");
6}
7
8const messages = mergedStream(
9  ["Alice", "Bob"].map(authoredMessages),
10  ["_creationTime"],
11);
12const results = await messages.paginate(args.paginationOpts);
13
```

## Arbitrary Filter

Arbitrary filters in Convex let you run TypeScript checks, including async code and code imported from npm libraries. Since they don’t use an index, arbitrary filters end up scanning the entire table, although with pagination they can scan it incrementally.

Note filters can be combined with any other pattern in this article, and in particular filters are great to apply after narrowing down the query to a small index range.

#### SQL

SQL is very restrictive in the filters it supports, compared to Convex which can run any TypeScript code, including code from npm libraries. For this translation example we choose something that SQL _can_ support: calculating the length of a string.

```sql
1SELECT * FROM messages WHERE CHAR_LENGTH(body) <= 280;
2
```

#### Convex

This pattern is described in the [Complex Query Filters](https://stack.convex.dev/complex-filters-in-convex) article.

```tsx
1const allMessages = await ctx.db.query("messages").collect();
2const messages = allMessages.filter((message) => message.body.length <= 280));
3
```

#### Convex QueryStreams

```tsx
1const messages = stream(ctx.db, schema).query("messages")
2  .filterWith(async (message) => message.body.length <= 280);
3const results = await messages.paginate(args.paginationOpts);
4
```

## One-to-One Join

For this example, we assume that users only have access to certain channels, through “channelMemberships”. Each channel membership has a user and a channelId. You can use the channelId to look up the single channel with that ID.

#### SQL

```sql
1CREATE INDEX `user` ON channelMemberships (userId, channelId);
2
3SELECT channelMemberships.*, channels.* FROM channelMemberships
4  JOIN channels ON channelMemberships.channelId = channels._id
5  WHERE channelMemberships.userId = 'Bob'
6  ORDER BY channelMemberships.channelId;
7
```

#### Convex

```tsx
1channelMemberships: defineTable(...).index("user", ["userId", "channelId"])
2
3const memberships = await ctx.db.query("channelMemberships")
4  .withIndex("user", q => q.eq("userId", "Bob"))
5  .collect();
6const channels = (await Promise.all(channelMemberships
7  .map((membership) => {
8    const channel = await ctx.db.get(membership.channelId)!;
9    return {...membership, ...channel};
10  })
11)).flat();
12
```

#### Convex QueryStreams

```tsx
1channelMemberships: defineTable(...).index("user", ["userId", "channelId"])
2
3const channels = stream(ctx.db, schema).query("channelMemberships")
4  .withIndex("user", q => q.eq("userId", "Bob"))
5  .map(async (membership) => {
6    const channel = await ctx.db.get(membership.channelId)!;
7    return {...membership, ...channel};
8  });
9const results = await channels.paginate(args.paginationOpts);
10
```

## One-to-Many Join

This example extends the previous one, but instead of joining to get the channel details, we join to get the multiple messages in each channel that a user has access to.

#### SQL

```sql
1CREATE INDEX channel ON messages (channelId, _creationTime);
2CREATE INDEX `user` ON channelMemberships (userId, channelId);
3
4SELECT channelMemberships.*, messages.* FROM channelMemberships
5  JOIN messages ON channelMemberships.channelId = messages.channelId
6  WHERE channelMemberships.userId = 'Bob'
7  ORDER BY (messages.channelId, messages._creationTime);
8
```

#### Convex

```tsx
1messages: defineTable(...).index("channel", ["channelId"])
2channelMemberships: defineTable(...).index("user", ["userId", "channelId"])
3
4const memberships = await ctx.db.query("channelMemberships")
5  .withIndex("user", q => q.eq("userId", "Bob"))
6  .collect();
7const messages = (await Promise.all(memberships.map(async (membership) => {
8  const messagesInChannel = await ctx.db.query("messages")
9    .withIndex("channel", q => q.eq("channelId", membership.channelId))
10    .collect();
11  return messagesInChannel.map((message) => ({...channel, ...message}));
12}))).flat();
13
```

#### Convex QueryStreams

```tsx
1messages: defineTable(...).index("channel", ["channelId"])
2channelMemberships: defineTable(...).index("user", ["userId", "channelId"])
3
4const memberships = stream(ctx.db, schema).query("channelMemberships")
5  .withIndex("user", q => q.eq("userId", "Bob"));
6
7const messages = memberships.flatMap(async (membership) =>
8  stream(ctx.db, schema).query("messages")
9    .withIndex("channel", q => q.eq("channelId", membership.channelId))
10    .map(async (message) => ({...membership, ...message})),
11  ["channelId"],
12);
13const results = await messages.paginate(args.paginationOpts);
14
```

## Distinct

If your table has a lot of rows but comparatively few unique values for a particular field, you can find these unique values with a `DISTINCT` query. And in particular you can find the first row for each distinct value of the field.

For our example, we have lots of messages, but they're distributed across few channels. So we can get the most recent message in each channel with a `DISTINCT` query.

#### SQL

```sql
1CREATE INDEX channel ON messages (channelId, _creationTime);
2
3SELECT DISTINCT ON (channelId) * FROM messages
4ORDER BY channelId DESC, _creationTime DESC;
5-- or equivalently
6SELECT channelId, MAX(_creationTime) FROM messages
7GROUP BY channelId ORDER BY channelId DESC;
8
```

#### Convex

This pattern is described in [https://stack.convex.dev/select-distinct](https://stack.convex.dev/select-distinct) .

```tsx
1messages: defineTable(...).index("channel", ["channelId"])
2
3const messages = [];
4let message = await ctx.db.query("messages")
5	.withIndex("channel).order("desc").first();
6while (message !== null) {
7  messages.push(message);
8  message = await ctx.db.query("messages")
9    .withIndex("channel", q => q.lt("channelId", message.channelId))
10    .first();
11}
12
```

#### Convex QueryStreams

```tsx
1messages: defineTable(...).index("channel", ["channelId"])
2
3const messages = stream(ctx.db, schema).query("messages").withIndex("channel").order("desc")
4  .distinct(["channelId"]);
5const results = await messages.paginate(args.paginationOpts);
6
```

## Group By

Grouping By can be thought of as a DISTINCT query combined with a JOIN, so that’s how you would construct it in Convex.

Note for this example we’re doing a COUNT of each group, which requires reading all of the rows, in both SQL and Convex. In Convex you can choose to use the [Aggregate](https://www.convex.dev/components/aggregate) or [Sharded Counter](https://www.convex.dev/components/sharded-counter) components to compute counts faster.

#### SQL

```sql
1CREATE INDEX channel ON messages (channelId, _creationTime);
2
3SELECT channelId, COUNT(*) FROM messages
4GROUP BY channelId ORDER BY channelId DESC;
5
```

#### Convex

```tsx
1messages: defineTable(...).index("channel", ["channelId"])
2
3const channelCounts = [];
4let message = await ctx.db.query("messages").withIndex("channel").order("desc").first();
5while (message !== null) {
6  const messagesInChannel = await ctx.db.query("messages")
7    .withIndex("channel", q => q.eq("channelId", message.channelId))
8    .collect();
9  channelCounts.push({
10    channelId: message.channelId,
11    count: messagesInChannel.length,
12  });
13  message = await ctx.db.query("messages")
14    .withIndex("channel", q => q.lt("channelId", message.channelId))
15    .first();
16}
17
```

#### Convex QueryStreams

```tsx
1messages: defineTable(...).index("channel", ["channelId"])
2
3const channelCounts = stream(ctx.db, schema).query("messages").withIndex("channel").order("desc")
4  .distinct(["channelId"])
5  .map(async (message) => {
6    const messagesInChannel = await ctx.db.query("messages")
7	    .withIndex("channel", q => q.eq("channelId", message.channelId))
8	    .collect();
9	  return { channelId: message.channelId, count: messagesInChannel.length };
10	});
11const results = await messages.paginate(args.paginationOpts);
12
```

## Select fields

Note that in Convex, even with QueryStreams, database queries always read entire documents. They can remove or modify fields in code before returning them to the client. This is not much different from row-based SQL servers, which read the entire row from disk before returning selected fields to the SQL client.

NOTE: Reading entire rows from storage is usually fine because the bandwidth bottleneck is between the client and the server (SQL server or Convex server), not between the server and the underlying storage. However, if you want to isolate large, infrequently-read fields from small, frequently-read ones, you can store them in separate tables and do JOINs when needed.

#### SQL

```tsx
1SELECT body FROM messages;
2
```

#### Convex

```tsx
1const messages = await ctx.db.query("messages").collect();
2const bodies = messages.map((message) => message.body);
3// NOTE this one works with `.paginate` too: call `.map` on `results.page`.
4// https://docs.convex.dev/database/pagination#transforming-results
5
```

#### Convex QueryStreams

```tsx
1const bodies = stream(ctx.db, schema).query("messages")
2  .map(async (message) => message.body);
3const results = await bodies.paginate(args.paginationOpts);
4
```

## Filter on index fields

This is a straightforward example of Convex's `.withIndex` method, although it's worth reiterating that SQL is not guaranteed to use any index, even if the perfect index exists. I've had a simple lookup of a single row, specified by equality on all fields of the primary key, and Postgres decided to scan a massive table to find the row.

#### SQL

```sql
1CREATE INDEX channel ON messages (channelName, _creationTime);
2
3SELECT * FROM messages WHERE channelName = '#general' AND
4	_creationTime > (CURRENT_TIMESTAMP - INTERVAL '1 DAY');
5
```

#### Convex

```ts
1const messages = await ctx.db.query("messages")
2	.withIndex("channel", q => q.eq("channelName", "#general"))
3	.collect();
4// .paginate also works here, even without QueryStreams.
5
```

#### Convex QueryStreams

```ts
1const messages = stream(ctx.db, schema).query("messages")
2	.withIndex("channel", q => q.eq("channelName", "#general"));
3const results = await messages.paginate(args.paginationOpts);
4
```

## Filter with index fields out of order

This is also known as an [Index Skip Scan in SQL query planners](https://oracle-base.com/articles/9i/index-skip-scanning).

Convex’s `ctx.db.query().withIndex()` will only read from a contiguous index range. So there’s a more complex pattern if the data you want isn’t contiguous within the index. See the [QueryStream article](https://stack.convex.dev/merging-streams-of-convex-data#index-skip-scan) for more description and examples.

#### SQL

```sql
1CREATE INDEX priority ON messages (priority, _creationTime);
2
3SELECT * FROM messages WHERE priority > 5 AND
4  _creationTime > (CURRENT_TIMESTAMP - INTERVAL '1 DAY');
5
```

#### Convex

```tsx
1messages: defineTable(...).index("priority", ["priority"])
2
3// Get distinct priorities >5
4const priorities = [];
5let priorityDoc = await ctx.db.query("messages")
6  .withIndex("priority", q => q.gt("priority", 5))
7  .first();
8while (priorityDoc !== null) {
9  priorities.push(priorityDoc.priority);
10  priorityDoc = await ctx.db.query("messages")
11    .withIndex("priority", q => q.gt("priority", priorityDoc.priority))
12    .first();
13}
14// Get recent messages for each of these priorities
15const messages = (await Promise.all((priority) =>
16  ctx.db.query("messages").withIndex("priority", q =>
17    q.eq("priority", priority).gt("_creationTime", Date.now() - 24*60*60*1000)
18  ).collect()
19)).flat();
20
```

#### Convex QueryStreams

```tsx
1messages: defineTable(...).index("priority", ["priority"])
2
3const priorities = stream(ctx.db, schema).query("messages")
4  .withIndex("priority", q => q.gt("priority", 5))
5  .distinct(["priority"])
6  .map(async (message) => message.priority);
7
8const messages = priorities.flatMap(async (priority) =>
9  stream(ctx.db, schema).query("messages").withIndex("priority", q =>
10    q.eq("priority", priority).gt("_creationTime", Date.now() - 24*60*60*1000)
11  )
12);
13const results = await messages.paginate(args.paginationOpts);
14
```

## Composing Patterns

Putting it all together, let's see how you would compose the above patterns to translate a complicated query.

This query gets the message body and distinct emoji reactions for each non-deleted message in channels the user has access to.

This example has many of the above patterns:

- a one-to-many join from channelMemberships to messages
- an arbitrary filter on 'deleted'
- an Index Skip Scan for the `_creationTime` filter
- selecting only the body field of messages
- a DISTINCT query for emoji reactions

#### SQL

```sql
1CREATE INDEX channel ON messages (channelId, _creationTime);
2CREATE INDEX user ON channelMemberships (userId, channelId);
3CREATE INDEX message ON reactions (messageId, _creationTime);
4
5SELECT
6  messages._id,
7  messages.body,
8  messages._creationTime,
9  (SELECT ARRAY_AGG(DISTINCT emoji)
10   FROM reactions
11   WHERE reactions.messageId = messages._id
12   ORDER BY reactions._creationTime DESC) AS emojis
13FROM messages
14JOIN channelMemberships ON channels._id = channelMemberships.channelId
15WHERE channelMemberships.userId = $1
16  AND messages._creationTime >= $2
17  AND messages.deleted = FALSE
18ORDER BY messages.channelId DESC, messages._creationTime DESC;
19
```

#### Convex

```ts
1messages: defineTable(...).index("channel", ["channelId"])
2channelMemberships: defineTable(...).index("user", ["userId"])
3reactions: defineTable(...).index("message", ["messageId", "emoji"])
4
5async function getEmojis(messageId) {
6	const emojis = [];
7	let reactionDoc = await ctx.db.query("reactions")
8		.withIndex("message", q => q.eq("messageId", messageId))
9		.first();
10	while (reactionDoc !== null) {
11		emojis.push(reactionDoc.emoji);
12		reactionDoc = await ctx.db.query("reactions")
13			.withIndex("message", q => q.eq("messageId", messageId).gt("emoji", reactionDoc.emoji))
14			.first();
15	}
16	return emojis;
17}
18
19const memberships = await ctx.db.query("channelMemberships")
20  .withIndex("user", q => q.eq("userId", args.userId))
21	.order("desc")
22	.collect();
23const allMessages = await Promise.all(
24	memberships.map((membership) => ctx.db.query("messages")
25		.withIndex("channel", q => q.eq("channelId", membership.channelId).gte("_creationTime", args.creationTime))
26		.order("desc")
27		.collect()
28	)
29);
30const nonDeletedMessages = allMessages.flat().filter((message) => !message.deleted);
31const messages = await Promise.all(nonDeletedMessages.map(
32	async (message) => ({
33		_id: message._id,
34		_creationTime: message._creationTime,
35		body: message.body,
36		emoji: await getEmojis(message._id),
37	})
38);
39
```

#### Convex QueryStreams

```ts
1messages: defineTable(...).index("channel", ["channelId"])
2channelMemberships: defineTable(...).index("user", ["userId"])
3reactions: defineTable(...).index("message", ["messageId", "emoji"])
4
5const memberships = stream(ctx.db, schema).query("channelMemberships")
6	.withIndex("user", q => q.eq("userId", args.userId))
7	.order("desc");
8const messages = memberships.flatMap(async (membership) =>
9	stream(ctx.db, schema).query("messages")
10		.withIndex("channel", q => q.eq("channelId", membership.channelId).gte("_creationTime", args.creationTime))
11		.order("desc")
12).filterWith(async (message) => !message.deleted)
13.map(async (message) => {
14	const emojis = await stream(ctx.db, schema).query("reactions")
15		.withIndex("message", q => q.eq("messageId", message._id))
16		.distinct("emoji")
17		.map(async (reaction) => reaction.emoji)
18		.collect();
19	return {
20		_id: message._id,
21		_creationTime: message._creationTime,
22		body: message.body,
23		emoji: reaction?.emoji,
24	};
25});
26const results = await messages.paginate(args.paginationOpts);
27
```

## Recap

Anything that you can query with a SQL database, you can write into a Convex query. The patterns may be trickier to figure out, and for incremental paginated results you may need to use helpers like [Query Streams](https://stack.convex.dev/merging-streams-of-convex-data), but that's because Convex is pushing you towards efficient query plans, to ensure your queries are as fast and cheap as they can be.

### Footnotes

1. If you want to use `.paginate`, make sure to check out the [pagination warnings](https://stack.convex.dev/merging-streams-of-convex-data#pagination-warnings) [↩](https://stack.convex.dev/translate-sql-into-convex-queries#user-content-fnref-1)

2. You can hypothetically merge these results faster, because each array is already sorted. But improving `O(n log n)` CPU time to `O(n)` is unlikely to matter when the bottleneck is probably on the storage fetches. And, for comparison, the SQL engine is likely going to materialize the entire union on disk before sorting, which is much worse. [↩](https://stack.convex.dev/translate-sql-into-convex-queries#user-content-fnref-2)


Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started