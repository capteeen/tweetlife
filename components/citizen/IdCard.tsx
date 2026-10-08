'use client';
/* eslint-disable @next/next/no-img-element */
import { useId, useMemo, useState } from 'react';
import { countryOf, type Country, type CountryId } from '@/lib/world/countries';
import type { Citizenship } from '@/lib/life/citizen';
import type { Look } from '@/lib/life/look';

// The national ID card, styled per country with its coin's real logo and colours. The front has the
// holder's X profile picture and details; tap it to see the back (chip, barcode, the president's
// signature and a machine-readable zone). Shown in the phone, at sign-up and when travelling.

export type IdHolder = { name: string; handle: string; avatarUrl: string | null; look?: Look | null };

type Skin = {
  /** card background, layered */
  bg: string;
  /** field values */
  text: string;
  /** field labels, small print */
  label: string;
  /** rules, photo frame, guilloche lines */
  line: string;
  /** behind the logo in the corner badge */
  badge: string;
  /** the MRZ strip on the back */
  strip: string;
  /** the watermark logo is drawn dark on the light card */
  darkMark?: boolean;
};

const SKINS: Record<CountryId, Skin> = {
  solana: {
    bg: 'radial-gradient(120% 90% at 100% 0%, #14F19526 0%, transparent 55%), radial-gradient(90% 90% at 0% 100%, #9945FF59 0%, transparent 60%), linear-gradient(135deg, #1E1240 0%, #120B24 100%)',
    text: '#FFFFFF',
    label: '#B9A6E8',
    line: '#14F195',
    badge: '#120B24',
    strip: 'rgba(255,255,255,0.08)',
  },
  bnb: {
    bg: 'radial-gradient(110% 90% at 100% 0%, #F3BA2F2b 0%, transparent 55%), linear-gradient(135deg, #24272E 0%, #0B0E11 100%)',
    text: '#FFFFFF',
    label: '#D6AE4A',
    line: '#F3BA2F',
    badge: '#0B0E11',
    strip: 'rgba(243,186,47,0.10)',
  },
  robinhood: {
    bg: 'radial-gradient(110% 90% at 100% 100%, #00C80540 0%, transparent 60%), linear-gradient(135deg, #DDFF4D 0%, #CCFF00 45%, #B5EB00 100%)',
    text: '#07130A',
    label: '#3D5A00',
    line: '#07130A',
    badge: '#07130A',
    strip: 'rgba(7,19,10,0.08)',
    darkMark: true,
  },
};

/** Three-letter codes for the machine-readable zone. */
const MRZ_CODE: Record<CountryId, string> = { solana: 'SOL', bnb: 'BNB', robinhood: 'RHD' };

export function IdCard({ holder, citizen, side = 'front', flippable = true }: { holder: IdHolder; citizen: Citizenship; side?: 'front' | 'back'; flippable?: boolean }) {
  const [back, setBack] = useState(side === 'back');
  const c = countryOf(citizen.country);
  const skin = SKINS[c.id];
  const issued = new Date(citizen.since);
  const expires = new Date(issued);
  expires.setFullYear(issued.getFullYear() + 10);
  const flip = flippable ? () => setBack((b) => !b) : undefined;
  return (
    <div className="w-full" style={{ perspective: '1400px' }}>
      <div
        role={flippable ? 'button' : undefined}
        tabIndex={flippable ? 0 : undefined}
        onClick={flip}
        onKeyDown={(e) => flip && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), flip())}
        aria-label={`${c.name} national ID card${flippable ? ', tap to flip' : ''}`}
        className="relative w-full transition-transform duration-700 [transform-style:preserve-3d]"
        style={{ aspectRatio: '1.586', containerType: 'inline-size', WebkitTextSizeAdjust: '100%', transform: back ? 'rotateY(180deg)' : undefined, cursor: flippable ? 'pointer' : undefined }}
      >
        <Face skin={skin}>
          <Front c={c} skin={skin} holder={holder} citizen={citizen} issued={issued} expires={expires} />
        </Face>
        <Face skin={skin} back>
          <Back c={c} skin={skin} holder={holder} citizen={citizen} issued={issued} expires={expires} />
        </Face>
      </div>
      {flippable && <p className="mt-2 text-center text-xs text-white/45">Tap the card to see the {back ? 'front' : 'back'}</p>}
    </div>
  );
}

type SideProps = { c: Country; skin: Skin; holder: IdHolder; citizen: Citizenship; issued: Date; expires: Date };

function Face({ skin, back, children }: { skin: Skin; back?: boolean; children: React.ReactNode }) {
  return (
    <div
      className="absolute inset-0 overflow-hidden rounded-[4.2cqw] shadow-2xl [backface-visibility:hidden]"
      style={{ background: skin.bg, color: skin.text, transform: back ? 'rotateY(180deg)' : undefined, boxShadow: '0 20px 50px -20px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(255,255,255,0.08)' }}
    >
      <Guilloche color={skin.line} />
      {children}
    </div>
  );
}

function Front({ c, skin, holder, citizen, issued }: SideProps) {
  return (
    <>
      {/* big faint logo behind the details */}
      <img src={c.logo} alt="" aria-hidden className="pointer-events-none absolute -right-[8cqw] top-[12cqw] h-[50cqw] w-[50cqw]" style={{ opacity: skin.darkMark ? 0.06 : 0.07, filter: skin.darkMark ? 'brightness(0)' : undefined }} />
      <div className="relative flex h-full flex-col px-[4.4cqw] pb-[3.4cqw] pt-[3.8cqw]">
        <Header c={c} skin={skin} title="National Identity Card" />

        <div className="mt-[3cqw] flex gap-[4cqw]">
          <div className="flex w-[23cqw] shrink-0 flex-col">
            <div className="relative h-[28.5cqw] w-full shrink-0 overflow-hidden rounded-[2cqw]" style={{ boxShadow: `0 0 0 0.45cqw ${skin.line}` }}>
              <Photo holder={holder} />
            </div>
            <Signature seed={holder.name || holder.handle} color={skin.text} className="mt-[1.2cqw] h-[6cqw] w-full" />
            <p className="border-t pt-[0.5cqw] text-[1.7cqw] uppercase tracking-[0.12em]" style={{ color: skin.label, borderColor: `${skin.label}66` }}>
              Holder&apos;s signature
            </p>
          </div>

          <div className="relative min-w-0 flex-1">
            <div className="absolute right-0 top-0">
              <GhostPhoto holder={holder} />
            </div>
            <dl className="grid grid-cols-[1.15fr_1fr] content-start gap-x-[3cqw] gap-y-[3cqw]">
              <div className="col-span-2 pr-[9cqw]">
                <Field skin={skin} label="Full name" value={holder.name || holder.handle} big />
              </div>
              <Field skin={skin} label="X handle" value={`@${holder.handle}`} />
              <Field skin={skin} label="Nationality" value={c.demonym} />
              <Field skin={skin} label="Citizen no." value={citizen.citizenNo} />
              <Field skin={skin} label="Citizen since" value={idDate(issued)} />
            </dl>
          </div>
        </div>
      </div>
    </>
  );
}

function Back({ c, skin, holder, citizen, issued, expires }: SideProps) {
  const mrz = mrzLines(c, holder, citizen, issued, expires);
  return (
    <div className="relative flex h-full flex-col">
      <div className="flex flex-1 flex-col px-[4.4cqw] pt-[3.8cqw]">
        <div className="flex items-start gap-[3cqw]">
          <Chip />
          <div className="min-w-0 flex-1">
            <p className="text-[1.8cqw] uppercase tracking-[0.14em]" style={{ color: skin.label }}>
              Citizen no.
            </p>
            <p className="text-[3.4cqw] font-semibold tabular-nums tracking-wide">{citizen.citizenNo}</p>
            <Barcode seed={citizen.citizenNo} color={skin.text} className="mt-[0.8cqw] h-[4.5cqw] w-full" />
          </div>
          <img src={c.logo} alt="" className="h-[11cqw] w-[11cqw] shrink-0 rounded-[2.4cqw] p-[1.8cqw]" style={{ background: skin.badge }} />
        </div>

        <div className="mt-[2cqw] grid grid-cols-3 gap-x-[3cqw]">
          <Field skin={skin} label="Place of issue" value={c.capital} />
          <Field skin={skin} label="Date of issue" value={idDate(issued)} />
          <Field skin={skin} label="Expires" value={idDate(expires)} />
        </div>
        <p className="mt-[1.6cqw] text-[2.05cqw] leading-snug" style={{ color: skin.label }}>
          The bearer is a citizen of the <b style={{ color: skin.text }}>Republic of {c.name}</b> and may fly to every other country in Tweetlife.
        </p>

        <div className="mt-auto flex items-end justify-between gap-[3cqw] pb-[1.6cqw]">
          <div className="min-w-0">
            <Signature seed={c.presidentHandle} color={skin.text} className="h-[5cqw] w-[26cqw]" />
            <p className="border-t pt-[0.6cqw] text-[1.9cqw]" style={{ borderColor: `${skin.label}66`, color: skin.label }}>
              <b style={{ color: skin.text }}>{c.president}</b> · President of {c.name}
            </p>
          </div>
          <p className="text-right text-[2.1cqw] italic" style={{ color: skin.label }}>
            “{c.motto}”
          </p>
        </div>
      </div>
      <div className="px-[4.4cqw] py-[1.6cqw] text-[2.55cqw] font-medium leading-[1.3] tracking-[0.16em]" style={{ background: skin.strip, fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}>
        {mrz.map((l) => (
          <p key={l} className="whitespace-pre">
            {l}
          </p>
        ))}
      </div>
    </div>
  );
}

function Header({ c, skin, title, seal = true }: { c: Country; skin: Skin; title: string; seal?: boolean }) {
  return (
    <div className="flex items-center gap-[2.4cqw] border-b pb-[2.4cqw]" style={{ borderColor: `${skin.line}55` }}>
      <span className="flex h-[9cqw] w-[9cqw] shrink-0 items-center justify-center rounded-[2.2cqw]" style={{ background: skin.badge }}>
        <img src={c.logo} alt={`${c.name} logo`} className="h-[5.6cqw] w-[5.6cqw]" />
      </span>
      <div className="min-w-0 leading-tight">
        <p className="text-[2.1cqw] font-semibold uppercase tracking-[0.22em]" style={{ color: skin.label }}>
          Republic of {c.name} · ${c.ticker}
        </p>
        <p className="text-[3.7cqw] font-bold uppercase tracking-[0.04em]">{title}</p>
      </div>
      <div className="ml-auto">{seal ? <Seal c={c} skin={skin} /> : null}</div>
    </div>
  );
}

function Field({ skin, label, value, big }: { skin: Skin; label: string; value: string; big?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[1.8cqw] font-medium uppercase tracking-[0.14em]" style={{ color: skin.label }}>
        {label}
      </dt>
      <dd className={`truncate font-semibold tabular-nums leading-tight ${big ? 'text-[3.9cqw]' : 'text-[2.9cqw]'}`}>{value}</dd>
    </div>
  );
}

/** The holder's X profile picture at full size; their look drawn as a bust if there is none or it fails. */
function Photo({ holder }: { holder: IdHolder }) {
  const [failed, setFailed] = useState(false);
  if (!holder.avatarUrl || failed) return <Portrait look={holder.look ?? null} />;
  return (
    <img src={bigAvatar(holder.avatarUrl)} alt={`@${holder.handle}`} className="h-full w-full object-cover" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  );
}

/** The small see-through copy of the photo that real ID cards print next to the seal. */
function GhostPhoto({ holder }: { holder: IdHolder }) {
  const [failed, setFailed] = useState(false);
  if (!holder.avatarUrl || failed) return null;
  return (
    <img src={bigAvatar(holder.avatarUrl)} alt="" aria-hidden className="h-[8cqw] w-[6.4cqw] rounded-[0.8cqw] object-cover opacity-30 grayscale" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  );
}

/** X serves 48px "_normal" pictures by default; the card wants the 400px one. */
const bigAvatar = (url: string) => url.replace(/_normal(\.\w+)$/, '_400x400$1');

/** A round holographic seal: the coin's logo inside a ring of small print. */
function Seal({ c, skin }: { c: Country; skin: Skin }) {
  const id = useId().replace(/:/g, '');
  const ring = `REPUBLIC OF ${c.name.toUpperCase()} · OFFICIAL · ${c.ticker} · `;
  return (
    <div className="relative -my-[1cqw] h-[11cqw] w-[11cqw] shrink-0">
      <div
        className="absolute inset-0 rounded-full"
        style={{ background: 'conic-gradient(from 30deg, #ff7ad955, #7afcff55, #fffb7a55, #9d7aff55, #ff7ad955)', mixBlendMode: skin.darkMark ? 'multiply' : 'screen', boxShadow: `inset 0 0 0 0.3cqw ${skin.line}66` }}
      />
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        <defs>
          <path id={`r${id}`} d="M50 50 m-38 0 a38 38 0 1 1 76 0 a38 38 0 1 1 -76 0" />
        </defs>
        <text fontSize="10.5" fontWeight="700" letterSpacing="1.2" fill={skin.text} opacity="0.7">
          <textPath href={`#r${id}`}>{ring}</textPath>
        </text>
      </svg>
      <img src={c.logo} alt="" aria-hidden className="absolute inset-[30%] h-[40%] w-[40%]" style={{ filter: skin.darkMark ? 'brightness(0)' : undefined }} />
    </div>
  );
}

/** Fine wavy security lines across the card, like the guilloche print on banknotes and IDs. */
function Guilloche({ color }: { color: string }) {
  const paths = useMemo(() => {
    const out: string[] = [];
    for (let k = 0; k < 18; k++) {
      let d = '';
      for (let x = 0; x <= 160; x += 2) {
        const y = 8 + k * 5.4 + Math.sin(x / 9 + k * 0.7) * 3.2 + Math.sin(x / 23 - k) * 2.4;
        d += `${x === 0 ? 'M' : 'L'}${x} ${y.toFixed(2)} `;
      }
      out.push(d);
    }
    return out;
  }, []);
  return (
    <svg viewBox="0 0 160 101" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={color} strokeWidth="0.18" opacity="0.22" />
      ))}
    </svg>
  );
}

/** A handwritten-looking signature (loops and a flourish), the same every time for the same name. */
function Signature({ seed, color, className }: { seed: string; color: string; className?: string }) {
  const d = useMemo(() => {
    const r = rng(seed);
    const f = (n: number) => n.toFixed(1);
    // a tall opening capital
    let x = 6;
    let y = 20;
    let p = `M${x} ${y} C${f(x + 2)} ${f(2 + r() * 3)}, ${f(x + 9)} ${f(1 + r() * 3)}, ${f(x + 6)} ${f(14 + r() * 3)}`;
    x += 6;
    y = 16;
    const n = 4 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const dx = 6 + r() * 6;
      const amp = 5 + r() * 9;
      const loop = r() < 0.55;
      const nx = x + dx;
      const ny = 14 + r() * 8;
      // a loop doubles back: first handle past the end, second before the start
      p += loop
        ? ` C${f(nx + dx * 0.5)} ${f(y - amp)}, ${f(x - dx * 0.4)} ${f(y - amp)}, ${f(nx)} ${f(ny)}`
        : ` C${f(x + dx * 0.3)} ${f(y + amp * 0.6)}, ${f(nx - dx * 0.3)} ${f(ny - amp)}, ${f(nx)} ${f(ny)}`;
      x = nx;
      y = ny;
    }
    // trailing stroke and an underline swoosh
    p += ` C${f(x + 6)} ${f(y + 6)}, ${f(x + 10)} ${f(y - 4)}, ${f(Math.min(x + 14, 96))} ${f(y - 6)}`;
    p += ` M${f(4 + r() * 4)} ${f(26 + r() * 2)} Q${f(x * 0.5)} ${f(21 + r() * 3)} ${f(Math.min(x + 10, 97))} ${f(23 + r() * 3)}`;
    return p;
  }, [seed]);
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="xMinYMid meet" className={className} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
    </svg>
  );
}

function Barcode({ seed, color, className }: { seed: string; color: string; className?: string }) {
  const bars = useMemo(() => {
    const r = rng(seed);
    const out: { x: number; w: number }[] = [];
    let x = 0;
    while (x < 196) {
      const w = 0.8 + Math.floor(r() * 3) * 0.8;
      out.push({ x, w });
      x += w + 0.8 + Math.floor(r() * 2) * 0.8;
    }
    return out;
  }, [seed]);
  return (
    <svg viewBox="0 0 200 20" preserveAspectRatio="none" className={className} aria-hidden>
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y="0" width={b.w} height="20" fill={color} />
      ))}
    </svg>
  );
}

function Chip() {
  return (
    <svg viewBox="0 0 40 30" className="h-[8.5cqw] w-[11.3cqw] shrink-0" aria-hidden>
      <defs>
        <linearGradient id="idchip" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F6E3A1" />
          <stop offset="0.5" stopColor="#C9A54A" />
          <stop offset="1" stopColor="#EED68A" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="39" height="29" rx="5" fill="url(#idchip)" stroke="#8C6E22" strokeWidth="0.6" />
      <path d="M0.5 10 H13 M0.5 20 H13 M27 10 H39.5 M27 20 H39.5 M13 0.5 V29.5 M27 0.5 V29.5 M13 15 H27" stroke="#8C6E22" strokeWidth="0.6" fill="none" />
      <rect x="15.5" y="7" width="9" height="16" rx="2.5" fill="none" stroke="#8C6E22" strokeWidth="0.6" />
    </svg>
  );
}

/** No X photo: a passport-style bust drawn from the player's in-game look. */
function Portrait({ look }: { look: Look | null }) {
  const skin = look?.skin ?? '#A66E4B';
  const hair = look?.hair ?? '#1A120D';
  const shirt = look?.shirt ?? '#1D9BF0';
  const style = look?.hairStyle ?? 'crop';
  return (
    <svg viewBox="0 0 60 75" className="h-full w-full" style={{ background: 'linear-gradient(180deg,#d9dee7,#aab3c2)' }}>
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

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const idDate = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
const yymmdd = (d: Date) => `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
const mrzText = (s: string) =>
  s
    .normalize('NFKD')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .trim()
    .replace(/\s+/g, '<');

/** ICAO 9303 check digit (weights 7, 3, 1). */
function checkDigit(s: string) {
  const v = (ch: string) => (ch === '<' ? 0 : /\d/.test(ch) ? Number(ch) : ch.charCodeAt(0) - 55);
  return String([...s].reduce((sum, ch, i) => sum + v(ch) * [7, 3, 1][i % 3], 0) % 10);
}

/** The three 30-character lines of a TD1 (credit-card size) ID's machine-readable zone. */
function mrzLines(c: Country, holder: IdHolder, citizen: Citizenship, issued: Date, expires: Date) {
  const code = MRZ_CODE[c.id];
  const doc = citizen.citizenNo.replace(/\D/g, '').slice(-8).padEnd(9, '<');
  const l1 = `I<${code}${doc}${checkDigit(doc)}`.padEnd(30, '<');
  const l2 = `${yymmdd(issued)}${checkDigit(yymmdd(issued))}<${yymmdd(expires)}${checkDigit(yymmdd(expires))}${code}`.padEnd(29, '<');
  const words = mrzText(holder.name || holder.handle).split('<').filter(Boolean);
  const name = words.length > 1 ? `${words[words.length - 1]}<<${words.slice(0, -1).join('<')}` : `${words[0] ?? mrzText(holder.handle)}<<`;
  return [l1.slice(0, 30), (l2 + checkDigit(l2)).slice(0, 30), name.padEnd(30, '<').slice(0, 30)];
}

function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
