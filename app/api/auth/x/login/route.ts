import { NextResponse, type NextRequest } from 'next/server';
import { beginLogin } from '@/lib/x/oauth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const returnTo = req.nextUrl.searchParams.get('returnTo') ?? '/my-world';
  // Only allow same-origin relative return paths.
  const safe = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/my-world';
  const url = await beginLogin(safe);
  return NextResponse.redirect(url);
}
