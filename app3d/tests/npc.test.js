import test from 'node:test';
import assert from 'node:assert/strict';
import { npcTalk, portraitBox, TOPICS } from '../src/ui/npc.js';
import { createNpcs } from '#game/npcs.js';
import { PLACES } from '#game/content.js';
import { freshState } from '#game/core.js';
import { dayKey, DIRECT_BONUS } from '#game/quests.js';

const mapped = PLACES.filter((p) => !p.remote).map((p) => ({ ...p, point: [(p.lon - 126.4) * 89000, (36.69 - p.lat) * 111320] }));
const npcs = createNpcs(mapped, { nearest: () => null });   // the 2D anchors (no road snapping needed here)
const guide = npcs.find((n) => n.place === 'namdang');
const NOW = Date.parse('2026-11-19T03:00:00Z');

test('the three 2D topics: 지역 이야기, 게임 도움, 미션 도움', () => {
  assert.deepEqual(TOPICS, [['region', '지역 이야기'], ['help', '게임 도움'], ['mission', '미션 도움']]);
});

test('npcTalk region: the district history then the NPC story (2D showNpc)', () => {
  const t = npcTalk(guide, 'region', { state: freshState(), places: mapped });
  assert.equal(t.heading, `${guide.area}의 이야기`);
  assert.equal(t.text, `${guide.history} ${guide.story}`.trim());
  assert.ok(t.text.length > 20);
  const bare = npcTalk({ ...guide, history: '' }, 'region', { state: freshState(), places: mapped });
  assert.equal(bare.text, guide.story, 'no leading space without a history');
});

test('npcTalk help: how to explore, in the 3D controls (탈것, 걷기 방식, the ferry, E and 탐방)', () => {
  const t = npcTalk(guide, 'help', { state: freshState(), places: mapped });
  assert.equal(t.heading, '어떻게 탐방할까요?');
  for (const w of ['탈것', '느린 비행기', '길로만', '자유롭게', '죽도는 남당항에서 배로 갈 수 있어', 'E 키', '탐방 버튼']) assert.ok(t.text.includes(w), w);
});

test('npcTalk mission: the active target with the direct bonus and 미션 시작, or 새 미션 받기 when all are done', () => {
  const s = freshState(), target = mapped.find((p) => p.id === 'hongju');
  s.dailyQuests = { day: dayKey(NOW), targets: ['hongju', 'namdang', 'library'], active: 'hongju', direct: true, started: true };
  const t = npcTalk(guide, 'mission', { state: s, places: mapped });
  assert.equal(t.heading, '다음 목적지는 어디일까요?');
  assert.equal(t.text, `지금 목표는 ${target.name}${/[가-힣]$/.test(target.name) && (target.name.charCodeAt(target.name.length - 1) - 0xac00) % 28 ? '이야' : '야'}. 다른 장소 안내를 열지 않고 직접 도착하면 직행 보너스 ${DIRECT_BONUS}금화를 받아. 나에게 도움을 묻는 것은 괜찮아!`);
  assert.deepEqual(t.next, { label: '미션 시작', id: 'hongju' });
  // every topic offers the same next step (2D npc-next)
  assert.deepEqual(npcTalk(guide, 'region', { state: s, places: mapped }).next, t.next);
  s.questLedger = ['hongju', 'namdang', 'library'].map((place) => ({ day: s.dailyQuests.day, place, bonus: 0 }));
  const done = npcTalk(guide, 'mission', { state: s, places: mapped });
  assert.equal(done.text, '오늘의 미션을 모두 마쳤구나! 새 미션을 받아 또 다른 장소를 만나 보자.');
  assert.deepEqual(done.next, { label: '새 미션 받기', id: null });
  // the particle follows the name's last syllable: 남당항이야, 카페야
  const cafe = { ...target, id: 'cafe-x', name: '카페' };
  s.questLedger = []; s.dailyQuests.targets = ['cafe-x']; s.dailyQuests.active = 'cafe-x';
  assert.ok(npcTalk(guide, 'mission', { state: s, places: [...mapped, cafe] }).text.startsWith('지금 목표는 카페야.'));
  s.dailyQuests.targets = ['namdang']; s.dailyQuests.active = 'namdang';
  assert.ok(npcTalk(guide, 'mission', { state: s, places: mapped }).text.startsWith('지금 목표는 남당항이야.'));
});

test('portraitBox: the sprite cell fits the portrait standing on its feet (2D drawNpc 120, 235, 215 on 240 x 250)', () => {
  const b = portraitBox([0, 0, 100, 200], 240, 250);
  assert.ok(Math.abs(b.dh - 215) < 1e-9, 'a tall cell is 215 high');
  assert.ok(Math.abs(b.dx + b.dw / 2 - 120) < 1e-9, 'centred on x 120');
  assert.ok(Math.abs(b.dy + b.dh - 235) < 1e-9, 'feet on y 235');
  const wide = portraitBox([10, 20, 400, 100], 240, 250);   // a wide cell is limited by the width
  assert.ok(wide.dw <= 240 * 0.92 + 1e-9 && wide.dh < 215);
  assert.ok(Math.abs(wide.dy + wide.dh - 235) < 1e-9);
  assert.ok(Math.abs(wide.dw / wide.dh - 4) < 1e-9, 'aspect kept');
});
