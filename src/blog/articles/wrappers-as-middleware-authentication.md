# Authentication: Wrappers as “Middleware”

![Ian Macartney's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F077753b63476b77fb111ba06d1bb538517033a54-3500x3500.jpg&w=3840&q=75)

[Ian Macartney](https://stack.convex.dev/author/ian-macartney)

2 years ago

# Authentication: Wrappers as “Middleware”

Exciting news! There is an easier way to customize your queries, mutations, and actions. Check out [this post](https://stack.convex.dev/custom-functions) to see how to use `customFunction` helpers from the `convex-helpers` npm package.

![Layers. Photo by Hasan Almasi: @hasanalmasi on Unsplash](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F656924fff89ee5c82694a382bac01d90d5f804a8-5184x3456.jpg&w=3840&q=75)

In this post, I’ll introduce a pattern that, like middleware, can add functionality before or after a request but is explicit and granular, unlike middleware. This is the first of a series of posts on pseudo-middleware patterns to help structure your Convex code. Let us know in Discord what else you want to see! If you want to see a typescript version of the code, you can reference it [here](https://github.com/get-convex/convex-helpers/blob/main/convex/lib/withUser.ts).

## The problem

[Setting up auth](https://docs.convex.dev/using/auth) in Convex is easy. However, the resulting code can end up cluttering your functions if you aren’t careful. Consider our [auth demo’s](https://github.com/get-convex/convex-demos/tree/main/users-and-auth) function to [send a message](https://github.com/get-convex/convex-demos/tree/main/users-and-auth/convex):

```tsx
1export default mutation(async ({ db, auth }, { body }) => {
2  const identity = await auth.getUserIdentity();
3  if (!identity) {
4    throw new Error("Unauthenticated call to mutation");
5  }
6  // Note: If you don't want to define an index right away, you can use
7  // db.query("users")
8  //  .filter(q => q.eq(q.field("tokenIdentifier"), identity.tokenIdentifier))
9  //  .unique();
10	const user = await db
11    .query("users")
12    .withIndex("by_token", q =>
13      q.eq("tokenIdentifier", identity.tokenIdentifier)
14    )
15    .unique();
16  if (!user) {
17    throw new Error("Unauthenticated call to mutation");
18  }
19
20  const message = { body, user: user._id };
21  await db.insert("messages", message);
22});
23
```

All of the endpoint logic is in the last few lines!

## The goal

We want to provide a `user` where we’d normally access the [`auth`](https://docs.convex.dev/api/interfaces/server.Auth) object.

```tsx
1export default mutation(
2  withUser(async ({ db, user }, { body }) => {
3    const message = { body, user: user._id };
4    await db.insert("messages", message);
5  })
6);
7
```

## The `withUser` solution

Our wrapper function, provided below, may look a little complicated, so let’s talk about what it’s doing. Like `mutation` and `query`, `withUser`'s only argument is a function. However, this function wants to be called with the `user` populated in the first parameter. So you can see in the call `func({ ...ctx, user }, args)`, we are passing in the user that we looked up. Popping out a layer, `withUser` itself returns an async function that can be passed to `query` or `mutation`. So we define an inline async function that, given the normal `ctx` and arguments, will call the passed-in function `func` with the same arguments and the first parameter augmented. If this bends your brain, you’re not alone. Feel free to copy-paste. And for those nervous about how you’d type this in typescript, don’t worry. You can copy it from [here](https://github.com/get-convex/fast5/blob/main/convex/lib/withUser.ts).

```tsx
1/**
2 * Wrapper for Convex query or mutation functions that provides a user.
3 *
4 * @param - func Your function that can now take in a `user` in the ctx.
5 * @returns A function to be passed to `query` or `mutation`.
6 */
7export const withUser = (func) => {
8  return async (ctx, ...args) => {
9    const identity = await ctx.auth.getUserIdentity();
10    if (!identity) {
11      throw new Error(
12        'Unauthenticated call to a function requiring authentication'
13      );
14    }
15    // Note: If you don't want to define an index right away, you can use
16    // db.query("users")
17    //  .filter(q => q.eq(q.field("tokenIdentifier"), identity.tokenIdentifier))
18    //  .unique();
19    const user = await ctx.db
20      .query('users')
21      .withIndex('by_token', (q) =>
22        q.eq('tokenIdentifier', identity.tokenIdentifier)
23      )
24      .unique();
25    if (!user) throw new Error('User not found');
26    return await func({ ...ctx, user }, ...args);
27  };
28};
29
```

### Why extend the first argument with new parameters?

In python, the language I’ve worked with this pattern the most, the common practice for wrapper functions is to pass new parameters as the new first arguments to a wrapped function. However, for Convex we can leverage the fact that the first argument to functions is always [`ctx`](https://docs.convex.dev/generated-api/server#queryctx), and extending it comes with some great ergonomics. Using the fact that it’s an object, we can:

- Flexibly add middleware-like parameters while maintaining the aesthetic of positional arguments matching the positional arguments on the client.
- Add more wrappers in the future without having to keep track of which order the injected parameters are in, or knowing how many parameters they inject.
- Use a middleware wrapper without using its provided value(s).

## Codifying patterns

Those familiar with factories, decorators, or middleware will recognize this pattern. Rather than requiring every user to repeat the same lines of code at the start or end of a function, you can codify that pattern into a function. Beyond saving some time, leveraging patterns like this helps:

- Keep your code [DRY](https://en.wikipedia.org/wiki/Don%27t_repeat_yourself).
- Increase the density of meaningful code.
- Organize code by logical function. See [aspect-oriented programming](https://en.wikipedia.org/wiki/Aspect-oriented_programming) for an extreme perspective on this.
- Give the code reviewer shortcuts.

I’ll expand on this last point. By noticing that it’s using the `withUser` helper, a reviewer can rest assured that this function will only be executed with a logged-in user. This becomes a more powerful reassurance when you compose these functions, such as `withTeamAdmin`, which we’ll see below.

## Composing functions

The exciting part of using this sort of pattern is that it’s easy to compose it with other functions. In a simple example, we can combine `mutation` and `withUser` like so:

```tsx
1export const mutationWithUser = (func) => {
2  return mutation(withUser(func));
3};
4
```

This has the ergonomic benefit of decreasing the indentation level of your function, if you use [prettier](https://prettier.io/). However, you can imagine much more interesting compositions, like:

```tsx
1export const withTeamAdmin = (func) => {
2  return withUser(withTeam(async (ctx, args) => {
3    const {user, team} = ctx;
4    const admin = await getTeamAdmin(user, team);
5    if (!admin) throw new Error('User is not an admin for this team.')
6    return await func({...ctx, admin}, args)
7  }));
8}
9
10export const setTeamName = mutation(
11  withTeamAdmin(async ({ db, team, admin }, { name }) => {
12    console.log(`${admin.name} is changing team name`);
13    await db.patch(team._id, {name});
14  });
15);
16
```

## Why wrap at all?

You might be thinking to yourself that this is a lot of indirection for what could be a series of regular functions. Indeed, this pattern can introduce complexity for someone looking at the code for the first time. Where did the `user` arg come from? Why is my stack trace full of `withX` calls? Sometimes, it is clearer and less surprising to call regular functions. Here are some **scenarios when wrapping is useful**:

- You want to control what the function returns.
- You want to do work before and after the function, such as opening and closing a file.
- You need to clean up if the called function throws an exception.
- Misusing a function (such as forgetting to await it or handle its response correctly) would have serious implications.
- You want to compose your behavior with the above scenarios consistently.
- You will reuse these wrappers frequently.

## Wrapping up

Using wrapper functions like `withUser` can help you organize your code into middleware-like blocks that you can compose to keep your function logic concise. A typescript version of the code is [here](https://github.com/get-convex/convex-helpers/blob/npm/0.1.1/convex/lib/withUser.ts), and used by [Fast5](https://fast5.live/) [here](https://github.com/get-convex/fast5/blob/main/convex/lib/withUser.ts). Let us know in [Discord](https://discord.com/channels/1019350475847499849/1066114385543692338) what you think and what you’d like to see next!

Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started

We use third-party cookies to understand how people interact with our site.

See our [Privacy Policy](https://www.convex.dev/legal/privacy/) to learn more.

DeclineAccept