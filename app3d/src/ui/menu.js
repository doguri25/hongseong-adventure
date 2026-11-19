// The title and menu (pokju #menu): the game name, the coins (#wallet), the primary button (이어하기, or 탐방 시작 on a
// fresh save) and five tabs: 탐방 (today's three missions and 장소 찾기, which opens the county map's search view),
// 탈것 (six vehicles with rendered pictures, ui/thumbs.js), 꾸미기 (the three characters and the 2D shop, ui/shop.js),
// 수첩 (the discovery journal and the save files, ui/journal.js) and 설정.
// It is the game controller's 'menu' dialog: opening it pauses the game (the world keeps rendering behind at <= 10 fps)
// and every way out (the primary button, Escape) goes through ctx.onClose -> ctl.close(). The rules stay in the pure
// modules (game/missions.js missionCards, shop.js, dist/core.js purchase); main.js applies every effect (ctx below).
// Copy is the 2D game's (dist/game.js showMissions, showShop, showHelp settings and reset).
import { el, openModal, closeModal } from './dom.js';
import { shopView, pressItem, chooseCharacter } from './shop.js';
import { createJournal } from './journal.js';
import { download, saveFile, SAVE_NAME } from '../game/files.js';
import { missionCards } from '../game/missions.js';
import { SHOP_CATEGORIES } from '#game/wardrobe.js';
import { koreanVoices } from '#game/audio.js';

const LITE_2D = false;   // 가벼운 2D로 열기 (./2d/): phase 2b moves the 2D game there and turns this on
const TABS = ['missions', 'vehicles', 'wardrobe', 'journal', 'settings'];
// the six vehicles: label, factor (ui/gauge.js factorLabel), one line about each
export const RIDES = [
  ['walk', '걷기', '×1', '걸어서 골목골목 둘러봐요'],
  ['bike', '자전거', '×2', '걷기보다 두 배 빨라요'],
  ['car', '자동차', '×4', '차도를 따라 알아서 달려요'],
  ['supercar', '슈퍼카', '×8', '차도를 따라 아주 빠르게 달려요'],
  ['slowplane', '느린 비행기', '×4', '마을을 천천히 내려다봐요'],
  ['plane', '비행기', '×16', '물 위도 날아서 멀리 가요'],
];
const VOICE_TEST = '안녕! 우리 고장 홍성의 이야기를 함께 알아보자.';
const NO_SPEECH = '이 브라우저는 설명 읽기를 지원하지 않아요.';

/**
 * createMenu(doc, ctx) -> {open(data), hide(), isOpen, refresh()}. data: {title, fresh} (the boot title; fresh: no
 * save yet) or {tab} (open at that tab, e.g. 'journal' from the HUD's discovery chip). ctx:
 *   root, returnFocus      #app (its other children go inert) and the canvas (focus on close)
 *   getState(), places     the shared save state; the mapped places (mission names)
 *   ctl                    the game controller: startMission, setMode, dayTick, open(kind), goTo, sound, narrator
 *   current()              {mode, pending} of the player, for the 탈것 cards
 *   settings()             the 설정 values as strings: sound, music, motion ('on'|'off'), volume (0-1), voice,
 *                          speed ('0.75'|'1'|'1.4'), movement ('roads'|'free'), quality, camera, time
 *   setting(key, value)    apply and save one 설정 change
 *   dress()                the character or the outfit changed: show it on the explorer now
 *   changed()              coins or missions changed: refresh the HUD and save
 *   thumbs                 ui/thumbs.js (paint(canvas, spec))
 *   reset()                기록 지우고 처음부터 (main.js wipes the save and reloads)
 *   importSave(state)      an accepted 이어하기 file (수첩): main.js stores it and reloads
 *   onClose()              the menu asks to close
 */
export function createMenu(doc, ctx) {
  const $ = (id) => doc.getElementById(id);
  const win = doc.defaultView || globalThis;
  const root = $('menu'), dialog = root.querySelector('[role="dialog"]'), go = $('menu-go');
  const tabs = TABS.map((t) => $('tab-' + t)), panes = Object.fromEntries(TABS.map((t) => [t, $('pane-' + t)]));
  const state = () => ctx.getState();
  let tab = 'missions', category = 'character', openNow = false;
  const journal = createJournal(doc, { pane: panes.journal, getState: ctx.getState, places: ctx.places, ctl: ctx.ctl, save: () => ctx.changed(), importSave: (s) => ctx.importSave(s) });

  // ---- tabs (ARIA tabs: arrows, Home and End move between them)
  function select(name, focus = false) {
    tab = TABS.includes(name) ? name : 'missions';
    tabs.forEach((b, i) => { const on = TABS[i] === tab; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    for (const [k, p] of Object.entries(panes)) p.hidden = k !== tab;
    render(tab);
    $('menu-scroll').scrollTop = 0;
    if (focus) tabs[TABS.indexOf(tab)].focus({ preventScroll: true });
  }
  tabs.forEach((b, i) => { b.onclick = () => select(TABS[i]); });
  $('menu-tabs').addEventListener('keydown', (e) => {
    const i = TABS.indexOf(tab), n = TABS.length;
    const to = { ArrowRight: (i + 1) % n, ArrowLeft: (i + n - 1) % n, Home: 0, End: n - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault(); select(TABS[to], true);
  });

  function render(name) {
    $('wallet').textContent = String(state().coins);
    if (name === 'missions') renderMissions();
    else if (name === 'vehicles') renderRides();
    else if (name === 'wardrobe') renderWardrobe();
    else if (name === 'journal') journal.render();
    else if (name === 'settings') syncSettings();
  }
  // re-rendering a list keeps the focus on the same item (its first data-* attribute)
  function keepFocus(pane, fn) {
    const a = doc.activeElement, key = a && pane.contains(a) ? Object.entries(a.dataset || {})[0] : null;
    fn();
    if (key) pane.querySelector(`[data-${key[0].replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}="${key[1]}"]`)?.focus({ preventScroll: true });
  }
  const status = (id, text, warn = false) => { const s = $(id); if (!s) return; s.textContent = text || ''; s.classList.toggle('warn', !!warn); };

  // ---- 탐방: today's three missions (2D showMissions)
  function renderMissions() {
    if (ctx.ctl.dayTick(Date.now())) ctx.changed();   // a new KST day brings new missions
    const v = missionCards(state(), ctx.places), pane = panes.missions;
    keepFocus(pane, () => pane.replaceChildren(
      el('p', { className: 'lead' }, '첫 탐방과 미션은 무작위로 골라요. 출발한 뒤 다른 장소 안내를 열지 않고 목표에 도착하면 ', el('strong', {}, `직행 보너스 ${v.bonus}금화`), '! 길을 지나가거나 NPC에게 도움을 묻는 것은 괜찮아요.'),
      el('div', { className: 'mis-list' }, v.cards.map((c) => el('article', { className: 'mis-card', dataset: { status: c.status } },
        el('span', { className: 'mis-num', 'aria-hidden': 'true' }, c.number),
        el('div', { className: 'mis-text' },
          el('small', { className: 'mis-kick' }, c.kicker),
          el('h4', {}, c.name),
          el('p', {}, [c.area, c.blurb].filter(Boolean).join(' · ')),
          el('button', { type: 'button', className: 'btn' + (c.status === 'done' ? '' : ' btn-grad'), disabled: c.status === 'done', dataset: { mission: c.id }, onclick: () => start(c.id) }, c.action))))),
      el('p', { className: 'note' }, '미션 도착은 직접 이동했을 때 기록해요. 수첩에서 이야기를 다시 읽는 것은 도착으로 세지 않아요. 미션별 보너스는 하루 한 번이에요.'),
      v.allDone ? el('button', { type: 'button', className: 'btn btn-grad', id: 'new-missions', dataset: { renew: '1' }, onclick: renew }, '새 미션 받기') : null,
      // P23: 장소 찾기 opens the county map at its search view (closing the menu without a resume in between)
      el('div', { className: 'mis-tools' }, el('button', { type: 'button', className: 'btn', id: 'open-search', dataset: { search: '1' }, onclick: () => { ctx.ctl.sound.play('click'); ctx.ctl.open('search'); } }, '장소 찾기')),
    ));
  }
  function start(id) {
    if (!ctx.ctl.startMission(id)) renderMissions();   // closes the menu and heads there with the move sound (2D goToPlace)
  }
  function renew() {
    ctx.ctl.dayTick(Date.now(), true);
    ctx.ctl.sound.play('click');
    ctx.changed();
    renderMissions();
    panes.missions.querySelector('[data-mission]:not([disabled])')?.focus({ preventScroll: true });
  }

  // ---- 탈것: six cards; choosing switches now (main.js setMode refuses with a reason, shown here)
  function renderRides() {
    const pane = panes.vehicles, s = state();
    if (!pane.firstChild) {
      pane.append(
        el('div', { className: 'rides' }, RIDES.map(([mode, label, factor, line]) => el('button', { type: 'button', className: 'card ride', dataset: { mode }, 'aria-pressed': 'false', onclick: () => ride(mode) },
          el('canvas', { width: 256, height: 256, 'aria-hidden': 'true' }),
          el('span', { className: 'ride-head' }, el('b', {}, label), el('span', { className: 'factor' }, factor)),
          el('span', { className: 'desc' }, line)))),
        el('p', { className: 'status', id: 'ride-status', role: 'status' }),
      );
    }
    const now = ctx.current(), on = now.pending || now.mode;
    for (const b of pane.querySelectorAll('[data-mode]')) {
      b.setAttribute('aria-pressed', String(b.dataset.mode === on));
      ctx.thumbs?.paint(b.querySelector('canvas'), { kind: 'vehicle', mode: b.dataset.mode, character: s.character, outfit: s.equipped.outfit });
    }
  }
  function ride(mode) {
    const r = ctx.ctl.setMode(mode) || {};
    if (r.ok) ctx.ctl.sound.play('move');   // as the 2D travel buttons
    renderRides();
    status('ride-status', r.toast, !r.ok);
  }

  // ---- 꾸미기: characters (free) and the five item categories (2D showShop)
  function renderWardrobe() {
    const pane = panes.wardrobe, s = state(), cards = shopView(s, category);
    const cats = el('div', { className: 'shop-cats', role: 'group', 'aria-label': '꾸미기 카테고리' },
      SHOP_CATEGORIES.map(([id, name]) => el('button', { type: 'button', className: 'cat', dataset: { cat: id }, 'aria-pressed': String(id === category), onclick: () => { category = id; status('shop-status', ''); keepFocus(pane, renderWardrobe); } }, name)));
    let list;
    if (category === 'character') {
      list = [el('p', { className: 'lead' }, '마음에 드는 캐릭터를 무료로 골라요.'),
        el('div', { className: 'chars' }, cards.map((c) => {
          const canvas = el('canvas', { width: 256, height: 256, 'aria-hidden': 'true' });
          ctx.thumbs?.paint(canvas, { kind: 'character', id: c.id, outfit: s.equipped.outfit });
          return el('button', { type: 'button', className: 'card char', dataset: { character: c.id }, 'aria-pressed': String(c.equipped), onclick: () => wear(c.id) },
            canvas, el('b', {}, c.name), el('span', {}, c.equipped ? '선택 중' : '선택하기'));
        }))];
    } else {
      list = [el('div', { className: 'shop-list' }, cards.map((c) => el('article', { className: 'product' + (c.equipped ? ' on' : '') },
        el('span', { className: 'swatch', style: { background: c.color }, 'aria-hidden': 'true' }, c.glyph),
        el('h4', {}, c.name),
        el('p', {}, c.desc),
        el('button', {
          type: 'button', className: 'btn buy' + (c.equipped ? '' : c.owned ? ' btn-ghost' : ' btn-grad'), dataset: { buy: c.id }, disabled: !c.affordable,
          'aria-label': c.equipped ? `${c.name} 착용 해제` : c.owned ? `${c.name} 착용하기` : `${c.name} 사기, ${c.price}금화${c.affordable ? '' : ', 금화가 모자라요'}`,
          onclick: () => buy(c.id),
        }, c.equipped ? '착용 해제' : c.owned ? '착용하기' : el('span', { className: 'price' }, el('i', { className: 'coin', 'aria-hidden': 'true' }), String(c.price))))))];
    }
    keepFocus(pane, () => pane.replaceChildren(cats, ...list, el('p', { className: 'status', id: 'shop-status', role: 'status' }, $('shop-status')?.textContent || '')));
    $('wallet').textContent = String(s.coins);
  }
  function wear(id) {
    if (!chooseCharacter(state(), id)) return;
    ctx.ctl.sound.play('click');
    ctx.dress(); ctx.changed();
    keepFocus(panes.wardrobe, renderWardrobe);
  }
  function buy(id) {
    const r = pressItem(state(), id);
    if (!r.ok) { status('shop-status', r.message, true); return; }
    ctx.ctl.sound.play(r.sound);
    ctx.dress(); ctx.changed();
    status('shop-status', '');
    renderWardrobe();
  }

  // ---- 설정: two- to four-way switches, the volume, the voice; the 안내 rows (도움말, 자료 출처 = the help at its sources,
  // 만든 사람, QR: P26); the 2D link stays hidden until phase 2b
  const groups = [...panes.settings.querySelectorAll('[data-setting]')];
  for (const g of groups) for (const b of g.querySelectorAll('[data-value]')) b.onclick = () => { ctx.setting(g.dataset.setting, b.dataset.value); ctx.ctl.sound.play('click'); syncSettings(); };
  $('opt-volume').oninput = (e) => ctx.setting('volume', Number(e.target.value));
  $('opt-voice').onchange = (e) => ctx.setting('voice', e.target.value);
  $('voice-test').onclick = () => ctx.ctl.narrator.speak(VOICE_TEST);
  for (const b of panes.settings.querySelectorAll('[data-open]')) b.onclick = () => ctx.ctl.open(b.dataset.open, b.dataset.section ? { section: b.dataset.section } : {});
  $('open-2d').hidden = !LITE_2D;
  const synth = win.speechSynthesis;
  if (synth?.addEventListener) synth.addEventListener('voiceschanged', () => { if (openNow && tab === 'settings') fillVoices(); });
  function fillVoices() {
    const sel = $('opt-voice'), list = synth ? koreanVoices(synth.getVoices?.() || []) : [];
    sel.replaceChildren(el('option', { value: 'auto' }, 'Google 한국어 우선 (자동)'), ...list.map((v) => el('option', { value: v.voiceURI }, v.name)));
    const want = ctx.settings().voice;
    sel.value = [...sel.options].some((o) => o.value === want) ? want : 'auto';
    sel.disabled = $('voice-test').disabled = !synth;
    if (!synth) $('voice-note').textContent = NO_SPEECH;
  }
  function syncSettings() {
    const v = ctx.settings();
    for (const g of groups) for (const b of g.querySelectorAll('[data-value]')) b.setAttribute('aria-pressed', String(b.dataset.value === String(v[g.dataset.setting])));
    $('opt-volume').value = String(v.volume);
    fillVoices();
  }

  // 이 기기 기록 초기화: a second step in the page (no window.confirm), with the 2D backup offer first
  const confirmBox = $('reset-confirm');
  $('reset-progress').onclick = () => { confirmBox.hidden = false; $('backup-first').focus({ preventScroll: true }); confirmBox.scrollIntoView?.({ block: 'nearest' }); };
  $('cancel-reset').onclick = () => { confirmBox.hidden = true; $('reset-progress').focus({ preventScroll: true }); };
  $('backup-first').onclick = () => { ctx.changed(); download(doc, SAVE_NAME, saveFile(state()), 'application/json'); };
  $('confirm-reset').onclick = () => ctx.reset();

  go.onclick = () => ctx.onClose();

  return {
    open(data = {}) {
      openNow = true;
      go.textContent = data.title && data.fresh ? '탐방 시작' : '이어하기';
      confirmBox.hidden = true;
      journal.reset();
      root.hidden = false;
      ctx.root.classList.add('menu-open');   // the HUD steps aside: the panel over the county alone
      openModal(dialog, { root: ctx.root, returnFocus: ctx.returnFocus, onClose: () => ctx.onClose() });
      select(data.title ? 'missions' : data.tab || tab);
      (data.title ? go : tabs[TABS.indexOf(tab)]).focus({ preventScroll: true });
    },
    // the controller's hideDialog: idempotent
    hide() {
      if (!openNow) return;
      openNow = false;
      root.hidden = true;
      ctx.root.classList.remove('menu-open');
      closeModal(dialog);
    },
    get isOpen() { return openNow; },
    get tab() { return tab; },
    select,
    refresh() { if (openNow) render(tab); },
  };
}
