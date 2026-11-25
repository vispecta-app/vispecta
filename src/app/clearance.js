// Structure gauge check along a track (#127): the dialog, profiles of your own, the list of
// elements that reach into the gauge, and BCF issues for them. The geometry is in ../clearance.js.
import { t, fmtNum } from '../i18n.js';
import { formatStation, parseStation } from '../alignment.js';
import { ClearanceLayer, PROFILES, checkClearance } from '../clearance.js';
import { $, download, h, state, toast, viewer, withLoading } from './core.js';
import { allAlignments, alnLabel, autoSecView, renderPlanes, setStationPlane } from './sections.js';
import { applySelection, fitSelection, isolateSelected, issues, projects } from '../main.js';

export const gauge = new ClearanceLayer(viewer);
viewer.clearance = gauge; // drawing.js draws the gauge in station sections

const CUSTOM_KEY = 'vispecta.gauges';
const SETTINGS_KEY = 'vispecta.gaugeCheck';
// classes left out by default: the track itself, the ballast and the ground under it, and what has no body
export const DEFAULT_EXCLUDE = 'IfcRail, IfcTrackElement, IfcFastener, IfcCourse, IfcEarthworksFill, IfcEarthworksElement, IfcAlignment, IfcReferent, IfcSpace, IfcVirtualElement, IfcAnnotation, IfcOpeningElement';
const OCL_NAME = /overhead|catenary|k[øo]rel|kontaktl|fahrleit|ocl|ole\b|cat[eé]naire|bovenleid|catenaria/i;

let hits = null; // the last result
let lastDef = null;

// ------------------------------------------------------------- profiles of your own
export function customProfiles() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]').filter((p) => p && p.name && Array.isArray(p.points)); } catch { return []; }
}
function saveCustom(list) {
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}
/** "b h" per line (mm; ; or , between) -> [[b, h]]. */
export function parsePoints(text) {
  return String(text).split(/\n|;/).map((l) => l.trim()).filter(Boolean)
    .map((l) => l.split(/[\s,]+/).map((x) => +x.replace(',', '.'))).filter((p) => p.length >= 2 && p.every(Number.isFinite)).map((p) => [p[0], p[1]]);
}

function fillProfiles(selected) {
  const sel = $('#clr-profile');
  const std = Object.keys(PROFILES).map((k) => h('option', { value: k, text: t(`clr.p.${k}`), selected: selected === k }));
  const own = customProfiles().map((p) => h('option', { value: `custom:${p.name}`, text: `✎ ${p.name}`, selected: selected === `custom:${p.name}` }));
  sel.replaceChildren(
    h('optgroup', { label: 'BN1-166-1' }, std),
    own.length ? h('optgroup', { label: t('clr.own') }, own) : null,
    h('option', { value: 'new', text: t('clr.newProfile') }));
  if (!sel.value || (selected && sel.value !== selected)) sel.value = selected && [...sel.options].some((o) => o.value === selected) ? selected : 'D';
}

function showProfileFields() {
  const v = $('#clr-profile').value;
  $('#clr-sides-row').hidden = v !== 'R';
  $('#clr-p1-row').hidden = v !== 'A';
  const custom = v.startsWith('custom:') || v === 'new';
  $('#clr-custom').hidden = !custom;
  $('#clr-norm-opts').hidden = v === 'UT' || custom;
  if (v === 'new') {
    $('#clr-c-name').value = ''; $('#clr-c-points').value = '';
    $('#clr-c-sym').checked = true; $('#clr-c-widen').value = '0'; $('#clr-c-raise').value = '0'; $('#clr-c-rules').checked = true;
  } else if (custom) {
    const p = customProfiles().find((x) => `custom:${x.name}` === v);
    if (p) {
      $('#clr-c-name').value = p.name;
      $('#clr-c-points').value = p.points.map((q) => `${q[0]} ${q[1]}`).join('\n');
      $('#clr-c-sym').checked = p.symmetric !== false;
      $('#clr-c-widen').value = String(p.widen || 0); $('#clr-c-raise').value = String(p.raise || 0);
      $('#clr-c-rules').checked = p.curveRules !== false;
    }
  }
}

function customFromFields() {
  return {
    name: $('#clr-c-name').value.trim(), points: parsePoints($('#clr-c-points').value), symmetric: $('#clr-c-sym').checked,
    widen: +$('#clr-c-widen').value || 0, raise: +$('#clr-c-raise').value || 0, curveRules: $('#clr-c-rules').checked,
  };
}

function saveCustomProfile() {
  const p = customFromFields();
  if (!p.name) return toast(t('clr.needName'));
  if (p.points.length < 2) return toast(t('clr.needPoints'));
  const list = customProfiles().filter((x) => x.name !== p.name);
  list.push(p);
  saveCustom(list);
  fillProfiles(`custom:${p.name}`);
  showProfileFields();
  toast(t('clr.saved', { name: p.name }), true);
}

function deleteCustomProfile() {
  const v = $('#clr-profile').value;
  if (!v.startsWith('custom:')) return;
  const name = v.slice(7);
  if (!confirm(t('clr.deleteConfirm', { name }))) return;
  saveCustom(customProfiles().filter((x) => x.name !== name));
  fillProfiles('D');
  showProfileFields();
}

function exportProfiles() {
  const list = customProfiles();
  if (!list.length) return toast(t('clr.noOwn'));
  download('vispecta-gauges.json', JSON.stringify({ vispectaGauges: 1, profiles: list }, null, 2), 'application/json');
}

async function importProfiles(file) {
  try {
    const data = JSON.parse(await file.text());
    const got = (Array.isArray(data?.profiles) ? data.profiles : []).filter((p) => p && typeof p.name === 'string' && Array.isArray(p.points))
      .map((p) => ({ name: p.name.slice(0, 80), points: parsePoints(p.points.map((q) => q.join(' ')).join('\n')), symmetric: p.symmetric !== false, widen: +p.widen || 0, raise: +p.raise || 0, curveRules: p.curveRules !== false }))
      .filter((p) => p.points.length >= 2);
    if (!got.length) return toast(t('clr.importNone'));
    const names = new Set(got.map((p) => p.name));
    saveCustom([...customProfiles().filter((x) => !names.has(x.name)), ...got]);
    fillProfiles(`custom:${got[0].name}`);
    showProfileFields();
    toast(t('clr.imported', { n: got.length }), true);
  } catch { toast(t('clr.importNone')); }
}

// ------------------------------------------------------------- the dialog
export function openClearanceDialog() {
  const list = allAlignments();
  if (!list.length) return toast(t('aln.none'));
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { saved = {}; }
  const sel = $('#clr-path');
  const cur = gauge.def?.al || lastDef?.al;
  sel.replaceChildren(...list.map((a, i) => h('option', { value: String(i), text: alnLabel(a), selected: a === cur })));
  const al = list[+sel.value];
  if (!gauge.def || gauge.def.al !== al) setRange(al);
  fillProfiles(lastDef?.def.id === 'custom' ? `custom:${lastDef.def.custom.name}` : lastDef?.def.id || saved.profile || 'D');
  if (saved.over !== undefined && !lastDef) $('#clr-over').value = saved.over;
  if (saved.maintenance && !lastDef) $('#clr-maint').value = saved.maintenance;
  if (!$('#clr-exclude').value) $('#clr-exclude').value = saved.exclude || DEFAULT_EXCLUDE;
  showProfileFields();
  renderModels();
  renderCant();
  renderHits();
  $('#clearance-dialog').showModal();
}

function setRange(al) {
  $('#clr-from').value = formatStation(al.station0);
  $('#clr-to').value = formatStation(al.station0 + al.length);
}

function renderModels() {
  const box = $('#clr-models');
  const prev = new Map([...box.querySelectorAll('tr[data-uid]')].map((r) => [r.dataset.uid, { on: r.querySelector('.clr-on').checked, ocl: r.querySelector('.clr-ocl').checked }]));
  box.replaceChildren(
    h('tr', {}, h('th', { text: t('clr.model') }), h('th', { text: t('clr.check') }), h('th', { text: t('clr.ocl'), title: t('clr.oclTitle') })),
    viewer.models.filter((m) => m.visible && m.elementIds.size).map((m) => {
      const p = prev.get(String(m.uid));
      return h('tr', { 'data-uid': String(m.uid) },
        h('td', { text: m.alias || m.name }),
        h('td', {}, h('input', { type: 'checkbox', class: 'clr-on', checked: p ? p.on : true, 'aria-label': `${t('clr.check')}: ${m.name}` })),
        h('td', {}, h('input', { type: 'checkbox', class: 'clr-ocl', checked: p ? p.ocl : OCL_NAME.test(m.name), 'aria-label': `${t('clr.ocl')}: ${m.name}` })));
    }));
}

function renderCant() {
  const al = allAlignments()[+$('#clr-path').value];
  const fromFile = !!al?.cant?.segs?.length;
  $('#clr-cant-file').hidden = !fromFile;
  $('#clr-cant-manual').hidden = fromFile;
  if (fromFile) {
    const max = Math.max(...al.cant.segs.flatMap((g) => [Math.abs(g.cr0 - g.cl0), Math.abs(g.cr1 - g.cl1)]));
    $('#clr-cant-file').textContent = t('clr.cantFile', { mm: fmtNum(Math.round(max * 1000)) });
  }
}

/** The check as set in the dialog, or null (with a message). */
function defFromDialog() {
  const al = allAlignments()[+$('#clr-path').value];
  if (!al) { toast(t('aln.none')); return null; }
  const from = parseStation($('#clr-from').value), to = parseStation($('#clr-to').value);
  if (from === null || to === null) { toast(t('st.bad', { v: from === null ? $('#clr-from').value : $('#clr-to').value })); return null; }
  const v = $('#clr-profile').value;
  let def;
  if (v === 'new' || v.startsWith('custom:')) {
    const c = customFromFields();
    if (c.points.length < 2) { toast(t('clr.needPoints')); return null; }
    def = { id: 'custom', custom: c, maintenance: $('#clr-maint').value };
  } else {
    def = {
      id: v, sides: $('#clr-sides').value, p1f1: $('#clr-p1').checked, over: v === 'UT' ? null : $('#clr-over').value || null,
      tunnel: $('#clr-tunnel').checked, maintenance: v === 'UT' ? 'none' : $('#clr-maint').value,
    };
  }
  let manualCant = null;
  if (!al.cant?.segs?.length) {
    const c = (+String($('#clr-cant').value).replace(',', '.') || 0) / 1000;
    if (c) manualCant = $('#clr-cant-side').value === 'left' ? { left: c, right: 0 } : { left: 0, right: c };
  }
  const models = new Set(), ocl = new Set();
  for (const r of $('#clr-models').querySelectorAll('tr[data-uid]')) {
    const m = viewer.models.find((x) => String(x.uid) === r.dataset.uid);
    if (!m) continue;
    if (r.querySelector('.clr-on').checked) models.add(m);
    if (r.querySelector('.clr-ocl').checked) ocl.add(m);
  }
  const exclude = new Set($('#clr-exclude').value.split(/[,;\s]+/).map((x) => x.trim().toUpperCase()).filter(Boolean));
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ profile: v === 'new' ? 'D' : v, over: $('#clr-over').value, maintenance: $('#clr-maint').value, exclude: $('#clr-exclude').value })); } catch { /* ignore */ }
  return { al, from: from - al.station0, to: to - al.station0, def, manualCant, models, ocl, exclude };
}

export function showGauge() {
  const d = defFromDialog();
  if (!d) return null;
  gauge.set({ al: d.al, from: d.from, to: d.to, def: d.def, manualCant: d.manualCant });
  lastDef = d;
  projects.touch?.();
  return d;
}

export async function runClearance() {
  const d = showGauge();
  if (!d) return;
  const res = await withLoading(async (progress) => {
    progress(t('clr.running'), 0);
    await new Promise((r) => setTimeout(r, 30));
    return checkClearance(viewer, d.al, d.from, d.to, { def: d.def, models: d.models, ocl: d.ocl, exclude: d.exclude, manualCant: d.manualCant, onProgress: (f) => progress(t('clr.running'), f) });
  });
  hits = res.hits;
  for (const w of res.warnings) toast(t(`clr.warn.${w}`));
  renderHits();
}

export function clearGauge() {
  gauge.clear();
  hits = null;
  lastDef = null;
  renderHits();
  for (const m of viewer.models) m.setElementColors?.(new Map());
  viewer.invalidate();
}

const sideText = (x) => t(x.part === 'upper' ? 'clr.sideUpper' : x.side === 'left' ? 'clr.sideLeft' : 'clr.sideRight');
const mm = (m) => fmtNum(Math.round(m * 1000));
const nameOf = (x) => x.model.nameOf?.(x.id) || x.model.label?.(x.id) || `#${x.id}`;

export function renderHits() {
  const box = $('#clr-results');
  if (!hits) { box.replaceChildren(h('p', { class: 'muted small', text: t('clr.hint') })); return; }
  if (!hits.length) { box.replaceChildren(h('p', { class: 'small clr-ok', text: t('clr.none') })); return; }
  const al = lastDef.al;
  box.replaceChildren(
    h('p', { class: 'small', text: t('clr.summary', { n: fmtNum(hits.length), max: mm(Math.max(...hits.map((x) => x.depth))) }) }),
    h('div', { class: 'clr-scroll' }, h('table', { class: 'cor-table clr-table' },
      h('tr', {}, h('th', { text: t('cor.class') }), h('th', { text: t('csv.name') }), h('th', { text: t('aln.station') }), h('th', { text: t('clr.side') }), h('th', { text: t('clr.depth') })),
      hits.map((x) => h('tr', { class: 'clr-row', tabindex: '0', title: t('clr.rowTitle'), onclick: () => goTo(x), onkeydown: (e) => { if (e.key === 'Enter') goTo(x); } },
        h('td', { text: x.model.typeName(x.id) || '' }),
        h('td', { text: nameOf(x) }),
        h('td', { text: Math.abs(x.s1 - x.s0) < 0.5 ? formatStation(al.station0 + x.s0) : `${formatStation(al.station0 + x.s0)} – ${formatStation(al.station0 + x.s1)}` }),
        h('td', { text: sideText(x) }),
        h('td', { class: 'num', text: mm(x.depth) }))))),
    h('div', { class: 'card-btns' },
      h('button', { class: 'btn sm', text: t('cor.colour'), onclick: () => colourHits() }),
      h('button', { class: 'btn sm', text: t('cor.select'), onclick: () => selectHits(false) }),
      h('button', { class: 'btn sm', text: t('cor.isolate'), onclick: () => selectHits(true) }),
      h('button', { class: 'btn sm', text: 'CSV', onclick: () => hitsCsv() }),
      h('button', { class: 'btn sm', text: t('clr.issues'), onclick: () => hitsToIssues() })));
}

function select(list) {
  state.selection.clear();
  for (const x of list) {
    if (!state.selection.has(x.model)) state.selection.set(x.model, new Set());
    state.selection.get(x.model).add(x.id);
  }
  applySelection();
}

/** An element of the list: selected, zoomed to, and a cross section where it reaches in deepest. */
function goTo(x) {
  select([x]);
  const entry = viewer.planes.find((p) => p.station?.al === lastDef.al) || viewer.addPlane('custom', { normal: viewer.camera.up.clone(), point: viewer.controls.target.clone() });
  setStationPlane(entry, lastDef.al, x.at?.s ?? x.s0, -1);
  renderPlanes();
  fitSelection();
  autoSecView(entry);
}

function colourHits() {
  const per = new Map();
  for (const x of hits || []) {
    if (!per.has(x.model)) per.set(x.model, new Map());
    per.get(x.model).set(x.id, x.part === 'upper' ? 0xf08a24 : 0xd62728);
  }
  for (const m of viewer.models) m.setElementColors(per.get(m) || new Map());
  viewer.invalidate();
}

function selectHits(isolate) {
  select(hits || []);
  if (isolate) isolateSelected();
  $('#clearance-dialog').close();
}

function profileName(def) {
  return def.id === 'custom' ? def.custom.name || t('clr.own') : `${def.id}${def.over ? ` + ${def.over}` : ''}${def.p1f1 ? ' (P1/F1)' : ''}`;
}

function hitsCsv() {
  const al = lastDef.al;
  const q = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`;
  const rows = [['Model', 'GlobalId', 'Class', 'Name', 'Station from', 'Station to', 'Deepest at', 'Side', 'Intrusion (mm)', 'b (mm)', 'h (mm)', 'Profile'].map(q).join(';')];
  for (const x of hits || []) {
    let guid = '';
    try { guid = x.model.api.GetLine(x.model.modelID, x.id, false)?.GlobalId?.value || ''; } catch { /* ignore */ }
    rows.push([x.model.name, guid, x.model.typeName(x.id), nameOf(x), formatStation(al.station0 + x.s0), formatStation(al.station0 + x.s1),
      formatStation(al.station0 + (x.at?.s ?? x.s0)), x.part === 'upper' ? 'over upper part' : x.side, Math.round(x.depth * 1000),
      Math.round((x.at?.b || 0) * 1000), Math.round((x.at?.h || 0) * 1000), profileName(lastDef.def)].map(q).join(';'));
  }
  download(`gauge-${al.name.replace(/[^\w.-]+/g, '_')}.csv`, `﻿${rows.join('\r\n')}`, 'text/csv');
}

/** A BCF issue per element: its view (selected, zoomed, the cross section) and where it reaches in. */
async function hitsToIssues() {
  const list = hits || [];
  if (!list.length) return;
  if (list.length > 25 && !confirm(t('clr.issuesMany', { n: list.length }))) return;
  const al = lastDef.al;
  await withLoading(async (progress) => {
    for (const [i, x] of list.entries()) {
      progress(t('clr.issuesMaking', { i: i + 1, n: list.length }), i / list.length);
      goTo(x);
      await new Promise((r) => setTimeout(r, 50));
      issues.create({
        title: t('clr.issueTitle', { name: nameOf(x), station: formatStation(al.station0 + (x.at?.s ?? x.s0)) }),
        description: t('clr.issueText', { cls: x.model.typeName(x.id), depth: mm(x.depth), side: sideText(x), profile: profileName(lastDef.def), al: al.name, from: formatStation(al.station0 + x.s0), to: formatStation(al.station0 + x.s1) }),
        type: 'Clash', priority: 'Normal', assignedTo: '',
      });
    }
  });
  issues.render();
  projects.touch?.();
  toast(t('clr.issuesDone', { n: list.length }), true);
}

// ------------------------------------------------------------- wiring
$('#clr-path').addEventListener('change', () => { const al = allAlignments()[+$('#clr-path').value]; if (al) setRange(al); renderCant(); });
$('#clr-profile').addEventListener('change', showProfileFields);
$('#clr-c-save').addEventListener('click', saveCustomProfile);
$('#clr-c-delete').addEventListener('click', deleteCustomProfile);
$('#clr-c-export').addEventListener('click', exportProfiles);
$('#clr-c-import').addEventListener('click', () => $('#clr-c-file').click());
$('#clr-c-file').addEventListener('change', (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importProfiles(f); });
$('#clr-reset-exclude').addEventListener('click', () => { $('#clr-exclude').value = DEFAULT_EXCLUDE; });

/** For the project / workspace: the gauge shown, and back. */
export function gaugeState() {
  const d = gauge.def;
  return d ? { path: d.al.name, drawn: !!d.al.drawn, from: d.from, to: d.to, def: d.def, manualCant: d.manualCant } : null;
}
export function restoreGauge(st) {
  if (!st) { gauge.clear(); return; }
  const al = allAlignments().find((a) => a.name === st.path && !!a.drawn === !!st.drawn);
  // from a project file: only a profile that can be drawn
  const d = st.def, pts = d?.custom?.points;
  const ok = d && (PROFILES[d.id] || (d.id === 'custom' && Array.isArray(pts) && pts.length >= 2 && pts.every((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))));
  if (!al || !ok || !Number.isFinite(st.from) || !Number.isFinite(st.to)) { gauge.clear(); return; }
  gauge.set({ al, from: st.from, to: st.to, def: st.def, manualCant: st.manualCant || null });
}
