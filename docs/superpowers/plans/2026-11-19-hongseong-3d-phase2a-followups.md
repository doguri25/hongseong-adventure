# 3D판 2a단계 후속 과제와 결정 기록

2a단계(폭주구구단식 화면, `app3d/src/ui`, `app3d/src/game`) 작업 중 내린 결정과, 2b단계로 넘기는 과제를 모은 기록이다. 계획: `docs/superpowers/plans/2026-11-19-hongseong-3d-phase2a-ui.md`. 커밋 c812ed7..442c2cd.

## 2b단계 첫 작업 (전체 검토 후 남은 것, Ruling P32)

1. **길 안내를 같은 장소로 다시 누르면 길 끝에서 장소가 안 열림 (중요).** `app3d/src/game/travel.js` `startTrip`이 `player.routeAccess`만 지우고 `player.route`/`routeKey`는 남겨 새 경로를 다시 짜지 않는다. 길에서 먼 장소(약 30곳, 예: 홍성초등학교)는 접근점 규칙으로만 열리므로 다시 누르면 길 끝에서 멈춘다. 고침: `startTrip`에서 `player.route`와 `routeKey`도 비워 2D `walkTo`처럼 항상 경로를 다시 짠다. `travel.test.js`에 다시 누르기 사례를 넣는다.
2. **배 타기 창이 열릴 때 거짓 안내 (작음).** 남당항 150 m 안에서 배 타기 창 자체가 열리면 `stopPlayer`가 `G.note = FERRY_STOPPED`를 남겨 배가 떠날 때 "배 타러 가는 길을 멈췄어요"가 뜬다. 고침: 여는 창이 `ferry`면 건너뛰거나 `onBoard`에서 `G.note`를 지운다.
3. **오른쪽에 손가락을 올려 둔 채 다른 손 탭 (작음, 기존 코드).** `app3d/src/input/controls.js:39,43`의 `pointers.size > 0`은 `TAP_MS` 창이 없어, 오른쪽에 가만히 둔 손가락이 다른 손의 탭을 두 손가락으로 만든다. I3과 같은 방식(두 번째 손가락이 `TAP_MS` 안에 닿을 때만)으로 고친다.

## 2b단계로 넘기는 기타 과제

- 도움말 자료 내려받기 파일(map-county.json 7.7 MB 등)을 3D 빌드에 다시 묶지 말고 `./2d/` 쪽 2D 사본을 가리키게 한다(P27, 빌드 35→44 MB).
- 내려받기 주소가 `#game/` 그대로 남지 않았는지 스모크에서 검사한다(dist 이동 때 중요).
- QR 주소(사양 13-1), `LITE_2D` 표시, 첫 내려받기 양 줄이기(구역별 자료 분할 — 2a는 캐릭터 그림 지연 불러오기만 함).

## 미뤄 둔 작은 문제 (전체 검토에서 "그대로 둠" 판정)

- 화면 읽기 프로그램: 미션 접기 단추의 이름 덮어쓰기, 창이 열린 동안 큰 알림·오류 안내가 읽히지 않음(M4는 눈에만 보이게 고침).
- 휴대폰 가로(844×390): 메뉴·수첩 칸이 좁아 스크롤, 지도 확대 칸과 첫 안내가 핀을 가림, 긴 이야기 쪽에서 보상 줄이 아래로 밀림.
- 지도 −/+가 끝에서 비활성이 되어 키보드 초점을 잃음(`aria-disabled` 권장), 검색 목록을 닫은 뒤 Enter가 첫 결과로 감, 도움말 탭 클릭 시 초점 이동 없음(Safari).
- 구조: 롤링 탭 코드가 menu·county-map·help·npc 네 곳에 복사, 패널 창 틀이 help.js에 있음, place-dialog의 그림 표가 PLACES 이미지를 손으로 따라 적음, search.js가 2D PLACE_FILTERS를 복사, main.js 868줄.
- 작은 동작: 수첩 메모가 글자마다 저장, 소리 중복 막기 40 ms, 배 위 속도계 1536, 비행기 아래 땅에 고리, 자동차 길 끝이 장소에서 110 m 넘으면 아무것도 안 열림, 창이 열리면 길 안내가 조용히 끝남(배 길만 안내).
- 시험: 지도·검색·수첩·장소 창의 DOM 흐름은 스모크로만, 몇몇 약한 스모크 단정(`.help-sec li`, 걷지 않으면 통과하는 발소리 검사).

## 결정(Ruling)

- Ruling P1: T6 keeps `createNpcDialog` exported from place-dialog.js (restyled) until T8 moves it to ui/npc.js — avoids breaking NPC talk between tasks — cost: one extra move.
- Ruling P2: T4 builds the 수첩 tab as an empty slot (`renderJournal(container, ctx)` stub showing discovered count) that T5 replaces; T4 settings carry only settings that exist; help/sources/about/QR entries arrive in T8 — keeps each task testable — cost: T8 edits menu.js.
- Ruling P3: controller.open(kind) for a kind with no renderer yet records state and is a UI no-op (closes immediately, no pause) until the owning task — cost: none visible.
- Ruling P4: T2 controller takes optional `sound`/`narrator` with no-op defaults; T8 passes GameAudio/Narrator. T2 owns the paused render throttle (≤10 fps while paused) in main.js — cost: none.
- Ruling P5: smoke TEXT_15 (15 px) / LABEL_MIN (13 label, 12 factor) lists follow the new selectors whenever a task replaces markup; floors never lowered; touch overlap with stick zone checked from T3 on.
- Ruling P6: replaced hud.js keeps `josa` export and hud.test.js passing.
- Ruling P7: assets from dist/ come through `#game/...` imports or `new URL(...dist..., import.meta.url)`; either is fine if `vite build` bundles only the files used.
- Ruling P8: QR uses dist/assets/demo-qr.png (same address as the 2D game); no qrcode dependency (plan edited before commit).
- Ruling P9: 탐방 round button/E = open nearest reachable place (2D "탐방하기" rule); E priority NPC → ferry → place; 대화 button only near NPC — matches 2D help text "가까운 장소는 E 키나 탐방하기 버튼으로" — cost if wrong: button relabel.
- Ruling P10: HUD collapse pref uses 2D's hongseong-hud-v1 shape {portrait,landscape,desktop} booleans — keeps both games compatible.
- Ruling P11: settings rows 도움말/자료 출처/만든 사람/QR are laid out hidden with data-open="help|sources|about|qr"; T8 un-hides each as it registers the renderer — no dead buttons on the branch — cost if wrong: T8 re-lays rows.
- Ruling P12: boot opens the title menu through ctl.open('menu',{title:true}) so it pauses (ctl.screen 'title' while open); 이어하기/탐방 시작 and Escape close it into play; the home button opens the same menu during play — cost if wrong: one label/flag.
- Ruling P13: sound/music/volume/voice settings write state + save now; audible effect arrives with GameAudio/Narrator in T8 (P4). Voice list from speechSynthesis.getVoices() (ko first, 'auto' default); 들어 보기 calls narrator.speak (quiet until T8) — cost if wrong: T8 wires one call.
- Ruling P14: character choice and outfit equip apply live via Actors.setCharacter/setOutfit; trails/rings/journal colour stay T9/T5 — cost if wrong: none (later tasks build on state.equipped).
- Ruling P15: reset progress ports 2D "이 기기 기록 초기화" semantics (2D game.js) with an in-page two-step confirm; 3D-only extra (camera/time/quality) is kept — cost if wrong: one line.
- Ruling P16: "HUD button" for the journal = the HUD's existing discovery chip becomes a ≥44 px button opening the menu at the 수첩 tab (ctl.open('menu',{tab:'journal'})); no new HUD chip (spec 5.2 lists none). Task 6's 발견 수첩 보기 uses the same call — cost if wrong: one extra HUD button later.
- Ruling P17: files.js takes over menu.js's local backup download helper (T4 minor); the import confirm reuses T4's G.resetting guard so pagehide cannot write the old state back before reload — cost if wrong: none.
- Ruling P18: journal card actions close the menu first: discovered/remote → ctl.open('place',{place,physical:false}); undiscovered → ctl.goTo(id) — cost if wrong: return-to-journal flow later.
- Ruling P19: remote (story-only) places follow 2D goToPlace/visit: ctl.goTo(remote id) opens the place dialog with physical:false instead of setting a target (remote places may have no point), and the place dialog discovers a place when physical OR place.remote (2D visit() always discovers; 2D only visits non-remote places on arrival or once found, so this is the same rule). Owned by Task 6 (place dialog/controller) — cost if wrong: remote places stay undiscoverable until fixed.
- Ruling P20: keep resultText's extra 날짜 line — a teacher collecting results wants the day; it adds, never changes, 2D lines — cost if wrong: one line.
- Ruling P21: the place dialog plays sounds and reads aloud through ctx.sound/ctx.narrator (main passes ctl.sound/ctl.narrator), not its own Narrator — one wiring point for Task 8 (P4); read-aloud is quiet on the branch until T8 — cost if wrong: read-aloud silent for 2 tasks on an unreleased branch.
- Ruling P22: Escape closes only the topmost open dialog (settles the T1 minor) — dom.js keeps a stack of openModal dialogs and only the top one's handler runs — cost if wrong: small dom.js change.
- Ruling P23 (for Task 7): one 홍성군 지도 dialog serves kinds 'map', 'search' and 'nearby' with a three-view tab row 지도 / 장소 찾기 / 주변 찾기; ctl.open('search'|'nearby') opens it at that view; entry points: the HUD minimap (map, already wired) and a 장소 찾기 button in the menu's 탐방 pane (ctl.open('search')) — spec 5.2 lists no HUD search button and the HUD has no free slot — cost if wrong: one more HUD button later.
- Ruling P24: the 2D "a place already in reach opens as a visit" rule moves into controller.goTo so every 찾아가기 path (journal, place dialog 여기로 가기, mission start, map) behaves alike; the map dialog then just calls goTo. Owned by Task 8 (it touches controller routing for the ferry/죽도 too) — cost if wrong: until T8 those paths set a target the player already stands on with no arrival.
- Ruling P25: Task 8 also takes the T6 follow-ups: chime (GameAudio.play('discovery') via chime()) when the place dialog's open() returns a new discovery or mission bonus, else the controller's arrival; the real Narrator's onChange calls G.dialog.refreshVoice() and any other read-aloud label — cost if wrong: none.
- Ruling P26: settings rows 도움말 / 자료 출처 / 만든 사람 / QR (hidden with data-open per P11) are un-hidden as their renderers register: help → kind 'help', 자료 출처 → kind 'help' opened at its sources section, 만든 사람 → 'about', QR → 'qr' — cost if wrong: one kind name.
- Ruling P27: accept the build growing 35→44 MB from bundling the help's download files (map-county.json 7.7 MB, tourist map 1.1 MB) — they load only when pressed; phase 2b links them to the 2D copies under ./2d/ instead — cost if wrong: 9 MB extra deploy until 2b.
- Ruling P28: 만든 사람 heading follows the 2D showAbout product name 홍성 모험 수첩 (copy constraint) — 이후 P28 (reversed)로 뒤집음.
- Ruling P29: no ground ring when no ring is equipped (keeps the phase-1 look; the 24 m explorer is easy to spot) — 2D draws a faint default ring — cost if wrong: one line.
- Ruling P24 (widened): controller.goTo ports all of dist/world.js navigate/walkTo — routePlace (no other arrivals on the way), routeAccess (open the place at the route end when in reach or on the access point), in-reach visit, story-only, ferry — with the travel-target state in a pure game/travel.js module — cost if wrong: travel state refactor.
- Ruling P30: pin taps go through ctl.goTo like the 2D map (in reach → visit with hold; far → trip); the phase-1 far-pin story preview is dropped (the journal and map still preview) — it voided 직행 via recordQuestVisit(false) and double-opened in-reach pins — cost if wrong: re-add a preview that skips recordQuestVisit.
- Ruling P28 (reversed): keep 홍성 탐험대 in 만든 사람 as everywhere else in the 3D app (the product name is the owner's; no change made) — flagged to the owner — cost if wrong: one heading.
- Ruling P31: fix wave also takes M3 (이어하기 파일 불러오기 row in 설정 per spec 5.1), M4 (audio/voice error toasts reach the open dialog's status line), M6 (flight trip end hint), and folds T2's "goTo clears the arrival queue on a trip" and T8's "goTo refuses during a voyage" — all cheap while goTo is open; the rest of the ledger minors stay parked per the final review's triage — cost if wrong: none.
- Ruling P32: no second fix wave (process cap) — New Breakage 1 is real and load-bearing, so the smallest change is ruled and carried as the first item of the next plan (phase 2b): startTrip also nulls player.route/routeKey so the walk replans (2D walkTo always replans) + a travel.test.js repeat-press case; New Breakage 2 carried with it (skip the note when the opening dialog is 'ferry', or clear G.note in onBoard); the out-of-scope resting-right-finger multi case (controls.js:39/43 pointers.size>0 without a TAP_MS window) parked to 2b too — cost if wrong: until 2b, pressing 길 안내 twice for an off-road school can stop at the road again.
