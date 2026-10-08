// "Sunny Block", the Tweetlife theme: a sunny city-pop loop synthesised in the browser (no audio files, nothing to
// license: it is written here). 104 bpm in F major, 16 bars (about 37 s) that loop. Electric piano chords, a round
// bass, a marimba melody, glockenspiel and arpeggios on the second half, light drums, and a bird that tweets now and
// then. Every instrument takes (context, destination, time) so the same score plays live or renders offline.

export const BPM = 104;
export const STEP = 60 / BPM / 4; // one 16th note
export const LOOP_STEPS = 16 * 16;

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

// chord tones (midi) per bar, eight bars repeated twice: Fmaj7 Am7 Bbmaj7 C7 | Fmaj7 Dm7 Gm7 C7
const CHORDS: { root: number; tones: number[] }[] = [
  { root: 41, tones: [57, 60, 64, 65] }, // Fmaj7  (A C E F)
  { root: 45, tones: [55, 60, 64, 67] }, // Am7    (G C E G)
  { root: 46, tones: [57, 58, 62, 65] }, // Bbmaj7 (A Bb D F)
  { root: 48, tones: [55, 58, 64, 67] }, // C7     (G Bb E G)
  { root: 41, tones: [57, 60, 64, 65] }, // Fmaj7
  { root: 38, tones: [57, 60, 62, 65] }, // Dm7    (A C D F)
  { root: 43, tones: [58, 62, 65, 67] }, // Gm7    (Bb D F G)
  { root: 48, tones: [55, 58, 64, 67] }, // C7
];

// melody per bar: [16th, midi, length in 16ths]
const MELODY: [number, number, number][][] = [
  [[0, 72, 2], [2, 74, 2], [4, 77, 4], [10, 76, 2], [12, 74, 2], [14, 72, 2]],
  [[0, 69, 3], [4, 72, 2], [6, 76, 6], [14, 74, 2]],
  [[0, 74, 2], [2, 72, 2], [4, 70, 2], [6, 69, 4], [12, 65, 2], [14, 67, 2]],
  [[0, 69, 4], [6, 67, 2], [8, 64, 4], [14, 67, 2]],
  [[0, 72, 2], [2, 74, 2], [4, 77, 2], [6, 79, 2], [8, 81, 6], [14, 79, 2]],
  [[0, 77, 2], [2, 74, 2], [4, 72, 4], [8, 74, 2], [10, 77, 4], [14, 76, 2]],
  [[0, 74, 3], [3, 72, 1], [4, 70, 4], [10, 74, 2], [12, 72, 4]],
  [[0, 70, 2], [2, 69, 2], [4, 67, 4], [8, 64, 2], [10, 67, 2], [12, 72, 4]],
];

export type Rig = {
  ctx: BaseAudioContext;
  /** dry mix in */
  out: AudioNode;
  /** reverb send */
  wet: AudioNode;
  /** chords and pad go through here so the kick can duck them */
  pump: GainNode;
  noise: AudioBuffer;
};

/** Build the mix: a ducking bus, a small generated-room reverb, a gentle compressor. Connect `rig.master` onward. */
export function makeRig(ctx: BaseAudioContext): Rig & { master: GainNode } {
  const master = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 3;
  comp.attack.value = 0.01;
  comp.release.value = 0.2;
  const out = ctx.createGain();
  out.gain.value = 1.6;
  out.connect(comp).connect(master);
  const pump = ctx.createGain();
  pump.connect(out);
  // reverb: 1.8 s of decaying stereo noise, brighter at the start
  const verb = ctx.createConvolver();
  const len = Math.floor(ctx.sampleRate * 1.8);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  verb.buffer = ir;
  const wet = ctx.createGain();
  wet.gain.value = 0.28;
  wet.connect(verb).connect(out);
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  return { ctx, out, wet, pump, noise, master };
}

function env(p: AudioParam, t: number, peak: number, attack: number, decay: number) {
  p.setValueAtTime(0.0001, t);
  p.exponentialRampToValueAtTime(peak, t + attack);
  p.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function send(r: Rig, node: AudioNode, dry: AudioNode, wetAmt: number) {
  node.connect(dry);
  if (wetAmt > 0) {
    const g = r.ctx.createGain();
    g.gain.value = wetAmt;
    node.connect(g).connect(r.wet);
  }
}

function pan(r: Rig, value: number): AudioNode {
  const p = r.ctx.createStereoPanner();
  p.pan.value = value;
  return p;
}

function kick(r: Rig, t: number, level: number) {
  const { ctx } = r, o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(48, t + 0.1);
  env(g.gain, t, level, 0.003, 0.24);
  o.connect(g).connect(r.out);
  o.start(t);
  o.stop(t + 0.3);
  // duck the chords a touch on every kick
  r.pump.gain.setValueAtTime(0.55, t);
  r.pump.gain.linearRampToValueAtTime(1, t + 0.18);
}

function noiseHit(r: Rig, t: number, level: number, decay: number, type: BiquadFilterType, freq: number, q = 0.8, panAt = 0, wetAmt = 0) {
  const { ctx } = r, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = r.noise;
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  env(g.gain, t, level, 0.001, decay);
  const p = pan(r, panAt);
  s.connect(f).connect(g).connect(p);
  send(r, p, r.out, wetAmt);
  s.start(t, Math.random() * 0.5);
  s.stop(t + decay + 0.05);
}

function clap(r: Rig, t: number, level: number) {
  // three quick bursts then a tail, like a hand clap
  for (let i = 0; i < 3; i++) noiseHit(r, t + i * 0.011, level * 0.6, 0.02, 'bandpass', 1400, 1.2);
  noiseHit(r, t + 0.033, level, 0.16, 'bandpass', 1300, 1, 0, 0.35);
}

/** Electric piano: two-operator FM, the bell of the attack fading into a warm sine. */
function ep(r: Rig, t: number, midi: number, len: number, level: number, panAt: number) {
  const { ctx } = r, f0 = hz(midi);
  const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
  car.frequency.value = f0;
  mod.frequency.value = f0;
  mg.gain.setValueAtTime(f0 * 1.6, t);
  mg.gain.exponentialRampToValueAtTime(f0 * 0.15, t + 0.35);
  mod.connect(mg).connect(car.frequency);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + 0.006);
  g.gain.exponentialRampToValueAtTime(level * 0.45, t + 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.25);
  const p = pan(r, panAt);
  car.connect(g).connect(p);
  send(r, p, r.pump, 0.5);
  car.start(t);
  mod.start(t);
  car.stop(t + len + 0.3);
  mod.stop(t + len + 0.3);
}

function pad(r: Rig, t: number, tones: number[], len: number, level: number) {
  const { ctx } = r, f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = 'lowpass';
  f.frequency.value = 900;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + 0.6);
  g.gain.setValueAtTime(level, t + len - 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.4);
  f.connect(g);
  send(r, g, r.pump, 0.8);
  tones.forEach((n) => {
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz(n);
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + len + 0.5);
    }
  });
}

function bass(r: Rig, t: number, midi: number, len: number, level: number) {
  const { ctx } = r, o = ctx.createOscillator(), sub = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = 'triangle';
  o.frequency.value = hz(midi);
  sub.type = 'sine';
  sub.frequency.value = hz(midi);
  f.type = 'lowpass';
  f.frequency.setValueAtTime(1400, t);
  f.frequency.exponentialRampToValueAtTime(380, t + 0.12);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + 0.008);
  g.gain.setValueAtTime(level * 0.8, t + len * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(f);
  sub.connect(f);
  f.connect(g).connect(r.out);
  o.start(t);
  sub.start(t);
  o.stop(t + len + 0.05);
  sub.stop(t + len + 0.05);
}

/** Marimba: a sine with a quick 4th harmonic for the wooden knock. */
function marimba(r: Rig, t: number, midi: number, len: number, level: number, panAt = 0.15) {
  const { ctx } = r, f0 = hz(midi), p = pan(r, panAt);
  const parts: [number, number, number][] = [[1, 1, Math.max(0.35, len)], [3.98, 0.28, 0.06], [10, 0.06, 0.02]];
  for (const [mult, amp, dec] of parts) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = f0 * mult;
    env(g.gain, t, level * amp, 0.003, dec);
    o.connect(g).connect(p);
    o.start(t);
    o.stop(t + dec + 0.05);
  }
  send(r, p, r.out, 0.35);
}

/** Glockenspiel: bright, slightly inharmonic, long ring. Also the coin sound. */
export function bell(r: Rig, t: number, midi: number, level: number, panAt = -0.2) {
  const { ctx } = r, f0 = hz(midi), p = pan(r, panAt);
  const parts: [number, number, number][] = [[1, 1, 1.1], [2.76, 0.35, 0.4], [5.4, 0.15, 0.15]];
  for (const [mult, amp, dec] of parts) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = f0 * mult;
    env(g.gain, t, level * amp, 0.002, dec);
    o.connect(g).connect(p);
    o.start(t);
    o.stop(t + dec + 0.05);
  }
  send(r, p, r.out, 0.6);
}

/** A little bird: two or three fast upward chirps. It is called Tweetlife, after all. */
export function tweet(r: Rig, t: number, level: number, panAt = 0.5, notes = 2) {
  const { ctx } = r, p = pan(r, panAt);
  for (let i = 0; i < notes; i++) {
    const o = ctx.createOscillator(), g = ctx.createGain(), s = t + i * 0.085;
    const base = 2600 + ((i * 523) % 700);
    o.frequency.setValueAtTime(base, s);
    o.frequency.exponentialRampToValueAtTime(base * 1.55, s + 0.05);
    o.frequency.exponentialRampToValueAtTime(base * 1.2, s + 0.07);
    env(g.gain, s, level, 0.008, 0.06);
    o.connect(g).connect(p);
    o.start(s);
    o.stop(s + 0.1);
  }
  send(r, p, r.out, 0.5);
}

/** Schedule one 16th step of the theme. `step` counts from the very start, so the intro plays once. */
export function playStep(r: Rig, step: number, t: number) {
  const intro = step < 32; // first two bars: chords and bells only, then the band comes in
  const s = step % LOOP_STEPS;
  const bar = Math.floor(s / 16);
  const s16 = s % 16;
  const half = bar >= 8 ? 1 : 0; // second half: glockenspiel melody and arpeggios
  const ch = CHORDS[bar % 8];
  const swing = s16 % 2 === 1 ? STEP * 0.12 : 0;
  const tt = t + swing;
  const fill = bar % 8 === 7;

  // chords: comp on 1, the "and" of 2 and on 3
  if (s16 === 0) ch.tones.forEach((n, i) => ep(r, t, n, STEP * 5, 0.13, (i - 1.5) * 0.25));
  if (s16 === 6 || s16 === 10) ch.tones.forEach((n, i) => ep(r, tt, n, STEP * (s16 === 6 ? 1.5 : 3), 0.095, (i - 1.5) * 0.25));
  if (s16 === 0) pad(r, t, ch.tones.slice(0, 3).map((n) => n - 12), STEP * 16, 0.018);

  if (intro) {
    if (s16 === 0 || s16 === 8) bell(r, t, ch.tones[3] + 24, 0.06);
    if (step === 20) tweet(r, t, 0.05, 0.6, 3);
    return;
  }

  // drums
  if (s16 === 0 || s16 === 6 || (s16 === 8 && !fill) || (s16 === 11 && bar % 2 === 1)) kick(r, t, s16 === 0 ? 0.42 : 0.3);
  if (s16 === 4 || s16 === 12) clap(r, t, 0.4);
  if (fill && (s16 === 13 || s16 === 14 || s16 === 15)) clap(r, tt, 0.12 + (s16 - 13) * 0.05);
  if (s16 % 2 === 0) noiseHit(r, t, s16 % 4 === 2 ? 0.16 : 0.1, 0.035, 'highpass', 8000, 0.7, 0.3);
  else noiseHit(r, tt, 0.06, 0.03, 'highpass', 9500, 0.7, -0.3);
  if (s16 === 14 && !fill) noiseHit(r, tt, 0.1, 0.18, 'highpass', 7000, 0.7, 0.3, 0.2);

  // bass: root, root, octave pop, root, fifth, root, then a walk to the next chord
  const root = ch.root;
  const next = CHORDS[(bar + 1) % 8].root;
  const line: Record<number, [number, number]> = { 0: [root, 3], 3: [root, 2], 6: [root + 12, 1], 8: [root, 2], 10: [root + 7, 2], 12: [root, 2], 14: [next > root ? next - 1 : next + 1, 2] };
  const b = line[s16];
  if (b) bass(r, tt, b[0], STEP * b[1] * 0.95, 0.065);

  // melody
  const mel = MELODY[bar % 8];
  for (const [at, n, len] of mel) {
    if (at !== s16) continue;
    if (half === 0) marimba(r, tt, n, STEP * len, 0.4);
    else {
      bell(r, tt, n + 12, 0.11, -0.25);
      marimba(r, tt, n, STEP * len, 0.22, 0.3);
    }
  }
  // second half: arpeggios climbing the chord
  if (half === 1 && s16 % 2 === 0) {
    const idx = [0, 1, 2, 3, 2, 3, 1, 2][s16 / 2];
    marimba(r, tt, ch.tones[idx] + 12, STEP * 1.5, 0.11, -0.35);
  }

  // a bird now and then
  if (s16 === 9 && (bar === 3 || bar === 12)) tweet(r, tt, 0.04, bar === 3 ? 0.7 : -0.6, bar === 3 ? 2 : 3);
}

/** Render `loops` passes of the theme into an AudioBuffer (for previews and tests). */
export async function renderTheme(loops = 1, sampleRate = 44100) {
  const steps = 32 + LOOP_STEPS * loops;
  const ctx = new OfflineAudioContext(2, Math.ceil((steps * STEP + 2) * sampleRate), sampleRate);
  const rig = makeRig(ctx);
  rig.master.gain.value = 0.7;
  rig.master.connect(ctx.destination);
  for (let i = 0; i < steps; i++) playStep(rig, i, 0.05 + i * STEP);
  return ctx.startRendering();
}
