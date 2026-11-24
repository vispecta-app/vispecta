// Along a path (#63, moved out of main.js): the longitudinal profile, the cross section series
// and driving along an alignment.
import * as THREE from 'three';
import { t, fmtNum } from '../i18n.js';
import { pointAt, heightAt, project, formatStation, parseStation } from '../alignment.js';
import { computeSection, computeProfile, layout, toSvg, toPdf, toPdfPages, toDxf, renderBackground } from '../drawing.js';
import { $, $$, download, h, toast, viewer, withLoading } from './core.js';
import { annotOptions } from './drawing.js';
import { setOrtho, walk } from '../main.js';
import { allAlignments, alnLabel, renderPlanes, secViewer, sectionLetter, setStationPlane } from './sections.js';
import { hasScene, streamAlong } from './clouds.js';

// ------------------------------------------------------------------ longitudinal profile
let profileResult = null; // {section, info, opts}

/** Station of a path as text (km+m for alignments, metres along for drawn lines too). */
const fmtSt = (st) => formatStation(st);

export function openProfileDialog(select = null) {
  const list = allAlignments();
  if (!hasScene()) return toast(t('msg.loadFirst'));
  const sel = $('#prof-path');
  const prev = select || list[+sel.value] || null;
  sel.replaceChildren(...list.map((a, i) => h('option', { value: String(i), text: alnLabel(a) })));
  if (!list.length) sel.append(h('option', { value: '', text: t('prof.noPath') }));
  const idx = prev ? list.indexOf(prev) : 0;
  sel.value = String(Math.max(0, idx));
  profilePathChanged();
  $('#profile-dialog').open || $('#profile-dialog').showModal();
}

export function profilePath() { return allAlignments()[+$('#prof-path').value] || null; }

function profilePathChanged() {
  const al = profilePath();
  $('#prof-remove-line').hidden = !al?.drawn;
  if (!al) return;
  $('#prof-from').value = fmtSt(al.station0);
  $('#prof-to').value = fmtSt(al.station0 + al.length);
  // a drawn line usually has no profile of its own worth exaggerating much
  $('#prof-exag').value = al.drawn ? '1' : $('#prof-exag').value;
  $('#prof-preview').replaceChildren(h('p', { class: 'muted small', text: t('prof.previewHint') }));
  profileResult = null;
}
$('#prof-path').addEventListener('change', profilePathChanged);

async function computeProfileNow() {
  const al = profilePath();
  if (!al) { toast(t('prof.noPath')); return null; }
  const from = parseStation($('#prof-from').value), to = parseStation($('#prof-to').value);
  if (from === null || to === null) { toast(t('st.bad', { v: from === null ? $('#prof-from').value : $('#prof-to').value })); return null; }
  const exag = +$('#prof-exag').value || 1;
  const colors = $('#prof-colors').value;
  const opts = { paper: $('#prof-paper').value, scale: 'fit', fill: $('#prof-fill').checked, mono: colors === 'mono', colors };
  let section;
  try {
    section = await withLoading(async (progress) => {
      progress(t('prof.cutting'), 0.3);
      await new Promise((r) => setTimeout(r, 30));
      await streamAlong(al, from - al.station0, to - al.station0); // COPC: the points along the path (#52)
      return computeProfile(viewer, al, (s) => heightAt(al, s), { from: from - al.station0, to: to - al.station0, exag, fmt: fmtSt });
    });
  } catch (e) { console.error(e); toast(t('drw.failed', { error: e.message || e })); return null; }
  let n = 0;
  for (const L of section.layers.values()) n += L.elements;
  const info = {
    title: `${t('prof.drawingTitle')} ${fmtSt(Math.min(from, to))} – ${fmtSt(Math.max(from, to))}`,
    subtitle: `${al.name} · ${t('prof.exagText', { n: exag })} · ${t('prof.nElements', { n: fmtNum(n) })} · ${viewer.models.filter((m) => m.visible).map((m) => m.name).join(', ')}`,
    date: new Date().toISOString().slice(0, 10),
    exag,
  };
  profileResult = { section, info, opts, n };
  return profileResult;
}

export async function showProfile() {
  const r = await computeProfileNow();
  if (!r) return;
  const lay = layout(r.section, r.opts);
  // as an image, so the page's styles do not touch the drawing
  const box = $('#prof-preview');
  const url = URL.createObjectURL(new Blob([toSvg(r.section, lay, r.info, r.opts)], { type: 'image/svg+xml' }));
  const img = h('img', { src: url, alt: r.info.title });
  for (const ev of ['load', 'error']) img.addEventListener(ev, () => URL.revokeObjectURL(url), { once: true });
  box.replaceChildren(img);
  if (!r.n) box.prepend(h('p', { class: 'muted small', text: t('prof.noElements') }));
}

export async function exportProfile(fmt) {
  const r = profileResult || (await computeProfileNow());
  if (!r) return;
  const file = r.info.title.replace(/[^\w\-æøåÆØÅäöüÄÖÜß+ ]+/g, '').trim().replace(/\s+/g, '_') || 'profile';
  if (fmt === 'dxf') return download(`${file}.dxf`, toDxf(r.section, r.info), 'application/dxf');
  const lay = layout(r.section, r.opts);
  if (fmt === 'svg') download(`${file}.svg`, toSvg(r.section, lay, r.info, r.opts), 'image/svg+xml');
  else download(`${file}.pdf`, toPdf(r.section, lay, r.info, r.opts), 'application/pdf');
}
for (const id of ['#prof-from', '#prof-to', '#prof-exag', '#prof-colors', '#prof-paper', '#prof-fill']) $(id).addEventListener('change', () => { profileResult = null; });

// ------------------------------------------------------------- cross section series
/** Shows the series options when the chosen plane is a cross section at a station. */
export function updateSeriesUi() {
  const entry = viewer.planes.find((p) => String(p.id) === $('#drw-plane').value);
  const box = $('#drw-series');
  box.hidden = !entry?.station;
  if (!entry?.station) { $('#ser-on').checked = false; return; }
  const st = entry.station.al.station0 + entry.station.s;
  const step = +$('#ser-step').value || 25;
  if (!$('#ser-from').value || box.dataset.forPlane !== String(entry.id)) {
    $('#ser-from').value = fmtSt(st);
    $('#ser-to').value = fmtSt(Math.min(st + 10 * step, entry.station.al.station0 + entry.station.al.length));
  }
  box.dataset.forPlane = String(entry.id);
}
$('#drw-plane').addEventListener('change', updateSeriesUi);

/** One PDF page per station from–to with the given interval, all at the same scale. */
export async function exportSeries(entry, opts, baseName, file, withBackground) {
  const al = entry.station.al;
  const sOrig = entry.station.s;
  const from = parseStation($('#ser-from').value), to = parseStation($('#ser-to').value);
  const step = Math.abs(+$('#ser-step').value);
  if (from === null || to === null || !(step > 0)) return toast(t('ser.bad'));
  const lo = Math.max(Math.min(from, to), al.station0), hi = Math.min(Math.max(from, to), al.station0 + al.length);
  const stations = [];
  for (let st = lo; st <= hi + 1e-6 && stations.length < 500; st += step) stations.push(st);
  if (!stations.length) return toast(t('st.outside', { from: fmtSt(al.station0), to: fmtSt(al.station0 + al.length) }));
  const letter = sectionLetter(entry);
  const annot = annotOptions();
  const items = [];
  try {
    await withLoading(async (progress) => {
      for (let i = 0; i < stations.length; i++) {
        progress(t('ser.progress', { i: i + 1, n: stations.length, st: fmtSt(stations[i]) }), i / stations.length);
        await new Promise((r) => setTimeout(r, 0));
        setStationPlane(entry, al, stations[i] - al.station0);
        entry.stationLabel = `${t('st.axis')} ${fmtSt(stations[i])}`;
        items.push({ st: stations[i], section: computeSection(viewer, entry, { annot }) });
      }
      // the same extent and scale on every page, with the axis at the same place
      const u = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      const pads = { padTopMm: items[0]?.section.padTopMm || 0, padBottomMm: items[0]?.section.padBottomMm || 0 };
      for (const { section: sc } of items) {
        if (!Number.isFinite(sc.bounds.minX)) continue;
        u.minX = Math.min(u.minX, sc.bounds.minX); u.maxX = Math.max(u.maxX, sc.bounds.maxX);
        u.minY = Math.min(u.minY, sc.bounds.minY); u.maxY = Math.max(u.maxY, sc.bounds.maxY);
      }
      if (!Number.isFinite(u.minX)) throw new Error(t('drw.empty'));
      const lay = layout({ bounds: u, ...pads }, opts);
      const pages = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        it.section.bounds = { ...u };
        let background = null;
        if (withBackground) {
          progress(t('ser.background', { i: i + 1, n: items.length }), i / items.length);
          await new Promise((r) => setTimeout(r, 0));
          setStationPlane(entry, al, it.st - al.station0);
          try { background = renderBackground(viewer, it.section, lay); } catch (e) { console.warn('background', e); }
        }
        pages.push({
          section: it.section, lay,
          info: { title: `${baseName} – ${t('st.section')} ${letter}–${letter} ${fmtSt(it.st)}`, subtitle: `${t('ser.page', { i: i + 1, n: items.length })} · ${al.name} · ${viewer.models.filter((m) => m.visible).map((m) => m.name).join(', ')}`, date: new Date().toISOString().slice(0, 10) },
          opts: { ...opts, background },
        });
      }
      download(`${file}.pdf`, toPdfPages(pages), 'application/pdf');
    });
    toast(t('ser.done', { n: items.length }), true);
  } catch (e) {
    console.error(e);
    toast(t('drw.failed', { error: e.message || e }));
  } finally {
    setStationPlane(entry, al, sOrig);
    renderPlanes();
  }
}

// ------------------------------------------------------------------ drive along
export const drive = { al: null, s: 0, dir: 1, playing: false, last: 0, raf: 0, shown: 0 };

export function openDrive() {
  const list = allAlignments();
  if (!viewer.models.length) return toast(t('msg.loadFirst'));
  if (!list.length) return toast(t('aln.none'));
  if (walk.active) walk.toggle();
  if (viewer.isOrtho) setOrtho(false);
  const c = viewer.toIfc(viewer.controls.target);
  let best = null;
  for (const al of list) { const r = project(al, c); if (!best || r.dist < best.r.dist) best = { al, r }; }
  drive.al = drive.al && list.includes(drive.al) ? drive.al : best.al;
  if (drive.al === best.al) drive.s = best.r.s;
  const sel = $('#drive-path');
  sel.replaceChildren(...list.map((a, i) => h('option', { value: String(i), text: alnLabel(a), selected: a === drive.al })));
  $('#drive-panel').hidden = false;
  drivePose();
  $('#drive-station').select();
}

export function drivePose() {
  const al = drive.al;
  if (!al) return;
  drive.s = Math.min(Math.max(drive.s, 0), al.length);
  const eye = +$('#drive-eye').value || 0;
  const zAt = (s) => {
    const z = heightAt(al, s);
    if (z !== null) return z;
    const box = viewer.sceneBox();
    return box.isEmpty() ? 0 : viewer.toIfc(box.getCenter(new THREE.Vector3())).z;
  };
  const q = pointAt(al, drive.s);
  const P = viewer.fromIfc(q.x, q.y, zAt(drive.s) + eye);
  // look ahead along the path (follows the curves)
  const speed = (+$('#drive-speed').value || 60) / 3.6;
  const look = Math.max(20, speed * 2.5);
  const sa = Math.min(Math.max(drive.s + drive.dir * look, 0), al.length);
  let T;
  if (Math.abs(sa - drive.s) > 1) { const qa = pointAt(al, sa); T = viewer.fromIfc(qa.x, qa.y, zAt(sa) + eye * 0.85); }
  else T = viewer.fromIfc(q.x + q.dx * drive.dir * look, q.y + q.dy * drive.dir * look, zAt(drive.s) + eye * 0.85);
  viewer.camera.position.copy(P);
  viewer.controls.target.copy(T);
  viewer.camera.lookAt(T);
  viewer.controls.update?.();
  const now = performance.now();
  if (now - drive.shown > 120 || !drive.playing) { $('#drive-station').value = fmtSt(al.station0 + drive.s); drive.shown = now; }
}

function driveTick(now) {
  if (!drive.playing) return;
  const dt = Math.min(0.1, (now - drive.last) / 1000);
  drive.last = now;
  drive.s += drive.dir * ((+$('#drive-speed').value || 60) / 3.6) * dt;
  if (drive.s <= 0 || drive.s >= drive.al.length) { drivePose(); setDrivePlaying(false); return; }
  drivePose();
  drive.raf = requestAnimationFrame(driveTick);
}

export function setDrivePlaying(on) {
  if (on && !drive.al) return;
  if (on && ((drive.dir > 0 && drive.s >= drive.al.length - 0.01) || (drive.dir < 0 && drive.s <= 0.01))) drive.dir = -drive.dir; // at the end: turn round
  drive.playing = on;
  $('#drive-play').textContent = on ? '⏸' : '▶';
  $('#drive-dir').textContent = drive.dir > 0 ? '→' : '←';
  cancelAnimationFrame(drive.raf);
  if (on) { drive.last = performance.now(); drive.raf = requestAnimationFrame(driveTick); }
  else drivePose();
}

export function closeDrive() { setDrivePlaying(false); $('#drive-panel').hidden = true; }

$('#drive-path').addEventListener('change', (e) => {
  const al = allAlignments()[+e.target.value];
  if (!al) return;
  const r = project(al, viewer.toIfc(viewer.camera.position));
  drive.al = al; drive.s = r.s;
  drivePose();
});
$('#drive-station').addEventListener('change', (e) => {
  const v = parseStation(e.target.value);
  if (v === null || !drive.al) { toast(t('st.bad', { v: e.target.value })); return drivePose(); }
  drive.s = v - drive.al.station0;
  drivePose();
});
$('#drive-station').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); drive.s += (e.key === 'ArrowUp' ? 1 : -1) * planeStep(); drivePose(); }
});
$('#drive-eye').addEventListener('change', () => drivePose());
// taking the camera (drag, wheel) pauses the drive
viewer.container.addEventListener('pointerdown', (e) => { if (drive.playing && e.target === viewer.renderer.domElement) setDrivePlaying(false); }, { capture: true });
viewer.container.addEventListener('wheel', () => { if (drive.playing) setDrivePlaying(false); }, { capture: true, passive: true });

/** Step length (m) for the ‹ › buttons of the section planes; remembered in the browser. */
export function planeStep() {
  const v = +$('#plane-step').value;
  return Number.isFinite(v) && v > 0 ? v : 1;
}
try { const v = localStorage.getItem('onlineifc.planeStep'); if (v) $('#plane-step').value = v; } catch { /* ignore */ }
$('#plane-step').addEventListener('change', () => {
  try { localStorage.setItem('onlineifc.planeStep', String(planeStep())); } catch { /* ignore */ }
  // only the tooltips change: redrawing the rows here would swallow a click on ‹ › that blurs this field
  for (const b of $$('.plane-row .step')) b.title = t(b.textContent === '›' ? 'planes.stepFwd' : 'planes.stepBack', { step: fmtNum(planeStep()) });
});
// width of cross sections at a station, left | right of the alignment (#66); empty = no limit; remembered
function readSectionWidth() {
  const v = (id) => { const x = +$(id).value; return $(id).value !== '' && Number.isFinite(x) && x > 0 ? x : 0; };
  const w = { left: v('#plane-wl'), right: v('#plane-wr') };
  return w.left || w.right ? w : null;
}
try {
  const w = JSON.parse(localStorage.getItem('onlineifc.secWidth') || 'null');
  if (w) { $('#plane-wl').value = w.left || ''; $('#plane-wr').value = w.right || ''; }
} catch { /* ignore */ }
viewer.setSectionWidth(readSectionWidth());
for (const id of ['#plane-wl', '#plane-wr']) {
  $(id).addEventListener('change', () => {
    const w = readSectionWidth();
    viewer.setSectionWidth(w);
    try { localStorage.setItem('onlineifc.secWidth', JSON.stringify(w)); } catch { /* ignore */ }
    if (secViewer?.isOpen) { secViewer.view = null; secViewer.update(); }
  });
}
// the planes as see-through sheets in 3D: off by default, remembered in this browser
try { $('#plane-helpers').checked = localStorage.getItem('onlineifc.planeHelpers') === '1'; } catch { /* ignore */ }
viewer.setHelpersVisible($('#plane-helpers').checked);
$('#plane-helpers').addEventListener('change', (e) => {
  viewer.setHelpersVisible(e.target.checked);
  try { localStorage.setItem('onlineifc.planeHelpers', e.target.checked ? '1' : '0'); } catch { /* ignore */ }
});
// outline along the cut faces in 3D (#68): yellow by default, remembered
try { const v = localStorage.getItem('onlineifc.cutOutline'); if (v) $('#plane-outline').value = v; } catch { /* ignore */ }
if (!$('#plane-outline').value) $('#plane-outline').value = 'yellow';
viewer.cutlines.setStyle($('#plane-outline').value);
$('#plane-outline').addEventListener('change', (e) => {
  viewer.cutlines.setStyle(e.target.value);
  try { localStorage.setItem('onlineifc.cutOutline', e.target.value); } catch { /* ignore */ }
});
// hatching of the cut faces: on by default, remembered
try { if (localStorage.getItem('onlineifc.hatch') === '0') $('#plane-hatch').checked = false; } catch { /* ignore */ }
viewer.setSectionHatch($('#plane-hatch').checked);
$('#plane-hatch').addEventListener('change', (e) => {
  viewer.setSectionHatch(e.target.checked);
  secViewer?.render();
  try { localStorage.setItem('onlineifc.hatch', e.target.checked ? '1' : '0'); } catch { /* ignore */ }
});

