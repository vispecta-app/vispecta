// The model browser (#63, moved out of main.js): model cards, groups, names and aliases.
import * as THREE from 'three';
import { t, fmtNum } from '../i18n.js';
import { $, $$, download, fmtBytes, h, state, toast, viewer, withLoading } from './core.js';
import { alignmentRow, drawnLineRow, drawnPaths } from './lines.js';
import { afterModelsChanged, causeText, projects, refreshVisibilityUi, renderStatus } from '../main.js';
import { CONTOUR_INTERVALS, openVolumeDialog, setContours, terrainLandXml } from './terrain.js';
import { cloudCard } from './clouds.js';
import { cadCard, drawings } from './cad.js';
import { crsChanged, crsRow, projectCrsBar } from './crs.js';

// ======================================================================= models
/** File name with line-break opportunities after _ - . (long names without spaces wrap nicely). */
export function breakableName(name) {
  const out = [];
  for (const part of name.split(/(?<=[_\-.])/)) out.push(part, document.createElement('wbr'));
  out.pop();
  return out;
}

// ------------------------------------------------------------------ model browser
// Models can be put in named groups that are switched on and off as a whole (a model is shown when
// both its own switch and its group's are on), and can get an alias; the file name stays visible.
state.modelGroups = []; // [{id, name, visible, open}]
let dragModel = null;
export const groupOf = (m) => state.modelGroups.find((g) => g.id === m.groupId) || null;
export const modelTitle = (m) => (m.alias ? `${m.alias} (${m.name})` : m.name);

function setModelGroup(m, g) {
  m.groupId = g?.id || null;
  m.setGroupHidden(g ? !g.visible : false);
  afterModelsChanged();
  projects.touch?.();
}

function setGroupVisible(g, on) {
  g.visible = on;
  for (const m of viewer.models) if (m.groupId === g.id) m.setGroupHidden(!on);
  afterModelsChanged();
  refreshVisibilityUi?.();
  projects.touch?.();
}

export function newModelGroup(models = []) {
  const g = { id: `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, name: t('mg.defaultName', { n: state.modelGroups.length + 1 }), visible: true, open: true };
  state.modelGroups.push(g);
  for (const m of models) { m.groupId = g.id; m.setGroupHidden(false); }
  afterModelsChanged();
  projects.touch?.();
  // start renaming it right away
  setTimeout(() => $(`.mgroup[data-group="${g.id}"] .mg-rename`)?.click(), 0);
  return g;
}

/** Replaces a text with an input; Enter or leaving the field saves, Esc cancels. */
export function inlineEdit(span, value, placeholder, save) {
  const input = h('input', { type: 'text', class: 'inline-edit', value: value || '', placeholder });
  span.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (ok) => { if (done) return; done = true; if (ok) save(input.value.trim()); else renderModels(); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); e.stopPropagation(); });
  input.addEventListener('blur', () => finish(true));
}

export function renderModels() {
  const list = $('#model-list');
  list.replaceChildren();
  $('#models-empty').hidden = viewer.models.length + viewer.clouds.length + drawnPaths.length + drawings.length > 0;
  $('#model-actions').hidden = viewer.models.length === 0;
  if (viewer.models.length || viewer.clouds.length) list.append(projectCrsBar());
  // groups whose models are all gone stay until removed; models of a removed group are loose
  const loose = viewer.models.filter((m) => !groupOf(m));
  for (const g of state.modelGroups) list.append(groupSection(g, viewer.models.filter((m) => m.groupId === g.id)));
  if (state.modelGroups.length) list.append(groupSection(null, loose));
  else for (const m of loose) list.append(modelCard(m));
  // drawn lines (#74)
  if (drawnPaths.length) {
    list.append(h('section', { class: 'mgroup lines' },
      h('div', { class: 'mg-head' }, h('span', { class: 'mg-name muted', text: t('line.title') }), h('span', { class: 'mg-count', text: String(drawnPaths.length) })),
      h('div', { class: 'mg-body' }, drawnPaths.map(drawnLineRow))));
  }
  // point clouds (#27)
  if (viewer.clouds.length) {
    list.append(h('section', { class: 'mgroup clouds' },
      h('div', { class: 'mg-head' }, h('span', { class: 'mg-name muted', text: t('pc.title') }), h('span', { class: 'mg-count', text: String(viewer.clouds.length) })),
      h('div', { class: 'mg-body' }, viewer.clouds.map(cloudCard))));
  }
  // DWG / DXF drawings (#135)
  if (drawings.length) {
    list.append(h('section', { class: 'mgroup drawings' },
      h('div', { class: 'mg-head' }, h('span', { class: 'mg-name muted', text: t('cad.title') }), h('span', { class: 'mg-count', text: String(drawings.length) })),
      h('div', { class: 'mg-body' }, drawings.map(cadCard))));
  }
}

/** A group in the model browser (null: the models without a group). Models can be dropped on it. */
function groupSection(g, models) {
  const sec = h('section', { class: `mgroup${g ? '' : ' loose'}${g && !g.visible ? ' off' : ''}`, 'data-group': g?.id || '' });
  if (g) {
    const vis = h('input', { type: 'checkbox', checked: g.visible, title: t('mg.show') });
    vis.addEventListener('change', () => setGroupVisible(g, vis.checked));
    const name = h('span', { class: 'mg-name', text: g.name, title: g.name });
    const rename = () => inlineEdit(name, g.name, t('mg.defaultName', { n: '' }), (v) => { if (v) g.name = v; renderModels(); projects.touch?.(); });
    name.addEventListener('dblclick', rename);
    sec.append(h('div', { class: 'mg-head' },
      h('button', { class: `mg-caret${g.open ? ' open' : ''}`, 'aria-expanded': String(!!g.open), 'aria-label': t('mg.toggle'), onclick: () => { g.open = !g.open; renderModels(); } }),
      vis, name,
      h('span', { class: 'mg-count', text: String(models.length) }),
      h('button', { class: 'icon-btn mg-zoom', title: t('mg.zoom'), text: '⤢', onclick: () => { const b = new THREE.Box3(); for (const m of models) if (m.visible) b.union(m.getBox()); if (!b.isEmpty()) viewer.fitBox(b); } }),
      h('button', { class: 'icon-btn mg-rename', title: t('mg.rename'), text: '✎', onclick: rename }),
      h('button', { class: 'icon-btn', title: t('mg.delete'), text: '✕', onclick: () => {
        if (models.length && !confirm(t('mg.deleteConfirm', { name: g.name }))) return;
        for (const m of models) { m.groupId = null; m.setGroupHidden(false); }
        state.modelGroups = state.modelGroups.filter((x) => x !== g);
        afterModelsChanged();
        projects.touch?.();
      } })));
    if (g.open) {
      const body = h('div', { class: 'mg-body' }, models.map(modelCard));
      if (!models.length) body.append(h('div', { class: 'mg-empty', text: t('mg.dropHere') }));
      sec.append(body);
    }
  } else {
    sec.append(h('div', { class: 'mg-head' }, h('span', { class: 'mg-name muted', text: t('mg.loose') }), h('span', { class: 'mg-count', text: String(models.length) })));
    sec.append(h('div', { class: 'mg-body' }, models.length ? models.map(modelCard) : h('div', { class: 'mg-empty', text: t('mg.dropHere') })));
  }
  // drop a dragged model card here
  sec.addEventListener('dragover', (e) => { if (!dragModel) return; e.preventDefault(); sec.classList.add('drop'); });
  sec.addEventListener('dragleave', (e) => { if (!sec.contains(e.relatedTarget)) sec.classList.remove('drop'); });
  sec.addEventListener('drop', (e) => {
    e.preventDefault();
    sec.classList.remove('drop');
    if (dragModel) { const m = dragModel; dragModel = null; if (g) g.open = true; setModelGroup(m, g); }
  });
  return sec;
}

/** The card of a model: a compact head (switch, name, alias, file name) and details to fold out. */
function modelCard(m) {
  const open = m.cardOpen ?? viewer.models.length <= 2;
  const colorInput = h('input', { type: 'color', value: m.overrideColor ? `#${m.overrideColor.getHexString()}` : '#b0b0b0', title: t('models.color') });
  // the colour dot in the head is a colour picker too: click it to choose the model colour
  const dotInput = h('input', { type: 'color', value: colorInput.value, tabindex: '-1' });
  const dot = h('label', { class: 'swatch-dot', title: t('models.colorPick') }, dotInput);
  dot.style.background = m.overrideColor ? `#${m.overrideColor.getHexString()}` : 'conic-gradient(#e15759, #edc948, #59a14f, #4e79a7, #e15759)';
  const pickColor = (v) => { m.setColor(v); dot.style.background = v; colorInput.value = v; dotInput.value = v; projects.touch?.(); };
  colorInput.addEventListener('input', () => pickColor(colorInput.value));
  dotInput.addEventListener('input', () => pickColor(dotInput.value));

  const opacity = h('input', { type: 'range', min: '0.05', max: '1', step: '0.05', value: String(m.opacity) });
  const opVal = h('span', { class: 'muted', text: `${Math.round(m.opacity * 100)} %` });
  opacity.addEventListener('input', () => { m.setOpacity(+opacity.value); opVal.textContent = `${Math.round(+opacity.value * 100)} %`; });

  const vis = h('input', { type: 'checkbox', title: t('models.visible'), checked: m.ownVisible !== false });
  vis.addEventListener('change', () => { m.setVisible(vis.checked); renderStatus(); afterModelsChanged(); projects.touch?.(); });

  const changes = m.changes.length
    ? h('details', { class: 'changes' },
      h('summary', {}, h('span', { class: 'badge-mod', text: t('models.modified', { n: m.changes.length }) })),
      h('ol', {}, m.changes.slice(-50).reverse().map((c) => h('li', { text: c.description }))))
    : null;

  // name: the alias (if any) in bold, the file name always below it
  const label = h('span', { class: 'card-name', title: m.name }, breakableName(m.alias || m.name));
  const editAlias = () => inlineEdit(label, m.alias, m.name, (v) => { m.alias = v || null; afterModelsChanged(); projects.touch?.(); });
  label.addEventListener('dblclick', editAlias);
  const sub = h('span', { class: 'card-file' }, m.alias ? breakableName(m.name) : null,
    h('span', { class: 'muted', text: `${m.alias ? ' · ' : ''}${m.schema} · ${t('models.elements', { n: fmtNum(m.elementIds.size) })}` }));

  // group: choose one, or make a new one with this model
  const groupSel = h('select', { title: t('mg.group') },
    h('option', { value: '', text: t('mg.none') }),
    state.modelGroups.map((g) => h('option', { value: g.id, text: g.name, selected: g.id === m.groupId })),
    h('option', { value: '__new', text: t('mg.newOption') }));
  groupSel.addEventListener('change', () => {
    if (groupSel.value === '__new') { newModelGroup([m]); return; }
    setModelGroup(m, state.modelGroups.find((g) => g.id === groupSel.value) || null);
  });

  const card = h('div', { class: `card model-card${open ? ' open' : ''}${m.visible ? '' : ' off'}`, draggable: 'true' },
    h('div', { class: 'card-head' },
      h('button', { class: `mg-caret${open ? ' open' : ''}`, 'aria-expanded': String(open), 'aria-label': t('models.details'), onclick: () => { m.cardOpen = !open; renderModels(); } }),
      vis, dot,
      h('span', { class: 'card-title' }, label, sub),
      m.coordWarning && !m.coordWarning.dismissed ? h('button', {
        class: 'icon-btn coord-warn',
        text: '⚠',
        title: `${t('coord.far', { name: m.alias || m.name, km: m.coordWarning.km.toFixed(1) })} ${causeText(m.coordWarning.cause)} ${t('coord.dismiss')}`,
        onclick: () => { m.coordWarning.dismissed = true; renderModels(); },
      }) : null,
      h('button', { class: 'icon-btn', title: t('models.aliasTitle'), text: '✎', onclick: editAlias })),
    open ? h('div', { class: 'card-body' },
      h('div', { class: 'card-meta', text: `${fmtBytes(m.fileSize)}` }),
      changes,
      h('div', { class: 'card-row' }, h('label', { text: t('models.color') }), colorInput,
        h('button', { class: 'btn xs', onclick: () => { m.setColor(null); renderModels(); projects.touch?.(); }, text: t('models.original') })),
      h('div', { class: 'card-row' }, h('label', { text: t('models.transparency') }), opacity, opVal),
      m.terrain ? h('div', { class: 'card-row' }, h('label', { text: t('ter.heightColors') }),
        h('select', { title: t('ter.heightTitle'), onchange: (e) => { m.setHeightColors(e.target.value === 'off' ? false : e.target.value); viewer.invalidate(); renderModels(); projects.touch?.(); } },
          ['off', 'default', 'earth'].map((v) => h('option', { value: v, text: t(`ter.hc.${v}`), selected: (m.heightColors || 'off') === v }))),
        m.heightColors && m.heightRange ? h('span', { class: 'muted card-note', title: t('ter.rangeTitle'), text: m.heightRange.map((y) => fmtNum(+viewer.toIfc(new THREE.Vector3(0, y, 0).applyMatrix4(m.group.matrixWorld)).z.toFixed(1))).join(' – ') + ' m' }) : null) : null,
      m.terrain ? h('div', { class: 'card-row' }, h('label', { text: t('ter.contours') }),
        h('select', { title: t('ter.contoursTitle'), onchange: (e) => { setContours(m, e.target.value === 'off' ? false : e.target.value === 'auto' ? 'auto' : +e.target.value); renderModels(); projects.touch?.(); } },
          CONTOUR_INTERVALS.map((v) => h('option', { value: String(v), text: v === 'off' ? t('ter.c.off') : v === 'auto' ? (m.contours === 'auto' && m.contourData ? `${t('ter.c.auto')} (${fmtNum(m.contourData.interval)} m)` : t('ter.c.auto')) : `${fmtNum(v)} m`, selected: String(m.contours || 'off') === String(v) })))) : null,
      m.terrain ? h('div', { class: 'card-row' }, h('button', { class: 'btn sm', text: t('vol.open'), title: t('vol.intro'), onclick: () => openVolumeDialog(m) }),
        h('button', { class: 'btn sm', text: t('ter.lxExport'), title: t('ter.lxTitle'), onclick: () => terrainLandXml(m) })) : null,
      h('div', { class: 'card-row' }, h('label', { text: t('mg.group') }), groupSel),
      ...crsRow(m, (v) => { m.crs = v; crsChanged(); renderModels(); projects.touch?.(); }),
      m.alignments?.length ? h('div', { class: 'aln-list' }, h('div', { class: 'aln-head muted', text: t('aln.list', { n: m.alignments.length }) }), m.alignments.map(alignmentRow)) : null,
      h('div', { class: 'card-btns' },
        h('button', { class: 'btn sm', onclick: () => viewer.fitBox(m.getBox()), text: t('models.zoom') }),
        h('button', { class: `btn sm${m.changes.length ? ' primary-outline' : ''}`, onclick: () => saveIfc(m), text: t('models.downloadIfc') }),
        h('button', { class: 'btn sm', onclick: () => exportCsv(m), text: t('models.exportCsv') }),
        h('button', {
          class: 'btn sm danger',
          onclick: () => {
            const msg = m.changes.length ? t('models.removeUnsaved', { name: m.name }) : t('models.removeConfirm', { name: m.name });
            if (!confirm(msg)) return;
            state.selection.delete(m);
            if (state.active?.model === m) state.active = null;
            viewer.removeModel(m);
            afterModelsChanged();
          },
          text: t('models.remove'),
        }))) : null);
  // drag the card onto a group (not when the drag starts in a field)
  card.addEventListener('dragstart', (e) => {
    if (e.target.closest?.('input, select, button, .swatch-dot') && e.target !== card) { e.preventDefault(); return; }
    dragModel = m;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', m.name);
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => { dragModel = null; card.classList.remove('dragging'); $$('.mgroup.drop').forEach((x) => x.classList.remove('drop')); });
  return card;
}

async function saveIfc(model) {
  const name = model.changes.length ? model.name.replace(/(\.ifc)?$/i, '_edited.ifc') : model.name;
  download(name, await model.getBytes(), 'application/x-step');
}

async function exportCsv(model) {
  try {
    await withLoading(async (progress) => {
      progress(t('csv.collecting', { name: model.name }), 0);
      const { cols, rows } = await model.exportRows((f) => progress(t('csv.collecting', { name: model.name }), f));
      const esc = (v) => {
        const s = v === undefined || v === null ? '' : String(v);
        return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const csv = '﻿' + [cols.map(esc).join(';'), ...rows.map((r) => cols.map((c) => esc(r[c])).join(';'))].join('\r\n');
      download(model.name.replace(/\.ifc$/i, '') + '-properties.csv', csv, 'text/csv;charset=utf-8');
    });
  } catch (e) {
    console.error(e);
    toast(t('msg.exportFailed', { error: e.message || e }));
  }
}

