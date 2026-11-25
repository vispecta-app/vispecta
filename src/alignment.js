// IFC4x3 alignments: horizontal geometry (from the design parameters, else web-ifc's tessellation),
// vertical profile computed
// from IfcAlignmentVerticalSegment, stationing from IfcReferent / Pset_Stationing.
// Used to draw the alignment with station marks and to give station + offset for points.
import * as THREE from 'three';
import { OVERLAY_ORDER } from './cutlines.js';
import { WebIFC } from './webifc.js'; // loaded with the first model (getApi)
import { fmtValue } from './ifc.js';

const num = (v) => {
  if (v === null || v === undefined) return null;
  const x = typeof v === 'object' ? v._representationValue ?? v.value : v;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

/**
 * Distance along a polyline (IFC plan coordinates) of the point nearest to (x, y), or null when
 * that point is more than maxDist away (then it does not lie on the alignment).
 */
function alongPoly(poly, cum, x, y, maxDist) {
  let best = null, bestD = Infinity;
  for (let k = 1; k < poly.length; k++) {
    const [ax, ay] = poly[k - 1], [bx, by] = poly[k];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0;
    const d = Math.hypot(ax + dx * t - x, ay + dy * t - y);
    if (d < bestD) { bestD = d; best = cum[k - 1] + t * (cum[k] - cum[k - 1]); }
  }
  return bestD <= maxDist ? best : null;
}

/**
 * The horizontal alignment computed from its design parameters (IfcAlignmentHorizontalSegment), in
 * IFC plan coordinates: lines, circular arcs and clothoids, with points close enough that a chord
 * is never more than about 1 mm off the curve (#79). web-ifc tessellates arcs with chords of tens of
 * metres – up to 11 cm inside an arc of R = 2000 m, enough to put a cross section off the axis.
 * Returns null when a segment type can't be computed exactly here (the caller keeps web-ifc's points).
 */
function exactHorizontal(segs, scale) {
  if (!segs.length) return null;
  const curv = (r) => (r ? 1 / r : 0);
  const poly = [];
  for (const sg of segs) {
    if (!['LINE', 'CIRCULARARC', 'CLOTHOID'].includes(sg.type) || !Number.isFinite(sg.L) || !sg.start) return null;
    const k0 = curv(sg.r0), k1 = curv(sg.type === 'CIRCULARARC' ? sg.r0 : sg.r1);
    const L = sg.L;
    let x = sg.start[0], y = sg.start[1], th = sg.dir;
    if (!poly.length) poly.push([x * scale, y * scale]);
    if (sg.type === 'LINE' || (!k0 && !k1)) {
      poly.push([(x + L * Math.cos(th)) * scale, (y + L * Math.sin(th)) * scale]);
      continue;
    }
    // output step for a chord error of about 1 mm: e = κ·h²/8, at most 5 m; integration in fine steps
    const kmax = Math.max(Math.abs(k0), Math.abs(k1));
    const out = Math.min(5, Math.sqrt((8 * 0.001) / kmax));
    const nOut = Math.max(1, Math.ceil(L / out));
    const sub = Math.max(1, Math.ceil(out / 0.05));
    const ds = L / (nOut * sub);
    let s = 0;
    for (let i = 0; i < nOut; i++) {
      for (let j = 0; j < sub; j++) {
        const kA = k0 + ((k1 - k0) * s) / L, kB = k0 + ((k1 - k0) * (s + ds)) / L;
        const tm = th + ((kA + kB) / 4) * ds; // heading in the middle of the step
        x += ds * Math.cos(tm); y += ds * Math.sin(tm);
        th += ((kA + kB) / 2) * ds;
        s += ds;
      }
      poly.push([x * scale, y * scale]);
    }
  }
  return poly;
}

/**
 * The matrix of an IfcLocalPlacement chain (IFC coordinates, metres), or null when it is the identity.
 * Only IfcAxis2Placement3D/2D relative placements are followed.
 */
function placementMatrix(api, mid, id, scale) {
  const m = new THREE.Matrix4();
  let any = false;
  for (let guard = 0; id && guard < 32; guard++) {
    const pl = api.GetLine(mid, id, false);
    const rp = pl?.RelativePlacement?.value ? api.GetLine(mid, pl.RelativePlacement.value, false) : null;
    if (rp) {
      const loc = rp.Location?.value ? api.GetLine(mid, rp.Location.value, false) : null;
      const c = (loc?.Coordinates || []).map((q) => num(q) ?? 0);
      const dir = (ref) => { const d = ref?.value ? api.GetLine(mid, ref.value, false) : null; return d?.DirectionRatios ? d.DirectionRatios.map((q) => num(q) ?? 0) : null; };
      const az = dir(rp.Axis) || [0, 0, 1];
      const z = new THREE.Vector3(az[0], az[1], az[2] ?? 1).normalize();
      const r = dir(rp.RefDirection) || [1, 0, 0];
      const x = new THREE.Vector3(r[0], r[1], r[2] ?? 0);
      x.addScaledVector(z, -x.dot(z)).normalize();
      const y = new THREE.Vector3().crossVectors(z, x);
      const local = new THREE.Matrix4().makeBasis(x, y, z).setPosition((c[0] || 0) * scale, (c[1] || 0) * scale, (c[2] || 0) * scale);
      if (!local.equals(new THREE.Matrix4())) any = true;
      m.premultiply(local);
    }
    id = pl?.PlacementRelTo?.value || null;
  }
  return any ? m : null;
}

/** Reads all alignments of a model. Returns [] for models without IfcAlignment. */
export async function readAlignments(model) {
  const api = model.api, mid = model.modelID;
  if (!WebIFC.IFCALIGNMENT) return [];
  const ids = api.GetLineIDsWithType(mid, WebIFC.IFCALIGNMENT);
  if (!ids.size()) return [];
  let raw = [];
  try { raw = api.GetAllAlignments(mid) || []; } catch (e) { console.warn('GetAllAlignments', e); }
  // nesting: parent -> children
  const nests = new Map();
  const rn = api.GetLineIDsWithType(mid, WebIFC.IFCRELNESTS);
  for (let i = 0; i < rn.size(); i++) {
    const rel = api.GetLine(mid, rn.get(i), false);
    const p = rel.RelatingObject?.value;
    if (!p) continue;
    if (!nests.has(p)) nests.set(p, []);
    nests.get(p).push(...(rel.RelatedObjects || []).map((r) => r.value));
  }
  // web-ifc returns 'IFCALIGNMENT' for IFC4 but 'IfcAlignment' for IFC4X3: compare in upper case
  const typeName = (id) => String(api.GetNameFromTypeCode(api.GetLineType(mid, id))).toUpperCase();
  const scale = model.lengthScale || 1;
  const out = [];
  for (let i = 0; i < ids.size(); i++) {
    const aid = ids.get(i);
    const line = api.GetLine(mid, aid, false);
    const r = raw[i];
    if (!r?.horizontal?.length) continue;
    // horizontal polyline (IFC X/Y), duplicate points removed. With COORDINATE_TO_ORIGIN web-ifc
    // returns the points shifted like the geometry; undo that shift to get real IFC coordinates.
    const shift = new THREE.Matrix4().fromArray(r.FlatCoordinationMatrix?.length === 16 ? r.FlatCoordinationMatrix : (model.rawCoordMatrix || model.coordMatrix).elements).invert();
    const v3 = new THREE.Vector3();
    const poly = [];
    for (const seg of r.horizontal) {
      for (const p of seg.points) {
        v3.set(p.x, 0, -p.y).applyMatrix4(shift); // IFC (x, y) -> three.js (x, 0, -y)
        const q = [v3.x * scale, -v3.z * scale];
        const last = poly[poly.length - 1];
        if (!last || Math.hypot(q[0] - last[0], q[1] - last[1]) > 1e-6) poly.push(q);
      }
    }
    if (poly.length < 2) continue;
    // the exact horizontal from the design parameters, when it matches web-ifc's ends (#79)
    const hsegs = [];
    try {
      for (const child of nests.get(aid) || []) {
        if (typeName(child) !== 'IFCALIGNMENTHORIZONTAL') continue;
        for (const sid of nests.get(child) || []) {
          const seg = api.GetLine(mid, sid, false);
          const dp = seg?.DesignParameters?.value ? api.GetLine(mid, seg.DesignParameters.value, false) : null;
          if (!dp) continue;
          const sp = dp.StartPoint?.value ? api.GetLine(mid, dp.StartPoint.value, false) : null;
          hsegs.push({
            type: dp.PredefinedType?.value, start: sp?.Coordinates ? [num(sp.Coordinates[0]), num(sp.Coordinates[1])] : null,
            dir: num(dp.StartDirection), r0: num(dp.StartRadiusOfCurvature) ?? 0, r1: num(dp.EndRadiusOfCurvature) ?? 0, L: num(dp.SegmentLength),
          });
        }
      }
      // a zero-length end segment carries no geometry
      const exact = exactHorizontal(hsegs.filter((hs) => hs.L > 0), scale);
      // only when the design parameters lie where web-ifc put the geometry (no extra placement)
      const near = (a, b) => a && b && Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.5;
      if (exact && near(exact[0], poly[0]) && near(exact[exact.length - 1], poly[poly.length - 1])) {
        poly.length = 0;
        poly.push(...exact);
      }
    } catch (e) { console.warn('exact horizontal', e); }
    // the alignment's own placement (IfcLocalPlacement chain): web-ifc gives the curve without it
    let place = null;
    try { place = placementMatrix(api, mid, line?.ObjectPlacement?.value, scale); } catch { place = null; }
    if (place) for (const p of poly) { v3.set(p[0], p[1], 0).applyMatrix4(place); p[0] = v3.x; p[1] = v3.y; }
    const cum = [0];
    for (let k = 1; k < poly.length; k++) cum.push(cum[k - 1] + Math.hypot(poly[k][0] - poly[k - 1][0], poly[k][1] - poly[k - 1][1]));
    // the horizontal segments with their radii (structure gauge, #127): kept when they add up to the
    // length of the line (else the radius is estimated from the line itself, see radiusAt)
    let horizontal = null;
    {
      const hs = hsegs.filter((x) => x.L > 0);
      const total = hs.reduce((a, x) => a + x.L * scale, 0);
      if (hs.length && Math.abs(total - cum[cum.length - 1]) < Math.max(0.5, 0.005 * total)) {
        let s0 = 0;
        horizontal = hs.map((x) => { const o = { s0, L: x.L * scale, type: x.type, r0: Math.abs(x.r0 || 0) * scale, r1: Math.abs(x.r1 || 0) * scale }; s0 += o.L; return o; });
      }
    }
    // vertical profile
    const vertical = [];
    for (const child of nests.get(aid) || []) {
      if (typeName(child) !== 'IFCALIGNMENTVERTICAL') continue;
      for (const sid of nests.get(child) || []) {
        const seg = api.GetLine(mid, sid, false);
        const dp = seg?.DesignParameters?.value ? api.GetLine(mid, seg.DesignParameters.value, false) : null;
        if (!dp) continue;
        const vs = {
          s0: num(dp.StartDistAlong) * scale, L: num(dp.HorizontalLength) * scale, h0: num(dp.StartHeight) * scale,
          g0: num(dp.StartGradient) ?? 0, g1: num(dp.EndGradient) ?? num(dp.StartGradient) ?? 0,
          type: dp.PredefinedType?.value || 'CONSTANTGRADIENT',
        };
        // radius of a rounding (vertical) curve: given, or from the change of gradient over its length
        const rv = Math.abs(num(dp.RadiusOfCurvature) || 0) * scale;
        vs.R = vs.type === 'CONSTANTGRADIENT' ? 0 : rv || (Math.abs(vs.g1 - vs.g0) > 1e-9 ? vs.L / Math.abs(vs.g1 - vs.g0) : 0);
        vertical.push(vs);
      }
    }
    vertical.sort((a, b) => a.s0 - b.s0);
    if (place) { const dz = place.elements[14]; if (dz) for (const vs of vertical) vs.h0 += dz; }
    // cant (#127): the heights of the left and right rail above the profile, along the alignment
    let cant = null;
    for (const child of nests.get(aid) || []) {
      if (typeName(child) !== 'IFCALIGNMENTCANT') continue;
      const c = api.GetLine(mid, child, false);
      const segs = [];
      for (const sid of nests.get(child) || []) {
        const seg = api.GetLine(mid, sid, false);
        const dp = seg?.DesignParameters?.value ? api.GetLine(mid, seg.DesignParameters.value, false) : null;
        if (!dp) continue;
        const cl0 = num(dp.StartCantLeft) ?? 0, cr0 = num(dp.StartCantRight) ?? 0;
        segs.push({
          s0: num(dp.StartDistAlong) * scale, L: num(dp.HorizontalLength) * scale,
          cl0: cl0 * scale, cl1: (num(dp.EndCantLeft) ?? cl0) * scale, cr0: cr0 * scale, cr1: (num(dp.EndCantRight) ?? cr0) * scale,
        });
      }
      segs.sort((a, b) => a.s0 - b.s0);
      if (segs.length) cant = { railHead: (num(c.RailHeadDistance) || 1.5) * scale, segs };
    }
    // stationing from referents (IfcReferent with Pset_Stationing.Station)
    const referents = [];
    for (const child of nests.get(aid) || []) {
      if (typeName(child) !== 'IFCREFERENT') continue;
      const ref = api.GetLine(mid, child, false);
      let along = null;
      try {
        const pl = api.GetLine(mid, ref.ObjectPlacement?.value, false);
        const rp = pl?.RelativePlacement?.value ? api.GetLine(mid, pl.RelativePlacement.value, false) : null;
        const loc = rp?.Location?.value ? api.GetLine(mid, rp.Location.value, false) : null;
        along = num(loc?.DistanceAlong);
        // placed by a point (IfcCartesianPoint, e.g. ProVI): its distance along the alignment
        if (along === null && loc?.Coordinates?.length >= 2) along = alongPoly(poly, cum, num(loc.Coordinates[0]) * scale, num(loc.Coordinates[1]) * scale, 1) / scale;
      } catch { /* not placed along the alignment */ }
      let station = null;
      try {
        const psets = await api.properties.getPropertySets(mid, child, true);
        for (const ps of psets) {
          if (fmtValue(ps.Name) !== 'Pset_Stationing') continue;
          for (const p of ps.HasProperties || []) if (fmtValue(p.Name) === 'Station') station = num(p.NominalValue);
        }
      } catch { /* optional */ }
      referents.push({ id: child, name: fmtValue(ref.Name), type: ref.PredefinedType?.value, along: along === null ? null : along * scale, station: station === null ? null : station * scale });
    }
    const st = referents.filter((x) => x.station !== null && x.along !== null).sort((a, b) => a.along - b.along);
    const station0 = st.length ? st[0].station - st[0].along : 0;
    out.push({ id: aid, model, name: fmtValue(line?.Name) || `Alignment #${aid}`, poly, cum, length: cum[cum.length - 1], vertical, horizontal, cant, referents, station0 });
  }
  return out;
}

export { heightAt, pointAt } from './alignment-math.js';
import { heightAt, pointAt } from './alignment-math.js';

/**
 * Projects an IFC point (x, y[, z]) onto the alignment.
 * Returns {s, station, offset (left positive, as in IFC), dz (height above the profile) | null, dist}.
 */
export function project(al, p) {
  const { poly, cum } = al;
  let best = null;
  for (let k = 1; k < poly.length; k++) {
    const a = poly[k - 1], b = poly[k];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const L2 = ex * ex + ey * ey || 1e-12;
    let tt = ((p.x - a[0]) * ex + (p.y - a[1]) * ey) / L2;
    tt = Math.min(1, Math.max(0, tt));
    const qx = a[0] + ex * tt, qy = a[1] + ey * tt;
    const d = Math.hypot(p.x - qx, p.y - qy);
    if (!best || d < best.dist) {
      const L = Math.sqrt(L2);
      const side = Math.sign(ex * (p.y - a[1]) - ey * (p.x - a[0])) || 1; // > 0: left
      best = { dist: d, s: cum[k - 1] + tt * L, offset: side * d };
    }
  }
  const h = heightAt(al, best.s);
  return { ...best, station: al.station0 + best.s, dz: h !== null && p.z !== undefined ? p.z - h : null, profile: h };
}

/*
 * Stationing formats (#29). One setting for the whole app (Alignment menu), remembered in the
 * browser and saved in projects:
 *   km    12+345.678   kilometres + metres (default)
 *   hm    123+45.68    stations of 100 m
 *   kmdot 12.346       kilometres with decimals
 *   kmtxt km 12,346    kilometres with a decimal comma and the prefix "km"
 *   m     12345.678 m  metres
 */
export const STATION_FORMATS = {
  km: '12+345.678', hm: '123+45.68', kmdot: '12.346', kmtxt: 'km 12,346', m: '12345.678 m',
};
export const stationFormat = { value: 'km' };
try { const v = localStorage.getItem('onlineifc.stationFormat'); if (v && v in STATION_FORMATS) stationFormat.value = v; } catch { /* ignore */ }

export function setStationFormat(fmt) {
  stationFormat.value = fmt in STATION_FORMATS ? fmt : 'km';
  try { localStorage.setItem('onlineifc.stationFormat', stationFormat.value); } catch { /* ignore */ }
}

export function formatStation(station, fmt = stationFormat.value) {
  fmt ||= stationFormat.value;
  const sign = station < 0 ? '-' : '';
  // round to the shown precision first, so 12+999.9999 becomes 13+000.000, not 12+1000.000
  const a = fmt === 'hm' ? Math.round(Math.abs(station) * 100) / 100 : Math.round(Math.abs(station) * 1000) / 1000;
  if (fmt === 'm') return `${station.toFixed(3)} m`;
  if (fmt === 'kmdot') return `${sign}${(a / 1000).toFixed(3)}`;
  if (fmt === 'kmtxt') return `km ${sign}${(a / 1000).toFixed(3).replace('.', ',')}`;
  if (fmt === 'hm') {
    const h = Math.floor(a / 100);
    return `${sign}${h}+${(a - h * 100).toFixed(2).padStart(5, '0')}`;
  }
  const km = Math.floor(a / 1000);
  const m = a - km * 1000;
  return `${sign}${km}+${m.toFixed(3).padStart(7, '0')}`;
}

/**
 * Text -> station in metres (#29), whatever the setting:
 *   "12+345.678"  km + m – or 100 m stations + m when the setting is "123+45.68"
 *   "km 12,345" / "12,345 km"  always kilometres
 *   "12345 m" / "12345.5m"     always metres
 *   "12.345" (no unit)          kilometres when the setting is km with decimals, else metres
 * A decimal comma is accepted everywhere. Returns null when the text is not a station.
 */
export function parseStation(text, fmt = stationFormat.value) {
  const v = String(text).trim().replace(/\s+/g, '').replace(',', '.').toLowerCase();
  if (!v) return null;
  const plus = /^(-?)(\d+)\+(\d+(?:\.\d*)?)$/.exec(v.replace(/^km/, ''));
  if (plus) return (plus[1] ? -1 : 1) * (+plus[2] * (fmt === 'hm' ? 100 : 1000) + +plus[3]);
  if (/^km/.test(v) || /km$/.test(v)) { const n = +v.replace(/km/g, ''); return Number.isFinite(n) ? n * 1000 : null; }
  if (/m$/.test(v)) { const n = +v.slice(0, -1); return Number.isFinite(n) ? n : null; }
  const n = +v;
  if (!Number.isFinite(n)) return null;
  return fmt === 'kmdot' || fmt === 'kmtxt' ? n * 1000 : n;
}

/** 3D display of alignments: the line (following the vertical profile) and station marks. */
export class AlignmentLayer {
  constructor(viewer, container) {
    this.viewer = viewer;
    this.group = new THREE.Group();
    viewer.scene.add(this.group);
    this.layer = document.createElement('div');
    this.layer.className = 'measure-layer align-layer';
    container.append(this.layer);
    this.labels = [];
    this.visible = true;
    this.alignments = [];
    this.format = null; // null: the app's stationing format (#29)
    this.interval = 'auto'; // station marks: 'auto', a distance in metres, or 0 = line only
    viewer.renderHooks.push(() => this.#place());
  }

  set(alignments) {
    this.alignments = alignments;
    this.rebuild();
  }

  rebuild() {
    this.viewer.invalidate?.();
    for (const o of [...this.group.children]) { this.group.remove(o); o.geometry?.dispose(); o.material?.dispose(); }
    for (const l of this.labels) l.el.remove();
    this.labels = [];
    if (!this.visible) return;
    // Several alignments side by side (two tracks, #89): every alignment puts its station labels on
    // its outer side – away from its nearest neighbour – so the labels of parallel tracks don't
    // collide. Without a neighbour within 60 m they go to the left.
    const sideOf = new Map();
    for (const al of this.alignments) {
      let side = 1, best = 60;
      const mid = pointAt(al, al.length / 2);
      for (const o of this.alignments) {
        if (o === al) continue;
        const r = project(o, { x: mid.x, y: mid.y });   // where this alignment's middle lies relative to the other
        if (Math.abs(r.offset) < best) { best = Math.abs(r.offset); side = r.offset >= 0 ? 1 : -1; }
      }
      sideOf.set(al, side);
    }
    for (const al of this.alignments) {
      const zOf = (s) => heightAt(al, s) ?? 0;
      const side = sideOf.get(al) || 1;
      const pts = al.poly.map((p, k) => this.viewer.fromIfc(p[0], p[1], zOf(al.cum[k])));
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xf08a24, depthTest: false, transparent: true, opacity: 0.95 }));
      line.renderOrder = OVERLAY_ORDER + 25; // over the cut faces (#37)
      line.frustumCulled = false;
      this.group.add(line);
      // station marks (none when the interval is 0: only the line)
      const step = this.interval === 'auto'
        ? [10, 20, 50, 100, 200, 500, 1000, 2000].find((x) => al.length / x <= 25) || 5000
        : Number(this.interval);
      const ticks = [];
      if (step > 0) {
      const first = Math.ceil((al.station0 - 1e-6) / step) * step;
      const count = Math.floor((al.station0 + al.length + 1e-6 - first) / step) + 1;
      // very many marks: keep every mark as a tick, but label only every n-th one
      const labelEvery = Math.max(1, Math.ceil(count / 1500));
      const half = Math.min(Math.max(0.25, step / 40), 25);
      for (let i = 0; i < count && i < 20000; i++) {
        const st = first + i * step;
        const s = st - al.station0;
        const p = pointAt(al, s);
        const z = zOf(s);
        const nx = -p.dy, ny = p.dx; // left normal
        ticks.push(this.viewer.fromIfc(p.x + nx * half, p.y + ny * half, z), this.viewer.fromIfc(p.x - nx * half, p.y - ny * half, z));
        if (i % labelEvery) continue;
        const el = document.createElement('div');
        el.className = 'm-label align';
        el.textContent = formatStation(st, this.format || stationFormat.value);
        this.layer.append(el);
        const off = half * 1.5 + 1.2; // a little beyond the tick, on the outer side
        this.labels.push({ el, at: this.viewer.fromIfc(p.x + side * nx * off, p.y + side * ny * off, z) });
      }
      }
      if (ticks.length) {
        const tg = new THREE.BufferGeometry().setFromPoints(ticks);
        const tl = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: 0xf08a24, depthTest: false }));
        tl.renderOrder = OVERLAY_ORDER + 25; // over the cut faces (#37)
        tl.frustumCulled = false;
        this.group.add(tl);
      }
      // name at the start
      const el = document.createElement('div');
      el.className = 'm-label align name';
      el.textContent = al.name;
      this.layer.append(el);
      const p0 = al.poly[0];
      this.labels.unshift({ el, at: this.viewer.fromIfc(p0[0], p0[1], zOf(0)), offset: -20 });
    }
  }

  setVisible(v) { this.visible = v; this.rebuild(); }

  #place() {
    if (!this.labels.length) return;
    const placed = [];
    for (const l of this.labels) {
      const s = this.viewer.toScreen(l.at);
      // hide labels that would overlap one already shown (zoomed out)
      if (!s || placed.some((q) => Math.abs(q.x - s.x) < 80 && Math.abs(q.y - s.y) < 20)) { l.el.style.display = 'none'; continue; }
      placed.push(s);
      l.el.style.display = '';
      l.el.style.transform = `translate(${s.x}px, ${s.y + (l.offset || 0)}px) translate(-50%, -50%)`;
    }
  }

  /** Closest alignment for an IFC point, with station and offset. */
  locate(p) {
    let best = null;
    for (const al of this.alignments) {
      const r = project(al, p);
      if (!best || Math.abs(r.offset) < Math.abs(best.offset)) best = { ...r, alignment: al };
    }
    return best;
  }
}

/**
 * Section marks of cross sections at stations, shown in 3D: a dash-dot line across the alignment
 * with arrows in the viewing direction and the section letter at both ends (A–A).
 * items: [{A: [x, y], B: [x, y], v: [dx, dy], z, half, letter, label}] in IFC coordinates.
 */
export class SectionMarks {
  constructor(viewer, container) {
    this.viewer = viewer;
    this.group = new THREE.Group();
    viewer.scene.add(this.group);
    this.layer = document.createElement('div');
    this.layer.className = 'measure-layer section-marks';
    container.append(this.layer);
    this.labels = [];
    viewer.renderHooks.push(() => this.#place());
  }

  set(items) {
    for (const o of [...this.group.children]) { this.group.remove(o); o.geometry?.dispose(); o.material?.dispose(); }
    for (const l of this.labels) l.el.remove();
    this.labels = [];
    const col = 0xc8372d;
    const W = (p, z) => this.viewer.fromIfc(p[0], p[1], z);
    for (const it of items) {
      const { A, B, v, z, half } = it;
      const arr = half * 0.28;
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([W(A, z), W(B, z)]), new THREE.LineDashedMaterial({ color: col, dashSize: half * 0.12, gapSize: half * 0.05, depthTest: false }));
      line.computeLineDistances();
      const tris = [], stubs = [];
      for (const E of [A, B]) {
        const st = [E[0] + v[0] * arr * 0.55, E[1] + v[1] * arr * 0.55];
        const tip = [E[0] + v[0] * arr, E[1] + v[1] * arr];
        const px = -v[1] * arr * 0.3, py = v[0] * arr * 0.3;
        stubs.push(W(E, z), W(st, z));
        tris.push(W(tip, z), W([st[0] + px, st[1] + py], z), W([st[0] - px, st[1] - py], z));
        const el = document.createElement('div');
        el.className = 'm-label section-mark';
        el.textContent = it.letter;
        el.title = it.label;
        this.layer.append(el);
        this.labels.push({ el, at: W([E[0] + v[0] * arr * 1.7, E[1] + v[1] * arr * 1.7], z) });
      }
      const stub = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(stubs), new THREE.LineBasicMaterial({ color: col, depthTest: false }));
      const head = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints(tris), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, depthTest: false }));
      for (const o of [line, stub, head]) { o.renderOrder = OVERLAY_ORDER + 26; o.frustumCulled = false; this.group.add(o); }
    }
    this.viewer.invalidate?.();
  }

  #place() {
    for (const l of this.labels) {
      const s = this.viewer.toScreen(l.at);
      if (!s) { l.el.style.display = 'none'; continue; }
      l.el.style.display = '';
      l.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%)`;
    }
  }
}
