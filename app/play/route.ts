import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// "Take me into the game": signed in, you walk into your own world; signed out, sign in first and come back here.
// Sign-up and "My world" land here instead of on the owner dashboard, which lives under Phone → Settings.
export async function GET(req: NextRequest) {
  const session = await getSession();
  const to = session ? `/w/${encodeURIComponent(session.handle)}` : `/api/auth/x/login?returnTo=${encodeURIComponent('/play')}`;
  return NextResponse.redirect(new URL(to, req.nextUrl.origin));
}
