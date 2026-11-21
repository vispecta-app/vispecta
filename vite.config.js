import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Version shown in the About dialog: the latest GitHub release (git tag) plus the number of
// changes since it, and the commit. Falls back to package.json when git is not available.
function buildInfo() {
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
  const git = (cmd) => { try { return execSync(`git ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };
  const describe = git('describe --tags --long --always'); // e.g. 0.0.1-12-g7d35a5a
  const m = /^(.*)-(\d+)-g([0-9a-f]+)$/.exec(describe);
  return {
    release: m ? m[1] : '',
    ahead: m ? Number(m[2]) : 0,
    commit: m ? m[3] : describe || '',
    date: git('log -1 --format=%cI') || new Date().toISOString(),
    version: pkg.version,
  };
}

// sitemap.xml gets <lastmod> from git: the date of the last change to the app or the about page.
function sitemapLastmod() {
  const day = (paths) => { try { return execSync(`git log -1 --format=%cs -- ${paths}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };
  const dates = { 'https://vispecta.com/': day('index.html src public/manifest.webmanifest'), 'https://vispecta.com/about/': day('public/about') };
  let outDir = 'dist';
  return {
    name: 'sitemap-lastmod',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir; },
    closeBundle() {
      const file = `${outDir}/sitemap.xml`;
      if (!existsSync(file)) return;
      const xml = readFileSync(file, 'utf8').replace(/<loc>([^<]+)<\/loc>/g, (m, loc) => dates[loc] ? `${m}\n    <lastmod>${dates[loc]}</lastmod>` : m);
      writeFileSync(file, xml);
    },
  };
}

// base: './' makes the built site work from any sub folder (e.g. GitHub Pages).
export default defineConfig({
  base: './',
  plugins: [sitemapLastmod()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    // The big libraries get files of their own: they rarely change, so after an update of the app
    // the browser (and the offline cache) only fetches the small application file again.
    rolldownOptions: {
      // the app, and the live 3D hero of the about page (public/about, loaded there as ./hero.js)
      input: { index: fileURLToPath(new URL('./index.html', import.meta.url)), 'about-hero': fileURLToPath(new URL('./src/about-hero.js', import.meta.url)) },
      preserveEntrySignatures: 'exports-only', // hero.js is imported for its startHero()
      output: {
        entryFileNames: (chunk) => (chunk.name === 'about-hero' ? 'about/hero.js' : 'assets/[name]-[hash].js'),
        advancedChunks: {
          groups: [
            // only its JavaScript: the wasm URL (web-ifc.wasm?url) is a string the app needs at once,
            // and in this group it would make the whole library load with the page
            { name: 'web-ifc', test: /node_modules[\\/]web-ifc[\\/][^?]*\.m?js$/ },
            { name: 'three', test: /node_modules[\\/](three|three-mesh-bvh)[\\/]/ },
            { name: 'editor', test: /node_modules[\\/](codemirror|@codemirror|@lezer|crelt|style-mod|w3c-keyname|@marijn)/ },
          ],
        },
      },
    },
  },
  optimizeDeps: { exclude: ['web-ifc'] },
  worker: { format: 'es' },
  define: {
    __BUILD_INFO__: JSON.stringify(buildInfo()),
    // the site serves the Python runtime itself when scripts/fetch-python.mjs has collected it
    __PY_SELF_HOSTED__: JSON.stringify(existsSync(new URL('./public/py/pyodide/pyodide.mjs', import.meta.url))),
  },
});
