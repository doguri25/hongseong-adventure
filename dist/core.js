import {PLACES,SHOP,REGIONS} from './content.js';
import {sanitizeQuests} from './quests.js';
export const STORAGE_KEY='hongseong-adventure-v1';
export const freshState=()=>({version:1,coins:0,xp:0,discovered:[],solved:[],owned:[],equipped:{outfit:'default',journal:'default',stamp:'default',trail:'default',ring:'default'},character:'explorer',note:'',position:null,region:'county',locations:{},startedAt:Date.now(),sound:true,music:false,volume:.6,voiceURI:'auto',motion:true,speed:1,travelSpeed:'walk',movementMode:'roads',questLedger:[],dailyQuests:null});
export function sanitizeState(raw){
 const s=freshState(); if(!raw||raw.version!==1)return s;
 const validIds=new Set(PLACES.map(p=>p.id));
 for(const k of ['discovered','solved'])s[k]=[...new Set(Array.isArray(raw[k])?raw[k]:[])].filter(id=>validIds.has(id));
 s.solved=s.solved.filter(id=>s.discovered.includes(id));
 s.owned=[...new Set(Array.isArray(raw.owned)?raw.owned:[])].filter(id=>SHOP.some(i=>i.id===id));
 for(const k of Object.keys(s.equipped)){const v=raw.equipped?.[k];if(v==='default'||SHOP.some(i=>i.slot===k&&i.value===v&&s.owned.includes(i.id)))s.equipped[k]=v;}
 // Rebuild rewards from completed actions: invalid saves cannot introduce negative/NaN balances.
 let earned=0,xp=0;for(const p of PLACES){if(s.discovered.includes(p.id)){earned+=p.coins;xp+=p.xp;}if(s.solved.includes(p.id)){earned+=quizCoins(p);xp+=30;}}
 Object.assign(s,sanitizeQuests(raw,PLACES));earned+=s.questLedger.reduce((n,r)=>n+r.bonus,0);
 s.coins=Math.max(0,earned-s.owned.reduce((n,id)=>n+SHOP.find(i=>i.id===id).price,0));s.xp=xp;
 s.character=['explorer','boy','raccoon'].includes(raw.character)?raw.character:'explorer';
 s.note=typeof raw.note==='string'?raw.note.slice(0,1000):'';
 s.position=Array.isArray(raw.position)&&raw.position.length===2&&raw.position.every(Number.isFinite)?raw.position:null;
 s.region=REGIONS.some(r=>r.id===raw.region)?raw.region:'county';
 for(const id of ['county','naepo','yongbong','namdang']){const p=raw.locations?.[id];if(Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90)s.locations[id]=p;}
 if(!s.locations.county){
  const old=s.locations[raw.region];if(old)s.locations.county=[...old];
  else if(!raw.region&&s.position)s.locations.county=[126.663+s.position[0]/(111320*Math.cos(36.665*Math.PI/180)),36.665-s.position[1]/111320];
  else if(s.position&&['naepo','yongbong','namdang'].includes(raw.region)){const origins={naepo:[126.659,36.669],yongbong:[126.635,36.664],namdang:[126.450,36.547]},o=origins[raw.region];s.locations.county=[o[0]+s.position[0]/(111320*Math.cos(o[1]*Math.PI/180)),o[1]-s.position[1]/111320];}
 }
 s.startedAt=Number.isFinite(raw.startedAt)?raw.startedAt:Date.now();s.sound=typeof raw.sound==='boolean'?raw.sound:true;s.music=raw.music===true;s.volume=Number.isFinite(raw.volume)?Math.max(0,Math.min(1,raw.volume)):.6;s.voiceURI=typeof raw.voiceURI==='string'?raw.voiceURI.slice(0,300):'auto';s.movementMode=raw.movementMode==='free'?'free':'roads';s.motion=raw.motion!==false;s.speed=[.75,1,1.4].includes(raw.speed)?raw.speed:1;
 s.travelSpeed=['walk','bike','fast','faster','plane'].includes(raw.travelSpeed)?raw.travelSpeed:'walk';
 return s;
}
export const quizCoins=p=>p.type==='daily'?10:20;
export function discover(state,id){const p=PLACES.find(p=>p.id===id);if(!p||state.discovered.includes(id))return null;state.discovered.push(id);state.coins+=p.coins;state.xp+=p.xp;return{coins:p.coins,xp:p.xp};}
export function answer(state,id,index){const p=PLACES.find(p=>p.id===id);if(!p||!state.discovered.includes(id))return{correct:false,invalid:true};if(index!==p.quiz.answer)return{correct:false};if(state.solved.includes(id))return{correct:true,coins:0,xp:0};state.solved.push(id);const coins=quizCoins(p);state.coins+=coins;state.xp+=30;return{correct:true,coins,xp:30};}
export function purchase(state,id){const item=SHOP.find(i=>i.id===id);if(!item)return{ok:false,reason:'unknown'};if(state.owned.includes(id)){state.equipped[item.slot]=state.equipped[item.slot]===item.value?'default':item.value;return{ok:true,bought:false};}if(state.coins<item.price)return{ok:false,reason:'balance'};state.coins-=item.price;state.owned.push(id);state.equipped[item.slot]=item.value;return{ok:true,bought:true};}
export const rankFor=xp=>xp>=1000?'탐방 달인':xp>=500?'고장 탐험가':xp>=200?'길 위의 발견가':'새싹 탐험가';
export const missionDone=(s,m)=>m.places.every(id=>s.discovered.includes(id)&&(!m.quiz||s.solved.includes(id)));
export function pointInPolygon(p,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if(((a[1]>p[1])!==(b[1]>p[1]))&&(p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]))inside=!inside;}return inside;}
export function distance(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1]);}
export function closestOnSegment(p,a,b){const vx=b[0]-a[0],vy=b[1]-a[1],l=vx*vx+vy*vy;const t=l?Math.max(0,Math.min(1,((p[0]-a[0])*vx+(p[1]-a[1])*vy)/l)):0;return[a[0]+t*vx,a[1]+t*vy];}
export function clipPolyline(points,max){
 const parts=[];let current=[];
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b[0]-a[0],dy=b[1]-a[1],ps=[-dx,dx,-dy,dy],qs=[a[0],max[0]-a[0],a[1],max[1]-a[1]];let lo=0,hi=1,ok=true;
  for(let j=0;j<4;j++){if(ps[j]===0){if(qs[j]<0)ok=false;continue;}const t=qs[j]/ps[j];if(ps[j]<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)ok=false;}
  if(!ok){if(current.length>1)parts.push(current);current=[];continue;}const c=[a[0]+lo*dx,a[1]+lo*dy],d=[a[0]+hi*dx,a[1]+hi*dy];if(current.length&&distance(current.at(-1),c)>.02){parts.push(current);current=[];}if(!current.length)current.push(c);current.push(d);
 }if(current.length>1)parts.push(current);return parts;
}
export function buildGraph(roads){const nodes=[],lookup=new Map();const index=p=>{const key=p.map(v=>v.toFixed(2)).join(',');if(lookup.has(key))return lookup.get(key);const i=nodes.length;nodes.push({p,edges:new Map()});lookup.set(key,i);return i;};const edges=[];for(const road of roads){for(let i=1;i<road.points.length;i++){const a=index(road.points[i-1]),b=index(road.points[i]);if(a===b)continue;const w=distance(nodes[a].p,nodes[b].p);nodes[a].edges.set(b,w);nodes[b].edges.set(a,w);edges.push([a,b]);}}return{nodes,edges};}
export function largestConnectedGraph(graph){
 const visited=new Set();let largest=[];
 for(let i=0;i<graph.nodes.length;i++){if(visited.has(i))continue;const ids=[i];visited.add(i);for(let j=0;j<ids.length;j++)for(const [v]of graph.nodes[ids[j]].edges)if(!visited.has(v)){visited.add(v);ids.push(v);}if(ids.length>largest.length)largest=ids;}
 const mapping=new Map(largest.map((old,i)=>[old,i]));const nodes=largest.map(old=>({p:graph.nodes[old].p,edges:new Map([...graph.nodes[old].edges].filter(([v])=>mapping.has(v)).map(([v,w])=>[mapping.get(v),w]))}));return{nodes,edges:graph.edges.filter(([a,b])=>mapping.has(a)&&mapping.has(b)).map(([a,b])=>[mapping.get(a),mapping.get(b)])};
}
export function nearestGraphPoint(graph,p){let best=null,dist=Infinity;for(const [a,b] of graph.edges){const q=closestOnSegment(p,graph.nodes[a].p,graph.nodes[b].p),d=distance(p,q);if(d<dist){dist=d;best={p:q,a,b,d};}}return best;}
// A* with a binary heap scales to the connected county road graph.
export function findRoute(graph,start,end,sa=nearestGraphPoint(graph,start),sb=nearestGraphPoint(graph,end)){
 if(!sa||!sb)return null;
 if((sa.a===sb.a&&sa.b===sb.b)||(sa.a===sb.b&&sa.b===sb.a))return[start,sa.p,sb.p];
 const n=graph.nodes.length,ds=new Float64Array(n).fill(Infinity),prev=new Int32Array(n).fill(-1),heap=[];
 const push=(u,f)=>{let i=heap.length;heap.push([u,f]);while(i){const j=(i-1)>>1;if(heap[j][1]<=f)break;heap[i]=heap[j];i=j;}heap[i]=[u,f];};
 const pop=()=>{const head=heap[0],tail=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let j=i*2+1;if(j+1<heap.length&&heap[j+1][1]<heap[j][1])j++;if(heap[j][1]>=tail[1])break;heap[i]=heap[j];i=j;}heap[i]=tail;}return head;};
 for(const i of [sa.a,sa.b]){ds[i]=distance(sa.p,graph.nodes[i].p);push(i,ds[i]+distance(graph.nodes[i].p,sb.p));}
 let dest=-1,best=Infinity;const seen=new Uint8Array(n);
 while(heap.length){const [u,score]=pop();if(score>=best)break;if(seen[u])continue;seen[u]=1;
  if(u===sb.a||u===sb.b){const cost=ds[u]+distance(graph.nodes[u].p,sb.p);if(cost<best){best=cost;dest=u;}}
  for(const[v,w]of graph.nodes[u].edges){const nd=ds[u]+w;if(nd<ds[v]){ds[v]=nd;prev[v]=u;push(v,nd+distance(graph.nodes[v].p,sb.p));}}
 }
 if(dest<0)return null;const path=[];for(let u=dest;u!==-1;u=prev[u])path.push(graph.nodes[u].p);return[start,sa.p,...path.reverse(),sb.p];
}
