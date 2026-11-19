import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HeightField } from '../src/world/heightfield.js';

const grid = { w: 2, h: 2, cell: 25 };
const mk = () => new HeightField(grid, new Float32Array([0, 10, 20, 30]));

test('exact values at nodes', () => {
  const f = mk();
  assert.equal(f.heightAt(0, 0), 0);
  assert.equal(f.heightAt(25, 0), 10);
  assert.equal(f.heightAt(0, 25), 20);
  assert.equal(f.heightAt(25, 25), 30);
});
test('bilinear midpoint', () => {
  const f = mk();
  assert.equal(f.heightAt(12.5, 12.5), 15);
  assert.equal(f.heightAt(12.5, 0), 5);
  assert.equal(f.heightAt(0, 12.5), 10);
});
test('clamps outside the grid', () => {
  const f = mk();
  assert.equal(f.heightAt(-100, -100), 0);
  assert.equal(f.heightAt(500, -5), 10);
  assert.equal(f.heightAt(500, 500), 30);
});
test('renderY applies VEX 1.2', () => {
  const f = mk();
  assert.ok(Math.abs(f.renderY(25, 25) - 36) < 1e-9);
});
test('slopeAt is rise over run and isSea < 0.5 m', () => {
  const f = mk();
  assert.ok(Math.abs(f.slopeAt(12.5, 12.5) - Math.hypot(10 / 25, 20 / 25)) < 0.05);
  assert.equal(f.isSea(0, 0), true);
  assert.equal(f.isSea(25, 25), false);
});
test('data and grid are exposed and writable', () => {
  const f = mk();
  f.data[0] = 7;
  assert.equal(f.heightAt(0, 0), 7);
  assert.equal(f.grid.w, 2);
});

import { carveWater } from '../src/world/heightfield.js';

const sq = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const gridOf = (n, cell, fn) => {
  const d = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) d[j * n + i] = fn(i, j);
  return new HeightField({ w: n, h: n, cell }, d);
};

test('carveWater: lake lowered below shore, levels returned', () => {
  const f = gridOf(11, 10, () => 5);
  const lake = { kind: 'osm', tags: { natural: 'water', water: 'reservoir' }, points: sq(35, 35, 65, 65), holes: [] };
  const out = carveWater(f, { sea: null, lakes: [lake] });
  assert.equal(out.length, 1);
  assert.equal(out[0].feature, lake);
  assert.equal(out[0].level, 5);
  assert.ok(Math.abs(f.data[5 * 11 + 5] - 3.4) < 1e-6); // inside
  assert.equal(f.data[1 * 11 + 1], 5);                 // outside untouched
});

test('carveWater: sea with island hole, land floor 0.3', () => {
  const f = gridOf(11, 10, (i, j) => (i === 5 && j === 2 ? 4 : 0.1));
  const sea = { kind: 'county-sea', tags: {}, points: sq(-5, -5, 105, 55), holes: [sq(35, 15, 65, 35)] };
  carveWater(f, { sea, lakes: [] });
  assert.equal(f.data[0 * 11 + 0], -2);          // in sea
  assert.equal(f.data[2 * 11 + 5], 4);           // island hill inside hole kept
  assert.ok(Math.abs(f.data[3 * 11 + 5] - 0.3) < 1e-6); // island low land raised
  assert.ok(Math.abs(f.data[8 * 11 + 5] - 0.3) < 1e-6); // land outside sea raised
  assert.equal(f.data[4 * 11 + 0], -2);          // row 4 (y=40) sea, left of hole
});
