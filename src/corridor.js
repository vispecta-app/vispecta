// Offset lines and corridors along an alignment or a drawn line (#26).
//
// Offsets are measured perpendicular to the path in plan, right positive (looking ahead), as in
// the section window; e.g. −5 and +5 for a band of 5 m each side of the track centre. The lines are
// drawn in 3D at the height of the path, limited to a station range; the band between the
// outermost offsets is shown as a light ribbon. Station sections show the offsets as vertical lines
// (see sectionOffsets, used by computeSection), and find() lists the elements inside or crossing
// the band – by their geometry (all vertices), not only their insertion point.
import * as THREE from 'three';
import { pointAt, heightAt } from './alignment.js';
import { OVERLAY_ORDER } from './caps.js';

export const OFFSET_COLOR = '#8E44AD';

export class Corridor {
  constructor(viewer, container) {
    this.viewer = viewer;
    this.def = null; // { al, offsets: [sorted m], from, to (distance along the path, m) }
    this.group = new THREE.Group();
    this.group.name = 'offset lines';
    viewer.helpers.add(this.group);
    this.layer = document.createElement('div');
    this.layer.className = 'measure-layer align-layer';
    container.append(this.layer);
    this.labels = [];
    viewer.renderHooks.push(() => this.#place());
  }

  set(def) { this.def = def; this.rebuild(); }
  clear() { this.def = null; this.rebuild(); }

  /** Point of the path at distance s, moved `off` metres to the right, in viewer coordinates. */
  #at(al, s, off) {
    const p = pointAt(al, s);
    const z = heightAt(al, s) ?? 0;
    return this.viewer.fromIfc(p.x + p.dy * off, p.y - p.dx * off, z);
  }

  rebuild() {
    for (const o of [...this.group.children]) { this.group.remove(o); o.geometry?.dispose(); o.material?.dispose(); }
    for (const l of this.labels) l.el.remove();
    this.labels = [];
    const d = this.def;
    if (d && d.offsets.length) {
      const { al } = d;
      const s0 = Math.max(0, Math.min(d.from, d.to)), s1 = Math.min(al.length, Math.max(d.from, d.to));
      // samples: every vertex of the path inside the range, and at most every metre between
      const ss = [s0];
      for (const c of al.cum) if (c > s0 && c < s1) ss.push(c);
      ss.push(s1);
      const fine = [];
      for (let i = 0; i < ss.length - 1; i++) {
        const n = Math.max(1, Math.min(200, Math.ceil((ss[i + 1] - ss[i]) / 1)));
        for (let k = 0; k < n; k++) fine.push(ss[i] + ((ss[i + 1] - ss[i]) * k) / n);
      }
      fine.push(s1);
      const col = new THREE.Color(OFFSET_COLOR);
      for (const off of d.offsets) {
        const pts = fine.map((s) => this.#at(al, s, off));
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: 0.95 }));
        line.renderOrder = OVERLAY_ORDER + 24;
        line.frustumCulled = false;
        this.group.add(line);
        const el = document.createElement('div');
        el.className = 'm-label offset-label';
        el.textContent = `${off > 0 ? '+' : ''}${off.toFixed(2)}`;
        this.layer.append(el);
        this.labels.push({ el, at: pts[0] });
      }
      // the band between the outermost offsets
      if (d.offsets.length >= 2) {
        const lo = d.offsets[0], hi = d.offsets[d.offsets.length - 1];
        const pos = [];
        for (const s of fine) { const a = this.#at(al, s, lo), b = this.#at(al, s, hi); pos.push(a.x, a.y, a.z, b.x, b.y, b.z); }
        const idx = [];
        for (let i = 0; i < fine.length - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setIndex(idx);
        const band = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }));
        band.renderOrder = OVERLAY_ORDER + 23;
        band.frustumCulled = false;
        this.group.add(band);
      }
    }
    this.viewer.invalidate?.();
  }

  #place() {
    for (const l of this.labels) {
      const s = this.viewer.toScreen(l.at);
      if (!s) { l.el.hidden = true; continue; }
      l.el.hidden = false;
      l.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -150%)`;
    }
  }

  /** The offsets to draw in a station section (sorted), or [] when the section is outside the range. */
  sectionOffsets(entry) {
    const d = this.def;
    if (!d || !entry.station || entry.station.al !== d.al) return [];
    const s = entry.station.s;
    if (s < Math.min(d.from, d.to) - 1e-6 || s > Math.max(d.from, d.to) + 1e-6) return [];
    return d.offsets;
  }

  /**
   * The elements of the visible models inside the band between the outermost offsets, or crossing
   * it, within the station range. Every vertex is projected onto the path. An element is "inside"
   * when all its vertices in the range lie in the band, "crosses" when some do or when it reaches
   * across the band (vertices on both sides). Returns [{model, id, status, s, offset}], s and offset
   * of the vertex nearest the middle of the band.
   */
  find() {
    const d = this.def;
    if (!d || !d.offsets.length) return [];
    const { al } = d;
    const lo = d.offsets[0], hi = d.offsets[d.offsets.length - 1];
    const s0 = Math.max(0, Math.min(d.from, d.to)), s1 = Math.min(al.length, Math.max(d.from, d.to));
    const mid = (lo + hi) / 2;
    // segments of the path in the range, in a grid (vertices further than the band + a margin are skipped)
    const reach = Math.max(Math.abs(lo), Math.abs(hi)) + 50;
    const segs = [];
    for (let k = 1; k < al.poly.length; k++) {
      if (al.cum[k] < s0 || al.cum[k - 1] > s1) continue;
      const a = al.poly[k - 1], b = al.poly[k], L = al.cum[k] - al.cum[k - 1];
      if (L < 1e-9) continue;
      const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
      segs.push({ a, c0: al.cum[k - 1], L, ux, uy, minX: Math.min(a[0], b[0]) - reach, maxX: Math.max(a[0], b[0]) + reach, minY: Math.min(a[1], b[1]) - reach, maxY: Math.max(a[1], b[1]) + reach });
    }
    if (!segs.length) return [];
    let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity;
    for (const g of segs) { gx0 = Math.min(gx0, g.minX); gy0 = Math.min(gy0, g.minY); gx1 = Math.max(gx1, g.maxX); gy1 = Math.max(gy1, g.maxY); }
    const cell = Math.max(5, reach);
    const grid = new Map(), key = (i, j) => i * 1000003 + j;
    segs.forEach((g, n) => {
      for (let i = Math.floor((g.minX - gx0) / cell); i <= Math.floor((g.maxX - gx0) / cell); i++) {
        for (let j = Math.floor((g.minY - gy0) / cell); j <= Math.floor((g.maxY - gy0) / cell); j++) {
          const kk = key(i, j); if (!grid.has(kk)) grid.set(kk, []); grid.get(kk).push(n);
        }
      }
    });
    const v = this.viewer;
    const inv = v.referenceMatrix ? v.referenceMatrix.clone().invert() : new THREE.Matrix4();
    const q = new THREE.Vector3();
    const out = [];
    for (const m of v.models) {
      if (!m.visible) continue;
      m.group.updateMatrixWorld(true);
      const M = inv.clone().multiply(m.group.matrixWorld);
      for (const b of m.buckets) {
        const P = b.positions, I = b.index;
        for (const it of b.items) {
          if (m.hidden.has(it.id)) continue;
          let n = 0, inBand = 0, minD = Infinity, maxD = -Infinity, best = null;
          for (let k = it.start; k < it.start + it.count; k++) {
            const vi = I[k] * 3;
            q.set(P[vi], P[vi + 1], P[vi + 2]).applyMatrix4(M);
            const x = q.x, y = -q.z; // three -> IFC plan
            if (x < gx0 || x > gx1 || y < gy0 || y > gy1) continue;
            const list = grid.get(key(Math.floor((x - gx0) / cell), Math.floor((y - gy0) / cell)));
            if (!list) continue;
            // the nearest segment the vertex projects onto
            let bs = null, bd = Infinity;
            for (const si of list) {
              const g = segs[si];
              const t = (x - g.a[0]) * g.ux + (y - g.a[1]) * g.uy;
              if (t < -1e-6 || t > g.L + 1e-6) continue;
              const dd = (x - g.a[0]) * g.uy - (y - g.a[1]) * g.ux; // right positive
              if (Math.abs(dd) < Math.abs(bd)) { bd = dd; bs = g.c0 + t; }
            }
            if (bs === null || bs < s0 || bs > s1) continue;
            n++;
            if (bd >= lo && bd <= hi) inBand++;
            if (bd < minD) minD = bd;
            if (bd > maxD) maxD = bd;
            if (!best || Math.abs(bd - mid) < Math.abs(best.offset - mid)) best = { s: bs, offset: bd };
          }
          if (!n) continue;
          const status = inBand === n ? 'inside' : inBand > 0 || (minD < lo && maxD > hi) ? 'crosses' : null;
          if (status) out.push({ model: m, id: it.id, status, s: best.s, offset: best.offset });
        }
      }
    }
    return out;
  }
}
