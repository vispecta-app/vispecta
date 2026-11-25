// National rules (settings): which country's standards the app offers – for now the Danish
// structure gauges of BN1-166-1. 'all' shows every country's, 'none' only what is your own.
import { getLang } from '../i18n.js';

const KEY = 'vispecta.region';
export const REGIONS = ['dk', 'all', 'none'];

/** The standards by country: shown when the region is that country, or 'all'. */
export const STANDARDS = [
  { country: 'dk', id: 'BN1-166-1', kind: 'gauge' },
];

export function getRegion() {
  let r = null;
  try { r = localStorage.getItem(KEY); } catch { /* ignore */ }
  if (REGIONS.includes(r)) return r;
  // not chosen yet: Danish when the app or the browser is Danish
  const langs = [getLang(), ...(navigator.languages || [navigator.language || ''])];
  return langs.some((l) => /^da\b/i.test(l || '')) ? 'dk' : 'none';
}

export function setRegion(r) {
  if (!REGIONS.includes(r)) return;
  try { localStorage.setItem(KEY, r); } catch { /* ignore */ }
}

/** The standards of a kind the chosen region shows. */
export function standardsFor(kind) {
  const r = getRegion();
  return STANDARDS.filter((s) => s.kind === kind && (r === 'all' || s.country === r));
}
