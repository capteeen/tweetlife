import { Queue, type JobsOptions } from 'bullmq';
import { bullConnection } from '../redis';
import { db } from '../db';
import { canStartNewBuild } from '../x/budget';

// Job queues. The web app only enqueues; worker/index.ts consumes.

export const INGEST_QUEUE = 'ingest';
export const TIMELAPSE_QUEUE = 'timelapse';

export type IngestJob = { worldId: string; kind: 'first_build' | 'incremental' | 'metrics_refresh'; runId: string };
export type TimelapseJob = { worldId: string; jobId: string };

const g = globalThis as unknown as { ingestQueue?: Queue<IngestJob>; timelapseQueue?: Queue<TimelapseJob> };

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

/** Create the IngestRun row and enqueue it. Returns null when the budget refuses a new build. */
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
  if (active) return active;

  const run = await db.ingestRun.create({ data: { worldId, kind, status: 'queued' } });
  const job = await ingestQueue().add(kind, { worldId, kind, runId: run.id }, { ...RETRY, jobId: `${kind}:${run.id}` });
  await db.ingestRun.update({ where: { id: run.id }, data: { jobId: job.id ?? null } });
  return run;
}

/** Re-queue a dead run (manual retry from /my-world or /status). */
export async function retryRun(runId: string) {
  const run = await db.ingestRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.status !== 'dead' && run.status !== 'failed') return run;
  const fresh = await db.ingestRun.create({ data: { worldId: run.worldId, kind: run.kind, status: 'queued' } });
  const job = await ingestQueue().add(run.kind, { worldId: run.worldId, kind: run.kind, runId: fresh.id }, { ...RETRY, jobId: `${run.kind}:${fresh.id}` });
  await db.ingestRun.update({ where: { id: fresh.id }, data: { jobId: job.id ?? null } });
  return fresh;
}

export async function enqueueTimelapse(worldId: string) {
  const active = await db.timelapseJob.findFirst({ where: { worldId, status: { in: ['queued', 'running'] } } });
  if (active) return active;
  const job = await db.timelapseJob.create({ data: { worldId } });
  await timelapseQueue().add('render', { worldId, jobId: job.id }, { attempts: 2, removeOnComplete: 100, removeOnFail: false, jobId: `tl:${job.id}` });
  return job;
}

export async function queueDepths() {
  const q = ingestQueue();
  const t = timelapseQueue();
  const [i, tl] = await Promise.all([q.getJobCounts('waiting', 'active', 'delayed', 'failed'), t.getJobCounts('waiting', 'active', 'failed')]);
  return { ingest: i, timelapse: tl };
}
