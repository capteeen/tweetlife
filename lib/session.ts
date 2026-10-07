import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { env } from './env';
import { db } from './db';

// The browser session is a signed JWT cookie that carries only the X user id and handle.
// X tokens never leave the database.

const COOKIE = 'tl_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type SessionUser = { id: string; handle: string; name: string; avatarUrl: string | null };

function secret() {
  return new TextEncoder().encode(env().SESSION_SECRET);
}

export async function createSession(user: SessionUser) {
  const jwt = await new SignJWT({ handle: user.handle, name: user.name, avatarUrl: user.avatarUrl })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  cookies().set(COOKIE, jwt, {
    httpOnly: true,
    sameSite: 'none', // the world is embedded in tweet-card iframes; sign-in must survive that
    secure: true,
    path: '/',
    maxAge: MAX_AGE,
  });
}

export function clearSession() {
  cookies().set(COOKIE, '', { httpOnly: true, sameSite: 'none', secure: true, path: '/', maxAge: 0 });
}

export async function getSession(): Promise<SessionUser | null> {
  const raw = cookies().get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const { payload } = await jwtVerify(raw, secret());
    if (!payload.sub) return null;
    return {
      id: payload.sub,
      handle: String(payload.handle ?? ''),
      name: String(payload.name ?? ''),
      avatarUrl: (payload.avatarUrl as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

/** Session + a check that the user still exists and has not revoked. */
export async function getUser() {
  const s = await getSession();
  if (!s) return null;
  const user = await db.user.findUnique({ where: { id: s.id } });
  if (!user || user.revokedAt) return null;
  return user;
}
