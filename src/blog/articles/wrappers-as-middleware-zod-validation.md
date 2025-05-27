# Zod Validation: Wrappers as “Middleware”

![Ian Macartney's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F077753b63476b77fb111ba06d1bb538517033a54-3500x3500.jpg&w=3840&q=75)

[Ian Macartney](https://stack.convex.dev/author/ian-macartney)

2 years ago

# Zod Validation: Wrappers as “Middleware”

Loading...

![Convex loves zod](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F8e2010604289193a42bdd00ec1a48d7f0d746d27-1200x628.jpg&w=3840&q=75)

Following up on the previous post on using `withUser` to add authentication context to your [Convex functions](https://docs.convex.dev/using/writing-convex-functions), now let’s look at adding function validation using a popular npm package `zod`. Check out the code in action in the [convex-demos](https://github.com/get-convex/convex-demos/tree/main/zod-validation-ts) repo.

Function validation is important for a production app, because you can’t always control which clients are talking to your server. Consider the following code from [our tutorial](https://github.com/get-convex/convex-demos/blob/main/tutorial/convex/sendMessage.js):

```js
1// convex/sendMessage.js
2export default mutation(async ({ db }, { body, author }) => {
3  const message = { body, author };
4  await db.insert("messages", message);
5});
6
```

This code runs in the server, and stores a message in the “messages” table. That’s great, assuming the client sends data in the right format. Most of the time, that will be the case. If you use typescript, we’ll even warn you in your frontend React code when the parameters to your server function are the wrong type. See what this looks like in our [typescript demo](https://github.com/get-convex/convex-demos/blob/main/typescript/convex/sendMessage.ts):

```ts
1// convex/sendMessage.ts
2export default mutation(
3  async ({ db }, { body, author }: { body: string; author: string }) => {
4    const message = { body, author };
5    await db.insert("messages", message);
6  }
7);
8
```

However, a friendly internet stranger might connect to your backend and send any number of things: wrong types, binary data, nested objects, etc.. Typescript doesn’t enforce types at runtime, it only helps you with static analysis. What does that mean? While Typescript can help catch developer errors where you’re using types incorrectly in code, once the application is running the Typescript types aren’t being enforced by the runtime. For serverless applications that have unauthenticated endpoints, you need to be especially defensive with your function arguments, since a fake client could connect to your backend and pass whatever arguments it wants. Just declaring the type of `body` to be `string` doesn’t make it so. So what can we do?

## Using Convex input validation

Update: At the original time of this post, we didn't have input validation as part of Convex.
With 0.13.0 and later, however, you can add input validation like this:

```js
1export default mutation({
2  args: {
3    body: v.string(),
4    author: v.string(),
5  },
6  handler: async ({ db }, { body, author }) => {
7    const message = { body, author };
8    await db.insert("messages", message);
9  }
10});
11
```

And it'll validate the types of the arguments! Keep reading to learn how to use Zod to do even more validation, for instance validating string lengths or things our syntax doesn't support (yet).

## Using `withZod` for input validation

Using the popular `zod` library, we can define the types that we expect for our function. When it gets invoked, the inputs will be validated. To make this convenient, I’ve written a `withZod` wrapper so you can type your function arguments, and not have to worry about validating the first `{ db, ... }` argument, which is provided by the query, mutation, or action. So now your code looks like this:

```tsx
1export default mutation(
2  withZod({
3    args: {
4	  body: z.string(),
5	  author: z.string(),
6	},
7    handler: async ({ db }, { body, author }) => {
8      const message = { body, author };
9      return await db.insert("messages", message);
10    }
11  })
12);
13
```

Note: For a typescript version of everything in this post, you can look [here](https://github.com/get-convex/convex-helpers/blob/npm/0.1.1/convex/lib/withZod.ts). In there are also various helpers for combining with `query`, `mutation`, and `action`, as well as helpers for if you want to pass in a whole custom zod function rather than just the arguments and return type.

#### Aside: the above is already valid typescript!

By leveraging zod to give us validation, it is also giving us the types of our parameters. So we can avoid duplicating that definition, while still getting type hints, both in the server code **and in the client**. Convex has always had canonical end-to-end typing: from your data model definition to the client, it’s all in typescript. Now, the typescript types for your functions are generated from your validator, so your code is safe by default!

#### zId Helper

You’ll note above we used `zId`. This is a helper, meant to resemble `s.id("messages")` in [your `schema.ts` file](https://docs.convex.dev/database/schemas), but for zod. Feel free to make any other helpers you’d like and share them with us [in Discord](https://convex.dev/community).

```jsx
1export const zId = (tableName: TableName) =>
2  z.custom((val) => val instanceof Id && val.tableName === tableName);
3
```

## Implementing withZod

For those curious, or who want to copy and extend this pattern, this is what we are doing under the hood:

```jsx
1export const withZod = ({ args, handler }) => {
2  const zodType = z.function(z.tuple([z.object(args)]));
3  return (ctx, args) => {
4    const innerFunc = (validatedArgs: z.output<z.ZodObject<Args>>) =>
5      handler(ctx, validatedArgs);
6
7    return zodType.implement(innerFunc)(args);
8  };
9};
10
```

We are using a `z.function` and passing in the untrusted arguments, while just passing through the `ctx` argument.

Note: For a typescript version, go [here](https://github.com/get-convex/convex-helpers/blob/npm/0.1.1/convex/lib/withZod.ts).

## Combining with other wrappers

As with our previous post, you can combine it with other wrappers or one of the [Convex function](https://docs.convex.dev/using/writing-convex-functions) generators to reduce duplicate code, and reduce the indentation of your function definition:

```jsx
1const mutationWithZod = ({ args, handler }) => mutation(withZod({ args, handler }));
2
```

```tsx
1export default mutationWithZod({
2  args: {
3    body: z.string(),
4	author: z.string(),
5  },
6  handler: async ({ db }, { body, author }) => {
7    const message = { body, author };
8    return await db.insert("messages", message);
9  },
10});
11
```

See [here](https://github.com/get-convex/convex-helpers/blob/npm/0.1.1/convex/lib/withZod.ts) for implementations of this and others in typescript.

### Zod without withZod 🤯:

You can do all this yourself, without our fancy `withZod` wrapper, by putting your application code inside an `implements` or `strictImplements` definition for a [zod function](https://zod.dev/?id=functions).

```tsx
1export default mutation(async ({ db }, { body, author }) => {
2  return z
3    .function()
4    .args([z.object({body: z.string(), author: z.string()})])
5    .returns(z.promise(z.object({ _id: zId("messages") })))
6    .implement(async ({ body, author }) => {
7      const message = { body, author };
8      const id = await db.insert("messages", message);
9
10      return (await db.get(id))!;
11    })({ body, author });
12});
13
```

## In summary

In this post, we looked at a way to add type validation to [Convex functions](https://docs.convex.dev/using/writing-convex-functions) by using the [`zod` npm](https://www.npmjs.com/package/zod) package. You can grab the library code from [here](https://github.com/get-convex/convex-helpers/blob/npm/0.1.1/convex/lib/withZod.ts), or play around with a demo app [here](https://github.com/get-convex/convex-demos/tree/main/zod-validation-ts)! As always, let us know in [our Discord](https://convex.dev/community) what you think!

Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started