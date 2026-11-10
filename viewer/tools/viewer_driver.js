// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — viewer_driver.js: the shared headless Viewer page-open (spec bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §19.4)
// Read the log after every run. SCOPE: opens viewer/viewer.html on SwiftShader (CPU), never the GPU; serves the repo plus ONE building DB at
// /__fpv/model.db; no bake, no DB write. Factored out of film_path_vis.js (same flags, same waits); verbs in viewer_verbs.js call it.
// LIVE MODE (NEURO §0.15): with no viewer/viewer.html beside it (a plain download) or VIEWER_LIVE=1, it opens the LIVE Viewer page with ?db=<building url> and serves nothing,
// as modeller/tools/edit_cli.js opens the live Modeller. The bucket address is read from the live viewer/config.js (A.PROD_BASE): one owner.
// API: const d = await VD.start({db, width, height, pageLog}); await d.open(); await d.waitLoaded(); d.page.evaluate(...); await d.close();
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');

const puppeteer = (function () {
  for (const id of [process.env.PUPPETEER_PATH, 'puppeteer', path.join(os.homedir(), 'bim-compiler', 'node_modules', 'puppeteer')]) {
    if (!id) continue; try { return require(id); } catch (e) { /* next */ }
  }
  return null;
})();
const ROOT = path.resolve(__dirname, '..', '..');
const LIVE_SITE = 'https://red1oon.github.io/bim-ootb/', HERE = path.join(ROOT, 'viewer', 'viewer.html');
const isLive = () => process.env.VIEWER_LIVE === '1' || !fs.existsSync(HERE);
// one small https helper (IPv4: this class of machine may have no IPv6 route). method GET returns the body text; HEAD returns only the status.
function fetchLive(url, method) {
  return new Promise((res, rej) => { const rq = require('https').request(url, { method: method || 'GET', family: 4, timeout: 20000 }, (r) => { if (method === 'HEAD') { r.resume(); return res({ status: r.statusCode }); } let t = ''; r.setEncoding('utf8'); r.on('data', d => { t += d; }); r.on('end', () => res({ status: r.statusCode, text: t })); }); rq.on('timeout', () => rq.destroy(new Error('timeout ' + url))); rq.on('error', rej); rq.end(); });
}
// the production building base, from the page's own config (viewer/config.js `A.PROD_BASE = '…'`)
async function liveBase() {
  const r = await fetchLive(LIVE_SITE + 'viewer/config.js?nc=' + Date.now()), m = r.status === 200 && /PROD_BASE\s*=\s*["']([^"']+)["']/.exec(r.text);
  if (!m) throw new Error('the live Viewer config could not be read (' + LIVE_SITE + 'viewer/config.js, HTTP ' + r.status + ')');
  return m[1];
}
const SW_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];   // cli_silent_bake.js `sw`
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.hdr': 'application/octet-stream', '.webp': 'image/webp', '.woff2': 'font/woff2' };

async function start(o) {
  if (!puppeteer) throw new Error('could not load puppeteer (npm install puppeteer, or PUPPETEER_PATH=…)');
  const live = !!o.dbUrl, dbFile = live ? null : path.resolve(o.db);
  if (!live && !fs.existsSync(dbFile)) throw new Error('no such DB: ' + dbFile);
  const W = +o.width || 1280, H = +o.height || 720;
  const server = live ? null : http.createServer((req, res) => {
    try {
      const u = decodeURIComponent(req.url.split('?')[0]);
      const fp = u === '/__fpv/model.db' ? dbFile : (u === '/__fpv/patches/model.db.sql' && o.patch) ? path.resolve(o.patch) : path.join(ROOT, u.replace(/^\/+/, ''));   // o.patch (optional): the self-heal patch the loader looks for beside the db (patches/<dbfile>.sql)
      if (!fp.startsWith(ROOT) && fp !== dbFile && !(o.patch && fp === path.resolve(o.patch))) { res.writeHead(403); res.end(); return; }
      if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end('404'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(fp).pipe(res);
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  });
  if (server) await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server ? server.address().port : 0, pageUrl = live ? LIVE_SITE + 'viewer/viewer.html?db=' + encodeURIComponent(o.dbUrl) : `http://127.0.0.1:${port}/viewer/viewer.html?db=/__fpv/model.db`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fpv-prof-'));
  const browser = await puppeteer.launch({ headless: true, userDataDir: profile, protocolTimeout: 10 * 60 * 1000,
    args: ['--no-sandbox', '--disable-background-networking', '--disable-component-update', '--no-first-run', `--window-size=${W},${H}`].concat(SW_ARGS) });
  const pageErrors = [];
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H });
  page.on('pageerror', e => pageErrors.push(String(e && e.message || e).slice(0, 200)));
  page.on('console', m => { const t = m.text(); if (o.pageLog) o.pageLog.push(t); });
  return {
    page, pageErrors, W, H, dbFile, live, pageUrl,
    async open() {
      await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForFunction(() => window.APP && window.APP.camera && typeof window.APP.cinemaPathPlan === 'function' && window.THREE,
        { timeout: 300000, polling: 500 });
    },
    async waitLoaded() {
      await page.waitForFunction(() => window.APP.activeBuilding && window.APP.db && window.APP.buildingsRendered &&
        window.APP.buildingsRendered.has(window.APP.activeBuilding) && !window.APP.streaming, { timeout: 600000, polling: 1000 });
    },
    async close() {
      await browser.close().catch(() => {});
      if (server) server.close();
      fs.rmSync(profile, { recursive: true, force: true });
    }
  };
}
module.exports = { start, ROOT, isLive, liveBase, fetchLive, LIVE_SITE };
