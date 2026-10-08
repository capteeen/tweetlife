'use client';
import { useState } from 'react';
import { compact, relativeTime } from '@/lib/format';
void relativeTime;
import type { WorldModel } from '@/lib/world/load';
import { useWorld } from './store';
import { COUNTRIES } from '@/lib/world/countries';

// Bottom bar: owner, visitors online, lanterns lit, Guestbook, Share. Plus the guestbook and chat panels.

export function HUD({
  model,
  online,
  canAct,
  sendChat,
  chatAvailable,
}: {
  model: WorldModel;
  online: number | null;
  canAct: boolean;
  sendChat: (t: string) => void;
  chatAvailable: boolean;
}) {
  const lanterns = model.geometry.structures.reduce((a, s) => a + s.lanternsLit, 0);
  const guestbookOpen = useWorld((s) => s.guestbookOpen);
  const setGuestbookOpen = useWorld((s) => s.setGuestbookOpen);
  const chatOpen = useWorld((s) => s.chatOpen);
  const setChatOpen = useWorld((s) => s.setChatOpen);
  const openPhone = useWorld((s) => s.openPhone);
  const [shared, setShared] = useState(false);
  const country = useWorld((s) => s.country);
  const rect = useWorld((s) => (s.block ? s.countryMap?.plots.find((p) => p.handle === s.block)?.rect ?? null : null));
  // Capital Square on a country map: nobody's block
  const square = !model.handle;

  const share = async () => {
    const url = square ? `${location.origin}/c/${country}` : `${location.origin}/w/${model.handle}`;
    const text = square ? `Come hang out in ${COUNTRIES[country].capital} on TweetLife.` : `Walk around @${model.handle}'s block on TweetLife — ${model.structureCount} posts, built from the real timeline.`;
    if (navigator.share) {
      await navigator.share({ title: square ? COUNTRIES[country].capital : `@${model.handle}'s block`, text, url }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url).catch(() => {});
      setShared(true);
      setTimeout(() => setShared(false), 1500);
    }
  };

  return (
    <>
      <div className="pointer-events-auto absolute inset-x-3 bottom-3 z-20 flex items-center gap-2 rounded-2xl chrome px-3 py-2 text-sm">
        {square ? (
          <span className="flex min-w-0 items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={COUNTRIES[country].logo} alt="" className="h-7 w-7 rounded-full bg-white/10 p-1" />
            <span className="truncate font-medium">
              Capital Square<span className="hidden font-normal text-white/55 min-[480px]:inline"> · {COUNTRIES[country].capital}</span>
            </span>
          </span>
        ) : (
        <a href={`https://x.com/${model.handle}`} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-2">
          {model.ownerAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={model.ownerAvatar} alt="" className="h-7 w-7 rounded-full" />
          ) : (
            <span className="h-7 w-7 rounded-full bg-white/10" />
          )}
          <span className="truncate font-medium">
            @{model.handle}
            <span className="hidden font-normal text-white/55 min-[480px]:inline">{rect ? "'s block" : "'s world"}</span>
          </span>
        </a>
        )}
        <span className="num ml-auto hidden text-white/60 sm:inline" title="Structures">
          {model.structureCount} posts
        </span>
        {/* on phones only what means something gets a spot: people here once presence is up, nothing else */}
        <span className={`num whitespace-nowrap text-white/60 ${online == null ? 'hidden sm:inline' : ''}`} title="Visitors online">
          <span className="text-emerald-400">●</span> {online == null ? '—' : online}
          <span className="sm:hidden"> here</span>
        </span>
        <span className="num hidden text-white/60 sm:inline" title="Lanterns lit">
          <span style={{ color: '#FFD089' }}>✦</span> {compact(lanterns)} lit
        </span>
        <span className="flex-1 sm:hidden" />
        <button className="btn-ghost !px-3 !py-1.5" onClick={() => openPhone('home')} title="Phone">
          📱 Phone
        </button>
        {!square && (
          <button className="btn-ghost !px-3 !py-1.5 max-sm:!hidden" onClick={() => setGuestbookOpen(!guestbookOpen)}>
            Guestbook
          </button>
        )}
        {chatAvailable && (
          <button className="btn-ghost !px-3 !py-1.5" onClick={() => setChatOpen(!chatOpen)}>
            Chat
          </button>
        )}
        <button className="btn !px-3 !py-1.5" onClick={share}>
          {shared ? 'Copied' : 'Share'}
        </button>
      </div>
      {guestbookOpen && !square && <Guestbook model={model} canAct={canAct} offset={rect} />}
      {chatOpen && chatAvailable && <Chat sendChat={sendChat} />}
    </>
  );
}

/** `offset`: the block's centre on a country map. Stones are stored relative to it and drawn in the country frame. */
function Guestbook({ model, canAct, offset }: { model: WorldModel; canAct: boolean; offset: { x: number; z: number } | null }) {
  const me = useWorld((s) => s.me);
  const playerPos = useWorld((s) => s.playerPos);
  const addMark = useWorld((s) => s.addMark);
  const clearMarks = useWorld((s) => s.clearMarks);
  const setOpen = useWorld((s) => s.setGuestbookOpen);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const leave = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/world/${encodeURIComponent(model.handle)}/marks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, x: playerPos.x - (offset?.x ?? 0), z: playerPos.z - (offset?.z ?? 0) }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'failed');
      addMark({ ...j.mark, x: j.mark.x + (offset?.x ?? 0), z: j.mark.z + (offset?.z ?? 0) });
      setText('');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const clear = async (id?: string) => {
    const res = await fetch(`/api/world/${encodeURIComponent(model.handle)}/marks${id ? `?id=${id}` : ''}`, { method: 'DELETE' });
    if (res.ok) clearMarks(id);
  };

  return (
    <div className="pointer-events-auto absolute bottom-16 right-3 z-20 flex max-h-[60vh] w-[min(92vw,360px)] flex-col rounded-2xl chrome p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold">Guestbook</h3>
        <div className="flex gap-1">
          {me?.isOwner && model.marks.length > 0 && (
            <button className="btn-danger !px-2 !py-1 text-xs" onClick={() => clear()}>
              Clear all
            </button>
          )}
          <button className="rounded-full px-2 py-0.5 hover:bg-white/10" onClick={() => setOpen(false)}>
            ✕
          </button>
        </div>
      </div>
      {canAct && me && (
        <div className="mb-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 140))}
            placeholder="Leave one glowing stone where you stand…"
            rows={2}
          />
          <div className="mt-2 flex items-center justify-between text-xs text-white/50">
            <span className="num">{text.length}/140</span>
            <button className="btn !px-3 !py-1.5" onClick={leave} disabled={busy || !text.trim()}>
              Leave stone here
            </button>
          </div>
          {err && <p className="mt-1 text-xs text-rose-300">{err}</p>}
        </div>
      )}
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto text-sm">
        {model.marks.length === 0 && <li className="text-white/50">No stones yet.</li>}
        {model.marks.map((m) => (
          <li key={m.id} className="rounded-xl bg-white/5 px-3 py-2">
            <div className="flex items-center justify-between text-xs text-white/55">
              <span>
                <span style={{ color: m.bright ? '#FFD089' : 'inherit' }}>✦</span> @{m.byHandle}
                {m.bright && <span className="ml-1 text-white/40">· followed back</span>}
              </span>
              <span className="flex items-center gap-2">
                {relativeTime(m.at)}
                {(me?.isOwner || me?.handle === m.byHandle) && (
                  <button className="hover:text-rose-300" onClick={() => clear(m.id)} aria-label="Remove">
                    ✕
                  </button>
                )}
              </span>
            </div>
            <p className="mt-1 break-words">{m.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Chat({ sendChat }: { sendChat: (t: string) => void }) {
  const chat = useWorld((s) => s.chat);
  const setOpen = useWorld((s) => s.setChatOpen);
  const [text, setText] = useState('');
  return (
    <div className="pointer-events-auto absolute bottom-16 left-3 z-20 flex max-h-[50vh] w-[min(92vw,340px)] flex-col rounded-2xl chrome p-3">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-semibold">Nearby chat</span>
        <button className="rounded-full px-2 py-0.5 hover:bg-white/10" onClick={() => setOpen(false)}>
          ✕
        </button>
      </div>
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto text-sm">
        {chat.length === 0 && <li className="text-white/50">Only people within earshot hear you.</li>}
        {chat.map((c) => (
          <li key={c.id}>
            {/* tap a name to see what you can do together (invite them over, ask them out...) */}
            <button
              className="text-white/55 hover:text-white hover:underline"
              onClick={() => {
                const s = useWorld.getState();
                if (s.me?.handle.toLowerCase() === c.from.toLowerCase()) return;
                const peer = Object.values(s.peers).find((p) => p.handle.toLowerCase() === c.from.toLowerCase());
                s.selectPeer(peer ?? { id: `chat:${c.from}`, handle: c.from, x: c.x, z: c.z, yaw: 0, at: c.at });
              }}
            >
              @{c.from}
            </button>{' '}
            {c.text}
          </li>
        ))}
      </ul>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          sendChat(text.trim());
          setText('');
        }}
      >
        <input type="text" value={text} onChange={(e) => setText(e.target.value.slice(0, 200))} placeholder="Say something…" />
        <button className="btn !px-3" type="submit">
          Send
        </button>
      </form>
    </div>
  );
}
