// Quick quality check of the loaded models (#138) – the things that go wrong in deliveries and that
// an IDS file does not ask about: GlobalIds (missing, malformed, twice in a model, the same element in
// two files), elements twice (same class and geometry in the same place), elements outside the spatial
// structure, without a name, with almost no geometry or far away from the rest (a wrong placement),
// structure entries without geometry, proxies, and per model the georeferencing and length unit.
import * as THREE from 'three';
import { guidOf } from './bcf.js';

const GUID_RE = /^[0-3][0-9A-Za-z_$]{21}$/;
// classes that have no geometry of their own on purpose
const NO_GEOMETRY_OK = /^Ifc(Alignment|Referent|Annotation|VirtualElement|Grid|SpatialZone|DistributionPort|Port|OpeningElement|Group|System|Zone|ElementAssembly|Railway|Road|Bridge|Building|BuildingStorey|Site|Space|Facility|FacilityPart|RailwayPart|RoadPart|BridgePart|MarineFacility|Tunnel|TunnelPart|ExternalSpatialElement|Project|Linear.*|Positioning.*|Course|Pavement|TrackElement)$/i;

/** Per element of a model: its box (world) and number of triangles, in one pass over the buckets. */
function elementBoxes(model) {
  model.group.updateMatrixWorld(true);
  const M = model.group.matrixWorld, v = new THREE.Vector3();
  const out = new Map();
  for (const b of model.buckets) {
    const P = b.positions, I = b.index;
    for (const it of b.items) {
      let e = out.get(it.id);
      if (!e) { e = { box: new THREE.Box3(), tris: 0 }; out.set(it.id, e); }
      e.tris += it.count / 3;
      for (let k = it.start; k < it.start + it.count; k++) {
        const vi = I[k] * 3;
        v.set(P[vi], P[vi + 1], P[vi + 2]).applyMatrix4(M);
        e.box.expandByPoint(v);
      }
    }
  }
  return out;
}

/**
 * Checks the models. Returns {checks: [{key, severity: 'error' | 'warning' | 'info', items: [{model,
 * id | null, note}]}], elements, models} – items with id null concern a whole model.
 */
export async function quickCheck(viewer, models, { onProgress = () => {}, farM = 5000 } = {}) {
  const C = {};
  const add = (key, severity, item) => { (C[key] ||= { key, severity, items: [] }).items.push(item); };
  for (const k of [['guidMissing', 'error'], ['guidBad', 'error'], ['guidDup', 'error'], ['guidOtherModel', 'warning'], ['duplicate', 'warning'], ['noStructure', 'warning'], ['noName', 'info'], ['tiny', 'warning'], ['far', 'warning'], ['noGeometry', 'info'], ['proxy', 'info'], ['georef', 'warning'], ['unit', 'info']]) C[k[0]] = { key: k[0], severity: k[1], items: [] };
  const byGuid = new Map();
  let elements = 0, done = 0;
  const total = models.reduce((n, m) => n + m.elementIds.size, 0) || 1;
  for (const m of models) {
    // the model as a whole
    if (!m.georef?.map) add('georef', 'warning', { model: m, id: null });
    const unit = m.shownLengthScale ?? 1;
    if (Math.abs(unit - 1) > 1e-9) add('unit', 'info', { model: m, id: null, note: `${unit} m` });
    const boxes = elementBoxes(m);
    // the middle of the model: the median of the element centres (a few far ones do not move it)
    const cs = [...boxes.values()].map((e) => e.box.getCenter(new THREE.Vector3()));
    const med = (k) => { const a = cs.map((c) => c[k]).sort((x, y) => x - y); return a[Math.floor(a.length / 2)] ?? 0; };
    const mid = new THREE.Vector3(med('x'), med('y'), med('z'));
    const sig = new Map();
    for (const id of m.elementIds) {
      elements++;
      const cls = m.typeName(id);
      const g = guidOf(m, id);
      if (!g) add('guidMissing', 'error', { model: m, id });
      else {
        if (!GUID_RE.test(g)) add('guidBad', 'error', { model: m, id, note: g });
        if (!byGuid.has(g)) byGuid.set(g, []);
        byGuid.get(g).push({ model: m, id });
      }
      if (!m.parent?.has(id)) add('noStructure', 'warning', { model: m, id });
      if (!m.nameOf(id)) add('noName', 'info', { model: m, id });
      if (/^IfcBuildingElementProxy$/i.test(cls)) add('proxy', 'info', { model: m, id });
      const e = boxes.get(id);
      if (e && !e.box.isEmpty()) {
        const size = e.box.getSize(new THREE.Vector3()).length();
        if (size < 0.001) add('tiny', 'warning', { model: m, id, note: `${(size * 1000).toFixed(2)} mm` });
        const d = e.box.getCenter(new THREE.Vector3()).distanceTo(mid);
        if (d > farM) add('far', 'warning', { model: m, id, note: `${Math.round(d)} m` });
        // the same class, number of triangles and box (to the millimetre): a copy in the same place
        const r = (x) => Math.round(x * 1000);
        const key = `${cls}|${Math.round(e.tris)}|${[e.box.min.x, e.box.min.y, e.box.min.z, e.box.max.x, e.box.max.y, e.box.max.z].map(r).join(',')}`;
        if (sig.has(key)) add('duplicate', 'warning', { model: m, id, note: `= #${sig.get(key)}`, other: sig.get(key) });
        else sig.set(key, id);
      }
      if (++done % 2000 === 0) { onProgress(done / total); await new Promise((res) => setTimeout(res, 0)); }
    }
    // entries of the spatial structure without geometry (assemblies and spatial elements excepted)
    const walk = (node) => {
      if (node.children?.length) { for (const c of node.children) walk(c); return; }
      const id = node.expressID;
      if (m.elementIds.has(id)) return;
      const cls = m.typeName(id);
      if (cls && !NO_GEOMETRY_OK.test(cls)) add('noGeometry', 'info', { model: m, id });
    };
    if (m.tree) walk(m.tree);
  }
  for (const list of byGuid.values()) {
    if (list.length < 2) continue;
    const same = new Map();
    for (const x of list) { if (!same.has(x.model)) same.set(x.model, []); same.get(x.model).push(x); }
    for (const [, xs] of same) if (xs.length > 1) for (const x of xs) add('guidDup', 'error', { ...x, note: guidOf(x.model, x.id) });
    if (same.size > 1) for (const x of list) add('guidOtherModel', 'warning', { ...x, note: [...same.keys()].filter((mm) => mm !== x.model).map((mm) => mm.name).join(', ') });
  }
  onProgress(1);
  const order = { error: 0, warning: 1, info: 2 };
  return { checks: Object.values(C).sort((a, b) => order[a.severity] - order[b.severity]), elements, models: models.length };
}
