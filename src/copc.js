// COPC streaming (#52): a cloud-optimised LAZ file is opened without reading it whole. Its octree
// nodes are loaded as the camera needs them – more detail close up, less far away, never more than
// the point budget – and dropped again when they are no longer needed. Sections and profiles ask
// for the nodes along them at full density (within a budget of their own), so the dots in a cut
// are as dense as the survey.
//
// The loaded nodes are put together into one PointCloud (pointcloud.js), coarse levels first: the
// first k points are then an even sample of what is loaded, as with the other formats.
import * as THREE from 'three';
import { PointCloud, pointBudget } from './pointcloud.js';

/** Is this a COPC file? (a LAZ file with the COPC info record right after the header) */
export async function isCopc(file) {
  if (!/\.(laz|las)$/i.test(file.name)) return false;
  const b = new Uint8Array(await file.slice(0, 400).arrayBuffer());
  if (b.length < 400 || String.fromCharCode(b[0], b[1], b[2], b[3]) !== 'LASF') return false;
  const v = new DataView(b.buffer), hs = v.getUint16(94, true);
  if (hs + 22 > b.length) return false;
  const user = new TextDecoder().decode(b.subarray(hs + 2, hs + 18)).replace(/\0.*$/s, '');
  return user === 'copc' && v.getUint16(hs + 18, true) === 1;
}

/** Opens a COPC file: the hierarchy and a first, coarse overview. Resolves to a PointCloud with a stream. */
export async function openCopc(file, { budget = pointBudget(), onProgress } = {}) {
  const worker = new Worker(new URL('./copc-worker.js', import.meta.url), { type: 'module' });
  // A worker that crashes (e.g. out of memory while decompressing) sends no message: every call
  // waiting then fails instead of waiting for ever.
  let crashed = null;
  const call = (msg, transfer) => new Promise((resolve, reject) => {
    if (crashed) { reject(crashed); return; }
    const id = Math.random();
    const done = () => { worker.removeEventListener('message', on); worker.removeEventListener('error', fail); };
    const on = ({ data }) => {
      if (data.id !== undefined && data.id !== id) return;
      done();
      if (data.error) reject(new Error(data.error)); else resolve(data);
    };
    const fail = (e) => { done(); reject(crashed || new Error(e?.message || 'COPC worker failed')); };
    worker.addEventListener('message', on);
    worker.addEventListener('error', fail);
    worker.postMessage({ ...msg, id }, transfer);
  });
  worker.addEventListener('error', (e) => { crashed = new Error(e?.message || 'COPC worker failed'); });
  try {
    const info = (await call({ open: file })).info;
    onProgress?.(0.3);
    const stream = new CopcStream(file, info, worker, call, budget);
    // the overview: whole levels from the root, as many as the budget allows (at most a fifth of it)
    const keys = stream.overviewKeys(Math.min(budget / 5, 1e6));
    const data = await stream.fetch(keys, (f) => onProgress?.(0.3 + 0.7 * f));
    const cloud = new PointCloud(file.name, { format: 'COPC', total: info.count, origin: info.origin, min: info.min, max: info.max, crs: info.crs, ...stream.assemble(keys, data) });
    stream.attach(cloud);
    return cloud;
  } catch (e) {
    worker.terminate(); // nothing keeps it: its memory (and the file's) goes too
    throw e;
  }
}

export class CopcStream extends EventTarget {
  constructor(file, info, worker, call, budget) {
    super();
    this.file = file;
    this.info = info;
    this.worker = worker;
    this.call = call;
    this.budget = budget;                 // points shown for the view
    this.focusBudget = budget * 0.6;      // points more for sections and profiles
    this.cacheMax = budget * 1.6;         // points kept in memory (shown or not)
    this.nodes = new Map();               // key -> { d, x, y, z, count, center, half }
    const [cx, cy, cz] = info.center, [ox, oy, oz] = info.origin;
    for (const [d, x, y, z, count] of info.nodes) {
      const size = (2 * info.half) / 2 ** d;
      const center = new THREE.Vector3(cx - info.half + (x + 0.5) * size - ox, cy - info.half + (y + 0.5) * size - oy, cz - info.half + (z + 0.5) * size - oz);
      this.nodes.set(`${d}-${x}-${y}-${z}`, { key: `${d}-${x}-${y}-${z}`, d, x, y, z, count, center, half: size / 2 });
    }
    this.loaded = new Map();              // key -> { positions, colors, intensity, classes, used }
    this.shown = [];                      // keys in the cloud now
    this.focus = { path: null };          // a profile path: [{a, b}] in cloud coordinates, and half width
    this.busy = false;
    this.again = false;
    this.planes = () => [];
  }

  children(n) {
    const out = [];
    for (let i = 0; i < 8; i++) {
      const k = `${n.d + 1}-${2 * n.x + (i & 1)}-${2 * n.y + ((i >> 1) & 1)}-${2 * n.z + ((i >> 2) & 1)}`;
      const c = this.nodes.get(k);
      if (c) out.push(c);
    }
    return out;
  }

  get root() { return this.nodes.get('0-0-0-0'); }

  /** Whole levels from the root while they fit in `max` points. */
  overviewKeys(max) {
    const keys = [];
    let level = [this.root].filter(Boolean), n = 0;
    while (level.length) {
      const sum = level.reduce((a, c) => a + c.count, 0);
      if (keys.length && n + sum > max) break;
      for (const c of level) keys.push(c.key);
      n += sum;
      level = level.flatMap((c) => this.children(c));
    }
    return keys;
  }

  /** Loads nodes (those not in memory yet) in the worker. */
  async fetch(keys, onProgress) {
    const need = keys.filter((k) => !this.loaded.has(k));
    const BATCH = 16;
    for (let i = 0; i < need.length; i += BATCH) {
      const r = await this.call({ load: need.slice(i, i + BATCH) });
      for (const n of r.nodes) { this.#convert(n); this.loaded.set(n.key, n); }
      onProgress?.(Math.min(1, (i + BATCH) / need.length));
    }
    return this.loaded;
  }

  /** The points of the given nodes in one set of arrays, coarse levels first (and shown, unless `show` is false). */
  assemble(keys, show = true) {
    const list = keys.map((k) => this.loaded.get(k)).filter(Boolean)
      .sort((a, b) => this.nodes.get(a.key).d - this.nodes.get(b.key).d);
    let n = 0, rgb = false;
    for (const l of list) { n += l.intensity.length; if (l.colors) rgb = true; }
    const positions = new Float32Array(n * 3), intensity = new Uint16Array(n), classes = new Uint8Array(n);
    const colors = rgb ? new Uint8Array(n * 3) : null;
    let o = 0;
    const now = performance.now();
    for (const l of list) {
      const m = l.intensity.length;
      positions.set(l.positions, o * 3);
      intensity.set(l.intensity, o);
      classes.set(l.classes, o);
      if (colors && l.colors) colors.set(l.colors, o * 3);
      o += m;
      l.used = now;
    }
    if (show) this.shown = list.map((l) => l.key);
    return { count: n, positions, colors, intensity, classes };
  }

  attach(cloud) {
    this.cloud = cloud;
    cloud.stream = this;
    const { min, max, origin } = this.info;
    cloud.streamBox = new THREE.Box3(new THREE.Vector3(min[0] - origin[0], min[1] - origin[1], min[2] - origin[2]), new THREE.Vector3(max[0] - origin[0], max[1] - origin[1], max[2] - origin[2]));
    cloud.fixedRanges = {};
    cloud.setData({ count: cloud.count, positions: cloud.positions, colors: cloud.rgb, intensity: cloud.intensity, classes: cloud.classes });
  }

  /**
   * Converts the cloud into another map coordinate system (#107): conv works on the coordinates the
   * points are in now; origin is the cloud's new origin. Loaded nodes are converted now, later ones
   * when they arrive (from the file's own system).
   */
  reproject(conv, origin) {
    const old = this.origin || this.info.origin;
    const prev = this.toData;
    this.toData = prev ? (x, y) => { const [u, v] = prev(x, y); return conv(u, v); } : conv;
    for (const n of this.loaded.values()) {
      const P = n.positions;
      for (let i = 0; i < P.length; i += 3) { const [x, y] = conv(old[0] + P[i], old[1] + P[i + 1]); P[i] = x - origin[0]; P[i + 1] = y - origin[1]; }
    }
    for (const n of this.nodes.values()) {
      const [x, y] = conv(old[0] + n.center.x, old[1] + n.center.y);
      n.center.x = x - origin[0]; n.center.y = y - origin[1];
    }
    this.origin = origin;
    const { min, max } = this.cloud;
    this.cloud.streamBox.set(new THREE.Vector3(min[0] - origin[0], min[1] - origin[1], min[2] - origin[2]), new THREE.Vector3(max[0] - origin[0], max[1] - origin[1], max[2] - origin[2]));
  }

  /** A node as it comes from the worker (the file's system, around its origin) -> the cloud's system now. */
  #convert(n) {
    if (!this.toData) return;
    const [sx, sy] = this.info.origin, [ox, oy] = this.origin;
    const P = n.positions;
    for (let i = 0; i < P.length; i += 3) { const [x, y] = this.toData(sx + P[i], sy + P[i + 1]); P[i] = x - ox; P[i + 1] = y - oy; }
  }

  /** Points in memory (loaded nodes). */
  get loadedPoints() { let n = 0; for (const l of this.loaded.values()) n += l.intensity.length; return n; }

  /**
   * Chooses the nodes for the camera (and the focus: section planes, a profile path), loads what is
   * missing and drops what is not needed. Runs one at a time; a call while busy runs once more after.
   */
  async refine(camera, viewport) {
    if (!this.cloud || !this.cloud.visible) return;
    if (this.busy) { this.again = [camera, viewport]; return; }
    this.busy = true;
    try {
      const want = this.choose(camera, viewport);
      const missing = want.filter((k) => !this.loaded.has(k));
      if (missing.length) {
        this.dispatchEvent(new Event('loading'));
        // the nearest and coarsest first, a batch at a time, the view updated after each
        let last = performance.now();
        for (let i = 0; i < missing.length; i += 24) {
          await this.fetch(missing.slice(i, i + 24));
          if (performance.now() - last > 400) { this.#show(want); last = performance.now(); }
        }
      }
      this.#show(want);
      this.#trim(new Set(want));
    } catch (e) {
      console.warn('COPC', e);
    } finally {
      this.busy = false;
      this.dispatchEvent(new Event('idle'));
      if (this.again) { const [c, v] = this.again; this.again = false; this.refine(c, v); }
    }
  }

  #show(want) {
    const keys = want.filter((k) => this.loaded.has(k));
    if (keys.length === this.shown.length && keys.every((k, i) => k === this.shown[i])) return;
    const d = this.assemble(keys);
    this.cloud.setData(d);
    this.dispatchEvent(new Event('change'));
  }

  #trim(keep) {
    if (this.loadedPoints <= this.cacheMax) return;
    const drop = [...this.loaded.values()].filter((l) => !keep.has(l.key) && this.nodes.get(l.key).d > 1).sort((a, b) => (a.used || 0) - (b.used || 0));
    let n = this.loadedPoints;
    for (const l of drop) { if (n <= this.cacheMax) break; this.loaded.delete(l.key); n -= l.intensity.length; }
  }

  /** The nodes to show: by size on screen within the point budget, plus the focus nodes. Coarse first. */
  choose(camera, viewport) {
    const M = this.cloud.points.matrixWorld;
    const scale = new THREE.Vector3().setFromMatrixScale(M).x || 1;
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const hgt = viewport.height || 800;
    const persp = camera.isPerspectiveCamera;
    const k = persp ? hgt / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) : (hgt * camera.zoom) / (camera.top - camera.bottom);
    const camPos = camera.position;
    const sphere = new THREE.Sphere();
    const wc = new THREE.Vector3();
    // screen size of a node in pixels (0 when out of view)
    const size = (n) => {
      wc.copy(n.center).applyMatrix4(M);
      sphere.set(wc, n.half * Math.SQRT2 * 1.25 * scale);
      if (!frustum.intersectsSphere(sphere)) return 0;
      const r = sphere.radius;
      return persp ? (r * k) / Math.max(1e-3, wc.distanceTo(camPos) - r * 0.5) : r * k;
    };
    const out = new Set();
    const root = this.root;
    if (!root) return [];
    // a priority queue by screen size (a sorted array is plenty for a few thousand candidates)
    const queue = [[root, Infinity]];
    let n = 0;
    while (queue.length) {
      let bi = 0;
      for (let i = 1; i < queue.length; i++) if (queue[i][1] > queue[bi][1]) bi = i;
      const [node, s] = queue.splice(bi, 1)[0];
      if (n + node.count > this.budget && out.size) continue;
      out.add(node.key);
      n += node.count;
      // the points of a node are about `spacing / 2^d` apart: go deeper while they are more than ~1.5 px apart on screen
      const spacingPx = (s / (node.half * 2.5)) * (this.info.spacing / 2 ** node.d);
      if (!(spacingPx > 1.5) && s !== Infinity) continue;
      for (const c of this.children(node)) { const cs = size(c); if (cs > 0) queue.push([c, cs]); }
    }
    // the focus: nodes along the section planes and the profile path, level by level
    const regions = this.#focusRegions();
    if (regions.length) {
      let level = [root], f = 0;
      while (level.length && f < this.focusBudget) {
        const next = [];
        for (const node of level) {
          if (!regions.some((hit) => hit(node))) continue;
          if (!out.has(node.key)) { if (f + node.count > this.focusBudget) continue; out.add(node.key); f += node.count; }
          next.push(...this.children(node));
        }
        level = next;
      }
    }
    return [...out].sort((a, b) => this.nodes.get(a).d - this.nodes.get(b).d);
  }

  /** Tests "does the node touch the focus" for the section planes and the profile path (cloud coordinates). */
  #focusRegions() {
    const M = this.cloud.points.matrixWorld, inv = new THREE.Matrix4().copy(M).invert();
    const scale = new THREE.Vector3().setFromMatrixScale(M).x || 1;
    const out = [];
    for (const { plane, half } of this.planes()) {
      const lp = plane.clone().applyMatrix4(inv), h = half / scale;
      out.push((n) => Math.abs(lp.distanceToPoint(n.center)) <= h + n.half * Math.sqrt(3));
    }
    const path = this.focus.path;
    if (path?.segs?.length) {
      const h = path.half / scale;
      out.push((n) => {
        const r = n.half * Math.SQRT2 + h, cx = n.center.x, cy = n.center.y;
        for (const { a, b } of path.segs) {
          const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
          const t = Math.max(0, Math.min(1, ((cx - a.x) * dx + (cy - a.y) * dy) / L2));
          if (Math.hypot(cx - a.x - t * dx, cy - a.y - t * dy) <= r) return true;
        }
        return false;
      });
    }
    return out;
  }

  /**
   * An even sample of the whole cloud, whole levels from the root up to `max` points – for work on
   * all of it (a terrain), whatever the view shows. onProgress(fraction).
   */
  async sample(max, onProgress) {
    const keys = this.overviewKeys(max);
    await this.fetch(keys, onProgress);
    return this.assemble(keys, false);
  }

  /** A profile path in world (viewer) coordinates: [Vector3, ...], half width in metres. */
  setPath(points, half) {
    if (!points?.length) { this.focus.path = null; return; }
    const inv = new THREE.Matrix4().copy(this.cloud.points.matrixWorld).invert();
    const p = points.map((q) => q.clone().applyMatrix4(inv));
    const segs = [];
    for (let i = 1; i < p.length; i++) segs.push({ a: p[i - 1], b: p[i] });
    this.focus.path = { segs, half };
  }

  /** Resolves when no loading is going on. */
  whenIdle() {
    if (!this.busy) return Promise.resolve();
    return new Promise((r) => {
      const on = () => { if (this.busy) return; this.removeEventListener('idle', on); r(); };
      this.addEventListener('idle', on);
    });
  }

  dispose() { this.worker.terminate(); this.loaded.clear(); }
}
