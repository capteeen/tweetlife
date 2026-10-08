import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Collects coloured pieces into one merged, vertex-coloured geometry, so a whole model (or a whole apron of props)
// costs one draw call per material. Every piece is non-indexed with position, normal and color only.

const col = new THREE.Color();
const dummy = new THREE.Object3D();
const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();

export type Paint = string | THREE.Color;

export class Parts {
  private list: THREE.BufferGeometry[] = [];

  private prep(g: THREE.BufferGeometry) {
    const n = g.index ? g.toNonIndexed() : g;
    if (n !== g) g.dispose();
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
    if (!n.attributes.normal) n.computeVertexNormals();
    return n;
  }

  /** Paint the whole piece one colour. `glow` > 1 pushes it past the bloom threshold (for unlit light materials). */
  add(g: THREE.BufferGeometry, color: Paint, glow = 1) {
    const n = this.prep(g);
    col.set(color).multiplyScalar(glow);
    const arr = new Float32Array(n.attributes.position.count * 3);
    for (let i = 0; i < arr.length; i += 3) arr.set([col.r, col.g, col.b], i);
    n.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.list.push(n);
    return n;
  }

  /**
   * Paint each triangle by its centroid, for crisp livery bands that follow the mesh's own edges. With `quads`, the
   * triangles are taken in pairs (as Lathe and Plane geometries emit them) and both get the quad's colour, so a band
   * edge never zigzags across a quad's diagonal.
   */
  addFaces(g: THREE.BufferGeometry, paint: (x: number, y: number, z: number) => Paint, quads = false) {
    const n = this.prep(g);
    const p = n.attributes.position;
    const arr = new Float32Array(p.count * 3);
    const step = quads ? 6 : 3;
    for (let i = 0; i < p.count; i += step) {
      const k = Math.min(step, p.count - i);
      let x = 0, y = 0, z = 0;
      for (let j = 0; j < k; j++) {
        x += p.getX(i + j);
        y += p.getY(i + j);
        z += p.getZ(i + j);
      }
      col.set(paint(x / k, y / k, z / k));
      for (let j = 0; j < k; j++) arr.set([col.r, col.g, col.b], (i + j) * 3);
    }
    n.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.list.push(n);
    return n;
  }

  /** A box centred at (x, y, z), rotated by Euler (rx, ry, rz). */
  box(color: Paint, w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
    g.translate(x, y, z);
    return this.add(g, color);
  }

  /** A cylinder between two points. */
  rod(color: Paint, a: [number, number, number], b: [number, number, number], r: number, seg = 6, r2 = r) {
    va.set(...a);
    vb.set(...b);
    const len = va.distanceTo(vb);
    const g = new THREE.CylinderGeometry(r2, r, len, seg);
    g.translate(0, len / 2, 0);
    dummy.position.copy(va);
    dummy.up.set(0, 1, 0);
    dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vc.subVectors(vb, va).normalize());
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    g.applyMatrix4(dummy.matrix);
    return this.add(g, color);
  }

  /** A box of cross-section w x h running from a to b. */
  beam(color: Paint, a: [number, number, number], b: [number, number, number], w: number, h: number) {
    va.set(...a);
    vb.set(...b);
    const g = new THREE.BoxGeometry(w, h, va.distanceTo(vb));
    dummy.position.copy(va).add(vb).multiplyScalar(0.5);
    dummy.up.set(0, 1, 0);
    dummy.scale.set(1, 1, 1);
    dummy.lookAt(vb);
    dummy.updateMatrix();
    g.applyMatrix4(dummy.matrix);
    return this.add(g, color);
  }

  /** A thin panel lying on a surface at `p`, facing `normal`, its local y along `along`. */
  patch(color: Paint, w: number, h: number, t: number, p: THREE.Vector3, normal: THREE.Vector3, along = new THREE.Vector3(0, 0, 1), glow = 1) {
    const g = new THREE.BoxGeometry(w, h, t);
    dummy.position.copy(p);
    dummy.up.copy(along);
    dummy.scale.set(1, 1, 1);
    dummy.lookAt(vc.copy(p).add(normal));
    dummy.updateMatrix();
    g.applyMatrix4(dummy.matrix);
    return this.add(g, color, glow);
  }

  get empty() {
    return this.list.length === 0;
  }

  build(): THREE.BufferGeometry | null {
    if (!this.list.length) return null;
    const g = mergeGeometries(this.list);
    this.list.forEach((x) => x.dispose());
    this.list = [];
    g.computeBoundingSphere();
    return g;
  }
}

/** Map every vertex through `fn`, then fix the winding if the map mirrored the piece, and recompute flat normals. */
export function remap(g: THREE.BufferGeometry, fn: (v: THREE.Vector3) => void) {
  const n = g.index ? g.toNonIndexed() : g;
  if (n !== g) g.dispose();
  const p = n.attributes.position as THREE.BufferAttribute;
  // sign of the map's handedness, from three unit steps at the origin
  const o = new THREE.Vector3(0, 0, 0), ex = new THREE.Vector3(1, 0, 0), ey = new THREE.Vector3(0, 1, 0), ez = new THREE.Vector3(0, 0, 1);
  [o, ex, ey, ez].forEach(fn);
  ex.sub(o);
  ey.sub(o);
  ez.sub(o);
  const mirrored = ex.dot(ey.clone().cross(ez)) < 0;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    fn(v);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  if (mirrored) flipWinding(n);
  n.deleteAttribute('normal');
  n.computeVertexNormals();
  return n;
}

export function flipWinding(g: THREE.BufferGeometry) {
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i += 3) {
    va.fromBufferAttribute(p, i + 1);
    vb.fromBufferAttribute(p, i + 2);
    p.setXYZ(i + 1, vb.x, vb.y, vb.z);
    p.setXYZ(i + 2, va.x, va.y, va.z);
  }
}

/** Make every triangle of a flat (non-indexed) piece face `out`. */
export function faceTowards(g: THREE.BufferGeometry, out: THREE.Vector3) {
  const p = g.attributes.position as THREE.BufferAttribute;
  const n = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    va.fromBufferAttribute(p, i);
    vb.fromBufferAttribute(p, i + 1).sub(va);
    vc.fromBufferAttribute(p, i + 2).sub(va);
    n.crossVectors(vb, vc);
    if (n.dot(out) < 0) {
      const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1);
      p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
      p.setXYZ(i + 2, x, y, z);
    }
  }
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  return g;
}

/** A flat outline (any polygon, in shape units) extruded to `depth`, as non-indexed geometry in shape space (a, b, t). */
export function slab(points: [number, number][], depth: number) {
  const shape = new THREE.Shape(points.map(([a, b]) => new THREE.Vector2(a, b)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  return g.index ? g.toNonIndexed() : g;
}
