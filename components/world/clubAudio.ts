'use client';

// The music in the club and the lounge, synthesised in the browser (no audio files). A small look-ahead
// scheduler plays a drum pattern, a log-drum bass line and chord stabs. Volume follows how close you are.
// `beat()` gives the visuals (dance floor, lights) the same clock, music on or off.

export type Style = 'club' | 'lounge';

const STYLES: Record<Style, { bpm: number; root: number; chords: number[][] }> = {
  // amapiano-ish: 112 bpm, log drum on the off-beats, shakers, airy chords
  club: { bpm: 112, root: 45, chords: [[0, 3, 7, 10], [-4, 0, 3, 7], [-2, 2, 5, 9], [-5, -1, 2, 5]] },
  // slow jams for the lounge
  lounge: { bpm: 84, root: 50, chords: [[0, 4, 7, 11], [-3, 0, 4, 7], [2, 5, 9, 12], [-5, -1, 2, 5]] },
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let style: Style = 'club';
let nextStep = 0;
let nextTime = 0;
let started = performance.now();
let noise: AudioBuffer | null = null;

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** Current position in beats, for visuals. Runs off the audio clock when music plays, the page clock otherwise. */
export function beat(s: Style = style) {
  const bpm = STYLES[s].bpm;
  if (ctx && timer) return (ctx.currentTime * bpm) / 60;
  return ((performance.now() - started) / 1000) * (bpm / 60);
}

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

function env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function kick(t: number, level = 0.9) {
  const c = ctx!, o = c.createOscillator(), g = c.createGain();
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  env(g, t, level, 0.002, 0.28);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + 0.35);
}

function hiss(t: number, level: number, decay: number, freq: number) {
  const c = ctx!, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = noise;
  f.type = 'highpass';
  f.frequency.value = freq;
  env(g, t, level, 0.001, decay);
  s.connect(f).connect(g).connect(master!);
  s.start(t);
  s.stop(t + decay + 0.05);
}

/** The log drum: a pitched sine that drops a little, with some bite. */
function logDrum(t: number, midi: number, level = 0.5) {
  const c = ctx!, o = c.createOscillator(), g = c.createGain(), sh = c.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) curve[i] = Math.tanh(((i / 128) - 1) * 2.2);
  sh.curve = curve;
  o.type = 'sine';
  o.frequency.setValueAtTime(hz(midi + 12), t);
  o.frequency.exponentialRampToValueAtTime(hz(midi), t + 0.06);
  env(g, t, level, 0.004, 0.32);
  o.connect(sh).connect(g).connect(master!);
  o.start(t);
  o.stop(t + 0.4);
}

function chord(t: number, notes: number[], len: number, level: number, bright: boolean) {
  const c = ctx!, f = c.createBiquadFilter(), g = c.createGain();
  f.type = 'lowpass';
  f.frequency.value = bright ? 2400 : 1200;
  env(g, t, level, bright ? 0.01 : 0.06, len);
  f.connect(g).connect(master!);
  for (const n of notes) {
    const o = c.createOscillator();
    o.type = bright ? 'sawtooth' : 'triangle';
    o.frequency.value = hz(n);
    o.detune.value = (Math.random() - 0.5) * 8;
    o.connect(f);
    o.start(t);
    o.stop(t + len + 0.1);
  }
}

function playStep(step: number, t: number) {
  const st = STYLES[style];
  const bar = Math.floor(step / 16) % 4;
  const s16 = step % 16;
  const ch = st.chords[bar];
  if (style === 'club') {
    if (s16 % 4 === 0) kick(t);
    if (s16 % 2 === 1 || s16 % 4 === 2) hiss(t, s16 % 4 === 2 ? 0.12 : 0.06, 0.05, 7000); // shakers
    if (s16 === 4 || s16 === 12) hiss(t, 0.25, 0.14, 1800); // clap
    if ([3, 6, 10, 11, 14].includes(s16)) logDrum(t, st.root + (s16 === 11 ? ch[1] : ch[0]) - 12, 0.45);
    if (s16 === 0) chord(t, ch.map((n) => st.root + 12 + n), 1.6, 0.06, false);
    if (s16 === 7 || s16 === 15) chord(t, ch.map((n) => st.root + 24 + n), 0.18, 0.03, true);
  } else {
    if (s16 === 0 || s16 === 10) kick(t, 0.55);
    if (s16 === 4 || s16 === 12) hiss(t, 0.12, 0.2, 2500);
    if (s16 % 2 === 0) hiss(t, 0.035, 0.04, 8000);
    if (s16 === 0 || s16 === 8) chord(t, ch.map((n) => st.root + n), 1.4, 0.07, false);
    if (s16 === 0 || s16 === 6 || s16 === 8) logDrum(t, st.root + ch[0] - 24, 0.3);
  }
}

function schedule() {
  if (!ctx) return;
  const stepLen = 60 / STYLES[style].bpm / 4;
  while (nextTime < ctx.currentTime + 0.12) {
    playStep(nextStep, nextTime);
    nextStep++;
    nextTime += stepLen;
  }
}

/** Start (or keep) playing a style at a volume 0..1. Must first run after a user gesture (browsers block audio before that). */
export function play(s: Style, volume: number) {
  const c = ensure();
  if (!c || !master) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  if (s !== style) {
    style = s;
    const stepLen = 60 / STYLES[style].bpm / 4;
    nextStep = Math.ceil(c.currentTime / stepLen);
    nextTime = nextStep * stepLen;
  }
  if (!timer) {
    const stepLen = 60 / STYLES[style].bpm / 4;
    // line the step grid up with the beat clock so lights and music agree
    nextStep = Math.ceil(c.currentTime / stepLen);
    nextTime = nextStep * stepLen;
    timer = setInterval(schedule, 25);
  }
  master.gain.setTargetAtTime(Math.max(0, Math.min(1, volume)) * 0.7, c.currentTime, 0.25);
}

export function stop() {
  if (!ctx || !master) return;
  master.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
  if (timer) clearInterval(timer);
  timer = null;
  started = performance.now();
}

export const playing = () => !!timer;
