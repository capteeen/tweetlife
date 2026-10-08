import { db } from '../db';
import { redis } from '../redis';
import { env } from '../env';

// Two budgets gate X calls:
//  - a monthly call count. The ledger of record is the ApiCall table; a Redis counter mirrors it
//    for cheap reads and is rebuilt from Postgres when missing.
//  - a daily spend cap in dollars. X's pay-per-use plan bills every post and every user a response
//    returns ($0.005 a post, $0.010 a user, follower and following lists included), not the request.
//    xFetch estimates each response's cost and adds it to a per-UTC-day Redis counter. X deduplicates
//    a resource read twice in one UTC day, so the estimate is an upper bound on the real bill.

export function monthKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthStart(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function counterKey() {
  return `x:calls:${monthKey()}`;
}

export async function callsThisMonth(): Promise<number> {
  const r = redis();
  const cached = await r.get(counterKey());
  if (cached != null) return Number(cached);
  const n = await db.apiCall.count({ where: { at: { gte: monthStart() } } });
  await r.set(counterKey(), String(n), 'EX', 60 * 60 * 24 * 40);
  return n;
}

/** Dollar price of one billable resource, in millionths of a dollar. */
export const PRICE_MICROS = { post: 5_000, user: 10_000 } as const;

/** What one response costs on pay-per-use, from the endpoint and the number of objects it returned. */
export function estimateCostMicros(endpoint: string, body: unknown): number {
  const data = (body as { data?: unknown } | null)?.data;
  const n = Array.isArray(data) ? data.length : data ? 1 : 0;
  if (n === 0) return 0;
  if (endpoint === '/2/tweets' || /^\/2\/users\/:id\/tweets$/.test(endpoint)) return n * PRICE_MICROS.post;
  if (endpoint.startsWith('/2/users')) return n * PRICE_MICROS.user;
  return 0;
}

function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function spendKey() {
  return `x:spend:${dayKey()}`;
}

export async function spentTodayMicros(): Promise<number> {
  const v = await redis().get(spendKey()).catch(() => null);
  return v ? Number(v) : 0;
}

export async function recordSpend(micros: number) {
  if (micros <= 0) return;
  await redis().multi().incrby(spendKey(), Math.round(micros)).expire(spendKey(), 3 * 24 * 3600).exec();
}

export async function recordCall() {
  const r = redis();
  const k = counterKey();
  const exists = await r.exists(k);
  if (exists) await r.incr(k);
  // if the key is missing it will be rebuilt from Postgres on next read
}

export type BudgetStatus = {
  used: number;
  budget: number;
  fraction: number;
  /** Estimated pay-per-use spend today (UTC) and the cap, in dollars. */
  spentToday: number;
  dailyCap: number;
  /** The worse of the two budgets. At 'warn' optional calls stand down; at 'exhausted' every call stops. */
  level: 'ok' | 'warn' | 'exhausted';
  /** Which budget set the level ('month' when both are fine). */
  limitedBy: 'month' | 'day';
  month: string;
  /** When the limiting budget resets. */
  resetsAt: string;
};

const levelOf = (f: number): BudgetStatus['level'] => (f >= 1 ? 'exhausted' : f >= 0.8 ? 'warn' : 'ok');

export async function budgetStatus(): Promise<BudgetStatus> {
  const e = env();
  const budget = e.X_MONTHLY_CALL_BUDGET;
  const [used, spent] = await Promise.all([callsThisMonth(), spentTodayMicros()]);
  const fraction = used / budget;
  const dailyCap = e.X_DAILY_SPEND_CAP_USD;
  const spentToday = spent / 1e6;
  const dayFraction = dailyCap > 0 ? spentToday / dailyCap : 0;
  const now = new Date();
  const monthReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const dayReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const limitedBy = dayFraction > fraction && levelOf(dayFraction) !== 'ok' ? 'day' : 'month';
  return {
    used,
    budget,
    fraction,
    spentToday,
    dailyCap,
    level: levelOf(Math.max(fraction, dayFraction)),
    limitedBy,
    month: monthKey(),
    resetsAt: (limitedBy === 'day' ? dayReset : monthReset).toISOString(),
  };
}
