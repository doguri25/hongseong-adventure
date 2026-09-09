import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {World} from '../dist/world.js';
import {Cartography} from '../dist/cartography.js';
import {OverviewMap} from '../dist/overview-map.js';
import {surfaceKind,buildingStyle} from '../dist/map-style.js';
import {PLACES} from '../dist/content.js';
import {freshState} from '../dist/core.js';
import {createNpcs,createDecorations} from '../dist/npcs.js';
import {WaterGuard} from '../dist/water.js';
import {RoadNavigator} from '../dist/navigation.js';

test('water remains water inside a park; material styles do not change geographic polygons',()=>{
 assert.equal(surfaceKind({natural:'water',leisure:'park',water:'sea'}),'ocean');
 assert.equal(surfaceKind({natural:'water',water:'reservoir'}),'lake');
 assert.equal(surfaceKind({leisure:'park'}),'grass');assert.equal(surfaceKind({landuse:'forest'}),'forest');
 assert.equal(surfaceKind({landuse:'farmland'}),'field');assert.equal(surfaceKind({landuse:'residential'}),'town');
 assert.notEqual(buildingStyle({amenity:'school'}).roof,buildingStyle({office:'government'}).roof);
 assert.equal(buildingStyle({'building:levels':'999'}).height,12);
});

test('late zoom tiles are discarded and visible tiles survive cache pressure from old views',()=>{
 const c=Object.assign(Object.create(Cartography.prototype),{tiles:new Map(),generation:3,visibleKeys:new Set(['2:1,1']),cacheLimit:2});let closed=0;
 assert(!c.receiveTile({key:'2:1,1',generation:2,bitmap:{close(){closed++;}}}));
 assert(!c.receiveTile({key:'2:9,9',generation:3,bitmap:{close(){closed++;}}}));assert.equal(closed,2);
 const visible={close(){closed++;}};assert(c.receiveTile({key:'2:1,1',generation:3,bitmap:visible}));
 c.tiles.set('old:1',{close(){closed++;}});c.tiles.set('old:2',{close(){closed++;}});c.trimTiles();assert(c.tiles.has('2:1,1'));assert.equal(c.tiles.size,2);
 c.clearTiles();assert.equal(c.generation,4);assert.equal(c.tiles.size,0);
});

const data=JSON.parse(readFileSync(new URL('../dist/map-county.json',import.meta.url)));
const map=Object.assign(Object.create(World.prototype),{origin:data.origin,mLon:111320*Math.cos(data.origin[1]*Math.PI/180),mLat:111320});
const features=data.features.map(f=>{const points=f.points.map(p=>map.project(p));return{...f,points,holes:(f.holes||[]).map(r=>r.map(p=>map.project(p))),bounds:[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))]};});
test('all 58 NPCs have finite dry coordinates and a nearby walkable road',()=>{
 const water=new WaterGuard(features),nav=new RoadNavigator(features),places=PLACES.filter(p=>!p.remote).map(p=>({...p,point:map.project([p.lon,p.lat])})),npcs=createNpcs(places,nav,p=>map.project(p));assert.equal(npcs.length,58);
 for(const npc of npcs){assert(npc.point.every(Number.isFinite),npc.id);assert(!water.blocked(npc.point),npc.id+' in water');assert(nav.nearest(npc.point)?.d<=55,npc.id+' away from roads');}
 for(const place of places){assert(place.point.every(Number.isFinite),place.id);const walker=Object.assign(Object.create(World.prototype),{water,state:{travelSpeed:'walk'}}),approach=walker.placeApproach(place);assert(!water.blocked(approach),place.id+' has no dry approach');assert(Math.hypot(approach[0]-place.point[0],approach[1]-place.point[1])<=60,place.id+' outside visit range');}
});

test('arriving at an NPC cannot open a nearby place over the conversation in the same frame',()=>{
 const saved={document:globalThis.document,requestAnimationFrame:globalThis.requestAnimationFrame};globalThis.document={querySelector:()=>({hidden:true})};globalThis.requestAnimationFrame=()=>{};
 try{const calls=[],npc={id:'neighbor',name:'이웃',point:[104,100]},place={...PLACES[0],point:[104,100]};
  const w=Object.assign(Object.create(World.prototype),{state:{...freshState(),movementMode:'free'},position:[100,100],camera:[100,100],max:[1000,1000],water:new WaterGuard([]),route:[[104,100]],routeNpc:npc.id,places:[place],npcs:[npc],keys:new Set(),joy:[0,0],held:new Set(),events:{paused:()=>false,near(){},npc:n=>calls.push('npc:'+n.id),arrive:p=>calls.push('place:'+p.id),save(){}},running:true,lastTime:1000,lastDraw:1000,lastSaved:1000,walkPhase:0,trails:[],heading:'e',updateLocation(){},draw(){}});
  w.frame(1060);assert.deepEqual(calls,['npc:neighbor']);assert.equal(w.routeNpc,null);assert.equal(w.route.length,0);assert.equal(w.held.size,0);
 }finally{Object.assign(globalThis,saved);}
});

class Element{constructor(){this.handlers={};this.style={};}addEventListener(k,f){this.handlers[k]=f;}emit(k,e){this.handlers[k]?.(e);}getBoundingClientRect(){return{left:0,top:0,width:800,height:600};}focus(){}setPointerCapture(){}setAttribute(){}}
test('map clicks choose pins or NPCs; drags, second touches and paused input never start a route',()=>{
 const saved={document:globalThis.document,window:globalThis.window},elements=new Map(),calls=[],canvas=new Element();let paused=false;
 globalThis.document={addEventListener(){},querySelectorAll:()=>[],querySelector:s=>{if(!elements.has(s))elements.set(s,new Element());return elements.get(s);}};globalThis.window=new Element();
 try{const p={...PLACES[0],point:[200,200]},npc={id:'npc',point:[400,400]};const w=Object.assign(Object.create(World.prototype),{canvas,state:freshState(),events:{paused:()=>paused},position:[0,0],drawnPins:[{x:200,y:200,places:[p]}],drawnNpcs:[{x:400,y:400,npc}],places:[p],keys:new Set(),joy:[0,0],navigate:id=>calls.push('place:'+id),interactNpc:n=>calls.push('npc:'+n.id),fromScreen:(x,y)=>[x,y],walkTo:()=>calls.push('walk')});w.bind();
  const down=(x,y,id=1,isPrimary=true)=>canvas.emit('pointerdown',{clientX:x,clientY:y,pointerId:id,isPrimary}),up=(x,y,id=1)=>canvas.emit('pointerup',{clientX:x,clientY:y,pointerId:id});
  down(200,188);up(200,188);down(400,350);up(400,350);assert.deepEqual(calls,['place:'+p.id,'npc:npc']);
  down(20,20);up(70,80);down(200,188);down(200,188,2,false);up(200,188,2);up(200,188);paused=true;down(200,188);up(200,188);assert.equal(calls.length,2);
  paused=false;down(20,20);up(20,20);assert.equal(calls.at(-1),'walk');
 }finally{Object.assign(globalThis,saved);}
});

test('two stationary fingers on the full map cannot accidentally select a destination',()=>{
 const c=new Element();c.width=800;c.height=600;const selected=[];
 const m=Object.assign(Object.create(OverviewMap.prototype),{canvas:c,pointers:new Map(),pins:[{p:{id:'place'},x:100,y:100}],pan:[0,0],onSelect:p=>selected.push(p)});m.bind();
 c.emit('pointerdown',{pointerId:1,clientX:100,clientY:100});c.emit('pointerdown',{pointerId:2,clientX:100,clientY:100});c.emit('pointerup',{pointerId:2,clientX:100,clientY:100});c.emit('pointerup',{pointerId:1,clientX:100,clientY:100});assert.equal(selected.length,0);
 c.emit('pointerdown',{pointerId:3,clientX:100,clientY:100});c.emit('pointerup',{pointerId:3,clientX:100,clientY:100});assert.equal(selected.length,1);
});

test('decorations avoid rivers, buildings, visit circles and NPC conversation space',()=>{
 const park={tags:{leisure:'park'},points:[[0,0],[1000,0],[1000,1000],[0,1000]],holes:[],bounds:[0,0,1000,1000]},river={tags:{waterway:'stream'},points:[[500,0],[500,1000]],holes:[],bounds:[500,0,500,1000]},building={tags:{building:'yes'},points:[[0,0],[250,0],[250,250],[0,250]],holes:[],bounds:[0,0,250,250]};
 const avoid=[[750,750]],d=createDecorations([park,river,building],avoid);assert(d.length>0);assert.deepEqual(d,createDecorations([park,river,building],avoid));
 for(const v of d){assert(Math.abs(v.point[0]-500)>=28);assert(!(v.point[0]<250&&v.point[1]<250));assert(Math.hypot(v.point[0]-750,v.point[1]-750)>=75);}
});

test('ground navigation to a shore marker ends on nearby land while aircraft retain the real coordinate',()=>{
 const water=new WaterGuard(features),p={...PLACES.find(p=>p.id==='tourmap-gungri')};p.point=map.project([p.lon,p.lat]);const w=Object.assign(Object.create(World.prototype),{water,state:{travelSpeed:'walk'}});assert(water.blocked(p.point));assert(!water.blocked(w.placeApproach(p)));w.state.travelSpeed='plane';assert.deepEqual(w.placeApproach(p),p.point);
});
