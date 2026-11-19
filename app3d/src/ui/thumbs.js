// Pictures for the menu cards (pokju's car-card thumbnails, js_polish.js carThumbStep): each vehicle model or sprite is
// rendered once with the main renderer into a small off-screen target, read back and kept as a 256 x 256 canvas.
// Lazy: nothing is drawn until a card asks (the first time 탈것 or 꾸미기 opens), then one picture per animation frame,
// each cached. After every picture the renderer gets its own render target, clear colour, auto-clear and exposure back,
// and the sprite sheet's cell offset is restored, so the game's next frame sees no difference. Models are clones that
// share the game's geometry and materials (nothing here is disposed). A picture that fails stays a blank card. A
// character whose walking sheet is not loaded yet (world/actor-assets.js loads them on first use) waits for it.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CHARACTERS, OUTFIT_FILTERS } from '#game/wardrobe.js';
import { showCell, DIRS, EXPLORER_HEIGHT, BIKE_HEIGHT } from '../world/actors.js';
import { outfitMatrix, applyOutfit } from '../world/outfit.js';

export const THUMB_SIZE = 256;
const SE = DIRS.indexOf('se');   // the 2D character picker draws the 'se' cell (app2d/game.js drawCharacterChoices)
const FOV = 30;

/** Cache key for a picture: {kind:'vehicle', mode, character?, outfit?} | {kind:'character', id, outfit}. */
export function thumbKey(spec) {
  if (spec.kind === 'character') return `character:${spec.id}:${spec.outfit || 'default'}`;
  if (spec.mode === 'walk') return `vehicle:walk:${spec.character || 'explorer'}:${spec.outfit || 'default'}`;
  return `vehicle:${spec.mode}`;
}

// actors: world/actors.js Actors (its walkers, bike sprite sheet and vehicle groups are the models drawn here)
export function createThumbs(renderer, actors, { raf = (f) => requestAnimationFrame(f) } = {}) {
  const S = THUMB_SIZE, cache = new Map(), waiting = new Map();
  let studio = null, scheduled = false;

  function setup() {
    const target = new THREE.WebGLRenderTarget(S, S);
    target.texture.colorSpace = THREE.SRGBColorSpace;
    target.isXRRenderTarget = true;   // tone-mapped and sRGB-encoded like the game's screen (pokju's trick)
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x323957);
    const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
    scene.environment = pmrem.fromScene(room, 0.04).texture;   // a studio, whatever the game's time of day
    scene.environmentIntensity = 0.7;
    pmrem.dispose(); room.dispose?.();
    const key = new THREE.DirectionalLight(0xfff4e6, 1.6); key.position.set(-5, 8, -6);
    const rim = new THREE.DirectionalLight(0x9fc4ff, 0.9); rim.position.set(6, 4, 7);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x454d78, toneMapped: false }));
    const tint = new THREE.Matrix3();
    const sprite = new THREE.Sprite(applyOutfit(new THREE.SpriteMaterial({ alphaTest: 0.45, fog: false }), tint));
    scene.add(key, rim, floor);
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 4000);
    return { target, scene, floor, sprite, tint, camera, buf: new Uint8Array(S * S * 4) };
  }

  // the subject sits at the origin; the camera looks at `centre` from `dir`, far enough that `radius` fills the view
  function frame(centre, radius, dir) {
    const cam = studio.camera, dist = radius / Math.sin(THREE.MathUtils.degToRad(FOV / 2)) * 0.86;
    cam.position.copy(dir).normalize().multiplyScalar(dist).add(centre);
    cam.near = Math.max(0.5, dist - radius * 3); cam.far = dist + radius * 4;
    cam.lookAt(centre); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  }
  function floorAt(y, r) { studio.floor.position.set(0, y - 0.05, 0); studio.floor.scale.setScalar(r); }

  const box = new THREE.Box3(), centre = new THREE.Vector3(), size = new THREE.Vector3(), tmp = new THREE.Color();
  // a vehicle model: a clone (shared geometry and materials), seen from the front left, nose toward -Z as in the game
  function stageModel(group) {
    const g = group.clone(true);
    g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.visible = true; g.updateMatrixWorld(true);
    box.setFromObject(g); box.getCenter(centre); box.getSize(size);
    studio.scene.add(g);
    floorAt(box.min.y, Math.max(size.x, size.z) * 0.62);
    frame(centre, size.length() / 2, new THREE.Vector3(-0.62, 0.4, -0.7));
    return () => studio.scene.remove(g);
  }
  // a walking or riding sprite: one cell of its sheet ('se', standing), tinted like the game's explorer. wide: the card
  // shows the picture at 4:3 (cropped top and bottom), so the whole figure is kept inside that band
  function stageSprite(sheet, cell, height, filter, wide) {
    const { sprite, tint } = studio, tex = sheet.texture, off = tex.offset.clone(), rep = tex.repeat.clone();
    tint.set(...outfitMatrix(filter));
    sprite.material.map = tex; sprite.material.needsUpdate = true;
    showCell(sprite, tex, sheet.size, sheet.cells[cell], height);
    const w = sprite.scale.x, h = sprite.scale.y;
    sprite.position.set(0, 0, 0);
    centre.set((0.5 - sprite.center.x) * w, (0.5 - sprite.center.y) * h, 0);
    studio.scene.add(sprite);
    floorAt(0, w * 0.42);   // the sprite's anchor is the feet
    frame(centre, wide ? Math.max(w * 0.62, h * 0.82) : Math.max(w, h) * 0.6, new THREE.Vector3(0, 0.22, 1));
    return () => { studio.scene.remove(sprite); tex.offset.copy(off); tex.repeat.copy(rep); };
  }

  function stage(spec) {
    if (spec.kind === 'character' || spec.mode === 'walk') {
      const w = actors.walkers[sheetKey(spec)];
      if (!w) return null;   // its sheet could not load: a blank card
      return stageSprite(w.sheet, SE * 4 + 1, EXPLORER_HEIGHT, OUTFIT_FILTERS[spec.outfit] || 'none', spec.kind !== 'character');
    }
    if (spec.mode === 'bike') return stageSprite(actors.bike.sheet, SE * 2, BIKE_HEIGHT, 'none', true);
    const v = actors.vehicles[spec.mode];
    return v ? stageModel(v.group) : null;
  }

  function render(spec) {
    if (!studio) studio = setup();
    const unstage = stage(spec);
    if (!unstage) return null;
    const prev = { target: renderer.getRenderTarget(), exposure: renderer.toneMappingExposure, autoClear: renderer.autoClear, clear: renderer.getClearColor(tmp).getHex(), alpha: renderer.getClearAlpha() };
    try {
      renderer.toneMappingExposure = 1; renderer.autoClear = true;
      renderer.setRenderTarget(studio.target);
      renderer.render(studio.scene, studio.camera);
      renderer.readRenderTargetPixels(studio.target, 0, 0, S, S, studio.buf);
    } finally {
      renderer.setRenderTarget(prev.target);
      renderer.toneMappingExposure = prev.exposure; renderer.autoClear = prev.autoClear; renderer.setClearColor(prev.clear, prev.alpha);
      unstage();
    }
    // the target's rows run bottom-up
    const out = document.createElement('canvas'); out.width = out.height = S;
    const g = out.getContext('2d'), img = g.createImageData(S, S), row = S * 4;
    for (let y = 0; y < S; y++) img.data.set(studio.buf.subarray((S - 1 - y) * row, (S - y) * row), y * row);
    g.putImageData(img, 0, 0);
    return out;
  }

  const draw = (canvas, src) => { if (src) canvas.getContext('2d')?.drawImage(src, 0, 0, canvas.width, canvas.height); };

  // the walking sheet a picture shows (CHARACTERS[*].mode), or null for the other vehicles
  function sheetKey(spec) {
    if (spec.kind !== 'character' && spec.mode !== 'walk') return null;
    return (CHARACTERS[spec.kind === 'character' ? spec.id : spec.character] || CHARACTERS.explorer).mode;
  }

  function step() {
    scheduled = false;
    if (renderer.getContext().isContextLost?.()) return;   // tried again when a card next asks
    const [key, job] = [...waiting].find(([, j]) => !j.loading) || [];
    if (!key) return;
    const need = sheetKey(job.spec);
    if (need && !actors.walkers[need] && !job.asked) {   // its sheet first (loaded once), then the picture
      job.loading = job.asked = true;
      actors.loadWalker(need).then(() => { job.loading = false; schedule(); });
      schedule();
      return;
    }
    waiting.delete(key);
    let pic = null;
    try { pic = render(job.spec); } catch (e) { console.warn('thumbnail', key, e); }
    cache.set(key, pic);
    for (const c of job.canvases) draw(c, pic);
    schedule();
  }
  function schedule() { if (!scheduled && [...waiting.values()].some((j) => !j.loading)) { scheduled = true; raf(step); } }

  return {
    /** Draw the picture for `spec` into `canvas`: now when it is cached, else once it has been rendered. */
    paint(canvas, spec) {
      const key = thumbKey(spec);
      if (cache.has(key)) { draw(canvas, cache.get(key)); return; }
      const job = waiting.get(key) || { spec, canvases: new Set() };
      job.canvases.add(canvas); waiting.set(key, job);
      schedule();
    },
    get size() { return cache.size; },
  };
}
