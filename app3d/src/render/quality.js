// Quality presets and pure helpers (no Three.js). Pokju-style: resolution first, then bloom.
export const QUALITY = {
  high: { label: '높음', dpr: 2, cap: 2.6e6, shadow: 2048, bloom: true, msaa: 4 },
  medium: { label: '보통', dpr: 1.5, cap: 1.8e6, shadow: 2048, bloom: true, msaa: 2 },
  low: { label: '낮음', dpr: 1.25, cap: 1.2e6, shadow: 1024, bloom: false, msaa: 0 },
};
export const STORE_KEY = 'hongseong-3d-v1';
const r2 = (v) => Math.round(v * 100) / 100;

// state {mode, scale, bloom}; medianMs over the last window. Explicit modes never change.
export function nextQuality(state, medianMs) {
  if (state.mode !== 'auto') return state;
  if (medianMs > 26) {
    if (state.scale > 0.6) return { ...state, scale: Math.max(0.6, r2(state.scale - 0.14)) };
    if (state.bloom) return { ...state, bloom: false };
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
