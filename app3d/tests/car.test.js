import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoadGraph } from '../src/sim/roadgraph.js';
import { createCar, driveCar } from '../src/sim/car.js';

const DT = 1 / 30, HALF = Math.PI / 2;
const road = (points, extra = {}, highway = 'tertiary') => ({ kind: 'road', tags: { highway, ...extra }, points });
const idle = { throttle: 0, turn: null, stickHeading: null, target: null };
const wrap = a => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
function run(car, input, n, speedMax = 100, bounds) {
  let out;
  const events = [];
  for (let i = 0; i < n; i++) { out = driveCar(car, input, speedMax, DT, bounds); events.push(...out.events); }
  return { out, events };
}
// a + junction at the origin: west-east and north-south ways sharing a vertex
const plus = () => [road([[-300, 0], [0, 0], [300, 0]]), road([[0, -300], [0, 0], [0, 300]])];

test('keeps to the right lane through a curve', () => {
  const R = 300, pts = [];
  for (let i = 0; i <= 45; i++) { const a = i / 45 * HALF; pts.push([R * Math.sin(a) - R * 0, R * (1 - Math.cos(a)) * -1 + 0]); }
  // arc starting at origin heading east, curving north (y decreasing)
  const g = buildRoadGraph([road(pts)]);
  const car = createCar(g, pts[0][0] + 1, pts[0][1], HALF);
  let worst = 0, best = 99;
  for (let i = 0; i < 400; i++) {
    const o = driveCar(car, { ...idle, throttle: 1 }, 60, DT);
    if (i < 40 || car.speed < 1) continue;
    let d = 1e9;
    for (let k = 1; k < pts.length; k++) {
      const [ax, ay] = pts[k - 1], [bx, by] = pts[k], dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
      const t = Math.max(0, Math.min(1, ((o.x - ax) * dx + (o.y - ay) * dy) / l));
      d = Math.min(d, Math.hypot(o.x - ax - dx * t, o.y - ay - dy * t));
    }
    worst = Math.max(worst, d); best = Math.min(best, d);
  }
  assert.ok(worst <= 5.05, `worst ${worst}`);
  assert.ok(best >= 2.2 && worst <= 2.8 + 0.3, `lane ${best}..${worst}`);
});

test('booked right turn is taken at the junction', () => {
  const g = buildRoadGraph(plus());
  const car = createCar(g, -150, 0, HALF);
  run(car, { ...idle, throttle: 1, turn: 'right' }, 1);
  const { out } = run(car, { ...idle, throttle: 1 }, 200);
  const dh = wrap(out.heading - HALF);
  assert.ok(Math.abs(dh - HALF) < 0.35, `turned ${dh}`);
  assert.ok(out.y > 20, 'ended up south of the junction');
});

test('booked left turn survives a junction with no left', () => {
  // T at x=0 with only a south arm; a second junction at x=300 offers a north arm
  const g = buildRoadGraph([road([[-300, 0], [0, 0], [300, 0], [600, 0]]), road([[0, 0], [0, 300]]), road([[300, 0], [300, -300]])]);
  const car = createCar(g, -150, 0, HALF);
  run(car, { ...idle, throttle: 1, turn: 'left' }, 1);
  let hint = null;
  for (let i = 0; i < 160; i++) { const o = driveCar(car, { ...idle, throttle: 1 }, 100, DT); if (car.x > 60 && car.x < 200) hint = o.hint; }
  assert.equal(hint, 'left', 'still booked after the T');
  const { out } = run(car, { ...idle, throttle: 1 }, 220);
  assert.ok(out.y < -30, 'went up the north arm');
  assert.ok(Math.abs(wrap(out.heading - HALF) + HALF) < 0.35);
});

test('holding brake at a standstill turns round once', () => {
  const g = buildRoadGraph(plus());
  const car = createCar(g, -150, 0, HALF);
  const d0 = car.dir;
  const { events } = run(car, { ...idle, throttle: -1 }, 90);
  assert.equal(events.filter(e => e === 'uturn').length, 1);
  assert.equal(car.dir, -d0);
  run(car, idle, 3);
  const r = run(car, { ...idle, throttle: -1 }, 60);
  assert.equal(r.events.filter(e => e === 'uturn').length, 1, 're-armed after release');
});

test('route reaches a target two junctions away', () => {
  const g = buildRoadGraph([road([[-300, 0], [0, 0], [300, 0], [600, 0]]), road([[0, -300], [0, 0], [0, 300]]), road([[300, -300], [300, 0], [300, 300]])]);
  const car = createCar(g, -150, 0, HALF);
  const input = { ...idle, target: [300, 150] };
  const { out, events } = run(car, input, 1500, 100);
  assert.ok(events.includes('arrived'), 'arrived');
  assert.ok(Math.hypot(out.x - 300, out.y - 150) < 8, `at ${out.x},${out.y}`);
  assert.ok(out.speed < 1);
});

test('prefers the legal direction of a one-way', () => {
  const g = buildRoadGraph([
    road([[-300, 0], [0, 0]]),
    road([[0, 0], [200, -20]], { oneway: 'yes' }),   // legal, slightly off straight
    road([[0, 0], [200, 5]], { oneway: '-1' }),      // straighter but against its direction
  ]);
  const car = createCar(g, -100, 0, HALF);
  const { out } = run(car, { ...idle, throttle: 1 }, 150, 80);
  assert.ok(out.y < -5, `took the legal branch, y=${out.y}`);
});

test('dead end stops with an event; map edge stops too', () => {
  const g = buildRoadGraph([road([[0, 0], [200, 0]])]);
  const car = createCar(g, 10, 0, HALF);
  const { out, events } = run(car, { ...idle, throttle: 1 }, 200, 80);
  assert.ok(events.includes('dead-end'));
  assert.ok(out.speed < 0.5 && out.x <= 200.5);
  const car2 = createCar(g, 10, 0, HALF);
  const r = run(car2, { ...idle, throttle: 1 }, 200, 80, [-50, -50, 100, 50]);
  assert.ok(r.events.includes('map-edge'));
  assert.ok(r.out.x <= 101);
});

test('carNeedsRoad: createCar returns null 700 m from any road', () => {
  const g = buildRoadGraph(plus());
  assert.equal(createCar(g, 0, 700 + 300, 0), null);
  assert.equal(createCar(g, 900, 900, 0, 600), null);
  assert.ok(createCar(g, 0, 900, 0, 700));
  assert.ok(createCar(g, 20, 20, 0));
});

test('graph skips footways and shares nodes at 0.5 m', () => {
  const g = buildRoadGraph([...plus(), road([[0, 0], [50, 50]], {}, 'footway')]);
  assert.equal(g.edges.length, 4);
  assert.equal(g.nodes.size, 5);
  assert.equal(g.edges[0].way, 0);
});
