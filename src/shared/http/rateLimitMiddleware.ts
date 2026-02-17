import type { Redis } from "ioredis";
import type { RequestHandler } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { AppError } from "./AppError";
import { RedisStore, type RedisReply } from "rate-limit-redis";

export type RateLimitPolicy = {
  windowMs: number;
  limit: number;
};

export type RateLimitConfig = {
  namespace: string;
  redis?: Redis;
  auth: RateLimitPolicy;
  write: RateLimitPolicy;
};

export type RouteRateLimiters = {
  auth: RequestHandler;
  write: RequestHandler;
};

const createStore = (redis: Redis | undefined, namespace: string): RedisStore | undefined => {
  if (!redis) {
    return undefined;
  }
  return new RedisStore({
    sendCommand: async (...args: string[]) => {
      const [command, ...commandArgs] = args;
      return (await redis.call(command, ...commandArgs)) as RedisReply;
    },
    prefix: `rate-limit:${namespace}:`
  });
};

const createLimiter = (
  namespace: string,
  policy: string,
  config: RateLimitPolicy,
  store: RedisStore | undefined,
  skipSuccessfulRequests = false
): RequestHandler =>
  rateLimit({
    windowMs: config.windowMs,
    limit: config.limit,
    skipSuccessfulRequests,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    passOnStoreError: true,
    identifier: `${namespace}-${policy}`,
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? "", 56),
    store,
    handler: (_req, _res, next) => {
      next(new AppError("TOO_MANY_REQUESTS", 429, "Too many requests. Please try again later."));
    }
  });

export const createRateLimiters = (config: RateLimitConfig): RouteRateLimiters => {
  return {
    auth: createLimiter(
      config.namespace,
      "auth",
      config.auth,
      createStore(config.redis, `${config.namespace}:auth`),
      true
    ),
    write: createLimiter(
      config.namespace,
      "write",
      config.write,
      createStore(config.redis, `${config.namespace}:write`)
    )
  };
};
