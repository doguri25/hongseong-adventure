import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isTextEntry,setupTouchGuard} from '../dist/touch-ui.js';

function fixture(){
 const listeners=new Map();
 const doc={activeElement:null,selection:{isCollapsed:true,anchorNode:null,focusNode:null,removeAllRanges(){this.isCollapsed=true;}},getSelection(){return this.selection;},addEventListener(type,fn,capture){assert.equal(capture,true);listeners.set(type,fn);},removeEventListener(type,fn,capture){assert.equal(capture,true);assert.equal(listeners.get(type),fn);listeners.delete(type);}};
 const fire=(type,target,extra={})=>{const event={target,cancelable:true,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...extra};listeners.get(type)?.(event);return event;};
 return {doc,listeners,fire};
}
const label={closest:()=>null};
const input=type=>{const field={type,disabled:false,readOnly:false};return {...field,closest:()=>field};};

test('selection guard recognises native text editing but not game controls',()=>{
 assert(isTextEntry(input('search')));assert(isTextEntry(input('text')));assert(isTextEntry({isContentEditable:true}));
 for(const type of ['range','button','file','checkbox'])assert.equal(isTextEntry(input(type)),false);
 assert.equal(isTextEntry(label),false);assert.equal(isTextEntry(null),false);
 assert(isTextEntry({nodeType:3,parentElement:input('text')}));
});
test('delegated guard blocks long-press selection, callouts, dragging and copying of dynamic game text',()=>{
 const {doc,fire}=fixture();const destroy=setupTouchGuard(doc);
 for(const type of ['selectstart','contextmenu','dragstart','copy','cut'])assert.equal(fire(type,label).defaultPrevented,true);
 assert.equal(fire('keydown',label,{ctrlKey:true,key:'a'}).defaultPrevented,true);
 assert.equal(fire('keydown',label,{metaKey:true,key:'c'}).defaultPrevented,true);
 destroy();
});
test('native search editing, normal keys and noncancelable events remain untouched',()=>{
 const {doc,fire}=fixture();setupTouchGuard(doc);const field=input('search');doc.activeElement=field;
 for(const type of ['selectstart','contextmenu','copy','cut'])assert.equal(fire(type,field).defaultPrevented,false);
 assert.equal(fire('keydown',field,{ctrlKey:true,key:'a'}).defaultPrevented,false);
 assert.equal(fire('keydown',label,{key:'ArrowUp'}).defaultPrevented,false);
 assert.equal(fire('selectstart',label,{cancelable:false}).defaultPrevented,false);
});
test('stray selections clear without clearing native input selections',()=>{
 const {doc,fire}=fixture();setupTouchGuard(doc);
 doc.selection.isCollapsed=false;doc.selection.anchorNode=label;doc.selection.focusNode=label;fire('selectionchange',doc);
 assert.equal(doc.selection.isCollapsed,true);
 doc.activeElement=input('search');doc.selection.isCollapsed=false;fire('selectionchange',doc);assert.equal(doc.selection.isCollapsed,false);
});
test('guard does not register gesture listeners and cleanly removes its listeners',()=>{
 const {doc,listeners}=fixture();const destroy=setupTouchGuard(doc);
 for(const event of ['pointerdown','pointermove','pointerup','touchstart','touchmove','touchend','wheel','click'])assert.equal(listeners.has(event),false,event);
 destroy();assert.equal(listeners.size,0);
});
test('landscape HUD uses original nodes inside a single header; portrait keeps its reserved HUD',()=>{
 const css=readFileSync(new URL('../dist/phone-controls.css',import.meta.url),'utf8');
 const js=readFileSync(new URL('../dist/mobile-ui.js',import.meta.url),'utf8');
 assert.match(css,/-webkit-user-select:none;user-select:none;-webkit-touch-callout:none/);
 assert.match(css,/grid-template-rows:auto minmax\(0,1fr\) auto/);
 assert.match(css,/min-height:50px/);assert.match(css,/safe-area/); // safe areas are inherited from mobile-ui.css
 assert.match(js,/if\(landscape\)topbar\.insertBefore\(hud,settings\);else hudOrigin\.after\(hud\)/);
 assert.match(js,/\(landscape\?settings:locationBar\)\.append\(/);
 assert.doesNotMatch(js,/cloneNode/);
 const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
 assert(html.indexOf('phone-controls.css')>html.indexOf('mobile-ui.css'));
 assert(html.indexOf('arrival-ui.css')>html.indexOf('phone-controls.css'));
});
