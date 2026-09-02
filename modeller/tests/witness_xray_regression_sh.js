#!/usr/bin/env node
// W-XRAY-REVEAL-LIVE, corrected serving root (modeller/tests/bonsai_xray_reveal_live.js serves from the
// wrong path root and fails with "Cannot read properties of null (reading 'exec')" even on unmodified
// origin/main HEAD — pre-existing, unrelated to XRAY_FIXTURE_CLASSIFICATION_FIX.md). Same in-page self-test
// (window.__xrayResult/__xrayDone, modeller.html qs.get('routewalk')==='xray' block), served correctly from
// the repo root at /modeller/modeller.html — the same convention witness_xray_poc.js and witness_e2e_walk.js
// already use. Regression control for the autoRouteMEP/placeAssembly (BUILDING_SH_STD, 23 fixtures) population
// that XRAY_FIXTURE_CLASSIFICATION_FIX.md's dwDisc-only gate would have broken.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream' };
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); }); });

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage();
  pg.on('console', m => { const t = m.text(); if (/^§(RW|MODELLER)/.test(t)) console.log('  ' + t); });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 300)));
  await pg.goto(`http://localhost:${port}/modeller/modeller.html?routewalk=xray`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__xrayDone === true', { timeout: 60000 }).catch(() => console.log('  ✗ timeout waiting for __xrayDone'));

  const x = await pg.evaluate(() => window.__xrayResult || {});
  console.log('  §XRAY fixtures=' + x.fixtures + ' glass=' + x.glass + ' glow=' + x.glow +
    ' glassOK=' + x.glassOK + ' glowOK=' + x.glowOK + ' glowColourOK=' + x.glowColourOK + ' shineThrough=' + x.shineThrough +
    ' structureRestored=' + x.structureRestored + ' stillGlowing=' + x.stillGlowing +
    ' fixturesColouredAfter=' + x.fixturesColouredAfter + ' verify=' + x.verify + ' pageSelfTestPass=' + x.pass);

  await br.close(); server.close();
  const pass = x.pass === true;
  console.log('── W-XRAY-REGRESSION-SH ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
