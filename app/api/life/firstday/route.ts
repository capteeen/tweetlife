import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { bad, requirePlayer } from '@/lib/life/auth';
import { checkSteps, completeStep, firstDayView, skipFirstDay, startFirstDay, FIRST_DAY } from '@/lib/life/firstDay';

export const dynamic = 'force-dynamic';

// The guided first day. GET: where you are on it. POST: finish a step, check the ones your records prove,
// skip the rest, or start it (from Settings).
export async function GET() {
  const r = await requirePlayer();
  if ('error' in r) return r.error;
  return NextResponse.json({ firstDay: await firstDayView(r.player.id, r.player.firstDay) }, { headers: { 'cache-control': 'private, no-store' } });
}

const Body = z.discriminatedUnion('op', [
  z.object({ op: z.literal('complete'), step: z.enum(FIRST_DAY.map((s) => s.id) as [string, ...string[]]) }),
  z.object({ op: z.literal('check') }),
  z.object({ op: z.literal('skip') }),
  z.object({ op: z.literal('start') }),
]);

export async function POST(req: NextRequest) {
  const r = await requirePlayer();
  if ('error' in r) return r.error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad('Unknown first-day action.');
  try {
    const d = parsed.data;
    if (d.op === 'complete') {
      const out = await completeStep(r.player.id, d.step as (typeof FIRST_DAY)[number]['id']);
      return NextResponse.json({ ok: true, paid: out.paid, firstDay: out.view });
    }
    if (d.op === 'check') {
      const out = await checkSteps(r.player.id);
      return NextResponse.json({ ok: true, paid: out.paid, steps: out.steps, firstDay: out.view });
    }
    if (d.op === 'skip') return NextResponse.json({ ok: true, firstDay: await skipFirstDay(r.player.id) });
    return NextResponse.json({ ok: true, firstDay: await startFirstDay(r.player.id) });
  } catch (e) {
    return bad((e as Error).message, 409);
  }
}
