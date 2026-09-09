"""Convert bounded OSM downloads and public terrain tiles into the game's maps."""
import argparse, json, math, urllib.request, io
from pathlib import Path
import xml.etree.ElementTree as ET
import numpy as np
from PIL import Image, ImageDraw

REGIONS = {
 'naepo': {'name':'내포신도시','bounds':[126.659,36.647,126.689,36.669],'start':[126.67118,36.65611]},
 'yongbong': {'name':'용봉산','bounds':[126.635,36.640,126.657,36.664],'start':[126.6539,36.6457]},
 'namdang': {'name':'남당항','bounds':[126.450,36.530,126.474,36.547],'start':[126.47125,36.53865]},
}

def merc(lon,lat,z=13):
 return (lon+180)/360*2**z*256,(1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*2**z*256

def relief(bounds,cache,target,width=1100):
 west,south,east,north=bounds
 l,t=merc(west,north);r,b=merc(east,south)
 x0,y0=math.floor(l/256),math.floor(t/256);x1,y1=math.floor(r/256),math.floor(b/256)
 mosaic=np.zeros(((y1-y0+1)*256,(x1-x0+1)*256),dtype=np.float32)
 sources=[]
 for y in range(y0,y1+1):
  for x in range(x0,x1+1):
   u=f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/13/{x}/{y}.png'
   file=cache/f'terrain-13-{x}-{y}.png'
   if not file.exists():
    req=urllib.request.Request(u,headers={'User-Agent':'HongseongEducationDemo/2.0'})
    file.write_bytes(urllib.request.urlopen(req,timeout=30).read())
   a=np.asarray(Image.open(file).convert('RGB'),dtype=np.float32)
   h=a[:,:,0]*256+a[:,:,1]+a[:,:,2]/256-32768
   mosaic[(y-y0)*256:(y-y0+1)*256,(x-x0)*256:(x-x0+1)*256]=h
   sources.append(u)
 w=width;mh=(north-south)*111320;mw=(east-west)*111320*math.cos(math.radians(north));h=round(w*mh/mw)
 xs=np.linspace(l-x0*256,r-x0*256,w)
 ys=np.array([merc(west,lat)[1]-y0*256 for lat in np.linspace(north,south,h)])
 xi=np.floor(xs).astype(int).clip(0,mosaic.shape[1]-2);yi=np.floor(ys).astype(int).clip(0,mosaic.shape[0]-2)
 fx=(xs-xi)[None,:];fy=(ys-yi)[:,None]
 heights=(mosaic[yi[:,None],xi[None,:]]*(1-fx)*(1-fy)+mosaic[yi[:,None],xi[None,:]+1]*fx*(1-fy)+mosaic[yi[:,None]+1,xi[None,:]]*(1-fx)*fy+mosaic[yi[:,None]+1,xi[None,:]+1]*fx*fy)
 dy,dx=np.gradient(heights,mh/h,mw/w);dx*=2.5;dy*=2.5
 illumination=(-dx*.65-dy*.65+1.2)/np.sqrt(dx*dx+dy*dy+1)/1.5
 illumination=np.clip(illumination,.42,1.17)
 low=np.array([199,214,166]);high=np.array([91,134,79]);rock=np.array([168,163,124])
 v=np.clip((heights-20)/280,0,1)[:,:,None]
 rgb=low*(1-v)+high*v
 summit=np.clip((heights-300)/120,0,.6)[:,:,None];rgb=rgb*(1-summit)+rock*summit
 rgb*= (.77+illumination*.3)[:,:,None]
 # Elevation contours are derived from actual height values, 25 m apart.
 phase=np.abs((heights+12.5)%25-12.5);edge=np.clip(1-phase/1.1,0,1)*(heights>55)
 rgb*=1-edge[:,:,None]*.1
 Image.fromarray(np.clip(rgb,0,255).astype('uint8'),'RGB').save(target,'WEBP',quality=91)
 return {'source':'https://registry.opendata.aws/terrain-tiles/','attribution':'Terrain Tiles / Mapzen · SRTM, GMTED2010 data courtesy of USGS; ETOPO1 data NOAA','licenseSource':'https://github.com/tilezen/joerd/blob/master/docs/attribution.md','tiles':sources,'minHeight':round(float(heights.min()),1),'maxHeight':round(float(heights.max()),1),'changes':'Terrarium decoded to elevation, resampled to local geographic extent, hypsometric tint and hillshade (2.5× visual slope exaggeration).'}

def convert(key,meta,source,out):
 root=ET.parse(source/(key+'.osm')).getroot()
 nodes={n.get('id'):n for n in root.findall('node')}
 tags=lambda n:{x.get('k'):x.get('v') for x in n.findall('tag')}
 relations={r.get('id'):r for r in root.findall('relation')}
 common=set()
 if '7578859'in relations and '7619555'in relations:
  common={m.get('ref') for m in relations['7578859'].findall('member')}&{m.get('ref') for m in relations['7619555'].findall('member')}
 features=[];labels=[];coast=[];source_nodes=[]
 keep=['highway','building','leisure','landuse','natural','waterway','name','width','lanes','service','foot','access','surface','amenity','office','ele','man_made']
 for w in root.findall('way'):
  t=tags(w);p=[[float(nodes[m.get('ref')].get('lon')),float(nodes[m.get('ref')].get('lat'))] for m in w.findall('nd') if m.get('ref')in nodes]
  if len(p)<2:continue
  if not any(k in t for k in ['highway','building','leisure','landuse','natural','waterway','man_made']) and w.get('id')not in common:continue
  t={k:v for k,v in t.items() if k in keep}
  if w.get('id')in common:t['county_boundary']='yes'
  features.append({'id':int(w.get('id')),'tags':t,'points':p})
  if t.get('natural')=='coastline':coast.append(p)
 for n in nodes.values():
  t=tags(n)
  if t.get('name') or t.get('shop'):source_nodes.append({'id':int(n.get('id')),'lon':float(n.get('lon')),'lat':float(n.get('lat')),'name':t.get('name',''),'natural':t.get('natural'),'shop':t.get('shop')})
  if t.get('natural')=='peak':labels.append({'name':t.get('name','봉우리'),'lon':float(n.get('lon')),'lat':float(n.get('lat')),'elevation':t.get('ele')})
 if coast:
  # This extract has one continuous north/south coast. Close on the sea's west side.
  for i,p in enumerate(coast):
   west=min(meta['bounds'][0]-.04,min(x[0]for x in p)-.04)
   # Close outside the viewport. Here the real shore enters from north and exits east.
   b=meta['bounds']
   if p[0][1]>b[3] and p[-1][0]>b[2]:
    right=max(b[2],p[-1][0])+.04;top=max(b[3],p[0][1])+.04;bottom=b[1]-.04
    sea=p+[[right,p[-1][1]],[right,bottom],[west,bottom],[west,top],[p[0][0],top],p[0]]
   else:
    sea=p+[[west,p[-1][1]],[west,p[0][1]],p[0]]
   features.insert(0,{'id':'sea-'+str(i),'tags':{'natural':'water','water':'sea','name':'천수만'},'points':sea})
 dem=relief(meta['bounds'],source,out/'assets'/('terrain-'+key+'.webp'))
 d={**meta,'region':key,'origin':[meta['bounds'][0],meta['bounds'][3]],'source':'https://www.openstreetmap.org/copyright','license':'ODbL 1.0','retrieved':'2026-09-09','terrain':'assets/terrain-'+key+'.webp','terrainSource':dem,'features':features,'terrainLabels':labels,'sourceNodes':source_nodes}
 (out/('map-data.json'if key=='naepo'else'map-'+key+'.json')).write_text(json.dumps(d,ensure_ascii=False,separators=(',',':')))
 if key in ['naepo','namdang']:
  im=Image.open(out/'assets'/('terrain-'+key+'.webp')).convert('RGB');draw=ImageDraw.Draw(im);b=meta['bounds']
  def proj(p):return((p[0]-b[0])/(b[2]-b[0])*im.width,(b[3]-p[1])/(b[3]-b[1])*im.height)
  for f in features:
   t=f['tags'];pts=[proj(p)for p in f['points']]
   if t.get('natural')=='water':draw.polygon(pts,fill='#77b7c4')
   elif t.get('waterway'):draw.line(pts,fill='#81b9b8',width=5)
   elif t.get('building'):draw.polygon(pts,fill='#d4c8a6')
  for f in features:
   if f['tags'].get('highway'):draw.line([proj(p)for p in f['points']],fill='#f9efcc',width=3)
  im.thumbnail((1200,900));im.save(out/'assets'/('map-view-'+key+'.webp'),'WEBP',quality=90)
 print(key,len(features),'features;',len(labels),'peaks; elevation',dem['minHeight'],dem['maxHeight'],flush=True)

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--source-dir',type=Path,required=True);p.add_argument('--output-dir',type=Path,required=True);a=p.parse_args()
 for key,meta in REGIONS.items():convert(key,meta,a.source_dir,a.output_dir)
