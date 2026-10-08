'use client';
import { audioRaw } from './engine';
import { movePanner, panner } from './spatial';
import { useSoundSettings, type Bus } from './settings';
import { drive, filter, gain, hiss, hz, lfo, noiseLoop, pick, rand, tone, type Eng } from './synth';

// Continuous sounds: the city bed, wind, birds, crowds, engines, the generator, the TV... A Loop is built the
// first time it is turned up and torn down a few seconds after it falls silent, so only what you can hear
// costs anything. Some loops are steady node graphs; others (birds, snores, breathing) schedule little
// events from a shared ticker.

type Params = Record<string, number>;
type Built = {
  sources: AudioScheduledSourceNode[];
  update?: (p: Params, t: number) => void;
  tick?: (t: number, p: Params) => void;
};
type Builder = (e: Eng, out: AudioNode) => Built;

const start = (e: Eng, ...s: AudioScheduledSourceNode[]) => {
  for (const n of s) n.start(e.ctx.currentTime + 0.01);
  return s;
};

/** A stereo-panned output for one scheduled event (so birds and crickets come from all around). */
function around(e: Eng, out: AudioNode, pan = rand(-0.9, 0.9)) {
  const p = e.ctx.createStereoPanner();
  p.pan.value = pan;
  p.connect(out);
  setTimeout(() => p.disconnect(), 3000);
  return p;
}

/** Babble: a handful of formant-filtered noise voices whose loudness jumps around like syllables. */
function babble(e: Eng, out: AudioNode, voices: number, centre: [number, number]): Built {
  const c = e.ctx;
  const src = noiseLoop(e);
  const lp = filter(c, 'lowpass', 3200);
  lp.connect(out);
  const gs: GainNode[] = [];
  for (let i = 0; i < voices; i++) {
    const f = filter(c, 'bandpass', rand(...centre), rand(3, 7));
    const g = gain(c, 0);
    src.connect(f).connect(g).connect(lp);
    gs.push(g);
  }
  const next = gs.map(() => 0);
  return {
    sources: start(e, src),
    tick: (t, p) => {
      gs.forEach((g, i) => {
        if (t < next[i]) return;
        const talk = Math.random() < 0.7 * (p.busy ?? 1);
        g.gain.setTargetAtTime(talk ? rand(0.25, 0.7) : 0, t, rand(0.02, 0.05));
        next[i] = t + rand(0.07, 0.22);
      });
    },
  };
}

const BUILD: Record<string, Builder> = {
  /** distant traffic and the general rumble of a city */
  city: (e, out) => {
    const c = e.ctx;
    const n = noiseLoop(e, 0.5);
    // a low rumble (felt more than heard) and a mid-range wash that phone speakers can actually play
    const lp = filter(c, 'lowpass', 220, 0.5);
    const g = gain(c, 0.45);
    n.connect(lp).connect(g).connect(out);
    const n2 = noiseLoop(e);
    const bp = filter(c, 'bandpass', 700, 0.5);
    const g2 = gain(c, 0.12);
    n2.connect(bp).connect(g2).connect(out);
    const wob = lfo(c, 0.07, 0.15, g.gain);
    return {
      sources: start(e, n, n2, wob),
      update: (p, t) => {
        lp.frequency.setTargetAtTime(160 + (p.busy ?? 0.5) * 220, t, 0.5);
        g2.gain.setTargetAtTime(0.04 + (p.busy ?? 0.5) * 0.09, t, 0.5);
      },
    };
  },
  wind: (e, out) => {
    const c = e.ctx;
    const n = noiseLoop(e);
    const bp = filter(c, 'bandpass', 450, 0.8);
    const g = gain(c, 0.5);
    n.connect(bp).connect(g).connect(out);
    const a = lfo(c, 0.11, 250, bp.frequency);
    const b = lfo(c, 0.07, 0.3, g.gain);
    return { sources: start(e, n, a, b) };
  },
  water: (e, out) => {
    const c = e.ctx;
    const n = noiseLoop(e, 0.7);
    const lp = filter(c, 'lowpass', 700, 0.5);
    const g = gain(c, 0.5);
    n.connect(lp).connect(g).connect(out);
    const swell = lfo(c, 0.18, 0.4, g.gain);
    const f = lfo(c, 0.13, 300, lp.frequency);
    let next = 0;
    return {
      sources: start(e, n, swell, f),
      tick: (t) => {
        if (t < next) return;
        next = t + rand(1.5, 4);
        hiss(e, around(e, out), t, { dur: rand(0.3, 0.6), gain: rand(0.08, 0.18), filter: 'bandpass', f: rand(600, 1400), q: 0.8, attack: 0.08 });
      },
    };
  },
  birds: (e, out) => {
    let next = 0;
    return {
      sources: [],
      tick: (t) => {
        if (t < next) return;
        next = t + rand(0.6, 3);
        const o = around(e, out);
        const base = rand(2600, 5200);
        const notes = Math.floor(rand(2, 6));
        for (let i = 0; i < notes; i++) tone(e, o, t, { at: i * rand(0.07, 0.12), f: base * rand(0.9, 1.15), f2: base * rand(1.1, 1.5), dur: rand(0.04, 0.09), gain: rand(0.07, 0.15) });
      },
    };
  },
  crickets: (e, out) => {
    const pans = [-0.7, 0.2, 0.8];
    const next = pans.map(() => 0);
    return {
      sources: [],
      tick: (t) => {
        pans.forEach((pan, i) => {
          if (t < next[i]) return;
          next[i] = t + rand(0.5, 0.9);
          const o = around(e, out, pan);
          const f = 4400 + i * 350;
          for (let k = 0; k < 3; k++) tone(e, o, t, { at: k * 0.045, f, dur: 0.025, gain: 0.07 });
        });
      },
    };
  },
  gulls: (e, out) => {
    let next = 0;
    return {
      sources: [],
      tick: (t) => {
        if (t < next) return;
        next = t + rand(3, 9);
        const o = around(e, out);
        const bp = filter(e.ctx, 'bandpass', 1500, 1);
        bp.connect(o);
        setTimeout(() => bp.disconnect(), 3000);
        for (let i = 0; i < Math.floor(rand(1, 4)); i++) tone(e, bp, t, { at: i * 0.32, type: 'sawtooth', f: rand(1000, 1200), f2: rand(1500, 1800), dur: 0.22, gain: 0.3, attack: 0.04 });
      },
    };
  },
  crowd: (e, out) => babble(e, out, 7, [350, 1600]),
  /** a car engine: rpm 0..1 */
  engine: (e, out) => {
    const c = e.ctx;
    const o = c.createOscillator(), sub = c.createOscillator();
    o.type = 'sawtooth';
    sub.type = 'square';
    const lp = filter(c, 'lowpass', 300, 1.5);
    const sh = drive(c, 2.5);
    const g = gain(c, 0.35);
    const gs = gain(c, 0.25);
    o.connect(lp);
    sub.connect(gs).connect(lp);
    lp.connect(sh).connect(g).connect(out);
    const n = noiseLoop(e);
    const nl = filter(c, 'lowpass', 500);
    const ng = gain(c, 0.08);
    n.connect(nl).connect(ng).connect(out);
    return {
      sources: start(e, o, sub, n),
      update: (p, t) => {
        const rpm = p.rpm ?? 0.3;
        const f = (p.base ?? 38) + rpm * (p.range ?? 60);
        o.frequency.setTargetAtTime(f, t, 0.15);
        sub.frequency.setTargetAtTime(f / 2, t, 0.15);
        lp.frequency.setTargetAtTime(220 + rpm * 900, t, 0.2);
        ng.gain.setTargetAtTime(0.04 + rpm * 0.12, t, 0.2);
      },
    };
  },
  /** a bus or truck: slower and with a diesel rattle */
  diesel: (e, out) => {
    const c = e.ctx;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    const lp = filter(c, 'lowpass', 260, 2);
    const am = gain(c, 0.5);
    const rattle = lfo(c, 18, 0.35, am.gain, 'square');
    o.connect(lp).connect(drive(c, 3)).connect(am).connect(gain(c, 0.4)).connect(out);
    return {
      sources: start(e, o, rattle),
      update: (p, t) => {
        const rpm = p.rpm ?? 0.3;
        o.frequency.setTargetAtTime(28 + rpm * 30, t, 0.2);
        rattle.frequency.setTargetAtTime(12 + rpm * 14, t, 0.2);
        lp.frequency.setTargetAtTime(200 + rpm * 500, t, 0.2);
      },
    };
  },
  /** an electric motor: e-scooters */
  whine: (e, out) => {
    const c = e.ctx;
    const o = c.createOscillator();
    const g = gain(c, 0.05);
    o.connect(g).connect(out);
    const n = noiseLoop(e);
    const bp = filter(c, 'bandpass', 1800, 0.7);
    const ng = gain(c, 0.06);
    n.connect(bp).connect(ng).connect(out);
    return {
      sources: start(e, o, n),
      update: (p, t) => o.frequency.setTargetAtTime(380 + (p.rpm ?? 0.5) * 700, t, 0.2),
    };
  },
  /** a bike: chain whirr and the freewheel ticking */
  bike: (e, out) => {
    const c = e.ctx;
    const n = noiseLoop(e);
    const bp = filter(c, 'bandpass', 2400, 1.5);
    const g = gain(c, 0.1);
    n.connect(bp).connect(g).connect(out);
    const pedal = lfo(c, 1.4, 0.06, g.gain);
    let next = 0;
    return {
      sources: start(e, n, pedal),
      tick: (t) => {
        if (t < next) return;
        next = t + 0.06;
        hiss(e, out, t, { dur: 0.008, gain: 0.12, filter: 'highpass', f: 4500 });
      },
    };
  },
  /** jet engines: a roar and a whine; thrust 0..1 */
  jet: (e, out) => {
    const c = e.ctx;
    const n = noiseLoop(e, 0.6);
    const lp = filter(c, 'lowpass', 500, 0.6);
    const g = gain(c, 0.6);
    n.connect(lp).connect(g).connect(out);
    const w = c.createOscillator();
    const wg = gain(c, 0.015);
    w.connect(wg).connect(out);
    return {
      sources: start(e, n, w),
      update: (p, t) => {
        const th = p.thrust ?? 0.5;
        lp.frequency.setTargetAtTime(300 + th * 1400, t, 0.3);
        w.frequency.setTargetAtTime(1800 + th * 2200, t, 0.3);
      },
    };
  },
  /** a speedboat's outboard motor and the hull slapping the water */
  outboard: (e, out) => {
    const c = e.ctx;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    const bp = filter(c, 'bandpass', 500, 1);
    const am = gain(c, 0.5);
    const chop = lfo(c, 30, 0.4, am.gain, 'square');
    o.connect(bp).connect(drive(c, 2)).connect(am).connect(gain(c, 0.25)).connect(out);
    const n = noiseLoop(e);
    const wl = filter(c, 'lowpass', 1200);
    const wg = gain(c, 0.12);
    n.connect(wl).connect(wg).connect(out);
    const slap = lfo(c, 1.3, 0.08, wg.gain);
    return {
      sources: start(e, o, chop, n, slap),
      update: (p, t) => o.frequency.setTargetAtTime(70 + (p.rpm ?? 0.5) * 80, t, 0.2),
    };
  },
  /** mains hum and the fridge */
  hum: (e, out) => {
    const c = e.ctx;
    const srcs = [50, 100, 150].map((f, i) => {
      const o = c.createOscillator();
      o.frequency.value = f;
      o.connect(gain(c, [0.05, 0.03, 0.012][i])).connect(out);
      return o;
    });
    return { sources: start(e, ...srcs) };
  },
  generator: (e, out) => {
    const c = e.ctx;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 48;
    const lp = filter(c, 'lowpass', 320, 2);
    const am = gain(c, 0.55);
    const chug = lfo(c, 12.5, 0.4, am.gain, 'square');
    o.connect(lp).connect(drive(c, 3)).connect(am).connect(gain(c, 0.35)).connect(out);
    const n = noiseLoop(e);
    const nb = filter(c, 'bandpass', 250, 1);
    n.connect(nb).connect(gain(c, 0.15)).connect(out);
    return { sources: start(e, o, chug, n) };
  },
  fan: (e, out) => {
    const c = e.ctx;
    const n = noiseLoop(e);
    const lp = filter(c, 'lowpass', 550);
    const g = gain(c, 0.25);
    n.connect(lp).connect(g).connect(out);
    const blades = lfo(c, 9, 0.06, g.gain);
    return { sources: start(e, n, blades) };
  },
  /** the TV: people talking, and with match > 0 a stadium crowd under the commentary */
  tv: (e, out) => {
    const c = e.ctx;
    const tinny = filter(c, 'highpass', 300);
    tinny.connect(out);
    const talk = babble(e, tinny, 2, [500, 1400]);
    const n = noiseLoop(e);
    const bp = filter(c, 'bandpass', 900, 0.5);
    const roar = gain(c, 0);
    n.connect(bp).connect(roar).connect(tinny);
    return {
      sources: [...talk.sources, ...start(e, n)],
      tick: talk.tick,
      update: (p, t) => roar.gain.setTargetAtTime((p.match ?? 0) * 0.25, t, 0.3),
    };
  },
  shower: (e, out) => {
    const c = e.ctx;
    const n = noiseLoop(e);
    const bp = filter(c, 'bandpass', 4200, 0.4);
    const g = gain(c, 0.45);
    n.connect(bp).connect(g).connect(out);
    const wob = lfo(c, 0.6, 0.06, g.gain);
    return { sources: start(e, n, wob) };
  },
  snore: (e, out) => {
    let next = 0;
    return {
      sources: [],
      tick: (t) => {
        if (t < next) return;
        next = t + 3.8;
        // the snore in, a rattle at ~55 Hz shaped by the throat
        const bp = filter(e.ctx, 'bandpass', 380, 3);
        bp.connect(out);
        tone(e, bp, t, { type: 'sawtooth', f: 52, f2: 60, dur: 1.1, gain: 0.3, attack: 0.4 });
        hiss(e, bp, t, { dur: 1.1, gain: 0.25, filter: 'lowpass', f: 900, attack: 0.4 });
        // and the long breath out
        hiss(e, out, t, { at: 1.7, dur: 1.0, gain: 0.06, filter: 'bandpass', f: 700, q: 1.2, attack: 0.2 });
        setTimeout(() => bp.disconnect(), 3000);
      },
    };
  },
  /** breathing; p.rate = breaths a second, p.hard 0..1 */
  breath: (e, out) => {
    let next = 0, inhale = true;
    return {
      sources: [],
      tick: (t, p) => {
        if (t < next) return;
        const rate = Math.max(0.3, p.rate ?? 1);
        const hard = p.hard ?? 0.5;
        next = t + 0.5 / rate;
        // close to the mic: loud enough to sit on top of the city
        if (inhale) hiss(e, out, t, { dur: 0.35 / rate, gain: 0.5 + hard * 0.5, filter: 'bandpass', f: 1600, f2: 2200, q: 0.8, attack: 0.1 / rate });
        else hiss(e, out, t, { dur: 0.3 / rate, gain: 0.7 + hard * 0.7, filter: 'bandpass', f: 950, f2: 700, q: 0.7, attack: 0.04 });
        inhale = !inhale;
      },
    };
  },
  /** chiptune bleeps for the games console */
  game: (e, out) => {
    let next = 0;
    const scale = [0, 3, 5, 7, 10, 12, 15];
    return {
      sources: [],
      tick: (t) => {
        if (t < next) return;
        next = t + pick([0.12, 0.12, 0.24]);
        if (Math.random() < 0.15) hiss(e, out, t, { dur: 0.08, gain: 0.08, filter: 'highpass', f: 2000 });
        else tone(e, out, t, { type: 'square', f: hz(72 + pick(scale)), dur: 0.08, gain: 0.07 });
      },
    };
  },
  /** typing on a laptop or tapping a phone */
  typing: (e, out) => {
    let next = 0;
    return {
      sources: [],
      tick: (t) => {
        if (t < next) return;
        next = t + (Math.random() < 0.12 ? rand(0.4, 0.9) : rand(0.07, 0.16));
        hiss(e, out, t, { dur: 0.015, gain: rand(0.12, 0.2), filter: 'bandpass', f: rand(2500, 4000), q: 1.2 });
        tone(e, out, t, { f: rand(180, 240), dur: 0.02, gain: 0.08 });
      },
    };
  },
  /** weights dropping at the gym */
  gym: (e, out) => {
    let next = 0;
    return {
      sources: [],
      tick: (t) => {
        if (t < next) return;
        next = t + rand(1.2, 4);
        const o = around(e, out, rand(-0.5, 0.5));
        const n = Math.random() < 0.5 ? 1 : 2;
        for (let i = 0; i < n; i++) {
          tone(e, o, t, { at: i * 0.12, f: rand(300, 420), dur: 0.35, gain: 0.08, type: 'triangle' });
          tone(e, o, t, { at: i * 0.12, f: 70, f2: 45, dur: 0.12, gain: 0.2 });
        }
      },
    };
  },
};

export type LoopKind = keyof typeof BUILD;

const live = new Set<Loop>();
let ticker: ReturnType<typeof setInterval> | null = null;
function ensureTicker() {
  if (ticker) return;
  ticker = setInterval(() => {
    const e = audioRaw();
    if (!e || e.ctx.state !== 'running') return;
    const t = e.ctx.currentTime + 0.05;
    for (const l of live) l.tickNow(t);
    if (!live.size && ticker) {
      clearInterval(ticker);
      ticker = null;
    }
  }, 40);
}

type LoopOpts = { bus?: Bus; at?: { x: number; y?: number; z: number }; ref?: number; max?: number; rolloff?: number; fade?: number };

/** A continuous sound you turn up and down. `set(0)` lets it fade and, after a while, shuts it down. */
export class Loop {
  private out: GainNode | null = null;
  private pan: PannerNode | null = null;
  private built: Built | null = null;
  private quietSince = 0;
  private params: Params = {};
  private level = 0;
  constructor(private kind: LoopKind, private o: LoopOpts = {}) {}

  set(level: number, params?: Params) {
    const e = audioRaw();
    if (!e) return;
    const t = e.ctx.currentTime;
    if (params) Object.assign(this.params, params);
    // muted: let everything wind down instead of running silently
    if (useSoundSettings.getState().muted || e.ctx.state !== 'running') level = 0;
    this.level = level;
    if (level > 0.001 && !this.built) this.build(e);
    if (!this.built || !this.out) return;
    this.out.gain.setTargetAtTime(level, t, this.o.fade ?? 0.25);
    if (params) this.built.update?.(this.params, t);
    if (level <= 0.001) {
      if (!this.quietSince) this.quietSince = t;
      else if (t - this.quietSince > 4) this.dispose();
    } else this.quietSince = 0;
  }

  move(x: number, y: number, z: number) {
    if (this.pan) movePanner(this.pan, x, y, z);
    if (this.o.at) this.o.at = { x, y, z };
  }

  get on() {
    return !!this.built && this.level > 0.001;
  }

  tickNow(t: number) {
    if (this.built?.tick && this.level > 0.001) this.built.tick(t, this.params);
  }

  private build(e: Eng & { buses: Record<Bus, GainNode> }) {
    const c = e.ctx;
    this.out = c.createGain();
    this.out.gain.value = 0;
    if (this.o.at) {
      this.pan = panner(this.o.at.x, this.o.at.y ?? 1, this.o.at.z, { ref: this.o.ref, max: this.o.max, rolloff: this.o.rolloff, bus: this.o.bus });
      this.out.connect(this.pan ?? e.buses[this.o.bus ?? 'sfx']);
    } else this.out.connect(e.buses[this.o.bus ?? 'sfx']);
    this.built = BUILD[this.kind](e, this.out);
    this.built.update?.(this.params, c.currentTime);
    live.add(this);
    ensureTicker();
  }

  dispose() {
    live.delete(this);
    if (this.built) for (const s of this.built.sources) {
      try {
        s.stop();
      } catch {}
    }
    this.built = null;
    this.out?.disconnect();
    this.pan?.disconnect();
    this.out = null;
    this.pan = null;
    this.quietSince = 0;
    this.level = 0;
  }
}
