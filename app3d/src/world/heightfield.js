// Pure height grid (no Three.js). Node (i, j) sits at game-frame x = i*cell, y = j*cell (metres).
// Data is row-major, row 0 = north (y = 0). `data` stays writable so water carving can lower it.
import { VEX, BOUNDS, M_LON, M_LAT } from '../frame.js';
import { blocksWater } from '#game/water.js';

export class HeightField {
  constructor(grid, data) {
    this.grid = grid;
    this.data = data;
    this.w = grid.w;
    this.h = grid.h;
    this.cell = grid.cell;
    this.extentX = (grid.w - 1) * grid.cell;
    this.extentY = (grid.h - 1) * grid.cell;
  }

  heightAt(x, y) {
    const { w, h, cell, data } = this;
    let fx = x / cell, fy = y / cell;
    if (fx < 0) fx = 0; else if (fx > w - 1) fx = w - 1;
    if (fy < 0) fy = 0; else if (fy > h - 1) fy = h - 1;
    const i = Math.min(Math.floor(fx), w - 2 < 0 ? 0 : w - 2);
    const j = Math.min(Math.floor(fy), h - 2 < 0 ? 0 : h - 2);
    const tx = fx - i, ty = fy - j;
    const i1 = Math.min(i + 1, w - 1), j1 = Math.min(j + 1, h - 1);
    const a = data[j * w + i], b = data[j * w + i1], c = data[j1 * w + i], d = data[j1 * w + i1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }

  renderY(x, y) { return this.heightAt(x, y) * VEX; }

  // rise / run, central differences over +-half a cell
  slopeAt(x, y) {
    const d = this.cell / 2;
    const dx = (this.heightAt(x + d, y) - this.heightAt(x - d, y)) / (2 * d);
    const dy = (this.heightAt(x, y + d) - this.heightAt(x, y - d)) / (2 * d);
    return Math.hypot(dx, dy);
  }

  isSea(x, y) { return this.heightAt(x, y) < 0.5; }
}

// ---- water carving (R2/R5) ----
// Even-odd scanline span fill: calls fn(row, i0, i1) for the node ranges (inclusive) inside rings at each grid row.
function fillRings(field, rings, fn) {
  const { w, h, cell } = field;
  let minY = Infinity, maxY = -Infinity;
  for (const r of rings) for (const p of r) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
  const j0 = Math.max(0, Math.ceil(minY / cell)), j1 = Math.min(h - 1, Math.floor(maxY / cell));
  for (let j = j0; j <= j1; j++) {
    const y = j * cell, xs = [];
    for (const r of rings) {
      for (let a = 0, b = r.length - 1; a < r.length; b = a++) {
        const p = r[a], q = r[b];
        if ((p[1] > y) !== (q[1] > y)) xs.push(p[0] + ((y - p[1]) * (q[0] - p[0])) / (q[1] - p[1]));
      }
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil(xs[k] / cell)), i1 = Math.min(w - 1, Math.floor(xs[k + 1] / cell));
      if (i0 <= i1) fn(j, i0, i1);
    }
  }
}

export function carveWater(field, { sea, lakes = [] } = {}) {
  const { w, data } = field;
  if (sea) {
    const rings = [sea.points, ...(sea.holes || [])];
    const inSea = new Uint8Array(data.length);
    fillRings(field, rings, (j, i0, i1) => { for (let i = i0; i <= i1; i++) inSea[j * w + i] = 1; });
    for (let n = 0; n < data.length; n++) {
      if (inSea[n]) { if (data[n] > -2) data[n] = -2; }
      else if (data[n] < 0.3) data[n] = 0.3;
    }
  }
  const levels = [];
  for (const f of lakes) {
    if (f.kind === 'county-sea' || !blocksWater(f)) continue;
    let shore = Infinity;
    for (const p of f.points) shore = Math.min(shore, field.heightAt(p[0], p[1]));
    if (!Number.isFinite(shore)) continue;
    const floor = shore - 1.6;
    fillRings(field, [f.points, ...(f.holes || [])], (j, i0, i1) => {
      for (let i = i0; i <= i1; i++) if (data[j * w + i] > floor) data[j * w + i] = floor;
    });
    levels.push({ feature: f, level: shore });
  }
  return levels;
}

// ---- shore ramp (run after the sea carve, before lakes) ----
// The sea plane (Y = 0) meets the terrain where the triangulated heights cross zero. With the plain carve (sea -2,
// land >= 0.3) that line follows the 25 m grid as a staircase. Near the coast (within 1.5 cells) this pass makes
// every node's height proportional to its signed distance d from the OSM coastline: land between lo·d and hi·d (at
// least 2 cm), sea at -r·d with r the mean height/distance ratio of its land neighbours, so each zero crossing lands
// on the coastline itself. Sea-polygon edges that run along the map border are not coastline and are ignored.
const MAP_W = (BOUNDS[2] - BOUNDS[0]) * M_LON, MAP_H = (BOUNDS[3] - BOUNDS[1]) * M_LAT;

export function shoreRamp(field, sea, { lo = 0.08, hi = 0.3, deepest = -10, border = [0, 0, MAP_W, MAP_H] } = {}) {
  if (!sea) return 0;
  const { w, h, cell, data } = field, band = cell * 1.5, rings = [sea.points, ...(sea.holes || [])];
  const along = (a, b, k, v) => Math.abs(a[k] - v) < 1 && Math.abs(b[k] - v) < 1;
  const segs = [];
  for (const r of rings) for (let k = 0; k < r.length; k++) {
    const a = r[k], b = r[(k + 1) % r.length];
    if (a[0] === b[0] && a[1] === b[1]) continue;
    if (along(a, b, 0, border[0]) || along(a, b, 1, border[1]) || along(a, b, 0, border[2]) || along(a, b, 1, border[3])) continue;
    segs.push([a[0], a[1], b[0], b[1]]);
  }
  const G = 64, index = new Map(), gk = (i, j) => i * 100003 + j;
  for (const s of segs) {
    for (let i = Math.floor(Math.min(s[0], s[2]) / G); i <= Math.floor(Math.max(s[0], s[2]) / G); i++)
      for (let j = Math.floor(Math.min(s[1], s[3]) / G); j <= Math.floor(Math.max(s[1], s[3]) / G); j++) {
        const k = gk(i, j); if (!index.has(k)) index.set(k, []); index.get(k).push(s);
      }
  }
  const coastDistance = (x, y) => {
    let best = Infinity;
    const ci = Math.floor(x / G), cj = Math.floor(y / G);
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) for (const s of index.get(gk(i, j)) || []) {
      const dx = s[2] - s[0], dy = s[3] - s[1], l = dx * dx + dy * dy;
      const t = l ? Math.max(0, Math.min(1, ((x - s[0]) * dx + (y - s[1]) * dy) / l)) : 0;
      const d = Math.hypot(x - s[0] - dx * t, y - s[1] - dy * t);
      if (d < best) best = d;
    }
    return best;
  };
  const inSea = new Uint8Array(data.length);
  fillRings(field, rings, (j, i0, i1) => { for (let i = i0; i <= i1; i++) inSea[j * w + i] = 1; });
  // nodes within the band of some coastline segment, with their distance
  const dist = new Float32Array(data.length).fill(Infinity), near = [];
  for (const s of segs) {
    const i0 = Math.max(0, Math.floor((Math.min(s[0], s[2]) - band) / cell)), i1 = Math.min(w - 1, Math.ceil((Math.max(s[0], s[2]) + band) / cell));
    const j0 = Math.max(0, Math.floor((Math.min(s[1], s[3]) - band) / cell)), j1 = Math.min(h - 1, Math.ceil((Math.max(s[1], s[3]) + band) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const n = j * w + i;
      if (dist[n] !== Infinity) continue;
      const d = coastDistance(i * cell, j * cell);
      dist[n] = d;
      if (d < band) near.push(n);
    }
  }
  // land first (clamped to a gentle ramp), then the sea nodes from their land neighbours
  // (land the carve lifted to its 0.3 m floor counts as flat: it follows lo·d, so it may sit just above the sea here)
  for (const n of near) if (!inSea[n]) { const d = Math.max(dist[n], 0.5), base = data[n] <= 0.3001 ? 0 : data[n]; data[n] = Math.max(0.02, Math.min(hi * d, Math.max(lo * d, base))); }
  for (const n of near) {
    if (!inSea[n]) continue;
    const i = n % w, j = (n - i) / w;
    let sum = 0, count = 0;
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      const ii = i + a, jj = j + b;
      if ((a || b) && ii >= 0 && jj >= 0 && ii < w && jj < h && !inSea[jj * w + ii]) { const m = jj * w + ii; sum += data[m] / Math.max(dist[m], 0.5); count++; }
    }
    if (count) data[n] = Math.min(-0.05, Math.max(deepest, -(sum / count) * dist[n]));
  }
  return near.length;
}
