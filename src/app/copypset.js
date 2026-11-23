// Copy a property set to other objects: to the project, a site, a building, a storey, a facility,
// or the selected elements – in the same model or another one. Opened from the ⧉ button of a
// property set in the properties panel (edit mode). The work is done by IfcModel.copyPropertySet.
import { t } from '../i18n.js';
import { isSpatialType } from '../model.js';
import { $, h, state, toast, viewer } from './core.js';

// buildingSMART's standard property and quantity sets are defined for certain classes only
const STANDARD = /^(Pset|Qto)_/i;

let dialog = null;

/** src: {model, elementId, psetId, name, count}; commit(model, fn): runs an edit and refreshes the panel. */
export function openCopyPset(src, commit) {
  dialog?.remove();
  const srcClass = src.model.typeName(src.elementId);
  const name = h('input', { type: 'text', value: src.name, id: 'cp-name' });
  const modelSel = h('select', { id: 'cp-model' }, viewer.models.map((m, i) => h('option', { value: String(i), text: m.displayName, selected: m === src.model })));
  const targets = h('select', { id: 'cp-target', multiple: true, size: 9 });
  const warn = h('div', { class: 'warn', hidden: true });
  const run = h('button', { class: 'btn primary', text: t('cp.run') });
  const target = () => viewer.models[+modelSel.value] || src.model;

  // the choices: the spatial structure (indented), and the selection in that model
  function fillTargets() {
    const m = target();
    const opts = [];
    const walk = (node, depth) => {
      if (!node) return;
      if (isSpatialType(node.type)) {
        const id = node.expressID;
        opts.push(h('option', { value: `id:${id}`, text: `${'   '.repeat(depth)}${m.typeName(id)} · ${m.label(id)}` }));
        for (const c of node.children || []) walk(c, depth + 1);
      }
    };
    walk(m.tree, 0);
    const groups = [h('optgroup', { label: t('cp.spatial') }, opts)];
    const sel = state.selection.get(m);
    if (sel?.size) groups.push(h('optgroup', { label: t('cp.selection') }, h('option', { value: 'sel', text: t('cp.selected', { n: sel.size }) })));
    targets.replaceChildren(...groups);
    check();
  }

  const chosenIds = () => {
    const m = target(), out = new Set();
    for (const o of targets.selectedOptions) {
      if (o.value === 'sel') for (const id of state.selection.get(m) || []) out.add(id);
      else out.add(+o.value.slice(3));
    }
    return [...out];
  };

  // a standard set (Pset_…, Qto_…) on another class: it would be reported by IDS checks and validators
  function check() {
    const m = target(), n = name.value.trim();
    const classes = [...new Set(chosenIds().map((id) => m.typeName(id)))].filter((c) => c && c !== srcClass);
    if (STANDARD.test(n) && classes.length) {
      const own = n.replace(STANDARD, '');
      warn.replaceChildren(
        h('span', { text: t('cp.psetWarn', { name: n, classes: classes.slice(0, 4).join(', ') + (classes.length > 4 ? ' …' : '') }) }), ' ',
        own ? h('button', { class: 'btn xs', text: t('cp.useName', { name: own }), onclick: () => { name.value = own; check(); } }) : null);
      warn.hidden = false;
    } else warn.hidden = true;
    run.disabled = !chosenIds().length || !n;
  }

  modelSel.addEventListener('change', fillTargets);
  targets.addEventListener('change', check);
  name.addEventListener('input', check);
  run.addEventListener('click', async () => {
    const m = target(), ids = chosenIds();
    const r = await commit(m, () => m.copyPropertySet({ model: src.model, psetId: src.psetId }, name.value, ids));
    if (!r) return;
    dialog.close();
    toast(t('cp.done', { pset: name.value.trim(), n: r.created + r.merged, created: r.created, merged: r.merged })
      + (r.skipped ? ` ${t('cp.skipped', { n: r.skipped })}` : '') + (r.others ? ` ${t('edit.batchOthers', { n: r.others })}` : ''), true);
  });

  dialog = h('dialog', { id: 'copy-pset-dialog' },
    h('form', { method: 'dialog', class: 'dlg-x' }, h('button', { class: 'icon-btn', text: '✕', title: t('common.close'), 'aria-label': t('common.close') })),
    h('h2', { text: t('cp.title') }),
    h('p', { class: 'muted small', text: t('cp.source', { pset: src.name, element: src.model.label(src.elementId), cls: srcClass, n: src.count }) }),
    h('label', { class: 'field' }, h('span', { text: t('cp.name') }), name),
    warn,
    viewer.models.length > 1 ? h('label', { class: 'field' }, h('span', { text: t('cp.model') }), modelSel) : null,
    h('label', { class: 'field' }, h('span', { text: t('cp.target') }), targets),
    h('p', { class: 'muted small', text: t('cp.note') }),
    h('div', { class: 'dialog-btns' }, run));
  dialog.addEventListener('close', () => dialog?.remove());
  document.body.append(dialog);
  fillTargets();
  dialog.showModal();
  $('#cp-target', dialog).focus();
}
