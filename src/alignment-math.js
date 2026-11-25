// Points and heights along an alignment (no IFC reading here: usable in tests and workers).

/** Height of the vertical profile at distance s (null without a profile). */
export function heightAt(al, s) {
  const v = al.vertical || [];
  if (!v.length) {
    // a drawn line: heights of its points, interpolated
    if (!al.zs) return null;
    const { cum, zs } = al;
    if (s <= 0) return zs[0];
    let k = 1;
    while (k < cum.length - 1 && cum[k] < s) k++;
    const L = cum[k] - cum[k - 1] || 1;
    return zs[k - 1] + ((zs[k] - zs[k - 1]) * Math.min(1, Math.max(0, (s - cum[k - 1]) / L)));
  }
  let seg = v[0];
  for (const x of v) if (s >= x.s0 - 1e-9) seg = x;
  const d = Math.min(Math.max(s - seg.s0, 0), seg.L || 0);
  if (seg.type === 'CONSTANTGRADIENT' || !seg.L) return seg.h0 + seg.g0 * d;
  // parabolic and circular arcs: gradient changes linearly (circular arc approximated, exact for small gradients)
  return seg.h0 + seg.g0 * d + ((seg.g1 - seg.g0) / (2 * seg.L)) * d * d;
}

/** Point and direction of the horizontal alignment at distance s. */
export function pointAt(al, s) {
  const { poly, cum } = al;
  s = Math.min(Math.max(s, 0), al.length);
  let k = 1;
  while (k < cum.length - 1 && cum[k] < s) k++;
  const a = poly[k - 1], b = poly[k];
  const L = cum[k] - cum[k - 1] || 1;
  const tt = (s - cum[k - 1]) / L;
  const dx = (b[0] - a[0]) / L, dy = (b[1] - a[1]) / L;
  return { x: a[0] + (b[0] - a[0]) * tt, y: a[1] + (b[1] - a[1]) * tt, dx, dy };
}
