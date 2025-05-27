# AI Agents with Built-in Memory 

![Ian Macartney's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F077753b63476b77fb111ba06d1bb538517033a54-3500x3500.jpg&w=3840&q=75)

[Ian Macartney](https://stack.convex.dev/author/ian-macartney)

2 months ago

# AI Agents with Built-in Memory

![Manage agent workflows with ease](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F568550a3c5a9f2a771a957271e1c537d0a45bc63-2400x1260.png&w=3840&q=75)

Are you trying to build an Agent? An Agentic Workflow? An AI ChatBot?
One of the challenges of building multi-step flows is managing the persistent state (e.g. chat messages) through a web of steps with different agents, and intelligently retrieve them for prompt context in the future. The new Agent component allows you to rapidly define and build agents, and incorporate them into complex workflows.

Some of the things [Agent component](https://www.convex.dev/components/agent) makes easy for you:

- Automatically store messages in user-specific threads that be handed off between agents.
- Search messages via hybrid text and vector search and inject them as context (opt-in and configurable).
- Define and use tool calling that support real-time, reactive queries so clients can see progress of asynchronously-executing workflows.

## What’s an agentic workflow

There’s been a lot of interest recently in making asynchronous agentic workflows with memory.

Here’s what I mean by those terms:

- **Asynchronous:** Long-lived operations that either happen from a user-initiated action, like asking a question in a support chat, or a trigger: a web hook, cron, or previously scheduled function.
- **Agentic:** Conceptual units of responsibility that are “responsible” for something specific and have a set of actions (tools) available to them. Most often these look like calling an LLM.
- **Workflow**: A set of functions that get called, passing context from one to another. The simplest version of this is a single function that calls agents (functions) and eventually returns a result. A fancy version of this looks like the [Workflow component](https://www.convex.dev/components/workflow) with Inngest-inspired syntax that runs durably (more on that below).
- **Memory:** Contextual data that is saved and retrieved, for the use of informing future chats. This could be previous chat messages, use-case-specific data, or in the case of [AI Town](https://www.convex.dev/ai-town), reflections on conversations and previous memories.

#### Is this a new concept?

If you’re familiar with RAG, tool-calling, mixture of experts, dynamic dispatch, and durable functions, this should all be familiar. If not, don’t sweat it; fancy words are often simple concepts. The “tricks” involved are:

- Break down a given task into pieces accomplished by specific LLMs models with domain-specific prompting.
- Provide context to the LLM by using some combination of vector, text, and recency searches.
- Allow the LLM to decide to “call out” to a “tool” when it needs more information or wants to take action. A good example of this is reading/writing code in a GitHub repo.
- Run the workflow “durably” - allowing each unreliable step to have some retry behavior, and allow the overall function to recover after server crashes, always running to completion. [Read more about why I’m excited about that here](https://stack.convex.dev/durable-workflows-and-strong-guarantees).

## What does it look like

To get concrete, let’s look at defining an agent using my new [Agent component](https://www.convex.dev/components/agent)

### Defining an agent

```tsx
1import { Agent } from "@convex-dev/agent";
2import { components, internal } from "./_generated/api";
3import { openai } from "@ai-sdk/openai";
4
5const supportAgent = new Agent(components.agent, {
6  chat: openai.chat("gpt-4o-mini"),
7  textEmbedding: openai.embedding("text-embedding-3-small"),
8  instructions: "You are a helpful assistant.",
9});
10
```

### Starting a conversation

```tsx
1export const createThread = action({
2  args: { prompt: v.string() },
3  handler: async (ctx, { prompt }) => {
4+   const { threadId, thread } = await supportAgent.createThread(ctx, {});
5+   const result = await thread.generateText({ prompt });
6    return { threadId, text: result.text };
7  },
8});
9
```

### Continuing a conversation

```tsx
1export const continueThread = action({
2  args: { prompt: v.string(), threadId: v.string() },
3  handler: async (ctx, { prompt, threadId }) => {
4    // This includes previous message history from the thread automatically.
5+   const { thread } = await supportAgent.continueThread(ctx, { threadId });
6+   const result = await thread.generateText({ prompt });
7    return result.text;
8  },
9});
10
```

### Using tools

Tools are functions that the LLM can call. We use the [AI SDK Tool](https://sdk.vercel.ai/docs/ai-sdk-core/tools-and-tool-calling) syntax

Configuring tools:

```tsx
1const supportAgent = new Agent(components.agent, {
2  chat: openai.chat("gpt-4o-mini"),
3  textEmbedding: openai.embedding("text-embedding-3-small"),
4  instructions: "You are a helpful assistant.",
5+ tools: { accountLookup, fileTicket, sendEmail },
6});
7//...
8  // or per-invocation in an action
9  await thread.generateText({
10    prompt,
11+   tools: { accountLookup, fileTicket, sendEmail },
12  });
13
```

Defining Convex tools that have access to the function’s context, including `userId`, `threadId`, `messageId`, and the action `ctx` object which you can use to call queries, mutations, or actions:

```tsx
1export const ideaSearch = createTool({
2  description: "Search for ideas by space-delimited keywords",
3  args: v.object({ search: v.string() }),
4+ handler: async (ctx, { search }): Promise<Doc<"ideas">[]> =>
5+    ctx.runQuery(api.ideas.searchIdeas, { search }),
6});
7
```

### Incorporating into a durable workflow

```tsx
1import { components, internal } from "./_generated/api";
2import { WorkflowManager } from "@convex-dev/workflow";
3
4const workflow = new WorkflowManager(components.workflow);
5// The `internal.example.foo` syntax is a Convex function reference
6const supportAgent = ;
7
8export const supportAgentWorkflow = workflow.define({
9  args: { prompt: v.string(), userId: v.string() },
10  handler: async (step, { prompt, userId }) => {
11+   const { threadId } = await step.runAction(
12+	    internal.example.supportAgentStep,
13+	    { createThread: { userId },
14    );
15+   const result = await step.runAction(
16+	    internal.example.supportAgentStep,
17+     supportAgentStep, { threadId, generateText: { prompt } }
18    );
19    console.log(result);
20    // Call other agents here
21  },
22});
23
```

### Subscribing to asynchronously-generated messages

This will fetch the thread’s messages, and re-run whenever new messages are created (within the query range). React clients can subscribe to the results with `useQuery`.

```tsx
1export const getThreadMessages = query({
2  args: { threadId: v.string() },
3  handler: async (ctx, { threadId }) => {
4+   return await ctx.runQuery(
5+     components.agent.messages.getThreadMessages,
6+     { threadId, limit: 100 });
7  },
8});
9
```

### Using a user’s previous conversations as context manually

If you don’t want the automatic behavior, you can fetch messages yourself

```tsx
1const messages = await supportAgent.fetchContextMessages(ctx, {
2  userId,
3  messages,
4  recentMessages: 10,
5  includeToolCalls: false,
6  searchOtherThreads: true,
7  searchOptions: {
8    limit: 10,
9    textSearch: true,
10    vectorSearch: true,
11    messageRange: { before: 2, after: 1 },
12  },
13});
14// do customization and add a final prompt message
15const result = await thread.generateText({
16  messages,
17  saveAllInputMessages: false,
18  saveAllOutputMessages: false,
19  recentMessages: 0,
20  searchOptions: { limit: 0 },
21});
22
```

### Retrying pesky LLMs who mean well but frequently goof up

Per-agent call retries (immediate, accounting for LLM blips):

```tsx
1const supportAgent = new Agent(components.agent, {
2  chat: openai.chat("gpt-4o-mini"),
3  textEmbedding: openai.embedding("text-embedding-3-small"),
4  instructions: "You are a helpful assistant.",
5  maxRetries: 3,
6});
7
```

Retrying the whole action if the server restarts or the API provider is having issues by using the Workpool or Workflow components. This will use backoff and jitter to avoid thundering herds.

Workpool:

```tsx
1const workpool = new Workpool(components.workpool, {
2  maxParallelism: 10,
3  retryActionsByDefault: true,
4  defaultRetryBehavior: {
5    maxAttempts: 5,
6    initialBackoffMs: 1000,
7    base: 2,
8  },
9});
10
```

Workflow:

```tsx
1const workflow = new WorkflowManager(components.workflow, {
2  workpoolOptions: {
3    maxParallelism: 10,
4    retryActionsByDefault: true,
5    defaultRetryBehavior: {
6      maxAttempts: 5,
7      initialBackoffMs: 1000,
8      base: 2,
9    },
10  },
11});
12
```

## How does it work

Under the hood, it stores threads, messages, and steps separate. Steps are more verbose outputs of each tool call and generated message, with enough metadata to inspect usage, replay exact requests, etc.

When you make a call from the thread-specific functions, it saves the input prompt (or the last message if you pass in an array of message[1](https://stack.convex.dev/ai-agents#user-content-fn-1)), and as it executes, it saves intermediate steps as it goes. It marks it all as pending until it’s done. If it fails and you call it again, it’s useful to not include the previous partial results, so if it sees pending steps when starting, it will mark them as failed.

The messages and steps are query-able by thread, status, and whether they’re tool calls or not, so you can subscribe to only what you need, avoiding excessive database bandwidth and function calls.

If you provide a text embedder, it will asynchronously generate embeddings for each message, once it completes successfully (no embeddings of results that end up failing). These will be available to vector search per-thread and per-user, if the thread is user-specific.

If you don’t provide a user when initializing the thread, it will only search messages from that thread. If you do provide a `userId` to `createThread` and `continueThread`, you can opt-in to searching that users’s messages in any thread by passing `searchOtherThreads: true`.

## Should I do it myself or use a framework?

Yes! By that I mean, it depends. **tldr:** use a framework until you have a specific need, and pick a framework that makes the off-ramp easy.

#### Use a framework

With any framework or abstraction, it provides value by being opinionated. C is more restricted and opinionated than assembly. React is more restricted and opinionated than raw html.

By using a framework:

1. You get started faster versus reinventing abstractions. It’s fun to implement RAG the first time, less so the tenth.
2. You leverage work that improves over time, with a simple `npm upgrade`.
3. There are cohesive possibilities, for instance combining message history with usage tracking or rate limiting.

#### Don’t use a framework

However, sometimes those opinions can get in the way. From what I hear, most “real” apps abandon LangChain once they want more control over the prompting and internals. Michal [wrote up a good piece about this](https://stack.convex.dev/are-vector-databases-dead#langchain) a year ago after implementing RAG three ways.

The specific pitfalls of these libraries:

1. It isn’t clear what it will and won’t do, or how it works. Ideally it uses existing language, concepts, and syntax, unless there’s an important reason to invent a new concept. For instance, while there are arguably better APIs for LLMs than OpenAI’s `{ role: "user", content: prompt }`, it’s become a de-facto standard and a reasonable enough API.
2. They don’t expose enough knobs and dials so users can tune the prompt to their use-case. In my case, exposing custom system prompts and parameters to determine how many messages to fetch, whether to use text and/or vector search, and how much context around those messages to fetch.
3. They are monolithic. They don’t allow using composable pieces, for instance being able to use it for message querying and storage but calling the LLM with custom context.
4. They use Domain-Specific Languages instead of allowing writing “just code.” While they can aim to be infinitely flexible, code ends up being more readable and composable in my opinion. DSLs are great for many use-cases, but when you want more control, it’s nice to have an escape hatch.

I tried my best to avoid these with my Agent component. If you have thoughts or opinions, please open [a GitHub issue](https://github.com/get-convex/agent/issues)! 🙏

#### Do both

As an example (and because I just released it and am proud of it), here’s how you could use pieces of my component, without buying into the whole system:

- You can call them synchronously from clients, or asynchronously produce results that users can subscribe to via [queries](https://docs.convex.dev/tutorial/).
- You can call the agents directly from Convex HTTP endpoints or serverless functions. You don’t have to use the fancy Workflow component.
- You can pass in custom context (messages) and not have it do any automatic context injection. This is useful if you’re pulling data from your own database tables or third-party resources.
- You can do message search without calling an LLM, if you want to leverage its memory and modify it before making the call to generate anything.
- You can save messages explicitly, instead of having it save them by default.
- You can use any third-party tool that works with the AI SDK and can run in a serverless function (think: AWS lambda Node environment, with some limits on bundle and memory size).
- You can create, paginate, modify, and delete the underlying embeddings. This is useful if you want to re-embed everything with a new model. By default, embeddings are isolated by model and embedding size, so you’ll never get results from a different model’s vector.
- You can wrap tools with your own code, to add custom logic, validation, guardrails or transformations.

## A platform that grows with you

If you aren't excited yet, here's some features that the component can support in the future, by using this foundation:

- Per-user usage tracking for tokens.
- Rate limiting configurations per-user to prevent abuse from individual users or global limits to avoid hitting external API limits.
- Dashboard playground UI to:
  - Visualize tool calling graphs.
  - Inspect and replay past conversations while tuning prompts.
  - Interactively debug failed generations.
  - Search messages while tuning search parameters for your usecase.
  - Replaying failed steps and exporting evals to prevent regressions once you get it working.
- Nested agents as tools in other agents, to allow automatic dispatching from agents to each other automatically. One decision here is whether to fail the whole graph if one agent fails, and whether to roll the whole graph back if failure is detected later on.
- File-search and other memory: upload data per-user or globally to use for vector search for RAG. You can already do this in Convex by chunking, embedding and searching yourself, but Agent can make it easy and automatic.
- A “virtual file system” tool so agents can take actions on files with file version control: especially helpful for apps doing code generation.
- Embedding-based agent router for faster RAG by using [Guardrails, or Semantic Vector Spaces](https://www.pinecone.io/learn/fast-retrieval-augmented-generation/#RAG-with-Guardrails) to decide what to do, instead of asking an LLM.
- A “working memory” context feature that the LLM can periodically update on a per-thread basis.

Whether and when I build these will depend on your feedback , so let me know in [GitHub issues](https://github.com/get-convex/agent/issues) what sounds useful to you.

## Summary

With agents you can organize and orchestrate complex workflows. With the new Agent component, you can store and retrieve message history automatically.

As always, let me know what you think [in Discord](https://convex.dev/community), on [🦋](https://bsky.app/profile/ianmacartney.bsky.social)  or on [𝕏](https://x.com/ianmacartney)

### Footnotes

1. If you pass `saveAllInputMessages: true` it will save all of the messages automatically. The default is `false` since it’s common to pass in a lot of custom context that should not be saved, then a final question. [↩](https://stack.convex.dev/ai-agents#user-content-fnref-1)


Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started