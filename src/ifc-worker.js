// IFC geometry in a worker (#58): parsing a file and building its geometry is the slow part of
// opening a model, and on the main thread it froze the page (seconds for large files). Here the
// file is opened, its geometry merged by colour (ifc-geometry.js) and handed back without copying
// (transferable arrays); then the model is closed and the worker ends, so its memory goes too.
// The main thread opens the file afterwards for properties, structure and editing.
//
// Message in: { bytes: Uint8Array }. Out: { progress: [done, total] }*, then { done: {schema,
// buckets, spaceIds, coordMatrix} } or { error }.
import * as WebIFC from 'web-ifc';
import wasmUrl from 'web-ifc/web-ifc.wasm?url';
import { buildGeometry, OPEN_SETTINGS } from './ifc-geometry.js';

self.onmessage = async ({ data }) => {
  try {
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
    const transfer = [];
    for (const b of g.buckets) transfer.push(b.positions.buffer, b.normals.buffer, b.index.buffer);
    self.postMessage({ done: { schema, ...g } }, transfer);
  } catch (e) {
    self.postMessage({ error: e?.message || String(e) });
  }
};
