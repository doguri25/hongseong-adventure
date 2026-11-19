// Plain place dialog (phase 2 restyles it): story pages -> discovery quiz -> reward line, plus the small NPC talk panel.
// Rewards use the game's own rules unchanged: discover/answer from dist/core.js, recordQuestVisit from dist/quests.js.
// Pages and quiz options are HTML strings from the game's own content (trusted repository content), inserted as HTML.
import { discover, answer, quizCoins } from '#game/core.js';
import { recordQuestVisit } from '#game/quests.js';
import { Narrator } from '#game/audio.js';

const TYPE_LABEL = { public: '공공시설', nature: '자연', heritage: '문화유산', daily: '생활', school: '학교', culture: '문화', intangible: '무형유산', food: '먹거리' };
const el = (doc, tag, props = {}, html) => { const e = Object.assign(doc.createElement(tag), props); if (html !== undefined) e.innerHTML = html; return e; };

function rewardLine(state, place, view) {
  const { reward, mission } = view;
  if (mission) return mission.bonus ? `직행 미션 성공! +${mission.bonus}금화` : '탐방 미션 완료!';
  if (reward) return `새로운 발견! +${reward.coins}금화`;
  if (state.discovered.includes(place.id)) return '발견 수첩에 기록된 장소';
  return '직접 찾아가면 발견 수첩에 기록되고 퀴즈를 풀 수 있어요';
}

// getState() -> the shared save state; onChange() after any reward; onGo(place) asks main to head for the place;
// onClose() resumes play; toast(text) shows a message.
export function createPlaceDialog(doc, { getState, onChange, onGo, onClose, toast } = {}) {
  const $ = (id) => doc.getElementById(id);
  const root = $('place-dialog'), body = $('place-body'), footer = $('place-footer');
  const win = doc.defaultView || globalThis;
  const canSpeak = !!win.speechSynthesis;
  let narrator = null, readBtn = null;
  const view = { place: null, page: 0, reward: null, mission: null, physical: false };

  function syncRead() { if (readBtn) readBtn.textContent = narrator?.speaking ? '■ 그만 읽기' : '▷ 읽어 주기'; }
  function speaker() {
    if (!narrator && canSpeak) narrator = new Narrator(getState, syncRead, (m) => toast?.(m));
    return narrator;
  }
  const hush = () => { narrator?.cancel(); };

  function header(p) {
    $('place-tag').textContent = p.category || TYPE_LABEL[p.type] || '장소';
    $('place-name').textContent = p.name;
    $('place-blurb').textContent = p.blurb || '';
  }

  function button(label, cls, onClick) { const b = el(doc, 'button', { className: 'btn' + (cls ? ' ' + cls : ''), type: 'button' }); b.textContent = label; b.onclick = onClick; return b; }

  function renderStory() {
    const p = view.place, state = getState(), n = p.pages.length;
    body.replaceChildren();
    const meta = el(doc, 'div', { className: 'meta' });
    meta.append(el(doc, 'span', { textContent: '길잡이 · 다정 선생님' }), el(doc, 'span', { textContent: `${view.page + 1} / ${n}` }));
    const speech = el(doc, 'div', { className: 'speech', tabIndex: 0 }, p.pages[view.page]);
    speech.setAttribute('role', 'region'); speech.setAttribute('aria-label', '장소 설명');
    body.append(meta, speech, el(doc, 'p', { className: 'reward', textContent: rewardLine(state, p, view) }));
    body.scrollTop = 0;
    footer.replaceChildren();
    const prev = button('← 이전', '', () => { hush(); view.page = Math.max(0, view.page - 1); renderStory(); });
    prev.disabled = view.page === 0;
    footer.append(prev);
    if (view.page < n - 1) footer.append(button('다음 이야기 →', 'primary', () => { hush(); view.page++; renderStory(); }));
    else footer.append(button('발견 퀴즈 →', 'primary', () => { hush(); renderQuiz(); }));
    footer.append(el(doc, 'span', { className: 'spacer' }));
    readBtn = null;
    if (canSpeak) {
      readBtn = button('▷ 읽어 주기', '', () => { const s = speaker(); if (!s) return; if (s.speaking) s.cancel(); else s.speak(speech.textContent); });
      readBtn.id = 'read-aloud';
      footer.append(readBtn); syncRead();
    }
    focusPrimary();
  }

  function renderQuiz() {
    const p = view.place, state = getState(), q = p.quiz;
    body.replaceChildren(); footer.replaceChildren(); readBtn = null;
    const wrap = el(doc, 'div', { className: 'quiz' });
    if (!state.discovered.includes(p.id)) {
      wrap.append(el(doc, 'h3', { textContent: '발견 퀴즈' }), el(doc, 'p', { textContent: `${p.name}에 직접 찾아가면 발견 수첩에 기록되고 퀴즈를 풀 수 있어요.` }));
      body.append(wrap);
      footer.append(button('이야기 다시 보기', '', () => { view.page = 0; renderStory(); }), el(doc, 'span', { className: 'spacer' }),
        button('여기로 가기', 'primary', () => { close(); onGo?.(p); }));
      focusPrimary();
      return;
    }
    const review = state.solved.includes(p.id);
    wrap.append(el(doc, 'div', { className: 'meta', textContent: review ? '발견 퀴즈 · 복습' : `발견 퀴즈 · 보너스 ${quizCoins(p)}금화` }), el(doc, 'h3', {}, q.question));
    const options = el(doc, 'div', { className: 'options' }), feedback = el(doc, 'p', { className: 'feedback', hidden: true });
    q.options.forEach((html, i) => {
      const b = el(doc, 'button', { type: 'button' }, `<b>${i + 1}</b><span>${html}</span>`);
      b.dataset.answer = String(i);
      b.onclick = () => {
        const r = answer(getState(), p.id, i);
        feedback.hidden = false;
        if (r.invalid) { feedback.textContent = '먼저 이 장소를 직접 찾아가 보세요.'; return; }
        if (!r.correct) { b.classList.add('wrong'); feedback.textContent = '괜찮아, 다시 생각해 보자! ' + (q.hint || ''); return; }
        b.classList.add('correct');
        options.querySelectorAll('button').forEach((o) => { o.disabled = true; });
        feedback.textContent = q.explain || '정답이에요!';
        const line = el(doc, 'p', { className: 'reward', textContent: r.coins ? `정답! +${r.coins}금화` : '정답이에요! (복습)' });
        wrap.append(line);
        onChange?.();
        footer.replaceChildren(el(doc, 'span', { className: 'spacer' }), button('수첩에 정리하고 닫기', 'primary', close));
        focusPrimary();
      };
      options.append(b);
    });
    wrap.append(options, feedback);
    body.append(wrap); body.scrollTop = 0;
    footer.append(button('이야기 다시 보기', '', () => { view.page = 0; renderStory(); }), el(doc, 'span', { className: 'spacer' }), button('나중에 풀기', '', close));
  }

  function focusPrimary() { const b = footer.querySelector('.btn.primary') || $('place-close'); try { b.focus({ preventScroll: true }); } catch {} }

  function open(place, { physical = false } = {}) {
    hush();
    const state = getState();
    view.place = place; view.page = 0; view.physical = physical;
    view.mission = recordQuestVisit(state, place.id, physical);
    view.reward = physical ? discover(state, place.id) : null;
    if (view.reward || view.mission) onChange?.();
    header(place);
    root.hidden = false;
    if (place.pages && place.pages.length) renderStory(); else renderQuiz();
    return { reward: view.reward, mission: view.mission };
  }

  function close() {
    if (root.hidden) return;
    hush();
    root.hidden = true;
    view.place = null;
    onClose?.();
  }

  $('place-close').onclick = close;
  root.addEventListener('pointerdown', (e) => { if (e.target === root) close(); });
  doc.addEventListener('keydown', (e) => { if (!root.hidden && e.key === 'Escape') { e.preventDefault(); close(); } });

  return { open, close, get isOpen() { return !root.hidden; }, get place() { return view.place; } };
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
