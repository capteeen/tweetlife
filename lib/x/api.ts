import { xFetch } from './client';
import type { XMedia, XPage, XSingle, XTweet, XUser } from './types';

// Typed wrappers over the endpoints the product reads. On X's pay-per-use plan every post ($0.005) and every
// user ($0.010) a response returns is billed, so callers ask for as few objects as the game needs.

const USER_FIELDS = 'created_at,profile_image_url,public_metrics';
const TWEET_FIELDS = 'public_metrics,created_at,referenced_tweets,attachments,conversation_id,author_id,in_reply_to_user_id';
const MEDIA_FIELDS = 'media_key,type,url,preview_image_url';

type Ctx = { accessToken: string; userId: string | null; maxWaitMs?: number; ignoreBudget?: boolean };

export async function getMe(ctx: Ctx): Promise<XUser> {
  const r = await xFetch<XSingle<XUser>>({ path: '/2/users/me', query: { 'user.fields': USER_FIELDS }, ...ctx });
  if (!r.data) throw new Error('users/me returned no data');
  return r.data;
}

export type TweetPage = { tweets: XTweet[]; media: Map<string, XMedia>; nextToken?: string; newestId?: string; oldestId?: string };

export async function getUserTweets(
  ctx: Ctx,
  xUserId: string,
  opts: { paginationToken?: string; sinceId?: string; untilId?: string; maxResults?: number } = {},
): Promise<TweetPage> {
  const r = await xFetch<XPage<XTweet>>({
    path: `/2/users/${xUserId}/tweets`,
    query: {
      max_results: opts.maxResults ?? 100,
      'tweet.fields': TWEET_FIELDS,
      expansions: 'attachments.media_keys',
      'media.fields': MEDIA_FIELDS,
      pagination_token: opts.paginationToken,
      since_id: opts.sinceId,
      until_id: opts.untilId,
    },
    ...ctx,
  });
  const media = new Map<string, XMedia>();
  for (const m of r.includes?.media ?? []) media.set(m.media_key, m);
  return { tweets: r.data ?? [], media, nextToken: r.meta?.next_token, newestId: r.meta?.newest_id, oldestId: r.meta?.oldest_id };
}

/** Re-read metrics for up to 100 tweet ids. */
export async function getTweetsByIds(ctx: Ctx, ids: string[]): Promise<XTweet[]> {
  if (ids.length === 0) return [];
  const r = await xFetch<XPage<XTweet>>({
    path: '/2/tweets',
    query: { ids: ids.slice(0, 100).join(','), 'tweet.fields': 'public_metrics' },
    ...ctx,
  });
  return r.data ?? [];
}

/**
 * How the signed-in user (ctx's token) relates to one account: X's connection_status, e.g. ['following'] when they
 * follow it. One user read. null when X left the field out, which it may do when there is no relationship at all.
 */
export async function getConnectionStatus(ctx: Ctx, targetXUserId: string): Promise<string[] | null> {
  const r = await xFetch<XSingle<XUser>>({ path: `/2/users/${targetXUserId}`, query: { 'user.fields': 'connection_status' }, ...ctx });
  return r.data?.connection_status ?? null;
}

export type FollowingPage = { ids: string[]; nextToken?: string };

/** One page (max 1000) of accounts `xUserId` follows, newest follows first. Billed per account returned. */
export async function getFollowing(ctx: Ctx, xUserId: string, paginationToken?: string, maxResults = 1000): Promise<FollowingPage> {
  const r = await xFetch<XPage<XUser>>({
    path: `/2/users/${xUserId}/following`,
    query: { max_results: maxResults, pagination_token: paginationToken, 'user.fields': 'id' },
    ...ctx,
  });
  return { ids: (r.data ?? []).map((u) => u.id), nextToken: r.meta?.next_token };
}

/** The account's newest followers (X lists them most recent first), with names and avatars. One call, billed per follower. */
export async function getFollowers(ctx: Ctx, xUserId: string, maxResults: number): Promise<XUser[]> {
  const r = await xFetch<XPage<XUser>>({
    path: `/2/users/${xUserId}/followers`,
    query: { max_results: maxResults, 'user.fields': 'profile_image_url,public_metrics' },
    ...ctx,
  });
  return r.data ?? [];
}
