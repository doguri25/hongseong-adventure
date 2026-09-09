import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {PLACES} from '../dist/content.js';
import {EXPANSION_PLACES} from '../dist/expansion-places.js';
import {searchPlaces} from '../dist/search.js';
import {WaterGuard} from '../dist/water.js';
import {World} from '../dist/world.js';
import {RoadNavigator,isWalkingRoad} from '../dist/navigation.js';
import {freshState,distance} from '../dist/core.js';
import {DIRECTIONS,heading,frameIndex} from '../dist/motion-sprites.js';
import {MOTION_CELLS} from '../dist/motion-cells.js';
const polygon=(points,holes=[])=>({points,holes,tags:{natural:'water',water:'reservoir'},bounds:[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))]});
const lake=polygon([[120,0],[180,0],[180,300],[120,300]]);
const road=points=>({points,tags:{highway:'residential'}});
const emptyWorld=()=>Object.assign(Object.create(World.prototype),{state:{...freshState(),movementMode:'free'},position:[100,100],camera:[100,100],max:[1000,1000],water:new WaterGuard([lake]),navigator:new RoadNavigator([]),route:[],places:[],npcs:[],keys:new Set(),joy:[0,0],held:new Set(),events:{toast(){},sound(){},save(){},near(){},paused:()=>false},updateLocation(){},draw(){}});
const data=JSON.parse(readFileSync(new URL('../dist/map-county.json',import.meta.url))),ml=111320*Math.cos(data.origin[1]*Math.PI/180),project=p=>[(p[0]-data.origin[0])*ml,(data.origin[1]-p[1])*111320];
const features=data.features.map(f=>({...f,points:f.points.map(project),holes:(f.holes||[]).map(r=>r.map(project))})).map(f=>({...f,bounds:[Math.min(...f.points.map(p=>p[0])),Math.min(...f.points.map(p=>p[1])),Math.max(...f.points.map(p=>p[0])),Math.max(...f.points.map(p=>p[1]))]}));
test('autocomplete finds partial names, Korean initials, original brands and forest aliases',()=>{
 for(const[q,id]of [['홍성역','new-hongseong-station'],['ㅎㅅㅇ','new-hongseong-station'],['ㄱㅊㅇ','new-gwangcheon-station'],['내당한우','new-naedang'],['남산 휴양림','new-namsan'],['오서산휴양림','new-oseo-forest'],['내포버스정류장','new-naepo-bus'],['내포 놀이터','new-terrain-play']])assert.equal(searchPlaces(PLACES,q)[0]?.id,id,q);
 assert.equal(searchPlaces(PLACES,'').length,0);assert.equal(searchPlaces(PLACES,'없는장소987').length,0);assert(searchPlaces(PLACES,'홍성').length<=6);
 const nh=PLACES.filter(p=>/농협|하나로마트/.test(p.originalName||''));assert(nh.length>10);for(const p of nh){assert(!p.name.includes('0'),p.name);assert(searchPlaces(PLACES,p.name,100).some(q=>q.id===p.id));}
});
test('swept water collision preserves island holes and allows real bridges, never jumping across a reservoir',()=>{
 const w=new WaterGuard([lake]);assert(w.clip([100,100],[220,100]).blocked);assert(w.clip([100,100],[220,100]).position[0]<120);assert(!w.clip([100,100],[100,290]).blocked);
 const island=new WaterGuard([polygon([[0,0],[100,0],[100,100],[0,100]],[[[30,30],[70,30],[70,70],[30,70]]])]);assert(!island.blocked([50,50]));assert(island.blocked([20,50]));
 const bridge=new WaterGuard([lake,{...road([[100,100],[200,100]]),tags:{highway:'residential',bridge:'yes'}}]);assert(bridge.clearRoute([100,100],[[220,100]]));assert(!bridge.clearRoute([100,120],[[220,120]]));
});
test('ground click paths take a dry road detour or refuse; airplane crosses with either road setting',()=>{
 const w=emptyWorld();assert.equal(w.walkTo([220,100]),false);w.navigator=new RoadNavigator([road([[100,100],[100,320],[220,320],[220,100]])]);assert(w.walkTo([220,100]));assert(w.route.length>2);assert(w.water.clearRoute(w.position,w.route));
 for(const movementMode of ['free','roads']){w.state.movementMode=movementMode;w.state.travelSpeed='plane';assert(w.walkTo([220,100]));assert.deepEqual(w.route,[[220,100]]);}
 w.position=[150,100];assert.equal(w.setTravelSpeed('walk'),false);assert.equal(w.state.travelSpeed,'plane');w.position=[100,100];assert(w.setTravelSpeed('bike'));assert.equal(w.state.travelSpeed,'bike');
});
test('manual high-speed motion stops at water while airplane ignores roads and crosses it',()=>{
 const old={document:globalThis.document,requestAnimationFrame:globalThis.requestAnimationFrame};globalThis.document={querySelector:()=>({hidden:true})};globalThis.requestAnimationFrame=()=>{};
 try{for(const speed of ['walk','bike','fast','faster','plane']){const w=emptyWorld();Object.assign(w,{running:true,lastDraw:1000,lastTime:1000,lastSaved:1000,zoom:1.75,walkPhase:0,trails:[],heading:'e'});w.keys.add('d');w.state.travelSpeed=speed;if(speed==='plane')w.state.movementMode='roads';w.frame(1060);assert(w.position[0]>100);if(speed==='plane')assert(w.position[0]>170);else assert(w.position[0]<120);}}
 finally{Object.assign(globalThis,old);}
});
test('real coast-to-island ferry reaches dry points both ways, restores zoom and opens physical arrival',()=>{
 const w=emptyWorld();w.water=new WaterGuard(features);w.navigator=new RoadNavigator(features);w.places=PLACES.filter(p=>!p.remote).map(p=>({...p,point:project([p.lon,p.lat])}));w.zoom=1.75;w.walkPhase=0;const opened=[];w.openPlace=p=>opened.push(p.id);w.position=project(data.start);w.state.movementMode='roads';w.boardFerry();assert.equal(w.ferryPending,'outbound');assert(w.route.length>100);assert(w.water.clearRoute(w.position,w.route));
 w.position=w.ferryDock(false);w.boardFerry();assert(w.voyage);assert.equal(w.setTravelSpeed('plane'),false);assert.equal(w.navigate('library'),false);w.advanceVoyage(4);assert(w.water.blocked(w.position));w.advanceVoyage(4);assert.equal(w.voyage,null);assert(!w.water.blocked(w.position));assert(w.onJukdo());assert.equal(w.zoom,1.75);assert.equal(opened.at(-1),'tourmap-jukdo');
 w.boardFerry(true);w.advanceVoyage(8);assert.equal(opened.at(-1),'namdang');assert(!w.water.blocked(w.position));assert(!w.onJukdo());assert(distance(w.position,w.ferryDock(false))<.01);
});
test('all six sprites provide two frames for each actual movement direction',()=>{
 const vectors=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];assert.deepEqual(vectors.map(v=>heading(...v)),DIRECTIONS);assert.equal(heading(0,0,'nw'),'nw');
 for(const mode of ['walk','bike','fast','faster','plane','boat']){assert(existsSync(new URL('../dist/assets/motion-'+mode+'.png',import.meta.url)));assert.equal(MOTION_CELLS[mode].length,16);for(const d of DIRECTIONS){const a=frameIndex(d,Math.PI/2,true),b=frameIndex(d,Math.PI*1.5,true);assert.notEqual(a,b);assert.equal(frameIndex(d,Math.PI*1.5,false),a);for(const i of[a,b]){const[x,y,w,h]=MOTION_CELLS[mode][i];assert(x>=0&&y>=0&&w>0&&h>0&&x+w<=1254&&y+h<=1254);}}}
});
test('expansion uses distinct activity icons and actual OSM rail ways without turning tracks into walking roads',()=>{
 assert.equal(EXPANSION_PLACES.length,18);assert.equal(EXPANSION_PLACES.filter(p=>p.symbol==='restaurant').length,6);assert.equal(EXPANSION_PLACES.find(p=>p.id==='new-oseo-forest').area,'보령시 청라면');assert.equal(EXPANSION_PLACES.find(p=>p.id==='new-naepo-bus').area,'예산군 삽교읍');
 const rails=data.features.filter(f=>f.tags.railway);assert(rails.length>=159);assert(rails.some(f=>f.tags.name==='서해선'));assert(rails.some(f=>f.tags.name==='장항선'));const raw=JSON.parse(readFileSync(new URL('../research/expansion-v11-osm.json',import.meta.url))).elements;for(const f of rails){assert(!isWalkingRoad(f));const origin=raw.find(e=>'rail-'+e.id===f.id);assert(origin);assert.deepEqual(f.points,origin.geometry.map(p=>[p.lon,p.lat]));}
});
