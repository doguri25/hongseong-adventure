// Responsive HUD layout only. Game progress stays under its existing storage key.
export const HUD_STORAGE_KEY='hongseong-hud-v1';
export function mobileLayout(width,height){
 const w=Math.max(0,Number(width)||0),h=Math.max(0,Number(height)||0);
 return {mobile:w<=820||h<=600,orientation:w>h?'landscape':'portrait'};
}
export function mapViewportFrame(width,height,mobile=false){
 if(!mobile)return {x:width*.53,y:height*.57,spriteScale:1};
 return {x:width*.5,y:Math.max(0,Math.min(height-36,Math.max(Math.min(110,height*.72),height*.55))),spriteScale:Math.min(1,Math.max(.6,height/200))};
}
export function readHudPreferences(storage){
 try{const value=JSON.parse(storage?.getItem(HUD_STORAGE_KEY)||'{}');if(!value||typeof value!=='object')return {};
  return Object.fromEntries(['portrait','landscape','desktop'].filter(k=>typeof value[k]==='boolean').map(k=>[k,value[k]]));
 }catch{return {};}
}
export function setupResponsiveHud({onLayout=()=>{},stopInput=()=>{}}={}){
 const $=s=>document.querySelector(s),hud=$('#mobile-hud'),locationBar=$('.mobile-location-bar'),card=$('.quest-card'),toggle=$('#quest-toggle'),content=$('#quest-content'),movementToggle=$('#movement-toggle'),settings=$('#mobile-travel-settings');
 let storage;try{storage=window.localStorage;}catch{/* Private/blocked storage still supports controls. */}
 const prefs=readHudPreferences(storage),elements=[card,$('.district-label'),$('.region-controls'),$('.speed-menu'),$('.movement-menu'),$('#sound-button')];
 const origins=new Map(elements.map(el=>{const mark=document.createComment('responsive-hud-origin');el.before(mark);return [el,mark];}));
 let mode=null,expanded=true,settingsOpen=false,frame;
 const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>onLayout());};
 const modeKey=()=>mode?.mobile?mode.orientation:'desktop';
 function setSettings(open){
  settingsOpen=Boolean(open&&mode?.mobile);settings.hidden=!settingsOpen;
  movementToggle.setAttribute('aria-expanded',String(settingsOpen));movementToggle.setAttribute('aria-label','이동 설정 '+(settingsOpen?'접기':'펼치기'));
  movementToggle.querySelector('span').textContent=settingsOpen?'▴':'▾';
  if(settingsOpen&&expanded)setExpanded(false,false);
  schedule();
 }
 function setExpanded(open,remember=true){
  expanded=Boolean(open);if(expanded&&settingsOpen)setSettings(false);
  // Avoid leaving keyboard focus in a newly hidden subtree.
  if(!expanded&&content.contains(document.activeElement))toggle.focus({preventScroll:true});
  content.hidden=!expanded;card.dataset.collapsed=String(!expanded);toggle.setAttribute('aria-expanded',String(expanded));
  toggle.setAttribute('aria-label','탐방 메뉴 '+(expanded?'접기':'펼치기'));$('#quest-toggle-label').textContent=expanded?'접기':'펼치기';
  toggle.querySelector('.quest-chevron').textContent=expanded?'⌃':'⌄';
  if(remember){prefs[modeKey()]=expanded;try{storage?.setItem(HUD_STORAGE_KEY,JSON.stringify(prefs));}catch{}}
  schedule();
 }
 toggle.addEventListener('click',()=>{stopInput();setExpanded(!expanded);});
 movementToggle.addEventListener('click',()=>{stopInput();setSettings(!settingsOpen);});
 // Existing route and mission handlers are left intact; this listener only folds the HUD.
 $('#quest-route').addEventListener('click',()=>{if(mode?.mobile)setExpanded(false);});
 settings.addEventListener('keydown',event=>{if(event.key==='Escape'){setSettings(false);movementToggle.focus({preventScroll:true});}});
 toggle.addEventListener('keydown',event=>{if(event.key==='Escape'&&expanded)setExpanded(false);});
 $('#region-button').setAttribute('aria-label','홍성군 전체 지도 열기');$('#nearby-button').setAttribute('aria-label','주변 장소 찾기');
 function refresh(){
  const viewport=window.visualViewport,scale=viewport?.scale||1;
  const next=mobileLayout((viewport?.width||innerWidth)*scale,(viewport?.height||innerHeight)*scale);
  const changed=!mode||next.mobile!==mode.mobile||next.orientation!==mode.orientation;
  if(!changed){schedule();return;}
  stopInput();mode=next;document.body.dataset.mobileUi=String(mode.mobile);document.body.dataset.hudOrientation=mode.orientation;
  if(mode.mobile){
   hud.hidden=false;movementToggle.hidden=false;
   locationBar.append($('.district-label'),$('.region-controls'));hud.append(card);
   settings.append($('.speed-menu'),$('.movement-menu'),$('#sound-button'));
  }else{
   for(const el of elements)origins.get(el).after(el);
   hud.hidden=true;movementToggle.hidden=true;
  }
  $('#search-button').textContent=mode.mobile?'검색':'⌕ 장소 검색';
  $('#nearby-button').textContent=mode.mobile?'주변 찾기':'주변 장소 찾기';
  setSettings(false);setExpanded(prefs[modeKey()]??!mode.mobile,false);schedule();
 }
 // Opening or closing the reserved HUD changes canvas height without a window resize.
 const observer=new ResizeObserver(schedule);observer.observe(hud);observer.observe($('.topbar'));
 refresh();
 return {refresh,collapse:()=>setExpanded(false),destroy:()=>{observer.disconnect();cancelAnimationFrame(frame);}};
}
