// Plain mutable state the game writes every frame and the sound code reads every frame. No React, no store
// updates, so writing it costs nothing.

/** The player, as the movement code last saw them. */
export const playerSound = {
  x: 0,
  y: 0,
  z: 0,
  /** 0..1 how hard they are pushing the stick (what the walk animation uses) */
  speed: 0,
  sprint: false,
  /** 0..1 */
  tired: 0,
  /** walking on their own feet (not riding anything, not on a ride) */
  onFoot: true,
  /** set by pages without a city (the house) */
  surface: null as null | 'tile' | 'wood' | 'carpet',
  at: 0,
};

export type TrafficCar = { x: number; z: number; speed: number; big?: boolean };
/** Every moving vehicle in the city, by group, for engine sounds and passing whooshes. */
export const traffic = new Map<string, () => Iterable<TrafficCar>>();

/** The airliner that takes off from the airport every 40s. */
export const planeSound = { x: 0, y: 0, z: 0, active: false, thrust: 0 };
