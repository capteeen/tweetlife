'use client';
import { useEffect, useState } from 'react';
import { useWorld } from '@/components/world/store';
import { fullNumber } from '@/lib/format';
import { COUNTRIES } from '@/lib/world/countries';

// Top bar: time, mood, online, bags. Tapping the bags opens the wallet.
export function TopHUD({ online, handle }: { online: number | null; handle: string }) {
  const life = useWorld((s) => s.life);
  const openPhone = useWorld((s) => s.openPhone);
  const country = COUNTRIES[useWorld((s) => s.country)];
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);
  const me = life?.me ?? null;
  const day = now.toLocaleDateString('en', { weekday: 'short', day: 'numeric' });
  const time = now.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' });
  const hour = now.getHours();
  const icon = hour >= 6 && hour < 18 ? '☀️' : '🌙';
  return (
    <div className="pointer-events-auto absolute left-1/2 top-3 z-20 flex max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-2 rounded-full chrome px-2 py-1.5 text-sm sm:gap-3 sm:px-3">
      <span
        className="whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold"
        style={{ background: country.theme.ink, color: '#FFFFFF', boxShadow: `inset 0 0 0 1.5px ${country.theme.primary}` }}
        title={`${country.capital}, ${country.name}. President ${country.president}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={country.logo} alt={country.name} className="inline-block h-3.5 w-3.5 align-[-2px]" /> <span className="max-[420px]:hidden">{country.capital}</span>
      </span>
      <span className="num whitespace-nowrap px-1">
        {icon} <span className="max-[420px]:hidden">{day} · </span>
        {time}
      </span>
      <span className="h-4 w-px bg-white/15" />
      {me ? (
        <span className="whitespace-nowrap px-1" title="Your mood: average of Vibes, Clout and Gas">
          {me.moodEmoji} <span className={me.mood === 'Rekt' ? 'text-rose-300' : me.mood === 'Mooning' ? 'text-emerald-300' : ''}>{me.mood}</span>
        </span>
      ) : (
        <span className="whitespace-nowrap px-1 text-white/60">visiting @{handle}</span>
      )}
      {/* phones have no room for this; the bottom bar shows who's here instead */}
      <span className="h-4 w-px bg-white/15 max-[420px]:hidden" />
      <span className="num whitespace-nowrap px-1 text-white/80 max-[420px]:hidden" title="Visitors online in this world">
        <span className="text-emerald-400">●</span> {online == null ? '—' : online} online
      </span>
      {me && (
        <>
          <span className="h-4 w-px bg-white/15" />
          <button className="num flex items-center gap-2 whitespace-nowrap rounded-full bg-white/10 py-1 pl-3 pr-1 font-semibold hover:bg-white/15" onClick={() => openPhone('wallet')} title="Bags — in-world points, not money">
            {fullNumber(me.bags)} bags
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-base leading-none text-white">+</span>
          </button>
        </>
      )}
    </div>
  );
}
