// Instanced trees (streamed per 2 km chunk) and street lamps (built once). Positions come from the pure sim modules in
// game frame; meshes live in render space (toRender / field.renderY).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CX, CY } from '../frame.js';
import { roadClearance } from '../sim/roads.js';
import { lampSpots, createForestDensity, createUrbanTest, createWaterTest } from '../sim/lampspots.js';

const CHUNK = 2000, LOAD = 4000, DROP = 5000, S = 1.25;
const CAPS = { high: 1200, medium: 1200, low: 450 };
const LIGHT = { day: [0, 0], dusk: [1.6, 0.12], night: [4.0, 0.4] };
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

function colorize(g, hex) {
  if (g.index) g = g.toNonIndexed();
  const c = new THREE.Color(hex), a = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv');
  return g;
}

function radialTexture(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const PINE_TONES = ['#2f5a2a', '#3b6a31', '#2a4f27', '#45753a'];
const BROAD_TONES = ['#4f8a3a', '#5f9a44', '#6b9e46', '#88a94a', '#c3a443', '#c46e3a'];

export class Props {
  constructor(scene, field, features, collider, graph) {
    this.scene = scene; this.field = field; this.chunks = new Map(); this.quality = 'high';
    const clearance = roadClearance(features).clearance;
    this.isWater = createWaterTest(features, field);
    this.density = createForestDensity(field, features, { clearance, collider, isWater: this.isWater });
    this.treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    const trunk = (r0, r1, h) => colorize(new THREE.CylinderGeometry(r0, r1, h, 5).translate(0, h / 2, 0), '#7a5a3c');
    this.pine = mergeGeometries([trunk(0.35, 0.5, 3), colorize(new THREE.ConeGeometry(2.9, 8.5, 7).translate(0, 7, 0), '#ffffff')]);
    this.broad = mergeGeometries([trunk(0.35, 0.55, 3.2), colorize(new THREE.IcosahedronGeometry(3.4, 1).scale(1, 0.88, 1).translate(0, 6, 0), '#ffffff')]);
    this.lamps = this._buildLamps(graph, collider, features, clearance);
    this.setNight(0, 0);
  }

  _buildLamps(graph, collider, features, clearance) {
    const urban = createUrbanTest(collider.rings || []);
    const isForest = (x, y) => this.density(x, y) > 0.35;
    const list = lampSpots(graph, collider, this.isWater, urban, isForest);
    const col = '#55625d';
    const arm = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 8.6, 0), new THREE.Vector3(0, 9.9, 0), new THREE.Vector3(0, 9.75, 2.6)), 10, 0.09, 6);
    const bodyGeo = mergeGeometries([
      colorize(new THREE.CylinderGeometry(0.42, 0.5, 0.7, 8).translate(0, 0.35, 0), '#5c6660'),
      colorize(new THREE.CylinderGeometry(0.13, 0.22, 9.0, 8).translate(0, 4.5, 0), col),
      colorize(arm, col),
      colorize(new RoundedBoxGeometry(0.62, 0.2, 1.45, 2, 0.08).translate(0, 9.72, 3.15), '#3e4743'),
    ]).scale(S, S, S);
    const body = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.55 }), list.length);
    this.headMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffe3b0, emissiveIntensity: 0, roughness: 0.3 });
    const lens = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.5, 1.2).rotateX(Math.PI / 2).translate(0, 9.6, 3.15).scale(S, S, S), this.headMat, list.length);
    this.poolMat = new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,206,140,.75)', 'rgba(255,206,140,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: true });
    const pool = new THREE.InstancedMesh(new THREE.PlaneGeometry(13, 20).rotateX(-Math.PI / 2).translate(0, 0, 4.5), this.poolMat, list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3();
    list.forEach(({ x, y, yaw }, i) => {
      q.setFromAxisAngle(up, yaw); pos.set(x - CX, this.field.renderY(x, y) - 0.25, y - CY);
      m4.compose(pos, q, one); body.setMatrixAt(i, m4); lens.setMatrixAt(i, m4);
      const px = x + Math.sin(yaw) * 4, py = y + Math.cos(yaw) * 4;
      pos.y = this.field.renderY(px, py) + 0.4; m4.compose(pos, q, one); pool.setMatrixAt(i, m4);
    });
    body.castShadow = true; body.receiveShadow = true; pool.renderOrder = 2;
    for (const m of [body, lens, pool]) { m.instanceMatrix.needsUpdate = true; this.scene.add(m); }
    return { body, lens, pool, count: list.length };
  }

  setNight(lamps, pools) {
    this.headMat.emissiveIntensity = lamps;
    this.poolMat.opacity = pools;
    this.lamps.pool.visible = pools > 0.001;
  }

  setTime(key) { const l = LIGHT[key] || LIGHT.day; this.setNight(l[0], l[1]); }

  // cam: render-space position, [X, Y, Z] or {x, z}; quality: 'high' | 'medium' | 'low'
  update(cam, quality = 'high') {
    this.quality = typeof quality === 'string' ? quality : quality?.key || this.quality;
    const gx = (cam.x ?? cam[0]) + CX, gy = (cam.z ?? cam[2]) + CY;
    const i0 = Math.floor((gx - LOAD) / CHUNK), i1 = Math.floor((gx + LOAD) / CHUNK), j0 = Math.floor((gy - LOAD) / CHUNK), j1 = Math.floor((gy + LOAD) / CHUNK);
    let built = false;   // one new chunk per call keeps frames short
    for (let i = i0; i <= i1 && !built; i++) for (let j = j0; j <= j1 && !built; j++) {
      const key = i + ',' + j;
      if (this.chunks.has(key) || Math.hypot((i + 0.5) * CHUNK - gx, (j + 0.5) * CHUNK - gy) > LOAD) continue;
      this.chunks.set(key, this._buildChunk(i, j)); built = true;
    }
    for (const [key, c] of this.chunks) {
      if (Math.hypot((c.i + 0.5) * CHUNK - gx, (c.j + 0.5) * CHUNK - gy) > DROP) { this._disposeChunk(c); this.chunks.delete(key); }
    }
  }

  _buildChunk(i, j) {
    const cap = CAPS[this.quality] ?? CAPS.high, rand = rng((i * 73856093) ^ (j * 19349663) ^ 0x9e3779b9);
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
      im.castShadow = true; im.receiveShadow = true;
      this.scene.add(im); meshes.push(im);
    }
    return { i, j, meshes, count: pts.length };
  }

  _disposeChunk(c) { for (const m of c.meshes) { this.scene.remove(m); m.dispose(); } }

  dispose() {
    for (const c of this.chunks.values()) this._disposeChunk(c);
    this.chunks.clear();
    for (const m of [this.lamps.body, this.lamps.lens, this.lamps.pool]) { this.scene.remove(m); m.geometry.dispose(); m.material.map?.dispose(); m.material.dispose(); m.dispose(); }
    this.pine.dispose(); this.broad.dispose(); this.treeMat.dispose();
  }
}
