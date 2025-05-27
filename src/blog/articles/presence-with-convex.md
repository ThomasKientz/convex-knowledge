# Implementing Presence with Convex

![Ian Macartney's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F077753b63476b77fb111ba06d1bb538517033a54-3500x3500.jpg&w=3840&q=75)

[Ian Macartney](https://stack.convex.dev/author/ian-macartney)

2 years ago

# Implementing Presence with Convex

![Feel connected to your team by adding presence to your site](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Ff911b37cad0a64866ccf44790dcf0fe60fc6bf7b-1200x628.png&w=3840&q=75)

In this post, I will share some patterns for incorporating presence into a web app. I will be leveraging some features of Convex which makes it easy to implement, and sharing [some utilities I built along the way](https://github.com/get-convex/convex-presence/) that you’re welcome to use & extend. Check out the code in action in the [convex-demos](https://github.com/get-convex/convex-demos) repo.

## What is presence and why is it important?

Presence, as we’ll use the term here, is about surfacing activity in a UI about other users - surfacing their virtual presence. Some examples you’ve likely seen are the list of people “online” in Messenger, the “…” bubble in Messages when someone is composing a message to you, someone’s cursor in a Google Doc, etc.

The value is a mix of utility and user experience. In a shared document, knowing where someone is typing can help you avoid typing over each other. The more subtle effects, however, tap into our social instincts. Seeing that other people are looking at the same document, seeing active engagement, and gives a sense of aliveness. I personally feel more connected to collaborators than something like a Wiki. In a world where work is increasingly being done in private, I’ll take all the presence I can get.

## Presence in action

![Screenshot](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F1e4087361b56b4154b2cca3c3627cfe61a6bc431-874x430.png&w=3840&q=75)Screenshot

### Presence data

Presence data sits in a middle ground between application state and session state. Application data needs to be carefully updated and stored, and is typically read more than it’s written. Presence data is less critical - it’s ok if you skip a few cursor movements, as long as the UI arrives at the correct end state. However, we still care about durability. Session state is ephemeral and can be held in memory & quickly discarded. Some presence state is like this - where your cursor is, whether you’re typing, etc. However, to know when someone last edited a document, or when a user was last online, you need to store longer-term data.

### Presence performance

Presence data is a great candidate for [single-flighting](https://stack.convex.dev/throttling-requests-by-single-flighting) because we care about latency and we want graceful degradation when many users are online at once. It isn’t critical to get every cursor position, but it should show the final cursor position as quickly as possible. Higher throughput can get a higher frame rate, but if we were to decide between getting more data points with more lag or fewer data points more frequently, we’d choose the latter. We aren’t building a 60fps game, we are just conveying basic information. See [the post on single-flighting](https://stack.convex.dev/throttling-requests-by-single-flighting) to see more about how it enables dynamic back-pressure under load.

### `usePresence`

To make it easy to implement presence features, [I wrote a utility](https://github.com/get-convex/convex-presence/blob/main/hooks/usePresence.ts) that saves presence data in a new `presence` table, segmented by “room” and “user”. A room could be a web page, document, chat room, etc. In my example, a user was identified just by a string randomly generated on the client, but you could use authentication data server-side to ensure a user can only modify their own presence data & read presence data in rooms they’re allowed in.

By default, the utility gives you a `useState`-like API but also includes a list of the state for other users in the same room.

```tsx
1const [myPresence, othersPresence, updateMyPresence] = usePresence(
2  userId,
3  roomId,
4  initialData
5);
6
```

The main difference is that `updateMyPresence` accepts partial data updates, so you can update your avatar in one component, and set whether you’re typing in another, and the resulting data will be the latest values of each. This is important because it allows us to skip some updates via single-flighting. We know the next update to be sent will have the latest values.

### Online detection

![Screenshot](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Fe888805e48b052cca9e2d7c281c4135d99e09765-362x102.png&w=3840&q=75)Screenshot

A common way to detect a user’s presence is to periodically send a “heartbeat” message to the server that the client is still there. By checking when a user last updated their presence, you can tell if they’ve gone offline. The more frequently you send it, the faster you can detect that a user is no longer online, but the more resources your app will consume.

The [`usePresence`](https://github.com/get-convex/convex-presence/blob/main/hooks/usePresence.ts) React hook defaults to 5 seconds, and the [demo app](https://github.com/get-convex/convex-presence/blob/main/pages/index.tsx) considers a user to not be online after 10 seconds.

```tsx
1const online = othersPresence.filter(
2    (presence) => Date.now() - presence.updated < 10000
3  );
4
```

If you’re building your own presence utility, remember you can avoid sending heartbeats when you send other messages, as I do [here](https://github.com/get-convex/convex-presence/blob/main/hooks/usePresence.ts):

```tsx
1useEffect(() => {
2    void updatePresence({ room, user, data });
3    const intervalId = setInterval(() => {
4      void heartbeat({ room, user });
5    }, heartbeatPeriod);
6    return () => clearInterval(intervalId);
7  }, [updatePresence, heartbeat, room, user, data, heartbeatPeriod]);
8
```

### Facepiles

![Screenshot of the facepile UI](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Ff2a56c99f00090b2d4a896fcac4c03281613a5fe-572x220.png&w=3840&q=75)Screenshot of the facepile UI

A “facepile” is a popular term for the visual stack of users in a document - whether they’re profile pictures, initials, avatars, or in the case of my demo app, emojis. See my facepile logic [here](https://github.com/get-convex/convex-presence/blob/main/components/Facepile.tsx) or play around with a demo [here](https://github.com/get-convex/convex-demos/tree/main/presence-facepile). Some things to keep in mind when building them:

- You can use the latest heartbeat to segment users into online & offline groups.
- If you sort by the latest update, your pile will jump around as users send their heartbeats. I chose to sort by online/offline, then by their “created” time - when they first were present in that given room. This way it would be stable and active & newer users would show up on top.
- By default React will only re-render when something changes, so if you want to keep re-computing whether a user is online or offline, you can do something like I do [here](https://github.com/get-convex/convex-presence/blob/main/components/Facepile.tsx) and use a `setInterval` to re-compute the list every second. Note that this does not make new network requests, it just re-computes the UI based on the existing data, so you only consume browser resources, not network bandwidth or server compute time.

### Typing indicator

![Screenshot showing a typing indicator](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Fa1d3e9fffa30209ab3e6e9b82234965fabbf4bcd-960x459.gif&w=3840&q=75)Screenshot showing a typing indicator

To make a typing indicator super snappy, you can update presence data to `{typing: true}` when you start typing and explicitly set it back soon after you stop typing. To achieve this, you can use a debounce function from something like `lodash`, or just use a `useEffect` and `setTimeout` as I do [here](https://github.com/get-convex/convex-presence/blob/main/hooks/useTypingIndicator.ts). However, if a user gets disconnected before they can update their presence, they might be stuck in a `typing: true` state, so make sure to take their latest update time into account and exclude offline users.

```tsx
1useEffect(() => {
2    if (text.length === 0) {
3      updateMyPresence({ typing: false });
4      return;
5    }
6    updateMyPresence({ typing: true });
7    const timer = setTimeout(() => updateMyPresence({ typing: false }), 1000);
8    return () => clearTimeout(timer);
9  }, [updateMyPresence, text]);
10
```

See a working example [here](https://github.com/get-convex/convex-demos/tree/main/presence-typing-indicator)

### Cursors

![Screenshot](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F11b6246507267f73121e998aea876fdb2ecc4982-960x459.gif&w=3840&q=75)Screenshot

Text cursors are an important part of collaborative text editing, where the important piece to get right is how to index your position, given that a pure character offset may be out of sync with the edits you and others are making. You might even embed cursor locations into the data stream of document edits, or pin cursor locations to edits, so new text is always appearing by your cursor on other users’ documents. This is a complex topic worth a post all on its own, so I’ll leave it at that for now.

For mouse cursors, the challenge is giving the illusion of continuous motion when you’re receiving discrete events. Naive implementations will seem very choppy, with the cursor jumping to the latest location immediately. Intermediate implementations will slide around smoothly, though the cursor will always be a little behind. In [my demo](https://spectacular-beijinho-ccf8ab.netlify.app/), I just use a 200ms transition in CSS, which is simple, but still looks a bit jumpy and lags by an extra 200ms (code [here](https://github.com/get-convex/convex-presence/blob/main/components/SharedCursors.tsx)). Advanced implementations may not only smooth between historical points (using bezier or other smoothing algorithms) but also try to anticipate where the cursor is moving.

Sharing mouse cursor positions are the point at which I’d recommend using a dedicated in-memory service, rather than trying to persist that data to a database, since the data is especially ephemeral.

## How Convex makes it easy

Convex helped make this much easier through its built-in WebSocket reactivity and caching scalability.

### Reactivity

Convex’s data model is [reactive by default](https://docs.convex.dev/understanding/convex-fundamentals/functions#caching) \- when you query data, you are automatically subscribed to changes to that data. Because it owns the data retrieval as well as the data mutation, it can intelligently invalidate caches& recompute queries automatically. In this case, querying for data in a given “room” in the presence table meant that every change to presence data in that room resulted in the new data being computed and sent down to clients. Without Convex you’d be either polling or managing a bespoke Pub-Sub / WebSocket system.

### Caching

Another nice feature of Convex queries is its [caching](https://docs.convex.dev/understanding/convex-fundamentals/functions#caching), and cache invalidation. Its cache primarily uses the function arguments as the key, so our query for all the presence data in a given room will be recomputed once per room, rather than once per user. This means that as the number of users in a room (& their associated mutations) grows, the number of function invocations grows linearly, instead of quadratically, which is a big deal, even for dozens of users.

## Next Steps

Some things that aren’t implemented in [the demo](https://github.com/get-convex/convex-presence), but would be natural extensions, would be:

- Implementing access control so you can’t read or write presence data in rooms you’re not part of.
- Adding a way to clear presence data for a room. Currently, the library merges patch data.
- Check whether the data has changed before sending an update. Currently, all calls to `updateMyPresence` will attempt to update the server.
- Add a parameter to `usePresence` for whether to do heartbeat, since not all applications need to know that a user is still “online”.

Let us know in [our discord](https://convex.dev/community) what you think, and if you implement any of these! PRs welcome: [GitHub](https://github.com/get-convex/convex-presence). ❤️

Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started

We use third-party cookies to understand how people interact with our site.

See our [Privacy Policy](https://www.convex.dev/legal/privacy/) to learn more.

DeclineAccept