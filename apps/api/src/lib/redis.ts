import IORedis from "ioredis";

import { env } from "./env";

export const redisConnection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export async function closeRedisConnection(): Promise<void> {
  await redisConnection.quit();
}

