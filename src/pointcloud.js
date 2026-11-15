// Point clouds (#27): loading (in pointcloud-worker.js), display and the points near a section plane.
//
// A cloud keeps its points relative to an origin in its own coordinates (double precision origin,
// Float32 offsets). The viewer places it with one matrix: source coordinates -> IFC coordinates
// (as they are, or through the IfcMapConversion of the models when the cloud is in map
// coordinates) -> viewer coordinates. See Viewer.placeCloud.
import * as THREE from 'three';

/** ASPRS LAS classes: name and colour. */
export const LAS_CLASSES = {
  0: ['Never classified', '#9aa5a4'], 1: ['Unclassified', '#b8c2c1'], 2: ['Ground', '#a0703c'], 3: ['Low vegetation', '#9bd06b'],
  4: ['Medium vegetation', '#59a83a'], 5: ['High vegetation', '#2d7a2b'], 6: ['Building', '#d9534f'], 7: ['Low point (noise)', '#ff00ff'],
  8: ['Model key point', '#f0ad4e'], 9: ['Water', '#3a8fd9'], 10: ['Rail', '#5b4b8a'], 11: ['Road surface', '#606060'],
  12: ['Overlap', '#e0e0e0'], 13: ['Wire – guard', '#f2c94c'], 14: ['Wire – conductor', '#f2994a'], 15: ['Transmission tower', '#bb6bd9'],
  16: ['Wire – connector', '#eb5757'], 17: ['Bridge deck', '#8d6e63'], 18: ['High noise', '#ff4fd8'],
};
export const classColor = (c) => (LAS_CLASSES[c] || [null, '#cccccc'])[1];

/** Points drawn while the camera moves (all are drawn again when it stops). */
export function movingBudget() {
  const mem = navigator.deviceMemory || 8;
  const coarse = matchMedia?.('(pointer: coarse)').matches;
  return coarse || mem <= 2 ? 3e5 : mem <= 4 ? 6e5 : 1.2e6;
}

/** A point budget that fits the device: fewer points on phones and small devices. */
export function pointBudget() {
  const mem = navigator.deviceMemory || 8;
  const coarse = matchMedia?.('(pointer: coarse)').matches;
  if (coarse || mem <= 2) return 1.5e6;
  if (mem <= 4) return 3e6;
  return 5e6;
}

/** Reads a point cloud file in a worker. onProgress(fraction). Resolves to a PointCloud. */
export function loadPointCloud(file, { budget = pointBudget(), onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./pointcloud-worker.js', import.meta.url), { type: 'module' });
    w.onmessage = ({ data }) => {
      if (data.progress !== undefined) onProgress?.(data.progress);
      else if (data.error) { w.terminate(); reject(new Error(data.error)); }
      else if (data.done) { w.terminate(); resolve(new PointCloud(file.name, data.done)); }
    };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message || 'Point cloud worker failed')); };
    w.postMessage({ file, budget });
  });
}

let nextUid = 1;

export class PointCloud {
  constructor(name, d) {
    this.uid = nextUid++;
    this.kind = 'cloud';
    this.name = name;
    this.alias = null;
    this.format = d.format;
    this.total = d.total;            // points in the file
    this.count = d.count;            // points kept
    this.origin = d.origin;          // [x, y, z] in the cloud's own coordinates
    this.min = d.min; this.max = d.max;
    this.positions = d.positions;    // Float32Array, x y z relative to origin (Z up)
    this.rgb = d.colors;             // Uint8Array or null
    this.intensity = d.intensity;    // Uint16Array or null
    this.classes = d.classes;        // Uint8Array or null
    this.classCounts = new Map();
    if (this.classes) for (const c of this.classes) this.classCounts.set(c, (this.classCounts.get(c) || 0) + 1);
    this.hiddenClasses = new Set();
    this.visible = true;
    this.mode = this.rgb ? 'rgb' : this.classCounts.size > 1 ? 'class' : 'elevation';
    this.pointSize = 2;
    this.share = 1;                  // share of the kept points drawn (1, 0.5, 0.25, 0.1)
    this.movingMax = movingBudget(); // points drawn while the camera moves
    this.placement = 'raw';          // 'raw' or 'map' – set by the viewer

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.colorAttr = new THREE.BufferAttribute(new Uint8Array(this.count * 3), 3, true);
    g.setAttribute('color', this.colorAttr);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    this.geometry = g;
    this.material = new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true });
    // round points
    this.material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>',
        '#include <clipping_planes_fragment>\n{ vec2 pc = gl_PointCoord - 0.5; if (dot(pc, pc) > 0.25) discard; }');
    };
    this.points = new THREE.Points(g, this.material);
    this.points.matrixAutoUpdate = false;
    this.points.frustumCulled = false; // one large object; cheap to skip the test
    this.points.userData.cloud = this;
    this.points.raycast = () => {}; // picking points is done by pick() below
    this.applyColors();
  }

  get label() { return this.alias || this.name; }

  setVisible(v) { this.visible = v; this.points.visible = v; }

  /** Point size in CSS pixels (scaled to device pixels with the pixel ratio). */
  setPointSize(px, pixelRatio = 1) { this.pointSize = px; this.material.size = px * pixelRatio; }

  setMode(mode) { this.mode = mode; this.applyColors(); }

  setClassHidden(cls, hidden) {
    if (hidden) this.hiddenClasses.add(cls); else this.hiddenClasses.delete(cls);
    this.#applyFilter();
  }

  /** Is point i shown (class filter)? */
  shown(i) { return !this.classes || !this.hiddenClasses.size || !this.hiddenClasses.has(this.classes[i]); }

  setShare(f) { this.share = f; this.updateLod(false); }

  /**
   * How many points to draw: the chosen share, and at most `movingMax` while the camera moves. The
   * points are in random order (see the worker), so the first k are an even sample of the cloud.
   */
  updateLod(moving) {
    const g = this.geometry;
    const all = g.index ? g.index.count : this.count;
    let k = Math.ceil(all * this.share);
    if (moving) k = Math.min(k, this.movingMax);
    if (g.drawRange.count !== k || g.drawRange.start !== 0) g.setDrawRange(0, k);
  }

  #applyFilter() {
    const g = this.geometry;
    if (!this.hiddenClasses.size) { g.setIndex(null); this.updateLod(false); return; }
    const idx = [];
    for (let i = 0; i < this.count; i++) if (this.shown(i)) idx.push(i);
    g.setIndex(new THREE.BufferAttribute(Uint32Array.from(idx), 1));
    this.updateLod(false);
  }

  /** Fills the colour attribute for the current mode. */
  applyColors() {
    const c = this.colorAttr.array, n = this.count;
    const mode = this.mode === 'rgb' && !this.rgb ? 'elevation' : this.mode === 'intensity' && !this.intensity ? 'elevation' : this.mode === 'class' && !this.classes ? 'elevation' : this.mode;
    if (mode === 'rgb') c.set(this.rgb);
    else if (mode === 'class') {
      const lut = new Map();
      for (const k of this.classCounts.keys()) lut.set(k, new THREE.Color(classColor(k)));
      for (let i = 0; i < n; i++) { const col = lut.get(this.classes[i]); c[i * 3] = col.r * 255; c[i * 3 + 1] = col.g * 255; c[i * 3 + 2] = col.b * 255; }
    } else if (mode === 'intensity') {
      const [lo, hi] = percentiles(this.intensity, 0.02, 0.98);
      const k = 255 / Math.max(1, hi - lo);
      for (let i = 0; i < n; i++) { const v = Math.max(0, Math.min(255, (this.intensity[i] - lo) * k)); c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = v; }
    } else if (mode === 'single') {
      for (let i = 0; i < n; i++) { c[i * 3] = 70; c[i * 3 + 1] = 110; c[i * 3 + 2] = 115; }
    } else {
      // elevation: a perceptual ramp between the 2 % and 98 % heights
      const z = new Float32Array(n);
      for (let i = 0; i < n; i++) z[i] = this.positions[i * 3 + 2];
      const [lo, hi] = percentiles(z, 0.02, 0.98);
      const span = Math.max(1e-6, hi - lo);
      for (let i = 0; i < n; i++) { const [r, g, b] = ramp((z[i] - lo) / span); c[i * 3] = r; c[i * 3 + 1] = g; c[i * 3 + 2] = b; }
    }
    this.colorAttr.needsUpdate = true;
  }

  /** Colour of point i as '#rrggbb' (as currently shown). */
  colorOf(i) {
    const c = this.colorAttr.array;
    return `#${((1 << 24) | (c[i * 3] << 16) | (c[i * 3 + 1] << 8) | c[i * 3 + 2]).toString(16).slice(1)}`;
  }

  /** World (viewer) position of point i. */
  worldPoint(i, out = new THREE.Vector3()) {
    const p = this.positions;
    return out.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]).applyMatrix4(this.points.matrixWorld);
  }

  /** Bounding box in viewer coordinates. */
  getBox() {
    this.points.updateMatrixWorld(true);
    return this.geometry.boundingBox.clone().applyMatrix4(this.points.matrixWorld);
  }

  /**
   * The shown points within ±half of a plane (world), on the kept side of all other planes.
   * Returns indices (Uint32Array), at most `limit` (thinned evenly beyond that).
   */
  slab(plane, half, others = [], limit = 60000) {
    if (!this.visible) return new Uint32Array(0);
    this.points.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.points.matrixWorld).invert();
    // the plane in local coordinates: the matrix may scale (map conversion), so distances are rescaled
    const lp = plane.clone().applyMatrix4(inv);
    const scale = new THREE.Vector3().setFromMatrixScale(this.points.matrixWorld).x || 1;
    const h = half / scale;
    const lo = others.map((o) => o.clone().applyMatrix4(inv));
    const nx = lp.normal.x, ny = lp.normal.y, nz = lp.normal.z, c0 = lp.constant;
    const P = this.positions, n = this.count;
    const hits = [];
    for (let i = 0; i < n; i++) {
      const d = nx * P[i * 3] + ny * P[i * 3 + 1] + nz * P[i * 3 + 2] + c0;
      if (d > h || d < -h) continue;
      if (!this.shown(i)) continue;
      let ok = true;
      for (const o of lo) if (o.normal.x * P[i * 3] + o.normal.y * P[i * 3 + 1] + o.normal.z * P[i * 3 + 2] + o.constant < 0) { ok = false; break; }
      if (ok) hits.push(i);
    }
    if (hits.length <= limit) return Uint32Array.from(hits);
    const out = new Uint32Array(limit), step = hits.length / limit;
    for (let k = 0; k < limit; k++) out[k] = hits[Math.floor(k * step)];
    return out;
  }

  /**
   * The nearest shown point to a screen position (CSS pixels relative to the canvas), within
   * maxPx, in front of the section planes. Used to snap measurements. Returns {index, point
   * (world), depth (0..1)} or null. The points are projected once per camera position into a
   * screen grid (cells of 16 px), so moving the mouse only looks at a few cells.
   */
  pick(camera, canvas, x, y, maxPx = 8, planes = []) {
    if (!this.visible) return null;
    const idx = this.#screenIndex(camera, canvas, planes);
    const C = 16, r = Math.ceil(maxPx / C);
    const cx = Math.floor(x / C), cy = Math.floor(y / C);
    let best = -1, bestD = maxPx * maxPx, bestZ = Infinity;
    for (let j = cy - r; j <= cy + r; j++) {
      if (j < 0 || j >= idx.ny) continue;
      for (let i = cx - r; i <= cx + r; i++) {
        if (i < 0 || i >= idx.nx) continue;
        const cell = j * idx.nx + i;
        for (let k = idx.start[cell]; k < idx.start[cell + 1]; k++) {
          const p = idx.order[k];
          const dx = idx.sx[p] - x, dy = idx.sy[p] - y, d2 = dx * dx + dy * dy;
          if (d2 > maxPx * maxPx) continue;
          const z = idx.sz[p];
          // the closest to the cursor, the nearest to the camera when about equally close
          if (d2 < bestD - 1 || (d2 <= bestD + 1 && z < bestZ)) { best = idx.ids[p]; bestD = d2; bestZ = z; }
        }
      }
    }
    return best < 0 ? null : { index: best, point: this.worldPoint(best), depth: bestZ };
  }

  /** Screen positions of the shown points for a camera, bucketed in 16 px cells (cached). */
  #screenIndex(camera, canvas, planes) {
    const w = canvas.clientWidth, hgt = canvas.clientHeight;
    const m = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(this.points.matrixWorld);
    const key = `${m.elements.map((v) => v.toPrecision(7)).join(',')}|${w}x${hgt}|${[...this.hiddenClasses].join(',')}|${planes.map((p) => `${p.normal.toArray().join(',')},${p.constant}`).join(';')}`;
    if (this._screen?.key === key) return this._screen;
    const e = m.elements, P = this.positions, n = this.count;
    const inv = new THREE.Matrix4().copy(this.points.matrixWorld).invert();
    const lp = planes.map((pl) => pl.clone().applyMatrix4(inv));
    const ids = [], sxs = [], sys = [], szs = [];
    for (let i = 0; i < n; i++) {
      const px = P[i * 3], py = P[i * 3 + 1], pz = P[i * 3 + 2];
      const cw = e[3] * px + e[7] * py + e[11] * pz + e[15];
      if (cw <= 0) continue;
      const sx = ((e[0] * px + e[4] * py + e[8] * pz + e[12]) / cw * 0.5 + 0.5) * w;
      if (sx < 0 || sx >= w) continue;
      const sy = (0.5 - (e[1] * px + e[5] * py + e[9] * pz + e[13]) / cw * 0.5) * hgt;
      if (sy < 0 || sy >= hgt) continue;
      if (!this.shown(i)) continue;
      let cut = false;
      for (const pl of lp) if (pl.normal.x * px + pl.normal.y * py + pl.normal.z * pz + pl.constant < 0) { cut = true; break; }
      if (cut) continue;
      ids.push(i); sxs.push(sx); sys.push(sy); szs.push((e[2] * px + e[6] * py + e[10] * pz + e[14]) / cw);
    }
    const C = 16, nx = Math.ceil(w / C) || 1, ny = Math.ceil(hgt / C) || 1;
    const cellOf = new Int32Array(ids.length), count = new Int32Array(nx * ny + 1);
    for (let k = 0; k < ids.length; k++) { const c = Math.floor(sys[k] / C) * nx + Math.floor(sxs[k] / C); cellOf[k] = c; count[c + 1]++; }
    for (let c = 0; c < nx * ny; c++) count[c + 1] += count[c];
    const start = Int32Array.from(count), fill = Int32Array.from(count), order = new Int32Array(ids.length);
    for (let k = 0; k < ids.length; k++) order[fill[cellOf[k]]++] = k;
    this._screen = { key, nx, ny, start, order, ids: Uint32Array.from(ids), sx: Float32Array.from(sxs), sy: Float32Array.from(sys), sz: Float32Array.from(szs) };
    return this._screen;
  }

  dispose() {
    this.points.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}

function percentiles(arr, a, b) {
  const n = arr.length;
  if (!n) return [0, 1];
  // a sample is enough for the colour range
  const step = Math.max(1, Math.floor(n / 100000));
  const s = [];
  for (let i = 0; i < n; i += step) s.push(arr[i]);
  s.sort((x, y) => x - y);
  return [s[Math.floor((s.length - 1) * a)], s[Math.floor((s.length - 1) * b)]];
}

// a blue – teal – yellow – red ramp (readable on light and dark backgrounds)
const RAMP = [[44, 80, 160], [30, 150, 170], [120, 190, 90], [240, 200, 60], [215, 80, 50]];
function ramp(t) {
  t = Math.max(0, Math.min(1, t)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(t)), f = t - i, a = RAMP[i], b = RAMP[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
