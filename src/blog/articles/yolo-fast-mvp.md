# YOLO: Get to an MVP fast

![Ian Macartney's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F077753b63476b77fb111ba06d1bb538517033a54-3500x3500.jpg&w=3840&q=75)

[Ian Macartney](https://stack.convex.dev/author/ian-macartney)

a year ago

# YOLO: Get to an MVP fast

![How to build quickly when starting a project: yolo](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F21415b0bd6a637a51a7172104b5e6ae2a7b7f04f-1452x956.png&w=3840&q=75)

Before you have shipped a product, don’t let “industry best practices” bog down your iteration speed. However, you also don’t want to paint yourself into a corner and have to immediately rewrite your app once things get real. Here are some ideas for how to move quickly early in the development lifecycle, without boxing yourself into irreversible patterns. This is one of a series of posts on operational maturity in production. Get more tips for best practices for running apps in production [here](https://stack.convex.dev/operational-maturity-for-production).

## Tips when starting out

#### Commit your code, especially when it’s working and before big changes

It’s very easy to lose time debugging when too many variables have changed and you can’t remember how to get back to a working state. Committing your code to `git` allows you to see what you’ve changed, and get back to a working state when you’ve lost the plot. Even if you don’t push to GitHub, you can `git init` locally.

#### Use logs liberally, and use log levels to organize them

As you develop, drop in `console.debug` statements in your Convex functions to capture state and events at various places. If you’re [in the dashboard logs view](https://docs.convex.dev/dashboard/deployments/logs) and it’s too verbose, you can hide the debug entries. When you’re reproducing an issue, you can also use the “Clear” button to start with an empty logs view, to just look at new logs that come in (without permanently deleting the past logs).

#### Play with queries interactively

Instead of editing and syncing functions, you can write queries directly in the dashboard and experiment with the syntax until you get the results you want, then you can copy that code into your repo. This is similar to iterating on raw SQL statements, then figuring out how to translate that to your language-specific query builder once you get it right.

#### Use auto reload and code sync for fast feedback in your dev environment

Avoid developing on a stack that requires explicit commands to build, compile, redeploy, and reload when you make code changes. In particular, don’t let your feedback cycle depend on `docker build`![1](https://stack.convex.dev/yolo-fast-mvp#user-content-fn-1) Tools like [Vite](https://vitejs.dev/) and [Next.js](https://nextjs.org/) do a great job of providing Hot Module Reload (HMR) which reloads your UI as you edit your frontend code, provided they’re run in the same file system as the code changes. Picking a backend like Convex for TypeScript or [uvicorn](https://www.uvicorn.org/) for [FastAPI](https://fastapi.tiangolo.com/) for Python will automatically re-build. Convex is especially powerful, in that you can develop locally against an open source build, or develop against a cloud-hosted dev environment, and both will watch for file changes, analyze for TypeScript errors, deploy the code to the server (whether local or remote), **and** re-execute any changed queries from your frontend automatically. No page refresh needed to fetch new database data!

#### Set up deploys on code pushes for fast feedback in production

Instead of deploying to production when you get around to it, set up deploy commands in your hosting provider like [Vercel](https://docs.convex.dev/production/hosting/vercel) or [Netlify](https://docs.convex.dev/production/hosting/netlify). By deploying on every push (whether you configure it to deploy only on changes to `main` or a dedicated branch like `prod`), you make it more likely that your live prototype will stay up to date, and you’ll get feedback faster from any early adopters. The sooner you catch issues, the fewer commits you have to check to find the bug.

#### Avoid stack overflows

I’m not talking about infinite recursion, but about the tendency to add unnecessary tooling to your infrastructure stack prematurely. In particular, these are tempting to add early on but time sinks:

- **Containerization** like `docker compose`, `kubernetes`, or `nomad`. Only use containers to recreate hard-to-reproduce environments that you need to share between collaborators or servers. Developing locally initially will let you experiment with changes faster than continually rebuilding the world from scratch.
- **CI/CD** such as GitHub Actions, and any containerized testing that can diverge from your development stack.
- **SSR** (server-side rendering), **RSC** (React server components), **SSG** (static site generation), **ISR** (incremental site regeneration), and other frontend optimizations where you’ll lose time debugging the difference between rendering in different environments, or in building development versus production.
- Low-level cloud platforms such as **AWS** or bare metal hosting like Digital Ocean. There is almost always a startup wrapping the AWS product you want to use, who have optimized for ease of integration, sane defaults and fast iteration. If your app becomes wildly successful, you can hire a team of experts to configure an optimized stack on lower level hardware. Until then, the cost in time and developer salaries of building things from scratch will vastly outweigh any pricing benefits.
- **Non-transactional data storage** such as Redis, Upstash, or edge databases. It’s hard enough to reason about data correctness in a new app without adding the combinatorial complexity of incorporating data stores that are not transactional with the rest of your application. Resist the temptation to trade off correctness for latency until you absolutely have to.

#### Use snapshot export to experiment with big changes

If you’re considering doing a radically different approach, you can use the [`npx convex export`](https://docs.convex.dev/cli#export-data-to-a-file) command in Convex or a SQL dump elsewhere to capture the database state beforehand. Then, if your changes don’t pan out, you can run [`npx convex import --replace`](https://docs.convex.dev/database/import-export/import) or the equivalent SQL load utility with the old snapshot to restore your data. This is a nifty tool for general development, but you can even do this for production data if you are feeling scrappy and want to do it live.

#### Delete dev data liberally and maintain a seed script to re-initialize

Instead of migrating data every time you change your schema, just delete the data that doesn’t match, and have a [seed mutation that inserts the correct data](https://stack.convex.dev/seeding-data-for-preview-deployments). When you edit the schema, you just edit the seed script (which will have type errors to help you find where to change). See [this post](https://stack.convex.dev/seeding-data-for-preview-deployments) for how to run these seed mutations automatically during development and for preview deployments. This is especially valuable for branch-based development, where you can switch branches, wipe your data, and re-seed your data.

To delete a table in Convex from the command line, here’s a nifty one-liner that deletes all documents by “importing” an empty file in “replace” mode:

```bash
1npx convex import --table $TABLE --replace --format jsonLines /dev/null
2
```

And to delete from every table in one line:

```bash
1for tableName in `npx convex data`; do npx convex import --table $tableName --replace -y --format jsonLines /dev/null; done
2
```

## Cutting corners: explicit immaturity

Here are some corners to cut in the name of iterating quickly that you can graduate out of over time. Whereas you can continue using the above tips, these tips are better left behind as your app matures.

#### Build an auth-free single-player version first

Instead of configuring [Clerk](https://docs.convex.dev/auth/clerk) on day one, first get your app working without any users. Figure out the core functionality before taking on the complexity of auth. I’ve seen a lot of projects stall out due to some mismatch between different environment variables, configurations, cookies, or otherwise. You can always layer auth on later.

#### Turn off schema validation

You can add data to a table [without defining a schema](https://docs.convex.dev/database/advanced/schema-philosophy) in Convex. However, you don’t get type safety or auto-complete until you [define your schema](https://docs.convex.dev/database/schemas) (which can be [auto-generated in the dashboard](https://docs.convex.dev/dashboard/deployments/data#generating-a-schema) by the way). One lesser-known feature, however, is that you can [disable schema validation](https://docs.convex.dev/database/schemas#schemavalidation-boolean) so you get all of the type benefits without having to keep your database data up to date with your schema changes.

You can also keep schema validation on, but [allow reading and writing to tables not specified in your schema](https://docs.convex.dev/database/schemas#stricttablenametypes-boolean), if you want to iterate on a feature that uses a new table, without losing the guarantees for other tables.

#### Migrate data by hand

[Edit your database data using the dashboard](https://stack.convex.dev/lightweight-zero-downtime-migrations) instead of writing code to update database data. For SQL, this is akin to running statements in a sql REPL on the command line, or running a tool like [adminer](https://www.adminer.org/). Writing and tuning migrations to edit 100 documents is a waste of time. Better yet, wipe the database and re-create it, as outlined above.

#### Put off building an admin dashboard

Building a dashboard to resolve user issues and dig through data is a common source of tech debt and security holes. You can view and edit production data in the Convex dashboard, and write [internal functions](https://docs.convex.dev/functions/internal-functions) to do more complicated changes that you can [run in the dashboard](https://docs.convex.dev/dashboard/deployments/functions#running-functions) or [from the CLI](https://docs.convex.dev/cli) to resolve user issues. Avoid accumulating the tech debt of building a second app until necessary.

## Summary

Before you burden yourself with “best practices” for large-scale companies, focus on what will reduce your feedback cycles and help you ship early and often. Think about your use case, not your toolbox.

When your app ready is ready, check out [this guide](https://stack.convex.dev/operational-maturity-for-production) for operational maturity for running apps in production.

### Footnotes

1. If you insist on using a docker container for development, ensure you’re either editing your code inside the container or mounting your repo’s directory into the docker container so code is immediately updated there. The latter is what I do for container-backed projects using `docker compose` or `k8s` locally. [↩](https://stack.convex.dev/yolo-fast-mvp#user-content-fnref-1)


Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started

We use third-party cookies to understand how people interact with our site.

See our [Privacy Policy](https://www.convex.dev/legal/privacy/) to learn more.

DeclineAccept