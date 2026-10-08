'use client';
import { useEffect, useRef, useState } from 'react';
import PartySocket from 'partysocket';
import { useWorld, type Peer } from './store';
import { refreshLife } from '@/components/life/useLife';
import { refreshLove } from '@/components/life/loveClient';
import { ROSTER_MS } from '@/lib/world/country-map';
import type { CountryId } from '@/lib/world/countries';
import { onCrimeSignal } from '@/components/life/crime';

// Presence client. With a `country`, joins that country's shared room (everyone in the country, see
// party/world.ts): it first asks the base room which shard to use, preferring the one a friend is in (the
// owner of the block you came to visit, or the people in `friends`). Without one, the legacy per-world room.
// Sends position at 10Hz, receives nearby peers live and everyone else from the roster every few seconds.
// If presence isn't configured, `online` stays null (unknown, not 0).

const partyUrl = (host: string, room: string) => `${/^(localhost|127\.|0\.0\.0\.0)/.test(host) ? 'http' : 'https'}://${host}/parties/world/${encodeURIComponent(room)}`;

export function usePresence(handle: string, enabled: boolean, country?: CountryId | null, friends: string[] = []) {
  const [online, setOnline] = useState<number | null>(null);
  const sockRef = useRef<PartySocket | null>(null);
  const upsertPeer = useWorld((s) => s.upsertPeer);
  const dropPeer = useWorld((s) => s.dropPeer);
  const pushChat = useWorld((s) => s.pushChat);
  const pushToast = useWorld((s) => s.pushToast);
  // in a country the room doesn't change as you walk between blocks, so the block's handle is not a dependency
  const key = country ? `country:${country}` : `world:${handle}`;
  const friendKey = friends.join(',');

  useEffect(() => {
    if (!enabled) return;
    let sock: PartySocket | null = null;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    (async () => {
      const ticketUrl = country ? `/api/country/${country}/ticket` : `/api/world/${encodeURIComponent(handle)}/ticket`;
      const res = await fetch(ticketUrl).then((r) => r.json()).catch(() => null);
      if (cancelled || !res?.ticket || !res.host) return;
      let room: string = res.room;
      if (country) {
        // which shard: a friend's if one is here, else the first with room
        const want = [...new Set([...friends, useWorld.getState().block ?? ''].filter(Boolean).map((h) => h.toLowerCase()))];
        const pick = await fetch(`${partyUrl(res.host, res.room)}?where=${encodeURIComponent(want.join(','))}`)
          .then((r) => r.json())
          .catch(() => null);
        if (cancelled) return;
        if (typeof pick?.room === 'string' && pick.room.replace(/:\d+$/, '') === res.room) room = pick.room;
      }
      const connect = (room: string) => {
        sock = new PartySocket({ host: res.host, party: 'world', room, query: { ticket: res.ticket } });
        sockRef.current = sock;
        const peers = new Map<string, { id: string; handle: string }>();
        // when each peer last sent a live position: the roster only fills in people we don't hear from directly
        const live = new Map<string, number>();
        // your own id in the room (guests get a random one), so you are never drawn as somebody else
        let you: string | null = useWorld.getState().me?.id ?? null;
        sock.addEventListener('message', (ev) => {
          let m: { t: string; [k: string]: unknown };
          try {
            m = JSON.parse(String(ev.data));
          } catch {
            return;
          }
          if (m.t === 'hello') {
            if (typeof m.you === 'string') you = m.you;
            const list = (m.peers as { id: string; handle: string; x: number; z: number; yaw: number; ride?: string | null }[]).filter((p) => p.id !== you);
            for (const p of list) {
              peers.set(p.id, p);
              upsertPeer({ ...p, at: Date.now(), far: false });
            }
            setOnline(list.length + 1);
          } else if (m.t === 'join') {
            const p = m.peer as { id: string; handle: string; x: number; z: number; yaw: number; ride?: string | null };
            if (p.id === you) return;
            peers.set(p.id, p);
            upsertPeer({ ...p, at: Date.now(), far: false });
            setOnline(peers.size + 1);
          } else if (m.t === 'pos') {
            const p = peers.get(m.id as string);
            live.set(m.id as string, Date.now());
            if (p) upsertPeer({ id: p.id, handle: p.handle, x: m.x as number, z: m.z as number, yaw: m.yaw as number, ride: (m.ride as string | null) ?? null, act: (m.act as Peer['act']) ?? null, at: Date.now(), far: false });
          } else if (m.t === 'roster') {
            const list = m.peers as [string, string, number, number][];
            const here = new Set<string>();
            for (const [id, h, x, z] of list) {
              if (id === you) continue;
              here.add(id);
              if (!peers.has(id)) peers.set(id, { id, handle: h });
              // out of the interest radius: a rough position, enough for the map and the directory
              if (Date.now() - (live.get(id) ?? 0) > ROSTER_MS / 2) upsertPeer({ id, handle: h, x, z, yaw: 0, at: Date.now(), far: true });
            }
            for (const id of [...peers.keys()]) {
              if (here.has(id)) continue;
              peers.delete(id);
              dropPeer(id);
            }
            setOnline(here.size + 1);
          } else if (m.t === 'leave') {
            peers.delete(m.id as string);
            dropPeer(m.id as string);
            setOnline(peers.size + 1);
          } else if (m.t === 'social') {
            pushToast(String(m.text), String(m.kind));
            refreshLife();
            // a request or an answer from someone in this world: show it now rather than on the next poll
            if (m.kind === 'love') refreshLove();
            // someone robbed, jumped or reported you (components/life/crime.ts)
            if (m.kind === 'crime' || m.kind === 'arrest') onCrimeSignal({ kind: String(m.kind), from: String(m.from ?? ''), delta: m.delta });
          } else if (m.t === 'chat') {
            pushChat({ id: m.id as string, from: m.from as string, text: m.text as string, at: m.at as number, x: m.x as number, z: m.z as number });
          } else if (m.t === 'full' && typeof m.next === 'string') {
            // this room filled up: the next shard (or legacy mirror)
            sock?.close();
            connect(m.next);
          }
        });
        if (timer) clearInterval(timer);
        timer = setInterval(() => {
          const st = useWorld.getState();
          const { x, z, yaw } = st.playerPos;
          if (sock?.readyState === 1) sock.send(JSON.stringify({ t: 'pos', x, z, yaw, ride: st.riding?.id ?? null, act: st.doing?.id ?? (st.shift && !st.trip ? st.shift.act : null) }));
        }, 100);
      };
      connect(room);
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      sock?.close();
      sockRef.current = null;
      // the people you leave behind (a flight to another country) stop being drawn
      for (const id of Object.keys(useWorld.getState().peers)) dropPeer(id);
      setOnline(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, friendKey, enabled, upsertPeer, dropPeer, pushChat, pushToast]);

  const sendChat = (text: string) => {
    const s = sockRef.current;
    if (s && s.readyState === 1) s.send(JSON.stringify({ t: 'chat', text }));
  };
  /** Deliver a social toast to one visitor (`to`) or to everyone within earshot. No-op without presence. */
  const sendSocial = (m: { to?: string; kind: string; text: string; delta?: unknown }) => {
    const s = sockRef.current;
    if (s && s.readyState === 1) s.send(JSON.stringify({ t: 'social', ...m }));
  };
  return { online, sendChat, sendSocial, connected: !!sockRef.current };
}
