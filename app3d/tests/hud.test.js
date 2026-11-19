import { test } from 'node:test';
import assert from 'node:assert/strict';
import { josa } from '../src/ui/hud.js';

test('josa picks 와/과, 을/를 and 로/으로 from the last syllable', () => {
  assert.equal(josa('도서관 길잡이', 'with'), '와');
  assert.equal(josa('마을 이웃', 'with'), '과');
  assert.equal(josa('마을 이야기 선생님', 'with'), '과');
  assert.equal(josa('충남도서관', 'to'), '으로');
  assert.equal(josa('죽도', 'to'), '로');
  assert.equal(josa('마을', 'to'), '로');          // ㄹ takes 로
  assert.equal(josa('CU', 'to'), '로');            // not Hangul: no final consonant
  assert.equal(josa('홍성초등학교', 'obj'), '를');
  assert.equal(josa('홍성역', 'obj'), '을');
  assert.equal(josa('마을', 'obj'), '을');          // ㄹ is a final consonant here
});

test('hudLayoutKey follows the 2D mobileLayout rule (mobile: width <= 820 or height <= 600)', async () => {
  const { hudLayoutKey } = await import('../src/ui/hud.js');
  assert.equal(hudLayoutKey(1280, 760), 'desktop');
  assert.equal(hudLayoutKey(1024, 768), 'desktop');
  assert.equal(hudLayoutKey(390, 844), 'portrait');
  assert.equal(hudLayoutKey(844, 390), 'landscape');
  assert.equal(hudLayoutKey(1280, 600), 'landscape');
});

test('HUD preferences use the 2D hongseong-hud-v1 shape: only boolean portrait/landscape/desktop keys', async () => {
  const { readHudPrefs, writeHudPref, missionExpanded, HUD_KEY } = await import('../src/ui/hud.js');
  assert.equal(HUD_KEY, 'hongseong-hud-v1');
  const mem = (init) => { const m = new Map(init ? [[HUD_KEY, init]] : []); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };
  assert.deepEqual(readHudPrefs(mem('{"portrait":false,"desktop":true,"landscape":"yes","other":1}')), { portrait: false, desktop: true });
  assert.deepEqual(readHudPrefs(mem('not json')), {});
  assert.deepEqual(readHudPrefs(mem('[1]')), {});
  assert.deepEqual(readHudPrefs({ getItem() { throw new Error('blocked'); } }), {});
  // defaults as in the 2D game: expanded on desktop, folded on phones
  assert.equal(missionExpanded({}, 'desktop'), true);
  assert.equal(missionExpanded({}, 'portrait'), false);
  assert.equal(missionExpanded({ portrait: true }, 'portrait'), true);
  const s = mem('{"desktop":true,"junk":5}');
  const prefs = writeHudPref(s, readHudPrefs(s), 'portrait', true);
  assert.deepEqual(prefs, { desktop: true, portrait: true });
  assert.deepEqual(JSON.parse(s.m.get(HUD_KEY)), { desktop: true, portrait: true });
  assert.doesNotThrow(() => writeHudPref({ setItem() { throw new Error('quota'); } }, {}, 'landscape', false));
});
