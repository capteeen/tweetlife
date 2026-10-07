import Redis from 'ioredis';
import { env } from './env';

const g = globalThis as unknown as { redis?: Redis };

export function redis(): Redis {
  if (g.redis) return g.redis;
  const client = new Redis(env().REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableOfflineQueue: true,
    lazyConnect: false,
  });
  client.on('error', (e) => {
    // Logged, not thrown: callers treat Redis failures as "can't verify" and fail closed.
    console.error('[redis]', e.message);
  });
  g.redis = client;
  return client;
}

/** A separate connection for BullMQ (it requires maxRetriesPerRequest: null). */
export function bullConnection() {
  return new Redis(env().REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false });
}
