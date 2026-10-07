import { xFetch } from './client';
import type { XMedia, XPage, XSingle, XTweet, XUser } from './types';

// Typed wrappers over the three endpoints the product reads.

const USER_FIELDS = 'created_at,profile_image_url,public_metrics';
const TWEET_FIELDS = 'public_metrics,created_at,referenced_tweets,attachments,conversation_id,author_id,in_reply_to_user_id';
const MEDIA_FIELDS = 'media_key,type,url,preview_image_url';

type Ctx = { accessToken: string; userId: string | null; maxWaitMs?: number };

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

export type FollowingPage = { ids: string[]; nextToken?: string };

/** One page (max 1000) of accounts `xUserId` follows. */
export async function getFollowing(ctx: Ctx, xUserId: string, paginationToken?: string): Promise<FollowingPage> {
  const r = await xFetch<XPage<XUser>>({
    path: `/2/users/${xUserId}/following`,
    query: { max_results: 1000, pagination_token: paginationToken, 'user.fields': 'id' },
    ...ctx,
  });
  return { ids: (r.data ?? []).map((u) => u.id), nextToken: r.meta?.next_token };
}
