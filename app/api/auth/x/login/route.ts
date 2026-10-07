import { NextResponse, type NextRequest } from 'next/server';
import { envProblems } from '@/lib/env';
import { beginLogin, type LoginAccess } from '@/lib/x/oauth';

export const dynamic = 'force-dynamic';

// Start the X sign-in. Never a blank page: any failure redirects home with the real reason.
export async function GET(req: NextRequest) {
  const returnTo = req.nextUrl.searchParams.get('returnTo') ?? '/my-world';
  // Only allow same-origin relative return paths.
  const safe = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/my-world';
  const a = req.nextUrl.searchParams.get('access');
  const access: LoginAccess | undefined = a === 'followers' || a === 'public' || a === 'invite' ? a : undefined;
  const home = new URL('/', req.nextUrl.origin);
  const fail = (msg: string) => {
    home.searchParams.set('auth_error', msg);
    return NextResponse.redirect(home);
  };

  const problems = envProblems();
  if (problems.length) return fail(`deployment not configured — missing or invalid: ${problems.join(', ')}`);
  try {
    const url = await beginLogin(safe, access);
    return NextResponse.redirect(url);
  } catch (e) {
    const msg = (e as Error).message;
    console.error('[auth login]', msg);
    return fail(`could not start the sign-in: ${msg.slice(0, 160)}`);
  }
}
