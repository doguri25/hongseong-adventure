import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {PLACES} from '../dist/content.js';
import {freshState,sanitizeState,discover,purchase} from '../dist/core.js';
import {dayKey,ensureQuests,activeQuest,selectQuest,recordQuestVisit,questCompleted,DIRECT_BONUS} from '../dist/quests.js';
import {RELEASE,VEHICLES,movementKey,isTypingTarget} from '../dist/release.js';
import {layoutMode,pageCount} from '../dist/layout.js';
import {WaterGuard} from '../dist/water.js';
import {World} from '../dist/world.js';
import {createNpcs,createDecorations} from '../dist/npcs.js';
import {SPRITE_CELLS} from '../dist/sprite-cells.js';
import {isChroma} from '../dist/sprites.js';
const now=Date.UTC(2026,8,9,3),position=[126.671,36.656];
test('daily missions vary, persist on refresh, stay mapped, and renew on the Korean calendar day',()=>{
 const a=freshState(),b=freshState();assert(ensureQuests(a,PLACES,position,now,()=>.1));ensureQuests(b,PLACES,position,now,()=>.8);assert.equal(a.dailyQuests.targets.length,3);assert.notDeepEqual(a.dailyQuests.targets,b.dailyQuests.targets);const saved=[...a.dailyQuests.targets];assert.equal(ensureQuests(a,PLACES,position,now,()=>.7),false);assert.deepEqual(a.dailyQuests.targets,saved);for(const id of saved)assert(!PLACES.find(p=>p.id===id).remote);assert.equal(dayKey(Date.UTC(2026,8,9,16)),'2026-09-10');assert(ensureQuests(a,PLACES,position,now+86400000,()=>.4));
});
test('only physical mission arrivals earn a once-only direct bonus, retained after reload and purchase',()=>{
 const s=freshState();ensureQuests(s,PLACES,position,now,()=>.2);const id=activeQuest(s);assert.equal(recordQuestVisit(s,id,false),null);assert.equal(s.coins,0);const result=recordQuestVisit(s,id,true);discover(s,id);assert.equal(result.bonus,DIRECT_BONUS);const before=s.coins;assert(questCompleted(s,id));recordQuestVisit(s,id,true);assert.equal(s.coins,before);const r=sanitizeState(JSON.parse(JSON.stringify(s)));assert.equal(r.coins,before);assert.deepEqual(r.dailyQuests,s.dailyQuests);assert.deepEqual(r.questLedger,s.questLedger);r.coins+=0;const bought=purchase(r,'gold-cape');if(bought.ok)assert.equal(sanitizeState(r).coins,r.coins);
});
test('opening another place ends the direct condition and journal replays cannot complete a mission',()=>{
 const s=freshState();ensureQuests(s,PLACES,position,now,()=>.3);const id=activeQuest(s),other=PLACES.find(p=>p.id!==id).id;recordQuestVisit(s,other,false);assert.equal(s.dailyQuests.direct,false);assert.equal(recordQuestVisit(s,id,false),null);assert.equal(recordQuestVisit(s,id,true).bonus,0);assert(questCompleted(s,id));assert.notEqual(activeQuest(s),id);
});
test('duplicate ledger entries cannot duplicate coins and a mission selected at arrival has no direct bonus',()=>{
 const s=freshState();ensureQuests(s,PLACES,position,now,()=>.4);const id=s.dailyQuests.targets[1];selectQuest(s,id,true);assert.equal(recordQuestVisit(s,id,true).bonus,0);discover(s,id);s.questLedger.push(s.questLedger[0]);assert.equal(sanitizeState(s).questLedger.length,1);
});
test('vehicle menus keep keyboard movement immediately available, including Korean input and uppercase keys',()=>{
 const old={document:globalThis.document,window:globalThis.window},handlers={},buttons=Object.keys(VEHICLES).map(v=>({dataset:{travelSpeed:v},setAttribute(){}})),noop=()=>{},el=()=>({addEventListener:noop,style:{}}),elements=new Map();let focused=0;
 const doc={querySelector:s=>{if(!elements.has(s))elements.set(s,el());return elements.get(s);},querySelectorAll:s=>s==='[data-travel-speed]'?buttons:[],addEventListener:noop};globalThis.document=doc;globalThis.window={addEventListener:(k,f)=>handlers[k]=f};
 try{const w={canvas:{addEventListener:noop,focus:()=>focused++},state:{...freshState(),movementMode:'free'},water:new WaterGuard([]),position:[0,0],setTravelSpeed:World.prototype.setTravelSpeed,keys:new Set(),joy:[0,0],events:{paused:()=>false,save:noop,sound:noop},draw:noop};World.prototype.bind.call(w);buttons[1].onclick();assert.equal(w.state.travelSpeed,'bike');assert.equal(focused,1);handlers.keydown({target:{tagName:'BUTTON'},code:'KeyW',key:'ㅈ',preventDefault:noop});assert(w.keys.has('w'));handlers.keyup({code:'KeyW',key:'W'});assert(!w.keys.has('w'));handlers.keydown({target:{tagName:'INPUT'},code:'KeyA',key:'a',preventDefault:noop});assert(!w.keys.has('a'));assert.deepEqual(Object.values(VEHICLES).map(v=>v.factor),[1,2,4,8,16]);for(const travelSpeed of Object.keys(VEHICLES))assert.equal(sanitizeState({...freshState(),travelSpeed}).travelSpeed,travelSpeed);
 }finally{Object.assign(globalThis,old);}
});
test('orientation and pagination account for portrait, landscape and width changes',()=>{
 assert.equal(layoutMode(800,1280),'portrait');assert.equal(layoutMode(1280,800),'landscape');assert.equal(pageCount(800,800),1);assert.equal(pageCount(1628,800),2);assert.equal(pageCount(3284,800),4);assert.equal(pageCount(0,0),1);
});
test('NPCs cover all eleven townships and decorations remain inside mapped greenery',()=>{
 const places=PLACES.filter(p=>!p.remote).map(p=>({...p,point:[p.lon*1000,p.lat*1000]})),npcs=createNpcs(places,{nearest:p=>({p})});assert.equal(npcs.length,14);assert.equal(new Set(npcs.map(p=>p.district)).size,11);for(const npc of npcs){assert(npc.story.length>20);assert(npc.history.length>10);assert(SPRITE_CELLS[npc.sprite]);}
 const f={tags:{leisure:'park'},bounds:[0,0,1000,1000],points:[[0,0],[1000,0],[1000,1000],[0,1000]],holes:[]};const d=createDecorations([f]);assert(d.length>0);for(const p of d)assert(p.point.every(v=>v>0&&v<1000));assert.deepEqual(createDecorations([{...f,tags:{natural:'water'}}]),[]);
});
test('all six mounted views and four NPC figures reference intact atlas rectangles with a removable background',()=>{
 for(const n of ['bicycle-front','bicycle-back','compact-car-front','compact-car-back','supercar-front','supercar-back','local-guide','museum-guide','farmer','harbor-worker']){const[x,y,w,h]=SPRITE_CELLS[n];assert(x>=0&&y>=0&&w>0&&h>0&&x+w<=1254&&y+h<=1254);}
 assert(isChroma(251,3,251));assert(!isChroma(255,255,255));assert(!isChroma(230,185,35));assert(existsSync(new URL('../dist/assets/game-sprites-chroma-atlas.png',import.meta.url)));assert.equal(RELEASE.version,JSON.parse(readFileSync(new URL('../package.json',import.meta.url))).version);
});
