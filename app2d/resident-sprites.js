import {isChroma} from './sprites.js';
import {measureSpriteCells,groundedRect} from './sprite-ground.js';
export const RESIDENT_ROLES=['police','firefighter','storyteller','forest','birds','farmer','vendor','station'];
export class ResidentSprites{
 constructor(ready){this.image=new Image();this.image.onload=()=>{const c=document.createElement('canvas');c.width=this.image.naturalWidth;c.height=this.image.naturalHeight;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(this.image,0,0);const d=g.getImageData(0,0,c.width,c.height);for(let i=0;i<d.data.length;i+=4)if(isChroma(d.data[i],d.data[i+1],d.data[i+2]))d.data[i+3]=0;this.cells=measureSpriteCells(d.data,c.width,c.height,4,2);g.putImageData(d,0,0);this.canvas=c;ready?.();};this.image.src='./assets/npc-v12.png';}
 draw(g,name,x,y,height=85){if(!this.canvas)return false;const i=RESIDENT_ROLES.indexOf(name.replace('resident-',''));if(i<0)return false;const frame=this.cells[i];g.drawImage(this.canvas,...frame.rect,...groundedRect(frame,x,y,height,this.canvas.height/2));return true;}
}
