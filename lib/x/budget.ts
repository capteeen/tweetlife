import { db } from '../db';
import { redis } from '../redis';
import { env } from '../env';

// Monthly call budget. The ledger of record is the ApiCall table; a Redis counter mirrors it
// for cheap reads and is rebuilt from Postgres when missing.

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
  level: 'ok' | 'warn' | 'exhausted';
  month: string;
  resetsAt: string;
};

export async function budgetStatus(): Promise<BudgetStatus> {
  const budget = env().X_MONTHLY_CALL_BUDGET;
  const used = await callsThisMonth();
  const fraction = used / budget;
  const now = new Date();
  const resetsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return {
    used,
    budget,
    fraction,
    level: fraction >= 1 ? 'exhausted' : fraction >= 0.8 ? 'warn' : 'ok',
    month: monthKey(),
    resetsAt: resetsAt.toISOString(),
  };
}

/** New world builds are refused at 100%. Existing worlds keep serving from Postgres. */
export async function canStartNewBuild(): Promise<boolean> {
  return (await budgetStatus()).level !== 'exhausted';
}
