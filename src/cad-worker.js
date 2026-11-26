// DWG / DXF drawings as a 2D base (#135), read with LibreDWG (GPL-3.0, compiled to WebAssembly,
// @mlightcad/libredwg-web) in a worker: the page stays responsive, and the 8 MB wasm is only fetched
// when a drawing is opened.
//
// Out: the model space as line segments per layer (Float64Array x, y, z pairs, in drawing units),
// texts, the layers with their colours and on/off state, the drawing's units and extent. Arcs,
// circles, ellipses, bulges and splines become polylines; blocks (INSERT, also of dimensions) are
// placed with their insertion point, scale and rotation, up to 8 levels deep.
import { LibreDwg, Dwg_File_Type, createModule } from '@mlightcad/libredwg-web';
// the package exports only its JavaScript: the wasm by its path (copied to the build with a hash)
import wasmUrl from '../node_modules/@mlightcad/libredwg-web/wasm/libredwg-web.wasm?url';

const MAX_SEGMENTS = 3_000_000;
const MAX_TEXTS = 5000;
const MAX_DEPTH = 8;

let lib = null;
async function libredwg() {
  if (!lib) lib = LibreDwg.createByWasmInstance(await createModule({ locateFile: () => wasmUrl }));
  return lib;
}

// AutoCAD colour index -> RGB: the first 9 and the greys exactly, the rest from the hue wheel
const ACI = { 1: 0xff0000, 2: 0xffff00, 3: 0x00ff00, 4: 0x00ffff, 5: 0x0000ff, 6: 0xff00ff, 7: 0xffffff, 8: 0x808080, 9: 0xc0c0c0 };
export function aciColor(i) {
  i = Math.abs(i | 0);
  if (ACI[i] !== undefined) return ACI[i];
  if (i >= 250 && i <= 255) { const g = Math.round(51 + (i - 250) * 40.8); return (g << 16) | (g << 8) | g; }
  if (i < 10 || i > 249) return 0xffffff;
  const hue = (Math.floor((i - 10) / 10) * 15) / 360, shade = (i % 10) >> 1, light = [0.5, 0.4, 0.3, 0.22, 0.15][shade] ?? 0.5;
  const sat = i % 2 ? 0.5 : 1;
  const f = (n) => { const k = (n + hue * 12) % 12, a = sat * Math.min(light, 1 - light); return Math.round(255 * (light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}

/**
 * The drawing as segments. db: the DwgDatabase of LibreDWG. Exported for the tests (Node).
 */
export function flatten(db) {
  const layerIdx = new Map(), layers = [];
  for (const l of db.tables?.LAYER?.entries || []) {
    if (layerIdx.has(l.name)) continue;
    layerIdx.set(l.name, layers.length);
    layers.push({ name: l.name, color: aciColor(l.colorIndex ?? 7), on: !(l.off || l.frozen || (l.colorIndex ?? 0) < 0), segs: [], n: 0, texts: 0 });
  }
  const layerOf = (name) => {
    if (!layerIdx.has(name)) { layerIdx.set(name, layers.length); layers.push({ name, color: 0xffffff, on: true, segs: [], n: 0, texts: 0 }); }
    return layers[layerIdx.get(name)];
  };
  const blocks = new Map();
  for (const b of db.tables?.BLOCK_RECORD?.entries || []) blocks.set(b.name, b);
  const texts = [];
  let total = 0, skipped = 0;
  const types = {};

  // a transform: x' = a x + b y + e, y' = c x + d y + f, z' = s z + g
  const I = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, s: 1, g: 0 };
  const mul = (T, U) => ({ // T after U
    a: T.a * U.a + T.b * U.c, b: T.a * U.b + T.b * U.d, c: T.c * U.a + T.d * U.c, d: T.c * U.b + T.d * U.d,
    e: T.a * U.e + T.b * U.f + T.e, f: T.c * U.e + T.d * U.f + T.f, s: T.s * U.s, g: T.s * U.g + T.g,
  });
  const P = (T, x, y, z = 0) => [T.a * x + T.b * y + T.e, T.c * x + T.d * y + T.f, T.s * (z || 0) + T.g];

  const seg = (L, p, q) => {
    if (total >= MAX_SEGMENTS) { skipped++; return; }
    if (![...p, ...q].every(Number.isFinite)) return;
    L.segs.push(p[0], p[1], p[2], q[0], q[1], q[2]);
    L.n++; total++;
  };
  const poly = (L, T, pts, closed = false) => {
    const w = pts.map((q) => P(T, q[0], q[1], q[2]));
    for (let i = 0; i + 1 < w.length; i++) seg(L, w[i], w[i + 1]);
    if (closed && w.length > 2) seg(L, w[w.length - 1], w[0]);
  };
  const arcPts = (cx, cy, z, r, a0, a1, ccw = true) => {
    let span = a1 - a0;
    if (ccw) { while (span <= 0) span += Math.PI * 2; } else { while (span >= 0) span -= Math.PI * 2; }
    const n = Math.max(4, Math.min(256, Math.ceil(Math.abs(span) / (Math.PI / 36))));
    const out = [];
    for (let i = 0; i <= n; i++) { const t = a0 + (span * i) / n; out.push([cx + r * Math.cos(t), cy + r * Math.sin(t), z]); }
    return out;
  };
  // a polyline with bulges (arcs between vertices)
  const bulgePts = (verts, closed, z = 0) => {
    const out = [];
    const n = verts.length;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = verts[i], b = verts[(i + 1) % n];
      const za = a.z ?? z, zb = b.z ?? z;
      if (!out.length) out.push([a.x, a.y, za]);
      const bu = a.bulge || 0;
      if (Math.abs(bu) > 1e-9) {
        const dx = b.x - a.x, dy = b.y - a.y, c = Math.hypot(dx, dy);
        if (c > 1e-12) {
          const th = 4 * Math.atan(bu), r = c / (2 * Math.sin(th / 2));
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, h = r * Math.cos(th / 2);
          const cx = mx - (h * dy) / c, cy = my + (h * dx) / c;
          const a0 = Math.atan2(a.y - cy, a.x - cx), a1 = a0 + th;
          const arc = arcPts(cx, cy, za, Math.abs(r), a0, a1, th > 0);
          for (let k = 1; k < arc.length; k++) out.push(arc[k]);
          out[out.length - 1] = [b.x, b.y, zb];
          continue;
        }
      }
      out.push([b.x, b.y, zb]);
    }
    if (n === 1) out.push([verts[0].x, verts[0].y, verts[0].z ?? z]);
    return out;
  };
  const text = (L, T, x, y, z, h, rot, s) => {
    if (!s || texts.length >= MAX_TEXTS) return;
    const [px, py, pz] = P(T, x, y, z);
    const sc = Math.hypot(T.a, T.c) || 1;
    const ang = Math.atan2(T.c, T.a) + (rot || 0);
    // MTEXT formatting codes out: \P (new line), {\fArial|b0;...}, \H2.5x; etc.
    const clean = String(s).replace(/\\P/g, '\n').replace(/\\[A-Za-z][^;\\{}]*;/g, '').replace(/[{}]/g, '').replace(/\\~/g, ' ').replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').slice(0, 300);
    if (!clean.trim()) return;
    texts.push({ layer: layerIdx.get(L.name), x: px, y: py, z: pz, h: (h || 1) * sc, rot: ang, s: clean });
    L.texts++;
  };

  const walk = (entities, T, depth, blockLayer) => {
    for (const e of entities || []) {
      if (e.isVisible === false) continue;
      types[e.type] = (types[e.type] || 0) + 1;
      // entities on layer 0 in a block take the layer of the block reference
      const L = layerOf(e.layer === '0' && blockLayer ? blockLayer : e.layer || '0');
      const z0 = e.elevation || 0;
      switch (e.type) {
        case 'LINE': seg(L, P(T, e.startPoint.x, e.startPoint.y, e.startPoint.z), P(T, e.endPoint.x, e.endPoint.y, e.endPoint.z)); break;
        case 'LWPOLYLINE': if (e.vertices?.length) poly(L, T, bulgePts(e.vertices, !!(e.flag & 1), z0)); break;
        case 'POLYLINE2D': case 'POLYLINE3D': case 'POLYLINE':
          if (e.vertices?.length) poly(L, T, bulgePts(e.vertices.filter((v) => !(v.flag & 16)), !!(e.flag & 1), z0)); break;
        case 'ARC': poly(L, T, arcPts(e.center.x, e.center.y, e.center.z || 0, e.radius, e.startAngle, e.endAngle)); break;
        case 'CIRCLE': poly(L, T, arcPts(e.center.x, e.center.y, e.center.z || 0, e.radius, 0, Math.PI * 2)); break;
        case 'ELLIPSE': {
          const mx = e.majorAxisEndPoint.x, my = e.majorAxisEndPoint.y, R = Math.hypot(mx, my), rr = R * e.axisRatio, rot = Math.atan2(my, mx);
          let a0 = e.startAngle || 0, a1 = e.endAngle ?? Math.PI * 2;
          while (a1 <= a0) a1 += Math.PI * 2;
          const n = Math.max(8, Math.ceil((a1 - a0) / (Math.PI / 36))), pts = [];
          for (let i = 0; i <= n; i++) {
            const t = a0 + ((a1 - a0) * i) / n, x = R * Math.cos(t), y = rr * Math.sin(t);
            pts.push([e.center.x + x * Math.cos(rot) - y * Math.sin(rot), e.center.y + x * Math.sin(rot) + y * Math.cos(rot), e.center.z || 0]);
          }
          poly(L, T, pts);
          break;
        }
        case 'SPLINE': {
          // through the fit points when there are, else along the control polygon (a coarse but safe shape)
          const pts = (e.fitPoints?.length > 1 ? e.fitPoints : e.controlPoints || []).map((q) => [q.x, q.y, q.z || 0]);
          if (pts.length > 1) poly(L, T, pts, !!(e.flag & 1));
          break;
        }
        case 'SOLID': case 'TRACE': {
          const c = [e.corner1, e.corner2, e.corner4 || e.corner3, e.corner3].filter(Boolean).map((q) => [q.x, q.y, q.z || z0]);
          poly(L, T, c, true);
          break;
        }
        case '3DFACE': poly(L, T, [e.corner1, e.corner2, e.corner3, e.corner4 || e.corner3].map((q) => [q.x, q.y, q.z || 0]), true); break;
        case 'POINT': { const q = e.position || e.point || e.location; if (q) { const d = 0.1; seg(L, P(T, q.x - d, q.y, q.z), P(T, q.x + d, q.y, q.z)); seg(L, P(T, q.x, q.y - d, q.z), P(T, q.x, q.y + d, q.z)); } break; }
        case 'TEXT': case 'ATTRIB': {
          const p = (e.halign || e.valign) && e.endPoint && (e.endPoint.x || e.endPoint.y) ? e.endPoint : e.startPoint;
          if (p) text(L, T, p.x, p.y, e.elevation || p.z || 0, e.textHeight, e.rotation, e.text);
          break;
        }
        case 'MTEXT': if (e.insertionPoint) text(L, T, e.insertionPoint.x, e.insertionPoint.y, e.insertionPoint.z || 0, e.textHeight, e.rotation || Math.atan2(e.direction?.y || 0, e.direction?.x || 1), e.text); break;
        case 'INSERT': case 'DIMENSION': {
          const b = blocks.get(e.name);
          if (!b || depth >= MAX_DEPTH) break;
          const ip = e.type === 'INSERT' ? e.insertionPoint : { x: 0, y: 0, z: 0 };
          const sx = e.xScale ?? 1, sy = e.yScale ?? 1, sz = e.zScale ?? 1, r = e.rotation || 0;
          const bp = b.basePoint || { x: 0, y: 0, z: 0 };
          const cols = Math.max(1, Math.min(100, e.columnCount || 1)), rows = Math.max(1, Math.min(100, e.rowCount || 1));
          for (let ci = 0; ci < cols; ci++) {
            for (let ri = 0; ri < rows; ri++) {
              const ox = ci * (e.columnSpacing || 0), oy = ri * (e.rowSpacing || 0);
              const cos = Math.cos(r), sin = Math.sin(r);
              // block -> insert: translate(-base), scale, rotate, translate(insertion + array offset)
              const B = { a: cos * sx, b: -sin * sy, c: sin * sx, d: cos * sy, e: 0, f: 0, s: sz, g: 0 };
              B.e = ip.x + cos * ox - sin * oy - (B.a * bp.x + B.b * bp.y);
              B.f = ip.y + sin * ox + cos * oy - (B.c * bp.x + B.d * bp.y);
              B.g = (ip.z || 0) - sz * (bp.z || 0);
              walk(b.entities, mul(T, B), depth + 1, e.layer === '0' ? blockLayer : e.layer);
            }
          }
          if (e.type === 'INSERT') for (const a of e.attribs || []) walk([a], T, depth + 1, blockLayer);
          break;
        }
        default: break; // HATCH, IMAGE, WIPEOUT, VIEWPORT, 3DSOLID …: not drawn
      }
    }
  };
  walk(db.entities, I, 0, null);

  const out = layers.filter((l) => l.n || l.texts).map((l) => ({ name: l.name, color: l.color, on: l.on, segs: Float64Array.from(l.segs), n: l.n, texts: l.texts }));
  // text layer indices to the kept layers
  const keep = new Map(out.map((l, i) => [layerIdx.get(l.name), i]));
  for (const tx of texts) tx.layer = keep.get(tx.layer) ?? 0;
  const ins = db.header?.INSUNITS;
  return { layers: out, texts, units: Number.isFinite(ins) ? ins : null, segments: total, skipped, types };
}

self.onmessage = async ({ data }) => {
  const { id, bytes, kind } = data;
  try {
    self.postMessage({ id, progress: 0.1 });
    const L = await libredwg();
    self.postMessage({ id, progress: 0.3 });
    const ptr = L.dwg_read_data(bytes, kind === 'dxf' ? Dwg_File_Type.DXF : Dwg_File_Type.DWG);
    if (!ptr) throw new Error('not a readable DWG/DXF file');
    let db;
    try { db = L.convert(ptr); } finally { try { L.dwg_free(ptr); } catch { /* ignore */ } }
    self.postMessage({ id, progress: 0.7 });
    const res = flatten(db);
    self.postMessage({ id, result: res }, res.layers.map((l) => l.segs.buffer));
  } catch (e) {
    self.postMessage({ id, error: String(e?.message || e) });
  }
};
