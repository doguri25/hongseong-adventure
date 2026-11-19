// Hongseong Adventure 3D spike (throwaway): Naepo + Yongbongsan on the game's own map data, rendered with Three.js
// and the graphics stack of pokju-edu (sky shader, bloom, colour grade, quality steps, context-loss recovery).
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const D = window.SPIKE_DATA, A = window.SPIKE_ASSETS, SH = window.SPIKE_SHADERS;
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const wrapAngle = a => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
const dampAngle = (a, b, k, dt) => a + wrapAngle(b - a) * (1 - Math.exp(-k * dt));
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const step = async text => { $('loading-step').textContent = text; await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))); };
let toastTimer = 0;
function toast(text) { const t = $('toast'); t.textContent = text; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2800); }

// ---------- local frame: metres, x east, z south (the game's map frame shifted to the area centre)
const CX = (D.min[0] + D.max[0]) / 2, CZ = (D.min[1] + D.max[1]) / 2, WX = D.max[0] - D.min[0], WZ = D.max[1] - D.min[1];
const loc = p => [p[0] - CX, p[1] - CZ];
const VEX = 1.2, EDGE_H = 6;
for (const f of D.features) { f.p = f.p.map(loc); f.h = (f.h || []).map(r => r.map(loc)); }
const tag = f => f.t;
function inRing(x, z, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
const ringArea = r => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return s / 2; };
const bboxOf = r => { const b = [1e9, 1e9, -1e9, -1e9]; for (const p of r) { b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); } return b; };
const closed = f => f.p.length > 3 && Math.hypot(f.p[0][0] - f.p.at(-1)[0], f.p[0][1] - f.p.at(-1)[1]) < 0.5;
const isWater = t => t.natural === 'water' || t.landuse === 'reservoir' || t.landuse === 'basin' || t.waterway === 'riverbank';

// ---------- height field
const [GW, GH] = D.grid;
const bytes = Uint8Array.from(atob(D.heights), c => c.charCodeAt(0));
const raw16 = new Uint16Array(bytes.buffer, 0, GW * GH);
const HG = new Float32Array(GW * GH);
for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
  const k = j * GW + i; let h = raw16[k] / 10 - 50;
  const e = Math.min(i, GW - 1 - i, j, GH - 1 - j) / (Math.min(GW, GH) * 0.07);
  if (e < 1) h = lerp(EDGE_H, h, smooth(0, 1, e));
  HG[k] = h;
}
const gx = x => (x + WX / 2) / WX * (GW - 1), gz = z => (z + WZ / 2) / WZ * (GH - 1);
function rawHeight(x, z) {
  const fx = clamp(gx(x), 0, GW - 1.001), fz = clamp(gz(z), 0, GH - 1.001), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * GW + i;
  return lerp(lerp(HG[k], HG[k + 1], u), lerp(HG[k + GW], HG[k + GW + 1], u), v);
}
const heightAt = (x, z) => rawHeight(x, z) * VEX;

// carve the larger ponds so their flat water sits in a bowl rather than under the smoothed DEM
const waterPolys = D.features.filter(f => isWater(tag(f)) && closed(f)).map(f => {
  const level = Math.min(...f.p.filter((_, i) => i % 3 === 0).map(p => rawHeight(p[0], p[1])));
  return {f, level, bb: bboxOf(f.p)};
});
for (const w of waterPolys) {
  const i0 = Math.max(0, Math.floor(gx(w.bb[0]))), i1 = Math.min(GW - 1, Math.ceil(gx(w.bb[2]))), j0 = Math.max(0, Math.floor(gz(w.bb[1]))), j1 = Math.min(GH - 1, Math.ceil(gz(w.bb[3])));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = i / (GW - 1) * WX - WX / 2, z = j / (GH - 1) * WZ - WZ / 2;
    if (inRing(x, z, w.f.p)) HG[j * GW + i] = Math.min(HG[j * GW + i], w.level - 1.6);
  }
}

// ---------- renderer and quality (pokju: pixel cap per quality step, automatic resolution steps before effects go)
const QUALITY = {
  high: {label: '높음', dpr: 2, cap: 2.6e6, shadow: 2048, bloom: true, trees: 16000, tex: 4096, msaa: 4},
  low: {label: '낮음', dpr: 1.25, cap: 1.2e6, shadow: 1024, bloom: false, trees: 6000, tex: 2048, msaa: 0}
};
let savedQuality = 'auto';
try { savedQuality = localStorage.getItem('hs3d-quality') || 'auto'; } catch {}
let qualityMode = savedQuality, Q = QUALITY[qualityMode === 'low' ? 'low' : 'high'], autoScale = 1;
const canvas = $('c');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({canvas, antialias: false, powerPreference: 'high-performance'});
} catch (e) {
  $('loading').innerHTML = '<div>이 기기에서는 3D 화면을 열 수 없어요<p>WebGL을 지원하는 최신 브라우저에서 열어 주세요.</p></div>';
  throw e;
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const maxAniso = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, 1, 1.0, 42000);
scene.fog = new THREE.Fog(0xbfd8e8, 1200, 5200);

// ---------- textures drawn on canvas
function noiseCanvas(size, scale, seed) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'), img = g.createImageData(size, size);
  const n = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453; return s - Math.floor(s); };
  const val = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, w = v => ((v % (size / scale)) + size / scale) % (size / scale);
    const a = n(w(xi), w(yi)), b = n(w(xi + 1), w(yi)), c2 = n(w(xi), w(yi + 1)), d = n(w(xi + 1), w(yi + 1)), u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return lerp(lerp(a, b, u), lerp(c2, d, u), v); };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0, amp = .5, f = 1 / scale; for (let o = 0; o < 4; o++) { v += val(x * f, y * f) * amp; amp *= .5; f *= 2; }
    const k = (y * size + x) * 4, b = Math.round(v * 255); img.data[k] = img.data[k + 1] = img.data[k + 2] = b; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0); return c;
}

// window walls: 4 bays x 4 floors per repeat; emissive = lit windows (random per window)
function facadeTextures() {
  const S = 512, c = document.createElement('canvas'), e = document.createElement('canvas'); c.width = c.height = e.width = e.height = S;
  const g = c.getContext('2d'), ge = e.getContext('2d'); g.fillStyle = '#eeeae1'; g.fillRect(0, 0, S, S); ge.fillStyle = '#000'; ge.fillRect(0, 0, S, S);
  const bw = S / 4, fh = S / 4;
  for (let fy = 0; fy < 4; fy++) for (let bx = 0; bx < 4; bx++) {
    const x = bx * bw, y = fy * fh;
    g.fillStyle = '#d9d3c6'; g.fillRect(x, y + fh * .86, bw, fh * .14);               // floor band (also the roof sample area)
    g.fillStyle = '#5d7387'; g.fillRect(x + bw * .12, y + fh * .2, bw * .76, fh * .56);  // glass
    g.fillStyle = '#7f97ab'; g.fillRect(x + bw * .12, y + fh * .2, bw * .76, fh * .12);  // sky in the glass
    g.fillStyle = '#c8c1b2'; g.fillRect(x + bw * .49, y + fh * .2, bw * .03, fh * .56);  // mullion
    g.fillStyle = '#cfc8b8'; g.fillRect(x + bw * .08, y + fh * .76, bw * .84, fh * .05); // sill
    const r = hash(fy * 7.3 + bx * 3.1 + 1.7);
    if (r < .42) { ge.fillStyle = r < .2 ? '#ffd9a0' : r < .4 ? '#ffc070' : '#f7e6c4'; ge.fillRect(x + bw * .13, y + fh * .21, bw * .74, fh * .54); }
  }
  const t = new THREE.CanvasTexture(c), te = new THREE.CanvasTexture(e);
  for (const x of [t, te]) { x.wrapS = x.wrapT = THREE.RepeatWrapping; x.anisotropy = maxAniso; }
  t.colorSpace = te.colorSpace = THREE.SRGBColorSpace;
  return {map: t, emissive: te};
}

function radialTexture(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------- ground painting (the game's cartography idea, at 1-2 m per texel, draped on the terrain)
const ROAD = {
  motorway: [24, '#585b60', 1], trunk: [20, '#5a5d62', 1], primary: [16, '#5c5f64', 1], secondary: [13, '#5f6267', 1], tertiary: [10, '#64676b', 1],
  motorway_link: [9, '#5c5f64', 1], trunk_link: [9, '#5c5f64', 1], primary_link: [8, '#5f6267', 1], secondary_link: [8, '#5f6267', 1], tertiary_link: [7, '#64676b', 1],
  unclassified: [7, '#6a6c70', 1], residential: [7, '#6b6d71', 1], living_street: [6, '#7a7a78', 1], service: [4.5, '#76787a', 1], pedestrian: [6, '#d9cdb4', 0],
  track: [3.2, '#b7a27a', 0], path: [2, '#d8cba9', 0], footway: [2.2, '#ddd0b2', 0], cycleway: [2.4, '#c58d7a', 0], steps: [2, '#cbbfa8', 0], construction: [6, '#b9ad94', 0]
};
const LANDUSE = {
  residential: '#d5d0c3', commercial: '#d9cbc2', retail: '#d9cbc2', industrial: '#cbc7c1', construction: '#cbb894', greenfield: '#b4c784', brownfield: '#bdb197',
  park: '#8ec266', garden: '#93c46c', pitch: '#6fb257', playground: '#c9bf92', wood: '#4d773b', forest: '#4d773b', scrub: '#6f8f4a', farmland: '#a7c564',
  farmyard: '#c7bc90', bare_rock: '#a49e90', cemetery: '#9db787', religious: '#d6ccbc', grass: '#9cc56a', meadow: '#a8c86e', landfill: '#b2a78a', school: '#d8cfbd'
};
function landuseColor(t) { return LANDUSE[t.landuse] || LANDUSE[t.leisure] || LANDUSE[t.natural] || LANDUSE[t.amenity] || null; }

// Ground painting in world metres. The same painter fills the whole-area texture once and, near the explorer, an 800 m
// square at ~0.4 m per texel; textures are anchored to the world so the two agree where they blend.
const GROUND = {masks: null, patterns: null, boxes: null};
function groundMasks() {
  if (GROUND.masks) return GROUND.masks;
  const mk = () => { const m = document.createElement('canvas'); m.width = GW; m.height = GH; return m; };
  const forestM = mk(), paddyM = mk(), fi = forestM.getContext('2d').createImageData(GW, GH), pi = paddyM.getContext('2d').createImageData(GW, GH), cell = WX / (GW - 1);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const k = j * GW + i, h = HG[k], dx = (HG[j * GW + Math.min(GW - 1, i + 1)] - HG[j * GW + Math.max(0, i - 1)]) / (2 * cell), dz = (HG[Math.min(GH - 1, j + 1) * GW + i] - HG[Math.max(0, j - 1) * GW + i]) / (2 * cell);
    const s = Math.hypot(dx, dz), forest = Math.max(smooth(.09, .16, s) * smooth(24, 40, h), smooth(55, 80, h)), paddy = (1 - forest) * smooth(.045, .02, s) * smooth(55, 32, h);
    fi.data[k * 4 + 3] = forest * 255; pi.data[k * 4 + 3] = paddy * 255;
  }
  forestM.getContext('2d').putImageData(fi, 0, 0); paddyM.getContext('2d').putImageData(pi, 0, 0);
  return GROUND.masks = {forestM, paddyM};
}
function groundPatterns() {
  if (GROUND.patterns) return GROUND.patterns;
  const tile = (px, paint) => { const c = document.createElement('canvas'); c.width = c.height = px; paint(c.getContext('2d'), px); return c; };
  // meadow: 160 m tile, soft mottling and grass flecks
  const meadow = tile(512, (g, n) => { g.fillStyle = '#93b65e'; g.fillRect(0, 0, n, n); for (let i = 0; i < 900; i++) { const r = hash(i * 3.7); g.globalAlpha = .35; g.fillStyle = r < .5 ? '#86aa52' : '#a2c26b'; g.beginPath(); g.arc(hash(i * 1.3) * n, hash(i * 2.9) * n, 8 + r * 34, 0, 7); g.fill(); } g.globalAlpha = .5; for (let i = 0; i < 9000; i++) { g.fillStyle = i % 2 ? '#7fa24b' : '#a9c874'; g.fillRect(hash(i * 5.1) * n, hash(i * 6.7) * n, 1.4, 1.4); } g.globalAlpha = 1; });
  // forest floor seen from above: crowded crowns, 96 m tile
  const forest = tile(512, (g, n) => { g.fillStyle = '#466e36'; g.fillRect(0, 0, n, n); const tones = ['#3b622e', '#557f40', '#436a33', '#4f7a3c', '#365a2b', '#5f8a46']; for (let i = 0; i < 2600; i++) { const x = hash(i * 4.1) * n, y = hash(i * 7.7) * n, r = 6 + hash(i * 9.3) * 12; g.fillStyle = '#2c4a24'; g.beginPath(); g.arc(x + 2, y + 2.5, r, 0, 7); g.fill(); g.fillStyle = tones[i % tones.length]; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); } });
  // paddies: 480 m tile of plots with levees
  const paddy = tile(1024, (g, n) => { g.fillStyle = '#7e9b47'; g.fillRect(0, 0, n, n); const tones = ['#a7c964', '#98bd55', '#b2cf6f', '#8fb64e', '#bcc97c', '#a3c35f']; const m = n / 480; let y = 0, row = 0; while (y < n) { const h = 30 * m; let x = 0, col = 0; while (x < n) { let w = (34 + hash(row * 31 + col * 7.3) * 46) * m; if (n - x - w < 30 * m) w = n - x; g.fillStyle = tones[Math.floor(hash(row * 13.1 + col * 3.3) * tones.length)]; g.fillRect(x + .9 * m, y + .9 * m, w - 1.8 * m, h - 1.8 * m); g.globalAlpha = .18; g.fillStyle = '#6f9a3c'; for (let s = 2.5 * m; s < h - 2 * m; s += 1.6 * m) g.fillRect(x + 1.5 * m, y + s, w - 3 * m, .35 * m); g.globalAlpha = 1; x += w; col++; } y += h; row++; } });
  return GROUND.patterns = {meadow: [meadow, 160], forest: [forest, 96], paddy: [paddy, 480]};
}
function featureBoxes() { return GROUND.boxes || (GROUND.boxes = D.features.map(f => bboxOf(f.p))); }

function paintRegion(c, x0, z0, wx, wz) {
  const S = c.width, g = c.getContext('2d'), sx = S / wx, sz = S / wz, fine = sx > 1.4;
  const {forestM, paddyM} = groundMasks(), P = groundPatterns(), boxes = featureBoxes();
  const near = (i, pad = 30) => { const b = boxes[i]; return b[2] >= x0 - pad && b[0] <= x0 + wx + pad && b[3] >= z0 - pad && b[1] <= z0 + wz + pad; };
  const world = () => g.setTransform(sx, 0, 0, sz, -x0 * sx, -z0 * sz);
  const pattern = (target, [tile, metres], angle = 0) => { const p = target.createPattern(tile, 'repeat'); p.setTransform(new DOMMatrix().translateSelf(-x0 * sx, -z0 * sz).scaleSelf(sx, sz).rotateSelf(angle).scaleSelf(metres / tile.width)); return p; };
  const masked = (mask, pat, angle) => {
    const l = document.createElement('canvas'); l.width = l.height = S; const lg = l.getContext('2d');
    lg.fillStyle = pattern(lg, pat, angle); lg.fillRect(0, 0, S, S); lg.globalCompositeOperation = 'destination-in'; lg.imageSmoothingEnabled = true;
    const mx = (x0 + WX / 2) / WX * GW, mz = (z0 + WZ / 2) / WZ * GH; lg.drawImage(mask, mx, mz, wx / WX * GW, wz / WZ * GH, 0, 0, S, S); return l;
  };
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = pattern(g, P.meadow); g.fillRect(0, 0, S, S);
  g.drawImage(masked(paddyM, P.paddy, 12), 0, 0); g.drawImage(masked(forestM, P.forest), 0, 0);
  world();
  const path = (pts, close) => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); if (close) g.closePath(); };
  const F = D.features;
  for (let i = 0; i < F.length; i++) { const f = F[i], t = f.t, col = !t.highway && !t.building && !isWater(t) && closed(f) && landuseColor(t); if (!col || !near(i)) continue; path(f.p, true); g.fillStyle = ['wood', 'forest'].includes(t.landuse) || ['wood', 'scrub'].includes(t.natural) ? pattern(g, P.forest) : col; g.fill(); if (t.leisure === 'pitch') { g.strokeStyle = '#e8f2dc'; g.lineWidth = 1.2; g.stroke(); } }
  for (const w of waterPolys) { path(w.f.p, true); g.fillStyle = '#3f86b3'; g.fill(); g.strokeStyle = '#c9c39f'; g.lineWidth = 3; g.stroke(); }
  g.lineCap = g.lineJoin = 'round';
  for (let i = 0; i < F.length; i++) { const t = F[i].t; if (!t.waterway || t.waterway === 'riverbank' || !near(i)) continue; const w = t.waterway === 'river' ? 16 : t.waterway === 'stream' ? 6 : 3.5; path(F[i].p); g.strokeStyle = '#b9c49a'; g.lineWidth = w + 4; g.stroke(); g.strokeStyle = '#4a8fbb'; g.lineWidth = w; g.stroke(); }
  for (let i = 0; i < F.length; i++) { if (!F[i].t.building || !near(i)) continue; path(F[i].p, true); g.fillStyle = '#9d978c'; g.fill(); g.strokeStyle = '#b8b1a4'; g.lineWidth = 3; g.stroke(); }
  const roads = []; for (let i = 0; i < F.length; i++) if (ROAD[F[i].t.highway] && near(i)) roads.push(F[i]);
  roads.sort((a, b) => ROAD[a.t.highway][0] - ROAD[b.t.highway][0]);
  for (const f of roads) { const [w, , cased] = ROAD[f.t.highway]; if (!cased) continue; path(f.p, f.t.area === 'yes'); g.strokeStyle = '#cfc8b4'; g.lineWidth = w + 3.4; g.stroke(); }
  if (fine) for (const f of roads) { const [w, , cased] = ROAD[f.t.highway]; if (!cased) continue; path(f.p); g.strokeStyle = '#a9a394'; g.lineWidth = w + .5; g.stroke(); }   // kerb
  for (const f of roads) { const [w, col] = ROAD[f.t.highway]; path(f.p, f.t.area === 'yes'); g.strokeStyle = col; g.lineWidth = w; g.stroke(); }
  if (fine) {
    g.lineCap = 'butt';
    for (const f of roads) { const h = f.t.highway, major = ['primary', 'secondary', 'trunk', 'motorway'].includes(h), minor = ['tertiary', 'residential', 'unclassified'].includes(h); if (!major && !minor) continue; path(f.p); g.setLineDash(major ? [] : [3, 5]); g.strokeStyle = major ? '#e7c445' : '#ecebe4'; g.lineWidth = major ? .35 : .22; g.stroke(); }
    g.setLineDash([]); g.lineCap = 'round';
    // a little asphalt wear so close-up roads are not flat paint
    const rnd = (k) => hash(k + x0 * .013 + z0 * .007);
    g.globalAlpha = .08; for (let k = 0; k < 2200; k++) { g.fillStyle = k % 2 ? '#2d2f33' : '#9a9a96'; g.fillRect(x0 + rnd(k * 1.7) * wx, z0 + rnd(k * 2.3) * wz, .6 + rnd(k * 3.1) * 2.4, .3 + rnd(k * 4.9) * .8); } g.globalAlpha = 1;
  }
  for (let i = 0; i < F.length; i++) { const f = F[i]; if (f.t.railway !== 'rail' || !near(i)) continue; path(f.p); g.strokeStyle = '#8b8a8d'; g.lineWidth = 5; g.stroke(); g.setLineDash([.5, 1.6]); g.strokeStyle = '#5b4a3b'; g.lineWidth = 3.8; g.stroke(); g.setLineDash([]); g.strokeStyle = '#c8c8cc'; g.lineWidth = .35; g.stroke(); }
  g.setTransform(1, 0, 0, 1, 0, 0);
  return c;
}
function paintGround(S) { const c = document.createElement('canvas'); c.width = c.height = S; return paintRegion(c, -WX / 2, -WZ / 2, WX, WZ); }

// tree / water class maps (1024²) used for scattering and for keeping ground travel out of water
function classMaps() {
  const S = 1024, sx = S / WX, sz = S / WZ, sm = (sx + sz) / 2, P = p => [(p[0] + WX / 2) * sx, (p[1] + WZ / 2) * sz];
  const make = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };
  const fc = make(), wc = make(), fg = fc.getContext('2d'), wg = wc.getContext('2d');
  const path = (g, pts, close) => { g.beginPath(); pts.forEach((p, i) => { const q = P(p); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); if (close) g.closePath(); };
  const cell = WX / (GW - 1), img = fg.createImageData(GW, GH);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const k = j * GW + i, h = HG[k], dx = (HG[j * GW + Math.min(GW - 1, i + 1)] - HG[j * GW + Math.max(0, i - 1)]) / (2 * cell), dz = (HG[Math.min(GH - 1, j + 1) * GW + i] - HG[Math.max(0, j - 1) * GW + i]) / (2 * cell);
    const v = Math.max(smooth(.1, .17, Math.hypot(dx, dz)) * smooth(24, 40, h), smooth(57, 82, h)); img.data[k * 4] = v * 255; img.data[k * 4 + 3] = 255;
  }
  const small = document.createElement('canvas'); small.width = GW; small.height = GH; small.getContext('2d').putImageData(img, 0, 0);
  fg.imageSmoothingEnabled = true; fg.drawImage(small, 0, 0, S, S);
  for (const f of D.features) { const t = f.t; if (!closed(f)) continue; const v = ['wood', 'forest'].includes(t.natural) || ['wood', 'forest'].includes(t.landuse) ? 255 : t.natural === 'scrub' ? 150 : ['park', 'garden'].includes(t.leisure) ? 70 : null; if (v === null) continue; path(fg, f.p, true); fg.fillStyle = `rgb(${v},0,0)`; fg.fill(); }
  fg.fillStyle = '#000'; fg.strokeStyle = '#000'; fg.lineCap = 'round';
  for (const f of D.features) { const t = f.t; if (closed(f) && (['residential', 'commercial', 'industrial', 'construction', 'retail', 'cemetery', 'farmland'].includes(t.landuse) || t.leisure === 'pitch' || t.building || isWater(t))) { path(fg, f.p, true); fg.fill(); } }
  for (const f of D.features) { const r = ROAD[f.t.highway]; if (!r && !f.t.waterway && !f.t.railway) continue; path(fg, f.p); fg.lineWidth = ((r ? r[0] : 8) + 8) * sm; fg.stroke(); }
  wg.fillStyle = '#fff'; wg.strokeStyle = '#fff'; wg.lineCap = 'round';
  for (const w of waterPolys) { path(wg, w.f.p, true); wg.fill(); }
  for (const f of D.features) { if (f.t.waterway === 'river') { path(wg, f.p); wg.lineWidth = 14 * sm; wg.stroke(); } }
  wg.strokeStyle = '#000';
  for (const f of D.features) { const r = ROAD[f.t.highway]; if (r) { path(wg, f.p); wg.lineWidth = (r[0] + 2) * sm; wg.stroke(); } }
  const fd = fg.getImageData(0, 0, S, S).data, wd = wg.getImageData(0, 0, S, S).data;
  const at = (data, x, z) => { const i = clamp(Math.floor((x + WX / 2) * sx), 0, S - 1), j = clamp(Math.floor((z + WZ / 2) * sz), 0, S - 1); return data[(j * S + i) * 4]; };
  return {forest: (x, z) => at(fd, x, z) / 255, water: (x, z) => at(wd, x, z) > 127};
}

// ---------- buildings
function buildingHeight(t, area, seed) {
  const lv = parseFloat(t['building:levels']); if (lv) return lv * 3.2 + 1;
  const ht = parseFloat(t.height); if (ht) return ht;
  const r = hash(seed), b = t.building;
  if (b === 'apartments') return 42 + r * 30;
  if (['commercial', 'retail', 'office'].includes(b)) return 14 + r * 22;
  if (['public', 'civic', 'theatre', 'government'].includes(b)) return 16 + r * 12;
  if (['school', 'kindergarten', 'university'].includes(b)) return 10 + r * 6;
  if (['house', 'detached'].includes(b)) return 6 + r * 2;
  if (['industrial', 'hangar', 'warehouse', 'greenhouse'].includes(b)) return 7 + r * 4;
  return area > 3000 ? 16 + r * 14 : area > 800 ? 9 + r * 10 : 6 + r * 4;
}
function addBuilding(out, ring, height, color, seed) {
  let r = ring.slice(); if (Math.hypot(r[0][0] - r.at(-1)[0], r[0][1] - r.at(-1)[1]) < .5) r.pop(); if (r.length < 3) return;
  if (ringArea(r) < 0) r.reverse();   // wind the ring so (-dz, dx) of each edge points out of the building
  let base = Infinity; for (const p of r) base = Math.min(base, heightAt(p[0], p[1])); base -= 1.2;
  const top = base + 1.2 + height, BAY = 3.6 * 4, FLOOR = 3.1 * 4, pos = out.pos, uv = out.uv, col = out.col;
  const wc = new THREE.Color(color), rc = new THREE.Color(height < 12 ? ['#a8553f', '#4f6f8f', '#6f7f6a', '#8b5a44', '#5c6b78'][Math.floor(hash(seed * 2.3) * 5)] : ['#8d949a', '#9aa09a', '#7f8a86', '#a09a90'][Math.floor(hash(seed * 2.3) * 4)]);
  let acc = hash(seed) * BAY;
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < .05) continue;
    const v0 = Math.floor(hash(seed * 1.9) * 4) / 4, u0 = acc / BAY, u1 = (acc + len) / BAY, v1 = v0 + (top - base) / FLOOR; acc += len;
    const quad = [[a[0], base, a[1], u0, v0], [b[0], base, b[1], u1, v0], [b[0], top, b[1], u1, v1], [a[0], base, a[1], u0, v0], [b[0], top, b[1], u1, v1], [a[0], top, a[1], u0, v1]];
    for (const q of quad) { pos.push(q[0], q[1], q[2]); uv.push(q[3], q[4]); col.push(wc.r, wc.g, wc.b); }
  }
  const tri = THREE.ShapeUtils.triangulateShape(r.map(p => new THREE.Vector2(p[0], p[1])), []);
  for (const t of tri) {
    const [p0, p1, p2] = t.map(k => r[k]), up = (p1[1] - p0[1]) * (p2[0] - p0[0]) - (p1[0] - p0[0]) * (p2[1] - p0[1]);
    for (const k of up > 0 ? [t[0], t[1], t[2]] : [t[0], t[2], t[1]]) { pos.push(r[k][0], top, r[k][1]); uv.push(.03, .97); col.push(rc.r, rc.g, rc.b); }
  }
}

function roadIndex() {
  const C = 60, grid = new Map(), key = (i, j) => i * 100000 + j;
  for (const f of D.features) {
    const r = ROAD[f.t.highway]; if (!r || ['track', 'path', 'footway', 'cycleway', 'steps'].includes(f.t.highway)) continue;
    for (let i = 1; i < f.p.length; i++) {
      const a = f.p[i - 1], b = f.p[i], s = [a[0], a[1], b[0], b[1], r[0] / 2, f.t.highway];
      const i0 = Math.floor(Math.min(a[0], b[0]) / C), i1 = Math.floor(Math.max(a[0], b[0]) / C), j0 = Math.floor(Math.min(a[1], b[1]) / C), j1 = Math.floor(Math.max(a[1], b[1]) / C);
      for (let ii = i0; ii <= i1; ii++) for (let jj = j0; jj <= j1; jj++) { const k = key(ii, jj); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(s); }
    }
  }
  return {
    clearance(x, z) {
      let best = 1e9; const i = Math.floor(x / C), j = Math.floor(z / C);
      for (let ii = i - 1; ii <= i + 1; ii++) for (let jj = j - 1; jj <= j + 1; jj++) for (const s of grid.get(key(ii, jj)) || []) {
        const dx = s[2] - s[0], dz = s[3] - s[1], l = dx * dx + dz * dz, t = l ? clamp(((x - s[0]) * dx + (z - s[1]) * dz) / l, 0, 1) : 0;
        best = Math.min(best, Math.hypot(x - s[0] - dx * t, z - s[1] - dz * t) - s[4]);
      }
      return best;
    }
  };
}

// fill residential/commercial land with slab apartments (facing south, as in Korean new towns) and village houses
function fillerBuildings(roads, real) {
  const out = [], realBoxes = real.map(f => bboxOf(f.p));
  const freeOf = (x0, z0, x1, z1) => !realBoxes.some(b => x0 < b[2] + 6 && x1 > b[0] - 6 && z0 < b[3] + 6 && z1 > b[1] - 6) && !out.some(o => x0 < o.bb[2] + 4 && x1 > o.bb[0] - 4 && z0 < o.bb[3] + 4 && z1 > o.bb[1] - 4);
  for (const f of D.features) {
    const t = f.t; if (!closed(f) || !['residential', 'commercial', 'retail'].includes(t.landuse)) continue;
    const bb = bboxOf(f.p), area = Math.abs(ringArea(f.p)), urban = area > 40000 && t.landuse === 'residential', commercial = t.landuse !== 'residential';
    if (realBoxes.filter(b => inRing((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, f.p)).length >= 3) continue;   // the map already has this block's buildings
    const L = commercial ? 26 : urban ? 52 : 12, Wd = commercial ? 22 : urban ? 15 : 9, gxs = commercial ? 40 : urban ? 74 : 24, gzs = commercial ? 38 : urban ? 58 : 21;
    for (let z = bb[1] + gzs / 2; z < bb[3]; z += gzs) for (let x = bb[0] + gxs / 2; x < bb[2]; x += gxs) {
      const jx = x + (hash(x * .13 + z) - .5) * (urban ? 6 : 8), jz = z + (hash(z * .17 + x) - .5) * (urban ? 4 : 8);
      const x0 = jx - L / 2, x1 = jx + L / 2, z0 = jz - Wd / 2, z1 = jz + Wd / 2;
      if (![[x0, z0], [x1, z0], [x1, z1], [x0, z1], [jx, jz]].every(p => inRing(p[0], p[1], f.p))) continue;
      if (roads.clearance(jx, jz) < (urban ? 22 : 9) || roads.clearance(x0, jz) < 6 || roads.clearance(x1, jz) < 6) continue;
      if (!freeOf(x0, z0, x1, z1)) continue;
      if (D.places.some(p => { const [px, pz] = loc(p.x); return px > x0 - 40 && px < x1 + 40 && pz > z0 - 40 && pz < z1 + 40; })) continue;
      const s = jx * 1.3 + jz, h = commercial ? 15 + hash(s) * 24 : urban ? 40 + hash(s) * 36 : 5.5 + hash(s) * 2.5;
      const color = urban ? ['#f2efe7', '#ebe6da', '#f4f0e6', '#e8e2d4'][Math.floor(hash(s * 3) * 4)] : commercial ? ['#d9dfe4', '#e3ddd1', '#cfd8de'][Math.floor(hash(s * 5) * 3)] : ['#e9dfcc', '#d9cdb8', '#efe7d6', '#d6dcdf'][Math.floor(hash(s * 7) * 4)];
      out.push({ring: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], h, color, bb: [x0, z0, x1, z1], seed: s});
    }
  }
  return out;
}

function makeBuildings(facade) {
  const real = D.features.filter(f => f.t.building && closed(f)), roads = roadIndex();
  const geo = {pos: [], uv: [], col: []};
  real.forEach((f, i) => {
    const area = Math.abs(ringArea(f.p)), t = f.t;
    const color = t.building === 'apartments' ? '#f1ede4' : ['commercial', 'retail'].includes(t.building) ? '#d7dde2' : ['public', 'civic', 'government'].includes(t.building) ? '#e6e0d3' : t.building === 'school' ? '#e8d9c4' : '#e2ddd2';
    addBuilding(geo, f.p, buildingHeight(t, area, i + 1), color, i * 9.1);
  });
  const filler = fillerBuildings(roads, real);
  for (const b of filler) addBuilding(geo, b.ring, b.h, b.color, b.seed);
  const collider = makeCollider([...real.map(f => f.p), ...filler.map(b => b.ring)]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(geo.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(geo.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(geo.col, 3));
  g.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({map: facade.map, emissiveMap: facade.emissive, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true, roughness: .78, metalness: .02});
  m.userData.hole = {cam: {value: new THREE.Vector3()}, player: {value: new THREE.Vector3()}, radius: {value: 20}};
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, {uHoleCam: m.userData.hole.cam, uHolePlayer: m.userData.hole.player, uHoleR: m.userData.hole.radius});
    sh.vertexShader = 'varying vec3 vHoleW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vHoleW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'varying vec3 vHoleW; uniform vec3 uHoleCam; uniform vec3 uHolePlayer; uniform float uHoleR;\n' + sh.fragmentShader.replace('void main() {', `void main() {
  { vec3 seg = uHolePlayer - uHoleCam; float L = length(seg); vec3 dir = seg / max(L, 1e-3); float t = dot(vHoleW - uHoleCam, dir);
    if (t > 0.0 && t < L - 1.5) { float r = length(vHoleW - (uHoleCam + dir * t)), k = smoothstep(uHoleR, uHoleR * .55, r);
      float n = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453); if (k > n) discard; } }`);
  };
  const mesh = new THREE.Mesh(g, m); mesh.castShadow = mesh.receiveShadow = true;
  return {mesh, material: m, roads, collider, count: real.length + filler.length, real: real.length};
}

// ---------- building collider: circles slide along footprint walls (walking and driving cannot pass through buildings)
function makeCollider(rings) {
  const C = 80, grid = new Map(), key = (i, j) => i * 100000 + j, polys = rings.map(r => ({r, bb: bboxOf(r)}));
  polys.forEach((p, n) => { for (let i = Math.floor(p.bb[0] / C); i <= Math.floor(p.bb[2] / C); i++) for (let j = Math.floor(p.bb[1] / C); j <= Math.floor(p.bb[3] / C); j++) { const k = key(i, j); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(n); } });
  const near = (x, z, pad) => { const out = new Set(); for (let i = Math.floor((x - pad) / C); i <= Math.floor((x + pad) / C); i++) for (let j = Math.floor((z - pad) / C); j <= Math.floor((z + pad) / C); j++) for (const n of grid.get(key(i, j)) || []) out.add(n); return out; };
  function closest(r, x, z) { let best = 1e9, bx = 0, bz = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[j], b = r[i], dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz, t = l ? clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l, 0, 1) : 0, qx = a[0] + dx * t, qz = a[1] + dz * t, d = Math.hypot(x - qx, z - qz); if (d < best) { best = d; bx = qx; bz = qz; } } return [best, bx, bz]; }
  return {
    resolve(x, z, rad) {
      let hit = false, nx = 0, nz = 0;
      for (let it = 0; it < 4; it++) {
        let moved = false;
        for (const n of near(x, z, rad + 2)) {
          const p = polys[n]; if (x < p.bb[0] - rad || x > p.bb[2] + rad || z < p.bb[1] - rad || z > p.bb[3] + rad) continue;
          const inside = inRing(x, z, p.r), [d, qx, qz] = closest(p.r, x, z); if (!inside && d >= rad) continue;
          let ux = x - qx, uz = z - qz, l = Math.hypot(ux, uz) || 1e-6; ux /= l; uz /= l; if (inside) { ux = -ux; uz = -uz; }
          x = qx + ux * (rad + .01); z = qz + uz * (rad + .01); nx += ux; nz += uz; hit = moved = true;
        }
        if (!moved) break;
      }
      const l = Math.hypot(nx, nz) || 1; return {x, z, hit, nx: nx / l, nz: nz / l};
    },
    containing(x, z) { for (const n of near(x, z, 0)) { const p = polys[n]; if (inRing(x, z, p.r)) return p.r; } return null; },
    distance(r, x, z) { return inRing(x, z, r) ? 0 : closest(r, x, z)[0]; },
    blocked(x, z, pad = 0) { for (const n of near(x, z, pad + 1)) { const p = polys[n]; if (inRing(x, z, p.r) || (pad && closest(p.r, x, z)[0] < pad)) return true; } return false; }
  };
}

// ---------- trees and street lamps (instanced)
function makeTrees(classes, count) {
  const pine = mergeGeometries([new THREE.CylinderGeometry(.35, .5, 3, 5).translate(0, 1.5, 0), new THREE.ConeGeometry(2.9, 8.5, 7).translate(0, 7, 0)].map((g, i) => paint(g, i ? '#ffffff' : '#7a5a3c')));
  const broad = mergeGeometries([new THREE.CylinderGeometry(.35, .55, 3.2, 5).translate(0, 1.6, 0), new THREE.IcosahedronGeometry(3.4, 1).scale(1, .88, 1).translate(0, 6, 0)].map((g, i) => paint(g, i ? '#ffffff' : '#7a5a3c')));
  function paint(g, hex) { if (g.index) g = g.toNonIndexed(); const c = new THREE.Color(hex), a = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g; }
  const mat = new THREE.MeshStandardMaterial({vertexColors: true, roughness: .9, flatShading: true});
  const pts = [];
  for (let n = 0; n < count * 9 && pts.length < count; n++) {
    const x = (hash(n * 1.37 + .5) - .5) * WX * .96, z = (hash(n * 2.71 + .9) - .5) * WZ * .96, v = classes.forest(x, z);
    if (v < .05 || hash(n * 5.3) > v) continue;
    pts.push([x, z, hash(n * 7.9), v]);
  }
  const pinePts = pts.filter(p => p[3] > .5 ? p[2] < .62 : p[2] < .15), broadPts = pts.filter(p => !pinePts.includes(p));
  const meshes = [];
  for (const [geo, list, tones] of [[pine, pinePts, ['#2f5a2a', '#3b6a31', '#2a4f27', '#45753a']], [broad, broadPts, ['#4f8a3a', '#5f9a44', '#6b9e46', '#88a94a', '#c3a443', '#c46e3a']]]) {
    const im = new THREE.InstancedMesh(geo, mat, list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    list.forEach((t, i) => { const k = .75 + hash(t[0] * .7 + t[1]) * .7; s.set(k, k * (.9 + t[2] * .3), k); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t[2] * 6.28); p.set(t[0], heightAt(t[0], t[1]) - .3, t[1]); m4.compose(p, q, s); im.setMatrixAt(i, m4);
      const tone = tones === undefined ? '#4f8a3a' : tones[Math.floor(hash(t[0] + t[1] * .3) * (tones.length - (list === pinePts ? 0 : t[3] > .6 ? 0 : 2)))]; im.setColorAt(i, c.set(tone)); });
    im.castShadow = true; im.receiveShadow = true; meshes.push(im);
  }
  return meshes;
}

// Street lamps along the new town's main roads: a tapered pole on the pavement, an arm curving out over the
// carriageway and a flat LED head. Lamps keep clear of junctions, medians, other roads, buildings and water, and stand
// on both kerbs, staggered, like Korean urban streets.
function makeLamps(roads, collider, classes) {
  const KINDS = {primary: 34, secondary: 36, tertiary: 38, secondary_link: 36, tertiary_link: 38, residential: 44, unclassified: 44};
  const nodeUse = new Map(), nk = p => Math.round(p[0] * 2) + ',' + Math.round(p[1] * 2);
  for (const f of D.features) if (ROAD[f.t.highway]) for (const p of f.p) nodeUse.set(nk(p), (nodeUse.get(nk(p)) || 0) + 1);
  const junctions = [...nodeUse].filter(([, n]) => n > 1).map(([k]) => k.split(',').map(v => v / 2));
  const jgrid = new Map(); for (const j of junctions) { const k = Math.floor(j[0] / 50) + ':' + Math.floor(j[1] / 50); if (!jgrid.has(k)) jgrid.set(k, []); jgrid.get(k).push(j); }
  const nearJunction = (x, z, r) => { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const p of jgrid.get((Math.floor(x / 50) + i) + ':' + (Math.floor(z / 50) + j)) || []) if (Math.hypot(p[0] - x, p[1] - z) < r) return true; return false; };
  // only in town: within ~200 m of buildings, never on forested hills
  const urban = new Set(); for (const f of D.features) if (f.t.building) { const c = bboxOf(f.p), i = Math.floor((c[0] + c[2]) / 200), j = Math.floor((c[1] + c[3]) / 200); for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) urban.add((i + a) + ':' + (j + b)); }
  const town = (x, z) => urban.has(Math.floor(x / 100) + ':' + Math.floor(z / 100)) && classes.forest(x, z) < .35;
  const spots = [];
  for (const f of D.features) {
    const h = f.t.highway, gap = KINDS[h]; if (!gap) continue;
    const half = ROAD[h][0] / 2, setback = half + 2.2;
    let carry = gap * hash(f.p[0][0] * .37 + f.p[0][1]), side = hash(f.p[0][1]) < .5 ? 1 : -1;
    for (let i = 1; i < f.p.length; i++) {
      const a = f.p[i - 1], b = f.p[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < .1) continue;
      const tx = (b[0] - a[0]) / len, tz = (b[1] - a[1]) / len, nx = -tz, nz = tx;
      for (let d = gap - carry; d < len; d += gap) {
        side = -side;
        const cx = a[0] + tx * d, cz = a[1] + tz * d, x = cx + nx * setback * side, z = cz + nz * setback * side;
        if (nearJunction(cx, cz, half + 16)) continue;                         // keep the corners clear
        if (roads.clearance(x, z) < 1.2) continue;                             // a median or another road
        if (collider.blocked(x, z, 3) || classes.water(x, z) || !town(x, z)) continue;
        spots.push([x, z, Math.atan2(-nx * side, -nz * side), half, gap]);   // the arm points back over the road
      }
      carry = (carry + len) % gap;
    }
  }
  const list = spots.sort((a, b) => a[4] - b[4]).slice(0, 2600), S = 1.25;   // main roads first if there are too many   // a touch larger than life so they read at the game's camera distance
  const colorize = (g, hex) => { g = g.index ? g.toNonIndexed() : g; const c = new THREE.Color(hex), a = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g; };
  const arm = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 8.6, 0), new THREE.Vector3(0, 9.9, 0), new THREE.Vector3(0, 9.75, 2.6)), 10, .09, 6);
  const bodyGeo = mergeGeometries([
    colorize(new THREE.CylinderGeometry(.42, .5, .7, 8).translate(0, .35, 0), '#5c6660'),        // plinth
    colorize(new THREE.CylinderGeometry(.13, .22, 9.0, 8).translate(0, 4.5, 0), '#55625d'),      // tapered pole
    colorize(arm, '#55625d'),
    colorize(new RoundedBoxGeometry(.62, .2, 1.45, 2, .08).translate(0, 9.72, 3.15), '#3e4743')   // LED head
  ]).scale(S, S, S);
  const body = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({vertexColors: true, roughness: .45, metalness: .55}), list.length);
  const headMat = new THREE.MeshStandardMaterial({color: 0x222222, emissive: 0xffe3b0, emissiveIntensity: 0, roughness: .3});
  const lens = new THREE.InstancedMesh(new THREE.PlaneGeometry(.5, 1.2).rotateX(Math.PI / 2).translate(0, 9.6, 3.15).scale(S, S, S), headMat, list.length);
  const poolMat = new THREE.MeshBasicMaterial({map: radialTexture('rgba(255,206,140,.75)', 'rgba(255,206,140,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: true});
  const pool = new THREE.InstancedMesh(new THREE.PlaneGeometry(13, 20).rotateX(-Math.PI / 2).translate(0, 0, 4.5), poolMat, list.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3();
  list.forEach(([x, z, yaw], i) => {
    q.setFromAxisAngle(up, yaw); pos.set(x, heightAt(x, z) - .25, z); m4.compose(pos, q, one); body.setMatrixAt(i, m4); lens.setMatrixAt(i, m4);
    pos.y = heightAt(x + Math.sin(yaw) * 4, z + Math.cos(yaw) * 4) + .4; m4.compose(pos, q, one); pool.setMatrixAt(i, m4);
  });
  body.castShadow = true; body.receiveShadow = true; pool.renderOrder = 2;
  return {group: [body, lens, pool], headMat, poolMat, count: list.length};
}

// ---------- water surfaces
function makeWater(normalTex) {
  const meshes = [];
  const mat = new THREE.MeshStandardMaterial({color: 0x2f6f96, roughness: .08, metalness: .1, normalMap: normalTex, normalScale: new THREE.Vector2(.35, .35), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2});
  for (const w of waterPolys) {
    let r = w.f.p.slice(); if (r.length > 3 && Math.hypot(r[0][0] - r.at(-1)[0], r[0][1] - r.at(-1)[1]) < .5) r.pop();
    const shape = new THREE.Shape(r.map(p => new THREE.Vector2(p[0], -p[1])));
    const g = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
    const uv = g.attributes.uv, pos = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 40, pos.getZ(i) / 40);
    const m = new THREE.Mesh(g, mat); m.position.y = (w.level - .2) * VEX; m.receiveShadow = true; meshes.push(m);
  }
  return {meshes, mat};
}

// ---------- sky (pokju-edu sky.frag) and lighting presets
const SKY_VS = 'varying vec3 vDir;\nvoid main(){ vDir = position; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }';
const skyUniforms = {uTop: {value: new THREE.Color()}, uHor: {value: new THREE.Color()}, uSun: {value: new THREE.Vector3(0, 1, 0)}, uSunCol: {value: new THREE.Color()}, uDark: {value: new THREE.Color(0x000000)},
  uNight: {value: 0}, uCloud: {value: .25}, uTime: {value: 0}, uDim: {value: 1}, uLin: {value: 0}};
const skyMat = new THREE.ShaderMaterial({vertexShader: SKY_VS, fragmentShader: SH.sky, uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false});
const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMat); sky.frustumCulled = false; sky.renderOrder = 1000; scene.add(sky);
const TIMES = {
  day: {label: '낮', top: 0x3c7cd0, hor: 0xc4dcef, sunCol: 0xfff1d6, elev: 52, az: 140, sun: 3.1, hemiSky: 0xcfe2ff, hemiGround: 0x6d7d4c, hemi: 1.15, fog: 0xc6dceb, night: 0, dusk: 0, windows: 0, lamps: 0, bloom: .18, exposure: 1.0, cloud: .28},
  dusk: {label: '노을', top: 0x35508f, hor: 0xf4b07a, sunCol: 0xffb070, elev: 10, az: 250, sun: 2.9, hemiSky: 0xd9b9a6, hemiGround: 0x6b5a44, hemi: 1.0, fog: 0xe3ae8a, night: .3, dusk: 1, windows: .45, lamps: 1.6, bloom: .45, exposure: 1.1, cloud: .35},
  night: {label: '밤', top: 0x050b1e, hor: 0x1f3156, sunCol: 0xa8bcff, elev: 38, az: 200, sun: .7, hemiSky: 0x3a4f86, hemiGround: 0x1a2028, hemi: .55, fog: 0x1b2843, night: 1, dusk: 0, windows: 1.6, lamps: 4.0, bloom: .65, exposure: 1.25, cloud: .2}
};
const hemi = new THREE.HemisphereLight(0xffffff, 0x666666, 1); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 3); sun.castShadow = true; scene.add(sun); scene.add(sun.target);
sun.shadow.bias = -.0004; sun.shadow.normalBias = .8;
let timeKey = 'day', sunDir = new THREE.Vector3();
const pmrem = new THREE.PMREMGenerator(renderer), skyScene = new THREE.Scene(), skyClone = new THREE.Mesh(sky.geometry, skyMat);
skyScene.add(skyClone);
let envRT = null;
function applyTime(key) {
  timeKey = key; const T = TIMES[key];
  const el = THREE.MathUtils.degToRad(T.elev), az = THREE.MathUtils.degToRad(T.az);
  sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
  skyUniforms.uTop.value.set(T.top); skyUniforms.uHor.value.set(T.hor); skyUniforms.uSunCol.value.set(T.sunCol); skyUniforms.uSun.value.copy(sunDir); skyUniforms.uNight.value = T.night; skyUniforms.uCloud.value = T.cloud;
  sun.color.set(T.sunCol); sun.intensity = T.sun; hemi.color.set(T.hemiSky); hemi.groundColor.set(T.hemiGround); hemi.intensity = T.hemi;
  scene.fog.color.set(T.fog); renderer.toneMappingExposure = T.exposure;
  if (world.buildings) world.buildings.material.emissiveIntensity = T.windows;
  if (world.lamps) { world.lamps.headMat.emissiveIntensity = T.lamps; world.lamps.poolMat.opacity = T.night > .5 ? .4 : T.dusk > .5 ? .12 : 0; }
  for (const c of vehicles.lights) c.emissiveIntensity = T.night > .3 ? 3.2 : .4;
  if (post) { post.bloom.strength = T.bloom; post.grade.uniforms.uNight.value = T.night; post.grade.uniforms.uDusk.value = T.dusk; }
  // bake the sky into an environment map for paint, glass and water reflections (pokju: linear light when baking)
  skyUniforms.uLin.value = 1; skyClone.scale.setScalar(50);
  const old = envRT; envRT = pmrem.fromScene(skyScene, 0, .1, 1000); scene.environment = envRT.texture; old?.dispose();
  skyUniforms.uLin.value = 0;
  $('time-label').textContent = T.label;
}

// ---------- post-processing (pokju-edu: bloom, then grade.frag, then tone mapping in OutputPass)
let post = null;
function makePost() {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, {type: THREE.HalfFloatType, samples: Q.msaa});
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(Math.min(size.x, 1280) / 2, Math.min(size.y, 800) / 2), TIMES[timeKey].bloom, .45, .9); bloom.enabled = Q.bloom; composer.addPass(bloom);
  const grade = new ShaderPass({uniforms: {tDiffuse: {value: null}, uTime: {value: 0}, uSpeed: {value: 0}, uFlash: {value: 0}, uNight: {value: 0}, uDusk: {value: 0}, uRain: {value: 0}, uAspect: {value: 1}, uFlashColor: {value: new THREE.Color(0x48e58a)}},
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: SH.grade});
  composer.addPass(grade); composer.addPass(new OutputPass());
  post = {composer, bloom, grade, rt};
  grade.uniforms.uNight.value = TIMES[timeKey].night; grade.uniforms.uDusk.value = TIMES[timeKey].dusk;
}

function resize() {
  const w = innerWidth, h = innerHeight, dprWanted = Math.min(devicePixelRatio || 1, Q.dpr) * autoScale;
  const dpr = Math.min(dprWanted, Math.sqrt(Q.cap / (w * h)));
  renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  if (post) { post.composer.setPixelRatio(dpr); post.composer.setSize(w, h); post.grade.uniforms.uAspect.value = w / h; }
}

// ---------- the explorer: the game's own 8-direction x 4-frame walk sheet as a camera-facing sprite
const DIRS = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'];
function makeExplorer() {
  const tex = new THREE.TextureLoader().load(A.walk); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({map: tex, alphaTest: .45, fog: true});
  const sprite = new THREE.Sprite(mat); sprite.renderOrder = 3;
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(8.5, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({map: radialTexture('rgba(20,30,20,.55)', 'rgba(20,30,20,0)'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4}));
  const [SW, SHt] = A.walkSize, HEIGHT = 24;
  function frame(index) {
    const c = A.walkCells[index], [x, y, w, h] = c.rect;
    tex.offset.set(x / SW, 1 - (y + h) / SHt); tex.repeat.set(w / SW, h / SHt);
    sprite.scale.set(w / c.cellHeight * HEIGHT, h / c.cellHeight * HEIGHT, 1);
    sprite.center.set((c.pivot[0] - x) / w, (y + h - c.pivot[1]) / h);
  }
  frame(9);
  return {sprite, shadow, frame};
}

// ---------- vehicles: a rounded car (pokju clearcoat paint) and two aircraft built from primitives
const vehicles = {lights: []};
function paintMat(hex, extra = {}) { return new THREE.MeshPhysicalMaterial({color: hex, roughness: .32, metalness: .15, clearcoat: 1, clearcoatRoughness: .08, ...extra}); }
const glassMat = new THREE.MeshPhysicalMaterial({color: 0x1b2632, roughness: .05, metalness: .2, transmission: 0, clearcoat: 1, envMapIntensity: 1.6});
const darkMat = new THREE.MeshStandardMaterial({color: 0x1c1f22, roughness: .7});
const chromeMat = new THREE.MeshStandardMaterial({color: 0xdfe3e8, roughness: .12, metalness: 1});
function lightMat(hex) { const m = new THREE.MeshStandardMaterial({color: 0x111111, emissive: hex, emissiveIntensity: .4}); vehicles.lights.push(m); return m; }
function wheel(r, w) { const g = new THREE.Group(); const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 18).rotateZ(Math.PI / 2), darkMat); const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * .62, r * .62, w * 1.04, 14).rotateZ(Math.PI / 2), chromeMat); g.add(tire, rim); tire.castShadow = true; return g; }
function makeCar() {
  const g = new THREE.Group(), body = paintMat(0xe0453a);
  const lower = new THREE.Mesh(new RoundedBoxGeometry(2.0, .78, 4.5, 4, .28), body); lower.position.y = .78;
  const cabin = new THREE.Mesh(new RoundedBoxGeometry(1.74, .66, 2.3, 4, .3), body); cabin.position.set(0, 1.42, .25);
  const glass = new THREE.Mesh(new RoundedBoxGeometry(1.78, .5, 2.12, 3, .22), glassMat); glass.position.set(0, 1.44, .25);
  const hl = lightMat(0xfff2d0), tl = lightMat(0xff2a1a);
  for (const s of [-1, 1]) { const h = new THREE.Mesh(new THREE.BoxGeometry(.42, .14, .06), hl); h.position.set(s * .62, .9, -2.26); const t = new THREE.Mesh(new THREE.BoxGeometry(.46, .12, .06), tl); t.position.set(s * .6, .98, 2.26); g.add(h, t); }
  const wheels = [];
  for (const [x, z] of [[-.95, -1.45], [.95, -1.45], [-.95, 1.45], [.95, 1.45]]) { const w = wheel(.4, .3); w.position.set(x, .4, z); g.add(w); wheels.push(w); }
  [lower, cabin, glass].forEach(m => { m.castShadow = true; g.add(m); });
  g.scale.setScalar(6.5); return {group: g, wheels};
}
function lathe(points, segs = 20) { return new THREE.LatheGeometry(points.map(p => new THREE.Vector2(p[0], p[1])), segs).rotateX(-Math.PI / 2); }   // axis along -Z (nose forward)
function makeSlowPlane() {
  const g = new THREE.Group(), body = paintMat(0xf4c430), white = paintMat(0xfbfaf4), blue = paintMat(0x2d5ea8);
  const fus = new THREE.Mesh(lathe([[0, -3.9], [.45, -3.6], [.72, -2.6], [.78, -1.2], [.7, .6], [.45, 2.6], [.22, 3.9], [0, 4.0]]), body); fus.scale.set(1, 1.05, 1);
  const stripe = new THREE.Mesh(lathe([[.795, -1.6], [.79, -.2], [.73, .7]]).translate(0, 0, 0), blue);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(.68, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, .75, 1.6), glassMat); canopy.position.set(0, .55, -1.2);
  const wing = new THREE.Mesh(new RoundedBoxGeometry(12.5, .2, 1.7, 2, .08), white); wing.position.set(0, 1.05, -.9);
  const tips = [-1, 1].map(s => { const t = new THREE.Mesh(new RoundedBoxGeometry(1.2, .22, 1.72, 2, .08), blue); t.position.set(s * 5.7, 1.05, -.9); return t; });
  const stab = new THREE.Mesh(new RoundedBoxGeometry(4.2, .12, 1.0, 2, .05), white); stab.position.set(0, .25, 3.55);
  const fin = new THREE.Mesh(new RoundedBoxGeometry(.12, 1.5, 1.3, 2, .05), blue); fin.position.set(0, 1.0, 3.6); fin.rotation.x = -.25;
  const struts = [-1, 1].map(s => { const m = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 2.4, 6), white); m.position.set(s * 1.6, .25, -.9); m.rotation.z = s * .95; return m; });
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(.32, .7, 14).rotateX(-Math.PI / 2), chromeMat); spinner.position.set(0, 0, -4.25);
  const gear = [[-.9, -.6], [.9, -.6], [0, 3.2]].map(([x, z]) => { const w = wheel(.24, .14); w.position.set(x, -.95, z); return w; });
  const nav = lightMat(0xff3030), navG = lightMat(0x30ff6a);
  const nl = new THREE.Mesh(new THREE.SphereGeometry(.09, 8, 6), nav); nl.position.set(-6.3, 1.05, -.9); const nr = new THREE.Mesh(new THREE.SphereGeometry(.09, 8, 6), navG); nr.position.set(6.3, 1.05, -.9);
  g.add(fus, stripe, canopy, wing, ...tips, stab, fin, ...struts, spinner, ...gear, nl, nr);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.scale.setScalar(5.6); return {group: g, prop: null, disc: null};
}
function makeJet() {
  const g = new THREE.Group(), white = paintMat(0xf6f7f9), blue = paintMat(0x2266c4), orange = paintMat(0xf07a2a);
  const fus = new THREE.Mesh(lathe([[0, -7.4], [.32, -7.0], [.75, -5.6], [1.0, -3.6], [1.05, 2.5], [.9, 5.4], [.6, 6.8], [.4, 7.2]], 22), white);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(.62, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, .7, 2.6), glassMat); canopy.position.set(0, .62, -4.0);
  const wingShape = new THREE.Shape([new THREE.Vector2(0, -1.8), new THREE.Vector2(7.6, 2.4), new THREE.Vector2(7.6, 3.4), new THREE.Vector2(0, 3.2)]);
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, {depth: .22, bevelEnabled: true, bevelThickness: .05, bevelSize: .05, bevelSegments: 1}).rotateX(Math.PI / 2);
  const wings = [-1, 1].map(s => { const w = new THREE.Mesh(wingGeo, white); w.scale.x = s; w.position.set(s * .6, -.1, 0); return w; });
  const tailShape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(2.6, 1.6), new THREE.Vector2(2.6, 2.3), new THREE.Vector2(0, 2.0)]);
  const tailGeo = new THREE.ExtrudeGeometry(tailShape, {depth: .14, bevelEnabled: false}).rotateX(Math.PI / 2);
  const stabs = [-1, 1].map(s => { const w = new THREE.Mesh(tailGeo, white); w.scale.x = s; w.position.set(s * .4, .1, 4.6); return w; });
  const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(2.4, 3.0), new THREE.Vector2(3.3, 3.0), new THREE.Vector2(2.6, 0)]), {depth: .16, bevelEnabled: false}).rotateY(-Math.PI / 2), blue); fin.position.set(.08, .6, 4.3);
  const stripe = new THREE.Mesh(lathe([[1.06, -2.6], [1.07, 1.8]], 22), blue); stripe.scale.set(1, .25, 1); stripe.position.y = -.25;
  const glow = lightMat(0xff8a2a);
  const engines = [-1, 1].map(s => { const e = new THREE.Group(); const can = new THREE.Mesh(lathe([[.55, -1.6], [.62, -1.1], [.6, 1.2], [.45, 1.7]], 16), orange); const noz = new THREE.Mesh(new THREE.CircleGeometry(.42, 16), glow); noz.position.z = 1.71; e.add(can, noz); e.position.set(s * 3.2, -.75, 1.0); return e; });
  g.add(fus, canopy, ...wings, ...stabs, fin, stripe, ...engines);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.scale.setScalar(5.6); return {group: g, glow};
}

// pokju-edu car (exported from its own builder) when the payload carries one
async function loadPokjuCar() {
  if (!A.car) return null;
  const gltf = await new GLTFLoader().parseAsync(Uint8Array.from(atob(A.car), c => c.charCodeAt(0)).buffer, '');
  const g = new THREE.Group(), m = gltf.scene; m.traverse(o => { if (o.isMesh) { o.castShadow = true; if (o.material?.name?.includes('light')) vehicles.lights.push(o.material); } });
  g.add(m); g.scale.setScalar(6.5); return {group: g, wheels: []};
}

// ---------- places: floating pins with a light column and a name label
const TYPE_COLOR = {public: '#2f73c0', nature: '#3d9a4e', heritage: '#b5523b', daily: '#e0952b', school: '#7a58c4', culture: '#c4508a', intangible: '#b5523b', food: '#e0952b'};
function labelSprite(text, color) {
  const c = document.createElement('canvas'), g = c.getContext('2d'), font = '700 44px NanumRound, sans-serif'; g.font = font; const w = Math.ceil(g.measureText(text).width) + 56;
  c.width = w; c.height = 84; g.font = font; g.fillStyle = 'rgba(251,246,230,.95)'; g.strokeStyle = color; g.lineWidth = 5; g.beginPath(); g.roundRect(3, 3, w - 6, 78, 22); g.fill(); g.stroke();
  g.fillStyle = '#233629'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, 45);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({map: t, depthTest: false, transparent: true, fog: false})); s.userData.aspect = w / 84; s.renderOrder = 10; return s;
}
function pinSprite(color) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 160; const g = c.getContext('2d');
  g.fillStyle = color; g.beginPath(); g.arc(64, 60, 50, Math.PI * .8, Math.PI * .2); g.lineTo(64, 154); g.closePath(); g.fill(); g.lineWidth = 7; g.strokeStyle = '#fffaf0'; g.stroke();
  g.fillStyle = '#fffaf0'; g.beginPath(); g.arc(64, 60, 20, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({map: t, transparent: true, depthWrite: false, fog: true})); s.center.set(.5, 0); s.renderOrder = 9; return s;
}
function makePlaces() {
  const group = new THREE.Group(), list = [];
  const beamGeo = new THREE.CylinderGeometry(1.4, 1.4, 70, 12, 1, true).translate(0, 35, 0);
  for (const p of D.places) {
    const [x, z] = loc(p.x), y = heightAt(x, z), color = TYPE_COLOR[p.type] || '#d0675f';
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({color, transparent: true, opacity: .22, depthWrite: false, blending: THREE.AdditiveBlending, fog: true}));
    beam.position.set(x, y, z); beam.renderOrder = 8;
    const pin = pinSprite(color); pin.position.set(x, y + 20, z); pin.scale.set(9, 11.25, 1);
    const label = labelSprite(p.short || p.name, color); label.position.set(x, y + 34, z); label.visible = false;
    group.add(beam, pin, label); list.push({p, x, z, y, beam, pin, label, seen: false, ring: world.buildings.collider.containing(x, z)});
  }
  return {group, list};
}

// ---------- assemble the world
const world = {};
const PLAYER = {x: 0, z: 0, y: 0, vx: 0, vz: 0, speed: 0, heading: 0, mode: 'walk', phase: 0, alt: 0, bank: 0, pitch: 0, target: null, pending: null, landed: true};
const VEH = {
  // sizes and speeds are game-scale, not real-scale: the explorer stands 8 m tall and walks 40 m/s so places are minutes apart, not hours
  // the 2D game's own speeds (walk 78 m/s, x4, x16); the camera stands about twice as far back as v2 (a smaller-scale view)
  walk: {label: '걷기', speed: 78, accel: 6, turn: 14, alt: 0, cam: {tilt: [185, 50], follow: [82, 17]}, lead: .28},
  car: {label: '자동차', speed: 312, accel: 1.0, brake: 2.4, turn: 2.4, alt: 0, cam: {tilt: [390, 48], follow: [150, 15]}, lead: .28},
  slowplane: {label: '느린 비행기', speed: 312, accel: .75, brake: .95, turn: .95, alt: 230, cam: {tilt: [540, 46], follow: [235, 16]}, lead: .3},
  plane: {label: '비행기', speed: 1248, accel: .55, brake: .75, turn: .65, alt: 520, cam: {tilt: [1150, 52], follow: [430, 18]}, lead: .15}
};
const CAM = {mode: 'tilt', yaw: 0, userYaw: 0, userTime: -9, zoom: 1, x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0, fov: 52};

async function build() {
  await step('지형을 올리는 중');
  const S = Q.tex, groundCanvas = paintGround(S), ground = new THREE.CanvasTexture(groundCanvas);
  ground.colorSpace = THREE.SRGBColorSpace; ground.anisotropy = maxAniso; ground.generateMipmaps = true; ground.minFilter = THREE.LinearMipmapLinearFilter;
  const detail = new THREE.CanvasTexture(noiseCanvas(256, 16, 3.1)); detail.wrapS = detail.wrapT = THREE.RepeatWrapping; detail.anisotropy = maxAniso;
  const pos = new Float32Array(GW * GH * 3), uv = new Float32Array(GW * GH * 2), idx = [];
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) { const k = j * GW + i; pos[k * 3] = i / (GW - 1) * WX - WX / 2; pos[k * 3 + 1] = HG[k] * VEX; pos[k * 3 + 2] = j / (GH - 1) * WZ - WZ / 2; uv[k * 2] = i / (GW - 1); uv[k * 2 + 1] = 1 - j / (GH - 1); }
  for (let j = 0; j < GH - 1; j++) for (let i = 0; i < GW - 1; i++) { const a = j * GW + i, b = a + 1, c = a + GW, d = c + 1; idx.push(a, c, b, b, c, d); }
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); tg.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); tg.setIndex(idx); tg.computeVertexNormals();
  const tm = new THREE.MeshStandardMaterial({map: ground, roughness: .96, metalness: 0});
  const nearCanvas = document.createElement('canvas'); nearCanvas.width = nearCanvas.height = Q.tex >= 4096 ? 2048 : 1024;
  const nearTex = new THREE.CanvasTexture(nearCanvas); nearTex.colorSpace = THREE.SRGBColorSpace; nearTex.anisotropy = maxAniso; nearTex.minFilter = THREE.LinearMipmapLinearFilter;
  world.near = {canvas: nearCanvas, tex: nearTex, rect: new THREE.Vector4(0, 0, 1, 0), center: null, strength: 0};
  tm.onBeforeCompile = s => {
    s.uniforms.uDetail = {value: detail}; s.uniforms.uNear = {value: nearTex}; s.uniforms.uNearRect = {value: world.near.rect}; s.uniforms.uArea = {value: new THREE.Vector2(WX, WZ)};
    s.fragmentShader = 'uniform sampler2D uDetail; uniform sampler2D uNear; uniform vec4 uNearRect; uniform vec2 uArea;\n' + s.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  vec2 wp = vec2(vMapUv.x * uArea.x - uArea.x * .5, (1.0 - vMapUv.y) * uArea.y - uArea.y * .5);
  vec2 nuv = vec2((wp.x - uNearRect.x) / uNearRect.z, 1.0 - (wp.y - uNearRect.y) / uNearRect.z);
  float edge = min(min(nuv.x, 1.0 - nuv.x), min(nuv.y, 1.0 - nuv.y));
  float nf = smoothstep(0.0, 0.14, edge) * uNearRect.w;
  if (nf > 0.001) diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(uNear, nuv).rgb, nf);
  diffuseColor.rgb *= mix(.86, 1.1, texture2D(uDetail, vMapUv * 380.0).r) * mix(.92, 1.05, texture2D(uDetail, vMapUv * 41.0).r);`);
  };
  const terrain = new THREE.Mesh(tg, tm); terrain.receiveShadow = true; scene.add(terrain); world.terrain = terrain;
  // the rest of the county as the game's own overview map, flat beyond the 3D area
  const countyTex = new THREE.TextureLoader().load(A.county); countyTex.colorSpace = THREE.SRGBColorSpace; countyTex.anisotropy = maxAniso;
  const [ca, cb] = [loc(D.county[0]), loc(D.county[1])];
  const county = new THREE.Mesh(new THREE.PlaneGeometry(cb[0] - ca[0], cb[1] - ca[1]).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({map: countyTex, roughness: 1}));
  county.position.set((ca[0] + cb[0]) / 2, EDGE_H * VEX - 2.5, (ca[1] + cb[1]) / 2); county.receiveShadow = true; scene.add(county);
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(120000, 120000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({color: 0x7fa6b0, roughness: 1})); outer.position.y = EDGE_H * VEX - 3.5; scene.add(outer);
  await step('물과 길을 그리는 중');
  const waterNormal = new THREE.CanvasTexture(noiseCanvas(256, 8, 9.7)); waterNormal.wrapS = waterNormal.wrapT = THREE.RepeatWrapping;
  // turn the height noise into a normal map
  { const src = waterNormal.image, g = src.getContext('2d'), d = g.getImageData(0, 0, 256, 256), o = g.createImageData(256, 256); for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const h = (a, b) => d.data[(((b + 256) % 256) * 256 + ((a + 256) % 256)) * 4]; const nx = (h(x - 1, y) - h(x + 1, y)) / 255 * 2, ny = (h(x, y - 1) - h(x, y + 1)) / 255 * 2, k = (y * 256 + x) * 4; o.data[k] = 128 + nx * 127; o.data[k + 1] = 128 + ny * 127; o.data[k + 2] = 255; o.data[k + 3] = 255; } g.putImageData(o, 0, 0); waterNormal.needsUpdate = true; }
  world.water = makeWater(waterNormal); world.water.meshes.forEach(m => scene.add(m)); world.waterNormal = waterNormal;
  world.classes = classMaps();
  await step('건물을 세우는 중');
  world.buildings = makeBuildings(facadeTextures()); scene.add(world.buildings.mesh);
  await step('나무를 심는 중');
  world.trees = makeTrees(world.classes, Q.trees); world.trees.forEach(t => scene.add(t));
  world.lamps = makeLamps(world.buildings.roads, world.buildings.collider, world.classes); world.lamps.group.forEach(m => scene.add(m));
  await step('장소 표시를 다는 중');
  try { await document.fonts.load('700 44px NanumRound'); } catch {}
  world.places = makePlaces(); scene.add(world.places.group);
  await step('탐험가와 탈것을 준비하는 중');
  world.explorer = makeExplorer(); scene.add(world.explorer.sprite, world.explorer.shadow);
  world.car = (await loadPokjuCar().catch(() => null)) || makeCar();
  world.slowplane = makeSlowPlane(); world.plane = makeJet();
  for (const v of [world.car, world.slowplane, world.plane]) { v.group.visible = false; v.group.rotation.order = 'YXZ'; scene.add(v.group); }
  const vehShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({map: radialTexture('rgba(20,30,20,.5)', 'rgba(20,30,20,0)'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4}));
  world.vehShadow = vehShadow; scene.add(vehShadow);
  const [sx, sz] = loc(D.start); PLAYER.x = sx; PLAYER.z = sz + 30; PLAYER.y = heightAt(PLAYER.x, PLAYER.z);
  { const r = world.buildings.collider.resolve(PLAYER.x, PLAYER.z, 6); PLAYER.x = r.x; PLAYER.z = r.z; PLAYER.y = heightAt(PLAYER.x, PLAYER.z); }
  CAM.tx = PLAYER.x; CAM.tz = PLAYER.z; CAM.ty = PLAYER.y;
  makePost(); applyTime('day'); resize();
  await step('셰이더를 미리 준비하는 중');
  renderer.compile(scene, camera);
}

// ---------- input: floating stick on the left, drag to look, tap to walk, pinch / wheel to zoom, keyboard, gamepad
const input = {x: 0, y: 0, keys: new Set(), stickId: null, stickOrigin: [0, 0]};
const pointers = new Map();
let pinchDist = 0;
const stick = $('stick'), knob = $('knob');
canvas.addEventListener('pointerdown', e => {
  canvas.focus({preventScroll: true});
  try { canvas.setPointerCapture(e.pointerId); } catch {}
  const leftSide = e.clientX < innerWidth * .42 && e.pointerType !== 'mouse';
  if (leftSide && input.stickId === null) { input.stickId = e.pointerId; input.stickOrigin = [e.clientX, e.clientY]; stick.hidden = false; stick.style.left = e.clientX + 'px'; stick.style.top = e.clientY + 'px'; knob.style.transform = ''; PLAYER.target = null; return; }
  pointers.set(e.pointerId, {x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false});
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchDist = Math.hypot(a.x - b.x, a.y - b.y); }
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerId === input.stickId) {
    let dx = e.clientX - input.stickOrigin[0], dy = e.clientY - input.stickOrigin[1]; const m = Math.hypot(dx, dy), max = 52;
    if (m > max) { // the stick follows a thumb that slides past its edge
      input.stickOrigin[0] += dx / m * (m - max); input.stickOrigin[1] += dy / m * (m - max); dx = dx / m * max; dy = dy / m * max;
      stick.style.left = input.stickOrigin[0] + 'px'; stick.style.top = input.stickOrigin[1] + 'px';
    }
    knob.style.transform = `translate(${dx}px,${dy}px)`; const r = Math.hypot(dx, dy) / max, dead = .12, k = r < dead ? 0 : (r - dead) / (1 - dead) / Math.max(r, 1e-6);
    input.x = dx / max * k; input.y = -dy / max * k; return;
  }
  const p = pointers.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (Math.hypot(p.x - p.sx, p.y - p.sy) > 8) p.moved = true;
  if (pointers.size === 2) { const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinchDist > 10) zoomBy(pinchDist / d); pinchDist = d; tiltBy(dy * .09); return; }
  if (p.moved) { CAM.userYaw += dx * .006; CAM.userTime = performance.now(); tiltBy(dy * .18); }
});
function endPointer(e) {
  if (e.pointerId === input.stickId) { input.stickId = null; input.x = input.y = 0; stick.hidden = true; return; }
  const p = pointers.get(e.pointerId); pointers.delete(e.pointerId); if (!p) return;
  if (e.type === 'pointerup' && !p.moved && pointers.size === 0 && performance.now() - p.t < 400) tapToMove(e.clientX, e.clientY);
}
canvas.addEventListener('pointerup', endPointer); canvas.addEventListener('pointercancel', endPointer); canvas.addEventListener('lostpointercapture', endPointer);
canvas.addEventListener('wheel', e => { e.preventDefault(); if (e.shiftKey) tiltBy(-e.deltaY * .05); else zoomBy(Math.exp(e.deltaY * .0012)); }, {passive: false});
function zoomBy(k) { CAM.zoom = clamp(CAM.zoom * k, .2, 4); }
function tiltBy(deg) { CAM.pitchAdj = clamp((CAM.pitchAdj || 0) + deg, -70, 70); }
const KEYMAP = {ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r'};
addEventListener('keydown', e => {
  if (KEYMAP[e.code]) { input.keys.add(KEYMAP[e.code]); PLAYER.target = null; e.preventDefault(); }
  else if (e.code === 'Equal' || e.code === 'NumpadAdd') zoomBy(.8); else if (e.code === 'Minus' || e.code === 'NumpadSubtract') zoomBy(1.25);
  else if (e.code === 'KeyR' || e.code === 'PageUp') tiltBy(6); else if (e.code === 'KeyF' || e.code === 'PageDown') tiltBy(-6);
  else if (e.code === 'KeyC') toggleCamera(); else if (e.code === 'KeyT') cycleTime(); else if (e.code === 'KeyQ') cycleQuality();
  else if (['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(e.code)) setMode(['walk', 'car', 'slowplane', 'plane'][+e.code.slice(-1) - 1]);
});
addEventListener('keyup', e => { if (KEYMAP[e.code]) input.keys.delete(KEYMAP[e.code]); });
addEventListener('blur', () => { input.keys.clear(); input.x = input.y = 0; input.stickId = null; stick.hidden = true; pointers.clear(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { input.keys.clear(); input.x = input.y = 0; input.stickId = null; stick.hidden = true; pointers.clear(); } });
const ray = new THREE.Raycaster();
function tapToMove(cx, cy) {
  if (!world.terrain) return;
  ray.setFromCamera(new THREE.Vector2(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1), camera);
  const hit = ray.intersectObject(world.terrain, false)[0]; if (!hit) return;
  PLAYER.target = [hit.point.x, hit.point.z];
  const ring = world.tapRing || (world.tapRing = new THREE.Mesh(new THREE.RingGeometry(2.2, 3, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({color: 0xfffaf0, transparent: true, depthWrite: false})));
  ring.position.set(hit.point.x, hit.point.y + .4, hit.point.z); ring.userData.t = 0; scene.add(ring);
}
function readInput() {
  let x = input.x, y = input.y;
  if (input.keys.has('l')) x -= 1; if (input.keys.has('r')) x += 1; if (input.keys.has('u')) y += 1; if (input.keys.has('d')) y -= 1;
  try { for (const pad of navigator.getGamepads?.() || []) { if (!pad) continue; const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0; if (Math.hypot(ax, ay) > .18) { x += ax; y -= ay; PLAYER.target = null; } } } catch {}
  const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
  return [x, y];
}

// ---------- modes, camera, time, quality buttons
function setMode(mode) {
  if (mode === PLAYER.mode && !PLAYER.pending) return;
  const flying = m => m === 'slowplane' || m === 'plane';
  if (flying(PLAYER.mode) && !flying(mode)) {
    if (world.classes.water(PLAYER.x, PLAYER.z)) { toast('아직 물 위예요. 땅 위로 날아간 뒤 내려요.'); return; }
    PLAYER.pending = mode; toast('천천히 내려앉는 중이에요'); markMode(mode); return;
  }
  PLAYER.pending = null;
  if (flying(mode) && !flying(PLAYER.mode)) { PLAYER.alt = PLAYER.y; PLAYER.speed = Math.max(PLAYER.speed, VEH[mode].speed * .25); toast(mode === 'slowplane' ? '느린 비행기로 천천히 떠올라요. 마을을 내려다보기 좋아요.' : '비행기로 높이 날아올라요!'); }
  else if (flying(mode)) toast(mode === 'slowplane' ? '느린 비행기로 바꿨어요' : '빠른 비행기로 바꿨어요');
  PLAYER.mode = mode; markMode(mode);
}
function markMode(mode) { document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode))); }
document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
function toggleCamera() { CAM.mode = CAM.mode === 'tilt' ? 'follow' : 'tilt'; CAM.userYaw = 0; CAM.pitchAdj = 0; $('cam-label').textContent = CAM.mode === 'tilt' ? '비스듬히' : '뒤따라'; toast(CAM.mode === 'tilt' ? '북쪽이 위인 지도 화면. 화면을 끌면 돌리고 기울여요.' : '탐험가 뒤를 따라가는 화면. 화면을 끌면 둘러봐요.'); }
function cycleTime() { applyTime(timeKey === 'day' ? 'dusk' : timeKey === 'dusk' ? 'night' : 'day'); }
function cycleQuality() {
  qualityMode = qualityMode === 'auto' ? 'high' : qualityMode === 'high' ? 'low' : 'auto';
  try { localStorage.setItem('hs3d-quality', qualityMode); } catch {}
  $('q-label').textContent = qualityMode === 'auto' ? '자동' : QUALITY[qualityMode].label;
  const next = QUALITY[qualityMode === 'low' ? 'low' : 'high'];
  if (next !== Q) toast('화질을 바꾸면 다시 불러올 때 나무 수와 지면 해상도도 바뀌어요');
  Q = next; autoScale = 1; post.bloom.enabled = Q.bloom; sun.shadow.mapSize.set(Q.shadow, Q.shadow); sun.shadow.map?.dispose(); sun.shadow.map = null; resize();
}
$('cam-btn').onclick = toggleCamera; $('time-btn').onclick = cycleTime; $('q-btn').onclick = cycleQuality;
$('compass').onclick = () => { CAM.userYaw = 0; CAM.pitchAdj = 0; if (CAM.mode === 'follow') toggleCamera(); };
$('zoom-in').onclick = () => zoomBy(.75); $('zoom-out').onclick = () => zoomBy(1.33); $('tilt-up').onclick = () => tiltBy(10); $('tilt-down').onclick = () => tiltBy(-10);
$('q-label').textContent = qualityMode === 'auto' ? '자동' : QUALITY[qualityMode].label;
$('reload').onclick = () => { try { localStorage.setItem('hs3d-quality', 'low'); } catch {} location.reload(); };
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); running = false; $('lost').hidden = false; });
canvas.addEventListener('webglcontextrestored', () => { $('lost').hidden = true; running = true; applyTime(timeKey); requestAnimationFrame(frame); });

// ---------- simulation
const BOUND = [WX / 2 - 120, WZ / 2 - 120];
function simulate(dt) {
  const V = VEH[PLAYER.mode], flying = PLAYER.mode === 'slowplane' || PLAYER.mode === 'plane';
  let [ix, iy] = readInput();
  const yaw = CAM.yaw, fx = Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = Math.sin(yaw);
  let dx = rx * ix + fx * iy, dz = rz * ix + fz * iy, mag = Math.min(1, Math.hypot(dx, dz));
  if (mag < .01 && PLAYER.target) {
    const tx = PLAYER.target[0] - PLAYER.x, tz = PLAYER.target[1] - PLAYER.z, d = Math.hypot(tx, tz), stop = PLAYER.mode === 'walk' ? 12 : PLAYER.speed * .4 + 20;
    if (d < stop) PLAYER.target = null; else { dx = tx / d; dz = tz / d; mag = clamp(d / 30, .35, 1); }
  }
  const before = [PLAYER.x, PLAYER.z];
  if (PLAYER.mode === 'walk') {
    const tvx = dx * V.speed * mag, tvz = dz * V.speed * mag;
    PLAYER.vx = damp(PLAYER.vx, tvx, V.accel, dt); PLAYER.vz = damp(PLAYER.vz, tvz, V.accel, dt);
    PLAYER.speed = Math.hypot(PLAYER.vx, PLAYER.vz); if (PLAYER.speed > .5) PLAYER.heading = Math.atan2(PLAYER.vx, -PLAYER.vz);
  } else {
    if (mag > .01) {
      const want = Math.atan2(dx, -dz), diff = wrapAngle(want - PLAYER.heading), rate = V.turn * (flying ? 1 : clamp(PLAYER.speed / 10, .35, 1));
      const turn = clamp(diff, -rate * dt, rate * dt); PLAYER.heading += turn; PLAYER.turnRate = turn / dt;
      const target = V.speed * mag * (flying ? 1 : Math.max(.3, Math.cos(Math.min(Math.abs(diff), 1.4))));
      PLAYER.speed = damp(PLAYER.speed, target, PLAYER.speed < target ? V.accel : V.brake, dt);
    } else { PLAYER.speed = damp(PLAYER.speed, 0, V.brake, dt); PLAYER.turnRate = damp(PLAYER.turnRate || 0, 0, 4, dt); }
    PLAYER.vx = Math.sin(PLAYER.heading) * PLAYER.speed; PLAYER.vz = -Math.cos(PLAYER.heading) * PLAYER.speed;
  }
  let nx = PLAYER.x, nz = PLAYER.z;
  const steps = Math.max(1, Math.ceil(Math.hypot(PLAYER.vx, PLAYER.vz) * dt / 3)), solid = !flying && !PLAYER.pending, rad = PLAYER.mode === 'car' ? 7 : 5;
  for (let k = 0; k < steps; k++) {
    nx = clamp(nx + PLAYER.vx * dt / steps, -BOUND[0], BOUND[0]); nz = clamp(nz + PLAYER.vz * dt / steps, -BOUND[1], BOUND[1]);
    if (!solid) continue;
    const r = world.buildings.collider.resolve(nx, nz, rad); if (!r.hit) continue;
    nx = r.x; nz = r.z;
    const into = PLAYER.vx * r.nx + PLAYER.vz * r.nz;   // slide: drop the part of the motion that goes into the wall
    if (into < 0) {
      if (PLAYER.mode === 'walk') { PLAYER.vx -= r.nx * into; PLAYER.vz -= r.nz * into; }
      else PLAYER.speed *= 1 - .75 * Math.min(1, -into / Math.max(PLAYER.speed, 1e-3));
    }
  }
  if (!flying && !PLAYER.pending && world.classes.water(nx, nz)) {
    if (!world.classes.water(nx, PLAYER.z)) nz = PLAYER.z; else if (!world.classes.water(PLAYER.x, nz)) nx = PLAYER.x; else { nx = PLAYER.x; nz = PLAYER.z; PLAYER.speed *= .3; }
    if (performance.now() - (PLAYER.waterNote || 0) > 3000) { PLAYER.waterNote = performance.now(); toast('물은 건널 수 없어요. 다리나 비행기를 이용해요.'); }
  }
  PLAYER.x = nx; PLAYER.z = nz;
  const ground = heightAt(PLAYER.x, PLAYER.z);
  if (flying || PLAYER.pending) {
    const ahead = heightAt(PLAYER.x + PLAYER.vx * 1.5, PLAYER.z + PLAYER.vz * 1.5), desired = PLAYER.pending ? ground : Math.max(ground, ahead) + V.alt;
    const prev = PLAYER.alt; PLAYER.alt = damp(PLAYER.alt, desired, PLAYER.pending ? 1.4 : .9, dt); PLAYER.alt = Math.max(PLAYER.alt, ground + (PLAYER.pending ? 0 : 3));
    PLAYER.climb = (PLAYER.alt - prev) / dt; PLAYER.y = PLAYER.alt;
    PLAYER.bank = damp(PLAYER.bank, clamp(-(PLAYER.turnRate || 0) * .55, -.75, .75), 3, dt);
    if (PLAYER.pending && PLAYER.alt - ground < 1.5) { const m = PLAYER.pending; PLAYER.pending = null; PLAYER.mode = m; PLAYER.speed *= .2; toast(m === 'walk' ? '땅에 내렸어요' : '자동차로 바꿨어요'); }
  } else PLAYER.y = ground;
  const moved = Math.hypot(PLAYER.x - before[0], PLAYER.z - before[1]);
  PLAYER.phase = (PLAYER.phase + moved / 24 * Math.PI * 2) % (Math.PI * 2);
  PLAYER.moving = moved > .02;
}

function updateCamera(dt) {
  const V = VEH[PLAYER.mode], [dist0, pitch0] = CAM.mode === 'tilt' ? V.cam.tilt : V.cam.follow;
  let yawGoal;
  if (CAM.mode === 'tilt') yawGoal = CAM.userYaw;
  else {
    const userRecently = performance.now() - CAM.userTime < 2200;
    if (!userRecently && PLAYER.speed > 2) { CAM.base = dampAngle(CAM.base ?? PLAYER.heading, PLAYER.heading, PLAYER.mode === 'walk' ? 1.6 : 2.2, dt); CAM.userYaw = damp(CAM.userYaw, 0, 1.5, dt); }
    CAM.base = CAM.base ?? PLAYER.heading; yawGoal = CAM.base + CAM.userYaw;
  }
  CAM.yaw = dampAngle(CAM.yaw, yawGoal, 7, dt);
  const lead = V.lead, tx = PLAYER.x + PLAYER.vx * lead, tz = PLAYER.z + PLAYER.vz * lead, ty = PLAYER.y + (PLAYER.mode === 'walk' ? 12 : 6);
  const follow = 5 + PLAYER.speed / 18; CAM.tx = damp(CAM.tx, tx, follow, dt); CAM.tz = damp(CAM.tz, tz, follow, dt); CAM.ty = damp(CAM.ty, ty, 6, dt);
  CAM.dist = damp(CAM.dist || dist0, dist0 * CAM.zoom, 2.5, dt);
  const pitch = THREE.MathUtils.degToRad(clamp(pitch0 + (CAM.pitchAdj || 0), 4, 88));
  const back = [-Math.sin(CAM.yaw), Math.cos(CAM.yaw)];
  let cx = CAM.tx + back[0] * Math.cos(pitch) * CAM.dist, cz = CAM.tz + back[1] * Math.cos(pitch) * CAM.dist, cy = CAM.ty + Math.sin(pitch) * CAM.dist;
  cy = Math.max(cy, heightAt(cx, cz) + 12);
  camera.position.set(cx, cy, cz); camera.lookAt(CAM.tx, CAM.ty, CAM.tz);
  const fast = PLAYER.mode === 'plane' ? clamp(PLAYER.speed / VEH.plane.speed, 0, 1) : PLAYER.mode === 'car' ? clamp(PLAYER.speed / VEH.car.speed, 0, 1) * .4 : 0;
  CAM.fov = damp(CAM.fov, 52 + fast * 14, 2, dt); camera.fov = CAM.fov; camera.updateProjectionMatrix();
  const flyH = Math.max(0, PLAYER.y - heightAt(PLAYER.x, PLAYER.z));
  scene.fog.near = 1300 + CAM.dist * 2 + flyH * 4; scene.fog.far = 6000 + CAM.dist * 7 + flyH * 14;
  if (post) post.grade.uniforms.uSpeed.value = REDUCED ? 0 : damp(post.grade.uniforms.uSpeed.value, fast * .85, 3, dt);
  $('compass').firstChild.style.transform = `rotate(${-CAM.yaw}rad)`;
}

function updateActors(dt, t) {
  const E = world.explorer, walking = PLAYER.mode === 'walk' && !PLAYER.pending;
  E.sprite.visible = E.shadow.visible = walking;
  for (const k of ['car', 'slowplane', 'plane']) world[k].group.visible = (PLAYER.pending ? PLAYER.mode : PLAYER.mode) === k;
  const groundY = heightAt(PLAYER.x, PLAYER.z);
  if (walking) {
    // pick the sheet direction from how the motion looks on screen, exactly as the 2D game picks it from the map
    const yaw = CAM.yaw, sxv = PLAYER.vx * Math.cos(yaw) + PLAYER.vz * Math.sin(yaw), fwd = PLAYER.vx * Math.sin(yaw) - PLAYER.vz * Math.cos(yaw);
    if (Math.hypot(sxv, fwd) > .6) E.dir = DIRS[(Math.round(Math.atan2(-fwd, sxv) / (Math.PI / 4)) + 8) % 8];
    const d = DIRS.indexOf(E.dir || 's'), f = PLAYER.moving ? Math.floor(PLAYER.phase / (Math.PI / 2)) % 4 : 1;
    E.frame(d * 4 + f); E.sprite.position.set(PLAYER.x, groundY - .15, PLAYER.z);
    E.shadow.position.set(PLAYER.x, groundY + .25, PLAYER.z);
  }
  const v = world[PLAYER.mode];
  if (v && v.group.visible) {
    const g = v.group; g.position.set(PLAYER.x, PLAYER.y, PLAYER.z); g.rotation.y = -PLAYER.heading;
    if (PLAYER.mode === 'car') {
      const f = 12, a = heightAt(PLAYER.x + Math.sin(PLAYER.heading) * f, PLAYER.z - Math.cos(PLAYER.heading) * f), b = heightAt(PLAYER.x - Math.sin(PLAYER.heading) * f, PLAYER.z + Math.cos(PLAYER.heading) * f);
      g.rotation.x = Math.atan2(a - b, 2 * f); g.rotation.z = damp(g.rotation.z, clamp(-(PLAYER.turnRate || 0) * PLAYER.speed * .004, -.06, .06), 6, dt);
      for (const w of v.wheels) w.children.forEach(c => c.rotation.x -= PLAYER.speed * dt / .4);
    } else {
      g.rotation.z = PLAYER.bank; g.rotation.x = clamp((PLAYER.climb || 0) * .012, -.25, .3) + (REDUCED ? 0 : Math.sin(t * 1.3) * .015);
      g.position.y += REDUCED ? 0 : Math.sin(t * 1.7) * .4 * clamp(PLAYER.alt - groundY - 4, 0, 1);
      if (v.prop) { v.prop.rotation.z += dt * (18 + PLAYER.speed * .8); v.disc.material.opacity = clamp(PLAYER.speed / 30, .05, .2); }
      if (v.glow) v.glow.emissiveIntensity = 1.2 + PLAYER.speed / VEH.plane.speed * 4;
    }
    const size = PLAYER.mode === 'car' ? 34 : PLAYER.mode === 'slowplane' ? 90 : 125, h = PLAYER.y - groundY, s = size * (1 + h / 200);
    world.vehShadow.visible = true; world.vehShadow.scale.set(s, 1, s * .7); world.vehShadow.material.opacity = clamp(1 - h / 400, .15, 1);
    world.vehShadow.position.set(PLAYER.x, groundY + .3, PLAYER.z); world.vehShadow.rotation.y = -PLAYER.heading;
  } else world.vehShadow.visible = false;
  // sun shadow box follows the player and the point where a flying plane's shadow lands
  const h = Math.max(0, PLAYER.y - groundY), off = h / Math.max(.2, sunDir.y), sxp = PLAYER.x - sunDir.x * off * .5, szp = PLAYER.z - sunDir.z * off * .5, span = 300 + CAM.dist * .9 + off * .6;
  const sc = sun.shadow.camera; if (sc.right !== span) { sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.near = 10; sc.far = 4000; sc.updateProjectionMatrix(); }
  sun.target.position.set(sxp, groundY, szp); sun.position.set(sxp + sunDir.x * 1800, groundY + sunDir.y * 1800, szp + sunDir.z * 1800);
  if (sun.shadow.mapSize.x !== Q.shadow) { sun.shadow.mapSize.set(Q.shadow, Q.shadow); sun.shadow.map?.dispose(); sun.shadow.map = null; }
  // places: labels near the camera target, pins bob, arrival when walking or driving into a place
  let nearest = null, nd = 1e9;
  for (const pl of world.places.list) {
    const d = Math.min(Math.hypot(pl.x - PLAYER.x, pl.z - PLAYER.z), pl.ring ? world.buildings.collider.distance(pl.ring, PLAYER.x, PLAYER.z) + 10 : 1e9); if (d < nd) { nd = d; nearest = pl; }
    const cd = Math.hypot(pl.x - CAM.tx, pl.z - CAM.tz), show = cd < (PLAYER.mode === 'plane' ? 3200 : PLAYER.mode === 'slowplane' ? 1700 : 950);
    pl.label.visible = show;
    if (show) { const k = camera.position.distanceTo(pl.label.position) * .045; pl.label.scale.set(k * .9 * pl.label.userData.aspect, k * .9, 1); }
    pl.pin.position.y = pl.y + 20 + (REDUCED ? 0 : Math.sin(t * 2 + pl.x) * 1.2);
    const far = camera.position.distanceTo(pl.pin.position); pl.pin.scale.set(clamp(far * .03, 9, 60), clamp(far * .03, 9, 60) * 1.25, 1);
  }
  if (nearest) $('where').textContent = `${nearest.p.short || nearest.p.name} ${nd < 60 ? '바로 앞' : Math.round(nd / 10) * 10 + 'm'}`;
  const ground = PLAYER.mode === 'walk' || PLAYER.mode === 'car';
  if (ground && nearest && nd < 60 && world.arrived !== nearest) { world.arrived = nearest; nearest.seen = true; $('arrive-name').textContent = nearest.p.name + '에 도착했어요'; $('arrive-sub').textContent = '게임에서는 여기서 이야기와 퀴즈가 열려요'; $('arrive').hidden = false; clearTimeout(world.arriveTimer); world.arriveTimer = setTimeout(() => $('arrive').hidden = true, 3200); }
  if (world.arrived && nearest !== world.arrived && nd > 30) world.arrived = null;
  if (world.tapRing?.parent) { const r = world.tapRing; r.userData.t += dt; r.material.opacity = Math.max(0, 1 - r.userData.t / 1.2); r.scale.setScalar(1 + r.userData.t * .8); if (r.userData.t > 1.2 || !PLAYER.target) scene.remove(r); }
}

// ---------- near ground detail: repaint an 800 m square around the camera target when it drifts away
function updateNear(dt) {
  const N = world.near; if (!N) return;
  const flyH = Math.max(0, PLAYER.y - heightAt(PLAYER.x, PLAYER.z)), want = PLAYER.mode === 'plane' ? 0 : 1 - smooth(160, 260, flyH);
  N.strength = damp(N.strength, N.center ? want : 0, 3, dt);
  if (want > 0) {
    const R = PLAYER.mode === 'walk' ? 650 : 1100, lead = PLAYER.mode === 'walk' ? 1.6 : .9;
    const cx = Math.round((CAM.tx + PLAYER.vx * lead) / 25) * 25, cz = Math.round((CAM.tz + PLAYER.vz * lead) / 25) * 25;
    if (!N.job && (!N.center || N.R !== R || Math.hypot(cx - N.center[0], cz - N.center[1]) > R * .3)) {
      const S = N.canvas.width, back = N.back || (N.back = document.createElement('canvas')); back.width = back.height = S;
      N.job = {cx, cz, R, back, q: 0, quarter: N.quarter || (N.quarter = Object.assign(document.createElement('canvas'), {width: S / 2, height: S / 2}))};
    }
    if (N.job) {   // one quarter per frame keeps the repaint from stalling a frame
      const J = N.job, S = N.canvas.width, qx = J.q % 2, qz = Math.floor(J.q / 2);
      paintRegion(J.quarter, J.cx - J.R + qx * J.R, J.cz - J.R + qz * J.R, J.R, J.R);
      J.back.getContext('2d').drawImage(J.quarter, qx * S / 2, qz * S / 2);
      if (++J.q === 4) { N.back = N.canvas; N.canvas = J.back; N.tex.image = N.canvas; N.tex.needsUpdate = true; N.center = [J.cx, J.cz]; N.R = J.R; N.rect.set(J.cx - J.R, J.cz - J.R, 2 * J.R, N.strength); N.job = null; }
    }
  }
  N.rect.w = N.strength;
}

// ---------- frame loop with pokju-style automatic resolution steps
let running = true, last = 0, frameTimes = [], lastCheck = 0, fpsShown = 0;
function frame(now) {
  if (!running) return;
  requestAnimationFrame(frame);
  const dt = Math.min(.05, Math.max(.001, (now - (last || now)) / 1000)); last = now;
  const t = now / 1000;
  simulate(dt); updateCamera(dt); updateActors(dt, t); updateNear(dt);
  sky.position.copy(camera.position); skyUniforms.uTime.value = t;
  { const H = world.buildings.material.userData.hole; H.cam.value.copy(camera.position); H.player.value.set(PLAYER.x, PLAYER.y + (PLAYER.mode === 'walk' ? 12 : 7), PLAYER.z); H.radius.value = PLAYER.mode === 'walk' ? 34 : PLAYER.mode === 'car' ? 46 : 70; }
  world.waterNormal.offset.set(t * .012, t * .007);
  if (post) { post.grade.uniforms.uTime.value = t; post.composer.render(dt); } else renderer.render(scene, camera);
  frameTimes.push(dt * 1000);
  if (now - lastCheck > 2000 && frameTimes.length > 20) {
    const sorted = frameTimes.slice().sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)]; fpsShown = Math.round(1000 / med);
    $('fps').textContent = fpsShown + ' fps';
    if (qualityMode === 'auto' && !document.hidden) {
      if (med > 26 && autoScale > .6) { autoScale = Math.round((autoScale - .14) * 100) / 100; resize(); }
      else if (med > 26 && post.bloom.enabled) { post.bloom.enabled = false; }
      else if (med < 15 && autoScale < 1) { autoScale = Math.min(1, autoScale + .1); resize(); }
    }
    frameTimes = []; lastCheck = now;
  }
}
addEventListener('resize', resize);

build().then(() => {
  $('loading').hidden = true; canvas.focus({preventScroll: true});
  toast('왼쪽을 누른 채 끌면 걸어요. 오른쪽을 끌면 카메라를 돌리고 기울이고, 두 손가락으로 확대해요.');
  window.__spike = {PLAYER, CAM, setMode, applyTime, toggleCamera, world, renderer, info: () => ({buildings: world.buildings.count, realBuildings: world.buildings.real, trees: world.trees.reduce((s, m) => s + m.count, 0), lamps: world.lamps.count, places: world.places.list.length, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles})};
  requestAnimationFrame(frame);
}).catch(e => { console.error(e); $('loading-step').textContent = '만드는 중에 문제가 생겼어요: ' + e.message; });
