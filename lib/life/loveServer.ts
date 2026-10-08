import type { Bond, Player, Prisma, SocialRequest } from '@prisma/client';
import { db } from '../db';
import { redis } from '../redis';
import { applyDelta, clamp, type Stats } from './stats';
import { setStats } from './player';
import { residentById, type Resident } from './residents';
import { cannedReply, deepseekReply, takeQuota } from './residentChat';
import {
  AFFINITY, DAILY_BONUS, DATE_COOLDOWN_H, DECLINE_COOLDOWN_H, RESIDENT_RETRY_H, KINDS, MAX_PARTNERS, PASS_MINUTES, PENDING_MAX, SEND_PER_DAY,
  askLine, dateById, hostSide,
  type BondView, type LoveState, type PersonRef, type ProfileLove, type RequestKind, type RequestView, type VisitView,
} from './love';

// Server side of relationships. Every rule that matters (acceptance, the cap of six, who may be in whose house)
// is checked here; the client only shows buttons.

export class LoveError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const H = 3600_000;
const day = () => new Date().toISOString().slice(0, 10);

type Target = { kind: 'player'; player: Player; handle: string } | { kind: 'resident'; resident: Resident };
type Me = { player: Player; handle: string };

/** Who the request is for: a signed-in player by handle, or an AI resident by id. */
export async function findTarget(to: { handle?: string; residentId?: string }): Promise<Target> {
  if (to.residentId) {
    const r = residentById(to.residentId);
    if (!r) throw new LoveError('No such resident.', 404);
    return { kind: 'resident', resident: r };
  }
  const handle = (to.handle ?? '').replace(/^@/, '');
  if (!handle) throw new LoveError('Who is it for?');
  const user = await db.user.findFirst({ where: { handle: { equals: handle, mode: 'insensitive' } }, select: { id: true, handle: true } });
  const player = user && (await db.player.findUnique({ where: { id: user.id } }));
  if (!user || !player) throw new LoveError(`@${handle} has not moved into TweetLife yet.`, 404);
  return { kind: 'player', player, handle: user.handle };
}

const datingCount = (playerId: string) => db.bond.count({ where: { playerId, status: 'dating' } });

const bondWith = (playerId: string, t: { partnerId?: string; residentId?: string }) =>
  t.partnerId
    ? db.bond.findUnique({ where: { playerId_partnerId: { playerId, partnerId: t.partnerId } } })
    : db.bond.findUnique({ where: { playerId_residentId: { playerId, residentId: t.residentId! } } });

function capMessage(who: string | null) {
  return who ? `${who} is already dating ${MAX_PARTNERS} people. That's the most anyone can date at once.` : `You're already dating ${MAX_PARTNERS} people. That's the most anyone can date at once. Break up with someone first.`;
}

// ----- asking -----

export type AskResult = { request: SocialRequest; accepted?: boolean; reply?: string; autoAccepted?: boolean };

export async function ask(me: Me, kind: RequestKind, target: Target, detail?: string | null): Promise<AskResult> {
  if (!(kind in KINDS)) throw new LoveError('Unknown request.');
  const pid = me.player.id;
  const toPlayer = target.kind === 'player' ? target.player.id : null;
  const residentId = target.kind === 'resident' ? target.resident.id : null;
  if (toPlayer === pid) throw new LoveError('That is you.');
  const name = target.kind === 'player' ? `@${target.handle}` : target.resident.name;
  const date = kind === 'outing' ? dateById(detail) : null;
  if (kind === 'outing' && !date) throw new LoveError('Pick a date: dinner or dancing.');

  // spam limits: one of each kind waiting per person, a few waiting in all, a daily allowance
  const now = new Date();
  if (toPlayer) {
    const same = await db.socialRequest.findFirst({ where: { fromId: pid, toId: toPlayer, kind, status: 'pending', expiresAt: { gt: now } } });
    if (same) throw new LoveError(`You already asked ${name}. Give them a moment to answer.`, 429);
    const waiting = await db.socialRequest.count({ where: { fromId: pid, status: 'pending', expiresAt: { gt: now } } });
    if (waiting >= PENDING_MAX) throw new LoveError(`You have ${PENDING_MAX} requests waiting. Wait for answers or cancel some in the Relationships app.`, 429);
  }
  // residents get over it sooner: their answer moves with affinity, which you can build up meanwhile
  const wait = (toPlayer ? DECLINE_COOLDOWN_H : RESIDENT_RETRY_H) * H;
  const no = await db.socialRequest.findFirst({
    where: { fromId: pid, kind, status: 'declined', respondedAt: { gt: new Date(Date.now() - wait) }, ...(toPlayer ? { toId: toPlayer } : { residentId }) },
    orderBy: { respondedAt: 'desc' },
  });
  if (no?.respondedAt) {
    const mins = Math.max(1, Math.ceil((no.respondedAt.getTime() + wait - Date.now()) / 60_000));
    throw new LoveError(`${name} said no to that recently. You can ask again in ${mins > 90 ? `${Math.ceil(mins / 60)}h` : `${mins} min`}.`, 429);
  }

  // the rules for each kind, before anything is sent
  const mine = await bondWith(pid, toPlayer ? { partnerId: toPlayer } : { residentId: residentId! });
  if (kind === 'date') {
    if (mine?.status === 'dating') throw new LoveError(`You're already dating ${name}.`);
    if ((await datingCount(pid)) >= MAX_PARTNERS) throw new LoveError(capMessage(null), 409);
    if (toPlayer && (await datingCount(toPlayer)) >= MAX_PARTNERS) throw new LoveError(capMessage(name), 409);
  }
  if (kind === 'outing') {
    if (mine?.status !== 'dating') throw new LoveError(`You can only go on dates with someone you're dating. Ask ${name} out first.`);
    const next = nextDateAt(mine);
    if (next) throw new LoveError(`You just had a date with ${name}. Next one in ${Math.ceil((next - Date.now()) / 60000)} min.`, 429);
    if (date!.bags > me.player.bags) throw new LoveError(`${date!.label} costs ${date!.bags} bags. You have ${me.player.bags}.`);
  }
  if (kind === 'invite' || kind === 'visit') {
    const host = hostSide(kind) === 'from' ? { player: pid } : toPlayer ? { player: toPlayer } : { resident: residentId! };
    const guest = hostSide(kind) === 'from' ? (toPlayer ? { player: toPlayer } : { resident: residentId! }) : { player: pid };
    const pass = await activePass(host, guest);
    if (pass) throw new LoveError(kind === 'invite' ? `${name} can already come over.` : `You can already go over to ${name}'s place.`);
  }

  const sent = await redis().incr(`love:sent:${pid}:${day()}`).catch(() => 0);
  if (sent === 1) await redis().expire(`love:sent:${pid}:${day()}`, 90000).catch(() => {});
  if (sent > SEND_PER_DAY) throw new LoveError(`That's ${SEND_PER_DAY} requests today. Try again tomorrow.`, 429);

  if (target.kind === 'resident') return askResident(me, kind, target.resident, mine, date?.id ?? null);

  // they already asked you the same thing: that's a yes from both sides
  const mirror = kind === 'invite' ? 'visit' : kind === 'visit' ? 'invite' : kind;
  const theirs = await db.socialRequest.findFirst({ where: { fromId: toPlayer!, toId: pid, kind: mirror, status: 'pending', expiresAt: { gt: now }, ...(kind === 'outing' ? { detail } : {}) } });
  if (theirs) {
    const request = await respond(me, theirs.id, true);
    return { request, accepted: true, autoAccepted: true };
  }

  const request = await db.socialRequest.create({
    data: { fromId: pid, toId: toPlayer, kind, detail: date?.id ?? null, expiresAt: new Date(Date.now() + KINDS[kind].ttl * 60_000) },
  });
  return { request };
}

// ----- answering -----

export async function respond(me: Me, id: string, accept: boolean): Promise<SocialRequest> {
  const r = await db.socialRequest.findUnique({ where: { id } });
  if (!r || r.toId !== me.player.id) throw new LoveError('No such request.', 404);
  if (r.status !== 'pending') throw new LoveError(`That request was already ${r.status}.`, 409);
  if (r.expiresAt.getTime() < Date.now()) throw new LoveError('That request has expired.', 410);
  if (!accept) return db.socialRequest.update({ where: { id }, data: { status: 'declined', respondedAt: new Date() } });

  const kind = r.kind as RequestKind;
  const from = await db.player.findUnique({ where: { id: r.fromId } });
  if (!from) throw new LoveError('They have left TweetLife.', 410);
  const fromUser = await db.user.findUnique({ where: { id: from.id }, select: { handle: true } });
  const them = `@${fromUser?.handle ?? 'someone'}`;

  if (kind === 'invite' || kind === 'visit') {
    const [a, b] = [r.fromId, me.player.id];
    return db.$transaction(async (tx) => {
      await meet(tx, a, b);
      return tx.socialRequest.update({ where: { id }, data: { status: 'accepted', respondedAt: new Date(), passUntil: new Date(Date.now() + PASS_MINUTES * 60_000) } });
    });
  }

  if (kind === 'date') {
    // the cap is checked again for both of you at the moment it becomes real
    if ((await datingCount(me.player.id)) >= MAX_PARTNERS) throw new LoveError(capMessage(null), 409);
    if ((await datingCount(r.fromId)) >= MAX_PARTNERS) throw new LoveError(capMessage(them), 409);
    return db.$transaction(async (tx) => {
      for (const [p, q] of [[r.fromId, me.player.id], [me.player.id, r.fromId]]) {
        await tx.bond.upsert({
          where: { playerId_partnerId: { playerId: p, partnerId: q } },
          create: { playerId: p, partnerId: q, status: 'dating', datingSince: new Date() },
          update: { status: 'dating', datingSince: new Date(), endedAt: null },
        });
      }
      return tx.socialRequest.update({ where: { id }, data: { status: 'accepted', respondedAt: new Date() } });
    });
  }

  // outing: a date together. Whoever asked pays.
  const date = dateById(r.detail)!;
  const bond = await bondWith(me.player.id, { partnerId: r.fromId });
  if (bond?.status !== 'dating') throw new LoveError(`You're not dating ${them} any more.`, 409);
  if (nextDateAt(bond)) throw new LoveError(`You just had a date with ${them}. Try again later.`, 429);
  if (date.bags > from.bags) throw new LoveError(`${them} can't cover ${date.label.toLowerCase()} right now.`, 409);
  const until = new Date(Date.now() + date.seconds * 1000);
  const result = await db.$transaction(async (tx) => {
    if (date.bags) {
      await tx.player.update({ where: { id: from.id }, data: { bags: { decrement: date.bags } } });
      await tx.bagTx.create({ data: { playerId: from.id, kind: 'buy', amount: -date.bags, note: `${date.emoji} ${date.label}` } });
    }
    await tx.bond.updateMany({ where: { OR: [{ playerId: from.id, partnerId: me.player.id }, { playerId: me.player.id, partnerId: from.id }] }, data: { lastDateAt: new Date(), dates: { increment: 1 } } });
    await tx.player.update({ where: { id: from.id }, data: { status: `${date.line} at ${date.venueName}`, statusUntil: until } });
    await tx.player.update({ where: { id: me.player.id }, data: { status: `${date.line} at ${date.venueName}`, statusUntil: until } });
    return tx.socialRequest.update({ where: { id }, data: { status: 'accepted', respondedAt: new Date() } });
  });
  await Promise.all([setStats(from.id, applyDelta(from, date.me)), setStats(me.player.id, applyDelta(me.player, date.me))]);
  return result;
}

export async function cancel(me: Me, id: string) {
  const r = await db.socialRequest.findUnique({ where: { id } });
  if (!r || r.fromId !== me.player.id) throw new LoveError('No such request.', 404);
  if (r.status === 'pending') return db.socialRequest.update({ where: { id }, data: { status: 'cancelled', respondedAt: new Date() } });
  // an accepted visit can be cut short by either side
  if (r.passUntil && r.passUntil.getTime() > Date.now()) return db.socialRequest.update({ where: { id }, data: { passUntil: new Date() } });
  throw new LoveError('Nothing to cancel.', 409);
}

/** End a visit early (either side) or cut one short as the host. */
export async function endVisit(me: Me, id: string) {
  const r = await db.socialRequest.findUnique({ where: { id } });
  if (!r || (r.fromId !== me.player.id && r.toId !== me.player.id)) throw new LoveError('No such visit.', 404);
  return db.socialRequest.update({ where: { id }, data: { passUntil: new Date() } });
}

export async function breakUp(me: Me, bondId: string) {
  const b = await db.bond.findUnique({ where: { id: bondId } });
  if (!b || b.playerId !== me.player.id) throw new LoveError('No such relationship.', 404);
  if (b.status !== 'dating') throw new LoveError('You are not dating them.', 409);
  if (b.residentId) {
    // residents take it personally, but you can still talk
    return db.bond.update({ where: { id: b.id }, data: { status: 'talking', endedAt: new Date(), affinity: clamp(b.affinity + AFFINITY.breakup) } });
  }
  await db.bond.updateMany({
    where: { OR: [{ playerId: b.playerId, partnerId: b.partnerId }, { playerId: b.partnerId!, partnerId: b.playerId }] },
    data: { status: 'ended', endedAt: new Date() },
  });
  return b;
}

// ----- AI residents -----

async function askResident(me: Me, kind: RequestKind, r: Resident, bond: Bond | null, dateId: string | null): Promise<AskResult> {
  const pid = me.player.id;
  const affinity = bond?.affinity ?? 0;
  const need = KINDS[kind].residentNeeds;
  let accepted = affinity >= need;
  const why = accepted ? '' : `affinity ${affinity} of the ${need} they need`;

  const now = new Date();
  const date = dateById(dateId);
  let request: SocialRequest;
  if (accepted) {
    const gain = kind === 'date' ? AFFINITY.askedOut : kind === 'outing' ? AFFINITY.date : AFFINITY.visit;
    request = await db.$transaction(async (tx) => {
      await tx.bond.upsert({
        where: { playerId_residentId: { playerId: pid, residentId: r.id } },
        create: { playerId: pid, residentId: r.id, status: kind === 'date' ? 'dating' : 'talking', datingSince: kind === 'date' ? now : null, affinity: clamp(gain) },
        update: {
          affinity: clamp(affinity + gain),
          ...(kind === 'date' ? { status: 'dating', datingSince: now, endedAt: null } : {}),
          ...(kind === 'outing' ? { lastDateAt: now, dates: { increment: 1 } } : {}),
        },
      });
      if (kind === 'outing' && date) {
        if (date.bags) {
          await tx.player.update({ where: { id: pid }, data: { bags: { decrement: date.bags } } });
          await tx.bagTx.create({ data: { playerId: pid, kind: 'buy', amount: -date.bags, note: `${date.emoji} ${date.label} with ${r.name}` } });
        }
        await tx.player.update({ where: { id: pid }, data: { status: `${date.line} at ${date.venueName}`, statusUntil: new Date(Date.now() + date.seconds * 1000) } });
      }
      return tx.socialRequest.create({
        data: {
          fromId: pid, residentId: r.id, kind, detail: date?.id ?? null, status: 'accepted', expiresAt: now, respondedAt: now,
          passUntil: kind === 'invite' || kind === 'visit' ? new Date(Date.now() + PASS_MINUTES * 60_000) : null,
        },
      });
    });
    if (kind === 'outing' && date) await setStats(pid, applyDelta(me.player, date.me));
  } else {
    accepted = false;
    request = await db.socialRequest.create({ data: { fromId: pid, residentId: r.id, kind, detail: date?.id ?? null, status: 'declined', expiresAt: now, respondedAt: now } });
  }
  const reply = await residentAnswer(r, me, kind, accepted, why, affinity, date?.label ?? null);
  return { request, accepted, reply };
}

const CANNED: Record<RequestKind, { yes: string[]; no: string[] }> = {
  invite: { yes: ['Say less, I\'m on my way. Keep the fan on for me 😄', 'Your place? Sharp. See you there.'], no: ['Hmm, we never even gist reach that level. Talk to me small first.', 'Small small o. Let\'s talk more before I start showing up at your door.'] },
  visit: { yes: ['Come through! Door is open, just don\'t judge the mess.', 'Sure, come over. I\'ll be there.'], no: ['My place? Not yet o. We just met.', 'Let\'s gist more first, then we talk about visiting.'] },
  date: { yes: ['You know what? Yes. Let\'s do this 💘', 'Ehen! Finally you asked. Yes!'], no: ['You\'re sweet, but I don\'t know you like that yet.', 'Haha, slow down. Talk to me more first.'] },
  outing: { yes: ['A date with you? I\'m dressing up already ✨', 'Let\'s go! You\'re paying, abi? 😄'], no: ['We\'re not even dating o!'] },
};

async function residentAnswer(r: Resident, me: Me, kind: RequestKind, yes: boolean, why: string, affinity: number, dateLabel: string | null) {
  const pick = (l: string[]) => l[(affinity + kind.length + me.handle.length) % l.length];
  const canned = pick(yes ? CANNED[kind].yes : CANNED[kind].no);
  const quota = await takeQuota(me.player.id).catch(() => 'capped' as const);
  if (quota !== 'ok') return canned;
  const asked = kind === 'invite' ? 'invited you over to their house' : kind === 'visit' ? 'asked to come over to your house' : kind === 'date' ? 'asked you out, to start dating' : `asked you on a date: ${dateLabel ?? 'a night out'}`;
  const system = [
    `You are ${r.name}, a resident of Tweetlife, a 3D social life game. ${r.persona}`,
    `How you talk: ${r.voice}`,
    `The player @${me.handle} just ${asked}. You have already decided: ${yes ? 'YES' : `NO (${why}; they should spend more time talking with you first)`}.`,
    'Answer them in character in 1 or 2 short sentences (under 35 words), plain text, no markdown. Keep it friendly, flirty at most, PG-13. Make the yes or no unmistakable.',
  ].join('\n\n');
  const text = await deepseekReply(system, [{ role: 'user', content: `@${me.handle}: ${kind === 'date' ? 'Will you go out with me?' : kind === 'invite' ? 'Come over to my place?' : kind === 'visit' ? 'Can I come over to yours?' : `Date night? ${dateLabel ?? ''}`}` }]);
  return text ?? canned ?? cannedReply(r, kind);
}

/** Chatting with a resident builds affinity, a little per message, up to a daily limit. */
export async function chatAffinity(playerId: string, residentId: string) {
  const k = `love:chat:${playerId}:${residentId}:${day()}`;
  const n = await redis().incr(k).catch(() => 99);
  if (n === 1) await redis().expire(k, 90000).catch(() => {});
  if (n * AFFINITY.chat > AFFINITY.chatPerDay) return null;
  const b = await db.bond.upsert({
    where: { playerId_residentId: { playerId, residentId } },
    create: { playerId, residentId, status: 'talking', affinity: AFFINITY.chat },
    update: { affinity: { increment: AFFINITY.chat } },
  });
  if (b.affinity > 100) await db.bond.update({ where: { id: b.id }, data: { affinity: 100 } });
  return Math.min(100, b.affinity);
}

// ----- visits -----

type Side = { player: string } | { resident: string };

/** The accepted request that lets `guest` into `host`'s house right now, if any. */
export async function activePass(host: Side, guest: Side) {
  const now = new Date();
  const pairs: object[] = [];
  // an invite is from the host to the guest; a visit is from the guest to the host
  if ('player' in host && 'player' in guest) {
    pairs.push({ kind: 'invite', fromId: host.player, toId: guest.player }, { kind: 'visit', fromId: guest.player, toId: host.player });
  } else if ('player' in host && 'resident' in guest) {
    pairs.push({ kind: 'invite', fromId: host.player, residentId: guest.resident });
  } else if ('resident' in host && 'player' in guest) {
    pairs.push({ kind: 'visit', fromId: guest.player, residentId: host.resident });
  }
  if (!pairs.length) return null;
  return db.socialRequest.findFirst({ where: { status: 'accepted', passUntil: { gt: now }, OR: pairs }, orderBy: { passUntil: 'desc' } });
}

export type Access = { ok: true; reason: 'owner' | 'pass' | 'partner'; until: string | null; requestId: string | null } | { ok: false };

/** May this player be in that house (and use its furniture)? */
export async function houseAccess(guestId: string | null, host: Side): Promise<Access> {
  if (!guestId) return { ok: false };
  if ('player' in host && host.player === guestId) return { ok: true, reason: 'owner', until: null, requestId: null };
  const pass = await activePass(host, { player: guestId });
  if (pass) return { ok: true, reason: 'pass', until: pass.passUntil!.toISOString(), requestId: pass.id };
  const b = await bondWith(guestId, 'player' in host ? { partnerId: host.player } : { residentId: host.resident });
  if (b?.status === 'dating') return { ok: true, reason: 'partner', until: null, requestId: null };
  return { ok: false };
}

/** AI residents you invited who are at your place now. */
export async function residentGuests(hostId: string) {
  const rows = await db.socialRequest.findMany({ where: { fromId: hostId, kind: 'invite', status: 'accepted', residentId: { not: null }, passUntil: { gt: new Date() } } });
  return [...new Set(rows.map((r) => r.residentId!))];
}

// ----- reading -----

function nextDateAt(b: Pick<Bond, 'lastDateAt'>) {
  const t = b.lastDateAt ? b.lastDateAt.getTime() + DATE_COOLDOWN_H * H : 0;
  return t > Date.now() ? t : null;
}

async function people(ids: string[]) {
  const users = ids.length ? await db.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, handle: true, name: true, avatarUrl: true } }) : [];
  return new Map(users.map((u) => [u.id, { kind: 'player' as const, handle: u.handle, name: u.name, avatarUrl: u.avatarUrl }]));
}

const residentRef = (id: string): PersonRef => ({ kind: 'resident', id, name: residentById(id)?.name ?? id });
const gone: PersonRef = { kind: 'player', handle: 'someone', name: 'Someone', avatarUrl: null };

export async function loveState(me: Me): Promise<LoveState> {
  const pid = me.player.id;
  const now = new Date();
  const [bonds, incoming, outgoing, answered, visits] = await Promise.all([
    db.bond.findMany({ where: { playerId: pid, status: { in: ['talking', 'dating'] } }, orderBy: { since: 'desc' }, take: 60 }),
    db.socialRequest.findMany({ where: { toId: pid, status: 'pending', expiresAt: { gt: now } }, orderBy: { createdAt: 'desc' }, take: 30 }),
    db.socialRequest.findMany({ where: { fromId: pid, status: 'pending', expiresAt: { gt: now } }, orderBy: { createdAt: 'desc' }, take: 30 }),
    db.socialRequest.findMany({ where: { fromId: pid, toId: { not: null }, status: { in: ['accepted', 'declined'] }, respondedAt: { gt: new Date(Date.now() - 30 * 60_000) } }, orderBy: { respondedAt: 'desc' }, take: 10 }),
    db.socialRequest.findMany({ where: { OR: [{ fromId: pid }, { toId: pid }], kind: { in: ['invite', 'visit'] }, status: 'accepted', passUntil: { gt: now } }, orderBy: { passUntil: 'desc' }, take: 20 }),
  ]);
  const ids = [...bonds.map((b) => b.partnerId), ...[...incoming, ...outgoing, ...answered, ...visits].flatMap((r) => [r.fromId, r.toId])].filter((x): x is string => !!x && x !== pid);
  const who = await people(ids);
  const other = (r: SocialRequest): PersonRef => (r.residentId ? residentRef(r.residentId) : who.get(r.fromId === pid ? r.toId! : r.fromId) ?? gone);
  const req = (r: SocialRequest): RequestView => ({
    id: r.id, kind: r.kind as RequestKind, detail: r.detail, who: other(r), status: r.status as RequestView['status'],
    createdAt: r.createdAt.toISOString(), expiresAt: r.expiresAt.toISOString(), respondedAt: r.respondedAt?.toISOString() ?? null, passUntil: r.passUntil?.toISOString() ?? null,
  });
  const meRef: PersonRef = { kind: 'player', handle: me.handle, name: me.handle, avatarUrl: null };
  const visitViews: VisitView[] = visits.map((r) => {
    const hostIsFrom = hostSide(r.kind as RequestKind) === 'from';
    const hostIsMe = hostIsFrom ? r.fromId === pid : r.toId === pid;
    const them = other(r);
    return { id: r.id, host: hostIsMe ? meRef : them, guest: hostIsMe ? them : meRef, mineToHost: hostIsMe, until: r.passUntil!.toISOString() };
  });
  const bondViews: BondView[] = bonds.map((b) => ({
    id: b.id,
    who: b.residentId ? residentRef(b.residentId) : who.get(b.partnerId!) ?? gone,
    status: b.status as BondView['status'],
    affinity: b.residentId ? b.affinity : null,
    since: b.since.toISOString(),
    datingSince: b.datingSince?.toISOString() ?? null,
    lastDateAt: b.lastDateAt?.toISOString() ?? null,
    dates: b.dates,
    nextDateAt: nextDateAt(b),
  }));
  const dating = bonds.filter((b) => b.status === 'dating').length;
  return {
    bonds: bondViews,
    incoming: incoming.map(req),
    outgoing: outgoing.map(req),
    answered: answered.map(req),
    visits: visitViews,
    dating,
    max: MAX_PARTNERS,
    bonus: await dailyBonus(me.player, dating),
  };
}

/** Once a day, partners lift you a little. Applied the first time you open the game that day. */
async function dailyBonus(p: Player, dating: number) {
  if (!dating) return null;
  const ok = await redis().set(`love:bonus:${p.id}:${day()}`, '1', 'EX', 90000, 'NX').catch(() => null);
  if (!ok) return null;
  const n = Math.min(dating, DAILY_BONUS.maxPartners);
  const delta: Partial<Stats> = { vibes: DAILY_BONUS.vibes * n, clout: DAILY_BONUS.clout * n };
  const fresh = await db.player.findUnique({ where: { id: p.id } });
  await setStats(p.id, applyDelta(fresh ?? p, delta));
  return { vibes: delta.vibes!, clout: delta.clout!, partners: n };
}

/** Who someone is dating, for their profile. Open to anyone. */
export async function profileLove(handle: string): Promise<ProfileLove | null> {
  const user = await db.user.findFirst({ where: { handle: { equals: handle.replace(/^@/, ''), mode: 'insensitive' } }, select: { id: true, handle: true } });
  if (!user) return null;
  const bonds = await db.bond.findMany({ where: { playerId: user.id, status: 'dating' }, orderBy: { datingSince: 'asc' } });
  const who = await people(bonds.map((b) => b.partnerId).filter((x): x is string => !!x));
  const partners = bonds.map((b) => (b.residentId ? residentRef(b.residentId) : who.get(b.partnerId!) ?? gone));
  return { handle: user.handle, partners, dating: partners.length };
}

/** Line for the receiver's toast and notification. */
export function noticeText(fromHandle: string, kind: RequestKind, detail: string | null) {
  return `💌 @${fromHandle} ${askLine(kind, detail)}`;
}

/** Two players met at a house: they are at least talking now. */
async function meet(tx: Prisma.TransactionClient, a: string, b: string) {
  for (const [p, q] of [[a, b], [b, a]]) {
    const ex = await tx.bond.findUnique({ where: { playerId_partnerId: { playerId: p, partnerId: q } } });
    if (!ex) await tx.bond.create({ data: { playerId: p, partnerId: q, status: 'talking' } });
    else if (ex.status === 'ended') await tx.bond.update({ where: { id: ex.id }, data: { status: 'talking', endedAt: null } });
  }
}
