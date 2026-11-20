// Records the two railway clips of the about page from the double-track sample (12+000–13+000):
//   cut      – a cross section sliding along the track, seen in 3D with its section marks
//   secview  – the section window stepping through stations next to the 3D view
// Frame by frame (move, render, screenshot), so the clip is smooth however slow the rendering is;
// then ffmpeg makes WebM (VP9), MP4 (H.264) and a WebP poster from the first frame.
//
//   npm run build:app && node scripts/record-about-clips.cjs [cut|secview]
// Needs Playwright's Chromium and ffmpeg (with libvpx-vp9, libx264 and libwebp).
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'public/about/vid');
const FPS = 25;
const only = process.argv[2];

function serve() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
  const server = http.createServer((req, res) => {
    let f = path.join(DIST, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

async function openRail(browser, base, viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('onlineifc.lang', 'en');
      localStorage.setItem('onlineifc.openedApp', '1');
      localStorage.setItem('onlineifc.theme', 'light');
      localStorage.setItem('onlineifc.projects.enabled', '0');
      localStorage.setItem('onlineifc.sv.points', '1'); // offsets and levels at the break points
    } catch { /* ignore */ }
  });
  await page.goto(`${base}/?app`);
  await page.waitForFunction(() => window.onlineIfc?.viewer);
  await page.click('[data-sample="rail"]');
  await page.waitForFunction(() => window.onlineIfc.viewer.models.length === 9, null, { timeout: 300000 });
  await page.waitForFunction(() => document.querySelector('#loading')?.hidden !== false);
  await page.waitForTimeout(1500);
  // a station section on Spor 1
  await page.evaluate(() => document.querySelector('[data-action="plane-station"]').click());
  await page.waitForSelector('.plane-row.station .station-input');
  await page.evaluate(() => {
    const sel = document.querySelector('.plane-row.station select');
    if (sel) { const o = [...sel.options].find((x) => /Spor 1/.test(x.textContent)); if (o) { sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); } }
  });
  await page.waitForTimeout(500);
  return page;
}

/** The camera behind the cut, to the left and above, looking along Spor 1 at station s (m). */
const followCamera = (page, s, o) => page.evaluate(([s, o]) => {
  const v = window.onlineIfc.viewer;
  const al = v.models.flatMap((m) => m.alignments || []).find((a) => a.name === 'Spor 1');
  const x = s - al.station0;
  let k = 1; while (k < al.cum.length - 1 && al.cum[k] < x) k++;
  const a = al.poly[k - 1], b = al.poly[k], L = al.cum[k] - al.cum[k - 1] || 1, f = (x - al.cum[k - 1]) / L;
  const px = a[0] + (b[0] - a[0]) * f, py = a[1] + (b[1] - a[1]) * f, dx = (b[0] - a[0]) / L, dy = (b[1] - a[1]) / L;
  // the height of the vertical profile at x
  let z = 0;
  for (const vs of al.vertical || []) if (x >= vs.s0 - 1e-6) { const u = x - vs.s0; z = vs.h0 + vs.g0 * u + (vs.type === 'PARABOLICARC' && vs.L ? ((vs.g1 - vs.g0) / (2 * vs.L)) * u * u : 0); }
  const lx = -dy, ly = dx; // left
  const cam = v.fromIfc(px - dx * o.back + lx * o.side, py - dy * o.back + ly * o.side, z + o.up);
  const tgt = v.fromIfc(px + dx * o.ahead - lx * 2, py + dy * o.ahead - ly * 2, z - 1.5);
  v.camera.position.copy(cam); v.controls.target.copy(tgt); v.camera.lookAt(tgt); v.controls.update();
}, [s, o]);

/** From here the viewer only renders when the recording asks for it (the loop would compete). */
const manualRender = (page) => page.evaluate(() => {
  const v = window.onlineIfc.viewer, orig = v.renderFrame.bind(v);
  window.__frame = (o) => { window.__allow = true; try { orig(o); } finally { window.__allow = false; } };
  v.renderFrame = (o) => (window.__allow ? orig(o) : undefined);
});
const renderNow = (page) => page.evaluate(() => window.__frame({ still: true }));

// set the station (text field of the station row) and wait for the view and the section window
const setStation = (page, st) => page.evaluate(async (st) => {
  const inp = document.querySelector('.plane-row.station .station-input');
  inp.value = st; inp.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 30));
}, st);
const fmt = (s) => `${Math.floor(s / 1000)}+${(s % 1000).toFixed(3).padStart(7, '0')}`;

function encode(dir, name, w, h) {
  const inp = ['-y', '-framerate', String(FPS), '-i', path.join(dir, 'f%04d.png')];
  const scale = `scale=${w}:${h}:flags=lanczos,format=yuv420p`;
  execFileSync('ffmpeg', [...inp, '-vf', scale, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '38', '-row-mt', '1', '-an', path.join(OUT, `${name}.webm`)], { stdio: 'ignore' });
  execFileSync('ffmpeg', [...inp, '-vf', scale, '-c:v', 'libx264', '-crf', '27', '-preset', 'slow', '-movflags', '+faststart', '-an', path.join(OUT, `${name}.mp4`)], { stdio: 'ignore' });
  execFileSync('ffmpeg', ['-y', '-i', path.join(dir, 'f0000.png'), '-vf', `scale=${w}:${h}:flags=lanczos`, '-c:v', 'libwebp', '-quality', '88', path.join(OUT, `${name}.webp`)], { stdio: 'ignore' });
  for (const ext of ['webm', 'mp4', 'webp']) console.log(`${name}.${ext}: ${(fs.statSync(path.join(OUT, `${name}.${ext}`)).size / 1024).toFixed(0)} KB`);
}

/** The cut sliding along the track, 12+120 to 12+260 (over the bridge), seen from behind and above. */
async function recordCut(browser, base, tmp) {
  const page = await openRail(browser, base, { width: 1110, height: 836 });
  // only the 3D view: no panels, no section window
  await page.evaluate(() => {
    document.querySelector('[data-action="toggle-left"]')?.click();
    document.querySelector('[data-action="toggle-right"]')?.click();
    window.onlineIfc.secViewer?.close?.();
    // the planes panel and the status bar stay out of the picture (the panel is still used, hidden)
    const st = document.createElement('style');
    st.textContent = '#planes-panel, #statusbar { visibility: hidden !important; }';
    document.head.append(st);
  });
  await page.waitForTimeout(500);
  await manualRender(page);
  const s0 = 12120, s1 = 12260, n = Number(process.env.CLIP_FRAMES) || Math.round(11.2 * FPS);
  for (let i = 0; i < n; i++) {
    const s = s0 + ((s1 - s0) * i) / (n - 1);
    const t0 = Date.now();
    await setStation(page, fmt(s));
    const t1 = Date.now();
    await followCamera(page, s, { back: 17, side: 11, up: 4.5, ahead: 4 });
    const t2 = Date.now();
    await renderNow(page);
    const t3 = Date.now();
    await page.screenshot({ path: path.join(tmp, `f${String(i).padStart(4, '0')}.png`), clip: await vpBox(page) });
    if (process.env.CLIP_TIMING) console.log(`frame ${i}: station ${t1 - t0} ms, camera ${t2 - t1} ms, render ${t3 - t2} ms, shot ${Date.now() - t3} ms`); // CLIP_TIMING=1: where the time goes
    if (i % 25 === 0) console.log(`cut ${i}/${n}`);
  }
  await page.close();
  const { width, height } = await sizeOf(path.join(tmp, 'f0000.png'));
  // the page's figure is 1110 × 780: the middle of the view at that aspect
  const w = Math.min(width, Math.round((height * 1110) / 780)), hgt = Math.round((w * 780) / 1110);
  for (const f of fs.readdirSync(tmp)) execFileSync('ffmpeg', ['-y', '-i', path.join(tmp, f), '-vf', `crop=${w}:${hgt}`, path.join(tmp, `c_${f}`)], { stdio: 'ignore' });
  for (const f of fs.readdirSync(tmp).filter((x) => x.startsWith('f'))) fs.renameSync(path.join(tmp, `c_${f}`), path.join(tmp, f));
  encode(tmp, 'cut', 1110, 780);
}

/** The section window stepping 12+120 … 12+260 every 10 m next to the 3D view. */
async function recordSecview(browser, base, tmp) {
  const page = await openRail(browser, base, { width: 1280, height: 788 });
  await page.evaluate(() => {
    document.querySelector('[data-action="toggle-right"]')?.click();
    document.querySelector('[data-action="toggle-left"]')?.click();
    // the section window shows ±18 m around the track (#66), so it zooms to it
    for (const id of ['#plane-wl', '#plane-wr']) { const el = document.querySelector(id); el.value = '18'; el.dispatchEvent(new Event('change', { bubbles: true })); }
    // no see-through plane in 3D, and a larger section window at the right
    const hp = document.querySelector('#plane-helpers'); if (hp.checked) hp.click();
    const sv = document.querySelector('.secview');
    Object.assign(sv.style, { left: 'auto', top: 'auto', right: '12px', bottom: '34px', width: '820px', height: '540px' });
  });
  await page.waitForTimeout(800);
  await manualRender(page);
  let i = 0;
  const hold = Math.round(1.25 * FPS);
  for (let s = 12120; s <= 12260; s += 10) {
    await setStation(page, fmt(s));
    await followCamera(page, s, { back: 30, side: 22, up: 12, ahead: 10 });
    await page.waitForTimeout(700); // the section window computes the cut
    await page.evaluate(() => { const sv = window.onlineIfc.secViewer; if (sv) { sv.view = null; sv.update?.(); } });
    await page.waitForTimeout(500);
    await renderNow(page);
    const shot = path.join(tmp, `f${String(i).padStart(4, '0')}.png`);
    await page.screenshot({ path: shot, animations: 'disabled' });
    for (let k = 1; k < hold; k++) fs.copyFileSync(shot, path.join(tmp, `f${String(i + k).padStart(4, '0')}.png`));
    i += hold;
    console.log(`secview ${fmt(s)}`);
  }
  await page.close();
  encode(tmp, 'secview', 1280, 788);
}

const vpBox = async (page) => { const b = await page.locator('#viewport').boundingBox(); return { x: Math.round(b.x), y: Math.round(b.y), width: Math.floor(b.width), height: Math.floor(b.height) }; };

function sizeOf(png) {
  const b = fs.readFileSync(png);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

(async () => {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('run `npm run build:app` first');
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    for (const [name, fn] of [['cut', recordCut], ['secview', recordSecview]]) {
      if (only && only !== name) continue;
      const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), `clip-${name}-`));
      await fn(browser, base, tmp);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  } finally {
    await browser.close();
    server.close();
  }
})();
