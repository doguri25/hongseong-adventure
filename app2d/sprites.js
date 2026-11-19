import {SPRITE_CELLS} from './sprite-cells.js';
export const isChroma=(r,g,b)=>r>160&&b>160&&g<120&&r-g>80&&b-g>80;
export class SpriteAtlas{
 constructor(onReady){this.ready=false;this.image=new Image();this.image.onload=()=>{
  // Conventional sprite color-keying at load time; the original artwork remains intact.
  const c=document.createElement('canvas');c.width=this.image.naturalWidth;c.height=this.image.naturalHeight;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(this.image,0,0);const data=g.getImageData(0,0,c.width,c.height),a=data.data;
  for(let i=0;i<a.length;i+=4)if(isChroma(a[i],a[i+1],a[i+2]))a[i+3]=0;
  g.putImageData(data,0,0);this.canvas=c;this.ready=true;onReady?.();
 };this.image.src='./assets/game-sprites-chroma-atlas.png';}
 draw(g,name,x,y,height=80,flip=1){if(!this.ready)return false;const r=SPRITE_CELLS[name];if(!r)return false;const width=height*r[2]/r[3];g.save();g.translate(x,y);g.scale(flip,1);g.drawImage(this.canvas,...r,-width/2,-height,width,height);g.restore();return true;}
}
