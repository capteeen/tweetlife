import type { User } from '@prisma/client';
import { redis } from '../redis';
import { getConnectionStatus, getFollowing } from './api';
import { accessTokenFor } from './oauth';
import { LimiterTimeout } from './limiter';
import { BudgetExhaustedError, XApiError } from './types';

// "Does visitor follow owner?" Answered from Redis whenever possible, otherwise by looking the owner up on the
// visitor's own token and reading X's connection_status: one user read ($0.010 on pay-per-use). Walking the visitor's
// following list instead would bill every account on it ($0.010 each, $10 per page of 1000).
// Positive answers cache 24h, negatives 1h. Any failure returns `unknown` — the caller fails closed.

export type Relationship = 'follows' | 'not_following' | 'unknown';
export type RelationshipResult = { state: Relationship; cached: boolean; reason?: string };

const POSITIVE_TTL = 60 * 60 * 24;
const NEGATIVE_TTL = 60 * 60;
// When X leaves connection_status out, the visitor's newest follows (X lists them newest first) are checked instead:
// that catches someone who just followed to get in, for at most this many user reads.
const FALLBACK_FOLLOWS = 100;

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
    const status = await getConnectionStatus(ctx, ownerXUserId);
    const follows = status
      ? status.includes('following')
      : (await getFollowing(ctx, visitor.id, undefined, FALLBACK_FOLLOWS)).ids.includes(ownerXUserId);
    await redis().set(key(visitor.id, ownerXUserId), follows ? '1' : '0', 'EX', follows ? POSITIVE_TTL : NEGATIVE_TTL).catch(() => {});
    return { state: follows ? 'follows' : 'not_following', cached: false };
  } catch (e) {
    if (e instanceof BudgetExhaustedError) return { state: 'unknown', cached: false, reason: 'The X API budget is used up for now, so follow checks are paused. Try again later.' };
    if (e instanceof LimiterTimeout) return { state: 'unknown', cached: false, reason: 'X request queue is busy — try again shortly.' };
    if (e instanceof XApiError && e.isRateLimit) return { state: 'unknown', cached: false, reason: 'X rate limit hit — try again shortly.' };
    if (e instanceof XApiError && e.isAuth) return { state: 'unknown', cached: false, reason: 'Your X sign-in has expired. Sign in again.' };
    console.error('[relationship]', (e as Error).message);
    return { state: 'unknown', cached: false, reason: "Can't verify the follow right now — try again shortly." };
  }
}
