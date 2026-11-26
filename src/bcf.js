// BCF (BIM Collaboration Format): topics with comments and viewpoints, read and written as
// .bcfzip in version 2.1 or 3.0. Viewpoints store camera, selection, visibility, colours and
// section planes in IFC coordinates, plus a snapshot image.
import * as THREE from 'three';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { fmtValue } from './ifc.js';

export const TOPIC_TYPES = ['Issue', 'Request', 'Remark', 'Clash', 'Inquiry'];
export const TOPIC_STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'];
export const PRIORITIES = ['Low', 'Normal', 'High', 'Critical'];

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ------------------------------------------------------------------ GUIDs
export function guidOf(model, id) {
  if (!model._guids) model._guids = new Map();
  let g = model._guids.get(id);
  if (g === undefined) {
    g = fmtValue(model.api.GetLine(model.modelID, id, false)?.GlobalId) || '';
    model._guids.set(id, g);
  }
  return g;
}

/** GlobalId -> [{model, id}] over all loaded models (elements with geometry). */
export function guidIndex(models) {
  const idx = new Map();
  for (const m of models) {
    for (const id of m.elementIds) {
      const g = guidOf(m, id);
      if (!g) continue;
      if (!idx.has(g)) idx.set(g, []);
      idx.get(g).push({ model: m, id });
    }
  }
  return idx;
}

// --------------------------------------------------------------- viewpoints
const dirToIfc = (viewer, v) => viewer.toIfc(v.clone()).sub(viewer.toIfc(new THREE.Vector3()));
const dirFromIfc = (viewer, x, y, z) => viewer.fromIfc(x, y, z).sub(viewer.fromIfc(0, 0, 0));

/** Captures the current view as a BCF viewpoint. */
export function captureViewpoint({ viewer, selection, spacesVisible }) {
  const cam = viewer.camera;
  const pos = viewer.toIfc(cam.position);
  const dir = dirToIfc(viewer, cam.getWorldDirection(new THREE.Vector3())).normalize();
  const up = dirToIfc(viewer, new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion)).normalize();
  const vp = {
    guid: uuid(),
    camera: { pos: pos.toArray(), dir: dir.toArray(), up: up.toArray(), fov: viewer.fov, aspect: viewer.perspCamera.aspect, ortho: !!viewer.isOrtho, scale: viewer.orthoHeight },
    selection: [],
    visibility: { defaultVisible: true, exceptions: [], spacesVisible: !!spacesVisible },
    coloring: [],
    clipping: [],
  };
  for (const [m, set] of selection) for (const id of set) { const g = guidOf(m, id); if (g) vp.selection.push(g); }
  // visibility: store the smaller of "hidden" and "visible" lists
  const hidden = [], visible = [];
  for (const m of viewer.models) {
    for (const id of m.elementIds) {
      if (m.spaceIds.has(id)) continue; // spaces are covered by SpacesVisible
      const g = guidOf(m, id);
      if (!g) continue;
      (!m.visible || m.hidden.has(id) ? hidden : visible).push(g);
    }
  }
  if (hidden.length <= visible.length) vp.visibility = { ...vp.visibility, defaultVisible: true, exceptions: hidden };
  else vp.visibility = { ...vp.visibility, defaultVisible: false, exceptions: visible };
  // colours
  const byColor = new Map();
  for (const m of viewer.models) {
    for (const [id, c] of m.elementColor) {
      const key = c.toString(16).padStart(6, '0').toUpperCase();
      if (!byColor.has(key)) byColor.set(key, []);
      const g = guidOf(m, id);
      if (g) byColor.get(key).push(g);
    }
  }
  vp.coloring = [...byColor].map(([color, guids]) => ({ color, guids }));
  // section planes: BCF direction points to the invisible (cut away) side
  for (const p of viewer.planes) {
    if (!p.enabled) continue;
    const loc = viewer.toIfc(p.plane.coplanarPoint(new THREE.Vector3()));
    const d = dirToIfc(viewer, p.plane.normal.clone().negate()).normalize();
    // a section with its 3D cut turned off (#39) is kept in saved views, not in BCF files
    vp.clipping.push({ loc: loc.toArray(), dir: d.toArray(), ...(p.cut3d === false ? { cut3d: false } : {}) });
  }
  // annotations in the view (#130): all of them for saved views; the arrows as BCF lines
  if (viewer.annotations) {
    vp.markup = viewer.annotations.toJSON();
    vp.lines = viewer.annotations.bcfLines();
  }
  return vp;
}

/**
 * Restores a viewpoint. ctx: {viewer, setSelection(Map), setSpacesVisible(bool), afterVisibility()}
 * Returns the number of referenced elements that were not found in the loaded models.
 */
export function applyViewpoint(vp, ctx) {
  const { viewer } = ctx;
  const idx = guidIndex(viewer.models);
  let missing = 0;
  const resolve = (guids) => {
    const out = new Map();
    for (const g of guids) {
      const hits = idx.get(g);
      if (!hits) { missing++; continue; }
      for (const { model, id } of hits) {
        if (!out.has(model)) out.set(model, []);
        out.get(model).push(id);
      }
    }
    return out;
  };
  // visibility
  const ex = resolve(vp.visibility?.exceptions || []);
  for (const m of viewer.models) {
    m.setVisible(true);
    if (vp.visibility?.defaultVisible === false) m.isolate(ex.get(m) || []);
    else { m.showAll({ includeSpaces: !!vp.visibility?.spacesVisible }); m.hide(ex.get(m) || []); }
    if (!vp.visibility?.spacesVisible) m.hide(m.spaceIds);
  }
  ctx.setSpacesVisible?.(!!vp.visibility?.spacesVisible);
  // colours
  const colorMaps = new Map(viewer.models.map((m) => [m, new Map()]));
  for (const c of vp.coloring || []) {
    const hex = c.color.length > 6 ? c.color.slice(-6) : c.color; // ARGB -> RGB
    const n = parseInt(hex, 16);
    for (const [m, ids] of resolve(c.guids)) for (const id of ids) colorMaps.get(m).set(id, n);
  }
  for (const [m, map] of colorMaps) m.setElementColors(map);
  // section planes
  viewer.clearPlanes();
  for (const cp of vp.clipping || []) {
    const point = viewer.fromIfc(...cp.loc);
    const n = dirFromIfc(viewer, ...cp.dir).normalize();
    // planes along an axis come back as plan / X / Y sections (they keep their name and slider)
    const axis = ['x', 'y', 'z'].find((k) => Math.abs(n.getComponent('xyz'.indexOf(k))) > 0.9999);
    let e;
    if (axis) {
      e = viewer.addPlane(axis, { point });
      if (e.plane.normal.dot(n) > 0) viewer.flipPlane(e); // BCF direction points to the removed side
    } else e = viewer.addPlane('custom', { normal: n, point });
    if (cp.cut3d === false) viewer.setPlaneCut(e, false);
  }
  // annotations (#130): a view saved with them puts them back (also none); lines of a BCF file from
  // another program become arrows. Older views without them leave the annotations as they are.
  if (viewer.annotations) {
    if (Array.isArray(vp.markup)) viewer.annotations.fromJSON(vp.markup);
    else if (vp.lines?.length) viewer.annotations.fromJSON(linesToMarkup(vp.lines));
  }
  // selection
  ctx.setSelection(resolve(vp.selection || []));
  ctx.afterVisibility?.();
  // camera
  if (vp.camera) {
    const pos = viewer.fromIfc(...vp.camera.pos);
    const dir = dirFromIfc(viewer, ...vp.camera.dir).normalize();
    const box = viewer.sceneBox();
    const center = box.isEmpty() ? pos.clone().add(dir) : box.getCenter(new THREE.Vector3());
    const dist = Math.max(1, center.clone().sub(pos).dot(dir));
    viewer.setOrthographic(!!vp.camera.ortho);
    if (vp.camera.ortho && vp.camera.scale) viewer.setOrthoHeight(vp.camera.scale);
    if (vp.camera.fov && !vp.camera.ortho) { viewer.perspCamera.fov = Math.min(100, Math.max(20, vp.camera.fov)); viewer.perspCamera.updateProjectionMatrix(); }
    viewer.flyTo(pos, pos.clone().addScaledVector(dir, dist));
  }
  return missing;
}

// ---------------------------------------------------------------------- XML
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const el = (name, value) => (value === undefined || value === null || value === '' ? '' : `<${name}>${esc(value)}</${name}>`);
const xyz = (name, v) => `<${name}><X>${v[0]}</X><Y>${v[1]}</Y><Z>${v[2]}</Z></${name}>`;
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n';

function viewpointXml(vp, version) {
  const comps = (guids) => guids.map((g) => `<Component IfcGuid="${esc(g)}"/>`).join('');
  const hints = `<ViewSetupHints SpacesVisible="${vp.visibility.spacesVisible}" SpaceBoundariesVisible="false" OpeningsVisible="false"/>`;
  const sel = vp.selection.length ? `<Selection>${comps(vp.selection)}</Selection>` : '';
  const vis = version === '3.0'
    ? `<Visibility DefaultVisibility="${vp.visibility.defaultVisible}">${hints}${vp.visibility.exceptions.length ? `<Exceptions>${comps(vp.visibility.exceptions)}</Exceptions>` : ''}</Visibility>`
    : `<Visibility DefaultVisibility="${vp.visibility.defaultVisible}">${vp.visibility.exceptions.length ? `<Exceptions>${comps(vp.visibility.exceptions)}</Exceptions>` : ''}</Visibility>`;
  const col = vp.coloring.length ? `<Coloring>${vp.coloring.filter((c) => c.guids.length).map((c) => (version === '3.0'
    ? `<Color Color="${c.color}"><Components>${comps(c.guids)}</Components></Color>`
    : `<Color Color="FF${c.color}">${comps(c.guids)}</Color>`)).join('')}</Coloring>` : '';
  const components = version === '3.0' ? `<Components>${sel}${vis}${col}</Components>` : `<Components>${hints}${sel}${vis}${col}</Components>`;
  const c = vp.camera;
  const camBody = `${xyz('CameraViewPoint', c.pos)}${xyz('CameraDirection', c.dir)}${xyz('CameraUpVector', c.up)}`;
  const aspect = version === '3.0' ? `<AspectRatio>${c.aspect || 1.5}</AspectRatio>` : '';
  const camera = c.ortho
    ? `<OrthogonalCamera>${camBody}<ViewToWorldScale>${c.scale}</ViewToWorldScale>${aspect}</OrthogonalCamera>`
    : `<PerspectiveCamera>${camBody}<FieldOfView>${c.fov}</FieldOfView>${aspect}</PerspectiveCamera>`;
  const clipping = vp.clipping.filter((p) => p.cut3d !== false);
  // lines (arrows, #130): numbers only – a view may come from a workspace file
  const num3 = (v) => (Array.isArray(v) && v.length >= 3 ? v.slice(0, 3).map(Number) : null);
  const okLines = (Array.isArray(vp.lines) ? vp.lines : []).map((l) => [num3(l?.start), num3(l?.end)]).filter(([a, b]) => a && b && [...a, ...b].every(Number.isFinite));
  const lines = okLines.length ? `<Lines>${okLines.map(([a, b]) => `<Line>${xyz('StartPoint', a)}${xyz('EndPoint', b)}</Line>`).join('')}</Lines>` : '';
  const clip = clipping.length ? `<ClippingPlanes>${clipping.map((p) => `<ClippingPlane>${xyz('Location', p.loc)}${xyz('Direction', p.dir)}</ClippingPlane>`).join('')}</ClippingPlanes>` : '';
  return `${XML_HEAD}<VisualizationInfo Guid="${vp.guid}">${components}${camera}${lines}${clip}</VisualizationInfo>`;
}

// ------------------------------------------------------------ annotations in BCF (#133)
// BCF has no notes or clouds with text: the snapshot shows them, the viewpoint's Lines carry their
// outlines, and Vispecta adds two things other programs pass over – a file with the annotations as
// they are (viewpoint-<guid>.vispecta.json, read back by Vispecta) and a comment with their texts.
const MARKUP_FILE_MAX = 5 * 1024 * 1024;

/** The GUID of the comment with the texts of a viewpoint's annotations: the same at every export. */
export function markupCommentGuid(vpGuid) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (const c of `vispecta-markup:${vpGuid}`) { h1 = Math.imul(h1 ^ c.charCodeAt(0), 16777619) >>> 0; h2 = Math.imul(h2 + c.charCodeAt(0), 2246822519) >>> 0; }
  const x = (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0') + (h1 ^ h2).toString(16).padStart(8, '0')).padEnd(32, '0');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-4${x.slice(13, 16)}-a${x.slice(17, 20)}-${x.slice(20, 32)}`;
}

/**
 * Lines of a BCF viewpoint from another program as annotations: lines that join end to start make one
 * freehand line; a line on its own becomes an arrow.
 */
export function linesToMarkup(lines) {
  const same = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-6;
  const out = [];
  let chain = null;
  const flush = () => {
    if (!chain) return;
    if (chain.length === 2) out.push({ p: chain[0], q: chain[1], text: '' });
    else out.push({ p: chain[0], kind: 'pen', pts: chain.slice(0, 4000), text: '' });
    chain = null;
  };
  for (const l of lines) {
    if (chain && same(chain.at(-1), l.start)) chain.push(l.end);
    else { flush(); chain = [l.start, l.end]; }
  }
  flush();
  return out;
}

/** The comment with the texts of the annotations of a viewpoint (null: none has a text). */
function markupComment(vp, topic, kindName) {
  const items = (vp.markup || []).map((m, i) => ({ i: i + 1, kind: m.kind || (m.q ? 'arrow' : 'note'), text: String(m.text || '').trim() })).filter((m) => m.text);
  if (!items.length) return null;
  return {
    guid: markupCommentGuid(vp.guid), date: topic.modified || topic.created || new Date().toISOString(), author: topic.modifiedAuthor || topic.author || 'Vispecta',
    text: items.map((m) => `${m.i}. ${kindName(m.kind)}: ${m.text}`).join('\n'), viewpoint: vp.guid,
  };
}

function markupXml(topic, files, version) {
  const f = files.map((x) => `<File IfcProject="${esc(x.project)}" ${version === '3.0' ? 'IsExternal' : 'isExternal'}="true">${el('Filename', x.name)}${el('Date', x.date)}</File>`).join('');
  const header = version === '3.0' ? `<Header><Files>${f}</Files></Header>` : `<Header>${f}</Header>`;
  const labels = version === '3.0'
    ? (topic.labels?.length ? `<Labels>${topic.labels.map((l) => el('Label', l)).join('')}</Labels>` : '')
    : (topic.labels || []).map((l) => el('Labels', l)).join('');
  const topicBody = `${el('Title', topic.title)}${el('Priority', topic.priority)}${labels}${el('CreationDate', topic.created)}${el('CreationAuthor', topic.author)}`
    + `${el('ModifiedDate', topic.modified)}${el('ModifiedAuthor', topic.modifiedAuthor)}${el('DueDate', topic.dueDate)}${el('AssignedTo', topic.assignedTo)}${el('Description', topic.description)}`;
  const comment = (c) => `<Comment Guid="${c.guid}">${el('Date', c.date)}${el('Author', c.author)}${el('Comment', c.text)}${c.viewpoint ? `<Viewpoint Guid="${c.viewpoint}"/>` : ''}${el('ModifiedDate', c.modified)}</Comment>`;
  const vpRef = (v) => (version === '3.0'
    ? `<ViewPoint Guid="${v.guid}"><Viewpoint>viewpoint-${v.guid}.bcfv</Viewpoint>${v.snapshot ? `<Snapshot>snapshot-${v.guid}.png</Snapshot>` : ''}</ViewPoint>`
    : `<Viewpoints Guid="${v.guid}"><Viewpoint>viewpoint-${v.guid}.bcfv</Viewpoint>${v.snapshot ? `<Snapshot>snapshot-${v.guid}.png</Snapshot>` : ''}</Viewpoints>`);
  const attrs = `Guid="${topic.guid}" TopicType="${esc(topic.type)}" TopicStatus="${esc(topic.status)}"`;
  if (version === '3.0') {
    return `${XML_HEAD}<Markup>${header}<Topic ${attrs}>${topicBody}`
      + `${topic.comments.length ? `<Comments>${topic.comments.map(comment).join('')}</Comments>` : ''}`
      + `${topic.viewpoints.length ? `<Viewpoints>${topic.viewpoints.map(vpRef).join('')}</Viewpoints>` : ''}</Topic></Markup>`;
  }
  return `${XML_HEAD}<Markup>${header}<Topic ${attrs}>${topicBody}</Topic>${topic.comments.map(comment).join('')}${topic.viewpoints.map(vpRef).join('')}</Markup>`;
}

/**
 * Builds a .bcfzip (Uint8Array). files: [{name, project (IfcProject GlobalId), date}]
 * opts.kindName(kind): the word for an annotation in the comment with their texts.
 */
export function exportBcf(topics, files, version = '2.1', projectName = 'Vispecta', { kindName = (k) => k } = {}) {
  const zip = {};
  zip['bcf.version'] = strToU8(`${XML_HEAD}<Version VersionId="${version}"${version === '2.1' ? ' xsi:noNamespaceSchemaLocation="version.xsd" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"' : ''}>${version === '2.1' ? '<DetailedVersion>2.1</DetailedVersion>' : ''}</Version>`);
  const projectId = uuid();
  zip['project.bcfp'] = strToU8(version === '2.1'
    ? `${XML_HEAD}<ProjectExtension><Project ProjectId="${projectId}">${el('Name', projectName)}</Project><ExtensionSchema></ExtensionSchema></ProjectExtension>`
    : `${XML_HEAD}<ProjectInfo><Project ProjectId="${projectId}">${el('Name', projectName)}</Project></ProjectInfo>`);
  if (version === '3.0') {
    const list = (tag, inner, items) => `<${tag}>${items.map((x) => el(inner, x)).join('')}</${tag}>`;
    const types = [...new Set([...TOPIC_TYPES, ...topics.map((x) => x.type)])];
    const statuses = [...new Set([...TOPIC_STATUSES, ...topics.map((x) => x.status)])];
    const prios = [...new Set([...PRIORITIES, ...topics.map((x) => x.priority).filter(Boolean)])];
    const labels = [...new Set(topics.flatMap((x) => x.labels || []))];
    zip['extensions.xml'] = strToU8(`${XML_HEAD}<Extensions>${list('TopicTypes', 'TopicType', types)}${list('TopicStatuses', 'TopicStatus', statuses)}${list('Priorities', 'Priority', prios)}${labels.length ? list('TopicLabels', 'TopicLabel', labels) : ''}</Extensions>`);
  }
  for (const topic of topics) {
    const dir = `${topic.guid}/`;
    // the comments with the texts of the annotations: made again from the annotations at every export
    const made = new Set(topic.viewpoints.map((v) => markupCommentGuid(v.guid)));
    const extra = topic.viewpoints.map((v) => markupComment(v, topic, kindName)).filter(Boolean);
    const comments = [...topic.comments.filter((c) => !made.has(c.guid)), ...extra];
    zip[`${dir}markup.bcf`] = strToU8(markupXml({ ...topic, comments }, files, version));
    for (const v of topic.viewpoints) {
      zip[`${dir}viewpoint-${v.guid}.bcfv`] = strToU8(viewpointXml(v, version));
      if (Array.isArray(v.markup) && v.markup.length) zip[`${dir}viewpoint-${v.guid}.vispecta.json`] = strToU8(JSON.stringify({ format: 'vispecta-markup', version: 1, markup: v.markup }));
      if (v.snapshot) zip[`${dir}snapshot-${v.guid}.png`] = [v.snapshot, { level: 0 }];
    }
  }
  return zipSync(zip, { level: 6 });
}

// ------------------------------------------------------------------- import
const kids = (node, name) => [...node.children].filter((c) => c.localName === name);
const kid = (node, name) => kids(node, name)[0] || null;
const txt = (node, name) => kid(node, name)?.textContent?.trim() ?? '';
const vec = (node) => (node ? ['X', 'Y', 'Z'].map((k) => Number(txt(node, k))) : null);

function parseViewpoint(xml, guid) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const root = doc.documentElement;
  const comps = (node) => (node ? [...node.getElementsByTagName('Component')].map((c) => c.getAttribute('IfcGuid')).filter(Boolean) : []);
  const components = kid(root, 'Components');
  const visNode = components ? kid(components, 'Visibility') : null;
  const hints = components ? (kid(components, 'ViewSetupHints') || (visNode && kid(visNode, 'ViewSetupHints'))) : null;
  const vp = {
    guid: root.getAttribute('Guid') || guid || uuid(),
    selection: components ? comps(kid(components, 'Selection')) : [],
    visibility: {
      defaultVisible: visNode ? visNode.getAttribute('DefaultVisibility') !== 'false' : true,
      exceptions: visNode ? comps(kid(visNode, 'Exceptions')) : [],
      spacesVisible: hints?.getAttribute('SpacesVisible') === 'true',
    },
    coloring: components && kid(components, 'Coloring')
      ? kids(kid(components, 'Coloring'), 'Color').map((c) => ({ color: (c.getAttribute('Color') || 'FF0000').toUpperCase(), guids: comps(c) })) : [],
    clipping: kid(root, 'ClippingPlanes') ? kids(kid(root, 'ClippingPlanes'), 'ClippingPlane').map((p) => ({ loc: vec(kid(p, 'Location')), dir: vec(kid(p, 'Direction')) })) : [],
    lines: kid(root, 'Lines') ? kids(kid(root, 'Lines'), 'Line').map((l) => ({ start: vec(kid(l, 'StartPoint')), end: vec(kid(l, 'EndPoint')) })).filter((l) => l.start && l.end && [...l.start, ...l.end].every(Number.isFinite)) : [],
    camera: null,
  };
  const pc = kid(root, 'PerspectiveCamera') || kid(root, 'OrthogonalCamera');
  if (pc) {
    vp.camera = {
      pos: vec(kid(pc, 'CameraViewPoint')), dir: vec(kid(pc, 'CameraDirection')), up: vec(kid(pc, 'CameraUpVector')),
      fov: Number(txt(pc, 'FieldOfView')) || 60, aspect: Number(txt(pc, 'AspectRatio')) || 1.5, ortho: pc.localName === 'OrthogonalCamera',
      scale: Number(txt(pc, 'ViewToWorldScale')) || null,
    };
  }
  return vp;
}

// Unpacking a .bcfzip: only the files BCF uses, and within limits, so a crafted archive (a "zip
// bomb": a small file that unpacks to gigabytes) cannot freeze or crash the page. The size each
// entry declares bounds what is unpacked (fflate writes into a buffer of that size).
const BCF_FILE = /(^|\/)(bcf\.version|[^/]+\.(bcf|bcfv|bcfp|png|jpe?g)|viewpoint-[^/]+\.vispecta\.json)$/i;
const BCF_MAX_FILE = 50 * 1024 * 1024, BCF_MAX_TOTAL = 500 * 1024 * 1024, BCF_MAX_FILES = 20000;

/** The entries of a .bcfzip that importBcf reads (exported for the tests). */
export function unzipBcf(bytes) {
  let total = 0, count = 0;
  return unzipSync(bytes, {
    filter: (f) => {
      if (!BCF_FILE.test(f.name)) return false;
      if (/\.vispecta\.json$/i.test(f.name) && f.originalSize > MARKUP_FILE_MAX) return false; // Vispecta's own annotations: small, else left out
      if (f.originalSize > BCF_MAX_FILE) throw new Error(`${f.name}: too large (${Math.round(f.originalSize / 1048576)} MB)`);
      total += f.originalSize;
      if (total > BCF_MAX_TOTAL || ++count > BCF_MAX_FILES) throw new Error('the BCF file unpacks to too much data');
      return true;
    },
  });
}

/** Reads a .bcfzip (2.0, 2.1 or 3.0). Returns {version, topics}. */
export function importBcf(bytes) {
  const files = unzipBcf(bytes);
  const read = (p) => (files[p] ? strFromU8(files[p]) : null);
  const vfile = read('bcf.version');
  const version = vfile ? new DOMParser().parseFromString(vfile, 'application/xml').documentElement.getAttribute('VersionId') : '2.1';
  const topics = [];
  for (const path of Object.keys(files)) {
    if (!path.endsWith('markup.bcf')) continue;
    const dir = path.slice(0, -'markup.bcf'.length);
    const doc = new DOMParser().parseFromString(read(path), 'application/xml');
    const root = doc.documentElement;
    const tn = kid(root, 'Topic');
    if (!tn) continue;
    const labels = [...tn.getElementsByTagName('Label')].map((x) => x.textContent.trim());
    for (const l of kids(tn, 'Labels')) if (!l.children.length && l.textContent.trim()) labels.push(l.textContent.trim());
    const topic = {
      guid: tn.getAttribute('Guid') || uuid(),
      type: tn.getAttribute('TopicType') || 'Issue',
      status: tn.getAttribute('TopicStatus') || 'Open',
      title: txt(tn, 'Title'), priority: txt(tn, 'Priority'), labels,
      created: txt(tn, 'CreationDate'), author: txt(tn, 'CreationAuthor'), modified: txt(tn, 'ModifiedDate'), modifiedAuthor: txt(tn, 'ModifiedAuthor'),
      dueDate: txt(tn, 'DueDate'), assignedTo: txt(tn, 'AssignedTo'), description: txt(tn, 'Description'),
      comments: [], viewpoints: [],
    };
    const commentNodes = [...kids(root, 'Comment'), ...(kid(tn, 'Comments') ? kids(kid(tn, 'Comments'), 'Comment') : [])];
    for (const c of commentNodes) {
      topic.comments.push({ guid: c.getAttribute('Guid') || uuid(), date: txt(c, 'Date'), author: txt(c, 'Author'), text: txt(c, 'Comment'), viewpoint: kid(c, 'Viewpoint')?.getAttribute('Guid') || null });
    }
    const vpNodes = [...kids(root, 'Viewpoints'), ...(kid(tn, 'Viewpoints') ? kids(kid(tn, 'Viewpoints'), 'ViewPoint') : [])];
    for (const v of vpNodes) {
      const file = txt(v, 'Viewpoint');
      const snap = txt(v, 'Snapshot');
      const xml = file ? read(dir + file) : null;
      if (!xml) continue;
      const vp = parseViewpoint(xml, v.getAttribute('Guid'));
      vp.guid = v.getAttribute('Guid') || vp.guid;
      if (snap && files[dir + snap]) vp.snapshot = files[dir + snap];
      // Vispecta's annotations of this viewpoint (#133): as they were; fromJSON checks every value
      const mk = read(`${dir}viewpoint-${vp.guid}.vispecta.json`);
      if (mk) {
        try {
          const j = JSON.parse(mk);
          if (j?.format === 'vispecta-markup' && Array.isArray(j.markup)) vp.markup = j.markup.slice(0, 1000);
        } catch { /* not ours, or broken: the lines are used */ }
      }
      topic.viewpoints.push(vp);
    }
    // BCF 2.0/2.1 without a Viewpoints element: default file names
    if (!topic.viewpoints.length && read(`${dir}viewpoint.bcfv`)) {
      const vp = parseViewpoint(read(`${dir}viewpoint.bcfv`));
      if (files[`${dir}snapshot.png`]) vp.snapshot = files[`${dir}snapshot.png`];
      topic.viewpoints.push(vp);
    }
    // the comments with the annotations' texts: made again at the next export
    const made = new Set(topic.viewpoints.filter((v) => Array.isArray(v.markup)).map((v) => markupCommentGuid(v.guid)));
    topic.comments = topic.comments.filter((c) => !made.has(c.guid));
    topics.push(topic);
  }
  topics.sort((a, b) => String(a.created).localeCompare(String(b.created)));
  return { version, topics };
}

/** PNG bytes from a canvas data URL. */
export function dataUrlBytes(url) {
  const b64 = url.split(',')[1];
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
