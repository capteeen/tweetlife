import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveEntry } from '@/lib/world/entry';
import { blockOf, blockPostIds } from '@/lib/world/country';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// One player's block on their country's map: where it is (old /w/<handle> links land here), and, for
// visitors the world's access rules admit, the text of the posts standing in it plus the lanterns you lit.
// Everyone else gets the honest reason, as the world's gate used to give.
export async function GET(_: Request, { params }: { params: { handle: string } }) {
  const { world, visitor, decision } = await resolveEntry(params.handle);
  if (!world || !decision) return NextResponse.json({ error: 'No world for that handle.' }, { status: 404 });
  const where = await blockOf(world);
  const base = { handle: world.handle, ...where, me: visitor ? { id: visitor.id, handle: visitor.handle, isOwner: visitor.id === world.xUserId } : null };
  if (!decision.admit) {
    return NextResponse.json({ ...base, admitted: false, reason: decision.reason, message: decision.message, posts: {}, lit: [] }, { headers: { 'cache-control': 'private, no-store' } });
  }
  const ids = await blockPostIds(world.id);
  const [rows, lit] = await Promise.all([
    db.structure.findMany({ where: { worldId: world.id, postId: { in: ids } }, select: { postId: true, text: true, mediaUrl: true } }),
    visitor ? db.lantern.findMany({ where: { worldId: world.id, byUserId: visitor.id }, select: { structureId: true } }) : Promise.resolve([]),
  ]);
  if (visitor) {
    // one visit record per visitor per world per day (feeds the Hustle quests)
    const since = new Date(new Date().toISOString().slice(0, 10));
    const seen = await db.visitorSession.findFirst({ where: { worldId: world.id, visitorId: visitor.id, joinedAt: { gte: since } }, select: { id: true } });
    if (!seen) await db.visitorSession.create({ data: { worldId: world.id, visitorId: visitor.id, visitorHandle: visitor.handle } }).catch(() => {});
  }
  const posts = Object.fromEntries(rows.map((r) => [r.postId, { text: r.text, mediaUrl: r.mediaUrl }]));
  return NextResponse.json({ ...base, admitted: true, reason: decision.reason, posts, lit: lit.map((l) => l.structureId) }, { headers: { 'cache-control': 'private, no-store' } });
}
