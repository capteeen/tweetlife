'use client';
import { useEffect, useRef } from 'react';

// Twin virtual sticks for mobile. Left moves, right looks. Values are read by Player each frame.
export const sticks = { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } };

function Stick({ side }: { side: 'left' | 'right' }) {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const active = useRef<{ id: number; cx: number; cy: number } | null>(null);
  const R = 44;

  useEffect(() => {
    const el = base.current;
    if (!el) return;
    const set = (x: number, y: number) => {
      sticks[side].x = x;
      sticks[side].y = y;
      if (knob.current) knob.current.style.transform = `translate(${x * R}px, ${y * R}px)`;
    };
    const down = (e: PointerEvent) => {
      if (active.current) return;
      el.setPointerCapture(e.pointerId);
      const r = el.getBoundingClientRect();
      active.current = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
      e.preventDefault();
    };
    const move = (e: PointerEvent) => {
      const a = active.current;
      if (!a || a.id !== e.pointerId) return;
      let dx = (e.clientX - a.cx) / R, dy = (e.clientY - a.cy) / R;
      const l = Math.hypot(dx, dy);
      if (l > 1) {
        dx /= l;
        dy /= l;
      }
      set(dx, dy);
    };
    const up = (e: PointerEvent) => {
      if (!active.current || active.current.id !== e.pointerId) return;
      active.current = null;
      set(0, 0);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
  }, [side]);

  return (
    <div
      ref={base}
      className={`pointer-events-auto absolute bottom-24 ${side === 'left' ? 'left-6' : 'right-6'} h-28 w-28 rounded-full chrome touch-none select-none`}
      style={{ borderRadius: '9999px' }}
      aria-label={side === 'left' ? 'Move' : 'Look'}
    >
      <div ref={knob} className="absolute left-1/2 top-1/2 -ml-6 -mt-6 h-12 w-12 rounded-full bg-white/25" />
    </div>
  );
}

export function TouchSticks() {
  const isTouch = typeof window !== 'undefined' && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);
  if (!isTouch) return null;
  return (
    <>
      <Stick side="left" />
      <Stick side="right" />
    </>
  );
}
