import Redis, { RedisOptions } from "ioredis";
import { env } from "../config/env";
import { logger } from "../config/logger";

export function getRedisConfig(): RedisOptions {
  return {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    ...(env.REDIS_TLS ? { tls: {} } : {}),
    lazyConnect: false,
  };
}

export function createRedis(): Redis {
  const redis = new Redis(getRedisConfig());
  redis.on("error", (err) => {
    logger.error({ err }, "Redis connection error");
  });
  return redis;
}

export function createBullConnection(): Redis {
  const config = getRedisConfig();
  const redis = new Redis({
    ...config,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  redis.on("error", (err) => {
    logger.error({ err }, "BullMQ Redis connection error");
  });
  return redis;
}

export const defaultRedis = createRedis();
