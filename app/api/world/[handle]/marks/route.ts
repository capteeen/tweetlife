import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { resolveEntry } from '@/lib/world/entry';
import { doesFollow } from '@/lib/x/relationship';

export const dynamic = 'force-dynamic';

// Guestbook stones. One per visitor per world; placing again moves it.
// `bright` = the owner follows the visitor back, resolved on the owner's token and cached like the entry check.

const Body = z.object({
  text: z.string().trim().min(1).max(140),
  x: z.number().finite(),
  z: z.number().finite(),
});

export async function POST(req: NextRequest, { params }: { params: { handle: string } }) {
  const { world, visitor, decision } = await resolveEntry(params.handle);
  if (!world || !decision) return NextResponse.json({ error: 'No world.' }, { status: 404 });
  if (!visitor) return NextResponse.json({ error: 'Sign in to leave a stone.' }, { status: 401 });
  if (!decision.admit) return NextResponse.json({ error: decision.message }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'A stone needs a short message (1–140 chars).' }, { status: 400 });
  const { text, x, z } = parsed.data;

  // Does the owner follow the visitor back? Uses the owner's token; failure means "not bright", never an error.
  let bright = false;
  if (visitor.id !== world.xUserId) {
    const owner = await db.user.findUnique({ where: { id: world.xUserId } });
    if (owner && !owner.revokedAt) bright = (await doesFollow(owner, visitor.id, { maxWaitMs: 8000 })).state === 'follows';
  } else bright = true;

  const mark = await db.mark.upsert({
    where: { worldId_byUserId: { worldId: world.id, byUserId: visitor.id } },
    create: { worldId: world.id, byUserId: visitor.id, byHandle: visitor.handle, text, x, z, bright },
    update: { text, x, z, bright, byHandle: visitor.handle, at: new Date() },
  });
  return NextResponse.json({ mark: { id: mark.id, byHandle: mark.byHandle, text: mark.text, x: mark.x, z: mark.z, at: mark.at.toISOString(), bright: mark.bright } });
}

/** Owner clears the guestbook (all stones, or one by ?id=). A visitor may remove their own. */
export async function DELETE(req: NextRequest, { params }: { params: { handle: string } }) {
  const { world, visitor } = await resolveEntry(params.handle);
  if (!world) return NextResponse.json({ error: 'No world.' }, { status: 404 });
  if (!visitor) return NextResponse.json({ error: 'Sign in.' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  const isOwner = visitor.id === world.xUserId;
  if (isOwner) {
    await db.mark.deleteMany({ where: { worldId: world.id, ...(id ? { id } : {}) } });
  } else {
    await db.mark.deleteMany({ where: { worldId: world.id, byUserId: visitor.id } });
  }
  return NextResponse.json({ ok: true });
}
