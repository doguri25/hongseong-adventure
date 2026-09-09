"""Version 1.1 curated original grade-3 lessons. Raw coordinate references retained in research/."""
import json,re
from pathlib import Path
OUT=Path('dist');es={e['id']:e for e in json.load(open('research/expansion-v11-osm.json'))['elements']}
entries=[]
def osm(id):
 e=es[id];b=e.get('bounds');c=e.get('center');return (e.get('lon') or(c['lon']if c else(b['minlon']+b['maxlon'])/2),e.get('lat')or(c['lat']if c else(b['minlat']+b['maxlat'])/2),'https://www.openstreetmap.org/'+e['type']+'/'+str(id))
def htmlcoord(key,url):
 c=json.load(open('research/expansion-v11-coordinates.json'))[key]
 return c['lon'],c['lat'],url

def add(id,name,symbol,coord,area,address,fact,question,correct,source=None,aliases=None,note=None,brand=False):
 lon,lat,loc=coord;original=name
 if brand:
  i=max(1,len(name)//2);name=name[:i]+'0'+name[i+1:]
 typ='daily'if symbol=='restaurant'else'nature'if symbol=='forest'else'public'
 coins=10 if brand else 80 if symbol=='forest'else 50
 category={'forest':'숲·산림욕장','train':'기차역','bus':'버스터미널·정류소','restaurant':'음식점','swimming':'수영장','splash':'어린이 물놀이장','playground':'놀이터'}[symbol]
 image='forest-generic-illustration.webp'if symbol=='forest'else'market-generic-illustration.webp'if brand else'transit-story.png'if symbol in ['bus','train']else'swimming-story.png'if symbol in ['swimming','splash']else'playground-story.png'
 p={'id':'new-'+id,'name':name,'short':name,'symbol':symbol,'lon':lon,'lat':lat,'area':area,'county':area.split()[0],'address':address,'region':'county','category':category,'type':typ,'coins':coins,'xp':coins*2,'image':'assets/'+image,'caption':category+'의 역할을 표현한 공통 삽화 · 실제 현장 사진 아님','blurb':fact.split('.')[0],'source':source or loc,'locationSource':loc,'locationNote':note or '출처에 공개된 시설 또는 주소 좌표. 건물 출입구와는 차이가 있을 수 있음.','pages':[f'여기는 <strong>{name}</strong>이야. <strong>{area}</strong>에 있어. '+fact,f'이곳의 주소는 <strong>{address}</strong>야. 이름이 비슷한 장소라도 주소와 하는 일을 함께 살펴보면 구별할 수 있어. 이곳에서 기억에 남을 만한 모습은 무엇일까?'],'quiz':{'question':question,'options':[correct,'장소 이름과 주소는 살펴보지 않아요','어느 장소나 하는 일이 모두 같아요'],'answer':0,'hint':fact,'explain':correct+'! 장소의 이름·위치·특징을 함께 소개해 보자.'}}
 if aliases:p['aliases']=aliases
 if brand:p['originalName']=original;p['store']=True;p['pages'].append('음식점은 재료를 준비하고 음식을 만들어 손님에게 내어 주는 곳이야. 지역의 먹거리에는 재료를 기르고 운반하고 요리하는 여러 사람의 일이 담겨 있단다.');p['blurb']='우리 고장의 먹거리와 사람들의 일'
 if symbol in ['swimming','splash','playground']:p['pages'].append('함께 이용하는 시설에서는 차례를 지키고 안내하는 어른의 말을 따라요. 물놀이장 개장 기간과 이용 대상은 계절마다 달라질 수 있으니 실제 방문 전 공식 안내를 확인해요.'if symbol in ['swimming','splash']else'놀이시설을 함께 쓸 때는 차례를 지켜요. 친구가 놀이를 마친 뒤 이용하고, 서로 편하게 놀 수 있는 약속을 생각해 보자.')
 if p['county']!='홍성군':p['pages'].append(f'이곳은 <strong>{area}</strong>에 있어. 홍성과 가까운 이웃 고장의 장소란다. 우리 고장과 이웃 고장의 경계를 지도에서 찾아보자.')
 offset=len(entries)%3
 options=p['quiz']['options'];p['quiz']['options']=options[-offset:]+options[:-offset] if offset else options;p['quiz']['answer']=offset
 entries.append(p)
add('namsan','남산산림욕장','forest',htmlcoord('namsan-address','https://findby.co.kr/details/32244-448003252053-st-652c0c55f27008be2c55e097'),'홍성군 홍성읍','홍성군 홍성읍 충서로 1121-74','청운대학교·혜전대학교 가까이에 있는 숲이야. 내포문화숲길과 연결되고 한용운 선생 동상도 만날 수 있어. 홍주읍성 안의 남산공원과는 다른 장소란다.','남산산림욕장과 남산공원을 구별하려면?','주소와 주변 장소를 함께 살펴봐요','https://www.chungnam.go.kr/cnportal/media/article/view.do?articleNo=MD0003296731&menuNo=500166',aliases=['남산 휴양림','남산휴양림'])
add('oseo-forest','국립오서산자연휴양림','forest',osm(368975319),'보령시 청라면','보령시 청라면 오서산길 531','오서산 숲에서 쉬며 자연을 만나는 곳이야. 홍성 쪽 오서산 등산길과 연결된 산이지만 이 휴양림의 주소는 보령시란다.','국립오서산자연휴양림의 주소는 어느 고장일까?','보령시 청라면이에요','https://www.foresttrip.go.kr/indvz/main.do?hmpgId=0191',aliases=['오서산 휴양림','오서산휴양림'])
add('hongseong-station','홍성역','train',osm(8664401956),'홍성군 홍성읍','홍성군 홍성읍 조양로 272','기차를 타고 다른 고장으로 이동하는 교통시설이야. 지도에서 장항선과 서해선이 어디로 이어지는지 살펴보자.','홍성역에서 주로 이용하는 교통수단은?','기차를 이용해요',aliases=['홍성 기차역'])
add('gwangcheon-station','광천역','train',osm(368636861),'홍성군 광천읍','홍성군 광천읍 광천로273번길 85','광천읍에 있는 장항선의 기차역이야. 광천전통시장과 역이 가까이 모여 있는 모습을 비교해 보자.','광천역과 시장을 연결해 살펴보면?','사람들이 이동하고 물건을 사는 생활 모습을 알 수 있어요',aliases=['광천 기차역'])
add('hongseong-terminal','홍성종합터미널','bus',osm(503299104),'홍성군 홍성읍','홍성군 홍성읍 조양로247번길 9','여러 지역을 오가는 버스를 타고 내리는 곳이야. 기차역과 터미널은 이용하는 교통수단이 달라.','터미널과 기차역의 다른 점은?','주로 이용하는 교통수단이 달라요',aliases=['홍성터미널','홍성 버스터미널'])
add('naepo-bus','내포신도시 고속시외버스정류소','bus',osm(890918469),'예산군 삽교읍','예산군 삽교읍 도청대로 600 부근','내포에서 다른 고장으로 가는 버스를 이용하는 곳이야. 도청 가까이에 있지만 정류소는 예산군 쪽에 있어. 이전 계획과 실제 운영 위치는 공식 안내를 확인해야 해.','내포의 이 버스정류소는 어느 군 쪽일까?','예산군 삽교읍 쪽이에요',aliases=['내포버스정류장','내포터미널','내포 버스터미널','내포 버스'])
food=[('naedang','내당한우',(126.6637373,36.6002987,'https://kr.maptons.com/p/8796442381'),'홍성군 홍성읍','아문길52번길 6','한우 요리로 알려진 음식점이야. 홍성의 축산업과 먹거리 문화를 연결해서 생각해 보자.','https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=dfa3f591-426f-4e70-9e68-5c117b143552'),('gyeolnoodle','결성칼국수',htmlcoord('gyeolnoodle','https://www.diningcode.com/profile.php?rid=XgXqsEZIgPxY'),'홍성군 결성면','구성남로 31','굴칼국수로 알려진 음식점이야. 국수와 바다에서 나는 재료가 만나 고장의 먹거리가 되는 모습을 살펴보자.','https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=579fb01a-e4ca-4cd0-b8cc-e99cf5458a1e')]
for id,name,rid,area,address,foodname in [('hanbat','한밭식당','G0HqCB8wmJxe','광천읍','광천로299번길 6-1','한우불고기'),('gukbap','70년소머리국밥','UjoZtlJbWFKm','홍성읍','의사로43번길 27-9','소머리국밥'),('seafood','내포해물촌','z0X2UzPOBwbm','홍성읍','조양로246번길 80','새조개 등 해산물 요리'),('mido','미도식당','5XveFn1v5GNu','광천읍','광천로 300-1','한우불고기')]:
 url='https://www.diningcode.com/profile.php?rid='+rid;food.append((id,name,htmlcoord(id,url),'홍성군 '+area,address,foodname+'를 만날 수 있는 음식점이야. 같은 고장 안에서도 여러 종류의 음식과 가게를 만날 수 있지.',url))
for id,name,coord,area,address,fact,source in food:add(id,name,'restaurant',coord,area,area+' '+address,fact,'음식점에서 고장의 특징을 찾으려면?','음식에 쓰인 재료와 사람들의 일을 알아봐요',source,brand=True)
add('bandabi','홍성반다비수영장','swimming',htmlcoord('pool-coordinate','https://findby.co.kr/details/32216-448003262035-st-6936f8663be63ba92f012a1c'),'홍성군 홍성읍','홍성군 홍성읍 홍덕서로 78-9','장애인과 비장애인이 함께 이용하는 수영장이야. 서로 다른 사람들이 함께 쓰기 편리한 시설에는 무엇이 필요한지 생각해 보자.','함께 쓰기 좋은 수영장은 어떤 곳일까?','서로 다른 사람들이 편리하게 이용할 수 있는 곳이에요','https://hsbandabi.co.kr/_NBoard/content.php?co_id=cont0102',aliases=['홍성수영장','반다비 수영장'])
add('namjang-splash','남장골 어린이공원 물놀이장','splash',(126.664107,36.587287,'https://ger.clubrichtour.co.kr/bbs/board.php?bo_table=public_cty_park_info&wr_id=1253'),'홍성군 홍성읍','홍성군 홍성읍 남장리 528','여름에 어린이들이 물놀이를 하는 공원이야. 같은 공원도 계절에 따라 하는 일이 달라질 수 있어.','같은 공원이 계절마다 달라질 수 있을까?','계절에 맞는 놀이와 활동을 할 수 있어요','https://www.ccnnews.co.kr/news/articleView.html?idxno=378450',aliases=['남장골물놀이장','남장골어린이공원'],note='도시공원 표준자료의 공원 좌표. 물놀이 시설 출입구가 아닌 공원 대표 지점.')
add('sinri-splash','신리천공원 물놀이장','splash',osm(660157106),'홍성군 홍북읍','홍성군 홍북읍 신경리 1367','내포신도시 신리천공원에서 여름 물놀이를 즐기는 공간이야. 공원과 냇가, 주변 집들이 어떻게 이어져 있는지 살펴보자.','공원 주변 모습을 살피는 방법은?','냇가와 집, 길의 위치를 함께 찾아봐요','https://www.cica.go.kr/bbs/BBSMSTR_000000000023/list.do',aliases=['내포 물놀이장','신리천 물놀이'],note='OSM 공원 대표 좌표에 둔 학습 지점. 물놀이시설 출입구의 정밀 좌표는 아님.')
for i,id in enumerate([472303190,475573875],1):add('play-'+str(id),'홍성읍 놀이터 '+str(i),'playground',osm(id),'홍성군 홍성읍','홍성군 홍성읍 (지도 위치 참고)','집 가까이에서 놀이하고 이웃을 만나는 공간이야. 친구마다 기억하는 놀이터의 모습이 어떻게 다른지 이야기해 보자.','같은 놀이터의 기억이 서로 달라도 괜찮을까?','서로의 경험을 나누면 더 잘 알 수 있어요',note='OSM에 이름 없이 등록된 놀이시설. 게임에서 구별하기 위한 설명 이름.')
add('terrain-play','지형놀이공원','playground',(126.676651,36.645698,'https://kor.clubrichtour.co.kr/bbs/board.php?bo_table=public_cty_park_info&wr_id=1610'),'홍성군 홍북읍','홍성군 홍북읍 신경리 1371','내포신도시에 있는 어린이공원이야. 집 가까운 공원에서 놀고 이웃을 만나며 다양한 경험을 쌓을 수 있어. 공원의 모양과 놀이시설을 살펴보고 내가 기억하는 장소로 소개해 보자.','친구에게 놀이터를 소개할 때 무엇을 말할까?','위치와 내가 경험한 특징을 함께 이야기해요','https://www.chungnam.go.kr/naepo/main/contents.do?menuNo=3100005',aliases=['내포 놀이터','내포어린이공원1','홍북10호공원'],note='도시공원 표준자료의 공원 대표 좌표. 출입구 정밀 좌표는 아님.')
OUT.joinpath('expansion-places.js').write_text('export const EXPANSION_PLACES='+json.dumps(entries,ensure_ascii=False,indent=2)+';\n')
OUT.joinpath('assets/expansion-location-sources.json').write_text(json.dumps({'retrieved':'2026-09-09','railwaySource':'OpenStreetMap contributors, ODbL 1.0; actual rail ways, no invented track geometry','places':[{k:v for k,v in p.items()if k in ['id','name','originalName','lon','lat','area','address','source','locationSource','locationNote']}for p in entries]},ensure_ascii=False,indent=2))
print('Added',len(entries))
