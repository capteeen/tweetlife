import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePlayer } from '@/lib/life/auth';
import { profileView } from '@/lib/life/player';
import { questBoard } from '@/lib/life/quests';
import { ITEMS } from '@/lib/life/market';
import { furnitureById } from '@/lib/life/home';

export const dynamic = 'force-dynamic';

// Everything the phone needs about the signed-in player: profile, bags, stats, holdings (live priced),
// assets, quests, recent ledger. Signed-out visitors get { me: null } — the world still works for them.
export async function GET() {
  const r = await requirePlayer();
  if ('error' in r) return NextResponse.json({ me: null });
  const { user, player } = r;
  const [quests, assets, txs] = await Promise.all([
    questBoard(player.id),
    db.asset.findMany({ where: { playerId: player.id } }),
    db.bagTx.findMany({ where: { playerId: player.id }, orderBy: { at: 'desc' }, take: 30 }),
  ]);
  const vehicles = assets.filter((a) => a.slot == null && ITEMS.some((i) => i.id === a.itemId));
  const furniture = assets.filter((a) => a.slot != null && furnitureById(a.itemId));
  // furniture counts in net worth at what was paid, like vehicles
  const assetValue = assets.reduce((a, x) => a + x.paid, 0);
  return NextResponse.json(
    {
      me: profileView(player, user.handle, user.name, user.avatarUrl),
      assets: vehicles.map((a) => ({ ...ITEMS.find((i) => i.id === a.itemId)!, equipped: a.equipped, paid: a.paid, acquiredAt: a.acquiredAt.toISOString() })),
      furniture: furniture.map((a) => ({ itemId: a.itemId, slot: a.slot!, paid: a.paid, stored: a.stored, acquiredAt: a.acquiredAt.toISOString() })),
      netWorth: player.bags + assetValue,
      quests,
      txs: txs.map((t) => ({ id: t.id, kind: t.kind, amount: t.amount, note: t.note, at: t.at.toISOString() })),
    },
    { headers: { 'cache-control': 'private, no-store' } },
  );
}
