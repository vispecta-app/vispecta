// Checks of models (#63, moved out of main.js): the IDS check (ifctester in the Python worker) with
// its results panel, and the comparison of two model versions with its panel and 3D colours.
import { t, fmtNum } from '../i18n.js';
import { keyLabel } from '../filters.js';
import { runIdsCheck, colorIdsResult, idsCsv, specSummary, IDS_EXAMPLES } from '../ids.js';
import { compareModels, showComparison, clearComparison, comparisonCsv, geomText, summaryText, CMP_COLORS } from '../compare.js';
import { $, $$, download, h, state, toast, viewer, withLoading } from './core.js';
import { applySelection, modelTitle, python, refreshVisibilityUi, renderModels, select } from '../main.js';

// ========================================================================== IDS
let idsResults = null; // [{model, report}]
let idsName = '';
const idsOpen = new Set(); // "modelUid:specIndex" of expanded specifications

export function openIdsDialog() {
  if (!viewer.models.length) return toast(t('msg.loadFirst'));
  $('#ids-models').replaceChildren(...viewer.models.map((m) => h('label', { class: 'chk' },
    h('input', { type: 'checkbox', value: String(m.uid), checked: true }), h('span', { text: `${modelTitle(m)} · ${m.schema}` }))));
  renderIdsExamples();
  $('#ids-dialog').showModal();
}

/** The example IDS files: choose one instead of a file of your own (and download it to look inside). */
function renderIdsExamples() {
  const sel = $('#ids-example');
  const keep = sel.value;
  sel.replaceChildren(h('option', { value: '', text: t('ids.exampleNone') }),
    ...IDS_EXAMPLES.map((x) => h('option', { value: x.file, text: t(`ids.ex.${x.key}`) })));
  sel.value = keep;
  updateIdsExample();
}
function updateIdsExample() {
  const ex = IDS_EXAMPLES.find((x) => x.file === $('#ids-example').value);
  const dl = $('#ids-example-dl');
  dl.hidden = !ex;
  if (ex) { dl.href = `examples/ids/${ex.file}`; dl.setAttribute('download', ex.file); }
  $('#ids-example-desc').textContent = ex ? t(`ids.ex.${ex.key}Desc`) : '';
}
$('#ids-example').addEventListener('change', () => { if ($('#ids-example').value) $('#ids-file').value = ''; updateIdsExample(); });
$('#ids-file').addEventListener('change', () => { if ($('#ids-file').files.length) { $('#ids-example').value = ''; updateIdsExample(); } });

export async function runIds() {
  const file = $('#ids-file').files[0];
  const example = $('#ids-example').value;
  if (!file && !example) return toast(t('ids.chooseFile'));
  const uids = $$('#ids-models input:checked').map((i) => +i.value);
  const models = viewer.models.filter((m) => uids.includes(m.uid));
  if (!models.length) return toast(t('msg.loadFirst'));
  let text;
  if (file) { text = await file.text(); idsName = file.name; } else {
    try {
      const r = await fetch(`examples/ids/${example}`);
      if (!r.ok) throw new Error(String(r.status));
      text = await r.text();
    } catch { return toast(t('ids.failed')); }
    idsName = example;
  }
  $('#ids-dialog').close();
  const res = await runIdsCheck(python, models, text, idsName);
  if (!res) { toast(t('ids.failed')); return; }
  idsResults = res;
  idsOpen.clear();
  renderIds();
}

function idsSelect(model, ids) {
  state.selection.clear();
  state.treeKeys.clear();
  if (ids.length) state.selection.set(model, new Set(ids));
  state.active = ids.length === 1 ? { model, id: ids[0] } : null;
  applySelection();
  const b = model.getBox(ids);
  if (!b.isEmpty()) viewer.fitBox(b);
}

function renderIds() {
  const panel = $('#ids-panel');
  panel.hidden = !idsResults;
  if (!idsResults) { panel.replaceChildren(); return; }
  const parts = [
    h('div', { class: 'cmp-head' }, h('b', { text: t('ids.title') }), h('span', { class: 'spacer' }),
      h('button', { class: 'icon-btn', title: t('common.close'), text: '✕', onclick: () => { idsResults = null; renderIds(); } })),
    h('div', { class: 'muted small', text: idsName }),
  ];
  for (const entry of idsResults) {
    const { model, report } = entry;
    const passed = report.specs.filter((s) => s.status).length;
    parts.push(h('div', { class: `ids-model ${report.status ? 'ok' : 'bad'}` },
      h('b', { text: model.name }),
      h('span', { text: t('ids.modelSummary', { pass: passed, total: report.specs.length }) })));
    report.specs.forEach((sp, i) => {
      const key = `${model.uid}:${i}`;
      const open = idsOpen.has(key);
      // not applicable: skipped, or no elements where none are required (a "required" or
      // "prohibited" specification with no elements has a result of its own)
      const na = sp.skipped || (!sp.applicable && sp.cardinality !== 'required' && sp.cardinality !== 'prohibited');
      const head = h('button', { class: 'cmp-group-head ids-spec-head' },
        h('span', { class: `ids-icon ${na ? 'na' : sp.status ? 'ok' : 'bad'}`, text: na ? '–' : sp.status ? '✓' : '✗' }),
        h('span', { class: 'ids-spec-name', text: sp.name || `#${i + 1}` }),
        h('span', { class: 'muted small', text: specSummary(sp) }),
        h('span', { class: 'caret', text: open ? '▾' : '▸' }));
      head.addEventListener('click', () => { open ? idsOpen.delete(key) : idsOpen.add(key); renderIds(); });
      let body = null;
      if (open) {
        body = h('div', { class: 'cmp-group-body' },
          sp.description ? h('div', { class: 'small', text: sp.description }) : null,
          sp.instructions ? h('div', { class: 'muted small', text: sp.instructions }) : null,
          h('ul', { class: 'ids-reqs' }, sp.requirements.map((r) => h('li', { class: r.status ? 'ok' : 'bad' },
            h('span', { text: r.status ? '✓ ' : '✗ ' }), h('span', { text: r.description }), r.fail ? h('b', { text: ` (${fmtNum(r.fail)})` }) : null))),
          h('div', { class: 'flt-btns' },
            sp.failed.length ? h('button', { class: 'btn sm', text: t('ids.selectFailed', { n: fmtNum(sp.failed.length) }), onclick: () => idsSelect(model, sp.failed.map((f) => f.id)) }) : null,
            h('button', { class: 'btn sm', text: t('ids.colorSpec'), onclick: () => colorIdsResult(entry, i) })),
          sp.failed.slice(0, 200).map((f) => {
            const r = h('div', { class: 'cmp-row removed' },
              h('div', { class: 'cmp-row-head' }, h('span', { class: 'lbl', text: f.name || f.gid }), h('span', { class: 'cls', text: f.cls })),
              h('div', { class: 'muted small', text: f.reasons.join(' · ') }));
            r.addEventListener('click', () => idsSelect(model, [f.id]));
            return r;
          }),
          sp.failed.length > 200 ? h('div', { class: 'muted small', text: t('cmp.more', { n: fmtNum(sp.failed.length - 200) }) }) : null);
      }
      parts.push(h('div', { class: 'cmp-group' }, head, body));
    });
  }
  parts.push(h('div', { class: 'cmp-foot' },
    h('button', { class: 'link', text: t('ids.colorAll'), onclick: () => { for (const e of idsResults) colorIdsResult(e); } }),
    h('button', { class: 'link', text: t('flt.resetColors'), onclick: () => { for (const e of idsResults) e.model.resetElementColors(); } }),
    h('button', { class: 'link', text: t('ids.exportCsv'), onclick: () => download(`ids-${idsName.replace(/\.(ids|xml)$/i, '')}.csv`, idsCsv(idsResults), 'text/csv;charset=utf-8') })));
  panel.replaceChildren(...parts);
}

// ====================================================================== compare
export let comparison = null;
const cmpOpen = { added: true, removed: true, changed: true };

export function openCompareDialog() {
  if (viewer.models.length < 2) return toast(t('cmp.needTwo'));
  const opts = viewer.models.map((m, i) => [String(m.uid), `${i + 1}. ${modelTitle(m)}`]);
  $('#cmp-old').replaceChildren(...opts.map(([v, l], i) => h('option', { value: v, text: l, selected: i === 0 })));
  $('#cmp-new').replaceChildren(...opts.map(([v, l], i) => h('option', { value: v, text: l, selected: i === opts.length - 1 })));
  $('#compare-dialog').showModal();
}

export async function runCompare() {
  const oldM = viewer.models.find((m) => String(m.uid) === $('#cmp-old').value);
  const newM = viewer.models.find((m) => String(m.uid) === $('#cmp-new').value);
  if (!oldM || !newM || oldM === newM) return toast(t('cmp.pickTwo'));
  $('#compare-dialog').close();
  if (comparison) clearComparison(comparison);
  try {
    comparison = await withLoading(async (progress) => {
      for (const m of [oldM, newM]) {
        if (!m._pindex || m._pindex.version !== m.version) await m.buildPropertyIndex((f) => progress(t('flt.building', { name: m.name }), f * 0.6), { lang: document.documentElement.lang });
      }
      progress(t('cmp.running'), 0.6);
      return compareModels(oldM, newM, (f) => progress(t('cmp.running'), 0.6 + 0.4 * f));
    });
  } catch (e) {
    console.error(e);
    return toast(t('cmp.failed', { error: e.message || e }));
  }
  comparison.showUnchanged = $('#cmp-unchanged').checked;
  for (const m of viewer.models) if (m !== oldM && m !== newM) m.setVisible(false);
  showComparison(comparison, { showUnchanged: comparison.showUnchanged });
  renderComparison();
  refreshVisibilityUi();
  renderModels();
}

export function endComparison() {
  if (!comparison) return;
  clearComparison(comparison);
  comparison = null;
  renderComparison();
  refreshVisibilityUi();
}

export function renderComparison() {
  const panel = $('#cmp-panel');
  panel.hidden = !comparison;
  if (!comparison) { panel.replaceChildren(); return; }
  const c = comparison;
  const dot = (k) => h('span', { class: 'cmp-dot', style: `background:#${CMP_COLORS[k].toString(16).padStart(6, '0')}` });
  const row = (model, id, extra = null, kind = '') => {
    const r = h('div', { class: `cmp-row ${kind}` },
      h('div', { class: 'cmp-row-head' }, h('span', { class: 'lbl', text: model.label(id) }), h('span', { class: 'cls', text: model.typeName(id) })),
      extra);
    r.addEventListener('click', () => {
      select(model, [id], { activeId: id });
      const b = model.getBox([id]);
      if (!b.isEmpty()) viewer.fitBox(b);
    });
    return r;
  };
  const LIMIT = 300;
  const group = (key, items, make) => {
    const head = h('button', { class: 'cmp-group-head' }, dot(key), h('span', { text: t(`cmp.${key}`) }), h('b', { text: fmtNum(items.length) }), h('span', { class: 'caret', text: cmpOpen[key] ? '▾' : '▸' }));
    head.addEventListener('click', () => { cmpOpen[key] = !cmpOpen[key]; renderComparison(); });
    const body = cmpOpen[key] ? h('div', { class: 'cmp-group-body' }, items.slice(0, LIMIT).map(make),
      items.length > LIMIT ? h('div', { class: 'muted small', text: t('cmp.more', { n: fmtNum(items.length - LIMIT) }) }) : null) : null;
    return h('div', { class: 'cmp-group' }, head, body);
  };
  const diffTable = (ch) => {
    const lines = [...ch.diffs.slice(0, 12).map((d) => [keyLabel(d.key), `${fmtCmp(d.a)} → ${fmtCmp(d.b)}`]), ...geomText(ch.geom)];
    if (ch.diffs.length > 12) lines.push(['…', t('cmp.moreDiffs', { n: ch.diffs.length - 12 })]);
    return h('table', { class: 'cmp-diffs' }, lines.map(([k, v]) => h('tr', {}, h('td', { text: k }), h('td', { text: v }))));
  };
  const unchangedToggle = h('input', { type: 'checkbox', checked: c.showUnchanged });
  unchangedToggle.addEventListener('change', () => {
    c.showUnchanged = unchangedToggle.checked;
    clearComparison(c);
    showComparison(c, { showUnchanged: c.showUnchanged });
    refreshVisibilityUi();
  });
  panel.replaceChildren(
    h('div', { class: 'cmp-head' },
      h('b', { text: t('cmp.title') }), h('span', { class: 'spacer' }),
      h('button', { class: 'icon-btn', title: t('cmp.end'), text: '✕', onclick: endComparison })),
    h('div', { class: 'muted small', text: `${c.oldM.name} → ${c.newM.name}` }),
    h('div', { class: 'cmp-summary', text: summaryText(c) }),
    h('label', { class: 'chk' }, unchangedToggle, h('span', { text: t('cmp.showUnchanged') })),
    group('added', c.added, (id) => row(c.newM, id, null, 'added')),
    group('removed', c.removed, (id) => row(c.oldM, id, null, 'removed')),
    group('changed', c.changed, (ch) => row(c.newM, ch.b, diffTable(ch), 'changed')),
    h('div', { class: 'cmp-foot' },
      h('button', { class: 'link', text: t('cmp.exportCsv'), onclick: () => download(`comparison-${c.newM.name.replace(/\.ifc$/i, '')}.csv`, comparisonCsv(c), 'text/csv;charset=utf-8') }),
      h('button', { class: 'link', text: t('cmp.end'), onclick: endComparison })),
  );
}

function fmtCmp(v) {
  if (v === undefined) return '—';
  return typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 6 }) : String(v);
}

/** IDS results and a comparison of models that are no longer open are dropped. */
export function dropStaleChecks() {
  if (idsResults && idsResults.some((e) => !viewer.models.includes(e.model))) { idsResults = null; renderIds(); }
  if (comparison && (!viewer.models.includes(comparison.oldM) || !viewer.models.includes(comparison.newM))) { comparison = null; renderComparison(); }
}

