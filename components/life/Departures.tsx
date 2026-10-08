'use client';
import { useState } from 'react';
import { useWorld } from '@/components/world/store';
import { CABINS, JET_ITEM, flightNumber } from '@/lib/life/flights';
import { COUNTRY_LIST, COUNTRIES, type Country } from '@/lib/world/countries';
import { checkIn, flyMyPlane } from './flight';

// The departures board. Three uses:
//  - 'info'    in the Airport's sheet: what flies where, and the way to the check-in desks
//  - 'checkin' at a check-in desk: pick a destination and a seat, pay, get a boarding pass
//  - 'jet'     at your own plane: pick a destination and go
export function Departures({ mode, onGo }: { mode: 'info' | 'checkin' | 'jet'; onGo?: () => void }) {
  const me = useWorld((s) => s.life?.me ?? null);
  const assets = useWorld((s) => s.life?.assets ?? []);
  const country = useWorld((s) => s.country);
  const pass = useWorld((s) => s.airport.pass);
  const openPhone = useWorld((s) => s.openPhone);
  const [pick, setPick] = useState<string | null>(mode === 'info' ? null : COUNTRY_LIST.find((c) => c.id !== country)?.id ?? null);
  const [cabin, setCabin] = useState<'economy' | 'first'>('economy');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const hasJet = assets.some((a) => a.id === JET_ITEM);
  const home = me?.citizen?.country ?? 'solana';
  const here = COUNTRIES[country];
  const rows = COUNTRY_LIST.filter((c) => c.id !== country);
  const seat = CABINS.find((c) => c.id === cabin)!;

  const go = async (c: Country) => {
    setBusy(true);
    setMsg(null);
    try {
      if (mode === 'jet') await flyMyPlane(c.id);
      else await checkIn(c.id, cabin);
      onGo?.();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0B0F17]">
      <div className="flex items-center justify-between bg-[#F4C430] px-3 py-1.5 text-[#0B0F17]">
        <span className="text-xs font-black tracking-[0.2em]">{mode === 'jet' ? '🛩️ YOUR FLIGHT PLAN' : '✈ DEPARTURES'}</span>
        <span className="text-[10px] font-bold">
          {here.flag} {here.capital.toUpperCase()} INTL
        </span>
      </div>
      <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 px-3 pt-2 font-mono text-[10px] text-white/40">
        <span>FLIGHT</span>
        <span>DESTINATION</span>
        <span>FARE</span>
        <span className="text-right">STATUS</span>
      </div>
      <div className="divide-y divide-white/5">
        {rows.map((c) => {
          const open = pick === c.id && mode !== 'info';
          const fare = mode === 'jet' ? 0 : CABINS[0].bags;
          const mine = pass?.to === c.id;
          return (
            <div key={c.id}>
              <button
                className={`grid w-full grid-cols-[auto_1fr_auto_auto] items-center gap-x-3 px-3 py-2 text-left font-mono transition hover:bg-white/5 ${open ? 'bg-white/5' : ''}`}
                onClick={() => setPick(open ? null : c.id)}
              >
                <span className="text-xs font-bold text-[#F4C430]">{mode === 'jet' ? 'PVT' : flightNumber(country, c.id)}</span>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md p-0.5" style={{ background: `linear-gradient(135deg, ${c.theme.gradient[0]}, ${c.theme.gradient[1]})` }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.logo} alt="" className="h-full w-full object-contain" />
                  </span>
                  <span className="truncate text-sm font-bold uppercase tracking-wide text-white">{c.capital}</span>
                  {c.id === home && <span className="rounded bg-white/10 px-1 text-[9px] font-semibold text-white/70">HOME</span>}
                </span>
                <span className="text-xs text-white/80">{fare ? `${fare.toLocaleString()} bags` : 'FREE'}</span>
                <span className={`text-right text-[10px] font-bold ${mine ? 'text-[#F4C430]' : 'text-[#06D6A0]'}`}>{mine ? 'YOUR PASS' : mode === 'jet' ? 'READY' : 'ON TIME'}</span>
              </button>
              {open && me && (
                <div className="px-3 pb-3">
                  <div className="text-[11px] text-white/50">
                    President {c.president} · {c.motto}
                  </div>
                  {mode === 'checkin' && (
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      {CABINS.filter((k) => k.id !== 'jet').map((k) => (
                        <button
                          key={k.id}
                          onClick={() => setCabin(k.id as 'economy' | 'first')}
                          className={`rounded-xl px-2 py-2 text-left transition ${cabin === k.id ? 'bg-white/15 ring-1 ring-[#F4C430]' : 'bg-white/5 hover:bg-white/10'}`}
                        >
                          <span className="block text-base leading-none">{k.emoji}</span>
                          <span className="mt-1 block text-[11px] font-semibold leading-tight">{k.name}</span>
                          <span className="block text-[10px] text-white/55">
                            {k.bags.toLocaleString()} bags · {k.blurb}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    className="btn mt-2 w-full !rounded-xl !py-2.5 font-bold"
                    style={{ background: `linear-gradient(90deg, ${c.theme.gradient[0]}, ${c.theme.gradient[1]})`, color: '#0B0F17' }}
                    disabled={busy || (mode === 'checkin' && me.bags < seat.bags)}
                    onClick={() => go(c)}
                  >
                    {busy ? 'One moment…' : mode === 'jet' ? `Fly to ${c.capital}` : `Check in to ${c.capital} · ${seat.bags.toLocaleString()} bags`}
                  </button>
                  {mode === 'checkin' && me.bags < seat.bags && <p className="mt-1.5 text-[11px] text-white/50">You need {(seat.bags - me.bags).toLocaleString()} more bags.</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {mode === 'info' && (
        <div className="space-y-1.5 px-3 pb-3 pt-1 text-[11px] text-white/55">
          <p>Walk in through the main doors, check in at a desk, go through security and board at Gate A2.</p>
          {hasJet ? (
            <p>Your own plane is on its stand on the apron. Walk up to it to fly anywhere for free.</p>
          ) : (
            <button className="text-[#BFE3FF] underline-offset-2 hover:underline" onClick={() => openPhone('market', 'plane')}>
              🛩️ Own a plane: it gets a stand here with your name on it, and every flight is free
            </button>
          )}
        </div>
      )}
      {msg && <p className="px-3 pb-2 text-xs text-[#FF8A8A]">{msg}</p>}
      {!me && <p className="px-3 pb-2 text-xs text-white/50">Sign in with X to fly.</p>}
    </div>
  );
}
