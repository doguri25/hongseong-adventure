// The original geographic polygons remain the source of every surface and roof.
export const MAP_PALETTE={ground:'#b8cca0',ocean:'#3f95b0',lake:'#62a7a4',grass:'#9cc878',forest:'#628c58',field:'#d4cd91',town:'#d5d9cc'};
export function surfaceKind(tags){
 if(tags.natural==='water')return tags.water==='sea'?'ocean':'lake';
 if(tags.landuse==='forest'||tags.natural==='wood')return'forest';
 if(tags.landuse==='farmland'||tags.landuse==='orchard')return'field';
 if(['grass','meadow','recreation_ground'].includes(tags.landuse)||['park','garden','playground'].includes(tags.leisure))return'grass';
 if(['residential','commercial','retail','industrial'].includes(tags.landuse)||['pitch','sports_centre'].includes(tags.leisure))return'town';
 return null;
}
export function makeMaterials(image,surface){
 const result={};for(const [i,key] of ['water','grass','field','stone'].entries()){
  const c=surface(192,192),g=c.getContext('2d');g.drawImage(image,(i%2)*image.width/2,Math.floor(i/2)*image.height/2,image.width/2,image.height/2,0,0,192,192);result[key]=c;
 }return result;
}
function material(painter,g,key){const tile=painter.materials?.[key];if(!tile)return null;painter.patterns??=new WeakMap();let patterns=painter.patterns.get(g);if(!patterns){patterns=new Map();painter.patterns.set(g,patterns);}if(!patterns.has(key)){const p=g.createPattern(tile,'repeat');p.setTransform({a:.45,b:0,c:0,d:.45,e:0,f:0});patterns.set(key,p);}return patterns.get(key);}
export function paintGround(painter,g,view,resolution){const texture=resolution>=.25?material(painter,g,'grass'):null;if(!texture)return;g.save();g.globalAlpha=.09;g.fillStyle=texture;g.fillRect(...view);g.restore();}
export function paintSurface(painter,g,f,view,resolution){
 const kind=surfaceKind(f.tags);if(!kind)return;
 const water=kind==='ocean'||kind==='lake',bounds=f.bounds;
 painter.path(g,f);g.save();g.clip('evenodd');
 if(water){const gradient=g.createLinearGradient(bounds[0],bounds[1],bounds[0],bounds[3]);gradient.addColorStop(0,kind==='ocean'?'#73bfca':'#92c9bc');gradient.addColorStop(1,MAP_PALETTE[kind]);g.fillStyle=gradient;g.fillRect(...view);}
 else{g.globalAlpha=kind==='forest'?.48:kind==='town'?.72:.55;g.fillStyle=MAP_PALETTE[kind];g.fillRect(...view);g.globalAlpha=1;}
 const texture=resolution>=.25?material(painter,g,water?'water':kind==='town'?'stone':kind==='field'?'field':'grass'):null;
 if(texture){g.fillStyle=texture;g.globalAlpha=water?.13:.17;g.fillRect(...view);g.globalAlpha=1;}
 if(water){
  // All shore highlights stay inside the water, including around islands.
  painter.path(g,f);g.lineJoin='round';g.lineWidth=kind==='ocean'?32:12;g.strokeStyle=kind==='ocean'?'#c4ded07a':'#cde5cd91';g.stroke();g.lineWidth=kind==='ocean'?10:4;g.strokeStyle='#e4f1cfb8';g.stroke();
 }else if(kind==='forest'){painter.path(g,f);g.lineWidth=5;g.strokeStyle='#436c4430';g.stroke();}
 g.restore();
}
export function buildingStyle(tags){
 const levels=Number.parseFloat(tags['building:levels'])||2;
 return{height:Math.min(12,Math.max(3,levels*2)),roof:tags.amenity==='school'?'#dfaf78':tags.office||['townhall','police','fire_station'].includes(tags.amenity)?'#88aab2':['industrial','warehouse'].includes(tags.building)?'#99a8b2':tags.building==='apartments'?'#bac6c7':'#d6b692',edge:'#63776b',wall:'#a99d82'};
}
export function paintBuilding(painter,g,f,resolution){
 const style=buildingStyle(f.tags),rise=resolution>=1?style.height:3;
 g.save();g.translate(4,6);painter.path(g,f);g.fillStyle='#254e3c32';g.fill('evenodd');g.restore();
 painter.path(g,f);g.fillStyle=style.wall;g.fill('evenodd');g.strokeStyle=style.wall;g.lineWidth=2;g.stroke();
 g.save();g.translate(-rise*.32,-rise);painter.path(g,f);g.fillStyle=style.roof;g.fill('evenodd');g.lineWidth=1.2;g.strokeStyle=style.edge;g.stroke();
 // A narrow light rim clarifies each mapped roof without invented windows.
 g.save();g.clip('evenodd');g.translate(.8,1.1);painter.path(g,f);g.lineWidth=1.8;g.strokeStyle='#fff9e5a6';g.stroke();g.restore();g.restore();
}
