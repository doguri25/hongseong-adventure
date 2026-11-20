import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HELP_VIEWS, CONTROLS, KEYS, DOWNLOADS, TEACHER, addressParts } from '../src/ui/help.js';
import { QR_URL, QR_LINES, QR_ALT, QR_IMAGE } from '../src/ui/qr.js';
import { FERRY_LINES, FERRY_HINT, VOYAGE_LABEL, BOARD_LABEL } from '../src/ui/ferry.js';

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

test('every 2D download in the help exists in the 2D game, is linked by the 2D help and points at the deployed 2D copy', () => {
  assert.ok(DOWNLOADS.length >= 10);
  for (const d of DOWNLOADS) {
    assert.ok(fs.existsSync(dist(d.path)), d.path);
    assert.ok(game.includes(`./${d.path}`), `2D help links ${d.path}`);
    // P27: the file the build copies to dist/2d/, by a relative address (the site is served under /hongseong-adventure/)
    assert.equal(d.url, `./2d/${d.path}`);
    assert.ok(d.label.length > 2);
  }
});

test('the teacher notes are the 2D 선생님을 위한 안내, word for word, but 열람 gives the public Pages address (Q8)', () => {
  assert.equal(TEACHER.length, 6);
  const open = TEACHER.find(([label]) => label === '열람:');
  assert.equal(open?.[1], '누구나 https://doguri25.github.io/hongseong-adventure/ 에서 열 수 있어요. QR 코드는 이 접속 주소를 담고 있어요.');
  assert.ok(open[1].includes(QR_URL));
  for (const [label, text] of TEACHER) {
    if (label === '열람:') continue;
    if (!label) { assert.ok(game.includes(`<p>${text}</p>`), text.slice(0, 20)); continue; }
    const at = game.indexOf(`<strong>${label}</strong> `);
    assert.ok(at > 0, label);
    const src = game.slice(at + `<strong>${label}</strong> `.length, game.indexOf('</p>', at));
    assert.equal(text, src.replace('${PLACES.filter(p=>!p.remote).length}', '223'), label);
  }
});

test('the 열람 line is drawn in parts that wrap only after github.io/ and join back to the pinned text', () => {
  const text = TEACHER.find(([label]) => label === '열람:')[1];
  assert.deepEqual(addressParts(text), ['누구나 ', 'https://doguri25.github.io/', 'hongseong-adventure/', ' 에서 열 수 있어요. QR 코드는 이 접속 주소를 담고 있어요.']);
  assert.equal(addressParts(text).join(''), text);
  // the other notes have no address: drawn as they are
  for (const [label, t] of TEACHER) if (label !== '열람:') assert.equal(addressParts(t), null, label);
});

test('the QR keeps the 2D wording and points at the Pages address; the ferry keeps the 2D wording', () => {
  // the 3D's own picture (tools/build/make-qr.py), the size of the 2D one (410 x 410 PNG)
  assert.equal(QR_URL, 'https://doguri25.github.io/hongseong-adventure/');
  assert.equal(QR_ALT, '홍성 탐험대 접속 QR 코드');
  const png = fs.readFileSync(fileURLToPath(QR_IMAGE));
  assert.ok(fileURLToPath(QR_IMAGE).endsWith('/app3d/src/assets/qr-pages.png'), QR_IMAGE);
  assert.ok(png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && png.toString('latin1', 12, 16) === 'IHDR');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [410, 410]);
  // the 2D lines, but not the two about a private build: the Pages site is public
  for (const line of QR_LINES) assert.ok(game.includes(line), line);
  assert.equal(QR_LINES.length, 8);
  for (const line of ['현재는 제작자 확인용 비공개 버전이에요.', '학생 배포에는 사이트의 열람 권한 설정이 필요해요.']) {
    assert.ok(game.includes(line) && !QR_LINES.includes(line), line);
  }
  assert.equal(FERRY_LINES.length, 3);
  assert.ok(game.includes(FERRY_LINES[0]) && game.includes(FERRY_LINES[2]));
  // the dialog opens only at the pier (M7): the boat leaves from here; the return line is the 2D one, its button named
  // as in this game
  const back = FERRY_LINES[1].slice(FERRY_LINES[1].indexOf('돌아올 때는'));
  assert.ok(game.includes(back.replace('화면에 나타나는 ‘죽도에서 돌아가기’', '지도에 나타나는 ‘배 타고 남당항으로’')), 'the return button is named as in this game');
  assert.ok(FERRY_LINES[1].startsWith('버튼을 누르면 이곳 남당항에서 바로 배를 타요.') && !FERRY_LINES[1].includes('이동한 뒤'));
  assert.ok(!BOARD_LABEL.includes('가서'), BOARD_LABEL);
  assert.ok(world.includes(`'${FERRY_HINT}'`));
  assert.ok(world.includes(VOYAGE_LABEL.out) && world.includes(VOYAGE_LABEL.back));
});
