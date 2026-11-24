// 2D drawings of sections (#63, moved out of main.js): the drawing dialog, its options, the
// annotated points chosen by hand (#48) and the drawing presets (#51).
import { t, fmtNum, decimalSign } from '../i18n.js';
import { heightAt, formatStation } from '../alignment.js';
import { computeSection, planeAxes, layout, toSvg, toPdf, toDxf, renderBackground, SCALES } from '../drawing.js';
import { $, $$, download, h, toast, viewer, withLoading } from './core.js';
import { projects } from '../main.js';
import { AXIS_LABEL, planMarks, secViewer, sectionLetter, stationText } from './sections.js';
import { exportSeries, updateSeriesUi } from './profile.js';

// ====================================================================== drawing
export function planeLabel(p, i) {
  if (p.station) return `${t('st.section')} ${sectionLetter(p)}–${sectionLetter(p)} · ${t('st.label')} ${stationText(p)} (${p.station.al.name})`;
  return p.boxPart ? `${t('planes.boxPart')} ${p.axis.toUpperCase()} ${p.boxPart}` : `${i + 1}. ${t(AXIS_LABEL[p.axis])} (${viewer.getPlanePos(p).toFixed(2)} m)`;
}

export function openDrawingDialog(plane = null) {
  const planes = viewer.planes.filter((p) => p.enabled);
  if (!planes.length) return toast(t('drw.noPlane'));
  $('#drw-plane').replaceChildren(...planes.map((p, i) => h('option', { value: String(p.id), text: planeLabel(p, i), selected: plane ? p === plane : i === 0 })));
  fillScaleOptions();
  const m = viewer.models[0];
  const pSel = plane || planes[0];
  $('#drw-name').value = `${m ? m.name.replace(/\.ifc$/i, '') : 'Model'} – ${pSel.station ? `${t('st.section')} ${sectionLetter(pSel)}–${sectionLetter(pSel)} (${stationText(pSel)})` : t(AXIS_LABEL[pSel.axis] || 'planes.face')}`;
  restoreDrawingOptions();
  updateSeriesUi();
  renderAnnotClasses();
  updateAnnotUi();
  $('#drawing-dialog').showModal();
}
const DRW_OPTS = 'onlineifc.drawingOptions';
// fields of the label content and number formats (#49), remembered with the other options
const ANN_FMT_IDS = ['ann-row-off', 'ann-row-h', 'ann-row-dist', 'ann-dec', 'ann-off-ref', 'ann-off-zero', 'ann-off-dec', 'ann-off-unit', 'ann-off-pre', 'ann-off-suf', 'ann-off-plus', 'ann-h-ref', 'ann-h-zero', 'ann-h-dec', 'ann-h-unit', 'ann-h-pre', 'ann-h-suf', 'ann-sl-fmt', 'ann-sl-min'];
const ANN_EXCLUDED = 'onlineifc.annot.excluded';

/** Classes of the visible models as check boxes; the ones left out last time stay unticked. */
export function renderAnnotClasses() {
  let excluded = [];
  try { excluded = JSON.parse(localStorage.getItem(ANN_EXCLUDED) || '[]'); } catch { /* ignore */ }
  const counts = new Map();
  for (const m of viewer.models) {
    if (!m.visible) continue;
    // spatial elements with geometry count too (e.g. the terrain of IfcSite); spaces do not
    for (const [cls, ids] of m.classes) if (cls !== 'IfcSpace') counts.set(cls, (counts.get(cls) || 0) + ids.length);
  }
  $('#ann-classes').replaceChildren(...[...counts].sort((a, b) => a[0].localeCompare(b[0])).map(([cls, n]) =>
    h('label', { class: 'chk', title: cls }, h('input', { type: 'checkbox', value: cls, checked: !excluded.includes(cls) }), ` ${cls} `, h('small', { text: `(${fmtNum(n)})` }))));
}

/** The annotation of break points applies to vertical sections only. */
function updateAnnotUi() {
  const entry = viewer.planes.find((p) => String(p.id) === $('#drw-plane').value);
  const box = $('#drw-annot');
  box.hidden = !entry || planeAxes(entry).horizontal;
  box.classList.toggle('off', !$('#ann-on').checked);
}
$('#drw-plane').addEventListener('change', updateAnnotUi);
// the section window follows the drawing settings (its sheet view and its points, #51)
$('#drawing-dialog').addEventListener('change', (e) => { if (e.target.id !== 'drw-preset-file' && secViewer?.isOpen) secViewer.update(); });
$('#ann-on').addEventListener('change', updateAnnotUi);

// ------------------------------------------------- annotated points chosen by hand (#48)
/**
 * Points removed and added in the section window, per section: {removed: [[x, y]], added: [[x, y]]}
 * in drawing coordinates (x: offset from the alignment at a station). Cross sections at a station
 * are keyed by alignment and station (so a series at the same station gets them too), other
 * sections by plane and position. Saved in the project.
 */
export const annotEdits = new Map();
function editKey(entry) {
  if (entry.station) return `st:${entry.station.al.id || entry.station.al.name}@${Math.round((entry.station.al.station0 + entry.station.s) * 1000)}`;
  return `pl:${entry.plane.normal.toArray().map((v) => v.toFixed(4)).join(',')}@${entry.plane.constant.toFixed(3)}`;
}
/** Removes the annotated point at (x, y), or adds one there (op 'remove' | 'add'). */
export function editAnnotPoint(entry, op, x, y) {
  const k = editKey(entry);
  const e = annotEdits.get(k) || { removed: [], added: [] };
  const near = (q) => Math.abs(q[0] - x) < 0.02 && Math.abs(q[1] - y) < 0.02;
  if (op === 'remove') {
    // a point added by hand simply goes; a computed one is remembered as removed
    if (e.added.some(near)) e.added = e.added.filter((q) => !near(q)); else e.removed.push([x, y]);
  } else {
    e.removed = e.removed.filter((q) => !near(q));
    if (!e.added.some(near)) e.added.push([x, y]);
  }
  if (e.removed.length || e.added.length) annotEdits.set(k, e); else annotEdits.delete(k);
  projects.touch?.();
}
export function resetAnnotPoints(entry) { annotEdits.delete(editKey(entry)); projects.touch?.(); }

/**
 * The drawing options chosen last time. Also at start, so the section window shows the points and
 * texts as set up before the dialog is opened.
 */
function restoreDrawingOptions() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(DRW_OPTS) || 'null'); } catch { /* ignore */ }
  for (const [id, v] of Object.entries(saved || {})) {
    const el = $(`#${id}`);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = !!v;
    else if (el.tagName === 'SELECT') { if ([...el.options].some((o) => o.value === v)) el.value = v; } else el.value = v ?? '';
  }
  updateAnnotFormatUi();
}

/** The scale choices of the drawing dialog (also at start: the section window's sheet view uses them). */
function fillScaleOptions() {
  const sel = $('#drw-scale'), was = sel.value;
  sel.replaceChildren(h('option', { value: 'fit', text: t('drw.fit') }), ...SCALES.map((sc) => h('option', { value: String(sc), text: `1:${sc}` })));
  if ([...sel.options].some((o) => o.value === was)) sel.value = was;
}

/** The paper options of the drawing dialog, as toSvg / toPdf / toDxf take them. */
export function drawingOpts() {
  const scaleVal = $('#drw-scale').value || 'fit';
  return {
    paper: $('#drw-paper').value, scale: scaleVal === 'fit' ? 'fit' : +scaleVal, fill: $('#drw-fill').checked,
    mono: $('#drw-colors').value === 'mono', colors: $('#drw-colors').value,
    hatch: $('#drw-hatch').checked, lw: +$('#drw-lw').value || 0.35, // hatching and line weight (#50)
  };
}

// ------------------------------------------------- drawing presets (#51)
/**
 * A preset holds every setting of the drawing dialog (paper, scale, colours, hatching, line weight,
 * the annotation with its points, label content, number formats and layout), the classes left out
 * of the annotation and the section width (#66). Built-in presets come first; your own are kept in
 * this browser and in the project, and can be exported / imported as a small JSON file.
 */
const PRESET_KEY = 'onlineifc.drawingPresets';
const presetIds = () => ['drw-format', 'drw-paper', 'drw-scale', 'drw-colors', 'drw-fill', 'drw-bg', 'drw-hatch', 'drw-lw',
  'ann-on', 'ann-mode', 'ann-slopes', 'ann-outline', 'ann-angle', 'ann-mindist', 'ann-band', 'ann-text', 'ann-dims', ...ANN_FMT_IDS];
const BUILTIN_PRESETS = [
  { name: 'preset.rail', builtin: true, values: { 'drw-format': 'pdf', 'drw-paper': 'A3', 'drw-scale': '100', 'drw-colors': 'shown', 'drw-fill': true, 'drw-bg': false, 'drw-hatch': true, 'drw-lw': '0.35',
    'ann-on': true, 'ann-mode': 'band', 'ann-slopes': true, 'ann-outline': 'top', 'ann-angle': '10', 'ann-mindist': '0', 'ann-band': 'under', 'ann-text': '1', 'ann-dims': 'chain',
    'ann-row-off': true, 'ann-row-h': true, 'ann-row-dist': false, 'ann-dec': 'auto', 'ann-off-ref': 'axis', 'ann-off-dec': '3', 'ann-off-unit': 'm', 'ann-off-plus': true,
    'ann-h-ref': 'abs', 'ann-h-dec': '3', 'ann-h-unit': 'm', 'ann-sl-fmt': 'auto', 'ann-sl-min': '0' } },
  { name: 'preset.overview', builtin: true, values: { 'drw-format': 'pdf', 'drw-paper': 'A3', 'drw-scale': 'fit', 'drw-colors': 'shown', 'drw-fill': true, 'drw-bg': true, 'drw-hatch': true, 'drw-lw': '0.35', 'ann-on': false } },
];
export let userPresets = [];
try { userPresets = JSON.parse(localStorage.getItem(PRESET_KEY) || '[]').filter((p) => p?.name && p.values); } catch { userPresets = []; }
const presetName = (p) => (p.builtin ? t(p.name) : p.name);
function savePresets() {
  try { localStorage.setItem(PRESET_KEY, JSON.stringify(userPresets)); } catch { /* ignore */ }
  projects.touch?.();
}
export function renderPresetSelect(selected = null) {
  const sel = $('#drw-preset');
  if (!sel) return;
  const cur = selected ?? sel.value;
  sel.replaceChildren(h('option', { value: '', text: t('preset.none') }),
    ...BUILTIN_PRESETS.map((p, i) => h('option', { value: `b${i}`, text: presetName(p) })),
    ...userPresets.map((p, i) => h('option', { value: `u${i}`, text: p.name })));
  if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
  $('#drw-preset-del').disabled = !sel.value.startsWith('u');
  $('#drw-preset-export').disabled = !sel.value;
}
const presetOf = (v) => (v?.startsWith('b') ? BUILTIN_PRESETS[+v.slice(1)] : v?.startsWith('u') ? userPresets[+v.slice(1)] : null);
/** The dialog's settings as a preset. */
function currentPreset(name) {
  const values = {};
  for (const id of presetIds()) { const el = $(`#${id}`); if (el) values[id] = el.type === 'checkbox' ? el.checked : el.value; }
  const excluded = $$('#ann-classes input').filter((b) => !b.checked).map((b) => b.value);
  return { name, values, excluded, sectionWidth: viewer.sectionWidth || null };
}
/** Puts a preset into the dialog (and its section width into the Sections panel). */
function applyPreset(p) {
  if (!p) return;
  // only the dialog's own settings: a preset (also one imported from a file) names the fields
  // it sets, and must not reach any other element on the page
  const allowed = new Set(presetIds());
  for (const [id, v] of Object.entries(p.values || {})) {
    if (!allowed.has(id)) continue;
    const el = document.getElementById(id);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = !!v;
    else if (el.tagName === 'SELECT') { if ([...el.options].some((o) => o.value === String(v))) el.value = String(v); } else el.value = v ?? '';
  }
  if (p.excluded) for (const b of $$('#ann-classes input')) b.checked = !p.excluded.includes(b.value);
  if ('sectionWidth' in p) {
    const num = (x) => (Number.isFinite(+x) && +x > 0 ? +x : 0);
    const w = p.sectionWidth && typeof p.sectionWidth === 'object' && (num(p.sectionWidth.left) || num(p.sectionWidth.right))
      ? { left: num(p.sectionWidth.left), right: num(p.sectionWidth.right) } : null;
    $('#plane-wl').value = w?.left || ''; $('#plane-wr').value = w?.right || '';
    viewer.setSectionWidth(w || null);
    try { localStorage.setItem('onlineifc.secWidth', JSON.stringify(w || null)); } catch { /* ignore */ }
  }
  updateAnnotUi?.();
  updateAnnotFormatUi();
  updateSeriesUi?.();
  saveDrawingOptions();
  if (secViewer?.isOpen) { secViewer.view = null; secViewer.update(); }
}
$('#drw-preset').addEventListener('change', () => { applyPreset(presetOf($('#drw-preset').value)); renderPresetSelect(); });
$('#drw-preset-save').addEventListener('click', () => {
  const cur = presetOf($('#drw-preset').value);
  const name = prompt(t('preset.namePrompt'), cur && !cur.builtin ? cur.name : '')?.trim();
  if (!name) return;
  const p = currentPreset(name);
  const i = userPresets.findIndex((q) => q.name === name);
  if (i >= 0) userPresets[i] = p; else userPresets.push(p);
  savePresets();
  renderPresetSelect(`u${i >= 0 ? i : userPresets.length - 1}`);
  toast(t('preset.saved', { name }));
});
$('#drw-preset-del').addEventListener('click', () => {
  const v = $('#drw-preset').value;
  if (!v.startsWith('u')) return;
  const p = userPresets[+v.slice(1)];
  if (!confirm(t('preset.deleteConfirm', { name: p.name }))) return;
  userPresets.splice(+v.slice(1), 1);
  savePresets();
  renderPresetSelect('');
});
$('#drw-preset-export').addEventListener('click', () => {
  const p = presetOf($('#drw-preset').value);
  if (!p) return;
  const out = { vispectaDrawingPresets: 1, presets: [{ ...p, name: presetName(p), builtin: undefined }] };
  download(`${presetName(p).replace(/[^\w\-æøåÆØÅ ]+/g, '').trim().replace(/\s+/g, '_') || 'preset'}.vispecta-preset.json`, JSON.stringify(out, null, 2), 'application/json');
});
$('#drw-preset-import').addEventListener('click', () => $('#drw-preset-file').click());
$('#drw-preset-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const list = (Array.isArray(data?.presets) ? data.presets : [])
      .filter((p) => p && typeof p === 'object' && p.name && p.values && typeof p.values === 'object');
    if (!list.length) throw new Error('no presets');
    for (const p of list) {
      let name = String(p.name), n = 2;
      while (userPresets.some((q) => q.name === name)) name = `${p.name} (${n++})`;
      const excluded = Array.isArray(p.excluded) ? p.excluded.filter((x) => typeof x === 'string') : undefined;
      userPresets.push({ name, values: p.values, excluded, sectionWidth: p.sectionWidth ?? null });
    }
    savePresets();
    renderPresetSelect(`u${userPresets.length - 1}`);
    applyPreset(userPresets[userPresets.length - 1]);
    toast(t('preset.imported', { n: list.length }));
  } catch { toast(t('preset.importFailed')); }
});

/** A number from a field (comma or point), 0 when empty. */
const numIn = (sel) => { const v = +String($(sel).value).replace(',', '.'); return Number.isFinite(v) ? v : 0; };
/** Decimals from a field, 0–4. */
const decIn = (sel) => Math.min(4, Math.max(0, Math.round(numIn(sel))));
/** The zero fields only matter for "chosen offset" / "chosen level". */
function updateAnnotFormatUi() {
  $('#ann-off-zero').hidden = $('#ann-off-ref').value !== 'custom';
  $('#ann-h-zero').hidden = $('#ann-h-ref').value !== 'custom';
}
for (const id of ['#ann-off-ref', '#ann-h-ref']) $(id).addEventListener('change', updateAnnotFormatUi);
fillScaleOptions();
restoreDrawingOptions();
renderPresetSelect();
// the section window shows the same texts: update it when a format changes
$('#ann-format').addEventListener('change', () => { if (secViewer?.isOpen) secViewer.update(); });

/** Options of the annotation as chosen in the drawing dialog (null when off). */
export function annotOptions({ force = false } = {}) {
  if (!force && !$('#ann-on').checked) return null;
  const boxes = $$('#ann-classes input');
  return {
    mode: $('#ann-mode').value,
    slopes: $('#ann-slopes').checked,
    // layout on paper (#50)
    band: $('#ann-band').value,
    textScale: +$('#ann-text').value || 1,
    dims: $('#ann-dims').value,
    classes: boxes.length ? new Set(boxes.filter((b) => b.checked).map((b) => b.value)) : null,
    // which points (#48): outline, smallest bend, smallest distance, and the points edited by hand
    outline: $('#ann-outline').value,
    angle: Math.min(89, Math.max(1, +$('#ann-angle').value || 10)),
    minDist: Math.max(0, +String($('#ann-mindist').value).replace(',', '.') || 0),
    editsFor: (entry) => annotEdits.get(editKey(entry)) || null,
    dec: $('#ann-dec').value !== 'auto' ? $('#ann-dec').value : decimalSign(),
    labels: { offset: t('ann.offset'), height: t('ann.height'), dist: t('ann.dist') },
    // label content and number formats (#49)
    offsetRef: $('#ann-off-ref').value,
    offsetZero: numIn('#ann-off-zero'),
    heightZeroFor: (entry) => {
      const r = $('#ann-h-ref').value;
      if (r === 'custom') return numIn('#ann-h-zero');
      if (r === 'axis' && entry.station) return heightAt(entry.station.al, entry.station.s) ?? 0;
      return 0;
    },
    fmt: {
      rows: { offset: $('#ann-row-off').checked, height: $('#ann-row-h').checked, dist: $('#ann-row-dist').checked },
      off: { dec: decIn('#ann-off-dec'), unit: $('#ann-off-unit').value, prefix: $('#ann-off-pre').value, suffix: $('#ann-off-suf').value, plus: $('#ann-off-plus').checked },
      height: { dec: decIn('#ann-h-dec'), unit: $('#ann-h-unit').value, prefix: $('#ann-h-pre').value, suffix: $('#ann-h-suf').value },
      slope: { fmt: $('#ann-sl-fmt').value, min: numIn('#ann-sl-min') },
    },
  };
}

function saveDrawingOptions() {
  try { localStorage.setItem(ANN_EXCLUDED, JSON.stringify($$('#ann-classes input').filter((b) => !b.checked).map((b) => b.value))); } catch { /* ignore */ }
  const out = {};
  for (const id of ['drw-format', 'drw-paper', 'drw-scale', 'drw-colors', 'drw-fill', 'drw-bg', 'ann-on', 'ann-mode', 'ann-slopes', 'ann-outline', 'ann-angle', 'ann-mindist', 'drw-hatch', 'drw-lw', 'ann-band', 'ann-text', 'ann-dims', ...ANN_FMT_IDS]) {
    const el = $(`#${id}`);
    if (el) out[id] = el.type === 'checkbox' ? el.checked : el.value;
  }
  try { localStorage.setItem(DRW_OPTS, JSON.stringify(out)); } catch { /* ignore */ }
}

export async function exportDrawing() {
  const entry = viewer.planes.find((p) => String(p.id) === $('#drw-plane').value);
  if (!entry) return;
  const format = $('#drw-format').value;
  const opts = drawingOpts();
  $('#drawing-dialog').close();
  saveDrawingOptions();
  if (entry.station && $('#ser-on').checked) {
    if (format !== 'pdf') toast(t('ser.pdfOnly'));
    const base = $('#drw-name').value.trim() || 'Section';
    const file = base.replace(/[^\w\-æøåÆØÅäöüÄÖÜß ]+/g, '').trim().replace(/\s+/g, '_') || 'sections';
    return exportSeries(entry, opts, base.replace(/\s*–\s*(Section|Snit|Schnitt|सेक्शन).*$/, ''), `${file}_series`, $('#drw-bg').checked);
  }
  let section;
  try {
    if (entry.station) entry.stationLabel = `${t('st.axis')} ${formatStation(entry.station.al.station0 + entry.station.s)}`;
    const plan = planeAxes(entry).horizontal;
    section = await withLoading(async (progress) => { progress(t('drw.cutting'), 0.3); await new Promise((r) => setTimeout(r, 30)); return computeSection(viewer, entry, { marks: plan ? planMarks : [], annot: plan ? null : annotOptions() }); });
  } catch (e) { console.error(e); return toast(t('drw.failed', { error: e.message || e })); }
  if (!section.layers.size) return toast(t('drw.empty'));
  const name = $('#drw-name').value.trim() || 'Section';
  const info = {
    title: name,
    subtitle: `${planeLabel(entry, viewer.planes.indexOf(entry))} · ${viewer.models.filter((m) => m.visible).map((m) => m.name).join(', ')}`,
    date: new Date().toISOString().slice(0, 10),
  };
  const file = name.replace(/[^\w\-æøåÆØÅäöüÄÖÜß ]+/g, '').trim().replace(/\s+/g, '_') || 'section';
  if (format === 'dxf') {
    // the annotation and the hatching sized for the scale the PDF would get (#50)
    download(`${file}.dxf`, toDxf(section, info, { scale: layout(section, opts).scale, hatch: opts.hatch }), 'application/dxf');
  } else {
    const lay = layout(section, opts);
    if (!lay.fits) toast(t('drw.tooBig', { scale: lay.scale }));
    if ($('#drw-bg').checked) {
      const helpersWere = viewer.showPlaneHelpers;
      const fillWas = viewer.sectionFillOn !== false;
      viewer.setHelpersVisible(false);
      viewer.setSectionFill(false); // no red cut faces in the background image
      // in a plan, the cross sections at stations are marks: they do not cut the background either
      const off = planeAxes(entry).horizontal ? viewer.planes.filter((p) => p.station && p.enabled) : [];
      for (const p of off) viewer.togglePlane(p, false);
      try { opts.background = renderBackground(viewer, section, lay); } catch (e) { console.warn('background', e); }
      for (const p of off) viewer.togglePlane(p, true);
      viewer.setSectionFill(fillWas);
      viewer.setHelpersVisible(helpersWere);
    }
    if (format === 'svg') download(`${file}.svg`, toSvg(section, lay, info, opts), 'image/svg+xml');
    else download(`${file}.pdf`, toPdf(section, lay, info, opts), 'application/pdf');
  }
  let n = 0;
  for (const L of section.layers.values()) n += L.elements;
  toast(t('drw.done', { n: fmtNum(n), layers: section.layers.size }), true);
}

