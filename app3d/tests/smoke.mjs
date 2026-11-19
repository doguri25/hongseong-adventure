// Headless browser smoke check for the built 3D app (run: npm run build:3d && node app3d/tests/smoke.mjs).
// Serves build/app3d with a tiny static server, opens it in Chromium (SwiftShader WebGL) at a desktop and a phone
// viewport, waits for window.__hs3d.ready, then checks: no page errors, all six travel modes are accepted or refused
// with a toast, the floating stick moves the player, and a lost WebGL context shows #lost. Screenshots go to OUT.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../../build/app3d');
const OUT = process.env.SMOKE_OUT || '/tmp/claude-0/-home-user-hongseong-adventure/67f4d963-6afa-55b8-a39e-ca038e7fb2bc/scratchpad/p1-smoke';
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

// Accessibility floor for the temporary HUD: every visible control is at least 44x44 CSS px, every sentence a child
// reads is at least 15 px; short labels inside buttons and chips may be smaller (travel name 13, its factor 12, tags 13).
const TEXT_15 = ['#where', '.stats', '.hint', '.credit .lead', '.credit summary', '#toast', '#arrive span', '#turn-hint', '.act', '#npc-body', '#place-body', '.dialog .blurb', '.dialog .meta', '.dialog .reward', '.quiz .feedback', '#loading-step', '#lost p'];
const LABEL_MIN = [['.travel button span', 13], ['.travel button small', 12], ['.dialog .tag', 13], ['.tools button', 13]];
async function measureUi(page) {
  return page.evaluate(({ TEXT_15, LABEL_MIN }) => {
    const small = [], fonts = [];
    let controls = 0;
    for (const el of document.querySelectorAll('button, summary, a[href], [role="button"], input, select')) {
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none') continue;
      controls++;
      if (r.width < 43.5 || r.height < 43.5) small.push(`${el.id || el.dataset.mode || el.className || el.tagName}("${el.textContent.trim().slice(0, 10)}") ${r.width.toFixed(1)}x${r.height.toFixed(1)}`);
    }
    const rules = [...TEXT_15.map((s) => [s, 15]), ...LABEL_MIN];
    for (const [sel, min] of rules) for (const el of document.querySelectorAll(sel)) {
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (px < min) fonts.push(`${sel} ${px}px < ${min}`);
    }
    return { controls, small, fonts };
  }, { TEXT_15, LABEL_MIN });
}
async function checkUi(page, name, where) {
  const ui = await measureUi(page);
  check(ui.small.length === 0, `${name} ${where}: ${ui.controls} visible controls are >= 44x44${ui.small.length ? ' — too small: ' + ui.small.join(', ') : ''}`);
  check(ui.fonts.length === 0, `${name} ${where}: sentences >= 15 px, labels at their minimum${ui.fonts.length ? ' — ' + ui.fonts.join(', ') : ''}`);
}

async function run(browser, base, spec) {
  const { name, viewport, touch } = spec;
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1, locale: 'ko-KR' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.stack || e)));
  page.on('console', (m) => { if (m.type() === 'error') console.log(`  [${name} console.error] ${m.text().slice(0, 300)}`); });
  const shot = (file) => page.screenshot({ path: path.join(OUT, `${name}-${file}.png`) });

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
  await shot('1-start');
  await checkUi(page, name, 'start');
  if (spec.touch) { await page.evaluate(() => { document.getElementById('credit').open = true; }); await sleep(300); await checkUi(page, name, 'credit open'); await shot('1b-credit-open'); await page.evaluate(() => { document.getElementById('credit').open = false; }); }

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
    if (mode === 'car') await checkUi(page, name, 'car (turn buttons)');
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

  if (spec.tour) {
    // the west coast at 남당항 (sea to the west, ferry button) and the town of 홍성읍 from further out
    const coast = await page.evaluate(() => { const W = window.__hs3d.world; return window.__hs3d.teleport(W.docks.namdang[0] + 30, W.docks.namdang[1]); });
    await sleep(8000);
    const ferry = await page.evaluate(() => { window.__hs3d.closeDialogs(); const b = document.getElementById('ferry-btn'); return { shown: !b.hidden, text: b.textContent }; });
    check(!!coast && ferry.shown, `${name}: ferry button near 남당항 ("${ferry.text}")`);
    await sleep(1500);
    await shot('7-west-coast-namdang');
    await checkUi(page, name, 'ferry and talk buttons');
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
    ]) await run(browser, base, spec);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`screenshots: ${OUT}`);
  if (failures.length) { console.log(`\n${failures.length} check(s) failed`); process.exit(1); }
  console.log('\nsmoke: all checks passed');
}

main().catch((e) => { console.error(e); process.exit(1); });
