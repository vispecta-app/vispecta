// The poster of the about page's 3D hero (public/about/img/hero-3d.webp): the hero's own first view
// (on the bridge, 12+205), drawn by the built hero with a transparent background. It is shown until
// the live hero is ready, and instead of it where it does not run.
//
//   npm run build:app && node scripts/make-hero-poster.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'public/about/img/hero-3d.webp');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  let f = path.join(DIST, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!f.startsWith(DIST)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.goto(`http://127.0.0.1:${server.address().port}/about/`);
await page.waitForSelector('#hero-3d.is-live', { timeout: 60000 });
const url = await page.evaluate(() => { const h = document.getElementById('hero-3d').hero; h.pause(); h.station(12205); return h.snapshot('image/webp', 0.88); });
fs.writeFileSync(OUT, Buffer.from(url.split(',')[1], 'base64'));
const size = await page.evaluate(() => { const c = document.querySelector('.hero-canvas'); return [c.width, c.height]; });
console.log(`${path.relative(ROOT, OUT)}: ${size.join(' × ')}, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
await browser.close();
server.close();
