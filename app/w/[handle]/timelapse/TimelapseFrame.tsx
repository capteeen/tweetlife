'use client';
import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { WorldModel } from '@/lib/world/load';
import { buildWorld, type StructureRow } from '@/lib/world/geometry';

const WorldCanvas = dynamic(() => import('@/components/world/WorldCanvas').then((m) => m.WorldCanvas), { ssr: false });

// One timelapse frame: the world as it stood at fraction t (0 = account creation, 1 = today).
// The worker drives t through window.tweetlifeSetFrame and screenshots each frame.

declare global {
  interface Window {
    tweetlifeSetFrame?: (t: number) => void;
    tweetlifeFrameReady?: boolean;
  }
}

export function TimelapseFrame({ model }: { model: WorldModel }) {
  const [t, setT] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    window.tweetlifeSetFrame = (v: number) => {
      window.tweetlifeFrameReady = false;
      setT(Math.max(0, Math.min(1, v)));
      requestAnimationFrame(() => requestAnimationFrame(() => (window.tweetlifeFrameReady = true)));
    };
    return () => {
      delete window.tweetlifeSetFrame;
    };
  }, []);

  const start = Date.parse(model.accountCreatedAt);
  const end = Date.now();
  const cutoff = start + (end - start) * t;

  // Rebuild geometry from the full structure list, restricted to posts up to the cutoff. Deterministic, same spiral.
  const rows = useMemo<StructureRow[]>(
    () =>
      model.geometry.structures.map((s) => ({
        id: s.id, postId: s.postId, kind: s.kind, conversationId: null, referencedId: null, text: s.text, mediaUrl: null, mediaKind: null,
        likes: s.likes, reposts: s.reposts, replies: s.replies, impressions: s.impressions, postedAt: s.postedAt, hidden: false, lanternsLit: 0,
      })),
    [model],
  );
  const geometry = useMemo(() => {
    const g = buildWorld(
      rows.filter((r) => Date.parse(r.postedAt) <= cutoff),
      { handle: model.handle, accountCreatedAt: new Date(model.accountCreatedAt), followersCount: model.followersCount, landmarkPostId: null, showReplies: true, now: new Date(cutoff) },
    );
    // keep the final boundary so the camera framing is stable across frames
    return { ...g, boundaryRadius: model.geometry.boundaryRadius };
  }, [rows, cutoff, model]);

  const R = model.geometry.boundaryRadius;
  const a = t * Math.PI * 0.9 + 0.6;
  const still = { x: Math.cos(a) * R * 1.15, y: R * 0.32 + 4, z: Math.sin(a) * R * 1.15, lookAt: [0, 3, 0] as [number, number, number] };

  return (
    <div className="fixed inset-0 bg-base">
      <WorldCanvas geometry={geometry} marks={[]} paths={[]} biome={model.biome} handle={model.handle} showMetrics={false} mode="still" still={still} onReady={() => setReady(true)} />
      <div className="pointer-events-none absolute bottom-6 left-6 text-white drop-shadow">
        <div className="text-3xl font-bold">@{model.handle}</div>
        <div className="num text-lg opacity-85">
          {new Date(cutoff).toLocaleDateString('en', { year: 'numeric', month: 'short' })} · {geometry.structures.length} posts
        </div>
      </div>
      <div id="tl-ready" data-ready={ready ? '1' : '0'} />
    </div>
  );
}
