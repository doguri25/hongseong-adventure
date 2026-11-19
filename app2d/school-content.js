import {schoolQuiz} from './institution-quizzes.js';
import {SCHOOL_STORIES} from './school-stories.js';
export function enrichSchools(places){
 for(const p of places){const s=SCHOOL_STORIES.find(s=>s.name===p.name);if(!s)continue;
  p.schoolStory=s;p.blurb=s.history.split(/[.!]/)[0];
  p.pages=[`<strong>${p.name}의 이야기</strong><br>${s.history}<small>설립일은 학교가 세워진 날짜야. 학교에서 기념하는 개교기념일과 다를 수도 있어.</small>`,`<strong>이 학교에서 찾은 특징</strong><br>${s.distinctiveFeature}${s.featureReferenceYear?`<small>${s.featureReferenceYear}년 자료에 소개된 모습이야. 지금의 활동은 학교 누리집에서도 확인할 수 있어.</small>`:''}`,`이 학교는 <strong>${p.area}</strong>에 있어. 우리 학교와 <strong>주변 모습·역사·활동</strong>을 비교해 볼까? 어느 학교가 더 좋은지 순위를 매기기보다, 서로 다른 특징을 찾아보자.<small>${s.photo?.reuseAllowed?'사진의 촬영 시기와 지금 모습은 다를 수 있어.':'지금 그림은 학교를 나타내는 공통 삽화야. 아래 ‘학교 사진 원문’을 누르면 이 학교의 사진이 실린 자료를 볼 수 있어.'}</small>`];
  p.storySources=[...s.historySources,...s.featureSources].filter((v,i,a)=>a.findIndex(x=>x.url===v.url)===i).map(v=>({label:v.title,url:v.url}));
  if(s.currentName){p.originalName=p.name;p.name=s.currentName;p.short=s.currentName;p.pages[0]=`<strong>${s.currentName}</strong><br>${s.history}`;}
  if(s.localImage&&s.photo?.reuseAllowed){p.image=s.localImage;p.photo=s.photo.id;p.caption=s.photo.caption;}
  p.quiz=schoolQuiz(s);
 }
}
