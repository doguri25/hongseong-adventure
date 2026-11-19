# 홍성 3D판 1단계: 홍성군 전체 3D 세계와 놀이 규칙 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new Vite + Three.js app in `app3d/` that renders all of 홍성군 in 3D from the game's own data and runs the game's movement and arrival rules (six travel modes, collision, road-following car, places, NPCs, ferry, saving), with a temporary HUD, previewable as a multi-file artifact.

**Architecture:** Pure simulation modules (`app3d/src/sim/`, no Three.js) are unit-tested with `node --test`; rendering modules (`app3d/src/world/`, `app3d/src/render/`) wrap them. The game's existing pure modules in `dist/` (`core.js`, `content.js`, `geography.js`, `navigation.js`, `water.js`, `npcs.js`, `sparse-npcs.js`, `wardrobe.js`, `walk-cells.js`, `motion-cells.js`, `sprite-ground.js`, `release.js`) are imported read-only; `dist/` is not modified in this phase. A Python pipeline in `tools/3d/` turns the game map, building exports and elevation tiles into compact files under `app3d/public/data/`. The working prototype `spike/3d-naepo/src/main.js` is the reference for every rendering technique and for the car, collider and camera code; port from it rather than reinventing.

**Tech Stack:** Three.js `0.187.0`, Vite `8.3.5`, Node 22 `node --test`, Python 3 + Pillow (data pipeline), Playwright (smoke check, preinstalled Chromium).

**Spec:** `docs/superpowers/specs/2026-11-19-hongseong-3d-design.md` (phase 1 = §12 step 1; rules in §7, data in §8, performance in §9).

## Global Constraints

- Do not modify anything under `dist/`, `tests/`, `vercel.json` or `.github/` in this phase. Root `package.json` may gain devDependencies and scripts only (its `version` must stay `1.3.6`).
- Pin exact versions (no `^`): `three@0.187.0`, `vite@8.3.5`, `pngjs` not needed (heights are decoded in the browser from PNG via canvas).
- Bundle Three.js; no runtime CDN. Fonts from `dist/assets/NanumSquareRound{R,B}.woff2` (OFL) copied into the build.
- Game frame (same as `World.project` in `dist/world.js`): origin `[126.4, 36.69]`, `mLon = 111320·cos(36.69°)`, `mLat = 111320`, `x = (lon−126.4)·mLon` east, `y = (36.69−lat)·mLat` south, metres. Render space: `X = x − CX`, `Z = y − CY` where `(CX, CY)` is the centre of `bounds [126.4, 36.45, 126.79, 36.69]`; three.js `+Y` is up.
- Vertical exaggeration `VEX = 1.2`; sea level renders at `Y = 0`.
- Speeds in m/s: `78 × state.speed × factor`, factors `walk 1, bike 2, car 4, supercar 8, slowplane 4, plane 16`.
- Sizes: explorer billboard 24 m tall; car model scaled so its length is ≈39 m; slow plane wingspan ≈110 m; jet length ≈120 m; NPC billboards 20 m.
- Camera: pitch clamped to 4°–88°, zoom factor 0.2–4; per-mode base `[distance, pitch°]` — walk tilt `[185,50]` follow `[82,17]`; bike tilt `[260,49]` follow `[110,16]`; car tilt `[500,48]` follow `[200,15]`; supercar tilt `[620,48]` follow `[240,15]`; slowplane tilt `[760,46]` follow `[340,16]` altitude 270 m; plane tilt `[1500,52]` follow `[600,18]` altitude 600 m.
- Save: `localStorage['hongseong-adventure-v1']` through `dist/core.js` `sanitizeState`/`freshState`, `version: 1`; 3D-only values in `localStorage['hongseong-3d-v1']`. Shared `travelSpeed` must stay in `{walk, bike, fast, faster, plane}`: walk→`walk`, bike→`bike`, car→`fast`, supercar→`faster`, slowplane→`plane`, plane→`plane`. Position authority is `state.locations.county = [lon, lat]`.
- UI copy in Korean, body text ≥15 px, touch targets ≥44 px. Decorative objects (filler buildings, trees, lamps) carry no text; the HUD credit line says so.
- All `localStorage` access wrapped in try/catch.

## Review Focus

1. A 2D save whose position is in water, inside a building, or outside the map → the game starts on the nearest dry land outside buildings, inside bounds (Task 11 test `startPositionIsSafe`).
2. Choosing car/supercar more than 600 m from a carriageway, or landing a plane as a car over fields → refused with a toast / lands as walk, never teleports far (Task 9 test `carNeedsRoad`).
3. Tab hidden, window blur or a lost pointer mid-drag → no stuck movement, stick resets (Task 10 test `inputResetsOnBlur`).
4. WebGL context loss → loop pauses, overlay shows, reload starts on low quality (Task 12 smoke step forces `WEBGL_lose_context`).
5. A slow device → automatic quality lowers resolution first, then bloom, never below low (Task 5 test `autoQualitySteps`).

---

### Task 1: Scaffold `app3d` with Vite and a test runner

**Files:**
- Create: `app3d/index.html`, `app3d/vite.config.js`, `app3d/src/main.js`, `app3d/src/frame.js`, `app3d/tests/frame.test.js`
- Modify: `package.json` (devDependencies `three`, `vite`; scripts `dev:3d`, `build:3d`, `test:3d`), `.gitignore` (`build/`)

**Interfaces:**
- Produces: `frame.js` exports `ORIGIN=[126.4,36.69]`, `BOUNDS=[126.4,36.45,126.79,36.69]`, `M_LON`, `M_LAT`, `project([lon,lat]) -> [x,y]`, `unproject([x,y]) -> [lon,lat]`, `CENTER=[CX,CY]`, `toRender(x,y) -> [X,Z]`, `fromRender(X,Z) -> [x,y]`, `VEX=1.2`.
- Scripts: `npm run build:3d` → `build/app3d/` (Vite `root: 'app3d'`, `base: './'`, `publicDir: 'public'`, `server.fs.allow` includes repo root so `../../dist/*.js` imports work); `npm run test:3d` → `node --test app3d/tests/*.test.js`.

- [ ] **Step 1: Write the failing test** `app3d/tests/frame.test.js`
```js
test('project matches the 2D game', () => { const [x, y] = project([126.67118, 36.65611]); assert.ok(Math.abs(x - 24207.0) < 1 && Math.abs(y - 3772.6) < 1); });
test('round trip', () => { const p = [126.5, 36.6]; const q = unproject(project(p)); assert.ok(Math.abs(q[0] - p[0]) < 1e-9 && Math.abs(q[1] - p[1]) < 1e-9); });
test('render space is centred', () => { const [X, Z] = toRender(...project([126.595, 36.57])); assert.ok(Math.abs(X) < 1 && Math.abs(Z) < 1); });
```
(Check the first expectation against `World.project` by importing `dist/world.js`-free math: `x=(lon−126.4)·111320·cos(36.69π/180)`.)
- [ ] **Step 2: Run `npm run test:3d`** — Expected: FAIL (module missing).
- [ ] **Step 3: Implement `frame.js`; `main.js` creates a `WebGLRenderer` on `#c` and draws one lit box; `index.html` has `<canvas id="c">` and a `#loading` overlay.**
- [ ] **Step 4: Run `npm i && npm run test:3d && npm run build:3d`** — Expected: tests PASS; `build/app3d/index.html` exists; `node --test tests/*.test.js` still 91 pass.
- [ ] **Step 5: Commit** `feat(3d): scaffold app3d with Vite, Three.js and the game frame`

### Task 2: County data pipeline

**Files:**
- Create: `tools/3d/prepare_world.py`, `tools/3d/README.md`, `app3d/src/data/decode.js`, `app3d/tests/data.test.js`
- Create (generated, committed): `app3d/public/data/world.json`, `features.json`, `buildings.json`, `heights.png`
- Reads: `dist/map-county.json`, `spike/3d-naepo/data/county-buildings.geojson`, `spike/3d-naepo/data/naepo-buildings.geojson`, Terrarium tiles (cache in `build/dem-cache/`, gitignored)

**Interfaces:**
- `world.json`: `{bounds, origin, center:[CX,CY], start:[x,y], grid:{w,h,cell:25}, heightRange:[min,max], districts:[{name,county,bounds,geometry(lon/lat)}], countyGeometry, terrainLabels:[{name,x,y,elevation}], credits:[…]}`
- `features.json`: `{q:0.1, items:[{k, t, p:[dx,dy,…], h?:[[…]]}]}` — `k` kind code (`road|water|waterway|rail|landuse|other`), `t` tags kept (`highway, oneway, bridge, name, natural, water, waterway, landuse, leisure, railway, amenity, building, area, foot, access, layer`), `p` delta-encoded integer decimetres in game frame (first pair absolute). Sea polygon (`id: 'county-sea'`) included with holes. Buildings excluded here.
- `buildings.json`: `{items:[{id, t:{building,levels?,height?,name?}, p:[…delta dm…]}]}` — game-map buildings ∪ county export ∪ Naepo export, deduplicated by OSM way id (game ids are numeric, exports use `way/NNN`).
- `heights.png`: Terrarium RGB (`h = R·256 + G + B/256 − 32768`), grid `w = ceil(width/25)+1`, `h = ceil(height/25)+1`, row 0 = north edge `y=0`, column 0 = west edge `x=0`, ocean cells keep their (negative) bathymetry, no-data cells (< −60 m on land) filled from neighbours.
- `decode.js` exports `decodeFeatures(json) -> [{kind, tags, points:[[x,y]…], holes}]`, `decodeBuildings(json) -> [{id, tags, ring:[[x,y]…]}]`, `terrariumHeight(r,g,b) -> number`.

- [ ] **Step 1: Write failing tests** `app3d/tests/data.test.js`
```js
test('features round-trip the game map', () => { assert.equal(features.length, 18668 - 933); assert.ok(features.find(f => f.tags.natural === 'water' && f.holes.length > 0)); });
test('buildings are deduplicated and inside the county', () => { assert.ok(buildings.length >= 2900); assert.equal(new Set(buildings.map(b => b.id)).size, buildings.length); });
test('heights grid matches world.json', () => { assert.equal(png.width, world.grid.w); assert.equal(png.height, world.grid.h); });
test('terrarium decode', () => assert.equal(terrariumHeight(128, 0, 0), 0));
test('Yongbongsan is a hill', () => { /* sample heights.png at project([126.6493,36.6437]) via decoded grid */ assert.ok(h > 150); });
```
(Tests read PNG with a tiny inline decoder using `zlib.inflateSync`, or Pillow output dimensions from `world.json` plus a separate `heights.meta.json` — implementer's choice; keep the Yongbongsan assertion.)
- [ ] **Step 2: Run `npm run test:3d`** — Expected: FAIL (files missing).
- [ ] **Step 3: Implement `prepare_world.py`** (port `spike/3d-naepo/tools/prepare.py`: DEM mosaic at zoom 13 over `bounds`, bilinear resample to the 25 m grid, no-data fill; feature quantisation; building merge) and `decode.js`. Print counts and output sizes; target `features.json` ≤ 3.5 MB raw.
- [ ] **Step 4: Run `python3 tools/3d/prepare_world.py && npm run test:3d`** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(3d): county data pipeline (features, buildings, terrarium heights)`

### Task 3: Height field and chunked terrain

**Files:**
- Create: `app3d/src/world/heightfield.js`, `app3d/src/world/terrain.js`, `app3d/tests/heightfield.test.js`

**Interfaces:**
- Consumes: `world.json.grid`, decoded height grid `Float32Array` (metres, row-major north→south).
- Produces: `class HeightField { constructor(grid:{w,h,cell}, data:Float32Array); heightAt(x,y) -> metres (bilinear, clamped to edges); renderY(x,y) -> heightAt·VEX; slopeAt(x,y) -> rise/run; isSea(x,y) -> heightAt<0.5 }`; `class Terrain { constructor(scene, field, material); update(cameraRenderPos) }` — 2 km chunks, LOD spacing 25/50/100 m chosen by distance (<3 km, <8 km, beyond), 20 m skirts, meshes created lazily and disposed when >14 km away.

- [ ] **Step 1: Failing tests** — `heightAt` returns exact grid values at nodes, the bilinear midpoint of a 2×2 test grid, clamps outside; `renderY = heightAt*1.2`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Terrain vertex UVs map game metres to county UV `(x/width, 1−y/height)` so ground textures from Task 4 drape directly.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(3d): height field and chunked LOD terrain`

### Task 4: Ground painting (base, mid and near levels, worker)

**Files:**
- Create: `app3d/src/world/paint.js`, `app3d/src/world/ground-worker.js`, `app3d/src/world/ground.js`, `app3d/tests/ground.test.js`

**Interfaces:**
- Consumes: decoded features, `HeightField`, buildings (footprints for the ambient-shadow fill).
- Produces: `paintRegion(ctx, x0, y0, wx, wy, {features, masks, patterns, fine})` (world-anchored patterns exactly as `spike/3d-naepo/src/main.js` `paintRegion`); `levelFor(name, cam) -> {cx, cy, R}` and `needsRepaint(level, cx, cy) -> boolean` (pure); `class Ground { constructor(renderer, field, features, buildings); material: THREE.MeshStandardMaterial; update(camTarget, mode, flyHeight) }`. Levels: `base` whole county 4096² (2048² on low), `mid` R = 3000 m 2048², `near` R = 650 m (walk/bike) or 1100 m (car/supercar/slowplane) 2048² (1024² on low), off for `plane`. Repaint when the target drifts > 0.3·R; painting runs in `ground-worker.js` on `OffscreenCanvas` and returns `ImageBitmap`; without `OffscreenCanvas` it paints on the main thread one quarter per frame. Terrain shader blends `mid` over `base` and `near` over `mid` with a 14% edge fade, then applies the detail noise (as in the spike).

- [ ] **Step 1: Failing tests** for `levelFor`/`needsRepaint`: near R by mode (`walk`→650, `car`→1100, `plane`→null), repaint threshold 0.3·R, centre snapped to 25 m.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** (road widths and colours from the spike's `ROAD` table; the sea polygon fills with the sea colour; masks from `HeightField` slope/height as in the spike).
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(3d): world-anchored ground painting with base, mid and near levels`

### Task 5: Sky, light, water, post-processing, quality

**Files:**
- Create: `app3d/src/shaders/sky.frag`, `app3d/src/shaders/grade.frag` (copied from `spike/3d-naepo/src/shaders/`), `app3d/src/render/sky.js`, `app3d/src/render/post.js`, `app3d/src/render/quality.js`, `app3d/src/world/water.js`, `app3d/tests/quality.test.js`

**Interfaces:**
- Produces: `TIMES` presets `day|dusk|night` (values from the spike's `TIMES`), `applyTime(key)`; `createPost(renderer, scene, camera, q) -> {render(dt), setSize, bloom, grade}`; `QUALITY = {high, medium, low}` with `dpr` 2/1.5/1.25, pixel caps 2.6e6/1.8e6/1.2e6, shadow 2048/2048/1024, bloom on/on/off, MSAA 4/2/0; `nextQuality(state:{mode, scale, bloom}, medianMs) -> state` (pure: >26 ms lowers `scale` by 0.14 down to 0.6, then turns bloom off; <15 ms raises scale by 0.1 up to 1; never changes an explicit mode); `Water` builds the sea plane at `Y=0` with the animated normal map and environment reflection, plus flat meshes for reservoirs/lakes ≥ 10 000 m² at their shore level with terrain carving data for Task 3.
- Context loss: `webglcontextlost` pauses the loop and shows `#lost`; `#reload` stores `low` in `hongseong-3d-v1.quality` and reloads.

- [ ] **Step 1: Failing test `autoQualitySteps`**: from `{mode:'auto', scale:1, bloom:true}` repeated 40 ms medians give scales 0.86, 0.72, 0.6, then `bloom:false`, then unchanged; 10 ms medians climb back to 1; `mode:'high'` never changes.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Use `THREE.PCFShadowMap` (r187 has no soft variant). Shadow box follows the player as in the spike.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(3d): sky, lighting presets, water, post-processing and quality steps`

### Task 6: Buildings and the collider

**Files:**
- Create: `app3d/src/sim/collider.js`, `app3d/src/world/buildings.js`, `app3d/tests/collider.test.js`

**Interfaces:**
- Produces (pure): `createCollider(rings:[[x,y]…][]) -> {resolve(x,y,radius) -> {x,y,hit,nx,ny}, containing(x,y) -> ring|null, distance(ring,x,y) -> metres, blocked(x,y,pad) -> boolean}` (port of the spike's `makeCollider`, game-frame coordinates).
- Produces (render): `class Buildings { constructor(scene, field, buildings, features, places); collider; update(camRenderPos); setNight(intensity); setHole(camPos, playerPos, radius) }` — per-2 km-chunk merged meshes; heights from `building:levels·3.2+1` or `height`, else by type/area (spike `buildingHeight`); filler slabs/houses only in residential/commercial landuse polygons holding fewer than 3 real buildings and not within 40 m of a place; facade map + night emissive map with per-building offsets; see-through hole shader (spike).

- [ ] **Step 1: Failing tests**: a point inside a 10×10 square is pushed out to distance ≥ radius; sliding — moving diagonally into a wall keeps the tangential component; `containing` finds the ring; `blocked` with pad; empty collider never hits.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(3d): building meshes, filler blocks and a sliding collider`

### Task 7: Road graph and the road-following car

**Files:**
- Create: `app3d/src/sim/roadgraph.js`, `app3d/src/sim/car.js`, `app3d/tests/car.test.js`

**Interfaces:**
- Produces: `buildRoadGraph(features) -> {edges, nodes, at(edge,s)->[x,y], tangent(edge,s,dir)->[dx,dy], departure(link)->[dx,dy], nearest(x,y,maxR)->{edge,s,d}|null, route(state, goal, tx, ty)->{turn:boolean, edges:number[]}|null}` (spike `makeRoadGraph`; car roads = `highway` except `path, footway, cycleway, steps, pedestrian`; nodes keyed by coordinates rounded to 0.5 m; `edge.way` = 1 for `oneway=yes`, −1 for `-1`, else 0; A* cost ×4 against a one-way).
- `createCar(graph, x, y, heading, maxR=600) -> car|null`; `driveCar(car, input:{throttle, turn:'left'|'right'|null, stickHeading:number|null, target:[x,y]|null}, speedMax, dt) -> {x, y, heading, speed, hint, events[]}` — rules from the spike's `driveCar`: right-hand lane offset `half·0.5` (0 on one-ways), heading smoothing, brake on negative throttle, U-turn once after 0.6 s held at speed < 8 m/s (re-armed by releasing), turn booking kept until a junction offers a 35°–150° turn on that side (U-turns >150° only when nothing else), stick heading picks the branch on the map camera, dead ends and map edges stop with an event, route following with slow-down near the goal.

- [ ] **Step 1: Failing tests** on a synthetic `+`-junction and a curved road:
```js
test('keeps to the right lane through a curve', …)         // distance from centreline ≈ half*0.5, never > half
test('booked right turn is taken at the junction', …)     // heading changes by +90°±20°
test('booked left turn survives a junction with no left', …)
test('holding brake at a standstill turns round once', …)  // dir flips once in 3 s of holding
test('route reaches a target two junctions away', …)
test('prefers the legal direction of a one-way', …)
test('carNeedsRoad: createCar returns null 700 m from any road', …)
```
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(3d): road graph and road-following car with turns and routing`

### Task 8: Trees and street lamps

**Files:**
- Create: `app3d/src/world/props.js`, `app3d/src/sim/lampspots.js`, `app3d/tests/lampspots.test.js`

**Interfaces:**
- Produces: `lampSpots(graph, collider, isWater, isUrban, isForest) -> [{x,y,yaw}]` (pure; spike rules: town roads only — primary/secondary/tertiary(+links) every 34–38 m, residential/unclassified every 44 m; both kerbs staggered at `half+2.2` m; skip within `half+16` m of junction nodes, where another road is within 1.2 m, inside/near buildings (pad 3), water, forest; arm yaw toward the road); `class Props { constructor(scene, field, features, collider, graph); update(camRenderPos, quality); setNight(lamps, pools) }` — instanced trees (pine/broadleaf from the spike, seeded per 2 km chunk, density from forest mask and wood/park polygons, max 6000/chunk-ring on high, 2500 on low, chunks within 4 km) and instanced lamps (spike design: plinth, tapered pole, curved arm, LED head ×1.25, lens emissive, night light pool).

- [ ] **Step 1: Failing tests** on a synthetic straight tertiary road with a junction and a building: spots alternate sides, none within `half+16` of the junction, none inside the building pad, spacing 38±1 m.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(3d): streamed trees and street lamps`

### Task 9: Movement for walk, bike, planes and mode switching

**Files:**
- Create: `app3d/src/sim/player.js`, `app3d/tests/player.test.js`

**Interfaces:**
- Consumes: `createCollider`, `buildRoadGraph`/`createCar`/`driveCar`, `WaterGuard` from `dist/water.js`, `RoadNavigator` from `dist/navigation.js` (built on the decoded features in game frame), `HeightField`.
- Produces: `createPlayer({x, y, mode, movementMode, speedSetting}) -> player`; `stepPlayer(player, input:{x,y, camYaw, camMode, turn, target}, services, dt) -> {events:[]}`; `setMode(player, mode, services) -> {ok, toast}`; modes `walk|bike|car|supercar|slowplane|plane|boat`.
  - walk/bike: `movementMode 'roads'` → `RoadNavigator.move` along walking roads with water clip; `'free'` → camera-relative velocity with accel 6/s, building collision (radius 5) and water stop (as the spike); speed `78·speedSetting·factor`.
  - car/supercar: `driveCar` (follow camera: `throttle=input.y`, `turn` from `input.x` beyond ±0.45; map camera: stick heading picks branch, pointing backwards brakes).
  - slowplane/plane: spike flight (follow: x steers, y throttle/brake; map: stick heading with brake when behind), altitude `max(ground, ground ahead)+270/600` m, banking; landing to a ground mode refused over water; landing as car uses `createCar` within 600 m or falls back to walk.
  - Switching to car/supercar from the ground needs a carriageway within 600 m (`carNeedsRoad`).

- [ ] **Step 1: Failing tests**: free walk slides along a wall; water blocks walk but not plane; roads-mode walk stays on the walking graph; `setMode('car')` 700 m from roads returns `{ok:false}`; plane landing over water refused; plane landing as car far from roads becomes walk; speed equals `78*1.4*16` for plane with speed setting 1.4.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(3d): player movement for all travel modes`

### Task 10: Camera and input

**Files:**
- Create: `app3d/src/sim/camera.js`, `app3d/src/input/controls.js`, `app3d/tests/camera.test.js`, `app3d/tests/input.test.js`

**Interfaces:**
- Produces: `createCamera(mode:'tilt'|'follow') -> cam`; `stepCamera(cam, player, dt, {userYaw, pitchAdj, zoom}) -> {position:[X,Y,Z], target:[X,Y,Z], fov}` (spike `updateCamera`: per-mode base distances from Global Constraints, pitch clamp 4–88°, zoom 0.2–4, follow re-aligns yaw to heading after 2.2 s without touch, lead by velocity, FOV widens with speed, never below terrain+12 m).
- `createControls(canvas, {onTap}) -> {read() -> {x,y,turn,gestures}, reset()}`: floating stick on the left 42% for touch, right-side drag rotates (`dx·0.006` rad) and tilts (`dy·0.18`°), two-finger pinch zoom and vertical tilt, wheel zoom (Shift tilts), keys WASD/arrows/E/C/T/Q/R/F/+/−/1–6, gamepad axes; `setPointerCapture` in try/catch; resets on `blur`, `visibilitychange` hidden, `pointercancel`, `lostpointercapture`.

- [ ] **Step 1: Failing tests**: pitch never leaves 4–88 for any `pitchAdj`; zoom clamps; follow yaw converges to heading; camera Y ≥ terrain+12; `inputResetsOnBlur` — after a synthetic stick drag then `blur`, `read()` returns zero motion (use a minimal fake `EventTarget` canvas).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(3d): orbit camera and touch, mouse, keyboard and gamepad input`

### Task 11: Actors, places, NPCs, ferry and saving

**Files:**
- Create: `app3d/src/world/actors.js`, `app3d/src/world/places.js`, `app3d/src/sim/arrival.js`, `app3d/src/game/session.js`, `app3d/src/game/ferry.js`, `app3d/tests/arrival.test.js`, `app3d/tests/session.test.js`
- Create: `tools/3d/export_pokju_models.mjs` and generated `app3d/public/models/{car,supercar}.glb` (pokju-edu `dolphin` and `p911`, via the patched-copy method in `spike/3d-naepo/README.md`)

**Interfaces:**
- `arrival.js`: `nearestPlace(places, player, collider) -> {place, distance}` and `arrivals(places, from, to, held, mode, collider) -> place[]` — `dist/geography.js` `updateEncounters` for walk/bike, plus building contact (`collider.distance(place.ring) + 10`) and car/supercar reach 110 m; never while flying.
- `session.js`: `loadSession(storage) -> {state, extra}` (via `sanitizeState`; `extra` from `hongseong-3d-v1` with defaults `{camera:'tilt', time:'day', quality:'auto', travel:null}`); `startPosition(state, services) -> [x,y]` (from `locations.county`, else `world.start`; moved to dry land with `WaterGuard.nearestLand`, out of buildings with `collider.resolve(…, 6)`, clamped inside bounds — test `startPositionIsSafe`); `saveSession(storage, state, extra, player)` (writes `locations.county`, shared `travelSpeed` mapping from Global Constraints, `extra.travel` = real mode; during a voyage saves the departure dock); `discover`, `answer`, `recordQuestVisit` from `dist/core.js`/`dist/quests.js` used unchanged.
- `ferry.js`: `startVoyage(returning, docks) -> voyage`, `advanceVoyage(voyage, dt) -> {x, y, heading, done}` (8 s linear, docks = `WaterGuard.nearestLand` of `namdang` and `tourmap-jukdo` points).
- `actors.js`: explorer/boy/raccoon walk sheets as camera-facing sprites (8×4 frames, `walk-cells.js`, chroma key `isChroma` from `dist/sprites.js`, outfit tint via a colour matrix matching `OUTFIT_FILTERS` hue/saturation), bike as the `motion-bike.png` billboard (8×2), car/supercar GLBs, slow plane (no propeller) and jet from the spike, a boat; NPC billboards from `npc-v12.png`/atlas with a "···" bubble; `createNpcs` and `SPARSE_NPCS` from `dist/` for the 58 positions; talk radius 80 m.
- `places.js`: 223 mapped places as pins, light columns and name labels (spike), `place.ring` = building containing the point.

- [ ] **Step 1: Failing tests**: `arrival` — walking into a 36 m radius fires once until leaving; a place inside a building fires on touching the wall; car fires within 110 m, plane never; `session` — round trip keeps coins/discovered; slowplane saves `travelSpeed:'plane'` and `extra.travel:'slowplane'`; `startPositionIsSafe` for positions in the sea, inside a building and outside bounds; voyage reaches the far dock at t=8 s.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(3d): actors, places, NPCs, ferry and saving`

### Task 12: Temporary HUD, place dialog, integration and preview

**Files:**
- Modify: `app3d/index.html`, `app3d/src/main.js`
- Create: `app3d/src/ui/hud.js`, `app3d/src/ui/place-dialog.js`, `app3d/tests/smoke.mjs` (Playwright script, run with `node app3d/tests/smoke.mjs`)

**Interfaces:**
- Consumes everything above. `main.js` boot order: fetch `data/world.json`, `features.json`, `buildings.json`, `heights.png` with a progress line in `#loading`; build services; restore session; start the loop (simulate → camera → actors/world updates → ground/props/buildings `update` → post render → auto quality every 2 s → save every 2 s while moving and on `visibilitychange`).
- HUD (spike style, temporary): travel buttons for the six modes with ×factor labels, camera/time/quality buttons, zoom/tilt pad, compass, address label via `districtAt`, coins and discovered count, turn hint, arrival banner, NPC talk button, ferry button near 남당항/죽도, credit line ("실제 고도·도로·물길·건물·장소 좌표 위에 만든 3D 지도예요. 나무, 가로등, 일부 집은 분위기를 위한 장식이에요." plus OSM/Terrarium attribution).
- `place-dialog.js`: story pages (`p.pages`), quiz (`p.quiz`) with `answer`, reward via `discover`/`recordQuestVisit`, `#read-aloud` with `Narrator` from `dist/audio.js` — plain styling (phase 2 restyles it).

- [ ] **Step 1: Write `smoke.mjs`**: serve `build/app3d` with a static file server, open in Chromium (`--use-angle=swiftshader`) at 1280×760 and 390×844 with touch, wait for `window.__hs3d.ready`, assert no `pageerror`, switch through all six modes, drag the stick and assert the player moved, force `WEBGL_lose_context` and assert `#lost` is visible, save screenshots to the scratch folder.
- [ ] **Step 2: Run `npm run build:3d && node app3d/tests/smoke.mjs`** — Expected: FAIL before integration.
- [ ] **Step 3: Implement the HUD, dialog and boot wiring; expose `window.__hs3d = {ready, player, setMode, applyTime, info()}`.**
- [ ] **Step 4: Run `npm run test:3d && npm run build:3d && node app3d/tests/smoke.mjs && node --test tests/*.test.js`** — Expected: all PASS; screenshots show terrain, sea on the west, buildings in 홍성읍/내포, the explorer.
- [ ] **Step 5: Commit** `feat(3d): temporary HUD, place dialog and boot integration`
- [ ] **Step 6: Publish the build as a multi-file artifact** (page `build/app3d/index.html`, its `assets/`, `data/`, `models/` through `files`) and record the URL in `tools/3d/README.md`.
