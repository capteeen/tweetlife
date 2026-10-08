import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { bad, requirePlayer } from '@/lib/life/auth';
import { residentById, residentPrompt } from '@/lib/life/residents';
import { cannedReply, deepseekReply, takeQuota } from '@/lib/life/residentChat';
import { chatAffinity } from '@/lib/life/loveServer';
import { talkingPoints } from '@/lib/life/suggestions';
import { reputationLine } from '@/lib/life/crime';

export const dynamic = 'force-dynamic';

// Talk to one of the city's named residents. The client sends the last few lines of the conversation; the reply
// comes from DeepSeek in the resident's voice, or from their canned lines (no key, over a cap, or an error).

const Body = z.object({
  residentId: z.string().max(40),
  /** what they're doing right now, as the card shows it ("dancing at Club Moon") */
  doing: z.string().max(80).default('walking around'),
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(400) }))
    .min(1)
    .max(12),
});

export async function POST(req: NextRequest) {
  const r = await requirePlayer();
  if ('error' in r) return r.error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad('Say something first.');
  const b = parsed.data;
  const who = residentById(b.residentId);
  if (!who) return bad('No such resident', 404);
  const last = b.messages[b.messages.length - 1];
  if (last.role !== 'user') return bad('Say something first.');
  const said = last.content;

  const quota = await takeQuota(r.player.id).catch(() => 'capped' as const);
  if (quota === 'slow') return bad(`${who.name} needs a second. Slow down small.`, 429);
  // talking builds affinity (lib/life/love.ts), a little per message up to a daily limit
  const affinity = await chatAffinity(r.player.id, who.id).catch(() => null);
  if (quota === 'capped') return NextResponse.json({ reply: cannedReply(who, said), source: 'canned', affinity });

  const p = r.player;
  const system = residentPrompt(who, {
    handle: r.user.handle,
    doing: b.doing.replace(/[^\p{L}\p{N} .,'!?-]/gu, ''),
    bags: p.bags,
    gas: p.gas,
    vibes: p.vibes,
    clout: p.clout,
    // a government knows what its citizens have been asking for
    points: who.office && who.country ? await talkingPoints(who.country).catch(() => []) : [],
    // a record makes them wary (lib/life/crime.ts)
    reputation: reputationLine(p),
  });
  const reply = await deepseekReply(system, b.messages.slice(-10));
  return NextResponse.json(reply ? { reply, source: 'ai', affinity } : { reply: cannedReply(who, said), source: 'canned', affinity });
}
