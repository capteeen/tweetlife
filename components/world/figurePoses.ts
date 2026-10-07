import { lift, rot, type Rig } from './figureMoves';

// Poses for using furniture: sitting on a chair or sofa, sitting on the floor in front of the TV, lying in bed,
// and standing at a piece (bucket, fridge, generator...). A pose is a base for the legs and hips plus an
// animation for the upper body, and blends in by `w` like the everyday moves.

export type PoseBase = 'chair' | 'floor' | 'stand' | 'lie';
export type PoseUpper =
  | 'idle' | 'relax' | 'phone' | 'eat' | 'watch' | 'cheer' | 'game' | 'sleep' | 'nap'
  | 'bath' | 'shower' | 'drink' | 'read' | 'write' | 'cool' | 'pull' | 'admire';

export type HomePose = {
  base: PoseBase;
  upper: PoseUpper;
  /** seat or mattress height under the figure (0 for the floor) */
  seat: number;
};

export const poseKey = (p: HomePose) => `${p.base}:${p.upper}:${p.seat}`;

const smooth = (x: number) => x * x * (3 - 2 * x);
/** 0..1 pulse with period `p`, rising for the first `up` fraction */
const pulse = (t: number, p: number, up = 0.5) => {
  const k = (t % p) / p;
  return k < up ? smooth(k / up) : smooth(1 - (k - up) / (1 - up));
};

const ARMS = (r: Rig) => [[r.lArm, r.lElbow, -1], [r.rArm, r.rElbow, 1]] as const;
const LEGS = (r: Rig) => [[r.lLeg, r.lKnee, -1], [r.rLeg, r.rKnee, 1]] as const;

export function applyPose(r: Rig, pose: HomePose, t: number, w: number) {
  if (w <= 0) return;
  BASES[pose.base](r, pose.seat, t, w);
  UPPERS[pose.upper](r, t, w, pose.base);
  if (pose.upper === 'sleep' || pose.upper === 'nap') for (const e of r.eyes) if (e) e.scale.y += (0.12 - e.scale.y) * w;
}

const BASES: Record<PoseBase, (r: Rig, seat: number, t: number, w: number) => void> = {
  // hips on the seat, thighs level, shins down
  chair(r, seat, t, w) {
    lift(r.body, seat + 0.08 - r.hipY, w);
    rot(r.body, 'y', 0, w);
    for (const [leg, knee, side] of LEGS(r)) {
      rot(leg, 'x', -1.5, w);
      rot(leg, 'z', side * 0.07, w);
      rot(knee, 'x', 1.4 + (side > 0 ? 0.08 * Math.sin(t * 2.6) : 0), w); // a lazy foot tap
    }
  },
  // cross-legged on the floor
  floor(r, _seat, _t, w) {
    lift(r.body, 0.1 - r.hipY, w);
    rot(r.body, 'y', 0, w);
    for (const [leg, knee, side] of LEGS(r)) {
      rot(leg, 'x', -1.3, w);
      rot(leg, 'z', side * 0.75, w);
      rot(knee, 'x', 2.35, w);
    }
  },
  stand(r, seat, _t, w) {
    lift(r.body, seat, w);
  },
  // on the back, head toward the figure's -z (the pillow end), one knee up
  lie(r, seat, t, w) {
    rot(r.body, 'x', -Math.PI / 2, w);
    rot(r.body, 'y', 0, w);
    lift(r.body, seat + 0.13, w);
    rot(r.lLeg, 'x', -0.35, w);
    rot(r.lKnee, 'x', 0.7, w);
    rot(r.rLeg, 'x', 0, w);
    rot(r.rKnee, 'x', 0.05, w);
    rot(r.lLeg, 'z', -0.12, w);
    rot(r.rLeg, 'z', 0.05, w);
    // slow, deep breaths
    if (r.chest) r.chest.scale.setScalar(1 + Math.sin(t * 1.5) * 0.03 * w);
  },
};

const UPPERS: Record<PoseUpper, (r: Rig, t: number, w: number, base: PoseBase) => void> = {
  // hands on the knees, looking around now and then
  idle(r, t, w) {
    for (const [arm, elbow, side] of ARMS(r)) {
      rot(arm, 'x', -0.55, w);
      rot(arm, 'z', side * 0.12, w);
      rot(elbow, 'x', -0.65, w);
    }
    rot(r.head, 'y', 0.45 * Math.sin(t * 0.45), w);
  },
  // sinking back into the sofa, arms spread along the backrest
  relax(r, t, w) {
    rot(r.chest, 'x', -0.3, w);
    rot(r.head, 'x', -0.12 + 0.05 * Math.sin(t * 0.6), w);
    rot(r.head, 'y', 0.2 * Math.sin(t * 0.3), w);
    for (const [arm, elbow, side] of ARMS(r)) {
      rot(arm, 'x', 0.25, w);
      rot(arm, 'z', side * 1.15, w);
      rot(elbow, 'x', -0.35, w);
    }
  },
  // phone to the ear, the other hand talking
  phone(r, t, w) {
    if (r.phone) r.phone.visible = w > 0.5;
    rot(r.rArm, 'x', -0.35, w);
    rot(r.rArm, 'z', 0.55, w);
    rot(r.rElbow, 'x', -2.45, w);
    rot(r.head, 'z', 0.15, w);
    rot(r.head, 'x', 0.08 * Math.sin(t * 3.1), w); // nodding along
    const g = pulse(t, 2.2, 0.3);
    rot(r.lArm, 'x', -0.5 - 0.5 * g, w);
    rot(r.lArm, 'z', -0.2 - 0.25 * g, w);
    rot(r.lElbow, 'x', -0.9 - 0.4 * g, w);
    rot(r.chest, 'x', -0.08, w);
  },
  // spoon from the plate to the mouth
  eat(r, t, w, base) {
    const bite = pulse(t, 1.8, 0.45);
    rot(r.chest, 'x', base === 'stand' ? 0.05 : 0.15, w);
    rot(r.rArm, 'x', -0.55 - 0.35 * bite, w);
    rot(r.rArm, 'z', 0.1 - 0.15 * bite, w);
    rot(r.rElbow, 'x', -0.9 - 1.45 * bite, w);
    rot(r.lArm, 'x', -0.6, w);
    rot(r.lArm, 'z', -0.05, w);
    rot(r.lElbow, 'x', -1.0, w);
    rot(r.head, 'x', 0.18 - 0.2 * bite, w);
  },
  // leaning back on the hands, eyes on the screen
  watch(r, t, w) {
    rot(r.chest, 'x', -0.2, w);
    rot(r.head, 'x', -0.08 + 0.04 * Math.sin(t * 0.8), w);
    for (const [arm, elbow, side] of ARMS(r)) {
      rot(arm, 'x', 0.6, w);
      rot(arm, 'z', side * 0.35, w);
      rot(elbow, 'x', 0, w);
    }
  },
  // the match: watching, then both arms up for a goal every few seconds
  cheer(r, t, w, base) {
    const goal = pulse(t, 7, 0.12) * (t % 7 < 2.2 ? 1 : 0);
    UPPERS.watch(r, t, w * (1 - goal), base);
    for (const [arm, elbow, side] of ARMS(r)) {
      rot(arm, 'x', -2.8 + 0.25 * Math.sin(t * 14), w * goal);
      rot(arm, 'z', side * 0.35, w * goal);
      rot(elbow, 'x', -0.4, w * goal);
    }
    rot(r.chest, 'x', 0.05, w * goal);
    rot(r.head, 'x', -0.3, w * goal);
  },
  // hunched over a controller, thumbs going
  game(r, t, w) {
    rot(r.chest, 'x', 0.22, w);
    rot(r.head, 'x', -0.1, w);
    for (const [arm, elbow, side] of ARMS(r)) {
      rot(arm, 'x', -0.75, w);
      rot(arm, 'z', side * -0.32, w);
      rot(elbow, 'x', -1.25 + 0.06 * Math.sin(t * 17 + side), w);
    }
    // leaning into the turns
    rot(r.chest, 'z', 0.12 * Math.sin(t * 0.9), w);
  },
  // one hand resting across the belly, head turned on the pillow; the hand rises and falls with each breath
  sleep(r, t, w) {
    rot(r.head, 'y', 0.4, w);
    rot(r.head, 'x', -0.12, w);
    rot(r.lArm, 'x', -0.5 - 0.03 * Math.sin(t * 1.5), w);
    rot(r.lArm, 'z', -0.12, w);
    rot(r.lElbow, 'x', -0.25, w);
    rot(r.lElbow, 'z', 1.55, w);
    rot(r.rArm, 'x', 0, w);
    rot(r.rArm, 'z', 0.14, w);
    rot(r.rElbow, 'x', -0.15, w);
  },
  // a hand tucked behind the head, the other on the belly
  nap(r, t, w) {
    rot(r.head, 'y', -0.25, w);
    rot(r.rArm, 'x', -2.75, w);
    rot(r.rArm, 'z', 0.35, w);
    rot(r.rElbow, 'z', -2.0, w);
    rot(r.lArm, 'x', -0.5 - 0.03 * Math.sin(t * 1.5), w);
    rot(r.lArm, 'z', -0.12, w);
    rot(r.lElbow, 'x', -0.25, w);
    rot(r.lElbow, 'z', 1.55, w);
  },
  // bucket bath: scoop, pour over the head, scrub the arms
  bath(r, t, w) {
    const k = (t % 4) / 4;
    const pour = k < 0.5 ? pulse(k * 2, 1, 0.4) : 0;
    const scrub = k >= 0.5 ? Math.sin(t * 12) : 0;
    rot(r.chest, 'x', 0.15 - 0.15 * pour, w);
    rot(r.head, 'x', 0.2 - 0.4 * pour, w);
    rot(r.rArm, 'x', -0.6 - 2.1 * pour, w);
    rot(r.rArm, 'z', 0.15, w);
    rot(r.rElbow, 'x', -0.4 - 0.6 * pour - (k >= 0.5 ? 1.3 : 0), w);
    rot(r.lArm, 'x', -0.5 - (k >= 0.5 ? 0.3 : 1.6 * pour), w);
    rot(r.lArm, 'z', -0.15 + (k >= 0.5 ? 0.35 + 0.08 * scrub : 0), w);
    rot(r.lElbow, 'x', -1.0 - (k >= 0.5 ? 0.3 : 0), w);
  },
  // under the shower head, washing the hair
  shower(r, t, w) {
    rot(r.head, 'x', -0.25 + 0.1 * Math.sin(t * 1.3), w);
    for (const [arm, elbow, side] of ARMS(r)) {
      const scrub = Math.sin(t * 9 + (side > 0 ? Math.PI : 0));
      rot(arm, 'x', -2.55 + 0.12 * scrub, w);
      rot(arm, 'z', side * 0.4, w);
      rot(elbow, 'x', -1.75, w);
    }
    rot(r.body, 'z', 0.05 * Math.sin(t * 1.1), w);
  },
  // bottle up, head back, a long sip
  drink(r, t, w) {
    const sip = pulse(t, 3, 0.3);
    rot(r.rArm, 'x', -0.5 - 0.6 * sip, w);
    rot(r.rArm, 'z', 0.15, w);
    rot(r.rElbow, 'x', -1.2 - 1.0 * sip, w);
    rot(r.head, 'x', -0.4 * sip, w);
    rot(r.lArm, 'z', -0.5, w); // other hand on the hip
    rot(r.lElbow, 'x', -1.2, w);
  },
  // a book held in both hands, head down, turning a page now and then
  read(r, t, w) {
    rot(r.head, 'x', 0.35, w);
    const page = pulse(t, 5, 0.1) * (t % 5 < 0.8 ? 1 : 0);
    for (const [arm, elbow, side] of ARMS(r)) {
      rot(arm, 'x', -0.65, w);
      rot(arm, 'z', side * -0.22, w);
      rot(elbow, 'x', -1.3 - (side > 0 ? 0.4 * page : 0), w);
    }
  },
  // leaning over the table, writing
  write(r, t, w) {
    rot(r.chest, 'x', 0.38, w);
    rot(r.head, 'x', 0.3, w);
    rot(r.rArm, 'x', -0.9 + 0.06 * Math.sin(t * 9), w);
    rot(r.rArm, 'z', -0.1 + 0.08 * Math.sin(t * 4.5), w);
    rot(r.rElbow, 'x', -0.7, w);
    rot(r.lArm, 'x', -0.85, w);
    rot(r.lArm, 'z', 0.05, w);
    rot(r.lElbow, 'x', -0.55, w);
    // a think every few seconds: pen to the chin
    const think = pulse(t, 6, 0.2) * (t % 6 < 1.6 ? 1 : 0);
    rot(r.rArm, 'x', -0.7, w * think);
    rot(r.rElbow, 'x', -2.2, w * think);
    rot(r.head, 'x', 0, w * think);
  },
  // arms open to the breeze, head back, fanning with one hand
  cool(r, t, w) {
    rot(r.head, 'x', -0.35, w);
    rot(r.chest, 'x', -0.1, w);
    rot(r.lArm, 'z', -1.0, w);
    rot(r.lArm, 'x', 0, w);
    rot(r.lElbow, 'x', -0.2, w);
    rot(r.rArm, 'x', -1.2, w);
    rot(r.rArm, 'z', 0.2, w);
    rot(r.rElbow, 'x', -1.6 + 0.35 * Math.sin(t * 10), w);
  },
  // bent over the generator, yanking the pull cord
  pull(r, t, w) {
    const yank = pulse(t, 1.4, 0.15);
    rot(r.chest, 'x', 0.55 - 0.25 * yank, w);
    rot(r.head, 'x', 0.15, w);
    rot(r.rArm, 'x', -1.1 + 1.5 * yank, w);
    rot(r.rArm, 'z', 0.15, w);
    rot(r.rElbow, 'x', -0.4 - 1.0 * yank, w);
    rot(r.lArm, 'x', -0.9, w);
    rot(r.lElbow, 'x', -0.5, w);
  },
  // hands on the hips, looking up
  admire(r, t, w) {
    rot(r.head, 'x', -0.55, w);
    rot(r.head, 'y', 0.3 * Math.sin(t * 0.5), w);
    for (const [arm, elbow, side] of ARMS(r)) {
      rot(arm, 'x', 0.2, w);
      rot(arm, 'z', side * 0.55, w);
      rot(elbow, 'x', -1.5, w);
    }
  },
};
