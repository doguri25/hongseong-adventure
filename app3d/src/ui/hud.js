// Temporary phase-1 HUD: wires the static markup in index.html to callbacks and exposes small setters.
// Nothing here knows about Three.js or the simulation; main.js decides what to show.

const CAMERA_LABEL = { tilt: '비스듬히', follow: '뒤따라' };
const TURN_HINT = { left: '← 다음 갈림길에서 좌회전', right: '다음 갈림길에서 우회전 →', route: '길을 찾아 가는 중' };
const FERRY_LABEL = { out: '배 타고 죽도로', back: '배 타고 남당항으로' };

// Korean particle after a name: with(와/과) or toward(로/으로), chosen by the last syllable's final consonant.
export function josa(name, kind) {
  const c = String(name).trim().slice(-1).charCodeAt(0) - 0xac00, fin = c >= 0 && c <= 11171 ? c % 28 : 0;
  if (kind === 'with') return fin ? '과' : '와';
  return fin && fin !== 8 ? '으로' : '로';   // 8 = ㄹ: '로' (마을로)
}

export function createHud(doc, handlers = {}) {
  const $ = (id) => doc.getElementById(id);
  const call = (name, ...a) => () => handlers[name]?.(...a);
  const text = (el, v) => { if (el.textContent !== v) el.textContent = v; };

  doc.querySelectorAll('[data-mode]').forEach((b) => { b.onclick = () => handlers.onMode?.(b.dataset.mode); });
  $('cam-btn').onclick = call('onCamera');
  $('time-btn').onclick = call('onTime');
  $('q-btn').onclick = call('onQuality');
  $('compass').onclick = call('onCompass');
  $('zoom-in').onclick = call('onZoom', 0.75);
  $('zoom-out').onclick = call('onZoom', 1.33);
  $('tilt-up').onclick = call('onTilt', 10);
  $('tilt-down').onclick = call('onTilt', -10);
  $('turn-left').onclick = call('onTurn', 'left');
  $('turn-right').onclick = call('onTurn', 'right');
  $('npc-talk').onclick = call('onTalk');
  $('ferry-btn').onclick = call('onFerry');
  $('reload').onclick = call('onReload');

  let toastTimer = 0, arriveTimer = 0, actions = { npc: null, ferry: null, car: false }, compassYaw = NaN;
  const compassSvg = $('compass').firstElementChild, stick = $('stick'), knob = $('knob');

  return {
    loading(step, fraction) {
      text($('loading-step'), step);
      if (Number.isFinite(fraction)) $('loading-bar').firstElementChild.style.width = Math.round(Math.max(0, Math.min(1, fraction)) * 100) + '%';
    },
    loaded() { $('loading').hidden = true; },
    fatal(message) { $('loading').hidden = true; if (message) text($('fatal-text'), message); $('fatal').hidden = false; },
    lost(show) { $('lost').hidden = !show; },

    setMode(mode, pending = null) {
      doc.querySelectorAll('[data-mode]').forEach((b) => {
        const on = b.dataset.mode === (pending || mode);
        b.setAttribute('aria-pressed', String(on));
        b.classList.toggle('landing', on && !!pending);
      });
    },
    setCamera(mode) { text($('cam-label'), CAMERA_LABEL[mode] || mode); },
    setTime(label) { text($('time-label'), label); },
    setQuality(label) { text($('q-label'), label); },
    setFps(fps) { text($('fps'), fps ? fps + ' fps' : ''); },
    setWhere(where) { text($('where'), where); },
    setStats({ coins, found, total }) { text($('coins'), String(coins)); text($('found'), String(found)); text($('found-total'), String(total)); },
    openCredit(open) { $('credit').open = !!open; },

    setTurnHint(hint) { const el = $('turn-hint'), t = TURN_HINT[hint] || ''; text(el, t); el.hidden = !t; },

    // npc: {name} | null, ferry: 'out' | 'back' | null, car: boolean (show the turn booking buttons)
    setActions(next) {
      if (next.npc === actions.npc && next.ferry === actions.ferry && next.car === actions.car) return;
      actions = { ...next };
      const talk = $('npc-talk');
      talk.hidden = !next.npc;
      if (next.npc) text(talk, `${next.npc.name}${josa(next.npc.name, 'with')} 대화 · E`);
      const ferry = $('ferry-btn');
      ferry.hidden = !next.ferry;
      if (next.ferry) text(ferry, FERRY_LABEL[next.ferry]);
      $('turn-left').hidden = $('turn-right').hidden = !next.car;
    },

    toast(message, ms = 2800) {
      if (!message) return;
      const t = $('toast');
      text(t, message); t.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => t.classList.remove('show'), ms);
    },
    arrive(name, sub, ms = 3200) {
      text($('arrive-name'), name); text($('arrive-sub'), sub || '');
      $('arrive').hidden = false;
      clearTimeout(arriveTimer);
      arriveTimer = setTimeout(() => { $('arrive').hidden = true; }, ms);
    },

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

