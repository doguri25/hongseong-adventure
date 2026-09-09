// Offline render of the production map/character code. This is not browser QA.
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {Cartography} from '../dist/cartography.js';
import {World} from '../dist/world.js';
import {SpatialIndex} from '../dist/geography.js';
import {makeMaterials} from '../dist/map-style.js';
import {PLACES} from '../dist/content.js';
import {freshState} from '../dist/core.js';
import {SpriteAtlas,isChroma} from '../dist/sprites.js';
import {MotionSprites,WALK_SHEETS} from '../dist/motion-sprites.js';
import {WALK_CELLS} from '../dist/walk-cells.js';
import {MOTION_CELLS} from '../dist/motion-cells.js';
import {measureSpriteCells} from '../dist/sprite-ground.js';
import {createDecorations} from '../dist/npcs.js';
const require=createRequire(import.meta.url);
const {createCanvas,loadImage,Path2D,GlobalFonts}=require(require.resolve('@napi-rs/canvas',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const root=fileURLToPath(new URL('../',import.meta.url)),output=process.argv[2]||'/workspace/scratch/d66eeb45399d/map-qa-v13';
await mkdir(output,{recursive:true});
globalThis.Path2D=Path2D;globalThis.document={createElement:()=>createCanvas(1,1),querySelector:()=>({textContent:''})};
GlobalFonts.registerFromPath(root+'dist/assets/NanumSquareRoundB.woff2','NanumRound');
const data=JSON.parse(await readFile(root+'dist/map-county.json','utf8'));
const w=Object.assign(Object.create(World.prototype),{data,origin:data.origin,mLat:111320,mLon:111320*Math.cos(data.origin[1]*Math.PI/180)});
w.max=[(data.bounds[2]-data.bounds[0])*w.mLon,(data.bounds[3]-data.bounds[1])*111320];
w.features=data.features.map((f,i)=>{const points=f.points.map(p=>w.project(p));return{...f,points,holes:(f.holes||[]).map(r=>r.map(p=>w.project(p))),renderOrder:i,bounds:[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))]};});
const terrain=await loadImage(root+'dist/'+data.terrain),materialImage=await loadImage(root+'dist/assets/terrain-material-atlas.png');
const painter=Object.assign(Object.create(Cartography.prototype),{w,index:new SpatialIndex(w.features),tiles:new Map(),surface:createCanvas,terrain,terrainWidth:terrain.width,terrainHeight:terrain.height,materials:makeMaterials(materialImage,createCanvas),image:{naturalWidth:0},overviews:new Map(),icons:new Map()});
w.cartography=painter;
const scale=.0625,base=createCanvas(Math.ceil(w.max[0]*scale),Math.ceil(w.max[1]*scale)),bg=base.getContext('2d'),layout={resolution:scale,size:512/scale,pixels:512,bleed:2/scale};
for(let x=0;x<Math.ceil(base.width/512);x++)for(let y=0;y<Math.ceil(base.height/512);y++)bg.drawImage(painter.tile(x,y,layout),x*512-2,y*512-2);
await writeFile(root+'dist/assets/map-view-county-v13.webp',await base.encode('webp',86));
const keyed=async file=>{const image=await loadImage(root+'dist/assets/'+file),c=createCanvas(image.width,image.height),g=c.getContext('2d');g.drawImage(image,0,0);const rgba=g.getImageData(0,0,c.width,c.height);for(let i=0;i<rgba.data.length;i+=4)if(isChroma(rgba.data[i],rgba.data[i+1],rgba.data[i+2]))rgba.data[i+3]=0;g.putImageData(rgba,0,0);return{canvas:c,rgba};};
const motion=Object.assign(Object.create(MotionSprites.prototype),{sheets:{}});
for(const mode of ['walk','boy','raccoon','bike','fast','plane']){const {canvas,rgba}=await keyed(WALK_SHEETS[mode]||'motion-'+mode+'.png'),walking=!!WALK_SHEETS[mode];motion.sheets[mode]={canvas,width:canvas.width/(walking?8:4),height:canvas.height/4,cells:walking?WALK_CELLS[mode]:measureSpriteCells(rgba.data,canvas.width,canvas.height,4,4,MOTION_CELLS[mode]),walking};}
const {canvas:atlas}=await keyed('game-sprites-chroma-atlas.png');
Object.assign(w,{width:1200,height:800,dpr:1,canvas:createCanvas(1200,800),state:freshState(),route:[],trails:[],decorations:createDecorations(w.features,PLACES.filter(p=>!p.remote).map(p=>w.project([p.lon,p.lat]))),places:PLACES.filter(p=>!p.remote).map(p=>({...p,point:w.project([p.lon,p.lat])})),npcs:[],iconPaths:new Map(),atlas:Object.assign(Object.create(SpriteAtlas.prototype),{canvas:atlas,ready:true}),motionSprites:motion,heading:'se',walkPhase:0,moving:true,lastMini:Number.MAX_SAFE_INTEGER});w.ctx=w.canvas.getContext('2d');
for(const [name,point,zoom,mode] of [['naepo',data.start,1.2,'walk'],['hongseong',[126.6594,36.6005],.9,'bike'],['coast',[126.4708,36.5365],.4,'plane'],['forest',[126.650,36.6455],.55,'raccoon']]){w.position=w.project(point);w.camera=[...w.position];w.zoom=zoom;w.state.travelSpeed=mode==='raccoon'?'walk':mode;w.state.character=mode==='raccoon'?'raccoon':'explorer';painter.clearTiles();w.draw();await writeFile(output+'/'+name+'.png',w.canvas.toBuffer('image/png'));}
console.log(JSON.stringify({base:[base.width,base.height],scenes:4,output}));
