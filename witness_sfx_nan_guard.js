#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-SFX-NAN-GUARD scope (READ THE LOG after every run)
 * SCOPE: viewer/sfx.js's _onCamChange() — a live user error report (2026-07-14, mobile Chrome/
 * Android, HHS_Office_Federated building) showed a repeating crash: "Uncaught TypeError: Failed
 * to execute 'setTargetAtTime' on 'AudioParam': The provided float value is non-finite." Root
 * cause: if cam.position or controls.target ever holds a non-finite component (an upstream
 * camera/orbit-controls edge case), the speed/frequency/gain values computed from it are NaN,
 * and Web Audio hard-rejects a non-finite AudioParam value by throwing. This witness reproduces
 * the exact crash live (forcing a NaN camera position + dispatching a real 'change' event on the
 * real OrbitControls-shaped object sfx.js listens to) and confirms the guard suppresses it.
 * RUN: node witness_sfx_nan_guard.js   (from the worktree root; spins its own local HTTP server)
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const ROOT = __dirname;

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

async function forceNanCamAndDispatch(pg) {
  return pg.evaluate(() => {
    const A = window.APP;
    if (!A || !A.camera || !A.controls) return { ok: false, why: 'no APP.camera/controls' };
    A.camera.position.x = NaN;   // the exact corruption shape reported live
    A.controls.dispatchEvent({ type: 'change' });   // the REAL event sfx.js's _wireControls() listens to
    return { ok: true };
  });
}

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

  // Turn SFX on so _onCamChange is actually wired (it no-ops entirely while _on is false)
  await pg.evaluate(() => { if (window.__sfx && window.__sfx.setOn) window.__sfx.setOn(true); });
  await new Promise(r => setTimeout(r, 300));

  const forceResult = await forceNanCamAndDispatch(pg);
  await new Promise(r => setTimeout(r, 300));

  chk('G0 APP.camera/controls reachable in this real page', forceResult.ok, JSON.stringify(forceResult));
  const nanErrs = errs.filter(e => /non-finite/i.test(e));
  console.log('  pageerrors seen: ' + errs.length + (nanErrs.length ? ' (' + nanErrs.length + ' non-finite)' : ''));
  chk('G1 forcing a NaN camera position + a real controls "change" event does NOT crash (§SFX-NAN-GUARD)',
    nanErrs.length === 0, nanErrs.join(' | ') || 'none');

  await br.close();
  await server.close();
  console.log('\n§W-SFX-NAN-GUARD DONE pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})();
