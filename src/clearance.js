// Structure gauge (fritrumsprofil) along a track (#127): Banedanmark BN1-166-1 (03/02/2025) and
// profiles of your own.
//
// A profile is drawn in the plane perpendicular to the track, measured from the profile centre on
// the SO plane (the plane on both rail heads): b sideways along the SO plane, h perpendicular to it,
// in mm (§10.2). With cant the profile tilts with the SO plane. The standard profiles are given as
// their right half from the bottom of the centre line to its top; the left half is the mirror image.
//
// Each corner carries the allowances that apply to it:
//   W  curve widening e (§12), always – profiles D, D-GC, SD and R in their whole height
//   L  curve widening e for A and SA below 760 mm
//   U  curve widening e for A and SA above 3300 mm, in curves R < 180 m (A also for traffic codes P1/F1)
//   d  lowered by Δh in rounding curves (§13): heights up to 1170 mm (never below the SO plane)
//   i  raised by Δh: heights 3300 < h ≤ 4800/4820 mm
//   j  raised by Δh only without a profile over the upper part (A, SA: h ≥ 4800 mm in b ≤ 1870/1380 mm)
// The norm gives the profiles without the radius-dependent part of the curve allowance; it is added
// here at each station. The profile over the upper part (EA, EBa1 … SB, table 11.2.2-1) is a
// rectangle on top: no widening, raised 50 mm in tunnels over 100 m.
import * as THREE from 'three';
import { pointAt, heightAt } from './alignment-math.js';
const OVERLAY_ORDER = 1e7; // as in cutlines.js (not imported: this module stays free of the IFC code, for tests)

const LOWER = [[0, 50, 'd'], [1280, 50, 'Wd'], [1580, 350, 'Wd'], [1750, 350, 'Wd'], [1750, 760, 'Wd']];
const LOWER_A = [[0, 50, 'd'], [1280, 50, 'Ld'], [1580, 350, 'Ld'], [1750, 350, 'Ld'], [1750, 760, 'Ld']];
const D_TOP = [[2000, 760, 'Wd'], [2000, 3300, 'W'], [1870, 3300, 'W'], [1870, 3530, 'Wi'], [1665, 4130, 'Wi'], [1075, 4680, 'Wi'], [830, 4800, 'Wi'], [0, 4800, 'i']];

/** The profiles of BN1-166-1 (half profiles, mm). family: which allowances apply (see above). */
export const PROFILES = {
  D: { family: 'D', top: 4800, half: [...LOWER, ...D_TOP], note: 'BN1-166-1 fig. 11.1.1-1' },
  'D-GC': { family: 'D', top: 4820, half: [...LOWER, [2000, 760, 'Wd'], [2000, 3300, 'W'], [1870, 3300, 'W'], [1870, 4700, 'Wi'], [1600, 4820, 'Wi'], [0, 4820, 'i']], note: 'BN1-166-1 fig. 11.1.1-2' },
  SD: { family: 'D', top: 4800, half: [...LOWER, [2100, 760, 'Wd'], [2100, 2800, 'W'], [2000, 2800, 'W'], [2000, 3300, 'W'], [1885, 3300, 'W'], [1880, 3530, 'Wi'], [1825, 3760, 'Wi'], [1380, 4330, 'Wi'], [1380, 4800, 'Wi'], [0, 4800, 'i']], note: 'BN1-166-1 fig. 11.1.1-3' },
  // shunting profile: on the side(s) with outside shunting, D widened to 2500 mm between 760 and 3530 mm
  R: { family: 'D', top: 4800, half: [...LOWER, [2500, 760, 'Wd'], [2500, 3530, 'Wi'], [1870, 3530, 'Wi'], [1665, 4130, 'Wi'], [1075, 4680, 'Wi'], [830, 4800, 'Wi'], [0, 4800, 'i']], other: 'D', note: 'BN1-166-1 fig. 11.1.2-1' },
  A: { family: 'A', top: 4800, topP1: 4820, half: [...LOWER_A, [3000, 760, ''], [3000, 3300, ''], [2000, 3300, 'U'], [2000, 4800, 'U'], [1870, 4800, 'U'], [1870, 4800, 'Uj'], [0, 4800, 'j']], note: 'BN1-166-1 fig. 11.1.3-1' },
  SA: { family: 'A', top: 4800, half: [...LOWER_A, [2500, 760, ''], [2500, 3300, ''], [2300, 3300, 'U'], [2300, 3530, 'U'], [2000, 3530, 'U'], [2000, 4800, 'U'], [1380, 4800, 'U'], [1380, 4800, 'Uj'], [0, 4800, 'j']], note: 'BN1-166-1 fig. 11.1.3-2' },
  // UT boundary line (§11.1.4): where objects may not be placed or changed without survey; no allowances
  UT: { family: 'none', top: 4920, half: [[0, 50, ''], [2300, 50, ''], [2300, 3530, ''], [2000, 3530, ''], [2000, 4920, ''], [0, 4920, '']], note: 'BN1-166-1 fig. 11.1.4-1' },
};

/** Profile over the upper part (table 11.2.2-1): height hs and half width bs, mm. */
export const OVER_UPPER = {
  EA: { hs: 7000, bs: 1700 },
  EBa1: { hs: 5390, bs: 2000 },
  EBa2: { hs: 5700, bs: 2000 },
  EBa3: { hs: 6790, bs: 2000 },
  SB: { hs: 5200, bs: 2000 },
  SBrail: { hs: 5300, bs: 2000 }, // S-banen with a conductor rail (strømskinne)
};

/** Maintenance allowance for design (§10.4/10.5): horizontal ± and vertical (lift), mm. */
export const MAINTENANCE = { none: { H: 0, V: 0 }, ballast: { H: 50, V: 100 }, slab: { H: 25, V: 50 } };

/** Curve widening e in mm for a horizontal radius R in m (§12, formulas 12.1 and 12.2). */
export function curveWidening(R) {
  if (!(R > 0) || !Number.isFinite(R) || R >= 300) return 0;
  if (R >= 250) return 3750 / R;
  if (R >= 150) return 60000 / R - 225;
  return 60000 / 150 - 225; // below 150 m the norm asks for a dispensation (EN 15273): the value at 150 m, flagged
}

/** Change of heights Δh in mm in a rounding curve of radius Rv in m (§13, formula 13.1). */
export function roundingDelta(Rv) {
  if (!(Rv > 0) || !Number.isFinite(Rv) || Rv >= 10000) return 0;
  return 50000 / Math.max(Rv, 500); // below 500 m: dispensation (EN 15273), flagged
}

// ------------------------------------------------------------------ along the alignment
/** Radius (m, positive) of the horizontal alignment at distance s: from its segments, or estimated from the line. */
export function radiusAt(al, s) {
  const H = al.horizontal;
  if (H?.length) {
    const seg = segAt(H, s);
    if (!seg) return Infinity;
    if (seg.type === 'CIRCULARARC') return seg.r0 || Infinity;
    if (seg.type === 'LINE') return Infinity;
    // transition: the radius changes along it (curvature linear)
    const k0 = seg.r0 ? 1 / seg.r0 : 0, k1 = seg.r1 ? 1 / seg.r1 : 0;
    const k = k0 + ((k1 - k0) * (s - seg.s0)) / (seg.L || 1);
    return k > 1e-9 ? 1 / k : Infinity;
  }
  // a line without design parameters: the circle through points 10 m before and after
  const a = pointAt(al, s - 10), b = pointAt(al, s), c = pointAt(al, s + 10);
  const ab = Math.hypot(b.x - a.x, b.y - a.y), bc = Math.hypot(c.x - b.x, c.y - b.y), ca = Math.hypot(a.x - c.x, a.y - c.y);
  const area2 = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  return area2 < 1e-6 ? Infinity : (ab * bc * ca) / (2 * area2);
}

function segAt(list, s) {
  let seg = null;
  for (const x of list) if (s >= x.s0 - 1e-9) seg = x;
  return seg && s <= seg.s0 + seg.L + 1e-9 ? seg : null;
}

/**
 * Curve widening e (mm) at distance s, with the run-in of figures 12-2 to 12-7: present from the
 * start of a curve with R > 250 m; for R ≤ 250 m growing linearly from 12 m before its start to its
 * full value 2 m before; over a transition curve growing linearly from the transition's start to the
 * value of the curve it leads into (between two curves: from the one value to the other). Mirrored
 * where the curve ends. {e, R} – R the radius that decides it.
 */
export function wideningAt(al, s) {
  const H = al.horizontal;
  if (!H?.length) { const R = radiusAt(al, s); return { e: curveWidening(R), R }; }
  let best = { e: 0, R: Infinity };
  const take = (e, R) => { if (e > best.e + 1e-9) best = { e, R }; };
  for (let i = 0; i < H.length; i++) {
    const g = H[i];
    if (g.type === 'CIRCULARARC' && g.r0) {
      const e = curveWidening(g.r0), a = g.s0, b = g.s0 + g.L;
      if (s >= a && s <= b) take(e, g.r0);
      // the run-in before and after, unless a transition curve leads into it
      const prev = H[i - 1], next = H[i + 1];
      const ramp = (d) => (g.r0 <= 250 ? (d <= 2 ? 1 : d >= 12 ? 0 : (12 - d) / 10) : 0);
      if (s < a && prev?.type !== 'CLOTHOID' && !/TRANSITION|SPIRAL|BLOSS|COSINE|SINE|HELMERT|VIENNESE/.test(prev?.type || '')) take(e * ramp(a - s), g.r0);
      if (s > b && next?.type !== 'CLOTHOID' && !/TRANSITION|SPIRAL|BLOSS|COSINE|SINE|HELMERT|VIENNESE/.test(next?.type || '')) take(e * ramp(s - b), g.r0);
    } else if (g.type !== 'LINE' && g.L > 0 && s >= g.s0 && s <= g.s0 + g.L) {
      // a transition: linear between the values at its ends (fig. 12-6, 12-7)
      const e0 = g.r0 ? curveWidening(g.r0) : 0, e1 = g.r1 ? curveWidening(g.r1) : 0;
      const f = (s - g.s0) / g.L;
      take(e0 + (e1 - e0) * f, Math.min(g.r0 || Infinity, g.r1 || Infinity));
    }
  }
  return best;
}

/** Δh (mm) at distance s: from 25 m before a rounding curve, growing linearly to its full value at its start (§13). */
export function roundingAt(al, s) {
  let best = 0;
  for (const v of al.vertical || []) {
    if (!v.R) continue;
    const dh = roundingDelta(v.R), a = v.s0, b = v.s0 + v.L;
    const f = s >= a && s <= b ? 1 : s < a ? Math.max(0, 1 - (a - s) / 25) : Math.max(0, 1 - (s - b) / 25);
    best = Math.max(best, dh * f);
  }
  return best;
}

/** Heights (m) of the left and right rail above the alignment's profile at s, and the rail head distance. */
export function cantAt(al, s, manual = null) {
  const c = al.cant;
  if (c?.segs?.length) {
    const g = segAt(c.segs, s) || (s < c.segs[0].s0 ? c.segs[0] : c.segs[c.segs.length - 1]);
    const f = g.L ? Math.min(1, Math.max(0, (s - g.s0) / g.L)) : 0;
    return { left: g.cl0 + (g.cl1 - g.cl0) * f, right: g.cr0 + (g.cr1 - g.cr0) * f, railHead: c.railHead || 1.5 };
  }
  if (manual) return { left: manual.left || 0, right: manual.right || 0, railHead: 1.5 };
  return { left: 0, right: 0, railHead: 1.5 };
}

// ------------------------------------------------------------------ the profile at a station
/**
 * The gauge at one station as polygons in the SO frame (metres; b right positive, h up). def:
 * {id: profile id | 'custom', custom: {points: [[b, h]] (mm, right half or the whole outline),
 * symmetric, widen (mm each side), raise (mm), curveRules}, sides: 'both'|'left'|'right' (profile
 * R), p1f1, over: key of OVER_UPPER | null, tunnel, maintenance: key of MAINTENANCE}.
 * ctx: {e (mm), R (m), dh (mm)}. Returns {polys: [[[b, h], …]], H, V (maintenance, m)}.
 */
export function profileAt(def, ctx = {}) {
  const e = ctx.e || 0, dh = ctx.dh || 0, R = ctx.R ?? Infinity;
  const over = def.over ? OVER_UPPER[def.over] : null;
  const m = MAINTENANCE[def.maintenance || 'none'] || MAINTENANCE.none;
  let right, left, top;
  if (def.id === 'custom') {
    const c = def.custom || {};
    const pts = (c.points || []).filter((p) => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]));
    const hs = pts.map((p) => p[1]);
    const mid = (Math.min(...hs) + Math.max(...hs)) / 2;
    const rules = c.curveRules !== false;
    // own widening: each side and on top; the norm's curve rules as for profile D, when chosen
    const adj = (b, h, sign) => {
      let bb = b, hh = h;
      if (bb * sign > 0) bb += sign * ((c.widen || 0) + (rules ? e : 0));
      if (hh > mid) hh += c.raise || 0;
      if (rules && hh <= 1170) hh = Math.max(0, hh - dh);
      else if (rules && hh > 3300) hh += dh;
      return [bb / 1000, hh / 1000];
    };
    if (c.symmetric !== false) {
      const halfR = pts.map(([b, h]) => adj(Math.abs(b), h, 1));
      const halfL = pts.map(([b, h]) => adj(-Math.abs(b), h, -1));
      return { polys: [[...halfR, ...halfL.reverse()]], H: m.H / 1000, V: m.V / 1000, top: Math.max(...hs) / 1000 };
    }
    return { polys: [pts.map(([b, h]) => adj(b, h, b >= 0 ? 1 : -1))], H: m.H / 1000, V: m.V / 1000, top: Math.max(...hs) / 1000 };
  }
  const P = PROFILES[def.id] || PROFILES.D;
  top = def.p1f1 && P.topP1 ? P.topP1 : P.top;
  const widenU = R < 180 || (def.p1f1 && def.id === 'A');
  const half = (list, sign) => list.map(([b, h, f]) => {
    let bb = b, hh = h === P.top ? top : h;
    if (bb > 0 && (f.includes('W') || f.includes('L') || (f.includes('U') && widenU))) bb += e;
    if (f.includes('d')) hh = Math.max(0, hh - dh);
    if (f.includes('i') || (f.includes('j') && !over)) hh += dh;
    return [(sign * bb) / 1000, hh / 1000];
  });
  // profile R: the shunting widening on the chosen side(s), D on the other
  const sides = def.sides || 'both';
  const rightList = P.other && sides === 'left' ? PROFILES[P.other].half : P.half;
  const leftList = P.other && sides === 'right' ? PROFILES[P.other].half : P.half;
  right = half(rightList, 1);
  left = half(leftList, -1).reverse();
  const polys = [[...right, ...left]];
  if (over) {
    // a rectangle on top of the profile (not widened; +50 mm in tunnels over 100 m)
    const hs = (over.hs + (def.tunnel ? 50 : 0)) / 1000, bs = over.bs / 1000, t = top / 1000;
    if (hs > t) polys.push([[bs, t], [bs, hs], [-bs, hs], [-bs, t]]);
  }
  return { polys, H: m.H / 1000, V: m.V / 1000, top: top / 1000 };
}

// ------------------------------------------------------------------ 2D geometry
function inside(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
function edgeDist(poly, x, y) {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, segDist(x, y, poly[j][0], poly[j][1], poly[i][0], poly[i][1]));
  return d;
}
function segsCross(a, b, c, d) {
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
/** Convex hull (monotone chain) of 2D points. */
function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop();
  return lo.concat(up);
}

/**
 * How far a convex polygon Q (e.g. a triangle seen along the track) reaches into the polygon P:
 * null when they do not overlap, else {depth (m, the deepest point's distance to P's outline), at: [b, h]}.
 */
export function intrusion(P, Q) {
  let hit = false;
  for (const q of Q) if (inside(P, q[0], q[1])) { hit = true; break; }
  if (!hit) for (const p of P) if (Q.length >= 3 && inside(Q, p[0], p[1])) { hit = true; break; }
  if (!hit) {
    outer: for (let i = 0; i < Q.length; i++) {
      const a = Q[i], b = Q[(i + 1) % Q.length];
      for (let j = 0, k = P.length - 1; j < P.length; k = j++) if (segsCross(a, b, P[k], P[j])) { hit = true; break outer; }
    }
  }
  if (!hit) return null;
  // the deepest point: corners of Q inside P, points along Q's edges, corners of P inside Q
  let depth = 0, at = Q[0];
  const test = (x, y) => { if (inside(P, x, y)) { const d = edgeDist(P, x, y); if (d > depth) { depth = d; at = [x, y]; } } };
  for (let i = 0; i < Q.length; i++) {
    const a = Q[i], b = Q[(i + 1) % Q.length];
    for (let k = 0; k <= 8; k++) test(a[0] + ((b[0] - a[0]) * k) / 8, a[1] + ((b[1] - a[1]) * k) / 8);
  }
  if (Q.length >= 3) for (const p of P) if (inside(Q, p[0], p[1])) { const d = Math.min(edgeDist(Q, p[0], p[1]), depth || Infinity); if (d > depth) { depth = d; at = p; } }
  return { depth, at };
}

// ------------------------------------------------------------------ the check
const MAX_EDGE = 1.0; // triangles are split until their edges are this short (m): curves stay exact

/**
 * Elements of the visible models that reach into the gauge along the alignment between from and
 * to (distances along it, m). opts: {def, models (Set; null: all visible), exclude (Set of IFC
 * classes, upper case), ocl (Set of models whose elements may be in the profile over the upper
 * part), manualCant ({left, right} m when the file has none), onProgress (fraction)}.
 * Returns {hits: [{model, id, s0, s1, depth (m), side ('left'|'right'), at: {s, b, h}}], warnings}.
 */
export async function checkClearance(viewer, al, from, to, opts) {
  const def = opts.def;
  const s0 = Math.max(0, Math.min(from, to)), s1 = Math.min(al.length, Math.max(from, to));
  const warnings = new Set();
  // how far from the track the gauge reaches (m), with margins
  const probe = profileAt(def, { e: 400, dh: 100, R: 100 });
  let reach = 0, high = 0;
  for (const poly of probe.polys) for (const [b, h] of poly) { reach = Math.max(reach, Math.abs(b)); high = Math.max(high, h); }
  reach += probe.H + MAX_EDGE + 0.5; high += probe.V + 0.5;
  // the path in the range as segments in a grid (plan, IFC x/y)
  const segs = [];
  for (let k = 1; k < al.poly.length; k++) {
    if (al.cum[k] < s0 - 1 || al.cum[k - 1] > s1 + 1) continue;
    const a = al.poly[k - 1], b = al.poly[k], L = al.cum[k] - al.cum[k - 1];
    if (L < 1e-9) continue;
    segs.push({ a, c0: al.cum[k - 1], L, ux: (b[0] - a[0]) / L, uy: (b[1] - a[1]) / L, minX: Math.min(a[0], b[0]) - reach, maxX: Math.max(a[0], b[0]) + reach, minY: Math.min(a[1], b[1]) - reach, maxY: Math.max(a[1], b[1]) + reach });
  }
  if (!segs.length) return { hits: [], warnings: [] };
  let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity;
  for (const g of segs) { gx0 = Math.min(gx0, g.minX); gy0 = Math.min(gy0, g.minY); gx1 = Math.max(gx1, g.maxX); gy1 = Math.max(gy1, g.maxY); }
  const cell = Math.max(5, reach * 2);
  const grid = new Map(), key = (i, j) => i * 1000003 + j;
  segs.forEach((g, n) => {
    for (let i = Math.floor((g.minX - gx0) / cell); i <= Math.floor((g.maxX - gx0) / cell); i++) {
      for (let j = Math.floor((g.minY - gy0) / cell); j <= Math.floor((g.maxY - gy0) / cell); j++) {
        const kk = key(i, j); if (!grid.has(kk)) grid.set(kk, []); grid.get(kk).push(n);
      }
    }
  });
  // the frame at a distance: cached per 0.25 m
  const frames = new Map();
  const frameAt = (s) => {
    const k = Math.round(s * 4);
    let f = frames.get(k);
    if (!f) {
      const ss = k / 4;
      const w = wideningAt(al, ss), dh = roundingAt(al, ss);
      if (w.R < 150) warnings.add('radius');
      if (dh > 0) for (const v of al.vertical || []) if (v.R && v.R < 500 && ss >= v.s0 - 25 && ss <= v.s0 + v.L + 25) warnings.add('rounding');
      const c = cantAt(al, ss, opts.manualCant);
      const th = Math.atan2(c.right - c.left, c.railHead);
      f = { prof: profileAt(def, { e: w.e, R: w.R, dh }), z: heightAt(al, ss) ?? 0, zc: (c.left + c.right) / 2, cos: Math.cos(th), sin: Math.sin(th) };
      frames.set(k, f);
    }
    return f;
  };
  // a point (IFC) -> {s, b, h} in the SO frame, or null outside the range / too far from the track
  const toFrame = (x, y, z) => {
    if (x < gx0 || x > gx1 || y < gy0 || y > gy1) return null;
    const list = grid.get(key(Math.floor((x - gx0) / cell), Math.floor((y - gy0) / cell)));
    if (!list) return null;
    // the nearest segment (clamped: a point outside a bend, between two segments, keeps the nearer end)
    let bs = null, bd = Infinity, best = Infinity;
    for (const si of list) {
      const g = segs[si];
      const t = (x - g.a[0]) * g.ux + (y - g.a[1]) * g.uy;
      const tc = Math.max(0, Math.min(g.L, t));
      const dd = (x - g.a[0]) * g.uy - (y - g.a[1]) * g.ux; // right positive
      const dist = Math.hypot(dd, t - tc);
      if (dist < best) { best = dist; bd = dd; bs = g.c0 + tc; }
    }
    if (bs === null || best > reach) return null;
    const f = frameAt(bs);
    const dz = z - f.z - f.zc;
    return { s: bs, b: bd * f.cos + dz * f.sin, h: -bd * f.sin + dz * f.cos, f };
  };
  // can a triangle come near the track at all? (its plan box against the segments' boxes)
  const nearTrack = (a, b, c) => {
    const x0 = Math.min(a.x, b.x, c.x), x1 = Math.max(a.x, b.x, c.x), y0 = Math.min(a.y, b.y, c.y), y1 = Math.max(a.y, b.y, c.y);
    if (x1 < gx0 || x0 > gx1 || y1 < gy0 || y0 > gy1) return false;
    const i0 = Math.floor((Math.max(x0, gx0) - gx0) / cell), i1 = Math.floor((Math.min(x1, gx1) - gx0) / cell);
    const j0 = Math.floor((Math.max(y0, gy0) - gy0) / cell), j1 = Math.floor((Math.min(y1, gy1) - gy0) / cell);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 400) return true; // a huge triangle: split it first
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      for (const n of grid.get(key(i, j)) || []) { const g = segs[n]; if (x1 >= g.minX && x0 <= g.maxX && y1 >= g.minY && y0 <= g.maxY) return true; }
    }
    return false;
  };
  const v = viewer;
  const inv = v.referenceMatrix ? v.referenceMatrix.clone().invert() : new THREE.Matrix4();
  const hits = new Map(); // "model|id" -> hit
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  const toIfc = (p) => { const x = p.x, y = -p.z, z = p.y; p.set(x, y, z); return p; };
  const models = v.models.filter((m) => m.visible && (!opts.models || opts.models.has(m)));
  const total = models.reduce((n, m) => n + m.buckets.length, 0) || 1;
  let done = 0, lastYield = performance.now();
  const test = (m, id, a, b, c, upperOk, depth = 0) => {
    // split long triangles: the track curves, and the gauge changes along it
    const lab = a.distanceTo(b), lbc = b.distanceTo(c), lca = c.distanceTo(a);
    const longest = Math.max(lab, lbc, lca);
    if (!nearTrack(a, b, c)) return;
    if (longest > MAX_EDGE && depth < 14) {
      const ab = a.clone().lerp(b, 0.5), bc = b.clone().lerp(c, 0.5), ca = c.clone().lerp(a, 0.5);
      if (lab >= lbc && lab >= lca) { test(m, id, a, ab, c, upperOk, depth + 1); test(m, id, ab, b, c, upperOk, depth + 1); }
      else if (lbc >= lca) { test(m, id, a, b, bc, upperOk, depth + 1); test(m, id, a, bc, c, upperOk, depth + 1); }
      else { test(m, id, a, b, ca, upperOk, depth + 1); test(m, id, ca, b, c, upperOk, depth + 1); }
      return;
    }
    const pa = toFrame(a.x, a.y, a.z), pb = toFrame(b.x, b.y, b.z), pc = toFrame(c.x, c.y, c.z);
    const pts = [pa, pb, pc].filter(Boolean);
    if (!pts.length) return;
    const sm = pts.reduce((x, p) => x + p.s, 0) / pts.length;
    if (sm < s0 || sm > s1) return;
    if (pts.every((p) => p.h > high || p.h < -1)) return;
    const f = frameAt(sm);
    const { polys, H, V } = f.prof;
    // the triangle seen along the track; the maintenance allowance moves the profile up to H
    // sideways and V up: the same as the triangle moved the other way (a convex hull)
    let Q = pts.map((p) => [p.b, p.h]);
    if (H || V) Q = hull(Q.flatMap(([x, y]) => [[x - H, y], [x + H, y], [x - H, y - V], [x + H, y - V]]));
    for (let i = 0; i < polys.length; i++) {
      if (i > 0 && upperOk) continue; // the overhead line may be in the profile over the upper part
      const r = intrusion(polys[i], Q);
      if (!r) continue;
      const k = `${m.uid}|${id}`;
      let hit = hits.get(k);
      if (!hit) hits.set(k, (hit = { model: m, id, s0: sm, s1: sm, depth: -1, side: 'right', at: null, part: i ? 'upper' : 'lower' }));
      hit.s0 = Math.min(hit.s0, sm); hit.s1 = Math.max(hit.s1, sm);
      if (r.depth > hit.depth) { hit.depth = r.depth; hit.side = r.at[0] < 0 ? 'left' : 'right'; hit.at = { s: sm, b: r.at[0], h: r.at[1] }; hit.part = i ? 'upper' : 'lower'; }
    }
  };
  for (const m of models) {
    m.group.updateMatrixWorld(true);
    const M = inv.clone().multiply(m.group.matrixWorld);
    const upperOk = !!opts.ocl?.has(m);
    for (const b of m.buckets) {
      const P = b.positions, I = b.index;
      for (const it of b.items) {
        if (m.hidden.has(it.id)) continue;
        if (opts.exclude?.size && opts.exclude.has(String(m.typeName(it.id) || '').toUpperCase())) continue;
        for (let k = it.start; k + 2 < it.start + it.count; k += 3) {
          let vi = I[k] * 3; toIfc(A.set(P[vi], P[vi + 1], P[vi + 2]).applyMatrix4(M));
          vi = I[k + 1] * 3; toIfc(B.set(P[vi], P[vi + 1], P[vi + 2]).applyMatrix4(M));
          vi = I[k + 2] * 3; toIfc(C.set(P[vi], P[vi + 1], P[vi + 2]).applyMatrix4(M));
          if (Math.max(A.x, B.x, C.x) < gx0 || Math.min(A.x, B.x, C.x) > gx1 || Math.max(A.y, B.y, C.y) < gy0 || Math.min(A.y, B.y, C.y) > gy1) continue;
          test(m, it.id, A.clone(), B.clone(), C.clone(), upperOk);
        }
        if (performance.now() - lastYield > 60) {
          opts.onProgress?.((done + 0.5) / total);
          await new Promise((r) => setTimeout(r, 0));
          lastYield = performance.now();
        }
      }
      done++;
      opts.onProgress?.(done / total);
    }
  }
  const list = [...hits.values()].map((x) => ({ ...x, depth: Math.max(0, x.depth) })).sort((a, b) => a.s0 - b.s0);
  return { hits: list, warnings: [...warnings] };
}

// ------------------------------------------------------------------ in 3D and in sections
export const GAUGE_COLOR = '#E67E22';

/** The gauge drawn along the track: its outline every few metres and lines along its corners. */
export class ClearanceLayer {
  constructor(viewer) {
    this.viewer = viewer;
    this.group = new THREE.Group();
    this.group.name = 'structure gauge';
    viewer.helpers.add(this.group);
    this.def = null; // {al, from, to, def, manualCant}
  }

  /** The outline at distance s in IFC coordinates: [[x, y, z], …] per polygon. */
  outlineAt(al, s, def, manualCant) {
    const w = wideningAt(al, s), dh = roundingAt(al, s), c = cantAt(al, s, manualCant);
    const th = Math.atan2(c.right - c.left, c.railHead), cos = Math.cos(th), sin = Math.sin(th);
    const p = pointAt(al, s), z = (heightAt(al, s) ?? 0) + (c.left + c.right) / 2;
    const rx = p.dy, ry = -p.dx; // right of the track in plan
    const { polys } = profileAt(def, { e: w.e, R: w.R, dh });
    return polys.map((poly) => poly.map(([b, h]) => {
      const d = b * cos - h * sin, up = b * sin + h * cos;
      return [p.x + rx * d, p.y + ry * d, z + up];
    }));
  }

  set(def) { this.def = def; this.rebuild(); }
  clear() { this.def = null; this.rebuild(); }

  rebuild() {
    for (const o of [...this.group.children]) { this.group.remove(o); o.geometry?.dispose(); o.material?.dispose(); }
    const d = this.def;
    if (d) {
      const { al } = d;
      const s0 = Math.max(0, Math.min(d.from, d.to)), s1 = Math.min(al.length, Math.max(d.from, d.to));
      const v = this.viewer;
      const P = (q) => v.fromIfc(q[0], q[1], q[2]);
      const pos = [];
      // the outline every 10 m (and at both ends), and the corners joined every 2 m
      const rings = [];
      for (let s = s0; s < s1; s += 10) rings.push(s);
      rings.push(s1);
      for (const s of rings) for (const poly of this.outlineAt(al, s, d.def, d.manualCant)) {
        for (let i = 0; i < poly.length; i++) { const a = P(poly[i]), b = P(poly[(i + 1) % poly.length]); pos.push(a.x, a.y, a.z, b.x, b.y, b.z); }
      }
      let prev = null;
      for (let s = s0; s <= s1 + 1e-6; s += 2) {
        const cur = this.outlineAt(al, Math.min(s, s1), d.def, d.manualCant);
        if (prev) cur.forEach((poly, j) => poly.forEach((q, i) => { const a = P(prev[j][i]), b = P(q); pos.push(a.x, a.y, a.z, b.x, b.y, b.z); }));
        prev = cur;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: GAUGE_COLOR, transparent: true, opacity: 0.55, depthWrite: false }));
      lines.renderOrder = OVERLAY_ORDER + 22;
      lines.frustumCulled = false;
      this.group.add(lines);
    }
    this.viewer.invalidate?.();
  }

  /** The gauge in a station section of the same alignment: polylines in viewer coordinates. */
  sectionOutline(entry) {
    const d = this.def;
    if (!d || !entry.station || entry.station.al !== d.al) return [];
    const s = entry.station.s;
    if (s < Math.min(d.from, d.to) - 1e-6 || s > Math.max(d.from, d.to) + 1e-6) return [];
    return this.outlineAt(d.al, s, d.def, d.manualCant).map((poly) => [...poly, poly[0]].map((q) => this.viewer.fromIfc(q[0], q[1], q[2])));
  }
}
