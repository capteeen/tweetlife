import type { Metadata } from 'next';
import { getUser } from '@/lib/session';
import { ensurePlayer } from '@/lib/life/player';
import { lookFor, parseLook, randomLook } from '@/lib/life/look';
import { citizenship } from '@/lib/life/citizen';
import { SignInButton } from '@/components/ui/Chrome';
import { CreateFlow } from '@/components/create/CreateFlow';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Create your look', robots: { index: false } };

// Sign-up: new players land here straight after their first sign-in (see the X callback) and get the one-screen
// creator. Anyone can come back later from the phone's Wardrobe (?wardrobe=1) for the full outfit picker.
export default async function CreatePage({ searchParams }: { searchParams: { next?: string; wardrobe?: string } }) {
  const raw = searchParams.next ?? '';
  const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/play';
  const user = await getUser();
  if (!user) {
    return (
      <main className="fixed inset-0 flex items-center justify-center bg-base p-6">
        <div className="card max-w-sm text-center">
          <h1 className="text-lg font-semibold">Create your look</h1>
          <p className="mt-2 text-white/60">Sign in with X to pick how you look in TweetLife.</p>
          <div className="mt-4">
            <SignInButton returnTo={`/create?next=${encodeURIComponent(next)}`} />
          </div>
        </div>
      </main>
    );
  }
  const player = await ensurePlayer(user.id);
  // a brand-new player starts from a random outfit (Randomise rolls again); everyone else from their own look
  const initial = parseLook(player.look) ?? (player.lookPending ? randomLook() : lookFor(user.handle));
  // a new player picks their country first; anyone else without one is asked here too (or once in the world)
  return (
    <CreateFlow
      handle={user.handle}
      name={user.name}
      avatarUrl={user.avatarUrl}
      initial={initial}
      next={next}
      firstTime={player.lookPending}
      needsCountry={!player.nationality}
      country={citizenship(player).country}
      wardrobe={searchParams.wardrobe === '1'}
    />
  );
}
