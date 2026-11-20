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
    // ---------------------------------------------------------------- sample scene
    const page = await newPage(browser, base, errors);
    await page.click('[data-sample="scene"]');
    await page.waitForFunction(() => window.onlineIfc.viewer.models.length === 11, null, { timeout: 180000 });
    await idle(page);
    const info = await page.evaluate(() => ({
      models: window.onlineIfc.viewer.models.length,
      elements: window.onlineIfc.viewer.models.reduce((n, m) => n + m.elementIds.size, 0),
      alignments: window.onlineIfc.viewer.models.flatMap((m) => m.alignments || []).map((a) => a.name),
    }));
    check('sample scene: 11 models', info.models === 11, `${info.elements} elements`);
    check('sample scene: alignments Track and Road', info.alignments.includes('Track') && info.alignments.includes('Road'), info.alignments.join(', '));

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
    await page.context().close();

    // ---------------------------------------------------------------- railway sample: 9 discipline models and a LAZ survey
    const page2 = await newPage(browser, base, errors);
    await page2.click('[data-sample="rail"]');
    await page2.waitForFunction(() => window.onlineIfc.viewer.models.length === 9 && window.onlineIfc.viewer.clouds.length === 1, null, { timeout: 180000 });
    await idle(page2);
    const rail = await page2.evaluate(() => ({ cloud: window.onlineIfc.viewer.clouds[0].placement, terrain: window.onlineIfc.viewer.models.filter((m) => m.terrain).length }));
    check('railway sample: 9 models and a LAZ survey placed in map coordinates', rail.cloud === 'map', `terrain models: ${rail.terrain}`);
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
    check('LandXML export of the terrain', /<LandXML\b/.test(lxml) && nP > 1000 && nF > 1000 && /EPSG:25832/.test(lxml), `${nP} points, ${nF} faces`);
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
      return { empty, n: v.clouds.length, alias: r?.alias, mode: r?.mode, size: r?.pointSize, count: r?.count };
    });
    check('point clouds saved in the project and opened again with their settings', proj.empty === 0 && proj.n === 2 && proj.alias === 'Rooms' && proj.mode === 'intensity' && proj.size === 3 && proj.count === 50000, JSON.stringify(proj));
    await page2.context().close();
  } catch (e) {
    check('smoke test ran to the end', false, e.message.split('\n')[0]);
  } finally {
    await browser.close();
    server.close();
  }
  // errors that are expected: the bad files are logged by the loader on purpose
  const unexpected = errors.filter((e) => !/empty\.ifc|notes\.ifc|cut-off\.ifc|not an IFC file|ISO-10303-21/i.test(e));
  check('no page errors and no console errors', unexpected.length === 0, unexpected.slice(0, 5).join(' | '));
  console.log(`\n${failed ? 'FAILED' : 'OK'} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
