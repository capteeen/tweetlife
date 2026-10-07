import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getUser } from '@/lib/session';
import { BIOMES } from '@/lib/world/biomes';

export const dynamic = 'force-dynamic';

const Body = z.object({
  access: z.enum(['followers', 'public', 'invite']).optional(),
  biome: z.enum(BIOMES).optional(),
  listedOnExplore: z.boolean().optional(),
  landmarkPostId: z.string().nullable().optional(),
  showReplies: z.boolean().optional(),
  showMetrics: z.boolean().optional(),
  chatEnabled: z.boolean().optional(),
  paths: z.array(z.array(z.object({ x: z.number().finite(), z: z.number().finite() })).max(200)).max(50).optional(),
});

export async function PATCH(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Sign in.' }, { status: 401 });
  const world = await db.world.findUnique({ where: { xUserId: user.id } });
  if (!world) return NextResponse.json({ error: 'No world yet.' }, { status: 404 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid' }, { status: 400 });
  const data = parsed.data;
  if (data.landmarkPostId) {
    const s = await db.structure.findFirst({ where: { worldId: world.id, postId: data.landmarkPostId } });
    if (!s) return NextResponse.json({ error: 'That post is not in your world.' }, { status: 400 });
  }
  // Listing on /explore only makes sense for public worlds.
  if (data.listedOnExplore && (data.access ?? world.access) !== 'public') data.listedOnExplore = false;
  const updated = await db.world.update({ where: { id: world.id }, data });
  return NextResponse.json({ ok: true, world: { access: updated.access, biome: updated.biome, listedOnExplore: updated.listedOnExplore } });
}
