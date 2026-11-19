import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  root: 'app3d',
  base: './',
  publicDir: 'public',
  build: { outDir: '../build/app3d', emptyOutDir: true },
  server: { fs: { allow: [repoRoot] } },
});
