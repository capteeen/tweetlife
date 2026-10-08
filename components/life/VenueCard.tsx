'use client';
import { useState } from 'react';
import { useWorld } from '@/components/world/store';
import { lifeActions, type SocialSend } from './useLife';
import { TravelPicker } from './TravelPicker';
import { CoinCounter } from './CoinCounter';
import { Departures } from './Departures';
import { airportLayout, inRect } from '@/lib/world/layout';
import type { PlacedVenue } from '@/lib/life/venues';
import { statDelta } from '@/lib/life/statNames';
import { citizenOf, curfew, governmentOf, pct, todaysAddress } from '@/lib/life/government';
import { COUNTRIES } from '@/lib/world/countries';
import { useCountry } from '@/components/world/country';
import { SuggestionBox } from './SuggestionBox';

/** Where a ride drops you for a venue: on its plaza, in front of the door (the terminal kerb for the airport). */
export function venueDoor(v: PlacedVenue, contentRadius: number, boundaryRadius: number) {
  if (v.id === 'airport') return airportLayout(contentRadius, boundaryRadius).kerb;
  const r = Math.hypot(v.x, v.z) || 1;
  const k = (r - v.d / 2 - 3.5) / r;
  return { x: v.x * k, z: v.z * k };
}

/** Within this distance of a venue's walls you are "here" and can use it. */
export const HERE = 12;

// A venue's sheet: who is here, its actions (with cost, effect and cooldown) or the app it opens, and when
// you are elsewhere, the rides that get you there.
export function VenueCard({ sendSocial }: { sendSocial: SocialSend }) {
  const venue = useWorld((s) => s.selectedVenue);
  const selectVenue = useWorld((s) => s.selectVenue);
  const openPhone = useWorld((s) => s.openPhone);
  const me = useWorld((s) => s.life?.me ?? null);
  const peers = useWorld((s) => s.peers);
  const playerPos = useWorld((s) => s.playerPos);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const geometry = useWorld((s) => s.model?.geometry);
  const selectPeer = useWorld((s) => s.selectPeer);
  const doing = useWorld((s) => s.doing);
  const [peek, setPeek] = useState(false);
  const country = useCountry();
  if (!venue) return null;
  const gov = governmentOf(country);
  const capitol = venue.id === 'capitol';
  const closed = capitol && curfew().on;
  const citizen = !!me && citizenOf(me) === country;
  // what an action actually pays or costs here, after the country's rules
  const bagsFor = (a: { id: string; bags: number }) =>
    capitol && a.id === 'stipend' ? -gov.rules.stipend : venue.id === 'hustle' && a.id === 'shift' ? Math.round(a.bags * (1 + gov.rules.shiftBonus)) : a.bags;

  const gap = (p: { x: number; z: number }) => Math.hypot(Math.max(0, Math.abs(p.x - venue.x) - venue.w / 2), Math.max(0, Math.abs(p.z - venue.z) - venue.d / 2));
  const island = venue.id === 'airport' && geometry ? airportLayout(geometry.contentRadius, geometry.boundaryRadius).island : null;
  const here = island ? inRect(island, playerPos.x, playerPos.z) : gap(playerPos) < HERE;
  const hereNow = Object.values(peers).filter((p) => (island ? inRect(island, p.x, p.z) : gap(p) < HERE));
  const door = geometry ? venueDoor(venue, geometry.contentRadius, geometry.boundaryRadius) : null;

  const nearby = Object.values(peers).filter((p) => Math.hypot(p.x - playerPos.x, p.z - playerPos.z) < 16).map((p) => p.handle);
  const fmt = (d: Partial<{ vibes: number; clout: number; gas: number }>) => statDelta(d);

  const act = async (actionId: string) => {
    setBusy(actionId);
    setMsg(null);
    try {
      const r = await lifeActions.venue(venue.id, actionId, nearby, sendSocial);
      setPeek(false);
      const a = venue.actions.find((x) => x.id === actionId)!;
      // play the move that goes with it (dancing at the club, push-ups at the gym...)
      if (a.act) useWorld.getState().setDoing({ id: a.act, until: Date.now() + (a.actSeconds ?? 8) * 1000 });
      const got = (r as { bags?: number }).bags ?? 0;
      setMsg(`${a.emoji} ${[got > 0 ? `+${got} bags` : '', statDelta(a.me)].filter(Boolean).join(', ')}.${a.nearby ? ` ${r.lifted ? `${r.lifted} ${r.lifted === 1 ? 'person' : 'people'} nearby felt it too.` : 'Nobody else is here yet, so the room was all yours. Bring friends next time.'}` : ''}`);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  // while a move plays (dancing at the club, lifting at the gym), shrink to a strip so you can watch yourself
  const moving = !!doing && doing.until > Date.now() && !peek;
  if (moving) {
    return (
      <div className="pointer-events-auto absolute bottom-20 left-1/2 z-30 flex w-[min(94vw,420px)] -translate-x-1/2 items-center gap-3 rounded-full chrome px-4 py-2 text-sm">
        <span className="text-lg leading-none">{venue.emoji}</span>
        <span className="min-w-0 flex-1 truncate">
          <span className="font-semibold">{venue.name}</span>
          {msg && <span className="text-white/60"> · {msg}</span>}
        </span>
        <button className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold hover:bg-white/20" onClick={() => setPeek(true)}>
          Menu
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto absolute bottom-20 left-1/2 z-30 max-h-[calc(100vh-7rem)] w-[min(94vw,580px)] -translate-x-1/2 overflow-y-auto rounded-3xl chrome p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl text-2xl" style={{ background: venue.color + '33' }}>
            {venue.emoji}
          </span>
          <div>
            <div className="text-lg font-bold leading-tight">{venue.name}</div>
            <div className="text-xs font-medium text-white/45">{venue.district}</div>
            <div className="text-sm text-white/60">{venue.blurb}</div>
          </div>
        </div>
        <button className="rounded-full px-2 py-0.5 hover:bg-white/10" onClick={() => selectVenue(null)} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="mt-3">
        <div className="text-xs text-white/55">Here now</div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {here && me && <span className="rounded-full bg-x/25 px-2.5 py-1 text-xs font-semibold">You</span>}
          {hereNow.map((p) => (
            <button key={p.id} className="rounded-full bg-white/10 px-2.5 py-1 text-xs hover:bg-white/20" onClick={() => selectPeer(p)}>
              @{p.handle}
            </button>
          ))}
          {!hereNow.length && !(here && me) && <span className="text-xs text-white/40">Nobody right now.</span>}
        </div>
      </div>
      {capitol && <Government country={country} closed={closed} />}
      {!me ? (
        <p className="mt-3 text-sm text-white/60">Sign in with X to use the city.</p>
      ) : (
        <div className={`mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 ${here ? '' : 'opacity-60'}`}>
          {venue.app && (
            <button className="btn !justify-start !rounded-2xl !py-3" onClick={() => openPhone(venue.app === 'market' ? 'market' : venue.app!, venue.marketKind ?? null)}>
              {venue.app === 'wallet' ? '🏦 Open the bank' : venue.app === 'trenches' ? '📈 Ape with real SOL (phone)' : `${venue.emoji} Browse ${venue.marketKind === 'car' ? 'cars' : venue.marketKind === 'boat' ? 'boats' : 'aircraft'}`}
            </button>
          )}
          {venue.actions.map((a) => (
            <button
              key={a.id}
              disabled={!here || busy !== null || closed || (capitol && a.id === 'stipend' && !citizen) || (bagsFor(a) > 0 && me.bags < bagsFor(a))}
              onClick={() => act(a.id)}
              className="flex items-start gap-3 rounded-2xl bg-white/5 px-3 py-2.5 text-left transition hover:bg-white/10 disabled:opacity-50"
            >
              <span className="text-xl leading-none">{a.emoji}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{a.label}</span>
                <span className="block text-[11px] text-white/55">
                  {bagsFor(a) > 0 ? `${bagsFor(a)} bags · ` : bagsFor(a) < 0 ? `earn ${-bagsFor(a)} bags${capitol && a.id === 'stipend' ? ` · once a day · ${citizen ? 'you qualify' : `${COUNTRIES[country].demonym}s only`}` : ''}` : 'free · '}
                  {fmt(a.me)}
                  {a.nearby ? ` · nearby ${fmt(a.nearby)}` : ''}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      {me && here && venue.id === 'exchange' && <CoinCounter />}
      {me && !here && venue.id === 'exchange' && <p className="mt-2 text-xs text-white/50">Get to the counter to buy coins with bags.</p>}
      {me && !here && venue.actions.length > 0 && <p className="mt-2 text-xs text-white/50">Get there to do any of these.</p>}
      {msg && <p className="mt-2 text-xs text-white/70">{msg}</p>}
      {venue.id === 'airport' && (
        <div className="mt-4">
          <Departures mode="info" />
        </div>
      )}
      {!here && door && <TravelPicker to={door} label={venue.name} />}
    </div>
  );
}

/** The government panel on the government house sheet: today's address and the national rules. */
function Government({ country, closed }: { country: ReturnType<typeof useCountry>; closed: boolean }) {
  const c = COUNTRIES[country];
  const g = governmentOf(country);
  const a = todaysAddress(country);
  return (
    <div className="mt-3 rounded-2xl p-3" style={{ background: `linear-gradient(135deg, ${c.theme.gradient[0]}33, ${c.theme.gradient[1]}22)` }}>
      <div className="text-xs font-semibold uppercase tracking-wide text-white/60">Today&apos;s address · President {c.president}</div>
      <p className="mt-1 text-sm leading-snug">&ldquo;{a.text}&rdquo;</p>
      <div className="mt-2.5 text-xs font-semibold uppercase tracking-wide text-white/60">National rules of {c.name}</div>
      <ul className="mt-1 space-y-0.5 text-xs text-white/80">
        <li>🪙 {pct(g.rules.tradeTax)} tax on Coin Shop sales</li>
        <li>🪪 {g.rules.stipend} bags a day for every {c.demonym}</li>
        <li>⭐ {g.rules.perk}</li>
        <li>🌙 Curfew: the house closes while NEPA has taken light</li>
      </ul>
      {closed && <p className="mt-2 text-xs font-semibold text-amber-200">Curfew is on. NEPA has taken light, so the house is closed until it comes back.</p>}
      <div className="mt-3 border-t border-white/10 pt-3">
        <SuggestionBox country={country} compact />
      </div>
    </div>
  );
}
