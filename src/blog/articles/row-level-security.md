# Row Level Security

![Lee Danilek's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F3c79cdc687d19f0b05080ae217ed23e00b239f79-594x603.jpg&w=3840&q=75)

[Lee Danilek](https://stack.convex.dev/author/lee-danilek)

2 years ago

# Row Level Security

![image of row and security shield to represent row level security](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Fff39eac10c2e4f1c2d9ef8688cc4aafd521de6d6-726x478.png&w=3840&q=75)

With Convex you can implement authorization a number of ways. In this post we’ll look at implementing a row-level security abstraction by adding a layer of indirection which will validate the authorization of the user to read, write, or modify each document they interact with.

## Authorization: limiting access control

One of the goals in making a secure app is restricting which users can do what. Logged-out sessions should not be allowed to view private data, and logged-in users shouldn’t be able to delete other users’ data. I’ve worked on locking down access to Dropbox files, Spark deployments, and [private messages](https://stack.convex.dev/end-to-end-encryption-with-convex). So I got to thinking about how developers using Convex can manage permissions in their apps.

### Authorization via code

Convex allows developers to write arbitrary Javascript, which runs on the server within a transaction, that can check authorization. If you want to enforce an authorization rule, you can define it in code and check it whenever you want. Maybe before a user can “Like” a post, you require that the authenticated user is connected to the post’s author through the graph of friendships.

```tsx
1export default likePost = mutation(async ({db, auth}, {postId}) => {
2	const post = await db.get(postId);
3	if (!await connectedInGraph(db, await auth.getUserIdentity(), post.author)) {
4		throw new Error("you can't like that");
5	}
6	await db.patch(postId, {likes: post.likes + 1});
7});
8
```

Although Convex allows flexible rules, it could become unruly if you need to do the same authorization check in different places. “Liking” a post should run the same authorization code as “Sharing” or “Reposting,” because the check isn’t a property of the mutation as much as it’s a property of the post. Even if everything is configured perfectly, it could all fall apart if a new engineer joins the team, makes a new mutation, and forgets the authorization check. Suddenly you have an [IDOR vulnerability](https://www.varonis.com/blog/what-is-idor-insecure-direct-object-reference).

### Authorization via row-level security

We want some way of saying “if you’re accessing data in the ‘posts’ table, you need to run the access check.” Finding the right layer to put this access check can be tricky — I spent a year at Dropbox moving access checks for files into a central service. One layer that works well is row-level-security (RLS) where authorization is defined on individual rows, and the checks automatically run whenever code tries to read or write the row. How would you build that in Convex?

Let’s design a simple app where users create messages. Only the message’s author can edit a message or publish it. Logged-in users can view all messages, but logged-out sessions can only view published messages. We can codify these rules in code.

```tsx
1// in convex/rls.js
2import { customCtx, customMutation, customQuery } from "convex-helpers/server/customFunctions";
3import { Rules, wrapDatabaseReader, wrapDatabaseWriter } from "convex-helpers/server/rowLevelSecurity";
4import { DataModel } from "./_generated/dataModel";
5import { mutation, query, QueryCtx } from "./_generated/server";
6
7async function rlsRules(ctx: QueryCtx) {
8  const identity = await ctx.auth.getUserIdentity();
9  return {
10    messages: {
11      read: async ({ auth }, message) => {
12        if (identity === null) {
13          return message.published;
14        }
15        return true;
16      },
17      modify: async ({ auth }, message) => {
18        if (identity === null) {
19          return false;
20        }
21        return message.author === identity.tokenIdentifier;
22      },
23    },
24  } satisfies Rules<QueryCtx, DataModel>;
25}
26
27
28export const queryWithRLS = customQuery(
29  query,
30  customCtx(async (ctx) => ({
31    db: wrapDatabaseReader(ctx, ctx.db, await rlsRules(ctx)),
32  })),
33);
34
35export const mutationWithRLS = customMutation(
36  mutation,
37  customCtx(async (ctx) => ({
38    db: wrapDatabaseWriter(ctx, ctx.db, await rlsRules(ctx)),
39  })),
40);
41
```

Here we define some [custom functions](https://stack.convex.dev/custom-functions) along with helper functions in the `rowLevelSecurity` module of the [convex-helpers](https://www.npmjs.com/package/convex-helpers) package. You can then use them like:

```jsx
1// in convex/messages.js
2import { queryWithRLS, mutationWithRLS } from "./rls";
3
4export const list = queryWithRLS({
5  args: {},
6	handler: async (ctx) => {
7    return await ctx.db.query("messages").collect();
8	},
9});
10
11export const publish = mutationWithRLS({
12  args: { messageId: v.id("messages") },
13	handler: async (ctx, args) => {
14    await ctx.db.patch(args.messageId, {published: true});
15	},
16});
17
```

The custom functions wrap the `ctx.db` object. The wrapper intercepts each row that would be returned from `db.get` or `db.query` and filters out rows based on your `read` rules. It intercepts each row that would be modified by `db.patch`, `db.replace`, or `db.delete` and confirms that the write is allowed by `modify` rules, and `db.insert` with the `insert` rules.

Now we have defined the authorization checks in a single place. The access rules can depend on the authorized user through `auth` and they can do database reads through `db`. Convex runs functions close to the database and caches query results, making it efficient to run the same authorization check on each document. However, you can also compose this pattern with other wrappers to provide user-level, team-level, or otherwise checks.

## Extending access functions

### Customizing the rule ctx

The rules you define for reading and writing documents are given the context that is provided to the function, including the `db`, `auth`, and other objects. If you want to optimize and avoid fetching the same thing multiple times, you can customize it with other things you fetch in your [custom functions](https://stack.convex.dev/custom-functions).

```ts
1const rules: Rules<{ viewer: User, roles: Role[] }, DataModel> = {
2	users: {
3		read: async ({ viewer }, user) => {
4			if (!viewer) return false;
5			return true;
6		},
7		insert: async ({ roles }, user) => {
8			return roles.includes("user.create");
9		},
10		modify: async ({ viewer, roles }, user) => {
11			if (!viewer) throw new Error("Must be authenticated to modify a user");
12			if (roles.includes("admin")) return true;
13			return viewer._id === user._id;
14		},
15	},
16}
17
18const myCustomQuery = customQuery(
19  query,
20  customCtx(async (ctx) => {
21	  const viewer = await getCurrentUser(ctx);
22		const roles = await getRoles(ctx, user);
23		return {
24      db: wrapDatabaseReader( { viewer, roles }, ctx.db, rules),
25    })),
26);
27
```

### Mixing RLS with bespoke authorization rules

One somewhat-obvious thing to point out is that, while you can use this abstraction to add RLS to your app, you can also decide where to not use it, or when to do other, more complex authorization with regular functions. Convex queries and mutations run on the server, so you can safely write access checks in code, whereas with some other platforms you’re limited to a special authorization markup and your code only runs on the client.

## Summary

In this post we looked at adding row-level security to endpoints by wrapping the database interface with per-document checks. As long as your documents express a logical concept that can have access control rules, you can implement security in your Convex app today, by using [rowLevelSecurity in convex-helpers](https://www.npmjs.com/package/convex-helpers#row-level-security).

This is one of many ways to authorize access for your Convex app. Please let us know what your favorite way of managing authorization is in [our Discord](https://convex.dev/community). Thanks for reading.

Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started