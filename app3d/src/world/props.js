// Instanced trees and street lamps, both built only near the camera (spec §9). Trees stream per 2 km chunk. Lamp spots
// are placed once for the whole county (pure lampSpots) and bucketed by 2 km chunk; only the lamps within the quality's
// radius of the camera focus are instanced, refilled from the nearby buckets as the focus moves. Positions come from
// the pure sim modules in game frame; meshes live in render space (toRender / field.renderY).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CX, CY } from '../frame.js';
import { roadClearance } from '../sim/roads.js';
import { lampSpots, createForestDensity, createUrbanTest, createWaterTest } from '../sim/lampspots.js';

const CHUNK = 2000, S = 1.25, LAMP_REFILL = 120;
// the high-quality budget; render/quality.js QUALITY[*].props carries one per quality
export const DEFAULT_BUDGET = { treeCap: 1200, treeLoad: 4000, treeDrop: 5000, lampRadius: 2000, lampShadow: true };
const LIGHT = { day: [0, 0], dusk: [1.6, 0.12], night: [4.0, 0.4] };
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const cellKey = (i, j) => i + ',' + j;

function colorize(g, hex) {
  if (g.index) g = g.toNonIndexed();
  const c = new THREE.Color(hex), a = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv');
  return g;
}

function radialTexture(inner, outer) {
  if (typeof document === 'undefined') return null;   // Node tests: no canvas, the pool is drawn untextured
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// One street lamp, 108 triangles (was 484): plinth, tapered pole (open ends: hidden in the plinth and under the arm),
// a curved arm (6x4 tube) and a flat LED head box. The lens and the night light pool are separate instanced planes.
export function lampBodyGeometry() {
  const col = '#55625d';
  const arm = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 8.6, 0), new THREE.Vector3(0, 9.9, 0), new THREE.Vector3(0, 9.75, 2.6)), 6, 0.09, 4);
  return mergeGeometries([
    colorize(new THREE.CylinderGeometry(0.42, 0.5, 0.7, 8).translate(0, 0.35, 0), '#5c6660'),
    colorize(new THREE.CylinderGeometry(0.13, 0.22, 9.0, 8, 1, true).translate(0, 4.5, 0), col),
    colorize(arm, col),
    colorize(new THREE.BoxGeometry(0.62, 0.2, 1.45).translate(0, 9.72, 3.15), '#3e4743'),
  ]).scale(S, S, S);
}

const PINE_TONES = ['#2f5a2a', '#3b6a31', '#2a4f27', '#45753a'];
const BROAD_TONES = ['#4f8a3a', '#5f9a44', '#6b9e46', '#88a94a', '#c3a443', '#c46e3a'];

export class Props {
  constructor(scene, field, features, collider, graph, budget = DEFAULT_BUDGET) {
    this.scene = scene; this.field = field; this.chunks = new Map();
    this.budget = { ...DEFAULT_BUDGET, ...budget };
    const clearance = roadClearance(features).clearance;
    this.isWater = createWaterTest(features, field);
    this.density = createForestDensity(field, features, { clearance, collider, isWater: this.isWater });
    this.treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    // caps that can never be seen are left off (trunk ends sit in the ground and inside the crown, the cone's base faces
    // the ground): pine 17 triangles (was 34), broadleaf 90 (was 100)
    const trunk = (r0, r1, h) => colorize(new THREE.CylinderGeometry(r0, r1, h, 5, 1, true).translate(0, h / 2, 0), '#7a5a3c');
    this.pine = mergeGeometries([trunk(0.35, 0.5, 3), colorize(new THREE.ConeGeometry(2.9, 8.5, 7, 1, true).translate(0, 7, 0), '#ffffff')]);
    this.broad = mergeGeometries([trunk(0.35, 0.55, 3.2), colorize(new THREE.IcosahedronGeometry(3.4, 1).scale(1, 0.88, 1).translate(0, 6, 0), '#ffffff')]);
    this.lamps = this._buildLamps(graph, collider);
    this.setNight(0, 0);
  }

  _buildLamps(graph, collider) {
    const urban = createUrbanTest(collider.rings || []);
    const isForest = (x, y) => this.density(x, y) > 0.35;
    const list = lampSpots(graph, collider, this.isWater, urban, isForest);
    const n = list.length;
    // every lamp's two matrices once (body and lens share one), bucketed by 2 km chunk
    const xs = new Float32Array(n), ys = new Float32Array(n), bodyM = new Float32Array(n * 16), poolM = new Float32Array(n * 16), cells = new Map();
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3();
    list.forEach(({ x, y, yaw }, i) => {
      xs[i] = x; ys[i] = y;
      q.setFromAxisAngle(up, yaw); pos.set(x - CX, this.field.renderY(x, y) - 0.25, y - CY);
      m4.compose(pos, q, one).toArray(bodyM, i * 16);
      const px = x + Math.sin(yaw) * 4, py = y + Math.cos(yaw) * 4;
      pos.y = this.field.renderY(px, py) + 0.4; m4.compose(pos, q, one).toArray(poolM, i * 16);
      const k = cellKey(Math.floor(x / CHUNK), Math.floor(y / CHUNK));
      if (!cells.has(k)) cells.set(k, []); cells.get(k).push(i);
    });
    const mk = (geo, mat) => { const im = new THREE.InstancedMesh(geo, mat, Math.max(1, n)); im.count = 0; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(im); return im; };
    const body = mk(lampBodyGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.55 }));
    this.headMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffe3b0, emissiveIntensity: 0, roughness: 0.3 });
    const lens = mk(new THREE.PlaneGeometry(0.5, 1.2).rotateX(Math.PI / 2).translate(0, 9.6, 3.15).scale(S, S, S), this.headMat);
    this.poolMat = new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,206,140,.75)', 'rgba(255,206,140,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: true });
    const pool = mk(new THREE.PlaneGeometry(13, 20).rotateX(-Math.PI / 2).translate(0, 0, 4.5), this.poolMat);
    body.castShadow = this.budget.lampShadow; body.receiveShadow = true; pool.renderOrder = 2;
    return { body, lens, pool, count: n, shown: 0, xs, ys, bodyM, poolM, cells, at: null, radius: -1 };
  }

  // instance the lamps within the budget's radius of (gx, gy), game frame
  _refillLamps(gx, gy) {
    const L = this.lamps, R = this.budget.lampRadius, R2 = R * R;
    const bodyA = L.body.instanceMatrix.array, lensA = L.lens.instanceMatrix.array, poolA = L.pool.instanceMatrix.array;
    let k = 0;
    for (let i = Math.floor((gx - R) / CHUNK); i <= Math.floor((gx + R) / CHUNK); i++) {
      for (let j = Math.floor((gy - R) / CHUNK); j <= Math.floor((gy + R) / CHUNK); j++) {
        for (const n of L.cells.get(cellKey(i, j)) || []) {
          const dx = L.xs[n] - gx, dy = L.ys[n] - gy;
          if (dx * dx + dy * dy > R2) continue;
          const src = L.bodyM.subarray(n * 16, n * 16 + 16);
          bodyA.set(src, k * 16); lensA.set(src, k * 16); poolA.set(L.poolM.subarray(n * 16, n * 16 + 16), k * 16);
          k++;
        }
      }
    }
    for (const m of [L.body, L.lens, L.pool]) {
      m.count = k;
      const a = m.instanceMatrix; a.clearUpdateRanges(); a.addUpdateRange(0, Math.max(16, k * 16)); a.needsUpdate = true;
      m.boundingSphere = null;   // recomputed over the new instances when next culled
    }
    L.shown = k; L.at = [gx, gy]; L.radius = R;
  }

  setNight(lamps, pools) {
    this.headMat.emissiveIntensity = lamps;
    this.poolMat.opacity = pools;
    this.lamps.pool.visible = pools > 0.001;
  }

  setTime(key) { const l = LIGHT[key] || LIGHT.day; this.setNight(l[0], l[1]); }

  // A new budget (quality change). Lamps refill at once; tree chunks above the new cap are thinned in place (the
  // instances are in random order, so the first N are an even sample); chunks built below it are rebuilt one per
  // update, the old trees staying until their replacement is ready.
  setBudget(budget) {
    const b = { ...this.budget, ...budget }, changed = JSON.stringify(b) !== JSON.stringify(this.budget);
    this.budget = b;
    if (!changed) return;
    this.lamps.body.castShadow = b.lampShadow;
    this.lamps.radius = -1;
    for (const c of this.chunks.values()) {
      if (b.treeCap <= c.cap) {
        c.count = 0;
        for (const m of c.meshes) { m.count = Math.round(m.userData.full * b.treeCap / c.cap); c.count += m.count; }
        c.stale = false;
      } else c.stale = true;
    }
  }

  // cam: render-space camera position, [X, Y, Z] or {x, z}; budget: QUALITY[*].props (optional, keeps the current);
  // focus: render-space point the lamps gather around (the camera target; defaults to cam)
  update(cam, budget, focus) {
    if (budget && typeof budget === 'object' && budget !== this._budgetRef) { this._budgetRef = budget; this.setBudget(budget); }
    const B = this.budget;
    const gx = (cam.x ?? cam[0]) + CX, gy = (cam.z ?? cam[2]) + CY;
    const f = focus || cam, fx = (f.x ?? f[0]) + CX, fy = (f.z ?? f[2]) + CY, L = this.lamps;
    if (L.radius !== B.lampRadius || !L.at || Math.hypot(fx - L.at[0], fy - L.at[1]) > LAMP_REFILL) this._refillLamps(fx, fy);

    const i0 = Math.floor((gx - B.treeLoad) / CHUNK), i1 = Math.floor((gx + B.treeLoad) / CHUNK), j0 = Math.floor((gy - B.treeLoad) / CHUNK), j1 = Math.floor((gy + B.treeLoad) / CHUNK);
    let built = false;   // one new chunk per call keeps frames short
    for (let i = i0; i <= i1 && !built; i++) for (let j = j0; j <= j1 && !built; j++) {
      const key = cellKey(i, j);
      if (this.chunks.has(key) || Math.hypot((i + 0.5) * CHUNK - gx, (j + 0.5) * CHUNK - gy) > B.treeLoad) continue;
      this.chunks.set(key, this._buildChunk(i, j)); built = true;
    }
    for (const [key, c] of this.chunks) {
      if (Math.hypot((c.i + 0.5) * CHUNK - gx, (c.j + 0.5) * CHUNK - gy) > B.treeDrop) { this._disposeChunk(c); this.chunks.delete(key); }
      else if (c.stale && !built) { this._disposeChunk(c); this.chunks.set(key, this._buildChunk(c.i, c.j)); built = true; }
    }
  }

  _buildChunk(i, j) {
    const cap = this.budget.treeCap, rand = rng((i * 73856093) ^ (j * 19349663) ^ 0x9e3779b9);
    const pts = [], x0 = i * CHUNK, y0 = j * CHUNK;
    for (let n = 0; n < cap * 9 && pts.length < cap; n++) {
      const x = x0 + rand() * CHUNK, y = y0 + rand() * CHUNK, r = rand(), v = this.density(x, y);
      if (v < 0.05 || rand() > v || this.field.heightAt(x, y) < 0.5) continue;
      pts.push([x, y, r, v]);
    }
    const isPine = (p) => (p[3] > 0.5 ? p[2] < 0.62 : p[2] < 0.15);
    const meshes = [];
    for (const [geo, list, tones, pineSet] of [[this.pine, pts.filter(isPine), PINE_TONES, true], [this.broad, pts.filter((p) => !isPine(p)), BROAD_TONES, false]]) {
      if (!list.length) continue;
      const im = new THREE.InstancedMesh(geo, this.treeMat, list.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
      list.forEach((t, k) => {
        const sc = 0.75 + hash(t[0] * 0.7 + t[1]) * 0.7;
        s.set(sc, sc * (0.9 + t[2] * 0.3), sc); q.setFromAxisAngle(up, t[2] * 6.28);
        p.set(t[0] - CX, this.field.renderY(t[0], t[1]) - 0.3, t[1] - CY); m4.compose(p, q, s); im.setMatrixAt(k, m4);
        const n = tones.length - (pineSet || t[3] > 0.6 ? 0 : 2);
        im.setColorAt(k, c.set(tones[Math.floor(hash(t[0] + t[1] * 0.3) * n)]));
      });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = true; im.receiveShadow = true; im.userData.full = list.length;
      this.scene.add(im); meshes.push(im);
    }
    return { i, j, meshes, count: pts.length, cap, stale: false };
  }

  _disposeChunk(c) { for (const m of c.meshes) { this.scene.remove(m); m.dispose(); } }

  dispose() {
    for (const c of this.chunks.values()) this._disposeChunk(c);
    this.chunks.clear();
    for (const m of [this.lamps.body, this.lamps.lens, this.lamps.pool]) { this.scene.remove(m); m.geometry.dispose(); m.material.map?.dispose(); m.material.dispose(); m.dispose(); }
    this.pine.dispose(); this.broad.dispose(); this.treeMat.dispose();
  }
}
