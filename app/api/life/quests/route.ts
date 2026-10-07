import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { bad, requirePlayer } from '@/lib/life/auth';
import { claimQuest, questBoard } from '@/lib/life/quests';

export const dynamic = 'force-dynamic';

export async function GET() {
  const r = await requirePlayer();
  if ('error' in r) return r.error;
  return NextResponse.json(await questBoard(r.player.id));
}

export async function POST(req: NextRequest) {
  const r = await requirePlayer();
  if ('error' in r) return r.error;
  const parsed = z.object({ questId: z.string() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad('questId required');
  try {
    const reward = await claimQuest(r.player.id, parsed.data.questId);
    return NextResponse.json({ ok: true, reward, board: await questBoard(r.player.id) });
  } catch (e) {
    return bad((e as Error).message);
  }
}
