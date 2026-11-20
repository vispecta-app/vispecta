// Vispecta service worker: makes the app work offline and start quickly.
// - The page itself (navigation requests) is fetched from the network first, so a new version is
//   picked up at once; the cached copy is used when offline.
// - Build assets have content hashes in their names and never change, so they are served from the
//   cache first. Other same-origin files (icons, manifest) use stale-while-revalidate.
// - Requests to other origins (map tiles, Pyodide, Python wheels) are not touched.
// - Large files – the sample models (/samples/) and the Python runtime (/py/) – go into a cache of
//   their own, only once they are used, and it is kept under BIG_MAX bytes: the files used longest
//   ago are dropped first (#64).
// IFC files are opened locally and never pass through here.
const CACHE = 'vispecta-v3'; // v3: large files in a cache of their own (#64)
const BIG = 'vispecta-big-v1';
const BIG_MAX = 250e6;
const isBig = (path) => /\/(samples|py)\//.test(path);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './manifest.webmanifest', './icons/icon.svg'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE && k !== BIG) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  // only the app itself is the cached "./" page; other pages (the about page) are cached under their own URL
  const scope = new URL(self.registration.scope).pathname;
  const path = new URL(req.url).pathname;
  const isApp = path === scope || path === `${scope}index.html`;
  try {
    const res = await fetch(req);
    if (res.ok && isApp) {
      const old = await cache.match('./');
      const html = await res.clone().text();
      if (old && (await old.text()) !== html) await pruneAssets(cache, html);
      await cache.put('./', res.clone());
    } else if (res.ok) {
      await cache.put(req, res.clone());
    }
    return res;
  } catch {
    return (isApp ? await cache.match('./') : await cache.match(req, { ignoreSearch: true })) || (await cache.match('./')) || Response.error();
  }
}

/** A new version was published: drop cached build assets the new page does not reference.
 * (Files loaded from scripts, like the wasm, are simply fetched and cached again when used.) */
async function pruneAssets(cache, html) {
  for (const r of await cache.keys()) {
    const path = new URL(r.url).pathname;
    const name = path.slice(path.lastIndexOf('/') + 1);
    if (path.includes('/assets/') && !html.includes(name)) await cache.delete(r);
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const update = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || update;
}

/**
 * A large file: from the cache when it is there (it is checked for a newer version in the
 * background), else from the network and stored. A small index in the same cache keeps each
 * file's size and when it was last used, and the cache is trimmed to BIG_MAX.
 */
const INDEX = new URL('__big-index.json', self.registration.scope).href;
async function readIndex(cache) {
  try { return (await (await cache.match(INDEX))?.json()) || {}; } catch { return {}; }
}
let indexWrite = Promise.resolve();
function updateIndex(cache, fn) {
  indexWrite = indexWrite.then(async () => {
    const idx = await readIndex(cache);
    fn(idx);
    await cache.put(INDEX, new Response(JSON.stringify(idx), { headers: { 'content-type': 'application/json' } }));
    return idx;
  }).catch(() => {});
  return indexWrite;
}

async function bigFile(req) {
  const cache = await caches.open(BIG);
  const hit = await cache.match(req);
  const store = async (res) => {
    if (!res.ok || res.status !== 200) return res;
    const size = Number(res.headers.get('content-length')) || (await res.clone().blob()).size;
    if (size > BIG_MAX / 2) return res; // too large to keep
    await cache.put(req, res.clone());
    const idx = await updateIndex(cache, (x) => { x[req.url] = { size, used: Date.now() }; });
    await trimBig(cache, idx || {});
    return res;
  };
  if (hit) {
    updateIndex(cache, (x) => { if (x[req.url]) x[req.url].used = Date.now(); });
    // a newer version (other ETag) replaces it, without making the page wait
    const etag = hit.headers.get('etag');
    if (etag) {
      // only the headers come back (304) unless the file changed
      fetch(req.url, { headers: { 'If-None-Match': etag }, cache: 'no-store' })
        .then((res) => (res.status === 200 ? store(res) : null)).catch(() => {});
    }
    return hit;
  }
  return store(await fetch(req));
}

async function trimBig(cache, idx) {
  const list = Object.entries(idx).sort((a, b) => a[1].used - b[1].used);
  let total = list.reduce((n, [, e]) => n + (e.size || 0), 0);
  const drop = [];
  for (const [url, e] of list) {
    if (total <= BIG_MAX) break;
    await cache.delete(url);
    drop.push(url);
    total -= e.size || 0;
  }
  if (drop.length) await updateIndex(cache, (x) => { for (const u of drop) delete x[u]; });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') event.respondWith(networkFirst(req));
  else if (url.pathname.includes('/assets/')) event.respondWith(cacheFirst(req));
  else if (isBig(url.pathname)) event.respondWith(bigFile(req));
  else event.respondWith(staleWhileRevalidate(req));
});
