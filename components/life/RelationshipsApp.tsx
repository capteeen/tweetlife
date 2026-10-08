'use client';
import { useEffect, useState } from 'react';
import { useWorld } from '@/components/world/store';
import { ConfirmButton } from '@/components/ui/ConfirmButton';
import { houseUrl, loveActions, nameOf, refreshLove, useLove } from './loveClient';
import { timeLeft } from './RequestNotices';
import { DATES, askLine, type BondView, type PersonRef, type RequestView } from '@/lib/life/love';

// Phone → Relationships: who you're dating (up to six), requests waiting on you or on them, visits on right now,
// and the people you're talking to (AI residents with how well you get on).

type Tab = 'partners' | 'requests' | 'visits' | 'talking';

export function RelationshipsApp() {
  const love = useLove((s) => s.state);
  const [tab, setTab] = useState<Tab>('partners');
  useEffect(() => {
    refreshLove();
  }, []);
  if (!love) return <p className="mt-6 text-center text-sm text-white/60">Loading…</p>;
  const partners = love.bonds.filter((b) => b.status === 'dating');
  const talking = love.bonds.filter((b) => b.status === 'talking');
  const waiting = love.incoming.length;
  const tabs: { id: Tab; label: string; n?: number }[] = [
    { id: 'partners', label: 'Partners', n: partners.length },
    { id: 'requests', label: 'Requests', n: waiting + love.outgoing.length },
    { id: 'visits', label: 'Visits', n: love.visits.length },
    { id: 'talking', label: 'Talking', n: talking.length },
  ];
  return (
    <div className="pt-2">
      <div className="rounded-2xl bg-gradient-to-br from-[#FF5D8F]/30 to-[#8338EC]/20 p-3">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-xs text-white/60">Dating</div>
            <div className="num text-2xl font-bold">
              {love.dating}
              <span className="text-base text-white/50"> / {love.max}</span>
            </div>
          </div>
          <div className="flex gap-1">
            {Array.from({ length: love.max }, (_, i) => (
              <span key={i} className={`text-lg ${i < love.dating ? '' : 'opacity-25 grayscale'}`}>
                💗
              </span>
            ))}
          </div>
        </div>
        <p className="mt-1 text-[11px] text-white/60">Each partner gives you +2 vibes and +1 clout a day. Your partners show on your profile.</p>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1 rounded-full bg-white/5 p-1 text-xs">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`relative rounded-full px-1 py-1.5 font-semibold ${tab === t.id ? 'bg-white/15' : 'text-white/60'}`}>
            {t.label}
            {t.id === 'requests' && waiting > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF5D8F] px-1 text-[10px]">{waiting}</span>}
          </button>
        ))}
      </div>
      {tab === 'partners' && <Partners list={partners} />}
      {tab === 'requests' && <Requests incoming={love.incoming} outgoing={love.outgoing} />}
      {tab === 'visits' && <Visits />}
      {tab === 'talking' && <Talking list={talking} />}
    </div>
  );
}

function Avatar({ who }: { who: PersonRef }) {
  if (who.kind === 'player' && who.avatarUrl)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={who.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full bg-white/10" />;
  return (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${who.kind === 'resident' ? 'bg-[#FFD089] text-[#0B0E14]' : 'bg-white/15'}`}>
      {(who.kind === 'player' ? who.handle : who.name.replace(/^(Big|Coach|Uncle|DJ|Nurse) /, ''))[0]?.toUpperCase()}
    </span>
  );
}

/** Talk to an AI resident from the phone: opens their chat card over the city. */
function ChatButton({ who }: { who: PersonRef }) {
  const inCity = useWorld((s) => !!s.model && !s.skyline);
  if (who.kind !== 'resident' || !inCity) return null;
  return (
    <button
      data-chat={who.id}
      className="rounded-full bg-white/10 px-2.5 py-1 text-xs hover:bg-white/15"
      onClick={() => {
        const s = useWorld.getState();
        s.closePhone();
        s.selectResident(who.id);
      }}
    >
      💬 Chat
    </button>
  );
}

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric' });

function Partners({ list }: { list: BondView[] }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const bags = useWorld((s) => s.life?.me?.bags ?? 0);
  if (!list.length)
    return <p className="mt-6 text-center text-sm text-white/60">No one yet. Tap someone in the city (or an AI resident) and ask them out 💘</p>;
  const go = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setErr(null);
    try {
      const r = (await fn()) as { accepted?: boolean | null; reply?: string | null } | undefined;
      if (r && r.accepted == null) useWorld.getState().pushToast('💌 Date request sent', 'love');
      if (r?.reply) useWorld.getState().pushToast(r.reply, 'love');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <ul className="mt-3 space-y-2">
      {err && <li className="rounded-xl bg-rose-500/15 px-3 py-2 text-xs text-rose-200">{err}</li>}
      {list.map((b) => {
        const to = b.who.kind === 'player' ? { handle: b.who.handle } : { residentId: b.who.id };
        const cooling = b.nextDateAt && b.nextDateAt > Date.now();
        return (
          <li key={b.id} data-partner={nameOf(b.who)} className="rounded-2xl bg-white/5 p-3">
            <div className="flex items-center gap-3">
              <Avatar who={b.who} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">
                  {nameOf(b.who)} {b.who.kind === 'resident' && <span className="text-[10px] font-normal text-white/50">AI resident</span>}
                </div>
                <div className="text-[11px] text-white/55">
                  💞 Dating since {fmtDay(b.datingSince ?? b.since)} · {b.dates} date{b.dates === 1 ? '' : 's'}
                </div>
              </div>
              <ChatButton who={b.who} />
              <a href={houseUrl(b.who)} className="rounded-full bg-white/10 px-2.5 py-1 text-xs hover:bg-white/15">
                🏠 Visit
              </a>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {Object.values(DATES).map((d) => (
                <button
                  key={d.id}
                  disabled={!!busy || !!cooling || d.bags > bags}
                  onClick={() => go(b.id + d.id, () => loveActions.ask('outing', to, d.id))}
                  className="rounded-xl bg-[#FF5D8F]/15 px-2 py-1.5 text-left text-[11px] hover:bg-[#FF5D8F]/25 disabled:opacity-50"
                >
                  <span className="block font-semibold">
                    {d.emoji} {d.id === 'dinner' ? 'Dinner date' : 'Go dancing'}
                  </span>
                  <span className="text-white/55">{cooling ? `in ${Math.ceil((b.nextDateAt! - Date.now()) / 60000)} min` : d.bags ? `${d.bags} bags` : 'free'}</span>
                </button>
              ))}
            </div>
            <div className="mt-2 flex justify-end">
              <ConfirmButton className="rounded-full px-2 py-0.5 text-[11px] text-white/45 hover:text-rose-300" ask="Sure? Break up" onClick={() => go(b.id + 'bye', () => loveActions.breakUp(b.id))}>
                💔 Break up
              </ConfirmButton>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Requests({ incoming, outgoing }: { incoming: RequestView[]; outgoing: RequestView[] }) {
  const [err, setErr] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <div className="mt-3 space-y-4">
      {err && <p className="rounded-xl bg-rose-500/15 px-3 py-2 text-xs text-rose-200">{err}</p>}
      <div>
        <p className="label mb-2">Waiting on you</p>
        {!incoming.length && <p className="text-sm text-white/50">Nothing right now.</p>}
        <ul className="space-y-2">
          {incoming.map((r) => (
            <li key={r.id} className="rounded-2xl bg-white/5 p-3">
              <div className="flex items-center gap-3">
                <Avatar who={r.who} />
                <div className="min-w-0 flex-1 text-sm">
                  <b>{nameOf(r.who)}</b> {askLine(r.kind, r.detail)}
                  <div className="text-[11px] text-white/50">expires {timeLeft(r.expiresAt)}</div>
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                <button className="btn flex-1 !py-1.5 text-sm" onClick={() => run(() => loveActions.respond(r.id, true))}>
                  Accept
                </button>
                <button className="btn-ghost flex-1 !py-1.5 text-sm" onClick={() => run(() => loveActions.respond(r.id, false))}>
                  Decline
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="label mb-2">You asked</p>
        {!outgoing.length && <p className="text-sm text-white/50">No requests out.</p>}
        <ul className="space-y-1.5">
          {outgoing.map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-2xl bg-white/5 px-3 py-2">
              <Avatar who={r.who} />
              <div className="min-w-0 flex-1 text-xs">
                <div className="text-sm font-semibold">{nameOf(r.who)}</div>
                <div className="text-white/55">
                  {r.kind === 'invite' ? 'Invited over' : r.kind === 'visit' ? 'Asked to come over' : r.kind === 'date' ? 'Asked out' : `Date: ${DATES[r.detail as keyof typeof DATES]?.label ?? 'night out'}`} · expires {timeLeft(r.expiresAt)}
                </div>
              </div>
              <button className="rounded-full bg-white/10 px-2.5 py-1 text-xs hover:bg-white/15" onClick={() => run(() => loveActions.cancel(r.id))}>
                Cancel
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Visits() {
  const visits = useLove((s) => s.state?.visits ?? []);
  if (!visits.length) return <p className="mt-6 text-center text-sm text-white/60">No visits on. Invite someone over, or ask to go to theirs.</p>;
  return (
    <ul className="mt-3 space-y-2">
      {visits.map((v) => (
        <li key={v.id} className="rounded-2xl bg-white/5 p-3">
          <div className="flex items-center gap-3">
            <Avatar who={v.mineToHost ? v.guest : v.host} />
            <div className="min-w-0 flex-1 text-sm">
              {v.mineToHost ? (
                <>
                  <b>{nameOf(v.guest)}</b> can come to your place
                </>
              ) : (
                <>
                  You can go to <b>{nameOf(v.host)}</b>&apos;s place
                </>
              )}
              <div className="text-[11px] text-white/50">until {new Date(v.until).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })}</div>
            </div>
          </div>
          <div className="mt-2 flex gap-2">
            <a className="btn flex-1 !py-1.5 text-center text-sm" href={v.mineToHost ? '/home' : houseUrl(v.host)}>
              {v.mineToHost ? 'Go home' : 'Go there'} →
            </a>
            <button className="btn-ghost !py-1.5 text-sm" onClick={() => loveActions.endVisit(v.id).catch(() => {})}>
              End visit
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Talking({ list }: { list: BondView[] }) {
  if (!list.length) return <p className="mt-6 text-center text-sm text-white/60">People you visit, and AI residents you chat with, show up here.</p>;
  return (
    <ul className="mt-3 space-y-1.5">
      {list.map((b) => (
        <li key={b.id} className="flex items-center gap-3 rounded-2xl bg-white/5 px-3 py-2">
          <Avatar who={b.who} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{nameOf(b.who)}</div>
            {b.affinity != null ? (
              <div className="mt-1 flex items-center gap-2 text-[11px] text-white/55">
                <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <span className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#FF5D8F] to-[#FFD089]" style={{ width: `${b.affinity}%` }} />
                </span>
                <span className="num">{b.affinity}</span>
              </div>
            ) : (
              <div className="text-[11px] text-white/55">💬 Talking since {fmtDay(b.since)}</div>
            )}
          </div>
          <ChatButton who={b.who} />
        </li>
      ))}
      <li className="pt-1 text-[11px] text-white/45">AI residents warm up as you chat (+2 a message, up to +20 a day), visit (+5) and date (+8). They say yes to a visit from 15 and to a date from 40.</li>
    </ul>
  );
}
