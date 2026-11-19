# 3D 내포 시험판 (버리는 코드)

홍성 탐험대를 3D로 옮길 때 그래픽, 조작감, 성능이 어떨지 미리 보기 위한 시험판이다. 게임 본체(`dist/`)는 건드리지 않는다.

- 범위: 내포신도시와 용봉산 일대 약 7.2 km × 6.3 km. 나머지 군 지역은 게임의 전체 지도 그림을 평면으로 깔았다.
- 자료: 게임의 `dist/map-county.json`(OSM 도로·물길·토지이용·건물), 장소 좌표(`dist/content.js`), Terrarium 고도 타일(게임이 이미 출처로 밝힌 자료)을 그대로 쓴다.
- 그래픽: Three.js r170, pokju-edu의 하늘 셰이더(`src/shaders/sky.frag`)와 색 보정(`src/shaders/grade.frag`), 빛 번짐, ACES 톤 매핑, 화질 자동 단계, WebGL 문맥 손실 안내.
- 차량: pokju-edu의 실제 차량 모델(돌핀)을 GLB로 내보내 그대로 쓴다. 비행기 두 대(느린 비행기 ×4, 비행기 ×16)는 기본 도형으로 만들었고, 느린 비행기는 프로펠러 없이 둔다.
- 탐험가: 게임의 8방향 × 4프레임 걷기 그림을 카메라를 향하는 판으로 세웠다.
- 건물: 게임 지도의 건물 55채에 `data/naepo-buildings.geojson`(overpass-turbo에서 내보낸 OSM 건물, ODbL)의 423채를 더해 실제 건물 478채. 층수 자료가 없어 높이는 건물 종류별로 정했다.
- 장식: 실제 건물이 거의 없는 주거·상업지의 아파트·집, 경사지와 공원의 나무는 분위기를 위한 장식이다.
- 가로등: 시내(건물 200 m 안) 큰길에만, 보도 쪽에 양쪽으로 엇갈려 34~44 m마다 세운다. 교차로 모퉁이, 중앙분리대, 다른 길, 건물, 물, 숲 언덕은 피한다. 받침·가늘어지는 기둥·도로 쪽으로 휜 팔·납작한 LED 등머리로 만들고, 노을과 밤에는 도로에 빛이 떨어진다. 실제 가로등 위치 자료는 아니다.
- 크기와 속도: 소축척 지도처럼 한 화면에 넓은 지역이 보이도록 카메라를 멀리 두고, 탐험가(키 24 m)와 탈것을 실제보다 크게 만들었다. 속도는 2D 게임과 같다(걷기 초속 78 m, 자동차·느린 비행기 312 m, 비행기 1,248 m).
- 카메라: 화면을 끌면 돌리고 위아래로 기울이며, 두 손가락이나 휠로 확대·축소한다. 오른쪽 버튼(+, −, ∧, ∨)도 있다. 건물이 탐험가를 가리면 그 부분에 구멍이 뚫린다.
- 자동차 조작: 도로 그래프를 따라 오른쪽 차선을 지키며 굽은 길도 알아서 달린다. 위는 가속, 아래는 브레이크이고, 멈춘 채 아래를 누르고 있으면 차를 돌린다. 좌우는 다음 갈림길에서 좌회전·우회전을 예약한다(그 방향 길이 있는 갈림길까지 유지). "비스듬히" 카메라에서는 가고 싶은 길 쪽으로 조이스틱을 밀면 그 길로 든다. 화면을 탭하면 길을 찾아 그곳까지 간다(A*, 일방통행 역방향은 비용을 높임).
- 비행기 조작: "뒤따라" 카메라에서는 좌우가 방향, 위가 가속, 아래가 감속이다. "비스듬히" 카메라에서는 조이스틱 방향으로 돌되, 뒤쪽을 가리키면 감속한다.
- 건물 충돌: 걷기와 자동차는 건물을 통과하지 못하고 벽을 따라 미끄러진다. 비행기는 건물 위로 난다. 장소가 건물 안에 있으면 그 건물 벽에 닿았을 때 도착으로 친다.

`data/county-buildings.geojson`은 홍성군 전체 OSM 건물 2,075채(overpass-turbo 내보내기)로, 군 전체로 넓힐 때 쓴다. 지금 시험판은 내포 파일만 읽는다.

## 다시 만들기

```bash
npm install                      # three@0.170.0 (로컬 확인용)
python3 tools/prepare.py         # build/data.json(data/naepo-buildings.geojson 포함), 걷기 그림, 고도 타일 캐시
node tools/build.mjs             # build/naepo-3d.html (아티팩트용 본문), build/local.html
```

pokju 차량 모델(`build/pokju-car.glb`)은 pokju-edu 사본에서 만든다. 사본의 `tools/build.mjs` 머리에 `GLTFExporter`를 import하고 `PARTS`의 `part_cartail.js` 뒤에 `tools/pokju-export/zz_export.js`를 끼워 빌드한 뒤, `node tools/pokju-export/export-car.cjs <사본>/index.html build dolphin`을 실행해 나온 `dolphin.glb`를 `build/pokju-car.glb`로 옮긴다. 원본 pokju-edu 저장소는 고치지 않는다.

`build/local.html`은 `three`를 jsDelivr에서 받는다. 인터넷이 막힌 곳에서는 Playwright의 `page.route`로 `node_modules/three`를 대신 내준다.
