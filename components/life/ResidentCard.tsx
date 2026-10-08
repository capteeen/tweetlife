'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorld, type ResidentMsg } from '@/components/world/store';
import { RESIDENTS, doingLabel, residentById } from '@/lib/life/residents';
import { placeVenues } from '@/lib/life/venues';
import { buildRoutes, poseAt } from '@/components/world/residentPaths';
import { SocialMenu } from './SocialMenu';
import { refreshLove } from './loveClient';
import type { SocialSend } from './useLife';

// Tap a named resident: who they are, what they're up to, and a conversation with them (AI, via
// /api/life/residents/chat). Their latest line also pops up over their head.

const STARTERS = ['How far? 👋', 'What\'s happening here?', 'Any gist?', 'How do I get more bags?'];

export function ResidentCard({ sendSocial }: { sendSocial: SocialSend }) {
  const id = useWorld((s) => s.selectedResident);
  const select = useWorld((s) => s.selectResident);
  const me = useWorld((s) => s.life?.me ?? null);
  const geometry = useWorld((s) => s.model?.geometry ?? null);
  const chat = useWorld((s) => (id ? s.residentChats[id] : undefined));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const r = id ? residentById(id) : null;

  const doing = useMemo(() => {
    if (!r || !geometry) return '';
    const venues = placeVenues(geometry.contentRadius, geometry.boundaryRadius, useWorld.getState().country);
    const route = buildRoutes(RESIDENTS, venues, geometry.contentRadius)[RESIDENTS.indexOf(r)];
    if (!route) return '';
    const p = poseAt(route, Date.now() / 1000);
    return doingLabel(p.stop, p.venue?.name ?? null);
  }, [r, geometry]);

  useEffect(() => {
    setErr(null);
    setText('');
  }, [id]);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [chat?.length, busy]);

  if (!r) return null;

  const send = async (say: string) => {
    const content = say.trim().slice(0, 400);
    if (!content || busy) return;
    const s = useWorld.getState();
    const mine: ResidentMsg = { role: 'user', content };
    s.pushResidentChat(r.id, mine);
    setText('');
    setBusy(true);
    setErr(null);
    try {
      const messages = [...(s.residentChats[r.id] ?? []), mine].slice(-10);
      const res = await fetch('/api/life/residents/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ residentId: r.id, doing, messages }),
      });
      const j = (await res.json().catch(() => ({}))) as { reply?: string; error?: string };
      if (!res.ok || !j.reply) throw new Error(j.error ?? 'They didn\'t catch that. Try again.');
      useWorld.getState().pushResidentChat(r.id, { role: 'assistant', content: j.reply });
      useWorld.getState().residentSay(r.id, j.reply.length > 90 ? j.reply.slice(0, 87).replace(/\s+\S*$/, '') + '…' : j.reply);
      // chatting builds affinity: refresh the bar
      refreshLove();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const first = r.name.replace(/^(Big|Coach|Uncle|DJ|Nurse) /, '');
  return (
    <div className="pointer-events-auto absolute bottom-20 left-1/2 z-30 flex max-h-[78vh] w-[min(94vw,520px)] -translate-x-1/2 flex-col overflow-y-auto rounded-3xl chrome p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-bold text-[#0B0E14]" style={{ background: r.look.shirt === '#0B0E14' ? '#FFD089' : r.look.shirt }}>
            {first[0]}
          </span>
          <div className="min-w-0">
            <div className="text-lg font-bold leading-tight">{r.name}</div>
            <div className="truncate text-sm text-white/60">
              {r.tag}
              {doing ? ` · ${doing}` : ''}
            </div>
          </div>
        </div>
        <button className="rounded-full px-2 py-0.5 hover:bg-white/10" onClick={() => select(null)} aria-label="Close">
          ✕
        </button>
      </div>

      <div ref={list} className="mt-3 flex max-h-[34vh] min-h-[3rem] flex-col gap-2 overflow-y-auto pr-1">
        {!chat?.length && <p className="text-sm text-white/50">Say hi to {first}.</p>}
        {chat?.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-snug ${m.role === 'user' ? 'self-end bg-x/90 text-white' : 'self-start bg-white/10'}`}
          >
            {m.content}
          </div>
        ))}
        {busy && <div className="self-start rounded-2xl bg-white/10 px-3 py-2 text-sm text-white/60">{first} is typing…</div>}
      </div>

      {!me ? (
        <p className="mt-3 text-sm text-white/60">Sign in with X to talk to {first}.</p>
      ) : (
        <>
          {!chat?.length && (
            <div className="mt-3 flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <button key={s} disabled={busy} onClick={() => send(s)} className="rounded-full bg-white/5 px-3 py-1.5 text-xs font-medium hover:bg-white/10 disabled:opacity-50">
                  {s}
                </button>
              ))}
            </div>
          )}
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={400}
              placeholder={`Talk to ${first}…`}
              className="min-w-0 flex-1 rounded-full bg-white/10 px-4 py-2 text-sm outline-none placeholder:text-white/40 focus:bg-white/15"
            />
            <button type="submit" disabled={busy || !text.trim()} className="rounded-full bg-x px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              Send
            </button>
          </form>
        </>
      )}
      {err && <p className="mt-2 text-xs text-rose-300">{err}</p>}
      {me && (
        <SocialMenu
          target={{ kind: 'resident', id: r.id, name: r.name }}
          sendSocial={sendSocial}
          say={(text, role: 'user' | 'assistant' = 'assistant') => {
            const s = useWorld.getState();
            s.pushResidentChat(r.id, { role, content: text });
            if (role === 'assistant') s.residentSay(r.id, text.length > 90 ? text.slice(0, 87).replace(/\s+\S*$/, '') + '…' : text);
          }}
        />
      )}
      <p className="mt-2 text-[10px] text-white/35">AI resident · replies are generated and may be made up</p>
    </div>
  );
}
