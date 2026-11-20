// Point clouds in the UI (#27, #52; #63 moved out of main.js): opening, their cards, COPC
// streaming and their settings in projects and workspaces.
import { t, fmtNum } from '../i18n.js';
import { pointAt } from '../alignment.js';
import { loadPointCloud, LAS_CLASSES, classColor as lasClassColor } from '../pointcloud.js';
import { isCopc, openCopc } from '../copc.js';
import { h, toast, viewer, withLoading } from './core.js';
import { secViewer } from './sections.js';
import { breakableName, inlineEdit, renderModels } from './browser.js';
import { crsChanged, crsRow, projectCrsChosen } from './crs.js';
import { openTerrainDialog } from './terrain.js';
import { afterModelsChanged, projects, renderStatus } from '../main.js';

// ------------------------------------------------------------- point clouds (#27)
export const CLOUD_FILE = /\.(las|laz|e57|ply|xyz|pts|csv|txt)$/i;
viewer.cloudSlab = 0.1; // half thickness (m) of the slab of points shown in sections
// file handles of dropped files (Chromium): a project can then open a large cloud again from where it is (#52)
export const fileHandles = new Map();
export const fileId = (f) => `${f.name}|${f.size}|${f.lastModified}`;
// cloud settings from a project or a workspace, for clouds that are opened later (by file name)
const pendingCloudSettings = new Map();

export async function openCloudFiles(list) {
  for (const file of list) {
    let cloud;
    try {
      cloud = await withLoading(async (progress) => {
        const onProgress = (f) => progress(t('pc.loading', { name: file.name }), f);
        // COPC (cloud-optimised LAZ): opened piece by piece and streamed by the view (#52)
        if (await isCopc(file).catch(() => false)) return openCopc(file, { onProgress });
        return loadPointCloud(file, { onProgress });
      });
    } catch (err) {
      console.error(err);
      toast(t('pc.failed', { name: file.name, error: err.message || err }));
      continue;
    }
    const first = !viewer.models.length && viewer.clouds.length === 0;
    if (!projectCrsChosen && !viewer.projectCrs && !viewer.models.length) viewer.projectCrs = cloud.crs; // a cloud first: its system (#107)
    viewer.addCloud(cloud);
    const far = viewer.models.length ? viewer.placeCloud(cloud) : null;
    const settings = pendingCloudSettings.get(file.name);
    if (settings) { applyCloudSettings(cloud, settings); pendingCloudSettings.delete(file.name); }
    if (cloud.stream) setupStream(cloud);
    toast(cloud.stream ? t('pc.loadedCopc', { name: file.name, total: fmtNum(cloud.total), nodes: fmtNum(cloud.stream.nodes.size) })
      : t('pc.loaded', { name: file.name, n: fmtNum(cloud.count), total: fmtNum(cloud.total) }), true);
    if (far !== null && far > 1000) toast(t('pc.far', { name: file.name, km: (far / 1000).toFixed(1) }));
    if (first) viewer.fitBox(cloud.getBox(), { keepDirection: false });
    let handle = null;
    try { handle = (await fileHandles.get(fileId(file))) || null; } catch { handle = null; }
    projects.cloudAdded(cloud, file, handle);
  }
  crsChanged();
  afterModelsChanged();
  secViewer?.planesChanged?.();
}

// --------------------------------------------------------- COPC streaming (#52)
/** Connects a COPC cloud to the view: it loads what the camera, the sections and profiles need. */
function setupStream(c) {
  const st = c.stream;
  // section planes in use: switched on in 3D, or shown in the section window
  st.planes = () => {
    const list = viewer.planes.filter((p) => p.enabled || p === secViewer?.plane);
    return list.map((p) => ({ plane: p.plane, half: viewer.cloudSlab + 0.05 }));
  };
  let timer = 0;
  st.addEventListener('change', () => {
    viewer.invalidate(300);
    // sections, the card and the status bar follow, a little later (points keep coming)
    clearTimeout(timer);
    timer = setTimeout(() => { secViewer?.planesChanged?.(); updateCloudMeta(c); renderStatus(); }, 350);
  });
  st.addEventListener('loading', () => updateCloudMeta(c, true));
  st.addEventListener('idle', () => updateCloudMeta(c));
  refineClouds();
}

export function refineClouds() {
  const viewport = { height: viewer.renderer.domElement.clientHeight };
  for (const c of viewer.clouds) if (c.stream && c.visible) c.stream.refine(viewer.camera, viewport);
}
viewer.addEventListener('camerastill', refineClouds);
viewer.addEventListener('planeschanged', () => { if (viewer.clouds.some((c) => c.stream)) refineClouds(); });

/** The streaming line on a COPC cloud's card. */
function updateCloudMeta(c, loading = false) {
  const el = document.querySelector(`.cloud-card[data-uid="${c.uid}"] .pc-stream`);
  if (el) el.textContent = streamText(c, loading || c.stream?.busy);
}
function streamText(c, loading) {
  const st = c.stream;
  return t(loading ? 'pc.streamLoading' : 'pc.stream', { shown: fmtNum(c.count), total: fmtNum(c.total), nodes: fmtNum(st.shown.length), all: fmtNum(st.nodes.size) });
}

/**
 * Before a profile along a path: COPC clouds load the nodes along it at full density (#52).
 * al: the alignment or drawn line; s0, s1: lengths along it.
 */
export async function streamAlong(al, s0, s1) {
  const streams = viewer.clouds.filter((c) => c.stream && c.visible);
  if (!streams.length) return;
  const pts = [];
  const a = Math.max(0, Math.min(s0, s1)), b = Math.min(al.length, Math.max(s0, s1));
  const n = Math.max(2, Math.ceil((b - a) / 5) + 1);
  for (let i = 0; i < n; i++) { const q = pointAt(al, a + ((b - a) * i) / (n - 1)); pts.push(viewer.fromIfc(q.x, q.y, 0)); }
  for (const c of streams) c.stream.setPath(pts, viewer.cloudSlab + 0.05);
  refineClouds();
  await Promise.all(streams.map((c) => c.stream.whenIdle()));
  for (const c of streams) c.stream.setPath(null);
}

/** Settings of a cloud as stored in projects and workspaces. */
export function cloudSettings(c) {
  return { name: c.name, crs: c.crs || null, alias: c.alias || null, visible: c.visible, mode: c.mode, pointSize: c.pointSize, share: c.share, hidden: [...c.hiddenClasses] };
}
function applyCloudSettings(c, x) {
  if (!x) return;
  c.alias = x.alias || null;
  if ('crs' in x && (x.crs || null) !== c.crs) c.crs = x.crs || null;
  if (typeof x.visible === 'boolean') c.setVisible(x.visible);
  if (x.mode) c.setMode(x.mode);
  if (x.pointSize > 0) c.setPointSize(x.pointSize, viewer.renderer.getPixelRatio());
  if (x.share > 0) c.setShare(x.share);
  for (const k of x.hidden || []) c.setClassHidden(k, true);
}
/** Cloud settings from a project or workspace: applied to open clouds, kept for those opened later. */
export function restoreCloudSettings(list = [], { slab, edl } = {}) {
  if (slab > 0) viewer.cloudSlab = slab;
  if (typeof edl === 'boolean') setEdl(edl);
  for (const x of list) {
    const c = viewer.clouds.find((q) => q.name === x.name);
    if (c) applyCloudSettings(c, x); else pendingCloudSettings.set(x.name, x);
  }
}

/** Eye-dome lighting (#52): depth shading for point clouds, remembered in this browser. */
function setEdl(on) {
  viewer.edl = !!on;
  try { localStorage.setItem('vispecta.edl', on ? '1' : '0'); } catch { /* ignore */ }
  viewer.invalidate();
}
try { viewer.edl = localStorage.getItem('vispecta.edl') === '1'; } catch { viewer.edl = false; }

/** Is anything loaded – IFC models or point clouds (#27)? Sections, measuring and profiles work on both. */
export function hasScene() { return viewer.models.length + viewer.clouds.length > 0; }

/** A card for a point cloud in the model browser. */
export function cloudCard(c) {
  const open = c.cardOpen ?? true;
  const vis = h('input', { type: 'checkbox', title: t('models.visible'), checked: c.visible });
  vis.addEventListener('change', () => { c.setVisible(vis.checked); renderModels(); cloudsChanged(); if (c.stream && c.visible) refineClouds(); });
  const label = h('span', { class: 'card-name', title: c.name }, breakableName(c.alias || c.name));
  const editAlias = () => inlineEdit(label, c.alias, c.name, (v) => { c.alias = v || null; renderModels(); });
  label.addEventListener('dblclick', editAlias);
  const sub = h('span', { class: 'card-file' }, c.alias ? breakableName(c.name) : null,
    h('span', { class: 'muted', text: `${c.alias ? ' · ' : ''}${c.format} · ${t('pc.points', { n: fmtNum(c.stream ? c.total : c.count) })}` }));
  const modes = [['rgb', !!c.rgb], ['class', !!c.classes && c.classCounts.size > 0], ['intensity', !!c.intensity], ['elevation', true], ['single', true]].filter((m) => m[1]);
  const modeSel = h('select', {}, modes.map(([m]) => h('option', { value: m, text: t(`pc.mode.${m}`), selected: m === c.mode })));
  modeSel.addEventListener('change', () => { c.setMode(modeSel.value); renderModels(); cloudsChanged(); });
  const size = h('input', { type: 'range', min: '1', max: '8', step: '0.5', value: String(c.pointSize) });
  const sizeVal = h('span', { class: 'muted', text: `${c.pointSize} px` });
  size.addEventListener('input', () => { c.setPointSize(+size.value, viewer.renderer.getPixelRatio()); sizeVal.textContent = `${size.value} px`; viewer.invalidate(); });
  const share = h('select', { title: t('pc.shareTitle') }, [1, 0.5, 0.25, 0.1].map((f) => h('option', { value: String(f), text: c.stream ? `${f * 100} %` : `${f * 100} % · ${fmtNum(Math.round(c.count * f))}`, selected: f === c.share })));
  share.addEventListener('change', () => { c.setShare(+share.value); viewer.invalidate(); });
  const slab = h('input', { type: 'number', min: '0.01', max: '5', step: '0.05', value: String(viewer.cloudSlab), class: 'num-sm', title: t('pc.slabTitle') });
  slab.addEventListener('change', () => { const v = +slab.value; if (v > 0) { viewer.cloudSlab = v; cloudsChanged(); } });
  const edl = h('input', { type: 'checkbox', checked: !!viewer.edl });
  edl.addEventListener('change', () => { setEdl(edl.checked); renderModels(); projects.touch?.(); });
  // classification: show/hide per class
  const classes = c.classCounts.size > 1 ? h('div', { class: 'pc-classes' }, [...c.classCounts].sort((a, b) => a[0] - b[0]).map(([k, n]) => {
    const cb = h('input', { type: 'checkbox', checked: !c.hiddenClasses.has(k) });
    cb.addEventListener('change', () => { c.setClassHidden(k, !cb.checked); viewer.invalidate(); cloudsChanged(); });
    const sw = h('span', { class: 'pc-swatch' }); sw.style.background = lasClassColor(k);
    return h('label', { class: 'pc-class', title: `${k}` }, cb, sw, h('span', { text: lasClassName(k) }), h('span', { class: 'muted', text: fmtNum(n) }));
  })) : null;
  return h('div', { class: `card model-card cloud-card${open ? ' open' : ''}${c.visible ? '' : ' off'}`, 'data-uid': String(c.uid) },
    h('div', { class: 'card-head' },
      h('button', { class: `mg-caret${open ? ' open' : ''}`, 'aria-expanded': String(open), 'aria-label': t('models.details'), onclick: () => { c.cardOpen = !open; renderModels(); } }),
      vis, h('span', { class: 'pc-icon', 'aria-hidden': 'true', text: '⁘' }),
      h('span', { class: 'card-title' }, label, sub),
      h('button', { class: 'icon-btn', title: t('models.aliasTitle'), text: '✎', onclick: editAlias })),
    open ? h('div', { class: 'card-body' },
      c.stream ? h('div', { class: 'card-meta pc-stream', title: t('pc.streamTitle'), text: streamText(c, c.stream.busy) })
        : h('div', { class: 'card-meta', text: t('pc.meta', { kept: fmtNum(c.count), total: fmtNum(c.total), placement: t(`pc.place.${c.placement}`) }) }),
      c.stream ? h('div', { class: 'card-meta', text: t(`pc.place.${c.placement}`) }) : null,
      c.scans > 1 ? h('div', { class: 'card-meta', text: t('pc.scans', { n: c.scans }) }) : null,
      h('div', { class: 'card-row' }, h('label', { text: t('pc.colour') }), modeSel),
      h('div', { class: 'card-row' }, h('label', { text: t('pc.size') }), size, sizeVal),
      h('div', { class: 'card-row' }, h('label', { text: t('pc.share') }), share),
      h('div', { class: 'card-row' }, h('label', { text: t('pc.slab') }), slab, h('span', { class: 'muted', text: 'm' })),
      h('label', { class: 'card-row check', title: t('pc.edlTitle') }, edl, h('span', { text: t('pc.edl') })),
      ...crsRow(c, (v) => { c.crs = v; crsChanged(); renderModels(); cloudsChanged(); projects.touch?.(); }),
      classes,
      h('div', { class: 'card-btns' },
        h('button', { class: 'btn sm', onclick: () => viewer.fitBox(c.getBox()), text: t('models.zoom') }),
        h('button', { class: 'btn sm', onclick: () => openTerrainDialog(c), text: t('ter.button'), title: t('ter.buttonTitle') }),
        h('button', { class: 'btn sm danger', onclick: () => { if (!confirm(t('pc.removeConfirm', { name: c.name }))) return; viewer.removeCloud(c); projects.cloudRemoved(c); afterModelsChanged(); cloudsChanged(); }, text: t('models.remove') }))) : null);
}

/** Name of a LAS class in the current language (ASPRS names in English as fallback). */
function lasClassName(k) {
  const key = `pc.class.${k}`, v = t(key);
  return v !== key ? v : (LAS_CLASSES[k] || [`Class ${k}`])[0];
}

/** Point clouds changed (colours, classes, slab, visibility): sections and profiles follow. */
export function cloudsChanged() {
  viewer.invalidate();
  secViewer?.planesChanged?.();
}

