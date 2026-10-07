import { TitleScreen } from '@/components/title/TitleScreen';
import { getSession } from '@/lib/session';
import { env, envProblems } from '@/lib/env';
import { SetupNotice, probeDatabase } from '@/components/ui/SetupNotice';
import { findWorldByHandle } from '@/lib/world/load';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

// The title screen. Behind the menu: the operator's own public world, live and labelled as the real account
// it is — never a fabricated showcase. Without one, scenery only.

export default async function Landing({ searchParams }: { searchParams: { auth_error?: string } }) {
  const user = await getSession();
  const problems = envProblems();
  const dbProblem = await probeDatabase();
  const configured = problems.length === 0 && !dbProblem;
  const operatorHandle = configured ? env().OPERATOR_HANDLE.replace(/^@/, '') : '';
  const operator = operatorHandle ? await findWorldByHandle(operatorHandle).catch(() => null) : null;
  const showcase = operator && operator.access === 'public' && operator.ingestState !== 'queued' ? operator : null;
  const liveWorlds = configured ? await db.world.count({ where: { ingestState: 'live' } }).catch(() => 0) : 0;

  return (
    <TitleScreen
      backdropHandle={showcase?.handle ?? null}
      signedInHandle={user?.handle ?? null}
      authError={searchParams.auth_error}
      liveWorlds={liveWorlds}
      configured={configured}
      setupNotice={configured ? undefined : <SetupNotice problems={problems} dbProblem={dbProblem} />}
    />
  );
}
