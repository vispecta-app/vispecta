// Annotations in the 3D view (#130): the panel (note / arrow, colour, list with text and delete).
// The drawing is in ../annotations.js.
import * as THREE from 'three';
import { t } from '../i18n.js';
import { ANNOT_COLORS, AnnotationLayer } from '../annotations.js';
import { $, $$, h, toast, viewer } from './core.js';
import { projects, setMeasureMode } from '../main.js';

export const notes = new AnnotationLayer(viewer);
viewer.annotations = notes; // bcf.js: saved views and issues keep them, arrows as BCF lines

let open = false;
let focusId = null; // the note whose text box gets the focus after the next render

export function openNotes(mode = notes.mode || 'note') {
  if (!viewer.models.length && !viewer.clouds?.length) return toast(t('msg.loadFirst'));
  open = true;
  setMeasureMode(null);
  notes.setMode(mode);
}

export function closeNotes() {
  open = false;
  notes.setMode(null);
}

export function toggleNotes() { if (open && notes.mode) closeNotes(); else openNotes(); }

/** Click in the view: true when the annotation tool took it. */
export function notesClick(e) {
  if (!notes.mode) return false;
  const it = notes.handleClick(e.clientX, e.clientY);
  if (it) { focusId = it.id; render(); projects.touch?.(); } // the new note's text box gets the focus
  return true;
}

export function notesCancel() { return notes.cancel(); }

function render() {
  const panel = $('#notes-panel');
  panel.hidden = !open;
  for (const b of $$('[data-action="notes"]')) b.classList.toggle('on', !!notes.mode);
  for (const b of $$('#notes-modes [data-notes]')) b.classList.toggle('on', b.dataset.notes === notes.mode);
  $('#notes-hint').textContent = t(notes.mode === 'arrow' ? (notes.pending ? 'notes.hint.arrow2' : 'notes.hint.arrow') : notes.mode === 'note' ? 'notes.hint.note' : 'notes.hint.off')
    + (notes.items.length && notes.mode ? ` ${t('notes.hint.move')}` : '');
  $('#notes-colors').replaceChildren(...ANNOT_COLORS.map((c) => h('button', {
    class: `notes-color${c === notes.color ? ' on' : ''}`, style: `--c:${c}`, title: c, type: 'button',
    onclick: () => { notes.color = c; render(); },
  })));
  $('#notes-foot').hidden = !notes.items.length;
  const list = $('#notes-list');
  // the list is rebuilt only when items come or go: typing must not lose the focus
  const sig = notes.items.map((it) => `${it.id}:${it.color}`).join(',');
  if (list.dataset.sig !== sig) {
    list.dataset.sig = sig;
    list.replaceChildren(...notes.items.map((it, i) => {
      const ta = h('textarea', { rows: 1, placeholder: t('notes.placeholder'), 'data-id': String(it.id) });
      ta.value = it.text;
      let timer = 0;
      ta.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => { notes.update(it.id, { text: ta.value }); projects.touch?.(); }, 250);
      });
      return h('div', { class: 'notes-item', style: `--c:${it.color}` },
        h('div', { class: 'notes-item-head' },
          h('button', { class: 'm-swatch notes-swatch', type: 'button', title: t('notes.colour'), onclick: () => { notes.update(it.id, { color: ANNOT_COLORS[(ANNOT_COLORS.indexOf(it.color) + 1) % ANNOT_COLORS.length] }); projects.touch?.(); } }),
          h('a', { class: 'm-title', text: `${it.q ? t('notes.arrow') : t('notes.note')} ${i + 1}`, title: t('measure.zoomTo'), onclick: () => zoomTo(it.id) }),
          h('span', { class: 'spacer' }),
          h('button', { class: 'icon-btn', title: t('notes.delete'), text: '✕', onclick: () => { notes.remove(it.id); projects.touch?.(); } })),
        ta);
    }));
  }
  if (focusId) {
    const ta = list.querySelector(`textarea[data-id="${focusId}"]`);
    focusId = null;
    ta?.focus();
  }
}

function zoomTo(id) {
  const b = notes.box(id);
  if (!b) return;
  const c = b.getCenter(new THREE.Vector3());
  const r = b.getSize(new THREE.Vector3()).length();
  const dir = viewer.camera.getWorldDirection(new THREE.Vector3());
  viewer.flyTo(c.clone().addScaledVector(dir, -Math.max(5, r * 1.5)), c);
}

export function initNotes() {
  notes.addEventListener('change', render);
  notes.addEventListener('moved', () => projects.touch?.());
  notes.addEventListener('edit', ({ item }) => { focusId = item.id; render(); });
  for (const b of $$('#notes-modes [data-notes]')) b.addEventListener('click', () => notes.setMode(b.dataset.notes));
  $('#notes-show').addEventListener('change', (e) => notes.setVisible(e.target.checked));
  render();
}

export const notesActions = {
  notes: () => toggleNotes(),
  'notes-close': () => closeNotes(),
  'notes-clear': () => { if (confirm(t('notes.clearConfirm'))) { notes.clear(); projects.touch?.(); } },
};
