'use client';
import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { buildWorld } from '@/lib/world/geometry';
import { XMark } from '@/components/ui/Chrome';

const WorldCanvas = dynamic(() => import('@/components/world/WorldCanvas').then((m) => m.WorldCanvas), { ssr: false });

// The title screen: a live world behind, the logo, two stacked menu buttons, a tagline.
// "Enter a world" and "Build my world" open centred panels in place of the menu.

type Props = {
  /** The operator's public world to show behind the menu (real account, labelled). Null = scenery only. */
  backdropHandle: string | null;
  signedInHandle: string | null;
  authError?: string;
  liveWorlds: number;
  configured: boolean;
  setupNotice?: React.ReactNode;
};

type Screen = 'menu' | 'enter' | 'build';

export function TitleScreen({ backdropHandle, signedInHandle, authError, liveWorlds, configured, setupNotice }: Props) {
  const [screen, setScreen] = useState<Screen>('menu');
  return (
    <div className="fixed inset-0 overflow-hidden bg-base">
      <Backdrop handle={backdropHandle} />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/45" />

      <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
        {screen === 'menu' && (
          <Menu
            onEnter={() => setScreen('enter')}
            onBuild={() => (signedInHandle ? (location.href = '/my-world') : setScreen('build'))}
            signedInHandle={signedInHandle}
            authError={authError}
            configured={configured}
            setupNotice={setupNotice}
          />
        )}
        {screen === 'enter' && <EnterPanel onCancel={() => setScreen('menu')} />}
        {screen === 'build' && <BuildPanel onCancel={() => setScreen('menu')} configured={configured} />}
      </div>

      {/* corners */}
      <div className="absolute bottom-4 left-4 flex items-center gap-3 text-sm">
        <Link className="rounded-full chrome px-3 py-1.5 text-white/85 hover:text-white" href="/how">
          How a world grows
        </Link>
        <Link className="rounded-full chrome px-3 py-1.5 text-white/85 hover:text-white" href="/explore">
          Explore
        </Link>
        <Link className="rounded-full chrome px-3 py-1.5 text-white/85 hover:text-white" href="/status">
          Status
        </Link>
      </div>
      <div className="absolute bottom-4 right-4 max-w-xs text-right text-[11px] leading-4 text-white/55">
        {backdropHandle ? (
          <span>
            Behind this menu: the real world of <span className="text-white/80">@{backdropHandle}</span> (the operator), live.
          </span>
        ) : (
          <span>No showcase world yet — the first world on this deployment is the operator&apos;s own.</span>
        )}
        <br />
        <span className="num">{liveWorlds}</span> {liveWorlds === 1 ? 'world' : 'worlds'} live · unofficial fan project, not affiliated with X Corp.
      </div>
    </div>
  );
}

function Backdrop({ handle }: { handle: string | null }) {
  // Scenery only when there is no operator world: countryside, trees, sky. No invented buildings.
  const scenery = useMemo(() => {
    const g = buildWorld([], { handle: 'tweetlife', accountCreatedAt: new Date(Date.now() - 3 * 365.25 * 86400000), followersCount: 0, landmarkPostId: null, showReplies: true });
    return { ...g, blocks: [], outside: 'lush' as const, boundaryRadius: 120, contentRadius: 0, residents: 0, cars: 0 };
  }, []);
  if (handle) {
    return <iframe src={`/w/${encodeURIComponent(handle)}?backdrop=1`} title={`@${handle}'s world`} className="absolute inset-0 h-full w-full border-0" tabIndex={-1} aria-hidden />;
  }
  return <WorldCanvas geometry={scenery} marks={[]} paths={[]} biome="meadow" handle="tweetlife" showMetrics={false} mode="boundary" />;
}

function Logo() {
  return (
    <div className="select-none text-center">
      <h1
        className="text-[64px] font-black leading-none tracking-[-0.04em] text-[#F1E8D6] sm:text-[112px]"
        style={{
          textShadow:
            '0 1px 0 #D4C3A5, 0 2px 0 #C9B690, 0 3px 0 #B8A382, 0 4px 0 #A8926F, 0 5px 0 #8F7A5B, 0 6px 0 #7A6749, 0 10px 24px rgba(0,0,0,0.45)',
        }}
      >
        TWEETLIFE
      </h1>
      <div className="mt-3 inline-flex items-center gap-3 rounded-full border border-[#BFE3FF]/40 bg-[#0B0E14]/55 px-5 py-1.5 text-sm font-semibold uppercase tracking-[0.3em] text-[#BFE3FF] backdrop-blur">
        <span className="h-1.5 w-1.5 rotate-45 bg-[#BFE3FF]" />
        Your account, as a city
        <span className="h-1.5 w-1.5 rotate-45 bg-[#BFE3FF]" />
      </div>
      <div className="mt-2">
        <span className="inline-block -rotate-2 rounded bg-[#1D9BF0] px-4 py-1 text-sm font-bold text-white shadow-lg">Built from real posts only</span>
      </div>
    </div>
  );
}

function MenuButton({ children, onClick, primary }: { children: React.ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-2xl border px-6 py-4 text-lg font-semibold transition active:translate-y-px sm:text-xl ${
        primary
          ? 'border-[#1D9BF0]/70 bg-[#1D9BF0] text-white shadow-[0_8px_30px_rgba(29,155,240,0.35)] hover:brightness-110'
          : 'border-white/15 bg-[#0B0E14]/60 text-white backdrop-blur hover:bg-[#0B0E14]/75'
      }`}
    >
      {children}
    </button>
  );
}

function Menu({
  onEnter,
  onBuild,
  signedInHandle,
  authError,
  configured,
  setupNotice,
}: {
  onEnter: () => void;
  onBuild: () => void;
  signedInHandle: string | null;
  authError?: string;
  configured: boolean;
  setupNotice?: React.ReactNode;
}) {
  return (
    <div className="flex w-full max-w-xl flex-col items-center gap-6">
      <Logo />
      {!configured && <div className="w-full">{setupNotice}</div>}
      {authError && <div className="w-full rounded-xl border border-rose-400/30 bg-rose-500/15 px-4 py-2 text-sm text-rose-100 backdrop-blur">Sign-in failed: {authError}</div>}
      <div className="flex w-full flex-col gap-3">
        <MenuButton onClick={onEnter}>Enter a world</MenuButton>
        <MenuButton onClick={onBuild} primary>
          {signedInHandle ? `My world · @${signedInHandle}` : 'Build my world'}
        </MenuButton>
      </div>
      <p className="max-w-md text-center text-sm text-white/80 drop-shadow">
        Sign in with X and your posting history becomes a city. Post the link — your followers walk around inside what you&apos;ve built.
      </p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="w-full max-w-lg rounded-3xl border border-white/12 bg-[#0B0E14]/70 p-6 text-center backdrop-blur-md sm:p-8">
      <h2 className="text-2xl font-bold">{title}</h2>
      <div className="mt-5 flex flex-col gap-3">{children}</div>
    </div>
  );
}

function EnterPanel({ onCancel }: { onCancel: () => void }) {
  const [handle, setHandle] = useState('');
  const clean = handle.trim().replace(/^@/, '').replace(/^https?:\/\/(x|twitter)\.com\//i, '').split(/[/?]/)[0];
  const go = () => {
    if (clean) location.href = `/w/${encodeURIComponent(clean)}`;
  };
  return (
    <Panel title="Enter a world">
      <label className="label text-left">X handle</label>
      <input
        type="text"
        autoFocus
        value={handle}
        onChange={(e) => setHandle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && go()}
        placeholder="@handle"
        className="!text-lg"
      />
      <p className="text-xs text-white/55">A world exists only once its owner has signed in and built it. Followers walk in; everyone else sees it from the boundary.</p>
      <div className="mt-1 grid grid-cols-2 gap-3">
        <button className="btn !py-3 text-base" onClick={go} disabled={!clean}>
          Enter
        </button>
        <button className="btn-ghost !py-3 text-base" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </Panel>
  );
}

function BuildPanel({ onCancel, configured }: { onCancel: () => void; configured: boolean }) {
  const [access, setAccess] = useState<'followers' | 'public' | 'invite'>('followers');
  const options: { v: typeof access; label: string; desc: string }[] = [
    { v: 'followers', label: 'Who can enter: My followers', desc: 'Sign in with X, we verify the follow, admit. Non-followers see the skyline and a Follow button.' },
    { v: 'public', label: 'Who can enter: Anyone', desc: 'No follow check. Also lets you list the world on Explore.' },
    { v: 'invite', label: 'Who can enter: Only me', desc: 'Private while you look around. Change it any time on your dashboard.' },
  ];
  const cur = options.find((o) => o.v === access)!;
  const cycle = () => setAccess(options[(options.findIndex((o) => o.v === access) + 1) % options.length].v);
  return (
    <Panel title="Build my world">
      <p className="text-sm text-white/70">
        Your city is generated from your real timeline, on your own X token: every post a building, likes become height, quiet months become
        empty lots. Nothing is invented.
      </p>
      <button className="btn-ghost w-full !py-3 text-base" onClick={cycle}>
        {cur.label}
      </button>
      <p className="-mt-1 text-xs text-white/55">{cur.desc}</p>
      <div className="mt-1 grid grid-cols-2 gap-3">
        <a className={`btn !py-3 text-base ${configured ? '' : 'pointer-events-none opacity-50'}`} href={`/api/auth/x/login?returnTo=${encodeURIComponent('/my-world')}&access=${access}`}>
          <XMark /> Sign in with X
        </a>
        <button className="btn-ghost !py-3 text-base" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <p className="text-[11px] text-white/45">We ask X for read access only (your posts, profile and follows) and never post on your behalf.</p>
    </Panel>
  );
}
