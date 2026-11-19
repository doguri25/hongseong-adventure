// Ground painter shared by the worker and the main-thread fallback. No Three.js, no DOM globals:
// every canvas comes from the `mk(w, h)` factory the caller supplies. Coordinates are game-frame metres
// (x east, y south); canvas row 0 is the smallest y (north). Ported from spike/3d-naepo/src/main.js.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export const ROAD = {
  motorway: [24, '#585b60', 1], trunk: [20, '#5a5d62', 1], primary: [16, '#5c5f64', 1], secondary: [13, '#5f6267', 1], tertiary: [10, '#64676b', 1],
  motorway_link: [9, '#5c5f64', 1], trunk_link: [9, '#5c5f64', 1], primary_link: [8, '#5f6267', 1], secondary_link: [8, '#5f6267', 1], tertiary_link: [7, '#64676b', 1],
  unclassified: [7, '#6a6c70', 1], residential: [7, '#6b6d71', 1], living_street: [6, '#7a7a78', 1], service: [4.5, '#76787a', 1], pedestrian: [6, '#d9cdb4', 0],
  track: [3.2, '#b7a27a', 0], path: [2, '#d8cba9', 0], footway: [2.2, '#ddd0b2', 0], cycleway: [2.4, '#c58d7a', 0], steps: [2, '#cbbfa8', 0], construction: [6, '#b9ad94', 0],
};
export const LANDUSE = {
  residential: '#d5d0c3', commercial: '#d9cbc2', retail: '#d9cbc2', industrial: '#cbc7c1', construction: '#cbb894', greenfield: '#b4c784', brownfield: '#bdb197',
  park: '#8ec266', garden: '#93c46c', pitch: '#6fb257', playground: '#c9bf92', wood: '#4d773b', forest: '#4d773b', scrub: '#6f8f4a', farmland: '#a7c564',
  farmyard: '#c7bc90', bare_rock: '#a49e90', cemetery: '#9db787', religious: '#d6ccbc', grass: '#9cc56a', meadow: '#a8c86e', landfill: '#b2a78a', school: '#d8cfbd',
};
export const SEA_COLOR = '#3f86b3';
export const MEADOW_COLOR = '#93b65e';

export function landuseColor(t) { return LANDUSE[t.landuse] || LANDUSE[t.leisure] || LANDUSE[t.natural] || LANDUSE[t.amenity] || null; }
export const isWater = (t) => t.natural === 'water' || t.landuse === 'reservoir' || t.landuse === 'basin' || t.waterway === 'riverbank';

const TAG_KEYS = ['highway', 'area', 'landuse', 'leisure', 'natural', 'amenity', 'waterway', 'railway', 'water'];
// Only the fields the painter reads, so the worker message stays small.
export function slimFeatures(features) {
  return features.map((f) => {
    const tags = {};
    for (const k of TAG_KEYS) if (f.tags[k] !== undefined) tags[k] = f.tags[k];
    return { kind: f.kind, tags, points: f.points, holes: f.holes, bounds: f.bounds };
  });
}
export function slimBuildings(buildings) { return buildings.map((b) => ({ ring: b.ring, bounds: b.bounds })); }

// DEM masks, one pixel per height node. alpha = forest / paddy weight.
export function makeMasks(grid, data, mk) {
  const { w, h, cell } = grid;
  const forestM = mk(w, h), paddyM = mk(w, h);
  const fg = forestM.getContext('2d'), pg = paddyM.getContext('2d');
  const fi = fg.createImageData(w, h), pi = pg.createImageData(w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i, ht = data[k];
    const dx = (data[j * w + Math.min(w - 1, i + 1)] - data[j * w + Math.max(0, i - 1)]) / (2 * cell);
    const dy = (data[Math.min(h - 1, j + 1) * w + i] - data[Math.max(0, j - 1) * w + i]) / (2 * cell);
    const s = Math.hypot(dx, dy);
    const forest = Math.max(smooth(0.09, 0.16, s) * smooth(24, 40, ht), smooth(55, 80, ht));
    const paddy = (1 - forest) * smooth(0.045, 0.02, s) * smooth(55, 32, ht);
    fi.data[k * 4 + 3] = forest * 255; pi.data[k * 4 + 3] = paddy * 255;
  }
  fg.putImageData(fi, 0, 0); pg.putImageData(pi, 0, 0);
  return { forestM, paddyM, cell, w, h };
}

export function makePatterns(mk) {
  const tile = (px, paint) => { const c = mk(px, px); paint(c.getContext('2d'), px); return c; };
  const meadow = tile(512, (g, n) => {
    g.fillStyle = MEADOW_COLOR; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 900; i++) { const r = hash(i * 3.7); g.globalAlpha = 0.35; g.fillStyle = r < 0.5 ? '#86aa52' : '#a2c26b'; g.beginPath(); g.arc(hash(i * 1.3) * n, hash(i * 2.9) * n, 8 + r * 34, 0, 7); g.fill(); }
    g.globalAlpha = 0.5;
    for (let i = 0; i < 9000; i++) { g.fillStyle = i % 2 ? '#7fa24b' : '#a9c874'; g.fillRect(hash(i * 5.1) * n, hash(i * 6.7) * n, 1.4, 1.4); }
    g.globalAlpha = 1;
  });
  const forest = tile(512, (g, n) => {
    g.fillStyle = '#466e36'; g.fillRect(0, 0, n, n);
    const tones = ['#3b622e', '#557f40', '#436a33', '#4f7a3c', '#365a2b', '#5f8a46'];
    for (let i = 0; i < 2600; i++) {
      const x = hash(i * 4.1) * n, y = hash(i * 7.7) * n, r = 6 + hash(i * 9.3) * 12;
      g.fillStyle = '#2c4a24'; g.beginPath(); g.arc(x + 2, y + 2.5, r, 0, 7); g.fill();
      g.fillStyle = tones[i % tones.length]; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  });
  const paddy = tile(1024, (g, n) => {
    g.fillStyle = '#7e9b47'; g.fillRect(0, 0, n, n);
    const tones = ['#a7c964', '#98bd55', '#b2cf6f', '#8fb64e', '#bcc97c', '#a3c35f'];
    const m = n / 480; let y = 0, row = 0;
    while (y < n) {
      const h = 30 * m; let x = 0, col = 0;
      while (x < n) {
        let w = (34 + hash(row * 31 + col * 7.3) * 46) * m; if (n - x - w < 30 * m) w = n - x;
        g.fillStyle = tones[Math.floor(hash(row * 13.1 + col * 3.3) * tones.length)]; g.fillRect(x + 0.9 * m, y + 0.9 * m, w - 1.8 * m, h - 1.8 * m);
        g.globalAlpha = 0.18; g.fillStyle = '#6f9a3c';
        for (let s = 2.5 * m; s < h - 2 * m; s += 1.6 * m) g.fillRect(x + 1.5 * m, y + s, w - 3 * m, 0.35 * m);
        g.globalAlpha = 1; x += w; col++;
      }
      y += h; row++;
    }
  });
  return { meadow: [meadow, 160], forest: [forest, 96], paddy: [paddy, 480] };
}

// ctx: 2D context of a canvas covering [x0, x0+wx] x [y0, y0+wy] (game-frame metres).
// opts: {features, buildings, masks, patterns, fine, mk}
export function paintRegion(ctx, x0, y0, wx, wy, opts) {
  const { features: F, buildings = [], masks, patterns: P, fine, mk } = opts;
  const g = ctx, cw = g.canvas.width, ch = g.canvas.height, sx = cw / wx, sy = ch / wy;
  const x1 = x0 + wx, y1 = y0 + wy;
  const near = (b, pad = 30) => b[2] >= x0 - pad && b[0] <= x1 + pad && b[3] >= y0 - pad && b[1] <= y1 + pad;
  const world = () => g.setTransform(sx, 0, 0, sy, -x0 * sx, -y0 * sy);
  const pattern = (target, [tile, metres], angle = 0) => {
    const p = target.createPattern(tile, 'repeat');
    p.setTransform(new DOMMatrix().translateSelf(-x0 * sx, -y0 * sy).scaleSelf(sx, sy).rotateSelf(angle).scaleSelf(metres / tile.width));
    return p;
  };
  const scratch = P._scratch && P._scratch.width === cw && P._scratch.height === ch ? P._scratch : (P._scratch = mk(cw, ch));
  const masked = (mask, pat, angle) => {
    const lg = scratch.getContext('2d');
    lg.setTransform(1, 0, 0, 1, 0, 0); lg.globalCompositeOperation = 'source-over'; lg.clearRect(0, 0, cw, ch);
    lg.fillStyle = pattern(lg, pat, angle); lg.fillRect(0, 0, cw, ch);
    lg.globalCompositeOperation = 'destination-in'; lg.imageSmoothingEnabled = true;
    lg.drawImage(mask, x0 / masks.cell + 0.5, y0 / masks.cell + 0.5, wx / masks.cell, wy / masks.cell, 0, 0, cw, ch);
    lg.globalCompositeOperation = 'source-over';
    return scratch;
  };

  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.setLineDash([]);
  g.fillStyle = pattern(g, P.meadow); g.fillRect(0, 0, cw, ch);
  g.drawImage(masked(masks.paddyM, P.paddy, 12), 0, 0);
  g.drawImage(masked(masks.forestM, P.forest), 0, 0);
  world();

  const ring = (pts) => { pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); };
  const path = (pts, close) => { g.beginPath(); ring(pts); if (close) g.closePath(); };
  const poly = (f) => { g.beginPath(); ring(f.points); g.closePath(); for (const h of f.holes) { ring(h); g.closePath(); } };
  const fillPoly = (f) => { poly(f); g.fill('evenodd'); };
  const strokePx = (w) => w * Math.min(sx, sy);

  // landuse, leisure, natural areas
  for (const f of F) {
    if (f.kind !== 'landuse' || !near(f.bounds)) continue;
    const t = f.tags; if (t.highway || isWater(t)) continue;
    const col = landuseColor(t); if (!col) continue;
    g.fillStyle = ['wood', 'forest'].includes(t.landuse) || ['wood', 'scrub'].includes(t.natural) ? pattern(g, P.forest) : col;
    fillPoly(f);
    if (t.leisure === 'pitch') { g.strokeStyle = '#e8f2dc'; g.lineWidth = 1.2; g.stroke(); }
  }
  world();
  // water (the sea carries holes for land and islands, so fill evenodd) with a sandy shore
  g.lineCap = g.lineJoin = 'round';
  for (const f of F) {
    if (f.kind !== 'water' && !(f.kind === 'landuse' && isWater(f.tags))) continue;
    if (!near(f.bounds)) continue;
    g.fillStyle = SEA_COLOR; fillPoly(f);
    g.strokeStyle = '#c9c39f'; g.lineWidth = 3; g.stroke();
  }
  // waterways
  for (const f of F) {
    const t = f.tags; if (!t.waterway || t.waterway === 'riverbank' || f.kind === 'water' || !near(f.bounds)) continue;
    const w = t.waterway === 'river' ? 16 : t.waterway === 'stream' ? 6 : 3.5;
    path(f.points); g.strokeStyle = '#b9c49a'; g.lineWidth = w + 4; g.stroke(); g.strokeStyle = '#4a8fbb'; g.lineWidth = w; g.stroke();
  }
  // building footprints (ambient shadow of the filler buildings)
  g.fillStyle = '#9d978c'; g.strokeStyle = '#b8b1a4'; g.lineWidth = 3;
  for (const b of buildings) { if (!near(b.bounds)) continue; path(b.ring, true); g.fill(); g.stroke(); }

  // roads: casing, kerb (fine only), fill, markings (fine only)
  const roads = [];
  for (const f of F) {
    if (f.kind !== 'road') continue;
    const r = ROAD[f.tags.highway]; if (!r || !near(f.bounds)) continue;
    if (strokePx(r[0]) < 0.18) continue;   // sub-pixel tracks add cost, not detail, at coarse levels
    roads.push(f);
  }
  roads.sort((a, b) => ROAD[a.tags.highway][0] - ROAD[b.tags.highway][0]);
  for (const f of roads) { const [w, , cased] = ROAD[f.tags.highway]; if (!cased) continue; path(f.points, f.tags.area === 'yes'); g.strokeStyle = '#cfc8b4'; g.lineWidth = w + 3.4; g.stroke(); }
  if (fine) for (const f of roads) { const [w, , cased] = ROAD[f.tags.highway]; if (!cased) continue; path(f.points); g.strokeStyle = '#a9a394'; g.lineWidth = w + 0.5; g.stroke(); }
  for (const f of roads) { const [w, col] = ROAD[f.tags.highway]; path(f.points, f.tags.area === 'yes'); g.strokeStyle = col; g.lineWidth = w; g.stroke(); }
  if (fine) {
    g.lineCap = 'butt';
    for (const f of roads) {
      const h = f.tags.highway, major = ['primary', 'secondary', 'trunk', 'motorway'].includes(h), minor = ['tertiary', 'residential', 'unclassified'].includes(h);
      if (!major && !minor) continue;
      path(f.points); g.setLineDash(major ? [] : [3, 5]); g.strokeStyle = major ? '#e7c445' : '#ecebe4'; g.lineWidth = major ? 0.35 : 0.22; g.stroke();
    }
    g.setLineDash([]); g.lineCap = 'round';
    const rnd = (k) => hash(k + x0 * 0.013 + y0 * 0.007);
    g.globalAlpha = 0.08;
    for (let k = 0; k < 2200; k++) { g.fillStyle = k % 2 ? '#2d2f33' : '#9a9a96'; g.fillRect(x0 + rnd(k * 1.7) * wx, y0 + rnd(k * 2.3) * wy, 0.6 + rnd(k * 3.1) * 2.4, 0.3 + rnd(k * 4.9) * 0.8); }
    g.globalAlpha = 1;
  }
  // railways
  for (const f of F) {
    if (f.tags.railway !== 'rail' || !near(f.bounds)) continue;
    path(f.points); g.strokeStyle = '#8b8a8d'; g.lineWidth = 5; g.stroke();
    g.setLineDash([0.5, 1.6]); g.strokeStyle = '#5b4a3b'; g.lineWidth = 3.8; g.stroke();
    g.setLineDash([]); g.strokeStyle = '#c8c8cc'; g.lineWidth = 0.35; g.stroke();
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
}

// Deterministic tiling noise for the terrain detail multiply (spike noiseCanvas), via the canvas factory.
export function noiseCanvas(mk, size, scale, seed) {
  const c = mk(size, size), g = c.getContext('2d'), img = g.createImageData(size, size);
  const n = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453; return s - Math.floor(s); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const val = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, w = (v) => ((v % (size / scale)) + size / scale) % (size / scale);
    const a = n(w(xi), w(yi)), b = n(w(xi + 1), w(yi)), c2 = n(w(xi), w(yi + 1)), d = n(w(xi + 1), w(yi + 1)), u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return lerp(lerp(a, b, u), lerp(c2, d, u), v);
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0, amp = 0.5, f = 1 / scale;
    for (let o = 0; o < 4; o++) { v += val(x * f, y * f) * amp; amp *= 0.5; f *= 2; }
    const k = (y * size + x) * 4, b = Math.round(v * 255); img.data[k] = img.data[k + 1] = img.data[k + 2] = b; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
