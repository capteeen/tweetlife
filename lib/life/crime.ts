import type { Player } from '@prisma/client';
import { db } from '../db';
import { redis } from '../redis';
import { env } from '../env';
import { loadWorldModelCached } from '../world/load';
import { placeVenues, type PlacedVenue } from './venues';
import { castFor, residentById, type Resident } from './residents';
import { loadCountryModel } from '../world/country';
import { COUNTRIES, isCountryId, type CountryId } from '../world/countries';
import { buildRoutes, poseAt } from '@/components/world/residentPaths';
import { safeZoneAt } from './police';
import { applyDelta, clamp } from './stats';
import { setStats } from './player';
import { GOVERNMENTS } from './government';
import { whereIs } from './flights';
import {
  CAUGHT_CLOUT, CRIME_COOLDOWN_S, DAILY_FIGHTS, DAILY_STEALS, DAZED_SECONDS, FIGHT_GAS, FIGHT_LOSE, FIGHT_LUCK, FIGHT_MIN_GAS,
  FIGHT_SECONDS, FIGHT_WIN, MAX_STARS, NEW_PLAYER_MIN, NPC_THEFT_CHANCE, NPC_THEFT_MAX, NPC_THEFT_MIN, PEACEFUL_LOCK_H,
  REACH_PLAYER, REACH_RESIDENT, REPORT_WINDOW_MIN, RESIDENT_CALLS_POLICE, RESIDENT_CAUGHT, RESIDENT_FIGHTER, SAFE_LABEL,
  SAME_TARGET_HOURS, STEAL_FLOOR, VICTIM_DAILY, WARRANT_STARS, arrestChance, bailFor, cellSeconds, fightPower, stealAmount,
  stealChance, wantedNow, type SafeZone,
} from './crimeRules';

// Crime and police on the server: steals, fights, reports, arrests, bail. Everything is decided here: the
// client says who and where (which world), never how much, whether it worked, or how close it was. Positions
// come from the presence room (party/world.ts), resident positions from their wall-clock routes.
// Only bags move. The real Solana wallet is never touched.

export class CrimeError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const now = () => Date.now();
export { recordView } from './record';
const dayStart = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

/** One more star, on top of what has already decayed. */
const addStar = (p: Player, n = 1) => ({ wanted: Math.min(MAX_STARS, wantedNow(p.wanted, p.wantedAt) + n), wantedAt: new Date() });

// ---------------------------------------------------------------------------------------------------------------
// where everyone is

/** Live positions of these visitors from the world's presence room (and its mirrors). Null when presence is off. */
export async function presencePositions(room: string, ids: string[]): Promise<Record<string, { x: number; z: number }> | null> {
  const e = env();
  if (!e.NEXT_PUBLIC_PARTYKIT_HOST || !e.PRESENCE_SECRET) return null;
  const host = e.NEXT_PUBLIC_PARTYKIT_HOST.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const proto = /^(localhost|127\.|0\.0\.0\.0)/.test(host) ? 'http' : 'https';
  const out: Record<string, { x: number; z: number }> = {};
  const ask = async (r: string) => {
    // the room id goes in the path as is: PartyKit reads `country%3Abnb` as a different room
    const res = await fetch(`${proto}://${host}/parties/world/${r}?who=${ids.map(encodeURIComponent).join(',')}`, {
      headers: { 'x-presence-secret': e.PRESENCE_SECRET! },
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    }).catch(() => null);
    if (!res?.ok) return null;
    const j = (await res.json().catch(() => null)) as { positions?: Record<string, { x: number; z: number }>; shards?: string[] } | null;
    Object.assign(out, j?.positions ?? {});
    return j;
  };
  // a country's base room lists its shards (party/world.ts); a legacy world has mirrors :2 and :3
  const first = await ask(room);
  const more = room.startsWith('country:') ? first?.shards ?? [] : [`${room}:2`, `${room}:3`];
  for (const r of more) {
    if (ids.every((id) => out[id])) break;
    if (!(await ask(r)) && !room.startsWith('country:')) break;
  }
  return out;
}

/**
 * Where a crime happens. `room` is the presence room the client is in: a country's shared room (`country:bnb`,
 * everyone in BNB together on one map) or, for older clients, a single world (`<handle>`). The venues and
 * residents are placed on that room's map exactly as the scene places them.
 */
type WorldCtx = { id: string; room: string; country: CountryId; venues: PlacedVenue[]; cast: Resident[]; contentRadius: number; boundaryRadius: number };

async function worldCtx(key: string, me: Player): Promise<WorldCtx> {
  const here = whereIs(me);
  if (key.startsWith('country:')) {
    const id = key.slice('country:'.length);
    if (!isCountryId(id)) throw new CrimeError('No such country.', 404);
    // you can only make trouble in the country you are actually in
    if (id !== here) throw new CrimeError(`You're not in ${COUNTRIES[id].name} right now.`, 403);
    const g = (await loadCountryModel(id)).geometry;
    return { id: key, room: key, country: id, venues: placeVenues(g.contentRadius, g.boundaryRadius, id), cast: castFor(id), contentRadius: g.contentRadius, boundaryRadius: g.boundaryRadius };
  }
  const m = await loadWorldModelCached(key.replace(/^(world:)?@?/, ''));
  if (!m) throw new CrimeError('No world here.', 404);
  const g = m.geometry;
  return { id: m.id, room: `world:${m.handle.toLowerCase()}`, country: here, venues: placeVenues(g.contentRadius, g.boundaryRadius, here), cast: castFor(here), contentRadius: g.contentRadius, boundaryRadius: g.boundaryRadius };
}

function residentAt(w: WorldCtx, r: Resident) {
  const i = w.cast.indexOf(r);
  if (i < 0) return null;
  const route = buildRoutes(w.cast, w.venues, w.contentRadius)[i];
  if (!route) return null;
  const p = poseAt(route, now() / 1000);
  return { x: p.x, z: p.z };
}

const zoneOf = (w: WorldCtx, p: { x: number; z: number }): SafeZone | null => safeZoneAt(p.x, p.z, w.venues, w.contentRadius, w.boundaryRadius);

// ---------------------------------------------------------------------------------------------------------------
// who may do what

function offenderBlock(p: Player, kind: 'steal' | 'fight'): string | null {
  if (p.jailedUntil && p.jailedUntil.getTime() > now()) return "You're in a cell. Wait it out or post bail.";
  if (p.dazedUntil && p.dazedUntil.getTime() > now()) return "You're still seeing stars. Give it a few seconds.";
  if (p.peaceful) return "You're in Peaceful mode, so crime is off for you.";
  if (now() - p.createdAt.getTime() < NEW_PLAYER_MIN * 60_000) return 'You just got to town. Crime unlocks after your first hour.';
  if (kind === 'fight' && p.gas < FIGHT_MIN_GAS) return `You're too tired to throw hands. You need ${FIGHT_MIN_GAS} gas.`;
  return null;
}

function victimBlock(p: Player, name: string): string | null {
  if (p.peaceful) return `${name} is in Peaceful mode. Leave them be.`;
  if (now() - p.createdAt.getTime() < NEW_PLAYER_MIN * 60_000) return `${name} just got to town. Leave them be.`;
  if (p.jailedUntil && p.jailedUntil.getTime() > now()) return `${name} is already in a cell.`;
  return null;
}

async function limits(offenderId: string, kind: 'steal' | 'fight', target: { victimId?: string; residentId?: string }, name: string) {
  const today = dayStart();
  const [mine, theirs, recent] = await Promise.all([
    db.crime.count({ where: { offenderId, kind, at: { gte: today } } }),
    target.victimId ? db.crime.count({ where: { victimId: target.victimId, offenderId: { not: null }, at: { gte: today } } }) : Promise.resolve(0),
    db.crime.findFirst({
      where: { offenderId, at: { gte: new Date(now() - SAME_TARGET_HOURS * 3600_000) }, ...(target.victimId ? { victimId: target.victimId } : { residentId: target.residentId }) },
    }),
  ]);
  const cap = kind === 'steal' ? DAILY_STEALS : DAILY_FIGHTS;
  if (mine >= cap) throw new CrimeError(`That's ${cap} ${kind === 'steal' ? 'steals' : 'fights'} today. Lie low until tomorrow.`, 429);
  if (theirs >= VICTIM_DAILY) throw new CrimeError(`${name} has had a rough enough day. Leave them be.`, 429);
  if (recent) throw new CrimeError(`You already hit ${name} today. Give it ${SAME_TARGET_HOURS} hours.`, 429);
}

async function takeCooldown(id: string) {
  const ok = await redis().set(`crime:cd:${id}`, '1', 'EX', CRIME_COOLDOWN_S, 'NX').catch(() => 'OK');
  if (!ok) throw new CrimeError('Too hot right now. Wait a couple of minutes before the next one.', 429);
}

export type Target = { kind: 'player'; handle: string } | { kind: 'resident'; id: string };

type Resolved =
  | { kind: 'player'; name: string; handle: string; player: Player }
  | { kind: 'resident'; name: string; resident: Resident };

/** Find the target, check both sides may take part, that they are within reach, and nobody is in a safe zone. */
async function resolve(me: Player, myHandle: string, w: WorldCtx, t: Target, kind: 'steal' | 'fight'): Promise<Resolved> {
  const block = offenderBlock(me, kind);
  if (block) throw new CrimeError(block, 403);
  if (t.kind === 'resident') {
    const r = residentById(t.id);
    if (!r) throw new CrimeError('No such resident.', 404);
    const pos = await presencePositions(w.room, [me.id]);
    // presence off (local dev): nobody else can be in the world, so only the resident's own position is checked
    const mine = pos?.[me.id];
    if (pos && !mine) throw new CrimeError("You need to be out in the city to do that.");
    const theirs = residentAt(w, r);
    if (!theirs) throw new CrimeError(`${r.name} isn't around.`);
    if (mine && Math.hypot(mine.x - theirs.x, mine.z - theirs.z) > REACH_RESIDENT) throw new CrimeError(`${r.name} walked off. Catch up first.`);
    const z = zoneOf(w, mine ?? theirs) ?? zoneOf(w, theirs);
    if (z) throw new CrimeError(`Not here. You're ${SAFE_LABEL[z]}.`, 403);
    await limits(me.id, kind, { residentId: r.id }, r.name);
    return { kind: 'resident', name: r.name, resident: r };
  }
  const handle = t.handle.replace(/^@/, '');
  const user = await db.user.findFirst({ where: { handle: { equals: handle, mode: 'insensitive' } } });
  if (!user) throw new CrimeError('That person has not signed in to TweetLife.', 404);
  if (user.handle.toLowerCase() === myHandle.toLowerCase()) throw new CrimeError('That is you.');
  const them = await db.player.findUnique({ where: { id: user.id } });
  if (!them) throw new CrimeError('That person has not signed in to TweetLife.', 404);
  const name = `@${user.handle}`;
  const vb = victimBlock(them, name);
  if (vb) throw new CrimeError(vb, 403);
  const pos = await presencePositions(w.room, [me.id, them.id]);
  const a = pos?.[me.id], b = pos?.[them.id];
  if (!a || !b) throw new CrimeError(`You need to be right next to ${name}.`);
  if (Math.hypot(a.x - b.x, a.z - b.z) > REACH_PLAYER) throw new CrimeError(`Get closer. ${name} is out of reach.`);
  const z = zoneOf(w, a) ?? zoneOf(w, b);
  if (z) throw new CrimeError(`Not here. ${zoneOf(w, b) ? `${name} is` : "You're"} ${SAFE_LABEL[z]}.`, 403);
  await limits(me.id, kind, { victimId: them.id }, name);
  return { kind: 'player', name, handle: user.handle, player: them };
}

// ---------------------------------------------------------------------------------------------------------------
// arrest

type ArrestResult = { arrested: true; offender: string; cellSeconds: number; bail: number; returned: number } | { arrested: false };

/** Officers take the offender in: a cell, bail, a prior, and any stolen bags back to a player victim. */
async function arrestPlayer(crimeId: string): Promise<ArrestResult> {
  const c = await db.crime.findUnique({ where: { id: crimeId } });
  if (!c?.offenderId) return { arrested: false };
  const off = await db.player.findUnique({ where: { id: c.offenderId } });
  if (!off) return { arrested: false };
  const kind = c.kind === 'fight' ? 'fight' : 'steal';
  const secs = cellSeconds(kind, off.priors);
  // each country sets its own bail (lib/life/government.ts); you pay where you were picked up
  const bail = bailFor(kind, c.amount, off.priors, GOVERNMENTS[whereIs(off)].rules.bail);
  const returned = c.victimId && c.outcome === 'stolen' ? Math.min(c.amount, off.bags) : 0;
  const until = new Date(now() + secs * 1000);
  const why = kind === 'steal' ? (c.outcome === 'stolen' ? `Locked up for lifting ${c.amount} bags from ${c.victimName}` : `Locked up for trying to pickpocket ${c.victimName}`) : `Locked up for fighting ${c.victimName}`;
  await db.$transaction(async (tx) => {
    await tx.player.update({
      where: { id: off.id },
      data: { jailedUntil: until, bail, jailCrimeId: c.id, priors: { increment: 1 }, wanted: 0, wantedAt: new Date(), status: why, statusUntil: until, ...(returned ? { bags: { decrement: returned } } : {}) },
    });
    if (returned && c.victimId) {
      await tx.player.update({ where: { id: c.victimId }, data: { bags: { increment: returned } } });
      await tx.bagTx.create({ data: { playerId: off.id, kind: 'restitution', amount: -returned, note: `Returned to ${c.victimName} on arrest` } });
      await tx.bagTx.create({ data: { playerId: c.victimId, kind: 'restitution', amount: returned, note: `Police got your bags back from ${c.offenderName}` } });
    }
    await tx.crime.update({ where: { id: c.id }, data: { arrested: true } });
  });
  return { arrested: true, offender: c.offenderName, cellSeconds: secs, bail, returned };
}

// ---------------------------------------------------------------------------------------------------------------
// steal

export async function steal(me: Player, myHandle: string, worldHandle: string, t: Target) {
  const w = await worldCtx(worldHandle, me);
  const v = await resolve(me, myHandle, w, t, 'steal');
  const theirBags = v.kind === 'player' ? v.player.bags : 600 + Math.floor(Math.random() * 2400);
  if (v.kind === 'player' && theirBags < STEAL_FLOOR) throw new CrimeError(`${v.name} is broke. Nothing worth lifting.`);
  await takeCooldown(me.id);
  const wanted = wantedNow(me.wanted, me.wantedAt);
  const ok = Math.random() < stealChance(wanted);
  const amount = ok ? stealAmount(theirBags, v.kind === 'resident') : 0;
  const base = { kind: 'steal', worldId: w.id, offenderId: me.id, offenderName: `@${myHandle}`, victimName: v.name, amount };
  let crimeId = '';
  if (ok) {
    crimeId = await db.$transaction(async (tx) => {
      if (v.kind === 'player') {
        const took = await tx.player.updateMany({ where: { id: v.player.id, bags: { gte: amount } }, data: { bags: { decrement: amount } } });
        if (took.count === 0) throw new CrimeError(`${v.name} is broke. Nothing worth lifting.`);
        await tx.bagTx.create({ data: { playerId: v.player.id, kind: 'stolen', amount: -amount, note: `Pickpocketed by @${myHandle}` } });
      }
      await tx.player.update({ where: { id: me.id }, data: { bags: { increment: amount }, vibes: clamp(me.vibes + 2) } });
      await tx.bagTx.create({ data: { playerId: me.id, kind: 'steal', amount, note: `Lifted from ${v.name}` } });
      const c = await tx.crime.create({ data: { ...base, outcome: 'stolen', victimId: v.kind === 'player' ? v.player.id : null, residentId: v.kind === 'resident' ? v.resident.id : null } });
      return c.id;
    });
  } else {
    const c = await db.$transaction(async (tx) => {
      await tx.player.update({ where: { id: me.id }, data: { clout: clamp(me.clout + CAUGHT_CLOUT), ...addStar(me) } });
      return tx.crime.create({ data: { ...base, outcome: 'caught', victimId: v.kind === 'player' ? v.player.id : null, residentId: v.kind === 'resident' ? v.resident.id : null } });
    });
    crimeId = c.id;
  }
  // a robbed resident might call it in on the spot
  let police: ArrestResult & { called?: boolean } = { arrested: false };
  if (v.kind === 'resident' && (!ok || Math.random() < RESIDENT_CALLS_POLICE)) police = await residentCalls(crimeId, !ok);
  const outcome = ok ? 'stolen' : 'caught';
  const text = ok ? `🫳 @${myHandle} picked your pocket: −${amount} bags. You can call the police.` : `🚨 @${myHandle} tried to pick your pocket and got caught. You can call the police.`;
  return {
    outcome,
    amount,
    crimeId,
    target: v.name,
    police,
    toast: v.kind === 'player' ? { to: v.handle, kind: 'crime', text } : null,
  };
}

/** A resident reports it: officers roll as for a player's call, and the resident gets nothing back (they're fine). */
async function residentCalls(crimeId: string, caught: boolean): Promise<ArrestResult & { called: true }> {
  const c = await db.crime.findUnique({ where: { id: crimeId } });
  const off = c?.offenderId ? await db.player.findUnique({ where: { id: c.offenderId } }) : null;
  if (!c || !off) return { arrested: false, called: true };
  await db.crime.update({ where: { id: c.id }, data: { report: 'police', reportedAt: new Date() } });
  if (Math.random() < arrestChance(caught ? 'caught' : c.outcome, wantedNow(off.wanted, off.wantedAt))) return { ...(await arrestPlayer(c.id)), called: true };
  await db.player.update({ where: { id: off.id }, data: addStar(off) });
  return { arrested: false, called: true };
}

// ---------------------------------------------------------------------------------------------------------------
// fight

export async function fight(me: Player, myHandle: string, worldHandle: string, t: Target) {
  const w = await worldCtx(worldHandle, me);
  const v = await resolve(me, myHandle, w, t, 'fight');
  await takeCooldown(me.id);
  const theirStats = v.kind === 'player' ? v.player : RESIDENT_FIGHTER;
  const mineRoll = fightPower(me) + Math.random() * FIGHT_LUCK;
  const theirRoll = fightPower(theirStats) + Math.random() * FIGHT_LUCK;
  const won = mineRoll >= theirRoll;
  const dazedUntil = new Date(now() + (FIGHT_SECONDS + DAZED_SECONDS) * 1000);

  const mine = applyDelta(applyDelta(me, { gas: -FIGHT_GAS }), won ? FIGHT_WIN : FIGHT_LOSE);
  await setStats(me.id, mine);
  if (!won) await db.player.update({ where: { id: me.id }, data: { dazedUntil } });
  if (v.kind === 'player') {
    const theirs = applyDelta(applyDelta(v.player, { gas: -FIGHT_GAS }), won ? FIGHT_LOSE : FIGHT_WIN);
    await setStats(v.player.id, theirs);
    if (won) await db.player.update({ where: { id: v.player.id }, data: { dazedUntil } });
  }
  const c = await db.crime.create({
    data: {
      kind: 'fight', worldId: w.id, offenderId: me.id, offenderName: `@${myHandle}`, victimName: v.name, outcome: won ? 'won' : 'lost',
      victimId: v.kind === 'player' ? v.player.id : null, residentId: v.kind === 'resident' ? v.resident.id : null,
    },
  });
  let police: ArrestResult & { called?: boolean } = { arrested: false };
  if (v.kind === 'resident' && Math.random() < RESIDENT_CALLS_POLICE) police = await residentCalls(c.id, false);
  const text = won
    ? `🥊 @${myHandle} jumped you and won. You're dazed for ${DAZED_SECONDS}s. You can call the police.`
    : `🥊 @${myHandle} jumped you and lost. They're dazed. You can still call the police.`;
  return {
    outcome: won ? 'won' : 'lost',
    crimeId: c.id,
    target: v.name,
    me: mine,
    delta: won ? FIGHT_WIN : FIGHT_LOSE,
    dazedSeconds: DAZED_SECONDS,
    police,
    toast: v.kind === 'player' ? { to: v.handle, kind: 'crime', text, delta: { fight: won ? 'lost' : 'won' } } : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// the victim's side

export async function incidentsFor(playerId: string) {
  const since = new Date(now() - REPORT_WINDOW_MIN * 60_000);
  const rows = await db.crime.findMany({ where: { victimId: playerId, report: null, at: { gte: since } }, orderBy: { at: 'desc' }, take: 5 });
  return rows.map((c) => ({
    id: c.id,
    kind: c.kind,
    offender: c.offenderName,
    byResident: !c.offenderId,
    amount: c.amount,
    outcome: c.outcome,
    at: c.at.toISOString(),
    expiresAt: new Date(c.at.getTime() + REPORT_WINDOW_MIN * 60_000).toISOString(),
  }));
}

export async function history(playerId: string) {
  const rows = await db.crime.findMany({ where: { OR: [{ victimId: playerId }, { offenderId: playerId }] }, orderBy: { at: 'desc' }, take: 8 });
  return rows.map((c) => ({
    id: c.id, kind: c.kind, mine: c.offenderId === playerId, offender: c.offenderName, victim: c.victimName, amount: c.amount, outcome: c.outcome,
    report: c.report, arrested: c.arrested, at: c.at.toISOString(),
  }));
}

export async function report(me: Player, crimeId: string, how: 'police' | 'complaint' | 'drop') {
  const c = await db.crime.findUnique({ where: { id: crimeId } });
  if (!c || c.victimId !== me.id) throw new CrimeError('No such incident.', 404);
  if (c.report) throw new CrimeError('Already handled.');
  if (now() - c.at.getTime() > REPORT_WINDOW_MIN * 60_000) throw new CrimeError('Too late to report that one.');
  // claim it first so a double tap can't report twice
  const claimed = await db.crime.updateMany({ where: { id: c.id, report: null }, data: { report: how === 'drop' ? 'dropped' : how, reportedAt: new Date() } });
  if (claimed.count === 0) throw new CrimeError('Already handled.');
  if (how === 'drop') return { result: 'dropped' as const, text: 'You let it go.' };

  // a resident did it (petty theft): an officer goes after them
  if (!c.offenderId) {
    if (how === 'complaint') return { result: 'filed' as const, text: `Complaint filed. Officers will keep an eye on ${c.offenderName}.` };
    if (Math.random() < RESIDENT_CAUGHT) {
      await db.$transaction([
        db.player.update({ where: { id: me.id }, data: { bags: { increment: c.amount } } }),
        db.bagTx.create({ data: { playerId: me.id, kind: 'restitution', amount: c.amount, note: `Police got your bags back from ${c.offenderName}` } }),
        db.crime.update({ where: { id: c.id }, data: { arrested: true } }),
      ]);
      return { result: 'arrested' as const, text: `🚔 Officer Reyes caught ${c.offenderName}. Your ${c.amount} bags are back.`, returned: c.amount, offender: c.offenderName };
    }
    return { result: 'escaped' as const, text: `${c.offenderName} got away this time.` };
  }

  const off = await db.player.findUnique({ where: { id: c.offenderId } });
  if (!off) throw new CrimeError('No such incident.', 404);
  if (off.jailedUntil && off.jailedUntil.getTime() > now()) {
    // already inside for something else: it still goes on the record
    await db.player.update({ where: { id: off.id }, data: addStar(off) });
    return { result: 'filed' as const, text: `${c.offenderName} is already in a cell. It's on their record.` };
  }
  if (how === 'complaint') {
    const star = addStar(off);
    await db.player.update({ where: { id: off.id }, data: star });
    if (star.wanted >= WARRANT_STARS) {
      const a = await arrestPlayer(c.id);
      return { result: 'arrested' as const, text: `🚔 That makes ${star.wanted} stars. A warrant went out and ${c.offenderName} got picked up.`, ...a, notify: off.id };
    }
    return { result: 'filed' as const, text: `Complaint filed. ${c.offenderName} now has ${star.wanted} wanted star${star.wanted === 1 ? '' : 's'}.` };
  }
  // called the police
  if (Math.random() < arrestChance(c.outcome, wantedNow(off.wanted, off.wantedAt))) {
    const a = await arrestPlayer(c.id);
    return { result: 'arrested' as const, text: `🚔 Officers arrested ${c.offenderName}.${a.arrested && a.returned ? ` Your ${a.returned} bags are back.` : ''}`, ...a, notify: off.id };
  }
  await db.player.update({ where: { id: off.id }, data: addStar(off) });
  return { result: 'escaped' as const, text: `Officers couldn't make it stick, but it's on ${c.offenderName}'s record.` };
}

// ---------------------------------------------------------------------------------------------------------------
// cell, bail, peaceful mode

export async function postBail(me: Player) {
  if (!me.jailedUntil || me.jailedUntil.getTime() <= now()) throw new CrimeError("You're not locked up.");
  if (me.bags < me.bail) throw new CrimeError(`Bail is ${me.bail} bags and you have ${me.bags}. Wait it out.`);
  const paid = await db.player.updateMany({ where: { id: me.id, bags: { gte: me.bail }, jailedUntil: { gt: new Date() } }, data: { bags: { decrement: me.bail }, jailedUntil: null, bail: 0, statusUntil: null } });
  if (paid.count === 0) throw new CrimeError("Couldn't post bail. Try again.");
  await db.bagTx.create({ data: { playerId: me.id, kind: 'bail', amount: -me.bail, note: 'Bail at the police station' } });
  return { paid: me.bail };
}

export async function setPeaceful(me: Player, on: boolean) {
  if (on) {
    if (me.jailedUntil && me.jailedUntil.getTime() > now()) throw new CrimeError("Not from a cell.");
    if (wantedNow(me.wanted, me.wantedAt) > 0) throw new CrimeError('Clear your wanted stars first.');
    const lock = new Date(now() + PEACEFUL_LOCK_H * 3600_000);
    await db.player.update({ where: { id: me.id }, data: { peaceful: true, peacefulLockUntil: lock } });
    return { peaceful: true, lockUntil: lock.toISOString() };
  }
  if (me.peacefulLockUntil && me.peacefulLockUntil.getTime() > now()) throw new CrimeError(`Peaceful mode stays on until ${me.peacefulLockUntil.toISOString()}.`);
  await db.player.update({ where: { id: me.id }, data: { peaceful: false } });
  return { peaceful: false, lockUntil: null };
}

// ---------------------------------------------------------------------------------------------------------------
// residents committing petty theft

/** The client checks in every few minutes while out in the city; now and then a resident lifts from you. */
export async function npcTick(me: Player, myHandle: string, worldHandle: string) {
  if (me.peaceful || me.bags < STEAL_FLOOR || now() - me.createdAt.getTime() < NEW_PLAYER_MIN * 60_000) return null;
  if (me.jailedUntil && me.jailedUntil.getTime() > now()) return null;
  // at most one check counts per few minutes, whatever the client sends
  const slot = await redis().set(`crime:npc-check:${me.id}`, '1', 'EX', 150, 'NX').catch(() => null);
  if (!slot || Math.random() >= NPC_THEFT_CHANCE) return null;
  const w = await worldCtx(worldHandle, me);
  const pos = (await presencePositions(w.room, [me.id]))?.[me.id];
  if (pos && zoneOf(w, pos)) return null;
  const day = new Date().toISOString().slice(0, 10);
  const once = await redis().set(`crime:npc:${me.id}:${day}`, '1', 'EX', 26 * 3600, 'NX').catch(() => null);
  if (!once) return null;
  // the nearest resident did it (anyone, without presence)
  const near = w.cast.map((r) => ({ r, p: residentAt(w, r) }))
    .filter((x) => x.p)
    .sort((a, b) => (pos ? Math.hypot(a.p!.x - pos.x, a.p!.z - pos.z) - Math.hypot(b.p!.x - pos.x, b.p!.z - pos.z) : Math.random() - 0.5));
  const who = near[0]?.r;
  if (!who) return null;
  const amount = Math.min(me.bags, NPC_THEFT_MIN + Math.floor(Math.random() * (NPC_THEFT_MAX - NPC_THEFT_MIN + 1)));
  const c = await db.$transaction(async (tx) => {
    const took = await tx.player.updateMany({ where: { id: me.id, bags: { gte: amount } }, data: { bags: { decrement: amount } } });
    if (took.count === 0) return null;
    await tx.bagTx.create({ data: { playerId: me.id, kind: 'stolen', amount: -amount, note: `Pickpocketed by ${who.name}` } });
    return tx.crime.create({ data: { kind: 'steal', worldId: w.id, offenderId: null, offenderName: who.name, residentId: who.id, victimId: me.id, victimName: `@${myHandle}`, amount, outcome: 'stolen' } });
  });
  return c ? { id: c.id, offender: who.name, residentId: who.id, amount } : null;
}

/** What AI residents know about your record, for their chat prompt. */
export function reputationLine(p: Player) {
  const w = wantedNow(p.wanted, p.wantedAt);
  if (p.jailedUntil && p.jailedUntil.getTime() > now()) return 'They are talking to you through the bars of a police station cell. Tease them a little about it.';
  if (w >= 2) return `Word on the street is they are trouble: ${w} wanted stars and ${p.priors} prior arrest${p.priors === 1 ? '' : 's'}. You are wary of them, keep a hand on your pocket, and keep it short.`;
  if (w === 1 || p.priors > 0) return `They have a bit of a reputation (${p.priors} prior arrest${p.priors === 1 ? '' : 's'}). You are friendly but a little guarded.`;
  return null;
}
