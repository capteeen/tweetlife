'use client';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Billboard, ContactShadows, Text } from '@react-three/drei';
import { Figure } from '@/components/world/Figure';
import { sticks } from '@/components/world/TouchSticks';
import { DOOR_X, FOOTPRINT, ROOM_D, ROOM_W, SLOTS, SPAWN, WALL_H, furnitureById, hasPower, type Furniture, type HomeView } from '@/lib/life/home';
import { useHome } from './store';
import { useWorld } from '@/components/world/store';
import { tiredness } from '@/lib/life/activities';
import type { FigureAct } from '@/components/world/figureMoves';
import type { HomePose } from '@/components/world/figurePoses';
import { placementFor, type Placement } from './poses';
import { FurnitureMesh } from './Furniture';
import { playerSound } from '@/lib/audio/state';
import { FootstepSounds } from '@/components/audio/FootstepSounds';
import { decodeUse, encodeUse, houseMe, useHousePeers, type HousePeer } from './presence';
import { useLookOf } from '@/components/life/useLook';
import { residentById } from '@/lib/life/residents';

// The house, seen the way the reference shows it: a fixed three-quarter view of one room with two walls,
// a door and a window. The avatar walks with WASD / the left stick; tap a piece of furniture to open it.

const SPEED = 5;
const PLAYER_R = 0.35;
const CAM = new THREE.Vector3(-11, 13, 15);
const LOOK = new THREE.Vector3(0.5, 0.6, -0.5);

export function HomeCanvas({ home, handle, onExit }: { home: HomeView; handle: string | null; onExit: () => void }) {
  return (
    <Canvas
      shadows="soft"
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 38, near: 0.3, far: 200, position: CAM.toArray() }}
      onCreated={({ gl, camera }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.12;
        camera.lookAt(LOOK);
      }}
      style={{ position: 'absolute', inset: 0 }}
      onPointerMissed={() => useHome.getState().select(null)}
    >
      <color attach="background" args={['#101B30']} />
      <Room home={home} handle={handle} onExit={onExit} />
      <FootstepSounds floor="tile" />
    </Canvas>
  );
}

function Room({ home, handle, onExit }: { home: HomeView; handle: string | null; onExit: () => void }) {
  const lit = hasPower(home.power);
  const placed = useMemo(
    () => home.placed.map((p) => furnitureById(p.itemId)).filter((f): f is Furniture => !!f),
    [home.placed],
  );
  const hw = ROOM_W / 2, hd = ROOM_D / 2;
  return (
    <>
      <hemisphereLight args={['#DCE8F5', '#4A4538', lit ? 0.9 : 0.35]} />
      <ambientLight intensity={lit ? 0.35 : 0.12} />
      <directionalLight position={[8, 14, 6]} intensity={lit ? 1.4 : 0.5} color="#FFF4E0" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0008} shadow-normalBias={0.06} shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={12} shadow-camera-bottom={-12} shadow-camera-near={1} shadow-camera-far={40} />
      {/* ground outside */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.26, 0]} receiveShadow>
        <circleGeometry args={[40, 48]} />
        <meshStandardMaterial color="#6E7F3C" roughness={1} />
      </mesh>
      {/* plinth and floor */}
      <mesh position={[0, -0.13, 0]} receiveShadow>
        <boxGeometry args={[ROOM_W + 0.6, 0.26, ROOM_D + 0.6]} />
        <meshStandardMaterial color="#4B5A6B" roughness={1} />
      </mesh>
      <Tiles />
      {/* back wall (z = -hd) with a door, right wall (x = +hw) with a window */}
      <Wall w={ROOM_W + 0.6} h={WALL_H} x={0} z={-hd - 0.15} rot={0} door={DOOR_X} />
      <Wall w={ROOM_D + 0.6} h={WALL_H} x={hw + 0.15} z={0} rot={-Math.PI / 2} window />
      {/* door: tap to go back to the city */}
      <group position={[DOOR_X, 0, -hd + 0.05]}>
        <mesh position={[0, 1.4, 0]} castShadow onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onExit(); }}>
          <boxGeometry args={[1.6, 2.8, 0.12]} />
          <meshStandardMaterial color="#8B4A2B" roughness={0.8} />
        </mesh>
        <mesh position={[0.55, 1.35, 0.08]}>
          <sphereGeometry args={[0.06, 8, 6]} />
          <meshStandardMaterial color="#FFD089" metalness={0.6} roughness={0.3} />
        </mesh>
      </group>
      {placed.map((f) => (
        <Piece key={f.id} item={f} lit={lit} />
      ))}
      <ContactShadows frames={1} position={[0, 0.01, 0]} scale={ROOM_W + 4} blur={2.2} opacity={0.45} far={6} resolution={1024} />
      <Walker placed={placed} handle={handle} />
      <HousePeers me={handle} />
      <ResidentsHere home={home} placed={placed} />
    </>
  );
}

/** Checkerboard floor, two tile colours like the reference. */
function Tiles() {
  const tiles = useMemo(() => {
    const out: { x: number; z: number; dark: boolean }[] = [];
    const n = 2;
    for (let i = 0; i < ROOM_W / n; i++) for (let j = 0; j < ROOM_D / n; j++) out.push({ x: -ROOM_W / 2 + n / 2 + i * n, z: -ROOM_D / 2 + n / 2 + j * n, dark: (i + j) % 2 === 0 });
    return out;
  }, []);
  return (
    <group>
      {tiles.map((t, i) => (
        // lifted a hair off the plinth top (y = 0) so the two surfaces do not z-fight (and under the contact shadow at 0.01)
        <mesh key={i} position={[t.x, 0.004, t.z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[1.96, 1.96]} />
          <meshStandardMaterial color={t.dark ? '#B98A5E' : '#D4AB7E'} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

function Wall({ w, h, x, z, rot, door, window }: { w: number; h: number; x: number; z: number; rot: number; door?: number; window?: boolean }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, 0.3]} />
        <meshStandardMaterial color="#5F8EA6" roughness={1} />
      </mesh>
      {/* skirting */}
      <mesh position={[0, 0.15, 0.16]}>
        <boxGeometry args={[w, 0.3, 0.04]} />
        <meshStandardMaterial color="#3C5A6E" roughness={1} />
      </mesh>
      {door != null && (
        <mesh position={[door, 1.45, 0.17]}>
          <boxGeometry args={[1.8, 2.9, 0.06]} />
          <meshStandardMaterial color="#3C5A6E" roughness={1} />
        </mesh>
      )}
      {window && (
        <group position={[1.5, 2.2, 0.17]}>
          <mesh>
            <boxGeometry args={[3.2, 1.8, 0.06]} />
            <meshStandardMaterial color="#BFE3FF" emissive="#BFE3FF" emissiveIntensity={0.25} />
          </mesh>
          {[-1, -0.5, 0, 0.5, 1].map((o) => (
            <mesh key={o} position={[o * 1.3, 0, 0.05]}>
              <boxGeometry args={[0.06, 1.8, 0.04]} />
              <meshStandardMaterial color="#1B2436" />
            </mesh>
          ))}
          <mesh position={[0, -1.0, 0.1]}>
            <boxGeometry args={[3.5, 0.12, 0.3]} />
            <meshStandardMaterial color="#D4C3A5" />
          </mesh>
        </group>
      )}
    </group>
  );
}

function Piece({ item, lit }: { item: Furniture; lit: boolean }) {
  const spot = SLOTS[item.slot];
  const select = useHome((s) => s.select);
  const selected = useHome((s) => s.selected?.id === item.id);
  const powered = lit || !item.needsPower;
  const fp = FOOTPRINT[item.model];
  return (
    <group position={[spot.x, 0, spot.z]} rotation={[0, spot.rot, 0]}>
      <FurnitureMesh item={item} lit={powered} />
      {/* an invisible catcher so small pieces are easy to tap; ceiling and wall pieces get a tall one */}
      <mesh
        position={[0, fp ? 0.6 : 2.6, 0]}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); select(item); }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <boxGeometry args={[fp ? Math.max(fp.w, 1) : 2.6, fp ? 1.4 : 2.0, fp ? Math.max(fp.d, 1) : 1.2]} />
        <meshBasicMaterial transparent opacity={selected ? 0.12 : 0} color="#FFFFFF" depthWrite={false} />
      </mesh>
    </group>
  );
}


/** The avatar in the room: walks, keeps out of furniture, and goes to a piece when an action starts. */
function Walker({ placed, handle }: { placed: Furniture[]; handle: string | null }) {
  const group = useRef<THREE.Group>(null);
  const pos = useRef(new THREE.Vector3(SPAWN.x, 0, SPAWN.z));
  const facing = useRef(Math.PI);
  const speedRef = useRef(0);
  const keys = useRef<Record<string, boolean>>({});
  const acting = useHome((s) => s.acting);
  const { camera, size } = useThree();
  const actRef = useRef<FigureAct | HomePose | null>(null);
  const tiredRef = useRef(0);
  const zzz = useRef<THREE.Group>(null);
  // using a piece: walk to its approach point, then settle into the pose on it
  const goal = useRef<{ at: Placement; settled: boolean } | null>(null);
  // the camera leans in while you use a piece, so you can see what the avatar is doing
  const lookAt = useRef(LOOK.clone());
  // my own look when it's me walking around my house
  const look = useWorld((s) => (s.life?.me && s.life.me.handle === handle ? s.life.me.look : null));
  const spot = useMemo(() => (acting ? placementFor(acting.item, acting.action) : null), [acting]);
  const sleeping = spot?.pose.base === 'lie';

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      keys.current[e.code] = true;
    };
    const up = (e: KeyboardEvent) => (keys.current[e.code] = false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // obstacles: the footprint of every placed piece, rotated into room space
  const obstacles = useMemo(
    () =>
      placed
        .map((f) => {
          const fp = FOOTPRINT[f.model];
          if (!fp) return null;
          const s = SLOTS[f.slot];
          const turned = Math.abs(Math.sin(s.rot)) > 0.5;
          return { x: s.x, z: s.z, w: turned ? fp.d : fp.w, d: turned ? fp.w : fp.d };
        })
        .filter((o): o is { x: number; z: number; w: number; d: number } => !!o),
    [placed],
  );

  // when an action starts, head for the piece; when it ends, get up and step off it
  useEffect(() => {
    if (spot) {
      goal.current = { at: spot, settled: false };
      return;
    }
    const g = goal.current;
    goal.current = null;
    if (g?.settled) pos.current.set(g.at.approach.x, 0, g.at.approach.z);
  }, [spot]);

  useFrame((state, dt) => {
    const d = Math.min(dt, 0.05);
    let mx = 0, mz = 0;
    if (!acting) {
      const k = keys.current;
      if (k.KeyW || k.ArrowUp) mz -= 1;
      if (k.KeyS || k.ArrowDown) mz += 1;
      if (k.KeyA || k.ArrowLeft) mx -= 1;
      if (k.KeyD || k.ArrowRight) mx += 1;
      mx += sticks.left.x;
      mz += sticks.left.y;
    }
    const len = Math.hypot(mx, mz);
    speedRef.current = Math.min(1, len);
    const g = goal.current;
    if (g && !g.settled) {
      // walk over to the piece, then settle in
      const dx = g.at.approach.x - pos.current.x, dz = g.at.approach.z - pos.current.z;
      const dist = Math.hypot(dx, dz);
      const step = SPEED * 1.2 * d;
      if (dist <= step + 0.02) {
        g.settled = true;
        pos.current.set(g.at.x, 0, g.at.z);
        facing.current = g.at.facing;
      } else {
        pos.current.x += (dx / dist) * step;
        pos.current.z += (dz / dist) * step;
        facing.current = Math.atan2(dx, dz);
        speedRef.current = 1;
      }
    }
    // everyday moves (dance, stretch...) play until they end, you walk off, or a piece of furniture takes over
    const st = useWorld.getState();
    if (st.doing && (len > 0.05 || acting || Date.now() > st.doing.until)) st.setDoing(null);
    actRef.current = g ? (g.settled ? g.at.pose : null) : st.doing?.id ?? null;
    tiredRef.current = acting || st.life?.me?.handle !== handle ? 0 : tiredness(st.life?.me?.gas ?? 100);
    // sleeping: a slow drift of Zs over the bed
    if (zzz.current) {
      zzz.current.visible = !!g?.settled;
      zzz.current.children.forEach((c, i) => {
        const k = (state.clock.elapsedTime * 0.45 + i / 3) % 1;
        c.position.set(0.15 + k * 0.35, (spot?.pose.seat ?? 0) + 0.5 + k * 1.2, -1.5); // over the head, which lies along -z
        c.scale.setScalar(0.6 + k * 0.7);
      });
    }
    if (len > 0) {
      // screen-relative: "up" walks away from the camera along the room's diagonal view
      const yaw = Math.atan2(camera.position.x - LOOK.x, camera.position.z - LOOK.z);
      const s = Math.sin(yaw), c = Math.cos(yaw);
      const vx = (mx * c - mz * s) / Math.max(1, len), vz = (mx * s + mz * c) / Math.max(1, len);
      const step = SPEED * d * Math.min(1, len);
      const nx = pos.current.x + vx * step, nz = pos.current.z + vz * step;
      if (!blocked(obstacles, nx, nz)) pos.current.set(nx, 0, nz);
      else if (!blocked(obstacles, nx, pos.current.z)) pos.current.x = nx;
      else if (!blocked(obstacles, pos.current.x, nz)) pos.current.z = nz;
      facing.current = Math.atan2(vx, vz);
    }
    const close = g?.settled ? g.at : null;
    // lying, the body runs back from the heels: aim at its middle
    const back = close?.pose.base === 'lie' ? 0.8 : 0;
    const mid = close && new THREE.Vector3(close.x - Math.sin(close.facing) * back, 0, close.z - Math.cos(close.facing) * back);
    // tall phone screens are narrow: back the camera off until the whole room (and the door) fits across
    const fit = Math.max(1, 1.3 / (size.width / Math.max(1, size.height)));
    const camTo = mid ? mid.clone().addScaledVector(CAM.clone().sub(LOOK), 0.42 * Math.sqrt(fit)) : LOOK.clone().addScaledVector(CAM.clone().sub(LOOK), fit);
    const lookTo = mid && close ? mid.clone().setY(close.pose.seat + (back ? 0.3 : 0.75)) : LOOK;
    const ease = 1 - Math.pow(0.12, d);
    camera.position.lerp(camTo, ease);
    lookAt.current.lerp(lookTo, ease);
    camera.lookAt(lookAt.current);
    // for footsteps (components/audio)
    Object.assign(playerSound, { x: pos.current.x, y: 0, z: pos.current.z, speed: speedRef.current, sprint: false, tired: tiredRef.current, onFoot: !g?.settled, surface: 'tile' });
    if (group.current) {
      // the pose itself (seat height, lying down) is the figure's: components/world/figurePoses.ts
      group.current.position.copy(pos.current);
      group.current.rotation.set(0, facing.current, 0);
    }
    // for the people in the house with me (components/home/presence.ts)
    houseMe.x = pos.current.x;
    houseMe.z = pos.current.z;
    houseMe.yaw = facing.current;
    houseMe.act = g?.settled && acting ? encodeUse(acting.item, acting.action) : st.doing?.id ?? null;
  });

  return (
    <group ref={group}>
      <Figure seed={handle ?? 'visitor'} look={look} speedRef={speedRef} actRef={actRef} tiredRef={tiredRef} label={handle ? `@${handle}` : undefined} labelColor="#BFE3FF" />
      {sleeping && (
        <group ref={zzz}>
          {[0, 1, 2].map((i) => (
            <Billboard key={i}>
              <Text fontSize={0.32} color="#BFE3FF" outlineWidth={0.02} outlineColor="#0B0E14" font="/fonts/inter-600.woff">
                z
              </Text>
            </Billboard>
          ))}
        </group>
      )}
    </group>
  );
}

function blocked(obstacles: { x: number; z: number; w: number; d: number }[], x: number, z: number) {
  const hw = ROOM_W / 2 - PLAYER_R - 0.1, hd = ROOM_D / 2 - PLAYER_R - 0.1;
  if (x < -hw || x > hw || z < -hd || z > hd) return true;
  for (const o of obstacles) if (Math.abs(x - o.x) < o.w / 2 + PLAYER_R && Math.abs(z - o.z) < o.d / 2 + PLAYER_R) return true;
  return false;
}

/** The other people in the house right now (host or guests), live from the house's presence room. */
function HousePeers({ me }: { me: string | null }) {
  const peers = useHousePeers((s) => s.peers);
  return (
    <>
      {Object.values(peers)
        .filter((p) => !me || p.handle.toLowerCase() !== me.toLowerCase())
        .map((p) => (
          <HousePeerFigure key={p.id} peer={p} />
        ))}
    </>
  );
}

function HousePeerFigure({ peer }: { peer: HousePeer }) {
  const ref = useRef<THREE.Group>(null);
  const speed = useRef(0);
  const act = useRef<FigureAct | HomePose | null>(null);
  const look = useLookOf(peer.handle);
  const last = useRef({ x: peer.x, z: peer.z, t: performance.now() });
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    g.position.x += (peer.x - g.position.x) * 0.25;
    g.position.z += (peer.z - g.position.z) * 0.25;
    g.rotation.y = peer.yaw;
    const now = performance.now();
    const dt = Math.max(1, now - last.current.t) / 1000;
    const v = Math.hypot(peer.x - last.current.x, peer.z - last.current.z) / dt;
    last.current = { x: peer.x, z: peer.z, t: now };
    speed.current = Math.min(1, v / 5);
    // on a piece of furniture: the same pose it has for them; otherwise an everyday move, if any
    const use = decodeUse(peer.act);
    act.current = use ? placementFor(use.item, use.action).pose : ((peer.act as FigureAct | null) ?? null);
  });
  return (
    <group ref={ref} position={[peer.x, 0, peer.z]}>
      <Figure seed={peer.handle} look={look} speedRef={speed} actRef={act} label={`@${peer.handle}`} labelColor="#FFB3C8" />
    </group>
  );
}

/** AI residents in the room: the host of a resident's house, or residents you invited over. They take a seat. */
function ResidentsHere({ home, placed }: { home: HomeView; placed: Furniture[] }) {
  const ids = home.resident ? [home.resident.id] : (home.guests ?? []).map((g) => g.id);
  // seats first (sofas, chairs, the dining table), then standing spots by other pieces
  const spots = useMemo(() => {
    const out: Placement[] = [];
    const order = ['seat', 'table', 'bar', 'kitchen', 'desk'];
    const pieces = [...placed].sort((a, b) => (order.indexOf(a.slot) + 1 || 99) - (order.indexOf(b.slot) + 1 || 99));
    for (const f of pieces) {
      const a = f.actions.find((x) => x.pose === 'sit') ?? f.actions.find((x) => x.pose === 'stand');
      if (a) out.push(placementFor(f, a));
    }
    return out;
  }, [placed]);
  return (
    <>
      {ids.map((id, i) => {
        const r = residentById(id);
        const at = spots[i % Math.max(1, spots.length)];
        if (!r) return null;
        return <ResidentGuest key={id} name={r.name} look={r.look} seed={r.id} at={at ?? null} offset={i} />;
      })}
    </>
  );
}

function ResidentGuest({ name, look, seed, at, offset }: { name: string; look: import('@/lib/life/look').Look; seed: string; at: Placement | null; offset: number }) {
  const act = useRef<FigureAct | HomePose | null>(at?.pose ?? null);
  const speed = useRef(0);
  const x = at?.x ?? SPAWN.x + 2 + offset, z = at?.z ?? SPAWN.z - 2;
  return (
    <group position={[x, 0, z]} rotation={[0, at?.facing ?? Math.PI, 0]}>
      <Figure seed={seed} look={look} speedRef={speed} actRef={act} label={name} labelColor="#FFD089" />
    </group>
  );
}
