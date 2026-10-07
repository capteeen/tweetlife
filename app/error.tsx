'use client';

// Route-level error boundary. Production hides the exception; we at least say where to look.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-base p-6">
      <div className="card max-w-md text-center">
        <h1 className="text-lg font-semibold">Something failed on the server.</h1>
        <p className="mt-2 text-sm text-white/60">
          This is a real error, not a placeholder. If this deployment is new, the environment is probably incomplete — the landing page
          and <a className="underline" href="/status">/status</a> say what is missing.
        </p>
        {error.digest && <p className="num mt-2 text-xs text-white/40">digest {error.digest}</p>}
        <div className="mt-4 flex justify-center gap-2">
          <button className="btn-ghost" onClick={() => reset()}>
            Try again
          </button>
          <a className="btn" href="/">
            Home
          </a>
        </div>
      </div>
    </div>
  );
}
