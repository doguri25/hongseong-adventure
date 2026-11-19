import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { decodeFeatures, decodeBuildings, terrariumHeight } from '../src/data/decode.js';
import { project, BOUNDS } from '../src/frame.js';

const dir = new URL('../public/data/', import.meta.url);
const read = (n) => readFileSync(new URL(n, dir));
const readJson = (n) => JSON.parse(read(n).toString('utf8'));

// Minimal decoder for 8-bit RGB(A), non-interlaced PNG (filters 0-4).
function decodePng(buf) {
  let pos = 8, w = 0, h = 0, ch = 3; const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = body.readUInt32BE(0); h = body.readUInt32BE(4);
      assert.equal(body[8], 8, 'bit depth'); assert.equal(body[12], 0, 'not interlaced');
      ch = body[9] === 6 ? 4 : 3; assert.ok(body[9] === 2 || body[9] === 6, 'RGB(A)');
    } else if (type === 'IDAT') idat.push(body);
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), stride = w * ch, out = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? out[y * stride + i - ch] : 0, b = y ? out[(y - 1) * stride + i] : 0, c = i >= ch && y ? out[(y - 1) * stride + i - ch] : 0;
      let v = raw[src + i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[y * stride + i] = v & 255;
    }
  }
  return { width: w, height: h, ch, data: out };
}

const world = readJson('world.json');
const features = decodeFeatures(readJson('features.json'));
const buildings = decodeBuildings(readJson('buildings.json'));
const png = decodePng(read('heights.png'));
const heightAt = (x, y) => {
  const i = Math.round(x / world.grid.cell), j = Math.round(y / world.grid.cell), o = (j * png.width + i) * png.ch;
  return terrariumHeight(png.data[o], png.data[o + 1], png.data[o + 2]);
};

test('features round-trip the game map', () => {
  assert.equal(features.length, 18668 - 933);
  assert.ok(features.find((f) => f.tags.natural === 'water' && f.holes.length > 0));
  assert.ok(features.every((f) => f.bounds.length === 4 && f.bounds[0] <= f.bounds[2] && f.bounds[1] <= f.bounds[3]));
  assert.ok(features.every((f) => !f.tags.building));
  assert.ok(features.some((f) => f.kind === 'road') && features.some((f) => f.kind === 'rail') && features.some((f) => f.kind === 'waterway'));
});

test('buildings are deduplicated and inside the county', () => {
  // brief guessed >= 2900, but the Naepo export is a subset of the county export and 925 of its ways are already in the game map: the true union is 2081.
  assert.ok(buildings.length >= 2000);
  assert.equal(new Set(buildings.map((b) => b.id)).size, buildings.length);
  const [x0, y0] = project([BOUNDS[0], BOUNDS[3]]), [x1, y1] = project([BOUNDS[2], BOUNDS[1]]);
  assert.ok(buildings.every((b) => b.ring.length >= 4 && b.bounds[0] >= x0 - 50 && b.bounds[2] <= x1 + 50 && b.bounds[1] >= y0 - 50 && b.bounds[3] <= y1 + 50));
  assert.ok(buildings.every((b) => b.tags.building));
});

test('heights grid matches world.json', () => {
  assert.equal(png.width, world.grid.w);
  assert.equal(png.height, world.grid.h);
  assert.equal(world.grid.cell, 25);
  assert.ok(world.heightRange[0] < 0 && world.heightRange[1] > 600);
  assert.equal(world.districts.length > 0, true);
  assert.ok(world.credits.length > 0 && world.terrainLabels.every((l) => typeof l.x === 'number'));
});

test('terrarium decode', () => {
  assert.equal(terrariumHeight(128, 0, 0), 0);
  assert.equal(terrariumHeight(127, 255, 0), -1);
  assert.equal(terrariumHeight(128, 1, 128), 1.5);
});

test('Yongbongsan is a hill', () => {
  const [x, y] = project([126.6493, 36.6437]);
  assert.ok(heightAt(x, y) > 150, `h=${heightAt(x, y)}`);
});
