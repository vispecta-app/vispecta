// Section viewer: a window with the live 2D cut of one section plane, next to the 3D view.
// Step through the sections (‹ › or the arrow keys) while the model shows where the cut is.
// The window floats over the viewport and can be popped out into a browser window of its own
// (e.g. on a second screen); its controls keep working there.
import { sectionPaths, annotFormat } from './drawing.js';

const SVG = 'http://www.w3.org/2000/svg';
const niceSteps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

export class SectionViewer {
  /**
   * ctx: {t, h, compute(plane) -> section, title(plane) -> string, station(plane) -> string|null,
   *       step(plane, dir), setStation(plane, text) -> bool, getStep() -> m, setStep(m), colors() -> opts,
   *       planes() -> current plane list, container (element to dock into)}
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.plane = null;
    this.section = null;
    this.view = null; // {x, y, w, h} viewBox in drawing metres (y flipped)
    this.win = null;
    try { this.showPoints = localStorage.getItem('onlineifc.sv.points') === '1'; } catch { this.showPoints = false; }
    try { this.showKey = localStorage.getItem('onlineifc.sv.key') !== '0'; } catch { this.showKey = true; }
    try { this.sheet = localStorage.getItem('onlineifc.sv.sheet') === '1'; } catch { this.sheet = false; }
    this.sheetView = { s: 1, x: 0, y: 0 };
    this.busy = false;
    this.pending = false;
    this.#build();
  }

  #build() {
    const { h, t } = this.ctx;
    this.titleEl = h('b', { class: 'sv-title' });
    this.stationIn = h('input', { type: 'text', inputmode: 'decimal', class: 'sv-station', title: t('st.title') });
    this.stepIn = h('input', { type: 'number', min: '0.01', step: 'any', class: 'sv-step', title: t('planes.stepTitle') });
    const btn = (text, title, fn, cls = '') => h('button', { class: `btn xs ${cls}`, text, title, onclick: fn });
    this.popBtn = btn('⧉', t('sv.popOut'), () => (this.win ? this.dock() : this.popOut()));
    this.head = h('div', { class: 'sv-head' },
      this.titleEl,
      h('span', { class: 'sv-ctrl' },
        btn('‹', t('sv.prev'), () => this.step(-1), 'step'),
        this.stationIn,
        btn('›', t('sv.next'), () => this.step(1), 'step'),
        h('label', { class: 'sv-steplbl' }, h('span', { text: t('sv.step') }), this.stepIn, h('span', { text: 'm' })),
        btn('−', t('sv.zoomOut'), () => this.zoom(1.4)),
        btn('+', t('sv.zoomIn'), () => this.zoom(1 / 1.4)),
        btn('⤢', t('sv.fit'), () => { this.fit(); this.render(); }),
        btn('⟳', t('sv.refresh'), () => this.update()),
        this.cutBtn = btn('✂', t('planes.cut3d'), () => this.plane && this.ctx.toggleCut?.(this.plane)),
        this.ptsBtn = btn('⌖', t('sv.points'), () => { this.showPoints = !this.showPoints; try { localStorage.setItem('onlineifc.sv.points', this.showPoints ? '1' : ''); } catch { /* ignore */ } this.update(); }),
        this.resetPtsBtn = btn('↺', t('sv.resetPoints'), () => { if (this.plane) { this.ctx.resetPoints?.(this.plane); this.update(); } }),
        this.sheetBtn = btn('📄', t('sv.sheet'), () => {
          this.sheet = !this.sheet;
          try { localStorage.setItem('onlineifc.sv.sheet', this.sheet ? '1' : ''); } catch { /* ignore */ }
          this.sheetView = { s: 1, x: 0, y: 0 };
          this.update();
        }),
        this.keyBtn = btn('▦', t('sv.keyPlan'), () => { this.showKey = !this.showKey; try { localStorage.setItem('onlineifc.sv.key', this.showKey ? '1' : '0'); } catch { /* ignore */ } this.renderKey(); }),
        this.popBtn,
        btn('✕', t('common.close'), () => this.close())));
    this.svg = document.createElementNS(SVG, 'svg');
    this.svg.setAttribute('class', 'sv-svg');
    this.body = h('div', { class: 'sv-body' });
    this.keySvg = document.createElementNS(SVG, 'svg');
    this.keySvg.setAttribute('class', 'sv-key');
    // the sheet as it will be exported (#51): the same SVG the drawing export writes
    this.sheetEl = h('div', { class: 'sv-sheet' });
    this.sheetEl.hidden = true;
    this.body.append(this.svg, this.sheetEl, this.keySvg);
    this.coord = h('span', { class: 'sv-coord' });
    this.info = h('span', { class: 'sv-info' });
    this.el = h('div', { class: 'secview', tabindex: '0' }, this.head, this.body, h('div', { class: 'sv-foot' }, this.coord, this.info));
    this.el.hidden = true;
    this.ctx.container.append(this.el);

    this.stationIn.addEventListener('change', () => { if (this.plane && !this.ctx.setStation(this.plane, this.stationIn.value)) this.#updateHead(); });
    this.stationIn.addEventListener('keydown', (e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); this.step(e.key === 'ArrowUp' ? 1 : -1); } });
    this.stepIn.addEventListener('change', () => { const v = +this.stepIn.value; if (v > 0) this.ctx.setStep(v); });
    this.onKey = (e) => {
      if (e.target.closest?.('input, select, textarea')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); this.step(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); this.step(-1); }
      else if (e.key === 'f' || e.key === 'F') { this.fit(); this.render(); }
      else if (e.key === '+' || e.key === '=') { e.preventDefault(); this.zoom(1 / 1.4); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); this.zoom(1.4); }
    };
    // popped out, the window itself listens (see popOut), otherwise the floating window
    this.el.addEventListener('keydown', (e) => { if (!this.win) this.onKey(e); });
    // zoom (#65): wheel / trackpad pinch at the cursor, two-finger pinch on touch screens, the
    // − + buttons and the + − keys; pan by dragging; double-click (or ⤢, F) fits the whole section.
    // The zoom is kept while stepping through the stations.
    this.body.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this.sheetShown) { this.#sheetZoom(e.clientX, e.clientY, Math.pow(1.0015, -e.deltaY)); return; }
      if (!this.view) return;
      this.#zoomAt(this.#toModel(e), Math.pow(1.0015, e.deltaY));
    }, { passive: false });
    this.body.addEventListener('dblclick', (e) => { e.preventDefault(); this.sheetView = { s: 1, x: 0, y: 0 }; this.fit(); this.render(); });
    const ptrs = new Map(); // pointerId -> {x, y}
    let drag = null, pinch = null;
    const startDrag = () => {
      const [a, b] = [...ptrs.values()];
      drag = null; pinch = null;
      if (a && b) pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, v: { ...this.view } };
      else if (a) drag = { x: a.x, y: a.y, v: { ...this.view }, sx: this.sheetView.x, sy: this.sheetView.y };
    };
    this.body.addEventListener('pointerdown', (e) => {
      if (!this.view) return;
      this.press = ptrs.size ? null : { x: e.clientX, y: e.clientY };
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.body.setPointerCapture(e.pointerId);
      startDrag();
      this.el.focus({ preventScroll: true });
    });
    this.body.addEventListener('pointermove', (e) => {
      const p = this.#toModel(e);
      if (p) this.coord.textContent = this.ctx.t('sv.coord', { x: p.x.toFixed(3), z: (-p.y).toFixed(3) });
      if (!ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const r = this.body.getBoundingClientRect();
      if (this.sheetShown && drag) {
        const sv = this.sheetView;
        this.sheetView = { ...sv, x: drag.sx + (e.clientX - drag.x), y: drag.sy + (e.clientY - drag.y) };
        this.#sheetTransform();
        return;
      }
      if (pinch) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        this.view = pinch.v;
        this.#zoomAt(this.#toModel({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 }), pinch.d / d, false);
        this.render();
      } else if (drag) {
        const k = this.#scale(r);
        this.view = { ...drag.v, x: drag.v.x - (e.clientX - drag.x) / k, y: drag.v.y - (e.clientY - drag.y) / k };
        this.render();
      }
    });
    const lift = (e) => {
      if (!ptrs.delete(e.pointerId)) return;
      // a click (not a drag) with the points shown: remove or add an annotated point (#48)
      const pr = this.press;
      this.press = null;
      if (e.type === 'pointerup' && pr && !ptrs.size && Math.hypot(e.clientX - pr.x, e.clientY - pr.y) < 4 && this.showPoints && !this.sheetShown) this.#pointClick(e);
      startDrag();
    };
    this.body.addEventListener('pointerup', lift);
    this.body.addEventListener('pointercancel', lift);
    this.body.addEventListener('pointerleave', () => { this.coord.textContent = ''; });
    // move the floating window by its header
    let mv = null;
    this.head.addEventListener('pointerdown', (e) => {
      if (this.win || e.target.closest('button, input, label')) return;
      const r = this.el.getBoundingClientRect(), pr = this.el.offsetParent?.getBoundingClientRect() || { left: 0, top: 0 };
      mv = { dx: e.clientX - r.left + pr.left, dy: e.clientY - r.top + pr.top };
      this.head.setPointerCapture(e.pointerId);
    });
    this.head.addEventListener('pointermove', (e) => {
      if (!mv) return;
      Object.assign(this.el.style, { left: `${Math.max(0, e.clientX - mv.dx)}px`, top: `${Math.max(0, e.clientY - mv.dy)}px`, right: 'auto', bottom: 'auto' });
    });
    this.head.addEventListener('pointerup', () => { mv = null; });
    new ResizeObserver(() => this.render()).observe(this.body);
  }

  get isOpen() { return !this.el.hidden; }

  open(plane) {
    const fresh = plane !== this.plane;
    this.plane = plane;
    this.ctx.onPlane?.(plane);
    this.el.hidden = false;
    if (fresh) this.view = null;
    this.update();
    if (!this.win) this.el.focus({ preventScroll: true });
    else this.win.focus();
  }

  close() {
    if (this.win) this.dock(); // also closes the popup window (#38)
    this.el.hidden = true;
    this.plane = null;
    this.section = null;
    this.ctx.onClose?.();
  }

  step(dir) { if (this.plane) this.ctx.step(this.plane, dir); }

  /** Called when planes change: recompute the cut (at most one at a time, the latest wins). */
  planesChanged() {
    if (!this.isOpen) return;
    if (!this.ctx.planes().includes(this.plane)) {
      const next = this.ctx.planes().find((p) => p.station) || this.ctx.planes()[0];
      if (!next) return this.close();
      this.plane = next;
      this.view = null;
      this.ctx.onPlane?.(next);
    }
    this.update();
  }

  /** The ✂ button: whether the shown station section cuts the 3D view (#39); hidden for other planes. */
  renderCut() {
    const on = this.plane ? this.ctx.cut3d?.(this.plane) : null;
    this.cutBtn.hidden = on === null || on === undefined;
    this.cutBtn.classList.toggle('on', !!on);
    this.cutBtn.setAttribute('aria-pressed', String(!!on));
  }

  update() {
    if (!this.plane) return;
    this.#updateHead();
    this.renderCut();
    this.renderKey();
    if (this.busy) { this.pending = true; return; }
    this.busy = true;
    setTimeout(() => {
      if (!this.plane) { this.busy = false; this.pending = false; return; }
      try {
        const t0 = performance.now();
        this.section = this.ctx.compute(this.plane, this.showPoints);
        this.ms = Math.round(performance.now() - t0);
      } catch (e) {
        console.error(e);
        this.section = null;
      }
      // the sheet view: the exported drawing itself (#51)
      this.sheetSvg = null;
      if (this.sheet) { try { this.sheetSvg = this.ctx.sheetSvg?.(this.plane) || null; } catch (e) { console.warn('sheet', e); } }
      if (!this.view) this.fit();
      this.render();
      this.busy = false;
      if (this.pending) { this.pending = false; this.update(); }
    }, 0);
  }

  #updateHead() {
    const p = this.plane;
    if (!p) return;
    this.titleEl.textContent = this.ctx.title(p);
    const st = this.ctx.station(p);
    if (document.activeElement !== this.stationIn && this.win?.document.activeElement !== this.stationIn) this.stationIn.value = st ?? '';
    this.stepIn.value = String(this.ctx.getStep());
    if (this.win) this.win.document.title = `${this.ctx.title(p)} – Vispecta`;
  }

  fit() {
    const b = this.section?.bounds;
    if (!b || !Number.isFinite(b.minX)) { this.view = { x: -10, y: -10, w: 20, h: 20 }; return; }
    const pad = 0.08 * Math.max(b.maxX - b.minX, b.maxY - b.minY, 1);
    const r = this.body.getBoundingClientRect();
    let w = b.maxX - b.minX + 2 * pad, hh = b.maxY - b.minY + 2 * pad;
    const aspect = (r.width || 600) / (r.height || 400);
    if (w / hh < aspect) w = hh * aspect; else hh = w / aspect;
    const cx = (b.minX + b.maxX) / 2, cy = -(b.minY + b.maxY) / 2;
    this.view = { x: cx - w / 2, y: cy - hh / 2, w, h: hh };
  }

  /** Zooms by factor f (> 1 out, < 1 in) around a point in drawing coordinates (default: the centre). */
  zoom(f) {
    if (!this.view) return;
    const v = this.view;
    this.#zoomAt({ x: v.x + v.w / 2, y: v.y + v.h / 2 }, f);
  }

  #zoomAt(p, f, render = true) {
    const v = this.view;
    if (!v || !p) return;
    // not further in than about 1 mm across the window, not further out than 100 km
    f = Math.min(Math.max(f, 0.002 / v.w), 1e5 / v.w);
    this.view = { x: p.x - (p.x - v.x) * f, y: p.y - (p.y - v.y) * f, w: v.w * f, h: v.h * f };
    if (render) this.render();
  }

  #scale(r) { return Math.min(r.width / this.view.w, r.height / this.view.h); }

  #toModel(e) {
    if (!this.view) return null;
    // the SVG's own screen transform is exact (also with borders, padding or a popped-out window)
    const m = this.svg.getScreenCTM?.();
    if (m && this.svg.getAttribute('viewBox')) {
      const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
      return { x: q.x, y: q.y };
    }
    const r = this.body.getBoundingClientRect();
    const k = this.#scale(r);
    // the viewBox is centred in the element (preserveAspectRatio xMidYMid meet)
    const ox = (r.width - this.view.w * k) / 2, oy = (r.height - this.view.h * k) / 2;
    return { x: this.view.x + (e.clientX - r.left - ox) / k, y: this.view.y + (e.clientY - r.top - oy) / k };
  }

  /** Shows the sheet (the SVG of the export) instead of the live cut, when on (#51). */
  #renderSheet() {
    this.sheetBtn.classList.toggle('on', !!this.sheet);
    this.sheetShown = !!(this.sheet && this.sheetSvg);
    this.svg.style.display = this.sheetShown ? 'none' : '';
    if (this.sheetShown) this.keySvg.style.display = 'none'; else this.renderKey(); // the sheet has its own title block
    this.sheetEl.hidden = !this.sheetShown;
    if (!this.sheetShown) return false;
    if (this.sheetEl.dataset.src !== this.sheetSvg) {
      this.sheetEl.innerHTML = this.sheetSvg.replace(/^<\?xml[^>]*>\s*/, '');
      this.sheetEl.dataset.src = this.sheetSvg;
      const s = this.sheetEl.querySelector('svg');
      if (s) { s.setAttribute('width', '100%'); s.setAttribute('height', '100%'); Object.assign(s.style, { width: '100%', height: '100%', position: 'absolute', left: '0', top: '0' }); }
    }
    this.#sheetTransform();
    return true;
  }

  #sheetTransform() {
    const s = this.sheetEl.querySelector('svg');
    if (s) s.style.transform = `translate(${this.sheetView.x}px, ${this.sheetView.y}px) scale(${this.sheetView.s})`;
  }

  #sheetZoom(cx, cy, f) {
    const r = this.sheetEl.getBoundingClientRect();
    const v = this.sheetView;
    const s = Math.min(40, Math.max(0.5, v.s * f));
    const k = s / v.s;
    const px = cx - r.left, py = cy - r.top;
    this.sheetView = { s, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    this.#sheetTransform();
  }

  render() {
    if (this.isOpen && this.#renderSheet()) {
      const sec = this.section;
      let n = 0;
      for (const L of sec?.layers?.values() || []) n += L.elements;
      this.info.textContent = sec ? this.ctx.t('sv.sheetInfo', { n }) : '';
      return;
    }
    if (!this.isOpen || !this.view) return;
    const v = this.view;
    const svg = this.svg;
    const r = this.body.getBoundingClientRect();
    if (!r.width || !r.height) return;
    svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
    svg.replaceChildren();
    const mk = (tag, attrs) => { const e = document.createElementNS(SVG, tag); for (const [k, val] of Object.entries(attrs)) e.setAttribute(k, val); return e; };
    const px = v.w / r.width; // metres per pixel (about)
    // grid with labels: offset along, height up
    const step = niceSteps.find((s) => s / px >= 70) || 1000;
    const g = mk('g', { class: 'sv-grid' });
    const fs = 11 * px;
    for (let x = Math.ceil(v.x / step) * step; x <= v.x + v.w; x += step) {
      g.append(mk('line', { x1: x, y1: v.y, x2: x, y2: v.y + v.h, 'vector-effect': 'non-scaling-stroke' }));
      const tx = mk('text', { x: x + 3 * px, y: v.y + v.h - 4 * px, 'font-size': fs });
      tx.textContent = `${+x.toFixed(3)}`;
      g.append(tx);
    }
    for (let y = Math.ceil(v.y / step) * step; y <= v.y + v.h; y += step) {
      g.append(mk('line', { x1: v.x, y1: y, x2: v.x + v.w, y2: y, 'vector-effect': 'non-scaling-stroke' }));
      const tx = mk('text', { x: v.x + 4 * px, y: y - 3 * px, 'font-size': fs });
      tx.textContent = `${+(-y).toFixed(3)}`;
      g.append(tx);
    }
    svg.append(g);
    const sec = this.section;
    if (sec) {
      // hatching of the cut faces, like in the 3D view: dark diagonal lines a few pixels apart
      const hatch = this.ctx.hatch?.() !== false;
      if (hatch) {
        const sz = 7 * px;
        const pat = mk('pattern', { id: 'sv-hatch', patternUnits: 'userSpaceOnUse', width: sz, height: sz, patternTransform: 'rotate(45)' });
        pat.append(mk('rect', { x: 0, y: 0, width: 1.3 * px, height: sz, fill: '#000', 'fill-opacity': 0.42, stroke: 'none' }));
        const defs = mk('defs', {});
        defs.append(pat);
        svg.append(defs);
      }
      for (const p of sectionPaths(sec, this.ctx.colors())) {
        svg.append(mk('path', { d: p.d, fill: p.fill, stroke: p.stroke, 'stroke-width': 1.2, 'fill-rule': 'evenodd', 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round' }));
        if (hatch && p.fill && p.fill !== 'none') svg.append(mk('path', { d: p.d, fill: 'url(#sv-hatch)', stroke: 'none', 'fill-rule': 'evenodd' }));
      }
      // point cloud dots (#27): small squares, about 3 px
      if (sec.cloud) {
        const d = 2.6 * px;
        for (const g of sec.cloud) {
          const parts = [];
          for (let k = 0; k < g.xy.length; k += 2) parts.push(`M${(g.xy[k] - d / 2).toFixed(4)} ${(-g.xy[k + 1] - d / 2).toFixed(4)}h${d.toFixed(4)}v${d.toFixed(4)}h${(-d).toFixed(4)}z`);
          svg.append(mk('path', { d: parts.join(''), fill: g.hex, stroke: 'none' }));
        }
      }
      // marks: the alignment axis
      let axisNo = 0;
      for (const m of sec.marks || []) {
        // names of the axes at the top (which alignment each dash-dot line is), one line lower for each
        if (m.text && m.layer === 'ALIGNMENT_AXIS' && m.at) { const tx = mk('text', { x: m.at[0] + 3 * px, y: -m.at[1] + (12 + 13 * axisNo++) * px, 'font-size': 11 * px, fill: m.color || '#c0392b' }); tx.textContent = m.text; svg.append(tx); continue; }
        if (!m.line) continue;
        svg.append(mk('path', { d: `M${m.line.map((q) => `${q[0]} ${-q[1]}`).join('L')}`, fill: 'none', stroke: m.color || '#c0392b', 'stroke-width': 1.2, 'stroke-dasharray': m.dash === 'dash' ? '6 4' : '10 3 2 3', 'vector-effect': 'non-scaling-stroke' }));
        if (m.layer === 'OFFSET_LINES') { const tx = mk('text', { x: m.line[0][0] + 3 * px, y: -m.line[1][1] + 12 * px, 'font-size': 11 * px, fill: m.color }); tx.textContent = `${m.line[0][0] > 0 ? '+' : ''}${m.line[0][0].toFixed(2)}`; svg.append(tx); }
      }
    }
    this.ptsBtn.classList.toggle('on', !!this.showPoints);
    this.resetPtsBtn.hidden = !this.showPoints;
    this.el.classList.toggle('points', !!this.showPoints);
    // break points of the top outline with offset / height (not closer than the labels need)
    const A = sec?.annot;
    if (this.showPoints && A?.runs) {
      const F = annotFormat(A); // the same texts as the drawing (#49)
      const label = (p) => [F.rows.offset ? F.off(p.x) : null, F.rows.height ? F.height(p.y) : null].filter((x) => x !== null).join(' / ');
      const pts = A.runs.flat().sort((a, b) => b.sig - a.sig);
      const used = [];
      const gp = mk('g', { class: 'sv-points' });
      const minD = A.minDist || 0;
      this.shownPoints = [];
      for (const p of pts) {
        if (used.some((q) => (Math.abs(q.x - p.x) < 16 * px && Math.abs(q.y - p.y) < 60 * px) || (minD && Math.abs(q.x - p.x) < minD))) continue;
        used.push(p);
        this.shownPoints.push(p);
        if (p.added) gp.append(mk('rect', { x: p.x - 3.2 * px, y: -p.y - 3.2 * px, width: 6.4 * px, height: 6.4 * px, class: 'added' }));
        else gp.append(mk('circle', { cx: p.x, cy: -p.y, r: 3 * px }));
        const tx = mk('text', { x: p.x + 2 * px, y: -p.y - 6 * px, 'font-size': 10.5 * px, transform: `rotate(-90 ${p.x + 2 * px} ${-p.y - 6 * px})` });
        tx.textContent = label(p);
        gp.append(tx);
      }
      svg.append(gp);
    }
    let n = 0;
    for (const L of sec?.layers?.values() || []) n += L.elements;
    this.info.textContent = sec ? this.ctx.t('sv.info', { n, ms: this.ms ?? 0 }) : '';
    if (sec && !n) this.info.textContent = this.ctx.t('drw.empty');
  }

  /**
   * A click in the section with the points shown (#48): on a point it removes it; on an outline it
   * adds a point there – on a corner when one is near, else on the edge. Within 9 px.
   */
  #pointClick(e) {
    const sec = this.section;
    if (!sec?.annot || !this.plane || !this.view) return;
    const p = this.#toModel(e);
    const r = this.body.getBoundingClientRect();
    const ctm = this.svg.getScreenCTM?.();
    const tol = 9 / (ctm?.a || this.#scale(r));
    const px = p.x, py = -p.y; // drawing coordinates (y up)
    const hit = (this.shownPoints || []).find((q) => Math.hypot(q.x - px, q.y - py) < tol);
    if (hit) { this.ctx.editPoint?.(this.plane, 'remove', hit.x, hit.y); this.update(); return; }
    let best = null;
    const consider = (x, y, d, corner) => { if (d < tol && (!best || (corner && !best.corner) || (corner === best.corner && d < best.d))) best = { x, y, d, corner }; };
    for (const L of sec.layers.values()) {
      const lines = [...(L.loops || []).map((l) => [...l, l[0]]), ...(L.open || [])];
      for (const l of lines) {
        for (let i = 0; i < l.length; i++) {
          const a = l[i];
          consider(a[0], a[1], Math.hypot(a[0] - px, a[1] - py), true);
          if (i + 1 >= l.length) continue;
          const b = l[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
          if (!len2) continue;
          const tt = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / len2));
          const qx = a[0] + tt * dx, qy = a[1] + tt * dy;
          consider(qx, qy, Math.hypot(qx - px, qy - py), false);
        }
      }
    }
    if (best) { this.ctx.editPoint?.(this.plane, 'add', best.x, best.y); this.update(); }
  }

  /**
   * Key plan in the corner: the visible models (outlines), alignments and the cut line with its
   * view direction, so it is clear where the section is taken.
   */
  renderKey() {
    const svg = this.keySvg;
    this.keyBtn.classList.toggle('on', !!this.showKey);
    const k = this.showKey && this.plane ? this.ctx.keyPlan?.(this.plane) : null;
    svg.style.display = k ? '' : 'none';
    svg.replaceChildren();
    if (!k) return;
    const mk = (tag, attrs) => { const e = document.createElementNS(SVG, tag); for (const [a, val] of Object.entries(attrs)) e.setAttribute(a, val); return e; };
    const xs = [], ys = [];
    const add = (q) => { xs.push(q[0]); ys.push(q[1]); };
    for (const b of k.boxes) { add([b[0], b[1]]); add([b[2], b[3]]); }
    for (const l of k.lines) for (const q of l) add(q);
    if (k.cut) { add(k.cut.A); add(k.cut.B); }
    if (!xs.length) { svg.style.display = 'none'; return; }
    let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const W = 180, H = 130;
    let w = Math.max(x1 - x0, 1), hh = Math.max(y1 - y0, 1);
    if (w / hh < W / H) w = hh * W / H; else hh = w * H / W;
    const pad = 0.1 * w;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    w += 2 * pad; hh += 2 * pad * H / W;
    svg.setAttribute('viewBox', `${cx - w / 2} ${-cy - hh / 2} ${w} ${hh}`);
    const u = w / W; // metres per pixel
    const ns = { 'vector-effect': 'non-scaling-stroke' };
    for (const b of k.boxes) svg.append(mk('rect', { x: b[0], y: -b[3], width: Math.max(b[2] - b[0], u), height: Math.max(b[3] - b[1], u), class: 'kp-box', ...ns }));
    for (const l of k.lines) if (l.length > 1) svg.append(mk('path', { d: `M${l.map((q) => `${q[0]} ${-q[1]}`).join('L')}`, class: 'kp-line', ...ns }));
    if (k.cut) {
      const { A, B, v } = k.cut;
      svg.append(mk('path', { d: `M${A[0]} ${-A[1]}L${B[0]} ${-B[1]}`, class: 'kp-cut', ...ns }));
      // arrows at both ends in the view direction
      const s = 9 * u, nx = v[0], ny = v[1], px = -ny, py = nx;
      for (const E of [A, B]) {
        const tip = [E[0] + nx * s * 1.6, E[1] + ny * s * 1.6];
        svg.append(mk('path', { d: `M${E[0] + px * s * 0.55} ${-(E[1] + py * s * 0.55)}L${tip[0]} ${-tip[1]}L${E[0] - px * s * 0.55} ${-(E[1] - py * s * 0.55)}Z`, class: 'kp-arrow' }));
        if (k.cut.letter) {
          const tx = mk('text', { x: E[0] + nx * s * 2.8, y: -(E[1] + ny * s * 2.8) + 3.5 * u, 'font-size': 10 * u, 'text-anchor': 'middle', class: 'kp-letter' });
          tx.textContent = k.cut.letter;
          svg.append(tx);
        }
      }
    }
    if (k.note) {
      const tx = mk('text', { x: cx - w / 2 + 5 * u, y: -cy + hh / 2 - 5 * u, 'font-size': 9.5 * u, class: 'kp-note' });
      tx.textContent = k.note;
      svg.append(tx);
    }
  }

  /** Into a browser window of its own (e.g. a second screen). */
  popOut() {
    const w = window.open('', 'vispecta-section', 'width=960,height=640');
    if (!w) { this.ctx.toast?.(this.ctx.t('sv.blocked')); return; }
    let css = '';
    // relative url()s (the fonts) are relative to the style sheet, not to the new window: made absolute
    const abs = (text, base) => text.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, u) => (/^(data|blob|https?):/.test(u) ? m : `url("${new URL(u, base).href}")`));
    for (const sh of document.styleSheets) { try { for (const rule of sh.cssRules) css += `${abs(rule.cssText, sh.href || document.baseURI)}\n`; } catch { /* other origin */ } }
    w.document.open();
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Vispecta</title><style>${css}</style></head><body class="sv-popup"></body></html>`);
    w.document.close();
    for (const a of ['data-theme', 'lang']) { const val = document.documentElement.getAttribute(a); if (val) w.document.documentElement.setAttribute(a, val); }
    this.saved = this.el.getAttribute('style') || '';
    this.el.removeAttribute('style');
    w.document.body.append(w.document.adoptNode(this.el));
    this.el.classList.add('popped');
    this.popBtn.textContent = '⊡';
    this.popBtn.title = this.ctx.t('sv.dock');
    this.win = w;
    w.addEventListener('keydown', this.onKey);
    // the user closed the popup window itself: bring the section back without closing it again (#38)
    w.addEventListener('pagehide', () => { if (this.win === w) this.dock({ closing: true }); });
    // the main page goes away (reload, other site): take the popup with it, it can't work alone (#38)
    if (!this.onMainHide) { this.onMainHide = () => { if (this.win && !this.win.closed) this.win.close(); }; window.addEventListener('pagehide', this.onMainHide); }
    this.#updateHead();
    setTimeout(() => { this.fit(); this.render(); }, 50);
  }

  /**
   * Back into the main window. The popup window is closed too, so no empty about:blank window is
   * left behind (#38); `closing` is set when the popup is already closing by itself.
   */
  dock({ closing = false } = {}) {
    const w = this.win;
    if (!w) return;
    this.win = null;
    this.ctx.container.append(document.adoptNode(this.el));
    this.el.classList.remove('popped');
    if (this.saved) this.el.setAttribute('style', this.saved);
    this.popBtn.textContent = '⧉';
    this.popBtn.title = this.ctx.t('sv.popOut');
    if (!closing && !w.closed) w.close();
    setTimeout(() => { this.fit(); this.render(); }, 30);
  }
}
