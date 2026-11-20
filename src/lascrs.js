// The coordinate system written in a LAS/LAZ/COPC file (#107): an OGC WKT record (LASF_Projection
// 2112) or a GeoTIFF key directory (LASF_Projection 34735, ProjectedCSTypeGeoKey 3072).
// Returns the WKT text or 'EPSG:n', or null.
export function lasCrs(bytes, headerSize, nVlr) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = headerSize, wkt = null, epsg = null;
  for (let i = 0; i < nVlr && o + 54 <= bytes.length; i++) {
    const user = new TextDecoder().decode(bytes.subarray(o + 2, o + 18)).replace(/\0.*$/s, '');
    const rec = v.getUint16(o + 18, true), len = v.getUint16(o + 20, true);
    const body = o + 54;
    if (user === 'LASF_Projection' && body + len <= bytes.length) {
      if (rec === 2112) wkt = new TextDecoder().decode(bytes.subarray(body, body + len)).replace(/\0+$/, '');
      else if (rec === 34735) {
        const n = v.getUint16(body + 6, true);
        for (let k = 0; k < n; k++) {
          const e = body + 8 + k * 8;
          if (v.getUint16(e, true) === 3072 && v.getUint16(e + 2, true) === 0) epsg = v.getUint16(e + 6, true);
        }
      }
    }
    o = body + len;
  }
  if (wkt) return wkt;
  return epsg && epsg !== 32767 ? `EPSG:${epsg}` : null;
}
