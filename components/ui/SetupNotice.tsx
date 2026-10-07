import { db } from '@/lib/db';

// Shown instead of a crash when the deployment is not configured yet. Names only — never values.

export async function probeDatabase(): Promise<string | null> {
  try {
    await db.$queryRaw`SELECT 1 FROM "World" LIMIT 1`;
    return null;
  } catch (e) {
    const msg = (e as Error).message;
    if (/does not exist/i.test(msg)) return 'The database is reachable but the schema is missing — run `npm run migrate` (Vercel does this in `vercel-build`).';
    if (/DATABASE_URL|datasource|Can't reach|ECONNREFUSED|ENOTFOUND|getaddrinfo/i.test(msg)) return 'The database is not reachable. Set DATABASE_URL (or connect a Postgres integration) and redeploy.';
    return `Database error: ${msg.split('\n')[0].slice(0, 200)}`;
  }
}

export function SetupNotice({ problems, dbProblem }: { problems: string[]; dbProblem: string | null }) {
  return (
    <div className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-5 text-sm text-amber-100">
      <p className="font-semibold">This deployment is not configured yet.</p>
      {problems.length > 0 && (
        <>
          <p className="mt-2 text-amber-100/80">Missing or invalid environment variables:</p>
          <ul className="mt-1 list-inside list-disc font-mono text-xs">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </>
      )}
      {dbProblem && <p className="mt-2 text-amber-100/80">{dbProblem}</p>}
      <p className="mt-3 text-xs text-amber-100/60">
        Set them in your host&apos;s environment settings and redeploy. The README lists every variable. Nothing is shown here that
        isn&apos;t real: no world exists until the operator signs in with X.
      </p>
    </div>
  );
}
