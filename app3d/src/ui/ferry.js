// 배 타기 (2D showFerry and the voyage status): the ferry dialog in front of boarding at 남당항 (the controller's 'ferry'
// kind) and the voyage chip's labels. The voyage itself is game/ferry.js; main.js boards, sails and lands. Copy is the
// 2D game's (dist/game.js showFerry, dist/world.js startVoyage and boardFerry); the return button is named as this
// game names it (죽도에서 돌아가기, shown on 죽도 in the HUD), not the 2D 배 타고 남당항으로.
import { el } from './dom.js';
import { createPanelDialog, button } from './help.js';

export const FERRY_LINES = [
  '죽도는 바다로 둘러싸인 섬이에요. 남당항에서 배를 타고 찾아가 볼까요?',
  '버튼을 누르면 남당항까지 이동한 뒤 배를 타요. 돌아올 때는 화면에 나타나는 ‘죽도에서 돌아가기’를 누르세요.',
  '게임에서는 기다리는 시간과 요금을 생략했어요. 바다 위 이동은 간단한 연출이며 실제 항로 안내가 아니에요.',
];
/** The 2D toast when the trip to the pier starts (world.js boardFerry): goTo 죽도 from the mainland shows it. */
export const FERRY_HINT = '남당항으로 이동한 뒤 배를 타요.';
/** The voyage chip while the boat sails (2D world.js startVoyage -> #voyage-status). */
export const VOYAGE_LABEL = { out: '배를 타고 죽도로 가는 중…', back: '남당항으로 돌아가는 중…' };

/**
 * createFerryDialog(doc, ctx) -> {open(), hide(), close(), isOpen}: 죽도로 떠나는 배 여행 with 남당항으로 가서 배 타기.
 * ctx: root, returnFocus, onBoard() (main.js: close the dialog, then board, or head for the pier first), onClose().
 */
export function createFerryDialog(doc, ctx) {
  const d = createPanelDialog(doc, { id: 'ferry', root: ctx.root, returnFocus: ctx.returnFocus, onClose: ctx.onClose });
  d.tag.textContent = '남당항 ↔ 죽도'; d.title.textContent = '죽도로 떠나는 배 여행'; d.blurb.hidden = true;
  d.body.append(el('p', { className: 'lead' }, FERRY_LINES[0]), el('p', {}, FERRY_LINES[1]), el('p', { className: 'sub' }, FERRY_LINES[2]));
  const board = button('남당항으로 가서 배 타기', { id: 'board-ferry', primary: true, onClick: () => ctx.onBoard?.() });
  d.footer.append(el('span', { className: 'spacer' }), board);
  return { open() { d.body.scrollTop = 0; d.show(board); }, hide: () => d.hide(), close: () => d.close(), get isOpen() { return d.isOpen; } };
}
