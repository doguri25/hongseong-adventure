// The second step of `npm run build`: after Vite has emptied dist/ and built the 3D into it (`npm run build:3d`),
// copy the frozen 2D game (app2d/) to dist/2d/ byte for byte, so one site serves the 3D at its root and the 2D at 2d/.
// Nothing is skipped or rewritten: every 2D URL is relative, so the copy works under any path.
//   node tools/build/copy-2d.mjs          replace dist/2d/ with a fresh copy of app2d/, then check it
//   node tools/build/copy-2d.mjs --check  only check: exit 1 if a file is missing from, extra in or different in dist/2d/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const SRC = path.join(repo, 'app2d');
const SITE = path.join(repo, 'dist');
const DEST = path.join(SITE, '2d');

/** Every file under dir as sorted '/'-separated paths relative to it (an absent dir has none). */
function files(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const full = path.join(dir, d.name);
    return d.isDirectory() ? files(full, base) : [path.relative(base, full).split(path.sep).join('/')];
  }).sort();
}

/** app2d/ against dist/2d/: problems is empty when every file is there with the same bytes and nothing else is. */
function compare() {
  const want = files(SRC), have = new Set(files(DEST)), problems = [];
  let bytes = 0;
  for (const f of want) {
    const a = fs.readFileSync(path.join(SRC, f));
    bytes += a.length;
    if (!have.delete(f)) problems.push(`missing ${f}`);
    else if (!a.equals(fs.readFileSync(path.join(DEST, f)))) problems.push(`differs ${f}`);
  }
  for (const f of have) problems.push(`extra ${f}`);
  return { count: want.length, bytes, problems };
}

const checkOnly = process.argv.includes('--check');
if (!files(SRC).includes('index.html')) { console.error('copy-2d: app2d/index.html missing: the 2D game is not there'); process.exit(1); }
if (!checkOnly) {
  if (!fs.existsSync(path.join(SITE, 'index.html'))) { console.error('copy-2d: dist/index.html missing: build the 3D first (npm run build runs both steps)'); process.exit(1); }
  fs.rmSync(DEST, { recursive: true, force: true });
  fs.cpSync(SRC, DEST, { recursive: true });
}
const { count, bytes, problems } = compare();
if (problems.length) {
  console.error(`copy-2d: dist/2d/ does not match app2d/ (${problems.length} file(s)):\n  ${problems.slice(0, 20).join('\n  ')}${problems.length > 20 ? '\n  …' : ''}`);
  process.exit(1);
}
console.log(`copy-2d: dist/2d/ ${checkOnly ? 'matches' : 'is a copy of'} app2d/, ${count} files, ${(bytes / 1048576).toFixed(1)} MB, byte for byte`);
