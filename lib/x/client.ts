import { db } from '../db';
import { acquire, pauseUntil } from './limiter';
import { budgetStatus, estimateCostMicros, recordCall, recordSpend } from './budget';
import { BudgetExhaustedError, XApiError } from './types';

// The one function through which every request to api.x.com passes.
// Order per call: budget check -> token bucket (queue) -> fetch -> ledger row -> 429 handling -> spend estimate.

const BASE = 'https://api.x.com';

export type XRequest = {
  /** Path starting with /2/ */
  path: string;
  query?: Record<string, string | number | undefined>;
  /** Bearer user access token (plain). */
  accessToken: string;
  /** For the per-user bucket and the ledger. */
  userId: string | null;
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  /** Max time to sit in the limiter queue. Request handlers use a short one; workers a long one. */
  maxWaitMs?: number;
  /** Retries on 429 / 5xx. */
  retries?: number;
  /** Calls that must still go out at 100% budget (token revocation on world delete). */
  ignoreBudget?: boolean;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function endpointLabel(path: string) {
  // /2/users/123/tweets -> /2/users/:id/tweets
  return path.replace(/\/\d{3,}/g, '/:id');
}

export async function xFetch<T>(req: XRequest): Promise<T> {
  const retries = req.retries ?? 3;
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (!req.ignoreBudget) {
      const b = await budgetStatus();
      if (b.level === 'exhausted') throw new BudgetExhaustedError();
    }
    await acquire(req.userId, { maxWaitMs: req.maxWaitMs });

    const url = new URL(BASE + req.path);
    for (const [k, v] of Object.entries(req.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));

    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(url, {
        method: req.method ?? 'GET',
        headers: {
          authorization: `Bearer ${req.accessToken}`,
          'user-agent': 'tweetlife (unofficial fan project)',
          ...(req.body ? { 'content-type': 'application/json' } : {}),
        },
        body: req.body ? JSON.stringify(req.body) : undefined,
        cache: 'no-store',
      });
    } catch (e) {
      // Network failure: log as status 0, retry with backoff.
      await ledger(req, 0, null, null, Date.now() - started);
      if (attempt++ >= retries) throw new XApiError(`network error: ${(e as Error).message}`, 0);
      await sleep(backoff(attempt));
      continue;
    }

    const remaining = num(res.headers.get('x-rate-limit-remaining'));
    const resetHeader = num(res.headers.get('x-rate-limit-reset'));
    const resetAt = resetHeader != null ? new Date(resetHeader * 1000) : null;
    await ledger(req, res.status, remaining, resetAt, Date.now() - started);

    if (res.status === 429) {
      const until = resetAt && resetAt.getTime() > Date.now() ? resetAt : new Date(Date.now() + backoff(attempt + 1));
      await pauseUntil(until);
      if (attempt++ >= retries) {
        throw new XApiError('rate limited by X', 429, until, await safeJson(res));
      }
      await sleep(Math.max(backoff(attempt), until.getTime() - Date.now()));
      continue;
    }
    if (res.status >= 500) {
      if (attempt++ >= retries) throw new XApiError(`X API ${res.status}`, res.status, null, await safeJson(res));
      await sleep(backoff(attempt));
      continue;
    }
    if (!res.ok) {
      const body = await safeJson(res);
      const detail =
        (body && typeof body === 'object' && ((body as { detail?: string }).detail || (body as { title?: string }).title)) ||
        `X API ${res.status}`;
      throw new XApiError(String(detail), res.status, null, body);
    }
    const json = await res.json();
    await recordSpend(estimateCostMicros(endpointLabel(req.path), json)).catch((e) => console.error('[x spend]', (e as Error).message));
    return json as T;
  }
}

function backoff(attempt: number) {
  // 1s, 2s, 4s, 8s ... + jitter, capped at 60s
  return Math.min(60_000, 1000 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 500);
}

function num(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function ledger(req: XRequest, status: number, remaining: number | null, resetAt: Date | null, durationMs: number) {
  try {
    await db.apiCall.create({
      data: {
        userId: req.userId,
        endpoint: endpointLabel(req.path),
        status,
        rateLimitRemaining: remaining,
        rateLimitReset: resetAt,
        durationMs,
      },
    });
    await recordCall();
  } catch (e) {
    console.error('[x ledger] failed to record call', (e as Error).message);
  }
}
