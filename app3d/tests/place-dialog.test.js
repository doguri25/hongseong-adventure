import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kindLabel, heroImage, visitTotals, rewardLine } from '../src/ui/place-dialog.js';
import { PLACES } from '#game/content.js';
import { freshState, discover } from '#game/core.js';

const byId = (id) => PLACES.find((p) => p.id === id);

test('kindLabel: the 2D hero labels (photo, real terrain data, illustration)', () => {
  assert.equal(kindLabel(byId('library')), '실제 사진');
  assert.equal(kindLabel(byId('sanga-stream')), '실제 지형 자료');
  assert.equal(kindLabel(byId('song')), '이해를 돕는 삽화');
  assert.equal(kindLabel({ photo: 'x', mediaType: 'map' }), '실제 사진', 'a photo wins, as in 2D hero()');
});

test('heroImage: every place picture is bundled (one URL per image file, none missing)', () => {
  const urls = new Map();
  for (const p of PLACES) {
    const u = heroImage(p);
    assert.equal(typeof u, 'string', p.id);
    assert.ok(u.length > 0, p.id);
    if (urls.has(p.image)) assert.equal(urls.get(p.image), u);
    urls.set(p.image, u);
  }
  assert.equal(new Set(urls.values()).size, urls.size, 'different files, different URLs');
  assert.equal(heroImage({ image: 'assets/nope.webp' }), null);
});

test('visitTotals: the reward adds the discovery, the quiz and the mission bonus (2D renderReward)', () => {
  assert.deepEqual(visitTotals({ coins: 50, xp: 80 }, { place: 'p', bonus: 30 }, { correct: true, coins: 20, xp: 30 }), { coins: 100, xp: 110 });
  assert.deepEqual(visitTotals(null, null, { correct: true, coins: 0, xp: 0 }), { coins: 0, xp: 0 });
  assert.deepEqual(visitTotals(null, { place: 'p', bonus: 0 }, { correct: true, coins: 10, xp: 30 }), { coins: 10, xp: 30 });
});

test('rewardLine: a mission first, then a new discovery, else found or not yet (2D reward-label)', () => {
  const s = freshState(), p = byId('library');
  assert.equal(rewardLine(s, p, { mission: { bonus: 30 } }), '직행 미션 성공! +30금화');
  assert.equal(rewardLine(s, p, { mission: { bonus: 0 } }), '탐방 미션 완료!');
  assert.equal(rewardLine(s, p, { reward: { coins: 50 } }), '새로운 발견! +50금화');
  assert.equal(rewardLine(s, p, {}), '직접 찾아가면 발견 수첩에 기록되고 퀴즈를 풀 수 있어요');
  discover(s, 'library');
  assert.equal(rewardLine(s, p, {}), '발견 수첩에 기록된 장소');
});
