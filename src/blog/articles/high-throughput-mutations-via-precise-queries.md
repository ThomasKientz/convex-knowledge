# Optimize Transaction Throughput: 3 Patterns for Scaling with Convex and ACID Databases

![Lee Danilek's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F3c79cdc687d19f0b05080ae217ed23e00b239f79-594x603.jpg&w=3840&q=75)

[Lee Danilek](https://stack.convex.dev/author/lee-danilek)

4 months ago

# Optimize Transaction Throughput: 3 Patterns for Scaling with Convex and ACID Databases

![Optimize Transaction Throughput: 3 Patterns for Scaling with Convex and ACID Databases](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F15081ecb1ac81e72360c75494edfbcb04e645c46-1452x956.png&w=3840&q=75)

Here are some patterns to run more transactions per second — more concurrency leading to higher throughput.

This post will use Convex for examples, although the patterns are generalizable to any ACID database, especially one that uses optimistic concurrency control.

## What are Conflicts?

Two serializable transactions conflict if one of them reads or writes data that the other writes. If this happens, the transactions can’t run in parallel with each other, which reduces throughput.

There are several common workloads where the most obvious way to write the transactions will cause many conflicts. But the same workload can be changed to have fewer conflicts and higher throughput. Let’s look at some patterns you can apply to achieve your scaling goals.

## Pattern: Queue

For this workload, you’ve got a list of things and you want to process them as a batch. Here’s the standard code:

```ts
1export const enqueueEmail = mutation({
2  args: { recipient: v.string(), body: v.string() },
3  handler: async (ctx, args) => {
4    await ctx.db.insert("emails", args);
5  }
6});
7
8export const processBatchOfEmails = mutation({
9  args: {},
10  handler: async (ctx) => {
11    const emails = await ctx.db.query("emails").collect();
12    await ctx.scheduler.runAfter(0, internal.emails.sendEmails, { emails });
13  },
14});
15
16export const sendEmails = internalAction({
17  args: {},
18  handler: async (ctx) => {
19    await ResendClient.sendBatch(emails);
20    await ctx.runMutation(internal.emails.deleteBatchOfEmails,
21      { emails: emails.map((email) => email._id) });
22  },
23});
24
25export const deleteBatchOfEmails = internalMutation({
26  args: { emails: v.array(v.id("emails")) }
27  handler: async (ctx) => {
28    await Promise.all(emails.map((email) => ctx.db.delete(email)));
29  },
30});
31
```

It looks like we’re being very efficient, because we’re debouncing batches of emails to send them all at once. But wait! The `processBatchOfEmails` mutation is reading the whole “emails” table. That means it conflicts with every `enqueue` mutation. In there are too many email requests, `processBatchOfEmails` might never succeed because it’s blocked by continuous `enqueue` s. And if `processBatchOfEmails` doesn’t succeed, the set of emails keeps getting longer, so it’s likely to take longer next time, and even more likely to be blocked by a concurrent `enqueue`.

We can reduce conflicts by separating the reads in `processBatchOfEmails` from the writes of `enqueueEmail`. Notice that `enqueueEmail` writes documents with high `_creationTime`, so we can make `processBatchOfEmails` only look at documents with low `_creationTime`. Suppose it just takes the first 10.

```ts
1export const processBatchOfEmails = mutation({
2  args: {},
3  handler: async (ctx) => {
4    const emails = await ctx.db.query("emails").take(10);
5    await ctx.scheduler.runAfter(0, internal.emails.sendEmails, { emails });
6  },
7});
8
```

Or maybe it should take only emails that have been in the queue for more than 30 seconds.

```tsx
1export const processBatchOfEmails = mutation({
2  args: {},
3  handler: async (ctx) => {
4    const emails = await ctx.db.query("emails")
5      .withIndex("by_creation_time",
6        (q) => q.lt("_creationTime", Date.now()-30*1000)
7      ).collect();
8    await ctx.scheduler.runAfter(0, internal.emails.sendEmails, { emails });
9  },
10});
11
```

Despite appearances, this is more efficient than before, because now emails can be enqueued and sent at the same time. You need to call `processBatchOfEmails` repeatedly to make sure everything gets processed, but that was necessary before as well. As an additional benefit, you can avoid unbounded queries which might slow down the mutation or hit query limits.

I call this the “queue” pattern, because the table is acting as a FIFO queue. Insertions are at one end of an index range — in this example we’re using `by_creation_time` but it can be any index — and processing happens at the other end. If there’s enough incoming data that throughput would be obstructed by conflicts, then the ends of the queue are far enough apart to avoid conflicts.

If you want to see this pattern in practice, it’s used extensively in the Convex Workpool component.

## Pattern: Hot and Cold Tables

Splitting tables by temperature is useful if you’ve got large tables, with some fields that change often and some that rarely change. Let’s use a school roster for this example.

```ts
1export const sendEmailToAllStudents = mutation({
2  args: { body: v.string() },
3  handler: async (ctx, args) => {
4    for await (const student of ctx.db.query("students")) {
5	    await ctx.db.insert("emails", {
6        recipient: student.email,
7        body: args.body,
8      });
9    }
10  },
11});
12
13export const updateStudentGrade = mutation({
14  args: { student: v.id("students"), grade: v.number() },
15  handler: async (ctx, args) => {
16    await ctx.db.patch(args.student, { grade: args.grade });
17  },
18});
19
```

We’ve got two mutations here: one that sends an email to all students and one that updates a student’s grade. Notice that `updateStudentGrade` modifies the student, so `sendEmailToAllStudents` which reads the student documents will conflict with it.

One way to think about this table is that the “grade” field is updated frequently and only read from certain mutations, while “email” is updated infrequently and read from more mutations. In temperature terms, “grade” is a hot field and “email” is a cold field. So we can split them into separate tables and remove conflicts.

```ts
1export const sendEmailToAllStudents = mutation({
2  args: { body: v.string() },
3  handler: async (ctx, args) => {
4    for await (const student of ctx.db.query("students")) {
5	    await ctx.db.insert("emails", {
6        recipient: student.email,
7        body: args.body,
8      });
9    }
10  },
11});
12
13export const updateStudentGrade = mutation({
14  args: { student: v.id("students"), grade: v.number() },
15  handler: async (ctx, args) => {
16    const gradeDoc = await ctx.db.query("studentGrades")
17      .withIndex("by_student", (q) => q.eq("student", args.student))
18      .unique();
19    await ctx.db.patch(gradeDoc!._id, { grade: args.grade });
20  },
21});
22
```

The new “studentGrades” table holds hot fields, which are frequently written. This separates it from the “students” table which holds only holds cold fields, which are infrequently written and frequently read. Our two mutations have the same behavior as before, and

## Pattern: Predicate Locking

For this workload, you’ve got a value that’s changing frequently, and some other mutation checking it for abnormal values. I’ll also note we’re a ways into a post about transactions, and we haven’t mentioned bank accounts yet. Proceed with the standard code:

```ts
1async function getBalance(ctx: QueryCtx) {
2	const accountId = await getAccountId(ctx.auth);
3  return await ctx.db.query("balances")
4    .withIndex("by_account", (q) => q.eq("accountId", accountId))
5    .unique();
6}
7
8async function throwIfOverdrawn(ctx: QueryCtx) {
9  const balanceDoc = await getBalance(ctx);
10  if (balanceDoc.balance < 0) {
11    throw new ConvexError("you are overdrawn");
12  }
13}
14
15export const withdraw = mutation({
16  args: { amount: v.string() },
17  handler: async (ctx, args) => {
18    await throwIfOverdrawn(ctx);
19    const balanceDoc = await getBalance(ctx);
20    await ctx.db.patch(balanceDoc._id,
21      { balance: balanceDoc!.balance - args.amount }
22    );
23  },
24});
25
26export const issueLoan = mutation({
27  args: { amount: v.string() },
28  handler: async (ctx, args) => {
29    await throwIfOverdrawn(ctx);
30    await ctx.db.insert("loans", {
31      accountId: await getAccountId(ctx.auth),
32		  amount: args.amount,
33		});
34	},
35});
36
```

This code looks ideal, because it’s verifying the constraint that we want: you can’t issue a withdrawal or a loan to someone who has an overdrawn account. However, notice that `issueLoan` and `withdraw` conflict with each other, since they both read the “balances” document and `withdraw` writes to that document. If we really need high throughput, we can look for a better way.

How can you allow these mutations to run in parallel without changing their behavior? Use a “predicate lock” to look specifically for balances that are overdrawn.

```ts
1// before
2balances: defineTable(...).index("by_account", ["accountId"])
3// after
4balances: defineTable(...).index("by_account", ["accountId", "balance"])
5
```

This compound index appears useless at first glance, because there’s only once “balances” document for each “accountId”. But it enables the following trick:

```ts
1async function throwIfOverdrawn(ctx: QueryCtx) {
2  const accountId = await getAccountId(ctx.auth);
3  const balanceDoc = await ctx.db.query("balances")
4    .withIndex("by_account", (q) =>
5      q.eq("accountId", accountId).lt("balance", 0)
6    ).unique();
7  if (balanceDoc) {
8    throw new ConvexError("you are overdrawn");
9  }
10}
11
```

With this, we slightly change `issueLoan` and any mutation that only cares about checking for an overdrawn balance. The visible behavior stays exactly the same, but now it only reads documents where `balanceDoc.balance < 0`. If someone does a `withdraw` but the balance stays positive, you can do an `issueLoan` in parallel and the mutations won’t conflict.

For documents that change frequently between common states, other mutations can choose to only read documents in certain abnormal states. This improves throughput in the steady state, because the mutations usually don’t conflict.

## Recap

If you’re having problems with mutation throughput, it may be because the mutations are reading unnecessary documents. You can sculpt `ctx.db.query` s to only look at the essential documents, using patterns like making your table into a queue, splitting fields into hot and cold tables, and taking predicate locks on a field. As I was writing the Workpool component, I used all three of these patterns and more.

Once your transactions avoid conflicting with each other, your app can scale indefinitely.

Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started