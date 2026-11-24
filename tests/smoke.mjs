// Smoke test (#57): opens the built site (dist/) in headless Chromium and goes through the main paths.
// Fails on a page error, a console error or an unexpected result. About a minute.
//
//   npm run build:app && npm run test:smoke
//
// Needs Chromium for Playwright: `npx playwright install chromium` (CI: `--with-deps`).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { writeArrayBuffer } from 'geotiff';
import proj4 from 'proj4';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm',
  '.txt': 'text/plain', '.xml': 'application/xml', '.ico': 'image/x-icon', '.ifc': 'application/x-step', '.laz': 'application/octet-stream' };

// a static server like GitHub Pages: files, directory index, 404.html for anything else
function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = path.join(DIST, p);
    if (!f.startsWith(DIST)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    let status = 200;
    if (!fs.existsSync(f)) { f = path.join(DIST, '404.html'); status = 404; }
    res.writeHead(status, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const results = [];
let failed = false;
function check(name, ok, detail = '') {
  results.push(`${ok ? '✓' : '✗'} ${name}${detail ? ` – ${detail}` : ''}`);
  console.log(results.at(-1));
  if (!ok) failed = true;
}

async function newPage(browser, base, errors) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  // keep every toast message, also the ones that are gone again
  await page.addInitScript(() => {
    window.__toasts = [];
    new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.classList?.contains('toast')) window.__toasts.push(n.textContent); })
      .observe(document, { childList: true, subtree: true });
    try { localStorage.setItem('onlineifc.lang', 'en'); } catch { /* ignore */ }
  });
  await page.goto(`${base}/?app`);
  await page.waitForFunction(() => window.onlineIfc?.viewer);
  return page;
}
const idle = (page) => page.waitForFunction(() => document.querySelector('#loading')?.hidden !== false);
const toasts = (page) => page.evaluate(() => window.__toasts.slice());

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('dist/ is missing – run `npm run build:app` first');
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  const t0 = Date.now();
  try {
    // ---------------------------------------------------------------- languages: every text in every language
    // (checked here in Node: the language files are plain modules; a key missing in Hindi falls back to English)
    const { _dicts } = await import('../src/i18n.js');
    const en = _dicts.en;
    const marks = (s, re) => (String(s).match(re) || []).sort().join(' ');
    const vars = { n: 2, w: 10, h: 20, c: 2, p: 5, f: 8, crs: 'EPSG:25832', cut: 1, fill: 2, net: 1, area: 3, ex: 'a', de: 'b', g: 1 };
    const langs = [];
    let complete = true;
    for (const l of ['da', 'de', 'sv', 'nb', 'nl', 'fr', 'es', 'hi']) {
      const d = (await import(`../src/i18n/${l}.js`)).default;
      const missing = Object.keys(en).filter((k) => !(k in d));
      const bad = Object.entries(d).filter(([k, v]) => !(k in en) || (typeof v === 'function') !== (typeof en[k] === 'function')
        || (typeof v === 'function' ? typeof v(vars) !== 'string' || v(vars).includes('undefined')
          : marks(v, /\{\w+\}/g) !== marks(en[k], /\{\w+\}/g) || marks(v, /<[^>]+>/g) !== marks(en[k], /<[^>]+>/g))).map(([k]) => k);
      if (bad.length || (missing.length && l !== 'hi')) complete = false;
      langs.push(`${l} ${Object.keys(d).length - bad.length}/${Object.keys(en).length}${bad.length ? ` (wrong: ${bad.slice(0, 3).join(', ')})` : ''}`);
    }
    check('translations: every key, the same {placeholders} and HTML as English', complete, langs.join(' · '));

    // ---------------------------------------------------------------- sample scene
    const page = await newPage(browser, base, errors);
    // web-ifc (3.5 MB of JavaScript) is loaded with the first model, not with the start screen (code review, C)
    await page.waitForTimeout(500);
    const startJs = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name.split('/').pop()).filter((n) => /\.js$/.test(n)));
    check('start screen without web-ifc', startJs.length > 0 && !startJs.some((n) => /web-ifc/.test(n)), startJs.join(', '));
    // the other languages are a small file each, loaded when chosen
    await page.selectOption('#lang-select', 'sv');
    await page.waitForFunction(() => document.documentElement.lang === 'sv');
    const svLang = await page.evaluate(() => ({
      open: document.querySelector('[data-i18n="tb.open"]').textContent,
      files: performance.getEntriesByType('resource').map((e) => e.name.split('/').pop()).filter((n) => /^(da|de|hi|sv|nb|nl|fr|es)-[\w-]+\.js$/.test(n)),
    }));
    await page.selectOption('#lang-select', 'en');
    await page.waitForFunction(() => document.documentElement.lang === 'en');
    const backEn = await page.evaluate(() => document.querySelector('[data-i18n="tb.open"]').textContent);
    check('language: Swedish loaded when chosen (not before), and back to English',
      !startJs.some((n) => /^(da|de|hi|sv|nb|nl|fr|es)-/.test(n)) && svLang.open === 'Öppna IFC' && svLang.files.length === 1 && /^sv-/.test(svLang.files[0]) && backEn === 'Open IFC',
      JSON.stringify({ ...svLang, backEn }));
    await page.click('[data-sample="scene"]');
    await page.waitForFunction(() => window.onlineIfc.viewer.models.length === 11, null, { timeout: 180000 });
    await idle(page);
    const info = await page.evaluate(() => ({
      models: window.onlineIfc.viewer.models.length,
      elements: window.onlineIfc.viewer.models.reduce((n, m) => n + m.elementIds.size, 0),
      alignments: window.onlineIfc.viewer.models.flatMap((m) => m.alignments || []).map((a) => a.name),
      sources: [...new Set(window.onlineIfc.viewer.models.map((m) => m.geometrySource))].join(','),
    }));
    check('sample scene: 11 models', info.models === 11, `${info.elements} elements`);
    check('IFC geometry built in a worker (#58)', /worker|cache/.test(info.sources) && !/main/.test(info.sources), info.sources);
    check('sample scene: alignments Track and Road', info.alignments.includes('Track') && info.alignments.includes('Road'), info.alignments.join(', '));
    // the picking index (BVH) comes from the IFC worker, and picks exactly like three.js without one
    const bvh = await page.evaluate(() => {
      const v = window.onlineIfc.viewer, rect = v.renderer.domElement.getBoundingClientRect();
      let buckets = 0, fromWorker = 0;
      for (const m of v.models) for (const b of m.buckets) { buckets++; if (b.bvh) fromWorker++; }
      let same = 0, hits = 0, n = 0;
      for (let i = 0; i < 20; i++) for (let j = 0; j < 15; j++) {
        const x = rect.left + (i + 0.5) * rect.width / 20, y = rect.top + (j + 0.5) * rect.height / 15;
        const h = v.pick(x, y);
        v.raycaster.setFromCamera({ x: ((x - rect.left) / rect.width) * 2 - 1, y: -((y - rect.top) / rect.height) * 2 + 1 }, v.camera);
        const meshes = []; for (const m of v.models) if (m.visible) for (const b of m.buckets) if (b.mesh.visible) meshes.push(b.mesh);
        const r = v.raycaster.intersectObjects(meshes, false)[0];
        const key = (p) => (p ? p.toArray().map((q) => q.toFixed(4)).join(',') : '-');
        n++; if (h) hits++;
        if (key(h?.point) === key(r?.point)) same++;
      }
      return { buckets, fromWorker, n, hits, same };
    });
    check('picking index (BVH) built in the IFC worker, picks like three.js', bvh.fromWorker === bvh.buckets && bvh.hits > 20 && bvh.same === bvh.n, JSON.stringify(bvh));

    // ---------------------------------------------------------------- station section on Track, section window, SVG
    await page.evaluate(() => document.querySelector('[data-action="plane-station"]').click());
    await page.waitForSelector('.plane-row.station select');
    await page.evaluate(() => {
      const sel = document.querySelector('.plane-row.station select');
      const o = [...sel.options].find((x) => /Track/.test(x.textContent));
      sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(800);
    const sv = await page.evaluate(() => {
      const el = document.querySelector('.secview');
      return { open: !!el && el.offsetParent !== null, paths: el ? el.querySelectorAll('svg path, svg polygon, svg polyline').length : 0 };
    });
    check('section window opens for a station section', sv.open, `${sv.paths} shapes`);
    check('section window draws the cut', sv.paths > 0);
    // the key plan shows the models seen from above (an image), not only their outlines
    await page.waitForSelector('.secview .sv-key image', { timeout: 20000 }).catch(() => {});
    const kp = await page.evaluate(() => {
      const img = document.querySelector('.secview .sv-key image');
      return { image: !!img, bytes: img?.getAttribute('href')?.length || 0, boxes: document.querySelectorAll('.secview .sv-key .kp-box').length };
    });
    check('key plan of the section shows the model from above', kp.image && kp.bytes > 5000 && kp.boxes === 0, JSON.stringify(kp));
    await page.evaluate(() => [...document.querySelectorAll('.plane-row button')].find((b) => b.textContent.trim() === '2D').click());
    await page.waitForSelector('#drawing-dialog[open]');
    await page.selectOption('#drw-format', 'svg');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => document.querySelector('[data-action="drawing-run"]').click())]);
    const svg = fs.readFileSync(await dl.path(), 'utf8');
    check('SVG drawing of the section', svg.includes('<svg') && svg.length > 2000, `${svg.length} bytes`);
    await page.keyboard.press('Escape');

    // ---------------------------------------------------------------- point cloud (XYZ made here)
    const lines = [];
    for (let i = 0; i < 2000; i++) lines.push(`${(i % 50) * 0.5} ${Math.floor(i / 50) * 0.5} ${Math.sin(i) * 0.2}`);
    await page.setInputFiles('#file-input', { name: 'smoke.xyz', mimeType: 'text/plain', buffer: Buffer.from(lines.join('\n')) });
    await page.waitForFunction(() => window.onlineIfc.viewer.clouds.length === 1);
    await idle(page);
    check('point cloud (XYZ) loads', await page.evaluate(() => window.onlineIfc.viewer.clouds[0].count) === 2000);

    // ---------------------------------------------------------------- tabs
    for (const tab of ['tree', 'classes', 'filters', 'issues', 'views', 'models']) {
      await page.click(`.tab[data-tab="${tab}"]`);
      await page.waitForTimeout(250);
    }
    check('tabs open (structure, classes, filters, issues, views)', true);

    // ---------------------------------------------------------------- property index for filters (#61)
    await page.click('.tab[data-tab="filters"]');
    await page.evaluate(() => [...document.querySelectorAll('#tab-filters button')].find((b) => b.classList.contains('primary'))?.click());
    await page.waitForFunction(() => document.querySelector('#tab-filters select'), null, { timeout: 120000 });
    const pidx = await page.evaluate(() => {
      const v = window.onlineIfc.viewer;
      let n = 0, ok = true;
      for (const m of v.models) {
        if (!m._pindex) return { ok: false, n };
        for (const [id, o] of m._pindex.data) {
          const q = m.computeQuantities(id), vol = o['calc:volume'];
          if (q && vol !== Math.round(q.volume * 1000) / 1000) ok = false;
          if (Object.keys(o).some((k) => k.startsWith('calc:'))) ok = false; // worked out when read, not stored
          n++;
        }
      }
      return { ok, n };
    });
    check('filters: property index with quantities worked out when read', pidx.ok && pidx.n > 300, `${pidx.n} elements`);
    // the Filters tab has the selection bar too: what the filter selected is counted there, and cleared with one click
    await page.evaluate(() => { const v = document.querySelector('#filters .rule input'); v.value = 'IfcSlab'; v.dispatchEvent(new Event('input')); });
    await page.waitForTimeout(300);
    await page.evaluate(() => [...document.querySelectorAll('#filters .flt-btns .btn.primary')].at(-1).click());
    const fsel = await page.evaluate(() => ({ count: document.querySelector('#tab-filters .sel-count').textContent, clear: getComputedStyle(document.querySelector('#tab-filters .sel-clear')).display !== 'none' }));
    await page.click('#tab-filters .sel-clear');
    const fclr = await page.evaluate(() => ({ n: [...window.onlineIfc.state.selection.values()].reduce((a, q) => a + q.size, 0), count: document.querySelector('#tab-filters .sel-count').textContent, clear: getComputedStyle(document.querySelector('#tab-filters .sel-clear')).display !== 'none' }));
    check('filters: the selection is shown and cleared in the tab itself', /^\d+ selected$/.test(fsel.count) && fsel.clear && fclr.n === 0 && fclr.count === 'Nothing selected' && !fclr.clear, `${fsel.count} → ${fclr.count}`);
    // ---------------------------------------------------------------- accessibility (#62): axe-core, WCAG 2.2 A/AA
    await page.click('.tab[data-tab="models"]');
    // evaluated by the test driver, not as a <script>: the page's Content Security Policy (#64) allows no inline scripts
    await page.evaluate(fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8'));
    const axe = await page.evaluate(async () => {
      const res = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
      return res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0].target.join(' ')}`);
    });
    check('accessibility: no serious WCAG 2.2 AA violations (axe-core)', axe.length === 0, axe.slice(0, 3).join(' | '));
    // the menus and tabs by keyboard
    await page.focus('.menu-btn[data-menu="view"]');
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'menuitem');
    await page.keyboard.press('Escape');
    await page.focus('.tab[data-tab="models"]');
    await page.keyboard.press('ArrowRight');
    const kb = await page.evaluate(() => ({ menu: document.querySelector('.menu-btn[data-menu="view"]').getAttribute('aria-expanded'), tab: document.activeElement.dataset.tab, sel: document.activeElement.getAttribute('aria-selected') }));
    check('menus and tabs work with the keyboard', kb.menu === 'false' && kb.tab === 'tree' && kb.sel === 'true', JSON.stringify(kb));
    await page.click('.tab[data-tab="models"]');

    // ---------------------------------------------------------------- bad files (#54)
    const bridge = fs.readFileSync(path.join(DIST, 'samples/simple-scene/Infra-Bridge.ifc'));
    const before = (await toasts(page)).length;
    await page.setInputFiles('#file-input', [
      { name: 'empty.ifc', mimeType: 'application/x-step', buffer: Buffer.alloc(0) },
      { name: 'notes.ifc', mimeType: 'application/x-step', buffer: Buffer.from('These are my notes, not a model.\n') },
      { name: 'cut-off.ifc', mimeType: 'application/x-step', buffer: bridge.subarray(0, Math.floor(bridge.length * 0.6)) },
    ]);
    await idle(page);
    await page.waitForTimeout(500);
    const msgs = (await toasts(page)).slice(before);
    check('empty file: a clear message', msgs.some((m) => /empty\.ifc/.test(m) && /not an IFC file/i.test(m)), msgs.find((m) => /empty\.ifc/.test(m)) || 'no message');
    check('text file: a clear message', msgs.some((m) => /notes\.ifc/.test(m) && /not an IFC file/i.test(m)), msgs.find((m) => /notes\.ifc/.test(m)) || 'no message');
    check('cut-off IFC: reported as incomplete', msgs.some((m) => /cut-off\.ifc/.test(m) && /incomplete/i.test(m)), msgs.find((m) => /cut-off\.ifc/.test(m)) || 'no message');

    // ---------------------------------------------------------------- GPU uploads (code review): colours and selection
    // Fades and highlights borrow the vertex buffers of their bucket; freeing them must not make the
    // bucket upload its vertices again. Uploads of the buckets' own vertex arrays are counted.
    const gpu = await page.evaluate(async () => {
      const v = window.onlineIfc.viewer;
      const gl = v.renderer.getContext();
      const mine = new Set();
      for (const m of v.models) for (const b of m.buckets) { mine.add(b.positions); mine.add(b.normals); }
      let bytes = 0;
      const orig = gl.bufferData;
      gl.bufferData = function (target, data, ...rest) { if (mine.has(data)) bytes += data.byteLength; return orig.call(this, target, data, ...rest); };
      const frame = () => new Promise((r) => { v.renderFrame(); setTimeout(r, 50); });
      const m = [...v.models].sort((a, b) => b.elementIds.size - a.elementIds.size)[0];
      const ids = [...m.elementIds];
      const out = {};
      for (const round of [0, 1, 2]) {
        m.setElementColors(new Map(ids.filter((_, i) => i % 3 === 0).map((id) => [id, round % 2 ? 0x3366cc : 0xcc3333])));
        await frame();
        if (round === 0) bytes = 0; // the first round may draw new meshes; then nothing more
      }
      out.colours = bytes;
      bytes = 0;
      for (const id of ids.slice(0, 5)) { m.setSelection([id], v.highlightMaterial); await frame(); }
      out.selection = bytes;
      m.setSelection([], null); m.setElementColors(new Map()); await frame();
      gl.bufferData = orig;
      return out;
    });
    check('colours and selection do not upload the vertex buffers again', gpu.colours === 0 && gpu.selection === 0, `colours ${gpu.colours} B, selection ${gpu.selection} B`);
    // the depth shading target (EDL) is freed when it is not used
    const edl = await page.evaluate(() => {
      const v = window.onlineIfc.viewer, was = v.edl;
      v.edl = true; v.renderFrame(); const on = !!v._edl;
      const tex = v._edl?.target.texture;
      const format = `${tex?.type === 1009 ? 'uint8' : tex?.type}/${tex?.colorSpace}`; // UnsignedByteType, sRGB
      v.edl = false; v.renderFrame(); const off = !v._edl;
      v.edl = was;
      return { on, off, format };
    });
    check('EDL render target: 8-bit sRGB, freed when depth shading is off', edl.on && edl.off && edl.format === 'uint8/srgb', JSON.stringify(edl));
    // an idle view is not drawn again and again – also in the tail of the controls' damping after a
    // turn, which shrinks by 15 % a frame but never quite reaches 0 (compared exactly, that drew the
    // view without end) – and a change without any input, or a move of a pixel, still is drawn
    const redraw = await page.evaluate(async () => {
      const v = window.onlineIfc.viewer, orig = v.renderFrame.bind(v);
      let n = 0;
      v.renderFrame = (...a) => { if (!a.length) n++; return orig(...a); }; // frames of the render loop (not pictures for autosave)
      await new Promise((r) => setTimeout(r, 1500)); // settle
      // a turn too small to see (1e-9 rad) left in the damping (OrbitControls' own state)
      v.controls._sphericalDelta.theta = 1e-9;
      await new Promise((r) => setTimeout(r, 250));
      n = 0;
      await new Promise((r) => setTimeout(r, 3000));
      const idle = n;
      n = 0;
      const m = v.models[0];
      m.setColor(0xff0000); // no input event: the model asks for the frame itself
      await new Promise((r) => setTimeout(r, 300));
      const changed = n;
      m.setColor(null);
      // a camera moved by about a pixel is drawn again (a thousandth of its distance to the target)
      await new Promise((r) => setTimeout(r, 300));
      n = 0;
      const px = v.camera.position.distanceTo(v.controls.target) * 1e-3;
      v.camera.position.x += px; v.controls.target.x += px;
      await new Promise((r) => setTimeout(r, 300));
      const nudged = n;
      v.renderFrame = orig;
      return { idle, changed, nudged };
    });
    // (at most the safety-net frame, every 5 s; it was one every 0.5 s, and in the damping tail every frame)
    check('idle view not redrawn, also in the tail of the damping; a change and a move of a pixel still are', redraw.idle <= 1 && redraw.changed > 0 && redraw.nudged > 0, JSON.stringify(redraw));
    // the section planes as see-through sheets: off by default, remembered when turned on
    const helpers = await page.evaluate(() => {
      const v = window.onlineIfc.viewer, cb = document.querySelector('#plane-helpers');
      const before = { box: cb.checked, viewer: v.showPlaneHelpers };
      const e = v.addPlane('x');
      const hidden = !e.helper.visible;
      v.setPlaneHighlight(e); const pointed = e.helper.visible; v.setPlaneHighlight(null);
      cb.checked = true; cb.dispatchEvent(new Event('change'));
      const on = e.helper.visible, stored = localStorage.getItem('onlineifc.planeHelpers');
      cb.checked = false; cb.dispatchEvent(new Event('change'));
      v.removePlane(e);
      return { ...before, hidden, pointed, on, stored, after: localStorage.getItem('onlineifc.planeHelpers') };
    });
    check('section planes not shown as sheets by default; the one pointed at is; the choice is remembered',
      !helpers.box && !helpers.viewer && helpers.hidden && helpers.pointed && helpers.on && helpers.stored === '1' && helpers.after === '0', JSON.stringify(helpers));
    // the Python runtime override (localStorage): only https: or this site, and shown in the About dialog
    const about = async () => {
      await page.evaluate(() => document.querySelector('[data-action="about"]').click());
      await page.waitForSelector('#about-dialog[open]');
      const text = await page.evaluate(() => document.querySelector('#about-version').textContent);
      await page.evaluate(() => document.querySelector('#about-dialog').close());
      return text;
    };
    await page.evaluate(() => localStorage.setItem('onlineifc.python', JSON.stringify({ pyodideBase: 'http://mirror.example.com/pyodide/', packages: ['numpy', 'x; import os'] })));
    const pyBad = await about();
    await page.evaluate(() => localStorage.setItem('onlineifc.python', JSON.stringify({ pyodideBase: 'https://mirror.example.com/pyodide/' })));
    const pyOk = await about();
    await page.evaluate(() => localStorage.removeItem('onlineifc.python'));
    const pyNone = await about();
    check('Python override: http: and odd package names ignored, an override shown', /ignored \(pyodideBase, packages\)/.test(pyBad) && /another source.*mirror\.example\.com/.test(pyOk) && !/override/i.test(pyNone), `${pyBad.slice(-120)} | ${pyOk.slice(-80)}`);

    // ---------------------------------------------------------------- BCF and workspace files from others (code review)
    const { zipSync, strToU8 } = await import('fflate');
    const markup = (title) => strToU8(`<?xml version="1.0" encoding="UTF-8"?><Markup><Topic Guid="0b6c8e7a-0000-4000-8000-00000000000${title.length % 10}" TopicType="Issue" TopicStatus="Open"><Title>${title}</Title><CreationDate>2026-01-01T00:00:00Z</CreationDate><CreationAuthor>smoke</CreationAuthor></Topic></Markup>`);
    const version = strToU8('<?xml version="1.0"?><Version VersionId="2.1"/>');
    const zeros = (mb) => new Uint8Array(mb * 1024 * 1024);
    const bcfOk = zipSync({ 'bcf.version': version, 'a/markup.bcf': markup('Smoke BCF'), 'a/unused.bin': [zeros(80), { level: 9 }] });
    const bcfBomb = zipSync({ 'bcf.version': version, 'b/markup.bcf': markup('Bomb'), 'b/snapshot.png': [zeros(60), { level: 9 }] });
    const tBcf = (await toasts(page)).length;
    await page.setInputFiles('#file-input', { name: 'ok.bcfzip', mimeType: 'application/zip', buffer: Buffer.from(bcfOk) });
    await page.waitForTimeout(800);
    await page.setInputFiles('#file-input', { name: 'bomb.bcfzip', mimeType: 'application/zip', buffer: Buffer.from(bcfBomb) });
    await page.waitForTimeout(800);
    const bcfMsgs = (await toasts(page)).slice(tBcf);
    const bcfTopics = await page.evaluate(() => window.onlineIfc.views.ctx.issues.topics.map((x) => x.title));
    check('BCF: other files in the archive are not unpacked', bcfTopics.includes('Smoke BCF'), bcfTopics.join(', '));
    check('BCF: an entry that unpacks to too much is refused', !bcfTopics.includes('Bomb') && bcfMsgs.some((m) => /too large/i.test(m)), bcfMsgs.at(-1) || 'no message');
    const wsBad = {
      app: 'Vispecta', format: 'workspace', version: 1,
      views: [{ id: 'smoke-v1', name: 'From a file', viewpoint: {}, thumb: 'javascript:alert(1)' }, { id: 5 }, 'junk', { id: 'smoke-v2', name: 'No viewpoint' }],
      issues: [{ guid: 'smoke-ws-1', title: 'From a workspace', viewpoints: [{ _url: 'javascript:alert(1)', snapshot: '!!not base64' }] }, 'junk', { title: 'no guid' }],
      clouds: {}, models: 'x',
    };
    await page.setInputFiles('#file-input', { name: 'other.vispecta.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(wsBad)) });
    await page.waitForTimeout(800);
    await page.click('.tab[data-tab="issues"]');
    await page.waitForTimeout(300);
    const ws = await page.evaluate(() => {
      const vs = window.onlineIfc.views, tp = vs.ctx.issues.topics.find((x) => x.guid === 'smoke-ws-1');
      return {
        views: vs.views.filter((x) => String(x.id).startsWith('smoke') || x.id === 5).map((x) => `${x.id}:${x.thumb}`),
        topic: !!tp, url: tp?.viewpoints[0]?._url ?? null, snap: tp?.viewpoints[0]?.snapshot ?? null,
        js: [...document.querySelectorAll('img')].some((i) => i.getAttribute('src')?.startsWith('javascript:')),
      };
    });
    check('workspace from a file: only well-formed parts are taken', ws.views.join() === 'smoke-v1:null' && ws.topic && !ws.url && !ws.snap && !ws.js, JSON.stringify(ws));

    // ---------------------------------------------------------------- copy a property set (to the project, sites, another model)
    const cpSrc = await page.evaluate(async () => {
      const v = window.onlineIfc.viewer, m = v.models.find((x) => x.name === 'Building-Architecture.ifc');
      for (const id of m.elementIds) {
        const sec = (await m.getElementData(id)).sections.find((q) => q.psetId && !q.isType && q.rows.length > 1);
        if (sec) return { id, pset: sec.psetName, rows: sec.rows.map((r) => `${r[0]}=${r[1]}`) };
      }
      return null;
    });
    await page.evaluate((id) => {
      const v = window.onlineIfc.viewer, m = v.models.find((x) => x.name === 'Building-Architecture.ifc');
      v.dispatchEvent(Object.assign(new Event('pick'), { hit: { model: m, id }, originalEvent: { clientX: 0, clientY: 0 } }));
    }, cpSrc.id);
    await page.click('.tab[data-tab="models"]');
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('e');
    await page.waitForSelector('#props .sec-copy');
    await page.evaluate((name) => [...document.querySelectorAll('#props details.sec')].find((d) => d.querySelector('summary span').textContent === name).querySelector('.sec-copy').click(), cpSrc.pset);
    await page.waitForSelector('#copy-pset-dialog[open]');
    await page.evaluate(() => { for (const o of document.querySelectorAll('#cp-target option')) o.selected = /^(IfcProject|IfcSite) /.test(o.textContent.replace(/\u00a0/g, ' ').trim()); document.querySelector('#cp-target').dispatchEvent(new Event('change')); });
    const cpWarn = await page.$eval('#copy-pset-dialog .warn', (w) => !w.hidden);
    await page.click('#copy-pset-dialog .dialog-btns .btn');
    await page.waitForSelector('#copy-pset-dialog', { state: 'detached' });
    const cp = await page.evaluate(async (src) => {
      const v = window.onlineIfc.viewer, m = v.models.find((x) => x.name === 'Building-Architecture.ifc'), other = v.models.find((x) => x.name === 'Infra-Road.ifc');
      const rows = async (mm, id) => (await mm.getElementData(id)).sections.find((q) => q.psetName === src.pset)?.rows.map((r) => `${r[0]}=${r[1]}`) || null;
      const sites = []; const walk = (n) => { if (String(n.type).toUpperCase() === 'IFCSITE') sites.push(n.expressID); for (const c of n.children || []) walk(c); }; walk(m.tree);
      const project = await rows(m, m.tree.expressID), site = await rows(m, sites[0]);
      // a second time: into the existing sets (merged), and into another model's project
      const again = m.copyPropertySet({ model: m, psetId: (await m.getElementData(src.id)).sections.find((q) => q.psetName === src.pset).psetId }, src.pset, [m.tree.expressID]);
      const cross = other.copyPropertySet({ model: m, psetId: (await m.getElementData(src.id)).sections.find((q) => q.psetName === src.pset).psetId }, 'Copied', [other.tree.expressID]);
      const otherRows = (await other.getElementData(other.tree.expressID)).sections.find((q) => q.psetName === 'Copied')?.rows.length || 0;
      // saved and opened again: the project still has it
      const bytes = await m.getBytes();
      const before = v.models.length;
      await window.onlineIfc.openFiles([new File([bytes], 'copied-pset.ifc')]);
      const re = v.models.length > before ? v.models.at(-1) : null;
      const reRows = re ? await rows(re, re.tree.expressID) : null;
      if (re) v.removeModel(re);
      return { sites: sites.length, project, site, again: { merged: again.merged, created: again.created }, cross: { created: cross.created, rows: otherRows }, reopened: reRows };
    }, cpSrc);
    const same = (a) => JSON.stringify(a) === JSON.stringify(cpSrc.rows);
    check('copy a property set to IfcProject and IfcSite (Pset_ warning shown)', cpWarn && same(cp.project) && same(cp.site) && cp.sites >= 1, `${cpSrc.pset}: ${JSON.stringify({ project: !!cp.project, site: !!cp.site, sites: cp.sites })}`);
    check('copy again merges; into another model; kept when saved and opened again', cp.again.merged === 1 && cp.again.created === 0 && cp.cross.created === 1 && cp.cross.rows === cpSrc.rows.length && same(cp.reopened), JSON.stringify({ again: cp.again, cross: cp.cross, reopened: !!cp.reopened }));
    await page.keyboard.press('e');

    // ---------------------------------------------------------------- settings (⚙): what is set once, in one place
    await page.click('#settings-btn');
    await page.waitForSelector('#settings-dialog[open]');
    const fmt2 = await page.$$eval('#station-format option', (o) => o[1].value);
    await page.selectOption('#station-format', fmt2);
    await page.selectOption('#plane-outline', 'black');
    await page.selectOption('#measure-unit', 'mm');
    await page.selectOption('#settings-theme', 'dark');
    await page.uncheck('#settings-viewcube');
    const set = await page.evaluate(() => ({
      fmt: document.querySelector('#station-format').value, outline: window.onlineIfc.viewer.cutlines.style, unit: window.onlineIfc.measure.unit,
      theme: document.documentElement.dataset.theme, cube: !!document.querySelector('.viewcube')?.hidden,
      // the controls moved here, not repeated in menus and panels
      once: ['#station-format', '#station-interval', '#plane-outline', '#plane-hatch', '#measure-unit'].every((q) => document.querySelectorAll(q).length === 1 && document.querySelector(q).closest('#settings-dialog')),
      formats: document.querySelectorAll('.station-format').length,
    }));
    // back as it was, for the rest of the test
    await page.selectOption('#station-format', 'km');
    await page.selectOption('#plane-outline', 'yellow');
    await page.selectOption('#measure-unit', 'm');
    await page.selectOption('#settings-theme', 'auto');
    await page.check('#settings-viewcube');
    await page.keyboard.press('Escape');
    check('settings: stationing, cut outline, unit, theme and view cube in one dialog', set.fmt === fmt2 && set.outline === 'black' && set.unit === 'mm' && set.theme === 'dark' && set.cube && set.once && set.formats === 1, JSON.stringify(set));
    await page.click('.tab[data-tab="models"]');
    await page.context().close();

    // ---------------------------------------------------------------- railway sample: 9 discipline models and a LAZ survey
    const page2 = await newPage(browser, base, errors);
    await page2.click('[data-sample="rail"]');
    await page2.waitForFunction(() => window.onlineIfc.viewer.models.length === 9 && window.onlineIfc.viewer.clouds.length === 1, null, { timeout: 180000 });
    await idle(page2);
    const rail = await page2.evaluate(() => ({ cloud: window.onlineIfc.viewer.clouds[0].placement, terrain: window.onlineIfc.viewer.models.filter((m) => m.terrain).length }));
    // long models are split in plan into cells (#60): more buckets than colours, every element still there
    const cells = await page2.evaluate(() => {
      const m = window.onlineIfc.viewer.models.find((x) => x.name === '02-Track.ifc');
      const colours = new Set(m.buckets.map((b) => b.color.getHexString() + b.opacity)).size;
      const ids = new Set(); for (const b of m.buckets) for (const it of b.items) ids.add(it.id);
      return { buckets: m.buckets.length, colours, ids: ids.size, elements: m.elementIds.size };
    });
    check('long model split into cells for view culling (#60)', cells.buckets > cells.colours && cells.ids === cells.elements, `${cells.buckets} buckets for ${cells.colours} colours, ${cells.ids} elements`);
    check('railway sample: 9 models and a LAZ survey placed in map coordinates', rail.cloud === 'map', `terrain models: ${rail.terrain}`);
    // measuring snaps to the corners of a cut, and onto the cut face (a free section across the track, like "cut by face")
    await page2.waitForTimeout(3000); // the sample's opening camera move
    await page2.evaluate(async () => {
      const v = window.onlineIfc.viewer, V3 = v.camera.position.constructor;
      const al = v.models.find((x) => x.name === '01-Alignment.ifc').alignments[0];
      const k = al.cum.findIndex((x) => x > 30), box = v.models.find((x) => x.name === '03-Earthworks.ifc').getBox();
      const p0 = v.fromIfc(al.poly[k - 1][0], al.poly[k - 1][1], 0), p1 = v.fromIfc(al.poly[k][0], al.poly[k][1], 0);
      const c = new V3(p0.x, (box.min.y + box.max.y) / 2, p0.z);
      const n = p0.clone().sub(p1).setY(0).normalize().applyAxisAngle(new V3(0, 1, 0), 0.05); // 3° off: a free plane
      window.__snapPlane = v.addPlane('custom', { normal: n, point: c });
      const cam = c.clone().addScaledVector(n, 16).addScaledVector(new V3(-n.z, 0, n.x), 6); cam.y += 5;
      v.camera.position.copy(cam); v.controls.target.copy(c); v.camera.lookAt(c); v.controls.update();
      v.renderFrame({ still: true });
      await new Promise((r) => setTimeout(r, 400));
      v.camera.position.copy(cam); v.controls.target.copy(c); v.camera.lookAt(c); v.controls.update();
      v.renderFrame({ still: true });
      window.onlineIfc.measure.setMode('distance');
    });
    const targets = await page2.evaluate(() => {
      const v = window.onlineIfc.viewer, cut = v.cutlines.snapData(), V3 = v.camera.position.constructor;
      const rect = v.renderer.domElement.getBoundingClientRect(), W = rect.width, H = rect.height;
      const pts = [];
      for (let i = 0; i < cut.corners.length; i += 3) {
        const p = new V3(cut.corners[i], cut.corners[i + 1], cut.corners[i + 2]), s = v.toScreen(p);
        if (s && s.x > 40 && s.y > 40 && s.x < W - 40 && s.y < H - 40) pts.push({ p: p.toArray(), x: rect.left + s.x, y: rect.top + s.y });
      }
      const apart = pts.filter((a) => !pts.some((b) => b !== a && Math.hypot(a.x - b.x, a.y - b.y) < 14));
      // a point well inside the cut face: the centre of its largest triangle
      let face = null, big = 0;
      for (const m of v.cutlines.faceGroup.children) {
        const T = m.geometry.attributes.position.array;
        for (let i = 0; i < T.length; i += 9) {
          const a = new V3(T[i], T[i + 1], T[i + 2]), b = new V3(T[i + 3], T[i + 4], T[i + 5]), c = new V3(T[i + 6], T[i + 7], T[i + 8]);
          const area = b.clone().sub(a).cross(c.clone().sub(a)).length();
          if (area > big) { big = area; const s = v.toScreen(a.add(b).add(c).multiplyScalar(1 / 3)); face = s ? { x: rect.left + s.x, y: rect.top + s.y } : null; }
        }
      }
      return { corners: apart.slice(0, 8), face };
    });
    let caught = 0;
    for (const c of targets.corners) {
      await page2.mouse.move(c.x + 4, c.y + 3);
      const h = await page2.evaluate(() => { const s = window.onlineIfc.measure.hover; return s && { kind: s.kind, p: s.point.toArray() }; });
      if (h?.kind === 'vertex' && Math.hypot(h.p[0] - c.p[0], h.p[1] - c.p[1], h.p[2] - c.p[2]) < 0.002) caught++;
    }
    await page2.mouse.move(targets.face.x, targets.face.y);
    const onFace = await page2.evaluate(() => { const s = window.onlineIfc.measure.hover; return s && { kind: s.kind, off: Math.abs(window.__snapPlane.plane.distanceToPoint(s.point)) }; });
    check('measuring snaps to the corners of a cut and onto the cut face', targets.corners.length >= 4 && caught === targets.corners.length && onFace?.off < 1e-6,
      `${caught} of ${targets.corners.length} corners, cut face: ${onFace?.kind} ${onFace ? `${(onFace.off * 1000).toFixed(3)} mm off the plane` : ''}`);
    await page2.evaluate(() => { const v = window.onlineIfc.viewer; window.onlineIfc.measure.setMode(null); v.removePlane(window.__snapPlane); v.fitAll?.(); });
    // contours on the terrain (#92)
    await page2.click('.tab[data-tab="models"]');
    await page2.evaluate(() => {
      const card = [...document.querySelectorAll('.model-card')].find((c) => /08-Terrain/.test(c.textContent));
      if (card && !card.classList.contains('open')) card.querySelector('.mg-caret').click();
    });
    await page2.waitForTimeout(300);
    const cont = await page2.evaluate(() => {
      const sel = [...document.querySelectorAll('.model-card.open select')].find((s) => [...s.options].some((o) => o.value === '0.25'));
      if (!sel) return { dbg: [...document.querySelectorAll('.model-card')].map((c) => c.className + ':' + c.textContent.slice(0, 30)).join(' / ') };
      sel.value = 'auto'; sel.dispatchEvent(new Event('change', { bubbles: true }));
      const m = window.onlineIfc.viewer.models.find((x) => x.terrain);
      return m.contourData ? { levels: m.contourData.levels.length, interval: m.contourData.interval } : null;
    });
    // cut and fill between the terrain and the earthworks (#92)
    await page2.evaluate(() => [...document.querySelectorAll('.model-card.open button')].find((b) => /Cut and fill/.test(b.textContent)).click());
    await page2.waitForSelector('#volume-dialog[open]');
    await page2.evaluate(() => document.querySelector('[data-action="vol-run"]').click());
    await page2.waitForFunction(() => document.querySelector('#vol-results table'));
    const vol = await page2.evaluate(() => document.querySelector('#vol-results .vol-tiles').title);
    const fillM3 = +(/fill ([\d,.]+) m³/.exec(vol)?.[1] || '0').replace(/[,.]/g, '');
    check('cut and fill: the embankment of the railway sample', fillM3 > 20000 && fillM3 < 60000, vol);
    await page2.keyboard.press('Escape');
    // LandXML export of the terrain (#92)
    const [lx] = await Promise.all([page2.waitForEvent('download'), page2.evaluate(() => [...document.querySelectorAll('.model-card.open button')].find((b) => /LandXML/.test(b.textContent)).click())]);
    const lxml = fs.readFileSync(await lx.path(), 'utf8');
    const nP = (lxml.match(/<P id=/g) || []).length, nF = (lxml.match(/<F>/g) || []).length;
    check('LandXML export of the terrain', /<LandXML\b/.test(lxml) && nP > 1000 && nF > 1000 && /epsgCode="25832"/.test(lxml), `${nP} points, ${nF} faces`);
    // a height model as GeoTIFF (#92): 60 × 40 m at 1 m by the bridge, one no-data pixel
    const W = 60, H = 40, hv = new Float32Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) hv[j * W + i] = 20 + i * 0.05 + j * 0.02;
    hv[0] = -9999;
    const tif = writeArrayBuffer(hv, { width: W, height: H, ModelPixelScale: [1, 1, 0], ModelTiepoint: [0, 0, 0, 680180, 6150040, 0], ProjectedCSTypeGeoKey: 25832, GDAL_NODATA: '-9999', BitsPerSample: [32], SampleFormat: [3] });
    const nModels = await page2.evaluate(() => window.onlineIfc.viewer.models.length);
    await page2.setInputFiles('#file-input', { name: 'dhm.tif', mimeType: 'image/tiff', buffer: Buffer.from(tif) });
    await page2.waitForFunction((n) => window.onlineIfc.viewer.models.length === n + 1, nModels);
    await idle(page2);
    const dhm = await page2.evaluate(() => { const m = window.onlineIfc.viewer.models.at(-1); return { terrain: !!m.terrain, tris: m.buckets.reduce((n, b) => n + b.index.length / 3, 0) }; });
    // 59 × 39 cells, two triangles each, less the cell with the no-data corner (one triangle left)
    check('GeoTIFF height model opens as terrain', dhm.terrain && dhm.tris === 59 * 39 * 2 - 1, `${dhm.tris} triangles`);
    check('terrain contours (auto)', !!cont && cont.levels > 5, cont?.dbg || (cont ? `${cont.levels} levels every ${cont.interval} m` : 'no contour option'));

    // ---------------------------------------------------------------- COPC streaming (#52): the survey as cloud-optimised LAZ
    const FIX = path.join(ROOT, 'tests/fixtures');
    const lazSlab = await page2.evaluate(() => {
      document.querySelector('[data-action="plane-station"]').click();
      const v = window.onlineIfc.viewer;
      v.cloudSlab = 3;
      return null;
    });
    await page2.waitForTimeout(1200);
    const slabCount = () => page2.evaluate(() => { const v = window.onlineIfc.viewer, e = v.planes.find((q) => q.station); return v.clouds[0].slab(e.plane, v.cloudSlab, [], 1e9).length; });
    const nLaz = await slabCount();
    await page2.evaluate(() => { const v = window.onlineIfc.viewer; v.removeCloud(v.clouds[0]); });
    await page2.setInputFiles('#file-input', path.join(FIX, 'survey.copc.laz'));
    await page2.waitForFunction(() => window.onlineIfc.viewer.clouds[0]?.stream);
    await idle(page2);
    await page2.evaluate(() => window.onlineIfc.viewer.clouds[0].stream.whenIdle());
    const copc = await page2.evaluate(() => { const c = window.onlineIfc.viewer.clouds[0]; return { format: c.format, total: c.total, count: c.count, nodes: c.stream.nodes.size, shown: c.stream.shown.length, placement: c.placement, card: document.querySelector('.pc-stream')?.textContent || '' }; });
    check('COPC opens and streams (not read whole)', copc.format === 'COPC' && copc.total === 181960 && copc.count < copc.total && copc.nodes === 255 && /COPC/.test(copc.card), `${copc.count} of ${copc.total} points, ${copc.shown} of ${copc.nodes} nodes, ${copc.placement}`);
    const nCopc = await slabCount();
    check('COPC: full density in the section', lazSlab === null && nLaz > 50 && nCopc === nLaz, `${nCopc} points in the slab (LAZ ${nLaz}), ${copc.count} loaded`);
    // a profile along the first alignment loads the nodes along it
    await page2.evaluate(() => document.querySelector('[data-action="profile"]').click());
    await page2.waitForSelector('#profile-dialog[open]');
    await page2.evaluate(() => { const sel = document.querySelector('#prof-path'); sel.value = sel.options[0].value; sel.dispatchEvent(new Event('change')); });
    await page2.evaluate(() => document.querySelector('[data-action="prof-show"]').click());
    await page2.waitForFunction(() => document.querySelector('#prof-preview img'));
    const prof = await page2.evaluate(() => window.onlineIfc.viewer.clouds[0].count);
    check('COPC: a profile loads the points along the path', prof >= copc.count, `${prof} points loaded`);
    await page2.keyboard.press('Escape');

    // ---------------------------------------------------------------- E57 (#52): two scans with poses, and a spherical scan
    await page2.evaluate(() => { const v = window.onlineIfc.viewer; for (const c of [...v.clouds]) v.removeCloud(c); });
    await page2.setInputFiles('#file-input', [path.join(FIX, 'two-scans.e57'), path.join(FIX, 'spherical.e57')]);
    await page2.waitForFunction(() => window.onlineIfc.viewer.clouds.length === 2);
    await idle(page2);
    const e57 = await page2.evaluate(() => window.onlineIfc.viewer.clouds.map((c) => ({ name: c.name, format: c.format, count: c.count, scans: c.scans, min: c.min, max: c.max, rgb: !!c.rgb })));
    const [two, sph] = e57;
    // scan 2 stands at (110, 200, 10) turned 90°: its 10 × 6 m room spans x 107–113, y 195–205
    check('E57: two scans placed with their poses', two.format === 'E57' && two.count === 50000 && two.scans === 2 && two.rgb
      && Math.abs(two.min[0] - 95) < 0.01 && Math.abs(two.max[0] - 113) < 0.01 && Math.abs(two.min[1] - 195) < 0.01 && Math.abs(two.max[1] - 205) < 0.01,
    `${two.count} points, x ${two.min[0].toFixed(2)}–${two.max[0].toFixed(2)}, y ${two.min[1].toFixed(2)}–${two.max[1].toFixed(2)}`);
    // libE57Format reads 18 021 valid points (the others are marked invalid)
    check('E57: spherical coordinates, scaled integers, invalid points skipped', sph.count === 18021, `${sph.count} points`);

    // ---------------------------------------------------------------- point clouds in projects (#52): stored, and their settings
    const proj = await page2.evaluate(async () => {
      const { viewer: v, projects: pm } = window.onlineIfc;
      const c = v.clouds.find((q) => q.name === 'two-scans.e57');
      c.alias = 'Rooms'; c.setMode('intensity'); c.setPointSize(3);
      await pm.saveNow();
      const id = pm.current.id;
      await pm.close();
      const empty = v.clouds.length;
      await pm.open(id);
      const r = v.clouds.find((q) => q.name === 'two-scans.e57');
      // the models come from the geometry cache, with their picking index (BVH)
      const models = { n: v.models.length, cache: v.models.filter((m) => m.geometrySource === 'cache').length, bvh: v.models.filter((m) => m.buckets.every((b) => b.bvh)).length };
      return { empty, n: v.clouds.length, alias: r?.alias, mode: r?.mode, size: r?.pointSize, count: r?.count, models };
    });
    check('point clouds saved in the project and opened again with their settings', proj.empty === 0 && proj.n === 2 && proj.alias === 'Rooms' && proj.mode === 'intensity' && proj.size === 3 && proj.count === 50000, JSON.stringify({ ...proj, models: undefined }));
    check('project models opened from the geometry cache with their picking index', proj.models.n >= 9 && proj.models.cache === proj.models.n && proj.models.bvh === proj.models.n, JSON.stringify(proj.models));

    // ---------------------------------------------------------------- coordinate systems (#107)
    // the alignment file and a part of the survey in ETRS89 / UTM 33N (tests/fixtures/make_utm33.py);
    // the alignment file's local coordinates are moved by 583 m too, so only its georeference puts it right
    await page2.setInputFiles('#file-input', [path.join(FIX, 'alignment-utm33.ifc'), path.join(FIX, 'survey-utm33.las')]);
    await page2.waitForFunction(() => window.onlineIfc.viewer.models.some((m) => m.name === 'alignment-utm33.ifc') && window.onlineIfc.viewer.clouds.some((c) => c.name === 'survey-utm33.las'));
    await idle(page2);
    const crsCheck = () => page2.evaluate(() => {
      const v = window.onlineIfc.viewer;
      const a = v.models.find((m) => m.name === '01-Alignment.ifc'), b = v.models.find((m) => m.name === 'alignment-utm33.ifc');
      let d = 0;
      a.alignments.forEach((al, i) => al.poly.forEach((pt, k) => { const q = b.alignments[i].poly[k]; d = Math.max(d, Math.hypot(pt[0] - q[0], pt[1] - q[1])); }));
      // the first survey point, at 680266.611 6150043.249 (UTM 32N): IFC 266.611 43.249
      const c = v.clouds.find((q) => q.name === 'survey-utm33.las');
      let near = Infinity;
      const w = c.getBox().min.clone();
      for (let i = 0; i < c.count; i++) { const q = v.toIfc(c.worldPoint(i, w)); near = Math.min(near, Math.hypot(q.x - 266.611, q.y - 43.249)); }
      return { project: v.projectCrs, crs: [b.crs, c.crs], d, near };
    });
    const c1 = await crsCheck();
    // the fixture's own map conversion is a similarity fitted at its origin: up to 5 mm off at its ends
    check('UTM 33N model converted into the project (UTM 32N)', c1.project === 'EPSG:25832' && c1.crs[0] === 'EPSG:25833' && c1.d < 0.01, `alignment within ${(c1.d * 1000).toFixed(1)} mm`);
    // a model with geometry in UTM 33N is converted vertex by vertex (warpPositions); the geometry
    // cache must keep its positions as loaded, or the conversion is applied twice when it is opened again
    const track33 = fs.readFileSync(path.join(DIST, 'samples/double-track-railway/02-Track.ifc'), 'latin1').replace("IFCPROJECTEDCRS('EPSG:25832'", "IFCPROJECTEDCRS('EPSG:25833'");
    await page2.setInputFiles('#file-input', { name: 'track-utm33.ifc', mimeType: 'application/x-step', buffer: Buffer.from(track33, 'latin1') });
    await page2.waitForFunction(() => window.onlineIfc.viewer.models.some((m) => m.name === 'track-utm33.ifc'));
    await idle(page2);
    await page2.waitForTimeout(3000); // the cache is written 1.5 s after loading
    const warp = await page2.evaluate(async () => {
      const v = window.onlineIfc.viewer, m = v.models.find((x) => x.name === 'track-utm33.ifc');
      const key = window.onlineIfc.projects.keys.get(m);
      const db = await new Promise((res, rej) => { const q = indexedDB.open('onlineifc'); q.onsuccess = () => res(q.result); q.onerror = rej; });
      const rec = await new Promise((res) => { const q = db.transaction('geom').objectStore('geom').get(key); q.onsuccess = () => res(q.result); });
      db.close();
      const out = { warped: !!m.warped, cached: !!rec, moved: 0, offOriginal: 0 };
      if (rec) {
        const buf = await rec.blob.arrayBuffer();
        rec.header.buckets.forEach((hb, i) => {
          const P = new Float32Array(buf, hb.positions[0], hb.positions[1]), b = m.buckets[i];
          const orig = b.positions0 || b.positions, now = b.geometry.getAttribute('position').array;
          for (let k = 0; k < P.length; k++) { out.offOriginal = Math.max(out.offOriginal, Math.abs(P[k] - orig[k])); out.moved = Math.max(out.moved, Math.abs(now[k] - orig[k])); }
        });
      }
      v.removeModel(m);
      return out;
    });
    check('geometry cache keeps the positions as loaded, not as converted', warp.warped && warp.cached && warp.moved > 0 && warp.offOriginal === 0, JSON.stringify(warp));
    check('UTM 33N point cloud converted point by point', c1.crs[1] === 'EPSG:25833' && c1.near < 0.002, `${(c1.near * 1000).toFixed(2)} mm`);
    await page2.click('.tab[data-tab="models"]');
    await page2.evaluate(() => { const sel = document.querySelector('.crs-bar select'); sel.value = 'EPSG:25833'; sel.dispatchEvent(new Event('change')); });
    await page2.waitForTimeout(800);
    const c2 = await crsCheck();
    check('project switched to UTM 33N: everything still on top of each other', c2.project === 'EPSG:25833' && c2.d < 0.01 && c2.near < 0.002, `${(c2.d * 1000).toFixed(1)} mm, ${(c2.near * 1000).toFixed(2)} mm`);
    const c3 = await page2.evaluate(async () => {
      const { viewer: v, projects: pm } = window.onlineIfc;
      await pm.saveNow();
      const id = pm.current.id;
      await pm.close();
      await pm.open(id);
      return v.projectCrs;
    });
    check('the project keeps its coordinate system', c3 === 'EPSG:25833', String(c3));
    // LandXML in UTM 33N (the exported terrain, converted here) lands on the terrain
    const tr = proj4('+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs', '+proj=utm +zone=33 +ellps=GRS80 +units=m +no_defs');
    const lx33 = lxml.replace(/<CoordinateSystem[^>]*\/>/, '<CoordinateSystem name="ETRS89 / UTM zone 33N" epsgCode="25833"/>')
      .replace(/<P id="(\d+)">([-\d.]+) ([-\d.]+) ([-\d.]+)<\/P>/g, (_, id, n, e, z) => { const [x, y] = tr.forward([+e, +n]); return `<P id="${id}">${y.toFixed(4)} ${x.toFixed(4)} ${z}</P>`; });
    const nBefore = await page2.evaluate(() => window.onlineIfc.viewer.models.length);
    await page2.setInputFiles('#file-input', { name: 'terrain-utm33.xml', mimeType: 'application/xml', buffer: Buffer.from(lx33) });
    await page2.waitForFunction((n) => window.onlineIfc.viewer.models.length === n + 1, nBefore);
    await idle(page2);
    const lxd = await page2.evaluate(() => {
      const v = window.onlineIfc.viewer;
      const a = v.models.find((m) => m.name === '08-Terrain.ifc'), b = v.models.at(-1);
      const A = a.getBox(), B = b.getBox();
      return { name: b.name, d: Math.max(A.min.distanceTo(B.min), A.max.distanceTo(B.max)) };
    });
    check('LandXML in UTM 33N converted onto the terrain', lxd.d < 0.01, `${lxd.name}: box within ${(lxd.d * 1000).toFixed(1)} mm`);
    await page2.context().close();

    // ---------------------------------------------------------------- the about page's live 3D hero
    const ctxA = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const pa = await ctxA.newPage();
    pa.on('pageerror', (e) => errors.push(`about pageerror: ${e.message}`));
    pa.on('console', (m) => { if (m.type() === 'error') errors.push(`about console: ${m.text()}`); });
    await pa.goto(`${base}/about/`);
    await pa.waitForSelector('#hero-3d.is-live', { timeout: 60000 });
    const hero = await pa.evaluate(async () => {
      const fig = document.getElementById('hero-3d'), h = fig.hero;
      h.pause(); h.station(12205);
      const card = fig.querySelector('.sec-card canvas'), c = card.getContext('2d').getImageData(0, 0, card.width, card.height).data;
      let inked = 0; for (let i = 3; i < c.length; i += 4) if (c[i] > 0) inked++;
      const btn = fig.querySelector('.hero-pause');
      return { segments: h.segments(), inked, station: fig.querySelector('.sec-st').textContent, pressed: btn.getAttribute('aria-pressed'), label: btn.getAttribute('aria-label') };
    });
    check('about page: the 3D hero runs and cuts the model live', hero.segments > 100 && hero.inked > 500 && hero.station === '12+205.0', JSON.stringify(hero));
    await pa.selectOption('#lang', 'da');
    const heroDa = await pa.evaluate(() => ({ label: document.querySelector('.hero-pause').getAttribute('aria-label'), title: document.querySelector('.sec-title').textContent, alt: document.querySelector('.hero-poster').alt }));
    check('about page: pause button and hero texts follow the language', hero.pressed === 'true' && heroDa.label === 'Afspil animationen' && heroDa.title === 'Tværsnit' && /broen/.test(heroDa.alt), JSON.stringify(heroDa));
    await pa.evaluate(fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8'));
    const axeHero = await pa.evaluate(async () => {
      const res = await window.axe.run({ include: [['.hero']] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
      return res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0].target.join(' ')}`);
    });
    check('about page hero: no serious WCAG 2.2 AA violations (axe-core)', axeHero.length === 0, axeHero.slice(0, 3).join(' | '));
    await ctxA.close();
    // with reduced motion the poster stays, and the 3D code is not even loaded
    const ctxR = await browser.newContext({ viewport: { width: 1400, height: 900 }, reducedMotion: 'reduce' });
    const pr = await ctxR.newPage();
    const loaded = [];
    pr.on('request', (r) => loaded.push(r.url()));
    await pr.goto(`${base}/about/`);
    await pr.waitForTimeout(1500);
    const still = await pr.evaluate(() => ({ canvas: !!document.querySelector('.hero-canvas'), poster: document.querySelector('.hero-poster').complete && document.querySelector('.hero-poster').naturalWidth > 0 }));
    check('about page with reduced motion: the poster, no 3D', !still.canvas && still.poster && !loaded.some((u) => /hero\.js|rail\.bin/.test(u)), JSON.stringify(still));
    await ctxR.close();

    // ---------------------------------------------------------------- a first visit follows the browser's language
    // (nynorsk and "no" are shown in Norwegian bokmål), in the app and on the about page
    const ctxL = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: 'nn-NO', reducedMotion: 'reduce' });
    const pl = await ctxL.newPage();
    pl.on('pageerror', (e) => errors.push(`nn pageerror: ${e.message}`));
    pl.on('console', (m) => { if (m.type() === 'error') errors.push(`nn console: ${m.text()}`); });
    await pl.goto(`${base}/?app`);
    await pl.waitForFunction(() => window.onlineIfc?.viewer);
    const appNb = await pl.evaluate(() => ({ lang: document.documentElement.lang, open: document.querySelector('[data-i18n="tb.open"]').textContent, sel: document.querySelector('#lang-select').value }));
    await pl.goto(`${base}/about/`);
    const aboutNb = await pl.evaluate(() => ({ lang: document.documentElement.lang, sel: document.querySelector('#lang').value, langs: document.querySelector('[data-t="g8.t"]').textContent }));
    check('first visit in the browser language: nynorsk gets Norwegian bokmål (app and about page)',
      appNb.lang === 'nb' && appNb.open === 'Åpne IFC' && appNb.sel === 'nb' && aboutNb.lang === 'nb' && aboutNb.sel === 'nb' && aboutNb.langs === 'Ni språk',
      JSON.stringify({ appNb, aboutNb }));
    await ctxL.close();
  } catch (e) {
    check('smoke test ran to the end', false, e.message.split('\n')[0]);
  } finally {
    await browser.close();
    server.close();
  }
  // errors that are expected: the bad files (IFC, the BCF "zip bomb") are logged by the loaders on purpose
  const unexpected = errors.filter((e) => !/empty\.ifc|notes\.ifc|cut-off\.ifc|not an IFC file|ISO-10303-21|snapshot\.png: too large/i.test(e));
  check('no page errors and no console errors', unexpected.length === 0, unexpected.slice(0, 5).join(' | '));
  console.log(`\n${failed ? 'FAILED' : 'OK'} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
