import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levelFor, needsRepaint, nearRadius, W, H } from '../src/world/ground.js';

test('near radius by mode', () => {
  assert.equal(levelFor('near', { x: 0, y: 0, mode: 'walk' }).R, 650);
  assert.equal(levelFor('near', { x: 0, y: 0, mode: 'bike' }).R, 650);
  for (const m of ['car', 'supercar', 'slowplane', 'boat']) assert.equal(levelFor('near', { x: 0, y: 0, mode: m }).R, 1100);
  assert.equal(levelFor('near', { x: 0, y: 0, mode: 'plane' }), null);
  assert.equal(nearRadius('plane'), null);
});

test('mid is 3000 m and base covers the county', () => {
  assert.equal(levelFor('mid', { x: 100, y: 100, mode: 'plane' }).R, 3000);
  const b = levelFor('base', { x: 5, y: 5, mode: 'walk' });
  assert.equal(b.wx, W); assert.equal(b.wy, H);
  assert.equal(b.cx, W / 2); assert.equal(b.cy, H / 2);
});

test('centre snaps to 25 m', () => {
  const l = levelFor('near', { x: 1012.4, y: 962.4, mode: 'walk' });
  assert.equal(l.cx, 1000); assert.equal(l.cy, 950);
  assert.equal(levelFor('mid', { x: 1013, y: 1037, mode: 'car' }).cx, 1025);
});

test('repaint when the target drifts more than 0.3 R', () => {
  const lv = { cx: 1000, cy: 1000, R: 650 };
  assert.equal(needsRepaint(lv, 1000, 1000), false);
  assert.equal(needsRepaint(lv, 1000 + 195, 1000), false);
  assert.equal(needsRepaint(lv, 1000 + 195.5, 1000), true);
  assert.equal(needsRepaint(lv, 1000 + 150, 1000 + 150), true);
  assert.equal(needsRepaint(null, 0, 0), true);
});
