'use client';
import { useEffect } from 'react';
import { useWorld, type Incident } from '@/components/world/store';
import { FIGHT_SECONDS, NPC_THEFT_CHECK_S, type CrimeRecord } from '@/lib/life/crimeRules';
import { refreshLife, type SocialSend } from './useLife';
import { residentPos } from '@/components/world/CityResidents';

// Client side of crime and police: call the server (app/api/life/crime), play what it decided (the swing, the
// daze, the arrest), and keep the record and the victim's incidents fresh. Nothing here decides an outcome.

type Target = { kind: 'player'; handle: string } | { kind: 'resident'; id: string; name?: string };
type Arrest = { arrested: boolean; offender?: string; cellSeconds?: number; bail?: number; returned?: number; called?: boolean };

async function j<T>(body?: object): Promise<T> {
  const res = await fetch('/api/life/crime', body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' } : { cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

/** the presence room you're in: your country's shared room, or a single world (lib/life/crime.ts worldCtx) */
const roomKey = () => {
  const s = useWorld.getState();
  return s.countryMap ? `country:${s.country}` : s.model?.handle ?? '';
};

function applyRecord(record: CrimeRecord | null | undefined, bags?: number) {
  const s = useWorld.getState();
  if (record) s.patchRecord(record);
  if (typeof bags === 'number') s.patchMe({ bags });
}

export async function refreshCrime() {
  const r = await j<{ record: CrimeRecord; incidents: Incident[] }>().catch(() => null);
  if (!r) return;
  applyRecord(r.record);
  useWorld.getState().setIncidents(r.incidents);
}

/** Play a fight on your own avatar: the swing, then (if you lost) sitting dazed until the server says. */
export function playFight(lost: boolean, dazedUntil: string | null, face?: { x: number; z: number } | null) {
  const s = useWorld.getState();
  s.setDoing({ id: 'fight', until: Date.now() + FIGHT_SECONDS * 1000, face: face ?? undefined });
  if (!lost) return;
  setTimeout(() => {
    const until = dazedUntil ? Date.parse(dazedUntil) : Date.now() + 30_000;
    useWorld.getState().setDoing({ id: 'dazed', until, face: face ?? undefined });
  }, FIGHT_SECONDS * 1000);
}

function policeLine(p: Arrest, victim: string) {
  if (!p.called) return '';
  return p.arrested ? ` ${victim} called the cops and you got arrested.` : ` ${victim} called the cops, but they couldn't make it stick. That's a star on your record.`;
}

export const crimeActions = {
  async steal(t: Target, sendSocial: SocialSend) {
    // the dip plays while the server decides
    const face = whereIs(t);
    useWorld.getState().setDoing({ id: 'pickpocket', until: Date.now() + 2000, face: face ?? undefined });
    const r = await j<{ outcome: 'stolen' | 'caught'; amount: number; target: string; police: Arrest; toast: { to: string; kind: string; text: string } | null; record: CrimeRecord; bags: number }>({
      op: 'steal', world: roomKey(), target: t.kind === 'player' ? { kind: 'player', handle: t.handle } : { kind: 'resident', id: t.id },
    }).catch((e) => {
      useWorld.getState().setDoing(null);
      throw e;
    });
    if (r.toast) sendSocial(r.toast);
    applyRecord(r.record, r.bags);
    const line = r.outcome === 'stolen' ? `🫳 You lifted ${r.amount} bags from ${r.target}.` : `🚨 ${r.target} caught you red-handed. −5 clout and a wanted star.`;
    useWorld.getState().pushToast(line + policeLine(r.police, r.target), 'crime');
    if (r.police.arrested) await refreshLife();
    return r;
  },
  async fight(t: Target, sendSocial: SocialSend) {
    const r = await j<{ outcome: 'won' | 'lost'; target: string; police: Arrest; toast: { to: string; kind: string; text: string; delta: unknown } | null; record: CrimeRecord; dazedSeconds: number }>({
      op: 'fight', world: roomKey(), target: t.kind === 'player' ? { kind: 'player', handle: t.handle } : { kind: 'resident', id: t.id },
    });
    if (r.toast) sendSocial(r.toast);
    applyRecord(r.record);
    const s = useWorld.getState();
    playFight(r.outcome === 'lost', r.record.dazedUntil, whereIs(t));
    s.pushToast((r.outcome === 'won' ? `🥊 You beat ${r.target}. +5 clout.` : `🥊 ${r.target} put you down. You're dazed for ${r.dazedSeconds}s.`) + policeLine(r.police, r.target), 'crime');
    // the other player plays the same fight on their side when the presence message lands
    refreshLife();
    return r;
  },
  async report(incident: Incident, how: 'police' | 'complaint' | 'drop', sendSocial: SocialSend) {
    const r = await j<{ result: 'arrested' | 'escaped' | 'filed' | 'dropped'; text: string; toast: { to: string; kind: string; text: string } | null; record: CrimeRecord; bags: number }>({ op: 'report', crimeId: incident.id, how });
    if (r.toast) sendSocial(r.toast);
    const s = useWorld.getState();
    s.setIncidents(s.incidents.filter((i) => i.id !== incident.id));
    applyRecord(r.record, r.bags);
    if (r.result === 'arrested') {
      // an officer walks up to them where they stand (a player nearby, or the resident who did it)
      const peer = Object.values(s.peers).find((p) => `@${p.handle}`.toLowerCase() === incident.offender.toLowerCase());
      if (peer) s.setArrestFx({ at: Date.now(), x: peer.x, z: peer.z, who: peer.handle, text: r.text });
    }
    s.pushToast(r.text, 'crime');
    return r;
  },
  async bail() {
    const r = await j<{ paid: number; record: CrimeRecord; bags: number }>({ op: 'bail' });
    applyRecord(r.record, r.bags);
    useWorld.getState().pushToast(`🔓 Bail paid: ${r.paid} bags. You're free to go.`, 'crime');
    return r;
  },
  async peaceful(on: boolean) {
    const r = await j<{ record: CrimeRecord }>({ op: 'peaceful', on });
    applyRecord(r.record);
    useWorld.getState().pushToast(on ? "🕊️ Peaceful mode is on for at least 24 hours. Nobody can rob or fight you, and you can't either." : '🕊️ Peaceful mode is off.', 'crime');
    return r;
  },
};

/** Where a player or resident is standing right now, as this client sees them. */
function whereIs(t: Target) {
  const s = useWorld.getState();
  if (t.kind === 'resident') return residentPos.get(t.id) ?? null;
  const p = Object.values(s.peers).find((x) => x.handle.toLowerCase() === t.handle.toLowerCase());
  return p ? { x: p.x, z: p.z } : null;
}

/** A crime or arrest message from another player over presence (party/world.ts). */
export function onCrimeSignal(m: { kind: string; from?: string; delta?: unknown }) {
  if (m.kind === 'crime') {
    const d = m.delta as { fight?: 'won' | 'lost' } | null;
    const face = m.from ? whereIs({ kind: 'player', handle: m.from }) : null;
    if (d?.fight) refreshCrime().then(() => playFight(d.fight === 'lost', useWorld.getState().life?.me?.record?.dazedUntil ?? null, face));
    else refreshCrime();
  }
  if (m.kind === 'arrest') refreshLife().then(refreshCrime);
}

/**
 * Keep the record and incidents fresh while you're in the world; check in now and then so a resident can pick your
 * pocket (the server decides if and how much); and when a cell starts, play the arrest.
 */
export function useCrime(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    refreshCrime();
    const poll = setInterval(() => !document.hidden && refreshCrime(), 20_000);
    const tick = setInterval(async () => {
      if (document.hidden || !roomKey()) return;
      const r = await j<{ incident: { id: string; offender: string; amount: number } | null; record: CrimeRecord; bags: number }>({ op: 'tick', world: roomKey() }).catch(() => null);
      if (!r?.incident) return;
      applyRecord(r.record, r.bags);
      useWorld.getState().pushToast(`🫳 ${r.incident.offender} just picked your pocket: −${r.incident.amount} bags.`, 'crime');
      refreshCrime();
    }, NPC_THEFT_CHECK_S * 1000);
    // a cell just started: an officer cuffs you where you stand, then you're in the cell
    let jailed = useWorld.getState().life?.me?.record?.jailedUntil ?? null;
    const unsub = useWorld.subscribe((s) => {
      const next = s.life?.me?.record?.jailedUntil ?? null;
      const prev = jailed;
      jailed = next; // before the setters below, which call back in here
      if (next && next !== prev && Date.parse(next) > Date.now()) {
        const p = s.playerPos;
        s.setArrestFx({ at: Date.now(), x: p.x, z: p.z, who: 'me', text: s.life?.me?.record?.jailFor ?? "You're under arrest." });
        s.setDoing({ id: 'cuffed', until: Date.now() + ARREST_FX_MS });
      }
    });
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      unsub();
    };
  }, [enabled]);
}

/** how long the cuffing plays before the cell */
export const ARREST_FX_MS = 3500;
