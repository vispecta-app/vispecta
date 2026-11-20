// E57 reader (#52): point clouds from terrestrial laser scanners (ASTM E2807), read locally in the
// point cloud worker and thinned to the point budget like the other formats.
//
// An E57 file is paged: every 1024 bytes end in a 4-byte checksum, so "logical" offsets (without the
// checksums) differ from "physical" ones (in the file). An XML section describes the scans (data3D):
// each with its pose (a rotation quaternion and a translation into the common frame) and a
// CompressedVector of points. The points come in data packets, one byte stream per field (x, y, z,
// intensity, colour …); a field is a float, or an integer / scaled integer bit-packed with just
// enough bits for its range. Cartesian and spherical coordinates are read; all scans are put into
// the one frame with their poses. Images in the file are skipped.

const PAGE = 1024, PAYLOAD = 1020;

/** Reads an E57 file into a Sink (see pointcloud-worker.js). makeSink(total, bounds, opts) -> Sink. */
export async function readE57(file, makeSink, progress) {
  const head = new DataView(await file.slice(0, 48).arrayBuffer());
  const sig = String.fromCharCode(...new Uint8Array(head.buffer, 0, 8));
  if (sig !== 'ASTM-E57') throw new Error('Not an E57 file');
  const xmlPhys = Number(head.getBigUint64(24, true)), xmlLen = Number(head.getBigUint64(32, true));
  const pageSize = Number(head.getBigUint64(40, true)) || PAGE;
  if (pageSize !== PAGE) throw new Error(`E57 page size ${pageSize} is not supported`);
  const xml = new TextDecoder().decode(await readLogical(file, xmlPhys, xmlLen));
  const root = parseXml(xml);
  const data3D = child(root, 'data3D');
  const scans = data3D ? data3D.children.filter((c) => c.name === 'vectorChild') : [];
  if (!scans.length) throw new Error('The E57 file has no 3D scans');
  const list = scans.map(scanInfo).filter((s) => s.count > 0);
  if (!list.length) throw new Error('The E57 file has no points');
  const total = list.reduce((a, s) => a + s.count, 0);
  // the extent of all scans in the common frame (for the thinning grid)
  let bounds = null;
  for (const s of list) {
    if (!s.bounds) { bounds = null; break; }
    const b = s.bounds, c = [];
    // the bounds are meant in the scan's own frame (the scanner at 0, 0, 0), but some writers store
    // them in the common frame (around the scanner's position): tell which from where the scanner is
    const inside = (p) => p.every((v, k) => v >= b[k] - 1e-6 && v <= b[k + 3] + 1e-6);
    const world = inside(s.T) && !inside([0, 0, 0]), local = inside([0, 0, 0]) && !inside(s.T);
    if (!world) for (const x of [b[0], b[3]]) for (const y of [b[1], b[4]]) for (const z of [b[2], b[5]]) c.push(s.transform(x, y, z));
    if (!local) c.push([b[0], b[1], b[2]], [b[3], b[4], b[5]]);
    bounds ||= [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const p of c) for (let k = 0; k < 3; k++) { bounds[k] = Math.min(bounds[k], p[k]); bounds[k + 3] = Math.max(bounds[k + 3], p[k]); }
  }
  const hasRgb = list.some((s) => s.fields.colorRed), hasInt = list.some((s) => s.fields.intensity);
  const sink = makeSink(total, bounds, { rgb: hasRgb, intensity: hasInt });
  let done = 0;
  for (const s of list) {
    await readScan(file, s, sink, (n) => { done += n; progress(done / total); });
  }
  const out = sink.result('E57');
  out.scans = list.length;
  out.crs = child(root, 'coordinateMetadata')?.text.trim() || null; // WKT or a code, when the file has it (#107)
  return out;
}

// --------------------------------------------------------------- scans
function scanInfo(node) {
  const points = child(node, 'points');
  const count = Number(points?.attrs.recordCount || 0);
  const proto = child(points, 'prototype');
  const fields = {};
  const order = [];
  for (const f of proto?.children || []) {
    const t = f.attrs.type;
    const d = { name: f.name, type: t };
    if (t === 'Float') d.bytes = f.attrs.precision === 'single' ? 4 : 8;
    else if (t === 'Integer' || t === 'ScaledInteger') {
      d.min = Number(f.attrs.minimum ?? 0); d.max = Number(f.attrs.maximum ?? 0);
      d.bits = Math.ceil(Math.log2(d.max - d.min + 1));
      if (t === 'ScaledInteger') { d.scale = Number(f.attrs.scale ?? 1); d.offset = Number(f.attrs.offset ?? 0); }
    } else throw new Error(`E57 field type ${t} is not supported`);
    if (t === 'Float') { d.min = Number(f.attrs.minimum ?? NaN); d.max = Number(f.attrs.maximum ?? NaN); }
    fields[f.name] = d;
    order.push(d);
  }
  // the pose: p' = R p + t (R from a unit quaternion w x y z)
  const pose = child(node, 'pose');
  const rot = child(pose, 'rotation'), tr = child(pose, 'translation');
  const num = (n, k, dflt) => { const c = child(n, k); return c && c.text.trim() !== '' ? Number(c.text) : dflt; };
  let w = num(rot, 'w', 1), x = num(rot, 'x', 0), y = num(rot, 'y', 0), z = num(rot, 'z', 0);
  const len = Math.hypot(w, x, y, z) || 1; w /= len; x /= len; y /= len; z /= len;
  const R = [
    1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
  ];
  const T = [num(tr, 'x', 0), num(tr, 'y', 0), num(tr, 'z', 0)];
  const transform = (px, py, pz) => [
    R[0] * px + R[1] * py + R[2] * pz + T[0],
    R[3] * px + R[4] * py + R[5] * pz + T[1],
    R[6] * px + R[7] * py + R[8] * pz + T[2],
  ];
  const cb = child(node, 'cartesianBounds');
  let bounds = null;
  if (cb) {
    const b = ['xMinimum', 'yMinimum', 'zMinimum', 'xMaximum', 'yMaximum', 'zMaximum'].map((k) => num(cb, k, NaN));
    // (min and max can be swapped in files from some writers)
    if (b.every(Number.isFinite)) bounds = [0, 1, 2].map((k) => Math.min(b[k], b[k + 3])).concat([0, 1, 2].map((k) => Math.max(b[k], b[k + 3])));
  }
  // limits to scale intensity (to 16 bit) and colours (to 8 bit)
  const lim = (n, a, b, f) => { const c = child(node, n); const lo = num(c, a, NaN), hi = num(c, b, NaN); return [Number.isFinite(lo) ? lo : f?.min, Number.isFinite(hi) ? hi : f?.max]; };
  const intLim = lim('intensityLimits', 'intensityMinimum', 'intensityMaximum', fields.intensity);
  const colLim = lim('colorLimits', 'colorRedMinimum', 'colorRedMaximum', fields.colorRed);
  return { name: child(node, 'name')?.text || '', count, offset: Number(points?.attrs.fileOffset || 0), fields, order, R, T, transform, bounds, intLim, colLim };
}

/** Reads the points of one scan into the sink. */
async function readScan(file, s, sink, onCount) {
  const reader = new LogicalReader(file);
  const sb = await reader.read(s.offset, 32);
  const sec = new DataView(sb.buffer, sb.byteOffset, 32);
  if (sec.getUint8(0) !== 1) throw new Error('E57: not a compressed vector section');
  const dataPhys = Number(sec.getBigUint64(16, true));
  const streams = s.order.map((f) => new FieldStream(f));
  const F = s.fields;
  const has = (n) => !!F[n];
  const cart = has('cartesianX'), sph = has('sphericalRange');
  if (!cart && !sph) throw new Error('E57 scan without coordinates');
  const idx = Object.fromEntries(s.order.map((f, i) => [f.name, i]));
  const [iLo, iHi] = s.intLim, iSpan = (iHi - iLo) || 1;
  const cHi = s.colLim[1] > 255 ? s.colLim[1] : 255, cLo = s.colLim[0] > 0 && s.colLim[1] > 255 ? s.colLim[0] : 0;
  const vals = new Float64Array(s.order.length);
  let pos = physToLogical(dataPhys);
  let left = s.count;
  while (left > 0) {
    const ph = await reader.readL(pos, 6);
    const type = ph[0];
    const plen = (ph[2] | (ph[3] << 8)) + 1;
    if (type === 1) {
      const pkt = await reader.readL(pos, plen);
      const v = new DataView(pkt.buffer, pkt.byteOffset, pkt.byteLength);
      const n = v.getUint16(4, true);
      let off = 6 + n * 2;
      for (let k = 0; k < n; k++) {
        const bl = v.getUint16(6 + k * 2, true);
        if (k < streams.length) streams[k].push(pkt.subarray(off, off + bl));
        off += bl;
      }
      // as many records as every field has values for
      let ready = left;
      for (const st of streams) ready = Math.min(ready, st.available());
      for (let r = 0; r < ready; r++) {
        for (let k = 0; k < streams.length; k++) vals[k] = streams[k].next();
        if (cart) {
          if (idx.cartesianInvalidState !== undefined && vals[idx.cartesianInvalidState] !== 0) continue;
        } else if (idx.sphericalInvalidState !== undefined && vals[idx.sphericalInvalidState] !== 0) continue;
        let x, y, z;
        if (cart) { x = vals[idx.cartesianX]; y = vals[idx.cartesianY]; z = vals[idx.cartesianZ]; }
        else {
          const rr = vals[idx.sphericalRange], az = vals[idx.sphericalAzimuth] || 0, el = vals[idx.sphericalElevation] || 0;
          x = rr * Math.cos(el) * Math.cos(az); y = rr * Math.cos(el) * Math.sin(az); z = rr * Math.sin(el);
        }
        const R = s.R, T = s.T;
        const wx = R[0] * x + R[1] * y + R[2] * z + T[0], wy = R[3] * x + R[4] * y + R[5] * z + T[1], wz = R[6] * x + R[7] * y + R[8] * z + T[2];
        const slot = sink.add(wx, wy, wz);
        if (slot < 0) continue;
        if (sink.int) sink.int[slot] = idx.intensity === undefined ? 0 : Math.max(0, Math.min(65535, Math.round(((vals[idx.intensity] - iLo) / iSpan) * 65535)));
        if (sink.rgb) {
          if (idx.colorRed === undefined) { sink.rgb[slot * 3] = sink.rgb[slot * 3 + 1] = sink.rgb[slot * 3 + 2] = 160; }
          else for (const [c, name] of [[0, 'colorRed'], [1, 'colorGreen'], [2, 'colorBlue']]) {
            const val = Math.max(0, Math.min(255, Math.round(((vals[idx[name]] - cLo) / (cHi - cLo)) * 255)));
            sink.rgb[slot * 3 + c] = val;
            if (val > sink.rgbMax) sink.rgbMax = val;
          }
        }
      }
      left -= ready;
      onCount(ready);
    } else if (type !== 0 && type !== 2) throw new Error(`E57: unknown packet type ${type}`);
    pos += plen;
  }
}

/** One field's byte stream, across packets: floats, or bit-packed integers (LSB first). */
class FieldStream {
  constructor(f) {
    this.f = f;
    this.buf = new Uint8Array(0);
    this.bit = 0; // read position in bits
    this.view = new DataView(this.buf.buffer);
  }

  push(bytes) {
    const rest = this.buf.subarray(this.bit >> 3);
    const b = new Uint8Array(rest.length + bytes.length);
    b.set(rest); b.set(bytes, rest.length);
    this.bit &= 7;
    this.buf = b;
    this.view = new DataView(b.buffer);
  }

  available() {
    const f = this.f;
    if (f.type === 'Float') return Math.floor((this.buf.length * 8 - this.bit) / (f.bytes * 8));
    if (f.bits === 0) return Infinity; // a constant: no bytes at all
    return Math.floor((this.buf.length * 8 - this.bit) / f.bits);
  }

  next() {
    const f = this.f;
    if (f.type === 'Float') {
      const o = this.bit >> 3;
      this.bit += f.bytes * 8;
      return f.bytes === 4 ? this.view.getFloat32(o, true) : this.view.getFloat64(o, true);
    }
    let raw = 0;
    if (f.bits > 0) {
      // up to 53 bits, gathered a byte at a time
      let got = 0, bit = this.bit;
      while (got < f.bits) {
        const byte = this.buf[bit >> 3], sh = bit & 7, take = Math.min(8 - sh, f.bits - got);
        raw += ((byte >> sh) & ((1 << take) - 1)) * 2 ** got;
        got += take; bit += take;
      }
      this.bit = bit;
    }
    const v = raw + f.min;
    return f.type === 'ScaledInteger' ? v * f.scale + f.offset : v;
  }
}

// ------------------------------------------------------- paged file access
const physToLogical = (p) => Math.floor(p / PAGE) * PAYLOAD + (p % PAGE);

/** Reads `len` logical bytes starting at a physical offset (skipping the page checksums). */
async function readLogical(file, phys, len) {
  return new LogicalReader(file).readL(physToLogical(phys), len);
}

/** Reads logical byte ranges, with a read-ahead buffer of whole pages. */
class LogicalReader {
  constructor(file) { this.file = file; this.start = -1; this.data = null; }

  read(phys, len) { return this.readL(physToLogical(phys), len); }

  async readL(lpos, len) {
    if (!this.data || lpos < this.start || lpos + len > this.start + this.data.length) await this.#fill(lpos, Math.max(len, 8 << 20));
    const o = lpos - this.start;
    return this.data.subarray(o, o + len);
  }

  async #fill(lpos, len) {
    const p0 = Math.floor(lpos / PAYLOAD), p1 = Math.min(Math.ceil((lpos + len) / PAYLOAD), Math.ceil(this.file.size / PAGE));
    const raw = new Uint8Array(await this.file.slice(p0 * PAGE, p1 * PAGE).arrayBuffer());
    const out = new Uint8Array((p1 - p0) * PAYLOAD);
    let n = 0;
    for (let p = 0; p * PAGE < raw.length; p++) {
      const seg = raw.subarray(p * PAGE, Math.min(raw.length, p * PAGE + PAYLOAD));
      out.set(seg, n); n += seg.length;
    }
    this.start = p0 * PAYLOAD;
    this.data = out.subarray(0, n);
  }
}

// --------------------------------------------------------------- tiny XML
/** A small XML parser (workers have no DOMParser): elements with attributes and text. */
export function parseXml(s) {
  const root = { name: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  let i = 0;
  const re = /<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!--[\s\S]*?-->/g;
  let m;
  while ((m = re.exec(s))) {
    const top = stack[stack.length - 1];
    if (m.index > i) top.text += decode(s.slice(i, m.index));
    i = re.lastIndex;
    if (m[5] !== undefined) { top.text += m[5]; continue; }
    if (!m[2]) continue; // declaration or comment
    if (m[1]) { if (stack.length > 1) stack.pop(); continue; }
    const attrs = {};
    for (const a of m[3].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = decode(a[2] ?? a[3]);
    const el = { name: m[2].replace(/^.*:/, ''), attrs, children: [], text: '' };
    top.children.push(el);
    if (!m[4]) stack.push(el);
  }
  return root.children[0] || root;
}

const decode = (t) => t.replace(/&(lt|gt|amp|quot|apos);/g, (_, e) => ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" })[e]);
const child = (n, name) => n?.children.find((c) => c.name === name) || null;
