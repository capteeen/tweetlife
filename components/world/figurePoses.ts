import { lift, rot, type Rig } from './figureMoves';
import { playerVehicle } from './vehicleState';

// Poses for using furniture: sitting on a chair or sofa, sitting on the floor in front of the TV, lying in bed,
// and standing at a piece (bucket, fridge, generator...). A pose is a base for the legs and hips plus an
// animation for the upper body, and blends in by `w` like the everyday moves.
// Riding uses the same machinery: astride a bike saddle with the feet on the turning pedals, standing on a
// scooter deck, and sitting in a car or bus with the hands on the wheel, on the lap, or on the phone.

export type PoseBase = 'chair' | 'floor' | 'stand' | 'lie' | 'saddle' | 'deck';
export type PoseUpper =
  | 'idle' | 'relax' | 'phone' | 'eat' | 'watch' | 'cheer' | 'game' | 'sleep' | 'nap'
  | 'bath' | 'shower' | 'drink' | 'read' | 'write' | 'cool' | 'pull' | 'admire'
  | 'bars' | 'wheel' | 'ride';

export type HomePose = {
  base: PoseBase;
  upper: PoseUpper;
  /** seat or mattress height under the figure (0 for the floor); for the saddle, the hip height */
  seat: number;
  /** saddle only: the bottom bracket (y, z) and crank length in the figure's own units; the crank angle is
   *  read from playerVehicle.pedal so the feet stay on the pedals */
  pedal?: { y: number; z: number; r: number };
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
  BASES[pose.base](r, pose.seat, t, w, pose);
  UPPERS[pose.upper](r, t, w, pose.base);
  if (pose.upper === 'sleep' || pose.upper === 'nap') for (const e of r.eyes) if (e) e.scale.y += (0.12 - e.scale.y) * w;
}

const BASES: Record<PoseBase, (r: Rig, seat: number, t: number, w: number, pose: HomePose) => void> = {
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
  // hips on the saddle, each foot on its pedal: a two-bone reach from the hip to the pedal as the crank turns
  saddle(r, seat, _t, w, pose) {
    lift(r.body, seat - r.hipY, w);
    rot(r.body, 'y', 0, w);
    const p = pose.pedal;
    if (!p) return;
    const a = r.hipY * 0.5, b = r.hipY * 0.5 - 0.02;
    for (const [leg, knee, side] of LEGS(r)) {
      // the leg on -x pushes the right-hand pedal, half a turn from the left one
      const ang = playerVehicle.pedal + (side < 0 ? Math.PI : 0);
      // the ankle sits a little above and behind the pedal axle
      const dy = p.y + Math.cos(ang) * p.r + 0.07 - seat, dz = p.z + Math.sin(ang) * p.r - 0.05;
      const L = Math.min(a + b - 0.002, Math.max(0.1, Math.hypot(dy, dz)));
      const toFoot = Math.atan2(-dz, -dy);
      const hipBend = Math.acos(Math.min(1, (a * a + L * L - b * b) / (2 * a * L)));
      const kneeBend = Math.PI - Math.acos(Math.max(-1, Math.min(1, (a * a + b * b - L * L) / (2 * a * b))));
      rot(leg, 'x', toFoot - hipBend, w);
      rot(leg, 'z', side * 0.1, w);
      rot(knee, 'x', kneeBend, w);
    }
  },
  // standing on the scooter deck, front foot forward, back foot behind, knees soft and bobbing with the road
  deck(r, seat, t, w) {
    const bob = Math.sin(t * 7) * 0.012;
    lift(r.body, seat + bob - 0.02, w);
    rot(r.body, 'y', 0, w);
    rot(r.rLeg, 'x', -0.14, w);
    rot(r.rKnee, 'x', 0.18, w);
    rot(r.lLeg, 'x', 0.3, w);
    rot(r.lKnee, 'x', 0.3, w);
    rot(r.lLeg, 'z', -0.04, w);
    rot(r.rLeg, 'z', 0.04, w);
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
  // hands on the handlebars: leaning in over a bike, upright on a scooter
  bars(r, t, w, base) {
    const bike = base === 'saddle';
    rot(r.chest, 'x', bike ? 0.36 : 0.12, w);
    rot(r.head, 'x', bike ? -0.32 : 0.02, w);
    rot(r.head, 'y', 0.12 * Math.sin(t * 0.35), w);
    for (const [arm, elbow, side] of ARMS(r)) {
      rot(arm, 'x', bike ? -0.82 : -0.95, w);
      rot(arm, 'z', side * (bike ? 0.2 : 0.22), w);
      rot(elbow, 'x', bike ? -0.5 : -0.3, w);
    }
  },
  // both hands on the steering wheel, easing it through the bends
  wheel(r, t, w) {
    const steer = 0.06 * Math.sin(t * 0.6) + 0.03 * Math.sin(t * 1.7);
    rot(r.chest, 'x', -0.06, w);
    rot(r.head, 'y', 0.15 * Math.sin(t * 0.25), w);
    for (const [arm, elbow, side] of ARMS(r)) {
      rot(arm, 'x', -1.0 - side * steer, w);
      rot(arm, 'z', side * -0.08, w);
      rot(elbow, 'x', -0.85, w);
    }
  },
  // a passenger: hands on the lap, watching the city go by out of the window on their right
  ride(r, t, w) {
    rot(r.chest, 'x', -0.08, w);
    rot(r.head, 'y', -0.55 + 0.35 * Math.sin(t * 0.3), w);
    rot(r.head, 'x', 0.05 * Math.sin(t * 0.9), w);
    for (const [arm, elbow, side] of ARMS(r)) {
      rot(arm, 'x', -0.5, w);
      rot(arm, 'z', side * 0.1, w);
      rot(elbow, 'x', -0.7, w);
    }
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
