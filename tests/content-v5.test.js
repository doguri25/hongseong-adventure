import test from 'node:test';
import assert from 'node:assert/strict';
import {PLACES} from '../dist/content.js';
import {SCHOOL_STORIES} from '../dist/school-stories.js';
import {TOURIST_MAP_PLACES} from '../dist/tourist-map-places.js';
import {DISTRICT_STORIES} from '../dist/district-stories.js';
import {SYMBOLS} from '../dist/place-icons.js';

test('all 41 schools have individual history, features and dated photo-source links',()=>{
 const schools=PLACES.filter(p=>['elementary','middle','high','university'].includes(p.symbol));assert.equal(schools.length,41);assert.equal(SCHOOL_STORIES.length,41);
 for(const p of schools){const s=p.schoolStory;assert(s,p.name);assert(s.history.length>20,p.name);assert(s.distinctiveFeature.length>20,p.name);assert(s.historySources.length);assert(s.featureSources.length);assert.match(s.photo.sourcePageUrl,/^https?:\/\//);assert.equal(s.photo.reuseAllowed,false);assert(!s.photo.imageUrl);assert(p.pages.some(v=>v.includes('공통 삽화')));assert(!p.photo);assert.match(s.officialWebsite,/^https?:\/\//);}
 const hongju=schools.find(p=>p.name==='홍주초등학교');assert(hongju.pages[0].includes('2026년 3월'));assert.equal(hongju.area,'홍성군 홍북읍');assert(hongju.schoolStory.video.canUseAsCurrentCampus===false);
 assert(schools.some(p=>p.name==='한국폴리텍대학 충남캠퍼스'));assert(!schools.some(p=>p.name==='한국폴리텍대학 홍성캠퍼스'));
});
test('county hall and all eleven township offices teach local history and features',()=>{
 assert.equal(Object.keys(DISTRICT_STORIES).length,11);
 const offices=PLACES.filter(p=>p.symbol==='government'&&(p.name==='홍성군청'||p.name.includes('행정복지센터')));assert.equal(offices.length,12);
 for(const p of offices){assert.equal(p.pages.length,4,p.name);assert(p.pages[1].includes('19'),p.name);assert(p.pages[2].includes('특징'),p.name);assert(p.storySources.length>=2);}
});
test('tourist map adds distinct destination types without inventing missing coordinates',()=>{
 assert.equal(TOURIST_MAP_PLACES.length,40);assert.equal(TOURIST_MAP_PLACES.filter(p=>!p.remote).length,23);
 for(const p of TOURIST_MAP_PLACES){assert(p.fromTouristMap);assert(SYMBOLS[p.symbol]);if(p.remote){assert(p.lon==null&&p.lat==null,p.name);assert(p.pages.some(v=>v.includes('정확한 위치')));}else{assert(Number.isFinite(p.lon)&&Number.isFinite(p.lat));assert.match(p.locationSource,/^https:\/\//);assert(!p.pages.some(v=>v.includes('정확한 위치를 확인하기 전')));}}
 for(const name of ['죽도','홍성 장곡산성','한국식기박물관','갈산토기'])assert(TOURIST_MAP_PLACES.some(p=>p.name.includes(name)),name);
 assert.equal(new Set(['island','village','trail','craft','oldhouse'].map(k=>SYMBOLS[k].path)).size,5);
});
