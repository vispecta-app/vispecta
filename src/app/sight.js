// Sight check of a signal or sign (#136): the dialog, the strip of where the target is seen, the
// blockers, sight lines in 3D, CSV and BCF issues. The rays are in ../sight.js.
import * as THREE from 'three';
import { t, fmtNum } from '../i18n.js';
import { formatStation } from '../alignment.js';
import { SIGHT_EXCLUDE, sightCheck } from '../sight.js';
import { guidOf } from '../bcf.js';
import { $, download, h, state, toast, viewer, withLoading } from './core.js';
import { allAlignments, alnLabel } from './sections.js';
import { applySelection, fitSelection, issues } from '../main.js';

const KEY = 'vispecta.sight';
let target = null; // [{model, id}]
let result = null, lastAl = null;
const lines = new THREE.Group();
lines.name = 'sight lines';
viewer.scene.add(lines);

const nameOf = (x) => `${x.model.typeName(x.id)} – ${x.model.label(x.id)}`;
const m1 = (v) => `${fmtNum(Math.round(v * 10) / 10)} m`;

function settings() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } }

export function openSightDialog() {
  const list = allAlignments();
  if (!list.length) return toast(t('aln.none'));
  const s = settings();
  const sel = $('#sight-path');
  sel.replaceChildren(...list.map((a, i) => h('option', { value: String(i), text: alnLabel(a), selected: a === lastAl })));
  for (const [id, k, d] of [['#sight-eye', 'eye', 2.2], ['#sight-offset', 'offset', 0], ['#sight-range', 'range', 500], ['#sight-step', 'step', 5], ['#sight-required', 'required', '']]) {
    if ($(id).value === '' || $(id).dataset.init !== '1') { $(id).value = s[k] ?? d; $(id).dataset.init = '1'; }
  }
  if (!$('#sight-exclude').value) $('#sight-exclude').value = s.exclude || SIGHT_EXCLUDE;
  if (s.direction) $('#sight-dir').value = s.direction;
  if (!target) useSelection(true);
  renderTarget();
  renderResult();
  $('#sight-dialog').showModal();
}

function useSelection(quiet = false) {
  const list = [];
  for (const [m, set] of state.selection) for (const id of set) list.push({ model: m, id });
  if (!list.length) { if (!quiet) toast(t('sight.selectFirst')); return; }
  target = list.slice(0, 20);
  renderTarget();
}

function renderTarget() {
  $('#sight-target').textContent = target?.length ? `${nameOf(target[0])}${target.length > 1 ? ` (+${target.length - 1})` : ''}` : t('sight.noTarget');
}

export async function runSight() {
  if (!target?.length) return toast(t('sight.selectFirst'));
  const al = allAlignments()[+$('#sight-path').value];
  if (!al) return;
  const num = (id, d) => { const v = +String($(id).value).replace(',', '.'); return Number.isFinite(v) && $(id).value !== '' ? v : d; };
  const opts = {
    targets: target, eye: num('#sight-eye', 2.2), offset: num('#sight-offset', 0), direction: +$('#sight-dir').value || 1,
    range: Math.min(3000, Math.max(20, num('#sight-range', 500))), step: Math.min(50, Math.max(1, num('#sight-step', 5))), required: Math.max(0, num('#sight-required', 0)),
    exclude: new Set($('#sight-exclude').value.split(/[,;\s]+/).map((x) => x.trim().toUpperCase()).filter(Boolean)),
  };
  try { localStorage.setItem(KEY, JSON.stringify({ eye: opts.eye, offset: opts.offset, range: opts.range, step: opts.step, required: opts.required || '', exclude: $('#sight-exclude').value, direction: $('#sight-dir').value })); } catch { /* ignore */ }
  try {
    result = await withLoading((progress) => sightCheck(viewer, al, { ...opts, onProgress: (f) => progress(t('sight.running'), f) }));
    lastAl = al;
    result.opts = opts;
  } catch (e) {
    console.error(e);
    return toast(t('sight.failed', { error: e.message || e }));
  }
  drawLines();
  renderResult();
}

/** Sight lines in 3D: every 25 m (and the last one seen), green seen, orange partly, red hidden. */
function drawLines() {
  clearLines();
  if (!result) return;
  const box = new THREE.Box3();
  for (const x of target) box.union(x.model.getBox([x.id]));
  const c = box.getCenter(new THREE.Vector3());
  const pos = [], col = [];
  const every = Math.max(1, Math.round(25 / (result.opts.step || 5)));
  result.samples.forEach((x, i) => {
    if (i % every && x.dist !== result.sighting) return;
    const k = new THREE.Color(x.seen === 1 ? 0x27ae60 : x.seen > 0 ? 0xf39c12 : 0xd62728);
    pos.push(x.eye.x, x.eye.y, x.eye.z, c.x, c.y, c.z);
    col.push(k.r, k.g, k.b, k.r, k.g, k.b);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, depthTest: false }));
  l.renderOrder = 1e7;
  l.frustumCulled = false;
  lines.add(l);
  viewer.invalidate();
}

export function clearSight() {
  result = null;
  clearLines();
  renderResult();
}
function clearLines() {
  for (const o of [...lines.children]) { lines.remove(o); o.geometry.dispose(); o.material.dispose(); }
  viewer.invalidate();
}

/** The strip: distance before the target to the left, the target on the right. */
function strip(r) {
  const W = 640, H = 46, pad = 4, maxD = Math.max(...r.samples.map((x) => x.dist), 1);
  const X = (d) => pad + (W - 2 * pad) * (1 - d / maxD);
  const step = r.opts.step;
  const rects = r.samples.map((x) => `<rect x="${X(x.dist + step / 2).toFixed(1)}" y="8" width="${Math.max(1, X(x.dist - step / 2) - X(x.dist + step / 2)).toFixed(1)}" height="20" fill="${x.seen === 1 ? '#27ae60' : x.seen > 0 ? '#f39c12' : '#d62728'}"><title>${m1(x.dist)} · ${formatStation(x.station).replace(/[<>&"]/g, '')} · ${Math.round(x.seen * 100)} %</title></rect>`).join('');
  const req = r.required > 0 && r.required <= maxD ? `<line x1="${X(r.required)}" x2="${X(r.required)}" y1="2" y2="34" stroke="#1d2327" stroke-width="2" stroke-dasharray="3 2"/>` : '';
  const ticks = [];
  for (let d = 0; d <= maxD; d += maxD > 1000 ? 200 : maxD > 400 ? 100 : 50) ticks.push(`<text x="${X(d)}" y="${H - 2}" font-size="10" text-anchor="${d === 0 ? 'end' : X(d) < 20 ? 'start' : 'middle'}" fill="currentColor">${d}</text>`);
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${t('sight.stripLabel').replace(/[<>&"]/g, '')}">${rects}${req}${ticks.join('')}</svg>`;
}

function renderResult() {
  const box = $('#sight-results');
  if (!result) { box.replaceChildren(h('p', { class: 'muted small', text: t('sight.hint') })); return; }
  const r = result;
  if (!r.samples.length) { box.replaceChildren(h('p', { class: 'small sight-bad', text: t('sight.noApproach') })); return; }
  const okText = r.ok === null ? '' : r.ok ? ` ✓ ${t('sight.ok', { req: m1(r.required) })}` : ` ✗ ${t('sight.notOk', { req: m1(r.required) })}`;
  const svg = h('div', { class: 'sight-strip' });
  svg.innerHTML = strip(r); // built from numbers and translated texts only
  const sel = (list) => {
    state.selection.clear();
    for (const x of list) { if (!state.selection.has(x.model)) state.selection.set(x.model, new Set()); state.selection.get(x.model).add(x.id); }
    applySelection();
  };
  box.replaceChildren(
    h('p', { class: `small ${r.ok === false || !r.sighting ? 'sight-bad' : 'sight-good'}`, text: `${r.sighting ? t('sight.summary', { d: m1(r.sighting), station: formatStation(r.station) }) : t('sight.notSeen', { d: m1(r.samples[0].dist), station: formatStation(r.station) })}${okText}` }),
    svg,
    h('p', { class: 'muted small', text: t('sight.legend') }),
    r.blockers.length ? h('div', { class: 'clr-scroll' }, h('table', { class: 'cor-table clr-table' },
      h('tr', {}, h('th', { text: t('cor.class') }), h('th', { text: t('csv.name') }), h('th', { text: t('sight.hides') }), h('th', { text: t('aln.station') })),
      r.blockers.map((b) => h('tr', { class: 'clr-row', tabindex: '0', title: t('sight.rowTitle'), onclick: () => { sel([b]); fitSelection(); } },
        h('td', { text: b.model.typeName(b.id) }), h('td', { text: b.model.label(b.id) }),
        h('td', { text: `${m1(b.from)} – ${m1(b.to)}${b.full < b.n ? ` (${t('sight.partly')})` : ''}` }),
        h('td', { text: `${formatStation(r.station - r.opts.direction * b.to)} – ${formatStation(r.station - r.opts.direction * b.from)}` }))))) : h('p', { class: 'small clr-ok', text: t('sight.noBlockers') }),
    h('div', { class: 'card-btns' },
      h('button', { class: 'btn sm', text: t('sight.selectBlockers'), onclick: () => sel(r.blockers) }),
      h('button', { class: 'btn sm', text: 'CSV', onclick: csv }),
      h('button', { class: 'btn sm', text: t('sight.issue'), onclick: toIssue })));
}

function csv() {
  if (!result) return;
  const r = result, q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = [['distance_m', 'station', 'seen_percent', 'blocker_class', 'blocker_name', 'blocker_guid'].join(';')];
  for (const x of r.samples) {
    const b = x.blocker;
    rows.push([x.dist, formatStation(x.station), Math.round(x.seen * 100), b ? q(b.model.typeName(b.id)) : '', b ? q(b.model.label(b.id)) : '', b ? q(guidOf(b.model, b.id) || '') : ''].join(';'));
  }
  download(`sight-${formatStation(r.station).replace(/[^\w.+-]/g, '_')}.csv`, `${rows.join('\n')}\n`, 'text/csv');
}

/** One BCF issue for the check: the target selected, the camera at the driver's eye where it is lost. */
async function toIssue() {
  if (!result) return;
  const r = result;
  const lost = r.samples.find((x) => x.dist > r.sighting) || r.samples.at(-1);
  state.selection.clear();
  for (const x of target) { if (!state.selection.has(x.model)) state.selection.set(x.model, new Set()); state.selection.get(x.model).add(x.id); }
  applySelection();
  const box = new THREE.Box3();
  for (const x of target) box.union(x.model.getBox([x.id]));
  if (lost) viewer.flyTo(lost.eye.clone(), box.getCenter(new THREE.Vector3()));
  await new Promise((res) => setTimeout(res, 700));
  issues.create({
    title: t('sight.issueTitle', { name: nameOf(target[0]), station: formatStation(r.station) }),
    description: t('sight.issueText', { d: m1(r.sighting), req: r.required ? m1(r.required) : '–', eye: m1(r.opts.eye), blockers: r.blockers.slice(0, 10).map(nameOf).join(', ') || '–' }),
    type: 'Issue', priority: r.ok === false ? 'High' : 'Normal', assignedTo: '',
  });
  toast(t('bcf.created'), true);
}

$('#sight-use').addEventListener('click', () => useSelection());
