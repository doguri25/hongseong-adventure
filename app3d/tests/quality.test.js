import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUALITY, nextQuality, qualityState, autoStartKey, pixelRatio, rememberQuality } from '../src/render/quality.js';

test('QUALITY presets', () => {
  assert.deepEqual([QUALITY.high.dpr, QUALITY.medium.dpr, QUALITY.low.dpr], [2, 1.5, 1.25]);
  assert.deepEqual([QUALITY.high.cap, QUALITY.medium.cap, QUALITY.low.cap], [2.6e6, 1.8e6, 1.2e6]);
  assert.deepEqual([QUALITY.high.shadow, QUALITY.medium.shadow, QUALITY.low.shadow], [2048, 2048, 1024]);
  assert.deepEqual([QUALITY.high.bloom, QUALITY.medium.bloom, QUALITY.low.bloom], [true, true, false]);
  assert.deepEqual([QUALITY.high.msaa, QUALITY.medium.msaa, QUALITY.low.msaa], [4, 2, 0]);
});

test('autoQualitySteps: resolution, bloom, MSAA, shadow 1024, shadows off, low geometry, then the floor', () => {
  let s = qualityState('auto', 'high');
  assert.deepEqual(s, { mode: 'auto', key: 'high', scale: 1, bloom: true, msaa: 4, shadow: 2048, props: 'high' });
  const seen = [];
  for (let i = 0; i < 3; i++) { s = nextQuality(s, 40); seen.push(s.scale); }
  assert.deepEqual(seen, [0.86, 0.72, 0.6]);
  assert.equal(s.bloom, true);
  const ladder = [];
  for (let i = 0; i < 6; i++) { s = nextQuality(s, 40); ladder.push({ bloom: s.bloom, msaa: s.msaa, shadow: s.shadow, props: s.props }); }
  assert.deepEqual(ladder, [
    { bloom: false, msaa: 4, shadow: 2048, props: 'high' },
    { bloom: false, msaa: 0, shadow: 2048, props: 'high' },
    { bloom: false, msaa: 0, shadow: 1024, props: 'high' },
    { bloom: false, msaa: 0, shadow: 0, props: 'high' },
    { bloom: false, msaa: 0, shadow: 0, props: 'low' },
    { bloom: false, msaa: 0, shadow: 0, props: 'low' },   // the floor: nothing left to lower
  ]);
  const floor = s;
  assert.deepEqual(nextQuality(floor, 40), floor);
  assert.equal(nextQuality(floor, 40), floor, 'same object: nothing to apply');
  // fast again: only the resolution comes back, the heavier steps stay off
  const ups = [];
  for (let i = 0; i < 4; i++) { s = nextQuality(s, 10); ups.push(s.scale); }
  assert.deepEqual(ups, [0.7, 0.8, 0.9, 1]);
  assert.deepEqual({ ...s, scale: 0.6 }, floor);
  assert.equal(nextQuality(s, 10), s);
  assert.equal(nextQuality(s, 20), s); // dead band
});

test('autoQualitySteps from the medium and low starts', () => {
  let m = qualityState('auto', 'medium');
  assert.deepEqual([m.msaa, m.shadow, m.props], [2, 2048, 'medium']);
  const steps = [];
  for (let i = 0; i < 9; i++) { const n = nextQuality(m, 40); if (n === m) break; steps.push(Object.keys(n).find((k) => n[k] !== m[k])); m = n; }
  assert.deepEqual(steps, ['scale', 'scale', 'scale', 'bloom', 'msaa', 'shadow', 'shadow', 'props']);
  let l = qualityState('auto', 'low');
  assert.deepEqual([l.bloom, l.msaa, l.shadow, l.props], [false, 0, 1024, 'low']);
  for (let i = 0; i < 3; i++) l = nextQuality(l, 40);
  l = nextQuality(l, 40);
  assert.equal(l.shadow, 0);
  assert.equal(nextQuality(l, 40), l);
});

test('auto starts on medium on touch or <= 4 GB devices, low at <= 2 GB, high otherwise', () => {
  assert.equal(autoStartKey({ coarse: false, deviceMemory: 8 }), 'high');
  assert.equal(autoStartKey({ coarse: false }), 'high');   // no deviceMemory (Safari, Firefox)
  assert.equal(autoStartKey({ coarse: true }), 'medium');
  assert.equal(autoStartKey({ coarse: true, deviceMemory: 8 }), 'medium');
  assert.equal(autoStartKey({ coarse: false, deviceMemory: 4 }), 'medium');
  assert.equal(autoStartKey({ coarse: true, deviceMemory: 2 }), 'low');
  assert.equal(autoStartKey({ coarse: false, deviceMemory: 1 }), 'low');
  assert.equal(autoStartKey(), 'high');
  assert.equal(qualityState('auto', 'medium').key, 'medium');
  assert.equal(qualityState('auto', 'nope').key, 'high');
  assert.deepEqual(qualityState('low'), { mode: 'low', key: 'low', scale: 1, bloom: false, msaa: 0, shadow: 1024, props: 'low' });
});

test('geometry budgets shrink from high to low', () => {
  const [h, m, l] = ['high', 'medium', 'low'].map((k) => QUALITY[k]);
  for (const f of ['treeCap', 'treeLoad', 'treeDrop', 'lampRadius']) assert.ok(h.props[f] >= m.props[f] && m.props[f] >= l.props[f], f);
  for (const q of [h, m, l]) assert.ok(q.props.treeDrop > q.props.treeLoad && q.terrainLod[1] > q.terrainLod[0]);
  assert.ok(h.terrainLod[0] >= m.terrainLod[0] && m.terrainLod[0] >= l.terrainLod[0]);
  assert.ok(h.ground.base >= m.ground.base && m.ground.near >= l.ground.near);
});

test('explicit mode never changes', () => {
  for (const mode of ['high', 'medium', 'low']) {
    const s = qualityState(mode);
    assert.equal(nextQuality(s, 80), s);
    assert.equal(nextQuality(s, 5), s);
    assert.equal(nextQuality({ ...s, scale: 0.6 }, 5).scale, 0.6);
  }
});

test('pixelRatio caps by dpr*scale and pixel budget', () => {
  assert.equal(pixelRatio(QUALITY.high, 1, 800, 600, 3), 2);
  assert.equal(pixelRatio(QUALITY.high, 0.5, 800, 600, 3), 1);
  assert.equal(pixelRatio(QUALITY.high, 1, 800, 600, 1), 1);
  const r = pixelRatio(QUALITY.low, 1, 1920, 1080, 2);
  assert.ok(Math.abs(r - Math.sqrt(1.2e6 / (1920 * 1080))) < 1e-9);
});

test('rememberQuality merges and survives errors', () => {
  const store = { v: JSON.stringify({ other: 1 }), getItem() { return this.v; }, setItem(k, v) { assert.equal(k, 'hongseong-3d-v1'); this.v = v; } };
  rememberQuality(store, 'low');
  assert.deepEqual(JSON.parse(store.v), { other: 1, quality: 'low' });
  const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.doesNotThrow(() => rememberQuality(bad, 'low'));
  const junk = { v: 'not json', getItem() { return this.v; }, setItem(k, v) { this.v = v; } };
  rememberQuality(junk, 'low');
  assert.deepEqual(JSON.parse(junk.v), { quality: 'low' });
});
