import { Footer, Header, SignInButton } from '@/components/ui/Chrome';
import { getSession, getUser } from '@/lib/session';
import { db } from '@/lib/db';
import { budgetStatus } from '@/lib/x/budget';
import { Dashboard, type DashboardData } from '@/components/dashboard/Dashboard';

export const dynamic = 'force-dynamic';

// Owner dashboard. Real sync status, quota, dead-letter retries, landmark pin, hide posts, biome, paths, delete.
export default async function MyWorld() {
  const session = await getSession();
  const user = await getUser();
  if (!user) {
    return (
      <div className="min-h-screen">
        <Header user={session} />
        <main className="mx-auto max-w-md px-4 py-20 text-center">
          <h1 className="text-2xl font-semibold">Your world</h1>
          <p className="mt-2 text-white/60">Sign in with X and we build a world from your real timeline, on your own token.</p>
          <div className="mt-6">
            <SignInButton returnTo="/my-world" />
          </div>
        </main>
        <Footer />
      </div>
    );
  }
  const world = await db.world.findUnique({ where: { xUserId: user.id } });
  if (!world) {
    return (
      <div className="min-h-screen">
        <Header user={session} />
        <main className="mx-auto max-w-md px-4 py-20 text-center text-white/60">
          No world is attached to @{user.handle}. Sign out and in again to create one.
          <form action="/api/auth/logout" method="post" className="mt-4">
            <button className="btn-ghost">Sign out</button>
          </form>
        </main>
      </div>
    );
  }
  const [runs, structures, budget, userCalls, timelapse] = await Promise.all([
    db.ingestRun.findMany({ where: { worldId: world.id }, orderBy: { startedAt: 'desc' }, take: 20 }),
    db.structure.findMany({
      where: { worldId: world.id },
      orderBy: [{ likes: 'desc' }, { postedAt: 'desc' }],
      take: 400,
      select: { id: true, postId: true, kind: true, text: true, likes: true, reposts: true, replies: true, impressions: true, postedAt: true, hidden: true, lanternsLit: true },
    }),
    budgetStatus(),
    db.apiCall.count({ where: { userId: user.id, at: { gte: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)) } } }),
    db.timelapseJob.findFirst({ where: { worldId: world.id }, orderBy: { startedAt: 'desc' } }),
  ]);
  const data: DashboardData = {
    world: {
      handle: world.handle,
      access: world.access,
      biome: world.biome,
      listedOnExplore: world.listedOnExplore,
      landmarkPostId: world.landmarkPostId,
      showReplies: world.showReplies,
      showMetrics: world.showMetrics,
      chatEnabled: world.chatEnabled,
      ingestState: world.ingestState,
      ingestError: world.ingestError,
      lastSyncAt: world.lastSyncAt?.toISOString() ?? null,
      nextSyncAt: world.nextSyncAt?.toISOString() ?? null,
      followersCount: world.followersCount,
      postCount: world.postCount,
      paths: (world.paths as { x: number; z: number }[][]) ?? [],
    },
    structures: structures.map((s) => ({ ...s, postedAt: s.postedAt.toISOString() })),
    runs: runs.map((r) => ({
      id: r.id, kind: r.kind, status: r.status, startedAt: r.startedAt.toISOString(), finishedAt: r.finishedAt?.toISOString() ?? null,
      pagesFetched: r.pagesFetched, postsWritten: r.postsWritten, calls: r.calls, attempts: r.attempts, error: r.error,
    })),
    budget,
    userCallsThisMonth: userCalls,
    timelapse: timelapse ? { id: timelapse.id, status: timelapse.status, ready: !!timelapse.filePath, error: timelapse.error } : null,
  };
  return (
    <div className="min-h-screen">
      <Header user={session} />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Dashboard data={data} />
      </main>
      <Footer />
    </div>
  );
}
