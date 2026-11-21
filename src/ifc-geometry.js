// The geometry of an IFC model, merged by colour (#58): used in the IFC worker (ifc-worker.js), and
// on the main thread as a fallback where a worker cannot be used.
//
// Every product's meshes are transformed into the model's coordinates and appended to the bucket
// of their colour, so a model draws in a few draw calls; each bucket lists the index ranges of its
// elements (items), so they can be shown, hidden and picked one by one.
//
// Long models (a corridor of kilometres) are also split in plan into cells (#60): a bucket per colour
// and cell, each with its own bounding box, so three.js skips what is out of view. Elements stay
// whole (by the centre of their box), and cells with few triangles of a colour are put together
// again, so the number of draw calls stays small.
import * as WebIFC from 'web-ifc';

/** expressIDs of all objects that can have geometry (same set as StreamAllMeshes, without spaces). */
const GEOMETRY_TYPES = ['IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCFACILITY', 'IFCFACILITYPART', 'IFCBRIDGE', 'IFCROAD', 'IFCRAILWAY',
  'IFCMARINEFACILITY', 'IFCANNOTATION', 'IFCGRID', 'IFCPROXY', 'IFCSPATIALZONE', 'IFCGEOGRAPHICELEMENT', 'IFCALIGNMENT',
  'IFCLINEARPOSITIONINGELEMENT', 'IFCREFERENT', 'IFCEXTERNALSPATIALELEMENT'];

export const OPEN_SETTINGS = { COORDINATE_TO_ORIGIN: true, CIRCLE_SEGMENTS: 16, MEMORY_LIMIT: 3.5 * 1024 ** 3 };

function listProductIds(api, modelID) {
  const skip = new Set([WebIFC.IFCOPENINGELEMENT, WebIFC.IFCOPENINGSTANDARDCASE, WebIFC.IFCSPACE].filter(Boolean));
  const ids = [];
  for (const ty of api.GetIfcEntityList(modelID)) {
    if (skip.has(ty)) continue;
    if (!api.IsIfcElement(ty) && !GEOMETRY_TYPES.includes(String(api.GetNameFromTypeCode(ty)).toUpperCase())) continue;
    const v = api.GetLineIDsWithType(modelID, ty, false);
    for (let i = 0; i < v.size(); i++) ids.push(v.get(i));
  }
  return ids;
}

/**
 * StreamMeshes for a list of expressIDs. The browser build of web-ifc 0.0.78 binds the
 * function with 3 arguments while the JS wrapper passes 4, so fall back to the direct call.
 */
let streamArgs = 4;
function streamMeshes(api, modelID, ids, cb) {
  if (streamArgs === 4) {
    try { api.StreamMeshes(modelID, ids, cb); return; } catch (e) {
      if (!/arguments/i.test(String(e?.message || e))) throw e;
      streamArgs = 3;
    }
  }
  api.wasmModule.StreamMeshes(modelID, ids, cb);
}

// cells: none below CHUNK_MIN_EXTENT m, at most CHUNK_MAX_CELLS along the longest side, about CHUNK_CELL m
const CHUNK_MIN_EXTENT = 400, CHUNK_CELL = 250, CHUNK_MAX_CELLS = 16;
// a colour's cells with fewer triangles than this are put together again (not worth a draw call)
const CHUNK_MIN_TRIS = 1500;

/** The cell of a centre (x, z), or 0 for a model too small to split. Exported for the tests. */
export function cellGrid(pieces) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const p of pieces) {
    if (!Number.isFinite(p.cx)) continue;
    if (p.cx < x0) x0 = p.cx; if (p.cx > x1) x1 = p.cx; if (p.cz < z0) z0 = p.cz; if (p.cz > z1) z1 = p.cz;
  }
  const L = Math.max(x1 - x0, z1 - z0);
  if (!(L >= CHUNK_MIN_EXTENT)) return () => 0;
  const size = L / Math.min(CHUNK_MAX_CELLS, Math.ceil(L / CHUNK_CELL));
  const nx = Math.floor((x1 - x0) / size) + 1;
  return (cx, cz) => (Number.isFinite(cx) ? Math.floor((cz - z0) / size) * nx + Math.floor((cx - x0) / size) + 1 : 0);
}

/** Pieces -> buckets by colour and cell, small cells of a colour together again. */
function mergePieces(pieces, colors) {
  const cellOf = cellGrid(pieces);
  const groups = new Map(); // colour key -> Map(cell -> {pieces, tris})
  for (const p of pieces) {
    let g = groups.get(p.key);
    if (!g) groups.set(p.key, (g = new Map()));
    const cell = cellOf(p.cx, p.cz);
    let c = g.get(cell);
    if (!c) g.set(cell, (c = { list: [], tris: 0 }));
    c.list.push(p); c.tris += p.idx.length / 3;
  }
  const out = [];
  for (const [key, cells] of groups) {
    const { color, opacity } = colors.get(key);
    const rest = [];
    for (const c of cells.values()) {
      if (c.tris < CHUNK_MIN_TRIS && cells.size > 1) rest.push(...c.list);
      else out.push(bucketOf(color, opacity, c.list));
    }
    if (rest.length) out.push(bucketOf(color, opacity, rest));
  }
  return out;
}

/** One bucket from pieces: arrays put together, indices moved, index ranges per element. */
function bucketOf(color, opacity, list) {
  let nv = 0, ni = 0;
  for (const p of list) { nv += p.vc; ni += p.idx.length; }
  const positions = new Float32Array(nv * 3), normals = new Int8Array(nv * 3), index = new Uint32Array(ni);
  const items = [];
  let v = 0, i = 0;
  for (const p of list) {
    positions.set(p.pos, v * 3);
    normals.set(p.nor, v * 3);
    for (let k = 0; k < p.idx.length; k++) index[i + k] = p.idx[k] + v;
    const last = items[items.length - 1];
    if (last && last.id === p.id && last.start + last.count === i) last.count += p.idx.length;
    else items.push({ id: p.id, start: i, count: p.idx.length });
    v += p.vc; i += p.idx.length;
    p.pos = p.nor = p.idx = null; // free as we go
  }
  return { color, opacity, positions, normals, index, items };
}

/**
 * Reads and merges the geometry of an open model. progress(done, total) after each batch of
 * products; pause() is awaited between batches (the main thread lets the page breathe there).
 * Returns { buckets: [{color: [r, g, b], opacity, positions, normals, index, items}], spaceIds: [ids],
 * coordMatrix: [16] }.
 */
export async function buildGeometry(api, modelID, { progress = () => {}, pause = async () => {} } = {}) {
  const spaceIds = new Set();
  // Many elements share the same geometry (type geometry / mapped items): read it once.
  const geomCache = new Map();
  let cacheBytes = 0;
  const CACHE_BUDGET = 192 * 1024 * 1024;
  const readGeometry = (gid) => {
    let g = geomCache.get(gid);
    if (!g) {
      const geom = api.GetGeometry(modelID, gid);
      // GetVertexArray/GetIndexArray already return copies (web-ifc 0.0.78: heap.subarray(...).slice(0))
      g = {
        verts: api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize()),
        idx: api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize()),
      };
      geom.delete();
      // keep small geometries (bolts, sleepers, windows …) which are usually repeated; within a budget
      const bytes = g.verts.byteLength + g.idx.byteLength;
      if (bytes < 512 * 1024 && cacheBytes + bytes < CACHE_BUDGET) { geomCache.set(gid, g); cacheBytes += bytes; }
    }
    return g;
  };

  // pieces of geometry, grouped into buckets at the end (when the model's extent is known)
  const pieces = [];
  const colors = new Map(); // colour key -> {color, opacity}
  const onMesh = (flatMesh, prefix) => {
    const expressID = flatMesh.expressID;
    if (prefix) spaceIds.add(expressID);
    const n = flatMesh.geometries.size();
    const mine = [];
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < n; i++) {
      const pg = flatMesh.geometries.get(i);
      const { verts, idx } = readGeometry(pg.geometryExpressID);
      if (verts.length === 0 || idx.length === 0) continue;

      const c = pg.color;
      const key = `${prefix}${c.x.toFixed(3)}_${c.y.toFixed(3)}_${c.z.toFixed(3)}_${c.w.toFixed(3)}`;
      // Spaces (IfcSpace) are semi-transparent so they don't hide the building.
      if (!colors.has(key)) colors.set(key, { color: [c.x, c.y, c.z], opacity: prefix ? Math.min(c.w, 0.25) : c.w });

      // Transform positions and normals (column-major 4×4 matrix; normals with the inverse transpose)
      const m = pg.flatTransformation;
      const m0 = m[0], m1 = m[1], m2 = m[2], m4 = m[4], m5 = m[5], m6 = m[6], m8 = m[8], m9 = m[9], m10 = m[10], m12 = m[12], m13 = m[13], m14 = m[14];
      // inverse transpose of the 3×3 part
      const det = m0 * (m5 * m10 - m9 * m6) - m4 * (m1 * m10 - m9 * m2) + m8 * (m1 * m6 - m5 * m2) || 1;
      const n0 = (m5 * m10 - m9 * m6) / det, n1 = (m9 * m2 - m1 * m10) / det, n2 = (m1 * m6 - m5 * m2) / det;
      const n3 = (m8 * m6 - m4 * m10) / det, n4 = (m0 * m10 - m8 * m2) / det, n5 = (m4 * m2 - m0 * m6) / det;
      const n6 = (m4 * m9 - m8 * m5) / det, n7 = (m8 * m1 - m0 * m9) / det, n8 = (m0 * m5 - m4 * m1) / det;
      const vc = verts.length / 6;
      const pos = new Float32Array(vc * 3);
      const nor = new Int8Array(vc * 3); // normalized normals: 3 bytes per vertex instead of 12
      for (let k = 0, o = 0, q = 0; k < vc; k++, o += 6, q += 3) {
        const x = verts[o], y = verts[o + 1], z = verts[o + 2];
        const px = m0 * x + m4 * y + m8 * z + m12, pz = m2 * x + m6 * y + m10 * z + m14;
        pos[q] = px;
        pos[q + 1] = m1 * x + m5 * y + m9 * z + m13;
        pos[q + 2] = pz;
        if (px < x0) x0 = px; if (px > x1) x1 = px; if (pz < z0) z0 = pz; if (pz > z1) z1 = pz;
        const a = verts[o + 3], bb = verts[o + 4], cc = verts[o + 5];
        const nx = n0 * a + n1 * bb + n2 * cc, ny = n3 * a + n4 * bb + n5 * cc, nz = n6 * a + n7 * bb + n8 * cc;
        const l = Math.hypot(nx, ny, nz) || 1;
        nor[q] = Math.round((nx / l) * 127); nor[q + 1] = Math.round((ny / l) * 127); nor[q + 2] = Math.round((nz / l) * 127);
      }
      // the index is only read when the buckets are put together: geometry used by many elements shares it
      mine.push({ key, id: expressID, pos, nor, idx, vc });
    }
    // the element's centre in plan (three.js: x and z) decides its cell
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    for (const pc of mine) { pc.cx = cx; pc.cz = cz; pieces.push(pc); }
  };

  // Stream geometry in batches so the progress can be reported during large models.
  const productIds = listProductIds(api, modelID);
  const BATCH = 1500;
  for (let s0 = 0; s0 < productIds.length; s0 += BATCH) {
    streamMeshes(api, modelID, productIds.slice(s0, s0 + BATCH), (fm) => onMesh(fm, ''));
    progress(Math.min(s0 + BATCH, productIds.length), productIds.length);
    await pause();
  }
  // Spaces are streamed separately (hidden by default).
  try {
    api.StreamAllMeshesWithTypes(modelID, [WebIFC.IFCSPACE], (fm) => onMesh(fm, 'space_'));
  } catch (e) {
    console.warn('Could not read space geometry', e);
  }
  geomCache.clear();
  await pause();

  const merged = mergePieces(pieces, colors);
  pieces.length = 0;
  return { buckets: merged, spaceIds: [...spaceIds], coordMatrix: [...api.GetCoordinationMatrix(modelID)] };
}
