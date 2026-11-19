// Floating panels over the 3D view can be moved: drag a panel by its top strip (its header), and it
// stays where it is put – remembered per panel in this browser, kept inside the view when the window
// changes size, and never left on top of or under the view cube (it is pushed clear of it). A
// double-click on the header puts the panel back in its own place.

const KEY = 'vispecta.float.';
const HANDLE = 30; // px: the top strip of a panel without a .float-head
const INTERACTIVE = 'button, input, select, textarea, label, a, [contenteditable], .seg';

/**
 * container: the element the panels are positioned in (the viewport). avoid: () => elements no
 * panel may cover (the view cube). Panels: `.float` elements in the container that are not hints.
 */
export function initFloating(container, { avoid = () => [] } = {}) {
  const panels = () => [...container.querySelectorAll(':scope > .float:not(.tool-hint)')];
  const box = (el) => {
    const c = container.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { left: r.left - c.left, top: r.top - c.top, width: r.width, height: r.height, cw: c.width, ch: c.height };
  };
  const place = (el, left, top) => {
    Object.assign(el.style, { left: `${Math.round(left)}px`, top: `${Math.round(top)}px`, right: 'auto', bottom: 'auto', transform: 'none' });
  };
  const reset = (el) => { for (const p of ['left', 'top', 'right', 'bottom', 'transform']) el.style[p] = ''; };

  /** Keeps the panel inside the container and clear of the view cube. */
  function settle(el) {
    if (el.hidden || !el.offsetParent) return;
    const b = box(el);
    let left = Math.min(Math.max(0, b.left), Math.max(0, b.cw - b.width));
    let top = Math.min(Math.max(0, b.top), Math.max(0, b.ch - Math.min(b.height, 60)));
    for (const a of avoid()) {
      if (!a || a.hidden || !a.offsetParent) continue;
      const q = box(a);
      const gap = 8;
      const overlaps = left < q.left + q.width && left + b.width > q.left && top < q.top + q.height && top + b.height > q.top;
      if (!overlaps) continue;
      // the smallest move that clears it: below, or beside it (left / right), whichever fits
      const moves = [
        { left, top: q.top + q.height + gap },
        { left: q.left - b.width - gap, top },
        { left: q.left + q.width + gap, top },
      ].filter((m) => m.left >= 0 && m.left + b.width <= b.cw && m.top >= 0 && m.top < b.ch - 40);
      if (!moves.length) continue;
      moves.sort((m1, m2) => Math.hypot(m1.left - left, m1.top - top) - Math.hypot(m2.left - left, m2.top - top));
      ({ left, top } = moves[0]);
    }
    if (Math.abs(left - b.left) > 0.5 || Math.abs(top - b.top) > 0.5 || el.dataset.moved) place(el, left, top);
  }

  // where the user put a panel last time
  function restore(el) {
    if (!el.id) return;
    let pos = null;
    try { pos = JSON.parse(localStorage.getItem(KEY + el.id) || 'null'); } catch { pos = null; }
    if (pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)) { el.dataset.moved = '1'; place(el, pos.left, pos.top); }
  }
  for (const el of panels()) restore(el);

  let drag = null;
  container.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const el = e.target.closest('.float');
    if (!el || el.parentElement !== container || el.classList.contains('tool-hint')) return;
    if (e.target.closest(INTERACTIVE)) return;
    const head = el.querySelector(':scope > .float-head');
    const inHead = head ? head.contains(e.target) : e.clientY - el.getBoundingClientRect().top <= HANDLE;
    if (!inHead) return;
    const b = box(el);
    drag = { el, dx: e.clientX - b.left, dy: e.clientY - b.top, id: e.pointerId };
    // the panel being moved comes to the front of the others (still under the view cube)
    for (const p of panels()) p.style.zIndex = '';
    el.style.zIndex = '4';
    el.classList.add('dragging');
    el.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });
  container.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const b = box(drag.el);
    place(drag.el, Math.min(Math.max(0, e.clientX - drag.dx), b.cw - b.width), Math.min(Math.max(0, e.clientY - drag.dy), b.ch - 30));
  });
  const end = (e) => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const el = drag.el;
    drag = null;
    el.classList.remove('dragging');
    el.dataset.moved = '1';
    settle(el);
    const b = box(el);
    try { if (el.id) localStorage.setItem(KEY + el.id, JSON.stringify({ left: Math.round(b.left), top: Math.round(b.top) })); } catch { /* not stored */ }
  };
  container.addEventListener('pointerup', end);
  container.addEventListener('pointercancel', end);
  container.addEventListener('dblclick', (e) => {
    const el = e.target.closest('.float');
    if (!el || el.parentElement !== container || e.target.closest(INTERACTIVE)) return;
    const head = el.querySelector(':scope > .float-head');
    if (head ? !head.contains(e.target) : e.clientY - el.getBoundingClientRect().top > HANDLE) return;
    reset(el);
    delete el.dataset.moved;
    try { if (el.id) localStorage.removeItem(KEY + el.id); } catch { /* ignore */ }
    settle(el);
  });

  // a panel that opens, or a window that changes size: back inside and clear of the cube
  const settleAll = () => { for (const el of panels()) settle(el); };
  new ResizeObserver(settleAll).observe(container);
  const mo = new MutationObserver((ms) => { for (const m of ms) if (m.target.classList?.contains('float') && !m.target.hidden) requestAnimationFrame(() => settle(m.target)); });
  for (const el of panels()) mo.observe(el, { attributes: true, attributeFilter: ['hidden'] });
  return { settle, settleAll };
}
