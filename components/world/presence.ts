'use client';
import { useEffect, useRef, useState } from 'react';
import PartySocket from 'partysocket';
import { useWorld } from './store';

// Presence client. Joins the world's PartyKit room with a signed ticket, sends position at 10Hz,
// receives peers and proximity chat. If presence isn't configured, `online` stays null (unknown, not 0).

export function usePresence(handle: string, enabled: boolean) {
  const [online, setOnline] = useState<number | null>(null);
  const sockRef = useRef<PartySocket | null>(null);
  const upsertPeer = useWorld((s) => s.upsertPeer);
  const dropPeer = useWorld((s) => s.dropPeer);
  const pushChat = useWorld((s) => s.pushChat);

  useEffect(() => {
    if (!enabled) return;
    let sock: PartySocket | null = null;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    (async () => {
      const res = await fetch(`/api/world/${encodeURIComponent(handle)}/ticket`).then((r) => r.json()).catch(() => null);
      if (cancelled || !res?.ticket || !res.host) return;
      const connect = (room: string) => {
        sock = new PartySocket({ host: res.host, party: 'world', room, query: { ticket: res.ticket } });
        sockRef.current = sock;
        const peers = new Map<string, { id: string; handle: string }>();
        sock.addEventListener('message', (ev) => {
          let m: { t: string; [k: string]: unknown };
          try {
            m = JSON.parse(String(ev.data));
          } catch {
            return;
          }
          if (m.t === 'hello') {
            const list = m.peers as { id: string; handle: string; x: number; z: number; yaw: number }[];
            for (const p of list) {
              peers.set(p.id, p);
              upsertPeer({ ...p, at: Date.now() });
            }
            setOnline(list.length);
          } else if (m.t === 'join') {
            const p = m.peer as { id: string; handle: string; x: number; z: number; yaw: number };
            peers.set(p.id, p);
            upsertPeer({ ...p, at: Date.now() });
            setOnline(peers.size);
          } else if (m.t === 'pos') {
            const p = peers.get(m.id as string);
            if (p) upsertPeer({ id: p.id, handle: p.handle, x: m.x as number, z: m.z as number, yaw: m.yaw as number, at: Date.now() });
          } else if (m.t === 'leave') {
            peers.delete(m.id as string);
            dropPeer(m.id as string);
            setOnline(peers.size);
          } else if (m.t === 'chat') {
            pushChat({ id: m.id as string, from: m.from as string, text: m.text as string, at: m.at as number, x: m.x as number, z: m.z as number });
          } else if (m.t === 'full' && typeof m.next === 'string') {
            // mirrored instance beyond 50 visitors
            sock?.close();
            connect(m.next);
          }
        });
        timer = setInterval(() => {
          const { x, z, yaw } = useWorld.getState().playerPos;
          if (sock?.readyState === 1) sock.send(JSON.stringify({ t: 'pos', x, z, yaw }));
        }, 100);
      };
      connect(res.room);
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      sock?.close();
      sockRef.current = null;
    };
  }, [handle, enabled, upsertPeer, dropPeer, pushChat]);

  const sendChat = (text: string) => {
    const s = sockRef.current;
    if (s && s.readyState === 1) s.send(JSON.stringify({ t: 'chat', text }));
  };
  return { online, sendChat, connected: !!sockRef.current };
}
