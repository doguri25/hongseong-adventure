// Road clearance index (pure, game frame). Clearance = distance to the nearest drivable road edge (centreline minus half width).
export const ROAD_WIDTH = {
  motorway: 24, trunk: 20, primary: 16, secondary: 13, tertiary: 10,
  motorway_link: 9, trunk_link: 9, primary_link: 8, secondary_link: 8, tertiary_link: 7,
  unclassified: 7, residential: 7, living_street: 6, service: 4.5, pedestrian: 6, construction: 6,
  track: 3.2, path: 2, footway: 2.2, cycleway: 2.4, steps: 2,
};
const SKIP = new Set(['track', 'path', 'footway', 'cycleway', 'steps']);

export function roadClearance(features) {
  const C = 60, grid = new Map(), key = (i, j) => i * 100000 + j;
  for (const f of features) {
    if (f.kind !== 'road') continue;
    const hw = ROAD_WIDTH[f.tags.highway];
    if (!hw || SKIP.has(f.tags.highway)) continue;
    const p = f.points;
    for (let k = 1; k < p.length; k++) {
      const a = p[k - 1], b = p[k], s = [a[0], a[1], b[0], b[1], hw / 2];
      const i0 = Math.floor(Math.min(a[0], b[0]) / C), i1 = Math.floor(Math.max(a[0], b[0]) / C);
      const j0 = Math.floor(Math.min(a[1], b[1]) / C), j1 = Math.floor(Math.max(a[1], b[1]) / C);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const kk = key(i, j);
        if (!grid.has(kk)) grid.set(kk, []);
        grid.get(kk).push(s);
      }
    }
  }
  return {
    clearance(x, y) {
      let best = 1e9;
      const i = Math.floor(x / C), j = Math.floor(y / C);
      for (let ii = i - 1; ii <= i + 1; ii++) for (let jj = j - 1; jj <= j + 1; jj++)
        for (const s of grid.get(key(ii, jj)) || []) {
          const dx = s[2] - s[0], dy = s[3] - s[1], l = dx * dx + dy * dy;
          const t = l ? Math.max(0, Math.min(1, ((x - s[0]) * dx + (y - s[1]) * dy) / l)) : 0;
          best = Math.min(best, Math.hypot(x - s[0] - dx * t, y - s[1] - dy * t) - s[4]);
        }
      return best;
    },
  };
}
