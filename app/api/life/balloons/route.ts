import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getUser } from '@/lib/session';
import { balloonsFor, type Balloon } from '@/lib/life/balloons';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_HANDLES = 20;

// The coin balloons for everyone in view: GET ?h=handle1,handle2. Signed-in visitors only.
export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Sign in with X to play.' }, { status: 401 });
  const handles = [...new Set((req.nextUrl.searchParams.get('h') ?? '').split(',').map((h) => h.trim().replace(/^@/, '').toLowerCase()).filter(Boolean))].slice(0, MAX_HANDLES);
  if (!handles.length) return NextResponse.json({ balloons: {} });
  const users = await db.user.findMany({ where: { OR: handles.map((h) => ({ handle: { equals: h, mode: 'insensitive' as const } })) }, select: { id: true, handle: true } });
  const balloons: Record<string, Balloon[]> = {};
  await Promise.all(users.map(async (u) => (balloons[u.handle.toLowerCase()] = await balloonsFor(u.id))));
  return NextResponse.json({ balloons }, { headers: { 'cache-control': 'private, no-store' } });
}
