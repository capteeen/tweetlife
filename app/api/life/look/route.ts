import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { bad, requirePlayer } from '@/lib/life/auth';
import { LookSchema, parseLook } from '@/lib/life/look';

export const dynamic = 'force-dynamic';

/** Looks for up to 50 handles: { looks: { handle: Look | null } }. Null means "seeded from the handle". */
export async function GET(req: NextRequest) {
  const handles = (req.nextUrl.searchParams.get('handles') ?? '')
    .split(',')
    .map((h) => h.trim().replace(/^@/, ''))
    .filter(Boolean)
    .slice(0, 50);
  if (!handles.length) return NextResponse.json({ looks: {} });
  const users = await db.user.findMany({
    where: { OR: handles.map((h) => ({ handle: { equals: h, mode: 'insensitive' as const } })) },
    select: { handle: true, player: { select: { look: true } } },
  });
  const looks: Record<string, unknown> = {};
  for (const h of handles) {
    const u = users.find((x) => x.handle.toLowerCase() === h.toLowerCase());
    looks[h.toLowerCase()] = u?.player ? parseLook(u.player.look) : null;
  }
  return NextResponse.json({ looks }, { headers: { 'cache-control': 'public, max-age=30' } });
}

/** Save the signed-in player's look. */
export async function PUT(req: NextRequest) {
  const r = await requirePlayer();
  if ('error' in r) return r.error;
  const parsed = z.object({ look: LookSchema }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad('That look has an option we do not offer.');
  await db.player.update({ where: { id: r.player.id }, data: { look: parsed.data.look, lookPending: false } });
  return NextResponse.json({ ok: true, look: parsed.data.look });
}
