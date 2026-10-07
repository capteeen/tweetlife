import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getUser } from '@/lib/session';
import { isAdmin } from '@/lib/env';
import { retryRun } from '@/lib/queue/queues';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Manual retry of a dead-letter ingestion run. The world's owner or an admin.
const Body = z.object({ runId: z.string().min(1) });

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Sign in.' }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'runId required' }, { status: 400 });
  const run = await db.ingestRun.findUnique({ where: { id: parsed.data.runId }, include: { world: true } });
  if (!run) return NextResponse.json({ error: 'No such run.' }, { status: 404 });
  if (run.world.xUserId !== user.id && !isAdmin(user.handle)) return NextResponse.json({ error: 'Not yours.' }, { status: 403 });
  const fresh = await retryRun(run.id);
  await db.world.update({ where: { id: run.worldId }, data: { ingestState: 'queued', ingestError: null } });
  return NextResponse.json({ ok: true, runId: fresh.id });
}
