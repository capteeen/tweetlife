'use client';
import { useEffect } from 'react';
import { create } from 'zustand';
import { useWorld } from '@/components/world/store';
import { refreshLife, type SocialSend } from './useLife';
import { enterVenue } from './travel';
import { placeVenues } from '@/lib/life/venues';
import { dateById, type LoveState, type PersonRef, type RequestKind, type RequestView } from '@/lib/life/love';

// Client side of relationships: the state from /api/life/love, the actions, and a poll that turns new requests
// and answers into notices. Requests between players live on the server, so they reach you in any world or
// house; when you share a world the presence room also delivers them instantly.

type LoveStore = {
  state: LoveState | null;
  /** request ids already shown as a notice (incoming) or answer (outgoing) */
  seen: Set<string>;
  /** notices on screen: incoming requests and answers to mine */
  notices: RequestView[];
  set: (s: LoveState) => void;
  dismiss: (id: string) => void;
};

export const useLove = create<LoveStore>((set) => ({
  state: null,
  seen: new Set(),
  notices: [],
  set: (state) =>
    set((s) => {
      // first load: everything already there counts as seen, except requests still waiting on you
      const first = !s.state;
      const fresh = [...state.incoming, ...state.answered].filter((r) => !s.seen.has(r.id) && (!first || r.status === 'pending'));
      const seen = new Set(s.seen);
      for (const r of [...state.incoming, ...state.answered]) seen.add(r.id);
      // a notice for a request that is no longer waiting (answered elsewhere, expired) goes away
      const live = new Set([...state.incoming, ...state.answered].map((r) => r.id));
      return { state, seen, notices: [...s.notices.filter((n) => live.has(n.id)), ...fresh].slice(-4) };
    }),
  dismiss: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
}));

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) }, cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

let inflight: Promise<void> | null = null;
export function refreshLove() {
  inflight ??= (async () => {
    try {
      const s = await j<LoveState>('/api/life/love');
      useLove.getState().set(s);
      if (s.bonus) {
        useWorld.getState().pushToast(`💞 Your ${s.bonus.partners === 1 ? 'partner' : `${s.bonus.partners} partners`} lifted you: +${s.bonus.vibes} vibes, +${s.bonus.clout} clout`, 'love');
        refreshLife();
      }
    } catch {
      /* signed out or offline: keep what we have */
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Keep relationships fresh while playing: on load, every 20 seconds, and when the tab comes back. */
export function useLoveSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    refreshLove();
    const t = setInterval(refreshLove, 20_000);
    const vis = () => document.visibilityState === 'visible' && refreshLove();
    document.addEventListener('visibilitychange', vis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [enabled]);
}

export const nameOf = (p: PersonRef) => (p.kind === 'player' ? `@${p.handle}` : p.name);
/** Where someone's house is. */
export const houseUrl = (p: PersonRef) => (p.kind === 'player' ? `/home/${encodeURIComponent(p.handle)}` : `/home/r/${encodeURIComponent(p.id)}`);

export type AskTo = { handle: string } | { residentId: string };
export type AskResult = { ok: true; id: string; status: string; accepted: boolean | null; autoAccepted: boolean; reply: string | null; notice: { to: string; text: string } | null };

export const loveActions = {
  async ask(kind: RequestKind, to: AskTo, detail?: string, sendSocial?: SocialSend) {
    const r = await j<AskResult>('/api/life/love', { method: 'POST', body: JSON.stringify({ op: 'ask', kind, detail, ...('handle' in to ? { toHandle: to.handle } : { residentId: to.residentId }) }) });
    if (r.notice && sendSocial) sendSocial({ to: r.notice.to, kind: 'love', text: r.notice.text });
    await refreshLove();
    if (r.accepted && kind === 'outing') afterDate(detail ?? null);
    if (r.accepted) refreshLife();
    return r;
  },
  async respond(id: string, accept: boolean) {
    const r = await j<{ ok: true; kind: RequestKind; detail: string | null; passUntil: string | null }>('/api/life/love', { method: 'POST', body: JSON.stringify({ op: 'respond', id, accept }) });
    useLove.getState().dismiss(id);
    await refreshLove();
    if (accept) {
      refreshLife();
      if (r.kind === 'outing') afterDate(r.detail);
    }
    return r;
  },
  async cancel(id: string) {
    await j('/api/life/love', { method: 'POST', body: JSON.stringify({ op: 'cancel', id }) });
    await refreshLove();
  },
  async endVisit(id: string) {
    await j('/api/life/love', { method: 'POST', body: JSON.stringify({ op: 'endVisit', id }) });
    await refreshLove();
  },
  async breakUp(bondId: string) {
    await j('/api/life/love', { method: 'POST', body: JSON.stringify({ op: 'breakup', bondId }) });
    await refreshLove();
  },
};

/** A date just started: in the city, walk into the venue and (for dancing) hit the floor. */
export function afterDate(detail: string | null) {
  const d = dateById(detail);
  if (!d) return;
  const s = useWorld.getState();
  s.pushToast(`${d.emoji} Date on: ${d.label}`, 'love');
  const g = s.model?.geometry;
  if (!g || s.skyline) return;
  const v = placeVenues(g.contentRadius, g.boundaryRadius).find((x) => x.id === d.venue);
  if (!v) return;
  s.closePhone();
  enterVenue(v);
  if (d.act) {
    const act = d.act;
    const until = Date.now() + d.seconds * 1000;
    // once through the door (the walk in is a trip), start moving
    const t = setInterval(() => {
      const now = useWorld.getState();
      if (now.trip && Date.now() < until) return;
      clearInterval(t);
      if (Date.now() < until) now.setDoing({ id: act, until });
    }, 300);
  }
}
