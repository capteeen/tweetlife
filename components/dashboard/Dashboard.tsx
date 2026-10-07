'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { compact, fullNumber, relativeTime } from '@/lib/format';
import { BIOMES, PALETTES, type Biome } from '@/lib/world/biomes';
import type { BudgetStatus } from '@/lib/x/budget';

export type DashboardData = {
  world: {
    handle: string;
    access: 'followers' | 'public' | 'invite';
    biome: string;
    listedOnExplore: boolean;
    landmarkPostId: string | null;
    showReplies: boolean;
    showMetrics: boolean;
    chatEnabled: boolean;
    ingestState: string;
    ingestError: string | null;
    lastSyncAt: string | null;
    nextSyncAt: string | null;
    followersCount: number;
    postCount: number;
    paths: { x: number; z: number }[][];
  };
  structures: {
    id: string; postId: string; kind: string; text: string; likes: number | null; reposts: number | null; replies: number | null;
    impressions: number | null; postedAt: string; hidden: boolean; lanternsLit: number;
  }[];
  runs: { id: string; kind: string; status: string; startedAt: string; finishedAt: string | null; pagesFetched: number; postsWritten: number; calls: number; attempts: number; error: string | null }[];
  budget: BudgetStatus;
  userCallsThisMonth: number;
  timelapse: { id: string; status: string; ready: boolean; error: string | null } | null;
};

async function patch(body: unknown) {
  const res = await fetch('/api/my-world/settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed');
}

export function Dashboard({ data }: { data: DashboardData }) {
  const { world, runs, budget, structures } = data;
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const visible = structures.filter((s) => !filter || s.text.toLowerCase().includes(filter.toLowerCase()) || s.postId === filter);
  const hiddenCount = structures.filter((s) => s.hidden).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">@{world.handle}&apos;s world</h1>
          <p className="num text-sm text-white/60">
            {structures.length} structures{hiddenCount ? ` (${hiddenCount} hidden)` : ''} · {compact(world.followersCount)} followers · {compact(world.postCount)} posts on X
          </p>
        </div>
        <div className="flex gap-2">
          <Link className="btn" href={`/w/${world.handle}`}>
            Walk in
          </Link>
          <button className="btn-ghost" onClick={() => navigator.clipboard.writeText(`${location.origin}/w/${world.handle}`)}>
            Copy link
          </button>
        </div>
      </div>
      {err && <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">{err}</div>}

      {/* Sync status */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="State" value={world.ingestState} sub={world.ingestError ?? undefined} danger={world.ingestState === 'failed'} />
        <Stat label="Last sync" value={relativeTime(world.lastSyncAt)} sub={world.nextSyncAt ? `next ${relativeTime(world.nextSyncAt)}` : 'next: when the build finishes'} />
        <Stat label="Your X calls this month" value={fullNumber(data.userCallsThisMonth)} sub="made on your token, for your world and your entry checks" />
        <Stat label="Deployment quota" value={`${Math.round(budget.fraction * 100)}%`} sub={`${fullNumber(budget.used)} / ${fullNumber(budget.budget)} · ${budget.level}`} danger={budget.level === 'exhausted'} />
      </section>
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost" disabled={busy === 'sync'} onClick={() => act('sync', () => fetch('/api/my-world/sync', { method: 'POST' }).then(assertOk))}>
          Sync now
        </button>
        <button
          className="btn-ghost"
          disabled={busy === 'tl' || world.ingestState !== 'live'}
          onClick={() => act('tl', () => fetch('/api/my-world/timelapse', { method: 'POST' }).then(assertOk))}
        >
          Render timelapse (20s MP4)
        </button>
        {data.timelapse && (
          <span className="self-center text-sm text-white/60">
            Timelapse: {data.timelapse.status}
            {data.timelapse.ready && (
              <a className="ml-2 underline" href={`/api/timelapse/${data.timelapse.id}`}>
                download
              </a>
            )}
            {data.timelapse.error && <span className="ml-2 text-rose-300">{data.timelapse.error}</span>}
          </span>
        )}
      </div>

      {/* Settings */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-4">
          <h2 className="font-semibold">Access</h2>
          <div className="flex flex-wrap gap-2">
            {(['followers', 'public', 'invite'] as const).map((a) => (
              <button key={a} className={world.access === a ? 'btn' : 'btn-ghost'} disabled={busy === 'access'} onClick={() => act('access', () => patch({ access: a }))}>
                {a === 'followers' ? 'Followers only' : a === 'public' ? 'Public' : 'Invite-only'}
              </button>
            ))}
          </div>
          <p className="text-xs text-white/50">
            Followers-only verifies each visitor&apos;s follow on their own token. Public skips the check entirely (no X calls per visitor).
          </p>
          <Toggle label="List on /explore (public worlds only)" checked={world.listedOnExplore} disabled={world.access !== 'public'} onChange={(v) => act('list', () => patch({ listedOnExplore: v }))} />
          <Toggle label="Show reply outbuildings" checked={world.showReplies} onChange={(v) => act('replies', () => patch({ showReplies: v }))} />
          <Toggle label="Show metrics on post cards" checked={world.showMetrics} onChange={(v) => act('metrics', () => patch({ showMetrics: v }))} />
          <Toggle label="Proximity chat (off by default)" checked={world.chatEnabled} onChange={(v) => act('chat', () => patch({ chatEnabled: v }))} />
        </div>
        <div className="card space-y-4">
          <h2 className="font-semibold">Biome</h2>
          <div className="flex flex-wrap gap-2">
            {BIOMES.map((b) => (
              <button key={b} className={world.biome === b ? 'btn' : 'btn-ghost'} disabled={busy === 'biome'} onClick={() => act('biome', () => patch({ biome: b }))}>
                <span className="inline-block h-3 w-3 rounded-full" style={{ background: PALETTES[b as Biome].lush }} /> {PALETTES[b as Biome].label}
              </button>
            ))}
          </div>
          <h2 className="pt-2 font-semibold">Paths</h2>
          <PathsEditor paths={world.paths} onSave={(p) => act('paths', () => patch({ paths: p }))} />
        </div>
      </section>

      {/* Posts: landmark + hide */}
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Posts in your world</h2>
          <input type="text" className="!w-64" placeholder="Filter by text or post id" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <p className="mt-1 text-xs text-white/50">
          Landmark: {world.landmarkPostId ? `pinned to ${world.landmarkPostId}` : 'automatic (highest engagement)'}
          {world.landmarkPostId && (
            <button className="ml-2 underline" onClick={() => act('lm', () => patch({ landmarkPostId: null }))}>
              unpin
            </button>
          )}
        </p>
        <ul className="mt-3 max-h-[480px] divide-y divide-white/5 overflow-y-auto text-sm">
          {visible.slice(0, 200).map((s) => (
            <li key={s.id} className={`flex items-start gap-3 py-2 ${s.hidden ? 'opacity-50' : ''}`}>
              <span className="w-20 shrink-0 text-xs text-white/45">{s.kind}</span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 break-words">{s.text}</span>
                <span className="num block text-xs text-white/45">
                  ♥ {compact(s.likes)} · ⟲ {compact(s.reposts)} · ↩ {compact(s.replies)} · ◉ {compact(s.impressions)} · ✦ {s.lanternsLit} · {relativeTime(s.postedAt)}
                </span>
              </span>
              <span className="flex shrink-0 gap-1">
                <button className="btn-ghost !px-2 !py-1 text-xs" disabled={busy === s.id} onClick={() => act(s.id, () => patch({ landmarkPostId: s.postId }))}>
                  {world.landmarkPostId === s.postId ? 'Landmark ✓' : 'Pin'}
                </button>
                <button
                  className="btn-ghost !px-2 !py-1 text-xs"
                  disabled={busy === s.id}
                  onClick={() =>
                    act(s.id, () =>
                      fetch(`/api/my-world/structures/${s.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hidden: !s.hidden }) }).then(assertOk),
                    )
                  }
                >
                  {s.hidden ? 'Unhide' : 'Hide'}
                </button>
              </span>
            </li>
          ))}
          {visible.length === 0 && <li className="py-2 text-white/50">No posts match.</li>}
        </ul>
        {structures.length >= 400 && <p className="mt-2 text-xs text-white/40">Showing the top 400 by likes.</p>}
      </section>

      {/* Ingestion runs */}
      <section className="card">
        <h2 className="font-semibold">Ingestion runs</h2>
        <table className="num mt-3 w-full text-left text-sm">
          <thead className="text-xs text-white/50">
            <tr>
              <th className="py-1 font-normal">Started</th>
              <th className="font-normal">Kind</th>
              <th className="font-normal">Status</th>
              <th className="font-normal">Pages</th>
              <th className="font-normal">Posts</th>
              <th className="font-normal">Calls</th>
              <th className="font-normal">Error</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 && (
              <tr>
                <td colSpan={8} className="py-2 text-white/50">
                  No runs yet.
                </td>
              </tr>
            )}
            {runs.map((r) => (
              <tr key={r.id} className="border-t border-white/5 align-top">
                <td className="py-1 text-white/70">{relativeTime(r.startedAt)}</td>
                <td>{r.kind}</td>
                <td className={r.status === 'dead' || r.status === 'failed' ? 'text-rose-300' : r.status === 'succeeded' ? 'text-emerald-300' : ''}>{r.status}</td>
                <td>{r.pagesFetched}</td>
                <td>{r.postsWritten}</td>
                <td>{r.calls}</td>
                <td className="max-w-[260px] text-xs text-white/60">{r.error}</td>
                <td>
                  {r.status === 'dead' && (
                    <button
                      className="btn-ghost !px-2 !py-1 text-xs"
                      disabled={busy === r.id}
                      onClick={() => act(r.id, () => fetch('/api/my-world/retry', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runId: r.id }) }).then(assertOk))}
                    >
                      Retry
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Danger */}
      <section className="card">
        <h2 className="font-semibold">Delete world</h2>
        <p className="mt-1 text-sm text-white/60">Deletes every structure, stone and lantern, revokes our access to your X account, and signs you out.</p>
        <button
          className="btn-danger mt-3"
          disabled={busy === 'delete'}
          onClick={() => {
            if (!confirm('Delete your world and revoke tokens? This cannot be undone.')) return;
            act('delete', async () => {
              await fetch('/api/my-world/delete', { method: 'POST' }).then(assertOk);
              location.href = '/';
            });
          }}
        >
          Delete world and revoke tokens
        </button>
      </section>
    </div>
  );
}

async function assertOk(res: Response) {
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
  return res;
}

function Stat({ label, value, sub, danger }: { label: string; value: string; sub?: string; danger?: boolean }) {
  return (
    <div className="card">
      <p className="label">{label}</p>
      <p className={`num mt-1 text-lg font-semibold ${danger ? 'text-rose-300' : ''}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-white/50">{sub}</p>}
    </div>
  );
}

function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-center justify-between text-sm ${disabled ? 'opacity-50' : ''}`}>
      <span>{label}</span>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[#1D9BF0]" />
    </label>
  );
}

/** Paths as text: one path per line, points as "x,z x,z x,z". Simple and deterministic. */
function PathsEditor({ paths, onSave }: { paths: { x: number; z: number }[][]; onSave: (p: { x: number; z: number }[][]) => void }) {
  const [text, setText] = useState(paths.map((p) => p.map((q) => `${q.x},${q.z}`).join(' ')).join('\n'));
  const parse = () =>
    text
      .split('\n')
      .map((line) =>
        line
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .map((pt) => {
            const [x, z] = pt.split(',').map(Number);
            return { x, z };
          })
          .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z)),
      )
      .filter((p) => p.length > 1);
  return (
    <div>
      <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={'One path per line, points as x,z — e.g.\n0,0 12,4 20,18'} />
      <div className="mt-2 flex items-center justify-between text-xs text-white/50">
        <span>World units; the centre is your oldest post, the spiral grows outward.</span>
        <button className="btn-ghost !px-3 !py-1" onClick={() => onSave(parse())}>
          Save paths
        </button>
      </div>
    </div>
  );
}
