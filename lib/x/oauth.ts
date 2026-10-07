import type { User } from '@prisma/client';
import { db } from '../db';
import { env } from '../env';
import { decrypt, encrypt, randomToken, sha256base64url } from '../crypto';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { recordCall } from './budget';
import { XApiError } from './types';

// X OAuth 2.0 with PKCE (user context). Scopes are the minimum the product needs:
// read the owner's own tweets, read users, read follows, and refresh offline.

export const SCOPES = ['tweet.read', 'users.read', 'follows.read', 'offline.access'];

const AUTHORIZE_URL = 'https://x.com/i/oauth2/authorize';
const TOKEN_URL = 'https://api.x.com/2/oauth2/token';
const REVOKE_URL = 'https://api.x.com/2/oauth2/revoke';

export function redirectUri() {
  return `${env().NEXT_PUBLIC_APP_URL}/api/auth/x/callback`;
}

/** Begin a login. Stores verifier+return path in Redis keyed by state for 10 minutes. */
export type LoginAccess = 'followers' | 'public' | 'invite';

// The PKCE verifier and return path travel in a signed, httpOnly cookie (10 minutes) rather than a
// server-side store, so sign-in has no dependency beyond the X client id and the session secret.
const LOGIN_COOKIE = 'tl_login';

function loginSecret() {
  return new TextEncoder().encode(env().SESSION_SECRET);
}

/** Begin a login: set the state cookie and return the X authorize URL. */
export async function beginLogin(returnTo: string, access?: LoginAccess): Promise<string> {
  const state = randomToken(24);
  const verifier = randomToken(48);
  const challenge = sha256base64url(verifier);
  const jwt = await new SignJWT({ state, verifier, returnTo, access }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('10m').sign(loginSecret());
  cookies().set(LOGIN_COOKIE, jwt, { httpOnly: true, sameSite: 'lax', secure: true, path: '/api/auth/x', maxAge: 600 });
  const u = new URL(AUTHORIZE_URL);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', env().X_CLIENT_ID);
  u.searchParams.set('redirect_uri', redirectUri());
  u.searchParams.set('scope', SCOPES.join(' '));
  u.searchParams.set('state', state);
  u.searchParams.set('code_challenge', challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  return u.toString();
}

/** Validate the callback's state against the cookie and consume it. */
export async function consumeLoginState(state: string): Promise<{ verifier: string; returnTo: string; access?: LoginAccess } | null> {
  const raw = cookies().get(LOGIN_COOKIE)?.value;
  if (!raw) return null;
  cookies().set(LOGIN_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: true, path: '/api/auth/x', maxAge: 0 });
  try {
    const { payload } = await jwtVerify(raw, loginSecret());
    if (payload.state !== state) return null;
    return { verifier: String(payload.verifier), returnTo: String(payload.returnTo ?? '/my-world'), access: payload.access as LoginAccess | undefined };
  } catch {
    return null;
  }
}

type TokenResponse = {
  token_type: string;
  expires_in: number;
  access_token: string;
  scope: string;
  refresh_token?: string;
};

function authHeaders(): Record<string, string> {
  const e = env();
  const h: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' };
  if (e.X_CLIENT_SECRET) {
    h.authorization = `Basic ${Buffer.from(`${e.X_CLIENT_ID}:${e.X_CLIENT_SECRET}`).toString('base64')}`;
  }
  return h;
}

async function tokenRequest(params: Record<string, string>, label: string, userId: string | null): Promise<TokenResponse> {
  const body = new URLSearchParams({ client_id: env().X_CLIENT_ID, ...params });
  const started = Date.now();
  const res = await fetch(TOKEN_URL, { method: 'POST', headers: authHeaders(), body, cache: 'no-store' });
  await db.apiCall.create({ data: { userId, endpoint: label, status: res.status, durationMs: Date.now() - started } }).catch(() => {});
  await recordCall();
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new XApiError(`token endpoint ${res.status}: ${text.slice(0, 200)}`, res.status);
  }
  return (await res.json()) as TokenResponse;
}

export async function exchangeCode(code: string, verifier: string) {
  return tokenRequest(
    { grant_type: 'authorization_code', code, redirect_uri: redirectUri(), code_verifier: verifier },
    '/2/oauth2/token#code',
    null,
  );
}

export async function refreshTokens(user: User): Promise<User> {
  if (!user.refreshTokenEnc) throw new XApiError('no refresh token; user must sign in again', 401);
  const t = await tokenRequest(
    { grant_type: 'refresh_token', refresh_token: decrypt(user.refreshTokenEnc) },
    '/2/oauth2/token#refresh',
    user.id,
  );
  return db.user.update({
    where: { id: user.id },
    data: {
      accessTokenEnc: encrypt(t.access_token),
      refreshTokenEnc: t.refresh_token ? encrypt(t.refresh_token) : user.refreshTokenEnc,
      tokenExpiresAt: new Date(Date.now() + t.expires_in * 1000),
      scopes: t.scope,
    },
  });
}

/** Returns a usable bearer token, refreshing when within 2 minutes of expiry. */
export async function accessTokenFor(user: User): Promise<{ token: string; user: User }> {
  if (user.revokedAt) throw new XApiError('tokens revoked', 401);
  if (user.tokenExpiresAt.getTime() - Date.now() < 120_000) {
    const refreshed = await refreshTokens(user);
    return { token: decrypt(refreshed.accessTokenEnc), user: refreshed };
  }
  return { token: decrypt(user.accessTokenEnc), user };
}

/** Revoke both tokens at X and mark the user revoked. Used on world delete. */
export async function revokeTokens(user: User) {
  const tokens = [user.refreshTokenEnc, user.accessTokenEnc].filter(Boolean).map((t) => decrypt(t as string));
  for (const token of tokens) {
    const started = Date.now();
    const res = await fetch(REVOKE_URL, {
      method: 'POST',
      headers: authHeaders(),
      body: new URLSearchParams({ client_id: env().X_CLIENT_ID, token }),
      cache: 'no-store',
    }).catch(() => null);
    await db.apiCall
      .create({ data: { userId: user.id, endpoint: '/2/oauth2/revoke', status: res?.status ?? 0, durationMs: Date.now() - started } })
      .catch(() => {});
    await recordCall();
  }
  await db.user.update({
    where: { id: user.id },
    data: { revokedAt: new Date(), accessTokenEnc: '', refreshTokenEnc: null },
  });
}
