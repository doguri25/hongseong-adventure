import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {PLACES,SHOP} from '../dist/content.js';
import {freshState,sanitizeState,discover,purchase} from '../dist/core.js';
import {CHARACTERS,OUTFIT_FILTERS,STAMPS,TRAILS,RINGS,JOURNALS} from '../dist/wardrobe.js';
import {SPARSE_NPCS} from '../dist/sparse-npcs.js';
import {createNpcs} from '../dist/npcs.js';
import {RoadNavigator} from '../dist/navigation.js';
import {WaterGuard} from '../dist/water.js';
import {districtAt,distance,SpatialIndex} from '../dist/geography.js';
import {OverviewMap} from '../dist/overview-map.js';
import {Cartography,tileLayout} from '../dist/cartography.js';
import {World} from '../dist/world.js';
import {symbolFor} from '../dist/place-icons.js';
import {fitPlaceDialog} from '../dist/layout.js';
import {RELEASE} from '../dist/release.js';
const data=JSON.parse(readFileSync(new URL('../dist/map-county.json',import.meta.url))),ml=111320*Math.cos(data.origin[1]*Math.PI/180),project=p=>[(p[0]-data.origin[0])*ml,(data.origin[1]-p[1])*111320];
const features=data.features.map(f=>{const points=f.points.map(project);return{...f,points,holes:(f.holes||[]).map(r=>r.map(project)),bounds:[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))]};});
test('new residents occupy 44 separate, dry, reachable low-density road sites across all eleven townships',()=>{
 const nav=new RoadNavigator(features),water=new WaterGuard(features),mapped=PLACES.filter(p=>!p.remote).map(p=>({...p,point:project([p.lon,p.lat])})),start=nav.nearest(project(data.start)),npcs=createNpcs(mapped,nav,project);
 assert.equal(npcs.length,58);assert.equal(new Set(SPARSE_NPCS.map(n=>n.role)).size,8);
 for(const district of data.districts.filter(d=>d.county==='홍성군'))assert.equal(SPARSE_NPCS.filter(n=>n.district===district.name).length,4);
 for(const n of SPARSE_NPCS){const p=project([n.lon,n.lat]),road=nav.nearest(p);assert(road.d<.05);assert.equal(nav.component[road.a],nav.component[start.a]);assert(!water.blocked(p));assert.equal(districtAt([n.lon,n.lat],data.districts).name,n.district);assert(mapped.every(q=>distance(p,q.point)>450));assert(npcs.find(x=>x.id===n.id).story.length>50);}
});
test('three character choices and all 22 cosmetic items remain functional after save and reload',()=>{
 assert.equal(SHOP.length,22);assert.equal(new Set(SHOP.map(i=>i.id)).size,22);const values={outfit:OUTFIT_FILTERS,journal:JOURNALS,stamp:STAMPS,trail:TRAILS,ring:RINGS};
 const state=freshState();for(const p of PLACES)discover(state,p.id);
 for(const item of SHOP){assert(values[item.slot][item.value]);const before=state.coins;assert(purchase(state,item.id).bought);assert.equal(state.coins,before-item.price);assert.equal(sanitizeState(state).equipped[item.slot],item.value);assert.equal(sanitizeState(state).coins,state.coins);}
 for(const id of Object.keys(CHARACTERS)){state.character=id;assert.equal(sanitizeState(state).character,id);}state.character='invalid';assert.equal(sanitizeState(state).character,'explorer');
 for(const mode of ['boy','raccoon']){const b=readFileSync(new URL('../dist/assets/motion-'+mode+'.png',import.meta.url));assert.equal(b.readUInt32BE(16),1254);assert.equal(b.readUInt32BE(20),1254);}
});
test('every school and government office has its own evidence-linked question',()=>{
 for(const list of [PLACES.filter(p=>p.schoolStory),PLACES.filter(p=>p.symbol==='government')]){assert.equal(new Set(list.map(p=>p.quiz.question)).size,list.length);for(const p of list){assert(p.quiz.hint.length>15);assert(p.quiz.options[p.quiz.answer]);assert(p.pages.length>=2);}}
 assert.equal(PLACES.filter(p=>p.schoolStory).length,41);
});
test('new public facilities and channel destinations have real district placement, distinct icons and accessible assets',()=>{
 const ids=['public-police','public-fire','history-tower','history-seokdang','history-yongbongcheon'];
 for(const id of ids){const p=PLACES.find(p=>p.id===id),d=districtAt([p.lon,p.lat],data.districts);assert.equal(d.county+' '+d.name,p.area);assert(existsSync(new URL('../dist/'+p.image,import.meta.url)));}
 assert.notEqual(symbolFor(PLACES.find(p=>p.id==='public-police')).path,symbolFor(PLACES.find(p=>p.id==='public-fire')).path);
 const videos=new Set(JSON.parse(readFileSync(new URL('../research/history-channel-v12.json',import.meta.url))).videos.map(v=>v.id));let linked=0;for(const p of PLACES)for(const s of p.storySources||[])if(s.label.startsWith('홍성역사 채널')){assert(videos.has(new URL(s.url).searchParams.get('v')));linked++;}assert(linked>=14);
 const sunset=PLACES.find(p=>p.id==='tourmap-sunset');assert(sunset.pages.join('').includes('더 긴 공기층'));assert(sunset.storySources.some(s=>s.url.includes('nasa.gov')));assert.equal(sunset.mediaType,'map');
});
test('overview zoom is anchored and bounded; dragging and pinching never select a place',()=>{
 const old={ResizeObserver:globalThis.ResizeObserver,document:globalThis.document};globalThis.ResizeObserver=class{observe(){}disconnect(){}};globalThis.document={querySelector:()=>null};
 const handlers={},context=new Proxy({},{get:()=>()=>{}}),canvas={width:800,height:500,getBoundingClientRect:()=>({left:0,top:0,width:800,height:500}),getContext:()=>context,addEventListener:(k,f)=>handlers[k]=f,setPointerCapture(){}},world={max:[10000,10000],position:[5000,5000],places:[{...PLACES[0],point:[5000,5000]}],data:{districts:[]},cartography:{image:{naturalWidth:0},index:new SpatialIndex([])}};let selections=0;
 try{const m=new OverviewMap(canvas,world,()=>selections++),anchor=[470,270],before=m.inverse(anchor);m.zoomBy(2,anchor);assert(distance(m.inverse(anchor),before)<.001);m.zoomBy(100);assert.equal(m.zoom,10);m.zoomBy(.0001);assert.equal(m.zoom,1);m.reset();
 const event=(id,x,y)=>({pointerId:id,clientX:x,clientY:y});handlers.pointerdown(event(1,400,250));handlers.pointermove(event(1,480,250));handlers.pointerup(event(1,480,250));assert.equal(selections,0);m.reset();handlers.pointerdown(event(1,400,250));handlers.pointerup(event(1,400,250));assert.equal(selections,1);
 handlers.pointerdown(event(1,300,250));handlers.pointerdown(event(2,500,250));handlers.pointermove(event(2,600,250));handlers.pointerup(event(2,600,250));handlers.pointerup(event(1,300,250));assert(m.zoom>1);assert.equal(selections,1);m.destroy();
 }finally{Object.assign(globalThis,old);}
});
test('worker rendering covers the viewport immediately and asks for sharp tiles without painting them on the input thread',()=>{
 const w={max:[40000,30000],width:1200,height:800,dpr:2,zoom:1.75,camera:[16000,15000],screen:World.prototype.screen,fromScreen:World.prototype.fromScreen},messages=[],c=Object.assign(Object.create(Cartography.prototype),{w,tiles:new Map(),image:{naturalWidth:2400,naturalHeight:1800},worker:{postMessage:m=>messages.push(m)},workerReady:true,viewKey:'',tile(){throw Error('Must not paint on input thread');}});
 for(const zoom of [1.75,.1,3.6]){w.zoom=zoom;const boxes=[];c.draw({save(){},restore(){},drawImage(...args){boxes.push(args.slice(-4));}});for(let x=0;x<=w.width;x+=100)for(let y=0;y<=w.height;y+=100)assert(boxes.some(([a,b,ww,h])=>x>=a&&x<=a+ww&&y>=b&&y<=b+h));const m=messages.at(-1);assert(m.tiles.length);assert(m.tiles.every(t=>t.layout.resolution===tileLayout(zoom,2).resolution));const count=messages.length;c.draw({save(){},restore(){},drawImage(){}});assert.equal(messages.length,count);}
});
test('font fitting reduces only until text fits; viewport declarations and release references stay aligned',()=>{
 const style={fontSize:'',setProperty(){}},speech={style,get scrollHeight(){return Number.parseFloat(style.fontSize)>18?230:190;},clientHeight:200},dialog={open:true,querySelector:s=>s==='.speech'?speech:null};fitPlaceDialog(dialog);assert.equal(style.fontSize,'18px');
 const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'),version=JSON.parse(readFileSync(new URL('../package.json',import.meta.url))).version;assert.equal(version,RELEASE.version);assert(html.includes('v'+version));assert(html.indexOf('id="search-button"')<html.indexOf('<section id="world"'));assert(html.indexOf('id="search-dialog"')>html.indexOf('</main>'));assert(!html.includes('걸음마다, 우리 고장'));
});
