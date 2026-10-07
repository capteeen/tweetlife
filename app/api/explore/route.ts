import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Worlds a newcomer can walk into from "Enter a world": the ones their owners listed on Explore (public),
// most recently synced first. Same rule as the Explore page; nothing unlisted is ever shown.
export async function GET() {
  const worlds = await db.world
    .findMany({
      where: { listedOnExplore: true, access: 'public', ingestState: { in: ['live', 'building'] } },
      orderBy: { lastSyncAt: 'desc' },
      take: 8,
      select: { handle: true, owner: { select: { name: true, avatarUrl: true } }, _count: { select: { structures: true } } },
    })
    .catch(() => []);
  return NextResponse.json(
    { worlds: worlds.map((w) => ({ handle: w.handle, name: w.owner.name, avatarUrl: w.owner.avatarUrl, posts: w._count.structures })) },
    { headers: { 'cache-control': 'public, max-age=60' } },
  );
}
