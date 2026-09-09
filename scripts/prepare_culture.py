"""Curated, source-linked Hongseong learning places; coordinates are never fictional addresses."""
import json,sys
from pathlib import Path
SRC=Path(sys.argv[1]);OUT=Path(sys.argv[2]);OLD=SRC.parent/'geodata-v3'
osm={str(e['id']):e for fn in [OLD/'culture.json',SRC/'tourism-osm.json'] for e in json.loads(fn.read_text())['elements']}
districts=json.loads((OUT/'county-boundaries.json').read_text())['districts']
def ring(p,r):
 inside=False;j=len(r)-1
 for i,a in enumerate(r):
  b=r[j]
  if (a[1]>p[1])!=(b[1]>p[1]) and p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]:inside=not inside
  j=i
 return inside
def district(p):
 for d in districts:
  g=d['geometry'];polys=g['coordinates'] if g['type']=='MultiPolygon' else [g['coordinates']]
  if any(ring(p,rs[0])and not any(ring(p,h)for h in rs[1:])for rs in polys):return d
 raise ValueError(p)
TOUR='https://hongju.or.kr/home/content.do?menu_cd=000098'
ENCY='https://encykorea.aks.ac.kr/Article/E0064168'
entries=[]
def add(id,name,symbol,coord,blurb,fact,question,correct,wrong,source=None,**extra):
 if isinstance(coord,int):
  e=osm[str(coord)];c=e.get('center',e);lon,lat=c['lon'],c['lat'];loc='https://www.openstreetmap.org/'+e['type']+'/'+str(e['id'])
 else:lon,lat,loc=coord
 d=district([lon,lat]);assert d['county']=='홍성군' or id=='architecture',(name,d['county'],d['name'])
 typ='daily'if symbol=='cafe'else'nature'if symbol in ['park','forest','garden','viewpoint']else'public'if symbol=='market'else'intangible'if symbol in ['festival','specialty','food']else'heritage'
 coins=10 if typ=='daily'else 40 if symbol=='park'else 60 if symbol=='market'else 80 if typ in ['nature','intangible']else 100
 image='cafe'if symbol=='cafe'else'forest'if typ=='nature'else'market'if symbol in ['market','food']else'specialty'if symbol=='specialty'else'festival'if symbol=='festival'else'museum'
 answer=len(entries)%3;options=wrong[:];options.insert(answer,correct)
 categories={'birthplace':'인물 생가지','heritage':'성곽·성문','historicSchool':'향교','memorial':'기념비·추모 유적','temple':'사찰·사당','oldoffice':'옛 관아·정자','museum':'박물관·전시관','gallery':'미술관','festival':'축제·행사','specialty':'지역특산물','food':'지역 먹거리','market':'전통시장','cafe':'카페','park':'공원','forest':'자연휴양림','garden':'수목원','viewpoint':'전망대'}
 p={'id':'culture-'+id,'name':name,'short':name,'symbol':symbol,'lon':lon,'lat':lat,'county':d['county'],'area':d['county']+' '+d['name'],'region':'county','category':categories[symbol],'type':typ,'coins':coins,'xp':coins*3//2,'image':'assets/'+image+'-generic-illustration.webp','caption':categories[symbol]+'의 역할을 표현한 공통 삽화','blurb':blurb,'source':source or loc,'locationSource':loc,'pages':[f'여기는 <strong>{name}</strong>이야. <strong>{d["county"]} {d["name"]}</strong>에서 만날 수 있어. '+fact,'지도에서 이곳의 위치와 주변 모습을 살펴보자. <strong>이름·위치·특징</strong>을 연결하면 우리 고장을 더 알기 쉽게 소개할 수 있어. 너는 이곳의 어떤 점을 친구에게 알려 주고 싶니?'],'quiz':{'question':question,'options':options,'answer':answer,'hint':blurb+'이라는 점을 떠올려 보렴.','explain':correct+'. 장소의 특징을 알고 소개하면 더 잘 기억할 수 있어.'}}
 if symbol=='festival':p['pages'].append('이 표시는 <strong>축제가 열리는 대표 장소</strong>를 뜻해. 매일 행사가 열리는 것은 아니야. 개최 여부·기간·세부 행사장은 해마다 공식 안내를 확인해야 해.');p['locationNote']='대표 행사 지역에 둔 학습 지점. 현재 개최 여부나 부스 위치를 뜻하지 않음.'
 if symbol in ['specialty','food']:p['pages'].append('이곳은 <strong>지역의 먹거리 문화를 소개하는 학습 지점</strong>이야. 특정 가게 한 곳을 뜻하지는 않아. 먹거리가 만들어지고 이웃에게 전해지는 과정도 우리 고장의 이야기란다.');p['locationNote']='관련 생산·판매 지역의 대표 학습 지점. 특정 점포 좌표가 아님.'
 p.update(extra);entries.append(p);return p
B=['내일 날씨를 정확히 알 수 있어','모든 고장이 똑같다는 것을 알 수 있어']
add('kim','김좌진장군 생가지','birthplace',527184273,'독립운동가의 삶을 기억하는 곳','김좌진은 우리나라의 독립을 위해 힘쓴 인물이야. 생가지에서는 인물이 태어난 곳과 그 삶의 이야기를 함께 살펴볼 수 있어.','생가지에서 알아볼 수 있는 것은?','고장과 관련된 인물의 삶',B,TOUR,photo='kim-jwajin-birthplace',image='assets/kim-jwajin-birthplace.webp',caption='복원된 김좌진장군 생가지 · 2023년 사진')
add('han','한용운선생 생가지','birthplace',1204318244,'독립과 문학의 이야기를 만나는 곳','한용운은 독립운동가이자 시인이야. 이 일대에는 생가지와 그의 삶을 기억하는 공간이 있어.','한용운선생 생가지를 소개할 때 알맞은 것은?','독립운동과 문학에 힘쓴 인물의 고장이에요',B,TOUR,address='홍성군 결성면 만해로318번길 83',locationNote='생가지 역사문화공원 영역의 지도 중심점')
add('seong','성삼문선생 유허비','memorial',12750005304,'역사인물의 흔적을 기억하는 비석','유허는 옛사람의 자취가 남은 곳을 뜻해. 성삼문과 관련된 장소를 비석으로 기억하고 있단다.','유허비를 보며 알아볼 것은?','이 장소와 관련된 옛 인물의 이야기',B,TOUR)
add('choe','최영장군 사당','temple',1376994768,'고려 시대 인물을 기억하는 사당','사당은 인물을 기리고 기억하는 공간이야. 이곳에서는 최영장군과 우리 고장의 관계를 생각해 볼 수 있어.','사당의 역할은 무엇일까?','관련 인물을 기리고 기억해요',['기차를 정비해요','생활 물건을 팔아요'],ENCY)
add('uisachong','홍성 홍주의사총','memorial',527187468,'나라를 지키려 한 사람들을 기억하는 곳','홍주의사총은 나라를 지키려고 힘쓴 의병들을 기억하는 유적이야. 사진은 경내에 있는 창의사 건물이란다.','홍주의사총에서 가져야 할 마음은?','고장을 지키려 한 사람들을 기억해요',['물건을 흥정해요','공놀이 시합을 해요'],TOUR,photo='hongju-uisachong',image='assets/hongju-uisachong.webp',caption='홍주의사총 경내 창의사 · 2017년 사진')
add('gyeolseong-office','결성동헌','oldoffice',469594285,'옛 고장의 일을 맡아보던 관청','동헌은 옛날 지방의 일을 맡은 관리가 업무를 보던 건물이야. 오늘의 행정복지센터와 어떤 점이 닮았을까?','결성동헌은 어떤 곳이었을까?','옛날 고장의 일을 맡아보던 관청',['새로 만든 대형 마트','바다 생물을 기르는 수족관'],ENCY)
add('gyeolseong-school','결성향교','historicSchool',469594615,'옛사람들의 배움과 예절이 남은 곳','향교는 옛날 지역에서 배움을 이어 가고 성현을 기리던 곳이야. 지금의 학교와 모습이 어떻게 다른지 생각해 보자.','향교와 관련된 활동은?','옛사람들의 배움과 예절',['비행기 정비','영화표 판매'],ENCY)
add('hongju-school','홍주향교','historicSchool',(126.665639,36.609417,'https://ko.wikipedia.org/wiki/홍주향교'),'홍성읍에 남아 있는 옛 배움터','우리 고장에는 옛 배움터인 홍주향교가 남아 있어. 오늘날 학교와 비교하면 생활 모습의 변화를 살펴볼 수 있지.','홍주향교와 오늘날 학교를 비교하면?','옛날과 오늘의 배움터 모습을 살펴볼 수 있어',['두 곳은 하는 일이 전혀 없어요','주소를 알 필요가 없어요'],ENCY)
add('honghwamun','홍화문','heritage',12701618182,'홍주읍성의 남쪽 성문','홍화문은 홍주읍성의 남쪽 문이야. 동쪽의 조양문과 위치를 비교하면 성곽의 방향을 이해하기 쉬워.','홍화문과 조양문을 함께 살펴보면?','성문의 이름과 방향을 비교할 수 있어',['바닷물의 맛을 알 수 있어','버스 시간표가 저절로 보여'],TOUR)
add('yeohajeong','여하정','oldoffice',10066768350,'옛 관아 곁의 정자','여하정은 홍성읍 옛 관아 주변에 있는 정자야. 건물뿐 아니라 나무와 물, 주변 공간도 함께 관찰해 보렴.','정자를 소개할 때 함께 살펴볼 것은?','건물의 모습과 주변 풍경',['내일의 시험 답','모든 사람의 이름'],ENCY)
add('yongbongsa','용봉사','temple',1268342789,'용봉산에서 만나는 역사 공간','용봉산에는 숲과 바위뿐 아니라 용봉사와 같은 역사 공간도 있어. 한 장소에서 자연과 문화의 특징을 함께 찾을 수 있단다.','용봉산에서 찾을 수 있는 모습은?','자연경관과 역사 공간',['바다만 있어요','가게만 있어요'],TOUR)
add('gosansa','고산사','temple',1204318255,'고장의 오래된 건축 문화를 만나는 사찰','고산사는 홍성에 있는 사찰이야. 건물의 지붕과 기둥을 관찰하며 우리 고장에 남은 건축 문화를 생각해 보자.','오래된 건물을 관찰할 때 알맞은 것은?','지붕과 기둥의 모습을 살펴봐요',['건물에 낙서를 해요','마음대로 조각을 떼어 가요'],ENCY)
add('hongju-museum','홍주성역사관','museum',1371067023,'홍성의 옛이야기와 자료를 만나는 곳','이곳은 홍성의 역사를 알아볼 수 있는 전시 공간이야. 옛 물건과 설명을 함께 살펴보면 과거의 생활을 이해하기 쉬워.','역사관의 전시 자료는 무엇을 도울까?','우리 고장의 옛 생활을 이해해요',['은행 통장을 만들어요','학교에 입학해요'],'https://www.chungnam.go.kr/cnportal/media/article/view.do?articleNo=MD0003278432&menuNo=500168',address='홍성군 홍성읍 아문길 20')
add('goam','고암이응노생가기념관','gallery',(126.6316666,36.62232225,'https://cht.clubrichtour.co.kr/bbs/board.php?bo_table=public_museum_artgr&wr_id=813'),'고장에서 태어난 화가의 예술 이야기','이응노는 홍성에서 태어난 화가야. 생가기념관에서는 고장과 예술가의 이야기를 연결해 볼 수 있어.','이응노생가기념관은 무엇과 관련될까?','우리 고장에서 태어난 화가와 예술',['항구의 어선 수리','우편물 배달'],'https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=acab7c3e-68b9-48eb-aabb-d33ee2dd9e7f',address='홍성군 홍북읍 이응노로 61-7')
add('architecture','한국고건축박물관','museum',368734299,'옛 건축물을 살펴보는 박물관','고건축은 옛 건축물을 뜻해. 옛 건물의 짜임과 모습을 살펴보면 집을 짓던 지혜를 생각해 볼 수 있단다.','고건축박물관에서 관심 있게 볼 것은?','옛 건물의 모습과 짜임',['새 자동차의 속도','일기예보 시간표'])
add('folk-museum','홍성민속테마박물관','museum',1268348517,'옛 생활 도구를 통해 고장을 알아보는 곳','민속은 사람들이 살아오며 이어 온 생활과 풍습이야. 생활 도구를 보며 지금 쓰는 물건과 비교해 보자.','옛 생활 도구를 보는 까닭은?','사람들이 어떻게 살아왔는지 알아보려고',['새 물건만 살 수 있어서','장소 이름을 지우려고'])
market1=add('gwangcheon-market','광천전통시장','market',(126.62495961773163,36.50062846753316,'https://access.visitkorea.or.kr/ms/detail.do?cotId=79f6fe32-fdaa-403b-960b-352b908ff57b'),'광천의 먹거리와 이웃이 모이는 시장','광천전통시장에서는 새우젓과 김을 비롯한 여러 물건을 만날 수 있어. 시장에서 파는 물건은 고장의 특징을 알려 주기도 해.','광천전통시장에서 지역의 특징을 찾으려면?','새우젓과 김 같은 물건을 살펴봐요',['간판의 크기만 재요','물건 이름은 보지 않아요'],'https://access.visitkorea.or.kr/ms/detail.do?cotId=79f6fe32-fdaa-403b-960b-352b908ff57b',address='홍성군 광천읍 광천로285번길 8-16')
market2=add('hongseong-market','홍성전통시장','market',(126.668023,36.602151,'https://kor.clubrichtour.co.kr/bbs/board.php?bo_table=public_trdit_mrkt&wr_id=973'),'먹거리와 생활 물건을 사고파는 전통시장','여러 가게가 모여 있는 시장은 물건을 사고팔고 이웃을 만나는 곳이야. 마트와 어떤 점이 비슷하고 다른지 비교해 보자.','시장과 마트의 공통점은?','생활에 필요한 물건을 구해요',['읍의 행정 업무를 해요','대학생이 수업을 받아요'],'https://alldam.chungnam.go.kr/index.chungnam?menuCd=DOM_000000201001001001&publicdatapk=15144551')
# Festival markers reuse verified venue coordinates, never fabricated stall locations.
venues={'hongju':1371067023,'gwangcheon':(market1['lon'],market1['lat'],market1['locationSource']),'namdang':(126.47125,36.53865,TOUR)}
for id,name,venue,summary,correct,source in [
 ('history-fest','홍성역사인물축제 · 홍주읍성','hongju','홍성의 역사인물을 이야기와 체험으로 만나는 축제야.','고장의 역사인물과 이야기를 나눠요','https://hongju.or.kr/home/content.do?menu_cd=000116'),
 ('bbq-fest','홍성글로벌바비큐페스티벌 · 홍주읍성','hongju','고장의 축산물과 다양한 음식 문화를 만나는 축제야.','고장의 먹거리 문화를 경험해요','https://hongju.or.kr/home/content.do?menu_cd=000064'),
 ('night-fest','홍성 국가유산 야행 · 홍주읍성','hongju','밤에 국가유산의 이야기와 문화를 만나는 행사야.','고장의 국가유산을 알아봐요','https://hongju.or.kr/home/content.do?menu_cd=000164'),
 ('gwangcheon-fest','광천조미김·토굴새우젓 대축제','gwangcheon','광천의 대표 특산물인 김과 새우젓을 주제로 사람들이 모이는 축제야.','광천의 김과 새우젓을 알 수 있어요','https://www.asan.go.kr/town/dunpo/board/?m_mode=view&pds_no=2025101609082430793&tb_nm=notice'),
 ('prawn-fest','남당항 대하축제','namdang','남당항의 먹거리 문화를 만나는 축제야. 항구와 음식이 지역 이야기를 만들어 내지.','항구와 지역 먹거리의 관계를 알아봐요','https://korean.visitkorea.or.kr/kfes/detail/fstvlDetail.do?cmsCntntsId=140911'),
 ('cockle-fest','남당항 새조개축제','namdang','남당항의 새조개와 먹거리 문화를 만나는 축제야.','지역의 제철 먹거리 문화를 알아봐요','https://korean.visitkorea.or.kr/kfes/detail/fstvlDetail.do?fstvlCntntsId=86e5f381-79ef-4581-8676-a1e5b1610f35')]:
 add(id,name,'festival',venues[venue],'고장의 특징을 함께 나누는 축제',summary,'이 축제에서 알 수 있는 고장의 모습은?',correct,['어느 고장이나 똑같은 모습뿐이에요','건물의 높이만 알 수 있어요'],source)
for id,name,symbol,point,summary,correct in [
 ('shrimp','광천 토굴새우젓 · 토굴마을','specialty',(126.615611,36.485253,'https://data.star365.site/p/지역/충남-가볼만한곳'),'광천은 토굴에서 숙성하는 새우젓으로 알려져 있어. 지역의 환경과 사람들의 지혜가 먹거리에 담겨 있지.','고장의 환경과 먹거리의 관계'),
 ('seaweed','광천김 · 전통시장','specialty',venues['gwangcheon'],'광천김은 홍성을 대표하는 특산물 중 하나야. 특산물은 어떤 고장에서 특히 잘 알려진 물건이나 먹거리란다.','우리 고장을 대표하는 특산물'),
 ('beef','홍성한우 · 전통시장','food',(market2['lon'],market2['lat'],market2['locationSource']),'홍성한우와 한우구이는 홍성을 소개하는 대표 먹거리야. 음식에도 생산과 판매를 맡는 여러 사람의 일이 담겨 있어.','고장의 대표 먹거리와 사람들의 일'),
 ('prawn','남당항 대하구이','food',venues['namdang'],'남당항은 대하구이로 알려져 있어. 바다와 가까운 곳의 먹거리는 내륙의 먹거리와 어떻게 다를까?','바다와 고장 먹거리의 관계'),
 ('cockle','남당항 새조개 샤브샤브','food',venues['namdang'],'새조개 샤브샤브는 홍성을 소개할 때 등장하는 대표 음식이야. 같은 항구에서도 다양한 먹거리를 만날 수 있지.','홍성의 다양한 지역 음식'),
 ('organic','홍동 친환경농업 이야기','specialty',1362803213,'홍성의 친환경농산물도 고장의 자랑거리야. 홍동면의 마을과 들판을 떠올리며 농업이 우리 생활을 어떻게 돕는지 이야기해 보자.','농업과 우리 생활의 관계')]:
 add(id,name,symbol,point,'고장과 먹거리가 이어지는 이야기',summary,'이 먹거리 이야기에서 알아볼 것은?',correct,B,TOUR)
# Neighborhood parks: exact OSM names, county checked by boundary polygons.
for i in [527186743,527187543,527389412,660157106,890918436,890918442,890918509,890918510,1188029710,1319376400,1319376408,1362803212,1362803213,1473474808]:
 name=osm[str(i)]['tags']['name']
 add('park-'+str(i),name,'park',i,'이웃과 쉬며 주변을 살펴보는 공원','공원에서는 쉬거나 산책하며 이웃과 시간을 보낼 수 있어. 네가 자주 가는 공원과 주변 건물, 물길을 비교해 볼까?','공원을 소개하는 알맞은 방법은?','이름과 위치, 기억에 남는 모습을 말해요',['주소와 이름은 모두 빼요','친구들의 경험은 듣지 않아요'])
add('forest','용봉산자연휴양림','forest',1268342742,'숲에서 쉬며 자연을 만나는 곳','자연휴양림은 숲을 느끼고 쉬어 가는 공간이야. 산 자체와 휴양림 시설은 구별해서 소개하면 좋아.','자연휴양림의 특징은?','숲에서 쉬며 자연을 만날 수 있어',['예금을 맡기는 곳이야','우편물을 분류하는 곳이야'],'https://www.foresttrip.go.kr/indvz/main.do?hmpgId=ID02030080',address='홍성군 홍북읍 용봉산2길 87')
for id,name,point in [('skytower','홍성스카이타워',1473474821),('sokdong','속동전망대',13518318008)]:
 add(id,name,'viewpoint',point,'천수만과 해안 풍경을 살펴보는 곳','바다와 해안을 내려다보며 홍성의 자연환경을 살펴볼 수 있어. 지도에서는 바다, 육지, 섬이 어떻게 표시되었는지 찾아보자.','해안 전망대에서 관심 있게 볼 것은?','바다와 육지, 섬의 모습',['학교의 시간표','가게의 계산기'],'https://tour.chungnam.go.kr/prog/trsrcn/kor/sub02_01_01/view.do?trsrcnNo=1263')
for id,name,point,original,address in [
 ('starbucks','스타0스 충남도청점',(126.6814393,36.657045,'https://www.diningcode.com/profile.php?rid=vT1OgauURYY0'),'스타벅스 충남도청점','홍성군 홍북읍 청사로150번길 24'),
 ('blossom','블0썸 카페',11804206867,'BLOSSOM',''),
 ('jigu','지구에서 0뿐',12617766694,'지구에서 너뿐',''),
 ('cassettorado','까세0라도',12617790250,'까세토라도',''),
 ('millcafe','방앗간0카페',12617795519,'방앗간옆카페','')]:
 add(id,name,'cafe',point,'음료를 고르거나 쉬며 이야기를 나누는 가게','카페는 음료나 간식을 고르고 쉬어 가는 일상 가게야. 사람들이 자주 이용하는 가게도 우리 고장의 모습을 이루지.','카페도 우리 고장을 소개하는 장소가 될까?','일상생활과 경험이 담겨 있어 소개할 수 있어',['유적지만 소개할 수 있어','큰 건물만 소개할 수 있어'],originalName=original,address=address,store=True)
add('gyeolseong-museum','결성농요농사박물관','museum',(126.5489682,36.53262623,'https://kor.clubrichtour.co.kr/bbs/board.php?bo_table=public_museum_artgr&wr_id=1584'),'농사 도구와 결성농요를 함께 알아보는 곳','농사에 쓰던 도구와 결성농요의 이야기를 통해 옛 농촌 생활을 알아볼 수 있어. 물건으로 남은 도구와 사람에게 전해지는 노래는 서로 다른 방식으로 문화를 이어 가지.','농사 도구와 결성농요의 공통점은?','옛 농촌의 생활을 알려 줘요',['둘 다 새로 만든 휴대전화예요','고장과 아무 관계가 없어요'],'https://tour.chungnam.go.kr/prog/trsrcn/kor/sub02_01_02/view.do?trsrcnNo=1284',address='홍성군 결성면 구성남로 91')
add('garden','그림같은 수목원','garden',(126.62974,36.519584,'https://data.star365.site/p/지역/충남-가볼만한곳'),'여러 식물과 정원을 살펴보는 곳','수목원은 여러 종류의 나무와 식물을 살펴보는 공간이야. 이름표와 잎의 모양을 보며 식물마다 다른 특징을 찾아볼 수 있어.','수목원에서 살펴볼 것은?','여러 나무와 식물의 특징',['열차 출발 시간','은행의 예금 통장'],'https://tour.chungnam.go.kr/prog/trsrcn/kor/sub02_01_01/view.do?trsrcnNo=1254',address='홍성군 광천읍 충서로400번길 102-36')
# Keep curatorial metadata separate from original lesson copy.
(OUT/'culture.js').write_text('// Original grade-3 explanations; researched locations and representative cultural learning points.\nexport const CULTURE_PLACES = '+json.dumps(entries,ensure_ascii=False,indent=2)+';\n')
metadata={'retrieved':'2026-09-09','coordinateNote':'OSM mapped points/area centers or linked published coordinates. Festival/food markers explicitly use representative venue coordinates, not stalls or individual businesses.','osmLicense':'ODbL 1.0','places':[{k:p[k]for k in ['id','name','symbol','lon','lat','area','source','locationSource','locationNote','originalName','address']if k in p}for p in entries]}
(OUT/'assets/culture-location-sources.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2))
print('Added',len(entries),'places');print({k:sum(p['symbol']==k for p in entries)for k in sorted(set(p['symbol']for p in entries))})
