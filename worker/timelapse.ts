import { Worker, type Job } from 'bullmq';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { db } from '../lib/db';
import { env } from '../lib/env';
import { bullConnection } from '../lib/redis';
import { TIMELAPSE_QUEUE, type TimelapseJob } from '../lib/queue/queues';
import { renderKeyFor } from '../lib/timelapse';

// Timelapse renderer. Run with `npm run worker:timelapse`. Loads the headless frame page once,
// steps t from 0 to 1 over 20s at 30fps (600 frames), screenshots the canvas, and encodes with ffmpeg.

const SECONDS = 20;
const FPS = 30;
const FRAMES = SECONDS * FPS;

async function render(job: Job<TimelapseJob>) {
  const { worldId, jobId } = job.data;
  const world = await db.world.findUniqueOrThrow({ where: { id: worldId } });
  await db.timelapseJob.update({ where: { id: jobId }, data: { status: 'running', error: null } });

  const outDir = path.resolve(env().RENDER_DIR);
  const frameDir = path.join(outDir, `frames-${jobId}`);
  await mkdir(frameDir, { recursive: true });
  const outFile = path.join(outDir, `${jobId}.mp4`);

  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const url = `${env().NEXT_PUBLIC_APP_URL}/w/${encodeURIComponent(world.handle)}/timelapse?key=${renderKeyFor(world.id)}`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 });
    await page.waitForSelector('#tl-ready[data-ready="1"]', { timeout: 120_000 });
    await page.waitForFunction(() => typeof window.tweetlifeSetFrame === 'function');

    for (let i = 0; i < FRAMES; i++) {
      const t = i / (FRAMES - 1);
      await page.evaluate((v) => window.tweetlifeSetFrame?.(v), t);
      await page.waitForFunction(() => window.tweetlifeFrameReady === true, undefined, { timeout: 30_000 });
      const png = await page.screenshot({ type: 'png' });
      await writeFile(path.join(frameDir, `f${String(i).padStart(5, '0')}.png`), png);
      if (i % 60 === 0) await job.updateProgress(Math.round((i / FRAMES) * 100));
    }
  } finally {
    await browser.close();
  }

  await ffmpeg(['-y', '-framerate', String(FPS), '-i', path.join(frameDir, 'f%05d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', outFile]);
  await rm(frameDir, { recursive: true, force: true });
  await db.timelapseJob.update({ where: { id: jobId }, data: { status: 'succeeded', finishedAt: new Date(), filePath: outFile } });
}

function ffmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d.toString()));
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${err.slice(-400)}`))));
  });
}

const worker = new Worker<TimelapseJob>(
  TIMELAPSE_QUEUE,
  async (job) => {
    try {
      await render(job);
    } catch (e) {
      await db.timelapseJob.update({ where: { id: job.data.jobId }, data: { status: 'failed', finishedAt: new Date(), error: (e as Error).message.slice(0, 500) } });
      throw e;
    }
  },
  { connection: bullConnection(), concurrency: 1 },
);
worker.on('ready', () => console.log('[timelapse] worker ready'));
worker.on('failed', (job, err) => console.error(`[timelapse] job ${job?.id} failed: ${err.message}`));
process.on('SIGTERM', async () => {
  await worker.close();
  process.exit(0);
});
