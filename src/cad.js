// DWG / DXF drawings in the view (#135): the segments from cad-worker.js as lines per layer, the
// texts as labels, placed in the models' coordinates – the drawing's coordinates read as map
// coordinates (inverse IfcMapConversion) or as the models' own, whichever lands nearer the models
// (as point clouds do). A drawing without heights lies at a level of its own and can be drawn on top
// of the models, as a 2D base in plan.
import * as THREE from 'three';

const UNIT_M = { 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1, 14: 0.1 }; // INSUNITS -> m
const MAX_TEXT_SPRITES = 2000;
let uid = 1;

let worker = null, seq = 0;
const pending = new Map();
/** Reads a DWG or DXF file in the worker: {layers, texts, units, segments, skipped, types}. */
export function readCad(bytes, kind, onProgress = () => {}) {
  if (!worker) {
    worker = new Worker(new URL('./cad-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const p = pending.get(data.id);
      if (!p) return;
      if (data.progress !== undefined) { p.onProgress(data.progress); return; }
      pending.delete(data.id);
      if (data.error) p.reject(new Error(data.error)); else p.resolve(data.result);
    };
    worker.onerror = (e) => { for (const p of pending.values()) p.reject(new Error(e.message || 'CAD worker failed')); pending.clear(); worker = null; };
  }
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    worker.postMessage({ id, bytes, kind }, [bytes]);
  });
}

/** Dark lines on a light background: CAD's white (7) is drawn dark. */
const shown = (c, dark) => (!dark && (c === 0xffffff || c === 0xc0c0c0) ? 0x2b2f33 : c);

export class CadDrawing {
  constructor(viewer, name, data) {
    this.uid = uid++;
    this.viewer = viewer;
    this.name = name;
    this.data = data;
    this.visible = true;
    this.onTop = true;
    this.unit = UNIT_M[data.units] ?? 1; // m per drawing unit (unknown: metres, as map coordinates are)
    this.unitDetected = UNIT_M[data.units] ? data.units : null;
    this.flat = data.layers.every((l) => { for (let i = 2; i < l.segs.length; i += 3) if (l.segs[i] !== 0) return false; return true; });
    this.level = null; // the height of a flat drawing (m, IFC); null: the lowest point of the models
    this.group = new THREE.Group();
    this.group.name = `drawing ${name}`;
    this.group.matrixAutoUpdate = false;
    viewer.scene.add(this.group);
    this.layers = data.layers.map((l) => ({ name: l.name, color: l.color, on: l.on, n: l.n, texts: l.texts, obj: null, labels: [] }));
    this.placement = 'raw';
    this.build();
  }

  /** The origin of the drawing (first point), so the numbers on the GPU stay small. */
  #origin() {
    for (const l of this.data.layers) if (l.segs.length) return [l.segs[0], l.segs[1], 0];
    const tx = this.data.texts[0];
    return tx ? [tx.x, tx.y, 0] : [0, 0, 0];
  }

  /** Drawing coordinates (m) -> IFC: as map coordinates or as they are, whichever is nearer the models. */
  #placement(o) {
    const v = this.viewer;
    const raw = new THREE.Matrix4();
    const cands = [['raw', raw]];
    const toIfc = v.mapToIfcMatrix?.();
    if (toIfc) cands.push(['map', toIfc]);
    const box = v.sceneBox({ visibleOnly: false, clouds: false });
    const center = box.isEmpty() ? null : v.toIfc(box.getCenter(new THREE.Vector3()));
    let best = cands[0], bestD = Infinity;
    for (const c of cands) {
      const p = new THREE.Vector3(...o).applyMatrix4(c[1]);
      const d = center ? Math.hypot(p.x - center.x, p.y - center.y) : 0;
      if (d < bestD) { best = c; bestD = d; }
    }
    return { name: best[0], M: best[1] };
  }

  /** (Re)builds the lines and labels: after a change of unit, level or placement. */
  build() {
    for (const l of this.layers) {
      if (l.obj) { this.group.remove(l.obj); l.obj.geometry.dispose(); l.obj.material.dispose(); l.obj = null; }
      for (const s of l.labels) { this.group.remove(s); s.material.map?.dispose(); s.material.dispose(); }
      l.labels = [];
    }
    const v = this.viewer, k = this.unit;
    const o = this.#origin().map((x) => x * k);
    const pl = this.#placement(o);
    this.placement = pl.name;
    // a flat drawing: at the level chosen, else under the models
    const box = v.sceneBox({ visibleOnly: false, clouds: false });
    const low = box.isEmpty() ? 0 : v.toIfc(box.min.clone()).z;
    const zFlat = this.flat ? (this.level ?? low) : null;
    this.levelShown = zFlat;
    // IFC point of drawing origin; vertices relative to it (in IFC axes)
    const O = new THREE.Vector3(o[0], o[1], 0).applyMatrix4(pl.M);
    const R = pl.M.clone().setPosition(0, 0, 0); // rotation/scale of the placement
    const dark = document.documentElement.dataset.theme === 'dark';
    const q = new THREE.Vector3();
    this.data.layers.forEach((L, i) => {
      const lay = this.layers[i], S = L.segs, n = S.length / 3;
      const pos = new Float32Array(S.length);
      for (let j = 0; j < n; j++) {
        q.set(S[j * 3] * k - o[0], S[j * 3 + 1] * k - o[1], 0).applyMatrix4(R);
        pos[j * 3] = q.x; pos[j * 3 + 1] = q.y; pos[j * 3 + 2] = zFlat !== null ? 0 : S[j * 3 + 2] * k;
      }
      if (n) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const m = new THREE.LineBasicMaterial({ color: shown(lay.color, dark), depthTest: !this.onTop, depthWrite: false, transparent: this.onTop });
        lay.obj = new THREE.LineSegments(g, m);
        lay.obj.renderOrder = this.onTop ? 1e7 - 5 : 0;
        lay.obj.frustumCulled = false;
        lay.obj.raycast = () => {};
        lay.obj.visible = lay.on;
        this.group.add(lay.obj);
      }
    });
    // texts: labels lying in plan would need a font as geometry; sprites face the camera instead
    const T = this.data.texts.slice(0, MAX_TEXT_SPRITES);
    for (const tx of T) {
      const lay = this.layers[tx.layer];
      if (!lay) continue;
      q.set(tx.x * k - o[0], tx.y * k - o[1], 0).applyMatrix4(R);
      const s = textSprite(tx.s, shown(lay.color, dark), tx.h * k);
      if (!s) continue;
      s.position.set(q.x, q.y, zFlat !== null ? 0 : tx.z * k);
      s.material.rotation = tx.rot;
      s.material.depthTest = !this.onTop;
      s.renderOrder = this.onTop ? 1e7 - 4 : 0;
      s.visible = lay.on;
      lay.labels.push(s);
      this.group.add(s);
    }
    this.textsShown = T.length;
    // IFC (Z up, relative to O at height zFlat or 0) -> viewer
    const toViewer = new THREE.Matrix4().copy(v.referenceMatrix || new THREE.Matrix4())
      .multiply(new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1))
      .multiply(new THREE.Matrix4().makeTranslation(O.x, O.y, zFlat !== null ? zFlat : O.z));
    this.group.matrix.copy(toViewer);
    this.group.matrixWorldNeedsUpdate = true;
    this.group.updateMatrixWorld(true);
    this.group.visible = this.visible;
    v.invalidate?.();
  }

  setVisible(b) { this.visible = b; this.group.visible = b; this.viewer.invalidate?.(); }
  setLayer(i, on) {
    const l = this.layers[i];
    if (!l) return;
    l.on = on;
    if (l.obj) l.obj.visible = on;
    for (const s of l.labels) s.visible = on;
    this.viewer.invalidate?.();
  }
  setUnit(m) { this.unit = m; this.build(); }
  setLevel(z) { this.level = Number.isFinite(z) ? z : null; this.build(); }
  setOnTop(b) { this.onTop = b; this.build(); }

  getBox() {
    const b = new THREE.Box3();
    for (const l of this.layers) if (l.obj && l.on) { l.obj.geometry.computeBoundingBox(); b.union(l.obj.geometry.boundingBox.clone().applyMatrix4(this.group.matrixWorld)); }
    return b;
  }

  dispose() {
    for (const l of this.layers) {
      if (l.obj) { l.obj.geometry.dispose(); l.obj.material.dispose(); }
      for (const s of l.labels) { s.material.map?.dispose(); s.material.dispose(); }
    }
    this.viewer.scene.remove(this.group);
    this.viewer.invalidate?.();
  }
}

/** A text as a sprite of the given height (m); the canvas is 48 px per line. */
function textSprite(text, color, h) {
  if (!(h > 0)) return null;
  const lines = String(text).split('\n').slice(0, 6);
  const px = 48;
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = `${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  g.font = font;
  const w = Math.min(2048, Math.ceil(Math.max(...lines.map((l) => g.measureText(l).width), 1)) + 8);
  c.width = w; c.height = px * 1.25 * lines.length;
  g.font = font;
  g.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  g.textBaseline = 'top';
  lines.forEach((l, i) => g.fillText(l, 4, i * px * 1.25));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  const k = h / px; // m per canvas px (text height = the drawing's text height)
  s.scale.set(c.width * k, c.height * k, 1);
  s.center.set(0, 1 - 1 / (1.25 * lines.length)); // the insertion point at the baseline of the first line, left
  s.raycast = () => {};
  return s;
}
