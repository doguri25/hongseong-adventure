// The start choice between the 3D and the light 2D (spec §9-§10, phase 2b). Pure: no DOM, no imports, so boot.js (the
// page's entry) stays a few hundred bytes and decides before any of the 3D game (Three.js, the world data) is fetched.
// The rules, in order:
//   1. ?view=2d                       -> the 2D, and remembered ('2d' stored)
//   2. ?view=3d                       -> the 3D, and the remembered choice cleared (the teacher's way back)
//   3. a remembered '2d'              -> the 2D (storage left as it is)
//   4. no WebGL2                      -> the 2D, not remembered (a later visit on a better browser gets the 3D)
//   5. anything else                  -> the 3D
// The ?view= value is matched case-insensitively (and trimmed); any other value is ignored. The choice is kept in
// localStorage[VIEW_KEY] as '2d' or absent; every storage access is wrapped, so blocked storage still boots a game.

export const VIEW_KEY = 'hongseong-view-v1';
/** The frozen 2D, relative to the 3D's page (GitHub Pages serves the site under /hongseong-adventure/). */
export const LITE_URL = './2d/';

/** The ?view= value: '2d' | '3d' | null (missing or any other value). search: location.search, with or without '?'. */
function viewParam(search) {
  let v = null;
  try { v = new URLSearchParams(String(search ?? '')).get('view'); } catch { /* a malformed query: no choice */ }
  v = typeof v === 'string' ? v.trim().toLowerCase() : null;
  return v === '2d' || v === '3d' ? v : null;
}

/**
 * chooseView({search, stored, webgl2}) -> {view: '2d'|'3d', store?: '2d'|null}. store '2d' means remember the 2D, null
 * means clear the choice, and no store (undefined) means leave storage as it is. webgl2 is the probe's answer (true
 * unless a probe said otherwise): a function is called only when the rules reach it.
 */
export function chooseView({ search = '', stored = null, webgl2 = true } = {}) {
  const asked = viewParam(search);
  if (asked === '2d') return { view: '2d', store: '2d' };
  if (asked === '3d') return { view: '3d', store: null };
  if (stored === '2d') return { view: '2d' };
  let gl = webgl2;
  if (typeof gl === 'function') { try { gl = gl(); } catch { gl = false; } }
  if (!gl) return { view: '2d' };
  return { view: '3d' };
}

/** The remembered choice: '2d' or null (none, or storage missing / blocked). */
export function readView(storage) {
  try { return storage?.getItem(VIEW_KEY) ?? null; } catch { return null; }
}

/** Write a chooseView store: '2d' remembers the 2D, null clears it, undefined leaves it. Never throws. */
export function writeView(storage, store) {
  if (store === undefined || !storage) return;
  try { if (store === null) storage.removeItem(VIEW_KEY); else storage.setItem(VIEW_KEY, store); } catch { /* blocked or full */ }
}

/**
 * boot.js in one call: read the address and the remembered choice, ask the WebGL2 probe only if the rules need it,
 * write the result and answer the view to open ('2d' | '3d').
 */
export function startView({ search, storage, webgl2 }) {
  const choice = chooseView({ search, stored: readView(storage), webgl2 });
  writeView(storage, choice.store);
  return choice.view;
}

/** The teacher's way back from the light 2D: the 3D's own address (this page's folder) with ?view=3d. */
export function backAddress(href) {
  try { const u = new URL('./', href); u.search = '?view=3d'; return u.href; } catch { return '?view=3d'; }
}
