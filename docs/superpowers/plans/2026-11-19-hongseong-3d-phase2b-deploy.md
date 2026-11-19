# 홍성 탐험대 3D — Phase 2b: 2D and 3D Side by Side, Deploy Build — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The repo builds one static site where the 3D game sits at the root and the frozen 2D game (v1.3.6) sits at `/2d/`. A start check sends devices without WebGL2, or anyone who picks it, to the 2D. Vercel and GitHub Pages build that site with `npm ci && npm run build && checks`. This work stays on the branch, and the owner's merge is the live switch.

**Architecture:**
- The 2D source moves from `dist/` to `app2d/` (byte-identical, `git mv`). It stays the single source of places and quizzes, which the 3D reads through `#game/*`.
- `dist/` becomes build output, git-ignored. Vite builds `app3d` into `dist/`, and a copy step puts `app2d` into `dist/2d/`.
- The 3D entry becomes a tiny boot module that picks the view before it dynamically imports the game.

**Tech Stack:** Vite 8.3.5, Three.js 0.187.0, Node 22, `node --test`, Playwright (pre-installed Chromium) for the smoke.

**Spec:** `docs/superpowers/specs/2026-11-19-hongseong-3d-design.md`: §9 (2D fallback), §10 (deploy layout), §11 (tests), §13-1 (addresses, QR). Phase 2a carry-overs: `docs/superpowers/plans/2026-11-19-hongseong-3d-phase2a-followups.md`.

## Global Constraints

- **Branch:** work only on `claude/gracious-fermat-np3hcp`. Do not merge, push to `main` or touch the live site. Merging is the live switch and needs the owner's yes.
- **The 2D stays frozen at v1.3.6.**
  - `app2d/` is `git mv dist app2d` with every file byte-identical. No edits to 2D files in this phase.
  - The root `package.json` `version` stays `1.3.6`, because `tests/refresh.test.js` compares it with `RELEASE.version`.
- **Save rules are unchanged.**
  - `localStorage['hongseong-adventure-v1']` goes through `sanitizeState`. 3D-only values stay in `hongseong-3d-v1`.
  - `/2d/` is the same origin as `/`, so both games read the same save.
  - The new view choice key is `hongseong-view-v1`, with values `'2d'` or absent. All storage access is wrapped in try/catch.
- **Every URL in the built site is relative,** because GitHub Pages serves under `/hongseong-adventure/`:
  - the 2D is `./2d/`
  - assets are `./assets/…`
  - there are no absolute `/…` paths
- **No runtime CDN.** Versions are pinned exactly, with no `^`.
- **Copy:**
  - Korean.
  - The settings row is `가벼운 2D로 열기` (spec §9).
  - Body text ≥15 px, labels ≥13 px, controls ≥44 px at the four smoke viewports: 1280×760, 1024×768 coarse, 390×844, 844×390.
- **Address:** `https://doguri25.github.io/hongseong-adventure/` (spec §2, §13-1). The 3D QR points there. The frozen 2D keeps its own QR.
- **Commits:** end every commit with these trailers. No model names in code or commits.
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_018JbLAjM8NRuwy8st3ruvTE
  ```

## Review Focus

1. **Sub-path serving.** The built `dist/` must work when served under `/hongseong-adventure/`, not only at `/`. Both games must boot and the 2D link must resolve under the sub-path. The smoke serves `dist/` at a sub-path (Task 2).
2. **Shared progress.** Progress made in the 3D shows in `/2d/` and the reverse, in the same browser (Task 3 smoke).
3. **No WebGL2.** A device without WebGL2 lands in the 2D without downloading the Three.js bundle (Task 3 smoke checks requests).
4. **Return from the light 2D.** After `가벼운 2D로 열기`, the root keeps opening the 2D until `?view=3d`. `?view=3d` clears the choice and stays 3D on the next visit (Task 3 unit and smoke).
5. **A fresh clone builds in CI.** `rm -rf node_modules dist && npm ci && npm run build && npm test && npm run test:3d` passes with nothing prebuilt (Task 5).

---

### Task 1: Phase 2a residuals (ruling P32)

**Files:**
- Modify: `app3d/src/game/travel.js`, `app3d/src/main.js`, `app3d/src/input/controls.js`
- Test: `app3d/tests/travel.test.js`, `app3d/tests/input.test.js`

**Interfaces:** No new exports.

- [ ] **Step 1: Write the failing tests.**
  - `travel.test.js` `a repeated guided press for the same place replans and still opens the place at the route end`: start a trip, step partway, start the same trip again, then walk to the end. Expect the place to open, and `player.routeAccess` to be non-null at the end.
  - `input.test.js` `a still finger resting on the right half does not turn the other hand's later tap into a two-finger press`: finger A rests still for 1 s, then finger B taps quickly. Expect a tap. Two fingers landing within `TAP_MS` must stay multi.
- [ ] **Step 2: Run** `npm run test:3d`. Expect FAIL on the two new tests.
- [ ] **Step 3: Implement.**
  - `startTrip` also nulls `player.route` and `player.routeKey`, so the walk replans as 2D `walkTo` does.
  - In `controls.js`, `pointers.size > 0` counts as multi only when the earlier pointer went down within `TAP_MS`.
  - The false 배 타러 가는 길을 멈췄어요 note must not be set when the dialog being opened is the ferry dialog itself. Alternatively, clear `G.note` in `onBoard`.
- [ ] **Step 4: Run** `npm run test:3d && node --test tests/*.test.js && npm run build:3d`. Expect PASS. Don't run the full smoke here; Task 5 runs it.
- [ ] **Step 5: Commit** `fix(3d-ui): replan repeated guided trips, resting-finger taps, ferry note`.

### Task 2: Move the 2D to `app2d/` and build both into `dist/`

**Files:**
- Move: `dist/` → `app2d/`, with `git mv`, byte-identical.
- Create: `tools/build/copy-2d.mjs`.
- Modify:
  - `package.json`: `imports`, `scripts`
  - `.gitignore`: add `dist/`
  - `app3d/vite.config.js`: `outDir` becomes `../dist`
  - `tests/*.test.js`: `../dist/` becomes `../app2d/`, the path only
  - `tools/3d/prepare_world.py`: `dist` becomes `app2d`
  - `app3d/tests/smoke.mjs`: serve `dist/`
  - any other `build/app3d` / `dist/` reference in scripts

**Interfaces:**
- Produces:
  - `npm run build` builds the 3D into `dist/` (`index.html`, `assets/`, `data/`, `models/`), then copies `app2d/**` to `dist/2d/**` unchanged.
  - `#game/*` maps to `./app2d/*`.
  - `npm run build:3d` stays as the Vite-only step.
- The copy skips nothing. `dist/2d/index.html` must equal `app2d/index.html` byte for byte.

- [ ] **Step 1: Repoint the smoke and add the new checks.**
  - Point the smoke at `dist/` and have it serve the site under the sub-path `/hongseong-adventure/` (Review Focus 1).
  - Add a check that `/hongseong-adventure/2d/` loads the 2D page with no page errors. Its `<title>` starts with `홍성 모험 수첩`.
- [ ] **Step 2: Run the smoke** without the move. Expect FAIL, because `dist/` does not hold the 3D build yet.
- [ ] **Step 3: Move and repoint.**
  - `git mv dist app2d`.
  - Update the alias, tests, tools and Vite `outDir`.
  - Write `copy-2d.mjs`.
  - Ignore `dist/`.
  - `git status` must show 100% renames for every 2D file.
- [ ] **Step 4: Run** `npm test && npm run test:3d && npm run build`. Then run the full smoke with `SMOKE_OUT=<scratchpad>/p2b-t2`, then run `node tools/build/copy-2d.mjs --check`. Expect PASS. The `--check` mode exits non-zero if any `dist/2d` file differs from `app2d`.
- [ ] **Step 5: Commit** `build: move the frozen 2D to app2d and build 3D plus /2d/ into dist`.

### Task 3: Start choice — WebGL2 check, `?view=`, light 2D

**Files:**
- Create:
  - `app3d/src/boot.js`: the Vite entry
  - `app3d/src/game/view-choice.js`: pure
  - `app3d/tests/view-choice.test.js`
- Modify:
  - `app3d/index.html`: entry script
  - `app3d/src/main.js`: becomes the dynamically imported game
  - `app3d/src/ui/menu.js`: `LITE_2D = true`, row action
  - `app3d/src/ui/theme.css`
  - the smoke

**Interfaces:**
- Produces: `chooseView({search, stored, webgl2}) -> {view: '2d'|'3d', store: '2d'|null|undefined}`. `undefined` means leave storage as is, and `null` means clear it.
- The rules, in order:
  1. `?view=2d` gives `{view:'2d', store:'2d'}`.
  2. `?view=3d` gives `{view:'3d', store:null}`.
  3. `stored==='2d'` gives `{view:'2d'}`.
  4. No WebGL2 gives `{view:'2d'}`, not remembered.
  5. Anything else gives `{view:'3d'}`.
- `boot.js` reads `location.search`, `localStorage['hongseong-view-v1']` and a WebGL2 probe on a throwaway canvas. It writes the store result, then either `location.replace('./2d/')` or `import('./main.js')`. Three.js and the world data must be fetched only on the 3D path.
- The 설정 row `가벼운 2D로 열기` stores `'2d'` and opens `./2d/`. Next to it, a line tells a teacher that `?view=3d` at the end of the address brings the 3D back.
- **Low-frame-rate suggestion (spec §9).** When auto quality is already at `low` and the measured frame rate stays below 20 for 10 s of play, show a glass card once per session. It holds two buttons, `가벼운 2D로 열기` and `3D로 계속하기`, and it is not shown behind dialogs.

- [ ] **Step 1: Write the failing tests.**
  - `view-choice.test.js` covers every rule above, plus a check that the `?view=` value is matched case-insensitively and other values are ignored.
  - Smoke:
    - `?view=2d` lands on the 2D page, and the 2D reads progress seeded in the 3D, by its discovery count text.
    - A later plain visit opens the 2D again.
    - `?view=3d` opens the 3D and clears the choice.
    - With `HTMLCanvasElement.prototype.getContext` patched to return null for `'webgl2'`, the root lands on `./2d/`, and no request for the 3D game chunk or `data/features.json` is made.
    - The 설정 row works.
- [ ] **Step 2: Run** `npm run test:3d`. Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run test:3d && npm run build`, then the full smoke (`SMOKE_OUT=<scratchpad>/p2b-t3`). Expect PASS.
- [ ] **Step 5: Commit** `feat(3d): start choice between the 3D and the light 2D`.

### Task 4: Deploy config, QR address, download links

**Files:**
- Modify:
  - `vercel.json`
  - `.github/workflows/deploy-pages.yml`
  - `app3d/src/ui/qr.js`
  - `app3d/src/ui/help.js`
  - `app3d/tests/help.test.js`
  - the smoke
- Create:
  - `tools/build/make-qr.py`: a one-off generator that documents how the image was made, run in a throwaway venv with a pinned `segno`
  - `app3d/src/assets/qr-pages.png`: committed output
  - `app3d/tests/deploy.test.js`

**Interfaces:**
- `vercel.json`: `installCommand: "npm ci"`, `buildCommand: "npm run build && npm test && npm run test:3d"`, `outputDirectory: "dist"`.
- `deploy-pages.yml`:
  - **Triggers:** push to `main` on `app2d/**`, `app3d/**`, `tools/build/**`, `tests/**`, `package.json`, `package-lock.json`, and the workflow file itself. Also `workflow_dispatch`.
  - **Source check:** test for `app2d/index.html`.
  - **Steps:** `npm ci`, `npm run build`, `npm test`, `npm run test:3d`, `touch dist/.nojekyll`, upload `dist`.
  - **The other workflows** (`apply-v1.3.x`, `import-source`) are one-shot historical patches that run only on edits to their own files or on dispatch. Leave them unchanged, and name them in the report.
- `qr.js` shows `qr-pages.png` and copies `https://doguri25.github.io/hongseong-adventure/`, with the 2D QR wording otherwise.
- **Help download links (ruling P27):** link to the deployed 2D copies, for example `./2d/map-county.json`, instead of bundling them, so the build drops about 9 MB. There must be no `#game/` left in any `href`.
- `deploy.test.js` asserts:
  - the `vercel.json` fields
  - the Pages workflow runs `npm ci`, `npm run build`, both test commands, and uploads `dist`
  - `package.json` `scripts.build` exists and `version === '1.3.6'`

- [ ] **Step 1: Write the failing tests.**
  - `deploy.test.js`.
  - The `help.test.js` download assertions use `./2d/` paths.
  - A smoke check confirms every help download link resolves with HTTP 200 under the sub-path and none contains `#game/`. The QR image decodes; check its size and that the copy button copies the Pages URL.
- [ ] **Step 2: Run.** Expect FAIL.
- [ ] **Step 3: Implement.** Generate the QR once and commit the PNG. Do not add a runtime QR dependency.
- [ ] **Step 4: Run** `npm test && npm run test:3d && npm run build`. Expect PASS. Report the new `dist/` size.
- [ ] **Step 5: Commit** `build: deploy both games from dist on Vercel and Pages; QR to the Pages address`.

### Task 5: Clean build and final smoke

**Files:**
- Modify: `README.md` (a short "3D판과 2D판" section covering the layout, the commands, `?view=`, and that merging switches the live site)
- Modify: the smoke, only if it needs to record first-load bytes

**Interfaces:** none.

- [ ] **Step 1: Run a clean build.**
  ```bash
  rm -rf node_modules dist && npm ci && npm run build && npm test && npm run test:3d && node tools/build/copy-2d.mjs --check
  ```
  Expect PASS.
- [ ] **Step 2: Run the full smoke** against `dist/` under the sub-path at four viewports (`SMOKE_OUT=<scratchpad>/p2b-final`). Expect PASS.
- [ ] **Step 3: Record first-load bytes.** Log the bytes fetched until the 3D is ready on the desktop viewport (spec §13-1 aims at about 10 MB; record the number, no gate).
- [ ] **Step 4: Update the README section.**
- [ ] **Step 5: Commit** `docs: how the 3D and 2D games are built and served`.
