// Records the two railway clips of the about page from the double-track sample (12+000–13+000):
//   cut      – a cross section sliding along the track, seen in 3D with its section marks
//   secview  – the section window stepping through stations next to the 3D view
// and four still images (img/): profile, drawing, terrain and clouds.
// Frame by frame (move, render, screenshot), so the clip is smooth however slow the rendering is;
// then ffmpeg makes WebM (VP9), MP4 (H.264) and a WebP poster from the first frame.
//
//   npm run build:app && node scripts/record-about-clips.cjs [cut|secview|profile|drawing|terrain|clouds]
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

async function openRail(browser, base, viewport, { scale = 1, station = true } = {}) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: scale });
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
  if (!station) return page;
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

// ------------------------------------------------------------------ still images
const IMG = path.join(ROOT, 'public/about/img');
function webp(png, name) {
  const out = path.join(IMG, `${name}.webp`);
  execFileSync('ffmpeg', ['-y', '-i', png, '-c:v', 'libwebp', '-quality', '86', out], { stdio: 'ignore' });
  const { width, height } = sizeOf(png);
  console.log(`${name}.webp: ${width} × ${height}, ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
}

/** The longitudinal profile dialog along Spor 1, 12+000 to 12+400 (embankment and bridge). */
async function shotProfile(browser, base, tmp) {
  const page = await openRail(browser, base, { width: 1000, height: 790 }, { scale: 1.5, station: false });
  await page.evaluate(() => document.querySelector('[data-action="profile"]').click());
  await page.waitForSelector('#profile-dialog[open]');
  await page.evaluate(() => {
    const sel = document.querySelector('#prof-path');
    const o = [...sel.options].find((x) => /Spor 1/.test(x.textContent)); sel.value = o.value; sel.dispatchEvent(new Event('change'));
    for (const [id, v] of [['#prof-from', '12+100'], ['#prof-to', '12+300']]) { const el = document.querySelector(id); el.value = v; el.dispatchEvent(new Event('change')); }
    const ex = document.querySelector('#prof-exag'); ex.value = '10'; ex.dispatchEvent(new Event('change'));
    const pp = document.querySelector('#prof-paper'); pp.value = 'auto'; pp.dispatchEvent(new Event('change'));
    document.querySelector('[data-action="prof-show"]').click();
  });
  await page.waitForFunction(() => document.querySelector('#prof-preview img')?.complete);
  await page.waitForTimeout(800);
  const png = path.join(tmp, 'profile.png');
  await page.locator('#profile-dialog').screenshot({ path: png });
  await page.close();
  webp(png, 'profile');
}

/** A cross-section drawing (SVG export) at 12+120, as on paper. */
async function shotDrawing(browser, base, tmp) {
  const page = await openRail(browser, base, { width: 1400, height: 900 });
  await page.evaluate(() => { for (const id of ['#plane-wl', '#plane-wr']) { const el = document.querySelector(id); el.value = '16'; el.dispatchEvent(new Event('change', { bubbles: true })); } });
  await setStation(page, '12+120');
  await page.waitForTimeout(800);
  await page.evaluate(() => [...document.querySelectorAll('.plane-row button')].find((b) => b.textContent.trim() === '2D').click());
  await page.waitForSelector('#drawing-dialog[open]');
  await page.selectOption('#drw-format', 'svg');
  await page.selectOption('#drw-paper', 'auto');
  await page.evaluate(() => {
    const sc = document.querySelector('#drw-scale'); const o = [...sc.options].find((x) => /100$/.test(x.textContent.trim()) || x.value === '100'); if (o) { sc.value = o.value; sc.dispatchEvent(new Event('change')); }
    const set = (id, v) => { const el = document.querySelector(id); if (el && el.checked !== v) el.click(); };
    set('#drw-bg', false); set('#ann-on', true); set('#ann-slopes', true);
  });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => document.querySelector('[data-action="drawing-run"]').click())]);
  const svg = fs.readFileSync(await dl.path(), 'utf8');
  await page.close();
  // the sheet, rendered white at 1600 px wide
  const p2 = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });
  await p2.setContent(`<html><body style="margin:0;background:#fff">${svg.replace(/^<\?xml[^>]*>/, '')}</body></html>`);
  // only the drawing: everything before the sheet's frame (the first black outline rectangle)
  await p2.evaluate(() => {
    const s = document.querySelector('svg');
    const kids = [...s.children];
    const frame = kids.findIndex((k) => k.tagName === 'rect' && k.getAttribute('fill') === 'none' && k.getAttribute('stroke') === '#000');
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const k of kids.slice(0, frame)) { try { const b = k.getBBox(); if (!b.width && !b.height) continue; x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height); } catch { /* not drawn */ } }
    for (const k of kids.slice(frame)) k.remove();
    const pad = 4;
    s.setAttribute('viewBox', `${x0 - pad} ${y0 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}`);
    s.removeAttribute('height'); s.setAttribute('width', '1600');
  });
  const png = path.join(tmp, 'drawing.png');
  await p2.locator('svg').screenshot({ path: png });
  await p2.close();
  webp(png, 'drawing');
}

/** The terrain coloured by height with contours, and the cut and fill map along Spor 1. */
async function shotTerrain(browser, base, tmp) {
  const page = await openRail(browser, base, { width: 1280, height: 800 }, { scale: 1.25, station: false });
  await page.evaluate(() => document.querySelector('[data-action="toggle-right"]')?.click());

  // the terrain card: height colours and contours every 0.5 m
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('.model-card')].find((c) => /08-Terrain/.test(c.textContent));
    if (!card.classList.contains('open')) card.querySelector('.mg-caret').click();
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('.model-card')].find((c) => /08-Terrain/.test(c.textContent));
    const sels = card.querySelectorAll('select');
    const hc = [...sels].find((s) => [...s.options].some((o) => o.value === 'earth')); hc.value = 'earth'; hc.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('.model-card')].find((c) => /08-Terrain/.test(c.textContent));
    const cs = [...card.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === '0.5')); cs.value = '0.5'; cs.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(800);
  // cut and fill along Spor 1, its difference map left in 3D
  await page.evaluate(() => [...document.querySelectorAll('.model-card.open button')].find((b) => /Cut and fill/.test(b.textContent)).click());
  await page.waitForSelector('#volume-dialog[open]');
  await page.evaluate(() => document.querySelector('[data-action="vol-run"]').click());
  await page.waitForFunction(() => document.querySelector('#vol-results table'));
  await page.waitForTimeout(500);
  const png1 = path.join(tmp, 'terrain-dialog.png');
  await page.locator('#volume-dialog').screenshot({ path: png1 });
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.querySelector('[data-action="toggle-left"]')?.click());
  await page.waitForTimeout(400);
  // only the terrain, the earthworks, the track and the bridge
  await page.evaluate(() => { for (const m of window.onlineIfc.viewer.models) if (!/02-Track|03-Earth|05-Bridge|08-Terrain/.test(m.name)) m.setVisible(false); for (const c of window.onlineIfc.viewer.clouds) c.setVisible(false); });
  // a view over the bridge from the side and high up: contours and the cut and fill map
  await followCamera(page, 12150, { back: 40, side: 110, up: 95, ahead: 70 });
  await page.evaluate(() => window.onlineIfc.viewer.renderFrame({ still: true }));
  await page.waitForTimeout(600);
  const png = path.join(tmp, 'terrain.png');
  await page.screenshot({ path: png });
  await page.close();
  webp(png, 'terrain');
}

/** The survey point cloud by class, with its dots in the section window, and the coordinate system. */
async function shotClouds(browser, base, tmp) {
  const page = await openRail(browser, base, { width: 1280, height: 800 }, { scale: 1.25 });
  await page.evaluate(() => {
    document.querySelector('[data-action="toggle-right"]')?.click();
    const hp = document.querySelector('#plane-helpers'); if (hp.checked) hp.click();
    for (const id of ['#plane-wl', '#plane-wr']) { const el = document.querySelector(id); el.value = '18'; el.dispatchEvent(new Event('change', { bubbles: true })); }
    window.onlineIfc.viewer.cloudSlab = 0.5;
    // only the point cloud and the track
    for (const m of window.onlineIfc.viewer.models) if (!/02-Track|05-Bridge|06-Overhead/.test(m.name)) m.setVisible(false);
  });
  await setStation(page, '12+140');
  // the cloud card open, coloured by class
  await page.evaluate(() => {
    const c = window.onlineIfc.viewer.clouds[0];
    for (const k of [7, 18]) c.setClassHidden(k, true); // no noise
    c.setPointSize(3, window.onlineIfc.viewer.renderer.getPixelRatio());
    const card = document.querySelector('.cloud-card');
    const sel = [...card.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'class'));
    sel.value = 'class'; sel.dispatchEvent(new Event('change'));
  });
  // the survey is in ETRS89 / UTM 32N, like the project (the LAZ file does not say so)
  await page.evaluate(() => {
    const sel = document.querySelector('.cloud-card .crs-select');
    sel.value = 'EPSG:25832'; sel.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(400);
  // the model groups folded, so the point cloud's card shows
  await page.evaluate(() => { for (const b of document.querySelectorAll('.mgroup .mg-head .mg-caret.open')) b.click(); });
  await page.waitForTimeout(300);
  await followCamera(page, 12140, { back: 30, side: 20, up: 8, ahead: 25 });
  await page.evaluate(() => {
    window.onlineIfc.viewer.renderFrame({ still: true });
    const sv = document.querySelector('.secview');
    Object.assign(sv.style, { left: 'auto', top: 'auto', right: '12px', bottom: '34px', width: '640px', height: '440px' });
    const s = window.onlineIfc.secViewer; if (s) { s.view = null; s.update?.(); }
  });
  await page.waitForTimeout(1500);
  const png = path.join(tmp, 'clouds.png');
  await page.screenshot({ path: png });
  await page.close();
  webp(png, 'clouds');
}

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
    for (const [name, fn] of [['cut', recordCut], ['secview', recordSecview], ['profile', shotProfile], ['drawing', shotDrawing], ['terrain', shotTerrain], ['clouds', shotClouds]]) {
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
