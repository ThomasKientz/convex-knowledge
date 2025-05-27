# Stateful Online Migrations using Mutations

![Ian Macartney's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F077753b63476b77fb111ba06d1bb538517033a54-3500x3500.jpg&w=3840&q=75)

[Ian Macartney](https://stack.convex.dev/author/ian-macartney)

a year ago

# Stateful Online Migrations using Mutations

![Icon of a schema in a yellow box next to an icon of a file migration in a black box](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F74abeed88d680f9ae35e6e1020c3b0812b6b6a87-1452x956.png&w=3840&q=75)

Migrations are inevitable. Initial schemas aren't perfect on the first try. As your understanding of the problem evolves, you will inevitably change your mind about the ideal way to store information.
So how do you do it at scale, where you might not be able to change everything in a single transaction?

In this post, we’ll look at strategies for migrating data. In particular, scalable online migrations that don't require downtime or block pushes. We’ll be working specifically with Convex, but the concepts are universal.

To learn about migrations at a high level and some best practices, see [this intro to migrations](https://stack.convex.dev/intro-to-migrations).

To start writing your own migrations, check out the
[Migrations Component](https://www.convex.dev/components/migrations).

## Schema Migrations

One thing to call out explicitly is that with Convex, you **don’t** have to write migration code like “add column” or “add index” explicitly. All you need to do is update your `schema.ts` file and Convex handles it. Convex isn’t rigidly structured like most SQL databases are. If you change your field from `v.string()` to `v.union(v.string(), v.number())`, Convex doesn’t have to reformat the data or table. However, it **will** enforce the schema you define, and will not let you deploy a schema that doesn't match the data at rest. Or you can turn off schema validation and throw unstructured data into Convex and it will also work[1](https://stack.convex.dev/migrating-data-with-mutations#user-content-fn-1).

With schema validation enabled, Convex will help your code and data stay in sync by only letting you push schemas that match the current data. To add a string field to an object, for instance, you can push a schema where that field is `v.optional(v.string())`. Once there is a string on every object, Convex will let you push a schema that is just `v.string()` and future writes will enforce that the field will always be set and be a string.

In this way, Convex gives you the ease of just defining your types declaratively, while also guaranteeing that they match the reality of the data at rest when you deploy your code and schema. It’s also worth mentioning that transitions from one schema definition and code version to the next are atomic, thanks to Convex coordinating both the functions and the database.

The rest of this post is about how you go about changing the underlying data.

## Data Migrations using Mutations

To migrate data in Convex, you can use a [mutation](https://docs.convex.dev/functions/mutation-functions) to transform your data.
In particular, you'd likely use an [`internalMutation`](https://docs.convex.dev/functions/internal-functions) so it isn't exposed on your public API.

To make this easy, I've made a [Migration Component](https://www.convex.dev/components/migrations) to help define, run, and monitor your migrations.
We'll use it in the following examples. See the component page for steps to install and configure it.

### Common use cases

Here's how to achieve common migration patterns:

#### Adding a new field with a default value

```ts
1export const setDefaultPlan = migrations.define({
2  table: "teams",
3  migrateOne: async (ctx, team) => {
4    if (!team.plan) {
5      await db.patch(team._id, { plan: "basic" });
6    }
7  },
8});
9
```

If you’re using a schema and validation, you’d likely update the team’s schema first to define “plan” as:

`plan: v.optional(v.union(v.literal("basic"), v.literal("pro")))`

Then, after all the fields have a value, you’d change it to:

`plan: v.union(v.literal("basic"), v.literal("pro"))`

Convex won’t let you deploy a schema that doesn’t conform to the data unless you turn off schema validation. As a result, you can safely trust that the typescript types inferred from your schema match the actual data.

Note: this doesn’t have to be a static value. You could write the value based on other fields in the document, or whatever custom logic you like.

As a reminder for those who skipped [the primer](https://stack.convex.dev/intro-to-migrations), to do this correctly, you’d also want to update your code to start writing the default field value on new documents before running this mutation to avoid missing any documents.

#### Deleting a field

If you’re sure you want to get rid of data, you would modify the schema in reverse: making the field optional before you can delete the data.

`isPro: v.boolean()` -\> `isPro: v.optional(v.boolean())`

Then you can run the following:

```ts
1export const removeBoolean = migrations.define({
2  table: "teams",
3  migrateOne: async (ctx, team) => {
4    if (team.isPro !== undefined) {
5      await db.patch(team._id, { isPro: undefined });
6    }
7  },
8});
9
```

As mentioned in the migration [primer](https://stack.convex.dev/intro-to-migrations), I advise deprecating fields over deleting them when real user data is involved.

#### Changing the type of a field

You can both add and delete fields in the same migration - we could have done both the setting a default plan and deleting the deprecated `isPro` plan:

```ts
1export const updatePlanToEnum = migrations.define({
2  table: "teams",
3  migrateOne: async (ctx, team) => {
4    if (!team.plan) {
5      await db.patch(team._id, {
6        plan: team.isPro ? "pro" : "basic",
7        isPro: undefined,
8      });
9    }
10  },
11});
12
```

I'd recommend new fields when types change, but if you want to use the same field, you can do it with a union:
`zipCode: v.number()` -\> `field: v.union(v.string(), v.number())`

```ts
1export const zipCodeShouldBeAString = migrations.define({
2  table: "addresses",
3  migrateOne: async (ctx, address) => {
4    if (typeof address.zipCode === "number") {
5      // Note: as a convenience, it will apply a patch you return.
6      return { zipCode: address.zipCode.toString() };
7    }
8  },
9});
10
```

#### Inserting documents based on some state

Let's say you're changing user preferences from being an object in the users schema to its own document - you might consider doing this as preferences grows to be a lot of options, or to avoid accidentally returning preference data to clients for queries that return users.
You can walk the users table and insert into another table:

```ts
1export const changePreferencesToDocument = migrations.define({
2  table: "users",
3  migrateOne: async (ctx, user) => {
4    const prefs = await ctx.db
5      .query("preferences")
6      .withIndex("userId", (q) => q.eq("userId", user._id))
7      .first();
8    if (!prefs) {
9      await ctx.db.insert("preferences", user.preferences);
10      await ctx.db.patch(user._id, { preferences: undefined });
11    }
12  },
13});
14
```

You'd want to also have code that is adding perferences documents by default for new users, so the migration is only responsible for older users. You'd also update your code to first check the user for preferences, and if it's unset, fetch it from the table. Later, once you're confident there are preferences for all users, remove the preferences object from the users schema, and the code can just read preferences from the table.

#### Deleting documents based on some state

If you had a bug where you didn't delete related documents correctely, you might
want to clean up documents based on the existence of another document.
For example, one gotcha with vector databases is forgetting to delete embedding documents linked to chunks of documents that have been deleted.
When you do a vector search, you'd get results that no longer exist.
To delete the related documents you could do:

```ts
1export const deleteOrphanedEmbeddings = migrations.define({
2  table: "embeddings",
3  migrateOne: async (ctx, doc) => {
4    const chunk = await ctx.db
5      .query("chunks")
6      .withIndex("embeddingId", (q) => q.eq("embeddingId", doc._id))
7      .first();
8    if (!chunk) {
9      await ctx.db.delete(doc._id);
10    }
11  },
12});
13
```

### Defining your own migrations

How would you do this without the `migration` component? The rest of this post is here if you want to know how to build some of this yourself. If you're happy with the component, you can stop reading here.

If your table is small enough (let’s say a few thousand rows, as a guideline), you could just do it all in one mutation. For example:

```jsx
1export const doMigration = internalMutation(async ({ db }) => {
2  const teams = await db.query("teams").collect();
3  for (const team of teams) {
4    // modify the team and write it back to the db here
5  }
6});
7
```

This would define the `doMigration` mutation, which you could run from the dashboard or via [`npx convex run`](https://docs.convex.dev/cli#run-convex-functions).

#### Big tables

For larger tables, reading the whole table becomes impossible. Even with smaller tables, if there are a lot of active writes happening to the table, you might want to break the work into smaller chunks to avoid conflicts. Convex will automatically retry failed mutations up to a limit, and mutations don’t block queries, but it’s still best to avoid scenarios that make them likely.

There are a few ways you could break up the work. For the component, I use [pagination](https://docs.convex.dev/database/pagination).
Each mutation will only operate on a batch of documents and keep track of how far it got, so the next worker can efficiently pick up the next batch. One nice benefit of this is you can keep track of your progress, and if it fails on some batch of data, you can keep track of the cursor it started with and restart the migration at that batch.
Thanks to Convex’s [transactional guarantees](https://docs.convex.dev/database/advanced/occ), either all of the batch or none of the batch’s writes will have committed. A mutation that works with a page of data might look like this:

```jsx
1export const myMigrationBatch = internalMutation(
2  async ({ db }, { cursor, numItems }) => {
3    const data = await db.query("mytable").paginate({ cursor, numItems });
4    const { page, isDone, continueCursor } = data;
5    for (const doc of page) {
6      // modify doc
7    }
8    return { cursor: continueCursor, isDone };
9  },
10);
11
```

#### Running a batch

To try out your migration, you might try running it on one chunk of data via the CLI or by going to the functions panel on [the dashboard](https://docs.convex.dev/dashboard/deployments/functions#running-functions) and clicking “Run function.” To run from the beginning of the table, you’d pass as an argument:

`{ cursor: null, numItems: 1 }`

On the CLI it would be:

```sh
1npx convex run mutations:myMigrationBatch '{ "cursor": null, "numItems": 1 }'
2
```

It would then run and return the next cursor (and print it to the console so you can look back if you lose track of it). To run the next batch, just update the parameter to the cursor string instead of `null`.

You could keep running it from here, but it might start to feel tedious. Once you have confidence in the code and batch size, you can start running the rest. You can even pass in the cursor you got from testing on the dashboard to skip the documents you’ve already processed ☝️.

#### Looping batches from an action

To iterate through chunks, you can call it from an action in a loop:

```jsx
1export const runMigration = internalAction(
2  async ({ runMutation }, { name, cursor, batchSize }) => {
3    let isDone = false;
4    while (!isDone) {
5      const args = { cursor, numItems: batchSize };
6      ({ isDone, cursor } = await runMutation(name, args));
7    }
8  },
9);
10
```

You can then go to the dashboard page for the `runMigration` function and test run the mutation with the arguments `{ name: "myMigrationBatch", cursor: null, batchSize: 1 }`

Here `"myMigrationBatch"` is whatever your mutation’s path is, e.g. if it’s in the file `convex/migrations/someMigration.js`, it would be `"migrations/someMigration:myMigrationBatch"`.

To use the CLI, you could run:

```sh
1npx convex run migrations:runMigration '{ "name": "myMigrationBatch", "cursor": null, "batchSize": 1 }'
2
```

It is also possible to loop from a client, such as [the `ConvexHttpClient`](https://docs.convex.dev/api/classes/browser.ConvexHttpClient), if you make it a public mutation. You could also recursively schedule a mutation to run, as an exercise left to the reader.

#### Batching via recursive scheduling

In the component, we use recursive scheduling for batches. A mutation keeps scheduling itself until the pagination is done.

```ts
1export const myMigrationBatch = internalMutation({
2  args: { cursor: v.union(v.string(), v.null()), numItems: v.number() },
3  handler: async (ctx, args) => {
4    const data = await ctx.db.query("mytable").paginate(args);
5    const { page, isDone, continueCursor } = data;
6    for (const doc of page) {
7      // modify doc
8    }
9    if (!isDone) await ctx.scheduler.runAfter(0, internal.example.myMigrationBatch, {
10      cursor: continueCursor,
11      numItems: args.numItems,
12    });
13  }
14);
15
```

#### An aside on serial vs. parallelizing

You might be wondering whether we should be doing all of this in parallel. I’d urge you to start doing it serially, and only add parallelization gradually if it’s actually too slow. As a general principle with backend systems, avoid sending big bursts of traffic when possible. Even without causing explicit failures, it could affect latencies for user requests if you flood the database with too much traffic at once. This is a different mindset from an analytics database where you’d optimize for throughput. I think you’ll be surprised how fast a serial approach works in most cases.

## Summary

In this post, we looked at a strategy for migrating data in Convex using mutation functions. As with other posts, the magic is in composing functions and leveraging the fact that you get to write javascript or typescript rather than divining the right SQL incantation.
[Docs for the component are here](https://www.convex.dev/components/migrations),
and code for the component is available [on GitHub](https://github.com/get-convex/migrations). If you have any questions don’t hesitate to reach out in [Discord](https://convex.dev/community).

[get-convex/ **migrations**\\
\\
![GitHub logo](https://stack.convex.dev/logos/github.svg)](https://github.com/get-convex/migrations)

### Footnotes

1. Technically, there are some restrictions on Convex values, such as array lengths and object key names that you can read about [here](https://docs.convex.dev/production/state/limits). [↩](https://stack.convex.dev/migrating-data-with-mutations#user-content-fnref-1)


Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started