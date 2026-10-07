import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { findWorldByHandle } from '@/lib/world/load';
import { readProgress } from '@/lib/x/ingest';

export const dynamic = 'force-dynamic';

// Live "building your world — N posts placed" numbers. Real counts from Postgres and the worker's progress key.
export async function GET(_: Request, { params }: { params: { handle: string } }) {
  const world = await findWorldByHandle(params.handle);
  if (!world) return NextResponse.json({ error: 'No world.' }, { status: 404 });
  const [placed, progress] = await Promise.all([db.structure.count({ where: { worldId: world.id } }), readProgress(world.id)]);
  return NextResponse.json({
    ingestState: world.ingestState,
    ingestError: world.ingestError,
    placed,
    postCount: world.postCount,
    pagesFetched: progress?.pagesFetched ?? null,
    lastSyncAt: world.lastSyncAt?.toISOString() ?? null,
  });
}
