import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { bad, requirePlayer } from '@/lib/life/auth';
import { LoveError, ask, breakUp, cancel, endVisit, findTarget, loveState, noticeText, profileLove, respond } from '@/lib/life/loveServer';

export const dynamic = 'force-dynamic';

// Relationships: GET your partners, requests and visits (and collect the daily partner bonus), or ?profile=handle
// for who someone is dating. POST to ask, answer, cancel, end a visit or break up. Rules: lib/life/love.ts.

export async function GET(req: NextRequest) {
  const profile = req.nextUrl.searchParams.get('profile');
  if (profile) {
    const p = await profileLove(profile);
    return p ? NextResponse.json(p) : bad('No such player.', 404);
  }
  const r = await requirePlayer();
  if ('error' in r) return r.error;
  return NextResponse.json(await loveState({ player: r.player, handle: r.user.handle }), { headers: { 'cache-control': 'private, no-store' } });
}

const Body = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('ask'),
    kind: z.enum(['invite', 'visit', 'date', 'outing']),
    toHandle: z.string().max(40).optional(),
    residentId: z.string().max(40).optional(),
    detail: z.string().max(20).optional(),
  }),
  z.object({ op: z.literal('respond'), id: z.string().max(40), accept: z.boolean() }),
  z.object({ op: z.literal('cancel'), id: z.string().max(40) }),
  z.object({ op: z.literal('endVisit'), id: z.string().max(40) }),
  z.object({ op: z.literal('breakup'), bondId: z.string().max(40) }),
]);

export async function POST(req: NextRequest) {
  const r = await requirePlayer();
  if ('error' in r) return r.error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad('Bad request.');
  const b = parsed.data;
  const me = { player: r.player, handle: r.user.handle };
  try {
    if (b.op === 'ask') {
      const target = await findTarget({ handle: b.toHandle, residentId: b.residentId });
      const res = await ask(me, b.kind, target, b.detail ?? null);
      return NextResponse.json({
        ok: true,
        id: res.request.id,
        status: res.request.status,
        accepted: res.accepted ?? null,
        autoAccepted: !!res.autoAccepted,
        reply: res.reply ?? null,
        // the line the other player sees, delivered live when they are in the same world
        notice: target.kind === 'player' && !res.autoAccepted ? { to: target.handle, text: noticeText(r.user.handle, b.kind, b.detail ?? null) } : null,
      });
    }
    if (b.op === 'respond') {
      const res = await respond(me, b.id, b.accept);
      return NextResponse.json({ ok: true, id: res.id, status: res.status, kind: res.kind, detail: res.detail, passUntil: res.passUntil?.toISOString() ?? null });
    }
    if (b.op === 'cancel') return NextResponse.json({ ok: true, id: (await cancel(me, b.id)).id });
    if (b.op === 'endVisit') return NextResponse.json({ ok: true, id: (await endVisit(me, b.id)).id });
    await breakUp(me, b.bondId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof LoveError) return bad(e.message, e.status);
    throw e;
  }
}
