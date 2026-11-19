import { test } from 'node:test';
import assert from 'node:assert/strict';
import { journalCards, FILTERS } from '../src/ui/journal.js';
import { freshState, discover, answer } from '#game/core.js';
import { PLACES } from '#game/content.js';
import { STAMPS } from '#game/wardrobe.js';

const byId = (id) => PLACES.find((p) => p.id === id);

test('journalCards: the four filters are the 2D ones (all, found, heritage+intangible, daily+public) in PLACES order', () => {
  assert.deepEqual(FILTERS, [['all', '전체'], ['found', '발견'], ['heritage', '역사'], ['daily', '생활']]);
  const s = freshState();
  discover(s, 'hongju'); discover(s, 'library');
  assert.equal(journalCards(s, 'all').length, 241);
  assert.deepEqual(journalCards(s, 'all').map((c) => c.id), PLACES.map((p) => p.id));
  assert.deepEqual(journalCards(s, 'found').map((c) => c.id), PLACES.filter((p) => ['hongju', 'library'].includes(p.id)).map((p) => p.id));
  assert.deepEqual(journalCards(s, 'heritage').map((c) => c.id), PLACES.filter((p) => p.type === 'heritage' || p.type === 'intangible').map((p) => p.id));
  assert.deepEqual(journalCards(s, 'daily').map((c) => c.id), PLACES.filter((p) => p.type === 'daily' || p.type === 'public').map((p) => p.id));
  assert.deepEqual(journalCards(freshState(), 'found'), []);
});

test('journalCards: found cards carry the equipped stamp and the blurb; the others say how to find them', () => {
  const s = freshState();
  discover(s, 'library'); discover(s, 'hongju');
  answer(s, 'library', byId('library').quiz.answer);
  const card = (id) => journalCards(s).find((c) => c.id === id);
  assert.deepEqual(card('library'), { id: 'library', name: '충남도서관', tag: '홍성군 홍북읍 · 공공시설', found: true, remote: false, desc: byId('library').blurb, stamp: '✓ 이야기 완성' });
  assert.equal(card('hongju').stamp, '✓ 발견 완료');
  s.equipped.stamp = 'heart';
  assert.equal(card('library').stamp, `${STAMPS.heart} 이야기 완성`);
  const remote = PLACES.find((p) => p.remote), mapped = PLACES.find((p) => !p.remote && !s.discovered.includes(p.id));
  assert.deepEqual([card(remote.id).found, card(remote.id).remote, card(remote.id).stamp, card(remote.id).desc], [false, true, null, '홍성 이야기 여행에서 만나기']);
  assert.deepEqual([card(mapped.id).found, card(mapped.id).stamp, card(mapped.id).desc], [false, null, '지도에서 이 장소 찾아가기']);
});
