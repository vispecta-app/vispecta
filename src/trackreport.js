// Track report (#137): the elements of an alignment – horizontal (lines, arcs, transition curves),
// vertical (gradients and roundings) and cant – and a list of stations every few metres with
// coordinates, height, radius, gradient and cant. As CSV, Excel (.xlsx) and PDF.
import { heightAt, pointAt } from './alignment.js';
import { cantAt, radiusAt } from './clearance.js';
import { pdfBytes, pdfStr } from './drawing.js';
import { writeXlsx } from './xlsx.js';

const r = (x, d) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

/** Gradient (‰) of the vertical profile at s, or null without one. */
export function gradientAt(al, s) {
  const V = al.vertical || [];
  let seg = null;
  for (const v of V) if (s >= v.s0 - 1e-9) seg = v;
  if (!seg) return null;
  const f = seg.L ? Math.min(1, Math.max(0, (s - seg.s0) / seg.L)) : 0;
  return (seg.g0 + (seg.g1 - seg.g0) * f) * 1000;
}

/** Signed radius (m, + left as IFC; Infinity: straight) at s. */
export function signedRadiusAt(al, s) {
  const R = radiusAt(al, s);
  if (!Number.isFinite(R)) return Infinity;
  let seg = null;
  for (const x of al.horizontal || []) if (s >= x.s0 - 1e-9) seg = x;
  const sign = seg ? Math.sign(seg.sr0 || seg.sr1 || 1) : 1;
  return sign * R;
}

/**
 * The tables of the report. ctx: {t, fmt (station -> text), toMap (IFC {x,y,z} -> {x,y,z}) | null, step}
 * Returns [{key, name, header, rows, numeric: [bool]}].
 */
export function trackTables(al, ctx) {
  const { t, fmt } = ctx;
  const st = (s) => fmt(al.station0 + s);
  const out = [];
  const typeName = (kind, type) => { const k = `trk.${kind}.${type}`, v = t(k); return v === k ? String(type || '').toLowerCase() : v; };
  const side = (v) => (v > 0 ? t('trk.left') : v < 0 ? t('trk.right') : '');
  // horizontal
  if (al.horizontal?.length) {
    out.push({
      key: 'horizontal', name: t('trk.horizontal'),
      header: ['#', t('trk.type'), t('trk.from'), t('trk.to'), `${t('trk.length')} (m)`, `R ${t('trk.start')} (m)`, `R ${t('trk.end')} (m)`, t('trk.turn'), 'A (m)'],
      rows: al.horizontal.filter((h) => h.L > 1e-9).map((h, i) => {
        const clothoid = /CLOTHOID/i.test(h.type) && ((!h.r0) !== (!h.r1)) ? Math.sqrt((h.r0 || h.r1) * h.L) : null;
        // a transition is given by its length (and A), not by the radii at its ends
        const arc = !/LINE/i.test(h.type) && !/CLOTHOID|CUBIC|HELMERT|BLOSS|SINE|COSINE|VIENNESE/i.test(h.type);
        return [i + 1, typeName('h', h.type), st(h.s0), st(h.s0 + h.L), r(h.L, 3), arc && h.r0 ? r(h.r0, 3) : null, arc && h.r1 ? r(h.r1, 3) : null, side(h.sr0 || h.sr1 || 0), clothoid ? r(clothoid, 3) : null];
      }),
    });
  }
  // vertical
  if (al.vertical?.length) {
    out.push({
      key: 'vertical', name: t('trk.vertical'),
      header: ['#', t('trk.type'), t('trk.from'), t('trk.to'), `${t('trk.length')} (m)`, `${t('trk.height')} ${t('trk.start')} (m)`, `${t('trk.height')} ${t('trk.end')} (m)`, `i ${t('trk.start')} (‰)`, `i ${t('trk.end')} (‰)`, 'Rv (m)'],
      rows: al.vertical.filter((v) => v.L > 1e-9).map((v, i) => [i + 1, typeName('v', v.type), st(v.s0), st(v.s0 + v.L), r(v.L, 3), r(heightAt(al, v.s0), 3), r(heightAt(al, v.s0 + v.L), 3), r(v.g0 * 1000, 3), r(v.g1 * 1000, 3), v.R ? r(v.R, 1) : null]),
    });
  }
  // cant
  if (al.cant?.segs?.length) {
    out.push({
      key: 'cant', name: t('trk.cant'),
      header: ['#', t('trk.from'), t('trk.to'), `${t('trk.length')} (m)`, `D ${t('trk.start')} (mm)`, `D ${t('trk.end')} (mm)`, t('trk.highRail')],
      rows: al.cant.segs.filter((c) => c.L > 1e-9).map((c, i) => {
        const d0 = (c.cl0 - c.cr0) * 1000, d1 = (c.cl1 - c.cr1) * 1000;
        return [i + 1, st(c.s0), st(c.s0 + c.L), r(c.L, 3), r(Math.abs(d0), 1), r(Math.abs(d1), 1), side(Math.abs(d0) > Math.abs(d1) ? d0 : d1)];
      }),
    });
  }
  // stations every step metres (and the end)
  const step = Math.max(1, ctx.step || 10);
  const rows = [];
  const ss = [];
  for (let s = 0; s < al.length - 1e-6; s += step) ss.push(s);
  ss.push(al.length);
  for (const s of ss.slice(0, 20000)) {
    const p = pointAt(al, s), z = heightAt(al, s);
    const m = ctx.toMap ? ctx.toMap({ x: p.x, y: p.y, z: z ?? 0 }) : { x: p.x, y: p.y };
    const R = signedRadiusAt(al, s), g = gradientAt(al, s);
    const c = al.cant?.segs?.length ? cantAt(al, s) : null;
    rows.push([st(s), r(m.x, 3), r(m.y, 3), z === null ? null : r(z, 3), Number.isFinite(R) ? r(Math.abs(R), 1) : null, Number.isFinite(R) ? side(R) : '', g === null ? null : r(g, 2), c ? r(Math.abs(c.left - c.right) * 1000, 1) : null]);
  }
  out.push({ key: 'stations', name: t('trk.stations'), header: [t('aln.station'), ctx.toMap ? 'E (m)' : 'X (m)', ctx.toMap ? 'N (m)' : 'Y (m)', `${t('trk.height')} (m)`, 'R (m)', t('trk.turn'), 'i (‰)', 'D (mm)'], rows });
  return out;
}

/** CSV: one section per table, ';' between fields, the decimal sign of the language. */
export function tablesToCsv(tables, { dec = '.', title = '' } = {}) {
  const q = (v) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return String(v).replace('.', dec);
    const s = String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const L = [];
  if (title) L.push(q(title), '');
  for (const tb of tables) {
    L.push(q(tb.name), tb.header.map(q).join(';'), ...tb.rows.map((row) => row.map(q).join(';')), '');
  }
  return `﻿${L.join('\r\n')}`; // BOM: Excel reads UTF-8 (æ, ø, å, ‰)
}

export function tablesToXlsx(tables, { title = '' } = {}) {
  return writeXlsx(tables.map((tb) => ({ name: tb.name, rows: [tb.header, ...tb.rows] })), { title });
}

/** PDF: A4 landscape, one table after the other, the header row repeated on every page. */
export function tablesToPdf(tables, { title = '', subtitle = '', dec = '.' } = {}) {
  const k = 72 / 25.4, W = 297, H = 210, m = 12, fs = 7.5, rowH = 4.2;
  const pages = [];
  let cur = null, y = 0;
  const fmtCell = (v) => (v === null || v === undefined ? '' : typeof v === 'number' ? String(v).replace('.', dec) : String(v));
  // width of a text in mm (Helvetica, approximately: 0.5 em per character, 0.55 for digits)
  const tw = (s, size = fs) => String(s).length * size * 0.36 * 0.55 * 1.05;
  const newPage = () => { cur = []; pages.push(cur); y = m + 14; };
  const text = (x, yy, s, bold = false, size = fs, right = false) => {
    const xx = right ? x - tw(s, size) : x;
    cur.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${(xx * k).toFixed(2)} ${((H - yy) * k).toFixed(2)} Td (${pdfStr(s)}) Tj ET`);
  };
  const line = (x0, y0, x1, y1, w = 0.2) => cur.push(`${(w * k).toFixed(2)} w ${(x0 * k).toFixed(2)} ${((H - y0) * k).toFixed(2)} m ${(x1 * k).toFixed(2)} ${((H - y1) * k).toFixed(2)} l S`);
  newPage();
  for (const tb of tables) {
    const cells = tb.rows.map((row) => row.map(fmtCell));
    const widths = tb.header.map((hd, ci) => Math.min(70, Math.max(tw(hd) + 3, ...cells.slice(0, 500).map((c) => tw(c[ci]) + 3))));
    const total = widths.reduce((a, b) => a + b, 0), sc = total > W - 2 * m ? (W - 2 * m) / total : 1;
    const X = []; let x = m;
    for (const w of widths) { X.push(x); x += w * sc; }
    const numeric = tb.header.map((_, ci) => tb.rows.some((row) => typeof row[ci] === 'number'));
    const head = () => {
      text(m, y, tb.name, true, 10); y += 6;
      tb.header.forEach((hd, ci) => text(numeric[ci] ? X[ci] + widths[ci] * sc - 1.5 : X[ci], y, hd, true, fs, numeric[ci]));
      line(m, y + 1.2, m + total * sc, y + 1.2, 0.3); y += rowH + 0.6;
    };
    if (y > H - m - 30) newPage();
    head();
    for (const c of cells) {
      if (y > H - m - 6) { newPage(); head(); }
      c.forEach((v, ci) => text(numeric[ci] ? X[ci] + widths[ci] * sc - 1.5 : X[ci], y, v, false, fs, numeric[ci]));
      y += rowH;
    }
    y += 6;
  }
  // header and footer of every page
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
  const kids = [];
  pages.forEach((pg, i) => {
    cur = pg;
    text(m, m + 2, title, true, 12);
    if (subtitle) text(m, m + 7.5, subtitle, false, 8);
    line(m, m + 9.5, W - m, m + 9.5, 0.4);
    text(W - m, H - m + 6, `${i + 1} / ${pages.length}`, false, 7, true);
    text(m, H - m + 6, 'Vispecta', false, 7);
    const content = ['0 0 0 RG 0 0 0 rg 1 J 1 j', ...pg].join('\n');
    const no = objs.length + 1;
    kids.push(`${no} 0 R`);
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${(W * k).toFixed(2)} ${(H * k).toFixed(2)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${no + 1} 0 R >>`);
    objs.push({ dict: `<< /Length ${content.length} >>`, stream: content });
  });
  objs[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
  return pdfBytes(objs, title);
}
