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
import { Welcome } from '@/components/life/Welcome';
import { SignInButton } from '@/components/ui/Chrome';
import { hasPower, type HomeView } from '@/lib/life/home';
import { useHome } from './store';
import { GameAudio } from '@/components/audio/GameAudio';
import { HomeSounds } from '@/components/audio/HomeSounds';
import { sfx } from '@/lib/audio/sfx';
import { useHousePresence } from './presence';
import { loveActions, useLoveSync } from '@/components/life/loveClient';
import { RequestNotices } from '@/components/life/RequestNotices';

const HomeCanvas = dynamic(() => import('./HomeCanvas').then((m) => m.HomeCanvas), { ssr: false });

// /home (mine), /home/[handle] (a visit) and /home/r/[id] (an AI resident's place). The room, the furniture sheets,
// the phone, and the same HUD as the city. Someone else's house needs an invite (lib/life/love.ts): without
// one you get the front door and can knock.

type Knock = { handle?: string; resident?: string; name: string };

export function HomeClient({ handle, residentId }: { handle?: string; residentId?: string }) {
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
  const [knock, setKnock] = useState<Knock | null>(null);

  const load = useCallback(async () => {
    const q = residentId ? `?resident=${encodeURIComponent(residentId)}` : handle ? `?handle=${encodeURIComponent(handle)}` : '';
    const res = await fetch(`/api/life/home${q}`, { cache: 'no-store' });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setKnock(j.knock ?? null);
      setHome(null, j.error ?? 'Could not load this house.');
      return;
    }
    setKnock(null);
    setHome(j as HomeView);
  }, [handle, residentId, setHome]);

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

  const signedIn = !!life?.me;
  useLoveSync(signedIn);
  // the host and their guests see each other (players' houses only: residents don't use the internet)
  useHousePresence(home && !home.resident ? home.owner.handle : null, !!home && signedIn);
  // at the door waiting for a yes: look again every few seconds
  useEffect(() => {
    if (!knock) return;
    const t = setInterval(() => load().catch(() => {}), 8000);
    return () => clearInterval(t);
  }, [knock, load]);

  useEffect(() => {
    if (!toasts.length) return;
    const t = setTimeout(() => dropToast(toasts[0].id), 5000);
    return () => clearTimeout(t);
  }, [toasts, dropToast]);

  const exit = () => {
    sfx('doorOpen');
    router.push(home && !home.resident ? `/w/${home.owner.handle}` : '/play');
  };
  const noop = () => {};

  if (error && knock && life?.me) return <FrontDoor knock={knock} message={error} onIn={load} />;
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
      <HomeCanvas home={home} handle={me?.handle ?? null} onExit={exit} />
      <GameAudio />
      <HomeSounds />
      <TopHUD online={null} handle={home.owner.handle} />
      {/* top-left: my stats and moves, whose house, and the light situation */}
      <div className="pointer-events-auto absolute left-3 top-16 z-10 flex flex-col gap-2">
        {home.mine && <StatBars inline atHome />}
        <div className="rounded-2xl chrome px-3 py-2 text-xs">
          <div className="font-semibold">🏠 {home.mine ? 'Your house' : home.resident ? `${home.resident.name}'s place` : `@${home.owner.handle}'s house`}</div>
          {home.access?.reason === 'pass' && home.access.until && (
            <div className="text-[#FFB3C8]">💌 Invited · until {new Date(home.access.until).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })}</div>
          )}
          {home.access?.reason === 'partner' && <div className="text-[#FFB3C8]">💞 Partners drop by any time</div>}
          {home.mine && !!home.guests?.length && <div className="text-[#FFD089]">👋 {home.guests.map((g) => g.name).join(', ')} came over</div>}
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
      <div className="pointer-events-none absolute right-3 top-16 z-30 flex w-[min(80vw,320px)] flex-col gap-2 max-sm:left-3 max-sm:top-28 max-sm:w-auto">
        {toasts.map((t) => (
          <div key={t.id} className="rounded-2xl chrome px-3 py-2 text-sm shadow-lg">
            {t.text}
          </div>
        ))}
      </div>
      <div className="pointer-events-auto absolute inset-x-3 bottom-3 z-20 flex items-center gap-2 rounded-2xl chrome px-3 py-2 text-sm">
        <span className="truncate text-white/70">{home.mine ? 'Tap a piece of furniture to use it.' : `Visiting ${home.resident ? home.resident.name : `@${home.owner.handle}`}. Make yourself at home.`}</span>
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
      <RequestNotices />
      <TouchSticks />
      {home.mine && <Welcome />}
      <div className="pointer-events-none absolute left-3 top-3 z-10 hidden text-xs text-white/50 sm:block [@media(hover:none)]:hidden">WASD to walk · tap furniture · tap the door to leave</div>
    </div>
  );
}

/** Not invited (yet): the front door, and a knock that sends "can I come over?" */
function FrontDoor({ knock, message, onIn }: { knock: Knock; message: string; onIn: () => Promise<void> }) {
  const [state, setState] = useState<'idle' | 'busy' | 'asked'>('idle');
  const [note, setNote] = useState<string | null>(null);
  const who = knock.resident ? knock.name : `@${knock.handle}`;
  const ask = async () => {
    setState('busy');
    setNote(null);
    try {
      const r = await loveActions.ask('visit', knock.resident ? { residentId: knock.resident } : { handle: knock.handle! });
      if (r.reply) setNote(`${knock.name}: “${r.reply}”`);
      if (r.accepted) return await onIn();
      setState(r.accepted === false ? 'idle' : 'asked');
    } catch (e) {
      setNote((e as Error).message);
      setState('idle');
    }
  };
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-b from-[#101B30] to-[#2a1f4e] p-6">
      <div className="card max-w-md text-center">
        <div className="text-5xl">🚪</div>
        <h1 className="mt-2 text-lg font-semibold">{knock.resident ? `${knock.name}'s place` : `@${knock.handle}'s house`}</h1>
        <p className="mt-2 text-white/60">{state === 'asked' ? `You knocked. ${who} gets a request in their phone; the door opens as soon as they accept.` : message}</p>
        {note && <p className="mt-2 text-sm text-white/80">{note}</p>}
        <div className="mt-4 flex justify-center gap-2">
          {state !== 'asked' && (
            <button className="btn" disabled={state === 'busy'} onClick={ask}>
              ✊ Knock and ask to come in
            </button>
          )}
          <a className="btn-ghost" href="/play">
            Back to the city
          </a>
        </div>
      </div>
      {/* they may already have invited you: accept it right here and the door opens */}
      <RequestNotices />
    </div>
  );
}
