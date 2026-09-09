"""Build one county map from OSM geometry and attributed SGIS-derived boundaries."""
import json,math,sys,urllib.request,concurrent.futures
from pathlib import Path
from shapely.geometry import shape,Point,LineString,Polygon,box,mapping
from shapely.ops import unary_union,polygonize
from PIL import Image,ImageDraw
import prepare_maps
SRC=Path(sys.argv[1]);OUT=Path(sys.argv[2]);B=[126.400,36.450,126.790,36.690];extent=box(*B)
def write(name,d): (OUT/name).write_text(json.dumps(d,ensure_ascii=False,separators=(',',':')))
def coords(g):return [list(p)for p in g.coords]
source=json.loads((SRC/'admin-source.geojson').read_text())
districts=[]
for f in source['features']:
 prop=f['properties'];g=shape(f['geometry'])
 if not g.intersects(extent):continue
 name=prop['adm_nm'].split()[-1];county=prop['sggnm'];center=g.representative_point()
 districts.append({'name':name,'county':county,'code':prop['adm_cd2'],'geometry':f['geometry'],'center':[center.x,center.y],'bounds':list(g.bounds)})
county=unary_union([shape(d['geometry'])for d in districts if d['county']=='홍성군'])
assert len([d for d in districts if d['county']=='홍성군'])==11
admin={'source':'https://github.com/vuski/admdongkor/tree/master/ver20260701','sourceDate':'2026-07-01','retrieved':'2026-09-09','license':'CC BY 4.0; underlying SGIS KOGL Type 1','attribution':'본 데이터는 통계청 통계지리정보서비스(SGIS, https://sgis.kostat.go.kr)에서 공공누리 제1유형으로 개방한 행정동 경계를 가공한 것이며(가공: vuski/admdongkor, https://github.com/vuski/admdongkor), CC BY 4.0으로 배포됩니다.','changes':'Hongseong and intersecting neighboring districts selected; original WGS84 polygon coordinates retained. County outline dissolved.','districts':districts,'countyGeometry':mapping(county)}
write('county-boundaries.json',admin)
def address(lon,lat):
 p=Point(lon,lat)
 return next((d for d in districts if shape(d['geometry']).covers(p)),None)
raw=json.loads((SRC/'features.json').read_text())['elements'];features=[];coast=[]
keep=['highway','building','leisure','landuse','natural','waterway','water','name','lanes','foot','access','amenity','office','bridge','tunnel']
for e in raw:
 pts=[[p['lon'],p['lat']]for p in e.get('geometry',[]) if p]
 if len(pts)<2:continue
 t={k:v for k,v in e['tags'].items() if k in keep}
 if t.get('natural')=='coastline':coast.append(LineString(pts));continue
 # Keep road vertices intact for their topological connections; clip only to extent.
 if t.get('highway'):
  g=LineString(pts).intersection(extent)
  lines=list(g.geoms)if g.geom_type=='MultiLineString'else[g]
  for i,line in enumerate(lines):
   if line.geom_type=='LineString'and len(line.coords)>1:features.append({'id':e['id'],'tags':t,'points':coords(line)})
 elif pts[0]==pts[-1] and len(pts)>3:
  g=Polygon(pts)
  if not g.is_valid:g=g.buffer(0)
  g=g.intersection(extent)
  for poly in (list(g.geoms)if g.geom_type=='MultiPolygon'else[g]):
   if poly.geom_type=='Polygon' and not poly.is_empty:features.append({'id':e['id'],'tags':t,'points':coords(poly.exterior),'holes':[coords(h)for h in poly.interiors]})
 else:features.append({'id':e['id'],'tags':t,'points':pts})
# Close the real shoreline with the outer map boundary. Islands remain holes.
lines=[l.intersection(extent) for l in coast]+[extent.boundary]
polys=list(polygonize(unary_union(lines)))
seed=Point(126.445,36.545);sea=next(p for p in polys if p.covers(seed))
assert not sea.covers(Point(126.47125,36.53865))
features.insert(0,{'id':'county-sea','tags':{'natural':'water','water':'sea','name':'천수만'},'points':coords(sea.exterior),'holes':[coords(h)for h in sea.interiors]})
# Original relief tiles are cached; prefetch the complete extent concurrently.
l,t=prepare_maps.merc(B[0],B[3]);r,b=prepare_maps.merc(B[2],B[1]);tiles=[(x,y)for x in range(int(l//256),int(r//256)+1)for y in range(int(t//256),int(b//256)+1)]
def gettile(pair):
 x,y=pair;f=SRC/f'terrain-13-{x}-{y}.png'
 if f.exists():return
 old=SRC.parent/'geodata-v2'/f.name
 if old.exists():f.write_bytes(old.read_bytes());return
 u=f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/13/{x}/{y}.png'
 for attempt in range(3):
  try:f.write_bytes(urllib.request.urlopen(u,timeout=45).read());return
  except Exception:
   if attempt==2:raise
with concurrent.futures.ThreadPoolExecutor(max_workers=6)as pool:list(pool.map(gettile,tiles))
terrain=prepare_maps.relief(B,SRC,OUT/'assets/terrain-county.webp',width=2400)
peaks=[]
for e in json.loads((SRC/'places.json').read_text())['elements']:
 tags=e.get('tags',{})
 if tags.get('natural')=='peak'and tags.get('name')and 'lon'in e and extent.covers(Point(e['lon'],e['lat'])):peaks.append({'name':tags['name'],'lon':e['lon'],'lat':e['lat'],'elevation':tags.get('ele')})
data={'region':'county','name':'홍성군 전체','bounds':B,'origin':[B[0],B[3]],'start':[126.67118,36.65611],'source':'https://www.openstreetmap.org/copyright','license':'ODbL 1.0','retrieved':'2026-09-09','terrain':'assets/terrain-county.webp','terrainSource':terrain,'features':features,'terrainLabels':peaks,'districts':districts,'countyGeometry':mapping(county),'boundarySource':{k:v for k,v in admin.items()if k not in ['districts','countyGeometry']}}
write('map-county.json',data)
# A reusable factual overview image for minimaps and non-photographic map cards.
im=Image.open(OUT/'assets/terrain-county.webp').convert('RGB');draw=ImageDraw.Draw(im)
def proj(p):return((p[0]-B[0])/(B[2]-B[0])*im.width,(B[3]-p[1])/(B[3]-B[1])*im.height)
for f in features:
 t=f['tags'];pts=[proj(p)for p in f['points']]
 if t.get('natural')=='water':
  draw.polygon(pts,fill='#77b7c4')
  for hole in f.get('holes',[]):draw.polygon([proj(p)for p in hole],fill='#b9cba4')
 elif t.get('waterway'):draw.line(pts,fill='#83b4b4',width=2)
 elif t.get('highway')in ['trunk','primary','secondary','tertiary']:draw.line(pts,fill='#faf0d2',width=2)
im.save(OUT/'assets/map-view-county.webp','WEBP',quality=85)
print('County map:',len(features),'features;',len(peaks),'peaks;',len(districts),'districts;',len(tiles),'terrain tiles',flush=True)
# Candidate facilities are exported for a separate reviewed content conversion.
places=[]
for e in json.loads((SRC/'places.json').read_text())['elements']:
 t=e.get('tags',{});n=t.get('name','');p=e.get('center',e)
 if not n or not 'lon'in p:continue
 a=address(p['lon'],p['lat'])
 if not a or a['county']!='홍성군':continue
 if t.get('natural')=='peak':continue
 places.append({'osmType':e['type'],'osm':e['id'],'name':n,'lon':p['lon'],'lat':p['lat'],'area':a['county']+' '+a['name'],'tags':t,'source':'https://www.openstreetmap.org/'+e['type']+'/'+str(e['id'])})
(SRC/'county-facilities.json').write_text(json.dumps(places,ensure_ascii=False,indent=2))
print('Facility candidates:',len(places),flush=True)
