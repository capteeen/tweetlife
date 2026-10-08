'use client';
import { useEffect, useState } from 'react';
import { useWorld } from '@/components/world/store';

// First visit: three cards that say what bags are, how to earn them, and what the stats do, then point at the Phone.
// Shown once per browser; Phone → Settings can bring it back.

const SEEN = 'tl_welcome_v1';

const CARDS = [
  {
    emoji: '👜',
    title: 'Bags are your money',
    body: 'You start with 10,000 bags. Spend them on rides, furniture, cars, nights out and paper coins in the Trenches. Bags are in-game points, not real money.',
  },
  {
    emoji: '💼',
    title: 'Earn more on the Hustle',
    body: 'Open your Phone and tap Hustle. Daily quests pay bags for things you do anyway: saying GM to people, lighting lanterns on posts, visiting other worlds.',
  },
  {
    emoji: '⚡',
    title: 'Keep your stats up',
    body: '🎉 Vibes is fun, 💬 Clout is your social life, and ⚡ Gas is energy. Walking burns gas, so sleep at home to refill it. Clubs, the gym and the lounge move the others.',
  },
] as const;

/** The guided first day covers the same ground, so finishing or skipping it retires these cards too. */
export function markWelcomeSeen() {
  try {
    localStorage.setItem(SEEN, '1');
  } catch {}
}

export function showWelcomeAgain() {
  try {
    localStorage.removeItem(SEEN);
  } catch {}
  window.dispatchEvent(new Event('tl-welcome'));
}

export function Welcome() {
  const me = useWorld((s) => s.life?.me ?? null);
  // a new player gets the guided first day (FirstDay.tsx) instead of these cards
  const touring = useWorld((s) => s.life?.firstDay?.state === 'active');
  const openPhone = useWorld((s) => s.openPhone);
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    const check = () => {
      let seen = false;
      try {
        seen = localStorage.getItem(SEEN) === '1';
      } catch {}
      if (!seen) {
        setI(0);
        setOpen(true);
      }
    };
    if (me) check();
    window.addEventListener('tl-welcome', check);
    return () => window.removeEventListener('tl-welcome', check);
    // only the first time the player loads, not on every stat tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!me]);

  if (!open || !me || touring) return null;
  const close = (thenPhone: boolean) => {
    try {
      localStorage.setItem(SEEN, '1');
    } catch {}
    setOpen(false);
    if (thenPhone) openPhone('hustle');
  };
  const card = CARDS[i];
  const last = i === CARDS.length - 1;
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-sm rounded-3xl border border-white/12 bg-[#0B0E14]/90 p-6 text-center shadow-2xl backdrop-blur-md">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#BFE3FF]">Welcome, @{me.handle}</div>
        <div className="mt-4 text-5xl leading-none">{card.emoji}</div>
        <h2 className="mt-3 text-xl font-bold">{card.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/75">{card.body}</p>
        <div className="mt-5 flex items-center justify-center gap-1.5">
          {CARDS.map((_, n) => (
            <span key={n} className={`h-1.5 rounded-full transition-all ${n === i ? 'w-5 bg-[#1D9BF0]' : 'w-1.5 bg-white/25'}`} />
          ))}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button className="btn-ghost !py-2.5" onClick={() => (i === 0 ? close(false) : setI(i - 1))}>
            {i === 0 ? 'Skip' : 'Back'}
          </button>
          <button className="btn !py-2.5" onClick={() => (last ? close(true) : setI(i + 1))}>
            {last ? '📱 Open Hustle' : 'Next'}
          </button>
        </div>
      </div>
      {/* where the Phone lives, so the last card has somewhere to point */}
      {last && (
        <div className="pointer-events-none absolute bottom-16 right-[7.5rem] animate-bounce text-2xl sm:right-[11rem]" aria-hidden>
          👇
        </div>
      )}
    </div>
  );
}
