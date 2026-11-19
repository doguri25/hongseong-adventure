import test from 'node:test';
import assert from 'node:assert/strict';
import { HeightField } from '../src/world/heightfield.js';
import { createCollider } from '../src/sim/collider.js';
import { buildRoadGraph } from '../src/sim/roadgraph.js';
import { WaterGuard } from '#game/water.js';
import { RoadNavigator } from '#game/navigation.js';
import { createPlayer, stepPlayer, setMode, waterSurface, TOAST } from '../src/sim/player.js';

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

// I1: a sea south of y = 1000 (dry land north of it)
const seaWorld = () => world([poly({ natural: 'water', water: 'sea' }, ring(-3000, 1000, 3000, 2990))]);
const flyingSouth = (s, mode, x, y) => {
  const p = createPlayer({ x, y, mode: 'walk', movementMode: 'free', speedSetting: 1 });
  setMode(p, mode, s); stepPlayer(p, { x: 0, y: 0, camYaw: 0, camMode: 'tilt' }, s, DT);
  p.heading = Math.PI; p.speed = 78 * (mode === 'plane' ? 16 : 4); p.alt = s.field.renderY(x, y) + (mode === 'plane' ? 600 : 270);
  p.x = x; p.y = y;
  return p;
};
const land = (p, s, input, max = 1200) => {
  const out = { events: [], toasts: [] };
  for (let i = 0; i < max && p.pending; i++) { const r = stepPlayer(p, input, s, DT); out.events.push(...r.events); if (r.toast) out.toasts.push(r.toast); }
  return out;
};
const still = { x: 0, y: 0, camYaw: Math.PI, camMode: 'follow', target: null };

test('landing with the stick released brakes and touches down near where it was chosen, on land', () => {
  const s = seaWorld();
  for (const [mode, reach] of [['slowplane', 70], ['plane', 190]]) {
    const p = flyingSouth(s, mode, -1000, 800);           // 200 m before the coast, at full speed toward the sea
    assert.ok(setMode(p, 'walk', s).ok, mode);
    const r = land(p, s, still);
    assert.equal(p.mode, 'walk', mode); assert.ok(r.events.includes('landed'), mode);
    assert.ok(Math.hypot(p.x + 1000, p.y - 800) < reach, `${mode} landed ${Math.round(p.y - 800)} m on`);
    assert.ok(!s.water.blocked([p.x, p.y]), `${mode} on land`);
    const at = [p.x, p.y];
    run(p, { x: 0.7, y: 0.7, camYaw: 0, camMode: 'tilt', target: null }, s, 60);   // and can walk away
    assert.ok(Math.hypot(p.x - at[0], p.y - at[1]) > 30, `${mode} walker moves`);
  }
});

test('touch-down over water calls the landing off and climbs back (WaterGuard decides)', () => {
  const s = seaWorld(), p = flyingSouth(s, 'slowplane', -1000, 900);
  assert.ok(setMode(p, 'walk', s).ok); assert.equal(p.pending, 'walk');
  // the stick held forward keeps the plane flying out over the sea while it descends
  const r = land(p, s, { x: 0, y: 1, camYaw: Math.PI, camMode: 'follow', target: null });
  assert.equal(p.pending, null); assert.equal(p.mode, 'slowplane');
  assert.ok(r.events.includes('landing-cancelled') && !r.events.includes('landed'));
  assert.deepEqual(r.toasts, [TOAST.water]);
  assert.ok(s.water.blocked([p.x, p.y]));
  assert.ok(p.speed >= 78 * 4 * 0.25 - 1e-6, `flies on: ${p.speed}`);
  const low = p.alt;
  run(p, still, s, 150);
  assert.ok(p.alt > low + 100, `climbs back: ${p.alt - low}`);
  assert.equal(p.mode, 'slowplane');
});

test('landing is refused only where WaterGuard says water, not on low dry land', () => {
  const s = seaWorld();
  s.field.data.fill(0.3);                                  // dry coast the carve left at its 0.3 m floor
  const p = flyingSouth(s, 'slowplane', 0, -500);
  assert.ok(setMode(p, 'walk', s).ok, 'low dry land accepts a landing');
  const q = flyingSouth(s, 'slowplane', 0, 1500);
  const r = setMode(q, 'walk', s);
  assert.equal(r.ok, false); assert.equal(r.toast, TOAST.water); assert.equal(q.pending, null);
});

test('a walker standing on water walks toward land instead of freezing, never further out', () => {
  for (const movementMode of ['free', 'roads']) {
    const s = world(), p = createPlayer({ x: 0, y: 340, movementMode, speedSetting: 1 });   // 40 m into the pond, on the x = 0 road line
    assert.ok(s.water.blocked([p.x, p.y]));
    run(p, { x: 0, y: -1, camYaw: 0, camMode: 'tilt', target: null }, s, 30);    // south: further out
    assert.ok(p.y <= 340 + 1e-6, `${movementMode} not further out: ${p.y}`);
    run(p, north, s, 90);                                                          // north: toward the shore
    assert.ok(!s.water.blocked([p.x, p.y]) && p.y < 300, `${movementMode} reached land: ${p.x},${p.y}`);
  }
});

// phase-1 follow-up: the sea floor is carved under the water plane (render Y = 0), so a landing that descends over the
// sea must stop at the water, not at the sea floor, before it is called off
const carvedSea = (depth = -5) => {
  const s = seaWorld(), { w, h, cell, data } = s.field;
  for (let j = 0; j < h; j++) if (j * cell > 1000) for (let i = 0; i < w; i++) data[j * w + i] = depth;
  return s;
};
const lowestOverWater = (p, s, input, max = 1200) => {
  const out = { events: [], low: Infinity };
  for (let i = 0; i < max && p.pending; i++) {
    out.events.push(...stepPlayer(p, input, s, DT).events);
    if (s.water.waterAt([p.x, p.y])) out.low = Math.min(out.low, p.h);
  }
  return out;
};

test('a landing called off over the sea never dips under the water plane (floor = max(ground, water level))', () => {
  const s = carvedSea(), p = flyingSouth(s, 'slowplane', -1000, 900);
  assert.ok(s.field.renderY(-1000, 2000) < -5, 'the sea floor lies under the water plane');
  assert.ok(setMode(p, 'walk', s).ok);
  const r = lowestOverWater(p, s, { x: 0, y: 1, camYaw: Math.PI, camMode: 'follow', target: null });
  assert.ok(r.events.includes('landing-cancelled') && !r.events.includes('landed'), r.events.join(','));
  assert.ok(r.low >= 0 && r.low < 3, `lowest over the sea ${r.low.toFixed(2)} m (water plane at 0)`);
  assert.equal(p.mode, 'slowplane'); assert.equal(p.pending, null);
});

test('waterSurface: the sea plane at 0, a lake at its carved shore level, null on dry land', () => {
  const s = seaWorld(), pond = s.water.waters.find((f) => f.tags.water === 'reservoir');
  const waterY = waterSurface(s.water, [{ feature: pond, level: 10 }]);
  assert.ok(Math.abs(waterY(0, 500) - (10 * 1.2 - 0.2)) < 1e-9, `pond ${waterY(0, 500)}`);
  assert.equal(waterY(0, 2000), 0);
  assert.equal(waterY(-1000, -500), null);
  assert.equal(waterSurface(s.water)(0, 500), 0, 'a water body without a carved level sits at the sea plane');
});

test('over a lake the descent floor is its water surface (services.waterY)', () => {
  const s = world(), pond = s.water.waters.find((f) => f.tags.water === 'reservoir'), { w, h, cell, data } = s.field;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (s.water.waterAt([i * cell, j * cell])) data[j * w + i] = 8.4;   // the carve: shore 10 - 1.6
  s.waterY = waterSurface(s.water, [{ feature: pond, level: 10 }]);
  const p = createPlayer({ x: 200, y: 500, mode: 'slowplane', movementMode: 'free' });
  p.alt = 60; p.speed = 20; p.pending = 'walk';   // a landing that drifted out over the pond
  const r = lowestOverWater(p, s, still);
  assert.ok(r.events.includes('landing-cancelled'), r.events.join(','));
  assert.ok(r.low >= 11.8 - 1e-6, `lowest over the pond ${r.low.toFixed(2)} (surface 11.8, floor ${s.field.renderY(200, 500).toFixed(2)})`);
});
