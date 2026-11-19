import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUALITY, nextQuality, pixelRatio, rememberQuality } from '../src/render/quality.js';

test('QUALITY presets', () => {
  assert.deepEqual([QUALITY.high.dpr, QUALITY.medium.dpr, QUALITY.low.dpr], [2, 1.5, 1.25]);
  assert.deepEqual([QUALITY.high.cap, QUALITY.medium.cap, QUALITY.low.cap], [2.6e6, 1.8e6, 1.2e6]);
  assert.deepEqual([QUALITY.high.shadow, QUALITY.medium.shadow, QUALITY.low.shadow], [2048, 2048, 1024]);
  assert.deepEqual([QUALITY.high.bloom, QUALITY.medium.bloom, QUALITY.low.bloom], [true, true, false]);
  assert.deepEqual([QUALITY.high.msaa, QUALITY.medium.msaa, QUALITY.low.msaa], [4, 2, 0]);
});

test('autoQualitySteps', () => {
  let s = { mode: 'auto', scale: 1, bloom: true };
  const seen = [];
  for (let i = 0; i < 3; i++) { s = nextQuality(s, 40); seen.push(s.scale); }
  assert.deepEqual(seen, [0.86, 0.72, 0.6]);
  assert.equal(s.bloom, true);
  s = nextQuality(s, 40);
  assert.deepEqual(s, { mode: 'auto', scale: 0.6, bloom: false });
  assert.deepEqual(nextQuality(s, 40), s);
  const ups = [];
  for (let i = 0; i < 4; i++) { s = nextQuality(s, 10); ups.push(s.scale); }
  assert.deepEqual(ups, [0.7, 0.8, 0.9, 1]);
  assert.equal(nextQuality(s, 10).scale, 1);
  assert.deepEqual(nextQuality(s, 20), s); // dead band
});

test('explicit mode never changes', () => {
  const s = { mode: 'high', scale: 1, bloom: true };
  assert.deepEqual(nextQuality(s, 80), s);
  assert.deepEqual(nextQuality(s, 5), s);
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
