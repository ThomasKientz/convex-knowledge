# Help, my app is overreacting!

![Anjana Vakil's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F26b7f9ae04ef51725d117901c29166d930328d29-1080x1080.jpg&w=3840&q=75)

[Anjana Vakil](https://stack.convex.dev/author/anjana-vakil)

2 years ago

# Help, my app is overreacting!

![Image of Roy Lichtenstein's 1963 pop art piece “Crying Girl", depicting a woman looking nervous & upset with tears in her eyes (image via WikiArt, fair use)](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F38016ece679071d53e088223fe0ce2c5eb7c7105-2000x1496.jpg&w=3840&q=75)

The apps we build don’t exist in a vacuum; they’re used by real users, and we want to give them a really good experience!

Let’s say I’m building a simple task manager app where I want to show the user a list of tasks, each of which has a certain status like “New” or “In Progress”, and possibly an owner assigned to the task:

![Screenshot of a simple web app showing 'Task Manager' heading and 'New Task' button at top left, a user icon and log out button at top right, and in the main section a table of tasks with columns '#' (task number), 'Task' (title), 'Owner' (user icon, if any), 'Status' ('In Progress', 'New' etc.)](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F11ef431d4eb2d0a2dc547e6b2d7a95f4a6f5d6ce-1110x780.png&w=3840&q=75)Screenshot of a simple web app showing 'Task Manager' heading and 'New Task' button at top left, a user icon and log out button at top right, and in the main section a table of tasks with columns '#' (task number), 'Task' (title), 'Owner' (user icon, if any), 'Status' ('In Progress', 'New' etc.)

For the best user experience, I want the app to always show the latest data, even if that data is actively changing while I’m viewing the page. For example, if another user somewhere adds a new task, or changes the title of a task, I want to see the app update immediately without having to manually reload the page, hit a “refresh” button, or the like.

In this post, we’ll explore:

- How a reactive backend like Convex helps build live-updating apps that show users the fresh data they deserve
- The default behavior of reactive data updates from Convex’s `useQuery` and `usePaginatedQuery` hooks, and how that might affect UX in different contexts
- How I can customize the way my app reacts to data updates to more easily deliver the intended user experience

Let’s dig in!

### A visit from the reactive-query fairy

With traditional backends, to achieve the desired behavior I’d have to go out of my way to keep the data updated, for example by polling (actively re-fetching the data every so often). That works to a certain extent, but means:

- more code for me to write/maintain (more work! more bugs!)
- more request-response cycles that might slow down my app
- some lag time in when the user sees the new data if it changes between polling cycles

I also might run the risk of inconsistencies in what the user sees, if I’m making multiple queries of the same data (e.g. one query that fetches the total number of tasks, and other that fetches the detailed task list); with no way to guarantee their polling cycles will stay in sync, one query might pick up new data before the other.

Luckily, we live in the futuristic-sounding year of 2023, and we now have not only reactive frontend frameworks like [React](https://reactjs.org/), but also reactive backends like [Convex](https://www.convex.dev/) that work hand-in-hand with my reactive frontend to automatically keep my app’s data fresh!

For example, [Convex’s `useQuery` hook](https://docs.convex.dev/api/modules/react#usequery) returns a reactive value that gives me the up-to-date result of running a particular database query. Say I have a `listAllTasks` [Convex query function](https://docs.convex.dev/understanding/convex-fundamentals/functions#query-functions) that queries the `tasks` table in my database:

```jsx
1// convex/listAllTasks.ts
2import { query } from './_generated/server'
3
4export default query(async ({ db }) => {
5  // Grab all the rows in `tasks` table and collect into an array
6  return await db.query('tasks').collect()
7})
8
```

I can pull the reactive results of running that query into my frontend with `useQuery` like so:

```jsx
1// pages/index.tsx
2import React from 'react'
3import { useQuery } from '../convex/_generated/react'
4import { TaskList } from '../components/tasks'
5import { LoginHeader, NewTaskButton } from '../components/util'
6
7export default function App() {
8	const tasks = useQuery('listAllTasks')
9
10	return (
11		<main>
12      <LoginHeader />
13			<div id="controls">
14	      <NewTaskButton />
15      </div>
16      <TaskList tasks={tasks} />
17    </main>
18	)
19}
20
```

Thanks to the `useQuery` hook, the `tasks` value updates instantly any time the data changes, and the component re-renders. So in the case where another user adds a task while I’m viewing the list, I see it show up instantly:

![Screen capture of two separate users navigating to the Task Manager app in two windows side-by-side. In the left window, one user adds a new task titled “Reactively load data”. In the right window, another user is viewing the task list, and sees the new task appear instantly when the first user saves the new task. ](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F880a5e1f80a9210822be8a0779f7906c5c3923d3-1080x401.gif&w=3840&q=75)Screen capture of two separate users navigating to the Task Manager app in two windows side-by-side. In the left window, one user adds a new task titled “Reactively load data”. In the right window, another user is viewing the task list, and sees the new task appear instantly when the first user saves the new task.

And if I have multiple queries referencing the same data (e.g. say I have another function `countTasks` that also reads from the `tasks` table, which I invoke in another component with `useQuery('countTasks')`), I don’t have to worry about the kind of race condition possible with polling that could lead to the count of tasks being inconsistent with what’s shown in the task list. Convex ensures all of my `useQuery` calls stay in sync, consistently pushing out the exact same data to all of my queries whenever that data changes. One less thing to worry about? Music to my ears!

But what happens _while_ the data is loading? The value returned by `useQuery` is initially `undefined` until the data has loaded, so I can [check for that](https://docs.convex.dev/using/best-practices#loading-states) to display some kind of loading state to my users (here I just show a simple ‘loading’ message, but in a real app I might display e.g. a spinner icon or ghost component):

```jsx
1// in App() function
2{tasks === undefined ? <p>Loading tasks...</p> : <TaskList tasks={tasks} />}
3
```

![Screen capture of the Task Manager app reloading. Before the task list appears, the text “Loading tasks…” is briefly displayed in its place.](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Fd5045fe0d7343b1fd1013e85ff0234ba829f9f70-1080x805.gif&w=3840&q=75)Screen capture of the Task Manager app reloading. Before the task list appears, the text “Loading tasks…” is briefly displayed in its place.

Fantastic! My app auto-updates with the latest data without the user having to do anything, and I can show a loading state while initially fetching the data. My users always see the freshest data, the app doesn’t have to constantly poll for data updates, and I didn’t even have to write that much code to make it happen!

In other words, with this kind of pattern for reactive data, it feels like the answer to all my wishes fell right into my lap, er, app!

### Overreacting can be distracting

However, this convenient out-of-the-box reactivity might be _more_ than I need in certain situations. For example, say I want to let users check boxes to specify the particular task status(es) they’re interested in, e.g. only `New` or `In Progress` tasks:

![Screenshot of the same Task Manager app task list page, but now under the user icon and log out button at top right there are also checkbox inputs labeled “New” (checked), “In Progress” (checked), “Done” (unchecked), and “Cancelled” (unchecked).](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F562f07c431660c0db8ee9f6c1fd38aebdbc633c2-1110x780.png%3Fw%3D720&w=3840&q=75)Screenshot of the same Task Manager app task list page, but now under the user icon and log out button at top right there are also checkbox inputs labeled “New” (checked), “In Progress” (checked), “Done” (unchecked), and “Cancelled” (unchecked).

To achieve this, I can make a `listTasksWithStatus` query function that looks similar to `listAllTasks`, but with an additional `taskStatuses` parameter that accepts an array of status values used to filter the query results:

```jsx
1// convex/listTasksWithStatus.ts
2import { query } from './_generated/server'
3
4export default query(async ({ db }, { statuses }: { statuses: string[] }) => {
5  // Grab rows in `tasks` table matching the given filter
6  return await db
7    .query("counter_table")
8    .filter((q) =>
9      q.or(
10        // Match any of the given status values
11        ...statuses.map((status) => q.eq(q.field("name"), status))
12      )
13    )
14    .collect(); // collect all results into an array
15});
16
```

Then in my frontend I can wire up some checkbox inputs so that whenever the user changes the checked values, their selections are captured as [state](https://beta.reactjs.org/learn/state-a-components-memory) and passed along to `useQuery`:

```jsx
1// in pages/index.tsx
2import React, { useState, type ChangeEventHandler } from 'react'
3import { useQuery } from '../convex/_generated/react'
4import { TaskList } from '../components/taskList'
5import { LoginHeader, NewTaskButton, Checkboxes } from '../components/util'
6
7const allStatuses = ['New', 'In Progress', 'Done', 'Cancelled']
8
9export default function App() {
10  const user = useQuery('getCurrentUser')
11
12  const [checkedValues, setCheckedValues] = useState(['New', 'In Progress'])
13
14  const handleChangeChecked = ((event) => {
15    // Process a checkbox change event affecting the status filter
16    const target = event.target as HTMLInputElement
17    if (target.checked) {
18      // A formerly unchecked status filter is now checked; add value to array
19      setCheckedValues([...checkedValues, target.value])
20    } else {
21      // A formerly checked status filter is now unchecked; remove value from array
22      setCheckedValues(checkedValues.filter((s) => s !== target.value))
23    }
24  }) as ChangeEventHandler
25
26  const tasks = useQuery('listTasksWithStatus', { statuses: checkedValues })
27
28  return (
29    <main>
30      <LoginHeader />
31      <div id="controls">
32        <NewTaskButton />
33				<Checkboxes // simple component creating a checkbox input for each status
34          values={allStatuses}
35          checkedValues={checkedValues}
36          onChange={handleChangeChecked}
37        />
38      </div>
39      {tasks === undefined ?  <p>Loading tasks...</p> : <TaskList tasks={tasks} />}
40    </main>
41  )
42}
43
```

This basically works, updating the list reactively based on the user’s input, but unfortunately whenever `checkedValues` updates, something annoying happens - do you see it?

![Screen capture of a user checking and unchecking the checkboxes. Each time one is checked/unchecked, the task list briefly disappears, replaced by “Loading tasks…” text, and then quickly reappears with tasks that match the new checkbox selections. ](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F8a8dc9564b4372290526cee6a1809977d76aa624-720x499.gif&w=3840&q=75)Screen capture of a user checking and unchecking the checkboxes. Each time one is checked/unchecked, the task list briefly disappears, replaced by “Loading tasks…” text, and then quickly reappears with tasks that match the new checkbox selections.

Whenever the user updates their selection, there’s a brief, distracting flash of the loading state. This is because whenever `checkedValues` changes:

1. the component re-renders, making a new call to `useQuery`
2. `useQuery` does its intended job of returning `undefined` while the updated query is initially running
3. the component sees `tasks` is `undefined` and renders the loading state, until
4. the new results come back, `tasks` updates, and the component finally re-renders with the new data

That behavior might be what I want in some contexts, but in this case I don’t want my users to see that distracting flash; instead, during that brief loading period after they’ve checked a box I’d rather keep showing them the old, stale data from the previous selection, and wait to re-render until the new, fresh data has finished loading.

In other words, you might say my app is “overreacting” to updates from `useQuery`, not all of which I want to translate into UI updates! I don’t want to give up the convenient reactivity of `useQuery`, but I want to customize its behavior to smash the flash.

### Impacting how the query’s reacting

Essentially, for this use case what I’d like is a version of `useQuery` that’s a little bit _less_ reactive, skipping those intermediate `undefined` states when the query changes, and instead keeping the data more “stable” by continuing to give me the stale data from the previous query until the fresh data has finished loading.

[Refs](https://beta.reactjs.org/learn/referencing-values-with-refs) to the rescue! To customize the behavior of `useQuery` to fit my use case, I can implement a [custom React hook](https://beta.reactjs.org/learn/reusing-logic-with-custom-hooks) that I’ll call `useStableQuery`, which functions similarly to `useQuery` but keeps track of the resulting data with React’s [builtin `useRef` hook](https://beta.reactjs.org/reference/react/useRef), which gives me a Ref object whose identity remains stable between re-renders, and which does not trigger a re-render when its value (accessed via the object’s `.current` property) changes.

By using a ref to capture the reactive `useQuery` return value, I can decide to only update the value returned from `useStableQuery` once the query result is no longer `undefined`:

```jsx
1// hooks/useStableQuery.ts
2
3import { useRef } from 'react'
4import { useQuery } from '../convex/_generated/react'
5
6export const useStableQuery = ((name, ...args) => {
7  const result = useQuery(name, ...args)
8
9	// useRef() creates an object that does not change between re-renders
10  // stored.current will be result (undefined) on the first render
11  const stored = useRef(result)
12
13	// After the first render, stored.current only changes if I change it
14  // if result is undefined, fresh data is loading and we should do nothing
15  if (result !== undefined) {
16    // if a freshly loaded result is available, use the ref to store it
17    stored.current = result
18  }
19
20  // undefined on first load, stale data while reloading, fresh data after loading
21  return stored.current
22}) as typeof useQuery // make sure we match the useQuery signature & return type
23
```

(Note: I could also implement this pattern directly in the component that calls `useQuery`, without writing a custom hook, but putting it in a hook lets me more easily reuse this logic across multiple components/queries.)

In my component, I can now swap the original `useQuery` out for my custom `useStableQuery`, capturing the resulting `tasks` just like before:

```jsx
1// in pages/index.tsx
2import { useStableQuery } from '../hooks/useStableQuery'
3
4// ...
5
6export default function App() {
7  // ...
8  const tasks = useStableQuery('listTasks', checkedValues)
9  // ...
10}
11
```

Now, `tasks` is only `undefined` on the very first load, and whenever `checkedValues` updates in reaction to user input and its new value is passed in to `useStableQuery`, `tasks` does not update until the fresh new data is ready, skipping the intermediate `undefined` state that was causing the loading flash before. Success!

![Screen capture of a user checking and unchecking the boxes as before, but now there is no flash of “Loading tasks…” before the new data is shown.](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Fb2314d94994a8917153d4f842f4d51b1a1aa34e4-720x499.gif&w=3840&q=75)Screen capture of a user checking and unchecking the boxes as before, but now there is no flash of “Loading tasks…” before the new data is shown.

### What about pagination, is that a complication?

If the app I’m building is for a big organization likely to have a ton of tasks, I probably want to use a [paginated query](https://docs.convex.dev/using/pagination) instead. Initially, I’ll only show users the first page of results, then load additional pages as needed (e.g. when the user clicks a button, or scrolls to the bottom).

I can update my `listTasksWithStatus` function to return paginated results like so, accepting a `paginationOptions` object as the second parameter and replacing `.collect()` with `.paginate(paginationOptions)`:

```jsx
1// convex/listTasksWithStatus.ts
2import { query } from './_generated/server'
3
4export default query(
5  async ({ db }, { paginationOpts, statuses }) => {
6    // Grab rows in `tasks` table matching the given filter
7    return await db
8      .query('tasks')
9      .filter((q) =>
10        q.or(
11          // Match any of the given status values
12          ...statuses.map(( }status) => q.eq(q.field('status'), status))
13        )
14      )
15      // paginate the results instead of collecting into an array
16      .paginate(paginationOpts)
17  }
18)
19
```

In my component, I can now replace `useQuery` with [Convex’s analogous `usePaginatedQuery` hook](https://docs.convex.dev/api/modules/react#usepaginatedquery), which accepts the additional `paginationOptions` argument that lets me specify the initial number of items I want in the first page. In addition to the `results` data for the loaded page(s), `usePaginatedQuery` also returns a `status` value indicating pagination status (either `'CanLoadMore'`, `'LoadingMore'` or `'Exhausted'`) and a `loadMore` function I can call to load additional pages when the user clicks a button.

I can use this hook in my component like so, checking `status` to know when to display the loading state and adding a simple button to load the next page, if any:

```jsx
1// in pages/index.tsx
2import { usePaginatedQuery } from 'convex/react'
3
4export default function App() {
5	// ...set up checkedValues & handler same as before
6
7  const {results, status, loadMore} = usePaginatedQuery(
8    'listTasks',
9    { statuses: checkedValues},
10    { initialNumItems: 10 }
11  )
12
13  return (
14    <main>
15      {/* ...header & controls same as before */}
16      {status === 'LoadingMore'
17        ?  <p>Loading tasks...</p>
18        : <TaskList tasks={results} />}
19      {loadMore && <button onClick={() => loadMore(10)}>Load more</button>}
20    </main>
21  )
22}
23
```

But once again, the user sees an empty flash whenever they change their checkbox selections, since the status switches back to `LoadingMore` while the new page is being fetched.

![Screen capture of a slightly different version of the app that now shows only up to 10 tasks, with a “Load more” button appearing at the bottom of the list if there are more tasks available. When the user clicks the checkboxes, there is once again a brief flash of the loading message before the new data is shown.](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F1ea530adfd34d425dd327ba452eb4028929a5a94-720x539.gif&w=3840&q=75)Screen capture of a slightly different version of the app that now shows only up to 10 tasks, with a “Load more” button appearing at the bottom of the list if there are more tasks available. When the user clicks the checkboxes, there is once again a brief flash of the loading message before the new data is shown.

Ugh, there goes my app overreacting again, what a drama queen! How do I rein it in while still using a paginated query?

To get the stable behavior I want and ignore the intermediate loading states as before, I can make a paginated version of my custom query hook called `useStablePaginatedQuery`. It follows the same pattern as `useStableQuery`, but checks for the `LoadingMore` status rather than `undefined` to determine when _not_ to update the results:

```jsx
1// in hooks/useStableQuery.ts
2import { useRef } from 'react'
3import { usePaginatedQuery } from '../convex/_generated/react'
4
5export const useStablePaginatedQuery = ((name, ...args) => {
6  const result = usePaginatedQuery(name, ...args)
7  const stored = useRef(result)
8
9  // If new data is still loading, wait and do nothing
10  // If data has finished loading, use the ref to store it
11  if (result.status !== 'LoadingMore') {
12    stored.current = result
13  }
14
15  return stored.current
16}) as typeof usePaginatedQuery
17
```

Now, when I replace `usePaginatedQuery` with `useStablePaginatedQuery` in my component, I get the slightly-less-reactive behavior I’m looking for; no flash, no drama!

```jsx
1// in pages/index.tsx
2import { useStablePaginatedQuery } from '../hooks/useStableQuery'
3
4// ...
5
6export default function App() {
7  // ...
8  const {results, status, loadMore} = useStablePaginatedQuery(
9    'listTasks',
10    { statues: checkedValues },
11    { initialNumItems: 10 }
12  )
13  // ...
14}
15
```

![Screen capture of the same view of the app showing up to 10 tasks and possibly a “Load more” button. Now when the user clicks the checkboxes, there is no flash of the “Loading tasks…” message before the new data is shown. ](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F5f72dc485e5f97b2ebd9d126dfd0fa83e2e559fc-720x539.gif&w=3840&q=75)Screen capture of the same view of the app showing up to 10 tasks and possibly a “Load more” button. Now when the user clicks the checkboxes, there is no flash of the “Loading tasks…” message before the new data is shown.

### Let's recap this (less-)reactive app

To recap, in a use case like this task manager app, where I want to reactively query data based on user input while still giving users a smooth & stable experience:

- Using a reactive backend like [Convex](https://www.convex.dev/) with a reactive frontend framework like [React](http://reactjs.org/) lets me easily build live-updating apps, without having to constantly poll for updates in the background or make users manually refresh the page
- The reactive value returned by the [Convex `useQuery` hook](https://docs.convex.dev/api/modules/react#usequery) (which is `undefined` while data is loading) is exactly what I want in some cases (e.g. `listAllTasks`), as Convex will automatically update it whenever the data changes
- In other cases (like `listTasksWithStatus`), the `undefined` returned by `useQuery` while loading might not be ideal, e.g. causing an undesirable reloading flash if I’m dynamically updating the query arguments based on user input/app state
- If the default behavior of `useQuery` doesn't quite fit my use case, I can customize it by writing my own version, e.g. `useStableQuery`, which ‘skips’ intermediate `undefined` states with the help of [React’s `useRef` hook](https://beta.reactjs.org/learn/referencing-values-with-refs)
- If I want to [paginate](https://docs.convex.dev/using/pagination) the query results, I can write an analogous `useStablePaginatedQuery` which uses the same `useRef` pattern in conjunction with `[usePaginatedQuery](https://docs.convex.dev/generated-api/react#usepaginatedquery)`

If you have a use case similar to mine, feel free to use these hooks in your own apps! You can find the code in the [get-convex/convex-helpers](https://github.com/get-convex/convex-helpers/blob/main/src/hooks/useStableQuery.ts) repo on Github.

And if your use case is slightly different and you want to customize the reactive behavior of `useQuery` some other way, I hope this has provided a useful example of how to implement your own version with exactly the behavior you want! For another example of tweaking an app’s reactive dataflow with a custom React hook, check out [Jamie Turner’s video on Managing Reactivity with useBufferedState](https://stack.convex.dev/coping-with-the-web-s-looming-global-reactivity-crisis).

Have you run into other issues with reactive data updates? Do you have other favorite patterns for managing reactive query results? Feel free to jump into the [Convex community Discord](https://www.convex.dev/community) to share & discuss!

_Cover image: Roy Lichtenstein, “Crying Girl" (1963), via [WikiArt](https://www.wikiart.org/en/roy-lichtenstein/crying-girl-1963) (fair use)_

Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started