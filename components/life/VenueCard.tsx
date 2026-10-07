'use client';
import { useState } from 'react';
import { useWorld } from '@/components/world/store';
import { lifeActions, type SocialSend } from './useLife';

// A venue's panel: its actions (with cost, effect and cooldown) or the app it opens.
export function VenueCard({ sendSocial }: { sendSocial: SocialSend }) {
  const venue = useWorld((s) => s.selectedVenue);
  const selectVenue = useWorld((s) => s.selectVenue);
  const openPhone = useWorld((s) => s.openPhone);
  const me = useWorld((s) => s.life?.me ?? null);
  const peers = useWorld((s) => s.peers);
  const playerPos = useWorld((s) => s.playerPos);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  if (!venue) return null;

  const nearby = Object.values(peers).filter((p) => Math.hypot(p.x - playerPos.x, p.z - playerPos.z) < 16).map((p) => p.handle);
  const fmt = (d: Partial<{ vibes: number; clout: number; gas: number }>) =>
    Object.entries(d).filter(([, v]) => v).map(([k, v]) => `${(v as number) > 0 ? '+' : ''}${v} ${k[0].toUpperCase() + k.slice(1)}`).join(' · ');

  const act = async (actionId: string) => {
    setBusy(actionId);
    setMsg(null);
    try {
      const r = await lifeActions.venue(venue.id, actionId, nearby, sendSocial);
      const a = venue.actions.find((x) => x.id === actionId)!;
      setMsg(`${a.emoji} Done. ${a.nearby ? `${r.lifted} ${r.lifted === 1 ? 'person' : 'people'} nearby felt it.` : ''}`);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="pointer-events-auto absolute bottom-20 left-1/2 z-30 w-[min(94vw,560px)] -translate-x-1/2 rounded-3xl chrome p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl text-2xl" style={{ background: venue.color + '33' }}>
            {venue.emoji}
          </span>
          <div>
            <div className="text-lg font-bold leading-tight">{venue.name}</div>
            <div className="text-sm text-white/60">{venue.blurb}</div>
          </div>
        </div>
        <button className="rounded-full px-2 py-0.5 hover:bg-white/10" onClick={() => selectVenue(null)} aria-label="Close">
          ✕
        </button>
      </div>
      {!me ? (
        <p className="mt-3 text-sm text-white/60">Sign in with X to use the city.</p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {venue.app && (
            <button className="btn !justify-start !rounded-2xl !py-3" onClick={() => openPhone(venue.app === 'market' ? 'market' : venue.app!, venue.marketKind ?? null)}>
              {venue.app === 'wallet' ? '🏦 Open wallet' : venue.app === 'trenches' ? '📈 Open the Trenches' : `${venue.emoji} Browse ${venue.marketKind === 'car' ? 'cars' : venue.marketKind === 'boat' ? 'boats' : 'aircraft'}`}
            </button>
          )}
          {venue.actions.map((a) => (
            <button
              key={a.id}
              disabled={busy !== null || (a.bags > 0 && me.bags < a.bags)}
              onClick={() => act(a.id)}
              className="flex items-start gap-3 rounded-2xl bg-white/5 px-3 py-2.5 text-left transition hover:bg-white/10 disabled:opacity-50"
            >
              <span className="text-xl leading-none">{a.emoji}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{a.label}</span>
                <span className="block text-[11px] text-white/55">
                  {a.bags > 0 ? `${a.bags} bags · ` : a.bags < 0 ? `earn ${-a.bags} bags · ` : 'free · '}
                  {fmt(a.me)}
                  {a.nearby ? ` · nearby ${fmt(a.nearby)}` : ''}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      {msg && <p className="mt-2 text-xs text-white/70">{msg}</p>}
    </div>
  );
}
