"""Tourist-map reconciliation. Never invent precise coordinates for unverified markers."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'dist'
osm={e['id']:e for e in json.loads((ROOT/'research/map-additions-osm.json').read_text())['elements']}
star={e['name']:e for e in json.loads((ROOT/'research/tourism-coordinates.json').read_text())}
MAP='./assets/hongseong-tourist-map-2022.jpg';TOUR='https://hongju.or.kr/home/content.do?menu_cd=000098';STAR='https://data.star365.site/p/지역/충남-가볼만한곳'
entries=[]
def add(id,name,symbol,coord,area,fact,question,correct,source=MAP,**extra):
 if isinstance(coord,int):
  e=osm[coord];v=e.get('center',e);lon,lat=v['lon'],v['lat'];loc=f"https://www.openstreetmap.org/{e['type']}/{e['id']}"
 elif isinstance(coord,str):v=star[coord];lon,lat=v['lon'],v['lat'];loc=STAR;extra.setdefault('address',v['address'])
 elif coord:lon,lat,loc=coord
 else:lon=lat=None;loc=None
 nature=symbol in ['mountain','island','water','viewpoint','harbor','park','village','trail'];typ='nature'if nature else 'intangible'if symbol=='craft'else'public'if symbol=='market'else'heritage';coins=60 if symbol=='market'else 80 if nature else 100
 image='forest'if nature else'market'if symbol=='market'else'specialty'if symbol=='craft'else'museum'
 category={'island':'섬','mountain':'산','water':'저수지·물길','viewpoint':'전망대','harbor':'항구','park':'공원','village':'체험마을','trail':'걷는 길','craft':'전통공예','oldhouse':'고택','heritage':'성곽·유적','memorial':'인물 유적','temple':'사찰·사당','oldoffice':'옛 관아','museum':'박물관','market':'시장'}[symbol]
 options=['어느 고장이나 모습과 이야기가 같다는 것','장소의 이름과 위치는 필요 없다는 것'];answer=len(entries)%3;options.insert(answer,correct)
 p=dict(id='tourmap-'+id,name=name,short=name,symbol=symbol,region='county',county='홍성군',area='홍성군 '+area,type=typ,category=category,coins=coins,xp=coins*3//2,image=f'assets/{image}-generic-illustration.webp',caption=category+'를 이해하기 위한 공통 삽화',blurb=correct,source=source,locationSource=loc,fromTouristMap=True,pages=[f'<strong>{name}</strong>은 <strong>홍성군 {area}</strong>에서 만나는 이야기야. '+fact,'선생님이 보여 준 관광지도에서 이 이름을 찾아보렴. <strong>위치·주변 지형·사람들의 생활</strong>을 연결하면 우리 고장의 특징을 더 잘 설명할 수 있어.'],quiz=dict(question=question,options=options,answer=answer,hint=fact,explain=correct+'! 이름과 고장의 이야기를 함께 기억해 보자.'))
 if lon is not None:p.update(lon=lon,lat=lat)
 else:p.update(remote=True,locationNote='현재 지도 좌표 미확인. 관광지도 이야기에서 주소·내용만 제공하며 위치 표지는 표시하지 않음.');p['pages'].append('이 장소는 <strong>관광지도 이야기</strong>로 먼저 만나고 있어. 정확한 위치를 확인하기 전에는 탐방 지도에 표지를 찍지 않았어.')
 p.update(extra);entries.append(p)
add('jukdo','죽도','island',22786234,'서부면','천수만에 있는 섬으로, 대나무와 바다 풍경을 만날 수 있어. 표지는 죽도 안을 가리켜. 육지와 이어진 걸어가는 길은 없단다.','죽도를 소개하는 말은?','천수만에 있는 섬과 대나무 이야기',TOUR,locationNote='죽도 섬 영역의 공개 지도 중심점. 실제로는 배를 이용하는 섬.')
add('oseo','오서산 · 홍성 등산길','mountain',10553835056,'광천읍','오서산은 능선의 억새 풍경으로 알려져 있어. 홍성뿐 아니라 이웃 고장과 이어진 산이야. 이 표지는 홍성 쪽 정암사 부근 등산길을 나타내며 산 정상은 아니야.','산을 지도에서 살펴볼 때 기억할 것은?','산은 이웃 고장과 이어질 수 있어',TOUR,locationNote='홍성 쪽 정암사 부근 등산길의 대표 탐방점. 최고봉 좌표는 보령시이므로 홍성으로 표기하지 않음.')
add('jeongam','정암사','temple',10553835056,'광천읍','오서산 길에서 만나는 절이야. 산과 사찰이 어떤 위치 관계인지 관광지도에서 찾아보자.','정암사 주변의 자연환경은?','오서산과 이어지는 산길')
add('naewon','내원사','temple',1121118316,'장곡면','오서산의 장곡면 쪽에서 만나는 절이야. 광천읍 쪽 정암사와 위치를 비교하면 같은 산으로 향하는 여러 길을 알 수 있어.','두 사찰의 위치를 비교하면?','같은 산으로 향하는 여러 방향을 알 수 있어')
add('sangha','홍성 상하리미륵불','heritage',12648825766,'홍북읍','돌로 만든 불상을 통해 옛사람들의 조각과 믿음의 모습을 살펴볼 수 있어. 용봉산 주변의 다른 돌조각과도 비교해 보자.','돌로 남은 유산에서 살펴볼 것은?','옛사람들의 조각과 문화')
add('singyeong','신경리 마애여래입상','heritage',(126.65333,36.64944,'https://ko.wikipedia.org/wiki/홍성_신경리_마애여래입상'),'홍북읍','용봉산의 바위에 불상을 새긴 고려 시대 유산이야. 바위를 깎아 만든 얼굴과 옷의 선을 관찰할 수 있지.','마애불의 특징은?','바위에 새긴 옛 불상','https://encykorea.aks.ac.kr/Article/E0064176')
add('noeun','홍성 노은리 고택','oldhouse',(126.73472,36.64444,'https://ko.wikipedia.org/wiki/홍성_노은리_고택'),'홍북읍','성삼문의 외손 엄찬과 관련된 옛집이야. 마당과 지붕, 방의 배치를 보며 지금의 집과 다른 점을 찾아보자.','고택에서 비교해 볼 것은?','옛집과 오늘날 집의 공간','https://encykorea.aks.ac.kr/Article/E0064177',address='홍성군 홍북읍 최영장군길 11-26')
add('gyeolseong-wall','홍성 결성읍성','heritage',(126.5436028,36.5225889,'https://ko.wikipedia.org/wiki/홍성_결성읍성'),'결성면','석당산과 옛 결성 고장을 둘러싼 성의 흔적이야. 가까운 동헌·향교와 함께 보면 옛 고장의 모습을 떠올릴 수 있어.','읍성과 동헌을 함께 보는 까닭은?','옛 고장의 공간을 함께 이해하기 위해')
add('danggan','홍성 오관리 당간지주','heritage',(126.668028,36.603694,'https://ko.wikipedia.org/wiki/홍성_오관리_당간지주'),'홍성읍','옛 절에서 깃발을 매다는 장대를 받치던 돌기둥이야. 건물이 사라진 뒤에도 돌기둥이 장소의 옛 모습을 알려 줄 수 있단다.','당간지주가 알려 주는 것은?','이곳에 남은 옛 절의 흔적')
add('gujeol','구절암','temple',1268348530,'구항면','산길 가까이에 있는 절이야. 관광지도에서는 구절암과 거북이마을, 걷는 길이 가깝게 이어져 있단다.','지도에서 구절암과 연결해 살펴볼 것은?','주변 산길과 마을','https://tour.chungnam.go.kr/prog/trsrcn/kor/sub02_01_01/view.do?trsrcnNo=1252')
add('yanggok','양곡사','temple',12041115754,'서부면','한원진을 기리는 사당이야. 사당은 고장과 관련된 인물을 기억하는 장소가 될 수 있어.','양곡사와 연결되는 이야기는?','고장의 인물을 기억하는 문화')
add('baekwol','백월산','mountain',10127492713,'홍성읍','홍성읍과 구항면 주변에서 볼 수 있는 산이야. 산기슭의 마을과 길이 어떻게 자리 잡았는지 지도에서 찾아보렴.','백월산과 함께 살펴볼 것은?','산기슭의 마을과 길')
add('hongyang','홍양저수지','water',13916844,'금마면','농사에 필요한 물을 모아 두는 저수지야. 들판과 마을, 물길을 이어서 보면 저수지의 역할을 이해하기 쉬워.','저수지와 농사의 관계는?','필요한 물을 모아 농사를 도와요',locationNote='저수지 영역의 공개 지도 중심점. 물 위로 실제 보행을 안내하지 않음.')
add('cheolma','철마산 · 금마면','mountain',10251686408,'금마면','금마면의 산이야. 홍성에는 같은 철마산 이름을 쓰는 곳이 있어, 이름과 함께 읍·면을 확인하는 것이 중요해.','같은 이름의 장소를 구별하려면?','이름과 읍·면을 함께 확인해요')
add('gungri','궁리포구','harbor','궁리포구','서부면','천수만의 배와 바다 풍경을 만나는 포구야. 포구는 배가 드나들며 사람들의 일과 생활을 이어 주는 곳이지.','포구와 관련 있는 생활은?','배와 바다를 이용하는 사람들의 일')
add('sunset','홍성 명품낙조 · 남당노을전망대','viewpoint','남당노을전망대','서부면','바다 쪽으로 이어진 전망대에서 천수만의 해넘이를 살펴볼 수 있어. 노을은 건물이나 물건과 달리 시간에 따라 달라지는 풍경이야.','노을을 소개할 때 함께 말하면 좋은 것은?','바라본 장소와 시간','https://tour.chungnam.go.kr/prog/trsrcn/kor/sub02_01_01/view.do?trsrcnNo=1257')
add('fountain','남당항 해양분수공원','park','남당항 해양분수공원','서부면','남당항 주변에서 쉬며 바다를 바라보는 공원이야. 항구에는 배를 위한 시설뿐 아니라 사람들의 쉼터도 함께 있어.','항구 주변 공원의 역할은?','사람들이 쉬며 바다를 만나는 공간')
add('turtle','거북이마을','village','거북이마을','구항면','농촌의 생활과 오래된 나무, 마을 문화를 살펴볼 수 있어. 마을 이름에서 어떤 모습이 떠오르는지도 이야기해 보자.','체험마을에서 배울 수 있는 것은?','마을 사람들의 생활과 문화')
add('gwanggyeong','광경사지 석불좌상','heritage','광경사지 석불좌상','홍성읍','돌로 만든 앉은 불상이야. 돌조각의 자세와 모양을 살피며 옛 절과 고장의 이야기를 떠올려 보렴.','석불의 모습을 관찰하는 방법은?','재료와 자세, 모양을 살펴요')
add('kim-statue','김좌진장군 동상','memorial','김좌진장군동상','홍성읍','김좌진장군을 기억하는 동상이야. 동상과 갈산면의 생가지는 같은 인물을 소개하지만 장소의 종류와 위치가 다르지.','동상과 생가지를 비교하면?','같은 인물을 서로 다른 장소에서 기억해요')
add('dish-museum','한국식기박물관','museum',(126.7423027,36.49396445,'https://fre.clubrichtour.co.kr/bbs/board.php?bo_table=public_museum_artgr&wr_id=339'),'장곡면','옛 그릇과 식기의 변화를 통해 사람들이 먹고 생활한 모습을 배우는 박물관이야. 그릇도 생활의 역사를 알려 주는 자료란다.','박물관의 그릇이 알려 주는 것은?','사람들의 식생활과 그 변화','https://tour.chungnam.go.kr/prog/trsrcn/kor/sub02_01_01/view.do?trsrcnNo=1308',address='홍성군 장곡면 무한로 957-24')
# Clearly identified stories without reliable point coordinates stay off the map.
for id,name,symbol,area,fact,question,correct,address,source in [
 ('man hae','만해문학체험관','museum','결성면','만해 한용운의 문학과 삶을 배우는 공간이야. 시인의 글과 독립운동 이야기를 함께 살펴볼 수 있어.','문학체험관에서 만나는 것은?','한용운의 글과 삶','만해로318번길 83 일원','https://tour.chungnam.go.kr/prog/trsrcn/kor/sub02_01_02/view.do?trsrcnNo=147'),
 ('sawoon','홍성 사운고택','oldhouse','장곡면','조선 후기 집의 모습을 간직한 고택이야. 사랑채와 안채처럼 쓰임에 따라 나뉜 공간을 알아볼 수 있어.','옛집의 공간을 살펴보면?','옛사람들의 생활을 이해할 수 있어','홍남동로 989-22','https://digital.khs.go.kr/heri/heriDetail.do?ctptNo=1483401980000&ctptUid=13898859686741401786'),
 ('jang-gok-wall','홍성 장곡산성','heritage','장곡면','산성리의 산에 쌓은 성이야. 주변 산성들과 위치를 비교하며 산을 이용했던 옛사람들의 지혜를 생각해 보자.','산성을 산에 쌓은 이유를 생각하려면?','주변 지형과 위치를 살펴요','산성리','https://www.heritage.go.kr/heri/cul/culSelectDetail.do?ccbaCpno=3413403600000'),
 ('hakseong','학성산성','heritage','장곡면','장곡산성과 함께 관광지도에 표시된 옛 성의 흔적이야. 여러 산성이 서로 어느 방향에 있는지 찾아보자.','여러 산성을 지도에서 비교하면?','옛사람들이 이용한 산의 위치를 알아요','산성리',MAP),
 ('choe-chiwon','최치원선생 유적지','memorial','장곡면','옛 학자 최치원과 관련된 유적지야. 고장에 전해 오는 인물 이야기도 우리 지역을 소개하는 자료가 돼.','인물 유적을 살펴보는 까닭은?','고장에 전해 오는 인물 이야기를 알아요','월계리 289',MAP),
 ('iseo','이서 사당','temple','장곡면','이서를 기리는 사당이야. 인물의 이름과 사당이 있는 마을을 연결해 기억해 보렴.','사당은 어떤 역할을 할까?','관련 인물을 기억하고 기려요','지정리',MAP),
 ('hanseongjun','한성준선생 묘','memorial','갈산면','홍성 출신 전통예술인 한성준을 기억하는 장소야. 춤과 음악의 전통도 고장의 중요한 이야기란다.','한성준을 통해 살펴볼 문화는?','전통예술과 우리 고장의 관계','갈산면 일원',MAP),
 ('kim-bokhan','김복한선생 묘 · 추양사','memorial','서부면','고장을 위해 힘쓴 김복한을 기억하는 유적이야. 묘와 사당은 인물을 기리는 서로 다른 공간이란다.','묘와 사당의 공통점은?','관련 인물을 기억하는 장소예요','이호리',MAP),
 ('im-deugeui','임득의장군 묘 · 정충사','memorial','서부면','임득의장군을 기억하는 유적이야. 인물과 함께 유적이 남은 마을도 알아보자.','인물 유적을 소개할 때 필요한 것은?','인물 이름과 장소의 위치','판교리',MAP),
 ('galsan-pottery','갈산토기 · 옹기 이야기','craft','갈산면','흙을 빚고 구워 옹기를 만드는 전통을 만나는 곳이야. 그릇으로 남는 물건과 사람에게 이어지는 솜씨를 함께 생각해 보렴.','옹기 만들기에서 이어지는 것은?','그릇과 사람들의 전통 솜씨','갈산서길475번길 111',MAP),
 ('mundang','문당환경농업마을','village','홍동면','환경을 생각하는 농업과 마을의 협동을 배울 수 있어. 먹거리를 생산하는 농촌과 우리의 식탁을 연결해 보자.','환경농업마을에서 알아볼 것은?','농사와 환경, 마을의 협동','문당길 141',MAP),
 ('hanuri','하누리마을','village','광천읍','관광지도에 소개된 농촌체험마을이야. 농촌에는 논밭뿐 아니라 사람들이 함께 배우는 공간도 있어.','농촌체험마을에서 만나는 것은?','농촌의 생활과 배움','매현1길 2',MAP),
 ('asahang','어사항','harbor','서부면','천수만을 따라 이어지는 항구야. 남당항과 궁리포구의 위치를 비교하며 홍성의 해안을 찾아보자.','세 항구를 함께 보면?','홍성 해안을 따라 장소가 이어져요','어사리',MAP),
 ('gungri-park','궁리해상파크','park','서부면','궁리 주변의 바닷가 공간이야. 관광지도에서 포구와 해안 시설을 구별해 찾아보렴.','해안 지도를 읽는 방법은?','포구와 바다, 시설의 위치를 구별해요','궁리',MAP),
 ('gusan','구산사','temple','구항면','거북이마을 주변에 있는 사당이야. 오래된 나무와 사당처럼 마을 사람들이 기억해 온 장소를 살펴보자.','마을의 옛 장소가 알려 주는 것은?','마을이 이어 온 기억과 문화','내현리',MAP),
 ('hansung-surname','홍가신선생 묘','memorial','구항면','홍가신과 관련된 인물 유적이야. 관광지도에서는 인물을 기억하는 여러 장소를 찾을 수 있어.','관광지도에서 인물 이름을 찾으면?','고장과 관련된 사람들을 알 수 있어','구항면 일원',MAP),
 ('galsan-market','갈산시장','market','갈산면','갈산면 주민들의 장보기와 만남이 이어지는 시장이야. 시장은 물건뿐 아니라 생활 이야기가 모이는 장소지.','시장을 통해 알 수 있는 것은?','주민들의 생활과 교류','상촌리',MAP),
 ('naepo-trail','내포문화숲길','trail','홍북읍','숲과 여러 마을, 문화유산을 이어 걷는 길이야. 하나의 건물 대신 길을 따라 만나는 장소들을 소개할 수 있지.','숲길을 소개하는 방법은?','이어지는 마을과 문화유산을 함께 말해요','홍성군 여러 읍·면',MAP),
 ('serohae-trail','서해랑길 63코스','trail','서부면','홍성의 해안을 따라 이어지는 걷는 길이야. 관광지도에서 바다와 항구, 해넘이 장소를 차례로 찾아보자.','해안길에서 연결되는 장소는?','바다와 항구, 해넘이 풍경','서부면 해안 일원',MAP),
]:add(id.replace(' ',''),name,symbol,None,area,fact,question,correct,source,address='홍성군 '+area+' '+address)
# Coordinates independently checked against published source and district polygons.
verified={
 'tourmap-jang-gok-wall':(126.73111,36.49333,'https://ko.wikipedia.org/wiki/홍성_장곡산성'),
 'tourmap-im-deugeui':(126.52444,36.55139,'https://ko.wikipedia.org/wiki/홍성_임득의_장군_묘')
}
for p in entries:
 if p['id'] not in verified:continue
 p['lon'],p['lat'],p['locationSource']=verified[p['id']];p.pop('remote',None);p['locationNote']='공개 문화유산 좌표. 실제 출입구나 보행 경로를 뜻하지 않음.';p['pages']=[v for v in p['pages'] if '정확한 위치를 확인하기 전'not in v]
(OUT/'tourist-map-places.js').write_text('export const TOURIST_MAP_PLACES='+json.dumps(entries,ensure_ascii=False,indent=2)+';\n')
(OUT/'assets/tourist-map-reconciliation.json').write_text(json.dumps({'map':'홍성 관광지도, 2022년 11월, 사용자 제공','ignored':['폐교 표기 학교','우측 하단 음식점 명단'],'checkedAt':'2026-09-09','addedMarkers':sum(not p.get('remote') for p in entries),'storiesWithoutVerifiedCoordinates':sum(p.get('remote',False) for p in entries),'entries':[{k:p.get(k)for k in ['id','name','area','address','lon','lat','remote','source','locationSource','locationNote']}for p in entries]},ensure_ascii=False,indent=2))
print('tourist map additions',len(entries),'markers',sum(not p.get('remote') for p in entries))
