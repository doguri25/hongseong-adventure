import {buildGraph,findRoute,distance,closestOnSegment} from './core.js';
import {SpatialIndex} from './geography.js';

export function isWalkingRoad(f){const t=f.tags||{};return !!t.highway&&!/^(motorway|trunk|construction|proposed|services|rest_area)(_|$)/.test(t.highway)&&t.foot!=='no'&&t.access!=='no';}
export class RoadNavigator{
 constructor(features){
  // Undirected: a walking character can turn around anywhere, regardless of oneway.
  this.graph=buildGraph(features.filter(isWalkingRoad));
  const g=this.graph;this.component=new Int32Array(g.nodes.length).fill(-1);let c=0;
  for(let i=0;i<g.nodes.length;i++){if(this.component[i]>=0)continue;const stack=[i];this.component[i]=c;while(stack.length){const n=stack.pop();for(const [v]of g.nodes[n].edges)if(this.component[v]<0){this.component[v]=c;stack.push(v);}}c++;}
  this.segments=g.edges.map(([a,b])=>{const x=g.nodes[a].p,y=g.nodes[b].p;return{a,b,bounds:[Math.min(x[0],y[0]),Math.min(x[1],y[1]),Math.max(x[0],y[0]),Math.max(x[1],y[1])]};});
  this.index=new SpatialIndex(this.segments,256);
 }
 nearest(p,component=null,maxDistance=Infinity){
  let best=null;const scan=list=>{for(const e of list){if(component!==null&&this.component[e.a]!==component)continue;const q=closestOnSegment(p,this.graph.nodes[e.a].p,this.graph.nodes[e.b].p),d=distance(p,q);if(d<=maxDistance&&(!best||d<best.d))best={...e,p:q,d};}};
  for(const r of [48,200,800]){scan(this.index.query([p[0]-r,p[1]-r,p[0]+r,p[1]+r]));if(best&&best.d<=r)return best;if(r>=maxDistance)return best;}
  scan(this.segments);return best;
 }
 route(start,goal,maxAccess=300){const a=this.nearest(start);if(!a)return null;const b=this.nearest(goal,this.component[a.a],maxAccess);if(!b)return null;const points=findRoute(this.graph,a.p,b.p,a,b);if(!points)return null;return{points:points.filter((p,i)=>i===0||distance(p,points[i-1])>.01),access:b.p,gap:b.d};}
 move(position,direction,budget,cursor=null){
  let edge=cursor;if(!edge||distance(position,closestOnSegment(position,this.graph.nodes[edge.a].p,this.graph.nodes[edge.b].p))>.2)edge=this.nearest(position);
  if(!edge)return{position,cursor:null};const trace=[];let p=closestOnSegment(position,this.graph.nodes[edge.a].p,this.graph.nodes[edge.b].p);const nodes=this.graph.nodes,norm=Math.hypot(...direction);let left=budget*Math.min(1,norm);if(norm<.01)return{position:p,cursor:edge};const dir=direction.map(v=>v/norm);
  // At junctions choose the connected segment most aligned with the joystick.
  for(let step=0;step<100&&left>.001;step++){
   let candidates=[];let at=-1;for(const n of [edge.a,edge.b])if(distance(p,nodes[n].p)<.05)at=n;
   if(at>=0)candidates=[...nodes[at].edges].map(([to])=>({a:at,b:to,to}));else candidates=[{...edge,to:edge.a},{...edge,to:edge.b}];
   const options=candidates.map(e=>{const dest=nodes[e.to].p,d=distance(p,dest);return{e,d,dest,score:d?((dest[0]-p[0])*dir[0]+(dest[1]-p[1])*dir[1])/d:-1};}).filter(v=>v.d>.001).sort((a,b)=>b.score-a.score);
   const best=options[0];if(!best||best.score<.15)break;edge={a:best.e.a,b:best.e.b};const travel=Math.min(left,best.d);p=[p[0]+(best.dest[0]-p[0])*travel/best.d,p[1]+(best.dest[1]-p[1])*travel/best.d];trace.push([...p]);left-=travel;
  }return{position:p,cursor:edge,trace};
 }
}
