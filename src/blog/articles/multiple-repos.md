# Convex in Multiple Repositories

![Jordan Hunt's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F6480378f352a441db944914a8906cf2742c180e2-384x384.webp&w=3840&q=75)

[Jordan Hunt](https://stack.convex.dev/author/jordan-hunt)

8 months ago

# Convex in Multiple Repositories

![Image of a branch, referencing a github repository, next to a shield, which represents type safety.](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Fd026b8705a215f074777f31f952ada063ac0ffc6-1452x956.png&w=3840&q=75)

Have you ever wanted to use your Convex functions in a different repository than where you define them? with type-safety? Well.. look no further.

Convex recently released the ability to generate a TypeScript API specification from your function metadata, which enables this use-case. Some scenarios in which this would useful are collaborating with frontend developers or contractors in a separate repository, having multiple product surfaces (admin vs. main), and having client implementations in separate repositories.

Below, I will dive into an example of what this workflow could look like. To get started, you should install the “Convex Helpers” library using `npm install convex-helpers` and [define validators](https://docs.convex.dev/functions/validation) on all your Convex functions.

## Using Convex within multiple repositories

Previously, it was hard to use Convex functions in a type-safe way outside of the repository where your Convex functions are defined. Now, we provide you a way to generate a file similar to `convex/_generated/api.d.ts` that you can use in separate repositories.

### 1\. Generate an `api.ts` file

You can run:

```bash
1npx convex-helpers ts-api-spec
2
```

to generate a TypeScript API file for your Convex deployment. Below is an example of a Convex function definition and the corresponding API file. Your generated file will look something like the `api.ts` file below.

```tsx
1// api.ts (generated API file)
2import { FunctionReference, anyApi } from "convex/server";
3import { GenericId as Id } from "convex/values";
4
5export const api: PublicApiType = anyApi as unknown as PublicApiType;
6export const internal: InternalApiType = anyApi as unknown as InternalApiType;
7
8export type PublicApiType = {
9  messages: {
10    list: FunctionReference<
11      "query",
12      "public",
13      Record<string, never>,
14      Array<{
15        _creationTime: number;
16        _id: Id<"messages">;
17        author: string;
18        body: string;
19      }>
20    >;
21    send: FunctionReference<
22      "mutation",
23      "public",
24      { author: string; body: string },
25      null
26    >;
27  };
28};
29export type InternalApiType = {};
30
```

The types in this example come from a `convex/messages.ts` file like:

```tsx
1// convex/messages.ts (function definition)
2export const list = query({
3  args: {},
4  returns: v.array(
5    v.object({
6      body: v.string(),
7      author: v.string(),
8      _id: v.id("messages"),
9      _creationTime: v.number(),
10    }),
11  ),
12  handler: async (ctx) => {
13    return await ctx.db.query("messages").collect();
14  },
15});
16
17export const send = mutation({
18  args: { body: v.string(), author: v.string() },
19  returns: v.null(),
20  handler: async (ctx, { body, author }) => {
21    const message = { body, author };
22    await ctx.db.insert("messages", message);
23  },
24});
25
26
```

### 2\. Install Convex in a separate repository

Once you generate this file, you can use it in any other repository you want to use your Convex functions in. You must also install the Convex package in this other repository using

```bash
1npm install convex
2
```

The most common use-case for this is having your frontend code exist in a separate repository than the code for your Convex deployment.

### 3\. Connect to your backend from the separate repository

We must ensure that your frontend code is connecting to the correct Convex deployment. You can do this by setting your deployment URL as an environment variable when you create your Convex client. The example below is for React (Vite). See the [Quickstarts](https://docs.convex.dev/quickstarts) for details on how to configure clients for other frameworks.

```tsx
1import { StrictMode } from "react";
2import ReactDOM from "react-dom/client";
3import "./index.css";
4import App from "./App";
5import { ConvexProvider, ConvexReactClient } from "convex/react";
6
7const address = import.meta.env.VITE_CONVEX_URL as string;
8
9const convex = new ConvexReactClient(address);
10
11ReactDOM.createRoot(document.getElementById("root")!).render(
12  <StrictMode>
13    <ConvexProvider client={convex}>
14      <App />
15    </ConvexProvider>
16  </StrictMode>,
17);
18
```

### 4\. Use `api.ts` from the separate repository

Once you have this `api.ts` copied into another repository, you can use it with the Convex client to call any of the Convex functions with type safety. Below is an example `App.tsx` file that imports from the copied-over `api.ts` file.

```tsx
1// src/App.tsx
2import { FormEvent, useState } from "react";
3import { useMutation, useQuery } from "convex/react";
4// Note: we are importing from `../api` not `../convex/_generated/api`
5import { api } from "../api";
6
7export default function App() {
8  const messages = useQuery(api.messages.list) || [];
9
10  const [newMessageText, setNewMessageText] = useState("");
11  const sendMessage = useMutation(api.messages.send);
12
13  const [name] = useState(() => "User " + Math.floor(Math.random() * 10000));
14  async function handleSendMessage(event: FormEvent) {
15    event.preventDefault();
16    await sendMessage({ body: newMessageText, author: name });
17    setNewMessageText("");
18  }
19  return (
20    <main>
21      <h1>Convex Chat</h1>
22      <p className="badge">
23        <span>{name}</span>
24      </p>
25      <ul>
26        {messages.map((message) => (
27          <li key={message._id}>
28            <span>{message.author}:</span>
29            <span>{message.body}</span>
30            <span>{new Date(message._creationTime).toLocaleTimeString()}</span>
31          </li>
32        ))}
33      </ul>
34      <form onSubmit={handleSendMessage}>
35        <input
36          value={newMessageText}
37          onChange={(event) => setNewMessageText(event.target.value)}
38          placeholder="Write a message…"
39        />
40        <input type="submit" value="Send" disabled={!newMessageText} />
41      </form>
42    </main>
43  );
44}
45
```

Now your frontend code is talking to your backend in a separate repository!

### Notes

- Argument and return value validators are not required, but the generated specs will only be as good as the validators provided. Convex validators (things like `v.string()`) are how Convex provides both runtime validation and provides typesafe APIs to clients. For this API generation to work the best, you’ll want to define both `args` and `returns` validators to provide the types.
- When you update your Convex backend and want to use the updated functions, you’ll need to re-generate the `api.ts` file. We suggest making this process part of your deployment workflow.

Check out the docs [here](https://docs.convex.dev/production/multiple-repos). I am excited to see what you build with this new functionality!

Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started

We use third-party cookies to understand how people interact with our site.

See our [Privacy Policy](https://www.convex.dev/legal/privacy/) to learn more.

DeclineAccept