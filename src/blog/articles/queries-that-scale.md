# Queries that scale

![Ian Macartney's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F077753b63476b77fb111ba06d1bb538517033a54-3500x3500.jpg&w=3840&q=75)

[Ian Macartney](https://stack.convex.dev/author/ian-macartney)

a year ago

# Queries that scale

![Queries that scale: Indexing, Pagination, Read/Write Isolation](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F7f643eef67eb9e887e594b8618d7543c36a345c9-2877x1911.png&w=3840&q=75)

As your app grows from tens to hundreds to thousands of users, there are some techniques that will keep your database queries snappy and efficient. I’ve put together a short list of the most common techniques used by teams scaling on Convex In this post we’ll look at some common query pitfalls, and techniques to handle them.

**Common optimization opportunities we’ll explore in depth:**

1. Scanning more than you need. [Optimization: indexing](https://stack.convex.dev/queries-that-scale#1-fetching-exactly-what-you-need-with-indexes).
2. Doing too much at once. [Optimization: pagination](https://stack.convex.dev/queries-that-scale#2-splitting-up-the-work-with-pagination-and-limits).
3. Frequent cache invalidation. [Optimization: data segmentation](https://stack.convex.dev/queries-that-scale#3-optimizing-queries-for-caching).

Before I start, there are some other great resources to check out:

- [Queries](https://docs.convex.dev/functions/query-functions)
- [Introduction to Indexes and Query Performance](https://docs.convex.dev/database/indexes/indexes-and-query-perf)
- [Best Practices](https://docs.convex.dev/production/best-practices)
- [The Zen of Convex](https://docs.convex.dev/zen)
- [Document read limits](https://docs.convex.dev/functions/error-handling/#readwrite-limit-errors)
- [Paginated Queries](https://docs.convex.dev/database/pagination)

Note: while this post is about optimizing a Convex app, the concepts are universal.

## Reminder: don’t prematurely optimize

> “Premature optimization is the root of all evil” - Sir Tony Hoare / Donald Knuth

When you’re in the early stages of a project, iteration speed is crucial. Most projects fail, and frequently this is from iterating too slowly. Nascent projects feed on momentum and feedback. Spending your precious time architecting for your millionth user before you have your first is a great way to stall out a weekend project, or delay a product launch by months. **Until you have accelerating user adoption, it doesn’t matter how beautiful your architecture is.**

Especially if you use a hosted solution like Convex, you’ve already eliminated a whole class of scaling problems:

- How is traffic load-balanced between backends?
- How do I avoid holding open too many database connections?
- How many WebSocket connections can I handle?
- Does my infrastructure have capacity for a spike in traffic if my app lands on Hacker News?
- How big should my database be, and how do I recover if it goes down?

**If you have fewer than thousands of documents in your tables, you can stop reading.**

## 1: Fetching exactly what you need with indexes

These two queries look similar, but have very different efficiencies:

```tsx
1// SIMPLE: Scans every document looking for a matching team.
2const members = await ctx.db.query("members")
3  .filter(q => q.eq(q.field("teamId"), args.teamId)).collect();
4
5// OPTIMIZED: Jumps to the range of documents where the teamId matches.
6const members = await ctx.db.query("members")
7  .withIndex("by_teamId", q => q.eq("teamId", args.teamId)).collect();
8
```

### Problem

When you are querying a table in any database and you provide a filter—whether it’s a `WHERE` clause in SQL or [`.filter`](https://docs.convex.dev/database/reading-data#filtering) in Convex—the database uses those constraints to limit what it returns to you. But how does it find the records? In `SQL` it will sometimes use an [index](https://docs.convex.dev/database/indexes/), and other times “scan” every document. An index has all of the documents sorted by one or more columns and can quickly jump to the range of documents to consider. A scan iterates records one by one over your whole table, which can slow down requests, grind your database to a halt, cause memory issues, and more if your table is large. Many of the outages I’ve seen at companies with millions of customers were the result of a query doing a scan instead of an index.

Even a trained eye sometimes can’t determine whether a `SQL` query will use an efficient index, so Convex [intentionally doesn’t provide an unpredictable query planner](https://stack.convex.dev/not-sql#sql-sucks-3-reads-are-too-powerful), and instead offers an explicit syntax that makes it clear what index is being used (if any).

To avoid unpredictable latency and excessive database load, Convex [limits how many documents you can read in a transaction](https://docs.convex.dev/production/state/limits#transactions).

### Solution

As shown above, a query like this is more efficient to get team members on a team:

```tsx
1const members = await ctx.db.query("members")
2  .withIndex("by_teamId", q => q.eq("teamId", args.teamId))
3  .collect();
4
```

Given a schema like this:

```tsx
1// in convex/schema.ts
2export default defineSchema({
3  members: defineTable({
4    teamId: v.id("teams"),
5    status: v.union(v.literal("invited"), v.literal("active")),
6    // ...
7  })
8    .index("by_teamId", ["teamId"]),
9
10  teams: defineTable({
11    //...
12  })
13});
14
```

**Note:** You can still do further filtering on that range, such as:

```tsx
1const activeMembers = await ctx.db.query("members")
2  .withIndex("by_teamId", q => q.eq("teamId", args.teamId))
3  .filter(q => q.eq(q.field("status"), "active"))
4  .collect();
5
```

However, if the number of non-active members is also expected to be a big number, you should consider making a multi-field index like:

```tsx
1  members: defineTable({
2    teamId: v.id("teams"),
3    status: v.union(v.literal("invited"), v.literal("active")),
4    // ...
5  })
6    .index("by_teamId_status", ["teamId", "status"]),
7
```

Used like:

```tsx
1const members = await ctx.db.query("members")
2  .withIndex("by_teamId_status", q => q.eq("teamId", args.teamId).eq("status", "active"))
3  .collect();
4
```

Read in the [section below](https://stack.convex.dev/queries-that-scale#2-splitting-up-the-work-with-pagination-and-limits) about what to do if there are still too many documents being returned.

### Why are indexes more efficient?

Think about an index as an array of documents sorted by a field, and for documents with the same value for that field, sorted by the next field in the index and so on. An index can use binary search to find the start of the range (whether it’s looking for equality or greater / lesser than), which it then can iterate until it hits a document past its range, or it has enough documents in the case of `.first()`, `.unique()` or `.take()`. A `db.get(id)` under the hood is doing this, where the index is on the object’s ID.

Read this article for a more in-depth explanation: [Introduction to Indexes and Query Performance](https://docs.convex.dev/database/indexes/indexes-and-query-perf).

### Codebase audit: search for `.filter((q)`

Look at every call site where you’re filtering database results. Is the table always small? Are you using an index to limit to a small range first? In particular, search for `q.eq(q.field(` as you can likely replace that with an index on that field.

### How much indexing is too much?

Indexes are great for efficiently reducing how many documents you read. However, they aren’t free. Inserting a document involves adding it to every index that you specify. Inserting a document with 16 indexes is comparable to inserting 17 documents. What you might find surprising, however, is that a multi-field index doesn’t incur this overhead. So sharing a multi-field index should be done whenever possible. See [Introduction to Indexes and Query Performance](https://docs.convex.dev/database/indexes/indexes-and-query-perf) to learn more.

## 2: Splitting up the work with pagination and limits

```tsx
1// SIMPLE: Reads every document at once.
2return await ctx.db.query("posts").order("desc").collect();
3
4// SAFER: Limits how many documents are read ("50+ posts")
5return await ctx.db.query("posts").order("desc").take(50);
6
7// OPTIMIZED: Returns one page of documents at a time.
8return await ctx.db.query("posts").order("desc").paginate(args.paginationOpts);
9
```

### Problem

If you try to return all posts for some social app you’re building, that will work fine while you’re testing and only have hundreds of posts. However, as your app (hopefully) gets thousands of posts, this will slow down and eventually break. As mentioned above, to avoid unpredictable latency and excessive database load, Convex [limits how many documents you can read in a transaction](https://docs.convex.dev/production/state/limits#transactions). This helps save your backend from being overloaded by long-running queries.

### Solution

When you expect a large number of documents, you can limit how many you fetch, either by limiting your fetch (with `take`) or paginating ( `paginate`) from some “cursor.” A “cursor” here is a key for the database pointing where in the index to continue from. A `null` cursor will start at the beginning. See [the docs](https://docs.convex.dev/database/pagination) for more info, and learn more about how our pagination seamlessly handles reactivity [in this Stack post](https://stack.convex.dev/fully-reactive-pagination).

[**`.paginate`**](https://docs.convex.dev/api/interfaces/server.OrderedQuery#paginate) returns a chunk of documents, starting at some “cursor.”

- **Use case:** You want to show a subset of data quickly, but allow the UI to load more on-demand (whether automatically as the user scrolls, or by them clicking a “load more” button).

[**`.take`**](https://docs.convex.dev/api/interfaces/server.OrderedQuery#take) limits the number of documents it will return.

- **Use case:** If you’re showing something like “documents” in a UI with a “See all” button, you could just fetch and display the first 25, and say “25+ messages”. To implement the “See all” UI, use pagination.

While pagination is great, I’d argue that a lot of your UI doesn’t need to handle the fully paginated version. Simply showing the most recent 100 (using `.order("desc")`) usually suffices, especially when paired with limits.

### Codebase audit: `.collect()`

Validate that any query I’m calling `.collect()` on is either known to be small, or is using an index to reduce how many documents are being fetched. If it isn’t, consider whether `take` is fine or if you need to handle pagination for this UI.

### Do I have to paginate everything?

One option to call out is that your app can enforce limits at insert time. For instance, you could say that your user can only be associated with up to 100 teams, or that you can only have 10 associated email addresses, or that you can’t have more than 100 items in a single checkout cart. By enforcing constraints there, you don’t have to worry about building a fully-generic pagination UI in every part of your app.

## 3: Optimizing queries for caching

This section is the most nuanced. Read on for more details if this snippet doesn’t make sense.

```tsx
1// SIMPLE: invalidates every query referencing the patched user document.
2// When the user reports a heartbeat, update the user document.
3await ctx.db.patch(userId, { lastSeen: Date.now() });
4
5// OPTIMIZED: invalidates a "heartbeat" document referenced in fewer queries.
6// When the user reports a heartbeat, update their related heartbeat document.
7await ctx.db.patch(user.heartbeatId, { lastSeen: Date.now() });
8// In any query that cares about online status:
9const heartbeat = await ctx.db.get(user.heartbeatId);
10const tooOld = Date.now() - HEARTBEAT_TOO_OLD;
11const online = heartbeat ? tooOld < heartbeat.lastSeen : false;
12
13// WEBSCALE™️: only invalidates the document when it meaningfully changes
14// When the user reports a heartbeat, update the related heartbeat and presence documents:
15await ctx.db.patch(user.heartbeatId, { lastSeen: Date.now() });
16if (!presence.isOnline) await ctx.db.patch(presence._id, { online: true });
17// In some cron, update all online users' status:
18if (heartbeat.lastSeen < tooOld) await ctx.db.patch(user.presenceId, { isOnline: false });
19// In any query that cares about online status:
20const online = (await ctx.db.get(user.presenceId))?.isOnline ?? false;
21
```

### Problem

Convex manages caching for you, along with invalidating the cache and updating your UI whenever you have a subscription, such as using the `useQuery` React hook. This is amazing and powerful, but can sometimes be resources-intensive if the data is updating more often than is useful to the user.

For context, it’s important to understand how Convex queries work. Here’s some docs on [queries,](https://docs.convex.dev/functions/query-functions#caching--reactivity) [realtime](https://docs.convex.dev/realtime) and a [relevant page of the tutorial](https://docs.convex.dev/tutorial/reactor). The gist is that when you’re subscribed to a query from a client, the results automatically update on any change to the documents referenced in the query. This is achieved by tracking all of the documents a query reads from the database, and re-running the query when any of them change.

This can be wasteful if your query reads from frequently-updating documents, as it will be invalidated frequently.

### Solution

We’ll look at solving this through an example and show how to structure your queries to only get invalidated when there’s a meaningful user-facing change. We’ll show breaking out frequently changing data into separate documents, and then a further optimization of batching updates from frequently-changing data.

#### Heartbeat Example

Consider a query that fetches the most recent 10 users who have opened a shared document (think: [Notion](https://www.youtube.com/watch?v=0OaDyjB9Ib8)) and we want to show which users are online. We know whether a user is online with a “heartbeat” - a mutation sent on some interval that tells the server that the client is still connected. There are some clever client-side tricks to this that I’ll explore in a future post, but in this post let’s say that we send a mutation every 10 seconds updating the “last seen” time.

```tsx
1// in convex/schema.ts
2export default defineSchema({
3  users: {
4    name: v.string(),
5		profilePicUrl: v.string(),
6    lastSeen: v.number(),
7  }
8});
9
10// in convex/heartbeat.ts
11export const heartbeat = mutation({
12  args: {},
13  handlers: async (ctx) => {
14    const user = await getUserOrThrow(ctx);
15    await ctx.db.patch(user._id, { lastSeen: Date.now() });
16  },
17});
18
```

#### Part 1: Isolating frequent updates into separate documents

As you can imagine, many queries in your app won’t care about whether the user is online, but will reference (query) at least one of the users. Every 10 seconds the query would be invalidated, since the `lastSeen` field changed for the queried user, regardless of whether the query uses information about the user’s online status. For instance, let's say you had a query that returned the user's name and profile picture:

```ts
1export const myUserProfile = query({
2  args: {},
3  handler: async (ctx, args) => {
4    const user = await getUserOrThrow(ctx);
5    const { name, profilePicUrl } = user;
6    return { name, profilePicUrl };
7  },
8});
9
```

This query doesn't need to know when the `lastSeen` time is, but would be invalidated on every `lastSeen` update. To optimize this, we can avoid frequently updating documents that are widely referenced in queries. Instead of storing `lastSeen` on the user document, we can have a separate table tracking the user’s last seen state, which I call `heartbeats` here:

```tsx
1// in convex/schema.ts
2export default defineSchema({
3  users: defineTable({
4    name: v.string(),
5		profilePicUrl: v.string(),
6    heartbeatId: v.id("heartbeats"),
7  }),
8  heartbeats: defineTable({
9    lastSeen: v.number(),
10  })
11});
12
13// in convex/heartbeat.ts
14export const updateHeartbeat = mutation({
15  args: {},
16  handlers: async (ctx) => {
17    const user = await getUserOrThrow(ctx);
18    await ctx.db.patch(user.heartbeatId, { lastSeen: Date.now() });
19  },
20});
21
```

This way, queries that don’t explicitly fetch the user’s heartbeat document won’t be invalidated when that document is updated. The `heartbeatId` will stay the same. The queries that care about the heartbeat status can fetch that data for the users it cares about, making it depend (and therefore get cached and invalidated by) relevant data.

#### Part 2: Batching updates from frequently-changing data

Let’s say our query for the most recent users uses the `lastSeen` time to determine who is online. If our page has ten users each sending a heartbeat every ten seconds, it will be updating once per second. If we had 100 users, it would be invalidated every 0.1 seconds just to know who is online, even if nobody has left / arrived!

```tsx
1// SIMPLE: invalidated on every heartbeat
2export const getOnlineStatus = query({
3  args: { userIds: v.array(v.id("users")) },
4  handler: async (ctx, args) => {
5    const tooOld = Date.now() - HEARTBEAT_TOO_OLD;
6    return await Promise.all(args.userIds.map( async (userId) => {
7      const user = await ctx.db.get(userId);
8      const heartbeat = user && await ctx.db.get(user.heartbeatId);
9      return !!heartbeat && heartbeat.lastSeen > tooOld;
10    }));
11  },
12});
13
```

Instead, for this use-case, we only care when a user’s “online” status changes. It’s nice to immediately see when a user goes online, but we can wait and calculate if they’ve gone offline all at once every 10 seconds. We do this by both isolating the frequently updating data from the query, and calculating the online status asynchronously in batch.

```tsx
1// in convex/schema.ts
2export default defineSchema({
3  users: defineTable({
4    name: v.string(),
5		profilePicUrl: v.string(),
6    presenceId: v.id("presence"),
7  }),
8  // Stores coarse-grained information about whether a user is online.
9  presence: defineTable({
10    isOnline: v.boolean(),
11    heartbeatId: v.id("heartbeats"),
12  }).index("by_isOnline", ["isOnline"]),
13  // Stores the frequently-updated data about the last heartbeat.
14  heartbeats: defineTable({
15    lastSeen: v.number(),
16  })
17});
18
```

The online status now just queries the presence documents, not the heartbeat documents.

```tsx
1// OPTIMIZED: only is invalidated with the presence document changes
2// (when someone changes between online and offline)
3export const getOnlineStatus = query({
4  args: { userIds: v.array(v.id("users")) },
5  handler: async (ctx, args) => {
6    return await Promise.all(args.userIds.map( async (userId) => {
7      const user = await ctx.db.get(userId);
8      const presence = user && await ctx.db.get(user.presenceId);
9      return presence?.isOnline ?? false;
10    }));
11  },
12});
13
```

To update a user as online, we can immediately update a previously-offline user when they report a heartbeat, while also updating the heartbeat document as before:

```tsx
1// in convex/heartbeat.ts
2export const updateHeartbeat = mutation({
3  args: {},
4  handlers: async (ctx) => {
5    const user = await getUserOrThrow(ctx);
6    const presence = (await ctx.db.get(user.presenceId))!;
7    // If the user just came online, immediately update their status.
8    // This will invalidate the `getOnlineStatus` so the UI can immediately update.
9    if (!presence.isOnline) await ctx.db.patch(presence._id, { online: true });
10    const heartbeat = (await ctx.db.get(presence.heartbeatId))!;
11    await ctx.db.patch(heartbeat._id, { lastSeen: Date.now() });
12  },
13});
14
```

To mark the user as offline, we do so often in batches from a cron every 10 seconds\[1\]:

```tsx
1// See https://docs.convex.dev/scheduling/cron-jobs to learn more about crons
2
3// in convex/crons.ts
4crons.interval("mark users as offline", { seconds: 10 }, internal.crons.markOffline);
5
6export const markOffline = internalMutation({
7  args: { cursor: v.optional(v.string()) },
8  handler: async (ctx, args) {
9    // Fetch one batch. If a cursor was passed in, continue from there.
10    const batch = await ctx.db.query("presence")
11      // Only fetch online users, since only they need to be checked.
12      .withIndex("by_isOnline", q => q.eq("isOnline", true))
13      .paginate({
14        cursor: args.cursor ?? null, // null is the cursor for the first batch.
15        numItems: 100,
16      });
17
18    const tooOld = Date.now() - HEARTBEAT_TOO_OLD;
19    // Update all presence status in parallel based on the last seen time.
20    await Promise.all(batch.page.map(async (presence) => {
21      const heartbeat = (await ctx.db.get(presence.heartbeatId))!;
22      if (heartbeat.lastSeen < tooOld) {
23        await ctx.db.patch(presence._id, { isOnline: false });
24      }
25    }));
26    // If there is still more data to process, we schedule ourselves for the next batch.
27    if (!batch.isDone) {
28      await ctx.scheduler.runAfter(0, internal.crons.markOffline,
29        { cursor: batch.continueCursor });
30    }
31  },
32});
33
```

### Codebase audit: `.replace(` and `.patch(`

Scan where you’re replacing and patching data. Are you updating certain documents frequently? If so, what queries are depending on these documents? If the documents are referenced in a lot of queries that don’t care about the field(s) you’re updating, consider splitting the document up into the infrequently-changing fields and the frequently updated ones, and adjusting your queries to only fetch the subset it needs.

## Summary

Convex is built to scale, and by leveraging these patterns as your user base grows, you can improve performance and throughput in your database. To echo earlier advice, be wary of premature optimization. You don’t need to worry about this until your app scales.

Hungry for more?

- If you’re interested in learning more about an ORM-style abstraction that uses indexes efficiently for you, check out [**Convex Ents: Manage your document relationships**](https://stack.convex.dev/ents).
- To learn more about structuring data in a database, check out **[Relationship Structures: Let's Talk About Schemas](https://stack.convex.dev/relationship-structures-let-s-talk-about-schemas)**.

As always, come chat with us [in Discord](https://convex.dev/community) about the article, or anything about Convex.

Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started

We use third-party cookies to understand how people interact with our site.

See our [Privacy Policy](https://www.convex.dev/legal/privacy/) to learn more.

DeclineAccept