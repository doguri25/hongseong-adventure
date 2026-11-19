// Pure height grid (no Three.js). Node (i, j) sits at game-frame x = i*cell, y = j*cell (metres).
// Data is row-major, row 0 = north (y = 0). `data` stays writable so water carving can lower it.
import { VEX } from '../frame.js';
import { blocksWater } from '../../../dist/water.js';

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
