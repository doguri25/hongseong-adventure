// The place dialog (pokju #qbox look): the place's picture with the 2D kind label (실제 사진 / 실제 지형 자료 / 이해를 돕는
// 삽화) and caption beside the story pages (길잡이 · 다정 선생님, page n / m, ← 이전 / 다음 이야기 → / 발견 퀴즈 →,
// ▷ 설명 읽기, 사진·자료 출처 or 학교 사진·자료 -> ui/sources.js), then the discovery quiz (three big answer buttons; a wrong
// answer's hint, the right one's explanation), then the reward (this visit's coins: discovery + quiz + mission bonus,
// and points), 발견 수첩 보기 / 계속 탐방하기. The panel carries data-view = story | sources | quiz | reward.
// It is modal (ui/dom.js openModal: the rest of #app inert, focus in, Escape, focus back on the canvas on close) and is
// the controller's 'place' dialog: every way out goes through ctx.onClose -> ctl.close(), which opens the next queued
// arrival. Rewards use the game's own rules unchanged: discover / answer / quizCoins (dist/core.js) and
// recordQuestVisit (dist/quests.js); a visit finds the place when it is physical or the place is story-only (P19, the
// 2D visit). Pages, questions and options are HTML from the game's content (trusted repository content); every other
// text goes in through textContent. Copy is the 2D game's (dist/game.js renderPlace, renderQuiz, renderReward).
import { el as h, openModal, closeModal } from './dom.js';
import { renderSources } from './sources.js';
import { discover, answer, quizCoins } from '#game/core.js';
import { recordQuestVisit } from '#game/quests.js';
import { PLACES } from '#game/content.js';
import { symbolFor } from '#game/place-icons.js';

const el = (doc, tag, props = {}, html) => { const e = Object.assign(doc.createElement(tag), props); if (html !== undefined) e.innerHTML = html; return e; };

// every picture a place uses (PLACES[].image), bundled by Vite (P7); place-dialog.test.js checks none is missing
const IMAGES = {
  'assets/chungnam-library.webp': new URL('#game/assets/chungnam-library.webp', import.meta.url).href,
  'assets/hongye-park.webp': new URL('#game/assets/hongye-park.webp', import.meta.url).href,
  'assets/chungnam-office.webp': new URL('#game/assets/chungnam-office.webp', import.meta.url).href,
  'assets/council-story.webp': new URL('#game/assets/council-story.webp', import.meta.url).href,
  'assets/cinema-story.webp': new URL('#game/assets/cinema-story.webp', import.meta.url).href,
  'assets/hongju-joyangmun.webp': new URL('#game/assets/hongju-joyangmun.webp', import.meta.url).href,
  'assets/yongbongsan.webp': new URL('#game/assets/yongbongsan.webp', import.meta.url).href,
  'assets/gyeolseong-song.webp': new URL('#game/assets/gyeolseong-song.webp', import.meta.url).href,
  'assets/map-view-naepo.webp': new URL('#game/assets/map-view-naepo.webp', import.meta.url).href,
  'assets/map-view-namdang.webp': new URL('#game/assets/map-view-namdang.webp', import.meta.url).href,
  'assets/grocery-shop.webp': new URL('#game/assets/grocery-shop.webp', import.meta.url).href,
  'assets/household-shop.webp': new URL('#game/assets/household-shop.webp', import.meta.url).href,
  'assets/burger-shop.webp': new URL('#game/assets/burger-shop.webp', import.meta.url).href,
  'assets/bakery-shop.webp': new URL('#game/assets/bakery-shop.webp', import.meta.url).href,
  'assets/school-illustration.webp': new URL('#game/assets/school-illustration.webp', import.meta.url).href,
  'assets/bank-illustration.webp': new URL('#game/assets/bank-illustration.webp', import.meta.url).href,
  'assets/community-office-illustration.webp': new URL('#game/assets/community-office-illustration.webp', import.meta.url).href,
  'assets/post-office-illustration.webp': new URL('#game/assets/post-office-illustration.webp', import.meta.url).href,
  'assets/kim-jwajin-birthplace.webp': new URL('#game/assets/kim-jwajin-birthplace.webp', import.meta.url).href,
  'assets/museum-generic-illustration.webp': new URL('#game/assets/museum-generic-illustration.webp', import.meta.url).href,
  'assets/hongju-uisachong.webp': new URL('#game/assets/hongju-uisachong.webp', import.meta.url).href,
  'assets/market-generic-illustration.webp': new URL('#game/assets/market-generic-illustration.webp', import.meta.url).href,
  'assets/festival-generic-illustration.webp': new URL('#game/assets/festival-generic-illustration.webp', import.meta.url).href,
  'assets/specialty-generic-illustration.webp': new URL('#game/assets/specialty-generic-illustration.webp', import.meta.url).href,
  'assets/forest-generic-illustration.webp': new URL('#game/assets/forest-generic-illustration.webp', import.meta.url).href,
  'assets/cafe-generic-illustration.webp': new URL('#game/assets/cafe-generic-illustration.webp', import.meta.url).href,
  'assets/transit-story.png': new URL('#game/assets/transit-story.png', import.meta.url).href,
  'assets/swimming-story.png': new URL('#game/assets/swimming-story.png', import.meta.url).href,
  'assets/playground-story.png': new URL('#game/assets/playground-story.png', import.meta.url).href,
};
const GUIDE = new URL('#game/assets/guide.webp', import.meta.url).href;   // 길잡이 다정 선생님 (2D teacher-stage)
const QUIET_SOUND = { play() {} }, QUIET_NARRATOR = { speak() {}, cancel() {} };
const SVG = 'http://www.w3.org/2000/svg';

/** The bundled URL of a place's picture, or null for a file the table does not know. */
export const heroImage = (p) => IMAGES[p.image] || null;
/** The 2D hero label: a real photo, real terrain data drawn as a map, or an illustration. */
export const kindLabel = (p) => (p.photo ? '실제 사진' : p.mediaType === 'map' ? '실제 지형 자료' : '이해를 돕는 삽화');
const kindKey = (p) => (p.photo ? 'photo' : p.mediaType === 'map' ? 'map' : 'art');

/** What this visit earned in all (2D renderReward): discover() + the mission bonus + answer(), as {coins, xp}. */
export function visitTotals(reward, mission, result) {
  return { coins: (reward?.coins || 0) + (result?.coins || 0) + (mission?.bonus || 0), xp: (reward?.xp || 0) + (result?.xp || 0) };
}

/** The line under the story (2D reward-label): a mission first, then a new discovery; else found, or not yet. */
export function rewardLine(state, place, view) {
  const { reward, mission } = view;
  if (mission) return mission.bonus ? `직행 미션 성공! +${mission.bonus}금화` : '탐방 미션 완료!';
  if (reward) return `새로운 발견! +${reward.coins}금화`;
  if (state.discovered.includes(place.id)) return '발견 수첩에 기록된 장소';
  return '직접 찾아가면 발견 수첩에 기록되고 퀴즈를 풀 수 있어요';
}

/**
 * createPlaceDialog(doc, ctx) -> {open(place, {physical}) -> {reward, mission}, hide(), close(), refreshVoice(), isOpen,
 * place}. open shows the story (or the quiz for a place without pages) and returns what the visit earned for the
 * arrival notice; hide() is the controller's hideDialog (idempotent, no onClose); close() is the player's way out
 * (×, Escape, a tap beside the panel, 나중에 풀기, 계속 탐방하기): hide, then ctx.onClose. refreshVoice() updates the
 * read-aloud button from narrator.speaking (for the Narrator's own change callback). ctx:
 *   root, returnFocus   #app (its other children go inert) and the canvas (focus on close)
 *   getState()          the shared save state
 *   onChange()          a reward or a solved quiz changed the state: refresh the HUD and save
 *   onAnswer(result)    after each quiz answer (the big notice and the green / red flash)
 *   onGo(place)         여기로 가기 on a place not found yet: head there (ctl.goTo)
 *   onJournal()         발견 수첩 보기 (ctl.open('menu', {tab: 'journal'}), P16)
 *   onClose()           the dialog asks to close (ctl.close)
 *   sound               {play(kind)}: click (pages and views), retry, correct, coin (P21; ctl.sound)
 *   narrator            {speak(text), cancel(), speaking?, label?} (P21; ctl.narrator)
 */
export function createPlaceDialog(doc, ctx = {}) {
  const { getState, onChange, onAnswer, onGo, onJournal, onClose } = ctx;
  const sound = ctx.sound || QUIET_SOUND, narrator = ctx.narrator || QUIET_NARRATOR;
  const $ = (id) => doc.getElementById(id);
  const scrim = $('place-dialog'), panel = $('place-panel'), body = $('place-body'), footer = $('place-footer');
  const img = $('place-img'), win = doc.defaultView || globalThis;
  const canSpeak = 'speechSynthesis' in win;
  const view = { open: false, place: null, page: 0, physical: false, reward: null, mission: null, result: null };

  const click = () => sound.play('click');
  const hush = () => narrator.cancel?.();
  const focus = (node) => { try { node?.focus({ preventScroll: true }); } catch { /* gone */ } };
  const spacer = () => h('span', { className: 'spacer' });
  const button = (label, { id, primary = false, tool = false, disabled = false, onClick }) => h('button', { type: 'button', className: 'btn' + (primary ? ' primary' : '') + (tool ? ' tool' : ''), id, disabled, onclick: onClick }, label);
  function show(name, ...parts) {
    panel.dataset.view = name;
    footer.replaceChildren(...parts.filter(Boolean));
    body.scrollTop = 0;
  }

  // the picture, its label and caption, the tag (the 2D symbol and area · kind of place), the name and line
  function header(p) {
    const s = symbolFor(p), icon = doc.createElementNS(SVG, 'svg'), path = doc.createElementNS(SVG, 'path');
    icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('aria-hidden', 'true'); path.setAttribute('d', s.path); icon.append(path);
    const tag = $('place-tag');
    tag.replaceChildren(h('span', { className: 'sym' }, icon), `${p.area} · ${s.label}`);
    tag.style.setProperty('--symbol-color', s.color);
    $('place-name').textContent = p.name;
    $('place-blurb').textContent = p.blurb || '';
    const url = heroImage(p);
    if (url) img.src = url; else img.removeAttribute('src');
    img.alt = p.caption || '';
    const kind = $('place-kind');
    kind.textContent = kindLabel(p); kind.dataset.kind = kindKey(p);
    $('place-caption').textContent = p.caption || '';
  }

  // ---- story: one page at a time
  function renderStory() {
    const p = view.place, n = p.pages.length, last = view.page >= n - 1;
    const speech = h('div', { className: 'speech', tabIndex: 0, role: 'region', 'aria-label': '장소 설명' });
    speech.innerHTML = p.pages[view.page];   // trusted repository content (dist/content.js)
    body.replaceChildren(
      h('div', { className: 'meta' }, h('img', { className: 'guide', src: GUIDE, alt: '', decoding: 'async' }), h('span', { className: 'speaker' }, '길잡이 · 다정 선생님'), h('span', { className: 'page-num' }, `${view.page + 1} / ${n}`)),
      speech,
      h('p', { className: 'reward' }, rewardLine(getState(), p, view)));
    show('story',   // the tools under the page, then ← 이전 and the next step at the foot
      canSpeak ? button('▷ 설명 읽기', { id: 'read-aloud', tool: true, onClick: () => read(speech) }) : null,
      canSpeak && typeof narrator.label === 'string' ? h('span', { className: 'voice-status', id: 'voice-status' }, narrator.label) : null,
      button(p.schoolStory ? '학교 사진·자료' : '사진·자료 출처', { id: 'place-sources', tool: true, onClick: sources }),
      h('span', { className: 'break' }),
      button('← 이전', { id: 'previous-story', disabled: view.page === 0, onClick: () => turn(-1) }),
      spacer(),
      button(last ? '발견 퀴즈 →' : '다음 이야기 →', { id: 'next-page', primary: true, onClick: () => (last ? toQuiz() : turn(1)) }));
    refreshVoice();
  }
  function turn(d) {
    hush(); click();
    view.page = Math.max(0, Math.min(view.place.pages.length - 1, view.page + d));
    renderStory();
    const b = $(d < 0 ? 'previous-story' : 'next-page');
    focus(b && !b.disabled ? b : $('next-page'));
  }
  function read(speech) {
    if (narrator.speaking) narrator.cancel(); else narrator.speak(speech.textContent);
    refreshVoice();
  }
  function refreshVoice() {
    const b = $('read-aloud');
    if (b && view.open) b.textContent = narrator.speaking ? '■ 읽기 멈추기' : '▷ 설명 읽기';
    const label = $('voice-status');
    if (label && typeof narrator.label === 'string') label.textContent = narrator.label;
  }

  // ---- 사진·자료 출처 / 학교 사진·자료 (ui/sources.js), back to the same page
  function sources() {
    hush(); click();
    renderSources(body, view.place);
    show('sources', spacer(), button('이야기로 돌아가기', { id: 'back-to-story', primary: true, onClick: () => { click(); renderStory(); focus($('place-sources')); } }));
    focus($('back-to-story'));
  }

  // ---- the discovery quiz
  const reread = () => { click(); view.page = 0; renderStory(); focus($('next-page')); };
  function toQuiz() { hush(); click(); renderQuiz(); }
  function renderQuiz() {
    const p = view.place, state = getState(), q = p.quiz;
    if (!state.discovered.includes(p.id)) {   // seen from afar (a pin far away): the quiz waits for a real visit
      body.replaceChildren(h('div', { className: 'quiz' }, h('span', { className: 'q-kick' }, '발견 퀴즈'), h('p', { className: 'lead' }, `${p.name}에 직접 찾아가면 발견 수첩에 기록되고 퀴즈를 풀 수 있어요.`)));
      show('quiz', button('이야기 다시 보기', { id: 'reread', onClick: reread }), spacer(),
        button('여기로 가기', { id: 'go-there', primary: true, onClick: () => { sound.play('move'); if (onGo) onGo(p); else close(); } }));
      focus($('go-there'));
      return;
    }
    const question = h('h3', { className: 'q-text', id: 'quiz-question' });
    question.innerHTML = q.question;
    const feedback = h('p', { className: 'feedback', id: 'quiz-feedback', role: 'status', hidden: true });
    const options = h('div', { className: 'options', role: 'group', 'aria-labelledby': 'quiz-question' }, q.options.map((html, i) => {
      const text = h('span', {});
      text.innerHTML = html;   // trusted repository content
      return h('button', { type: 'button', dataset: { answer: String(i) }, onclick: (e) => choose(e.currentTarget, i, options, feedback) }, h('b', { 'aria-hidden': 'true' }, String(i + 1)), text);
    }));
    body.replaceChildren(h('div', { className: 'quiz' },
      h('span', { className: 'q-kick' }, state.solved.includes(p.id) ? '발견 퀴즈 · 복습' : `발견 퀴즈 · 보너스 ${quizCoins(p)}금화`),
      question, options, feedback));
    show('quiz', button('이야기 다시 보기', { id: 'reread', onClick: reread }), spacer(), button('나중에 풀기', { id: 'later', onClick: () => { click(); close(); } }));
    focus(options.firstChild);
  }
  function choose(b, i, options, feedback) {
    const p = view.place, q = p.quiz, r = answer(getState(), p.id, i);
    feedback.hidden = false;
    if (r.invalid) { feedback.dataset.tone = 'no'; feedback.textContent = '먼저 이 장소를 직접 찾아가 보세요.'; return; }
    onAnswer?.(r);
    if (!r.correct) {
      sound.play('retry');
      b.classList.add('wrong');
      feedback.dataset.tone = 'no';
      feedback.textContent = '괜찮아, 다시 생각해 보자! ' + (q.hint || '');
      return;
    }
    sound.play('correct');
    b.classList.add('correct');
    for (const o of options.children) o.disabled = true;
    feedback.dataset.tone = 'ok';
    feedback.textContent = q.explain || '정답이에요!';
    view.result = r;
    onChange?.();
    footer.replaceChildren(spacer(), button('수첩에 정리하기 →', { id: 'quiz-finish', primary: true, onClick: renderReward }));
    focus($('quiz-finish'));
  }

  // ---- the reward: what this visit earned, shown once (2D renderReward)
  function spark() {   // the 2D ✦, drawn
    const svg = doc.createElementNS(SVG, 'svg'), path = doc.createElementNS(SVG, 'path');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'spark'); svg.setAttribute('aria-hidden', 'true');
    path.setAttribute('d', 'M12 1c.9 6.4 4.6 10.1 11 11-6.4.9-10.1 4.6-11 11-.9-6.4-4.6-10.1-11-11 6.4-.9 10.1-4.6 11-11Z');
    svg.append(path);
    return svg;
  }
  function renderReward() {
    const p = view.place, state = getState(), t = visitTotals(view.reward, view.mission, view.result), m = view.mission;
    const num = (key, value, unit) => h('div', { className: 'num', dataset: { num: key } }, h('b', {}, `+${value}`), h('small', {}, unit));
    body.replaceChildren(h('div', { className: 'rv' },
      spark(),
      h('h3', {}, t.coins ? '우리 고장을 한 걸음 더 알아냈어요!' : '이야기를 다시 떠올렸어요!'),
      h('p', {}, h('strong', {}, p.name), '의 이야기가 발견 수첩에 차곡차곡 쌓였어요.', h('br'),
        state.solved.length === PLACES.length ? '모든 퀴즈를 풀었어요. 이제 너만의 고장 이야기를 들려줘!' : '다음 장소에는 어떤 이야기가 기다리고 있을까요?'),
      m ? h('p', { className: 'mission-line' }, m.bonus ? `직행 미션 성공! +${m.bonus}금화` : '탐방 미션 완료!') : null,
      h('div', { className: 'nums' }, num('coins', t.coins, '금화'), num('xp', t.xp, '탐험 점수')),
      h('p', { className: 'sub' }, t.coins ? '같은 장소와 퀴즈의 보상은 처음 한 번만 받아요.' : '복습에는 추가 보상이 없어요.')));
    view.reward = view.mission = view.result = null;
    show('reward',
      button('발견 수첩 보기', { id: 'reward-journal', onClick: () => { click(); if (onJournal) onJournal(); else close(); } }),
      spacer(),
      button('계속 탐방하기', { id: 'continue-walk', primary: true, onClick: () => { click(); close(); } }));
    sound.play('coin');
    focus($('continue-walk'));
  }

  // ---- open and close
  function open(place, { physical = false } = {}) {
    hush();
    const state = getState();
    Object.assign(view, { place, page: 0, physical, result: null });
    view.mission = recordQuestVisit(state, place.id, physical);
    view.reward = physical || place.remote ? discover(state, place.id) : null;
    if (view.reward || view.mission) onChange?.();
    header(place);
    scrim.hidden = false;
    view.open = true;
    if (place.pages?.length) renderStory(); else renderQuiz();
    openModal(panel, { root: ctx.root, returnFocus: ctx.returnFocus, onClose: close });
    focus($('next-page') || $('go-there') || body.querySelector('.options button'));
    return { reward: view.reward, mission: view.mission };
  }
  function hide() {
    if (!view.open) return;
    view.open = false;
    hush();
    scrim.hidden = true;
    closeModal(panel);
    view.place = null;
  }
  function close() {
    if (!view.open) return;
    hide();
    onClose?.();
  }

  $('place-close').onclick = close;
  scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) close(); });

  return { open, hide, close, refreshVoice, get isOpen() { return view.open; }, get place() { return view.place; } };
}

// The small NPC talk panel: who, where, their story and the district's history.
export function createNpcDialog(doc, { onClose } = {}) {
  const $ = (id) => doc.getElementById(id);
  const root = $('npc-dialog'), body = $('npc-body');
  function open(npc) {
    $('npc-area').textContent = npc.area || '홍성군';
    $('npc-name').textContent = npc.name;
    body.replaceChildren();
    for (const t of [npc.story, npc.history]) if (t) body.append(el(doc, 'p', { textContent: t }));
    root.hidden = false;
    try { $('npc-done').focus({ preventScroll: true }); } catch {}
  }
  function close() { if (root.hidden) return; root.hidden = true; onClose?.(); }
  $('npc-close').onclick = close; $('npc-done').onclick = close;
  root.addEventListener('pointerdown', (e) => { if (e.target === root) close(); });
  doc.addEventListener('keydown', (e) => { if (!root.hidden && e.key === 'Escape') { e.preventDefault(); close(); } });
  return { open, close, get isOpen() { return !root.hidden; } };
}
