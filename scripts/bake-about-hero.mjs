// Bakes the 3D scene of the about page's hero (public/about/hero/rail.bin.gz) from the double-track
// railway sample: the stretch around the bridge, 12+060 – 12+340, as the app shows it.
//
//   npx vite --port 5199 &          (the dev server: the bake imports the app's own modules)
//   node scripts/bake-about-hero.mjs [http://localhost:5199]
//
// What is kept, to stay light enough for a phone:
// - every model of the sample except the alignment file, cropped to the stretch and to 60 m on each
//   side of track 1 (by the centre of each triangle);
// - sleepers and other track elements as boxes (each one in the direction of the track): they were
//   90 % of the triangles;
// - positions only, in centimetres as 16-bit integers around the middle of the stretch (the hero
//   works out flat normals in its shader); triangles grouped by their colour as the app shows it.
// For the live cross section the triangles are also listed per metre of track (bins), so the hero
// only cuts the few that cross its plane.
//
// File (little endian): u32 header length, header JSON, padding to 4 bytes, then the arrays the header
// points to ([byte offset, length]). Gzipped; the hero unpacks it with DecompressionStream.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/about/hero/rail.bin.gz');
const base = process.argv[2] || 'http://localhost:5199';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
page.on('pageerror', (e) => console.error('page:', e.message));
await page.goto(`${base}/?app`);
await page.waitForFunction(() => window.onlineIfc?.viewer, null, { timeout: 120000 });
await page.click('[data-sample="rail"]');
await page.waitForFunction(() => window.onlineIfc.viewer.models.length === 9 && document.querySelector('#loading')?.hidden !== false, null, { timeout: 300000 });

const baked = await page.evaluate(async () => {
  const A = await import('/src/alignment.js');
  const v = window.onlineIfc.viewer;
  const V3 = v.camera.position.constructor, M4 = v.camera.matrixWorld.constructor;
  const am = v.models.find((m) => m.name === '01-Alignment.ifc');
  const al1 = am.alignments.find((a) => a.name === 'Spor 1'), al2 = am.alignments.find((a) => a.name === 'Spor 2');
  const S0 = 60, S1 = 340, SIDE = 60, MID = 200, SCALE = 0.01;
  // IFC coordinates (x east, y north, z up) of the hero's origin: track 1 at the middle of the stretch
  const pm = A.pointAt(al1, MID);
  const O = { x: pm.x, y: pm.y, z: A.heightAt(al1, MID) ?? 0 };
  const local = (x, y, z) => [x - O.x, z - O.z, -(y - O.y)]; // three.js: y up
  const refInv = v.referenceMatrix ? v.referenceMatrix.clone().invert() : new M4();
  const q = new V3();

  const groups = new Map(); // colour|opacity -> {color, opacity, pos: number[] (local m), stations: number[] per triangle [min, max]}
  const group = (hex, opacity) => {
    const k = `${hex}|${opacity.toFixed(2)}`;
    if (!groups.has(k)) groups.set(k, { color: hex, opacity: +opacity.toFixed(2), pos: [], st: [] });
    return groups.get(k);
  };
  const stOf = (x, y) => A.project(al1, { x, y });
  let kept = 0, boxes = 0, dropped = 0;

  // every element's triangles, over all buckets (an element can have more than one colour)
  const elements = [];
  for (const m of v.models) {
    if (m === am || !m.visible) continue;
    const M = refInv.clone().multiply(m.group.matrixWorld);
    const byId = new Map();
    for (const b of m.buckets) {
      const hex = `#${b.material.color.getHexString()}`, opacity = b.material.opacity;
      const P = b.positions, I = b.index;
      const ifc = (vi) => { q.set(P[vi * 3], P[vi * 3 + 1], P[vi * 3 + 2]).applyMatrix4(M); return [q.x, -q.z, q.y]; };
      for (const it of b.items) {
        if (m.hidden.has(it.id)) continue;
        let e = byId.get(it.id);
        if (!e) byId.set(it.id, (e = { cls: m.typeName(it.id), parts: [] }));
        const tris = [];
        for (let k = it.start; k < it.start + it.count; k += 3) tris.push([ifc(I[k]), ifc(I[k + 1]), ifc(I[k + 2])]);
        e.parts.push({ hex, opacity, tris });
      }
    }
    elements.push(...byId.values());
  }

  // Solids whose triangles face inwards (a mirrored placement turns them over; the app draws both
  // sides, the hero draws the inside of cut solids as hatched faces) are turned the right way: a
  // closed mesh (every edge shared by two triangles) with a negative volume, and an open surface
  // that faces mostly down.
  let flipped = 0;
  const key = (p) => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)},${Math.round(p[2] * 1000)}`;
  const orient = (e) => {
    const all = e.parts.flatMap((pt) => pt.tris);
    const edges = new Map();
    for (const [a, bb, c] of all) for (const [u, w] of [[a, bb], [bb, c], [c, a]]) {
      const ku = key(u), kw = key(w), k = ku < kw ? `${ku}|${kw}` : `${kw}|${ku}`;
      edges.set(k, (edges.get(k) || 0) + 1);
    }
    let closed = true;
    for (const n of edges.values()) if (n !== 2) { closed = false; break; }
    if (!closed) {
      // an open surface (a layer of topsoil, a covering): it should face up, so turned when most of
      // its area faces down
      let nz = 0, area = 0;
      for (const [a, bb, c] of all) {
        const ux = bb[0] - a[0], uy = bb[1] - a[1], uz = bb[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
        const cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx;
        nz += cz; area += Math.hypot(cx, cy, cz);
      }
      if (nz < -0.2 * area) { for (const pt of e.parts) for (const t of pt.tris) { const x = t[1]; t[1] = t[2]; t[2] = x; } flipped++; }
      return;
    }
    let cx = 0, cy = 0, cz = 0;
    for (const t of all) for (const p of t) { cx += p[0]; cy += p[1]; cz += p[2]; }
    const n3 = all.length * 3; cx /= n3; cy /= n3; cz /= n3;
    let vol = 0;
    for (const [a, bb, c] of all) {
      const ax = a[0] - cx, ay = a[1] - cy, az = a[2] - cz, bx = bb[0] - cx, by = bb[1] - cy, bz = bb[2] - cz, qx = c[0] - cx, qy = c[1] - cy, qz = c[2] - cz;
      vol += ax * (by * qz - bz * qy) - ay * (bx * qz - bz * qx) + az * (bx * qy - by * qx);
    }
    if (vol < 0) { for (const pt of e.parts) for (const t of pt.tris) { const x = t[1]; t[1] = t[2]; t[2] = x; } flipped++; }
  };

  for (const e of elements) {
    if (e.cls === 'IfcTrackElement') {
      // a box in the direction of the track at the element's centre
      const pts = e.parts.flatMap((pt) => pt.tris.flat());
      let cx = 0, cy = 0;
      for (const p of pts) { cx += p[0]; cy += p[1]; }
      cx /= pts.length; cy /= pts.length;
      const pr = stOf(cx, cy);
      if (!pr || pr.s < S0 || pr.s > S1 || Math.abs(pr.offset) > SIDE) { dropped += pts.length / 3; continue; }
      const pa = A.pointAt(al1, pr.s);
      const T = [pa.dx, pa.dy], L = [-pa.dy, pa.dx];
      let t0 = Infinity, t1 = -Infinity, l0 = Infinity, l1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const p of pts) {
        const t = (p[0] - cx) * T[0] + (p[1] - cy) * T[1], l = (p[0] - cx) * L[0] + (p[1] - cy) * L[1];
        if (t < t0) t0 = t; if (t > t1) t1 = t; if (l < l0) l0 = l; if (l > l1) l1 = l; if (p[2] < z0) z0 = p[2]; if (p[2] > z1) z1 = p[2];
      }
      const c = (t, l, z) => local(cx + T[0] * t + L[0] * l, cy + T[1] * t + L[1] * l, z);
      const v8 = [c(t0, l0, z0), c(t1, l0, z0), c(t1, l1, z0), c(t0, l1, z0), c(t0, l0, z1), c(t1, l0, z1), c(t1, l1, z1), c(t0, l1, z1)];
      // outward, counter-clockwise seen from outside in three.js coordinates
      // (T, L, up) is right-handed, and so is three.js: e.g. the top (4, 5, 6): T × (T + L) = up
      const F = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
      const g = group(e.parts[0].hex, e.parts[0].opacity);
      for (const f of F) { for (const vi of f) g.pos.push(...v8[vi]); g.st.push(pr.s + t0, pr.s + t1); }
      boxes++;
      continue;
    }
    orient(e);
    for (const pt of e.parts) {
      const g = group(pt.hex, pt.opacity);
      for (const [a, bb, cc] of pt.tris) {
        const pc = stOf((a[0] + bb[0] + cc[0]) / 3, (a[1] + bb[1] + cc[1]) / 3);
        if (!pc || pc.s < S0 || pc.s > S1 || Math.abs(pc.offset) > SIDE) { dropped++; continue; }
        const sa = stOf(a[0], a[1]).s, sb = stOf(bb[0], bb[1]).s, sc = stOf(cc[0], cc[1]).s;
        g.pos.push(...local(...a), ...local(...bb), ...local(...cc));
        g.st.push(Math.min(sa, sb, sc), Math.max(sa, sb, sc));
        kept++;
      }
    }
  }

  // the arrays
  const list = [...groups.values()].filter((g) => g.pos.length);
  const nTri = list.reduce((n, g) => n + g.pos.length / 9, 0);
  const pos = new Int16Array(nTri * 9);
  const triGroup = new Uint8Array(nTri);
  const nBins = S1 - S0;
  const binLists = Array.from({ length: nBins }, () => []);
  let t = 0, maxAbs = 0;
  const buckets = [];
  for (const [gi, g] of list.entries()) {
    buckets.push({ color: g.color, opacity: g.opacity, first: t, count: g.pos.length / 9 });
    for (let i = 0; i < g.pos.length; i++) {
      const qv = Math.round(g.pos[i] / SCALE);
      maxAbs = Math.max(maxAbs, Math.abs(qv));
      pos[t * 9 + i] = qv;
    }
    for (let k = 0; k < g.pos.length / 9; k++) {
      triGroup[t + k] = gi;
      const lo = Math.max(0, Math.floor(g.st[k * 2] - S0)), hi = Math.min(nBins - 1, Math.floor(g.st[k * 2 + 1] - S0));
      for (let bI = lo; bI <= hi; bI++) binLists[bI].push(t + k);
    }
    t += g.pos.length / 9;
  }
  if (maxAbs > 32767) throw new Error(`coordinates out of range: ${maxAbs}`);
  const binStart = new Uint32Array(nBins + 1);
  for (let i = 0; i < nBins; i++) binStart[i + 1] = binStart[i] + binLists[i].length;
  const binTri = new Uint32Array(binStart[nBins]);
  for (let i = 0; i < nBins; i++) binTri.set(binLists[i], binStart[i]);

  // the two tracks every metre (local x, y, z), a little beyond the stretch for the camera
  const track = (al) => {
    const out = [];
    for (let s = S0 - 40; s <= S1 + 40; s += 1) { const p = A.pointAt(al, s); out.push(...local(p.x, p.y, A.heightAt(al, s) ?? O.z)); }
    return new Float32Array(out);
  };
  const t1 = track(al1), t2 = track(al2);

  const toB64 = (arr) => { const u = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  return {
    header: {
      version: 1, sample: 'double-track-railway', scale: SCALE, station0: al1.station0 ?? 0, s0: S0, s1: S1, trackFrom: S0 - 40,
      tracks: [{ name: al1.name }, { name: al2.name }], buckets, triangles: nTri, nBins,
    },
    arrays: { pos: toB64(pos), triGroup: toB64(triGroup), binStart: toB64(binStart), binTri: toB64(binTri), track1: toB64(t1), track2: toB64(t2) },
    stats: { kept, boxes, flipped, dropped, nTri, buckets: buckets.length, binRefs: binTri.length, maxAbs },
  };
});
await browser.close();

// assemble the file
const parts = [], index = {};
let offset = 0;
for (const [k, b64] of Object.entries(baked.arrays)) {
  const buf = Buffer.from(b64, 'base64');
  index[k] = [offset, buf.length];
  parts.push(buf);
  const pad = (4 - (buf.length % 4)) % 4;
  if (pad) parts.push(Buffer.alloc(pad));
  offset += buf.length + pad;
}
const header = Buffer.from(JSON.stringify({ ...baked.header, arrays: index }));
const headPad = (4 - ((4 + header.length) % 4)) % 4;
const len = Buffer.alloc(4); len.writeUInt32LE(header.length + headPad);
const raw = Buffer.concat([len, header, Buffer.alloc(headPad, 0x20), ...parts]);
const gz = zlib.gzipSync(raw, { level: 9 });
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, gz);
console.log(JSON.stringify(baked.stats), `raw ${(raw.length / 1e6).toFixed(2)} MB, gzip ${(gz.length / 1e6).toFixed(2)} MB -> ${path.relative(ROOT, OUT)}`);
