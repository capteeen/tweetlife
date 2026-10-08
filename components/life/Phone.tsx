'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useWorld, type MarketKind, type PhoneApp } from '@/components/world/store';
import { refreshWallet } from './useLife';
import { compact, fullNumber, relativeTime } from '@/lib/format';
import { ITEMS } from '@/lib/life/market';
import { FURNITURE, SLOT_LABEL, furnitureById, resaleValue, type Slot } from '@/lib/life/home';
import type { Token } from '@/lib/life/trenches';
import { lifeActions, type SocialSend } from './useLife';
import { ConfirmButton } from '@/components/ui/ConfirmButton';
import { MapApp } from './MapApp';
import { showWelcomeAgain } from './Welcome';

/** Buys at or above this many bags ask "Sure?" first. */
const BIG_SPEND = 1000;

// The phone: a grid of apps over the world. Everything here reads real data — live token prices,
// your real holdings and ledger, real people on the rich list — with bags as in-world points.

const APPS: { id: PhoneApp; label: string; emoji: string; bg: string }[] = [
  { id: 'trenches', label: 'Trenches', emoji: '📈', bg: 'linear-gradient(135deg,#06D6A0,#118AB2)' },
  { id: 'wallet', label: 'Bank', emoji: '🏦', bg: 'linear-gradient(135deg,#FFD166,#F28C28)' },
  { id: 'solana', label: 'Solana', emoji: '◎', bg: 'linear-gradient(135deg,#9945FF,#14F195)' },
  { id: 'hustle', label: 'Hustle', emoji: '💼', bg: 'linear-gradient(135deg,#8338EC,#3A86FF)' },
  { id: 'market', label: 'Market', emoji: '🛍️', bg: 'linear-gradient(135deg,#FF5D8F,#E63946)' },
  { id: 'garage', label: 'Garage', emoji: '🚗', bg: 'linear-gradient(135deg,#6B7280,#1B2436)' },
  { id: 'house', label: 'House', emoji: '🏠', bg: 'linear-gradient(135deg,#F28C28,#C99A5B)' },
  { id: 'rich', label: 'Rich list', emoji: '👑', bg: 'linear-gradient(135deg,#FFD089,#B8A382)' },
  { id: 'gist', label: 'Gist', emoji: '💬', bg: 'linear-gradient(135deg,#1D9BF0,#2EC4B6)' },
  { id: 'map', label: 'Map', emoji: '🗺️', bg: 'linear-gradient(135deg,#7FB069,#2D6A4F)' },
  { id: 'guestbook', label: 'Guestbook', emoji: '🪨', bg: 'linear-gradient(135deg,#E8DCC8,#8A96A8)' },
  { id: 'settings', label: 'Settings', emoji: '⚙️', bg: 'linear-gradient(135deg,#9AA6B8,#4B5563)' },
];

export function Phone({ sendSocial, handle }: { sendSocial: SocialSend; handle: string }) {
  const phone = useWorld((s) => s.phone);
  const openPhone = useWorld((s) => s.openPhone);
  const closePhone = useWorld((s) => s.closePhone);
  const me = useWorld((s) => s.life?.me ?? null);
  if (!phone.open) return null;
  const title = APPS.find((a) => a.id === phone.app)?.label ?? '';
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/35 p-3 backdrop-blur-sm" onClick={closePhone}>
      <div className="flex max-h-[92vh] w-[min(96vw,420px)] flex-col overflow-hidden rounded-[36px] border-[6px] border-[#0B0E14] bg-[#0B0E14] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pb-1 pt-3 text-xs text-white/70">
          <span className="num">{new Date().toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })}</span>
          <span className="h-5 w-24 rounded-full bg-black" />
          <span className="num">{me ? `${compact(me.bags)} bags` : 'signed out'}</span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2">
          {phone.app !== 'home' ? (
            <button className="rounded-full bg-white/10 px-3 py-1 text-sm hover:bg-white/15" onClick={() => openPhone('home')}>
              ‹ Home
            </button>
          ) : (
            <span className="text-sm font-semibold">Phone</span>
          )}
          <span className="flex-1 text-center text-sm font-semibold">{title}</span>
          <button className="rounded-full bg-white/10 px-3 py-1 text-sm hover:bg-white/15" onClick={closePhone}>
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5" style={{ background: 'linear-gradient(180deg,#1B2436 0%,#2a1f4e 60%,#4a2a3a 100%)' }}>
          {!me && phone.app !== 'map' && phone.app !== 'guestbook' && phone.app !== 'settings' ? (
            <div className="py-10 text-center text-sm text-white/70">
              Sign in with X to get a phone.
              <div className="mt-3">
                <a className="btn" href={`/api/auth/x/login?returnTo=${encodeURIComponent(`/w/${handle}`)}`}>
                  Sign in with X
                </a>
              </div>
            </div>
          ) : phone.app === 'home' ? (
            <div className="grid grid-cols-4 gap-x-2 gap-y-5 pt-4">
              {APPS.map((a) => (
                <button key={a.id} className="flex flex-col items-center gap-1.5 text-[11px] text-white/90" onClick={() => openPhone(a.id)}>
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl shadow-lg" style={{ background: a.bg }}>
                    {a.emoji}
                  </span>
                  {a.label}
                </button>
              ))}
            </div>
          ) : phone.app === 'trenches' ? (
            <Trenches />
          ) : phone.app === 'wallet' ? (
            <Bank sendSocial={sendSocial} />
          ) : phone.app === 'solana' ? (
            <Solana sendSocial={sendSocial} prefillTo={phone.to} />
          ) : phone.app === 'hustle' ? (
            <Hustle />
          ) : phone.app === 'market' ? (
            <Market kind={phone.marketKind} />
          ) : phone.app === 'garage' ? (
            <Garage />
          ) : phone.app === 'house' ? (
            <House />
          ) : phone.app === 'rich' ? (
            <RichList />
          ) : phone.app === 'gist' ? (
            <Gist />
          ) : phone.app === 'map' ? (
            <MapApp />
          ) : phone.app === 'guestbook' ? (
            <GuestbookApp />
          ) : (
            <SettingsApp handle={handle} />
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <p className="label mb-2">{title}</p>
      {children}
    </div>
  );
}

const pct = (n: number | null) => (n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`);
const usd = (n: number | null) => (n == null ? '—' : n >= 1 ? `$${n.toFixed(2)}` : `$${n.toPrecision(3)}`);

function Trenches() {
  const [board, setBoard] = useState<{ tokens: Token[]; at: string; error?: string } | null>(null);
  const [sel, setSel] = useState<Token | null>(null);
  const [sol, setSol] = useState(0.05);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const wallet = useWorld((s) => s.wallet);
  useEffect(() => {
    fetch('/api/life/trenches').then((r) => r.json()).then(setBoard).catch(() => setBoard({ tokens: [], at: '', error: 'Could not load the board.' }));
    refreshWallet().catch(() => {});
  }, []);
  const solana = board?.tokens.filter((t) => t.chain === 'solana') ?? [];
  const held = (t: Token) => wallet?.balances?.tokens.find((h) => h.mint === t.address);
  const ape = async () => {
    if (!sel) return;
    setBusy(true);
    setErr(null);
    setReceipt(null);
    try {
      const r = await lifeActions.swap('buy', sel.address, sol, sel.symbol);
      setReceipt(r.url);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <p className="mt-2 text-xs text-white/60">
        Live Solana memecoins (DexScreener top boosts), real prices. You ape with <b>real SOL</b> from your Solana wallet, swapped on-chain through Jupiter.
      </p>
      {wallet?.cluster === 'devnet' && <p className="mt-2 rounded-xl bg-amber-500/15 px-3 py-2 text-xs text-amber-200">This deployment is on devnet: swaps are not possible (no liquidity). Browse the board; the operator switches to mainnet when ready.</p>}
      {!board && <p className="mt-4 text-sm text-white/60">Loading the board…</p>}
      {board?.error && <p className="mt-4 rounded-xl bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{board.error}</p>}
      {board && solana.length === 0 && !board.error && <p className="mt-4 text-sm text-white/60">No Solana tokens on the board right now.</p>}
      <ul className="mt-3 space-y-1.5">
        {solana.map((t) => {
          const h = held(t);
          return (
            <li key={t.address}>
              <button className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${sel?.address === t.address ? 'bg-white/15' : 'bg-white/5 hover:bg-white/10'}`} onClick={() => setSel(t)}>
                {t.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.icon} alt="" className="h-8 w-8 rounded-full bg-white/10" />
                ) : (
                  <span className="h-8 w-8 rounded-full bg-white/10" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">${t.symbol}</span>
                  <span className="num block text-[11px] text-white/55">
                    {usd(t.priceUsd)} · mcap {t.marketCap ? compact(t.marketCap) : '—'}
                    {h ? ` · you hold ${usd(h.valueUsd)}` : ''}
                  </span>
                </span>
                <span className={`num text-sm ${(t.change24h ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{pct(t.change24h)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {sel && (
        <div className="sticky bottom-0 mt-3 rounded-2xl bg-[#0B0E14]/90 p-3 backdrop-blur">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">Ape ${sel.symbol}</span>
            <a className="text-xs text-white/50 underline" href={sel.url} target="_blank" rel="noopener noreferrer">
              chart ↗
            </a>
          </div>
          <div className="mt-2 flex gap-2">
            {[0.01, 0.05, 0.1, 0.5].map((n) => (
              <button key={n} className={`flex-1 rounded-full py-1.5 text-sm ${sol === n ? 'bg-[#9945FF] text-white' : 'bg-white/10'}`} onClick={() => setSol(n)}>
                {n}
              </button>
            ))}
          </div>
          <p className="num mt-1 text-[11px] text-white/50">
            wallet: {wallet?.balances ? `${wallet.balances.sol.toFixed(4)} SOL` : '—'} · slippage 3% · fees ≈ 0.001 SOL
          </p>
          <button className="btn mt-2 w-full !bg-[#9945FF]" onClick={ape} disabled={busy || wallet?.cluster !== 'mainnet-beta' || !wallet?.balances || wallet.balances.sol < sol + 0.005}>
            🦍 Ape {sol} SOL
          </button>
          {receipt && (
            <a className="mt-1 block text-xs text-emerald-300 underline" href={receipt} target="_blank" rel="noopener noreferrer">
              View transaction ↗
            </a>
          )}
          {err && <p className="mt-1 text-xs text-rose-300">{err}</p>}
        </div>
      )}
    </div>
  );
}

function Bank({ sendSocial }: { sendSocial: SocialSend }) {
  const life = useWorld((s) => s.life);
  const [to, setTo] = useState('');
  const [amt, setAmt] = useState(100);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!life?.me) return null;
  const send = async () => {
    setBusy(true);
    setErr(null);
    try {
      await lifeActions.send(to, amt, note || undefined, sendSocial);
      setTo('');
      setNote('');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <div className="mt-3 rounded-2xl bg-white/5 p-4">
        <p className="label">Bank balance</p>
        <p className="num text-3xl font-bold">{fullNumber(life.me.bags)} bags</p>
        <p className="num mt-1 text-xs text-white/55">
          net worth {fullNumber(life.netWorth ?? life.me.bags)} · {compact((life.assets ?? []).reduce((a, x) => a + x.paid, 0))} in assets
        </p>
        <p className="mt-1 text-[11px] text-white/40">In-game money for the Market, venues, gifts and parties. Not real money; it cannot be bought or cashed out. Real money lives in the Solana app.</p>
      </div>
      <Section title="Send bags">
        <div className="flex gap-2">
          <input type="text" placeholder="@handle" value={to} onChange={(e) => setTo(e.target.value)} />
          <input type="text" inputMode="numeric" value={amt} onChange={(e) => setAmt(Math.max(0, Number(e.target.value.replace(/\D/g, '')) || 0))} className="!w-24 text-center" />
        </div>
        <div className="mt-2 flex gap-2">
          <input type="text" placeholder="note (optional)" value={note} onChange={(e) => setNote(e.target.value.slice(0, 80))} />
          <button className="btn whitespace-nowrap" onClick={send} disabled={busy || !to.trim() || amt < 1 || amt > life.me.bags}>
            Send
          </button>
        </div>
        <p className="mt-1 text-[11px] text-white/45">Anyone who has signed in to TweetLife. They get a toast if they are inside a world.</p>
      </Section>
      {err && <p className="mt-2 text-xs text-rose-300">{err}</p>}
      <Section title="Ledger">
        <ul className="space-y-1 text-xs">
          {(life.txs ?? []).map((t) => (
            <li key={t.id} className="flex justify-between gap-2 border-t border-white/5 py-1">
              <span className="truncate text-white/70">{t.note}</span>
              <span className={`num whitespace-nowrap ${t.amount >= 0 ? 'text-emerald-300' : 'text-white/60'}`}>
                {t.amount >= 0 ? '+' : ''}
                {t.amount} · {relativeTime(t.at)}
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Solana({ sendSocial, prefillTo }: { sendSocial: SocialSend; prefillTo: string | null }) {
  const wallet = useWorld((s) => s.wallet);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [to, setTo] = useState(prefillTo ? `@${prefillTo}` : '');
  const [sol, setSol] = useState('0.01');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    refreshWallet().catch((e) => setLoadErr((e as Error).message));
  }, []);
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setErr(null);
    setReceipt(null);
    try {
      const r = (await fn()) as { url?: string } | undefined;
      if (r?.url) setReceipt(r.url);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  if (!wallet) return <p className="mt-4 text-sm text-white/60">{loadErr ?? 'Opening your wallet…'}</p>;
  const b = wallet.balances;
  const amount = Number(sol);
  return (
    <div>
      <div className="mt-3 rounded-2xl p-4" style={{ background: 'linear-gradient(135deg,#9945FF33,#14F19533)' }}>
        <div className="flex items-center justify-between">
          <p className="label">Solana wallet</p>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${wallet.cluster === 'devnet' ? 'bg-amber-400/20 text-amber-200' : 'bg-emerald-400/20 text-emerald-200'}`}>{wallet.cluster}</span>
        </div>
        <p className="num mt-1 text-3xl font-bold">{b ? `${b.sol.toFixed(4)} SOL` : '—'}</p>
        <p className="num text-xs text-white/60">{b?.totalUsd != null ? `≈ $${b.totalUsd.toFixed(2)} incl. tokens` : wallet.error ?? 'balance unavailable'}</p>
        <button
          className="num mt-3 w-full truncate rounded-xl bg-black/30 px-3 py-2 text-left text-xs"
          onClick={async () => { await navigator.clipboard.writeText(wallet.address).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          title="Copy address"
        >
          {copied ? 'Copied ✓' : wallet.address}
        </button>
        <div className="mt-2 flex gap-2 text-xs">
          <a className="underline text-white/70" href={wallet.explorer} target="_blank" rel="noopener noreferrer">explorer ↗</a>
          {wallet.cluster === 'devnet' && (
            <button className="underline text-amber-200" disabled={busy !== null} onClick={() => run('air', () => lifeActions.airdrop())}>get 1 devnet SOL</button>
          )}
        </div>
        <p className="mt-2 text-[11px] text-white/50">
          {wallet.cluster === 'devnet' ? 'Devnet SOL has no value — this is for testing.' : 'Real money. Fund it by sending SOL to the address above from any wallet or exchange.'}
        </p>
      </div>

      <Section title="Send SOL">
        <div className="flex gap-2">
          <input type="text" placeholder="@handle or address" value={to} onChange={(e) => setTo(e.target.value)} />
          <input type="text" inputMode="decimal" value={sol} onChange={(e) => setSol(e.target.value.replace(/[^0-9.]/g, ''))} className="!w-24 text-center" />
        </div>
        <div className="mt-2 flex gap-2">
          <input type="text" placeholder="note (optional)" value={note} onChange={(e) => setNote(e.target.value.slice(0, 80))} />
          <button className="btn whitespace-nowrap !bg-[#9945FF]" disabled={busy !== null || !to.trim() || !(amount > 0) || !b || amount + 0.001 > b.sol} onClick={() => run('send', () => lifeActions.sendSol(to, amount, note || undefined, sendSocial))}>
            Send
          </button>
        </div>
        <p className="mt-1 text-[11px] text-white/45">A handle sends to that player&apos;s TweetLife wallet. An address sends anywhere. On-chain and irreversible.</p>
      </Section>

      <Section title="Tokens">
        {!b || b.tokens.length === 0 ? (
          <p className="text-sm text-white/55">No tokens. Ape something in the Trenches.</p>
        ) : (
          <ul className="space-y-1.5">
            {b.tokens.map((t) => (
              <li key={t.mint} className="rounded-xl bg-white/5 px-3 py-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{t.symbol ? `$${t.symbol}` : `${t.mint.slice(0, 6)}…`}</span>
                  <span className="num">{t.valueUsd != null ? `$${t.valueUsd.toFixed(2)}` : 'unpriced'}</span>
                </div>
                <div className="num mt-1 flex items-center justify-between text-[11px] text-white/55">
                  <span>{compact(t.amount)} · {usd(t.priceUsd)} · 24h {pct(t.change24h)}</span>
                  <span className="flex gap-1">
                    <button className="rounded-full bg-white/10 px-2 py-0.5" disabled={busy !== null || wallet.cluster !== 'mainnet-beta'} onClick={() => run(t.mint, () => lifeActions.swap('sell', t.mint, 0.5, t.symbol ?? undefined))}>sell ½</button>
                    <button className="rounded-full bg-white/10 px-2 py-0.5" disabled={busy !== null || wallet.cluster !== 'mainnet-beta'} onClick={() => run(t.mint, () => lifeActions.swap('sell', t.mint, 1, t.symbol ?? undefined))}>sell all</button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {receipt && (
        <a className="mt-2 block text-xs text-emerald-300 underline" href={receipt} target="_blank" rel="noopener noreferrer">View transaction ↗</a>
      )}
      {err && <p className="mt-2 text-xs text-rose-300">{err}</p>}

      <Section title="Activity">
        <ul className="space-y-1 text-xs">
          {wallet.txs.length === 0 && <li className="text-white/50">Nothing yet.</li>}
          {wallet.txs.map((t) => (
            <li key={t.id} className="flex justify-between gap-2 border-t border-white/5 py-1">
              <span className="truncate text-white/70">{t.url ? <a className="underline" href={t.url} target="_blank" rel="noopener noreferrer">{t.note}</a> : t.note}</span>
              <span className={`num whitespace-nowrap ${t.sol >= 0 ? 'text-emerald-300' : 'text-white/60'}`}>{t.sol ? `${t.sol > 0 ? '+' : ''}${t.sol.toFixed(4)} SOL` : ''} · {relativeTime(t.at)}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Your keys">
        <p className="text-[11px] text-white/55">
          This wallet was generated for you and its key is stored encrypted on TweetLife&apos;s server. You can take it anywhere: reveal the secret key and import it into Phantom or Solflare. Anyone who sees the key controls the funds.
        </p>
        {secret ? (
          <div className="mt-2 rounded-xl bg-black/40 p-3">
            <p className="num break-all text-xs">{secret}</p>
            <button className="btn-ghost mt-2 !px-3 !py-1 text-xs" onClick={() => setSecret(null)}>Hide</button>
          </div>
        ) : (
          <button className="btn-danger mt-2 !px-3 !py-1.5 text-xs" disabled={busy !== null} onClick={() => run('export', async () => { const r = await lifeActions.exportKey(); setSecret(r.secretKey); })}>
            Reveal secret key
          </button>
        )}
        {wallet.exportedAt && <p className="mt-1 text-[11px] text-white/40">Last revealed {relativeTime(wallet.exportedAt)}.</p>}
      </Section>
    </div>
  );
}

function Hustle() {
  const q = useWorld((s) => s.life?.quests ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  if (!q) return null;
  return (
    <div>
      <p className="mt-2 text-xs text-white/60">Daily. Progress counts real activity. Resets {relativeTime(q.resetsAt)}.</p>
      <ul className="mt-3 space-y-2">
        {q.quests.map((x) => (
          <li key={x.id} className="rounded-xl bg-white/5 px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">
                {x.emoji} {x.title}
              </span>
              <span className="num text-xs text-emerald-300">+{x.reward}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-[#1D9BF0]" style={{ width: `${(x.progress / x.target) * 100}%` }} />
              </div>
              <span className="num text-[11px] text-white/55">
                {x.progress}/{x.target}
              </span>
              {x.claimed ? (
                <span className="text-[11px] text-white/40">claimed</span>
              ) : !x.done ? (
                <span className="cursor-not-allowed rounded-full bg-white/5 px-2 py-0.5 text-xs text-white/30" title="Finish it first">
                  Claim
                </span>
              ) : (
                <button className="btn !px-2 !py-0.5 text-xs" disabled={busy !== null} onClick={async () => { setBusy(x.id); try { await lifeActions.claim(x.id); } finally { setBusy(null); } }}>
                  Claim
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Market({ kind }: { kind: MarketKind }) {
  const openPhone = useWorld((s) => s.openPhone);
  const tabs = (
    <div className="mt-2 flex gap-1 rounded-full bg-white/5 p-1 text-xs">
      <button className={`flex-1 rounded-full py-1 ${kind !== 'home' ? 'bg-white/15 font-semibold' : 'text-white/60'}`} onClick={() => openPhone('market', null)}>
        🚗 Vehicles
      </button>
      <button className={`flex-1 rounded-full py-1 ${kind === 'home' ? 'bg-white/15 font-semibold' : 'text-white/60'}`} onClick={() => openPhone('market', 'home')}>
        🏠 Home
      </button>
    </div>
  );
  if (kind === 'home') return <div>{tabs}<HomeShop /></div>;
  return <div>{tabs}<Vehicles kind={kind} /></div>;
}

/** Market → Home: furniture, grouped by where it goes in the room. Buying puts it straight in the house. */
function HomeShop() {
  const life = useWorld((s) => s.life);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const owned = new Map((life?.furniture ?? []).map((a) => [a.itemId, a]));
  const slots = (Object.keys(SLOT_LABEL) as Slot[]).filter((slot) => FURNITURE.some((f) => f.slot === slot && f.price > 0));
  return (
    <div>
      <p className="mt-2 text-xs text-white/60">Everyone starts with the basics. Better furniture gives bigger boosts, and some of it needs light.</p>
      {slots.map((slot) => (
        <div key={slot} className="mt-3">
          <h3 className="text-[11px] uppercase tracking-wide text-white/45">{SLOT_LABEL[slot]}</h3>
          <ul className="mt-1.5 space-y-2">
            {FURNITURE.filter((f) => f.slot === slot && f.price > 0).map((f) => {
              const have = owned.get(f.id);
              return (
                <li key={f.id} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl" style={{ background: f.color + '33' }}>
                    {f.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">
                      {f.name} {f.needsPower ? <span title="Needs light" className="text-[10px] text-white/45">⚡</span> : null}
                    </span>
                    <span className="block text-[11px] text-white/55">{f.blurb}</span>
                    <span className="block text-[11px] text-white/45">{f.actions.map((a) => a.label).join(' · ')}</span>
                  </span>
                  {have ? (
                    <span className="text-xs text-emerald-300">{have.stored ? 'stored' : 'in room'}</span>
                  ) : (
                    <ConfirmButton
                      className="btn !px-3 !py-1.5 text-xs"
                      confirm={f.price >= BIG_SPEND}
                      ask={`Buy · ${fullNumber(f.price)}?`}
                      disabled={busy !== null || !life?.me || life.me.bags < f.price}
                      onClick={async () => { setBusy(f.id); setErr(null); try { await lifeActions.buyFurniture(f.id); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); } }}
                    >
                      {fullNumber(f.price)}
                    </ConfirmButton>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {err && <p className="mt-2 text-xs text-rose-300">{err}</p>}
    </div>
  );
}

/** Phone → House: go home, and manage what is in the room and in storage. */
function House() {
  const furniture = useWorld((s) => s.life?.furniture ?? []);
  const openPhone = useWorld((s) => s.openPhone);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = async (id: string, fn: () => Promise<unknown>) => { setBusy(id); setErr(null); try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); } };
  const placed = furniture.filter((a) => !a.stored), stored = furniture.filter((a) => a.stored);
  const row = (a: (typeof furniture)[number]) => {
    const f = furnitureById(a.itemId);
    if (!f) return null;
    return (
      <li key={a.itemId} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2">
        <span className="text-xl">{f.emoji}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{f.name}</span>
          <span className="block text-[11px] text-white/50">{SLOT_LABEL[f.slot]}{a.paid ? ` · paid ${fullNumber(a.paid)}` : ' · starter kit'}</span>
        </span>
        {a.stored && (
          <button className="btn-ghost !px-2 !py-1 text-xs" disabled={busy !== null} onClick={() => run(a.itemId, () => lifeActions.placeFurniture(a.itemId))}>
            Place
          </button>
        )}
        {a.paid > 0 && (
          <ConfirmButton className="btn-ghost !px-2 !py-1 text-xs" ask={`Sell for ${fullNumber(resaleValue(a.paid))}?`} disabled={busy !== null} onClick={() => run(a.itemId, () => lifeActions.sellFurniture(a.itemId))}>
            Sell {fullNumber(resaleValue(a.paid))}
          </ConfirmButton>
        )}
      </li>
    );
  };
  return (
    <div>
      <Link href="/home" className="btn mt-3 w-full !rounded-2xl !py-3">
        🏠 Go home
      </Link>
      <div className="mt-3 flex items-center justify-between">
        <h3 className="text-[11px] uppercase tracking-wide text-white/45">In the room</h3>
        <button className="text-xs text-[#BFE3FF] underline" onClick={() => openPhone('market', 'home')}>
          Shop for more
        </button>
      </div>
      <ul className="mt-1.5 space-y-2">{placed.map(row)}</ul>
      {stored.length > 0 && (
        <>
          <h3 className="mt-3 text-[11px] uppercase tracking-wide text-white/45">In storage</h3>
          <p className="text-[11px] text-white/45">Replaced by something better. Place it back, or sell it for half.</p>
          <ul className="mt-1.5 space-y-2">{stored.map(row)}</ul>
        </>
      )}
      {err && <p className="mt-2 text-xs text-rose-300">{err}</p>}
    </div>
  );
}

function Vehicles({ kind }: { kind: MarketKind }) {
  const life = useWorld((s) => s.life);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const owned = new Set((life?.assets ?? []).map((a) => a.id));
  const items = ITEMS.filter((i) => !kind || kind === 'home' || i.kind === kind);
  return (
    <div>
      <p className="mt-2 text-xs text-white/60">Vehicles change how you move. Cars are fast, boats can leave the shore, the jet flies over everything.</p>
      <ul className="mt-3 space-y-2">
        {items.map((i) => (
          <li key={i.id} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl text-2xl" style={{ background: i.color + '33' }}>
              {i.emoji}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{i.name}</span>
              <span className="block text-[11px] text-white/55">
                {i.blurb} · {i.speed}× speed
              </span>
            </span>
            {owned.has(i.id) ? (
              <span className="text-xs text-emerald-300">owned</span>
            ) : (
              <ConfirmButton
                className="btn !px-3 !py-1.5 text-xs"
                confirm={i.price >= BIG_SPEND}
                ask={`Buy · ${fullNumber(i.price)}?`}
                disabled={busy !== null || !life?.me || life.me.bags < i.price}
                onClick={async () => { setBusy(i.id); setErr(null); try { await lifeActions.buy(i.id); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); } }}
              >
                {fullNumber(i.price)}
              </ConfirmButton>
            )}
          </li>
        ))}
      </ul>
      {err && <p className="mt-2 text-xs text-rose-300">{err}</p>}
    </div>
  );
}

function Garage() {
  const assets = useWorld((s) => s.life?.assets ?? []);
  const [busy, setBusy] = useState(false);
  const eq = assets.find((a) => a.equipped);
  const set = async (id: string | null) => { setBusy(true); try { await lifeActions.equip(id); } finally { setBusy(false); } };
  return (
    <div>
      {assets.length === 0 ? <p className="mt-4 text-sm text-white/55">Nothing yet. The Market has keke to jet.</p> : null}
      <ul className="mt-3 space-y-2">
        <li>
          <button className={`w-full rounded-xl px-3 py-2 text-left text-sm ${!eq ? 'bg-[#1D9BF0]/30' : 'bg-white/5'}`} disabled={busy} onClick={() => set(null)}>
            🚶 Walk
          </button>
        </li>
        {assets.map((a) => (
          <li key={a.id}>
            <button className={`w-full rounded-xl px-3 py-2 text-left text-sm ${a.equipped ? 'bg-[#1D9BF0]/30' : 'bg-white/5'}`} disabled={busy} onClick={() => set(a.id)}>
              {a.emoji} {a.name} <span className="text-xs text-white/50">· {a.speed}× · bought {relativeTime(a.acquiredAt)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RichList() {
  const [list, setList] = useState<{ handle: string; name: string; avatarUrl: string | null; bags: number; held: number; netWorth: number; mood: string }[] | null>(null);
  useEffect(() => {
    fetch('/api/life/rich').then((r) => r.json()).then((j) => setList(j.list)).catch(() => setList([]));
  }, []);
  return (
    <div>
      <p className="mt-2 text-xs text-white/60">Net worth in bags: liquid + coins at live prices. Everyone who has signed in.</p>
      <ol className="mt-3 space-y-1.5">
        {!list && <li className="text-sm text-white/55">Loading…</li>}
        {list?.map((p, i) => (
          <li key={p.handle} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2">
            <span className="num w-5 text-right text-white/50">{i + 1}</span>
            {p.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.avatarUrl} alt="" className="h-8 w-8 rounded-full" />
            ) : (
              <span className="h-8 w-8 rounded-full bg-white/10" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">@{p.handle}</span>
              <span className="block text-[11px] text-white/55">{p.mood}</span>
            </span>
            <span className="num text-sm">{compact(p.netWorth)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Gist() {
  const chat = useWorld((s) => s.chat);
  const setChatOpen = useWorld((s) => s.setChatOpen);
  const closePhone = useWorld((s) => s.closePhone);
  return (
    <div>
      <p className="mt-2 text-xs text-white/60">What people near you said. Proximity chat has to be enabled by the world&apos;s owner.</p>
      <ul className="mt-3 space-y-1 text-sm">
        {chat.length === 0 && <li className="text-white/50">Nothing yet.</li>}
        {chat.map((c) => (
          <li key={c.id}>
            <span className="text-white/55">@{c.from}</span> {c.text}
          </li>
        ))}
      </ul>
      <button className="btn mt-4 w-full" onClick={() => { setChatOpen(true); closePhone(); }}>
        Open chat
      </button>
    </div>
  );
}

function GuestbookApp() {
  const setGuestbookOpen = useWorld((s) => s.setGuestbookOpen);
  const closePhone = useWorld((s) => s.closePhone);
  const marks = useWorld((s) => s.model?.marks ?? []);
  return (
    <div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {marks.length === 0 && <li className="text-white/50">No stones yet.</li>}
        {marks.map((m) => (
          <li key={m.id} className="rounded-xl bg-white/5 px-3 py-2">
            <span className="text-xs text-white/55">@{m.byHandle}</span>
            <p>{m.text}</p>
          </li>
        ))}
      </ul>
      <button className="btn mt-4 w-full" onClick={() => { setGuestbookOpen(true); closePhone(); }}>
        Leave a stone
      </button>
    </div>
  );
}

function SettingsApp({ handle }: { handle: string }) {
  const me = useWorld((s) => s.me);
  return (
    <div className="mt-3 space-y-2 text-sm">
      {me && (
        <a className="btn w-full" href={`/create?next=${encodeURIComponent(`/w/${handle}`)}`}>
          👕 Change my look
        </a>
      )}
      {me && (
        <button className="btn-ghost w-full" onClick={() => { useWorld.getState().closePhone(); showWelcomeAgain(); }}>
          👋 Show the welcome again
        </button>
      )}
      {me?.isOwner && (
        <Link className="btn w-full" href="/my-world">
          Owner dashboard
        </Link>
      )}
      <Link className="btn-ghost w-full" href="/how">
        How a world grows
      </Link>
      <Link className="btn-ghost w-full" href="/explore">
        Explore other worlds
      </Link>
      <Link className="btn-ghost w-full" href={`/w/${handle}`}>
        Reload this world
      </Link>
      <form action="/api/auth/logout" method="post">
        <button className="btn-danger w-full">Sign out</button>
      </form>
    </div>
  );
}
