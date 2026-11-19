// Headless browser smoke check for the built 3D app (run: npm run build:3d && node app3d/tests/smoke.mjs).
// Serves build/app3d with a tiny static server, opens it in Chromium (SwiftShader WebGL) at a desktop and a phone
// viewport, waits for window.__hs3d.ready, then checks: no page errors, all six travel modes are accepted or refused
// with a toast, the floating stick moves the player, and a lost WebGL context shows #lost. A quick touch-tablet pass
// checks the credit stays collapsed, a short touch in the stick zone taps, and action keys pressed while the world
// is still loading are ignored; a quick phone-landscape pass covers the short screen. At all four viewports the HUD
// is checked: every control >= 44x44, nothing interactive in the stick zone on touch screens (folded and open mission
// card, vehicle picker, car turn buttons), the minimap draws, the 탐방 button opens a place in reach, and a driven
// arrival shows the big notice. Screenshots go to OUT (SMOKE_OUT, default a folder in the system temp directory;
// SMOKE_ONLY=tablet,phone,landscape runs only those passes).
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../../build/app3d');
const OUT = process.env.SMOKE_OUT || path.join(os.tmpdir(), 'hongseong-3d-smoke');
const READY_MS = Number(process.env.SMOKE_READY_MS) || 240000;
const MODES = ['walk', 'bike', 'car', 'supercar', 'slowplane', 'plane'];
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.woff': 'font/woff', '.wasm': 'application/wasm', '.txt': 'text/plain',
};

function serve(root) {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.normalize(path.join(root, url));
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (err, body) => {
      if (err) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const failures = [];
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures.push(msg); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Synthetic touch drag on the canvas: press on the left (stick zone), hold the knob up for `ms`, release.
async function dragStick(page, label) {
  return page.evaluate(async ({ ms }) => {
    const c = document.getElementById('c'), w = innerWidth, h = innerHeight;
    const x = Math.round(w * 0.2), y = Math.round(h * 0.7), id = 41;
    const ev = (type, cx, cy) => c.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: true, clientX: cx, clientY: cy, bubbles: true, cancelable: true, buttons: type === 'pointerup' ? 0 : 1 }));
    const before = [window.__hs3d.player.x, window.__hs3d.player.y];
    ev('pointerdown', x, y);
    const t0 = performance.now();
    let shown = false;
    while (performance.now() - t0 < ms) {
      ev('pointermove', x + 4, y - 60);
      if (!document.getElementById('stick').hidden) shown = true;
      await new Promise((r) => setTimeout(r, 100));
    }
    ev('pointerup', x + 4, y - 60);
    const after = [window.__hs3d.player.x, window.__hs3d.player.y];
    return { moved: Math.hypot(after[0] - before[0], after[1] - before[1]), shown, stickHidden: document.getElementById('stick').hidden };
  }, { ms: 5000, label });
}

// Accessibility floor for the HUD and dialogs: every visible control is at least 44x44 CSS px, every sentence a child
// reads is at least 15 px; short labels inside buttons and chips may be smaller (labels 13, factor / key labels 12).
const TEXT_15 = ['#where', '.stats', '.hint', '.credit .lead', '.credit summary', '#toast', '.notice span', '#turn-hint', '.act', '#mission-detail', '#npc-body', '#place-body', '.dialog .blurb', '.dialog .meta', '.dialog .reward', '.quiz .feedback', '#loading-step', '#lost p'];
const LABEL_MIN = [['.travel button span', 13], ['.travel button small', 12], ['.dialog .tag', 13], ['.skill .lbl', 13], ['.skill small', 12], ['.mission-kick', 13], ['#mission-title', 13], ['.mission .badge', 13], ['.mission-foot .btn', 13], ['#speed-factor', 12], ['.cam-pad button', 13]];
// touch screens: nothing interactive in the stick zone (left 42 % of the width, lower 45 % of the height) while
// playing; overlaps() as ui/dom.js: edges that only touch do not count
async function measureUi(page, touch) {
  return page.evaluate(({ TEXT_15, LABEL_MIN, touch }) => {
    const small = [], fonts = [], inZone = [];
    const zone = { left: 0, top: innerHeight * 0.55, right: innerWidth * 0.42, bottom: innerHeight };
    const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    let controls = 0;
    for (const el of document.querySelectorAll('button, summary, a[href], [role="button"], input, select')) {
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none') continue;
      controls++;
      const label = `${el.id || el.dataset.mode || el.className || el.tagName}("${el.textContent.trim().slice(0, 10)}")`;
      if (r.width < 43.5 || r.height < 43.5) small.push(`${label} ${r.width.toFixed(1)}x${r.height.toFixed(1)}`);
      if (touch && !el.closest('.scrim') && overlaps(r, zone)) inZone.push(`${label} at ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    const rules = [...TEXT_15.map((s) => [s, 15]), ...LABEL_MIN];
    for (const [sel, min] of rules) for (const el of document.querySelectorAll(sel)) {
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (px < min) fonts.push(`${sel} ${px}px < ${min}`);
    }
    return { controls, small, fonts, inZone };
  }, { TEXT_15, LABEL_MIN, touch: !!touch });
}
async function checkUi(page, name, where, touch = false) {
  const ui = await measureUi(page, touch);
  check(ui.small.length === 0, `${name} ${where}: ${ui.controls} visible controls are >= 44x44${ui.small.length ? ' — too small: ' + ui.small.join(', ') : ''}`);
  check(ui.fonts.length === 0, `${name} ${where}: sentences >= 15 px, labels at their minimum${ui.fonts.length ? ' — ' + ui.fonts.join(', ') : ''}`);
  if (touch) check(ui.inZone.length === 0, `${name} ${where}: no control in the stick zone${ui.inZone.length ? ' — ' + ui.inZone.join(', ') : ''}`);
}

// The HUD's own pieces: the mission card folded and open, the vehicle picker (and a choice through it), the minimap
// drawing, and the 탐방 button: dimmed with a toast away from places, opening the place in reach next to one.
async function checkHud(page, name, spec, shot) {
  const touch = !!spec.touch;
  await page.evaluate(() => { const W = window.__hs3d.world; W.target = null; window.__hs3d.closeDialogs(); window.__hs3d.setMode('walk'); });
  await sleep(2900);   // the mode toast fades
  for (let i = 0; i < 2; i++) {
    const open = await page.evaluate(() => { const t = document.getElementById('mission-toggle'); t.click(); return t.getAttribute('aria-expanded') === 'true'; });
    await sleep(400);
    const card = await page.evaluate(() => ({ title: document.getElementById('mission-title').textContent, body: !document.getElementById('mission-body').hidden, go: !document.getElementById('mission-go').hidden }));
    check(card.title.length > 0 && card.body === open, `${name}: mission card ${open ? 'opens' : 'folds'} ("${card.title}")`);
    await checkUi(page, name, `mission card ${open ? 'open' : 'folded'}`, touch);
    if (open) await shot('hud-mission-open'); else await shot('hud-mission-folded');
  }
  const pick = await page.evaluate(() => { document.getElementById('vehicle-btn').click(); const t = document.getElementById('travel'); return { open: !t.hidden, expanded: document.getElementById('vehicle-btn').getAttribute('aria-expanded') }; });
  check(pick.open && pick.expanded === 'true', `${name}: the 탈것 button opens the vehicle picker`);
  await sleep(300);
  await checkUi(page, name, 'vehicle picker open', touch);
  await shot('hud-vehicle-picker');
  const chose = await page.evaluate(() => { document.querySelector('#travel [data-mode="bike"]').click(); return { mode: window.__hs3d.player.mode, closed: document.getElementById('travel').hidden, toast: document.getElementById('toast').textContent }; });
  check(chose.closed && (chose.mode === 'bike' || chose.toast.length > 0), `${name}: choosing 자전거 in the picker -> mode ${chose.mode}, picker closed`);
  await page.evaluate(() => window.__hs3d.setMode('walk'));
  // the minimap: the county picture is drawn (not one flat colour)
  await page.waitForFunction(() => window.__hs3d.world.minimap.ready, null, { timeout: 20000, polling: 300 }).catch(() => {});
  await sleep(600);
  const mm = await page.evaluate(() => {
    const c = document.getElementById('minimap-canvas'), g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data;
    const colours = new Set();
    let painted = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { painted++; colours.add((d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | d[i + 2] >> 3); }
    return { w: c.width, painted: painted / (c.width * c.height || 1), colours: colours.size };
  });
  check(mm.w > 0 && mm.painted > 0.6 && mm.colours > 60, `${name}: minimap draws the county (${mm.w}px, ${(mm.painted * 100).toFixed(0)}% painted, ${mm.colours} colours)`);
  // 탐방 away from every place: dimmed, a toast on press, no dialog
  const away = await page.evaluate(async () => {
    const W = window.__hs3d.world, far = (x, y) => W.places.every((p) => Math.hypot(p.point[0] - x, p.point[1] - y) > 1200);
    let spot = null;   // dry land at least 1.2 km from every place
    for (let y = 3000; y < 24000 && !spot; y += 1000) for (let x = 3000; x < 32000 && !spot; x += 1000) if (far(x, y) && !W.waterGuard.blocked([x, y])) spot = [x, y];
    window.__hs3d.closeDialogs(); window.__hs3d.setMode('walk');
    if (spot) window.__hs3d.teleport(spot[0], spot[1]);
    await new Promise((r) => setTimeout(r, 2900));   // the mode toast fades first
    const b = document.getElementById('visit-btn');
    b.click();
    return { dim: b.classList.contains('dim'), dialog: W.ctl.paused(), toast: document.getElementById('toast').classList.contains('show') ? document.getElementById('toast').textContent : '' };
  });
  if (away.dialog) await page.evaluate(() => window.__hs3d.closeDialogs());
  check(away.dim && !away.dialog && away.toast.length > 0, `${name}: 탐방 is dimmed away from places and answers with a toast ("${away.toast}")`);
  // 탐방 next to a place: opens that place as a visit
  const near = await page.evaluate(async () => {
    const W = window.__hs3d.world;
    for (const p of W.places) {
      if (p.ring) continue;
      window.__hs3d.closeDialogs();
      if (!window.__hs3d.teleport(p.point[0] + 8, p.point[1] + 8)) continue;
      await new Promise((r) => setTimeout(r, 700));
      const b = document.getElementById('visit-btn');
      if (b.classList.contains('dim')) continue;
      b.click();
      return { id: p.id, opened: W.dialog.isOpen ? W.dialog.place?.id : null };
    }
    return null;
  });
  check(!!near && near.opened === near.id, `${name}: 탐방 next to a place opens it (${near ? near.id + ' -> ' + near.opened : 'no place found'})`);
  await page.evaluate(() => window.__hs3d.closeDialogs());
}

// Records every big-notice the HUD shows (title, line, and whether it sits above the dialog scrim and inside the screen).
async function watchNotices(page) {
  await page.evaluate(() => {
    if (window.__notices) { window.__notices.length = 0; return; }
    window.__notices = [];
    const n = document.getElementById('notice');
    new MutationObserver(() => {
      if (!n.classList.contains('show')) return;
      const scrim = getComputedStyle(document.querySelector('.scrim')).zIndex;
      window.__notices.push({ title: n.querySelector('b').textContent, sub: n.querySelector('span').textContent, above: Number(getComputedStyle(n).zIndex) > Number(scrim), fits: n.scrollWidth <= innerWidth - 16, opacity: getComputedStyle(n).animationName });
    }).observe(n, { attributes: true, attributeFilter: ['class'] });
  });
}

// Arrival while driving: the dialog stops player and car, closing it fires nothing again, and the arrival shows the
// big notice (도착! / 새로운 발견! / 직행 미션 성공! / 탐방 미션 완료!).
async function driveArrival(page, name, shot) {
  await watchNotices(page);
  const drive = await page.evaluate(() => {
    const W = window.__hs3d.world;
    for (const p of W.places) {
      const n = W.graph.nearest(p.point[0], p.point[1], 120);
      if (!n || n.edge.len < 700) continue;
      const s0 = n.s > n.edge.len / 2 ? n.s - 320 : n.s + 320, at = W.graph.at(n.edge, s0);
      window.__hs3d.closeDialogs();
      if (!window.__hs3d.teleport(at[0], at[1])) continue;
      if (!window.__hs3d.setMode('car').ok) continue;
      W.target = [p.point[0], p.point[1]];
      return { id: p.id };
    }
    return null;
  });
  if (!drive) { check(false, `${name}: found a road-side place to drive to`); return; }
  let opened = null;
  for (let i = 0; i < 120 && !opened; i++) {
    await sleep(500);
    opened = await page.evaluate(() => { const W = window.__hs3d.world; return W.dialog.isOpen ? { id: W.dialog.place?.id, speed: W.player.speed, carSpeed: W.player.car ? W.player.car.speed : null, hasCar: !!W.player.car, paused: W.ctl.paused() } : null; });
  }
  check(!!opened && opened.hasCar && opened.paused, `${name}: driving into a place opens its dialog and pauses (${opened ? opened.id : 'never opened'})`);
  if (!opened) return;
  await sleep(150);
  await shot('9-arrival-notice');
  const notices = await page.evaluate(() => window.__notices.slice());
  const arrival = notices.find((n) => ['도착!', '새로운 발견!', '직행 미션 성공!', '탐방 미션 완료!'].includes(n.title));
  check(!!arrival && arrival.above && arrival.fits, `${name}: the arrival shows the big notice over the dialog (${notices.map((n) => n.title + (n.sub ? ' ' + n.sub : '')).join(' / ') || 'none'})`);
  await sleep(450);
  const still = await page.evaluate(() => { const W = window.__hs3d.world; return { speed: W.player.speed, carSpeed: W.player.car.speed, target: W.target }; });
  check(still.speed === 0 && still.carSpeed === 0 && !still.target, `${name}: player and car are at rest behind the dialog (${JSON.stringify(still)})`);
  const closed = await page.evaluate(() => { const W = window.__hs3d.world; document.getElementById('place-close').click(); return { open: W.dialog.isOpen, paused: W.ctl.paused(), carSpeed: W.player.car.speed }; });
  check(!closed.open && !closed.paused && closed.carSpeed === 0, `${name}: closing resumes play with the car at 0 (${JSON.stringify(closed)})`);
  await sleep(4000);
  const after = await page.evaluate(() => { const W = window.__hs3d.world; return { open: W.dialog.isOpen, id: W.dialog.place?.id ?? null, carSpeed: W.player.car ? W.player.car.speed : null }; });
  check(!(after.open && after.id === opened.id) && !after.open && after.carSpeed === 0, `${name}: the same place does not reopen and the car stays at rest (${JSON.stringify(after)})`);
}

async function run(browser, base, spec) {
  const { name, viewport, touch } = spec;
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1, locale: 'ko-KR' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.stack || e)));
  page.on('console', (m) => { if (m.type() === 'error') console.log(`  [${name} console.error] ${m.text().slice(0, 300)}`); });
  const shot = (file) => page.screenshot({ path: path.join(OUT, `${name}-${file}.png`) });

  if (spec.keysWhileLoading) {
    // M5: action keys (quality, time, camera) pressed while the world is still loading must be ignored, not throw
    await page.addInitScript(() => {
      const codes = ['KeyQ', 'KeyT', 'KeyC', 'KeyE', 'Digit3'];
      let n = 0;
      const id = setInterval(() => {
        // stop at the last loading step: from there on the game is live and keys act normally
        if (window.__hs3d || document.getElementById('loading')?.hidden || document.getElementById('loading-step')?.textContent === '첫 화면을 그리는 중') { clearInterval(id); return; }
        const code = codes[n++ % codes.length];
        window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
        window.__keysWhileLoading = n;
      }, 40);
    });
  }
  const t0 = Date.now();
  await page.goto(base + '/index.html', { waitUntil: 'load' });
  let ready = false;
  try { await page.waitForFunction(() => window.__hs3d && window.__hs3d.ready === true, null, { timeout: READY_MS, polling: 500 }); ready = true; } catch {}
  check(ready, `${name}: __hs3d.ready within ${READY_MS / 1000} s (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  if (!ready) {
    await shot('not-ready').catch(() => {});
    check(errors.length === 0, `${name}: no pageerror (${errors.join(' | ').slice(0, 400)})`);
    await ctx.close();
    return;
  }
  // let the ground levels, terrain chunks and trees stream in
  await page.waitForFunction(() => window.__hs3d.info().groundLevels >= 2, null, { timeout: 120000, polling: 1000 }).catch(() => {});
  await sleep(4000);
  const info = await page.evaluate(() => window.__hs3d.info());
  console.log(`  ${name} info: ${JSON.stringify(info)}`);
  check(info.buildings > 2000 && info.realBuildings >= 2000, `${name}: buildings ${info.buildings} (real ${info.realBuildings})`);
  check(info.places === 223, `${name}: 223 mapped places (${info.places})`);
  check(info.npcs >= 50, `${name}: NPCs placed (${info.npcs})`);
  check(info.lamps > 0, `${name}: street lamps (${info.lamps})`);
  check(info.terrainChunks > 0, `${name}: terrain chunks built (${info.terrainChunks})`);
  if (spec.keysWhileLoading) {
    const k = await page.evaluate(() => ({ n: window.__keysWhileLoading || 0, q: window.__hs3d.info().quality.mode }));
    check(k.n > 0 && errors.length === 0, `${name}: ${k.n} action keys pressed while loading were ignored without errors (quality ${k.q})`);
  }
  await shot('1-start');
  if (spec.quick) {
    // touch tablet: the credit stays a collapsed toggle, and a short still touch in the stick zone taps the map
    const credit = await page.evaluate(() => { const d = document.getElementById('credit'), r = d.querySelector('summary').getBoundingClientRect(); return { open: d.open, w: r.width, h: r.height }; });
    check(!credit.open && credit.w >= 44 && credit.h >= 44, `${name}: credit collapsed behind its ${credit.w.toFixed(0)}x${credit.h.toFixed(0)} toggle`);
    const tapped = await page.evaluate(() => {
      const c = document.getElementById('c'), x = Math.round(innerWidth * 0.2), y = Math.round(innerHeight * 0.62), W = window.__hs3d.world;
      const ev = (type) => c.dispatchEvent(new PointerEvent(type, { pointerId: 51, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true }));
      W.target = null;
      ev('pointerdown'); ev('pointerup');   // back to back: a SwiftShader frame can outlast the 400 ms tap window
      return { target: !!W.target, dialog: !document.getElementById('place-dialog').hidden };
    });
    check(tapped.target || tapped.dialog, `${name}: a short touch in the stick zone reached the map (${tapped.target ? 'walk target set' : tapped.dialog ? 'place opened' : 'nothing'})`);
    await page.evaluate(() => { window.__hs3d.world.target = null; window.__hs3d.closeDialogs(); });   // stop the tap's walk
    await checkUi(page, name, 'start', spec.touch);
    await checkHud(page, name, spec, shot);
    const car = await page.evaluate(() => window.__hs3d.setMode('car').ok);
    await sleep(2500);
    if (car) { await checkUi(page, name, 'car (turn buttons)', spec.touch); await shot('3-mode-car'); }
    await driveArrival(page, name, shot);
    await page.evaluate(() => { window.__hs3d.closeDialogs(); window.__hs3d.setMode('walk'); });
    check(errors.length === 0, `${name}: no pageerror${errors.length ? ' — ' + errors.join(' | ').slice(0, 600) : ''}`);
    await ctx.close();
    return;
  }
  await checkUi(page, name, 'start', spec.touch);
  if (spec.touch) { await page.evaluate(() => { document.getElementById('credit').open = true; }); await sleep(300); await checkUi(page, name, 'credit open', spec.touch); await shot('1b-credit-open'); await page.evaluate(() => { document.getElementById('credit').open = false; }); }

  // floating stick (walking)
  const drag = await dragStick(page, name);
  check(drag.shown, `${name}: stick drawn while dragging`);
  check(drag.stickHidden, `${name}: stick hidden after release`);
  check(drag.moved > 1, `${name}: stick drag moved the player ${drag.moved.toFixed(1)} m`);
  await shot('2-after-walk');

  // the six travel modes
  for (const mode of MODES) {
    const r = await page.evaluate((m) => { const res = window.__hs3d.setMode(m); const t = document.getElementById('toast'); return { ok: !!(res && res.ok), toast: t && t.classList.contains('show') ? t.textContent : '', mode: window.__hs3d.player.mode, pending: window.__hs3d.player.pending }; }, mode);
    check(r.ok || r.toast.length > 0, `${name}: setMode('${mode}') ${r.ok ? 'accepted' : 'refused'} -> mode ${r.mode}${r.pending ? ' (landing as ' + r.pending + ')' : ''}${r.toast ? ' · toast "' + r.toast + '"' : ''}`);
    await sleep(mode === 'plane' || mode === 'car' ? 6000 : 2500);
    if (mode === 'car' || mode === 'plane' || mode === 'bike') await shot(`3-mode-${mode}`);
    if (mode === 'car') await checkUi(page, name, 'car (turn buttons)', spec.touch);
  }
  // camera and time presets render
  await page.evaluate(() => { window.__hs3d.toggleCamera(); window.__hs3d.applyTime('night'); });
  await sleep(4000);
  await shot('4-plane-follow-night');
  await page.evaluate(() => { window.__hs3d.toggleCamera(); window.__hs3d.applyTime('day'); window.__hs3d.setMode('walk'); });
  await sleep(9000);
  // the place dialog (opened as a tap on a pin would)
  const dialog = await page.evaluate(() => { window.__hs3d.openPlace('library'); const d = document.getElementById('place-dialog'); return { open: !d.hidden, text: d.textContent.slice(0, 80) }; });
  check(dialog.open, `${name}: place dialog opens (${dialog.text.replace(/\s+/g, ' ')})`);
  await sleep(1500);
  await shot('5-place-dialog');
  await checkUi(page, name, 'place dialog');
  for (let i = 0; i < 8; i++) {   // page through to the quiz step (read-only here: the quiz screen offers "여기로 가기")
    const label = await page.evaluate(() => { const b = document.querySelector('#place-footer .btn.primary'); if (!b) return ''; const t = b.textContent; if (/다음|퀴즈/.test(t)) b.click(); return t; });
    if (!/다음|퀴즈/.test(label)) break;
    await sleep(300);
  }
  await checkUi(page, name, 'quiz step');
  await shot('5b-quiz-step');
  await page.evaluate(() => document.getElementById('place-close').click());
  await checkHud(page, name, spec, shot);
  await driveArrival(page, name, shot);
  await page.evaluate(() => { window.__hs3d.closeDialogs(); window.__hs3d.setMode('walk'); });

  if (spec.tour) {
    // the west coast at 남당항 (sea to the west, ferry button) and the town of 홍성읍 from further out
    const coast = await page.evaluate(() => { const W = window.__hs3d.world; return window.__hs3d.teleport(W.docks.namdang[0] + 30, W.docks.namdang[1]); });
    await sleep(8000);
    const ferry = await page.evaluate(() => { window.__hs3d.closeDialogs(); const b = document.getElementById('ferry-btn'); return { shown: !b.hidden, text: b.textContent }; });
    check(!!coast && ferry.shown, `${name}: ferry button near 남당항 ("${ferry.text}")`);
    await sleep(1500);
    await shot('7-west-coast-namdang');
    await checkUi(page, name, 'ferry and talk buttons', spec.touch);
    await page.evaluate(() => { const W = window.__hs3d.world, p = W.byId.get('hongju').point; window.__hs3d.teleport(p[0], p[1] + 150); W.view.zoom = 3.2; W.view.pitchAdj = -8; });
    await sleep(10000);
    await page.evaluate(() => window.__hs3d.closeDialogs());
    await sleep(1500);
    await shot('8-hongseong-eup');
    await page.evaluate(() => { const W = window.__hs3d.world; W.view.zoom = 1; W.view.pitchAdj = 0; });
  }

  check(errors.length === 0, `${name}: no pageerror${errors.length ? ' — ' + errors.join(' | ').slice(0, 600) : ''}`);

  // WebGL context loss pauses the loop and shows #lost
  const lost = await page.evaluate(async () => {
    const gl = document.getElementById('c').getContext('webgl2') || document.getElementById('c').getContext('webgl');
    const ext = gl && gl.getExtension('WEBGL_lose_context');
    if (!ext) return { ext: false };
    ext.loseContext();
    await new Promise((r) => setTimeout(r, 1500));
    const el = document.getElementById('lost');
    return { ext: true, visible: !el.hidden && getComputedStyle(el).display !== 'none', paused: window.__hs3d.info().running === false };
  });
  check(lost.ext && lost.visible, `${name}: #lost visible after WEBGL_lose_context`);
  check(lost.paused, `${name}: render loop paused after context loss`);
  await shot('6-context-lost');
  await checkUi(page, name, 'context lost');
  check(errors.length === 0, `${name}: still no pageerror after context loss${errors.length ? ' — ' + errors.join(' | ').slice(0, 600) : ''}`);
  await ctx.close();
}

async function main() {
  if (!fs.existsSync(path.join(ROOT, 'index.html'))) { console.error('build/app3d/index.html missing: run npm run build:3d first'); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve(ROOT);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  try {
    for (const spec of [
      { name: 'desktop', viewport: { width: 1280, height: 760 }, touch: false, tour: true },
      { name: 'phone', viewport: { width: 390, height: 844 }, touch: true, tour: true },
      { name: 'tablet', viewport: { width: 1024, height: 768 }, touch: true, quick: true, keysWhileLoading: true },
      { name: 'landscape', viewport: { width: 844, height: 390 }, touch: true, quick: true },
    ].filter((s) => !process.env.SMOKE_ONLY || process.env.SMOKE_ONLY.split(',').includes(s.name))) await run(browser, base, spec);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`screenshots: ${OUT}`);
  if (failures.length) { console.log(`\n${failures.length} check(s) failed`); process.exit(1); }
  console.log('\nsmoke: all checks passed');
}

main().catch((e) => { console.error(e); process.exit(1); });
