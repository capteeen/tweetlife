import { Worker, type Job } from 'bullmq';
import { db } from '../lib/db';
import { bullConnection } from '../lib/redis';
import { INGEST_QUEUE, activeLiveWorlds, dispatch, enqueueIngest, type IngestJob } from '../lib/queue/queues';
import { budgetStatus } from '../lib/x/budget';
import { runIngest } from '../lib/ingest/runner';

// Ingestion worker for INGEST_MODE=worker. Run with `npm run worker`. One process consumes first builds,
// incremental syncs and nightly metric refreshes; concurrency is low on purpose — the limiter does the pacing.
// (On Vercel there is no worker: INGEST_MODE=inline and /api/cron/tick does this inside the web app.)

async function handleJob(job: Job<IngestJob>) {
  const r = await runIngest(job.data.runId);
  // the X budget ran out mid-run: queue it again for when the budget resets
  if (r.outcome === 'paused') await dispatch(await db.ingestRun.findUniqueOrThrow({ where: { id: job.data.runId } }));
  if (r.outcome === 'retry') throw new Error(r.error ?? 'ingest failed'); // BullMQ retries with backoff
  if (r.outcome === 'dead') {
    await job.discard();
    throw new Error(r.error ?? 'ingest dead');
  }
}

const worker = new Worker<IngestJob>(INGEST_QUEUE, handleJob, { connection: bullConnection(), concurrency: 2 });
worker.on('ready', () => console.log('[worker] ingest worker ready'));
worker.on('failed', (job, err) => console.error(`[worker] job ${job?.id} failed: ${err.message}`));
worker.on('completed', (job) => console.log(`[worker] job ${job.id} done`));

// Scheduler: every 15 minutes, queue incremental syncs for active players' worlds whose nextSyncAt has passed,
// and once a day (03:00 UTC hour), while the X budget is comfortable, a metrics refresh for each of them.
async function tick() {
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
  if (now.getUTCHours() === 3 && now.getUTCMinutes() < 15 && (await budgetStatus()).level === 'ok') {
    const live = await db.world.findMany({ where: activeLiveWorlds(now), select: { id: true } });
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
