// The low-frame-rate suggestion (spec §9): when the quality is already at its lightest (화질 낮음, or automatic quality
// with no step left) and the measured frame rate stays under 20 for 10 s of play, the game offers the light 2D once per
// session. The measurement is main.js's own auto-quality sampler: every ~2 s of play it hands its window of frame times
// here (sample), so paused time (a dialog, the menu, the title) is never counted and the card can only come up in play.
// The card is the controller's 'lite' dialog (a glass panel dialog, ui/help.js createPanelDialog): 3D로 계속하기 (also ×,
// Escape and a press outside) closes it into play; 가벼운 2D로 열기 is a link to ./2d/ that first has main.js save and
// remember the 2D (game/view-choice.js). Seen once, it is not offered again in this tab (sessionStorage[SEEN_KEY]).
import { el } from './dom.js';
import { createPanelDialog, button } from './help.js';
import { nextQuality } from '../render/quality.js';
import { LITE_URL } from '../game/view-choice.js';

export const SLOW_FPS = 20, SLOW_MS = 10000;
export const SEEN_KEY = 'hongseong-lite-card-v1';
const FRAME_CAP = 1000;   // a frame longer than this (a hidden tab, a stall) counts as 1 s of play at most
export const LITE_LINES = {
  tag: '화면 안내',
  title: '화면이 느리게 움직여요',
  body: [
    '화질을 가장 낮게 해도 이 기기에서는 3D 화면이 뚝뚝 끊겨요. 가벼운 2D로 열면 같은 기록으로 더 부드럽게 탐방할 수 있어요.',
    '가벼운 2D를 고르면 이 기기는 다음에도 2D로 열려요.',
  ],
  open: '가벼운 2D로 열기',
  stay: '3D로 계속하기',
};

/** The quality has nothing lighter left: 화질 낮음, or automatic quality at the end of its ladder (render/quality.js). */
export function atLightest(q) {
  if (!q) return false;
  return q.mode === 'low' || (q.mode === 'auto' && nextQuality(q, Infinity) === q);
}

/**
 * slowWatch() -> {sample(frames, medianMs, quality) -> due, slowMs}. One call per sampler window: frames (ms each), their
 * median and the quality they were drawn at. A window under SLOW_FPS at the lightest quality adds its play time; any
 * other window starts the count over. Due once SLOW_MS of slow play has added up (and while it stays slow).
 */
export function slowWatch({ fps = SLOW_FPS, ms = SLOW_MS } = {}) {
  let slow = 0;
  return {
    get slowMs() { return slow; },
    sample(frames, medianMs, quality) {
      if (!frames?.length) return slow >= ms;   // no frames, no news
      const play = frames.reduce((s, t) => s + Math.min(Math.max(t, 0), FRAME_CAP), 0);
      slow = medianMs > 0 && 1000 / medianMs < fps && atLightest(quality) ? slow + play : 0;
      return slow >= ms;
    },
  };
}

/**
 * onceFlag(session) -> {seen(), mark()}: the card's once-per-session record in sessionStorage (it survives a reload in
 * the same tab). Working storage is the record; when it is blocked, missing or a write fails, this page remembers.
 */
export function onceFlag(session) {
  let memo = false;
  return {
    seen() {
      if (memo) return true;
      try { return session?.getItem(SEEN_KEY) === '1'; } catch { return false; }
    },
    mark() {
      try { if (!session) throw new Error('no session storage'); session.setItem(SEEN_KEY, '1'); } catch { memo = true; }
    },
  };
}

/**
 * createLiteCard(doc, ctx) -> {open(), hide(), close(), isOpen, due()}: the controller's 'lite' dialog. ctx: root,
 * returnFocus, onClose (ctl.close), lite() (save and remember the 2D before the link opens it), session (sessionStorage,
 * looked up behind try/catch when not given). due(): not offered yet this session. open() records the offer.
 */
export function createLiteCard(doc, ctx) {
  const win = doc.defaultView || globalThis;
  let session = ctx.session;
  if (session === undefined) { try { session = win.sessionStorage; } catch { session = null; } }
  const flag = onceFlag(session);
  const d = createPanelDialog(doc, { id: 'lite', root: ctx.root, returnFocus: ctx.returnFocus, onClose: ctx.onClose });
  d.tag.textContent = LITE_LINES.tag; d.title.textContent = LITE_LINES.title; d.blurb.hidden = true;
  d.body.append(...LITE_LINES.body.map((t, i) => el('p', { className: i ? 'sub' : 'lead' }, t)));
  const stay = button(LITE_LINES.stay, { id: 'lite-stay', onClick: () => d.close() });
  const go = el('a', { className: 'btn primary', id: 'lite-open', href: LITE_URL, onclick: () => { ctx.lite?.(); } }, LITE_LINES.open);   // the link opens ./2d/
  d.footer.append(stay, el('span', { className: 'spacer' }), go);
  return {
    due: () => !flag.seen(),
    open() { flag.mark(); d.body.scrollTop = 0; d.show(stay); },
    hide: () => d.hide(), close: () => d.close(),
    get isOpen() { return d.isOpen; },
  };
}
