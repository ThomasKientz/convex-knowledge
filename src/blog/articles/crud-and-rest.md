# CRUD APIs: Functional, but Inefficient

![Jamie Turner's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Fee80addc4a0315dc3175c4a08f64f8bc294568bd-400x400.jpg&w=3840&q=75)

[Jamie Turner](https://stack.convex.dev/author/jamwt)

8 months ago

# CRUD APIs: Functional, but Inefficient

![icons representing create, read, update and delete](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F50ad713417ea8dd9e85f2d9ee77ac634329a6414-1452x956.png&w=3840&q=75)

## Implementing basic CRUD endpoints

The term CRUD, or CRUD API, is often tossed around when interacting with databases or building backend APIs. This article will examine what CRUD is, what it’s suitable for, and its shortcomings. Finally, we’ll explore how to quickly implement a CRUD API using a modern backend like Convex.

## What is CRUD, and why should I care?

CRUD is a common and straightforward way to model API services by addressing data inside database tables as individual objects. Imagine our app has a `posts` table:

| Id | Body | Author |
| --- | --- | --- |
| 1 | I just went to the park today. | Jack |
| 2 | Careful! Don’t fall down the hill! | Jill |

To evolve this table data over time, there are four specific operations we need to perform on individual records.

#### **1\. Create a** new object

When a user adds a post, we’ll insert one into the table:

| Id | Body | Author |
| --- | --- | --- |
| 1 | I just went to the park today. | Jack |
| 2 | Careful! Don’t fall down the hill! | Jill |
| 3 | Hills are overrated | Gus |

#### 2\. Read an existing object

When someone wants to retrieve a post, typically, they’ll provide some unique information like the post ID. In this case, someone wants to see what Jack initially said:

| Id | Body | Author |
| --- | --- | --- |
| 1 | I just went to the park today. | Jack |
| 2 | Careful! Don’t fall down the hill! | Jill |
| 3 | Hills are overrated | Gus |

#### 3\. Update an object

At times, we’ll need to modify an object we already stored. We typically do this by providing a unique ID for a specific object and the new field data for that object. If Gus started to think more favorably of hills, we might see an update like this:

| Id | Body | Author |
| --- | --- | --- |
| 1 | I just went to the park today. | Jack |
| 2 | Careful! Don’t fall down the hill! | Jill |
| 3 | Hills are underrated | Gus |

#### 4\. Delete an object

Finally, sometimes, our app needs to take a post out of the table altogether. Perhaps after all this inane discourse about hills, Jill no longer cares if Jack or Gus falls down one. If so, she can choose to remove message 2:

| Id | Body | Author |
| --- | --- | --- |
| 1 | I just went to the park today. | Jack |
| ~~2~~ | ~~Careful! Don’t fall down the hill!~~ | ~~Jill~~ |
| 3 | Hills are underrated | Gus |

... becomes:

| Id | Body | Author |
| --- | --- | --- |
| 1 | I just went to the park today. | Jack |
| 3 | Hills are underrated | Gus |

This simple object model combined with these four operations ( **C** reate, **R** ead, **U** pdate, **D** elete) constitutes a flexible way to manage all table data. So, the acronym **CRUD** refers to this very approach to API design.

## Is this like REST?

REST is one common way to implement CRUD APIs over HTTP. REST combines the semantics of certain HTTP methods with resource paths to achieve the create, read, update, and delete CRUD operations.

Here’s how our previous scenario would be implemented with REST:

**1\. Creation** with REST involves using the `POST` HTTP method and providing the object contents in the request body. This generates a new object for the collection at the given resource path and returns the associated unique ID (in this case, as a JSON response):

```jsx
1Request:
2	POST /posts/
3	{"body": "Hills are overrated","author":"Gus"}
4Response (201 Created):
5  {"id":3}
6
```

The created entity now has an HTTP resource path associated with it. The path convention is the concatenation of the collection path and the unique ID as a child document—in this case, `/posts/3`.

**2\. Reading** an object with REST simply uses the `GET` method at the resource’s path:

```jsx
1Request:
2	GET /posts/1
3Response (200 OK):
4  {"id":1,"body": "I just went to the park today.","author":"Jack"}
5
```

**3\. Updating** an object with a REST API involves the `PUT` (or `PATCH` for partial updates) HTTP method. The body data of the request should contain the new object contents:

```jsx
1Request:
2	PUT /posts/3
3	{"body": "Hills are underrated","author":"Gus"}
4Response (200 OK)
5
```

**4.** Finally, **deleting** an object uses the HTTP `DELETE` method:

```jsx
1Request:
2  DELETE /posts/2
3Response (200 OK)
4
5// Later...
6Request:
7	GET /posts/2
8Response (404 Not found)
9
```

That’s it! Simple, right? And since CRUD maps so cleanly to the HTTP services we use everywhere, why use anything other than RESTful APIs to manage our backend data?

While that would be nice and simple, CRUD and REST have some significant limitations that require us to be pretty thoughtful about where we can and cannot use it. Let’s dive into them now.

## Common CRUD (and REST) pitfalls

#### Action-ness vs. object-ness

There are times when the thing you want to happen to your backend is—simply put—more of an arbitrary action than an addition or modification of persistent data. So if you find yourself doing strange convolutions to figure out which “object” should be `POST` ed to in order to kick off some side effect—perhaps a login or a call to a third-party API—CRUD just may not be the right fit for that task.

In fact, many teams find that when they try to wedge CRUD into this situation, they end up `POST` ing entries into a table that becomes a de-facto task/job queue. Now, they’ve accidentally created a need for some sort of asynchronous background work—even if a short blocking operation without any persisted records would have been adequate and simpler.

So, if your intuition says a particular backend call might not need to persist anything, avoiding CRUD is probably wise.

#### Grouped changes to objects

Instead of _no_ records needing to be written, at times your server endpoint needs to update (or insert) _two_ or more records atomically in one transaction. In this case, there is, again, no obvious single object to act as the target of your `PUT` or `POST`.

A CRUD/REST die-hard may argue that “restful” paths are abstract, logical objects, and so they don’t need to map 1:1 with a single database record. In practice, though, tracking how these logical objects map to backend data can be complex. It can also be messy to try to maintain cogent and sound implementations of the full set of create, read, update, and delete CRUD operations.

#### Request waterfalls

Request waterfalls occur when a server-provided parent object contains references to additional “child” objects. The application must then fetch each of those children, and possibly even _they_ contain further references that must be fetched. Each one of these iterations requires another request/response cycle between the app and the server API, which often takes hundreds of milliseconds. If your app does enough of these cycles, it can make your app appear sluggish to load and update—a frustrating experience for your users!

To mitigate this, a common optimization developers pursue is implementing a single server endpoint that recursively resolves the object reference hierarchy and then combines the whole tree of descendants into a single composite response. That way, the application gets everything it needs in one “round trip.”

It’s very difficult to use this strategy with simple CRUD. Since each endpoint returns a single object, request waterfalls occur naturally. Again, you can create composite objects that are logical views of combined data, but can you also `PUT` to them and `POST` to them? The CRUD paradigm breaks down.

#### Authorization without sufficient context

Consider that simple CRUD APIs propose changes to an object with little more parameterization than an object ID and the new fields. However, application authorization logic often needs more contextual information about the intent or environment of the requestor. Since CRUD is so specific about what information is necessary to read or change backend data, your backend lacks the flexibility it sometimes needs to authorize the operation securely.

### Our Advice: unless you _know_ simple CRUD is sufficient, prefer functions

Modern systems like [tRPC](https://trpc.io/) and Convex are converging on representing the boundary between the app and the backend modeled precisely the same way as every other interface in your app: with functions.

Functions are powerful enough to:

- Modify single objects
- Modify groups of objects transactionally
- Trigger a secure server action that persists no database state
- Resolve dependent reads into a single composite response
- Utilize rich authorization context for sophisticated permissions schemes

Basically, functions are the most potent building blocks of abstraction we have in programming languages. So don’t get too ideological about CRUD (or REST) for your APIs. When CRUD patterns feel awkward, try a simple functional/RPC-style API for that endpoint instead.

## Get some CRUD in your Convex

Now that we’ve explored the pros and cons of CRUD, here’s what a simple implementation would look like in a Convex backend:

```ts
1import { v } from "convex/values";
2import { partial } from "convex-helpers/validators";
3import schema from "./schema";
4import {
5  internalMutation,
6  internalQuery,
7} from "./_generated/server";
8
9const teamFields = schema.tables.teams.validator.fields;
10
11export const create = internalMutation({
12  args: teamFields,
13  handler: (ctx, args) => ctx.db.insert("teams", args),
14});
15
16export const read = internalQuery({
17  args: { id: v.id("teams") },
18  handler: (ctx, args) => ctx.db.get(args.id),
19});
20
21export const update = internalMutation({
22  args: {
23    id: v.id("teams"),
24    patch: v.object(partial(teamFields)),
25  },
26  handler: (ctx, args) => ctx.db.patch(args.id, args.patch),
27});
28
29export const delete_ = internalMutation({
30  args: { id: v.id("teams") },
31  handler: (ctx, args) => ctx.db.delete(args.id),
32});
33
```

You may have noticed this example only utilizes the `internal` variants of Convex’s query and mutation functions. Why? Because exposing this API essentially lets the entire internet arbitrarily change your tables. And they can do it without any record of who and why!

If you’d like to publicly expose some of these CRUD functions for your Convex tables, simply alter the above examples to use the standard `query` and `mutation` functions. But be cautious and think through the security implications! Even better, read on for an example of using row-level security (RLS) along with CRUD to expose a safe public API.

### Low-code CRUD

Sold on CRUD for some of your tables? Well, good news! [convex-helpers](https://github.com/get-convex/convex-helpers/tree/18cb4a193690d546caefaaac12cf29bdb7c3614c/packages/convex-helpers#crud-utilities) has a library to make exposing selected crud API methods dead simple. Here’s an example that wraps an app’s users table to expose a CRUD-style `read` query and `update` mutation:

```ts
1// in convex/users.ts
2import { crud } from "convex-helpers/server/crud";
3import schema from "./schema.js"
4
5export const { create, read, update, destroy } = crud(schema, "users");
6
```

Then, you can access these functions from actions elsewhere in your code with references like `internal.users.read`:

```ts
1// in some file
2export const myAction = action({
3  args: { userId: v.id("users") },
4  handler: async (ctx, args) => {
5
6    const user = await ctx.runQuery(internal.users.read, { id: args.userId });
7
8    // Do something interesting
9
10    await ctx.runMutation(internal.users.update, {
11      id: args.userId,
12      patch: { status: "approved" },
13    });
14
15  }
16});
17
```

To expose the CRUD API publicly, you can pass two more parameters to `crud`, allowing you to add access checks, as we’ll see next.

### CRUD with Row Level Security

To protect your CRUD API when exposing it publicly, you can use row-level security to check access rules when reading/updating data on a per-document granularity. For CRUD, this means we can define rules for how documents can be accessed and modified and then use those rules to protect the public API we expose. This leverages [“custom functions”](https://stack.convex.dev/custom-functions) in Convex, which let you create builders like `query`, `mutation`, or `action` that modify the `ctx` and `args`, similar to middleware. Here’s what this approach might look like in practice:

```ts
1import { crud } from "convex-helpers/server/crud";
2import { customCtx, customMutation, customQuery } from "convex-helpers/server/customFunctions";
3import { Rules, wrapDatabaseReader, wrapDatabaseWriter } from "convex-helpers/server/rowLevelSecurity";
4import { DataModel } from "./_generated/dataModel";
5import { mutation, query, QueryCtx } from "./_generated/server";
6import schema from "./schema";
7
8async function rlsRules(ctx: QueryCtx) {
9  const identity = await ctx.auth.getUserIdentity();
10  return {
11    users: {
12      read: async (_, user) => {
13        // Unauthenticated users can only read users over 18
14        if (!identity && user.age < 18) return false;
15        return true;
16      },
17      insert: async (_, user) => {
18        return true;
19      },
20      modify: async (_, user) => {
21        if (!identity)
22          throw new Error("Must be authenticated to modify a user");
23        // Users can only modify their own user
24        return user.tokenIdentifier === identity.tokenIdentifier;
25      },
26    },
27  } satisfies Rules<QueryCtx, DataModel>;
28}
29
30// makes a version of `query` that applies RLS rules
31const queryWithRLS = customQuery(
32  query,
33  customCtx(async (ctx) => ({
34    db: wrapDatabaseReader(ctx, ctx.db, await rlsRules(ctx)),
35  })),
36);
37
38// makes a version of `mutation` that applies RLS rules
39const mutationWithRLS = customMutation(
40  mutation,
41  customCtx(async (ctx) => ({
42    db: wrapDatabaseWriter(ctx, ctx.db, await rlsRules(ctx)),
43  })),
44);
45
46// exposing a CRUD interface for the users table.
47export const { create, read, update, destroy } = crud(
48  schema,
49  "users",
50  queryWithRLS,
51  mutationWithRLS,
52);
53
```

You can choose to only de-structure the functions that you need, so you can avoid exposing `destroy` altogether, for example.

Happy CRUDding!

Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started

We use third-party cookies to understand how people interact with our site.

See our [Privacy Policy](https://www.convex.dev/legal/privacy/) to learn more.

DeclineAccept