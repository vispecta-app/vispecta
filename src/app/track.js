// Track parameters (#137): labels along the alignments in 3D where the elements change (radius,
// gradient, cant), and the track report – the elements and a list of stations – as CSV, Excel, PDF.
import * as THREE from 'three';
import { t, fmtNum, decimalSign } from '../i18n.js';
import { formatStation, heightAt, pointAt } from '../alignment.js';
import { tablesToCsv, tablesToPdf, tablesToXlsx, trackTables } from '../trackreport.js';
import { $, download, h, toast, viewer } from './core.js';
import { allAlignments, alnLabel } from './sections.js';

// ------------------------------------------------------------------ labels in 3D
const layer = document.createElement('div');
layer.className = 'measure-layer track-params';
$('#viewport').append(layer);
let labels = []; // {el, pos: Vector3, row}
let shown = false;
try { shown = localStorage.getItem('vispecta.trackParams') === '1'; } catch { /* ignore */ }

const num = (x, d) => fmtNum(Math.round(x * 10 ** d) / 10 ** d);

/** The labels of an alignment: where a horizontal, vertical or cant element begins. */
function labelsOf(al) {
  const out = [];
  const at = (s, row, text, title) => {
    const p = pointAt(al, s), z = heightAt(al, s) ?? 0;
    out.push({ pos: viewer.fromIfc(p.x, p.y, z), row, text, title: `${al.name} · ${formatStation(al.station0 + s)}\n${title}` });
  };
  for (const hz of al.horizontal || []) {
    const type = /LINE/i.test(hz.type) ? t('trk.h.LINE') : /CIRCULAR/i.test(hz.type) ? `R ${num(hz.r0, 0)}` : `${t('trk.h.CLOTHOID')} ${hz.r0 ? num(hz.r0, 0) : '∞'}→${hz.r1 ? num(hz.r1, 0) : '∞'}`;
    at(hz.s0, 0, type, `${t('trk.horizontal')}: ${type}, L ${num(hz.L, 1)} m`);
  }
  for (const v of al.vertical || []) {
    const txt = v.type === 'CONSTANTGRADIENT' ? `i ${num(v.g0 * 1000, 2)} ‰` : `Rv ${num(v.R, 0)}`;
    at(v.s0, 1, txt, `${t('trk.vertical')}: ${txt}, L ${num(v.L, 1)} m`);
  }
  for (const c of al.cant?.segs || []) {
    const d0 = Math.abs(c.cl0 - c.cr0) * 1000, d1 = Math.abs(c.cl1 - c.cr1) * 1000;
    const txt = Math.abs(d0 - d1) < 0.5 ? `D ${num(d0, 0)}` : `D ${num(d0, 0)}→${num(d1, 0)}`;
    at(c.s0, 2, txt, `${t('trk.cant')}: ${txt} mm, L ${num(c.L, 1)} m`);
  }
  return out;
}

export function renderTrackParams() {
  layer.replaceChildren();
  labels = [];
  if (!shown) { viewer.invalidate(); return; }
  for (const al of allAlignments()) {
    if (al.hidden || al.drawn) continue;
    for (const l of labelsOf(al)) {
      const el = h('div', { class: `trk-label row${l.row}`, text: l.text, title: l.title });
      layer.append(el);
      labels.push({ ...l, el });
    }
  }
  viewer.invalidate();
}

function place() {
  if (!labels.length) return;
  const rect = viewer.renderer.domElement.getBoundingClientRect();
  const used = [];
  const cam = viewer.camera.position;
  const order = labels.map((l, i) => [i, l.pos.distanceToSquared(cam)]).sort((a, b) => a[1] - b[1]);
  for (const [i] of order) {
    const l = labels[i], s = viewer.toScreen(l.pos);
    if (!s || s.x < 0 || s.y < 0 || s.x > rect.width || s.y > rect.height) { l.el.hidden = true; continue; }
    const y = s.y - 16 - l.row * 18, w = l.text.length * 7 + 10;
    const box = [s.x - 4, y - 8, s.x - 4 + w, y + 8];
    if (used.some((u) => box[0] < u[2] && box[2] > u[0] && box[1] < u[3] && box[3] > u[1])) { l.el.hidden = true; continue; }
    used.push(box);
    l.el.hidden = false;
    l.el.style.transform = `translate(${s.x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }
}
viewer.renderHooks.push(place);

export function toggleTrackParams() {
  if (!shown && !allAlignments().some((a) => !a.drawn)) return toast(t('aln.none'));
  shown = !shown;
  try { localStorage.setItem('vispecta.trackParams', shown ? '1' : '0'); } catch { /* ignore */ }
  $('#trackparams-check').textContent = shown ? '☑' : '☐';
  renderTrackParams();
}
export const trackParamsShown = () => shown;

// ------------------------------------------------------------------ report
export function openTrackReport() {
  const list = allAlignments().filter((a) => !a.drawn);
  if (!list.length) return toast(t('trk.noAlignment'));
  $('#trk-path').replaceChildren(...list.map((a, i) => h('option', { value: String(i), text: alnLabel(a) })));
  renderPreview();
  $('#trackreport-dialog').showModal();
}

function current() {
  const list = allAlignments().filter((a) => !a.drawn);
  const al = list[+$('#trk-path').value] || list[0];
  const step = Math.max(1, Math.min(1000, +$('#trk-step').value || 10));
  const ref = viewer.referenceModel;
  const M = ref?.georef?.map ? viewer.ifcToMapOf(ref) : null;
  const toMap = M ? (p) => new THREE.Vector3(p.x, p.y, p.z).applyMatrix4(M) : null;
  const tables = trackTables(al, { t, fmt: formatStation, toMap, step });
  return { al, tables, title: `${t('trk.title')} – ${al.name}`, sub: `${formatStation(al.station0)} – ${formatStation(al.station0 + al.length)} · ${num(al.length, 1)} m · ${new Date().toISOString().slice(0, 10)}` };
}

function renderPreview() {
  const { tables } = current();
  $('#trk-preview').replaceChildren(...tables.filter((tb) => tb.key !== 'stations').map((tb) => h('div', {},
    h('h3', { text: `${tb.name} (${tb.rows.length})` }),
    h('div', { class: 'clr-scroll' }, h('table', { class: 'cor-table trk-table' },
      h('tr', {}, tb.header.map((x) => h('th', { text: x }))),
      tb.rows.slice(0, 200).map((row) => h('tr', {}, row.map((v) => h('td', { text: v === null ? '' : typeof v === 'number' ? fmtNum(v) : v })))))))),
  tables.length <= 1 ? h('p', { class: 'muted small', text: t('trk.noElements') }) : null);
}

export function exportTrack(kind) {
  const { al, tables, title, sub } = current();
  const base = `track-${al.name}`.replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 60);
  if (kind === 'csv') download(`${base}.csv`, tablesToCsv(tables, { dec: decimalSign(), title: `${title} · ${sub}` }), 'text/csv');
  else if (kind === 'xlsx') download(`${base}.xlsx`, tablesToXlsx(tables, { title }), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  else download(`${base}.pdf`, tablesToPdf(tables, { title, subtitle: sub, dec: decimalSign() }), 'application/pdf');
}

$('#trk-path').addEventListener('change', renderPreview);
$('#trk-step').addEventListener('change', renderPreview);
