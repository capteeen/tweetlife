import { Queue, type JobsOptions } from 'bullmq';
import { bullConnection } from '../redis';
import { db } from '../db';
import { env } from '../env';
import { canStartNewBuild } from '../x/budget';

// Job scheduling. Two modes (INGEST_MODE):
//  - worker: rows are also BullMQ jobs; worker/index.ts consumes them.
//  - inline: rows alone are the queue; /api/cron/tick claims and advances them inside the web app.
// Either way the IngestRun table is the source of truth the dashboard and /status read.

export const INGEST_QUEUE = 'ingest';
export const TIMELAPSE_QUEUE = 'timelapse';

export type IngestJob = { worldId: string; kind: 'first_build' | 'incremental' | 'metrics_refresh'; runId: string };
export type TimelapseJob = { worldId: string; jobId: string };

const g = globalThis as unknown as { ingestQueue?: Queue<IngestJob>; timelapseQueue?: Queue<TimelapseJob> };

export function inlineMode() {
  return env().INGEST_MODE === 'inline';
}

export function ingestQueue() {
  if (!g.ingestQueue) g.ingestQueue = new Queue<IngestJob>(INGEST_QUEUE, { connection: bullConnection() });
  return g.ingestQueue;
}

export function timelapseQueue() {
  if (!g.timelapseQueue) g.timelapseQueue = new Queue<TimelapseJob>(TIMELAPSE_QUEUE, { connection: bullConnection() });
  return g.timelapseQueue;
}

const RETRY: JobsOptions = {
  attempts: 4,
  backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: 500,
  removeOnFail: false, // failed jobs stay visible as the dead-letter list
};

/**
 * Inline mode: wake the tick route so queued work starts now instead of at the next cron.
 * Fire-and-forget; on Vercel `waitUntil` keeps the request alive past the response.
 */
export async function kickTick() {
  if (!inlineMode()) return;
  const e = env();
  const p = fetch(`${e.NEXT_PUBLIC_APP_URL}/api/cron/tick`, {
    method: 'POST',
    headers: { authorization: `Bearer ${e.CRON_SECRET}` },
    cache: 'no-store',
  }).catch(() => {});
  try {
    const { waitUntil } = await import('@vercel/functions');
    waitUntil(p);
  } catch {
    void p;
  }
}

async function dispatch(run: { id: string; worldId: string; kind: IngestJob['kind'] }) {
  if (inlineMode()) {
    await kickTick();
    return;
  }
  const job = await ingestQueue().add(run.kind, { worldId: run.worldId, kind: run.kind, runId: run.id }, { ...RETRY, jobId: `${run.kind}:${run.id}` });
  await db.ingestRun.update({ where: { id: run.id }, data: { jobId: job.id ?? null } });
}

/** Create the IngestRun row and dispatch it. Returns null when the budget refuses a new build. */
export async function enqueueIngest(worldId: string, kind: IngestJob['kind']) {
  if (kind === 'first_build' && !(await canStartNewBuild())) {
    await db.world.update({
      where: { id: worldId },
      data: { ingestState: 'failed', ingestError: 'Monthly X API budget exhausted — new world builds are paused until it resets.' },
    });
    return null;
  }
  // Do not stack a second active run of the same kind on the same world.
  const active = await db.ingestRun.findFirst({ where: { worldId, kind, status: { in: ['queued', 'running'] } } });
  if (active) {
    await kickTick();
    return active;
  }
  const run = await db.ingestRun.create({ data: { worldId, kind, status: 'queued' } });
  await dispatch(run);
  return run;
}

/** Re-queue a dead run (manual retry from /my-world or /status). */
export async function retryRun(runId: string) {
  const run = await db.ingestRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.status !== 'dead' && run.status !== 'failed') return run;
  const fresh = await db.ingestRun.create({ data: { worldId: run.worldId, kind: run.kind, status: 'queued' } });
  await dispatch(fresh);
  return fresh;
}

export async function enqueueTimelapse(worldId: string) {
  const active = await db.timelapseJob.findFirst({ where: { worldId, status: { in: ['queued', 'running'] } } });
  if (active) return active;
  const job = await db.timelapseJob.create({ data: { worldId } });
  // Timelapse rendering needs Chromium + ffmpeg: always a separate worker (npm run worker:timelapse), never inline.
  if (!inlineMode()) {
    await timelapseQueue().add('render', { worldId, jobId: job.id }, { attempts: 2, removeOnComplete: 100, removeOnFail: false, jobId: `tl:${job.id}` });
  }
  return job;
}

export async function queueDepths() {
  if (inlineMode()) {
    const [waiting, active, failed, tlWaiting, tlActive, tlFailed] = await Promise.all([
      db.ingestRun.count({ where: { status: 'queued' } }),
      db.ingestRun.count({ where: { status: 'running' } }),
      db.ingestRun.count({ where: { status: 'dead' } }),
      db.timelapseJob.count({ where: { status: 'queued' } }),
      db.timelapseJob.count({ where: { status: 'running' } }),
      db.timelapseJob.count({ where: { status: 'failed' } }),
    ]);
    return { mode: 'inline' as const, ingest: { waiting, active, delayed: 0, failed }, timelapse: { waiting: tlWaiting, active: tlActive, failed: tlFailed } };
  }
  const q = ingestQueue();
  const t = timelapseQueue();
  const [i, tl] = await Promise.all([q.getJobCounts('waiting', 'active', 'delayed', 'failed'), t.getJobCounts('waiting', 'active', 'failed')]);
  return { mode: 'worker' as const, ingest: i, timelapse: tl };
}
