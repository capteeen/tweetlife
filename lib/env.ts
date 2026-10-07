import { z } from 'zod';
import { databaseUrl, redisUrl } from './db-url';

// Parsed once; every module reads config from here rather than process.env.
const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  TOKEN_ENCRYPTION_KEY: z.string().min(32),

  X_CLIENT_ID: z.string().min(1),
  X_CLIENT_SECRET: z.string().optional().default(''),
  X_API_TIER: z.enum(['free', 'basic', 'pro']).default('basic'),
  X_MONTHLY_CALL_BUDGET: z.coerce.number().int().positive().default(10000),
  X_GLOBAL_RATE_PER_SEC: z.coerce.number().positive().default(2),
  X_GLOBAL_BURST: z.coerce.number().int().positive().default(5),
  X_USER_RATE_PER_SEC: z.coerce.number().positive().default(0.5),
  X_USER_BURST: z.coerce.number().int().positive().default(3),
  X_FIRST_BUILD_MAX_POSTS: z.coerce.number().int().positive().max(3200).default(3200),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  // worker: BullMQ worker process consumes jobs (npm run worker).
  // inline: no worker; /api/cron/tick runs ingestion steps inside the web app's functions (Vercel).
  INGEST_MODE: z.enum(['worker', 'inline']).default('worker'),
  // Vercel sets Authorization: Bearer $CRON_SECRET on cron invocations; also used for self-triggered ticks.
  CRON_SECRET: z.string().optional().default(''),

  // Solana wallets. mainnet by default (real money). Set devnet to test with faucet SOL.
  SOLANA_CLUSTER: z.enum(['devnet', 'mainnet-beta']).default('mainnet-beta'),
  SOLANA_RPC_URL: z.string().optional().default(''),
  JUPITER_API_URL: z.string().default('https://lite-api.jup.ag/swap/v1'),

  NEXT_PUBLIC_PARTYKIT_HOST: z.string().optional().default(''),
  PRESENCE_SECRET: z.string().optional().default(''),
  OPERATOR_HANDLE: z.string().optional().default(''),
  ADMIN_HANDLES: z.string().optional().default(''),
  RENDER_DIR: z.string().default('./renders'),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse({
    ...process.env,
    // Accept the names hosting integrations create (POSTGRES_URL, KV_URL, <PREFIX>_URL ...).
    DATABASE_URL: databaseUrl(),
    // Locally a missing Redis means the default local server; in production it is a setup problem to report.
    REDIS_URL: redisUrl() ?? (process.env.VERCEL || process.env.NODE_ENV === 'production' ? undefined : 'redis://localhost:6379'),
    // On Vercel, fall back to the deployment URL so self-calls and OAuth redirects work before a domain is set.
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'),
    // Vercel has no worker process: default to inline there unless told otherwise.
    INGEST_MODE: process.env.INGEST_MODE || (process.env.VERCEL ? 'inline' : 'worker'),
  });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Names of required variables that are missing or invalid, without throwing. For setup notices. */
export function envProblems(): string[] {
  try {
    env();
    return [];
  } catch (e) {
    const msg = (e as Error).message.replace(/^Invalid environment: /, '');
    return msg.split('; ').map((m) => m.split(':')[0]).filter(Boolean);
  }
}

export function adminHandles(): string[] {
  return env()
    .ADMIN_HANDLES.split(',')
    .map((h) => h.trim().replace(/^@/, '').toLowerCase())
    .filter(Boolean);
}

export function isAdmin(handle: string | null | undefined): boolean {
  if (!handle) return false;
  return adminHandles().includes(handle.toLowerCase());
}
