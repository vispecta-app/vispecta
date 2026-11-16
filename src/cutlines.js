// Cut faces and their outline in 3D (#37, #68).
//
// Where a section plane cuts the model, the cut faces are drawn as flat, hatched faces in a light,
// neutral tone – like a section on a drawing – with a thick line along their edge (yellow by
// default), so touching cut faces (track bed, ballast, deck) are easy to tell apart.
//
// Everything is computed on the CPU, and only when something changes: a plane moves, an element is
// hidden, a model is switched off … Every frame only a cheap signature is compared, so the cut
// costs nothing extra while the camera moves. (The earlier stencil caps drew every model mesh two
// more times per plane in every frame, which made large models slow.) While a plane is being
// dragged the faces and the outline are hidden – the inside of the cut solids shows instead – and
// about 150 ms after the last change they are computed again.
//
// Per plane, the triangles of every visible model mesh are cut into segments. The outline is those
// segments, cut against the other planes. The faces are the segments of a mesh stitched into closed
// loops in the plane, holes found by nesting (a pipe), and triangulated; the other planes clip them
// in the shader. Loops that don't close (geometry that isn't a closed solid) get no face, only the
// outline. While faces are shown, the model materials discard their back faces (sectionFill.active,
// see model.js), so the faces cover the opening.
//
// Neither the faces nor the lines use the renderer's clipping planes: they lie exactly in their own
// plane and would flicker in and out of it.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { sectionFill } from './model.js';

export const OVERLAY_ORDER = 1e7; // render order of overlays drawn over the model and the cut
export const OUTLINE_STYLES = { yellow: 0xffd200, black: 0x111111, object: null };
const WIDTH_PX = 2.5;
const DELAY_MS = 150;
const MAX_PLANES = 6;
const FACE_ORDER = 1000; // after the model meshes (0 / 5), before the outline and the overlays
const FILL = new THREE.Color(0xeae8e2); // light, neutral – like paper
const HATCH = new THREE.Color(0x6d6a63);

/** Whether a plane passes through a box, so a mesh can be skipped without looking at its triangles. */
export function planeCutsBox(plane, box) {
  return !box.isEmpty() && plane.intersectsBox(box);
}

function faceMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uPlanes: { value: Array.from({ length: MAX_PLANES }, () => new THREE.Vector4()) },
      uPlaneCount: { value: 0 },
      uNormal: { value: new THREE.Vector3(0, 0, 1) },
      uFill: { value: FILL },
      uLine: { value: HATCH },
      uHatchSize: sectionFill.hatchSize,
    },
    vertexShader: `
varying vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: `
uniform vec4 uPlanes[${MAX_PLANES}];
uniform int uPlaneCount;
uniform vec3 uNormal;
uniform vec3 uFill;
uniform vec3 uLine;
uniform vec2 uHatchSize;
varying vec3 vWorld;
void main() {
  for (int i = 0; i < ${MAX_PLANES}; i++) {
    if (i >= uPlaneCount) break;
    if (dot(uPlanes[i].xyz, vWorld) + uPlanes[i].w < 0.0) discard;
  }
  vec3 col = uFill;
  // diagonal hatching fixed in the plane, a few pixels apart at any distance
  vec3 a = abs(uNormal.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 u = normalize(cross(a, uNormal));
  vec3 v = cross(uNormal, u);
  float k = dot(vWorld, u) + dot(vWorld, v);
  float perPx = max(length(vec2(dFdx(k), dFdy(k))), 1e-9);
  float lod = exp2(ceil(log2(uHatchSize.x * perPx)));
  if (fract(k / lod) < uHatchSize.y * perPx / lod) col = uLine;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`,
    side: THREE.DoubleSide,
    // pulled towards the camera: the faces lie where the model's own surfaces end
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
  });
}

/** Signed area of a 2D loop [[x, y], …]: positive when counter-clockwise. */
function area(l) {
  let s = 0;
  for (let i = 0, j = l.length - 1; i < l.length; j = i++) s += l[j][0] * l[i][1] - l[i][0] * l[j][1];
  return s / 2;
}

function inside(p, l) {
  let c = false;
  for (let i = 0, j = l.length - 1; i < l.length; j = i++) {
    const a = l[i], b = l[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

/** Joins 2D segments into closed loops (end points matched to 0.1 mm); open chains are dropped. */
export function loopsOf(segs) {
  const key = (x, y) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)}`;
  const adj = new Map();
  const n = segs.length / 4;
  for (let i = 0; i < n; i++) {
    for (const e of [0, 1]) {
      const k = key(segs[i * 4 + e * 2], segs[i * 4 + e * 2 + 1]);
      let l = adj.get(k);
      if (!l) adj.set(k, (l = []));
      l.push(i * 2 + e);
    }
  }
  const used = new Uint8Array(n);
  const loops = [];
  for (let i = 0; i < n; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const loop = [[segs[i * 4], segs[i * 4 + 1]]];
    let x = segs[i * 4 + 2], y = segs[i * 4 + 3];
    const start = key(segs[i * 4], segs[i * 4 + 1]);
    let closed = false;
    for (let guard = 0; guard < n; guard++) {
      const k = key(x, y);
      if (k === start) { closed = true; break; }
      loop.push([x, y]);
      const next = (adj.get(k) || []).find((h) => !used[h >> 1]);
      if (next === undefined) break;
      const j = next >> 1, e = next & 1;
      used[j] = 1;
      x = segs[j * 4 + (1 - e) * 2]; y = segs[j * 4 + (1 - e) * 2 + 1];
    }
    if (closed && loop.length >= 3) loops.push(loop);
  }
  return loops;
}

/** Triangulates loops with holes (a loop inside an odd number of others is a hole). Returns flat 2D triangles. */
export function triangulate(loops, out) {
  const L = loops.map((pts) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return { pts, a: Math.abs(area(pts)), box: [x0, y0, x1, y1], holes: [], depth: 0, parent: null };
  }).filter((l) => l.a > 1e-10).sort((p, q) => q.a - p.a);
  for (let i = 0; i < L.length; i++) {
    const s = L[i];
    // a point inside s: the middle of its first edge, nudged inwards
    const [a, b] = [s.pts[0], s.pts[1]];
    const sign = area(s.pts) > 0 ? 1 : -1;
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    // (left of a→b is inside a counter-clockwise loop)
    const p = [(a[0] + b[0]) / 2 - (dy / len) * 1e-5 * sign, (a[1] + b[1]) / 2 + (dx / len) * 1e-5 * sign];
    for (let j = i - 1; j >= 0; j--) { // bigger loops, smallest first
      const o = L[j];
      if (p[0] < o.box[0] || p[0] > o.box[2] || p[1] < o.box[1] || p[1] > o.box[3]) continue;
      if (inside(p, o.pts)) { s.parent = o; s.depth = o.depth + 1; break; }
    }
    if (s.depth % 2 === 1) s.parent.holes.push(s.pts);
  }
  for (const s of L) {
    if (s.depth % 2 === 1) continue;
    const contour = s.pts.map(([x, y]) => new THREE.Vector2(x, y));
    const holes = s.holes.map((h) => h.map(([x, y]) => new THREE.Vector2(x, y)));
    const all = contour.concat(...holes);
    for (const t of THREE.ShapeUtils.triangulateShape(contour, holes)) for (const k of t) out.push(all[k].x, all[k].y);
  }
}

export class CutOutline {
  constructor(viewer) {
    this.viewer = viewer;
    this.style = 'yellow';
    this.faces = true; // hatched cut faces (the outline has its own style)
    this.shown = true; // false while a drawing background is rendered
    this.material = new LineMaterial({
      color: 0xffffff, linewidth: WIDTH_PX, worldUnits: false, vertexColors: true,
      depthTest: true, depthWrite: false,
      // pulled towards the camera, in front of the faces
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8,
    });
    this.material.clipping = false; // cut on the CPU instead, see above
    this.lines = new LineSegments2(new LineSegmentsGeometry(), this.material);
    this.lines.name = 'cut outline';
    this.lines.frustumCulled = false;
    this.lines.renderOrder = OVERLAY_ORDER - 1;
    this.lines.visible = false;
    this.lines.raycast = () => {};
    this.faceGroup = new THREE.Group();
    this.faceGroup.name = 'cut faces';
    viewer.scene.add(this.faceGroup, this.lines);
    this.sig = '';
    this.timer = null;
    this.ready = false; // faces and lines match the planes
    this.ids = new WeakMap(); // object -> small number, for the signature
    this.nextId = 1;
    this.ms = 0; // time of the last computation (for tests)
    this.count = 0; // outline segments shown
    this.triangles = 0; // face triangles shown
  }

  /** Outline: 'yellow' | 'black' | 'object' (darker object colour) | 'off'. */
  setStyle(style) {
    this.style = style in OUTLINE_STYLES || style === 'off' ? style : 'yellow';
    this.sig = '';
    this.viewer.invalidate();
  }

  /** Hatched cut faces on or off. */
  setFaces(on) {
    this.faces = on;
    this.sig = '';
    this.viewer.invalidate();
  }

  /** Shows or hides everything at once (for the background image of a drawing). */
  setShown(on) {
    this.shown = on;
    this.#visible();
  }

  #visible() {
    const on = this.shown && this.ready;
    this.lines.visible = on && this.count > 0;
    this.faceGroup.visible = on && this.faces;
    // back faces of the model are discarded only while the faces cover the cut
    sectionFill.active.value = on && this.faces && this.triangles > 0 ? 1 : 0;
  }

  #id(o) {
    let i = this.ids.get(o);
    if (!i) this.ids.set(o, (i = this.nextId++));
    return i;
  }

  /** The planes and meshes the cut is made from. */
  #inputs() {
    const v = this.viewer;
    const planes = this.style === 'off' && !this.faces ? [] : v.cuttingPlanes().slice(0, MAX_PLANES);
    const meshes = [];
    if (planes.length) {
      for (const model of v.models) {
        if (!model.visible) continue;
        for (const mesh of model.group.children) {
          if (!mesh.isMesh || !mesh.visible || !mesh.material?.userData?.sectionFill || mesh.material.transparent) continue;
          meshes.push(mesh);
        }
      }
    }
    return { planes, meshes };
  }

  /** Called before every render. `still`: a snapshot is taken, compute a pending cut right away. */
  update({ still = false } = {}) {
    const r = this.viewer.renderer;
    this.material.resolution.set(r.domElement.width, r.domElement.height);
    const { planes, meshes } = this.#inputs();
    const parts = [this.style, this.faces];
    for (const p of planes) parts.push(p.plane.normal.toArray().map((x) => x.toFixed(6)).join(','), p.plane.constant.toFixed(5));
    for (const m of meshes) {
      m.updateWorldMatrix(true, false);
      parts.push(this.#id(m), this.#id(m.geometry.index || m.geometry), m.geometry.index?.count ?? 0, this.#id(m.material), m.matrixWorld.elements[12].toFixed(3), m.matrixWorld.elements[14].toFixed(3));
    }
    const sig = parts.join('|');
    if (sig === this.sig) return;
    this.sig = sig;
    clearTimeout(this.timer);
    if (!planes.length || !meshes.length) { this.#show(null, []); return; }
    if (still) { this.#compute(planes, meshes); return; }
    this.ready = false;
    this.#visible();
    this.timer = setTimeout(() => {
      const now = this.#inputs();
      this.#compute(now.planes, now.meshes);
      this.viewer.invalidate();
    }, DELAY_MS);
  }

  #compute(planes, meshes) {
    const t0 = performance.now();
    const pos = [], col = [];
    const faces = []; // per plane: {plane, others, tris: [x, y, z, …]}
    const outline = this.style !== 'off';
    const fixed = OUTLINE_STYLES[this.style];
    const fixedCol = fixed !== null && fixed !== undefined ? new THREE.Color(fixed) : null;
    const c = new THREE.Color();
    const box = new THREE.Box3();
    const inv = new THREE.Matrix4();
    const local = new THREE.Plane();
    const a = new THREE.Vector3(), b = new THREE.Vector3(), q = new THREE.Vector3();
    const P = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const d = [0, 0, 0];
    for (const p of planes) {
      const n = p.plane.normal;
      const U = new THREE.Vector3(Math.abs(n.y) < 0.9 ? 0 : 1, Math.abs(n.y) < 0.9 ? 1 : 0, 0).cross(n).normalize();
      const V = new THREE.Vector3().crossVectors(n, U);
      const O = p.plane.coplanarPoint(new THREE.Vector3());
      const others = planes.filter((x) => x !== p).map((x) => x.plane);
      const tris2 = [];
      for (const mesh of meshes) {
        const g = mesh.geometry;
        if (!g.boundingBox) g.computeBoundingBox();
        box.copy(g.boundingBox).applyMatrix4(mesh.matrixWorld);
        if (!planeCutsBox(p.plane, box)) continue;
        const mw = mesh.matrixWorld;
        inv.copy(mw).invert();
        local.copy(p.plane).applyMatrix4(inv); // the plane in the mesh's own coordinates
        const ln = local.normal, lc = local.constant;
        const posArr = g.attributes.position.array;
        const idx = g.index?.array;
        const cnt = g.index ? g.index.count : g.attributes.position.count;
        if (fixedCol) c.copy(fixedCol); else c.copy(mesh.material.color).multiplyScalar(0.45);
        // faces are stitched per element: touching solids of one colour must not run into each other
        const ud = mesh.userData;
        const starts = ud.starts || (ud.bucket?.mesh === mesh ? ud.bucket.curStarts : null);
        let e = 0, nextStart = starts && starts.length > 1 ? starts[1] : Infinity;
        let segs = []; // in the plane: x0, y0, x1, y1 …
        for (let k = 0; k + 2 < cnt; k += 3) {
          if (k >= nextStart) {
            if (segs.length) { triangulate(loopsOf(segs), tris2); segs = []; }
            while (starts && e + 1 < starts.length && k >= starts[e + 1]) e++;
            nextStart = e + 1 < starts.length ? starts[e + 1] : Infinity;
          }
          for (let j = 0; j < 3; j++) {
            const vi = (idx ? idx[k + j] : k + j) * 3;
            const x = posArr[vi], y = posArr[vi + 1], z = posArr[vi + 2];
            d[j] = ln.x * x + ln.y * y + ln.z * z + lc;
            P[j].set(x, y, z);
          }
          if ((d[0] > 0 && d[1] > 0 && d[2] > 0) || (d[0] < 0 && d[1] < 0 && d[2] < 0)) continue;
          let m = 0;
          for (let j = 0; j < 3 && m < 2; j++) {
            const j2 = (j + 1) % 3;
            if ((d[j] > 0) !== (d[j2] > 0)) {
              const t = d[j] / (d[j] - d[j2]);
              (m === 0 ? a : b).copy(P[j]).lerp(P[j2], t);
              m++;
            }
          }
          if (m !== 2) continue;
          a.applyMatrix4(mw); b.applyMatrix4(mw);
          if (this.faces) {
            q.copy(a).sub(O); const ax = q.dot(U), ay = q.dot(V);
            q.copy(b).sub(O); segs.push(ax, ay, q.dot(U), q.dot(V));
          }
          if (!outline) continue;
          // the outline: cut against the other planes (keep what is on their kept side)
          let keep = true;
          for (const o of others) {
            const da = o.distanceToPoint(a), db = o.distanceToPoint(b);
            if (da < 0 && db < 0) { keep = false; break; }
            if (da < 0) { q.copy(a).lerp(b, da / (da - db)); a.copy(q); } else if (db < 0) { q.copy(a).lerp(b, da / (da - db)); b.copy(q); }
          }
          if (!keep || a.distanceToSquared(b) < 1e-12) continue;
          pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
          col.push(c.r, c.g, c.b, c.r, c.g, c.b);
        }
        if (segs.length) triangulate(loopsOf(segs), tris2);
      }
      if (tris2.length) {
        const tris = new Float32Array((tris2.length / 2) * 3);
        for (let i = 0, o = 0; i < tris2.length; i += 2, o += 3) {
          tris[o] = O.x + U.x * tris2[i] + V.x * tris2[i + 1];
          tris[o + 1] = O.y + U.y * tris2[i] + V.y * tris2[i + 1];
          tris[o + 2] = O.z + U.z * tris2[i] + V.z * tris2[i + 1];
        }
        faces.push({ plane: p.plane, others, tris });
      }
    }
    this.ms = Math.round(performance.now() - t0);
    this.#show(pos.length ? { pos, col } : null, faces);
  }

  #show(lineData, faces) {
    // outline
    const old = this.lines.geometry;
    if (lineData) {
      const geo = new LineSegmentsGeometry();
      geo.setPositions(lineData.pos);
      geo.setColors(lineData.col);
      this.lines.geometry = geo;
      old.dispose();
      this.count = lineData.pos.length / 6;
    } else this.count = 0;
    // faces: one mesh per plane, clipped by the other planes in the shader
    for (const m of this.faceGroup.children) { m.geometry.dispose(); m.material.dispose(); }
    this.faceGroup.clear();
    this.triangles = 0;
    faces.forEach((f, i) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(f.tris, 3));
      const mat = faceMaterial();
      const u = mat.uniforms;
      f.others.forEach((o, j) => u.uPlanes.value[j].set(o.normal.x, o.normal.y, o.normal.z, o.constant));
      u.uPlaneCount.value = f.others.length;
      u.uNormal.value.copy(f.plane.normal);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = FACE_ORDER + i;
      mesh.frustumCulled = false;
      mesh.raycast = () => {};
      this.faceGroup.add(mesh);
      this.triangles += f.tris.length / 9;
    });
    this.ready = true;
    this.#visible();
  }

  dispose() {
    clearTimeout(this.timer);
    this.viewer.scene.remove(this.lines, this.faceGroup);
    this.lines.geometry.dispose();
    this.material.dispose();
    for (const m of this.faceGroup.children) { m.geometry.dispose(); m.material.dispose(); }
  }
}
