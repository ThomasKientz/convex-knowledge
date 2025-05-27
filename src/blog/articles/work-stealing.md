# Work Stealing: Load-balancing for compute-heavy tasks

![Ian Macartney's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F077753b63476b77fb111ba06d1bb538517033a54-3500x3500.jpg&w=3840&q=75)

[Ian Macartney](https://stack.convex.dev/author/ian-macartney)

a year ago

# Work Stealing: Load-balancing for compute-heavy tasks

![On the left, a distributed server icon, on the right a folder icon with a pirate's hook in it](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Feefa30990065ad4eb11c60b56539fde55b71c886-1452x956.png&w=3840&q=75)

For fast, light-weight workloads, you can often get away with a small number of powerful machines. Even when load isn’t distributed evenly, a single backlogged machine won’t noticeably impact a user’s experience.

However, when your app requires heavy operations, such as running requests on an LLM, transcoding a video, or intensive cryptography, you need a better strategy for handling concurrency.

Requests that monopolize many CPU or GPU cores require more machines, as each machine is able to handle less parallelism. When you factor in slow requests, a single backlogged machine can cause significant delays and p95 performance degredation, even if the overall system has extra bandwidth.

So how can you distribute the load across many workers?

#### tl;dr

In this post I’ll explain the “work stealing”[1](https://stack.convex.dev/work-stealing#user-content-fn-1) strategy for task distribution and why you should consider it for workloads that:

1. Take significant time to execute.
2. Do not share resources well, such as GPU-intensive computation.
3. Prioritize throughput and utilization over average-case latency.
4. Run locally, behind a NAT, or are otherwise not discoverable from a web server.

## Overview

We will look at two strategies for managing resource-intensive workloads:

1. **Push-based** routing: a load balancer decides where to send requests and waits for a response from the worker, which it then returns to the client.
2. **Pull-based** “work stealing”: an incoming request is put on one or more queues from which workers pull. They publish results which can be included in the response to the original request, or pulled from the client via a subscription, allowing the original response to return early. Multiple clients can subscribe to the result.

One way to think about this is ordering food at a restaurant.

A push-based approach would assign you to a chef when you walked in the door, as a load balancer forwards a request. You’d wait for all other parties assigned to the chef to be served, hoping there aren’t many time-intensive dishes ahead of you, and wondering if anyone else was lucky enough to be assigned to an idle chef. If you left the restaurant for any reason, you’d be re-assigned when you came back in, losing your place in line.

A pull-based approach is more similar to getting an order number. All guests have their orders taken when they walk in, and chefs work on the next order as they become available. You can walk around with your order number, check in on its status, or even cancel your order if it hasn’t been started. It’s more efficient for the chefs, but it requires writing things down and having a way to notify you when your food is ready, since you might not be standing next to the chef waiting.

As a concrete code example, I recently put out a demo of distributed LLM computing: [llama farm](https://labs.convex.dev/llama-farm), where requests to the website that require llama3 are farmed out to workers. I can run these workers from the command line on a spare laptop, in containers hosted on [fly.io](https://fly.io/), or even from browsers using [web-llm](https://github.com/mlc-ai/web-llm). The repo is an implementation of “work stealing,” which enables these llama workers to pull and process jobs at their discretion without exposing a port to http requests or requiring service discovery. Read [this post](https://stack.convex.dev/implementing-work-stealing) about the implementation, or check out the [code](https://github.com/get-convex/llama-farm-chat).

To learn more about work stealing and how it compares to more traditional load balancing, read on. For the sake of this article, I’ll use the example of processing LLM requests, but the techniques naturally extend to any high-latency or hardware-intensive workload.

### Do I need this?

**Note:** This decision assumes you are controlling your own infrastructure. If you are using a cloud service, such as using [Replicate](https://replicate.com/) to serve and scale your models, you don’t have to worry about this - you are paying them to make these decisions and scale transparently. Most of the time this is the right way to start.

Some reasons you might benefit from scaling your own infrastructure:

- **Controlling data**: If you are unwilling to send data to a third party LLM, you can run your own machines and know how your data is being handled and used. This is especially important if you have data governance requirements preventing it from leaving a private network.
- **Controlling costs**: Cloud providers allow you to scale more granularly at a higher per-request cost. By deciding when and how many machines you run, you control your scale.

  - Note: I say controlling rather than reducing because, until you utilize your machines well, this is unlikely to save you money. In the case of [llama farm](https://labs.convex.dev/llama-farm), however, we avoid paying for dedicated GPUs altogether by leveraging existing idle hardware.
- **Controlling latency**: By controlling the routing and prioritization of requests, you can ensure tighter bounds on latency than you may get from a cloud provider, which is likely sharing resources with other customers and may not expose a mechanism for you to prioritize or cancel requests. Note: you’ll need to decide how to absorb spikes of traffic. Options include:

  - **Over-provisioning** (or auto-scaling) your hardware to accept additional load.
  - **Shedding load** by rejecting requests (often with a 429 status code) and relying on clients to retry later.
  - **Accepting high latency** during these periods, ideally isolated to low-priority traffic.

## Push-based routing

WorkerAPI ServerWorkerAPI ServerResource-intensive taskClientRequestRequestResultResultClient

Traditionally, the web works via pushing, or sending, requests. A request (usually HTTP) gets routed to a machine based on its IP address. For compute-intensive tasks, a client typically hits an API endpoint, which doesn’t do the CPU-intensive operation itself but rather makes its own request to a pool of dedicated workers. Forwarding the work to other machines isolates the API server’s resources so it is available to serve other requests, while also allowing you to scale the workers on use-case-specific hardware, such as machines with GPUs, separately from the web servers. The API server returns the (potentially streamed) results to the client.

#### Benefits:

- **Serverless hosting**. On platforms where you only pay for the duration of a request, you can avoid running the machine between requests. For a worker to pull requests, it needs to be running continuously or auto-scaled by a monitoring service.
- **Standard**. It is easier to reason about latency, errors, and work attribution for a traditional request. By comparison, when a worker pulls work and publishes results, it is no longer within the call graph of the original request.
- **Stateless**. When you hold open the client request and return the result directly from a worker, you don’t have to persist any state if you don’t want to.

#### Challenges:

- **Load balancing** needs to keep track of workers.

  - You have to guess which backend to send work to, or poll every worker for their state.
  - When a backend starts or stops, something needs to update, whether it’s [Consul](https://www.consul.io/), [kube-proxy](https://kubernetes.io/docs/reference/command-line-tools-reference/kube-proxy/), [ELB](https://aws.amazon.com/elasticloadbalancing/), or otherwise. To stop a worker without incurring failures, you need to prevent the load balancer from sending new requests and then finishing existing ones.
  - These updates can fail or take some time.
  - All workers need to be discoverable and exposed to inbound http traffic. To run a worker on your local machine, you could use a service like [Tunnelmole](https://tunnelmole.com/) or [ngrok](https://ngrok.com/) to proxy traffic, which exposes you to public internet traffic.
- **Isolated queues**: if a worker has too many requests, it can only queue or reject.

  - Requests might not be started in the order they were received, and higher priority requests may be queued behind lower priority ones.
    - Often the queueing happens in the TCP socket connection, which can’t distinguish application-layer details, such as request priority or expected duration.
  - Per-machine queues [can cause high tail latency in distributed systems](https://cacm.acm.org/research/the-tail-at-scale/#body-4).

    - Some workers might be idle while others have a backlog of slow requests.
- **HTTP connection lifecycle**: the API request needs to hold open both incoming and outgoing connections for the duration of the work.

  - If the client loses the connection, the operation can’t easily resume. Even with sticky connections, an API server could come up on a new machine during a deploy.
  - This can results in low CPU utilization on the API server. If this is a serverless function, you may be paying for this idle time.

## Pull-based work stealing

WorkerAPI ServerWorkerAPI ServerAdded to queueResource-intensive taskSubscription triggeredClientRequestSuccessfully queuedClaim work​ResultResultClient

Compared to push-based, in a pull-based system, workers take on or ”steal” work when they have capacity, and then publish the result. To see an implementation of work stealing, check out [this post](https://stack.convex.dev/implementing-work-stealing) and this GitHub repo where I implement it for LLM-powered group chat:

**[Implementing work stealing with a reactive database](https://stack.convex.dev/implementing-work-stealing)**

[get-convex/ **llama-farm-chat**\\
\\
![GitHub logo](https://stack.convex.dev/logos/github.svg)](https://github.com/get-convex/llama-farm-chat)

#### Benefits

- **Optimizing throughput** with consistent concurrency.

  - In non-user-facing workloads you want to utilize machines as efficiently as possible, which is especially common in AI applications where you want to crawl large amounts of data to generate embeddings. Instead of controlling how fast you push work and to which machines, having a large work queue consumed by workers that you can dynamically spin up allows for optimal utilization.
  - For user-facing workloads, during spikes in load the API server knows how much work is in flight and can decide whether to reject or enqueue the work, as well as whether to re-order or cancel existing jobs based on priority.
- **No load-balancing** or service discovery.

  - Workers can come and go without updating anything - they simply start requesting work.
  - Workers only make outbound requests: they can safely run behind a NAT.
- **No isolated queues**: workers don’t accumulate their own backlog.

  - By sharing a global queue, performance (latency) is more uniform and can be FIFO or globally prioritized.
  - Workers decide when to take on work, and how much.
  - To stop, they finish their requests and don’t request more.
- **Multiplexed subscriptions**: clients can start jobs, disconnect, and re-subscribe to results. In fact, many clients can be subscribed to the result, since it is persisted outside of the scope of an active http request.

#### Challenges

- **Serverless hosting ecosystem**: workers need to be subscribed and are harder to dynamically wake up, compared to serverless hosting models that [wake on incoming HTTP requests](https://fly.io/docs/apps/autostart-stop/).
- **Failures are harder to detect**: the worker needs to periodically let the server know it’s still working. With “push” HTTP requests, failure can be detected automatically by the connection closing.
- **Additional overhead**: every request is persisted and flows through a subscription mechanism such as a pub/sub service, or database queries in Convex.

  - If the request is otherwise fast, the additional latency might be noticeable. It will affect the "average case" or "p50" performance.
  - If the requests are frequent and don’t otherwise require much database bandwidth, the overhead of tracking requests might be noticeable.

## Making the call: my experience

While pull-based solutions have a lot of benefits, this decision is highly sensitive to your application’s needs. I’ll contextualize this with my own experience deciding between push- and pull-based solutions for task distribution.

I used to run the team at Dropbox responsible for generating previews of user documents. If you’ve ever used the Dropbox website and looked through images, watched a video, or looked at a pdf preview of a Microsoft Office document, that file was processed by the system my team built and maintained. We thought deeply about load balancing, caching, and reliability. One fun statistic: if you removed the cache and processed the full file for every user’s request, it would amount to processing over one exabyte of data per day.

When we were re-architecting it, we considered both push & pull.

#### Why we wanted a pull-based solution:

1. **System utilization and maximizing throughput**. We had different classes of services optimized for different operations - video transcoding, windows emulation for office documents, etc. These machines knew their capabilities, and we were excited about a workflow where a machine could take on different types and quantities of work based on its available memory and CPU utilization.
2. **Absorbing and shedding load.** There were occasionally spikes of load that meant either failing requests, or saturating each service’s http queue and driving up latency for all users. With a queue we could have had more control over which requests we dropped and which requests we could continue to prioritize.
3. **Avoids service discovery.** Keeping track of which machines to route to introduces many opportunities for failure, especially during deployments:

1. When a backend dies, how soon will service discovery adapt?
2. When a machine comes online, how soon will it be discovered?
3. When service discovery fails (it does), how well can you keep serving traffic?

#### Why we ended up with a push-based solution:

1. **Our database wasn’t reactive:** determining from the backend when a job was available, or detecting when it was finished from the API server would have involved additional infrastructure.
2. **Predictability:** our infrastructure was based around discrete HTTP requests that flowed into gRPC services, not WebSockets and subscriptions. This influenced what tooling was readily available.
3. **High volume, low latency**: although occasional requests took minutes, most of our traffic was very high volume and low latency (~5ms). Incurring a database write per request would have overwhelmed the database, and a pub/sub subscription was too heavyweight.
4. **Uniformity:** there was a case for doing pull-based requests only for heavy operations like video transcoding, but we were a small team and didn’t want to maintain two sets of infrastructure.
5. **Monitoring:** we wanted to track latency and success statistics in a centralized place close to the request. Splitting the status across multiple metrics reported from different services and machines would have complicated our monitoring setup.

I don’t regret making that decision at the time. However, I do think some things have changed since then that enable the work stealing pattern for modern apps, such as **reactive databases**.

## Why reactive databases change the game

One big challenge with workers pulling work is connecting the result back to the client. If you want to return it in the client’s original request, the worker needs to know which API server to send the work to, and get the result to the right thread or process waiting for the request. Or it needs to leverage a pub/sub system where the worker is subscribed only for its own results. This “return address” problem ends up requiring a lot of nuance to get right at scale. For example, how long should the pub/sub system wait before dropping the message?

Since using Convex, I’ve come to appreciate separating data flow between queries, which are read-only, side-effect-free, consistent views of data, and mutations which are read-write transactions. This is an increasingly common separation, and greatly simplifies how you reason about data moving through a system, including for work stealing.

- A client subscribes to a view of data with a query. In the case of a chat app, it subscribes to recent messages in a channel. Whenever those messages are updated, regardless of who updated them, it gets a fresh view of the data.
- The work can be submitted to the API server (Convex in my case) whether it’s within the context of a client request or not. In the case of my chat app, the original request creates a placeholder message, and submits a job to fill out the message. When the worker generates and submits the message — whether it’s a partial update or the final result — all the API endpoint needs to know is what record(s) to update in the database.
- The communication channel — how users end up seeing the message — is the same as the application’s transactional data persistence: the reactive database. There’s never a case where a client receives a result but the result was never persisted, or where the result was recorded but the client missed the update.

I was pleasantly surprised how quickly this pattern came together for [llama farm](https://github.com/get-convex/llama-farm-chat), and am excited to see what novel architectures this enables.

## Summary

In this post we compared push-based load balancing with pull-based work stealing, as ways of distributing resource-intensive workloads. While the former is the traditional strategy, the latter brings a lot of benefits, provided you are able to separate your reads and writes.

Next steps:

- To learn more about optimizing for latency, I recommend reading the paper “ [The Tail at Scale](https://cacm.acm.org/research/the-tail-at-scale/)” if you haven’t read it already.
- To see an implementation of work stealing, read [this post](https://stack.convex.dev/implementing-work-stealing) about implementing llama farm, or read the code [here](https://github.com/get-convex/llama-farm-chat).
- Learn more about how Convex works [here](https://stack.convex.dev/how-convex-works).

### Footnotes

1. If you’re curious where the term “work stealing” comes from, [it is a scheduling algorithm for parallel computing](https://en.wikipedia.org/wiki/Work_stealing), specifically when there is one queue of tasks per process where another process can “steal” tasks (threads to execute) while idle. In our example, we simplify it to have one queue for the sake of explanation. At high scale, this technique at scale involves dividing requests into multiple queues, and having each worker interact primarily with a one or a subset of them, and stealing work from other queues when idle. Let me know [in Discord](https://convex.dev/community) if you'd be interested in an article on doing this at scale. [↩](https://stack.convex.dev/work-stealing#user-content-fnref-1)


Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started

We use third-party cookies to understand how people interact with our site.

See our [Privacy Policy](https://www.convex.dev/legal/privacy/) to learn more.

DeclineAccept