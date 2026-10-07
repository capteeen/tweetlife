'use client';
import { useMemo, useState } from 'react';
import { useWorld } from '@/components/world/store';
import { pathLength, type Pt } from '@/lib/world/layout';
import { tripSeconds } from '@/lib/life/transport';
import { etaLabel, plannedRoute, rideOptions, travelTo } from './travel';

// "How are you getting there?" A row of rides, each with its fare and time, then Go.
export function TravelPicker({ to, label }: { to: Pt; label: string }) {
  const me = useWorld((s) => s.life?.me ?? null);
  const assets = useWorld((s) => s.life?.assets);
  const playerPos = useWorld((s) => s.playerPos);
  const options = useMemo(() => rideOptions(), [assets]); // eslint-disable-line react-hooks/exhaustive-deps
  const length = useMemo(() => pathLength(plannedRoute(to)), [to, playerPos.x, playerPos.z]); // eslint-disable-line react-hooks/exhaustive-deps
  const [pick, setPick] = useState<string>(() => (options.find((o) => o.id === 'own') ? 'own' : 'bus'));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ride = options.find((o) => o.id === pick) ?? options[0];
  const broke = !!me && ride.bags > me.bags;
  const tired = !!me && ride.id === 'walk' && me.gas < 6;

  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      await travelTo(ride, to, label);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!me) return <p className="mt-3 text-sm text-white/60">Sign in with X to get around the city.</p>;
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-baseline justify-between text-xs text-white/55">
        <span>Getting there</span>
        <span className="num">{Math.round(length)} m away</span>
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {options.map((o) => {
          const sec = tripSeconds(length, o.speed);
          const on = o.id === pick;
          return (
            <button
              key={o.id}
              onClick={() => setPick(o.id)}
              className={`flex flex-col items-center rounded-2xl px-1 py-2 text-center transition ${on ? 'bg-white/15 ring-2 ring-x' : 'bg-white/5 hover:bg-white/10'} ${o.bags > me.bags ? 'opacity-50' : ''}`}
            >
              <span className="text-2xl leading-none">{o.emoji}</span>
              <span className="mt-1 text-xs font-semibold">{o.name}</span>
              <span className="num text-[11px] text-white/60">{o.bags ? `${o.bags} bags` : 'Free'}</span>
              <span className="num text-[10px] text-white/40">{etaLabel(sec)}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-white/50">
        {ride.blurb}
        {Object.entries(ride.me).length > 0 &&
          ` (${Object.entries(ride.me)
            .map(([k, v]) => `${(v as number) > 0 ? '+' : ''}${v} ${k[0].toUpperCase() + k.slice(1)}`)
            .join(', ')})`}
      </p>
      <button
        className="mt-3 w-full rounded-2xl bg-emerald-500 py-3 text-base font-bold text-white shadow-lg transition hover:brightness-110 disabled:opacity-50"
        disabled={busy || broke || tired}
        onClick={go}
      >
        {busy ? 'Booking…' : broke ? `You need ${ride.bags - me.bags} more bags` : tired ? 'Too tired to walk' : `Go · ${ride.bags ? `${ride.bags} bags` : 'Free'}`}
      </button>
      {err && <p className="mt-2 text-xs text-rose-300">{err}</p>}
    </div>
  );
}
