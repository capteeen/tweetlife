import { Worker, type Job } from 'bullmq';
import { db } from '../lib/db';
import { bullConnection } from '../lib/redis';
import { INGEST_QUEUE, enqueueIngest, type IngestJob } from '../lib/queue/queues';
import { ingestTimeline, refreshRecentMetrics } from '../lib/x/ingest';
import { BudgetExhaustedError, XApiError } from '../lib/x/types';

// Ingestion worker. Run with `npm run worker`. One process consumes first builds, incremental
// syncs and nightly metric refreshes; concurrency is low on purpose — the limiter does the pacing.

async function handleJob(job: Job<IngestJob>) {
  const { runId, kind } = job.data;
  const run = await db.ingestRun.update({
    where: { id: runId },
    data: { status: 'running', attempts: { increment: 1 }, error: null, startedAt: new Date() },
  });
  try {
    if (kind === 'metrics_refresh') await refreshRecentMetrics(run);
    else await ingestTimeline(run, kind);
    await db.ingestRun.update({ where: { id: runId }, data: { status: 'succeeded', finishedAt: new Date() } });
  } catch (e) {
    const err = e as Error;
    const final = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    // Budget exhaustion and revoked auth are not retryable; mark dead immediately.
    const terminal = e instanceof BudgetExhaustedError || (e instanceof XApiError && e.isAuth);
    await db.ingestRun.update({
      where: { id: runId },
      data: { status: final || terminal ? 'dead' : 'failed', error: err.message.slice(0, 1000), finishedAt: new Date() },
    });
    if (kind !== 'metrics_refresh') {
      await db.world.update({ where: { id: run.worldId }, data: { ingestState: 'failed', ingestError: err.message.slice(0, 500) } });
    }
    if (terminal) {
      await job.discard();
    }
    throw e;
  }
}

const worker = new Worker<IngestJob>(INGEST_QUEUE, handleJob, { connection: bullConnection(), concurrency: 2 });
worker.on('ready', () => console.log('[worker] ingest worker ready'));
worker.on('failed', (job, err) => console.error(`[worker] job ${job?.id} failed: ${err.message}`));
worker.on('completed', (job) => console.log(`[worker] job ${job.id} done`));

// Scheduler: every 15 minutes, queue incremental syncs for live worlds whose nextSyncAt has passed,
// and once a day (03:00 UTC hour) queue a metrics refresh for every live world.
async function tick() {
  const now = new Date();
  const due = await db.world.findMany({
    where: { ingestState: 'live', OR: [{ nextSyncAt: null }, { nextSyncAt: { lte: now } }], owner: { revokedAt: null } },
    select: { id: true },
    take: 50,
  });
  for (const w of due) {
    await enqueueIngest(w.id, 'incremental');
    await db.world.update({ where: { id: w.id }, data: { nextSyncAt: new Date(now.getTime() + 6 * 3600 * 1000) } });
  }
  if (now.getUTCHours() === 3 && now.getUTCMinutes() < 15) {
    const live = await db.world.findMany({ where: { ingestState: 'live', owner: { revokedAt: null } }, select: { id: true } });
    for (const w of live) await enqueueIngest(w.id, 'metrics_refresh');
  }
}
tick().catch((e) => console.error('[scheduler]', e));
setInterval(() => tick().catch((e) => console.error('[scheduler]', e)), 15 * 60 * 1000);

process.on('SIGTERM', async () => {
  await worker.close();
  await db.$disconnect();
  process.exit(0);
});
