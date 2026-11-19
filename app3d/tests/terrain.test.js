import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HeightField } from '../src/world/heightfield.js';
import { Terrain, buildChunkGeometry } from '../src/world/terrain.js';

const field = () => {
  const grid = { w: 321, h: 161, cell: 25 }; // 8000 x 4000 m
  const d = new Float32Array(grid.w * grid.h);
  for (let j = 0; j < grid.h; j++) for (let i = 0; i < grid.w; i++) d[j * grid.w + i] = 10 + i * 0.05;
  return new HeightField(grid, d);
};

test('top faces point up, skirts point outward and hang 20 m', () => {
  const f = field(), g = buildChunkGeometry(f, 0, 0, 2000, 2000, 100);
  const p = g.attributes.position.array, ix = g.index.array, n = 21 * 21;
  let skirts = 0;
  for (let t = 0; t < ix.length; t += 3) {
    const [a, b, c] = [ix[t], ix[t + 1], ix[t + 2]].map(k => new THREE.Vector3(p[k * 3], p[k * 3 + 1], p[k * 3 + 2]));
    const nrm = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    if (ix[t] < n && ix[t + 1] < n && ix[t + 2] < n) assert.ok(nrm.y > 0.9);
    else {
      skirts++;
      const m = a.clone().add(b).add(c).divideScalar(3);
      assert.ok(Math.abs(nrm.y) < 1e-6);
      const out = nrm.x * (m.x - 1000) + nrm.z * (m.z - 1000);
      assert.ok(out > 0, 'skirt faces outward');
    }
  }
  assert.equal(skirts, 4 * 20 * 2);
  assert.ok(Math.abs((p[0 * 3 + 1] - p[n * 3 + 1]) - 20) < 1e-4);
});

test('lazy chunks, LOD by distance, dispose beyond 14 km', () => {
  const f = field(), scene = new THREE.Scene(), t = new Terrain(scene, f, new THREE.MeshStandardMaterial());
  assert.equal(scene.children.length, 0);
  const cam = new THREE.Vector3();
  const c0 = t.chunks[0];
  cam.set(c0.cx, 0, c0.cz);
  t.update(cam, Infinity);
  assert.ok(scene.children.length > 0);
  assert.equal(c0.lod, 0);
  const far = t.chunks.find(c => Math.hypot(c.cx - cam.x, c.cz - cam.z) > 5000);
  assert.equal(far.lod, 1);
  const before = c0.mesh.geometry;
  t.update(cam, Infinity);
  assert.equal(c0.mesh.geometry, before, 'no rebuild if band unchanged');
  assert.equal(c0.mesh.receiveShadow, true);
  cam.set(c0.cx + 20000, 0, c0.cz);
  t.update(cam, Infinity);
  assert.equal(c0.mesh, null);
});
