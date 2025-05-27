# Zod with TypeScript for Server-side Validation and End-to-End Types

![Ian Macartney's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F077753b63476b77fb111ba06d1bb538517033a54-3500x3500.jpg&w=3840&q=75)

[Ian Macartney](https://stack.convex.dev/author/ian-macartney)

a year ago

# Zod with TypeScript for Server-side Validation and End-to-End Types

![Use zCustomQuery to add zod argument validation](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Fea0a87a780807ddd6d8c8decf9957bcbd53d53c3-2493x1620.png&w=3840&q=75)

Want to use [Zod](https://zod.dev/) with your TypeScript project to validate function arguments? Read on to see how, along with resources to allow you to specify Zod validation for Convex server function arguments. Want to jump right into code? It’s [down here](https://stack.convex.dev/typescript-zod-function-validation#using-zod-for-argument-validation-server-side).

## What is Zod?

[Zod](https://zod.dev/) by their own definition is:

> TypeScript-first schema validation with static type inference

It lets you define the format of data and validate it. It’s often used for form validation on a website or argument validation on a server. It can be used in JavaScript, but a big benefit comes from providing great TypeScript types to avoid duplicating a type definition from a validation specification.

For terminology, I’m using the term “validate” here. They like to say “ [parse, don’t validate](https://zod.dev/#:~:text=parse%2C%20don%27t%20validate),” but that nuance isn’t important to how we’ll talk about it.[1](https://stack.convex.dev/typescript-zod-function-validation#user-content-fn-1) The important thing is you have:

```jsx
1const untrustedData: any;
2const trustedData = z.string().email().parse(untrustedData);
3
```

If your untrustedData is an email, hooray! You have a safe value to use. If not, it will throw a `ZodError` which, in the case of form validation, you can catch to inform the user which field is invalid.

### Why use Zod?

Zod allow you to:

- Validate types at runtime: remember that defining TypeScript types doesn’t guarantee that the values at runtime will match! Especially when receiving JSON payloads, it’s important to ensure the data matches your expectation.
- Avoid repeating type definitions and data validators.
- Do the same runtime validation on the client and server: doing it on the client allows you to give the user quick feedback, and doing it on the server guards against malformed requests and untrusted clients.

### How to use Zod

You can install Zod:

```bash
1npm i zod
2
```

Then define your schema, like:

```jsx
1const myData: z.object({
2	email: z.string().email(),
3  num: z.number().min(0),
4  bool: z.boolean().default(false),
5  array: z.array(z.string()),
6  object: z.object({ a: z.string(), b: z.number() }),
7  union: z.union([z.string(), z.number()]),
8});
9
```

And parse (validate) the data:

```jsx
1// Throws when the data is invalid
2const result = myData.parse(untrustedData);
3// Returns an error object instead
4const { success, error, data } = myData.safeParse(untrustedData);
5
```

## Using Zod for argument validation server-side

When you want to validate your endpoint’s arguments, you can do it manually on the data passed in by your framework. However, it’s more powerful to expose this data, so it can also inform end-to-end type safety, for instance with tRPC or Convex.

### Using Zod with tRPC

For tRPC projects, you can provide a Zod object to `.input`:

```jsx
1const t = initTRPC.create();
2
3const appRouter = t.router({
4  greeting: t.publicProcedure
5    .input(z.object({ name: z.string() }))
6    .query((opts) => {
7      const { input } = opts;
8      return `Hello ${input.name}`;
9  }),
10});
11
```

### Using Zod with Convex

With Convex, argument validation is usually done with the same validators used to define your [database schema](https://docs.convex.dev/database/schemas) (note the `v` instead of `z`!):

```jsx
1export const greeting = query({
2  args: { name: v.string() },
3  handler: async (ctx, args) => {
4    return `Hello ${args.name}`;
5  }
6});
7
```

However, if you’re already using Zod elsewhere in your project, or want to validate more refined types, wouldn’t it be nice to validate your arguments with the same object? To make this possible, I wrote some helpers.

```bash
1npm i convex-helpers@latest
2
```

These build off of [this post](https://stack.convex.dev/custom-functions) where I show how to customize functions generally. See that post for the details on the API and why it’s preferable to typical middleware.

If you aren’t doing any customization and just want to use Zod arguments, you can use the functions exported from `convex-helpers/server/zod`:

```jsx
1import { z } from "zod";
2import { NoOp } from "convex-helpers/server/customFunctions";
3import { zCustomQuery } from "convex-helpers/server/zod";
4import { query } from "./_generated/server";
5
6// Make this once, to use anywhere you would have used `query`
7const zQuery = zCustomQuery(query, NoOp);
8
9export const greeting = zQuery({
10  args: { name: z.string() },
11  handler: async (_ctx, args) => {
12    return `Hello ${args.name}`;
13  },
14});
15
```

Let’s walk through what’s happening:

1. First we make `zQuery`, which is like `query` but modified by `zCustomQuery` to accept Zod arguments, along with any customization you provide in the second argument. We’re passing `NoOp` which doesn’t modify the defined query endpoint’s arguments (a.k.a. no-op or identity function).
2. We use `zQuery` like we’d normally use `query` , but this time we get to pass in zod validators for arguments.

Internally, this does two things:

1. It turns the Zod validator into a Convex validator using `zodToConvex`. This allows Convex to know generally what types the function expects (which helps suggest arguments when you [run your functions from the Dashboard](https://docs.convex.dev/dashboard/deployments/functions#running-functions)). This also allows Convex to validate the `v.id("tablename")` type, which ensures IDs match the expected table name.
2. It runs the Zod validator before the function runs, since Zod types can be more specific than Convex types (e.g. `z.string().email()` vs. `v.string()`).

Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started

### `v.id(tablename)` → `zid(tablename)`

When you want to validate a [Convex Document ID](https://docs.convex.dev/database/document-ids), since Zod doesn’t have a built-in type, you can use `zid`:

```jsx
1...
2import { zCustomQuery, zid } from "convex-helpers/server/zod";
3
4const zQuery = zCustomQuery(query, NoOp)
5
6export const getUser = zQuery({
7  args: {userId: zid("users")},
8  handler: async (ctx, args) => {
9    const user = await ctx.db.get(args.userId);
10    return user && { id: user._id, name: user.name };
11  },
12});
13
```

This creates a `v.id` validator under the hood, which ensures you don’t return data from the wrong table if someone passes an ID to another table to `getUser`.

However, note that `zid` doesn’t do the table name validation when you do `.parse()`. It does this by converting it into a `v.id` which is passed to the Convex argument validation. So keep in mind that if you’re validating a `zid` in a browser, it will only check that it is a string.

### Output validation

In addition to validating function inputs, you can also use Zod to validate the output data, similar to defining an explicit TypeScript return type on your function. While this is less critical, since the data you return is generally more trusted than what’s provided by a user, it does have a nice benefit of _**limiting**_ what you return. If your return TypeScript type is `{ name: string }` and you return a `User: { name: string, email: string }`, then TypeScript will say it’s ok, but you would be leaking the user’s email, since TypeScript’s typing on objects isn’t exact. By specifying a Zod validator for your output, it will both set the TypeScript return type, but also strip out fields that you don’t specify. For example:

```jsx
1const user = { name: "Sam", email: "sam@example.com" };
2const output = z.object({ name: z.string() });
3const limited = output.parse(user);
4console.log(limited)
5// { name: 'Sam' }
6
```

To do this you could just do it in your function:

```jsx
1export const getUser = zQuery({
2  args: {userId: zid("users")},
3  handler: async (ctx, args) => {
4    const user = (await ctx.db.get(args.userId))!;
5    const output = z.object({ name: z.string() });
6    return output.parse(user);
7  },
8});
9
```

But with the `zCustomQuery` , `zCustomMutation`, or `zCustomAction`, you can specify it like:

```jsx
1export const getUser = zQuery({
2  args: {userId: zid("users")},
3  handler: async (ctx, args) => {
4    const user = (await ctx.db.get(args.userId))!;
5    return user;
6  },
7  returns: z.object({ name: z.string() }),
8});
9
```

### Customizing the function

Similar to [`customFunctions` described here](https://stack.convex.dev/custom-functions), you can customize `zCustomFunction`.

Here we modify the `ctx` object passed into `greeting`:

```jsx
1import { z } from "zod";
2import { customCtx } from "convex-helpers/server/customFunctions";
3import { zCustomQuery } from "convex-helpers/server/zod";
4import { query } from "./_generated/server";
5import { getUser } from "./users";
6
7const userQuery = zCustomQuery(
8  query,
9  customCtx(async (ctx) => {
10    const user = await getUser(ctx);
11    return { user };
12  })
13);
14
15export const greeting = userQuery({
16  args: { greeting: z.string() },
17  handler: async (ctx, args) => {
18    return `${args.greeting} ${ctx.user.name}`;
19  },
20});
21
```

Here we add `session` to the `ctx` , stripping off `sessionId` from the arguments:

```jsx
1const zQuery = zCustomQuery(query, {
2  args: { sessionId: v.id("sessions") },
3  input: async (ctx, args) => {
4    const session = await ctx.db.get(args.sessionId);
5    return { ctx: { ...ctx, session }, args: {} };
6  },
7});
8
```

Note: we use normal Convex validators ( `v.`) for the customization, so it is easy to extend behavior with helpers that don’t use Zod.

### Error handling

If an error occurs, it will throw a [`ConvexError`](https://docs.convex.dev/functions/error-handling/application-errors#throwing-application-errors) with `{ ZodError }` as the data. This allows you to inspect the full error object on the client-side, without leaking the server’s stack trace.

### Can I use Zod to define my database types too?

With the `zodOutputToConvex` function, you can turn your Zod validators into Convex types that not only work in argument validation, but also can be used to define tables (via `defineTable`, see [here](https://docs.convex.dev/database/schemas)). Is this a good idea? It depends.

The data at rest is guaranteed to match the defined schema (assuming you have [schema enforcement turned on](https://docs.convex.dev/database/schemas#options)). However, if your Zod type is more refined (like a `z.string().email()`), then there isn’t a guarantee that the data at rest matches it. For some types, like `z.tuple`, the definition looks more like `z.array(z.union([...]))`.

Note: there are two related functions. `zodToConvex` will make a Convex validator that enforces the **input** you'd pass to the zod validator. `zodOutputToConvex` will make a validator for the **output** from zod. If you run your zod validator **before inserting**, then you'd want to use `zodOutputToConvex` for your schema. If you run your zod validator **after reading**, then `zodToConvex` will match it. This only comes up for the case of defaults (where the value is optional on one side and required on the other), pipelines (coercing a Date into a number), and transforms (effects), which don't have a defined validator for the output type (and result in a `v.any()` convex validator).

#### So what can you do?

- You can wrap `ctx.db` in mutations to validate the more specific data types before writing data, using a wrapper like `convex-helpers/server/rowLevelSecurity`. This can ensure the **new** data you’re writing is the right format.
- You can wrap `ctx.db` in queries & mutations to validate the data on reads. This will ensure the data you retrieve is the right format. It’s an open question how you should handle invalid data on reads. If you change your schema and read an old invalid value, you could fail the request, omit the result, or try to transform it into the right shape. This is pretty messy.
- You can run a migration over your data, validating the Zod schema when you change it. Similar to other migrations, I’d suggest first changing the data writers to validate on insert, then run a migration over older documents and manually resolve errors.

Note: if a developer edits data in the dashboard or uploads data via the CLI, your validators won’t run. The validation here is best effort, and up to you.

#### What would I do?

I’d use Zod validation for server arguments, and trust that the server code will write valid data. If it’s very important, I’d consolidates those writes to a function where I manually validate the data & business logic before writing it. If your server is modifying a lot of data that needs to be a certain shape, consider validating it right there. If I had more specific types that I expect from the data (e.g. z.tuple), I’d use Zod on the read side to give better types while asserting the structure.

I might use `zodOutputToConvex` to define the table schema from the Zod types, but I’d add a big comment block making it clear that the validation isn’t guaranteed. I do like that my table definition would be more self-documenting. An `.email()` is more meaningful than `v.string()`.

## In summary

We looked at using Zod to validate function arguments (and more) to provide both type safety and runtime data validation for your TypeScript projects. By using `convex-helpers` you can validate your Convex functions, and translate from a Zod schema to a Convex validator. If you want to see the code, you can check it out / fork it / submit a PR here:

[get-convex/ **convex-helpers**\\
\\
![GitHub logo](https://stack.convex.dev/logos/github.svg)](https://github.com/get-convex/convex-helpers)

### Footnotes

1. For those curious, the distinction they draw is that parsing returns data with the new type, whereas validation only checks the type of an object, which leaves the type unchanged from the language’s perspective. [↩](https://stack.convex.dev/typescript-zod-function-validation#user-content-fnref-1)


Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started