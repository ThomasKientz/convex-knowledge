# AI Chat with HTTP Streaming

![Sarah Shader's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F7047febd1fcf4e4b44d4da9f199c07d842acf23b-1365x1418.jpg&w=3840&q=75)

[Sarah Shader](https://stack.convex.dev/author/sarah-shader)

a year ago

# AI Chat with HTTP Streaming

![ai chat robot next to a river stream representing http streaming](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F5b53664d39f47e3bf901ef88e483923708c954f0-1452x956.png&w=3840&q=75)

[This article](https://stack.convex.dev/gpt-streaming-with-persistent-reactivity) describes how to build a chat app with ChatGPT by streaming text from OpenAI to the Convex database and ultimately to clients with the app loaded. This provides a super responsive experience for everyone using the app, but it can require a lot of database bandwidth since we’re rewriting the document with the message on every streamed update we get from OpenAI.

In this article, we’ll go through an extension to this approach — using [HTTP actions](https://docs.convex.dev/functions/http-actions) with streaming. The end result will be that we can get the responsive, nearly character by character streaming for the user ChatGPT is responding to, while every other client sees updates in larger chunks (and we save on bandwidth).

The full code for this is available [here](https://github.com/sshader/streaming-chat-gpt) but we’ll walk through the most interesting parts below.

![GIF showing two users using the chat app](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Fe507ec7431eabc97ee0d8ee3a86b62b66de0738e-640x422.gif&w=3840&q=75)GIF showing two users using the chat app

![Diagram showing data flow for this app](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F6faefc0031e5820043df2eec5af795358b4996b7-1017x621.png&w=3840&q=75)Diagram showing data flow for this app

Above is a diagram showing how data flows in this app. Users are able to send messages using a mutation ( `send`) and read message using a query ( `list`).

When a user sends a message that needs a response from ChatGPT, the `send` mutation returns a result that the client uses to call an HTTP endpoint `/chat`. This endpoint talks to OpenAI, streaming a response from ChatGPT.

Here’s what the client portion of this looks like:

```typescript
1// src/App.tsx
2// https://github.com/sshader/streaming-chat-gpt/blob/main/src/App.tsx#L84
3async function handleGptResponse(
4  onUpdate: (update: string) => void,
5  requestBody: { messageId: Id<"messages">; messages: Doc<"messages">[] }
6) {
7  const convexSiteUrl = import.meta.env.VITE_CONVEX_URL.replace(
8    /\.cloud$/,
9    ".site"
10  );
11  const response = await fetch(`${convexSiteUrl}/chat`, {
12    method: "POST",
13    body: JSON.stringify(requestBody),
14    headers: { "Content-Type": "application/json" },
15  });
16  // Taken from https://developer.mozilla.org/en-US/docs/Web/API/Streams_API/Using_readable_streams
17  const responseBody = response.body;
18  const reader = response.body.getReader();
19  while (true) {
20    const { done, value } = await reader.read();
21    if (done) {
22      onUpdate(new TextDecoder().decode(value));
23      return;
24    }
25    onUpdate(new TextDecoder().decode(value));
26  }
27}
28
```

and when a user sends a message:

```tsx
1// src/App.tsx
2// https://github.com/sshader/streaming-chat-gpt/blob/main/src/App.tsx#L53
3<form
4	onSubmit={async (e) => {
5		e.preventDefault();
6		const result = await sendMessage({
7			body: newMessageText,
8			author: NAME,
9		});
10		setNewMessageText("");
11		// Kick off ChatGPT response + stream the result
12		if (result !== null) {
13			await handleGptResponse((text) => {
14				// TODO: make the streamed message appear to the user
15				console.log(text);
16			}, result);
17		}
18	}}
19	>
20	{ /* ... */ }
21</form>
22
```

We stream every chunk of this response to the client in the `Response` of our HTTP endpoint, and periodically update the database with everything we’ve streamed so far. This is adapted from [this example](https://developers.cloudflare.com/workers/examples/openai-sdk-streaming/) using Cloudflare workers.

```typescript
1// convex/http.ts
2// https://github.com/sshader/streaming-chat-gpt/blob/main/convex/http.ts#L20
3http.route({
4	path: "/chat",
5	method: "POST",
6	handler: httpAction(async (ctx, request) => {
7		// Create a TransformStream to handle streaming data
8		let { readable, writable } = new TransformStream();
9		let writer = writable.getWriter();
10		const textEncoder = new TextEncoder();
11
12		const streamData = async () => {
13			let content = "";
14			const openai = new OpenAI();
15			const stream = await openai.chat.completions.create({
16				model: "gpt-3.5-turbo",
17				messages: [/* ... */],
18				stream: true,
19			});
20
21			for await (const part of stream) {
22				const text = part.choices[0]?.delta?.content || "";
23				content += text;
24
25				// write to this handler's response stream on every update
26				await writer.write(textEncoder.encode(text));
27				// write to the database periodically, like at the end of sentences
28				if (hasDelimeter(text)) {
29					await ctx.runMutation(internal.messages.update, {
30						messageId,
31						body: content,
32						isComplete: false,
33					});
34				}
35			}
36
37			// flush any last updates
38			await ctx.runMutation(internal.messages.update, {
39				messageId,
40				body: content,
41				isComplete: true,
42			});
43			await writer.close();
44		};
45
46		// kick off the request to OpenAI, but don't `await` it, so we can start sending
47		// the response. Convex will wait until `writer.close`.
48		void streamData();
49
50		// Send the readable back to the browser
51		return new Response(readable);
52	}),
53});
54
```

Note: we additionally have to set up CORS to allow our browser to request our HTTP action. There’s an example of this in the [repo](https://github.com/sshader/streaming-chat-gpt/blob/cb1528a345cca6d85dc8d629a80db4fe948c8c29/convex/http.ts#L106), and [Will it CORS?](https://httptoolkit.com/will-it-cors/) is a great resource for setting up CORS correctly.

To show the streamed response immediately on the client, we’ll essentially be building an optimistic update. We’ll store the ID and text of the message we’re receiving from ChatGPT via our HTTP endpoint, and show this text instead of the text returned by `useQuery`. Once the message returned by `useQuery` is complete, we’ll “drop” our optimistic update and start showing the text returned by `useQuery` (which should be exactly the same, provided there were no errors).

Here’s what this looks like in code:

```tsx
1export default function App() {
2	// Hold state for a message we're streaming from ChatGPT via an HTTP endpoint,
3	// which we'll apply on top
4	const [streamedMessage, setStreamedMessage] = useState("");
5	const [streamedMessageId, setStreamedMessageId] = useState<Id<"messages"> | null>(null);
6
7	useEffect(() => {
8		const message = messages.find((m) => m._id === streamedMessageId);
9		if (message !== undefined && message.isComplete) {
10			// Clear what we streamed in favor of the complete message
11			setStreamedMessageId(null);
12			setStreamedMessage("");
13		}
14	}, [messages, setStreamedMessage, setStreamedMessageId]);
15
16	return <main>
17		{/* .... */}
18		{messages.map((message) => {
19		const messageText = streamedMessageId === message._id
20			? streamedMessage
21			: message.body;
22		return (
23			<article
24			key={message._id}
25			className={message.author === NAME ? "message-mine" : ""}>
26				<div>{message.author}</div>
27				<p>{messageText}</p>
28			</article>
29			);
30		})}
31		{/* ... */ }
32  </main>
33}
34
35
```

```tsx
1// src/App.tsx
2// https://github.com/sshader/streaming-chat-gpt/blob/main/src/App.tsx#L53
3<form
4	onSubmit={async (e) => {
5		e.preventDefault();
6		const result = await sendMessage({
7			body: newMessageText,
8			author: NAME,
9		});
10		setNewMessageText("")
11		// Kick off ChatGPT response + stream the result
12		if (result !== null) {
13			setStreamedMessageId(result.messageId)
14			await handleGptResponse((text) => {
15				setStreamedMessageText((t) => t + text)
16			}, result);
17		}
18	}}
19>
20{/* ... */}
21</form>
22
```

### Summary

By leveraging HTTP actions with streaming, this chat app balances real-time responsiveness with efficient bandwidth usage. Users receive character-by-character updates to their own responses directly from ChatGPT, while other users see periodic updates, minimizing database bandwidth.

The full code for this app can be found below:

[sshader/ **streaming-chat-gpt**\\
\\
![GitHub logo](https://stack.convex.dev/logos/github.svg)](https://github.com/sshader/streaming-chat-gpt)

Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started