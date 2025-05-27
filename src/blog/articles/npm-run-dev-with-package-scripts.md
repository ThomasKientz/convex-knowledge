# Supercharge `npm run dev` with package.json scripts

![Ian Macartney's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F077753b63476b77fb111ba06d1bb538517033a54-3500x3500.jpg&w=3840&q=75)

[Ian Macartney](https://stack.convex.dev/author/ian-macartney)

a year ago

# Supercharge \`npm run dev\` with package.json scripts

![improved npm run dev](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F40f7b662647447f6b71f3e7c8e319f6c87f66431-2493x1656.png&w=3840&q=75)

`npm run dev` is the standard for "run my website locally," but how does it work? How can we expand its functionality? In this post we'll look at:

- How to configure what `npm run dev` does.
- How to decompose complex commands into granular units.
- How to run multiple commands in parallel.
- How to run pre-requisites without losing normal `Ctrl-C` behavior.
- How to add seed data (if none exists) when starting up a Convex backend.

As a motivating example, here are some npm run scripts defined in the [convex-helpers](https://github.com/get-convex/convex-helpers) example app. We'll cover what each piece does

```json
1  "scripts": {
2    "dev": "npm-run-all --parallel dev:backend dev:frontend",
3    "build": "tsc && vite build",
4    "dev:backend": "convex dev",
5    "dev:frontend": "vite",
6    "predev": "convex dev --until-success",
7    "test": "vitest"
8  },
9
```

## What does `npm run dev` do?

`npm run dev` sets up a [local development server](https://stack.convex.dev/developing-with-the-oss-backend), enabling real-time code changes and instant feedback. This command simplifies the development process by automatically reloading the application whenever you make changes to the code.

### How and where they're defined

`npm run` executes commands that are defined in your `package.json` in your project's workspace. These commands are often pre-configured when you start your repo from a command like `npm create vite@latest` with commands for:

- `dev`: Run a development environment. This often includes auto-reloading the UI when files change. For [Vite](https://vitejs.dev/) this is `vite` and [Next.js](https://nextjs.org/) is `next dev`.
- `build`: Build the website for deployment. This will generally compile and bundle all your html, css, and javascript. For Vite this is `vite build` and Next.js is `next build`.
- `test`: Run tests - if you're using [Jest](https://jestjs.io/), it's just `"test": "jest"` or `vitest` for [Vitest](https://vitest.dev/).

Here's a basic example from Next.js:

```js
1// in package.json
2{
3// ...
4  "scripts": {
5    "dev": "next dev",
6    "build": "next build",
7    "start": "next start",
8    "lint": "next lint"
9  },
10//...
11
```

Here you can run `npm run dev` or `npm run lint` etc.

You can learn more about `npm run` in [the docs](https://docs.npmjs.com/cli/v10/commands/npm-run-script).

## Why use package.json scripts?

It's a fair question why one would put commands that are already so simple into package json scripts. Why not just call `jest` or `vite` or `next build`? There's a few good reasons:

1. You can save the default parameters for `npm run` commands so you don't have to remember or document the "standard" way of starting something. We'll see below how you can configure it to chain commands and run others in parallel.
2. It allows you to easily run commands that are installed by `npm` but not globally accessible from your shell (terminal).[1](https://stack.convex.dev/npm-run-dev-with-package-scripts#user-content-fn-1) When you install things like `npm install -D vitest`, it installs `vitest` into `node_modules/.bin`.[2](https://stack.convex.dev/npm-run-dev-with-package-scripts#user-content-fn-2) You can't run `vitest` directly in your shell,[3](https://stack.convex.dev/npm-run-dev-with-package-scripts#user-content-fn-3) but you can have a config like: `"scripts": { "test": "vitest" }` and `npm run test` will run `vitest`.
3. It always runs with the root of the package folder as the "current directory" even if you're in a subdirectory. So you can define a script like `"foo": "./myscript.sh"` and it will always look for `myscript.sh` in the package root (in the same directory as package.json). Note: you can access the current directory where it was called via the `INIT_CWD` environment variable.
4. You can reference variables in the `package.json` easily when the script is run from `npm run`. For instance, you can access the "version" of your package with the `npm_package_version` environment variable, like `process.env.npm_package_version` in js or `$npm_package_version` in a script.
5. If you have multiple workspaces (many directories with their own package.json configured into a parent package.json with a "workspaces" config), you can run the same command in all workspaces with `npm test --workspaces` or one with `npm run lint --workspace apps/web`.

## Does `npm run dev` work with yarn / pnpm / bun?

Yes! Even if you install your dependencies with another package manager, you can still run your package scripts with npm.

```sh
1yarn # similar to `npm install`
2npm run dev # still works!
3
```

You don't have to remember that `npm run dev` maps to `yarn dev` (or `yarn run dev`). The same goes for `npx`: `npx convex dev` works regardless of what package manager you used to install things.

## Running multiple commands in parallel with `npm run all` or `concurrently`

There are a couple packages you can use to execute npm commands concurrently:[4](https://stack.convex.dev/npm-run-dev-with-package-scripts#user-content-fn-4)

1. [`npm-run-all`](https://github.com/mysticatea/npm-run-all)
2. [`concurrently`](http://npmjs.org/package/concurrently)

Here's an example of `npm-run-all`:

```json
1  "scripts": {
2    "dev": "npm-run-all --parallel dev:backend dev:frontend",
3    "dev:backend": "convex dev",
4    "dev:frontend": "vite",
5  },
6
```

This defines three npm run scripts.

1. `npm run dev:backend` runs `convex dev`.
2. `npm run dev:frontend` runs `vite`.
3. `npm run dev` runs both `convex dev` and `vite` in parallel via `npm-run-all`.

Both outputs are streamed out, and doing Ctrl-C will interrupt both scripts. With `npm run all`, you can easily run both the [Convex backend](https://stack.convex.dev/building-the-oss-backend) and frontend services with one command.

Here's an example of using concurrently to run the same project:

```json
1 "scripts": {
2    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\"",
3    "dev:backend": "convex dev",
4    "dev:frontend": "vite",
5  },
6
```

This set of package json scripts run multiple npm run commands in parallel similar to `npm run all` but uses the `concurrently` package which provides additional features like better handling of command outputs and more control over execution control.

## Enhancing `npm run dev` with `predev` and `postbuild`

You can specify commands to run before (pre) or after (post) another command (say, X) by naming your command `preX` or `postX`. In the example:

```json
1  "scripts": {
2    "dev": "npm-run-all --parallel dev:backend dev:frontend",
3    "dev:backend": "convex dev",
4    "dev:frontend": "vite",
5    "predev": "convex dev --until-success",
6  },
7
```

This will run `convex dev --until-success`, before the "dev" command of `npm-run-all --parallel dev:backend dev:frontend`.

### Chaining with "&&"

For those used to shell scripting, you can run two commands in sequence if the previous one succeeds with `commandA && commandB`. This works on both Windows and Unix (Mac / Linux).

However, there's a couple advantages to just using `pre`-scripts:

1. You can run either command with `npm run dev --ignore-scripts` to not do the "predev" script, or `npm run predev` to explicitly only do the "predev" step.
2. The Ctrl-C behavior is more predictable in my experience. In different shell environments, doing Ctrl-C (which sends an interrupt signal to the current process) would sometimes kill the first script but still run the second script. After many attempts we decided to switch to "predev" as the pattern.

## Run interactive steps first

The first time you [run Convex](https://docs.convex.dev/quickstart/nodejs) by using `npx convex dev` (or `npm run dev` with the above scripts), it will ask you to log in if you aren't already, and ask you to set up your project if one isn't already set up. This is great, but interactive commands that update the output text don't work well when the output is being streamed by multiple commands at once. This is the motivation for running `npx convex dev --until-success` before `npx convex dev`.

- `convex dev` syncs your functions and schema whenever it doesn't match what you have deployed, watching for file changes.
- The `--until-success` flag syncs your functions and schema only until it succeeds once, telling you what to fix if something is wrong and retrying automatically until it succeeds or you Ctrl-C it.
- By running `npx convex dev --until-success`, we can go through the login, project configuration, and an initial sync, all before trying to start up the frontend and backend.
- The initial sync is especially helpful if it catches issues like missing environment variables which need to be set before your app can function.
- This way the frontend doesn't start until the backend is ready to handle requests with the version of functions it expects.

## Seeding data on startup

If you change your "predev" command for Convex to include `--run` it will run a server-side function before your frontend has started.

```json
1  "scripts": {
2	  //...
3    "predev": "convex dev --until-success --run init",
4		//...
5  },
6
```

The `--run init` command will run a function that is the default export in `convex/init.ts`. You could also run `--run myFolder/myModule:myFunction`. See [docs on naming here](https://docs.convex.dev/functions/query-functions#query-names).

See the Convex documentation on [query names](https://docs.convex.dev/functions/query-functions#query-names). See this [post on seeding data](https://stack.convex.dev/seeding-data-for-preview-deployments) for more details. In essence, you can define an [internalMutation](https://docs.convex.dev/functions/internal-functions) that checks if the database is empty and, if so, inserts a collection of records for testing or setup purposes.

## tsc?

If you [use TypeScript](https://stack.convex.dev/end-to-end-ts), you can run a type check / compile your typescript files with a bare `tsc`. If your `tsconfig.json` is configured to emit types, it will write out the types. If not, it will just validate the types. This is great to do as part of the build, so you don't build anything that has type errors. This is why the above example did:

```js
1    "build": "tsc && vite build",
2
```

## Passing arguments to `npm run` commands

If you want to pass arguments to a command, for instance passing arguments to your testing command to specify what test to run, you can pass them **after** a `--` to separate the command from the argument. Technically you don't need `--` if your arguments are positional instead of `-`-prefixed, but it doesn't hurt to always do it in case you forget which to do it for.

```sh
1npm run test -- --grep="pattern"
2
```

## Handling common npm script errors

When working with npm run commands, you might encounter various errors. Here are some common issues and how to handle them:

- **Command Not Found**: Ensure the command is installed locally in your node\_modules and correctly referenced in your `package.json` scripts.
- **Permission Denied**: This often occurs on Unix-based systems. You might need to adjust file permissions or use `sudo` cautiously.
- **Syntax Errors**: Double-check your `package.json` for any syntax errors, such as missing commas or incorrect script names.

## Integrating npm run scripts with CI/CD pipelines

Integrating npm run scripts with CI/CD pipelines can automate your development workflow, ensuring consistent builds and deployments. Most CI/CD tools like GitHub Actions, GitLab CI, and Jenkins support running npm scripts as part of their pipeline configuration.

For example, in a [GitHub Actions](https://docs.convex.dev/testing/ci#testing-in-github-actions) workflow:

```
1name: Run Tests
2
3on: [pull_request, push]
4
5jobs:
6  build:
7    runs-on: ubuntu-latest
8    steps:
9      - uses: actions/checkout@v4
10      - uses: actions/setup-node@v4
11      - run: npm ci
12      - run: npm run test
13
```

This yaml file makes sure that every push to your repository triggers the CI pipeline, running your tests and building your project automatically.

## Summary

We looked at some ways of using package.json scripts to simplify our workflows. Who knew how much power could rest behind a simple `npm run dev`? Looking at our original example:

```json
1  "scripts": {
2    "dev": "npm-run-all --parallel dev:backend dev:frontend",
3    "build": "tsc && vite build",
4    "dev:backend": "convex dev",
5    "dev:frontend": "vite",
6    "predev": "convex dev --until-success",
7    "test": "vitest"
8  },
9
```

- `dev` runs the frontend and backend in parallel, after `predev`.
- `build` does type checking via `tsc` before building the static site.
- `dev:backend` continuously deploys the backend functions to your development environment as you edit files.
- `dev:frontend` runs a local frontend server that auto-reloads as you edit files.
- `predev` runs before `dev` and does an initial deployment, handling login, configuration, and an initial sync as necessary.
- `test` uses Vitest to run tests. Note: `npm test` is shorthand for `npm run test` along with other commands, but they're special cases. `npm run test` is the habit I suggest.

### Footnotes

1. The way your shell finds which command to run when you type `npm` is to check the shell's `PATH` environment variable (on unix machines anyways). You can see your own with `echo "$PATH"`. It checks all the places specified in `$PATH` and uses the first one. [↩](https://stack.convex.dev/npm-run-dev-with-package-scripts#user-content-fnref-1)

2. Technically you can override & specify where npm installs binaries. [↩](https://stack.convex.dev/npm-run-dev-with-package-scripts#user-content-fnref-2)

3. If you really want to, you can run `npm exec vitest`, `npx vitest` for short, `./npm_modules/.bin/vitest` directly, or add `.npm_modules/.bin` to your PATH. [↩](https://stack.convex.dev/npm-run-dev-with-package-scripts#user-content-fnref-3)

4. Some people use a bare `&` to run one task in the background, but that is not supported on Windows, and interrupting one command won't necessarily kill the other. [↩](https://stack.convex.dev/npm-run-dev-with-package-scripts#user-content-fnref-4)


Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started

We use third-party cookies to understand how people interact with our site.

See our [Privacy Policy](https://www.convex.dev/legal/privacy/) to learn more.

DeclineAccept