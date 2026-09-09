export const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export function inRing(p,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
export function inGeometry(p,g){const polygons=g.type==='MultiPolygon'?g.coordinates:[g.coordinates];return polygons.some(rings=>inRing(p,rings[0])&&!rings.slice(1).some(r=>inRing(p,r)));}
export function districtAt(lonLat,districts){return districts.find(d=>(!d.bounds||(lonLat[0]>=d.bounds[0]&&lonLat[0]<=d.bounds[2]&&lonLat[1]>=d.bounds[1]&&lonLat[1]<=d.bounds[3]))&&inGeometry(lonLat,d.geometry))||null;}
export function segmentDistance(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l)):0;return distance(p,[a[0]+dx*t,a[1]+dy*t]);}
export const placeRadius=p=>p.radius||(['public','heritage','intangible'].includes(p.type)?48:36);
export const canVisit=(position,p)=>distance(position,p.point)<=placeRadius(p)+24;
// Swept entry catches a circle crossed at fast speed; held IDs rearm only after leaving.
export function updateEncounters(places,from,to,held){const entered=[];for(const p of places){const r=placeRadius(p);if(distance(from,p.point)>r+3||(distance(to,p.point)>r+3&&segmentDistance(p.point,from,to)>r))held.delete(p.id);if(!held.has(p.id)&&segmentDistance(p.point,from,to)<=r){held.add(p.id);entered.push(p);}}return entered.sort((a,b)=>distance(to,a.point)-distance(to,b.point));}
export class SpatialIndex{
 constructor(items,cell=512){this.cell=cell;this.buckets=new Map();for(const f of items){const b=f.bounds;for(let x=Math.floor(b[0]/cell);x<=Math.floor(b[2]/cell);x++)for(let y=Math.floor(b[1]/cell);y<=Math.floor(b[3]/cell);y++){const key=x+','+y;if(!this.buckets.has(key))this.buckets.set(key,[]);this.buckets.get(key).push(f);}}}
 query(b){const out=new Set();for(let x=Math.floor(b[0]/this.cell);x<=Math.floor(b[2]/this.cell);x++)for(let y=Math.floor(b[1]/this.cell);y<=Math.floor(b[3]/this.cell);y++)for(const f of this.buckets.get(x+','+y)||[]){const r=f.bounds;if(r[0]<=b[2]&&r[2]>=b[0]&&r[1]<=b[3]&&r[3]>=b[1])out.add(f);}return[...out];}
}
