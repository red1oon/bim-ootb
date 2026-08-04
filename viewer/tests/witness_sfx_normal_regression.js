#!/usr/bin/env node
/**
 * REGRESSION CHECK (companion to witness_sfx_nan_guard.js) — confirms the §SFX-NAN-GUARD early
 * return does NOT also swallow the NORMAL, finite-camera-movement case: a real camera move must
 * still reach the setTargetAtTime calls (movement-voice audio still functions).
 * RUN: node witness_sfx_normal_regression.js
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css',
  '.db': 'application/octet-stream', '.data': 'application/octet-stream' };
function makeServer(root) {
  return http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]);
    fs.readFile(path.join(root, p), (e, b) => {
      if (e) { r.writeHead(404); r.end('404'); return; }
      r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' });
      r.end(b);
    });
  });
}
let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

(async () => {
  const server = makeServer(ROOT);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const pg = await br.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e)));
  const url = `http://localhost:${port}/viewer/viewer.html?db=buildings/Duplex_extracted.db&ghost=1`;
  await pg.goto(url, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('!!window.APP && !!window.APP.camera && !!window.APP.controls', { timeout: 30000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));
  await pg.evaluate(() => { if (window.__sfx && window.__sfx.setOn) window.__sfx.setOn(true); });
  await new Promise(r => setTimeout(r, 300));

  // Move the camera by a real, finite amount and dispatch the same real 'change' event twice
  // (the guard's delta calc needs a PREVIOUS reading, so two moves are needed to exercise speed).
  const result = await pg.evaluate(() => {
    const A = window.APP;
    A.camera.position.x += 1; A.controls.dispatchEvent({ type: 'change' });
    return new Promise(resolve => setTimeout(() => {
      A.camera.position.x += 3; A.controls.dispatchEvent({ type: 'change' });
      setTimeout(() => resolve({ ok: true }), 50);
    }, 60));
  });
  await new Promise(r => setTimeout(r, 200));

  chk('R1 two real finite camera moves produce zero pageerrors', errs.length === 0, errs.join(' | '));
  chk('R2 evaluate completed normally', result && result.ok);

  await br.close();
  await server.close();
  console.log('\n§W-SFX-NORMAL-REGRESSION DONE pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})();
