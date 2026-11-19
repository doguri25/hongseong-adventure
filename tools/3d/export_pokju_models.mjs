// Exports two pokju-edu car models (dolphin -> car.glb, p911 -> supercar.glb) to app3d/public/models/.
// Method (spike/3d-naepo/README.md): copy the read-only pokju-edu clone to build/pokju-export/, patch its tools/build.mjs
// (GLTFExporter import in HEADER, 'zz_export.js' after 'part_cartail.js' in PARTS), npm install, build, then call
// window.__pokju.exportCar(key) in Playwright Chromium (software WebGL).
//   node tools/3d/export_pokju_models.mjs [path-to-pokju-edu]      (default /home/user/doguri25/pokju-edu or $POKJU_EDU)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE = path.resolve(process.argv[2] || process.env.POKJU_EDU || '/home/user/doguri25/pokju-edu');
const WORK = path.join(ROOT, 'build', 'pokju-export');
const OUT = path.join(ROOT, 'app3d', 'public', 'models');
const MODELS = { dolphin: 'car.glb', p911: 'supercar.glb' };

const ZZ = `
  /* export helper (not part of pokju-edu): hand a finished car model to a GLB exporter */
  window.__pokju = { keys: Object.keys(CARS), exportCar: function (key) {
    var g = CARS[key].g, was = g.visible; g.visible = true;
    return new Promise(function (res, rej) { new GLTFExporter().parse(g, function (buf) { g.visible = was; var b = new Uint8Array(buf), s = ''; for (var i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); res(btoa(s)); }, rej, { binary: true, onlyVisible: false }); });
  } };
`;

function copy() {
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });
  fs.cpSync(SOURCE, WORK, { recursive: true, filter: (s) => !/[\\/](node_modules|\.git|\.build|dist)$/.test(s) });
}

function patch() {
  const f = path.join(WORK, 'tools', 'build.mjs');
  let s = fs.readFileSync(f, 'utf8');
  const imp = "import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';";
  if (!s.includes(imp)) s = s.replace("import * as THREE from 'three';\n", "import * as THREE from 'three';\n" + imp + '\n');
  if (!s.includes(imp)) throw new Error('could not patch HEADER');
  if (!s.includes("'zz_export.js'")) s = s.replace("'part_cartail.js',", "'part_cartail.js', 'zz_export.js',");
  if (!s.includes("'zz_export.js'")) throw new Error('could not patch PARTS');
  fs.writeFileSync(f, s);
  fs.writeFileSync(path.join(WORK, 'src', 'zz_export.js'), ZZ);
}

async function loadPlaywright() {
  const tries = [ROOT, process.env.PLAYWRIGHT_DIR, '/opt/node-tools', '/usr/lib/node_modules'].filter(Boolean);
  for (const base of tries) {
    try { return createRequire(path.join(base, 'x.js'))('playwright'); } catch { /* next */ }
  }
  return (await import('playwright')).default;
}

async function main() {
  if (!fs.existsSync(path.join(SOURCE, 'tools', 'build.mjs'))) throw new Error('pokju-edu not found at ' + SOURCE);
  copy(); patch();
  execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: WORK, stdio: 'inherit' });
  execFileSync('node', ['tools/build.mjs'], { cwd: WORK, stdio: 'inherit' });
  const pw = await loadPlaywright();
  const browser = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.log('page error', e.message));
    await page.goto(pathToFileURL(path.join(WORK, 'index.html')).href);
    await page.waitForFunction(() => window.__pokju, null, { timeout: 120000 });
    fs.mkdirSync(OUT, { recursive: true });
    for (const [key, file] of Object.entries(MODELS)) {
      const b64 = await page.evaluate((k) => window.__pokju.exportCar(k), key);
      const buf = Buffer.from(b64, 'base64');
      fs.writeFileSync(path.join(OUT, file), buf);
      console.log(key, '->', file, buf.length, 'bytes');
    }
  } finally { await browser.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
