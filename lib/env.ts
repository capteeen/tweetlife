import { z } from 'zod';

// Parsed once; every module reads config from here rather than process.env.
const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
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
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

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
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  cached = parsed.data;
  return cached;
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
