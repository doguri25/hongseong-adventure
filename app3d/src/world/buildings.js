// Building meshes (real + filler), per-2 km chunks, facade/night textures, see-through hole shader.
// Footprints are game frame (x east, y south); meshes are built in render space via toRender / field.renderY.
import * as THREE from 'three';
import { toRender } from '../frame.js';
import { createCollider, inRing, ringArea, bboxOf } from '../sim/collider.js';
import { roadClearance } from '../sim/roads.js';

const CHUNK = 2000, FAR = 12000;
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export function buildingHeight(t, area, seed) {
  const lv = parseFloat(t['building:levels'] ?? t.levels);
  if (lv) return lv * 3.2 + 1;
  const ht = parseFloat(t.height);
  if (ht) return ht;
  const r = hash(seed), b = t.building;
  if (b === 'apartments') return 42 + r * 30;
  if (['commercial', 'retail', 'office'].includes(b)) return 14 + r * 22;
  if (['public', 'civic', 'theatre', 'government'].includes(b)) return 16 + r * 12;
  if (['school', 'kindergarten', 'university'].includes(b)) return 10 + r * 6;
  if (['house', 'detached'].includes(b)) return 6 + r * 2;
  if (['industrial', 'hangar', 'warehouse', 'greenhouse'].includes(b)) return 7 + r * 4;
  return area > 3000 ? 16 + r * 14 : area > 800 ? 9 + r * 10 : 6 + r * 4;
}

function wallColor(b) {
  return b === 'apartments' ? '#f1ede4' : ['commercial', 'retail'].includes(b) ? '#d7dde2'
    : ['public', 'civic', 'government'].includes(b) ? '#e6e0d3' : b === 'school' ? '#e8d9c4' : '#e2ddd2';
}

// slab apartments facing south in large residential land, houses in small, commercial blocks
export function fillerBuildings(features, realRings, places, roads) {
  const out = [], realBoxes = realRings.map(bboxOf);
  const grid = new Map(), key = (i, j) => i * 100000 + j, G = 100;
  const freeOf = (x0, y0, x1, y1) => {
    if (realBoxes.some((b) => x0 < b[2] + 6 && x1 > b[0] - 6 && y0 < b[3] + 6 && y1 > b[1] - 6)) return false;
    for (let i = Math.floor((x0 - 4) / G); i <= Math.floor((x1 + 4) / G); i++)
      for (let j = Math.floor((y0 - 4) / G); j <= Math.floor((y1 + 4) / G); j++)
        for (const o of grid.get(key(i, j)) || [])
          if (x0 < o.bb[2] + 4 && x1 > o.bb[0] - 4 && y0 < o.bb[3] + 4 && y1 > o.bb[1] - 4) return false;
    return true;
  };
  const push = (o) => {
    out.push(o);
    for (let i = Math.floor(o.bb[0] / G); i <= Math.floor(o.bb[2] / G); i++)
      for (let j = Math.floor(o.bb[1] / G); j <= Math.floor(o.bb[3] / G); j++) {
        const k = key(i, j); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(o);
      }
  };
  for (const f of features) {
    const t = f.tags;
    if (!['residential', 'commercial', 'retail'].includes(t.landuse)) continue;
    const p = f.points;
    if (p.length < 4 || Math.hypot(p[0][0] - p.at(-1)[0], p[0][1] - p.at(-1)[1]) > 0.5) continue;
    const bb = f.bounds || bboxOf(p), area = Math.abs(ringArea(p));
    const urban = area > 40000 && t.landuse === 'residential', commercial = t.landuse !== 'residential';
    if (realBoxes.filter((b) => inRing((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, p)).length >= 3) continue;
    const L = commercial ? 26 : urban ? 52 : 12, Wd = commercial ? 22 : urban ? 15 : 9;
    const gxs = commercial ? 40 : urban ? 74 : 24, gys = commercial ? 38 : urban ? 58 : 21;
    for (let y = bb[1] + gys / 2; y < bb[3]; y += gys) for (let x = bb[0] + gxs / 2; x < bb[2]; x += gxs) {
      const jx = x + (hash(x * 0.13 + y) - 0.5) * (urban ? 6 : 8), jy = y + (hash(y * 0.17 + x) - 0.5) * (urban ? 4 : 8);
      const x0 = jx - L / 2, x1 = jx + L / 2, y0 = jy - Wd / 2, y1 = jy + Wd / 2;
      if (![[x0, y0], [x1, y0], [x1, y1], [x0, y1], [jx, jy]].every((q) => inRing(q[0], q[1], p))) continue;
      if (roads.clearance(jx, jy) < (urban ? 22 : 9) || roads.clearance(x0, jy) < 6 || roads.clearance(x1, jy) < 6) continue;
      if (!freeOf(x0, y0, x1, y1)) continue;
      if (places.some((q) => q.x > x0 - 40 && q.x < x1 + 40 && q.y > y0 - 40 && q.y < y1 + 40)) continue;
      const s = jx * 1.3 + jy;
      const h = commercial ? 15 + hash(s) * 24 : urban ? 40 + hash(s) * 36 : 5.5 + hash(s) * 2.5;
      const color = urban ? ['#f2efe7', '#ebe6da', '#f4f0e6', '#e8e2d4'][Math.floor(hash(s * 3) * 4)]
        : commercial ? ['#d9dfe4', '#e3ddd1', '#cfd8de'][Math.floor(hash(s * 5) * 3)]
        : ['#e9dfcc', '#d9cdb8', '#efe7d6', '#d6dcdf'][Math.floor(hash(s * 7) * 4)];
      push({ ring: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], h, color, bb: [x0, y0, x1, y1], seed: s });
    }
  }
  return out;
}

function addBuilding(out, field, ring, height, color, seed) {
  const r = ring.slice();
  if (Math.hypot(r[0][0] - r.at(-1)[0], r[0][1] - r.at(-1)[1]) < 0.5) r.pop();
  if (r.length < 3) return;
  if (ringArea(r) < 0) r.reverse(); // so (-dy, dx) of each edge points out of the building
  let base = Infinity;
  for (const p of r) base = Math.min(base, field.renderY(p[0], p[1]));
  base -= 1.2;
  const top = base + 1.2 + height, BAY = 3.6 * 4, FLOOR = 3.1 * 4, { pos, uv, col } = out;
  const wc = new THREE.Color(color);
  const rc = new THREE.Color(height < 12
    ? ['#a8553f', '#4f6f8f', '#6f7f6a', '#8b5a44', '#5c6b78'][Math.floor(hash(seed * 2.3) * 5)]
    : ['#8d949a', '#9aa09a', '#7f8a86', '#a09a90'][Math.floor(hash(seed * 2.3) * 4)]);
  const R = r.map((p) => toRender(p[0], p[1]));
  let acc = hash(seed) * BAY;
  const v0 = Math.floor(hash(seed * 1.9) * 4) / 4, v1 = v0 + (top - base) / FLOOR;
  for (let i = 0; i < R.length; i++) {
    const a = R[i], b = R[(i + 1) % R.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.05) continue;
    const u0 = acc / BAY, u1 = (acc + len) / BAY; acc += len;
    const quad = [[a[0], base, a[1], u0, v0], [b[0], base, b[1], u1, v0], [b[0], top, b[1], u1, v1],
      [a[0], base, a[1], u0, v0], [b[0], top, b[1], u1, v1], [a[0], top, a[1], u0, v1]];
    for (const q of quad) { pos.push(q[0], q[1], q[2]); uv.push(q[3], q[4]); col.push(wc.r, wc.g, wc.b); }
  }
  const tri = THREE.ShapeUtils.triangulateShape(R.map((p) => new THREE.Vector2(p[0], p[1])), []);
  for (const t of tri) {
    const [p0, p1, p2] = t.map((k) => R[k]);
    const up = (p1[1] - p0[1]) * (p2[0] - p0[0]) - (p1[0] - p0[0]) * (p2[1] - p0[1]);
    for (const k of up > 0 ? [t[0], t[1], t[2]] : [t[0], t[2], t[1]]) {
      pos.push(R[k][0], top, R[k][1]); uv.push(0.03, 0.97); col.push(rc.r, rc.g, rc.b);
    }
  }
}

// window walls: 4 bays x 4 floors per repeat; emissive = lit windows
export function facadeTextures(low = false) {
  const S = low ? 256 : 512, c = document.createElement('canvas'), e = document.createElement('canvas');
  c.width = c.height = e.width = e.height = S;
  const g = c.getContext('2d'), ge = e.getContext('2d');
  g.fillStyle = '#eeeae1'; g.fillRect(0, 0, S, S); ge.fillStyle = '#000'; ge.fillRect(0, 0, S, S);
  const bw = S / 4, fh = S / 4;
  for (let fy = 0; fy < 4; fy++) for (let bx = 0; bx < 4; bx++) {
    const x = bx * bw, y = fy * fh;
    g.fillStyle = '#d9d3c6'; g.fillRect(x, y + fh * 0.86, bw, fh * 0.14);
    g.fillStyle = '#5d7387'; g.fillRect(x + bw * 0.12, y + fh * 0.2, bw * 0.76, fh * 0.56);
    g.fillStyle = '#7f97ab'; g.fillRect(x + bw * 0.12, y + fh * 0.2, bw * 0.76, fh * 0.12);
    g.fillStyle = '#c8c1b2'; g.fillRect(x + bw * 0.49, y + fh * 0.2, bw * 0.03, fh * 0.56);
    g.fillStyle = '#cfc8b8'; g.fillRect(x + bw * 0.08, y + fh * 0.76, bw * 0.84, fh * 0.05);
    const r = hash(fy * 7.3 + bx * 3.1 + 1.7);
    if (r < 0.42) {
      ge.fillStyle = r < 0.2 ? '#ffd9a0' : r < 0.4 ? '#ffc070' : '#f7e6c4';
      ge.fillRect(x + bw * 0.13, y + fh * 0.21, bw * 0.74, fh * 0.54);
    }
  }
  const t = new THREE.CanvasTexture(c), te = new THREE.CanvasTexture(e);
  for (const x of [t, te]) { x.wrapS = x.wrapT = THREE.RepeatWrapping; x.anisotropy = low ? 2 : 8; x.colorSpace = THREE.SRGBColorSpace; }
  return { map: t, emissive: te };
}

export class Buildings {
  constructor(scene, field, buildings, features, places = [], { low = false } = {}) {
    const real = buildings.filter((b) => b.ring && b.ring.length >= 4);
    const realRings = real.map((b) => b.ring);
    const roads = roadClearance(features);
    this.filler = fillerBuildings(features, realRings, places, roads);
    this.rings = [...realRings, ...this.filler.map((b) => b.ring)];
    this.collider = createCollider(this.rings);
    this.realCount = real.length;

    const chunks = new Map();
    const chunkOf = (ring) => {
      const k = Math.floor(ring[0][0] / CHUNK) + ',' + Math.floor(ring[0][1] / CHUNK);
      let c = chunks.get(k);
      if (!c) chunks.set(k, c = { pos: [], uv: [], col: [], cx: (Math.floor(ring[0][0] / CHUNK) + 0.5) * CHUNK, cy: (Math.floor(ring[0][1] / CHUNK) + 0.5) * CHUNK });
      return c;
    };
    real.forEach((b, i) => {
      const area = Math.abs(ringArea(b.ring)), t = b.tags;
      addBuilding(chunkOf(b.ring), field, b.ring, buildingHeight(t, area, i + 1), wallColor(t.building), i * 9.1);
    });
    for (const b of this.filler) addBuilding(chunkOf(b.ring), field, b.ring, b.h, b.color, b.seed);

    const facade = this.facade = facadeTextures(low);
    const m = this.material = new THREE.MeshStandardMaterial({
      map: facade.map, emissiveMap: facade.emissive, emissive: 0xffffff, emissiveIntensity: 0,
      vertexColors: true, roughness: 0.78, metalness: 0.02,
    });
    this.hole = { cam: { value: new THREE.Vector3() }, player: { value: new THREE.Vector3(1e9, 1e9, 1e9) }, radius: { value: 20 } };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { uHoleCam: this.hole.cam, uHolePlayer: this.hole.player, uHoleR: this.hole.radius });
      sh.vertexShader = 'varying vec3 vHoleW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vHoleW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = 'varying vec3 vHoleW; uniform vec3 uHoleCam; uniform vec3 uHolePlayer; uniform float uHoleR;\n' + sh.fragmentShader.replace('void main() {', `void main() {
  { vec3 seg = uHolePlayer - uHoleCam; float L = length(seg); vec3 dir = seg / max(L, 1e-3); float t = dot(vHoleW - uHoleCam, dir);
    if (t > 0.0 && t < L - 1.5) { float r = length(vHoleW - (uHoleCam + dir * t)), k = smoothstep(uHoleR, uHoleR * .55, r);
      float n = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453); if (k > n) discard; } }`);
    };

    this.group = new THREE.Group();
    this.group.name = 'buildings';
    this.chunks = [];
    for (const c of chunks.values()) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(c.pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(c.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(c.col, 3));
      g.computeVertexNormals();
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = mesh.receiveShadow = true;
      const [X, Z] = toRender(c.cx, c.cy);
      this.chunks.push({ mesh, X, Z });
      this.group.add(mesh);
    }
    scene.add(this.group);
  }

  update(cam) {
    for (const c of this.chunks) c.mesh.visible = Math.hypot(c.X - cam.x, c.Z - cam.z) < FAR;
  }

  setNight(intensity) { this.material.emissiveIntensity = intensity; }

  setHole(cam, player, radius) {
    this.hole.cam.value.copy(cam);
    this.hole.player.value.copy(player);
    this.hole.radius.value = radius;
  }
}
