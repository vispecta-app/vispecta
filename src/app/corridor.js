// Offset lines and corridors (#26; #63 moved out of main.js): the dialog, finding the elements
// in the corridor and their list.
import { t, fmtNum } from '../i18n.js';
import { pointAt, formatStation, parseStation } from '../alignment.js';
import { Corridor } from '../corridor.js';
import { $, download, h, state, toast, viewer, withLoading } from './core.js';
import { allAlignments, alnLabel, secViewer } from './sections.js';
import { applySelection, isolateSelected, projects } from '../main.js';

// ------------------------------------------------------------- offset lines and corridors (#26)
export const corridor = new Corridor(viewer, $('#viewport'));
viewer.corridor = corridor; // computeSection draws the offsets in station sections
// a station section shows the axis of every other alignment it crosses, too (e.g. the other track)
viewer.sectionAxes = (entry) => {
  const st = entry.station;
  if (!st) return [];
  const P = pointAt(st.al, st.s);
  const out = [];
  for (const al of allAlignments()) {
    if (al === st.al || al.hidden || !al.poly) continue;
    const f = (q) => (q[0] - P.x) * P.dx + (q[1] - P.y) * P.dy; // distance from the section plane, along the alignment
    for (let k = 1; k < al.poly.length; k++) {
      const a = al.poly[k - 1], b = al.poly[k], fa = f(a), fb = f(b);
      if ((fa > 0) === (fb > 0) || fa === fb) continue;
      const tt = fa / (fa - fb);
      const x = a[0] + (b[0] - a[0]) * tt, y = a[1] + (b[1] - a[1]) * tt;
      if (Math.hypot(x - P.x, y - P.y) > 150) continue; // far away: not part of this cross section
      const sAt = al.cum[k - 1] + (al.cum[k] - al.cum[k - 1]) * tt;
      out.push({ p: viewer.fromIfc(x, y, 0), label: `${al.name} ${formatStation(al.station0 + sAt)}` });
    }
  }
  return out;
};
let corridorHits = null;
/** Forgets (or sets) the elements found in the corridor. */
export function setCorridorHits(v) { corridorHits = v; }

export function openCorridorDialog() {
  const list = allAlignments();
  if (!list.length) return toast(t('aln.none'));
  const sel = $('#cor-path');
  const cur = corridor.def?.al;
  sel.replaceChildren(...list.map((a, i) => h('option', { value: String(i), text: alnLabel(a), selected: a === cur })));
  const al = cur && list.includes(cur) ? cur : list[+sel.value];
  if (!corridor.def || corridor.def.al !== al) {
    $('#cor-from').value = formatStation(al.station0);
    $('#cor-to').value = formatStation(al.station0 + al.length);
  }
  // the current corridor, split into left (negative) and right of the alignment
  if (corridor.def) {
    const fmt = (v) => fmtNum(Math.abs(v));
    $('#cor-left').value = corridor.def.offsets.filter((o) => o < 0).reverse().map(fmt).join('; ');
    $('#cor-right').value = corridor.def.offsets.filter((o) => o >= 0).map(fmt).join('; ');
  }
  renderCorridorHits();
  $('#corridor-dialog').showModal();
}
$('#cor-path').addEventListener('change', () => {
  const al = allAlignments()[+$('#cor-path').value];
  if (al) { $('#cor-from').value = formatStation(al.station0); $('#cor-to').value = formatStation(al.station0 + al.length); }
});

/** The definition in the dialog, or null (with a message). */
function corridorFromDialog() {
  const al = allAlignments()[+$('#cor-path').value];
  if (!al) { toast(t('aln.none')); return null; }
  // left and right of the alignment: one or more distances per side (e.g. "2.5; 5"); left becomes negative
  const side = (id, sign) => $(id).value.split(/[;\s]+/).filter((x) => x.trim() !== '').map((x) => sign * Math.abs(+x.replace(',', '.'))).filter(Number.isFinite);
  const offsets = [...new Set([...side('#cor-left', -1), ...side('#cor-right', 1)].map((x) => (Object.is(x, -0) ? 0 : x)))].sort((a, b) => a - b);
  if (!offsets.length) { toast(t('cor.noOffsets')); return null; }
  const from = parseStation($('#cor-from').value), to = parseStation($('#cor-to').value);
  if (from === null || to === null) { toast(t('st.bad', { v: from === null ? $('#cor-from').value : $('#cor-to').value })); return null; }
  return { al, offsets, from: from - al.station0, to: to - al.station0 };
}

export function showCorridor() {
  const def = corridorFromDialog();
  if (!def) return false;
  corridor.set(def);
  corridorHits = null;
  renderCorridorHits();
  secViewer?.planesChanged?.();
  projects.touch?.();
  return true;
}

export async function findInCorridor() {
  if (!showCorridor()) return;
  if (corridor.def.offsets.length < 2) return toast(t('cor.needTwo'));
  corridorHits = await withLoading(async (progress) => { progress(t('cor.finding'), 0.3); await new Promise((r) => setTimeout(r, 30)); return corridor.find(); });
  renderCorridorHits();
}

export function renderCorridorHits() {
  const box = $('#cor-results');
  if (!corridorHits) { box.replaceChildren(h('p', { class: 'muted small', text: t('cor.hint') })); return; }
  if (!corridorHits.length) { box.replaceChildren(h('p', { class: 'muted small', text: t('cor.none') })); return; }
  const byClass = new Map();
  for (const r of corridorHits) {
    const cls = r.model.typeName(r.id) || 'IfcElement';
    const c = byClass.get(cls) || { inside: 0, crosses: 0 };
    c[r.status]++;
    byClass.set(cls, c);
  }
  const inside = corridorHits.filter((r) => r.status === 'inside').length;
  box.replaceChildren(
    h('p', { class: 'small', text: t('cor.summary', { inside: fmtNum(inside), crosses: fmtNum(corridorHits.length - inside) }) }),
    h('table', { class: 'cor-table' },
      h('tr', {}, h('th', { text: t('cor.class') }), h('th', { text: t('cor.inside') }), h('th', { text: t('cor.crosses') })),
      [...byClass].sort((a, b) => (b[1].inside + b[1].crosses) - (a[1].inside + a[1].crosses)).map(([cls, c]) => h('tr', {}, h('td', { text: cls }), h('td', { text: fmtNum(c.inside) }), h('td', { text: fmtNum(c.crosses) })))),
    h('div', { class: 'card-btns' },
      h('button', { class: 'btn sm', text: t('cor.colour'), onclick: () => colourCorridorHits() }),
      h('button', { class: 'btn sm', text: t('cor.select'), onclick: () => selectCorridorHits(false) }),
      h('button', { class: 'btn sm', text: t('cor.isolate'), onclick: () => selectCorridorHits(true) }),
      h('button', { class: 'btn sm', text: 'CSV', onclick: () => corridorCsv() })));
}

function colourCorridorHits() {
  const per = new Map();
  for (const r of corridorHits || []) {
    if (!per.has(r.model)) per.set(r.model, new Map());
    per.get(r.model).set(r.id, r.status === 'inside' ? 0x8e44ad : 0xf08a24);
  }
  for (const m of viewer.models) m.setElementColors(per.get(m) || new Map());
  viewer.invalidate();
}

function selectCorridorHits(isolate) {
  state.selection.clear();
  for (const r of corridorHits || []) {
    if (!state.selection.has(r.model)) state.selection.set(r.model, new Set());
    state.selection.get(r.model).add(r.id);
  }
  applySelection();
  if (isolate) isolateSelected();
  $('#corridor-dialog').close();
}

function corridorCsv() {
  const al = corridor.def.al;
  const q = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`;
  const rows = [['Model', 'GlobalId', 'Class', 'Name', 'Status', 'Station', 'Offset (m)'].map(q).join(';')];
  for (const r of corridorHits || []) {
    let guid = '';
    try { guid = r.model.api.GetLine(r.model.modelID, r.id, false)?.GlobalId?.value || ''; } catch { /* ignore */ }
    rows.push([r.model.name, guid, r.model.typeName(r.id), r.model.nameOf?.(r.id) || r.model.label(r.id), r.status, formatStation(al.station0 + r.s), r.offset.toFixed(3)].map(q).join(';'));
  }
  download(`corridor-${al.name.replace(/[^\w.-]+/g, '_')}.csv`, `﻿${rows.join('\r\n')}`, 'text/csv');
}

