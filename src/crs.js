// Coordinate systems (#107): the project has one map coordinate system (CRS), and models, point
// clouds and terrain in another are converted into it on the fly – point clouds and terrain point
// by point, IFC models with a similarity transform fitted over their extent (and point by point
// where that is not exact enough). Heights are not converted.
//
// Conversion with proj4js (MIT), locally. The common Danish and German systems are built in; any
// other EPSG code is looked up once (epsg.io) and kept in this browser and in the project.
import proj4 from 'proj4';

const GRS80 = '+ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';
// DHDN: the Germany-wide 7-parameter set (about 1–3 m; BeTA2007 is not built in)
const DHDN = '+ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs';
// DB_REF: the Deutsche Bahn reference frame, 7 parameters to ETRS89 (EPSG:5826)
const DBREF = '+ellps=bessel +towgs84=584.9636,107.7175,413.8067,1.1155,0.2824,-3.1384,7.9922 +units=m +no_defs';

/** Built-in systems: code -> [name, proj4 definition, group, accuracy note key or null]. */
export const CRS_LIST = {
  'EPSG:25832': ['ETRS89 / UTM zone 32N', `+proj=utm +zone=32 ${GRS80}`, 'dk'],
  'EPSG:25833': ['ETRS89 / UTM zone 33N', `+proj=utm +zone=33 ${GRS80}`, 'dk'],
  'EPSG:4093': ['ETRS89 / DKTM1', `+proj=tmerc +lat_0=0 +lon_0=9 +k=0.99998 +x_0=200000 +y_0=-5000000 ${GRS80}`, 'dk'],
  'EPSG:4094': ['ETRS89 / DKTM2', `+proj=tmerc +lat_0=0 +lon_0=10 +k=0.99998 +x_0=400000 +y_0=-5000000 ${GRS80}`, 'dk'],
  'EPSG:4095': ['ETRS89 / DKTM3', `+proj=tmerc +lat_0=0 +lon_0=11.75 +k=0.99998 +x_0=600000 +y_0=-5000000 ${GRS80}`, 'dk'],
  'EPSG:4096': ['ETRS89 / DKTM4', `+proj=tmerc +lat_0=0 +lon_0=15 +k=1 +x_0=800000 +y_0=-5000000 ${GRS80}`, 'dk'],
  'EPSG:2196': ['ETRS89 / Kp2000 Jylland', `+proj=tmerc +lat_0=0 +lon_0=9.5 +k=0.99995 +x_0=200000 +y_0=0 ${GRS80}`, 'dk'],
  'EPSG:2197': ['ETRS89 / Kp2000 Sjælland', `+proj=tmerc +lat_0=0 +lon_0=12 +k=0.99995 +x_0=500000 +y_0=0 ${GRS80}`, 'dk'],
  'EPSG:2198': ['ETRS89 / Kp2000 Bornholm', `+proj=tmerc +lat_0=0 +lon_0=15 +k=1 +x_0=900000 +y_0=0 ${GRS80}`, 'dk'],
  'EPSG:32632': ['WGS 84 / UTM zone 32N', '+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs', 'dk'],
  'EPSG:32633': ['WGS 84 / UTM zone 33N', '+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs', 'dk'],
  'EPSG:31466': ['DHDN / Gauss-Krüger zone 2', `+proj=tmerc +lat_0=0 +lon_0=6 +k=1 +x_0=2500000 +y_0=0 ${DHDN}`, 'de', 'dhdn'],
  'EPSG:31467': ['DHDN / Gauss-Krüger zone 3', `+proj=tmerc +lat_0=0 +lon_0=9 +k=1 +x_0=3500000 +y_0=0 ${DHDN}`, 'de', 'dhdn'],
  'EPSG:31468': ['DHDN / Gauss-Krüger zone 4', `+proj=tmerc +lat_0=0 +lon_0=12 +k=1 +x_0=4500000 +y_0=0 ${DHDN}`, 'de', 'dhdn'],
  'EPSG:31469': ['DHDN / Gauss-Krüger zone 5', `+proj=tmerc +lat_0=0 +lon_0=15 +k=1 +x_0=5500000 +y_0=0 ${DHDN}`, 'de', 'dhdn'],
  'EPSG:5682': ['DB_REF / 3-degree Gauss-Krüger zone 2 (E-N)', `+proj=tmerc +lat_0=0 +lon_0=6 +k=1 +x_0=2500000 +y_0=0 ${DBREF}`, 'de', 'dbref'],
  'EPSG:5683': ['DB_REF / 3-degree Gauss-Krüger zone 3 (E-N)', `+proj=tmerc +lat_0=0 +lon_0=9 +k=1 +x_0=3500000 +y_0=0 ${DBREF}`, 'de', 'dbref'],
  'EPSG:5684': ['DB_REF / 3-degree Gauss-Krüger zone 4 (E-N)', `+proj=tmerc +lat_0=0 +lon_0=12 +k=1 +x_0=4500000 +y_0=0 ${DBREF}`, 'de', 'dbref'],
  'EPSG:5685': ['DB_REF / 3-degree Gauss-Krüger zone 5 (E-N)', `+proj=tmerc +lat_0=0 +lon_0=15 +k=1 +x_0=5500000 +y_0=0 ${DBREF}`, 'de', 'dbref'],
};

// systems added by the user (EPSG codes looked up, or pasted proj4 definitions): code -> [name, def]
const CUSTOM_KEY = 'vispecta.crs.custom';
// Definitions also come from projects and saved data: only well-formed codes and [name, def] pairs
// are taken, into an object without a prototype (a key such as "__proto__" stays a plain key).
const CODE_RE = /^(EPSG:\d{4,6}|PROJ:[0-9a-z]{1,13})$/;
const validDef = (code, v) => CODE_RE.test(code) && Array.isArray(v) && typeof v[1] === 'string' && v[1].length < 4096;
let custom = Object.create(null);
try {
  const saved = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '{}');
  for (const [code, v] of Object.entries(saved && typeof saved === 'object' ? saved : {})) if (validDef(code, v)) custom[code] = [String(v[0] || code), v[1]];
} catch { /* ignore */ }
const saveCustom = () => { try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom)); } catch { /* ignore */ } };

/** All known systems: [{code, name, group, note}]. */
export function crsOptions() {
  const out = Object.entries(CRS_LIST).map(([code, [name, , group, note]]) => ({ code, name, group, note: note || null }));
  for (const [code, [name]] of Object.entries(custom)) if (!CRS_LIST[code]) out.push({ code, name, group: 'custom', note: null });
  return out;
}

export const crsName = (code) => (code ? CRS_LIST[code]?.[0] || custom[code]?.[0] || code : '');
export const crsNote = (code) => CRS_LIST[code]?.[3] || null;
export const crsKnown = (code) => !!(code && (CRS_LIST[code] || custom[code]));
const defOf = (code) => CRS_LIST[code]?.[1] || custom[code]?.[1] || null;

/** Custom definitions to keep with a project. */
export function customDefs(codes) {
  const out = {};
  for (const c of codes) if (custom[c] && !CRS_LIST[c]) out[c] = custom[c];
  return out;
}
/** Adds definitions (from a project). */
export function addDefs(defs) {
  let n = 0;
  for (const [code, v] of Object.entries(defs || {})) {
    if (CRS_LIST[code] || !validDef(code, v)) continue;
    custom[code] = [String(v[0] || code), v[1]]; n++;
  }
  if (n) saveCustom();
}

/**
 * Looks up an EPSG code (epsg.io, once), or takes a proj4 definition that is pasted. Returns the code.
 * Throws when the code is unknown or not a projected system in metres.
 */
export async function defineCrs(input) {
  const s = String(input || '').trim();
  if (s.startsWith('+proj=')) {
    if (s.length >= 4096) throw new Error('definition too long');
    proj4(s); // throws if it cannot be read
    const code = `PROJ:${hashText(s)}`;
    custom[code] = [s.replace(/\s+\+no_defs.*$/, '').slice(0, 60), s];
    saveCustom();
    return code;
  }
  const code = normalizeCrs(s);
  if (!code) throw new Error('not an EPSG code');
  if (crsKnown(code)) return code;
  const n = code.split(':')[1];
  const [def, name] = await Promise.all([
    fetch(`https://epsg.io/${n}.proj4`).then((r) => { if (!r.ok) throw new Error(`EPSG:${n} not found`); return r.text(); }),
    fetch(`https://epsg.io/${n}.wkt`).then((r) => (r.ok ? r.text() : '')).catch(() => ''),
  ]);
  if (!/\+proj=/.test(def)) throw new Error(`EPSG:${n} not found`);
  if (/\+proj=longlat/.test(def)) throw new Error(`EPSG:${n} is geographic (degrees), not a map projection`);
  proj4(def);
  custom[code] = [/^\w+\["([^"]+)"/.exec(name)?.[1] || code, def.trim()];
  saveCustom();
  return code;
}

function hashText(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/**
 * An EPSG code from what files write: "EPSG:25832", "urn:ogc:def:crs:EPSG::25832", "25832",
 * a WKT with AUTHORITY["EPSG","25832"] / ID["EPSG",25832], or a name such as "ETRS89 / UTM zone 32N",
 * "ETRS89_UTM32", "UTM32", "DKTM1", "Kp2000 Jylland", "DB_REF GK3". null when it cannot be told.
 */
export function normalizeCrs(text) {
  if (text === null || text === undefined) return null;
  const s = String(text).trim();
  if (!s) return null;
  if (/^PROJ:/.test(s)) return s;
  // the outermost authority of a WKT is the last one
  const auth = [...s.matchAll(/(?:AUTHORITY|ID)\[\s*"EPSG"\s*,\s*"?(\d{4,6})"?\s*\]/gi)];
  if (auth.length) return `EPSG:${auth.at(-1)[1]}`;
  let m = /EPSG\D{0,3}(\d{4,6})/i.exec(s) || /^(\d{4,6})$/.exec(s);
  if (m) return `EPSG:${m[1]}`;
  const u = s.toUpperCase().replace(/[\s_/-]+/g, ' ');
  m = /UTM (?:ZONE )?(32|33)\s*N?\b/.exec(u) || /UTM(32|33)(?!\d)/.exec(u.replace(/ /g, ''));
  if (m) return /WGS ?84/.test(u) ? `EPSG:326${m[1]}` : `EPSG:258${m[1]}`;
  m = /DKTM ?([1-4])/.exec(u);
  if (m) return `EPSG:${4092 + +m[1]}`;
  if (/KP ?2000/.test(u)) {
    if (/JYL|JUT/.test(u)) return 'EPSG:2196';
    if (/SJ|ZEAL/.test(u)) return 'EPSG:2197';
    if (/BORN/.test(u)) return 'EPSG:2198';
  }
  m = /DB ?REF.*?(?:ZONE|GK) ?([2-5])/.exec(u);
  if (m) return `EPSG:${5680 + +m[1]}`;
  m = /(?:DHDN|GAUSS ?KR[UÜ]GER|\bGK\b).*?(?:ZONE|GK) ?([2-5])/.exec(u);
  if (m) return `EPSG:${31464 + +m[1]}`;
  return null;
}

/** A converter between two systems: (x, y) -> [x, y]; null when either is unknown, identity when the same. */
export function converter(from, to) {
  if (!from || !to) return null;
  if (from === to) return (x, y) => [x, y];
  const a = defOf(from), b = defOf(to);
  if (!a || !b) return null;
  const p = proj4(a, b);
  return (x, y) => p.forward([x, y]);
}

/**
 * The 2D similarity transform (x' = a·x − b·y + tx, y' = b·x + a·y + ty) closest to `fn` over a
 * box [x0, y0, x1, y1] (least squares on a 7 × 7 grid), and its largest deviation from `fn` there (m).
 * Coordinates are taken relative to the box centre, so large map coordinates keep their precision.
 */
export function fitSimilarity(fn, [x0, y0, x1, y1]) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const [qx, qy] = fn(cx, cy);
  const N = 7, pts = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x = x0 + ((x1 - x0) * i) / (N - 1), y = y0 + ((y1 - y0) * j) / (N - 1);
    const [u, v] = fn(x, y);
    pts.push([x - cx, y - cy, u - qx, v - qy]);
  }
  // normal equations for a, b (the centre is the centroid of the grid, so tx, ty follow)
  let sxx = 0, sa = 0, sb = 0;
  for (const [x, y, u, v] of pts) { sxx += x * x + y * y; sa += x * u + y * v; sb += x * v - y * u; }
  const a = sxx ? sa / sxx : 1, b = sxx ? sb / sxx : 0;
  let mu = 0, mv = 0;
  for (const [x, y, u, v] of pts) { mu += u - (a * x - b * y); mv += v - (b * x + a * y); }
  mu /= pts.length; mv /= pts.length;
  let res = 0;
  for (const [x, y, u, v] of pts) res = Math.max(res, Math.hypot(a * x - b * y + mu - u, b * x + a * y + mv - v));
  // back to absolute coordinates: x' = a(x − cx) − b(y − cy) + qx + mu
  return { a, b, tx: qx + mu - a * cx + b * cy, ty: qy + mv - b * cx - a * cy, residual: res };
}
