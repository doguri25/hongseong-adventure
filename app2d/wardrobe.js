export const CHARACTERS={explorer:{name:'기본 탐험가',mode:'walk'},boy:{name:'남자 탐험가',mode:'boy'},raccoon:{name:'귀여운 라쿤',mode:'raccoon'}};
export const SHOP_CATEGORIES=[['character','캐릭터'],['outfit','탐험복'],['journal','수첩'],['stamp','도장'],['trail','발자국'],['ring','위치 고리']];
export const OUTFIT_FILTERS={default:'none',gold:'sepia(.55) saturate(1.4)',ocean:'hue-rotate(120deg) saturate(1.2)',rose:'hue-rotate(280deg) saturate(1.25)',violet:'hue-rotate(190deg) saturate(1.2)',mint:'hue-rotate(35deg) saturate(1.4)'};
export const STAMPS={default:'✓',star:'★',heart:'♥',flower:'✿',diamond:'◆'};
export const TRAILS={star:{glyph:'✧',color:'#fff3a8'},heart:{glyph:'♥',color:'#ef93aa'},leaf:{glyph:'❧',color:'#69b582'},music:{glyph:'♪',color:'#b5a2ed'},bubble:{glyph:'○',color:'#9cdef2'}};
export const RINGS={sun:'#f5ce68',sea:'#63cce1',forest:'#91cb7a'};
export const JOURNALS={gold:'#c8a855',ocean:'#548eb7',rose:'#c97e91',forest:'#6e9e69',violet:'#9c83bb'};
export const WARDROBE_ITEMS=[
 ...[['ocean','바다빛 탐험복','#648ed0'],['rose','벚꽃빛 탐험복','#d788a0'],['violet','보랏빛 탐험복','#a285c0'],['mint','새싹빛 탐험복','#71b493']].map(([v,n,c])=>({id:'outfit-'+v,name:n,desc:'걷는 캐릭터의 색감을 바꾸어요.',price:100,slot:'outfit',value:v,color:c,glyph:'◈'})),
 ...[['ocean','푸른 바다 수첩'],['rose','벚꽃 수첩'],['forest','숲속 수첩'],['violet','라벤더 수첩']].map(([v,n])=>({id:'journal-'+v,name:n,desc:'발견 카드와 수첩 테두리를 바꾸어요.',price:60,slot:'journal',value:v,color:JOURNALS[v],glyph:'▤'})),
 ...[['heart','하트 도장','#ce8294'],['flower','꽃 도장','#a18a51'],['diamond','보석 도장','#7e97c5']].map(([v,n,c])=>({id:'stamp-'+v,name:n,desc:'발견한 장소의 기록에 새 도장을 찍어요.',price:40,slot:'stamp',value:v,color:c,glyph:STAMPS[v]})),
 ...[['heart','하트 발자국'],['leaf','나뭇잎 발자국'],['music','음표 발자국'],['bubble','물방울 발자국']].map(([v,n])=>({id:'trail-'+v,name:n,desc:'이동한 길에 잠깐 남는 흔적을 바꾸어요.',price:80,slot:'trail',value:v,color:TRAILS[v].color,glyph:TRAILS[v].glyph})),
 ...[['sun','햇살 위치 고리'],['sea','바다 위치 고리'],['forest','숲빛 위치 고리']].map(([v,n])=>({id:'ring-'+v,name:n,desc:'캐릭터와 탈것 아래의 위치 고리 색을 바꾸어요.',price:50,slot:'ring',value:v,color:RINGS[v],glyph:'◎'}))
];
