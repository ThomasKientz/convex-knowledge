# Throttling Requests by Single-Flighting

![Ian Macartney's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F077753b63476b77fb111ba06d1bb538517033a54-3500x3500.jpg&w=3840&q=75)

[Ian Macartney](https://stack.convex.dev/author/ian-macartney)

2 years ago

# Throttling Requests by Single-Flighting

![Two planes with colored exhaust trails](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F5ee45c9d7492047b2826076fe48663985fbed2c2-4286x2857.jpg&w=3840&q=75)

Building reactive applications can become an obsession. How much fast can I sync state? How can I keep my app feeling responsive? How can I avoid wasting resources?

Let’s say you want a responsive UI and care about how fast your UI can update. A naive approach would just add up the time to send the request, have it processed on the server, and receive a response. And for actions like clicking buttons, this will be a good approximation. However, it’s important to consider requests within the context of other requests. For something like capturing mouse movements or typing, requests could end up being created faster than they can be processed. If requests pile up in an outgoing queue on the client, or are competing for server resources, they may appear much slower as the user waits for previous requests to be processed. Even if your request itself is fast, if it has to wait for hundreds of prior requests to complete, it can seem slow to the end user. In these cases, it can be useful to limit how many requests the client sends. There are many ways to do this: throttling, debouncing, and server side rate limiting are the most common. Can we do better?

In this article we’ll be looking at an approach called “single flighting” or “singleflighting” and what an implementation looks like in React using Convex for the backend.

## Throttle vs. Debounce vs. Rate limit vs. Singleflight

A quick aside on terminology.

**Debouncing** refers to waiting a specified amount of time before acting on a signal. My first experience with this was in handling a potentially noisy electrical signal. When you press a button, for instance, the voltage may “bounce” for a short period, like so:

![Diagram](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F3037375e7887af09da718a2af77dbe7f53703eb1-1024x721.jpg%3Fw%3D700&w=3840&q=75)Diagram

You don’t want to send “on” and “off” signals in quick succession, you want to wait until it’s settled out and send the value once it’s settled out. You “de-bounce” the signal. In software, this could look like waiting to send a search query until the user has finished typing for some amount of time. Every time the user types another character, it resets the debounce timer. The benefit is avoiding intermediate requests that wouldn’t be used, but the cost is waiting for the debounce period to elapse. If the user keeps typing, they may never see any results!

**Throttling** is the act of spacing out requests that a client sends. In the example with the user continuously typing a search query above, a search could be executed on the first character, and every x seconds after that. So the user could start seeing results from their in-progress query as they continue typing. Under the hood, every time a request is sent, the next request will be held until some time has elapsed. If many keystrokes are issued during that time, only a single request will be sent when the time elapses, with the latest query. This limits the maximum rate at which a single client sends requests.

**Rate limiting** is more commonly referenced on the server side. Rather than clients proactively limiting themselves, this is a way for the server to push back on clients, telling them they’re requesting too much. This is referred to as “back pressure” - the server pushing back on clients when too much is being demanded of it. It can help keep a backend system from being overloaded due to spikes in traffic, though it then relies on clients to handle the request and retry later on. This is a good idea for a reliable system, but should be exceptional, not the only way of limiting client requests. Read more about implementing [rate limiting in Convex here](https://stack.convex.dev/rate-limiting), which includes a library to make it easy.

**Single flighting** is the concept of limiting requests by only ever having one request “in flight.” This is similar to throttling, in that it limits requests from the client. However, the frequency of requests isn’t specified up front, but is a function of how fast the network is, and how fast the request is processed on the server. This second factor also gives it some natural back pressure from the server, which is incredibly valuable. If the server is getting overloaded, that client won’t be sending more requests while it’s waiting for its outstanding one. It also allows us to have gradual performance degradation if many clients are executing requests in parallel. Rather than becoming overwhelmed and failing some subset of requests, the frequency of requests will decrease in each clients as the server hits a bottleneck. The only downside is that your request frequency might be slower than theoretically possible, due to time spent on network transit. Waiting until a response comes back before sending another request is slower than optimistically firing off requests continuously. Alternatively, if your requests return quickly, you might fire off more requests than are necessary and waste CPU & network resources.

As with most things, there are benefits to each, and weighing these strategies is part of the job of the application developer. For this article, we are going to be using single flighting. This plays well with Convex, since the convex client executes mutations serially. With serial execution, debouncing and throttling both risk piling up requests, if they aren’t processed as fast as they’re created. Single flighting helps us avoid this, providing a consistently responsive user experience.

## Implementation: useEffect loop with useLatestValue

One way to achieve single flighting requests is to sit in an infinite loop, waiting for a new value to send and then waiting on the request. This leverages a hook we wrote: `useLatestValue`. This provides two functions: one to update some value, and another that you can await for the latest value, blocking until there’s a newer value than what you’ve already received. It is conceptually similar to a `Promise` where you can keep calling `resolve` with newer values to overwrite the value returned when awaited. Before we talk about how it’s implemented, let’s look at an example of how it might be used:

```tsx
1type Pos = {x: number, y: number};
2
3const updatePresence = useMutation(api.presence.update);
4const [nextPosition, setPosition] = useLatestValue<Pos>();
5
6useEffect(() => {
7  let run = true;
8  (async () => {
9    while (run) {
10		  const position = await nextPosition();
11			await updatePresence({ presenceId, position });
12    }
13  })();
14  return () => { run = false; };
15}, [nextPosition, updatePresence]);
16
17return <div onPointerMove={(e) => setPosition({
18	x: e.clientX,
19  y: e.clientY,
20})}>...</div>
21
```

This sends position updates whenever a new value is available. The `nextPosition()` promise will resolve when the value is updated. If one or more `setPosition` calls happen before awaiting `nextPosition`, it will immediately return the value from the latest call when it is eventually awaited.

The `useLatestValue` hook helpers are in a working project [here](https://github.com/get-convex/convex-helpers/tree/main/src/hooks). You can use it as is, but for those who are curious how it works, see below.

`useLatestValue` details...

`useLatestValue` uses a `Promise` as a signal that a new value is available. The result of a `Promise` can’t be updated once it’s resolved, so the value is stored separately. When a value is retrieved, the `Promise` is awaited, the latest value returned, and the signal reset. Updating the value just involves updating the value and resolving the `Promise`, relying on the behavior that subsequent calls to `resolve` is a no-op if it’s already been resolved.

```ts
1export default function useLatestValue<T>() {
2  const initial = useMemo(() => {
3    const [promise, resolve] = makeSignal();
4    // We won't access data until it has been updated.
5    return { data: undefined as T, promise, resolve };
6  }, []);
7  const ref = useRef(initial);
8  const nextValue = useCallback(async () => {
9    await ref.current.promise;
10    const [promise, resolve] = makeSignal();
11    ref.current.promise = promise;
12    ref.current.resolve = resolve;
13    return ref.current.data;
14  }, [ref]);
15
16  const updateValue = useCallback(
17    (data: T) => {
18      ref.current.data = data;
19      ref.current.resolve();
20    },
21    [ref]
22  );
23
24  return [nextValue, updateValue] as const;
25}
26
27const makeSignal = () => {
28  let resolve: () => void;
29  const promise = new Promise<void>((r) => (resolve = r));
30  return [promise, resolve!] as const;
31};
32
```

## Implementation: useSingleFlight callback

Another model that avoids the scary infinite loop is using a helper we wrote: `useSingleFlight` which will run a given async function at most once at a time. If no calls are in progress, it will call the function immediately. Otherwise, when the current call finishes, it will call the function again, using the most recent arguments.

```tsx
1const updatePresence = useMutation(api.presence.update);
2const tryUpdate = useSingleFlight(updatePresence);
3return <div onPointerMove={(e) => tryUpdate({
4	x: e.clientX,
5  y: e.clientY,
6})}>...</div>
7
```

While it isn’t used here, it’s worth mentioning that `tryUpdate` will always return a `Promise`. If the call isn’t executed, the promise will never resolve or reject. If it is called, the result of the call will be passed through. So you could write code like:

```tsx
1console.log('trying to update');
2const result = await tryUpdate(pos);
3console.log('updated: ' + result);
4
```

which would log `'trying to update'` for all event callbacks, and only log `'updated: ...'` for requests that were actually sent to the server. And if the call failed, it would throw the exception during the `await`.

The `useSingleFlight` hook helper is in a working project [here](https://github.com/get-convex/convex-helpers/tree/main/src/hooks). You can use it as is, but for those who are curious how it works, see below.

`useSingleFlight` details...

`useSingleFlight` keeps track of whether a request is in flight, using a `useRef` hook to store state. If there is a request in flight, it returns a promise, where it has extracted the `resolve` and `reject` functions to fulfill later if it’s still the latest attempt. It updates the state’s `upNext` to keep track of the arguments and promise functions. If there isn’t a request in flight, it calls the function immediately, and also kicks off an async function to check for `upNext` once the request finishes. It will keep executing the follow-up requests until it finishes without `upNext` being updated.

```tsx
1export default function useSingleFlight<
2  F extends (...args: any[]) => Promise<any>
3>(fn: F) {
4  const flightStatus = useRef({
5    inFlight: false,
6    upNext: null as null | { resolve: any; reject: any; args: Parameters<F> },
7  });
8
9  return useCallback(
10    (...args: Parameters<F>): ReturnType<F> => {
11      if (flightStatus.current.inFlight) {
12        return new Promise((resolve, reject) => {
13          flightStatus.current.upNext = { resolve, reject, args };
14        }) as ReturnType<F>;
15      }
16      flightStatus.current.inFlight = true;
17      const firstReq = fn(...args) as ReturnType<F>;
18      void (async () => {
19        try {
20          await firstReq;
21        } finally {
22          // If it failed, we naively just move on to the next request.
23        }
24        while (flightStatus.current.upNext) {
25          let cur = flightStatus.current.upNext;
26          flightStatus.current.upNext = null;
27          await fn(...cur.args)
28            .then(cur.resolve)
29            .catch(cur.reject);
30        }
31        flightStatus.current.inFlight = false;
32      })();
33      return firstReq;
34    },
35    [fn]
36  );
37}
38
```

### Delta challenges

While the approach may seem simple, there are some nuances worth thinking through. If you are limiting how many requests you’ll be sending, that often means some requests will never be executed, or some results won’t get reported.

Each call to `tryUpdate` above will either:

1. execute `updatePresence` immediately,
2. execute `updatePresence` after some time has elapsed, or
3. never execute `updatePresence`.

In this case, we ignore any intermediate mouse positions. This seems fine for a use case where we’re just sharing cursor location. However, if we were reporting a delta - such as reporting a series of movements rather than absolute positions, then missing intermediate values would be bad news!

Let us know in [our discord](https://convex.dev/community) if you want examples on how to handle those cases.

### Optimistic updates

One thing to keep in mind with our [Optimistic Updates](https://docs.convex.dev/using/optimistic-updates) api is that optimistic updates will only be run as often as your single-flighted function (e.g. your mutation). If you want to update local state faster than the mutations are being executed, you’ll need to manage that state separately. For example:

```tsx
1const myMutation = useMutation(api.my.mutation);
2const tryUpdate = useSingleFlight(withLocalStore);
3const withLocalStore = useCallback((data) => {
4  setLocalState(data);
5  return tryUpdate(data);
6}, [setLocalState, updatePresence]);
7...
8
```

Note: your local state may have intermediary values that are never sent to the server, but the server state will eventually have the same final state as you have locally.

## Next Steps

We’ve looked at two ways of implementing single-flighting requests, which is a great way of preventing request pile-up and keeping UIs responsive. To see an implementation of this, check out our post on implemeting Presence in Convex (coming soon!). To get the code for our hooks, check it out [here](https://github.com/get-convex/convex-helpers/tree/main/src/hooks).

Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started