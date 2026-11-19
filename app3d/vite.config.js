import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Every path is resolved from this file, so `vite --config app3d/vite.config.js` works from any working directory.
// The 2D game's modules and assets are reached through the `#game/*` import alias in the root package.json (R8):
// phase 2 repoints that one entry when it moves the 2D build.
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const repoRoot = here('..');

export default defineConfig({
  root: here('.'),
  base: './',
  publicDir: here('./public'),
  build: { outDir: here('../build/app3d'), emptyOutDir: true },
  server: { fs: { allow: [repoRoot] } },
});
