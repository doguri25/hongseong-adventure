// Save/load and the safe start position. `storage` is anything with getItem/setItem (localStorage in the browser).
import { STORAGE_KEY, freshState, sanitizeState } from '../../../dist/core.js';
import { project, unproject } from '../frame.js';

export const EXTRA_KEY = 'hongseong-3d-v1';
export const MODES = ['walk', 'bike', 'car', 'supercar', 'slowplane', 'plane'];
export const TRAVEL_SPEED = { walk: 'walk', bike: 'bike', car: 'fast', supercar: 'faster', slowplane: 'plane', plane: 'plane' };
export const defaultExtra = () => ({ camera: 'tilt', time: 'day', quality: 'auto', travel: null });

const read = (storage, key) => { try { const t = storage.getItem(key); return t ? JSON.parse(t) : null; } catch { return null; } };

function cleanExtra(raw) {
  const d = defaultExtra();
  if (!raw || typeof raw !== 'object') return d;
  return {
    camera: ['tilt', 'follow'].includes(raw.camera) ? raw.camera : d.camera,
    time: ['day', 'dusk', 'night'].includes(raw.time) ? raw.time : d.time,
    quality: ['auto', 'high', 'medium', 'low'].includes(raw.quality) ? raw.quality : d.quality,
    travel: MODES.includes(raw.travel) ? raw.travel : d.travel,
  };
}

export function loadSession(storage) {
  return { state: sanitizeState(read(storage, STORAGE_KEY)), extra: cleanExtra(read(storage, EXTRA_KEY)) };
}

const finite = (v) => Number.isFinite(v);
// bounds may be lon/lat [w,s,e,n] (as in world.json) or game-frame metres [minX,minY,maxX,maxY]
function frameBounds(b) {
  if (b.every((v) => Math.abs(v) < 200)) {
    const [minX, minY] = project([b[0], b[3]]), [maxX, maxY] = project([b[2], b[1]]);
    return [minX, minY, maxX, maxY];
  }
  return b;
}

const R = 6, EDGE = 40;

// Position the game starts at: the saved county location (else world.start), moved onto dry land, out of buildings, inside bounds.
export function startPosition(state, { water, collider, bounds, start }) {
  const [minX, minY, maxX, maxY] = frameBounds(bounds);
  const clamp = ([x, y]) => [Math.max(minX + EDGE, Math.min(maxX - EDGE, x)), Math.max(minY + EDGE, Math.min(maxY - EDGE, y))];
  const saved = state?.locations?.county;
  let p = Array.isArray(saved) && saved.length === 2 && saved.every(finite) ? project(saved) : null;
  if (!p || !p.every(finite)) p = [...start];
  for (let i = 0; i < 4; i++) {
    p = clamp(p);
    if (water) { const land = water.nearestLand(p, 3000); p = land ? clamp(land) : clamp([...start]); }
    if (collider) { const r = collider.resolve(p[0], p[1], R); p = [r.x, r.y]; }
    p = clamp(p);
    if ((!water || !water.blocked(p)) && (!collider || !collider.blocked(p[0], p[1]))) return p;
  }
  // last resort: the world start point (itself resolved once more)
  let s = clamp([...start]);
  if (water) { const land = water.nearestLand(s, 3000); if (land) s = clamp(land); }
  if (collider) { const r = collider.resolve(s[0], s[1], R); s = clamp([r.x, r.y]); }
  return s;
}

// During a voyage (`voyage` = {start,...}) the departure dock is saved and the travel mode is left as it was.
export function saveSession(storage, state, extra, player, voyage = null) {
  try {
    const mode = player.mode;
    const at = voyage ? voyage.start : [player.x, player.y];
    if (finite(at[0]) && finite(at[1])) {
      state.locations = { ...(state.locations || {}), county: unproject(at) };
      state.position = [at[0], at[1]];
    }
    const speed = TRAVEL_SPEED[mode];
    if (speed && !voyage) state.travelSpeed = speed;
    const prior = read(storage, EXTRA_KEY) || {};
    const merged = { ...prior, ...(extra || {}) };
    if (MODES.includes(mode) && !voyage) merged.travel = mode;
    state.version = 1;
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    storage.setItem(EXTRA_KEY, JSON.stringify(merged));
    return true;
  } catch { return false; }
}

export { freshState };
