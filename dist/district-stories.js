import {officeQuiz} from './institution-quizzes.js';
// Historical dates paraphrased from AKS's Hongseong entry; current attractions
// cross-referenced with the user's 2022 tourist map and Hongju Culture Foundation.
const historySource='https://encykorea.aks.ac.kr/Article/E0064168';
const tourismSource='https://hongju.or.kr/home/content.do?menu_cd=000098';
export const DISTRICT_STORIES={
 '홍성읍':{history:'홍주면이 1941년에 홍성읍이 되었어.',feature:'홍주읍성과 조양문, 시장을 함께 살펴볼 수 있어. 옛 관아와 오늘날 군청이 가까이 있는 모습이 특별하지.',near:['hongju','culture-hongju-museum']},
 '홍북읍':{history:'1914년 여러 지역을 합치며 홍북이라는 이름을 쓰게 되었어.',feature:'용봉산과 내포신도시를 함께 만나는 곳이야. 도청 본관과 충남도서관은 홍성군 쪽에 있고, 도의회는 이웃 예산군 쪽에 있어.',near:['office','yongbong']},
 '광천읍':{history:'옛 결성군에 속했던 광천은 1942년에 읍이 되었어.',feature:'옹암포구의 장사 이야기와 토굴새우젓, 광천김이 이어져 있어. 토굴에 저장하는 방법이 고장의 특산물과 연결되는 모습을 찾아보자.',near:['culture-shrimp','culture-seaweed']},
 '금마면':{history:'1914년 금마천의 이름을 따서 금마면이 되었어.',feature:'냇가 주변에 논이 펼쳐져 있어. 물길이 사람들의 농사와 생활에 어떤 도움을 주는지 생각해 보렴.',near:[]},
 '홍동면':{history:'1914년 여러 옛 면을 합쳐 홍동면이 되었어.',feature:'문당리의 친환경농업과 마을의 협동을 배울 수 있어. 풀무학교도 이곳에 있지. 학교와 마을이 함께 배우는 방법을 찾아보자.',near:['culture-organic']},
 '장곡면':{history:'1914년 오사면 등 여러 지역을 합쳐 장곡면이 되었어.',feature:'산과 들, 저수지와 옛집이 함께 있는 고장이야. 사운고택과 산성의 흔적을 통해 옛사람들의 생활을 생각해 볼 수 있지.',near:[]},
 '은하면':{history:'옛 결성군 지역으로, 1914년에 홍성군에 들어왔어.',feature:'학산천 주변의 들과 농촌 마을을 살펴보자. 물을 이용하는 논과 사람들이 사는 마을이 어떻게 이어져 있는지 비교해 보렴.',near:[]},
 '결성면':{history:'1914년에는 용천면이었다가 1917년 결성면으로 이름이 바뀌었어.',feature:'결성동헌과 향교에는 옛 고장의 이야기가 남아 있어. 결성농요에는 사람들이 함께 농사짓던 지혜와 협동이 담겼지.',near:['culture-gyeolseong-office','song']},
 '서부면':{history:'1914년 상서면과 하서면을 합쳐 서부면이 되었어.',feature:'천수만과 남당항, 죽도를 만나는 바닷가 고장이야. 항구의 일과 갯벌 생물, 바다로 지는 해를 함께 살펴볼 수 있어.',near:['namdang','culture-sokdong']},
 '갈산면':{history:'고도면이라는 이름을 쓰다가 1942년 갈산면이 되었어.',feature:'김좌진장군 생가지와 전통 옹기 이야기를 만날 수 있어. 옹기는 흙으로 빚어 생활에 쓰던 그릇이야. 주변 농촌 마을도 살펴보자.',near:['culture-kim']},
 '구항면':{history:'1914년 여러 지역을 합쳐 구항면이 되었어.',feature:'백월산과 보개산 주변에 마을이 자리해. 거북이마을의 오래된 나무와 구산사처럼 마을 사람들이 아껴 온 장소를 찾아보렴.',near:[]}
};
export function enrichOffices(places){
 for(const p of places){if(p.symbol!=='government')continue;
  const countyOffice=p.name==='홍성군청',localOffice=/행정복지센터|읍사무소|면사무소/.test(p.name);if(!countyOffice&&!localOffice)continue;
  const district=p.area.replace('홍성군 ',''),d=DISTRICT_STORIES[district];if(!d)continue;
  p.pages=[`여기는 <strong>${p.name}</strong>이야. 주민에게 필요한 서류와 생활 도움을 안내하는 공공시설이지. <strong>${p.area}</strong>에 있어.`,countyOffice?'지금의 <strong>홍성군</strong>은 1914년 홍주군과 결성군을 합치며 만들어졌어. 이름에는 두 고장의 이야기가 함께 담겨 있단다.':`<strong>${district}의 옛이야기</strong><br>${d.history}`,`<strong>${district}의 특징</strong><br>${d.feature}`,'옛날에는 동헌 같은 관아에서 고장의 일을 맡았어. 오늘날 관공서와 하는 일이나 모습이 어떻게 달라졌을까? <strong>이름·위치·고장의 특징</strong>을 함께 소개해 보자.'];
  p.blurb=(countyOffice?'홍성군의 탄생과':district+'의 옛이야기와')+' 오늘날의 생활을 만나는 곳';p.storySources=[{label:'지역 역사 · 한국민족문화대백과사전',url:historySource},{label:'지역 명소 · 홍주문화관광재단',url:tourismSource}];p.nearStories=d.near;p.quiz=officeQuiz(p,d);
 }
}
