'use client';
import { useEffect } from 'react';
import { useWorld } from '@/components/world/store';

// The phone's Map app opens the full city map.
export function MapApp() {
  const setMapOpen = useWorld((s) => s.setMapOpen);
  const closePhone = useWorld((s) => s.closePhone);
  useEffect(() => {
    closePhone();
    setMapOpen(true);
  }, [closePhone, setMapOpen]);
  return <p className="text-sm text-white/60">Opening the city map…</p>;
}
