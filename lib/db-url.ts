// Resolve the Postgres and Redis URLs from whatever name the hosting integration created.
// Vercel's Prisma Postgres / Neon / Redis integrations use a prefix the user picks, so accept the common ones.

const DB_NAMES = ['DATABASE_URL', 'POSTGRES_PRISMA_URL', 'POSTGRES_URL', 'DATABASE_DATABASE_URL', 'STORAGE_DATABASE_URL', 'PRISMA_DATABASE_URL'];
const REDIS_NAMES = ['REDIS_URL', 'KV_URL', 'STORAGE_URL', 'REDIS_REDIS_URL', 'UPSTASH_REDIS_URL', 'STORAGE_REDIS_URL'];

export function databaseUrl(): string | undefined {
  for (const n of DB_NAMES) if (process.env[n]) return process.env[n];
  return undefined;
}

export function redisUrl(): string | undefined {
  for (const n of REDIS_NAMES) if (process.env[n]) return process.env[n];
  return undefined;
}
