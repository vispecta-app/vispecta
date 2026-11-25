// Annotations in the 3D view (#130): text notes at a point of the model, and arrows between two
// points (with an optional text at the tail). They are drawn by WebGL – not as HTML on top – so they
// are part of screenshots and of the snapshots of BCF issues. Size on screen stays the same however
// far away they are (scaled before every frame).
//
// Markup shapes (#133): revision clouds with a text box, rectangles, ellipses and freehand lines,
// dragged out on the screen. They lie in a plane square to the view at the depth of the model where
// the drag began, so they mark what was seen from there (a saved view brings that camera back).
//
// item: {id, p: Vector3 (viewer coordinates; the text's anchor), q: Vector3 | null (arrow head),
//        kind: 'note' | 'arrow' | 'cloud' | 'rect' | 'ellipse' | 'pen', pts: [Vector3] (shapes),
//        text, color '#rrggbb', width (px)}
// Saved (projects, views, BCF) in IFC coordinates: toJSON() / fromJSON().
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const ORDER = 1e7 + 10; // over the model and the section lines
const FONT_PX = 13;
const PAD = 5;
const HEAD_PX = 14; // length of the arrow head
const DOT_PX = 7;
const MAX_PTS = 4000; // points of one shape (a long freehand line is thinned)
let seq = 1;

export const ANNOT_COLORS = ['#e74c3c', '#f39c12', '#27ae60', '#2980b9', '#8e44ad', '#2c3e50'];
export const ANNOT_WIDTHS = [2, 4, 7]; // px: thin, medium, thick
export const SHAPES = ['cloud', 'rect', 'ellipse', 'pen'];
export const kindOf = (it) => it.kind || (it.q ? 'arrow' : 'note');

/**
 * The outline of a shape in 2D (u right, v up), from the corners of the dragged box: a revision
 * cloud (arcs bulging outwards along the edges), a rectangle or an ellipse.
 */
export function shapeOutline(kind, u0, v0, u1, v1) {
  const a = Math.min(u0, u1), b = Math.max(u0, u1), c = Math.min(v0, v1), d = Math.max(v0, v1);
  const w = b - a, h = d - c;
  if (kind === 'rect') return [[a, c], [b, c], [b, d], [a, d], [a, c]];
  if (kind === 'ellipse') {
    const out = [];
    for (let i = 0; i <= 72; i++) { const t = (i / 72) * Math.PI * 2; out.push([(a + b) / 2 + (w / 2) * Math.cos(t), (c + d) / 2 + (h / 2) * Math.sin(t)]); }
    return out;
  }
  // cloud: arcs of about a quarter of the short side (at least two per side, at most 24)
  const target = Math.max(Math.min(w, h) / 4, Math.max(w, h) / 48, 1e-9);
  const corners = [[a, c], [b, c], [b, d], [a, d]];
  const cu = (a + b) / 2, cv = (c + d) / 2;
  const out = [];
  for (let k = 0; k < 4; k++) {
    const [x0, y0] = corners[k], [x1, y1] = corners[(k + 1) % 4];
    const len = Math.hypot(x1 - x0, y1 - y0), n = Math.min(24, Math.max(2, Math.round(len / target)));
    for (let j = 0; j < n; j++) {
      const ax = x0 + ((x1 - x0) * j) / n, ay = y0 + ((y1 - y0) * j) / n;
      const bx = x0 + ((x1 - x0) * (j + 1)) / n, by = y0 + ((y1 - y0) * (j + 1)) / n;
      const mx = (ax + bx) / 2, my = (ay + by) / 2, r = Math.hypot(bx - ax, by - ay) / 2;
      const dx = (bx - ax) / (2 * r || 1), dy = (by - ay) / (2 * r || 1);
      let ox = -dy, oy = dx; // outwards: away from the middle of the box
      if (ox * (mx - cu) + oy * (my - cv) < 0) { ox = -ox; oy = -oy; }
      for (let i = 0; i < 8; i++) {
        const t = (i / 8) * Math.PI;
        out.push([mx - dx * r * Math.cos(t) + ox * r * Math.sin(t), my - dy * r * Math.cos(t) + oy * r * Math.sin(t)]);
      }
    }
  }
  out.push(out[0]);
  return out;
}

export class AnnotationLayer extends EventTarget {
  constructor(viewer) {
    super();
    this.viewer = viewer;
    this.items = [];
    this.mode = null; // 'note' | 'arrow' | one of SHAPES | null
    this.color = ANNOT_COLORS[0];
    this.width = ANNOT_WIDTHS[1];
    this.mats = new Set(); // line materials: their resolution follows the canvas
    this.pending = null; // arrow: the first point
    this.visible = true;
    this.group = new THREE.Group();
    this.group.renderOrder = ORDER;
    viewer.scene.add(this.group);
    this.objs = new Map(); // id -> {label, line, head, dot, w, h}
    this.pendingDot = this.#dot('#888888');
    this.pendingDot.visible = false;
    this.group.add(this.pendingDot);
    this.preview = null; // the shape being dragged out
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
      // a shape: on its outline (moves the whole shape)
      if (!best && it.pts?.length) {
        let prev = null;
        const step = Math.max(1, Math.floor(it.pts.length / 400));
        for (let i = 0; i < it.pts.length && !best; i += step) {
          const q = this.viewer.toScreen(it.pts[i]);
          if (q && prev) {
            const ex = q.x - prev.x, ey = q.y - prev.y, L2 = ex * ex + ey * ey || 1;
            const tt = Math.max(0, Math.min(1, ((x - prev.x) * ex + (y - prev.y) * ey) / L2));
            if (Math.hypot(prev.x + ex * tt - x, prev.y + ey * tt - y) < Math.max(6, it.width || 0)) best = { it, end: 'all' };
          }
          prev = q;
        }
      }
      if (best) return best;
    }
    return best;
  }

  #bindDrag() {
    const v = this.viewer, el = v.renderer.domElement;
    let drag = null;
    const onPlane = (e, plane) => {
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, v.camera);
      return ray.ray.intersectPlane(plane, new THREE.Vector3());
    };
    v.container.addEventListener('pointerdown', (e) => {
      if (!this.mode || e.button !== 0 || e.target !== el) return;
      const hd = this.handleAt(e.clientX, e.clientY);
      const cam = v.camera.getWorldDirection(new THREE.Vector3());
      if (!hd && !SHAPES.includes(this.mode)) return;
      // not to the camera controls, and not a click that makes a new note
      e.stopPropagation();
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      if (!hd) {
        // a new shape: in the plane square to the view through the model under the mouse
        const at = v.pick(e.clientX, e.clientY)?.point || v.controls?.target?.clone() || new THREE.Vector3();
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(cam, at);
        const m = v.camera.matrixWorld;
        const U = new THREE.Vector3().setFromMatrixColumn(m, 0).normalize(), V = new THREE.Vector3().setFromMatrixColumn(m, 1).normalize();
        drag = { create: this.mode, x: e.clientX, y: e.clientY, moved: false, plane, origin: onPlane(e, plane) || at, U, V, pen: [], last: null };
        return;
      }
      const start = hd.end === 'all' ? null : hd.it[hd.end].clone();
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(cam, start || hd.it.p);
      drag = { ...hd, x: e.clientX, y: e.clientY, moved: false, plane, grab: onPlane(e, plane), p0: hd.it.p.clone(), pts0: hd.it.pts?.map((q) => q.clone()) || null };
    }, { capture: true });
    window.addEventListener('pointermove', (e) => {
      if (!drag) {
        if (this.mode && !e.buttons && e.target === el) el.style.cursor = this.handleAt(e.clientX, e.clientY) ? 'move' : '';
        return;
      }
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return;
      drag.moved = true;
      if (drag.create) { this.#dragShape(drag, onPlane(e, drag.plane), e); return; }
      // a shape, or the text of one: moved as a whole, in its plane
      if (drag.pts0 || drag.end === 'all') {
        const q = onPlane(e, drag.plane);
        if (!q || !drag.grab) return;
        const dlt = q.sub(drag.grab);
        drag.it.p.copy(drag.p0).add(dlt);
        if (drag.pts0) drag.it.pts = drag.pts0.map((x) => x.clone().add(dlt));
        this.#dispose(drag.it.id);
        this.#build(drag.it);
        return;
      }
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
      if (d.create) { this.#finishShape(d); return; }
      if (d.moved) this.dispatchEvent(Object.assign(new Event('moved'), { item: d.it }));
      else this.dispatchEvent(Object.assign(new Event('edit'), { item: d.it })); // a click on it: its text
      this.#emit();
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  #emit() { this.dispatchEvent(new Event('change')); this.viewer.invalidate?.(); }

  /** The points of a shape being dragged out, from the start to the point q (in the drag's plane). */
  #shapePoints(d, q) {
    if (d.create === 'pen') return d.pen;
    const o = d.origin, w = q.clone().sub(o);
    const u1 = w.dot(d.U), v1 = w.dot(d.V);
    return shapeOutline(d.create, 0, 0, u1, v1).map(([u, vv]) => o.clone().addScaledVector(d.U, u).addScaledVector(d.V, vv));
  }

  #dragShape(d, q, e) {
    if (!q) return;
    d.q = q;
    if (d.create === 'pen') {
      // a point when the mouse has moved 3 px
      if (!d.last || Math.hypot(e.clientX - d.last[0], e.clientY - d.last[1]) >= 3) {
        if (!d.pen.length) d.pen.push(d.origin.clone());
        d.pen.push(q.clone());
        d.last = [e.clientX, e.clientY];
      }
    }
    const pts = this.#shapePoints(d, q);
    if (pts.length < 2) return;
    if (!this.preview) {
      this.preview = this.#fatLine(pts, this.color, this.width);
      this.preview.material.opacity = 0.7;
      this.group.add(this.preview);
    } else this.preview.geometry.setPositions(pts.flatMap((x) => [x.x, x.y, x.z]));
    this.viewer.invalidate?.();
  }

  #finishShape(d) {
    if (this.preview) { this.group.remove(this.preview); this.preview.geometry.dispose(); this.mats.delete(this.preview.material); this.preview.material.dispose(); this.preview = null; }
    if (!d.moved || !d.q) { this.viewer.invalidate?.(); return; }
    let pts = this.#shapePoints(d, d.q);
    // too small to mean anything (under 6 px across)
    const sa = this.viewer.toScreen(d.origin), sb = this.viewer.toScreen(d.q);
    if (pts.length < 2 || (d.create !== 'pen' && sa && sb && Math.abs(sa.x - sb.x) < 6 && Math.abs(sa.y - sb.y) < 6)) { this.viewer.invalidate?.(); return; }
    if (pts.length > MAX_PTS) { const k = Math.ceil(pts.length / MAX_PTS); pts = pts.filter((_, i) => i % k === 0 || i === pts.length - 1); }
    // the text sits at the top left corner of the shape (in the view it was drawn in)
    let anchor = pts[0], best = -Infinity;
    for (const x of pts) { const sc = x.dot(d.V) - x.dot(d.U) * 0.5; if (sc > best) { best = sc; anchor = x; } }
    const it = this.add({ p: anchor, kind: d.create, pts, text: '' });
    this.dispatchEvent(Object.assign(new Event('created'), { item: it }));
  }

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

  add({ p, q = null, kind = null, pts = null, text = '', color = this.color, width = this.width }) {
    const it = { id: seq++, p: p.clone(), q: q ? q.clone() : null, kind: kind || (q ? 'arrow' : 'note'), pts: pts ? pts.map((x) => x.clone()) : null, text, color, width };
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
    const b = new THREE.Box3().setFromPoints([it.p, ...(it.q ? [it.q] : []), ...(it.pts || [])]);
    return b.expandByScalar(Math.max(1, b.getSize(new THREE.Vector3()).length() * 0.3));
  }

  // ----------------------------------------------------------------- saving
  toJSON() {
    const v = this.viewer;
    const ifc = (p) => v.toIfc(p.clone()).toArray().map((x) => Math.round(x * 1e4) / 1e4);
    return this.items.map((it) => ({
      p: ifc(it.p), ...(it.q ? { q: ifc(it.q) } : {}), ...(it.pts ? { kind: it.kind, pts: it.pts.map(ifc) } : {}),
      text: it.text, color: it.color, ...(it.width && it.width !== ANNOT_WIDTHS[1] ? { width: it.width } : {}),
    }));
  }

  fromJSON(list) {
    for (const it of this.items) this.#dispose(it.id);
    this.items = [];
    for (const x of Array.isArray(list) ? list : []) {
      if (!Array.isArray(x?.p) || x.p.length < 3 || !x.p.every(Number.isFinite)) continue;
      const q = Array.isArray(x.q) && x.q.length >= 3 && x.q.every(Number.isFinite) ? this.viewer.fromIfc(...x.q) : null;
      const color = /^#[0-9a-f]{6}$/i.test(x.color) ? x.color : ANNOT_COLORS[0];
      // shapes (from a project or view file): only well-formed points, and not too many
      const okPt = (a) => Array.isArray(a) && a.length >= 3 && a.slice(0, 3).every(Number.isFinite);
      const pts = SHAPES.includes(x.kind) && Array.isArray(x.pts) && x.pts.length >= 2 && x.pts.length <= MAX_PTS && x.pts.every(okPt)
        ? x.pts.map((a) => this.viewer.fromIfc(a[0], a[1], a[2])) : null;
      const width = ANNOT_WIDTHS.includes(x.width) ? x.width : ANNOT_WIDTHS[1];
      const it = { id: seq++, p: this.viewer.fromIfc(...x.p), q, kind: pts ? x.kind : (q ? 'arrow' : 'note'), pts, text: String(x.text ?? '').slice(0, 2000), color, width };
      this.items.push(it);
      this.#build(it);
    }
    this.#emit();
  }

  /** Arrows and the outlines of shapes as BCF lines (IFC coordinates; at most 2000 segments). */
  bcfLines() {
    const v = this.viewer, I = (p) => v.toIfc(p.clone()).toArray();
    const out = this.items.filter((it) => it.q).map((it) => ({ start: I(it.p), end: I(it.q) }));
    for (const it of this.items) {
      if (!it.pts) continue;
      const k = Math.max(1, Math.ceil(it.pts.length / 200)); // a shape in at most ~200 segments
      const pts = it.pts.filter((_, i) => i % k === 0 || i === it.pts.length - 1);
      for (let i = 0; i + 1 < pts.length && out.length < 2000; i++) out.push({ start: I(pts[i]), end: I(pts[i + 1]) });
    }
    return out;
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
    g.font = `600 ${FONT_PX}px system-ui, -apple-system, "Segoe UI", sans-serif`; // CSS px: the context is scaled by dpr
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

  #fatLine(pts, color, width) {
    const g = new LineGeometry();
    g.setPositions(pts.flatMap((x) => [x.x, x.y, x.z]));
    const mat = new LineMaterial({ color: new THREE.Color(color), linewidth: width || ANNOT_WIDTHS[1], worldUnits: false, depthTest: false, depthWrite: false, transparent: true });
    const r = this.viewer.renderer.domElement;
    mat.resolution.set(r.width, r.height);
    this.mats.add(mat);
    const l = new Line2(g, mat);
    l.renderOrder = ORDER;
    l.frustumCulled = false;
    l.raycast = () => {};
    return l;
  }

  #build(it) {
    const o = {};
    const col = new THREE.Color(it.color);
    if (it.pts) {
      o.shape = this.#fatLine(it.pts, it.color, it.width);
      this.group.add(o.shape);
    } else if (it.q) {
      o.line = this.#fatLine([it.p, it.q], it.color, Math.max(2, (it.width || ANNOT_WIDTHS[1]) - 1));
      const cone = new THREE.ConeGeometry(0.35, 1, 12).translate(0, -0.5, 0); // tip at the origin
      o.head = new THREE.Mesh(cone, new THREE.MeshBasicMaterial({ color: col, depthTest: false, depthWrite: false, transparent: true }));
      o.head.renderOrder = ORDER + 1;
      o.head.frustumCulled = false;
      o.head.position.copy(it.q);
      o.head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), it.q.clone().sub(it.p).normalize());
      o.head.userData.px = [HEAD_PX, HEAD_PX];
      this.group.add(o.line, o.head);
    } else if (!it.pts) {
      o.dot = this.#dot(it.color);
      o.dot.position.copy(it.p);
      this.group.add(o.dot);
    }
    // the text box: always for notes and clouds (a cloud is a remark), else when there is a text
    if (it.text.trim() || (!it.q && !it.pts) || it.kind === 'cloud') {
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
      this.mats.delete(x.material);
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
    if (!this.group.visible || (!this.items.length && !this.pendingDot.visible && !this.preview)) return;
    const r = this.viewer.renderer.domElement;
    for (const m of this.mats) m.resolution.set(r.width, r.height);
    for (const s of this.group.children) {
      const px = s.userData.px;
      if (!px) continue;
      const k = this.#wpp(s.position);
      if (s.isSprite) s.scale.set(px[0] * k, px[1] * k, 1);
      else s.scale.setScalar(px[0] * k);
    }
  }
}
