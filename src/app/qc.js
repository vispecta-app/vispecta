// Quick quality check (#138): the dialog with a row per check, its elements (select, zoom, colour),
// CSV of everything and a BCF issue per check. The checks are in ../qc.js.
import { t, fmtNum } from '../i18n.js';
import { quickCheck } from '../qc.js';
import { guidOf } from '../bcf.js';
import { $, download, h, state, toast, viewer, withLoading } from './core.js';
import { applySelection, fitSelection, issues } from '../main.js';

let res = null;
const open = new Set();
const ICON = { error: '✗', warning: '⚠', info: 'ℹ' };

export async function openQcDialog() {
  if (!viewer.models.length) return toast(t('msg.loadFirst'));
  $('#qc-dialog').showModal();
  await runQc();
}

export async function runQc() {
  try {
    res = await withLoading((progress) => quickCheck(viewer, viewer.models, { onProgress: (f) => progress(t('qc.running'), f) }));
  } catch (e) {
    console.error(e);
    return toast(t('qc.failed', { error: e.message || e }));
  }
  render();
}

function select(items, zoom = false) {
  state.selection.clear();
  for (const x of items) {
    if (x.id === null) continue;
    if (!state.selection.has(x.model)) state.selection.set(x.model, new Set());
    state.selection.get(x.model).add(x.id);
  }
  applySelection();
  if (zoom) fitSelection();
}

const label = (x) => (x.id === null ? x.model.name : `${x.model.typeName(x.id)} – ${x.model.label(x.id)}`);

function render() {
  const box = $('#qc-results');
  if (!res) { box.replaceChildren(); return; }
  const problems = res.checks.filter((c) => c.items.length);
  const counts = { error: 0, warning: 0, info: 0 };
  for (const c of problems) counts[c.severity] += c.items.length;
  box.replaceChildren(
    h('p', { class: 'small', text: t('qc.summary', { n: fmtNum(res.elements), models: res.models, errors: fmtNum(counts.error), warnings: fmtNum(counts.warning), infos: fmtNum(counts.info) }) }),
    h('div', { class: 'qc-list' }, res.checks.map((c) => {
      const n = c.items.length, isOpen = open.has(c.key) && n;
      const head = h('button', { class: `qc-head ${n ? c.severity : 'ok'}`, 'aria-expanded': String(!!isOpen), onclick: () => { if (open.has(c.key)) open.delete(c.key); else open.add(c.key); render(); } },
        h('span', { class: 'qc-icon', text: n ? ICON[c.severity] : '✓' }),
        h('span', { class: 'qc-name', text: t(`qc.${c.key}`) }),
        h('span', { class: 'qc-count', text: n ? fmtNum(n) : t('qc.none') }));
      const body = isOpen ? h('div', { class: 'qc-body' },
        h('p', { class: 'muted small', text: t(`qc.${c.key}Help`) }),
        h('div', { class: 'card-btns' },
          c.items.some((x) => x.id !== null) ? h('button', { class: 'btn xs', text: t('cor.select'), onclick: () => select(c.items) }) : null,
          c.items.some((x) => x.id !== null) ? h('button', { class: 'btn xs', text: t('qc.issue'), onclick: () => toIssue(c) }) : null),
        h('ul', { class: 'qc-items' }, c.items.slice(0, 300).map((x) => h('li', {},
          x.id !== null ? h('a', { href: '#', text: label(x), onclick: (e) => { e.preventDefault(); select([x], true); } }) : h('span', { text: label(x) }),
          x.note ? h('span', { class: 'muted', text: ` · ${x.note}` }) : null,
          x.id !== null ? h('span', { class: 'muted', text: ` · ${x.model.name}` }) : null))),
        n > 300 ? h('p', { class: 'muted small', text: t('rep.more', { n: fmtNum(n - 300) }) }) : null) : null;
      return h('div', { class: 'qc-check' }, head, body);
    })));
}

export function qcCsv() {
  if (!res) return;
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const rows = [['check', 'severity', 'model', 'class', 'name', 'guid', 'note'].join(';')];
  for (const c of res.checks) {
    for (const x of c.items) rows.push([q(t(`qc.${c.key}`)), c.severity, q(x.model.name), q(x.id === null ? '' : x.model.typeName(x.id)), q(x.id === null ? '' : x.model.label(x.id)), q(x.id === null ? '' : guidOf(x.model, x.id)), q(x.note || '')].join(';'));
  }
  download(`quality-check-${new Date().toISOString().slice(0, 10)}.csv`, `﻿${rows.join('\r\n')}\r\n`, 'text/csv');
}

/** One issue for a check: its elements selected (in the viewpoint), the list in the description. */
async function toIssue(c) {
  select(c.items.slice(0, 500), true);
  await new Promise((r) => setTimeout(r, 600));
  issues.create({
    title: `${t('qc.issuePrefix')}: ${t(`qc.${c.key}`)} (${c.items.length})`,
    description: `${t(`qc.${c.key}Help`)}\n\n${c.items.slice(0, 30).map((x) => `- ${label(x)}${x.note ? ` (${x.note})` : ''}`).join('\n')}${c.items.length > 30 ? `\n${t('rep.more', { n: c.items.length - 30 })}` : ''}`,
    type: 'Issue', priority: c.severity === 'error' ? 'High' : 'Normal', assignedTo: '',
  });
  toast(t('bcf.created'), true);
}
