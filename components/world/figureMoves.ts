import type * as THREE from 'three';

// Everyday moves for the Figure, layered over its walk cycle: dancing, stretching, sitting on the ground,
// push-ups, a selfie, and the slouch of a tired player. The walk cycle sets each joint first; these blend from
// there toward a pose by `w` (0..1) so moves ease in and out. Kept apart from Figure.tsx so other animation
// work (props in the hand, balloons) can change the figure without touching these.

export type FigureAct = 'dance' | 'stretch' | 'rest' | 'pushups' | 'selfie' | 'cheer' | 'fight' | 'dazed' | 'cuffed' | 'pickpocket' | WorkAct;
/** On-shift moves for jobs (lib/life/jobs.ts): typing at a desk, pouring drinks, coaching, marshalling jets, examining. */
export type WorkAct = 'type' | 'pour' | 'coach' | 'marshal' | 'examine';

export type Rig = {
  body: THREE.Group | null;
  chest: THREE.Group | null;
  head: THREE.Group | null;
  lArm: THREE.Group | null;
  rArm: THREE.Group | null;
  lElbow: THREE.Group | null;
  rElbow: THREE.Group | null;
  lLeg: THREE.Group | null;
  rLeg: THREE.Group | null;
  lKnee: THREE.Group | null;
  rKnee: THREE.Group | null;
  /** the phone in the right hand, shown for the selfie */
  phone: THREE.Object3D | null;
  /** both eyes (whites + irises), squashed to close them */
  eyes: (THREE.Object3D | null)[];
  hipY: number;
};

type Axis = 'x' | 'y' | 'z';
export const rot = (o: THREE.Object3D | null, a: Axis, target: number, w: number) => {
  if (o) o.rotation[a] += (target - o.rotation[a]) * w;
};
export const lift = (o: THREE.Object3D | null, target: number, w: number) => {
  if (o) o.position.y += (target - o.position.y) * w;
};

/** Zero the joints the walk cycle never sets, so a finished move doesn't leave a limb stuck. */
export function settle(r: Rig) {
  for (const o of [r.body, r.chest, r.head]) if (o) (o.rotation.x = 0), (o.rotation.z = 0);
  for (const o of [r.lLeg, r.rLeg, r.lElbow, r.rElbow]) if (o) o.rotation.z = 0;
  if (r.phone) r.phone.visible = false;
  for (const e of r.eyes) if (e) e.scale.y = 1;
}

/** Slouch, droop the head, let the arms hang. `k` 0..1 from lib/life/activities `tiredness`. */
export function applyTired(r: Rig, k: number, t: number) {
  if (k <= 0) return;
  rot(r.chest, 'x', 0.2, k);
  rot(r.head, 'x', 0.32 + Math.sin(t * 0.7) * 0.05, k);
  rot(r.lArm, 'z', -0.02, k);
  rot(r.rArm, 'z', 0.02, k);
  // heavy, slow breaths
  if (r.chest) r.chest.scale.setScalar(1 + Math.sin(t * 1.4) * 0.02 * k);
}

/** Blend toward `act` at time `t` (seconds since it began) by weight `w`. */
export function poseActivity(r: Rig, act: FigureAct, t: number, w: number) {
  if (w <= 0) return;
  // a move this build doesn't know (an older client watching a newer one) just plays nothing
  MOVES[act]?.(r, t, w);
}

const smooth = (x: number) => x * x * (3 - 2 * x);

const MOVES: Record<FigureAct, (r: Rig, t: number, w: number) => void> = {
  // An afrobeats groove at ~120bpm: dip on every beat, hips sway, and the arms drift between "raise the roof"
  // and a rolling shoulder wave.
  dance(r, t, w) {
    const beat = t * Math.PI * 4;
    const dip = 1 - Math.abs(Math.sin(beat * 0.5));
    const m = smooth(0.5 + 0.5 * Math.sin(t * 1.25)); // 0 = arms up, 1 = rolling arms
    lift(r.body, -0.07 * dip, w);
    rot(r.body, 'z', 0.1 * Math.sin(beat * 0.5), w);
    rot(r.body, 'y', 0.35 * Math.sin(beat * 0.25), w);
    for (const [leg, knee, side] of [[r.lLeg, r.lKnee, -1], [r.rLeg, r.rKnee, 1]] as const) {
      rot(leg, 'x', -0.25 * dip, w);
      rot(knee, 'x', 0.5 * dip, w);
      rot(leg, 'z', side * 0.06, w);
    }
    rot(r.chest, 'x', 0.06 + 0.04 * dip, w);
    rot(r.head, 'x', 0.15 * Math.sin(beat), w);
    for (const [arm, elbow, side] of [[r.lArm, r.lElbow, -1], [r.rArm, r.rElbow, 1]] as const) {
      const pump = 0.5 + 0.5 * Math.sin(beat + (side > 0 ? Math.PI : 0));
      const upX = -2.5 - 0.25 * pump, upE = -0.5 - 0.6 * pump;
      const rollX = -0.7 + 0.55 * Math.sin(beat * 0.5 + (side > 0 ? Math.PI : 0)), rollE = -1.5;
      rot(arm, 'x', upX + (rollX - upX) * m, w);
      rot(arm, 'z', side * (0.25 + 0.15 * m), w);
      rot(elbow, 'x', upE + (rollE - upE) * m, w);
    }
  },

  // Arms overhead, reaching side to side, up on the toes.
  stretch(r, t, w) {
    const sway = Math.sin(t * 1.3);
    lift(r.body, 0.03, w);
    rot(r.body, 'z', 0.22 * sway, w);
    rot(r.head, 'x', -0.25, w);
    for (const [arm, elbow, side] of [[r.lArm, r.lElbow, -1], [r.rArm, r.rElbow, 1]] as const) {
      rot(arm, 'x', -2.95, w);
      rot(arm, 'z', side * -0.12, w);
      rot(elbow, 'x', -0.15, w);
    }
  },

  // Sitting on the ground, legs out, leaning back on the hands.
  rest(r, t, w) {
    lift(r.body, -r.hipY + 0.13, w);
    rot(r.chest, 'x', -0.22, w);
    rot(r.head, 'x', -0.1 + Math.sin(t * 0.5) * 0.06, w);
    for (const [leg, knee, side] of [[r.lLeg, r.lKnee, -1], [r.rLeg, r.rKnee, 1]] as const) {
      rot(leg, 'x', -1.45, w);
      rot(knee, 'x', 0.28, w);
      rot(leg, 'z', side * 0.08, w);
    }
    for (const [arm, elbow, side] of [[r.lArm, r.lElbow, -1], [r.rArm, r.rElbow, 1]] as const) {
      rot(arm, 'x', 0.55, w);
      rot(arm, 'z', side * 0.3, w);
      rot(elbow, 'x', 0, w);
    }
  },

  // Tipped forward over the toes into a plank; the arms stay vertical while the elbows bend on each rep.
  pushups(r, t, w) {
    const down = 0.5 - 0.5 * Math.cos((t * Math.PI * 2) / 1.6);
    const tilt = 1.12 + 0.24 * down;
    rot(r.body, 'x', tilt, w);
    lift(r.body, 0.04, w);
    rot(r.body, 'y', 0, w);
    rot(r.head, 'x', -0.35, w);
    for (const [leg, knee] of [[r.lLeg, r.lKnee], [r.rLeg, r.rKnee]] as const) {
      rot(leg, 'x', 0, w);
      rot(knee, 'x', 0, w);
    }
    for (const [arm, elbow, side] of [[r.lArm, r.lElbow, -1], [r.rArm, r.rElbow, 1]] as const) {
      rot(arm, 'x', -tilt + 0.95 * down, w);
      rot(arm, 'z', side * 0.18, w);
      rot(elbow, 'x', -1.6 * down, w);
    }
  },

  // A fan's cheer: little hops, both arms up waving overhead, head up. Each figure's own `t` keeps a crowd out of step.
  cheer(r, t, w) {
    const hop = Math.max(0, Math.sin(t * Math.PI * 3.2));
    lift(r.body, 0.07 * hop, w);
    rot(r.body, 'z', 0.05 * Math.sin(t * 2.1), w);
    rot(r.head, 'x', -0.22, w);
    for (const [leg, knee] of [[r.lLeg, r.lKnee], [r.rLeg, r.rKnee]] as const) {
      rot(leg, 'x', -0.12 * (1 - hop), w);
      rot(knee, 'x', 0.25 * (1 - hop), w);
    }
    for (const [arm, elbow, side] of [[r.lArm, r.lElbow, -1], [r.rArm, r.rElbow, 1]] as const) {
      const wave = Math.sin(t * 7 + (side > 0 ? 0 : 1.4));
      rot(arm, 'x', -2.75, w);
      rot(arm, 'z', side * (0.35 + 0.18 * wave), w);
      rot(elbow, 'x', -0.2 - 0.2 * wave, w);
    }
  },

  // Squared up and swinging (lib/life/crimeRules.ts): guard up, bouncing, a jab then a hook, over and over.
  fight(r, t, w) {
    const bounce = Math.abs(Math.sin(t * Math.PI * 2.4));
    const swing = (t * 2.6) % 2; // 0..1 left jab, 1..2 right hook
    const jab = swing < 1 ? Math.sin(swing * Math.PI) : 0;
    const hook = swing >= 1 ? Math.sin((swing - 1) * Math.PI) : 0;
    lift(r.body, -0.05 + 0.03 * bounce, w);
    rot(r.body, 'y', 0.35 * jab - 0.45 * hook, w);
    rot(r.chest, 'x', 0.12, w);
    rot(r.head, 'x', 0.12, w);
    for (const [leg, knee, side] of [[r.lLeg, r.lKnee, -1], [r.rLeg, r.rKnee, 1]] as const) {
      rot(leg, 'x', side < 0 ? -0.35 : 0.2, w);
      rot(knee, 'x', 0.35, w);
      rot(leg, 'z', side * 0.08, w);
    }
    // guard: fists by the chin; a punch throws the arm straight out
    rot(r.lArm, 'x', -1.3 - 0.35 * jab, w);
    rot(r.lArm, 'z', -0.25 + 0.15 * jab, w);
    rot(r.lElbow, 'x', -1.9 + 1.75 * jab, w);
    rot(r.rArm, 'x', -1.2 - 0.4 * hook, w);
    rot(r.rArm, 'z', 0.3 - 0.45 * hook, w);
    rot(r.rElbow, 'x', -2.0 + 1.2 * hook, w);
  },

  // Knocked down after losing a fight: sat on the ground, swaying, head lolling, eyes shut.
  dazed(r, t, w) {
    lift(r.body, -r.hipY + 0.13, w);
    rot(r.body, 'z', 0.12 * Math.sin(t * 1.6), w);
    rot(r.chest, 'x', 0.18, w);
    rot(r.head, 'x', 0.35 + 0.1 * Math.sin(t * 2.1), w);
    rot(r.head, 'z', 0.25 * Math.sin(t * 1.3), w);
    for (const e of r.eyes) if (e) e.scale.y += (0.12 - e.scale.y) * w;
    for (const [leg, knee, side] of [[r.lLeg, r.lKnee, -1], [r.rLeg, r.rKnee, 1]] as const) {
      rot(leg, 'x', -1.4, w);
      rot(knee, 'x', 0.5, w);
      rot(leg, 'z', side * 0.22, w);
    }
    for (const [arm, elbow, side] of [[r.lArm, r.lElbow, -1], [r.rArm, r.rElbow, 1]] as const) {
      rot(arm, 'x', 0.4, w);
      rot(arm, 'z', side * 0.45, w);
      rot(elbow, 'x', -0.3, w);
    }
  },

  // A pickpocket's dip: hunched in close, glancing about, the right hand slipping low into someone's pocket.
  pickpocket(r, t, w) {
    const dip = 0.5 + 0.5 * Math.sin(t * 5);
    lift(r.body, -0.06, w);
    rot(r.body, 'x', 0.22, w);
    rot(r.chest, 'x', 0.12, w);
    rot(r.head, 'y', 0.5 * Math.sin(t * 2.2), w);
    rot(r.head, 'x', -0.1, w);
    for (const [leg, knee] of [[r.lLeg, r.lKnee], [r.rLeg, r.rKnee]] as const) {
      rot(leg, 'x', -0.3, w);
      rot(knee, 'x', 0.45, w);
    }
    rot(r.rArm, 'x', -0.75 - 0.15 * dip, w);
    rot(r.rArm, 'z', -0.15, w);
    rot(r.rElbow, 'x', -0.25 - 0.3 * dip, w);
    rot(r.lArm, 'x', 0.2, w);
    rot(r.lArm, 'z', -0.15, w);
    rot(r.lElbow, 'x', -0.6, w);
  },

  // Hands cuffed behind the back, head down: being walked to the cell.
  cuffed(r, t, w) {
    rot(r.head, 'x', 0.3, w);
    rot(r.chest, 'x', 0.08, w);
    for (const [arm, elbow, side] of [[r.lArm, r.lElbow, -1], [r.rArm, r.rElbow, 1]] as const) {
      rot(arm, 'x', 0.55, w);
      rot(arm, 'z', side * -0.12, w);
      rot(elbow, 'x', -0.9, w);
    }
    rot(r.body, 'y', 0.04 * Math.sin(t * 2), w);
  },

  // Phone up in the right hand, head tilted toward it, the other hand on the hip; a new pose every 1.5s.
  selfie(r, t, w) {
    const snap = Math.floor(t / 1.5) % 3;
    if (r.phone) r.phone.visible = w > 0.5;
    rot(r.rArm, 'x', -1.85, w);
    rot(r.rArm, 'z', 0.4, w);
    rot(r.rElbow, 'x', -0.85, w);
    rot(r.lArm, 'x', snap === 2 ? -2.4 : 0.15, w); // the third pose throws up a peace sign
    rot(r.lArm, 'z', snap === 2 ? -0.3 : -0.5, w);
    rot(r.lElbow, 'x', snap === 2 ? -1.2 : -1.3, w);
    rot(r.head, 'y', 0.35, w);
    rot(r.head, 'z', snap === 1 ? 0.18 : -0.14, w);
    rot(r.body, 'z', snap === 1 ? -0.06 : 0.04, w);
  },

  // ---- work (lib/life/jobs.ts)

  // Standing at a desk or till: forearms out level, fingers tapping in turns, eyes on the screen; a glance up now and then.
  type(r, t, w) {
    const look = Math.sin(t * 0.35) > 0.85 ? 1 : 0;
    rot(r.head, 'x', 0.32 - 0.3 * look, w);
    rot(r.chest, 'x', 0.08, w);
    for (const [arm, elbow, side] of [[r.lArm, r.lElbow, -1], [r.rArm, r.rElbow, 1]] as const) {
      const tap = Math.max(0, Math.sin(t * 14 + (side > 0 ? 0 : Math.PI))) * 0.12;
      rot(arm, 'x', -0.38 - tap * 0.4, w);
      rot(arm, 'z', side * -0.14, w);
      rot(elbow, 'x', -1.15 + tap, w);
    }
  },

  // Behind the bar: hold the glass low in the left hand, pour from the right; every few seconds, shake a cocktail by the shoulder.
  pour(r, t, w) {
    const cycle = t % 6;
    const shaking = cycle > 4;
    rot(r.head, 'x', shaking ? 0.05 : 0.3, w);
    rot(r.lArm, 'x', shaking ? -1.6 : -0.75, w);
    rot(r.lArm, 'z', shaking ? 0.35 : 0.1, w);
    rot(r.lElbow, 'x', shaking ? -1.6 : -0.9, w);
    if (shaking) {
      const sh = Math.sin(t * 22) * 0.25;
      rot(r.rArm, 'x', -1.7 + sh, w);
      rot(r.rArm, 'z', -0.35, w);
      rot(r.rElbow, 'x', -1.7 - sh, w);
    } else {
      const tip = smooth(Math.min(1, cycle / 1.2));
      rot(r.rArm, 'x', -1.25, w);
      rot(r.rArm, 'z', -0.2 - 0.3 * tip, w);
      rot(r.rElbow, 'x', -0.6, w);
    }
  },

  // A trainer counting reps: clap on the beat, then point and call it out, weight shifting foot to foot.
  coach(r, t, w) {
    const beat = t * Math.PI * 2 * 0.9;
    const phase = Math.floor(t / 2.2) % 2; // 0 = clapping, 1 = pointing
    rot(r.body, 'z', 0.05 * Math.sin(beat * 0.5), w);
    rot(r.head, 'x', 0.12 + 0.06 * Math.sin(beat), w);
    if (phase === 0) {
      const clap = 0.5 + 0.5 * Math.sin(beat * 2);
      for (const [arm, elbow, side] of [[r.lArm, r.lElbow, -1], [r.rArm, r.rElbow, 1]] as const) {
        rot(arm, 'x', -1.2, w);
        rot(arm, 'z', side * (0.15 - 0.3 * clap), w);
        rot(elbow, 'x', -0.9, w);
      }
    } else {
      rot(r.rArm, 'x', -1.5, w);
      rot(r.rArm, 'z', 0.1, w);
      rot(r.rElbow, 'x', -0.15, w);
      rot(r.lArm, 'x', 0.1, w);
      rot(r.lArm, 'z', -0.55, w);
      rot(r.lElbow, 'x', -1.4, w); // hand on the hip
    }
  },

  // Ground crew bringing a jet in: both arms up, waving forward together.
  marshal(r, t, w) {
    const wave = Math.sin(t * Math.PI * 1.6);
    rot(r.head, 'x', -0.12, w);
    for (const [arm, elbow, side] of [[r.lArm, r.lElbow, -1], [r.rArm, r.rElbow, 1]] as const) {
      rot(arm, 'x', -2.6 + 0.25 * wave, w);
      rot(arm, 'z', side * -0.2, w);
      rot(elbow, 'x', -0.9 - 0.7 * (0.5 + 0.5 * wave), w);
    }
  },

  // A doctor at the bedside: lean in, one hand on the clipboard, the other checking the patient; then stand and write.
  examine(r, t, w) {
    const phase = t % 7;
    const lean = phase < 4 ? smooth(Math.min(1, phase / 0.8)) : 1 - smooth(Math.min(1, (phase - 4) / 0.8));
    rot(r.chest, 'x', 0.1 + 0.35 * lean, w);
    rot(r.head, 'x', 0.25 + 0.15 * lean, w);
    rot(r.lArm, 'x', -0.9, w);
    rot(r.lArm, 'z', 0.15, w);
    rot(r.lElbow, 'x', -1.3, w); // the clipboard
    if (lean > 0.5) {
      rot(r.rArm, 'x', -0.9 - 0.08 * Math.sin(t * 3), w);
      rot(r.rArm, 'z', 0.05, w);
      rot(r.rElbow, 'x', -0.3, w);
    } else {
      rot(r.rArm, 'x', -0.7, w);
      rot(r.rArm, 'z', -0.25, w);
      rot(r.rElbow, 'x', -1.4 + 0.1 * Math.sin(t * 9), w); // writing
    }
  },
};
