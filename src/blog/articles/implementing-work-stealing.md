# Implementing work stealing with a reactive database

![Ian Macartney's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F077753b63476b77fb111ba06d1bb538517033a54-3500x3500.jpg&w=3840&q=75)

[Ian Macartney](https://stack.convex.dev/author/ian-macartney)

a year ago

# Implementing work stealing with a reactive database

![A distributed server on the left and a folder icon with a pirate's hook in it](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Fc111196ddb6a2dc1b8cddd34df74240d276a3ea3-1452x956.png&w=3840&q=75)

In [“Push vs. pull: patterns for compute-heavy workloads”](https://stack.convex.dev/work-stealing) I discuss a technique for distributed processing called “work stealing” and compare it to traditional “push-based” approach of load balancing HTTP requests. As a reminder, this is the general flow:

![Diagram of a client request going to Convex, being added to the queue of work, then a Worker calling Convex to claim the work, then doing a resource-intensive task, then writing the result back to Convex, which triggers a subscription the client had, sending the result down to the Client as part of a query](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Fe2bd61b2149a5ffedebfe962889b0db100bfa00d-962x969.png&w=3840&q=75)Diagram of a client request going to Convex, being added to the queue of work, then a Worker calling Convex to claim the work, then doing a resource-intensive task, then writing the result back to Convex, which triggers a subscription the client had, sending the result down to the Client as part of a query

In this post I’ll dig into the details of how I implemented it for [llama farm](https://github.com/get-convex/llama-farm-chat).

[get-convex/ **llama-farm-chat**\\
\\
![GitHub logo](https://stack.convex.dev/logos/github.svg)](https://github.com/get-convex/llama-farm-chat)

## Tracking work

I use a table “jobs” representing what needs to be done:

```tsx
1    jobs: defineTable({
2      work: v.object({
3        // details about what needs to be done
4      }),
5      status: literals(
6        "pending",
7        "inProgress",
8        "success",
9        "failed",
10        "timedOut"
11      ),
12      lastUpdate: v.number(),
13      workerId: v.optional(v.id("workers")),
14      janitorId: v.optional(v.id("_scheduled_functions")),
15    }).index("status", ["status", "lastUpdate"]),
16
```

I’ll explain `lastUpdate`, `workerId`, and `janitorId` below.

When there is a request needing an LLM, a job is inserted into the table.

```tsx
1  await ctx.db.insert("jobs", {
2    work: {
3      // details about what needs to be done
4    },
5    status: "pending",
6    lastUpdate: Date.now(),
7  });
8
```

In my case, the work included the message to update with the result, and the chat context. All clients in the group chat subscribe to the latest messages, so as the worker updates the message with streamed results, they all see updates automatically.

## Workers

Each worker is subscribed to a query `isThereWork` that just returns true or false:

```tsx
1export const isThereWork = query({
2  args: {},
3  handler: async (ctx) => {
4    const work = await ctx.db
5      .query("jobs")
6      .withIndex("status", (q) => q.eq("status", "pending"))
7      .first();
8    return !!work;
9  },
10});
11
```

A benefit of Convex queries is they automatically have caching and reactivity. All workers subscribed to the query will get the same cached response, and when a pending job is inserted, the cache will automatically be invalidated, the query re-run, and all workers will receive `true`. So long as there is one or more pending jobs, the query will remain `true`.

A more sophisticated algorithm could entail:

- Returning the work to be done, to help workers decide what they want to claim.
- Subscribe each worker to a subset of job queues. This can be used to:
  - Scope workers to certain users or organizations. And extension to llama farm I plan to implement is having user-supplied workers that only process requests for the groups that the user is in.
  - Shard work - where each worker pull the oldest request from the subset of queues it’s responsible for, stealing work from other queues only if it’s totally idle. This can help avoid database contention as traffic scales.

### The work loop

#### Waiting for work

In a loop, the worker waits for work to exist (for the `isThereWork` subscription to return true), tries to claim work, and then processes it, if it claimed any:

```tsx
1  while (true) {
2    await waitForWork(client);
3    const work = await client.mutation(api.workers.giveMeWork, { apiKey });
4    // null if another worker claimed it first.
5    if (work) {
6      await doWork(work, client, apiKey);
7    }
8  }
9
```

- The `waitForWork` function uses the `onUpdate` API of the `ConvexClient` to make an await-able promise from `isThereWork`.





```tsx
1function waitForWork(client: ConvexClient) {
2  return new Promise<void>((resolve, reject) => {
3    const unsubscribe = client.onUpdate(
4      api.workers.isThereWork, {},
5      (thereIsWork) => {
6        if (thereIsWork) {
7          resolve();
8          unsubscribe();
9        }
10      },
11      reject,
12    );
13  });
14}
15
```


#### Claiming work

To claim work, it:

- Finds the first pending job, if there is one. It also fetches the latest version of any related data that the request needs, such as previous messages in the group chat.

- Marks it as `"inProgress"` and note the `workerId` of the worker claiming the task. The worker passes an API key to authenticate its request. I use a [custom function](https://stack.convex.dev/custom-functions) to make a `workerMutation` which validates the API key and looks up the associated worker.

- Schedules a “janitor” function to mark the job as `"timedOut"` if we haven’t heard from the worker in a while. The worker will periodically call `imStillWorking` to update the job’s `lastUpdated` field to let the server know it’s still alive. When it does so, it will also cancel the janitor function by its `janitorId` and schedule a new one.





```tsx
1  if (job.janitorId) {
2    await ctx.scheduler.cancel(job.janitorId);
3  }
4  job.janitorId = await ctx.scheduler.runAfter(
5    WorkerDeadTimeout,
6    internal.workers.markAsDead,
7    { jobId: job._id }
8  );
9
```


All of these operations leverage Convex’s strong transactional guarantees (in particular, serializable isolation) to not have to worry about race conditions. The scheduled functions will not be scheduled if a transaction rolls back, and conflicts are automatically retried.

### Submitting

When a worker is done, it calls `submitWork` which:

- Updates the message associated with the job.
- Marks it as success or failed.
- Re-submits it to be retried if it hasn’t been retried too many times already. See below for more details.

If the request was a streaming request, it publishes updates periodically, so the user can see the response stream in. It batches updates by only sending them when it sees punctuation like `, . ! ? \n` or if it’s longer than 100 characters.

### Handling retries

A worker can either fail explicitly or disappear:

If the worker’s LLM fails in a way it can detect:

- It will retry a few times with backoff, and report failure if it fails the last attempt.
- If the worker reports failure, the job will be attempted by another worker by inserting a copy of the job as “pending” and checking for previous attempts by the same worker when claiming a job.

If the worker dies unexpectedly:

- The worker stops calling `imStillWorking`, so `lastUpdated` stops being incremented.
- The janitor function `markAsDead` eventually executes, marking the request as `timedOut`.
- The job is not retried, with the reasoning that in a chat app, by the time a request times out, the value of a response is significantly diminished as they may have already sent other messages since then, and they can explicitly request another response if they want.

## Summary

In this post we looked at how to implement a work stealing pattern in Convex, using subscription to connect jobs completed by workers with clients who submitted the jobs.

Check out the repo, and be sure to read [this post](https://stack.convex.dev/work-stealing) on the tradeoffs of work stealing if you haven’t already.

[get-convex/ **llama-farm-chat**\\
\\
![GitHub logo](https://stack.convex.dev/logos/github.svg)](https://github.com/get-convex/llama-farm-chat)

Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started

We use third-party cookies to understand how people interact with our site.

See our [Privacy Policy](https://www.convex.dev/legal/privacy/) to learn more.

DeclineAccept