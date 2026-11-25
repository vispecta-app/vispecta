// The app's user interface: start-up, opening files, the toolbar and its menus, selection, the
// tree and properties, projects, measuring, merge, Python, the status bar and undo. The larger
// areas live in src/app/ (#63): core.js (shared helpers and state) and one module per area; they
// import from each other and from here, so only functions are used across the cycle at start-up.
import * as THREE from 'three';
// Typefaces of the visual identity, bundled with the app (no requests to font services);
// Latin and Latin Extended cover the European languages, the rest falls back to system fonts
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-ext-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-ext-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-ext-600.css';
import '@fontsource/space-grotesk/latin-500.css';
import '@fontsource/space-grotesk/latin-ext-500.css';
import '@fontsource/space-grotesk/latin-600.css';
import '@fontsource/space-grotesk/latin-ext-600.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-ext-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-ext-500.css';
// Vispecta – user interface.
import { loadIfcFile } from './ifc.js';
import { isSpatialType, KIND_TYPES, COLOR_STYLES, colorStyle, OKABE_ITO } from './model.js';
import { t, getLang, setLang, applyStaticTranslations, fmtNum, decimalSign } from './i18n.js';
import { PythonPanel } from './scripting.js';
import { MeasureTool } from './measure.js';
import { WalkMode } from './walk.js';
import { ViewsPanel } from './views.js';
import { QtoTable } from './qto.js';
import { mergeIfcBlobs } from './merge.js';
import { splitIfcBlob } from './split.js';
import { closeNotes, initNotes, notes, notesActions, notesCancel, notesClick, toggleNotes } from './app/notes.js';
import { ContextMenu } from './contextmenu.js';
import { renderVersion } from './version.js';
import { ProjectManager } from './projects.js';
import { History } from './history.js';
import { FilterPanel } from './filters.js';
import { IssuesPanel } from './issues.js';
import { AlignmentLayer, pointAt, heightAt, formatStation, setStationFormat, stationFormat, STATION_FORMATS } from './alignment.js';
import { customDefs, addDefs } from './crs.js';
import { ViewCube } from './viewcube.js';
import { initA11y } from './a11y.js';
import { initFloating } from './floating.js';
import { setIdsColors } from './ids.js';
import { showComparison, setCompareColors } from './compare.js';
import { $, $$, EYE, EYE_OFF, PALETTE, addCloseX, download, h, state, toast, viewer, withLoading } from './app/core.js';
import { comparison, dropStaleChecks, endComparison, openCompareDialog, openIdsDialog, renderComparison, runCompare, runIds } from './app/checks.js';
import { annotEdits, exportDrawing, openDrawingDialog, renderPresetSelect, userPresets } from './app/drawing.js';
import { closeDrive, drive, drivePose, exportProfile, openDrive, openProfileDialog, profilePath, setDrivePlaying, showProfile } from './app/profile.js';
import { confirmRemoveLine, drawnPaths, finishLineTool, lineEditor, lineTool, lineToolClick, makePath, pathPoints, removeDrawnPath, startLineTool } from './app/lines.js';
import { addStationPlane, allAlignments, autoSecView, renderPlanes, secViewer } from './app/sections.js';
import { groupOf, modelTitle, newModelGroup, renderModels } from './app/browser.js';
import { crsChanged, projectCrsChosen, setProjectCrsChosen } from './app/crs.js';
import { buildTerrain, openIfcFiles, renderVolumes, runVolumes, setContours, setVolResult, showVolumeMap, terrainFromGeoTiff, terrainFromLandXml, volumeCsv } from './app/terrain.js';
import { CLOUD_FILE, cloudSettings, cloudsChanged, fileHandles, fileId, hasScene, openCloudFiles, restoreCloudSettings, setEdl } from './app/clouds.js';
import { corridor, findInCorridor, openCorridorDialog, renderCorridorHits, setCorridorHits, showCorridor } from './app/corridor.js';
import { clearGauge, gaugeState, openClearanceDialog, restoreGauge, runClearance, showGauge } from './app/clearance.js';
import { openCopyPset } from './app/copypset.js';



export const measure = new MeasureTool(viewer, $('#viewport'));
// view cube (#84): top right corner, can be turned off under View (remembered)
const VIEWCUBE_KEY = 'onlineifc.viewcube';
const viewCube = new ViewCube(viewer, { onHome: () => viewer.setView('iso') });
// floating panels can be moved by their header, and stay clear of the view cube
const floating = initFloating($('#viewport'), { avoid: () => [viewCube.el] });
function setViewCube(on) {
  viewCube.setVisible(on);
  floating.settleAll();
  try { localStorage.setItem(VIEWCUBE_KEY, on ? '1' : '0'); } catch { /* ignore */ }
  const c = document.getElementById('settings-viewcube');
  if (c) c.checked = on;
}
export const walk = new WalkMode(viewer);
walk.addEventListener('change', () => {
  $('#viewport').classList.toggle('walking', walk.active);
  if (walk.active) { if (measure.mode) setMeasureMode(null); toast(t('msg.walkHelp'), true); }
  renderStatus();
});
walk.addEventListener('speed', () => renderStatus());
const alignmentLayer = new AlignmentLayer(viewer, $('#viewport'));
measure.alignments = alignmentLayer;

// ===================================================================== language
$('#lang-select').value = getLang();
$('#lang-select').addEventListener('change', async (e) => {
  // the language is loaded first (a small file); when that fails (offline), the current one stays
  if (!(await setLang(e.target.value))) { e.target.value = getLang(); return; }
  applyStaticTranslations();
  python.translate();
  measure.refresh();
  viewCube.relabel();
  renderAll();
  a11y.relabel();
});
for (const d of $$('dialog')) addCloseX(d);
applyStaticTranslations();
// roles, keyboard use and names for screen readers (#62)
const a11y = initA11y({ t, canvas: viewer.renderer.domElement, closeMenus: () => closeMenus() });

// ======================================================================== theme
const THEME_KEY = 'onlineifc.theme';
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
function currentTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch { /* ignore */ }
  return saved === 'dark' || saved === 'light' ? saved : darkQuery.matches ? 'dark' : 'light';
}
function applyTheme() {
  document.documentElement.dataset.theme = currentTheme();
}
darkQuery.addEventListener?.('change', applyTheme);
applyTheme();

// =================================================================== side panels
// On small screens the panels are drawers over the 3D view: closed from the start, one at a time,
// and their state is not remembered.
const narrow = window.matchMedia('(max-width: 900px)');
function setPanelHidden(side, hidden) {
  document.body.classList.toggle(`hide-${side}`, hidden);
  $(`.panel-reopen.${side}`).hidden = !hidden;
  if (narrow.matches) {
    const other = side === 'left' ? 'right' : 'left';
    if (!hidden && !document.body.classList.contains(`hide-${other}`)) setPanelHidden(other, true);
    return;
  }
  try { localStorage.setItem(`onlineifc.hide-${side}`, hidden ? '1' : ''); } catch { /* ignore */ }
}
function restorePanels() {
  for (const side of ['left', 'right']) {
    let v = '';
    try { v = localStorage.getItem(`onlineifc.hide-${side}`) || ''; } catch { /* ignore */ }
    setPanelHidden(side, narrow.matches || v === '1');
  }
}
restorePanels();
narrow.addEventListener?.('change', restorePanels);

// ======================================================================== files

async function openFiles(files) {
  const all = [...files];
  const list = all.filter((f) => /\.ifc$/i.test(f.name));
  const workspaces = all.filter((f) => /\.json$/i.test(f.name));
  const bcfs = all.filter((f) => /\.(bcf|bcfzip)$/i.test(f.name));
  // .xml: an IDS file while the IDS dialog is open, else a LandXML surface (terrain, #45) when it is one
  const xmls = all.filter((f) => /\.xml$/i.test(f.name) && !$('#ids-dialog').open);
  const landxmls = [];
  for (const f of xmls) { try { if (/<LandXML\b/i.test(await f.slice(0, 4096).text())) landxmls.push(f); } catch { /* not readable */ } }
  const idss = all.filter((f) => /\.ids$/i.test(f.name) || (/\.xml$/i.test(f.name) && $('#ids-dialog').open));
  const clouds = all.filter((f) => CLOUD_FILE.test(f.name)); // point clouds (#27)
  const tiffs = all.filter((f) => /\.tiff?$/i.test(f.name)); // height models (DHM GeoTIFF, #92)
  const rest = all.filter((f) => ![list, workspaces, bcfs, idss, clouds, landxmls, tiffs].some((g) => g.includes(f)));
  if (rest.length) toast(t('msg.unknownFiles', { names: rest.map((f) => f.name).join(', ') }));
  if (!list.length && !workspaces.length && !bcfs.length && !idss.length && !clouds.length && !landxmls.length && !tiffs.length) return;
  if (list.length) await openIfcFiles(list);
  if (clouds.length) await openCloudFiles(clouds);
  for (const f of landxmls) await terrainFromLandXml(f);
  for (const f of tiffs) await terrainFromGeoTiff(f);
  for (const w of workspaces) await views.openWorkspace(w);
  for (const b of bcfs) {
    await issues.importFile(b);
    $('.tab[data-tab="issues"]').click();
  }
  if (idss.length) {
    // put the IDS file into the IDS dialog and open it
    const dt = new DataTransfer();
    dt.items.add(idss[0]);
    if (!$('#ids-dialog').open) openIdsDialog();
    if ($('#ids-dialog').open) $('#ids-file').files = dt.files;
  }
}

// "Try it with sample models": the site serves the sample files itself (public/samples) and they are
// opened like local files.
// - scene: buildingSMART's IFC 4.3 sample scene (CC BY 4.0) with Vispecta's alignments Track and
//   Road, grouped into infrastructure and building
// - cbbt: the Chesapeake Bay Bridge-Tunnel test model from buildingSMART's community samples (MIT,
//   synthetic, geometry from OpenStreetMap) – 26 MB, two alignments of 31 km (#41)
// - rail: Vispecta's fictitious double-track railway after Banedanmark norms, one IFC file per
//   discipline and a survey point cloud (LAZ in UTM coordinates), opened at the bridge
const SAMPLES = {
  scene: {
    dir: 'samples/simple-scene/',
    files: ['Infra-Bridge', 'Infra-Electrical', 'Infra-Landscaping', 'Infra-Plumbing', 'Infra-Rail', 'Infra-Alignment', 'Infra-Road', 'Building-Architecture', 'Building-Hvac', 'Building-Landscaping', 'Building-Structural'],
    groups: [['samples.infra', /^Infra-/], ['samples.building', /^Building-/]],
  },
  cbbt: {
    dir: 'samples/chesapeake/',
    files: ['chesapeake_bay_bridge_tunnel_4x3'],
    // the corridor is 31 km long: start at Island #1 (station 6+083 on the northbound alignment)
    focus: { station: 6083, back: 120, side: 90, up: 70 },
  },
  rail: {
    dir: 'samples/double-track-railway/',
    files: ['01-Alignment', '02-Track', '03-Earthworks', '04-Drainage', '05-Bridge', '06-Overhead-line', '07-Cables', '08-Terrain', '09-Landscape'],
    clouds: ['10-Survey.laz'],
    groups: [['samples.grpTrack', /^0[1267]-/], ['samples.grpCivil', /^0[345]-/], ['samples.grpLand', /^0[89]-/]],
    // the bridge at 12+195–12+215, from the north-west, a little above the line
    focus: { station: 12205, back: 28, side: 30, up: 9 },
  },
};
async function openSamples(key = 'scene') {
  const set = SAMPLES[key] || SAMPLES.scene;
  let files, clouds;
  try {
    [files, clouds] = await withLoading(async (progress) => {
      let done = 0;
      const names = [...set.files.map((n) => `${n}.ifc`), ...(set.clouds || [])];
      progress(t('samples.loading'), 0);
      const all = await Promise.all(names.map(async (name) => {
        const res = await fetch(`${set.dir}${name}`);
        if (!res.ok) throw new Error(`${name}: ${res.status}`);
        const file = new File([await res.blob()], name, { type: /\.ifc$/i.test(name) ? 'application/x-step' : 'application/octet-stream' });
        progress(t('samples.loading'), ++done / names.length);
        return file;
      }));
      return [all.slice(0, set.files.length), all.slice(set.files.length)];
    });
  } catch (err) { toast(t('samples.failed', { error: err.message || err })); return; }
  const before = new Set(viewer.models);
  await openIfcFiles(files);
  if (clouds.length) await openCloudFiles(clouds);
  const added = viewer.models.filter((m) => !before.has(m));
  for (const [name, re] of set.groups || []) {
    const models = added.filter((m) => re.test(m.name));
    if (!models.length) continue;
    const g = { id: `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, name: t(name), visible: true, open: true };
    state.modelGroups.push(g);
    for (const m of models) { m.groupId = g.id; m.setGroupHidden(false); }
  }
  afterModelsChanged();
  const al = set.focus && added.flatMap((m) => m.alignments || [])[0];
  if (al) {
    // look at a point of the alignment from behind, to the side and above
    const { station, back, side, up } = set.focus;
    const p = pointAt(al, station - al.station0);
    const z = heightAt(al, station - al.station0) ?? 0;
    const at = viewer.fromIfc(p.x, p.y, z);
    const eye = viewer.fromIfc(p.x - p.dx * back - p.dy * side, p.y - p.dy * back + p.dx * side, z + up);
    viewer.flyTo(eye, at); // replaces the zoom to everything that loading started
  }
  projects.touch?.();
}

// ------------------------------------------------------------- length units
// Some exporters write a length unit that does not match the coordinates (e.g. "millimetre" while
// the coordinates are metres). Such a model is shown 1000× too small and far from the others, and the
// view breaks down when zooming. checkUnits() detects the obvious cases and corrects them.
const UNIT_SCALES = [1, 0.001, 0.01, 0.3048];
const unitLabel = (sc) => ({ 1: 'm', 0.001: 'mm', 0.01: 'cm', 0.3048: 'ft' })[+sc.toPrecision(6)] || `${+sc.toPrecision(4)} m`;

/** The model's local origin in metres (as it would be with the unit correction f). */
function modelOrigin(m, f = m.unitFix) {
  return new THREE.Vector3().setFromMatrixPosition(m.rawCoordMatrix.clone().invert()).multiplyScalar(f);
}
/** Corrections that turn the declared unit into one of the usual ones. */
function unitCandidates(m) {
  const s = m.declaredLengthScale ?? 1;
  return UNIT_SCALES.filter((r) => Math.abs(r - s) / r > 1e-6).map((r) => r / s);
}

// ------------------------------------------------------------- coordinates far apart (#28)
// Models of one project overlap or touch, even long track models. After loading, the models are
// grouped by the gap between their boxes (not their centres); a group more than `coordWarnM` from
// the main group probably uses another coordinate system or project base point.
let coordWarnM = 1000;
try { const v = +localStorage.getItem('onlineifc.coordWarnM'); if (v > 0) coordWarnM = v; } catch { /* ignore */ }

function boxGap(a, b) {
  const dx = Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x);
  const dy = Math.max(0, a.min.y - b.max.y, b.min.y - a.max.y);
  const dz = Math.max(0, a.min.z - b.max.z, b.min.z - a.max.z);
  return Math.hypot(dx, dy, dz);
}

/** Why a model may lie apart from the others (an i18n key), from its georeferencing and the offset. */
function farCause(m, others) {
  const mine = !!m.georef?.map, theirs = others.some((o) => o.georef?.map);
  if (mine && !theirs) return 'coord.causeMapThis';
  if (!mine && theirs) return 'coord.causeMapOthers';
  if (mine && others.every((o) => o.georef?.map)) {
    // all georeferenced: in different map coordinate systems (CRS), or far apart in the same one
    const crs = (x) => x.georef.map.crs || '';
    const theirsCrs = [...new Set(others.map(crs).filter(Boolean))];
    if (crs(m) && theirsCrs.length && !theirsCrs.includes(crs(m))) return { key: 'coord.causeCrs', vars: { mine: crs(m), theirs: theirsCrs.join(', ') } };
    return 'coord.causeMapApart';
  }
  // the offset between the models is about the eastings/northings of a map conversion: one model is
  // in map coordinates, the other in local coordinates
  const c = (x) => viewer.toIfc(x.getBox().getCenter(new THREE.Vector3())); // IFC coordinates, as placed
  const a = c(m), d = Math.hypot(...['x', 'y'].map((k) => a[k] - (others.reduce((s, o) => s + c(o)[k], 0) / others.length)));
  for (const g of [m, ...others].map((x) => x.georef?.map).filter(Boolean)) {
    const en = Math.hypot(g.eastings * g.mapScale, g.northings * g.mapScale);
    if (en > 0 && Math.abs(d - en) < en * 0.02) return 'coord.causeMapLocal';
  }
  return 'coord.causeBase';
}

/**
 * The box of a model in the coordinates it claims: map coordinates (easting, northing, height)
 * when it has an IfcMapConversion, else its IFC coordinates. Two georeferenced models with local
 * IFC coordinates around 0,0 can lie far apart on the map; a model without a map conversion next
 * to one with it shows as far apart when it is placed in local coordinates. null: no geometry.
 */
function claimedBox(m) {
  const b = m.getBox();
  if (b.isEmpty()) return null;
  const out = new THREE.Box3();
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
    const q = viewer.toIfc(new THREE.Vector3(x, y, z));
    const mp = m.georef?.map ? m.toMap(q) : null;
    out.expandByPoint(mp ? new THREE.Vector3(mp.e, mp.n, mp.h) : new THREE.Vector3(q.x, q.y, q.z));
  }
  return out;
}

export const causeText = (c) => (typeof c === 'string' ? t(c) : t(c.key, c.vars));

export function checkCoordinates({ announce = true } = {}) {
  const boxes = new Map();
  for (const m of viewer.models) { const b = m.visible ? claimedBox(m) : null; if (b) boxes.set(m, b); }
  const ms = [...boxes.keys()];
  for (const m of viewer.models) if (!boxes.has(m)) m.coordWarning = null;
  // groups: models whose boxes are within coordWarnM of each other (single linkage)
  const groups = [];
  for (const m of ms) {
    const near = groups.filter((g) => g.some((o) => boxGap(boxes.get(m), boxes.get(o)) <= coordWarnM));
    const merged = [m, ...near.flat()];
    for (const g of near) groups.splice(groups.indexOf(g), 1);
    groups.push(merged);
  }
  const prev = new Map(viewer.models.map((m) => [m, m.coordWarning]));
  for (const m of ms) m.coordWarning = null;
  if (groups.length > 1) {
    // the main group: the most models, then the largest extent
    const size = (g) => g.reduce((b, m) => b.union(boxes.get(m)), new THREE.Box3()).getSize(new THREE.Vector3()).length();
    groups.sort((a, b) => b.length - a.length || size(b) - size(a));
    const main = groups[0];
    for (const g of groups.slice(1)) {
      for (const m of g) {
        const d = Math.min(...main.map((o) => boxGap(boxes.get(m), boxes.get(o))));
        m.coordWarning = { km: d / 1000, cause: farCause(m, main), dismissed: prev.get(m)?.dismissed || false };
      }
    }
  }
  if (announce) {
    const fresh = ms.filter((m) => m.coordWarning && !prev.get(m));
    for (const m of fresh.slice(0, 3)) toast(`${t('coord.far', { name: m.alias || m.name, km: m.coordWarning.km.toFixed(1) })} ${causeText(m.coordWarning.cause)}`);
  }
  renderModels();
}

export function checkUnits(model) {
  const others = viewer.models.filter((m) => m !== model);
  const near = (a, fa, b, fb) => modelOrigin(a, fa).distanceTo(modelOrigin(b, fb));
  const toMetre = (m, f) => Math.abs((m.declaredLengthScale ?? 1) * f - 1) < 1e-6;
  let fix = null;
  // 1) on its own: a model of a few metres whose origin lies at projected coordinates (≥ 100 km)
  //    once corrected, or a model of thousands of kilometres
  if (model.unitFix === 1) {
    const size = model.getBox().getSize(new THREE.Vector3()).length();
    for (const f of unitCandidates(model)) {
      const o = modelOrigin(model, f);
      const horiz = Math.max(Math.abs(o.x), Math.abs(o.z));
      if (f > 1 && size < 50 && size * f < 50000 && horiz >= 1e5 && horiz < 2e7) { fix = { model, f }; break; }
      if (f < 1 && size > 1e6 && size * f < 1e5) { fix = { model, f }; break; }
    }
  }
  // 2) compared with the models already loaded: one is very far away, and a unit correction (of
  //    this model or of the other one) brings them together. Corrections to metres are preferred.
  if (!fix && others.length) {
    const d0 = Math.min(...others.map((o) => near(model, model.unitFix, o, o.unitFix)));
    if (d0 > 20000) {
      let best = { score: Infinity };
      // both origins must be at projected coordinates (≥ 100 km from 0,0): scaling moves everything
      // towards 0,0, so a model at a local origin would otherwise "attract" any other model
      const far = (m, f) => { const o = modelOrigin(m, f); return Math.hypot(o.x, o.z) >= 1e5; };
      const consider = (d, m, f) => {
        if (!far(m, f) || !others.concat(model).filter((x) => x !== m).some((x) => far(x, x.unitFix))) return;
        const score = d * (toMetre(m, f) ? 1 : 10); if (d < 5000 && d < d0 / 50 && score < best.score) best = { score, model: m, f };
      };
      for (const o of others) {
        for (const f of unitCandidates(model)) consider(near(model, f, o, o.unitFix), model, f);
        for (const g of unitCandidates(o)) consider(near(model, model.unitFix, o, g), o, g);
      }
      if (best.model) fix = best;
    }
  }
  if (!fix) return;
  viewer.setUnitFix(fix.model, fix.f);
  const declared = fix.model.declaredLengthScale ?? 1;
  toast(t('units.fixed', { name: fix.model.name, declared: unitLabel(declared), shown: unitLabel(declared * fix.f) }));
}

/** Loads IFC bytes (e.g. produced by Python) into the viewer, optionally replacing a model. */
async function loadBytes(name, data, { replace = null } = {}) {
  const blob = data instanceof Blob ? data : new Blob([data]);
  let key = null;
  if (projects.enabled) { try { key = await projects.keyOf(blob); } catch { key = null; } }
  const model = await withLoading((progress) => loadIfcFile({ name, data: blob }, { onProgress: progress, geometryCache: key ? projects.geometryCacheFor(key) : null }));
  if (key) { if (replace) projects.modelReplaced(replace, model, blob, key); else projects.modelAdded(model, blob, key); }
  if (replace) {
    viewer.replaceModel(replace, model);
    // Express IDs survive the round trip through IfcOpenShell, so the selection can be kept
    const prev = state.selection.get(replace);
    state.selection.delete(replace);
    if (prev) {
      const kept = [...prev].filter((id) => model.elementIds.has(id) || model.parent.has(id));
      if (kept.length) state.selection.set(model, new Set(kept));
    }
    if (state.active?.model === replace) state.active = { model, id: state.active.id };
    searchIndex.delete(replace);
  } else {
    viewer.addModel(model);
  }
  if (state.spacesVisible) model.show(model.spaceIds);
  afterModelsChanged();
  return model;
}

export function updateAlignments() {
  const all = allAlignments().filter((a) => !a.hidden); // a drawn line can be hidden (#74)
  // the line being drawn
  if (lineTool.active && lineTool.pts.length >= 2) all.push(makePath('…', lineTool.pts));
  alignmentLayer.set(all);
  $('#alignments-check').textContent = alignmentLayer.visible ? '☑' : '☐';
}

export function afterModelsChanged() {
  updateAlignments();
  // undo (#67): a model was opened or removed – the history starts from the state as it is now
  setTimeout(() => history.commit(), 0);
  dropStaleChecks();
  $('#welcome').hidden = viewer.models.length + viewer.clouds.length > 0;
  if (!viewer.models.length && !viewer.clouds.length) renderRecentProjects();
  renderProjectBar();
  if (state.storey && !viewer.models.includes(state.storey.model)) state.storey = null;
  updateStoreyMenu();
  renderAll();
}

for (const input of [$('#file-input'), $('#file-input-2')]) {
  input.addEventListener('change', (e) => { openFiles(e.target.files); e.target.value = ''; });
}

// Drag and drop: files can be dropped anywhere in the window at any time.
// Capture phase, so editors (Python, CodeMirror) and dialogs do not swallow dropped files.
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
let dragDepth = 0;
const endDrag = () => { dragDepth = 0; document.body.classList.remove('dragging'); };
window.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth++;
  document.body.classList.add('dragging');
}, true);
window.addEventListener('dragleave', (e) => {
  if (!hasFiles(e)) return;
  if (--dragDepth <= 0 || !e.relatedTarget) endDrag();
}, true);
window.addEventListener('dragover', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
}, true);
window.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  e.stopPropagation();
  endDrag();
  // file handles (Chromium): a large point cloud in a project is then opened from where it is (#52)
  for (const it of e.dataTransfer.items || []) {
    if (it.kind !== 'file' || !it.getAsFileSystemHandle) continue;
    const f = it.getAsFile();
    if (f && CLOUD_FILE.test(f.name)) fileHandles.set(fileId(f), it.getAsFileSystemHandle().catch(() => null));
  }
  if (e.dataTransfer.files.length) openFiles(e.dataTransfer.files);
}, true);
window.addEventListener('blur', endDrag);


// ==================================================================== selection
export function select(model, ids, { activeId = null, additive = false, toggle = false, treeKey = null } = {}) {
  if (!additive) { state.selection.clear(); state.treeKeys.clear(); }
  if (treeKey) {
    if (toggle && state.treeKeys.has(treeKey)) state.treeKeys.delete(treeKey);
    else state.treeKeys.add(treeKey);
  }
  if (model) {
    let set = state.selection.get(model);
    if (!set) { set = new Set(); state.selection.set(model, set); }
    for (const id of ids) {
      if (toggle && set.has(id)) set.delete(id);
      else set.add(id);
    }
    if (!set.size) state.selection.delete(model);
  }
  state.active = activeId !== null ? { model, id: activeId } : null;
  if (state.active && toggle && !state.selection.get(model)?.has(activeId)) state.active = null;
  applySelection();
}

function clearSelection() {
  state.selection.clear();
  state.treeKeys.clear();
  state.active = null;
  applySelection();
}

export function applySelection() {
  for (const m of viewer.models) m.setSelection(state.selection.get(m) || [], viewer.highlightMaterial);
  if (state.xray) for (const m of viewer.models) m.setXray(state.selection.get(m) || []);
  for (const el of $$('.node.selected')) el.classList.remove('selected');
  applyTreeSelection();
  if (state.active) treeRegistry.get(`${state.active.model.uid}:${state.active.id}`)?.row.classList.add('selected');
  renderSelBars();
  renderProps();
  renderStatus();
}

/** Selection from tree/class rows: Ctrl/Cmd+click toggles a row, Shift+click selects a range. */
function rowClick(e, key, entry, activeId = null) {
  const toggle = e.ctrlKey || e.metaKey;
  if (e.shiftKey && state.lastTreeKey) {
    const container = entry.row.closest('.tab-body');
    const rows = $$('.node[data-key]', container);
    const i0 = rows.findIndex((r) => r.dataset.key === state.lastTreeKey);
    const i1 = rows.findIndex((r) => r.dataset.key === key);
    if (i0 >= 0 && i1 >= 0) {
      const [a, b] = i0 < i1 ? [i0, i1] : [i1, i0];
      if (!toggle) { state.selection.clear(); state.treeKeys.clear(); }
      for (const r of rows.slice(a, b + 1)) {
        const en = rowRegistry.get(r.dataset.key);
        if (!en) continue;
        let set = state.selection.get(en.model);
        if (!set) { set = new Set(); state.selection.set(en.model, set); }
        for (const id of en.ids.length ? en.ids : en.selfId != null ? [en.selfId] : []) set.add(id);
        state.treeKeys.add(r.dataset.key);
      }
      state.active = null;
      applySelection();
      return;
    }
  }
  state.lastTreeKey = key;
  const ids = entry.ids.length ? entry.ids : entry.selfId != null ? [entry.selfId] : [];
  select(entry.model, ids, { activeId, additive: toggle, toggle, treeKey: key });
}

/** Rows that can take part in multi-selection (tree and class list). */
const rowRegistry = new Map();

/** Hides or shows everything selected; used by the eye of a selected row and by the selection bar. */
function setSelectionVisible(visible) {
  for (const [m, set] of state.selection) visible ? m.show(set) : m.hide(set);
  refreshVisibilityUi();
}

function renderSelBars() {
  const n = selectionCount();
  for (const bar of $$('.sel-bar')) {
    // without a selection: a hint (about clicking rows; the Filters tab says just that nothing is selected)
    bar.querySelector('.sel-count').textContent = n ? t('sel.count', { n: fmtNum(n) }) : t(bar.dataset.hint || 'sel.hint');
    for (const b of $$('button[data-needs-sel]', bar)) b.disabled = !n;
  }
}

function selectionCount() {
  let n = 0;
  for (const s of state.selection.values()) n += s.size;
  return n;
}

viewer.addEventListener('pick', ({ hit, originalEvent: e }) => {
  if (lineTool.active) { lineToolClick(hit, e); return; }
  if (measure.mode && !state.pickPlaneMode) {
    measure.handleClick(e.clientX, e.clientY);
    return;
  }
  if (notes.mode && !state.pickPlaneMode) { notesClick(e); return; }
  if (state.pickPlaneMode) {
    if (hit?.normal) {
      // Put the plane 2 cm behind the face so the cut becomes visible.
      const n = hit.normal.clone().normalize();
      const p = viewer.addPlane('custom', { normal: n, point: hit.point.clone().addScaledVector(n, -0.02) });
      renderPlanes();
      autoSecView(p);
    }
    setPickPlaneMode(false);
    return;
  }
  const additive = e.ctrlKey || e.metaKey || e.shiftKey;
  if (!hit) { if (!additive) clearSelection(); return; }
  select(hit.model, [hit.id], { activeId: hit.id, additive, toggle: additive });
  revealInTree(hit.model, hit.id);
});

// ================================================================= context menu
// Right click (without dragging) in the 3D view or on a row of the Structure / Classes lists.
const contextMenu = new ContextMenu({
  viewer, h, toast, state,
  select: (map, { activeId = null, model = null } = {}) => {
    state.selection.clear();
    state.treeKeys.clear();
    for (const [m, ids] of map) if (ids.length) state.selection.set(m, new Set(ids));
    state.active = activeId !== null && model ? { model, id: activeId } : null;
    applySelection();
    if (state.active) revealInTree(model, activeId);
  },
  refresh: () => { refreshVisibilityUi(); renderStatus(); },
  showAll: () => showAll(),
  clearSelection: () => clearSelection(),
  fitIds: (map) => {
    if (!map) { viewer.fitBox(viewer.sceneBox()); return; }
    const box = new THREE.Box3();
    for (const [m, ids] of map) box.union(m.getBox(ids));
    if (!box.isEmpty()) viewer.fitBox(box);
  },
  setModelVisible: (m, on) => { m.setVisible(on); renderModels(); refreshVisibilityUi(); },
});
// The browser's own menu: the "contextmenu" event can reach our menu (it opens under the cursor when
// the button is released, before the event on Windows) or a panel over the 3D view; never show it there.
document.addEventListener('contextmenu', (e) => {
  if (e.target.closest?.('#viewport, .ctx-menu')) e.preventDefault();
}, true);
viewer.addEventListener('context', ({ hit, originalEvent: e }) => {
  if (measure.mode || state.pickPlaneMode || walk.active) return;
  contextMenu.openForHit(hit, e.clientX, e.clientY);
});
for (const list of [$('#tab-tree'), $('#tab-classes')]) {
  list.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('.node[data-key]');
    const entry = row && rowRegistry.get(row.dataset.key);
    if (!entry) return;
    e.preventDefault();
    const ids = entry.ids.length ? entry.ids : entry.selfId != null ? [entry.selfId] : [];
    contextMenu.openForRow({ model: entry.model, ids }, row.querySelector('.lbl')?.textContent || '', e.clientX, e.clientY);
  });
}

// ====================================================================== toolbar
document.addEventListener('click', (e) => {
  const menuBtn = e.target.closest('.menu-btn');
  if (menuBtn) { toggleMenu(menuBtn); return; }
  if (!e.target.closest('.menu-pop')) closeMenus();
  const btn = e.target.closest('[data-action],[data-view],[data-plane]');
  if (!btn) return;
  if (btn.closest('.menu-pop')) closeMenus();
  if (btn.dataset.view) return viewer.setView(btn.dataset.view);
  if (btn.dataset.plane) {
    if (!hasScene()) return toast(t('msg.loadFirst'));
    const p = viewer.addPlane(btn.dataset.plane);
    renderPlanes();
    return autoSecView(p);
  }
  const actions = {
    'plane-station': () => addStationPlane(),
    profile: () => openProfileDialog(),
    'prof-show': () => showProfile(),
    'prof-export': () => exportProfile(btn.dataset.fmt),
    'prof-draw': () => { $('#profile-dialog').close(); startLineTool((path) => openProfileDialog(path)); },
    'prof-remove-line': () => { const al = profilePath(); if (al?.drawn && confirmRemoveLine(al)) { removeDrawnPath(al); openProfileDialog(); } },
    drive: () => openDrive(),
    'draw-line': () => startLineTool((path) => { if (path) toast(t('line.done', { name: path.name }), true); }),
    'drive-play': () => setDrivePlaying(!drive.playing),
    'drive-dir': () => { drive.dir = -drive.dir; $('#drive-dir').textContent = drive.dir > 0 ? '→' : '←'; drivePose(); },
    'drive-close': () => closeDrive(),
    'model-group-new': () => newModelGroup(),
    'ann-all': () => { for (const b of $$('#ann-classes input')) b.checked = true; },
    'ann-none': () => { for (const b of $$('#ann-classes input')) b.checked = false; },
    fit: () => fitSelection(),
    'fit-all': () => viewer.fitAll(),
    'sel-hide': () => hideSelected({ keepSelection: true }),
    'sel-show': () => setSelectionVisible(true),
    'sel-isolate': () => isolateSelected(),
    'sel-clear': () => clearSelection(),
    'sel-opacity-reset': () => {
      if (state.selection.size) for (const [m, set] of state.selection) m.setElementOpacity(set, 1);
      else for (const m of viewer.models) m.resetElementOpacity();
      for (const r of $$('[data-sel-opacity]')) r.value = '1';
    },
    theme: () => {
      try { localStorage.setItem(THEME_KEY, currentTheme() === 'dark' ? 'light' : 'dark'); } catch { /* ignore */ }
      applyTheme();
    },
    settings: () => openSettings(btn.dataset.settings),
    projects: () => openProjectsDialog(),
    'project-rename': async () => {
      if (!projects.current) { await projects.saveNow(); if (!projects.current) return toast(t('proj.off')); }
      const n = prompt(t('proj.renamePrompt'), projects.current.name);
      if (n && n.trim()) projects.rename(projects.current.id, n.trim());
    },
    'project-new': async () => {
      if (viewer.models.length && !confirm(t('proj.newConfirm'))) return;
      await projects.close();
      $('#projects-dialog').close();
    },
    'proj-clear-cache': async () => { await projects.clearGeometryCache(); renderProjectsDialog(); toast(t('proj.cacheCleared'), true); },
    about: () => { renderVersion($('#about-version'), h); $('#about-dialog').showModal(); },
    'toggle-left': () => setPanelHidden('left', !document.body.classList.contains('hide-left')),
    'toggle-right': () => setPanelHidden('right', !document.body.classList.contains('hide-right')),
    compare: () => openCompareDialog(),
    ids: () => openIdsDialog(),
    drawing: () => openDrawingDialog(),
    'drawing-run': () => exportDrawing(),
    'ids-run': () => runIds(),
    'compare-run': () => runCompare(),
    'plane-face': () => {
      if (!viewer.models.length) return toast(t('msg.loadFirst'));
      setPickPlaneMode(!state.pickPlaneMode);
    },
    'section-box': () => {
      if (!viewer.models.length) return toast(t('msg.loadFirst'));
      viewer.clearPlanes();
      viewer.addSectionBox(selectionBox() || viewer.sceneBox());
      renderPlanes();
    },
    'clear-planes': () => { viewer.clearPlanes(); renderPlanes(); },
    hide: () => hideSelected(),
    isolate: () => isolateSelected(),
    'show-all': () => showAll(),
    'toggle-spaces': () => toggleSpaces(),
    'ter-build': () => buildTerrain(),
    'vol-run': () => runVolumes(),
    'vol-csv': () => volumeCsv(),
    'vol-clear': () => { setVolResult(null); showVolumeMap(false); renderVolumes(); },
    'toggle-ortho': () => { if (walk.active) walk.stop(); setOrtho(!viewer.isOrtho); },
    walk: () => walk.toggle(),
    qto: () => qto.open(),
    'toggle-xray': () => setXray(!state.xray),
    'storey-cut': () => { state.storeyCut = !state.storeyCut; renderStoreyItems(); if (state.storey) showStorey(state.storey); },
    'toggle-alignments': () => {
      if (!allAlignments().length) return toast(t('aln.none')); // model alignments or drawn lines
      alignmentLayer.setVisible(!alignmentLayer.visible);
      $('#alignments-check').textContent = alignmentLayer.visible ? '☑' : '☐';
    },
    'toggle-edit': () => setEditMode(!state.editMode),
    merge: () => openMergeDialog(),
    'merge-run': () => runMerge(),
    ...notesActions,
    split: () => openSplitDialog(),
    'split-run': () => runSplit(),
    'toggle-python': () => python.toggle(),
    'toggle-measure': () => setMeasureMode(measure.mode ? null : lastMeasureMode),
    'measure-close': () => { setMeasureMode(null); measurePanelClosed = true; renderMeasure(); },
    'measure-clear': () => measure.clear(),
    'measure-copy': () => { navigator.clipboard?.writeText(measure.toText()); toast(t('measure.copied'), true); },
    screenshot: () => download(`vispecta-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`, dataUrlToBlob(viewer.screenshot())),
    help: () => $('#help-dialog').showModal(),
    'color-by-model': () => {
      // with the colour-blind friendly style, the models get Okabe–Ito colours
      const pal = colorStyle.name === 'cvd' ? OKABE_ITO.slice(0, 7) : PALETTE;
      viewer.models.forEach((m, i) => m.setColor(pal[i % pal.length]));
      renderModels();
      projects.touch?.();
    },
    // "Original colours" also clears colours given to single elements (IDS, filters, smart views) (#40)
    'reset-colors': () => resetColors(),
    'reset-view': () => resetView(),
    'reset-all': () => resetView({ all: true }),
    'open-samples': () => openSamples(btn.dataset.sample),
    corridor: () => openCorridorDialog(),
    clearance: () => openClearanceDialog(),
    'clr-show': () => showGauge(),
    'clr-run': () => runClearance(),
    'clr-clear': () => clearGauge(),
    'cor-show': () => showCorridor(),
    'cor-find': () => findInCorridor(),
    'cor-clear': () => { corridor.clear(); setCorridorHits(null); renderCorridorHits(); secViewer?.planesChanged?.(); projects.touch?.(); },
  };
  actions[btn.dataset.action]?.();
});

// Drop-down menus in the toolbar. The pop-ups are positioned 'fixed' because the toolbar scrolls sideways.
function toggleMenu(btn) {
  const pop = btn.parentElement.querySelector('.menu-pop');
  const open = pop.hidden;
  closeMenus();
  if (!open) return;
  if (pop.dataset.pop === 'view') renderColorStyles();
  if (pop.dataset.pop === 'storeys') renderStoreyItems();
  const r = btn.getBoundingClientRect();
  pop.hidden = false;
  pop.style.top = `${r.bottom + 4}px`;
  pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8))}px`;
  btn.classList.add('open');
}

function closeMenus() {
  for (const p of $$('.menu-pop')) p.hidden = true;
  for (const b of $$('.menu-btn.open')) b.classList.remove('open');
}
window.addEventListener('resize', closeMenus);
$('.toolbar').addEventListener('scroll', closeMenus);

function dataUrlToBlob(url) {
  const [head, b64] = url.split(',');
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: head.slice(5, head.indexOf(';')) });
}

function setPickPlaneMode(on) {
  state.pickPlaneMode = on;
  $('[data-action="plane-face"]').classList.toggle('on', on);
  $('#viewport').classList.toggle('picking', on);
  const hint = $('#mode-hint');
  hint.hidden = !on;
  hint.textContent = t('planes.faceHint');
}

function setEditMode(on) {
  state.editMode = on;
  for (const b of $$('[data-action="toggle-edit"]')) b.classList.toggle('on', on);
  document.body.classList.toggle('editing', on);
  renderProps();
}

function selectionBox() {
  if (!state.selection.size) return null;
  let box = null;
  for (const [m, set] of state.selection) {
    const b = m.getBox([...set]);
    if (b.isEmpty()) continue;
    box = box ? box.union(b) : b;
  }
  return box;
}

export function fitSelection() {
  const box = selectionBox();
  if (box && !box.isEmpty()) viewer.fitBox(box);
  else viewer.fitAll();
}

function hideSelected({ keepSelection = false } = {}) {
  if (!state.selection.size) return toast(t('msg.selectFirst'));
  for (const [m, set] of state.selection) m.hide(set);
  if (!keepSelection) clearSelection();
  refreshVisibilityUi();
}

export function isolateSelected() {
  if (!state.selection.size) return toast(t('msg.selectFirst'));
  for (const m of viewer.models) m.isolate(state.selection.get(m) || []);
  refreshVisibilityUi();
}

function showAll() {
  for (const m of viewer.models) m.showAll({ includeSpaces: state.spacesVisible });
  refreshVisibilityUi();
}

/** Original colours: no model colour and no element colours (IDS, filters, smart views, BCF). (#40) */
function resetColors() {
  if (comparison) endComparison();
  filters.resetColors();
  for (const m of viewer.models) { m.setColor(null); m.resetElementColors(); }
  renderModels();
  projects.touch?.();
}

/**
 * Reset view (#40): back to a clean view in one go – original colours, no transparency, X-ray,
 * isolation, storey or selection, everything shown, camera on the whole scene. Models, groups,
 * issues and IDS results stay. With `all`, section planes and measurements are removed too.
 */
function resetView({ all = false } = {}) {
  resetColors();
  for (const m of viewer.models) {
    m.resetElementOpacity();
    m._tonedDown = [];
    if (m.opacity < 1) m.setOpacity(1);
    m.showAll({ includeSpaces: state.spacesVisible });
  }
  if (state.xray) setXray(false);
  if (state.storey) showStorey(null);
  clearSelection();
  if (all) {
    viewer.clearPlanes();
    renderPlanes();
    if (measure.mode) setMeasureMode(null);
    measure.clear();
  }
  renderModels();
  refreshVisibilityUi();
  viewer.fitAll();
  toast(t(all ? 'msg.allReset' : 'msg.viewReset'), true);
}

function toggleSpaces() {
  state.spacesVisible = !state.spacesVisible;
  for (const m of viewer.models) {
    if (state.spacesVisible) m.show(m.spaceIds);
    else m.hide(m.spaceIds);
  }
  updateSpacesUi();
  refreshVisibilityUi();
}

function updateSpacesUi() {
  $('#spaces-check').textContent = state.spacesVisible ? '☑' : '☐';
}

document.addEventListener('keydown', (e) => {
  if (lineTool.active && !e.target.closest('input, textarea, select')) {
    if (e.key === 'Enter') { e.preventDefault(); finishLineTool(true); return; }
    if (e.key === 'Escape') { e.preventDefault(); finishLineTool(false); return; }
    if (e.key === 'Backspace') { e.preventDefault(); lineTool.pts.pop(); updateAlignments(); return; }
  }
  if (e.key === 'Escape' && drive.playing) { setDrivePlaying(false); return; }
  if (e.target.closest('input, textarea, select, .cm-editor')) return;
  if (e.key === 'Escape') {
    if ($$('.menu-pop').some((p) => !p.hidden)) closeMenus();
    else if (state.pickPlaneMode) setPickPlaneMode(false);
    else if (measure.cancel()) { /* handled by the measure tool */ }
    else if (notesCancel()) { /* handled by the annotations */ }
    else clearSelection();
  } else if (e.key === 'f' || e.key === 'F') fitSelection();
  else if (e.key === 'H' && e.shiftKey) showAll();
  else if (e.key === 'R' && e.shiftKey && !e.ctrlKey && !e.metaKey) resetView(); // (#40)
  else if (e.key === 'h') hideSelected();
  else if (e.key === 'i' || e.key === 'I') isolateSelected();
  else if (e.key === 'e' || e.key === 'E') setEditMode(!state.editMode);
  else if (e.key === 'm' || e.key === 'M') setMeasureMode(measure.mode ? null : lastMeasureMode);
  else if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey) toggleNotes();
  else if ((e.key === 'o' || e.key === 'O') && !e.ctrlKey && !e.metaKey) { if (!walk.active) setOrtho(!viewer.isOrtho); }
  else if ((e.key === 'w' || e.key === 'W') && !e.ctrlKey && !e.metaKey) walk.toggle();
  else if ((e.key === 'x' || e.key === 'X') && !e.ctrlKey && !e.metaKey) setXray(!state.xray);
  else if ((e.key === 'q' || e.key === 'Q') && !e.ctrlKey && !e.metaKey) qto.open();
  else if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); stepStorey(e.key === 'PageUp' ? 1 : -1); }
  else if ((e.ctrlKey || e.metaKey) && e.key === 'o') { e.preventDefault(); $('#file-input').click(); }
});

// ========================================================================= tabs
for (const tab of $$('.tab')) {
  tab.addEventListener('click', () => {
    for (const x of $$('.tab')) x.classList.toggle('active', x === tab);
    for (const b of $$('.tab-body')) b.classList.toggle('active', b.id === `tab-${tab.dataset.tab}`);
    if (tab.dataset.tab === 'filters') filters.render();
    if (tab.dataset.tab === 'issues') issues.render();
    if (tab.dataset.tab === 'views') views.render();
  });
}

function renderAll() {
  filters.render();
  issues.render();
  views.render();
  renderModels();
  renderTree();
  renderClasses();
  renderPlanes();
  applySelection();
}

export function refreshVisibilityUi() {
  refreshTreeEyes();
  renderClasses();
  renderStatus();
}

// ========================================================================= tree
const treeRegistry = new Map(); // key -> {row, expand, ids}

function descendantIds(model, node, out = []) {
  if (model.elementIds.has(node.expressID)) out.push(node.expressID);
  for (const c of node.children || []) descendantIds(model, c, out);
  return out;
}

function renderTree() {
  treeRegistry.clear();
  for (const k of [...rowRegistry.keys()]) if (k.startsWith('tree:')) rowRegistry.delete(k);
  const root = $('#tree');
  root.replaceChildren();
  const q = $('#tree-search').value.trim();
  if (q) return renderTreeSearch(q);
  if (!viewer.models.length) {
    root.append(h('div', { class: 'empty-hint', text: t('tree.empty') }));
    return;
  }
  const ul = h('ul');
  for (const m of viewer.models) {
    const modelNode = { expressID: -1, children: [m.tree] };
    ul.append(treeNode(m, modelNode, { open: true, label: modelTitle(m), rootModel: true }));
  }
  root.append(h('div', { class: 'tree' }, ul));
}

function treeNode(model, node, { open = false, label = null, cls = null, rootModel = false, groupKey = null, groupChildren = null } = {}) {
  const id = node.expressID;
  const children = groupChildren || node.children || [];
  const hasKids = children.length > 0;
  const ids = groupChildren ? groupChildren.flatMap((c) => descendantIds(model, c)) : descendantIds(model, node);

  const caret = h('span', { class: 'caret', text: hasKids ? '▸' : '' });
  const eye = h('button', { class: 'eye', title: t('tree.toggleVisibility') });
  const typeName = rootModel ? 'Model' : cls ?? model.typeName(id);
  const text = label ?? model.label(id);
  const row = h('div', { class: `node${rootModel ? ' model-root' : ''}` },
    caret,
    ids.length ? eye : h('span', { class: 'eye' }),
    h('span', { class: 'lbl', text }),
    !rootModel && !groupChildren && text !== typeName ? h('span', { class: 'cls', text: typeName }) : null,
    groupChildren ? h('span', { class: 'count', text: String(groupChildren.length) }) : null,
  );
  const li = h('li', {}, row);
  let childUl = null;
  let expanded = false;

  const expand = () => {
    if (!hasKids || expanded) return;
    expanded = true;
    caret.textContent = '▾';
    childUl = h('ul');
    renderChildren(model, node, children, childUl, !!groupChildren);
    li.append(childUl);
    applyTreeSelection();
  };
  const collapse = () => {
    expanded = false;
    caret.textContent = '▸';
    childUl?.remove();
    childUl = null;
  };
  caret.addEventListener('click', (e) => { e.stopPropagation(); expanded ? collapse() : expand(); });
  row.addEventListener('dblclick', (e) => { e.stopPropagation(); const b = model.getBox(ids); if (!b.isEmpty()) viewer.fitBox(b); });
  const key = groupKey ?? (rootModel ? `${model.uid}:model` : `${model.uid}:${id}`);
  const rowKey = `tree:${key}`;
  row.dataset.key = rowKey;
  const entry = { row, expand, ids, eye, model, selfId: rootModel || groupChildren ? null : id };
  row.addEventListener('click', (e) => rowClick(e, rowKey, entry, rootModel || groupChildren ? null : id));
  eye.addEventListener('click', (e) => {
    e.stopPropagation();
    eyeClick(model, ids, rowKey);
  });
  treeRegistry.set(key, entry);
  rowRegistry.set(rowKey, entry);
  updateEye(treeRegistry.get(key));
  if (open) expand();
  return li;
}

function renderChildren(model, node, children, ul, isGroup) {
  const parentSpatial = !isGroup && node.expressID !== -1 && isSpatialType(model.typeName(node.expressID));
  if (!parentSpatial) {
    // Long lists (e.g. thousands of walls) are rendered 500 rows at a time
    const CHUNK = 500;
    let shown = 0;
    const more = () => {
      const end = Math.min(children.length, shown + CHUNK);
      const frag = document.createDocumentFragment();
      for (; shown < end; shown++) frag.append(treeNode(model, children[shown], { open: node.expressID === -1 }));
      ul.append(frag);
      if (shown < children.length) {
        const btn = h('li', {}, h('button', { class: 'link tree-more', text: t('tree.showMore', { n: fmtNum(Math.min(CHUNK, children.length - shown)), rest: fmtNum(children.length - shown) }) }));
        btn.firstChild.addEventListener('click', (e) => { e.stopPropagation(); btn.remove(); more(); applyTreeSelection(); refreshTreeEyes(); });
        ul.append(btn);
      }
    };
    more();
    return;
  }
  // Under spatial nodes: spatial children first, then elements grouped by class
  const groups = new Map();
  for (const c of children) {
    const t0 = model.typeName(c.expressID);
    if (isSpatialType(t0)) ul.append(treeNode(model, c, { open: t0 === 'IfcSite' || t0 === 'IfcBuilding' }));
    else {
      if (!groups.has(t0)) groups.set(t0, []);
      groups.get(t0).push(c);
    }
  }
  for (const [ty, list] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
    ul.append(treeNode(model, node, { label: ty, cls: ty, groupChildren: list, groupKey: `${model.uid}:${node.expressID}:cls:${ty}` }));
  }
}

function updateEye(entry) {
  if (!entry?.eye || !entry.ids.length) return;
  const allHidden = entry.ids.every((x) => entry.model.isHidden(x));
  entry.eye.innerHTML = allHidden ? EYE_OFF : EYE;
  entry.eye.classList.toggle('off', allHidden);
  entry.row.classList.toggle('dim', allHidden);
}

function refreshTreeEyes() { for (const e of treeRegistry.values()) updateEye(e); }

function applyTreeSelection() {
  for (const [m, set] of state.selection) for (const id of set) treeRegistry.get(`${m.uid}:${id}`)?.row.classList.add('selected');
  for (const k of state.treeKeys) rowRegistry.get(k)?.row.classList.add('selected');
}

/** Eye button: on a selected row it applies to the whole selection, otherwise just to that row. */
function eyeClick(model, ids, rowKey) {
  const rowSelected = state.treeKeys.has(rowKey) && selectionCount() > 0;
  if (rowSelected) {
    let allHidden = true;
    for (const [m, set] of state.selection) for (const x of set) if (!m.isHidden(x)) { allHidden = false; break; }
    setSelectionVisible(allHidden);
    return;
  }
  const allHidden = ids.every((x) => model.isHidden(x));
  if (allHidden) model.show(ids); else model.hide(ids);
  refreshVisibilityUi();
}

function revealInTree(model, id) {
  if ($('#tree-search').value.trim()) return;
  const chain = [];
  let p = model.parent.get(id);
  while (p !== undefined) { chain.unshift(p); p = model.parent.get(p); }
  treeRegistry.get(`${model.uid}:model`)?.expand();
  for (let i = 0; i < chain.length; i++) {
    treeRegistry.get(`${model.uid}:${chain[i]}`)?.expand();
    const next = chain[i + 1] ?? id;
    if (isSpatialType(model.typeName(chain[i])) && !isSpatialType(model.typeName(next))) {
      treeRegistry.get(`${model.uid}:${chain[i]}:cls:${model.typeName(next)}`)?.expand();
    }
  }
  const entry = treeRegistry.get(`${model.uid}:${id}`);
  if (entry) {
    entry.row.classList.add('selected');
    if ($('#tab-tree').classList.contains('active')) entry.row.scrollIntoView({ block: 'nearest' });
  }
}

// Search in the tree
const searchIndex = new Map(); // model -> {version, items}
function buildIndex(model) {
  const cached = searchIndex.get(model);
  if (cached && cached.version === model.version) return cached.items;
  const out = [];
  const walk = (n) => {
    const line = (() => { try { return model.api.GetLine(model.modelID, n.expressID, false); } catch { return null; } })();
    const name = model.label(n.expressID);
    const cls = model.typeName(n.expressID);
    const guid = line?.GlobalId?.value || '';
    const tag = line?.Tag?.value || '';
    out.push({ id: n.expressID, name, cls, hay: `${name} ${cls} ${guid} ${tag} #${n.expressID}`.toLowerCase() });
    for (const c of n.children || []) walk(c);
  };
  walk(model.tree);
  searchIndex.set(model, { version: model.version, items: out });
  return out;
}

function renderTreeSearch(q) {
  const root = $('#tree');
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const ul = h('ul');
  let total = 0;
  const LIMIT = 500;
  for (const m of viewer.models) {
    for (const item of buildIndex(m)) {
      if (!terms.every((x) => item.hay.includes(x))) continue;
      total++;
      if (total > LIMIT) continue;
      const row = h('div', { class: 'node' },
        h('span', { class: 'caret' }),
        h('span', { class: 'lbl', text: item.name }),
        h('span', { class: 'cls', text: item.cls }),
        viewer.models.length > 1 ? h('span', { class: 'count', text: m.displayName }) : null,
      );
      const ids = m.elementIds.has(item.id) ? [item.id] : [];
      const rowKey = `tree:${m.uid}:${item.id}`;
      row.dataset.key = rowKey;
      const entry = { row, expand: () => {}, ids, model: m, selfId: item.id };
      row.addEventListener('click', (e) => rowClick(e, rowKey, entry, item.id));
      row.addEventListener('dblclick', () => { const b = m.getBox([item.id]); if (!b.isEmpty()) viewer.fitBox(b); });
      treeRegistry.set(`${m.uid}:${item.id}`, entry);
      rowRegistry.set(rowKey, entry);
      ul.append(h('li', {}, row));
    }
  }
  root.append(h('div', { class: 'muted', style: 'padding:0 4px 6px', text: total > LIMIT ? t('tree.resultsLimited', { n: fmtNum(total), limit: LIMIT }) : t('tree.results', { n: fmtNum(total) }) }));
  root.append(h('div', { class: 'tree' }, ul));
  applyTreeSelection();
}

let searchTimer = null;
$('#tree-search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderTree, 250);
});

// ====================================================================== classes
function renderClasses() {
  const root = $('#classes');
  root.replaceChildren();
  if (!viewer.models.length) {
    root.append(h('div', { class: 'empty-hint', text: t('classes.empty') }));
    return;
  }
  for (const k of [...rowRegistry.keys()]) if (k.startsWith('cls:')) rowRegistry.delete(k);
  for (const m of viewer.models) {
    const ul = h('ul');
    for (const [cls, ids] of [...m.classes].sort((a, b) => a[0].localeCompare(b[0]))) {
      const rowKey = `cls:${m.uid}:${cls}`;
      const allHidden = ids.every((x) => m.isHidden(x));
      const eye = h('button', { class: `eye${allHidden ? ' off' : ''}`, title: t('classes.toggle') });
      eye.innerHTML = allHidden ? EYE_OFF : EYE;
      eye.addEventListener('click', (e) => {
        e.stopPropagation();
        if (cls === 'IfcSpace' && !state.spacesVisible && ids.every((x) => m.isHidden(x))) { state.spacesVisible = true; updateSpacesUi(); }
        eyeClick(m, ids, rowKey);
      });
      const row = h('div', { class: `node${allHidden ? ' dim' : ''}`, 'data-key': rowKey }, eye, h('span', { class: 'lbl', text: cls }), h('span', { class: 'count', text: fmtNum(ids.length) }));
      const entry = { row, ids, model: m, selfId: null };
      rowRegistry.set(rowKey, entry);
      if (state.treeKeys.has(rowKey)) row.classList.add('selected');
      row.addEventListener('click', (e) => rowClick(e, rowKey, entry));
      row.addEventListener('dblclick', () => { const b = m.getBox(ids); if (!b.isEmpty()) viewer.fitBox(b); });
      ul.append(h('li', {}, row));
    }
    root.append(h('div', { class: 'tree' }, h('div', { class: 'node model-root' }, h('span', { class: 'lbl', text: modelTitle(m) })), ul));
  }
}

// =================================================================== properties
let propsToken = 0;
async function renderProps({ keepScroll = false } = {}) {
  const token = ++propsToken;
  const root = $('#props');
  const scroll = root.scrollTop;
  const count = selectionCount();
  if (!state.active && !count) {
    root.replaceChildren(h('div', { class: 'empty-hint', text: t('props.empty') }));
    return;
  }

  const parts = [];
  if (count > 1 || !state.active) {
    const byClass = new Map();
    for (const [m, set] of state.selection) for (const id of set) {
      const ty = m.typeName(id);
      byClass.set(ty, (byClass.get(ty) || 0) + 1);
    }
    parts.push(h('div', { class: 'prop-head' },
      h('div', { class: 'cls', text: t('props.selection') }),
      h('div', { class: 'name', text: t('props.nSelected', { n: fmtNum(count) }) }),
      h('ul', { class: 'multi-list' }, [...byClass].sort((a, b) => b[1] - a[1]).map(([ty, n]) => h('li', {}, h('span', { text: ty }), h('span', { class: 'muted', text: fmtNum(n) })))),
    ));
    parts.push(selectionTotals());
  }

  if (state.editMode && count > 0) parts.push(batchForm());
  else if (!state.editMode && count > 1) {
    parts.push(h('button', { class: 'btn sm hint-btn', onclick: () => setEditMode(true), text: t('props.editHint') }));
  }

  if (state.active) {
    const { model, id } = state.active;
    let data;
    try {
      data = await model.getElementData(id);
    } catch (e) {
      console.error(e);
      parts.push(h('div', { class: 'empty-hint', text: t('props.readFailed', { error: e.message }) }));
    }
    if (token !== propsToken) return;
    if (data) {
      const guidBtn = h('button', { text: t('props.copy'), onclick: () => { navigator.clipboard?.writeText(data.guid); guidBtn.textContent = t('props.copied'); } });
      parts.push(h('div', { class: 'prop-head' },
        h('div', { class: 'cls', text: data.cls }),
        h('div', { class: 'name', text: data.name || `#${id}` }),
        data.guid ? h('div', { class: 'guid' }, h('span', { text: data.guid }), guidBtn) : null,
        viewer.models.length > 1 ? h('div', { class: 'muted', text: model.name }) : null,
      ));
      for (const sec of data.sections) parts.push(renderSection(model, id, sec));
    }
  }
  if (token !== propsToken) return;
  root.replaceChildren(...parts.filter(Boolean));
  filterProps();
  if (keepScroll) root.scrollTop = scroll;
}

/** Runs an edit, reports errors and refreshes the UI. */
async function commitEdit(model, fn, { refreshTree = false } = {}) {
  try {
    const result = await fn();
    searchIndex.delete(model);
    renderModels();
    if (refreshTree) renderTree();
    await renderProps({ keepScroll: true });
    return result;
  } catch (e) {
    console.error(e);
    toast(e.message || String(e));
    await renderProps({ keepScroll: true });
    return null;
  }
}

function kindSelect(value = 'text') {
  return h('select', { class: 'kind' }, Object.keys(KIND_TYPES).map((k) => h('option', { value: k, text: t(`kind.${k}`), selected: k === value })));
}

function valueInput(meta) {
  const vt = String(meta.valueType || '').toUpperCase();
  if (vt === 'IFCBOOLEAN' || vt === 'IFCLOGICAL') {
    const sel = h('select', {},
      h('option', { value: 'true', text: t('val.true'), selected: meta.raw === 'true' }),
      h('option', { value: 'false', text: t('val.false'), selected: meta.raw === 'false' }),
      meta.raw === '' ? h('option', { value: '', text: '—', selected: true }) : null);
    return sel;
  }
  return h('input', { type: 'text', value: meta.raw ?? '' });
}

function renderSection(model, elementId, sec) {
  const tbody = h('tbody');
  const editing = state.editMode;
  for (const [k, v, meta] of sec.rows) {
    const valueCell = h('td');
    if (meta?.link !== undefined) {
      const a = h('a', { text: v });
      a.addEventListener('click', () => {
        const node = findNode(model.tree, meta.link);
        const ids = node ? descendantIds(model, node) : [];
        select(model, ids.length ? ids : [meta.link], { activeId: meta.link });
        revealInTree(model, meta.link);
      });
      valueCell.append(a);
    } else if (editing && meta?.attr) {
      const input = h('input', { type: 'text', value: v });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { input.value = v; input.blur(); } });
      input.addEventListener('change', () => commitEdit(model, () => model.setAttribute(elementId, meta.attr, input.value), { refreshTree: meta.attr === 'Name' }));
      valueCell.append(input);
    } else if (editing && meta?.propId) {
      const input = valueInput(meta);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
      input.addEventListener('change', () => commitEdit(model, () => model.setPropertyValue(meta.propId, input.value)));
      const del = h('button', { class: 'icon-btn', title: t('edit.removeProp'), text: '✕' });
      del.addEventListener('click', () => {
        if (!confirm(t('edit.removePropConfirm', { name: k }))) return;
        commitEdit(model, () => model.removeProperty(sec.psetId, meta.propId));
      });
      valueCell.append(h('div', { class: 'edit-cell' }, input, del));
    } else valueCell.textContent = v;
    tbody.append(h('tr', { 'data-k': k.toLowerCase(), 'data-v': String(v).toLowerCase() }, h('td', { text: k }), valueCell));
  }

  if (editing && sec.psetId) {
    const name = h('input', { type: 'text', placeholder: t('edit.propName') });
    const value = h('input', { type: 'text', placeholder: t('edit.value') });
    const kind = kindSelect();
    const add = h('button', { class: 'btn sm primary', text: t('edit.add') });
    add.addEventListener('click', () => commitEdit(model, () => model.addProperty(sec.psetId, name.value.trim(), value.value, kind.value)));
    tbody.append(h('tr', { class: 'add-row', 'data-k': '', 'data-v': '' }, h('td', {}, name), h('td', {}, h('div', { class: 'edit-cell' }, value, kind, add))));
  }

  let badge = String(sec.rows.length);
  let warn = null;
  if (sec.isType && editing && sec.psetId) warn = t('edit.typeShared');
  else if (sec.shared > 1) {
    badge = `${sec.rows.length} · ${t('props.sharedBy', { n: sec.shared })}`;
    if (editing && sec.psetId) warn = t('edit.sharedWarn', { n: sec.shared });
  }
  // copy the property set to other objects – the project, a site, the selection … (edit mode)
  const copy = editing && sec.psetId
    ? h('button', { class: 'icon-btn sec-copy', text: '⧉', title: t('cp.button'), 'aria-label': t('cp.button'), onclick: (e) => {
      e.preventDefault(); e.stopPropagation();
      openCopyPset({ model, elementId, psetId: sec.psetId, name: sec.psetName || sec.title, count: sec.rows.length }, commitEdit);
    } })
    : null;
  return h('details', { class: `sec${sec.kind === 'qto' ? ' qto' : ''}${sec.kind === 'calc' ? ' calc' : ''}`, open: sec.open },
    h('summary', {}, h('span', { text: sec.title }), h('span', { class: 'badge', text: badge }), copy),
    warn ? h('div', { class: 'warn', text: warn }) : null,
    sec.note ? h('div', { class: 'sec-note', text: sec.note }) : null,
    h('table', { class: 'props' }, tbody),
  );
}

/** Sums of the calculated quantities of the selected elements. */
function selectionTotals() {
  const tot = { count: 0, volume: 0, area: 0, planArea: 0, length: 0 };
  for (const [m, set] of state.selection) {
    const r = m.sumQuantities(set);
    for (const k of Object.keys(tot)) tot[k] += r[k];
  }
  if (!tot.count) return null;
  const f = (v, d = 3) => v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  const tbody = h('tbody', {}, [
    [t('q.volume'), `${f(tot.volume)} m³`],
    [t('q.area'), `${f(tot.area, 2)} m²`],
    [t('q.planArea'), `${f(tot.planArea, 2)} m²`],
    [t('q.lengthSum'), `${f(tot.length)} m`],
  ].map(([k, v]) => h('tr', { 'data-k': k.toLowerCase(), 'data-v': v.toLowerCase() }, h('td', { text: k }), h('td', { text: v }))));
  return h('details', { class: 'sec calc', open: true },
    h('summary', {}, h('span', { text: t('q.totals') }), h('span', { class: 'badge', text: t('q.count', { n: fmtNum(tot.count) }) })),
    h('div', { class: 'sec-note', text: t('q.note') }),
    h('table', { class: 'props' }, tbody));
}

/** Form for setting a property on all selected elements. */
function batchForm() {
  const count = selectionCount();
  const pset = h('input', { type: 'text', placeholder: 'Pset_…', list: 'pset-names' });
  const prop = h('input', { type: 'text', placeholder: t('edit.propName') });
  const value = h('input', { type: 'text', placeholder: t('edit.value') });
  const kind = kindSelect();
  const apply = h('button', { class: 'btn primary sm', text: t('edit.applyTo', { n: fmtNum(count) }) });
  const datalist = h('datalist', { id: 'pset-names' }, ['Pset_WallCommon', 'Pset_DoorCommon', 'Pset_WindowCommon', 'Pset_SlabCommon', 'Pset_BeamCommon', 'Pset_ColumnCommon', 'Pset_SpaceCommon'].map((n) => h('option', { value: n })));
  apply.addEventListener('click', async () => {
    const psetName = pset.value.trim();
    const propName = prop.value.trim();
    if (!psetName || !propName) return toast(t('err.nameRequired'));
    let total = { edited: 0, added: 0, created: 0, others: 0 };
    for (const [m, set] of state.selection) {
      const r = await commitEdit(m, () => m.setPropertyOnElements([...set], psetName, propName, value.value, kind.value));
      if (!r) return;
      for (const k of Object.keys(total)) total[k] += r[k];
    }
    toast(t('edit.batchDone', total) + (total.others ? ` ${t('edit.batchOthers', { n: total.others })}` : ''), true);
  });
  return h('details', { class: 'batch', open: count > 1 || !state.active },
    h('summary', { class: 'batch-title', text: t('edit.batchTitle', { n: fmtNum(count) }) }),
    h('div', { class: 'batch-grid' },
      h('label', { text: t('edit.pset') }), pset,
      h('label', { text: t('edit.propName') }), prop,
      h('label', { text: t('edit.value') }), h('div', { class: 'edit-cell' }, value, kind)),
    datalist,
    h('div', { class: 'batch-foot' }, h('span', { class: 'muted small', text: t('edit.batchHelp') }), apply),
  );
}

function findNode(node, id) {
  if (node.expressID === id) return node;
  for (const c of node.children || []) { const r = findNode(c, id); if (r) return r; }
  return null;
}

function filterProps() {
  const q = $('#prop-search').value.trim().toLowerCase();
  for (const sec of $$('#props details.sec')) {
    let any = false;
    const titleHit = q && sec.querySelector('summary').textContent.toLowerCase().includes(q);
    for (const tr of $$('tr', sec)) {
      const hit = !q || titleHit || tr.dataset.k.includes(q) || tr.dataset.v.includes(q);
      tr.hidden = !hit;
      any ||= hit;
    }
    sec.hidden = !any;
    if (q && any) sec.open = true;
  }
}
$('#prop-search').addEventListener('input', filterProps);

// ====================================================================== measure
let lastMeasureMode = 'distance';
let measurePanelClosed = false;

export function setMeasureMode(mode) {
  if (mode && !hasScene()) return toast(t('msg.loadFirst'));
  if (mode) { lastMeasureMode = mode; measurePanelClosed = false; }
  if (mode && state.pickPlaneMode) setPickPlaneMode(false);
  if (mode) closeNotes();
  measure.setMode(mode);
}

function renderMeasure() {
  const panel = $('#measure-panel');
  const rows = measure.rows();
  panel.hidden = measurePanelClosed || (!measure.mode && !rows.length);
  for (const b of $$('.toolbar [data-action="toggle-measure"]')) b.classList.toggle('on', !!measure.mode);
  for (const b of $$('#measure-modes [data-measure]')) b.classList.toggle('on', b.dataset.measure === measure.mode);
  $('#measure-hint').textContent = measure.mode ? t(measure.mode === 'objects' && measure.waitingForSecond ? 'measure.hint.objects2' : `measure.hint.${measure.mode}`) : t('measure.hint.off');
  $('#measure-foot').hidden = !rows.length;
  $('.lock-opts').hidden = measure.mode !== 'distance';
  const list = $('#measure-list');
  list.replaceChildren(...rows.map((r) => h('div', { class: `m-item ${r.m.type}` },
    h('div', { class: 'm-item-head' },
      h('span', { class: 'm-swatch' }),
      h('a', { class: 'm-title', text: r.title, title: t('measure.zoomTo'), onclick: () => measure.focus(r.m.id) }),
      h('b', { class: 'm-value', text: r.value }),
      h('button', { class: 'icon-btn', title: t('measure.remove'), text: '✕', onclick: () => measure.remove(r.m.id) })),
    r.lines.length ? h('table', { class: 'm-lines' }, r.lines.map(([k, v]) => h('tr', {}, h('td', { text: k }), h('td', { text: v })))) : null,
  )));
  renderStatus();
}
measure.addEventListener('change', renderMeasure);
initNotes();
for (const b of $$('#measure-modes [data-measure]')) b.addEventListener('click', () => setMeasureMode(measure.mode === b.dataset.measure ? null : b.dataset.measure));
$('#measure-snap').addEventListener('change', (e) => { measure.snapOn = e.target.checked; });
$('#measure-unit').addEventListener('change', (e) => { measure.unit = e.target.value; measure.refresh(); });
{
  const inp = $('#coord-warn-m');
  inp.value = String(coordWarnM);
  inp.addEventListener('change', () => {
    const v = +inp.value;
    if (!(v > 0)) { inp.value = String(coordWarnM); return; }
    coordWarnM = v;
    try { localStorage.setItem('onlineifc.coordWarnM', String(v)); } catch { /* ignore */ }
    checkCoordinates();
  });
}
// stationing format (#29): one setting for labels, fields, the section window, profiles, series and drawings
function applyStationFormat(fmt, { save = true } = {}) {
  if (save) setStationFormat(fmt); else stationFormat.value = fmt in STATION_FORMATS ? fmt : 'km';
  for (const sel of $$('.station-format')) sel.value = stationFormat.value;
  for (const p of viewer.planes) if (p.station) p.stationLabel = `${t('st.axis')} ${formatStation(p.station.al.station0 + p.station.s)}`;
  alignmentLayer.rebuild();
  measure.refresh();
  renderPlanes();
  secViewer?.planesChanged?.();
  projects.touch?.();
}
for (const sel of $$('.station-format')) {
  sel.replaceChildren(...Object.entries(STATION_FORMATS).map(([k, ex]) => h('option', { value: k, text: ex })));
  sel.value = stationFormat.value;
  sel.addEventListener('change', (e) => applyStationFormat(e.target.value));
}

// Station marks of alignments: automatic, a fixed interval, or off (only the line)
function applyStationInterval() {
  const sel = $('#station-interval').value;
  $('#station-custom-wrap').hidden = sel !== 'custom';
  let v = sel;
  if (sel === 'custom') { const c = +$('#station-custom').value; v = Number.isFinite(c) && c > 0 ? c : 'auto'; }
  alignmentLayer.interval = v === 'auto' ? 'auto' : Number(v);
  alignmentLayer.rebuild();
  try { localStorage.setItem('onlineifc.stationInterval', JSON.stringify({ sel, custom: $('#station-custom').value })); } catch { /* ignore */ }
}
try {
  const saved = JSON.parse(localStorage.getItem('onlineifc.stationInterval') || 'null');
  if (saved) { $('#station-interval').value = saved.sel; $('#station-custom').value = saved.custom; }
} catch { /* ignore */ }
$('#station-interval').addEventListener('change', applyStationInterval);
$('#station-custom').addEventListener('change', applyStationInterval);
applyStationInterval();
for (const cb of $$('[data-spot-show]')) {
  cb.checked = !!measure.spotShow[cb.dataset.spotShow];
  cb.addEventListener('change', () => measure.setSpotShow(cb.dataset.spotShow, cb.checked));
}

// ===================================================================== settings
// What is set once and kept in this browser: stationing, the look of the cut, measuring, the view.
// Most controls are the app's own (wired up where they belong, above and in app/profile.js); here
// only language, theme, view cube, depth shading and the point budget, which have a button or a
// card of their own too.
const BUDGET_KEY = 'vispecta.pointBudget';
function openSettings(section = null) {
  $('#settings-lang').value = getLang();
  let theme = null;
  try { theme = localStorage.getItem(THEME_KEY); } catch { /* ignore */ }
  $('#settings-theme').value = theme === 'dark' || theme === 'light' ? theme : 'auto';
  $('#settings-viewcube').checked = !viewCube.el.hidden;
  $('#settings-edl').checked = !!viewer.edl;
  let budget = null;
  try { budget = localStorage.getItem(BUDGET_KEY); } catch { /* ignore */ }
  $('#settings-budget').value = [...$('#settings-budget').options].some((o) => o.value === budget) ? budget : 'auto';
  const d = $('#settings-dialog');
  if (!d.open) d.showModal();
  // opened from a panel: its part of the settings
  const part = section && $(`#settings-dialog [data-settings-section="${section}"]`);
  if (part) { part.scrollIntoView({ block: 'start' }); part.querySelector('select, input')?.focus(); }
}
$('#settings-lang').addEventListener('change', (e) => {
  const sel = $('#lang-select');
  sel.value = e.target.value;
  sel.dispatchEvent(new Event('change'));
});
$('#settings-theme').addEventListener('change', (e) => {
  try {
    if (e.target.value === 'auto') localStorage.setItem(THEME_KEY, 'auto'); // follows the system (currentTheme)
    else localStorage.setItem(THEME_KEY, e.target.value);
  } catch { /* ignore */ }
  applyTheme();
});
$('#settings-viewcube').addEventListener('change', (e) => setViewCube(e.target.checked));
$('#settings-edl').addEventListener('change', (e) => { setEdl(e.target.checked); renderModels(); });
$('#settings-budget').addEventListener('change', (e) => {
  try { localStorage.setItem(BUDGET_KEY, e.target.value === 'auto' ? '' : e.target.value); } catch { /* ignore */ }
});

// ====================================================================== filters
const filters = new FilterPanel({
  viewer, h, toast, withLoading,
  root: $('#filters'),
  setSelection: (map) => {
    state.selection.clear();
    state.treeKeys.clear();
    for (const [m, ids] of map) if (ids.length) state.selection.set(m, new Set(ids));
    state.active = null;
    applySelection();
  },
  refreshVisibility: () => refreshVisibilityUi(),
});

const qto = new QtoTable({
  viewer, h, toast, download, state, addCloseX,
  ensureIndex: () => filters.ensureIndex(),
  setSelection: (map) => filters.ctx.setSelection(new Map([...map].map(([m, ids]) => [m, ids]))),
}, $('#qto-dialog'));

// ======================================================================= issues
export const issues = new IssuesPanel({
  viewer, h, toast, download, state,
  root: $('#issues'),
  setSelection: (map) => {
    state.selection.clear();
    state.treeKeys.clear();
    for (const [m, ids] of map) if (ids.length) state.selection.set(m, new Set(ids));
    state.active = null;
    applySelection();
  },
  setSpacesVisible: (v) => { state.spacesVisible = v; updateSpacesUi(); },
  afterVisibility: () => { refreshVisibilityUi(); renderPlanes(); },
});

const views = new ViewsPanel({
  viewer, h, toast, download, state, issues,
  // point clouds in the workspace file: names and settings (#52)
  cloudSettings: () => viewer.clouds.map(cloudSettings),
  restoreClouds: (list, opts) => { restoreCloudSettings(list, opts); renderModels(); cloudsChanged(); },
  root: $('#views'),
  setSelection: (map) => issues.ctx.setSelection(map),
  setSpacesVisible: (v) => issues.ctx.setSpacesVisible(v),
  afterVisibility: () => { refreshVisibilityUi(); renderPlanes(); renderModels(); },
  setXray: (on) => setXray(on),
});

// ===================================================================== projects
export const projects = new ProjectManager({
  viewer, views, issues, state, h, toast,
  clearModels: () => {
    lineEditor.end(false);
    drawnPaths.length = 0;
    state.modelGroups = [];
    for (const m of [...viewer.models]) viewer.removeModel(m);
    for (const c of [...viewer.clouds]) viewer.removeCloud(c); // a project holds its point clouds too (#52)
    viewer.projectCrs = null; setProjectCrsChosen(false); // and its coordinate system (#107)
    state.selection.clear();
    state.treeKeys.clear();
    state.active = null;
    afterModelsChanged();
  },
  openFiles: (files, keys) => openIfcFiles(files, keys),
  openClouds: (files) => openCloudFiles(files),
  afterRestore: () => { updateSpacesUi(); afterModelsChanged(); },
  getExtra: () => ({
    lines: drawnPaths.map((p) => ({ name: p.name, pts: pathPoints(p), ...(p.hidden ? { hidden: true } : {}) })),
    groups: state.modelGroups.map(({ id, name, visible, open }) => ({ id, name, visible, open })),
    models: viewer.models.map((m) => ({ key: projects.keys.get(m) || null, name: m.name, alias: m.alias || null, group: m.groupId || null, color: m.overrideColor ? `#${m.overrideColor.getHexString()}` : null,
      // alignments: alias and visibility per alignment (#89); terrain: height colours on or off (#90)
      alignments: (m.alignments || []).some((a) => a.alias || a.hidden) ? m.alignments.map((a) => ({ alias: a.alias || null, hidden: !!a.hidden })) : undefined,
      crs: m.crs !== m.crsDetected ? m.crs || null : undefined, // a coordinate system chosen by hand (#107)
      heightColors: m.terrain ? m.heightColors || false : undefined, contours: m.terrain ? m.contours || false : undefined })),
    stationFormat: stationFormat.value, // the client's stationing format stays with the project (#29)
    annotEdits: annotEdits.size ? [...annotEdits] : undefined, // points chosen by hand (#48)
    drawingPresets: userPresets.length ? userPresets : undefined, // drawing presets (#51)
    clouds: viewer.clouds.length ? viewer.clouds.map(cloudSettings) : undefined, // point cloud settings (#52)
    cloudSlab: viewer.cloudSlab,
    // the project's coordinate system and the definitions of the user's own systems (#107)
    projectCrs: viewer.projectCrs || null, projectCrsChosen,
    crsDefs: customDefs([viewer.projectCrs, ...viewer.models.map((m) => m.crs), ...viewer.clouds.map((c) => c.crs)].filter(Boolean)),
    corridor: corridor.def ? { path: corridor.def.al.name, drawn: !!corridor.def.al.drawn, offsets: corridor.def.offsets, from: corridor.def.from, to: corridor.def.to } : null, // (#26)
    annotations: notes.items.length ? notes.toJSON() : undefined, // notes and arrows in the view (#130)
    gauge: gaugeState() || undefined, // the structure gauge shown along a track (#127)
  }),
  setExtra: (x) => {
    // drawing presets of the project join the ones in this browser (#51)
    for (const pr of x?.drawingPresets || []) if (pr?.name && !userPresets.some((q) => q.name === pr.name)) userPresets.push(pr);
    renderPresetSelect();
    annotEdits.clear();
    for (const [k, e] of x?.annotEdits || []) annotEdits.set(k, { removed: e.removed || [], added: e.added || [] });
    drawnPaths.length = 0;
    for (const l of x?.lines || []) drawnPaths.push(Object.assign(makePath(l.name, l.pts), l.hidden ? { hidden: true } : {}));
    state.modelGroups = (x?.groups || []).map((g) => ({ ...g }));
    for (const m of viewer.models) {
      const info = (x?.models || []).find((i) => (i.key && i.key === projects.keys.get(m)) || i.name === m.name);
      m.alias = info?.alias || null;
      m.groupId = info?.group || null;
      (m.alignments || []).forEach((a, i) => {
        const ai = info?.alignments?.[i];
        a.hidden = !!ai?.hidden; a.alias = ai?.alias || null; a.name = a.alias || a.ifcName || a.name;
      });
      if (m.terrain && info && 'heightColors' in info) m.setHeightColors(info.heightColors || false);
      if (m.terrain && info && 'contours' in info && (info.contours || false) !== (m.contours || false)) setContours(m, info.contours || false);
      if (info && 'color' in info) m.setColor(info.color || null);
      if (info && info.crs !== undefined) m.crs = info.crs || null; // chosen by hand; else as the file says
      const g = groupOf(m);
      m.setGroupHidden(g ? !g.visible : false);
    }
    if (x?.stationFormat) applyStationFormat(x.stationFormat);
    addDefs(x?.crsDefs);
    if (x && 'projectCrs' in x) { viewer.projectCrs = x.projectCrs || null; setProjectCrsChosen(x.projectCrsChosen); }
    restoreCloudSettings(x?.clouds || [], { slab: x?.cloudSlab });
    crsChanged({ quiet: true });
    updateAlignments();
    const cd = x?.corridor, cal = cd && allAlignments().find((a) => a.name === cd.path && !!a.drawn === cd.drawn);
    if (cal) corridor.set({ al: cal, offsets: cd.offsets, from: cd.from, to: cd.to }); else corridor.clear();
    notes.fromJSON(x?.annotations || []);
    restoreGauge(x?.gauge || null);
    renderModels();
  },
});
viewer.addEventListener('modelremoved', ({ model }) => projects.modelRemoved(model));
projects.addEventListener('change', () => { renderProjectBar(); if (!viewer.models.length) renderRecentProjects(); if ($('#projects-dialog').open) renderProjectsDialog(); });

/** Recent projects on the start screen. */
async function renderRecentProjects() {
  const box = $('#recent-projects');
  if (!projects.enabled) { box.hidden = true; return; }
  const n = await projects.renderList($('#recent-list'), { limit: 4 });
  box.hidden = n === 0;
}

/** The project line at the top of the Models tab. */
function renderProjectBar() {
  const bar = $('#project-bar');
  bar.hidden = !viewer.models.length;
  if (bar.hidden) return;
  $('#project-name').textContent = projects.current?.name || t('proj.unsaved');
  $('#project-status').textContent = projects.statusText();
}

async function renderProjectsDialog() {
  $('#proj-enabled').checked = projects.enabled;
  const n = await projects.renderList($('#proj-list'), { onOpen: () => $('#projects-dialog').close() });
  $('#proj-empty').hidden = n > 0;
  const u = await projects.usage();
  $('#proj-usage').textContent = t('proj.usage', { files: projects.fmtBytes(u.files), geom: projects.fmtBytes(u.geom), free: u.quota ? projects.fmtBytes(u.quota) : '?' });
}

function openProjectsDialog() {
  renderProjectsDialog();
  $('#projects-dialog').showModal();
}
$('#proj-enabled').addEventListener('change', (e) => {
  if (!e.target.checked && !confirm(t('proj.disableConfirm'))) { e.target.checked = true; return; }
  projects.setEnabled(e.target.checked);
});
renderRecentProjects();
{ let on = true; try { on = localStorage.getItem(VIEWCUBE_KEY) !== '0'; } catch { /* ignore */ } setViewCube(on); }

// ================================================== ortho, X-ray and storeys
export function setOrtho(on) {
  viewer.setOrthographic(on);
  if (!$('#ortho-check')) return;
  $('#ortho-check').textContent = on ? '☑' : '☐';
  renderStatus();
}

function setXray(on) {
  state.xray = on;
  for (const m of viewer.models) m.setXray(on ? state.selection.get(m) || [] : null);
  $('#xray-check').textContent = on ? '☑' : '☐';
  if (on && !state.selection.size) toast(t('msg.xrayHint'), true);
  renderStatus();
}

/** All storeys of all models, sorted by elevation: [{model, id, name, elevation}] */
function allStoreys() {
  const out = [];
  for (const m of viewer.models) {
    const walk = (n) => {
      if (m.typeName(n.expressID) === 'IfcBuildingStorey') {
        const line = m.api.GetLine(m.modelID, n.expressID, false);
        const ev = line?.Elevation;
        const v = ev && typeof ev === 'object' ? Number(ev._representationValue ?? ev.value) : NaN;
        out.push({ model: m, id: n.expressID, node: n, name: m.label(n.expressID), elevation: Number.isFinite(v) ? v * (m.lengthScale || 1) : null });
      }
      for (const c of n.children || []) walk(c);
    };
    if (m.tree) walk(m.tree);
  }
  return out.sort((a, b) => (a.elevation ?? 0) - (b.elevation ?? 0));
}

/**
 * The storey menu: one list per model (the model's name as heading when several models have
 * storeys), highest storey first, the elevation to the right. Above it: show all, step up / down
 * and the plan cut switch.
 */
function renderStoreyItems() {
  const box = $('#storey-items');
  const list = allStoreys().filter((st) => st.model.visible);
  const isActive = (st) => state.storey?.id === st.id && state.storey?.model === st.model;
  const elev = (v) => (v === null ? '–' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2).replace('.', decimalSign())}`);
  const row = (st) => {
    const b = h('button', { class: `sto-row${isActive(st) ? ' active' : ''}`, title: `${st.name}${st.elevation !== null ? ` · ${elev(st.elevation)} m` : ''}` },
      h('span', { class: 'sto-dot' }), h('span', { class: 'sto-name', text: st.name }), h('span', { class: 'sto-elev', text: elev(st.elevation) }));
    b.addEventListener('click', () => { closeMenus(); showStorey(st); });
    return b;
  };
  if (!list.length) { box.replaceChildren(h('div', { class: 'menu-empty', text: t('mi.noStoreys') })); return; }

  const stepBtn = (text, title, dir) => h('button', { class: 'btn xs', text, title, onclick: (e) => { e.stopPropagation(); stepStorey(dir); renderStoreyItems(); } });
  const cut = h('label', { class: 'sto-cut', title: t('mi.storeyCutDesc') },
    h('input', { type: 'checkbox', checked: state.storeyCut, onchange: (e) => { state.storeyCut = e.target.checked; if (state.storey) showStorey(state.storey); } }),
    h('span', { text: t('mi.storeyCut') }));
  const head = h('div', { class: 'sto-head' },
    h('button', { class: `btn xs${state.storey ? '' : ' active'}`, text: t('mi.allStoreys'), onclick: () => { closeMenus(); showStorey(null); } }),
    h('span', { class: 'spacer' }),
    stepBtn('▲', t('sto.up'), 1), stepBtn('▼', t('sto.down'), -1), cut);

  const byModel = new Map();
  for (const st of list) { if (!byModel.has(st.model)) byModel.set(st.model, []); byModel.get(st.model).push(st); }
  const multi = byModel.size > 1;
  const groups = [...byModel].map(([m, sts]) => h('div', { class: 'sto-group' },
    multi ? h('div', { class: 'sto-model', title: m.name }, h('span', { text: m.displayName }), h('small', { text: String(sts.length) })) : null,
    [...sts].reverse().map(row)));
  box.replaceChildren(head, h('div', { class: 'sto-list' }, groups), h('div', { class: 'sto-foot', text: t('sto.hint') }));
}

/** The storey menu is shown when the visible models have storeys; its badge names the shown storey. */
function updateStoreyMenu() {
  const any = viewer.models.some((m) => m.visible) && allStoreys().some((st) => st.model.visible);
  $('#storey-menu').hidden = !any;
  const badge = $('#storey-badge');
  badge.hidden = !state.storey;
  if (state.storey) badge.textContent = state.storey.model.label(state.storey.id);
}

/** Colour styles for the original colours (View menu). */
function renderColorStyles() {
  const box = $('#color-style-items');
  box.replaceChildren(...Object.keys(COLOR_STYLES).map((name) => {
    const on = colorStyle.name === name;
    const b = h('button', { class: `menu-item small-item${on ? ' active' : ''}` },
      h('span', { class: `mi-icon cs-swatch cs-${name}` }),
      h('span', { class: 'mi-text' }, h('b', { text: t(`cs.${name}`) }), h('small', { text: t(`cs.${name}Desc`) })),
      on ? h('span', { class: 'mi-tick', text: '✓' }) : null);
    b.addEventListener('click', (e) => { e.stopPropagation(); setColorStyle(name); renderColorStyles(); });
    return b;
  }));
}
function setColorStyle(name) {
  colorStyle.name = COLOR_STYLES[name] !== undefined ? name : 'original';
  applyCvdColors();
  for (const m of viewer.models) m.refreshColors();
  if (comparison) { showComparison(comparison, { showUnchanged: comparison.showUnchanged }); renderComparison(); }
  viewer.invalidate?.();
  try { localStorage.setItem('onlineifc.colorStyle', colorStyle.name); } catch { /* ignore */ }
}
try { const v = localStorage.getItem('onlineifc.colorStyle'); if (v && v in COLOR_STYLES) colorStyle.name = v; } catch { /* ignore */ }
/** The colour-blind friendly style also changes the comparison and IDS colours (3D and panels). */
function applyCvdColors() {
  const cvd = colorStyle.name === 'cvd';
  setCompareColors(cvd);
  setIdsColors(cvd);
  document.documentElement.toggleAttribute('data-cvd', cvd);
}
applyCvdColors();

let storeyPlane = null;
function showStorey(st) {
  if (storeyPlane) { viewer.removePlane(storeyPlane); storeyPlane = null; }
  state.storey = st ? { model: st.model, id: st.id } : null;
  if (!st) {
    showAll();
    renderPlanes();
    updateStoreyMenu();
    return;
  }
  const ids = descendantIds(st.model, st.node);
  for (const m of viewer.models) m.isolate(m === st.model ? ids : []);
  if (state.storeyCut && st.elevation !== null) {
    storeyPlane = viewer.addPlane('y');
    const y = viewer.fromIfc(0, 0, st.elevation + 1.2).y;
    viewer.setPlanePos(storeyPlane, y);
  }
  refreshVisibilityUi();
  renderPlanes();
  updateStoreyMenu();
  const b = st.model.getBox(ids);
  if (!b.isEmpty()) viewer.fitBox(b);
  toast(t('msg.storeyShown', { name: st.name }), true);
}

function stepStorey(dir) {
  const list = allStoreys();
  if (!list.length) return;
  let i = state.storey ? list.findIndex((x) => x.id === state.storey.id && x.model === state.storey.model) : -1;
  i = i < 0 ? (dir > 0 ? 0 : list.length - 1) : Math.min(list.length - 1, Math.max(0, i + dir));
  showStorey(list[i]);
}

// ===================================================================== opacity
for (const r of $$('[data-sel-opacity]')) {
  r.addEventListener('input', () => {
    for (const other of $$('[data-sel-opacity]')) if (other !== r) other.value = r.value;
    for (const [m, set] of state.selection) m.setElementOpacity(set, +r.value);
  });
}
$('#measure-lock-xy').addEventListener('change', (e) => { measure.lockXY = e.target.checked; });

// ======================================================================== merge
function openMergeDialog() {
  if (viewer.models.length < 2) return toast(t('merge.needTwo'));
  const list = $('#merge-models');
  list.replaceChildren(...viewer.models.map((m) => h('label', { class: 'chk' },
    h('input', { type: 'checkbox', value: String(m.uid), checked: true }),
    h('span', { text: `${modelTitle(m)} · ${m.schema}` }))));
  $('#merge-dialog').showModal();
}

async function runMerge() {
  const uids = $$('#merge-models input:checked').map((i) => +i.value);
  const models = viewer.models.filter((m) => uids.includes(m.uid));
  if (models.length < 2) return toast(t('merge.needTwo'));
  // The merged file gets the length unit of the first file. Files whose geometry is in different
  // units cannot be combined correctly in the text; a file whose unit was corrected should not be first.
  const shown = new Set(models.map((m) => +m.shownLengthScale.toPrecision(6)));
  if (shown.size > 1 && !confirm(t('units.mergeDiffer', { units: [...shown].map(unitLabel).join(' / ') }))) return;
  if (models[0].unitFix !== 1) {
    const i = models.findIndex((m) => m.unitFix === 1 && +m.shownLengthScale.toPrecision(6) === +models[0].shownLengthScale.toPrecision(6));
    if (i > 0) models.unshift(...models.splice(i, 1));
  }
  const name = ($('#merge-name').value.trim() || 'merged.ifc').replace(/(\.ifc)?$/i, '.ifc');
  const replace = $('#merge-replace').checked;
  const dl = $('#merge-download').checked;
  $('#merge-dialog').close();
  // Streamed merge on the STEP text (merge.js): fast and needs little memory, also for large models
  let res;
  try {
    const sources = [];
    for (const m of models) sources.push({ name: m.name, blob: m.changes.length || !m.sourceBlob ? new Blob([await m.getBytes()]) : m.sourceBlob });
    res = await withLoading((progress) => mergeIfcBlobs(sources, (f, file) => progress(t('merge.progress', { name: file || '' }), f)));
  } catch (e) {
    console.error(e);
    toast(t('merge.failed', { error: e.message || e }));
    return;
  }
  if (dl) download(name, res.blob, 'application/x-step');
  // remove the source models first, so their memory is free before the merged model is loaded
  if (replace) {
    for (const m of models) {
      state.selection.delete(m);
      if (state.active?.model === m) state.active = null;
      viewer.removeModel(m);
    }
    afterModelsChanged();
  }
  try {
    await loadBytes(name, res.blob);
    viewer.fitAll();
    toast(t('merge.doneMsg', { n: models.length, entities: fmtNum(res.entities), combined: res.combined }), true);
  } catch (e) {
    console.error(e);
    toast(t('msg.loadFailed', { name, error: e.message || e }));
  }
}

// ======================================================================== split (#129)
/** The elements to write per model: the selection, or what is visible. */
function splitSets(what) {
  const out = new Map();
  if (what === 'selected') {
    for (const [m, set] of state.selection) if (set.size && m.getBytes) out.set(m, new Set(set));
  } else {
    for (const m of viewer.models) {
      if (!m.getBytes || !m.visible) continue;
      const ids = new Set([...m.elementIds].filter((id) => !m.isHidden(id)));
      if (ids.size) out.set(m, ids);
    }
  }
  return out;
}

function openSplitDialog() {
  if (!viewer.models.some((m) => m.getBytes)) return toast(t('split.noModels'));
  const count = (map) => [...map.values()].reduce((n, s) => n + s.size, 0);
  const sel = count(splitSets('selected')), vis = count(splitSets('visible'));
  $('#split-n-sel').textContent = t('split.selected', { n: fmtNum(sel) });
  $('#split-n-vis').textContent = t('split.visible', { n: fmtNum(vis) });
  const radios = $$('input[name="split-what"]');
  radios[0].disabled = !sel;
  radios[sel ? 0 : 1].checked = true;
  $('#split-dialog').showModal();
}

async function runSplit() {
  const what = $('input[name="split-what"]:checked')?.value || 'selected';
  const sets = splitSets(what);
  if (!sets.size) return toast(t(what === 'selected' ? 'msg.selectFirst' : 'split.nothing'));
  const suffix = $('#split-suffix').value.trim();
  const dl = $('#split-download').checked, open = $('#split-open').checked;
  $('#split-dialog').close();
  const results = [];
  try {
    await withLoading(async (progress) => {
      let i = 0;
      for (const [m, ids] of sets) {
        // as merge: the original file unless properties were edited in the viewer
        const blob = m.changes?.length || !m.sourceBlob ? new Blob([await m.getBytes()]) : m.sourceBlob;
        const res = await splitIfcBlob(blob, ids, (f) => progress(t('split.progress', { name: modelTitle(m) }), (i + f) / sets.size));
        results.push({ name: `${m.name.replace(/\.ifc$/i, '')}${suffix}.ifc`, ...res });
        i++;
      }
    });
  } catch (e) {
    console.error(e);
    return toast(t('split.failed', { error: e.message || e }));
  }
  for (const r of results) {
    if (dl) download(r.name, r.blob, 'application/x-step');
    if (open) {
      try { await loadBytes(r.name, r.blob); } catch (e) { console.error(e); toast(t('msg.loadFailed', { name: r.name, error: e.message || e })); }
    }
  }
  toast(t('split.doneMsg', { n: fmtNum(results.reduce((a, r) => a + r.products, 0)), files: results.length }), true);
}

// ======================================================================= python
export const python = new PythonPanel({
  getContext: () => ({ models: viewer.models, active: state.active?.model || [...state.selection.keys()][0] || null, selection: state.selection }),
  onActions: async (actions) => {
    for (const a of actions) {
      if (a.kind === 'update') {
        const old = viewer.models.find((m) => String(m.uid) === a.key);
        if (!old) continue;
        const nm = await loadBytes(old.name, a.bytes, { replace: old });
        python.engine.rekey(old, nm);
        nm.changes = [...old.changes, { time: new Date(), description: t('chg.python') }];
        nm.version = 1;
        python.engine.sent.set(String(nm.uid), nm.version);
        renderModels();
      } else if (a.kind === 'add') {
        await loadBytes(a.name, a.bytes);
        viewer.fitAll();
      } else if (a.kind === 'download') {
        if (a.bytes) download(a.name, a.bytes, 'application/x-step');
        else download(a.name, a.text, /\.csv$/i.test(a.name) ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8');
      } else if (a.kind === 'select') {
        state.selection.clear();
        state.active = null;
        for (const [key, ids] of Object.entries(a.ids)) {
          const m = viewer.models.find((x) => String(x.uid) === key);
          if (m) state.selection.set(m, new Set(ids));
        }
        applySelection();
      }
    }
  },
  onOpenChange: (open) => {
    for (const b of $$('.toolbar [data-action="toggle-python"]')) b.classList.toggle('on', open);
    document.body.classList.toggle('py-open', open);
    viewer.resize();
  },
});

// ======================================================================= status
export function renderStatus() {
  viewer.invalidate(); // the status changes with almost every change of the scene
  const models = viewer.models.length;
  const cloudPts = viewer.clouds.reduce((n, c) => n + c.count, 0);
  if (!models && !cloudPts) { $('#statusbar').textContent = t('status.ready'); return; }
  if (!models) { $('#statusbar').textContent = t('status.clouds', { n: viewer.clouds.length, pts: fmtNum(cloudPts) }); return; }
  let elements = 0, hidden = 0;
  for (const m of viewer.models) { elements += m.elementIds.size; hidden += m.hidden.size; }
  const sel = selectionCount();
  $('#statusbar').textContent = [
    t('status.models', { n: models }),
    t('status.elements', { n: fmtNum(elements) }),
    cloudPts ? t('status.clouds', { n: viewer.clouds.length, pts: fmtNum(cloudPts) }) : null,
    hidden ? t('status.hidden', { n: fmtNum(hidden) }) : null,
    sel ? t('status.selected', { n: fmtNum(sel) }) : null,
    viewer.planes.length ? t('status.sections', { n: viewer.planes.length }) : null,
    state.editMode ? t('status.editMode') : null,
    viewer.isOrtho ? t('status.ortho') : null,
    walk.active ? t('status.walk', { speed: walk.speed.toFixed(1) }) : null,
    state.xray ? t('status.xray') : null,
    state.storey ? t('status.storey', { name: state.storey.model.label(state.storey.id) }) : null,
    measure.mode ? t(`measure.${measure.mode}`) : null,
  ].filter(Boolean).join('  ·  ');
}

// ====================================================================== helpers

window.addEventListener('beforeunload', (e) => {
  if (viewer.models.some((m) => m.changes.length) || issues.dirty) { e.preventDefault(); e.returnValue = ''; }
});

renderAll();

// For debugging in the console
// ================================================================ installable app
// Files opened with the installed app (file handler in the manifest)
if ('launchQueue' in window) {
  window.launchQueue.setConsumer(async (params) => {
    if (!params.files?.length) return;
    const files = await Promise.all(params.files.map((fh) => fh.getFile()));
    openFiles(files);
  });
}
// Service worker: offline use and fast start (only in the built app, not in the dev server)
if (import.meta.env.PROD && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('service worker', e)));
}

// ======================================================================= undo / redo (#67)
// Snapshots of what the user changes (see history.js): visibility and colours of elements and models,
// model groups, section planes, measurements, drawn lines and the corridor.
const modelUid = new WeakMap();
let modelSeq = 0;
const uidOf = (m) => { if (!modelUid.has(m)) modelUid.set(m, ++modelSeq); return modelUid.get(m); };

function captureState() {
  const st = {
    models: viewer.models.map((m) => ({
      m, hidden: [...m.hidden], colors: [...m.elementColor], opac: [...m.elementOpacity],
      vis: m.ownVisible !== false, color: m.overrideColor ? m.overrideColor.getHex() : null, opacity: m.opacity, group: m.groupId || null,
    })),
    groups: state.modelGroups.map((g) => ({ ...g })),
    planes: viewer.planes.map((p) => ({
      axis: p.axis, axisVec: p.axisVec.toArray(), n: p.plane.normal.toArray(), c: p.plane.constant,
      enabled: p.enabled, cut3d: p.cut3d !== false, boxPart: p.boxPart || null,
      station: p.station ? { al: p.station.al, s: p.station.s, T: p.station.T.toArray() } : null,
      anchor: p.anchor ? p.anchor.toArray() : null,
    })),
    measures: [...measure.items],
    lines: drawnPaths.map((p) => ({ p, name: p.name, hidden: !!p.hidden, pts: pathPoints(p) })),
    alignments: viewer.models.flatMap((m) => (m.alignments || []).map((a) => ({ a, hidden: !!a.hidden, alias: a.alias || null }))), // (#89)
    corridor: corridor.def ? { ...corridor.def, offsets: [...corridor.def.offsets] } : null,
    // annotated points removed / added by hand in the section window (#48)
    points: [...annotEdits].map(([k, e]) => [k, { removed: e.removed.map((q) => [...q]), added: e.added.map((q) => [...q]) }]),
  };
  const r = (x) => Math.round(x * 1e4) / 1e4;
  const key = JSON.stringify({
    models: st.models.map((x) => [uidOf(x.m), x.hidden.length, x.hidden, x.colors, x.opac, x.vis, x.color, x.opacity, x.group]),
    groups: st.groups.map((g) => [g.id, g.name, g.visible]),
    planes: st.planes.map((p) => [p.axis, p.n.map(r), r(p.c), p.enabled, p.cut3d, p.boxPart, p.station ? [p.station.al.id || p.station.al.name, r(p.station.s)] : null]),
    measures: st.measures.map((m) => m.id),
    lines: st.lines.map((l) => [l.p.id, l.name, l.hidden, l.pts.map((q) => q.map(r))]),
    alignments: st.alignments.map((x) => [x.hidden, x.alias]),
    corridor: st.corridor ? [st.corridor.al.id || st.corridor.al.name, st.corridor.offsets, r(st.corridor.from), r(st.corridor.to)] : null,
    points: st.points,
  });
  return { key, models: viewer.models.map(uidOf).join(','), state: st };
}

function restoreState(st) {
  // models: colours, transparency and hidden elements, own visibility, colour, opacity, group
  for (const x of st.models) {
    const m = x.m;
    if (!viewer.models.includes(m)) continue;
    m.elementOpacity = new Map(x.opac);
    m.setElementColors(new Map(x.colors));
    m.hidden.clear();
    m.hide(x.hidden);
    m.setVisible(x.vis);
    m.setColor(x.color);
    m.setOpacity(x.opacity);
    m.groupId = x.group;
  }
  state.modelGroups = st.groups.map((g) => ({ ...g }));
  for (const m of viewer.models) { const g = state.modelGroups.find((x) => x.id === m.groupId); m.setGroupHidden(g ? !g.visible : false); }
  for (const x of st.alignments || []) { x.a.hidden = x.hidden; x.a.alias = x.alias; x.a.name = x.alias || x.a.ifcName || x.a.name; } // (#89)
  // drawn lines first: station planes and the corridor may lie on them
  drawnPaths.length = 0;
  for (const l of st.lines) {
    const g = makePath(l.name, l.pts);
    Object.assign(l.p, { name: l.name, hidden: l.hidden, poly: g.poly, cum: g.cum, length: g.length, zs: g.zs });
    drawnPaths.push(l.p);
  }
  if (st.corridor) corridor.set({ ...st.corridor, offsets: [...st.corridor.offsets] }); else corridor.clear();
  setCorridorHits(null);
  // section planes – only rebuilt when they differ (rebuilding replaces the plane objects, and the
  // section window would lose its plane); the section window stays on the plane at the same place
  const planeSig = (list) => JSON.stringify(list.map((p) => [p.axis, p.n.map((v) => v.toFixed(6)), p.c.toFixed(5), p.enabled, p.cut3d, p.boxPart, p.station ? [p.station.al.id || p.station.al.name, p.station.s.toFixed(4)] : null]));
  const nowPlanes = captureState().state.planes;
  const svIndex = secViewer?.isOpen ? viewer.planes.indexOf(secViewer.plane) : -1;
  if (planeSig(nowPlanes) !== planeSig(st.planes)) viewer.clearPlanes();
  for (const s of planeSig(nowPlanes) !== planeSig(st.planes) ? st.planes : []) {
    const e = viewer.addPlane(s.axis === 'custom' ? 'x' : s.axis);
    e.axis = s.axis;
    e.axisVec.fromArray(s.axisVec);
    e.plane.normal.fromArray(s.n);
    e.plane.constant = s.c;
    e.enabled = s.enabled;
    if (!s.cut3d) e.cut3d = false;
    if (s.boxPart) e.boxPart = s.boxPart;
    if (s.station) e.station = { al: s.station.al, s: s.station.s, T: new THREE.Vector3().fromArray(s.station.T) };
    if (s.anchor) e.anchor = new THREE.Vector3().fromArray(s.anchor);
    viewer.updatePlane(e);
  }
  if (svIndex >= 0 && viewer.planes[svIndex] && secViewer.plane !== viewer.planes[svIndex]) secViewer.open(viewer.planes[svIndex]);
  measure.restore(st.measures);
  annotEdits.clear();
  for (const [k, e] of st.points || []) annotEdits.set(k, { removed: e.removed.map((q) => [...q]), added: e.added.map((q) => [...q]) });
  afterModelsChanged();
  refreshVisibilityUi();
  renderPlanes();
  renderModels();
  secViewer?.planesChanged?.();
  if (secViewer?.isOpen) secViewer.update(); // the hand-picked points may have changed (#48)
  projects.touch?.();
}

/** What changed between two snapshots, in words (for "Undid: …"). */
function describeChange(a, b) {
  const A = a.state, B = b.state, out = [];
  const hid = (s) => s.models.reduce((n, x) => n + x.hidden.length, 0);
  const dh = hid(B) - hid(A);
  if (dh > 0) out.push(t('undo.hide', { n: fmtNum(dh) }));
  else if (dh < 0) out.push(t('undo.show', { n: fmtNum(-dh) }));
  const k = (s, f) => JSON.stringify(s.models.map(f));
  if (k(A, (x) => [x.colors, x.opac]) !== k(B, (x) => [x.colors, x.opac])) out.push(t('undo.colours'));
  if (k(A, (x) => [x.vis, x.color, x.opacity, x.group]) !== k(B, (x) => [x.vis, x.color, x.opacity, x.group]) || JSON.stringify(A.groups) !== JSON.stringify(B.groups)) out.push(t('undo.models'));
  if (A.planes.length < B.planes.length) out.push(t('undo.addSection'));
  else if (A.planes.length > B.planes.length) out.push(t('undo.removeSection'));
  else if (JSON.stringify(A.planes.map((p) => [p.n, p.c, p.enabled, p.cut3d])) !== JSON.stringify(B.planes.map((p) => [p.n, p.c, p.enabled, p.cut3d]))) out.push(t('undo.moveSection'));
  if (A.measures.length !== B.measures.length) out.push(t('undo.measure'));
  if (JSON.stringify(A.lines.map((l) => [l.p.id, l.name, l.hidden, l.pts])) !== JSON.stringify(B.lines.map((l) => [l.p.id, l.name, l.hidden, l.pts]))) out.push(t('undo.line'));
  if (JSON.stringify(A.corridor && [A.corridor.offsets, A.corridor.from, A.corridor.to]) !== JSON.stringify(B.corridor && [B.corridor.offsets, B.corridor.from, B.corridor.to])) out.push(t('undo.corridor'));
  if (JSON.stringify(A.points) !== JSON.stringify(B.points)) out.push(t('undo.points'));
  return out.join(', ') || t('undo.change');
}

const history = new History({
  capture: captureState,
  restore: restoreState,
  describe: describeChange,
  onChange: (canUndo, canRedo) => {
    $('#undo-btn').disabled = !canUndo;
    $('#redo-btn').disabled = !canRedo;
  },
});
function doUndo() { const what = history.undo(); toast(what ? t('undo.undid', { what }) : t('undo.nothing')); }
function doRedo() { const what = history.redo(); toast(what ? t('undo.redid', { what }) : t('undo.nothingRedo')); }
$('#undo-btn').addEventListener('click', doUndo);
$('#redo-btn').addEventListener('click', doRedo);
// an action has (probably) happened: the history takes a snapshot once things have settled
for (const ev of ['pointerup', 'keyup', 'change', 'click']) document.addEventListener(ev, () => history.touch(), true);
viewer.addEventListener('planeschanged', () => history.touch());
measure.addEventListener?.('change', () => history.touch());
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  if (e.target.closest?.('input, textarea, select, .cm-editor, [contenteditable]')) return; // the field's own undo
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); } else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); doRedo(); }
});
history.commit();

// installed as an app (standalone window): the window and the taskbar say just "Vispecta"; the long
// title stays for search engines and browser tabs
const standalone = window.matchMedia?.('(display-mode: standalone), (display-mode: window-controls-overlay)');
const appTitle = () => { if (standalone?.matches || navigator.standalone) document.title = 'Vispecta'; };
appTitle();
standalone?.addEventListener?.('change', appTitle);
window.onlineIfc = { viewer, state, openFiles, python, measure, notes, views, walk, drawnPaths, projects, history, get secViewer() { return secViewer; } };
