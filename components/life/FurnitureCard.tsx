'use client';
import { useEffect, useState } from 'react';
import { useWorld } from '@/components/world/store';
import { useHome } from '@/components/home/store';
import { hasPower } from '@/lib/life/home';
import { lifeActions } from './useLife';

// A piece of furniture's sheet: name, blurb, and its actions with duration, cost and effect. Same shape as a
// venue's panel, laid out like the reference: a grid of cards, each with time, price and stat chips.

export function FurnitureCard({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const item = useHome((s) => s.selected);
  const select = useHome((s) => s.select);
  const home = useHome((s) => s.home);
  const acting = useHome((s) => s.acting);
  const setActing = useHome((s) => s.setActing);
  const me = useWorld((s) => s.life?.me ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [, force] = useState(0);

  // tick while an action runs so the countdown moves
  useEffect(() => {
    if (!acting) return;
    const t = setInterval(() => {
      if (Date.now() >= acting.until) setActing(null);
      else force((n) => n + 1);
    }, 250);
    return () => clearInterval(t);
  }, [acting, setActing]);

  if (!item || !home) return null;
  const mine = home.mine;
  const dark = item.needsPower && !hasPower(home.power) && !item.powerSeconds;
  const left = acting ? Math.max(0, Math.ceil((acting.until - Date.now()) / 1000)) : 0;

  const act = async (actionId: string) => {
    const a = item.actions.find((x) => x.id === actionId)!;
    setBusy(actionId);
    setMsg(null);
    try {
      await lifeActions.furnitureAct(item.id, actionId);
      setActing({ item, action: a, until: Date.now() + a.seconds * 1000 });
      await onRefresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const chips = (d: Partial<{ vibes: number; clout: number; gas: number }>) =>
    Object.entries(d)
      .filter(([, v]) => v)
      .map(([k, v]) => {
        const label = k === 'gas' ? 'Energy' : k === 'vibes' ? 'Fun' : 'Social';
        const color = k === 'gas' ? '#1D9BF0' : k === 'vibes' ? '#F28C28' : '#FF5D8F';
        return (
          <span key={k} className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: color + '22', color }}>
            {(v as number) > 0 ? '+' : ''}{v} {label}
          </span>
        );
      });

  return (
    <div className="pointer-events-auto absolute bottom-20 left-1/2 z-30 w-[min(94vw,620px)] -translate-x-1/2 rounded-3xl chrome p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl text-2xl" style={{ background: item.color + '33' }}>
            {item.emoji}
          </span>
          <div>
            <div className="text-lg font-bold leading-tight">{item.name}</div>
            <div className="text-sm text-white/60">{item.blurb}</div>
          </div>
        </div>
        <button className="rounded-full px-2 py-0.5 hover:bg-white/10" onClick={() => select(null)} aria-label="Close">
          ✕
        </button>
      </div>
      {!me ? (
        <p className="mt-3 text-sm text-white/60">Sign in with X to use the house.</p>
      ) : !mine ? (
        <p className="mt-3 text-sm text-white/60">This is @{home.owner.handle}&apos;s {item.name.toLowerCase()}. Only they can use it.</p>
      ) : dark ? (
        <p className="mt-3 rounded-2xl bg-white/5 px-3 py-2 text-sm text-amber-200">⚡ No light. NEPA has taken it — a generator or a solar inverter keeps this working.</p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {item.actions.map((a) => {
            const running = acting?.action.id === a.id && acting.item.id === item.id;
            return (
              <button
                key={a.id}
                disabled={busy !== null || acting !== null || (a.bags > 0 && me.bags < a.bags)}
                onClick={() => act(a.id)}
                className="flex flex-col gap-2 rounded-2xl bg-white/5 px-3 py-3 text-left transition hover:bg-white/10 disabled:opacity-60"
              >
                <span className="flex w-full items-start justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xl leading-none">{a.emoji}</span>
                  <span className="text-right text-[11px] leading-tight text-white/60">
                    <span className="num block">⏱ {running ? `${left}s` : `${a.seconds}s`}</span>
                    <span className={`block font-semibold ${a.bags ? 'text-amber-200' : 'text-emerald-300'}`}>{a.bags ? `${a.bags} bags` : 'Free'}</span>
                  </span>
                </span>
                <span className="text-sm font-semibold">{running ? `${a.label}…` : a.label}</span>
                <span className="flex flex-wrap gap-1">{chips(a.me)}</span>
              </button>
            );
          })}
        </div>
      )}
      {msg && <p className="mt-2 text-xs text-white/70">{msg}</p>}
    </div>
  );
}
