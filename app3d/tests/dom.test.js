import { test } from 'node:test';
import assert from 'node:assert/strict';
import { el, escapeHtml, fits44, overlaps, openModal, closeModal } from '../src/ui/dom.js';

test('escapeHtml escapes the five HTML specials and coerces non-strings', () => {
  assert.equal(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`), '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;');
  assert.equal(escapeHtml(12), '12');
  assert.equal(escapeHtml(null), '');
});

test('fits44 needs both sides at least 44', () => {
  assert.equal(fits44({ width: 44, height: 44 }), true);
  assert.equal(fits44({ width: 43.9, height: 60 }), false);
  assert.equal(fits44({ width: 60, height: 43 }), false);
  assert.equal(fits44({ left: 0, top: 0, right: 50, bottom: 50 }), true);   // rect from edges only
});

test('overlaps: touching edges do not overlap, real intersections do', () => {
  const a = { left: 0, top: 0, right: 10, bottom: 10 };
  assert.equal(overlaps(a, { left: 10, top: 0, right: 20, bottom: 10 }), false);
  assert.equal(overlaps(a, { left: 0, top: 10, right: 10, bottom: 20 }), false);
  assert.equal(overlaps(a, { left: 9.9, top: 9.9, right: 20, bottom: 20 }), true);
  assert.equal(overlaps(a, { left: 2, top: 2, right: 4, bottom: 4 }), true);
  assert.equal(overlaps(a, { left: 30, top: 30, right: 40, bottom: 40 }), false);
});

// minimal fake DOM
function fakeNode(name, extra = {}) {
  const listeners = {};
  return {
    name, inert: false, children: [], listeners, parent: null,
    focused: 0,
    focus() { this.focused++; fakeNode.active = this; },
    querySelectorAll() { return this.focusables || []; },
    contains(n) { return n === this || (this.children || []).includes(n); },
    ...extra,
  };
}
function fakeDoc() {
  const handlers = [];
  return {
    handlers,
    addEventListener(t, f) { handlers.push([t, f]); },
    removeEventListener(t, f) { const i = handlers.findIndex((h) => h[0] === t && h[1] === f); if (i >= 0) handlers.splice(i, 1); },
    press(key) { let prevented = false; for (const [t, f] of [...handlers]) if (t === 'keydown') f({ key, preventDefault() { prevented = true; } }); return prevented; },
  };
}
function scene() {
  const doc = fakeDoc();
  const first = fakeNode('first'), second = fakeNode('second');
  const dialog = fakeNode('dialog', { focusables: [first, second], ownerDocument: doc });
  const hud = fakeNode('hud'), canvas = fakeNode('canvas'), loading = fakeNode('loading', { inert: true });
  const root = fakeNode('root', { children: [canvas, hud, loading, dialog] });
  return { doc, first, second, dialog, hud, canvas, loading, root };
}

test('openModal inerts the other children, focuses the first control and closeModal undoes exactly that', () => {
  const s = scene();
  openModal(s.dialog, { root: s.root, returnFocus: s.canvas });
  assert.equal(s.hud.inert, true);
  assert.equal(s.canvas.inert, true);
  assert.equal(s.dialog.inert, false);
  assert.equal(s.first.focused, 1);
  closeModal(s.dialog);
  assert.equal(s.hud.inert, false);
  assert.equal(s.canvas.inert, false);
  assert.equal(s.loading.inert, true, 'a sibling that was already inert stays inert');
  assert.equal(s.canvas.focused, 1, 'focus returns to the canvas');
  assert.equal(s.doc.handlers.length, 0, 'the Escape handler is removed');
});

test('Escape calls onClose once while open and nothing after close', () => {
  const s = scene();
  let closed = 0;
  openModal(s.dialog, { root: s.root, returnFocus: s.canvas, onClose: () => { closed++; closeModal(s.dialog); } });
  assert.equal(s.doc.press('a'), false);
  assert.equal(closed, 0);
  assert.equal(s.doc.press('Escape'), true);
  assert.equal(closed, 1);
  assert.equal(s.doc.press('Escape'), false);
  assert.equal(closed, 1);
});

test('closeModal on a dialog that is not open is a no-op', () => {
  const s = scene();
  closeModal(s.dialog);
  assert.equal(s.canvas.focused, 0);
});
