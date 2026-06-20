// W-ROUTEWALK-AUTODROP — auto-emit MEP on building-drop, IN the real modeller.
// CLAIM: dropping a real Duplex FLOOR (structural BOM, MEP=0) through the REAL placeAssembly path auto-fires
// RouteWalker: it routes the building's MEP from the real mep_rw.db anchors (the structural drop has none),
// REGISTERS the anchor-space runs to the just-placed floor's WORLD bbox (rwAlignSegments), and commits each as
// a signed GEOM_SWEEP. Asserts: structural leaves placed; auto-route found MEP + emitted a bounded set; every
// run signed + the chain verifies; every run lands INSIDE the placed footprint (alignment); folded + Routes cat.
const http = require('http'), fs = require('fs'), path = require('path');
const VIEWER = path.join('/tmp/wt-routewalk2', 'viewer');
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
  pg.on('console', m => { const t = m.text(); if (/^§(RW|MODELLER (autoroute|assembly|routewalk))/.test(t)) console.log('  ' + t); });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 300)));
  await pg.goto(`http://localhost:${port}/modeller.html?routewalk=drop`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__routewalkDropDone === true', { timeout: 180000 })
    .catch(() => console.log('  ✗ timeout waiting for __routewalkDropDone'));

  const probe = await pg.evaluate(() => {
    const res = window.__routewalkDropResult || {};
    const r = window.A.renderer; r.render(window.A.scene, window.A.camera);
    const gl = r.getContext(); const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let lit = 0; for (let i = 0; i < px.length; i += 4) { if (px[i] > 40 || px[i + 1] > 44 || px[i + 2] > 52) lit++; }
    return { res, litPct: +(100 * lit / (w * h)).toFixed(1) };
  }).catch(e => ({ err: String(e) }));

  const x = probe.res || {};
  console.log('  §AUTODROP structuralLeaves=' + x.structuralLeaves + ' structuralCommitted=' + x.structuralCommitted +
    ' found=' + x.found + ' emitted=' + x.emitted + ' routed=' + x.routed + ' sweepRows=' + x.sweepRows +
    ' cornerRegistered=' + x.cornerRegistered + ' runsInBBox=' + x.runsInBBox + ' runLenSum=' + x.runLenSum +
    ' placedMin=[' + x.placedMin + '] alignedMin=[' + x.alignedMin + '] signed=' + x.signed + ' verify=' + x.verify +
    ' totalOps=' + x.totalOps + ' tris=' + x.tris + ' routesCategory=' + x.routesCategory +
    ' litPixels=' + probe.litPct + '%' + (x.error ? ' ERROR=' + x.error : ''));

  await br.close(); server.close();

  const dropped = x.structuralLeaves === 7 && x.structuralCommitted === 7;     // real Duplex floor placed (structural)
  const foundMEP = x.found > 100;                                              // routed the building's MEP from real anchors
  const emittedBounded = x.emitted === 8 && x.routed === 8 && x.sweepRows === 8; // bounded auto-emit (cap=8) all committed
  const allSigned = x.signed === (7 + 8);                                      // 7 GEOM_INSERT + 8 GEOM_SWEEP all signed
  const registered = x.cornerRegistered === true && x.runsInBBox === 8;        // routes targeted + contained in the footprint
  const realRuns = x.runLenSum > 1.0;                                          // runs span real distance (not collapsed)
  const chainOK = x.verify === true;
  const inOutliner = x.routesCategory === true;
  const drew = probe.litPct > 0.5;
  const pass = dropped && foundMEP && emittedBounded && allSigned && registered && realRuns && chainOK && inOutliner && drew;
  console.log('  §AUTODROP VERDICT ' + (pass ? 'PASS' : 'FAIL') +
    ' — floorDropped=' + dropped + ' foundMEP=' + foundMEP + ' emittedBounded=' + emittedBounded +
    ' allSigned=' + allSigned + ' routesRegistered=' + registered + ' realRuns=' + realRuns +
    ' chainVerifies=' + chainOK + ' inOutlinerRoutes=' + inOutliner + ' drew=' + drew);
  console.log('── W-ROUTEWALK-AUTODROP ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
