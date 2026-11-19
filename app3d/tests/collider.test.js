import test from 'node:test';
import assert from 'node:assert/strict';
import { createCollider } from '../src/sim/collider.js';
import { roadClearance } from '../src/sim/roads.js';

const sq = [[0, 0], [10, 0], [10, 10], [0, 10]];

test('point inside is pushed out to at least radius', () => {
  const c = createCollider([sq]);
  const r = c.resolve(9, 5, 2);
  assert.ok(r.hit);
  assert.ok(Math.min(Math.abs(r.x - 10), Math.abs(r.y - 5)) >= 2 - 1e-6 || r.x >= 12 - 1e-6);
  assert.ok(r.x >= 12 - 1e-6 && !c.containing(r.x, r.y));
});

test('sliding keeps the tangential component', () => {
  const c = createCollider([sq]);
  // moving diagonally into the west wall from outside: x clamps, y keeps its advance
  const r = c.resolve(-1, 5.0 + 3, 2);
  assert.ok(r.hit);
  assert.ok(r.x <= -2 + 1e-6);
  assert.ok(Math.abs(r.y - 8) < 1e-6);
  assert.ok(Math.abs(r.nx + 1) < 1e-6);
});

test('containing, distance, blocked', () => {
  const c = createCollider([sq]);
  assert.equal(c.containing(5, 5), sq);
  assert.equal(c.containing(50, 5), null);
  assert.equal(c.distance(sq, 5, 5), 0);
  assert.ok(Math.abs(c.distance(sq, 15, 5) - 5) < 1e-9);
  assert.equal(c.blocked(12, 5, 0), false);
  assert.equal(c.blocked(12, 5, 3), true);
  assert.equal(c.blocked(5, 5), true);
});

test('empty collider never hits', () => {
  const c = createCollider([]);
  const r = c.resolve(3, 4, 5);
  assert.deepEqual([r.x, r.y, r.hit], [3, 4, false]);
  assert.equal(c.blocked(3, 4, 9), false);
  assert.equal(c.containing(3, 4), null);
});

test('roadClearance subtracts half width and ignores footways', () => {
  const f = [
    { kind: 'road', tags: { highway: 'secondary' }, points: [[0, 0], [100, 0]] },
    { kind: 'road', tags: { highway: 'footway' }, points: [[0, 50], [100, 50]] },
    { kind: 'water', tags: {}, points: [[0, 20], [100, 20]] },
  ];
  const r = roadClearance(f);
  assert.ok(Math.abs(r.clearance(50, 20) - 13.5) < 1e-9);
  assert.ok(r.clearance(50, 50) > 30);
  assert.ok(r.clearance(50, 0) < 0);
});
