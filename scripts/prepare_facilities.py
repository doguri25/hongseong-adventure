"""Review OSM facilities against NEIS names/addresses before building educational entries."""
import json,sys,re
from pathlib import Path
from shapely.geometry import shape,Point
SRC=Path(sys.argv[1]);OUT=Path(sys.argv[2]);raw=json.loads((SRC/'county-facilities.json').read_text());verified=json.loads((SRC/'school-verified.json').read_text());districts=json.loads((OUT/'county-boundaries.json').read_text())['districts']
def area(lon,lat):return next(d['county']+' '+d['name']for d in districts if shape(d['geometry']).covers(Point(lon,lat)))
def mask(n):
 for a,b in [('하나로마트','하0로마트'),('롯데마트','롯0마트'),('농협','농0'),('우리은행','우0은행'),('제일은행','제0은행'),('축협','축0')]:n=n.replace(a,b)
 if '0'not in n:
  k=len(n.split()[0])//2;n=n[:k]+'0'+n[k+1:]
 return n
entries=[];seen=set();dropped=[]
# Prefer way footprints to duplicate legacy nodes. Explicit moved-school rules below.
raw.sort(key=lambda e:e['osmType']!='way')
for e in raw:
 n=e['name'];t=e['tags'];kind=t.get('amenity');symbol=None
 if n in ['충청남도청','충남도서관','충남도서관 별관']:continue
 if n=='홍주초등학교'and e['area']!='홍성군 홍북읍':dropped.append({'name':n,'reason':'Moved to Hongbuk-eup per NEIS'});continue
 if n=='홍주초등학교(예정)':n='홍주초등학교'
 if n=='홍북초등학교'and e['osmType']=='node':dropped.append({'name':n,'reason':'Old site; current school footprint used'});continue
 n={'홍성서부초등학교':'서부초등학교','홍성신당초등학교':'신당초등학교'}.get(n,n)
 names=['갈산중학교','갈산고등학교'] if '갈산중학교·'in n else[n]
 for name in names:
  school=None
  if kind=='school':
   rows=verified.get(name,[])
   if not isinstance(rows,list)or not rows:dropped.append({'name':name,'reason':'No exact current NEIS school match, or former/campus ancillary entry'});continue
   school=rows[0];symbol={'초등학교':'elementary','중학교':'middle','고등학교':'high','고등기술학교':'high'}.get(school['kind'],'high')
  elif kind in ['college','university']:
   if name not in ['청운대학교 홍성캠퍼스','혜전대학교','한국폴리텍대학 홍성캠퍼스']:continue
   symbol='university'
  elif kind=='townhall'and(name=='홍성군청'or '행정복지센터'in name):symbol='government'
  elif kind=='post_office':symbol='post'
  elif kind=='bank':symbol='bank'
  elif t.get('shop')=='supermarket'and '벼룩'not in name:symbol='mart'
  elif t.get('office')=='government'and name in ['홍성군청','홍성교육지원청','충청남도 교육청','홍북읍 주민복합지원센터']:symbol='government'
  else:continue
  unique=(name,)if symbol not in ['bank','mart']else(name,round(e['lon'],4),round(e['lat'],4))
  if unique in seen:continue
  seen.add(unique);display=mask(name)if symbol in ['bank','mart']else name
  if name=='롯데마트':display='롯0마트 홍성점'
  if name=='하나로마트':display+=' · '+e['area'].split()[-1]
  address=school['address'].replace('홍북면','홍북읍')if school else t.get('addr:full')or ' '.join([e['area'],t.get('addr:street',''),t.get('addr:housenumber','')]).strip()
  if name=='롯데마트':address='충청남도 홍성군 홍성읍 조양로247번길 9'
  obj={k:e[k]for k in ['lon','lat','area','osm','osmType','source']};obj.update({'id':'facility-'+e['osmType']+'-'+str(e['osm'])+('-middle'if name=='갈산중학교'else ''),'name':display,'originalName':name,'symbol':symbol,'address':address})
  if school:obj['schoolSource']=school
  if name=='롯데마트':obj['addressSource']='https://pf.kakao.com/_jedxeb'
  entries.append(obj)
# Supplement current schools with published coordinates and verified current address.
coords={'광천초등학교':(126.6295160,36.5063718),'광천중학교':(126.6291878,36.5096633),'구항초등학교':(126.6063136,36.5843450),'홍동초등학교':(126.6885605,36.5576343)}
for name,(lon,lat)in coords.items():
 v=verified[name][0];entries.append({'id':'school-'+name,'name':name,'originalName':name,'symbol':'middle'if '중학교'in name else'elementary','lon':lon,'lat':lat,'area':area(lon,lat),'address':v['address'],'schoolSource':v,'source':'https://ko.wikipedia.org/wiki/'+name,'coordinateNote':'Published Wikipedia/Wikidata coordinate; name and current address checked against NEIS.'})
# Named OSM building for Gyeolseong Elementary (not amenity-tagged in OSM).
e=next(e for e in json.loads((SRC/'features.json').read_text())['elements']if e['id']==469593857);b=e['bounds'];lon=(b['minlon']+b['maxlon'])/2;lat=(b['minlat']+b['maxlat'])/2;v=verified['결성초등학교'][0]
entries.append({'id':'facility-way-469593857','name':'결성초등학교','originalName':'결성초등학교','symbol':'elementary','lon':lon,'lat':lat,'area':area(lon,lat),'address':v['address'],'schoolSource':v,'osm':e['id'],'osmType':'way','source':'https://www.openstreetmap.org/way/469593857'})
(OUT/'facilities.js').write_text('export const FACILITIES='+json.dumps(entries,ensure_ascii=False,separators=(',',':'))+';\n')
(OUT/'assets/facility-location-sources.json').write_text(json.dumps({'retrieved':'2026-09-09','osmLicense':'ODbL 1.0','osmAttribution':'© OpenStreetMap contributors','schoolNamesAddresses':'NEIS open schoolInfo, source LOAD_DTM 20260423','notes':['Locations are published map points or footprint centers; not surveyed entrances.','Masked commercial names; same-name marts are suffixed only with district, not an invented branch.','Generic illustrations do not depict actual buildings.','School registry exact-name nonmatches are excluded, not asserted to be closed.'], 'places':entries,'excluded':dropped},ensure_ascii=False,indent=2))
from collections import Counter
print('Additional facilities',len(entries),dict(Counter(e['symbol']for e in entries)))
