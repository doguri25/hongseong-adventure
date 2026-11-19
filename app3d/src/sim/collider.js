// Footprint collider (pure, game frame: x east, y south, metres). Circles slide along building walls.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function inRing(x, y, r) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i], b = r[j];
    if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

export function ringArea(r) {
  let s = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return s / 2;
}

export function bboxOf(r) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of r) {
    if (p[0] < b[0]) b[0] = p[0]; if (p[1] < b[1]) b[1] = p[1];
    if (p[0] > b[2]) b[2] = p[0]; if (p[1] > b[3]) b[3] = p[1];
  }
  return b;
}

function closest(r, x, y) {
  let best = Infinity, bx = 0, by = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[j], b = r[i], dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
    const t = l ? clamp(((x - a[0]) * dx + (y - a[1]) * dy) / l, 0, 1) : 0;
    const qx = a[0] + dx * t, qy = a[1] + dy * t, d = Math.hypot(x - qx, y - qy);
    if (d < best) { best = d; bx = qx; by = qy; }
  }
  return [best, bx, by];
}

export function createCollider(rings) {
  const C = 80, grid = new Map(), key = (i, j) => i * 100000 + j;
  const polys = rings.map((r) => ({ r, bb: bboxOf(r) }));
  polys.forEach((p, n) => {
    for (let i = Math.floor(p.bb[0] / C); i <= Math.floor(p.bb[2] / C); i++)
      for (let j = Math.floor(p.bb[1] / C); j <= Math.floor(p.bb[3] / C); j++) {
        const k = key(i, j);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(n);
      }
  });
  const near = (x, y, pad) => {
    const out = new Set();
    for (let i = Math.floor((x - pad) / C); i <= Math.floor((x + pad) / C); i++)
      for (let j = Math.floor((y - pad) / C); j <= Math.floor((y + pad) / C); j++)
        for (const n of grid.get(key(i, j)) || []) out.add(n);
    return out;
  };
  return {
    rings,
    resolve(x, y, radius) {
      let hit = false, nx = 0, ny = 0;
      for (let it = 0; it < 4; it++) {
        let moved = false;
        for (const n of near(x, y, radius + 2)) {
          const p = polys[n];
          if (x < p.bb[0] - radius || x > p.bb[2] + radius || y < p.bb[1] - radius || y > p.bb[3] + radius) continue;
          const inside = inRing(x, y, p.r), [d, qx, qy] = closest(p.r, x, y);
          if (!inside && d >= radius) continue;
          let ux = x - qx, uy = y - qy;
          const l = Math.hypot(ux, uy) || 1e-6;
          ux /= l; uy /= l;
          if (inside) { ux = -ux; uy = -uy; }
          x = qx + ux * (radius + 0.01); y = qy + uy * (radius + 0.01);
          nx += ux; ny += uy; hit = moved = true;
        }
        if (!moved) break;
      }
      const l = Math.hypot(nx, ny) || 1;
      return { x, y, hit, nx: nx / l, ny: ny / l };
    },
    containing(x, y) {
      for (const n of near(x, y, 0)) if (inRing(x, y, polys[n].r)) return polys[n].r;
      return null;
    },
    distance(ring, x, y) { return inRing(x, y, ring) ? 0 : closest(ring, x, y)[0]; },
    blocked(x, y, pad = 0) {
      for (const n of near(x, y, pad + 1)) {
        const p = polys[n];
        if (inRing(x, y, p.r) || (pad && closest(p.r, x, y)[0] < pad)) return true;
      }
      return false;
    },
  };
}
