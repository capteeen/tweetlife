import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUser } from '@/lib/session';
import { ensurePlot, loadCountryModel } from '@/lib/world/country';
import { isCountryId } from '@/lib/world/countries';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// A country's shared map: Capital Square, every player's block (buildings only, no post text) and their
// guestbook stones. Anyone may walk the streets; a block's posts are read through /api/world/<handle>/block.
// Signing in also makes sure your own block exists (in your home country).
export async function GET(_: Request, { params }: { params: { id: string } }) {
  if (!isCountryId(params.id)) return NextResponse.json({ error: 'No such country.' }, { status: 404 });
  const visitor = await getUser();
  let mine: { country: string; slot: number } | null = null;
  if (visitor) {
    const world = await db.world.findUnique({ where: { xUserId: visitor.id }, select: { id: true, xUserId: true } });
    if (world) mine = await ensurePlot(world);
  }
  const model = await loadCountryModel(params.id);
  const me = visitor ? { id: visitor.id, handle: visitor.handle, isOwner: false } : null;
  return NextResponse.json({ ...model, me, mine }, { headers: { 'cache-control': 'private, no-store' } });
}
