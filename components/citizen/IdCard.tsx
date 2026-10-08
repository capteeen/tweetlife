'use client';
import { countryOf, type Country, type CountryId } from '@/lib/world/countries';
import type { Citizenship } from '@/lib/life/citizen';
import type { Look } from '@/lib/life/look';

// The national ID card, styled per country in its coin's colours: Solana's purple-to-green bars,
// BNB's gold diamonds on black, Robinhood's green feather. Shown in the phone and when travelling.

export type IdHolder = { name: string; handle: string; avatarUrl: string | null; look?: Look | null };

export function IdCard({ holder, citizen }: { holder: IdHolder; citizen: Citizenship }) {
  const c = countryOf(citizen.country);
  const style = STYLES[c.id];
  const since = new Date(citizen.since);
  const mrz = `ID${c.ticker}<<${holder.handle.toUpperCase().replace(/[^A-Z0-9]/g, '<')}<<${citizen.citizenNo.replace(/-/g, '')}`.padEnd(44, '<').slice(0, 44);
  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl shadow-2xl"
      style={{ aspectRatio: '1.586', background: style.bg, color: style.text, containerType: 'inline-size' }}
      aria-label={`${c.name} national ID card`}
    >
      <div className="pointer-events-none absolute -right-[6%] top-1/2 h-[120%] w-[60%] -translate-y-1/2" style={{ opacity: style.markOpacity }}>
        <Emblem id={c.id} country={c} />
      </div>
      <div className="relative flex h-full flex-col justify-between p-[4.5cqw]">
        <div className="flex items-center gap-[2cqw]">
          <span className="flex h-[8cqw] w-[8cqw] items-center justify-center rounded-[1.6cqw] text-[4.6cqw] font-bold" style={{ background: style.chip, color: style.chipText }}>
            {c.flag}
          </span>
          <div className="leading-tight">
            <p className="text-[2.4cqw] font-semibold uppercase tracking-[0.18em] opacity-75">Republic of {c.name}</p>
            <p className="text-[3.6cqw] font-bold uppercase tracking-wide">National ID card</p>
          </div>
          <span className="ml-auto rounded-full px-[2cqw] py-[0.6cqw] text-[2.4cqw] font-bold" style={{ background: style.chip, color: style.chipText }}>
            ${c.ticker}
          </span>
        </div>

        <div className="mt-[3cqw] flex gap-[4cqw]">
          <div className="relative h-[29cqw] w-[23cqw] shrink-0 overflow-hidden rounded-[2cqw]" style={{ background: style.photoBg, boxShadow: `0 0 0 0.5cqw ${style.photoRing}` }}>
            {holder.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={holder.avatarUrl.replace('_normal', '_400x400')} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <Portrait look={holder.look ?? null} />
            )}
          </div>
          <div className="grid min-w-0 flex-1 grid-cols-2 content-start gap-x-[3cqw] gap-y-[2.6cqw]">
            <Field label="Name" value={holder.name || holder.handle} wide />
            <Field label="Handle" value={`@${holder.handle}`} />
            <Field label="Nationality" value={c.demonym} />
            <Field label="Citizen no." value={citizen.citizenNo} mono />
            <Field label="Citizen since" value={since.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })} />
          </div>
        </div>

        <div>
          <p className="truncate text-[2.2cqw] italic opacity-70">
            Issued in {c.capital} under President {c.president} · “{c.motto}”
          </p>
          <p className="mt-[1cqw] truncate font-mono text-[2.6cqw] tracking-[0.12em] opacity-60">{mrz}</p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, wide, mono }: { label: string; value: string; wide?: boolean; mono?: boolean }) {
  return (
    <div className={`min-w-0 ${wide ? 'col-span-2' : ''}`}>
      <p className="text-[2.1cqw] uppercase tracking-[0.14em] opacity-60">{label}</p>
      <p className={`truncate text-[3.4cqw] font-semibold leading-tight ${mono ? 'font-mono tracking-wide' : ''}`}>{value}</p>
    </div>
  );
}

const STYLES: Record<CountryId, { bg: string; text: string; chip: string; chipText: string; photoBg: string; photoRing: string; markOpacity: number }> = {
  solana: {
    bg: 'radial-gradient(circle at 100% 0%, #14F19544 0%, transparent 45%), radial-gradient(circle at 0% 100%, #9945FF66 0%, transparent 55%), linear-gradient(135deg, #1B0F38 0%, #120B24 100%)',
    text: '#FFFFFF',
    chip: 'linear-gradient(135deg, #9945FF, #14F195)',
    chipText: '#120B24',
    photoBg: '#2A1B52',
    photoRing: '#14F195',
    markOpacity: 0.22,
  },
  bnb: {
    bg: 'repeating-linear-gradient(45deg, #F3BA2F0d 0 2px, transparent 2px 14px), linear-gradient(135deg, #1E2026 0%, #0B0E11 100%)',
    text: '#FCD535',
    chip: '#F3BA2F',
    chipText: '#0B0E11',
    photoBg: '#2B2F36',
    photoRing: '#F3BA2F',
    markOpacity: 0.18,
  },
  robinhood: {
    bg: 'radial-gradient(circle at 100% 100%, #CCFF0055 0%, transparent 50%), linear-gradient(135deg, #00C805 0%, #00A004 55%, #0B1F0C 100%)',
    text: '#07130A',
    chip: '#07130A',
    chipText: '#CCFF00',
    photoBg: '#0B1F0C',
    photoRing: '#CCFF00',
    markOpacity: 0.2,
  },
};

/** No X photo: a passport-style bust drawn from the player's in-game look. */
function Portrait({ look }: { look: Look | null }) {
  const skin = look?.skin ?? '#A66E4B';
  const hair = look?.hair ?? '#1A120D';
  const shirt = look?.shirt ?? '#1D9BF0';
  const style = look?.hairStyle ?? 'crop';
  return (
    <svg viewBox="0 0 60 75" className="h-full w-full">
      <path d="M6 75 C6 58 16 52 30 52 C44 52 54 58 54 75 Z" fill={shirt} />
      <rect x="25" y="42" width="10" height="12" rx="3" fill={skin} />
      {style === 'afro' && <circle cx="30" cy="27" r="19" fill={hair} />}
      {(style === 'long' || style === 'braids' || style === 'locs') && <rect x="14" y="20" width="32" height="34" rx="10" fill={hair} />}
      <ellipse cx="30" cy="30" rx="13" ry="15" fill={skin} />
      {style !== 'bald' && style !== 'afro' && <path d="M17 28 C17 14 43 14 43 28 C40 21 20 21 17 28 Z" fill={hair} />}
      {style === 'cap' && <path d="M16 24 C16 12 44 12 44 24 L50 26 L16 26 Z" fill={shirt} />}
      {style === 'bun' && <circle cx="30" cy="13" r="6" fill={hair} />}
      <circle cx="25" cy="31" r="1.4" fill="#0B0E14" />
      <circle cx="35" cy="31" r="1.4" fill="#0B0E14" />
      <path d="M26 37 Q30 39.5 34 37" stroke="#0B0E14" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** Each coin's logo shape as a big watermark. */
function Emblem({ id, country }: { id: CountryId; country: Country }) {
  const [a, b] = country.theme.gradient;
  if (id === 'solana')
    return (
      <svg viewBox="0 0 100 100" className="h-full w-full">
        <defs>
          <linearGradient id="sol-g" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor={a} />
            <stop offset="1" stopColor={b} />
          </linearGradient>
        </defs>
        {[22, 44, 66].map((y, i) => (
          <polygon key={y} fill="url(#sol-g)" points={i === 1 ? `10,${y} 80,${y} 90,${y + 12} 20,${y + 12}` : `20,${y} 90,${y} 80,${y + 12} 10,${y + 12}`} />
        ))}
      </svg>
    );
  if (id === 'bnb')
    return (
      <svg viewBox="0 0 100 100" className="h-full w-full" fill={a}>
        <rect x="40" y="40" width="20" height="20" transform="rotate(45 50 50)" />
        <rect x="42" y="14" width="16" height="16" transform="rotate(45 50 22)" />
        <rect x="42" y="70" width="16" height="16" transform="rotate(45 50 78)" />
        <rect x="14" y="42" width="16" height="16" transform="rotate(45 22 50)" />
        <rect x="70" y="42" width="16" height="16" transform="rotate(45 78 50)" />
      </svg>
    );
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" fill="#07130A">
      {/* a quill feather */}
      <path d="M78 8 C48 14 26 40 22 76 L18 92 L24 90 L30 78 C54 74 74 52 82 22 C70 34 56 40 44 42 C58 34 70 22 78 8 Z" />
    </svg>
  );
}
