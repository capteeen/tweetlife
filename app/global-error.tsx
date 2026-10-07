'use client';

// Root error boundary (replaces the layout when even the layout fails).
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: '#0B0E14', color: '#e8ecf3', fontFamily: 'Inter, system-ui, sans-serif', margin: 0 }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ maxWidth: 440, textAlign: 'center' }}>
            <h1 style={{ fontSize: 18, fontWeight: 600 }}>Something failed on the server.</h1>
            <p style={{ fontSize: 14, opacity: 0.7, marginTop: 8 }}>
              If this deployment is new, its environment is probably incomplete. Check the host&apos;s logs and the README&apos;s variable list.
            </p>
            {error.digest && <p style={{ fontSize: 12, opacity: 0.4, marginTop: 8 }}>digest {error.digest}</p>}
            <button onClick={() => reset()} style={{ marginTop: 16, background: '#1D9BF0', color: '#fff', border: 0, borderRadius: 999, padding: '8px 16px' }}>
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
