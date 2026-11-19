// Street lamp placement and the forest / urban / water masks behind tree scattering (pure, game frame: x east, y south, metres).
import { SpatialIndex } from '#game/geography.js';
import { inRing, bboxOf } from './collider.js';
import { roadClearance } from './roads.js';

const GAPS = { primary: 34, secondary: 36, tertiary: 38, secondary_link: 36, tertiary_link: 38, residential: 44, unclassified: 44 };
const MAX_LAMPS = 2600;
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const closed = (f) => f.kind !== 'road' && f.points.length >= 4 && Math.hypot(f.points[0][0] - f.points.at(-1)[0], f.points[0][1] - f.points.at(-1)[1]) < 0.5;
const inFeature = (f, x, y) => inRing(x, y, f.points) && !(f.holes || []).some((h) => inRing(x, y, h));
const waterTags = (t) => t.natural === 'water' || t.landuse === 'reservoir' || t.landuse === 'basin' || t.waterway === 'riverbank';
const URBAN_USE = ['residential', 'commercial', 'industrial', 'construction', 'retail', 'cemetery', 'farmland'];

// true within ~200 m of any building: a 100 m cell set dilated by two cells around each footprint centre
export function createUrbanTest(rings) {
  const cells = new Set();
  for (const r of rings) {
    const b = bboxOf(r), i = Math.floor((b[0] + b[2]) / 200), j = Math.floor((b[1] + b[3]) / 200);
    for (let a = -2; a <= 2; a++) for (let c = -2; c <= 2; c++) cells.add((i + a) + ':' + (j + c));
  }
  return (x, y) => cells.has(Math.floor(x / 100) + ':' + Math.floor(y / 100));
}

// water polygons (sea has holes) plus the carved sea / lake bed in the height field
export function createWaterTest(features, field) {
  const waters = features.filter((f) => (f.kind === 'water' || waterTags(f.tags || {})) && f.points.length >= 3);
  const index = new SpatialIndex(waters, 512);
  return (x, y) => (field && field.heightAt(x, y) < 0.2) || index.query([x, y, x, y]).some((f) => inFeature(f, x, y));
}

// Tree density 0..1: steep high ground, wood / scrub / park polygons, zero on roads, buildings, water and built-up landuse.
export function createForestDensity(field, features, { clearance, collider, isWater }) {
  const veg = [], zero = [];
  for (const f of features) {
    if (!closed(f)) continue;
    const t = f.tags || {};
    const v = ['wood', 'forest'].includes(t.natural) || ['wood', 'forest'].includes(t.landuse) ? 1
      : t.natural === 'scrub' ? 0.6 : ['park', 'garden'].includes(t.leisure) ? 0.27 : null;
    if (v !== null) veg.push({ f, v });
    if (URBAN_USE.includes(t.landuse) || t.leisure === 'pitch') zero.push(f);
  }
  const vegIndex = new SpatialIndex(veg.map((o) => ({ bounds: o.f.bounds, o })), 512);
  const zeroIndex = new SpatialIndex(zero, 512);
  return function forestDensity(x, y) {
    if (clearance && clearance(x, y) < 4) return 0;
    if (collider && collider.blocked(x, y, 0)) return 0;
    if (isWater && isWater(x, y)) return 0;
    if (zeroIndex.query([x, y, x, y]).some((f) => inFeature(f, x, y))) return 0;
    let v = null;
    for (const h of vegIndex.query([x, y, x, y])) if (inFeature(h.o.f, x, y) && (v === null || h.o.v > v)) v = h.o.v;
    if (v !== null) return v;
    const h = field.heightAt(x, y);
    return Math.max(smooth(0.1, 0.17, field.slopeAt(x, y)) * smooth(24, 40, h), smooth(57, 82, h));
  };
}

// clearance (optional) defaults to the graph's own edges
export function lampSpots(graph, collider, isWater, isUrban, isForest, clearance) {
  if (!clearance) clearance = roadClearance(graph.edges.map((e) => ({ kind: 'road', tags: { highway: e.hw }, points: e.pts }))).clearance;
  const junctions = [], grid = new Map(), gk = (x, y) => Math.floor(x / 50) + ':' + Math.floor(y / 50);
  for (const n of graph.nodes.values()) {
    if (n.links.length < 3) continue;
    junctions.push(n);
    const k = gk(n.x, n.y); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(n);
  }
  const nearJunction = (x, y, r) => {
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++)
      for (const n of grid.get(gk(x + i * 50, y + j * 50)) || []) if (Math.hypot(n.x - x, n.y - y) < r) return true;
    return false;
  };
  const spots = [];
  for (const e of graph.edges) {
    const gap = GAPS[e.hw]; if (!gap) continue;
    const half = e.half, setback = half + 2.2;
    let carry = gap * hash(e.pts[0][0] * 0.37 + e.pts[0][1]), side = hash(e.pts[0][1]) < 0.5 ? 1 : -1;
    for (let i = 1; i < e.pts.length; i++) {
      const a = e.pts[i - 1], b = e.pts[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 0.1) continue;
      const tx = (b[0] - a[0]) / len, ty = (b[1] - a[1]) / len, nx = -ty, ny = tx;
      for (let d = gap - carry; d < len; d += gap) {
        side = -side;
        const cx = a[0] + tx * d, cy = a[1] + ty * d, x = cx + nx * setback * side, y = cy + ny * setback * side;
        if (nearJunction(cx, cy, half + 16)) continue;
        if (clearance(x, y) < 1.2) continue;
        if (collider.blocked(x, y, 3) || isWater(x, y) || !isUrban(x, y) || isForest(x, y)) continue;
        spots.push({ x, y, yaw: Math.atan2(-nx * side, -ny * side), gap });
      }
      carry = (carry + len) % gap;
    }
  }
  return spots.sort((p, q) => p.gap - q.gap).slice(0, MAX_LAMPS).map(({ x, y, yaw }) => ({ x, y, yaw }));
}
