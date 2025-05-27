# Application-Layer Rate Limiting

![Ian Macartney's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F077753b63476b77fb111ba06d1bb538517033a54-3500x3500.jpg&w=3840&q=75)

[Ian Macartney](https://stack.convex.dev/author/ian-macartney)

a year ago

# Application-Layer Rate Limiting

![Icon of rate limiting and then an icon of a bucket, representing token bucketing](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Fa4cc55ba563d64fc4551bf7de76e4c16279a0773-1452x956.png&w=3840&q=75)

Rate limiting is an important part of building a reliable system that prevents users from adversely affecting each others' traffic. It also helps prevent abuse and costly bills, which is especially important for LLM workloads and other costly, resource-intensive patterns. Especially for apps that have a freemium model or any use that isn’t correlated with revenue, a single user shouldn't be able to fire off thousands of costly requests.

There’s a host of advice and services that can help you solve this problem for different applications, but I’d like to show you how simple it can be to implement when you have fast access to a database with strong ACID guarantees[1](https://stack.convex.dev/rate-limiting#user-content-fn-1).

Specifically, in this post I’m going to look at implementing the following, storing just two numbers per rate limit.

- **Token bucket:** Enable limiting the overall request rate for a sliding window, while also accommodating bounded bursts of traffic after a period of inactivity. For example, the number of requests should be limited to X per hour plus up to Y more “rollover minutes” from previous hours. Tokens become available continuously over time. **This is what I recommend for most use-cases.**
- **Fixed window:** For example, in each hour there can be no more than X requests to some third-party service, to avoid hitting their rate limits. When the hour is up, all tokens are available again. We’ll also discuss using “jitter” to avoid [thundering herds](https://en.wikipedia.org/wiki/Thundering_herd_problem).

For those who just want to use something off-the-shelf, I made a [`rate-limiter` Convex Component](https://www.convex.dev/components/rate-limiter) you should use. Some examples [below](https://stack.convex.dev/rate-limiting#using-rate-limits-for-common-operations) will be using its syntax.

For the sake of this article, when I refer to “tokens” it is using the mental model of rate limiting where you are granted a certain number of tokens per some time period, and when a request successfully “consumes” them it can proceed. I’ll say a “debt” or “deficit” when tokens are over-consumed, as we’ll see later in exploring reservations.

## What is application-layer rate limiting

In this article, we are going to talk about application-layer rate limiting. Specifically, the controls you have available when you are aware of a user and the operation they are trying to perform, rather than the networking layer, which is the responsibility domain of the hosting platform provider. To prevent a request from being made in the first place, you can also look into client-side throttling, such as [single-flighting](https://stack.convex.dev/throttling-requests-by-single-flighting) requests.

In practice, application layer rate limiting is the most useful and only falls down during extreme load, such as a distributed denial of service attack (DDOS) which thankfully are extremely rare. More commonly there is a small number of users, whether malicious or other otherwise, who are consuming more resources than you expected. The cost incurred of such "attacks" are often in the expensive requests to auto-scaling third party services, such as hosted LLMs for AI apps.[2](https://stack.convex.dev/rate-limiting#user-content-fn-2)

### Benefits of these implementations

The rate limits discussed here have these properties:

- **Efficient storage and compute**: in particular, it doesn’t require crons or storage that scales with load. Each rate limit (a combination of a name and a “key”) stores two numbers and does simple math.
- **Transactional evaluation:** You can make multiple decisions using multiple rate limits and be ensured that they’ll all be consumed or none will be (if you roll back by throwing an exception, for instance).
- **Fairness via opt-in credit “reservation”**: By using `reserve: true` below, I’ll show how you can pre-allocate tokens and schedule work that doesn’t require client backoff, and doesn’t starve large requests.
- **Opt-in “rollover” allowance:** Allowing clients that have been under-consuming resources to accumulate tokens that “roll over” to the next period up to some limit, so they can service bursts of traffic while limiting average usage by a token bucket.
- **Deterministic:** The results of these approaches will give you concrete bounds on usage, do not rely on probability, and will not “drift” over time. They also can determine the next time a retry could succeed.
- **Fail closed**: If the system is under heavy load, it won’t fling open the gates for the traffic to overwhelm other services and cause [cascading failure](https://en.wikipedia.org/wiki/Cascading_failure#:~:text=A%20cascading%20failure%20is%20a%20failure%20in%20a,probability%20that%20other%20portions%20of%20the%20system%20fail.), as other “fail open” solutions can. This is an easy property to satisfy, since the application database is being used for the rate limit. If the application database is unavailable, continuing to serve the request is unlikely to succeed anyways. Failing open makes more sense when adding additional infrastructure or services that could introduce a single point of failure (SPOF) such as single-host in-memory service.

## The algebra of rate limits

Here is how you calculate rate limits, using just to numbers: `value` and `ts`. Here is the Convex database schema for it:

```tsx
1rateLimits: defineTable({
2  name: v.string(),
3  key: v.optional(v.string()), // undefined is singleton
4  value: v.number(), // can go negative if capacity is reserved ahead of time
5  ts: v.number(),
6}).index("name", ["name", "key"]),
7
```

Each of the following approaches have some basic error checking omitted for brevity, such as checking that the requested number of units is less than the maximum possible (which will never succeed).

See [below](https://stack.convex.dev/rate-limiting#reserving-tokens) for modifications to accommodate reserving tokens.

### Token bucket

Instead of a traditional approach to a sliding window in which there are discrete jumps in value based on past events, we can use a token bucket to provide similar benefits, with a much more efficient storage and runtime footprint.

We model tokens as being continuously provided, with a `capacity` defined in the config. If your configured `rate` is 10 in a `period` of a minute and you use 5 tokens, they will be fully restored in 30 seconds. Since we model it continuously, one credit will be restored every six seconds. So you could be consuming one credit every six seconds, five every thirty seconds, or ten every minute. When you don’t use all your tokens, they can accumulate up to the defined `capacity` amount. With `capacity`, you can use more than the normal rate for a period of time, resting assured that all of that capacity was accumulated during idle time. Because the tokens are issued at a fixed rate, the overall credit consumption is bound to that rate. If it isn’t set, `capacity` defaults to `rate`.

Config:

```tsx
1export type TokenBucketRateLimit = {
2  kind: "token bucket";
3  rate: number;
4  period: number;
5  capacity?: number; // defaults to rate
6  maxReserved?: number;
7};
8
```

![Token bucket rate limiting works by continuously adding "tokens" at some configured "rate" over a "period" which can be spent by servicing requests. There's a "capacity" after which the tokens don't accumulate. If a request requires more tokens than are available, it can be retried when there will be enough tokens, knowable via the rate.](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F59cf030b9be15f734123b48d88a8a9e86681bffe-1252x809.png&w=3840&q=75)Token bucket rate limiting works by continuously adding "tokens" at some configured "rate" over a "period" which can be spent by servicing requests. There's a "capacity" after which the tokens don't accumulate. If a request requires more tokens than are available, it can be retried when there will be enough tokens, knowable via the rate.

The core calculation is:

```tsx
1const now = Date.now();
2const elapsed = now - state.ts;
3
4ts = now;
5
6value = Math.min(
7  state.value + elapsed * config.rate / config.period,
8  config.capacity ?? config.rate
9) - (args.count ?? 1);
10
```

- We keep track of the last time we calculated the state of the bucket as `ts` and the `value` at that time.
- We calculate the current value since then, capping it at the capacity of the bucket. If there is no capacity configured, we default to the rate. So if you allow 10 per second and don't specify a capacity, you can have up to 10 tokens in the bucket.

**Full code, including handling reservations:**

```tsx
1const now = Date.now();
2// Fetch the existing value & ts from the database, if present.
3// If the key is undefined, it will fetch the shared value for the name.
4const existing = await db.query("rateLimits")
5  .withIndex("name", (q) => q.eq("name", name).eq("key", key))
6  .unique();
7// If there isn't a capacity defined, default to the rate
8const max = config.capacity ?? config.rate;
9const consuming = args.count ?? 1;
10
11// Start of token-bucket-specific code
12// Default to the maximum available right now.
13const state = existing ?? { value: max, ts: now };
14const elapsed = now - state.ts;
15const rate = config.rate / config.period; // I appologize for the rate naming.
16// The current value is whatever accumulated since the last evaluation up to max.
17const value = Math.min(state.value + elapsed * rate, max) - consuming;
18const ts = now;
19let retryAfter = undefined;
20if (value < consuming) { // not enough capacity currently
21  retryAfter = -value / rate;
22  // End of token-bucket-specific code
23  if (!args.reserve || (config.maxReserved && (-value  > config.maxReserved)) {
24    return { ok: false, retryAfter };
25  }
26}
27if (existing) {
28  await db.patch(existing._id, { value, ts });
29} else {
30  const { name, key } = args;
31  await db.insert("rateLimits", { value, ts, name, key });
32}
33return { ok: true, retryAfter };
34
```

#### Some things to keep in mind:

- If you are sensitive to bursts of traffic, for instance if you’re using a third party API that has a hard rate limit cap, note that with this approach you could have as many as `rate + capacity` requests in a single window, if the accumulated capacity is all consumed at once, and then the accumulated tokens consumed at the end of the window. For these scenarios, you can:
  - Use `fixed window` to divide capacity into fixed windows.
  - Set `capacity` and `rate` to both be half of the third party hard cap, so worst case you use a burst of half, then use the accumulated amount before the window is over. The downside is your average consumption is limited to half of what’s available.
  - Set `capacity` to be smaller than `rate`, which allows using more steady-state bandwidth, so long as the requests are small and somewhat frequent. For example if you had an hourly budget of 70 tokens, you could have a rate of 60 and a capacity of 10. You could consume one token per minute, or 5 tokens every five minutes, but if you didn’t consume anything for 15 minutes, you’d only have accumulated 10 tokens.
  - Set `capacity` to zero and always use `reserve` and scheduling to perfectly space requests based on their needs. You lose the benefits of accumulated bandwidth, and all requests will suffer some delay, so only use this for time-insensitive workloads.
- If many clients are waiting for the same rate limit to have bandwidth, and you aren’t using the `reserve` technique, you should add some [jitter](https://stack.convex.dev/rate-limiting#jitter-introducing-randomness-to-avoid-thundering-herds) before returning it to a client, so each client attempts at a different time.

### Fixed window

When you need your rate limiting windows to be rigid, you can use this more traditional approach, where tokens are issued at distinct intervals and can be used during that interval. We also extend it with an optional `capacity` configuration to allow unused tokens to accumulate, allowing us to control the overall usage while accommodating traffic that isn’t consistent.

Config:

```tsx
1export type FixedRateLimit = {
2  kind: "fixed window";
3  rate: number;
4  period: number;
5  capacity?: number; // defaults to rate
6  start?: number;
7};
8
```

![Fixed window rate limiting adds tokens at discrete intervals to be used to service requests. Requests that need more tokens have to wait until the next window.](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F90d37a967098fe521eff55348a539796c4f96015-1244x871.png&w=3840&q=75)Fixed window rate limiting adds tokens at discrete intervals to be used to service requests. Requests that need more tokens have to wait until the next window.
The core calculation for value at a given time is:

```tsx
1const elapsedWindows = Math.floor((Date.now() - state.ts) / config.period);
2
3ts = state.ts + elapsedWindows * config.period;
4
5value = Math.min(
6  state.value + config.rate * elapsedWindows,
7  config.capacity ?? config.rate
8) - (args.count ?? 1);
9
10
```

- We use `ts` to mark the start of the window, and don’t update it until we are consuming resources in a more recent window, at which point we add tokens for each window that started since then.
- `value` holds the tokens available at that timestamp.

**Full code, including reservations:**

```tsx
1const now = Date.now();
2// Fetch the existing value & ts from the database, if present.
3// If the key is undefined, it will fetch the shared value for the name.
4const existing = await db.query("rateLimits")
5  .withIndex("name", (q) => q.eq("name", name).eq("key", key))
6  .unique();
7// If there isn't a capacity defined, default to the rate
8const max = config.capacity ?? config.rate;
9const consuming = args.count ?? 1;
10
11// Start of fixed-window-specific code
12const state = existing ?? {
13  // If there wasn't a value or start time, default to a random time.
14  ts: config.start ?? (Math.random() * config.period),
15  value: max, // start at full capacity
16};
17const elapsedWindows = Math.floor((Date.now() - state.ts) / config.period);
18// Add value for each elapsed window
19const value = Math.min(state.value + config.rate * elapsedWindows, max) - consuming;
20// Move ts forward to the start of this window
21const ts = state.ts + elapsedWindows * config.period;
22let retryAfter = undefined;
23if (value < 0) {
24  const windowsNeeded = Math.ceil(-value / config.rate);
25  retryAfter = ts + config.period * windowsNeeded - now;
26
27  // End of fixed-window-specific code
28  if (!args.reserve || (config.maxReserved && (-value  > config.maxReserved)) {
29    return { ok: false, retryAfter };
30  }
31}
32if (existing) {
33  await db.patch(existing._id, { value, ts });
34} else {
35  const { name, key } = args;
36  await db.insert("rateLimits", { value, ts, name, key });
37}
38return { ok: true, retryAfter };
39
```

`start` is the offset from `0` UTC, in this case to align the start of the period with midnight in the PDT timezone. This is handy for aesthetically aligning requests with a user’s midnight or starting on the hour or on the minute, but if the rate limit will see a lot of concurrent usage, this can lead to many clients all waiting until midnight to fire off requests and causing a [thundering herd](https://en.wikipedia.org/wiki/Thundering_herd_problem). For these situations you should add [jitter](https://stack.convex.dev/rate-limiting#adding-jitter), or omit `start`. If you don’t provide `start`, it will use the “key” to assign a random time as the start time.

**Note:** if you allow for `capacity`, the maximum number of tokens used in a given period will be `capacity`, whereas the token bucket implementation above could use a maximum `capacity` \+ `rate` for a single period (worst case). This makes fixed windows a good fit for maximizing third party API limits, and `capacity` a nice feature if the third party has an accommodation for “burst” traffic.

## Reserving tokens

When you hit a rate limit with these implementations, the rate limiter knows the next time it could plausibly handle your request. However, by that time a smaller request could have come along and consumed tokens, further delaying the larger request. If you are sure you want to eventually serve a request, it’s more efficient to pre-allocate the work and schedule its execution.[3](https://stack.convex.dev/rate-limiting#user-content-fn-3)

Reserving tokens provides three useful properties:

- **Fairness:** By reserving capacity ahead of time, larger requests can allocate capacity without retrying until enough tokens accumulate.
- **Fire-and-forget:** When you require a client to retry an operation later, there’s a chance the client won't be around - e.g. if a user clicks away or refreshes a website. If you know you eventually want to take some action, you can schedule execution for later and free the client from the responsibility of retrying.
- **“Perfect” scheduling:** Using retries, especially when you add jitter, prevents you from fully utilizing available resources. With reservations, you are given advance authorization to run your operation at the exact time.

The implementation for both strategies is relatively straightforward. Both allow the available tokens to go negative, up to some configurable limit (by default unlimited).

For example, say you had 3 tokens and a request came in for 5.

- You updated the token count to -2 and responded that the work should happen later - specifically when 2 tokens would have been added.
- The caller [schedules](https://docs.convex.dev/scheduling/scheduled-functions) their work to happen at that later time. **It is important to schedule it and not just run the request right away** \- otherwise it's just equivalent to a higher burst `capacity`.
- When the scheduled function runs later, it doesn't need to check rate limits because it's already been approved.
- Later on, when another function call checks the rate limit, it calculates how many tokens to add based on the elapsed time and adds it to the -2 value before deciding whether there are enough tokens for the new call.

Passing `reserve: true` is optional. By default the component will refuse to go negative.

See the [below example](https://stack.convex.dev/rate-limiting#making-llm-requests-with-reserved-capacity) for usage.

## Using rate limits for common operations

To make the rate limit tradeoffs concrete, let’s consider how we’d use rate limiting in our application. I made a [component](https://www.convex.dev/components) for Convex that provides a simple rate limiting API to consume, check, and reset limits. This implementation is Convex-specific, but it will serve as a representative example of how application-layer rate limits might look.

[get-convex/ **rate-limiter**\\
\\
![GitHub logo](https://stack.convex.dev/logos/github.svg)](https://github.com/get-convex/rate-limiter)

In general, the distinctions here will be between “global” rate limits, for which there is one per application for a given rate limit “name,” and ones where each distinct “key” is rate limited independently.

The examples below assume a flow like:

- A client calls a [mutation](https://docs.convex.dev/functions/mutation-functions) to take some action, which may involve a rate-limited behavior. For those unfamiliar with Convex, a mutation runs server-side and encapsulates a database transaction, providing Serializable isolation and Optimistic Concurrency Control with automatic retries.
- The mutation checks the rate limit before taking the action, and if it fails it returns the time when the client should retry.
- Alternatively, the client could call an [action](https://docs.convex.dev/functions/actions) (a non-transactional non-deterministic general-purpose environment, akin to a normal API endpoint) which could then call a mutation before taking some action.

Configuration can be centralized or provided at the call-site. If you use a limit from more than one place, defining them centrally is best, which will produce type-safe functions auto-completing your rate limit names.

```tsx
1const rateLimiter = new RateLimiter(components.rateLimiter, {
2  createAThing: { kind: "token bucket", rate: 3, period: HOUR },
3  makeAThirdPartyRequest: { kind: "fixed window", rate: 100, period: MINUTE },
4});
5
```

- `rateLimiter.limit` is what you call to consume resources. It will return whether it succeeded.
- `rateLimiter.check` will do the same thing as `limit`, but return the result without consuming any resources, as a way to tell whether it would have failed.
- `rateLimiter.reset` will reset a given rate limit.

```tsx
1export const doAThing = mutation({
2  args: { email: v.string() },
3  handler: async (ctx, args) => {
4    const { ok, retryAfter } = await rateLimiter.limit(ctx, "myRateLimit");
5    if (!ok) return { retryAfter };
6    await doTheThing(ctx, args.email);
7  },
8});
9
```

- `ok` is whether it successfully consumed the resource and the operation should proceed.
- `retryAfter` is when it could succeed in the future, which can be used by a client to decide when to retry. We’ll discuss “jitter” later which is important here if it’s highly contended.

See the [component docs](https://www.convex.dev/components/rate-limiter) for setup and configuration instructions.

From here on, the mutation context will be assumed. We’ll also use these constants to make it more readable:

```tsx
1const SECOND = 1000; // ms
2const MINUTE = 60 * SECOND;
3const HOUR = 60 * MINUTE;
4const DAY = 24 * HOUR;
5
```

### Failed logins

This will allow 5 failed requests in an hour. Because it’s a bucket implementation, the user will be able to try 5 times immediately if they haven’t tried in an hour, and then can try again every 6 minutes afterwards.

```ts
1const rateLimiter = new RateLimiter(components.rateLimiter, {
2  failedLogins: { kind: "token bucket", rate: 10, period: Hour },
3});
4
```

Using the functions to manage failed logins:

```ts
1await rateLimiter.check(ctx, "failedLogins", { key: userId, throws: true });
2const success = await logInAttempt(ctx, userId, otp);
3if (success) {
4  // If we successfully logged in, stop limiting us in the future
5  await rateLimiter.reset(ctx, "failedLogins", { key: userId });
6} else {
7  const { retryAfter } = await rateLimiter.limit(ctx, "failedLogins", { key: userId });
8  return { retryAfter }; // So the client can indicated to the user when to try again
9}
10
```

- `throws` is a convenience to have it throw when `ok` is `false` instead of return the values. It works for `limit` and `check`.

### Account creation via global limit

To prevent a flood of spam accounts, you can set a global limit on signing up for a free trial. This limits sign-ups to an average of 100 per hour.

```ts
1await rateLimiter.limit(ctx, "freeTrialSignUp", {
2  config: { kind: "token bucket", rate: 100, period: HOUR },
3  throws: true,
4});
5
```

- `config`: The configuration is inlined if you didn’t define it with `new Rate Limiter`.

Note: this is a deterrent for spammers, but means that during a flood of attempts, other users will be impacted. See [below](https://stack.convex.dev/rate-limiting#authenticating-anonymous-users) for tips on authenticating anonymous users.

### Sending messages per user

```ts
1const { ok, retryAfter } = await rateLimiter.limit(ctx, "sendMessage", {
2  key: userId,
3  config: { kind: "token bucket", rate: 10, period: MINUTE, capacity: 20 },
4});
5
```

- `key` will isolate the rate limiting, in this case to be a per-user limit.
- `capacity` here allows accumulating up to 20 unused tokens so a bursty minute won’t fail. See [above](https://stack.convex.dev/rate-limiting#token-bucket) for details on the implementation.

### Making LLM requests with reserved capacity

If you’re staying on the [OpenAI free tier](https://platform.openai.com/docs/guides/rate-limits/free-tier-rate-limits), you can ensure you don’t go above their rate limits, and when you have too many requests, you can schedule them to happen when you will.

```ts
1const { ok, retryAfter } = await rateLimiter.limit(ctx, "chatCompletion", {
2  count: numTokensInRequest,
3  reserve: true,
4});
5if (!ok) return { retryAfter }; // There were too many reserved already.
6if (retryAfter) { // We need to wait until later, but we've reserved the tokens.
7  // Spread the request across 10s in case of many reservations.
8  const withJitter = retryAfter + (Math.random() * 10 * SECOND);
9  await ctx.scheduler.runAfter(withJitter, internal.llms.generateCompletion, args);
10} else { // We can run it immediately.
11  const result = await generateCompletion(args);
12	//...
13}
14
```

- `count` can decrease the number of tokens by a custom amount. By default it’s 1.
- `reserve: true` instructs it to allow a token deficit if there isn’t enough capacity, provided we are willing to schedule our work for the future time when it would have had enough capacity. See [above](https://stack.convex.dev/rate-limiting#reserving-tokens) for more details.
- `maxReserved` defines how many tokens it should allow to be reserved before refusing to set aside tokens.

Reservations work with either rate limiting approach.

### Jitter: introducing randomness to avoid thundering herds

If we tell all clients to retry just when the next window starts, we are inviting what’s called a “thundering herd” which is about how it sounds. When too many users show up at once, it can cause network congestion, database contention, and consume other shared resources at an unnecessarily high rate. Instead we can return a random time within the next period to retry. Hopefully this is infrequent. This technique is referred to as adding “jitter.”

A simple implementation could look like:

```ts
1const withJitter = retryAfter + (Math.random() * period);
2
```

For the fixed window, we also introduce randomness by picking the start time of the window (from which all subsequent windows are based) randomly if `config.start` wasn’t provided. This helps from all clients flooding requests at midnight and paging your on-call.

## Scaling rate limits with shards

As your usage grows, you’ll want to think about scalability for your rate limiting.

If you are using per-user keys, using each key won’t conflict with the others. However, if you use global rate limits, or a single key might have hundreds of requests per second, you should shard the rate limit by dividing the capacity into multiple rate limits.

For example, if you’re trying to limit the overall (global) number of tokens sent to an LLM API, you could make 10 rate limits, each at 1/10th the bandwidth. When you go to use the rate limit, you can set the `key` to be one of 10 random values, such as `0...9`.

Thankfully the component handles this internally. Just provide `shards` in your config:

```ts
1const rateLimiter = new RateLimiter(components.rateLimiter, {
2  llmRequests: { kind: "fixed window", rate: 1000, period: MINUTE, shards: 10 },
3});
4
```

This will decrease your ability to maximize throughput by spreading out the load amongst the shards. It also leverages [The Power of Two Choices in Randomized Load Balancing](https://www.eecs.harvard.edu/~michaelm/postscripts/tpds2001.pdf) and check two shards to keep the overall rates balanced.

## What if I rely on multiple rate limits?

If your operations requires consuming multiple rate limits, you can run into issues if you aren’t careful. You could consume resources that you don’t end up using. This can even deadlock if two operations acquire resources in different orders, for instance:

1. Request A takes 5 unit of x and fails to take 10 units of y, so returns to the client that it should retry later.
2. Request B takes 5 units of y (say there were only 5 units) and fails to take 10 units of x.
3. Request A retries, taking another 5 units of x which had accumulated, and fails to take y.
4. etc.

**Here are two strategies to handle this:**

1. Use `rateLimiter.check` ahead of time for each rate limit you’ll depend on, and only continue to consume them if they are all satisfied, otherwise return the largest `retryAfter` value so the client doesn’t retry before it’d plausibly be accepted.

2. Roll back the transaction by throwing an exception instead of returning. When an exception is thrown, database writes are not committed, oo any rate limits the request already consumed will be reset to their previous values. When a rate limit fails, no state is persisted by the library.

To pass information back to the client, you can use `ConvexError`. This is what the library does if you specify `throws: true`:





```tsx
1if (args.throws) {
2  throw new ConvexError({
3    kind: "RateLimited",
4    name: args.name,
5    retryAfter,
6  });
7}
8
```





Note: this might not be the maximum value of `retryAfter` for your request, just the first it ran into. Hopefully your application rarely hits rate limits, so it’s ok for the client to retry later and need to wait again.


In general, I’d advise you to consolidate all of your rate limits into a single transaction (mutation) rather than calling out to multiple mutations from an action as you go, if all of the rate limits need to be satisfied for the operation to succeed.

## Authenticating anonymous users

It sounds like an oxymoron, but there are a few strategies for authenticating users that haven’t logged in or authenticated using traditional methods.

- **Client-generated session ID (optimistic):** This ID is generated in the browser and sent with requests to identify the user. This is only meaningful protection if you authorize the session ID using a strategy below, since a malicious user could generate new ones for each request.
- **Associate the session ID with an IP (lossy)**: You can have the client make a one-time HTTP request to an API endpoint that associates the session ID provided with an IP. You then rate-limit behaviors based on IP. This is handy, but ultimately a flawed approach, since many real users may share a virtual IP exposed by their ISP.
- **Use a Captcha or similar to authorize the session ID (robust):** This is what I’d recommend. Anonymous users submit a captcha to prove they’re not bots, and associate the successful captcha with their session ID to be authorized to do any operation. At this point, you can rate limit their session ID as if it were a userId.

## Summary

We looked at implementing application-layer rate limiting to help limit operations, either globally or specific to a user or other key. We looked at implementing both a token bucket and fixed window limits using just two numbers.

This is enabled by having an environment that:

- Provides transactional guarantees to avoid race conditions with reading & writing values.
- Automatically retries conflicting transactions.
- Schedules work transactionally, to allow handling multiple rate limits independently and roll back everything if any of them fail.
- Has fast access to a database with indexed lookups.

Beware: if you plan to implement these with Postgres or similar, beware of the [read-modify-write behavior](https://www.2ndquadrant.com/en/blog/postgresql-anti-patterns-read-modify-write-cycles/) where, by default, you are exposed to data races, even within a transaction.

We also looked at adding the ability to reserve capacity ahead of time to ensure fairness, as well as handle bursts of traffic while still maintaining an overall average limit.

As always, let me know in [our Discord](https://convex.dev/community) what you think and what else you’d like to see out of the library.

### Footnotes

1. Specifically having serializable isolation is really useful for this use case. “Read committed” isolation (the default for Postgres and other SQL variants) is vulnerable to race conditions for the code in this article, [even in a transaction](https://www.2ndquadrant.com/en/blog/postgresql-anti-patterns-read-modify-write-cycles/) unless you jump through some hoops. And if you figure out how to do it for Drizzle [without adding read locks for every row in a transaction](https://orm.drizzle.team/docs/transactions), [this person could use some help](https://github.com/drizzle-team/drizzle-orm/discussions/1337). [↩](https://stack.convex.dev/rate-limiting#user-content-fnref-1)

2. For an article about a load balancing strategy that helps control costs and optimizes for throughput, check out my recent article on [work stealing](https://stack.convex.dev/work-stealing). [↩](https://stack.convex.dev/rate-limiting#user-content-fnref-2)

3. The Convex scheduler is transactional within mutations. If the mutations throws an exception, no database writes will happen and no functions will be scheduled. [↩](https://stack.convex.dev/rate-limiting#user-content-fnref-3)


Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started