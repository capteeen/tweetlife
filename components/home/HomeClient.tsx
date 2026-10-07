'use client';
import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useWorld } from '@/components/world/store';
import { TouchSticks } from '@/components/world/TouchSticks';
import { TopHUD } from '@/components/life/TopHUD';
import { StatBars } from '@/components/life/StatBars';
import { Phone } from '@/components/life/Phone';
import { FurnitureCard } from '@/components/life/FurnitureCard';
import { useLife } from '@/components/life/useLife';
import { SignInButton } from '@/components/ui/Chrome';
import { hasPower, type HomeView } from '@/lib/life/home';
import { useHome } from './store';

const HomeCanvas = dynamic(() => import('./HomeCanvas').then((m) => m.HomeCanvas), { ssr: false });

// /home (mine) and /home/[handle] (a visit). The room, the furniture sheets, the phone, and the same HUD as the city.

export function HomeClient({ handle }: { handle?: string }) {
  const router = useRouter();
  const home = useHome((s) => s.home);
  const error = useHome((s) => s.error);
  const setHome = useHome((s) => s.setHome);
  const select = useHome((s) => s.select);
  const life = useLife(true);
  const toasts = useWorld((s) => s.toasts);
  const dropToast = useWorld((s) => s.dropToast);
  const openPhone = useWorld((s) => s.openPhone);
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    const res = await fetch(`/api/life/home${handle ? `?handle=${encodeURIComponent(handle)}` : ''}`, { cache: 'no-store' });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setHome(null, j.error ?? 'Could not load this house.');
      return;
    }
    setHome(j as HomeView);
  }, [handle, setHome]);

  useEffect(() => {
    load().catch(() => setHome(null, 'Could not load this house.'));
    return () => {
      setHome(null);
      select(null);
    };
  }, [load, setHome, select]);

  // buying from the phone changes the room: reload whenever the furniture list changes
  const furnitureKey = (life?.furniture ?? []).map((f) => `${f.itemId}:${f.stored}`).join(',');
  useEffect(() => {
    if (home?.mine) load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [furnitureKey]);

  // the power timetable: refresh when the grid is due to change
  useEffect(() => {
    if (!home) return;
    const ms = Math.max(5000, home.power.changesAt - Date.now() + 500);
    const t = setTimeout(() => load().catch(() => {}), Math.min(ms, 60 * 60_000));
    const t2 = setInterval(() => tick((n) => n + 1), 30_000);
    return () => {
      clearTimeout(t);
      clearInterval(t2);
    };
  }, [home, load]);

  useEffect(() => {
    if (!toasts.length) return;
    const t = setTimeout(() => dropToast(toasts[0].id), 5000);
    return () => clearTimeout(t);
  }, [toasts, dropToast]);

  const exit = () => router.push(home ? `/w/${home.owner.handle}` : '/');
  const noop = () => {};

  if (error) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-base p-6">
        <div className="card max-w-md text-center">
          <h1 className="text-lg font-semibold">{handle ? `No house for @${handle.replace(/^@/, '')}` : 'Sign in to get a house'}</h1>
          <p className="mt-2 text-white/60">{error}</p>
          <div className="mt-4">{handle ? <a className="btn" href="/">TweetLife</a> : <SignInButton returnTo="/home" label="Sign in with X" />}</div>
        </div>
      </div>
    );
  }
  if (!home) {
    return <div className="fixed inset-0 flex items-center justify-center bg-base text-white/60">Opening the house…</div>;
  }

  const me = life?.me ?? null;
  const power = hasPower(home.power);
  const mins = Math.max(1, Math.round((home.power.changesAt - Date.now()) / 60000));
  return (
    <div className="fixed inset-0 overflow-hidden bg-base">
      <HomeCanvas home={home} handle={home.mine ? me?.handle ?? null : home.owner.handle} onExit={exit} />
      <TopHUD online={null} handle={home.owner.handle} />
      {/* top-left: my stats and moves, whose house, and the light situation */}
      <div className="pointer-events-auto absolute left-3 top-16 z-10 flex flex-col gap-2">
        {home.mine && <StatBars inline atHome />}
        <div className="rounded-2xl chrome px-3 py-2 text-xs">
          <div className="font-semibold">🏠 {home.mine ? 'Your house' : `@${home.owner.handle}'s house`}</div>
          <div className={power ? 'text-emerald-300' : 'text-amber-200'}>
            {home.power.grid ? `💡 Light is on · NEPA takes it in ${mins} min` : home.power.generator ? `⚡ Gen is on · fuel for ${mins} min` : `🕯️ No light · back in ${mins} min`}
          </div>
        </div>
        {home.mine && (
          <button className="rounded-2xl chrome px-3 py-2 text-left text-xs hover:bg-white/10" onClick={() => openPhone('market', 'home')}>
            🛍️ Buy furniture
          </button>
        )}
      </div>
      <FurnitureCard onRefresh={load} />
      <Phone sendSocial={noop} handle={home.owner.handle} />
      <div className="pointer-events-none absolute right-3 top-16 z-30 flex w-[min(80vw,320px)] flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className="rounded-2xl chrome px-3 py-2 text-sm shadow-lg">
            {t.text}
          </div>
        ))}
      </div>
      <div className="pointer-events-auto absolute inset-x-3 bottom-3 z-20 flex items-center gap-2 rounded-2xl chrome px-3 py-2 text-sm">
        <span className="truncate text-white/70">{home.mine ? 'Tap a piece of furniture to use it.' : `Visiting @${home.owner.handle}.`}</span>
        <span className="ml-auto flex items-center gap-2">
          {me && (
            <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => openPhone('house')}>
              📱 Phone
            </button>
          )}
          <button className="btn !px-3 !py-1.5 text-xs" onClick={exit}>
            🚪 Back to the city
          </button>
        </span>
      </div>
      <TouchSticks />
      <div className="pointer-events-none absolute left-3 top-3 z-10 hidden text-xs text-white/50 sm:block [@media(hover:none)]:hidden">WASD to walk · tap furniture · tap the door to leave</div>
    </div>
  );
}
