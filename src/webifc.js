// web-ifc, loaded the first time it is needed (code review, package C): it is 3.5 MB of JavaScript
// (382 KB compressed) that the start screen does not use. The main thread loads it when the first
// model is opened; the IFC worker loads its own copy.
//
// WebIFC stands for the module's exports (type codes such as WebIFC.IFCWALL, IfcAPI, LogLevel …)
// once loadWebIfc() has resolved. Using it earlier is a mistake in the code, and throws.
let mod = null;
let loading = null;

/** Loads web-ifc (once). Resolves to the module. */
export function loadWebIfc() {
  loading ||= import('web-ifc').then((m) => { mod = m; return m; });
  return loading;
}

export const WebIFC = new Proxy({}, {
  get(_, key) {
    if (!mod) throw new Error(`web-ifc is used before it is loaded (${String(key)})`);
    return mod[key];
  },
});
