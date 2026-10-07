import { NextResponse } from 'next/server';
import { loadWorldModel, skylineOf } from '@/lib/world/load';
import { resolveEntry } from '@/lib/world/entry';

export const dynamic = 'force-dynamic';

// The world payload. Admitted visitors get the full model; everyone else gets the skyline only
// (positions and sizes, no post text, no media) plus the honest reason they are outside.

export async function GET(_: Request, { params }: { params: { handle: string } }) {
  const { world, visitor, decision } = await resolveEntry(params.handle);
  if (!world || !decision) return NextResponse.json({ error: 'No world for that handle.' }, { status: 404 });
  const model = await loadWorldModel(world.handle);
  if (!model) return NextResponse.json({ error: 'No world for that handle.' }, { status: 404 });

  const me = visitor ? { id: visitor.id, handle: visitor.handle, isOwner: visitor.id === world.xUserId } : null;
  if (decision.admit) {
    return NextResponse.json({ admitted: true, reason: decision.reason, me, world: model }, { headers: { 'cache-control': 'private, no-store' } });
  }
  return NextResponse.json(
    { admitted: false, reason: decision.reason, message: decision.message, me, skyline: skylineOf(model), ingestState: model.ingestState, lastSyncAt: model.lastSyncAt },
    { headers: { 'cache-control': 'private, no-store' } },
  );
}
