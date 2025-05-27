# Going local-first with Automerge and Convex

![Ian Macartney's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F077753b63476b77fb111ba06d1bb538517033a54-3500x3500.jpg&w=3840&q=75)

[Ian Macartney](https://stack.convex.dev/author/ian-macartney)

6 months ago

# Going local-first with Automerge and Convex

![Building a collaborative task list using Automerge CRDTs and Convex sync](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Fe278179f0d06ef0a73688833216109993010a3d9-1452x956.png&w=3840&q=75)

I’ve spent some time recently figuring out how to use Convex and [Automerge](https://automerge.org/) together to enable local-first text editing UX:

- Collaborate with other people, without clobbering their changes.
- Continue editing offline when the network is slow, intermittent, or drops entirely.
- Local edits survive the browser closing or computer restarting and sync the next time you open the document with an internet connection.

I’ll walk you through how it works, how to think about adding local-first features to your app, and tips for specifically working with Automerge and Convex.

## Why local first?

Having to wait for a server to load & acknowledge every change in your app makes for a bad experience, and inhibits offline workflows. Local-first, among other things, is a commitment to the user’s experience of interacting with your app. Check out [this localfirst.fm podcast](https://www.localfirst.fm/1) for a good overview.

Storing and editing data locally provides a snappy, consistent experience. Syncing those changes to other clients enables multiplayer collaboration and works well with our multi-device world. For instance, to allow multiple users to make edits and not clobber each others’ changes, CRDTs (Conflict-free Replicated Data Type) can be used to merging distributed changes. One use case CRDTs excel at is merging text edits in a way that will usually result in a reasonable output string. [Automerge](https://automerge.org/) and [Yjs](https://docs.yjs.dev/) both have strong CRDT implementations and we’ll talk about Automerge specifically in this post.

It’s worth noting, however, that CRDTs are not the only way to achieve local-first UX. This article does a great job laying out the landscape of how server architecture works in the context of techniques like OT / CRDT: [https://mattweidner.com/2024/06/04/server-architectures.html](https://mattweidner.com/2024/06/04/server-architectures.html) and check out [An Object Sync Engine for Local-first Apps](https://stack.convex.dev/object-sync-engine) for a glimpse of how Sujay is thinking about local sync with Convex.

### A word of caution

I’d like to call out early that reasoning through distributed systems problems is not for the faint of heart, and going local-first can turn your problems into distributed state problems. While the UX can be magical, it can also incur a high cognitive cost, so it’s worth thinking through what tools you incorporate, and how that integrates with the rest of your app.

As we’ll discuss [below](https://stack.convex.dev/automerge-and-convex#crdt-considerations), you may decide to keep the server in the loop for parts of your app when consistency, correctness, or convenience are important. Thankfully, none of this needs to be either-or. We can use Automerge to manage CRDTs alongside Convex for the rest of the app’s data and backend needs.

## What is Automerge?

> **Automerge is a library of data structures for building collaborative applications.**

Automerge is a CRDT implementation, with a ton of libraries and optimizations to make it easy to build local-first collaborative apps. Specifically, they provide:

- Abstractions for capturing changes to JSON documents (not just strings!) and encoding them in a compact binary format that can be applied on other clients.
- Adapters to store those changes, such as the `IndexedDBStorageAdapter` which allows you to store the document contents and history in the browser, so it can be read & written offline, and persists across browser or computer restarts.
- Implements the CRDT merge logic to combine edits made by multiple clients in isolation into a single document version, and have every client agree what that version looks like, regardless of the order they received the updates.
- Opinionated conflict resolution logic with reasonable defaults and [“just picking one”](https://automerge.org/docs/documents/conflicts/) when necessary, which is reasonable for certain use-cases.[1](https://stack.convex.dev/automerge-and-convex#user-content-fn-1)
- Change idempotency: internally the encoded change has a history of each change and can de-duplicate changes, so they safely no-op when re-applied multiple times.
- Adapters to sync changes peer-to-peer. Even if you don’t plan to make a fully distributed app, you can use their `MessageChannel` or `BroadcastChannel` adapter to sync changes to other browser tabs, so they can stay in sync when offline editing.

Some code to help make it concrete:

```tsx
1// Get a type-safe reference to an Automerge document
2const [doc, changeDoc] = useDocument<TaskList>(docUrl);
3...
4// Handling edits of an <input> element
5<input
6  onChange={(e) =>
7	  changeDoc((d) => {
8	    updateText(d.tasks[index], ["title"], e.target.value);
9    })
10  }
11  value={doc.tasks[index].title}
12
```

```ts
1// Save a snapshot (includes the full edit history)
2const snapshot = A.save(doc);
3this.lastSync = A.getHeads(doc);
4...
5// Sync changes since the last sync point
6const previousDoc = A.view(doc, this.lastSync);
7const changes = A.getChanges(previousDoc, doc);
8const current = A.getHeads(doc);
9await syncTheChanges(documentId, changes);
10this.lastSync = current;
11
```

```ts
1// Apply new changes
2const docWithChanges = A.loadIncremental<TaskList>(doc, incrementalChanges);
3
```

### Under the hood

Automerge has some very cool structures and optimizations to efficiently store and manipulate the full history of changes to a document. Understanding these is not necessary for using it, but if you’re curious (or working with it at a low level) then read on. Otherwise you can skip to the [Tips section below](https://stack.convex.dev/automerge-and-convex#tips-for-structuring-your-data).

#### git-like

Similar to `git`, each change has an associated hash, one or more parents, and they use `heads` terminology in a similar way. Changes are represented as a directed graph of hashes, and can be queried to find all changes between two points. One difference is that they work with `Heads`, an array of hashes, rather than a single hash (by comparison a git commit has a single hash to identify it). You call `getHeads(doc)` to get a reference to the point in history of the document. Note: in practice I’ve found this is just one hash unless the document was created multiple times with the same ID and later merged.

#### Snapshots and incremental changes

The underlying storage interface differentiates between snapshots and incremental changes. However, thanks to the encoding of change dependencies, it is ok to have a change represented in multiple places. Each snapshot includes a full history, so one version of “sync” would be each client continuously uploading a snapshot, and “applying” each others’ snapshots. When applying, it internally skips all the previously-applied changes, and only applies the previously unseen changes. For efficiency, incremental changes can be saved either individually (from [`getLastLocalChange`](https://automerge.org/automerge/api-docs/js/functions/getLastLocalChange.html)), or as a series of changes (from [`getChanges`](https://automerge.org/automerge/api-docs/js/functions/getChanges.html)), and applied with [`applyChanges`](https://automerge.org/automerge/api-docs/js/functions/applyChanges.html) as a list of changes or with [`loadIncremental`](https://automerge.org/automerge/api-docs/js/functions/loadIncremental.html) as a single binary blob with all of the changes appended together.

The IndexedDB storage uses a single binary buffer of changes so it can store multiple changes at once, and save both as a single binary blob, and load all of them together. The main difference with a snapshot, then, is merely the expectation that it goes back to the beginning of the document’s history (allowing it to fully hydrate a document), though both are a series of changes under the hood.

#### Actors

Each change is attributed to an “actor” - which can be thought of as a browser tab. This means it doesn’t perfectly correspond to a user. A single user can show up as multiple actors if they have multiple tabs open, and their actor identity shouldn’t be trusted to be stable. However, a given actor enables the system to provide a sense of causal changes. Modeling each change done by an actor as a sequence allows their merge algorithms to implement a version of “last writer wins” that is consistent across clients.

### Tips for structuring your data

Here’s some tips for working with CRDT data structures.

#### Generate IDs for objects

When generating an array of objects, generate a random ID for each one to track which is which, versus using an indirect reference like the index. When using something like React, you’ll want a `key` that is stable even while creating new elements are being created by other users. This also allows you to consistently identify the data you just created, so you can focus it. See [here](https://github.com/ianmacartney/automerge-convex-quickstart/blob/hosted/src/App.tsx#L24) for an example using `crypto.randomUUID()`.

#### Be mindful of schema migrations and versioning

You are responsible for the data format and migrations within the CRDT. The binary encoding is not validated by the database layer (Convex or otherwise). If you want to change data formats, you need to modify new documents, documents currently stored in the database, and documents that are on clients that haven’t synced yet. When in doubt, follow general best practice for graceful migrations: type new fields as optional, don’t change the type to required unless you have ensured a backfill migration has been run on it, and mark deprecated fields as optional and keep the declaration around in code even after you stop using them, unless you know for sure the value has been cleared, to avoid future surprises. See the [automerge docs](https://automerge.org/docs/cookbook/modeling-data/#versioning) for more tips on handling versioning and migrations.

#### Clearing history

If you want to clear out older history, you can create a new document with the value of the old snapshot. However, changes made to the old document can’t be applied to the new document, so ensure clients have synced their changes before making the change.

#### Using the Automerge ID as a foreign key

Use the Automerge document ID as a foreign key in your other data.

In the demo we store it in the URL hash, which means the client doesn’t need to look up any server data to know what data to look for locally. However, this means migrating the data to a new document will break the link, and we also can’t generate a new link to the same document, if it gets publicly leaked.

You can also store the ID in another automerge document, but be aware that Automege doesn’t provide consistency guarantees between documents. You might get an update with a reference to a document you don’t have synced yet, or sync a document before seeing it show up as a reference in the related document.

By storing it in a normal database document, you can have an index on it, allowing you to look up related documents, enforce uniqueness, and other standard relational database features. For instance, you might have a “blogs” table that has a reference to the blog content’s automerge document ID. When the automerge content changes, we can find the associated blog post record in the table, authorize that the change is being made by an approved author, push changes to a CDN for the given URL, etc.

We’ll see more examples of what you get when you pair CRDT structures with a backend system in the next section.

## Syncing CRDTs with Convex

Now that we’ve looked at what CRDTs like Automerge can provide, let’s bring the server into the mix. With a centralized server, you can:

- Sync changes between users, even if no two users are online at the same time.
- Authenticate users, and authorize operations to prevent users from seeing or modifying data.
- Add structured relationships between automerge documents and other app data.
- Enables server-driven workflows, like scheduling the daily creation of a new shared document, or updating a document when receiving a web hook from a third party.
- Load data for Server-Side Rendering, so your client can see data on the first page load before their client loads IndexedDB or syncs the latest changes.

### Automerge Convex Quickstart

I’ve hooked up Automerge and Convex in [this open-source repo](https://github.com/ianmacartney/automerge-convex-quickstart) forked from [Automerge’s quickstart](https://github.com/automerge/automerge-repo-quickstart). There is a hosted version of it [here](https://labs.convex.dev/automerge). The basic setup is there is a Convex backend that coordinates with an [Automerge Repository](https://automerge.org/docs/concepts/#repositories) so local changes get synced to the server, and remote changes get synced down and applied. The setup:

```tsx
1// src/main.tsx
2const automerge = new Repo({
3  network: [],
4  storage: new IndexedDBStorageAdapter(),
5});
6
7const convex = new ConvexReactClient(convexUrl);
8
9sync(automerge, convex);
10
```

The `sync` function talks to endpoints defined in `convex/sync.ts` that stores the data in a Convex table:

```ts
1// convex/schema.ts
2export default defineSchema({
3  automerge: defineTable({
4    documentId: v.string() as VString<DocumentId>,
5    type: v.union(v.literal("incremental"), v.literal("snapshot")),
6    hash: v.string(),
7    data: v.bytes(),
8  })
9    .index("doc_type_hash", ["documentId", "type", "hash"])
10    .index("documentId", ["documentId"]),
11});
12
```

This is intended as a demo to show how Convex can be used as a sync engine, and should be treated as an alpha release. I’m working on encapsulating this in a [Convex Component](https://www.convex.dev/components) to make it easy to drop into new or existing projects, without adding anything to your own schema. Stay tuned for updates (join [our Discord](https://convex.dev/community), follow me on ~~Twitter~~ ~~X~~ [Twitter](https://twitter.com/ianmacartney), or ).

### Sync logic

The sync employed here roughly matches what is outlined in the [Map of Sync](https://stack.convex.dev/a-map-of-sync) post under Automerge. The rough flow of the logic is:

1. When the Automerge repo starts tracking a new document, read the data from IndexedDB and new changes from the server. If we haven’t pulled from the server before, download all changes from the server. If we have data and haven’t submitted anything to the server before, submit a snapshot of the local data.
2. Subscribe via paginated queries to server changes, fetching new pages whenever new data is available (using Convex’s built-in realtime query subscriptions). Apply all changes we haven’t seen before, identified by `_id`. The new data comes from a subscription on `_creationTime`, which is when the change was saved on the server (not when it was created by a client, potentially offline). When we get new changes, we update the latest `_creationTime` we’ve seen,[2](https://stack.convex.dev/automerge-and-convex#user-content-fn-2) so future loads can start subscribing from there.[3](https://stack.convex.dev/automerge-and-convex#user-content-fn-3)
3. When a document changes locally (by subscribing to the Automerge document’s change handler), we calculate the changes between the last synced server state and our current state(”heads”). We submit those changes as an incremental change via a mutation.
   - The Convex client provides a lot of guarantees around mutations that help us out here. When Convex is offline, a mutation will be queued up to be sent when the connection reconnects. Mutations also support idempotent delivery, so even if there is a network or server failure, when the client reconnects it will ensure the mutation is run exactly once.
   - This function has some logic to ensure it is [single-flighted](https://stack.convex.dev/throttling-requests-by-single-flighting). Any changes made while one request is in flight will be picked up by the next request.
   - If multiple clients in different browser tabs observe the same change by the same actor, we de-duplicate changes server-side with a hash of the contents. And even if changes get stored in duplicate, they internally de-duplicate when being applied.
   - Since submitting changes and snapshots can safely be inserted in parallel with other clients, many users can all be making changes at once without causing any database conflicts.
4. Occasionally, we can compact changes into a snapshot, so new clients can sync a single document instead of thousands of small changes. This has been implemented in a way to avoid conflicts with concurrent submissions of changes or snapshots.

**Note**: there are many ways of structuring this sort of sync. I considered a series of approaches before landing on this one, and all have their merits in different usecases.

### Using Automerge in a serverless environment

Traditionally, Automerge is used in a long-lived server environment, such as in a browser or node server. In the serverless world powered by lightweight runtimes, there are some practical considerations when using Automerge, since it relies on wasm.

When using it in Convex, I’d recommend using the automerge library server-side from a node action that can load the wasm as part of the installation process. To do this, put your automerge in actions in a file with `“use node”;` at the top, and add a `convex.json` file at the root of your project with contents: `{ "node": { "externalPackages": ["@automerge/automerge"] } }`. Then you can use imports like `import * as A from "@automerge/automerge/next";` and everything will just work.

If you need to use Automerge in a query or mutation, those run in the Convex v8 runtime (similar to deno and other runtimes). In those cases, use the [escape hatch documented here](https://automerge.org/docs/library_initialization/#the-escape-hatch). It might look like:

```ts
1import * as Automerge from "@automerge/automerge/slim/next";
2// @ts-expect-error wasm is not a module
3import { automergeWasmBase64 } from "@automerge/automerge/automerge.wasm.base64.js";
4
5async function load() {
6  return Automerge.initializeBase64Wasm(automergeWasmBase64 as string);
7}
8
9async function automergeLoaded() {
10  await Automerge.wasmInitialized();
11  // This is unnecessary, but as a pattern I use this return value
12  // so all code referencing Automerge has waited for wasm to load.
13  return Automerge;
14}
15
16/** Fetches an Automerge document's contents */
17export const doc = query({
18  args: { documentId: v.string() },
19  handler: async (ctx, args) => {
20    // Start loading wasm in parallel with querying data
21    void load();
22    const result = await ctx.db
23      .query("automerge")
24      .withIndex("doc_type_hash", (q) => q.eq("documentId", args.documentId))
25      .collect();
26    // Ensure we wait for wasm to fully load before using it
27    const A = await automergeLoaded();
28	  return A.loadIncremental(
29	    A.init(),
30	    mergeArrays(result.map((r) => new Uint8Array(r.data)))
31	  );
32	},
33}
34
```

Note: loading wasm from a string can add up to 200ms to each request, so try to avoid it when possible. If your clients are trusted to maintain data validity, it’s simpler to do the Automerge operations client-side, and have the server merely pass around the efficient binary changes. This is what the demo does.

You can still enforce authorization and authentication without loading Automerge server-side, but you lose the ability to audit the content of each change on the server. Let’s look next at some options for validating and capturing data when you want to enforce invariants beyond what CRDTs can guarantee.

### Data touch points

As is, the sync mechanism will sync any Automerge document. To validate the document, you can materialize a version of it at various points, depending on your requirements:

- You should eagerly validate the data client-side, to prevent bad changes at the source.
- You can validate the data when you create a new snapshot server-side. It is already reading all of the data, so it is a convenient time to work with the concrete value. This can also be a point where you save the concrete value elsewhere for indexing, ease of querying, etc. For validation, you could treat incremental changes as merely suggestions until they are compacted and resolved into a snapshot.
- To validate every change server-side at submission time, you can use a node action to load the full document, see the document value with the change applied, validate it, then save or reject the change. However, there is still the chance that two independent changes will be valid in isolation but not when combined. To fix this, we need to serialize the changes.
  - One version of this over-writes a single snapshot every time, so there’s only one version of the document server-side.
  - Another more efficient approach adds an incrementing sequence number to each change. Two parallel requests will attempt to use the same sequence number and conflict, allowing you to try again with the latest data.
  - Thanks to Convex’s transactions, which provide serializable isolation, both of these approaches are safe. You can compare the current state (e.g. last snapshot version or latest sequence number) when inserting to ensure there haven’t been any racing writes. However, if there are frequent concurrent writes to a document, loading the full document and validating the result will cause a lot of data reads and [OCC conflicts](https://docs.convex.dev/error).

If you want to reject a change server-side, you need to structure it in Automerge as yet another additive change, like a `git revert` commit reversing the changes of a previous commit. Automerge intentionally doesn’t make it easy to scrub a change out of history across all clients it may have been synced to. To implement undo, I would check out using [`automerge-patcher`](https://github.com/onsetsoftware/automerge-patcher) along with `A.diff` to craft a change inverse, as undo functionality was cut for version 1.0 ( [feature request here](https://github.com/automerge/automerge/issues/985)).

## CRDT Considerations

Using CRDTs for your data model comes with making some concessions worth considering before committing. As James and Jamie often say in the [Databased Podcast](https://www.convex.dev/podcast), it’s easier to start with stronger guarantees and decide when to weaken them, rather than to start with weaker guarantees and try to build stronger guarantees out of weaker ones.

Here are three C’s to consider for CRDTs: Consistency, Correctness, and Convenience.

### Consistency

- The data that updates via a CRDT doesn’t have any consistency guarantees with other parts of your data by default. If your data is split between CRDT documents, there is nothing built into Automerge guaranteeing that changes will happen in lockstep. If you data is in one CRDT document, merges may choose a resolution in one part of your document that doesn’t match an expected change in another part.
- You may have a combination of local changes and server state that is distinct from every other client and server’s view of the data. It is hard to make strong guarantees about the data relations you have at any given time, when there isn’t a central authority consolidating the mess. It is up to you to reason through all of the intermediate states clients can be in, and to defend against clients who submit changes to the data that don’t match your client’s expectations.
- By comparison, structuring local edits as non-authoritative optimistic updates on top of otherwise-consistent-by-design server data structures the local writes as pending.

### Correctness

- The parts of your data model that you structure via CRDT will not change transactionally with other data by default. This affects consistency, as we just discussed, but can also impact correctness when you use that data to make decisions. If a project is being reassigned to another user, is there a time where the old project owner could be charged, but the new owner gets the email receipt? When you want to express data dependencies and discrete state changes, transactions are the right tool for the job, and it’s often worth waiting until you have an internet connection to validate whether it went through or not, before continuing on.
- There is often a subset of application state that should not allow arbitrary client changes. Is this user an admin? Have they paid their bill? Are published tweets editable? Even if you write good client code, you can’t assume that all connected clients are running your code. I’d urge you to evaluate important state-related decisions in a trusted environment behind auth checks.
- Automerge uses “last writer wins” conflict resolution, which may often result in what you want, but may also lead to invalid and missing data. If you’re working with a CRDT and have the thought “it would be really bad if this gets lost” then I’d capture that data change elsewhere or invest in some lucky charms (why choose?).

### Convenience

This point is interesting since there are a ton of conveniences provided both by CRDTs and server-federated operations. Depending on your architecture, you may move much faster in a local-first codebase, or you might end up reinventing web3 to build a simple Twitter clone.

- If the user can make significant edits solo or offline, it’s much more convenient to work with local data, and have the client “drive” the interaction. If the user’s workflow communicates with other web services anyways, it’s more convenient to drive the flow from the server, which can track a durable workflow and react to webhooks from third party services.
- If multiple users are simultaneously editing data that is highly visible (e.g. a todo item description, or its checkbox status), CRDTs are incredibly convenient. It’s easier for a user to correct bad conflict resolutions as they see them, rather than think through innumerable permutations of user actions and trying to infer intent. However, if the data model is not easily surfaced to the user and therefore bad merges are hard to detect and surface, it’s much more convenient (for you the programmer!) to hold a single “golden” version with carefully federated changes. This can still be a local-first experience, but might look like claiming a write lock on a document before you can submit changes, to enforce a linear history.
- If the ratio of data reads to writes is heavily read-skewed (such as media-driven or e-commerce), sync can be an annoying level of indirection to work with. There are two insights here: first is that often the app has a much clearer idea of the most urgent data to fetch, rather than a sync engine; second is it’s really convenient to have a mutation that I can await, knowing that it went through successfully when the promise resolves. If the writes are infrequent but important, I actually prefer waiting for 🔄 to become ✅.

### Thought exercise: public computers

As an aside to make some of these points concrete, let’s consider a use-case that is less commonly considered in local-first design: supporting users accessing your site from a shared browser, such as a public computer.

- Can you quickly show them data and enable quick actions without loading the full history on every new client?
- Can you prevent the next user from seeing their data? Will you need to track all their locally-persisted documents and delete them in the case they click “Log out”? Will you delete data regardless whenever a user’s auth credentials expire? What if your website is never visited again, and sensitive data is orphaned?
- Will you encrypt the automerge binary contents, or just refuse to persist any data if they indicate it’s a public computer on sign-in?

I’m interested in your takes! Drop me a note in [the Discord comments](https://convex.dev/community).

## Summary

We looked at considerations for building local-first features, syncing Automerge CRDTs with Convex, and tips for using both systems. To see it in action, check out the [hosted demo](https://labs.convex.dev/automerge) and [repo](https://github.com/ianmacartney/automerge-convex-quickstart), and stay tuned for an automerge [component](https://www.convex.dev/components).

[ianmacartney/ **automerge-convex-quickstart**\\
\\
What are you syncing about? Automerge and Convex!\\
\\
![GitHub logo](https://stack.convex.dev/logos/github.svg)](https://github.com/ianmacartney/automerge-convex-quickstart)

### Footnotes

1. Note: there is a capability to detect conflicts and one could theoretically provide a UI to a user with both versions of the data, but the current API is underpowered and requires a level of defensiveness that gives me the impression that they don’t expect regular usage. You need to check for conflicts after each change (no support for a range), and check each field individually. [↩](https://stack.convex.dev/automerge-and-convex#user-content-fnref-1)

2. One nuance is that we only persist the latest `_creationTime` we’ve seen once we know the new changes have been flushed to disk. If the user’s browser closes or crashes before in-memory changes have been saved, we want to re-fetch those changes next time. [↩](https://stack.convex.dev/automerge-and-convex#user-content-fnref-2)

3. There is one edge case when paginating by `_creationTime`: multiple mutations running and inserting around the same time might insert slightly out of order: a later mutation might insert a document with a `_creationTime` slightly earlier than the mutation that ended earlier. Thankfully this won’t cause any issues with the regular paginated queries, [since they are reactive and avoid gaps and duplicate entries by journaling their end cursor](https://stack.convex.dev/fully-reactive-pagination). However, the initial query for changes since a specific time might miss changes inserted around the same time. To account for this, the query for our first page also fetches the changes that came just before our last seen `_creationTime`. [↩](https://stack.convex.dev/automerge-and-convex#user-content-fnref-3)


Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started

We use third-party cookies to understand how people interact with our site.

See our [Privacy Policy](https://www.convex.dev/legal/privacy/) to learn more.

DeclineAccept