import Link from 'next/link';
import { Footer, Header, SignInButton } from '@/components/ui/Chrome';
import { getSession } from '@/lib/session';
import { env } from '@/lib/env';
import { findWorldByHandle } from '@/lib/world/load';
import { db } from '@/lib/db';
import { compact } from '@/lib/format';

export const dynamic = 'force-dynamic';

// Landing. The operator's own public world is embedded full-bleed, labelled as the real account it is.
// If no operator world exists yet, the page says so instead of showing anything fabricated.

export default async function Landing({ searchParams }: { searchParams: { auth_error?: string } }) {
  const user = await getSession();
  const operatorHandle = env().OPERATOR_HANDLE.replace(/^@/, '');
  const operator = operatorHandle ? await findWorldByHandle(operatorHandle) : null;
  const showcase = operator && operator.access === 'public' ? operator : null;
  const showcaseCount = showcase ? await db.structure.count({ where: { worldId: showcase.id, hidden: false } }) : 0;
  const worldCount = await db.world.count({ where: { ingestState: 'live' } });

  return (
    <div className="min-h-screen">
      <Header user={user} />
      <main className="mx-auto max-w-6xl px-4">
        {searchParams.auth_error && (
          <div className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">Sign-in failed: {searchParams.auth_error}</div>
        )}
        <section className="py-12 text-center sm:py-16">
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">Your account is a place.</h1>
          <p className="mx-auto mt-4 max-w-2xl text-white/70">
            Every X account has one persistent 3D world, built from its real posting history. Posts become structures, engagement becomes scale and
            light, quiet months become open ground. Only your followers can walk in.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            {user ? (
              <Link className="btn" href="/my-world">
                Open my world
              </Link>
            ) : (
              <SignInButton returnTo="/my-world" label="Sign in with X — build your world" />
            )}
            <Link className="btn-ghost" href="/how">
              How it grows
            </Link>
          </div>
        </section>

        <section className="relative overflow-hidden rounded-3xl border border-white/10" style={{ height: 'min(70vh, 640px)' }}>
          {showcase ? (
            <>
              <iframe src={`/w/${showcase.handle}?embed=1`} title={`@${showcase.handle}'s world`} className="h-full w-full" allow="fullscreen" />
              <div className="pointer-events-none absolute left-3 top-3 rounded-full chrome px-3 py-1 text-xs text-white/80">
                Live: the real world of @{showcase.handle} (operator) · <span className="num">{showcaseCount}</span> posts
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-6 text-center text-white/60">
              <p className="font-medium text-white/80">No showcase world yet.</p>
              <p className="mt-1 max-w-md text-sm">
                The first world on this deployment will be the operator&apos;s own. Once it is built and set to public, it appears here — nothing
                invented in the meantime.
              </p>
            </div>
          )}
        </section>

        <section className="grid gap-4 py-12 sm:grid-cols-3">
          <div className="card">
            <p className="label">Posts → structures</p>
            <p className="mt-2 text-sm text-white/70">Text is a pillar. A thread is a spire. A photo is a framed monolith showing the real image. A repost is a lantern.</p>
          </div>
          <div className="card">
            <p className="label">Engagement → scale</p>
            <p className="mt-2 text-sm text-white/70">Likes raise height, reposts widen, replies add windows, impressions set the glow. Log-scaled, so one huge post is a landmark, not a wall.</p>
          </div>
          <div className="card">
            <p className="label">Cadence → terrain</p>
            <p className="mt-2 text-sm text-white/70">Walking outward walks through your history. Quiet gaps are visibly barren ground you cross.</p>
          </div>
        </section>
        <p className="num pb-6 text-center text-xs text-white/40">
          {worldCount} {worldCount === 1 ? 'world is' : 'worlds are'} live on this deployment.
        </p>
      </main>
      <Footer />
    </div>
  );
}
