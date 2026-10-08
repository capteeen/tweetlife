'use client';

// The music in the clubs and the lounge, synthesised in the browser (no audio files). A small look-ahead
// scheduler plays each venue's pattern: amapiano at Club Moon, afrobeats at Afro Yard, techno at Warehouse 404,
// a jazz trio at the Velvet Room, tropical house at the beach club, slow jams in the lounge. Volume follows how
// close you are, and from outside the walls it is muffled. It plays through the shared engine's music bus (lib/audio).
// `beat()` gives the visuals (dance floor, lights) the same clock, music on or off.

import { audioRaw } from '@/lib/audio/engine';

export type Style = 'club' | 'lounge' | 'afro' | 'techno' | 'jazz' | 'beach';

const STYLES: Record<Style, { bpm: number; root: number; chords: number[][] }> = {
  // amapiano-ish: 112 bpm, log drum on the off-beats, shakers, airy chords
  club: { bpm: 112, root: 45, chords: [[0, 3, 7, 10], [-4, 0, 3, 7], [-2, 2, 5, 9], [-5, -1, 2, 5]] },
  // slow jams for the lounge
  lounge: { bpm: 84, root: 50, chords: [[0, 4, 7, 11], [-3, 0, 4, 7], [2, 5, 9, 12], [-5, -1, 2, 5]] },
  // afrobeats: 104 bpm, syncopated kick, rim on 2 and 4, congas, a highlife guitar line
  afro: { bpm: 104, root: 52, chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [5, 9, 12]] },
  // techno: 128 bpm, four on the floor, open hats on the off-beat, a rolling bass and an acid line
  techno: { bpm: 128, root: 41, chords: [[0, 3, 7], [0, 3, 7], [-2, 2, 5], [-4, 0, 3]] },
  // jazz: swung, ride cymbal, walking bass, comping piano (ii-V-I-vi)
  jazz: { bpm: 112, root: 48, chords: [[2, 5, 9, 12], [7, 11, 14, 17], [0, 4, 7, 11], [9, 12, 16, 19]] },
  // tropical house: 118 bpm, marimba plucks, soft pads
  beach: { bpm: 118, root: 53, chords: [[0, 4, 7, 11], [-3, 0, 4, 7], [-7, -3, 0, 4], [-5, -1, 2, 5]] },
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let walls: BiquadFilterNode | null = null;
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
  const e = audioRaw();
  if (!e) return null;
  ctx = e.ctx;
  master = ctx.createGain();
  master.gain.value = 0;
  // the walls: a low-pass that closes when you are outside
  walls = ctx.createBiquadFilter();
  walls.type = 'lowpass';
  walls.frequency.value = 18000;
  const comp = ctx.createDynamicsCompressor();
  master.connect(walls).connect(comp).connect(e.buses.music);
  noise = e.noise;
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
  s.start(t, Math.random() * 1.5);
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

/** One plucked or blown note. */
function note(t: number, midi: number, len: number, level: number, type: OscillatorType, cutoff = 3000) {
  const c = ctx!, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
  o.type = type;
  o.frequency.value = hz(midi);
  f.type = 'lowpass';
  f.frequency.value = cutoff;
  env(g, t, level, 0.005, len);
  o.connect(f).connect(g).connect(master!);
  o.start(t);
  o.stop(t + len + 0.05);
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
  } else if (style === 'afro') {
    if (s16 === 0 || s16 === 7 || s16 === 10) kick(t, 0.8);
    if (s16 === 4 || s16 === 12) hiss(t, 0.18, 0.06, 3500); // rim
    if (s16 % 2 === 0) hiss(t, s16 % 4 === 2 ? 0.07 : 0.04, 0.04, 7500); // shaker
    if ([3, 6, 11, 14].includes(s16)) logDrum(t, st.root + 12 + (s16 === 14 ? 7 : 0), 0.18); // congas
    if (s16 % 2 === 1) note(t, st.root + 24 + ch[(s16 >> 1) % ch.length], 0.16, 0.05, 'triangle', 2600); // guitar
    if (s16 === 0 || s16 === 8) note(t, st.root - 12 + ch[0], 0.5, 0.25, 'sine', 400);
  } else if (style === 'techno') {
    if (s16 % 4 === 0) kick(t, 1);
    if (s16 % 4 === 2) hiss(t, 0.1, 0.12, 6000); // open hat
    if (s16 === 4 || s16 === 12) hiss(t, 0.2, 0.12, 1500); // clap
    if (s16 % 4 !== 0) note(t, st.root + ch[0] - 12, 0.12, 0.16, 'sawtooth', 320); // rolling bass
    if ([0, 3, 6, 8, 11, 14].includes(s16)) note(t, st.root + 24 + ch[[0, 2, 1, 0, 2, 1][[0, 3, 6, 8, 11, 14].indexOf(s16)]], 0.1, 0.04, 'sawtooth', 900 + 700 * Math.sin(step / 9)); // acid
  } else if (style === 'jazz') {
    // swing: the second eighth of each beat lands late (step 3 of 4)
    if (s16 % 4 === 0 || s16 % 8 === 7) hiss(t, s16 % 8 === 7 ? 0.05 : 0.07, 0.25, 6500); // ride
    if (s16 === 4 || s16 === 12) hiss(t, 0.06, 0.18, 2500); // brushes on 2 and 4
    if (s16 % 4 === 0) note(t, st.root - 12 + ch[(s16 >> 2) % ch.length], 0.38, 0.2, 'triangle', 700); // walking bass
    if (s16 === 3 || s16 === 10) chord(t, ch.map((n) => st.root + 12 + n), 0.35, 0.045, false); // piano comp
    if (s16 === 7 && bar % 2) note(t, st.root + 24 + ch[2], 0.4, 0.035, 'sine'); // a little melody
  } else if (style === 'beach') {
    if (s16 % 4 === 0) kick(t, 0.75);
    if (s16 % 4 === 2) hiss(t, 0.07, 0.06, 8000);
    if (s16 === 4 || s16 === 12) hiss(t, 0.12, 0.1, 2200);
    if ([0, 3, 6, 10, 13].includes(s16)) note(t, st.root + 12 + ch[[0, 2, 1, 3, 2][[0, 3, 6, 10, 13].indexOf(s16)]], 0.22, 0.09, 'sine'); // marimba
    if (s16 === 0) chord(t, ch.map((n) => st.root + n), 1.8, 0.04, false);
    if (s16 === 0 || s16 === 10) note(t, st.root - 12 + ch[0], 0.35, 0.22, 'sine', 300);
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

/** Start (or keep) playing a style at a volume 0..1; `muffle` 0..1 is how much wall is between you and it.
 *  Does nothing until the first tap unlocks audio (lib/audio/engine.ts). */
export function play(s: Style, volume: number, muffle = 0) {
  const c = ensure();
  if (!c || !master || !walls) return;
  walls.frequency.setTargetAtTime(18000 * Math.pow(400 / 18000, Math.max(0, Math.min(1, muffle))), c.currentTime, 0.15);
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
