// Outline of the cut faces in 3D (#68): a thick line along the edge of every face a section plane
// cuts, so the section reads like a drawing and neighbouring cut faces (track bed, ballast, deck)
// are easy to tell apart.
//
// The lines are computed on the CPU, from the same meshes the caps are drawn for (caps.js), and
// only when something changes: a plane moves, an element is hidden, a model is switched off …
// While that goes on (e.g. dragging a section slider) the outline is hidden; about 150 ms after the
// last change it is computed again. Every frame only a cheap signature is compared.
//
// Each segment is cut against the other planes on the CPU, so the line material does not use the
// renderer's clipping planes (a line lying exactly in its own plane would flicker in and out of it).
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { OVERLAY_ORDER } from './caps.js';

export const OUTLINE_STYLES = { yellow: 0xffd200, black: 0x111111, object: null };
const WIDTH_PX = 2.5;
const DELAY_MS = 150;
const MAX_PLANES = 6;

/**
 * Whether a plane passes through a box, so a mesh can be skipped without looking at its triangles.
 * Shared with the caps (#59 can use it to skip meshes a plane doesn't cut).
 */
export function planeCutsBox(plane, box) {
  return !box.isEmpty() && plane.intersectsBox(box);
}

export class CutOutline {
  constructor(viewer) {
    this.viewer = viewer;
    this.style = 'yellow';
    this.material = new LineMaterial({
      color: 0xffffff, linewidth: WIDTH_PX, worldUnits: false, vertexColors: true,
      depthTest: true, depthWrite: false,
      // pulled towards the camera: the line lies exactly on the cut face (the cap)
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8,
    });
    this.material.clipping = false; // cut on the CPU instead, see above
    this.lines = new LineSegments2(new LineSegmentsGeometry(), this.material);
    this.lines.name = 'cut outline';
    this.lines.frustumCulled = false;
    this.lines.renderOrder = OVERLAY_ORDER - 1; // after the caps, before the overlays
    this.lines.visible = false;
    this.lines.raycast = () => {};
    viewer.scene.add(this.lines);
    this.sig = '';
    this.timer = null;
    this.ids = new WeakMap(); // object -> small number, for the signature
    this.nextId = 1;
    this.ms = 0; // time of the last computation (for tests)
    this.count = 0; // segments shown
  }

  /** 'yellow' | 'black' | 'object' (darker object colour) | 'off'. */
  setStyle(style) {
    this.style = style in OUTLINE_STYLES || style === 'off' ? style : 'yellow';
    this.sig = ''; // compute again
    this.viewer.invalidate();
  }

  #id(o) {
    let i = this.ids.get(o);
    if (!i) this.ids.set(o, (i = this.nextId++));
    return i;
  }

  /** The planes and meshes the outline is made from. */
  #inputs() {
    const v = this.viewer;
    const planes = this.style === 'off' ? [] : v.cuttingPlanes().slice(0, MAX_PLANES);
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

  /** Called before every render. `still`: a snapshot is taken, compute a pending outline right away. */
  update({ still = false } = {}) {
    const r = this.viewer.renderer;
    this.material.resolution.set(r.domElement.width, r.domElement.height);
    const { planes, meshes } = this.#inputs();
    const parts = [this.style];
    for (const p of planes) parts.push(p.plane.normal.toArray().map((x) => x.toFixed(6)).join(','), p.plane.constant.toFixed(5));
    for (const m of meshes) {
      m.updateWorldMatrix(true, false);
      parts.push(this.#id(m), this.#id(m.geometry.index || m.geometry), m.geometry.index?.count ?? 0, this.#id(m.material), m.matrixWorld.elements[12].toFixed(3), m.matrixWorld.elements[14].toFixed(3));
    }
    const sig = parts.join('|');
    if (sig === this.sig) return;
    this.sig = sig;
    clearTimeout(this.timer);
    if (!planes.length || !meshes.length) { this.#show(null); return; }
    if (still) { this.#compute(planes, meshes); return; }
    this.lines.visible = false;
    this.timer = setTimeout(() => {
      const now = this.#inputs();
      this.#compute(now.planes, now.meshes);
      this.viewer.invalidate();
    }, DELAY_MS);
  }

  #compute(planes, meshes) {
    const t0 = performance.now();
    const pos = [], col = [];
    const fixed = OUTLINE_STYLES[this.style];
    const fixedCol = fixed !== null && fixed !== undefined ? new THREE.Color(fixed) : null;
    const c = new THREE.Color();
    const box = new THREE.Box3();
    const inv = new THREE.Matrix4();
    const local = new THREE.Plane();
    const a = new THREE.Vector3(), b = new THREE.Vector3(), q = new THREE.Vector3();
    const P = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const d = [0, 0, 0];
    for (const mesh of meshes) {
      const g = mesh.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      box.copy(g.boundingBox).applyMatrix4(mesh.matrixWorld);
      const mw = mesh.matrixWorld;
      inv.copy(mw).invert();
      const posArr = g.attributes.position.array;
      const idx = g.index?.array;
      const n = g.index ? g.index.count : g.attributes.position.count;
      if (fixedCol) c.copy(fixedCol); else c.copy(mesh.material.color).multiplyScalar(0.45);
      for (const p of planes) {
        if (!planeCutsBox(p.plane, box)) continue;
        const others = planes.filter((x) => x !== p).map((x) => x.plane);
        local.copy(p.plane).applyMatrix4(inv); // the plane in the mesh's own coordinates
        const ln = local.normal, lc = local.constant;
        for (let k = 0; k + 2 < n; k += 3) {
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
          // cut against the other planes (keep what is on their kept side)
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
      }
    }
    this.ms = Math.round(performance.now() - t0);
    this.#show(pos.length ? { pos, col } : null);
  }

  #show(data) {
    const old = this.lines.geometry;
    if (!data) {
      this.lines.visible = false;
      this.count = 0;
      return;
    }
    const geo = new LineSegmentsGeometry();
    geo.setPositions(data.pos);
    geo.setColors(data.col);
    this.lines.geometry = geo;
    old.dispose();
    this.count = data.pos.length / 6;
    this.lines.visible = true;
  }

  dispose() {
    clearTimeout(this.timer);
    this.viewer.scene.remove(this.lines);
    this.lines.geometry.dispose();
    this.material.dispose();
  }
}
