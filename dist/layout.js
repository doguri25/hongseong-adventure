export function layoutMode(width,height){return width>height?'landscape':'portrait';}
export function pageCount(scrollWidth,width,gap=28){return width>0?Math.max(1,Math.ceil((scrollWidth+gap-1)/(width+gap))):1;}
// Fixed-height CSS columns fragment long content into horizontal pages. All nodes
// stay mounted so the forms, links and already-bound controls keep working.
export class DialogPages{
 constructor(dialog,content,onPage){this.dialog=dialog;this.content=content;this.page=0;this.total=1;this.onPage=onPage;
  this.footer=document.createElement('nav');this.footer.className='modal-pagination';this.footer.setAttribute('aria-label','팝업 쪽 넘기기');
  this.footer.innerHTML='<button type="button" aria-label="이전 쪽">← 이전 쪽</button><span role="status"></span><button type="button" aria-label="다음 쪽">다음 쪽 →</button>';dialog.append(this.footer);
  const buttons=this.footer.querySelectorAll('button');this.previous=buttons[0];this.next=buttons[1];this.previous.onclick=()=>this.go(this.page-1);this.next.onclick=()=>this.go(this.page+1);
  this.observer=new MutationObserver(()=>this.schedule());this.observer.observe(content,{childList:true,subtree:true,characterData:true});
  this.resize=new ResizeObserver(()=>this.schedule());this.resize.observe(content);
  dialog.addEventListener('close',()=>{this.page=0;});content.addEventListener('load',()=>this.schedule(),true);
  content.addEventListener('focusin',e=>{if(!dialog.open||this.mode!=='pages')return;const box=e.target.getBoundingClientRect(),view=content.getBoundingClientRect();if(box.left<view.left-2||box.right>view.right+2){const left=box.left-view.left+content.scrollLeft;this.go(Math.floor(left/(content.clientWidth+28)),false);}});
  this.setMode('pages');
 }
 setMode(mode='pages'){this.mode=mode;this.dialog.dataset.layout=mode;this.footer.hidden=mode!=='pages';this.page=0;this.total=1;this.content.scrollLeft=0;this.content.scrollTop=0;for(const property of ['height','flex','column-width'])this.content.style.removeProperty(property);this.schedule();}
 schedule(){cancelAnimationFrame(this.frame);this.frame=requestAnimationFrame(()=>this.refresh());}
 reset(){this.page=0;this.content.scrollLeft=0;this.schedule();}
 refresh(){if(!this.dialog.open||this.mode!=='pages')return;const width=this.content.clientWidth;if(!width)return;const header=this.dialog.querySelector('.panel-header');const height=Math.max(1,this.dialog.clientHeight-(header?.offsetHeight||0)-this.footer.offsetHeight);this.content.style.height=height+'px';this.content.style.flex='0 0 '+height+'px';this.content.style.columnWidth=width+'px';this.total=pageCount(this.content.scrollWidth,width);this.go(this.page,false);}
 go(page,announce=true){this.page=Math.max(0,Math.min(this.total-1,page));this.content.scrollLeft=this.page*(this.content.clientWidth+28);this.previous.disabled=this.page===0;this.next.disabled=this.page===this.total-1;this.footer.querySelector('span').textContent=`${this.page+1} / ${this.total} 쪽`;if(announce)this.onPage?.();}
}
export function setupViewport(onResize){
 const sync=()=>{const h=window.visualViewport?.height||innerHeight;document.documentElement.style.setProperty('--screen-height',h+'px');document.body.dataset.orientation=layoutMode(innerWidth,innerHeight);document.body.dataset.compact=String(h<620);onResize?.();};
 window.addEventListener('resize',sync);window.visualViewport?.addEventListener('resize',sync);screen.orientation?.addEventListener('change',sync);sync();return sync;
}

// Keep the teacher prominent while reducing story type only as much as needed.
export function fitPlaceDialog(dialog){if(!dialog.open)return;const speech=dialog.querySelector('.speech');if(speech){speech.style.fontSize='21px';speech.style.lineHeight='1.65';for(let size=21;size>=16;size-=.5){speech.style.fontSize=size+'px';speech.style.setProperty('--story-font',size+'px');if(speech.scrollHeight<=speech.clientHeight+1)break;}}const quiz=dialog.querySelector('.quiz-wrap');if(quiz){for(let size=19;size>=16;size-=.5){quiz.style.setProperty('--quiz-font',size+'px');if(quiz.scrollHeight<=quiz.clientHeight+1)break;}}}
