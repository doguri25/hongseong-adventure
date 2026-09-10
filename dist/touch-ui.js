// Prevent accidental long-press selections without interfering with game gestures.
// This is an interaction guard, not DRM. Explicit share/copy buttons still work.
export function isTextEntry(target){
 const element=target?.nodeType===3?target.parentElement:target;
 if(element?.isContentEditable)return true;
 const field=element?.closest?.('input,textarea');
 return Boolean(field&&!field.disabled&&!field.readOnly&&!['button','submit','reset','checkbox','radio','range','file','color','hidden'].includes(field.type));
}
export function setupTouchGuard(doc=document){
 const cancel=event=>{if(!isTextEntry(event.target)&&event.cancelable)event.preventDefault();};
 const copy=event=>{if(!isTextEntry(doc.activeElement))cancel(event);};
 const key=event=>{if((event.ctrlKey||event.metaKey)&&['a','c','x'].includes(String(event.key).toLowerCase()))cancel(event);};
 const clear=()=>{
  if(isTextEntry(doc.activeElement))return;
  const selection=doc.getSelection?.();
  if(selection&&!selection.isCollapsed&&!isTextEntry(selection.anchorNode)&&!isTextEntry(selection.focusNode))selection.removeAllRanges();
 };
 const listeners=[['selectstart',cancel],['contextmenu',cancel],['dragstart',cancel],['copy',copy],['cut',copy],['keydown',key],['selectionchange',clear]];
 for(const [name,listener] of listeners)doc.addEventListener(name,listener,true);
 clear();
 return ()=>{for(const [name,listener] of listeners)doc.removeEventListener(name,listener,true);};
}
