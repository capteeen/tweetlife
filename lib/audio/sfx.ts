'use client';
import { audio } from './engine';
import { distToListener, panner } from './spatial';
import { hiss, hz, ping, rand, tone, type Eng } from './synth';

// One-shot sound effects, all synthesised. `sfx('coins')` plays at the player; `sfx('horn', { at })` plays in
// 3D at a spot in the world. Nothing plays before the first tap or when too far away to hear.

export type Surface = 'asphalt' | 'concrete' | 'grass' | 'dirt' | 'sand' | 'wood' | 'tile' | 'carpet' | 'metal';

type Opts = { gain?: number; at?: { x: number; y?: number; z: number }; surface?: Surface; v?: number };
type Maker = (e: Eng, out: AudioNode, t: number, o: Opts) => number;

const footstep: Maker = (e, out, t, o) => {
  const v = o.v ?? 1; // 1 = walking, ~1.6 = sprinting
  const k = 0.8 + Math.random() * 0.4;
  switch (o.surface ?? 'concrete') {
    case 'asphalt':
      hiss(e, out, t, { dur: 0.07, gain: 0.22 * v * k, filter: 'bandpass', f: rand(1300, 1900), q: 1.2 });
      tone(e, out, t, { f: rand(85, 110), f2: 50, dur: 0.05, gain: 0.25 * v * k });
      return t + 0.1;
    case 'concrete':
      hiss(e, out, t, { dur: 0.045, gain: 0.2 * v * k, filter: 'bandpass', f: rand(2200, 3200), q: 1.5 });
      tone(e, out, t, { f: rand(110, 140), f2: 60, dur: 0.04, gain: 0.28 * v * k });
      return t + 0.08;
    case 'grass':
      hiss(e, out, t, { dur: 0.12, gain: 0.16 * v * k, filter: 'highpass', f: 2600, attack: 0.02 });
      hiss(e, out, t, { dur: 0.08, gain: 0.08 * v * k, filter: 'lowpass', f: 500 });
      return t + 0.15;
    case 'dirt':
      for (let i = 0; i < 3; i++) hiss(e, out, t, { at: i * 0.018, dur: 0.035, gain: 0.14 * v * k, filter: 'bandpass', f: rand(700, 1300), q: 0.9 });
      tone(e, out, t, { f: 80, f2: 45, dur: 0.05, gain: 0.18 * v * k });
      return t + 0.12;
    case 'sand':
      hiss(e, out, t, { dur: 0.14, gain: 0.13 * v * k, filter: 'bandpass', f: rand(1800, 2600), q: 0.6, attack: 0.025 });
      return t + 0.17;
    case 'wood':
      tone(e, out, t, { f: rand(150, 190), f2: 120, dur: 0.09, gain: 0.32 * v * k });
      tone(e, out, t, { f: rand(380, 460), dur: 0.05, gain: 0.08 * v * k });
      hiss(e, out, t, { dur: 0.04, gain: 0.08 * v * k, filter: 'lowpass', f: 1400 });
      return t + 0.12;
    case 'tile':
      hiss(e, out, t, { dur: 0.025, gain: 0.18 * v * k, filter: 'highpass', f: 3500 });
      tone(e, out, t, { f: rand(800, 1000), dur: 0.03, gain: 0.06 * v * k });
      tone(e, out, t, { f: 120, f2: 70, dur: 0.035, gain: 0.18 * v * k });
      return t + 0.06;
    case 'carpet':
      hiss(e, out, t, { dur: 0.06, gain: 0.07 * v * k, filter: 'lowpass', f: 700 });
      return t + 0.08;
    case 'metal':
      tone(e, out, t, { f: rand(420, 520), dur: 0.12, gain: 0.08 * v * k, type: 'triangle' });
      hiss(e, out, t, { dur: 0.04, gain: 0.15 * v * k, filter: 'bandpass', f: 3000 });
      return t + 0.14;
  }
};

const SFX = {
  footstep,

  // ----- UI -----
  click: (e, out, t) => {
    tone(e, out, t, { f: 1800, f2: 1200, dur: 0.03, gain: 0.12 });
    return hiss(e, out, t, { dur: 0.012, gain: 0.05, filter: 'highpass', f: 5000 });
  },
  tap: (e, out, t) => {
    hiss(e, out, t, { dur: 0.015, gain: 0.06, filter: 'highpass', f: 4000 });
    return tone(e, out, t, { f: 1250, f2: 950, dur: 0.06, gain: 0.3 });
  },
  phoneOpen: (e, out, t) => {
    hiss(e, out, t, { dur: 0.18, gain: 0.05, filter: 'bandpass', f: 800, f2: 3000, attack: 0.05 });
    tone(e, out, t, { at: 0.04, f: hz(88), dur: 0.12, gain: 0.1 });
    return tone(e, out, t, { at: 0.11, f: hz(95), dur: 0.2, gain: 0.1 });
  },
  phoneClose: (e, out, t) => {
    tone(e, out, t, { f: hz(95), dur: 0.08, gain: 0.08 });
    return tone(e, out, t, { at: 0.07, f: hz(88), dur: 0.14, gain: 0.08 });
  },
  mapOpen: (e, out, t) => {
    hiss(e, out, t, { dur: 0.25, gain: 0.14, filter: 'bandpass', f: 2500, q: 0.5, attack: 0.04 });
    return hiss(e, out, t, { at: 0.12, dur: 0.2, gain: 0.1, filter: 'bandpass', f: 1600, q: 0.5, attack: 0.03 });
  },
  notify: (e, out, t) => {
    tone(e, out, t, { f: 880, dur: 0.12, gain: 0.08 });
    return tone(e, out, t, { at: 0.09, f: 1320, dur: 0.22, gain: 0.08 });
  },
  error: (e, out, t) => {
    tone(e, out, t, { f: 300, dur: 0.12, gain: 0.08, type: 'square' });
    return tone(e, out, t, { at: 0.13, f: 220, dur: 0.18, gain: 0.08, type: 'square' });
  },

  // ----- money -----
  /** bags coming in: a little cascade of coins */
  coins: (e, out, t, o) => {
    const n = Math.min(7, 2 + Math.round(o.v ?? 3));
    let end = t;
    for (let i = 0; i < n; i++) end = ping(e, out, t + i * rand(0.045, 0.08), rand(2600, 3600), 0.12, rand(0.12, 0.25));
    return end;
  },
  /** bags going out: a register "cha-ching" */
  spend: (e, out, t) => {
    hiss(e, out, t, { dur: 0.06, gain: 0.2, filter: 'bandpass', f: 3000, q: 2 });
    tone(e, out, t, { f: 120, f2: 80, dur: 0.06, gain: 0.15 });
    ping(e, out, t + 0.09, 1568, 0.18, 0.7, [1, 2.0, 2.76]);
    return ping(e, out, t + 0.09, 2093, 0.1, 0.6, [1, 2.0]);
  },
  /** something new is yours */
  unbox: (e, out, t) => {
    [72, 76, 79, 84].forEach((m, i) => tone(e, out, t, { at: i * 0.07, f: hz(m), dur: 0.3, gain: 0.09, type: 'triangle' }));
    return t + 0.5;
  },
  quest: (e, out, t) => {
    [67, 72, 76, 79, 84].forEach((m, i) => tone(e, out, t, { at: i * 0.09, f: hz(m), dur: i === 4 ? 0.6 : 0.16, gain: 0.1, type: 'square' }));
    return t + 1;
  },
  send: (e, out, t) => {
    hiss(e, out, t, { dur: 0.3, gain: 0.1, filter: 'bandpass', f: 600, f2: 4000, q: 2, attack: 0.05 });
    return tone(e, out, t, { at: 0.2, f: hz(84), dur: 0.2, gain: 0.07 });
  },

  // ----- balloons -----
  inflate: (e, out, t) => {
    // three pumps of air
    for (let i = 0; i < 3; i++) hiss(e, out, t, { at: i * 0.22, dur: 0.16, gain: 0.08, filter: 'bandpass', f: 500 + i * 300, f2: 900 + i * 400, q: 3, attack: 0.04 });
    return tone(e, out, t, { at: 0.6, f: 500, f2: 900, dur: 0.12, gain: 0.04, type: 'triangle' });
  },
  rugPop: (e, out, t) => {
    hiss(e, out, t, { dur: 0.12, gain: 0.6, filter: 'highpass', f: 1200 });
    tone(e, out, t, { f: 160, f2: 40, dur: 0.15, gain: 0.5 });
    // and the sad trombone of a rug
    [62, 61, 60, 59].forEach((m, i) => tone(e, out, t, { at: 0.25 + i * 0.22, f: hz(m - 12), dur: i === 3 ? 0.6 : 0.2, gain: 0.05, type: 'sawtooth' }));
    return t + 1.4;
  },
  gold: (e, out, t) => {
    for (let i = 0; i < 6; i++) tone(e, out, t, { at: i * 0.06, f: hz(84 + i * 2), dur: 0.25, gain: 0.06 });
    return t + 0.7;
  },

  // ----- doors -----
  doorOpen: (e, out, t) => {
    hiss(e, out, t, { dur: 0.02, gain: 0.25, filter: 'highpass', f: 2500 }); // latch
    tone(e, out, t, { at: 0.04, f: 180, f2: 260, dur: 0.35, gain: 0.04, type: 'sawtooth' }); // creak
    return hiss(e, out, t, { at: 0.04, dur: 0.4, gain: 0.05, filter: 'lowpass', f: 600, attack: 0.15 });
  },
  doorClose: (e, out, t) => {
    tone(e, out, t, { f: 90, f2: 50, dur: 0.18, gain: 0.45 });
    hiss(e, out, t, { dur: 0.08, gain: 0.2, filter: 'lowpass', f: 900 });
    return hiss(e, out, t, { at: 0.06, dur: 0.02, gain: 0.2, filter: 'highpass', f: 3000 });
  },
  carDoor: (e, out, t) => {
    tone(e, out, t, { f: 110, f2: 60, dur: 0.14, gain: 0.4 });
    return hiss(e, out, t, { dur: 0.06, gain: 0.25, filter: 'bandpass', f: 1500 });
  },

  // ----- traffic and rides -----
  horn: (e, out, t, o) => {
    const len = o.v ?? 0.38;
    for (const f of [349, 440]) tone(e, out, t, { f, dur: len, gain: 0.11, type: 'square', attack: 0.015 });
    return t + len;
  },
  whoosh: (e, out, t, o) => hiss(e, out, t, { dur: 0.6, gain: 0.25 * (o.v ?? 1), filter: 'bandpass', f: 1400, f2: 350, q: 0.7, attack: 0.25 }),
  busDoors: (e, out, t) => {
    hiss(e, out, t, { dur: 0.5, gain: 0.22, filter: 'highpass', f: 2500, attack: 0.02 }); // air
    tone(e, out, t, { at: 0.45, f: 95, f2: 55, dur: 0.15, gain: 0.3 }); // clunk
    return hiss(e, out, t, { at: 0.45, dur: 0.06, gain: 0.15, filter: 'lowpass', f: 1200 });
  },
  bikeBell: (e, out, t) => {
    ping(e, out, t, 2350, 0.16, 0.5, [1, 1.47, 2.09]);
    return ping(e, out, t + 0.14, 2350, 0.14, 0.6, [1, 1.47, 2.09]);
  },
  scooterBeep: (e, out, t) => {
    tone(e, out, t, { f: 1760, dur: 0.07, gain: 0.08, type: 'square' });
    return tone(e, out, t, { at: 0.12, f: 2350, dur: 0.1, gain: 0.08, type: 'square' });
  },
  boarding: (e, out, t) => {
    // airport chime: ding-dong-ding
    [76, 72, 79].forEach((m, i) => ping(e, out, t + i * 0.35, hz(m), 0.12, 1.1, [1, 2, 3]));
    return t + 1.8;
  },

  // ----- people -----
  cheer: (e, out, t, o) => {
    const k = o.v ?? 1;
    for (let i = 0; i < 6; i++) hiss(e, out, t, { at: rand(0, 0.25), dur: rand(1, 1.8), gain: 0.14 * k, filter: 'bandpass', f: rand(500, 2400), q: rand(2, 5), attack: rand(0.15, 0.4) });
    tone(e, out, t, { at: 0.2, f: 2400, f2: 3200, dur: 0.35, gain: 0.03 * k }); // whistle
    return t + 2;
  },
  clap: (e, out, t) => hiss(e, out, t, { dur: 0.09, gain: 0.45, filter: 'bandpass', f: 1500, q: 1.2 }),
  shutter: (e, out, t) => {
    hiss(e, out, t, { dur: 0.02, gain: 0.3, filter: 'highpass', f: 2000 });
    return hiss(e, out, t, { at: 0.07, dur: 0.03, gain: 0.25, filter: 'highpass', f: 1500 });
  },
  exhale: (e, out, t, o) => hiss(e, out, t, { dur: 0.3, gain: 0.25 * (o.v ?? 1), filter: 'bandpass', f: 900, q: 1, attack: 0.05 }),
  inhale: (e, out, t, o) => hiss(e, out, t, { dur: 0.25, gain: 0.18 * (o.v ?? 1), filter: 'bandpass', f: 1500, f2: 2200, q: 1.2, attack: 0.12 }),
  sigh: (e, out, t) => hiss(e, out, t, { dur: 0.8, gain: 0.06, filter: 'bandpass', f: 1100, f2: 500, q: 1.5, attack: 0.15 }),
  weights: (e, out, t) => {
    ping(e, out, t, rand(300, 420), 0.1, 0.4, [1, 2.4, 3.9]);
    return tone(e, out, t, { f: 70, f2: 45, dur: 0.12, gain: 0.25 });
  },

  // ----- home -----
  sit: (e, out, t) => {
    hiss(e, out, t, { dur: 0.15, gain: 0.35, filter: 'lowpass', f: 900, attack: 0.02 });
    tone(e, out, t, { f: 140, f2: 90, dur: 0.1, gain: 0.3 });
    return tone(e, out, t, { f: 75, f2: 50, dur: 0.12, gain: 0.5 });
  },
  liedown: (e, out, t) => {
    hiss(e, out, t, { dur: 0.4, gain: 0.1, filter: 'lowpass', f: 700, attack: 0.08 });
    return tone(e, out, t, { at: 0.1, f: 65, f2: 45, dur: 0.2, gain: 0.2 });
  },
  bottle: (e, out, t) => {
    hiss(e, out, t, { dur: 0.25, gain: 0.15, filter: 'highpass', f: 3000, attack: 0.005 }); // psst
    for (let i = 0; i < 3; i++) tone(e, out, t, { at: 0.5 + i * 0.32, f: rand(260, 340), f2: rand(420, 520), dur: 0.12, gain: 0.08 }); // glug
    return t + 1.5;
  },
  munch: (e, out, t) => {
    for (let i = 0; i < 4; i++) hiss(e, out, t, { at: i * 0.38, dur: 0.1, gain: 0.3, filter: 'bandpass', f: rand(900, 1600), q: 0.8 });
    return t + 1.6;
  },
  pullCord: (e, out, t) => {
    for (let i = 0; i < 2; i++) {
      hiss(e, out, t, { at: i * 0.7, dur: 0.35, gain: 0.14, filter: 'bandpass', f: 600, f2: 2000, q: 2, attack: 0.05 });
      for (let j = 0; j < 4; j++) tone(e, out, t, { at: i * 0.7 + 0.05 + j * 0.07, f: 45, dur: 0.05, gain: 0.2, type: 'square' });
    }
    return t + 1.5;
  },
  powerDown: (e, out, t) => {
    hiss(e, out, t, { dur: 0.02, gain: 0.25, filter: 'highpass', f: 2000 });
    tone(e, out, t, { f: 100, f2: 25, dur: 0.9, gain: 0.15, type: 'sawtooth' });
    return t + 1;
  },
  powerUp: (e, out, t) => {
    hiss(e, out, t, { dur: 0.02, gain: 0.25, filter: 'highpass', f: 2000 });
    tone(e, out, t, { f: 30, f2: 100, dur: 0.6, gain: 0.1, type: 'sawtooth' });
    return t + 0.7;
  },
  splash: (e, out, t) => hiss(e, out, t, { dur: 0.5, gain: 0.2, filter: 'lowpass', f: 2500, f2: 600, attack: 0.01 }),
} satisfies Record<string, Maker>;

export type SfxName = keyof typeof SFX;

/** Play a one-shot. Returns nothing; silently does nothing when sound is off. */
export function sfx(name: SfxName, o: Opts = {}) {
  const e = audio();
  if (!e) return;
  if (o.at && distToListener(o.at.x, o.at.z) > 110) return;
  const c = e.ctx;
  const g = c.createGain();
  g.gain.value = o.gain ?? 1;
  const p = o.at ? panner(o.at.x, o.at.y ?? 1, o.at.z) : null;
  g.connect(p ?? e.buses.sfx);
  const end = SFX[name](e, g, c.currentTime + 0.005, o);
  setTimeout(() => {
    g.disconnect();
    p?.disconnect();
  }, (end - c.currentTime + 0.4) * 1000);
}

