import * as THREE from 'three';
import { BOUNDS, CX, CY, M_LON, M_LAT, VEX, toRender, project } from '../frame.js';

const lerp = (a, b, t) => a + (b - a) * t;

export function noiseCanvas(size, scale, seed) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), img = g.createImageData(size, size);
  const n = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453; return s - Math.floor(s); };
  const val = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, m = size / scale, w = (v) => ((v % m) + m) % m;
    const a = n(w(xi), w(yi)), b = n(w(xi + 1), w(yi)), c2 = n(w(xi), w(yi + 1)), d = n(w(xi + 1), w(yi + 1)), u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return lerp(lerp(a, b, u), lerp(c2, d, u), v);
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0, amp = 0.5, f = 1 / scale;
    for (let o = 0; o < 4; o++) { v += val(x * f, y * f) * amp; amp *= 0.5; f *= 2; }
    const k = (y * size + x) * 4, b = Math.round(v * 255);
    img.data[k] = img.data[k + 1] = img.data[k + 2] = b; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// height noise -> tangent-space normal map
export function normalMapFromHeight(canvas) {
  const size = canvas.width, g = canvas.getContext('2d'), d = g.getImageData(0, 0, size, size), o = g.createImageData(size, size);
  const h = (a, b) => d.data[(((b + size) % size) * size + ((a + size) % size)) * 4];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = (h(x - 1, y) - h(x + 1, y)) / 255 * 2, ny = (h(x, y - 1) - h(x, y + 1)) / 255 * 2, k = (y * size + x) * 4;
    o.data[k] = 128 + nx * 127; o.data[k + 1] = 128 + ny * 127; o.data[k + 2] = 255; o.data[k + 3] = 255;
  }
  g.putImageData(o, 0, 0);
  return canvas;
}

// Sea plane at Y = 0 plus flat lake meshes. lakeLevels = [{feature, level}] from carveWater.
export function createWater(scene, lakeLevels = [], envMap = null) {
  const normal = new THREE.CanvasTexture(normalMapFromHeight(noiseCanvas(256, 8, 9.7)));
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  const mat = new THREE.MeshStandardMaterial({
    color: 0x2f6f96, roughness: 0.08, metalness: 0.1, normalMap: normal, normalScale: new THREE.Vector2(0.35, 0.35),
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  if (envMap) mat.envMap = envMap;
  const meshes = [];

  const [x0, y0] = project([BOUNDS[0], BOUNDS[3]]), [x1, y1] = project([BOUNDS[2], BOUNDS[1]]);
  const margin = 30000, W = x1 - x0 + 2 * margin, H = y1 - y0 + 2 * margin;
  const seaGeo = new THREE.PlaneGeometry(W, H).rotateX(-Math.PI / 2);
  const uv = seaGeo.attributes.uv, pos = seaGeo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 40, pos.getZ(i) / 40);
  const sea = new THREE.Mesh(seaGeo, mat);
  sea.position.set((x0 + x1) / 2 - CX, 0, (y0 + y1) / 2 - CY); sea.receiveShadow = true; sea.renderOrder = 0;
  scene.add(sea); meshes.push(sea);

  for (const { feature, level } of lakeLevels) {
    let r = feature.points.map((p) => toRender(p[0], p[1]));
    if (r.length > 3 && Math.hypot(r[0][0] - r.at(-1)[0], r[0][1] - r.at(-1)[1]) < 0.5) r.pop();
    if (r.length < 3) continue;
    const shape = new THREE.Shape(r.map((p) => new THREE.Vector2(p[0], -p[1])));
    for (const hole of feature.holes || []) {
      const hr = hole.map((p) => toRender(p[0], p[1]));
      if (hr.length > 3 && Math.hypot(hr[0][0] - hr.at(-1)[0], hr[0][1] - hr.at(-1)[1]) < 0.5) hr.pop();
      if (hr.length >= 3) shape.holes.push(new THREE.Path(hr.map((p) => new THREE.Vector2(p[0], -p[1]))));
    }
    const g = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
    const u = g.attributes.uv, p = g.attributes.position;
    for (let i = 0; i < u.count; i++) u.setXY(i, p.getX(i) / 40, p.getZ(i) / 40);
    const m = new THREE.Mesh(g, mat);
    m.position.y = level * VEX - 0.2; m.receiveShadow = true;
    scene.add(m); meshes.push(m);
  }

  return {
    meshes, material: mat, normalMap: normal,
    update(t) { normal.offset.set(t * 0.012, t * 0.007); },
    dispose() {
      for (const m of meshes) { scene.remove(m); m.geometry.dispose(); }
      mat.dispose(); normal.dispose();
    },
  };
}
