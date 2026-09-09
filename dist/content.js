import {HISTORY_ADDITIONS,enrichHistory} from './history-update.js';
import {WARDROBE_ITEMS} from './wardrobe.js';
import {enrichOtherInstitutions} from './institution-quizzes.js';
import {EXPANSION_PLACES} from './expansion-places.js';
import {TOURIST_MAP_PLACES} from './tourist-map-places.js';
import {enrichSchools} from './school-content.js';
import {enrichOffices} from './district-stories.js';
import {CULTURE_PLACES} from './culture.js';
import {FACILITIES} from './facilities.js';
import {SHOP_PLACES} from './shops.js';
export const PLACES = [
  {id:'library',name:'충남도서관',short:'충남도서관',area:'홍성군 홍북읍',county:'홍성군',category:'공공시설',type:'public',lon:126.6696287,lat:36.6559108,osm:890918470,coins:50,xp:80,photo:'chungnam-library',image:'assets/chungnam-library.webp',caption:'충남도서관 전경',blurb:'책과 이야기가 모이는 우리 고장의 도서관',source:'https://library.chungnam.go.kr/',pages:[
    '여기는 <strong>충남도서관</strong>이야. 책을 읽고 빌리며 새로운 이야기를 만날 수 있는 곳이지. 너는 도서관에서 어떤 책을 찾아보고 싶니?',
    '도서관은 여러 사람이 함께 이용하는 <strong>공공시설</strong>이야. 내가 알고 싶은 우리 고장 이야기를 책에서 찾아볼 수도 있어. 함께 쓰는 책은 소중히 다루자!',
    '주변을 살펴보렴. 도서관 가까이에 <strong>홍예공원</strong>이 있어. 이렇게 장소의 이름과 주변 모습을 연결하면 우리 고장을 더 잘 기억할 수 있단다.'
  ],quiz:{question:'충남도서관은 어떤 일을 하는 곳일까?',options:['책을 읽고 빌리는 곳','기차를 수리하는 곳','바다에서 물고기를 잡는 곳'],answer:0,hint:'도서관의 이름에서 ‘도서’는 책을 뜻해. 어떤 일을 할지 떠올려 보자.',explain:'맞아! 도서관은 여러 사람이 책을 읽고 빌리며 배울 수 있는 공공시설이야.'}},
  {id:'park',name:'홍예공원',short:'홍예공원',area:'홍성군 홍북읍',county:'홍성군',category:'자연·쉼터',type:'nature',lon:126.6674904,lat:36.6571418,osm:660157104,coins:40,xp:60,photo:'hongye-park',image:'assets/hongye-park.webp',caption:'홍예공원의 어린이 물놀이장 구역',blurb:'산책하고 쉬며 이웃을 만나는 초록 공간',source:'https://www.chungnam.go.kr/cnportal/media/article/view.do?articleNo=MD0003431976&menuNo=500181',pages:[
    '이곳은 <strong>홍예공원</strong>이야. 산책길과 나무, 함께 쉬는 공간이 있는 곳이지. 사진은 공원 안의 어린이 물놀이장 구역이란다.<small>물놀이장 운영 시기는 실제 안내를 확인해야 해.</small>',
    '같은 공원도 사람마다 기억이 달라. 어떤 친구는 산책한 길을, 어떤 친구는 가족과 쉬었던 자리를 떠올릴 수 있어. <strong>네가 기억하는 공원 모습</strong>은 어떠니?',
    '공원은 우리가 함께 돌보는 장소야. 꽃과 나무를 아끼고, 쓰레기는 정해진 곳에 버리자. 오늘 발견 수첩에 공원의 특징 하나를 적어 보는 건 어때?'
  ],quiz:{question:'같은 공원을 본 친구들의 이야기가 서로 달라도 괜찮을까?',options:['한 사람의 기억만 맞아','서로 다른 경험을 나누면 더 잘 알 수 있어','공원은 누구에게나 똑같이 기억돼'],answer:1,hint:'사람마다 공원에서 한 일이 다를 수 있겠지?',explain:'그렇지! 서로의 경험과 생각을 나누면 우리 고장의 여러 모습을 알 수 있어.'}},
  {id:'office',name:'충청남도청',short:'충청남도청',area:'홍성군 홍북읍',county:'홍성군',category:'공공시설',type:'public',lon:126.6735538,lat:36.6595032,osm:660149479,coins:60,xp:100,photo:'chungnam-office',image:'assets/chungnam-office.webp',caption:'충청남도청 본관과 내포신도시 전경',blurb:'충청남도 주민들의 생활을 돕는 곳',source:'https://www.chungnam.go.kr/cnportal/main/contents.do?menuNo=500700',pages:[
    '커다란 건물이 보이니? <strong>충청남도청</strong>이야. 충청남도 주민들이 더 편리하게 생활하도록 여러 일을 계획하고 돕는 곳이란다.',
    '도청 <strong>본관은 홍성군 홍북읍</strong>에 있어. 내포신도시는 홍성군과 예산군에 걸쳐 만들어졌단다. 가까이 있다고 모두 같은 군에 속하는 것은 아니야.',
    '도청과 도서관은 모습도, 하는 일도 다르지? 장소를 소개할 때는 <strong>이름·위치·하는 일</strong>을 함께 이야기하면 듣는 사람이 이해하기 쉬워.'
  ],quiz:{question:'충청남도청 본관이 있는 곳은 어디일까?',options:['홍성군 홍북읍','예산군 삽교읍','서산시'],answer:0,hint:'도청 본관과 도의회의 주소가 서로 다르다는 점을 기억해 보렴.',explain:'도청 본관은 홍성군 홍북읍에 있어. 다음에 만날 도의회는 예산군 삽교읍에 있단다.'}},
  {id:'council',name:'충청남도의회',short:'충청남도의회',area:'예산군 삽교읍',county:'예산군',category:'공공시설',type:'public',lon:126.673580,lat:36.660322,coins:60,xp:100,image:'assets/council-story.webp',caption:'주민의 일을 의논하는 모습을 표현한 삽화',blurb:'예산군에 있는, 지역의 일을 의논하는 곳',source:'https://council.chungnam.go.kr/kr/locationCnts.do',pages:[
    '여기는 <strong>충청남도의회</strong>야. 주민을 대표하는 의원들이 지역에 필요한 일을 함께 의논하는 곳이지. 삽화는 그 역할을 이해하기 위한 그림이야.',
    '주소를 꼭 살펴보자. 도의회는 <strong>예산군 삽교읍 도청대로 600</strong>에 있어. 내포신도시 안에 있지만 홍성군에 속한 건물은 아니란다.',
    '지도의 점선을 보았니? 이 지도에는 홍성군과 예산군의 경계를 표시했어. <strong>장소의 위치와 행정구역</strong>을 함께 살펴보면 우리 동네와 이웃 고장을 구별할 수 있지.'
  ],quiz:{question:'충청남도의회는 어느 군에 속할까?',options:['홍성군','예산군','홍성군과 예산군 모두'],answer:1,hint:'장소 이름 위에 있는 주황색 주소 표지를 다시 살펴보렴.',explain:'맞아! 도의회는 예산군 삽교읍에 있어. 내포신도시는 두 군에 걸쳐 있지만 장소마다 주소가 있단다.'}},
  {id:'cinema',name:'메0박스 홍성내포',short:'메0박스 · 영화관',area:'홍성군 홍북읍',county:'홍성군',category:'일상 장소',type:'daily',lon:126.6790558,lat:36.6593595,osm:890918513,coins:10,xp:20,image:'assets/cinema-story.webp',caption:'영화관의 역할을 이해하기 위한 삽화',blurb:'이웃과 함께 문화생활을 즐기는 일상 장소',source:'https://www.koreanfilm.or.kr/eng/schedule/diversityScheduleDtl.jsp?theaCd=005058',pages:[
    '이곳에는 <strong>영화관</strong>이 있어. 가족이나 친구와 영화를 보며 여가 시간을 보내는 곳이지. 사진 대신 영화관의 역할을 보여 주는 삽화를 준비했어.',
    '마트, 빵집, 영화관처럼 자주 이용하는 장소도 우리 고장의 소중한 모습이야. <strong>네가 자주 가는 장소</strong>를 하나 떠올리고, 그곳에서 무엇을 하는지 말해 볼까?<small>게임 속 브랜드 이름은 가운데 글자를 0으로 바꾸어 표시해.</small>'
  ],quiz:{question:'우리 고장을 소개할 때 일상적인 장소도 이야기할 수 있을까?',options:['유명한 유적지만 소개할 수 있어','건물 크기가 커야만 소개할 수 있어','자주 가는 가게나 영화관도 소개할 수 있어'],answer:2,hint:'우리의 생활이 이루어지는 곳도 우리 고장의 모습이야.',explain:'그렇지! 평소 이용하는 장소와 그곳에서 겪은 일도 우리 고장을 소개하는 좋은 이야기가 돼.'}},
  {id:'hongju',name:'홍주읍성 · 조양문',short:'홍주읍성',area:'홍성군 홍성읍',county:'홍성군',category:'지역 문화유산',type:'heritage',remote:true,coins:100,xp:150,photo:'hongju-joyangmun',image:'assets/hongju-joyangmun.webp',caption:'홍주읍성의 동문인 조양문 · 2014년 사진',blurb:'오늘의 거리에서 만나는 옛 고장의 흔적',source:'https://hongju.or.kr/home/content.do?menu_cd=000098',pages:[
    '홍성읍으로 이야기 여행을 왔어! 사진 속 건물은 <strong>홍주읍성의 동문, 조양문</strong>이야. 오늘날 거리에서도 옛 고장의 모습을 만날 수 있단다.',
    '성문과 성곽 같은 <strong>문화유산</strong>은 옛사람들의 생활을 알려 주는 소중한 자료야. 지금의 건물과 어떤 점이 다른지 자세히 관찰해 보렴.',
    '홍성에는 인물과 역사를 만나는 <strong>홍성역사인물축제</strong>도 있어. 건물만이 아니라 축제에서 함께 즐기는 이야기와 경험도 우리 고장의 모습이지.<small>축제의 개최 여부·날짜·장소는 해마다 공식 안내를 확인해.</small>'
  ],quiz:{question:'사진 속 조양문을 살펴보면 무엇을 알 수 있을까?',options:['우리 고장의 옛 모습','내일의 정확한 날씨','친구가 좋아하는 음식'],answer:0,hint:'오래된 성문은 옛사람들의 흔적을 간직하고 있어.',explain:'맞아! 문화유산을 살펴보면 우리 고장의 옛 모습을 알아볼 수 있어.'}},
  {id:'yongbong',name:'용봉산',short:'용봉산',area:'홍성군 홍북읍',county:'홍성군',category:'지역 자연 명소',type:'nature',remote:true,coins:80,xp:120,photo:'yongbongsan',image:'assets/yongbongsan.webp',caption:'용봉산의 바위와 숲 · 2005년 사진',blurb:'여러 모양의 바위가 들려주는 자연 이야기',source:'https://hongju.or.kr/home/content.do?menu_cd=000098',pages:[
    '홍북읍의 <strong>용봉산</strong>으로 이야기 여행을 떠나 보자. 숲 사이로 여러 모양의 바위가 보이지? 홍성을 대표하는 자연 명소 가운데 하나야.',
    '산, 바다, 들판처럼 <strong>자연의 모습</strong>도 우리 고장을 소개하는 중요한 단서란다. 도청이나 도서관처럼 사람이 지은 장소와 어떤 점이 다를까?',
    '실제로 산에 갈 때는 어른과 함께 안전한 탐방로로 다니자. 이 사진은 2005년에 찍은 모습이야. <strong>자료가 만들어진 때</strong>도 함께 살펴보면 좋겠지?'
  ],quiz:{question:'용봉산을 소개할 때 어울리는 특징은 무엇일까?',options:['책을 빌려 주는 공공시설','바위와 숲이 있는 자연 명소','영화를 상영하는 실내 공간'],answer:1,hint:'사진에서 가장 눈에 띄는 모습을 떠올려 보렴.',explain:'용봉산은 바위와 숲이 어우러진 자연 명소야. 자연환경도 우리 고장의 특징이지.'}},
  {id:'song',name:'결성농요',short:'결성농요',area:'홍성군 결성면',county:'홍성군',category:'무형문화',type:'intangible',remote:true,coins:100,xp:150,image:'assets/gyeolseong-song.webp',caption:'함께 농사짓고 노래하는 모습을 표현한 삽화',blurb:'농사를 지으며 함께 부르던 우리 고장의 노래',source:'https://tour.chungnam.go.kr/prog/trsrcn/kor/sub02_01_02/view.do?trsrcnNo=1284',pages:[
    '결성면으로 이야기 여행을 왔어. <strong>결성농요</strong>는 농사일을 하며 함께 부르던 노래야. 일하는 사람들은 노래로 호흡을 맞추고 힘을 북돋웠단다.',
    '노래는 성문처럼 만질 수 있는 건물이 아니지? 이렇게 사람에게서 사람으로 전해지는 노래와 솜씨도 <strong>무형문화</strong>라는 소중한 문화야.',
    '결성면 구성남로 91의 <strong>결성농요농사박물관</strong>에서는 농사와 농요 이야기를 만날 수 있어. 우리 고장은 눈에 보이는 장소뿐 아니라 사람들이 이어 온 생활과 문화로도 소개할 수 있단다.'
  ],quiz:{question:'결성농요는 어떤 문화일까?',options:['최근에 만든 높은 건물','기차역에 도착하는 안내 방송','농사일을 하며 함께 부르던 노래'],answer:2,hint:'‘농’은 농사, ‘요’는 노래를 뜻해. 앞에서 사람들이 무엇을 했지?',explain:'맞아! 결성농요는 농사와 함께 이어져 온 노래야. 우리 고장의 무형문화란다.'}}
];

// Regional maps share progress while retaining their actual geographic positions.
for(const p of PLACES)if(!p.remote)p.region='naepo';
Object.assign(PLACES.find(p=>p.id==='yongbong'),{remote:false,region:'yongbong',lon:126.6492774,lat:36.6437036,osm:7633973681,geoKind:'node'});
PLACES.push(
 {id:'sanga-stream',name:'상아천',short:'상아천',region:'naepo',area:'홍성군 홍북읍',county:'홍성군',category:'하천',type:'nature',lon:126.6711663,lat:36.6549747,osm:121340204,coins:40,xp:60,mediaType:'map',image:'assets/map-view-naepo.webp',caption:'실제 지도 자료로 그린 내포의 도로와 물길',blurb:'생활 공간 사이를 흐르는 우리 고장의 냇가',source:'https://www.openstreetmap.org/way/121340204',pages:['여기는 <strong>상아천</strong>이야. 내포신도시의 생활 공간 사이로 흐르는 물길이란다. 지도에서 푸른 선을 따라가 보렴.','냇가, 산, 바다처럼 자연의 모습도 우리 고장의 특징이야. 물길 옆에는 어떤 길과 건물이 있는지 <strong>주변 장소와 연결해</strong> 살펴보자.','실제 냇가에서는 어른과 함께 정해진 길로 다니고 물에 함부로 들어가지 않아요. 이 게임에서는 길과 다리를 따라 탐방해 보자.'],quiz:{question:'지도에서 상아천을 찾을 때 살펴볼 모습은?',options:['푸르게 이어진 물길','책을 빌리는 책장','영화를 보는 상영관'],answer:0,hint:'이름의 ‘천’은 하천을 뜻해.',explain:'맞아! 물길과 그 주변 모습을 살펴보면 우리 고장의 자연환경을 알 수 있어.'}},
 {id:'namdang',name:'남당항',short:'남당항',region:'namdang',area:'홍성군 서부면',county:'홍성군',category:'바다·항구',type:'nature',lon:126.469306,lat:36.5391958,osm:8119758617,geoKind:'node',coins:80,xp:120,mediaType:'map',image:'assets/map-view-namdang.webp',caption:'실제 해안선과 높낮이 자료로 그린 남당항 일대',blurb:'천수만의 바다와 만나는 홍성의 항구',source:'https://hongju.or.kr/home/content.do?menu_cd=000098',pages:['여기는 홍성군 서부면의 <strong>남당항</strong>이야. 내포신도시와는 떨어진 바닷가에 있단다. 이어진 지도를 따라 천수만의 해안을 만나 보자.','지도에서 육지와 바다가 만나는 선을 찾아보렴. 이것이 <strong>해안선</strong>이야. 항구에는 배가 드나드는 공간과 사람들이 오가는 길이 있어.','내포의 거리, 용봉산의 산길, 남당항의 바닷가는 모습이 서로 다르지? 우리 고장을 소개할 때 <strong>장소마다 다른 자연환경</strong>을 함께 이야기해 보자.'],quiz:{question:'남당항의 자연환경을 소개하는 말로 알맞은 것은?',options:['높은 산의 꼭대기에 있어요','육지와 바다가 만나는 해안에 있어요','내포신도시의 도서관 안에 있어요'],answer:1,hint:'지도의 넓은 푸른 부분은 바다야.',explain:'남당항은 천수만과 만나는 홍성의 해안에 있어. 내포에서 이어진 길을 따라 우리 고장의 다른 자연환경을 만날 수 있어.'}},
 {id:'cu-namdang',name:'C0 편의점 · 남당항',short:'C0 편의점',region:'namdang',area:'홍성군 서부면',county:'홍성군',category:'편의점',type:'daily',store:true,lon:126.4712758,lat:36.5396976,osm:8119776520,geoKind:'node',coins:10,xp:20,image:'assets/grocery-shop.webp',caption:'편의점과 생활 가게의 역할을 보여 주는 공통 삽화',blurb:'필요한 생활 물건을 가까이에서 구하는 곳',source:'https://www.openstreetmap.org/node/8119776520',pages:['바닷가 마을에도 <strong>일상적인 가게</strong>가 있어. 이곳은 지도에 등록된 편의점이야. 물이나 간단한 생활 물건을 구하는 장소이지.','유명한 항구뿐 아니라 사람들이 자주 이용하는 가게도 우리 고장의 모습이야. <strong>이 장소에서 하는 일</strong>을 떠올려 소개해 보렴.'],quiz:{question:'편의점의 역할을 소개하는 말은?',options:['산의 높이를 재는 곳','책을 빌려 주는 공공시설','생활에 필요한 물건을 살 수 있는 가게'],answer:2,hint:'편의점에서 어떤 물건을 볼 수 있는지 생각해 보렴.',explain:'우리의 생활에 필요한 물건을 가까이에서 살 수 있는 일상 장소야.'}}
);
const SHOP_ROLES={
 '생활용품점':{image:'household-shop',glyph:'가',what:'수납용품, 생활 소품과 문구',role:'일상생활에 필요한 여러 물건을 고르는 곳',question:'생활용품점의 특징으로 알맞은 것은?',correct:'생활에 필요한 여러 물건을 만날 수 있어요',wrong:['책을 빌리는 공공시설이에요','옛 성을 지키는 문이에요']},
 '햄버거':{image:'burger-shop',glyph:'햄',what:'햄버거와 여러 먹을거리',role:'음식을 준비해 손님에게 제공하는 곳',question:'햄버거 가게에서 주로 하는 일은?',correct:'음식을 준비하여 손님에게 제공해요',wrong:['마을의 공공 업무를 의논해요','책을 모아 빌려 줘요']},
 '빵집':{image:'bakery-shop',glyph:'빵',what:'빵과 케이크',role:'빵을 만들어 팔고 이웃의 일상과 기념일을 돕는 곳',question:'빵집을 소개할 때 어울리는 특징은?',correct:'빵을 만들어 손님에게 팔아요',wrong:['주민 대표가 지역의 일을 의논해요','배가 들어오고 나가는 곳이에요']},
 '슈퍼마켓':{image:'grocery-shop',glyph:'장',what:'먹을거리와 생활 물품',role:'장보기를 하며 필요한 물건을 구하는 곳',question:'슈퍼마켓을 이용하는 까닭으로 알맞은 것은?',correct:'필요한 먹을거리와 생활 물건을 구하려고요',wrong:['옛 성문의 모습을 관찰하려고요','책을 빌려 읽으려고요']},
 '문구점':{image:'household-shop',glyph:'문',what:'공책, 연필과 만들기 재료',role:'배우고 표현하는 데 필요한 준비물을 구하는 곳',question:'문구점에서 만날 수 있는 물건은?',correct:'공책과 연필, 만들기 재료',wrong:['큰 어선과 항구 시설','산속의 봉우리와 바위']},
 '편의점':{image:'grocery-shop',glyph:'편',what:'음료, 간식과 생활 물건',role:'가까운 곳에서 필요한 생활 물건을 구하는 곳',question:'편의점은 어떤 장소일까?',correct:'생활에 필요한 물건을 살 수 있는 가게',wrong:['책을 빌려 주는 도서관','지역의 옛 성문']}
};
for(const [i,s] of SHOP_PLACES.entries()){
 const r=SHOP_ROLES[s.category],options=[...r.wrong];options.splice(i%3,0,r.correct);
 PLACES.push({...s,short:s.name.split(' ')[0],area:'홍성군 홍북읍',county:'홍성군',region:'naepo',type:'daily',store:true,glyph:r.glyph,coins:10,xp:20,image:'assets/'+r.image+'.webp',caption:s.category+'의 역할을 보여 주는 공통 삽화',blurb:r.role,pages:[`이곳은 <strong>${s.name}</strong>이야. ${r.what}을 만날 수 있는 <strong>${s.category}</strong>이지.`, `주소는 <strong>${s.address.replace('충청남도 홍성군 홍북읍 ','')}</strong>야. 주변 길과 다른 장소도 함께 살펴보자. 같은 종류의 가게라도 위치가 다를 수 있단다.`, `우리 고장을 소개할 때는 가게의 <strong>이름, 위치, 하는 일</strong>을 이야기하면 좋아. 네가 이와 비슷한 장소를 이용한 경험도 떠올려 보렴.<small>이 그림은 업종을 설명하는 공통 삽화야. 실제 매장 내부 사진은 아니란다.</small>`],quiz:{question:r.question,options,answer:i%3,hint:`이곳에서 볼 수 있는 ${r.what}을 떠올려 보자.`,explain:`맞아! ${r.role}이야. 사람들이 이용하는 일상 장소도 우리 고장의 모습이지.`}});
}

const FACILITY_LESSONS={
 government:{category:'관공서',image:'community-office-illustration',coins:50,xp:80,role:'주민의 생활과 마을의 일을 돕는 곳',detail:'군청은 군 전체의 일을, 읍·면 행정복지센터는 가까운 주민의 생활을 돕는 일을 해. 공공기관이 어떤 일을 맡는지 살펴보자.',question:'관공서는 우리 생활을 어떻게 도울까?',correct:'주민에게 필요한 공공 업무를 맡아요',wrong:['주로 빵을 만들어 팔아요','주로 영화를 상영해요']},
 post:{category:'우체국',image:'post-office-illustration',coins:40,xp:60,role:'편지와 소포로 사람과 사람을 이어 주는 곳',detail:'편지와 소포가 목적지에 닿도록 돕는 곳이야. 주소를 정확히 쓰면 물건을 받는 장소를 찾기 쉽겠지? 같은 고장에도 여러 우체국이 있어.',question:'우체국에서 할 수 있는 일은?',correct:'편지와 소포를 보내요',wrong:['산의 높이를 재요','논에서 모를 심어요']},
 bank:{category:'은행',image:'bank-illustration',coins:10,xp:20,role:'돈을 보관하고 주고받는 일을 돕는 곳',detail:'은행에서는 돈을 맡기거나 찾고, 필요한 곳에 보내는 일을 도와줘. 사람들이 생활하면서 이용하는 장소 가운데 하나란다.',question:'은행의 역할로 알맞은 것은?',correct:'돈을 맡기고 주고받는 일을 도와요',wrong:['책을 빌려 주는 것이 주된 일이에요','항구에 배를 대는 곳이에요']},
 elementary:{category:'초등학교',image:'school-illustration',coins:40,xp:60,role:'친구와 함께 배우고 생활하는 초등학교',detail:'초등학교에서는 여러 교과를 배우고 친구와 어울려 생활해. 우리 학교와 이 학교의 주변에는 어떤 장소가 있는지 비교해 보렴.',question:'초등학교를 소개할 때 어울리는 말은?',correct:'친구들과 함께 배우고 생활하는 곳이에요',wrong:['생활 물건을 파는 큰 가게예요','편지와 소포만 모아 보내는 곳이에요']},
 middle:{category:'중학교',image:'school-illustration',coins:40,xp:60,role:'초등학교 다음 단계의 배움을 이어 가는 중학교',detail:'중학교는 초등학교를 마친 학생들이 배움을 이어 가는 곳이야. 같은 학교라는 이름을 쓰지만 배우는 단계와 생활 모습은 조금씩 달라.',question:'중학교는 어떤 장소일까?',correct:'초등학교 다음 단계의 배움을 이어 가는 곳',wrong:['바다에서 배가 드나드는 장소','우리 고장의 물건을 파는 마트']},
 high:{category:'고등학교',image:'school-illustration',coins:40,xp:60,role:'더 깊이 배우며 진로를 준비하는 고등학교',detail:'고등학교에서는 배움을 더 깊게 이어 가며 관심 있는 일과 진로를 생각해. 우리 고장에는 여러 분야를 배우는 학교가 있단다.',question:'고등학교를 소개하는 말로 알맞은 것은?',correct:'배움을 이어 가며 진로를 준비하는 학교',wrong:['행정 업무를 맡는 군청','농사일을 하며 부르는 노래']},
 university:{category:'대학교',image:'school-illustration',coins:50,xp:80,role:'관심 있는 분야를 전문적으로 배우고 연구하는 곳',detail:'대학교와 대학에서는 관심 있는 분야를 더 자세히 배우고 연구해. 우리 고장에는 대학도 있어서 배움을 이어 가는 사람들을 만날 수 있단다.',question:'대학교와 대학에서 주로 하는 일은?',correct:'관심 있는 분야를 전문적으로 배우고 연구해요',wrong:['편지 배달만 해요','영화만 상영해요']},
 mart:{category:'마트',image:'grocery-shop',coins:10,xp:20,role:'먹을거리와 생활 물건을 골라 장보는 곳',detail:'마트는 먹을거리와 생활에 필요한 물건을 구하는 곳이야. 같은 마트라도 크기와 파는 물건, 위치가 다를 수 있어. 가까운 시장이나 다른 가게와 비교해 보자.',question:'마트에서 주로 하는 일은?',correct:'먹을거리와 생활 물건을 골라 사요',wrong:['주민의 공공 업무를 처리해요','학생들이 수업을 받아요']}
};
for(const [i,f]of FACILITIES.entries()){
 const r=FACILITY_LESSONS[f.symbol],options=[...r.wrong];options.splice(i%3,0,r.correct);
 PLACES.push({...f,short:f.name,county:'홍성군',region:'county',type:['bank','mart'].includes(f.symbol)?'daily':'public',store:f.symbol==='mart',category:r.category,coins:r.coins,xp:r.xp,image:'assets/'+r.image+'.webp',caption:r.category+'의 역할을 표현한 공통 삽화',blurb:r.role,pages:[`여기는 <strong>${f.name}</strong>이야. <strong>${f.area}</strong>에서 만날 수 있어. 이 장소는 ${r.role}이란다.`,r.detail,`이 장소의 <strong>이름·위치·하는 일</strong>을 연결하여 소개해 보자. 지도에서 다른 종류의 아이콘도 찾아보렴.<small>이 그림은 ${r.category}를 설명하는 공통 삽화이며 실제 건물의 사진은 아니야.</small>`],quiz:{question:r.question,options,answer:i%3,hint:r.role+'이라는 것을 떠올려 보렴.',explain:r.correct+'. 장소마다 하는 일이 다르다는 것을 알 수 있지.'}});
}
for(const p of PLACES)if(!p.remote)p.region='county';
Object.assign(PLACES.find(p=>p.id==='hongju'),{remote:false,region:'county',lon:126.6636829,lat:36.602093,osm:2633808652,geoKind:'node',source:'https://www.openstreetmap.org/node/2633808652'});

PLACES.push(...CULTURE_PLACES,...TOURIST_MAP_PLACES,...EXPANSION_PLACES,...HISTORY_ADDITIONS);
enrichHistory(PLACES);
for(const p of PLACES)if(/농협|하나로마트/.test(p.originalName||'')){const old=p.name;p.name=p.name.replaceAll('농0','농협').replaceAll('하0로마트','하나로마트');p.short=p.name;p.pages=p.pages.map(t=>t.replaceAll(old,p.name));}
enrichOffices(PLACES);
enrichSchools(PLACES);
enrichOtherInstitutions(PLACES);

export const REGIONS=[{id:'county',name:'홍성군 전체',file:'map-county.json',subtitle:'내포부터 바닷가까지 하나로 이어진 지도',description:'3읍·8면을 자유롭게 오가며 우리 고장을 탐방해요.'}];

export const SHOP = [
 ...WARDROBE_ITEMS,
 {id:'gold-cape',name:'햇살 망토',desc:'따뜻한 금빛 망토로 갈아입어요.',price:120,slot:'outfit',value:'gold',color:'#d8aa49',glyph:'✦'},
 {id:'gold-journal',name:'금빛 수첩',desc:'발견 수첩에 금빛 테두리를 둘러요.',price:60,slot:'journal',value:'gold',color:'#b39652',glyph:'▤'},
 {id:'star-stamp',name:'별 도장',desc:'발견한 장소에 별 모양 도장을 찍어요.',price:40,slot:'stamp',value:'star',color:'#6d8261',glyph:'★'},
 {id:'starlight',name:'별빛 발자국',desc:'걸어온 길에 작은 별빛을 남겨요.',price:80,slot:'trail',value:'star',color:'#6e8291',glyph:'✧'}
];

export const MISSIONS = [
 {id:'first',name:'책 속으로 첫걸음',desc:'충남도서관을 발견하고 퀴즈 풀기',places:['library'],quiz:true},
 {id:'everyday',name:'우리의 하루를 잇는 장소',desc:'홍예공원·도청·영화관을 발견하기',places:['park','office','cinema']},
 {id:'neighbors',name:'가까운 이웃, 다른 주소',desc:'충청남도의회에서 예산군 소속 확인하기',places:['council'],quiz:true},
 {id:'culture',name:'눈에 보이지 않는 보물',desc:'결성농요 이야기를 만나고 퀴즈 풀기',places:['song'],quiz:true},
 {id:'master',name:'우리 고장 이야기꾼',desc:PLACES.length+'곳을 발견하고 모든 퀴즈 풀기',places:PLACES.map(p=>p.id),quiz:true}
];
