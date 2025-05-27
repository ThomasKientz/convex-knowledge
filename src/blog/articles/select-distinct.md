# SELECT DISTINCT without SQL

![Nipunn Koorapati's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F356ab217d41d241d51c70d467f187322bdab16fa-384x384.webp&w=3840&q=75)

[Nipunn Koorapati](https://stack.convex.dev/author/nipunn-koorapati)

a year ago

# SELECT DISTINCT without SQL

![A magnifying glass looking for a specific property next to a database, representing SELECT DISTINCT in SQL](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F92054aead711e0c745e3dd3d7c882c8548f3e4b9-1452x956.png&w=3840&q=75)

### What is SELECT DISTINCT?

The `SELECT DISTINCT` statement is a SQL command commonly utilized to retrieve unique records from the database. The `DISTINCT` clause eliminates duplicate values in the result set, ensuring that each returned row is distinct based on specified criteria. It’s a powerful and useful feature of [most databases](https://stack.convex.dev/convex-vs-relational-databases&sa=D&source=docs&ust=1732326426081485&usg=AOvVaw2-qhGFjbpLGPV4oBfFMyXY).

Suppose you have a table named Customers with the following columns: CustomerID, CustomerName, City, and Country. You want to retrieve a list of unique cities where your customers are located. You would use the following `DISTINCT SQL` query to achieve this:

```sql
1SELECT DISTINCT City
2FROM Customers;
3
```

To achieve this functionality, the database does a lot of work behind the scenes. Specifically, it will use its [query planner](https://en.wikipedia.org/wiki/Query_plan) to create a best-effort plan for efficient data retrieval, but crucially, it’s imperfect. This can sometimes lead to `SELECT DISTINCT` not working as expected, especially in complex queries.

From [Wikipedia](https://en.wikipedia.org/wiki/Query_plan):

> When a query is submitted to the database, the query optimizer evaluates some of the different, correct possible plans for executing the query and returns what it considers the best option. Because [query optimizers](https://stack.convex.dev/queries-that-scale) are imperfect, **database users and administrators sometimes need to manually examine and tune the plans produced by the optimizer to get better performance.**

For large tables (on the order of hundreds of thousands of rows or more) or [complex queries](https://stack.convex.dev/complex-filters-in-convex), it’s common that the developer will have to provide hints to the database on how to optimally run a `DISTINCT` statement, which requires that developer to have specialized knowledge of the data design and that database’s optimization features.

Because of [Convex's fundamental design](https://stack.convex.dev/how-convex-works), it obviates these challenges for even the largest tables. You can get consistent, unsurprising [OLTP](https://stack.convex.dev/fivetran-alpha#oltp-and-olap-databases) performance without having to massage the query planner with hints.

### `SELECT DISTINCT` in Convex

Convex doesn’t have a built-in `DISTINCT` statement because it can be accomplished with existing primitive operators. And what do you gain? You get consistent and [predictable `SELECT DISTINCT` performance](https://stack.convex.dev/convex-query-performance)!

However, there is an ergonomic library for doing this. You can [read more about it here](https://stack.convex.dev/merging-streams-of-convex-data), and see the [translation of other SQL statements here](https://stack.convex.dev/translate-sql-into-convex-queries). Here's a taste of what it looks like to get the distinct cities in a given country:

```ts
1const distinctCities = stream(ctx.db, stream)
2  .query("customers")
3	.withIndex("by_country_city", q => q.eq("country", country))
4	.distinct(["city"])
5	.map(async (customer) => customer.city);
6
```

Want to understand how this works and how you'd do this yourself? Read on.

With conventional databases, you typically want to minimize the number of SQL statements your code executes against the database. That’s in part because executing statements from your server to the database incurs the overhead of sending the data back and forth for each round-trip. To solve for this potential performance pitfall, [relational databases](https://stack.convex.dev/convex-vs-relational-databases) like MySQL, SQL Server, and Postgres provide special syntax for common operations, like `DISTINCT`. Using this special SQL syntax, the database can offer functionality that requires multiple queries with a single round-trip.

Because [Convex functions](https://docs.convex.dev/functions) run next to the database in the [reactor](https://docs.convex.dev/tutorial/reactor), we don’t require special syntax to get good `SELECT DISTINCT` performance. Here’s an example of how to achieve `SELECT DISTINCT` functionality in [Convex using indexes directly](https://docs.convex.dev/database/indexes/indexes-and-query-perf).

Say you have a simple version history table with columns for service and version. The data includes 1000s of versions across a small handful of services. Here’s a Convex table schema:

```protobuf
1export default defineSchema({
2  version_history: defineTable({
3    service: v.string(),
4    version: v.string(),
5  }).index("by_service", ["service", "version"]),
6});
7
```

How would you query for the unique set of `K` services in this table of `N` rows? In SQL, you might write `SELECT DISTINCT(service) FROM version_history` , especially when you have many versions and few services. What is this doing under the hood? It aims to return one entry for each service, but what index can it use to do this efficiently?

Think of a [database as a spreadsheet](https://stack.convex.dev/databases-are-spreadsheets). How would you sort these columns to get a tidy list? As we've explained in our articles about [why SQL reads are too powerful](https://stack.convex.dev/not-sql#sql-sucks-3-reads-are-too-powerfu), [the limitations of SQL query languages](https://stack.convex.dev/convex-vs-relational-databases#query-language), and [how to fetch exactly what you need](https://stack.convex.dev/queries-that-scale#problem), we believe in consistent query performance for OLTP workloads. This performance shouldn't be at the mercy of an opaque query planner.

## How to do it

To efficiently solve this query for this workload, a database must make `K+1` single-row queries to the database on the `by_service` index. Each query skips forward to the next `service` , allowing the workload to be `O(K)` rather than the naive `O(N)`.

In Convex, you can write a [query function](https://docs.convex.dev/functions/query-functions) like this

```protobuf
1export const latestVersionForServices = query(async (ctx) => {
2  const latestVersions = {};
3  let doc = await ctx.db
4    .query("version_history")
5    .withIndex("by_service")
6    .order("desc")
7    .first();
8  while (doc !== null) {
9    latestVersions[doc.service] = doc.version;
10    const service = doc.service;
11    doc = await ctx.db
12      .query("version_history")
13      .withIndex("by_service", (q) => q.lt("service", service))
14      .order("desc")
15      .first();
16  }
17  return latestVersions;
18});
19
```

This function efficiently solves this query for cases where the `K << N`, minimizing the [read set](https://stack.convex.dev/how-convex-works#read-and-write-sets) required. A smaller read set leads to fewer [conflicts from mutations](https://docs.convex.dev/error), fewer [query invalidations](https://stack.convex.dev/caching-in), and fewer [function re-executions](https://stack.convex.dev/retry-actions). See [How Convex Works](https://stack.convex.dev/how-convex-works#read-and-write-sets) for more details, but in short, this means that the query function only reads from these intervals, and will only conflict with writes to these intervals. Let’s take this dataset with 8 rows and 3 services.

| service | version |
| --- | --- |
| apple agitator | 1 |
| apple agitator | 3 |
| apple agitator | 7 |
| apple agitator | 9 |
| banana blender | 1 |
| banana blender | 5 |
| cherry crusher | 6 |
| cherry crusher | 7 |

This query function starts by fetching the first row on the `by_service` index descending, leading to the read set of the interval `((cherry crusher), 7), inf)` . Then it queries on the `by_service` index for the next alphabetically earlier service - skipping backwards. This adds a second interval to the read set: `[(banana blender, 5), (cherry crusher, -inf)]`. As we repeat this process, we end up with this final read set:

```protobuf
1(-inf, (apple agitator, -inf)]
2((apple agitator, 9), (banana blender, -inf)]
3((banana blender, 5), (cherry crusher, -inf)]
4((cherry crusher), 7), inf)
5
```

This means that the query function only invalidates when a new service is added, removed, or the latest version of a given service changes. The query itself can efficiently use the [index](https://docs.convex.dev/database/indexes/) to skip around and calculate the set of services in `O(K)` rather than a [full `O(N)` table scan](https://docs.convex.dev/api/interfaces/server.QueryInitializer#fulltablescan).

### `SELECT DISTINCT` Performance in Convex

Keen observers might be curious about the performance of running `K` select statements in a while loop. Conventionally, the idea of looping through select statements seems expensive in terms of performance. However, [Convex is not conventional](https://stack.convex.dev/searching-for-sanity). With Convex, [functions run _inside the database,_](https://stack.convex.dev/horizontally-scaling-functions#how-does-convex-run-functions) meaning round-trip latency is nominal and makes this approach extremely performant.

And unlike Postgres, where SELECT DISTINCT ON clauses might add some optimization, Convex's approach ensures consistent performance without special syntax.

## Summary

This example is similar to how a query planner might choose to optimize such a query, but with Convex you can get consistent, unsurprising OLTP performance without having to massage the query planner with hints. Whether you're familiar with `SELECT` `DISTINCT` in SQL Server, Postgres, or other databases, Convex's method offers a fresh perspective on selecting distinct rows efficiently.

Read more about the shortcomings of SQL in OLTP workloads [here](https://stack.convex.dev/not-sql#sql-sucks-3-reads-are-too-powerful).

Read more about a how to translate SQL statements into Convex syntax [here](https://stack.convex.dev/translate-sql-into-convex-queries) and check out [this awesome library](https://stack.convex.dev/merging-streams-of-convex-data).

Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started

We use third-party cookies to understand how people interact with our site.

See our [Privacy Policy](https://www.convex.dev/legal/privacy/) to learn more.

DeclineAccept