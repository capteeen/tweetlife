// Crime and police: the numbers. Pure and shared (the client imports these to label buttons and run the cell
// timer); every roll and every bag that moves happens on the server (app/api/life/crime, lib/life/crime.ts).
// Only bags can be stolen. The real Solana wallet is never part of this.

// ---- steal (pickpocket)
/** share of the victim's bags a successful lift takes */
export const STEAL_SHARE = 0.05;
export const STEAL_MIN = 20;
export const STEAL_MAX = 500;
/** victims holding less than this have nothing worth lifting */
export const STEAL_FLOOR = 200;
/** from an AI resident: their pocket money, never more than this */
export const STEAL_RESIDENT_MAX = 150;
export const STEAL_BASE_CHANCE = 0.6;
/** every wanted star makes you easier to spot */
export const STEAL_STAR_PENALTY = 0.1;
export const STEAL_MIN_CHANCE = 0.15;
/** caught red-handed: clout lost */
export const CAUGHT_CLOUT = -5;

export const stealAmount = (victimBags: number, resident = false) =>
  Math.max(STEAL_MIN, Math.min(resident ? STEAL_RESIDENT_MAX : STEAL_MAX, Math.floor(victimBags * STEAL_SHARE)));
export const stealChance = (wanted: number) => Math.max(STEAL_MIN_CHANCE, STEAL_BASE_CHANCE - STEAL_STAR_PENALTY * wanted);

// ---- fight (nobody dies: the loser is dazed for a bit)
export const FIGHT_GAS = 10; // both sides
export const FIGHT_LUCK = 40; // each side rolls 0..FIGHT_LUCK on top of their power
export const FIGHT_MIN_GAS = 15; // too tired to throw hands below this
export const FIGHT_WIN = { clout: +5, vibes: +3 };
export const FIGHT_LOSE = { clout: -8, gas: -15 };
export const DAZED_SECONDS = 30;
/** how long the swing plays on both avatars before the loser drops */
export const FIGHT_SECONDS = 4;
export const fightPower = (s: { gas: number; clout: number }) => s.gas + s.clout / 2;
/** stats an AI resident fights with */
export const RESIDENT_FIGHTER = { gas: 60, clout: 50 };

// ---- the victim's side
/** minutes the victim has to call the police or file a complaint */
export const REPORT_WINDOW_MIN = 15;
/** caught in the act: the police take your word for it */
export const ARREST_CAUGHT = 1;
export const ARREST_BASE = 0.7;
export const ARREST_PER_STAR = 0.1;
export const arrestChance = (outcome: string, wanted: number) => (outcome === 'caught' ? ARREST_CAUGHT : Math.min(1, ARREST_BASE + ARREST_PER_STAR * wanted));
/** stars at which a complaint turns into a warrant and an arrest */
export const WARRANT_STARS = 3;
/** an AI resident who gets robbed or hit calls the cops this often */
export const RESIDENT_CALLS_POLICE = 0.5;
/** when a resident lifts from you and you call it in, an officer catches them this often */
export const RESIDENT_CAUGHT = 0.8;

// ---- record
export const MAX_STARS = 5;
export const STAR_DECAY_MIN = 30;
/** wanted stars right now: one drops off for every STAR_DECAY_MIN clean minutes since they last went up */
export function wantedNow(wanted: number, wantedAt: Date | string | null, now = Date.now()) {
  if (!wanted || !wantedAt) return 0;
  const gone = Math.floor((now - new Date(wantedAt).getTime()) / (STAR_DECAY_MIN * 60_000));
  return Math.max(0, Math.min(MAX_STARS, wanted - Math.max(0, gone)));
}
/** at this many stars AI residents go cold on you */
export const COLD_STARS = 2;

// ---- cell and bail
export const CELL_MIN = { steal: 3, fight: 2 } as const;
export const CELL_PER_PRIOR_MIN = 1;
export const CELL_MAX_MIN = 10;
export const BAIL_STEAL_MULT = 3;
export const BAIL_STEAL_MIN = 300;
export const BAIL_FIGHT = 500;
export const BAIL_PER_PRIOR = 0.5;
export const BAIL_MAX = 5000;

/** `priors` = arrests before this one */
export const cellSeconds = (kind: 'steal' | 'fight', priors: number) => Math.min(CELL_MAX_MIN, CELL_MIN[kind] + CELL_PER_PRIOR_MIN * priors) * 60;
/** `country`: the national bail rule where you were arrested (lib/life/government.ts rules.bail) */
export function bailFor(kind: 'steal' | 'fight', amount: number, priors: number, country = 1) {
  const base = kind === 'steal' ? Math.max(BAIL_STEAL_MIN, amount * BAIL_STEAL_MULT) : BAIL_FIGHT;
  return Math.min(BAIL_MAX, Math.round(base * (1 + BAIL_PER_PRIOR * priors) * country));
}

// ---- limits, so nobody gets farmed or griefed
export const CRIME_COOLDOWN_S = 120;
export const DAILY_STEALS = 5;
export const DAILY_FIGHTS = 5;
/** the same offender can hit the same person once in this many hours */
export const SAME_TARGET_HOURS = 6;
/** nobody gets robbed (or jumped) more than this many times a day */
export const VICTIM_DAILY = 3;
/** fresh players can't be touched, and can't commit crime, for this long */
export const NEW_PLAYER_MIN = 60;
/** Peaceful mode stays on at least this long once switched on */
export const PEACEFUL_LOCK_H = 24;
/** how close you must be: arm's reach to another player (with a little slack for movement between updates) */
export const REACH_PLAYER = 4;
/** residents walk on the wall clock; a little more slack */
export const REACH_RESIDENT = 12;

// ---- residents committing petty theft
export const NPC_THEFT_PER_DAY = 1;
export const NPC_THEFT_CHANCE = 0.15; // per check-in (the client checks in every few minutes while out in the city)
export const NPC_THEFT_MIN = 30;
export const NPC_THEFT_MAX = 150;
export const NPC_THEFT_CHECK_S = 180;

/** Places where crime can't happen. Homes are their own page, so nobody there is in reach anyway. */
export const SAFE_ZONES = ['home', 'airport', 'police'] as const;
export type SafeZone = (typeof SAFE_ZONES)[number];
export const SAFE_LABEL: Record<SafeZone, string> = { home: 'at home', airport: 'at the airport', police: 'at the police station' };

/** What the client needs about a player's record. */
export type CrimeRecord = {
  wanted: number;
  priors: number;
  /** ISO, while in a cell */
  jailedUntil: string | null;
  bail: number;
  jailFor: string | null;
  dazedUntil: string | null;
  peaceful: boolean;
  peacefulLockUntil: string | null;
};

export const stars = (n: number) => (n > 0 ? '★'.repeat(n) + '☆'.repeat(Math.max(0, MAX_STARS - n)) : '');
