// Terrain (TIN) from a point cloud or a LandXML surface (#45), in a worker.
//
// Input (one message):
//   {cloud: {positions (Float32, local), classes (Uint8 or null), hidden: [class], toIfc: [16]
//            (column-major, local -> IFC metres)}, grid, maxEdge, source: 'ground'|'lowest', name, georef}
//   or {landxml: text, toIfc: [16] (map E N H -> IFC) or null, maxEdge, name, georef}
// Output: {done: {ifc: string, points, triangles, source, origin, min, max}} or {error}.
//
// Steps for a cloud: the ground points (class 2 when the file has it, else the shown points) are
// moved to IFC coordinates, thinned on a grid in plan (classified ground: the point nearest the
// middle of the cell; otherwise the lowest point of the cell, a simple ground filter), triangulated
// in plan with Delaunator, and triangles with an edge longer than maxEdge are dropped so there are
// holes where there is no data. The result is written as an IFC 4.3 file: an IfcGeographicElement
// (TERRAIN) with an IfcTriangulatedFaceSet, which Vispecta then opens like any model.
import Delaunator from 'delaunator';

self.onmessage = ({ data }) => {
  try {
    const res = data.landxml ? fromLandXml(data) : fromCloud(data);
    self.postMessage({ done: res });
  } catch (e) {
    self.postMessage({ error: e.message || String(e) });
  }
};

const progress = (f) => self.postMessage({ progress: f });

function fromCloud({ cloud, grid, maxEdge, source, name, georef }) {
  const P = cloud.positions, C = cloud.classes, n = P.length / 3;
  const hidden = new Set(cloud.hidden || []);
  const m = cloud.toIfc;
  const useGround = source === 'ground' && C && C.some((c) => c === 2);
  // the cell of every kept point: key -> index of the point that represents the cell
  const g = Math.max(0.05, grid);
  // origin: the first point, rounded, so the coordinates stay small in the file
  const ox = Math.round(m[0] * P[0] + m[4] * P[1] + m[8] * P[2] + m[12]);
  const oy = Math.round(m[1] * P[0] + m[5] * P[1] + m[9] * P[2] + m[13]);
  const cells = new Map();
  const X = new Float64Array(n), Y = new Float64Array(n), Z = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (i % 500000 === 0) progress(0.4 * (i / n));
    const c = C ? C[i] : 0;
    if (useGround ? c !== 2 : (hidden.has(c) || c === 7 || c === 18)) continue; // noise never
    const lx = P[i * 3], ly = P[i * 3 + 1], lz = P[i * 3 + 2];
    const x = m[0] * lx + m[4] * ly + m[8] * lz + m[12] - ox;
    const y = m[1] * lx + m[5] * ly + m[9] * lz + m[13] - oy;
    const z = m[2] * lx + m[6] * ly + m[10] * lz + m[14];
    X[i] = x; Y[i] = y; Z[i] = z;
    const ix = Math.floor(x / g), iy = Math.floor(y / g);
    const key = ix * 4194304 + iy; // 2^22: room for ±2000 km at 1 m cells
    const cur = cells.get(key);
    if (cur === undefined) { cells.set(key, i); continue; }
    if (useGround) {
      const cx = (ix + 0.5) * g, cy = (iy + 0.5) * g;
      if ((x - cx) ** 2 + (y - cy) ** 2 < (X[cur] - cx) ** 2 + (Y[cur] - cy) ** 2) cells.set(key, i);
    } else if (z < Z[cur]) cells.set(key, i);
  }
  const k = cells.size;
  if (k < 3) throw new Error('too few ground points');
  const xy = new Float64Array(k * 2), zs = new Float64Array(k);
  let j = 0;
  for (const i of cells.values()) { xy[j * 2] = X[i]; xy[j * 2 + 1] = Y[i]; zs[j] = Z[i]; j++; }
  progress(0.5);
  const d = new Delaunator(xy);
  progress(0.75);
  const tris = dropLong(d.triangles, xy, maxEdge);
  return write({ xy, zs, tris, ox, oy, name, georef, source: useGround ? 'ground' : 'lowest', grid: g, maxEdge, total: n });
}

/** Keeps the triangles whose edges are all at most maxEdge long (in plan). */
function dropLong(t, xy, maxEdge) {
  const m2 = maxEdge > 0 ? maxEdge * maxEdge : Infinity;
  const out = new Uint32Array(t.length);
  let o = 0;
  const d2 = (a, b) => (xy[a * 2] - xy[b * 2]) ** 2 + (xy[a * 2 + 1] - xy[b * 2 + 1]) ** 2;
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i], b = t[i + 1], c = t[i + 2];
    if (d2(a, b) > m2 || d2(b, c) > m2 || d2(c, a) > m2) continue;
    out[o++] = a; out[o++] = b; out[o++] = c;
  }
  return out.subarray(0, o);
}

/** A LandXML TIN surface (Pnts + Faces); points without faces are triangulated. */
function fromLandXml({ landxml, toIfc, maxEdge, name, georef }) {
  const surf = /<Surface\b[^>]*>([\s\S]*?)<\/Surface>/i.exec(landxml);
  if (!surf) throw new Error('no <Surface> in the LandXML file');
  const surfName = (/<Surface\b[^>]*\bname="([^"]*)"/i.exec(surf[0]) || [])[1] || '';
  const ids = new Map();
  const pts = [];
  const re = /<P\b[^>]*\bid="([^"]+)"[^>]*>([^<]+)<\/P>/gi;
  let mt;
  while ((mt = re.exec(surf[1]))) {
    const v = mt[2].trim().split(/[\s,]+/).map(Number);
    if (v.length < 3 || v.some((x) => !Number.isFinite(x))) continue;
    ids.set(mt[1], pts.length);
    pts.push(v); // LandXML: northing easting elevation
  }
  if (pts.length < 3) throw new Error('too few points in the LandXML surface');
  const m = toIfc;
  const map = (p) => {
    const [N, E, H] = p;
    if (!m) return [E, N, H];
    return [m[0] * E + m[4] * N + m[8] * H + m[12], m[1] * E + m[5] * N + m[9] * H + m[13], m[2] * E + m[6] * N + m[10] * H + m[14]];
  };
  const ifc = pts.map(map);
  const ox = Math.round(ifc[0][0]), oy = Math.round(ifc[0][1]);
  const xy = new Float64Array(ifc.length * 2), zs = new Float64Array(ifc.length);
  ifc.forEach((p, i) => { xy[i * 2] = p[0] - ox; xy[i * 2 + 1] = p[1] - oy; zs[i] = p[2]; });
  progress(0.4);
  const faces = [];
  const fre = /<F\b([^>]*)>([^<]+)<\/F>/gi;
  while ((mt = fre.exec(surf[1]))) {
    if (/\bi="1"/.test(mt[1])) continue; // invisible face (a hole)
    const v = mt[2].trim().split(/\s+/);
    if (v.length < 3) continue;
    const a = ids.get(v[0]), b = ids.get(v[1]), c = ids.get(v[2]);
    if (a === undefined || b === undefined || c === undefined) continue;
    faces.push(a, b, c);
  }
  const tris = faces.length ? Uint32Array.from(faces) : dropLong(new Delaunator(xy).triangles, xy, maxEdge);
  return write({ xy, zs, tris, ox, oy, name: name || surfName || 'Terrain', georef, source: faces.length ? 'landxml' : 'landxml-points', total: pts.length });
}

// ------------------------------------------------------------------ IFC writer
const B64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
function guid() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  let n = 0n;
  for (const x of b) n = (n << 8n) | BigInt(x);
  let s = '';
  for (let i = 0; i < 22; i++) { s = B64[Number(n & 63n)] + s; n >>= 6n; }
  return s;
}
const str = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/[^\x20-\x7e]/g, (c) => `\\X2\\${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}\\X0\\`)}'`;
const num = (x) => {
  if (!Number.isFinite(x)) return '0.';
  const s = String(Math.round(x * 1000) / 1000);
  return s.includes('.') || s.includes('e') ? s : `${s}.`;
};

const real = (x) => { const s = String(+x).replace(/^(-?\d+)(?=e)/, '$1.').replace('e', 'E'); return /[.E]/.test(s) ? s : `${s}.`; };

function write({ xy, zs, tris, ox, oy, name, georef, source, grid, maxEdge, total }) {
  // only the points that triangles use
  const used = new Int32Array(zs.length).fill(-1);
  let nv = 0;
  for (const i of tris) if (used[i] < 0) used[i] = nv++;
  if (!tris.length) throw new Error('no triangles (max edge too short?)');
  progress(0.85);
  const coords = new Array(nv);
  let zmin = Infinity, zmax = -Infinity, xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (let i = 0; i < zs.length; i++) {
    const v = used[i];
    if (v < 0) continue;
    const x = xy[i * 2], y = xy[i * 2 + 1], z = zs[i];
    coords[v] = `(${num(x)},${num(y)},${num(z)})`;
    if (z < zmin) zmin = z; if (z > zmax) zmax = z;
    if (x < xmin) xmin = x; if (x > xmax) xmax = x;
    if (y < ymin) ymin = y; if (y > ymax) ymax = y;
  }
  const idx = new Array(tris.length / 3);
  for (let i = 0; i < tris.length; i += 3) idx[i / 3] = `(${used[tris[i]] + 1},${used[tris[i + 1]] + 1},${used[tris[i + 2]] + 1})`;
  progress(0.95);
  const L = [];
  let id = 0;
  const e = (s) => { L.push(`#${++id}=${s};`); return `#${id}`; };
  const units = e(`IFCUNITASSIGNMENT((${e('IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)')},${e('IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)')},${e('IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)')},${e('IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)')}))`);
  const origin = e('IFCCARTESIANPOINT((0.,0.,0.))');
  const wcs = e(`IFCAXIS2PLACEMENT3D(${origin},$,$)`);
  const ctx = e(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${wcs},$)`);
  const body = e(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${ctx},$,.MODEL_VIEW.,$)`);
  const project = e(`IFCPROJECT(${str(guid())},$,${str(name)},${str('Terrain made with Vispecta')},$,$,$,(${ctx}),${units})`);
  const m = georef?.map;
  if (m) {
    const crs = e(`IFCPROJECTEDCRS(${str(m.crs || 'Map')},$,$,$,$,$,$)`);
    e(`IFCMAPCONVERSION(${ctx},${crs},${num(m.eastings * m.mapScale)},${num(m.northings * m.mapScale)},${num(m.height * m.mapScale)},${real(m.a)},${real(m.b)},${real(m.scale * m.mapScale)},$,$)`);
  }
  const sitePl = e(`IFCLOCALPLACEMENT($,${wcs})`);
  const site = e(`IFCSITE(${str(guid())},$,${str('Terrain')},$,$,${sitePl},$,$,.ELEMENT.,$,$,$,$,$)`);
  e(`IFCRELAGGREGATES(${str(guid())},$,$,$,${project},(${site}))`);
  // the terrain at the origin of its coordinates, so the numbers in the file stay small
  const elPl = e(`IFCLOCALPLACEMENT(${sitePl},${e(`IFCAXIS2PLACEMENT3D(${e(`IFCCARTESIANPOINT((${num(ox)},${num(oy)},0.))`)},$,$)`)})`);
  const pl = e(`IFCCARTESIANPOINTLIST3D((${coords.join(',')}),$)`);
  const fs = e(`IFCTRIANGULATEDFACESET(${pl},$,.F.,(${idx.join(',')}),$)`);
  const colour = e('IFCCOLOURRGB($,0.50,0.64,0.42)');
  const style = e(`IFCSURFACESTYLE('Terrain',.BOTH.,(${e(`IFCSURFACESTYLESHADING(${colour},0.)`)}))`);
  e(`IFCSTYLEDITEM(${fs},(${style}),$)`);
  const shape = e(`IFCPRODUCTDEFINITIONSHAPE($,$,(${e(`IFCSHAPEREPRESENTATION(${body},'Body','Tessellation',(${fs}))`)}))`);
  const el = e(`IFCGEOGRAPHICELEMENT(${str(guid())},$,${str(name)},${str('TIN')},$,${elPl},${shape},$,.TERRAIN.)`);
  e(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${str(guid())},$,$,$,(${el}),${site})`);
  const props = [
    ['Source', `IFCLABEL(${str(source)})`],
    ['Points', `IFCINTEGER(${nv})`],
    ['Triangles', `IFCINTEGER(${tris.length / 3})`],
    ['InputPoints', `IFCINTEGER(${total})`],
  ];
  if (grid) props.push(['GridSize', `IFCLENGTHMEASURE(${num(grid)})`]);
  if (maxEdge) props.push(['MaxEdgeLength', `IFCLENGTHMEASURE(${num(maxEdge)})`]);
  props.push(['MinElevation', `IFCLENGTHMEASURE(${num(zmin)})`], ['MaxElevation', `IFCLENGTHMEASURE(${num(zmax)})`]);
  const pv = props.map(([k, v]) => e(`IFCPROPERTYSINGLEVALUE(${str(k)},$,${v},$)`));
  const pset = e(`IFCPROPERTYSET(${str(guid())},$,'Vispecta_Terrain',$,(${pv.join(',')}))`);
  e(`IFCRELDEFINESBYPROPERTIES(${str(guid())},$,$,$,(${el}),${pset})`);
  const now = new Date().toISOString().slice(0, 19);
  const ifc = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [Reference]'),'2;1');
FILE_NAME(${str(`${name}.ifc`)},'${now}',(''),(''),'Vispecta','Vispecta','');
FILE_SCHEMA(('IFC4X3_ADD2'));
ENDSEC;
DATA;
${L.join('\n')}
ENDSEC;
END-ISO-10303-21;
`;
  progress(1);
  return { ifc, points: nv, triangles: tris.length / 3, source, origin: [ox, oy], min: [xmin + ox, ymin + oy, zmin], max: [xmax + ox, ymax + oy, zmax] };
}
