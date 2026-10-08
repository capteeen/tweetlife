'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWorld } from '@/components/world/store';
import { houseUrl, loveActions, nameOf, useLove } from './loveClient';
import { askLine, hostSide, type RequestView } from '@/lib/life/love';

// The 💌 cards: someone asked you something (accept or decline right here), or someone answered you (with a
// way to head over when it's a yes). Same in the city and in a house.

export function RequestNotices() {
  const notices = useLove((s) => s.notices);
  const me = useWorld((s) => s.life?.me ?? null);
  const openPhone = useWorld((s) => s.openPhone);
  if (!me || !notices.length) return null;
  // phones have room for one card at a time; the rest wait in the Relationships app
  return (
    <div className="pointer-events-none absolute left-1/2 top-16 z-[35] flex w-[min(94vw,400px)] -translate-x-1/2 flex-col gap-2 max-sm:top-40 max-sm:[&>[data-notice]:nth-child(n+2)]:hidden">
      {notices.map((n) => (n.status === 'pending' ? <Incoming key={n.id} r={n} /> : <Answer key={n.id} r={n} />))}
      {notices.length > 1 && (
        <button className="pointer-events-auto self-center rounded-full chrome px-3 py-1 text-xs sm:hidden" onClick={() => openPhone('love')}>
          +{notices.length - 1} more in Relationships
        </button>
      )}
    </div>
  );
}

function Incoming({ r }: { r: RequestView }) {
  const router = useRouter();
  const dismiss = useLove((s) => s.dismiss);
  const me = useWorld((s) => s.life?.me ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const answer = async (accept: boolean) => {
    setBusy(true);
    setErr(null);
    try {
      await loveActions.respond(r.id, accept);
      if (!accept || !me) return;
      // a yes to a visit or an invite: go to whoever's house it is
      if (r.kind === 'invite' || r.kind === 'visit') {
        const hostIsThem = hostSide(r.kind) === 'from';
        useWorld.getState().pushToast(hostIsThem ? `🏠 Heading to ${nameOf(r.who)}'s place` : `🏠 ${nameOf(r.who)} is coming over. Heading home`, 'love');
        const to = hostIsThem ? houseUrl(r.who) : '/home';
        if (location.pathname === to) location.reload();
        else router.push(to);
      } else if (r.kind === 'date') {
        useWorld.getState().pushToast(`💞 You and ${nameOf(r.who)} are dating now`, 'love');
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div data-notice="incoming" className="pointer-events-auto rounded-2xl border border-[#FF5D8F]/40 chrome p-3 shadow-xl">
      <div className="flex items-start gap-2.5">
        <span className="text-2xl leading-none">💌</span>
        <div className="min-w-0 flex-1 text-sm">
          <b>{nameOf(r.who)}</b> {askLine(r.kind, r.detail)}
          <div className="text-[11px] text-white/50">expires {timeLeft(r.expiresAt)}</div>
        </div>
        <button className="rounded-full px-1.5 text-white/50 hover:bg-white/10" onClick={() => dismiss(r.id)} aria-label="Later">
          ✕
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        <button disabled={busy} className="btn flex-1 !py-1.5 text-sm" onClick={() => answer(true)}>
          Accept
        </button>
        <button disabled={busy} className="btn-ghost flex-1 !py-1.5 text-sm" onClick={() => answer(false)}>
          Decline
        </button>
      </div>
      {err && <p className="mt-1.5 text-xs text-rose-300">{err}</p>}
    </div>
  );
}

function Answer({ r }: { r: RequestView }) {
  const dismiss = useLove((s) => s.dismiss);
  const yes = r.status === 'accepted';
  const go = yes && (r.kind === 'invite' || r.kind === 'visit') && r.passUntil && Date.parse(r.passUntil) > Date.now();
  const hostIsThem = r.kind === 'visit';
  const text = !yes
    ? `${nameOf(r.who)} said no${r.kind === 'date' ? ' 💔' : ''}`
    : r.kind === 'date'
      ? `💞 ${nameOf(r.who)} said yes! You're dating now`
      : r.kind === 'outing'
        ? `💞 ${nameOf(r.who)} is on the date with you`
        : hostIsThem
          ? `🚪 ${nameOf(r.who)} said come through`
          : `🏠 ${nameOf(r.who)} is coming over`;
  return (
    <div data-notice="answer" className="pointer-events-auto rounded-2xl chrome p-3 shadow-xl">
      <div className="flex items-start gap-2.5 text-sm">
        <span className="min-w-0 flex-1">{text}</span>
        <button className="rounded-full px-1.5 text-white/50 hover:bg-white/10" onClick={() => dismiss(r.id)} aria-label="Close">
          ✕
        </button>
      </div>
      {go && (
        <a className="btn mt-2 w-full !py-1.5 text-sm" href={hostIsThem ? houseUrl(r.who) : '/home'} onClick={() => dismiss(r.id)}>
          {hostIsThem ? `Go to ${nameOf(r.who)}'s place` : 'Go home to meet them'} →
        </a>
      )}
    </div>
  );
}

export function timeLeft(iso: string) {
  const m = Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 60000));
  return m < 60 ? `in ${m} min` : `in ${Math.round(m / 60)}h`;
}
