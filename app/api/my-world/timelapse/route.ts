import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUser } from '@/lib/session';
import { enqueueTimelapse } from '@/lib/queue/queues';

export const dynamic = 'force-dynamic';

// Queue a server-side timelapse render (worker/timelapse.ts) and report the latest job.

export async function POST() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Sign in.' }, { status: 401 });
  const world = await db.world.findUnique({ where: { xUserId: user.id } });
  if (!world) return NextResponse.json({ error: 'No world yet.' }, { status: 404 });
  if (world.ingestState !== 'live') return NextResponse.json({ error: 'Wait for the world to finish building.' }, { status: 409 });
  const job = await enqueueTimelapse(world.id);
  return NextResponse.json({ ok: true, job: { id: job.id, status: job.status } });
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Sign in.' }, { status: 401 });
  const world = await db.world.findUnique({ where: { xUserId: user.id } });
  if (!world) return NextResponse.json({ error: 'No world yet.' }, { status: 404 });
  const job = await db.timelapseJob.findFirst({ where: { worldId: world.id }, orderBy: { startedAt: 'desc' } });
  return NextResponse.json({
    job: job ? { id: job.id, status: job.status, error: job.error, ready: !!job.filePath, startedAt: job.startedAt.toISOString() } : null,
  });
}
