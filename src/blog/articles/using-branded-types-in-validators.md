# Using branded types in validators

![Ian Macartney's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F077753b63476b77fb111ba06d1bb538517033a54-3500x3500.jpg&w=3840&q=75)

[Ian Macartney](https://stack.convex.dev/author/ian-macartney)

a year ago

# Using branded types in validators

![Using branded types in validators with type casting in your schema](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2Fc4f22afbfdd39a1108047b1fb9dc3c596f9353db-2877x1911.png&w=3840&q=75)

If you have a more specific type than what you can express with Convex validators, you can still document that at the type level in Convex by casting once in your schema definition.

If you have a type that you use to distinguish different strings, for instance, you might want to make sure you're passing just those types around. E.g. you might have a type:

```
1type MyStringType = string & { __myStringType: never };
2
```

### brandedString helper

If you just want to get to the code, you can use the [convex-helpers](https://www.npmjs.com/package/convex-helpers#validator-utilities) helper:

```ts
1import { brandedString } from "convex-helpers/validators";
2import { Infer } from "convex/values";
3
4export const emailValidator = brandedString("email");
5export type Email = Infer<typeof emailValidator>;
6
```

Read on to learn more about casting in different scenarios.

### Casting schema validators

If you want to use this type for Convex, you can only set a field validator as `v.string()`. However, if you cast it in your schema definition, you'll get the types everywhere automatically:

```ts
1import { defineSchema, defineTable } from "convex/server";
2import { Validator, v } from "convex/values";
3
4defineSchema({
5  myTable: defineTable({
6    myField: v.string() as Validator<MyStringType>
7  })
8)}
9
```

`field` will be typed as `MyStringType`. When you have a query like:

```ts
1const doc = ctx.db
2  .query("myTable")
3	.filter(q => q.eq(q.field("myField"), foo)
4	.first();
5
```

You will have type hints that the parameter for `foo` needs to be of type `MyStringType` and you'll get type errors if your type doesn't match.

You'll also see that `doc.myField` has the type `MyStringType` when you retrieve it.

### Casting argument validators

The same logic applies to function arguments:

```ts
1export const foo = query({
2  args: { bar: v.string() as Validator<MyStringType>},
3  handler: async (ctx, args) => {
4    //... args.bar is type MyStringType
5  },
6});
7
```

On the client, you'll get type errors if you don't pass `MyStringType` as the `bar` parameter.

### Can I get into trouble?

Yes! Whenever you use `as` in TypeScript, you're saying "hey compiler, I know better than you here, so just trust me, k?". Casting to a branded string is less risky than `as any`. Thankfully, TypeScript will try to save you from glaring errors. For instance, if you do:

```ts
1    counter: v.number() as Validator<string>,
2
```

you could get into a situation where the field expects to be compared to a string as a type, but at runtime will be validated as a number.
Thankfully, in situations this embarrassing TypeScript will give you an error:

```
1Conversion of type 'Validator<number, false, never>' to type 'Validator<string, false, never>' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
2  Type 'number' is not comparable to type 'string'.ts
3
```

TypeScript will only let you cast when it's plausible. This doesn't mean you can't make a mistake, but it will hopefully save you most of the time. And if you really think you know better than the compiler, you can do `v.number() as unknown as Validator<LiterallyAnythingGoesAtThisPoint>`, just don't send it to me in a pull request :).

### What happens at runtime?

At runtime, it will just be validated with `v.string()`. These types disappear when the TypeScript is compiled to JavaScript, and you'll observe `typeof myField === "string"`. TypeScript is not static typing. It's some fairy dust sprinkled on top of JavaScript that gets baked off during transpilation to js (e.g. when you run `tsc`).

### What is string branding?

String "branding" is where you annotate a type that is different than a normal string at the type level, even though it's just a string at the runtime level. For instance, a Convex `Id<"users">` is the type `string & { __tableName: "users" }`. This means if I try to assign `const foo: Id<"users"> = "bar";`, I will get a type error. It's fine to do `const foo: string = "bar" as Id<"users">;` however, since `Id` is just a more "refined" type of `string`.

Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started

We use third-party cookies to understand how people interact with our site.

See our [Privacy Policy](https://www.convex.dev/legal/privacy/) to learn more.

DeclineAccept