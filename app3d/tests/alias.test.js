import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// R8: the 3D app reaches the 2D game's modules and assets only through the `#game/*` alias (root package.json
// "imports"), which points at the frozen 2D in app2d/ (phase 2b moved it there from dist/, now the build output).
const app3d = new URL('../', import.meta.url);
const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? files(new URL(d.name + '/', dir)) : /\.(m?js|html)$/.test(d.name) ? [new URL(d.name, dir)] : []);

test('#game/* resolves to the 2D game in Node', () => {
  assert.ok(fileURLToPath(import.meta.resolve('#game/core.js')).endsWith('/app2d/core.js'));
  assert.ok(fileURLToPath(import.meta.resolve('#game/assets/npc-v12.png')).endsWith('/app2d/assets/npc-v12.png'));
});

test('no app3d file reaches into app2d/ or the built dist/ by a relative path', () => {
  const bad = [];
  for (const f of [...files(new URL('src/', app3d)), ...files(new URL('tests/', app3d)), new URL('vite.config.js', app3d), new URL('index.html', app3d)]) {
    const text = readFileSync(f, 'utf8');
    if (/['"`](\.\.?\/)+(app2d|dist)\//.test(text)) bad.push(fileURLToPath(f));
  }
  assert.deepEqual(bad, []);
});
