import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeSources } from '../src/ui/sources.js';
import { PLACES } from '#game/content.js';
import credits from '#game/assets/photo-credits.json' with { type: 'json' };

const byId = (id) => PLACES.find((p) => p.id === id);
const labels = (links) => links.map((l) => l.label);

test('placeSources: a real photo credits its source and licence (2D creditHtml), then the 2D source links', () => {
  const p = byId('library'), c = credits.assets.find((a) => a.id === p.photo), s = placeSources(p);
  assert.equal(s.credit.text, c.attribution);
  assert.deepEqual(s.credit.links, [{ label: '사진 원문', url: c.sourcePage }, { label: '이용 조건', url: c.licenseUrl }]);
  assert.equal(s.credit.note, '웹용 크기 축소·WebP 변환, 원본 워터마크 유지.');
  assert.deepEqual(s.links.at(-1), { label: '장소 자료 원문 ↗', url: p.source });
  assert.equal(s.facts.length, 0);
  assert.equal(s.schoolLinks.length, 0);
});

test('placeSources: terrain pictures and illustrations get the 2D credit lines', () => {
  assert.equal(placeSources(byId('sanga-stream')).credit.text, '실제 지형 자료를 색과 명암으로 표현한 지도 · OpenStreetMap 기여자 (ODbL) · Terrain Tiles / Mapzen · USGS / NOAA');
  const song = placeSources(byId('song'));
  assert.equal(song.credit.text, '이해를 돕는 AI 삽화 · 실제 건물이나 행사 현장 사진이 아닙니다.');
  assert.deepEqual(song.credit.links, []);
  assert.equal(song.credit.note, null);
});

test('placeSources: a school gets its facts, photo note and links (2D schoolDetails / schoolLinks)', () => {
  const p = PLACES.find((q) => q.schoolStory?.foundedDate && q.schoolStory?.anniversaryDate && q.schoolStory?.photo?.caption && q.schoolStory?.video?.url && q.schoolStory?.officialWebsite);
  const st = p.schoolStory, s = placeSources(p);
  assert.deepEqual(s.facts, [`${st.foundedLabel || '설립일'} ${st.foundedDate}`, `개교기념일 ${st.anniversaryDate.slice(5).replace('-', '월 ')}일`]);
  assert.equal(s.photoNote, `사진 원문 안내: ${st.photo.caption}${st.photo.sourceDate ? ` · ${st.photo.sourceDate} 자료` : ''}`);
  assert.deepEqual(labels(s.schoolLinks), [...(st.photo.sourcePageUrl ? ['학교 사진 원문 ↗'] : []), `${st.video.canUseAsCurrentCampus === false ? '옛 교정 영상' : '학교 모습 영상'} · ${st.video.year} ↗`, '학교 누리집 ↗']);
  assert.equal(s.schoolLinks.at(-1).url, st.officialWebsite);
});

test('placeSources: location note, 좌표 확인 자료, the story sources in order, then 장소 자료 원문; only web links', () => {
  const p = PLACES.find((q) => q.locationNote && q.locationSource && q.storySources?.length), s = placeSources(p);
  assert.equal(s.location, p.locationNote);
  assert.deepEqual(s.links, [
    { label: '좌표 확인 자료 ↗', url: p.locationSource },
    ...p.storySources.map((v) => ({ label: `${v.label} ↗`, url: v.url })),
    { label: '장소 자료 원문 ↗', url: p.source },
  ]);
  const odd = placeSources({ id: 'x', name: 'x', source: 'javascript:alert(1)', storySources: [{ label: 'a', url: 'https://example.org/a' }, { label: 'b', url: 'data:text/html,b' }] });
  assert.deepEqual(odd.links, [{ label: 'a ↗', url: 'https://example.org/a' }]);
  assert.equal(odd.location, null);
  // every place: labels and URLs are strings, every URL a web address
  for (const q of PLACES) {
    const r = placeSources(q);
    for (const l of [...r.links, ...r.schoolLinks, ...r.credit.links]) assert.ok(typeof l.label === 'string' && /^https?:\/\//.test(l.url), `${q.id} ${l.label}`);
    assert.ok(r.credit.text.length > 0, q.id);
  }
});
