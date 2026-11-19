import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mapTransform, zoomAbout, panBy, fitView, pinsAt, districtList, labelPoint, ZOOM_MIN, ZOOM_MAX, MAP_PAD } from '../src/ui/county-map.js';
import { project } from '../src/frame.js';
import { inGeometry } from '#game/geography.js';
import { PLACES } from '#game/content.js';

const world = { w: 34823, h: 26717 };   // about the game frame's extent, in metres
const view = (o = {}) => ({ world, zoom: 1, center: [world.w / 2, world.h / 2], ...o });
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const SIZES = [[800, 500], [366, 380], [420, 340], [1000, 700]];
// the map's rectangle on screen
const rect = (t) => ({ left: t.ox, top: t.oy, right: t.ox + world.w * t.scale, bottom: t.oy + world.h * t.scale });

test('mapTransform clamps the zoom to 1-10', () => {
  assert.equal(ZOOM_MIN, 1); assert.equal(ZOOM_MAX, 10);
  assert.equal(mapTransform(view({ zoom: 0.2 }), 800, 500).zoom, 1);
  assert.equal(mapTransform(view({ zoom: 25 }), 800, 500).zoom, 10);
  assert.equal(mapTransform(view({ zoom: 3.5 }), 800, 500).zoom, 3.5);
  assert.equal(mapTransform(view({ zoom: NaN }), 800, 500).zoom, 1);
  const a = mapTransform(view({ zoom: 1 }), 800, 500), b = mapTransform(view({ zoom: 4 }), 800, 500);
  near(b.scale, a.scale * 4);
});

test('at zoom 1 the whole county fits inside the canvas, centred, however far it was dragged', () => {
  for (const [w, h] of SIZES) for (const center of [[world.w / 2, world.h / 2], [-5e5, 9e5], [world.w, 0]]) {
    const r = rect(mapTransform(view({ center }), w, h));
    assert.ok(r.left >= MAP_PAD - 1e-6 && r.top >= MAP_PAD - 1e-6 && r.right <= w - MAP_PAD + 1e-6 && r.bottom <= h - MAP_PAD + 1e-6, `${w}x${h} ${JSON.stringify(r)}`);
    near((r.left + r.right) / 2, w / 2); near((r.top + r.bottom) / 2, h / 2);
  }
});

test('zoomed in, the pan is clamped so the map keeps covering the canvas (no more than the margin left bare)', () => {
  for (const [w, h] of SIZES) for (const zoom of [2, 3.7, 10]) for (const center of [[-1e6, -1e6], [1e6, 1e6], [0, world.h], [world.w / 3, world.h / 2]]) {
    const t = mapTransform(view({ zoom, center }), w, h), r = rect(t);
    const mw = world.w * t.scale, mh = world.h * t.scale;
    if (mw >= w - 2 * MAP_PAD) assert.ok(r.left <= MAP_PAD + 1e-6 && r.right >= w - MAP_PAD - 1e-6, `x ${w}x${h} z${zoom} ${JSON.stringify(r)}`);
    else near((r.left + r.right) / 2, w / 2);
    if (mh >= h - 2 * MAP_PAD) assert.ok(r.top <= MAP_PAD + 1e-6 && r.bottom >= h - MAP_PAD - 1e-6, `y ${w}x${h} z${zoom} ${JSON.stringify(r)}`);
    else near((r.top + r.bottom) / 2, h / 2);
    // the clamped centre is what the transform shows in the middle of the canvas
    const mid = t.toMap([w / 2, h / 2]);
    near(mid[0], t.view.center[0], 1e-6); near(mid[1], t.view.center[1], 1e-6);
  }
});

test('screen <-> map: toMap undoes toScreen at any zoom and pan; an unclamped centre sits in the middle', () => {
  for (const [w, h] of SIZES) for (const zoom of [1, 2.5, 10]) {
    const t = mapTransform(view({ zoom, center: [world.w * 0.4, world.h * 0.55] }), w, h);
    for (const p of [[0, 0], [world.w, world.h], [12345.6, 7890.1], [world.w * 0.4, world.h * 0.55]]) {
      const back = t.toMap(t.toScreen(p));
      near(back[0], p[0], 1e-6); near(back[1], p[1], 1e-6);
    }
    for (const s of [[0, 0], [w, h], [w * 0.3, h * 0.8]]) {
      const back = t.toScreen(t.toMap(s));
      near(back[0], s[0], 1e-6); near(back[1], s[1], 1e-6);
    }
  }
  const t = mapTransform(view({ zoom: 4, center: [world.w * 0.4, world.h * 0.55] }), 800, 500);
  const c = t.toScreen([world.w * 0.4, world.h * 0.55]);
  near(c[0], 400); near(c[1], 250);
});

test('zoomAbout keeps the map point under the finger or cursor, within the zoom limits', () => {
  const w = 800, h = 500, at = [610, 140];
  const before = mapTransform(view({ zoom: 2, center: [world.w * 0.6, world.h * 0.4] }), w, h);
  const m = before.toMap(at);
  const next = zoomAbout(before.view, 1.5, at, w, h), t = mapTransform(next, w, h);
  near(t.zoom, 3);
  const s = t.toScreen(m);
  near(s[0], at[0], 1e-6); near(s[1], at[1], 1e-6);
  assert.equal(mapTransform(zoomAbout(next, 100, at, w, h), w, h).zoom, 10);
  assert.equal(mapTransform(zoomAbout(next, 0.001, at, w, h), w, h).zoom, 1);
});

test('panBy moves the map with the drag, then clamps', () => {
  const w = 800, h = 500, v = view({ zoom: 3, center: [world.w / 2, world.h / 2] });
  const t0 = mapTransform(v, w, h), p = [world.w / 2 + 100, world.h / 2 + 50], s0 = t0.toScreen(p);
  const t1 = mapTransform(panBy(v, 40, -25, w, h), w, h), s1 = t1.toScreen(p);
  near(s1[0], s0[0] + 40); near(s1[1], s0[1] - 25);
  const far = mapTransform(panBy(v, 1e6, 1e6, w, h), w, h), r = rect(far);
  assert.ok(r.left <= MAP_PAD + 1e-6 && r.top <= MAP_PAD + 1e-6, JSON.stringify(r));
});

test('fitView frames a district (its bounds in metres) inside the canvas', () => {
  const w = 800, h = 500, b = [20000, 5000, 24000, 8000];
  const t = mapTransform(fitView(b, world, w, h), w, h);
  const a = t.toScreen([b[0], b[1]]), z = t.toScreen([b[2], b[3]]);
  assert.ok(a[0] >= MAP_PAD - 1 && a[1] >= MAP_PAD - 1 && z[0] <= w - MAP_PAD + 1 && z[1] <= h - MAP_PAD + 1, `${a} ${z}`);
  assert.ok(t.zoom > 3 && t.zoom <= 10, `zoom ${t.zoom}`);
  assert.equal(mapTransform(fitView([100, 100, 101, 101], world, w, h), w, h).zoom, 10, 'a tiny box stops at the zoom limit');
});

test('pinsAt: the pins within 16 px of a tap, nearest first; none when the tap is clear', () => {
  const pins = [{ p: { id: 'a' }, x: 100, y: 100 }, { p: { id: 'b' }, x: 110, y: 104 }, { p: { id: 'c' }, x: 200, y: 200 }, { p: { id: 'd' }, x: 115.9, y: 100 }];
  assert.deepEqual(pinsAt(pins, 108, 102).map((p) => p.id), ['b', 'd', 'a']);
  assert.deepEqual(pinsAt(pins, 100, 100).map((p) => p.id), ['a', 'b', 'd']);
  assert.deepEqual(pinsAt(pins, 150, 150), []);
  assert.deepEqual(pinsAt(pins, 200, 215.9).map((p) => p.id), ['c']);
  assert.deepEqual(pinsAt(pins, 200, 216.1), []);
});

const districts = JSON.parse(readFileSync(new URL('../public/data/world.json', import.meta.url), 'utf8')).districts;
const hongseong = districts.filter((d) => d.county === '홍성군');

test('districtList: the 11 홍성군 districts with the 2D place counts (mapped places in that area)', () => {
  const list = districtList(districts, PLACES.filter((p) => !p.remote));
  assert.equal(list.length, 11);
  assert.deepEqual(list.map((d) => d.name), ['홍성읍', '광천읍', '홍북읍', '금마면', '홍동면', '장곡면', '은하면', '결성면', '서부면', '갈산면', '구항면']);
  for (const d of list) {
    assert.equal(d.area, `홍성군 ${d.name}`);
    assert.equal(d.count, PLACES.filter((p) => p.area === d.area && !p.remote).length, d.name);
    assert.equal(d.label, `${d.name} · ${d.count}곳`);
    assert.ok(d.bounds[2] > d.bounds[0] && d.bounds[3] > d.bounds[1], 'bounds in metres');
  }
  assert.equal(list.find((d) => d.name === '홍성읍').count, 58);
});

test('labelPoint: every district name sits inside its own district', () => {
  for (const d of hongseong) {
    const [x, y] = labelPoint(d.geometry);
    const lonLat = [126.4 + x / (111320 * Math.cos((36.69 * Math.PI) / 180)), 36.69 - y / 111320];
    assert.ok(inGeometry(lonLat, d.geometry), d.name);
    const [px, py] = project(lonLat);
    near(px, x, 1e-6); near(py, y, 1e-6);
  }
});
