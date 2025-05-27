# Searching for Sanity

![Jamie Turner's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Fee80addc4a0315dc3175c4a08f64f8bc294568bd-400x400.jpg&w=3840&q=75)

[Jamie Turner](https://stack.convex.dev/author/jamwt)

2 years ago

# Searching for Sanity

![Searching for Sanity](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F35cb37bae77e4771f2d3eb430c7455dd303624de-1920x1292.jpg&w=3840&q=75)

While using one of your favorite apps, have you ever run into something like this?

It’s pretty reasonable to expect that once you add a document to your Notion workspace, the search box will find it! What’s going on here?

## Unsavory search secrets

You may be surprised to learn that there’s nothing particularly unusual about what Notion is doing. In most systems, backend search architectures are structured just so:

In this common design, the system that _stores_ your records is separate from the system that _indexes_ them for search. Specialized systems are chained together, such as MySQL for the database and Elasticsearch for full-text search.

So there is inherently a delay in the pipeline that connects storage and search, and your users might experience a temporary inconsistency–a stored document not yet searchable, just as we saw with Notion. This inconsistency is often only a few seconds, but sometimes can be minutes or hours.

While the ease of leveraging several ready-to-go systems for each task may feel like a pragmatic decision for a software team, it really sucks that it “leaks” internal architectural choices in the form of a confusing user experience.

## Fancy concepts, simple expectations

At Convex, we love deep infrastructure concepts like strong consistency and [ACID](https://stack.convex.dev/dont-drop-acid). But not because distributed systems papers are riveting beach reads. Instead, because we believe the mark of a great platform is facilitating the easy creation of software that Just Works. Convex projects should automatically do what the developer and user expect.

And that’s why Convex’s search is _transactional:_ search indexes in Convex guarantee that the very moment a document is committed to the database, that document shows up in search results. User expectations met!

And while we’re at it, Convex developers expect that everything in our platform is seamlessly reactive. So we made search reactive, too.

## What “just works” looks like

Let’s use Convex to search through a sample of Wikipedia articles!

As a prerequisite, we retrofitted the Convex [tutorial chat app](https://docs.convex.dev/tutorial/welcome-to-convex) by loading 100,000 random Wikipedia articles with the [command line import tool](https://docs.convex.dev/using/cli#import-a-file-into-convex). We assigned the page body to the `body` field and the title to the `author` field of the messages table.

Time to get searching! First, we need to create the search index using [Convex’s schema definition](https://docs.convex.dev/using/schemas). Let’s create an index called “search\_body” that is indexing the `body` field. We’ll do this by using the `searchIndex` method on the schema object:

```tsx
1import { defineSchema, defineTable } from "convex/schema";
2import { v } from "convex/values";
3
4export default defineSchema({
5  messages: defineTable({
6    body: v.string(),
7    author: v.string(),
8  }).searchIndex("search_body", {
9    searchField: "body",
10  }),
11});
12
```

Then, we can easily use this search index in our app’s [query functions](https://docs.convex.dev/using/database-queries) by calling our query’s `withSearchIndex` method.

```tsx
1export default query(async ({ db }, { bodyQuery }) => {
2  const results = await db
3    .query("messages")
4    .withSearchIndex("search_body", q => q.search("body", bodyQuery))
5    .take(5);
6  return results;
7});
8
```

Finally, as usual in React + Convex apps, we’ll leverage the Convex library’s `useQuery` hook to [attach this backend query function](https://docs.convex.dev/using/writing-convex-functions#defining-convex-functions) to a component rendering a list of results:

This principled take on search is just one of the many ways in which Convex nudges your projects toward the [pit of success](https://blog.codinghorror.com/falling-into-the-pit-of-success/). So start a new project today, try out transactional search, and [come show us what you built](https://convex.dev/community)!

Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started