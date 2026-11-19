import test from 'node:test';
import assert from 'node:assert/strict';
import { HeightField } from '../src/world/heightfield.js';
import { createCollider } from '../src/sim/collider.js';
import { buildRoadGraph } from '../src/sim/roadgraph.js';
import { WaterGuard } from '#game/water.js';
import { RoadNavigator } from '#game/navigation.js';
import { createPlayer, stepPlayer } from '../src/sim/player.js';
import { createTravel, startTrip, endTrip, accessLimit, tripStep, tripEnded, tripToast, landHint, FERRY_STOPPED, AT_ACCESS } from '../src/game/travel.js';

const place = (id, x, y, name = '장소' + id) => ({ id, name, point: [x, y] });
const school = place('school', 1000, 1000, '홍성초등학교');
const shop = place('shop', 500, 1000, '가게');
const park = place('park', 700, 1000, '3.1공원');

test('a trip remembers its target, its place and its kind; ending it drops everything and says what was dropped', () => {
  const t = createTravel();
  assert.deepEqual(t, { target: null, place: null, access: null, ferry: false });
  startTrip(t, [10, 20]);
  assert.deepEqual(t, { target: [10, 20], place: null, access: null, ferry: false });
  startTrip(t, school.point, { place: school });
  assert.deepEqual(t.target, [1000, 1000]);
  assert.equal(t.place, school);
  t.access = [990, 900];
  startTrip(t, [5, 5], { ferry: true });   // a new trip replaces the old one, its access point too
  assert.deepEqual(t, { target: [5, 5], place: null, access: null, ferry: true });
  assert.deepEqual(endTrip(t), { place: null, access: null, ferry: true });
  assert.deepEqual(t, { target: null, place: null, access: null, ferry: false });
  assert.deepEqual(endTrip(t), { place: null, access: null, ferry: false }, 'nothing to end');
  // with the player: a new trip plans afresh (the old access point and a car's route go); the end drops the road route
  const player = { route: [[1, 1]], routeKey: '1,1', routeAccess: [1, 1], car: { goal: {}, route: [1] } };
  startTrip(t, [7, 7], {}, player);
  assert.deepEqual([player.routeAccess, player.car.goal, player.car.route], [null, null, null]);
  endTrip(t, player);
  assert.deepEqual([player.route, player.routeKey, player.routeAccess], [null, null, null]);
});

test('a road route to a place may end 350 m from it, to a tapped point 800 m (2D walkTo id ? 350 : 800)', () => {
  const t = createTravel();
  startTrip(t, [1, 1]);
  assert.equal(accessLimit(t), 800);
  startTrip(t, school.point, { place: school });
  assert.equal(accessLimit(t), 350);
  startTrip(t, [1, 1], { ferry: true });
  assert.equal(accessLimit(t), 800);
});

// 2D world.js l.82: while routePlace is set, only that place opens; the others entered on the way stay held
test('pass-by: a guided trip opens only its own place; the places passed on the way open nothing and the trip goes on', () => {
  const t = createTravel();
  startTrip(t, school.point, { place: school });
  let r = tripStep(t, { entered: [shop, park], at: [600, 1000] });
  assert.deepEqual(r.open, []);
  assert.equal(r.ended, false);
  assert.equal(t.place, school, 'still heading for the school');
  r = tripStep(t, { entered: [park, school], at: [960, 1000] });
  assert.deepEqual(r.open, [school], 'the route place opens, even with another place in the same step');
  assert.equal(r.hold, false, 'arrivals() already held it');
  assert.equal(r.ended, true);
  assert.equal(t.target, null);
});

test('a ground tap (no place) opens every place entered, as before', () => {
  const t = createTravel();
  startTrip(t, [2000, 1000]);
  const r = tripStep(t, { entered: [shop, park], at: [600, 1000] });
  assert.deepEqual(r.open, [shop, park]);
  assert.equal(r.ended, false);
  const none = createTravel();
  assert.deepEqual(tripStep(none, { entered: [shop], at: [0, 0] }).open, [shop], 'no trip at all: arrivals open');
  startTrip(t, [2000, 1000]);
  const end = tripStep(t, { entered: [], ended: true, at: [1995, 1000] });
  assert.deepEqual(end.open, []);
  assert.equal(end.ended, true);
  assert.equal(t.target, null);
});

// 2D world.js l.83: at the route end, open the place when it is in reach or the explorer stands on the access point
test('route end: the place opens (with a hold) in reach or on the access point, else the trip just ends', () => {
  const t = createTravel();
  startTrip(t, school.point, { place: school });
  tripStep(t, { entered: [], at: [0, 0], access: [995, 910] });   // the road route was planned: its access point
  assert.deepEqual(t.access, [995, 910]);
  let r = tripStep(t, { entered: [], ended: true, at: [995.5, 911], reach: () => false });
  assert.deepEqual(r.open, [school]);
  assert.equal(r.hold, true, 'not entered: hold the places in reach before the visit (2D openPlace)');
  assert.equal(r.ended, true);
  assert.equal(t.place, null);

  startTrip(t, school.point, { place: school });
  tripStep(t, { at: [0, 0], access: [995, 910] });
  r = tripStep(t, { ended: true, at: [995, 910 - AT_ACCESS - 0.1], reach: () => false });
  assert.deepEqual(r.open, [], 'stopped short of the access point (water, say): nothing opens');
  assert.equal(r.ended, true);

  startTrip(t, school.point, { place: school });
  r = tripStep(t, { ended: true, at: [900, 900], reach: (p) => p === school });
  assert.deepEqual(r.open, [school], 'in reach (2D canVisit, car reach, wall contact)');
  assert.equal(r.hold, true);

  startTrip(t, school.point, { place: school });
  r = tripStep(t, { ended: false, at: [995, 910], access: [995, 910], reach: () => true });
  assert.deepEqual(r.open, [], 'not at the end yet: nothing opens early');
  assert.equal(t.place, school);
});

test('a flight to a place ends over it with the hint to land (arrivals never fire in the air)', () => {
  const t = createTravel();
  startTrip(t, school.point, { place: school });
  const r = tripStep(t, { ended: true, at: [1000, 1005], flying: true, reach: () => true });
  assert.deepEqual(r.open, []);
  assert.equal(r.note, landHint(school));
  assert.ok(r.note.includes('홍성초등학교') && r.note.includes('내려서 탐방'));
  assert.equal(r.ended, true);
  startTrip(t, [3, 3]);
  assert.equal(tripStep(t, { ended: true, at: [3, 3], flying: true }).note, null, 'a tapped point: no hint');
});

// 2D ferryPending: nothing opens on the way to the pier; at the end the ferry dialog opens there, else the child is told
test('the trip to the pier opens nothing on the way, the ferry at the pier, and says so when it ends away from it', () => {
  const t = createTravel();
  startTrip(t, [0, 0], { ferry: true });
  let r = tripStep(t, { entered: [shop], at: [300, 0] });
  assert.deepEqual(r.open, []);
  assert.equal(r.ferry, false);
  r = tripStep(t, { ended: true, at: [2, 0], nearPier: true });
  assert.equal(r.ferry, true);
  assert.equal(r.note, null);
  assert.equal(r.ended, true);
  assert.equal(t.ferry, false);
  startTrip(t, [0, 0], { ferry: true });
  r = tripStep(t, { ended: true, at: [900, 0], nearPier: false });
  assert.equal(r.ferry, false);
  assert.equal(r.note, FERRY_STOPPED);
  assert.ok(FERRY_STOPPED.includes('배 타고 죽도로'), 'names the HUD button to press at the pier');
});

test('the trip toast is the 2D navigate wording, told for the 3D vehicles', () => {
  const walker = (movementMode) => ({ mode: 'walk', movementMode });
  assert.equal(tripToast(school, walker('roads')), '홍성초등학교 근처 길까지 따라가요. 멀면 탈것을 바꾸어 보세요.');
  assert.equal(tripToast(school, { mode: 'car', movementMode: 'free' }), '홍성초등학교 근처 길까지 따라가요. 멀면 탈것을 바꾸어 보세요.', 'a car keeps to its roads');
  assert.equal(tripToast(school, { mode: 'plane', movementMode: 'roads' }), '홍성초등학교를 향해 날아가요. 멀면 탈것을 바꾸어 보세요.');
  assert.equal(tripToast(park, walker('free')), '3.1공원을 향해 이동해요. 멀면 탈것을 바꾸어 보세요.');
});

test('tripEnded: within 12 m on foot, a road route run out or stopped by water, a plane over the spot, a car arrived', () => {
  const t = createTravel(), at = (x, extra = {}) => ({ x, y: 1000, mode: 'walk', movementMode: 'free', speed: 0, routeKey: null, route: null, ...extra });
  assert.equal(tripEnded(t, at(1000), []), false, 'no trip');
  startTrip(t, school.point, { place: school });
  assert.equal(tripEnded(t, at(989), []), true);
  assert.equal(tripEnded(t, at(980), []), false);
  assert.equal(tripEnded(t, at(900, { mode: 'bike', movementMode: 'roads', routeKey: 'k', route: [] }), []), true, 'the road route ran out');
  assert.equal(tripEnded(t, at(900, { movementMode: 'roads', routeKey: 'k', route: null }), []), true, 'stopped by water');
  assert.equal(tripEnded(t, at(900, { movementMode: 'roads', routeKey: 'k', route: [[950, 1000]] }), []), false, 'still walking');
  assert.equal(tripEnded(t, at(900, { movementMode: 'roads' }), []), false, 'not planned yet');
  assert.equal(tripEnded(t, at(900, { mode: 'plane', speed: 100 }), []), false, '100 m short at 100 m/s: it stops within 60 m');
  assert.equal(tripEnded(t, at(970, { mode: 'slowplane', speed: 50 }), []), true, '30 m short at 50 m/s: within speed x 0.4 + 20 = 40 m');
  assert.equal(tripEnded(t, at(500, { mode: 'car' }), []), false);
  assert.equal(tripEnded(t, at(500, { mode: 'car' }), ['arrived']), true);
});

// phase 2a final review: a second 길 안내 press for the same place kept the old route (same routeKey), so it never replanned
test('a repeated guided press for the same place replans and still opens the place at the route end', () => {
  const road = [[-600, 0], [0, 0], [600, 0]];
  const features = [{ kind: 'road', tags: { highway: 'tertiary' }, points: road, holes: [], bounds: [-600, 0, 600, 0] }];
  const s = {
    field: new HeightField({ w: 241, h: 241, cell: 25 }, new Float32Array(241 * 241).fill(10)), bounds: [-3000, -3000, 3000, 3000],
    collider: createCollider([]), graph: buildRoadGraph(features), water: new WaterGuard(features), navigator: new RoadNavigator(features),
  };
  const p = createPlayer({ x: -200, y: 0, movementMode: 'roads' }), t = createTravel();
  const cafe = place('cafe', 300, 200, '카페');   // 200 m off the road
  const step = () => {
    const { events } = stepPlayer(p, { x: 0, y: 0, camYaw: 0, camMode: 'tilt', target: t.target, maxAccess: accessLimit(t) }, s, 1 / 30);
    return tripStep(t, { ended: tripEnded(t, p, events), at: [p.x, p.y], access: p.routeAccess, reach: () => false });
  };
  startTrip(t, cafe.point, { place: cafe }, p);
  for (let i = 0; i < 60; i++) step();
  assert.ok(p.x > -200 && p.routeAccess, 'walking the first route');
  startTrip(t, cafe.point, { place: cafe }, p);   // the same press again
  assert.equal(p.route, null); assert.equal(p.routeKey, null);
  let r = null;
  for (let i = 0; i < 600 && !(r = step()).ended; i++);
  assert.deepEqual(r.open, [cafe]);
  assert.ok(r.hold);
});
