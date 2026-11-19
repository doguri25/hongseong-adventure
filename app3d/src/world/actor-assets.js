// Loads and prepares everything the actors need: chroma-keyed sprite sheets, their cell tables, and the two pokju car models.
// Sheets come from the 2D game's assets (`#game/assets`, hashed into the build by Vite); the GLBs live in public/models.
// Of the three walking sheets (about 2 MB each) only the chosen character's loads at boot; the other two load on first
// use (Actors.setCharacter, the 꾸미기 pictures) through assets.loadWalk.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WALK_CELLS } from '#game/walk-cells.js';
import { MOTION_CELLS } from '#game/motion-cells.js';
import { SPRITE_CELLS } from '#game/sprite-cells.js';
import { isChroma } from '#game/sprites.js';
import { measureSpriteCells } from '#game/sprite-ground.js';
import { CHARACTERS } from '#game/wardrobe.js';

// walking sheets by CHARACTERS[*].mode
const WALK_URLS = {
  walk: new URL('#game/assets/walk-cycle-explorer.png', import.meta.url).href,
  boy: new URL('#game/assets/walk-cycle-boy.png', import.meta.url).href,
  raccoon: new URL('#game/assets/walk-cycle-raccoon.png', import.meta.url).href,
};
const URLS = {
  bike: new URL('#game/assets/motion-bike.png', import.meta.url).href,
  npc: new URL('#game/assets/npc-v12.png', import.meta.url).href,
  atlas: new URL('#game/assets/game-sprites-chroma-atlas.png', import.meta.url).href,
};
const BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || './';

const image = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('image ' + src)); i.src = src; });

// Same colour key as the 2D game: magenta background -> transparent. Returns the canvas and its pixels (for cell measuring).
export function keyedSheet(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), a = d.data;
  for (let i = 0; i < a.length; i += 4) if (isChroma(a[i], a[i + 1], a[i + 2])) a[i + 3] = 0;
  g.putImageData(d, 0, 0);
  return { canvas: c, pixels: d };
}

export function sheetTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4;
  return t;
}

async function sheet(url) { const { canvas, pixels } = keyedSheet(await image(url)); return { canvas, pixels, size: [canvas.width, canvas.height] }; }

async function model(name) {
  try {
    const gltf = await new GLTFLoader().loadAsync(BASE + 'models/' + name);
    gltf.scene.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return gltf.scene;
  } catch { return null; }
}

export const RESIDENT_ROLES = ['police', 'firefighter', 'storyteller', 'forest', 'birds', 'farmer', 'vendor', 'station'];

/**
 * Sheets that load on first use. load(key) -> Promise of a sheet; loaded: the sheets already in. get(key) resolves to
 * the sheet, or to null when it cannot load: it never rejects, asks load() at most once per key (requests made while
 * it loads share one promise), and a key that failed is not asked for again this session (`failed`).
 */
export function lazySheets(load, loaded = {}) {
  const sheets = { ...loaded }, pending = new Map(), failed = new Set();
  function get(key) {
    if (sheets[key]) return Promise.resolve(sheets[key]);
    if (failed.has(key)) return Promise.resolve(null);
    if (!pending.has(key)) {
      pending.set(key, Promise.resolve().then(() => load(key)).then(
        (s) => { pending.delete(key); sheets[key] = s; return s; },
        (e) => { pending.delete(key); failed.add(key); console.warn('sheet', key, e); return null; }));
    }
    return pending.get(key);
  }
  return { sheets, failed, get };
}

const walkSheet = (s, cells) => ({ texture: sheetTexture(s.canvas), size: s.size, cells });

// character: the chosen one (state.character), whose walking sheet loads with everything else
export async function loadActorAssets({ character = 'explorer' } = {}) {
  const first = (CHARACTERS[character] || CHARACTERS.explorer).mode;
  const [walk, bike, npc, atlas, car, supercar] = await Promise.all([
    sheet(WALK_URLS[first]), sheet(URLS.bike), sheet(URLS.npc), sheet(URLS.atlas),
    model('car.glb'), model('supercar.glb'),
  ]);
  const walks = lazySheets(async (key) => {
    if (!WALK_URLS[key]) throw new Error('no walking sheet ' + key);
    return walkSheet(await sheet(WALK_URLS[key]), WALK_CELLS[key]);
  }, { [first]: walkSheet(walk, WALK_CELLS[first]) });
  const bikeCells = measureSpriteCells(bike.pixels.data, bike.size[0], bike.size[1], 4, 4, MOTION_CELLS.bike);
  const residentCells = measureSpriteCells(npc.pixels.data, npc.size[0], npc.size[1], 4, 2);
  return {
    walk: walks.sheets, loadWalk: walks.get,   // the walking sheets in so far, by CHARACTERS[*].mode; the others on first use
    bike: walkSheet(bike, bikeCells),
    // NPC sources: resident sheet (4x2 measured cells) and the anchored atlas cells
    npc: { texture: sheetTexture(npc.canvas), size: npc.size, cells: residentCells },
    atlas: { texture: sheetTexture(atlas.canvas), size: atlas.size, cells: SPRITE_CELLS },
    car, supercar,
  };
}
