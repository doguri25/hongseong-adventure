import test from 'node:test';
import assert from 'node:assert/strict';
import { createCamera, stepCamera } from '../src/sim/camera.js';
import { toRender } from '../src/frame.js';

const flat = (h = 0) => ({ renderY: () => h });
const mk = (o = {}) => ({ x: 0, y: 0, h: 0, heading: 0, speed: 0, vx: 0, vy: 0, mode: 'walk', ...o });
const run = (cam, p, view, field, n, dt = 1 / 30) => { let r; for (let i = 0; i < n; i++) r = stepCamera(cam, p, dt, view, field); return r; };
const pitchOf = r => { const d = r.position.map((v, i) => v - r.target[i]); return Math.atan2(d[1], Math.hypot(d[0], d[2])) * 180 / Math.PI; };

test('pitch never leaves 4-88 degrees for any pitchAdj', () => {
  for (const adj of [-500, -70, 0, 70, 500]) {
    const r = run(createCamera('tilt'), mk(), { userYaw: 0, pitchAdj: adj, zoom: 1 }, flat(-1000), 200);
    const p = pitchOf(r);
    assert.ok(p >= 4 - 1e-6 && p <= 88 + 1e-6, `${adj} -> ${p}`);
  }
});

test('zoom clamps to 0.2-4 of the base distance', () => {
  const dist = z => { const r = run(createCamera('tilt'), mk(), { userYaw: 0, pitchAdj: 0, zoom: z }, flat(-1000), 400); return Math.hypot(...r.position.map((v, i) => v - r.target[i])); };
  assert.ok(Math.abs(dist(100) / dist(4) - 1) < 1e-6);
  assert.ok(Math.abs(dist(0.001) / dist(0.2) - 1) < 1e-6);
  assert.ok(Math.abs(dist(1) - 185) < 1);
});

test('follow yaw converges to the heading after 2.2 s without user input', () => {
  const cam = createCamera('follow'), p = mk({ heading: 1.2, speed: 40, vx: 0, vy: 0 });
  const view = { userYaw: 0.5, pitchAdj: 0, zoom: 1 };
  stepCamera(cam, mk({ heading: 0 }), 1 / 30, { ...view, userYaw: 0 }, flat());
  stepCamera(cam, p, 1 / 30, view, flat());   // the user just rotated the view
  run(cam, p, view, flat(), 55);               // 2 s: still inside the idle window
  assert.ok(Math.abs(cam.yaw - 1.2) > 0.3);
  const r = run(cam, p, view, flat(), 600);
  assert.ok(Math.abs(r.yaw - 1.2) < 0.02, String(r.yaw));
  assert.ok(Math.abs(view.userYaw) < 0.01);
});

test('user input in follow mode holds the heading re-alignment', () => {
  const cam = createCamera('follow'), p = mk({ heading: 1, speed: 40 }), view = { userYaw: 0, pitchAdj: 0, zoom: 1 };
  run(cam, mk({ heading: 0 }), view, flat(), 3);
  for (let i = 0; i < 150; i++) { view.userYaw += 0.01; stepCamera(cam, p, 1 / 30, view, flat()); }
  assert.ok(Math.abs(cam.base) < 0.05);
});

test('camera never goes below terrain + 12 m', () => {
  const field = { renderY: () => 400 };
  const r = run(createCamera('tilt'), mk({ h: 0 }), { userYaw: 0, pitchAdj: -70, zoom: 0.2 }, field, 200);
  assert.ok(r.position[1] >= 412 - 1e-6);
});

test('tilt yaw uses userYaw; position sits behind (south of) the target at yaw 0; target leads by velocity', () => {
  const p = mk({ x: 10, y: 20, vx: 10, vy: 0, speed: 10 });
  const r = run(createCamera('tilt'), p, { userYaw: 0, pitchAdj: 0, zoom: 1 }, flat(), 600);
  assert.ok(r.position[2] > r.target[2]);
  const [X] = toRender(10, 20);
  assert.ok(r.target[0] > X + 2);
});

test('fov widens for a fast plane', () => {
  const r = run(createCamera('tilt'), mk({ mode: 'plane', speed: 78 * 16, h: 600 }), { userYaw: 0, pitchAdj: 0, zoom: 1 }, flat(), 600);
  assert.ok(r.fov > 65 && r.fov <= 66.01);
});
