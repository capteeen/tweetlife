import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { bad, requirePlayer } from '@/lib/life/auth';
import { CrimeError, fight, history, incidentsFor, npcTick, postBail, recordView, report, setPeaceful, steal } from '@/lib/life/crime';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Crime and police. GET: your record, incidents you can still report, and recent history.
// POST ops: steal | fight (on a player or a resident nearby), report (police | complaint | drop), bail,
// peaceful (on/off), tick (a resident might pick your pocket). All rolls and bags are decided in lib/life/crime.ts.

const TargetSchema = z.union([
  z.object({ kind: z.literal('player'), handle: z.string().min(1).max(40) }),
  z.object({ kind: z.literal('resident'), id: z.string().min(1).max(40) }),
]);
/** `world`: the presence room you are in (the world's handle today; see lib/life/crime.ts presencePositions) */
const Body = z.discriminatedUnion('op', [
  z.object({ op: z.literal('steal'), world: z.string().min(1).max(40), target: TargetSchema }),
  z.object({ op: z.literal('fight'), world: z.string().min(1).max(40), target: TargetSchema }),
  z.object({ op: z.literal('report'), crimeId: z.string().min(1).max(40), how: z.enum(['police', 'complaint', 'drop']) }),
  z.object({ op: z.literal('bail') }),
  z.object({ op: z.literal('peaceful'), on: z.boolean() }),
  z.object({ op: z.literal('tick'), world: z.string().min(1).max(40) }),
]);

export async function GET() {
  const r = await requirePlayer();
  if ('error' in r) return r.error;
  const [incidents, past] = await Promise.all([incidentsFor(r.player.id), history(r.player.id)]);
  return NextResponse.json({ record: recordView(r.player), incidents, history: past }, { headers: { 'cache-control': 'private, no-store' } });
}

export async function POST(req: NextRequest) {
  const r = await requirePlayer();
  if ('error' in r) return r.error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad('Bad request');
  const b = parsed.data;
  const { user, player } = r;
  try {
    let out: object;
    if (b.op === 'steal') out = await steal(player, user.handle, b.world, b.target);
    else if (b.op === 'fight') out = await fight(player, user.handle, b.world, b.target);
    else if (b.op === 'report') {
      const res = await report(player, b.crimeId, b.how);
      // tell the arrested player who it was, so their client can show the arrest
      let toast: { to: string; kind: string; text: string } | null = null;
      if ('notify' in res && res.notify && res.arrested) {
        const off = await db.user.findUnique({ where: { id: res.notify }, select: { handle: true } });
        if (off) toast = { to: off.handle, kind: 'arrest', text: `🚔 @${user.handle} called the police. You're under arrest.` };
      }
      out = { ...res, notify: undefined, toast };
    } else if (b.op === 'bail') out = await postBail(player);
    else if (b.op === 'peaceful') out = await setPeaceful(player, b.on);
    else out = { incident: await npcTick(player, user.handle, b.world) };
    const fresh = await db.player.findUnique({ where: { id: player.id } });
    return NextResponse.json({ ok: true, ...out, record: fresh ? recordView(fresh) : null, bags: fresh?.bags });
  } catch (e) {
    if (e instanceof CrimeError) return bad(e.message, e.status);
    throw e;
  }
}
