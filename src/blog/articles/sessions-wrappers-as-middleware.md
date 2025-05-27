# Sessions: Wrappers as "Middleware"

![Ian Macartney's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F077753b63476b77fb111ba06d1bb538517033a54-3500x3500.jpg&w=3840&q=75)

[Ian Macartney](https://stack.convex.dev/author/ian-macartney)

2 years ago

# Sessions: Wrappers as "Middleware"

Good news! There's a new set of helpers in `npm i convex-helpers@latest` for session tracking. See this [new post](https://stack.convex.dev/track-sessions-without-cookies) for more details. This post lays out an implementation that has an explicit "sessions" table that requires a server roundtrip before usable on the client, whereas the new implementation has an immediately-available session ID on the client and leans more on foreign keys.

![Store per-session data in Convex](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Fd88710666eaa61506b696ba7bf59416e1b149858-4446x3334.jpg&w=3840&q=75)

Session tracking is a common practice for application servers. While most of your data is associated with a user or another document, sometimes you have data specific to a user’s tab, or associated with a user who isn’t logged in. Some of this data is stored on the client, such as in the browser’s `sessionStorage` or `localStorage`, while other data is stored on the server. This post will dive into how to implement session storage with Convex using some helper functions we wrote. The code is [here](https://github.com/get-convex/convex-helpers/tree/npm/0.1.1).

**User data:**

Typically user data is stored on the server to avoid accidental leakage of personal data on public computers. Because this data can exist without a logged-in user, it can enable representing and capturing data about anonymous users. This is great news for building multiplayer experiences where you don’t want to require logging in. This might also be where you store the signed-in user. With [Convex, auth is built in](https://docs.convex.dev/using/auth), your serverless functions execute close to the database, and [queries are cached](https://docs.convex.dev/functions/query-functions#caching--reactivity), so you don’t have to worry about user caching. You can just store a `userId` and look up the latest data each time.

**Ephemeral state:**

Storing session data also provides a more continuous experience for a logged-in user because you can have per-tab information on where they are in the application. Suppose there is a complex multi-step flow, like booking an appointment. In that case, they can book two different appointments simultaneously without losing their progress if they refresh the page and without storing that sensitive data in the browser’s storage.

## How to implement sessions with Convex

Continuing the series of Wrappers as “Middleware,” I built some functions to wrap your serverless functions to provide session data. It stores your session data in a “sessions” table in your Convex backend. Because this also requires keeping track of the session ID in the client, I’ve also written some wrappers for `useQuery` and `useMutation` to make it easy.

**Note:** Since the wrappers series, my recommended workflow for wrapping server-side functions has changed to use "custom functions" which you can read more about [here](https://stack.convex.dev/custom-functions). The syntax for usage is generally the same, but is easier to work with.

### Using sessions:

1. In addition to a `ConvexProvider`, wrap your app with a `SessionProvider`:





```tsx
1<ConvexProvider client={convex}>
2  <SessionProvider>
3    <App />
4  </SessionProvider>
5</ConvexProvider>
6
```

2. Use `queryWithSession` or `mutationWithSession` as your function:





```ts
1export const send = mutationWithSession({
2	  args: { body: v.string() },
3  handler: async (ctx, { body }) => {
4		  const userId = await getOrCreateUserId(ctx.db, ctx.auth, ctx.sessionId);
5    await ctx.db.insert("messages", { body, userId });
6		},
7});
8
```


Use `useSessionQuery` or `useSessionMutation` in your React client:

```ts
1const sendMessage = useSessionMutation(api.messages.send);
2...
3sendMessage({body});
4
```

1. Write any data that you want to be available in subsequent session
requests to the `sessions` table. E.g. in our `getOrCreateUserId` function we could do this:





```ts
1	const anonymousUserId = await db.insert('users', { anonymous: true });
2db.patch(sessionId, { userId: anonymousUserId });
3
```





**Note on session table vs. ID:** In [this post](https://stack.convex.dev/track-sessions-without-cookies) I outline a strategy for having the `sessionId` be client-created, and instead of having a "sessions" table, using the session ID as a foreign key reference into the tables where you store data. The advantage of that, other than avoiding the server roundtrip to make a session document to get the ID, is that your session queries won't al load (and therefore depend) on the same document. If every query loads the session document, then on every update to that document your queries will all be invalidated, even if they didn't need that field of the session document. By storing the session-related data in more targeted tables, you can only be loading the data you need. Read more about query optimizations [here](https://stack.convex.dev/queries-that-scale).


## How it works

Under the hood, what it is doing is quite simple.

1. It creates a new session in the `SessionProvider` context. Whether it creates a server-side document and uses its ID, such as [this older implementation](https://github.com/get-convex/convex-helpers/tree/npm/0.1.1), or creating a session ID client-side like [this post](https://stack.convex.dev/track-sessions-without-cookies), it then stores the session ID in `sessionStorage` or, optionally, `localStorage`.[1](https://stack.convex.dev/sessions-wrappers-as-middleware#user-content-fn-1) Notes on one versus the other are below.
2. It passes that `sessionId` as a parameter in each `query` or `mutation` where you use `useSessionQuery` or `useSessionMutation`.
3. The serverless functions define a `sessionId` parameter manually or automatically with a custom wrapper, and pass it along as a field of `ctx` so the other function arguments aren't cluttered with it.

### `sessionStorage` vs. `localStorage`

If you want the session to be shared between all tabs in a browser, use `localStorage`. I like the behavior of `sessionStorage` for general use:

- When you refresh a page, the data persists. The data is tied to a specific tab.
- If you open a new tab, you start fresh.
- If you use the “Reopen Closed Tab” feature on Chrome, the data is still there.

For `localStorage`:

- `localStorage` is a great place for custom authentication information, since a user generally doesn't want to re-authenticate on every tab they open. However, you should be able to invalidate the sessions server-side, and clear or replace the `sessionId` on the client when they log out. See [this post](https://stack.convex.dev/track-sessions-without-cookies) for more info.
- Remember to account for multiple tabs interacting with the same data. For instance, if you're keeping track of a user's shopping cart, one tab can go through checkout, while the other tab is in a payment selection modal. Thanks to Convex, the data will automatically update on each tab, but it's up to you to design a UI that responds to those updates in a user-friendly way.
- Some data may make sense to be stored at the browser level, such as answering questions like “have I seen this browser before.”
- Keep public computers in mind - the same `localStorage` doesn't always map to the same human.

## Summary

In this post we looked at implementing session storage in Convex, using a custom table and some convenience wrappers which make it easy to use session-specific data in your server-side code. We look forward to seeing what you build with it.

Check out the old code [here](https://github.com/get-convex/convex-helpers/tree/npm/0.1.1) or the newer approach [here](https://stack.convex.dev/track-sessions-without-cookies).

### Footnotes

1. In the newer [`convex-helpers` package](https://www.npmjs.com/package/convex-helpers) you can specify a custom `useStorage` hook that isn't limited to `localStorage` or `sessionStorage`. [↩](https://stack.convex.dev/sessions-wrappers-as-middleware#user-content-fnref-1)


Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started

We use third-party cookies to understand how people interact with our site.

See our [Privacy Policy](https://www.convex.dev/legal/privacy/) to learn more.

DeclineAccept