# Testing patterns for peace of mind

![Ian Macartney's avatar](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F077753b63476b77fb111ba06d1bb538517033a54-3500x3500.jpg&w=3840&q=75)

[Ian Macartney](https://stack.convex.dev/author/ian-macartney)

a year ago

# Testing patterns for peace of mind

![setting up your testing mvp for peace of mind](https://stack.convex.dev/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fts10onj4%2Fproduction%2F646095c9e79390fd2f7eb94fa3e77e1ee887578b-1452x956.png&w=3840&q=75)

Every engineer knows that testing is a “good thing” but many have the same reluctant acceptance as one might have towards eating their vegetables. Attitudes like aiming for 100% code coverage, or going through the motions of writing meaningless unit tests, often don’t do much to improve the actual correctness of a system despite consuming a lot of engineering effort. I’m not going to argue that you test everything on principle, but rather outline concrete steps you can take at various levels of your stack. As a gut-check, I’d suggest looking them over and see which makes sense for your system, making one targeted investment at a time. As I say in the [parent post about operational maturity](https://stack.convex.dev/operational-maturity-for-production), there isn’t a destination where you’ll be “done” with testing. Rather, treat it as an ongoing process that you improve as your app matures. In general I would encourage investment in roughly the order they’re presented.

#### Manual testing in development environment

Hopefully you try your code locally before having it reviewed or pushing it to production. This might seem obvious, but there are a few best practices to make this more effective. It helps to actually detail in your commit or pull-request message how you manually tested the change. Adding screenshots or print outs of outputs can be helpful for reviewers to double check that your manual test was indeed successful. It’s also important when iterating on a change to always repeat the full manual test on the latest version of your code. Since manual testing takes a lot of time, you should figure out how to automate at least some form of tests as soon as possible.

#### Testing core business logic

The simplest tests assert the basic business behavior of your app. You should start by testing the logic that is core to your value proposition, and anything to do with security or accounting. Encode the guarantees you want the code to make, not just to validate your logic today, but also to catch regressions or accidental changes that may indirectly break a core invariant. For a full-stack app, the backend API is the perfect place to exercise your code and assert its behavior.

Convex comes with a library that mocks the backend running your functions and lets you write tests that execute fast. Fast tests are important so that you can write as many of them as you need, and get a signal back quickly during development and in CI. Check out the [Testing page in Covex docs](https://docs.convex.dev/functions/testing).

### End-to-end testing

#### Manual testing on each PR via preview deployments

Preview deployments allow you to test new code in a production-like environment. This is often triggered by creating a branch and pull request on GitHub, and common with frontend hosting providers like [Vercel](https://docs.convex.dev/production/hosting/vercel#preview-deployments) and [Netlify](https://docs.convex.dev/production/hosting/netlify#deploy-previews). This allows reviewers to play around with your code, without checking out your branch and running it locally. If you’re using SSR, ISR, SSG, RSC, or any other frontend optimizations that change how your app is built, this will also help you see that behavior in a more representative environment than a local instance.

With Convex Pro you can also [provision a preview Convex deployment](https://docs.convex.dev/production/hosting/preview-deployments) to have a per-preview backend alongside your preview frontend and test your full-stack app without affecting the data in your production app.

#### Adding smoke tests as an end-to-end sanity check

“Smoke” tests are very basic tests to ensure there are no glaring issues. The term comes from testing hardware where simply plugging in a device and checking for smoke can catch mistakes, even if none of the advanced functionality is exercised.

For web apps you can write sophisticated tests using a tool like [Cypress](https://www.cypress.io/) or [Playwright](https://playwright.dev/), but you can also catch a surprising number of bugs from a test that simply loads the page. I’d recommend starting here and expanding browser testing as pages and functionality stabilize.

You can run smoke tests against a local backend.

#### Running tests against a local backend

You can spin up a local backend to run tests that go from a client all the way through to the database. Running it locally helps in quickly creating fresh instances to test against, and allows you to scale running these tests without using hosting resources. It won’t catch issues involving your hosted configuration (such as any firewalls between your backend and other resources you might access in tests), for which running tests or manually testing in a hosted backend can help.

[Use the guide here](https://stack.convex.dev/testing-with-local-oss-backend) for running a local open-source Convex backend.

### Testing in production

In addition to tests that run in isolation, there are some places where the thing you are testing is the production ecosystem itself - the hosting, access patterns, unique user behavior, etc.

#### Staging deployments

Before you launch your app to everyone, you can deploy to a project that is set up similarly to production, but only serves a subset of users - usually employees, manual user testers, and alpha users. These deployments can happen more frequently than production, such as on every PR merged into `main` or via a daily cron. This allows developers to see their change “live” and catch any bugs they missed in the preview deployment environment.

In Convex you can use a separate project for either the staging or actual production deployment. See [Production page in docs](https://docs.convex.dev/production#staging-environment).

#### Liveness checks using Pingdom

[Pingdom](https://www.pingdom.com/) is one of many services that will regularly make dummy requests to your application to help catch when your site goes down. Tests that run within your regular environment, or metrics about your site health can fall short of catching issues like a mis-configured DNS record or VPC. Does your app have no issues because it’s bug free or because no one can access it? It can also help detect when you **aren’t** down, but think you are because of a change in metrics reporting. Having an external service execute a basic request once in a while adds another layer of reassurance and debugging information.

#### Data verification via background jobs

Convex is a robust ACID-compliant database with serializable isolation and many great transactional guarantees, but it won’t prevent you from violating your own logical invariants, such as having every user be a member of at least one team. Testing is a layered approach and that layer needs to extend into a running application and verifying that logical invariants are maintained. At scale, some invariants cannot be enforced inside transactions, so you’ll need to periodically verify these asynchronously.

For instance, if you are building a social network, at scale you’ll want to denormalize the number of friends a user has, rather than querying all of their friends when you want to display a count. When you add a friend, you’ll increment their friend count, and when they’re removed, you decrement it. If you change this behavior and introduce a bug, it’s not mission-critical, but it would be good to catch as soon as possible. One way to achieve this is to sanity check the number of friends for all users modified in a mutation. However, this can bloat the transaction and negate the performance benefits of denormalization. A more scalable approach is to routinely walk the data and re-compute derived fields, alerting on any inconsistencies found so a developer can find the bug and patch the incorrect data. These offline checks are not an immediate priority, but are especially helpful as your team grows and data becomes more mission-critical.

#### Feature gating risky changes for instant rollbacks

You can ship new features that are gated behind some remotely configured flag, which allows you to deploy the new code and turn on the new feature at different times. You can also use the flag to turn off features that don’t work as intended. When making riskier changes, it’s safer to leave the code around for the older version, and gradually release the newer version, monitoring for regressions. To start you can [achieve this in Convex](https://stack.convex.dev/feature-gating) with a simple “flags” table. As your needs grow to managing cohorts and gradual rollouts, you’ll likely want a product like [LaunchDarkly](https://launchdarkly.com/) which also has tooling for A/B tests.

## Summary

As your app matures, tests will help you stay sane, and allow you to focus on your product. They come in many shapes and sizes, testing various parts of the stack and anything from business logic to infrastructure configuration. What is the area you feel your app is most vulnerable? Where could you make a small investment with a big potential impact? Pick off one thing at a time and prioritize it against other investments in your app’s operational maturity that you can [read about here](https://stack.convex.dev/operational-maturity-for-production).

Build in minutes, scale forever.

Convex is the backend platform with everything you need to build your full-stack AI project. Cloud functions, a database, file storage, scheduling, workflow, vector search, and realtime updates fit together seamlessly.

Get started

We use third-party cookies to understand how people interact with our site.

See our [Privacy Policy](https://www.convex.dev/legal/privacy/) to learn more.

DeclineAccept