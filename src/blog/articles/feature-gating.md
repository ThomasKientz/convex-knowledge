# Launching Features Right on Time: Feature Gating

![Ian Macartney's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F077753b63476b77fb111ba06d1bb538517033a54-3500x3500.jpg&w=3840&q=75)

[Ian Macartney](https://stack.convex.dev/author/ian-macartney)

3 years ago

# Launching Features Right on Time: Feature Gating

![An iron gate](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F3f7bf8173d6e1188d3453af1fabff01aa7e934b9-2483x3386.jpg&w=3840&q=75)

Let’s talk about feature flags.

Have you ever wanted to launch a new feature at an exact time, and not just when some deployment finishes? Or made a mistake on a new feature and had to wait for a “hot fix” deploy to switch back to the old version? Wouldn’t it be great to roll out & roll back a feature with the flick of a switch? Today we’re going to talk about how to flip features on and off remotely using a clever use of the reactive nature of Convex queries. For those who don’t already know, Convex is a backend-as-a-service that allows you to write reactive queries and transactional mutations, all in typescript (or vanilla js if you prefer). Learn more at [docs.convex.dev](https://docs.convex.dev/).

## What is a feature flag?

A “feature flag” or “feature gate” or “kill switch” are all terms I’ve heard for similar functionality: deciding what _feature_ to show a user based on some configurable state, referred to here as a _flag_. Implementations differ slightly, but there will be some API to get the current value for a given flag so you can make decisions in the frontend and/or backend code.

There are companies like LaunchDarkly who have made this their whole business. At Dropbox, we rolled our own version. There is a lot of value in using an off-the-shelf solution, and a lot of advanced functionality that we won’t replicate here today. The goal today is to see how easy it is to provide a basic implementation. The basic feature set we are targeting is:

1. A feature can be enabled / disabled without re-deploying.
2. A client can get updates to the state without reloading the page.

## LaunchDarkly Integration

**Update:** We've released a turn-key integration for adding feature flags to your Convex application with LaunchDarkly. You can follow instructions to install it [here](https://www.convex.dev/components/launchdarkly). This articles still serves as a good reference for implementing your own solution for feature flagging in Convex.

## Safely adding a new feature

I’m going to be adding an interactive chat to the Convex homepage where there is currently just a static image:

![App screenshot](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F8ac3c2708ca4d01cc85a8c0c45aeb5c176fe9086-233x403.png%3Fw%3D300&w=3840&q=75)App screenshot

... into an interactive chat window:

![App screenshot](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F23afdc8526353caeaa106d7a5a3fd261ee9791c3-320x355.gif%3Fw%3D700&w=3840&q=75)App screenshot

This is the fourth panel in a component showing the code necessary to implement chat, so it seems only fair to see the code in action!

Here’s the React component that’s showing the fourth image:

```jsx
1<div className="...">
2  <Image
3    src="/tabsContent4.png"
4    width={210}
5    height={388}
6    alt="Image of messaging app"
7    loading="eager"
8  />
9</div>
10
```

What we want is to have some conditional like this:

```jsx
1<div className="...">
2  {showMessages ? (
3    <Messages />
4  ) : (
5    <Image
6      src="/tabsContent4.png"
7      width={210}
8      height={388}
9      alt="Image of messaging app"
10      loading="eager"
11    />
12  )}
13</div>
14
```

But how do we get the value of showMessages?

## Flags table

Let’s keep a table in our backend of what features are on & off, and have the website decide which to show based on that value. Our table in the Convex dashboard after `db.insert("flags", {key: "homepage_chat", value: true})` looks like this:

![Screenshot of the flags table](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Ff308d225e3233d8aafdee27f41c2d84256477ed8-559x266.png%3Fw%3D450&w=3840&q=75)Screenshot of the flags table

## Reading the value

To wire up the value to the frontend, we will use a server-side query to read the flag’s value. In Convex, we can do this by making a file in `convex/flags.ts` in our code repo like this:

```jsx
1export const get = query(async ({ db }, { flagName }) => {
2  const flag = await db
3    .query("flags")
4    .filter(q => q.eq(q.field("key"), flagName))
5    .first();
6  return flag?.value;
7});
8
```

Once we run `npx convex deploy`, this code will run in Convex’s servers. By using Convex, the return value will automatically be cached based on the function parameters, and the cache automatically invalidates when the flag value changes. Read more about this [here](https://docs.convex.dev/understanding/convex-fundamentals/functions#query-functions). This makes the lookup in the general case wicked fast, and avoids hammering the database. Caching is especially important if it’s a value every client would be fetching, which is the case for config values like this. Traditionally, you’d need to implement your own caching layer with something like Redis, and manually track the cache invalidation. With Convex, it happens by default!

To access it on the client, we just updated our code to:

```tsx
1const showMessages = useQuery(api.flags.get, { flagName: "homepage_chat" });
2
```

This React hook will return the flag’s value, and will trigger a refresh whenever the value changes. Under the hood it’s using a WebSocket that’s shared with any other Convex queries you might be subscribed to, so it’s not clogging the network with polling requests, and the changes are near-instantaneous!

## In action

To prove that it works in production:

![Enabling the feature in production](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Fbad730aad2fcacae636e8b7d1f1c87ad44704e6c-960x583.gif%3Fw%3D600&w=3840&q=75)Enabling the feature in production

## Default value

One edge case that off-the-shelf solutions provide, is supplying an initial value until you get the latest version from the server. For this, there’s a few strategies:

1. Show a loading indicator until you know what to show. This is a poor UX, but may be necessary when enabling the wrong feature could be catastrophic.
2. Supply a default in code to use until you get a server response. If you go with this approach for a new feature, the typical flow is to ship the code defaulting to “off”, and then once you’ve released the feature, change the default to “on,” to reduce re-rendering. In our code this looks like `useQuery(api.flags.get, { flagName: "homepage_chat" }) ?? DEFAULT` since Convex returns `undefined` until the first response comes in. This is my favorite, as it also serves as documentation to code readers about what the “canonical” value is at a given point in git history.
3. Supply a default based on a recent, but potentially stale state. For SSG, you might read the flag value when the page is being generated, and use that possibly-stale value as the default. For SSR, you could read the flag value when the page is being rendered, and provide that as the default value.
4. Store the last read default in the browser’s localStorage or similar. I like this one the least, since you still have to handle the initial visit default, and the staleness of the value is hard to reason about. If you return something more complex than a boolean, you might end up with a value that is no longer supported!

## Common pitfalls

While feature flagging is great, I can say from experience that if you don’t maintain some discipline, the code can get hard to reason about. In particular, watch out for these pitfalls:

1. Testing: Make sure your tests check all possible values, not just the default path.
2. Ownership: Every feature flag should have a point of contact who knows why it’s there, and when it can be removed.
3. Documentation: Related to ownership, documenting feature flags can be critical for an oncall rotation to know how to mitigate issues arising from your new feature. What is safe to change? How would I turn it off? I have even linked to feature flags from alerting systems, with instructions about how to turn off features in the case of overload, calling out the expected user impact.
4. Removal: For launching a new feature, you should add removing the feature flag as part of the feature release process. Once it’s been successfully rolled out and you have confidence in it, removing the code helps delete unused code, as well as make the codebase easier to reason about.

## Advanced features

As I mentioned before, there’s good reasons to use off-the-shelf feature flagging solutions. They’ve thought a lot about it, and help you avoid a lot of the above pitfalls, as well as provide rich features that we didn’t even discuss:

- Segmenting the user population. You might want to roll a feature out slowly, only show it to internal users, or A/B test different approaches.
- Metrics. Know how many users have seen a flag in a each state, who they are, and ensuring they’re consistently assigned the same state whenever possible.
- Fancy UIs to manage and audit feature flag changes. In our example we just manually toggled values in the database, which isn’t a very good idea for a production site! These are great places to add documentation and usage graphs.
- Offline caching, which is especially important for mobile clients.

… and the list goes on.

## In summary

![Silhouette of a man against a dark, cloudy sky](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F6f755c51e0130a3bf79ba0bda634fd4922aaee18-1985x1468.png%3Fw%3D450&w=3840&q=75)Silhouette of a man against a dark, cloudy sky

Today we made a slick, minimal feature gate for a new feature, allowing us to roll out on our own schedule, and roll back just as fast. Convex allowed us to achieve all of this without having to worry about caches, invalidation, polling, or triggering UI refreshes ourselves. I hope it’s been helpful! And of course, if you have any questions or need help building anything in Convex, please come visit us in [Discord](https://convex.dev/community).

Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started

We use third-party cookies to understand how people interact with our site.

See our [Privacy Policy](https://www.convex.dev/legal/privacy/) to learn more.

DeclineAccept