// 장소 찾기 and 주변 찾기: two views of the county map dialog (ui/county-map.js, P23).
// 장소 찾기 is a combobox over the 2D game's own searchPlaces (#game/search.js: names, original and short names,
// aliases, initial consonants such as ㅎㅅㅇ) with the 2D setupPlaceSearch keys: the arrows move through the results,
// Enter takes the active one (or the first), Escape closes the open list (a second Escape closes the dialog), a tap
// chooses. A key that belongs to a Korean IME composition is left to the IME: the Enter that commits a syllable never
// chooses a result (composingKey: isComposing, the compositionstart..end span, and Safari's keyCode 229).
// 주변 찾기 is the 2D showNearby: the fifteen PLACE_FILTERS, the substring filter, nearest first, each row with its
// distance, 발견 +N금화 and 찾아가기 / 안내 보기 / 이야기 보기; given a fixed list (the pins under one tap of the county map)
// it shows only those. Copy is the 2D game's (app2d/search.js, app2d/game.js showNearby).
import { el } from './dom.js';
import { searchPlaces } from '#game/search.js';
import { symbolKey, symbolFor } from '#game/place-icons.js';

// app2d/game.js PLACE_FILTERS (not exported there)
export const PLACE_FILTERS = [['all', '전체'], ['government', '관공서'], ['post', '우체국'], ['bank', '은행'], ['school', '초·중·고·대학교'], ['mart', '마트'], ['shop', '일상 가게'], ['heritage', '역사 유적'], ['museum', '박물관·미술관'], ['festival', '축제·행사'], ['market', '시장'], ['specialty', '특산물·먹거리'], ['cafe', '카페'], ['nature', '공원·자연'], ['mapStories', '관광지도 이야기']];
const SCHOOLS = ['elementary', 'middle', 'high', 'university'], MUSEUMS = ['museum', 'gallery'];
const NEAR_LEAD = '가까운 장소부터 보여요. 장소를 고르면 지금 위치에서 이동해요. 원에 들어가면 안내가 열려요. ‘관광지도 이야기’에는 위치를 더 확인하고 있는 장소도 있어요.';
const SEARCH_LEAD = '장소 이름 일부나 초성을 입력하면 자동완성 목록이 나와요.';
const SVG = 'http://www.w3.org/2000/svg';
const QUIET = { play() {} };

/** One place against one 2D filter (app2d/game.js showNearby). */
export function matchesFilter(p, filter) {
  const k = symbolKey(p);
  return filter === 'all' || (filter === 'mapStories' && !!p.fromTouristMap) || k === filter
    || (filter === 'school' && SCHOOLS.includes(k)) || (filter === 'shop' && p.type === 'daily' && k !== 'mart' && k !== 'bank')
    || (filter === 'nature' && p.type === 'nature') || (filter === 'heritage' && p.type === 'heritage' && !MUSEUMS.includes(k))
    || (filter === 'museum' && MUSEUMS.includes(k)) || (filter === 'specialty' && (k === 'specialty' || k === 'food'));
}

/**
 * nearbyPlaces(all, {filter, query, from, district, only}) -> the 2D nearby list. all: every place (mapped ones with a
 * game-frame point; story-only ones, which have none, come in only under 관광지도 이야기); only: a fixed list instead;
 * from: the player's [x, y], nearest first (no point: last); query: a substring of name, original name, area or category.
 */
export function nearbyPlaces(all, { filter = 'all', query = '', from = null, district = '', only = null } = {}) {
  const base = Array.isArray(only) ? only : all.filter((p) => !p.remote || filter === 'mapStories');
  let list = base.filter((p) => (!district || p.area === district) && matchesFilter(p, filter));
  if (from) {
    const d = (p) => (p.point ? Math.hypot(p.point[0] - from[0], p.point[1] - from[1]) : Infinity);
    list = list.map((p) => [p, d(p)]).sort((a, b) => (a[1] === b[1] ? 0 : a[1] - b[1])).map(([p]) => p);
  }
  const q = String(query || '').trim().toLowerCase();
  if (q) list = list.filter((p) => `${p.name} ${p.originalName || ''} ${p.area} ${p.category}`.toLowerCase().includes(q));
  return list;
}

/** The 2D distance wording: 350 m, 1.2 km. */
export const distanceLabel = (d) => (d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m');
/** The 2D row button: a story-only place is read, a place in reach is opened, any other is travelled to. */
export const goLabel = (p, near) => (p.remote ? '이야기 보기' : near ? '안내 보기' : '찾아가기');

/** A key the IME owns: inside a composition, or the Enter that ends one (Safari sends it as keyCode 229). */
export const composingKey = (e, composing) => !!(e.isComposing || composing || e.keyCode === 229);

/**
 * The combobox key rule (2D setupPlaceSearch). st: {active, count, open}; returns the next active index and the action:
 * 'move' (arrows, wrapping), 'choose' (Enter: the active result or the first), 'close' (Escape on an open list), or
 * null (the key is not the combobox's: typing, a composing key, Escape on a closed list, Enter with no results).
 */
export function comboKey({ active = -1, count = 0, open = false } = {}, key, composing = false) {
  if (composing) return { active, action: null };
  if (key === 'ArrowDown' || key === 'ArrowUp') {
    const down = key === 'ArrowDown';
    if (!count) return { active: -1, action: 'move' };
    return { active: active < 0 ? (down ? 0 : count - 1) : (active + (down ? 1 : -1) + count) % count, action: 'move' };
  }
  if (key === 'Enter') return count ? { active: active < 0 ? 0 : active, action: 'choose' } : { active, action: null };
  if (key === 'Escape') return open ? { active: -1, action: 'close' } : { active, action: null };
  return { active, action: null };
}

/** The 2D place pictogram (app2d/place-icons.js) in its colour circle. */
export function symbolIcon(doc, p) {
  const s = symbolFor(p), svg = doc.createElementNS(SVG, 'svg'), path = doc.createElementNS(SVG, 'path');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); path.setAttribute('d', s.path); svg.append(path);
  const wrap = el('span', { className: 'psym', title: s.label }, svg);
  wrap.style.setProperty('--symbol-color', s.color);
  return wrap;
}

/**
 * createSearch(pane, ctx) -> {reset(), focus()}: the 장소 찾기 view. ctx: doc, all (every place), go(place) (the dialog's
 * 찾아가기: closes it and heads there, or opens a story).
 */
export function createSearch(pane, ctx) {
  const { doc } = ctx;
  let results = [], active = -1, composing = false;
  const input = el('input', {
    type: 'search', id: 'map-query', className: 'search-input', role: 'combobox', 'aria-label': '장소 이름 검색', 'aria-autocomplete': 'list',
    'aria-expanded': 'false', 'aria-controls': 'map-results', placeholder: '학교, 놀이터, 역…', autocomplete: 'off', enterKeyHint: 'search',
  });
  input.spellcheck = false;
  const clear = el('button', { type: 'button', className: 'search-clear', id: 'map-query-clear', 'aria-label': '검색어 지우기', onclick: () => { input.value = ''; close(); results = []; input.focus({ preventScroll: true }); } }, '×');
  const list = el('ul', { id: 'map-results', className: 'search-results', role: 'listbox', 'aria-label': '추천 장소', hidden: true });
  pane.replaceChildren(el('p', { className: 'lead' }, SEARCH_LEAD), el('div', { className: 'search-box', role: 'search' }, el('div', { className: 'search-wrap' }, input, clear), list));

  const isOpen = () => !list.hidden;
  function close() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; highlight(); }
  function highlight() {
    list.querySelectorAll('[role="option"]').forEach((o, i) => o.setAttribute('aria-selected', String(i === active)));
    if (active >= 0) { input.setAttribute('aria-activedescendant', 'map-result-' + active); doc.getElementById('map-result-' + active)?.scrollIntoView?.({ block: 'nearest' }); }
    else input.removeAttribute('aria-activedescendant');
  }
  function render() {
    results = searchPlaces(ctx.all, input.value);
    active = -1;
    input.removeAttribute('aria-activedescendant');
    if (!input.value.trim()) { list.replaceChildren(); close(); return; }
    list.hidden = false; input.setAttribute('aria-expanded', 'true');
    if (!results.length) { list.replaceChildren(el('li', { className: 'search-empty' }, '찾는 장소가 없어요. 이름을 짧게 써 볼까요?')); return; }
    list.replaceChildren(...results.map((p, i) => el('li', {
      id: 'map-result-' + i, role: 'option', 'aria-selected': 'false', dataset: { place: p.id },
      onpointerdown: (e) => e.preventDefault(),   // keep the focus (and a phone's keyboard state) in the input
      onclick: () => choose(i),
    }, symbolIcon(doc, p), el('span', { className: 'opt-text' }, el('strong', {}, p.name), el('small', {}, `${p.area} · ${p.category}${p.remote ? ' · 이야기로 보기' : ' · 찾아가기'}`)))));
  }
  function choose(i) {
    const p = results[i];
    if (!p) return;
    input.value = p.name;
    close();
    ctx.go(p);
  }

  input.addEventListener('input', render);
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; render(); });
  input.addEventListener('keydown', (e) => {
    if (composingKey(e, composing)) { if (e.key === 'Escape') e.stopPropagation(); return; }   // the IME's key: its Escape cancels the syllable, not the dialog
    const r = comboKey({ active, count: results.length, open: isOpen() }, e.key);
    if (!r.action) return;
    e.preventDefault();   // handled here: an Escape that closed the list leaves the dialog open
    if (r.action === 'close') { close(); return; }
    if (r.action === 'choose') { choose(r.active); return; }
    if (!isOpen()) render();
    active = results.length ? r.active : -1;
    highlight();
  });

  return {
    reset() { input.value = ''; results = []; composing = false; list.replaceChildren(); close(); },
    focus() { try { input.focus({ preventScroll: true }); } catch { /* hidden */ } },
    get input() { return input; },
  };
}

/**
 * createNearby(pane, ctx) -> {show({only}), reset()}: the 주변 찾기 view. ctx: doc, all, from() (the player's [x, y]),
 * found() (the discovered ids), reachable(place), go(place), sound. show({only}): a fixed list (no filters, no search)
 * under 가까이 있는 장소; show() the whole county under 홍성의 장소 찾기.
 */
export function createNearby(pane, ctx) {
  const { doc } = ctx, sound = ctx.sound || QUIET;
  const view = { filter: 'all', only: null };
  const title = el('h3', { className: 'near-title', id: 'nearby-title' });
  const filters = el('div', { className: 'near-filters', role: 'group', 'aria-label': '장소 종류' },
    PLACE_FILTERS.map(([k, label]) => el('button', { type: 'button', dataset: { nearFilter: k }, 'aria-pressed': 'false', onclick: () => { sound.play('click'); view.filter = k; render(); } }, label)));
  const input = el('input', { type: 'search', id: 'nearby-search', className: 'near-search', placeholder: '장소·축제·먹거리 이름 찾기', 'aria-label': '장소 이름 검색', autocomplete: 'off', enterKeyHint: 'search', oninput: () => render() });
  input.spellcheck = false;
  const list = el('div', { className: 'place-list', id: 'nearby-list' });
  pane.replaceChildren(title, el('p', { className: 'lead' }, NEAR_LEAD), filters, input, list);

  function row(p, from, found) {
    const near = !p.remote && !!ctx.reachable?.(p), d = from && p.point ? Math.hypot(p.point[0] - from[0], p.point[1] - from[1]) : 0;
    const label = goLabel(p, near);
    return el('article', { className: 'place-row', dataset: { place: p.id } },
      symbolIcon(doc, p),
      el('div', { className: 'row-text' },
        el('span', { className: 'row-tag', dataset: { county: p.county === '홍성군' ? 'home' : 'other' } }, `${p.category} · ${p.area}`),
        el('h4', {}, p.name, found.has(p.id) ? el('span', { className: 'found', title: '발견한 장소' }, ' ✓') : null),
        el('p', {}, p.address || p.area, el('br'), `${p.remote ? '이야기로 만나기 · 좌표 확인 중' : distanceLabel(d) + ' 거리'} · 발견 +${p.coins}금화`)),
      el('button', { type: 'button', className: 'btn btn-grad go', dataset: { go: p.id }, 'aria-label': `${p.name} ${label}`, onclick: () => ctx.go(p) }, label + ' →'));
  }
  function render() {
    const fixed = Array.isArray(view.only);
    title.textContent = fixed ? '가까이 있는 장소' : '홍성의 장소 찾기';
    filters.hidden = input.hidden = fixed;
    for (const b of filters.children) b.setAttribute('aria-pressed', String(b.dataset.nearFilter === view.filter));
    const from = ctx.from?.() || null, found = new Set(ctx.found?.() || []);
    const places = nearbyPlaces(ctx.all, { filter: fixed ? 'all' : view.filter, query: fixed ? '' : input.value, from, only: view.only });
    list.replaceChildren(...(places.length ? places.map((p) => row(p, from, found)) : [el('p', { className: 'empty-note' }, '이름이나 장소 종류를 바꾸어 찾아보세요.')]));
  }

  return {
    show({ only = null } = {}) { view.only = Array.isArray(only) ? only : null; render(); pane.scrollTop = 0; },
    reset() { view.filter = 'all'; view.only = null; input.value = ''; },
    get filter() { return view.filter; },
  };
}
