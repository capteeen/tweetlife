'use client';
import { useEffect, useState } from 'react';
import { useWorld, type Incident } from '@/components/world/store';
import { MAX_STARS, PEACEFUL_LOCK_H, STAR_DECAY_MIN, WARRANT_STARS } from '@/lib/life/crimeRules';
import { ARREST_FX_MS, crimeActions, refreshCrime } from './crime';
import { refreshLife, type SocialSend } from './useLife';

// What crime and police look like on screen: the victim's alert (call the police, file a complaint, let it go),
// the arrest, the cell with its countdown and bail, the daze after a lost fight, and your wanted stars.

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function useNow(ms = 500) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function Stars({ n, className = '' }: { n: number; className?: string }) {
  return (
    <span className={`tracking-tight ${className}`} aria-label={`${n} wanted stars`}>
      {Array.from({ length: MAX_STARS }, (_, i) => (
        <span key={i} className={i < n ? 'text-amber-300' : 'text-white/20'}>
          ★
        </span>
      ))}
    </span>
  );
}

export function CrimeHUD({ sendSocial }: { sendSocial: SocialSend }) {
  const incidents = useWorld((s) => s.incidents);
  const rec = useWorld((s) => s.life?.me?.record ?? null);
  const fx = useWorld((s) => s.arrestFx);
  const now = useNow();

  // the arrest plays for a few seconds, then the banner goes
  useEffect(() => {
    if (!fx) return;
    const t = setTimeout(() => useWorld.getState().setArrestFx(null), ARREST_FX_MS + 1500);
    return () => clearTimeout(t);
  }, [fx]);

  const jailedUntil = rec?.jailedUntil ? Date.parse(rec.jailedUntil) : 0;
  const jailed = jailedUntil > now;
  // time served: the cell opens by itself
  useEffect(() => {
    if (!jailedUntil || jailedUntil <= Date.now()) return;
    const t = setTimeout(() => {
      refreshLife();
      useWorld.getState().pushToast("🔓 Time served. You're free to go.", 'crime');
    }, jailedUntil - Date.now() + 400);
    return () => clearTimeout(t);
  }, [jailedUntil]);
  const dazedUntil = rec?.dazedUntil ? Date.parse(rec.dazedUntil) : 0;
  const dazed = dazedUntil > now && !jailed;
  const cuffing = !!fx && now - fx.at < ARREST_FX_MS;

  return (
    <>
      {fx && (
        <div className="pointer-events-none absolute left-1/2 top-20 z-40 w-[min(92vw,460px)] -translate-x-1/2 animate-[pulse_1.2s_ease-in-out_infinite] rounded-2xl border border-blue-400/50 bg-gradient-to-r from-blue-700/90 via-[#0B0E14]/90 to-red-700/90 px-4 py-3 text-center shadow-2xl">
          <div className="text-xs font-black uppercase tracking-[0.3em] text-white/80">🚨 Police 🚨</div>
          <div className="mt-0.5 text-lg font-extrabold">{fx.who === 'me' ? "You're under arrest" : `@${fx.who} is under arrest`}</div>
          <div className="text-sm text-white/75">{fx.text}</div>
        </div>
      )}

      {incidents.length > 0 && !fx && (
        <div className="pointer-events-auto absolute left-1/2 top-20 z-40 flex w-[min(94vw,480px)] -translate-x-1/2 flex-col gap-2">
          {incidents.slice(0, 2).map((i) => (
            <IncidentCard key={i.id} i={i} now={now} sendSocial={sendSocial} />
          ))}
        </div>
      )}

      {jailed && !cuffing && <JailPanel until={jailedUntil} bail={rec!.bail} why={rec!.jailFor} now={now} priors={rec!.priors} />}

      {dazed && (
        <div className="pointer-events-none absolute left-1/2 top-1/3 z-30 -translate-x-1/2 rounded-full bg-[#0B0E14]/80 px-5 py-2 text-center text-lg font-bold shadow-xl">
          💫 Dazed <span className="num text-white/70">{mmss(dazedUntil - now)}</span>
        </div>
      )}

      {rec && (rec.wanted > 0 || rec.peaceful) && (
        <div className="pointer-events-none absolute left-1/2 top-[3.85rem] z-20 -translate-x-1/2 rounded-full bg-[#0B0E14]/75 px-3 py-0.5 text-xs font-semibold max-sm:top-[3.6rem]">
          {rec.peaceful ? (
            <span>🕊️ Peaceful</span>
          ) : (
            <span>
              Wanted <Stars n={rec.wanted} className="text-sm" />
            </span>
          )}
        </div>
      )}
    </>
  );
}

function IncidentCard({ i, now, sendSocial }: { i: Incident; now: number; sendSocial: SocialSend }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const left = Date.parse(i.expiresAt) - now;
  useEffect(() => {
    if (left <= 0) refreshCrime();
  }, [left]);
  if (left <= 0) return null;
  const what =
    i.kind === 'fight'
      ? `${i.offender} jumped you${i.outcome === 'won' ? ' and won' : ' and lost'}.`
      : i.outcome === 'stolen'
        ? `${i.offender} picked your pocket: −${i.amount} bags.`
        : `${i.offender} tried to pick your pocket and got caught.`;
  const go = async (how: 'police' | 'complaint' | 'drop') => {
    setBusy(how);
    setErr(null);
    try {
      await crimeActions.report(i, how, sendSocial);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="rounded-2xl border border-rose-400/40 bg-[#1A0E14]/95 p-3.5 shadow-2xl">
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none">{i.kind === 'fight' ? '🥊' : i.outcome === 'stolen' ? '🫳' : '🚨'}</span>
        <div className="min-w-0 flex-1">
          <div className="font-bold leading-snug">{what}</div>
          <div className="text-xs text-white/55">
            Report it within <span className="num">{mmss(left)}</span>
            {i.outcome === 'caught' && !i.byResident ? ' · caught in the act, so it will stick' : ''}
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <button disabled={!!busy} onClick={() => go('police')} className="rounded-xl bg-blue-600 px-2 py-2 font-semibold hover:bg-blue-500 disabled:opacity-50">
          {busy === 'police' ? '…' : '🚔 Call the police'}
        </button>
        <button disabled={!!busy} onClick={() => go('complaint')} className="rounded-xl bg-white/10 px-2 py-2 font-semibold hover:bg-white/20 disabled:opacity-50">
          {busy === 'complaint' ? '…' : '📝 File a complaint'}
        </button>
        <button disabled={!!busy} onClick={() => go('drop')} className="rounded-xl px-2 py-2 text-white/60 hover:bg-white/10 disabled:opacity-50">
          Let it go
        </button>
      </div>
      {err && <p className="mt-2 text-xs text-rose-300">{err}</p>}
    </div>
  );
}

function JailPanel({ until, bail, why, now, priors }: { until: number; bail: number; why: string | null; now: number; priors: number }) {
  const bags = useWorld((s) => s.life?.me?.bags ?? 0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const pay = async () => {
    setBusy(true);
    setErr(null);
    try {
      await crimeActions.bail();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (waiting) {
    return (
      <button
        onClick={() => setWaiting(false)}
        className="pointer-events-auto absolute bottom-20 left-1/2 z-30 -translate-x-1/2 rounded-full border border-white/15 bg-[#0B0E14]/90 px-5 py-2 text-sm font-semibold shadow-xl"
      >
        🔒 In a cell · <span className="num">{mmss(until - now)}</span> · Bail {bail.toLocaleString()}
      </button>
    );
  }
  return (
    <div className="pointer-events-auto absolute bottom-20 left-1/2 z-30 w-[min(94vw,440px)] -translate-x-1/2 overflow-hidden rounded-3xl border border-white/15 bg-[#0B0E14]/95 shadow-2xl">
      <div className="bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.10)_0_6px,transparent_6px_26px)] px-5 pb-4 pt-5 text-center">
        <div className="text-xs font-bold uppercase tracking-[0.25em] text-white/50">Police Station · Holding cell</div>
        <div className="num mt-1 text-5xl font-black tabular-nums">{mmss(until - now)}</div>
        <div className="mt-1 text-sm text-white/70">{why ?? 'Locked up'}</div>
        {priors > 1 && <div className="text-xs text-white/45">{priors} arrests on your record make bail and time steeper.</div>}
      </div>
      <div className="grid grid-cols-2 gap-2 p-3">
        <button disabled={busy || bags < bail} onClick={pay} className="rounded-2xl bg-emerald-500 px-3 py-2.5 font-bold text-[#0B0E14] hover:bg-emerald-400 disabled:opacity-50">
          {busy ? '…' : `🔓 Post bail · ${bail.toLocaleString()} bags`}
        </button>
        <button onClick={() => setWaiting(true)} className="rounded-2xl bg-white/10 px-3 py-2.5 font-semibold hover:bg-white/20">
          ⏳ Wait it out
        </button>
      </div>
      {bags < bail && <p className="px-4 pb-3 text-center text-xs text-white/50">You have {bags.toLocaleString()} bags. Not enough for bail, so you wait.</p>}
      {err && <p className="px-4 pb-3 text-center text-xs text-rose-300">{err}</p>}
    </div>
  );
}

/** The front desk at the Police Station: your record, recent incidents, and Peaceful mode. */
export function PoliceDesk() {
  const rec = useWorld((s) => s.life?.me?.record ?? null);
  const [hist, setHist] = useState<{ id: string; kind: string; mine: boolean; offender: string; victim: string; amount: number; outcome: string; report: string | null; arrested: boolean; at: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/life/crime', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setHist(j.history ?? []))
      .catch(() => setHist([]));
  }, [rec?.wanted, rec?.priors]);
  if (!rec) return null;
  const toggle = async () => {
    setBusy(true);
    setErr(null);
    try {
      await crimeActions.peaceful(!rec.peaceful);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const line = (h: NonNullable<typeof hist>[number]) => {
    const what = h.kind === 'fight' ? (h.mine ? `You fought ${h.victim}` : `${h.offender} fought you`) : h.mine ? `You ${h.outcome === 'stolen' ? `lifted ${h.amount} from` : 'got caught pickpocketing'} ${h.victim}` : `${h.offender} ${h.outcome === 'stolen' ? `lifted ${h.amount} bags` : 'tried to pickpocket you'}`;
    const end = h.arrested ? ' · arrested' : h.report === 'complaint' ? ' · complaint' : h.report === 'police' ? ' · police called' : h.report === 'dropped' ? ' · let go' : '';
    return what + end;
  };
  return (
    <div className="mt-4 rounded-2xl bg-white/5 p-3.5">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Your record</div>
        <Stars n={rec.wanted} className="text-base" />
      </div>
      <div className="mt-1 text-xs text-white/60">
        {rec.wanted ? `${rec.wanted} wanted star${rec.wanted === 1 ? '' : 's'}, one drops off every ${STAR_DECAY_MIN} clean minutes. ${WARRANT_STARS} stars and a complaint means a warrant.` : 'No wanted stars.'}{' '}
        {rec.priors ? `${rec.priors} prior arrest${rec.priors === 1 ? '' : 's'}.` : 'No priors.'}
      </div>
      {hist && hist.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-white/70">
          {hist.slice(0, 5).map((h) => (
            <li key={h.id}>
              {h.kind === 'fight' ? '🥊' : '🫳'} {line(h)}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2">
        <div className="min-w-0 text-xs text-white/65">
          <span className="font-semibold text-white">🕊️ Peaceful mode</span> · nobody can rob or fight you, and you can&apos;t either. Stays on {PEACEFUL_LOCK_H}h once on.
          {rec.peacefulLockUntil && <span className="block text-white/45">Locked on until {new Date(rec.peacefulLockUntil).toLocaleString()}</span>}
        </div>
        <button
          disabled={busy || (rec.peaceful && !!rec.peacefulLockUntil)}
          onClick={toggle}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold disabled:opacity-50 ${rec.peaceful ? 'bg-emerald-500 text-[#0B0E14]' : 'bg-white/15'}`}
        >
          {rec.peaceful ? 'On' : 'Turn on'}
        </button>
      </div>
      {err && <p className="mt-2 text-xs text-rose-300">{err}</p>}
    </div>
  );
}
