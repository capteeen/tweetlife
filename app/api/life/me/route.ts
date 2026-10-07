import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePlayer } from '@/lib/life/auth';
import { portfolio, profileView } from '@/lib/life/player';
import { questBoard } from '@/lib/life/quests';
import { ITEMS } from '@/lib/life/market';

export const dynamic = 'force-dynamic';

// Everything the phone needs about the signed-in player: profile, bags, stats, holdings (live priced),
// assets, quests, recent ledger. Signed-out visitors get { me: null } — the world still works for them.
export async function GET() {
  const r = await requirePlayer();
  if ('error' in r) return NextResponse.json({ me: null });
  const { user, player } = r;
  const [pf, quests, assets, txs] = await Promise.all([
    portfolio(player.id),
    questBoard(player.id),
    db.asset.findMany({ where: { playerId: player.id } }),
    db.bagTx.findMany({ where: { playerId: player.id }, orderBy: { at: 'desc' }, take: 30 }),
  ]);
  const assetValue = assets.reduce((a, x) => a + x.paid, 0);
  return NextResponse.json(
    {
      me: profileView(player, user.handle, user.name, user.avatarUrl),
      portfolio: pf,
      assets: assets.map((a) => ({ ...ITEMS.find((i) => i.id === a.itemId)!, equipped: a.equipped, paid: a.paid, acquiredAt: a.acquiredAt.toISOString() })),
      netWorth: Math.round(player.bags + pf.value + assetValue),
      quests,
      txs: txs.map((t) => ({ id: t.id, kind: t.kind, amount: t.amount, note: t.note, at: t.at.toISOString() })),
    },
    { headers: { 'cache-control': 'private, no-store' } },
  );
}
