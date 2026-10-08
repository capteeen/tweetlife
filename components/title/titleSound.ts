'use client';
import { audio, audioRaw } from '@/lib/audio/engine';
import { useSoundSettings } from '@/lib/audio/settings';
import { STEP, bell, makeRig, playStep, tweet, type Rig } from './themeMusic';

// The welcome page's sound: the theme on the music bus, small UI sounds on the sfx bus. Built on the shared
// engine in lib/audio, so the mute switch and volumes are the same ones the game uses.

type FullRig = ReturnType<typeof makeRig>;
let rig: FullRig | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let step = 0;
let nextTime = 0;

function ensureRig() {
  const e = audioRaw();
  if (!e) return null;
  if (!rig) {
    const r = makeRig(e.ctx);
    r.master.gain.value = 0;
    r.master.connect(e.buses.music);
    rig = r;
  }
  return rig;
}

function schedule() {
  const e = audioRaw();
  if (!e || !rig) return;
  // a backgrounded tab can fall far behind: skip ahead rather than play a burst of catch-up notes
  if (nextTime < e.ctx.currentTime - 0.2) nextTime = e.ctx.currentTime + 0.05;
  while (nextTime < e.ctx.currentTime + 0.15) {
    playStep(rig, step++, nextTime);
    nextTime += STEP;
  }
}

/** Start the theme (fading in), if sound is unlocked and on. Safe to call repeatedly. */
export function startTheme() {
  const e = audio();
  const r = ensureRig();
  if (!e || !r || timer) return;
  const master = r.master;
  nextTime = e.ctx.currentTime + 0.08;
  timer = setInterval(schedule, 40);
  schedule();
  master.gain.cancelScheduledValues(e.ctx.currentTime);
  master.gain.setValueAtTime(master.gain.value, e.ctx.currentTime);
  master.gain.linearRampToValueAtTime(0.9, e.ctx.currentTime + 1.5);
}

/** Fade the theme out and stop scheduling. */
export function stopTheme() {
  if (timer) clearInterval(timer);
  timer = null;
  const e = audioRaw();
  if (e && rig) rig.master.gain.setTargetAtTime(0, e.ctx.currentTime, 0.15);
}

export const themePlaying = () => !!timer;

// ---- UI sounds ----

function sfxRig(): { r: FullRig; t: number } | null {
  const e = audio();
  if (!e) return null;
  // a tiny dry rig straight into the sfx bus (its own reverb, so UI sounds are not ducked by the kick)
  if (!uiRig) {
    const r = makeRig(e.ctx);
    r.master.gain.value = 0.9;
    r.master.connect(e.buses.sfx);
    uiRig = r;
  }
  return { r: uiRig, t: e.ctx.currentTime + 0.005 };
}
let uiRig: FullRig | null = null;

export type UiSound = 'hover' | 'tap' | 'coin' | 'open' | 'close' | 'on';

export function ui(kind: UiSound) {
  const s = sfxRig();
  if (!s) return;
  const { r, t } = s;
  const { ctx } = r;
  switch (kind) {
    case 'hover': {
      // a soft wooden tick
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 1750;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      o.connect(g).connect(r.out);
      o.start(t);
      o.stop(t + 0.05);
      break;
    }
    case 'tap': {
      // a bubble pop: a sine that bends up fast
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(380, t);
      o.frequency.exponentialRampToValueAtTime(980, t + 0.07);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
      o.connect(g).connect(r.out);
      o.start(t);
      o.stop(t + 0.13);
      break;
    }
    case 'coin':
      // the classic two-note coin, on a glockenspiel
      bell(r, t, 83, 0.16, 0);
      bell(r, t + 0.07, 88, 0.2, 0);
      break;
    case 'open': {
      // a soft whoosh up, then a pop
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = r.noise;
      f.type = 'bandpass';
      f.Q.value = 1.2;
      f.frequency.setValueAtTime(400, t);
      f.frequency.exponentialRampToValueAtTime(2600, t + 0.18);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      src.connect(f).connect(g).connect(r.out);
      src.start(t);
      src.stop(t + 0.25);
      tweet(r, t + 0.12, 0.05, 0.3, 2);
      break;
    }
    case 'close': {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(820, t);
      o.frequency.exponentialRampToValueAtTime(300, t + 0.09);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g).connect(r.out);
      o.start(t);
      o.stop(t + 0.14);
      break;
    }
    case 'on':
      tweet(r, t, 0.09, 0, 3);
      break;
  }
}

export { useSoundSettings };
