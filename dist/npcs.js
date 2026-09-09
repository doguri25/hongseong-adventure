import {DISTRICT_STORIES} from './district-stories.js';
import {pointInPolygon} from './core.js';
import {SpatialIndex,segmentDistance,distance} from './geography.js';
import {SPARSE_NPCS} from './sparse-npcs.js';
const ROLES={
 police:['안전 길잡이','길을 잃었을 때는 가까운 안전한 곳에서 도움을 구하렴. 지도에서는 방패 모양 경찰서 아이콘을 찾아볼 수 있어.'],
 firefighter:['소방 길잡이','소방서는 불을 끄는 일뿐 아니라 구조·구급과 예방 교육도 맡아. 경찰서와 어떤 일을 다르게 하는지 비교해 보자.'],
 storyteller:['마을 이야기 선생님','오래된 기록과 사람들에게 전해 오는 설화는 서로 다른 자료야. 이야기를 들은 뒤 어디에서 알게 되었는지도 함께 적어 보렴.'],
 forest:['숲 해설가','산과 들은 자연환경이야. 주변 마을과 길이 산의 모양에 따라 어떻게 놓였는지 지도에서 살펴볼까?'],
 birds:['자연 관찰가','물길 주변에는 여러 생물이 살아. 물가와 숲, 논을 비교하고 각각 어떤 모습인지 발견 수첩에 적어 보자.'],
 farmer:['농부 이웃','논과 밭의 위치를 찾아보렴. 물과 햇빛, 사람의 돌봄이 농사와 이어져 있어. 우리 고장의 특산물도 알아보자.'],
 vendor:['장터 이웃','시장과 마트는 생활에 필요한 물건을 구하는 곳이야. 가게마다 파는 물건과 손님이 찾아오는 까닭이 달라.'],
 station:['교통 길잡이','역과 버스정류장은 사람들의 이동을 도와. 지도에서 철길과 도로가 어떤 장소를 이어 주는지 찾아보렴.']
};
export function createNpcs(places,navigator,project){
 const anchors=places.filter(p=>p.name.includes('행정복지센터'));
 for(const id of ['library','park','namdang']){const p=places.find(p=>p.id===id);if(p)anchors.push(p);}
 const original=anchors.map((p,i)=>{const district=p.area.replace('홍성군 ',''),d=DISTRICT_STORIES[district];const sprite=p.id==='library'?'museum-guide':p.id==='namdang'||district==='서부면'?'harbor-worker':['홍동면','은하면','금마면','구항면','갈산면','장곡면'].includes(district)?'farmer':district==='홍성읍'||district==='결성면'?'museum-guide':'local-guide';
  const point=navigator.nearest([p.point[0]+95,p.point[1]+55])?.p||p.point;
  return{id:'npc-'+p.id,place:p.id,point,area:p.area,district,sprite,name:p.id==='library'?'도서관 길잡이':sprite==='farmer'?'마을 이웃':sprite==='harbor-worker'?'바다 길잡이':sprite==='museum-guide'?'역사 길잡이':'탐방 길잡이',history:d?.history||'',story:d?.feature||p.blurb,source:'https://encykorea.aks.ac.kr/Article/E0064168'};
 });
 if(!project)return original;
 return [...original,...SPARSE_NPCS.map(n=>{const d=DISTRICT_STORIES[n.district],role=ROLES[n.role];return{...n,point:project([n.lon,n.lat]),area:'홍성군 '+n.district,sprite:'resident-'+n.role,name:role[0],history:d.history,story:d.feature+' '+role[1],source:'https://encykorea.aks.ac.kr/Article/E0064168'};})];
}
export function createDecorations(features,avoid=[]){
 const blocked=new SpatialIndex(features.filter(f=>f.tags.highway||f.tags.waterway||f.tags.building||f.tags.natural==='water'));
 const occupied=new SpatialIndex(avoid.map(point=>({point,bounds:[point[0]-75,point[1]-75,point[0]+75,point[1]+75]})));
 const result=[];for(const f of features){const t=f.tags||{},park=['park','garden','playground'].includes(t.leisure)||t.landuse==='recreation_ground',forest=t.natural==='wood'||t.landuse==='forest'||t.landuse==='grass'||t.natural==='scrub';if(!park&&!forest)continue;
  const b=f.bounds,w=b[2]-b[0],h=b[3]-b[1];if(w<25||h<25)continue;const cells=Math.min(256,Math.max(1,Math.ceil(w*h/(park?7500:18000)))),cols=Math.max(1,Math.ceil(Math.sqrt(cells*w/h))),rows=Math.ceil(cells/cols);
  for(let i=0;i<cells;i++){const jx=.25+(i*.371%.5),jy=.25+(i*.263%.5),point=[b[0]+w*((i%cols+jx)/cols),b[1]+h*((Math.floor(i/cols)+jy)/rows)];
   if(!pointInPolygon(point,f.points)||(f.holes||[]).some(r=>pointInPolygon(point,r))||occupied.query([point[0],point[1],point[0],point[1]]).some(p=>distance(p.point,point)<75))continue;
   if(blocked.query([point[0]-28,point[1]-28,point[0]+28,point[1]+28]).some(q=>q.tags.highway||q.tags.waterway?q.points.some((p,j)=>j&&segmentDistance(point,q.points[j-1],p)<28):(pointInPolygon(point,q.points)||q.tags.building&&q.points.some((p,j)=>j&&segmentDistance(point,q.points[j-1],p)<24))&&!(q.holes||[]).some(r=>pointInPolygon(point,r))))continue;
   const score=Math.abs(Math.sin(point[0]*.031+point[1]*.073));result.push({point,sprite:park?['flowers','bench','tree-cluster','tree-cluster'][Math.floor(score*1000)%4]:'tree-cluster',size:park?48:62,score,bounds:[point[0]-120,point[1]-120,point[0]+120,point[1]+120]});
  }
 }return result.sort((a,b)=>a.score-b.score).slice(0,2800).sort((a,b)=>a.point[1]-b.point[1]);
}
