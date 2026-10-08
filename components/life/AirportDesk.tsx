'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorld } from '@/components/world/store';
import { airportLayout } from '@/lib/world/layout';
import { terminalLayout, zoneOf } from '@/lib/world/terminal';
import { JET_ITEM } from '@/lib/life/flights';
import { COUNTRIES } from '@/lib/world/countries';
import { IdCard } from '@/components/citizen/IdCard';
import { Departures } from './Departures';
import { boardAtGate, standOf } from './flight';

// Walking through the terminal: watches where you are and offers what's in front of you (a check-in desk,
// the gate, your own plane), lets you through security once you hold a pass, and opens the desk you use.

type Prompt = { label: string; sheet: 'checkin' | 'gate' | 'jet' } | null;

export function AirportDesk() {
  const g = useWorld((s) => s.model?.geometry);
  const me = useWorld((s) => s.life?.me ?? null);
  const ownsPlane = useWorld((s) => !!s.life?.assets?.some((a) => a.id === JET_ITEM));
  const airport = useWorld((s) => s.airport);
  const flight = useWorld((s) => s.flight);
  const patch = useWorld((s) => s.patchAirport);
  const [prompt, setPrompt] = useState<Prompt>(null);
  const lastZone = useRef<string>('outside');
  const told = useRef(0);
  const t = useMemo(() => (g ? terminalLayout(airportLayout(g.contentRadius, g.boundaryRadius)) : null), [g]);
  const stand = useMemo(() => (g ? standOf(airportLayout(g.contentRadius, g.boundaryRadius)) : null), [g]);

  useEffect(() => {
    if (!t || !stand || !me) return;
    const tick = setInterval(() => {
      const s = useWorld.getState();
      if (s.flight) return setPrompt(null);
      const p = s.playerPos;
      const zone = zoneOf(t, p.x, p.z);
      const near = (q: { x: number; z: number }, r: number) => Math.hypot(p.x - q.x, p.z - q.z) < r;
      // security: crossing from check-in into the gate lounge through the arch
      if (lastZone.current === 'checkin' && zone === 'gate') {
        if (s.airport.pass) {
          if (!s.airport.cleared) {
            s.patchAirport({ cleared: true });
            s.pushToast('✅ Through security. Your gate is A2, straight ahead.', 'travel');
          }
        } else if (Date.now() - told.current > 8000) {
          told.current = Date.now();
          s.pushToast('🛂 Security wants a boarding pass. Check in at a desk first.', 'travel');
        }
      }
      lastZone.current = zone;
      if (zone !== s.airport.zone) s.patchAirport({ zone });
      if (zone === 'checkin' && t.kiosks.some((k) => near(k, 2.6))) return setPrompt({ label: s.airport.pass ? '🧾 Change your booking' : '🧾 Check in', sheet: 'checkin' });
      if (zone === 'gate' && near(t.gateDesk, 3.2)) return setPrompt({ label: s.airport.pass ? `🛫 Board ${s.airport.pass.number}` : '🛫 Gate A2', sheet: 'gate' });
      if (zone === 'outside' && ownsPlane && near(stand, 9)) return setPrompt({ label: '🛩️ Fly your plane', sheet: 'jet' });
      setPrompt(null);
    }, 150);
    return () => clearInterval(tick);
  }, [t, stand, me, ownsPlane]);

  if (!me || flight) return null;
  const open = airport.sheet;
  return (
    <>
      {prompt && !open && (
        <button
          className="pointer-events-auto absolute bottom-20 [@media(any-pointer:coarse)]:bottom-56 left-1/2 z-30 -translate-x-1/2 rounded-full bg-[#F4C430] px-5 py-2.5 text-sm font-bold text-[#0B0F17] shadow-lg hover:brightness-105"
          onClick={() => patch({ sheet: prompt.sheet })}
        >
          {prompt.label}
        </button>
      )}
      {open && (
        <div className="pointer-events-auto absolute bottom-20 left-1/2 z-30 max-h-[calc(100vh-7rem)] w-[min(94vw,520px)] -translate-x-1/2 overflow-y-auto rounded-3xl chrome p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-lg font-bold">{open === 'checkin' ? 'Check-in' : open === 'gate' ? 'Gate A2' : 'Your plane'}</div>
              <div className="text-xs text-white/55">
                {open === 'checkin' ? 'Pick where you are going and your seat. Bags are charged now.' : open === 'gate' ? 'Show your pass and ID, then walk out to the plane.' : 'No desks, no queue. Pick a country.'}
              </div>
            </div>
            <button className="rounded-full px-2 py-0.5 hover:bg-white/10" onClick={() => patch({ sheet: null })} aria-label="Close">
              ✕
            </button>
          </div>
          {open === 'checkin' && <Departures mode="checkin" onGo={() => patch({ sheet: null })} />}
          {open === 'jet' && <Departures mode="jet" />}
          {open === 'gate' && <Gate />}
        </div>
      )}
    </>
  );
}

function Gate() {
  const me = useWorld((s) => s.life?.me ?? null);
  const pass = useWorld((s) => s.airport.pass);
  const cleared = useWorld((s) => s.airport.cleared);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  if (!pass) return <p className="text-sm text-white/70">No boarding pass yet. The check-in desks are back past security, by the main doors.</p>;
  const to = COUNTRIES[pass.to];
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-[#0B0F17]">
        <div>
          <div className="text-[10px] font-semibold text-black/45">FLIGHT {pass.number}</div>
          <div className="text-xl font-black">
            {COUNTRIES[pass.from].ticker} → {to.ticker}
          </div>
          <div className="text-[11px] text-black/60">
            {to.capital} · {pass.cabin === 'first' ? 'First class' : 'Economy'}
          </div>
        </div>
        <div className="text-right text-[11px] font-semibold text-[#06A77D]">{cleared ? '✓ Security cleared' : 'Security not cleared'}</div>
      </div>
      <IdCard holder={{ name: me.name, handle: me.handle, avatarUrl: me.avatarUrl, look: me.look }} citizen={me.citizen} flippable={false} />
      <button
        className="btn w-full !rounded-xl !py-2.5 font-bold"
        style={{ background: `linear-gradient(90deg, ${to.theme.gradient[0]}, ${to.theme.gradient[1]})`, color: '#0B0F17' }}
        disabled={!cleared || busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          try {
            await boardAtGate();
          } catch (e) {
            setMsg((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Scanning…' : `Board ${pass.number} to ${to.capital}`}
      </button>
      {!cleared && <p className="text-[11px] text-white/50">Go back through the security arch with your pass first.</p>}
      {msg && <p className="text-xs text-[#FF8A8A]">{msg}</p>}
    </div>
  );
}
