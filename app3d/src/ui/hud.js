// In-game HUD (pokju `#hud` layout): wires the static markup in index.html to callbacks and exposes small setters.
// Top left: home button, where, coins, discoveries (a button: the menu's 수첩). Top centre: the mission card (folds on
// phones, remembered per layout in the 2D game's `hongseong-hud-v1`). Top right: minimap button (drawn by
// ui/minimap.js) and the camera pad. Bottom right: speedometer (ui/gauge.js), 탐방 / 대화 / 탈것 round buttons, the
// vehicle picker, car turns, the ferry (배 타고 죽도로 at 남당항, 죽도에서 돌아가기 on 죽도) and the voyage chip.
// Centre: the big notice (ui/notice.js: kept clear of open dialogs) and toasts. Nothing here knows about Three.js or the
// simulation; main.js decides what to show.
import { createGauge, speedNumber, factorLabel } from './gauge.js';
import { createNotice } from './notice.js';

const CAMERA_LABEL = { tilt: '비스듬히', follow: '뒤따라' };
const MODE_LABEL = { walk: '걷기', bike: '자전거', car: '자동차', supercar: '슈퍼카', slowplane: '느린 비행기', plane: '비행기', boat: '배' };
const TURN_HINT = { left: '← 다음 갈림길에서 좌회전', right: '다음 갈림길에서 우회전 →', route: '길을 찾아 가는 중' };
const FERRY_LABEL = { out: '배 타고 죽도로', back: '죽도에서 돌아가기' };   // out opens the ferry dialog; back sails at once
export const HUD_KEY = 'hongseong-hud-v1';
const PREF_KEYS = ['portrait', 'landscape', 'desktop'];

// Korean particle after a name: with(와/과), obj(을/를) or toward(로/으로), chosen by the last syllable's final consonant.
export function josa(name, kind) {
  const c = String(name).trim().slice(-1).charCodeAt(0) - 0xac00, fin = c >= 0 && c <= 11171 ? c % 28 : 0;
  if (kind === 'with') return fin ? '과' : '와';
  if (kind === 'obj') return fin ? '을' : '를';
  return fin && fin !== 8 ? '으로' : '로';   // 8 = ㄹ: '로' (마을로)
}

/** The 2D game's layout key (app2d/mobile-ui.js mobileLayout): phones are <= 820 wide or <= 600 tall. */
export function hudLayoutKey(width, height) {
  return width <= 820 || height <= 600 ? (width > height ? 'landscape' : 'portrait') : 'desktop';
}
/** hongseong-hud-v1 as the 2D game reads it: only boolean portrait / landscape / desktop keys (true = card open). */
export function readHudPrefs(storage) {
  try {
    const v = JSON.parse(storage?.getItem(HUD_KEY) || '{}');
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    return Object.fromEntries(PREF_KEYS.filter((k) => typeof v[k] === 'boolean').map((k) => [k, v[k]]));
  } catch { return {}; }
}
export function writeHudPref(storage, prefs, key, expanded) {
  const next = { ...prefs, [key]: !!expanded };
  try { storage?.setItem(HUD_KEY, JSON.stringify(next)); } catch { /* blocked storage: remembered for this run only */ }
  return next;
}
/** Open unless the player folded it; folded by default on phones (as the 2D game). */
export function missionExpanded(prefs, key) { return prefs[key] ?? key === 'desktop'; }

export function createHud(doc, handlers = {}, { storage } = {}) {
  const $ = (id) => doc.getElementById(id);
  const call = (name, ...a) => () => handlers[name]?.(...a);
  const text = (el, v) => { if (el.textContent !== v) el.textContent = v; };
  const win = doc.defaultView || globalThis;

  $('home-btn').onclick = call('onHome');
  $('found-btn').onclick = call('onJournal');
  $('minimap').onclick = call('onMap');
  $('cam-btn').onclick = call('onCamera');
  $('compass').onclick = call('onCompass');
  $('zoom-in').onclick = call('onZoom', 0.75);
  $('zoom-out').onclick = call('onZoom', 1.33);
  $('tilt-up').onclick = call('onTilt', 10);
  $('tilt-down').onclick = call('onTilt', -10);
  $('turn-left').onclick = call('onTurn', 'left');
  $('turn-right').onclick = call('onTurn', 'right');
  $('npc-talk').onclick = call('onTalk');
  $('ferry-btn').onclick = call('onFerry');
  $('visit-btn').onclick = call('onVisit');
  $('mission-go').onclick = () => { handlers.onGuide?.(mission?.target?.id); if (layoutKey !== 'desktop') setExpanded(false); };
  $('reload').onclick = call('onReload');

  // ---- vehicle picker: the 탈것 button opens it; a choice, Escape or a touch elsewhere closes it
  const picker = $('travel'), vehicleBtn = $('vehicle-btn');
  const setPicker = (open) => {
    if (picker.hidden === !open) return;
    if (!open && picker.contains(doc.activeElement)) vehicleBtn.focus({ preventScroll: true });
    picker.hidden = !open; vehicleBtn.setAttribute('aria-expanded', String(open));
  };
  vehicleBtn.onclick = () => setPicker(picker.hidden);
  doc.querySelectorAll('#travel [data-mode]').forEach((b) => { b.onclick = () => { setPicker(false); handlers.onMode?.(b.dataset.mode); }; });
  doc.addEventListener('pointerdown', (e) => { if (!picker.hidden && !picker.contains(e.target) && !vehicleBtn.contains(e.target)) setPicker(false); }, true);
  doc.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !picker.hidden) { setPicker(false); } });

  // ---- mission card: fold state per layout (portrait / landscape / desktop) like the 2D game
  let prefs = readHudPrefs(storage), layoutKey = null, expanded = true, mission = null, missionKey = '';
  const card = $('mission'), toggle = $('mission-toggle'), body = $('mission-body'), app = $('app');
  function setExpanded(open, remember = true) {
    expanded = !!open;
    if (!expanded && body.contains(doc.activeElement)) toggle.focus({ preventScroll: true });
    body.hidden = !expanded;
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('aria-label', `탐방 미션 ${expanded ? '접기' : '펼치기'}`);
    if (remember && layoutKey) prefs = writeHudPref(storage, prefs, layoutKey, expanded);
    syncMissionEdge();
  }
  toggle.onclick = () => { setExpanded(!expanded); if (expanded) handlers.onMissionOpen?.(); };
  // live edges for the CSS: --tl-b where the top-left chips end (they wrap with big numbers on a phone), so the
  // phone's mission card and the docked credit sit under them; --mission-b where the card ends, so toasts, the phone
  // camera pad and the phone's docked credit sit under it
  const chips = doc.querySelector('.hud-tl'), edges = { tl: -1, mission: -1 };
  function syncEdge(name, el, prop) {
    const b = Math.round(el.getBoundingClientRect().bottom);
    if (b !== edges[name] && b > 0) { edges[name] = b; app.style.setProperty(prop, b + 'px'); }
  }
  function syncMissionEdge() { syncEdge('tl', chips, '--tl-b'); syncEdge('mission', card, '--mission-b'); }
  if (win.ResizeObserver) { const ro = new win.ResizeObserver(syncMissionEdge); ro.observe(card); ro.observe(chips); }

  const gauge = createGauge($('speedo-canvas')), bigNotice = createNotice($('notice'), { doc, win });
  let toastTimer = 0, actions = { npc: null, ferry: null, car: false, visit: undefined }, compassYaw = NaN, mode = 'walk';
  const compassSvg = $('compass').firstElementChild, stick = $('stick'), knob = $('knob');
  const fitCanvas = (canvas) => {
    const css = canvas.clientWidth, px = Math.round(css * Math.min(2, win.devicePixelRatio || 1));
    if (css && canvas.width !== px) { canvas.width = px; canvas.height = px; return true; }
    return false;
  };

  return {
    loading(step, fraction) {
      text($('loading-step'), step);
      if (Number.isFinite(fraction)) $('loading-bar').firstElementChild.style.width = Math.round(Math.max(0, Math.min(1, fraction)) * 100) + '%';
    },
    loaded() { $('loading').hidden = true; syncMissionEdge(); },
    fatal(message) { $('loading').hidden = true; if (message) text($('fatal-text'), message); $('fatal').hidden = false; },
    // an open dialog (the boot title menu) has made the overlays inert: 다시 불러오기 must still answer
    lost(show) { const l = $('lost'); l.hidden = !show; if (show) l.inert = false; },

    // the layout key changes with the window shape (phone portrait / landscape / desktop): re-apply that layout's fold
    layout(width, height) {
      const key = hudLayoutKey(width, height);
      if (key !== layoutKey) { layoutKey = key; setExpanded(missionExpanded(prefs, key), false); }
      if (fitCanvas($('speedo-canvas'))) gauge.reset();
      syncMissionEdge();
    },
    // wide mouse screens keep the credit open in the bottom-left corner; touch and narrow screens dock its toggle
    placeCredit(wide) {
      const credit = $('credit');
      if (wide) $('fps').before(credit); else $('credit-dock').append(credit);
      credit.open = !!wide;
    },

    setMode(m, pending = null) {
      const shown = pending || m;
      doc.querySelectorAll('#travel [data-mode]').forEach((b) => {
        const on = b.dataset.mode === shown;
        b.setAttribute('aria-pressed', String(on));
        b.classList.toggle('landing', on && !!pending);
      });
      if (shown === mode && $('vehicle-ico').firstChild) return;
      mode = shown;
      const src = doc.querySelector(`#travel [data-mode="${shown}"] svg`);
      $('vehicle-ico').replaceChildren(src ? src.cloneNode(true) : '');
      vehicleBtn.setAttribute('aria-label', `탈것 바꾸기, 지금은 ${MODE_LABEL[shown] || shown}`);
    },
    closePicker() { setPicker(false); },
    setCamera(m) {
      $('cam-btn').classList.toggle('follow', m === 'follow');
      $('cam-btn').setAttribute('aria-label', `카메라 바꾸기, 지금은 ${CAMERA_LABEL[m] || m}`);
    },
    setFps(fps) { text($('fps'), fps ? fps + ' fps' : ''); },
    setWhere(where) { text($('where'), where); },
    setStats({ coins, found, total }) {
      text($('coins'), String(coins)); text($('found'), String(found)); text($('found-total'), String(total));
      $('found-btn').setAttribute('aria-label', `발견 ${found} / ${total}, 발견 수첩 열기`);
      $('found-bar').style.setProperty('--v', (total ? Math.round((found / total) * 1000) / 10 : 0) + '%');
    },

    // view: missions.js missionView -> {heading, title, detail, target, dots, direct, bonus}
    setMission(view) {
      const key = JSON.stringify(view);
      if (key === missionKey) return;
      missionKey = key; mission = view;
      text($('mission-heading'), view.heading); text($('mission-title'), view.title); text($('mission-detail'), view.detail);
      $('mission-dots').replaceChildren(...view.dots.map((d) => { const i = doc.createElement('i'); i.className = d; return i; }));
      const bonus = $('mission-bonus');
      bonus.hidden = !(view.target && view.direct);
      text(bonus, `직행 보너스 +${view.bonus}`);
      $('mission-go').hidden = !view.target;
      $('mission-go').setAttribute('aria-label', view.target ? `${view.target.name}${josa(view.target.name, 'to')} 길 안내` : '길 안내');
      syncMissionEdge();
    },

    setTurnHint(hint) { const el = $('turn-hint'), t = TURN_HINT[hint] || ''; text(el, t); el.hidden = !t; },
    // the voyage chip (2D #voyage-status): its label while the boat sails, null when it lands
    setVoyage(label) { const el = $('voyage-status'); text(el, label || ''); el.hidden = !label; },

    // npc: {name} | null, ferry: 'out' | 'back' | null, car: boolean (turn buttons), visit: place in reach | null
    setActions(next) {
      if (next.npc === actions.npc && next.ferry === actions.ferry && next.car === actions.car && next.visit === actions.visit) return;
      actions = { ...next };
      const talk = $('npc-talk');
      talk.hidden = !next.npc;
      if (next.npc) { const l = `${next.npc.name}${josa(next.npc.name, 'with')} 대화 (E)`; talk.setAttribute('aria-label', l); talk.title = l; }
      const ferry = $('ferry-btn');
      ferry.hidden = !next.ferry;
      if (next.ferry) text(ferry, FERRY_LABEL[next.ferry]);
      $('turn-left').hidden = $('turn-right').hidden = !next.car;
      const visit = $('visit-btn'), l = next.visit ? `${next.visit.name} 탐방하기 (E)` : '탐방하기: 장소 가까이에서 (E)';
      visit.classList.toggle('dim', !next.visit);
      visit.setAttribute('aria-disabled', String(!next.visit));
      visit.setAttribute('aria-label', l); visit.title = l;
    },

    // speed and max in m/s (max: this mode's top speed); the number is the km/h-like speed x 3.6
    speed(v, max, m) {
      gauge.draw(v, max);
      text($('speed-num'), String(speedNumber(v)));
      text($('speed-factor'), factorLabel(m));
    },

    // over: shown above an open dialog too (theme.css #toast.over: the audio and voice errors, M4)
    toast(message, ms = 2800, { over = false } = {}) {
      if (!message) return;
      const t = $('toast');
      text(t, message); t.classList.add('show'); t.classList.toggle('over', over);
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => t.classList.remove('show'), ms);
    },
    // the big notice: title in the display face, a short line under it, green (ok) or red (danger) glow; in the middle
    // of the screen, or beside an open dialog without covering any of its text or buttons
    notice(title, sub = '', tone = 'ok') { bigNotice.show(title, sub, tone); },

    compass(yaw) {
      if (Math.abs(yaw - compassYaw) < 0.002) return;
      compassYaw = yaw; compassSvg.style.transform = `rotate(${-yaw}rad)`;
    },
    // from controls' onStick: {visible, cx, cy, dx, dy} in client pixels
    stick({ visible, cx, cy, dx = 0, dy = 0 }) {
      stick.hidden = !visible;
      if (!visible) return;
      stick.style.left = cx + 'px'; stick.style.top = cy + 'px';
      knob.style.transform = `translate(${dx}px,${dy}px)`;
    },
  };
}
