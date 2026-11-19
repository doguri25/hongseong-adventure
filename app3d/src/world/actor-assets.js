// Loads and prepares everything the actors need: chroma-keyed sprite sheets, their cell tables, and the two pokju car models.
// Sheets come from the 2D game's assets (`#game/assets`, hashed into the build by Vite); the GLBs live in public/models.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WALK_CELLS } from '#game/walk-cells.js';
import { MOTION_CELLS } from '#game/motion-cells.js';
import { SPRITE_CELLS } from '#game/sprite-cells.js';
import { isChroma } from '#game/sprites.js';
import { measureSpriteCells } from '#game/sprite-ground.js';

const URLS = {
  walk: new URL('#game/assets/walk-cycle-explorer.png', import.meta.url).href,
  boy: new URL('#game/assets/walk-cycle-boy.png', import.meta.url).href,
  raccoon: new URL('#game/assets/walk-cycle-raccoon.png', import.meta.url).href,
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

export async function loadActorAssets() {
  const [walk, boy, raccoon, bike, npc, atlas, car, supercar] = await Promise.all([
    sheet(URLS.walk), sheet(URLS.boy), sheet(URLS.raccoon), sheet(URLS.bike), sheet(URLS.npc), sheet(URLS.atlas),
    model('car.glb'), model('supercar.glb'),
  ]);
  const walkSheet = (s, cells) => ({ texture: sheetTexture(s.canvas), size: s.size, cells });
  const bikeCells = measureSpriteCells(bike.pixels.data, bike.size[0], bike.size[1], 4, 4, MOTION_CELLS.bike);
  const residentCells = measureSpriteCells(npc.pixels.data, npc.size[0], npc.size[1], 4, 2);
  return {
    walk: { walk: walkSheet(walk, WALK_CELLS.walk), boy: walkSheet(boy, WALK_CELLS.boy), raccoon: walkSheet(raccoon, WALK_CELLS.raccoon) },
    bike: walkSheet(bike, bikeCells),
    // NPC sources: resident sheet (4x2 measured cells) and the anchored atlas cells
    npc: { texture: sheetTexture(npc.canvas), size: npc.size, cells: residentCells },
    atlas: { texture: sheetTexture(atlas.canvas), size: atlas.size, cells: SPRITE_CELLS },
    car, supercar,
  };
}
