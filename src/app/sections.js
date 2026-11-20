// Section planes (#63, moved out of main.js): the planes list, cross sections at a station, the
// section marks and the section window.
import * as THREE from 'three';
import { t, fmtNum } from '../i18n.js';
import { SectionViewer } from '../secview.js';
import { SectionMarks, pointAt, heightAt, project, formatStation, parseStation } from '../alignment.js';
import { computeSection, planeAxes, layout, toSvg, AXIS_COLOR } from '../drawing.js';
import { $, h, toast, viewer } from './core.js';
import { annotOptions, drawingOpts, editAnnotPoint, openDrawingDialog, planeLabel, renderAnnotClasses, resetAnnotPoints } from './drawing.js';
import { planeStep } from './profile.js';
import { drawnPaths } from './lines.js';
import { renderStatus } from '../main.js';
import { hasScene, refineClouds } from './clouds.js';
import { planContourMarks } from './terrain.js';

// ====================================================================== sections
export const AXIS_LABEL = { x: 'planes.x', y: 'planes.plan', z: 'planes.y', custom: 'planes.face' };

export function renderPlanes() {
  const panel = $('#planes-panel');
  const list = $('#plane-list');
  list.replaceChildren();
  panel.hidden = viewer.planes.length === 0;
  const badge = $('#section-badge');
  badge.hidden = !viewer.planes.length;
  badge.textContent = String(viewer.planes.length);
  renderStatus();
  if (!viewer.planes.length) return;

  for (const p of viewer.planes) list.append(p.station ? stationRow(p) : axisRow(p));
}

/**
 * A row of the sections panel. Line 1: on/off, name, actions. Line 2: ‹ slider › position.
 * parts: {name (text or element), slider, posInput, unit, step(dir), cls}
 */
function planeRow(p, { name, slider, posInput, unit, step, cls = '' }) {
  const enabled = h('input', { type: 'checkbox', checked: p.enabled, title: t('planes.active') });
  enabled.addEventListener('change', () => viewer.togglePlane(p, enabled.checked));
  const stepBtn = (dir) => h('button', {
    class: 'btn xs step', text: dir > 0 ? '›' : '‹', title: t(dir > 0 ? 'planes.stepFwd' : 'planes.stepBack', { step: fmtNum(planeStep()) }),
    onclick: () => step(dir),
  });
  const act = (text, title, fn) => h('button', { class: 'btn xs', text, title, onclick: fn });
  return h('div', { class: `plane-row ${cls}` },
    h('div', { class: 'pl-head' },
      enabled,
      typeof name === 'string' ? h('span', { class: 'pl-name', text: name, title: name }) : name,
      act('⇄', t('planes.flip'), () => { viewer.flipPlane(p); renderPlanes(); }),
      // station sections: cut the 3D view or show the whole model (the section stays, #39)
      p.station ? h('button', { class: `btn xs${p.cut3d !== false ? ' on' : ''}`, text: '✂', title: t('planes.cut3d'), 'aria-pressed': String(p.cut3d !== false), onclick: () => togglePlaneCut(p) }) : null,
      p.boxPart ? null : act('▣', t('sv.open'), () => openSecView(p)),
      p.boxPart ? null : act('2D', t('drw.title'), () => openDrawingDialog(p)),
      act('✕', t('planes.remove'), () => { viewer.removePlane(p); renderPlanes(); })),
    h('div', { class: 'pl-pos' }, stepBtn(-1), slider, stepBtn(1), h('span', { class: 'val' }, posInput, h('span', { text: unit }))));
}

/** Turns the 3D cut of a station section on or off (#39); the section window keeps its cut. */
function togglePlaneCut(p) {
  viewer.setPlaneCut(p, p.cut3d === false);
  renderPlanes();
  secViewer?.renderCut?.();
  toast(t(p.cut3d === false ? 'planes.cut3dOff' : 'planes.cut3dOn'));
}

/** Row of a plan / X / Y / face section or a side of the section box. */
function axisRow(p) {
  const range = viewer.planeRange(p);
  const slider = h('input', { type: 'range', min: String(range.min), max: String(range.max), step: String((range.max - range.min) / 1000), value: String(viewer.getPlanePos(p)), 'aria-label': t('planes.posTitle') });
  // exact position: type it, or step with the arrow buttons / arrow keys in the field
  const posInput = h('input', { type: 'number', step: 'any', title: t('planes.posTitle') });
  const upd = () => { posInput.value = viewer.getPlanePos(p).toFixed(3); slider.value = String(viewer.getPlanePos(p)); };
  const moveTo = (v) => { viewer.setPlanePos(p, v); upd(); };
  slider.addEventListener('input', () => { viewer.setPlanePos(p, +slider.value); posInput.value = viewer.getPlanePos(p).toFixed(3); });
  posInput.addEventListener('change', () => { if (Number.isFinite(+posInput.value) && posInput.value !== '') moveTo(+posInput.value); else upd(); });
  posInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); moveTo(viewer.getPlanePos(p) + (e.key === 'ArrowUp' ? 1 : -1) * planeStep()); }
  });
  upd();
  const name = p.boxPart ? `${t('planes.boxPart')} ${p.axis === 'y' ? 'Z' : p.axis === 'z' ? 'Y' : 'X'} ${p.boxPart}` : t(AXIS_LABEL[p.axis]);
  return planeRow(p, { name, slider, posInput, unit: 'm', step: (dir) => moveTo(viewer.getPlanePos(p) + dir * planeStep()) });
}
// ------------------------------------------------- cross sections at a station
/** An alignment's name in a list: drawn lines with ✎, hidden ones marked (#89). */
export const alnLabel = (a) => `${a.drawn ? '✎ ' : ''}${a.name}${a.hidden ? ` (${t('aln.hiddenTag')})` : ''}`;
/** All alignments of the visible models. */
export const allAlignments = () => [...viewer.models.filter((m) => m.visible).flatMap((m) => m.alignments || []), ...drawnPaths];

/** Point (world) on the alignment and direction of increasing station at distance s. */
function stationFrame(al, s) {
  const q = pointAt(al, s);
  let z = heightAt(al, s);
  if (z === null) { const box = viewer.sceneBox(); z = box.isEmpty() ? 0 : viewer.toIfc(box.getCenter(new THREE.Vector3())).z; }
  const P = viewer.fromIfc(q.x, q.y, z);
  const T = viewer.fromIfc(q.x + q.dx, q.y + q.dy, z).sub(P).normalize();
  return { P, T };
}

/**
 * Makes `entry` the cross section of `al` at distance s (station = station0 + s). sign: +1 keeps
 * what lies ahead (higher stations), -1 what lies behind; by default the plane keeps its side.
 */
export function setStationPlane(entry, al, s, sign = null) {
  s = Math.min(Math.max(s, 0), al.length);
  const { P, T } = stationFrame(al, s);
  if (sign === null) sign = entry.station ? (entry.plane.normal.dot(entry.station.T) >= 0 ? 1 : -1) : 1;
  entry.plane.setFromNormalAndCoplanarPoint(T.clone().multiplyScalar(sign), P);
  entry.axisVec = T.clone();
  entry.anchor = P.clone();
  entry.station = { al, s, T };
  viewer.updatePlane(entry);
}

export function addStationPlane() {
  if (!hasScene()) return toast(t('msg.loadFirst'));
  const list = allAlignments();
  if (!list.length) return toast(t('aln.none'));
  // start at the alignment point nearest to the centre of the view
  const c = viewer.toIfc(viewer.controls.target);
  let best = null;
  for (const al of list) { const r = project(al, c); if (!best || r.dist < best.r.dist) best = { al, r }; }
  const { P, T } = stationFrame(best.al, best.r.s);
  const entry = viewer.addPlane('custom', { normal: T.clone().negate(), point: P });
  setStationPlane(entry, best.al, best.r.s, 1);
  renderPlanes();
  autoSecView(entry);
  setTimeout(() => $('.plane-row.station:last-child .val input')?.select(), 0);
}

// a free plane restored from a view / viewpoint that is a cross section of an alignment
viewer.stationResolver = (entry) => {
  const n = entry.plane.normal;
  if (Math.abs(n.y) > 1e-3) return;
  for (const al of allAlignments()) {
    const { poly, cum } = al;
    const dist = (k) => { const q = viewer.fromIfc(poly[k][0], poly[k][1], 0); q.y = 0; const pl = entry.plane; return n.x * q.x + n.z * q.z + pl.constant; };
    let d0 = dist(0);
    for (let k = 1; k < poly.length; k++) {
      const d1 = dist(k);
      if ((d0 <= 0) !== (d1 <= 0)) {
        const s = cum[k - 1] + (cum[k] - cum[k - 1]) * (d0 / (d0 - d1));
        const { T } = stationFrame(al, s);
        if (Math.abs(T.dot(n)) > 0.9999) { setStationPlane(entry, al, s, T.dot(n) > 0 ? 1 : -1); return; }
      }
      d0 = d1;
    }
  }
};

/** Letter of a cross section (A, B, …) in the order the station planes were added. */
export function sectionLetter(p) {
  const i = viewer.planes.filter((x) => x.station).indexOf(p);
  return i < 0 ? '' : i < 26 ? String.fromCharCode(65 + i) : `A${i - 25}`;
}
export const stationText = (p) => formatStation(p.station.al.station0 + p.station.s);

/** Section mark of a station plane in IFC coordinates (line across the alignment, viewing direction). */
function stationMark(p) {
  const { al, s } = p.station;
  const q = pointAt(al, s);
  const sign = p.plane.normal.dot(p.station.T) >= 0 ? 1 : -1;
  const z = heightAt(al, s) ?? viewer.toIfc(p.anchor).z;
  const half = Math.min(Math.max(viewer.sceneRadius * 0.04, 5), 25);
  // with a section width (#66) the mark spans exactly that width
  const w = viewer.sectionWidth;
  // (left | right as seen in the section: looking backwards, the alignment's left is on the right)
  let left = w?.left > 0 ? w.left : half, right = w?.right > 0 ? w.right : half;
  if (sign < 0) [left, right] = [right, left];
  const L = [-q.dy, q.dx]; // left of the alignment
  return {
    A: [q.x + L[0] * left, q.y + L[1] * left], B: [q.x - L[0] * right, q.y - L[1] * right],
    v: [q.dx * sign, q.dy * sign], mid: [q.x, q.y], z, half, letter: sectionLetter(p), label: `${t('st.label')} ${stationText(p)}`,
  };
}

const sectionMarks = new SectionMarks(viewer, $('#viewport'));
viewer.addEventListener('planeschanged', () => {
  sectionMarks.set(viewer.planes.filter((p) => p.station && p.enabled).map(stationMark));
  secViewer?.planesChanged();
});

// window with the live cut of one plane, to step through the sections next to the 3D view
export let secViewer = null;
function openSecView(p, { popOut = false } = {}) {
  secViewer ||= new SectionViewer({
    t, h, toast,
    container: $('#viewport'),
    planes: () => viewer.planes,
    compute: (pl, withPoints) => {
      if (pl.station) pl.stationLabel = `${t('st.axis')} ${stationText(pl)}`;
      const plan = planeAxes(pl).horizontal;
      // the section window uses the classes chosen in the drawing dialog
      if (withPoints && !plan && !$('#ann-classes').children.length) renderAnnotClasses();
      return computeSection(viewer, pl, { marks: plan ? planMarks : [], annot: withPoints && !plan ? annotOptions({ force: true }) : null });
    },
    title: (pl) => planeLabel(pl, viewer.planes.indexOf(pl)),
    station: (pl) => (pl.station ? stationText(pl) : viewer.getPlanePos(pl).toFixed(3)),
    step: (pl, dir) => {
      if (pl.station) setStationPlane(pl, pl.station.al, pl.station.s + dir * planeStep());
      else viewer.setPlanePos(pl, viewer.getPlanePos(pl) + dir * planeStep());
      renderPlanes();
    },
    setStation: (pl, text) => {
      const v = pl.station ? parseStation(text) : (String(text).trim() !== '' && Number.isFinite(+String(text).replace(',', '.')) ? +String(text).replace(',', '.') : null);
      if (v === null) { toast(t('st.bad', { v: text })); return false; }
      if (pl.station) setStationPlane(pl, pl.station.al, v - pl.station.al.station0);
      else viewer.setPlanePos(pl, v);
      renderPlanes();
      return true;
    },
    getStep: () => planeStep(),
    setStep: (v) => { $('#plane-step').value = String(v); $('#plane-step').dispatchEvent(new Event('change')); },
    colors: () => ({ colors: 'shown', fill: true }),
    keyPlan: (pl) => keyPlan(pl),
    hatch: () => $('#plane-hatch').checked,
    cut3d: (pl) => (pl.station ? pl.cut3d !== false : null),
    editPoint: (pl, op, x, y) => editAnnotPoint(pl, op, x, y),
    // the sheet as the drawing export would write it (#51): same section, options and layout
    sheetSvg: (pl) => {
      const plan = planeAxes(pl).horizontal;
      if (pl.station) pl.stationLabel = `${t('st.axis')} ${stationText(pl)}`;
      const section = computeSection(viewer, pl, { marks: plan ? planMarks : [], annot: plan ? null : annotOptions() });
      if (!section.layers.size) return null;
      const opts = drawingOpts();
      const lay = layout(section, opts);
      const name = viewer.models[0]?.name.replace(/\.ifc$/i, '') || 'Model';
      const info = { title: `${name} – ${planeLabel(pl, viewer.planes.indexOf(pl))}`, subtitle: viewer.models.filter((m) => m.visible).map((m) => m.name).join(', '), date: new Date().toISOString().slice(0, 10) };
      return toSvg(section, lay, info, opts);
    },
    resetPoints: (pl) => resetAnnotPoints(pl),
    toggleCut: (pl) => togglePlaneCut(pl),
    onClose: () => viewer.setPlaneHighlight(null),
    onPlane: (pl) => { viewer.setPlaneHighlight(pl); if (viewer.clouds.some((c) => c.stream)) setTimeout(refineClouds, 0); },
  });
  secViewer.open(p);
  if (popOut && !secViewer.win) secViewer.popOut();
  viewer.setPlaneHighlight(p);
}

/**
 * Key plan of a section plane, in IFC plan coordinates (metres): outlines of the visible models,
 * the alignments and the cut line with the view direction.
 */
function keyPlan(pl) {
  const boxes = [];
  for (const m of viewer.models.filter((x) => x.visible)) {
    const b = m.getBox();
    if (b.isEmpty()) continue;
    const xs = [], ys = [];
    for (const x of [b.min.x, b.max.x]) for (const z of [b.min.z, b.max.z]) { const q = viewer.toIfc(new THREE.Vector3(x, b.min.y, z)); xs.push(q.x); ys.push(q.y); }
    boxes.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
  }
  const lines = allAlignments().map((al) => al.poly.map((q) => [q[0], q[1]]));
  // size of the key plan: the cut line is drawn in proportion to it
  const xs = [], ys = [];
  for (const b of boxes) xs.push(b[0], b[2]), ys.push(b[1], b[3]);
  for (const l of lines) for (const q of l) xs.push(q[0]), ys.push(q[1]);
  const D = xs.length ? Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) : 20;
  let cut = null, note = null;
  if (pl.station) {
    const mk = stationMark(pl);
    const half = Math.max(mk.half, 0.12 * D);
    const dx = (mk.A[0] - mk.mid[0]) / mk.half, dy = (mk.A[1] - mk.mid[1]) / mk.half;
    cut = { A: [mk.mid[0] + dx * half, mk.mid[1] + dy * half], B: [mk.mid[0] - dx * half, mk.mid[1] - dy * half], v: mk.v, letter: mk.letter };
  } else if (Math.abs(pl.plane.normal.y) > 0.9) {
    note = `${t('mi.plan')} ${viewer.getPlanePos(pl).toFixed(2)} m`;
  } else {
    const box = viewer.sceneBox();
    const c = box.getCenter(new THREE.Vector3());
    const P = pl.plane.projectPoint(c, new THREE.Vector3());
    const P0 = viewer.toIfc(P), P1 = viewer.toIfc(P.clone().add(pl.plane.normal));
    let nx = P1.x - P0.x, ny = P1.y - P0.y;
    const len = Math.hypot(nx, ny) || 1;
    nx /= len; ny /= len;
    const half = 0.6 * D;
    cut = { A: [P0.x + ny * half, P0.y - nx * half], B: [P0.x - ny * half, P0.y + nx * half], v: [nx, ny], letter: '' };
  }
  return { boxes, lines, cut, note };
}

/**
 * A new cross section at a station opens the section window in the app (docked, not as a browser
 * window of its own – ⧉ in the window pops it out). Plan, X/Y and face sections just cut the model.
 */
export function autoSecView(p) { if (p?.station) openSecView(p); }
// the former setting "Sections in a window of their own" is gone
try { localStorage.removeItem('onlineifc.svAuto'); } catch { /* ignore */ }

/** Drawing marks of the station planes for a plan drawing (classic section marks A–A). */
function planSectionMarks() {
  const out = [];
  for (const p of viewer.planes.filter((x) => x.station && x.enabled)) {
    const mk = stationMark(p);
    const layer = 'SECTION_MARKS';
    out.push({ line: [mk.A, mk.B], color: AXIS_COLOR, w: 0.35, dash: 'dashdot', layer });
    for (const E of [mk.A, mk.B]) {
      out.push({ arrow: E, dir: mk.v, size: 6, color: AXIS_COLOR, layer });
      out.push({ text: mk.letter, at: E, dx: mk.v[0] * 9, dy: -mk.v[1] * 9 + 1.6, size: 4.5, bold: true, anchor: 'middle', color: AXIS_COLOR, layer });
    }
    out.push({ text: stationText(p), at: mk.B, dx: -mk.v[0] * 4 + (mk.B[0] - mk.A[0]) / mk.half * 2, dy: mk.v[1] * 4 - (mk.B[1] - mk.A[1]) / mk.half * 2 + 1, size: 2.6, anchor: 'middle', color: AXIS_COLOR, layer });
  }
  return out;
}

/** Clips the segment a–b to a box (Liang–Barsky); returns [t0, t1] or null. */
export function clipSegment(a, b, box) {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - box.minX], [dx, box.maxX - a[0]], [-dy, a[1] - box.minY], [dy, box.maxY - a[1]]]) {
    if (Math.abs(p) < 1e-12) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [t0, t1];
}

/** The alignments inside a plan drawing (box in IFC X/Y): dash-dot axis with station ticks. */
function planAlignmentMarks(box) {
  const out = [];
  const w = box.maxX - box.minX, hgt = box.maxY - box.minY;
  const pad = 0.1 * Math.max(w, hgt, 1);
  const b = { minX: box.minX - pad, maxX: box.maxX + pad, minY: box.minY - pad, maxY: box.maxY + pad };
  for (const al of allAlignments()) {
    // runs of the polyline inside the box, as [point, distance along]
    const runs = [];
    let run = null;
    for (let k = 1; k < al.poly.length; k++) {
      const a = al.poly[k - 1], c = al.poly[k];
      const tt = clipSegment(a, c, b);
      if (!tt) { run = null; continue; }
      const at = (t) => [[a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t], al.cum[k - 1] + (al.cum[k] - al.cum[k - 1]) * t];
      if (!run || tt[0] > 1e-9) { run = [at(tt[0])]; runs.push(run); }
      run.push(at(tt[1]));
      if (tt[1] < 1 - 1e-9) run = null;
    }
    for (const r of runs) {
      if (r.length < 2) continue;
      out.push({ line: r.map((x) => x[0]), color: AXIS_COLOR, w: 0.25, dash: 'dashdot', layer: 'ALIGNMENT_AXIS' });
      const s0 = r[0][1], s1 = r[r.length - 1][1];
      const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000, 2000].find((x) => (s1 - s0) / x <= 12) || 5000;
      const tick = Math.max(w, hgt, 1) / 100;
      for (let st = Math.ceil((al.station0 + s0) / step) * step; st <= al.station0 + s1 + 1e-6; st += step) {
        const q = pointAt(al, st - al.station0);
        const L = [-q.dy, q.dx];
        out.push({ line: [[q.x + L[0] * tick, q.y + L[1] * tick], [q.x - L[0] * tick, q.y - L[1] * tick]], color: AXIS_COLOR, w: 0.25, layer: 'ALIGNMENT_AXIS' });
        out.push({ text: formatStation(st), at: [q.x + L[0] * tick, q.y + L[1] * tick], dx: L[0] * 2, dy: -L[1] * 2 + 0.8, size: 2.4, anchor: 'middle', color: AXIS_COLOR, layer: 'ALIGNMENT_AXIS' });
      }
    }
  }
  return out;
}

/** Plan marks: the section marks, then the alignments inside the drawing including the marks. */
export function planMarks(bounds) {
  const sec = planSectionMarks();
  const box = { ...bounds };
  for (const mk of sec) for (const p of mk.line || []) {
    box.minX = Math.min(box.minX, p[0]); box.maxX = Math.max(box.maxX, p[0]);
    box.minY = Math.min(box.minY, p[1]); box.maxY = Math.max(box.maxY, p[1]);
  }
  return [...planContourMarks({ ...bounds }), ...planAlignmentMarks(box), ...sec];
}

/** Row of a cross section at a station: alignment, ‹ slider › station. */
function stationRow(p) {
  const al = p.station.al;
  const slider = h('input', { type: 'range', min: '0', max: String(al.length), step: String(Math.max(0.01, al.length / 4000)), value: String(p.station.s), 'aria-label': t('st.title') });
  const posInput = h('input', { type: 'text', inputmode: 'decimal', title: t('st.title'), class: 'station-input' });
  const upd = () => { posInput.value = formatStation(al.station0 + p.station.s); slider.value = String(p.station.s); };
  const moveTo = (s2) => { setStationPlane(p, p.station.al, s2); upd(); };
  slider.addEventListener('input', () => moveTo(+slider.value));
  posInput.addEventListener('change', () => {
    const v = parseStation(posInput.value);
    if (v === null) { toast(t('st.bad', { v: posInput.value })); return upd(); }
    const s2 = v - al.station0;
    if (s2 < -0.001 || s2 > al.length + 0.001) toast(t('st.outside', { from: formatStation(al.station0), to: formatStation(al.station0 + al.length) }));
    moveTo(s2);
  });
  posInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); moveTo(p.station.s + (e.key === 'ArrowUp' ? 1 : -1) * planeStep()); }
  });
  // several alignments: choose which one the section follows
  const list = allAlignments();
  const letter = sectionLetter(p);
  const label = `${t('st.section')} ${letter}–${letter}`;
  const name = list.length > 1
    ? h('span', { class: 'pl-name pl-pick' }, h('b', { text: label }),
      h('select', { title: t('st.alignment'), onchange: (e) => { const a = list[+e.target.value]; const r = project(a, viewer.toIfc(p.anchor)); setStationPlane(p, a, r.s); renderPlanes(); } },
        list.map((a, i2) => h('option', { value: String(i2), text: alnLabel(a), selected: a === al }))))
    : h('span', { class: 'pl-name', title: al.name }, h('b', { text: label }), ` · ${al.name}`);
  upd();
  return planeRow(p, { name, slider, posInput, unit: 'km', step: (dir) => moveTo(p.station.s + dir * planeStep()), cls: 'station' });
}

