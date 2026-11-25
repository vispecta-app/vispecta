// Split (#129): a new IFC file with only some elements of a model, written directly on the STEP
// text (like merge.js), so large files can be split too.
//
// Kept: the chosen elements, the parts they are made of (aggregates, nests), the spatial structure
// above them up to the project, their openings, and everything these point to (placements,
// geometry, property sets, types, materials, classifications, the units and contexts of the
// project). Things that point at what is kept without being pointed at – the styles of the geometry,
// presentation layers, material representations, the map conversion – are kept too. Relations are
// kept with the kept objects only (their lists filtered); a relation that is left without any is
// dropped. Entity numbers are kept as they are (STEP allows gaps).
import { SPATIAL, encode, outside, records } from './merge.js';

const HEAD_RE = /^#(\d+)\s*=\s*([A-Za-z0-9_]+)\s*\(/;
const GUID_RE = /^#\d+\s*=\s*[A-Za-z0-9_]+\s*\(\s*'([0-9A-Za-z_$]{22})'/;
const TREE = /^IFCREL(AGGREGATES|NESTS)$/;
const CONTAINED = /^IFCREL(CONTAINEDINSPATIALSTRUCTURE|REFERENCEDINSPATIALSTRUCTURE)$/;
const FILTER_ONLY = /^IFCREL(DEFINESBY[A-Z]*|ASSOCIATES[A-Z]*|ASSIGNSTO[A-Z]*|DECLARES)$/;
// entities that point at what they belong to (inverse): kept when that is kept
const INVERSE = /^IFC(STYLEDITEM|MATERIALDEFINITIONREPRESENTATION|MATERIALPROPERTIES|EXTENDEDMATERIALPROPERTIES|MAPCONVERSION|MAPCONVERSIONSCALED|RIGIDOPERATION|PRESENTATIONLAYERASSIGNMENT|PRESENTATIONLAYERWITHSTYLE)$/;
const LAYER = /^IFCPRESENTATIONLAYER(ASSIGNMENT|WITHSTYLE)$/;

/** The attributes of a record at the top level: strings, as written. */
export function splitArgs(rec) {
  const open = rec.indexOf('('), close = rec.lastIndexOf(')');
  const body = rec.slice(open + 1, close);
  const out = [];
  let depth = 0, q = false, start = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (q) { if (c === "'") q = false; continue; }
    if (c === "'") q = true;
    else if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) { out.push(body.slice(start, i)); start = i + 1; }
  }
  out.push(body.slice(start));
  return { head: rec.slice(0, open + 1), args: out.map((x) => x.trim()), tail: rec.slice(close) };
}

const refsIn = (s) => { const out = []; outside(s, (part) => { for (const m of part.matchAll(/#(\d+)/g)) out.push(+m[1]); return part; }); return out; };
const isList = (a) => /^\(\s*#/.test(a);

/**
 * keep: Set of entity ids (the elements to keep). Returns {blob, kept (entities written), products}.
 */
export async function splitIfcBlob(blob, keep, onProgress = () => {}) {
  // ---- pass 1: the graph
  const type = new Map(); // id -> TYPE
  const refs = new Map(); // id -> [ids] (forward references)
  const rooted = new Set(); // ids with a GlobalId
  const rels = new Map(); // id -> {type, args: [string]} (relations and layer assignments: lists may be filtered)
  for await (const [rec, f] of records(blob)) {
    const m = HEAD_RE.exec(rec);
    if (!m) continue;
    const id = +m[1], tp = m[2].toUpperCase();
    type.set(id, tp);
    const body = rec.slice(m[0].length);
    refs.set(id, refsIn(body));
    if (GUID_RE.test(rec)) rooted.add(id);
    if (tp.startsWith('IFCREL') || LAYER.test(tp)) rels.set(id, { type: tp, args: splitArgs(rec).args });
    onProgress(f * 0.45);
  }
  // relation structure: parents (containment, aggregation, nesting) and children (aggregation, nesting)
  const parent = new Map(), children = new Map(), voids = new Map();
  for (const [, r] of rels) {
    const a = r.args;
    if (TREE.test(r.type)) {
      const rel = refsIn(a[4])[0], list = refsIn(a[5]);
      for (const x of list) { parent.set(x, rel); if (!children.has(rel)) children.set(rel, []); children.get(rel).push(x); }
    } else if (CONTAINED.test(r.type)) {
      if (r.type === 'IFCRELCONTAINEDINSPATIALSTRUCTURE') { const list = refsIn(a[4]), st = refsIn(a[5])[0]; for (const x of list) if (!parent.has(x)) parent.set(x, st); }
    } else if (r.type === 'IFCRELVOIDSELEMENT') {
      const el = refsIn(a[4])[0], op = refsIn(a[5])[0];
      if (!voids.has(el)) voids.set(el, []); voids.get(el).push(op);
    }
  }
  // ---- the objects kept
  const kept = new Set();
  const stack = [...keep].filter((id) => type.has(id));
  const products = stack.length;
  // down: the parts of what is kept (an assembly with its members); a spatial element keeps what is in it
  while (stack.length) {
    const id = stack.pop();
    if (kept.has(id)) continue;
    kept.add(id);
    for (const c of children.get(id) || []) stack.push(c);
    for (const o of voids.get(id) || []) stack.push(o);
    if (SPATIAL.has(type.get(id))) for (const [x, p] of parent) if (p === id) stack.push(x);
  }
  // up: the structure above, to the project
  for (const id of [...kept]) {
    let p = parent.get(id), guard = 0;
    while (p !== undefined && guard++ < 1000) { kept.add(p); p = parent.get(p); }
  }
  for (const [id, tp] of type) if (tp === 'IFCPROJECT') kept.add(id);
  // ---- relations. Structural ones (containment, aggregation, nesting) need their relating object
  // kept; the definitions (properties, types, materials, classifications, groups, declarations)
  // are kept with their list of objects filtered to what is written (so a type keeps its material);
  // the others (voids, fills, connections …) only when all their objects are kept.
  const rewrite = new Map(); // id -> new args (a list was filtered)
  const keptRels = new Set();
  const out = new Set();
  const walk = (start) => {
    const st = [start];
    while (st.length) {
      const id = st.pop();
      if (out.has(id) || !type.has(id)) continue;
      out.add(id);
      const rw = rewrite.get(id);
      for (const x of rw ? rw.flatMap((s) => refsIn(s)) : refs.get(id) || []) {
        // never into a relation that is not kept (they are written only when they pass the rules)
        if (!out.has(x) && !(rels.has(x) && !keptRels.has(x))) st.push(x);
      }
    }
  };
  const listAt = (r) => (TREE.test(r.type) || r.type === 'IFCRELDECLARES' ? 5 : 4);
  const filtered = (r, inSet) => {
    const i = listAt(r), ids = refsIn(r.args[i] || '');
    const k = ids.filter((x) => inSet.has(x));
    if (!k.length) return null;
    if (k.length === ids.length) return r.args;
    const args = r.args.slice(); args[i] = `(${k.map((x) => `#${x}`).join(',')})`;
    return args;
  };
  const keepRel = (id, args) => { keptRels.add(id); if (args !== rels.get(id).args) rewrite.set(id, args); };
  for (const [id, r] of rels) {
    if (LAYER.test(r.type) || FILTER_ONLY.test(r.type)) continue;
    const a = r.args;
    if (TREE.test(r.type) || CONTAINED.test(r.type)) {
      if (!kept.has(refsIn(a[TREE.test(r.type) ? 4 : 5])[0])) continue;
      const args = filtered(r, kept);
      if (args) keepRel(id, args);
    } else {
      const objs = a.slice(4).flatMap((s) => refsIn(s)).filter((x) => rooted.has(x));
      if (objs.length && objs.every((x) => kept.has(x))) keepRel(id, a);
    }
  }
  for (const id of kept) walk(id);
  for (const id of [...keptRels]) walk(id);
  for (let round = 0; round < 4; round++) {
    let added = 0;
    for (const [id, r] of rels) {
      if (keptRels.has(id) || !FILTER_ONLY.test(r.type)) continue;
      const args = filtered(r, out);
      if (!args) continue;
      keepRel(id, args);
      walk(id);
      added++;
    }
    if (!added) break;
  }
  // what points at kept things from outside (styles, layers, material representations, the map conversion)
  for (let round = 0; round < 3; round++) {
    let added = 0;
    for (const [id, tp] of type) {
      if (out.has(id) || !INVERSE.test(tp)) continue;
      const r = refs.get(id) || [];
      if (LAYER.test(tp)) {
        const a = rels.get(id).args, i = a.findIndex((s) => isList(s));
        const ids = i >= 0 ? refsIn(a[i]).filter((x) => out.has(x)) : [];
        if (!ids.length) continue;
        const args = a.slice(); args[i] = `(${ids.map((x) => `#${x}`).join(',')})`;
        rewrite.set(id, args);
        walk(id);
        added++;
      } else if (r.some((x) => out.has(x))) { walk(id); added++; }
    }
    if (!added) break;
  }
  // ---- pass 2: write
  const parts = [];
  let buf = [];
  let size = 0;
  const flush = () => { if (buf.length) { parts.push(encode(buf.join(''))); buf = []; size = 0; } };
  for await (const [rec, f] of records(blob)) {
    const m = HEAD_RE.exec(rec);
    let line;
    if (!m) line = rec.trim() ? `${rec.trim()}\n` : '';
    else {
      const id = +m[1];
      if (!out.has(id)) continue;
      const rw = rewrite.get(id);
      if (rw) { const sp = splitArgs(rec); line = `${sp.head}${rw.join(',')}${sp.tail}\n`; } else line = `${rec.trim()}\n`;
    }
    buf.push(line);
    size += line.length;
    if (size > 4 * 1024 * 1024) flush();
    onProgress(0.5 + f * 0.5);
  }
  flush();
  return { blob: new Blob(parts, { type: 'application/x-step' }), kept: out.size, products };
}
