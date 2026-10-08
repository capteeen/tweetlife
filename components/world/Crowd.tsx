'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { Crowd, CrowdFollower } from '@/lib/life/crowd';
import { residentLook, type Look } from '@/lib/life/look';
import type { Block, CityGrid } from '@/lib/world/geometry';
import { surfaceY } from '@/lib/world/ground';
import { useWorld } from './store';
import { Figure } from './Figure';
import { Bubble } from './CityResidents';
import type { FigureAct } from './figureMoves';

// Follower crowds (lib/life/crowd.ts): when someone posts on X, their followers walk in from the edge of the
// view, gather in a ring around the poster, cheer and react to the post, and follow them around until they
// head off. Each crowd hangs on its poster: you, or a visitor in this world. Tap a follower to talk.

/** Most followers drawn at once across every crowd, to keep phones smooth. */
const MAX_DRAWN = 40;
const WALK_IN_FROM = 34;
const WALK_SPEED = 5;
const CATCH_UP_SPEED = 8.5;
/** The last seconds of a crowd: everyone walks off. */
const LEAVING_S = 30;

export const followerKey = (c: Crowd, f: CrowdFollower) => `f:${c.ownerId}:${f.id}`;

/** Where each follower is now, for passing remarks. */
export const followerPos = new Map<string, { x: number; z: number }>();

export function Crowds({ blocks, grid, boundaryRadius }: { blocks: Block[]; grid: CityGrid; boundaryRadius: number }) {
  const crowds = useWorld((s) => s.crowds);
  const meId = useWorld((s) => s.me?.id ?? null);
  const peerHandles = useWorld((s) =>
    Object.values(s.peers)
      .filter((p) => Date.now() - p.at < 15000)
      .map((p) => p.handle.toLowerCase())
      .sort()
      .join(','),
  );
  const [, tick] = useState(0);
  // re-render when a crowd's time is up
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);
  const here = peerHandles.split(',');
  const shown = crowds.filter((c) => Date.now() < c.until && (c.ownerId === meId || here.includes(c.owner.toLowerCase())));
  let budget = MAX_DRAWN;
  return (
    <>
      {shown.map((c) => {
        const take = c.followers.slice(0, Math.max(0, budget));
        budget -= take.length;
        return <CrowdGroup key={`${c.ownerId}:${c.postId}`} crowd={c} followers={take} mine={c.ownerId === meId} blocks={blocks} grid={grid} boundaryRadius={boundaryRadius} />;
      })}
      <CrowdChatter />
    </>
  );
}

/** Where the poster is right now: you, or a visitor's last reported position. */
function anchorOf(c: Crowd, mine: boolean): { x: number; z: number } | null {
  const s = useWorld.getState();
  if (mine) return s.playerPos;
  const p = Object.values(s.peers).find((v) => v.handle.toLowerCase() === c.owner.toLowerCase());
  return p ? { x: p.x, z: p.z } : null;
}

function hash(s: string) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

function CrowdGroup({ crowd, followers, mine, blocks, grid, boundaryRadius }: { crowd: Crowd; followers: CrowdFollower[]; mine: boolean; blocks: Block[]; grid: CityGrid; boundaryRadius: number }) {
  // two loose rings around the poster, a little uneven so it reads as a crowd, not a formation
  const slots = useMemo(
    () =>
      followers.map((f, i) => {
        const h = hash(f.id + crowd.postId);
        const ring = i < 9 ? 0 : 1;
        const inRing = ring === 0 ? Math.min(9, followers.length) : followers.length - 9;
        const k = ring === 0 ? i : i - 9;
        const a = (k / Math.max(1, inRing)) * Math.PI * 2 + ring * 0.35 + ((h % 100) / 100 - 0.5) * 0.4;
        const r = (ring === 0 ? 3.4 : 5.4) + ((h >> 8) % 100) / 100;
        return { dx: Math.sin(a) * r, dz: Math.cos(a) * r, from: a + (((h >> 16) % 100) / 100 - 0.5) * 1.2, delay: i * 0.45 + ((h >> 4) % 10) / 10 };
      }),
    [followers, crowd.postId],
  );
  return (
    <>
      {followers.map((f, i) => (
        <Follower key={f.id} crowd={crowd} f={f} slot={slots[i]} mine={mine} blocks={blocks} grid={grid} boundaryRadius={boundaryRadius} />
      ))}
    </>
  );
}

// The same colour X shows you: each follower's shirt is the average colour of their profile picture.
const avatarColours = new Map<string, Promise<string | null>>();
function avatarColour(url: string | null): Promise<string | null> {
  if (!url || typeof document === 'undefined') return Promise.resolve(null);
  let p = avatarColours.get(url);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = c.height = 8;
          const ctx = c.getContext('2d');
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0, 8, 8);
          const d = ctx.getImageData(0, 0, 8, 8).data;
          let r = 0, g = 0, b = 0;
          for (let i = 0; i < d.length; i += 4) (r += d[i]), (g += d[i + 1]), (b += d[i + 2]);
          const n = d.length / 4;
          const col = new THREE.Color(r / n / 255, g / n / 255, b / n / 255);
          // lift dull averages so the shirt still reads as a colour
          const hsl = { h: 0, s: 0, l: 0 };
          col.getHSL(hsl);
          col.setHSL(hsl.h, Math.min(1, hsl.s * 1.35 + 0.08), Math.max(0.28, Math.min(0.7, hsl.l)));
          resolve(`#${col.getHexString()}`);
        } catch {
          resolve(null); // the image host refused CORS: keep the seeded colour
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
    avatarColours.set(url, p);
  }
  return p;
}

function useFollowerLook(f: CrowdFollower): Look {
  const base = useMemo(() => residentLook(`follower:${f.handle}`), [f.handle]);
  const [shirt, setShirt] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    avatarColour(f.avatar).then((c) => live && setShirt(c));
    return () => {
      live = false;
    };
  }, [f.avatar]);
  return useMemo(() => (shirt ? { ...base, shirt } : base), [base, shirt]);
}

const IDLE_ACTS: (FigureAct | null)[] = ['cheer', null, 'selfie', 'cheer', 'dance', null];

function Follower({ crowd, f, slot, mine, blocks, grid, boundaryRadius }: { crowd: Crowd; f: CrowdFollower; slot: { dx: number; dz: number; from: number; delay: number }; mine: boolean; blocks: Block[]; grid: CityGrid; boundaryRadius: number }) {
  const ref = useRef<THREE.Group>(null);
  const speed = useRef(0);
  const act = useRef<FigureAct | null>(null);
  const placed = useRef(false);
  const arrivedAt = useRef<number | null>(null);
  const look = useFollowerLook(f);
  const id = followerKey(crowd, f);
  const selectResident = useWorld((s) => s.selectResident);
  const selected = useWorld((s) => s.selectedResident === id);
  const say = useWorld((s) => s.residentSays[id]);
  const h = useMemo(() => hash(f.id), [f.id]);

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const anchor = anchorOf(crowd, mine);
    if (!anchor) return;
    const now = Date.now();
    if (!placed.current) {
      // walk in from out of view, in the direction of this follower's spot; late joiners start at their spot's edge
      const late = now - crowd.at > 60_000;
      const d = late ? 14 : WALK_IN_FROM;
      g.position.set(anchor.x + Math.sin(slot.from) * d, 0, anchor.z + Math.cos(slot.from) * d);
      g.position.y = surfaceY(blocks, grid, g.position.x, g.position.z, boundaryRadius);
      placed.current = true;
    }
    const started = now - crowd.at > slot.delay * 1000;
    const leaving = now > crowd.until - LEAVING_S * 1000;
    const talking = useWorld.getState().selectedResident === id;
    let tx = anchor.x + slot.dx, tz = anchor.z + slot.dz;
    if (leaving && !talking) (tx = anchor.x + Math.sin(slot.from) * 60), (tz = anchor.z + Math.cos(slot.from) * 60);
    const dx = tx - g.position.x, dz = tz - g.position.z;
    const dist = Math.hypot(dx, dz);
    const moving = started && dist > 0.5 && !talking;
    if (moving) {
      const v = (arrivedAt.current && dist > 3 ? CATCH_UP_SPEED : WALK_SPEED) * Math.min(1, dist / 1.5 + 0.3);
      const step = Math.min(dist, v * dt);
      g.position.x += (dx / dist) * step;
      g.position.z += (dz / dist) * step;
      const yaw = Math.atan2(dx, dz);
      let d = yaw - g.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      g.rotation.y += d * Math.min(1, dt * 10);
      speed.current = v > WALK_SPEED ? 0.9 : 0.55;
      act.current = null;
    } else {
      if (started && arrivedAt.current == null) arrivedAt.current = now;
      // at their spot: face the poster (or you, mid-chat) and react
      const st = useWorld.getState();
      const look = talking ? st.playerPos : anchor;
      const yaw = Math.atan2(look.x - g.position.x, look.z - g.position.z);
      let d = yaw - g.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      g.rotation.y += d * Math.min(1, dt * 6);
      speed.current = 0;
      if (talking || !arrivedAt.current) act.current = null;
      else {
        const since = (now - arrivedAt.current) / 1000;
        // everyone cheers on arrival, then each settles into their own rhythm
        act.current = since < 14 ? 'cheer' : IDLE_ACTS[(Math.floor((since + (h % 7)) / (6 + (h % 4))) + h) % IDLE_ACTS.length];
      }
    }
    const y = surfaceY(blocks, grid, g.position.x, g.position.z, boundaryRadius);
    g.position.y += (y - g.position.y) * Math.min(1, dt * 10);
    followerPos.set(id, { x: g.position.x, z: g.position.z });
  });

  useEffect(() => () => void followerPos.delete(id), [id]);

  return (
    <group
      ref={ref}
      onClick={(e) => {
        e.stopPropagation();
        selectResident(id);
      }}
    >
      <Figure seed={`follower:${f.handle}`} look={look} speedRef={speed} actRef={act} label={`@${f.handle}`} labelColor={selected ? '#FFD166' : '#9BD7FF'} />
      {say && <Bubble key={say.at} at={say.at} text={say.text} />}
    </group>
  );
}

/** Reactions to the post, out loud: a burst when the crowd arrives, then now and then while you're near. */
function reactions(c: Crowd): string[] {
  const words = c.text.split(/\s+/).filter(Boolean);
  const quote = words.length ? `"${words.slice(0, 5).join(' ')}${words.length > 5 ? '…' : ''}" 🔥` : 'That pic 🔥';
  return [quote, 'W post 🔥', 'Saw your post, had to pull up!', `@${c.owner} cooking again 🍳`, 'Notifications on 🔔', 'This one is going viral', 'Ratio incoming 😂', 'Say it louder! 📣', '🙌🙌🙌', 'First! 🥇'];
}

function CrowdChatter() {
  useEffect(() => {
    const said = new Map<string, number>();
    const t = setInterval(() => {
      if (document.hidden) return;
      const s = useWorld.getState();
      const me = s.playerPos;
      const now = Date.now();
      for (const c of s.crowds) {
        if (now > c.until) continue;
        const fresh = now - c.at < 30_000;
        if (!fresh && Math.random() < 0.55) continue;
        const near = c.followers.filter((f) => {
          const k = followerKey(c, f);
          const p = followerPos.get(k);
          return p && k !== s.selectedResident && Math.hypot(p.x - me.x, p.z - me.z) < 18 && now - (said.get(k) ?? 0) > (fresh ? 8000 : 30000);
        });
        if (!near.length) continue;
        const f = near[Math.floor(Math.random() * near.length)];
        const lines = reactions(c);
        said.set(followerKey(c, f), now);
        s.residentSay(followerKey(c, f), lines[Math.floor(Math.random() * lines.length)]);
      }
    }, 1800);
    return () => clearInterval(t);
  }, []);
  return null;
}
