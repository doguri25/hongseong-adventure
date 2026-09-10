import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fitPlaceDialog} from '../dist/layout.js';
import {PLACES} from '../dist/content.js';

function fixture(mobile,overflow=false){
 const values={};
 const style={fontSize:'',setProperty:(key,value)=>{values[key]=value;}};
 const speech={style,clientHeight:100,get scrollHeight(){return overflow?900:90;}};
 const quiz={style:{setProperty:(key,value)=>{values[key]=value;}}};
 const dialog={open:true,ownerDocument:{body:{dataset:{mobileUi:String(mobile)}}},querySelector:selector=>selector==='.speech'?speech:selector==='.quiz-wrap'?quiz:null};
 return {dialog,speech,values};
}

test('mobile explanations use 15px while quiz text stays at 16px',()=>{
 const f=fixture(true);fitPlaceDialog(f.dialog);
 assert.equal(f.speech.style.fontSize,'15px');assert.equal(f.values['--story-font'],'15px');assert.equal(f.values['--quiz-font'],'16px');
});
test('larger screens use at most 17px without changing the user’s saved game state',()=>{
 const f=fixture(false);fitPlaceDialog(f.dialog);
 assert.equal(f.speech.style.fontSize,'17px');assert.equal(f.values['--quiz-font'],'18px');
});
test('long explanations never shrink below 15px and remain scrollable',()=>{
 for(const mobile of [true,false]){const f=fixture(mobile,true);fitPlaceDialog(f.dialog);assert.equal(f.speech.style.fontSize,'15px');}
 const css=readFileSync(new URL('../dist/arrival-ui.css',import.meta.url),'utf8');
 assert.match(css,/body #place-dialog \.speech\{[\s\S]*?overflow-y:auto;/);
 const html=readFileSync(new URL('../dist/game.js',import.meta.url),'utf8');
 assert.match(html,/class="speech" tabindex="0" role="region" aria-label="장소 설명"/);
});
test('closing or rotating a dialogue does not leave stale text sizes',()=>{
 const f=fixture(true);fitPlaceDialog(f.dialog);f.dialog.ownerDocument.body.dataset.mobileUi='false';fitPlaceDialog(f.dialog);assert.equal(f.speech.style.fontSize,'17px');
 f.dialog.open=false;f.speech.style.fontSize='17px';fitPlaceDialog(f.dialog);assert.equal(f.speech.style.fontSize,'17px');
});
test('compact portrait no longer hides the place photograph; mobile photographs use contain',()=>{
 const css=readFileSync(new URL('../dist/release.css',import.meta.url),'utf8');
 assert.doesNotMatch(css,/\[data-compact=true\]\s+\.place-hero\{display:none\}/);
 const arrival=readFileSync(new URL('../dist/arrival-ui.css',import.meta.url),'utf8');
 assert.match(arrival,/\.place-hero>img\{[\s\S]*?object-fit:contain;/);
 assert.match(arrival,/grid-template-rows:clamp\(160px/);
 assert.match(arrival,/safe-area-inset-bottom/);
});
test('all referenced place photos, illustrations and maps still exist',()=>{
 assert(PLACES.length>200);
 for(const p of PLACES)assert(existsSync(new URL('../dist/'+p.image,import.meta.url)),`${p.id}: ${p.image}`);
});
test('the new dialog stylesheet loads last and changed entry modules have fresh cache keys',()=>{
 const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
 assert(html.indexOf('arrival-ui.css?v=1.3.6')>html.indexOf('mobile-ui.css'));
 assert.match(html,/game\.js\?v=1\.3\.6/);assert.match(html,/release\.css\?v=1\.3\.6/);
 const game=readFileSync(new URL('../dist/game.js',import.meta.url),'utf8');
 assert.match(game,/layout\.js\?v=1\.3\.6/);assert.match(game,/release\.js\?v=1\.3\.6/);
});

test('only explanatory text is reduced by one pixel; quiz, title and button sizes are preserved',()=>{
 const css=readFileSync(new URL('../dist/arrival-ui.css',import.meta.url),'utf8');
 assert.match(css,/--story-font:17px/);assert.match(css,/--story-font:15px/);
 assert.match(css,/--quiz-font:18px/);assert.match(css,/--quiz-font:16px/);
 assert.match(css,/\.dialogue-controls button\{font-size:14px;min-height:44px/);
 for(const mobile of [true,false]){const f=fixture(mobile,true);fitPlaceDialog(f.dialog);assert.equal(f.speech.style.fontSize,'15px');assert.equal(f.values['--quiz-font'],mobile?'16px':'18px');}
});
