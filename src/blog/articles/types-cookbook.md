# Types and Validators in TypeScript: A Convex Cookbook

![Anjana Vakil's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F26b7f9ae04ef51725d117901c29166d930328d29-1080x1080.jpg&w=3840&q=75)

[Anjana Vakil](https://stack.convex.dev/author/anjana-vakil)

a year ago

# Types and Validators in TypeScript: A Convex Cookbook

!["types and validators" in bold text. "best practices and useful tidbits" in light text. a colored cookbook](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F2e37683c8d8f26a209a9556b4a1ba280a84afbee-2853x1911.png&w=3840&q=75)

As you become a seasoned Convex developer, you’ll see first-hand how fantastic the developer experience becomes when you’ve got types on your side. The end-to-end TypeScript as you build, and the consistency and security you get from Convex [schema enforcement](https://docs.convex.dev/database/schemas#validators) and [argument validation](https://docs.convex.dev/functions/args-validation) at runtime give you the tools to develop safely with types to help catch bugs early.

However, if you don’t know some of the tricks we’ll show you, your code may feel cumbersome to write. For example, say you’re building a cookbook app and have defined a `recipes` table in your schema. You specify the table’s fields using validators accessed from the `v` object exposed by `convex/values`:

```tsx
1// convex/schema.ts
2import { v } from "convex/values";
3import { defineSchema, defineTable } from "convex/server";
4
5export default defineSchema({
6  recipes: defineTable({
7    name: v.string(),
8		course: v.union(
9			v.literal('appetizer'),
10			v.literal('main'),
11			v.literal('dessert')
12		),
13		ingredients: v.array(v.string()),
14		steps: v.array(v.string())
15  }).index("by_course", ["course"]),
16});
17
```

Your function to add a new recipe argument validators might look like:

```tsx
1// in convex/recipes.ts
2import { v } from "convex/values";
3import { mutation } from "./_generated/server";
4
5export const addRecipe = mutation({
6  args: {
7    name: v.string(),
8		course: v.union(
9			v.literal('appetizer'),
10			v.literal('main'),
11			v.literal('dessert')
12		),
13		ingredients: v.array(v.string()),
14		steps: v.array(v.string()),
15  },
16  handler: async (ctx, args) => {
17    return await ctx.db.insert("recipes", args);
18  },
19});
20
```

And for a regular TypeScript function, you might find yourself defining types like:

```tsx
1type Course = 'appetizer' | 'main' | 'dessert';
2
3type Recipe = {
4	name: string,
5	course: Course,
6	ingredients: string[],
7	steps: string[],
8};
9
10async function getIngredientsForCourse(recipes: Recipe[], course: Course) {
11   ...
12}
13
```

As you can see, you may get frustrated repeatedly defining the same validators in your schema and functions, and redeclaring similar TypeScript types in different parts of your codebase. Is there a better way? Yes!

The Convex Test Kitchen has cooked up some convenient recipes for busy fullstack chefs like you! Keep these tasty typing tricks at hand, and you’ll be whipping up the types & validators you need in no time - without any cookie-cutter repetition.

### Dish out types from your `DataModel` with `Doc` and `Id`

Once you’ve [defined a schema](https://docs.convex.dev/database/schemas) for your database (or [generated](https://docs.convex.dev/dashboard/deployments/data#generating-a-schema) one from existing data), Convex will serve up your data types on a silver platter!

Convex code generation automatically creates types for all the documents in your tables, exposed via the `Doc<"tablename">` generic type from `convex/_generated/dataModel`. The data model also exposes an `Id<"tablename">` generic type corresponding to a valid [document ID](https://docs.convex.dev/database/document-ids) for a given table. Use these types to ensure the rest of your codebase uses data consistent with your schema:

```tsx
1// in src/Cookbook.tsx
2import { useQuery } from "convex/react";
3import { api } from "../convex/_generated/api";
4import type { Doc, Id } from "../convex/_generated/dataModel";
5
6export function Cookbook() {
7  const recipes = useQuery(api.recipes.list);
8  return recipes?.map((r) => <RecipePreview recipe={r} />);
9}
10
11export function RecipePreview({ recipe }: { recipe: Doc<"recipes"> }) {
12  return (
13    <div>
14      {recipe.name} ({recipe.course})
15    </div>
16  );
17}
18
19function RecipeDetails({ id }: { id: Id<"recipes"> }) {
20  const recipe = useQuery(api.recipes.getById, { id });
21
22  return (recipe && (
23    <div>
24      <h1>{recipe.name}</h1>
25      <h2>{recipe.course}</h2>
26      <ShoppingList ingredients={recipe.ingredients} />
27      <Instructions steps={recipe.steps} />
28    </div>
29  ));
30}
31
```

This `Id<"tablename">` type corresponds to values accepted by `v.id("tablename")` :

```tsx
1// in convex/recipes.ts
2import { v } from "convex/values";
3import { query } from "./_generated/server";
4
5export const getById = query({
6  args: {
7    id: v.id("recipes"),
8  },
9  handler: async (ctx, args) => {
10    return await ctx.db.get(args.id);
11  },
12});
13
```

### Keep validators from going stale

As we’ve seen, the `v` validators are used not only in your schema but also to [validate arguments](https://docs.convex.dev/functions/args-validation) passed in to your Convex functions. If all you need is a single [`v.id`](http://v.id/) that’s no sweat, but what about when arguments should match your schema definitions? For example:

```tsx
1// in convex/recipes.ts
2import { query } from "./_generated/server";
3import { v } from "convex/values";
4
5export const listByCourse = query({
6  args: {
7    course: v.union(
8			v.literal("appetizer"),
9			v.literal("main"),
10			v.literal("dessert")
11		),
12  },
13  handler: async (ctx, args) => {
14    return await ctx.db.query("recipes")
15			.withIndex("by_course", (q) => q.eq("course", args.course))
16			.collect();
17  },
18});
19
```

This doesn’t smell so good; it duplicates the `course` validator from your schema, which means not only did you have to repeat yourself (ugh), you also gave yourself the burden to remember to update this function whenever you update your schema (double ugh)!

To keep arguments in sync with schema changes, refactor `convex/schema.ts` to first define and export your field validators, then use them to define your tables:

```tsx
1// convex/schema.ts
2import { defineSchema, defineTable } from "convex/server";
3import { v } from "convex/values";
4
5export const courseValidator = v.union(
6	v.literal('appetizer'),
7	v.literal('main'),
8	v.literal('dessert')
9);
10
11export default defineSchema({
12  recipes: defineTable({
13	  name: v.string(),
14	  course: courseValidator,
15	  ingredients: v.array(v.string()),
16	  steps: v.array(v.string()),
17	}).index("by_course", ["course"]),
18});
19
```

Now you can reuse those validators in your Convex functions as needed:

```tsx
1// in convex/recipes.ts
2import { query } from "./_generated/server";
3import { courseValidator } from "convex/schema.ts";
4
5export const listByCourse = query({
6  args: {
7    course: courseValidator
8  },
9  handler: async (ctx, args) => {
10    return await ctx.db.query("recipes")
11			.withIndex("by_course", (q) => q.eq("course", args.course)
12			.collect();
13  },
14});
15
```

This keeps data consistent throughout your entire backend.

Pro tip: once you get the hang of this pattern, you might drop the "Validator," just "course" - it's cleaner.

But how can you make sure that other parts of your codebase, say, your frontend UI, are using TypeScript types that match those validators?

### Add a drop of ~~vanilla~~ TypeScript extract

For exactly that purpose, `convex.values` also provides a handy `Infer` type that lets you [extract TS types from your validators](https://docs.convex.dev/functions/args-validation#extracting-typescript-types):

```tsx
1// in convex/schema.ts
2import { defineSchema, defineTable } from "convex/server";
3import { v, Infer } from "convex/values";
4
5export const courseValidator = v.union(
6  v.literal('appetizer'),
7  v.literal('main'),
8  v.literal('dessert')
9);
10export type Course = Infer<typeof courseValidator>;
11
12// ...
13
```

You can expose the extracted types for use in other parts of your codebase:

```tsx
1// in src/Menu.tsx
2import { useState } from "react";
3import type { Course } from '../convex/schema.ts';
4
5export default function Menu() {
6  const [course, setCourse] = useState<Course>('main');
7
8  // Then, in response to some user input...
9  setCourse('side dish'); // TS error: invalid Course!
10  // ...
11}
12
```

### Sift out the system fields

The generated `Doc` type seen earlier includes the “system fields” automatically added by Convex to every document: `_id` and `_creationTime`. But often, for example when creating a new document, you want to make sure those fields aren’t included in your data. The `"convex/server"` module provides a handy `WithoutSystemFields<document>` generic type for just such a situation:

```tsx
1// in src/NewRecipePage.tsx
2
3import { api } from "../convex/_generated/api";
4import type { Doc } from "../convex/_generated/dataModel";
5import type { WithoutSystemFields } from "convex/server";
6
7export function SaveRecipeButton({ recipeData }:
8	{ recipeData: WithoutSystemFields<Doc<"recipes">> }
9) {
10  const createRecipe = useMutation(api.recipes.create);
11  return (
12    <button onClick={() => createRecipe(recipeData)}>
13      Save recipe
14    </button>
15  );
16}
17
```

But what about the corresponding argument validator? Rather than redefine the same shape of data that you’ve already defined in your schema, you can refactor your schema to export an object with the field validators for a given table, and import that object for use in your functions:

```tsx
1// in convex/schema.ts
2// ...
3export const recipeFields = {
4  name: v.string(),
5  course: courseValidator,
6  ingredients: v.array(v.string()),
7  steps: v.array(v.string()),
8};
9
10export default defineSchema({
11  recipes: defineTable(recipeFields)
12    .index("by_course", ["course"]),
13});
14
```

```tsx
1// in convex/recipes.ts
2// ...
3import { recipeFields } from "./schema";
4
5export const addRecipe = mutation({
6  args: recipeFields,
7  handler: async (ctx, args) => {
8    return await ctx.db.insert("recipes", args);
9  },
10});
11
```

No repetition needed, and any changes to the shape of the `recipes` table will percolate automatically from `schema.ts`. Now we’re cooking! By the way, if you like this pattern, you’ll probably like Ian’s `Table` utility in the convex-helpers npm package - post on it coming soon.

### Boiling it all down

To recap, with a little bit of reorganization your Convex codebase can be sweeter than ever, with no repetition or risk of stale data shapes!

- In `schema.ts` , define and export your document fields and their validators separately, then pass them in to `defineTable()`
- In your Convex functions, validate arguments with the imported validators from your schema instead of repeating yourself
- In your frontend, use Convex-generated types `Doc<table>` and `Id<table>`, along with type utilities like `Infer<validator>` and `WithoutSystemFields<doc>` to convert your schema-defined validators to the TypeScript types you need

Hungry for more tidbits like this to help manage, modify, and manipulate your types and validators? Check out [this post](https://stack.convex.dev/argument-validation-without-repetition) for recipes to re-use code for argument validation and schemas.

Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started
