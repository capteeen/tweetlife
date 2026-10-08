import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { redis } from '@/lib/redis';
import { bad, requirePlayer } from '@/lib/life/auth';
import { setStats } from '@/lib/life/player';
import { applyDelta, moodOf } from '@/lib/life/stats';
import { venueById } from '@/lib/life/venues';
import { citizenOf, countryParam, curfew, governmentOf } from '@/lib/life/government';
import { COUNTRIES } from '@/lib/world/countries';

export const dynamic = 'force-dynamic';

// Do something at a venue. `nearby` = handles the client sees within earshot (for rounds and tables).
// `country` = the country whose city you are in; its national rules apply (lib/life/government.ts).
const Body = z.object({ venueId: z.string(), actionId: z.string(), nearby: z.array(z.string()).max(12).optional(), country: z.string().max(20).optional() });

export async function POST(req: NextRequest) {
  const r = await requirePlayer();
  if ('error' in r) return r.error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad('venueId and actionId required');
  const venue = venueById(parsed.data.venueId);
  const action = venue?.actions.find((a) => a.id === parsed.data.actionId);
  if (!venue || !action) return bad('No such action');
  const country = countryParam(parsed.data.country);
  const gov = governmentOf(country);
  if (venue.id === 'capitol') {
    const c = curfew();
    if (c.on) return bad(`Curfew: the ${gov.house} is closed while NEPA has taken light. Back in ${Math.max(1, Math.ceil(((c.endsAt ?? Date.now()) - Date.now()) / 60000))} min.`, 409);
    if (action.id === 'stipend' && citizenOf(r.player) !== country) {
      return bad(`Only ${COUNTRIES[country].demonym}s can collect the ${COUNTRIES[country].name} stipend. Yours is paid at home.`, 403);
    }
  }
  // national rules: the stipend is set per country, and some countries pay more for a shift
  const bags = action.id === 'stipend' && venue.id === 'capitol' ? -gov.rules.stipend : action.id === 'shift' && venue.id === 'hustle' ? Math.round(action.bags * (1 + gov.rules.shiftBonus)) : action.bags;
  const key = `venue:${r.user.id}:${venue.id}:${action.id}`;
  const ttl = await redis().ttl(key).catch(() => -2);
  if (ttl > 0) return bad(`Not yet — ${Math.ceil(ttl / 60)} min to go.`, 429);
  if (bags > r.player.bags) return bad(`You need ${bags - r.player.bags} more bags.`);

  const mine = applyDelta(r.player, action.me);
  await db.$transaction([
    db.player.update({ where: { id: r.user.id }, data: { bags: { decrement: bags } } }),
    db.bagTx.create({ data: { playerId: r.user.id, kind: bags < 0 ? 'quest' : 'buy', amount: -bags, note: `${venue.emoji} ${venue.id === 'capitol' ? gov.house : venue.name}: ${action.label}` } }),
  ]);
  await setStats(r.user.id, mine);
  await redis().set(key, '1', 'EX', action.cooldown).catch(() => {});

  // rounds and tables: lift everyone the client reported nearby (cap 12, must be real players)
  let lifted = 0;
  if (action.nearby && parsed.data.nearby?.length) {
    const users = await db.user.findMany({ where: { handle: { in: parsed.data.nearby.map((h) => h.replace(/^@/, '')), mode: 'insensitive' }, NOT: { id: r.user.id } }, select: { id: true } });
    const players = await db.player.findMany({ where: { id: { in: users.map((u) => u.id) } } });
    for (const p of players) await setStats(p.id, applyDelta(p, action.nearby));
    lifted = players.length;
  }
  return NextResponse.json({
    ok: true,
    me: { ...mine, mood: moodOf(mine).mood, bags: r.player.bags - bags },
    lifted,
    bags: -bags,
    toast: action.nearby ? { from: r.user.handle, kind: 'venue', text: `@${r.user.handle} ${action.line} at ${venue.id === 'capitol' ? gov.house : venue.name}`, delta: action.nearby } : null,
  });
}
