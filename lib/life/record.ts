import type { Player } from '@prisma/client';
import { wantedNow, type CrimeRecord } from './crimeRules';

// A player's criminal record as the client sees it, and whether a cell or a beating stops them doing things.
// Kept apart from lib/life/crime.ts so lib/life/player.ts can use it without pulling the whole crime module in.

const now = () => Date.now();

export function recordView(p: Player): CrimeRecord {
  const jailed = p.jailedUntil && p.jailedUntil.getTime() > now();
  const dazed = p.dazedUntil && p.dazedUntil.getTime() > now();
  return {
    wanted: wantedNow(p.wanted, p.wantedAt),
    priors: p.priors,
    jailedUntil: jailed ? p.jailedUntil!.toISOString() : null,
    bail: jailed ? p.bail : 0,
    jailFor: jailed ? p.status : null,
    dazedUntil: dazed ? p.dazedUntil!.toISOString() : null,
    peaceful: p.peaceful,
    peacefulLockUntil: p.peacefulLockUntil && p.peacefulLockUntil.getTime() > now() ? p.peacefulLockUntil.toISOString() : null,
  };
}

/** Why this player can't move around town right now (in a cell, or dazed), or null. */
export function lockedReason(p: Pick<Player, 'jailedUntil' | 'dazedUntil'>): string | null {
  if (p.jailedUntil && p.jailedUntil.getTime() > now()) return "You're in a cell. Wait it out or post bail.";
  if (p.dazedUntil && p.dazedUntil.getTime() > now()) return "You're still seeing stars. Give it a few seconds.";
  return null;
}
