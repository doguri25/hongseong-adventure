import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSession, saveSession, startPosition, restoreTravel, resetSession } from '../src/game/session.js';
import { startVoyage, advanceVoyage } from '../src/game/ferry.js';
import { createCollider } from '../src/sim/collider.js';
import { WaterGuard } from '#game/water.js';
import { freshState, discover, sanitizeState, STORAGE_KEY } from '#game/core.js';
import { project, unproject, BOUNDS } from '../src/frame.js';

const fakeStorage = () => { const m = new Map(); return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)) }; };
const KEY3D = 'hongseong-3d-v1';
const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const poly = (r) => ({ tags: { natural: 'water', water: 'sea' }, points: r, holes: [], bounds: [Math.min(...r.map(p => p[0])), Math.min(...r.map(p => p[1])), Math.max(...r.map(p => p[0])), Math.max(...r.map(p => p[1]))] });

test('round trip keeps coins and discovered places', () => {
  const st = fakeStorage(), state = freshState();
  assert.ok(discover(state, 'library'));
  const coins = state.coins;
  assert.ok(coins > 0);
  saveSession(st, state, { camera: 'follow', time: 'night', quality: 'low', travel: null }, { x: 24000, y: 3700, mode: 'walk' });
  const back = loadSession(st);
  assert.deepEqual(back.state.discovered, ['library']);
  assert.equal(back.state.coins, coins);
  assert.deepEqual(back.extra, { camera: 'follow', time: 'night', quality: 'low', travel: 'walk' });
  const [lon, lat] = back.state.locations.county, [x, y] = project([lon, lat]);
  assert.ok(Math.hypot(x - 24000, y - 3700) < 0.01);
  assert.deepEqual(back.state.position, [24000, 3700]);
});

test('missing or broken storage gives fresh state and default extras', () => {
  const a = loadSession(fakeStorage());
  assert.equal(a.state.version, 1);
  assert.deepEqual(a.extra, { camera: 'tilt', time: 'day', quality: 'auto', travel: null });
  const st = fakeStorage(); st.setItem(STORAGE_KEY, '{nope'); st.setItem(KEY3D, '[1');
  assert.equal(loadSession(st).state.discovered.length, 0);
  assert.equal(loadSession({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }).extra.camera, 'tilt');
  const bad = fakeStorage(); bad.setItem(KEY3D, JSON.stringify({ camera: 'x', time: 9, quality: 'ultra', travel: 'rocket' }));
  assert.deepEqual(loadSession(bad).extra, { camera: 'tilt', time: 'day', quality: 'auto', travel: null });
  assert.equal(saveSession({ setItem() { throw new Error('full'); }, getItem() { return null; } }, freshState(), {}, { x: 0, y: 0, mode: 'walk' }), false);
});

test('travelSpeed mapping and the real mode in extra.travel', () => {
  const want = { walk: 'walk', bike: 'bike', car: 'fast', supercar: 'faster', slowplane: 'plane', plane: 'plane' };
  for (const [mode, speed] of Object.entries(want)) {
    const st = fakeStorage(), state = freshState();
    saveSession(st, state, {}, { x: 100, y: 100, mode });
    assert.equal(JSON.parse(st.getItem(STORAGE_KEY)).travelSpeed, speed, mode);
    assert.equal(JSON.parse(st.getItem(KEY3D)).travel, mode, mode);
  }
  const st = fakeStorage(); saveSession(st, freshState(), {}, { x: 1, y: 1, mode: 'slowplane' });
  const back = loadSession(st);
  assert.equal(back.state.travelSpeed, 'plane');
  assert.equal(back.extra.travel, 'slowplane');
});

test('a voyage saves the departure dock and leaves the mode alone', () => {
  const st = fakeStorage(), state = freshState();
  saveSession(st, state, { travel: 'car' }, { x: 100, y: 100, mode: 'car' });
  const dock = [20000, 9000], v = { start: dock, end: [20500, 9000] };
  saveSession(st, state, { travel: 'car' }, { x: 20250, y: 9000, mode: 'boat' }, v);
  const back = loadSession(st), [x, y] = project(back.state.locations.county);
  assert.ok(Math.hypot(x - dock[0], y - dock[1]) < 0.01);
  assert.equal(back.state.travelSpeed, 'fast');
  assert.equal(back.extra.travel, 'car');
});

test('startPositionIsSafe: sea, inside a building and outside the bounds all end on dry, open, in-bounds land', () => {
  const [w, s, e, n] = BOUNDS, [minX, minY] = project([w, n]), [maxX, maxY] = project([e, s]);
  const sea = poly(box(minX - 500, 8000, 12000, 12000));              // sea west of x 12000, south of y 8000
  const water = new WaterGuard([sea]);
  const ring = box(15000, 5000, 15200, 5200), collider = createCollider([ring]);
  const start = [24207, 3772.6], services = { water, collider, bounds: BOUNDS, start };
  const safe = ([x, y]) => !water.blocked([x, y]) && !collider.blocked(x, y) && x >= minX && x <= maxX && y >= minY && y <= maxY;
  const cases = {
    sea: [8000, 10000], shore: [11800, 9000], building: [15100, 5100], 'outside east': [maxX + 5000, 6000], 'outside north': [18000, minY - 3000],
    'sea + outside': [minX - 100, 11000], nan: [NaN, 5],
  };
  for (const [name, p] of Object.entries(cases)) {
    const state = freshState(); state.locations.county = unproject(p);
    if (name === 'nan') state.locations.county = null;
    const out = startPosition(state, services);
    assert.ok(safe(out), `${name} -> ${out}`);
    if (name === 'shore') assert.ok(Math.hypot(out[0] - p[0], out[1] - p[1]) < 400, 'moved only to the nearest shore: ' + out);
  }
  const ok = freshState(); ok.locations.county = unproject([18000, 6000]);
  const same = startPosition(ok, services);
  assert.ok(Math.hypot(same[0] - 18000, same[1] - 6000) < 0.5);
  assert.deepEqual(startPosition(freshState(), services).map(Math.round), start.map(Math.round));
});

test('voyage reaches the far dock at t=8 s, heading along the crossing', () => {
  const docks = { namdang: [1000, 5000], jukdo: [1000, 1000] };
  const out = startVoyage(false, docks), back = startVoyage(true, docks);
  assert.deepEqual(out.start, docks.namdang); assert.deepEqual(out.end, docks.jukdo);
  assert.deepEqual(back.start, docks.jukdo); assert.deepEqual(back.end, docks.namdang);
  let r = advanceVoyage(out, 4);
  assert.deepEqual([r.x, r.y, r.done], [1000, 3000, false]);
  assert.ok(Math.abs(r.heading) < 1e-9, 'north is heading 0');
  for (let i = 0; i < 40; i++) r = advanceVoyage(out, 0.1);
  assert.equal(r.done, true);
  assert.ok(Math.hypot(r.x - 1000, r.y - 1000) < 1e-6);
  const e = startVoyage(false, { namdang: [0, 0], jukdo: [100, 0] });
  assert.ok(Math.abs(advanceVoyage(e, 1).heading - Math.PI / 2) < 1e-9, 'east is pi/2');
  assert.equal(advanceVoyage(startVoyage(false, docks), 100).done, true);
});

test('restoreTravel: a travel mode changed in the 2D game wins over the stale 3D one', () => {
  const st = fakeStorage(), state = freshState();
  saveSession(st, state, { travel: 'car' }, { x: 24000, y: 3700, mode: 'car' });   // the 3D last ran as a car
  assert.equal(restoreTravel(...Object.values(loadSession(st))), 'car');
  // the 2D game then switches to the bike and writes its own save (as dist/game.js does: JSON of its sanitized state)
  const twoD = sanitizeState(JSON.parse(st.getItem(STORAGE_KEY)));
  twoD.travelSpeed = 'bike';
  st.setItem(STORAGE_KEY, JSON.stringify(twoD));
  const back = loadSession(st);
  assert.equal(back.extra.travel, 'car', 'the 3D-only value is still the old one');
  assert.equal(restoreTravel(back.state, back.extra), 'bike');
  // a 2D save with no 3D values at all
  for (const [speed, mode] of [['walk', 'walk'], ['bike', 'bike'], ['fast', 'car'], ['faster', 'supercar'], ['plane', 'plane']]) {
    const only2d = fakeStorage(), s2 = freshState(); s2.travelSpeed = speed;
    only2d.setItem(STORAGE_KEY, JSON.stringify(s2));
    const b = loadSession(only2d);
    assert.equal(restoreTravel(b.state, b.extra), mode, speed);
  }
  // the 3D value refines a shared one: both planes save 'plane'
  assert.equal(restoreTravel({ travelSpeed: 'plane' }, { travel: 'slowplane' }), 'slowplane');
  assert.equal(restoreTravel({ travelSpeed: 'plane' }, { travel: 'plane' }), 'plane');
  assert.equal(restoreTravel({ travelSpeed: 'faster' }, { travel: 'supercar' }), 'supercar');
  assert.equal(restoreTravel({ travelSpeed: 'walk' }, { travel: 'slowplane' }), 'walk');
  assert.equal(restoreTravel({ travelSpeed: 'nope' }, { travel: null }), 'walk');
  assert.equal(restoreTravel(null, null), 'walk');
});

test('resetSession: the 2D reset (fresh shared save, no position) keeping the 3D camera, time and quality', () => {
  const st = fakeStorage(), state = freshState();
  assert.ok(discover(state, 'library'));
  state.owned.push('star-stamp'); state.equipped.stamp = 'star'; state.character = 'raccoon'; state.note = '메모';
  saveSession(st, state, { camera: 'follow', time: 'night', quality: 'low' }, { x: 24000, y: 3700, mode: 'car' });
  st.setItem('hongseong-hud-v1', JSON.stringify({ portrait: true }));
  assert.equal(resetSession(st, { camera: 'follow', time: 'dusk', quality: 'medium', travel: 'car' }), true);
  const back = loadSession(st), fresh = freshState();
  assert.deepEqual(back.state.discovered, []);
  assert.equal(back.state.coins, 0);
  assert.deepEqual(back.state.owned, []);
  assert.deepEqual(back.state.equipped, fresh.equipped);
  assert.equal(back.state.character, 'explorer');
  assert.equal(back.state.note, '');
  assert.deepEqual(back.state.locations, {});
  assert.equal(back.state.travelSpeed, 'walk');
  assert.deepEqual(back.extra, { camera: 'follow', time: 'dusk', quality: 'medium', travel: null });
  assert.equal(st.getItem('hongseong-hud-v1'), JSON.stringify({ portrait: true }));   // the HUD fold is not progress
  // without an extra, the stored one is kept (cleaned)
  const st2 = fakeStorage();
  st2.setItem(KEY3D, JSON.stringify({ camera: 'follow', time: 'x', quality: 'high', travel: 'plane' }));
  resetSession(st2);
  assert.deepEqual(loadSession(st2).extra, { camera: 'follow', time: 'day', quality: 'high', travel: null });
  assert.equal(resetSession({ getItem() { return null; }, setItem() { throw new Error('blocked'); } }), false);
});
