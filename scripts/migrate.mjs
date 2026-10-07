// Run `prisma migrate deploy` against whichever Postgres URL the host provides.
// Used by `vercel-build` so a Vercel deploy needs no manual migration step. Skips (with a loud note) when
// no database URL is present, so preview builds without storage still succeed.
import { spawnSync } from 'node:child_process';

const NAMES = ['DATABASE_URL', 'POSTGRES_PRISMA_URL', 'POSTGRES_URL', 'DATABASE_DATABASE_URL', 'STORAGE_DATABASE_URL', 'PRISMA_DATABASE_URL'];
const url = NAMES.map((n) => process.env[n]).find(Boolean);
if (!url) {
  console.warn('[migrate] no database URL in the environment (looked for ' + NAMES.join(', ') + '); skipping migrations.');
  process.exit(0);
}
const res = spawnSync('npx', ['prisma', 'migrate', 'deploy'], { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
process.exit(res.status ?? 1);
