'use client';

// Small building blocks for procedural sounds. Every sound in the game is made from these at run time:
// oscillators, the shared noise buffer, filters and envelopes. No audio files to download.

export type Eng = { ctx: AudioContext; noise: AudioBuffer };

const FLOOR = 0.0001;

/** Attack to `peak`, then an exponential fall over `decay` seconds. */
export function env(p: AudioParam, t: number, peak: number, attack: number, decay: number) {
  p.cancelScheduledValues(t);
  p.setValueAtTime(FLOOR, t);
  p.exponentialRampToValueAtTime(Math.max(FLOOR * 2, peak), t + attack);
  p.exponentialRampToValueAtTime(FLOOR, t + attack + decay);
}

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const pick = <T>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];
export const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

type ToneOpts = {
  type?: OscillatorType;
  f: number;
  /** glide to this frequency over the sound */
  f2?: number;
  dur: number;
  gain: number;
  attack?: number;
  detune?: number;
  /** delay before it starts */
  at?: number;
};

/** One pitched blip. */
export function tone(e: Eng, out: AudioNode, t: number, o: ToneOpts) {
  const c = e.ctx, osc = c.createOscillator(), g = c.createGain();
  const t0 = t + (o.at ?? 0);
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.f, t0);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t0 + o.dur);
  if (o.detune) osc.detune.value = o.detune;
  env(g.gain, t0, o.gain, o.attack ?? 0.003, o.dur);
  osc.connect(g).connect(out);
  osc.start(t0);
  osc.stop(t0 + (o.attack ?? 0.003) + o.dur + 0.05);
  return t0 + o.dur;
}

type HissOpts = {
  dur: number;
  gain: number;
  attack?: number;
  filter?: BiquadFilterType;
  f?: number;
  f2?: number;
  q?: number;
  at?: number;
  rate?: number;
};

/** A burst of filtered noise: steps, whooshes, claps, hisses. */
export function hiss(e: Eng, out: AudioNode, t: number, o: HissOpts) {
  const c = e.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  const t0 = t + (o.at ?? 0);
  s.buffer = e.noise;
  if (o.rate) s.playbackRate.value = o.rate;
  f.type = o.filter ?? 'bandpass';
  f.frequency.setValueAtTime(o.f ?? 1000, t0);
  if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t0 + (o.attack ?? 0.003) + o.dur);
  f.Q.value = o.q ?? 1;
  env(g.gain, t0, o.gain, o.attack ?? 0.003, o.dur);
  s.connect(f).connect(g).connect(out);
  const len = (o.attack ?? 0.003) + o.dur + 0.05;
  // bursts longer than the noise buffer loop it
  if (len > e.noise.duration - 0.2) s.loop = true;
  s.start(t0, Math.random() * Math.max(0, e.noise.duration - len - 0.1));
  s.stop(t0 + len);
  return t0 + o.dur;
}

/** A metallic ping made of inharmonic partials (coins, bells, glasses). */
export function ping(e: Eng, out: AudioNode, t: number, base: number, gain: number, decay: number, ratios = [1, 1.51, 2.27, 2.98]) {
  ratios.forEach((r, i) => tone(e, out, t, { f: base * r, dur: decay * (1 - i * 0.15), gain: gain / (i + 1.3), attack: 0.001 }));
  return t + decay;
}

/** A looping noise source (start it yourself). */
export function noiseLoop(e: Eng, rate = 1) {
  const s = e.ctx.createBufferSource();
  s.buffer = e.noise;
  s.loop = true;
  s.playbackRate.value = rate;
  return s;
}

export function filter(c: BaseAudioContext, type: BiquadFilterType, f: number, q = 0.8) {
  const n = c.createBiquadFilter();
  n.type = type;
  n.frequency.value = f;
  n.Q.value = q;
  return n;
}

export function gain(c: BaseAudioContext, v = 1) {
  const g = c.createGain();
  g.gain.value = v;
  return g;
}

/** A slow wobble: an oscillator (Hz) scaled by `depth`, added onto a param. Returns the oscillator (start it). */
export function lfo(c: BaseAudioContext, rate: number, depth: number, target: AudioParam, type: OscillatorType = 'sine') {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.value = rate;
  g.gain.value = depth;
  o.connect(g).connect(target);
  return o;
}

const curves = new Map<number, Float32Array<ArrayBuffer>>();
/** Soft clipping, for engines and grit. */
export function drive(c: BaseAudioContext, amount: number) {
  const ws = c.createWaveShaper();
  let curve = curves.get(amount);
  if (!curve) {
    curve = new Float32Array(512);
    for (let i = 0; i < 512; i++) curve[i] = Math.tanh(((i / 256) - 1) * amount);
    curves.set(amount, curve);
  }
  ws.curve = curve;
  return ws;
}
