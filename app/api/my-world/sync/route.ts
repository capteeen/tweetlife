import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUser } from '@/lib/session';
import { enqueueIngest } from '@/lib/queue/queues';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// "Sync now" from the dashboard. Rate limited to once per 10 minutes per world — it costs real calls.
export async function POST() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Sign in.' }, { status: 401 });
  const world = await db.world.findUnique({ where: { xUserId: user.id } });
  if (!world) return NextResponse.json({ error: 'No world yet.' }, { status: 404 });
  const key = `sync:manual:${world.id}`;
  const ok = await redis().set(key, '1', 'EX', 600, 'NX');
  if (!ok) return NextResponse.json({ error: 'You can sync manually once every 10 minutes.' }, { status: 429 });
  const kind = world.newestPostId ? 'incremental' : 'first_build';
  const run = await enqueueIngest(world.id, kind);
  if (world.ingestState !== 'building') await db.world.update({ where: { id: world.id }, data: { ingestState: 'queued', ingestError: null } });
  return NextResponse.json({ ok: true, runId: run.id, kind });
}
