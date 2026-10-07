import type { User } from '@prisma/client';
import { redis } from '../redis';
import { getFollowing } from './api';
import { accessTokenFor } from './oauth';
import { LimiterTimeout } from './limiter';
import { BudgetExhaustedError, XApiError } from './types';

// "Does visitor follow owner?" — the expensive question. Answered from Redis whenever possible,
// otherwise by walking the visitor's following list on the visitor's own token.
// Positive answers cache 24h, negatives 1h. Any failure returns `unknown` — the caller fails closed.

export type Relationship = 'follows' | 'not_following' | 'unknown';
export type RelationshipResult = { state: Relationship; cached: boolean; reason?: string };

const POSITIVE_TTL = 60 * 60 * 24;
const NEGATIVE_TTL = 60 * 60;
// Walking more pages than this per check is a budget hazard; beyond it we answer honestly that we can't verify.
const MAX_PAGES = 5;

function key(visitorId: string, ownerId: string) {
  return `rel:${visitorId}:${ownerId}`;
}

export async function cachedRelationship(visitorId: string, ownerId: string): Promise<Relationship | null> {
  try {
    const v = await redis().get(key(visitorId, ownerId));
    return v === '1' ? 'follows' : v === '0' ? 'not_following' : null;
  } catch {
    return null;
  }
}

export async function invalidateRelationship(visitorId: string, ownerId: string) {
  await redis().del(key(visitorId, ownerId)).catch(() => {});
}

/**
 * Resolve whether `visitor` follows the account `ownerXUserId`, using the visitor's token.
 * The same function answers "does the owner follow the visitor back" when called with the owner as `visitor`.
 */
export async function doesFollow(visitor: User, ownerXUserId: string, opts: { maxWaitMs?: number } = {}): Promise<RelationshipResult> {
  if (visitor.id === ownerXUserId) return { state: 'follows', cached: true };
  const cached = await cachedRelationship(visitor.id, ownerXUserId);
  if (cached) return { state: cached, cached: true };

  try {
    const { token } = await accessTokenFor(visitor);
    const ctx = { accessToken: token, userId: visitor.id, maxWaitMs: opts.maxWaitMs ?? 20_000 };
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await getFollowing(ctx, visitor.id, pageToken);
      if (res.ids.includes(ownerXUserId)) {
        await redis().set(key(visitor.id, ownerXUserId), '1', 'EX', POSITIVE_TTL).catch(() => {});
        return { state: 'follows', cached: false };
      }
      if (!res.nextToken) {
        await redis().set(key(visitor.id, ownerXUserId), '0', 'EX', NEGATIVE_TTL).catch(() => {});
        return { state: 'not_following', cached: false };
      }
      pageToken = res.nextToken;
    }
    return { state: 'unknown', cached: false, reason: 'Your following list is too long to verify within budget right now.' };
  } catch (e) {
    if (e instanceof BudgetExhaustedError) return { state: 'unknown', cached: false, reason: 'Monthly X API budget is exhausted — follow checks are paused.' };
    if (e instanceof LimiterTimeout) return { state: 'unknown', cached: false, reason: 'X request queue is busy — try again shortly.' };
    if (e instanceof XApiError && e.isRateLimit) return { state: 'unknown', cached: false, reason: 'X rate limit hit — try again shortly.' };
    if (e instanceof XApiError && e.isAuth) return { state: 'unknown', cached: false, reason: 'Your X sign-in has expired. Sign in again.' };
    console.error('[relationship]', (e as Error).message);
    return { state: 'unknown', cached: false, reason: "Can't verify the follow right now — try again shortly." };
  }
}
