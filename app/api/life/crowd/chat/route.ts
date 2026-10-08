import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { bad, requirePlayer } from '@/lib/life/auth';
import { crowdById, followerCanned, followerPrompt } from '@/lib/life/crowd';
import { deepseekReply, takeQuota } from '@/lib/life/residentChat';

export const dynamic = 'force-dynamic';

// Talk to a follower in someone's crowd. The follower is looked up in the live crowd on the server, so the prompt
// only ever carries names X gave us. Same caps and fallbacks as the named residents.

const Body = z.object({
  ownerId: z.string().max(40),
  followerId: z.string().max(40),
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
  const crowd = await crowdById(b.ownerId);
  const f = crowd?.followers.find((x) => x.id === b.followerId);
  if (!crowd || !f) return bad('They already headed home.', 404);
  const last = b.messages[b.messages.length - 1];
  if (last.role !== 'user') return bad('Say something first.');

  const quota = await takeQuota(r.player.id).catch(() => 'capped' as const);
  if (quota === 'slow') return bad(`${f.name} needs a second.`, 429);
  if (quota === 'capped') return NextResponse.json({ reply: followerCanned(crowd, last.content), source: 'canned' });
  const reply = await deepseekReply(followerPrompt(crowd, f, { handle: r.user.handle }), b.messages.slice(-10));
  return NextResponse.json(reply ? { reply, source: 'ai' } : { reply: followerCanned(crowd, last.content), source: 'canned' });
}
