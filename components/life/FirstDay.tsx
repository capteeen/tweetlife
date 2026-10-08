'use client';
import { useEffect, useRef, useState } from 'react';
import { useWorld } from '@/components/world/store';
import { IdCard } from '@/components/citizen/IdCard';
import { countryOf } from '@/lib/world/countries';
import { FIRST_DAY, FIRST_DAY_TOTAL, firstDayStep, type FirstDayStepId } from '@/lib/life/firstDaySteps';
import { arrivalSpot, doorOf, firstDayActions, freeLift, homeSpot, venueSpot } from './firstDay';
import { enterVenue } from './travel';
import { arrive } from './flight';
import { markWelcomeSeen } from './Welcome';

// The guided first day, on screen: a card at the top that says what to do next and has the button that does it,
// a beacon in the world over where to go, and the passport stamp when you land. Every step pays bags once
// (lib/life/firstDay.ts). Shown only while the player's first day is "active"; Skip ends it for good.

type Phase = 'idle' | 'moving' | 'arrived' | 'balloon';

export function FirstDayGuide({ place }: { place: 'city' | 'home' }) {
  const me = useWorld((s) => s.life?.me ?? null);
  const fd = useWorld((s) => s.life?.firstDay ?? null);
  const hasModel = useWorld((s) => !!s.model?.geometry);
  const selectedVenue = useWorld((s) => s.selectedVenue?.id ?? null);
  const furnitureKey = useWorld((s) => (s.life?.furniture ?? []).filter((f) => f.paid > 0).length);
  const txKey = useWorld((s) => s.life?.txs?.[0]?.id ?? '');
  const onTrip = useWorld((s) => !!s.trip);
  const step = fd?.state === 'active' ? fd.next : null;
  const [phase, setPhase] = useState<Phase>('idle');
  const [passportOpen, setPassportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const prevStep = useRef<FirstDayStepId | null>(null);
  const landed = useRef(false);

  // a new step starts idle; the coin step ending shows the balloon moment before the finale
  useEffect(() => {
    if (prevStep.current === 'coin' && step === 'finish') {
      // close the shop so the balloon on your hand is in view
      setPhase('balloon');
      setTimeout(() => useWorld.getState().selectVenue(null), 1200);
    }
    // (the ride ends by moving the step on to furniture while the "you're home" card is still up)
    else if (prevStep.current !== step) setPhase((p) => (step === 'furniture' && p === 'arrived' ? p : 'idle'));
    prevStep.current = step;
    setErr(null);
  }, [step]);

  // you land at your country's airport: off the plane at the arrival stand, walked in to passport control
  // (components/life/flight.ts), where your ID card gets stamped; then the airport's welcome
  const booth = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (place !== 'city' || step !== 'passport' || !hasModel || landed.current) return;
    landed.current = true;
    const s = useWorld.getState();
    const country = s.life?.me?.citizen?.country;
    const at = arrivalSpot();
    // looking west at the terminal, so the camera starts out over the apron
    if (at) s.setTeleport({ ...at, yaw: Math.PI / 2 });
    const atBooth = () =>
      new Promise<void>((done) => {
        // stamped already (another tab): straight on to the welcome
        if (useWorld.getState().life?.firstDay?.next !== 'passport') return done();
        booth.current = done;
        setPassportOpen(true);
      });
    setTimeout(() => {
      if (country) arrive(country, { atBooth }).catch(() => setPassportOpen(true));
      else setPassportOpen(true);
    }, 800);
  }, [place, step, hasModel]);
  const closePassport = () => {
    setPassportOpen(false);
    booth.current?.();
    booth.current = null;
  };

  // the beacon: over wherever the current step happens
  useEffect(() => {
    const s = useWorld.getState();
    if (place !== 'city' || !hasModel || !step) return s.setGuide(null);
    const v = step === 'shift' ? venueSpot('hustle') : step === 'coin' ? venueSpot('exchange') : null;
    if (v) s.setGuide({ ...doorOf(v, 1), label: v.name });
    else if (step === 'ride' || step === 'furniture') s.setGuide({ ...homeSpot(), label: 'Home' });
    else s.setGuide(null);
    return () => useWorld.getState().setGuide(null);
  }, [place, step, hasModel]);

  // steps that leave a record (a buy, a shift, a coin) tick themselves as soon as the record exists
  useEffect(() => {
    if (step !== 'furniture' && step !== 'shift' && step !== 'coin') return;
    firstDayActions.check().catch(() => {});
  }, [step, furnitureKey, txKey]);

  if (!me || !step) return null;
  const country = countryOf(me.citizen?.country);
  const def = firstDayStep(step)!;
  const n = FIRST_DAY.findIndex((s) => s.id === step);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const toCity = () => (window.location.href = `/w/${encodeURIComponent(me.handle)}`);

  let title: string = def.title;
  let hint: string = def.hint;
  let action: { label: string; onClick: () => void } | null = null;

  if (step === 'passport') {
    if (place === 'home') action = { label: '✈️ Go to the airport', onClick: toCity };
    else hint = `Your plane just landed in ${country.capital}. Through to passport control with your ID.`;
  } else if (step === 'ride') {
    if (place === 'home') {
      // you made it home on your own: the ride is done
      action = { label: '✓ I’m home', onClick: () => run(() => firstDayActions.complete('ride')) };
    } else if (phase === 'moving') {
      title = 'On your way home';
      hint = 'Sit back. This one is on the house.';
    } else if (phase === 'arrived') {
      title = 'You’re home';
      hint = 'Step inside and make it yours.';
      action = { label: '🚪 Go inside', onClick: () => (window.location.href = '/home') };
    } else {
      action = {
        label: '🚕 Free ride home',
        onClick: () =>
          run(async () => {
            setPhase('moving');
            await freeLift('taxi', '🚕', 'Home', homeSpot());
            await firstDayActions.complete('ride');
            // the step has moved on to furniture; keep the "you're home" card up and walk in
            setPhase('arrived');
            setTimeout(() => (window.location.href = '/home'), 1600);
          }),
      };
    }
  } else if (step === 'furniture') {
    if (place === 'home') {
      hint = 'Your room is bare. Anything from the shop counts, even a plant.';
      action = { label: '🛍️ Open the furniture shop', onClick: () => useWorld.getState().openPhone('market', 'home') };
    } else if (phase === 'arrived') {
      title = 'You’re home';
      hint = 'Step inside and make it yours.';
      action = { label: '🚪 Go inside', onClick: () => (window.location.href = '/home') };
    } else {
      hint = 'Go home and pick something from the furniture shop.';
      action = { label: '🏠 Go home', onClick: () => (window.location.href = '/home') };
    }
  } else if (step === 'shift') {
    if (place === 'home') {
      hint = 'Work is in the city. Head back out.';
      action = { label: '🚪 Back to the city', onClick: toCity };
    } else if (selectedVenue === 'hustle') {
      hint = 'Tap “Work a shift” to clock in.';
    } else if (phase === 'moving') {
      title = 'Heading to work';
      hint = 'Free scooter today. Tomorrow you pay the fare.';
    } else {
      const v = venueSpot('hustle');
      action = v
        ? {
            label: '🛴 Free scooter to work',
            onClick: () =>
              run(async () => {
                setPhase('moving');
                await freeLift('scooter', '🛴', v.name, doorOf(v));
                setPhase('idle');
                useWorld.getState().selectVenue(v);
              }),
          }
        : null;
    }
  } else if (step === 'coin') {
    if (place === 'home') {
      hint = 'The Coin Shop is in the city.';
      action = { label: '🚪 Back to the city', onClick: toCity };
    } else if (selectedVenue === 'exchange') {
      hint = 'Pick a coin on the board, then tap “100 bags” to buy it.';
    } else if (phase === 'moving') {
      title = 'Heading to the Coin Shop';
      hint = 'Live memecoins over the counter, paid in bags.';
    } else {
      const v = venueSpot('exchange');
      action = v
        ? {
            label: '🛴 Free scooter to the Coin Shop',
            onClick: () =>
              run(async () => {
                setPhase('moving');
                await freeLift('scooter', '🛴', v.name, doorOf(v));
                setPhase('idle');
                enterVenue(v);
              }),
          }
        : null;
    }
  } else if (step === 'finish') {
    const finish = () =>
      run(async () => {
        await firstDayActions.complete('finish');
        markWelcomeSeen();
        useWorld.getState().openPhone('home');
      });
    if (phase === 'balloon' && place === 'city') {
      title = '🎈 That balloon is your coin';
      hint = 'It floats on your hand. It grows when the coin pumps and pops if it rugs.';
      action = { label: 'Nice. What now?', onClick: () => setPhase('idle') };
    } else {
      hint = `You earned ${(fd?.earned ?? 0) + def.reward} bags today. Your phone runs things from here: jobs, coins, the shop, your friends.`;
      action = { label: '📱 Open my phone', onClick: finish };
    }
  }

  // on a ride or walking in from the plane, the trip banner says where you are going: the card steps aside
  const hidden = onTrip && (phase === 'moving' || step === 'passport');
  return (
    <>
      {!hidden && (
      <div className="pointer-events-auto absolute left-1/2 top-16 z-30 w-[min(94vw,440px)] -translate-x-1/2 max-sm:top-[6.75rem]" role="status" aria-live="polite">
        <div className="rounded-2xl border border-[#FFD166]/40 bg-[#0B0E14]/88 p-3 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#FFD166]">
            <span>Day one</span>
            <span className="flex flex-1 items-center gap-1">
              {FIRST_DAY.map((s, i) => (
                <span key={s.id} className={`h-1 flex-1 rounded-full ${fd?.done.includes(s.id) ? 'bg-[#FFD166]' : i === n ? 'bg-[#FFD166]/50' : 'bg-white/15'}`} />
              ))}
            </span>
            <SkipButton />
          </div>
          <div className="mt-2 flex items-center gap-3">
            <span className="text-3xl leading-none">{def.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-tight">{title}</p>
              <p className="mt-0.5 text-xs leading-snug text-white/65">{hint}</p>
            </div>
            <span className="num shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-300">+{def.reward}</span>
          </div>
          {action && (
            <button className="btn mt-2.5 w-full !py-2.5" disabled={busy} onClick={action.onClick}>
              {busy ? '…' : action.label}
            </button>
          )}
          {err && <p className="mt-1.5 text-xs text-rose-300">{err}</p>}
        </div>
      </div>
      )}
      {/* stays up through the stamp even though the step has already moved on */}
      {passportOpen && place === 'city' && <PassportControl onClose={closePassport} />}
    </>
  );
}

function SkipButton() {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      className={`rounded-full px-2 py-0.5 normal-case tracking-normal ${armed ? 'bg-amber-500 text-black' : 'text-white/45 hover:text-white/80'}`}
      onClick={() => {
        if (!armed) return setArmed(true);
        firstDayActions.skip().then(markWelcomeSeen).catch(() => {});
      }}
    >
      {armed ? 'Sure? Skip the tour' : 'Skip'}
    </button>
  );
}

/** Landing: hand over your ID, it gets stamped, you are in. The ID card from sign-up becomes this moment. */
function PassportControl({ onClose }: { onClose: () => void }) {
  const me = useWorld((s) => s.life?.me ?? null);
  const [stamped, setStamped] = useState(false);
  const [paid, setPaid] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!me?.citizen) return null;
  const c = countryOf(me.citizen.country);
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
  const stamp = async () => {
    setStamped(true);
    try {
      const r = await firstDayActions.complete('passport');
      setPaid(r.paid);
      setTimeout(onClose, 2200);
    } catch (e) {
      setErr((e as Error).message);
      setStamped(false);
    }
  };
  return (
    <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]">
      <style>{`
        @keyframes tl-stamp { 0% { transform: rotate(-14deg) scale(2.6); opacity: 0 } 60% { transform: rotate(-14deg) scale(0.92); opacity: 1 } 100% { transform: rotate(-14deg) scale(1); opacity: 1 } }
        @keyframes tl-thud { 0%,100% { transform: translate(0,0) } 30% { transform: translate(0,4px) } 60% { transform: translate(0,-2px) } }
        @keyframes tl-rise { 0% { transform: translateY(8px); opacity: 0 } 100% { transform: translateY(0); opacity: 1 } }
      `}</style>
      <div className="w-full max-w-md rounded-3xl border border-white/12 bg-[#0B0E14]/92 p-5 shadow-2xl">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.logo} alt="" className="h-6 w-6" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: c.theme.accent }}>
              🛂 Passport control
            </p>
            <p className="truncate text-sm text-white/70">
              {c.capital} International · Welcome to {c.name}
            </p>
          </div>
        </div>
        <div className="relative mt-4" style={{ animation: stamped ? 'tl-thud 0.35s ease-out 0.2s' : undefined }}>
          <IdCard holder={{ name: me.name, handle: me.handle, avatarUrl: me.avatarUrl, look: me.look }} citizen={me.citizen} flippable={false} />
          {stamped && (
            <div
              className="pointer-events-none absolute right-[6%] top-[18%] rounded-xl border-[3px] border-double px-3 py-1.5 text-center font-black uppercase leading-tight"
              style={{ color: '#E11D48', borderColor: '#E11D48', background: 'rgba(255,255,255,0.06)', mixBlendMode: 'screen', animation: 'tl-stamp 0.45s cubic-bezier(.2,.9,.3,1.2) forwards', textShadow: '0 0 1px #E11D48' }}
            >
              <div className="text-xl tracking-[0.18em]">Admitted</div>
              <div className="text-[10px] tracking-[0.2em]">{c.capital} · {today}</div>
            </div>
          )}
        </div>
        {paid != null ? (
          <p className="mt-4 text-center text-lg font-bold text-emerald-300" style={{ animation: 'tl-rise 0.4s ease-out' }}>
            Welcome home, {c.demonym}. {paid > 0 ? `+${paid} bags` : ''}
          </p>
        ) : (
          <button className="btn mt-4 w-full !py-3 text-base" disabled={stamped} onClick={stamp}>
            {stamped ? 'Stamping…' : 'Hand over your ID'}
          </button>
        )}
        {err && <p className="mt-2 text-center text-sm text-rose-300">{err}</p>}
        <p className="mt-2 text-center text-xs text-white/40">Day one pays up to {FIRST_DAY_TOTAL.toLocaleString('en')} bags.</p>
      </div>
    </div>
  );
}
