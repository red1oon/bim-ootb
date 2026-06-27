// W-ROUTEWALK-MODELLER — RouteWalker MEP → op-log emit, IN the real modeller.
// CLAIM: the routewalker.js port proven against real mep_rw.db (W-ROUTEWALKER-MEP 7/7, bim-compiler) now runs
// INSIDE the op-log-native modeller. Driving ?routewalk=demo: load mep_rw.db, route Duplex MEP from the REAL
// anchors (rwRouteSegments → 204 runs), drop-transform a bounded subset (rwSweepOps, LIMIT=6) and commit EACH as
// a signed GEOM_SWEEP. Each run folds to a real pipe solid (tris>12), all verify on the hash chain, they land
// under the Outliner Routes category, the scene draws, and scrub replays the prefix fold deterministically.
const http = require('http'), fs = require('fs'), path = require('path');
const VIEWER = path.join('/tmp/wt-routewalk', 'viewer');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.map': 'application/json',
  '.db': 'application/octet-stream' };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller.html';
  fs.readFile(path.join(VIEWER, p), (e, b) => {
    if (e) { r.writeHead(404); r.end('404 ' + p); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b);
  });
});
(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
           '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage();
  pg.on('console', m => { const t = m.text(); if (/^§(RW|MODELLER|OPLOG)/.test(t)) console.log('  ' + t); });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 300)));
  await pg.goto(`http://localhost:${port}/modeller.html?routewalk=demo`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__routewalkDone === true', { timeout: 180000 })
    .catch(() => console.log('  ✗ timeout waiting for __routewalkDone'));

  const probe = await pg.evaluate(() => {
    const res = window.__routewalkResult || {};
    const r = window.A.renderer; r.render(window.A.scene, window.A.camera);
    const gl = r.getContext(); const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let lit = 0; for (let i = 0; i < px.length; i += 4) { if (px[i] > 40 || px[i + 1] > 44 || px[i + 2] > 52) lit++; }
    return { res, litPct: +(100 * lit / (w * h)).toFixed(1) };
  }).catch(e => ({ err: String(e) }));

  const x = probe.res || {}; const sz = x.size || {};
  console.log('  §ROUTEWALK rwReady=' + x.rwReady + ' segments=' + x.segments + ' ops=' + x.ops +
    ' runLenSum=' + x.runLenSum + ' committed=' + x.committed + ' solids=' + x.solids + ' sweepRows=' + x.sweepRows +
    ' signed=' + x.signed + ' verify=' + x.verify + ' tris=' + x.tris + ' spanMax=' + x.spanMax +
    ' bbox=[' + sz.x + ',' + sz.y + ',' + sz.z + '] routesCategory=' + x.routesCategory +
    ' scrub0=' + x.scrub0 + ' scrubAll=' + x.scrubAll +
    ' litPixels=' + (probe.litPct) + '%' + (x.error ? ' ERROR=' + x.error : ''));

  await br.close(); server.close();

  const routed = x.rwReady === true && x.segments >= 200;          // real mep_rw.db routed Duplex MEP
  const emittedBounded = x.ops === 6 && x.sweepRows === 6;         // bounded subset → 6 GEOM_SWEEP op-rows
  const allSigned = x.committed === 6 && x.signed === 6;           // every emitted run is a signed commit
  const realSolids = x.solids === 6 && x.tris >= 72;             // each folded to a real swept solid (straight pipe = 12-tri box)
  const spansRuns = x.spanMax > 0.5 && x.runLenSum > 1.0;        // runs SPAN their real segment lengths (a routed MEP run, not a blob)
  const chainOK = x.verify === true;                            // hash chain verifies over the emitted runs
  const inOutliner = x.routesCategory === true;                // runs grouped under Routes
  const replayOK = x.scrub0 === 0 && x.scrubAll === x.tris;     // deterministic prefix fold over the signed log
  const drew = probe.litPct > 0.5;
  const pass = routed && emittedBounded && allSigned && realSolids && spansRuns && chainOK && inOutliner && replayOK && drew;
  console.log('  §ROUTEWALK VERDICT ' + (pass ? 'PASS' : 'FAIL') +
    ' — routedReal=' + routed + ' emittedBounded=' + emittedBounded + ' allSigned=' + allSigned +
    ' realSolids=' + realSolids + ' spansRealRuns=' + spansRuns + ' chainVerifies=' + chainOK +
    ' inOutlinerRoutes=' + inOutliner + ' replayDeterministic=' + replayOK + ' drew=' + drew);
  console.log('── W-ROUTEWALK-MODELLER ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
