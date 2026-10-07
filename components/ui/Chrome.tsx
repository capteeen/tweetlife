import Link from 'next/link';
import type { SessionUser } from '@/lib/session';

export function XMark({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function SignInButton({ returnTo = '/my-world', label = 'Sign in with X' }: { returnTo?: string; label?: string }) {
  return (
    <a className="btn" href={`/api/auth/x/login?returnTo=${encodeURIComponent(returnTo)}`}>
      <XMark /> {label}
    </a>
  );
}

export function Header({ user }: { user: SessionUser | null }) {
  return (
    <header className="sticky top-0 z-30 chrome border-x-0 border-t-0">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          TweetLife
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link className="btn-ghost !px-3 !py-1.5" href="/explore">Explore</Link>
          <Link className="btn-ghost !px-3 !py-1.5" href="/how">How it grows</Link>
          <Link className="btn-ghost !px-3 !py-1.5" href="/status">Status</Link>
          {user ? (
            <Link className="btn !px-3 !py-1.5" href="/my-world">
              @{user.handle}
            </Link>
          ) : (
            <a className="btn !px-3 !py-1.5" href="/api/auth/x/login?returnTo=/my-world">
              <XMark /> Sign in
            </a>
          )}
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mx-auto max-w-6xl px-4 py-10 text-xs text-white/45">
      <p>
        TweetLife is an unofficial fan project. It is not affiliated with, endorsed by, or sponsored by X Corp. Worlds are built only
        from data the signed-in account authorises us to read. <Link className="underline" href="/how">How a world grows</Link> ·{' '}
        <Link className="underline" href="/status">Status</Link>
      </p>
    </footer>
  );
}
