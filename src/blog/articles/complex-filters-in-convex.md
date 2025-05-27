# Using TypeScript to Write Complex Query Filters

![Lee Danilek's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F3c79cdc687d19f0b05080ae217ed23e00b239f79-594x603.jpg&w=3840&q=75)

[Lee Danilek](https://stack.convex.dev/author/lee-danilek)

a year ago

# Using TypeScript to Write Complex Query Filters

![Using TypeScript to Write Complex Query Filters](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F38dc6174837f9b83847d729910c05356e62923e0-1452x956.png&w=3840&q=75)

## TL;DR

There’s a new Convex helper to perform generic TypeScript filters, with the same performance as built-in Convex filters, and unlimited potential.

```typescript
1import { filter } from "convex-helpers/server/filter";
2// Change this
3ctx.db.query("posts")
4	.filter((q) => ...limited functionality...)
5	.paginate(opts);
6// Into this
7filter(ctx.db.query("posts"),
8	(post) => ...unlimited functionality...
9).paginate(opts);
10
```

## The filtering problem

To read data from the Convex database, you write queries to fetch data and display it in your app, and each query filters to return only the data it wants.

You can make your queries fast with indexes, discussed [below](https://stack.convex.dev/complex-filters-in-convex#Optimize-with-indexes). But to get started, or if your filter is complicated enough, you won’t be using indexes. You’ll be using plain query filters, like this:

```typescript
1export const messages = query({
2  args: { channel: v.string() },
3  handler: async (ctx, args) => {
4    return await ctx.db
5      .query("posts")
6      .filter((q) => q.eq(q.field("channel"), args.channel)
7      .collect();
8  },
9});
10
```

This is equivalent to the following query in SQL, assuming the table has no indexes:

```sql
1SELECT * FROM messages WHERE channel = "$channel"
2
```

At first glance, Convex’s filter syntax is limited. There’s `q.eq`, `q.lt`, `q.or`, and a few more, but nothing advanced. You can’t manipulate strings or loop over arrays. Newcomers to Convex may think these complex patterns are impossible. But in fact the patterns are still possible, and more powerful patterns are available than you might expect from SQL or another query language. That’s because your Convex app can leverage a TypeScript runtime to run arbitrary code _within_ the database.

## Filter too complex? Do it in TypeScript

> Disclaimer
>
> Do this while prototyping or if you know the query doesn’t have to scale. If you need to scale, use indexes as described [below](https://stack.convex.dev/complex-filters-in-convex#optimize-with-indexes).

Let’s work with an example. We’ll have a table of posts, like you might display in a Twitter-like feed, where each post has a short array of tags.

```typescript
1export default defineSchema({
2  posts: defineTable({
3    body: v.string(),
4    tags: v.array(v.string()),
5  }),
6});
7
```

That’s our data model, and we want to build a query that looks up all posts with a given tag. We’re building a simple search box where you can type in “happy” and posts tagged as “happy” show up.

My first instinct would be to use `.filter`, like the following. However, this doesn’t work because database query `.filter` doesn’t support array containment.

```typescript
1// This query is what we want.
2export const postsWithTag = query({
3  args: { tag: v.string() },
4  handler: async (ctx, args) => {
5    return await ctx.db
6      .query("posts")
7      // Doesn't work because q.arrayIncludes doesn't exist.
8      .filter((q) => q.arrayIncludes(q.field("tags"), args.tag)
9      .collect();
10  },
11});
12
```

So what can we do?

Well, remember that Convex’s runtime can run arbitrary TypeScript and JavaScript. So we can fix the example by replacing the database query `.filter` with a TypeScript array `.filter`.

```typescript
1export const postsWithTag = query({
2  args: { tag: v.string() },
3  handler: async (ctx, args) => {
4    const allPosts = await ctx.db.query("posts").collect();
5    return allPosts.filter((post) => post.tags.includes(args.tag));
6  },
7});
8
```

And that’s it! The `await ctx.db.query("posts").collect()` returns an array of all posts, which we then filter to only the posts which include `args.tag` in their array of tags. Syntactically, we swapped the order so `.collect()` comes before `.filter()`.

#### Collecting only some of the results

Swapping the order of `.collect()` and `.filter()` works and even has the same performance (more on that below), but what if you don’t need all the results? When using `.first()`, `.unique()`, `.take()`, or `.paginate()`, you don’t need to collect all documents before filtering; you want to apply the filter as you go. Even in this case, we can use TypeScript for filtering; it’s just not a simple `Array.filter()` method call.

I implemented a function in the [“convex-helpers” npm package](https://www.npmjs.com/package/convex-helpers) that does the right thing under the hood: the `filter` helper.

```typescript
1import { filter } from "convex-helpers/server/filter";
2
3export const firstPostWithTag = query({
4  args: { tag: v.string() },
5  handler: (ctx, args) => {
6    return filter(
7      ctx.db.query("posts"),
8      (post) => post.tags.includes(args.tag),
9    ).first();
10  },
11});
12
```

The `filter` function in “convex-helpers” allows you to attach a custom filter to any query:

- It can use `.first()`, `.unique()`, `.take(n)`, `.paginate(opts)`, `.collect()`, or `.next()` to get results.
- It can use indexes to efficiently scope down and order the data being filtered: `.withIndex(...)` or `.withSearchIndex(...)`.
- It works with `order("desc")` to reverse the order.
- It can accept and execute an `async` predicate function

Since it works for any query, you can give your Convex filters superpowers by replacing `X.filter((q) => ...).Y` with `filter(X, (doc) => ...).Y`.

Note the `filter` helper looks at documents one at a time. So doing `filter(db.query("posts"), predicate).first()` stops when it finds a single post for which `predicate(post)` is true. This is equivalent to `db.query("posts").filter(predicate).first()` and better than `db.query("posts").collect().filter(predicate)[0]` which would look at every post.

#### Performance of TypeScript filters is the same as SQL unindexed `WHERE` clauses

It may look like the TypeScript filter is slower than the database query filter. After all, surely telling `db.query` you only want _some_ posts must be faster than asking `db.query` for _every_ post and then removing the ones you don’t want.

However, that would be incorrect. Both the `db.query` filter and the TypeScript filter are running in the Convex runtime, which you can think of as running “in the database.” The difference is almost entirely syntactic.[1](https://stack.convex.dev/complex-filters-in-convex#user-content-fn-1) Trying to fit a complex filter in a `db.query` filter isn’t worth it, when you can just use TypeScript.

Let’s compare to using a SQL server, say Postgres, directly.

```sql
1SELECT * FROM posts WHERE 'happy'=ANY(tags);
2
```

In Postgres, this would scan all `posts`, filter them by tags in the Postgres server, and return the matching posts to the client. Convex with the TypeScript filter does the same: it scans all `posts`, filters them by tags in the Convex server, and returns the matching posts to the client. Postgres isn’t magical; it has to look at all `posts` to do the query, and so does Convex.

Let me reiterate: there is no reason to use `db.query(...).filter(...).collect()` over `filter(db.query(...), predicate).collect()`.

- Both of them scan the same documents
- They both execute the filter within the Convex runtime
- They both rerender `useQuery` hooks at the same rate — whenever anything in the table changes
- In mutations, they would cause mutations to retry at the same rate — because Convex mutations use optimistic concurrency control
- Both of them are equivalent in performance to an unindexed SQL `WHERE` clause

#### TypeScript filters are powerful and easy to write

Other databases have entire libraries of custom filter syntax, and they’re all different. Here’s array containment:

- Postgres uses `'happy'=ANY(tags)`
- MySQL uses `FIND_IN_SET('happy', tags) > 0`
- MongoDB uses `tags: { "$in" : ["happy"]}}`

In Convex you can use TypeScript or JavaScript, which means not only can you use the `Array.includes` [function](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/includes) you’re already familiar with (i.e. `post.tags.includes("happy")`), but you have the full power of recursive syntax and npm libraries at your disposal.

Want to search for tags that would be too large to print? In Convex you could do this

```typescript
1function tagsOverflow(post: Doc<'posts'>) {
2  const tagString = post.tags.map((tag) => '#' + tag).join(', ');
3  return tagString.length > 100;
4}
5const allPosts = await ctx.db.query("posts").collect();
6const overflowingPosts = allPosts.filter(tagsOverflow);
7
```

I can write this filter with rudimentary TypeScript knowledge, without searching StackOverflow. I would need help to write this same filter on a different database, if it’s even possible.

And you’re not limited to single-table filters. You can do arbitrary joins against other tables, with no worries about race conditions because Convex queries are transactional. And you can sort by an arbitrary combination of fields, using TypeScript’s `Array.sort`.

Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started

## Optimize with Indexes

Before optimizing, make sure you need to. If you only have a few hundred documents, filtering in TypeScript is fine and should be the default while prototyping.

Check out “ [Queries that scale](https://stack.convex.dev/queries-that-scale)” for tips and tricks on writing scalable queries. That article give widely useful tips, while this section doubles down on the example given above, describing every possible way you could address it.

Let’s walk through the ways to optimize the posts-and-tags query at the expense of data model complexity, mutation performance, and even the performance of other queries.

#### Array `includes` with index and a join

We want to find all posts with a given tag, so let’s add an index on the tags.

What if we add `.index("by_tags", ["tags"])` to the posts table?

An index sorts the documents in a table, allowing queries to binary-search for a range and iterate over it. If we wanted to query for posts with `tags` exactly equal to `["happy"]`, we could use this index. We could even use it to find posts where `tags` starts with `["happy", ...]` since those are all together in the index. But sorting by `tags` doesn’t place `["happy", "joyful"]` next to `["wonderful", "happy"]`; the post with tags `["sad", "corgi"]` would be in between (because “h” < “s” < “w”).

So we need a way to group all posts with common tags together. We can do this by adding a new table:

```typescript
1export default defineSchema({
2  posts: defineTable({
3    body: v.string(),
4    tags: v.array(v.string()),
5  }),
6  tagged_posts: defineTable({
7    tag: v.string(),
8    post: v.id("posts"),
9  }).index("by_tag", ["tag"]),
10});
11
```

Whenever a post is inserted, modified, or deleted, the “tagged\_posts” table must be updated in sync. This requires changing mutations, but don’t worry about race conditions when updating both tables, because mutations are committed as transactions.[2](https://stack.convex.dev/complex-filters-in-convex#user-content-fn-3)

Once your new table is set up, the query can use the index.

```typescript
1export const postsWithTag = query({
2  args: { tag: v.string() },
3  handler: async (ctx, args) => {
4    const taggedPosts = await ctx.db.query("tagged_posts")
5      .withIndex((q) => q.eq("tag", args.tag))
6      .collect();
7    return await Promise.all(
8      taggedPosts.map((taggedPost) => ctx.db.get(taggedPost.post))
9    );
10  },
11});
12
```

This is _the_ efficient way to look up posts by tag. It looks up exactly the post ids associated with each tag, and joins against the posts table.

#### Advanced indexes

In addition to standard indexes, Convex also offers full text search and vector indexes. If you store data in specific ways, you can leverage these indexes to get you the results you want. If we store tags in a space-separated string instead of an array, we can use full text search.

```typescript
1export default defineSchema({
2  posts: defineTable({
3    body: v.string(),
4    // e.g. "happy joyful", "wonderful happy", "sad corgi"
5    tags: v.string(),
6  }).searchIndex("search_tags", { searchField: "tags" }),
7});
8export const postsWithTag = query({
9  args: { tag: v.string() },
10  handler: async (ctx, args) => {
11    return await ctx.db.query("posts")
12      .withSearchIndex("search_tags", (q) => q.search("tags", args.tag))
13      .collect();
14  },
15});
16
```

The behavior has slightly changed, due to the nature of full text search. If a tag contains a space, it’s equivalent to having two tags. The query can now search for tags with fuzzy search, so misspellings are tolerated. And you can search for multiple tags at once.

Using full text search can work for our tags example, but it’s tricky to generalize to other complex filters.[3](https://stack.convex.dev/complex-filters-in-convex#user-content-fn-4) Similarly, vector indexes can organize your data by distances between vectors, which are often used with AI-computed embeddings but can be any vectors.

#### Escape hatch: pagination

You may have noticed that TypeScript filters can work with pagination. This can return small or empty pages to the client, which can slow down load times and cost database bandwidth as it traverses the entire table across many pages. But it always works! Each query only looks at a small page of data, so they can run within Convex’s query limits.

```typescript
1import { filter } from "convex-helpers/server/filter";
2
3export const postsWithTag = query({
4  args: { tag: v.string(), paginationOpts: paginationOptsValidator },
5  handler: (ctx, args) => {
6    return filter(
7      ctx.db.query("posts"),
8      (post) => post.tags.includes(args.tag),
9    ).paginate(args.paginationOpts);
10  },
11});
12
```

#### Combining indexes with TypeScript filters

Often you can use an index to narrow down the results, and attach a TypeScript filter on the results.

```typescript
1import { filter } from "convex-helpers/server/filter";
2
3export const postsWithTagAndAuthor = query({
4  args: { author: v.id("users"), tag: v.string() },
5  handler: (ctx, args) => {
6    return filter(
7      ctx.db.query("posts")
8        .withIndex("by_author", q => q.eq("author", args.author)),
9      (post) => post.tags.includes(args.tag),
10    ).collect();
11  },
12});
13
```

Maybe there are tons of posts in the database, but each author has only written a small number. Then you can look through the author’s posts with an index, and use a TypeScript filter to identify the posts with a tag.

#### Denormalizing properties

If there’s a specific query you need to make faster, you can consider storing extra fields on your document to improve query performance. Suppose your app’s home page shows posts tagged as “important”, so you want fast lookup for that specific tag.

```typescript
1// Add field to schema
2export default defineSchema({
3  posts: defineTable({
4    body: v.string(),
5    tags: v.array(v.string()),
6    isImportant: v.boolean(),
7  }).withIndex("by_important", ["isImportant"]),
8});
9// Set field when inserting and updating
10await ctx.db.insert("posts", {
11  body,
12  tags,
13  isImportant: tags.includes("important"),
14});
15// Now you can query for the denormalized field with an index
16// Remember to keep it in sync when there's a db.patch or db.replace.
17await ctx.db.query("posts")
18  .withIndex("by_important", q => q.eq("important", true))
19  .collect();
20
```

As a general pattern, you can store booleans or other types on your documents to speed up lookup by those properties.

## Recap

Complex filters work differently in Convex compared to other databases. Instead of restricted custom syntax, you can leverage TypeScript to do any filter you want. The built-in `db.query(...).filter(...)` can be replaced with the equally efficient and more powerful `filter` from convex-helpers. If you’re ready to optimize beyond filters, use indexes to speed up your queries. [Read more about that here](https://stack.convex.dev/queries-that-scale). Happy querying!

### Footnotes

1. `db.query` filters run in Rust, while TypeScript/JavaScript filters run in … JavaScript. So a `db.query(tbl).filter(pred)` may be slightly faster than a `filter(db.query(tbl), pred)` because the latter does context-switching between JavaScript and Rust. But they scan the same data under the hood, and performance differences from context switching are overshadowed by any changes that affect the number of documents scanned. [↩](https://stack.convex.dev/complex-filters-in-convex#user-content-fnref-1)

2. If you don’t want to manually manage the extra table, use [https://stack.convex.dev/ents](https://stack.convex.dev/ents) . If you want nicer query syntax, use [https://stack.convex.dev/functional-relationships-helpers](https://stack.convex.dev/functional-relationships-helpers). [↩](https://stack.convex.dev/complex-filters-in-convex#user-content-fnref-3)

3. An enterprising engineer used Convex’s full text search to build a geospatial index, with Uber’s H3 library: [https://github.com/sujayakar/geospatial-convex](https://github.com/sujayakar/geospatial-convex). It wasn’t easy, but the example shows surprising ways you can use indexes to organize data. [↩](https://stack.convex.dev/complex-filters-in-convex#user-content-fnref-4)


Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started