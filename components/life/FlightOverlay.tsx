'use client';
import { useEffect, useState } from 'react';
import { useWorld, type Flight } from '@/components/world/store';
import { FLIGHT, cabinById } from '@/lib/life/flights';
import { COUNTRIES, type Country } from '@/lib/world/countries';
import { IdCard } from '@/components/citizen/IdCard';

// What you see during a flight: the boarding pass at the stand, a strip while you taxi and take off,
// the screen above the clouds while the other country loads, a strip for the landing, and the welcome.

export function FlightOverlay() {
  const flight = useWorld((s) => s.flight);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!flight) return;
    const t = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(t);
  }, [flight]);
  if (!flight) return null;
  const from = COUNTRIES[flight.from], to = COUNTRIES[flight.to];
  const secs = (performance.now() - flight.at) / 1000;
  return (
    <>
      <style>{KEYFRAMES}</style>
      {flight.phase === 'boarding' && <Boarding flight={flight} from={from} to={to} />}
      {(flight.phase === 'takeoff' || flight.phase === 'landing') && (
        <Strip
          text={flight.phase === 'takeoff' ? `Taking off for ${to.capital}` : `Landing in ${to.capital}`}
          number={flight.number}
          done={Math.min(1, secs / (flight.phase === 'takeoff' ? FLIGHT.takeoff : FLIGHT.landing))}
          to={to}
        />
      )}
      {flight.phase === 'cruise' && <Cruise flight={flight} from={from} to={to} done={Math.min(1, secs / FLIGHT.cruise)} />}
      {flight.phase === 'arriving' && <Strip text={flight.number ? 'Landed. Walking to passport control' : `Arrivals, ${to.capital}`} number={flight.number} done={1} to={to} />}
      {flight.phase === 'arrived' && <Welcome to={to} />}
    </>
  );
}

const seatFor = (f: Flight) => (f.cabin === 'first' ? '1A' : f.cabin === 'jet' ? 'ANY' : `${14 + (f.number.charCodeAt(4) % 9)}C`);

function Boarding({ flight, from, to }: { flight: Flight; from: Country; to: Country }) {
  const me = useWorld((s) => s.life?.me ?? null);
  const cabin = cabinById(flight.cabin)!;
  return (
    <div className="pointer-events-none absolute bottom-20 left-1/2 z-40 flex w-[min(94vw,640px)] -translate-x-1/2 flex-col items-end gap-3 sm:flex-row" style={{ animation: 'tl-rise .35s ease-out' }}>
      <div className="flex-1 overflow-hidden rounded-2xl bg-white text-[#0B0F17] shadow-2xl">
        <div className="flex items-center justify-between px-4 py-2 text-white" style={{ background: `linear-gradient(90deg, ${to.theme.gradient[0]}, ${to.theme.gradient[1]})` }}>
          <span className="text-xs font-black tracking-[0.2em]">BOARDING PASS</span>
          <span className="text-xs font-bold">{cabin.id === 'jet' ? 'PRIVATE' : cabin.name.toUpperCase()}</span>
        </div>
        <div className="flex items-end justify-between px-4 pt-3">
          <div>
            <div className="text-[10px] font-semibold text-black/45">FROM</div>
            <div className="text-2xl font-black leading-none">{from.ticker}</div>
            <div className="text-[11px] text-black/60">{from.capital}</div>
          </div>
          <div className="pb-3 text-xl">{cabin.id === 'jet' ? '🛩️' : '✈️'}</div>
          <div className="text-right">
            <div className="text-[10px] font-semibold text-black/45">TO</div>
            <div className="text-2xl font-black leading-none">{to.ticker}</div>
            <div className="text-[11px] text-black/60">{to.capital}</div>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2 border-t border-dashed border-black/15 px-4 py-2.5 text-[10px]">
          <Field k="PASSENGER" v={me ? `@${me.handle}` : '-'} />
          <Field k="FLIGHT" v={flight.number} />
          <Field k="STAND" v={cabin.id === 'jet' ? 'PVT' : 'A2'} />
          <Field k="SEAT" v={seatFor(flight)} />
        </div>
        <div className="flex items-center justify-between bg-black/5 px-4 py-1.5 text-[11px] font-semibold">
          <span className="text-[#06A77D]">● Now boarding</span>
          <span className="font-mono tracking-[0.3em] text-black/40">|||| ||| | |||| ||</span>
        </div>
      </div>
      {me && (
        <div className="w-full shrink-0 sm:w-72">
          <IdCard holder={{ name: me.name, handle: me.handle, avatarUrl: me.avatarUrl, look: me.look }} citizen={me.citizen} flippable={false} />
        </div>
      )}
    </div>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <div className="font-semibold text-black/45">{k}</div>
      <div className="truncate text-xs font-bold">{v}</div>
    </div>
  );
}

function Strip({ text, number, done, to }: { text: string; number: string; done: number; to: Country }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-16 z-30 w-[min(90vw,380px)] -translate-x-1/2 rounded-2xl chrome px-4 py-2.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">✈️ {text}</span>
        <span className="font-mono text-xs text-white/60">{number}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${done * 100}%`, background: `linear-gradient(90deg, ${to.theme.gradient[0]}, ${to.theme.gradient[1]})` }} />
      </div>
    </div>
  );
}

function Cruise({ flight, from, to, done }: { flight: Flight; from: Country; to: Country; done: number }) {
  const left = Math.max(0, Math.ceil(FLIGHT.cruise * (1 - done)));
  return (
    <div className="absolute inset-0 z-40 overflow-hidden" style={{ background: `linear-gradient(180deg, #0E2A52 0%, #3A78C2 55%, ${to.theme.primary}66 100%)`, animation: 'tl-fade .5s ease-out' }}>
      {/* clouds streaming past the window */}
      {Array.from({ length: 9 }, (_, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-white/80 blur-md"
          style={{
            width: 120 + ((i * 53) % 160),
            height: 40 + ((i * 29) % 40),
            top: `${8 + ((i * 37) % 80)}%`,
            left: '110%',
            opacity: 0.35 + ((i * 17) % 50) / 100,
            animation: `tl-cloud ${2.2 + (i % 4) * 0.7}s linear ${-(i * 0.45)}s infinite`,
          }}
        />
      ))}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center text-white">
        <div className="text-xs font-semibold tracking-[0.3em] text-white/70">{flight.number} · CRUISING AT 36,000 FT</div>
        <div className="mt-6 flex w-[min(86vw,520px)] items-center gap-3">
          <Badge c={from} />
          <div className="relative h-10 flex-1">
            <div className="absolute left-0 right-0 top-1/2 border-t-2 border-dashed border-white/40" />
            <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-3xl" style={{ left: `${done * 100}%` }}>
              {flight.cabin === 'jet' ? '🛩️' : '✈️'}
            </div>
          </div>
          <Badge c={to} />
        </div>
        <div className="mt-6 text-3xl font-black">On the way to {to.capital}</div>
        <div className="mt-1 text-sm text-white/75">
          {to.name} · President {to.president} · “{to.motto}”
        </div>
        <div className="mt-4 font-mono text-xs text-white/60">Landing in {left}s</div>
      </div>
    </div>
  );
}

function Badge({ c }: { c: Country }) {
  return (
    <div className="flex flex-col items-center">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-black text-white shadow-lg"
        style={{ background: `linear-gradient(135deg, ${c.theme.gradient[0]}, ${c.theme.gradient[1]})` }}
      >
        {c.flag}
      </div>
      <div className="mt-1 text-xs font-bold">{c.ticker}</div>
    </div>
  );
}

function Welcome({ to }: { to: Country }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-[18%] z-40 w-[min(90vw,420px)] -translate-x-1/2 overflow-hidden rounded-3xl text-center text-white shadow-2xl" style={{ animation: 'tl-rise .4s ease-out', background: to.theme.ink }}>
      <div className="h-2" style={{ background: `linear-gradient(90deg, ${to.theme.gradient[0]}, ${to.theme.gradient[1]})` }} />
      <div className="px-6 py-5">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-3xl font-black" style={{ background: `linear-gradient(135deg, ${to.theme.gradient[0]}, ${to.theme.gradient[1]})` }}>
          {to.flag}
        </div>
        <div className="mt-3 text-xs font-semibold tracking-[0.25em] text-white/60">WELCOME TO</div>
        <div className="text-3xl font-black" style={{ color: to.theme.accent }}>
          {to.capital}
        </div>
        <div className="mt-1 text-sm text-white/70">
          President {to.president} · “{to.motto}”
        </div>
        <div className="mx-auto mt-3 inline-block -rotate-3 rounded-md border-2 px-3 py-1 text-xs font-black tracking-[0.2em]" style={{ borderColor: to.theme.accent, color: to.theme.accent }}>
          PASSPORT STAMPED · ADMITTED
        </div>
      </div>
    </div>
  );
}

const KEYFRAMES = `
@keyframes tl-cloud { from { transform: translateX(0) } to { transform: translateX(-140vw) } }
@keyframes tl-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes tl-rise { from { opacity: 0; transform: translate(-50%, 16px) } to { opacity: 1; transform: translate(-50%, 0) } }
`;
