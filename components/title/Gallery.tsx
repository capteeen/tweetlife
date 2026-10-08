'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { ui } from './titleSound';

// The welcome page's in-game pictures: a filmstrip that drifts past under "How it works", and a gallery of
// everything you can do, sorted into categories. Every picture is a real screenshot from the game, kept in
// public/welcome/play as <id>-640.webp (grid) and <id>-1280.webp (the viewer). Tapping one opens it big.

type Cat = 'nights' | 'work' | 'travel' | 'country' | 'home' | 'trouble' | 'style';
type Shot = { id: string; cat: Cat; title: string; body: string };

const CATS: { id: Cat | 'all'; label: string; emoji: string }[] = [
  { id: 'all', label: 'Everything', emoji: '✨' },
  { id: 'nights', label: 'Nights out', emoji: '🪩' },
  { id: 'work', label: 'Jobs', emoji: '💼' },
  { id: 'travel', label: 'Get around', emoji: '✈️' },
  { id: 'country', label: 'Your country', emoji: '🏛️' },
  { id: 'home', label: 'Home & dating', emoji: '🛋️' },
  { id: 'trouble', label: 'Trouble', emoji: '🚓' },
  { id: 'style', label: 'Style & coins', emoji: '🪙' },
];

const SHOTS: Shot[] = [
  { id: 'club-moon', cat: 'nights', title: 'Dance at Club Moon', body: 'A light-up floor, a DJ and a VIP room.' },
  { id: 'velvet-room', cat: 'nights', title: 'Catch a live band', body: 'Jazz at the Velvet Room on the nightlife row.' },
  { id: 'beach-club', cat: 'nights', title: 'Sunset Beach Club', body: 'Dance on the sand by the water.' },
  { id: 'afro-yard', cat: 'nights', title: 'Afro Yard', body: 'Afrobeats, string lights and DJ Ayo.' },
  { id: 'warehouse', cat: 'nights', title: 'Warehouse 404', body: 'Lasers and techno. No phones on the floor.' },
  { id: 'club-yellow', cat: 'nights', title: 'Club Yellow', body: "BNB City's own club, all in gold." },
  { id: 'resident-chat', cat: 'nights', title: 'Chat with residents', body: 'The people in town talk back, like Big Tunde at Club Moon.' },
  { id: 'gym', cat: 'nights', title: 'Hit the gym', body: 'Work out at Iron Trenches Gym.' },
  { id: 'doctor', cat: 'work', title: 'Work as a doctor', body: 'Apply for a real job and work shifts for bags.' },
  { id: 'bartender', cat: 'work', title: 'Pour drinks', body: 'Tend the bar at Degen Lounge.' },
  { id: 'programmer', cat: 'work', title: 'Code at Devnet Labs', body: 'Fix bugs at the tech office.' },
  { id: 'bus-driver', cat: 'work', title: 'Drive the city bus', body: 'Check your mirrors and run the route.' },
  { id: 'ground-crew', cat: 'work', title: 'Airport ground crew', body: 'Wave the jets in on the apron.' },
  { id: 'promotion', cat: 'work', title: 'Get promoted', body: 'Shifts pay bags, and good work moves you up.' },
  { id: 'airliner', cat: 'travel', title: 'Fly to another country', body: 'Check in, board and fly between Solana, BNB and Robinhood.' },
  { id: 'takeoff', cat: 'travel', title: 'Take off', body: 'Economy, first class, or your own plane.' },
  { id: 'landing', cat: 'travel', title: 'Land in a new capital', body: 'Every country has its own airport.' },
  { id: 'passport', cat: 'travel', title: 'Get your passport stamped', body: 'Arrivals, then out into a new city.' },
  { id: 'jet', cat: 'travel', title: 'Own a private jet', body: 'Park it at the airport and fly when you like.' },
  { id: 'taxi', cat: 'travel', title: 'Hail a yellow cab', body: 'Sit in the back while the driver takes you.' },
  { id: 'scooter', cat: 'travel', title: 'Ride an e-scooter', body: 'Grab one off the street and go.' },
  { id: 'bus', cat: 'travel', title: 'Take the bus', body: 'Cheap, slow, and full of characters.' },
  { id: 'bike', cat: 'travel', title: 'Bike anywhere', body: 'Pedal your way round the city.' },
  { id: 'id-card', cat: 'country', title: 'Get your national ID', body: 'A two-sided ID card for your country.' },
  { id: 'president', cat: 'country', title: 'Meet the president', body: 'President CZ works from the BNB Build House.' },
  { id: 'ansem', cat: 'country', title: 'Hear the address', body: "President Ansem speaks to Solana from the podium." },
  { id: 'suggest', cat: 'country', title: 'Use the suggestion box', body: 'Pitch an idea to your president. Other citizens can back it.' },
  { id: 'capital', cat: 'country', title: 'Walk your capital', body: 'One city for everyone in your country.' },
  { id: 'meet', cat: 'country', title: 'Visit anyone’s block', body: 'Every player’s posts are their own block in the capital.' },
  { id: 'country-map', cat: 'country', title: 'Find your way', body: 'The map shows every block, venue and ride.' },
  { id: 'crowd', cat: 'country', title: 'Draw a crowd', body: 'Post on X and your followers pull up to see you.' },
  { id: 'skyline', cat: 'country', title: 'A skyline from your posts', body: 'Your biggest posts become the tallest towers.' },
  { id: 'furnished', cat: 'home', title: 'Furnish your home', body: 'Pick from 50+ pieces of furniture.' },
  { id: 'home-poses', cat: 'home', title: 'Live in it', body: 'Sleep, eat, watch the match, play FIFA.' },
  { id: 'dance-home', cat: 'home', title: 'Dance at home', body: 'Put on a song and move.' },
  { id: 'nepa', cat: 'home', title: 'Survive NEPA', body: 'Sometimes the power just goes.' },
  { id: 'date', cat: 'home', title: 'Ask someone out', body: 'Chat, flirt and go on dates.' },
  { id: 'visit', cat: 'home', title: 'Have friends over', body: 'Knock on a door and hang out at their place.' },
  { id: 'fight', cat: 'trouble', title: 'Start a fight', body: 'At your own risk.' },
  { id: 'steal', cat: 'trouble', title: 'Pick a pocket', body: 'Lift some bags, if nobody is watching.' },
  { id: 'arrest', cat: 'trouble', title: 'Get arrested', body: 'Your victim can call the police.' },
  { id: 'bail', cat: 'trouble', title: 'Post bail', body: 'Pay to get out, or wait out your time.' },
  { id: 'creator', cat: 'style', title: 'Dress up', body: 'Tops, bottoms, shoes and extras.' },
  { id: 'lineup', cat: 'style', title: 'Be anyone', body: 'Pick your skin, hair, body and outfit.' },
  { id: 'balloons', cat: 'style', title: 'Coins on a string', body: 'Every coin you hold floats over your head.' },
  { id: 'coin-shop', cat: 'style', title: 'Ape at the coin shop', body: 'Buy coins in the Trenches. Pump and they turn gold, rug and they pop.' },
];

/** "Everything" deals the categories round so the first screenful already shows a bit of each. */
const MIXED: Shot[] = (() => {
  const piles = CATS.filter((c) => c.id !== 'all').map((c) => SHOTS.filter((s) => s.cat === c.id));
  const out: Shot[] = [];
  for (let i = 0; out.length < SHOTS.length; i++) for (const p of piles) if (p[i]) out.push(p[i]);
  return out;
})();

const STRIP = ['club-moon', 'airliner', 'doctor', 'president', 'taxi', 'furnished', 'afro-yard', 'arrest', 'capital', 'date', 'jet', 'creator', 'bartender', 'beach-club'];

const src = (id: string, w: 640 | 1280) => `/welcome/play/${id}-${w}.webp`;

/** Which shot is open in the viewer, and the list it steps through. */
const useViewer = create<{ list: Shot[]; at: number; open: (list: Shot[], at: number) => void; close: () => void; step: (d: number) => void }>((set) => ({
  list: [],
  at: -1,
  open: (list, at) => set({ list, at }),
  close: () => set({ at: -1 }),
  step: (d) => set((s) => ({ at: (s.at + d + s.list.length) % s.list.length })),
}));

/** A row of pictures drifting sideways; stays still (and scrolls by hand) with reduced motion. */
export function Filmstrip() {
  const shots = useMemo(() => STRIP.map((id) => SHOTS.find((s) => s.id === id)!), []);
  const open = useViewer((s) => s.open);
  return (
    <div className="tl-strip relative -mx-5 mt-12 overflow-hidden sm:-mx-8" aria-label="Pictures from the game">
      <div className="tl-strip-track flex w-max gap-3 sm:gap-4">
        {[...shots, ...shots].map((s, i) => (
          <button
            key={i}
            type="button"
            aria-hidden={i >= shots.length}
            tabIndex={i >= shots.length ? -1 : 0}
            onClick={() => (ui('open'), open(shots, i % shots.length))}
            className="group relative w-[200px] shrink-0 overflow-hidden rounded-2xl bg-[#DCEBFA] shadow-[0_6px_20px_rgba(15,39,71,0.12)] ring-1 ring-[#0F2747]/5 sm:w-[260px]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src(s.id, 640)} alt={i < shots.length ? s.title : ''} loading="lazy" decoding="async" width={640} height={400} className="aspect-[16/10] w-full object-cover transition duration-300 group-hover:scale-[1.04]" />
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-3 pb-2 pt-6 text-left text-[13px] font-bold text-white">{s.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function Gallery() {
  const [cat, setCat] = useState<Cat | 'all'>('all');
  const list = useMemo(() => (cat === 'all' ? MIXED : SHOTS.filter((s) => s.cat === cat)), [cat]);
  const open = useViewer((s) => s.open);
  return (
    <section id="play" className="bg-[#F6FAFE] px-5 py-16 sm:px-8 md:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#1D9BF0]">Things you can do</div>
        <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">A whole life in your city</h2>
        <p className="mt-3 text-base leading-7 text-[#4A5B73]">You start with 10,000 bags and a starter flat. Every picture here is a real screenshot from the game. Tap one to see it big.</p>
      </div>
      <div className="-mx-5 mt-8 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-auto sm:max-w-6xl sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0" role="tablist" aria-label="Kinds of things to do">
        {CATS.map((c) => {
          const on = c.id === cat;
          const n = c.id === 'all' ? SHOTS.length : SHOTS.filter((s) => s.cat === c.id).length;
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => (ui('tap'), setCat(c.id))}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${on ? 'bg-[#0F2747] text-white shadow-[0_6px_16px_rgba(15,39,71,0.25)]' : 'bg-white text-[#0F2747] ring-1 ring-[#0F2747]/10 hover:bg-[#E3F1FF]'}`}
            >
              <span className="mr-1.5" aria-hidden>{c.emoji}</span>
              {c.label}
              <span className={`ml-1.5 text-xs ${on ? 'text-white/70' : 'text-[#7A8AA0]'}`}>{n}</span>
            </button>
          );
        })}
      </div>
      <ul className="mx-auto mt-6 grid max-w-6xl grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4" role="tabpanel">
        {list.map((s, i) => (
          <li key={s.id}>
            <button type="button" onClick={() => (ui('open'), open(list, i))} className="group block h-full w-full overflow-hidden rounded-2xl bg-white text-left shadow-[0_6px_22px_rgba(15,39,71,0.07)] ring-1 ring-[#0F2747]/5 transition hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(15,39,71,0.13)] sm:rounded-3xl">
              <span className="block overflow-hidden bg-[#DCEBFA]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src(s.id, 640)} alt={s.title} loading="lazy" decoding="async" width={640} height={400} className="aspect-[16/10] w-full object-cover transition duration-300 group-hover:scale-[1.04]" />
              </span>
              <span className="block p-3 sm:p-4">
                <span className="block text-[14px] font-extrabold leading-5 sm:text-base">{s.title}</span>
                <span className="mt-0.5 hidden text-[13px] leading-5 text-[#4A5B73] sm:block">{s.body}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The picture viewer: big image and caption, arrows or swipes to step, Esc or a tap outside to close. */
export function ShotViewer() {
  const { list, at, close, step } = useViewer();
  const shot = at >= 0 ? list[at] : null;
  const touch = useRef<number | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  useEffect(() => {
    if (!shot) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') (ui('close'), close());
      if (e.key === 'ArrowRight') (ui('tap'), step(1));
      if (e.key === 'ArrowLeft') (ui('tap'), step(-1));
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [shot, close, step]);
  // fetch the neighbours so stepping is instant
  useEffect(() => {
    if (!shot || list.length < 2) return;
    for (const d of [1, -1]) new Image().src = src(list[(at + d + list.length) % list.length].id, 1280);
  }, [shot, at, list]);
  if (!shot) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#07111F]/90 p-3 backdrop-blur-sm sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={shot.title}
      onClick={() => (ui('close'), close())}
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current === null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (Math.abs(dx) > 40) (ui('tap'), step(dx < 0 ? 1 : -1));
      }}
    >
      <figure className="relative w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
        <div className="relative overflow-hidden rounded-2xl bg-[#0F2747] shadow-2xl sm:rounded-3xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src(shot.id, 640)} alt="" aria-hidden className="aspect-[16/10] w-full object-cover blur-[2px]" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={shot.id}
            src={src(shot.id, 1280)}
            alt={shot.title}
            width={1280}
            height={800}
            onLoad={() => setLoaded(shot.id)}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${loaded === shot.id ? 'opacity-100' : 'opacity-0'}`}
          />
        </div>
        <figcaption className="mt-3 flex items-start justify-between gap-4 text-white">
          <span>
            <span className="block text-lg font-extrabold sm:text-xl">{shot.title}</span>
            <span className="block text-sm text-white/75 sm:text-[15px]">{shot.body}</span>
          </span>
          <span className="shrink-0 pt-1 text-sm font-semibold text-white/60">
            {at + 1} / {list.length}
          </span>
        </figcaption>
        <button type="button" aria-label="Previous picture" onClick={() => (ui('tap'), step(-1))} className="absolute left-2 top-[calc(50%-2.5rem)] hidden h-11 w-11 items-center justify-center rounded-full bg-white/90 text-xl font-black text-[#0F2747] shadow-lg hover:bg-white sm:flex sm:-left-5">
          ‹
        </button>
        <button type="button" aria-label="Next picture" onClick={() => (ui('tap'), step(1))} className="absolute right-2 top-[calc(50%-2.5rem)] hidden h-11 w-11 items-center justify-center rounded-full bg-white/90 text-xl font-black text-[#0F2747] shadow-lg hover:bg-white sm:flex sm:-right-5">
          ›
        </button>
        <button type="button" aria-label="Close" onClick={() => (ui('close'), close())} className="absolute -top-3 right-0 flex h-10 w-10 -translate-y-full items-center justify-center rounded-full bg-white/15 text-xl text-white hover:bg-white/25">
          ✕
        </button>
      </figure>
      <p className="mt-4 text-xs text-white/50 sm:hidden">Swipe for more</p>
    </div>
  );
}
