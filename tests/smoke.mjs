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
