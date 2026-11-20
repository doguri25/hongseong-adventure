// The page's entry (index.html loads only this): choose between the 3D and the light 2D before any of the 3D game is
// fetched (spec §10, game/view-choice.js). The 2D path replaces the page with ./2d/ and so never asks for the game chunk
// (main.js with Three.js) or the world data; the 3D path imports main.js, which boots the game. Nothing heavy may be
// imported here statically: Vite then keeps main.js and everything under it in a chunk of its own.
import { startView, LITE_URL } from './game/view-choice.js';

// localStorage can be missing or throw (private mode, blocked site data): then no choice is remembered
function localStore() {
  try { return window.localStorage; } catch { return null; }
}

// WebGL2 on a throwaway canvas (Three.js needs WebGL2); the probe's context is given back at once
function hasWebgl2() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch { return false; }
}

if (startView({ search: location.search, storage: localStore(), webgl2: hasWebgl2 }) === '2d') {
  location.replace(LITE_URL);
} else {
  import('./main.js').catch((e) => {   // the game chunk did not arrive (offline, a stale cache): say so on the page
    console.error(e);
    const fatal = document.getElementById('fatal'), text = document.getElementById('fatal-text');
    if (text) text.textContent = '3D 지도를 불러오지 못했어요. 인터넷 연결을 확인하고 다시 열어 주세요.';
    document.getElementById('loading')?.setAttribute('hidden', '');
    fatal?.removeAttribute('hidden');
  });
}
