import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {RoadNavigator,isWalkingRoad} from '../dist/navigation.js';
import {chooseKoreanVoice,Narrator,GameAudio} from '../dist/audio.js';
import {freshState,sanitizeState,distance} from '../dist/core.js';
import {WaterGuard} from '../dist/water.js';
import {World} from '../dist/world.js';
const road=points=>({points,tags:{highway:'residential',oneway:'yes'}});
test('walking route follows corners in either direction and excludes motorways',()=>{
 const n=new RoadNavigator([road([[0,0],[100,0],[100,100]]),{points:[[0,0],[100,100]],tags:{highway:'motorway'}}]);
 const r=n.route([10,0],[100,90]);assert.deepEqual(r.points,[[10,0],[100,0],[100,90]]);assert.deepEqual(n.route([100,90],[10,0]).points,[[100,90],[100,0],[10,0]]);
 for(const highway of ['motorway','motorway_link','trunk','construction'])assert(!isWalkingRoad({tags:{highway}}));assert(!isWalkingRoad({tags:{highway:'path',foot:'no'}}));
});
test('joystick remains on connected roads, turns at junctions, and can reverse mid-road',()=>{
 const n=new RoadNavigator([road([[0,0],[100,0],[100,100]])]);let r=n.move([50,0],[1,0],35);assert.deepEqual(r.position,[85,0]);r=n.move(r.position,[-1,0],15,r.cursor);assert.deepEqual(r.position,[70,0]);r=n.move([90,0],[1,1],35);assert.deepEqual(r.position,[100,25]);r=n.move([50,0],[0,1],20);assert.deepEqual(r.position,[50,0]);
});
test('unreachable islands do not generate water shortcuts, nearest reachable access is bounded',()=>{
 const n=new RoadNavigator([road([[0,0],[100,0]]),road([[1000,0],[1100,0]])]);assert.equal(n.route([20,0],[1050,0],100),null);const r=n.route([20,0],[60,30],50);assert.deepEqual(r.access,[60,0]);assert.equal(r.gap,30);
});
test('mode switching cancels navigation and preserves mode and sound preferences',()=>{
 const oldDocument=globalThis.document;globalThis.document={querySelectorAll:()=>[]};try{const w={state:freshState(),water:new WaterGuard([]),position:[30,25],navigator:new RoadNavigator([road([[0,0],[100,0]])]),route:[[50,0]],routePlace:'p',keys:new Set(['w']),joy:[1,0],places:[],events:{toast(){},save(){},sound(){}},updateLocation(){}};
 World.prototype.setMovementMode.call(w,'roads');assert.deepEqual(w.position,[30,0]);assert.deepEqual(w.route,[]);World.prototype.setMovementMode.call(w,'free');assert.equal(w.state.movementMode,'free');
 w.state.music=true;w.state.volume=.3;w.state.voiceURI='Google ko';const s=sanitizeState(w.state);assert.equal(s.movementMode,'free');assert.equal(s.volume,.3);assert.equal(s.music,true);assert.equal(s.voiceURI,'Google ko');assert.equal(sanitizeState({version:1}).movementMode,'roads');
 }finally{globalThis.document=oldDocument;}
});
test('real county paths connect Naepo to Hongseong, Gwangcheon and coast',()=>{
 const d=JSON.parse(readFileSync(new URL('../dist/map-county.json',import.meta.url))),ml=111320*Math.cos(d.origin[1]*Math.PI/180),project=p=>[(p[0]-d.origin[0])*ml,(d.origin[1]-p[1])*111320];const n=new RoadNavigator(d.features.filter(isWalkingRoad).map(f=>({...f,points:f.points.map(project)})));
 for(const end of [[126.6636829,36.602093],[126.625,36.5046],[126.47125,36.53865]]){const r=n.route(project(d.start),project(end),350);assert(r);assert(r.points.length>10);assert(r.gap<=350);for(const p of r.points)assert(n.nearest(p).d<.001);}
});
test('Google Korean precedes Windows; explicit Korean selection overrides; no English fallback',()=>{
 const win={lang:'ko-KR',name:'Microsoft Heami',voiceURI:'windows-ko',default:true},google={lang:'ko-KR',name:'Google 한국의',voiceURI:'Google 한국의'},english={lang:'en-US',name:'Google US English'};
 assert.equal(chooseKoreanVoice([win,english,google]),google);assert.equal(chooseKoreanVoice([win,google],'windows-ko'),win);assert.equal(chooseKoreanVoice([win]),win);assert.equal(chooseKoreanVoice([english]),null);assert.equal(chooseKoreanVoice([]),null);
});
test('muted sound schedules no tones; distinct effects have different sequences',()=>{const s=freshState(),a=new GameAudio(()=>s),played=[];a.tone=(...v)=>played.push(v);s.sound=false;a.play('coin');assert.equal(played.length,0);s.sound=true;a.play('discovery');assert.equal(played.length,3);assert(played[0][0]<played[2][0]);played.length=0;a.play('retry');assert.equal(played.length,2);});
test('late browser voices are selected and a closed explanation never starts later',async()=>{
 const previous={speechSynthesis:globalThis.speechSynthesis,SpeechSynthesisUtterance:globalThis.SpeechSynthesisUtterance};
 const listeners=new Set(),spoken=[];let voices=[];const google={lang:'ko-KR',name:'Google 한국어',voiceURI:'google-ko'};
 globalThis.speechSynthesis={getVoices:()=>voices,addEventListener:(name,f)=>listeners.add(f),removeEventListener:(name,f)=>listeners.delete(f),cancel(){},speak:u=>spoken.push(u)};globalThis.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
 const changed=()=>{for(const f of [...listeners])f();};
 try{const s=freshState(),n=new Narrator(()=>s);let pending=n.speak('우리 고장을 알아봐요.');voices=[google];changed();await pending;assert.equal(spoken.length,1);assert.equal(spoken[0].voice,google);assert.equal(spoken[0].lang,'ko-KR');
 n.cancel();spoken[0].onend();assert.equal(spoken.length,1);
 voices=[];n.refresh();pending=n.speak('닫은 이야기');n.cancel();voices=[google];changed();await pending;assert.equal(spoken.length,1);assert.equal(n.speaking,false);
 }finally{Object.assign(globalThis,previous);}
});
