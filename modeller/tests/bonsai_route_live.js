// W-BONSAI-ROUTE — Bonsai modeller DEPTH leg 1 witness (prompts/BONSAI_KERNEL_RESEARCH.md §NEXT depth track).
// CLAIM: the occt SWEEP shoulder (kernel.pipe) is now WIRED TO THE TOOLBAR with interactive path-pick — no
// longer engine-only (?sweep=demo). Driving the REAL UI handlers (Route button → simulated ground pointerdowns
// → Sweep Run button), an L-shaped ground route commits as ONE signed GEOM_SWEEP op, folds to a solid whose
// bounding box spans BOTH legs of the L (x≈3, y≈2 — a real swept run, not a degenerate box), the chain verifies
// and is signed, the Outliner shows the run under a Routes category, and scrub replays it deterministically.
const http = require('http'), fs = require('fs'), path = require('path');
const VIEWER = path.join('/tmp/wt-bonsai', 'viewer');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.map': 'application/json' };
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
  const logs = [];
  pg.on('console', m => { const t = m.text(); if (/^§(OPLOG|MODELLER|OUTLINER|KRN|KERNEL_OPS)/.test(t)) { logs.push(t); console.log('  ' + t); } });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 300)));
  await pg.goto(`http://localhost:${port}/modeller.html?route=demo`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__routeDone === true', { timeout: 120000 })
    .catch(() => console.log('  ✗ timeout waiting for __routeDone'));

  const probe = await pg.evaluate(() => {
    const res = window.__routeResult || {};
    const r = window.A.renderer; r.render(window.A.scene, window.A.camera);
    const gl = r.getContext(); const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let lit = 0; for (let i = 0; i < px.length; i += 4) { if (px[i] > 40 || px[i + 1] > 44 || px[i + 2] > 52) lit++; }
    return { res, litPct: +(100 * lit / (w * h)).toFixed(1) };
  }).catch(e => ({ err: String(e) }));

  const x = probe.res || {};
  const sz = x.size || {};
  console.log('  §BONSAI-ROUTE routing=' + x.routing + ' pts=' + x.points + ' runEnabled=' + x.runEnabled +
    ' exitedRoute=' + x.exitedRoute + ' sweepOps=' + x.sweepOps + ' signed=' + x.signed + ' verify=' + x.verify +
    ' bbox=[' + sz.x + ',' + sz.y + ',' + sz.z + '] tris=' + x.tris +
    ' routeRow="' + x.routeRow + '" routesCategory=' + x.routesCategory +
    ' scrub0=' + x.scrub0 + ' scrub1=' + x.scrub1 + ' litPixels=' + probe.litPct + '%');

  await br.close(); server.close();

  const pickedPath = x.points === 3 && x.runEnabled === true;        // 3 ground clicks landed → Sweep Run armed
  const oneSignedSweep = x.sweepOps === 1 && x.signed === 1 && x.verify === true;
  const spansL = sz.x > 2.5 && sz.y > 1.5;                            // bbox covers the 3m + 2m legs of the L route
  const swept = x.tris > 12;                                          // richer than a box
  const inOutliner = x.routesCategory === true && /Run/.test(x.routeRow || '');
  const replayOK = x.scrub0 === 0 && x.scrub1 === x.tris;            // deterministic prefix fold over the signed log
  const exited = x.exitedRoute === true;
  const drew = probe.litPct > 0.5;
  const pass = x.routing === true && pickedPath && oneSignedSweep && spansL && swept && inOutliner && replayOK && exited && drew;
  console.log('  §BONSAI-ROUTE VERDICT ' + (pass ? 'PASS' : 'FAIL') +
    ' — enteredRouteMode=' + (x.routing === true) + ' pickedPath=' + pickedPath + ' oneSignedSweep=' + oneSignedSweep +
    ' spansLpath=' + spansL + ' swept=' + swept + ' inOutlinerRoutes=' + inOutliner +
    ' replayDeterministic=' + replayOK + ' exitedRoute=' + exited + ' drew=' + drew);
  console.log('── W-BONSAI-ROUTE ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
