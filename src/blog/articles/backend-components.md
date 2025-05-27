# Components for your Backend

![Ian Macartney's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F077753b63476b77fb111ba06d1bb538517033a54-3500x3500.jpg&w=3840&q=75)

[Ian Macartney](https://stack.convex.dev/author/ian-macartney)

7 months ago

# Components for your Backend

![multiple puzzle pieces connecting with circuitry to some main technology, to represent convex components.](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F3b04c7c457fe9a378c068b8f5e20407673266f0d-1452x956.png&w=3840&q=75)

With Convex [Components](https://www.convex.dev/components), you can incorporate off-the-shelf features into your app. They enable an ecosystem of powerful building blocks to reduce the amount of code you have to write and maintain yourself. These vary from new database features like providing [geospatial search](https://www.convex.dev/components/geospatial), drop-in features like [LaunchDarkly feature flags](https://www.convex.dev/components/launchdarkly) or [Expo push notifications](https://www.convex.dev/components/push-notifications), or common utilities to [retry](https://www.convex.dev/components/retrier) or [cache actions](https://www.convex.dev/components/action-cache) (Convex’s serverless functions that can have side effects).

In this post we’ll cover:

- What are components and why they’re a powerful abstraction.
- What it looks like to add some components to an existing app.
- Best practices for using components.

## What are Convex Components?

Components can be thought of as a combination of concepts from frontend components, third party APIs, and both monolith and service-oriented architectures.

If you’re already sold and looking to jump right in you can skip this section. If you’re interested in the larger conceptual model they fit into, check out [The Software-Defined Database](https://stack.convex.dev/the-software-defined-database).

Without further ado, here are some of the component capabilities I’m excited about.

### Data

Similar to frontend components, Convex Components encapsulate state and behavior, and allow exposing a clean interface. However, instead of just storing state in memory, these can have internal state machines that can persist between user sessions, span users, and change in response to external inputs, such as webhooks. Components can store data in a few ways:

- Database tables with their own schema validation definitions. Since Convex is realtime by default, data reads are automatically reactive, and writes commit transactionally.
- File storage, independent of the main app’s file storage.
- Durable functions via the built-in function scheduler. Components can reliably schedule functions to run in the future and pass along state.

Typically, libraries require configuring a third party service to add stateful off-the-shelf functionality, which lack the transactional guarantees that come from storing state in the same database.

### Isolation

Similar to regular npm libraries, Convex Components include functions, type safety, and are called from your code. However, they also provide extra guarantees.

- Similar to a third-party API, components can’t read data for which you don’t provide access. This includes database tables, file storage, environment variables, scheduled functions, etc.
- Similar to service-oriented architecture, functions in components are run in an isolated environment, so they can’t read or write global variables or patch system behavior.
- Similar to a monolith architecture, data changes commit transactionally across calls to components, without having to reason about complicated distributed commit protocols or data inconsistencies. You’ll never have a component commit data but have the calling code roll back.
- In addition, each call to a component is a sub-transaction isolated from other calls[1](https://stack.convex.dev/backend-components#user-content-fn-1), allowing you to safely catch errors thrown by components. It also allows component authors to easily reason about state changes without races, and trust that a thrown exception will always roll back the Component’s sub-transaction.

### Encapsulation

Being able to reason about your code is essential to scaling a codebase. Components allow you to reason about API boundaries and abstractions.

- The transactional guarantees discussed above allows authors and users of components to reason locally about data changes.
- Components expose an explicit API, not direct database table access. Data invariants can be enforced in code, within the abstraction boundary. For example, the [aggregate component](https://www.npmjs.com/package/@convex-dev/aggregate) can internally denormalize data, the [rate limiter](https://www.npmjs.com/package/@convex-dev/ratelimiter) component can shard its data, and the [push notification](https://www.npmjs.com/package/@convex-dev/expo-push-notifications) component can internally batch API requests, while maintaining simple interfaces.
- Runtime validation ensures all data that cross a component boundary are validated: both arguments and return values. As with normal Convex functions, the validators also specify the TypeScript types, providing end-to-end typing with runtime guarantees.

## Adding components to your app: walkthrough

To make this concrete, let’s look at what it takes to add some components to an existing app I’m working on. It’s an embeddings-based word game where you submit word guesses that match the meaning of two target words. Let’s add:

- An [aggregate](https://www.convex.dev/components/aggregate) component for a leaderboard to track top scores, calculate ranks, etc.
- An [action cache](https://www.convex.dev/components/action-cache) to only ever calculate an embedding once for a given word.
- A [rate limiter](https://www.convex.dev/components/rate-limiter) for how fast guest users can join, and how fast you can submit guesses.
- A [sharded counter](https://www.convex.dev/components/sharded-counter) to scalably track total guesses.
- A [migration](https://www.convex.dev/components/migrations) manager, to manage our online migrations.

The full diff can be seen in [this pull request](https://github.com/ianmacartney/mid-embeddings/pull/1), with a commit for each step of the way. Note: the rate limiter and migration components are conversions from the `convex-helpers` equivalents. With components, they no longer need to add tables to your main schema.

```bash
1npm i convex@latest
2npm i @convex-dev/aggregate @convex-dev/action-cache @convex-dev/sharded-counter @convex-dev/ratelimiter @convex-dev/migrations
3
```

As covered in the docs and each component’s README (as seen in the [components gallery](https://www.convex.dev/components), [npm](https://www.npmjs.com/search?q=convex%20component), or [GitHub](https://github.com/orgs/get-convex/repositories?q=component)), adding a component involves:

1. Adding a new file to your project: `convex.config.ts` where you configure which components your app uses.





```tsx
1// convex/convex.config.ts:
2import { defineApp } from "convex/server";
3import aggregate from "@convex-dev/aggregate/convex.config";
4import actionCache from "@convex-dev/action-cache/convex.config";
5import shardedCounter from "@convex-dev/sharded-counter/convex.config";
6import ratelimiter from "@convex-dev/ratelimiter/convex.config";
7import migrations from "@convex-dev/migrations/convex.config";
8
9const app = defineApp();
10
11app.use(aggregate, { name: "leaderboard" });
12app.use(actionCache);
13app.use(shardedCounter);
14app.use(ratelimiter);
15app.use(migrations);
16
17export default app;
18
```

2. Running `npx convex dev` to generate code for associated components, so you have type-safe access to them via `import { components } from "./_generated/api";`





```bash
1$ npx convex dev
2# ...
3✔ Installed component actionCache.
4✔ Installed component aggregate.
5✔ Installed component migrations.
6✔ Installed component ratelimiter.
7✔ Installed component shardedCounter.
8
```

3. Instantiating the helper Class(es) for the components, which wrap up the underlying component API calls and provide conveniences like generic types. We’ll look at each of them next.


### Adding a leaderboard with the `aggregate` component

To get a leaderboard, we can define an aggregate and connect it to table updates using [Triggers](https://stack.convex.dev/triggers). Here we make an aggregate that’s namespaced by gameId and sorted by score. The configuration ends up looking like:

```tsx
1// in convex/functions.ts
2import {
3  internalMutation as internalMutationRaw,
4  mutation as mutationRaw,
5} from "./_generated/server";
6import { Triggers } from "convex-helpers/server/triggers";
7import { TableAggregate } from "@convex-dev/aggregate";
8import { customCtx, customMutation } from "convex-helpers/server/customFunctions";
9import { DataModel, Id } from "./_generated/dataModel";
10import { components } from "./_generated/api";
11
12const triggers = new Triggers<DataModel>();
13
14export const leaderboard = new TableAggregate<{
15  Namespace: Id<"games">;
16  Key: number;
17  DataModel: DataModel;
18  TableName: "guesses";
19}>(components.leaderboard, {
20  namespace: (d) => d.gameId,
21  sortKey: (d) => d.score,
22  sumValue: (d) => d.score,
23});
24triggers.register("guesses", leaderboard.trigger());
25
26const mutation = customMutation(mutationRaw, customCtx(triggers.wrapDB));
27const internalMutation = customMutation(
28  internalMutationRaw,
29  customCtx(triggers.wrapDB),
30);
31
```

**Note**: in order to keep the aggregate up to date, you need to use these versions of `mutation` and `internalMutation` instead of the built-in ones. You can see in [this commit](https://github.com/ianmacartney/mid-embeddings/pull/1/commits/d9daefc622978ba268bed5f00f3242ff54aebc3f) where I make this change along with adding an ESLint rule to prevent anyone from accidentally importing the “raw” versions of them.

To find the high score for a game, I can use `max`:

```ts
1leaderboard.max(ctx, { namespace: args.gameId });
2
```

To find the rank of my best guess amongst all guesses for a game, I can use `indexOf`:

```ts
1leaderboard.indexOf(ctx, bestGuess.score, {
2	namespace: args.gameId,
3	id: bestGuess._id,
4	order: "desc",
5});
6
```

Read [the docs](https://www.convex.dev/components/aggregate) for a full rundown of its capabilities.

### Caching embeddings with `action-cache`

For my game, I use embeddings of every search a user enters. To avoid generating duplicates, I can use the [Action Cache](https://www.convex.dev/components/action-cache) component:

```tsx
1const embedCache = new ActionCache(components.actionCache, {
2  action: internal.embed.generateEmbedding,
3});
4
```

Instead of calling the action directly, I can call it through the cache, which will return the cached value (based on the function name and arguments), or generate one on the fly.

```tsx
1await embedCache.fetch(ctx, { model: CONFIG.embeddingModel, input: text });
2
```

**Tip**: by including the model in the arguments, I ensure that it will never return cached embeddings generated by a different model, since the args are part of the cache key.

[Read the docs](https://www.convex.dev/components/action-cache) to learn about setting an expiration policy or manually clearing values.

### Tracking fast-changing stats with `sharded-counter`

With the hopes that my game will become a grand success, I want to count not only the guesses within a daily game, but across all days. I’d also like a global count on the homepage including all games by all authors. As you may have seen with [One Million Checkboxes](https://labs.convex.dev/million), keeping a count fast and correct can be nontrivial. [Sharded Counter](https://www.convex.dev/components/sharded-counter) isn’t as fully-featured as Aggregate, but it excels at high throughput counting.

Configuration:

```tsx
1import { ShardedCounter } from "@convex-dev/sharded-counter";
2
3const counter = new ShardedCounter(components.shardedCounter);
4
```

Adding to counters when adding a guess, but only for active games:

```tsx
1//inside the function used to add guesses
2if (game.active) {
3  await counter.add(ctx, "total"); // overall guesses vanity metric
4  await counter.add(ctx, args.gameId); // individual daily game
5  await counter.add(ctx, game.namespaceId); // daily games share a namespace
6  await counter.add(ctx, args.userId); // how many guesses a user has ever made
7}
8return ctx.db.insert("guesses", { ... });
9
```

I can then add live-updating stats to various parts of the UI showing activity, without worrying about query performance.

```tsx
1const totalCount = await counter.count(ctx, "total");
2
```

**Note**: be careful about calling `count` within mutations, since any two mutations both adding and reading the count will conflict with each other, requiring one to retry. Read more about that [here](https://stack.convex.dev/how-convex-works#read-and-write-sets).

### Using `ratelimiter` to deter abuse

Using application-layer rate limits allows you to control how frequently things can happen. Here I added a simple limit on how fast users can sign in as a guest (to hamper floods of automated signups).

```tsx
1const rate = new RateLimiter(components.ratelimiter, {
2  anonymousSignIn: {
3    kind: "token bucket",
4    rate: 100,
5    period: MINUTE,
6    shards: 10,
7  },
8});
9
```

It is then used as part of the sign up flow:

```tsx
1await rate.limit(ctx, "anonymousSignIn", { throws: true });
2
```

It will throw an exception if the rate is exceeded, rolling back the transaction.

Similar to the counter, it can be configured with the number of shards to enable more parallelism by distributing the load. More shards come with a higher chance of rejecting a request erroneously when running close to the limit, as the capacity is distributed amongst them.

See [the docs](https://www.convex.dev/components/rate-limiter) for more information.

### Configuring stateful `migrations`

[Migrations](https://www.convex.dev/components/migrations) allow us to modify data. The component makes it easy: you define a function that modifies a single row, and it will run it in batches and keep track of the bookkeeping.

Configuration:

```tsx
1export const migrations = new Migrations<DataModel>(components.migrations, {
2  internalMutation,
3});
4
```

**Note**: we pass in the `internalMutation` we made when configuring the `aggregate` component. That way if our migrations ever modify the `guesses` table, it will keep the associated aggregate information updated.

While the app doesn’t need to modify any data right now, it does need to update the aggregates and counters for guesses submitted before we added the above counter logic. So we’ll define a “migration” over the guesses table that, instead of modifying each guess, updates the counters and leaderboard. We’ll limit it to only the guesses submitted before we deployed the counter change, so we don’t double-count any guesses.

```tsx
1// in convex/game.ts
2export const addOldGuesses = migrations.define({
3  table: "guesses",
4  customRange: (query) =>
5    query.withIndex("by_creation_time", (q) =>
6      q.lt("_creationTime", Number(new Date("2024-10-22T16:20:00.000Z"))),
7    ),
8  migrateOne: async (ctx, doc) => {
9    await leaderboard.insertIfDoesNotExist(ctx, doc);
10    const game = await ctx.db.get(doc.gameId);
11    if (!game?.active) {
12      return;
13    }
14    await counter.add(ctx, "total");
15    await counter.add(ctx, doc.gameId);
16    await counter.add(ctx, game.namespaceId);
17    await counter.add(ctx, game.userId);
18  },
19});
20export const backfill = migrations.runFromCLI(internal.game.addOldGuesses);
21
```

We could run it from the dashboard or CLI: `npx convex run game:backfill`.

If we had a bug and it failed part way, we could see how many guesses it had processed, resume where it left off, test a dry run, or start over after. By default if we run it again it will no-op:

```tsx
1$ npx convex run game:backfill
2[CONVEX ?(game:backfill)] [DEBUG] 'Migration already done.'
3{
4  cursor: '07b6def...',
5  isDone: true,
6  latestStart: 1729614001337,
7  name: 'game:addOldGuesses',
8  processed: 8675
9}
10
```

### Walkthrough done!

Check out [convex.dev/components](https://www.convex.dev/components) to see the full list of components available now, and let us know what you’d like to see.

## Best practices for using components

### Avoid modifying data directly from the dashboard

You can see your component’s data and its internal functions on the dashboard by selecting it from the components dropdown (you won’t see this dropdown until you have your first component, by the way). However, directly modifying the data or running internal functions might violate some invariant the component depends on. Limit interacting with it through the Class it provides, through functions in your own application.

### Using multiple component instances

Some components make sense to only have a single instance of, for instance you probably only need one [crons](https://www.convex.dev/components/crons) component for dynamically periodic function calls. For others, you’ll need to have multiple components for different use cases. It’s important to know when to make multiple component instances.

One thing that can be confusing is that when I say “multiple components” I mean multiple calls to `app.use(somecomponent, { name: "uniqueName" })`. Conceptually, every call to `.use` makes a new component that has its own isolated database tables. Merely instantiating the component’s Class multiple times via `new SomeComponent(components.somecomponent)` will have multiple references to the **same component**. For some components this is fine. For instance, for [rate limiting](https://www.convex.dev/components/rate-limiter) each limit has its own name, and different Class instances can point to the same component instance:

```tsx
1const userLimits = new RateLimiter(components.ratelimiter, {
2   freeTrialSignUp: { kind: "fixed window", rate: 100, period: HOUR },
3   //...
4};
5// OK
6const messageLimits = new RateLimiter(components.ratelimiter, {
7  sendMessage: { kind: "token bucket", rate: 10, period: MINUTE, capacity: 3 },
8});
9
```

As long as the names don’t conflict, they can happily use the same component. However, for the [aggregates](https://www.convex.dev/components/aggregate) component, you need to make sure each table you’re aggregating over has its own data:

```tsx
1// convex/convex.config.ts
2app.use(aggregate, { name: "aggregateScores" });
3app.use(aggregate, { name: "aggregateByGame" });
4
5// convex/foo.ts
6const byScores = new TableAggregate(components.aggregateScores, {...});
7const byGame = new TableAggregate(components.aggregateByGame, {...});
8
```

### Am I locked in?

Similar to using a third party service as part of your app, using components means that some of your app’s data is stored in isolated tables. When you decide to change third-party providers, you need to think about how your data will transfer. Similarly with components, you will need to get your data out of the component.

- Rest assured that the data is still in your Convex database. You can see the data from the Convex dashboard, and it is included in snapshot imports and exports, allowing your components to restore from a backup at the same snapshot as the rest of your data.
- If you want to modify the behavior of a component, you are free to fork or vendor in the implementation. Components need not be installed by npm. You can add functions, modify the schema, etc.
- For now, component data is tied to the component’s name. Each component has a default name (for instance the [action cache](https://www.convex.dev/components/action-cache) is named `actionCache` by default), but can be overridden when installing like `app.use(ratelimiter, { name: "customName" })`. This means you can replace a component and maintain its data by re-using the same name, provided it has a compatible schema to the existing data.

## Summary

Components are a big step forward in the composability of backend functionality, bringing the enforced isolation and local-reasoning benefits of service-oriented architecture together with the transactional simplicity of monolith architecture. It allows encapsulating logic and data to build powerful features that can ship in a tidy package with a clean abstraction layer. As always, let us know what you think [in Discord](https://convex.dev/community).

### Footnotes

1. Components function calls provide serializable isolation, the strongest level, mirroring Convex mutations. This means two calls can each read from the database, modify it, and write it back without worrying about race conditions. [↩](https://stack.convex.dev/backend-components#user-content-fnref-1)


Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started