// DWG / DXF drawings as a 2D base (#135): opening, the card in the model browser (layers, unit,
// level, on top), and keeping them in place when models come and go.
import { t, fmtNum } from '../i18n.js';
import { CadDrawing, readCad } from '../cad.js';
import { h, toast, viewer, withLoading } from './core.js';
import { renderModels } from './browser.js';
import { afterModelsChanged } from '../main.js';

export const CAD_FILE = /\.(dwg|dxf)$/i;
export const drawings = [];
viewer.drawings = drawings;

export async function openCadFiles(files) {
  for (const file of files) {
    const kind = /\.dxf$/i.test(file.name) ? 'dxf' : 'dwg';
    try {
      const data = await withLoading(async (progress) => {
        progress(t('cad.loading', { name: file.name }), 0.02);
        const bytes = await file.arrayBuffer();
        return readCad(bytes, kind, (f) => progress(t('cad.loading', { name: file.name }), f));
      });
      if (!data.layers.length) { toast(t('cad.empty', { name: file.name })); continue; }
      const d = new CadDrawing(viewer, file.name, data);
      drawings.push(d);
      const b = d.getBox();
      if (!b.isEmpty() && !viewer.models.length) viewer.fitBox(b);
      toast(t('cad.loaded', { name: file.name, n: fmtNum(data.segments), layers: data.layers.length }), true);
      if (data.skipped) toast(t('cad.skipped', { n: fmtNum(data.skipped) }));
    } catch (e) {
      console.error(e);
      toast(t('cad.failed', { name: file.name, error: e.message || e }));
    }
  }
  afterModelsChanged();
}

export function removeDrawing(d) {
  d.dispose();
  drawings.splice(drawings.indexOf(d), 1);
  afterModelsChanged();
}

// a model opened or removed, a coordinate system chosen: the drawings are placed again
const replace = () => { for (const d of drawings) d.build(); };
viewer.addEventListener('crschanged', replace);
viewer.addEventListener('modelremoved', () => setTimeout(replace, 0));

let lastModels = 0;
/** Called after models change: a drawing opened before the models is placed again with them. */
export function drawingsAfterModels() {
  if (viewer.models.length !== lastModels) { lastModels = viewer.models.length; replace(); }
}

export function cadCard(d) {
  const open = d.cardOpen ?? true;
  const vis = h('input', { type: 'checkbox', title: t('models.visible'), checked: d.visible });
  vis.addEventListener('change', () => { d.setVisible(vis.checked); renderModels(); });
  const unit = h('select', { title: t('cad.unitTitle') }, [['1', 'm'], ['0.001', 'mm'], ['0.01', 'cm'], ['0.3048', 'ft']].map(([v, l]) => h('option', { value: v, text: l, selected: Math.abs(+v - d.unit) < 1e-9 })));
  unit.addEventListener('change', () => { d.setUnit(+unit.value); renderModels(); });
  const top = h('input', { type: 'checkbox', checked: d.onTop });
  top.addEventListener('change', () => { d.setOnTop(top.checked); });
  const level = h('input', { type: 'number', step: '0.1', class: 'num-sm', value: d.levelShown !== null && d.levelShown !== undefined ? String(Math.round(d.levelShown * 100) / 100) : '', title: t('cad.levelTitle') });
  level.addEventListener('change', () => { d.setLevel(level.value === '' ? null : +level.value); });
  const layers = h('div', { class: 'pc-classes cad-layers' }, d.layers.map((l, i) => {
    const cb = h('input', { type: 'checkbox', checked: l.on });
    cb.addEventListener('change', () => d.setLayer(i, cb.checked));
    const sw = h('span', { class: 'pc-swatch' }); sw.style.background = `#${l.color.toString(16).padStart(6, '0')}`;
    return h('label', { class: 'pc-class', title: l.name }, cb, sw, h('span', { text: l.name }), h('span', { class: 'muted', text: fmtNum(l.n + l.texts) }));
  }));
  const allLayers = (on) => { d.layers.forEach((_, i) => d.setLayer(i, on)); renderModels(); };
  return h('div', { class: `card model-card cad-card${open ? ' open' : ''}${d.visible ? '' : ' off'}`, 'data-uid': String(d.uid) },
    h('div', { class: 'card-head' },
      h('button', { class: `mg-caret${open ? ' open' : ''}`, 'aria-expanded': String(open), 'aria-label': t('models.details'), onclick: () => { d.cardOpen = !open; renderModels(); } }),
      vis, h('span', { class: 'pc-icon', 'aria-hidden': 'true', text: '⌗' }),
      h('span', { class: 'card-title' }, h('span', { class: 'card-name', title: d.name, text: d.name }),
        h('span', { class: 'card-file muted', text: t('cad.meta', { n: fmtNum(d.data.segments), layers: d.layers.length }) }))),
    open ? h('div', { class: 'card-body' },
      h('div', { class: 'card-meta', text: t(`cad.place.${d.placement}`) }),
      d.data.texts.length > d.textsShown ? h('div', { class: 'card-meta', text: t('cad.textsCut', { n: fmtNum(d.textsShown), total: fmtNum(d.data.texts.length) }) }) : null,
      h('div', { class: 'card-row' }, h('label', { text: t('cad.unit') }), unit),
      d.flat ? h('div', { class: 'card-row' }, h('label', { text: t('cad.level') }), level, h('span', { class: 'muted', text: 'm' })) : null,
      h('label', { class: 'card-row check', title: t('cad.onTopTitle') }, top, h('span', { text: t('cad.onTop') })),
      h('div', { class: 'card-row' }, h('label', { text: t('cad.layers') }),
        h('button', { class: 'link', text: t('cad.allOn'), onclick: () => allLayers(true) }), h('button', { class: 'link', text: t('cad.allOff'), onclick: () => allLayers(false) })),
      layers,
      h('div', { class: 'card-btns' },
        h('button', { class: 'btn sm', onclick: () => { const b = d.getBox(); if (!b.isEmpty()) viewer.fitBox(b); }, text: t('models.zoom') }),
        h('button', { class: 'btn sm danger', onclick: () => { if (confirm(t('cad.removeConfirm', { name: d.name }))) removeDrawing(d); }, text: t('models.remove') }))) : null);
}

