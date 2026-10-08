import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { redis } from '@/lib/redis';
import { claimNextRun, pendingRunCount, runIngest } from '@/lib/ingest/runner';
import { activeLiveWorlds, enqueueIngest, inlineMode, kickTick } from '@/lib/queue/queues';
import { budgetStatus } from '@/lib/x/budget';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Inline (worker-less) ingestion. Vercel Cron calls this on a schedule; sign-in, "Sync now" and a
// visit to a building world call it immediately. Each invocation:
//   1. does the scheduler's job (queue incremental syncs that are due, nightly metrics refresh) for players who
//      played in the last week (every X read is billed, so idle worlds wait until their owner is back),
//   2. claims queued runs and advances them until ~45s have passed,
//   3. if work remains, triggers itself again (fire-and-forget) so a first build completes in minutes.
// A Redis lock keeps ticks from overlapping; run rows are claimed optimistically as a second guard.

const BUDGET_MS = 45_000;

function authorized(req: NextRequest) {
  const secret = env().CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production'; // local dev without a secret
  const h = req.headers.get('authorization') ?? '';
  return h === `Bearer ${secret}`;
}

async function schedulerDuties() {
  const now = new Date();
  const due = await db.world.findMany({
    where: { ...activeLiveWorlds(now), OR: [{ nextSyncAt: null }, { nextSyncAt: { lte: now } }] },
    select: { id: true },
    take: 50,
  });
  for (const w of due) {
    await enqueueIngest(w.id, 'incremental');
    await db.world.update({ where: { id: w.id }, data: { nextSyncAt: new Date(now.getTime() + 6 * 3600 * 1000) } });
  }
  // Nightly metrics refresh: once per UTC day per world, tracked in Redis so the cron cadence does not matter.
  // Optional, so it is skipped on a day the X budget is already running low.
  if ((await budgetStatus()).level !== 'ok') return;
  const dayKey = `metrics:day:${now.toISOString().slice(0, 10)}`;
  const fresh = await redis().set(dayKey, '1', 'EX', 36 * 3600, 'NX');
  if (fresh) {
    const live = await db.world.findMany({ where: activeLiveWorlds(now), select: { id: true } });
    for (const w of live) await enqueueIngest(w.id, 'metrics_refresh');
  }
}

async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!inlineMode()) return NextResponse.json({ ok: true, mode: 'worker', note: 'INGEST_MODE=worker: the BullMQ worker consumes jobs; nothing to do here.' });

  const lock = await redis().set('tick:lock', String(Date.now()), 'PX', BUDGET_MS + 10_000, 'NX');
  if (!lock) return NextResponse.json({ ok: true, skipped: 'another tick is running' });

  const started = Date.now();
  const deadline = started + BUDGET_MS;
  const results: { runId: string; kind: string; outcome: string; error?: string }[] = [];
  try {
    await schedulerDuties();
    while (Date.now() < deadline - 5000) {
      const run = await claimNextRun();
      if (!run) break;
      const r = await runIngest(run.id, { deadline });
      results.push({ runId: run.id, kind: run.kind, outcome: r.outcome, error: r.error });
    }
  } finally {
    await redis().del('tick:lock').catch(() => {});
  }
  const pending = await pendingRunCount();
  if (pending > 0) await kickTick();
  return NextResponse.json({ ok: true, mode: 'inline', ms: Date.now() - started, results, pending });
}

export const GET = handle;
export const POST = handle;
