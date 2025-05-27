# Operational maturity for production

![Ian Macartney's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F077753b63476b77fb111ba06d1bb538517033a54-3500x3500.jpg&w=3840&q=75)

[Ian Macartney](https://stack.convex.dev/author/ian-macartney)

a year ago

# Operational maturity for production

![the basics of operational maturity](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Fab35bfadd43eab048cc3ed1c1b16a665545fb627-1452x956.png&w=3840&q=75)

Operational maturity is the umbrella term I like when thinking about scalability, security, observability, and other important aspects of a serious product. Similar to scaling, it isn’t a destination, but a continual process. There is no one checklist that an app goes through once. Rather, you should understand where you are in the journey, what the biggest risks are, and what incremental steps are available.

This post will cover various areas of operational maturity, and link to posts outlining steps to take as your app develops. The advice will specifically reference Convex but the concepts are generally applicable.

I’ve worked on teams and products all along this spectrum, from launching a new GCP product for startups like Clockwork, to greenfield products for established companies like The New York Times, to managing the Dropbox infrastructure responsible for file previews—involving hundreds of servers in multiple data centers handling millions of image requests per day targeting three nines of availability. I can assure you, all of these did not—and should not—have the same level of operational maturity.

## 1\. Prototyping: YOLO

When you’re first building your app or bootstrapping your company, you want to move as quickly as possible. If you’re spending a lot of time thinking about load balancing, connection pooling, data architecture for future-proof sharding, or Kubernetes, then you likely aren’t thinking enough about the human problem you’re trying to solve. For reassurance, I have a heuristic that for every order of magnitude increase in users, an app often gets re-architected or re-written at some layer. Your database schema in your first commit to your git repository does not need to be the data model you launch with. Don’t let perfect be the enemy of good.

#### [Click here for tips on getting to an MVP fast](https://stack.convex.dev/yolo-fast-mvp)

Tips include: version control, liberal logging, interactive database queries, auto-reload, auto-deploys, keeping your stack simple, snapshotting data, seed scripts, deferring auth, loose schemas, manual migrations, and more.

## 2\. Observing your app

When your app is running, observability allows you to see what is happening, how your product is being used, what is going wrong, and help you debug the “why” behind it all. It is a critical piece of running an app in production, where you don’t have debug access to all of the devices interacting with your software.

#### [Learn more about observing your app in production](https://stack.convex.dev/observability-in-production)

You can start with simple logs, and incorporate dedicated tools over time like Axiom, Sentry, Plausible, PagerDuty, Databricks, and more.

## 3\. Testing for peace of mind

From a pragmatic standpoint, testing allows you to validate behavior, catch regressions in performance or functionality, and ultimately give you peace of mind. When you have high confidence in your testing, you will feel confident shipping more frequently.

#### [Learn more about testing patterns](https://stack.convex.dev/testing-patterns)

From end-to-end tests to unit tests, from manual to automated strategies, there are a lot of options to choose from when deciding what to up-level next. Often-overlooked aspects of testing are how you test subjective changes in production, and testing your app from outside of your own ecosystem. The latter helps to catch issues with hard-to-test parts of your stack like networking and configurations that only exist in production.

## 4\. Protecting your app from yourself

Even if your code is well tested, you can still make mistakes in how you interact with the powerful tools at your disposal. The source of many major internet outages have been from someone mis-typing a command, for instance running a destructive—like deleting a table—in production when they meant to run it against a development instance. Over time, you’ll need to invest in safer processes around changing code, configuration, and data in production.

Some areas of investment include:

**Deployments:** push-time checks for environment variable definitions, checking for accidental deletion of large indexes, isolating your production deployment from staging and development workflows, and avoiding breaking and inefficient schema changes.

**Migrations**: codifying mutations in code, verifying them against seed data, validating a dry run, and opt-in automation.

**Scoped data changes:** authenticated, authorized, audit-logged changes to production data through dedicated admin interfaces.

## 5\. Hardening your app

Your app needs protection from more than your own mistakes. When you launch to production, you’ll need to consider how clients might misbehave. A backend needs to protect against bad input, or requests that try to access or modify other users’ data. As your customers start to rely on your site, you’ll need to refine your authentication and authorization story.

Simple steps include:

- [schema validation](https://docs.convex.dev/database/schemas) for data.[1](https://stack.convex.dev/operational-maturity-for-production#user-content-fn-2)
- [argument validation](https://docs.convex.dev/functions/args-validation) for endpoints.
- [Internal functions](https://docs.convex.dev/functions/internal-functions) for calling or scheduling functions from other server functions.
- [Authentication in functions](https://docs.convex.dev/auth/functions-auth) to identify users instead of passing up user identifiers.
- [Standardized authentication patterns](https://stack.convex.dev/custom-functions) for public functions with [lints to enforce usage](https://stack.convex.dev/eslint-setup).
- [Environment variables](https://docs.convex.dev/production/environment-variables) for secrets.
- [Shared secrets for cross-server requests](https://stack.convex.dev/custom-functions#consuming-a-function-argument-for-basic-api-key-auth).
- [Rate limit user actions](https://stack.convex.dev/rate-limiting) such as logins or email resets to discourage hackers.
- [Authorizing data access based on the user](https://stack.convex.dev/row-level-security).

## 6\. Scaling

As your app grows from dozens to thousands to millions of users, the performance and reliability of your app become more important. This can include considerations for organic growth such as:

- [Optimizing your database queries](https://stack.convex.dev/queries-that-scale) to avoid scanning too many documents.
- [Retrying functions](https://stack.convex.dev/retry-actions) that rely on unreliable services.
- [Dynamic client-side throttling](https://stack.convex.dev/throttling-requests-by-single-flighting)
- Using [scheduled functions](https://docs.convex.dev/scheduling/scheduled-functions) as a work queue when you care more about throughput than latency.
- [Rate limiting](https://stack.convex.dev/rate-limiting) expensive requests (such as requests to LLMs) per user, especially for freemium plans.
- [Managing the state of asynchronous workloads](https://stack.convex.dev/background-job-management).
- Using [work stealing](https://stack.convex.dev/work-stealing) pattern when running your own infra and want to optimize for throughput.
- Load testing your app to stay ahead of your users’ growth.

## Summary

Operational maturity is an ongoing process that covers a wide range of topics. We’ve touched on many ways to level up your app, but this list is neither exhaustive nor essential. The important decisions to make are:

- Where are your gaps?
- What is worth investing in next?
- When is the right time to take the next step and re-evaluate?

We’d love to hear from you in our [community Discord](https://convex.dev/community).

And if this has gotten you interested in how we think about the future of product development here at Convex, check out this video:

### Footnotes

1. You can also use [Zod](https://stack.convex.dev/typescript-zod-function-validation) for finer-grained runtime validation. [↩](https://stack.convex.dev/operational-maturity-for-production#user-content-fnref-2)


Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started

We use third-party cookies to understand how people interact with our site.

See our [Privacy Policy](https://www.convex.dev/legal/privacy/) to learn more.

DeclineAccept