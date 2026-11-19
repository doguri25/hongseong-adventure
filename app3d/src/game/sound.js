// The game's sounds (P4 / P13): the 2D GameAudio (dist/audio.js: small synthesized tones, the music loop, footsteps)
// behind the one object the controller and every UI module play through (ctl.sound). On top of GameAudio it adds the
// 2D game's click on every button press, without doubling a sound the button already made, and the effects of the
// 설정 sound rows and of the page being hidden. No DOM here: main.js hands in the event target and the state.
//
// createSound(audio, {now, narrator}) -> {
//   play(kind)        GameAudio.play with the 2D names: click, move, arrival, discovery (the chime), correct, retry, coin
//   chime()           a new discovery or a mission bonus (2D sound.chime = play('discovery'))
//   press()           a button was pressed (main.js listens for clicks on buttons): the 2D click, unless something
//                     already sounded for this press (the button's own sound, within PRESS_GAP_MS)
//   footstep(t)       one step while walking or biking on the ground (t in ms; GameAudio keeps the 2D 330 ms cadence)
//   unlock(state)     start the audio (needs a key or pointer press); resolves true once it runs; nothing while off
//   setting(key, state)  a 설정 change already written to state: 효과음 on unlocks, off stops all sound (music too);
//                     배경음 on unlocks (the loop itself checks sound && music on every beat; tones read the volume)
//   visibility(hidden, state)  hidden: the music, tones and voice stop and the audio context is suspended; shown
//                     again: resumed when the sound is on and had been started }
export const PRESS_GAP_MS = 40;

export function createSound(audio, { now = () => globalThis.performance.now(), narrator = null } = {}) {
  let last = -Infinity;
  return {
    play(kind) { last = now(); audio.play(kind); },
    chime() { this.play('discovery'); },
    press() { if (now() - last >= PRESS_GAP_MS) this.play('click'); },
    footstep(t) { audio.footstep(t); },
    async unlock(state) { return state?.sound ? !!(await audio.unlock()) : false; },
    setting(key, state) {
      if (key === 'sound') { if (state.sound) audio.unlock(); else audio.stop(); }
      else if (key === 'music' && state.music) audio.unlock();
    },
    visibility(hidden, state) {
      if (hidden) { narrator?.cancel(); audio.stop(); }
      else if (state.sound && audio.ctx) audio.unlock();
    },
  };
}

/**
 * Browsers start audio only from a key or pointer press: the first press after boot unlocks the sound when it is on
 * (2D unlockAudio). Listening goes on until the audio really runs (a synthetic press cannot start it), and stops at
 * once when the sound is off (turning it on in 설정 unlocks then). Returns the function that stops listening.
 */
export function unlockOnPress(target, sound, getState) {
  const stop = () => { target.removeEventListener('pointerdown', press, true); target.removeEventListener('keydown', press, true); };
  async function press() {
    const state = getState();
    if (!state.sound) { stop(); return; }
    if (await sound.unlock(state)) stop();
  }
  target.addEventListener('pointerdown', press, true);
  target.addEventListener('keydown', press, true);
  return stop;
}
