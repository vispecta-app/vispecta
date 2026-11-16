// Editing the points of a drawn line in 3D (#74).
//
// Every point of the line gets a round handle, every segment a small "+" in its middle. Drag a
// handle to move the point: it snaps to the model surface under the cursor, or stays at its own
// height where there is none. "+" adds a point there (and starts dragging it); right-click or
// double-click on a handle removes the point (a line keeps at least two). ✓ (or Enter) keeps the
// change, ✕ (or Esc) puts the line back as it was.
import * as THREE from 'three';

export class LineEditor {
  /**
   * ctx: {viewer, container, t, onChange(path, pts) – the line changed (live), onEnd(path, kept)}
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.path = null;
    this.pts = null; // [[x, y, z]] in IFC coordinates
    this.orig = null;
    this.layer = document.createElement('div');
    this.layer.className = 'le-layer';
    this.layer.hidden = true;
    ctx.container.append(this.layer);
    this.bar = document.createElement('div');
    this.bar.className = 'float le-bar';
    this.bar.hidden = true;
    ctx.container.append(this.bar);
    ctx.viewer.renderHooks.push(() => this.#place());
    this.onKey = (e) => {
      if (!this.path || e.target.closest?.('input, textarea, select')) return;
      if (e.key === 'Enter') { e.preventDefault(); this.end(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.end(false); }
    };
  }

  get active() { return !!this.path; }

  start(path, pts) {
    if (this.path) this.end(true);
    this.path = path;
    this.pts = pts.map((p) => [...p]);
    this.orig = pts.map((p) => [...p]);
    const { t } = this.ctx;
    this.bar.replaceChildren();
    const b = (text, title, cls, fn) => { const x = document.createElement('button'); x.className = cls; x.textContent = text; x.title = title; x.addEventListener('click', fn); return x; };
    const label = document.createElement('span');
    label.className = 'le-text';
    label.textContent = t('line.editHint', { name: path.name });
    this.bar.append(label, b(`✓ ${t('line.editDone')}`, t('line.editDoneTitle'), 'btn sm primary', () => this.end(true)), b('✕', t('line.editUndo'), 'icon-btn', () => this.end(false)));
    this.bar.hidden = false;
    this.layer.hidden = false;
    document.addEventListener('keydown', this.onKey, true);
    this.#build();
  }

  /** Ends editing: keep the change, or put the line back as it was. */
  end(keep) {
    if (!this.path) return;
    const path = this.path;
    if (!keep) this.ctx.onChange(path, this.orig);
    this.path = null;
    this.layer.replaceChildren();
    this.layer.hidden = true;
    this.bar.hidden = true;
    document.removeEventListener('keydown', this.onKey, true);
    this.ctx.viewer.controls.enabled = true;
    this.ctx.onEnd?.(path, keep);
  }

  #changed() {
    this.ctx.onChange(this.path, this.pts);
    this.#build();
  }

  #build() {
    this.layer.replaceChildren();
    this.handles = [];
    const { t } = this.ctx;
    this.pts.forEach((p, i) => {
      const el = document.createElement('div');
      el.className = 'le-pt';
      el.title = t('line.pointTitle', { n: i + 1 });
      el.addEventListener('pointerdown', (e) => this.#drag(e, i));
      const remove = (e) => { e.preventDefault(); e.stopPropagation(); if (this.pts.length > 2) { this.pts.splice(i, 1); this.#changed(); } };
      el.addEventListener('contextmenu', remove);
      el.addEventListener('dblclick', remove);
      this.layer.append(el);
      this.handles.push({ el, at: () => this.pts[i] });
    });
    for (let i = 0; i + 1 < this.pts.length; i++) {
      const el = document.createElement('div');
      el.className = 'le-mid';
      el.textContent = '+';
      el.title = t('line.addPoint');
      el.addEventListener('pointerdown', (e) => {
        const a = this.pts[i], b = this.pts[i + 1];
        this.pts.splice(i + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
        this.#changed();
        this.#drag(e, i + 1);
      });
      this.layer.append(el);
      this.handles.push({ el, at: () => { const a = this.pts[i], b = this.pts[i + 1]; return a && b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] : null; } });
    }
    this.#place();
    this.ctx.viewer.invalidate();
  }

  #drag(e, i) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const v = this.ctx.viewer;
    v.controls.enabled = false;
    const el = e.currentTarget?.isConnected ? e.currentTarget : this.handles[i]?.el;
    el?.setPointerCapture?.(e.pointerId);
    let raf = 0;
    const move = (ev) => {
      const p = this.#pointAt(ev, this.pts[i][2]);
      if (!p) return;
      this.pts[i] = p;
      this.#place();
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; this.ctx.onChange(this.path, this.pts); });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      cancelAnimationFrame(raf);
      v.controls.enabled = true;
      if (this.path) this.#changed();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /** The point under the cursor: on the model surface, else at height z (IFC). */
  #pointAt(e, z) {
    const v = this.ctx.viewer;
    const hit = v.pick(e.clientX, e.clientY); // also sets up v.raycaster for the cursor
    if (hit) { const q = v.toIfc(hit.point); return [q.x, q.y, q.z]; }
    const y = v.fromIfc(0, 0, z).y;
    const p = v.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), new THREE.Vector3());
    if (!p) return null;
    const q = v.toIfc(p);
    return [q.x, q.y, z];
  }

  #place() {
    if (!this.path || !this.handles) return;
    const v = this.ctx.viewer;
    for (const hd of this.handles) {
      const p = hd.at();
      const s = p ? v.toScreen(v.fromIfc(p[0], p[1], p[2])) : null;
      if (!s) { hd.el.style.display = 'none'; continue; }
      hd.el.style.display = '';
      hd.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%)`;
    }
  }
}
