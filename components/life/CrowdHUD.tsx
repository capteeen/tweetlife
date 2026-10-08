'use client';
import { useWorld } from '@/components/world/store';
import { postOnX } from './useCrowds';

// The "📣 Post" button (post on X, your followers pull up) and notices that someone you follow just posted.

export function PostButton() {
  const me = useWorld((s) => s.me);
  if (!me) return null;
  return (
    <button
      className="pointer-events-auto absolute bottom-44 right-3 z-20 [@media(any-pointer:coarse)]:bottom-[22rem] rounded-full bg-x px-4 py-2 text-sm font-semibold text-white shadow-lg hover:brightness-110"
      onClick={() => postOnX(me.handle)}
      title="Post on X and your followers pull up around you"
    >
      📣 Post on X
    </button>
  );
}

export function CrowdNotices({ world }: { world: string }) {
  const notices = useWorld((s) => s.crowdNotices);
  const drop = useWorld((s) => s.dropCrowdNotice);
  if (!notices.length) return null;
  return (
    <div className="pointer-events-none absolute left-1/2 top-28 z-30 flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2 max-sm:top-40">
      {notices.map((n) => {
        const here = n.world.toLowerCase() === world.toLowerCase();
        return (
          <div key={n.id} className="pointer-events-auto rounded-2xl chrome px-4 py-3 text-sm shadow-lg">
            <div className="flex items-start justify-between gap-2">
              <p>
                📣 <b>@{n.owner}</b> just posted{n.text ? <> “{n.text}”</> : null}. Their followers are gathering {here ? 'right here' : <>in @{n.world}&apos;s world</>}.
              </p>
              <button className="rounded-full px-1.5 hover:bg-white/10" onClick={() => drop(n.id)} aria-label="Dismiss">
                ✕
              </button>
            </div>
            {!here && (
              <a className="mt-2 inline-block rounded-full bg-x px-3 py-1 text-xs font-semibold text-white" href={`/w/${encodeURIComponent(n.world)}`}>
                Pull up
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}
