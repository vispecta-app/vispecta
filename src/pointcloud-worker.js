// Point cloud reader (#27): LAS, LAZ, XYZ/CSV/TXT/PTS and PLY, read locally in a worker and thinned
// to a point budget while reading.
//
// Thinning: a voxel grid (one point per cell) whose cell size is chosen from the extent and the
// budget, so the cloud keeps an even density; if a dense cloud still has more cells than the
// budget, the kept points are replaced at random (reservoir sampling), so the result stays even.
// Coordinates are kept relative to an origin (the first point, in double precision), so large
// map coordinates (UTM / DKS) don't lose precision in the Float32 arrays.
//
// Message in: { file, budget }. Messages out: { progress }, { done: result } or { error }.
import createLazPerf from 'laz-perf/lib/worker/laz-perf.js';
import lazWasm from 'laz-perf/lib/worker/laz-perf.wasm?url';

self.onmessage = async ({ data }) => {
  try {
    const result = await read(data.file, data.budget || 5e6);
    const t = [result.positions.buffer];
    for (const k of ['colors', 'intensity', 'classes']) if (result[k]) t.push(result[k].buffer);
    self.postMessage({ done: result }, t);
  } catch (e) {
    self.postMessage({ error: e.message || String(e) });
  }
};

const progress = (f) => self.postMessage({ progress: f });

async function read(file, budget) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.las') || name.endsWith('.laz')) return readLas(file, budget);
  if (name.endsWith('.ply')) return readPly(file, budget);
  return readText(file, budget);
}

// ------------------------------------------------------------------ thinning
class Sink {
  /** total: expected number of points (or 0 if unknown); bounds: [minX, minY, minZ, maxX, maxY, maxZ] or null */
  constructor(budget, total, bounds, { rgb = false, intensity = false, classes = false } = {}) {
    this.budget = Math.max(1000, Math.floor(budget));
    this.total = total;
    this.seen = 0;
    this.n = 0;
    this.pos = new Float32Array(this.budget * 3);
    this.rgb = rgb ? new Uint8Array(this.budget * 3) : null;
    this.int = intensity ? new Uint16Array(this.budget) : null;
    this.cls = classes ? new Uint8Array(this.budget) : null;
    this.origin = null;
    this.min = [Infinity, Infinity, Infinity];
    this.max = [-Infinity, -Infinity, -Infinity];
    this.rgbMax = 0;
    // voxel grid only when thinning is needed
    this.cell = 0;
    if (total > this.budget && bounds) {
      const [x0, y0, z0, x1, y1] = bounds;
      const area = Math.max((x1 - x0) * (y1 - y0), 1e-6);
      // a survey is mostly a surface: cells ≈ area / cell², a bit finer to fill the budget
      this.cell = Math.sqrt(area / this.budget) * 0.85;
      if (!(this.cell > 0)) this.cell = 0;
      this.gx0 = x0; this.gy0 = y0; this.gz0 = z0;
      this.nx = Math.ceil((x1 - x0) / this.cell) + 1;
      this.ny = Math.ceil((y1 - y0) / this.cell) + 1;
      let cap = 1; while (cap < this.budget * 4) cap *= 2;
      this.keys = new Float64Array(cap).fill(-1);
      this.mask = cap - 1;
    }
    this.random = mulberry32(12345);
  }

  /** Returns the slot to write the point to, or -1 to skip it. */
  add(x, y, z) {
    this.seen++;
    if (this.cell) {
      // cells outside the estimated extent (text/PLY: estimated from a sample) are clamped to its edge
      const ix = Math.min(this.nx - 1, Math.max(0, Math.floor((x - this.gx0) / this.cell)));
      const iy = Math.min(this.ny - 1, Math.max(0, Math.floor((y - this.gy0) / this.cell)));
      const iz = Math.max(0, Math.floor((z - this.gz0) / this.cell));
      const key = ix + iy * this.nx + iz * this.nx * this.ny;
      let h = hash(key) & this.mask;
      for (;;) {
        const k = this.keys[h];
        if (k === key) return -1; // the cell already has a point
        if (k === -1) { this.keys[h] = key; break; }
        h = (h + 1) & this.mask;
      }
    }
    let slot;
    if (this.n < this.budget) slot = this.n++;
    else {
      // reservoir: keep the budget, chosen evenly from everything that passed the grid
      this.cellsSeen = (this.cellsSeen || this.budget) + 1;
      const r = Math.floor(this.random() * this.cellsSeen);
      if (r >= this.budget) return -1;
      slot = r;
    }
    if (!this.origin) this.origin = [x, y, z];
    const o = this.origin;
    this.pos[slot * 3] = x - o[0]; this.pos[slot * 3 + 1] = y - o[1]; this.pos[slot * 3 + 2] = z - o[2];
    if (x < this.min[0]) this.min[0] = x; if (y < this.min[1]) this.min[1] = y; if (z < this.min[2]) this.min[2] = z;
    if (x > this.max[0]) this.max[0] = x; if (y > this.max[1]) this.max[1] = y; if (z > this.max[2]) this.max[2] = z;
    return slot;
  }

  /**
   * Puts the kept points in random order (Fisher–Yates over all attributes), so the first k points
   * are an even sample of the whole cloud: the viewer can then draw fewer points while the camera
   * moves, or at a lower density, just by drawing the first k.
   */
  shuffle() {
    const n = this.n, P = this.pos, C = this.rgb, I = this.int, K = this.cls;
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      for (let k = 0; k < 3; k++) { const t = P[i * 3 + k]; P[i * 3 + k] = P[j * 3 + k]; P[j * 3 + k] = t; }
      if (C) for (let k = 0; k < 3; k++) { const t = C[i * 3 + k]; C[i * 3 + k] = C[j * 3 + k]; C[j * 3 + k] = t; }
      if (I) { const t = I[i]; I[i] = I[j]; I[j] = t; }
      if (K) { const t = K[i]; K[i] = K[j]; K[j] = t; }
    }
  }

  result(format) {
    this.shuffle();
    const n = this.n;
    const out = {
      format,
      total: this.seen,
      count: n,
      origin: this.origin || [0, 0, 0],
      min: this.min, max: this.max,
      positions: this.pos.slice(0, n * 3),
      colors: null, intensity: null, classes: null,
    };
    if (this.rgb && this.rgbMax > 0) out.colors = this.rgb.slice(0, n * 3);
    if (this.int) out.intensity = this.int.slice(0, n);
    if (this.cls) out.classes = this.cls.slice(0, n);
    return out;
  }
}

function hash(k) {
  // mix a (possibly large) integer into 32 bits
  const lo = k % 4294967296, hi = Math.floor(k / 4294967296);
  let h = Math.imul(lo ^ (lo >>> 16), 0x45d9f3b) ^ Math.imul(hi + 0x9e3779b9, 0x119de1f3);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return h >>> 0;
}

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ------------------------------------------------------------------ LAS / LAZ
const RGB_AT = { 2: 20, 3: 28, 5: 28, 7: 30, 8: 30, 10: 30 };

function lasHeader(buf) {
  const v = new DataView(buf);
  const sig = String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3));
  if (sig !== 'LASF') throw new Error('Not a LAS/LAZ file');
  const major = v.getUint8(24), minor = v.getUint8(25);
  const offset = v.getUint32(96, true);
  const fmtRaw = v.getUint8(104);
  const compressed = (fmtRaw & 0x80) !== 0 || (fmtRaw & 0x40) !== 0;
  const fmt = fmtRaw & 0x3f;
  const recLen = v.getUint16(105, true);
  let count = v.getUint32(107, true);
  if (major === 1 && minor >= 4 && v.byteLength >= 255) {
    const c64 = Number(v.getBigUint64(247, true));
    if (c64 > 0) count = c64;
  }
  const f = (o) => v.getFloat64(o, true);
  return {
    major, minor, offset, fmt, recLen, count, compressed,
    scale: [f(131), f(139), f(147)], off: [f(155), f(163), f(171)],
    bounds: [f(187), f(203), f(219), f(179), f(195), f(211)], // min x y z, max x y z
  };
}

/** Reads one point record (DataView at byte o) into the sink. */
function lasPoint(sink, h, v, o) {
  const x = v.getInt32(o, true) * h.scale[0] + h.off[0];
  const y = v.getInt32(o + 4, true) * h.scale[1] + h.off[1];
  const z = v.getInt32(o + 8, true) * h.scale[2] + h.off[2];
  const s = sink.add(x, y, z);
  if (s < 0) return;
  if (sink.int) sink.int[s] = v.getUint16(o + 12, true);
  if (sink.cls) sink.cls[s] = h.fmt >= 6 ? v.getUint8(o + 16) : v.getUint8(o + 15) & 31;
  if (sink.rgb) {
    const r = v.getUint16(o + h.rgbAt, true), g = v.getUint16(o + h.rgbAt + 2, true), b = v.getUint16(o + h.rgbAt + 4, true);
    const m = Math.max(r, g, b);
    if (m > sink.rgbMax) sink.rgbMax = m;
    sink.rgb[s * 3] = r; sink.rgb[s * 3 + 1] = g; sink.rgb[s * 3 + 2] = b; // scaled below
  }
}

async function readLas(file, budget) {
  const head = await file.slice(0, 375).arrayBuffer();
  const h = lasHeader(head);
  h.rgbAt = RGB_AT[h.fmt];
  const raw16 = h.rgbAt !== undefined;
  // colours are 16 bit in LAS: collect them as 16 bit first, scale to 8 bit at the end
  const sink = new Sink(budget, h.count, h.bounds, { intensity: true, classes: true });
  if (raw16) sink.rgb = new Uint16Array(sink.budget * 3);
  const lowerName = file.name.toLowerCase();
  if (h.compressed || lowerName.endsWith('.laz')) await readLaz(file, h, sink);
  else {
    const CHUNK = Math.max(1, Math.floor((32 << 20) / h.recLen)); // points per chunk (~32 MB)
    for (let i = 0; i < h.count; i += CHUNK) {
      const n = Math.min(CHUNK, h.count - i);
      const buf = await file.slice(h.offset + i * h.recLen, h.offset + (i + n) * h.recLen).arrayBuffer();
      const v = new DataView(buf);
      for (let k = 0; k < n; k++) lasPoint(sink, h, v, k * h.recLen);
      progress((i + n) / h.count);
    }
  }
  const out = sink.result(h.compressed ? 'LAZ' : 'LAS');
  if (raw16 && sink.rgbMax > 0) {
    const src = sink.rgb, k = sink.rgbMax > 255 ? 1 / 257 : 1, c = new Uint8Array(out.count * 3);
    for (let i = 0; i < c.length; i++) c[i] = Math.min(255, Math.round(src[i] * k));
    out.colors = c;
  }
  out.version = `${h.major}.${h.minor}`;
  out.pointFormat = h.fmt;
  return out;
}

async function readLaz(file, h, sink) {
  const laz = await createLazPerf({ locateFile: (p) => (p.endsWith('.wasm') ? lazWasm : p) });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const filePtr = laz._malloc(bytes.byteLength);
  laz.HEAPU8.set(bytes, filePtr);
  const reader = new laz.LASZip();
  try {
    reader.open(filePtr, bytes.byteLength);
    const count = reader.getCount(), len = reader.getPointLength();
    const ptPtr = laz._malloc(len);
    const step = Math.max(1, Math.floor(count / 100));
    // one view on the point buffer for all points (a new DataView per point is slow); made again
    // only if the WASM memory grows and its buffer changes
    let buf = laz.HEAPU8.buffer, v = new DataView(buf, ptPtr, len);
    for (let i = 0; i < count; i++) {
      reader.getPoint(ptPtr);
      if (laz.HEAPU8.buffer !== buf) { buf = laz.HEAPU8.buffer; v = new DataView(buf, ptPtr, len); }
      lasPoint(sink, h, v, 0);
      if (i % step === 0) progress(i / count);
    }
    laz._free(ptPtr);
  } finally {
    reader.delete();
    laz._free(filePtr);
  }
}

// ------------------------------------------------------------------ text: XYZ / CSV / TXT / PTS
async function readText(file, budget) {
  // first pass is skipped: the extent is unknown, so the grid is built from the first megabytes
  const firstBytes = await file.slice(0, 4 << 20).text();
  const probe = parseLines(firstBytes.split(/\r?\n/).slice(0, 20000));
  if (!probe.rows.length) throw new Error('No point coordinates found in the file');
  const cols = probe.cols;
  const estTotal = Math.round(probe.rows.length * (file.size / Math.max(1, firstBytes.length)));
  const b = boundsOf(probe.rows);
  // widen the sampled extent a little, the rest of the file may reach further
  const pad = [(b[3] - b[0]) * 0.5 + 1, (b[4] - b[1]) * 0.5 + 1, (b[5] - b[2]) * 0.5 + 1];
  const bounds = [b[0] - pad[0], b[1] - pad[1], b[2] - pad[2], b[3] + pad[0], b[4] + pad[1], b[5] + pad[2]];
  const sink = new Sink(budget, estTotal, bounds, { rgb: cols.rgb >= 0, intensity: cols.intensity >= 0 });
  const CHUNK = 16 << 20;
  let rest = '';
  for (let off = 0; off < file.size; off += CHUNK) {
    const text = rest + (await file.slice(off, off + CHUNK).text());
    const lines = text.split(/\r?\n/);
    rest = off + CHUNK < file.size ? lines.pop() : '';
    for (const line of lines) addTextRow(sink, line, cols);
    progress(Math.min(1, (off + CHUNK) / file.size));
  }
  if (rest) addTextRow(sink, rest, cols);
  return sink.result(file.name.split('.').pop().toUpperCase());
}

const SPLIT = /[\s,;]+/;
function parseLines(lines) {
  const rows = [];
  let n = 0;
  for (const line of lines) {
    const p = line.trim().split(SPLIT).map(Number);
    if (p.length < 3 || p.slice(0, 3).some((x) => !Number.isFinite(x))) continue;
    if (p.length === 1) continue;
    rows.push(p); n = Math.max(n, p.length);
  }
  // columns: x y z | x y z i | x y z r g b | x y z i r g b (PTS)
  const cols = { intensity: -1, rgb: -1 };
  if (n >= 7) { cols.intensity = 3; cols.rgb = 4; } else if (n >= 6) cols.rgb = 3; else if (n === 4) cols.intensity = 3;
  return { rows, cols };
}

function addTextRow(sink, line, cols) {
  if (!line) return;
  const p = line.trim().split(SPLIT);
  if (p.length < 3) return;
  const x = +p[0], y = +p[1], z = +p[2];
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
  const s = sink.add(x, y, z);
  if (s < 0) return;
  if (sink.int && cols.intensity >= 0) sink.int[s] = Math.max(0, Math.min(65535, +p[cols.intensity] || 0));
  if (sink.rgb && cols.rgb >= 0) {
    for (let k = 0; k < 3; k++) { const c = Math.max(0, Math.min(255, +p[cols.rgb + k] || 0)); sink.rgb[s * 3 + k] = c; if (c > sink.rgbMax) sink.rgbMax = c; }
  }
}

function boundsOf(rows) {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const r of rows) for (let k = 0; k < 3; k++) { if (r[k] < b[k]) b[k] = r[k]; if (r[k] > b[k + 3]) b[k + 3] = r[k]; }
  return b;
}

// ------------------------------------------------------------------ PLY
async function readPly(file, budget) {
  const headText = await file.slice(0, 64 << 10).text();
  const end = headText.indexOf('end_header');
  if (!headText.startsWith('ply') || end < 0) throw new Error('Not a PLY file');
  const headerLen = new TextEncoder().encode(headText.slice(0, end + 'end_header'.length)).length + (headText[end + 10] === '\r' ? 2 : 1);
  const lines = headText.slice(0, end).split(/\r?\n/);
  const format = (lines.find((l) => l.startsWith('format')) || '').split(/\s+/)[1];
  let count = 0, props = [], inVertex = false;
  for (const l of lines) {
    const p = l.trim().split(/\s+/);
    if (p[0] === 'element') { inVertex = p[1] === 'vertex'; if (inVertex) count = +p[2]; }
    else if (p[0] === 'property' && inVertex) props.push({ type: p[1], name: p[2] });
  }
  const idx = (names) => props.findIndex((q) => names.includes(q.name));
  const ix = idx(['x']), iy = idx(['y']), iz = idx(['z']);
  if (ix < 0 || iy < 0 || iz < 0) throw new Error('PLY without x/y/z');
  const ir = idx(['red', 'r']), ig = idx(['green', 'g']), ib = idx(['blue', 'b']);
  const ii = idx(['intensity', 'scalar_intensity', 'scalar_Intensity']);
  const ic = idx(['classification', 'class', 'scalar_classification', 'scalar_Classification']);
  if (format === 'ascii') {
    const text = (await file.text()).slice(headerLen);
    const rows = text.split(/\r?\n/).slice(0, count).map((l) => l.trim().split(/\s+/).map(Number));
    const b = boundsOf(rows.map((r) => [r[ix], r[iy], r[iz]]));
    const sink = new Sink(budget, count, b, { rgb: ir >= 0, intensity: ii >= 0, classes: ic >= 0 });
    for (const r of rows) {
      const s = sink.add(r[ix], r[iy], r[iz]); if (s < 0) continue;
      if (sink.rgb) for (const [k, j] of [[0, ir], [1, ig], [2, ib]]) { const c = r[j] || 0; sink.rgb[s * 3 + k] = c; if (c > sink.rgbMax) sink.rgbMax = c; }
      if (sink.int) sink.int[s] = r[ii] || 0;
      if (sink.cls) sink.cls[s] = r[ic] || 0;
    }
    return sink.result('PLY');
  }
  if (format !== 'binary_little_endian') throw new Error(`PLY format "${format}" is not supported`);
  const SIZE = { char: 1, uchar: 1, int8: 1, uint8: 1, short: 2, ushort: 2, int16: 2, uint16: 2, int: 4, uint: 4, int32: 4, uint32: 4, float: 4, float32: 4, double: 8, float64: 8 };
  const READ = {
    char: 'getInt8', int8: 'getInt8', uchar: 'getUint8', uint8: 'getUint8', short: 'getInt16', int16: 'getInt16', ushort: 'getUint16', uint16: 'getUint16',
    int: 'getInt32', int32: 'getInt32', uint: 'getUint32', uint32: 'getUint32', float: 'getFloat32', float32: 'getFloat32', double: 'getFloat64', float64: 'getFloat64',
  };
  let stride = 0;
  const offs = props.map((q) => { const o = stride; stride += SIZE[q.type] || 4; return o; });
  const get = (v, o, j) => v[READ[props[j].type]](o + offs[j], true);
  // the extent: a quick sample of the file
  const sampleN = Math.min(count, 20000);
  const sv = new DataView(await file.slice(headerLen, headerLen + sampleN * stride).arrayBuffer());
  const rows = [];
  for (let k = 0; k < sampleN; k++) rows.push([get(sv, k * stride, ix), get(sv, k * stride, iy), get(sv, k * stride, iz)]);
  const b = boundsOf(rows), pad = [(b[3] - b[0]) * 0.5 + 1, (b[4] - b[1]) * 0.5 + 1, (b[5] - b[2]) * 0.5 + 1];
  const sink = new Sink(budget, count, [b[0] - pad[0], b[1] - pad[1], b[2] - pad[2], b[3] + pad[0], b[4] + pad[1], b[5] + pad[2]], { rgb: ir >= 0, intensity: ii >= 0, classes: ic >= 0 });
  const CHUNK = Math.max(1, Math.floor((32 << 20) / stride));
  for (let i = 0; i < count; i += CHUNK) {
    const n = Math.min(CHUNK, count - i);
    const v = new DataView(await file.slice(headerLen + i * stride, headerLen + (i + n) * stride).arrayBuffer());
    for (let k = 0; k < n; k++) {
      const o = k * stride;
      const s = sink.add(get(v, o, ix), get(v, o, iy), get(v, o, iz)); if (s < 0) continue;
      if (sink.rgb) for (const [c, j] of [[0, ir], [1, ig], [2, ib]]) { let val = get(v, o, j); if (props[j].type.startsWith('float')) val *= 255; sink.rgb[s * 3 + c] = val; if (val > sink.rgbMax) sink.rgbMax = val; }
      if (sink.int) sink.int[s] = get(v, o, ii);
      if (sink.cls) sink.cls[s] = get(v, o, ic);
    }
    progress((i + n) / count);
  }
  return sink.result('PLY');
}
