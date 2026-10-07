import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { redis } from '@/lib/redis';
import { bad, requirePlayer } from '@/lib/life/auth';
import { getUser } from '@/lib/session';
import { ensureStarterKit, setStats } from '@/lib/life/player';
import { applyDelta, moodOf } from '@/lib/life/stats';
import { GENERATOR_RUN, furnitureById, hasPower, publicPower, resaleValue, type HomeItem, type HomeView, type PowerState, type Slot } from '@/lib/life/home';

export const dynamic = 'force-dynamic';

// The house: what is in it, and what you do there. Bags are in-world points, never money.

async function powerFor(playerId: string): Promise<PowerState> {
  const grid = publicPower();
  const ttl = await redis().ttl(`gen:${playerId}`).catch(() => -2);
  const generator = ttl > 0;
  // the next change is whichever comes first: the grid flipping, or the generator running dry
  const changesAt = generator && !grid.on ? Math.min(grid.changesAt, Date.now() + ttl * 1000) : grid.changesAt;
  return { grid: grid.on, generator, changesAt };
}

const view = (a: { itemId: string; slot: string | null; paid: number; stored: boolean; acquiredAt: Date }): HomeItem => ({
  itemId: a.itemId, slot: a.slot as Slot, paid: a.paid, stored: a.stored, acquiredAt: a.acquiredAt.toISOString(),
});

/** My house, or someone else's with ?handle= (read-only). */
export async function GET(req: NextRequest) {
  const handle = req.nextUrl.searchParams.get('handle')?.replace(/^@/, '');
  const me = await getUser();
  const owner = handle
    ? await db.user.findFirst({ where: { handle: { equals: handle, mode: 'insensitive' } }, select: { id: true, handle: true, name: true, avatarUrl: true } })
    : me && { id: me.id, handle: me.handle, name: me.name, avatarUrl: me.avatarUrl };
  if (!owner) return bad(handle ? 'No such player.' : 'Sign in with X to get a house.', handle ? 404 : 401);
  const player = await db.player.findUnique({ where: { id: owner.id } });
  if (!player) return bad('That player has not moved in yet.', 404);
  await ensureStarterKit(player.id);
  const [assets, power] = await Promise.all([db.asset.findMany({ where: { playerId: player.id, slot: { not: null } } }), powerFor(player.id)]);
  const body: HomeView = {
    owner: { handle: owner.handle, name: owner.name, avatarUrl: owner.avatarUrl },
    mine: !!me && me.id === owner.id,
    placed: assets.filter((a) => !a.stored).map(view),
    stored: assets.filter((a) => a.stored).map(view),
    power,
  };
  return NextResponse.json(body, { headers: { 'cache-control': 'private, no-store' } });
}

const Body = z.discriminatedUnion('op', [
  z.object({ op: z.literal('buy'), itemId: z.string() }),
  z.object({ op: z.literal('place'), itemId: z.string() }),
  z.object({ op: z.literal('sell'), itemId: z.string() }),
  z.object({ op: z.literal('act'), itemId: z.string(), actionId: z.string() }),
]);

export async function POST(req: NextRequest) {
  const r = await requirePlayer();
  if ('error' in r) return r.error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad('op and itemId required');
  const b = parsed.data;
  const item = furnitureById(b.itemId);
  if (!item) return bad('No such item');
  const pid = r.player.id;
  const mine = db.asset.findUnique({ where: { playerId_itemId: { playerId: pid, itemId: item.id } } });

  if (b.op === 'buy') {
    if (await mine) return bad('You already own that. Place it from the House app.');
    if (item.price > r.player.bags) return bad(`You need ${item.price - r.player.bags} more bags.`);
    // the new piece takes its slot; whatever was there goes to storage
    await db.$transaction([
      db.player.update({ where: { id: pid }, data: { bags: { decrement: item.price }, clout: { increment: 3 } } }),
      db.asset.updateMany({ where: { playerId: pid, slot: item.slot, stored: false }, data: { stored: true } }),
      db.asset.create({ data: { playerId: pid, itemId: item.id, paid: item.price, slot: item.slot } }),
      db.bagTx.create({ data: { playerId: pid, kind: 'buy', amount: -item.price, note: `${item.emoji} Bought ${item.name}` } }),
    ]);
    return NextResponse.json({ ok: true, item });
  }

  if (b.op === 'place') {
    const a = await mine;
    if (!a) return bad('You do not own that.');
    if (!a.stored) return bad('That is already in the room.');
    await db.$transaction([
      db.asset.updateMany({ where: { playerId: pid, slot: item.slot, stored: false }, data: { stored: true } }),
      db.asset.update({ where: { id: a.id }, data: { stored: false } }),
    ]);
    return NextResponse.json({ ok: true, item });
  }

  if (b.op === 'sell') {
    const a = await mine;
    if (!a) return bad('You do not own that.');
    if (a.paid === 0) return bad('The starter kit cannot be sold.');
    const back = resaleValue(a.paid);
    await db.$transaction([
      db.asset.delete({ where: { id: a.id } }),
      db.player.update({ where: { id: pid }, data: { bags: { increment: back } } }),
      db.bagTx.create({ data: { playerId: pid, kind: 'sell', amount: back, note: `${item.emoji} Sold ${item.name}` } }),
    ]);
    return NextResponse.json({ ok: true, item, bags: back });
  }

  // act
  const a = await mine;
  if (!a || a.stored) return bad('That is not in your room.');
  const action = item.actions.find((x) => x.id === b.actionId);
  if (!action) return bad('No such action');
  const power = await powerFor(pid);
  if (item.needsPower && !hasPower(power) && item.id !== 'generator') return bad('No light. NEPA has taken it — a generator would fix that.', 409);
  const key = `home:${pid}:${item.id}:${action.id}`;
  const ttl = await redis().ttl(key).catch(() => -2);
  if (ttl > 0) return bad(`Not yet — ${ttl}s to go.`, 429);
  if (action.bags > r.player.bags) return bad(`You need ${action.bags - r.player.bags} more bags.`);

  const next = applyDelta(r.player, action.me);
  await db.$transaction([
    db.player.update({ where: { id: pid }, data: { bags: { decrement: action.bags }, status: action.line } }),
    ...(action.bags ? [db.bagTx.create({ data: { playerId: pid, kind: 'buy', amount: -action.bags, note: `${item.emoji} ${item.name}: ${action.label}` } })] : []),
  ]);
  await setStats(pid, next);
  await redis().set(key, '1', 'EX', action.seconds).catch(() => {});
  if (item.id === 'generator') await redis().set(`gen:${pid}`, '1', 'EX', GENERATOR_RUN).catch(() => {});
  return NextResponse.json({
    ok: true,
    me: { ...next, mood: moodOf(next).mood, bags: r.player.bags - action.bags },
    power: await powerFor(pid),
    action,
  });
}
