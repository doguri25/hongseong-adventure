import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { freshState, sanitizeState } from '#game/core.js';
import { WALK_CELLS } from '#game/walk-cells.js';
import { toRender } from '../src/frame.js';

// A 2D-canvas stand-in: Actors paints its shadow, ring and trail textures on canvases (no DOM in Node).
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {}, width: 10 })), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };
const { Actors, wardrobeFx, stepTrail, trailAlpha, TRAIL_EVERY, TRAIL_LIFE } = await import('../src/world/actors.js');
const { lazySheets } = await import('../src/world/actor-assets.js');

const sheet = () => ({ texture: new THREE.Texture(), size: [1774, 887], cells: WALK_CELLS.walk });
const field = { renderY: () => 5 };
const walker = () => ({ x: 1000, y: 1000, h: 5, mode: 'walk', vx: 78, vy: 0, heading: Math.PI / 2, speed: 78, phase: 0, moving: true, bank: 0, climb: 0, turnRate: 0 });
// walk east for `secs` at 30 fps, the camera looking north
function walk(a, p, secs, t0 = 0) {
  let t = t0;
  for (let i = 0; i < secs * 30; i++) { t += 1 / 30; p.x += p.vx / 30; a.update(p, { yaw: 0 }, 1 / 30, t, field); }
  return t;
}
const shownDrops = (a) => a.trail.meshes.filter((m) => m.visible);

test('the trail and ring come from state.equipped as sanitizeState leaves it', () => {
  const worn = sanitizeState({ ...freshState(), owned: ['trail-heart', 'ring-sea'], equipped: { ...freshState().equipped, trail: 'heart', ring: 'sea' } });
  assert.deepEqual(wardrobeFx(worn.equipped), { trail: { glyph: '♥', color: '#ef93aa' }, ring: '#63cce1' });
  const star = sanitizeState({ ...freshState(), owned: ['starlight', 'ring-forest'], equipped: { ...freshState().equipped, trail: 'star', ring: 'forest' } });
  assert.deepEqual(wardrobeFx(star.equipped), { trail: { glyph: '✧', color: '#fff3a8' }, ring: '#91cb7a' });
  // not owned: sanitizeState takes it off, so nothing shows; default and missing show nothing either
  const unowned = sanitizeState({ ...freshState(), equipped: { ...freshState().equipped, trail: 'music', ring: 'sun' } });
  assert.deepEqual(wardrobeFx(unowned.equipped), { trail: null, ring: null });
  assert.deepEqual(wardrobeFx(freshState().equipped), { trail: null, ring: null });
  assert.deepEqual(wardrobeFx(undefined), { trail: null, ring: null });
});

test('a trail drop every 130 ms while moving, each fading out over 1.5 s (2D world.js)', () => {
  assert.equal(TRAIL_EVERY, 0.13); assert.equal(TRAIL_LIFE, 1.5);
  const drops = [];
  for (let i = 0; i <= 60; i++) stepTrail(drops, i / 60, [i, 0, 0], true);   // one second at 60 fps
  assert.ok(drops.length >= 7 && drops.length <= 8, `${drops.length} drops in 1 s`);
  for (let i = 1; i < drops.length; i++) { const gap = drops[i].t - drops[i - 1].t; assert.ok(gap > 0.13 && gap < 0.13 + 1 / 60 + 1e-9, `gap ${gap}`); }
  const n = drops.length;
  stepTrail(drops, 1.2, [99, 0, 0], false);   // standing still: no new drop
  assert.equal(drops.length, n);
  assert.ok(Math.abs(trailAlpha(drops[0], drops[0].t) - 0.8) < 1e-9 && trailAlpha(drops[0], drops[0].t + 0.75) < trailAlpha(drops[0], drops[0].t + 0.1));
  stepTrail(drops, 2.6, [99, 0, 0], false);   // 1.5 s after the last drop
  assert.equal(drops.length, 0);
});

test('Actors: the equipped trail and ring follow equip and unequip live', () => {
  const scene = new THREE.Scene(), a = new Actors(scene, { walk: { walk: sheet() }, bike: sheet() }, { equipped: { trail: 'heart', ring: 'sea' } });
  const p = walker();
  let t = walk(a, p, 1);
  const lit = shownDrops(a);
  assert.ok(lit.length >= 6, `${lit.length} trail drops behind the walker`);
  assert.ok(lit.every((m) => m.material.color.getHexString() === 'ef93aa'), 'in the heart colour');
  const ages = lit.map((m) => m.material.opacity);
  assert.ok(Math.min(...ages) < Math.max(...ages) && Math.max(...ages) <= 0.8 + 1e-9, `fading ${ages.map((o) => o.toFixed(2))}`);
  const [X, Z] = toRender(p.x, p.y);
  assert.ok(lit.every((m) => m.position.x <= X + 1e-6 && m.position.x > X - 78 * 1.6 && Math.abs(m.position.z - Z) < 1e-6), 'dropped on the path behind the walker');
  assert.ok(a.ring.visible && a.ring.material.color.getHexString() === '63cce1', 'the 바다 ring under the walker');
  assert.ok(Math.abs(a.ring.position.x - X) < 1e-6 && Math.abs(a.ring.position.z - Z) < 1e-6 && a.ring.position.y > 5 && a.ring.position.y < 6, 'on the ground under the walker');
  const walkRing = a.ring.scale.x;
  // taken off in 꾸미기: gone at once
  a.setEffects({ trail: 'default', ring: 'default' });
  assert.equal(shownDrops(a).length, 0); assert.equal(a.ring.visible, false);
  t = walk(a, p, 0.5, t);
  assert.equal(shownDrops(a).length, 0); assert.equal(a.ring.visible, false);
  // put on again (another ring): back at once, in the new colour
  a.setEffects({ trail: 'leaf', ring: 'forest' });
  t = walk(a, p, 0.5, t);
  assert.ok(shownDrops(a).length > 0 && shownDrops(a).every((m) => m.material.color.getHexString() === '69b582'));
  assert.ok(a.ring.visible && a.ring.material.color.getHexString() === '91cb7a');
  // a car drops no trail (walking and biking only) but keeps a wider ring
  p.mode = 'car';
  walk(a, p, 2, t);
  assert.equal(shownDrops(a).length, 0, 'no trail behind the car');
  assert.ok(a.ring.visible && a.ring.scale.x > walkRing * 2, `car ring ${a.ring.scale.x} vs walk ${walkRing}`);
});

test('Actors: a character sheet not loaded yet keeps the old look until it arrives', async () => {
  let arrive;
  const later = new Promise((r) => { arrive = r; });
  const asked = [];
  const assets = { walk: { walk: sheet() }, bike: sheet(), loadWalk: (key) => { asked.push(key); return later.then(() => sheet()); } };
  const a = new Actors(new THREE.Scene(), assets, { character: 'explorer' });
  const p = { ...walker(), moving: false };
  a.update(p, { yaw: 0 }, 1 / 30, 0, field);
  assert.equal(a.walkers.walk.sprite.visible, true);
  a.setCharacter('raccoon');
  assert.equal(a.character, 'raccoon'); assert.deepEqual(asked, ['raccoon']);
  a.update(p, { yaw: 0 }, 1 / 30, 0.1, field);
  assert.equal(a.walkers.walk.sprite.visible, true, 'the explorer stays until the raccoon sheet has loaded');
  arrive(); await later; await new Promise((r) => setTimeout(r, 0));
  a.update(p, { yaw: 0 }, 1 / 30, 0.2, field);
  assert.ok(a.walkers.raccoon, 'the raccoon walker exists once its sheet is in');
  assert.equal(a.walkers.raccoon.sprite.visible, true); assert.equal(a.walkers.walk.sprite.visible, false);
  a.setCharacter('explorer');   // already loaded: at once, nothing fetched
  a.update(p, { yaw: 0 }, 1 / 30, 0.3, field);
  assert.equal(a.walkers.walk.sprite.visible, true); assert.deepEqual(asked, ['raccoon']);
});

test('lazySheets: each sheet loads once, a failed one resolves null and is not fetched again', async () => {
  const calls = [];
  const sheets = lazySheets((key) => { calls.push(key); return key === 'boy' ? Promise.reject(new Error('404')) : Promise.resolve({ key }); }, { walk: { key: 'walk' } });
  assert.deepEqual(await sheets.get('walk'), { key: 'walk' });
  const [a, b] = await Promise.all([sheets.get('raccoon'), sheets.get('raccoon')]);
  assert.deepEqual(a, { key: 'raccoon' }); assert.equal(a, b);
  assert.equal(sheets.sheets.raccoon, a);
  assert.equal(await sheets.get('boy'), null);
  assert.equal(await sheets.get('boy'), null);
  assert.deepEqual(calls, ['raccoon', 'boy']);
  assert.ok(sheets.failed.has('boy'));
});
