'use client';
import { audioRaw } from './engine';
import type { Bus } from './settings';

// 3D sound: the listener follows the camera (set every frame by <AudioListenerSync/>), and a sound
// placed with `panner()` gets quieter with distance and pans left and right. Equal-power panning, not HRTF,
// because it is far cheaper on phones and sounds fine on speakers.

export const listener = { x: 0, y: 0, z: 0, fx: 0, fz: -1 };

export function setListener(x: number, y: number, z: number, fx: number, fz: number) {
  listener.x = x;
  listener.y = y;
  listener.z = z;
  listener.fx = fx;
  listener.fz = fz;
  const e = audioRaw();
  if (!e) return;
  const l = e.ctx.listener;
  const t = e.ctx.currentTime;
  if (l.positionX) {
    l.positionX.setTargetAtTime(x, t, 0.03);
    l.positionY.setTargetAtTime(y, t, 0.03);
    l.positionZ.setTargetAtTime(z, t, 0.03);
    l.forwardX.setTargetAtTime(fx, t, 0.03);
    l.forwardY.setTargetAtTime(0, t, 0.03);
    l.forwardZ.setTargetAtTime(fz, t, 0.03);
    l.upX.value = 0;
    l.upY.value = 1;
    l.upZ.value = 0;
  } else {
    // older Safari
    (l as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(x, y, z);
    (l as unknown as { setOrientation(a: number, b: number, c: number, d: number, e: number, f: number): void }).setOrientation(fx, 0, fz, 0, 1, 0);
  }
}

/** Horizontal distance from the listener. Use it to skip sounds that would be inaudible anyway. */
export const distToListener = (x: number, z: number) => Math.hypot(x - listener.x, z - listener.z);

export type PannerOpts = { ref?: number; max?: number; rolloff?: number; bus?: Bus };

/** A panner at (x, y, z) wired into a bus. Connect your source into it. */
export function panner(x: number, y: number, z: number, o: PannerOpts = {}): PannerNode | null {
  const e = audioRaw();
  if (!e) return null;
  const p = e.ctx.createPanner();
  p.panningModel = 'equalpower';
  p.distanceModel = 'inverse';
  p.refDistance = o.ref ?? 4;
  p.maxDistance = o.max ?? 120;
  p.rolloffFactor = o.rolloff ?? 1.2;
  movePanner(p, x, y, z);
  p.connect(e.buses[o.bus ?? 'sfx']);
  return p;
}

export function movePanner(p: PannerNode, x: number, y: number, z: number) {
  if (p.positionX) {
    const t = p.context.currentTime;
    p.positionX.setTargetAtTime(x, t, 0.03);
    p.positionY.setTargetAtTime(y, t, 0.03);
    p.positionZ.setTargetAtTime(z, t, 0.03);
  } else (p as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(x, y, z);
}
