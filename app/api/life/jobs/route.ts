import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { bad, requirePlayer } from '@/lib/life/auth';
import { moodOf } from '@/lib/life/stats';
import { WorkError, apply, cancelShift, doTask, finishShift, jobBoard, quit, startShift, startTutorialShift } from '@/lib/life/work';
import { APPLY_ANSWERS } from '@/lib/life/jobs';

export const dynamic = 'force-dynamic';

// Jobs: the board (GET), and applying, quitting and working shifts (POST). Pay happens only here, on finish.

export async function GET() {
  const r = await requirePlayer();
  if ('error' in r) return r.error;
  return NextResponse.json(await jobBoard(r.player), { headers: { 'cache-control': 'private, no-store' } });
}

const Body = z.discriminatedUnion('op', [
  z.object({ op: z.literal('apply'), jobId: z.string(), answer: z.number().int().min(0).max(APPLY_ANSWERS.length - 1).optional() }),
  z.object({ op: z.literal('quit') }),
  // tutorialJobId: the new-player tutorial's first shift (lib/life/work.ts startTutorialShift)
  z.object({ op: z.literal('start'), tutorialJobId: z.string().optional() }),
  z.object({ op: z.literal('task') }),
  z.object({ op: z.literal('finish') }),
  z.object({ op: z.literal('cancel') }),
]);

export async function POST(req: NextRequest) {
  const r = await requirePlayer();
  if ('error' in r) return r.error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad('op required');
  const p = r.player;
  try {
    switch (parsed.data.op) {
      case 'apply': {
        const job = await apply(p, parsed.data.jobId);
        return NextResponse.json({ ok: true, hired: job.id, board: await jobBoard(p) });
      }
      case 'quit': {
        const job = await quit(p);
        return NextResponse.json({ ok: true, quit: job.id, board: await jobBoard(p) });
      }
      case 'start': {
        const s = parsed.data.tutorialJobId ? await startTutorialShift(p, parsed.data.tutorialJobId) : await startShift(p);
        return NextResponse.json({ ok: true, startedAt: s.startedAt.toISOString(), tasks: s.tasks, board: await jobBoard(p) });
      }
      case 'task':
        return NextResponse.json({ ok: true, ...(await doTask(p)) });
      case 'cancel':
        await cancelShift(p);
        return NextResponse.json({ ok: true, board: await jobBoard(p) });
      case 'finish': {
        const f = await finishShift(p);
        const fresh = { ...p, ...f.me };
        return NextResponse.json({
          ok: true,
          pay: f.pay,
          tasks: f.tasks,
          shifts: f.shifts,
          level: f.level,
          leveledUp: f.leveledUp,
          letGo: f.letGo,
          me: { ...f.me, mood: moodOf(fresh).mood },
          board: await jobBoard(fresh),
        });
      }
    }
  } catch (e) {
    if (e instanceof WorkError) return bad(e.message, e.status);
    throw e;
  }
}
