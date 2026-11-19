// Headless browser smoke check for the built 3D app (run: npm run build:3d && node app3d/tests/smoke.mjs).
// Serves build/app3d with a tiny static server, opens it in Chromium (SwiftShader WebGL) at a desktop and a phone
// viewport, waits for window.__hs3d.ready, then checks: no page errors, all six travel modes are accepted or refused
// with a toast, the floating stick moves the player, and a lost WebGL context shows #lost. A quick touch-tablet pass
// checks the credit stays collapsed, a short touch in the stick zone taps, and action keys pressed while the world
// is still loading are ignored; a quick phone-landscape pass covers the short screen. At all four viewports the HUD
// is checked: every control >= 44x44, nothing interactive in the stick zone on touch screens (folded and open mission
// card, vehicle picker, car turn buttons), the minimap draws, the 탐방 button opens a place in reach, and a driven
// arrival shows the big notice. The title menu opens at boot (paused); at all four viewports every menu tab is checked
// the same way (sizes, fonts, the vehicle pictures), a wardrobe item is bought with seeded coins and taken off again,
// a few settings take effect, the reset asks a second time in the page, and the menu closes into play (primary
// button, home button + Escape, a mission's 출발). The 수첩 is checked at all four viewports too: opened from the HUD's
// discovery chip, every filter (sizes, fonts, nothing overlapping), the stamp and 수첩 colour, the card actions, the
// note across a reload, both downloads and the import (refused files, 취소, then accepted with a reload). The place
// dialog is checked at all four viewports on a driven arrival: focus moves in, the story with its picture and 2D kind
// label, 사진·자료 출처 and back, paging, the quiz (a wrong answer's hint and retry sound, the right one's explanation and
// correct sound), the reward (this visit's coins and points, the coin sound), Tab kept inside, and 계속 탐방하기 back
// into play with the focus on the map; each view's sizes, fonts and layout (nothing overlapping, all inside the panel).
// Desktop and phone also check the photo / terrain / illustration labels, a school's sources, Escape and 발견 수첩 보기.
// 홍성군 전체 지도 is checked at all four viewports (checkMap): opened from the minimap, zoomed (buttons, wheel or two
// fingers), dragged, a district, the legend and story cards, pin taps, 장소 찾기 (ㅎㅅㅇ, 홍성역, the arrows, Escape, the
// IME guard, a choice that starts the route), 주변 찾기 (filters, the name filter), the menu's 장소 찾기; sizes, fonts and
// layout in each view.
// Screenshots go to OUT (SMOKE_OUT, default a folder in the system temp directory; SMOKE_ONLY=tablet,phone,landscape
// runs only those passes).
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { PLACES } from '#game/content.js';
import { STAMPS, JOURNALS } from '#game/wardrobe.js';
import { symbolKey } from '#game/place-icons.js';
import { freshState } from '#game/core.js';

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
const TEXT_15 = ['#where', '.stats', '.hint', '.credit .lead', '.credit summary', '#toast', '.notice span', '#turn-hint', '.act', '#mission-detail', '#npc-body', '#place-body', '.dialog .blurb', '.dialog .meta', '.dialog .reward', '.quiz .feedback', '#loading-step', '#lost p',
  '.menu .lead', '.menu .note', '.menu .status', '.mis-card p', '.card .desc', '.product p', '.reset-confirm p', '.tally', '.wallet',
  '#found-btn', '.tally dt', '.tally dd', '.tally small', '.j-desc', '.j-empty', '.j-note label', '#journal-note',
  '.place-hero figcaption', '#place-caption', '.speech', '.speech small', '.quiz .options button', '.quiz .q-text', '.quiz .lead', '.rv p', '.rv .num small', '.src p', '.src .facts span',
  '.map-note', '.mview .lead', '.cp-text strong', '.story-body p', '.search-input', '.opt-text strong', '.opt-text small', '.search-empty', '.empty-note', '.near-title', '.near-search', '.place-row h4', '.place-row p'];
const LABEL_MIN = [['.travel button span', 13], ['.travel button small', 12], ['.dialog .tag', 13], ['.skill .lbl', 13], ['.skill small', 12], ['.mission-kick', 13], ['#mission-title', 13], ['.mission .badge', 13], ['.mission-foot .btn', 13], ['#speed-factor', 12], ['.cam-pad button', 13],
  ['.menu .tabs [role="tab"]', 13], ['.menu h3', 13], ['.mis-kick', 13], ['.mis-card h4', 13], ['.mis-card .btn', 13], ['.ride-head b', 13], ['.card .factor', 12], ['.shop-cats .cat', 13], ['.card.char b', 13], ['.card.char span', 13], ['.product h4', 13], ['.product .buy', 13], ['.opt-name', 13], ['.seg button', 13], ['.menu select', 13], ['.menu .settings > .btn', 13], ['.reset-confirm .btn', 13], ['.menu .go', 13],
  ['.j-filters button', 13], ['.j-tag', 13], ['.j-stamp', 13], ['.j-card b', 13], ['.j-actions .btn', 13],
  ['#place-kind', 13], ['.dialog .speaker', 13], ['.dialog .page-num', 13], ['#place-footer .btn', 13], ['.q-kick', 13], ['.quiz .options b', 13], ['.voice-status', 13], ['.src .btn', 13], ['.src h3', 13],
  ['.map-tabs [role="tab"]', 13], ['.map-tools button', 13], ['#map-zoom', 13], ['.map-side h3', 13], ['.districts button', 13], ['.cp-text small', 13], ['.map-more summary', 13], ['.legend-item', 13], ['.story-body h4', 13], ['.story-body .btn', 13], ['.row-tag', 13], ['#map-back', 13], ['.near-filters button', 13], ['.place-row .go', 13], ['.mis-tools .btn', 13]];
// touch screens: nothing interactive in the stick zone (left 42 % of the width, lower 45 % of the height) while
// playing; the discovery chip (a button: the 수첩) clear of every other HUD piece; overlaps() as ui/dom.js: edges that
// only touch do not count
const HUD_PIECES = ['#home-btn', '.where-chip', '.coin-chip', '#mission', '#minimap', '.cam-pad', '#credit-dock > *', '.hud-br > *'];
async function measureUi(page, touch) {
  return page.evaluate(({ TEXT_15, LABEL_MIN, HUD_PIECES, touch }) => {
    const small = [], fonts = [], inZone = [], clash = [];
    const zone = { left: 0, top: innerHeight * 0.55, right: innerWidth * 0.42, bottom: innerHeight };
    const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const shown = (el) => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' ? r : null; };
    const chip = document.getElementById('found-btn'), chipRect = chip && shown(chip);
    if (chipRect) for (const sel of HUD_PIECES) for (const el of document.querySelectorAll(sel)) {
      const r = shown(el);
      if (r && overlaps(chipRect, r)) clash.push(`${sel} at ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    let controls = 0;
    for (const el of document.querySelectorAll('button, summary, a[href], [role="button"], input, select, textarea')) {
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
    return { controls, small, fonts, inZone, clash, chip: !!chipRect };
  }, { TEXT_15, LABEL_MIN, HUD_PIECES, touch: !!touch });
}
async function checkUi(page, name, where, touch = false) {
  const ui = await measureUi(page, touch);
  check(ui.small.length === 0, `${name} ${where}: ${ui.controls} visible controls are >= 44x44${ui.small.length ? ' — too small: ' + ui.small.join(', ') : ''}`);
  check(ui.fonts.length === 0, `${name} ${where}: sentences >= 15 px, labels at their minimum${ui.fonts.length ? ' — ' + ui.fonts.join(', ') : ''}`);
  if (touch) check(ui.inZone.length === 0, `${name} ${where}: no control in the stick zone${ui.inZone.length ? ' — ' + ui.inZone.join(', ') : ''}`);
  if (ui.chip) check(ui.clash.length === 0, `${name} ${where}: the discovery chip overlaps no other HUD piece${ui.clash.length ? ' — ' + ui.clash.join(', ') : ''}`);
}

// The title menu (ui/menu.js) as it opens at boot, then the menu from the home button. Every tab at this viewport:
// controls >= 44 px and the font floors (the menu is a .scrim dialog, so the stick-zone rule does not apply to it), the
// six vehicle pictures painted, a purchase with seeded coins, a few settings, the reset's second step; then into play.
async function checkMenu(page, name, spec, shot) {
  const touch = !!spec.touch;
  const title = await page.evaluate(() => ({ open: !document.getElementById('menu').hidden, screen: window.__hs3d.ctl.screen, paused: window.__hs3d.ctl.paused(), go: document.getElementById('menu-go').textContent, focus: document.activeElement?.id, hudInert: document.querySelector('.hud-br').inert, hudHidden: getComputedStyle(document.querySelector('.hud-br')).visibility === 'hidden' }));
  check(title.open && title.screen === 'title' && title.paused && title.go === '탐방 시작' && title.focus === 'menu-go' && title.hudInert && title.hudHidden, `${name}: the title menu is open at boot, paused, focus on "${title.go}", the HUD inert and out of sight (${JSON.stringify(title)})`);
  // the world keeps rendering behind it, at most 10 frames a second
  const fps = await page.evaluate(async () => { const W = window.__hs3d.world, seen = new Set(), t0 = performance.now(); while (performance.now() - t0 < 2000) { seen.add(W.pausedAt); await new Promise((r) => setTimeout(r, 15)); } return seen.size / 2; });
  check(fps > 0 && fps <= 11, `${name}: the world renders behind the title at ${fps} fps (<= 10)`);
  await page.evaluate(() => { window.__hs3d.world.state.coins = 500; window.__hs3d.menu.refresh(); });
  for (const tab of ['missions', 'vehicles', 'wardrobe', 'journal', 'settings']) {
    await page.evaluate((t) => document.getElementById('tab-' + t).click(), tab);
    const sel = await page.evaluate((t) => ({ selected: document.getElementById('tab-' + t).getAttribute('aria-selected'), pane: !document.getElementById('pane-' + t).hidden, kids: document.getElementById('pane-' + t).children.length }), tab);
    check(sel.selected === 'true' && sel.pane && sel.kids > 0, `${name}: menu tab ${tab} shows its pane (${sel.kids} items)`);
    if (tab === 'vehicles') {
      await page.waitForFunction(() => window.__hs3d.world.thumbs.size >= 6, null, { timeout: 60000, polling: 300 }).catch(() => {});
      const pics = await page.evaluate(() => [...document.querySelectorAll('#pane-vehicles canvas')].map((c) => {
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, colours = new Set();
        for (let i = 0; i < d.length; i += 16) colours.add((d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | d[i + 2] >> 4);
        return colours.size;
      }));
      check(pics.length === 6 && pics.every((n) => n > 12), `${name}: the six vehicle cards show rendered pictures (colours ${pics.join(', ')})`);
    }
    if (tab === 'wardrobe') await page.waitForFunction(() => window.__hs3d.world.thumbs.size >= 9, null, { timeout: 60000, polling: 300 }).catch(() => {});
    if (tab === 'journal') {
      const j = await page.evaluate(() => ({ stats: [...document.querySelectorAll('#pane-journal .tally dt')].map((d) => d.textContent).join('/'), filters: [...document.querySelectorAll('#pane-journal [data-filter]')].map((b) => b.textContent).join('/'), cards: document.querySelectorAll('#journal-list .j-card').length, note: !!document.getElementById('journal-note'), files: ['export-result', 'export-save', 'load-save'].map((id) => document.getElementById(id)?.textContent).join('/') }));
      check(j.stats === '발견/퀴즈/탐험 점수' && j.filters === '전체/발견/역사/생활' && j.cards === PLACES.length && j.note && j.files === '결과 내려받기/이어하기 파일 저장/이어하기 파일 불러오기', `${name}: the 수첩 tab from the menu: stats, filters, ${j.cards} cards, the note and the file buttons (${JSON.stringify(j)})`);
    }
    await sleep(300);
    await checkUi(page, name, `menu ${tab}`, touch);
    await shot(`menu-${tab}`);
  }
  // 탈것: a card switches the mode (or says why not)
  const ride = await page.evaluate(() => { document.getElementById('tab-vehicles').click(); document.querySelector('#pane-vehicles [data-mode="bike"]').click(); const r = { mode: window.__hs3d.player.mode, pressed: document.querySelector('#pane-vehicles [data-mode="bike"]').getAttribute('aria-pressed'), status: document.getElementById('ride-status').textContent }; document.querySelector('#pane-vehicles [data-mode="walk"]').click(); return { ...r, back: window.__hs3d.player.mode }; });
  check((ride.mode === 'bike' && ride.pressed === 'true' || ride.status.length > 0) && ride.back === 'walk', `${name}: the 자전거 card switches the mode (${ride.mode}${ride.status ? ' · "' + ride.status + '"' : ''}) and 걷기 switches back`);
  // 꾸미기: buy with seeded coins, worn on the explorer, taken off, a character; too dear -> disabled
  const shop = await page.evaluate(() => {
    const W = window.__hs3d.world, S = W.state, saved = () => JSON.parse(localStorage.getItem('hongseong-adventure-v1'));
    document.getElementById('tab-wardrobe').click();
    document.querySelector('[data-cat="outfit"]').click();
    const before = S.coins;
    document.querySelector('[data-buy="outfit-ocean"]').click();
    const bought = { coins: S.coins, worn: S.equipped.outfit, actor: W.actors.outfitId, wallet: document.getElementById('wallet').textContent, hud: document.getElementById('coins').textContent, saved: saved().coins, label: document.querySelector('[data-buy="outfit-ocean"]').textContent };
    document.querySelector('[data-buy="outfit-ocean"]').click();
    const off = { coins: S.coins, worn: S.equipped.outfit, actor: W.actors.outfitId, label: document.querySelector('[data-buy="outfit-ocean"]').textContent };
    S.coins = 50; document.querySelector('[data-cat="outfit"]').click();
    const poor = { cape: document.querySelector('[data-buy="gold-cape"]').disabled, ocean: document.querySelector('[data-buy="outfit-ocean"]').disabled };
    document.querySelector('[data-cat="character"]').click();
    document.querySelector('[data-character="raccoon"]').click();
    const who = { state: S.character, actor: W.actors.character, pressed: document.querySelector('[data-character="raccoon"]').getAttribute('aria-pressed') };
    document.querySelector('[data-character="explorer"]').click();
    return { before, bought, off, poor, who, back: S.character };
  });
  check(shop.bought.coins === shop.before - 100 && shop.bought.worn === 'ocean' && shop.bought.actor === 'ocean' && shop.bought.wallet === String(shop.bought.coins) && shop.bought.hud === String(shop.bought.coins) && shop.bought.saved === shop.bought.coins && shop.bought.label === '착용 해제',
    `${name}: buying 바다빛 탐험복 with seeded coins: ${shop.before} -> ${shop.bought.coins}, worn by the explorer, wallet / HUD / save agree (${JSON.stringify(shop.bought)})`);
  check(shop.off.coins === shop.bought.coins && shop.off.worn === 'default' && shop.off.actor === 'default' && shop.off.label === '착용하기', `${name}: pressed again it comes off, coins unchanged (${JSON.stringify(shop.off)})`);
  check(shop.poor.cape && !shop.poor.ocean, `${name}: with 50 coins 햇살 망토 is disabled, the owned one is not`);
  check(shop.who.state === 'raccoon' && shop.who.actor === 'raccoon' && shop.who.pressed === 'true' && shop.back === 'explorer', `${name}: choosing 귀여운 라쿤 changes the explorer at once (${JSON.stringify(shop.who)})`);
  // 설정: time, camera, motion, speed take effect and are saved; the reset asks again in the page, then cancels
  const set = await page.evaluate(() => {
    const W = window.__hs3d.world, press = (k, v) => document.querySelector(`[data-setting="${k}"] [data-value="${v}"]`).click();
    document.getElementById('tab-settings').click();
    press('time', 'night'); press('camera', 'follow'); press('motion', 'off'); press('speed', '1.4'); press('movement', 'free');
    const saved = JSON.parse(localStorage.getItem('hongseong-adventure-v1')), extra = JSON.parse(localStorage.getItem('hongseong-3d-v1'));
    const r = { time: W.timeKey, cam: W.cam.mode, reduce: document.documentElement.classList.contains('reduce-motion'), actors: W.actors.reduced, speed: W.player.speedSetting, move: W.player.movementMode, saved: [saved.motion, saved.speed, saved.movementMode, extra.time, extra.camera], pressed: document.querySelector('[data-setting="time"] [data-value="night"]').getAttribute('aria-pressed') };
    press('time', 'day'); press('camera', 'tilt'); press('motion', 'on'); press('speed', '1'); press('movement', 'roads');
    r.after = [W.timeKey, W.cam.mode, document.documentElement.classList.contains('reduce-motion'), W.player.speedSetting, W.player.movementMode];
    return r;
  });
  check(set.time === 'night' && set.cam === 'follow' && set.reduce && set.actors && set.speed === 1.4 && set.move === 'free' && set.pressed === 'true' && JSON.stringify(set.saved) === JSON.stringify([false, 1.4, 'free', 'night', 'follow']) && JSON.stringify(set.after) === JSON.stringify(['day', 'tilt', false, 1, 'roads']),
    `${name}: 설정 time / camera / motion / speed / movement take effect live and are saved (${JSON.stringify(set)})`);
  const reset = await page.evaluate(() => { document.getElementById('reset-progress').click(); const box = document.getElementById('reset-confirm'); return { shown: !box.hidden, focus: document.activeElement?.id }; });
  await sleep(300);
  await checkUi(page, name, 'menu reset confirm', touch);
  await shot('menu-reset-confirm');
  const cancelled = await page.evaluate(() => { document.getElementById('cancel-reset').click(); return { hidden: document.getElementById('reset-confirm').hidden, coins: window.__hs3d.world.state.coins }; });
  check(reset.shown && reset.focus === 'backup-first' && cancelled.hidden && cancelled.coins === 50, `${name}: 기록 초기화 asks again in the page (focus on 파일 저장) and 취소 keeps the progress`);
  // into play: the primary button
  const play = await page.evaluate(() => { document.getElementById('menu-go').click(); return { open: !document.getElementById('menu').hidden, paused: window.__hs3d.ctl.paused(), screen: window.__hs3d.ctl.screen, focus: document.activeElement?.id, hudInert: document.querySelector('.hud-br').inert, hud: getComputedStyle(document.querySelector('.hud-br')).visibility }; });
  check(!play.open && !play.paused && play.screen === 'play' && play.focus === 'c' && !play.hudInert && play.hud === 'visible', `${name}: 탐방 시작 closes the title into play, focus back on the map (${JSON.stringify(play)})`);
  // the home button opens the same menu (이어하기); Escape closes it
  await sleep(400);
  const home = await page.evaluate(() => { document.getElementById('home-btn').click(); return { open: !document.getElementById('menu').hidden, paused: window.__hs3d.ctl.paused(), screen: window.__hs3d.ctl.screen, go: document.getElementById('menu-go').textContent }; });
  await page.keyboard.press('Escape');
  const esc = await page.evaluate(() => ({ open: !document.getElementById('menu').hidden, paused: window.__hs3d.ctl.paused() }));
  check(home.open && home.paused && home.screen === 'play' && home.go === '이어하기' && !esc.open && !esc.paused, `${name}: the home button opens the menu (${home.go}) and Escape closes it into play`);
  // a mission's 출발 closes the menu and heads for it
  const go = await page.evaluate(() => {
    document.getElementById('home-btn').click(); document.getElementById('tab-missions').click();
    const b = document.querySelector('#pane-missions [data-mission]:not([disabled])'), W = window.__hs3d.world;
    if (!b) return null;
    b.click();
    const r = { id: b.dataset.mission, open: !document.getElementById('menu').hidden, paused: W.ctl.paused(), target: !!W.target, active: W.state.dailyQuests?.active };
    W.target = null; W.player.route = null;
    return r;
  });
  check(!!go && !go.open && !go.paused && go.target && go.active === go.id, `${name}: a mission's 출발 closes the menu and heads there (${JSON.stringify(go)})`);
}

// Waits for __hs3d.ready after a reload (the note check, the import), then for the ground to stream in again.
async function waitReady(page, name, when) {
  let ok = false;
  try { await page.waitForFunction(() => window.__hs3d && window.__hs3d.ready === true, null, { timeout: READY_MS, polling: 500 }); ok = true; } catch {}
  check(ok, `${name}: ready again ${when}`);
  if (ok) await page.waitForFunction(() => window.__hs3d.info().groundLevels >= 2, null, { timeout: 120000, polling: 1000 }).catch(() => {});
  return ok;
}

// The 수첩 pane's layout: none of its blocks, stat cells, filter buttons, cards or file buttons overlap one another
// (overlaps() as ui/dom.js), and every card's text stays inside its card.
async function checkJournalLayout(page, name, where) {
  const r = await page.evaluate(() => {
    const pane = document.getElementById('pane-journal'), bad = [], out = [];
    const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const label = (e) => `${e.id || e.dataset.place || e.dataset.filter || e.className || e.tagName}`;
    const parts = [...pane.querySelectorAll(':scope > *, .tally > div, .j-filters button, .j-card, .j-actions > *')]
      .map((e) => [e, e.getBoundingClientRect()]).filter(([e, q]) => q.width > 0 && q.height > 0 && getComputedStyle(e).display !== 'none');
    for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
      const [a, ra] = parts[i], [b, rb] = parts[j];
      if (!a.contains(b) && !b.contains(a) && overlaps(ra, rb)) bad.push(`${label(a)} / ${label(b)}`);
    }
    for (const c of pane.querySelectorAll('.j-card')) {
      const q = c.getBoundingClientRect();
      for (const k of c.querySelectorAll('*')) { const e = k.getBoundingClientRect(); if (e.left < q.left - 0.5 || e.right > q.right + 0.5 || e.top < q.top - 0.5 || e.bottom > q.bottom + 0.5) out.push(`${c.dataset.place} ${k.className}`); }
    }
    return { parts: parts.length, bad: bad.slice(0, 5), nBad: bad.length, out: out.slice(0, 5), nOut: out.length };
  });
  check(r.nBad === 0 && r.nOut === 0, `${name} journal ${where}: ${r.parts} parts, none overlapping, every card's text inside its card${r.nBad ? ' — overlap: ' + r.bad.join(', ') : ''}${r.nOut ? ' — outside: ' + r.out.join(', ') : ''}`);
}

// The place dialog's layout in its current view (story, sources, quiz, reward): the panel inside the screen; its picture,
// header, body and footer, the header's tag / name / line / close button and every footer button inside the panel and
// clear of one another (overlaps() as ui/dom.js; parts nested in one another do not count); the scrolling body keeps
// at least three lines of room.
async function checkPlaceLayout(page, name, where) {
  const r = await page.evaluate(() => {
    const panel = document.getElementById('place-panel'), P = panel.getBoundingClientRect(), bad = [], out = [];
    const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const inside = (q, o) => q.left >= o.left - 0.5 && q.right <= o.right + 0.5 && q.top >= o.top - 0.5 && q.bottom <= o.bottom + 0.5;
    const label = (e) => e.id || String(e.className).split(' ')[0] || e.tagName;
    const parts = [...panel.querySelectorAll('#place-hero, .place-main > header, #place-body, #place-footer, header .titles > *, #place-close, #place-footer > :not(.spacer)')]
      .map((e) => [e, e.getBoundingClientRect()]).filter(([e, q]) => q.width > 0 && q.height > 0 && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden');
    for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
      const [a, ra] = parts[i], [b, rb] = parts[j];
      if (!a.contains(b) && !b.contains(a) && overlaps(ra, rb)) bad.push(`${label(a)} / ${label(b)}`);
    }
    const screen = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    if (!inside(P, screen)) out.push('panel');
    for (const [e, q] of parts) if (!inside(q, P)) out.push(label(e));
    return { view: panel.dataset.view, parts: parts.length, bad: bad.slice(0, 6), nBad: bad.length, out, body: Math.round(document.getElementById('place-body').clientHeight) };
  });
  check(r.nBad === 0 && r.out.length === 0 && r.body >= 72, `${name} place ${where} (${r.view}): ${r.parts} parts inside the panel and screen, none overlapping, body ${r.body} px tall${r.nBad ? ' — overlap: ' + r.bad.join(', ') : ''}${r.out.length ? ' — outside: ' + r.out.join(', ') : ''}`);
}

// Records every sound the game asks for (ctl.sound is the controller's object, shared with the place dialog).
async function watchSounds(page) {
  await page.evaluate(() => {
    window.__sounds = [];
    const s = window.__hs3d.ctl.sound;
    if (s.__watched) return;
    const play = s.play;
    s.play = function (kind) { window.__sounds.push(kind); return play.call(this, kind); };
    s.__watched = true;
  });
}

// The 수첩 (ui/journal.js) at this viewport. A found place (quiz solved), a worn stamp and 수첩 colour are seeded; the
// HUD's discovery chip opens the menu at the 수첩 tab; every filter shows its cards (sizes, fonts, layout); a found
// place replays its story without counting as an arrival, a story-only place opens its story and is found by it (the
// 2D visit; goTo one does the same), and a place not found yet becomes the walk target (all three close the menu); the
// note is saved as it is typed and is there after a reload;
// both downloads are the 2D files; the import refuses an oversized, a broken and a version 2 file with the 2D
// messages (progress untouched), asks before a good one (취소 keeps the progress), then replaces it and reloads.
const JOURNAL_FILTERS = [['all', '전체'], ['found', '발견'], ['heritage', '역사'], ['daily', '생활']];
const FILTER_COUNT = { all: PLACES.length, heritage: PLACES.filter((p) => ['heritage', 'intangible'].includes(p.type)).length, daily: PLACES.filter((p) => ['daily', 'public'].includes(p.type)).length };
const NOTE = '홍주읍성을 친구에게 소개하고 싶어요. 성곽 길을 따라 걸으면 옛날 이야기가 들리거든요!';
const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
async function downloadOf(page, id) {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.evaluate((b) => document.getElementById(b).click(), id)]);
  return { name: d.suggestedFilename(), text: fs.readFileSync(await d.path(), 'utf8'), status: await page.evaluate(() => document.getElementById('journal-status').textContent) };
}
async function checkJournal(page, name, spec, shot) {
  const touch = !!spec.touch;
  await page.evaluate(() => {
    const W = window.__hs3d.world, S = W.state;
    window.__hs3d.closeDialogs(); W.target = null;
    if (!S.discovered.includes('library')) S.discovered.push('library');
    if (!S.solved.includes('library')) S.solved.push('library');
    S.equipped.stamp = 'heart'; S.equipped.journal = 'ocean';
  });
  await sleep(500);
  await checkUi(page, name, 'discovery chip', touch);
  // from the HUD chip
  const open = await page.evaluate(() => { const b = document.getElementById('found-btn'), label = b.getAttribute('aria-label'); b.click(); return { label, open: !document.getElementById('menu').hidden, paused: window.__hs3d.ctl.paused(), tab: document.getElementById('tab-journal').getAttribute('aria-selected'), pane: !document.getElementById('pane-journal').hidden, focus: document.activeElement?.id }; });
  check(open.open && open.paused && open.tab === 'true' && open.pane && open.focus === 'tab-journal' && /^발견 \d+ \/ \d+, 발견 수첩 열기$/.test(open.label), `${name}: the discovery chip ("${open.label}") opens the menu at the 수첩 tab (${JSON.stringify(open)})`);
  // the worn stamp on a found card, the worn 수첩 colour on the cards and the table
  const look = await page.evaluate(() => { document.querySelector('#pane-journal [data-filter="all"]').click(); const c = document.querySelector('#journal-list [data-place="library"]'); return { stamp: c.querySelector('.j-stamp')?.textContent, border: getComputedStyle(c).borderTopColor, journal: document.getElementById('pane-journal').dataset.journal, stripe: getComputedStyle(document.querySelector('#pane-journal .tally')).boxShadow }; });
  check(look.stamp === `${STAMPS.heart} 이야기 완성` && look.journal === 'ocean' && look.border === rgb(JOURNALS.ocean) && look.stripe.includes(rgb(JOURNALS.ocean)), `${name}: found cards wear the stamp (${look.stamp}) and the 수첩 colour edges the cards and the table (${JSON.stringify(look)})`);
  // every filter
  for (const [f, label] of JOURNAL_FILTERS) {
    const v = await page.evaluate((f) => {
      document.querySelector(`#pane-journal [data-filter="${f}"]`).click();
      const cards = [...document.querySelectorAll('#journal-list .j-card')];
      return { pressed: [...document.querySelectorAll('#pane-journal [data-filter][aria-pressed="true"]')].map((b) => b.dataset.filter).join(), ids: cards.map((c) => c.dataset.place), found: window.__hs3d.world.state.discovered.slice() };
    }, f);
    const want = f === 'found' ? PLACES.filter((p) => v.found.includes(p.id)).map((p) => p.id) : null;
    check(v.pressed === f && (want ? JSON.stringify(v.ids) === JSON.stringify(want) : v.ids.length === FILTER_COUNT[f]), `${name}: 수첩 filter ${label} shows ${v.ids.length} cards (${want ? want.length : FILTER_COUNT[f]} expected)`);
    await sleep(250);
    await checkUi(page, name, `journal ${label}`, touch);
    await checkJournalLayout(page, name, label);
    await shot(`menu-journal-${f}`);
  }
  // a found place: its story as a replay (no arrival, the menu closed first)
  const replay = await page.evaluate(() => {
    const W = window.__hs3d.world, n = W.state.discovered.length;
    document.querySelector('#pane-journal [data-filter="all"]').click();
    document.querySelector('#journal-list [data-place="library"]').click();
    const r = { menu: !document.getElementById('menu').hidden, kind: W.ctl.dialog?.kind, place: W.dialog.isOpen ? W.dialog.place?.id : null, physical: W.ctl.dialog?.data?.physical, paused: W.ctl.paused(), same: W.state.discovered.length === n };
    window.__hs3d.closeDialogs();
    return r;
  });
  check(!replay.menu && replay.kind === 'place' && replay.place === 'library' && replay.physical === false && replay.paused && replay.same, `${name}: a found card closes the menu and replays the place's story, not as an arrival (${JSON.stringify(replay)})`);
  // a story-only place, not found: its story too, and opening it finds it (P19, the 2D visit)
  const [remote, remote2] = PLACES.filter((p) => p.remote).map((p) => p.id);
  const story = await page.evaluate((id) => {
    const W = window.__hs3d.world, before = W.state.discovered.includes(id);
    document.getElementById('found-btn').click();
    document.querySelector(`#journal-list [data-place="${id}"]`).click();
    const r = { before, menu: !document.getElementById('menu').hidden, place: W.dialog.isOpen ? W.dialog.place?.id : null, physical: W.ctl.dialog?.data?.physical, found: W.state.discovered.includes(id) };
    window.__hs3d.closeDialogs();
    return r;
  }, remote);
  check(!story.before && !story.menu && story.place === remote && story.physical === false && story.found, `${name}: a story-only card (${remote}) opens its story and finds it (${JSON.stringify(story)})`);
  // P19: heading for a story-only place (it has no point on the map) opens its story instead of setting a target
  const told = await page.evaluate((id) => {
    const W = window.__hs3d.world;
    W.target = null;
    const ok = W.ctl.goTo(id);
    const r = { ok, place: W.dialog.isOpen ? W.dialog.place?.id : null, physical: W.ctl.dialog?.data?.physical, target: !!W.target, found: W.state.discovered.includes(id) };
    window.__hs3d.closeDialogs();
    return r;
  }, remote2);
  check(told.ok && told.place === remote2 && told.physical === false && !told.target && told.found, `${name}: goTo a story-only place (${remote2}) opens its story with no walk target (${JSON.stringify(told)})`);
  // a mapped place not found yet: the menu closes into play and the explorer heads there
  const away = PLACES.find((p) => !p.remote && p.id !== 'library').id;
  const go = await page.evaluate((id) => {
    const W = window.__hs3d.world;
    document.getElementById('found-btn').click();
    if (W.state.discovered.includes(id)) return { skip: true };
    document.querySelector(`#journal-list [data-place="${id}"]`).click();
    const r = { menu: !document.getElementById('menu').hidden, paused: W.ctl.paused(), target: !!W.target };
    W.target = null; W.player.route = null;
    return r;
  }, away);
  check(!go.skip && !go.menu && !go.paused && go.target, `${name}: a card not found yet (${away}) closes the menu into play and heads there (${JSON.stringify(go)})`);
  await page.evaluate(() => { const S = window.__hs3d.world.state; S.equipped.stamp = 'default'; S.equipped.journal = 'default'; });
  // the note: at most 1000 characters, saved as it is typed
  await page.evaluate(() => { document.getElementById('found-btn').click(); document.getElementById('journal-note').scrollIntoView({ block: 'center' }); });
  await page.fill('#journal-note', '가'.repeat(1200));
  const long = await page.evaluate(() => window.__hs3d.world.state.note.length);
  await page.fill('#journal-note', NOTE);
  const typed = await page.evaluate(() => ({ state: window.__hs3d.world.state.note, saved: JSON.parse(localStorage.getItem('hongseong-adventure-v1')).note }));
  check(long <= 1000 && typed.state === NOTE && typed.saved === NOTE, `${name}: the note keeps at most 1000 characters (${long}) and is saved as it is typed`);
  await sleep(250);
  await checkUi(page, name, 'journal note', touch);
  await checkJournalLayout(page, name, 'note');
  await shot('menu-journal-note');
  // the two downloads: the 2D result text (BOM, counts, the found place, the note) and the 2D save file
  const result = await downloadOf(page, 'export-result');
  check(result.name === '홍성모험수첩_탐방결과.txt' && result.text.startsWith('\uFEFF홍성 모험 수첩 · 나의 탐방 결과') && /\n발견: \d+ \/ 241곳\n/.test(result.text) && result.text.includes('- 충남도서관 (홍성군 홍북읍) · 퀴즈 완료') && result.text.includes(NOTE) && result.status === '탐방 결과를 내려받았어요.', `${name}: 결과 내려받기 saves ${result.name} with the BOM, the found place and the note ("${result.status}")`);
  const saveDl = await downloadOf(page, 'export-save');
  let saved = null; try { saved = JSON.parse(saveDl.text); } catch {}
  check(saveDl.name === '홍성모험수첩_이어하기.json' && saved?.version === 1 && saved.note === NOTE && saved.discovered.includes('library') && saveDl.status === '이어하기 파일을 저장했어요.', `${name}: 이어하기 파일 저장 saves ${saveDl.name} in the 2D format ("${saveDl.status}")`);
  // the note is there after a reload
  await page.reload({ waitUntil: 'load' });
  if (!await waitReady(page, name, 'after a reload')) return false;
  const kept = await page.evaluate(() => { document.getElementById('tab-journal').click(); return { note: document.getElementById('journal-note').value, go: document.getElementById('menu-go').textContent }; });
  check(kept.note === NOTE && kept.go === '이어하기', `${name}: the note is still there after a reload (title "${kept.go}")`);
  // 이어하기 파일 불러오기: refused files leave the progress as it was
  const progress = () => page.evaluate(() => { const S = window.__hs3d.world.state; return JSON.stringify([S.discovered, S.solved, S.coins, S.owned, S.equipped, S.note]); });
  const before = await progress();
  for (const [file, want] of [[{ name: 'big.json', buffer: Buffer.alloc(200001, 32) }, '이어하기 파일이 너무 커요. 올바른 JSON 파일을 선택해 주세요.'],
    [{ name: 'broken.json', buffer: Buffer.from('{"version":1,"discovered":[') }, '이어하기 파일을 읽지 못했어요. 이 게임에서 저장한 JSON 파일인지 확인해 주세요.'],
    [{ name: 'v2.json', buffer: Buffer.from(JSON.stringify({ ...freshState(), version: 2 })) }, '이어하기 파일을 읽지 못했어요. 이 게임에서 저장한 JSON 파일인지 확인해 주세요.']]) {
    await page.evaluate(() => { document.getElementById('journal-status').textContent = ''; });
    await page.setInputFiles('#journal-file', { mimeType: 'application/json', ...file });
    await page.waitForFunction(() => document.getElementById('journal-status').textContent, null, { timeout: 10000, polling: 100 }).catch(() => {});
    const r = await page.evaluate(() => ({ status: document.getElementById('journal-status').textContent, warn: document.getElementById('journal-status').classList.contains('warn'), asked: !document.getElementById('import-confirm').hidden }));
    r.same = await progress() === before;
    check(r.status === want && r.warn && !r.asked && r.same, `${name}: importing ${file.name} is refused ("${r.status}") and the progress is untouched`);
  }
  // a good 2D save: asked first; 취소 keeps the progress
  const incoming = { ...freshState(), discovered: ['hongju', 'library', 'namdang'], note: '파일에서 불러온 메모예요.' };
  const good = { name: '홍성모험수첩_이어하기.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(incoming, null, 2)) };
  await page.setInputFiles('#journal-file', good);
  await page.waitForFunction(() => !document.getElementById('import-confirm').hidden, null, { timeout: 10000, polling: 100 }).catch(() => {});
  const ask = await page.evaluate(() => ({ text: document.querySelector('#import-confirm p').textContent, focus: document.activeElement?.id }));
  check(ask.text === '파일에는 3곳의 발견 기록이 있어요.현재 기기의 기록을 이 파일로 바꿀까요?' && ask.focus === 'confirm-import', `${name}: a good 이어하기 file asks first ("${ask.text}", focus on ${ask.focus})`);
  await sleep(300);
  await checkUi(page, name, 'journal import confirm', touch);
  await checkJournalLayout(page, name, 'import confirm');
  await shot('menu-journal-import');
  const cancel = await page.evaluate(() => { document.getElementById('cancel-import').click(); return { hidden: document.getElementById('import-confirm').hidden, focus: document.activeElement?.id }; });
  cancel.same = await progress() === before;
  check(cancel.hidden && cancel.focus === 'load-save' && cancel.same, `${name}: 취소 keeps the progress (${JSON.stringify(cancel)})`);
  // accepted: the file's progress replaces this device's and the game reloads with it
  await page.setInputFiles('#journal-file', good);
  await page.waitForFunction(() => !document.getElementById('import-confirm').hidden, null, { timeout: 10000, polling: 100 }).catch(() => {});
  await Promise.all([page.waitForEvent('load', { timeout: 60000 }), page.evaluate(() => document.getElementById('confirm-import').click()).catch(() => {})]);
  if (!await waitReady(page, name, 'after the import')) return false;
  const after = await page.evaluate(() => { document.getElementById('tab-journal').click(); const S = window.__hs3d.world.state, st = JSON.parse(localStorage.getItem('hongseong-adventure-v1')); return { found: S.discovered.slice().sort(), note: S.note, field: document.getElementById('journal-note').value, stored: st.discovered.slice().sort(), storedNote: st.note }; });
  const want = incoming.discovered.slice().sort();
  check(JSON.stringify(after.found) === JSON.stringify(want) && JSON.stringify(after.stored) === JSON.stringify(want) && after.note === incoming.note && after.field === incoming.note && after.storedNote === incoming.note, `${name}: 이 기록으로 이어하기 replaces the progress and reloads with it (${JSON.stringify(after)})`);
  await page.evaluate(() => document.getElementById('menu-go').click());   // into play for the rest of the run
  return true;
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

// Records every big notice the HUD shows (title, line, whether it sits above the dialog scrim and inside the screen).
// Whenever the notice moves or changes, and every 80 ms, while it is visible together with an open dialog, checks that
// its title and line, taken at the largest size of their pop animation, do not overlap any readable part of the dialog:
// its controls and every element holding text of its own, each clipped to the scroll boxes it sits in. overlaps() as
// ui/dom.js: edges that only touch do not count.
async function watchNotices(page) {
  await page.evaluate(() => {
    if (window.__notices) { window.__notices.length = 0; window.__noticeCheck = { samples: 0, bad: [] }; return; }
    window.__notices = []; window.__noticeCheck = { samples: 0, bad: [] };
    const n = document.getElementById('notice');
    new MutationObserver(() => {
      if (!n.classList.contains('show') || n.dataset.reshow) return;   // a screenshot's re-show is checked, not counted
      const scrim = getComputedStyle(document.querySelector('.scrim')).zIndex;
      window.__notices.push({ title: n.querySelector('b').textContent, sub: n.querySelector('span').textContent, above: Number(getComputedStyle(n).zIndex) > Number(scrim), fits: n.scrollWidth <= innerWidth - 16 });
    }).observe(n, { attributes: true, attributeFilter: ['class'] });
    const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const CONTROL = new Set(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY']);
    const sample = () => {
      const dialog = document.querySelector('.scrim:not([hidden]) [role="dialog"]'), cs = getComputedStyle(n);
      if (!dialog || !n.classList.contains('show') || cs.visibility === 'hidden') return;
      // scale each part about the notice's centre from its current animation scale to the animation's peak
      const nr = n.getBoundingClientRect(), now = n.offsetWidth ? nr.width / n.offsetWidth : 1, k = (n.classList.contains('docked') ? 1.04 : 1.08) / (now || 1);
      const cx = (nr.left + nr.right) / 2, cy = (nr.top + nr.bottom) / 2;
      const parts = [n.querySelector('b'), n.querySelector('span')].filter((e) => e.textContent).map((e) => {
        const r = e.getBoundingClientRect();
        return { left: cx + (r.left - cx) * k, top: cy + (r.top - cy) * k, right: cx + (r.right - cx) * k, bottom: cy + (r.bottom - cy) * k };
      });
      window.__noticeCheck.samples++;
      for (const el of dialog.querySelectorAll('*')) {
        if (!CONTROL.has(el.tagName) && ![...el.childNodes].some((c) => c.nodeType === 3 && c.nodeValue.trim())) continue;
        let r = el.getBoundingClientRect();
        r = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        for (let a = el.parentElement; a && a !== dialog.parentElement; a = a.parentElement) {
          const o = getComputedStyle(a);
          if (o.overflowX === 'visible' && o.overflowY === 'visible') continue;
          const c = a.getBoundingClientRect();
          r = { left: Math.max(r.left, c.left), top: Math.max(r.top, c.top), right: Math.min(r.right, c.right), bottom: Math.min(r.bottom, c.bottom) };
        }
        if (r.right <= r.left || r.bottom <= r.top) continue;
        for (const p of parts) if (overlaps(p, r)) {
          const what = `"${n.querySelector('b').textContent}" over ${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}("${el.textContent.trim().slice(0, 12)}")`;
          if (!window.__noticeCheck.bad.includes(what)) window.__noticeCheck.bad.push(what);
        }
      }
    };
    setInterval(sample, 80);
    new MutationObserver(() => queueMicrotask(sample)).observe(n, { attributes: true, attributeFilter: ['class', 'style'], childList: true, subtree: true, characterData: true });
    for (const sc of document.querySelectorAll('.scrim')) new MutationObserver(() => setTimeout(sample, 0)).observe(sc, { attributes: true, childList: true, subtree: true, characterData: true });
  });
}

// A screenshot of the big notice where it was placed: on SwiftShader a frame can outlast its whole 1.6 s pop, so once
// the HUD has let the last notice go (its 1.7 s timer, late under load), it is shown again in place (its docking and
// position stay on the element), held at full opacity for the shot, then let go again.
async function noticeShot(page, shot, file) {
  await page.waitForFunction(() => !document.getElementById('notice').classList.contains('show'), null, { timeout: 15000, polling: 100 }).catch(() => {});
  await page.evaluate(() => {
    const n = document.getElementById('notice');
    n.dataset.reshow = '1';
    n.classList.add('show');
    for (const a of n.getAnimations()) { a.pause(); a.currentTime = a.effect.getComputedTiming().duration * 0.4; }
  });
  if (process.env.SMOKE_DEBUG) console.log('  notice', file, await page.evaluate(() => { const n = document.getElementById('notice'), r = n.getBoundingClientRect(); return JSON.stringify({ cls: n.className, op: getComputedStyle(n).opacity, vis: getComputedStyle(n).visibility, anims: n.getAnimations().map((a) => a.animationName + ':' + a.playState + ':' + Math.round(a.currentTime)), rect: [r.left, r.top, r.width, r.height].map(Math.round), style: n.getAttribute('style') }); }));
  await shot(file);
  await page.evaluate(() => { const n = document.getElementById('notice'); n.classList.remove('show'); delete n.dataset.reshow; });
}

// 정답! / 다시 생각해 봐요 in the open place dialog: page to its quiz, answer wrong, then right.
async function quizNotices(page, name, shot, touch) {
  for (let i = 0; i < 10; i++) {
    const step = await page.evaluate(() => {
      if (document.querySelector('#place-body .quiz .options button')) return 'quiz';
      const b = document.querySelector('#place-footer .btn.primary');
      if (!b || !/다음|퀴즈/.test(b.textContent)) return 'none';
      b.click(); return 'next';
    });
    if (step !== 'next') break;
    await sleep(300);
  }
  const quiz = await page.evaluate(() => ({ view: document.getElementById('place-panel').dataset.view, options: document.querySelectorAll('#place-body .quiz .options button').length, kick: document.querySelector('#place-body .q-kick')?.textContent, later: document.getElementById('later')?.textContent, reread: document.getElementById('reread')?.textContent }));
  check(quiz.view === 'quiz' && quiz.options === 3 && /^발견 퀴즈 · /.test(quiz.kick) && quiz.later === '나중에 풀기' && quiz.reread === '이야기 다시 보기', `${name}: the quiz shows three big options, ${quiz.later} and ${quiz.reread} (${JSON.stringify(quiz)})`);
  await checkUi(page, name, 'quiz', touch);
  await checkPlaceLayout(page, name, 'quiz');
  await shot('9d-quiz');
  // the feedback under the options: the hint after a wrong answer (red), the explanation after the right one (green)
  const answer = (right) => page.evaluate((right) => {
    const q = window.__hs3d.world.dialog.place?.quiz;
    const b = [...document.querySelectorAll('#place-body .quiz .options button')].find((o) => (Number(o.dataset.answer) === q?.answer) === right && !o.disabled);
    if (!b) return null;
    window.__sounds.length = 0;
    b.click();
    const fb = document.querySelector('#place-body .quiz .feedback');
    return { feedback: fb && !fb.hidden ? fb.textContent : '', tone: fb?.dataset.tone, hint: q.hint, explain: q.explain, sounds: window.__sounds.slice(), marked: b.classList.contains(right ? 'correct' : 'wrong'), locked: [...document.querySelectorAll('#place-body .quiz .options button')].every((o) => o.disabled), finish: document.getElementById('quiz-finish')?.textContent, focus: document.activeElement?.id };
  }, right);
  const wrong = await answer(false);
  check(!!wrong && wrong.feedback === '괜찮아, 다시 생각해 보자! ' + wrong.hint && wrong.tone === 'no' && wrong.marked && !wrong.locked && wrong.sounds.includes('retry'), `${name}: a wrong answer plays retry and shows the hint in red (${JSON.stringify(wrong && { ...wrong, hint: undefined, explain: undefined })})`);
  await sleep(450); if (wrong) await noticeShot(page, shot, '9b-quiz-wrong-notice');
  await sleep(1500);
  const right = await answer(true);
  check(!!right && right.feedback === right.explain && right.tone === 'ok' && right.marked && right.locked && right.sounds.includes('correct') && right.finish === '수첩에 정리하기 →' && right.focus === 'quiz-finish', `${name}: the right answer plays correct, shows the explanation in green and offers 수첩에 정리하기 → (${JSON.stringify(right && { ...right, hint: undefined, explain: undefined })})`);
  await sleep(450); if (right) await noticeShot(page, shot, '9c-quiz-right-notice');
  await sleep(1500);
  const seen = await page.evaluate(() => window.__notices.map((n) => n.title));
  check(!!wrong && !!right && seen.includes('다시 생각해 봐요') && seen.includes('정답!'), `${name}: a wrong and a right quiz answer show 다시 생각해 봐요 and 정답! (${seen.join(' / ')})`);
  await checkUi(page, name, 'quiz answered', touch);
  await checkPlaceLayout(page, name, 'quiz answered');
  await shot('9e-quiz-answered');
  return !!right;
}

// Tab and Shift+Tab move only among the open dialog's controls: never to the HUD, the menu or the page behind.
async function tabStaysIn(page, name, where) {
  const seen = [];
  for (const key of [...Array(14).fill('Tab'), ...Array(6).fill('Shift+Tab')]) {
    await page.keyboard.press(key);
    seen.push(await page.evaluate(() => { const a = document.activeElement; return { id: a?.id || a?.className || a?.tagName, inside: !!a?.closest('#place-dialog [role="dialog"]'), body: a === document.body || a === null } ; }));
  }
  const outside = seen.filter((s) => !s.inside && !s.body).map((s) => s.id);
  const visited = new Set(seen.filter((s) => s.inside).map((s) => s.id));
  check(outside.length === 0 && visited.size >= 2, `${name}: Tab stays inside the ${where} (${visited.size} controls visited${outside.length ? ' — reached ' + outside.join(', ') : ''})`);
}

// Arrival while driving: the dialog stops player and car, closing it fires nothing again, and the arrival shows the
// big notice (도착! / 새로운 발견! / 직행 미션 성공! / 탐방 미션 완료!). The whole place dialog on the way: focus moves in,
// the story (the picture with its 2D kind label, the page count, 사진·자료 출처 and back), paging to the quiz, a wrong
// and a right answer, the reward (the coins and points this visit earned: discovery + quiz + mission bonus) with the
// coin sound, Tab kept inside, then 계속 탐방하기 closes into play with the focus back on the map.
async function driveArrival(page, name, shot, touch) {
  await watchNotices(page);
  await watchSounds(page);
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
      return { id: p.id, coins: W.state.coins, xp: W.state.xp };
    }
    return null;
  });
  if (!drive) { check(false, `${name}: found a road-side place to drive to`); return; }
  let opened = null;
  for (let i = 0; i < 120 && !opened; i++) {
    await sleep(500);
    opened = await page.evaluate(() => { const W = window.__hs3d.world; return W.dialog.isOpen ? { id: W.dialog.place?.id, speed: W.player.speed, carSpeed: W.player.car ? W.player.car.speed : null, hasCar: !!W.player.car, paused: W.ctl.paused(), focusIn: !!document.activeElement?.closest('#place-dialog [role="dialog"]'), focus: document.activeElement?.id } : null; });
  }
  check(!!opened && opened.hasCar && opened.paused, `${name}: driving into a place opens its dialog and pauses (${opened ? opened.id : 'never opened'})`);
  if (!opened) return;
  check(opened.focusIn && opened.focus === 'next-page', `${name}: focus moves into the place dialog, on 다음 이야기 (${opened.focus})`);
  await noticeShot(page, shot, '9-arrival-notice');
  const notices = await page.evaluate(() => window.__notices.slice());
  const arrival = notices.find((n) => ['도착!', '새로운 발견!', '직행 미션 성공!', '탐방 미션 완료!'].includes(n.title));
  check(!!arrival && arrival.above && arrival.fits, `${name}: the arrival shows the big notice beside the dialog (${notices.map((n) => n.title + (n.sub ? ' ' + n.sub : '')).join(' / ') || 'none'})`);
  await sleep(450);
  const still = await page.evaluate(() => { const W = window.__hs3d.world; return { speed: W.player.speed, carSpeed: W.player.car.speed, target: W.target }; });
  check(still.speed === 0 && still.carSpeed === 0 && !still.target, `${name}: player and car are at rest behind the dialog (${JSON.stringify(still)})`);
  await sleep(1200);   // the arrival notice runs out
  // the story: the picture (bundled, loaded) with the 2D kind label and caption, the tag, the page count, the tools
  await page.waitForFunction(() => { const i = document.getElementById('place-img'); return i && i.complete; }, null, { timeout: 20000, polling: 200 }).catch(() => {});
  const story = await page.evaluate(() => {
    const p = window.__hs3d.world.dialog.place, img = document.getElementById('place-img');
    return {
      view: document.getElementById('place-panel').dataset.view, kind: document.getElementById('place-kind').textContent, want: p.photo ? '실제 사진' : p.mediaType === 'map' ? '실제 지형 자료' : '이해를 돕는 삽화',
      caption: document.getElementById('place-caption').textContent, wantCaption: p.caption, img: img.naturalWidth, alt: img.alt, tag: document.getElementById('place-tag').textContent, area: p.area,
      page: document.querySelector('#place-body .page-num')?.textContent, pages: p.pages.length, speech: (() => { const t = document.createElement('template'); t.innerHTML = p.pages[0]; return document.querySelector('#place-body .speech')?.textContent === t.content.textContent; })(),
      prev: document.getElementById('previous-story')?.disabled, next: document.getElementById('next-page')?.textContent, read: document.getElementById('read-aloud')?.textContent,
      sources: document.getElementById('place-sources')?.textContent, wantSources: p.schoolStory ? '학교 사진·자료' : '사진·자료 출처',
    };
  });
  check(story.view === 'story' && story.kind === story.want && story.caption === story.wantCaption && story.img > 0 && story.alt === story.wantCaption && story.tag.startsWith(story.area + ' · ') && story.page === `1 / ${story.pages}` && story.speech
    && story.prev === true && story.next === '다음 이야기 →' && story.read === '▷ 설명 읽기' && story.sources === story.wantSources,
  `${name}: the story shows the picture (${story.img}px, "${story.kind} · ${story.caption}"), "${story.tag}", page ${story.page}, ← 이전 / ${story.next} / ${story.read} / ${story.sources}`);
  await checkUi(page, name, 'place story', touch);
  await checkPlaceLayout(page, name, 'story');
  await shot('9a-place-story');
  // 사진·자료 출처: the 2D sources (credit, links that open a new tab), back to the same page of the story
  const src = await page.evaluate(() => {
    window.__sounds.length = 0;
    document.getElementById('place-sources').click();
    const links = [...document.querySelectorAll('#place-body .src a')];
    return { view: document.getElementById('place-panel').dataset.view, links: links.length, safe: links.every((a) => /^https?:/.test(a.href) && a.target === '_blank' && /noopener/.test(a.rel)), origin: links.some((a) => a.textContent === '장소 자료 원문 ↗'), credit: document.querySelector('#place-body .src .pic-credit')?.textContent || '', back: document.getElementById('back-to-story')?.textContent, focus: document.activeElement?.id, sounds: window.__sounds.slice() };
  });
  check(src.view === 'sources' && src.links > 0 && src.safe && src.origin && src.credit.length > 0 && src.back === '이야기로 돌아가기' && src.focus === 'back-to-story' && src.sounds.includes('click'), `${name}: 사진·자료 출처 shows the credit and ${src.links} source links (new tab) with 이야기로 돌아가기 (${JSON.stringify(src)})`);
  await checkUi(page, name, 'place sources', touch);
  await checkPlaceLayout(page, name, 'sources');
  await shot('9s-place-sources');
  const back = await page.evaluate(() => { document.getElementById('back-to-story').click(); return { view: document.getElementById('place-panel').dataset.view, page: document.querySelector('#place-body .page-num')?.textContent, focus: document.activeElement?.id }; });
  check(back.view === 'story' && back.page === `1 / ${story.pages}` && back.focus === 'place-sources', `${name}: 이야기로 돌아가기 returns to the same page (${JSON.stringify(back)})`);
  // paging: 다음 이야기 -> ... -> 발견 퀴즈 -> (the quiz); ← 이전 steps back
  const paging = await page.evaluate(() => {
    const seen = [], P = () => document.querySelector('#place-body .page-num')?.textContent;
    window.__sounds.length = 0;
    document.getElementById('next-page').click(); seen.push(P());
    document.getElementById('previous-story').click(); seen.push(P());
    return { seen, sounds: window.__sounds.slice(), focus: document.activeElement?.id };
  });
  check(paging.seen[0] === `2 / ${story.pages}` && paging.seen[1] === `1 / ${story.pages}` && paging.sounds.filter((s) => s === 'click').length === 2, `${name}: 다음 이야기 and ← 이전 turn the pages with a click sound (${JSON.stringify(paging)})`);
  const answered = await quizNotices(page, name, shot, touch);
  const clear = await page.evaluate(() => ({ ...window.__noticeCheck }));
  check(clear.samples > 0 && clear.bad.length === 0, `${name}: the notice never covers the dialog's title, text or buttons (${clear.samples} samples with both visible${clear.bad.length ? ' — ' + clear.bad.join(', ') : ''})`);
  // the reward: what this visit earned in all (the state's own change since before the drive), the coin sound
  if (answered) {
    const reward = await page.evaluate(() => {
      const W = window.__hs3d.world;
      window.__sounds.length = 0;
      document.getElementById('quiz-finish').click();
      const num = (k) => document.querySelector(`#place-body .rv [data-num="${k}"] b`)?.textContent;
      return { view: document.getElementById('place-panel').dataset.view, coins: num('coins'), xp: num('xp'), stateCoins: W.state.coins, stateXp: W.state.xp, title: document.querySelector('#place-body .rv h3')?.textContent, journal: document.getElementById('reward-journal')?.textContent, go: document.getElementById('continue-walk')?.textContent, focus: document.activeElement?.id, sounds: window.__sounds.slice() };
    });
    const earned = { coins: reward.stateCoins - drive.coins, xp: reward.stateXp - drive.xp };
    check(reward.view === 'reward' && reward.coins === `+${earned.coins}` && reward.xp === `+${earned.xp}` && reward.title.length > 0 && reward.journal === '발견 수첩 보기' && reward.go === '계속 탐방하기' && reward.focus === 'continue-walk' && reward.sounds.includes('coin'),
      `${name}: the reward shows this visit's ${reward.coins} 금화 and ${reward.xp} 탐험 점수 (the save gained ${earned.coins} / ${earned.xp}) with the coin sound, 발견 수첩 보기 / 계속 탐방하기 (${JSON.stringify({ ...reward, stateCoins: undefined, stateXp: undefined })})`);
    await checkUi(page, name, 'reward', touch);
    await checkPlaceLayout(page, name, 'reward');
    await shot('9f-reward');
    await tabStaysIn(page, name, 'reward view');
  }
  const closed = await page.evaluate(() => { const W = window.__hs3d.world; (document.getElementById('continue-walk') || document.getElementById('place-close')).click(); return { open: W.dialog.isOpen, paused: W.ctl.paused(), carSpeed: W.player.car.speed, focus: document.activeElement?.id, hudInert: document.querySelector('.hud-br').inert }; });
  check(!closed.open && !closed.paused && closed.carSpeed === 0 && closed.focus === 'c' && !closed.hudInert, `${name}: 계속 탐방하기 resumes play with the car at 0 and the focus back on the map (${JSON.stringify(closed)})`);
  await sleep(4000);
  const after = await page.evaluate(() => { const W = window.__hs3d.world; return { open: W.dialog.isOpen, id: W.dialog.place?.id ?? null, carSpeed: W.player.car ? W.player.car.speed : null }; });
  check(!(after.open && after.id === opened.id) && !after.open && after.carSpeed === 0, `${name}: the same place does not reopen and the car stays at rest (${JSON.stringify(after)})`);
}

// The county map dialog's layout in its current view: the panel inside the screen; its header parts, tabs, the map
// stage and its zoom chip and note, and the visible list parts (each clipped to the scroll boxes it sits in, so what is
// scrolled away does not count) inside the panel and clear of one another (overlaps() as ui/dom.js; parts nested in
// one another do not count); no one-line label wider than its button, no row text outside its row; the scrolling list
// keeps at least three lines of room and the map at least 150 x 150.
async function checkMapLayout(page, name, where) {
  const r = await page.evaluate(() => {
    const panel = document.getElementById('map-panel'), P = panel.getBoundingClientRect(), bad = [], out = [], wide = [], spill = [];
    const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const inside = (q, o) => q.left >= o.left - 0.5 && q.right <= o.right + 0.5 && q.top >= o.top - 0.5 && q.bottom <= o.bottom + 0.5;
    const label = (e) => e.id || e.dataset.district || e.dataset.countyPlace || e.dataset.place || e.dataset.nearFilter || e.dataset.story || String(e.className).split(' ')[0] || e.tagName;
    const shown = (e) => { const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05; };
    const clip = (e) => {
      const q = e.getBoundingClientRect();
      let c = { left: q.left, top: q.top, right: q.right, bottom: q.bottom };
      for (let a = e.parentElement; a && a !== panel; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (!/(auto|scroll|hidden)/.test(cs.overflowX + cs.overflowY)) continue;
        const b = a.getBoundingClientRect();
        c = { left: Math.max(c.left, b.left), top: Math.max(c.top, b.top), right: Math.min(c.right, b.right), bottom: Math.min(c.bottom, b.bottom) };
      }
      return c.right - c.left > 0.5 && c.bottom - c.top > 0.5 ? c : null;
    };
    const SEL = 'header .titles > *, #map-tabs, #map-tabs [role="tab"], #map-close, .mview:not([hidden]), .map-view > *, .map-tools, .map-tools > *, .map-note, .map-side > *, .districts > button, .county-place, .map-more summary, .legend-item, .story-card, .search-view > *, .search-box > *, .search-results > li, .nearby-view > *, .near-filters > button, .place-row, .place-row > *';
    const parts = [...panel.querySelectorAll(SEL)].filter((e) => e.closest('[hidden]') === null && shown(e)).map((e) => [e, clip(e)]).filter(([, q]) => q);
    for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
      const [a, ra] = parts[i], [b, rb] = parts[j];
      if (!a.contains(b) && !b.contains(a) && overlaps(ra, rb)) bad.push(`${label(a)} / ${label(b)}`);
    }
    if (!inside(P, { left: 0, top: 0, right: innerWidth, bottom: innerHeight })) out.push('panel');
    for (const [e, q] of parts) if (!inside(q, P)) out.push(label(e));
    for (const b of panel.querySelectorAll('.districts > button, .near-filters > button, #map-tabs [role="tab"], #map-reset, .place-row .go')) if (b.closest('[hidden]') === null && b.clientWidth && b.scrollWidth > b.clientWidth + 1) wide.push(label(b));
    for (const row of panel.querySelectorAll('.place-row, .county-place, .search-results > li, .story-card')) {
      if (row.closest('[hidden]') !== null || !clip(row)) continue;
      const q = row.getBoundingClientRect();
      for (const k of row.querySelectorAll('*')) { const e = k.getBoundingClientRect(); if (e.width && (e.left < q.left - 0.5 || e.right > q.right + 0.5 || e.top < q.top - 0.5 || e.bottom > q.bottom + 0.5)) spill.push(`${label(row)} ${label(k)}`); }
    }
    const scroller = panel.querySelector('.mview:not([hidden]) .map-side') || panel.querySelector('.mview:not([hidden])');
    const stage = panel.querySelector('.mview:not([hidden]) .map-stage')?.getBoundingClientRect();
    return { view: panel.dataset.view, parts: parts.length, bad: bad.slice(0, 6), nBad: bad.length, out: out.slice(0, 6), wide, spill: spill.slice(0, 4), nSpill: spill.length, room: Math.round(scroller.clientHeight), stage: stage ? [Math.round(stage.width), Math.round(stage.height)] : null };
  });
  const roomy = r.room >= 72 && (!r.stage || (r.stage[0] >= 150 && r.stage[1] >= 150));
  check(r.nBad === 0 && r.out.length === 0 && r.wide.length === 0 && r.nSpill === 0 && roomy, `${name} map ${where} (${r.view}): ${r.parts} parts inside the panel and screen, none overlapping, labels fit, list ${r.room} px${r.stage ? ', map ' + r.stage.join('x') : ''}${r.nBad ? ' — overlap: ' + r.bad.join(', ') : ''}${r.out.length ? ' — outside: ' + r.out.join(', ') : ''}${r.wide.length ? ' — too wide: ' + r.wide.join(', ') : ''}${r.nSpill ? ' — spilling: ' + r.spill.join(', ') : ''}`);
}

// 홍성군 전체 지도 (ui/county-map.js, ui/search.js; P23) at this viewport. The minimap opens it at 지도 (paused, focus in,
// the county drawn with its 223 pins); + / the wheel / two fingers zoom it, a drag pans it, 전체 보기 zooms out; a
// district lists its places and frames itself; the legend and the 18 story cards open (a card opens its story); one pin
// under a tap heads there, several open 주변 찾기 with only those. 장소 찾기: ㅎㅅㅇ (initial consonants) and 홍성역, the
// arrows and Escape (the list first, the dialog second), a composing Enter (Chrome and Safari orders) chooses nothing,
// then Enter (a tap on touch screens) chooses 홍성역: the map closes and the route starts with the move sound. 주변 찾기:
// the 2D filters and the name filter, nearest first. The menu's 장소 찾기 opens the search view. Each view's sizes, fonts
// and layout; screenshots.
const SCHOOL_KINDS = ['elementary', 'middle', 'high', 'university'];
async function checkMap(page, name, spec, shot) {
  const touch = !!spec.touch, kind = touch ? 'touch' : 'mouse';
  await watchSounds(page);
  const home = await page.evaluate(() => { window.__hs3d.closeDialogs(); const p = window.__hs3d.player; return [p.x, p.y]; });
  const back = () => page.evaluate(([x, y]) => { const W = window.__hs3d.world; for (let i = 0; i < 4 && W.ctl.paused(); i++) window.__hs3d.closeDialogs(); W.target = null; window.__hs3d.teleport(x, y); }, home);
  // the minimap opens the map, paused, focus on the 지도 tab
  const opened = await page.evaluate(() => {
    document.getElementById('minimap').click();
    const W = window.__hs3d.world;
    return { open: !document.getElementById('map-dialog').hidden, kind: W.ctl.dialog?.kind, paused: W.ctl.paused(), view: document.getElementById('map-panel').dataset.view, focus: document.activeElement?.id, inert: document.querySelector('.hud-br').inert, where: document.getElementById('map-where').textContent, chip: document.getElementById('where').textContent };
  });
  check(opened.open && opened.kind === 'map' && opened.paused && opened.view === 'map' && opened.focus === 'mtab-map' && opened.inert && opened.where === '현재 위치 · ' + opened.chip, `${name}: the minimap opens 홍성군 전체 지도 at 지도, paused, focus on its tab, the HUD inert (${JSON.stringify(opened)})`);
  await page.waitForFunction(() => window.__hs3d.world.mapDialog.map.ready, null, { timeout: 30000, polling: 300 }).catch(() => {});
  await sleep(500);
  const drawn = await page.evaluate(() => {
    const c = document.getElementById('county-canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, colours = new Set(), m = window.__hs3d.world.mapDialog.map;
    for (let i = 0; i < d.length; i += 64) colours.add((d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | d[i + 2] >> 3);
    return { w: c.width, h: c.height, colours: colours.size, pins: m.pins.length, zoom: document.getElementById('map-zoom').textContent, out: document.getElementById('map-out').disabled, districts: [...document.querySelectorAll('#map-side [data-district]')].map((b) => b.textContent), heading: document.getElementById('county-results-heading').textContent, rows: document.querySelectorAll('#county-results .county-place').length };
  });
  check(drawn.w > 0 && drawn.colours > 80 && drawn.pins === 223 && drawn.zoom === '100%' && drawn.out, `${name}: the county is drawn (${drawn.w}x${drawn.h}, ${drawn.colours} colours) with ${drawn.pins} pins at ${drawn.zoom}, − disabled`);
  check(drawn.districts.length === 12 && drawn.districts[0] === '전체 지역' && drawn.districts[1] === '홍성읍 · 58곳' && drawn.heading === '전체 지역 · 223곳' && drawn.rows === 223, `${name}: 지역 목록 lists 전체 지역 and the 11 districts with counts, ${drawn.heading} (${drawn.districts.slice(0, 4).join(' / ')} …)`);
  await checkUi(page, name, 'county map', touch);
  await checkMapLayout(page, name, 'start');
  await shot('map-1-county');
  // zoom: the + button, then the wheel (mouse) or a pinch (touch); a drag pans; 전체 보기 zooms back out
  const zoom = await page.evaluate(async (kind) => {
    const m = window.__hs3d.world.mapDialog.map, c = document.getElementById('county-canvas'), r = c.getBoundingClientRect(), wait = () => new Promise((f) => setTimeout(f, 120));
    const ev = (type, id, x, y) => c.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: kind, isPrimary: id === 61, clientX: x, clientY: y, bubbles: true, cancelable: true, buttons: type === 'pointerup' ? 0 : 1 }));
    document.getElementById('map-in').click();
    // the label follows on the map's next frame, which a busy SwiftShader frame of the world behind can delay
    for (let i = 0; i < 60 && document.getElementById('map-zoom').textContent !== '150%'; i++) await new Promise((f) => setTimeout(f, 50));
    const plus = { zoom: m.view.zoom, label: document.getElementById('map-zoom').textContent };
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let pinch = null;
    if (kind === 'touch') {
      const z0 = m.view.zoom;
      ev('pointerdown', 61, cx - 30, cy); ev('pointerdown', 62, cx + 30, cy);
      for (let i = 1; i <= 6; i++) { ev('pointermove', 61, cx - 30 - i * 8, cy); ev('pointermove', 62, cx + 30 + i * 8, cy); await new Promise((f) => setTimeout(f, 16)); }
      ev('pointerup', 61, cx - 78, cy); ev('pointerup', 62, cx + 78, cy); await wait();
      pinch = { from: z0, to: m.view.zoom };
    }
    const c0 = m.view.view.center.slice();
    ev('pointerdown', 63, cx, cy); for (let i = 1; i <= 4; i++) ev('pointermove', 63, cx + i * 15, cy + i * 10); ev('pointerup', 63, cx + 60, cy + 40); await wait();
    const c1 = m.view.view.center.slice(), open = !document.getElementById('map-dialog').hidden;
    return { plus, pinch, moved: [Math.round(c0[0] - c1[0]), Math.round(c0[1] - c1[1])], open };
  }, kind);
  if (!touch) {
    const box = await page.locator('#county-canvas').boundingBox();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4);
    await page.mouse.wheel(0, -300);
    await sleep(300);
    zoom.wheel = await page.evaluate(() => window.__hs3d.world.mapDialog.map.view.zoom);
  }
  check(Math.abs(zoom.plus.zoom - 1.5) < 1e-6 && zoom.plus.label === '150%' && (touch ? zoom.pinch.to > zoom.pinch.from * 1.8 : zoom.wheel > 1.5 * 1.15) && zoom.moved[0] > 0 && zoom.moved[1] > 0 && zoom.open,
    `${name}: + zooms to ${zoom.plus.label}, ${touch ? `two fingers ${zoom.pinch.from.toFixed(2)} -> ${zoom.pinch.to.toFixed(2)}` : `the wheel -> ${zoom.wheel.toFixed(2)}`}, a drag pans the map ${zoom.moved.join(', ')} m and taps nothing`);
  await sleep(300);
  await shot('map-2-zoomed');
  const all = await page.evaluate(() => { document.getElementById('map-reset').click(); return window.__hs3d.world.mapDialog.map.view.zoom; });
  check(all === 1, `${name}: 전체 보기 shows the whole county again (zoom ${all})`);
  // a district: its places nearest first, the map framing it
  const district = await page.evaluate(async () => {
    const W = window.__hs3d.world, b = document.querySelector('#map-side [data-district="홍성군 홍성읍"]');
    b.click(); await new Promise((f) => setTimeout(f, 200));
    const rows = [...document.querySelectorAll('#county-results .county-place')].map((e) => W.byId.get(e.dataset.countyPlace));
    const d = rows.map((p) => Math.hypot(p.point[0] - W.player.x, p.point[1] - W.player.y));
    return { pressed: b.getAttribute('aria-pressed'), heading: document.getElementById('county-results-heading').textContent, n: rows.length, area: rows.every((p) => p.area === '홍성군 홍성읍'), sorted: d.every((v, i) => !i || v >= d[i - 1]), zoom: W.mapDialog.map.view.zoom, sounds: window.__sounds.slice(-1) };
  });
  check(district.pressed === 'true' && district.heading === '홍성군 홍성읍 · 58곳' && district.n === 58 && district.area && district.sorted && district.zoom > 2 && district.sounds[0] === 'click', `${name}: 홍성읍 lists its ${district.n} places nearest first under "${district.heading}" and frames the district (zoom ${district.zoom.toFixed(2)})`);
  await sleep(300);
  await checkUi(page, name, 'county map district', touch);
  await checkMapLayout(page, name, 'district');
  await shot('map-3-district');
  // the legend and the story cards (images load once opened)
  const more = await page.evaluate(() => { const l = document.getElementById('map-legend'), s = document.getElementById('map-stories'); l.open = true; s.open = true; s.scrollIntoView({ block: 'start' }); return { legend: l.querySelectorAll('.legend-item').length, stories: s.querySelectorAll('.story-card').length, buttons: [...s.querySelectorAll('[data-travel]')].every((b) => b.textContent === '이야기 만나기 →') }; });
  await page.waitForFunction(() => { const i = document.querySelector('#map-stories .story-card img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 20000, polling: 300 }).catch(() => {});
  more.img = await page.evaluate(() => document.querySelector('#map-stories .story-card img')?.naturalWidth || 0);
  const kinds = new Set(PLACES.map(symbolKey)).size, remote = PLACES.filter((p) => p.remote).length;
  check(more.legend === kinds && more.stories === remote && remote === 18 && more.buttons && more.img > 0, `${name}: 장소 아이콘 알아보기 shows the ${more.legend} 2D symbols and 우리 고장의 문화 이야기 the ${more.stories} story cards (picture ${more.img}px)`);
  await sleep(300);
  await checkUi(page, name, 'county map legend and stories', touch);
  await checkMapLayout(page, name, 'legend and stories');
  await shot('map-4-stories');
  const story = await page.evaluate(() => { const b = document.querySelector('#map-stories [data-travel]'), W = window.__hs3d.world; b.click(); return { id: b.dataset.travel, map: !document.getElementById('map-dialog').hidden, place: W.dialog.isOpen ? W.dialog.place.id : null, kind: W.ctl.dialog?.kind, paused: W.ctl.paused() }; });
  check(!story.map && story.place === story.id && story.kind === 'place' && story.paused, `${name}: a story card's 이야기 만나기 opens that story in the place dialog (${JSON.stringify(story)})`);
  await back();
  // pins: a tap on a lone pin heads there; a tap where several pins meet lists only those under 주변 찾기
  const pins = await page.evaluate(async (kind) => {
    const W = window.__hs3d.world, c = document.getElementById('county-canvas'), m = W.mapDialog.map;
    document.getElementById('minimap').click(); await new Promise((f) => setTimeout(f, 300));
    const r = c.getBoundingClientRect(), list = m.pins, me = [W.player.x, W.player.y];
    const under = (v) => list.filter((u) => Math.hypot(u.x - v.x, u.y - v.y) < 16);
    const ev = (type, x, y) => c.dispatchEvent(new PointerEvent(type, { pointerId: 71, pointerType: kind, isPrimary: true, clientX: r.left + x, clientY: r.top + y, bubbles: true, cancelable: true }));
    const many = list.find((v) => under(v).length >= 3);
    ev('pointerdown', many.x, many.y); ev('pointerup', many.x, many.y);
    const near = { view: document.getElementById('map-panel').dataset.view, title: document.getElementById('nearby-title').textContent, rows: [...document.querySelectorAll('#nearby-list .place-row')].map((e) => e.dataset.place), want: under(many).map((v) => v.p.id), filters: document.querySelector('#mview-nearby .near-filters').hidden };
    document.getElementById('mtab-map').click(); await new Promise((f) => setTimeout(f, 200));
    const lone = list.find((v) => under(v).length === 1 && Math.hypot(v.p.point[0] - me[0], v.p.point[1] - me[1]) > 2000 && v.x > 60 && v.y > 90);
    window.__sounds.length = 0;
    ev('pointerdown', lone.x, lone.y); ev('pointerup', lone.x, lone.y);
    return { near, lone: { id: lone.p.id, map: !document.getElementById('map-dialog').hidden, paused: W.ctl.paused(), target: W.target && Math.hypot(W.target[0] - lone.p.point[0], W.target[1] - lone.p.point[1]) < 1, sounds: window.__sounds.slice() } };
  }, kind);
  check(pins.near.view === 'nearby' && pins.near.title === '가까이 있는 장소' && pins.near.filters && pins.near.rows.length === pins.near.want.length && pins.near.want.every((id) => pins.near.rows.includes(id)), `${name}: a tap on ${pins.near.want.length} pins at once lists only those under 가까이 있는 장소 (${pins.near.rows.join(', ')})`);
  check(!pins.lone.map && !pins.lone.paused && pins.lone.target && pins.lone.sounds.includes('move'), `${name}: a tap on a lone pin (${pins.lone.id}) closes the map and heads there with the move sound (${JSON.stringify(pins.lone)})`);
  await back();
  // 장소 찾기: initial consonants, the arrows, Escape on the list, the IME guard, then 홍성역
  await page.evaluate(() => { document.getElementById('minimap').click(); document.getElementById('mtab-search').click(); });
  await page.fill('#map-query', 'ㅎㅅㅇ');
  await sleep(200);
  const initials = await page.evaluate(() => ({ focus: document.activeElement?.id, expanded: document.getElementById('map-query').getAttribute('aria-expanded'), options: [...document.querySelectorAll('#map-results [role="option"]')].map((o) => o.querySelector('strong').textContent) }));
  check(initials.focus === 'map-query' && initials.expanded === 'true' && initials.options[0] === '홍성역' && initials.options.length === 6, `${name}: 장소 찾기 finds ㅎㅅㅇ by initial consonants (${initials.options.join(' / ')})`);
  await sleep(200);
  await checkUi(page, name, 'place search', touch);
  await checkMapLayout(page, name, 'search ㅎㅅㅇ');
  await shot('map-5-search-initials');
  for (const k of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowUp']) await page.keyboard.press(k);
  const keys = await page.evaluate(() => ({ active: document.getElementById('map-query').getAttribute('aria-activedescendant'), selected: [...document.querySelectorAll('#map-results [role="option"]')].findIndex((o) => o.getAttribute('aria-selected') === 'true') }));
  await page.keyboard.press('Escape');
  const esc = await page.evaluate(() => ({ list: document.getElementById('map-results').hidden, expanded: document.getElementById('map-query').getAttribute('aria-expanded'), map: !document.getElementById('map-dialog').hidden }));
  check(keys.active === 'map-result-1' && keys.selected === 1 && esc.list && esc.expanded === 'false' && esc.map, `${name}: the arrows move through the results (${keys.active}) and Escape closes the list, not the map (${JSON.stringify(esc)})`);
  const ime = await page.evaluate(() => {
    const i = document.getElementById('map-query'), W = window.__hs3d.world, state = () => ({ map: !document.getElementById('map-dialog').hidden, target: !!W.target, value: i.value });
    i.focus(); i.value = '';
    i.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
    i.value = '홍성역'; i.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true, inputType: 'insertCompositionText', data: '역' }));
    const chrome = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229, isComposing: true, bubbles: true, cancelable: true });
    i.dispatchEvent(chrome);
    const during = { ...state(), options: document.querySelectorAll('#map-results [role="option"]').length };
    i.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '역' }));
    const safari = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229, bubbles: true, cancelable: true });   // Safari: the committing Enter after compositionend
    i.dispatchEvent(safari);
    return { during, after: state(), first: document.querySelector('#map-results [role="option"] strong')?.textContent };
  });
  check(ime.during.map && !ime.during.target && ime.during.options > 0 && ime.after.map && !ime.after.target && ime.after.value === '홍성역' && ime.first === '홍성역', `${name}: an Enter inside a Korean IME composition chooses nothing (Chrome and Safari orders; ${JSON.stringify(ime)})`);
  await sleep(200);
  await shot('map-6-search-station');
  await page.evaluate(() => { window.__sounds.length = 0; });
  if (touch) await page.tap('#map-result-0'); else await page.keyboard.press('Enter');
  const station = PLACES.find((p) => p.id === 'new-hongseong-station');
  const route = await page.evaluate(async (id) => {
    const W = window.__hs3d.world, p = W.byId.get(id), r = { map: !document.getElementById('map-dialog').hidden, paused: W.ctl.paused(), target: !!W.target && Math.hypot(W.target[0] - p.point[0], W.target[1] - p.point[1]) < 1, focus: document.activeElement?.id, toast: document.getElementById('toast').textContent, sounds: window.__sounds.slice() };
    const x0 = W.player.x, y0 = W.player.y;
    for (let i = 0; i < 20 && !(W.player.route?.length || Math.hypot(W.player.x - x0, W.player.y - y0) > 1); i++) await new Promise((f) => setTimeout(f, 100));
    r.route = W.player.route?.length || 0; r.moved = Math.round(Math.hypot(W.player.x - x0, W.player.y - y0));
    return r;
  }, station.id);
  check(!route.map && !route.paused && route.target && route.focus === 'c' && route.toast.includes(station.name) && route.sounds.includes('move') && (route.route > 0 || route.moved > 0), `${name}: ${touch ? 'a tap on' : 'Enter on'} 홍성역 closes the map and starts the route there (${JSON.stringify(route)})`);
  await back();
  // 주변 찾기: the 2D filters and the name filter, nearest first
  const near = await page.evaluate(async () => {
    const W = window.__hs3d.world;
    W.ctl.open('nearby');
    await new Promise((f) => setTimeout(f, 200));
    const rows = () => [...document.querySelectorAll('#nearby-list .place-row')].map((e) => W.byId.get(e.dataset.place) || { id: e.dataset.place });
    const dist = (list) => list.map((p) => (p.point ? Math.hypot(p.point[0] - W.player.x, p.point[1] - W.player.y) : Infinity));
    const sorted = (d) => d.every((v, i) => !i || v >= d[i - 1]);
    const r = { view: document.getElementById('map-panel').dataset.view, title: document.getElementById('nearby-title').textContent, filters: [...document.querySelectorAll('#mview-nearby [data-near-filter]')].map((b) => b.textContent), all: rows().length, sorted: sorted(dist(rows())), go: document.querySelector('#nearby-list .go')?.textContent };
    document.querySelector('#mview-nearby [data-near-filter="school"]').click();
    const schools = rows();
    r.schools = schools.map((p) => p.id); r.schoolsSorted = sorted(dist(schools));
    const input = document.getElementById('nearby-search');
    input.value = '초등'; input.dispatchEvent(new Event('input', { bubbles: true }));
    r.named = rows().map((p) => `${p.name} ${p.originalName || ''} ${p.area} ${p.category}`);
    return r;
  });
  const wantSchools = PLACES.filter((p) => !p.remote && SCHOOL_KINDS.includes(symbolKey(p))).map((p) => p.id).sort();
  check(near.view === 'nearby' && near.title === '홍성의 장소 찾기' && near.filters.length === 15 && near.filters[4] === '초·중·고·대학교' && near.all === 223 && near.sorted && near.go === '찾아가기 →', `${name}: 주변 찾기 lists the ${near.all} places nearest first under the 15 2D filters (${near.filters.slice(0, 5).join(' / ')} …)`);
  check(JSON.stringify(near.schools.slice().sort()) === JSON.stringify(wantSchools) && near.schoolsSorted && near.named.length > 0 && near.named.every((t) => t.includes('초등')), `${name}: 초·중·고·대학교 keeps the ${near.schools.length} schools nearest first and 초등 narrows them to ${near.named.length}`);
  await sleep(200);
  await checkUi(page, name, 'nearby', touch);
  await checkMapLayout(page, name, 'nearby schools');
  await shot('map-7-nearby');
  await page.evaluate(() => { const i = document.getElementById('nearby-search'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#mview-nearby [data-near-filter="all"]').click(); document.getElementById('mview-nearby').scrollTop = 0; });
  await sleep(200);
  await checkMapLayout(page, name, 'nearby all');
  await shot('map-8-nearby-all');
  // the menu's 장소 찾기 opens the search view; Escape on the empty field closes the map into play
  const fromMenu = await page.evaluate(() => {
    const W = window.__hs3d.world;
    window.__hs3d.closeDialogs();
    document.getElementById('home-btn').click(); document.getElementById('tab-missions').click();
    const b = document.getElementById('open-search');
    b?.click();
    return { label: b?.textContent, menu: !document.getElementById('menu').hidden, map: !document.getElementById('map-dialog').hidden, kind: W.ctl.dialog?.kind, view: document.getElementById('map-panel').dataset.view, focus: document.activeElement?.id, value: document.getElementById('map-query').value, paused: W.ctl.paused() };
  });
  check(fromMenu.label === '장소 찾기' && !fromMenu.menu && fromMenu.map && fromMenu.kind === 'search' && fromMenu.view === 'search' && fromMenu.focus === 'map-query' && fromMenu.value === '' && fromMenu.paused, `${name}: the menu's 장소 찾기 opens the map at 장소 찾기 with the focus in the field (${JSON.stringify(fromMenu)})`);
  await page.keyboard.press('Escape');
  const closed = await page.evaluate(() => ({ map: !document.getElementById('map-dialog').hidden, paused: window.__hs3d.ctl.paused(), focus: document.activeElement?.id, inert: document.querySelector('.hud-br').inert }));
  check(!closed.map && !closed.paused && closed.focus === 'c' && !closed.inert, `${name}: Escape closes the map into play, focus back on the map (${JSON.stringify(closed)})`);
  await back();
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
  await checkMenu(page, name, spec, shot);
  check(info.buildings > 2000 && info.realBuildings >= 2000, `${name}: buildings ${info.buildings} (real ${info.realBuildings})`);
  check(info.places === 223, `${name}: 223 mapped places (${info.places})`);
  check(info.npcs >= 50, `${name}: NPCs placed (${info.npcs})`);
  check(info.lamps > 0, `${name}: street lamps (${info.lamps})`);
  check(info.terrainChunks > 0, `${name}: terrain chunks built (${info.terrainChunks})`);
  if (spec.keysWhileLoading) {
    const k = await page.evaluate(() => ({ n: window.__keysWhileLoading || 0, q: window.__hs3d.info().quality.mode }));
    check(k.n > 0 && errors.length === 0, `${name}: ${k.n} action keys pressed while loading were ignored without errors (quality ${k.q})`);
  }
  if (!await checkJournal(page, name, spec, shot)) { check(errors.length === 0, `${name}: no pageerror (${errors.join(' | ').slice(0, 400)})`); await ctx.close(); return; }
  await checkMap(page, name, spec, shot);
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
    await driveArrival(page, name, shot, spec.touch);
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
  // the place dialog (opened as a tap on a pin would): a real photo, then Escape closes it with the focus back on the map
  const pin = await page.evaluate(() => { window.__hs3d.openPlace('library'); const d = document.getElementById('place-dialog'); return { open: !d.hidden, text: d.textContent.slice(0, 80), kind: document.getElementById('place-kind').textContent }; });
  check(pin.open && pin.kind === '실제 사진', `${name}: place dialog opens with "${pin.kind}" (${pin.text.replace(/\s+/g, ' ')})`);
  await sleep(1500);
  await shot('5-place-dialog');
  await checkUi(page, name, 'place dialog');
  await page.keyboard.press('Escape');
  const esc = await page.evaluate(() => ({ open: window.__hs3d.world.dialog.isOpen, paused: window.__hs3d.ctl.paused(), focus: document.activeElement?.id }));
  check(!esc.open && !esc.paused && esc.focus === 'c', `${name}: Escape closes the place dialog into play, focus on the map (${JSON.stringify(esc)})`);
  // real terrain data (a place not found yet: its quiz asks to go there first)
  const terrain = await page.evaluate(() => { window.__hs3d.openPlace('sanga-stream'); return document.getElementById('place-kind').textContent; });
  for (let i = 0; i < 8; i++) {   // page through to the quiz step
    const label = await page.evaluate(() => { const b = document.querySelector('#place-footer .btn.primary'); if (!b) return ''; const t = b.textContent; if (/다음|퀴즈/.test(t)) b.click(); return t; });
    if (!/다음|퀴즈/.test(label)) break;
    await sleep(300);
  }
  const step = await page.evaluate(() => ({ view: document.getElementById('place-panel').dataset.view, go: document.querySelector('#place-footer .btn.primary')?.textContent, options: document.querySelectorAll('#place-body .quiz .options button').length }));
  check(terrain === '실제 지형 자료' && step.view === 'quiz' && step.go === '여기로 가기' && step.options === 0, `${name}: "${terrain}" on a terrain picture; a place not found yet asks to go there before its quiz (${JSON.stringify(step)})`);
  await checkUi(page, name, 'quiz step');
  await checkPlaceLayout(page, name, 'quiz step');
  await shot('5b-quiz-step');
  // a school: an illustration, 학교 사진·자료 with the school's facts and links
  const SCHOOL = PLACES.find((p) => p.schoolStory && !p.remote);
  const school = await page.evaluate((id) => {
    window.__hs3d.openPlace(id);
    const r = { kind: document.getElementById('place-kind').textContent, button: document.getElementById('place-sources').textContent };
    document.getElementById('place-sources').click();
    return { ...r, facts: [...document.querySelectorAll('#place-body .src .facts span')].map((e) => e.textContent), links: [...document.querySelectorAll('#place-body .src a')].map((a) => a.textContent) };
  }, SCHOOL.id);
  check(school.kind === '이해를 돕는 삽화' && school.button === '학교 사진·자료' && school.facts.length > 0 && school.links.includes('학교 누리집 ↗') && school.links.includes('장소 자료 원문 ↗'), `${name}: a school (${SCHOOL.name}) shows "${school.kind}" and 학교 사진·자료 with ${school.facts.join(' / ')} and ${school.links.length} links`);
  await sleep(300);
  await checkUi(page, name, 'school sources');
  await checkPlaceLayout(page, name, 'school sources');
  await shot('5c-school-sources');
  // 발견 수첩 보기 on the reward opens the menu at the 수첩 (a found place, replayed: its quiz answered right)
  const toJournal = await page.evaluate(async () => {
    const W = window.__hs3d.world;
    window.__hs3d.openPlace('library');
    for (let i = 0; i < 8 && !document.querySelector('#place-body .quiz .options button'); i++) document.querySelector('#place-footer .btn.primary')?.click();
    const q = W.dialog.place.quiz;
    document.querySelector(`#place-body .quiz .options button[data-answer="${q.answer}"]`)?.click();
    document.getElementById('quiz-finish')?.click();
    const reward = document.getElementById('place-panel').dataset.view;
    document.getElementById('reward-journal')?.click();
    const r = { reward, place: W.dialog.isOpen, menu: !document.getElementById('menu').hidden, tab: document.getElementById('tab-journal').getAttribute('aria-selected'), paused: W.ctl.paused() };
    document.getElementById('menu-go').click();
    return r;
  });
  check(toJournal.reward === 'reward' && !toJournal.place && toJournal.menu && toJournal.tab === 'true' && toJournal.paused, `${name}: 발견 수첩 보기 on the reward opens the menu at the 수첩 (${JSON.stringify(toJournal)})`);
  await checkHud(page, name, spec, shot);
  await driveArrival(page, name, shot, spec.touch);
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
  // a UTF-8 locale for the browser: without one (LANG unset) Linux Chromium saves the Korean download names as "download"
  const env = { ...process.env, LANG: /utf-?8/i.test(process.env.LANG || '') ? process.env.LANG : 'C.UTF-8' };
  const browser = await chromium.launch({ env, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
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
