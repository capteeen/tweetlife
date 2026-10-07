import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

// Hide / unhide one of the owner's own posts in their world.
const Body = z.object({ hidden: z.boolean() });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Sign in.' }, { status: 401 });
  const world = await db.world.findUnique({ where: { xUserId: user.id } });
  if (!world) return NextResponse.json({ error: 'No world yet.' }, { status: 404 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'hidden: boolean required' }, { status: 400 });
  const res = await db.structure.updateMany({ where: { id: params.id, worldId: world.id }, data: { hidden: parsed.data.hidden } });
  if (res.count === 0) return NextResponse.json({ error: 'Not in your world.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
