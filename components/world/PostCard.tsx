'use client';
import { useState } from 'react';
import { compact, dateShort } from '@/lib/format';
import { useWorld } from './store';

// The real post behind a structure. Links out to X. Lantern button = on-world like.

const KIND_LABEL: Record<string, string> = {
  pillar: 'Post',
  spire: 'Thread',
  monolith: 'Photo post',
  obelisk: 'Video post',
  outbuilding: 'Reply',
  lantern: 'Repost',
};

export function PostCard({ handle, showMetrics, canAct }: { handle: string; showMetrics: boolean; canAct: boolean }) {
  const selected = useWorld((s) => s.selected);
  const select = useWorld((s) => s.select);
  const lit = useWorld((s) => s.lit);
  const toggleLit = useWorld((s) => s.toggleLit);
  const blockAccess = useWorld((s) => s.blockAccess);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!selected) return null;
  const s = selected;
  // on a country map a building belongs to whoever's block it stands in
  const owner = s.owner ?? handle;
  const access = s.owner ? blockAccess[s.owner.toLowerCase()] : undefined;
  const locked = !!s.owner && !s.text && !!access && !access.loading && !access.admitted;
  const url = `https://x.com/${owner}/status/${s.postId}`;
  const isLit = lit.has(s.id);

  const light = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/world/${encodeURIComponent(owner)}/lantern`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ structureId: s.id }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'failed');
      toggleLit(s.id, j.lit, j.lanternsLit);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pointer-events-auto absolute left-1/2 top-16 z-20 w-[min(92vw,420px)] -translate-x-1/2 rounded-2xl chrome p-4 text-[15px]">
      <div className="mb-2 flex items-center justify-between text-xs text-white/55">
        <span>
          {KIND_LABEL[s.kind] ?? 'Post'} · {dateShort(s.postedAt)}
          {s.isLandmark ? ' · Landmark' : ''}
        </span>
        <button className="rounded-full px-2 py-0.5 hover:bg-white/10" onClick={() => select(null)} aria-label="Close">
          ✕
        </button>
      </div>
      {s.owner && <p className="mb-1 text-xs text-white/55">@{s.owner}&apos;s block</p>}
      {locked ? (
        <p className="text-white/70">{access?.message ?? `Follow @${owner} to read their posts.`}</p>
      ) : s.owner && !s.text ? (
        <p className="text-white/50">Loading the post…</p>
      ) : (
        <p className="whitespace-pre-wrap break-words leading-[22px]">{s.text}</p>
      )}
      {showMetrics && (
        <div className="num mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/60">
          <span title="Likes">♥ {compact(s.likes)}</span>
          <span title="Reposts">⟲ {compact(s.reposts)}</span>
          <span title="Replies">↩ {compact(s.replies)}</span>
          <span title="Impressions">◉ {compact(s.impressions)}</span>
          {!s.metricsKnown && <span className="text-white/40">metrics not available</span>}
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">
        {locked && access?.reason === 'not_following' && (
          <a className="btn" href={`https://x.com/intent/follow?screen_name=${owner}`} target="_blank" rel="noopener noreferrer">
            Follow @{owner}
          </a>
        )}
        {canAct && !locked && (
          <button className={isLit ? 'btn-ghost' : 'btn'} onClick={light} disabled={busy}>
            <span style={{ color: '#FFD089' }}>✦</span> {isLit ? 'Lantern lit' : 'Light a lantern'}
            <span className="num text-xs opacity-70">{s.lanternsLit}</span>
          </button>
        )}
        <a className="btn-ghost" href={url} target="_blank" rel="noopener noreferrer">
          Open on X ↗
        </a>
      </div>
      {err && <p className="mt-2 text-xs text-rose-300">{err}</p>}
    </div>
  );
}
