# Customizing serverless functions without middleware

![Ian Macartney's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F077753b63476b77fb111ba06d1bb538517033a54-3500x3500.jpg&w=3840&q=75)

[Ian Macartney](https://stack.convex.dev/author/ian-macartney)

a year ago

# Customizing serverless functions without middleware

![Customize your Convex functions with the new customQuery helper](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F3c158cf419a849c2b58b478df3d56188f1f8c140-2439x1276.png&w=3840&q=75)

Writing code for a backend API often requires doing similar steps: authenticate a user, looking up their roles and feature flags, etc. In most backend frameworks, the platform exposes bespoke ways of interacting with request handlers. It’s often referred to as middleware, sitting between the application code and the system code. In this article I’m going to make the case for keeping as much as possible **out** of middleware[1](https://stack.convex.dev/custom-functions#user-content-fn-1), and how to stay sane in the process.

## Why do we want it?

When you start out, you might have a lot of repeated lines at the beginning of each function like:

```js
1const user = await getUser(ctx);
2if (!user) throw new Error("Authentication required");
3const session = await ctx.db.get(sessionId);
4if (!session) throw new Error("Session not found");
5
```

Note: This syntax is for Convex, but the general idea applies to any backend framework.

You might also want to adjust the behavior of the function, for instance wrapping your database interface with a version that does authorization checks before every operation, based on the logged-in user:

```js
1// Pass in a user to use in evaluating rules,
2// which validate data access at access / write time.
3ctx.db = wrapDatabaseWriter({ user }, ctx.db, rules);
4
```

As a programmer, it’s natural to want to abstract this away. Modify it once and have it applied everywhere, right? Middleware seems like the right tool for the job. So…

## What’s the problem?

Middleware is often full of magic that can bring a lot of confusion to new members of a codebase, or new users of a platform.

- What is happening to my request?
- Is it validating that the user is logged in?
- Did it start a transaction for me? Will it clean it up?
- Where does this magical session object come from?
- How were these globals initialized?
- Which middleware **aren’t** being applied to my function?

When you’re looking at the endpoint handler, you don’t have a clear idea how requests are being modified before they get to your code. The configuration for middleware is not a simple `Cmd+click` “Jump-to-definition” hop away. You have to know where it’s defined, how it’s configured to apply (or not), and what it’s doing. Which brings me to my first principle of sorts when it comes to customizing functions:

### 1\. Function customization should be obvious and discoverable

You should be able to tell whether a function’s arguments are being modified or not, and find the code modifying the request or doing extra logic, via Cmd+click. Thankfully, using patterns like decorators for middleware in python help with this. If there are multiple modifications happening, that should be clear too, which leads to the next principle:

### 2\. Customization should be explicit and direct

When composing multiple behaviors, it can be confusing to reason about ordering and dependencies when nesting. If your row level security depends on certain data being available, such as the logged in user, that shouldn’t require having to remember to chain behavior in the right order. Another pattern one might consider, which I previously suggested in the “wrappers as middleware” series, results in nested function definitions like this:

```js
1// BAD: do I really have to remember to do this in the right order everywhere?
2export const myFunction = mutation(
3  withUser(
4    withSession(
5      withRowLevelSecurity(async (ctx, args) => {
6        // ...
7      })
8    )
9  )
10);
11
```

With this approach, it’s easy to forget which order execution happens in, and how types are passed along. It ends up requiring more cognitive overhead than the simple lines it’s replacing! Ideally the custom behavior is relatively short and straightforward (to reduce cognitive overhead). As we’ll see later, writing it as a single imperative function is easier to reason about than layers upon layers of wrapped functions, each only contributing a few lines of code. It also allows you to define a small number of “blessed” function types, rather than deciding what to compose for every callsite.

Aside: the “wrapper” sort of type inference also ends up being hard for TypeScript to infer the type of `ctx` and `args` here. It was often necessary to write functions that combined behavior to get the types working, which leads to the third principle:

### 3\. Type safety should be default and predictable

When middleware defines request-scoped variables, the types for what’s available at the endpoint isn’t always clear. At a former python-heavy company, there was a User provided to every handler, but it wasn’t clearly typed, so you had to know or guess what was defined on it. When working in Go, the `ctx` passed to every function has the same type ( `ctx.Context`) regardless of what has been added to it upstream. In TypeScript we can do better.

However, getting the types right for those higher level functions, or writing generic function wrapping code gets complicated quickly. I previously suggested this as the pattern in my “wrappers as middleware” series, but the types were so annoying that many users either gave up on the approach or gave up on type safety. **You shouldn’t need a math degree to add a parameter to a function.**

The types can speak for themselves when provided to the endpoint handler, and often communicate enough that the user doesn’t need to jump to the custom function definition. The functions that are being modified should have type signatures that make it obvious what’s available and what’s not. And that goes for the customization logic too: adding lookups and behavior should feel type-safe and allow you to hover over intermediate values to inspect types. If you change your logic and introduce a bug, you should get type errors.

## How do we do it?

To achieve these goals for Convex, I’ve implemented functions to customize the Convex [query](https://docs.convex.dev/functions/query-functions), [mutation](https://docs.convex.dev/functions/mutation-functions), and [action](https://docs.convex.dev/functions/actions) builders (and their [internal corollaries](https://docs.convex.dev/functions/internal-functions)). They can be imported from the `convex-helpers` npm package.[2](https://stack.convex.dev/custom-functions#user-content-fn-2)

For those who aren’t familiar with Convex, it’s a hosted backend as a service, including everything from a reactive database and serverless functions to file storage, scheduling, and search. Check out the [docs](https://docs.convex.dev/home) to learn more about the basics.

Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started

From here on, we’ll look at my approach for Convex. The general approach should translate to other frameworks, to varying degrees.

### Modifying the `ctx` argument to a server function for user auth

Here’s an example where we only modify some values in the `ctx` passed to a Convex function. We look up the logged in user, and provide it as `ctx.user` within a function defined with `userQuery`. We also wrap database reads with some row-level security.

```js
1import { query } from "./_generated/server";
2import { customQuery, customCtx } from "convex-helpers/server/customFunctions";
3
4// Use `userQuery` instead of `query` to add this behavior.
5const userQuery = customQuery(
6  query, // The base function we're extending
7  // Here we're using a `customCtx` helper because our modification
8  // only modifies the `ctx` argument to the function.
9  customCtx(async (ctx) => {
10    // Look up the logged in user
11    const user = await getUser(ctx);
12    if (!user) throw new Error("Authentication required");
13    // Pass in a user to use in evaluating rules,
14    // which validate data access at access / write time.
15    const db = wrapDatabaseReader({ user }, ctx.db, rules);
16    // This new ctx will be applied to the function's.
17    // The user is a new field, the db replaces ctx.db
18    return { user, db };
19  })
20);
21
22// Used elsewhere
23
24// Defines a publicly-accessible mutation endpoint called "myInfo"
25// Returns basic info for the authenticated user.
26export const myInfo = userQuery({
27  args: { includeTeam: v.boolean() },
28  handler: async (ctx, args) => {
29    // Note: `ctx.user` is defined. It will show up in types too!
30    const userInfo = { name: ctx.user.name, profPic: ctx.user.profilePic };
31    if (args.includeTeam) {
32      // If there are any rules around the teams table,
33      // the wrapped `ctx.db` can ensure we don't accidentally
34      // fetch a team the user doesn't have access to.
35      const team = await ctx.db.get(ctx.user.teamId);
36      return { ...userInfo, teamName: team.name, teamId: team._id };
37    }
38    return userInfo;
39  }
40});
41
```

The `customCtx` function here is a convenience function for when you want to modify `query`, `mutation`, or `action` and don't need to consume or modify arguments.

### Consuming a function argument for basic API key auth

Here’s another example where we add an additional argument to every `apiMutation` function. Any client calling these functions will need to pass an `apiKey` parameter, but the implementation of these functions doesn’t receive or specify argument validation for it.

```js
1import { mutation } from "./_generated/server";
2import { customMutation } from "convex-helpers/server/customFunctions";
3
4// Use `apiMutation` instead of `mutation` to apply this behavior.
5const apiMutation = customMutation(mutation, {
6  // This is the expanded customization simplified by `customCtx` above
7  // You can specify arguments that the customization logic consumes
8  args: { apiKey: v.string() },
9  // Similar to the `args` and `handler` for a normal function, the
10  // args validated above define the shape of `args` below.
11  input: async (ctx, { apiKey }) => {
12    // Add a simple check against a single API_KEY.
13    if (apiKey !== process.env.API_KEY) throw new Error("Invalid API key");
14    // We return what parameters to ADD to the modified function parameters.
15    // In this case, we aren't modifying ctx or args
16    return { ctx: {}, args: {} };
17  },
18});
19
20//... used elsewhere
21
22// Defines a publicly-accessible mutation endpoint called "doSomething"
23export const doSomething = apiMutation({
24  // Note we don't specify "apiKey" at every callsite
25  args: { someArg: v.number() },
26  // Note: args here doesn't include "apiKey" since it wasn't returned above.
27  handler: async (ctx, args) => {
28    const { someArg } = args;
29    // ...
30  }
31});
32
```

Note: to do more robust API key validation, I’d make an `api_keys` table and have the key be an ID to a document in that table. In that document you can capture who it was issued to, whether it’s been invalidated, its expiration, etc. The example with env variables above is a tactical convenience for when you have a single other trusted environment.

### Modifying `ctx` and `args` for a session implementation

Another example of a custom function:

```js
1import { mutation } from "./_generated/server";
2import { customMutation } from "convex-helpers/server/customFunctions";
3
4// Use `sessionMutation` to define public queries
5export const sessionMutation = customMutation(mutation, {
6  // Argument validation for sessionMutation: two named args here.
7  args: { sessionId: v.id("sessions"), someArg: v.string() },
8  // The function handler, taking the validated arguments and context.
9  input: async (ctx, { sessionId, someArg }) => {
10    const user = await getUser(ctx);
11    if (!user) throw new Error("Authentication required");
12    const session = await ctx.db.get(sessionId);
13    if (!session) throw new Error("Session not found");
14    // Pass in a user to use in evaluating rules,
15    // which validate data access at access / write time.
16    const db = wrapDatabaseWriter({ user }, ctx.db, rules);
17    // Note: we're passing args through, so they'll be available below
18    return { ctx: { db, user, session }, { sessionId, someArg } };
19  }
20})
21
22export const checkout = sessionMutation({
23  args: {
24    // Note: you can specify this as an argument if you want,
25    // if you match the type. Or you can omit it. You will get it either way.
26    // sessionId: v.id("sessions"),
27  },
28  // args here includes sessionId and someArg (including in the type)
29  handler: async (ctx, args) {
30    const { user, session } = ctx;
31    const cart = await db.get(session.cartId);
32    await purchase(ctx, user, cart, args.sessionId);
33  }
34
```

### Further extension

Instead of making layers of these functions, I recommend you do it all in one place when possible. You can use regular function encapsulation to hide unnecessary details, but by adding incremental changes to the same function, you can see all of the modifications and how they interact in the same place.

If you want variations on the behavior, make separate custom functions and use shared functions to avoid repeating too much code. However, I’d bias towards being explicit when possible, so it’s obvious which arguments are being added / removed.

Note: you can also un-define fields in `ctx` by returning `undefined`. E.g. to remove `db` you can return `ctx: { db: undefined }`.

### Downsides?

Are there any downsides? Of course! There is no perfect design or abstraction. For instance, you still have to remember to use the special function. Here are some ways to mitigate it:

- Add an `eslint` rule that prohibits importing the bare `query` or `mutation` anywhere - you can add exceptions for where you override them.
- Instead of replacing `db` with a “safer” version, you can change its name, and remove the original name, like: `ctx: { safeDB: db, db: undefined }`. Then in any place where you expected to do `ctx.safeDB`, you’ll get a type error if you’re not using your custom function.

## Recap

`customFunction` helpers are:

1. **Discoverable and obvious**: you can tell if your function is modified by whether it uses `mutation` or `apiMutation`. You can command+click `apiMutation` to jump to its definition.
2. **Explicit and direct** function calls make it easy to see what modifications are happening, and in which order. Dependencies look like regular function arguments (such as for `wrapDatabaseWriter`).
3. **Easy and predictable** types are available at each step of the customization. It’s all fully type-safe TypeScript, without having to add any type annotations! Meaning this is valid JavaScript too.

If you want to see the code, you can check it out / fork it / submit a PR here:

[get-convex/ **convex-helpers**\\
\\
![GitHub logo](https://stack.convex.dev/logos/github.svg)](https://github.com/get-convex/convex-helpers)

### Footnotes

1. I should admit that I likened my previous attempts at generic function customization as “middleware” - and I’m not opposed to the idea of centralizing the customization logic, provided it meets the principles here. For instance, I really like FastAPI’s argument dependency ergonomics. [↩](https://stack.convex.dev/custom-functions#user-content-fnref-1)

2. Install `convex-helpers` with `npm i convex-helpers@latest`. [↩](https://stack.convex.dev/custom-functions#user-content-fnref-2)


Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started

We use third-party cookies to understand how people interact with our site.

See our [Privacy Policy](https://www.convex.dev/legal/privacy/) to learn more.

DeclineAccept