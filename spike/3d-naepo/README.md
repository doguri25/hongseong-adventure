# 3D 내포 시험판 (버리는 코드)

홍성 탐험대를 3D로 옮길 때 그래픽, 조작감, 성능이 어떨지 미리 보기 위한 시험판이다. 게임 본체(`dist/`)는 건드리지 않는다.

- 범위: 내포신도시와 용봉산 일대 약 7.2 km × 6.3 km. 나머지 군 지역은 게임의 전체 지도 그림을 평면으로 깔았다.
- 자료: 게임의 `dist/map-county.json`(OSM 도로·물길·토지이용·건물), 장소 좌표(`dist/content.js`), Terrarium 고도 타일(게임이 이미 출처로 밝힌 자료)을 그대로 쓴다.
- 그래픽: Three.js r170, pokju-edu의 하늘 셰이더(`src/shaders/sky.frag`)와 색 보정(`src/shaders/grade.frag`), 빛 번짐, ACES 톤 매핑, 화질 자동 단계, WebGL 문맥 손실 안내.
- 차량: pokju-edu의 실제 차량 모델(돌핀)을 GLB로 내보내 그대로 쓴다. 비행기 두 대(느린 비행기 ×4, 비행기 ×16)는 기본 도형으로 만들었다.
- 탐험가: 게임의 8방향 × 4프레임 걷기 그림을 카메라를 향하는 판으로 세웠다.
- 장식: 실제 건물 자료가 없는 주거·상업지의 아파트·집, 경사지와 공원의 나무, 큰길의 가로등은 분위기를 위한 장식이다.

## 다시 만들기

```bash
npm install                      # three@0.170.0 (로컬 확인용)
python3 tools/prepare.py         # build/data.json, 걷기 그림, 고도 타일 캐시
node tools/build.mjs             # build/naepo-3d.html (아티팩트용 본문), build/local.html
```

pokju 차량 모델(`build/pokju-car.glb`)은 pokju-edu 사본에서 만든다. 사본의 `tools/build.mjs` 머리에 `GLTFExporter`를 import하고 `PARTS`의 `part_cartail.js` 뒤에 `tools/pokju-export/zz_export.js`를 끼워 빌드한 뒤, `node tools/pokju-export/export-car.cjs <사본>/index.html build dolphin`을 실행해 나온 `dolphin.glb`를 `build/pokju-car.glb`로 옮긴다. 원본 pokju-edu 저장소는 고치지 않는다.

`build/local.html`은 `three`를 jsDelivr에서 받는다. 인터넷이 막힌 곳에서는 Playwright의 `page.route`로 `node_modules/three`를 대신 내준다.
