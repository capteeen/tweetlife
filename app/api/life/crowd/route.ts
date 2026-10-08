import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getUser } from '@/lib/session';
import { bad, requirePlayer } from '@/lib/life/auth';
import { checkForNewPost, liveCrowds, noteWhere, takeNotices } from '@/lib/life/crowd';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Follower crowds (lib/life/crowd.ts).
// GET  ?world=<handle>&peers=<handle,handle>: the live crowds of you and the people around you, plus notices for you
//      (someone you follow just posted). Also remembers which world you're in, so your followers' notices point there.
// POST { auto }: look for a post newer than the newest we have; a fresh one brings your crowd.

const handleRe = /^[A-Za-z0-9_]{1,15}$/;

export async function GET(req: NextRequest) {
  const user = await getUser();
  const sp = req.nextUrl.searchParams;
  const world = sp.get('world') ?? '';
  const peers = (sp.get('peers') ?? '').split(',').filter((h) => handleRe.test(h)).slice(0, 30);
  const ids = peers.length ? (await db.user.findMany({ where: { handle: { in: peers, mode: 'insensitive' } }, select: { id: true } })).map((u) => u.id) : [];
  if (user) ids.push(user.id);
  const crowds = await liveCrowds([...new Set(ids)]);
  let notices: Awaited<ReturnType<typeof takeNotices>> = [];
  if (user) {
    if (handleRe.test(world)) await noteWhere(user.id, world);
    notices = await takeNotices(user.id);
  }
  return NextResponse.json({ crowds, notices, now: Date.now() });
}

const Body = z.object({ auto: z.boolean().default(false) });

export async function POST(req: NextRequest) {
  const r = await requirePlayer();
  if ('error' in r) return r.error;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return bad('Bad request');
  const res = await checkForNewPost(r.user, { auto: parsed.data.auto });
  return NextResponse.json({ ...res, now: Date.now() });
}
