import {SpatialIndex,inRing,segmentDistance,distance} from './geography.js';
const area=ring=>Math.abs(ring.reduce((s,a,i)=>{const b=ring[(i+1)%ring.length];return s+a[0]*b[1]-b[0]*a[1];},0))/2;
export function blocksWater(f){const t=f.tags||{};return t.natural==='water'&&(t.water==='sea'||t.water==='reservoir'||area(f.points)>=10000);}
export class WaterGuard{
 constructor(features){this.waters=features.filter(blocksWater);this.index=new SpatialIndex(this.waters,512);const spans=[];for(const f of features){const t=f.tags||{};if(!t.highway||!(t.bridge&&t.bridge!=='no'||t.man_made==='dyke'||t.embankment==='yes'))continue;for(let i=1;i<f.points.length;i++){const a=f.points[i-1],b=f.points[i];spans.push({a,b,bounds:[Math.min(a[0],b[0])-10,Math.min(a[1],b[1])-10,Math.max(a[0],b[0])+10,Math.max(a[1],b[1])+10]});}}this.bridges=new SpatialIndex(spans,256);}
 waterAt(p){return this.index.query([p[0],p[1],p[0],p[1]]).find(f=>inRing(p,f.points)&&!(f.holes||[]).some(r=>inRing(p,r)))||null;}
 blocked(p){return !!this.waterAt(p)&&!this.bridges.query([p[0]-9,p[1]-9,p[0]+9,p[1]+9]).some(e=>segmentDistance(p,e.a,e.b)<=8);}
 // Inspect the entire swept segment, so a high-speed frame cannot skip a shoreline.
 clip(from,to){const d=distance(from,to),n=Math.max(1,Math.ceil(d/3));let last=from;for(let i=1;i<=n;i++){const p=[from[0]+(to[0]-from[0])*i/n,from[1]+(to[1]-from[1])*i/n];if(this.blocked(p))return{position:[...last],blocked:true};last=p;}return{position:[...to],blocked:false};}
 clearRoute(from,points){let a=from;for(const b of points){if(this.clip(a,b).blocked)return false;a=b;}return true;}
 nearestLand(p,maxRadius=2000){if(!this.blocked(p))return[...p];for(let r=12;r<=maxRadius;r+=12)for(let i=0;i<32;i++){const a=i*Math.PI/16,q=[p[0]+Math.cos(a)*r,p[1]+Math.sin(a)*r];if(!this.blocked(q))return q;}return null;}
}
