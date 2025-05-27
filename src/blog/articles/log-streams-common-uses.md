# Log Streams: Common uses

![Sarah Shader's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F7047febd1fcf4e4b44d4da9f199c07d842acf23b-1365x1418.jpg&w=3840&q=75)

[Sarah Shader](https://stack.convex.dev/author/sarah-shader)

a year ago

# Log Streams: Common uses

![icon of logs and then icon of a stream, to represent log streaming!](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F4c39adb6412d669163f6c352a22919a6e654c7d9-1452x956.png&w=3840&q=75)

With Convex, you can see information about each function executed by Convex, such as whether it succeeded and how long it took to execute, as well as any log lines from `console.log` s within your functions. These are useful for understanding what your Convex deployment is doing as well as debugging any unexpected issues. Recent events are visible in the [dashboard](https://dashboard.convex.dev/) and from the CLI with `npx convex logs` or with the `--tail-logs` argument to `npx convex dev`.

However, you can also set up [Log Streams](https://docs.convex.dev/production/integrations/log-streams/) to send these events to [Axiom](https://app.axiom.co/) or [Datadog](https://www.datadoghq.com/).

Log streams give you more control over your logs and errors:

- Retain historical logs as long as you want (vs. Convex only keeps logs for the last 1000 functions)
- Add more powerful filtering + data visualizations base on logs
- Integrate your log streaming platform with other tools (e.g. PagerDuty, Slack)

This article will go over a few common ways to use log streams and how to set them up with either Axiom or Datadog:

- Replicating the Convex dashboard logs page
- Filtering to relevant logs by request ID
- Searching for logs containing a particular string
- Emitting + filtering namespaced logs with structured metadata
- Visualizing Convex usage
- Alerting on approaching Convex limits

## How to set up a log stream

Follow our [docs](https://docs.convex.dev/production/integrations/log-streams) to set up a log stream. You’ll need to set up an account for whichever tool you’re using. I’ve personally liked using Axiom for logs and [Sentry](https://sentry.io/) for [exception reporting](https://docs.convex.dev/production/integrations/exception-reporting).

## Common ways to use log streams

The full schema of the Convex log events is documented [here](https://docs.convex.dev/production/integrations/log-streams#log-event-data-model-beta), and the log stream provider of your choosing will have their own docs on how to filter and visualize data, but in this section, we’ll go through a couple common scenarios.

### Recreating the dashboard logs page

The dashboard logs page shows `console` log lines + function executions sorted by time.

To do this with a log stream, we can filter to logs where `topic` is either `console` or `function_execution`.

Some useful columns to display

- `function.path`, `function.type`, `function.request_id`
- For function executions: `functon.cached`, `status`, `error_message`
- For console events: `log_level`, `message`

Since there are different columns for console logs events vs. function execution log events, you might set up two different views for them. Once you have these set up how you want, save the queries or add them to a dashboard for easy use later on.

Below is an example showing console logs in Axiom and an example of showing function executions in Datadog.

![Console logs in Axiom](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Fd31a05f63e05df1accfd685ca8d71ff388e25909-3824x2302.png&w=3840&q=75)Console logs in Axiom

![Function executions in Datadog](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F40700131e03fa549faf658186dff46288e3c68a3-3824x2302.png&w=3840&q=75)Function executions in Datadog

### Filtering to a request ID

In the dashboard, clicking on an entry in the logs page will open up a view filtered to that request using the [Request ID](https://docs.convex.dev/functions/debugging#finding-relevant-logs-by-request-id). You can also do this in Axiom or Datadog by filtering your events further on `function.request_id`. The request ID shows up in error messages and sentry, so this can be useful for investigating an error found in Sentry or reported by a user.

![Request ID filtering in the dashboard](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F3e5b490c5572cf78f90cd56ca0066f526d3a330e-1030x320.png&w=3840&q=75)Request ID filtering in the dashboard![Request ID in Sentry](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Fe7f5bad60dd696343f93cbdd3f2f460e8a8eb409-1195x167.png&w=3840&q=75)Request ID in Sentry

**Axiom:**
In the Axiom “Explore” tab with something like this:

```
1your_dataset
2| where ['data.function.request_id'] == "your request ID here"
3
```

**Datadog:**
In the Datadog logs page:

```
1@function.request_id:"your request ID here"
2
```

### Filtering to `console` events with a particular message

**Axiom:**

```
1your_dataset
2| where ['data.topic'] == "console"
3| where ['data.message'] contains "hello"
4
```

**Datadog:**

```
1@message:hello
2
```

### Namespaced logs + structured metadata

As an example, if I have an app where users play games against each other, I might want to log information about each game with some specific attached metadata (like the game ID).

In my Convex functions, I’ll do something like this:

```js
1console.log(JSON.stringify({
2	topic: "GAME",
3	metadata: { gameId: "my game ID here" },
4	message: "Started"
5}))
6
```

Then I can parse these logs in Axiom or Datadog and be able to filter to all events with topic `“GAME”` with a particular ID.

To make this a little easier, we can make this a helper function:

```
1function logEvent(topic, metadata, message) {
2	console.log(JSON.stringify({ topic, metadata, message }))
3}
4
```

Going further, we could use [`customFunctions`](https://github.com/get-convex/convex-helpers/blob/main/packages/convex-helpers/README.md#custom-functions) to wrap `console.log` and handle logging these structured events. A usage of this might look something like

```js
1ctx.logger.log(LOG_TOPICS.Game, { gameId }, "Started")
2
```

An example implementation of `ctx.logger` and some examples of its usage can be found [here](https://github.com/sshader/proset/pull/6).

**Axiom:**

(optional) Add a [virtual field](https://axiom.co/docs/query-data/virtual-fields) `parsed_message` so we can use this field in filters. This saves us from having to repeat the parsing logic in our query.

```
1['your_dataset']
2| extend parsed_message = iff(
3    isnotnull(parse_json(trim("'", tostring(["data.message"])))),
4    parse_json(trim("'", tostring(["data.message"]))),
5    parse_json('{}')
6)
7
```

![Adding a virtual field in Axiom](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F4828ec45bce1cff19ba3fea9f504bcf834aa9825-3824x2302.png&w=3840&q=75)Adding a virtual field in Axiom

In the “Explore” page:

```
1your_dataset
2| where ['data.topic'] == "console"
3| where parsed_message["topic"] == "GAME"
4| where parsed_message["metadata"]["gameId"] == <your id>
5| project ['data.timestamp'], ['data.log_level'], parsed_message["message"]
6
```

![Filtering to logs for a game in Axiom](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F12f91e73050f0d6429e597be0f66f0e72be75728-3824x2302.png&w=3840&q=75)Filtering to logs for a game in Axiom

**Datadog:**

Add a pipeline with a [Grok parser](https://docs.datadoghq.com/service_management/events/pipelines_and_processors/grok_parser/?tab=matchers) to parse the `message` field as JSON on all events with the `topic` as `console`. I used

```
1rule '%{data:structured_message:json}'
2
```

![Adding a Grok parser in Datadog](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F95f3f200abe6afb9a2c66058198188cb373afa9e-3824x2302.png&w=3840&q=75)Adding a Grok parser in Datadog

Filter logs as follows:

```
1@structured_message.topic:GAME @structured_message.metadata.gameId:<specific ID>
2
```

![Filtering to logs for a game in Datadog](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F867739891c908ccd7db65183ce79f6e43caff0a3-3824x2302.png&w=3840&q=75)Filtering to logs for a game in Datadog

Note: `message` is formatted using [`object-inspect`](https://www.npmjs.com/package/object-inspect), so printing a string requires removing the outer single quotes.

### Visualizing usage

Function executions contain the `usage` field which can be used to track usage state like database bandwidth and storage per function.

**Axiom:**

```
1your_dataset
2| where ['data.topic'] == "function_execution"
3| extend databaseBandwithKb = (todouble(['data.usage.database_read_bytes']) + todouble(['data.usage.database_write_bytes'])) / 1024
4| summarize sum(databaseBandwithKb) by ['data.function.path'], bin_auto(_time)
5
```

**Datadog:**

You will want to make this a “ [measure](https://docs.datadoghq.com/logs/explorer/facets/#quantitative-facets)” for the usage fields you care about and might want to make a “facet” for `function.path`. Below is an example of making a measure for `database_write_bytes`.

![Defining a measure in Datadog](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F2726cdaa564d9cc386b39bcdb6a40fb4bd4407b1-960x720.png&w=3840&q=75)Defining a measure in Datadog

![Making a pie chart in Datadog](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F50372fb3dca7160d7b48834c422435609b06519b-2516x1214.png&w=3840&q=75)Making a pie chart in Datadog

### Convex system warnings

Convex automatically adds warning messages when a function is nearing limits (e.g. total bytes read, execution time). These have the `system_code` field which is a short string summarizing the limit. Adding an alert for events with `system_code` is a good way of automatically detecting functions that are approaching limits before they exceed the limits and break.

![An alert in Datadog for Convex system warnings](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Fa15b69b95ee91501f456b091b7c96727869ad554-610x628.png&w=3840&q=75)An alert in Datadog for Convex system warnings

## Summary

Log streams like Axiom and Datadog can be used to provide powerful querying and alerting on logs and errors from your Convex functions, helping with debugging issues when they come up and providing early insights to detect smaller issues before they become bigger.

This article covers how to do the following common things with either Axiom or Datadog hooked up as a Convex log stream:

- Replicating the Convex dashboard logs page, but with more history
- Filtering to relevant logs by request ID
- Searching for logs containing a particular string
- Emitting + filtering namespaced logs with structured metadata
- Visualizing Convex usage
- Alerting on approaching Convex limits

Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started

We use third-party cookies to understand how people interact with our site.

See our [Privacy Policy](https://www.convex.dev/legal/privacy/) to learn more.

DeclineAccept