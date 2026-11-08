// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — viewer_driver.js: the shared headless Viewer page-open (spec bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §19.4)
// Read the log after every run. SCOPE: opens viewer/viewer.html on SwiftShader (CPU), never the GPU; serves the repo plus ONE building DB at
// /__fpv/model.db; no bake, no DB write. Factored out of film_path_vis.js (same flags, same waits); verbs in viewer_verbs.js call it.
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
const SW_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];   // cli_silent_bake.js `sw`
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.hdr': 'application/octet-stream', '.webp': 'image/webp', '.woff2': 'font/woff2' };

async function start(o) {
  if (!puppeteer) throw new Error('could not load puppeteer (npm install puppeteer, or PUPPETEER_PATH=…)');
  const dbFile = path.resolve(o.db);
  if (!fs.existsSync(dbFile)) throw new Error('no such DB: ' + dbFile);
  const W = +o.width || 1280, H = +o.height || 720;
  const server = http.createServer((req, res) => {
    try {
      const u = decodeURIComponent(req.url.split('?')[0]);
      const fp = u === '/__fpv/model.db' ? dbFile : path.join(ROOT, u.replace(/^\/+/, ''));
      if (!fp.startsWith(ROOT) && fp !== dbFile) { res.writeHead(403); res.end(); return; }
      if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end('404'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(fp).pipe(res);
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fpv-prof-'));
  const browser = await puppeteer.launch({ headless: true, userDataDir: profile, protocolTimeout: 10 * 60 * 1000,
    args: ['--no-sandbox', '--disable-background-networking', '--disable-component-update', '--no-first-run', `--window-size=${W},${H}`].concat(SW_ARGS) });
  const pageErrors = [];
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H });
  page.on('pageerror', e => pageErrors.push(String(e && e.message || e).slice(0, 200)));
  page.on('console', m => { const t = m.text(); if (o.pageLog) o.pageLog.push(t); });
  return {
    page, pageErrors, W, H, dbFile,
    async open() {
      await page.goto(`http://127.0.0.1:${port}/viewer/viewer.html?db=/__fpv/model.db`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForFunction(() => window.APP && window.APP.camera && typeof window.APP.cinemaPathPlan === 'function' && window.THREE,
        { timeout: 300000, polling: 500 });
    },
    async waitLoaded() {
      await page.waitForFunction(() => window.APP.activeBuilding && window.APP.db && window.APP.buildingsRendered &&
        window.APP.buildingsRendered.has(window.APP.activeBuilding) && !window.APP.streaming, { timeout: 600000, polling: 1000 });
    },
    async close() {
      await browser.close().catch(() => {});
      server.close();
      fs.rmSync(profile, { recursive: true, force: true });
    }
  };
}
module.exports = { start, ROOT };
