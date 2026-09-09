export const RELEASE={version:'1.3.2',date:'2026-09-09',creator:'도구리',organization:'홍북초등학교',email:'raccoon@ai.cne.go.kr',changes:[
 '충남도서관 길잡이는 안경을 쓰고 책을 든 남색 옷의 모습으로 바뀌었어요. 근처 초록 조끼 길잡이와 쉽게 구분할 수 있어요.',
 '전체 지도 아래에 지역 목록을 한 줄에 한 지역씩 세로로 보여 줘요.',
 '전체 지도 창의 내용이 옆으로 넘어가 잘리는 문제를 고쳤어요. 아래로 스크롤해서 끝까지 볼 수 있어요.',
 '땅·풀·논밭·마당에 재질을 더하고, 바다와 저수지의 물빛·해안선을 다듬었어요.',
 '건물의 지붕·벽·그림자를 구분하고 공원과 숲에 나무·꽃·벤치를 더했어요.',
 '장식은 길·물·건물과 장소·NPC 주변을 피해서 놓았어요.',
 '비행기만 공중에 떠 있어요. 걷기·자전거·자동차·슈퍼카는 발과 바퀴가 땅에 닿아요.',
 '기본·남자·라쿤에 8방향, 방향마다 네 장의 걷기 그림을 넣었어요. 멈추면 동작도 멈춰요.',
 'NPC 대화가 주변 장소 안내에 가려지는 문제와 두 손가락 터치 뒤 장소가 잘못 선택되는 문제를 고쳤어요.',
 '궁리포구는 지상 이동으로 가까운 육지 지점에 도착해 안내를 볼 수 있어요.',
 '큰 화면과 확대·축소 중 지도 조각이 반복해서 지워지는 문제를 줄였어요.'
]};
export const VEHICLES={walk:{label:'걷기',factor:1},bike:{label:'자전거',factor:2,asset:'bicycle'},fast:{label:'자동차',factor:4,asset:'car'},faster:{label:'슈퍼카',factor:8,asset:'supercar'},plane:{label:'비행기',factor:16,asset:'plane'}};
export const movementKey=e=>({KeyW:'w',KeyA:'a',KeyS:'s',KeyD:'d',KeyE:'e'}[e.code]||String(e.key).toLowerCase().replace(/^arrow(.*)/,(_,s)=>'Arrow'+s[0].toUpperCase()+s.slice(1)));
export function isTypingTarget(target){return !!target&&(target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target.tagName));}
