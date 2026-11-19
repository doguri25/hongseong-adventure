// Inline the spike into one HTML file.
//   build/naepo-3d.html  body-only page for publishing as an artifact (the host adds doctype/head/body)
//   build/local.html     the same page wrapped in a full document, for local browser checks
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)), SPIKE = path.resolve(HERE, '..'), ROOT = path.resolve(SPIKE, '..', '..');
const B = p => path.join(SPIKE, 'build', p), S = p => path.join(SPIKE, 'src', p), DIST = p => path.join(ROOT, 'dist', p);
const uri = (file, type) => `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;
const safe = s => s.replace(/<\/(script)/gi, '<\\/$1');

const data = fs.readFileSync(B('data.json'), 'utf8');
const cells = JSON.parse(fs.readFileSync(B('walk-cells.json'), 'utf8'));
const assets = {walk: uri(B('walk-explorer.webp'), 'image/webp'), walkCells: cells.cells, walkSize: cells.size, county: uri(DIST('assets/map-view-county-v13.webp'), 'image/webp')};
if (fs.existsSync(B('pokju-car.glb'))) assets.car = fs.readFileSync(B('pokju-car.glb')).toString('base64');
const shaders = {sky: fs.readFileSync(S('shaders/sky.frag'), 'utf8'), grade: fs.readFileSync(S('shaders/grade.frag'), 'utf8')};
const payload = `window.SPIKE_DATA=${safe(data)};window.SPIKE_ASSETS=${safe(JSON.stringify(assets))};window.SPIKE_SHADERS=${safe(JSON.stringify(shaders))};`;
let page = fs.readFileSync(S('index.html'), 'utf8')
  .replace('/*FONT_R*/', uri(DIST('assets/NanumSquareRoundR.woff2'), 'font/woff2'))
  .replace('/*FONT_B*/', uri(DIST('assets/NanumSquareRoundB.woff2'), 'font/woff2'));
page = page.replace('/*PAYLOAD*/', () => payload).replace('/*MAIN*/', () => safe(fs.readFileSync(S('main.js'), 'utf8')));
fs.writeFileSync(B('naepo-3d.html'), page);
fs.writeFileSync(B('local.html'), '<!doctype html>\n<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>\n' + page + '</body></html>\n');
console.log('naepo-3d.html', (fs.statSync(B('naepo-3d.html')).size / 1e6).toFixed(2), 'MB');
