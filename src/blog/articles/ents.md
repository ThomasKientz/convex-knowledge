# Convex Ents: Manage your document relationships

![Michal Srb's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Fe8231f5314b107688be9636bd8a855e820cbca20-512x512.png&w=3840&q=75)

[Michal Srb](https://stack.convex.dev/author/michal)

a year ago

# Convex Ents: Manage your document relationships

![Convex Ents: Bring your ORM workflow to Convex](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Faa99b3b6775fbc48f104fd36eaf99d4799336bf4-2700x1461.png&w=3840&q=75)

> Ents is in maintenance mode. We're open to taking PRs, and will make sure it doesn't break. There will not be active feature development from the Convex team.

Note: This article assumes some familiarity with Convex. If you’re not familiar with it, check out the [Convex tutorial](https://docs.convex.dev/get-started).

[Convex Ents](https://labs.convex.dev/convex-ents) is a library for Convex providing a bunch of useful functionality:

1. Simpler ways to model and query related documents
2. Ability to easily map and filter documents retrieved from the database
3. Enforcing unique document field values
4. Defining default values for easier document shape evolution
5. Propagating deletion to related documents
6. Soft and scheduled document deletion
7. And more

While all of these can be achieved without Convex Ents, the library makes them really easy. If you’re familiar with Prisma or Drizzle ORM, you’ll find yourself at home. Let’s look at each item on the list in more detail.

### Simpler ways to model and query related documents

You can store IDs of other documents in Convex documents, just like in any other relational database. These can represent 1:1 and 1:many relationships between documents, which in the Ents parlance are called “edges”:

In vanilla Convex:

```jsx
1// schema.ts
2users: defineTable({
3  name: v.string(),
4}),
5messages: defineTable({
6  text: v.string(),
7  userId: v.id("users")
8})
9  .index("userId", ["userId"])
10
11// myFunctions.ts
12// args: userId
13const messages = await ctx.db
14  .query("messages")
15  .withIndex("userId", (q) => q.eq("userId", userId))
16  .collect();
17
```

In this example we have two tables, users and messages, and messages have a required `userId` field. We also defined an index on this field, so that we can efficiently retrieve just the messages related to a given userId. Which is exactly what we did in the example query.

Now let’s look at the equivalent with Convex ents:

```jsx
1// schema.ts
2users: defineEnt({
3  name: v.string(),
4})
5  .edges("messages", { ref: true }),
6messages: defineEnt({
7  text: v.string()
8})
9  .edge("user")
10
11// myFunctions.ts
12// args: userId
13const messages = await ctx.table("users")
14  .getX(userId)
15  .edge("messages");
16
```

While there are a bunch of differences in the code between this version and the “vanilla” Convex code, the semantics are exactly the same.

First, we define two “ents” (short for “entity”): users and messages. The message ents are declared to have a unique `edge` to the users table. This translates to the exact same code you saw above: a `userId` field, and an associated index. Additionally, the user ents are declared to have 1:many `edges` to the messages table ( `ref: true` means that the edge is stored as a “reference” in a field - the field name is inferred). This information doesn’t affect the Convex schema, but it allows you to query the relevant messages “from” the user ent.

And that’s exactly what we do in the example query. Instead of `ctx.db.query` we use `ctx.table`. We then ask for the ent with the given `userId` \- but we don’t retrieve it. Instead we immediately ask to traverse the 1:many “messages” edge. This performs the same indexed retrieval as the vanilla code.

#### Many to many relationships

So far we have saved a little bit of code, but Convex Ents shine even more when it comes to modeling many to many relationships. Let’s look at vanilla Convex example first:

```jsx
1// schema.ts
2roles: defineTable({
3  name: v.string(),
4}),
5permissions: defineTable({
6  name: v.string(),
7})
8roles_to_permissions: defineTable({
9  rolesId: v.id("roles"),
10  permissionsId: v.id("permissions")
11})
12  .index("rolesId", ["rolesId", "permissionsId"])
13  .index("permissionsId", ["permissionsId"])
14
15// myFunctions.ts
16// args: roleId
17const rolePermissions = await Promise.all(
18  await ctx.db
19    .query("roles_to_permissions")
20    .withIndex("rolesId", (q) => q.eq("rolesId", roleId))
21    .collect(),
22  (doc) => ctx.db.get(doc.permissionId),
23);
24// args: roleId, permissionId
25const hasPermission = (await ctx.db
26  .query("roles_to_permissions")
27  .withIndex("rolesId", (q) =>
28    q.eq("rolesId", roleId).eq("permissionId", permissionId),
29  )
30  .first()) !== null;
31
```

To model a many to many relationship in a relational database, you usually define another table to store the relationship, like the `roles_to_permissions` table in this example. You need 2 indexes on it, one for each “foreign key”, so that you can efficiently retrieve related documents from either “side” of the relationship.

Then when you do this retrieval you have to first find the relevant documents representing the relationship, and then you have to map over them to retrieve the document from the other table, this is how we get `rolePermissions`.

In this example we also showcase how to use one of the indexes to answer the common question: “Does this document have given relationship with this other document?”, to get `hasPermission`.

Now let’s look at the equivalent with Convex ents:

```jsx
1// schema.ts
2roles: defineEnt({
3  name: v.string(),
4})
5  .edges("permissions"),
6permissions: defineEnt({
7  name: v.string(),
8})
9  .edges("roles")
10
11// myFunctions.ts
12// args: roleId
13const rolePermissions = await ctx.table("roles")
14  .getX(roleId)
15  .edge("permissions");
16// args: roleId, permissionId
17const hasPermission = await ctx.table("roles")
18  .getX(roleId)
19  .edge("permissions")
20  .has(permissionId);
21
```

As before, this code is semantically equivalent to the vanilla Convex code, but is perhaps more clearly aligned with our intent 💡.

Let’s say that you also need to retrieve the role document itself in the previous example. This is easy with Ents:

```jsx
1// myFunctions.ts
2const role = await ctx.table("roles").getX(roleId)
3const rolePermissions = await role.edge("permissions");
4
```

All we had to do is split the chained call and `await` the result of the `getX` (get or throw) method call.

This brings us to our second item:

### Ability to easily map and filter documents retrieved from the database

You’ve already seen that Convex Ents use chained method calls, similar to the built-in `ctx.db` API. Ents have one trick up their sleeve though: all methods are `await`-able. This makes the API even more fluent:

```jsx
1// myFunctions.ts
2const allUsers = await ctx.table("users");
3const user = await ctx.table("users").getX(userId);
4const messages = await ctx.table("users").getX(userId).edge("messages");
5
```

This is achieved via “lazy” `Promise` s. Unlike normal JavaScript Promises, which kick off work immediately when they’re created, the `ctx.table` method and methods chained to it return a lazy promise, which doesn’t perform any work until it is `await` ed.

This also allows ents to have extra helper methods which help with retrieving documents, performing “joins” and returning filtered data from Convex functions:

```jsx
1return await ctx.table("users")
2  .getX(userId)
3  .edge("messages")
4  .map((message) => {
5    const attachments = await message.edges("attachments");
6    return {
7      _id: message._id,
8      text: message.text,
9      numAttachments: attachments.length,
10    };
11  });
12
```

There are two main things happening in this example, using the `map` method:

1. We query the related `attachments` for given message
2. We only return the fields we want to return to the client

This is totally possible with vanilla Convex, it’s just a bit more code:

```jsx
1return await Promise.all(
2  (
3    await ctx.db
4      .query("messages")
5      .withIndex("userId", (q) => q.eq("userId", userId))
6      .collect()
7  ).map((message) => {
8    const attachments = await ctx.db
9      .query("attachments")
10      .withIndex("messageId", (q) => q.eq("messageId", message._id))
11      .collect();
12    return {
13      _id: message._id,
14      text: message.text,
15      numAttachments: attachments.length,
16    };
17  }),
18);
19
```

We’ll pick up the pace and cover the next two points quickly:

### Unique field values

In databases fields there are often “unique” fields which serve as “secondary” keys by which documents can be retrieved. In Convex we can achieve this by:

1. Defining an index on the field
2. Ensuring that a document with a given value doesn’t already exist, anywhere we write given documents

```jsx
1// schema.ts
2users: defineTable({
3  email: v.string(),
4}),
5  .index("email", ["email"])
6
7// myFunctions.ts
8// Before every insert, patch or replace using the `email` field:
9const existing = await ctx.db
10  .query("users")
11  .withIndex("email", (q) => q.eq("email", email))
12  .first();
13if (existing !== null) {
14  throw new Error(
15    `In table "users" cannot create a duplicate document with field "email" of value \`${email}\`, existing document with ID "${
16      existing._id as string
17    }" already has it.`,
18  );
19}
20
```

Convex Ents have a built-in shortcut for this:

```jsx
1// schema.ts
2users: defineEnt({}),
3  .field("email", { unique: true })
4
5// myFunctions.ts
6// The uniqueness check is performed automatically
7
```

No extra code is required when writing to the `users` table.

### Default field values

When you evolve your schema over time you’ll probably add more fields. But existing documents in the database won’t have any values for these fields yet. The easiest approach is to add an optional field:

```jsx
1// schema.ts
2posts: defineTable({
3  // ... other fields
4  contentType: v.optional(v.union(v.literal("text"), v.literal("video")))
5}),
6
```

In this example we added a `contentType` field, and made it optional. Everywhere we read posts, we can manually include a default value, in vanilla Convex:

```jsx
1// myFunctions.ts
2return (await ctx.db.query("posts")).map((post) => ({
3  ...post,
4  contentType: post.contentType ?? "text",
5}));
6
7
```

Usually you want to always specify the new field when writing the document. It’s not possible to automatically require this with the built-in schema validation, you have to make sure you write the value yourself.

If the default value is just a simple value like in this example, you can achieve this more easily with Convex Ents:

```jsx
1// schema.ts
2posts: defineEnt({
3  // ... other fields
4})
5  .field(
6    "contentType",
7    v.union(v.literal("text"), v.literal("video")),
8    { default: "text" }
9  )
10
11// myFunctions.ts
12// The "contentType" is not optional, and defaults to "text"
13return await ctx.table("posts");
14
```

Since `contentType` is not an optional field in the document type, TypeScript can ensure that you’re always providing it when writing to the database.

### Cascading deletes, soft deletion and scheduled deletion

In vanilla Convex, when a document is deleted other documents can still include “references” to it by storing the deleted document’s ID. This is a great, simple and scalable model. When querying the ID Convex will return null, and this can be handled (or ignored) by your code.

However, relationships are often required, and it can be easier to reason about your data model without “dangling references” in your documents. For this reason, Convex Ents do not support dangling references in the edges declared via `edge` and `edges`. Convex already makes this easy when writing data to the database, simply by declaring the field which stores the “foreign key” as NOT optional.

This makes deletion in general more challenging though. You can easily have a scenario where a document’s ID is stored in 1000s or even more other documents. Deleting all of these documents in a single mutation, which is within a single transaction, is simply impossible, as it would require a long-lived transaction, grinding the whole database to a halt (something Convex does not allow, instead failing the mutation).

Convex Ents include 3 deletion behaviors:

1. The default one deletes all related documents that require the existence of a given document - cascading deletions, in a single transaction. This is a fine behavior that preserves the “no dangling references” invariant, as long as you don’t expect to have many related documents.
2. The soft deletion behavior doesn’t actually delete the document, but instead sets a `deletionTime` field on it. It’s up to you to make sure that soft delete documents are not shown when they should not be. For example you might want to show the “group posts” of deleted users, because the posts really belong to the “group”, but you don’t show the user’s “profile”.
3. The scheduled deletion behavior combines the two: First it performs only soft deletion, and then, with an optional delay, performs the cascading delete, over possibly many scheduled mutations to make sure that each individual mutation doesn’t read or write too many documents. The deletion is performed depth first, so that no dangling references are created in the process.

Learn more about the different deletion behaviors in [Cascading Deletes documentation](https://labs.convex.dev/convex-ents/schema/deletes).

### Conclusion

We hope you find the library interesting, both for its own merits and as an example of an abstraction that can be built on top of the powerful Convex base. Notably, Ents is built entirely on top of vanilla Convex, and you can contribute to it or fork it to meet your own needs or preferred API ergonomics. The library is still in its early experimental stage, without the stability or quality guarantees built-in Convex provides. If it does seem promising to you, please give it a try and [let us know your feedback on Discord](https://convex.dev/community).

Check out these links to learn more:

- [Convex Ents docs](https://labs.convex.dev/convex-ents)
- [Convex Ents repo](https://github.com/xixixao/convex-ents)
- [Convex Ents issues](https://github.com/xixixao/convex-ents/issues)
- [Prisma vs Convex examples](https://labs.convex.dev/convex-vs-prisma)

Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started

We use third-party cookies to understand how people interact with our site.

See our [Privacy Policy](https://www.convex.dev/legal/privacy/) to learn more.

DeclineAccept