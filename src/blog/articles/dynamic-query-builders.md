# Convex Cookbook: Dynamic Query Builders

![Lee Danilek's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F3c79cdc687d19f0b05080ae217ed23e00b239f79-594x603.jpg&w=3840&q=75)

[Lee Danilek](https://stack.convex.dev/author/lee-danilek)

5 months ago

# Convex Cookbook: Dynamic Query Builders

![Convex Cookbook: Dynamic Query Builders](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F76c7ea17f4037d4c210e33fab4813aa104cf90e3-1452x956.png&w=3840&q=75)

## TL;DR

You can write a Convex query whose structure -- which index/order/filters to apply, if any -- depends on runtime factors. This article gives a recipe for building queries dynamically.

The file [dynamicQuery.ts](https://github.com/ldanilek/query-cookbook/blob/main/convex/dynamicQuery.ts) has a pattern which you can copy to build Convex queries dynamically.
You can copy it into a `.cursorrules` file to encourage Cursor to use it, or otherwise reference it in your workflow.

### What's a dynamic query?

Convex stores your data so you can query it in many ways. This article will assume the following schema:

```ts
1export default defineSchema({
2  messages: defineTable({
3    author: v.string(),
4    conversation: v.string(),
5    body: v.string(),
6    hidden: v.boolean(),
7  }).index("by_author", ["author"])
8  .index("by_conversation", ["conversation"])
9  .searchIndex("by_body", { searchField: "body" }),
10})
11
```

Usually you know what you want, so you can write a query to get everything you need, like here's how to get the 10 most recent messages with a given author:

```ts
1const results = await ctx.db.query("messages")
2  .withIndex("by_author", q=>q.eq("author", args.author))
3  .order("desc")
4  .take(10);
5
```

But sometimes you want to build the query dynamically, where parts of the query only apply in certain circumstances. e.g. You want a single query that can find messages by author, or by conversation, or with no filters at all. And once you've added the filters, you sometimes want to order the newest message first, or sometimes the oldest should be first.

Convex queries are plain TypeScript, so you want to build up a `query` variable like so:

```ts
1let query = ctx.db.query("messages");
2if (args.authorFilter !== undefined) {
3  query = query.withIndex("by_author", q=>q.eq("author", args.authorFilter));
4}
5if (args.conversationFilter !== undefined) {
6  query = query.withIndex("by_conversation", q=>q.eq("conversation", args.conversationId));
7}
8if (args.bodyFilter !== undefined) {
9  query = query.withSearchIndex("by_body", q=>q.search("body", args.bodyFilter));
10}
11if (args.newestFirst) {
12  query = query.order("desc");
13}
14if (args.excludeHidden) {
15  query = query.filter(q => q.eq(q.field("hidden"), false));
16}
17const results = await query.take(10);
18
```

This code works in JavaScript because there are no typechecks, but if you try to
write this code in TypeScript, it won't work! This article describes why and gives a recipe for fixing the problem.

## Why doesn't a single `query` variable work?

Convex queries are constrained by TypeScript to be valid, following simple rules:

- You can't use two indexes to execute a single query, so `query.withIndex(...).withIndex(...)` is invalid.
- A query can only have a single order, so `query.order("desc").order("asc")` is invalid.
- A text search index is both an index and an order (the order is by descending search relevance), so `.withSearchIndex(...)` is incompatible with `.withIndex(...)` and `.order(...)`.

A Convex query keeps all of the necessary information in its type. On the initial table query -- `ctx.db.query("messages")` \-\- you can apply an index. But after you've applied an index, you can no longer apply another, so the query must change type. Similarly, you can't do `.order("desc").order("asc")` so applying an order also changes the query type.

In TypeScript a variable's type can't change, so you can't use a single `query` variable for all stages of building the query.

## Solution: build in stages with multiple variables

The solution is to build the query with a new variable and type for each stage.

1. Pick a table to query.
2. Pick an index and apply an index filter.
3. Pick an order.

After these three stages, we have a complete query. There are two further things we can do, but they don't change the query type:

- Apply a post-filter, if any.
- Get results.

```ts
1// Stage 1: Pick the table to query.
2const tableQuery: QueryInitializer<DataModel["messages"]> = ctx.db.query("messages");
3
4// Stage 2: Pick the index to use.
5let indexedQuery: Query<DataModel["messages"]> = tableQuery;
6if (args.authorFilter !== undefined) {
7  indexedQuery = tableQuery.withIndex("by_author", q=>q.eq("author", args.authorFilter));
8}
9if (args.conversationFilter !== undefined) {
10  indexedQuery = tableQuery.withIndex("by_conversation", q=>q.eq("conversation", args.conversationId));
11}
12
13// Stage 3: Apply ordering.
14let orderedQuery: OrderedQuery<DataModel["messages"]> = indexedQuery;
15if (args.newestFirst) {
16  orderedQuery = indexedQuery.order("desc");
17}
18
19// Stage 2 & 3: Apply text search index which includes both index and ordering.
20if (args.bodyFilter !== undefined) {
21  orderedQuery = tableQuery.withSearchIndex("by_body", q=>q.search("body", args.bodyFilter));
22}
23
24// Post-filter: Filters don't change the query builder's type.
25// You can also use the `filter` helper from `convex-helpers`.
26if (args.excludeHidden) {
27  orderedQuery = orderedQuery.filter(q => q.eq(q.field("hidden"), false));
28}
29
30// Get results using `.first`, `.unique`, `.collect`, `.take`, or `.paginate`.
31const results = await orderedQuery.take(10);
32
```

Now we've separated out the stages of building a dynamic query in Convex,
while appeasing the TypeScript gods to ensure that the query is always valid.

### Revealed structure: multiple filters

Consider what happens if you pass in both `args.authorFilter` and `args.conversationFilter`.

In the untyped code, it looks like both filters are applied:

```ts
1if (args.authorFilter !== undefined) {
2  query = query.withIndex("by_author", q=>q.eq("author", args.authorFilter));
3}
4if (args.conversationFilter !== undefined) {
5  query = query.withIndex("by_conversation", q=>q.eq("conversation", args.conversationId));
6}
7
```

But in fact this code throws an error at runtime, because the query can only have a single index. In the typed code, you can see the variable `indexedQuery` getting overwritten with a new `tableQuery.withIndex(...)`, so the author filter is lost and only the conversation filter applies:

```ts
1if (args.authorFilter !== undefined) {
2  indexedQuery = tableQuery.withIndex("by_author", q=>q.eq("author", args.authorFilter));
3}
4if (args.conversationFilter !== undefined) {
5  indexedQuery = tableQuery.withIndex("by_conversation", q=>q.eq("conversation", args.conversationId));
6}
7
```

If this behavior is intended, the separate variables have made it more obvious. On the other hand, if we want both filters to apply, we have two choices:

1. Apply one of the filters as a post-filter, either with `.filter()` or the [`filter` helper function](https://stack.convex.dev/complex-filters-in-convex).
2. Use a multi-field index such as `.index("by_conversation_and_author", ["conversation", "author"])`.

## Put it all together

The [dynamicQuery.ts](https://github.com/ldanilek/query-cookbook/blob/main/convex/dynamicQuery.ts)
file has the full example, along
with comparisons to untyped JavaScript and an equivalent SQL query builder.

When building a Convex app, you can usually use fixed queries whose structure
doesn't depend on runtime arguments. But sometimes you need to build a query
dynamically, and this article shows how to do so while maintaining typechecks.

Code helpers like Copilot and Cursor might not discover the pattern on their own,
so you can hint it to them by copying `dynamicQuery.ts` into their context.

Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started