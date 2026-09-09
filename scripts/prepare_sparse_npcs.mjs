// Offline placement avoids a county-wide density calculation during gameplay.
import {readFileSync,writeFileSync} from 'node:fs';
import {RoadNavigator} from '../dist/navigation.js';
import {WaterGuard} from '../dist/water.js';
import {districtAt,distance} from '../dist/geography.js';
import {PLACES} from '../dist/content.js';
const data=JSON.parse(readFileSync(new URL('../dist/map-county.json',import.meta.url))),ml=111320*Math.cos(data.origin[1]*Math.PI/180);
const project=p=>[(p[0]-data.origin[0])*ml,(data.origin[1]-p[1])*111320],geo=p=>[data.origin[0]+p[0]/ml,data.origin[1]-p[1]/111320];
const features=data.features.map(f=>{const points=f.points.map(project);return{...f,points,holes:(f.holes||[]).map(r=>r.map(project)),bounds:[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))]};});
const nav=new RoadNavigator(features),water=new WaterGuard(features),start=nav.nearest(project(data.start)),component=nav.component[start.a],places=PLACES.filter(p=>!p.remote).map(p=>project([p.lon,p.lat])),byDistrict=new Map();
for(let i=0;i<nav.graph.nodes.length;i+=5){if(nav.component[i]!==component)continue;const p=nav.graph.nodes[i].p;if(water.blocked(p))continue;const ll=geo(p),district=districtAt(ll,data.districts);if(district?.county!=='홍성군')continue;const gap=Math.min(...places.map(q=>distance(p,q)));if(gap<450)continue;if(!byDistrict.has(district.name))byDistrict.set(district.name,[]);byDistrict.get(district.name).push({point:p,lon:ll[0],lat:ll[1],district:district.name,gap});}
const out=[];
for(const d of data.districts.filter(d=>d.county==='홍성군')){const candidates=byDistrict.get(d.name)||[];for(let i=0;i<4;i++){const ranked=candidates.filter(c=>out.every(n=>distance(n.point,c.point)>1250)).map(c=>({c,score:Math.min(c.gap,2500)+Math.min(3000,...out.filter(n=>n.district===c.district).map(n=>distance(n.point,c.point)))})).sort((a,b)=>b.score-a.score);if(!ranked[0])throw Error('Not enough sparse dry road sites in '+d.name);out.push(ranked[0].c);}}
const roles=['forest','storyteller','farmer','birds','police','firefighter','vendor','station'];
const rows=out.map((n,i)=>({id:'npc-country-'+i,district:n.district,lon:Number(n.lon.toFixed(7)),lat:Number(n.lat.toFixed(7)),role:roles[i%roles.length],nearestPlaceMeters:Math.floor(n.gap)}));
writeFileSync(new URL('../dist/sparse-npcs.js',import.meta.url),'// Generated from dry walking-road vertices; every point is at least 450 m from a mapped place.\nexport const SPARSE_NPCS='+JSON.stringify(rows,null,2)+';\n');
console.log({count:rows.length,districts:byDistrict.size,minimumPlaceGap:Math.min(...rows.map(n=>n.nearestPlaceMeters))});
