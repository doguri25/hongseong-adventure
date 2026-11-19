// QR로 열기 (2D showQR): the 2D game's own QR picture (app2d/assets/demo-qr.png, which holds the live address below) with
// the 2D wording and 접속 주소 복사. The controller's 'qr' kind. Phase 2b revisits the address when the 3D app takes it.
import { el } from './dom.js';
import { createPanelDialog, button } from './help.js';

const QR_IMAGE = new URL('#game/assets/demo-qr.png', import.meta.url).href;
/** The address the 2D QR holds (app2d/game.js showQR). */
export const QR_URL = 'https://hongseong-adventure-demo.anyconium.chatgpt.site';
const COPIED = '접속 주소를 복사했어요.', COPY_BY_HAND = '아래에 표시된 주소를 길게 눌러 복사해 주세요.';
// the 2D lines, as plain text (the 2D <br> breaks are kept as line breaks)
const LINES = {
  title: '태블릿으로 모험을 이어가요', alt: '홍성 모험 수첩 데모 접속 QR 코드', head: '카메라로 QR 코드를 비춰 주세요',
  scan: ['갤럭시 태블릿의 카메라로 스캔한 뒤', '링크를 누르면 게임이 열려요.'],
  move: '기기를 옮길 때는 ‘이어하기 파일’을 이용해요.',
  closed: ['현재는 제작자 확인용 비공개 버전이에요.', '학생 배포에는 사이트의 열람 권한 설정이 필요해요.'],
  copy: '접속 주소 복사',
};
export const QR_LINES = [LINES.title, LINES.alt, LINES.head, ...LINES.scan, LINES.move, ...LINES.closed, LINES.copy, COPIED, COPY_BY_HAND];

/**
 * createQrDialog(doc, ctx) -> {open(), hide(), close(), isOpen}. ctx: root, returnFocus, ctl (open('menu')), toast(text)
 * (the 2D toast after 접속 주소 복사, also written under the button), clipboard (navigator.clipboard by default), onClose.
 */
export function createQrDialog(doc, ctx) {
  const d = createPanelDialog(doc, { id: 'qr', root: ctx.root, returnFocus: ctx.returnFocus, onClose: ctx.onClose });
  d.tag.textContent = 'QR로 열기'; d.title.textContent = LINES.title; d.blurb.hidden = true;
  const lines = (a) => a.flatMap((s, i) => (i ? [el('br'), s] : [s]));
  const copy = button(LINES.copy, { id: 'copy-link', primary: true, onClick: copyLink });
  d.body.append(el('div', { className: 'qr-content' },
    el('img', { className: 'qr-img', id: 'qr-img', src: QR_IMAGE, alt: LINES.alt, width: 240, height: 240, decoding: 'async' }),
    el('div', { className: 'qr-text' },
      el('h3', {}, LINES.head),
      el('p', {}, ...lines(LINES.scan)),
      el('p', {}, '진행 기록은 ', el('strong', {}, '각 기기에 따로 저장'), '돼요.', el('br'), LINES.move),
      el('p', { className: 'sub' }, ...lines(LINES.closed)),
      copy,
      el('p', { className: 'qr-url' }, QR_URL),
      el('p', { className: 'status', id: 'qr-status', role: 'status' }))));
  const back = button('메뉴로 돌아가기', { id: 'qr-menu', onClick: () => ctx.ctl.open('menu', { tab: 'settings' }) });
  d.footer.append(back, el('span', { className: 'spacer' }), button('계속 탐방하기', { id: 'qr-done', primary: true, onClick: () => d.close() }));

  async function copyLink() {
    const clip = ctx.clipboard ?? (doc.defaultView || globalThis).navigator?.clipboard;
    let said = COPY_BY_HAND;
    const late = new Promise((_, no) => setTimeout(() => no(new Error('no answer')), 1500));   // a permission prompt left open
    try { await Promise.race([clip.writeText(QR_URL), late]); said = COPIED; } catch { /* no clipboard: the address is on the page */ }
    doc.getElementById('qr-status').textContent = said;   // in the dialog (the HUD toast sits behind its scrim)
    ctx.toast?.(said);
  }
  // the focus starts on 접속 주소 복사, scrolled fully into view on a short screen (844 x 390: M8)
  return { open() { d.body.scrollTop = 0; doc.getElementById('qr-status').textContent = ''; d.show(copy); copy.scrollIntoView?.({ block: 'nearest' }); }, hide: () => d.hide(), close: () => d.close(), get isOpen() { return d.isOpen; } };
}
