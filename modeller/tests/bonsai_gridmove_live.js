// W-BONSAI-GRIDMOVE — Bonsai modeller DEPTH leg 4 witness (prompts/BONSAI_KERNEL_RESEARCH.md §NEXT depth track).
// CLAIM: the shipped §S270 Grid Kinematics engine (GridKinematicEngine.dragGrid — a PURE recompose fn) now drives
// REAL authored geometry in the modeller. A thin wall ATTACHED to grid B and a wide wall whose right EDGE sits on
// grid B: entering Move-Grid mode and DRAGGING grid B (real pointer down→move→up) commits ONE signed GEOM_GRID_MOVE
// whose stored commands the worker folds — the attached wall TRANSLATES and the edge wall STRETCHES, so the scene's
// max-x grows from ~4.1 to >5.5; the chain verifies + is signed, the Outliner shows a Grid Moves row, and scrubbing
// back undoes the recompose deterministically (max-x returns to ~4.1). The parametric-grid payoff, no new binding.
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
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage();
  pg.on('console', m => { const t = m.text(); if (/^§(OPLOG|MODELLER|GRIDMOVE|OUTLINER|KRN)/.test(t)) console.log('  ' + t); });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 300)));
  await pg.goto(`http://localhost:${port}/modeller.html?gridmove=demo`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__gridmoveDone === true', { timeout: 120000 })
    .catch(() => console.log('  ✗ timeout waiting for __gridmoveDone'));

  const probe = await pg.evaluate(() => {
    const res = window.__gridmoveResult || {};
    const r = window.A.renderer; r.render(window.A.scene, window.A.camera);
    const gl = r.getContext(); const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let lit = 0; for (let i = 0; i < px.length; i += 4) { if (px[i] > 40 || px[i + 1] > 44 || px[i + 2] > 52) lit++; }
    return { res, litPct: +(100 * lit / (w * h)).toFixed(1) };
  }).catch(e => ({ err: String(e) }));

  const x = probe.res || {};
  const b = x.before || {}, a = x.after || {}, w1 = x.w1, w2 = x.w2;
  console.log('  §BONSAI-GRIDMOVE entered=' + x.entered + ' grabbed=' + x.grabbed + ' dragDelta=' + x.dragDelta +
    ' commands=' + JSON.stringify(x.commands) + ' maxXBefore=' + x.maxXBefore + ' maxXAfter=' + x.maxXAfter +
    ' exited=' + x.exited + ' signed=' + x.signed + ' verify=' + x.verify + ' gridOps=' + x.gridOps +
    ' moveRow="' + x.moveRow + '" gridMovesCategory=' + x.gridMovesCategory +
    ' scrubBack=' + x.scrubBack + ' scrubFwd=' + x.scrubFwd + ' litPixels=' + probe.litPct + '%' + (x.error ? ' ERROR=' + x.error : ''));
  console.log('  §BONSAI-GRIDMOVE wall1(ATTACH) x ' + JSON.stringify(b[w1] && b[w1].x) + '→' + JSON.stringify(a[w1] && a[w1].x) +
    '  wall2(EDGE) x ' + JSON.stringify(b[w2] && b[w2].x) + '→' + JSON.stringify(a[w2] && a[w2].x) +
    '  wall2 z ' + JSON.stringify(b[w2] && b[w2].z) + '→' + JSON.stringify(a[w2] && a[w2].z));

  await br.close(); server.close();

  const enteredMode = x.entered === true && x.grabbed === 'gx1';
  const dragged = Math.abs((x.dragDelta || 0) - 1.5) < 0.2;                       // pointer move produced ~+1.5
  const bothActions = Array.isArray(x.commands) && x.commands.includes('TRANSLATE') && x.commands.includes('SCALE');
  const recomposed = x.maxXAfter > 5.4 && x.maxXBefore < 4.6;                     // attached wall moved + edge wall stretched
  // ATTACH wall translated ~+1.5 in x (both endpoints shift), EDGE wall stretched in x (right edge ~5.5) with z intact.
  const w1Translated = b[w1] && a[w1] && Math.abs((a[w1].x[0] - b[w1].x[0]) - 1.5) < 0.2 && Math.abs((a[w1].x[1] - b[w1].x[1]) - 1.5) < 0.2;
  const w2Stretched = b[w2] && a[w2] && Math.abs(a[w2].x[0] - b[w2].x[0]) < 0.2 && a[w2].x[1] > 5.3 &&
    Math.abs(a[w2].z[0] - b[w2].z[0]) < 0.05 && Math.abs(a[w2].z[1] - b[w2].z[1]) < 0.05;   // x-only stretch, z untouched
  const oneSignedMove = x.gridOps === 1 && x.signed === 3 && x.verify === true;   // wall+wall+grid_move, all signed
  const inOutliner = x.gridMovesCategory === true && /Move gx1/.test(x.moveRow || '');
  const replayOK = Math.abs(x.scrubBack - x.maxXBefore) < 0.2 && Math.abs(x.scrubFwd - x.maxXAfter) < 0.2;
  const exited = x.exited === true;
  const drew = probe.litPct > 0.5;
  const pass = enteredMode && dragged && bothActions && recomposed && w1Translated && w2Stretched && oneSignedMove && inOutliner && replayOK && exited && drew;
  console.log('  §BONSAI-GRIDMOVE VERDICT ' + (pass ? 'PASS' : 'FAIL') +
    ' — enteredMode=' + enteredMode + ' dragged=' + dragged + ' translate+scale=' + bothActions + ' recomposed=' + recomposed +
    ' wall1Translated=' + w1Translated + ' wall2StretchedXonly=' + w2Stretched +
    ' oneSignedMove=' + oneSignedMove + ' inOutliner=' + inOutliner + ' replayDeterministic=' + replayOK + ' exited=' + exited + ' drew=' + drew);
  console.log('── W-BONSAI-GRIDMOVE ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
