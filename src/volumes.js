// Cut and fill volumes (#92): the existing terrain against a design surface (the top of chosen
// models, e.g. the embankment), sampled on a grid along an alignment and summed per station range.
import { pointAt } from './alignment.js';

/** A spatial hash over triangles in IFC coordinates (9 numbers per triangle) to look up heights. */
export class SurfaceIndex {
  constructor(tris, cell = 4) {
    this.tris = tris;
    this.cell = cell;
    this.map = new Map();
    for (let t = 0; t < tris.length; t += 9) {
      const x0 = Math.min(tris[t], tris[t + 3], tris[t + 6]), x1 = Math.max(tris[t], tris[t + 3], tris[t + 6]);
      const y0 = Math.min(tris[t + 1], tris[t + 4], tris[t + 7]), y1 = Math.max(tris[t + 1], tris[t + 4], tris[t + 7]);
      // vertical faces have no area in plan and give no height
      const area = (tris[t + 3] - tris[t]) * (tris[t + 7] - tris[t + 1]) - (tris[t + 6] - tris[t]) * (tris[t + 4] - tris[t + 1]);
      if (Math.abs(area) < 1e-9) continue;
      for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++) {
        for (let j = Math.floor(y0 / cell); j <= Math.floor(y1 / cell); j++) {
          const k = `${i},${j}`;
          const a = this.map.get(k);
          if (a) a.push(t); else this.map.set(k, [t]);
        }
      }
    }
  }

  /** The highest surface at (x, y), or NaN where there is none. */
  zAt(x, y) {
    const a = this.map.get(`${Math.floor(x / this.cell)},${Math.floor(y / this.cell)}`);
    if (!a) return NaN;
    const T = this.tris;
    let best = NaN;
    for (const t of a) {
      const ax = T[t], ay = T[t + 1], bx = T[t + 3], by = T[t + 4], cx = T[t + 6], cy = T[t + 7];
      const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d;
      const l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d;
      const l3 = 1 - l1 - l2;
      if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
      const z = l1 * T[t + 2] + l2 * T[t + 5] + l3 * T[t + 8];
      if (!(z <= best)) best = z;
    }
    return best;
  }
}

/**
 * Samples both surfaces on a grid along the alignment, from s0 to s1 (lengths along it), from
 * `right` m right to `left` m left, every `ds` m along and `dOff` m across. Each sample stands for a
 * cell of ds × dOff (shortened or lengthened by the curvature of the alignment). Returns
 * { bins: [{ from, to, cut, fill, area }], samples: [{ x, y, z, d }], cut, fill, area } with volumes in m³;
 * d > 0 is fill (the design above the terrain), d < 0 cut.
 */
export function cutFill({ al, s0, s1, left, right, ds = 1, dOff = 0.5, bin = 20, existing, design, keepSamples = true }) {
  const bins = [];
  const samples = [];
  let cut = 0, fill = 0, area = 0;
  const n = Math.max(1, Math.round((s1 - s0) / ds));
  ds = (s1 - s0) / n;
  const offs = [];
  for (let o = -right + dOff / 2; o < left; o += dOff) offs.push(o);
  let prev = pointAt(al, s0);
  for (let i = 0; i < n; i++) {
    const s = s0 + (i + 0.5) * ds;
    const p = pointAt(al, s);
    // the curvature of the alignment: a cell at offset o is (1 - o·κ) times as long (left positive)
    const next = pointAt(al, Math.min(al.length, s + ds / 2));
    const turn = Math.atan2(prev.dx * next.dy - prev.dy * next.dx, prev.dx * next.dx + prev.dy * next.dy);
    const kappa = turn / ds;
    prev = next;
    const bi = Math.floor((s - s0) / bin);
    let b = bins[bi];
    if (!b) b = bins[bi] = { from: s0 + bi * bin, to: Math.min(s1, s0 + (bi + 1) * bin), cut: 0, fill: 0, area: 0 };
    for (const o of offs) {
      const x = p.x - p.dy * o, y = p.y + p.dx * o;
      const zd = design.zAt(x, y);
      if (Number.isNaN(zd)) continue;
      const ze = existing.zAt(x, y);
      if (Number.isNaN(ze)) continue;
      const a = ds * dOff * Math.max(0, 1 - o * kappa);
      const d = zd - ze;
      if (d > 0) { b.fill += d * a; fill += d * a; } else { b.cut -= d * a; cut -= d * a; }
      b.area += a; area += a;
      if (keepSamples) samples.push({ x, y, z: Math.max(zd, ze), d });
    }
  }
  return { bins: bins.filter(Boolean), samples, cut, fill, area };
}
