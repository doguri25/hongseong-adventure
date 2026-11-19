import * as THREE from 'three';
import { BOUNDS, M_LON, M_LAT } from '../frame.js';
import { paintRegion, makeMasks, makePatterns, slimFeatures, slimBuildings, noiseCanvas, MEADOW_COLOR } from './paint.js';

export const W = (BOUNDS[2] - BOUNDS[0]) * M_LON;
export const H = (BOUNDS[3] - BOUNDS[1]) * M_LAT;
const SNAP = 25;
const MID_R = 3000;
const REPAINT = 0.3;
const FINE_PX_PER_M = 1.4;
const EDGE = 0.14;
const NEAR_OFF = 260;   // m above the ground: above this the near level is faded out, so it is not repainted either

// Near-level radius by travel mode; null = no near level (plane).
export function nearRadius(mode) {
  if (mode === 'plane') return null;
  return mode === 'car' || mode === 'supercar' || mode === 'slowplane' || mode === 'boat' ? 1100 : 650;
}

// cam: {x, y, mode, fly?} (fly: metres above the ground). Returns the rectangle a level should cover: centre snapped
// to 25 m, radius R (null = off: the near level for the jet, and for anything flying higher than NEAR_OFF).
export function levelFor(name, cam) {
  if (name === 'base') return { cx: W / 2, cy: H / 2, R: Math.max(W, H) / 2, wx: W, wy: H };
  if (name === 'near' && cam.fly > NEAR_OFF) return null;
  const R = name === 'mid' ? MID_R : nearRadius(cam.mode);
  if (R === null) return null;
  return { cx: Math.round(cam.x / SNAP) * SNAP, cy: Math.round(cam.y / SNAP) * SNAP, R, wx: 2 * R, wy: 2 * R };
}

// level: the painted state {cx, cy, R} or null/undefined when nothing is painted.
export function needsRepaint(level, cx, cy) {
  if (!level) return true;
  return Math.hypot(cx - level.cx, cy - level.cy) > REPAINT * level.R;
}

// texture size per level; sizes = QUALITY[*].ground {base, near} (fixed at boot), the mid level is always 2048
const sizeFor = (name, sizes) => name === 'mid' ? 2048 : sizes[name];
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const FRAG_HEAD = `uniform sampler2D uBase, uMid, uNear, uDetail;
uniform vec4 uMidRect, uNearRect; uniform vec2 uCounty; uniform vec3 uStrength;
float levelFade(vec2 uv) { float e = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)); return smoothstep(0.0, ${EDGE.toFixed(2)}, e); }
`;
const FRAG_BODY = `
  vec2 gp = vec2(vMapUv.x * uCounty.x, (1.0 - vMapUv.y) * uCounty.y);
  vec3 gcol = diffuseColor.rgb;
  gcol = mix(gcol, texture2D(uBase, vec2(gp.x / uCounty.x, gp.y / uCounty.y)).rgb, uStrength.x);
  vec2 muv = (gp - uMidRect.xy) / uMidRect.zw;
  gcol = mix(gcol, texture2D(uMid, muv).rgb, levelFade(muv) * uStrength.y);
  vec2 nuv = (gp - uNearRect.xy) / uNearRect.zw;
  gcol = mix(gcol, texture2D(uNear, nuv).rgb, levelFade(nuv) * uStrength.z);
  diffuseColor.rgb = gcol * mix(.86, 1.1, texture2D(uDetail, vMapUv * 380.0).r) * mix(.92, 1.05, texture2D(uDetail, vMapUv * 41.0).r);`;

export class Ground {
  constructor(renderer, field, features, buildings, { low = false, sizes } = {}) {
    this.renderer = renderer; this.field = field; this.low = low;
    this.sizes = sizes || (low ? { base: 2048, near: 1024 } : { base: 4096, near: 2048 });
    this.features = features; this.buildings = buildings;
    const aniso = renderer.capabilities.getMaxAnisotropy();
    const blank = () => { const t = new THREE.Texture(); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; return t; };
    this.levels = {};
    for (const name of ['base', 'mid', 'near']) {
      this.levels[name] = { name, tex: blank(), rect: new THREE.Vector4(0, 0, 1, 1), painted: null, gen: 0, busy: false, strength: 0, job: null, canvas: null };
    }
    const detail = new THREE.CanvasTexture(noiseCanvas((w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h }), 256, 16, 3.1));
    detail.wrapS = detail.wrapT = THREE.RepeatWrapping; detail.anisotropy = aniso;
    // the uniform textures start empty; strength 0 keeps them unsampled-visible until a level arrives
    const uniforms = {
      uBase: { value: this.levels.base.tex }, uMid: { value: this.levels.mid.tex }, uNear: { value: this.levels.near.tex }, uDetail: { value: detail },
      uMidRect: { value: this.levels.mid.rect }, uNearRect: { value: this.levels.near.rect },
      uCounty: { value: new THREE.Vector2(W, H) }, uStrength: { value: new THREE.Vector3(0, 0, 0) },
    };
    this.uniforms = uniforms;
    this.material = new THREE.MeshStandardMaterial({ color: new THREE.Color(MEADOW_COLOR), roughness: 0.96, metalness: 0 });
    // the vertex UVs only reach the fragment stage through a map; give the material a tiny placeholder so vMapUv exists
    this.material.map = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    this.material.map.needsUpdate = true;
    this.material.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, uniforms);
      s.fragmentShader = FRAG_HEAD + s.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>' + FRAG_BODY);
    };

    this.t = typeof performance !== 'undefined' ? performance.now() : 0;
    this.mode = 'walk';
    this.worker = null; this.workerOk = false; this.fallback = null; this.destroyed = false;
    this._startWorker();
  }

  _startWorker() {
    let w = null;
    try {
      if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') throw new Error('no worker');
      w = new Worker(new URL('./ground-worker.js', import.meta.url), { type: 'module' });
    } catch (e) { this._useFallback(); return; }
    this.worker = w;
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'ready') this.workerOk = true;
      else if (m.type === 'unsupported') { this._useFallback(); }
      else if (m.type === 'painted') this._arrived(m);
    };
    w.onerror = () => this._useFallback();
    const field = this.field;
    w.postMessage({
      type: 'init', features: slimFeatures(this.features), buildings: slimBuildings(this.buildings),
      grid: { w: field.w, h: field.h, cell: field.cell }, data: field.data.slice(),
    });
  }

  _useFallback() {
    if (this.fallback) return;
    if (this.worker) { this.worker.terminate(); this.worker = null; }
    this.workerOk = false;
    const mk = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
    this.fallback = { mk, features: slimFeatures(this.features), buildings: slimBuildings(this.buildings), masks: null, patterns: null };
    for (const L of Object.values(this.levels)) { L.busy = false; if (L.job) L.job = null; }
  }

  _request(L, c) {
    const size = sizeFor(L.name, this.sizes);
    const fine = size / c.wx > FINE_PX_PER_M;
    const x0 = c.cx - c.wx / 2, y0 = c.cy - c.wy / 2;
    L.pending = { cx: c.cx, cy: c.cy, R: c.R, x0, y0, wx: c.wx, wy: c.wy };
    if (this.worker) {
      L.busy = true;
      this.worker.postMessage({ type: 'paint', level: L.name, gen: L.gen, x0, y0, wx: c.wx, wy: c.wy, size, fine });
    } else {
      L.job = { ...L.pending, size, fine, q: 0, gen: L.gen };
    }
  }

  _arrived(m) {
    const L = this.levels[m.level];
    if (m.gen !== L.gen || !L.pending) { m.bitmap.close(); L.busy = false; return; }   // stale
    const old = L.tex.image;
    L.tex.image = m.bitmap; L.tex.needsUpdate = true;
    if (old && old.close) old.close();
    this._commit(L);
  }

  _commit(L) {
    const p = L.pending;
    L.painted = { cx: p.cx, cy: p.cy, R: p.R };
    L.rect.set(p.x0, p.y0, p.wx, p.wy);
    L.pending = null; L.busy = false; L.job = null;
  }

  // one quarter of the target per frame, so a frame never paints a whole level
  _stepFallback(L) {
    const F = this.fallback, J = L.job;
    if (!F.masks) {
      F.masks = makeMasks({ w: this.field.w, h: this.field.h, cell: this.field.cell }, this.field.data, F.mk);
      F.patterns = makePatterns(F.mk);
      return;   // building masks/patterns takes a frame by itself
    }
    const w = J.size, h = Math.max(1, Math.round(J.size * J.wy / J.wx));
    const back = L.back && L.back.width === w && L.back.height === h ? L.back : (L.back = F.mk(w, h));
    const qc = L.quarter && L.quarter.width === w >> 1 && L.quarter.height === h >> 1 ? L.quarter : (L.quarter = F.mk(w >> 1, h >> 1));
    const qx = J.q % 2, qy = J.q >> 1, qw = J.wx / 2, qh = J.wy / 2;
    paintRegion(qc.getContext('2d'), J.x0 + qx * qw, J.y0 + qy * qh, qw, qh, { features: F.features, buildings: F.buildings, masks: F.masks, patterns: F.patterns, fine: J.fine, mk: F.mk });
    back.getContext('2d').drawImage(qc, qx * (w >> 1), qy * (h >> 1));
    if (++J.q === 4) {
      L.tex.image = back; L.tex.needsUpdate = true;
      L.back = L.canvas; L.canvas = back;
      this._commit(L);
    }
  }

  // camTarget: [x, y] game frame; mode: walk|bike|car|supercar|slowplane|plane|boat; flyHeight: metres above ground
  update(camTarget, mode, flyHeight = 0) {
    const now = typeof performance !== 'undefined' ? performance.now() : this.t + 16;
    const dt = Math.min(0.1, Math.max(0, (now - this.t) / 1000)); this.t = now;
    const cam = { x: camTarget[0], y: camTarget[1], mode, fly: flyHeight };
    const L = this.levels;

    // base once, then mid, then near
    const wants = [['base', levelFor('base', cam)], ['mid', levelFor('mid', cam)], ['near', levelFor('near', cam)]];
    const anyJob = Object.values(L).some((l) => l.busy || l.job);
    for (const [name, c] of wants) {
      const lv = L[name];
      if (!c) continue;
      if (lv.busy || lv.job) continue;
      const need = name === 'base' ? !lv.painted : (needsRepaint(lv.painted, c.cx, c.cy) || lv.painted.R !== c.R);
      if (!need) continue;
      if (this.fallback && anyJob) break;     // the fallback paints one level at a time
      if (this.worker && !this.workerOk) break; // wait for the worker to finish its setup
      lv.gen++; this._request(lv, c);
      if (this.fallback) break;
    }
    if (this.fallback) { for (const lv of Object.values(L)) if (lv.job) { this._stepFallback(lv); break; } }

    const k = 1 - Math.exp(-3 * dt);
    const nearWant = mode === 'plane' ? 0 : 1 - smoothstep(160, 260, flyHeight);
    const target = { base: L.base.painted ? 1 : 0, mid: L.mid.painted ? 1 : 0, near: L.near.painted ? nearWant : 0 };
    L.base.strength = target.base; L.mid.strength = target.mid;
    L.near.strength += (target.near - L.near.strength) * k;
    this.uniforms.uStrength.value.set(L.base.strength, L.mid.strength, L.near.strength);
    this.mode = mode;
  }

  dispose() {
    this.destroyed = true;
    if (this.worker) this.worker.terminate();
    for (const lv of Object.values(this.levels)) lv.tex.dispose();
    this.material.dispose();
  }
}
