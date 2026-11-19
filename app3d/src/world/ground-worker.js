// Paints ground levels off the main thread. Protocol:
//   in : {type:'init', features, buildings, grid, data}  -> out {type:'ready'} | {type:'unsupported'}
//        {type:'paint', level, gen, x0, y0, wx, wy, size, fine} -> out {type:'painted', level, gen, bitmap}
import { paintRegion, makeMasks, makePatterns } from './paint.js';

let env = null;
const canvases = new Map();
const mk = (w, h) => new OffscreenCanvas(w, h);

function init(m) {
  try {
    if (typeof OffscreenCanvas === 'undefined' || typeof DOMMatrix === 'undefined' || !mk(1, 1).getContext('2d')) throw new Error('unsupported');
    env = { features: m.features, buildings: m.buildings, masks: makeMasks(m.grid, m.data, mk), patterns: makePatterns(mk), mk };
    self.postMessage({ type: 'ready' });
  } catch (e) {
    env = null;
    self.postMessage({ type: 'unsupported', reason: String(e && e.message || e) });
  }
}

function paint(m) {
  if (!env) return;
  try {
    const w = m.size, h = Math.max(1, Math.round(m.size * m.wy / m.wx));
    let c = canvases.get(m.level);
    if (!c || c.width !== w || c.height !== h) { c = mk(w, h); canvases.set(m.level, c); }
    paintRegion(c.getContext('2d'), m.x0, m.y0, m.wx, m.wy, { ...env, fine: m.fine });
    const bitmap = c.transferToImageBitmap();
    self.postMessage({ type: 'painted', level: m.level, gen: m.gen, bitmap }, [bitmap]);
  } catch (e) {
    self.postMessage({ type: 'unsupported', reason: String(e && e.message || e) });
  }
}

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') init(m); else if (m.type === 'paint') paint(m);
};
