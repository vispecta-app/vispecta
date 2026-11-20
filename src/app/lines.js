// Drawn lines (#63, moved out of main.js): drawing a line in plan, its list and its points.
import * as THREE from 'three';
import { t, fmtNum } from '../i18n.js';
import { LineEditor } from '../lineedit.js';
import { heightAt, formatStation } from '../alignment.js';
import { $, h, toast, viewer } from './core.js';
import { measure, projects, setMeasureMode, updateAlignments } from '../main.js';
import { corridor, setCorridorHits } from './corridor.js';
import { hasScene } from './clouds.js';
import { inlineEdit, renderModels } from './browser.js';
import { renderPlanes, secViewer, setStationPlane } from './sections.js';

// ------------------------------------------------------------------ drawn lines
// Lines drawn by the user work like alignments (station 0 at the first point): longitudinal profiles,
// cross sections at a station and driving along them.
export const drawnPaths = [];
export function makePath(name, pts) {
  const poly = pts.map((p) => [p[0], p[1]]);
  const zs = pts.map((p) => p[2]);
  const cum = [0];
  for (let k = 1; k < poly.length; k++) cum.push(cum[k - 1] + Math.hypot(poly[k][0] - poly[k - 1][0], poly[k][1] - poly[k - 1][1]));
  return { id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name, poly, cum, length: cum[cum.length - 1], station0: 0, vertical: [], referents: [], zs, drawn: true, model: null };
}

export const lineTool = { active: false, pts: [], onDone: null };
function showHint(text) { const el = $('#tool-hint'); el.textContent = text || ''; el.hidden = !text; }

export function startLineTool(onDone = null) {
  if (!hasScene()) return toast(t('msg.loadFirst'));
  if (measure.mode) setMeasureMode(null);
  lineTool.active = true;
  lineTool.pts = [];
  lineTool.onDone = onDone;
  document.body.classList.add('line-drawing');
  showHint(t('line.hint'));
}

export function lineToolClick(hit, e) {
  let p = hit?.point || null;
  if (!p) {
    // nothing under the cursor: the point lies at the height of the last point (or the bottom of the scene)
    const y = lineTool.pts.length ? viewer.fromIfc(...lineTool.pts[lineTool.pts.length - 1]).y : viewer.sceneBox().min.y;
    viewer.pick(e.clientX, e.clientY);
    p = viewer.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), new THREE.Vector3());
    if (!p) return;
  }
  const q = viewer.toIfc(p);
  const last = lineTool.pts[lineTool.pts.length - 1];
  if (last && Math.hypot(last[0] - q.x, last[1] - q.y) < 1e-3) return; // second click of a double click
  lineTool.pts.push([q.x, q.y, q.z]);
  showHint(`${t('line.hint')} (${lineTool.pts.length})`);
  updateAlignments();
}

export function finishLineTool(ok) {
  if (!lineTool.active) return;
  const pts = lineTool.pts;
  const done = lineTool.onDone;
  lineTool.active = false;
  lineTool.pts = [];
  lineTool.onDone = null;
  document.body.classList.remove('line-drawing');
  showHint('');
  let path = null;
  if (ok && pts.length >= 2) {
    path = makePath(t('line.name', { n: drawnPaths.length + 1 }), pts);
    drawnPaths.push(path);
    projects.touch?.();
    renderModels();
  } else if (ok) toast(t('line.tooFew'));
  updateAlignments();
  done?.(path);
}

export function removeDrawnPath(path) {
  const i = drawnPaths.indexOf(path);
  if (i < 0) return;
  if (lineEditor.path === path) lineEditor.end(false);
  drawnPaths.splice(i, 1);
  for (const p of viewer.planes.filter((x) => x.station?.al === path)) viewer.removePlane(p);
  if (corridor.def?.al === path) { corridor.clear(); setCorridorHits(null); }
  renderPlanes();
  updateAlignments();
  renderModels();
  secViewer?.planesChanged?.();
  projects.touch?.();
}

/** Asks before a drawn line is removed, naming what uses it (sections, the corridor). */
export function confirmRemoveLine(path) {
  const n = viewer.planes.filter((x) => x.station?.al === path).length;
  const uses = [n ? t('line.usesSections', { n }) : '', corridor.def?.al === path ? t('line.usesCorridor') : ''].filter(Boolean).join(', ');
  return confirm(t('line.removeConfirm', { name: path.name }) + (uses ? `\n${t('line.alsoRemoved', { what: uses })}` : ''));
}

/**
 * New points for a drawn line (#74). The path object is kept, so what uses it follows: station
 * sections stay at their distance along the line (or its new end), the corridor is rebuilt.
 */
function setPathPoints(path, pts) {
  const p2 = makePath(path.name, pts);
  Object.assign(path, { poly: p2.poly, cum: p2.cum, length: p2.length, zs: p2.zs });
  for (const pl of viewer.planes.filter((x) => x.station?.al === path)) setStationPlane(pl, path, Math.min(pl.station.s, path.length));
  if (corridor.def?.al === path) { corridor.set({ ...corridor.def, to: Math.min(corridor.def.to, path.length) }); setCorridorHits(null); }
  updateAlignments();
  secViewer?.planesChanged?.();
}

export const lineEditor = new LineEditor({
  viewer, t, container: $('#viewport'),
  onChange: (path, pts) => setPathPoints(path, pts),
  onEnd: () => { renderPlanes(); renderModels(); projects.touch?.(); },
});

/** The points of a drawn line as [x, y, z] (IFC). */
export const pathPoints = (p) => p.poly.map((q, k) => [q[0], q[1], p.zs ? p.zs[k] : (heightAt(p, p.cum[k]) ?? 0)]);

/** Zooms to a drawn line (its points, with a little room). */
function zoomToPath(p) {
  const b = new THREE.Box3();
  for (const q of pathPoints(p)) b.expandByPoint(viewer.fromIfc(q[0], q[1], q[2]));
  b.expandByScalar(Math.max(5, b.getSize(new THREE.Vector3()).length() * 0.1));
  viewer.fitBox(b);
}

/** An alignment of a model in the model browser (#89): show/hide, alias, stationing, length, zoom. */
export function alignmentRow(a) {
  const vis = h('input', { type: 'checkbox', checked: !a.hidden, title: t('aln.show') });
  vis.addEventListener('change', () => { a.hidden = !vis.checked; updateAlignments(); renderModels(); renderPlanes(); projects.touch?.(); });
  const name = h('span', { class: 'mg-name', text: a.name, title: a.alias ? `${t('aln.aliasTitle')} · ${a.ifcName}` : t('aln.aliasTitle') });
  const rename = () => inlineEdit(name, a.alias, a.ifcName || a.name, (v) => {
    a.alias = v || null;
    a.name = a.alias || a.ifcName || a.name;
    updateAlignments(); renderModels(); renderPlanes(); secViewer?.update?.(); projects.touch?.();
  });
  name.addEventListener('dblclick', rename);
  return h('div', { class: `line-row aln-row${a.hidden ? ' off' : ''}` },
    vis, name,
    h('span', { class: 'line-len', title: t('aln.range'), text: `${formatStation(a.station0)} – ${formatStation(a.station0 + a.length)}` }),
    h('button', { class: 'icon-btn', title: t('line.zoom'), text: '⤢', onclick: () => zoomToPath(a) }),
    h('button', { class: 'icon-btn', title: t('aln.aliasTitle'), text: '✎', onclick: rename }));
}

/** A drawn line in the model browser: show/hide, name (rename), length, zoom, edit points, remove. */
export function drawnLineRow(p) {
  const vis = h('input', { type: 'checkbox', checked: !p.hidden, title: t('line.show') });
  vis.addEventListener('change', () => { p.hidden = !vis.checked; updateAlignments(); renderModels(); projects.touch?.(); });
  const name = h('span', { class: 'mg-name', text: p.name, title: t('line.renameTitle') });
  const rename = () => inlineEdit(name, p.name, p.name, (v) => {
    if (v) p.name = v;
    updateAlignments(); renderModels(); renderPlanes(); projects.touch?.();
  });
  name.addEventListener('dblclick', rename);
  const editing = lineEditor.path === p;
  return h('div', { class: `line-row${p.hidden ? ' off' : ''}${editing ? ' editing' : ''}` },
    vis, name,
    h('span', { class: 'line-len', text: `${fmtNum(Math.round(p.length * 10) / 10)} m` }),
    h('button', { class: 'icon-btn', title: t('line.zoom'), text: '⤢', onclick: () => zoomToPath(p) }),
    h('button', { class: 'icon-btn', title: t('mg.rename'), text: '✎', onclick: rename }),
    h('button', { class: `icon-btn${editing ? ' on' : ''}`, title: t('line.editPoints'), text: '◇', onclick: () => {
      if (editing) { lineEditor.end(true); return; }
      if (p.hidden) { p.hidden = false; updateAlignments(); }
      lineEditor.start(p, pathPoints(p));
      renderModels();
    } }),
    h('button', { class: 'icon-btn', title: t('line.remove'), text: '✕', onclick: () => { if (confirmRemoveLine(p)) removeDrawnPath(p); } }));
}

viewer.container.addEventListener('dblclick', () => { if (lineTool.active) finishLineTool(true); });

