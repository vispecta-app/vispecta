// Loading IFC files with web-ifc and formatting of IFC values.
import { WebIFC, loadWebIfc } from './webifc.js';
import wasmUrl from 'web-ifc/web-ifc.wasm?url';
import * as THREE from 'three';
import { IfcModel } from './model.js';
import { buildGeometry, OPEN_SETTINGS } from './ifc-geometry.js';
import { t } from './i18n.js';

let apiPromise = null;

/** Returnerer en initialiseret (delt) web-ifc API. */
export function getApi() {
  if (!apiPromise) {
    apiPromise = (async () => {
      await loadWebIfc(); // the first model: web-ifc is loaded now, not with the page
      fillPrettyNames();
      const api = new WebIFC.IfcAPI();
      // Single-thread: kræver ikke COOP/COEP-headere, så det virker på enhver statisk host.
      await api.Init(() => wasmUrl, true);
      api.SetLogLevel?.(WebIFC.LogLevel.LOG_LEVEL_OFF);
      return api;
    })();
  }
  return apiPromise;
}

// Typekode -> pænt klassenavn (IfcWallStandardCase i stedet for IFCWALLSTANDARDCASE).
// Filled when web-ifc is loaded; until then (no model open) a name is shown as it is.
const prettyNames = new Map();
function fillPrettyNames() {
  if (prettyNames.size) return;
  for (const ns of [WebIFC.IFC2X3, WebIFC.IFC4, WebIFC.IFC4X3]) {
    if (!ns) continue;
    for (const key of Object.keys(ns)) {
      if (key.startsWith('Ifc')) prettyNames.set(key.toUpperCase(), key);
    }
  }
}

export function prettyTypeName(api, typeCode) {
  const raw = api.GetNameFromTypeCode(typeCode) || String(typeCode);
  return prettyNames.get(String(raw).toUpperCase()) || raw;
}

export function prettyRawName(raw) {
  if (!raw) return '';
  return prettyNames.get(String(raw).toUpperCase()) || raw;
}

/**
 * Læser en IFC-fil og bygger et IfcModel med sammenflettet geometri.
 * @param {File|{name:string, data:Uint8Array}} file  a File or raw bytes with a name
 * @param {{ referenceMatrix?: THREE.Matrix4|null, onProgress?: (msg:string, frac:number)=>void }} opts
 */
export async function loadIfcFile(file, opts = {}) {
  const { onProgress = () => {} } = opts;
  // web-ifc on the main thread (loaded with the first model) while the worker builds the geometry
  const apiReady = getApi();
  apiReady.catch(() => {}); // (an error is thrown where it is awaited)

  const name = file.name;
  onProgress(t('load.reading', { name }), 0.05);
  // The source is kept as a File/Blob (read again only when needed), not as bytes in memory.
  const src = file.data ?? file; // {name, data: Uint8Array | Blob} or a File
  const sourceBlob = src instanceof Uint8Array ? new Blob([src]) : src;
  let data = src instanceof Uint8Array ? src : new Uint8Array(await src.arrayBuffer());
  const fileSize = data.byteLength;
  await nextFrame();

  // Is it an IFC (STEP) file at all, and is it complete? web-ifc opens anything: text gives a
  // cryptic error, and a file cut off halfway loads as a smaller model without a word.
  const ascii = (bytes) => String.fromCharCode(...bytes);
  if (!fileSize || !/ISO-10303-21\s*;/.test(ascii(data.subarray(0, 2048)))) throw new Error(t('err.notIfc'));
  const truncated = !/END-ISO-10303-21\s*;/.test(ascii(data.subarray(Math.max(0, fileSize - 2048))));

  // Geometry prepared earlier for exactly this file (project cache): skip the slow geometry step.
  const cache = opts.geometryCache || null;
  let cached = null;
  if (cache) {
    onProgress(t('load.cached', { name }), 0.15);
    try { cached = await cache.get(); } catch { cached = null; }
  }

  // The geometry in a worker (#58), so the page stays responsive: the worker gets the bytes, and
  // they are read again from the file for the main thread's own copy of the model afterwards (one
  // after the other, so the two copies are not in memory at the same time).
  let geo = null, geoFromWorker = false;
  if (!cached && opts.worker !== false && typeof Worker !== 'undefined') {
    try {
      const bytes = src instanceof Uint8Array ? data.slice() : data; // never detach the caller's buffer
      data = null;
      geo = await geometryInWorker(bytes, (frac, msg) => onProgress(msg || t('load.geometry', { name }), frac), name);
      geoFromWorker = true;
    } catch (e) {
      console.warn('IFC worker, geometry on the main thread instead', e);
      geo = null;
    }
    if (!data) data = src instanceof Uint8Array ? src : new Uint8Array(await sourceBlob.arrayBuffer());
  }

  onProgress(t(geo ? 'load.structure' : 'load.parsing', { name }), geo ? 0.8 : 0.15);
  await nextFrame();
  // MEMORY_LIMIT: web-ifc's default is 2 GB; large models (300 MB+ files) need more. 32-bit wasm allows up to 4 GB.
  const api = await apiReady;
  const modelID = api.OpenModel(data, OPEN_SETTINGS);
  data = null; // web-ifc has its own copy now
  if (modelID < 0) throw new Error(t('err.notIfc'));

  // Everything after OpenModel: on an error the model is closed again, or its memory in web-ifc
  // (up to a few GB for a large file) would stay taken until the page is reloaded.
  let model = null;
  try {
    const schema = api.GetModelSchema(modelID);
    let merged, spaceIds, coordMatrix;
    if (cached && cached.schema === schema) {
      ({ buckets: merged, spaceIds, coordMatrix } = cached);
    } else {
      cached = null; // nothing usable stored
      if (!geo) {
        // no worker: on the main thread, in batches with a pause between them for the progress bar
        onProgress(t('load.geometry', { name }), 0.3);
        await nextFrame();
        geo = await buildGeometry(api, modelID, {
          progress: (done, total) => onProgress(t('load.geometryN', { name, done: done.toLocaleString(), total: total.toLocaleString() }), 0.3 + 0.45 * (done / (total || 1))),
          pause: nextFrame,
        });
      }
      onProgress(t('load.building', { name }), 0.85);
      merged = geo.buckets.map((b) => ({ ...b, color: new THREE.Color(b.color[0], b.color[1], b.color[2]) }));
      spaceIds = new Set(geo.spaceIds);
      coordMatrix = new THREE.Matrix4().fromArray(geo.coordMatrix);
    }

    model = new IfcModel({ name, api, modelID, buckets: merged, schema, fileSize, coordMatrix, spaceIds, sourceBlob });
    model.fromCache = !!cached;
    model.geometrySource = cached ? 'cache' : geoFromWorker ? 'worker' : 'main'; // (#58)
    model.truncated = truncated; // the file has no END-ISO-10303-21: it was cut off, the model is incomplete

    onProgress(t('load.structure', { name }), 0.9);
    await nextFrame();
    await model.loadStructure(cached?.tree || null);
    // save geometry and structure for next time (in the background). The positions as loaded: a
    // coordinate conversion may have moved them in place by then (warpPositions keeps the originals
    // in positions0), and it is applied again when the model is opened from the cache.
    if (cache && !cached) {
      const m = model;
      setTimeout(() => cache.put({ buckets: m.buckets.map((b) => ({ ...b, positions: b.positions0 || b.positions })), spaceIds, coordMatrix, schema, tree: m.tree }), 1500);
    }
  } catch (e) {
    try { if (model) model.dispose(); else api.CloseModel(modelID); } catch { /* already closed */ }
    throw e;
  }

  onProgress(t('load.done'), 1);
  return model;
}

/** Opens the file in a worker and builds its geometry there (#58). onProgress(frac, message). */
function geometryInWorker(bytes, onProgress, name) {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./ifc-worker.js', import.meta.url), { type: 'module' });
    const end = () => w.terminate();
    w.onmessage = ({ data: d }) => {
      if (d.stage === 'parsing') onProgress(0.15, t('load.parsing', { name }));
      else if (d.stage === 'geometry') onProgress(0.3, t('load.geometry', { name }));
      else if (d.stage === 'picking') onProgress(0.75, t('load.building', { name }));
      else if (d.progress) {
        const [done, total] = d.progress;
        onProgress(0.3 + 0.45 * (done / (total || 1)), t('load.geometryN', { name, done: done.toLocaleString(), total: total.toLocaleString() }));
      } else if (d.done) { end(); resolve(d.done); }
      else if (d.error) { end(); reject(new Error(d.error)); }
    };
    w.onerror = (e) => { end(); reject(new Error(e.message || 'IFC worker failed')); };
    w.postMessage({ bytes }, [bytes.buffer]);
  });
}

/**
 * Gives the browser a moment to update the progress bar and handle input.
 * Not tied to requestAnimationFrame: that waits for a rendered frame (slow while a large model
 * is already in the scene) and is paused completely in a background tab.
 */
export function nextFrame() {
  return new Promise((r) => setTimeout(r, 0));
}

// ---------------------------------------------------------------------------
// Formattering af IFC-værdier

/** Gør en web-ifc værdi (fx {type:1, value:'Væg'}) læselig. */
export function fmtValue(val) {
  if (val === null || val === undefined) return '';
  if (Array.isArray(val)) return val.map(fmtValue).filter((s) => s !== '').join(', ');
  if (typeof val === 'object') {
    if ('_representationValue' in val) return fmtValue(val._representationValue);
    if ('value' in val) {
      let x = val.value;
      if (typeof x === 'string') x = decodeIfcString(x);
      if (typeof x === 'number') x = fmtNumber(x);
      if (val.type === 3 || x === 'T' || x === 'F') {
        // ENUM / BOOLEAN
        if (x === 'T' || x === true) return t('val.true');
        if (x === 'F' || x === false) return t('val.false');
        if (x === 'U') return t('val.unknown');
      }
      if (val.type === 5) return `#${x}`; // reference
      return String(x);
    }
    if ('expressID' in val) return `#${val.expressID}`;
    return '';
  }
  if (typeof val === 'number') return fmtNumber(val);
  if (typeof val === 'string') return decodeIfcString(val);
  return String(val);
}

function fmtNumber(n) {
  if (Number.isInteger(n)) return String(n);
  const abs = Math.abs(n);
  if (abs !== 0 && (abs < 1e-4 || abs >= 1e9)) return n.toExponential(4);
  return String(Math.round(n * 1e6) / 1e6);
}

/** Dekoder IFC STEP-escapes som \X2\00E6\X0\ (æ) og \S\x. */
export function decodeIfcString(s) {
  if (typeof s !== 'string' || !s.includes('\\')) return s;
  return s
    .replace(/\\X2\\([0-9A-Fa-f]+)\\X0\\/g, (_, hex) => {
      let out = '';
      for (let i = 0; i + 4 <= hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
      return out;
    })
    .replace(/\\X4\\([0-9A-Fa-f]+)\\X0\\/g, (_, hex) => {
      let out = '';
      for (let i = 0; i + 8 <= hex.length; i += 8) {
        const cp = parseInt(hex.slice(i, i + 8), 16);
        out += cp <= 0x10ffff ? String.fromCodePoint(cp) : '\uFFFD'; // a corrupt code point must not throw
      }
      return out;
    })
    .replace(/\\X\\([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\S\\(.)/g, (_, ch) => String.fromCharCode(ch.charCodeAt(0) + 128))
    .replace(/\\\\/g, '\\');
}
