'use client';
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { X_ACCOUNT, X_ACCOUNT_URL, XMark } from '@/components/ui/Chrome';
import { installAudioUnlock, whenUnlocked } from '@/lib/audio/engine';
import { COUNTRY_LIST } from '@/lib/world/countries';
import { startTheme, stopTheme, ui, type UiSound } from './titleSound';
import { Filmstrip, Gallery, ShotViewer } from './Gallery';

const WelcomeScene = dynamic(() => import('./WelcomeScene').then((m) => m.WelcomeScene), { ssr: false });
const CountriesScene = dynamic(() => import('./CountriesScene').then((m) => m.CountriesScene), { ssr: false });

// The welcome page. Up top, a little 3D city on a speech-bubble island (the brand: white bubble-buildings with
// yellow windows on sky blue) behind the headline and the two ways in. Below, how a world grows, the three
// countries as 3D islands with a plane flying between them, and a gallery of real screenshots of what there is
// to do (Gallery.tsx). A sunny theme tune starts on the first tap anywhere (browsers block sound before that).
// Sound is always on: there is no mute, here or in the game.

type Props = {
  /** The operator's public world, linked as a live showcase. Null = none yet. */
  backdropHandle: string | null;
  signedInHandle: string | null;
  authError?: string;
  liveWorlds: number;
  configured: boolean;
  setupNotice?: React.ReactNode;
};

type Modal = 'enter' | null;

export function TitleScreen({ backdropHandle, signedInHandle, authError, liveWorlds, configured, setupNotice }: Props) {
  const [modal, setModal] = useState<Modal>(null);
  const open = (m: Modal) => {
    ui('open');
    setModal(m);
  };
  const close = () => {
    ui('close');
    setModal(null);
  };
  // straight to X: no steps in between (who can walk in defaults to followers and can be changed in Settings)
  const primary = () => {
    if (!signedInHandle && !configured) return;
    ui('coin');
    location.href = signedInHandle ? '/play' : `/api/auth/x/login?returnTo=${encodeURIComponent('/play')}&access=followers`;
  };
  useThemeMusic();
  useEffect(() => {
    if (!modal) return;
    const on = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  return (
    <div className="welcome min-h-full bg-white text-[#0F2747]">
      <Hero
        signedInHandle={signedInHandle}
        liveWorlds={liveWorlds}
        configured={configured}
        setupNotice={setupNotice}
        authError={authError}
        onPrimary={primary}
        onEnter={() => open('enter')}
      />
      <HowItWorks />
      <Countries />
      <Gallery />
      <Stats />
      <FinalCta signedInHandle={signedInHandle} onPrimary={primary} onEnter={() => open('enter')} />
      <Footer backdropHandle={backdropHandle} liveWorlds={liveWorlds} />
      <ShotViewer />

      {modal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F2747]/35 p-3 backdrop-blur-sm sm:items-center" onClick={close}>
          <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <EnterPanel onCancel={close} featured={backdropHandle} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Sound is always on: the theme starts with the first tap, click or key press anywhere on the page
 *  (browsers block audio until then). */
function useThemeMusic() {
  useEffect(() => {
    installAudioUnlock();
    const off = whenUnlocked(() => startTheme());
    return () => {
      off();
      stopTheme();
    };
  }, []);
}

/** "Now playing" once the theme has started. Not a button: there is no mute. */
function NowPlaying() {
  const [on, setOn] = useState(false);
  useEffect(() => whenUnlocked(() => setOn(true)), []);
  return (
    <div
      aria-hidden
      className={`flex h-10 items-center gap-2 rounded-full bg-white/90 px-3.5 text-sm font-semibold text-[#0F2747] shadow-[0_6px_20px_rgba(15,39,71,0.18)] backdrop-blur transition-opacity duration-500 ${on ? 'opacity-100' : 'opacity-0'}`}
    >
      <Bars />
      <span className="hidden sm:inline">Sunny Block</span>
    </div>
  );
}

function Bars() {
  return (
    <span className="flex h-3.5 items-end gap-[2px]" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="w-[3px] rounded-full bg-[#3BA9F5]" style={{ animation: `tl-eq 0.9s ${i * 0.15}s ease-in-out infinite alternate`, height: '100%' }} />
      ))}
    </span>
  );
}

/** The logo: a speech bubble that is a building (white, yellow windows, a little door), on sky blue. */
export function BubbleLogo({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="16" fill="#3BA9F5" />
      <path d="M17 12h30a7 7 0 0 1 7 7v24a7 7 0 0 1-7 7H24l-9 6 2.5-7.2A7 7 0 0 1 10 43V19a7 7 0 0 1 7-7Z" fill="#fff" />
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={19 + c * 9} y={18 + r * 8} width="6" height="5.5" rx="1.4" fill="#FFC83D" />),
      )}
      <rect x="35" y="41" width="7" height="9" rx="3.5" fill="#F4A62A" />
    </svg>
  );
}

function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const q = window.matchMedia('(prefers-reduced-motion: reduce)');
    setR(q.matches);
    const on = () => setR(q.matches);
    q.addEventListener?.('change', on);
    return () => q.removeEventListener?.('change', on);
  }, []);
  return r;
}

function webglOk() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function Hero({
  signedInHandle,
  liveWorlds,
  configured,
  setupNotice,
  authError,
  onPrimary,
  onEnter,
}: {
  signedInHandle: string | null;
  liveWorlds: number;
  configured: boolean;
  setupNotice?: React.ReactNode;
  authError?: string;
  onPrimary: () => void;
  onEnter: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const [mount3d, setMount3d] = useState(false);
  const [ready, setReady] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const reduced = useReducedMotion();
  useEffect(() => {
    // the page paints first (sky, clouds, headline, buttons); the 3D city loads right after
    if (!webglOk()) return;
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) ric(() => setMount3d(true), { timeout: 600 });
    else setTimeout(() => setMount3d(true), 120);
  }, []);
  useEffect(() => {
    // stop drawing the city once it has scrolled away
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { threshold: 0.02 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section ref={ref} className="relative h-[100svh] min-h-[600px] overflow-hidden" style={{ background: 'linear-gradient(180deg, #2C97EE 0%, #49AEF6 38%, #8FD0FF 78%, #BFE6FF 100%)' }}>
      <SkyClouds />
      {mount3d && (
        <div className={`absolute inset-0 transition-opacity duration-1000 ${ready ? 'opacity-100' : 'opacity-0'}`}>
          <WelcomeScene paused={!onScreen} onReady={() => setReady(true)} reducedMotion={reduced} />
        </div>
      )}
      {/* soft wash behind the text so it reads over the city */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(28,120,210,0.28)_0%,rgba(28,120,210,0)_30%,rgba(28,120,210,0)_62%,rgba(15,60,120,0.38)_100%)] md:bg-[linear-gradient(90deg,rgba(24,110,200,0.55)_0%,rgba(24,110,200,0.25)_38%,rgba(24,110,200,0)_60%)]" />

      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pt-[max(12px,env(safe-area-inset-top))] sm:px-8 sm:pt-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Tweetlife home">
          <BubbleLogo className="h-10 w-10 shadow-[0_6px_18px_rgba(10,60,120,0.3)] rounded-2xl" />
          <span className="text-xl font-black tracking-tight text-white drop-shadow-[0_2px_0_rgba(15,60,120,0.35)]">tweetlife</span>
        </Link>
        <div className="flex items-center gap-2">
          <NowPlaying />
          <a
            href={X_ACCOUNT_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => ui('tap')}
            aria-label={`Follow @${X_ACCOUNT} on X`}
            className="flex h-10 min-w-10 items-center justify-center gap-2 rounded-full bg-[#0F2747] px-3 text-sm font-semibold text-white shadow-[0_6px_20px_rgba(15,39,71,0.25)] transition hover:bg-black sm:px-4"
          >
            <XMark className="h-4 w-4" />
            <span className="hidden sm:inline">Follow @{X_ACCOUNT}</span>
          </a>
        </div>
      </header>

      <div className="relative z-10 mx-auto flex h-full max-w-6xl flex-col justify-between px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-24 sm:px-8 md:justify-center md:pb-10 md:pt-24">
        <div className="max-w-xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white backdrop-blur sm:text-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#7CF29A] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#4ADE80]" />
            </span>
            <span className="num">{liveWorlds.toLocaleString()}</span> {liveWorlds === 1 ? 'world' : 'worlds'} live now
          </div>
          <h1 className="text-[44px] font-black leading-[0.98] tracking-[-0.035em] text-white sm:text-6xl md:text-7xl" style={{ textShadow: '0 3px 0 rgba(16,82,160,0.35), 0 14px 40px rgba(10,50,110,0.3)' }}>
            Your posts
            <br />
            become a <span className="text-[#FFD54A]">city</span>.
          </h1>
          <p className="mt-4 hidden max-w-md text-lg leading-7 text-white/95 drop-shadow-[0_1px_2px_rgba(10,50,110,0.4)] md:block">
            Sign in with X and everything you&apos;ve posted rises as a building. Then live there: walk your streets, furnish a home, dance at Club Moon, and float your coins on a string.
          </p>
          <p className="mt-3 max-w-xs text-[15px] leading-6 text-white/95 drop-shadow-[0_1px_2px_rgba(10,50,110,0.5)] md:hidden">Every post a building. Live in it, and bring your followers.</p>
        </div>

        <div className="w-full max-w-md md:mt-8">
          {!configured && <div className="mb-3">{setupNotice}</div>}
          {authError && <div className="mb-3 rounded-2xl bg-rose-500/90 px-4 py-2 text-sm font-medium text-white">Sign-in failed: {authError}</div>}
          <div className="flex flex-col gap-3 sm:flex-row">
            <BigButton onClick={onPrimary} tone="dark" sound={null}>
              {signedInHandle ? (
                <>Play as @{signedInHandle}</>
              ) : (
                <>
                  <XMark className="h-5 w-5" /> Sign in with X
                </>
              )}
            </BigButton>
            <BigButton onClick={onEnter} tone="light" sound={null}>
              Enter a world
            </BigButton>
          </div>
          <p className="mt-3 text-center text-xs font-medium text-white/90 drop-shadow sm:text-left">Free to play · read-only X access · we never post for you</p>
        </div>
      </div>

      <a href="#how" className="absolute bottom-5 left-1/2 z-10 hidden -translate-x-1/2 flex-col items-center gap-1 text-xs font-semibold text-white/90 md:flex" onClick={() => ui('tap')}>
        See what&apos;s inside
        <span className="animate-bounce text-lg leading-none">↓</span>
      </a>
    </section>
  );
}

function BigButton({ children, onClick, tone, sound = 'tap' }: { children: React.ReactNode; onClick: () => void; tone: 'dark' | 'light' | 'blue'; sound?: UiSound | null }) {
  const cls =
    tone === 'dark'
      ? 'bg-[#0F1419] text-white shadow-[0_10px_30px_rgba(10,30,60,0.35)] hover:bg-black'
      : tone === 'blue'
        ? 'bg-[#1D9BF0] text-white shadow-[0_10px_30px_rgba(29,155,240,0.35)] hover:brightness-110'
        : 'bg-white text-[#0F2747] shadow-[0_10px_30px_rgba(10,30,60,0.2)] hover:bg-[#F2F8FF]';
  return (
    <button
      onClick={() => {
        if (sound) ui(sound);
        onClick();
      }}
      onPointerEnter={(e) => e.pointerType === 'mouse' && ui('hover')}
      className={`flex flex-1 items-center justify-center gap-2.5 rounded-2xl px-6 py-4 text-[17px] font-bold transition active:scale-[0.98] ${cls}`}
    >
      {children}
    </button>
  );
}

/** CSS clouds: on screen from the first paint, before the 3D city arrives. */
function SkyClouds() {
  const clouds = [
    { top: '14%', left: '-6%', w: 180, d: 70 },
    { top: '30%', left: '62%', w: 140, d: 90 },
    { top: '8%', left: '70%', w: 110, d: 80 },
    { top: '52%', left: '18%', w: 120, d: 100 },
  ];
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {clouds.map((c, i) => (
        <div key={i} className="absolute" style={{ top: c.top, left: c.left, animation: `tl-drift ${c.d}s linear infinite`, animationDelay: `${-i * 13}s` }}>
          <div className="relative" style={{ width: c.w, height: c.w * 0.38 }}>
            <span className="absolute bottom-0 left-0 h-[60%] w-full rounded-full bg-white/85" />
            <span className="absolute bottom-[25%] left-[18%] h-[75%] w-[38%] rounded-full bg-white/85" />
            <span className="absolute bottom-[20%] left-[45%] h-[95%] w-[40%] rounded-full bg-white/85" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionTitle({ kicker, title, sub }: { kicker: string; title: string; sub?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#1D9BF0]">{kicker}</div>
      <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{title}</h2>
      {sub && <p className="mt-3 text-base leading-7 text-[#4A5B73]">{sub}</p>}
    </div>
  );
}

function HowItWorks() {
  const steps = [
    { n: '1', icon: <XMark className="h-6 w-6" />, title: 'Sign in with X', body: 'Read-only access to your posts, profile and follows. We never post for you.' },
    { n: '2', icon: <BubbleLogo className="h-9 w-9" />, title: 'Your posts rise as buildings', body: 'Every post a building, likes make it taller, quiet months stay empty lots. Nothing is invented.' },
    { n: '3', icon: <span className="text-2xl">🚶</span>, title: 'Live in it, bring friends', body: 'Walk in as yourself. Everyone in your country shares one city, and your posts are your block on its streets.' },
  ];
  return (
    <section id="how" className="relative -mt-6 rounded-t-[28px] bg-white px-5 pb-16 pt-14 sm:px-8 md:pt-20">
      <SectionTitle kicker="How it works" title="From timeline to skyline" />
      <ol className="mx-auto mt-10 grid max-w-5xl gap-4 md:grid-cols-3 md:gap-6">
        {steps.map((s) => (
          <li key={s.n} className="relative rounded-3xl bg-[#F1F8FF] p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#0F1419] shadow-[0_4px_14px_rgba(29,155,240,0.18)]">{s.icon}</span>
              <span className="text-sm font-black text-[#1D9BF0]">Step {s.n}</span>
            </div>
            <h3 className="mt-4 text-xl font-extrabold">{s.title}</h3>
            <p className="mt-1.5 text-[15px] leading-6 text-[#4A5B73]">{s.body}</p>
          </li>
        ))}
      </ol>
      <Filmstrip />
    </section>
  );
}

function Countries() {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const [ready, setReady] = useState(false);
  const reduced = useReducedMotion();
  useEffect(() => {
    // load the 3D islands as the section scrolls close, and only draw them while they are on screen
    const el = ref.current;
    if (!el || !webglOk()) return;
    const soon = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: '400px 0px' });
    const seen = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { threshold: 0.02 });
    soon.observe(el);
    seen.observe(el);
    return () => (soon.disconnect(), seen.disconnect());
  }, []);
  return (
    <section id="countries" className="relative overflow-hidden px-5 pb-16 pt-14 sm:px-8 md:pb-20 md:pt-16" style={{ background: 'linear-gradient(180deg, #FFFFFF 0%, #E3F3FF 26%, #BFE6FF 70%, #F6FAFE 100%)' }}>
      <SectionTitle kicker="Three countries" title="Pick your passport" sub="Every player is a citizen of Solana, BNB or Robinhood, with an ID card to prove it. Each capital wears its coin's colours, and planes fly between them." />
      <div ref={ref} className="relative -mx-5 mt-2 h-[340px] sm:-mx-8 sm:h-[420px] md:h-[500px]">
        {/* the logos stand in until the islands load */}
        <div className={`absolute inset-0 flex items-center justify-center gap-10 transition-opacity duration-700 ${ready ? 'opacity-0' : 'opacity-100'}`} aria-hidden>
          {COUNTRY_LIST.map((c, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={c.id} src={c.logo} alt="" width={64} height={64} className="h-14 w-14 animate-[tl-bob_3s_ease-in-out_infinite] sm:h-16 sm:w-16" style={{ animationDelay: `${-i}s` }} />
          ))}
        </div>
        {near && (
          <div className={`absolute inset-0 transition-opacity duration-1000 ${ready ? 'opacity-100' : 'opacity-0'}`}>
            <CountriesScene paused={!onScreen} onReady={() => setReady(true)} reducedMotion={reduced} />
          </div>
        )}
      </div>
      <div className="relative mx-auto mt-2 grid max-w-6xl gap-4 md:grid-cols-3 md:gap-5">
        {COUNTRY_LIST.map((c) => (
          <a
            key={c.id}
            href={`/c/${c.id}`}
            onClick={() => ui('coin')}
            className="group relative block overflow-hidden rounded-3xl bg-white p-5 shadow-[0_8px_30px_rgba(15,39,71,0.08)] ring-1 ring-[#0F2747]/5 transition hover:-translate-y-0.5 hover:shadow-[0_12px_36px_rgba(15,39,71,0.14)]"
          >
            <span className="absolute inset-x-0 top-0 h-1.5" style={{ background: `linear-gradient(90deg, ${c.theme.gradient[0]}, ${c.theme.gradient[1]})` }} aria-hidden />
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.logo} alt={`${c.name} logo`} width={48} height={48} loading="lazy" className="h-12 w-12 rounded-2xl" />
              <div className="min-w-0">
                <h3 className="flex items-center gap-2 text-xl font-extrabold">
                  {c.name}
                  <span className="rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide" style={{ background: `${c.theme.primary}22`, color: c.id === 'bnb' ? '#8A6400' : c.id === 'robinhood' ? '#0A7A0D' : '#6B2BD9' }}>
                    ${c.ticker}
                  </span>
                </h3>
                <div className="text-sm font-semibold text-[#4A5B73]">Capital: {c.capital}</div>
              </div>
            </div>
            <p className="mt-3 text-[15px] italic leading-6 text-[#0F2747]">&ldquo;{c.motto}&rdquo;</p>
            <p className="mt-1 text-sm text-[#4A5B73]">President {c.president}</p>
            <span className="mt-3 inline-block text-sm font-bold text-[#1D9BF0] group-hover:underline">Visit {c.capital} →</span>
          </a>
        ))}
      </div>
    </section>
  );
}

function Stats() {
  const stats = [
    { emoji: '💰', name: 'Bags', body: 'Your money. 10,000 to start.' },
    { emoji: '⚡', name: 'Gas', body: 'Energy. Sleep and eat to refill.' },
    { emoji: '✨', name: 'Vibes', body: 'Fun. Party, play, go out.' },
    { emoji: '📣', name: 'Clout', body: 'Social. Post, hang out, be seen.' },
  ];
  return (
    <section className="bg-[#1D9BF0] px-5 py-14 text-white sm:px-8">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-center text-2xl font-black tracking-tight sm:text-3xl">Keep your stats up</h2>
        <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {stats.map((s) => (
            <div key={s.name} className="rounded-3xl bg-white/12 p-5 ring-1 ring-white/20 backdrop-blur">
              <div className="text-3xl">{s.emoji}</div>
              <div className="mt-2 text-lg font-extrabold">{s.name}</div>
              <div className="text-sm leading-5 text-white/85">{s.body}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta({ signedInHandle, onPrimary, onEnter }: { signedInHandle: string | null; onPrimary: () => void; onEnter: () => void }) {
  return (
    <section className="bg-white px-5 py-16 sm:px-8 md:py-24">
      <div className="relative mx-auto max-w-3xl rounded-[32px] bg-[#3BA9F5] px-6 py-12 text-center text-white shadow-[0_20px_60px_rgba(29,155,240,0.35)] sm:px-12">
        {/* the bubble's tail */}
        <span className="absolute -bottom-5 left-14 h-10 w-10 rotate-45 rounded-br-lg bg-[#3BA9F5]" aria-hidden />
        <h2 className="text-3xl font-black tracking-tight sm:text-5xl">Your city is waiting.</h2>
        <p className="mx-auto mt-3 max-w-md text-base leading-7 text-white/90">Sign in, watch your posts rise, and move in. It grows every time you post.</p>
        <div className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row">
          <BigButton onClick={onPrimary} tone="dark" sound={null}>
            {signedInHandle ? (
              <>Play as @{signedInHandle}</>
            ) : (
              <>
                <XMark className="h-5 w-5" /> Sign in with X
              </>
            )}
          </BigButton>
          <BigButton onClick={onEnter} tone="light" sound={null}>
            Enter a world
          </BigButton>
        </div>
      </div>
    </section>
  );
}

function Footer({ backdropHandle, liveWorlds }: { backdropHandle: string | null; liveWorlds: number }) {
  return (
    <footer className="border-t border-[#0F2747]/8 bg-white px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-8 sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 text-sm text-[#4A5B73] md:flex-row md:justify-between">
        <div className="flex items-center gap-2">
          <BubbleLogo className="h-7 w-7" />
          <span className="font-black text-[#0F2747]">tweetlife</span>
        </div>
        <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2 font-semibold">
          <Link href="/how" className="hover:text-[#1D9BF0]">How a world grows</Link>
          <Link href="/explore" className="hover:text-[#1D9BF0]">Explore</Link>
          <Link href="/status" className="hover:text-[#1D9BF0]">Status</Link>
          <a href={X_ACCOUNT_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-[#1D9BF0]">
            <XMark className="h-3.5 w-3.5" /> @{X_ACCOUNT}
          </a>
          {backdropHandle && (
            <a href={`/w/${encodeURIComponent(backdropHandle)}`} className="hover:text-[#1D9BF0]">
              Showcase: @{backdropHandle}
            </a>
          )}
        </nav>
        <div className="text-center text-xs text-[#7A8AA0] md:text-right">
          <span className="num">{liveWorlds}</span> {liveWorlds === 1 ? 'world' : 'worlds'} live · unofficial fan project, not affiliated with X Corp.
        </div>
      </div>
    </footer>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="welcome-panel w-full rounded-[28px] bg-white p-6 text-center text-[#0F2747] shadow-[0_24px_70px_rgba(15,39,71,0.35)] sm:p-8">
      <h2 className="text-2xl font-black tracking-tight">{title}</h2>
      <div className="mt-5 flex flex-col gap-3">{children}</div>
    </div>
  );
}

type Listed = { handle: string; name: string; avatarUrl: string | null; posts: number };

function EnterPanel({ onCancel, featured }: { onCancel: () => void; featured: string | null }) {
  const [handle, setHandle] = useState('');
  const [listed, setListed] = useState<Listed[] | null>(null);
  useEffect(() => {
    fetch('/api/explore').then((r) => r.json()).then((j) => setListed(j.worlds ?? [])).catch(() => setListed([]));
  }, []);
  // worlds open to anyone: the showcase world first, then the ones listed on Explore
  const picks = [
    ...(featured && !listed?.some((w) => w.handle.toLowerCase() === featured.toLowerCase()) ? [{ handle: featured, name: 'Showcase world', avatarUrl: null, posts: -1 }] : []),
    ...(listed ?? []),
  ];
  const clean = handle.trim().replace(/^@/, '').replace(/^https?:\/\/(x|twitter)\.com\//i, '').split(/[/?]/)[0];
  const go = () => {
    if (!clean) return;
    ui('coin');
    location.href = `/w/${encodeURIComponent(clean)}`;
  };
  return (
    <Panel title="Enter a world">
      <label className="text-left text-xs font-bold uppercase tracking-wider text-[#7A8AA0]" htmlFor="tl-handle">
        X handle
      </label>
      <input
        id="tl-handle"
        type="text"
        autoFocus
        value={handle}
        onChange={(e) => setHandle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && go()}
        placeholder="@handle"
        className="!rounded-2xl !border-[#D5E3F2] !bg-[#F4F9FF] !px-4 !py-3 !text-lg !text-[#0F2747] placeholder:text-[#9AABC0]"
      />
      <p className="text-xs leading-5 text-[#7A8AA0]">A world exists once its owner has signed in and built it. You arrive on the street outside their block, in their country&rsquo;s capital. Followers-only posts ask you to follow to read them.</p>
      {picks.length > 0 && (
        <div className="text-left">
          <div className="mb-1.5 text-xs font-bold uppercase tracking-wider text-[#7A8AA0]">Open to everyone</div>
          <ul className="flex max-h-48 flex-col gap-1.5 overflow-y-auto">
            {picks.map((w) => (
              <li key={w.handle}>
                <a href={`/w/${encodeURIComponent(w.handle)}`} onClick={() => ui('coin')} className="flex items-center gap-3 rounded-2xl bg-[#F1F8FF] px-3 py-2 hover:bg-[#E3F1FF]">
                  {w.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={w.avatarUrl} alt="" className="h-8 w-8 rounded-full" />
                  ) : (
                    <BubbleLogo className="h-8 w-8" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">@{w.handle}</span>
                    <span className="block truncate text-[11px] text-[#7A8AA0]">{w.posts >= 0 ? `${w.name} · ${w.posts} posts` : w.name}</span>
                  </span>
                  <span className="text-xs font-semibold text-[#1D9BF0]">Walk in →</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {listed && picks.length === 0 && (
        <p className="text-xs text-[#7A8AA0]">
          No public worlds yet. <a className="underline" href="/explore">Explore</a> lists them as owners open up.
        </p>
      )}
      <div className="mt-1 grid grid-cols-2 gap-3">
        <button className="rounded-2xl bg-[#1D9BF0] py-3 text-base font-bold text-white transition hover:brightness-110 disabled:opacity-40" onClick={go} disabled={!clean}>
          Enter
        </button>
        <button className="rounded-2xl bg-[#EEF3F8] py-3 text-base font-bold text-[#0F2747] hover:bg-[#E3EBF3]" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </Panel>
  );
}
