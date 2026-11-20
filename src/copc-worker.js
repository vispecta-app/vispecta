// COPC reader (#52): a cloud-optimised LAZ file is read piece by piece (File.slice), never whole.
// The file holds an octree: every node is a LAZ chunk of points, the root covers the whole cloud
// sparsely and each level below adds detail in a cube an eighth of the size. This worker reads the
// header and the hierarchy (where each node is in the file), and then decodes the nodes the viewer
// asks for (see copc.js).
//
// Messages in:  { open: file, origin? }            -> { info }
//               { load: [key, ...], id }          -> { nodes: [{ key, positions, colors, intensity, classes }], id }
// Positions are relative to the cloud's origin (double precision stays here, Float32 goes out).
import createLazPerf from 'laz-perf/lib/worker/laz-perf.js';
import lazWasm from 'laz-perf/lib/worker/laz-perf.wasm?url';
import { lasCrs } from './lascrs.js';

let file = null, h = null, nodes = null, lazP = null, rgbScale = 0;
const RGB_AT = { 7: 30, 8: 30 };

self.onmessage = async ({ data }) => {
  try {
    if (data.open) {
      file = data.open;
      const info = await open(file);
      self.postMessage({ info });
    } else if (data.load) {
      const out = [], t = [];
      for (const key of data.load) {
        const n = await loadNode(key);
        if (!n) continue;
        out.push(n);
        for (const k of ['positions', 'colors', 'intensity', 'classes']) if (n[k]) t.push(n[k].buffer);
      }
      self.postMessage({ nodes: out, id: data.id }, t);
    }
  } catch (e) {
    self.postMessage({ error: e.message || String(e), id: data.id });
  }
};

const bytes = async (a, b) => new Uint8Array(await file.slice(a, b).arrayBuffer());

async function open(f) {
  const head = await bytes(0, 65536);
  const v = new DataView(head.buffer);
  const sig = String.fromCharCode(head[0], head[1], head[2], head[3]);
  if (sig !== 'LASF') throw new Error('Not a LAS/LAZ file');
  const headerSize = v.getUint16(94, true), pointOffset = v.getUint32(96, true), nVlr = v.getUint32(100, true);
  const fmt = v.getUint8(104) & 0x3f, recLen = v.getUint16(105, true);
  const f64 = (o) => v.getFloat64(o, true);
  const count = Number(v.getBigUint64(247, true)) || v.getUint32(107, true);
  h = {
    fmt, recLen, count, scale: [f64(131), f64(139), f64(147)], off: [f64(155), f64(163), f64(171)],
    min: [f64(187), f64(203), f64(219)], max: [f64(179), f64(195), f64(211)],
  };
  // the COPC info VLR (user "copc", record 1) comes first after the header
  let info = null, o = headerSize;
  for (let i = 0; i < nVlr && o + 54 <= Math.min(pointOffset, head.length); i++) {
    const user = new TextDecoder().decode(head.subarray(o + 2, o + 18)).replace(/\0.*$/s, '');
    const rec = v.getUint16(o + 18, true), len = v.getUint16(o + 20, true);
    if (user === 'copc' && rec === 1) {
      const q = new DataView(head.buffer, o + 54, 160);
      info = {
        center: [q.getFloat64(0, true), q.getFloat64(8, true), q.getFloat64(16, true)], half: q.getFloat64(24, true), spacing: q.getFloat64(32, true),
        rootOffset: Number(q.getBigUint64(40, true)), rootLength: Number(q.getBigUint64(48, true)),
      };
      break;
    }
    o += 54 + len;
  }
  if (!info) throw new Error('Not a COPC file (no COPC info record)');
  if (!(fmt >= 6 && fmt <= 8)) throw new Error(`COPC point format ${fmt} is not supported`);
  // the whole hierarchy: pages that point to more pages
  nodes = new Map();
  const pages = [[info.rootOffset, info.rootLength]];
  while (pages.length) {
    const [po, pl] = pages.shift();
    const b = await bytes(po, po + pl), dv = new DataView(b.buffer);
    for (let i = 0; i + 32 <= b.length; i += 32) {
      const d = dv.getInt32(i, true), x = dv.getInt32(i + 4, true), y = dv.getInt32(i + 8, true), z = dv.getInt32(i + 12, true);
      const offset = Number(dv.getBigUint64(i + 16, true)), length = dv.getInt32(i + 24, true), n = dv.getInt32(i + 28, true);
      if (n === -1) pages.push([offset, length]);
      else if (n > 0) nodes.set(`${d}-${x}-${y}-${z}`, { d, x, y, z, offset, length, count: n });
    }
  }
  h.origin = info.center.map((c) => Math.round(c));
  return {
    count, fmt, origin: h.origin, min: h.min, max: h.max, center: info.center, half: info.half, spacing: info.spacing,
    nodes: [...nodes.values()].map(({ d, x, y, z, count: n }) => [d, x, y, z, n]),
    hasRgb: RGB_AT[fmt] !== undefined,
    crs: lasCrs(head, headerSize, nVlr), // the coordinate system in the file's records (#107)
  };
}

async function loadNode(key) {
  const n = nodes.get(key);
  if (!n) return null;
  lazP ||= await createLazPerf({ locateFile: (p) => (p.endsWith('.wasm') ? lazWasm : p) });
  const laz = lazP;
  const comp = await bytes(n.offset, n.offset + n.length);
  const len = h.recLen, cnt = n.count;
  const pos = new Float32Array(cnt * 3), inten = new Uint16Array(cnt), cls = new Uint8Array(cnt);
  const rgbAt = RGB_AT[h.fmt];
  const rgb16 = rgbAt !== undefined ? new Uint16Array(cnt * 3) : null;
  const blob = laz._malloc(comp.length), pt = laz._malloc(len);
  const dec = new laz.ChunkDecoder();
  try {
    laz.HEAPU8.set(comp, blob);
    dec.open(h.fmt, len, blob);
    const [sx, sy, sz] = h.scale, [ox, oy, oz] = h.off, [gx, gy, gz] = h.origin;
    let buf = laz.HEAPU8.buffer, v = new DataView(buf, pt, len);
    let m = 0;
    for (let i = 0; i < cnt; i++) {
      dec.getPoint(pt);
      if (laz.HEAPU8.buffer !== buf) { buf = laz.HEAPU8.buffer; v = new DataView(buf, pt, len); }
      pos[i * 3] = v.getInt32(0, true) * sx + ox - gx;
      pos[i * 3 + 1] = v.getInt32(4, true) * sy + oy - gy;
      pos[i * 3 + 2] = v.getInt32(8, true) * sz + oz - gz;
      inten[i] = v.getUint16(12, true);
      cls[i] = v.getUint8(16);
      if (rgb16) {
        for (let k = 0; k < 3; k++) { const c = v.getUint16(rgbAt + k * 2, true); rgb16[i * 3 + k] = c; if (c > m) m = c; }
      }
    }
    let colors = null;
    if (rgb16) {
      // 16-bit colours (most files) or 8-bit ones: decided once, on the first node with colour
      if (!rgbScale && m > 0) rgbScale = m > 255 ? 1 / 257 : 1;
      if (rgbScale) { colors = new Uint8Array(cnt * 3); for (let i = 0; i < colors.length; i++) colors[i] = Math.min(255, Math.round(rgb16[i] * rgbScale)); }
    }
    return { key, positions: pos, colors, intensity: inten, classes: cls };
  } finally {
    dec.delete();
    laz._free(blob);
    laz._free(pt);
  }
}
