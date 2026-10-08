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
import { SHIFTS_PER_DAY, SHIFT_COST, SHIFT_SECONDS, jobsAt, levelOf, wageFor, type Job } from '@/lib/life/jobs';
import { jobActions } from './jobs';

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
  if (!venue) return null;

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
      setMsg(`${a.emoji} ${statDelta(a.me)}.${a.nearby ? ` ${r.lifted ? `${r.lifted} ${r.lifted === 1 ? 'person' : 'people'} nearby felt it too.` : 'Nobody else is here yet, so the room was all yours. Bring friends next time.'}` : ''}`);
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
              disabled={!here || busy !== null || (a.bags > 0 && me.bags < a.bags)}
              onClick={() => act(a.id)}
              className="flex items-start gap-3 rounded-2xl bg-white/5 px-3 py-2.5 text-left transition hover:bg-white/10 disabled:opacity-50"
            >
              <span className="text-xl leading-none">{a.emoji}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{a.label}</span>
                <span className="block text-[11px] text-white/55">
                  {a.bags > 0 ? `${a.bags} bags · ` : a.bags < 0 ? `earn ${-a.bags} bags · ` : 'free · '}
                  {fmt(a.me)}
                  {a.nearby ? ` · nearby ${fmt(a.nearby)}` : ''}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      {me && <WorkHere venueId={venue.id} here={here} gas={me.gas} />}
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

/** Jobs at this venue: start your shift if you work here, or see who's hiring. The Hustle Hub has the whole board. */
function WorkHere({ venueId, here, gas }: { venueId: string; here: boolean; gas: number }) {
  const board = useWorld((s) => s.jobs);
  const openPhone = useWorld((s) => s.openPhone);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const jobs = jobsAt(venueId);
  if (!jobs.length && venueId !== 'hustle') return null;
  const start = async (job: Job) => {
    setBusy(true);
    setErr(null);
    try {
      await jobActions.start(job);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const today = board?.shiftsToday ?? 0;
  return (
    <div className="mt-4 rounded-2xl bg-white/5 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-white/50">Work</span>
        {venueId === 'hustle' && (
          <button className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold hover:bg-white/20" onClick={() => openPhone('jobs')}>
            📋 Job board
          </button>
        )}
      </div>
      {venueId === 'hustle' && !board?.current && <p className="mt-1.5 text-xs text-white/60">Every job in town is on the board. Apply, then work shifts at the workplace.</p>}
      {jobs.map((j) => {
        const mine = board?.current === j.id;
        const rec = board?.records.find((r) => r.jobId === j.id);
        const level = levelOf(rec?.shifts ?? 0);
        if (!mine) {
          return (
            <button key={j.id} className="mt-2 flex w-full items-center gap-3 rounded-xl bg-white/5 px-3 py-2 text-left hover:bg-white/10" onClick={() => openPhone('jobs', null, j.id)}>
              <span className="text-xl">{j.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Hiring: {j.title}</span>
                <span className="block text-[11px] text-white/55">{wageFor(j, level)} bags a shift · tap to apply</span>
              </span>
            </button>
          );
        }
        const tired = gas + (SHIFT_COST.gas ?? 0) < 0;
        const full = today >= SHIFTS_PER_DAY;
        const why = !here ? 'Get here to clock in.' : full ? `That’s ${SHIFTS_PER_DAY} shifts today. Back tomorrow.` : tired ? 'Too tired to work. Eat or rest first.' : null;
        return (
          <div key={j.id} className="mt-2">
            <button
              disabled={busy || !!why}
              onClick={() => start(j)}
              className="flex w-full items-center gap-3 rounded-xl bg-emerald-400 px-3 py-2.5 text-left text-[#0B0E14] transition hover:bg-emerald-300 disabled:bg-white/10 disabled:text-white/60"
            >
              <span className="text-xl">{j.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">Start your shift · {j.levels[level - 1]}</span>
                <span className="block text-[11px] opacity-75">
                  {SHIFT_SECONDS}s · up to {wageFor(j, level)} bags · {statDelta(SHIFT_COST)} · {today}/{SHIFTS_PER_DAY} today
                </span>
              </span>
            </button>
            {why && <p className="mt-1 text-[11px] text-white/50">{why}</p>}
          </div>
        );
      })}
      {err && <p className="mt-2 text-xs text-amber-300">{err}</p>}
    </div>
  );
}
