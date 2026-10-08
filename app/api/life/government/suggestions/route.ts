import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { bad, requirePlayer } from '@/lib/life/auth';
import { getUser } from '@/lib/session';
import { citizenOf, countryParam } from '@/lib/life/government';
import { COUNTRIES } from '@/lib/world/countries';
import { back, board, file, MAX_LEN, TOPICS } from '@/lib/life/suggestions';

export const dynamic = 'force-dynamic';

// The suggestion box at a government house (lib/life/suggestions.ts).
// GET ?country=  -> the country's board and your own suggestions there.
// POST { op: 'file', country, topic, text } -> file one with that country's president (citizens only).
// POST { op: 'back', id } -> back someone else's suggestion in your country.

export async function GET(req: NextRequest) {
  const country = countryParam(req.nextUrl.searchParams.get('country'));
  const user = await getUser();
  return NextResponse.json(await board(country, user?.id ?? null));
}

const Body = z.discriminatedUnion('op', [
  z.object({ op: z.literal('file'), country: z.string().max(20), topic: z.enum(TOPICS.map((t) => t.id) as [string, ...string[]]), text: z.string().min(1).max(MAX_LEN) }),
  z.object({ op: z.literal('back'), id: z.string().min(1).max(40) }),
]);

export async function POST(req: NextRequest) {
  const r = await requirePlayer();
  if ('error' in r) return r.error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(`Write your suggestion (up to ${MAX_LEN} characters) and pick a topic.`);
  const b = parsed.data;
  const citizen = citizenOf(r.player);
  if (b.op === 'back') {
    const res = await back(r.player.id, citizen, b.id);
    return res.ok ? NextResponse.json(res) : bad(res.error, res.status);
  }
  const country = countryParam(b.country);
  if (citizen !== country) {
    const c = COUNTRIES[country];
    return bad(`Only ${c.demonym}s can file suggestions with President ${c.president}. Take yours to President ${COUNTRIES[citizen].president} in ${COUNTRIES[citizen].capital}.`, 403);
  }
  const p = r.player;
  const res = await file({ id: p.id, handle: r.user.handle, bags: p.bags, gas: p.gas, vibes: p.vibes, clout: p.clout }, country, b.topic as (typeof TOPICS)[number]['id'], b.text);
  return res.ok ? NextResponse.json(res) : bad(res.error, res.status);
}
