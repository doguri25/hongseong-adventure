// The deploy (phase 2b Task 4): Vercel and GitHub Pages both install with npm ci, build both games into dist/ (the 3D at
// the root, the frozen 2D at 2d/), run both test suites and publish dist/. The root package.json keeps the 2D's
// version, which tests/refresh.test.js compares with RELEASE.version.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const repo = (p) => fs.readFileSync(fileURLToPath(new URL('../../' + p, import.meta.url)), 'utf8');
const pkg = JSON.parse(repo('package.json'));
const pages = repo('.github/workflows/deploy-pages.yml');
// the workflow's `run:` commands in order (one-line runs; a block run's lines are taken one by one)
const runs = (() => {
  const out = [], lines = pages.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*(?:- )?)run: (.*)$/);
    if (!m) continue;
    if (m[2].trim() !== '|') { out.push(m[2].trim()); continue; }
    for (let j = i + 1; j < lines.length && (lines[j].trim() === '' || lines[j].search(/\S/) > m[1].length); j++) if (lines[j].trim()) out.push(lines[j].trim());
  }
  return out;
})();

test('vercel.json installs with npm ci, builds both games and runs both suites, and serves dist/', () => {
  const v = JSON.parse(repo('vercel.json'));
  assert.equal(v.installCommand, 'npm ci');
  assert.equal(v.buildCommand, 'npm run build && npm test && npm run test:3d');
  assert.equal(v.outputDirectory, 'dist');
});

test('the Pages workflow runs on main for the sources of both games and the build, and by hand', () => {
  const push = pages.slice(pages.search(/^on:$/m), pages.search(/^permissions:$/m));
  assert.match(push, /branches: \[main\]/);
  const paths = [...push.matchAll(/^\s+- '([^']+)'$/gm)].map((m) => m[1]);
  assert.deepEqual(paths, ['app2d/**', 'app3d/**', 'tools/build/**', 'tests/**', 'package.json', 'package-lock.json', '.github/workflows/deploy-pages.yml']);
  assert.match(push, /^\s+workflow_dispatch:/m);
});

test('the Pages workflow checks for the 2D source, installs with npm ci, builds, runs both suites and uploads dist/', () => {
  assert.ok(runs.some((r) => r.includes('[ -f app2d/index.html ]')), 'the source check looks for app2d/index.html');
  assert.ok(!pages.includes('dist/index.html'), 'no check for a committed dist/');
  const steps = ['npm ci', 'npm run build', 'npm test', 'npm run test:3d', 'touch dist/.nojekyll'];
  const at = steps.map((s) => runs.indexOf(s));
  assert.ok(at.every((i) => i >= 0), `every step runs: ${JSON.stringify(runs)}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'in this order');
  const upload = pages.slice(pages.indexOf('uses: actions/upload-pages-artifact@'));
  assert.match(upload, /^\s+path: dist$/m);
  assert.ok(pages.indexOf('touch dist/.nojekyll') < pages.indexOf('uses: actions/upload-pages-artifact@'));
});

test('package.json builds both games and keeps the 2D version', () => {
  assert.equal(typeof pkg.scripts.build, 'string');
  assert.equal(typeof pkg.scripts.test, 'string');
  assert.equal(typeof pkg.scripts['test:3d'], 'string');
  assert.equal(pkg.version, '1.3.6');
});
