'use client';
import { useWorld } from '@/components/world/store';

// Bottom-left needs: Vibes / Clout / Gas.
export function StatBars() {
  const me = useWorld((s) => s.life?.me ?? null);
  const riding = useWorld((s) => s.riding);
  if (!me) return null;
  const rows: { k: string; v: number; e: string; c: string }[] = [
    { k: 'Vibes', v: me.vibes, e: '🎉', c: '#FF5D8F' },
    { k: 'Clout', v: me.clout, e: '💬', c: '#1D9BF0' },
    { k: 'Gas', v: me.gas, e: '⚡', c: '#FFD166' },
  ];
  return (
    <div className="pointer-events-auto absolute left-3 top-16 z-10 w-44 rounded-2xl chrome p-3 text-xs">
      <div className="mb-2 flex items-center gap-2">
        {me.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={me.avatarUrl} alt="" className="h-7 w-7 rounded-full" />
        ) : (
          <span className="h-7 w-7 rounded-full bg-white/10" />
        )}
        <div className="min-w-0">
          <div className="truncate font-semibold">@{me.handle}</div>
          <div className="truncate text-white/55">{riding ? `${riding.emoji} riding the ${riding.name}` : me.status}</div>
        </div>
      </div>
      {rows.map((r) => (
        <div key={r.k} className="mb-1.5 flex items-center gap-2">
          <span className="w-4 text-center">{r.e}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full transition-all" style={{ width: `${r.v}%`, background: r.c }} />
          </div>
          <span className="num w-7 text-right text-white/70">{r.v}</span>
        </div>
      ))}
    </div>
  );
}
