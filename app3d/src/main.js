// Hongseong Adventure 3D, phase 1: boots the whole county world from the game's own data and runs the game's movement
// and arrival rules with a temporary HUD. Boot: fetch data -> height field (+ water carving) -> world layers -> road
// services -> actors, places, NPCs -> restore the session -> loop (simulate -> camera -> actors/world -> ground, props,
// buildings -> post render -> auto quality every 2 s -> save every 2 s while moving).
import * as THREE from 'three';
import { BOUNDS, M_LON, M_LAT, project, unproject, toRender, fromRender } from './frame.js';
import { decodeFeatures, decodeBuildings, terrariumHeight } from './data/decode.js';
import { HeightField, carveWater, shoreRamp } from './world/heightfield.js';
import { Terrain } from './world/terrain.js';
import { Ground } from './world/ground.js';
import { createWater } from './world/water.js';
import { Buildings } from './world/buildings.js';
import { Props } from './world/props.js';
import { PlaceLayer, mappedPlaces, loadLabelFonts } from './world/places.js';
import { NpcLayer, buildNpcs } from './world/npcs.js';
import { Actors } from './world/actors.js';
import { loadActorAssets } from './world/actor-assets.js';
import { createSky, TIMES } from './render/sky.js';
import { createLighting } from './render/lighting.js';
import { createPost } from './render/post.js';
import { QUALITY, nextQuality, pixelRatio, watchContextLoss, rememberQuality } from './render/quality.js';
import { buildRoadGraph } from './sim/roadgraph.js';
import { createPlayer, stepPlayer, setMode as setPlayerMode, TOAST } from './sim/player.js';
import { createCamera, stepCamera } from './sim/camera.js';
import { arrivals, CAR_REACH, CONTACT } from './sim/arrival.js';
import { createControls } from './input/controls.js';
import { loadSession, saveSession, startPosition, restoreTravel, MODES } from './game/session.js';
import { ferryDocks, startVoyage, advanceVoyage } from './game/ferry.js';
import { createHud, josa } from './ui/hud.js';
import { createPlaceDialog, createNpcDialog } from './ui/place-dialog.js';
import { PLACES } from '#game/content.js';
import { districtAt, distance, canVisit } from '#game/geography.js';
import { RoadNavigator } from '#game/navigation.js';
import { WaterGuard, blocksWater } from '#game/water.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const isFlying = (m) => m === 'slowplane' || m === 'plane';
const isCar = (m) => m === 'car' || m === 'supercar';
const W = (BOUNDS[2] - BOUNDS[0]) * M_LON, H = (BOUNDS[3] - BOUNDS[1]) * M_LAT;
const MOVE_BOUNDS = [60, 60, W - 60, H - 60];
const QUALITY_ORDER = ['auto', 'high', 'medium', 'low'];
const TIME_ORDER = ['day', 'dusk', 'night'];
const HOLE = { walk: 34, bike: 34, car: 62, supercar: 62, boat: 62, slowplane: 110, plane: 110 };
const MODE_TOAST = {
  walk: '걸어서 다녀요', bike: '자전거로 바꿨어요. 걷기보다 두 배 빨라요.',
  car: '차도에서 출발해요. 길을 따라 알아서 달리고, 좌우 버튼으로 다음 갈림길에서 돌 방향을 골라요.',
  supercar: '슈퍼카로 바꿨어요. 차도를 따라 아주 빠르게 달려요.',
  slowplane: '느린 비행기로 바꿨어요', plane: '빠른 비행기로 바꿨어요',
};
const EVENT_TOAST = {
  'took-off:slowplane': '느린 비행기로 천천히 떠올라요. 마을을 내려다보기 좋아요.', 'took-off:plane': '비행기로 높이 날아올라요!',
  water: '물은 건널 수 없어요. 다리나 비행기를 이용해요.', 'no-route': '그곳까지 이어진 길을 찾지 못했어요',
  uturn: '차를 반대로 돌렸어요', 'dead-end': '길이 끝났어요. 아래로 누르고 있으면 차를 돌려요.', 'map-edge': '지도 끝이에요. 아래로 누르고 있으면 차를 돌려요.',
};
const FOG_MAX = 13000;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

// localStorage can be missing or throw (private mode, blocked site data): fall back to memory for this run
const storage = (() => {
  try { const s = window.localStorage; s.getItem('x'); return s; } catch {}
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } };
})();

const hud = createHud(document, {
  onMode: (m) => chooseMode(m), onCamera: () => toggleCamera(), onTime: () => cycleTime(), onQuality: () => cycleQuality(),
  onCompass: () => { if (!G) return; G.view.userYaw = 0; G.view.pitchAdj = 0; if (G.cam.mode === 'follow') toggleCamera(); },
  onZoom: (k) => { if (G) G.view.zoom = clamp(G.view.zoom * k, 0.2, 4); },
  onTilt: (d) => { if (G) G.view.pitchAdj = clamp(G.view.pitchAdj + d, -70, 70); },
  onTurn: (side) => { if (G && isCar(G.player.mode)) G.turn = side; },
  onTalk: () => talk(), onFerry: () => boardFerry(),
  onReload: () => { if (G) G.extra.quality = 'low'; rememberQuality(storage, 'low'); location.reload(); },   // the pagehide save must not undo it
});

let G = null;   // the running game, set once the world is built

// ---------- boot helpers
const nextFrame = () => new Promise((r) => { let done = false; const go = () => { if (!done) { done = true; r(); } }; requestAnimationFrame(() => setTimeout(go, 0)); setTimeout(go, 60); });
let stepIndex = 0;
const STEPS = 15;
async function step(text) { hud.loading(text, stepIndex++ / STEPS); await nextFrame(); }

async function fetchAll(list) {
  let done = 0;
  hud.loading(`지도 자료를 받는 중 (0/${list.length})`, 0);
  return Promise.all(list.map(async ([url, kind]) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    const v = kind === 'json' ? await res.json() : await res.blob();
    done++; hud.loading(`지도 자료를 받는 중 (${done}/${list.length})`, (done / list.length) * 2 / STEPS);
    return v;
  }));
}

// Terrarium PNG -> metres. Decoded without colour conversion so the RGB bytes stay exact.
async function decodeHeights(blob, grid) {
  let img;
  try { img = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }); }
  catch { img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(blob); }); }
  const w = img.width, h = img.height;
  if (w !== grid.w || h !== grid.h) throw new Error(`heights.png ${w}x${h} does not match grid ${grid.w}x${grid.h}`);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, w, h).data, out = new Float32Array(w * h);
  for (let i = 0, k = 0; i < out.length; i++, k += 4) out[i] = terrariumHeight(px[k], px[k + 1], px[k + 2]);
  img.close?.();
  return out;
}

// ---------- boot
async function boot() {
  const canvas = $('c');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  } catch (e) {
    hud.fatal('이 기기에서는 3D 화면을 열 수 없어요. WebGL을 지원하는 최신 브라우저에서 열어 주세요.');
    throw e;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.info.autoReset = false;   // the post chain renders several passes; count a whole frame

  const fontsReady = loadLabelFonts();
  const [world, featJson, buildJson, heightBlob] = await fetchAll([
    ['./data/world.json', 'json'], ['./data/features.json', 'json'], ['./data/buildings.json', 'json'], ['./data/heights.png', 'blob'],
  ]);
  stepIndex = 2;

  await step('높이 자료를 푸는 중');
  const field = new HeightField(world.grid, await decodeHeights(heightBlob, world.grid));
  const features = decodeFeatures(featJson), buildingList = decodeBuildings(buildJson);

  await step('바다와 호수를 파는 중');
  const sea = features.find((f) => f.tags.natural === 'water' && f.tags.water === 'sea');
  const lakes = features.filter((f) => f !== sea && blocksWater(f));
  // R2: carve before the terrain exists. The sea goes first, then the shore ramp puts the waterline on the OSM
  // coastline, then the lakes take their shore levels from the final land heights.
  carveWater(field, { sea });
  shoreRamp(field, sea);
  const lakeLevels = carveWater(field, { sea: null, lakes });

  const session = loadSession(storage), state = session.state, extra = session.extra;
  const qualityKey = extra.quality === 'auto' ? 'high' : extra.quality, Q = QUALITY[qualityKey];
  const qstate = { mode: extra.quality, scale: 1, bloom: Q.bloom };
  const low = qualityKey === 'low';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 1, 42000);
  const sky = createSky(scene, renderer);
  const lighting = createLighting(scene);

  await step('지형과 땅 그림을 준비하는 중');
  const ground = new Ground(renderer, field, features, buildingList, { low });
  const terrain = new Terrain(scene, field, ground.material);
  const water = createWater(scene, lakeLevels);

  await step('건물을 세우는 중');
  const mapped = mappedPlaces(PLACES);
  const placePoints = mapped.map((p) => { const [x, y] = project([p.lon, p.lat]); return { x, y }; });
  const buildings = new Buildings(scene, field, buildingList, features, placePoints, { low });
  const collider = buildings.collider;

  await step('장소 표시를 다는 중');
  await fontsReady;
  const placeLayer = new PlaceLayer(scene, mapped, collider, field, { reduced: REDUCED || state.motion === false });
  const places = placeLayer.places;

  await step('차도를 잇는 중');
  const graph = buildRoadGraph(features);
  await step('걷는 길을 잇는 중');
  const navigator = new RoadNavigator(features);
  await step('물길을 살피는 중');
  const waterGuard = new WaterGuard(features);
  const services = { field, navigator, water: waterGuard, graph, collider, bounds: MOVE_BOUNDS };

  await step('나무와 가로등을 심는 중');
  const props = new Props(scene, field, features, collider, graph);

  await step('탐험가와 탈것을 준비하는 중');
  const reduced = REDUCED || state.motion === false;
  const assets = await loadActorAssets();
  const actors = new Actors(scene, assets, { character: state.character, outfit: state.equipped?.outfit, reduced });
  const npcLayer = new NpcLayer(scene, buildNpcs(places, navigator), assets, field, { reduced });

  await step('이어서 할 곳을 찾는 중');
  const [sx, sy] = startPosition(state, { water: waterGuard, collider, bounds: world.bounds, start: world.start });
  const player = createPlayer({ x: sx, y: sy, mode: 'walk', movementMode: state.movementMode, speedSetting: state.speed });
  player.h = field.renderY(sx, sy);
  const held = new Set();
  arrivals(places, [sx, sy], [sx, sy], held, 'walk', collider);   // places in reach at the start do not reopen at once
  const cam = createCamera(extra.camera);
  const byId = new Map(places.map((p) => [p.id, p]));
  const docks = ferryDocks(waterGuard, byId.get('namdang').point, byId.get('tourmap-jukdo').point);

  const post = { current: null };
  G = {
    renderer, scene, camera, sky, lighting, ground, terrain, water, buildings, collider, props, placeLayer, places, npcLayer, actors,
    field, features, graph, navigator, waterGuard, services, world, state, extra, player, cam, held, docks, byId, post,
    Q, qstate, view: null, target: null, turn: null, voyage: null, timeKey: extra.time, running: false,
    frameTimes: [], lastCheck: 0, wide: null, fps: 0, saveAt: 0, hudAt: 0, waterNoteAt: -1e9, flyH: 0, speedFx: 0, tapRing: null, rendered: false,
  };

  // controls: the floating stick is drawn by the HUD; taps hit pins first, then the terrain
  const controls = createControls(canvas, { onTap: tap, onAction: action, onStick: (s) => hud.stick(s) });
  G.controls = controls;
  G.view = controls.read().view;   // live object: the camera eases userYaw in follow mode

  // dialogs pause the simulation; closing resumes play
  G.dialog = createPlaceDialog(document, {
    getState: () => state, onChange: () => { refreshStats(); save(); }, toast: (m) => hud.toast(m),
    onGo: (p) => { setTarget(p.point); hud.toast(`${p.name}${josa(p.name, 'to')} 가요`); }, onClose: resume,
  });
  G.npcDialog = createNpcDialog(document, { onClose: resume });

  // restore the travel mode: the shared travelSpeed wins over a stale 3D-only one (falls back to walking when, say, a
  // car has no road nearby)
  const travel = restoreTravel(state, extra);
  if (travel !== 'walk') { const r = setPlayerMode(player, travel, services); if (!r.ok) hud.toast(r.toast); }
  hud.setMode(player.mode, player.pending);
  hud.setCamera(cam.mode);
  hud.setQuality(qualityLabel());
  refreshStats();

  await step('그림자와 빛을 맞추는 중');
  resize();
  post.current = createPost(renderer, scene, camera, Q);
  post.current.bloom.enabled = qstate.bloom;
  resize();
  applyTime(G.timeKey);
  addEventListener('resize', resize);
  watchContextLoss(canvas, {
    onLost: () => { G.running = false; hud.lost(true); save(); },
    onRestored: () => { hud.lost(false); applyTime(G.timeKey); start(); },
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  addEventListener('pagehide', save);

  await step('첫 화면을 그리는 중');
  hud.loading('첫 화면을 그리는 중', 1);
  start();
}

// ---------- loop
function start() {
  if (G.running) return;
  G.running = true; G.last = 0;
  requestAnimationFrame(frame);
}

function frame(now) {
  if (!G.running) return;
  requestAnimationFrame(frame);
  const raw = G.last ? now - G.last : 16.7;
  G.last = now;
  const dt = clamp(raw / 1000, 0.001, 0.05), t = now / 1000;
  tick(dt, t);
  G.frameTimes.push(raw);
  if (now - G.lastCheck > 2000) { autoQuality(); G.lastCheck = now; }
  if (!G.rendered) { G.rendered = true; ready(); }
}

function tick(dt, t) {
  const { player, field, camera } = G;
  if (!G.dialog.isOpen && !G.npcDialog.isOpen) simulate(dt);

  // camera
  const cr = stepCamera(G.cam, player, dt, G.view, field);
  camera.position.set(cr.position[0], cr.position[1], cr.position[2]);
  camera.lookAt(cr.target[0], cr.target[1], cr.target[2]);
  camera.fov = cr.fov;
  camera.near = clamp(G.cam.dist * 0.03, 0.8, 30);
  camera.updateProjectionMatrix();
  const groundY = field.renderY(player.x, player.y);
  G.flyH = Math.max(0, player.h - groundY);
  const fog = G.scene.fog;
  // spike fog, capped inside the terrain's 14 km streaming radius so dropped chunks never show the sea plane through
  fog.far = Math.min(6000 + G.cam.dist * 7 + G.flyH * 14, FOG_MAX); fog.near = Math.min(1300 + G.cam.dist * 2 + G.flyH * 4, fog.far * 0.6);
  const fast = player.mode === 'plane' ? clamp(player.speed / (78 * 16), 0, 1) : isCar(player.mode) ? clamp(player.speed / (78 * 8), 0, 1) * 0.4 : 0;
  G.speedFx = REDUCED ? 0 : damp(G.speedFx, fast * 0.85, 3, dt);
  G.post.current.setSpeed(G.speedFx);
  hud.compass(G.cam.yaw);

  // actors and world layers
  G.actors.update(player, cr, dt, t, field);
  G.npcLayer.update(player, t);
  G.placeLayer.update(cr, player, t);
  const [gx, gy] = fromRender(G.cam.tx, G.cam.tz);
  G.ground.update([gx, gy], player.mode, G.flyH);
  G.terrain.update(camera.position);
  G.buildings.update(camera.position);
  const [X, Z] = toRender(player.x, player.y);
  holePoint.set(X, player.h + (player.mode === 'walk' || player.mode === 'bike' ? 12 : 7), Z);
  G.buildings.setHole(camera.position, holePoint, HOLE[player.mode] || 62);
  G.props.update(camera.position, propsQuality());
  G.lighting.follow([X, player.h, Z], G.flyH, G.cam.dist, G.Q.shadow);
  G.sky.update(camera.position, t);
  G.water.update(t);
  updateTapRing(dt);

  G.renderer.info.reset();
  G.post.current.render(dt, t);

  if (t - G.hudAt > 0.25) { G.hudAt = t; refreshHud(); }
  if (G.player.moving || G.voyage) { if (t - G.saveAt > 2) { G.saveAt = t; save(); } }
}
const holePoint = new THREE.Vector3();

// ---------- simulation
function simulate(dt) {
  const { player, services } = G;
  const r = G.controls.read();
  const manual = Math.hypot(r.x, r.y) > 0.01;
  if (manual && G.target) clearTarget();   // the stick or keys take over from a tap target
  const from = [player.x, player.y], modeBefore = player.mode, pendingBefore = player.pending;

  if (G.voyage) stepVoyage(dt);
  else {
    const input = { x: r.x, y: r.y, camYaw: G.cam.yaw, camMode: G.cam.mode, turn: G.turn, target: G.target };
    G.turn = null;
    const res = stepPlayer(player, input, services, dt);
    for (const e of res.events) onEvent(e);
    if (res.toast) hud.toast(res.toast);
    // tap target reached: walking within 12 m, a finished road route, or a plane over the spot
    if (G.target) {
      const d = Math.hypot(G.target[0] - player.x, G.target[1] - player.y);
      if ((player.mode === 'walk' || player.mode === 'bike') && (d < 12 || (player.movementMode === 'roads' && player.route && player.route.length === 0))) clearTarget();
      else if (isFlying(player.mode) && d < player.speed * 0.4 + 20) clearTarget();
    }
    // arrivals (never while flying); a dialog opens only when none is open
    const entered = arrivals(G.places, from, [player.x, player.y], G.held, player.mode, G.collider);
    if (entered.length) arrive(entered[0]);
  }
  if (player.mode !== modeBefore || player.pending !== pendingBefore) { hud.setMode(player.mode, player.pending); save(); }
}

function onEvent(e) {
  const p = G.player;
  if (e === 'took-off') hud.toast(EVENT_TOAST['took-off:' + p.mode]);
  else if (e === 'landed') hud.toast(p.mode === 'walk' ? '땅에 내렸어요' : p.mode === 'bike' ? '땅에 내려 자전거로 바꿨어요' : '도로에 내려 차로 바꿨어요');
  else if (e === 'water') { const now = performance.now(); if (now - G.waterNoteAt > 3000) { G.waterNoteAt = now; hud.toast(EVENT_TOAST.water); } }
  else if (e === 'no-route') { clearTarget(); hud.toast(EVENT_TOAST['no-route']); }
  else if (e === 'arrived') clearTarget();
  else if (EVENT_TOAST[e]) hud.toast(EVENT_TOAST[e]);
}

function arrive(place, sub) {
  const known = G.state.discovered.includes(place.id);
  hud.arrive(`${place.name}에 도착했어요`, sub || (known ? '발견 수첩에 기록된 장소' : '새로운 장소를 찾았어요!'));
  if (!G.dialog.isOpen && !G.npcDialog.isOpen) openPlace(place, true);
}

function openPlace(place, physical) {
  if (G.npcDialog.isOpen) G.npcDialog.close();
  G.controls.reset(); hud.stick({ visible: false });
  G.dialog.open(place, { physical });
}

function resume() { G.controls.reset(); G.last = 0; refreshStats(); }

function setTarget(p) {
  G.target = [p[0], p[1]];
  if (G.player.car) { G.player.car.goal = null; G.player.car.route = null; }
}
function clearTarget() {
  G.target = null; G.player.route = null; G.player.routeKey = null;
  if (G.tapRing) G.tapRing.visible = false;
}

// ---------- modes
function chooseMode(mode) {
  if (!G) return { ok: false };
  if (!MODES.includes(mode)) return { ok: false };
  if (G.voyage) { const m = '배를 타는 동안에는 탈것을 바꿀 수 없어요'; hud.toast(m); return { ok: false, toast: m }; }
  const p = G.player, from = p.mode, wasPending = p.pending;
  if (mode === from && !wasPending) return { ok: true };
  const r = setPlayerMode(p, mode, G.services);
  if (!r.ok) { hud.toast(r.toast); hud.setMode(p.mode, p.pending); return r; }
  clearTarget();
  let msg;
  if (p.pending) msg = '천천히 내려앉는 중이에요';
  else if (isFlying(mode) && !isFlying(from)) msg = null;   // the take-off toast follows on the next step
  else msg = MODE_TOAST[mode];
  if (msg) hud.toast(msg);
  hud.setMode(p.mode, p.pending);
  G.extra.travel = mode;
  save();
  return { ok: true, toast: msg || EVENT_TOAST['took-off:' + mode] };
}

// ---------- ferry (남당항 <-> 죽도)
function ferryOption() {
  const p = G.player;
  if (G.voyage || isFlying(p.mode) || p.pending) return null;
  const at = [p.x, p.y], jukdo = G.byId.get('tourmap-jukdo');
  if (distance(at, G.docks.namdang) < 150) return 'out';
  if (distance(at, jukdo.point) < 650 && !G.waterGuard.blocked(at)) return 'back';
  return null;
}

function boardFerry() {
  if (!G || G.dialog.isOpen || G.npcDialog.isOpen) return;
  const opt = ferryOption(); if (!opt) return;
  const returning = opt === 'back', p = G.player;
  clearTarget();
  G.voyage = startVoyage(returning, G.docks);
  setPlayerMode(p, 'boat', G.services);
  p.x = G.voyage.start[0]; p.y = G.voyage.start[1]; p.h = 0; p.speed = 0;
  hud.setMode('boat'); hud.setTurnHint(null);
  hud.toast(returning ? '남당항으로 돌아가는 중…' : '배를 타고 죽도로 가는 중…', 8000);
  save();
}

function stepVoyage(dt) {
  const p = G.player, v = G.voyage, r = advanceVoyage(v, dt), px = p.x, py = p.y;
  p.x = r.x; p.y = r.y; p.heading = r.heading; p.h = 0;
  p.vx = (r.x - px) / dt; p.vy = (r.y - py) / dt; p.speed = Math.hypot(p.vx, p.vy); p.moving = true;
  if (!r.done) return;
  G.voyage = null;
  setPlayerMode(p, 'walk', G.services);
  p.h = G.field.renderY(p.x, p.y); p.moving = false;
  hud.setMode(p.mode);
  arrivals(G.places, [p.x, p.y], [p.x, p.y], G.held, p.mode, G.collider);   // in reach on landing: held, as the 2D game does
  save();
  const place = G.byId.get(v.returning ? 'namdang' : 'tourmap-jukdo');
  if (place) arrive(place);
}

// ---------- NPCs
function nearNpc() { const n = G.npcLayer.nearest(G.player); return n ? n.npc : null; }
function talk() {
  if (!G || G.dialog.isOpen) return;
  const npc = nearNpc(); if (!npc) return;
  G.controls.reset(); hud.stick({ visible: false });
  G.npcDialog.open(npc);
}

// ---------- camera, time, quality
function toggleCamera() {
  if (!G) return;
  const c = G.cam;
  c.mode = c.mode === 'tilt' ? 'follow' : 'tilt'; c.base = null;
  G.view.userYaw = 0; G.view.pitchAdj = 0;
  G.extra.camera = c.mode;
  hud.setCamera(c.mode);
  hud.toast(c.mode === 'tilt' ? '북쪽이 위인 지도 화면이에요. 화면을 끌면 돌리고 기울여요.' : '탐험가 뒤를 따라가는 화면이에요. 화면을 끌면 둘러봐요.');
  save();
}

function applyTime(key) {
  if (!G) return null;
  const k = TIMES[key] ? key : 'day', T = G.sky.applyTime(k);
  G.lighting.setTime(T);
  G.post.current?.setTime(T);
  G.buildings.setNight(T.windows);
  G.props.setNight(T.lamps, T.night > 0.5 ? 0.4 : T.dusk > 0.5 ? 0.12 : 0);
  G.timeKey = k; G.extra.time = k;
  hud.setTime(T.label);
  return T;
}
function cycleTime() { if (!G) return; applyTime(TIME_ORDER[(TIME_ORDER.indexOf(G.timeKey) + 1) % TIME_ORDER.length]); save(); }

function qualityLabel() { return G.qstate.mode === 'auto' ? '자동' : QUALITY[G.qstate.mode].label; }
function propsQuality() { return G.qstate.mode === 'auto' ? (G.qstate.bloom ? 'high' : 'low') : G.qstate.mode; }

function cycleQuality() {
  if (!G) return;
  const mode = QUALITY_ORDER[(QUALITY_ORDER.indexOf(G.qstate.mode) + 1) % QUALITY_ORDER.length];
  const key = mode === 'auto' ? 'high' : mode, Q = QUALITY[key];
  const msaaChanged = Q.msaa !== G.Q.msaa;
  G.Q = Q;
  G.qstate = { mode, scale: 1, bloom: Q.bloom };
  G.extra.quality = mode;
  if (msaaChanged) {   // the render target's multisampling is fixed at creation: rebuild the post chain
    G.post.current.composer.dispose?.();
    G.post.current = createPost(G.renderer, G.scene, G.camera, Q);
    G.post.current.setTime(TIMES[G.timeKey]);
  }
  G.post.current.bloom.enabled = Q.bloom;
  resize();
  hud.setQuality(qualityLabel());
  hud.toast('화질을 바꿨어요. 나무 수와 땅 그림 해상도는 다시 불러오면 바뀌어요.');
  save();
}

function resize() {
  if (!G) return;
  const w = innerWidth, h = innerHeight, dpr = pixelRatio(G.Q, G.qstate.scale, w, h, devicePixelRatio);
  G.renderer.setPixelRatio(dpr); G.renderer.setSize(w, h, false);
  G.camera.aspect = w / h; G.camera.updateProjectionMatrix();
  G.post.current?.setSize(w, h, dpr);
  const wide = w > 720;   // the credit is an always-open attribution block on wide screens, a toggle on phones
  if (wide !== G.wide) { G.wide = wide; hud.openCredit(wide); }
}

// automatic quality: on the median frame time of the last 2 s, resolution first, then bloom (render/quality.js)
function autoQuality() {
  const times = G.frameTimes; G.frameTimes = [];
  if (!times.length) return;
  const med = times.slice().sort((a, b) => a - b)[Math.floor(times.length / 2)];
  G.fps = Math.round(1000 / med);
  hud.setFps(G.fps);
  if (document.hidden || times.length < 2) return;   // a very slow device still steps down every few seconds
  const next = nextQuality(G.qstate, med);
  if (next === G.qstate) return;
  const rescale = next.scale !== G.qstate.scale;
  G.qstate = next;
  if (G.post.current.bloom.enabled !== next.bloom) G.post.current.bloom.enabled = next.bloom;
  if (rescale) resize();
}

// ---------- input
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function tap(cx, cy) {
  if (!G || G.dialog.isOpen || G.npcDialog.isOpen) return;
  const rect = G.renderer.domElement.getBoundingClientRect();
  ndc.set(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
  ray.setFromCamera(ndc, G.camera);
  const items = G.placeLayer.items, pins = items.map((it) => it.pin);
  const pinHit = ray.intersectObjects(pins, false)[0];
  if (pinHit) { const it = items[pins.indexOf(pinHit.object)]; if (it) { openPlace(it.place, reachable(it.place)); return; } }
  const meshes = G.terrain.chunks.filter((c) => c.mesh).map((c) => c.mesh);
  const hit = ray.intersectObjects(meshes, false)[0];
  if (!hit) return;
  const [x, y] = fromRender(hit.point.x, hit.point.z);
  setTarget([x, y]);
  showTapRing(hit.point);
}

// a pin tapped while the player is already at the place counts as a visit
function reachable(place) {
  const p = G.player, d = Math.hypot(place.point[0] - p.x, place.point[1] - p.y);
  if (isFlying(p.mode) || G.voyage) return false;
  if (isCar(p.mode)) return d <= CAR_REACH;
  if (place.ring && G.collider.distance(place.ring, p.x, p.y) + 10 <= CONTACT) return true;   // touching its building
  return canVisit([p.x, p.y], place);
}

function showTapRing(point) {
  if (!G.tapRing) {
    G.tapRing = new THREE.Mesh(new THREE.RingGeometry(4.5, 6, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfffaf0, transparent: true, depthWrite: false }));
    G.tapRing.renderOrder = 5; G.scene.add(G.tapRing);
  }
  G.tapRing.position.set(point.x, point.y + 0.6, point.z); G.tapRing.userData.t = 0; G.tapRing.visible = true;
}
function updateTapRing(dt) {
  const r = G.tapRing; if (!r || !r.visible) return;
  r.userData.t += dt;
  const k = r.userData.t % 1.2;
  r.material.opacity = 0.9 * (1 - k / 1.2); r.scale.setScalar(1 + k * 0.8);
}

function action(a) {
  if (!G || G.dialog.isOpen || G.npcDialog.isOpen) return;
  if (a === 'interact') { if (nearNpc()) talk(); else if (ferryOption()) boardFerry(); }
  else if (a === 'camera') toggleCamera();
  else if (a === 'time') cycleTime();
  else if (a === 'quality') cycleQuality();
  else if (a.startsWith('mode:')) chooseMode(a.slice(5));
}

// ---------- HUD text, stats, saving
function refreshStats() {
  if (!G) return;
  const ids = new Set(G.places.map((p) => p.id));
  hud.setStats({ coins: G.state.coins, found: G.state.discovered.filter((id) => ids.has(id)).length, total: G.places.length });
}

function refreshHud() {
  const p = G.player;
  const d = districtAt(unproject([p.x, p.y]), G.world.districts);
  hud.setWhere(d ? `${d.county} ${d.name}` : '천수만 · 바다');
  hud.setTurnHint(isCar(p.mode) ? p.hint : null);
  const npc = G.voyage ? null : nearNpc();
  hud.setActions({ npc, ferry: ferryOption(), car: isCar(p.mode) && !!p.car && !p.pending });
}

function save() {
  if (!G) return;
  saveSession(storage, G.state, G.extra, G.player, G.voyage);
}

// ---------- ready: exposed once the first frame has rendered
function ready() {
  hud.loaded();
  try { G.renderer.domElement.focus({ preventScroll: true }); } catch {}
  hud.toast('왼쪽을 누른 채 끌면 움직여요. 오른쪽을 끌면 화면을 돌리고 기울이고, 두 손가락으로 확대해요.', 4200);
  window.__hs3d = {
    ready: true,
    player: G.player,
    setMode: chooseMode,
    applyTime: (k) => { const T = applyTime(k); save(); return T ? k : null; },
    toggleCamera,
    openPlace: (id) => { const p = G.byId.get(id); if (p) openPlace(p, reachable(p)); return !!p; },
    closeDialogs: () => { G.dialog.close(); G.npcDialog.close(); },
    // debug/smoke hook: put the player (walking) at a game-frame point, on dry land outside buildings, camera snapped
    teleport: (x, y) => {
      if (G.voyage) return false;
      const [px, py] = startPosition({ locations: { county: unproject([x, y]) } }, { water: G.waterGuard, collider: G.collider, bounds: G.world.bounds, start: G.world.start });
      Object.assign(G.player, { mode: 'walk', pending: null, x: px, y: py, h: G.field.renderY(px, py), vx: 0, vy: 0, speed: 0, alt: 0, bank: 0, climb: 0, turnRate: 0, hint: null, route: null, routeKey: null, roadCursor: null, car: null });
      G.extra.travel = 'walk';
      clearTarget(); G.cam.tx = null; G.held.clear();
      arrivals(G.places, [px, py], [px, py], G.held, 'walk', G.collider);
      hud.setMode('walk'); save();
      return [px, py];
    },
    world: G,
    info: () => ({
      buildings: G.buildings.rings.length,
      realBuildings: G.buildings.realCount,
      lamps: G.props.lamps.count,
      places: G.places.length,
      npcs: G.npcLayer.items.length,
      trees: [...G.props.chunks.values()].reduce((s, c) => s + c.count, 0),
      terrainChunks: G.terrain.chunks.filter((c) => c.mesh).length,
      groundLevels: Object.values(G.ground.levels).filter((l) => l.painted).length,
      fps: G.fps,
      mode: G.player.mode,
      quality: { ...G.qstate },
      running: G.running,
      calls: G.renderer.info.render.calls,
      triangles: G.renderer.info.render.triangles,
    }),
  };
}

boot().catch((e) => {
  console.error(e);
  hud.fatal('3D 지도를 불러오지 못했어요. 인터넷 연결을 확인하고 다시 열어 주세요.');
});
