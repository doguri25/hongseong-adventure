// The 수첩 tab of the menu (2D showJournal, in the pokju #pane-rec look: a stats table, then cards): 발견 / 퀴즈 / 탐험
// 점수 out of all 241 places, the filters 전체 · 발견 · 역사 · 생활, a card per place (the equipped stamp on the found
// ones), the note for a friend (saved as it is typed) and the files: 결과 내려받기, 이어하기 파일 저장 and 불러오기 (an in-page
// second step before the file replaces this device's progress). A card closes the menu: a found or story-only (remote)
// place opens its place dialog as a replay, which is not an arrival; any other place is set as the walk target. The
// equipped 수첩 colour (wardrobe JOURNALS) edges the stats and the cards, as the 2D journal slot does. Copy is the 2D game's.
import { el } from './dom.js';
import { resultText, saveFile, readSaveFile, download, SAVE_NAME, RESULT_NAME, MAX_SAVE_BYTES } from '../game/files.js';
import { PLACES } from '#game/content.js';
import { STAMPS, JOURNALS } from '#game/wardrobe.js';

export const FILTERS = [['all', '전체'], ['found', '발견'], ['heritage', '역사'], ['daily', '생활']];
const TYPES = { heritage: ['heritage', 'intangible'], daily: ['daily', 'public'] };   // the 2D filters
const NOTE_MAX = 1000;
const READ_ERROR = {
  size: '이어하기 파일이 너무 커요. 올바른 JSON 파일을 선택해 주세요.',
  json: '이어하기 파일을 읽지 못했어요. 이 게임에서 저장한 JSON 파일인지 확인해 주세요.',
};

/**
 * journalCards(state, filter) -> the cards of one filter, in PLACES order: {id, name, tag, desc, found, remote, stamp}.
 * stamp: the equipped stamp glyph and 이야기 완성 / 발견 완료 on a found place, else null.
 */
export function journalCards(state, filter = 'all') {
  const found = new Set(state.discovered), solved = new Set(state.solved), glyph = STAMPS[state.equipped?.stamp] || '✓';
  let list = PLACES;
  if (filter === 'found') list = list.filter((p) => found.has(p.id));
  else if (TYPES[filter]) list = list.filter((p) => TYPES[filter].includes(p.type));
  return list.map((p) => {
    const f = found.has(p.id);
    return {
      id: p.id, name: p.name, tag: `${p.area} · ${p.category}`, found: f, remote: !!p.remote,
      desc: f ? p.blurb : p.remote ? '홍성 이야기 여행에서 만나기' : '지도에서 이 장소 찾아가기',
      stamp: f ? `${glyph} ${solved.has(p.id) ? '이야기 완성' : '발견 완료'}` : null,
    };
  });
}

/**
 * createJournal(doc, ctx) -> {render(), reset()}: render() fills or refreshes ctx.pane; reset() drops the import step
 * and the status line (the menu calls it when it opens). ctx:
 *   pane               #pane-journal
 *   getState()         the shared save state
 *   places             the mapped places (the place dialog and goTo use these); story-only places come from PLACES
 *   ctl                the game controller: open('place', {place, physical}), goTo(id), sound
 *   save()             the note or a file changed: save now (and refresh the HUD)
 *   importSave(state)  an accepted 이어하기 file: replace this device's progress and reload (main.js)
 */
export function createJournal(doc, ctx) {
  const { pane } = ctx, state = () => ctx.getState();
  let filter = 'all', ui = null, incoming = null;

  function build() {
    const stat = (label, unit) => { const b = el('b', {}, '0'); return [el('div', {}, el('dt', {}, label), el('dd', {}, b, el('small', {}, unit))), b]; };
    const [found, foundN] = stat('발견', `/ ${PLACES.length}곳`), [quiz, quizN] = stat('퀴즈', `/ ${PLACES.length}개`), [xp, xpN] = stat('탐험 점수', '점');
    const filters = el('div', { className: 'j-filters', role: 'group', 'aria-label': '수첩에서 볼 장소' },
      FILTERS.map(([id, label]) => el('button', { type: 'button', dataset: { filter: id }, 'aria-pressed': 'false', onclick: () => choose(id) }, label)));
    const list = el('div', { className: 'j-list', id: 'journal-list' });
    const note = el('textarea', { id: 'journal-note', maxLength: NOTE_MAX, rows: 3, placeholder: '예: 나는 홍예공원을 소개하고 싶어. 가족과 함께 산책한 기억이 있거든.', oninput: (e) => { state().note = e.target.value.slice(0, NOTE_MAX); ctx.save(); } });
    const file = el('input', { type: 'file', id: 'journal-file', accept: '.json,application/json', hidden: true, onchange: () => readFile(file) });
    const loadBtn = el('button', { type: 'button', className: 'btn', id: 'load-save', onclick: () => { file.value = ''; file.click(); } }, '이어하기 파일 불러오기');
    const status = el('p', { className: 'status', id: 'journal-status', role: 'status' });
    const askText = el('p', {});
    const ask = el('div', { className: 'reset-confirm j-confirm', id: 'import-confirm', hidden: true }, askText,
      el('div', { className: 'row' },
        el('button', { type: 'button', className: 'btn btn-grad', id: 'confirm-import', onclick: () => { if (incoming) ctx.importSave(incoming); } }, '이 기록으로 이어하기'),
        el('button', { type: 'button', className: 'btn btn-ghost', id: 'cancel-import', onclick: () => { closeAsk(); loadBtn.focus({ preventScroll: true }); } }, '취소')));
    pane.replaceChildren(
      el('p', { className: 'lead' }, '알고 있던 장소도 자세히 보면 새로워요. 오늘의 발견을 모아 우리 고장을 소개해 보세요.'),
      el('dl', { className: 'tally' }, found, quiz, xp),
      filters, list,
      el('div', { className: 'j-note' },
        el('label', { htmlFor: 'journal-note' }, '친구에게 소개하고 싶은 장소와 그 까닭은?'), note,
        el('p', { className: 'note' }, '이 기기에만 저장돼요. 이름이나 연락처를 적지 않아도 돼요.')),
      el('div', { className: 'j-actions' },
        el('button', { type: 'button', className: 'btn btn-grad', id: 'export-result', onclick: exportResult }, '결과 내려받기'),
        el('button', { type: 'button', className: 'btn', id: 'export-save', onclick: exportSave }, '이어하기 파일 저장'),
        loadBtn, file),
      status, ask);
    ui = { foundN, quizN, xpN, filters, list, note, status, ask, askText };
  }

  function render() {
    if (!ui) build();
    const s = state(), journal = s.equipped?.journal || 'default';
    pane.dataset.journal = journal;
    pane.style.setProperty('--journal-color', JOURNALS[journal] || '#d8cdb0');
    ui.foundN.textContent = String(s.discovered.length); ui.quizN.textContent = String(s.solved.length); ui.xpN.textContent = String(s.xp);
    for (const b of ui.filters.children) b.setAttribute('aria-pressed', String(b.dataset.filter === filter));
    renderCards(s);
    if (doc.activeElement !== ui.note) ui.note.value = s.note || '';
  }

  // the card list; focus stays on the same card when the list is rebuilt under it
  function renderCards(s) {
    const a = doc.activeElement, keep = a && ui.list.contains(a) ? a.dataset.place : null;
    const cards = journalCards(s, filter);
    ui.list.replaceChildren(...(cards.length ? cards.map((c) => el('button', { type: 'button', className: 'j-card', dataset: { place: c.id, found: c.found ? 'yes' : 'no' }, onclick: () => press(c) },
      el('span', { className: 'j-head' }, el('span', { className: 'j-tag' }, c.tag), c.stamp ? el('span', { className: 'j-stamp' }, c.stamp) : null),
      el('b', {}, c.name),
      el('span', { className: 'j-desc' }, c.desc))) : [el('p', { className: 'j-empty' }, '아직 발견한 장소가 없어요. 충남도서관부터 찾아가 볼까요?')]));
    if (keep) ui.list.querySelector(`[data-place="${keep}"]`)?.focus({ preventScroll: true });
  }

  function choose(id) {
    filter = id;
    ctx.ctl.sound.play('click');
    render();
  }

  // P18: the menu closes first. ctl.open('place') replaces the menu with the place dialog (no resume in between);
  // ctl.goTo closes it into play and heads there
  function press(card) {
    if (card.found || card.remote) {
      const place = ctx.places.find((p) => p.id === card.id) || PLACES.find((p) => p.id === card.id);
      ctx.ctl.sound.play('click');
      ctx.ctl.open('place', { place, physical: false });
    } else if (ctx.ctl.goTo(card.id)) ctx.ctl.sound.play('move');
  }

  const say = (text, warn = false) => { ui.status.textContent = text; ui.status.classList.toggle('warn', warn); };
  function exportResult() {
    download(doc, RESULT_NAME, resultText(state(), PLACES, Date.now()));
    ctx.ctl.sound.play('click');
    say('탐방 결과를 내려받았어요.');
  }
  function exportSave() {
    ctx.save();   // the explorer's current position goes into the file
    download(doc, SAVE_NAME, saveFile(state()), 'application/json');
    ctx.ctl.sound.play('click');
    say('이어하기 파일을 저장했어요.');
  }

  // 이어하기 파일 불러오기: an oversized file is refused before it is read; a good one asks first
  async function readFile(input) {
    const f = input.files?.[0];
    if (!f) return;
    let r;
    try { r = readSaveFile(f.size > MAX_SAVE_BYTES ? '' : await f.text(), f.size); } catch { r = { ok: false, reason: 'json' }; }
    input.value = '';
    if (!r.ok) { closeAsk(); say(READ_ERROR[r.reason] || READ_ERROR.json, true); return; }
    incoming = r.state;
    say('');
    ui.askText.replaceChildren(`파일에는 ${incoming.discovered.length}곳의 발견 기록이 있어요.`, el('br'), '현재 기기의 기록을 이 파일로 바꿀까요?');
    ui.ask.hidden = false;
    doc.getElementById('confirm-import').focus({ preventScroll: true });
    ui.ask.scrollIntoView?.({ block: 'nearest' });
  }
  function closeAsk() { incoming = null; ui.ask.hidden = true; }

  return {
    render,
    reset() { if (!ui) return; closeAsk(); say(''); },
  };
}
