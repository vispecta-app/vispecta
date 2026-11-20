// The core of the app (#63): DOM helpers, the viewer, the shared selection state, toasts, the
// loading bar and downloads. Every other part of the app may import from here; this module imports
// nothing of the app itself, so it can be loaded first.
import { Viewer } from '../viewer.js';
import { t } from '../i18n.js';

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

/**
 * Every dialog closes with ✕ in its top right corner (no Cancel / Close buttons). Esc closes too.
 * Called for all dialogs at start and by dialogs that rebuild their content (quantities).
 */
export function addCloseX(d) {
  if (d.querySelector(':scope > .dlg-x')) return;
  const b = document.createElement('button');
  b.className = 'icon-btn';
  b.textContent = '✕';
  b.dataset.i18nTitle = 'common.close';
  b.title = typeof t === 'function' ? t('common.close') : 'Close';
  b.setAttribute('aria-label', b.title);
  const f = document.createElement('form');
  f.method = 'dialog';
  f.className = 'dlg-x';
  f.append(b);
  d.prepend(f);
}
export const h = (tag, props = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'value') el.value = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
};

export const EYE = '<svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
export const EYE_OFF = '<svg viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7c1.6 0 3-.4 4.3-1"/></svg>';
export const PALETTE = ['#4e79a7', '#f28e2b', '#e15759', '#59a14f', '#b07aa1', '#edc948', '#76b7b2', '#ff9da7', '#9c755f', '#bab0ac'];

export const viewer = new Viewer($('#viewport'));

export const state = {
  selection: new Map(), // model -> Set(expressID)
  active: null, // {model, id}
  pickPlaneMode: false,
  spacesVisible: false,
  editMode: false,
  xray: false,
  storey: null, // {model, id} of the storey shown alone
  storeyCut: true, // plan section 1.2 m above the floor of that storey
  treeKeys: new Set(), // tree/class rows selected by the user (for highlighting group rows)
  lastTreeKey: null, // anchor for Shift+click range selection
};

export async function withLoading(fn) {
  const loading = $('#loading');
  loading.hidden = false;
  try { return await fn((msg, frac) => {
    $('#loading-text').textContent = msg;
    $('#loading-bar').style.width = `${Math.round(frac * 100)}%`;
  }); } finally { loading.hidden = true; viewer.invalidate(600); }
}

export function download(name, data, type = 'application/octet-stream') {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  h('a', { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function toast(msg, ok = false) {
  const el = h('div', { class: `toast${ok ? ' ok' : ''}`, text: msg });
  document.body.append(el);
  setTimeout(() => el.remove(), 6000);
}
