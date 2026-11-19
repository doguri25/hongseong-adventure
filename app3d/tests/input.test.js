import test from 'node:test';
import assert from 'node:assert/strict';
import { createControls } from '../src/input/controls.js';

function setup(extra = {}) {
  const target = new EventTarget(); target.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 600 });
  const env = new EventTarget(); env.innerWidth = 1000; env.navigator = { getGamepads: () => [] }; env.document = { hidden: false };
  const calls = { taps: [], actions: [], sticks: [] };
  const c = createControls(target, { onTap: (x, y) => calls.taps.push([x, y]), onAction: a => calls.actions.push(a), onStick: s => calls.sticks.push(s), ...extra }, env);
  const fire = (t, type, props) => { const e = new Event(type, { cancelable: true }); for (const [k, v] of Object.entries(props)) Object.defineProperty(e, k, { value: v, configurable: true }); t.dispatchEvent(e); return e; };
  return { target, env, calls, c, fire };
}
const touch = (id, x, y) => ({ pointerId: id, pointerType: 'touch', clientX: x, clientY: y });

test('stick drag 52 px up gives y ~ 1 and follows past the edge', () => {
  const { target, fire, c, calls } = setup();
  fire(target, 'pointerdown', touch(1, 100, 300));
  fire(target, 'pointermove', touch(1, 100, 248));
  const r = c.read(); assert.ok(Math.abs(r.y - 1) < 1e-9 && Math.abs(r.x) < 1e-9);
  fire(target, 'pointermove', touch(1, 100, 200));
  assert.ok(Math.abs(c.read().y - 1) < 1e-9);
  assert.equal(calls.sticks.at(-1).cy, 252);
  fire(target, 'pointermove', touch(1, 100, 226)); // half stick
  assert.ok(Math.abs(c.read().y - (0.5 - 0.12) / 0.88) < 1e-9);
});

test('dead zone: small drag gives zero', () => {
  const { target, fire, c } = setup();
  fire(target, 'pointerdown', touch(1, 100, 300)); fire(target, 'pointermove', touch(1, 100, 296));
  assert.equal(c.read().y, 0);
});

test('inputResetsOnBlur', () => {
  const { target, env, fire, c } = setup();
  fire(target, 'pointerdown', touch(1, 100, 300)); fire(target, 'pointermove', touch(1, 100, 260));
  fire(env, 'keydown', { code: 'KeyD' });
  assert.ok(c.read().x > 0 && c.read().y > 0);
  fire(env, 'blur', {});
  const r = c.read(); assert.equal(r.x, 0); assert.equal(r.y, 0);
  fire(target, 'pointerdown', touch(2, 100, 300)); fire(target, 'pointermove', touch(2, 100, 260));
  env.document.hidden = true; fire(env, 'visibilitychange', {});
  assert.equal(c.read().y, 0);
});

test('pointercancel and lostpointercapture end the stick', () => {
  for (const type of ['pointercancel', 'lostpointercapture']) {
    const { target, fire, c } = setup();
    fire(target, 'pointerdown', touch(1, 100, 300)); fire(target, 'pointermove', touch(1, 100, 250));
    fire(target, type, touch(1, 100, 250));
    assert.equal(c.read().y, 0);
  }
});

test('tap: short, still, single pointer; drags do not tap', () => {
  const { target, fire, calls } = setup();
  const mouse = (x, y) => ({ pointerId: 5, pointerType: 'mouse', clientX: x, clientY: y });
  fire(target, 'pointerdown', mouse(700, 200)); fire(target, 'pointerup', mouse(703, 202));
  assert.deepEqual(calls.taps, [[703, 202]]);
  fire(target, 'pointerdown', mouse(700, 200)); fire(target, 'pointermove', mouse(740, 200)); fire(target, 'pointerup', mouse(740, 200));
  assert.equal(calls.taps.length, 1);
});

test('mouse on the left side drags the view (no stick); drag rotates and tilts', () => {
  const { target, fire, c } = setup();
  const m = (x, y) => ({ pointerId: 1, pointerType: 'mouse', clientX: x, clientY: y });
  fire(target, 'pointerdown', m(100, 300)); fire(target, 'pointermove', m(200, 350));
  const { view } = c.read();
  assert.ok(Math.abs(view.userYaw - 0.6) < 1e-9 && Math.abs(view.pitchAdj - 9) < 1e-9);
});

test('wheel zoom clamps, shift tilts; keys map and actions', () => {
  const { target, env, fire, c, calls } = setup();
  for (let i = 0; i < 100; i++) fire(target, 'wheel', { deltaY: -500, shiftKey: false });
  assert.equal(c.read().view.zoom, 0.2);
  fire(target, 'wheel', { deltaY: -100, shiftKey: true });
  assert.ok(Math.abs(c.read().view.pitchAdj - 5) < 1e-9);
  fire(env, 'keydown', { code: 'KeyW', target: {} }); assert.equal(c.read().y, 1);
  fire(env, 'keyup', { code: 'KeyW' }); assert.equal(c.read().y, 0);
  fire(env, 'keydown', { code: 'KeyE' }); fire(env, 'keydown', { code: 'Digit3' });
  fire(env, 'keydown', { code: 'KeyE', target: { tagName: 'INPUT' } });
  assert.deepEqual(calls.actions, ['interact', 'mode:car']);
});

test('a short still touch in the stick zone is forwarded as a tap; held, dragged or two-finger ones are not', () => {
  const { target, env, fire, calls, c } = setup();
  let t = 1000; env.performance = { now: () => t };
  fire(target, 'pointerdown', touch(1, 100, 300)); t += 120; fire(target, 'pointerup', touch(1, 102, 301));
  assert.deepEqual(calls.taps, [[102, 301]]);
  assert.equal(calls.sticks.at(-1).visible, false, 'stick hidden again');
  // held longer than 400 ms
  fire(target, 'pointerdown', touch(2, 100, 300)); t += 450; fire(target, 'pointerup', touch(2, 100, 300));
  // moved past the tap slop (and back)
  fire(target, 'pointerdown', touch(3, 100, 300)); fire(target, 'pointermove', touch(3, 100, 270)); fire(target, 'pointermove', touch(3, 100, 300));
  t += 100; fire(target, 'pointerup', touch(3, 100, 300));
  // cancelled
  fire(target, 'pointerdown', touch(4, 100, 300)); fire(target, 'pointercancel', touch(4, 100, 300));
  // a second finger is down on the right side
  fire(target, 'pointerdown', touch(5, 100, 300)); fire(target, 'pointerdown', touch(6, 800, 300)); t += 50; fire(target, 'pointerup', touch(5, 100, 300));
  assert.equal(calls.taps.length, 1);
  assert.equal(c.read().x, 0); assert.equal(c.read().y, 0);
});

// phase-1 follow-up: two fingers pressed together and lifted without moving (a pinch that never moved) are no tap
test('a two-finger still touch is not a tap, on the right side or with one finger in the stick zone', () => {
  const { target, env, fire, calls } = setup();
  let t = 1000; env.performance = { now: () => t };
  fire(target, 'pointerdown', touch(1, 700, 300)); fire(target, 'pointerdown', touch(2, 800, 320));
  t += 80; fire(target, 'pointerup', touch(1, 700, 300)); t += 20; fire(target, 'pointerup', touch(2, 800, 320));
  assert.deepEqual(calls.taps, [], 'two still fingers on the right');
  fire(target, 'pointerdown', touch(3, 100, 300)); fire(target, 'pointerdown', touch(4, 800, 300));   // stick zone + right
  t += 80; fire(target, 'pointerup', touch(4, 800, 300)); t += 20; fire(target, 'pointerup', touch(3, 100, 300));
  assert.deepEqual(calls.taps, [], 'one still finger in the stick zone, one on the right');
  fire(target, 'pointerdown', touch(5, 800, 300)); fire(target, 'pointerdown', touch(6, 100, 300));   // right first, then the stick zone
  t += 80; fire(target, 'pointerup', touch(6, 100, 300)); t += 20; fire(target, 'pointerup', touch(5, 800, 300));
  assert.deepEqual(calls.taps, [], 'right first, then the stick zone');
  // a single quick touch afterwards still taps
  fire(target, 'pointerdown', touch(7, 700, 300)); t += 60; fire(target, 'pointerup', touch(7, 700, 300));
  assert.deepEqual(calls.taps, [[700, 300]]);
});

test('walking with the stick, a quick touch on the right still taps', () => {
  const { target, env, fire, calls } = setup();
  let t = 1000; env.performance = { now: () => t };
  fire(target, 'pointerdown', touch(1, 100, 300)); fire(target, 'pointermove', touch(1, 100, 250));   // the stick is moving
  fire(target, 'pointerdown', touch(2, 800, 300)); t += 80; fire(target, 'pointerup', touch(2, 800, 300));
  assert.deepEqual(calls.taps, [[800, 300]]);
  t += 600; fire(target, 'pointerup', touch(1, 100, 250));
  assert.equal(calls.taps.length, 1);
});

// final review I3: a thumb resting still in the stick zone (a school tablet held in both hands) must not turn every tap
// of the other hand into a two-finger press: only a second finger that lands within the tap window of the first does
test('a thumb resting still in the stick zone does not stop a quick tap on the right', () => {
  const { target, env, fire, calls } = setup();
  let t = 1000; env.performance = { now: () => t };
  fire(target, 'pointerdown', touch(1, 100, 300));   // the resting thumb, held still
  t += 1000;
  fire(target, 'pointerdown', touch(2, 800, 300)); t += 80; fire(target, 'pointerup', touch(2, 800, 300));
  assert.deepEqual(calls.taps, [[800, 300]]);
  t += 900;
  fire(target, 'pointerdown', touch(3, 700, 200)); t += 60; fire(target, 'pointerup', touch(3, 700, 200));
  assert.deepEqual(calls.taps, [[800, 300], [700, 200]], 'every tap while the thumb rests');
  t += 500; fire(target, 'pointerup', touch(1, 100, 300));
  assert.equal(calls.taps.length, 2, 'the long-held thumb itself is no tap');
  // pressed together (within the tap window) it is still a two-finger press
  fire(target, 'pointerdown', touch(4, 100, 300)); t += 120;
  fire(target, 'pointerdown', touch(5, 800, 300)); t += 80; fire(target, 'pointerup', touch(5, 800, 300));
  t += 20; fire(target, 'pointerup', touch(4, 100, 300));
  assert.equal(calls.taps.length, 2, 'two fingers pressed together');
});
