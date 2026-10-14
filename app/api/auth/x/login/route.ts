import { NextResponse, type NextRequest } from 'next/server';
import { envProblems } from '@/lib/env';
import { appOrigin, beginLogin, type LoginAccess } from '@/lib/x/oauth';

export const dynamic = 'force-dynamic';

// Start the X sign-in. Never a blank page: any failure redirects home with the real reason.
export async function GET(req: NextRequest) {
  const returnTo = req.nextUrl.searchParams.get('returnTo') ?? '/play';
  // Only allow same-origin relative return paths.
  const safe = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/play';
  const a = req.nextUrl.searchParams.get('access');
  const access: LoginAccess | undefined = a === 'followers' || a === 'public' || a === 'invite' ? a : undefined;
  const home = new URL('/', req.nextUrl.origin);
  const fail = (msg: string) => {
    home.searchParams.set('auth_error', msg);
    return NextResponse.redirect(home);
  };

  const problems = envProblems();
  if (problems.length) return fail(`deployment not configured — missing or invalid: ${problems.join(', ')}`);

  // X sends the player back to the site's own address (NEXT_PUBLIC_APP_URL). The login cookie must be set on
  // that same host, or the callback finds nothing and the player sees "login expired". So a sign-in started on
  // any other address (the *.vercel.app name, www vs no www, a deployment URL) first moves to the site's address.
  const site = appOrigin();
  // The host the browser asked for (req.nextUrl can carry the server's own address instead).
  // `moved` guards against a loop if the host ever reads differently behind a proxy.
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '').split(',')[0].trim().toLowerCase();
  if (host && host !== new URL(site).host && !isLocal(site) && !req.nextUrl.searchParams.has('moved')) {
    const here = new URL(req.nextUrl.pathname + req.nextUrl.search, site);
    here.searchParams.set('moved', '1');
    return NextResponse.redirect(here);
  }
  try {
    const url = await beginLogin(safe, access);
    return NextResponse.redirect(url);
  } catch (e) {
    const msg = (e as Error).message;
    console.error('[auth login]', msg);
    return fail(`could not start the sign-in: ${msg.slice(0, 160)}`);
  }
}

function isLocal(origin: string) {
  const host = new URL(origin).hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';
}
