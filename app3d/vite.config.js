import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Every path is resolved from this file, so `vite --config app3d/vite.config.js` works from any working directory.
// The 2D game's modules and assets are reached through the `#game/*` import alias in the root package.json (R8),
// which points at the frozen 2D in app2d/. The 3D builds into dist/ (emptied first); `npm run build` then copies
// app2d/ to dist/2d/ (tools/build/copy-2d.mjs), so one site holds the 3D at its root and the 2D at 2d/.
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const repoRoot = here('..');

export default defineConfig({
  root: here('.'),
  base: './',
  publicDir: here('./public'),
  build: { outDir: here('../dist'), emptyOutDir: true },
  server: { fs: { allow: [repoRoot] } },
});
