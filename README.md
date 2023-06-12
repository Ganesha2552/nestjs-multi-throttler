<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[travis-image]: https://api.travis-ci.org/nestjs/nest.svg?branch=master
[travis-url]: https://travis-ci.org/nestjs/nest
[linux-image]: https://img.shields.io/travis/nestjs/nest/master.svg?label=linux
[linux-url]: https://travis-ci.org/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore"><img src="https://img.shields.io/npm/dm/@nestjs/core.svg" alt="NPM Downloads" /></a>
<a href="https://travis-ci.org/nestjs/nest"><img src="https://api.travis-ci.org/nestjs/nest.svg?branch=master" alt="Travis" /></a>
<a href="https://travis-ci.org/nestjs/nest"><img src="https://img.shields.io/travis/nestjs/nest/master.svg?label=linux" alt="Linux" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#5" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://twitter.com/nestframework"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

NestJS Multi-Throttler is a powerful rate limiting package for NestJS applications that supports both Express and Fastify frameworks. It allows you to easily implement rate limiting functionality to control the number of requests your application can handle within a specific time frame.

## Features

Supports rate limiting for Express and Fastify frameworks.
Provides options for defining custom time rates for rate limiting.
Based on the [nestjs/throttler](https://github.com/nestjs/throttler)
project.

## Installation

```bash
$ npm i --save nestjs-multi-throttler
```

or

```bash
yarn add nestjs-multi-throttler

```

## Table of Contents

- [Description](#description)
- [Table of Contents](#table-of-contents)
- [Usage](#usage)
  - [ThrottlerModule](#throttlermodule)
  - [Decorators](#decorators)
    - [@Throttle()](#throttle)
    - [@SkipThrottle()](#skipthrottle)
  - [Ignoring specific user agents](#ignoring-specific-user-agents)
  - [ThrottlerStorage](#throttlerstorage)
  - [Proxies](#proxies)
  - [Working with Websockets](#working-with-websockets)
  - [Working with GraphQL](#working-with-graphql)
- [Storage Options](#storage-options)

## Usage

To start using NestJS Multi-Throttler, you need to import the ThrottlerModule into your application module and configure it with your desired rate limit options.

```ts
import { Module } from '@nestjs/common';
import { ThrottlerModule } from 'nestjs-multi-throttler';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      limits: [
        { timeUnit: 'second', limit: 10 }, // Example rate limit configuration
        { timeUnit: 'minute', limit: 100 },
      ],
      storage: { type: 'redis', redisOptions: { url: 'redis://localhost:6379' } },
    }),
  ],
})
export class AppModule {}
```

You can customize the rate limits by specifying the timeUnit (e.g., 'second', 'minute', 'hour', 'day', 'week') and the corresponding limit. The package also supports multiple rate limits, allowing you to define different limits for various time units.

Additionally, NestJS Multi-Throttler provides support for different storage options, such as Redis, in-memory storage (default), and MongoDB.

### ThrottlerModule

The `ThrottleModule` is the main entry point for this package, and can be used
in a synchronous or asynchronous manner. All the needs to be passed is the
`ttl`, the time to live in seconds for the request tracker, and the `limit`, or
how many times an endpoint can be hit before returning a 429.

```ts
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from 'nestjs-multi-throttler';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      { timeUnit: 'minute', limit: 5 },
      { timeUnit: 'hour', limit: 50 },
      { timeUnit: 20, limit: 3 }, // 20 seconds
    ]),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
```

The above would mean that 10 requests from the same IP can be made to a single endpoint in 1 minute.

```ts
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        limits: config.get('THROTTLE_LIMIT'),
      }),
    }),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
```

The above is also a valid configuration for asynchronous registration of the module.

**NOTE:** If you add the `ThrottlerGuard` to your `AppModule` as a global guard
then all the incoming requests will be throttled by default. This can also be
omitted in favor of `@UseGuards(ThrottlerGuard)`. The global guard check can be
skipped using the `@SkipThrottle()` decorator mentioned later.

Example with `@UseGuards(ThrottlerGuard)`:

```ts
// app.module.ts
@Module({
  imports: [ThrottlerModule.forRoot([{ timeUnit: 'minute', limit: 20 }])],
})
export class AppModule {}

// app.controller.ts
@Controller()
export class AppController {
  @UseGuards(ThrottlerGuard)
  @Throttle([
    { timeUnit: 'minute', limit: 20 },
    { timeUnit: 'hour', limit: 100 },
    { timeUnit: 'second', limit: 1 },
  ])
  normal() {}
}
```

### Decorators

#### @Throttle()

```ts
@Throttle([{ timeUnit: 'minute', limit: 20 }])
```

This decorator will set `THROTTLER_LIMIT` metadata on the
route, for retrieval from the `Reflector` class. Can be applied to controllers
and routes.

#### @SkipThrottle()

```ts
@SkipThrottle(skip = true)
```

This decorator can be used to skip a route or a class **or** to negate the
skipping of a route in a class that is skipped.

```ts
@SkipThrottle()
@Controller()
export class AppController {
  @SkipThrottle(false)
  dontSkip() {}

  doSkip() {}
}
```

In the above controller, `dontSkip` would be counted against and rate-limited
while `doSkip` would not be limited in any way.

### Ignoring specific user agents

You can use the `ignoreUserAgents` key to ignore specific user agents.

```ts
@Module({
  imports: [
    ThrottlerModule.forRoot({
      [
        { timeUnit: 'minute', limit: 20 },
        { timeUnit: 'hour', limit: 100 },
        { timeUnit: 'day', limit: 200 },
      ]
      ignoreUserAgents: [
        // Don't throttle request that have 'googlebot' defined in them.
        // Example user agent: Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)
        /googlebot/gi,

        // Don't throttle request that have 'bingbot' defined in them.
        // Example user agent: Mozilla/5.0 (compatible; Bingbot/2.0; +http://www.bing.com/bingbot.htm)
        new RegExp('bingbot', 'gi'),
      ],
    }),
  ],
})
export class AppModule {}
```

### ThrottlerStorage

Interface to define the methods to handle the details when it comes to keeping track of the requests.

Currently the key is seen as an `MD5` hash of the `IP`, the `ClassName`, the
`MethodName` and `TimeUnit` to ensure that no unsafe characters are used and to ensure that
the package works for contexts that don't have explicit routes (like Websockets
and GraphQL).

The interface looks like this:

```ts
export interface ThrottlerStorage {
  storage: Record<string, ThrottlerStorageRecord>;
  increment(key: string, ttl: number): Promise<ThrottlerStorageRecord>;
}
```

So long as the Storage service implements this interface, it should be usable by the `ThrottlerGuard`.

### Proxies

If you are working behind a proxy, check the specific HTTP adapter options ([express](http://expressjs.com/en/guide/behind-proxies.html) and [fastify](https://www.fastify.io/docs/latest/Server/#trustproxy)) for the `trust proxy` option and enable it. Doing so will allow you to get the original IP address from the `X-Forward-For` header, and you can override the `getTracker()` method to pull the value from the header rather than from `req.ip`. The following example works with both express and fastify:

```ts
// throttler-behind-proxy.guard.ts
import { ThrottlerGuard } from 'nestjs-multi-throttler';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>): string {
    return req.ips.length ? req.ips[0] : req.ip; // individualize IP extraction to meet your own needs
  }
}

// app.controller.ts
import { ThrottlerBehindProxyGuard } from './throttler-behind-proxy.guard';
@UseGuards(ThrottlerBehindProxyGuard)
```

### Working with Websockets

To work with Websockets you can extend the `ThrottlerGuard` and override the `handleRequest` method with something like the following method

```ts
@Injectable()
export class WsThrottlerGuard extends ThrottlerGuard {
  async handleRequest(context: ExecutionContext, limits: ThrottlerRateLimit[]): Promise<boolean> {
    const client = context.switchToWs().getClient();
    // this is a generic method to switch between `ws` and `socket.io`. You can choose what is appropriate for you
    const ip = ['conn', '_socket']
      .map((key) => client[key])
      .filter((obj) => obj)
      .shift().remoteAddress;
    for (const limit of limits) {
      const key = this.generateKey(context, tracker, limit.timeUnit);
      const { totalHits, timeToExpire } = await this.storageService.increment(
        key,
        this.getTTL(limit.timeUnit) * 1000,
      );

      // Throw an error when the user has reached their limit for the current rate limit
      if (totalHits > limit.limit) {
        throw new ThrottlerException();
      }
    }

    return true;
  }
}
```

There are some things to take keep in mind when working with websockets:

- You cannot bind the guard with `APP_GUARD` or `app.useGlobalGuards()` due to how Nest binds global guards.
- When a limit is reached, Nest will emit an `exception` event, so make sure there is a listener ready for this.

### Working with GraphQL

To get the `ThrottlerModule` to work with the GraphQL context, a couple of things must happen.

- You must use `Express` and `apollo-server-express` as your GraphQL server engine. This is
  the default for Nest, but the [`apollo-server-fastify`](https://github.com/apollographql/apollo-server/tree/master/packages/apollo-server-fastify) package does not currently support passing `res` to the `context`, meaning headers cannot be properly set.
- When configuring your `GraphQLModule`, you need to pass an option for `context` in the form
  of `({ req, res}) => ({ req, res })`. This will allow access to the Express Request and Response
  objects, allowing for the reading and writing of headers.
- You must add in some additional context switching to get the `ExecutionContext` to pass back values correctly (or you can override the method entirely)

```ts
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  getRequestResponse(context: ExecutionContext) {
    const gqlCtx = GqlExecutionContext.create(context);
    const ctx = gqlCtx.getContext();
    return { req: ctx.req, res: ctx.res }; // ctx.request and ctx.reply for fastify
  }
}
```

## Storage Options

The storage property is used to define the storage option for the rate limiter. There are three options available:
Option 1: Redis

```ts
@Module({
  imports: [
  ThrottlerModule.forRoot({
  limits: [{ timeUnit: 'minute', limit: 5 }],
  storage: {
      type: 'redis',
      redisOptions: {
        url: 'redis://localhost:6379'
      }
    },
  }),
  ],
})
```

This option uses Redis as the storage for the rate limiter. It requires providing the valid Redis server URL (redis://localhost:6379 in this case).

Option 2: Memory (default)

```ts
@Module({
  imports: [
  ThrottlerModule.forRoot({
  limits: [{ timeUnit: 'minute', limit: 5 }],
    storage: { type: 'memory' }
    }),
  ],
})
```

This option uses in-memory storage for the rate limiter. It is the default option if no storage property is provided.

Option 3: MongoDB

```ts
@Module({
  imports: [
    ThrottlerModule.forRoot({
      limits: [{ timeUnit: 'minute', limit: 5 }],
      storage: {
        type: 'mongodb',
        mongoOptions: {
          url: 'mongodb://localhost:27017',
        },
      },
    }),
  ],
})

```

This option uses MongoDB as the storage for the rate limiter. It requires providing the valid MongoDB server URL (mongodb://localhost:27017 in this case).

Feel free to submit a PR with your custom storage options being added to this list.

## License

Nest is [MIT licensed](LICENSE).

## Acknowledgments

This project was forked from the [nestjs/throttler](https://github.com/nestjs/throttler) project.
