// Road graph for the car (pure, game frame: x east, y south, metres).
// Ways are split at shared vertices into edges; edges carry cumulative lengths and a one-way flag.
import { ROAD_WIDTH } from './roads.js';

const SKIP = new Set(['path', 'footway', 'cycleway', 'steps', 'pedestrian']);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function buildRoadGraph(features) {
  const ways = features.filter(f => f.kind === 'road' && ROAD_WIDTH[f.tags.highway] && !SKIP.has(f.tags.highway) && f.points.length > 1);
  const key = p => Math.round(p[0] * 2) + ',' + Math.round(p[1] * 2);
  const uses = new Map();
  for (const f of ways) f.points.forEach((p, i) => { const k = key(p); uses.set(k, (uses.get(k) || 0) + (i === 0 || i === f.points.length - 1 ? 2 : 1)); });
  const edges = [], nodes = new Map();
  const node = p => { const k = key(p); if (!nodes.has(k)) nodes.set(k, { key: k, x: p[0], y: p[1], links: [] }); return nodes.get(k); };
  for (const f of ways) {
    let start = 0;
    for (let i = 1; i < f.points.length; i++) {
      if (i !== f.points.length - 1 && !(uses.get(key(f.points[i])) > 1)) continue;
      const pts = f.points.slice(start, i + 1), L = [0];
      for (let k = 1; k < pts.length; k++) L.push(L[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
      if (L.at(-1) > 0.5) {
        const ow = f.tags.oneway, a = node(pts[0]), b = node(pts.at(-1));
        const e = { id: edges.length, pts, L, len: L.at(-1), half: ROAD_WIDTH[f.tags.highway] / 2, oneway: ow === 'yes' || ow === '-1', way: ow === 'yes' ? 1 : ow === '-1' ? -1 : 0, a, b };
        edges.push(e); a.links.push({ e, end: 0 }); b.links.push({ e, end: 1 });
      }
      start = i;
    }
  }
  const C = 60, grid = new Map(), gk = (i, j) => i * 100000 + j;
  for (const e of edges) for (let k = 1; k < e.pts.length; k++) {
    const a = e.pts[k - 1], b = e.pts[k];
    for (let i = Math.floor(Math.min(a[0], b[0]) / C); i <= Math.floor(Math.max(a[0], b[0]) / C); i++)
      for (let j = Math.floor(Math.min(a[1], b[1]) / C); j <= Math.floor(Math.max(a[1], b[1]) / C); j++) {
        const q = gk(i, j); if (!grid.has(q)) grid.set(q, []); grid.get(q).push([e, k]);
      }
  }
  function at(e, s) {
    s = clamp(s, 0, e.len); let lo = 0, hi = e.L.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (e.L[m] <= s) lo = m; else hi = m; }
    const a = e.pts[lo], b = e.pts[hi], t = (s - e.L[lo]) / ((e.L[hi] - e.L[lo]) || 1);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  // travel direction, smoothed over a few metres so corners turn gently
  function tangent(e, s, dir) {
    const w = Math.min(10, e.len / 2), p = at(e, s - w), q = at(e, s + w);
    const dx = (q[0] - p[0]) * dir, dy = (q[1] - p[1]) * dir, l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  }
  function departure(l) {
    const w = Math.min(18, l.e.len), p = at(l.e, l.end === 0 ? 0 : l.e.len), q = at(l.e, l.end === 0 ? w : l.e.len - w);
    const dx = q[0] - p[0], dy = q[1] - p[1], n = Math.hypot(dx, dy) || 1;
    return [dx / n, dy / n];
  }
  function nearest(x, y, maxR = 200) {
    const i0 = Math.floor(x / C), j0 = Math.floor(y / C); let best = null;
    for (let ring = 0; ring * C <= maxR + C; ring++) {
      for (let i = i0 - ring; i <= i0 + ring; i++) for (let j = j0 - ring; j <= j0 + ring; j++) {
        if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== ring) continue;
        for (const [e, k] of grid.get(gk(i, j)) || []) {
          const a = e.pts[k - 1], b = e.pts[k], dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
          const t = l ? clamp(((x - a[0]) * dx + (y - a[1]) * dy) / l, 0, 1) : 0;
          const d = Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t);
          if (!best || d < best.d) best = { edge: e, s: e.L[k - 1] + (e.L[k] - e.L[k - 1]) * t, d };
        }
      }
      if (best && best.d < ring * C) break;
    }
    return best && best.d <= maxR ? best : null;
  }
  // A* over junctions from the node ahead (and, with a penalty, the node behind) to the edge nearest the goal.
  // state = {edge, s, dir}; goal = nearest() result.
  function route(state, goal, tx, ty) {
    const se = state.edge;
    const starts = [
      { n: state.dir > 0 ? se.b : se.a, cost: state.dir > 0 ? se.len - state.s : state.s, turn: false },
      { n: state.dir > 0 ? se.a : se.b, cost: (state.dir > 0 ? state.s : se.len - state.s) + 250, turn: true },
    ];
    if (se === goal.edge) { const ahead = state.dir > 0 ? goal.s >= state.s : goal.s <= state.s; return { turn: !ahead, edges: [] }; }
    const h = n => Math.hypot(n.x - tx, n.y - ty), best = new Map(), open = [];
    for (const s of starts) { best.set(s.n.key, { g: s.cost, prev: null, via: null, turn: s.turn }); open.push({ n: s.n, f: s.cost + h(s.n) }); }
    let found = null, guard = 0;
    while (open.length && guard++ < 20000) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const { n } = open.splice(bi, 1)[0], cur = best.get(n.key);
      if (n === goal.edge.a || n === goal.edge.b) {
        const total = cur.g + (n === goal.edge.a ? goal.s : goal.edge.len - goal.s);
        if (!found || total < found.total) found = { n, total };
        if (open.every(o => o.f >= found.total)) break;
        continue;
      }
      for (const l of n.links) {
        if (l.e === se && cur.prev === null) continue;
        const m = l.end === 0 ? l.e.b : l.e.a, wrong = l.e.way && l.e.way !== (l.end === 0 ? 1 : -1);
        const g = cur.g + l.e.len * (wrong ? 4 : 1), old = best.get(m.key);
        if (!old || g < old.g) { best.set(m.key, { g, prev: n, via: l.e, turn: cur.turn }); open.push({ n: m, f: g + h(m) }); }
      }
    }
    if (!found) return null;
    const list = []; let k = found.n.key;
    while (best.get(k).prev) { const b = best.get(k); list.unshift(b.via.id); k = b.prev.key; }
    list.push(goal.edge.id);
    return { turn: best.get(found.n.key).turn, edges: list };
  }
  return { edges, nodes, at, tangent, departure, nearest, route };
}
