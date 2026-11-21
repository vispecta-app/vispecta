// Terrain (#63, moved out of main.js): TIN from point clouds, LandXML and GeoTIFF (#45, #92),
// contour lines and cut and fill (#92).
import * as THREE from 'three';
import { loadIfcFile } from '../ifc.js';
import { t, fmtNum } from '../i18n.js';
import { BUILD } from '../version.js';
import { readAlignments, formatStation, parseStation } from '../alignment.js';
import { crsName, normalizeCrs, customDefs } from '../crs.js';
import { contourLines, planLength } from '../contours.js';
import { SurfaceIndex, cutFill } from '../volumes.js';
import { $, $$, download, h, state, toast, viewer, withLoading } from './core.js';
import { allAlignments, alnLabel, clipSegment, secViewer } from './sections.js';
import { modelTitle, renderModels } from './browser.js';
import { crsChanged } from './crs.js';
import { afterModelsChanged, checkCoordinates, checkUnits, projects } from '../main.js';
import { hasScene } from './clouds.js';

// ------------------------------------------------------------- terrain (TIN), #45
// The colour a terrain opens in (#90); *Colour by height* on its card shows the heights instead.
const TERRAIN_GREEN = '#7fa36b';
/** A model that holds only IfcGeographicElement (a terrain from Vispecta or a CAD program). */
function isTerrainModel(m) {
  if (!m.elementIds.size) return false;
  for (const id of m.elementIds) {
    if (!/^IfcGeographicElement$/i.test(m.typeName(id) || '')) return false;
    // only terrain: trees and other geographic elements keep their own colours
    let pdt = null;
    try { pdt = m.api.GetLine(m.modelID, id, false)?.PredefinedType?.value ?? null; } catch { /* unknown */ }
    if (pdt && pdt !== 'TERRAIN') return false;
  }
  return true;
}
// A terrain is built in a worker (terrain-worker.js) and written as an IFC file with an
// IfcGeographicElement (TERRAIN) and an IfcTriangulatedFaceSet, which is then opened like any model:
// it is shown, cut in sections (an open surface: a terrain line, no cut face), drawn in PDF/SVG/DXF
// and profiles, saved in projects and downloaded with *Download IFC*. It is coloured by height.
let terrainCloud = null;
function runTerrainWorker(msg, label) {
  return withLoading((progress) => new Promise((resolve, reject) => {
    const w = new Worker(new URL('../terrain-worker.js', import.meta.url), { type: 'module' });
    progress(label, 0);
    w.onmessage = ({ data }) => {
      if (data.progress !== undefined) progress(label, data.progress);
      else if (data.error) { w.terminate(); reject(new Error(data.error)); }
      else if (data.done) { w.terminate(); resolve(data.done); }
    };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message || 'Terrain worker failed')); };
    w.postMessage(msg);
  }));
}

// ------------------------------------------------------------- contour lines (#92)
// A terrain can show contour lines: thin every interval, thicker every fifth (with its height in
// plan drawings). They are computed from the triangles in IFC heights, shown in 3D, drawn in plans
// (PDF/SVG/DXF layer CONTOURS) and kept in the project. mode: false | 'auto' | interval in m.
export const CONTOUR_INTERVALS = ['off', 'auto', 0.25, 0.5, 1, 2, 5];
const CONTOUR_COLOR = '#7a5a32';
function terrainTriangles(m) {
  m.group.updateMatrixWorld(true);
  const mw = m.group.matrixWorld, v = new THREE.Vector3();
  let n = 0;
  for (const b of m.buckets) n += b.index.length;
  const out = new Float64Array(n * 3);
  let k = 0;
  for (const b of m.buckets) {
    const P = b.positions, I = b.index;
    for (let i = 0; i < I.length; i++) {
      const j = I[i] * 3;
      const q = viewer.toIfc(v.set(P[j], P[j + 1], P[j + 2]).applyMatrix4(mw));
      out[k++] = q.x; out[k++] = q.y; out[k++] = q.z;
    }
  }
  return out;
}
export function setContours(m, mode) {
  if (m.contourObj) { m.group.remove(m.contourObj); m.contourObj.geometry.dispose(); m.contourObj.material.dispose(); m.contourObj = null; }
  m.contours = mode || false;
  m.contourData = null;
  if (!mode) { viewer.invalidate(); return; }
  const data = contourLines(terrainTriangles(m), mode === 'auto' ? 0 : +mode);
  if (data.tooMany) toast(t('ter.cTooMany'));
  m.contourData = data;
  // 3D: lines a few cm above the surface, in the model's own coordinates
  const inv = m.group.matrixWorld.clone().invert();
  const pos = [], col = [];
  const minor = new THREE.Color(CONTOUR_COLOR), major = new THREE.Color('#3d2a12');
  for (const lv of data.levels) for (const line of lv.lines) for (let i = 1; i < line.length; i++) {
    for (const p of [line[i - 1], line[i]]) {
      const w = viewer.fromIfc(p[0], p[1], p[2] + 0.03).applyMatrix4(inv);
      pos.push(w.x, w.y, w.z);
      const c = lv.major ? major : minor;
      col.push(c.r, c.g, c.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const obj = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true }));
  obj.name = 'contours';
  obj.raycast = () => {}; // not picked
  m.contourObj = obj;
  m.group.add(obj);
  viewer.invalidate();
}
/** Contours of visible terrain models inside a plan drawing, as marks (layer CONTOURS). */
export function planContourMarks(box) {
  const out = [];
  const size = Math.max(box.maxX - box.minX, box.maxY - box.minY, 1);
  for (const m of viewer.models) {
    if (!m.terrain || !m.visible || !m.contourData) continue;
    for (const lv of m.contourData.levels) for (const line of lv.lines) {
      // runs of the polyline inside the drawing
      let run = null;
      const runs = [];
      for (let k = 1; k < line.length; k++) {
        const a = line[k - 1], c = line[k];
        const tt = clipSegment(a, c, box);
        if (!tt) { run = null; continue; }
        const at = (f) => [a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f];
        if (!run || tt[0] > 1e-9) { run = [at(tt[0])]; runs.push(run); }
        run.push(at(tt[1]));
        if (tt[1] < 1 - 1e-9) run = null;
      }
      for (const r of runs) {
        if (r.length < 2) continue;
        out.push({ line: r, color: CONTOUR_COLOR, w: lv.major ? 0.35 : 0.13, layer: 'CONTOURS' });
        // the height on major contours that are long enough, at the middle of the run
        if (lv.major && planLength(r) > size / 12) {
          const mid = r[Math.floor(r.length / 2)];
          out.push({ text: fmtNum(+lv.z.toFixed(2)), at: mid, dx: 0, dy: -0.6, size: 2, anchor: 'middle', color: CONTOUR_COLOR, layer: 'CONTOURS' });
        }
      }
    }
  }
  return out;
}

// ------------------------------------------------------------- cut and fill (#92)
// The existing terrain against a design surface (the top of the chosen models, e.g. the earthworks),
// sampled on a grid along an alignment: cut and fill per station range, a table, CSV and a
// difference map in 3D (red: cut, blue: fill).
let volResult = null;
export function setVolResult(v) { volResult = v; }
let volMap = null;
// chosen by default: models with an embankment (not the track, whose ballast and sleepers are no earthworks)
function isDesignDefault(m) {
  for (const id of m.elementIds) if (/^IfcEarthworksFill$/i.test(m.typeName(id) || '')) return true;
  return false;
}
export function openVolumeDialog(terrain) {
  const terrains = viewer.models.filter((m) => m.terrain);
  if (!terrains.length) return toast(t('vol.noTerrain'));
  const list = allAlignments();
  if (!list.length) return toast(t('aln.none'));
  $('#vol-existing').replaceChildren(...terrains.map((m) => h('option', { value: String(m.uid), text: modelTitle(m), selected: m === terrain })));
  const others = viewer.models.filter((m) => !m.terrain && m.elementIds.size);
  const picked = volResult?.designUids;
  $('#vol-design').replaceChildren(...others.map((m) => h('label', { class: 'chk' },
    h('input', { type: 'checkbox', value: String(m.uid), checked: picked ? picked.includes(m.uid) : isDesignDefault(m) }), h('span', { text: modelTitle(m) }))));
  const sel = $('#vol-path');
  const cur = volResult?.al || list.find((a) => !a.hidden) || list[0];
  sel.replaceChildren(...list.map((a, i) => h('option', { value: String(i), text: alnLabel(a), selected: a === cur })));
  if (!volResult) volRange();
  renderVolumes();
  $('#volume-dialog').showModal();
}
function volRange() {
  const al = allAlignments()[+$('#vol-path').value];
  if (al) { $('#vol-from').value = formatStation(al.station0); $('#vol-to').value = formatStation(al.station0 + al.length); }
}
$('#vol-path').addEventListener('change', volRange);

export async function runVolumes() {
  const al = allAlignments()[+$('#vol-path').value];
  const existing = viewer.models.find((m) => m.uid === +$('#vol-existing').value);
  const design = $$('#vol-design input:checked').map((i) => viewer.models.find((m) => m.uid === +i.value)).filter(Boolean);
  if (!al || !existing) return;
  if (!design.length) return toast(t('vol.noDesign'));
  const from = parseStation($('#vol-from').value), to = parseStation($('#vol-to').value);
  if (from === null || to === null) return toast(t('st.bad', { v: from === null ? $('#vol-from').value : $('#vol-to').value }));
  const num = (id, d) => { const v = +String($(id).value).replace(',', '.'); return Number.isFinite(v) && v >= 0 ? v : d; };
  const grid = Math.max(0.1, num('#vol-grid', 0.5)), bin = Math.max(1, num('#vol-bin', 20));
  const s0 = Math.max(0, Math.min(from, to) - al.station0), s1 = Math.min(al.length, Math.max(from, to) - al.station0);
  if (!(s1 > s0)) return toast(t('vol.empty'));
  const res = await withLoading(async (progress) => {
    progress(t('vol.running'), 0.2); await new Promise((r) => setTimeout(r, 30));
    const ex = new SurfaceIndex(terrainTriangles(existing));
    const tris = design.map((m) => terrainTriangles(m));
    const all = new Float64Array(tris.reduce((n, a) => n + a.length, 0));
    let k = 0;
    for (const a of tris) { all.set(a, k); k += a.length; }
    progress(t('vol.running'), 0.5); await new Promise((r) => setTimeout(r, 0));
    return cutFill({ al, s0, s1, left: num('#vol-left', 25), right: num('#vol-right', 25), ds: grid, dOff: grid, bin, existing: ex, design: new SurfaceIndex(all) });
  });
  volResult = { ...res, al, existing: modelTitle(existing), design: design.map(modelTitle), designUids: design.map((m) => m.uid), grid };
  showVolumeMap($('#vol-map').checked);
  renderVolumes();
}

export function showVolumeMap(on) {
  if (volMap) { viewer.scene.remove(volMap); volMap.geometry.dispose(); volMap.material.dispose(); volMap = null; }
  if (on && volResult?.samples.length) {
    const S = volResult.samples;
    const pos = new Float32Array(S.length * 3), col = new Float32Array(S.length * 3);
    const c = new THREE.Color(), cutC = new THREE.Color('#d1495b'), fillC = new THREE.Color('#2e86de'), zero = new THREE.Color('#e9ecef');
    S.forEach((p, i) => {
      const w = viewer.fromIfc(p.x, p.y, p.z + 0.05);
      pos[3 * i] = w.x; pos[3 * i + 1] = w.y; pos[3 * i + 2] = w.z;
      c.copy(zero).lerp(p.d > 0 ? fillC : cutC, Math.min(1, Math.abs(p.d) / 1.5) * 0.85 + 0.15);
      col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    volMap = new THREE.Points(g, new THREE.PointsMaterial({ size: volResult.grid * 1.4, vertexColors: true, sizeAttenuation: true }));
    volMap.name = 'cut-fill';
    volMap.raycast = () => {};
    viewer.scene.add(volMap);
  }
  viewer.invalidate();
}

export function renderVolumes() {
  const box = $('#vol-results');
  const r = volResult;
  if (!r) { box.replaceChildren(h('p', { class: 'muted small vol-hint', text: t('vol.hint') })); return; }
  if (!r.area) { box.replaceChildren(h('p', { class: 'muted small vol-hint', text: t('vol.none') })); return; }
  const m3 = (v) => fmtNum(Math.round(v));
  const tile = (cls, label, value, unit) => h('div', { class: `vol-tile ${cls}` }, h('small', { text: label }), h('b', { text: `${value} ${unit}`, title: `${value} ${unit}` }));
  let cc = 0, cf = 0;
  box.replaceChildren(
    h('div', { class: 'vol-tiles', title: t('vol.summary', { cut: m3(r.cut), fill: m3(r.fill), net: m3(r.fill - r.cut), area: m3(r.area) }) },
      tile('cut', t('vol.tCut'), m3(r.cut), 'm³'), tile('fill', t('vol.tFill'), m3(r.fill), 'm³'),
      Object.assign(tile('net', t('vol.tNet'), m3(r.fill - r.cut), 'm³'), { title: t('vol.netTitle') }), tile('area', t('vol.tArea'), m3(r.area), 'm²')),
    h('div', { class: 'vol-scroll' }, h('table', { class: 'cor-table' },
      h('thead', {}, h('tr', {}, ...[t('vol.colFrom'), t('vol.colTo'), t('vol.colCut'), t('vol.colFill'), t('vol.colNet'), t('vol.colCumCut'), t('vol.colCumFill')].map((x) => h('th', { text: x })))),
      h('tbody', {},
        r.bins.map((b) => {
          cc += b.cut; cf += b.fill;
          return h('tr', {},
            h('td', { text: formatStation(r.al.station0 + b.from) }), h('td', { text: formatStation(r.al.station0 + b.to) }),
            h('td', { text: m3(b.cut) }), h('td', { text: m3(b.fill) }), h('td', { text: m3(b.fill - b.cut) }), h('td', { text: m3(cc) }), h('td', { text: m3(cf) }));
        }),
        h('tr', { class: 'vol-total' }, h('td', { text: t('vol.total') }), h('td', { text: '' }),
          h('td', { text: m3(r.cut) }), h('td', { text: m3(r.fill) }), h('td', { text: m3(r.fill - r.cut) }), h('td', { text: '' }), h('td', { text: '' }))))),
    h('p', { class: 'muted small', text: t('vol.note', { ex: r.existing, de: r.design.join(', '), g: fmtNum(r.grid) }) }));
}

export function volumeCsv() {
  const r = volResult;
  if (!r) return toast(t('vol.hint'));
  const q = (v) => (typeof v === 'number' ? v.toFixed(3) : `"${String(v).replace(/"/g, '""')}"`);
  const rows = [['station_from', 'station_to', 'area_m2', 'cut_m3', 'fill_m3', 'net_m3', 'cum_cut_m3', 'cum_fill_m3']];
  let cc = 0, cf = 0;
  for (const b of r.bins) { cc += b.cut; cf += b.fill; rows.push([formatStation(r.al.station0 + b.from), formatStation(r.al.station0 + b.to), b.area, b.cut, b.fill, b.fill - b.cut, cc, cf]); }
  rows.push(['total', '', r.area, r.cut, r.fill, r.fill - r.cut, r.cut, r.fill]);
  download(`cut-fill-${r.al.name}.csv`, rows.map((x) => x.map(q).join(';')).join('\n'), 'text/csv');
}

/** The project's coordinate system for the terrain worker: GeoTIFF and LandXML are converted into it (#107). */
function workerCrs() {
  return viewer.projectCrs ? { to: viewer.projectCrs, defs: customDefs([viewer.projectCrs]) } : null;
}

/** The georeference written into the terrain file: the map conversion the models use. */
function terrainGeoref() {
  const mm = viewer.mapModel();
  return mm?.georef?.map && (mm.lengthScale || 1) === 1 ? { map: mm.georef.map } : null;
}

async function openTerrain(res, name) {
  const file = new File([res.ifc], `${name}.ifc`, { type: 'application/x-step' });
  const before = new Set(viewer.models);
  await openIfcFiles([file], null, { fit: hasScene() ? false : true });
  const m = viewer.models.find((x) => !before.has(x));
  if (!m) return;
  m.terrain = true;
  renderModels();
  secViewer?.planesChanged?.();
  toast(t('ter.done', { name, n: fmtNum(res.triangles), p: fmtNum(res.points) }), true);
}

export function openTerrainDialog(cloud) {
  terrainCloud = cloud;
  const ground = cloud.classCounts.get(2) || 0;
  $('#ter-cloud').textContent = `${cloud.label} · ${t('pc.points', { n: fmtNum(cloud.count) })}`;
  const srcSel = $('#ter-source');
  srcSel.options[0].disabled = !ground;
  srcSel.options[0].textContent = `${t('ter.srcGround')}${ground ? ` · ${fmtNum(ground)}` : ` – ${t('ter.noGround')}`}`;
  srcSel.value = ground ? 'ground' : 'filter';
  updateTerrainEstimate();
  $('#terrain-dialog').showModal();
}
function updateTerrainEstimate() {
  const c = terrainCloud;
  if (!c) return;
  const g = Math.max(0.05, +$('#ter-grid').value || 1);
  const b = c.getBox().getSize(new THREE.Vector3());
  const cells = Math.round((b.x * b.z) / (g * g)); // viewer x and z are the plan
  $('#ter-estimate').textContent = t('ter.estimate', { n: fmtNum(Math.min(cells, $('#ter-source').value === 'ground' ? c.classCounts.get(2) || 0 : c.count)) });
}
for (const id of ['#ter-grid', '#ter-source']) $(id).addEventListener('input', updateTerrainEstimate);

export async function buildTerrain() {
  const c = terrainCloud;
  if (!c) return;
  const grid = +$('#ter-grid').value || 1, maxEdge = +$('#ter-maxedge').value || 0;
  $('#terrain-dialog').close();
  const name = `${c.label.replace(/\.[^.]+$/, '')} – ${t('ter.suffix')}`;
  try {
    // a COPC cloud: an even sample of all of it (the view may show only a part, #52)
    const pts = c.stream ? await withLoading((progress) => c.stream.sample(c.stream.budget, (f) => progress(t('pc.loading', { name: c.label }), f))) : c;
    const res = await runTerrainWorker({
      cloud: { positions: pts.positions, classes: pts.classes, hidden: [...c.hiddenClasses], toIfc: c.toIfcMatrix.elements },
      grid, maxEdge, source: $('#ter-source').value, name, georef: terrainGeoref(),
    }, t('ter.building', { name: c.label }));
    await openTerrain(res, name);
  } catch (err) {
    console.error(err);
    toast(t('ter.failed', { name: c.label, error: err.message || err }));
  }
}

/**
 * LandXML is in map coordinates (N E H) or in the IFC coordinates of the models: like a point
 * cloud, the one that lands nearer the models is used. Returns the map -> IFC matrix or null (as is).
 */
function landXmlPlacement(text) {
  const toIfc = viewer.mapToIfcMatrix();
  // a file that names its coordinate system, with a project system: map coordinates, converted (#107)
  if (toIfc && viewer.projectCrs && normalizeCrs(/<CoordinateSystem\b[^>]*>/i.exec(text)?.[0]?.replace(/^.*?epsgCode="(\d+)".*$/s, 'EPSG:$1'))) return toIfc;
  const p = /<P\b[^>]*>\s*([-\d.eE+]+)[\s,]+([-\d.eE+]+)[\s,]+([-\d.eE+]+)/.exec(text);
  const box = viewer.sceneBox({ visibleOnly: false, clouds: true });
  if (!toIfc || !p || box.isEmpty()) return toIfc;
  const c = viewer.toIfc(box.getCenter(new THREE.Vector3()));
  const raw = new THREE.Vector3(+p[2], +p[1], +p[3]);
  const map = raw.clone().applyMatrix4(toIfc);
  return Math.hypot(map.x - c.x, map.y - c.y) < Math.hypot(raw.x - c.x, raw.y - c.y) ? toIfc : null;
}

export async function terrainFromLandXml(file) {
  const name = file.name.replace(/\.xml$/i, '');
  try {
    const text = await file.text();
    const res = await runTerrainWorker({
      landxml: text, toIfc: landXmlPlacement(text)?.elements || null, maxEdge: 0, name, georef: terrainGeoref(), crs: workerCrs(),
    }, t('ter.reading', { name: file.name }));
    await openTerrain(res, name);
  } catch (err) {
    console.error(err);
    toast(t('ter.failed', { name: file.name, error: err.message || err }));
  }
}

/**
 * A height model as GeoTIFF (e.g. the Danish DHM/Terræn from Dataforsyningen, #92): read in the
 * worker, cut to the models with 50 m around them when the raster covers them, resampled to at most
 * 1.5 million cells, and opened as a terrain like a TIN from a point cloud.
 */
export async function terrainFromGeoTiff(file) {
  const name = file.name.replace(/\.tiff?$/i, '');
  try {
    const buf = await file.arrayBuffer();
    const toIfc = viewer.mapToIfcMatrix();
    let clip = null;
    const box = viewer.sceneBox({ visibleOnly: false, clouds: true });
    if (toIfc && !box.isEmpty()) {
      const inv = toIfc.clone().invert();
      const a = viewer.toIfc(box.min).applyMatrix4(inv), b = viewer.toIfc(box.max).applyMatrix4(inv);
      clip = [Math.min(a.x, b.x) - 50, Math.min(a.y, b.y) - 50, Math.max(a.x, b.x) + 50, Math.max(a.y, b.y) + 50];
    }
    const res = await runTerrainWorker({ geotiff: buf, toIfc: toIfc?.elements || null, clip, maxCells: 1500000, name, georef: terrainGeoref(), crs: workerCrs() },
      t('ter.reading', { name: file.name }));
    await openTerrain(res, name);
    if (res.converted) toast(t('crs.convertedToast', { name: file.name, from: crsName(res.crs), to: crsName(viewer.projectCrs) }), true);
    toast(t('ter.rasterInfo', { w: fmtNum(res.raster[0]), h: fmtNum(res.raster[1]), c: fmtNum(+res.cell.toFixed(2)) }), true);
  } catch (err) {
    console.error(err);
    toast(t('ter.failed', { name: file.name, error: err.message || err }));
  }
}

/**
 * A terrain model as LandXML 1.2 (#92): its triangles as a TIN surface, in map coordinates (N E H)
 * when the models are georeferenced, else in IFC coordinates.
 */
export function terrainLandXml(m) {
  const tris = terrainTriangles(m);
  const fromIfc = viewer.mapToIfcMatrix()?.invert() || null;
  const v = new THREE.Vector3();
  const ids = new Map(), pts = [], faces = [];
  const r3 = (x) => (Math.round(x * 1000) / 1000).toFixed(3);
  for (let i = 0; i < tris.length; i += 9) {
    const f = [];
    for (let k = 0; k < 3; k++) {
      v.set(tris[i + 3 * k], tris[i + 3 * k + 1], tris[i + 3 * k + 2]);
      if (fromIfc) v.applyMatrix4(fromIfc);
      const key = `${r3(v.y)} ${r3(v.x)} ${r3(v.z)}`; // LandXML: northing easting elevation
      let id = ids.get(key);
      if (id === undefined) { id = pts.length + 1; ids.set(key, id); pts.push(key); }
      f.push(id);
    }
    if (f[0] !== f[1] && f[1] !== f[2] && f[0] !== f[2]) faces.push(f.join(' '));
  }
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const nm = esc(m.alias || m.name.replace(/\.ifc$/i, ''));
  const crs = viewer.projectCrs || viewer.mapModel()?.georef?.map?.crs;
  const epsg = /^EPSG:(\d+)$/.exec(viewer.projectCrs || '')?.[1];
  const now = new Date();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2" version="1.2" date="${now.toISOString().slice(0, 10)}" time="${now.toISOString().slice(11, 19)}">
  <Units><Metric linearUnit="meter" areaUnit="squareMeter" volumeUnit="cubicMeter" angularUnit="decimal degrees" directionUnit="decimal degrees"/></Units>
${crs && fromIfc ? `  <CoordinateSystem name="${esc(crsName(crs) || crs)}"${epsg ? ` epsgCode="${epsg}"` : ''}/>\n` : ''}  <Application name="Vispecta" manufacturer="Vispecta" version="${esc(BUILD.version || '')}"/>
  <Surfaces>
    <Surface name="${nm}">
      <Definition surfType="TIN">
        <Pnts>
${pts.map((p, i) => `          <P id="${i + 1}">${p}</P>`).join('\n')}
        </Pnts>
        <Faces>
${faces.map((f) => `          <F>${f}</F>`).join('\n')}
        </Faces>
      </Definition>
    </Surface>
  </Surfaces>
</LandXML>
`;
  download(`${m.name.replace(/\.ifc$/i, '')}.xml`, xml, 'application/xml');
  toast(t('ter.lxDone', { p: fmtNum(pts.length), f: fmtNum(faces.length), crs: fromIfc ? t('ter.lxMap') : t('ter.lxIfc') }), true);
}

export async function openIfcFiles(list, keys = null, { fit = true } = {}) {
  const before = viewer.models.length;
  await withLoading(async (progress) => {
    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      const prefix = list.length > 1 ? `(${i + 1}/${list.length}) ` : '';
      try {
        // the file's fingerprint finds its stored geometry and links it to the current project
        let key = keys?.[i] || null;
        if (!key && projects.enabled) { try { key = await projects.keyOf(file); } catch { key = null; } }
        const model = await loadIfcFile(file, { onProgress: (msg, frac) => progress(prefix + msg, (i + frac) / list.length), geometryCache: key ? projects.geometryCacheFor(key) : null });
        model.indexCache = key ? projects.indexCacheFor(key) : null; // the filter index, kept per file (#61)
        model.crs = model.crsDetected = normalizeCrs(model.georef?.map?.crs); // its map coordinate system (#107)
        viewer.addModel(model);
        checkUnits(model);
        if (key) projects.modelAdded(model, file, key);
        try { model.alignments = await readAlignments(model); } catch (e) { console.warn('alignments', e); model.alignments = []; }
        for (const a of model.alignments) a.ifcName = a.name; // the name in the file; an alias replaces `name` (#89)
        // tell when the file is cut off or has nothing to show, instead of silently showing less
        if (model.truncated) toast(t('msg.truncated', { name: file.name, n: fmtNum(model.elementIds.size) }));
        else if (!model.elementIds.size && !model.alignments.length) toast(t('msg.noGeometry', { name: file.name }));
        // Build the picking index (BVH) in the background so the first click is instant
        // (not for a model that was closed again in the meantime: that would cost seconds for nothing)
        setTimeout(() => { if (!viewer.models.includes(model)) return; try { model.pickTargets(); } catch { /* built on first pick instead */ } }, 300);
        if (state.spacesVisible) model.show(model.spaceIds);
        if (isTerrainModel(model)) { model.terrain = true; model.setBaseColor(TERRAIN_GREEN); } // natural green; height colours on the card (#90)
      } catch (err) {
        console.error(err);
        toast(t('msg.loadFailed', { name: file.name, error: err.message || err }));
      }
    }
  });
  crsChanged();
  afterModelsChanged();
  if (fit) viewer.fitBox(viewer.sceneBox(), { keepDirection: before > 0 });
  checkCoordinates();
}

