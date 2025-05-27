# Session Tracking Via Parameter Injection

![Ian Macartney's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F077753b63476b77fb111ba06d1bb538517033a54-3500x3500.jpg&w=3840&q=75)

[Ian Macartney](https://stack.convex.dev/author/ian-macartney)

a year ago

# Session Tracking Via Parameter Injection

![Session tracking without cookies?](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Ff9a86db1b6c80c48eb715cc96fef9df6d004298b-2493x1656.png&w=3840&q=75)

Keeping track of a user doesn't have to be creepy. Storing data associated with a user on a specific tab, or even at the browser-level can be incredibly useful. To name a few use cases:

- Allow anonymous users to view and interact with a page, such as a game where you don't want to ask every user to create an account.
- Keep track of a user's progress through a workflow without storing personal data in their browser or forcing them to log in. If you store form data directly in localStorage and don't (or can't) clean it up from the browser, the next user of the computer has access to the data. By associating the data with them server-side, you can invalidate it remotely and keep your browser storage tidy.
- Enable having a shopping cart before a user logs in, and keep it up to date between all of their tabs.
- Allow a logged-in user to have multiple tabs in different server-persisted states - such as two tabs going through purchasing flows for different concert tickets, without overwriting each other's data.

In this article we'll look at how to track and pass around session IDs in Convex.

Using server-only cookies to store these session IDs is a common approach, however it has some limitations. For one, websocket clients for realtime apps, such as the Convex React client, don't get server-only cookies automatically since headers aren't sent along with WebSocket messages. You can use client-accessible cookies in a similar way to localStorage, but all cookies introduce more risk unless configured defensively - for instance they open you up to "cross-site request forgery" attacks. This post will look at tracking sessions without cookies.

## How it works

By storing an opaque identifier on the client (in our case below, a UUID), we can avoid cluttering the user's browser with potentially private information. And by combining session IDs with authentication & authorization, we can restrict who can access the associated server data.

1. The client checks whether there's already a session ID stored locally. It can check in cookies, localStorage (per-browser), sessionStorage (per-tab), or other places. Our approach will use sessionStorage by default, but be configurable for localStorage or anywhere that you can write a hook to retrieve an ID from.
2. If there isn't already a session ID, the client generates one. This allows a session ID to always be defined and avoid a server roundtrip generating one.
3. The session ID is provided in a React Context, allowing any components mounted underneath to access the session ID when they need to.
4. When the client makes a session-specific request, it passes up the session ID that it gets from the context as a parameter to the function. There are helpers below which automatically pull the ID from context so you just have to provide the non- `sessionId` parameters.
5. The server associates data with this session ID in the database. Future requests with the session ID can then look up the associated data.
6. When a user logs in, it can make a new session and transfer any applicable data before invalidating the old session.
7. When the server wants to invalidate a session, it can delete the associationed data in the database.

## How to do it

If you're new to Convex, you can get started quickly with `npx create convex@latest`. Go read [the docs](https://docs.convex.dev/) for more details on how it all works.

Install [`convex-helpers`](https://www.npmjs.com/package/convex-helpers) via `npm i convex-helpers` if you haven't already.

### Client-side:

#### 1\. Wrap your app with `SessionProvider` to manage the session ID

```jsx
1import { SessionProvider } from "convex-helpers/react/sessions";
2//...
3<ConvexProvider client={convex}>
4	<SessionProvider>
5		<App />
6	</SessionProvider>
7</ConvexProvider>
8
```

#### Per-tab vs. per-browser tracking

If you want to track sessions per-browser instead of per-tab, you can use a localStorage storage provider, like `useLocalStorage` in `usehooks-ts`:

```sh
1npm i usehooks-ts
2
```

And pass it into `SessionProvider`:

```jsx
1import { useLocalStorage } from "usehooks-ts";
2//...
3<ConvexProvider client={convex}>
4	<SessionProvider useStorage={useLocalStorage}>
5		<App />
6	</SessionProvider>
7</ConvexProvider>
8
```

While not covered here, you could also apply this to storing the value in a client cookie, if you're ok with those implications. Just pass a custom `useStorage` hook.

#### Multiple session IDs on one site

To store multiple session IDs on the same site, you can specify a custom
storage key. I find this useful so different apps I develop on localhost don't wipe out each others' values:

```jsx
1<ConvexProvider client={convex}>
2	<SessionProvider storageKey="MyAppSessionId">
3		<App />
4	</SessionProvider>
5</ConvexProvider>
6
```

#### Using SSR with sessions

One challenge with `localStorage` or `sessionStorage` solutions is that the value is not available on the server during a server render. You might get hydration issues because the server generates an ID that differs from the client's. Or you might see an error trying to generate an ID with `crypto` which might not be available in your server runtime. To solve for this, the `SessionProvider` React helper has an `ssrFriendly` parameter. With this set, it will:

- Skip queries on the server if they require a session ID.
- Wait for the session ID to initialize before calling mutations or actions.
- Return undefined if you're using the lower-level `useSessionId` hook, as well as a promise that will resolve when the sessionID is available.

You could alternatively explore storing & retrieving the value from cookies by supplying a custom `useStorage` hook that fetches the same value server & client side. If you do, please share your work!

#### 2\. Access the session ID with `useSessionId`

Within the context of the SessionProvider, you can access the Session ID:

```jsx
1import {  useSessionId } from "convex-helpers/react/sessions";
2
3const [sessionId] = useSessionId();
4
```

You can then manually pass the `sessionId` as a parameter:

```js
1await convex.query(api.myModule.mySessionQuery, { sessionId });
2
```

For convenience methods for react hooks that automatically pass the `sessionId` parameter, read on.

#### 2\. Utilities for React hooks

For queries and mutations that want to pass up the session ID, use:

```jsx
1import {  useSessionQuery } from "convex-helpers/react/sessions";
2
3const results = useSessionQuery(api.myModule.mySessionQuery, { arg1: 1 });
4
```

The same exist for `useSessionMutation` and `useSessionAction`.

### Server-side:

#### 1\. Define session functions by accepting a `sessionId` argument

```js
1import { SessionIdArg, vSessionId } from "convex-helpers/server/sessions";
2import { query } from "./_generated/server";
3![![](https://)](https://)
4const mySessionQuery = query({
5	args: {
6		...SessionIdArg, // equivalent to sessionId: vSessionId,
7		arg1: v.number(),
8	},
9	handler: async (ctx, args) => {
10		//...
11	}
12})
13
```

In the handler, `args.sessionId` will be of type `SessionId`. Under the hood, the session ID is just a string, but the type `SessionId` is branded to help you avoid passing the wrong strings around. See [this post](https://stack.convex.dev/using-branded-types-in-validators) for more info on branded types.

#### 2\. Use [Custom Functions](https://stack.convex.dev/custom-functions) to codify the pattern

With helpers like `customMutation`, you can define a replacement for `mutation` that you usually use to define endpoints. These custom builders let you define functions that require extra arguments and/or populate extra fields in `ctx` and `args`:

```js
1import {
2  customAction,
3  customMutation,
4  customQuery,
5} from "convex-helpers/server/customFunctions";
6import { SessionIdArg } from "convex-helpers/server/sessions";
7
8export const mutationWithSession = customMutation(mutation, {
9	args: SessionIdArg,
10	input: async (ctx, { sessionId }) => {
11		const anonymousUser = await getAnonUser(ctx, sessionId);
12		return { ctx: { ...ctx, anonymousUser }, args: {} };
13	},
14});
15
```

Note: this will not pass through `sessionId` as an arg unless you change the last line to `return { ctx: { ...ctx, anonymousUser }, args: { sessionId } };`.

To use the custom builder:

```js
1export const doSomething = mutationWithSession({
2	args: {},
3	handler: async (ctx, args) => {
4		// ctx.anonymousUser
5	}
6})
7
```

I'd suggest combining session logic with other customization so you limit how many builders you have in your codebase, making it easier to audit your endpoints for how they authenticate, etc.

To further lock down usage of these functions, check out [this article on setting up ESLint rules to prevent importing the "raw" functions](https://stack.convex.dev/eslint-setup).

#### 3\. For actions use `runSessionFunctions`

Use `runSessionFunctions` to define functions `ctx.runSessionQuery` that are like `ctx.runQuery` but where it injects in the session ID, so you don't have to pass it through manually:

```js
1import { SessionIdArg, runSessionFunctions } from "convex-helpers/server/sessions";
2
3export const actionWithSession = customAction(action, {
4	args: SessionIdArg,
5	input: async (ctx, { sessionId }) => {
6
7		const { runSessionQuery, runSessionMutation, runSessionAction } =
8			runSessionFunctions(ctx, sessionId);
9
10	return {
11			ctx: {
12				...ctx,
13				runSessionQuery,
14				runSessionMutation,
15				runSessionAction,
16			},
17			args: { sessionId }, // Note: you can also pass it through as an arg.
18		};
19	},
20});
21
```

Or in shorthand:

```js
1export const actionWithSession = customAction(action, {
2	args: SessionIdArg,
3	input: async (ctx, { sessionId }) => ({
4		ctx: {
5			...ctx,
6			...runSessionFunctions(ctx, sessionId),
7		},
8		args: { sessionId }, // Note: you can also pass it through as an arg.
9	}),
10});
11
```

### Best practices

#### Refresh your session IDs

Let's say your application uses session IDs to associate sensitive data with a logged-in user. If the user logs in when a session ID is already on the computer, that session ID could have been left behind by a malicious computer user (say on a public computer). This is called session hijacking. So it's prudent to refresh the session ID once a user logs in. When they log out, you also want to leave the browser in a "fresh" state, without references to the logged-in users's session ID. It's best practice to refresh the session ID after both logging in & logging out.

You can use the function returned as the second element from `useSessionId()` to do this.

```js
1const [_, refreshSessionId] = useSessionId();
2//...
3const newSessionId = await refreshSessionId();
4
```

In fact, you can even pass in a promise where you can run an async function after the new session ID has been created, but before the previous one has been replaced, in case you want to run a mutation to associate any data server-side before it's updated on the client:

```jsx
1const [sessionId, refreshSessionId] = useSessionId();
2const doRefresh = useMutation(api.myModule.doRefresh);
3//...
4await refreshSessionId(async (newSessionId) =>
5  // At this point, the new sessionId hasn't been persisted locally.
6  // So if this throws, it will abort replacing the local session ID.
7  await doRefresh({ old: sessionId, new: newSessionId })
8);
9// At this point, the new sessionId has been persisted.
10
```

**Logging in:** Server-side, you may want to carry some data over from the anonymous session to the new session when a user logs in. You can do that by patching those items with the new session ID:

```js
1await ctx.db.patch(shoppingCartId, { sessionId: newSessionId });
2
```

**Logging out:** you probably don't want to provide any association from the old to the new session ID when the user logs out, since that session should be sanitized for the next user. You should also consider deleting any data that can be accessed with the sessionID alone after logging out.

#### Use session queries sparingly

One thing to know about Convex is that caching happens automatically. If you have a subscription to a query from a client, it will automatically get re-computed when the associated data changes (even if another client / user made the change). The cache is based on the function you're calling, the arguments you provide, and the database queries it makes. This means that when you pass a session ID as a parameter, it will never be a cache hit for a user with a different session ID. So you can improve your cache hit rate by not passing parameters that you don't need. If the data doesn't actually rely on the session ID, don't pass it. For mutations, there isn't a cache, so it's less important to avoid passing extra parameters.

#### Avoid sprawling session documents

If you decide to keep a table with per-user session data, it might become tempting to store all sorts of data in there - the last time you saw them, what their current shopping cart is, what document they're looking at, or even where their cursor is. The problem with this is twofold:

1. As we saw above, if there are queries that read from this sesison data, their caches will be evicted whenever the session data changes - **even if the change was for an unrelated feature that happend to be stored in the same session document**. You'll invalidate fewer queries if you store your data such that for frequently updating information, that data is only read by queries that care about the frequent updates. Having separate tables for heartbeats, shopping carts, presence data, etc. will will better for you.
2. For mutations, Convex provides "serializable isolation" for transactions which is a fancy way of saying "you can write code without worrying about race conditions." Under the hood we run operations in parallel unless they read and write the same data, in which case we detect the possible race condition and retry the one that finished later. This means that if you have many requests that all read and write a big sessions document, there's a higher likelihood of conflict, which slows your request down (and if we keep retrying and hitting conflicts, we'll eventually fail the request). So, for mutations where there are frequent writes (such as cursor tracking), it's best to separate the documents where data is getting written frequently by independent features / tabs / users. Generally you don't have to think about this, but I'd still recommend not having one big document for everything if you'll have a nontrivial amount of read/writes for a specific document.

#### Don't expose it to other clients

If you're using the `sessionId` as anonymous / lightweight authentication, then don't pass it around / down to clients. Here are two options:

1. Use it in a [join table](https://stack.convex.dev/relationship-structures-let-s-talk-about-schemas#relationship-table-scalable): instead of defining a table like `users: defineTable({ sessionId: vSessionId, name: v.string() }).index("by_sessionId", ["sessionId"])` and looking a user up by its `sessionId`, have a table that maps session IDs to users: `logins: defineTable({ sessionId: vSessionId, userId: v.id("users") }).index("by_sessionId", ["sessionId"])`. This also enables a user to have multiple logins.

2. Strip it from documents manually before returning them. If you do have a sessionId directly on a table you're looking up from, be careful to remove it in places where you might return it to clients. For instance:





```js
1return users.map((user) => {
2  const { sessionId, ...rest } = user;
3	return rest;
4});
5
```





[Zod](https://stack.convex.dev/typescript-zod-function-validation) is helpful in these instances, since you can specify what data you want to return and it will strip the rest of the fields out.


#### Invalidate session IDs

When a user logs in or out, you can immediately invalidate their previous session IDs (see the notes on refreshing above). One benefit of using a session ID tied to state in a database over a JWT is that you don't have to wait for it to expire. If you detect a security breach, you can invalidate all sessions immediately after a patch, instead of waiting around for JWT expiration.

## Summary

You can use a client-generated session ID to associate data with a browser or browser tab. With some helpers, you can automatically pass this value up as a parameter to functions, and can make custom server functions that pull the value back out.

Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started

We use third-party cookies to understand how people interact with our site.

See our [Privacy Policy](https://www.convex.dev/legal/privacy/) to learn more.

DeclineAccept