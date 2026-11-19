// 도움말 and 만든 사람 (the 2D showHelp and showAbout), and the dialog shell every simple dialog shares (도움말, 만든 사람,
// QR in ui/qr.js, the ferry in ui/ferry.js, NPC talk in ui/npc.js).
// The help (the controller's 'help' kind, {section}) has four tabs in the 2D order: 탐방 방법 (how to play, in the 3D
// controls: stick, drag to turn and tilt, pinch or wheel zoom, tap to go, the keys), 설정 (shortcuts to the menu's sound
// rows and the other 안내 dialogs), 선생님 (the 2D 선생님을 위한 안내, word for word) and 자료 출처 (the 2D 실제 지도와 표현
// 방식, 이번에 추가한 장소 and 사진과 자료 출처, told for the 3D map: the real data under it, what is decoration, the download
// links to the 2D game's own files, the photo credits). 자료 출처 in 설정 opens the help at that tab (P26).
// About (the 'about' kind) is the 2D showAbout from RELEASE. Copy is the 2D game's (app2d/game.js showHelp, showAbout)
// unless the 3D app works differently; every link is a button-sized chip (44 px), web links open in a new tab.
import { el, openModal, closeModal } from './dom.js';
import { RELEASE } from '#game/release.js';
import credits from '#game/assets/photo-credits.json' with { type: 'json' };

const focus = (node) => { try { node?.focus({ preventScroll: true }); } catch { /* gone */ } };
const spacer = () => el('span', { className: 'spacer' });
export const button = (label, { id, primary = false, onClick } = {}) => el('button', { type: 'button', className: 'btn' + (primary ? ' primary' : ''), id, onclick: onClick }, label);
const web = (label, href) => el('a', { className: 'btn', href, target: '_blank', rel: 'noopener' }, label + ' ↗');
const links = (...items) => el('div', { className: 'links' }, items.filter(Boolean));

/**
 * createPanelDialog(doc, {id, kind, root, returnFocus, onClose}) -> {scrim, panel, tag, title, blurb, body, footer,
 * isOpen, show(focusNode), hide(), close()}: a scrim > section.dialog.panel-dialog.<kind> (role dialog, aria-modal)
 * with the header (tag, title, line, ×), a scrolling body and a footer, appended to `root` (#app) before the loading
 * overlays. show() opens it modal (dom.js openModal: the rest of #app inert, Escape) and focuses `focusNode`; hide()
 * is the controller's hideDialog (idempotent, no onClose); close() is the player's way out (×, Escape, a tap beside
 * the panel, the footer buttons): hide, then onClose (ctl.close). Ids are `${id}-dialog`, `-panel`, `-title`, ….
 */
export function createPanelDialog(doc, { id, kind = id, root, returnFocus, onClose }) {
  const tag = el('span', { className: 'tag', id: `${id}-tag` }), title = el('h2', { id: `${id}-title` }), blurb = el('p', { className: 'blurb', id: `${id}-blurb` });
  const x = el('button', { type: 'button', className: 'close', id: `${id}-close`, 'aria-label': '닫기', title: '닫기 (Esc)' }, '×');
  const body = el('div', { className: 'body', id: `${id}-body` }), footer = el('footer', { id: `${id}-footer` });
  const panel = el('section', { className: `dialog panel-dialog ${kind}`, id: `${id}-panel`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': `${id}-title` },
    el('header', {}, el('div', { className: 'titles' }, tag, title, blurb), x), body, footer);
  const scrim = el('div', { className: `scrim ${kind}-scrim`, id: `${id}-dialog`, hidden: true }, panel);
  root.insertBefore(scrim, doc.getElementById('loading'));
  let open = false;
  const d = {
    scrim, panel, tag, title, blurb, body, footer,
    get isOpen() { return open; },
    show(node) {
      scrim.hidden = false; open = true;
      openModal(panel, { root, returnFocus, onClose: () => d.close() });
      if (node) focus(node);
    },
    hide() { if (!open) return; open = false; scrim.hidden = true; closeModal(panel); },
    close() { if (!open) return; d.hide(); onClose?.(); },
  };
  x.onclick = () => d.close();
  scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) d.close(); });
  return d;
}

/** The footer of the 안내 dialogs: 메뉴로 돌아가기 (the menu at 설정, where they are opened) and 계속 탐방하기. */
function backFooter(d, ctx, id) {
  const done = button('계속 탐방하기', { id: `${id}-done`, primary: true, onClick: () => d.close() });
  d.footer.replaceChildren(button('메뉴로 돌아가기', { id: `${id}-menu`, onClick: () => ctx.ctl.open('menu', { tab: 'settings' }) }), spacer(), done);
  return done;
}

// ---- 탐방 방법: the 2D steps and overview, told for the 3D controls
export const HELP_VIEWS = [['how', '탐방 방법'], ['settings', '설정'], ['teacher', '선생님'], ['sources', '자료 출처']];
const STEPS = [
  '① 장소 원 안에 들어가면 안내가 열려요. 가까이에서 표지를 누르거나 ‘탐방’ 버튼, E 키를 눌러도 돼요.',
  '② 화면 왼쪽을 누른 채 끌면 생기는 조이스틱이나 방향키·WASD로 직접 걸어도 좋아요.',
  '③ 먼 장소나 땅을 누르면 찾아가요. 다시 보고 싶으면 원 밖으로 나갔다 들어오거나 ‘탐방’ 버튼 또는 E 키를 눌러요.',
  '④ 이야기를 읽고 퀴즈를 풀면 금화를 더 받을 수 있어요. 틀리면 힌트를 보고 다시 도전해요.',
];
const OVERVIEW = '홍성군 전체가 하나의 3D 지도로 이어져 있어요. 오른쪽 위 미니맵에서 내 위치를 확인하고, 미니맵을 누르면 전체 지도가 열려요. 오른쪽 아래 ‘탈것’에서 ‘걷기 ×1 / 자전거 ×2 / 자동차 ×4 / 슈퍼카 ×8 / 느린 비행기 ×4 / 비행기 ×16’을 골라 보세요. 설정의 걷기 방식이 ‘길로만’이면 누른 곳과 조이스틱 모두 길을 따라가요. ‘자유롭게’에서도 바다와 큰 저수지는 피해서 이동해요. 비행기는 길 모드에서도 자유롭게 날아요. 자동차는 차도를 따라 달리고, 좌우 버튼으로 다음 갈림길에서 돌 방향을 골라요. 자동차의 일방통행 규칙은 적용하지 않아요. 죽도는 남당항에서 배를 타고 가요. 메뉴의 ‘장소 찾기’에 장소 이름 일부나 초성을 입력하면 자동완성 목록이 나와요. 태블릿을 가로로 놓으면 지도를 더 넓게 볼 수 있어요.';
export const CONTROLS = [
  ['조이스틱', '화면 왼쪽을 누른 채 끌어요. 걷기와 탈것이 움직여요.'],
  ['화면 끌기', '오른쪽을 끌거나 마우스로 끌면 화면을 돌리고 기울여요.'],
  ['확대·축소', '두 손가락을 벌리거나 오므려요. 마우스는 휠을 굴려요.'],
  ['땅 누르기', '누른 곳으로 찾아가요. 장소 표지를 누르면 그 장소로 찾아가고, 가까우면 안내가 열려요.'],
  ['미니맵', '오른쪽 위 둥근 지도를 누르면 홍성군 전체 지도가 열려요.'],
];
// input/controls.js: KEYMAP, the zoom and tilt keys, ACTIONS
export const KEYS = [
  ['W A S D · 방향키', '움직여요'],
  ['E', '탐방하기 · NPC와 대화 · 배 타기'],
  ['C', '카메라 바꾸기 (비스듬히 · 뒤따라)'],
  ['T', '시간 바꾸기 (낮 · 노을 · 밤)'],
  ['Q', '화질 바꾸기'],
  ['R · F', '위에서 내려다보기 · 옆에서 보기'],
  ['+ · −', '가까이 · 멀리'],
  ['1–6', '걷기 · 자전거 · 자동차 · 슈퍼카 · 느린 비행기 · 비행기'],
  ['Esc', '열린 창 닫기'],
];
const kbd = (k) => el('dt', {}, ...k.split(' · ').flatMap((part, i) => (i ? [' · ', el('kbd', {}, part)] : [el('kbd', {}, part)])));
const list = (rows, keys = false) => el('dl', { className: 'keys' }, rows.flatMap(([k, v]) => [keys ? kbd(k) : el('dt', {}, k), el('dd', {}, v)]));

// ---- 선생님: the 2D 선생님을 위한 안내 ([label, text], label null for a paragraph without one)
export const TEACHER = [
  ['대상:', '아이스크림 초등 사회 3학년 1학기 1단원 연계 활동용 게임. 장소 경험 떠올리기, 주변 장소의 특징 알아보기, 친구에게 소개하기를 중심으로 구성했어요. 교과서 문장을 옮기지 않고 새로운 설명과 문항을 작성했어요.'],
  [null, '교과서의 정확한 차시·쪽수와 책으로 된 홍성 지역화 교재의 내용은 아직 대조하지 않았어요. 정식 수업용 문항은 교재 검토 후 확정해야 해요.'],
  ['구현 범위:', '홍성군의 3읍·8면 전체를 한 지도에서 이동하며 223개 장소를 탐방해요. 관공서·학교·가게·역사 유적·박물관·축제·시장·특산물·먹거리·카페·공원·휴양림을 유형별 아이콘으로 표시했어요. 지도에 없는 시설도 있어 전체 시설 명부와 같지는 않아요.'],
  ['보상:', '일상 장소 10금화, 공공·자연 장소 40~80금화, 지역 문화유산·무형문화 100금화, 시장·특산물·축제 60~100금화. 첫 발견에만 지급하고 퀴즈 보너스도 한 번만 받아요. 순위 경쟁은 없어요.'],
  ['저장:', '이름·계정·GPS 없이 브라우저에 저장해요. 브라우저 데이터 삭제나 시크릿 모드에서는 기록이 사라질 수 있어요. 결과 또는 이어하기 파일을 내려받아 보관할 수 있어요.'],
  ['열람:', '현재 사이트는 제작자 확인용 비공개 버전이에요. QR 코드는 접속 주소를 담고 있으며 사이트 열람 권한을 바꾸지는 않아요.'],
];

// ---- 자료 출처: the 2D game's own files (bundled by Vite, P7), named as the 2D help names them
export const DOWNLOADS = [
  { path: 'map-county.json', label: '홍성군 지도 자료 (도로·건물: ODbL)', url: new URL('#game/map-county.json', import.meta.url).href },
  { path: 'county-boundaries.json', label: '읍·면 경계 자료 (CC BY 4.0)', url: new URL('#game/county-boundaries.json', import.meta.url).href },
  { path: 'assets/facility-location-sources.json', label: '추가 시설과 확인 출처', url: new URL('#game/assets/facility-location-sources.json', import.meta.url).href },
  { path: 'assets/culture-location-sources.json', label: '역사·문화·생활 장소와 확인 출처', url: new URL('#game/assets/culture-location-sources.json', import.meta.url).href },
  { path: 'assets/shop-location-sources.json', label: '가게 위치 자료와 출처', url: new URL('#game/assets/shop-location-sources.json', import.meta.url).href },
  { path: 'assets/expansion-location-sources.json', label: '추가 장소와 좌표 출처', url: new URL('#game/assets/expansion-location-sources.json', import.meta.url).href },
  { path: 'assets/hongseong-tourist-map-2022.jpg', label: '첨부 관광지도 원본 · 2022년 11월', url: new URL('#game/assets/hongseong-tourist-map-2022.jpg', import.meta.url).href, view: true },
  { path: 'assets/tourist-map-reconciliation.json', label: '관광지도 대조 결과', url: new URL('#game/assets/tourist-map-reconciliation.json', import.meta.url).href },
  { path: 'assets/school-research.json', label: '학교별 확인 자료', url: new URL('#game/assets/school-research.json', import.meta.url).href },
  { path: 'assets/NANUM-LICENSE.txt', label: 'SIL Open Font License', url: new URL('#game/assets/NANUM-LICENSE.txt', import.meta.url).href, view: true },
];
const file = (path) => {
  const d = DOWNLOADS.find((f) => f.path === path);
  return d.view ? el('a', { className: 'btn', href: d.url, target: '_blank', rel: 'noopener' }, d.label) : el('a', { className: 'btn', href: d.url, download: path.split('/').pop() }, d.label);
};
// the 3D map's own derived data (public/data), offered under the same licence (ODbL)
const data3d = (name, label) => el('a', { className: 'btn', href: `./data/${name}`, download: `hongseong-3d-${name}` }, label);

const P = (...kids) => el('p', {}, ...kids);
const section = (title, ...kids) => el('section', { className: 'help-sec' }, el('h3', {}, title), ...kids);

function sources() {
  return [
    section('실제 지도와 표현 방식',
      P('실제 고도·도로·물길·건물·장소 좌표 위에 만든 3D 지도예요. OpenStreetMap 기여자 · ODbL의 홍성군 전역과 인접 지역의 도로·건물·공원·하천·해안선·군 경계를 바탕으로 지었어요(도로와 물길은 2D판과 같은 2026년 9월 9일 조회 자료). 도형의 위치와 연결을 유지했어요. 데이터에 없는 건물, 개별 점포와 실제 건물 출입구는 모두 표현하지 못했어요.'),
      P('나무, 가로등, 일부 집은 분위기를 위한 장식이에요. 장식 건물과 나무·가로등에는 글자를 넣지 않아 실제 자료처럼 보이지 않게 했어요. 건물 높이는 자료에 있는 층수나 높이를 쓰고, 없으면 건물 종류에 맞춰 게임에서 정했어요.'),
      links(web('OpenStreetMap 기여자 · ODbL', 'https://www.openstreetmap.org/copyright'), data3d('features.json', '3D 지도 자료 (도로·물길: ODbL)'), data3d('buildings.json', '3D 건물 자료 (ODbL)')),
      P('도의회는 공식 주소에 따라 예산군으로 표시했고, 위치는 공개 좌표 자료와 대조했어요. 도청 본관은 홍성군이에요.'),
      links(web('도의회 공식 주소', 'https://council.chungnam.go.kr/kr/locationCnts.do')),
      P('산의 높낮이는 Terrain Tiles / Mapzen의 실제 고도 데이터로 만들었어요. 한국 지역의 SRTM·GMTED2010 자료는 USGS, ETOPO1 자료는 NOAA 제공이에요. 산의 모습을 알아보기 쉽게 높이를 1.2배로 강조했으며 현재 현장 영상은 아니에요.'),
      links(web('Terrain Tiles / Mapzen', 'https://registry.opendata.aws/terrain-tiles/'), web('출처와 이용 조건', 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md')),
      P('일반 가게는 공개된 지점명·주소·지도 좌표를 교차확인했어요. 점포 좌표는 출처의 표시값으로, 건물의 정확한 출입구나 층을 뜻하지 않아요. 특히 노0랜드와 파리0게뜨는 서로 다른 주소이나 출처 지도 좌표가 가까워 정밀 위치 재확인이 필요해요.'),
      links(file('assets/shop-location-sources.json')),
      P('캐릭터와 표지 크기, 이동 속도는 게임에 맞게 조정했어요. NPC와 나무·가로등 장식은 게임 표현이며 실제 시설 위치를 나타내지는 않아요. 길 모드는 공개 지도에 연결된 도로와 산책로를 따라가요. 건물 중앙 대신 가까운 길에서 안내가 열릴 수 있어요. 바다와 큰 저수지는 지상 이동으로 건널 수 없어요. 비행기는 물 위를 날 수 있고 죽도는 남당항에서 배를 타고 왕복해요. 이동 경로는 게임용이며 실제 보행 경로나 출입 가능 구역을 안내하지 않아요.'),
      P('읍·면 표시는 실제 경계 안에 있는 캐릭터의 좌표로 판정해요. 본 데이터는 통계청 통계지리정보서비스(SGIS)에서 공공누리 제1유형으로 개방한 행정동 경계를 가공한 것이며(가공: vuski/admdongkor, 2026년 7월 자료), CC BY 4.0으로 배포됩니다. 경계 부근의 오차가 있을 수 있어요.'),
      links(web('통계청 통계지리정보서비스(SGIS)', 'https://sgis.kostat.go.kr'), web('vuski/admdongkor, 2026년 7월 자료', 'https://github.com/vuski/admdongkor/tree/master/ver20260701')),
      P('학교 이름과 주소는 나이스 교육정보 개방 포털의 학교 기본정보와 대조했어요. 시설 좌표는 공개 지도의 등록 위치이며 현재 출입구나 영업 여부를 보증하지 않아요.'),
      links(web('나이스 교육정보 개방 포털', 'https://open.neis.go.kr')),
      links(file('map-county.json'), file('county-boundaries.json'), file('assets/facility-location-sources.json'), file('assets/culture-location-sources.json'))),
    section('이번에 추가한 장소',
      P('농협은행·농협·하나로마트는 원래 이름으로 표시해요. 다른 상호는 가운데를 0으로 가렸고 원래 이름으로도 검색할 수 있어요. 남산휴양림은 남산산림욕장 이름으로, 국립오서산자연휴양림은 보령시 청라면으로 표시해요. 내포 고속시외버스정류소는 예산군 삽교읍이에요.'),
      P('철길은 공개 지도에 등록된 장항선·서해선 등의 실제 선형을 그렸어요. 열차 운행 시각이나 개통·영업 여부를 실시간 안내하지는 않아요. 일부 공원과 물놀이장은 공원 대표 위치이며 각 장소의 자료에서 확인할 수 있어요.'),
      links(file('assets/expansion-location-sources.json'))),
    section('사진과 자료 출처',
      P('축제는 대표 행사 장소를 표시했으며 상시 개최를 뜻하지 않아요. 특산물·먹거리 표시는 생산·판매 지역을 소개하는 탐방 지점으로, 특정 상점을 추천하거나 물건을 구매하는 기능은 없어요.'),
      ...credits.assets.map((c) => el('div', { className: 'credit-item' },
        el('h4', {}, c.place), P(c.attribution), P(c.changes || '웹용 크기 축소·WebP 변환'),
        links(web('원문', c.sourcePage), web(c.license, c.licenseUrl)))),
      P('사진이 없는 의회 역할·영화관·결성농요와 추가한 가게에는 이해를 돕는 AI 삽화를 사용했어요. 실제 건물의 외형이나 공연의 정확한 재현을 뜻하지 않아요. 캐릭터와 삽화는 이 게임을 위해 새로 제작했어요.'),
      links(web('홍성문화관광재단 · 홍성 명소', 'https://hongju.or.kr/home/content.do?menu_cd=000098'), web('충남관광 · 결성농요농사박물관', 'https://tour.chungnam.go.kr/prog/trsrcn/kor/sub02_01_02/view.do?trsrcnNo=1284')),
      P('학교마다 설립 연혁과 확인된 특징, 학교 누리집과 사진 원문 링크를 연결했어요. 사용 허락이 확인되지 않은 학교 사진은 복사하지 않고 공통 삽화를 사용했어요.'),
      links(file('assets/hongseong-tourist-map-2022.jpg'), file('assets/tourist-map-reconciliation.json'), file('assets/school-research.json')),
      P('글꼴: 네이버 나눔스퀘어라운드(SIL Open Font License), 제목 글꼴 Black Han Sans(SIL Open Font License). 배경음과 효과음은 웹 오디오로 만든 짧은 오리지널 음이며, 결성농요의 실제 노래가 아니에요.'),
      links(web('네이버 나눔스퀘어라운드', 'https://hangeul.naver.com/font'), file('assets/NANUM-LICENSE.txt'))),
  ];
}

/**
 * createHelpDialog(doc, ctx) -> {open({section}), hide(), close(), isOpen, view}: the controller's 'help' dialog.
 * ctx: root, returnFocus; ctl (open('menu' | 'about' | 'qr'), sound); settings() / setting(key, value) (the menu's
 * 설정 values and their effect, main.js); onClose (ctl.close).
 */
export function createHelpDialog(doc, ctx) {
  const d = createPanelDialog(doc, { id: 'help', root: ctx.root, returnFocus: ctx.returnFocus, onClose: ctx.onClose });
  d.tag.textContent = '도움말'; d.title.textContent = '탐방 안내와 설정'; d.blurb.hidden = true;
  const tabs = HELP_VIEWS.map(([v, label]) => el('button', { type: 'button', role: 'tab', id: 'htab-' + v, 'aria-controls': 'help-body', 'aria-selected': 'false', tabIndex: -1, onclick: () => select(v) }, label));
  const row = el('div', { className: 'tabs help-tabs', role: 'tablist', 'aria-label': '도움말 보기', id: 'help-tabs' }, tabs);
  d.body.before(row);
  d.body.setAttribute('role', 'tabpanel'); d.body.tabIndex = 0;
  row.addEventListener('keydown', (e) => {
    const i = HELP_VIEWS.findIndex(([v]) => v === view), n = HELP_VIEWS.length;
    const to = { ArrowRight: (i + 1) % n, ArrowLeft: (i + n - 1) % n, Home: 0, End: n - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault(); select(HELP_VIEWS[to][0]); focus(tabs[to]);
  });
  const done = backFooter(d, ctx, 'help');
  let view = 'how';

  // the 설정 shortcuts: the menu's 효과음 and 배경음 rows (same keys, same effect), the other 안내 dialogs
  function shortcuts() {
    const v = ctx.settings?.() || {};
    const seg = (key, label, options) => el('div', { className: 'opt-row' }, el('span', { className: 'opt-name', id: 'hopt-' + key }, label),
      el('div', { className: 'seg', role: 'group', 'aria-labelledby': 'hopt-' + key, dataset: { hsetting: key } }, options.map(([value, text]) => el('button', {
        type: 'button', dataset: { value }, 'aria-pressed': String(v[key] === value),
        onclick: () => { ctx.setting?.(key, value); ctx.ctl.sound.play('click'); render(); focus(d.body.querySelector(`[data-hsetting="${key}"] [data-value="${value}"]`)); },
      }, text))));
    return [section('설정',
      P('효과음과 배경음은 여기서도 바꿀 수 있어요. 소리 크기, 설명 읽기 음성, 이동 속도와 화면은 메뉴의 설정에서 골라요.'),
      seg('sound', '효과음', [['on', '켜기'], ['off', '끄기']]),
      seg('music', '배경음', [['off', '끄기'], ['on', '켜기']]),
      links(button('설정 모두 보기', { id: 'help-all-settings', onClick: () => ctx.ctl.open('menu', { tab: 'settings' }) }), button('만든 사람', { onClick: () => ctx.ctl.open('about') }), button('QR로 열기', { onClick: () => ctx.ctl.open('qr') })))];
  }

  function render() {
    const parts = view === 'how' ? [
      section('어떻게 탐방하나요?', P(...STEPS.flatMap((s, i) => (i ? [el('br'), s] : [s]))), P(OVERVIEW)),
      section('화면 움직이기', list(CONTROLS)),
      section('키보드', list(KEYS, true)),
    ] : view === 'settings' ? shortcuts()
      : view === 'teacher' ? [section('선생님을 위한 안내', ...TEACHER.map(([label, text]) => (label ? P(el('strong', {}, label), ' ', text) : P(text))))]
        : sources();
    d.body.replaceChildren(...parts);
  }
  function select(v) {
    view = HELP_VIEWS.some(([k]) => k === v) ? v : 'how';
    tabs.forEach((b, i) => { const on = HELP_VIEWS[i][0] === view; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    d.panel.dataset.view = view;
    d.body.setAttribute('aria-labelledby', 'htab-' + view);
    render();
    d.body.scrollTop = 0;
  }

  return {
    open(data = {}) { select(data.section || 'how'); d.show(tabs[HELP_VIEWS.findIndex(([k]) => k === view)] || done); },
    hide: () => d.hide(), close: () => d.close(),
    get isOpen() { return d.isOpen; }, get view() { return view; },
  };
}

/** createAboutDialog(doc, ctx) -> {open(), hide(), close(), isOpen}: 만든 사람, the 2D showAbout from RELEASE. */
export function createAboutDialog(doc, ctx) {
  const d = createPanelDialog(doc, { id: 'about', root: ctx.root, returnFocus: ctx.returnFocus, onClose: ctx.onClose });
  d.tag.textContent = '만든 사람'; d.title.textContent = '홍성 탐험대'; d.blurb.textContent = '버전 ' + RELEASE.version;
  const row = (dt, ...dd) => [el('dt', {}, dt), el('dd', {}, ...dd)];
  d.body.append(
    el('section', { className: 'about-info help-sec' }, el('h3', {}, '함께 알아가는 우리 고장'), el('dl', {},
      ...row('제작자', RELEASE.creator), ...row('소속', RELEASE.organization),
      ...row('연락처', el('a', { className: 'btn', href: 'mailto:' + RELEASE.email }, RELEASE.email)),
      ...row('버전', `${RELEASE.version} · ${RELEASE.date}`))),
    el('section', { className: 'help-sec' }, el('h3', {}, '최근 변경점'), el('p', { className: 'sub' }, `2D판 ${RELEASE.version}에서 바뀐 점이에요. 장소, 이야기, 퀴즈와 저장은 3D판도 같아요.`),
      ...RELEASE.changes.map((v) => el('p', { className: 'change-item' }, v))));
  const done = backFooter(d, ctx, 'about');
  return { open() { d.body.scrollTop = 0; d.show(done); }, hide: () => d.hide(), close: () => d.close(), get isOpen() { return d.isOpen; } };
}
