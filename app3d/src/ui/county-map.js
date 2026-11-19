// 홍성군 전체 지도: the county map dialog (2D showTravel + OverviewMap, in the pokju dialog look). One dialog serves the
// controller's kinds 'map', 'search' and 'nearby' (P23) as three views on a tab row: 지도 / 장소 찾기 / 주변 찾기
// (ui/search.js has the other two). The 지도 view is the 2D county picture on a canvas (createCountyMap: zoom 1-10 with
// the buttons, the wheel or two fingers, drag to pan, the pan clamped so the county stays on screen, a tap on the pins
// within 16 px: one place heads there, several open 주변 찾기 with only those) beside the 2D 지역 목록 (the 11 홍성군
// districts with their place counts; picking one lists its places nearest first and frames it on the map), the
// legend of the 2D place symbols and the 18 story-only cards (우리 고장의 문화 이야기). Every 찾아가기 goes through the
// game controller (2D goToPlace): ctl.goTo heads for a place (a story-only one opens its story, P19), and a place
// already in reach opens as a visit (2D navigate -> openPlace). It is modal (ui/dom.js openModal) and every way out
// goes through ctx.onClose -> ctl.close(). Copy is the 2D game's (dist/game.js showTravel, showNearby, dist/search.js).
import { el, openModal, closeModal } from './dom.js';
import { createSearch, createNearby, symbolIcon, nearbyPlaces } from './search.js';
import { heroImage } from './place-dialog.js';
import { BOUNDS, M_LON, M_LAT, project } from '../frame.js';
import { PLACES } from '#game/content.js';
import { SYMBOLS, symbolKey, symbolFor } from '#game/place-icons.js';

export const ZOOM_MIN = 1, ZOOM_MAX = 10, MAP_PAD = 20, TAP_RADIUS = 16;
export const MAP_KINDS = ['map', 'search', 'nearby'];
// the game frame's extent: the county picture covers x in [0, WORLD.w], y in [0, WORLD.h] (as the minimap's)
export const WORLD = { w: (BOUNDS[2] - BOUNDS[0]) * M_LON, h: (BOUNDS[3] - BOUNDS[1]) * M_LAT };
const TAU = Math.PI * 2, STEP = 1.5;   // the 2D toolbar's zoom step
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const QUIET = { play() {} };

/**
 * mapTransform(view, w, h) -> {zoom, scale, base, ox, oy, view, toScreen([x,y]), toMap([sx,sy])}. Pure.
 * view: {world: {w, h}, zoom, center: [x, y]} (center: the game-frame point shown in the middle of the canvas);
 * w, h: the canvas in CSS px. At zoom 1 the whole county fits with a MAP_PAD margin; the zoom is clamped to 1-10;
 * the centre is clamped so a map larger than the canvas always covers it (no more than the margin left bare) and a
 * smaller one stays centred. `view` in the result is the clamped view.
 */
export function mapTransform(view, w, h) {
  const W = view.world.w, H = view.world.h, pad = Math.min(MAP_PAD, w / 4, h / 4);
  const base = Math.min((w - 2 * pad) / W, (h - 2 * pad) / H);
  const zoom = clamp(Number.isFinite(view.zoom) ? view.zoom : ZOOM_MIN, ZOOM_MIN, ZOOM_MAX), scale = base * zoom;
  const axis = (c, size, extent) => {
    if (extent * scale <= size - 2 * pad + 1e-9) return extent / 2;
    const half = (size / 2 - pad) / scale;   // the half of the canvas, in metres, that the map must keep covering
    return clamp(Number.isFinite(c) ? c : extent / 2, half, extent - half);
  };
  const cx = axis(view.center?.[0], w, W), cy = axis(view.center?.[1], h, H);
  const ox = w / 2 - cx * scale, oy = h / 2 - cy * scale;
  return {
    zoom, scale, base, ox, oy, view: { ...view, zoom, center: [cx, cy] },
    toScreen: ([x, y]) => [x * scale + ox, y * scale + oy],
    toMap: ([sx, sy]) => [(sx - ox) / scale, (sy - oy) / scale],
  };
}

/** Zoom by `factor` keeping the map point under `at` (canvas px) where it is; the clamped view. */
export function zoomAbout(view, factor, at, w, h) {
  const t = mapTransform(view, w, h), m = t.toMap(at);
  const zoom = clamp(t.zoom * factor, ZOOM_MIN, ZOOM_MAX), scale = t.base * zoom;
  return mapTransform({ ...t.view, zoom, center: [m[0] - (at[0] - w / 2) / scale, m[1] - (at[1] - h / 2) / scale] }, w, h).view;
}

/** Drag the map by dx, dy canvas px (it follows the finger); the clamped view. */
export function panBy(view, dx, dy, w, h) {
  const t = mapTransform(view, w, h);
  return mapTransform({ ...t.view, center: [t.view.center[0] - dx / t.scale, t.view.center[1] - dy / t.scale] }, w, h).view;
}

/** The view that frames bounds [x0, y0, x1, y1] (game metres) inside the canvas margin, within the zoom limits. */
export function fitView(b, world, w, h) {
  const pad = Math.min(MAP_PAD, w / 4, h / 4), base = Math.min((w - 2 * pad) / world.w, (h - 2 * pad) / world.h);
  const bw = Math.max(1, b[2] - b[0]), bh = Math.max(1, b[3] - b[1]);
  const zoom = clamp(Math.min((w - 2 * pad) / (bw * base), (h - 2 * pad) / (bh * base)), ZOOM_MIN, ZOOM_MAX);
  return mapTransform({ world, zoom, center: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] }, w, h).view;
}

/** The places whose pins ({p, x, y} in canvas px) lie within `r` px of a tap, nearest first. */
export function pinsAt(pins, sx, sy, r = TAP_RADIUS) {
  return pins.map((v) => [v.p, Math.hypot(v.x - sx, v.y - sy)]).filter(([, d]) => d < r).sort((a, b) => a[1] - b[1]).map(([p]) => p);
}

const polygonsOf = (g) => (g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates]);
/** Where a district's name goes (game metres): the area centroid of its largest part. */
export function labelPoint(geometry) {
  let best = null, area = 0;
  for (const rings of polygonsOf(geometry)) {
    const r = rings[0].map(project);
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const f = r[j][0] * r[i][1] - r[i][0] * r[j][1];
      a += f; cx += (r[j][0] + r[i][0]) * f; cy += (r[j][1] + r[i][1]) * f;
    }
    if (Math.abs(a) > area) { area = Math.abs(a); best = [cx / (3 * a), cy / (3 * a)]; }
  }
  return best;
}

/**
 * The 2D 지역 목록: the 홍성군 districts of `districts` (world.json, lon/lat), in their order, each {name, area
 * ('홍성군 홍성읍'), count (mapped places in that area, as the 2D button), label ('홍성읍 · 58곳'), bounds (game metres),
 * district}.
 */
export function districtList(districts, places) {
  return districts.filter((d) => d.county === '홍성군').map((d) => {
    const area = `${d.county} ${d.name}`, count = places.filter((p) => p.area === area && !p.remote).length;
    const [x0, y1] = project([d.bounds[0], d.bounds[1]]), [x1, y0] = project([d.bounds[2], d.bounds[3]]);
    return { name: d.name, area, count, label: `${d.name} · ${count}곳`, bounds: [x0, y0, x1, y1], district: d };
  });
}

/**
 * createCountyMap(canvas, {image, places, districts, onSelect, player, onView, onTouch}) -> {draw(), drawNow(),
 * resize(), zoomBy(k), reset(), showAll(), select(district|null), view, pins, ready, destroy()}.
 * image: URL or <img> of the county picture; places: mapped places [{id, short, point}]; districts: world.json
 * districts to outline and name; onSelect(places): a tap hit these pins (nearest first); player() -> {x, y} for the
 * 2D orange dot; onView(transform) after each draw (the zoom label); onTouch() on each press. select({area, bounds})
 * outlines that district and frames it; select(null) shows the whole county again; showAll() zooms out to it keeping
 * the outline. Canvas 2D; draws on demand (one frame per change).
 */
export function createCountyMap(canvas, { image, places = [], districts = [], onSelect, player, onView, onTouch } = {}) {
  const win = canvas.ownerDocument?.defaultView || globalThis;
  const world = WORLD, home = () => ({ world, zoom: 1, center: [world.w / 2, world.h / 2] });
  const shapes = districts.map((d) => ({ area: `${d.county} ${d.name}`, name: d.name, polys: polygonsOf(d.geometry).map((rings) => rings.map((r) => r.map(project))), label: labelPoint(d.geometry) }));
  let view = home(), w = 0, h = 0, dpr = 1, g = null, pins = [], selected = null, frame = 0, img = null, ready = false;
  const redraw = () => { ready = true; schedule(); };
  if (typeof image === 'string') { img = new win.Image(); img.decoding = 'async'; img.onload = redraw; img.src = image; }
  else if (image) { img = image; ready = !!(img.complete && img.naturalWidth); if (!ready) img.addEventListener?.('load', redraw, { once: true }); }

  function resize() {
    const cw = canvas.clientWidth, ch = canvas.clientHeight, r = Math.min(2, win.devicePixelRatio || 1);
    if (!cw || !ch || (cw === w && ch === h && r === dpr)) return false;
    w = cw; h = ch; dpr = r;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    return true;
  }
  function schedule() { if (!frame) frame = (win.requestAnimationFrame || ((f) => setTimeout(f, 16)))(draw); }

  function draw() {
    frame = 0;
    resize();
    if (!w || !h) return;
    const t = mapTransform(view, w, h);
    view = t.view;
    g = g || canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#24435a'; g.fillRect(0, 0, w, h);   // beyond the county picture (the minimap's colour)
    if (ready && img.width) g.drawImage(img, t.ox, t.oy, world.w * t.scale, world.h * t.scale);
    // the districts: dashed borders, the picked one outlined in the accent (2D OverviewMap)
    g.lineJoin = 'round';
    for (const s of shapes) {
      g.beginPath();
      for (const poly of s.polys) for (const ring of poly) ring.forEach((p, i) => { const q = t.toScreen(p); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); });
      if (s === selected) { g.fillStyle = 'rgba(124, 92, 255, .18)'; g.fill('evenodd'); g.setLineDash([]); g.strokeStyle = '#7c5cff'; g.lineWidth = 3; }
      else { g.setLineDash([5, 4]); g.strokeStyle = '#436a54'; g.lineWidth = 1.2; }
      g.stroke();
    }
    g.setLineDash([]);
    // the pins in the 2D symbol colours
    pins = [];
    for (const p of places) {
      const [x, y] = t.toScreen(p.point);
      if (x < -8 || y < -8 || x > w + 8 || y > h + 8) continue;
      g.beginPath(); g.arc(x, y, 7, 0, TAU); g.fillStyle = symbolFor(p).color; g.fill();
      g.strokeStyle = '#fff9e5'; g.lineWidth = 1.5; g.stroke();
      pins.push({ p, x, y });
    }
    // the district names over the pins (they say where you are), then from 250 % the pins' short names wherever one
    // fits without touching a name already written (the ones nearest the middle first)
    g.textBaseline = 'middle';
    const taken = [], free = (r) => !taken.some((q) => r[0] < q[2] && q[0] < r[2] && r[1] < q[3] && q[1] < r[3]);
    g.font = '700 16px NanumRound, sans-serif'; g.textAlign = 'center';
    for (const s of shapes) {
      const [x, y] = t.toScreen(s.label), half = g.measureText(s.name).width / 2 + 3;
      g.lineWidth = 4; g.strokeStyle = '#fff8e6'; g.strokeText(s.name, x, y);
      g.fillStyle = s === selected ? '#3b2591' : '#325540'; g.fillText(s.name, x, y);
      taken.push([x - half, y - 11, x + half, y + 11]);
    }
    if (t.zoom >= 2.5) {
      g.font = '700 14px NanumRound, sans-serif'; g.textAlign = 'left';
      const order = pins.slice().sort((a, b) => Math.hypot(a.x - w / 2, a.y - h / 2) - Math.hypot(b.x - w / 2, b.y - h / 2));
      for (const { p, x, y } of order) {
        const text = p.short || p.name, r = [x + 8, y - 9, x + 12 + g.measureText(text).width, y + 10];
        if (!free(r)) continue;
        taken.push(r);
        g.lineWidth = 4; g.strokeStyle = '#fff9e8'; g.strokeText(text, x + 10, y + 1); g.fillStyle = '#244b38'; g.fillText(text, x + 10, y + 1);
      }
    }
    // the explorer: the 2D orange dot in a white ring
    const me = player?.();
    if (me) {
      const [x, y] = t.toScreen([me.x, me.y]);
      g.beginPath(); g.arc(x, y, 10, 0, TAU); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = 'rgba(11, 12, 24, .55)'; g.stroke();
      g.beginPath(); g.arc(x, y, 6, 0, TAU); g.fillStyle = '#e86a35'; g.fill();
    }
    onView?.(t);
  }

  // pointers: one drags, two pinch (zoom about their middle, and follow it); a still single press is a tap on the pins
  const pointers = new Map();
  let start = null, dragged = false;
  const at = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  canvas.addEventListener('pointerdown', (e) => {
    try { canvas.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer */ }
    onTouch?.();
    const p = at(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) { start = p; dragged = false; } else dragged = true;
  });
  canvas.addEventListener('pointermove', (e) => {
    const before = pointers.get(e.pointerId);
    if (!before) return;
    const p = at(e);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()], od = Math.hypot(a[0] - b[0], a[1] - b[1]), om = mid(a, b);
      pointers.set(e.pointerId, p);
      const [c, d] = [...pointers.values()], nd = Math.hypot(c[0] - d[0], c[1] - d[1]), nm = mid(c, d);
      dragged = true;
      view = panBy(view, nm[0] - om[0], nm[1] - om[1], w, h);
      if (od > 5) view = zoomAbout(view, nd / od, nm, w, h);
      schedule();
      return;
    }
    pointers.set(e.pointerId, p);
    if (start && Math.hypot(p[0] - start[0], p[1] - start[1]) > 8) dragged = true;
    if (pointers.size === 1) { view = panBy(view, p[0] - before[0], p[1] - before[1], w, h); schedule(); }
  });
  function end(e, cancelled) {
    if (!pointers.has(e.pointerId)) return;
    const tap = !cancelled && !dragged && pointers.size === 1, p = at(e);
    pointers.delete(e.pointerId);
    if (cancelled) dragged = true;
    if (tap) { const hits = pinsAt(pins, p[0], p[1]); if (hits.length) onSelect?.(hits); }
  }
  canvas.addEventListener('pointerup', (e) => end(e, false));
  canvas.addEventListener('pointercancel', (e) => end(e, true));
  canvas.addEventListener('lostpointercapture', (e) => end(e, true));
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);   // a mouse notch (100) is the 2D 1.2
    view = zoomAbout(view, Math.exp(-clamp(dy, -100, 100) * 0.00182), at(e), w, h);
    schedule();
  }, { passive: false });
  // keys on the focused map: + / - zoom, the arrows pan (kept from the 3D controls behind the dialog)
  canvas.addEventListener('keydown', (e) => {
    const k = e.key, moves = { ArrowLeft: [60, 0], ArrowRight: [-60, 0], ArrowUp: [0, 60], ArrowDown: [0, -60] };
    if (k === '+' || k === '=') api.zoomBy(STEP);
    else if (k === '-' || k === '_') api.zoomBy(1 / STEP);
    else if (moves[k]) { view = panBy(view, moves[k][0], moves[k][1], w, h); schedule(); }
    else return;
    e.preventDefault(); e.stopPropagation();
  });
  const observer = win.ResizeObserver ? new win.ResizeObserver(() => { if (resize()) draw(); }) : null;
  observer?.observe(canvas);

  const api = {
    draw: schedule, drawNow: draw, resize() { resize(); },
    zoomBy(k) { if (w) view = zoomAbout(view, k, [w / 2, h / 2], w, h); else view = { ...view, zoom: clamp(view.zoom * k, ZOOM_MIN, ZOOM_MAX) }; schedule(); },
    reset() { view = home(); selected = null; schedule(); },
    showAll() { view = home(); schedule(); },   // 전체 보기: the whole county, the picked district still outlined
    select(d) {
      selected = d ? shapes.find((s) => s.area === d.area) || null : null;
      view = selected && w ? fitView(d.bounds, world, w, h) : home();
      schedule();
    },
    get view() { return mapTransform(view, w || 1, h || 1); },
    get pins() { return pins; },
    get ready() { return ready; },
    destroy() { observer?.disconnect(); },
  };
  return api;
}

/**
 * createMapDialog(doc, ctx) -> {open(kind, data), hide(), close(), isOpen, view, map}. open('map' | 'search' | 'nearby',
 * {only}) shows that view (`only`: a fixed nearby list); hide() is the controller's hideDialog (idempotent, no onClose);
 * close() is the player's way out (×, Escape, a tap beside the panel, 계속 탐방하기). ctx:
 *   root, returnFocus      #app (its other children go inert) and the canvas (focus on close)
 *   places, districts      the mapped places (with point) and world.json's districts
 *   image                  the county picture (URL or the minimap's <img>)
 *   getState(), player()   the shared save state (discovered); the player {x, y}
 *   where()                the player's district line for the header (현재 위치 · …)
 *   reachable(place)       already close enough to visit (2D canVisit)
 *   ctl                    the game controller: goTo(id), open('place', …), sound (click, move)
 *   onClose()              the dialog asks to close (ctl.close)
 */
export function createMapDialog(doc, ctx) {
  const $ = (id) => doc.getElementById(id);
  const scrim = $('map-dialog'), panel = $('map-panel'), side = $('map-side');
  const zoomLabel = $('map-zoom'), zoomIn = $('map-in'), zoomOut = $('map-out'), note = panel.querySelector('.map-note');
  const sound = ctx.ctl?.sound || QUIET;
  const byId = new Map(ctx.places.map((p) => [p.id, p]));
  const all = PLACES.map((p) => byId.get(p.id) || p);   // every place, the mapped ones with their point
  const stories = PLACES.filter((p) => p.remote);
  const districts = districtList(ctx.districts || [], ctx.places);
  const tabs = MAP_KINDS.map((k) => $('mtab-' + k)), panes = Object.fromEntries(MAP_KINDS.map((k) => [k, $('mview-' + k)]));
  const from = () => { const p = ctx.player?.(); return p ? [p.x, p.y] : null; };
  let view = 'map', openNow = false, district = '';

  // 찾아가기 (2D goToPlace -> navigate): in reach opens the place as a visit; otherwise the controller heads there (a
  // story-only place opens its story instead). The trip sounds `move`, as the 2D travel buttons
  function go(p) {
    const near = !p.remote && !!ctx.reachable?.(p);
    sound.play(p.remote || near ? 'click' : 'move');
    if (near) ctx.ctl.open('place', { place: p, physical: true });
    else ctx.ctl.goTo(p.id);
  }

  const map = createCountyMap($('county-canvas'), {
    image: ctx.image, places: ctx.places, districts: districts.map((d) => d.district), player: ctx.player,
    onSelect: (hits) => { if (hits.length > 1) { sound.play('click'); select('nearby', { only: hits }); } else go(hits[0]); },
    onTouch: () => note.classList.add('away'),   // the 2D hint steps aside once the map is in hand
    onView: (t) => { zoomLabel.textContent = Math.round(t.zoom * 100) + '%'; zoomOut.disabled = t.zoom <= ZOOM_MIN; zoomIn.disabled = t.zoom >= ZOOM_MAX; },
  });
  const search = createSearch(panes.search, { doc, all, go });
  const nearby = createNearby(panes.nearby, { doc, all, from, found: () => ctx.getState().discovered, reachable: ctx.reachable, go, sound });
  zoomIn.onclick = () => { sound.play('click'); map.zoomBy(STEP); };
  zoomOut.onclick = () => { sound.play('click'); map.zoomBy(1 / STEP); };
  $('map-reset').onclick = () => { sound.play('click'); map.showAll(); };

  // ---- the 지도 view's side: 지역 목록, the chosen district's places, the legend, the story-only cards
  const heading = el('h3', { className: 'results-head', id: 'county-results-heading' }, '전체 지역의 장소');
  const results = el('div', { className: 'county-results', id: 'county-results' });
  const districtButtons = el('div', { className: 'districts', role: 'group', 'aria-label': '지역 목록' },
    el('button', { type: 'button', dataset: { district: '' }, 'aria-pressed': 'true', onclick: () => pick('') }, '전체 지역'),
    districts.map((d) => el('button', { type: 'button', dataset: { district: d.area }, 'aria-pressed': 'false', onclick: () => pick(d.area) }, d.label)));
  const legend = el('details', { className: 'map-more map-legend', id: 'map-legend' }, el('summary', {}, '장소 아이콘 알아보기'),
    el('div', { className: 'legend-list' }, [...new Set(PLACES.map(symbolKey))].map((k) => el('span', { className: 'legend-item' }, symbolIcon(doc, { symbol: k }), SYMBOLS[k].label))));
  const card = (p) => el('article', { className: 'story-card', dataset: { story: p.id } },
    el('img', { src: heroImage(p) || undefined, alt: p.caption || '', loading: 'lazy', decoding: 'async' }),
    el('div', { className: 'story-body' },
      el('span', { className: 'row-tag' }, `${p.area} · ${symbolFor(p).label}`),
      el('h4', {}, p.name), el('p', {}, p.blurb),
      el('button', { type: 'button', className: 'btn btn-grad', dataset: { travel: p.id }, onclick: () => go(p) }, '이야기 만나기 →')));
  const storyBox = stories.length ? el('details', { className: 'map-more map-stories', id: 'map-stories' }, el('summary', {}, '우리 고장의 문화 이야기'), el('div', { className: 'story-grid' }, stories.map(card))) : null;
  side.replaceChildren(el('h3', {}, '지역 목록'), districtButtons, heading, results, legend, storyBox,
    el('button', { type: 'button', className: 'btn', id: 'map-back', onclick: () => { sound.play('click'); close(); } }, '계속 탐방하기'));

  function fill() {
    const list = nearbyPlaces(ctx.places, { district, from: from() });
    heading.textContent = `${district || '전체 지역'} · ${list.length}곳`;
    results.replaceChildren(...list.map((p) => el('button', { type: 'button', className: 'county-place', dataset: { countyPlace: p.id }, onclick: () => go(p) },
      symbolIcon(doc, p), el('span', { className: 'cp-text' }, el('strong', {}, p.name), el('small', {}, `${p.area} · ${p.category}`)), el('span', { className: 'cp-go', 'aria-hidden': 'true' }, '↗'))));
  }
  function pick(area) {
    sound.play('click');
    district = area;
    for (const b of districtButtons.children) b.setAttribute('aria-pressed', String(b.dataset.district === area));
    fill();
    map.select(districts.find((d) => d.area === area) || null);
  }

  // ---- views (ARIA tabs: arrows, Home and End move between them)
  function select(name, data = {}) {
    view = MAP_KINDS.includes(name) ? name : 'map';
    panel.dataset.view = view;
    tabs.forEach((b, i) => { const on = MAP_KINDS[i] === view; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    for (const [k, p] of Object.entries(panes)) p.hidden = k !== view;
    if (view === 'map') { map.resize(); map.drawNow(); }
    else if (view === 'nearby') nearby.show({ only: data.only });
  }
  tabs.forEach((b, i) => { b.onclick = () => { sound.play('click'); select(MAP_KINDS[i]); if (MAP_KINDS[i] === 'search') search.focus(); }; });
  $('map-tabs').addEventListener('keydown', (e) => {
    const i = MAP_KINDS.indexOf(view), n = MAP_KINDS.length;
    const to = { ArrowRight: (i + 1) % n, ArrowLeft: (i + n - 1) % n, Home: 0, End: n - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    select(MAP_KINDS[to]);
    tabs[to].focus({ preventScroll: true });
  });

  function open(kind = 'map', data = {}) {
    openNow = true;
    $('map-where').textContent = '현재 위치 · ' + (ctx.where?.() || '홍성군');
    search.reset(); nearby.reset();
    legend.open = false; if (storyBox) storyBox.open = false;
    district = '';
    for (const b of districtButtons.children) b.setAttribute('aria-pressed', String(b.dataset.district === ''));
    fill();
    map.reset();
    note.classList.remove('away');
    scrim.hidden = false;
    side.scrollTop = 0;
    openModal(panel, { root: ctx.root, returnFocus: ctx.returnFocus, onClose: close });
    select(kind, data);
    if (view === 'search') search.focus(); else tabs[MAP_KINDS.indexOf(view)].focus({ preventScroll: true });
  }
  function hide() {
    if (!openNow) return;
    openNow = false;
    scrim.hidden = true;
    closeModal(panel);
  }
  function close() {
    if (!openNow) return;
    hide();
    ctx.onClose?.();
  }
  $('map-close').onclick = close;
  scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) close(); });

  return { open, hide, close, map, get isOpen() { return openNow; }, get view() { return view; } };
}
