'use client';
import { useEffect, useState } from 'react';
import { useWorld } from '@/components/world/store';
import { ACTIVITIES, TIRED, type Activity } from '@/lib/life/activities';
import { IDLE_STATUS, STATS, STAT_ORDER, statDelta, type StatKey } from '@/lib/life/statNames';
import { lifeActions } from './useLife';

// Bottom-left needs: Vibes / Clout / Gas, and the everyday moves (dance, stretch, rest, push-ups, selfie).
// Each bar is named; tap one to see what it means. Each move shows what it does before you tap it.

const effects = (a: Activity) => statDelta(a.me, ' ');

/** `inline` drops the fixed top-left placement, for screens that stack other panels under it. `atHome`: you are in
 * your house, so you are not riding anything. */
export function StatBars({ inline = false, atHome = false }: { inline?: boolean; atHome?: boolean }) {
  const me = useWorld((s) => s.life?.me ?? null);
  const riding = useWorld((s) => (atHome ? null : s.riding));
  const doing = useWorld((s) => s.doing);
  const [open, setOpen] = useState<StatKey | null>(null);
  if (!me) return null;
  // the line only says what you are doing while you are doing it
  const live = !!me.statusUntil && Date.parse(me.statusUntil) > Date.now();
  const move = doing && ACTIVITIES.find((a) => a.id === doing.id);
  const status = riding ? `${riding.emoji} riding the ${riding.name}` : live ? me.status : move ? move.line : IDLE_STATUS;
  return (
    <div className={`pointer-events-auto w-52 rounded-2xl chrome p-3 text-xs ${inline ? '' : 'absolute left-3 top-16 z-10'}`}>
      <div className="mb-2 flex items-center gap-2">
        {me.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={me.avatarUrl} alt="" className="h-7 w-7 rounded-full" />
        ) : (
          <span className="h-7 w-7 rounded-full bg-white/10" />
        )}
        <div className="min-w-0">
          <div className="truncate font-semibold">@{me.handle}</div>
          <div className="truncate text-white/55">{status}</div>
        </div>
      </div>
      {STAT_ORDER.map((k) => {
        const st = STATS[k];
        const v = me[k];
        const c = k === 'gas' && v < TIRED ? '#F97316' : st.color;
        return (
          <button
            key={k}
            className="mb-1.5 flex w-full items-center gap-1.5 rounded-lg text-left hover:bg-white/5"
            onClick={() => setOpen(open === k ? null : k)}
            aria-expanded={open === k}
            title={st.what}
          >
            <span className="w-4 text-center">{st.emoji}</span>
            <span className="w-9 font-semibold text-white/80">{st.name}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
              <span className="block h-full rounded-full transition-all" style={{ width: `${v}%`, background: c }} />
            </span>
            <span className="num w-6 text-right text-white/70">{v}</span>
          </button>
        );
      })}
      {open && <p className="mb-1.5 rounded-xl bg-white/5 px-2 py-1.5 leading-snug text-white/70">{STATS[open].what}</p>}
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
  const [hint, setHint] = useState<Activity | null>(null);
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
              onPointerEnter={() => setHint(a)}
              onPointerLeave={() => setHint(null)}
              onFocus={() => setHint(a)}
              onBlur={() => setHint(null)}
              title={`${a.label} · ${a.seconds}s · ${effects(a)}${tooTired ? ' · too tired' : ''}`}
              aria-label={`${a.label}: ${effects(a)}`}
              className="flex flex-col items-center gap-0.5 rounded-xl px-0.5 py-1 leading-none transition hover:bg-white/10 disabled:opacity-40"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-base">{a.emoji}</span>
              <span className="whitespace-nowrap text-[9px] text-white/55">{SHORT[a.id] ?? a.label}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-1 min-h-[1.25rem] text-[10px] leading-tight text-white/50">{hint ? `${hint.label}: ${effects(hint)}` : 'Tap a move to do it. Its effect pops up.'}</p>
    </div>
  );
}

const SHORT: Partial<Record<Activity['id'], string>> = { dance: 'Dance', stretch: 'Stretch', rest: 'Rest', pushups: 'Push-ups', selfie: 'Selfie' };
