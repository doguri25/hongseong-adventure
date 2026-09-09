import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {World} from '../dist/world.js';
import {setupPlaceSearch} from '../dist/search.js';
import {DialogPages} from '../dist/layout.js';
import {PLACES,SHOP} from '../dist/content.js';
import {SHOP_CATEGORIES} from '../dist/wardrobe.js';
import {motionMode,MotionSprites,DIRECTIONS,MOUNTED_MODES} from '../dist/motion-sprites.js';

test('airplane camera stays at the same screen anchor in eight directions and at changing frame rates',()=>{
 const w=Object.assign(Object.create(World.prototype),{position:[5000,5000],camera:[4500,4000],state:{travelSpeed:'plane'},width:800,height:1000,zoom:3.6});
 for(const [dx,dy] of [[0,1],[0,-1],[1,0],[-1,0],[1,1],[-1,1],[1,-1],[-1,-1]])for(const dt of [1/60,1/30,.06])for(let i=0;i<25;i++){w.position=[w.position[0]+dx*1248*dt,w.position[1]+dy*1248*dt];w.followCamera(dt);assert.deepEqual(w.camera,w.position);assert.deepEqual(w.screen(w.position),[424,570]);}
 w.state.travelSpeed='walk';w.position=[100,100];w.camera=[0,0];w.followCamera(1/60);assert(w.camera[0]>0&&w.camera[0]<100);assert.equal(w.camera[0],w.camera[1]);
});

// Event fakes exercise the IME sequence without browser-dependent key simulation.
class Element{
 constructor(){this.handlers={};this.children=[];this.attrs={};this.value='';this.hidden=false;}
 addEventListener(name,handler){(this.handlers[name]??=[]).push(handler);}
 emit(name,extra={}){const e={preventDefault(){},...extra};for(const h of this.handlers[name]||[])h(e);}
 setAttribute(k,v){this.attrs[k]=v;}removeAttribute(k){delete this.attrs[k];}
 append(...children){this.children.push(...children);}replaceChildren(){this.children=[];}
 focus(){}blur(){}contains(){return true;}
 querySelectorAll(){return this.children;}
}
test('Korean composition updates autocomplete on every input and composition Enter cannot select a place',()=>{
 const old=globalThis.document,root=new Element(),input=new Element(),list=new Element(),clear=new Element();root.querySelector=s=>s==='input'?input:s==='button'?clear:list;let chosen=[];
 globalThis.document={querySelector:()=>root,createElement:()=>new Element(),addEventListener(){}};
 try{setupPlaceSearch(PLACES,p=>chosen.push(p));input.emit('compositionstart');input.value='홍';input.emit('input',{isComposing:true});assert.equal(list.hidden,false);assert(list.children.some(li=>li.children[0].textContent.includes('홍')));
 input.value='홍성역';input.emit('input',{isComposing:true});assert.equal(list.children[0].children[0].textContent,'홍성역');input.emit('keydown',{key:'Enter',isComposing:true});root.emit('submit');assert.equal(chosen.length,0);
 input.emit('compositionend');input.emit('keydown',{key:'Enter'});assert.equal(chosen[0].id,'new-hongseong-station');
 input.value='ㄱㅊㅇ';input.emit('input');assert.equal(list.children[0].children[0].textContent,'광천역');input.value='없는장소987';input.emit('input');assert.equal(list.children[0].className,'search-empty');input.value='';input.emit('input');assert(list.hidden);
 }finally{globalThis.document=old;}
});

test('catalog and scrolling map disable horizontal pagination, then a journal restores it without stale sizing',()=>{
 const props={height:'500px',flex:'0 0 500px','column-width':'800px'},content={style:{removeProperty(k){delete props[k];}},scrollLeft:900,scrollTop:400,clientWidth:800,scrollWidth:1600};let scheduled=0;
 const pages=Object.assign(Object.create(DialogPages.prototype),{dialog:{open:true,dataset:{},clientHeight:700,querySelector:()=>({offsetHeight:100})},content,footer:{hidden:false,offsetHeight:60},schedule(){scheduled++;},go(page){this.page=page;}});
 for(const mode of ['catalog','scroll']){pages.setMode(mode);pages.refresh();assert.equal(pages.dialog.dataset.layout,mode);assert(pages.footer.hidden);assert.equal(content.scrollLeft,0);assert.equal(content.scrollTop,0);assert.equal(props['column-width'],undefined);assert.equal(pages.total,1);}
 pages.setMode('pages');pages.refresh();assert(!pages.footer.hidden);assert.equal(content.style.columnWidth,'800px');assert.equal(content.style.height,'540px');assert(pages.total>1);assert.equal(scheduled,3);
 assert.equal(SHOP_CATEGORIES.length,6);assert.equal(SHOP_CATEGORIES.slice(1).flatMap(([category])=>SHOP.filter(i=>i.slot===category)).length,SHOP.length);
});

test('selected boy and raccoon use their seated automobile sheets for every direction without an extra floating sprite',()=>{
 const sprites=Object.assign(Object.create(MotionSprites.prototype),{sheets:{}}),draws=[];
 for(const mode of MOUNTED_MODES){const b=readFileSync(new URL('../dist/assets/motion-'+mode+'.png',import.meta.url)),width=b.readUInt32BE(16),height=b.readUInt32BE(20);assert.equal(width,height);sprites.sheets[mode]={canvas:{mode},width:width/4,height:height/4};}
 const g={save(){},restore(){},drawImage(...args){draws.push(args);}};
 for(const speed of ['fast','faster'])for(const character of ['boy','raccoon']){const mode=motionMode(speed,character);assert.equal(mode,speed+'-'+character);for(const direction of DIRECTIONS)for(const phase of [Math.PI/2,Math.PI*1.5]){assert(sprites.draw(g,mode,direction,phase,true,200,300,110));const[canvas,x,y,w,h,dx,dy,dw,dh]=draws.at(-1);assert.equal(canvas.mode,mode);assert(x>=0&&y>=0&&x+w<=sprites.sheets[mode].width*4&&y+h<=sprites.sheets[mode].height*4);assert(Math.abs(dh-110)<1);assert.equal(dy+dh,300);}}
 assert.equal(motionMode('fast','explorer'),'fast');assert.equal(motionMode('walk','raccoon'),'raccoon');assert.equal(motionMode('fast','boy',true),'boat');
 const source=readFileSync(new URL('../dist/world.js',import.meta.url),'utf8');assert(!source.includes('x-48,y-58,42'));
});
