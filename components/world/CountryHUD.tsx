'use client';
import { useMemo, useState } from 'react';
import { useWorld } from './store';
import { COUNTRIES } from '@/lib/world/countries';
import { plotEntrance } from '@/lib/world/country-map';
import { TravelPicker } from '@/components/life/TravelPicker';
import { SignInButton, XMark } from '@/components/ui/Chrome';

// Country chrome: whose block you're standing in (and whether you may read it), and the Neighbours list:
// every block in this country, who's online, and a ride to any of them.

export function BlockBadge() {
  const country = useWorld((s) => s.country);
  const block = useWorld((s) => s.block);
  const plot = useWorld((s) => (s.block ? s.countryMap?.plots.find((p) => p.handle === s.block) ?? null : null));
  const access = useWorld((s) => (s.block ? s.blockAccess[s.block.toLowerCase()] : undefined));
  const me = useWorld((s) => s.me);
  const c = COUNTRIES[country];
  return (
    <div className="pointer-events-auto absolute left-1/2 top-16 z-20 flex max-w-[min(80vw,360px)] -translate-x-1/2 flex-col items-center gap-1 text-center">
      <div className="flex items-center gap-2 rounded-full chrome py-1 pl-1 pr-3 text-sm">
        {plot?.ownerAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={plot.ownerAvatar} alt="" className="h-6 w-6 rounded-full" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.logo} alt="" className="h-6 w-6 rounded-full bg-white/10 p-0.5" />
        )}
        <span className="truncate">
          {block ? (
            <>
              <b>@{block}</b>
              <span className="text-white/55">{me?.handle?.toLowerCase() === block.toLowerCase() ? ' · your block' : "'s block"}</span>
            </>
          ) : (
            <>
              <b>{c.capital}</b>
              <span className="text-white/55"> · {c.name}</span>
            </>
          )}
        </span>
      </div>
      {block && access && !access.loading && !access.admitted && (
        <div className="rounded-2xl chrome px-3 py-2 text-xs text-white/75">
          <p>{access.message ?? `@${block}'s posts are for followers.`}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {access.reason === 'signed_out' && <SignInButton returnTo={`/w/${block}`} label="Sign in with X" />}
            {access.reason === 'not_following' && (
              <a className="btn !px-3 !py-1 text-xs" href={`https://x.com/intent/follow?screen_name=${block}`} target="_blank" rel="noopener noreferrer">
                <XMark /> Follow @{block}
              </a>
            )}
          </div>
        </div>
      )}
      {!me && !block && (
        <div className="rounded-2xl chrome px-3 py-2 text-xs text-white/75">
          <p>You are walking around as a guest.</p>
          <div className="mt-1.5">
            <SignInButton returnTo="/play" label="Sign in to get your block" />
          </div>
        </div>
      )}
    </div>
  );
}

export function Neighbours() {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const cm = useWorld((s) => s.countryMap);
  const mine = useWorld((s) => s.mine);
  const peers = useWorld((s) => s.peers);
  const me = useWorld((s) => s.me);
  const block = useWorld((s) => s.block);
  const here = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of Object.values(peers)) m.set(p.handle.toLowerCase(), (m.get(p.handle.toLowerCase()) ?? 0) + 1);
    if (me) m.set(me.handle.toLowerCase(), 1);
    return m;
  }, [peers, me]);
  const list = useMemo(() => {
    if (!cm) return [];
    const isMine = (slot: number) => mine?.country === cm.country && mine.slot === slot;
    return cm.plots
      .filter((p) => !q || p.handle.toLowerCase().includes(q.toLowerCase().replace(/^@/, '')))
      .sort((a, b) => Number(isMine(b.slot)) - Number(isMine(a.slot)) || Number(here.has(b.handle.toLowerCase())) - Number(here.has(a.handle.toLowerCase())) || a.slot - b.slot);
  }, [cm, q, here, mine]);
  if (!cm) return null;
  const c = COUNTRIES[cm.country];
  const online = Object.keys(peers).length + (me ? 1 : 0);
  const target = pick ? cm.plots.find((p) => p.handle === pick) ?? null : null;

  return (
    <>
      <button
        className="pointer-events-auto absolute bottom-56 right-3 z-20 rounded-full chrome px-4 py-2 text-sm font-semibold hover:bg-white/10 [@media(any-pointer:coarse)]:bottom-[26rem]"
        onClick={() => setOpen(!open)}
      >
        👥 Neighbours
      </button>
      {open && (
        <div className="pointer-events-auto absolute right-3 top-16 z-30 flex max-h-[70vh] w-[min(92vw,380px)] flex-col rounded-2xl chrome p-4 max-sm:left-3 max-sm:w-auto">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.logo} alt="" className="mr-1.5 inline h-5 w-5 align-[-4px]" />
              {c.name} · {cm.plots.length} blocks
            </h3>
            <button className="rounded-full px-2 py-0.5 hover:bg-white/10" onClick={() => setOpen(false)} aria-label="Close">
              ✕
            </button>
          </div>
          <p className="text-xs text-white/55">
            <span className="text-emerald-400">●</span> {online} in {c.capital} with you. Everyone here shares one city; every player&apos;s posts are their own block.
          </p>
          <input className="mt-3 w-full rounded-xl bg-white/10 px-3 py-2 text-sm outline-none placeholder:text-white/40" placeholder="Find a handle" value={q} onChange={(e) => setQ(e.target.value)} />
          {target ? (
            <div className="mt-3">
              <button className="text-xs text-white/60 hover:text-white" onClick={() => setPick(null)}>
                ← All blocks
              </button>
              <p className="mt-1 font-semibold">@{target.handle}&apos;s block</p>
              <TravelPicker to={plotEntrance(target.slot).front} label={`@${target.handle}'s block`} />
            </div>
          ) : (
            <ul className="mt-3 space-y-1 overflow-y-auto pr-1">
              {list.map((p) => {
                const n = here.get(p.handle.toLowerCase()) ?? 0;
                const isMine = mine?.country === cm.country && mine.slot === p.slot;
                return (
                  <li key={p.slot}>
                    <button className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-white/10" onClick={() => setPick(p.handle)}>
                      {p.ownerAvatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.ownerAvatar} alt="" className="h-7 w-7 rounded-full" />
                      ) : (
                        <span className="h-7 w-7 rounded-full bg-white/10" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm">
                        @{p.handle}
                        {isMine && <span className="text-amber-300"> · you</span>}
                        {block === p.handle && <span className="text-white/50"> · you are here</span>}
                      </span>
                      {n > 0 && <span className="text-xs text-emerald-400">● online</span>}
                      <span className="num text-xs text-white/45">{p.shown}</span>
                    </button>
                  </li>
                );
              })}
              {list.length === 0 && <li className="text-sm text-white/50">Nobody by that name here.</li>}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
