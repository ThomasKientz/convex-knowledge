# Argument Validation without Repetition

![Anjana Vakil's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F26b7f9ae04ef51725d117901c29166d930328d29-1080x1080.jpg&w=3840&q=75)

[Anjana Vakil](https://stack.convex.dev/author/anjana-vakil)

a year ago

# Argument Validation without Repetition

![Argument validation without repetition: Advanced tips and tricks](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F57e2634a0f1f1d4ba6be467600176b61eb653e2f-2877x1911.png&w=3840&q=75)

When developing Convex apps with TypeScript, you’ll achieve the fastest iteration cycle and best developer experience once you’ve streamlined how schema enforcement, argument validation, and end-to-end type hinting all work together in your app.

In the first post in this series, the [Types and Validators cookbook](https://stack.convex.dev/types-cookbook), we shared several basic patterns & best practices for organizing your codebase to share types & validators from your schema, which becomes the central source of truth for your data model.

In this post, we’ll take it one step further and introduce a few more advanced techniques & helpers to accelerate the development workflow in your Convex projects.

### Review: reuse schema field declarations

As mentioned in the [previous post](https://stack.convex.dev/types-cookbook), you can define validators describing your data model in your schema file, then export them for use across your codebase like so:

```tsx
1// in convex/schema.ts
2import { defineSchema, defineTable } from "convex/server";
3import { v } from "convex/values";
4
5export const recipeFields = {
6  name: v.string(),
7  course: v.union(
8    v.literal("appetizer"),
9    v.literal("main"),
10    v.literal("dessert")
11  ),
12  ingredients: v.array(v.string()),
13  steps: v.array(v.string()),
14};
15
16export default defineSchema({
17  recipes: defineTable(recipeFields).index("by_course", ["course"]),
18});
19
```

The exported object can then be used wherever you need data of the same shape, for example to validate arguments of an `addRecipe` mutation that inserts a new document:

```tsx
1// in convex/recipes.ts
2import { mutation } from "./_generated/server";
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

And to ensure your frontend is also typed accordingly, the generated `Doc<table>` generic type, along with handy utilities like `WithoutSystemFields<document>`, ensures your client-side code matches the data model defined by your schema:

```tsx
1// in src/NewRecipePage.tsx
2
3import { api } from "../convex/_generated/api";
4import type { Doc } from "../convex/_generated/dataModel";
5import type { WithoutSystemFields } from "convex/server";
6
7export function SaveRecipeButton({
8  recipeData,
9}: {
10  recipeData: WithoutSystemFields<Doc<"recipes">>,
11}) {
12  const createRecipe = useMutation(api.recipes.create);
13  const onClick = () => createRecipe(recipeData);
14  return <button onClick={onClick}>Save recipe</button>;
15}
16
```

### Put TS utility types to work

Sometimes you only want to work with a specific subset of the fields for a given table. On the client side, you can use TypeScript’s builtin [`Pick`](https://www.typescriptlang.org/docs/handbook/utility-types.html#picktype-keys) and [`Omit`](https://www.typescriptlang.org/docs/handbook/utility-types.html#omittype-keys) utility types to specify exactly which fields are needed:

```tsx
1// in src/Cookbook.tsx
2type RecipeSummary = Pick<Doc<"recipes">, "name" | "course">;
3type UncategorizedRecipe = Omit<Doc<"recipes">, "course">;
4
5function RecipeHeader({ recipe }: { recipe: RecipeSummary }) {
6  return (
7    <h1>
8      {recipe.name} ({recipe.course})
9    </h1>
10  );
11}
12
13function RecipeDetails({ recipe }: { recipe: UncategorizedRecipe }) {
14  return (
15    <p>
16      {recipe.name}: {recipe.steps.length} steps
17    </p>
18  );
19}
20
```

Similarly, you can use TypeScript’s builtin [`Partial`](https://www.typescriptlang.org/docs/handbook/utility-types.html#partialtype) to make an all-fields-optional type for those cases where you’re not sure which subset of a document might be needed. This comes in handy when patching documents, for example:

```tsx
1// in src/Cookbook.tsx
2import { useMutation } from "convex/react";
3import { api } from "../convex/_generated/api";
4import type { Id, Doc } from "../convex/_generated/dataModel";
5
6function RecipeEditor({ recipeId: Id<'recipes'> }) {
7	const updateRecipe = useMutation(api.recipes.update);
8
9	// in response to some user input...
10  const newData: Partial<Doc<'recipes'>> = {
11		name:  'Sweeter recipe name',
12		course: 'dessert'
13  });
14	updateRecipe(recipeId, newData);
15}
16
17
```

### Choose validator subsets with object destructuring

Similar to `Pick` in TypeScript, object de-structuring helps you derive subsets of the validators exported from your schema, and use these to validate function arguments:

```tsx
1// in convex/recipes.ts
2import { query} from "./_generated/server";
3import { recipeFields } from "./schema";
4
5const { course } = recipeFields;
6
7export const findRecipesByCourse = query({
8  args: { course },
9  handler: async (ctx, args) => {
10    return await ctx.db
11      .query("recipes")
12      .withIndex("by_course", (q) => q.eq("course", args.course))
13      .collect();
14  },
15});
16
```

And analogous to TypeScript’s `Omit`, combining de-structuring with the rest operator ( `...`) lets you ignore certain field validators and work with just those that remain:

```tsx
1// in convex/recipes.ts
2import { mutation } from "./_generated/server";
3import { recipeFields } from "./schema";
4
5const { course, ...recipeWithoutCourse } = recipeFields
6
7export const addDessert = mutation({
8  args: recipeWithoutCourse,
9  handler: async (ctx, args) => {
10    return await ctx.db.insert("recipes", { ...args, course: "dessert" });
11  },
12});
13
```

### `Table` helper for schema definition & validation

[get-convex/ **convex-helpers**\\
\\
![GitHub logo](https://stack.convex.dev/logos/github.svg)](https://github.com/get-convex/convex-helpers)

The [`convex-helpers`](https://github.com/get-convex/convex-helpers) library provides a convenient [`Table` helper](https://github.com/get-convex/convex-helpers/blob/main/packages/convex-helpers/server/index.ts) to codify the pattern of splitting validator fields out of table definitions.

`Table` accepts a `fields` argument defining your field validators (just like you’d pass to `defineTable`):

```tsx
1// convex/schema.ts
2import { defineSchema, defineTable } from "convex/server";
3import { v } from "convex/values";
4import { Table } from "convex-helpers/server"; // npm i convex-helpers
5
6export const Recipes = Table("recipes", {
7  name: v.string(),
8  course: v.union(
9    v.literal("appetizer"),
10    v.literal("main"),
11    v.literal("dessert")
12  ),
13  ingredients: v.array(v.string()),
14  steps: v.array(v.string()),
15});
16
17export default defineSchema({
18  recipes: Recipes.table.index("by_course", ["course"]),
19});
20
```

The object returned by `Table` provides easy access to not only the table itself, which can then be passed to `defineSchema()`, but also the corresponding validators you’ve defined, with or without the system fields `_id` and `_creationTime` which are automatically added to the table’s documents:

```tsx
1Recipes.table; // object returned by defineTable(), passed to defineSchema()
2Recipes.withoutSystemFields; // the user-defined field validators
3Recipes.withSystemFields; // those validators plus _id and _creationTime
4Recipes.doc; // v.object() validator for the table's docs (incl. system fields)
5
```

These can be used as needed in your Convex functions. For example, for a `addRecipe` mutation that inserts a new document into the table, you can use `.withoutSystemFields` to validate the incoming table data:

```tsx
1// convex/recipes.ts
2import { mutation, action } from "./_generated/server";
3import { Recipes } from "./schema";
4
5export const addRecipe = mutation({
6  args: Recipes.withoutSystemFields,
7  handler: async (ctx, args) => {
8    return await ctx.db.insert("recipes", args);
9  },
10});
11
```

When you need to pass a whole document in as a function argument, after getting it from the database, `.doc` provides the corresponding object validator. For example, say you have a `generateThumbnail` action to [generate an AI image](https://stack.convex.dev/using-dall-e-from-convex) based on a recipe document:

```tsx
1// in convex/recipes.ts
2import { action } from "./_generated/server";
3import { internal } from "./_generated/api";
4
5export const generateThumbnail = action({
6  args: {
7    recipe: Recipes.doc,
8  },
9  handler: async (ctx, args) => {
10    const imgStorageId = await generateDallE(
11      `A recipe named ${args.recipe.name} made with ` +
12      args.recipe.ingredients.join(", ")
13    );
14    await ctx.runMutation(internal.recipes.addImage, {
15      recipeId: args.recipe._id,
16      imgStorageId,
17    });
18  },
19});
20
```

#### `.doc` vs. `.withSystemFields`: A quick note on `v.object()`

While `.withSystemFields` is a regular old object (which just happens to have field names as keys and `Validator` s as values), `.doc` provides the `ObjectValidator` corresponding to the `.withSystemFields` object.

In other words, `Recipes.doc` is equivalent to `v.object(Recipes.withSystemFields)`.

```tsx
1// To accept a whole document as an argument:
2args: {
3    recipe: Recipes.doc, // <- you can't pass Recipes.withSystemFields here, as each arg expects a validator, not an object
4}
5
6// To accept each of the fields as separate arguments:
7args: Recipes.withSystemFields // <- you can't pass Recipes.doc here, as args expects an object, not a validator
8
9
```

You can use the `.doc` validator when passing entire documents as function arguments, and `.withSystemFields` when you need a JS object, for instance to destructure or spread arguments as described earlier. It’s currently not possible to “unwrap” a `v.object()` to get the individual field validators, though that might be supported in the future.

### Recap: DRY validators & types

With a few TS & JS builtins and `convex-helpers` utilities, you can streamline your argument validator definitions, minimizing repetition across your Convex codebase.

- Expose your tables’ field validators defined in `convex/schema.ts` for use in functions
- Use Convex generic types like `Doc` , and TS utility types like `Pick` & `Omit`, to get the (sub)sets of fields you need in TypeScript
- Use object destructuring & the rest operator ( `...`) to get the (sub)sets of fields you need for argument validation in Convex functions
- Use the `Table` helper from `convex-helpers` for easy access to the defined table and the corresponding validators for its documents, with or without system fields

If you found these tips useful, or have any of your own you’d like to share with other developers in the Convex community, please jump on [Discord](https://www.convex.dev/community) and let us know!

Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started

We use third-party cookies to understand how people interact with our site.

See our [Privacy Policy](https://www.convex.dev/legal/privacy/) to learn more.

DeclineAccept