// The low-frame-rate suggestion (spec §9, phase 2b Task 3, ui/lite-card.js): when the quality is already at its lightest
// and the measured frame rate stays under 20 for 10 s of play, the 가벼운 2D card is offered once per session.
import test from 'node:test';
import assert from 'node:assert/strict';
import { atLightest, slowWatch, onceFlag, SLOW_FPS, SLOW_MS, SEEN_KEY, LITE_LINES } from '../src/ui/lite-card.js';
import { qualityState, nextQuality } from '../src/render/quality.js';

// the automatic ladder walked to its end on a slow device (render/quality.js nextQuality)
function bottomed(key) {
  let s = qualityState('auto', key);
  for (let i = 0; i < 40; i++) s = nextQuality(s, 100);
  return s;
}
const frames = (ms, fps) => Array(Math.max(1, Math.round((ms / 1000) * fps))).fill(1000 / fps);   // one 2 s sampler window

test('the thresholds are spec §9: under 20 fps for 10 s', () => {
  assert.equal(SLOW_FPS, 20);
  assert.equal(SLOW_MS, 10000);
});

test('atLightest: the 낮음 setting, or automatic quality with no step left; never 높음 / 보통 or an automatic ladder part way', () => {
  assert.equal(atLightest(qualityState('low')), true);
  assert.equal(atLightest(qualityState('high')), false);
  assert.equal(atLightest(qualityState('medium')), false);
  for (const key of ['high', 'medium', 'low']) {
    assert.equal(atLightest(qualityState('auto', key)), false, `auto from ${key}: it can still step down`);
    const end = bottomed(key);
    assert.equal(atLightest(end), true, `auto from ${key} at the end of its ladder`);
    assert.equal(atLightest(nextQuality(end, 10)), false, 'a fast window wins resolution back: a step is left again');
  }
  let s = qualityState('auto', 'high');
  for (let i = 0; i < 5; i++) s = nextQuality(s, 100);
  assert.equal(atLightest(s), false, 'part way down');
  assert.equal(atLightest(null), false);
  assert.equal(atLightest(undefined), false);
});

test('slowWatch: 10 s of slow play at the lightest quality, counted in sampler windows, then it stays due', () => {
  const w = slowWatch(), low = qualityState('low'), med = (f) => f[Math.floor(f.length / 2)];
  const step = (fps, q = low, ms = 2000) => { const f = frames(ms, fps); return w.sample(f, med(f), q); };
  assert.deepEqual([step(8), step(8), step(8), step(8)], [false, false, false, false]);
  assert.equal(w.slowMs, 8000);
  assert.equal(step(8), true, 'the fifth slow window makes 10 s');
  assert.equal(step(12), true, 'still slow: still due');
});

test('slowWatch: a window at 20 fps or more, or one drawn above the lightest quality, starts the count over', () => {
  const w = slowWatch(), low = qualityState('low'), high = qualityState('high');
  const step = (fps, q = low) => { const f = frames(2000, fps); return w.sample(f, 1000 / fps, q); };
  for (let i = 0; i < 4; i++) step(10);
  assert.equal(step(20), false, 'exactly 20 fps is not under 20');
  assert.equal(w.slowMs, 0);
  for (let i = 0; i < 4; i++) step(10);
  assert.equal(step(10, high), false, 'at 높음 the card is not offered: the lighter setting comes first');
  assert.equal(w.slowMs, 0);
  for (let i = 0; i < 4; i++) step(10, bottomed('high'));
  assert.equal(step(10, bottomed('high')), true, 'the automatic ladder at its end counts');
});

test('slowWatch: a frame over a second (a hidden tab, a stall) adds at most a second of play', () => {
  const w = slowWatch(), low = qualityState('low');
  assert.equal(w.sample([60000], 60000, low), false);
  assert.equal(w.slowMs, 1000);
  assert.equal(w.sample([], 0, low), false, 'an empty window adds nothing');
  assert.equal(w.slowMs, 1000);
});

// a Storage stand-in; blocked: every call throws
function memory({ blocked = false } = {}) {
  const m = new Map(), guard = () => { if (blocked) throw new DOMException('blocked', 'SecurityError'); };
  return { m, getItem: (k) => { guard(); return m.has(k) ? m.get(k) : null; }, setItem: (k, v) => { guard(); m.set(k, String(v)); }, removeItem: (k) => { guard(); m.delete(k); } };
}

test('onceFlag: once per session, kept in sessionStorage across a reload, in memory when storage is blocked or missing', () => {
  const s = memory(), a = onceFlag(s);
  assert.equal(a.seen(), false);
  a.mark();
  assert.equal(a.seen(), true);
  assert.equal(s.m.get(SEEN_KEY), '1');
  assert.equal(onceFlag(s).seen(), true, 'a reload in the same tab: still seen');
  s.m.delete(SEEN_KEY);
  assert.equal(a.seen(), false, 'working sessionStorage is the record: a new session (its flag gone) may see it again');
  for (const store of [memory({ blocked: true }), null, undefined]) {
    const f = onceFlag(store);
    assert.equal(f.seen(), false);
    assert.doesNotThrow(() => f.mark());
    assert.equal(f.seen(), true, 'kept in memory for this page');
  }
  // reads work but the write fails (storage full): this page still remembers
  const full = memory(), f = onceFlag({ getItem: full.getItem, setItem: () => { throw new DOMException('full', 'QuotaExceededError'); } });
  f.mark();
  assert.equal(f.seen(), true);
  assert.ok(SEEN_KEY.startsWith('hongseong-') && SEEN_KEY !== 'hongseong-view-v1' && SEEN_KEY !== 'hongseong-adventure-v1' && SEEN_KEY !== 'hongseong-3d-v1');
});

test('the card copy: Korean, the two buttons of the brief, and that the choice is remembered', () => {
  assert.equal(LITE_LINES.open, '가벼운 2D로 열기');
  assert.equal(LITE_LINES.stay, '3D로 계속하기');
  assert.ok(LITE_LINES.title.length > 3 && /[가-힣]/.test(LITE_LINES.title));
  assert.ok(LITE_LINES.body.every((p) => /[가-힣]/.test(p)));
  assert.ok(LITE_LINES.body.join(' ').includes('다음에도 2D로 열려요'), 'the child is told the device keeps opening the 2D');
});
