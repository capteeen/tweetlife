import type { IngestRun, RunKind, StructureKind } from '@prisma/client';
import { db } from '../db';
import { env } from '../env';
import { redis } from '../redis';
import { getMe, getTweetsByIds, getUserTweets } from './api';
import { accessTokenFor } from './oauth';
import { classifyTweet } from '../world/classify';
import type { XMedia, XTweet } from './types';
import { crowdForNewPosts } from '../life/crowd';
import { PLOT_LOTS } from '../world/country-map';

// Ingestion: turn the owner's real timeline into Structure rows, one page at a time,
// so the world is walkable while the rest of the history is still arriving.

const PAGE_SIZE = 100;
/** Posts that stand on a plot of their own. Lamps (reposts) and sheds (replies to others) attach to a neighbour. */
const NOT_STANDING: StructureKind[] = ['lantern', 'outbuilding'];
/** A sync after a long absence reads at most one page of new posts; X bills every post read. */
const INCREMENTAL_MAX_POSTS = PAGE_SIZE;
const WORKER_MAX_WAIT = 10 * 60 * 1000;
/** Metrics are re-read for posts this recent. Likes and reposts mostly land in a post's first days. */
const METRICS_DAYS = 7;
/** The profile (follower count, avatar) is re-read at most this often; each read is billed. */
const PROFILE_EVERY_S = 20 * 3600;

export type Progress = { postsWritten: number; pagesFetched: number; calls: number };

function progressKey(worldId: string) {
  return `ingest:progress:${worldId}`;
}

export async function readProgress(worldId: string): Promise<(Progress & { at: number }) | null> {
  const raw = await redis().get(progressKey(worldId)).catch(() => null);
  return raw ? JSON.parse(raw) : null;
}

async function publishProgress(worldId: string, p: Progress) {
  await redis().set(progressKey(worldId), JSON.stringify({ ...p, at: Date.now() }), 'EX', 3600).catch(() => {});
}

export function structureRows(worldId: string, ownerId: string, tweets: XTweet[], media: Map<string, XMedia>) {
  return tweets
    .filter((t) => t.created_at) // a post with no created_at cannot be placed; X always sends it when requested
    .map((t) => {
      const c = classifyTweet(t, ownerId, media);
      const m = t.public_metrics;
      return {
        worldId,
        postId: t.id,
        kind: c.kind,
        conversationId: c.conversationId,
        referencedId: c.referencedId,
        text: t.text,
        mediaUrl: c.mediaUrl,
        mediaKind: c.mediaKind,
        likes: m?.like_count ?? null,
        reposts: m?.retweet_count ?? null,
        replies: m?.reply_count ?? null,
        impressions: m?.impression_count ?? null,
        postedAt: new Date(t.created_at as string),
        metricsAt: new Date(),
      };
    });
}

async function ownerContext(worldId: string) {
  const world = await db.world.findUniqueOrThrow({ where: { id: worldId }, include: { owner: true } });
  const { token, user } = await accessTokenFor(world.owner);
  return { world, user, ctx: { accessToken: token, userId: user.id, maxWaitMs: WORKER_MAX_WAIT } };
}

/** Refresh profile metrics (followers, post count, avatar) at most once per PROFILE_EVERY_S. One user read. */
async function syncProfileDaily(worldId: string) {
  const fresh = await redis().set(`profile:synced:${worldId}`, '1', 'EX', PROFILE_EVERY_S, 'NX').catch(() => 'OK');
  if (!fresh) return false;
  await syncProfile(worldId);
  return true;
}

/** Refresh profile metrics (followers, post count, avatar). One call. */
export async function syncProfile(worldId: string) {
  const { world, ctx } = await ownerContext(worldId);
  const me = await getMe(ctx);
  await db.user.update({
    where: { id: world.xUserId },
    data: { handle: me.username, name: me.name, avatarUrl: me.profile_image_url ?? null },
  });
  await db.world.update({
    where: { id: worldId },
    data: {
      handle: me.username,
      followersCount: me.public_metrics?.followers_count ?? world.followersCount,
      followingCount: me.public_metrics?.following_count ?? world.followingCount,
      postCount: me.public_metrics?.tweet_count ?? world.postCount,
      accountCreatedAt: me.created_at ? new Date(me.created_at) : world.accountCreatedAt,
    },
  });
  return me;
}

export type StepOptions = {
  /** Stop (returning done: false) once this time passes; the run resumes on the next step. Inline mode. */
  deadline?: number;
};

/**
 * First build or incremental sync. Walks pagination writing structures as each page lands.
 * `run` is the IngestRun row; counts are updated on it per page. Resumable: a first build resumes below
 * the oldest post already stored, an incremental run restarts from since_id (duplicates are skipped).
 */
export async function ingestTimeline(run: IngestRun, kind: Extract<RunKind, 'first_build' | 'incremental'>, opts: StepOptions = {}) {
  const { world, ctx } = await ownerContext(run.worldId);
  const maxPosts = env().X_FIRST_BUILD_MAX_POSTS;
  const progress: Progress = { postsWritten: run.postsWritten, pagesFetched: run.pagesFetched, calls: run.calls };

  await db.world.update({ where: { id: world.id }, data: { ingestState: 'building', ingestError: null } });

  // Profile first (once per run, at most once a day): followers_count sets the boundary; also confirms the token works.
  if (run.pagesFetched === 0 && (await syncProfileDaily(world.id))) progress.calls++;

  let paginationToken: string | undefined;
  let newestSeen: string | null = world.newestPostId;
  let oldestSeen: string | null = world.oldestPostId;
  const existing = await db.structure.count({ where: { worldId: world.id } });
  // X bills $0.005 for every post read, so a first build stops once the player's plot is full: the country map shows
  // a player's best PLOT_LOTS posts, and reading further back would only change which ones, not how the plot looks.
  let standing = await db.structure.count({ where: { worldId: world.id, kind: { notIn: NOT_STANDING } } });

  // First build resumes below our oldest known post if a previous attempt was interrupted.
  const untilId = kind === 'first_build' && oldestSeen ? oldestSeen : undefined;
  const sinceId = kind === 'incremental' ? newestSeen ?? undefined : undefined;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const page = await getUserTweets(ctx, world.xUserId, {
      paginationToken,
      sinceId,
      untilId,
      maxResults: PAGE_SIZE,
    });
    progress.calls++;
    progress.pagesFetched++;

    const rows = structureRows(world.id, world.xUserId, page.tweets, page.media);
    if (rows.length) {
      const res = await db.structure.createMany({ data: rows, skipDuplicates: true });
      progress.postsWritten += res.count;
      standing += rows.filter((r) => !NOT_STANDING.includes(r.kind)).length;
    }
    if (page.newestId && (!newestSeen || BigInt(page.newestId) > BigInt(newestSeen))) newestSeen = page.newestId;
    if (page.oldestId && (!oldestSeen || BigInt(page.oldestId) < BigInt(oldestSeen))) oldestSeen = page.oldestId;

    await Promise.all([
      db.ingestRun.update({ where: { id: run.id }, data: { ...progress, heartbeatAt: new Date() } }),
      // An incremental run only advances newestPostId when it completes, so an interrupted run re-reads
      // from the old since_id instead of skipping the pages it never reached.
      db.world.update({ where: { id: world.id }, data: { oldestPostId: oldestSeen, ...(kind === 'first_build' ? { newestPostId: newestSeen } : {}) } }),
      publishProgress(world.id, progress),
    ]);

    const total = existing + progress.postsWritten;
    if (!page.nextToken || page.tweets.length === 0) break;
    if (kind === 'first_build' && (total >= maxPosts || standing >= PLOT_LOTS)) break;
    if (kind === 'incremental' && progress.postsWritten >= INCREMENTAL_MAX_POSTS) break;
    paginationToken = page.nextToken;
    if (opts.deadline && Date.now() > opts.deadline) return { ...progress, done: false };
  }

  await db.world.update({
    where: { id: world.id },
    data: { ingestState: 'live', newestPostId: newestSeen, lastSyncAt: new Date(), nextSyncAt: new Date(Date.now() + 6 * 3600 * 1000) },
  });
  await redis().del(progressKey(world.id)).catch(() => {});
  // a fresh post found by the sync brings the owner's followers out (once per post; see lib/life/crowd.ts)
  if (kind === 'incremental' && progress.postsWritten > 0) await crowdForNewPosts(world.id).catch((e) => console.error('[crowd]', (e as Error).message));
  return { ...progress, done: true };
}

/** Nightly: re-read metrics for posts from the last METRICS_DAYS days, 100 ids per call. Lamps (reposts) don't use them. */
export async function refreshRecentMetrics(run: IngestRun) {
  const { world, ctx } = await ownerContext(run.worldId);
  const since = new Date(Date.now() - METRICS_DAYS * 24 * 3600 * 1000);
  const recent = await db.structure.findMany({
    where: { worldId: world.id, postedAt: { gte: since }, kind: { not: 'lantern' } },
    select: { id: true, postId: true },
  });
  const progress: Progress = { postsWritten: 0, pagesFetched: 0, calls: 0 };
  const byPostId = new Map(recent.map((s) => [s.postId, s.id]));

  for (let i = 0; i < recent.length; i += 100) {
    const chunk = recent.slice(i, i + 100).map((s) => s.postId);
    const tweets = await getTweetsByIds(ctx, chunk);
    progress.calls++;
    progress.pagesFetched++;
    for (const t of tweets) {
      const id = byPostId.get(t.id);
      const m = t.public_metrics;
      if (!id || !m) continue;
      await db.structure.update({
        where: { id },
        data: {
          likes: m.like_count,
          reposts: m.retweet_count,
          replies: m.reply_count,
          impressions: m.impression_count ?? null,
          metricsAt: new Date(),
        },
      });
      progress.postsWritten++;
    }
    await db.ingestRun.update({ where: { id: run.id }, data: { ...progress } });
  }
  if (await syncProfileDaily(world.id)) progress.calls++;
  await db.world.update({ where: { id: world.id }, data: { lastSyncAt: new Date() } });
  return { ...progress, done: true };
}
