// Touch / mouse / keyboard / gamepad input. No DOM creation: the HUD draws the stick from onStick().
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const STICK_MAX = 52, DEAD = 0.12, TAP_MOVE = 8, TAP_MS = 400;
const KEYMAP = { ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r' };
const ACTIONS = { KeyE: 'interact', KeyC: 'camera', KeyT: 'time', KeyQ: 'quality',
  Digit1: 'mode:walk', Digit2: 'mode:bike', Digit3: 'mode:car', Digit4: 'mode:supercar', Digit5: 'mode:slowplane', Digit6: 'mode:plane' };

export function createControls(target, { onTap, onAction, onStick } = {}, env = globalThis) {
  const now = () => (env.performance ? env.performance.now() : globalThis.performance ? performance.now() : Date.now());
  const view = { userYaw: 0, pitchAdj: 0, zoom: 1 };
  const keys = new Set();
  const pointers = new Map();
  // sx, sy, t, moved: where and when the stick touch began, so a short still touch there still counts as a tap.
  // multi (on the stick and on each pointer): another finger shared the screen with it while it was still (a pinch or
  // a two-finger press), so lifting it is no tap; a quick touch while the stick is already walking still taps
  const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0, sx: 0, sy: 0, t: 0, moved: false, multi: false };
  let pinchDist = 0;

  const zoomBy = k => { view.zoom = clamp(view.zoom * k, 0.2, 4); };
  const tiltBy = d => { view.pitchAdj = clamp(view.pitchAdj + d, -70, 70); };
  const emitStick = (visible, dx = 0, dy = 0) => onStick?.({ visible, cx: stick.ox, cy: stick.oy, dx, dy });

  function reset() {
    keys.clear(); pointers.clear(); pinchDist = 0;
    const was = stick.id !== null;
    stick.id = null; stick.x = stick.y = 0;
    if (was) emitStick(false);
  }

  function endStick() { stick.id = null; stick.x = stick.y = 0; emitStick(false); }

  function down(e) {
    try { target.focus?.({ preventScroll: true }); } catch {}
    try { target.setPointerCapture?.(e.pointerId); } catch {}
    const leftSide = e.clientX < (env.innerWidth || 0) * 0.42 && e.pointerType !== 'mouse';
    if (leftSide && stick.id === null) {
      stick.id = e.pointerId; stick.ox = stick.sx = e.clientX; stick.oy = stick.sy = e.clientY; stick.x = stick.y = 0;
      stick.t = now(); stick.moved = false; stick.multi = pointers.size > 0;
      for (const p of pointers.values()) p.multi = true;
      emitStick(true); return;
    }
    const multi = pointers.size > 0 || (stick.id !== null && !stick.moved);
    if (multi) { for (const p of pointers.values()) p.multi = true; if (stick.id !== null) stick.multi = true; }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: now(), moved: false, multi });
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchDist = Math.hypot(a.x - b.x, a.y - b.y); }
  }

  function move(e) {
    if (e.pointerId === stick.id) {
      if (Math.hypot(e.clientX - stick.sx, e.clientY - stick.sy) > TAP_MOVE) stick.moved = true;
      let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy;
      const m = Math.hypot(dx, dy);
      if (m > STICK_MAX) { // the stick follows a thumb that slides past its edge
        stick.ox += dx / m * (m - STICK_MAX); stick.oy += dy / m * (m - STICK_MAX);
        dx = dx / m * STICK_MAX; dy = dy / m * STICK_MAX;
      }
      const r = Math.hypot(dx, dy) / STICK_MAX;
      const k = r < DEAD ? 0 : (r - DEAD) / (1 - DEAD) / Math.max(r, 1e-6);
      stick.x = dx / STICK_MAX * k; stick.y = -dy / STICK_MAX * k;
      emitStick(true, dx, dy); return;
    }
    const p = pointers.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > TAP_MOVE) p.moved = true;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 10 && d > 0) zoomBy(pinchDist / d);
      pinchDist = d; tiltBy(dy * 0.09); return;
    }
    if (p.moved) { view.userYaw += dx * 0.006; tiltBy(dy * 0.18); }
  }

  function up(e) {
    if (e.pointerId === stick.id) {
      // a short, still touch in the stick zone is a tap (pins and NPCs on the left half must be tappable too)
      const tap = e.type === 'pointerup' && !stick.moved && !stick.multi && pointers.size === 0 && now() - stick.t < TAP_MS
        && Math.hypot(e.clientX - stick.sx, e.clientY - stick.sy) <= TAP_MOVE;
      endStick();
      if (tap) onTap?.(e.clientX, e.clientY);
      return;
    }
    const p = pointers.get(e.pointerId); pointers.delete(e.pointerId); if (!p) return;
    if (e.type === 'pointerup' && !p.moved && !p.multi && pointers.size === 0 && now() - p.t < TAP_MS) onTap?.(e.clientX, e.clientY);
  }

  const lost = e => { // cancelled or lost capture: drop that pointer without a tap
    if (e.pointerId === stick.id) { endStick(); return; }
    pointers.delete(e.pointerId);
  };

  function wheel(e) {
    e.preventDefault?.();
    if (e.shiftKey) tiltBy(-e.deltaY * 0.05); else zoomBy(Math.exp(e.deltaY * 0.0012));
  }

  const typing = e => { const t = e.target?.tagName; return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || e.target?.isContentEditable; };
  function keydown(e) {
    if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    const c = e.code;
    if (KEYMAP[c]) { keys.add(KEYMAP[c]); e.preventDefault?.(); }
    else if (c === 'Equal' || c === 'NumpadAdd') zoomBy(0.8);
    else if (c === 'Minus' || c === 'NumpadSubtract') zoomBy(1.25);
    else if (c === 'KeyR' || c === 'PageUp') tiltBy(6);
    else if (c === 'KeyF' || c === 'PageDown') tiltBy(-6);
    else if (ACTIONS[c] && !e.repeat) onAction?.(ACTIONS[c]);
  }
  function keyup(e) { if (KEYMAP[e.code]) keys.delete(KEYMAP[e.code]); }
  const hidden = () => (env.document ? env.document.hidden : true);

  const on = (t, type, fn, opt) => t.addEventListener(type, fn, opt);
  on(target, 'pointerdown', down); on(target, 'pointermove', move); on(target, 'pointerup', up);
  on(target, 'pointercancel', lost); on(target, 'lostpointercapture', lost);
  on(target, 'wheel', wheel, { passive: false });
  on(env, 'keydown', keydown); on(env, 'keyup', keyup);
  on(env, 'blur', reset); on(env, 'visibilitychange', () => { if (hidden()) reset(); });

  function read() {
    let x = stick.x, y = stick.y;
    if (keys.has('l')) x -= 1; if (keys.has('r')) x += 1; if (keys.has('u')) y += 1; if (keys.has('d')) y -= 1;
    try {
      for (const pad of env.navigator?.getGamepads?.() || []) {
        if (!pad) continue;
        const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
        if (Math.hypot(ax, ay) > 0.18) { x += ax; y -= ay; }
      }
    } catch {}
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    return { x, y, turn: null, view };
  }

  return { read, reset };
}
