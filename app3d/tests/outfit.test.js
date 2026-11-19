import test from 'node:test';
import assert from 'node:assert/strict';
import { outfitMatrix, applyMatrix } from '../src/world/outfit.js';
import { OUTFIT_FILTERS } from '../../dist/wardrobe.js';

const close = (a, b, e = 1e-9) => a.every((v, i) => Math.abs(v - b[i]) < e);

test("'none' and empty are the identity", () => {
  const id = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  assert.deepEqual(outfitMatrix('none'), id);
  assert.deepEqual(outfitMatrix(''), id);
  assert.deepEqual(outfitMatrix(undefined), id);
  assert.ok(close(outfitMatrix(OUTFIT_FILTERS.default), id));
});

test('hue-rotate(180deg) maps pure red away from red', () => {
  const [r, g, b] = applyMatrix(outfitMatrix('hue-rotate(180deg)'), [1, 0, 0]);
  assert.ok(r < 0.2 && g + b > r, `${r} ${g} ${b}`);
  assert.ok(close(outfitMatrix('hue-rotate(0deg)'), [1, 0, 0, 0, 1, 0, 0, 0, 1]));
  assert.ok(close(outfitMatrix('hue-rotate(360deg)'), outfitMatrix('hue-rotate(0deg)'), 1e-9));
  assert.ok(close(outfitMatrix('hue-rotate(0.5turn)'), outfitMatrix('hue-rotate(180deg)')));
});

test('saturate(0) makes R=G=B and saturate(1) is the identity', () => {
  const [r, g, b] = applyMatrix(outfitMatrix('saturate(0)'), [0.9, 0.3, 0.1]);
  assert.ok(Math.abs(r - g) < 1e-9 && Math.abs(g - b) < 1e-9);
  assert.ok(close(outfitMatrix('saturate(1)'), [1, 0, 0, 0, 1, 0, 0, 0, 1]));
  assert.ok(close(outfitMatrix('saturate(100%)'), [1, 0, 0, 0, 1, 0, 0, 0, 1]));
});

test('sepia(1) is the W3C sepia matrix; filters compose left to right', () => {
  assert.ok(close(outfitMatrix('sepia(1)'), [0.393, 0.769, 0.189, 0.349, 0.686, 0.168, 0.272, 0.534, 0.131]));
  const both = outfitMatrix('hue-rotate(120deg) saturate(1.2)'), c = [0.8, 0.4, 0.2];
  const step = applyMatrix(outfitMatrix('saturate(1.2)'), applyMatrix(outfitMatrix('hue-rotate(120deg)'), c));
  assert.ok(close(applyMatrix(both, c), step));
});

test('every wardrobe outfit gives a finite matrix; white stays near white for hue and saturate filters', () => {
  for (const [id, f] of Object.entries(OUTFIT_FILTERS)) {
    const m = outfitMatrix(f);
    assert.equal(m.length, 9, id);
    assert.ok(m.every(Number.isFinite), id);
  }
  const w = applyMatrix(outfitMatrix(OUTFIT_FILTERS.ocean), [1, 1, 1]);
  assert.ok(w.every(v => Math.abs(v - 1) < 0.3), String(w));
});
