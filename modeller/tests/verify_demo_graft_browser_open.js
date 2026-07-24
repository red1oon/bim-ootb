#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — verify_demo_graft_browser_open.js scope (read the log after every run)
 * SCOPE: SPEC_MESH_FIT_GRAFT_HEAL_ENGINE.md §10 Step 3.1, SECONDARY/wiring-only evidence (this project's
 * own testing hierarchy -- CLAUDE.md "Browser testing: §-log first, Playwright second... for wiring/deploy
 * checks only, not value verification"). The VALUE-level open-test (does the target guid resolve through
 * real_geometry.js's normal MEASURED path, does its placed bbox match ground truth) is already proven at
 * the module level, with real §-tagged numbers, inside bake_demo_graft.js's own automatic post-bake
 * §DEMO_GRAFT_OPEN_TEST step -- NOT repeated here. This script answers a narrower, real-browser-only
 * question: does loading the baked demo file through the REAL production open path (str_walker_outliner.js
 * `_openBuffer`, the exact function drag-and-drop / Open-panel invoke) throw, or leave the app in an error
 * state, for a file this large (263MB) with a freshly-added geometry row? Zero screenshots (this project's
 * FUNDAMENTAL LAW) -- pass/fail is JS-error-count + console-log evidence only.
 *
 * Usage: node verify_demo_graft_browser_open.js <path-to-baked.db>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));

const TAG = '§DEMO_GRAFT_BROWSER_OPEN';
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream' };

function serve(bakedPath) {
  return http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
    // special route: stream the baked demo file from wherever it actually lives (outside ROOT, e.g. the
    // scratchpad) -- avoids a huge base64 round-trip through page.evaluate for a 263MB building file.
    if (p === '/__baked_file') { r.writeHead(200, { 'Content-Type': 'application/octet-stream' }); fs.createReadStream(bakedPath).pipe(r); return; }
    fs.readFile(path.join(ROOT, p), (e, b) => {
      if (e) { r.writeHead(404); r.end('404 ' + p); return; }
      r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b);
    });
  });
}

(async () => {
  const bakedPath = process.argv[2];
  if (!bakedPath || !fs.existsSync(bakedPath)) { console.error(TAG + ' FATAL usage: node verify_demo_graft_browser_open.js <path-to-baked.db>'); process.exit(1); }
  const targetGuid = process.argv[3] || null;

  const server = serve(bakedPath);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage();
  await pg.setViewport({ width: 1024, height: 768 });

  const pageErrors = [];
  pg.on('pageerror', e => pageErrors.push(String(e).slice(0, 300)));
  const slog = [];
  pg.on('console', m => { const t = m.text(); if (/^§/.test(t)) slog.push(t); });

  await pg.goto('http://localhost:' + port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 30000 });
  await pg.waitForFunction(() => !!(window.STRWalkerOutliner && window.SQL), { timeout: 20000 }).catch(() => {});
  const bootReady = await pg.evaluate(() => !!(window.STRWalkerOutliner && window.SQL && window.Bonsai));
  console.log(TAG + ' app_booted=' + bootReady + ' pageErrorsAtBoot=' + pageErrors.length);

  if (!bootReady) { console.error(TAG + ' FATAL app did not boot (STRWalkerOutliner/SQL/Bonsai globals not ready)'); await br.close(); server.close(); process.exit(1); }

  // load the baked file's bytes into the page (streamed from the server's /__baked_file route -- avoids a
  // huge base64 round-trip through page.evaluate for a 263MB building file) and open it via the REAL
  // production _openBuffer path (the exact function drag-and-drop invokes -- see str_walker_outliner.js
  // `openStrDb`/`fr.onload`).
  const t0 = Date.now();
  const openResult = await pg.evaluate(async (name) => {
    const buf = await fetch('/__baked_file').then(r => r.arrayBuffer());
    const ok = window.STRWalkerOutliner._openBuffer(buf, name);
    return { ok, byteLength: buf.byteLength };
  }, 'HospitalSprinklerGraftDemo');
  const openMs = Date.now() - t0;
  console.log(TAG + ' openBuffer_returned=' + openResult.ok + ' elapsed_ms=' + openMs + ' pageErrorsAfterOpen=' + pageErrors.length);

  let guidCheck = { checked: false };
  if (targetGuid) {
    guidCheck = await pg.evaluate((guid) => {
      // window.__dwBuf is stashed by _openBuffer -- re-open a throwaway read-only handle to confirm the
      // SAME bytes we just loaded resolve this guid to a non-degenerate geometry row, exactly the numbers
      // the module-level §DEMO_GRAFT_OPEN_TEST already proved -- here just confirming the IN-BROWSER sql.js
      // build reads the same file identically (a real cross-check, not a repeat of the same code path).
      try {
        const db = new window.SQL.Database(new Uint8Array(window.__dwBuf));
        const r = db.exec("SELECT i.geometry_hash FROM element_instances i WHERE i.guid=?", [guid]);
        if (!r.length) return { checked: true, found: false };
        const hash = r[0].values[0][0];
        const g = db.exec("SELECT vertices FROM component_geometries WHERE geometry_hash=?", [hash]);
        const vertCount = g.length ? (g[0].values[0][0].length / 4 / 3) : 0;
        db.close();
        return { checked: true, found: true, hash, vertCount };
      } catch (e) { return { checked: true, error: String(e && e.message) }; }
    }, targetGuid);
    console.log(TAG + ' target_guid_check=' + JSON.stringify(guidCheck));
  }

  console.log(TAG + ' total_page_errors=' + pageErrors.length + (pageErrors.length ? ' FIRST=' + pageErrors[0] : ''));
  const pass = bootReady && openResult.ok === true && pageErrors.length === 0 && (!targetGuid || (guidCheck.found && guidCheck.vertCount > 0));
  console.log(TAG + ' RESULT ' + (pass ? 'PASS' : 'FAIL') + ' (wiring-only claim: real Modeller open path did not throw/error loading this baked file)');

  await br.close();
  server.close();
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error(TAG + ' FATAL', e); process.exit(1); });
