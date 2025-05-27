# Testing Your App: How to Generate Fake Data

![Nicolas Ettlin's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F1ac93a575829f65dcb9deec8565971180ec23b1b-306x306.jpg&w=3840&q=75)

[Nicolas Ettlin](https://stack.convex.dev/author/nicolas-ettlin)

2 years ago

# Testing Your App: How to Generate Fake Data

![A code block showing how to generate fake data using Faker. Robot hands typing on a keyboard are visible in the background.](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F9d077858474cdc6da1f39216e5f952d4193cb578-1558x876.png&w=3840&q=75)

Are you setting up a new development environment and would like to fill it with sample data instead of it being empty? Or perhaps you want to make sure that your UI looks good when you have more than a few rows in your database?

You could create many rows by yourself, but it is tedious if you want good-looking and numerous results. In this article, we’re going to discover a much better way to seed your database with sample data.

## Install Faker

We’re going to use a library called [Faker](https://fakerjs.dev/). It provides helpful functions to generate realistic values in large quantities.

Before we begin, make sure you have a Convex project set up on your machine. If you don't have one already, you can create one using the [Quickstart guide](https://docs.convex.dev/quickstarts).

Then, install Faker using the following command:

```bash
1npm install @faker-js/faker
2
```

## Create an Internal Mutation

I will start by creating a new mutation in my Convex app by writing the following code in a file named `convex/users.ts`:

```typescript
1import { internalMutation } from "./_generated/server";
2
3export const createFake = internalMutation(async (ctx) => {
4  // …
5});
6
```

Marking the mutation as internal ensures that users of my app can’t call it. I will still be able to call it myself from the dashboard or [the Convex command-line tool](https://docs.convex.dev/cli#run-convex-function).

## Insert Fake Data

Now, we’re ready to start inserting data. You can consult the [Faker documentation](https://fakerjs.dev/api/) to know which data types it can generate:

![The Faker documentation.](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Fd0905e01d05b33fcc1dda0f8350d644ea0691e9d-2626x1978.png%3Fw%3D1400&w=3840&q=75)The Faker documentation.

For my project, I need a list of users that each have a name, a company, and an avatar. I will use the corresponding types to create 200 new users:

```typescript
1import { faker } from '@faker-js/faker';
2import { internalMutation } from "./_generated/server";
3
4export const createFake = internalMutation(async (ctx) => {
5  // Initialize Faker with a random value
6  faker.seed();
7
8  for (let i = 0; i < 200; i++) {
9    await ctx.db.insert("users", {
10      name: faker.person.fullName(),
11      company: faker.company.name(),
12      avatar: faker.image.avatar(),
13    });
14  }
15});
16
```

In the beginning of the function, we call `faker.seed()` so that Faker generates different data each time we call our function. We need it because Faker initializes its random number generator statically. When using Convex, this will happen every time you push new code, not every time you call a function.

Now that we’ve written our function, we can run it using `npx convex run` in the command line. You can also run it [from the Convex dashboard](https://docs.convex.dev/dashboard/deployments/functions#running-functions) instead.

```
1npx convex run users:createFake
2
```

When opening my `users` table [in the Convex dashboard](https://docs.convex.dev/dashboard/deployments/data), I can see that I’ve successfully created 200 new users:

![My fake users in the dashboard.](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F7b481bcc5fdb38b5e2bfd4a5310711081b3e66c7-3246x1744.png%3Fw%3D1400&w=3840&q=75)My fake users in the dashboard.

And when opening my app, I can see that not only do I see all my fake users, but also that they all have avatars!

![The new users in my sample app.](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Fc88cf6d5486033191c9be6aba3017901ae951a16-2538x1564.png%3Fw%3D1400&w=3840&q=75)The new users in my sample app.

## Summary

We’ve seen how to create fake data using the Faker library and use it to create rows in the Convex database. To learn more advanced ways to generate fake data, you can read [the Faker documentation](https://fakerjs.dev/api/).

Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started

We use third-party cookies to understand how people interact with our site.

See our [Privacy Policy](https://www.convex.dev/legal/privacy/) to learn more.

DeclineAccept