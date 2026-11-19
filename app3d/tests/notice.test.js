import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noticeBands, readableBox, NOTICE_GAP } from '../src/ui/notice.js';
import { overlaps } from '../src/ui/dom.js';

const R = (left, top, right, bottom) => ({ left, top, right, bottom });
const view = R(8, 6, 1272, 754);

test('noticeBands: the four bands around an open dialog never touch the panel', () => {
  const panel = R(360, 210, 920, 550), content = R(378, 224, 902, 538);
  const { big, pill } = noticeBands(view, panel, content);
  assert.deepEqual(big.map((b) => b.name), ['above', 'below', 'left', 'right']);
  for (const b of big) assert.ok(!overlaps(b, panel), `${b.name} overlaps the panel`);
  const above = big[0];
  assert.equal(above.bottom, panel.top - NOTICE_GAP);
  assert.equal(above.top, view.top);
  assert.ok(pill && pill.bottom <= content.top && !overlaps(pill, content), 'the pill band ends above the first readable line');
});

test('noticeBands: a dialog that fills the screen leaves only the strip above its first line, or nothing', () => {
  const tall = noticeBands(R(8, 6, 382, 838), R(12, 23, 378, 830), R(30, 38, 360, 820));
  assert.deepEqual(tall.big.map((b) => b.name), [], 'no room outside the panel');
  assert.ok(tall.pill && tall.pill.bottom <= 38);
  const none = noticeBands(R(8, 6, 382, 838), R(8, 6, 382, 838), R(8, 8, 382, 838));
  assert.equal(none.pill, null);
});

test('noticeBands: a landscape phone dialog leaves the two side strips', () => {
  const { big } = noticeBands(R(8, 6, 836, 384), R(142, 23, 702, 367), R(160, 38, 684, 350));
  assert.deepEqual(big.map((b) => b.name), ['left', 'right']);
  assert.equal(big[0].right, 142 - NOTICE_GAP);
});

test('readableBox: the union of controls and elements that hold text; empty boxes are skipped', () => {
  const node = (rect, { tag = 'DIV', text = '', kids = [] } = {}) => ({
    tagName: tag, getBoundingClientRect: () => ({ ...rect, width: rect.right - rect.left, height: rect.bottom - rect.top }),
    childNodes: text ? [{ nodeType: 3, nodeValue: text }] : [], children: kids,
  });
  const title = node(R(380, 230, 600, 260), { tag: 'H2', text: '충남도서관' });
  const button = node(R(380, 500, 470, 544), { tag: 'BUTTON' });
  const empty = node(R(0, 0, 0, 0), { tag: 'P', text: 'x' });
  const wrapper = node(R(360, 210, 920, 550));   // holds no text itself
  const dialog = { querySelectorAll: () => [wrapper, title, button, empty] };
  assert.deepEqual(readableBox(dialog), R(380, 230, 600, 544));
  assert.equal(readableBox({ querySelectorAll: () => [wrapper] }), null);
});
