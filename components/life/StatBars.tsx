'use client';
import { useEffect, useState } from 'react';
import { useWorld } from '@/components/world/store';
import { ACTIVITIES, TIRED, type Activity } from '@/lib/life/activities';
import { lifeActions } from './useLife';

// Bottom-left needs: Vibes / Clout / Gas, and the everyday moves (dance, stretch, rest, push-ups, selfie).

const NAMES = { gas: 'Energy', vibes: 'Fun', clout: 'Social' } as const;
const effects = (a: Activity) =>
  (Object.entries(a.me) as [keyof typeof NAMES, number][])
    .filter(([, v]) => v)
    .map(([k, v]) => `${v > 0 ? '+' : '−'}${Math.abs(v)} ${NAMES[k]}`)
    .join(' ');

/** `inline` drops the fixed top-left placement, for screens that stack other panels under it. */
export function StatBars({ inline = false }: { inline?: boolean }) {
  const me = useWorld((s) => s.life?.me ?? null);
  const riding = useWorld((s) => s.riding);
  if (!me) return null;
  const rows: { k: string; v: number; e: string; c: string }[] = [
    { k: 'Vibes', v: me.vibes, e: '🎉', c: '#FF5D8F' },
    { k: 'Clout', v: me.clout, e: '💬', c: '#1D9BF0' },
    { k: 'Gas', v: me.gas, e: '⚡', c: me.gas < TIRED ? '#F97316' : '#FFD166' },
  ];
  return (
    <div className={`pointer-events-auto w-48 rounded-2xl chrome p-3 text-xs ${inline ? '' : 'absolute left-3 top-16 z-10'}`}>
      <div className="mb-2 flex items-center gap-2">
        {me.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={me.avatarUrl} alt="" className="h-7 w-7 rounded-full" />
        ) : (
          <span className="h-7 w-7 rounded-full bg-white/10" />
        )}
        <div className="min-w-0">
          <div className="truncate font-semibold">@{me.handle}</div>
          <div className="truncate text-white/55">{riding ? `${riding.emoji} riding the ${riding.name}` : me.status}</div>
        </div>
      </div>
      {rows.map((r) => (
        <div key={r.k} className="mb-1.5 flex items-center gap-2">
          <span className="w-4 text-center">{r.e}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full transition-all" style={{ width: `${r.v}%`, background: r.c }} />
          </div>
          <span className="num w-7 text-right text-white/70">{r.v}</span>
        </div>
      ))}
      {me.gas < TIRED && !riding && (
        <p className="mb-1 mt-1.5 rounded-xl bg-orange-500/15 px-2 py-1.5 leading-snug text-orange-200">
          {me.gas === 0 ? '😵 Out of gas. You can barely walk.' : '😮‍💨 Tired, so you walk slower.'} Sleep at home to get it back.
        </p>
      )}
      {!riding && <Moves gas={me.gas} />}
    </div>
  );
}

function Moves({ gas }: { gas: number }) {
  const doing = useWorld((s) => s.doing);
  const setDoing = useWorld((s) => s.setDoing);
  const pushToast = useWorld((s) => s.pushToast);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!doing) return;
    const t = setInterval(() => {
      if (Date.now() >= doing.until) setDoing(null);
      else tick((n) => n + 1);
    }, 250);
    return () => clearInterval(t);
  }, [doing, setDoing]);

  const go = async (a: Activity) => {
    setBusy(true);
    try {
      await lifeActions.activity(a.id);
      pushToast(`${a.emoji} ${a.label} · ${effects(a)}`, 'activity');
    } catch (e) {
      pushToast((e as Error).message, 'activity');
    } finally {
      setBusy(false);
    }
  };

  const cur = doing && ACTIVITIES.find((a) => a.id === doing.id);
  if (cur && doing) {
    const left = Math.max(0, Math.ceil((doing.until - Date.now()) / 1000));
    return (
      <div className="mt-2 flex items-center gap-2 rounded-xl bg-white/5 px-2 py-1.5">
        <span className="text-base leading-none">{cur.emoji}</span>
        <span className="min-w-0 flex-1 truncate font-semibold">{cur.label}…</span>
        <span className="num text-white/60">{left}s</span>
        <button className="rounded-full px-1.5 hover:bg-white/10" onClick={() => setDoing(null)} aria-label="Stop">
          ✕
        </button>
      </div>
    );
  }
  return (
    <div className="mt-2">
      <div className="mb-1 text-[10px] uppercase tracking-wide text-white/40">Do something</div>
      <div className="flex justify-between gap-1">
        {ACTIVITIES.map((a) => {
          const tooTired = (a.me.gas ?? 0) < 0 && gas + (a.me.gas ?? 0) < 0;
          return (
            <button
              key={a.id}
              disabled={busy || tooTired}
              onClick={() => go(a)}
              title={`${a.label} · ${a.seconds}s · ${effects(a)}${tooTired ? ' · too tired' : ''}`}
              aria-label={a.label}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-base leading-none transition hover:bg-white/20 disabled:opacity-40"
            >
              {a.emoji}
            </button>
          );
        })}
      </div>
    </div>
  );
}
