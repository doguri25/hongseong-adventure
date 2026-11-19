import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HeightField } from '../src/world/heightfield.js';
import { createCollider } from '../src/sim/collider.js';
import { buildRoadGraph } from '../src/sim/roadgraph.js';
import { Props, DEFAULT_BUDGET, lampBodyGeometry } from '../src/world/props.js';
import { QUALITY } from '../src/render/quality.js';
import { CX, CY } from '../src/frame.js';

const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
const bbox = (pts) => [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];

// a 12 km west-east tertiary at y = 5000 with a house every 150 m (so every kerb counts as urban), and a wood
const road = [[0, 5000], [12000, 5000]];
const houses = Array.from({ length: 80 }, (_, i) => rect(i * 150 + 20, 5020, i * 150 + 32, 5032));
const features = [
  { kind: 'road', tags: { highway: 'tertiary' }, points: road, holes: [], bounds: bbox(road) },
  { kind: 'landuse', tags: { natural: 'wood' }, points: rect(2000, 6200, 4000, 8000), holes: [], bounds: [2000, 6200, 4000, 8000] },
];
function make(budget) {
  const field = new HeightField({ w: 121, h: 101, cell: 100 }, new Float32Array(121 * 101).fill(10));
  const scene = new THREE.Scene();
  const props = new Props(scene, field, features, createCollider(houses), buildRoadGraph(features), budget);
  return { scene, props };
}
const render = (x, y) => ({ x: x - CX, z: y - CY });
const shownXY = (m) => { const a = [], m4 = new THREE.Matrix4(), v = new THREE.Vector3(); for (let i = 0; i < m.count; i++) { m.getMatrixAt(i, m4); v.setFromMatrixPosition(m4); a.push([v.x + CX, v.z + CY]); } return a; };

test('a lamp is about 108 triangles (was 484) and keeps its parts', () => {
  const g = lampBodyGeometry();
  assert.ok(tris(g) <= 130 && tris(g) >= 90, `lamp tris ${tris(g)}`);
  g.computeBoundingBox();
  assert.ok(g.boundingBox.max.y > 12 && g.boundingBox.max.z > 4, 'pole and arm reach out over the road');
});

test('trees keep their shapes without the caps no camera can see', () => {
  const { props } = make();
  assert.equal(tris(props.pine), 17);
  assert.equal(tris(props.broad), 90);
});

test('lamps are instanced only within the radius of the focus, refilled as it moves', () => {
  const { props } = make({ ...DEFAULT_BUDGET, lampRadius: 1000 });
  const L = props.lamps;
  assert.ok(L.count > 200, `lamp spots along 12 km: ${L.count}`);
  props.update(render(2000, 5400), undefined, render(2000, 5000));
  assert.ok(L.shown > 20 && L.shown < L.count / 3, `shown ${L.shown} of ${L.count}`);
  for (const m of [L.body, L.lens, L.pool]) assert.equal(m.count, L.shown);
  for (const [x, y] of shownXY(L.body)) assert.ok(Math.hypot(x - 2000, y - 5000) <= 1000 + 1e-3, `lamp at ${x},${y}`);
  const first = L.shown;
  props.update(render(2050, 5400), undefined, render(2050, 5000));   // a short move does not refill
  assert.deepEqual(L.at, [2000, 5000]);
  props.update(render(9000, 5400), undefined, render(9000, 5000));
  assert.deepEqual(L.at, [9000, 5000]);
  for (const [x] of shownXY(L.body)) assert.ok(Math.abs(x - 9000) <= 1000 + 1e-3);
  props.update(render(20000, 15000), undefined, render(20000, 15000));   // far from any road
  assert.equal(L.shown, 0);
  assert.ok(first > 0);
});

test('quality budgets: lamp radius and lamp shadows follow QUALITY, trees thin in place and rebuild on a raise', () => {
  assert.equal(QUALITY.high.props.lampShadow, true);
  assert.equal(QUALITY.medium.props.lampShadow, false);
  assert.equal(QUALITY.low.props.lampShadow, false);
  assert.ok(QUALITY.high.props.lampRadius >= QUALITY.medium.props.lampRadius && QUALITY.medium.props.lampRadius >= QUALITY.low.props.lampRadius);
  assert.ok(QUALITY.high.props.lampRadius >= 1500 && QUALITY.high.props.lampRadius <= 2000);
  const { props } = make(QUALITY.high.props);
  const at = render(3000, 6500);
  for (let i = 0; i < 40; i++) props.update(at, undefined, at);
  assert.equal(props.lamps.body.castShadow, true);
  const wood = props.chunks.get('1,3');
  assert.ok(wood && wood.count > 800, `wood chunk trees ${wood && wood.count}`);
  const highLamps = props.lamps.shown;
  props.update(at, QUALITY.low.props, at);
  assert.equal(props.lamps.body.castShadow, false);
  assert.ok(props.lamps.shown < highLamps, `low radius shows fewer lamps: ${props.lamps.shown} < ${highLamps}`);
  assert.equal(props.chunks.get('1,3'), wood, 'thinned in place, not rebuilt');
  assert.ok(wood.count <= QUALITY.low.props.treeCap + 2 && wood.count >= QUALITY.low.props.treeCap - 2, `thinned to ${wood.count}`);
  assert.equal(wood.meshes.reduce((s, m) => s + m.count, 0), wood.count);
  props.update(at, QUALITY.high.props, at);   // back up to the cap it was built at: restored in place
  assert.equal(props.chunks.get('1,3'), wood);
  assert.ok(wood.count > 800, `restored ${wood.count}`);
  // a chunk built at the low cap is rebuilt (one per update) when the cap rises above it
  const lowWorld = make(QUALITY.low.props).props;
  for (let i = 0; i < 40; i++) lowWorld.update(at, undefined, at);
  const thin = lowWorld.chunks.get('1,3');
  assert.ok(thin.count <= QUALITY.low.props.treeCap);
  lowWorld.update(at, QUALITY.high.props, at);
  for (let i = 0; i < 40; i++) lowWorld.update(at, undefined, at);
  const again = lowWorld.chunks.get('1,3');
  assert.ok(again !== thin && again.count > 800 && !again.stale, `rebuilt at the high cap: ${again.count}`);
});
