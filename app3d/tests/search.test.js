import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLACE_FILTERS, nearbyPlaces, distanceLabel, goLabel, comboKey, composingKey } from '../src/ui/search.js';
import { PLACES } from '#game/content.js';
import { symbolKey } from '#game/place-icons.js';

// the mapped places get a point (as world/places.js gives them), x growing with their PLACES order
const all = PLACES.map((p, i) => (p.remote ? p : { ...p, point: [i * 100, 0] }));
const mapped = all.filter((p) => !p.remote);

test('PLACE_FILTERS are the 2D game\'s fifteen filters, in order', () => {
  assert.equal(PLACE_FILTERS.length, 15);
  assert.deepEqual(PLACE_FILTERS[0], ['all', '전체']);
  assert.deepEqual(PLACE_FILTERS.map(([k]) => k), ['all', 'government', 'post', 'bank', 'school', 'mart', 'shop', 'heritage', 'museum', 'festival', 'market', 'specialty', 'cafe', 'nature', 'mapStories']);
  assert.deepEqual(PLACE_FILTERS.find(([k]) => k === 'school'), ['school', '초·중·고·대학교']);
  assert.deepEqual(PLACE_FILTERS.at(-1), ['mapStories', '관광지도 이야기']);
});

test('nearbyPlaces: every mapped place, nearest first from the player', () => {
  const from = [mapped[40].point[0] + 30, 0];
  const list = nearbyPlaces(all, { from });
  assert.equal(list.length, mapped.length);
  assert.equal(list[0].id, mapped[40].id);
  const d = list.map((p) => Math.abs(p.point[0] - from[0]));
  assert.ok(d.every((v, i) => i === 0 || v >= d[i - 1]), 'sorted by distance');
  assert.ok(list.every((p) => !p.remote), 'story-only places only under 관광지도 이야기');
});

test('nearbyPlaces: the 2D filter rules (school takes every school kind; 관광지도 이야기 includes the story-only ones, last)', () => {
  const schools = nearbyPlaces(all, { filter: 'school' });
  assert.ok(schools.length > 10);
  assert.ok(schools.every((p) => ['elementary', 'middle', 'high', 'university'].includes(symbolKey(p))));
  assert.equal(schools.length, mapped.filter((p) => ['elementary', 'middle', 'high', 'university'].includes(symbolKey(p))).length);
  const stories = nearbyPlaces(all, { filter: 'mapStories', from: [0, 0] });
  assert.equal(stories.length, all.filter((p) => p.fromTouristMap).length);
  assert.ok(stories.some((p) => p.remote) && stories.some((p) => !p.remote));
  const firstRemote = stories.findIndex((p) => p.remote);
  assert.ok(stories.slice(firstRemote).every((p) => p.remote), 'no point: after every mapped place');
  const museums = nearbyPlaces(all, { filter: 'museum' });
  assert.ok(museums.length > 0 && museums.every((p) => ['museum', 'gallery'].includes(symbolKey(p))));
  const heritage = nearbyPlaces(all, { filter: 'heritage' });
  assert.ok(heritage.length > 0 && heritage.every((p) => symbolKey(p) === 'heritage' || (p.type === 'heritage' && !['museum', 'gallery'].includes(symbolKey(p)))));
  assert.ok(!heritage.some((p) => ['museum', 'gallery'].includes(symbolKey(p))), '박물관·미술관 have their own filter');
  const shops = nearbyPlaces(all, { filter: 'shop' });
  assert.ok(shops.length > 0 && shops.every((p) => symbolKey(p) === 'shop' || (p.type === 'daily' && !['mart', 'bank'].includes(symbolKey(p)))));
  for (const [k] of PLACE_FILTERS) assert.ok(nearbyPlaces(all, { filter: k }).length > 0, `${k} finds places`);
});

test('nearbyPlaces: the substring filter looks in the name, original name, area and category, ignoring case', () => {
  const station = nearbyPlaces(all, { query: '홍성역' });
  assert.ok(station.some((p) => p.id === 'new-hongseong-station'));
  assert.ok(station.every((p) => `${p.name} ${p.originalName || ''} ${p.area} ${p.category}`.includes('홍성역')));
  const area = nearbyPlaces(all, { query: '  광천읍 ' });
  assert.equal(area.length, mapped.filter((p) => `${p.name} ${p.originalName || ''} ${p.area} ${p.category}`.includes('광천읍')).length);
  const withOriginal = PLACES.find((p) => p.originalName && !p.remote && !p.name.includes(p.originalName));
  if (withOriginal) assert.ok(nearbyPlaces(all, { query: withOriginal.originalName }).some((p) => p.id === withOriginal.id), 'found by its original name');
  const latin = PLACES.find((p) => !p.remote && /[A-Za-z]/.test(p.name));
  if (latin) assert.ok(nearbyPlaces(all, { query: latin.name.toUpperCase() }).some((p) => p.id === latin.id), 'case does not matter');
  assert.deepEqual(nearbyPlaces(all, { query: '없는장소이름' }), []);
});

test('nearbyPlaces with a fixed list (pins under one tap) keeps only those, nearest first', () => {
  const only = [mapped[5], mapped[2], mapped[9]];
  assert.deepEqual(nearbyPlaces(all, { only, from: [mapped[9].point[0], 0] }).map((p) => p.id), [mapped[9].id, mapped[5].id, mapped[2].id]);
});

test('distanceLabel and goLabel: the 2D row wording', () => {
  assert.equal(distanceLabel(0), '0 m');
  assert.equal(distanceLabel(349.6), '350 m');
  assert.equal(distanceLabel(999.4), '999 m');
  assert.equal(distanceLabel(1000), '1.0 km');
  assert.equal(distanceLabel(12345), '12.3 km');
  assert.equal(goLabel({ remote: true }, false), '이야기 보기');
  assert.equal(goLabel({}, true), '안내 보기');
  assert.equal(goLabel({}, false), '찾아가기');
});

test('comboKey: a key that ends or belongs to a Korean IME composition never moves or chooses', () => {
  for (const key of ['Enter', 'ArrowDown', 'ArrowUp', 'Escape']) {
    assert.deepEqual(comboKey({ active: 1, count: 4, open: true }, key, true), { active: 1, action: null }, key);
  }
  assert.equal(composingKey({ key: 'Enter', isComposing: true }, false), true);
  assert.equal(composingKey({ key: 'Enter', isComposing: false, keyCode: 229 }, false), true, 'Safari: the Enter that commits a syllable');
  assert.equal(composingKey({ key: 'Enter', isComposing: false, keyCode: 13 }, true), true, 'between compositionstart and compositionend');
  assert.equal(composingKey({ key: 'Enter', isComposing: false, keyCode: 13 }, false), false);
});

test('comboKey: arrows wrap through the results, Enter takes the active or the first one, Escape closes an open list', () => {
  const st = (active, count = 4, open = true) => ({ active, count, open });
  assert.deepEqual(comboKey(st(-1), 'ArrowDown'), { active: 0, action: 'move' });
  assert.deepEqual(comboKey(st(3), 'ArrowDown'), { active: 0, action: 'move' });
  assert.deepEqual(comboKey(st(-1), 'ArrowUp'), { active: 3, action: 'move' });
  assert.deepEqual(comboKey(st(0), 'ArrowUp'), { active: 3, action: 'move' });
  assert.deepEqual(comboKey(st(-1, 0), 'ArrowDown'), { active: -1, action: 'move' });
  assert.deepEqual(comboKey(st(-1), 'Enter'), { active: 0, action: 'choose' });
  assert.deepEqual(comboKey(st(2), 'Enter'), { active: 2, action: 'choose' });
  assert.deepEqual(comboKey(st(-1, 0), 'Enter'), { active: -1, action: null }, 'no results: nothing to choose');
  assert.deepEqual(comboKey(st(1), 'Escape'), { active: -1, action: 'close' });
  assert.deepEqual(comboKey(st(-1, 4, false), 'Escape'), { active: -1, action: null }, 'a closed list leaves Escape to the dialog');
  assert.deepEqual(comboKey(st(1), 'a'), { active: 1, action: null });
});
