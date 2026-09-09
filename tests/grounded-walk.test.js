import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {measureSpriteCells,groundedRect,flightLift} from '../dist/sprite-ground.js';
import {DIRECTIONS,WALK_SHEETS,MotionSprites,walkFrameIndex,advanceWalkPhase} from '../dist/motion-sprites.js';
import {WALK_CELLS} from '../dist/walk-cells.js';
import {World} from '../dist/world.js';
import {freshState,distance} from '../dist/core.js';

test('transparent cell margins do not leave feet or wheels above the ground',()=>{
 const pixels=new Uint8ClampedArray(40*20*4);
 for(const [left,top,right,bottom] of [[7,2,14,13],[25,5,38,17]])for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)pixels[(y*40+x)*4+3]=255;
 const cells=measureSpriteCells(pixels,40,20,2,1);
 assert.deepEqual(cells.map(f=>f.rect),[[7,2,7,11],[25,5,13,12]]);
 for(const frame of cells)for(const size of [85,110,130]){const rect=groundedRect(frame,200,300,size);assert.equal(rect[1]+rect[3],300);assert.equal(rect[2]/frame.rect[2],size/20);}
 const irregular=measureSpriteCells(pixels,40,20,1,2,[[0,0,20,15],[20,0,20,20]]);
 assert.deepEqual(irregular.map(f=>f.rect),cells.map(f=>f.rect),'measured regions retain wheels or feet extending across a nominal grid line');
});

test('only aircraft have an altitude offset; ground modes and ferry never bob vertically',()=>{
 for(const time of [0,100,777,2000,50000])for(const motion of [true,false]){
  for(const mode of ['walk','bike','fast','faster','boat','boy','raccoon'])assert.equal(flightLift(mode,time,motion),0);
  assert(flightLift('plane',time,motion)>=28&&flightLift('plane',time,motion)<=32);
 }
 assert.equal(flightLift('plane',777,false),30);
});

test('all three walking sheets render four distinct source frames in every direction with a fixed foot baseline',()=>{
 const sprites=Object.assign(Object.create(MotionSprites.prototype),{sheets:{}}),draws=[];
 const g={save(){},restore(){},drawImage(...args){draws.push(args);}};
 for(const [mode,file] of Object.entries(WALK_SHEETS)){
  const png=readFileSync(new URL('../dist/assets/'+file,import.meta.url)),width=png.readUInt32BE(16),height=png.readUInt32BE(20);
  assert.equal(width,height*2);assert.equal(WALK_CELLS[mode].length,32);
  sprites.sheets[mode]={canvas:{mode},width:width/8,height:height/4,cells:WALK_CELLS[mode],walking:true};
  for(const [d,direction] of DIRECTIONS.entries()){
   const rects=new Set();
   for(let step=0;step<4;step++){
    const phase=(step+.1)*Math.PI/2;
    assert.equal(walkFrameIndex(direction,phase),d*4+step);
    sprites.draw(g,mode,direction,phase,true,200,300,110);
    const[,sx,sy,sw,sh,dx,dy,dw,dh]=draws.at(-1);
    assert(sx>=0&&sy>=0&&sx+sw<=width&&sy+sh<=height);
    assert(sh>height/4*.7&&sh<height/4*1.1,'one complete character, without a neighboring row');
    assert(Math.abs(dy+dh-300)<1e-9);assert(Number.isFinite(dx+dw));
    rects.add([sx,sy,sw,sh].join(','));
   }
   assert.equal(rects.size,4);
   assert.equal(walkFrameIndex(direction,0,false),walkFrameIndex(direction,100,false));
  }
 }
});

test('walking cycle follows distance instead of elapsed time or held keys',()=>{
 let fine=0,coarse=0;for(let i=0;i<60;i++)fine=advanceWalkPhase(fine,78/60);for(let i=0;i<30;i++)coarse=advanceWalkPhase(coarse,78/30);
 assert(Math.abs(fine-coarse)<1e-10);assert.equal(advanceWalkPhase(fine,0),fine);
 for(let step=0;step<4;step++)assert.equal(walkFrameIndex('s',advanceWalkPhase(0,(step+.1)*35/4)),8+step);
});

test('keyboard and route walking animate only actual movement, then stop at obstacles, idle or pause',()=>{
 const saved={document:globalThis.document,requestAnimationFrame:globalThis.requestAnimationFrame};
 globalThis.document={querySelector:()=>({hidden:true})};globalThis.requestAnimationFrame=()=>{};
 try{for(const manual of [true,false]){
  const w=Object.assign(Object.create(World.prototype),{state:{...freshState(),travelSpeed:'walk',movementMode:'free'},position:[100,100],camera:[100,100],max:[1000,1000],water:{clip:(from,to)=>({position:to})},route:manual?[]:[[500,100]],places:[],npcs:[],keys:new Set(manual?['d']:[]),joy:[0,0],held:new Set(),events:{paused:()=>false,near(){},save(){},toast(){}},running:true,lastTime:1000,lastDraw:1000,lastSaved:1000,zoom:1.75,walkPhase:0,trails:[],heading:'e',updateLocation(){},draw(){},waterNotice(){}});
  w.frame(1060);assert(w.moving);assert(Math.abs(w.walkPhase-advanceWalkPhase(0,distance([100,100],w.position)))<1e-10);assert(w.walkPhase>0);
  const phase=w.walkPhase,position=[...w.position];
  w.water.clip=(from,to)=>({position:from,blocked:true});w.frame(1120);assert(!w.moving);assert.equal(w.walkPhase,phase);assert.deepEqual(w.position,position);
  w.keys.clear();w.route=[];w.frame(1180);assert(!w.moving);assert.equal(w.walkPhase,phase);
  w.keys.add('d');w.events.paused=()=>true;w.frame(1240);assert(!w.moving);assert.equal(w.walkPhase,phase);
 }}finally{Object.assign(globalThis,saved);}
});
