// Pure height grid (no Three.js). Node (i, j) sits at game-frame x = i*cell, y = j*cell (metres).
// Data is row-major, row 0 = north (y = 0). `data` stays writable so water carving can lower it.
import { VEX } from '../frame.js';

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
