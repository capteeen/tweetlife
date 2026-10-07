'use client';
import { useCallback, useEffect, useState } from 'react';
import { useWorld } from '@/components/world/store';
import type { Token } from '@/lib/life/trenches';
import type { Holding } from '@/lib/life/coins';
import { BUY_PRESETS } from '@/lib/life/coinRules';
import { lifeActions } from './useLife';

// The Coin Shop counter: today's live memecoins, bought with bags. What you hold floats on your hand as a
// balloon; sell it back here at the live price.

const pct = (n: number | null) => (n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`);

export function CoinCounter() {
  const me = useWorld((s) => s.life?.me ?? null);
  const [board, setBoard] = useState<Token[] | null>(null);
  const [boardErr, setBoardErr] = useState<string | null>(null);
  const [held, setHeld] = useState<Holding[]>([]);
  const [sel, setSel] = useState<Token | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadHeld = useCallback(() => lifeActions.coins().then((r) => setHeld(r.holdings)).catch(() => {}), []);
  useEffect(() => {
    fetch('/api/life/trenches')
      .then((r) => r.json())
      .then((b: { tokens: Token[]; error?: string }) => {
        setBoard(b.tokens.slice(0, 10));
        if (b.error) setBoardErr(b.error);
      })
      .catch(() => setBoardErr('Could not load the board.'));
    loadHeld();
  }, [loadHeld]);

  const run = async (key: string, f: () => Promise<unknown>) => {
    setBusy(key);
    setErr(null);
    try {
      await f();
      await loadHeld();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!me) return null;
  return (
    <div className="mt-4">
      <div className="text-xs text-white/55">Over the counter · 100 bags = $1 of coin at the live price</div>
      {held.length > 0 && (
        <div className="mt-2 space-y-1.5">
          <div className="text-xs font-semibold text-white/70">On your hand</div>
          {held.map((h) => (
            <div key={h.mint} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
              {h.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={h.icon} alt="" className="h-7 w-7 rounded-full bg-white/10" />
              ) : (
                <span className="h-7 w-7 rounded-full bg-white/10" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">${h.symbol}</span>
                <span className="num block text-[11px] text-white/55">
                  paid {h.costBags} · now {h.valueBags ?? '—'} bags{' '}
                  <span className={(h.pnlPct ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{h.pnlPct == null ? '' : `(${h.pnlPct >= 0 ? '+' : ''}${h.pnlPct}%)`}</span>
                </span>
              </span>
              <button className="rounded-full bg-white/10 px-2.5 py-1 text-xs hover:bg-white/20 disabled:opacity-50" disabled={!!busy} onClick={() => run(`h${h.mint}`, () => lifeActions.sellCoin(h.mint, 0.5))}>
                Sell ½
              </button>
              <button className="rounded-full bg-rose-500/80 px-2.5 py-1 text-xs font-semibold hover:bg-rose-500 disabled:opacity-50" disabled={!!busy} onClick={() => run(`a${h.mint}`, () => lifeActions.sellCoin(h.mint, 1))}>
                Sell all
              </button>
            </div>
          ))}
        </div>
      )}
      {!board && !boardErr && <p className="mt-2 text-sm text-white/60">Loading today&apos;s coins…</p>}
      {boardErr && <p className="mt-2 rounded-xl bg-rose-500/15 px-3 py-2 text-xs text-rose-200">{boardErr}</p>}
      {board && (
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {board.map((t) => (
            <button
              key={`${t.chain}:${t.address}`}
              onClick={() => setSel(t)}
              className={`flex items-center gap-2 rounded-xl px-2.5 py-2 text-left ${sel?.address === t.address ? 'bg-white/15 ring-2 ring-emerald-400' : 'bg-white/5 hover:bg-white/10'}`}
            >
              {t.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.icon} alt="" className="h-6 w-6 rounded-full bg-white/10" />
              ) : (
                <span className="h-6 w-6 rounded-full bg-white/10" />
              )}
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold">${t.symbol}</span>
                <span className={`num block text-[11px] ${(t.change24h ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{pct(t.change24h)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {sel && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">Buy ${sel.symbol}</span>
          {BUY_PRESETS.map((n) => (
            <button
              key={n}
              disabled={!!busy || me.bags < n}
              className="rounded-full bg-emerald-500 px-3 py-1.5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"
              onClick={() => run(`b${n}`, () => lifeActions.buyCoin(sel.chain, sel.address, n))}
            >
              {busy === `b${n}` ? '…' : `${n} bags`}
            </button>
          ))}
        </div>
      )}
      {err && <p className="mt-2 text-xs text-rose-300">{err}</p>}
    </div>
  );
}
