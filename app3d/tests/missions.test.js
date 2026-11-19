import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshMissions, missionView } from '../src/game/missions.js';
import { freshState } from '#game/core.js';
import { dayKey, DIRECT_BONUS } from '#game/quests.js';
import { project, unproject } from '../src/frame.js';

// a ring of 40 mapped places around (24000, 9000) game metres, spaced 400 m apart on a line so some sit > 220 m away
const mk = (i) => {
  const point = [24000 + i * 400, 9000];
  const [lon, lat] = unproject(point);
  return { id: 'p' + i, name: '장소' + i, area: '구역' + i, blurb: '설명' + i, type: i % 5 === 4 ? 'daily' : 'heritage', point, lon, lat };
};
const places = Array.from({ length: 40 }, (_, i) => mk(i));
const NOW = Date.parse('2026-11-19T03:00:00Z');
const YESTERDAY = Date.parse('2026-11-18T03:00:00Z');
const seq = () => { let k = 0; return () => ((k++ * 0.37) % 1); };
const player = { x: 24000, y: 9000, mode: 'walk', movementMode: 'free' };

test('refreshesStaleMissions: yesterday becomes three new targets and the ledger is untouched', () => {
  const s = freshState();
  s.dailyQuests = { day: dayKey(YESTERDAY), targets: ['p1', 'p2', 'p3'], active: 'p1', direct: true, started: true };
  s.questLedger = [{ day: dayKey(YESTERDAY), place: 'p1', bonus: 50 }];
  const ledger = JSON.stringify(s.questLedger);
  const changed = refreshMissions(s, { places, player, navigator: null, now: NOW, random: seq(), force: false });
  assert.equal(changed, true);
  assert.equal(s.dailyQuests.day, dayKey(NOW));
  assert.equal(s.dailyQuests.targets.length, 3);
  assert.equal(JSON.stringify(s.questLedger), ledger);
});

test('same day is left alone unless forced', () => {
  const s = freshState();
  refreshMissions(s, { places, player, navigator: null, now: NOW, random: seq() });
  const first = JSON.stringify(s.dailyQuests);
  assert.equal(refreshMissions(s, { places, player, navigator: null, now: NOW, random: () => 0.9 }), false);
  assert.equal(JSON.stringify(s.dailyQuests), first);
  assert.equal(refreshMissions(s, { places, player, navigator: null, now: NOW, random: () => 0.9, force: true }), true);
});

test('roads mode on the ground keeps only the nearest 60, farther than 220 m and reachable', () => {
  const s = freshState();
  const asked = [];
  const navigator = { route: (from, to, snap) => { asked.push({ to, snap }); return to[0] < 24000 + 1500 ? [to] : null; } };
  refreshMissions(s, { places, player: { ...player, movementMode: 'roads' }, navigator, now: NOW, random: seq() });
  assert.ok(asked.length > 0 && asked.every((a) => a.snap === 350));
  const idx = (id) => Number(id.slice(1));
  assert.ok(s.dailyQuests.targets.every((id) => places[idx(id)].point[0] < 24000 + 1500 && places[idx(id)].point[0] - 24000 > 220));
});

test('roads mode while flying ignores the navigator', () => {
  const s = freshState();
  const navigator = { route: () => { throw new Error('should not route'); } };
  refreshMissions(s, { places, player: { ...player, movementMode: 'roads', mode: 'plane' }, navigator, now: NOW, random: seq() });
  assert.equal(s.dailyQuests.targets.length, 3);
});

test('missionView strings and dots match the 2D card', () => {
  const s = freshState();
  s.dailyQuests = { day: dayKey(NOW), targets: ['p1', 'p2', 'p3'], active: 'p1', direct: true, started: true };
  s.questLedger = [];
  let v = missionView(s, places);
  assert.equal(v.heading, '오늘의 첫 탐방');
  assert.deepEqual(v.target, { id: 'p1', name: '장소1', area: '구역1' });
  assert.deepEqual(v.dots, ['active', 'open', 'open']);
  assert.equal(v.direct, true);
  assert.equal(v.bonus, DIRECT_BONUS);
  assert.equal(v.title, '장소1 찾아가기');
  assert.equal(v.detail, '다른 장소 안내를 열지 않고 도착하면 +50금화!');

  s.dailyQuests.active = 'p2'; s.dailyQuests.direct = false;
  v = missionView(s, places);
  assert.equal(v.heading, '오늘의 탐방 미션');
  assert.equal(v.detail, '다른 곳에 들렀어도 괜찮아요. 목표를 찾아 미션을 마쳐요.');
  assert.deepEqual(v.dots, ['open', 'active', 'open']);

  s.questLedger = ['p1', 'p2', 'p3'].map((place) => ({ day: dayKey(NOW), place, bonus: 0 }));
  v = missionView(s, places);
  assert.equal(v.target, null);
  assert.deepEqual(v.dots, ['done', 'done', 'done']);
  assert.equal(v.title, '오늘의 미션을 완성했어요!');
  assert.equal(v.detail, '새 미션을 받아 모험을 이어가요.');
});

test('missionView without missions', () => {
  const v = missionView(freshState(), places);
  assert.deepEqual(v.dots, []);
  assert.equal(v.target, null);
});
