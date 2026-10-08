'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { WorldModel } from '@/lib/world/load';
import { compact, relativeTime } from '@/lib/format';
import { useWorld } from './store';
import { usePresence } from './presence';
import { PostCard } from './PostCard';
import { HUD } from './HUD';
import { TouchSticks } from './TouchSticks';
import { SignInButton, XMark } from '@/components/ui/Chrome';
import { TopHUD } from '@/components/life/TopHUD';
import { StatBars } from '@/components/life/StatBars';
import { Phone } from '@/components/life/Phone';
import { PeerCard } from '@/components/life/PeerCard';
import { ResidentCard } from '@/components/life/ResidentCard';
import { FollowerCard } from '@/components/life/FollowerCard';
import { CrowdNotices, PostButton } from '@/components/life/CrowdHUD';
import { useCrowds } from '@/components/life/useCrowds';
import { VenueCard } from '@/components/life/VenueCard';
import { CityMap, TripBanner } from '@/components/life/CityMap';
import { VenueMusic } from '@/components/life/VenueMusic';
import { Welcome } from '@/components/life/Welcome';
import { CountryPrompt } from '@/components/citizen/CountryPrompt';
import { useLife } from '@/components/life/useLife';
import { enterVenue } from '@/components/life/travel';
import { placeVenues } from '@/lib/life/venues';
import { isCountryId } from '@/lib/world/countries';

const WorldCanvas = dynamic(() => import('./WorldCanvas').then((m) => m.WorldCanvas), { ssr: false });

// /w/[handle]: resolve access, then either walk in or watch from the boundary.
// Every state here is real: building shows live counts, failed shows the real error,
// outside shows the real skyline with the real reason.

type Payload =
  | { admitted: true; reason: string; me: Me; world: WorldModel }
  | { admitted: false; reason: string; message: string; me: Me; skyline: Skyline; ingestState: string; lastSyncAt: string | null }
  | { error: string };
type Me = { id: string; handle: string; isOwner: boolean } | null;
type Skyline = Pick<WorldModel, 'handle' | 'ownerName' | 'ownerAvatar' | 'followersCount' | 'structureCount' | 'biome' | 'accountCreatedAt' | 'geometry' | 'marks' | 'paths'>;

// `backdrop`: the title screen's background — the slow orbit view with no chrome at all.
// `country` (?country=bnb) picks which country's capital is drawn; without it the store keeps its current
// country (Solana by default), which nationality and flights set with useWorld.getState().setCountry.
export function WorldClient({ handle, spawnPostId, embed, backdrop, country }: { handle: string; spawnPostId?: string; embed?: boolean; backdrop?: boolean; country?: string }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [progress, setProgress] = useState<{ placed: number; postCount: number; ingestState: string; ingestError: string | null } | null>(null);
  const setModel = useWorld((s) => s.setModel);
  const setLit = useWorld((s) => s.setLit);
  const setSpawn = useWorld((s) => s.setSpawn);
  const model = useWorld((s) => s.model);
  const [ready, setReady] = useState(false);
  // a ?country link wins; otherwise you start in your home country (your nationality, Solana until picked)
  const homeCountry = useWorld((s) => s.life?.me?.citizen?.country);
  const homeApplied = useRef(false);
  useEffect(() => {
    if (isCountryId(country)) useWorld.getState().setCountry(country);
    else if (!homeApplied.current && isCountryId(homeCountry)) {
      homeApplied.current = true;
      useWorld.getState().setCountry(homeCountry);
    }
  }, [country, homeCountry]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/world/${encodeURIComponent(handle)}`, { cache: 'no-store' });
    const j = (await res.json()) as Payload;
    setPayload(j);
    if ('admitted' in j && j.admitted) {
      setModel(j.world, false, j.me);
      const lit = await fetch(`/api/world/${encodeURIComponent(handle)}/lantern`).then((r) => r.json()).catch(() => ({ lit: [] }));
      setLit(lit.lit ?? []);
      if (spawnPostId) {
        const s = j.world.geometry.structures.find((p) => p.postId === spawnPostId);
        if (s) {
          setSpawn({ x: s.x, z: s.z, rot: s.rot, depth: s.depth });
          useWorld.getState().select(s);
        }
      }
    } else if ('admitted' in j) {
      setModel({ ...(j.skyline as unknown as WorldModel), id: '', xUserId: '', access: 'followers', postCount: 0, hiddenCount: 0, lastSyncAt: j.lastSyncAt, ingestState: j.ingestState as WorldModel['ingestState'], ingestError: null, showMetrics: false, chatEnabled: false, building: null }, true, j.me);
    }
  }, [handle, spawnPostId, setModel, setLit, setSpawn]);

  useEffect(() => {
    load().catch(() => setPayload({ error: 'Could not load this world.' }));
  }, [load]);

  // While building: poll real counts and reload the model as pages land.
  const building = model?.ingestState === 'building' || model?.ingestState === 'queued';
  // The counter polls every 4s; the scene itself reloads at most every 15s (a reload rebuilds every
  // building), or immediately when the build finishes.
  const lastReload = useRef(0);
  useEffect(() => {
    if (!building) return;
    const t = setInterval(async () => {
      const p = await fetch(`/api/world/${encodeURIComponent(handle)}/progress`).then((r) => r.json()).catch(() => null);
      if (!p) return;
      setProgress(p);
      const changed = p.placed !== (model?.structureCount ?? 0);
      const finished = p.ingestState !== model?.ingestState;
      if (finished || (changed && Date.now() - lastReload.current > 15000)) {
        lastReload.current = Date.now();
        load().catch(() => {});
      }
    }, 4000);
    return () => clearInterval(t);
  }, [building, handle, load, model?.structureCount, model?.ingestState]);

  const admitted = !!payload && 'admitted' in payload && payload.admitted;
  const { online, sendChat, sendSocial, connected } = usePresence(handle, admitted);
  useLife(admitted && !backdrop);
  const signedIn = useWorld((s) => !!s.me);
  useCrowds(handle, admitted && !backdrop, signedIn);
  const nearVenue = useWorld((s) => s.nearVenue);
  const selectedVenue = useWorld((s) => s.selectedVenue);
  const toasts = useWorld((s) => s.toasts);
  const dropToast = useWorld((s) => s.dropToast);
  useEffect(() => {
    if (!toasts.length) return;
    const t = setTimeout(() => dropToast(toasts[0].id), 5000);
    return () => clearTimeout(t);
  }, [toasts, dropToast]);
  const me = useWorld((s) => s.me);
  // a new player who left the creator without saving gets a way back to it
  const lookPending = useWorld((s) => !!s.life?.me?.lookPending);
  const spawnAt = useWorld((s) => s.spawnAt);

  const stale = useMemo(() => model?.lastSyncAt && Date.now() - Date.parse(model.lastSyncAt) > 24 * 3600 * 1000, [model?.lastSyncAt]);

  if (payload && 'error' in payload) {
    return (
      <Shell>
        <div className="card max-w-md text-center">
          <h1 className="text-lg font-semibold">No world here</h1>
          <p className="mt-2 text-white/60">{payload.error} A world exists only once its owner signs in with X.</p>
          <div className="mt-4">
            <SignInButton returnTo="/play" label="Build yours" />
          </div>
        </div>
      </Shell>
    );
  }
  if (!payload || !model) {
    return (
      <Shell>
        <p className="text-white/60">Resolving access…</p>
      </Shell>
    );
  }

  const g = model.geometry;
  const empty = g.structures.length === 0;

  return (
    <div className="fixed inset-0 overflow-hidden bg-base">
      <WorldCanvas
        geometry={g}
        marks={model.marks}
        paths={model.paths}
        biome={model.biome}
        handle={model.handle}
        showMetrics={model.showMetrics}
        mode={admitted && !backdrop ? 'walk' : 'boundary'}
        spawn={spawnAt}
        onReady={() => setReady(true)}
      />
      {backdrop ? null : (
      <>
      {!ready && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-white/60">Loading the world…</div>
      )}

      {/* Building / failed / empty are honest states layered on top of whatever exists so far. */}
      {building && (
        <div className="pointer-events-none absolute left-1/2 top-16 z-10 -translate-x-1/2 rounded-full chrome px-4 py-1.5 text-sm">
          Building this world — <span className="num font-medium">{progress?.placed ?? model.structureCount}</span> posts placed
          {progress?.postCount ? <span className="num text-white/50"> of {compact(progress.postCount)} on the account</span> : null}
        </div>
      )}
      {model.ingestState === 'failed' && (
        <div className="absolute left-1/2 top-3 z-10 w-[min(92vw,520px)] -translate-x-1/2 rounded-2xl chrome px-4 py-3 text-sm">
          <p className="font-medium text-rose-300">The last sync failed.</p>
          <p className="text-white/70">{model.ingestError ?? progress?.ingestError ?? 'Unknown error.'}</p>
          {model.structureCount > 0 && <p className="mt-1 text-xs text-white/50">Showing the {model.structureCount} posts fetched before the failure.</p>}
        </div>
      )}
      {empty && !building && model.ingestState !== 'failed' && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full chrome px-4 py-1.5 text-sm text-white/70">
          No posts have been fetched for this account yet.
        </div>
      )}
      {admitted && stale && !building && (
        <div className="pointer-events-none absolute left-1/2 top-16 z-10 -translate-x-1/2 rounded-full chrome px-3 py-1 text-xs text-white/70">
          Data may be stale — last synced {relativeTime(model.lastSyncAt)}
        </div>
      )}

      {admitted ? (
        <>
          <TopHUD online={online} handle={model.handle} />
          {lookPending && (
            <a
              className="pointer-events-auto absolute left-1/2 top-16 z-20 -translate-x-1/2 max-sm:left-auto max-sm:right-3 max-sm:translate-x-0 rounded-full bg-x px-4 py-1.5 text-sm font-semibold text-white shadow-lg hover:brightness-110"
              href={`/create?next=${encodeURIComponent(`/w/${model.handle}`)}`}
            >
              👕 Pick your look
            </a>
          )}
          <StatBars />
          <PostCard handle={model.handle} showMetrics={model.showMetrics} canAct={!!me} />
          <PeerCard worldId={model.id} sendSocial={sendSocial} />
          <ResidentCard />
          <FollowerCard />
          <CrowdNotices world={model.handle} />
          <PostButton />
          <VenueCard sendSocial={sendSocial} />
          <Phone sendSocial={sendSocial} handle={model.handle} />
          {!lookPending && <CountryPrompt />}
          <TripBanner />
          <VenueMusic />
          <CityMap />
          {nearVenue && !selectedVenue && (
            <button
              className="pointer-events-auto absolute bottom-20 [@media(any-pointer:coarse)]:bottom-56 left-1/2 z-20 -translate-x-1/2 rounded-full chrome px-4 py-2 text-sm font-semibold hover:bg-white/10"
              onClick={() => {
                const v = placeVenues(g.contentRadius, g.boundaryRadius, useWorld.getState().country).find((x) => x.id === nearVenue);
                if (v) enterVenue(v);
              }}
            >
              {(() => {
                const v = placeVenues(g.contentRadius, g.boundaryRadius, useWorld.getState().country).find((x) => x.id === nearVenue);
                return v ? `${v.emoji} Enter ${v.name}` : 'Enter';
              })()}
            </button>
          )}
          {/* on phones toasts drop below the folded stat chip instead of covering it */}
          <div className="pointer-events-none absolute right-3 top-16 z-30 flex w-[min(80vw,320px)] flex-col gap-2 max-sm:left-3 max-sm:top-28 max-sm:w-auto">
            {toasts.map((t) => (
              <div key={t.id} className="rounded-2xl chrome px-3 py-2 text-sm shadow-lg">
                {t.text}
              </div>
            ))}
          </div>
          <button
            className="pointer-events-auto absolute bottom-32 right-3 z-20 [@media(any-pointer:coarse)]:bottom-72 rounded-full chrome px-4 py-2 text-sm font-semibold hover:bg-white/10"
            onClick={() => useWorld.getState().setMapOpen(true)}
          >
            🗺️ Map
          </button>
          {me && (
            <a href="/home" className="pointer-events-auto absolute bottom-20 right-3 z-20 [@media(any-pointer:coarse)]:bottom-56 rounded-full chrome px-4 py-2 text-sm font-semibold hover:bg-white/10">
              🏠 Go home
            </a>
          )}
          <HUD model={model} online={online} canAct={!!me} sendChat={sendChat} chatAvailable={model.chatEnabled && connected} />
          <TouchSticks />
          {!embed && <Welcome />}
          {!embed && (
            <div className="pointer-events-none absolute left-3 top-3 z-10 hidden text-xs text-white/50 sm:block [@media(hover:none)]:hidden">WASD to walk · drag to look · tap a structure</div>
          )}
        </>
      ) : (
        <Boundary payload={payload as Extract<Payload, { admitted: false }>} model={model} embed={embed} />
      )}
      <a
        href="/"
        className={`absolute right-3 top-3 z-10 rounded-full chrome px-3 py-1 text-xs text-white/70 hover:text-white ${admitted ? 'max-sm:hidden' : ''}`}
        target={embed ? '_blank' : undefined}
        rel="noopener noreferrer"
      >
        TweetLife
      </a>
      </>
      )}
    </div>
  );
}

function Boundary({ payload, model, embed }: { payload: Extract<Payload, { admitted: false }>; model: WorldModel; embed?: boolean }) {
  const path = `/w/${model.handle}`;
  const g = model.geometry;
  const lm = g.structures.find((s) => s.isLandmark);
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-3 p-4 pb-6 text-center">
      <div className="pointer-events-auto w-[min(92vw,460px)] rounded-2xl chrome p-4">
        <div className="flex items-center justify-center gap-2">
          {model.ownerAvatar && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={model.ownerAvatar} alt="" className="h-8 w-8 rounded-full" />
          )}
          <span className="font-semibold">@{model.handle}&apos;s world</span>
        </div>
        <p className="num mt-1 text-xs text-white/55">
          {model.structureCount} posts · {compact(model.followersCount)} followers · since {new Date(model.accountCreatedAt).getFullYear()}
        </p>
        {lm && lm.text && <p className="mt-2 line-clamp-2 text-sm text-white/70">“{lm.text}”</p>}
        <p className="mt-3 text-sm">{payload.message}</p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {payload.reason === 'signed_out' && <SignInButton returnTo={path} label="Sign in with X to enter" />}
          {payload.reason === 'not_following' && (
            <>
              <a className="btn" href={`https://x.com/intent/follow?screen_name=${model.handle}`} target="_blank" rel="noopener noreferrer">
                <XMark /> Follow @{model.handle} to enter
              </a>
              <button className="btn-ghost" onClick={() => location.reload()}>
                I followed — try again
              </button>
            </>
          )}
          {payload.reason === 'unverified' && (
            <button className="btn-ghost" onClick={() => location.reload()}>
              Try again
            </button>
          )}
          {payload.reason === 'invite_only' && payload.me == null && <SignInButton returnTo={path} label="Sign in with X" />}
        </div>
        {embed && (
          <a className="mt-2 inline-block text-xs text-white/50 underline" href={path} target="_blank" rel="noopener noreferrer">
            Open full screen
          </a>
        )}
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 flex items-center justify-center bg-base p-6">{children}</div>;
}
