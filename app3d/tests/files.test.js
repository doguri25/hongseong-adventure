import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resultText, saveFile, readSaveFile, writeSave, download, MAX_SAVE_BYTES, SAVE_NAME, RESULT_NAME } from '../src/game/files.js';
import { freshState, sanitizeState, discover, answer, purchase, rankFor, STORAGE_KEY } from '#game/core.js';
import { PLACES } from '#game/content.js';
import { dayKey } from '#game/quests.js';

const NOW = Date.UTC(2026, 10, 19, 3, 0);   // 2026-11-19 12:00 KST
const byId = (id) => PLACES.find((p) => p.id === id);

// a save as the 2D game writes it (dist/game.js: JSON.stringify(state, null, 2)), slightly tampered: an unknown place,
// a solved place that was never discovered and a coin count the actions do not earn
function twoDSave() {
  const s = freshState();
  discover(s, 'library'); discover(s, 'hongju');
  answer(s, 'library', byId('library').quiz.answer);
  s.note = '나는 홍예공원을 소개하고 싶어.';
  s.locations = { county: [126.66, 36.65] };
  s.questLedger = [{ day: '2026-11-18', place: 'library', bonus: 50 }];
  const raw = JSON.parse(JSON.stringify(s));
  raw.discovered.push('no-such-place');
  raw.solved.push('song');
  raw.coins = 999999;
  return raw;
}

test('importRejectsBadFiles: oversize, bad JSON, version 2, no discovered array; nothing is returned to load', () => {
  const good = saveFile(freshState());
  assert.equal(MAX_SAVE_BYTES, 200000);
  // oversize: by the file's own size (2D f.size > 200000), and by the text when no size is given
  assert.deepEqual(readSaveFile(good, 200001), { ok: false, reason: 'size' });
  assert.equal(readSaveFile(good, 200000).ok, true);
  assert.deepEqual(readSaveFile(JSON.stringify({ ...freshState(), note: '가'.repeat(70000) })), { ok: false, reason: 'size' });   // 3 bytes each in UTF-8
  // not JSON at all
  assert.deepEqual(readSaveFile('{"version":1,"discovered":[', 30), { ok: false, reason: 'json' });
  assert.deepEqual(readSaveFile('', 0), { ok: false, reason: 'json' });
  // JSON, but not a version 1 save with a discovered array
  assert.deepEqual(readSaveFile(JSON.stringify({ ...freshState(), version: 2 })), { ok: false, reason: 'format' });
  const noList = freshState(); delete noList.discovered;
  assert.deepEqual(readSaveFile(JSON.stringify(noList)), { ok: false, reason: 'format' });
  assert.deepEqual(readSaveFile(JSON.stringify({ ...freshState(), discovered: 'library' })), { ok: false, reason: 'format' });
  for (const text of ['null', '[]', '1', '"save"']) assert.deepEqual(readSaveFile(text), { ok: false, reason: 'format' }, text);
});

test('importRejectsBadFiles accepts a real 2D save, cleaned by sanitizeState (unknown ids dropped, coins rebuilt)', () => {
  const raw = twoDSave(), text = JSON.stringify(raw, null, 2);
  const r = readSaveFile(text, Buffer.byteLength(text));
  assert.equal(r.ok, true);
  assert.deepEqual(r.state, sanitizeState(raw));
  assert.deepEqual(r.state.discovered, ['library', 'hongju']);
  assert.deepEqual(r.state.solved, ['library']);
  assert.notEqual(r.state.coins, 999999);
  assert.equal(r.state.coins, byId('library').coins + byId('hongju').coins + 20 + 50);   // discoveries, the quiz, the ledger bonus
  assert.equal(r.state.note, '나는 홍예공원을 소개하고 싶어.');
  assert.deepEqual(r.state.locations.county, [126.66, 36.65]);
});

test('saveFile writes the 2D format and round-trips through readSaveFile', () => {
  const s = freshState();
  discover(s, 'library'); discover(s, 'song');
  answer(s, 'library', byId('library').quiz.answer);
  s.coins += 100;
  purchase(s, 'outfit-ocean');
  s.note = '친구에게 충남도서관을 소개할래요.\n책이 많거든요!';
  s.character = 'raccoon';
  s.locations = { county: [126.6, 36.6] };
  s.travelSpeed = 'bike';
  s.coins = sanitizeState(s).coins;   // the 100 seeded coins are not earned: keep the state self-consistent
  const text = saveFile(s);
  assert.equal(text, JSON.stringify(s, null, 2));   // dist/game.js export-save / backup-first
  const r = readSaveFile(text, Buffer.byteLength(text));
  assert.equal(r.ok, true);
  assert.deepEqual(r.state, s);
  assert.equal(SAVE_NAME, '홍성모험수첩_이어하기.json');
});

test('resultText is the 2D exportResult text: BOM, counts, the discovered list with quiz status, note, mission ledger', () => {
  const s = freshState();
  discover(s, 'library'); discover(s, 'hongju');
  answer(s, 'library', byId('library').quiz.answer);
  s.note = '홍주읍성을 소개하고 싶어요.';
  s.questLedger = [{ day: '2026-11-18', place: 'library', bonus: 50 }, { day: '2026-11-19', place: 'hongju', bonus: 0 }];
  const text = resultText(s, PLACES, NOW), lines = text.split('\n');
  assert.equal(RESULT_NAME, '홍성모험수첩_탐방결과.txt');
  assert.ok(text.startsWith('﻿홍성 모험 수첩 · 나의 탐방 결과\n'));
  assert.ok(lines.includes(`날짜: ${dayKey(NOW)}`));
  assert.equal(dayKey(NOW), '2026-11-19');
  assert.ok(lines.includes(`발견: 2 / ${PLACES.length}곳`));
  assert.ok(lines.includes(`퀴즈: 1 / ${PLACES.length}개`));
  assert.equal(PLACES.length, 241);
  assert.ok(lines.includes(`탐험 점수: ${s.xp}점`));
  assert.ok(lines.includes(`칭호: ${rankFor(s.xp)}`));
  // discovered places in PLACES order, each with its area and quiz status
  const list = lines.slice(lines.indexOf('내가 발견한 장소') + 1, lines.indexOf('내가 발견한 장소') + 3);
  const expected = PLACES.filter((p) => s.discovered.includes(p.id)).map((p) => `- ${p.name} (${p.area}) · 퀴즈 ${p.id === 'library' ? '완료' : '아직'}`);
  assert.deepEqual(list, expected);
  assert.ok(text.includes('- 충남도서관 (홍성군 홍북읍) · 퀴즈 완료'));
  assert.ok(text.includes(`- ${byId('hongju').name} (${byId('hongju').area}) · 퀴즈 아직`));
  assert.ok(lines.includes('친구에게 소개하고 싶은 장소와 까닭'));
  assert.ok(lines.includes('홍주읍성을 소개하고 싶어요.'));
  assert.ok(lines.includes('완료한 미션'));
  assert.ok(lines.includes('- 2026-11-18 충남도서관 · 직행 보너스 50금화'));
  assert.ok(lines.includes(`- 2026-11-19 ${byId('hongju').name} · 직행 보너스 0금화`));
  // nothing written yet: the 2D placeholder; nothing found: an empty list
  const empty = resultText(freshState(), PLACES, NOW);
  assert.ok(empty.includes('친구에게 소개하고 싶은 장소와 까닭\n(아직 적지 않았어요)'));
  assert.ok(empty.includes(`발견: 0 / ${PLACES.length}곳`));
  assert.ok(empty.includes('내가 발견한 장소\n\n친구에게'));
});

test('writeSave puts the imported progress under the shared save key; a blocked storage does not throw', () => {
  const m = new Map(), storage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) };
  const s = readSaveFile(JSON.stringify(twoDSave())).state;
  assert.equal(writeSave(storage, s), true);
  assert.equal(STORAGE_KEY, 'hongseong-adventure-v1');
  assert.deepEqual(JSON.parse(m.get(STORAGE_KEY)), s);
  assert.equal(writeSave({ setItem() { throw new Error('quota'); } }, s), false);
});

test('download hands the text to an <a download> blob link and removes it again', async () => {
  const made = [], body = { kids: [], append(n) { this.kids.push(n); n.parent = this; } };
  const doc = { body, createElement(tag) { const n = { tag, clicked: 0, click() { this.clicked++; }, remove() { body.kids.splice(body.kids.indexOf(this), 1); } }; made.push(n); return n; } };
  download(doc, SAVE_NAME, '{"version":1}', 'application/json');
  assert.equal(made.length, 1);
  const a = made[0];
  assert.equal(a.tag, 'a');
  assert.equal(a.download, SAVE_NAME);
  assert.match(a.href, /^blob:/);
  assert.equal(a.clicked, 1);
  assert.equal(body.kids.length, 0);
});
