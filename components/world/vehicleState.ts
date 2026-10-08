import type { CarModel } from './carModels';

// Live state of every vehicle, for anything that wants to react to it (engine and bell sounds, the HUD) without
// subscribing to React state. Written every frame by the player controller and the traffic, read whenever you like.
// Plain mutable objects: read the fields, never write them from outside.

/** What the player is on right now. `walk` when on foot. */
export type PlayerVehicleType = 'walk' | 'bike' | 'scooter' | 'bus' | 'taxi' | 'rideshare' | 'own' | 'car' | 'boat' | 'plane';

export const playerVehicle = {
  type: 'walk' as PlayerVehicleType,
  /** the model when the type is a car (own car, Market car, taxi, rideshare, bus) */
  model: null as CarModel | null,
  /** world units (metres) per second */
  speed: 0,
  /** slowing down or standing at a stop */
  braking: false,
  /** bus doors, 0 shut .. 1 open */
  doors: 0,
  /** bike crank angle in radians, so the rider's feet stay on the pedals */
  pedal: 0,
};

/** One car of the ambient traffic. The traffic registers its cars in `traffic` (lib/audio/state.ts) under 'grid'
 *  (grid and ring road together), and each of them carries these fields too. */
export type TrafficVehicle = {
  model: CarModel;
  x: number;
  z: number;
  /** heading in radians (0 = +z) */
  rot: number;
  /** world units per second */
  speed: number;
  braking: boolean;
  /** -1 left indicator, 1 right indicator, 0 none */
  signal: number;
};
