# Database Relationship Helpers

![Ian Macartney's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F077753b63476b77fb111ba06d1bb538517033a54-3500x3500.jpg&w=3840&q=75)

[Ian Macartney](https://stack.convex.dev/author/ian-macartney)

a year ago

# Database Relationship Helpers

![Code for joining queries with helpers for one-to-many, many-to-many, and more.](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Fa27ff456078d5777de3cba0c91a13187f11f86e7-2670x1674.png&w=3840&q=75)

In the [Relationship Structures post](https://stack.convex.dev/relationship-structures-let-s-talk-about-schemas), we looked at how to structure one-to-one, one-to-many and many-to-many relationships using a relational database, and what those queries look like in Convex.

In a SQL-based database, you might be used to the `JOIN` operator, which connects fields from multiple tables into a single flat result. With Convex, we chose to instead expose predictable primitives that you can compose to fetch data, without the sometimes-unpredictable black-box of a query planner. To read more about our thoughts on SQL, [read this post](https://stack.convex.dev/not-sql). To read more about our indexes, [read the docs](https://docs.convex.dev/database/indexes/indexes-and-query-perf).

In this post, we’ll look at some helper functions to help write code to traverse relationships in a readable, predictable, and debuggable way.
The code is in the [convex-helpers npm package](https://www.npmjs.com/package/convex-helpers) if you want to use it in your project.
You can see the source (including fancy typescript types) [here](https://github.com/get-convex/convex-helpers/blob/main/packages/convex-helpers/server/relationships.ts). By the end, we’ll be able to compose functions to execute a complex query involving the SQL equivalent of **select** ing, **join** ing, **group** ing, **sort** ing, and fetching **distinct** documents.

The examples will reference this schema:

```ts
1defineSchema({
2  users: defineTable({
3    name: v.string(),
4  }),
5  authorProfiles: defineTable({
6    userId: v.id('users'), // one to one
7    bio: v.string(),
8  }).index('userId', ['userId']),
9  posts: defineTable({
10    title: v.string(),
11    authorId: v.id('authorProfiles'), // one to many
12    content: v.string(),
13  }).index('by_authorId', ['authorId']), // by_ prefix works too
14  comments: defineTable({
15    postId: v.id('posts'), // one to many
16    userId: v.id('users'), // one to many
17    text: v.string(),
18  }).index('postId', ['postId']),
19  postCategories: defineTable({ // many to many relationship table
20    postId: v.id('posts'),
21    categoryId: v.id('categories'),
22  }).index('postId', ['postId']),
23  categories: defineTable({ ... }),
24});
25
```

To use `convex-helpers`, first `npm i convex-helpers` then you can import them:

```js
1import {
2  getAll,
3  getOneFrom,
4  getManyFrom,
5  getManyVia,
6} from "convex-helpers/server/relationships";
7
```

## One-to-one

When each document only has one or zero related documents.

### Direct reference: `db.get`

![An arrow points from the left circle to the right circle](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Fd5f932d9aec16a2718db3172743b9b80f5db6f7e-3176x1544.png%3Fw%3D800&w=3840&q=75)An arrow points from the left circle to the right circle

If you have an id of a document, you can directly access it with `db.get`. This is the simplest lookup.

```js
1const user = await db.get(author.userId);
2
```

### Back-reference: the `getOneFrom` helper

![An arrow points from the right circle to the left circle](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F44225e22c177e1b2991393180a46a18c9089e402-3176x1544.png%3Fw%3D800&w=3840&q=75)An arrow points from the right circle to the left circle

To fetch a document that has a reference to the document on hand, we use an index on the other table's reference.
For example we can look up an author profile from a user by querying on the index for `userId`:

```js
1const author = await db
2  .query("authorProfiles")
3  .withIndex("userId", q => q.eq("userId", user._id))
4  .unique();
5
```

Using the helper from `convex-helpers`, you can write:

```js
1const author = await getOneFrom(db, "authorProfiles", "userId", user._id);
2
```

**Note**: As is, it will return null if there is no author profile for that user.
If you want to throw an exception instead, use `getOneFromOrThrow`.

## One-to-many

When each document has potentially many related documents.

### Direct references: the `getAll` helper

![A circle on the left points to 3 circles on the right](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F1fdccdb7fdfd240ce605711efbf03eac4f7b6ad4-3176x3176.png%3Fw%3D800&w=3840&q=75)A circle on the left points to 3 circles on the right

To look up a list of IDs all at once, we fetch all of the documents in parallel:

```js
1const userPromises = [];
2for (const userId of userIds) {
3  userPromises.push(db.get(userId));
4}
5const users = await Promise.all(userPromises);
6
```

If you aren't familiar with `Promise.all`, or want to learn about an `asyncMap` helper, read [below](https://stack.convex.dev/functional-relationships-helpers#mapping-over-async-functions).

To make this more readable, we can use the `getAll` helper:

```js
1const users = await getAll(db, userIds);
2
```

**Note**: As is, it will return null in the place of any user that doesn't exist.
If you want to throw an exception instead, use `getAllOrThrow`.

### Back-references: the `getManyFrom` helper

![Three circles on the right point to a circle on the left](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F8b47eb1f3ca96bba00da5eb13063d3e446d9d6d5-3176x3176.png%3Fw%3D800&w=3840&q=75)Three circles on the right point to a circle on the left

We can extend the `getOneFrom` helper for the one-to-many case, differing only by using `collect` instead of `unique`. To get all of the posts for an author, we can do:

```js
1const posts = db
2  .query("posts")
3  .withIndex("by_authorId", q => q.eq("authorId", author._id))
4  .collect();
5
```

Using the helper from `convex-helpers`, you can write:

```js
1const posts = await getManyFrom(db, "posts", "by_authorId", author._id);
2
```

Together with `getAll` we can look up all the users associated with comments on a post:

```js
1const comments = await getManyFrom(db, "comments", "postId", post._id);
2const userIds = comments.map(comment => comment.userId);
3const users = await getAll(db, userIds);
4
```

These helpers may seem small, but they end up making for much more readable queries. See [below](https://stack.convex.dev/functional-relationships-helpers#come-together-joining-data-with-functions) for a complex example.

### How does the by\_ prefix work?

If you were reading carefully, you might be surprised that I could type just `getManyFrom(db, "posts", "by_authorId", author._id)` above even though the field referenced is just `authorId`. Both the types and the runtime will not require you to pass another argument specifying the field name if your index is just the field name with a "by\_" prefix. The tradeoff here is that it doesn't allow you to use these helpers if your field itself starts with a "by\_" prefix.

If you do want to have your index named something else, you can pass another argument specifying the field name. e.g. if our index was `.index("by_author", ["authorId"])` then the call would need to look like `getManyFrom(db, "posts", "by_author", author._id, "authorId")`.

**This works for all of the relationship helpers that use indexes.**

### What about N+1?

With traditional databases, there is a common issue called the “N+1 problem” where, instead of fetching all data in one request, you end up fetching **one** entity, then the **N** entities associated with it. This is an issue primarily because the code doing the querying is executing far from the database, so you end up waiting on many network requests, and if each query is non-trivial, you may cause excess load to your database.

Wait, isn’t that exactly what the `getAll` helper is doing?

Yes! However, Convex’s architecture changes some key aspects, which enables us to write queries like `getAll`.

1. The functions are being executed very close to the database. This cuts out the largest contributor to the wait time, especially if you’re executing requests serially (i.e. a waterfall of requests).
2. Convex’s concurrency model ( [read about our OCC here](https://docs.convex.dev/database/advanced/occ#when-occ-loses-determinism-wins)) doesn’t ever lock the database for reads, and thanks to its deterministic V8 runtime, queries can be cached efficiently and automatically by Convex, while maintaining stronger default ACID guarantees than other databases.[1](https://stack.convex.dev/functional-relationships-helpers#user-content-fn-1)
3. The `db.get` query is fast. Using “point queries” where you’re just loading one row is not a difficult or expensive task for our database. My heuristic when writing a query is that `db.get` is on the order of 1 millisecond, going from function to database and back with data.

All of this together means that you can write code to fetch the data you want instead of coercing your desires into a SQL command. And by the way, the SQL query planner is doing exactly this - fetching a range of documents via an index, then doing point queries for all the associated documents. It’s just hiding it away from you, making the performance harder to predict and debug.

Don’t worry if this is a bit confusing, the good news is you can write code without having to worry about packing your queries into a single expression.

## Many-to-many

For many-to-many relationships using **direct references** and **back-references** (see the [Relationship Structures](https://stack.convex.dev/relationship-structures-let-s-talk-about-schemas) post for more details), the access pattern is the same as for one-to-many: you can use `getAll` and `getManyFrom`. When you structure a many-to-many relationship by using a relationship (aka join) table, however, we can combine looking up the relationship documents with looking up each referenced document.

### Join table: The `getManyVia` helper

![Three circles on the left and three circles on the right connect both ways via intermediary circles](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F061207caeb5de6f6061f314381a1fe1a78d149e5-3176x3176.png%3Fw%3D800&w=3840&q=75)Three circles on the left and three circles on the right connect both ways via intermediary circles

In our schema, we used the "postCategories" table to store associations between a post and a category.
To fetch all of the categories for a post, without the helper, it could look like:

```js
1const links = await getManyFrom(db, "postCategories", "postId", post._id);
2const categoryIds = links.map(link => link.categoryId);
3const categories = await getAll(db, categoryIds);
4
```

Using the `convex-helpers` utility:

```js
1const categories = await getManyVia(db, "postCategories", "categoryId", "postId", post._id);
2
```

**Note**: As above, it will return null in the place of any category that doesn't exist.
If you deleted a category but not the entries in "postCategories" pointing to it, for example.
If you want to throw an exception instead, use `getManyViaOrThrow`.

## Mapping over async functions

Let’s take a quick detour to make ourselves a utility function called `asyncMap`. In javascript, there’s an easy way to turn array A into a new array B using `const b = a.map(someFunction)`. It does roughly the equivalent of:

```js
1const b = [];
2for (const item of a) {
3  b.push(someFunction(item));
4}
5
```

Unfortunately, when you use `map` over an `async` function, you end up with a list of promises instead of the results. So let’s define a function that will act like `map` but await all the promises, like:

```js
1const bPromises = [];
2for (const item of a) {
3  // Start running each async function
4  bPromises.push(someFunction(item));
5}
6const b = [];
7for (const item of bPromises) {
8  // Wait for each function to finish
9  b.push(await someAsyncFunction(item));
10}
11
```

### The `asyncMap` helper

A simplified version of it which behaves like the above code, uses `Promise.all`:

```js
1async function asyncMap(iterable, asyncTransform) {
2  const promises = [];
3	for (const item of iterable) {
4		promises.push(asyncTransform(item));
5	}
6  return Promise.all(promises);
7}
8
```

For example:

```js
1const b = await asyncMap(a, someAsyncFunction);
2
```

This creates all of the promises without waiting on any of them, so they can run in parallel. For those familiar with promises and async-await patterns, you are likely used to this pattern. We could even simplify it to a one-liner:

```js
1const asyncMap = (list, asyncTransform) => Promise.all(list.map(asyncTransform));
2
```

However, I prefer the for-loop version as it supports iterables like `Set`, which don’t have a `.map` function.

To use the version in [convex-helpers](https://www.npmjs.com/package/convex-helpers):

```js
1import { asyncMap } from "convex-helpers";
2
3// getAll equivalent
4const users = await asyncMap(userIds, doc => db.get(doc));
5// or even
6const users = await asyncMap(userIds, db.get);
7
8// getManyVia equivalent
9const categories = await asyncMap(
10  await getManyFrom(db, "postCategories", "postId", post._id),
11  (link) => db.get(link.categoryId)
12);
13
```

### A note on index naming

The helpers so far have leveraged the pattern of naming the index the same as the field you're indexing.
This helps avoid having to type out overly-duplicative information.
However, you may want a different name, especially for an index that has multiple fields.
For example, if you want the postCategories table to be able to check whether a post already has a category, you might change the "postId" index to:

```js
1defineSchema({
2
3  postCategories: defineTable({ // many to many relationship table
4    postId: v.id('posts'),
5    categoryId: v.id('categories'),
6  }).index('postId_categories', ['postId', "categories"]),
7})
8
```

In this case, you can pass an extra argument to the helpers (and their TypeScript type will force you to):

```js
1// if there were only one category for a post
2const link = await getOneFrom(db, "postCategories", "postId_categories", post._id, "postId");
3// get all the postCategory link documents.
4const links = await getManyFrom(db, "postCategories", "postId_categories", post._id, "postId");
5// many via join table
6const categories = await getManyVia(
7  db, "postCategories", "categoryId", "postId_categories", post._id, "postId"
8);
9
```

Thankfully the TypeScript types will prompt you to pick a table name, then an index name, then an argument that matches the type of the index's first field, then the field name if it doesn't match the index.

## Come together: joining data with functions

The beauty of writing the database queries in code is that you can compose functions to get the flexibility you want, while having full control over the order of queries ( `db.query`) and direct lookups ( `db.get`).

As a reminder, here are all the helper functions defined above:

```js
1import {
2  getAll,
3  getOneFrom,
4  getManyFrom,
5  getManyVia,
6} from "convex-helpers/server/relationships";
7
8// one-to-one via back reference
9const author = await getOneFrom(db, "authorProfiles", "userId", user._id);
10// one-to-many direct lookup
11const users = await getAll(db, userIds);
12// one-to-many or many-to-many via back references
13const posts = await getManyFrom(db, "posts", "by_authorId", author._id);
14// many via join table
15const categories = await getManyVia(db, "postCategories", "categoryId", "postId", post._id);
16
```

With these, we can implement all sorts of lookups and joins, all in javascript!

**Let’s write a query to:**

1. Look up all posts I’ve written (associated with my “author profile”).
2. Include the associated comments in a “comments” field of each post.
3. Add the categories associated with each post via a join table “postCategories” and put them in a “categories” array on each post.
4. Sort the posts by the number of comments.
5. Get the comment users, but only the distinct users, and return them separately since there might be a lot of duplication.

```js
1const author = await getOneFrom(db, 'authorProfiles', 'userId', user._id);
2const barePosts = await getManyFrom(db, 'posts', 'by_authorId', author._id);
3const commenterIds = new Set();
4const posts = await asyncMap(barePosts, async (post) => {
5  const comments = await getManyFrom(db, 'comments', 'postId', post._id);
6  comments.forEach((comment) => commenterIds.add(comment.userId));
7  const categories = await getManyVia(
8    db, 'postCategories', 'categoryId', 'postId', post._id
9  );
10  return { ...post, comments, categories };
11});
12posts.sort((a, b) => b.comments.length - a.comments.length);
13const commentUsers = await getAll(db, commenterIds);
14return {posts, commentUsers};
15
```

No query planning, no SQL, and no table scans. And it’s all just code, so you can write your own helper functions to make it even more readable, and trust that you know what it’s doing under the hood.

## Summary: the beauty of layering

By leveraging some helper functions, we were able to reconstruct various operations to combine data. Unlike SQL, however, we were explicit about the operations, rather than trusting a query planner and guessing at which indexes to define. In Convex, you can solve many problems with function abstractions, rather than pushing that complexity to the database layer. And thanks to the proximity to the database, these queries are very fast, so you don’t have to compromise on speed to have the ergonomics of writing in Javascript.

This applies to many other areas in Convex as well - writing authorization in functions rather than a clunky DSL, writing “middleware” as wrapper functions, and more. By providing powerful primitives and guarantees about execution purity, Convex gives you a solid foundation on which to layer behavior.

As always, let us know what you think in [Discord](https://convex.dev/community), and if you come up with your own patterns for readable, composable querying.

### Footnotes

1. Most databases, including Postgres, default to “read committed” isolation, which is a weaker guarantee than “serializable” isolation, which Convex provides by default. [↩](https://stack.convex.dev/functional-relationships-helpers#user-content-fnref-1)


Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started