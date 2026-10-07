'use client';
import { useState } from 'react';
import { useWorld } from '@/components/world/store';
import { INTERACTIONS, type InteractionKind } from '@/lib/life/stats';
import { lifeActions, type SocialSend } from './useLife';

// Tap another visitor: who they are, what they're doing, and what you can do with them.
export function PeerCard({ worldId, sendSocial }: { worldId: string; sendSocial: SocialSend }) {
  const peer = useWorld((s) => s.selectedPeer);
  const selectPeer = useWorld((s) => s.selectPeer);
  const me = useWorld((s) => s.life?.me ?? null);
  const setChatOpen = useWorld((s) => s.setChatOpen);
  const openPhone = useWorld((s) => s.openPhone);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!peer) return null;

  const act = async (kind: InteractionKind) => {
    if (kind === 'gist') setChatOpen(true);
    setBusy(kind);
    setErr(null);
    try {
      await lifeActions.interact(kind, peer.handle, worldId, sendSocial);
      const def = INTERACTIONS[kind];
      useWorld.getState().pushToast(`${def.emoji} ${def.label} → @${peer.handle}`, 'social');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const fmt = (d: Partial<{ vibes: number; clout: number; gas: number }>) =>
    Object.entries(d)
      .filter(([, v]) => v)
      .map(([k, v]) => `${(v as number) > 0 ? '+' : ''}${v} ${k[0].toUpperCase() + k.slice(1)}`)
      .join(' · ');

  return (
    <div className="pointer-events-auto absolute bottom-20 left-1/2 z-30 w-[min(94vw,560px)] -translate-x-1/2 rounded-3xl chrome p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#8FC57A]/30 text-xl">🧍</span>
          <div>
            <div className="text-lg font-bold leading-tight">@{peer.handle}</div>
            <div className="text-sm text-white/60">{peer.ride ? `Riding the ${peer.ride}` : 'Walking around'}</div>
          </div>
        </div>
        <button className="rounded-full px-2 py-0.5 hover:bg-white/10" onClick={() => selectPeer(null)} aria-label="Close">
          ✕
        </button>
      </div>
      {!me ? (
        <p className="mt-3 text-sm text-white/60">Sign in with X to interact.</p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {(Object.keys(INTERACTIONS) as InteractionKind[]).map((k) => {
            const d = INTERACTIONS[k];
            return (
              <button
                key={k}
                disabled={busy !== null || (d.bags > 0 && me.bags < d.bags)}
                onClick={() => act(k)}
                className="flex items-start gap-3 rounded-2xl bg-white/5 px-3 py-2.5 text-left transition hover:bg-white/10 disabled:opacity-50"
              >
                <span className="text-xl leading-none">{d.emoji}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{d.label}</span>
                  <span className="block text-[11px] text-white/55">
                    {d.bags > 0 ? `${d.bags} bags · ` : ''}
                    {fmt(d.me)}
                  </span>
                </span>
              </button>
            );
          })}
          <button onClick={() => openPhone('solana', null, peer.handle)} className="flex items-start gap-3 rounded-2xl bg-[#9945FF]/20 px-3 py-2.5 text-left transition hover:bg-[#9945FF]/30">
            <span className="text-xl leading-none">◎</span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">Send SOL</span>
              <span className="block text-[11px] text-white/55">real money, from your Solana wallet</span>
            </span>
          </button>
        </div>
      )}
      {err && <p className="mt-2 text-xs text-rose-300">{err}</p>}
    </div>
  );
}
