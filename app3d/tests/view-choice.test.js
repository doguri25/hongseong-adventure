// The start choice between the 3D and the light 2D (game/view-choice.js, spec §9-§10, phase 2b Task 3): the pure rule,
// the remembered choice in localStorage['hongseong-view-v1'] behind try/catch, the way back address, and the entry
// (boot.js) that decides before any of the 3D game is fetched.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chooseView, startView, readView, writeView, backAddress, VIEW_KEY, LITE_URL } from '../src/game/view-choice.js';

const src = (p) => fs.readFileSync(fileURLToPath(new URL('../' + p, import.meta.url)), 'utf8');

test('the key and the 2D address', () => {
  assert.equal(VIEW_KEY, 'hongseong-view-v1');
  assert.equal(LITE_URL, './2d/');   // relative: GitHub Pages serves the site under /hongseong-adventure/
});

test('rule 1: ?view=2d opens the 2D and remembers it', () => {
  assert.deepEqual(chooseView({ search: '?view=2d', stored: null, webgl2: true }), { view: '2d', store: '2d' });
  assert.deepEqual(chooseView({ search: '?view=2d', stored: '2d', webgl2: false }), { view: '2d', store: '2d' });
});

test('rule 2: ?view=3d opens the 3D and clears the choice, before the stored choice and the WebGL2 check', () => {
  assert.deepEqual(chooseView({ search: '?view=3d', stored: null, webgl2: true }), { view: '3d', store: null });
  assert.deepEqual(chooseView({ search: '?view=3d', stored: '2d', webgl2: true }), { view: '3d', store: null });
  assert.deepEqual(chooseView({ search: '?view=3d', stored: '2d', webgl2: false }), { view: '3d', store: null });
});

test('rule 3: a remembered 2D opens the 2D and leaves storage as it is', () => {
  assert.deepEqual(chooseView({ search: '', stored: '2d', webgl2: true }), { view: '2d' });
  assert.deepEqual(chooseView({ search: '', stored: '2d', webgl2: false }), { view: '2d' });
});

test('rule 4: no WebGL2 opens the 2D without remembering it', () => {
  assert.deepEqual(chooseView({ search: '', stored: null, webgl2: false }), { view: '2d' });
});

test('rule 5: anything else opens the 3D and leaves storage as it is', () => {
  assert.deepEqual(chooseView({ search: '', stored: null, webgl2: true }), { view: '3d' });
  assert.deepEqual(chooseView({}), { view: '3d' });   // webgl2 defaults to true: only a failed probe says otherwise
  assert.deepEqual(chooseView({ search: undefined, stored: undefined, webgl2: true }), { view: '3d' });
});

test('the ?view= value is matched case-insensitively, with or without the ?, among other parameters', () => {
  assert.deepEqual(chooseView({ search: '?view=2D', stored: null, webgl2: true }), { view: '2d', store: '2d' });
  assert.deepEqual(chooseView({ search: '?view=3D', stored: '2d', webgl2: true }), { view: '3d', store: null });
  assert.deepEqual(chooseView({ search: 'view=2d', stored: null, webgl2: true }), { view: '2d', store: '2d' });
  assert.deepEqual(chooseView({ search: '?a=1&view=3d&b=2', stored: '2d', webgl2: true }), { view: '3d', store: null });
  assert.deepEqual(chooseView({ search: '?view=%202d%20', stored: null, webgl2: true }), { view: '2d', store: '2d' });   // a pasted space
});

test('other ?view= values and other parameters are ignored: the later rules decide', () => {
  for (const search of ['?view=', '?view=4d', '?view=2d3d', '?view=lite', '?views=2d', '?v=2d', '?2d', '#view=2d']) {
    assert.deepEqual(chooseView({ search, stored: null, webgl2: true }), { view: '3d' }, search);
    assert.deepEqual(chooseView({ search, stored: '2d', webgl2: true }), { view: '2d' }, search);
    assert.deepEqual(chooseView({ search, stored: null, webgl2: false }), { view: '2d' }, search);
  }
});

test('only the stored value 2d counts as a remembered choice', () => {
  for (const stored of ['3d', '2D', 'true', '', '{}', 0, false]) assert.deepEqual(chooseView({ search: '', stored, webgl2: true }), { view: '3d' }, String(stored));
});

// a Storage stand-in; blocked: every call throws, as a browser with blocked site data does
function memory(init = {}, { blocked = false } = {}) {
  const m = new Map(Object.entries(init));
  const guard = () => { if (blocked) throw new DOMException('blocked', 'SecurityError'); };
  return {
    m,
    getItem: (k) => { guard(); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { guard(); m.set(k, String(v)); },
    removeItem: (k) => { guard(); m.delete(k); },
  };
}

test('readView / writeView: the key, null clears, undefined leaves it, blocked or missing storage never throws', () => {
  const s = memory();
  assert.equal(readView(s), null);
  writeView(s, '2d'); assert.equal(s.m.get(VIEW_KEY), '2d'); assert.equal(readView(s), '2d');
  writeView(s, undefined); assert.equal(s.m.get(VIEW_KEY), '2d');
  writeView(s, null); assert.equal(s.m.has(VIEW_KEY), false);
  const b = memory({ [VIEW_KEY]: '2d' }, { blocked: true });
  assert.equal(readView(b), null);
  assert.doesNotThrow(() => { writeView(b, '2d'); writeView(b, null); });
  assert.equal(readView(null), null); assert.equal(readView(undefined), null);
  assert.doesNotThrow(() => { writeView(null, '2d'); writeView(undefined, null); });
});

test('startView reads the address, the stored choice and the probe, writes the result and answers the view', () => {
  const probe = (ok) => () => ok;
  let s = memory();
  assert.equal(startView({ search: '?view=2d', storage: s, webgl2: probe(true) }), '2d');
  assert.equal(s.m.get(VIEW_KEY), '2d');
  assert.equal(startView({ search: '', storage: s, webgl2: probe(true) }), '2d', 'a later plain visit opens the 2D again');
  assert.equal(startView({ search: '?view=3d', storage: s, webgl2: probe(true) }), '3d');
  assert.equal(s.m.has(VIEW_KEY), false, '?view=3d clears the choice');
  assert.equal(startView({ search: '', storage: s, webgl2: probe(true) }), '3d', 'and the next visit stays 3D');
  assert.equal(startView({ search: '', storage: s, webgl2: probe(false) }), '2d', 'no WebGL2: the 2D');
  assert.equal(s.m.has(VIEW_KEY), false, 'no WebGL2 is not remembered');
  // the probe runs only when the rule needs it, and a probe that throws counts as no WebGL2
  let probed = 0;
  s = memory({ [VIEW_KEY]: '2d' });
  assert.equal(startView({ search: '', storage: s, webgl2: () => { probed++; return true; } }), '2d');
  assert.equal(startView({ search: '?view=3d', storage: memory(), webgl2: () => { probed++; return false; } }), '3d');
  assert.equal(probed, 0);
  assert.equal(startView({ search: '', storage: memory(), webgl2: () => { throw new Error('no canvas'); } }), '2d');
  // blocked storage still boots: the 3D with WebGL2, the 2D without it (and ?view=2d still opens the 2D)
  const blocked = memory({}, { blocked: true });
  assert.equal(startView({ search: '', storage: blocked, webgl2: probe(true) }), '3d');
  assert.equal(startView({ search: '', storage: blocked, webgl2: probe(false) }), '2d');
  assert.equal(startView({ search: '?view=2d', storage: blocked, webgl2: probe(true) }), '2d');
  assert.equal(startView({ search: '', storage: null, webgl2: probe(true) }), '3d');
});

test('backAddress: the 3D root of this page with ?view=3d, whatever page, query and hash it is on', () => {
  assert.equal(backAddress('https://doguri25.github.io/hongseong-adventure/'), 'https://doguri25.github.io/hongseong-adventure/?view=3d');
  assert.equal(backAddress('https://doguri25.github.io/hongseong-adventure/?view=2d#menu'), 'https://doguri25.github.io/hongseong-adventure/?view=3d');
  assert.equal(backAddress('https://doguri25.github.io/hongseong-adventure/index.html'), 'https://doguri25.github.io/hongseong-adventure/?view=3d');
  assert.equal(backAddress('https://preview.vercel.app/'), 'https://preview.vercel.app/?view=3d');
  assert.equal(backAddress('not a url'), '?view=3d');
});

test('the page loads only boot.js, which imports the game dynamically and nothing heavy statically', () => {
  const html = src('index.html'), boot = src('src/boot.js');
  const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
  assert.deepEqual(scripts, ['<script type="module" src="./src/boot.js">']);
  assert.ok(!html.includes('src/main.js'), 'index.html must not load main.js itself');
  const statics = [...boot.matchAll(/^\s*import\s[^(]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  assert.deepEqual(statics, ['./game/view-choice.js']);
  assert.match(boot, /import\(\s*['"]\.\/main\.js['"]\s*\)/);
  assert.match(boot, /location\.replace\(\s*LITE_URL\s*\)/);
  // view-choice.js is pure: no imports at all, so the entry chunk stays tiny
  assert.doesNotMatch(src('src/game/view-choice.js'), /^\s*import\s/m);
});

test('the 설정 row 가벼운 2D로 열기 links to ./2d/ and the note beside it names ?view=3d for a teacher', () => {
  const html = src('index.html'), menu = src('src/ui/menu.js');
  assert.match(html, /<a class="btn" id="open-2d" href="\.\/2d\/"[^>]*>가벼운 2D로 열기<\/a>/);
  const note = html.match(/<p class="note" id="lite-note"[^>]*>([\s\S]*?)<\/p>/);
  assert.ok(note, 'the note beside the row');
  assert.ok(note[1].includes('?view=3d') && note[1].includes('선생님'), note[1]);
  assert.match(menu, /const LITE_2D = true\b/);
});
