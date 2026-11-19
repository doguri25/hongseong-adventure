// Decoders for the compact county data written by tools/3d/prepare_world.py.
// Coordinates are game-frame metres (see ../frame.js); files store integer decimetres, delta-encoded.

export function terrariumHeight(r, g, b) {
  return r * 256 + g + b / 256 - 32768;
}

function walk(flat, q) {
  const pts = [];
  let x = 0, y = 0;
  for (let i = 0; i < flat.length; i += 2) {
    x += flat[i]; y += flat[i + 1];
    pts.push([x * q, y * q]);
  }
  return pts;
}

function boundsOf(pts) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const [x, y] of pts) {
    if (x < a) a = x; if (x > c) c = x;
    if (y < b) b = y; if (y > d) d = y;
  }
  return [a, b, c, d];
}

export function decodeFeatures(json) {
  const q = json.q ?? 0.1;
  return json.items.map((it) => {
    const points = walk(it.p, q);
    return { kind: it.k, tags: it.t, points, holes: (it.h || []).map((h) => walk(h, q)), bounds: boundsOf(points) };
  });
}

export function decodeBuildings(json) {
  const q = json.q ?? 0.1;
  return json.items.map((it) => {
    const ring = walk(it.p, q);
    return { id: it.id, tags: it.t, ring, bounds: boundsOf(ring) };
  });
}
