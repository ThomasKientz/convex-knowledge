# Database Triggers

![Lee Danilek's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F3c79cdc687d19f0b05080ae217ed23e00b239f79-594x603.jpg&w=3840&q=75)

[Lee Danilek](https://stack.convex.dev/author/lee-danilek)

8 months ago

# Database Triggers

![Lightning bolt to represent trigger and alert on computer](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Fe226272465e0c82161436361d3fbeaeb31513fb9-1452x956.png&w=3840&q=75)

Triggers automatically run code whenever data in a table changes. A library in the [`convex-helpers` npm package](https://www.npmjs.com/package/convex-helpers) allows you to attach trigger functions to your Convex database.

Triggers run within the same mutation that changes the data, so they run atomically with the data changing. Queries running in parallel will never see a state where the data has changed but the trigger didn’t run.

Check out the [docs](https://github.com/get-convex/convex-helpers/blob/main/packages/convex-helpers/README.md#triggers) for details on how they work and be sure to check out the [best practices](https://stack.convex.dev/triggers#best-practices) below. In this article we’ll explore use-cases.

![Triggers are wonderful things](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Fdc2a13e1b4e1a36cb15ebf91d5d1b9cb50d2759d-450x312.tif&w=3840&q=75)Triggers are wonderful things

### TL;DR Show me the code

```tsx
1npm i convex-helpers@latest
2
```

Define a function that runs automatically when the “users” table changes

In `convex/functions.ts`:

```tsx
1/* eslint-disable no-restricted-imports */
2import { mutation as rawMutation, internalMutation as rawInternalMutation } from "./_generated/server";
3/* eslint-enable no-restricted-imports */
4import { DataModel } from "./_generated/dataModel";
5import { Triggers } from "convex-helpers/server/triggers";
6import { customCtx, customMutation } from "convex-helpers/server/customFunctions";
7
8// start using Triggers, with table types from schema.ts
9const triggers = new Triggers<DataModel>();
10
11// register a function to run when a `ctx.db.insert`, `ctx.db.patch`, `ctx.db.replace`, or `ctx.db.delete` changes the "users" table
12triggers.register("users", async (ctx, change) => {
13  console.log("user changed", change);
14});
15
16// create wrappers that replace the built-in `mutation` and `internalMutation`
17// the wrappers override `ctx` so that `ctx.db.insert`, `ctx.db.patch`, etc. run registered trigger functions
18export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
19export const internalMutation = customMutation(rawInternalMutation, customCtx(triggers.wrapDB));
20
```

Elsewhere:

```ts
1import { mutation } from "./functions";
2
3export const myMutation = mutation({
4  handler: async (ctx, args) => {
5	  // This will cause the user triggers to run automatically.
6	  await ctx.db.insert("users", { ... });
7	},
8});
9
```

Again, check out the [docs](https://github.com/get-convex/convex-helpers/blob/main/packages/convex-helpers/README.md#triggers) for details on how they work and be sure to check out the [best practices](https://stack.convex.dev/triggers#best-practices) below.

## Use-Cases of Triggers

### Logging

Suppose users are getting into a bad state. You want to add logging to debug when it’s happening. With a trigger you can log whenever a user changes, which will give you a timeline and tell which mutation is changing it.

```tsx
1triggers.register("users", async (ctx, change) => {
2  console.log("user changed", change);
3});
4
```

Or suppose you need to keep an audit log of what happens to a team, so admins can look at the history to see who did what when. You can store the logs in a separate table.

```tsx
1triggers.register("teams", async (ctx, change) => {
2  const tokenIdentifier = (await ctx.auth.getUserIdentity())?.tokenIdentifier;
3  await ctx.db.insert("teamAuditLog", { teamId: change.id, change, tokenIdentifier });
4});
5
```

### Denormalizing a field

Indexes are great for organizing data, but sometimes you want to organize based on a derived field. You can use a trigger to calculate that field.

Suppose you’re generating a list of airplane trips, where each trip can have layovers in various cities. When a user scrolls through their options, they want to see the trips with fewest layovers first. So the schema is like this:

```tsx
1trips: defineTable({
2  flights: v.array(v.object({
3    sourceAirport: v.string(),
4    destAirport: v.string(),
5    startTime: v.number(),
6    ...
7  }),
8  layovers: v.number(),
9  price: v.number(),
10}).index("fewestStops", ["layovers", "price"])
11
```

The `layovers` field is necessary to define the index, but it’s derived from the `flights` field and you don’t want it to be incorrect. So you can keep it updated with a trigger:

```tsx
1triggers.register("trips", async (ctx, change) => {
2  if (change.newDoc) {
3    const layovers = change.newDoc.flights.length;
4    if (change.newDoc.layovers !== layovers) {
5      await ctx.db.patch(change.id, { layovers });
6    }
7  }
8});
9
```

Note we have to check that the denormalized field isn’t already correct, because otherwise the `ctx.db.patch` will trigger an infinite recursion of triggers.

As another example, you may recall one restriction of [text search indexes](https://docs.convex.dev/search/text-search) is they can only search on one field. But we don’t have to let that stop us.

```tsx
1books: defineTable({
2  title: v.string(),
3  author: v.string(),
4  summary: v.string(),
5  allFields: v.string(),
6}).searchIndex("allFields", { searchField: "allFields" })
7
```

If we want a universal search bar, to search the book’s title, author, and summary all at once, you can denormalize all of those into a separate field, updated by a trigger.

```tsx
1triggers.register("books", async (ctx, change) => {
2  if (change.newDoc) {
3    const allFields = change.newDoc.title + " " + change.newDoc.author + " " + change.newDoc.summary;
4    if (change.newDoc.allFields !== allFields) {
5      await ctx.db.patch(change.id, { allFields });
6    }
7  }
8});
9
```

### Validating data

Not all data is good data. Convex performs [schema validation](https://docs.convex.dev/database/schemas) to do basic typechecks, but sometimes there are constraints that can’t be represented with types.

For example, an email address is always a string, but there are more constraints on what makes a valid email address. Triggers can throw errors to abort mutations that try to write invalid data.

```tsx
1triggers.register("users", async (ctx, change) => {
2  if (change.newDoc) {
3    // logic can be arbitrarily complex, including importing from npm libraries
4    const emailRegex = /^(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])$/i;
5    if (!emailRegex.test(change.newDoc.email)) {
6      throw new Error(`invalid email ${change.newDoc.email}`);
7    }
8  }
9});
10
```

When using this pattern, make sure you [don't catch errors](https://stack.convex.dev/triggers#warning-beware-error-catching).

### Authorizing writes

You can implement the write side of [row-level security](https://stack.convex.dev/row-level-security) with triggers. For example, here’s a rule that a message may only be modified by the user who created it.

```tsx
1triggers.register("messages", async (ctx, change) => {
2  const user = await getAuthedUser(ctx);
3  const owner = change.oldDoc?.owner ?? change.newDoc?.owner;
4  if (user !== owner) {
5    throw new Error(`user ${user} is not allowed to modify message owned by ${owner}`);
6  }
7});
8
```

When using this pattern, make sure you [don't catch errors](https://stack.convex.dev/triggers#warning-beware-error-catching).

#### Warning: beware error catching

Triggers are called after the data has been modified. If the trigger throws an error, it can cause the whole mutation to be rolled back. But if the mutation _catches_ the error, the data modification will still be committed.

```ts
1export const tryToUpdateMessage = mutation({
2  handler: async (ctx, { id, body }) => {
3    try {
4      await ctx.db.patch(id, { body });
5    } catch (e) {
6      console.error("failed to update message");
7    }
8  },
9});
10
```

If `tryToUpdateMessage` does a write that conflicts with an authorization or validation trigger and the trigger throws an error, the mutation will print `"failed to update message"`. However, **the message will still be updated**. The trigger runs after the document is patched, so if the mutation returns without throwing any error, the patch will commit.

### Cascade deletes

Sometimes when there are foreign references between documents, a delete should cascade across the link.

For example, when a user gets deleted, you can delete all of the messages they own.

```tsx
1triggers.register("users", async (ctx, change) => {
2  if (change.operation === "delete") {
3    for await (const message of ctx.db.query("messages")
4        .withIndex("owner", q=>q.eq("owner", change.id))) {
5      await ctx.db.delete(message._id);
6    }
7  }
8});
9
```

Note that like all mutations, triggers are bounded by size limits, so cascading deletes will fail if there are too many links. In this case you’ll probably want to schedule the deletes to run async.

Because triggers can trigger other triggers recursively, you can have a graph of foreign references and deletes can cascade through the graph. e.g. deleting a team can delete all of its users, which will then delete all of their messages.

### Asynchronous debounced processing

Running code transactionally when it changes is great, but sometimes you want to process the change asynchronously. This could be because the processing is a Convex action (i.e. it has side effects). Or maybe documents change often within a mutation and you want to only process the final change.

You can schedule the processing with `ctx.scheduler`, and use a global variable to cancel functions that were previously scheduled from the same mutation. In this example, we want to send the final user document to Clerk after it has been committed to Convex.

```tsx
1const scheduled: Record<Id<"users">, Id<"_scheduled_functions">> = {};
2triggers.register("users", async (ctx, change) => {
3  if (scheduled[change.id]) {
4    await ctx.scheduler.cancel(scheduled[change.id]);
5  }
6  scheduled[change.id] = await ctx.scheduler.runAfter(
7    0,
8    internal.users.updateClerkUser,
9    { id: change.id, user: change.newDoc },
10  );
11});
12
```

### Denormalizing a count

You may want to keep track of a denormalized value that accumulates all documents.

For example, here’s how you would keep track of the number of users in a single document, for fast querying.

```tsx
1triggers.register("users", async (ctx, change) => {
2  // Note writing the count to a single document increases write contention.
3  // There are more scalable methods if you need high write throughput.
4  const countDoc = (await ctx.db.query("userCount").unique())!;
5  if (change.operation === "insert") {
6    await ctx.db.patch(countDoc._id, { count: countDoc.count + 1 });
7  } else if (change.operation === "delete") {
8    await ctx.db.patch(countDoc._id, { count: countDoc.count - 1 });
9  }
10});
11
```

Note that storing the count in a single document means if users are modified frequently, the mutations will slow down due to [OCC conflicts](https://docs.convex.dev/error#1).

#### Triggers are isolated

Denormalizing a count demonstrates how triggers have an unexpected beneficial property: triggers are serializable.

Contrast with an explicit wrapper, where you are likely to write code like this:

```ts
1async function insertUser(ctx: MutationCtx, name: string) {
2  await ctx.db.insert("users", { name });
3  const countDoc = (await ctx.query("userCount").unique())!;
4  await ctx.db.patch(countDoc._id, { value: countDoc.value + 1 });
5}
6export const addTwo = mutation({
7  handler: async (ctx) => {
8    await Promise.all([\
9      insertUser(ctx, "foo"),\
10      insertUser(ctx, "bar"),\
11    ]);
12  },
13});
14
```

If you run this code, you'll discover that TypeScript can run async code however it wants. In this case, the `userCount` ends up as 1 even though there are two users. [See if you can figure out why](https://en.wikipedia.org/wiki/Race_condition#Example). The triggers library protects against race conditions so you can register the trigger above and see that `userCount` ends up with the correct value of 2.

```ts
1export const addTwo = mutation({
2  handler: async (ctx) => {
3    await Promise.all([\
4      ctx.db.insert("users", { name: "foo" }),\
5      ctx.db.insert("users", { name: "bar" }),\
6    ]);
7  },
8});
9
```

The triggers library isn't magical; you can add similar [locking semantics](https://github.com/get-convex/convex-helpers/blob/db305ba57baf53d74b0f084948c6273cf1f363ad/packages/convex-helpers/server/triggers.ts#L116) to your own `insertUser` wrapper and it will work just as well.

### Syncing a table into a component

You can use [Convex components](https://convex.dev/components) to super-charge your Convex deployment. Some components latch onto your tables, adding extra structure for efficient querying of counts, sums, or even geospatial data.

Components like [Aggregate](https://www.npmjs.com/package/@convex-dev/aggregate) and [ShardedCounter](https://www.npmjs.com/package/@convex-dev/sharded-counter) have methods that help you construct triggers, to help those components latch onto tables.

```ts
1const counter = new ShardedCounter(components.shardedCounter);
2triggers.register("mytable", counter.trigger("mycounter"));
3
```

## Best practices

### Consider explicit function calls instead

Attaching triggers to your data can seem magical. Calling `ctx.db.insert` in one file can call a trigger registered in a different file. You may call this "spooky action at a distance," because your code has side effects that aren't obvious. Using triggers too much can result in surprising effects when your code runs. Think of it similar to language patterns like modifying `Array.prototype.map` in JavaScript, or [overriding an operator in C++](https://isocpp.org/wiki/faq/operator-overloading#law-of-least-surprise-op-ov). You are effectively overriding the built-in Convex functions `ctx.db.insert`, `ctx.db.patch`, `ctx.db.replace`, and `ctx.db.delete`, so proceed with caution.

A more idiomatic way of running code when data changes, so as not to violate the [principle of least astonishment](https://en.wikipedia.org/wiki/Principle_of_least_astonishment), is to make the wrapper explicit. Instead of doing this:

```ts
1triggers.register("users", async (ctx, change) => {
2  console.log("user changed", change);
3});
4
5export const createMultipleUsers = mutation({
6  handler: async (ctx) => {
7    // this implicitly calls all triggers registered on the "users" table.
8    await ctx.db.insert("users", { name: "foo" });
9    await ctx.db.insert("users", { name: "bar" });
10  }
11}
12
```

Do this:

```ts
1async function createUser(ctx, name) {
2  await ctx.db.insert("users", { name });
3  console.log("user created", name);
4}
5
6export const createMultipleUsers = mutation({
7  handler: async (ctx) => {
8    await createUser(ctx, "foo");
9    await createUser(ctx, "bar");
10  }
11}
12
```

By encapsulating all writes to a table in distinct functions like `createUser`, you get the same benefit of running custom code whenever the table changes. But now you can command-click to follow `createUser` to its definition and see what code is getting called.

The advantage of triggers is they allow you to attach custom code without refactoring all usages of `ctx.db.insert`. Use them with caution.

### Always use the wrapper

Triggers are attached to mutations with [custom functions](https://stack.convex.dev/custom-functions). This works by replacing `ctx.db` in the mutation with a wrapped version that has the same interface but also calls the trigger functions. Therefore, trigger functions will only run if the mutation is wrapped in the custom function.

That means triggers do _not_ run in these cases:

- If you forget the wrapper and declare a plain mutation.
- When data is changed directly in the Convex dashboard.
- When data is uploaded through [`npx convex import`](https://docs.convex.dev/database/import-export/import).
- When data is uploaded through [streaming import](https://docs.convex.dev/production/integrations/streaming-import-export#streaming-import).

Here are tips for ensuring your mutations always run trigger functions:

1. Define `triggers`, call `triggers.register`, and call `customMutation` in a file `convex/functions.ts`

- You may register triggers across multiple files, but when you call `customMutation` all triggers should be registered, so it's easiest to do in one file.

1. By declaring our wrapped `customMutation` s to have names `mutation` and `internalMutation`, they become drop-in replacements for the built-ins of the same name. Just import from `'./functions'` instead of `'./_generated/server'`.
2. To make sure you always remember the correct imports, use [an eslint rule](https://stack.convex.dev/eslint-setup#no-restricted-imports).

```tsx
1"no-restricted-imports": [\
2  "error",\
3  {\
4    patterns: [\
5      {\
6        group: ["*/_generated/server"],\
7        importNames: ["mutation", "internalMutation"],\
8        message: "Use functions.ts for mutation",\
9      },\
10    ],\
11  },\
12],
13
```

## Recap

A simple `db.insert` or `db.delete` can cause many changes, to the same document with field denormalization, to other documents with cascading deletes and count denormalization, or to a separate Convex component. The same `db.insert` or `db.delete` can kick off an async function with side effects like sending the data to a third party service. Or it can abort the mutation entirely, to block unauthorized access or make sure invalid data never reaches the database.

Triggers allow you to implement [Dataflow](https://en.wikipedia.org/wiki/Dataflow) algorithms with Convex: whenever data changes, some auxiliary code runs to handle it, and the change propagates through the system.

Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started

We use third-party cookies to understand how people interact with our site.

See our [Privacy Policy](https://www.convex.dev/legal/privacy/) to learn more.

DeclineAccept