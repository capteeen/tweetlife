import { SLOTS, type Furniture, type FurnitureAction } from '@/lib/life/home';
import type { HomePose, PoseUpper } from '@/components/world/figurePoses';

// Where the avatar goes to use a piece and what it does there: sit on the chair, lie on the bed with the head on
// the pillow, sit on the floor in front of the TV... Spots are in the piece's own frame (centred, facing +z, as
// Furniture.tsx models it) and turned into room coordinates by its slot.

type Spot = {
  /** where the figure's feet go (for lying: the heels, with the head toward the figure's back) */
  x: number;
  z: number;
  /** which way the figure faces, in the piece's frame (0 = the piece's front, +z) */
  facing: number;
  /** where it walks to before settling in */
  approach: { x: number; z: number };
  pose: HomePose;
};

const UPPER: Record<string, PoseUpper> = {
  // by action id
  sit: 'idle', relax: 'relax', chill: 'relax', gist: 'phone', nap: 'nap', sleep: 'sleep', bath: 'bath', hot: 'shower',
  plan: 'write', read: 'read', cool: 'cool', drink: 'drink', malta: 'drink', jollof: 'eat', eat: 'eat', nollywood: 'watch',
  match: 'cheer', fifa: 'game', friend: 'game', fuel: 'pull', admire: 'admire',
};

function spotIn(item: Furniture, action: FurnitureAction): Spot {
  const upper = UPPER[action.id] ?? (action.pose === 'sit' ? 'idle' : 'admire');
  const front = (z: number, approach = z + 0.9): Spot => ({ x: 0, z, facing: Math.PI, approach: { x: 0, z: approach }, pose: { base: 'stand', upper, seat: 0 } });
  const bed = (seat: number, heels: number): Spot => ({ x: 0, z: heels, facing: 0, approach: { x: 0, z: 2.3 }, pose: { base: 'lie', upper, seat } });
  switch (item.model) {
    case 'chair':
      return { x: 0, z: 0.02, facing: 0, approach: { x: 0, z: 0.9 }, pose: { base: 'chair', upper, seat: 0.49 } };
    case 'sofa':
      return action.pose === 'lie'
        ? { x: 1.2, z: 0.15, facing: Math.PI / 2, approach: { x: 0.9, z: 1.3 }, pose: { base: 'lie', upper, seat: 0.65 } }
        : { x: -0.55, z: 0.12, facing: 0, approach: { x: -0.55, z: 1.3 }, pose: { base: 'chair', upper, seat: 0.65 } };
    case 'mattress':
      return bed(0.3, 0.7);
    case 'bedframe':
      return bed(0.7, 0.75);
    case 'kingbed':
      return bed(0.83, 0.75);
    case 'dining':
      return { x: 0.6, z: 1.06, facing: Math.PI, approach: { x: 0.6, z: 1.9 }, pose: { base: 'chair', upper, seat: 0.48 } };
    case 'tv':
      return { x: 0, z: 2.6, facing: Math.PI, approach: { x: 0, z: 2.9 }, pose: { base: 'floor', upper, seat: 0 } };
    case 'console':
      return { x: 0, z: 1.5, facing: Math.PI, approach: { x: 0, z: 1.9 }, pose: { base: 'floor', upper, seat: 0 } };
    case 'shower':
      return { x: 0.1, z: 0.15, facing: 0, approach: { x: 0.1, z: 1.4 }, pose: { base: 'stand', upper, seat: 0.12 } };
    case 'bucket':
      return front(0.75);
    case 'table':
      return front(0.85);
    case 'cooler':
      return front(0.95);
    case 'fridge':
      return front(1.2);
    case 'fan':
      return front(0.95);
    default: {
      // stand at the slot's use point, facing the piece
      const s = SLOTS[item.slot];
      const dx = s.use.x - s.x, dz = s.use.z - s.z;
      const c = Math.cos(-s.rot), n = Math.sin(-s.rot);
      const x = dx * c + dz * n, z = -dx * n + dz * c;
      return { x, z, facing: Math.atan2(-x, -z), approach: { x, z }, pose: { base: 'stand', upper, seat: 0 } };
    }
  }
}

export type Placement = { x: number; z: number; facing: number; approach: { x: number; z: number }; pose: HomePose };

/** The spot for an action, in room coordinates. */
export function placementFor(item: Furniture, action: FurnitureAction): Placement {
  const s = SLOTS[item.slot];
  const sp = spotIn(item, action);
  const c = Math.cos(s.rot), n = Math.sin(s.rot);
  const toRoom = (x: number, z: number) => ({ x: s.x + x * c + z * n, z: s.z - x * n + z * c });
  const at = toRoom(sp.x, sp.z);
  return { ...at, facing: s.rot + sp.facing, approach: toRoom(sp.approach.x, sp.approach.z), pose: sp.pose };
}
