import test from 'node:test';
import assert from 'node:assert/strict';
import { HeightField } from '../src/world/heightfield.js';
import { createCollider } from '../src/sim/collider.js';
import { buildRoadGraph } from '../src/sim/roadgraph.js';
import { WaterGuard } from '../../dist/water.js';
import { RoadNavigator } from '../../dist/navigation.js';
import { createPlayer, stepPlayer, setMode } from '../src/sim/player.js';

const DT = 1 / 30;
const ring = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const bounds = [-3000, -3000, 3000, 3000];
const bbox = pts => [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))];
const road = (points, highway = 'tertiary') => ({ kind: 'road', tags: { highway }, points, holes: [], bounds: bbox(points) });
const poly = (tags, points) => ({ tags, points, holes: [], bounds: bbox(points) });

function world(extra = []) {
  const features = [
    poly({ building: 'yes' }, ring(100, -50, 140, 50)),                    // wall west face at x=100
    poly({ natural: 'water', water: 'reservoir' }, ring(-400, 300, 400, 700)),  // pond
    road([[-600, 0], [0, 0], [600, 0]]),                                      // east-west road, y=0
    road([[0, -600], [0, 0], [0, 600]]),
    ...extra,
  ];
  const field = new HeightField({ w: 241, h: 241, cell: 25 }, new Float32Array(241 * 241).fill(10));
  return {
    field, bounds,
    collider: createCollider([ring(100, -50, 140, 50)]),
    graph: buildRoadGraph(features.filter(f => f.tags.highway)),
    water: new WaterGuard(features), navigator: new RoadNavigator(features),
  };
}
const run = (p, input, s, n) => { const ev = []; for (let i = 0; i < n; i++) ev.push(...stepPlayer(p, input, s, DT).events); return ev; };
// stick pointing east with camera yaw 0: right = (1, 0)
const east = { x: 1, y: 0, camYaw: 0, camMode: 'tilt', target: null };
const north = { x: 0, y: 1, camYaw: 0, camMode: 'tilt', target: null };

test('free walk slides along a wall', () => {
  const s = world(), p = createPlayer({ x: 60, y: -30, movementMode: 'free', speedSetting: 2 });
  // heading east-south-east into the west face of the building
  const input = { x: 1, y: -0.3, camYaw: 0, camMode: 'tilt', target: null };
  run(p, input, s, 45);
  assert.ok(p.x <= 100 - 5 + 1e-6 && p.x > 80, `x ${p.x}`);
  assert.ok(p.y > -30 + 15, `slid south ${p.y}`);
  assert.ok(!s.collider.containing(p.x, p.y));
});

test('free walk speed is 78 * setting', () => {
  const s = world(), p = createPlayer({ x: -500, y: -200, movementMode: 'free', speedSetting: 1 });
  run(p, east, s, 120);
  assert.ok(Math.abs(p.speed - 78) < 1, `speed ${p.speed}`);
  assert.ok(Math.abs(p.heading - Math.PI / 2) < 0.05);
});

test('water blocks walk but not plane', () => {
  const s = world(), w = createPlayer({ x: 0, y: 200, movementMode: 'free', speedSetting: 3 });
  const ev = run(w, { x: 0, y: -1, camYaw: 0, camMode: 'tilt', target: null }, s, 200);   // south, into the pond
  assert.ok(ev.includes('water'));
  assert.ok(!s.water.blocked([w.x, w.y]) && w.y < 300);
  const f = createPlayer({ x: 0, y: 200, mode: 'plane' });
  f.alt = 700; f.heading = Math.PI; f.speed = 500;
  run(f, { x: 0, y: 1, camYaw: Math.PI, camMode: 'follow', target: null }, s, 20);
  assert.ok(f.y > 500 && s.water.blocked([f.x, f.y]), `plane y ${f.y}`);
});

test('roads-mode walk stays on the walking graph', () => {
  const s = world(), p = createPlayer({ x: 40, y: 20, movementMode: 'roads' });
  assert.ok(setMode(p, 'bike', s).ok); assert.ok(setMode(p, 'walk', s).ok);
  assert.ok(Math.abs(p.y) < 1e-6, `snapped ${p.y}`);
  run(p, { x: 1, y: 0.3, camYaw: 0, camMode: 'tilt', target: null }, s, 100);
  assert.ok(Math.abs(p.y) < 1e-6 && p.x > 100, `on road ${p.x},${p.y}`);
  run(p, north, s, 10);   // no way north off this road mid-segment: stays put on the road
  assert.ok(Math.abs(p.y) < 1e-6 || Math.abs(p.x) < 1e-6);
});

test('roads-mode tap target follows a route', () => {
  const s = world(), p = createPlayer({ x: -200, y: 0, movementMode: 'roads' });
  run(p, { x: 0, y: 0, camYaw: 0, camMode: 'tilt', target: [0, 300] }, s, 400);
  assert.ok(Math.hypot(p.x, p.y - 300) < 2, `${p.x},${p.y}`);
});

test('free tap target walks straight and stops', () => {
  const s = world(), p = createPlayer({ x: -300, y: -200, movementMode: 'free', speedSetting: 2 });
  run(p, { x: 0, y: 0, camYaw: 0, camMode: 'tilt', target: [-100, -200] }, s, 300);
  assert.ok(Math.hypot(p.x + 100, p.y + 200) < 20, `${p.x},${p.y}`);
  assert.ok(p.speed < 5);
});

test('setMode car 700 m from roads fails', () => {
  const s = world(), p = createPlayer({ x: 1500, y: 1500, movementMode: 'free' });
  const r = setMode(p, 'car', s);
  assert.equal(r.ok, false); assert.ok(r.toast); assert.equal(p.mode, 'walk');
  const q = createPlayer({ x: 200, y: 30 });
  assert.equal(setMode(q, 'car', s).ok, true); assert.equal(q.mode, 'car');
});

test('car drives along the road and exposes velocity', () => {
  const s = world(), p = createPlayer({ x: -300, y: 4, movementMode: 'roads' });
  p.heading = Math.PI / 2;
  assert.ok(setMode(p, 'car', s).ok);
  run(p, { x: 0, y: 1, camYaw: Math.PI / 2, camMode: 'follow', target: null }, s, 40);
  assert.ok(p.speed > 20 && Math.abs(p.vx - Math.sin(p.heading) * p.speed) < 1e-9, [p.speed, p.vx, p.heading, p.x, p.y].join(' '));
  assert.ok(Math.abs(p.y) < 8 && p.x > -300);
});

test('plane landing over water is refused', () => {
  const s = world(), p = createPlayer({ x: 0, y: 500, mode: 'walk', movementMode: 'free' });
  p.x = 0; p.y = 200; assert.ok(setMode(p, 'plane', s).ok);
  p.y = 500;
  const r = setMode(p, 'walk', s);
  assert.equal(r.ok, false); assert.equal(p.pending, null); assert.equal(p.mode, 'plane');
});

test('plane landing as car far from roads becomes walk', () => {
  const s = world(), p = createPlayer({ x: 1500, y: 1500, mode: 'plane', movementMode: 'free' });
  p.alt = 400;
  assert.ok(setMode(p, 'car', s).ok); assert.equal(p.pending, 'car');
  let toast, ev = [];
  for (let i = 0; i < 600 && p.pending; i++) { const r = stepPlayer(p, north, s, DT); ev.push(...r.events); if (r.toast) toast = r.toast; }
  assert.equal(p.mode, 'walk'); assert.ok(ev.includes('landed')); assert.ok(toast);
  assert.ok(Math.abs(p.h - s.field.renderY(p.x, p.y)) < 3);
});

test('plane landing as car near road puts a car on the road', () => {
  const s = world(), p = createPlayer({ x: -300, y: 40, mode: 'walk', movementMode: 'free' });
  setMode(p, 'slowplane', s);
  assert.ok(setMode(p, 'car', s).ok);
  for (let i = 0; i < 900 && p.pending; i++) stepPlayer(p, { x: 0, y: 0, camYaw: 0, camMode: 'tilt', target: null }, s, DT);
  assert.equal(p.mode, 'car'); assert.ok(p.car); assert.ok(Math.abs(p.y) < 6);
});

test('plane speed equals 78*1.4*16 and altitude holds above ground', () => {
  const s = world(), p = createPlayer({ x: -2000, y: -2000, mode: 'walk', movementMode: 'free', speedSetting: 1.4 });
  const ev = [];
  setMode(p, 'plane', s);
  ev.push(...stepPlayer(p, north, s, DT).events);
  assert.ok(ev.includes('took-off'));
  const input = { x: 0, y: 1, camYaw: 0, camMode: 'follow', target: null };
  run(p, input, s, 700);
  assert.ok(Math.abs(p.speed - 78 * 1.4 * 16) < 1, `speed ${p.speed}`);
  assert.ok(p.h > s.field.renderY(p.x, p.y) + 400, `h ${p.h}`);
});

test('boat is left alone', () => {
  const s = world(), p = createPlayer({ x: 5, y: 5, mode: 'boat' });
  stepPlayer(p, east, s, DT); assert.equal(p.x, 5);
});

test('free walk: diagonal stick is capped at vmax, half stick settles at half', () => {
  const s = world(), p = createPlayer({ x: -2000, y: -2000, movementMode: 'free', speedSetting: 1 });
  run(p, { x: 1, y: 1, camYaw: 0, camMode: 'tilt', target: null }, s, 150);
  assert.ok(Math.abs(p.speed - 78) < 0.5, `diagonal ${p.speed}`);
  const q = createPlayer({ x: -2000, y: -2000, movementMode: 'free', speedSetting: 1 });
  run(q, { x: 0.5, y: 0, camYaw: 0, camMode: 'tilt', target: null }, s, 150);
  assert.ok(Math.abs(q.speed - 39) < 0.5, `half ${q.speed}`);
});
