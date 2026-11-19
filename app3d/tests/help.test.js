import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HELP_VIEWS, CONTROLS, KEYS, DOWNLOADS, TEACHER } from '../src/ui/help.js';
import { QR_URL, QR_LINES } from '../src/ui/qr.js';
import { FERRY_LINES, FERRY_HINT, VOYAGE_LABEL } from '../src/ui/ferry.js';

const dist = (p) => fileURLToPath(import.meta.resolve('#game/' + p));   // the 2D game, through the alias (R8)
const game = fs.readFileSync(dist('game.js'), 'utf8'), world = fs.readFileSync(dist('world.js'), 'utf8');

test('the help views follow the 2D sections: 탐방 방법, 설정, 선생님, 자료 출처', () => {
  assert.deepEqual(HELP_VIEWS, [['how', '탐방 방법'], ['settings', '설정'], ['teacher', '선생님'], ['sources', '자료 출처']]);
});

test('the controls list names the 3D controls: stick, drag to turn and tilt, pinch / wheel zoom, tap to go', () => {
  const text = CONTROLS.map(([a, b]) => a + ' ' + b).join(' / ');
  for (const w of ['조이스틱', '끌', '두 손가락', '휠', '땅', '미니맵']) assert.ok(text.includes(w), w);
});

test('the keys list matches the 3D keyboard (input/controls.js): WASD, E, C, T, Q, R / F, + / −, 1–6, Esc', () => {
  assert.deepEqual(KEYS.map(([k]) => k), ['W A S D · 방향키', 'E', 'C', 'T', 'Q', 'R · F', '+ · −', '1–6', 'Esc']);
  const six = KEYS.find(([k]) => k === '1–6')[1];
  assert.equal(six, '걷기 · 자전거 · 자동차 · 슈퍼카 · 느린 비행기 · 비행기');
});

test('every 2D download in the help exists in the 2D game and is linked by the 2D help', () => {
  assert.ok(DOWNLOADS.length >= 10);
  for (const d of DOWNLOADS) {
    assert.ok(fs.existsSync(dist(d.path)), d.path);
    assert.ok(game.includes(`./${d.path}`), `2D help links ${d.path}`);
    assert.equal(typeof d.url, 'string');
    assert.ok(d.label.length > 2);
  }
});

test('the teacher notes are the 2D 선생님을 위한 안내, word for word', () => {
  assert.equal(TEACHER.length, 6);
  for (const [label, text] of TEACHER) {
    if (!label) { assert.ok(game.includes(`<p>${text}</p>`), text.slice(0, 20)); continue; }
    const at = game.indexOf(`<strong>${label}</strong> `);
    assert.ok(at > 0, label);
    const src = game.slice(at + `<strong>${label}</strong> `.length, game.indexOf('</p>', at));
    assert.equal(text, src.replace('${PLACES.filter(p=>!p.remote).length}', '223'), label);
  }
});

test('the QR and the ferry keep the 2D wording and address', () => {
  assert.ok(game.includes(`'${QR_URL}'`));
  for (const line of QR_LINES) assert.ok(game.includes(line), line);
  assert.equal(FERRY_LINES.length, 3);
  assert.ok(game.includes(FERRY_LINES[0]) && game.includes(FERRY_LINES[2]));
  assert.ok(game.includes(FERRY_LINES[1].replace('화면에 나타나는 ‘죽도에서 돌아가기’', '지도에 나타나는 ‘배 타고 남당항으로’')), 'the return button is named as in this game');
  assert.ok(world.includes(`'${FERRY_HINT}'`));
  assert.ok(world.includes(VOYAGE_LABEL.out) && world.includes(VOYAGE_LABEL.back));
});
