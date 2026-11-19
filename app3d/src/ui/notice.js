// The big notice (pokju #qtoast): 도착! / 새로운 발견! / 직행 미션 성공! / 정답! / 다시 생각해 봐요.
// With no dialog open it pops in the middle of the screen. While a dialog is open it never covers the dialog's readable
// parts (title, text, buttons): it moves into the largest free band outside the dialog panel (above, below, left,
// right), shrinking and wrapping by words to fit with its line under the title kept at 15 px or more; failing that it
// becomes a compact pill in the strip above the dialog's first readable line; failing that it stays out of sight (its
// text is still announced, the element is role=status). It follows the dialog while it shows: a dialog that opens in
// the same tick (an arrival), grows after a quiz answer, or closes. noticeBands and readableBox are pure.

export const NOTICE_GAP = 8;
const LEVELS = [72, 60, 54, 48, 44, 40, 34, 28, 24];   // title sizes tried, largest first (capped by the layout's size)
const POP = 1.04;                                      // the docked pop's overshoot (theme.css notice-dock)
const MIN_BAND = 24;
const TONE = { ok: '#35e08a', danger: '#ff5468', warn: '#ffb52e' };
const CONTROL = new Set(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY']);
const dims = (r) => ({ w: r.right - r.left, h: r.bottom - r.top });
const roomy = (r) => r.right - r.left >= MIN_BAND && r.bottom - r.top >= MIN_BAND;

/**
 * Where the notice may go around an open dialog. view: the usable screen {left, top, right, bottom}; panel: the dialog's
 * rect; content: the union of its readable parts (readableBox). -> {big: bands outside the panel in preference order
 * (above, below, left, right; too small ones dropped), pill: the strip above the first readable line, or null}.
 */
export function noticeBands(view, panel, content) {
  const big = [
    { name: 'above', left: view.left, top: view.top, right: view.right, bottom: panel.top - NOTICE_GAP },
    { name: 'below', left: view.left, top: panel.bottom + NOTICE_GAP, right: view.right, bottom: view.bottom },
    { name: 'left', left: view.left, top: view.top, right: panel.left - NOTICE_GAP, bottom: view.bottom },
    { name: 'right', left: panel.right + NOTICE_GAP, top: view.top, right: view.right, bottom: view.bottom },
  ].filter(roomy);
  const pill = { name: 'pill', left: Math.max(view.left, panel.left), top: view.top, right: Math.min(view.right, panel.right), bottom: content.top - 4 };
  return { big, pill: roomy(pill) ? pill : null };
}

/** Union rect of the dialog's controls and of every element holding text of its own (visible ones only), or null. */
export function readableBox(dialog) {
  let box = null;
  for (const el of dialog.querySelectorAll('*')) {
    const own = CONTROL.has(el.tagName) || Array.from(el.childNodes || []).some((n) => n.nodeType === 3 && n.nodeValue.trim());
    if (!own) continue;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) continue;
    box = box ? { left: Math.min(box.left, r.left), top: Math.min(box.top, r.top), right: Math.max(box.right, r.right), bottom: Math.max(box.bottom, r.bottom) }
      : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }
  return box;
}

/** createNotice(el) -> {show(title, sub, tone)}; el holds a <b> (title) and a <span> (line under it). */
export function createNotice(el, { doc = el.ownerDocument, win = doc.defaultView } = {}) {
  const title = el.querySelector('b'), line = el.querySelector('span');
  let timer = 0, showing = false;
  const px = (name) => parseFloat(win.getComputedStyle(el).getPropertyValue(name)) || 0;
  const openDialog = () => doc.querySelector('.scrim:not([hidden]) [role="dialog"]');

  function reset() {
    el.classList.remove('docked', 'pill', 'away');
    el.style.left = el.style.top = el.style.maxWidth = '';
    el.style.removeProperty('--nb'); el.style.removeProperty('--ns');
  }
  function level(size, band) {
    el.style.setProperty('--nb', size + 'px');
    el.style.setProperty('--ns', Math.max(15, Math.min(20, Math.round(size * 0.28))) + 'px');
    el.style.maxWidth = Math.floor(dims(band).w / POP) + 'px';
  }
  const fits = (band) => el.offsetWidth * POP <= dims(band).w && el.offsetHeight * POP <= dims(band).h;
  const centreIn = (band) => { el.style.left = (band.left + band.right) / 2 + 'px'; el.style.top = (band.top + band.bottom) / 2 + 'px'; };

  function place() {
    reset();
    const dialog = openDialog();
    if (!dialog) return;   // the middle of the screen (theme.css)
    const cap = parseFloat(win.getComputedStyle(title).fontSize) || 72;
    const panel = dialog.getBoundingClientRect(), content = readableBox(dialog) || panel;
    const view = { left: 8 + px('--safe-l'), top: 6 + px('--safe-t'), right: win.innerWidth - 8 - px('--safe-r'), bottom: win.innerHeight - 6 - px('--safe-b') };
    const { big, pill } = noticeBands(view, panel, content);
    el.classList.add('docked');
    let best = null;
    for (const band of big) {
      for (const size of LEVELS) {
        if (size > cap) continue;
        if (best && size <= best.size) break;
        level(size, band);
        if (fits(band)) { best = { band, size }; break; }
      }
    }
    if (best) { level(best.size, best.band); centreIn(best.band); return; }
    el.style.removeProperty('--nb'); el.style.removeProperty('--ns');
    el.classList.add('pill');
    if (pill) { el.style.maxWidth = Math.floor(dims(pill).w / POP) + 'px'; if (fits(pill)) { centreIn(pill); return; } }
    el.classList.remove('pill'); el.classList.add('away');
  }

  // follow the dialogs while the notice shows: a mutation (opening, a quiz answer, closing) re-places it before paint
  const watcher = win.MutationObserver ? new win.MutationObserver(() => { if (showing) place(); }) : null;
  const onResize = () => { if (showing) place(); };
  function follow(on) {
    if (on === showing) return;
    showing = on;
    if (on) {
      for (const s of doc.querySelectorAll('.scrim')) watcher?.observe(s, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true, characterData: true });
      win.addEventListener('resize', onResize);
    } else { watcher?.disconnect(); win.removeEventListener('resize', onResize); }
  }

  return {
    show(text, sub = '', tone = 'ok') {
      if (title.textContent !== text) title.textContent = text;
      if (line.textContent !== (sub || '')) line.textContent = sub || '';
      el.style.setProperty('--tc', TONE[tone] || TONE.ok);
      el.dataset.tone = tone;
      el.classList.remove('show');
      place();
      void el.offsetWidth;   // restart the pop
      el.classList.add('show');
      follow(true);
      clearTimeout(timer);
      timer = setTimeout(() => { el.classList.remove('show'); follow(false); }, 1700);
    },
  };
}
