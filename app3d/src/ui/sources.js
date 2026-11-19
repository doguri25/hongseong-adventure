// 사진·자료 출처 / 학교 사진·자료 for one place (2D showPlaceSources, schoolDetails, schoolLinks, creditHtml), shown as a
// view inside the place dialog with 이야기로 돌아가기 under it (place-dialog.js). placeSources is pure; renderSources
// builds the view with textContent and DOM links only (every link a web address, opened in a new tab). Copy is the 2D
// game's.
import { el } from './dom.js';
import credits from '#game/assets/photo-credits.json' with { type: 'json' };

const MAP_CREDIT = '실제 지형 자료를 색과 명암으로 표현한 지도 · OpenStreetMap 기여자 (ODbL) · Terrain Tiles / Mapzen · USGS / NOAA';
const AI_CREDIT = '이해를 돕는 AI 삽화 · 실제 건물이나 행사 현장 사진이 아닙니다.';
const PHOTO_NOTE = '웹용 크기 축소·WebP 변환, 원본 워터마크 유지.';
const web = (url) => typeof url === 'string' && /^https?:\/\//i.test(url);
const link = (label, url) => (web(url) ? [{ label, url }] : []);

/**
 * placeSources(place, list = the 2D photo credits) -> {facts, photoNote, schoolLinks, credit: {text, links, note},
 * location, links}: the school's facts and links (schools only), the picture's credit, the 지도 위치 안내 note, then
 * 좌표 확인 자료, the story sources and 장소 자료 원문. Links are {label, url}; anything that is not a web address is left out.
 */
export function placeSources(p, list = credits.assets) {
  const s = p.schoolStory, facts = [], schoolLinks = [];
  if (s) {
    if (s.foundedDate) facts.push(`${s.foundedLabel || '설립일'} ${s.foundedDate}`);
    if (s.anniversaryDate) facts.push(`개교기념일 ${s.anniversaryDate.slice(5).replace('-', '월 ')}일`);
    schoolLinks.push(...link('학교 사진 원문 ↗', s.photo?.sourcePageUrl));
    if (s.video?.url) schoolLinks.push(...link(`${s.video.canUseAsCurrentCampus === false ? '옛 교정 영상' : '학교 모습 영상'} · ${s.video.year} ↗`, s.video.url));
    schoolLinks.push(...link('학교 누리집 ↗', s.officialWebsite));
  }
  const photoNote = s?.photo?.caption ? `사진 원문 안내: ${s.photo.caption}${s.photo.sourceDate ? ` · ${s.photo.sourceDate} 자료` : ''}` : null;
  let credit;
  const c = p.mediaType === 'map' ? null : list.find((a) => a.id === p.photo);
  if (p.mediaType === 'map') credit = { text: MAP_CREDIT, links: [], note: null };
  else if (c) credit = { text: c.attribution, links: [...link('사진 원문', c.sourcePage), ...link('이용 조건', c.licenseUrl)], note: PHOTO_NOTE };
  else credit = { text: AI_CREDIT, links: [], note: null };
  const links = [
    ...link('좌표 확인 자료 ↗', p.locationSource),
    ...(p.storySources || []).flatMap((v) => link(`${v.label} ↗`, v.url)),
    ...link('장소 자료 원문 ↗', p.source),
  ];
  return { facts, photoNote, schoolLinks, credit, location: p.locationNote || null, links };
}

const anchor = (l) => el('a', { className: 'btn', href: l.url, target: '_blank', rel: 'noopener' }, l.label);
const row = (links) => (links.length ? el('div', { className: 'links' }, links.map(anchor)) : null);

/** Fill `body` with the sources view of `place`: a kicker and heading, then placeSources' parts in the 2D order. */
export function renderSources(body, place) {
  const s = placeSources(place);
  body.replaceChildren(el('div', { className: 'src' },
    el('span', { className: 'q-kick' }, '장소를 더 알아보기'),
    el('h3', {}, '사진과 자료'),
    s.facts.length ? el('div', { className: 'facts' }, s.facts.map((f) => el('span', {}, f))) : null,
    s.photoNote ? el('p', { className: 'sub' }, s.photoNote) : null,
    row(s.schoolLinks),
    el('div', { className: 'pic-credit' }, el('p', {}, s.credit.text), row(s.credit.links), s.credit.note ? el('p', { className: 'sub' }, s.credit.note) : null),
    s.location ? el('p', { className: 'where' }, el('strong', {}, '지도 위치 안내'), el('br'), s.location) : null,
    row(s.links)));
  body.scrollTop = 0;
}
