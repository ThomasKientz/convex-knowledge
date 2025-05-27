# Anonymous Users via Sessions

![Ian Macartney's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F077753b63476b77fb111ba06d1bb538517033a54-3500x3500.jpg&w=3840&q=75)

[Ian Macartney](https://stack.convex.dev/author/ian-macartney)

2 years ago

# Anonymous Users via Sessions

![Friends don't make friends log in](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F8e4e94e9451b9e1659ceca80dd5f7f57eab55e95-1200x670.png&w=3840&q=75)

When building a new app, it can be challenging to build much behavior without the notion of a user. However, getting users to sign up for a new service before seeing any benefits is challenging. Signing up is cumbersome, and many people don’t want to share their personal information with a company until they want a long-standing relationship. In this post, we’ll discuss how to model ephemeral users, leveraging the session helpers duscussed in [this post](https://stack.convex.dev/track-sessions-without-cookies). We’ll also discuss the challenges with anonymous auth.

As a real example, while building a [multiplayer Dall-E-based game](https://stack.convex.dev/building-a-multiplayer-game), one goal is to be able to play with the game without having to log in first. However, we also want users to be able to log in eventually, use their profile picture, access old games, or log back into games on a different device or browser tab.

Instead of passing session IDs around for the game, we create a user when the session is created and use that user ID. This way, we can pass around user IDs (which, in general, shouldn’t be treated as secrets) and still have a persistent shared identifier between the client and the server.

## Storing anonymous users in the “users” table

To illustrate the session middleware, I made a [demo app](https://github.com/get-convex/convex-demos/tree/main/sessions) in our [convex-demos repo](https://github.com/get-convex/convex-demos).

The app is a clone of our [tutorial demo](https://github.com/get-convex/convex-demos/tree/main/tutorial), which is a basic chat app. The tutorial generates a random user name on the client when the page loads and sends that string whenever it sends a message. The basic demo has these two downsides that sessions fixes:

- Refreshing the page changes your user name.
- An updated name isn’t reflected in past messages.

Note: Below we'll discuss where `ctx.user` and `ctx.sessionId` come from.

**Persisting user name:**

We can keep your name constant using sessions by storing it a users table, which has a sessionId field we can look it up by. Instead of initializing the random user name in the client, we write it to the users table along with the associated sessionsId when [updating the name](https://github.com/get-convex/convex-demos/blob/main/sessions/convex/name.ts#L18):

```ts
1export const set = mutationWithSession({
2  args: { name: v.string() },
3  handler: async (ctx, { name }) => {
4    if (ctx.user) {
5      await ctx.db.patch(ctx.user._id, { name });
6    } else {
7      await ctx.db.insert("users", { name, sessionId: ctx.sessionId });
8    }
9  },
10});
11
```

This way, when the user reloads the page, it will read the existing session ID from the browser (in localStorage or sessionStorage, whichever you configured) and use the existing session name.

**Using anonymous users relationally:**

In the [users-and-auth demo](https://github.com/get-convex/convex-demos/tree/main/users-and-auth), we solve updating names by associating each message with a `userId` instead of the user name string. When listing the messages, it would look up the user name on the fly, so the messages always reflected the latest name. The [session demo](https://github.com/get-convex/convex-demos/tree/main/sessions)'s approach is similar, in that it associates a `userId` with a message. It finds or creates the `userId` based on the current `sessionId`. This means updates to the user name will be reflected in old messages:

![Chat app in the sessions demo](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F9e4b93acdb6951017419169dbea1e1df373cdd75-960x510.gif%3Fw%3D450&w=3840&q=75)Chat app in the sessions demo

To send a message, we can get or create a user as follows:

```ts
1// in convex/messages.ts
2export const send = mutationWithSession({
3  args: { body: v.string() },
4  handler: async (ctx, { body }) => {
5    let userId = ctx.user?._id;
6    if (!userId) {
7      const { sessionId } = ctx;
8      userId = await ctx.db.insert("users", { name: "Anonymous", sessionId });
9    }
10    await ctx.db.insert("messages", { body, author: userId });
11  },
12});
13
```

### Using custom functions for `ctx.user` and `ctx.sessionId`

You might have noticed a nice `ctx.user` and `ctx.sessionId` magically appearing for these `mutationWithSession` and `queryWithSession` functions. Those are defined in [convex/lib/sessions.ts](https://github.com/get-convex/convex-demos/blob/main/sessions/convex/lib/sessions.ts#L33) using the [custom functions introduced in this post](https://stack.convex.dev/custom-functions).

They let you do things like:

```ts
1async function getUser(ctx: QueryCtx, sessionId: SessionId) {
2  const user = await ctx.db
3    .query("users")
4    .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
5    .unique();
6  return user;
7}
8
9export const mutationWithSession = customMutation(mutation, {
10  args: SessionIdArg,
11  input: async (ctx, { sessionId }) => {
12    const user = await getUser(ctx, sessionId);
13    return { ctx: { ...ctx, user, sessionId }, args: {} };
14  },
15});
16
```

Then anyone defining a `mutationWithSession` will have the ctx also include the `user` and `sessionId`. The `useSessionMutation` react hook will automatically pass up the `sessionId`. See [this post](https://stack.convex.dev/track-sessions-without-cookies) for more details on how that works.

### Tips & Gotchas

If you want a very lightweight solution, it doesn’t get much simpler than this. However, with its simplicity comes a limitation of what it can represent.

**If your app will have logged-in users who will interact with anonymous users**, it is awkward to have to look in two different places for users and store two different kinds of IDs depending on which type they are. You might consider having a single "users" table and an `isAnonymous` boolean field.

**If your app can have multiple sessions per user** you'll want to have a separate table that keeps track of `sessionId` s and `userId` s as a [many-to-many table](https://stack.convex.dev/relationship-structures-let-s-talk-about-schemas#many-to-many), instead of storing it in the users table directly.

**If you want to keep session IDs private** you should avoid passing around session IDs as user identifiers. The session ID is essentially the user's credential. So if anyone else has their ID, their requests can impersonate the user. Check out [built-in auth](https://docs.convex.dev/auth/functions-auth). Generally don't return the sessionId associated with other users.

## Summary

In this post, we looked at a couple of strategies for managing user information without requiring a login. Follow along with the multiplayer game using OpenAI [here](https://stack.convex.dev/building-a-multiplayer-game).

Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started