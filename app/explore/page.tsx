import Link from 'next/link';
import { Footer, Header } from '@/components/ui/Chrome';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { compact, relativeTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

// Worlds whose owners opted into public listing. Real counts only. If the list is short, it is short.
export default async function Explore() {
  const user = await getSession();
  const worlds = await db.world.findMany({
    where: { listedOnExplore: true, access: 'public', ingestState: { in: ['live', 'building'] } },
    orderBy: { lastSyncAt: 'desc' },
    take: 100,
    include: { owner: { select: { name: true, avatarUrl: true } }, _count: { select: { structures: true, lanterns: true, marks: true } } },
  }).catch(() => []);
  return (
    <div className="min-h-screen">
      <Header user={user} />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-2xl font-semibold">Explore</h1>
        <p className="mt-1 text-white/60">Worlds whose owners chose to list them publicly.</p>
        {worlds.length === 0 ? (
          <div className="card mt-6 text-white/60">No worlds are listed yet.</div>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {worlds.map((w) => (
              <li key={w.id} className="card">
                <Link href={`/w/${w.handle}`} className="flex items-center gap-3">
                  {w.owner.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={w.owner.avatarUrl} alt="" className="h-10 w-10 rounded-full" />
                  ) : (
                    <span className="h-10 w-10 rounded-full bg-white/10" />
                  )}
                  <span>
                    <span className="block font-medium">@{w.handle}</span>
                    <span className="block text-xs text-white/55">{w.owner.name}</span>
                  </span>
                </Link>
                <div className="num mt-3 flex flex-wrap gap-x-4 text-xs text-white/60">
                  <span>{w._count.structures} posts</span>
                  <span>{compact(w.followersCount)} followers</span>
                  <span style={{ color: '#FFD089' }}>✦ {w._count.lanterns}</span>
                  <span>{w._count.marks} stones</span>
                </div>
                <p className="mt-2 text-xs text-white/45">
                  {w.ingestState === 'building' ? 'still building' : `synced ${relativeTime(w.lastSyncAt)}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </main>
      <Footer />
    </div>
  );
}
