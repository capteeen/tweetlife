'use client';
import { create } from 'zustand';
import type { Furniture, FurnitureAction, HomeView } from '@/lib/life/home';

// State of the house screen: what's in the room, which piece is open, and what the avatar is busy with.

export type Acting = { item: Furniture; action: FurnitureAction; until: number } | null;

export type HomeState = {
  home: HomeView | null;
  error: string | null;
  selected: Furniture | null;
  acting: Acting;
  setHome: (h: HomeView | null, error?: string | null) => void;
  select: (f: Furniture | null) => void;
  setActing: (a: Acting) => void;
};

export const useHome = create<HomeState>((set) => ({
  home: null,
  error: null,
  selected: null,
  acting: null,
  setHome: (home, error = null) => set({ home, error }),
  select: (selected) => set({ selected }),
  setActing: (acting) => set({ acting }),
}));
