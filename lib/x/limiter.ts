import { redis } from '../redis';
import { env } from '../env';

// Token buckets in Redis. Two buckets gate every X call: a global one and one per user token.
// acquire() never bursts past the bucket: it computes the wait until a token is available and sleeps.

const LUA = `
local key = KEYS[1]
local rate = tonumber(ARGV[1])      -- tokens per ms
local burst = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local data = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts = tonumber(data[2])
if tokens == nil then tokens = burst; ts = now end
tokens = math.min(burst, tokens + (now - ts) * rate)
local wait = 0
if tokens >= 1 then
  tokens = tokens - 1
else
  wait = math.ceil((1 - tokens) / rate)
  tokens = 0
  -- we reserve the token at time now+wait, so leave the bucket at 0 and advance ts to that moment
  now = now + wait
end
redis.call('HSET', key, 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', key, math.ceil(burst / rate) + 60000)
return wait
`;

async function reserve(key: string, ratePerSec: number, burst: number): Promise<number> {
  const r = redis();
  const wait = (await r.eval(LUA, 1, key, ratePerSec / 1000, burst, Date.now())) as number;
  return Number(wait);
}

/** The system-wide pause set by a 429: no X call goes out until it clears. */
const GLOBAL_PAUSE_KEY = 'x:pause';

export async function pauseUntil(resetAt: Date) {
  const ms = Math.max(1000, resetAt.getTime() - Date.now());
  await redis().set(GLOBAL_PAUSE_KEY, String(resetAt.getTime()), 'PX', ms);
}

export async function currentPause(): Promise<Date | null> {
  const v = await redis().get(GLOBAL_PAUSE_KEY);
  return v ? new Date(Number(v)) : null;
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

/**
 * Wait for a slot in both buckets. Resolves when the caller may fire the request.
 * Throws if the queue would exceed maxWaitMs (so request handlers can fail honestly instead of hanging).
 */
export async function acquire(userId: string | null, opts: { maxWaitMs?: number } = {}): Promise<void> {
  const e = env();
  const maxWait = opts.maxWaitMs ?? 120_000;
  const started = Date.now();

  const pause = await currentPause();
  if (pause) {
    const ms = pause.getTime() - Date.now();
    if (ms > maxWait) throw new LimiterTimeout(ms);
    if (ms > 0) await sleep(ms);
  }

  const waits = [reserve('x:bucket:global', e.X_GLOBAL_RATE_PER_SEC, e.X_GLOBAL_BURST)];
  if (userId) waits.push(reserve(`x:bucket:user:${userId}`, e.X_USER_RATE_PER_SEC, e.X_USER_BURST));
  const wait = Math.max(...(await Promise.all(waits)));
  if (Date.now() - started + wait > maxWait) throw new LimiterTimeout(wait);
  if (wait > 0) await sleep(wait);
}

export class LimiterTimeout extends Error {
  constructor(public waitMs: number) {
    super(`X rate limiter queue too long (${Math.round(waitMs / 1000)}s)`);
    this.name = 'LimiterTimeout';
  }
}

/** Approximate queue depth: how far behind "now" the global bucket's reservation clock is. */
export async function limiterStatus() {
  const r = redis();
  const [tokens, ts] = await r.hmget('x:bucket:global', 'tokens', 'ts');
  const pause = await currentPause();
  const backlogMs = ts ? Math.max(0, Number(ts) - Date.now()) : 0;
  return {
    globalTokens: tokens ? Number(tokens) : env().X_GLOBAL_BURST,
    backlogMs,
    pausedUntil: pause && pause.getTime() > Date.now() ? pause.toISOString() : null,
  };
}
