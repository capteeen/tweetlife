'use client';
import { useEffect, useRef, useState } from 'react';
import { useWorld, type ResidentMsg } from '@/components/world/store';
import { compact } from '@/lib/format';

// Tap a follower in someone's crowd: who they are on X, and a quick chat with them (AI, via /api/life/crowd/chat).
// Selected through the same slot as the named residents, with ids shaped `f:<poster id>:<follower id>`.

export function FollowerCard() {
  const id = useWorld((s) => s.selectedResident);
  const select = useWorld((s) => s.selectResident);
  const me = useWorld((s) => s.life?.me ?? null);
  const crowds = useWorld((s) => s.crowds);
  const chat = useWorld((s) => (id ? s.residentChats[id] : undefined));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);

  const [, ownerId, followerId] = id?.startsWith('f:') ? id.split(':') : [];
  const crowd = ownerId ? crowds.find((c) => c.ownerId === ownerId) : undefined;
  const f = crowd?.followers.find((x) => x.id === followerId);

  useEffect(() => {
    setErr(null);
    setText('');
  }, [id]);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [chat?.length, busy]);

  if (!id || !crowd || !f) return null;
  const isMine = crowd.ownerId === me?.id;
  const starters = isMine ? ['You came! 🙏', 'What did you think of the post?', 'Should I post more?'] : [`What did @${crowd.owner} post?`, 'You follow them too?'];

  const send = async (say: string) => {
    const content = say.trim().slice(0, 400);
    if (!content || busy) return;
    const s = useWorld.getState();
    const mine: ResidentMsg = { role: 'user', content };
    s.pushResidentChat(id, mine);
    setText('');
    setBusy(true);
    setErr(null);
    try {
      const messages = [...(s.residentChats[id] ?? []), mine].slice(-10);
      const res = await fetch('/api/life/crowd/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ownerId: crowd.ownerId, followerId: f.id, messages }),
      });
      const j = (await res.json().catch(() => ({}))) as { reply?: string; error?: string };
      if (!res.ok || !j.reply) throw new Error(j.error ?? "They didn't catch that. Try again.");
      useWorld.getState().pushResidentChat(id, { role: 'assistant', content: j.reply });
      useWorld.getState().residentSay(id, j.reply.length > 90 ? j.reply.slice(0, 87).replace(/\s+\S*$/, '') + '…' : j.reply);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pointer-events-auto absolute bottom-20 left-1/2 z-30 flex w-[min(94vw,520px)] -translate-x-1/2 flex-col rounded-3xl chrome p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {f.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.avatar} alt="" className="h-11 w-11 shrink-0 rounded-full" />
          ) : (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-x text-lg font-bold">{f.name[0]}</span>
          )}
          <div className="min-w-0">
            <div className="truncate text-lg font-bold leading-tight">{f.name}</div>
            <div className="truncate text-sm text-white/60">
              <a className="hover:underline" href={`https://x.com/${f.handle}`} target="_blank" rel="noopener noreferrer">
                @{f.handle}
              </a>
              {f.followers != null ? ` · ${compact(f.followers)} followers` : ''} · {isMine ? 'came for your post' : `came for @${crowd.owner}'s post`}
            </div>
          </div>
        </div>
        <button className="rounded-full px-2 py-0.5 hover:bg-white/10" onClick={() => select(null)} aria-label="Close">
          ✕
        </button>
      </div>
      {crowd.text && <p className="mt-2 line-clamp-2 rounded-2xl bg-white/5 px-3 py-2 text-xs text-white/70">📣 “{crowd.text}”</p>}

      <div ref={list} className="mt-3 flex max-h-[30vh] min-h-[2.5rem] flex-col gap-2 overflow-y-auto pr-1">
        {!chat?.length && <p className="text-sm text-white/50">Say hi to {f.name.split(' ')[0]}.</p>}
        {chat?.map((m, i) => (
          <div key={i} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-snug ${m.role === 'user' ? 'self-end bg-x/90 text-white' : 'self-start bg-white/10'}`}>
            {m.content}
          </div>
        ))}
        {busy && <div className="self-start rounded-2xl bg-white/10 px-3 py-2 text-sm text-white/60">typing…</div>}
      </div>

      {!me ? (
        <p className="mt-3 text-sm text-white/60">Sign in with X to talk.</p>
      ) : (
        <>
          {!chat?.length && (
            <div className="mt-3 flex flex-wrap gap-2">
              {starters.map((s) => (
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
              placeholder="Say something…"
              className="min-w-0 flex-1 rounded-full bg-white/10 px-4 py-2 text-sm outline-none placeholder:text-white/40 focus:bg-white/15"
            />
            <button type="submit" disabled={busy || !text.trim()} className="rounded-full bg-x px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              Send
            </button>
          </form>
        </>
      )}
      {err && <p className="mt-2 text-xs text-rose-300">{err}</p>}
      <p className="mt-2 text-[10px] text-white/35">AI-played follower · not the real @{f.handle} · replies are generated</p>
    </div>
  );
}
