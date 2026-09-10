import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mobileLayout,mapViewportFrame,readHudPreferences,HUD_STORAGE_KEY} from '../dist/mobile-ui.js';
import {World} from '../dist/world.js';
import {STORAGE_KEY} from '../dist/core.js';

test('narrow or short screens use mobile HUD, independently of device names',()=>{
 for(const [w,h] of [[320,568],[360,640],[390,844],[844,390],[932,430],[568,320],[768,1024]])assert.equal(mobileLayout(w,h).mobile,true);
 for(const [w,h] of [[1366,768],[1440,900],[1024,768]])assert.equal(mobileLayout(w,h).mobile,false);
 assert.equal(mobileLayout(390,844).orientation,'portrait');assert.equal(mobileLayout(844,390).orientation,'landscape');
 assert.equal(mobileLayout(820,820).orientation,'portrait');
});
test('HUD state is a separate, strictly boolean, per-orientation preference',()=>{
 assert.notEqual(HUD_STORAGE_KEY,STORAGE_KEY);
 const storage={getItem:()=>JSON.stringify({portrait:false,landscape:true,desktop:true,coins:999,other:false})};
 assert.deepEqual(readHudPreferences(storage),{portrait:false,landscape:true,desktop:true});
 assert.deepEqual(readHudPreferences({getItem:()=>'{"portrait":"yes","landscape":false}'}),{landscape:false});
});
test('blocked, empty and corrupted storage never prevent menu use',()=>{
 for(const value of ['broken','null','[]','17','"text"'])assert.deepEqual(readHudPreferences({getItem:()=>value}),{});
 assert.deepEqual(readHudPreferences({getItem(){throw Error('blocked');}}),{});assert.deepEqual(readHudPreferences(undefined),{});
});
test('short mobile maps retain a grounded player and readable label inside the map',()=>{
 for(const [w,h] of [[302,127],[550,129],[826,185],[372,641]]){
  const f=mapViewportFrame(w,h,true);assert.equal(f.x,w/2);assert(f.y>=0&&f.y+36<=h);assert(f.spriteScale>=.6&&f.spriteScale<=1);
 }
});
test('desktop projection remains unchanged and mobile projection is exactly invertible',()=>{
 assert.deepEqual(mapViewportFrame(1200,800,false),{x:1200*.53,y:800*.57,spriteScale:1});
 for(const [width,height] of [[302,127],[826,185],[372,641]]){
  const world={width,height,viewportFrame:mapViewportFrame(width,height,true),camera:[570,918],zoom:1.75};
  for(const point of [[570,918],[550,1000],[718,945]]){
   const screen=World.prototype.screen.call(world,point),actual=World.prototype.fromScreen.call(world,...screen);
   assert(Math.abs(actual[0]-point[0])<1e-8&&Math.abs(actual[1]-point[1])<1e-8);
  }
 }
});
test('collapse markup keeps the original controls and adds accessible toggle semantics',()=>{
 const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
 for(const id of ['quest-toggle','quest-title','quest-content','quest-route','quests-button','mobile-hud','movement-toggle','mobile-travel-settings'])assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1);
 assert.match(html,/aria-controls="quest-content"/);assert.match(html,/aria-controls="mobile-travel-settings"/);
 const css=readFileSync(new URL('../dist/mobile-ui.css',import.meta.url),'utf8');
 assert.match(css,/grid-template-rows:auto auto minmax\(0,1fr\) auto/);assert.match(css,/safe-area-inset-bottom/);
 assert.match(css,/#quest-content\[hidden\]\{display:none!important\}/);
});
