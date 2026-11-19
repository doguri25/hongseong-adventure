import test from 'node:test';
import assert from 'node:assert/strict';
import { createSound, unlockOnPress, PRESS_GAP_MS } from '../src/game/sound.js';

function fakeAudio() {
  const log = [];
  return {
    log, ctx: null, timer: null,
    play: (k) => log.push(k),
    footstep: (t) => log.push('step:' + t),
    unlock: async function () { log.push('unlock'); this.ctx = { state: 'running' }; this.timer = 1; return true; },
    stop: function () { log.push('stop'); this.timer = null; },
  };
}

test('press: the 2D click on every button, unless the press already made a sound', () => {
  let now = 1000;
  const audio = fakeAudio(), s = createSound(audio, { now: () => now });
  s.press();
  assert.deepEqual(audio.log, ['click']);
  now += 500;
  s.play('move'); s.press();   // the button's own sound (a mission's 출발): no click on top
  assert.deepEqual(audio.log, ['click', 'move']);
  now += PRESS_GAP_MS - 1; s.press();
  assert.deepEqual(audio.log, ['click', 'move'], 'still the same press');
  now += 2; s.press();
  assert.deepEqual(audio.log, ['click', 'move', 'click']);
  s.chime();   // GameAudio.chime() = play('discovery')
  assert.equal(audio.log.at(-1), 'discovery');
  s.press();
  assert.equal(audio.log.at(-1), 'discovery', 'the chime covers the press');
  s.footstep(4321);
  assert.equal(audio.log.at(-1), 'step:4321');
});

test('setting: 효과음 on unlocks, off stops everything; 배경음 on unlocks (2D sfx / music settings)', () => {
  const audio = fakeAudio(), s = createSound(audio);
  s.setting('sound', { sound: false, music: true });
  assert.deepEqual(audio.log, ['stop']);
  s.setting('sound', { sound: true, music: false });
  assert.deepEqual(audio.log, ['stop', 'unlock']);
  s.setting('music', { sound: true, music: true });
  assert.deepEqual(audio.log, ['stop', 'unlock', 'unlock']);
  s.setting('music', { sound: true, music: false });   // the loop checks the state on every beat
  s.setting('volume', { sound: true, volume: 0.2 });   // tones read the volume as they play
  assert.deepEqual(audio.log, ['stop', 'unlock', 'unlock']);
});

test('visibility: a hidden page stops the audio and the voice; shown again it resumes only a started, wanted sound', () => {
  const audio = fakeAudio(), hushed = [];
  const s = createSound(audio, { narrator: { cancel: () => hushed.push('cancel') } });
  s.visibility(false, { sound: true });
  assert.deepEqual(audio.log, [], 'never unlocked: nothing to resume (no press yet)');
  s.visibility(true, { sound: true });
  assert.deepEqual(audio.log, ['stop']);
  assert.deepEqual(hushed, ['cancel']);
  audio.ctx = { state: 'suspended' };
  s.visibility(false, { sound: false });
  assert.deepEqual(audio.log, ['stop']);
  s.visibility(false, { sound: true });
  assert.deepEqual(audio.log, ['stop', 'unlock']);
});

test('unlockOnPress: the first key or pointer press unlocks while the sound is on, and listening stops once it runs', async () => {
  const listeners = new Map();
  const target = {
    addEventListener: (t, f, c) => { assert.equal(c, true); listeners.set(t, f); },
    removeEventListener: (t, f) => { if (listeners.get(t) === f) listeners.delete(t); },
  };
  let state = { sound: true }, runs = false;
  const audio = fakeAudio();
  audio.unlock = async () => { audio.log.push('unlock'); return runs; };
  const s = createSound(audio);
  unlockOnPress(target, s, () => state);
  assert.deepEqual([...listeners.keys()].sort(), ['keydown', 'pointerdown']);
  await listeners.get('pointerdown')();   // an untrusted press: the context stays suspended, keep listening
  assert.deepEqual(audio.log, ['unlock']);
  assert.equal(listeners.size, 2);
  runs = true;
  await listeners.get('keydown')();
  assert.deepEqual(audio.log, ['unlock', 'unlock']);
  assert.equal(listeners.size, 0);
  // sound off at the first press: nothing to unlock (turning it on in 설정 unlocks then)
  state = { sound: false };
  const audio2 = fakeAudio(), s2 = createSound(audio2);
  unlockOnPress(target, s2, () => state);
  await listeners.get('pointerdown')();
  assert.deepEqual(audio2.log, []);
  assert.equal(listeners.size, 0);
});
