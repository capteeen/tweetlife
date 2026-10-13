'use client';
import { terrainOf } from '@/lib/world/ground';
import { townAt, townById } from '@/lib/world/towns';
import { useWorld } from './store';

/** The town (Pump.fun, StonkFun) you are standing in, on its island or bridge; null in the capital. */
export function useTownHere() {
  const id = useWorld((s) => {
    const g = s.model?.geometry;
    if (!g) return null;
    return townAt(terrainOf(g.blocks, g.grid, g.boundaryRadius).towns, s.playerPos.x, s.playerPos.z)?.town.id ?? null;
  });
  return id ? townById(id) : null;
}
