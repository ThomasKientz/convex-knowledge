# Automatically Retry Actions

![James Cowling's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F0d9c8f867a3ecac0ce8efe417583dbab8ce458b3-400x400.jpg&w=3840&q=75)

[James Cowling](https://stack.convex.dev/author/james-cowling)

a year ago

# Automatically Retry Actions

![Retry your actions: use the power of convex scheduling](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F4c758d0a8ec559124d8f95014a7fd0ff8cec24c6-2877x1911.png&w=3840&q=75)

Convex provides strong guarantees so developers usually don’t have to reason about retries or inconsistencies. Queries and mutations execute as database transactions that are automatically retried in a fully-consistent manner. This is not the case for Convex actions however, which execute non-transactionally and with best-effort execution guarantees.

Actions provide an escape hatch from the deterministic world of queries and mutations. You could run a several-minute-long action that talks to a bunch of third-party services and externalizes database state. If one of these actions were to fail it wouldn’t be safe for Convex just to automatically retry it - perhaps your action does something like posting a tweet (an X?) that you wouldn’t want to happen twice if the action is retried.

Many times you know that your action really _is_ safe to retry though. In these cases you’re in luck because you can use Convex scheduling to automatically retry a failed action.

## Just gimme the code

If you want an out-of-the-box solution there is a Convex Component ready to go:
[https://www.convex.dev/components/retrier](https://www.convex.dev/components/retrier)

You can use this component to retry an unreliable action until it succeds:

```ts
1import { ActionRetrier } from "@convex-dev/action-retrier";
2import { components } from "./convex/_generated/server";
3
4const retrier = new ActionRetrier(components.actionRetrier);
5
6// run this from within an action or mutation
7await retrier.run(ctx, internal.module.myAction, { arg: 123 });
8
```

The rest of this article outlines the principles behind this component.

## How it works

Retries are a great use case to leverage Convex scheduling. Along the way we’ll also learn about using `db.system` to look up system table information and the `makeFunctionReference` helper to generate a reference to a function from its name as a string.

We can schedule a function from either a mutation or an action but since our goal is to build a reliable wrapper around an unreliable action we’re going to use mutations to do this. We’ll start with a mutation called `runAction` that takes in the name of an action and its args, then does some magic to make sure that action gets retried until it succeeds:

```tsx
1export const runAction = internalMutation({
2  args: {
3    action: v.string(),
4    actionArgs: v.any(),
5  },
6  handler: async (ctx, { action, actionArgs }) => {
7		...
8
```

We make this an `internalMutation` for safety since it exposes access to any action via its name. We can use a public mutation to call it for a specific action. The version in `convex-helpers` provides type-safety, unlike the simple example here.

### The algorithm

We’ll use the following logic to retry an action until it succeeds:
![The backoff algorithm](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F4523ce713f9881a60b23fd114bb610efce03fd2c-1186x1333.png&w=3840&q=75)The backoff algorithm

In a production app it’s also a good idea just to give up eventually in case the action will never succeed. [The linked source code](https://github.com/JamesCowling/convex-action-retrier/blob/main/convex/retrier.ts) also includes a configurable `maxFailures` check to do so.

### Execute action

The first step of our algorithm is to actually execute the action. You’re probably familiar with triggering an action from a mutation using a scheduling command like:

```tsx
1await ctx.scheduler.runAfter(0, api.example.unreliableAction, actionArgs);
2
```

It’s nice to have the type-safety provided by function references like `api.example.unreliableAction` but in this case we only have the name of the action as a string. Fortunately we can use the `makeFunctionReference` helper that will generate a function reference from its type (query/action/mutation) and name:

```tsx
1// const action = "example:unreliableAction"
2await ctx.scheduler.runAfter(
3	0,
4	makeFunctionReference<"action">(action),
5	actionArgs
6);
7
```

Be careful with code like this to ensure you don't expose functions that you don't intend to be public.

The last step is to record the job id for the scheduled function so we can check its status later:

```tsx
1const job = await ctx.scheduler.runAfter(
2	...
3
```

### Check job status

The job id we just recorded is actually the `Id` of a document in the Convex [system table](https://docs.convex.dev/database/advanced/system-tables) `_scheduled_functions`. There are a growing set of system tables in Convex that allow you to query internal system state from right within queries and mutations. You can read a system table with the `ctx.db.system.get()` command just like reading a regular table with `ctx.db.get()`. In particular we want to look up the `state.kind` field in the system table document for the job we just scheduled:

```tsx
1const status = await ctx.db.system.get(job);
2if (!status) {
3	throw new Error(`Job ${job} not found`);
4}
5switch (status.state.kind) {
6	case "pending":
7	case "inProgress":
8		...
9		break;
10	case "failed":
11		...
12		break;
13	case "success":
14		...
15		break;
16	case "canceled":
17	  ...
18		break;
19}
20
```

Now it’s just a matter of deciding when to retry the action and how long to wait before doing so.

### Back off

You might find it odd that there are two different exponential backoffs in our flowchart above. If you’re not familiar with exponential backoff it basically just means waiting longer every time we retry. It’s a great tool when you don’t know exactly how long to wait but you also don’t want to retry thousands of times in a tight loop.

The first backoff is used to figure out when the action has finished. The wrapper doesn’t know how long the unreliable action is meant to take so it wouldn’t make sense to keep checking every millisecond if it usually takes 5 minutes. Instead we wait 10ms, then 20ms, 40ms, 80ms, 160ms, etc.

The second backoff determines how long to wait before retrying a function. Oftentimes an action will fail because a third-party service is temporarily down. We would want to be hammering that poor service constantly if it’s already drowning under load. Instead we wait 10ms, then 20, then… you get the picture.

The `convex-action-retrier` library allows configuring the specific parameters of the exponential backoff but the nice thing about exponential backoff is that the default parameters should be fine for almost everyone.

## Ready for actions

Now you can implement reliable actions by retrying them until they succeed, but hopefully now you can also build relatively sophisticated workflows by chaining mutations and scheduling. The mental model to maintain is that queries, mutations and scheduling are reliable and transactional but restrictive, whereas actions are the wild west where you trade transactional guarantees for the flexibility to talk to the outside world. Fortunately these components all work together seamlessly so you can have your cake and eat it too.

Hooray!

Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started

We use third-party cookies to understand how people interact with our site.

See our [Privacy Policy](https://www.convex.dev/legal/privacy/) to learn more.

DeclineAccept