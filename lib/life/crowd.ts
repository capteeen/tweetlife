import type { StructureKind, User } from '@prisma/client';
import { db } from '../db';
import { redis } from '../redis';
import { getFollowers, getUserTweets } from '../x/api';
import { budgetStatus } from '../x/budget';
import { accessTokenFor } from '../x/oauth';
import { structureRows } from '../x/ingest';

// Post on X and your followers pull up. When a player's new post lands (found by a quick check from the game or by
// the regular sync), their newest X followers appear around them in the world as a crowd: real names and handles,
// cheering and reacting to the post, for CROWD_MINUTES. Followers who play Tweetlife themselves are not puppeted;
// they get a notice with a way to join instead. Posting earns nothing (no bags, no stats): X's developer terms bar
// apps from rewarding people for posting, and the game depends on X API access.
//
// X budget: X bills every follower a list returns ($0.010 each), so the list is the newest FOLLOWERS_FETCH followers
// (a crowd is at most 20), fetched at most once every FOLLOWERS_FRESH_S and kept for a month as a fallback when X
// refuses or the budget runs low. Checking for a new post is one call, at most once per CHECK_GAP_S per player, and
// bills only posts newer than the newest we have.

export const CROWD_MINUTES = 20;
/** Only posts this fresh bring a crowd; an old post found by a late sync doesn't. */
const FRESH_HOURS = 24;
const FOLLOWERS_FETCH = 40;
const FOLLOWERS_FRESH_S = 3 * 24 * 3600;
const FOLLOWERS_KEEP_S = 30 * 24 * 3600;
export const CHECK_GAP_S = 120;
const NOTICE_KEEP = 10;

export type CrowdFollower = { id: string; handle: string; name: string; avatar: string | null; followers: number | null };
export type Crowd = {
  ownerId: string;
  owner: string;
  postId: string;
  text: string;
  at: number;
  until: number;
  followers: CrowdFollower[];
  /** handles of followers who play Tweetlife; they were sent a notice rather than added to the crowd */
  players: string[];
  /** 'x' = fresh follower list, 'cache' = saved list (X unavailable or budget low), 'none' = no list at all */
  source: 'x' | 'cache' | 'none';
};
export type CrowdNotice = { id: string; owner: string; text: string; world: string; at: number };

const kFollowers = (userId: string) => `crowd:followers:${userId}`;
const kCrowd = (userId: string) => `crowd:live:${userId}`;
const kPost = (postId: string) => `crowd:post:${postId}`;
const kWhere = (userId: string) => `crowd:where:${userId}`;
const kNotices = (userId: string) => `crowd:notices:${userId}`;
const kCheck = (userId: string) => `crowd:check:${userId}`;

/** How many followers come: 5 for a small account, up to 20 for a big one. */
export function crowdSize(followersCount: number) {
  return Math.max(5, Math.min(20, Math.round(4 + 4 * Math.log10(Math.max(0, followersCount) + 1))));
}

/** Posts that bring a crowd: your own posts, threads, photos and videos. Not replies to others, not reposts. */
export function bringsCrowd(kind: StructureKind) {
  return kind !== 'outbuilding' && kind !== 'lantern';
}

function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

/** A different mix of followers for each post, the same mix every time for one post. */
function sample<T>(list: T[], n: number, seed: string): T[] {
  return [...list].map((v, i) => ({ v, k: hash(`${seed}#${i}`) })).sort((a, b) => a.k - b.k).slice(0, n).map((x) => x.v);
}

/** The owner's newest followers: from the cache while fresh, else one X call, else the last saved list. */
export async function followersOf(owner: User): Promise<{ list: CrowdFollower[]; source: Crowd['source'] }> {
  const raw = await redis().get(kFollowers(owner.id)).catch(() => null);
  const saved = raw ? (JSON.parse(raw) as { at: number; list: CrowdFollower[] }) : null;
  if (saved && Date.now() - saved.at < FOLLOWERS_FRESH_S * 1000) return { list: saved.list, source: 'x' };
  // spend a call only while the budget is comfortable; otherwise make do with the last list
  const budget = await budgetStatus().catch(() => null);
  if (budget?.level === 'ok') {
    try {
      const { token } = await accessTokenFor(owner);
      const users = await getFollowers({ accessToken: token, userId: owner.id, maxWaitMs: 8000 }, owner.id, FOLLOWERS_FETCH);
      const list = users.map((u) => ({
        id: u.id,
        handle: u.username,
        name: u.name,
        avatar: u.profile_image_url ?? null,
        followers: u.public_metrics?.followers_count ?? null,
      }));
      await redis().set(kFollowers(owner.id), JSON.stringify({ at: Date.now(), list }), 'EX', FOLLOWERS_KEEP_S).catch(() => {});
      return { list, source: 'x' };
    } catch (e) {
      console.error('[crowd] followers', (e as Error).message);
    }
  }
  return saved ? { list: saved.list, source: 'cache' } : { list: [], source: 'none' };
}

/**
 * Bring the crowd for one post. Once per post; a post older than FRESH_HOURS brings nobody.
 * Returns the crowd, or null when this post already had one (or is too old).
 */
export async function summonCrowd(owner: User, post: { postId: string; text: string; postedAt: Date }, followersCount: number): Promise<Crowd | null> {
  if (Date.now() - post.postedAt.getTime() > FRESH_HOURS * 3600 * 1000) return null;
  const first = await redis().set(kPost(post.postId), '1', 'EX', 7 * 24 * 3600, 'NX');
  if (!first) return null;

  const { list, source } = await followersOf(owner);
  const playing = list.length
    ? new Set((await db.player.findMany({ where: { id: { in: list.map((f) => f.id) } }, select: { id: true } })).map((p) => p.id))
    : new Set<string>();
  const n = crowdSize(followersCount);
  const followers = sample(list.filter((f) => !playing.has(f.id)), n, post.postId);
  const players = list.filter((f) => playing.has(f.id));
  const now = Date.now();
  const crowd: Crowd = {
    ownerId: owner.id,
    owner: owner.handle,
    postId: post.postId,
    text: post.text.replace(/https:\/\/t\.co\/\S+/g, '').trim().slice(0, 280),
    at: now,
    until: now + CROWD_MINUTES * 60 * 1000,
    followers,
    players: players.map((p) => p.handle),
    source,
  };
  await redis().set(kCrowd(owner.id), JSON.stringify(crowd), 'PX', crowd.until - now + 60_000);

  // followers who play: a notice pointing at where the poster is now
  const where = (await redis().get(kWhere(owner.id)).catch(() => null)) ?? owner.handle;
  for (const p of players) {
    const notice: CrowdNotice = { id: `${post.postId}:${p.id}`, owner: owner.handle, text: crowd.text.slice(0, 120), world: where, at: now };
    await redis().multi().lpush(kNotices(p.id), JSON.stringify(notice)).ltrim(kNotices(p.id), 0, NOTICE_KEEP - 1).expire(kNotices(p.id), 3 * 3600).exec().catch(() => {});
  }

  return crowd;
}

/** After new posts land (sync or check): bring the crowd for the newest one that qualifies. */
export async function crowdForNewPosts(worldId: string): Promise<Crowd | null> {
  const world = await db.world.findUnique({ where: { id: worldId }, include: { owner: true } });
  if (!world) return null;
  const post = await db.structure.findFirst({
    where: { worldId, postedAt: { gte: new Date(Date.now() - FRESH_HOURS * 3600 * 1000) }, kind: { notIn: ['outbuilding', 'lantern'] } },
    orderBy: { postedAt: 'desc' },
  });
  if (!post) return null;
  return summonCrowd(world.owner, post, world.followersCount);
}

/**
 * The quick check from the game: one call for posts newer than the newest we have. New posts are written as
 * structures (the regular sync skips them as duplicates) and the newest one brings the crowd.
 * 'wait' = checked too recently; 'budget' = the monthly budget is too low for optional calls.
 */
export async function checkForNewPost(user: User, opts: { auto: boolean }): Promise<{ state: 'found' | 'none' | 'wait' | 'budget' | 'no_world' | 'error'; crowd?: Crowd | null; retryIn?: number }> {
  const world = await db.world.findUnique({ where: { xUserId: user.id } });
  if (!world || !world.newestPostId) return { state: 'no_world' };
  const budget = await budgetStatus().catch(() => null);
  if (!budget || budget.level === 'exhausted' || (opts.auto && budget.level !== 'ok')) return { state: 'budget' };
  const ok = await redis().set(kCheck(user.id), '1', 'EX', CHECK_GAP_S, 'NX');
  if (!ok) return { state: 'wait', retryIn: Math.max(1, await redis().ttl(kCheck(user.id))) };
  try {
    const { token, user: fresh } = await accessTokenFor(user);
    const page = await getUserTweets({ accessToken: token, userId: user.id, maxWaitMs: 8000 }, user.id, { sinceId: world.newestPostId, maxResults: 5, exclude: 'retweets,replies' });
    const rows = structureRows(world.id, user.id, page.tweets, page.media);
    if (!rows.length) return { state: 'none' };
    await db.structure.createMany({ data: rows, skipDuplicates: true });
    // with more than one page of new posts, leave newestPostId to the regular sync so it reads the gap
    if (!page.nextToken && page.newestId) await db.world.update({ where: { id: world.id }, data: { newestPostId: page.newestId } });
    const best = rows.filter((r) => bringsCrowd(r.kind)).sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime())[0];
    const crowd = best ? await summonCrowd(fresh, best, world.followersCount) : null;
    return { state: 'found', crowd };
  } catch (e) {
    console.error('[crowd] check', (e as Error).message);
    return { state: 'error' };
  }
}

/** Live crowds for these user ids (the viewer and the people around them). */
export async function liveCrowds(userIds: string[]): Promise<Crowd[]> {
  if (!userIds.length) return [];
  const raws = await redis().mget(...userIds.map(kCrowd)).catch(() => [] as (string | null)[]);
  const now = Date.now();
  return raws.flatMap((r) => {
    if (!r) return [];
    const c = JSON.parse(r) as Crowd;
    return c.until > now ? [c] : [];
  });
}

export async function crowdById(ownerId: string): Promise<Crowd | null> {
  return (await liveCrowds([ownerId]))[0] ?? null;
}

/** Remember which world the player is in, so notices sent to their followers point there. */
export async function noteWhere(userId: string, worldHandle: string) {
  await redis().set(kWhere(userId), worldHandle, 'EX', 180).catch(() => {});
}

/** Notices for this player (followers of theirs who posted), oldest first; reading clears them. */
export async function takeNotices(userId: string): Promise<CrowdNotice[]> {
  const r = await redis().multi().lrange(kNotices(userId), 0, -1).del(kNotices(userId)).exec().catch(() => null);
  const list = (r?.[0]?.[1] as string[] | undefined) ?? [];
  return list.map((s) => JSON.parse(s) as CrowdNotice).reverse();
}

/** The system prompt for a follower in someone's crowd. */
export function followerPrompt(c: Crowd, f: CrowdFollower, ctx: { handle: string }) {
  const you = ctx.handle.toLowerCase() === c.owner.toLowerCase() ? `the poster, @${c.owner}` : `@${ctx.handle}, who is standing in @${c.owner}'s crowd with you`;
  return [
    `You are ${f.name} (@${f.handle}), one of @${c.owner}'s followers on X, in Tweetlife, a 3D social life game where everyone's X account is a city. You pulled up in person because @${c.owner} just posted this on X: "${c.text || '(a photo)'}". A crowd of their followers gathered around them to cheer and react.`,
    `You are not the real @${f.handle}; you are an AI-played version of a follower, so never claim things about their real life, job or opinions. Talk like a friendly, hyped X follower: react to the post, banter, ask what's next.`,
    `You are chatting face to face with ${you}.`,
    'Game vocabulary you can use naturally: bags = in-game money; gas = energy; vibes = fun; clout = social standing; the Trenches = the memecoin trading area. Posting on X is what brings followers out in Tweetlife.',
    'Rules: reply in 1 to 3 short sentences (under 50 words), plain text, no markdown, no lists. Keep it friendly and PG-13. Never give real financial, medical or legal advice. Never ask for passwords, seed phrases or private keys. If someone sincerely asks whether you are a real person, say honestly that you are an AI-played follower in Tweetlife, then carry on.',
  ].join('\n\n');
}

/** Canned lines when the AI is unavailable. */
export function followerCanned(c: Crowd, said: string) {
  const lines = [
    `Saw your post and pulled up straight away 🔥`,
    `@${c.owner} cooking again. Notifications on 🔔`,
    `This one's going viral, mark my words.`,
    `Had to come see the poster in person 😂`,
    `W post. What are you dropping next?`,
  ];
  return lines[hash(said + Math.floor(Date.now() / 60000)) % lines.length];
}
