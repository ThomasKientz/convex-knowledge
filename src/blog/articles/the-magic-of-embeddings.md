# The Magic of Embeddings

![Ian Macartney's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F077753b63476b77fb111ba06d1bb538517033a54-3500x3500.jpg&w=3840&q=75)

[Ian Macartney](https://stack.convex.dev/author/ian-macartney)

2 years ago

# The Magic of Embeddings

![Embeddings turn text into an array of numbers](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F4e40aa260c25ec7bdde41bd26f4a2a07f41d138a-1200x628.png&w=3840&q=75)

How similar are the strings “I care about strong ACID guarantees” and “I like transactional databases”? While there’s a number of ways we could compare these strings—syntactically or grammatically for instance—one powerful thing AI models give us is the ability to compare these semantically, using something called _embeddings_. Given a model, such as OpenAI’s `text-embedding-ada-002`, I can tell you that the aforementioned two strings have a similarity of 0.784, and are more similar than “I care about strong ACID guarantees” and “I like MongoDB” 😛. With embeddings, we can do a whole suite of powerful things:[1](https://stack.convex.dev/the-magic-of-embeddings#user-content-fn-1)

- **Search** (where results are ranked by relevance to a query string)
- **Clustering** (where text strings are grouped by similarity)
- **Recommendations** (where items with related text strings are recommended)
- **Anomaly detection** (where outliers with little relatedness are identified)
- **Diversity measurement** (where similarity distributions are analyzed)
- **Classification** (where text strings are classified by their most similar label)

This article will look at working with raw OpenAI embeddings. If you want to play around with embeddings yourself, check out this repo:

[ianmacartney/ **embeddings-in-convex**\\
\\
![GitHub logo](https://stack.convex.dev/logos/github.svg)](https://github.com/ianmacartney/embeddings-in-convex)

## What is an embedding?

An embedding is ultimately a list of numbers that describe a piece of text, for a given model. In the case of OpenAI’s model, it’s always a 1,536-element-long array of numbers. Furthermore, for OpenAI, the numbers are all between -1 and 1, and if you treat the array as a vector in 1,536-dimensional space, it has a magnitude of 1 (i.e. it’s “normalized to length 1” in linear algebra lingo).

On a conceptual level, you can think of each number in the array as capturing some aspect of the text. Two arrays are considered similar to the degree that they have similar values in each element in the array. You don’t have to know what any of the individual values correspond to—that’s both the beauty and the mystery of embeddings—you just need to compare the resulting arrays. We’ll look at how to compute this similarity below.

Depending on what model you use, you can get wildly different arrays, so it only makes sense to compare arrays that come from the same model. It also means that different models may disagree about what is similar. You could imagine one model being more sensitive to whether the string rhymes. You could fine-tune a model for your specific use case, but I’d recommend starting with a general-purpose one to start, for similar reasons as to why to generally pick Chat GPT over fine-tuned text generation models.

It’s beyond the scope of this post, but it’s also worth mentioning that we’re just looking at text embeddings here, but there are also models to turn images and audio into embeddings, with similar implications.

## How do I get an embedding?

There are a few models to turn text into an embedding. To use a hosted model behind an API, I’d recommend [OpenAI](https://platform.openai.com/docs/guides/embeddings), and that’s what we’ll be using in this article. For open-source options, you can check out [all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2#all-minilm-l6-v2) or [all-mpnet-base-v2](https://huggingface.co/sentence-transformers/all-mpnet-base-v2).

Assuming you have an [API key](https://platform.openai.com/account/api-keys) in your [environment variables](https://docs.convex.dev/production/hosting/environment-variables), you can get an embedding via a simple `fetch`:

```jsx
1export async function fetchEmbedding(text: string) {
2  const result = await fetch("https://api.openai.com/v1/embeddings", {
3    method: "POST",
4    headers: {
5      "Content-Type": "application/json",
6      Authorization: "Bearer " + process.env.OPENAI_API_KEY,
7    },
8    body: JSON.stringify({
9      model: "text-embedding-ada-002",
10      input: [text],
11    }),
12  });
13  const jsonresults = await result.json();
14  return jsonresults.data[0].embedding;
15}
16
```

For efficiency, I’d recommend fetching multiple embeddings at once in a batch.

```jsx
1export async function fetchEmbeddingBatch(texts: string[]) {
2  const result = await fetch("https://api.openai.com/v1/embeddings", {
3    method: "POST",
4    headers: {
5      "Content-Type": "application/json",
6      Authorization: "Bearer " + process.env.OPENAI_API_KEY,
7    },
8
9    body: JSON.stringify({
10      model: "text-embedding-ada-002",
11      input: texts,
12    }),
13  });
14  const jsonresults = await result.json();
15  const allembeddings = jsonresults.data as {
16    embedding: number[];
17    index: number;
18  }[];
19  allembeddings.sort((a, b) => a.index - b.index);
20  return allembeddings.map(({ embedding }) => embedding);
21}
22
```

## Where should I store it?

Once you have an embedding vector, you’ll likely want to do one of two things with it:

1. Use it to search for similar strings (i.e. search for similar embeddings).
2. Store it to be searched against in the future.

Vector databases allow you to quickly find nearby vectors for a given input, without having to compare against every vector every time. If you expect to have 100k or fewer vectors, you can store it alongside your other application data in Convex and [use a `vectorIndex`](https://docs.convex.dev/vector-search) \- this allows you to avoid adding another database provider to your stack. If you plan to store millions of vectors, however, I’d recommend using a dedicated vector database like [Pinecone](https://www.pinecone.io/). See [this post](https://stack.convex.dev/pinecone-and-embeddings) for more details on using Pinecone with Embeddings in Convex.

In my case, if I want to suggest [Stack](https://stack.convex.dev/) posts similar to a given post or search, I only need to compare against fewer than 100 vectors, so I can just fetch them all and compare them in a matter of milliseconds using the Convex database.

### How should I store an embedding?

If you’re storing your embeddings in Pinecone, see [this post](https://stack.convex.dev/pinecone-and-embeddings) for a dedicated post on it, but the short answer is you configure a Pinecone “Index” and store some metadata along with the vector, so when you get results from Pinecone you can easily re-associate them with your application data. For instance, you can store the document ID for a row that you want to associate with the vector.

If you’re storing the embedding in Convex, you can [store it as a number array](https://docs.convex.dev/vector-search#defining-vector-indexes) (the way it's returned from APIs like OpenAI).

You can represent the embedding as a field in a table [in your schema](https://docs.convex.dev/database/schemas):

```ts
1embeddings: defineTable({
2  text: v.string(),
3  vector: v.array(v.number()),
4}).vectorIndex("vector", { vectorField: "vector", dimensions: 1536 }),
5
```

In this case, I store the vector and define a vector index to search by. Read the docs [to see how to use vector search in Convex](https://docs.convex.dev/vector-search#defining-vector-indexes).

Read on to see the underlying math if you want to compare embeddings without using a vector index.

## How to compare embeddings in JavaScript manually

If you’re looking to compare two embeddings from OpenAI without using a vector database, it’s very simple. There’s [a few ways of comparing vectors](https://www.pinecone.io/learn/roughly-explained/distance-between-vectors/), including Euclidean distance, dot product, and cosine similarity. Thankfully, because OpenAI normalizes all the vectors to be length 1, they will all give the same rankings! With a simple [dot product](https://www.notion.so/Product-f8d495cd1e29469289011becf658f547?pvs=21) you can get a similarity score ranging from -1 (totally unrelated) to 1 (incredibly similar). There are optimized libraries to do it, but for my purposes, this simple function suffices:

```jsx
1/**
2 * Compares two vectors by doing a dot product.
3 *
4 * Assuming both vectors are normalized to length 1, it will be in [-1, 1].
5 * @returns [-1, 1] based on similarity. (1 is the same, -1 is the opposite)
6 */
7export function compare(vectorA: number[], vectorB: number[]) {
8  return vectorA.reduce((sum, val, idx) => sum + val * vectorB[idx], 0);
9}
10
```

#### Example

In this example, let’s make a function (a Convex [query](https://docs.convex.dev/functions/query-functions) in this case) that returns all of the embeddings and their similarity scores in order based on some query embedding, assuming a table of `embeddings` as we defined above, and the `compare` function we just defined.

```ts
1export const compareTo = query(async (ctx, { embeddingId }) => {
2  const target = await ctx.db.get(embeddingId);
3  const embeddings = await ctx.db.query("embeddings").collect();
4  const scores = await Promise.all(
5    embeddings
6      .filter((embedding) => !embedding._id.equals(embeddingId))
7      .map(async (embedding) => {
8        const score = compare(
9          target.vector,
10          embedding.vector
11        );
12        return { score, text: vector.text, embddingId: embedding._id };
13      })
14  );
15  return scores.sort((a, b) => b.score - a.score);
16});
17
```

## Summary

In this post, we looked at embeddings, why they’re useful, and how we can store and use them in Convex. To read more about using the Convex vector search, [check out the docs](https://docs.convex.dev/vector-search). If you want to see how to use embeddings with Pinecone and Convex, check out [this post](https://stack.convex.dev/pinecone-and-embeddings). It covers chunking long input into multiple embeddings and using Pinecone alongside the Convex DB. Let us know in [our Discord](https://convex.dev/community) what you think!

### Footnotes

1. Copied from [OpenAI’s guide](https://platform.openai.com/docs/guides/embeddings/what-are-embeddings) [↩](https://stack.convex.dev/the-magic-of-embeddings#user-content-fnref-1)


Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started