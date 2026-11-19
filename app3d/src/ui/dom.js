// Pure DOM helpers for the 3D app's UI. No globals are touched at import time, so node tests can use them with
// minimal fake objects. Everything that needs a document reaches it through the elements it is handed.

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/** el('button', {className: 'btn', onclick: fn, dataset: {a: 1}}, 'label', childNode) -> element. Needs `document` at call time. */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k in node || k.startsWith('on')) node[k] = v;
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) if (c !== undefined && c !== null && c !== false) node.append(c);
  return node;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const size = (r) => ({ w: r.width ?? r.right - r.left, h: r.height ?? r.bottom - r.top });
/** Touch-target floor: a rect (DOMRect-like) at least 44 x 44 CSS px. */
export function fits44(rect) { const { w, h } = size(rect); return w >= 44 && h >= 44; }
/** Two rects intersect with positive area; edges that merely touch do not overlap. */
export function overlaps(a, b) { return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom; }

const open = new WeakMap();   // dialogEl -> {inerted, handler, doc, returnFocus}

/**
 * Make `dialogEl` modal: every child of `root` that does not contain the dialog gets `inert` (remembering only the
 * ones it changed), focus moves to the first focusable control inside, and Escape calls `onClose` (the caller's close
 * path, which should call closeModal). `returnFocus` (the canvas in the app) gets focus again on closeModal.
 */
export function openModal(dialogEl, { root, returnFocus, onClose } = {}) {
  if (open.has(dialogEl)) closeModal(dialogEl);
  const inerted = [];
  for (const child of Array.from(root?.children || [])) {
    if (child === dialogEl || child.contains?.(dialogEl) || child.inert) continue;
    child.inert = true; inerted.push(child);
  }
  const doc = dialogEl.ownerDocument || globalThis.document;
  const handler = (e) => { if (e.key === 'Escape') { e.preventDefault?.(); onClose?.(); } };
  doc?.addEventListener('keydown', handler);
  open.set(dialogEl, { inerted, handler, doc, returnFocus });
  const first = dialogEl.querySelectorAll?.(FOCUSABLE)[0] || dialogEl;
  try { first.focus({ preventScroll: true }); } catch { /* not focusable yet */ }
}

/** Undo openModal: un-inert exactly the siblings it set, drop the Escape handler, focus `returnFocus`. */
export function closeModal(dialogEl) {
  const st = open.get(dialogEl);
  if (!st) return;
  open.delete(dialogEl);
  for (const n of st.inerted) n.inert = false;
  st.doc?.removeEventListener('keydown', st.handler);
  try { st.returnFocus?.focus({ preventScroll: true }); } catch { /* canvas gone */ }
}
