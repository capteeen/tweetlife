// Run `prisma migrate deploy` against whichever Postgres URL the host provides.
// Used by `vercel-build` so a Vercel deploy needs no manual migration step. Skips (with a loud note) when
// no database URL is present, so preview builds without storage still succeed.
import { spawnSync } from 'node:child_process';

const PREFERRED = ['DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_PRISMA_URL', 'POSTGRES_URL_NON_POOLING', 'DATABASE_URL_UNPOOLED'];
const isPg = (v) => !!v && /^postgres(ql)?:\/\//i.test(v);
let url = PREFERRED.map((n) => process.env[n]).find(isPg);
if (!url) url = Object.entries(process.env).find(([k, v]) => /_URL$|_URI$|_DSN$/i.test(k) && isPg(v))?.[1];
if (!url) {
  const names = Object.keys(process.env).filter((k) => /POSTGRES|DATABASE|PRISMA|NEON/i.test(k));
  console.warn(`[migrate] no postgres:// URL in the environment; skipping migrations. Storage-looking variables present: ${names.join(', ') || 'none'}`);
  process.exit(0);
}
// When the running site has used up the database's connections, a deploy (often the one that fixes it) would
// fail here. Wait and retry a few times before giving up; any other error fails the build at once.
const busy = /too many (database )?connections|remaining connection slots/i;
for (let attempt = 1; ; attempt++) {
  const res = spawnSync('npx', ['prisma', 'migrate', 'deploy'], { encoding: 'utf8', env: { ...process.env, DATABASE_URL: url } });
  process.stdout.write(res.stdout ?? '');
  process.stderr.write(res.stderr ?? '');
  if (res.status === 0) process.exit(0);
  if (attempt >= 6 || !busy.test(`${res.stdout}${res.stderr}`)) process.exit(res.status ?? 1);
  console.warn(`[migrate] database is out of connections; retrying in 20s (attempt ${attempt + 1} of 6)`);
  await new Promise((r) => setTimeout(r, 20_000));
}
