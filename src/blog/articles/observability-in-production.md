# Observing your app in production

![Ian Macartney's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F077753b63476b77fb111ba06d1bb538517033a54-3500x3500.jpg&w=3840&q=75)

[Ian Macartney](https://stack.convex.dev/author/ian-macartney)

a year ago

# Observing your app in production

![Observing your app in production](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F187dc4b1b0b95b1feda64d918c4802166fb613e7-1452x956.png&w=3840&q=75)

This is one of a series of posts on operational maturity in production. Get more tips for best practices for running apps in production [here](https://stack.convex.dev/operational-maturity-for-production).

Observability and monitoring are umbrella terms covering the various ways to see what’s happening with your app in the wild. This can include things like logs, metrics, exceptions, events, spans, traces, and more. This post will explore progressive steps you can take to increase your ability to introspect your app in production.

### Start with logs

When you’re just getting off the ground, you’ll likely get by for a while with just looking at logs. These will include:

- Debug output, such as `console.debug`.
- Exceptions with stack traces.
- Notable events, such as a user signing up, or interacting with the app.

#### In the dashboard

You can get surprisingly far, especially if you use the tools well. The Convex dashboard has a logs view where you can filter by log type, search, and temporarily clear logs. Failures in the frontend during development will show server-side errors in the console log, but will be hidden in production to avoid leaking server state unintentionally. To see a specific error in production, you can copy the associated [Request ID](https://docs.convex.dev/functions/error-handling/#debugging-errors) and search for it in the logs page.

#### Via the CLI

You can also stream logs into the CLI using `npx convex logs`. By piping it to `grep` or other tools, you can debug verbose output, filtering to the events you’re interested in. One command to try is `npx convex logs | tee ./logs.txt` which will both print out logs and save them to a file that you can inspect and filter later, without relying on your console history.

### Graduating to dedicated observability platforms

The Convex logs are a great starting point, but when you’re shipping an app to production, you will likely want to use industry standards, which come with dedicated features and infrastructure for. In particular, they can give you:

- Infinite history of older logs, enriched with metadata from Convex
- Unified client and server exception reporting
- Graphs and alerts for custom metrics
- Dashboards for insights and debugging
- Trends and triage tools with AI-backed clustering
- Persisted audit logging

Here are a set of actions you can take to leverage these platforms as you mature, in roughly the order to worry about them:

#### Persist your logs to Axiom

It’s useful to debug historical events and this is the easiest way to incrementally develop around a logs-centric approach. [Axiom](https://axiom.co/) and [DataDog](https://www.datadoghq.com/) allow you to stream in logs and work with them as events, and Convex will [enrich them with information about the server function](https://docs.convex.dev/production/integrations/log-streams#log-event-data-model-beta). It will also send logs about each function invocation, including the endpoint, its status, how long it took, and how much data and file storage it read & wrote.

See the docs for setting up log streaming [here](https://docs.convex.dev/production/integrations/log-streams). All you need to do is copy a key and some details from your Axiom/DataDog account into the Convex dashboard.

**Extract metrics from logs for dashboards**

One amazing thing about Axiom is that you can turn a `console.log` into events that you can plot in graphs and set alerts on. You can also make dashboards from the [logs sent for every function invocation](https://docs.convex.dev/production/integrations/log-streams#log-event-data-model-beta), showing errors per endpoint, or percentiles on timing. Using Axiom to turn logs into “wide events,” you can do very powerful things without littering proprietary metrics calls in your codebase.

#### Report your exceptions to Sentry

The baseline concern is whether your app is working. If your app is throwing exceptions, you almost certainly want to know about it and quickly diagnose what’s wrong. Reporting exceptions to [Sentry](https://sentry.io/welcome/?gad_source=1) allows you to see errors grouped by stack trace, and see metadata about exceptions, to figure out what is causing the issue. One tip is to [integrate it with your company’s Slack](https://sentry.io/integrations/slack/) or other messaging tool, so you get notified immediately about issues.

See the docs for reporting server exceptions to Sentry [here](https://docs.convex.dev/production/integrations/exception-reporting). It’s as easy as pasting in your DSN URL to the Convex dashboard. You can use the same Sentry configuration for reporting client-side errors, allowing you to see all of your errors in one place.

#### Set up web analytics with Plausible

A dedicated platform like [Plausible](https://plausible.io/) for looking at website traffic, including referrers, campaigns, and other insights, will help you see changes in website usage which can both indicate issues, but more importantly help you understand how users are interacting with your product. If no one is visiting the pricing page, that’s good information, even if there aren’t any software bugs.

#### Set up paging and on-call duties with PagerDuty

Once you have your exceptions and metrics, use PagerDuty to call and text you during an incident. [Configure Axiom](https://axiom.co/docs/apps/pagerduty) and [Sentry](https://sentry.io/integrations/pagerduty/) to send alerts to PagerDuty, and set up PagerDuty to always break through your Do Not Disturb settings, so you’re never wondering whether there’s an issue you’re missing.

As your team scales, share the responsibilities and set up schedules in PagerDuty that can be traded around, with a secondary person to respond if the primary doesn’t acknowledge the issue after a short amount of time. One useful tip is to [sync the oncall schedule with Slack](https://stack.convex.dev/pagerduty-slack-sync) in an #oncall channel, so anyone at the company can go to that channel to see who is oncall right now.

This responsibility can also extend to responding to support emails and async customer requests, though that is often decoupled to a “product on-call” role that is eventually part of a customer support effort.

The team I ran at Dropbox had the expectation to respond to an issue within 5 minutes or it would escalate to the secondary, then the whole team. This required the active primary and secondary to carry their laptops and a hot spot wherever they went. Your needs will change over time, and should be an ongoing conversation between engineering and product to support the business and promises you make to customers, without over-burdening the team.

### Persist important events to tables

In addition to emitting logs for events, you might want to have more structured data to do analytics on or as part of some business workflow, for instance capturing every time a user creates a new team. You might do some offline processing to find qualified leads for sales, or later define some workflow logic around when to send various engagement emails. Wanting data in a standard, durable, consistent, query-able format is a sign that you want a database in the loop. By making an “events” table, you can write structured events with a schema, and query them later.

#### Inspecting your data in the dashboard

At first, you may be fine just using the Convex dashboard to inspect your data. You can use the [data page’s](https://docs.convex.dev/dashboard/deployments/data) [filters](https://docs.convex.dev/dashboard/deployments/data#filtering-documents) to find relevant documents. You can also use the live query editor in the function runner. You can also run custom `internalQuery` functions [from the CLI](https://docs.convex.dev/cli#run-convex-functions) to generate reports.

However, as your needs grow, you’ll likely want to query your data with an analytics-optimized query interface like SQL.

#### Inspecting data from a snapshot export

You can [export](https://docs.convex.dev/database/import-export/export) your data and inspect it locally for one-off analytics. Unzip the snapshot and use [`jq`](https://jqlang.github.io/jq/) for basic command-line inspection and manipulation on any of the tables.
When you want to do more complex investigation in SQL, including queries joining tables, use [DuckDB](https://duckdb.org/) to run SQL commands on your json data directly:

```sh
1$ npx convex export --prod --path ./snapshot.zip
2$ unzip ./snapshot.zip && cd snapshot
3$ duckdb
4D install 'json';
5D load 'json';
6D SELECT * from 'myTable/documents.jsonl' LIMIT 1;
7┌────────────────────┬──────────────────────────────────┬───────────┬─────────────────────────────────┐
8│   _creationTime    │               _id                │ someField │          otherTableId           │
9│       double       │             varchar              │  varchar  │             varchar             │
10├────────────────────┼──────────────────────────────────┼───────────┼─────────────────────────────────┤
11│ 1705522240446.3655 │ js700yfkncke9xk23ndf3ahmj56hq77t │ foo       │ 3cqbsxb8cexh8stz73be6f9w9hjqa28 │
12└────────────────────┴──────────────────────────────────┴───────────┴─────────────────────────────────┘
13D SELECT someField, otherField from 'myTable/documents.jsonl' as myTable
14    JOIN 'otherTable/documents.jsonl' as otherTable
15    ON myTable.otherTableId = otherTable._id LIMIT 1;
16┌───────────┬────────────┐
17│ someField │ otherField │
18│  varchar  │  boolean   │
19├───────────┼────────────┤
20│ foo       │ true       │
21└───────────┴────────────┘
22
```

#### Stream tables to a dedicated analytics tool like BigQuery

Once your events are in a table, you can use Convex [streaming export](https://docs.convex.dev/database/import-export/streaming) to export various tables to a dedicated tool like [BigQuery](https://cloud.google.com/bigquery) on an ongoing basis. Analytics (OLAP) databases are optimized to do large queries efficiently, relative to transactional (OLTP) application databases like Convex. From the analytics tools, you can build complex data pipelines to learn about your data and connect it with other products such as a CRM. If you end up generating actionable data that you want to incorporate back into your application, you can stream that data into a Convex table using [streaming import](https://docs.convex.dev/database/import-export/streaming#streaming-import).

## Summary

By setting up dedicated tools, you can get actionable data to help understanding errors, performance, user behavior and allow you respond quickly as data changes.

Get more tips for best practices for running apps in production [here](https://stack.convex.dev/operational-maturity-for-production).

Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started

We use third-party cookies to understand how people interact with our site.

See our [Privacy Policy](https://www.convex.dev/legal/privacy/) to learn more.

DeclineAccept