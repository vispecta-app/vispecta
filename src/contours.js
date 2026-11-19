// Contour lines on terrain models (#92): cut every triangle at the contour heights and join the
// pieces into polylines. Works on triangles in IFC coordinates (x, y east/north, z up).

/** An interval that gives roughly 15 – 40 contours over the height span. */
export function autoInterval(zmin, zmax) {
  const span = Math.max(0.01, zmax - zmin);
  for (const v of [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100]) if (span / v <= 40) return v;
  return 200;
}

/**
 * tris: Float64Array with 9 numbers per triangle (three IFC points). Returns
 * { interval, levels: [{ z, major, lines: [[[x,y,z], ...], ...] }] }. Every 5th contour is major.
 */
export function contourLines(tris, interval) {
  let zmin = Infinity, zmax = -Infinity;
  for (let i = 2; i < tris.length; i += 3) { const z = tris[i]; if (z < zmin) zmin = z; if (z > zmax) zmax = z; }
  if (!(zmax > zmin)) return { interval, levels: [] };
  if (!(interval > 0)) interval = autoInterval(zmin, zmax);
  const k0 = Math.ceil(zmin / interval - 1e-9), k1 = Math.floor(zmax / interval + 1e-9);
  if (k1 - k0 > 2000) return { interval, levels: [], tooMany: true };
  const segs = new Map(); // level index -> flat [x1,y1,x2,y2, ...]
  const eps = interval * 1e-6;
  for (let t = 0; t < tris.length; t += 9) {
    const ax = tris[t], ay = tris[t + 1], az = tris[t + 2];
    const bx = tris[t + 3], by = tris[t + 4], bz = tris[t + 5];
    const cx = tris[t + 6], cy = tris[t + 7], cz = tris[t + 8];
    const lo = Math.min(az, bz, cz), hi = Math.max(az, bz, cz);
    if (hi - lo < eps) continue; // flat triangles give no line
    for (let k = Math.ceil(lo / interval); k * interval <= hi; k++) {
      // a level exactly at a vertex is moved up a hair, so the cut is always two clean edge points
      let z = k * interval;
      if (Math.abs(z - az) < eps || Math.abs(z - bz) < eps || Math.abs(z - cz) < eps) z += eps * 2;
      const p = [];
      const edge = (x1, y1, z1, x2, y2, z2) => {
        if ((z1 < z) !== (z2 < z)) { const f = (z - z1) / (z2 - z1); p.push(x1 + f * (x2 - x1), y1 + f * (y2 - y1)); }
      };
      edge(ax, ay, az, bx, by, bz); edge(bx, by, bz, cx, cy, cz); edge(cx, cy, cz, ax, ay, az);
      if (p.length !== 4) continue;
      let arr = segs.get(k);
      if (!arr) segs.set(k, (arr = []));
      arr.push(p[0], p[1], p[2], p[3]);
    }
  }
  const levels = [];
  for (const k of [...segs.keys()].sort((a, b) => a - b)) {
    const z = k * interval;
    levels.push({ z, major: k % 5 === 0, lines: chain(segs.get(k)).map((l) => l.map(([x, y]) => [x, y, z])) });
  }
  return { interval, levels };
}

/** Joins segments [x1,y1,x2,y2, ...] whose ends meet (within 1 mm) into polylines. */
function chain(flat) {
  const key = (x, y) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`;
  const n = flat.length / 4;
  const at = new Map(); // point key -> segment indices
  const add = (kk, i) => { const a = at.get(kk); if (a) a.push(i); else at.set(kk, [i]); };
  for (let i = 0; i < n; i++) { add(key(flat[4 * i], flat[4 * i + 1]), i); add(key(flat[4 * i + 2], flat[4 * i + 3]), i); }
  const used = new Uint8Array(n);
  const lines = [];
  const next = (pt) => {
    const a = at.get(key(pt[0], pt[1]));
    if (!a) return null;
    for (const j of a) if (!used[j]) {
      used[j] = 1;
      const s = [flat[4 * j], flat[4 * j + 1]], e = [flat[4 * j + 2], flat[4 * j + 3]];
      return key(s[0], s[1]) === key(pt[0], pt[1]) ? e : s;
    }
    return null;
  };
  for (let i = 0; i < n; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const line = [[flat[4 * i], flat[4 * i + 1]], [flat[4 * i + 2], flat[4 * i + 3]]];
    for (let q = next(line.at(-1)); q; q = next(line.at(-1))) line.push(q);
    for (let q = next(line[0]); q; q = next(line[0])) line.unshift(q);
    lines.push(line);
  }
  return lines;
}

/** Length of a polyline in plan. */
export function planLength(line) {
  let L = 0;
  for (let i = 1; i < line.length; i++) L += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
  return L;
}
