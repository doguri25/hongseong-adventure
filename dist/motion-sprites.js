import {OUTFIT_FILTERS} from './wardrobe.js';
import {MOTION_CELLS} from './motion-cells.js';
import {WALK_CELLS} from './walk-cells.js';
import {isChroma} from './sprites.js';
import {measureSpriteCells,groundedRect} from './sprite-ground.js';
export const DIRECTIONS=['e','se','s','sw','w','nw','n','ne'];
export const MOUNTED_MODES=['fast-boy','fast-raccoon','faster-boy','faster-raccoon'];
export const WALK_SHEETS={walk:'walk-cycle-explorer.png',boy:'walk-cycle-boy.png',raccoon:'walk-cycle-raccoon.png'};
export function motionMode(speed,character='explorer',voyage=false){if(voyage)return'boat';if(speed==='walk')return character==='explorer'?'walk':character;if(['fast','faster'].includes(speed)&&['boy','raccoon'].includes(character))return speed+'-'+character;return speed;}
export function heading(dx,dy,previous='s'){if(Math.hypot(dx,dy)<.001)return previous;return DIRECTIONS[(Math.round(Math.atan2(dy,dx)/(Math.PI/4))+8)%8];}
export const frameIndex=(direction,phase,moving=true)=>Math.max(0,DIRECTIONS.indexOf(direction))*2+(moving&&Math.sin(phase)<0?1:0);
export const walkFrameIndex=(direction,phase,moving=true)=>Math.max(0,DIRECTIONS.indexOf(direction))*4+(moving?Math.floor((((phase%(2*Math.PI))+2*Math.PI)%(2*Math.PI))/(Math.PI/2)):1);
export const advanceWalkPhase=(phase,meters)=>meters>0?(phase+meters/35*Math.PI*2)%(Math.PI*2):phase;
export class MotionSprites{
 constructor(onReady){this.sheets={};for(const mode of ['walk','bike','fast','faster','plane','boat','boy','raccoon',...MOUNTED_MODES]){
  const image=new Image(),walking=!!WALK_SHEETS[mode];
  image.onload=()=>{const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const g=canvas.getContext('2d',{willReadFrequently:true});g.drawImage(image,0,0);const pixels=g.getImageData(0,0,canvas.width,canvas.height);for(let i=0;i<pixels.data.length;i+=4)if(isChroma(pixels.data[i],pixels.data[i+1],pixels.data[i+2]))pixels.data[i+3]=0;
   const cells=walking?WALK_CELLS[mode]:measureSpriteCells(pixels.data,canvas.width,canvas.height,4,4,MOTION_CELLS[mode]);g.putImageData(pixels,0,0);this.sheets[mode]={canvas,width:canvas.width/(walking?8:4),height:canvas.height/4,cells,walking};onReady?.();};
  image.src='./assets/'+(WALK_SHEETS[mode]||'motion-'+mode+'.png');
 }}
 draw(g,mode,direction,phase,moving,x,y,size=105,outfit=false){const s=this.sheets[mode];if(!s)return false;const index=s.walking?walkFrameIndex(direction,phase,moving):frameIndex(direction,phase,moving),columns=s.walking?8:4,fallback=MOTION_CELLS[mode]?.[index]||[Math.round(index%columns*s.width),Math.round(Math.floor(index/columns)*s.height),Math.floor(s.width),Math.floor(s.height)],f=s.cells?.[index]||{rect:fallback,pivot:[fallback[0]+fallback[2]/2,fallback[1]+fallback[3]],cellHeight:s.height};
  g.save();if(WALK_SHEETS[mode])g.filter=OUTFIT_FILTERS[outfit===true?'gold':outfit]||'none';g.drawImage(s.canvas,...f.rect,...groundedRect(f,x,y,size,s.height));g.restore();return true;
 }
}
