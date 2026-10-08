import type { Stats } from './stats';

// Everyday things you can do anywhere on foot, in the city or at home: dance, stretch, sit and rest, push-ups,
// a selfie. Same shape as a furniture action (a duration, what it does to Vibes / Clout / Gas), plus a cooldown so
// resting can't be farmed. Walking costs gas by distance; sleeping (the bed at home) is how you get it back.

export type ActivityId = 'dance' | 'stretch' | 'rest' | 'pushups' | 'selfie' | CrimeMove;
/** moves that come from crime and police (lib/life/crimeRules.ts), never started from the activities menu */
export type CrimeMove = 'fight' | 'dazed' | 'cuffed' | 'pickpocket';

export type Activity = {
  id: ActivityId;
  label: string;
  emoji: string;
  /** how long the avatar is busy doing it */
  seconds: number;
  /** seconds before it can be done again (counted from the start) */
  cooldown: number;
  me: Partial<Stats>;
  line: string;
};

export const ACTIVITIES: Activity[] = [
  { id: 'dance', label: 'Dance', emoji: '💃', seconds: 12, cooldown: 20, me: { vibes: +8, clout: +1, gas: -5 }, line: 'is dancing' },
  { id: 'stretch', label: 'Stretch', emoji: '🙆', seconds: 8, cooldown: 60, me: { gas: +3, vibes: +1 }, line: 'is stretching' },
  { id: 'rest', label: 'Sit & catch your breath', emoji: '🧘', seconds: 20, cooldown: 120, me: { gas: +6 }, line: 'is catching their breath' },
  { id: 'pushups', label: 'Do push-ups', emoji: '💪', seconds: 10, cooldown: 30, me: { gas: -6, clout: +2, vibes: +2 }, line: 'is doing push-ups' },
  { id: 'selfie', label: 'Take a selfie', emoji: '🤳', seconds: 6, cooldown: 120, me: { clout: +4, vibes: +1 }, line: 'is taking a selfie' },
];

export const activityById = (id: string) => ACTIVITIES.find((a) => a.id === id) ?? null;

// ----- walking -----
// Gas per distance on foot (world units; walking pace is 9 a second). Riding a vehicle costs nothing, which is
// what the car is for. Sprinting (Shift) is faster and burns three times the gas.

export const WALK_PER_GAS = 90;
export const SPRINT_PER_GAS = 30;
export const SPRINT_MULT = 1.6;
/** the most one walk report can cost, whatever the client claims */
export const WALK_REPORT_CAP = 10;

export const walkCost = (walked: number, sprinted: number) => walked / WALK_PER_GAS + sprinted / SPRINT_PER_GAS;

// ----- tiredness -----
// Below TIRED gas you slow down and slouch; at zero you shuffle and cannot sprint, dance or do push-ups.

export const TIRED = 25;
export const SPRINT_MIN_GAS = 10;

/** 0 = fresh, 1 = running on empty */
export const tiredness = (gas: number) => Math.max(0, Math.min(1, (TIRED - gas) / TIRED));

/** walking speed multiplier for a gas level: full speed above TIRED, down to 55% at empty */
export const paceFor = (gas: number) => 1 - 0.45 * tiredness(gas);
