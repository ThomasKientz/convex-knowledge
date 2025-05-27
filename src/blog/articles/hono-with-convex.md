# Advanced HTTP Endpoints: Convex ❤️ Hono

![Sarah Shader's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F7047febd1fcf4e4b44d4da9f199c07d842acf23b-1365x1418.jpg&w=3840&q=75)

[Sarah Shader](https://stack.convex.dev/author/sarah-shader)

2 years ago

# Advanced HTTP Endpoints: Convex ❤️ Hono

![Defining a Hono endpoint in Convex](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F0e1e94b7f6b4c6abd8d45624cfefb0a293210c88-2037x1404.png&w=3840&q=75)

[Convex](https://convex.dev/) supports [HTTP actions](https://docs.convex.dev/functions/http-actions), meaning your backend can receive requests not only from Convex clients, such as the [ConvexReactClient](https://docs.convex.dev/using/project-setup#configure-the-convex-client), but also from third-party webhooks and other clients that want to communicate with a custom HTTP API.

Currently, these endpoints have a simple router. In this post, we’ll look at how to add more advanced features, such as:

- Dynamic routes or slug routes — e.g. `users/:userId`
- Middleware — e.g. check auth on all routes under `/api/*` or implementing CORS
- Helpers for validating an incoming Request’s query params or body
- Helpers for formatting a JSON response or text response
- Custom 404 (Not Found) responses

While it’s possible to build these yourself on top of Convex primitives, existing JS libraries already do a great job at this. In this post, we’re going to go through how you can leverage [Hono](https://hono.dev/) with Convex [HTTP actions](https://docs.convex.dev/functions/http-actions). To see the implementation, check out [`hono.ts`](https://github.com/get-convex/convex-helpers/blob/main/packages/convex-helpers/server/hono.ts) in the [convex-helpers package](https://www.npmjs.com/package/convex-helpers#hono-for-advanced-http-endpoint-definitions). We’ll also look more generally at how to extend Convex HTTP endpoint behavior.

Note: you don’t need to use TypeScript, but I will use it in my examples because both Hono and Convex offer slick TypeScript support!

## Using Hono with Convex

To use Hono, you’ll need to:

1. `npm install hono convex-helpers` in your project.
2. In `convex/http.ts`, import `Hono`, `HonoWithConvex`, `HttpRouterWithHono`, and `ActionCtx` [1](https://stack.convex.dev/hono-with-convex#user-content-fn-1):

```ts
1import { Hono } from "hono";
2import { HonoWithConvex, HttpRouterWithHono } from "convex-helpers/server/hono";
3import { ActionCtx } from "./_generated/server";
4
5const app: HonoWithConvex<ActionCtx> = new Hono();
6
7// Add your routes to `app`. See below
8
9export default new HttpRouterWithHono(app);
10
```

The `HonoWithConvex` is just a type that tells Hono to expect the Convex [`ActionCtx`](https://docs.convex.dev/generated-api/server#actionctx) as its [env](https://hono.dev/api/context#env) binding. `HttpRouterWithHono` does the magic to connect Hono routes to Convex HTTP actions.

Let’s look at a few ways to use Hono:

### Slug routing and response formatting

For illustration, we’ll implement an endpoint from the [Convex demo for HTTP action](https://github.com/get-convex/convex-demos/tree/main/http) to use Hono. Here’s an example handler showcasing several of Hono’s features:

```ts
1// Routing with slugs
2app.get("/listMessages/:userId{[0-9]+}", async (c) => {
3  // Extracting a token from the URL!
4  const userId = c.req.param("userId");
5
6  // Running a Convex query
7  const messages = await c.env.runQuery(api.messages.getByAuthor, { authorNumber: userId });
8
9  // Helpers for pretty JSON!
10  c.pretty(true, 2);
11  return c.json(messages);
12});
13
```

…and an example response:

```bash
1$ curl https://happy-animal-123.convex.site/listMessages/123
2[\
3  {\
4    "_creationTime": 1677798437141.091,\
5    "_id": {\
6      "$id": "messages|lqMHm5kDS9m6fBsSnx5L2g"\
7    },\
8    "author": "User 123",\
9    "body": "Hello world"\
10  },\
11]
12
```

### Input validation

Here’s another handler with input validation:

```typescript
1import { z } from "zod";
2import { zValidator } from "@hono/zod-validator";
3
4app.post(
5  "/postMessage",
6  // Body validation!
7  zValidator(
8    "json",
9    z.object({
10      author: z.string().startsWith("User "),
11      body: z.string().max(100),
12    })
13  ),
14  async (c) => {
15    // With type safety!
16    const { body, author } = c.req.valid("json");
17    await c.env.runMutation(api.messages.send, { body, author });
18    return c.text("Sent message!");
19  }
20);
21
```

…and an example response:

```bash
1$ curl -d '{ "body": "Hello world", "author": "123" }'  https://happy-animal-123.convex.site/postMessage
2{
3  "success": false,
4  "error": {
5    "issues": [\
6      {\
7        "code": "invalid_string",\
8        "validation": {\
9          "startsWith": "User "\
10        },\
11        "message": "Invalid input: must start with \"User \"",\
12        "path": [\
13          "author"\
14        ]\
15      }\
16    ],
17    "name": "ZodError"
18  }
19}
20
```

### Middleware: Adding CORS

Another example, copying from [Hono docs](https://hono.dev/middleware/builtin/cors). This adds CORS support to the `/api/*` and `/api2/*` routes with different configurations.

```typescript
1import { cors } from 'hono/cors'
2...
3app.use('/api/*', cors())
4
5app.use(
6  '/api2/*',
7  cors({
8    origin: 'http://examplesite.com',
9    allowHeaders: ['X-Custom-Header', 'Upgrade-Insecure-Requests'],
10    allowMethods: ['POST', 'GET', 'OPTIONS'],
11    exposeHeaders: ['Content-Length', 'X-Kuma-Revision'],
12    maxAge: 600,
13    credentials: true,
14  })
15)
16
```

The `.use` function registers a handler for all `/api/*` requests. As we’ll see below, you can use this for a variety of situations, including logging.

### Custom 404 responses

To set up a custom 404, we can do:

```typescript
1// Custom 404
2app.notFound(c => {
3  return c.text("Oh no! Couldn't find a route for that", 404);
4});
5
```

See [https://hono.dev/](https://hono.dev/) for more features.

Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started

## Under the hood

Curious about how to extend Convex [HTTP actions](https://docs.convex.dev/functions/http-actions) for your own purposes? Read on!

### Extending routes using the `/` prefix

If the routing options aren’t flexible enough for your use case, you can handle all HTTP requests with a single `httpAction` and do complex routing there. For instance, instead of using `HttpRouterWithHono`, we could define a single route per HTTP method in `convex/http.ts`:

```typescript
1import { httpRouter, ROUTABLE_HTTP_METHODS } from "convex/server";
2import { httpAction } from "./_generated/server";
3import { HonoWithConvex } from "./lib/honoWithConvex";
4
5const app: HonoWithConvex = new Hono();
6
7// Add your routes to `app`.
8
9const http = httpRouter();
10for (const routableMethod of ROUTABLE_HTTP_METHODS) {
11	http.route({
12		pathPrefix: "/",
13		method: routableMethod,
14		handler: httpAction(async (ctx, request: Request) => {
15			return await app.fetch(request, ctx);
16		}),
17	})
18}
19export default http;
20
```

We could stop here — we can now use Hono and Convex together! But we could make a couple of additional improvements to leverage the [Convex dashboard](https://dashboard.convex.dev/).

### Using middleware to add per-route logging

Here’s what we see in the [Convex dashboard](https://dashboard.convex.dev/) under “Logs” given the approach of registering an `httpAction` per method:

![Logs showing GET /*](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F06c3e0c48a26da60a29a095e5c6f5e184d6ae2b0-1302x310.png%3Fw%3D700&w=3840&q=75)Logs showing GET /\*

All our GET requests will appear as `GET /*` even when we have multiple routes.

We can pretty easily get a little more information using one of Hono’s features — logging middleware:

```typescript
1import { logger } from "hono/logger";
2import stripAnsi from "strip-ansi";
3
4app.use(
5  "*",
6  logger((...args) => {
7    console.log(...args.map(stripAnsi));
8  })
9);
10
```

Now the [Convex dashboard](https://dashboard.convex.dev/) looks more like this:

![Logs with GET /listMessages/123](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Fe1ff98ab9fdcc7e5eee3b741eca5025b98c762e9-1350x524.png%3Fw%3D700&w=3840&q=75)Logs with GET /listMessages/123

Note: these say `0ms` because they’re running in [Convex’s deterministic environment that provides a different `Date.now()`](https://docs.convex.dev/understanding/convex-fundamentals/functions#determinism).

### Subclassing `HttpRouter` (the `HttpRouterWithHono` approach)

If we want the fullest integration with the [Convex dashboard](https://dashboard.convex.dev/), we’d like to see something like this under “Logs”, where we show the routed path:

![Logs showing GET /listMessages/:userId](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F212100c96760c3d1b86ec79a59ce3d5246a60ca3-1526x514.png%3Fw%3D700&w=3840&q=75)Logs showing GET /listMessages/:userId

And then see a corresponding entry with metrics under the “Functions” tab:

![Functions metrics for GET /listMesssages/:userId](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F9527a4a514b8fb6aa98023e27da58b90fbdede3b-970x922.png%3Fw%3D450&w=3840&q=75)Functions metrics for GET /listMesssages/:userId

The code needed for this behavior is in [`honoWithConvex.ts`](https://github.com/get-convex/convex-helpers/blob/main/convex/lib/honoWithConvex.ts).

**How does it work?**

`HttpRouterWithHono` is a subclass of the Convex [`HttpRouter`](https://docs.convex.dev/api/classes/server.HttpRouter) which overrides two special methods:

- `getRoutes` returns a list of `[path, method, handler]`, which we use to populate the Functions page on the dashboard.
- `lookup(path, method)` returns `[handler, path, method]`. Convex will run `handler` when responding to the request and use the `path` and `method` for metrics and logging (so this should match a path + method combo from `getRoutes`)
  - As an example, I wanted `lookup("/listMessages/123", "GET")` to return `"/listMessages/:userId{[0-9]+}"` for the path and `"GET"` for the method.

The implementation I added is not optimal (it loops through all the routes), but it still works! The Convex router is very flexible, so there are many options for configuring how your HTTP actions get routed and show up in the dashboard.

Now, we can use Convex with Hono and take advantage of most of the features provided in the Convex dashboard!

## Summary

In this post, we looked at how to use Hono with Convex, including how to extend Convex’s HTTP actions to add your own functionality. Let us know what you think in [our discord](https://convex.dev/community) and if you end up using Hono and Convex together! ❤️

### Footnotes

1. `HonoWithConvex` and `ActionCtx` are just being used for types. If you're using JavaScript, you can ignore that import and just initialize `app` as `const app = new Hono();` [↩](https://stack.convex.dev/hono-with-convex#user-content-fnref-1)


Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started