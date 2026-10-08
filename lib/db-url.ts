// Resolve the Postgres and Redis URLs from whatever name the hosting integration created.
// Vercel's Prisma Postgres / Neon / Redis integrations use a prefix the user picks, so rather than guess
// names we prefer the well-known ones and then scan every variable for a URL of the right scheme.

const DB_PREFERRED = ['DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_PRISMA_URL', 'POSTGRES_URL_NON_POOLING', 'DATABASE_URL_UNPOOLED'];
const REDIS_PREFERRED = ['REDIS_URL', 'KV_URL', 'STORAGE_URL', 'UPSTASH_REDIS_URL'];

const isPg = (v?: string) => !!v && /^postgres(ql)?:\/\//i.test(v);
// prisma+postgres:// (Prisma Accelerate) needs the Accelerate client extension; use it only as a last resort.
const isPrismaProxy = (v?: string) => !!v && /^prisma\+postgres:\/\//i.test(v);
const isRedis = (v?: string) => !!v && /^rediss?:\/\//i.test(v);

function scan(preferred: string[], test: (v?: string) => boolean): string | undefined {
  for (const n of preferred) if (test(process.env[n])) return process.env[n];
  for (const [k, v] of Object.entries(process.env)) if (/_URL$|_URI$|_DSN$/i.test(k) && test(v)) return v;
  return undefined;
}

export function databaseUrl(): string | undefined {
  return scan(DB_PREFERRED, isPg) ?? scan(['DATABASE_URL'], isPrismaProxy);
}

// A serverless function instance keeps its own Prisma pool, sized from the host's CPU count by default
// (often 5-17 connections). Many warm or frozen Vercel instances add up and hit the database's connection cap
// ("too many connections for role ..."), which takes every page down. On Vercel each instance gets a small
// pool instead (Prisma's serverless advice); DATABASE_CONNECTION_LIMIT overrides the size. Parameters
// already in the URL win, and the long-running worker keeps Prisma's default pool.
export function pooledDatabaseUrl(url = databaseUrl()): string | undefined {
  if (!url || !process.env.VERCEL || !isPg(url)) return url;
  const add: Record<string, string> = {
    connection_limit: process.env.DATABASE_CONNECTION_LIMIT || '1',
    pool_timeout: '20',
  };
  const [base, query = ''] = url.split('?');
  const params = new URLSearchParams(query);
  for (const [k, v] of Object.entries(add)) if (!params.has(k)) params.set(k, v);
  return `${base}?${params.toString()}`;
}

export function redisUrl(): string | undefined {
  return scan(REDIS_PREFERRED, isRedis);
}

/** Names (never values) of variables that look storage-related, for the setup notice. */
export function storageVariableNames(): string[] {
  return Object.keys(process.env)
    .filter((k) => /POSTGRES|DATABASE|PRISMA|REDIS|KV_|STORAGE|NEON|UPSTASH/i.test(k))
    .sort();
}
