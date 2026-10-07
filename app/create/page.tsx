import type { Metadata } from 'next';
import { getUser } from '@/lib/session';
import { ensurePlayer } from '@/lib/life/player';
import { lookFor, parseLook } from '@/lib/life/look';
import { SignInButton } from '@/components/ui/Chrome';
import { AvatarCreator } from '@/components/create/AvatarCreator';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Create your look', robots: { index: false } };

// The avatar creator. New players land here straight after their first sign-in (see the X callback);
// anyone can come back later from the phone's Settings to change their look.
export default async function CreatePage({ searchParams }: { searchParams: { next?: string } }) {
  const raw = searchParams.next ?? '';
  const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/my-world';
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
  const initial = parseLook(player.look) ?? lookFor(user.handle);
  return <AvatarCreator handle={user.handle} initial={initial} next={next} firstTime={player.lookPending} />;
}
