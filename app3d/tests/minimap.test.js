import { test } from 'node:test';
import assert from 'node:assert/strict';
import { minimapPoint, MINIMAP_RADIUS } from '../src/ui/minimap.js';

const close = (a, b) => assert.ok(Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9, `${a} vs ${b}`);

test('minimapPoint: north up when the camera looks north, scaled by k', () => {
  close(minimapPoint(0, -100, 0, 0.5), [0, -50]);    // north of the player: straight up
  close(minimapPoint(100, 0, 0, 0.5), [50, 0]);      // east: right
});

test('minimapPoint: the map turns with the camera so what is ahead on screen is up', () => {
  close(minimapPoint(100, 0, Math.PI / 2, 1), [0, -100]);    // camera looking east: east is up
  close(minimapPoint(0, -100, Math.PI / 2, 1), [-100, 0]);   // ... and north is to the left
  close(minimapPoint(0, 100, Math.PI, 1), [0, -100]);        // looking south: south is up
});

test('MINIMAP_RADIUS shows more of the county for faster modes', () => {
  const m = MINIMAP_RADIUS;
  assert.ok(m.walk < m.bike && m.bike < m.car && m.car < m.supercar && m.supercar < m.plane);
});
