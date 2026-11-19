# 홍성 3D판 2a단계: 폭주구구단식 화면과 모든 기능 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the 3D app (`app3d/`) the pokju-edu look and layout and every feature the 2D game has, so phase 2b can switch the live address to it.

**Architecture:** A pure game controller (`app3d/src/game/controller.js`) owns screens, dialogs, missions and the play/pause state; `main.js` shrinks to boot + frame loop + wiring. UI is plain DOM modules under `app3d/src/ui/`, one per screen, all styled from one token sheet (`app3d/src/ui/theme.css`) copied from pokju-edu's `src/page.html` `:root`. The 2D game's pure modules are reused through the `#game/*` alias (`core.js`, `quests.js`, `search.js` `searchPlaces`, `wardrobe.js`, `audio.js`, `content.js`, `release.js`); nothing under `dist/` changes.

**Tech Stack:** Three.js 0.187.0, Vite 8.3.5, Node `node --test`, Playwright smoke, `@fontsource/black-han-sans` (display), NanumSquareRound (body, already bundled).

**Spec:** `docs/superpowers/specs/2026-11-19-hongseong-3d-design.md` §5 (screens), §6 (wardrobe effects in 3D), §2 goal 2 (every feature), §3 (copy, sizes, save). Follow-ups: `docs/superpowers/plans/2026-11-19-hongseong-3d-phase1-followups.md`.

## Global Constraints

- Everything from phase 1's Global Constraints still binds (save key `hongseong-adventure-v1` via `sanitizeState`, `version: 1`, 3D-only values in `hongseong-3d-v1`, travelSpeed mapping, speeds, sizes, camera ranges, no runtime CDN, decorative objects carry no text, `localStorage` in try/catch). Do not modify `dist/`, `tests/`, `vercel.json`, `.github/`; reach the 2D game only through `#game/*`.
- Look (pokju-edu tokens, verbatim): page `#0b0c18`; glass chip `rgba(14,16,30,.66)` + sheen `linear-gradient(to bottom, rgba(255,255,255,.12), rgba(255,255,255,.02) 40%, rgba(255,255,255,0))` + 1px `rgba(255,255,255,.16)` border + `backdrop-filter: blur(10px) saturate(1.2)` (no blur on low quality); text `#fff`, sub text `rgba(200,215,255,.78)`; accent `#7c5cff`; ok `#35e08a`; danger `#ff5468`; warn `#ffb52e`; cyan `#22e1ff`; magenta `#ff2d95`; action gradient `linear-gradient(90deg,#22e1ff,#8a5cff 55%,#ff2d95)`; panel radius 20 px, chip radius 16 px; big centre notice 72 px display face with coloured glow. Display face: Black Han Sans (bundled woff2, OFL). Body face: NanumSquareRound (bundled).
- Sizes: every sentence a child reads ≥ 15 px; button/chip labels ≥ 13 px (factor/sub labels ≥ 12 px); every interactive control ≥ 44×44 px at 1280×760, 1024×768 (tablet, coarse pointer) and 390×844 / 844×390 (phone); nothing interactive overlaps the left 42% stick zone's lower 45% on touch devices; safe-area insets respected.
- Copy is Korean; game wording reuses the 2D game's strings where a feature exists there (mission text, shop names, place labels, help sections).
- Dialogs: `role="dialog"`, `aria-modal="true"`, focus moves in on open and back to the canvas on close, the rest of the UI is `inert` while a dialog is open, Escape closes, the simulation pauses and the renderer drops to ≤ 10 fps behind dialogs and menus.
- Sounds through `GameAudio` (`#game/audio.js`) with the 2D names (`click`, `move`, `arrival`, `chime`, `correct`, `retry`, `coin`, footsteps); narration through `Narrator`.

## Review Focus

1. A save from the 2D game with missions from yesterday → today's missions are refreshed on boot and on day change, the old day's ledger is untouched (Task 2 test `refreshesStaleMissions`).
2. Buying an item the child cannot afford, or toggling an owned one → coins never go negative, equipped state follows `purchase` exactly (Task 4 test `shopFollowsCorePurchase`).
3. Importing a broken or oversized 이어하기 file → rejected with a message, current progress untouched (Task 5 test `importRejectsBadFiles`).
4. Opening a dialog while driving at speed, then closing it → the car resumes from rest, no input stuck, no double arrival (Task 2 test `dialogPausesAndResumes`).
5. Phone landscape with a dialog open → every control reachable, nothing under the stick zone (Task 9 smoke overlap check).

---

### Task 1: Theme, fonts and UI primitives

**Files:** Create `app3d/src/ui/theme.css`, `app3d/src/ui/dom.js`, `app3d/tests/dom.test.js`; Modify `package.json` (devDependency `@fontsource/black-han-sans` pinned exact, version published ≥ 2 weeks ago), `app3d/index.html` (load theme, drop the temporary paper styles).

**Interfaces:**
- Produces: CSS classes `.chip`, `.panel`, `.btn` (`.btn-grad` primary, `.btn-ghost`), `.tabs` + `[role=tab][aria-selected]`, `.card`, `.dots`, `.badge`, `.notice` (big centre notice), `.toast`, `.gauge`, `.round` (round action button ≥ 64 px), `.scrim`; layer z-indexes as CSS variables.
- `dom.js` (pure helpers, no globals): `el(tag, attrs, ...children)`, `escapeHtml(s)`, `openModal(dialogEl, {root, returnFocus})` / `closeModal(dialogEl)` (inert siblings, focus first control, Escape), `fits44(rect)`, `overlaps(a, b)`.

- [ ] Step 1: failing tests for `escapeHtml`, `fits44`, `overlaps` (touching edges don't overlap) and `openModal`/`closeModal` with a minimal fake DOM (siblings get/lose `inert`, focus target recorded).
- [ ] Step 2: run `npm run test:3d` — FAIL.
- [ ] Step 3: implement; restyle the existing temporary HUD and dialogs with the new classes so the app keeps working.
- [ ] Step 4: `npm run test:3d && npm run build:3d && node app3d/tests/smoke.mjs` — PASS (existing smoke size checks still hold).
- [ ] Step 5: commit `feat(3d-ui): pokju-style theme, fonts and modal helpers`.

### Task 2: Game controller and missions

**Files:** Create `app3d/src/game/controller.js`, `app3d/src/game/missions.js`, `app3d/tests/controller.test.js`, `app3d/tests/missions.test.js`; Modify `app3d/src/main.js` (move orchestration into the controller).

**Interfaces:**
- `missions.js`: `refreshMissions(state, {places, player, navigator, now, random, force})` — port of `dist/game.js` `refreshQuests` (roads mode and not flying: nearest 60 places, > 220 m, reachable by `navigator.route(pos, p.point, 350)`; else all mapped places) → `ensureQuests`; `missionView(state, places)` → `{heading, target:{id,name,area}|null, dots:[ 'done'|'active'|'open' ], direct, bonus}` with the 2D strings (`오늘의 첫 탐방` / `오늘의 탐방 미션`, `다른 장소 안내를 열지 않고 도착하면 +50금화!`, `다른 곳에 들렀어도 괜찮아요. 목표를 찾아 미션을 마쳐요.`, `오늘의 미션을 완성했어요!`).
- `controller.js`: `createController({state, places, services, save, sound, narrator, clock})` → `{screen:'title'|'play', dialog:null|{kind, data}, paused():boolean, open(kind, data), close(), onArrive(place, physical), onNpc(npc), startMission(id), goTo(placeId), setMode(mode), dayTick(now)}`; dialog kinds `place`, `npc`, `ferry`, `menu`, `map`, `search`, `nearby`, `help`; a queue so a second arrival while a dialog is open waits; `open` stops the player (speed 0, target cleared, input reset hook).

- [ ] Step 1: failing tests: `refreshesStaleMissions` (yesterday's `dailyQuests` → new day's three targets; ledger unchanged); `missionView` strings and dots; `dialogPausesAndResumes` (arrive while driving → paused, speed 0; close → play, one arrival only); queued second arrival opens after the first closes; `startMission` sets `direct` false when already within reach (2D `selectQuest` rule).
- [ ] Step 2: run — FAIL.
- [ ] Step 3: implement; main.js calls the controller; refresh on boot, on `visibilitychange` when the KST day changes, and when the mission panel opens.
- [ ] Step 4: `npm run test:3d && npm run build:3d && node app3d/tests/smoke.mjs` — PASS.
- [ ] Step 5: commit `feat(3d-ui): game controller and daily missions`.

### Task 3: In-game HUD

**Files:** Create `app3d/src/ui/hud.js` (replace), `app3d/src/ui/minimap.js`, `app3d/src/ui/gauge.js`, `app3d/tests/gauge.test.js`; Modify `app3d/index.html`, `app3d/src/main.js`.

**Interfaces:**
- HUD layout (pokju `#hud`): top-left chips — address, coins, `발견 n / 223` with a progress bar; top-centre mission card (heading, target name, dots, direct-bonus badge, `길 안내` button → controller `goTo`), collapsible on phone portrait (state in `hongseong-hud-v1` like the 2D game); top-right round minimap (`minimap.js`: `createMinimap(canvas, {image, world, places})` → `draw(player, target, yaw)`, county image `#game/assets/map-view-county-v13.webp`, player dot, target pin, north mark; tap → `map` dialog); bottom-right: speedometer (`gauge.js`: `gaugeAngles(speed, max)` pure + canvas draw, shows `×N` and km/h-like number = speed·3.6 rounded), round buttons `탐방` (E), `대화` (when an NPC is near), `탈것` (opens a radial picker of six modes), car turn buttons; left: floating stick (existing); camera pad + compass (existing, restyled); home button → `menu`; centre `.notice` for `도착!`, `새로운 발견! +N금화`, `직행 미션 성공! +50금화`, `정답!`/`다시 생각해 봐요` with green/red glow; toasts.
- Big notice also triggers the post `grade` flash (`uFlash`, ok/danger colours) unless motion is reduced.

- [ ] Step 1: failing tests for `gaugeAngles` (0 → start angle, max → end angle, clamps above max) and the km/h number.
- [ ] Step 2: run — FAIL.
- [ ] Step 3: implement; extend `smoke.mjs`: at all four viewports every HUD control ≥ 44×44, no overlap with the stick zone on touch viewports, minimap draws (non-blank pixels), notice appears on arrival.
- [ ] Step 4: `npm run test:3d && npm run build:3d && node app3d/tests/smoke.mjs` — PASS; look at the screenshots.
- [ ] Step 5: commit `feat(3d-ui): pokju-style HUD, minimap and speedometer`.

### Task 4: Title and menu (탐방 · 탈것 · 꾸미기 · 수첩 · 설정)

**Files:** Create `app3d/src/ui/menu.js`, `app3d/src/ui/shop.js`, `app3d/src/ui/thumbs.js`, `app3d/tests/shop.test.js`; Modify `app3d/index.html`, `app3d/src/main.js`.

**Interfaces:**
- Title (pokju `#menu`): game name `홍성 탐험대` in the display face, `#wallet` coins, primary `이어하기` (or `탐방 시작` on a fresh save), tabs:
  - **탐방**: three mission cards (`missionView`), each `출발` → controller `startMission`; `새 미션 받기` when all are done.
  - **탈것**: six cards (walk, bike, car, supercar, slow plane, plane) with a rendered thumbnail (`thumbs.js`: renders each model/sprite once into a 256² canvas with the main renderer, cached), label, `×N`, one-line description; choosing sets the mode (respecting `setMode` refusals).
  - **꾸미기**: character cards (explorer/boy/raccoon, outfit-tinted sprite thumbnails) and the six 2D shop categories with the 22 items (`SHOP`, `SHOP_CATEGORIES`); buy/equip/unequip through `purchase(state, id)`; price chips; disabled when unaffordable.
  - **수첩**: tab content from Task 5.
  - **설정**: sound, music, volume, voice + test, motion (reduce), speed (0.75/1/1.4), movement mode (길로만/자유롭게), quality (자동/높음/보통/낮음), camera (비스듬히/뒤따라), time (낮/노을/밤), help, sources, about, QR, reset progress (two-step confirm in the page), `가벼운 2D로 열기` (link `./2d/`, hidden until phase 2b sets a flag).
- `shop.js`: `shopView(state, category)` pure → cards `{id, name, price, owned, equipped, affordable}`.

- [ ] Step 1: failing tests: `shopFollowsCorePurchase` (unaffordable → state unchanged; buy → coins drop by price, item equipped; click again → unequipped, coins unchanged; never negative); `shopView` flags.
- [ ] Step 2: run — FAIL.
- [ ] Step 3: implement; menu opens at boot (title) and from the home button; the world keeps rendering behind at ≤ 10 fps.
- [ ] Step 4: `npm run test:3d && npm run build:3d && node app3d/tests/smoke.mjs` (smoke: open each tab at every viewport, sizes, buy an item with seeded coins) — PASS.
- [ ] Step 5: commit `feat(3d-ui): title menu with missions, vehicles, wardrobe and settings`.

### Task 5: Journal, notes, export and import

**Files:** Create `app3d/src/ui/journal.js`, `app3d/src/game/files.js`, `app3d/tests/files.test.js`; Modify `app3d/src/ui/menu.js`.

**Interfaces:**
- Journal (menu tab and HUD button): stats (발견 n/241, 퀴즈 n/241, 탐험 점수), filters `전체/발견/역사/생활`, cards with stamp glyph (`STAMPS[equipped.stamp]`), discovered/remote → place dialog replay (non-physical), undiscovered → `goTo`; note textarea (≤ 1000 chars, saved on input); buttons `결과 내려받기`, `이어하기 파일 저장`, `이어하기 파일 불러오기`.
- `files.js` (pure): `resultText(state, places, now)` — the 2D `exportResult` text (BOM, counts, discovered list with quiz status, note, mission ledger); `saveFile(state)` → JSON string (2D format); `readSaveFile(text, size)` → `{ok, state}` or `{ok:false, reason}` (> 200 000 bytes, bad JSON, `version !== 1`, missing `discovered` array → rejected; else `sanitizeState`).
- Downloads use an `<a download>` blob link (works on the game's own site); import uses a file input and a confirm step before replacing progress and reloading.

- [ ] Step 1: failing tests `importRejectsBadFiles` (oversize, bad JSON, version 2, no discovered) and accepts a real 2D save; `resultText` contains the discovered names and the note; `saveFile` round-trips through `readSaveFile`.
- [ ] Step 2: run — FAIL.
- [ ] Step 3: implement.
- [ ] Step 4: tests, build, smoke (journal tab and filters) — PASS.
- [ ] Step 5: commit `feat(3d-ui): discovery journal, notes and save files`.

### Task 6: Place dialog, quiz and rewards

**Files:** Modify `app3d/src/ui/place-dialog.js` (rewrite); Create `app3d/src/ui/sources.js`; Modify `app3d/src/main.js`.

**Interfaces:**
- Story view (pokju `#qbox` look): hero image with the 2D kind label (`실제 사진` when `photo`, `실제 지형 자료` when `mediaType==='map'`, else `이해를 돕는 삽화`), caption, tag, page `n / m`, `← 이전` / `다음 이야기 →` / `발견 퀴즈 →`, `▷ 설명 읽기` (Narrator), `사진·자료 출처` / `학교 사진·자료` → `sources.js` (school details and links, photo credit from `#game/assets/photo-credits.json`, `locationNote`, `locationSource`, `storySources`, `source`, back button).
- Quiz view: question, three big option buttons, wrong → `retry` sound + hint + red notice, right → `correct` sound + explain + green notice; `나중에 풀기`, `이야기 다시 보기`.
- Reward view: coins (discovery + quiz + mission bonus) and XP, `coin` sound, `발견 수첩 보기` / `계속 탐방하기`.
- Uses `openModal`/`closeModal` (focus, inert, Escape) and the controller's queue; page HTML from content is trusted repo content (other text via textContent).

- [ ] Step 1: extend the smoke: open a place by arrival, page through, answer wrong then right, see the reward, close; focus returns to the canvas; Tab never reaches HUD buttons while open.
- [ ] Step 2: run the smoke — FAIL on the new checks.
- [ ] Step 3: implement.
- [ ] Step 4: tests, build, smoke — PASS.
- [ ] Step 5: commit `feat(3d-ui): place story, quiz and reward dialog`.

### Task 7: Full map, search and nearby

**Files:** Create `app3d/src/ui/county-map.js`, `app3d/src/ui/search.js`, `app3d/tests/county-map.test.js`; Modify `app3d/src/main.js`.

**Interfaces:**
- `county-map.js`: `createCountyMap(canvas, {image, places, districts, onSelect})` with `mapTransform(view, w, h)` pure (zoom 1–10, pan clamped, pinch, wheel, drag, tap pins within 16 px; multiple hits → nearby list); dialog lists the 11 홍성 districts with counts → district place list; the 18 remote story cards; legend with the 2D symbol colours; `찾아가기` → controller `goTo`.
- `search.js`: combobox over `searchPlaces` (`#game/search.js`) with IME composition guard (no selection on composing Enter), arrow keys, Enter, Escape, touch; `nearby` list with the 2D `PLACE_FILTERS` and substring filter, sorted by distance.

- [ ] Step 1: failing tests for `mapTransform` (zoom clamp, pan clamp keeps the map on screen, screen↔map round trip).
- [ ] Step 2: run — FAIL.
- [ ] Step 3: implement; smoke: open map, zoom, pick a district, search `ㅎㅅㅇ` and `홍성역`, choose a result → route starts.
- [ ] Step 4: tests, build, smoke — PASS.
- [ ] Step 5: commit `feat(3d-ui): county map, search and nearby places`.

### Task 8: NPC, ferry, help, about, QR and sound

**Files:** Create `app3d/src/ui/npc.js`, `app3d/src/ui/help.js`, `app3d/src/ui/qr.js`; Modify `app3d/src/main.js`.

**Interfaces:**
- NPC dialog: portrait (sprite frame drawn to a canvas), name, topics `region` / `help` / `mission` with the 2D texts (`npc.history`, `npc.story`, mission prompt), `미션 시작`/`새 미션 받기` (controller), `▷ 읽어 주기`.
- Ferry dialog (2D wording), voyage status chip, `죽도에서 돌아가기` button on 죽도.
- Help: how to play (3D controls: stick, drag to turn/tilt, pinch/wheel zoom, tap to go, E/C/T/Q/R/F, 1–6), teacher notes (2D section), map and data sources with download links to `#game` files, photo credits, settings shortcuts; About from `RELEASE`; QR (`qr.js`: shows the 2D game's own `#game/assets/demo-qr.png`, which already points at the live address, with the 2D wording; phase 2b revisits the address).
- Sound: `GameAudio` wired (click on buttons, footsteps while walking/biking, arrival/chime/correct/retry/coin, music loop when on); unlock on first pointer/key.

- [ ] Step 1: smoke additions: talk to an NPC, open help/about/QR, toggle sound and music (no errors), ferry dialog at 남당항.
- [ ] Step 2: run — FAIL on the new checks.
- [ ] Step 3: implement.
- [ ] Step 4: tests, build, smoke — PASS.
- [ ] Step 5: commit `feat(3d-ui): NPC talk, ferry, help, about, QR and sound`.

### Task 9: Wardrobe effects in 3D, phase-1 follow-ups, final smoke and preview

**Files:** Modify `app3d/src/world/actors.js`, `app3d/src/sim/player.js`, `app3d/src/main.js`, `app3d/src/world/actor-assets.js`, `app3d/tests/smoke.mjs`, `app3d/tests/player.test.js`.

**Interfaces:**
- Trails: the equipped `TRAILS` glyph/colour dropped as fading sprites every 130 ms behind a walking/biking player (1.5 s life); ring: the equipped `RINGS` colour as a ground ring under the player; journal colour/stamp shown in the journal (Task 5).
- Follow-ups: cancelled landing uses `max(ground, water level)` as the descent floor (test); `info()` reports `lampsShown` and the smoke asserts it > 0 at night in town; character sheets other than the equipped one load lazily; two-finger still touch is not a tap; tap during a voyage is ignored; car turn button clears a stale target ring.
- Final smoke covers every screen at the four viewports with sizes and overlaps, and saves screenshots.

- [ ] Step 1: failing tests (landing floor over water; trail/ring config from `state.equipped`).
- [ ] Step 2: run — FAIL.
- [ ] Step 3: implement.
- [ ] Step 4: `npm run test:3d && npm run build:3d && node app3d/tests/smoke.mjs && node --test tests/*.test.js` — PASS; look at the screenshots.
- [ ] Step 5: commit `feat(3d-ui): wardrobe effects in 3D and phase-1 follow-ups`.
