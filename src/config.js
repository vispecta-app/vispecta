// Where the Python runtime is loaded from. Everything runs in the browser.
//
// The built site serves the runtime itself (public/py, collected by scripts/fetch-python.mjs at
// build time): Pyodide, the packages IfcOpenShell needs, IfcOpenShell and ifctester. The app then
// contacts no other server for the Python features. Only a package that is not hosted, imported by
// a user's own script (e.g. pandas), is fetched from the Pyodide distribution on jsDelivr.
//
// Without public/py (e.g. `npm run dev` before `npm run fetch-python`), everything is loaded from
// jsDelivr, ifcopenshell.github.io and PyPI as a fallback.
//
// Override at runtime (e.g. an intranet mirror): localStorage.setItem('onlineifc.python', JSON.stringify({...})),
// with the keys pyodideBase, packages, wheels and idsWheels. Addresses must be https: or this site.
/* global __PY_SELF_HOSTED__ */
const SELF_HOSTED = typeof __PY_SELF_HOSTED__ !== 'undefined' && __PY_SELF_HOSTED__;
// Packages from the Pyodide distribution that IfcOpenShell needs
const PACKAGES = ['micropip', 'numpy', 'shapely', 'python-dateutil', 'typing-extensions', 'sqlite3'];
const IFCOS_WHEEL = 'ifcopenshell-0.8.5-cp313-cp313-pyodide_2025_0_wasm32.whl';

function defaults() {
  if (SELF_HOSTED) {
    const base = new URL('py/', document.baseURI).href;
    const wheel = (f) => `${base}wheels/${f}`;
    return {
      pyodideBase: `${base}pyodide/`,
      packages: PACKAGES,
      // IfcOpenShell's pure-Python dependencies first, so micropip finds everything installed
      wheels: [wheel('lark-1.3.1-py3-none-any.whl'), wheel('isodate-0.7.2-py3-none-any.whl'), wheel(IFCOS_WHEEL)],
      // Installed (without dependencies) the first time an IDS check runs. Must match the IfcOpenShell version.
      idsWheels: [wheel('ifctester-0.8.5-py3-none-any.whl'), wheel('xmlschema-4.3.2-py3-none-any.whl'), wheel('elementpath-5.1.4-py3-none-any.whl')],
    };
  }
  return {
    pyodideBase: 'https://cdn.jsdelivr.net/pyodide/v0.29.5/full/',
    packages: PACKAGES,
    wheels: [`https://ifcopenshell.github.io/wasm-wheels/${IFCOS_WHEEL}`],
    idsWheels: ['ifctester==0.8.5', 'xmlschema==4.3.2', 'elementpath==5.1.4'],
  };
}

// The override decides where code is loaded from (Python packages run in the Python worker), so it
// is checked: addresses must be https: or this site itself, package names plain names. Parts that
// do not pass are ignored (and named in the About dialog), and an override in use is shown there.
const OVERRIDE_KEY = 'onlineifc.python';
const NAME_RE = /^[A-Za-z0-9_.-]{1,100}$/;
const REQ_RE = /^[A-Za-z0-9_.-]{1,100}(\s*[=<>!~]=?\s*[A-Za-z0-9_.*+!-]{1,50})?$/; // e.g. ifctester==0.8.5
function okUrl(u) {
  if (typeof u !== 'string') return false;
  try {
    const url = new URL(u, document.baseURI);
    return url.protocol === 'https:' || url.origin === location.origin;
  } catch { return false; }
}
// a wheel: an address, or a requirement that micropip looks up
const okSpec = (x) => typeof x === 'string' && (/[/:]/.test(x) ? okUrl(x) : REQ_RE.test(x));
const CHECKS = {
  pyodideBase: okUrl,
  packages: (v) => Array.isArray(v) && v.every((x) => typeof x === 'string' && NAME_RE.test(x)),
  wheels: (v) => Array.isArray(v) && v.every(okSpec),
  idsWheels: (v) => Array.isArray(v) && v.every(okSpec),
};

/** The override in this browser: {values, ignored: [keys]} or null when there is none. */
function readOverride() {
  let raw;
  try { raw = JSON.parse(localStorage.getItem(OVERRIDE_KEY) || 'null'); } catch { return null; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const values = {}, ignored = [];
  for (const [k, v] of Object.entries(raw)) {
    if (Object.hasOwn(CHECKS, k) && CHECKS[k](v)) values[k] = v;
    else ignored.push(k);
  }
  if (ignored.length) console.warn(`Python override: ignored ${ignored.join(', ')} (addresses must be https: or this site)`);
  return { values, ignored };
}

export function getPythonConfig() {
  return { ...defaults(), ...(readOverride()?.values || {}) };
}

/** For the About dialog: {used: [keys], from: [hosts], ignored: [keys]} when an override is set, else null. */
export function pythonOverride() {
  const o = readOverride();
  if (!o) return null;
  const urls = [o.values.pyodideBase, ...(o.values.wheels || []), ...(o.values.idsWheels || [])].filter((x) => typeof x === 'string' && /[/:]/.test(x));
  const from = [...new Set(urls.map((u) => { try { return new URL(u, document.baseURI).host; } catch { return ''; } }).filter(Boolean))];
  return { used: Object.keys(o.values), from, ignored: o.ignored };
}
