import * as THREE from 'three';
import { BOUNDS, M_LON, M_LAT, VEX, toRender } from '../frame.js';

const CHUNK = 2000;          // metres per chunk side
const SKIRT = 20;            // metres the skirts hang below every edge
const LOD_SPACING = [25, 50, 100];
const LOD_DIST = [3000, 8000];
const DROP_DIST = 14000;
const W = (BOUNDS[2] - BOUNDS[0]) * M_LON;
const H = (BOUNDS[3] - BOUNDS[1]) * M_LAT;

export function lodFor(dist) { return dist < LOD_DIST[0] ? 0 : dist < LOD_DIST[1] ? 1 : 2; }

// Geometry for one chunk at one LOD. Positions are relative to the chunk's north-west corner
// (render space orientation), normals come from the height field so seams match across LODs.
export function buildChunkGeometry(field, x0, y0, sx, sy, spacing) {
  const nx = Math.max(1, Math.ceil(sx / spacing)), ny = Math.max(1, Math.ceil(sy / spacing));
  const gw = nx + 1, gh = ny + 1, top = gw * gh, nSkirt = 2 * (gw + gh);
  const total = top + nSkirt;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  const nd = field.cell;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const k = j * gw + i, x = x0 + (i / nx) * sx, y = y0 + (j / ny) * sy;
    pos[k * 3] = x - x0; pos[k * 3 + 1] = field.renderY(x, y); pos[k * 3 + 2] = y - y0;
    const gx = (field.heightAt(x + nd, y) - field.heightAt(x - nd, y)) * VEX / (2 * nd);
    const gy = (field.heightAt(x, y + nd) - field.heightAt(x, y - nd)) * VEX / (2 * nd);
    const l = Math.hypot(gx, 1, gy);
    nor[k * 3] = -gx / l; nor[k * 3 + 1] = 1 / l; nor[k * 3 + 2] = -gy / l;
    uv[k * 2] = x / W; uv[k * 2 + 1] = 1 - y / H;
  }
  const idx = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * gw + i, b = a + 1, c = a + gw, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // skirts: walk the border clockwise seen from above; interior is on the same side throughout
  const ring = [];
  for (let i = 0; i < gw - 1; i++) ring.push(i);                          // north, west->east
  for (let j = 0; j < gh - 1; j++) ring.push(j * gw + nx);                // east, north->south
  for (let i = gw - 1; i > 0; i--) ring.push(ny * gw + i);               // south, east->west
  for (let j = gh - 1; j > 0; j--) ring.push(j * gw);                     // west, south->north
  const m = ring.length;
  for (let r = 0; r < m; r++) {
    const s = ring[r], k = top + r;
    pos[k * 3] = pos[s * 3]; pos[k * 3 + 1] = pos[s * 3 + 1] - SKIRT; pos[k * 3 + 2] = pos[s * 3 + 2];
    nor[k * 3] = nor[s * 3]; nor[k * 3 + 1] = nor[s * 3 + 1]; nor[k * 3 + 2] = nor[s * 3 + 2];
    uv[k * 2] = uv[s * 2]; uv[k * 2 + 1] = uv[s * 2 + 1];
  }
  for (let r = 0; r < m; r++) {
    const p = ring[r], q = ring[(r + 1) % m], pb = top + r, qb = top + (r + 1) % m;
    idx.push(p, q, pb, q, qb, pb);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(total > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

export class Terrain {
  constructor(scene, field, material) {
    this.scene = scene; this.field = field; this.material = material;
    this.chunks = [];
    const ex = field.extentX, ey = field.extentY;
    this.cols = Math.ceil(ex / CHUNK); this.rows = Math.ceil(ey / CHUNK);
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const x0 = c * CHUNK, y0 = r * CHUNK, sx = Math.min(CHUNK, ex - x0), sy = Math.min(CHUNK, ey - y0);
      const [cx, cz] = toRender(x0 + sx / 2, y0 + sy / 2);
      this.chunks.push({ x0, y0, sx, sy, cx, cz, lod: -1, mesh: null });
    }
  }

  // cameraRenderPos: {x, z} (a THREE.Vector3 works). `budget` caps geometry builds per call.
  update(cameraRenderPos, budget = 8) {
    const px = cameraRenderPos.x, pz = cameraRenderPos.z;
    const todo = [];
    for (const ch of this.chunks) {
      const d = Math.hypot(ch.cx - px, ch.cz - pz);
      if (d > DROP_DIST) {
        if (ch.mesh) this._drop(ch);
        continue;
      }
      const lod = lodFor(d);
      if (lod !== ch.lod) todo.push({ ch, lod, d });
    }
    todo.sort((a, b) => a.d - b.d);
    for (const { ch, lod } of todo.slice(0, budget)) this._build(ch, lod);
  }

  _build(ch, lod) {
    const geo = buildChunkGeometry(this.field, ch.x0, ch.y0, ch.sx, ch.sy, LOD_SPACING[lod]);
    if (ch.mesh) { ch.mesh.geometry.dispose(); ch.mesh.geometry = geo; }
    else {
      const m = new THREE.Mesh(geo, this.material);
      const [X, Z] = toRender(ch.x0, ch.y0);
      m.position.set(X, 0, Z);
      m.receiveShadow = true;
      m.matrixAutoUpdate = false; m.updateMatrix();
      this.scene.add(m);
      ch.mesh = m;
    }
    ch.lod = lod;
  }

  _drop(ch) {
    this.scene.remove(ch.mesh);
    ch.mesh.geometry.dispose();
    ch.mesh = null; ch.lod = -1;
  }

  dispose() { for (const ch of this.chunks) if (ch.mesh) this._drop(ch); }
}
