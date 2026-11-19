import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoadGraph } from '../src/sim/roadgraph.js';
import { createCollider } from '../src/sim/collider.js';
import { roadClearance } from '../src/sim/roads.js';
import { lampSpots, createForestDensity, createUrbanTest } from '../src/sim/lampspots.js';

const road = (points, highway = 'tertiary') => ({ kind: 'road', tags: { highway }, points });
const bounds = (pts) => [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
const poly = (kind, tags, points) => ({ kind, tags, points, holes: [], bounds: bounds(points) });
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const no = () => false, yes = () => true;

// west-east tertiary (half 5) crossing a north-south one at the origin; a building beside the road at x 300..312
const feats = [road([[-600, 0], [0, 0], [600, 0]]), road([[0, -400], [0, 0], [0, 400]])];
const building = rect(300, 6, 312, 16);
const run = (isForest = no) => lampSpots(buildRoadGraph(feats), createCollider([building]), no, yes, isForest);

test('lamps alternate kerbs, 38 m apart, 7.2 m off the centreline', () => {
  const s = run().filter((p) => Math.abs(p.y) < 20 && p.x > 30 && p.x < 280).sort((a, b) => a.x - b.x);
  assert.ok(s.length >= 5);
  for (const p of s) assert.ok(Math.abs(Math.abs(p.y) - 7.2) < 1e-6);
  for (let i = 1; i < s.length; i++) {
    assert.ok(Math.abs(s[i].x - s[i - 1].x - 38) < 1, 'spacing ' + (s[i].x - s[i - 1].x));
    assert.notEqual(Math.sign(s[i].y), Math.sign(s[i - 1].y));
  }
});

test('arm points back over the road', () => {
  for (const p of run().filter((q) => Math.abs(q.y) < 20)) {
    const dy = Math.cos(p.yaw), dx = Math.sin(p.yaw);
    assert.ok(Math.abs(dx) < 1e-6 && Math.sign(dy) === -Math.sign(p.y));
  }
});

test('nothing near the junction or the building', () => {
  const s = run();
  for (const p of s) {
    assert.ok(Math.hypot(p.x, p.y) >= 5 + 16, 'junction');
    const nx = Math.max(300 - p.x, 0, p.x - 312), ny = Math.max(6 - p.y, 0, p.y - 16);
    assert.ok(Math.hypot(nx, ny) >= 3, 'building pad');
  }
  const free = lampSpots(buildRoadGraph(feats), createCollider([]), no, yes, no);
  assert.ok(free.length > s.length, 'the building removed at least one spot');
});

test('water, non-urban and forest spots are dropped, main roads sort first', () => {
  const g = buildRoadGraph(feats), c = createCollider([]);
  assert.equal(lampSpots(g, c, yes, yes, no).length, 0);
  assert.equal(lampSpots(g, c, no, no, no).length, 0);
  assert.equal(lampSpots(g, c, no, yes, yes).length, 0);
  const mixed = buildRoadGraph([road([[0, 0], [400, 0]], 'residential'), road([[0, 500], [400, 500]], 'primary')]);
  const s = lampSpots(mixed, c, no, yes, no);
  assert.ok(s[0].y > 400 && s.at(-1).y < 100);
});

test('forestDensity: wood polygon, road, residential, slope mask', () => {
  const field = { heightAt: () => 5, slopeAt: () => 0 };
  const F = [
    poly('landuse', { natural: 'wood' }, rect(0, 0, 400, 400)),
    poly('landuse', { natural: 'scrub' }, rect(500, 0, 600, 100)),
    poly('landuse', { leisure: 'park' }, rect(700, 0, 800, 100)),
    poly('landuse', { landuse: 'residential' }, rect(100, 100, 200, 200)),
    road([[0, 300], [400, 300]], 'tertiary'),
  ];
  const d = createForestDensity(field, F, { clearance: roadClearance(F).clearance, collider: createCollider([]), isWater: no });
  assert.equal(d(50, 50), 1);
  assert.equal(d(550, 50), 0.6);
  assert.equal(d(750, 50), 0.27);
  assert.equal(d(150, 150), 0);
  assert.equal(d(250, 300), 0);
  assert.equal(d(250, 270), 1);
  assert.equal(d(1000, 1000), 0);
  const hill = createForestDensity({ heightAt: () => 100, slopeAt: () => 0 }, [], { clearance: () => 99, collider: createCollider([]), isWater: no });
  assert.equal(hill(5, 5), 1);
  assert.equal(createForestDensity(field, F, { clearance: () => 99, collider: createCollider([[[40, 40], [60, 40], [60, 60], [40, 60]]]), isWater: no })(50, 50), 0);
  assert.equal(createForestDensity(field, F, { clearance: () => 99, collider: createCollider([]), isWater: yes })(50, 50), 0);
});

test('urban reaches ~200 m from buildings', () => {
  const u = createUrbanTest([rect(1000, 1000, 1010, 1010)]);
  assert.ok(u(1100, 1000) && u(1005, 1180));
  assert.ok(!u(1500, 1000));
});
