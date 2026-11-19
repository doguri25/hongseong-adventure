// Quality presets and pure helpers (no Three.js). Pokju-style: resolution first, then bloom, then the heavier steps.
// props: geometry budgets for world/props.js — trees per 2 km chunk and the radii (m) they stream in / drop out,
// the radius (m) around the camera target that gets street lamps, and whether lamps cast shadows.
// terrainLod: distances (m) where terrain chunks switch from 25 m to 50 m and from 50 m to 100 m spacing.
// ground: painted ground texture sizes (px) for the county-wide base level and the near level (fixed at boot).
export const QUALITY = {
  high: { label: '높음', dpr: 2, cap: 2.6e6, shadow: 2048, bloom: true, msaa: 4,
    props: { treeCap: 1200, treeLoad: 4000, treeDrop: 5000, lampRadius: 2000, lampShadow: true },
    terrainLod: [3000, 8000], ground: { base: 4096, near: 2048 } },
  medium: { label: '보통', dpr: 1.5, cap: 1.8e6, shadow: 2048, bloom: true, msaa: 2,
    props: { treeCap: 900, treeLoad: 3200, treeDrop: 4200, lampRadius: 1600, lampShadow: false },
    terrainLod: [2500, 6500], ground: { base: 2048, near: 2048 } },
  low: { label: '낮음', dpr: 1.25, cap: 1.2e6, shadow: 1024, bloom: false, msaa: 0,
    props: { treeCap: 450, treeLoad: 2400, treeDrop: 3200, lampRadius: 1200, lampShadow: false },
    terrainLod: [2000, 5000], ground: { base: 2048, near: 1024 } },
};
export const STORE_KEY = 'hongseong-3d-v1';
const r2 = (v) => Math.round(v * 100) / 100;

// The preset automatic quality starts from: low on devices that report 2 GB of memory or less, medium on touch devices
// (tablets, phones) and up to 4 GB, high otherwise. env: { coarse: matchMedia('(pointer: coarse)').matches,
// deviceMemory: navigator.deviceMemory } (deviceMemory is missing outside Chromium: then only the pointer counts).
export function autoStartKey({ coarse = false, deviceMemory } = {}) {
  const mem = Number.isFinite(deviceMemory) ? deviceMemory : Infinity;
  return mem <= 2 ? 'low' : coarse || mem <= 4 ? 'medium' : 'high';
}

// The live quality state: mode ('auto' | 'high' | 'medium' | 'low'), key (the preset it started from), the resolution
// scale and the four things automatic quality may switch down: bloom, msaa samples, shadow map size (0 = off) and the
// geometry budget (props: a QUALITY key whose props and terrainLod apply).
export function qualityState(mode, autoKey = 'high') {
  const key = mode === 'auto' ? (QUALITY[autoKey] ? autoKey : 'high') : mode, Q = QUALITY[key];
  return { mode, key, scale: 1, bloom: Q.bloom, msaa: Q.msaa, shadow: Q.shadow, props: key };
}

// medianMs over the last window. Explicit modes never change. Too slow (> 26 ms): resolution first (down to 0.6),
// then bloom off, then MSAA off, then shadows 1024, then shadows off, then the low geometry budget; then it stays.
// Fast again (< 15 ms) only wins resolution back: the other steps are one-way, so the ladder cannot oscillate
// through expensive rebuilds.
export function nextQuality(state, medianMs) {
  if (state.mode !== 'auto') return state;
  if (medianMs > 26) {
    if (state.scale > 0.6) return { ...state, scale: Math.max(0.6, r2(state.scale - 0.14)) };
    if (state.bloom) return { ...state, bloom: false };
    if (state.msaa > 0) return { ...state, msaa: 0 };
    if (state.shadow > 1024) return { ...state, shadow: 1024 };
    if (state.shadow > 0) return { ...state, shadow: 0 };
    if (state.props !== 'low') return { ...state, props: 'low' };
  } else if (medianMs < 15 && state.scale < 1) {
    return { ...state, scale: Math.min(1, r2(state.scale + 0.1)) };
  }
  return state;
}

export function pixelRatio(quality, scale, w, h, devicePixelRatio) {
  const wanted = Math.min(devicePixelRatio || 1, quality.dpr) * scale;
  return Math.min(wanted, Math.sqrt(quality.cap / Math.max(1, w * h)));
}

export function watchContextLoss(canvas, { onLost, onRestored } = {}) {
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); onLost?.(); });
  canvas.addEventListener('webglcontextrestored', () => onRestored?.());
}

export function rememberQuality(storage, mode) {
  try {
    let o = {};
    try { const v = JSON.parse(storage.getItem(STORE_KEY)); if (v && typeof v === 'object' && !Array.isArray(v)) o = v; } catch {}
    o.quality = mode;
    storage.setItem(STORE_KEY, JSON.stringify(o));
  } catch {}
}
