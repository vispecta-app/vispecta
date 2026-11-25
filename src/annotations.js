// Annotations in the 3D view (#130): text notes at a point of the model, and arrows between two
// points (with an optional text at the tail). They are drawn by WebGL – not as HTML on top – so they
// are part of screenshots and of the snapshots of BCF issues. Size on screen stays the same however
// far away they are (scaled before every frame).
//
// item: {id, p: Vector3 (viewer coordinates), q: Vector3 | null (arrow head), text, color '#rrggbb'}
// Saved (projects, views, BCF) in IFC coordinates: toJSON() / fromJSON().
import * as THREE from 'three';

const ORDER = 1e7 + 10; // over the model and the section lines
const FONT_PX = 13;
const PAD = 5;
const HEAD_PX = 14; // length of the arrow head
const DOT_PX = 7;
let seq = 1;

export const ANNOT_COLORS = ['#e74c3c', '#f39c12', '#27ae60', '#2980b9', '#8e44ad', '#2c3e50'];

export class AnnotationLayer extends EventTarget {
  constructor(viewer) {
    super();
    this.viewer = viewer;
    this.items = [];
    this.mode = null; // 'note' | 'arrow' | null
    this.color = ANNOT_COLORS[0];
    this.pending = null; // arrow: the first point
    this.visible = true;
    this.group = new THREE.Group();
    this.group.renderOrder = ORDER;
    viewer.scene.add(this.group);
    this.objs = new Map(); // id -> {label, line, head, dot, w, h}
    this.pendingDot = this.#dot('#888888');
    this.pendingDot.visible = false;
    this.group.add(this.pendingDot);
    (viewer.beforeRenderHooks ||= []).push(() => this.#scale());
    this.#bindDrag();
  }

  // ------------------------------------------------------------ moving and editing
  /**
   * The handle under a screen point while annotating: a note's label or point, an arrow's tail
   * (with its label) or head. Returns {it, end: 'p' | 'q'} or null.
   */
  handleAt(clientX, clientY) {
    if (!this.visible) return null;
    const rect = this.viewer.renderer.domElement.getBoundingClientRect();
    const x = clientX - rect.left, y = clientY - rect.top;
    let best = null, bestD = 12; // px
    for (const it of [...this.items].reverse()) {
      for (const end of it.q ? ['q', 'p'] : ['p']) {
        const s = this.viewer.toScreen(it[end]);
        if (!s) continue;
        const d = Math.hypot(s.x - x, s.y - y);
        if (d < bestD) { bestD = d; best = { it, end }; }
      }
      // on the label (its lower left corner is at p)
      const lab = this.objs.get(it.id)?.label, s = this.viewer.toScreen(it.p);
      if (!best && lab && s) {
        const [w, h] = lab.userData.px;
        if (x >= s.x && x <= s.x + w && y <= s.y && y >= s.y - h) best = { it, end: 'p' };
      }
    }
    return best;
  }

  #bindDrag() {
    const v = this.viewer, el = v.renderer.domElement;
    let drag = null;
    v.container.addEventListener('pointerdown', (e) => {
      if (!this.mode || e.button !== 0 || e.target !== el) return;
      const hd = this.handleAt(e.clientX, e.clientY);
      if (!hd) return;
      // not to the camera controls, and not a click that makes a new note
      e.stopPropagation();
      e.preventDefault();
      const start = hd.it[hd.end].clone();
      const cam = v.camera.getWorldDirection(new THREE.Vector3());
      drag = { ...hd, x: e.clientX, y: e.clientY, moved: false, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(cam, start), id: e.pointerId };
      el.setPointerCapture?.(e.pointerId);
    }, { capture: true });
    window.addEventListener('pointermove', (e) => {
      if (!drag) {
        if (this.mode && !e.buttons && e.target === el) el.style.cursor = this.handleAt(e.clientX, e.clientY) ? 'move' : '';
        return;
      }
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return;
      drag.moved = true;
      // onto the model under the mouse, else at the same depth
      const hit = v.pick(e.clientX, e.clientY);
      let p = hit?.point;
      if (!p) {
        const rect = el.getBoundingClientRect();
        const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
        const ray = new THREE.Raycaster();
        ray.setFromCamera(ndc, v.camera);
        p = ray.ray.intersectPlane(drag.plane, new THREE.Vector3());
      }
      if (!p) return;
      drag.it[drag.end].copy(p);
      this.#dispose(drag.it.id);
      this.#build(drag.it);
    });
    const end = (e) => {
      if (!drag) return;
      const d = drag;
      drag = null;
      el.releasePointerCapture?.(e.pointerId);
      if (d.moved) this.dispatchEvent(Object.assign(new Event('moved'), { item: d.it }));
      else this.dispatchEvent(Object.assign(new Event('edit'), { item: d.it })); // a click on it: its text
      this.#emit();
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  #emit() { this.dispatchEvent(new Event('change')); this.viewer.invalidate?.(); }

  setMode(mode) {
    this.mode = mode;
    this.pending = null;
    this.pendingDot.visible = false;
    this.viewer.dblclickCenters = !mode;
    this.#emit();
  }

  /** A click in the view while annotating: returns the new item when one was made. */
  handleClick(clientX, clientY) {
    const hit = this.viewer.pick(clientX, clientY);
    if (!hit) return null;
    const p = hit.point.clone();
    if (this.mode === 'note') return this.add({ p, text: '' });
    if (this.mode === 'arrow') {
      if (!this.pending) {
        this.pending = p;
        this.pendingDot.position.copy(p);
        this.pendingDot.visible = true;
        this.#emit();
        return null;
      }
      const tail = this.pending;
      this.pending = null;
      this.pendingDot.visible = false;
      if (tail.distanceTo(p) < 1e-6) { this.#emit(); return null; }
      return this.add({ p: tail, q: p, text: '' });
    }
    return null;
  }

  /** Esc: the first point of an arrow, then the mode. */
  cancel() {
    if (this.pending) { this.pending = null; this.pendingDot.visible = false; this.#emit(); return true; }
    if (this.mode) { this.setMode(null); return true; }
    return false;
  }

  add({ p, q = null, text = '', color = this.color }) {
    const it = { id: seq++, p: p.clone(), q: q ? q.clone() : null, text, color };
    this.items.push(it);
    this.#build(it);
    this.#emit();
    return it;
  }

  update(id, props) {
    const it = this.items.find((x) => x.id === id);
    if (!it) return;
    Object.assign(it, props);
    this.#dispose(id);
    this.#build(it);
    this.#emit();
  }

  remove(id) {
    this.#dispose(id);
    this.items = this.items.filter((x) => x.id !== id);
    this.#emit();
  }

  clear() {
    for (const it of this.items) this.#dispose(it.id);
    this.items = [];
    this.pending = null;
    this.pendingDot.visible = false;
    this.#emit();
  }

  setVisible(v) {
    this.visible = v;
    this.group.visible = v;
    this.#emit();
  }

  /** A box around an item (for zoom to). */
  box(id) {
    const it = this.items.find((x) => x.id === id);
    if (!it) return null;
    const b = new THREE.Box3().setFromPoints(it.q ? [it.p, it.q] : [it.p]);
    return b.expandByScalar(Math.max(1, b.getSize(new THREE.Vector3()).length() * 0.3));
  }

  // ----------------------------------------------------------------- saving
  toJSON() {
    const v = this.viewer;
    const ifc = (p) => v.toIfc(p.clone()).toArray().map((x) => Math.round(x * 1e4) / 1e4);
    return this.items.map((it) => ({ p: ifc(it.p), ...(it.q ? { q: ifc(it.q) } : {}), text: it.text, color: it.color }));
  }

  fromJSON(list) {
    for (const it of this.items) this.#dispose(it.id);
    this.items = [];
    for (const x of Array.isArray(list) ? list : []) {
      if (!Array.isArray(x?.p) || x.p.length < 3 || !x.p.every(Number.isFinite)) continue;
      const q = Array.isArray(x.q) && x.q.length >= 3 && x.q.every(Number.isFinite) ? this.viewer.fromIfc(...x.q) : null;
      const color = /^#[0-9a-f]{6}$/i.test(x.color) ? x.color : ANNOT_COLORS[0];
      const it = { id: seq++, p: this.viewer.fromIfc(...x.p), q, text: String(x.text ?? '').slice(0, 2000), color };
      this.items.push(it);
      this.#build(it);
    }
    this.#emit();
  }

  /** Arrows as BCF lines (IFC coordinates). */
  bcfLines() {
    const v = this.viewer;
    return this.items.filter((it) => it.q).map((it) => ({ start: v.toIfc(it.p.clone()).toArray(), end: v.toIfc(it.q.clone()).toArray() }));
  }

  // --------------------------------------------------------------- drawing
  #dot(color) {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    g.fillStyle = color; g.strokeStyle = '#ffffff'; g.lineWidth = 5;
    g.beginPath(); g.arc(16, 16, 12, 0, Math.PI * 2); g.fill(); g.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true }));
    s.renderOrder = ORDER + 2;
    s.userData.px = [DOT_PX, DOT_PX];
    s.frustumCulled = false;
    return s;
  }

  #label(text, color) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const lines = String(text).split('\n').slice(0, 12);
    const c = document.createElement('canvas');
    const g = c.getContext('2d');
    const font = `600 ${FONT_PX * dpr}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    g.font = font;
    const lh = FONT_PX * 1.3;
    const w = Math.ceil(Math.max(...lines.map((l) => g.measureText(l).width / dpr), 8) + PAD * 2);
    const h = Math.ceil(lines.length * lh + PAD * 2);
    const tail = 8; // the pointer under the box
    c.width = (w + 2) * dpr; c.height = (h + tail + 2) * dpr;
    g.scale(dpr, dpr);
    g.font = font;
    // box with a pointer at its lower left corner (the anchor)
    g.fillStyle = 'rgba(255,255,255,0.94)';
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.beginPath();
    const r = 4, x0 = 1, y0 = 1, x1 = w, y1 = h;
    g.moveTo(x0 + r, y0); g.lineTo(x1 - r, y0); g.quadraticCurveTo(x1, y0, x1, y0 + r);
    g.lineTo(x1, y1 - r); g.quadraticCurveTo(x1, y1, x1 - r, y1);
    g.lineTo(x0 + 12, y1); g.lineTo(x0, y1 + tail); g.lineTo(x0 + 4, y1);
    g.lineTo(x0 + r, y1); g.quadraticCurveTo(x0, y1, x0, y1 - r);
    g.lineTo(x0, y0 + r); g.quadraticCurveTo(x0, y0, x0 + r, y0);
    g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#1d2327';
    g.textBaseline = 'top';
    lines.forEach((l, i) => g.fillText(l, x0 + PAD, y0 + PAD + i * lh));
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true }));
    s.center.set(0, 0); // the lower left corner (the pointer's tip) at the point
    s.renderOrder = ORDER + 3;
    s.frustumCulled = false;
    s.userData.px = [c.width / dpr, c.height / dpr];
    return s;
  }

  #build(it) {
    const o = {};
    const col = new THREE.Color(it.color);
    if (it.q) {
      const mat = new THREE.LineBasicMaterial({ color: col, depthTest: false, depthWrite: false, transparent: true });
      o.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([it.p, it.q]), mat);
      o.line.renderOrder = ORDER;
      o.line.frustumCulled = false;
      const cone = new THREE.ConeGeometry(0.35, 1, 12).translate(0, -0.5, 0); // tip at the origin
      o.head = new THREE.Mesh(cone, new THREE.MeshBasicMaterial({ color: col, depthTest: false, depthWrite: false, transparent: true }));
      o.head.renderOrder = ORDER + 1;
      o.head.frustumCulled = false;
      o.head.position.copy(it.q);
      o.head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), it.q.clone().sub(it.p).normalize());
      o.head.userData.px = [HEAD_PX, HEAD_PX];
      this.group.add(o.line, o.head);
    } else {
      o.dot = this.#dot(it.color);
      o.dot.position.copy(it.p);
      this.group.add(o.dot);
    }
    if (it.text.trim() || !it.q) {
      o.label = this.#label(it.text.trim() || '…', it.color);
      o.label.position.copy(it.p);
      this.group.add(o.label);
    }
    this.objs.set(it.id, o);
    this.viewer.invalidate?.();
  }

  #dispose(id) {
    const o = this.objs.get(id);
    if (!o) return;
    for (const x of Object.values(o)) {
      if (!x?.isObject3D) continue;
      this.group.remove(x);
      x.geometry?.dispose();
      x.material?.map?.dispose();
      x.material?.dispose();
    }
    this.objs.delete(id);
  }

  /** World units per screen pixel at a point. */
  #wpp(p) {
    const cam = this.viewer.camera;
    const H = this.viewer.renderer.domElement.clientHeight || 1;
    if (cam.isOrthographicCamera) return (cam.top - cam.bottom) / cam.zoom / H;
    const d = Math.max(1e-6, p.clone().sub(cam.position).dot(cam.getWorldDirection(new THREE.Vector3())));
    return (2 * d * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) / H;
  }

  #scale() {
    if (!this.group.visible || (!this.items.length && !this.pendingDot.visible)) return;
    for (const s of this.group.children) {
      const px = s.userData.px;
      if (!px) continue;
      const k = this.#wpp(s.position);
      if (s.isSprite) s.scale.set(px[0] * k, px[1] * k, 1);
      else s.scale.setScalar(px[0] * k);
    }
  }
}
