# Take Control of Pagination

![Lee Danilek's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F3c79cdc687d19f0b05080ae217ed23e00b239f79-594x603.jpg&w=3840&q=75)

[Lee Danilek](https://stack.convex.dev/author/lee-danilek)

10 months ago

# Take Control of Pagination

![a page 1 icon and some brackets with ellipsis to represent pagination](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Fbc67c72570874d7872c82f3eff063b8b435075a2-1452x956.png&w=3840&q=75)

_**Note: If you're looking for our post on CRUD APIs, you can find that [here](https://stack.convex.dev/crud-and-rest).**_

When you store a lot of data in Convex, you usually want to display it incrementally, using pagination to show one page at a time.

The Convex framework offers `.paginate(opts)` and `usePaginatedQuery()` to implement infinite-scroll pagination. These functions are powerful and handle the complex edge cases of stitching the pages together seamlessly. However, there are several scenarios they do not support, or at least don't support out-of-the-box:

1. Joins like “list all (paginated) messages for each of my (paginated) contacts”
2. Unions like “list all (paginated) messages for each of my 3 email accounts.”
3. Virtual infinite scroll view where you jump to a point and then scroll up or down. Think “show me the photos from June 2020 and photos before and after”
4. Unloading and unsubscribing from unnecessary pages. If you load 100 pages, those 100 pages of documents stick around in the browser’s memory and keep updating when the data changes, even if the documents are far off-screen.
5. Keeping pages bounded in size. If documents are inserted quickly — e.g. if there are hundreds of inserts per mutation — pages can grow beyond the limits of a Convex function, and throw an error.

These are difficult problems to solve, and a complete solution would require complicating the base interface. For example, if you call `.paginate` twice in a query function, are you aiming for a join pattern or a union? It becomes unclear whether `loadMore` should load more of the first or the last `db.query`. As another example, do you want pagination cursors to be opaque — which is the default with `.paginate` and useful for security in some cases — or do you want to be able to parse them to allow “jump to June 2020, which may already be a loaded page.”

Convex may eventually solve all of these problems with the built-in interface, but for now we give you the power to solve them yourselves, leveraging the versatility of the Convex runtime running arbitrary TypeScript. Introducing `getPage`:

```ts
1import { getPage } from "convex-helpers/server/pagination";
2
```

### What is `getPage`?

This function is a new helper, built on top of existing Convex primitives. It supports many arguments, most of them optional with sensible defaults:

- a start position: ”give me photos starting at June 2020”
- an end position: “give all photos up until August 2020”
- an index: “paginate in order of user surname, instead of creation time”
- an order for the index: “give me messages from newest to oldest”
- a soft limit: “give me 100 messages, but allow more if the page grows”
- a hard limit: “give me at most 500 messages, even if the page grows”

See the [source code](https://github.com/get-convex/convex-helpers/blob/main/packages/convex-helpers/server/pagination.ts) for the full interface and docstrings.

The return value includes a page of documents, whether there are more documents to request, and the index key for each document in the page.

### What’s an index key?

The `getPage` function returns an object:

```ts
1const { page, indexKeys, hasMore } = await getPage(...);
2
```

Each document in `page` has a corresponding index key, so the document `page[3]` has index key `indexKeys[3]`. But what is an index key?

Index keys are locations in the index. For a table like

```ts
1contacts: defineTable({
2	surname: v.string(),
3	givenName: v.string()
4}).index("name", ["surname", "givenName"])
5
```

an index key would be something like `["Smith", "John", 1719412234000, "jh7evzh9wejnwjv88y1a1g9c7h6vpabd"]`. Documents in the returned page are sorted by the index key. To avoid duplicates, every index key ends with the creation time and ID of the document.

Usually you don’t need to pay attention to what’s in an index key, because you can pass `getPage`'s response `indexKeys` directly to its request `startIndexKey` or `endIndexKey` fields. However, it can be useful to say “start the page at June 2020” by passing `startIndexKey: [Date.parse("2020-06-01")]`: the sort order puts this before all dates in June 2020.

When you fetch a page of documents with `getPage`, you get an index key corresponding to each document, and you can use these to fetch more documents. The last index key `indexKeys[indexKeys.length - 1]` is particularly useful, because it corresponds to the index location at the end of the fetched page.

## Patterns

With `getPage` giving you complete control of your pagination, you can now solve any of the above problems. Let's look at implementing some common patterns with concrete examples.

All of the following examples will use and build off of this data model:

```tsx
1contacts: defineTable({
2	surname: v.string(),
3	givenName: v.string(),
4	emailAddress: v.string(),
5}).index("name", ["surname", "givenName"]),
6emails: defineTable({
7	address: v.string(),
8	body: v.string(),
9}).index("address", ["address"]),
10
```

### Basic Pagination

Let’s start with the most basic query. We list a page of 100 contacts in `_creationTime` order, starting at the beginning of time:

```tsx
1// In the convex/contacts.ts file
2export const firstPageOfContacts = query((ctx) => {
3	return getPage(ctx, { table: "contacts" });
4});
5// Then in React, call the query
6const { page } = useQuery(api.contacts.firstPageOfContacts);
7
```

To get the next page of contacts, we ask for the page starting at the index key at the end of the first page.

```tsx
1// In convex/contacts.ts
2export const pageOfContacts = query((ctx, args) => {
3	return getPage(ctx, { table: "contacts", ...args });
4});
5// In React
6const firstPage = useQuery(api.contacts.pageOfContacts);
7const secondPage = useQuery(api.contacts.pageOfContacts, firstPage ? {
8	startIndexKey: firstPage.indexKeys[firstPage.indexKeys.length - 1],
9} : "skip");
10
```

Now you have two pages. If you want a dynamic number of pages, instead of `useQuery` you will want [`useQueries`](https://docs.convex.dev/api/modules/react#usequeries). At some point you’ll want to wrap all this in a hook, similar to the built-in `usePaginatedQuery`.

The return value of `getPage` includes three things:

1. The page of documents
2. The index key for each document, allowing you to fetch related pages
3. A boolean `hasMore` to tell you if there are more pages to fetch

### Use any index

By default, `getPage` uses the index on `_creationTime`, but it can use any database index (text-search and vector indexes are not supported). The index determines the format for index keys, and also the order of returned documents. When specifying an index, you have to tell `getPage` your schema too, so it knows which fields are in the index.

The following query will get the first page of contacts in order of surname, then givenName, because the "name" index is defined as `.index("name", ["surname", "givenName"])`.

```tsx
1import schema from "./schema";
2const { page, indexKeys } = await getPage(ctx, {
3	table: "contacts",
4	index: "name",
5	schema,
6});
7
```

### Pagination with a join

Built-in pagination supports simple joins: if I’m paginating over contacts and each contact has a `profilePicId`, I can fetch the profile picture for each contact with the pattern described [here](https://docs.convex.dev/database/pagination#transforming-results). However, you can’t do pagination _within_ this join, because the built-in Convex query currently can’t keep track of multiple pagination cursors in one query.

Suppose I want to fetch the first page of contacts, and the first page of emails for each contact. With `getPage` I can do this:

```tsx
1const {
2	page: pageOfContacts,
3	indexKeys: contactIndexKeys,
4} = await getPage(ctx, { table: "contacts" });
5const emails = {};
6for (const contact of pageOfContacts) {
7	emails[contact.email] = await getPage(ctx, {
8		table: "emails",
9		index: "address",
10		schema,
11		startIndexKey: [contact.emailAddress],
12		endIndexKey: [contact.emailAddress],
13		endInclusive: true,
14		absoluteMaxRows: 10,
15	});
16}
17return { pageOfContacts, contactIndexKeys, emails };
18
```

You can now fetch subsequent pages of contacts, each with their first page of emails. Or you can fetch subsequent pages of emails for any contact. And this all works because you are tracking the cursors directly.

### Jump to a location and scroll up

Infinite scroll is a common interface, but sometimes you want to jump to a later page. If you’re scrolling through your contacts you may want to jump to those with last name starting with “S”. If you’re scrolling through your photos you may want to jump to those from your vacation last year.

Jumping to a location is easy — it’s even supported by built-in Convex pagination via

```tsx
1await ctx.db.query("contacts")
2	.withIndex("name", (q)=>q.gte("surname", "S"))
3	.paginate(opts);
4
```

However, you’re now looking at pages of contacts starting with “S”, and you can’t “scroll up” to see those starting with “R”.

When scrolling up, your query becomes inverted, so it looks like this:

```tsx
1await ctx.db.query("contacts")
2	.withIndex("name", (q)=>q.lt("surname", "S"))
3	.order("desc")
4	.paginate(opts);
5
```

You can run this as a separate query, _or_ you can use a single `getPage` to go in either direction:

```tsx
1const contacts = await getPage(ctx, {
2	table: "contacts",
3	index: "name",
4	schema,
5	startIndexKey: ["S"],
6	startInclusive: !isScrollingUp,
7	order: isScrollingUp ? "asc" : "desc",
8});
9
```

### Stitching the pages together

If you’re fetching multiple pages of data into a reactive client, like a React web page, you’ll want the data to update reactively.

Like any Convex query, pages fetched with `getPage` and `useQueries` will automatically re-render when the data updates. However, since pages are initially defined as “the first 100 items” and “the next 100 items after item X”, this can result in gaps or overlaps between pages. This problem is fully described [here](https://stack.convex.dev/fully-reactive-pagination).

The built-in `.paginate()` and `usePaginatedQuery` solve this problem automatically, but `getPage` does not. Instead, you need to replace the queries after they first load, so “the first 100 items” becomes “the items up to item X”, which then seamlessly joins up with “the next 100 items after item X”. This is the primary purpose of the `endIndexKey` field passed to `getPage`.

```tsx
1// Fetch the first page like this:
2const {
3	indexKeys: indexKeys0,
4} = await getPage(ctx, {
5	table: "contacts",
6});
7// Fetch the second page like this:
8const {
9	page: page1,
10	indexKeys: indexKeys1,
11} = await getPage(ctx, {
12	table: "contacts",
13	startIndexKey: indexKeys0[indexKeys0.length - 1],
14});
15// Re-fetch the first page like this:
16const { page: page0 } = await getPage(ctx, {
17	table: "contacts",
18	endIndexKey: indexKeys0[indexKeys0.length - 1],
19});
20
```

Suppose initially the 100th contact is John Smith. `page1` is defined as the 100 contacts after John Smith. Meanwhile `page0` is defined as all contacts up to John Smith, which might grow or shrink as the table changes.

This all sounds complicated to implement, which is why Convex’s built-in pagination handles it for you. This pattern of replacing page queries can also double your function calls and bandwidth usage, which the built-in pagination avoids.

### More flexible pagination

With `getPage`, you take control of your pagination. It’s your data, and your access patterns, so you are best equipped to write optimal queries and hooks for fetching pages.

- As you scroll down, you can unsubscribe from pages that are no longer visible.
- If you have subscribed to a page and it grows too large, `getPage` has returned all index keys, so you can use a middle index key to split the page into two.
- You can more flexibly filter out a page’s documents, or filter out fields, or join with another table to add fields.
- You can choose to either store all index keys, which would tell you if an item at an index position was already loaded, or you can encrypt index keys to hide page boundaries.

### Give me the code

Get started writing queries with `getPage` today, by installing [`convex-helpers`](https://www.npmjs.com/package/convex-helpers) and importing

```tsx
1import { getPage } from "convex-helpers/server/pagination";
2
```

If you want a reference implementation for stitching pages together, jumping to a location, and scrolling up, [check out the code here](https://github.com/ldanilek/convex-contacts/blob/main/src/App.tsx#L54) for an example app featuring a list of contacts.

Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started