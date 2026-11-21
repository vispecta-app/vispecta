// IFC geometry in a worker (#58): parsing a file and building its geometry is the slow part of
// opening a model, and on the main thread it froze the page (seconds for large files). Here the
// file is opened, its geometry merged by colour (ifc-geometry.js) and handed back without copying
// (transferable arrays); then the model is closed and the worker ends, so its memory goes too.
// The main thread opens the file afterwards for properties, structure and editing.
//
// The picking index (BVH) of every bucket is built here too (bvh.js), so the main thread does not
// stop for it.
//
// Message in: { bytes: Uint8Array }. Out: { stage }, { progress: [done, total] }*, then { done:
// {schema, buckets (each with bvh: {roots, indirect}), spaceIds, coordMatrix} } or { error }.
import wasmUrl from 'web-ifc/web-ifc.wasm?url';
import { loadWebIfc } from './webifc.js';
import { buildGeometry, OPEN_SETTINGS } from './ifc-geometry.js';
import { buildBvhData } from './bvh.js';

self.onmessage = async ({ data }) => {
  try {
    const WebIFC = await loadWebIfc();
    const api = new WebIFC.IfcAPI();
    await api.Init(() => wasmUrl, true);
    api.SetLogLevel?.(WebIFC.LogLevel.LOG_LEVEL_OFF);
    let bytes = data.bytes;
    self.postMessage({ stage: 'parsing' });
    const modelID = api.OpenModel(bytes, OPEN_SETTINGS);
    bytes = null;
    if (modelID < 0) throw new Error('not an IFC file');
    const schema = api.GetModelSchema(modelID);
    self.postMessage({ stage: 'geometry' });
    const g = await buildGeometry(api, modelID, { progress: (done, total) => self.postMessage({ progress: [done, total] }) });
    api.CloseModel(modelID);
    self.postMessage({ stage: 'picking' });
    for (const b of g.buckets) b.bvh = buildBvhData(b.positions, b.index);
    const transfer = [];
    for (const b of g.buckets) transfer.push(b.positions.buffer, b.normals.buffer, b.index.buffer, ...b.bvh.roots, b.bvh.indirect.buffer);
    self.postMessage({ done: { schema, ...g } }, transfer);
  } catch (e) {
    self.postMessage({ error: e?.message || String(e) });
  }
};
