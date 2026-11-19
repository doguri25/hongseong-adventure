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
// note across a reload, both downloads and the import (refused files, 취소, then accepted with a reload). Screenshots go
// to OUT (SMOKE_OUT, default a folder in the system temp directory; SMOKE_ONLY=tablet,phone,landscape runs only those
// passes).
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { PLACES } from '#game/content.js';
import { STAMPS, JOURNALS } from '#game/wardrobe.js';
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
  '#found-btn', '.tally dt', '.tally dd', '.tally small', '.j-desc', '.j-empty', '.j-note label', '#journal-note'];
const LABEL_MIN = [['.travel button span', 13], ['.travel button small', 12], ['.dialog .tag', 13], ['.skill .lbl', 13], ['.skill small', 12], ['.mission-kick', 13], ['#mission-title', 13], ['.mission .badge', 13], ['.mission-foot .btn', 13], ['#speed-factor', 12], ['.cam-pad button', 13],
  ['.menu .tabs [role="tab"]', 13], ['.menu h3', 13], ['.mis-kick', 13], ['.mis-card h4', 13], ['.mis-card .btn', 13], ['.ride-head b', 13], ['.card .factor', 12], ['.shop-cats .cat', 13], ['.card.char b', 13], ['.card.char span', 13], ['.product h4', 13], ['.product .buy', 13], ['.opt-name', 13], ['.seg button', 13], ['.menu select', 13], ['.menu .settings > .btn', 13], ['.reset-confirm .btn', 13], ['.menu .go', 13],
  ['.j-filters button', 13], ['.j-tag', 13], ['.j-stamp', 13], ['.j-card b', 13], ['.j-actions .btn', 13]];
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

// The 수첩 (ui/journal.js) at this viewport. A found place (quiz solved), a worn stamp and 수첩 colour are seeded; the
// HUD's discovery chip opens the menu at the 수첩 tab; every filter shows its cards (sizes, fonts, layout); a found
// place replays its story and so does a story-only place, both without counting as found, and a place not found yet
// becomes the walk target (all three close the menu); the note is saved as it is typed and is there after a reload;
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
  // a story-only place, not found: its story too, and it is still not found afterwards
  const remote = PLACES.find((p) => p.remote).id;
  const story = await page.evaluate((id) => {
    const W = window.__hs3d.world;
    document.getElementById('found-btn').click();
    document.querySelector(`#journal-list [data-place="${id}"]`).click();
    const r = { menu: !document.getElementById('menu').hidden, place: W.dialog.isOpen ? W.dialog.place?.id : null, physical: W.ctl.dialog?.data?.physical, found: W.state.discovered.includes(id) };
    window.__hs3d.closeDialogs();
    return r;
  }, remote);
  check(!story.menu && story.place === remote && story.physical === false && !story.found, `${name}: a story-only card (${remote}) opens its story (${JSON.stringify(story)})`);
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
async function quizNotices(page, name, shot) {
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
  const answer = (right) => page.evaluate((right) => {
    const a = window.__hs3d.world.dialog.place?.quiz?.answer;
    const b = [...document.querySelectorAll('#place-body .quiz .options button')].find((o) => (Number(o.dataset.answer) === a) === right && !o.disabled);
    if (!b) return false;
    b.click(); return true;
  }, right);
  const wrong = await answer(false);
  await sleep(450); if (wrong) await noticeShot(page, shot, '9b-quiz-wrong-notice');
  await sleep(1500);
  const right = await answer(true);
  await sleep(450); if (right) await noticeShot(page, shot, '9c-quiz-right-notice');
  await sleep(1500);
  const seen = await page.evaluate(() => window.__notices.map((n) => n.title));
  check(wrong && right && seen.includes('다시 생각해 봐요') && seen.includes('정답!'), `${name}: a wrong and a right quiz answer show 다시 생각해 봐요 and 정답! (${seen.join(' / ')})`);
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
  await noticeShot(page, shot, '9-arrival-notice');
  const notices = await page.evaluate(() => window.__notices.slice());
  const arrival = notices.find((n) => ['도착!', '새로운 발견!', '직행 미션 성공!', '탐방 미션 완료!'].includes(n.title));
  check(!!arrival && arrival.above && arrival.fits, `${name}: the arrival shows the big notice beside the dialog (${notices.map((n) => n.title + (n.sub ? ' ' + n.sub : '')).join(' / ') || 'none'})`);
  await sleep(450);
  const still = await page.evaluate(() => { const W = window.__hs3d.world; return { speed: W.player.speed, carSpeed: W.player.car.speed, target: W.target }; });
  check(still.speed === 0 && still.carSpeed === 0 && !still.target, `${name}: player and car are at rest behind the dialog (${JSON.stringify(still)})`);
  await sleep(1200);   // the arrival notice runs out
  await quizNotices(page, name, shot);
  const clear = await page.evaluate(() => ({ ...window.__noticeCheck }));
  check(clear.samples > 0 && clear.bad.length === 0, `${name}: the notice never covers the dialog's title, text or buttons (${clear.samples} samples with both visible${clear.bad.length ? ' — ' + clear.bad.join(', ') : ''})`);
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
