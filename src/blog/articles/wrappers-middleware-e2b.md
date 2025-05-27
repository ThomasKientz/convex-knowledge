# Edge to Butt: Wrappers as "Middleware"

![Jamie Turner's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Fee80addc4a0315dc3175c4a08f64f8bc294568bd-400x400.jpg&w=3840&q=75)

[Jamie Turner](https://stack.convex.dev/author/jamwt)

2 years ago

# Edge to Butt: Wrappers as "Middleware"

Exciting news! There is an easier way to customize your queries, mutations, and actions. Check out [this post](https://stack.convex.dev/custom-functions) to see how to use `customFunction` helpers from the `convex-helpers` npm package. It's it great living on the butt?

![The Edge](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F6197d11250ac102dd72454ac366a5c54f211fb71-1000x563.jpg&w=3840&q=75)

I loved reading the informative and useful [Wrappers as Middleware: Authentication](https://stack.convex.dev/wrappers-as-middleware-authentication) from Ian Macartney. But it’s time to get serious and Enterprise in here. Let’s focus on a piece of Convex middleware **real** projects need.

Years ago, an inspired soul created a “Cloud to Butt” movement wherein millions of Internet denizens installed a cheeky [Chrome extension](https://chrome.google.com/webstore/detail/cloud-to-butt-plus/apmlngnhgbnjpajelfkmabhkfapgnoai?hl=en). Within Chrome, this extension transformed all web content uses of the word “cloud”, or “the cloud”, to "butt", “my butt”, and so on. Resulting in childishness like this:

![Screenshot](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F10f0cacdaad31ce5dcb9eaeef4c8632c650904ad-960x511.jpg%3Fw%3D450&w=3840&q=75)Screenshot

This whole phenomenon was clearly a cheap attempt to capitalize on our collective cynical, weary leeriness at the growing ubiquity of the word “cloud”. Everything we used to just call the Internet, or servers, or whatever, started being labeled “the cloud” one day by breathless digital marketers. So we responded by channeling our inner seven-year-olds and using potty humor.

But it’s not 2014, it’s 2023. We’ve all matured, and we’ve even come to embrace the term _cloud_ as a warm friend–of _course_ the cloud is here, and it generously runs everything for us for an oh-so reasonable fee, and we embrace it! We wouldn’t _dream_ of offending the cloud!

Now the new intruder we’re rolling our eyes at is “the edge”. The edge is nothing like the cloud. It’s mysterious and coming for us. Everyone is starting to say it and we’re starting to feel inadequate that we’re not using it enough or talking about it the right way at parties!

## Problem solved.

Introducing the newest piece of Convex middleware, Edge-to-Butt. Just drop this little beauty into your Convex queries and mutations, and your website will thumb its nose at this snot-nosed newcomer they're calling “the edge”.

First, let’s write a function that traverses any object or array recursively and looks for strings:

```tsx
1// Recursively explore objects/arrays and scalar values, looking for strings
2// to transform from 'edge' into 'butt'.
3function buttify(value: any): any {
4  const isArr = Array.isArray(value);
5  if (isArr) {
6		// recurse for all items in the array
7    value.forEach((v, i) => {
8      value[i] = buttify(v);
9    });
10    return value;
11  }
12  const valueType = typeof value;
13  if (valueType === "object") {
14    for (var key of Object.keys(value)) {
15			// recurse for all fields on the object
16      value[key] = buttify(value[key]);
17    }
18    return value;
19  }
20  if (valueType === "string") {
21    // String! replace "edge" with "butt", as one does.
22    return value.replace(/(^|\W)(edge)(\W|$)/gim, caseStableButtification);
23  }
24  return value;
25}
26
```

Now, the key to this whole system is this `caseStableButtification` function. This is Enterprise software, so we need to get the details right. We want to make sure we only change the word ‘edge’, not ‘ledge’. And we want to preserve the case, so if someone says “Edge computing is the future”, we’ll want a capital B on that baby.

Here’s what that function looks like, operating on the groups of our matched regex:

```tsx
1// Convert 'edge'  to 'butt' while preserving case and surrounding syntax.
2function caseStableButtification(
3  _: string,
4  prefix: string,
5  edge: string,
6  suffix: string
7): string {
8  const fixEdge = (s: string): string => {
9    var buttLetters = [...s].map((l, i) => {
10      if (l.toLocaleUpperCase() === l) {
11        return BUTT.charAt(i).toLocaleUpperCase();
12      } else {
13        return BUTT.charAt(i);
14      }
15    });
16    return buttLetters.join("");
17  };
18  return prefix + fixEdge(edge) + suffix;
19}
20
```

Finally, we need our Convex wrapper, and we'll use it on the standard `listMessages` query from the [Convex tutorial](https://docs.convex.dev/tutorial/welcome-to-convex):

```tsx
1/**
2 * Wrapper for Convex query or mutation functions turns all use of "edge" to
3 * butt.
4 *
5 * @param - func: your Convex query function.
6 * @returns A return value with all strings having "edge" transformed
7 * into "butt".
8 */
9export const withEdgeToButt = (func: any) => {
10  return async (...args: any[]) => {
11    let result = await func(...args);
12    buttify(result);
13    return result;
14  };
15};
16
17// Retrieve all chat messages from the database with a sprinkle of 7-year old humor.
18export default query(
19  withEdgeToButt(async ({ db }: any) => {
20    console.log("getting messages again");
21    return await db.query("messages").collect();
22  })
23);
24
```

## On the edge of your seat?

Are we ready for production? You tell me:

![Screenshot of the final app](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Ffb156dc6c77469890279c007e832238f870938d3-1920x1080.gif%3Fw%3D450&w=3840&q=75)Screenshot of the final app

I’m sure for many of you, this was the final Convex capability you were waiting for before taking the leap and using Convex on your next project. Please be patient with the team while we manage the influx of interest. Your call is important to us.

Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started

We use third-party cookies to understand how people interact with our site.

See our [Privacy Policy](https://www.convex.dev/legal/privacy/) to learn more.

DeclineAccept