'use client';
import { LEVELS, type Bus } from './settings';

// The one AudioContext for the whole app. Everything that makes sound plugs into a bus:
//   music    (title theme, venue music)
//   sfx      (footsteps, UI, cars, money)
//   ambience (city bed, wind, rain, hum)
// all summed into master, then a gentle limiter, then the speakers. The bus levels are fixed (settings.ts):
// sound is always on. Nothing is created until the first tap or key press, because browsers block audio
// before that (and some, like iOS Safari, need the context resumed inside the gesture itself).

type Engine = {
  ctx: AudioContext;
  buses: Record<Bus, GainNode>;
  noise: AudioBuffer;
};

let engine: Engine | null = null;
let unlocked = false;
const waiting = new Set<(e: Engine) => void>();

function create(): Engine | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC({ latencyHint: 'interactive' });
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.2;
  limiter.connect(ctx.destination);
  const master = ctx.createGain();
  master.connect(limiter);
  const mk = () => {
    const g = ctx.createGain();
    g.connect(master);
    return g;
  };
  const buses: Record<Bus, GainNode> = { master, music: mk(), sfx: mk(), ambience: mk() };
  // two seconds of white noise, shared by every hiss, whoosh, crowd and rain
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return { ctx, buses, noise };
}

function applyLevels() {
  if (!engine) return;
  const { ctx, buses } = engine;
  for (const b of Object.keys(LEVELS) as Bus[]) buses[b].gain.setTargetAtTime(LEVELS[b], ctx.currentTime, 0.05);
}

/** Create and resume the AudioContext. Call from inside a user gesture (tap, click, key). Safe to call often. */
export function unlockAudio() {
  if (!engine) {
    engine = create();
    if (!engine) return;
    applyLevels();
    document.addEventListener('visibilitychange', () => {
      if (!engine) return;
      if (document.hidden) void engine.ctx.suspend().catch(() => {});
      else if (unlocked) void engine.ctx.resume().catch(() => {});
    });
  }
  const { ctx } = engine;
  if (ctx.state !== 'running') void ctx.resume().catch(() => {});
  // iOS: playing one silent sample inside the gesture is what really unlocks output
  if (!unlocked) {
    const s = ctx.createBufferSource();
    s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    s.connect(ctx.destination);
    s.start();
    unlocked = true;
    for (const cb of waiting) cb(engine);
    waiting.clear();
  }
}

let installed = false;
/** Listen for the first gesture anywhere on the page and unlock then. Idempotent. */
export function installAudioUnlock() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const on = () => unlockAudio();
  for (const ev of ['pointerdown', 'touchend', 'keydown', 'click'] as const) window.addEventListener(ev, on, { capture: true, passive: true });
}

/** The engine once audio is unlocked and running, or null. Sound makers call this and do nothing on null. */
export function audio(): Engine | null {
  if (!engine || !unlocked) return null;
  if (engine.ctx.state !== 'running') return null;
  return engine;
}

/** The engine once unlocked, even while suspended (for long-running loops that should keep their place). */
export function audioRaw(): Engine | null {
  return engine && unlocked ? engine : null;
}

export const isAudioUnlocked = () => unlocked;

/** Run `cb` as soon as audio is unlocked (now, if it already is). */
export function whenUnlocked(cb: (e: Engine) => void) {
  if (engine && unlocked) cb(engine);
  else waiting.add(cb);
  return () => void waiting.delete(cb);
}

/** A bus to connect your own nodes to, or null before unlock. */
export function bus(name: Bus): GainNode | null {
  return engine && unlocked ? engine.buses[name] : null;
}
