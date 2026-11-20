// Coordinate systems in the UI (#107, #63 moved out of main.js): the project's system, the
// system of each model and cloud, and placing everything again when they change.
import { t, fmtNum } from '../i18n.js';
import { crsOptions, crsName, crsNote, crsKnown, normalizeCrs, defineCrs } from '../crs.js';
import { h, toast, viewer, withLoading } from './core.js';
import { secViewer } from './sections.js';
import { renderModels } from './browser.js';
import { projects, updateAlignments } from '../main.js';

// ------------------------------------------------- coordinate systems (#107)
// The project's map coordinate system: chosen by hand, or else the first model's (or cloud's).
// Models, clouds and terrain in another system are converted into it (viewer.applyCrs).
export let projectCrsChosen = false;
export function setProjectCrsChosen(v) { projectCrsChosen = !!v; }
const crsShown = new Set(); // conversions already told about (toast once)

/** After models or clouds came or went, or a system was chosen: place everything again. */
export function crsChanged({ quiet = false } = {}) {
  if (!projectCrsChosen && !viewer.projectCrs) {
    viewer.projectCrs = viewer.referenceModel?.crs || viewer.models.find((m) => m.crs)?.crs || viewer.clouds.find((c) => c.crs)?.crs || null;
  }
  if (!viewer.projectCrs && !viewer.models.some((m) => m.crsT || m.warped)) { for (const c of viewer.clouds) viewer.placeCloud(c); return; }
  const res = viewer.applyCrs();
  updateAlignments();
  if (!quiet) for (const r of res) {
    const key = `${r.model.name}|${r.from}|${r.to}`;
    if (crsShown.has(key)) continue;
    crsShown.add(key);
    toast(t('crs.convertedToast', { name: r.model.alias || r.model.name, from: crsName(r.from), to: crsName(r.to) }), true);
  }
  for (const c of viewer.clouds) {
    if (!c.crs || !viewer.projectCrs || c.crs === viewer.projectCrs) continue;
    const key = `${c.name}|${c.crs}|${viewer.projectCrs}`;
    if (quiet || crsShown.has(key)) continue;
    crsShown.add(key);
    toast(t('crs.convertedToast', { name: c.label, from: crsName(c.crs), to: crsName(viewer.projectCrs) }), true);
  }
  secViewer?.planesChanged?.();
  viewer.invalidate(500);
}

/** A select of coordinate systems: none, the built-in ones, the user's own, and "other EPSG code…". */
function crsSelect(value, { none, detected = null, onChange }) {
  const opts = crsOptions();
  const groups = [['dk', t('crs.grpDk')], ['de', t('crs.grpDe')], ['custom', t('crs.grpCustom')]];
  const label = (o) => `${o.code.startsWith('PROJ:') ? '' : `${o.code} · `}${o.name}${o.code === detected ? ` (${t('crs.fromFile')})` : ''}`;
  const sel = h('select', { class: 'crs-select' },
    h('option', { value: '', text: none, selected: !value }),
    value && !crsKnown(value) ? h('option', { value, text: `${value} – ${t('crs.undefined')}`, selected: true }) : null,
    groups.map(([g, name]) => {
      const list = opts.filter((o) => o.group === g);
      return list.length ? h('optgroup', { label: name }, list.map((o) => h('option', { value: o.code, text: label(o), selected: o.code === value }))) : null;
    }),
    h('option', { value: '__other', text: t('crs.other') }));
  sel.addEventListener('change', async () => {
    let v = sel.value;
    if (v === '__other' || (v && !crsKnown(v))) {
      const input = v === '__other' ? prompt(t('crs.otherPrompt'), '') : v;
      if (!input) { sel.value = value || ''; return; }
      try { v = await withLoading((progress) => { progress(t('crs.lookingUp'), 0.5); return defineCrs(input); }); } catch (e) { toast(t('crs.lookupFailed', { code: input, error: e.message || e })); sel.value = value || ''; return; }
    }
    onChange(v || null);
  });
  return sel;
}

function setProjectCrs(code) {
  viewer.projectCrs = code;
  projectCrsChosen = true;
  crsChanged();
  renderModels();
  projects.touch?.();
}

/** The line under a source's coordinate system: what is done with it. */
function crsNoteText(src) {
  if (!src.crs) return src.fileCrs && !normalizeCrs(src.fileCrs) ? t('crs.fileUnknown') : null;
  if (!crsKnown(src.crs)) return t('crs.needDef');
  if (!viewer.projectCrs) return null;
  if (src.crs === viewer.projectCrs) return t('crs.same');
  const note = crsNote(src.crs) || crsNote(viewer.projectCrs);
  const i = src.crsInfo;
  const how = i ? (i.warped ? t('crs.warped', { mm: fmtNum(+(i.residual * 1000).toFixed(1)) }) : t('crs.similar', { mm: fmtNum(+(i.residual * 1000).toFixed(2)) })) : t('crs.pointwise');
  return `${t('crs.converted', { to: crsName(viewer.projectCrs) })} ${how}${note ? ` ${t(`crs.note.${note}`)}` : ''} ${t('crs.heights')}`;
}

/** The coordinate system row on a model's or cloud's card. */
export function crsRow(src, onChange) {
  const sel = crsSelect(src.crs, { none: t('crs.unknown'), detected: normalizeCrs(src.crsDetected ?? src.fileCrs), onChange });
  const note = crsNoteText(src);
  return [h('div', { class: 'card-row' }, h('label', { text: t('crs.label'), title: t('crs.labelTitle') }), sel),
    note ? h('div', { class: 'card-meta crs-note', text: note }) : null];
}

/** The project's coordinate system, at the top of the model browser. */
export function projectCrsBar() {
  const sel = crsSelect(viewer.projectCrs, { none: t('crs.projectNone'), onChange: setProjectCrs });
  sel.id = 'project-crs';
  return h('div', { class: 'crs-bar' }, h('label', { for: 'project-crs', text: t('crs.project'), title: t('crs.projectTitle') }), sel);
}

