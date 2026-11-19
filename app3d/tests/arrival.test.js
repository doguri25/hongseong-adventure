import test from 'node:test';
import assert from 'node:assert/strict';
import { arrivals, nearestPlace } from '../src/sim/arrival.js';
import { createCollider } from '../src/sim/collider.js';

const none = createCollider([]);
const place = (id, x, y, extra = {}) => ({ id, point: [x, y], type: 'daily', ...extra });   // daily -> 36 m radius
const walk = (places, path, mode = 'walk', collider = none, held = new Set()) => {
  const fired = [];
  for (let i = 1; i < path.length; i++) for (const p of arrivals(places, path[i - 1], path[i], held, mode, collider)) fired.push([i, p.id]);
  return { fired, held };
};
const line = (x0, x1, y = 0, step = 5) => { const a = []; for (let x = x0; x <= x1; x += step) a.push([x, y]); return a; };

test('walking into a 36 m radius fires once until leaving, then again', () => {
  const ps = [place('a', 0, 0)];
  const there = line(-100, 100), back = line(-100, 100).reverse();
  const r = walk(ps, [...there, ...back]);
  assert.deepEqual(r.fired.map(f => f[1]), ['a', 'a']);   // once on the way in, once re-armed on the way back
  const single = walk(ps, line(-100, 20));
  assert.equal(single.fired.length, 1);
  assert.ok(single.held.has('a'));
});

test('heritage places use the 48 m radius', () => {
  const r = walk([place('h', 0, 0, { type: 'heritage' })], line(-100, 0, 0, 1));
  assert.equal(r.fired.length, 1);
  assert.ok(line(-100, 0, 0, 1)[r.fired[0][0]][0] <= -47);
});

test('a place inside a building fires on touching the wall', () => {
  const ring = [[-60, -60], [60, -60], [60, 60], [-60, 60]];
  const c = createCollider([ring]);
  const ps = [place('b', 0, 0, { ring })];
  // approaching from the west at y 0: the point is 60 m behind the wall, radius 36 would only fire at x=-36
  const r = walk(ps, line(-300, 0, 0, 2), 'walk', c);
  assert.equal(r.fired.length, 1);
  const x = line(-300, 0, 0, 2)[r.fired[0][0]][0];
  assert.ok(x >= -112 && x <= -108, 'fires when wall distance + 10 <= 60, got x=' + x);
  const without = walk([place('b', 0, 0)], line(-300, 0, 0, 2), 'walk', c);
  assert.ok(line(-300, 0, 0, 2)[without.fired[0][0]][0] >= -37);
  // staying near the wall does not re-fire; backing off 20 m beyond the contact range does
  const stay = walk(ps, [...line(-300, -100, 0, 2), ...line(-125, -100, 0, 2).reverse(), ...line(-125, -100, 0, 2)], 'walk', c);
  assert.equal(stay.fired.length, 1);
  const leave = walk(ps, [...line(-300, -100, 0, 2), ...line(-170, -100, 0, 2).reverse(), ...line(-170, -100, 0, 2)], 'walk', c);
  assert.equal(leave.fired.length, 2);
});

test('car fires within 110 m, supercar too, bike like walking', () => {
  const ps = [place('a', 0, 0)];
  const f = (mode) => { const path = line(-400, 0, 0, 4), r = walk(ps, path, mode); return r.fired.length ? path[r.fired[0][0]][0] : null; };
  assert.ok(f('car') <= -106 && f('car') >= -114);
  assert.ok(f('supercar') <= -106 && f('supercar') >= -114);
  assert.ok(f('walk') >= -40);
  assert.ok(f('bike') >= -40);
});

test('a fast swept step cannot skip a place', () => {
  const r = walk([place('a', 0, 0)], [[-300, 0], [300, 0]], 'supercar');
  assert.equal(r.fired.length, 1);
});

test('planes and boats never fire', () => {
  const ps = [place('a', 0, 0)];
  for (const m of ['slowplane', 'plane', 'boat']) assert.equal(walk(ps, line(-300, 300), m).fired.length, 0, m);
});

test('nearestPlace uses the point or the building contact, whichever is closer', () => {
  const ring = [[-60, -60], [60, -60], [60, 60], [-60, 60]];
  const c = createCollider([ring]);
  const ps = [place('far', 500, 0), place('b', 0, 0, { ring })];
  const r = nearestPlace(ps, { x: -100, y: 0 }, c);
  assert.equal(r.place.id, 'b');
  assert.ok(Math.abs(r.distance - 50) < 1e-6);   // 40 m to the wall + 10
  assert.equal(nearestPlace([], { x: 0, y: 0 }, c), null);
  assert.equal(nearestPlace(ps, { x: 0, y: 0 }, none).distance, 0);
});

test('a car parked at the wall of a large building fires once, and again after leaving > 80 m and returning', () => {
  const ring = [[-400, -400], [400, -400], [400, 400], [-400, 400]];
  const c = createCollider([ring]), ps = [place('big', 0, 0, { ring })];   // wall is 400 m from the point
  const held = new Set(), fired = [];
  const step = (a, b) => { for (const p of arrivals(ps, a, b, held, 'car', c)) fired.push(p.id); };
  for (const [a, b] of line(-800, -440, 0, 4).slice(1).map((v, i, l) => [i ? l[i - 1] : [-800, 0], v])) step(a, b);
  assert.equal(fired.length, 1);
  for (let i = 0; i < 60; i++) step([-440, 0], [-440, 0]);   // parked 40 m from the wall (contact 50)
  assert.equal(fired.length, 1);
  step([-440, 0], [-600, 0]); step([-600, 0], [-440, 0]);     // 200 m away: contact 210 > 80, outside point reach
  assert.equal(fired.length, 2);
});
