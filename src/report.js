// Issue report (#133): the issues (BCF topics) as a document for people – a meeting, a letter, the
// file. A zip with report.md (Markdown, with the snapshots in images/) and report.html (the same,
// self-contained, to read in a browser or print as PDF). It is not read back: BCF is for that.
//
// Per issue: title, type, status, priority, assigned to, due date, who made and changed it, labels,
// description, where it is (station and offset on the nearest alignment, from the selected elements
// or the annotations), the elements, the texts of the annotations, the comments and the snapshots.
import * as THREE from 'three';
import { zipSync, strToU8 } from 'fflate';
import { guidIndex } from './bcf.js';

const md = (s) => String(s ?? '').replace(/\r?\n/g, ' ').replace(/([\\`*_[\]|<>#])/g, '\\$1');
const mdBlock = (s) => String(s ?? '').split(/\r?\n/).map((l) => md(l)).join('  \n');
const html = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const htmlBlock = (s) => html(s).replace(/\r?\n/g, '<br>');
const date = (s) => (s ? String(s).slice(0, 16).replace('T', ' ') : '');

function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * ctx: {viewer, t, fmtNum, formatStation, locate(ifcPoint) -> {alignment, station, offset} | null,
 *       title, author}
 * Returns {zip: Uint8Array, md, html, images}.
 */
export function buildReport(topics, ctx) {
  const { viewer, t } = ctx;
  const idx = guidIndex(viewer.models);
  const images = {}; // path -> bytes
  const now = new Date();
  const stamp = now.toISOString().slice(0, 16).replace('T', ' ');
  const closed = topics.filter((tp) => ['Closed', 'Resolved'].includes(tp.status)).length;
  const models = viewer.models.map((m) => m.alias || m.name);

  const topicData = topics.map((tp, n) => {
    const vp = tp.viewpoints[0] || null;
    // the elements of the issue: its selection, found again by GlobalId
    const els = [];
    const box = new THREE.Box3();
    for (const g of vp?.selection || []) {
      for (const { model, id } of idx.get(g) || []) {
        els.push({ cls: model.typeName(id), name: model.label(id), guid: g, model: model.alias || model.name });
        box.union(model.getBox([id]));
      }
    }
    // where: the middle of the elements, else the first annotation
    let at = null;
    if (!box.isEmpty()) at = viewer.toIfc(box.getCenter(new THREE.Vector3()));
    else if (Array.isArray(vp?.markup) && vp.markup[0]?.p?.length >= 3) at = new THREE.Vector3(...vp.markup[0].p);
    const loc = at && ctx.locate ? ctx.locate({ x: at.x, y: at.y, z: at.z }) : null;
    const where = loc && Number.isFinite(loc.station)
      ? t('rep.locationText', { alignment: loc.alignment?.name || '', station: ctx.formatStation(loc.station), offset: ctx.fmtNum(Math.round(loc.offset * 100) / 100) })
      : null;
    const notes = (Array.isArray(vp?.markup) ? vp.markup : []).map((m, i) => ({ i: i + 1, kind: t(`notes.${m.kind || (m.q ? 'arrow' : 'note')}`), text: String(m.text || '').trim() })).filter((m) => m.text);
    const shots = [];
    tp.viewpoints.forEach((v, i) => {
      if (!v.snapshot?.length) return;
      const path = `images/${String(n + 1).padStart(2, '0')}-${i + 1}.png`;
      images[path] = v.snapshot;
      shots.push(path);
    });
    return { tp, n: n + 1, els, where, notes, shots };
  });

  // ---------------------------------------------------------------- Markdown
  const M = [];
  M.push(`# ${md(ctx.title || t('rep.title'))}`, '');
  M.push(`${md(t('rep.generated', { date: stamp }))}${ctx.author ? ` · ${md(ctx.author)}` : ''}`, '');
  if (models.length) M.push(`**${md(t('rep.models'))}:** ${models.map(md).join(', ')}`, '');
  M.push(md(t('rep.summary', { n: topics.length, open: topics.length - closed, closed })), '');
  if (!topics.length) M.push(md(t('rep.noIssues')), '');
  if (topics.length) {
    M.push(`| # | ${md(t('rep.issue'))} | ${md(t('rep.status'))} | ${md(t('rep.priority'))} | ${md(t('rep.assigned'))} | ${md(t('rep.location'))} |`, '|---|---|---|---|---|---|');
    for (const d of topicData) M.push(`| ${d.n} | ${md(d.tp.title)} | ${md(t(`bcf.status.${d.tp.status}`))} | ${md(d.tp.priority ? t(`bcf.prio.${d.tp.priority}`) : '')} | ${md(d.tp.assignedTo)} | ${md(d.where || '')} |`);
    M.push('');
  }
  for (const d of topicData) {
    const { tp } = d;
    M.push(`## ${d.n}. ${md(tp.title)}`, '');
    const rows = [
      [t('rep.type'), t(`bcf.type.${tp.type}`)], [t('rep.status'), t(`bcf.status.${tp.status}`)],
      [t('rep.priority'), tp.priority ? t(`bcf.prio.${tp.priority}`) : ''], [t('rep.assigned'), tp.assignedTo],
      [t('rep.due'), date(tp.dueDate)], [t('rep.created'), [tp.author, date(tp.created)].filter(Boolean).join(', ')],
      [t('rep.modified'), [tp.modifiedAuthor, date(tp.modified)].filter(Boolean).join(', ')], [t('rep.labels'), (tp.labels || []).join(', ')],
      [t('rep.location'), d.where || ''],
    ].filter(([, v]) => v);
    M.push(`| | |`, '|---|---|', ...rows.map(([k, v]) => `| ${md(k)} | ${md(v)} |`), '');
    if (tp.description) M.push(`**${md(t('rep.description'))}**`, '', mdBlock(tp.description), '');
    if (d.els.length) {
      M.push(`**${md(t('rep.elements'))}**`, '');
      for (const e of d.els.slice(0, 50)) M.push(`- ${md(e.cls)} – ${md(e.name)} (${md(e.model)}, \`${md(e.guid)}\`)`);
      if (d.els.length > 50) M.push(`- ${md(t('rep.more', { n: d.els.length - 50 }))}`);
      M.push('');
    }
    if (d.notes.length) {
      M.push(`**${md(t('rep.annotations'))}**`, '');
      for (const x of d.notes) M.push(`${x.i}. ${md(x.kind)}: ${mdBlock(x.text)}`);
      M.push('');
    }
    for (const s of d.shots) M.push(`![${md(tp.title)}](${s})`, '');
    if (tp.comments.length) {
      M.push(`**${md(t('rep.comments'))}**`, '');
      for (const c of tp.comments) M.push(`- **${md(c.author || '')}** ${md(date(c.date))}: ${mdBlock(c.text)}`);
      M.push('');
    }
  }
  const mdText = `${M.join('\n')}\n`;

  // -------------------------------------------------------------------- HTML
  const H = [];
  H.push(`<!doctype html><html lang="${html(document.documentElement.lang || 'en')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${html(ctx.title || t('rep.title'))}</title><style>
body{font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1d2327;max-width:960px;margin:24px auto;padding:0 16px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px;padding-top:12px;border-top:2px solid #0e8c84;break-after:avoid}
table{border-collapse:collapse;margin:6px 0 10px}td,th{border:1px solid #d5dbe0;padding:3px 8px;text-align:left;vertical-align:top}th{background:#eef3f3}
.meta td:first-child{color:#5b6670;white-space:nowrap}.muted{color:#5b6670}img{max-width:100%;border:1px solid #d5dbe0;margin:6px 0}
code{font-size:12px;color:#5b6670}.topic{break-inside:avoid-page}.st{display:inline-block;padding:0 6px;border-radius:8px;background:#eef3f3}
@media print{body{margin:0;max-width:none}h2{break-before:auto}}
</style></head><body>`);
  H.push(`<h1>${html(ctx.title || t('rep.title'))}</h1><p class="muted">${html(t('rep.generated', { date: stamp }))}${ctx.author ? ` · ${html(ctx.author)}` : ''}</p>`);
  if (models.length) H.push(`<p><b>${html(t('rep.models'))}:</b> ${models.map(html).join(', ')}</p>`);
  H.push(`<p>${html(t('rep.summary', { n: topics.length, open: topics.length - closed, closed }))}</p>`);
  if (topics.length) {
    H.push(`<table><tr><th>#</th><th>${html(t('rep.issue'))}</th><th>${html(t('rep.status'))}</th><th>${html(t('rep.priority'))}</th><th>${html(t('rep.assigned'))}</th><th>${html(t('rep.location'))}</th></tr>`);
    for (const d of topicData) H.push(`<tr><td>${d.n}</td><td><a href="#t${d.n}">${html(d.tp.title)}</a></td><td>${html(t(`bcf.status.${d.tp.status}`))}</td><td>${html(d.tp.priority ? t(`bcf.prio.${d.tp.priority}`) : '')}</td><td>${html(d.tp.assignedTo)}</td><td>${html(d.where || '')}</td></tr>`);
    H.push('</table>');
  } else H.push(`<p>${html(t('rep.noIssues'))}</p>`);
  for (const d of topicData) {
    const { tp } = d;
    H.push(`<section class="topic" id="t${d.n}"><h2>${d.n}. ${html(tp.title)} <span class="st">${html(t(`bcf.status.${tp.status}`))}</span></h2><table class="meta">`);
    const rows = [
      [t('rep.type'), t(`bcf.type.${tp.type}`)], [t('rep.priority'), tp.priority ? t(`bcf.prio.${tp.priority}`) : ''], [t('rep.assigned'), tp.assignedTo],
      [t('rep.due'), date(tp.dueDate)], [t('rep.created'), [tp.author, date(tp.created)].filter(Boolean).join(', ')],
      [t('rep.modified'), [tp.modifiedAuthor, date(tp.modified)].filter(Boolean).join(', ')], [t('rep.labels'), (tp.labels || []).join(', ')], [t('rep.location'), d.where || ''],
    ].filter(([, v]) => v);
    for (const [k, v] of rows) H.push(`<tr><td>${html(k)}</td><td>${html(v)}</td></tr>`);
    H.push('</table>');
    if (tp.description) H.push(`<p><b>${html(t('rep.description'))}</b><br>${htmlBlock(tp.description)}</p>`);
    if (d.els.length) {
      H.push(`<p><b>${html(t('rep.elements'))}</b></p><ul>`);
      for (const e of d.els.slice(0, 50)) H.push(`<li>${html(e.cls)} – ${html(e.name)} <span class="muted">(${html(e.model)}, <code>${html(e.guid)}</code>)</span></li>`);
      if (d.els.length > 50) H.push(`<li>${html(t('rep.more', { n: d.els.length - 50 }))}</li>`);
      H.push('</ul>');
    }
    if (d.notes.length) {
      H.push(`<p><b>${html(t('rep.annotations'))}</b></p><ol>`);
      for (const x of d.notes) H.push(`<li value="${x.i}">${html(x.kind)}: ${htmlBlock(x.text)}</li>`);
      H.push('</ol>');
    }
    for (const s of d.shots) H.push(`<img alt="${html(tp.title)}" src="data:image/png;base64,${b64(images[s])}">`);
    if (tp.comments.length) {
      H.push(`<p><b>${html(t('rep.comments'))}</b></p><ul>`);
      for (const c of tp.comments) H.push(`<li><b>${html(c.author || '')}</b> <span class="muted">${html(date(c.date))}</span><br>${htmlBlock(c.text)}</li>`);
      H.push('</ul>');
    }
    H.push('</section>');
  }
  H.push('</body></html>');
  const htmlText = H.join('\n');

  const files = { 'report.md': strToU8(mdText), 'report.html': strToU8(htmlText) };
  for (const [p, b] of Object.entries(images)) files[p] = [b, { level: 0 }];
  return { zip: zipSync(files, { level: 6 }), md: mdText, html: htmlText, images };
}
