import type { IngestRun } from '@prisma/client';
import { db } from '../db';
import { ingestTimeline, refreshRecentMetrics } from '../x/ingest';
import { BudgetExhaustedError, XApiError } from '../x/types';

// Runs one IngestRun. Shared by the BullMQ worker (no deadline: a run completes in one go) and by
// inline mode (/api/cron/tick: a run is advanced in bounded steps and re-queued until done).

export const MAX_ATTEMPTS = 4;
/** A `running` row whose heartbeat is older than this was abandoned by a dead function; it is re-claimed. */
export const STALE_MS = 10 * 60 * 1000;

export type RunOutcome = 'done' | 'paused' | 'retry' | 'dead';

function backoffMs(attempt: number) {
  return Math.min(30 * 60 * 1000, 30_000 * 2 ** (attempt - 1));
}

/**
 * Advance a run. Marks it running, performs work until `deadline` (inline) or completion (worker),
 * and records the outcome on the row. Never throws for X errors; returns 'retry' or 'dead' instead.
 */
export async function runIngest(runId: string, opts: { deadline?: number; countAttempt?: boolean } = {}): Promise<{ outcome: RunOutcome; error?: string }> {
  const run = await db.ingestRun.update({
    where: { id: runId },
    data: { status: 'running', heartbeatAt: new Date(), error: null, ...(opts.countAttempt === false ? {} : { attempts: { increment: 1 } }) },
  });
  try {
    const res = run.kind === 'metrics_refresh' ? await refreshRecentMetrics(run) : await ingestTimeline(run, run.kind, { deadline: opts.deadline });
    if (res.done) {
      await db.ingestRun.update({ where: { id: runId }, data: { status: 'succeeded', finishedAt: new Date() } });
      return { outcome: 'done' };
    }
    // paused at the deadline with progress persisted: back to the queue, no attempt consumed
    await db.ingestRun.update({ where: { id: runId }, data: { status: 'queued', notBefore: null, attempts: { decrement: opts.countAttempt === false ? 0 : 1 } } });
    return { outcome: 'paused' };
  } catch (e) {
    const err = (e as Error).message.slice(0, 1000);
    const terminal = e instanceof BudgetExhaustedError || (e instanceof XApiError && e.isAuth);
    const final = terminal || run.attempts >= MAX_ATTEMPTS;
    await db.ingestRun.update({
      where: { id: runId },
      data: final
        ? { status: 'dead', error: err, finishedAt: new Date() }
        : { status: 'queued', error: err, notBefore: new Date(Date.now() + backoffMs(run.attempts)) },
    });
    if (run.kind !== 'metrics_refresh') {
      await db.world.update({ where: { id: run.worldId }, data: { ingestState: 'failed', ingestError: err.slice(0, 500) } });
    }
    return { outcome: final ? 'dead' : 'retry', error: err };
  }
}

/** Inline mode: claim the next runnable row (queued and due, or running but abandoned). */
export async function claimNextRun(): Promise<IngestRun | null> {
  const now = new Date();
  const candidate = await db.ingestRun.findFirst({
    where: {
      OR: [
        { status: 'queued', OR: [{ notBefore: null }, { notBefore: { lte: now } }] },
        { status: 'running', heartbeatAt: { lt: new Date(now.getTime() - STALE_MS) } },
      ],
    },
    orderBy: { startedAt: 'asc' },
  });
  if (!candidate) return null;
  // Optimistic claim: only one tick wins the row.
  const claimed = await db.ingestRun.updateMany({
    where: { id: candidate.id, status: candidate.status, heartbeatAt: candidate.heartbeatAt },
    data: { status: 'running', heartbeatAt: now },
  });
  return claimed.count === 1 ? candidate : null;
}

export async function pendingRunCount() {
  return db.ingestRun.count({ where: { status: { in: ['queued', 'running'] } } });
}
