# 3D판 1단계 후속 과제와 결정 기록

1단계(홍성군 전체 3D 세계, `app3d/`) 작업 중 내린 결정과, 2·3단계로 미룬 작은 문제를 모은 기록이다. 계획: `docs/superpowers/plans/2026-11-19-hongseong-3d-phase1-world.md`.

## 결정(Ruling)

- Ruling R1: decodeFeatures also returns `bounds:[minx,miny,maxx,maxy]` per feature (game frame) so dist/water.js, dist/navigation.js and SpatialIndex work unchanged — why: they index by item.bounds — cost if wrong: extra field only.
- Ruling R2: water carving is `carveWater(field, polygons)` in app3d/src/world/heightfield.js (added in T5), applied by main before Terrain is created (T12) — why: T3 builds meshes from the field — cost if wrong: small refactor.
- Ruling R3: player fields (T9 produces): `{x, y, h, heading, speed, vx, vy, mode, pending, alt, bank, climb, turnRate, phase, moving, car}` where x,y are game frame metres and h is render height (metres, VEX applied to ground, flight altitude added unexaggerated) — why: camera/actors/session need one shape — cost if wrong: rename pass.
- Ruling R4: Task 2 building-count threshold is >= 2000, not 2900 — the deduplicated union of game map + county export + Naepo export is 2081 (plan estimate double-counted overlaps) — cost if wrong: none, test still guards dedupe
- Ruling R5: sea/lake carving uses scanline even-odd span fill over the grid (not per-node point-in-polygon) and also lifts non-sea land below 0.3 m to 0.3 m so the OSM coastline wins over the DEM — why: 1.5M nodes x ~1000-edge sea polygon is too slow per node — cost if wrong: coastline shape tweaks
- Ruling R6: building levels/height tags are lost in the Task 2 merge (only 25 county buildings had levels); heights come from the type/area table for now — fix the pipeline merge in the final-review fix wave — why: tiny visual effect, not blocking — cost if wrong: 25 buildings at guessed heights
- Ruling R7: roads-mode walking/biking follows the walking-road graph without building collision (OSM ways that cross a footprint are passages); free-mode walking/biking and cars collide — why: collision on a road centreline would trap walkers where ways pass under buildings — cost if wrong: a few spots where roads-mode walkers visually pass a wall
- Ruling R5a (amends R5): accept Task 12's shoreRamp — the 25 m staircase coast put the waterline ~20 m off; the ramp brings it to ~2 m; land within ~37.5 m of the coast may sit below 0.3 m and coastal dikes are lowered within the band — cost if wrong: small step at band edge on piers/dikes
- Ruling R8: I5 is fixed in this wave with a single import alias (package.json "imports" {"#game/*": "./dist/*"} or equivalent Vite+Node-compatible alias) and a root resolved from import.meta.url; dist/ itself is NOT moved in phase 1 (phase 2 repoints the alias when it moves the 2D) — why: moving dist now breaks the shipped 2D and its 91 tests — cost if wrong: one alias edit in phase 2
- Ruling R9: root package.json may gain an "imports" field for R8 (version stays 1.3.6) — why: alias must work in Node tests and Vite — cost if wrong: none for the 2D build
- parked — pine shadows partly missing after cone base removal (props.js:63) — Ruling: real, deferred to phase 3 graphics polish (fix: keep base or shadowSide DoubleSide); cosmetic only
- parked — cancelled landing dips below the water plane for ~1 s (player.js:144-149) — Ruling: real, deferred to phase 2 (use max(ground, water level) as descent floor); cosmetic, no stuck state
- parked — night view from planes shows only a disc of lamps (props.js:98,153) — Ruling: real, deferred to phase 3 (keep lens+pool county-wide at night, stream bodies only); visual only
- parked — smoke reports lamps.count not lamps.shown (main.js:632) — Ruling: real, deferred to phase 2 smoke update; test-strength only
- Ruling R10: the auto ladder may end with shadows off, below the "low" preset — the final reviewer judged a steady frame rate matters more than sun shadows for a child on a weak tablet — cost if wrong: planes lose their ground shadow height cue on the weakest devices for that session

## 최종 검토에서 미룬 항목(parked)

- pine shadows partly missing after cone base removal (props.js:63) — Ruling: real, deferred to phase 3 graphics polish (fix: keep base or shadowSide DoubleSide); cosmetic only
- cancelled landing dips below the water plane for ~1 s (player.js:144-149) — Ruling: real, deferred to phase 2 (use max(ground, water level) as descent floor); cosmetic, no stuck state
- night view from planes shows only a disc of lamps (props.js:98,153) — Ruling: real, deferred to phase 3 (keep lens+pool county-wide at night, stream bodies only); visual only
- smoke reports lamps.count not lamps.shown (main.js:632) — Ruling: real, deferred to phase 2 smoke update; test-strength only

## 과제별 리뷰에서 미룬 작은 문제(deferred minor)

- Task 9: water not re-checked at touch-down (a fast plane can land in a lake during descent)
- Task 9: dt <= 0 divides by zero in climb/vx
- Task 9: landing as car can relocate the player up to 600 m at touch-down
- Task 10: two-finger still touch fires onTap
- Task 10: quick taps on the left 42% (stick zone) never reach onTap — pins/NPCs on the left can't be tapped; forward a short unmoved stick touch as a tap
- Task 10: zoom/tilt also resets the follow idle timer; stick zone uses innerWidth not canvas rect; no dispose; stale cam.base on mode switch
- Task 11: lon/lat-vs-metres bounds heuristic in startPosition; 3D save doesn't update state.region; outfit shader uses pow(1/2.2); bike frames not tinted (matches 2D)
- Task 11: walk/bike re-arm slightly stricter than updateEncounters (both endpoints must leave r+3)
- Task 12: credit block covers stick zone on touch tablets/landscape phones (require pointer:fine); action row overlaps stick zone on phones; dialogs don't return focus / no inert HUD; tap during voyage sets stale target; car turn button leaves stale G.target ring; Q key before post exists throws at boot; smoke.mjs default OUT is a session path; backdrop-filter blur cost on low quality
- Task 12: smoke checks sizes not overlaps; desktop corner credit vs travel bar overlap unverified

## 2단계에서 꼭 할 것

- `#game/*` 별칭(package.json `imports`)과 `tools/3d/prepare_world.py`의 `dist/map-county.json` 경로를 2D판을 `dist/2d/`로 옮길 때 함께 바꾼다.
- 화면 개편 때 대화창 포커스 반환과 뒤쪽 HUD `inert`, 휴대폰 동작 줄과 조이스틱 영역 겹침, 화면 겹침 검사를 넣는다.
- 일일 미션 갱신(`refreshQuests`/`ensureQuests`)을 3D에도 연결한다.
- 처음 내려받는 양(현재 약 20 MB)을 줄인다: 캐릭터 그림 지연 로드, 구역별 자료 분할.
- 계획 Review Focus 5와 설계 §9의 "low 아래로는 안 내려감" 문구를 R10에 맞게 고친다.
