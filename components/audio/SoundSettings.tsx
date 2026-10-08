'use client';
import { useSoundSettings, type Bus } from '@/lib/audio/settings';
import { sfx } from '@/lib/audio/sfx';
import { unlockAudio } from '@/lib/audio/engine';

// Phone → Settings → Sound: one switch for all sound and a slider per mix bus. Saved on this device.

const SLIDERS: { bus: Bus; label: string; emoji: string; hint: string }[] = [
  { bus: 'master', label: 'Master', emoji: '🔊', hint: 'Everything' },
  { bus: 'music', label: 'Music', emoji: '🎵', hint: 'Club, lounge, title theme' },
  { bus: 'sfx', label: 'Effects', emoji: '👟', hint: 'Steps, cars, coins, phone' },
  { bus: 'ambience', label: 'City', emoji: '🏙️', hint: 'Traffic hum, birds, wind, crowds' },
];

export function SoundSettings() {
  const s = useSoundSettings();
  return (
    <div className="rounded-2xl bg-white/5 p-3">
      <div className="flex items-center justify-between">
        <p className="label">Sound</p>
        <button
          className={`rounded-full px-3 py-1 text-xs font-semibold ${s.muted ? 'bg-white/10 text-white/70' : 'bg-emerald-500/80 text-white'}`}
          onClick={() => {
            unlockAudio();
            s.toggleMuted();
          }}
        >
          {s.muted ? '🔇 Off' : '🔊 On'}
        </button>
      </div>
      <div className={`mt-2 space-y-2 ${s.muted ? 'opacity-50' : ''}`}>
        {SLIDERS.map((x) => (
          <label key={x.bus} className="block">
            <span className="flex items-center justify-between text-xs">
              <span>
                {x.emoji} {x.label} <span className="text-white/45">· {x.hint}</span>
              </span>
              <span className="num text-white/60">{Math.round(s[x.bus] * 100)}</span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(s[x.bus] * 100)}
              aria-label={`${x.label} volume`}
              className="mt-1 w-full accent-emerald-400"
              onChange={(e) => s.setVolume(x.bus, Number(e.target.value) / 100)}
              // a sample of the bus you're changing, once you let go
              onPointerUp={() => sfx(x.bus === 'music' ? 'unbox' : x.bus === 'ambience' ? 'notify' : 'coins', { v: 2 })}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
