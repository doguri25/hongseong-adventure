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
