// W-BONSAI-FILLET — Bonsai modeller DEPTH leg 2 witness (prompts/BONSAI_KERNEL_RESEARCH.md §NEXT depth track).
// CLAIM: the occt fillet/chamfer shoulders (index.js fillet/chamfer) are reachable through the SIGNED op-log,
// with the NEW input device they needed — EDGE PICKING. Driving the REAL UI (select solid → Fillet button →
// simulated click on the longest edge's marker → Apply), a signed GEOM_FILLET rounds the picked edge: the solid
// gains triangles (a rounded edge is richer than a sharp box), the chain verifies + is signed, the Outliner shows
// a Fillets category, scrub replays deterministically (prefix 1=plain wall tris, 2=filleted), and a kind:'chamfer'
// op proves the chamfer shoulder on the same edge. Edge indices are stable across the deterministic re-fold.
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
  pg.on('console', m => { const t = m.text(); if (/^§(OPLOG|MODELLER|OUTLINER|KRN|KERNEL_OPS)/.test(t)) console.log('  ' + t); });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 300)));
  await pg.goto(`http://localhost:${port}/modeller.html?fillet=demo`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__filletDone === true', { timeout: 120000 })
    .catch(() => console.log('  ✗ timeout waiting for __filletDone'));

  const probe = await pg.evaluate(() => {
    const res = window.__filletResult || {};
    const r = window.A.renderer; r.render(window.A.scene, window.A.camera);
    const gl = r.getContext(); const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let lit = 0; for (let i = 0; i < px.length; i += 4) { if (px[i] > 40 || px[i + 1] > 44 || px[i + 2] > 52) lit++; }
    return { res, litPct: +(100 * lit / (w * h)).toFixed(1) };
  }).catch(e => ({ err: String(e) }));

  const x = probe.res || {};
  console.log('  §BONSAI-FILLET edgeCount=' + x.edgeCount + ' longestLen=' + x.longestLen + ' picked=' + x.pickedCount +
    ' applyEnabled=' + x.applyEnabled + ' exited=' + x.exited + ' afterWall=' + x.afterWall + ' afterFillet=' + x.afterFillet +
    ' signed=' + x.signed + ' verify=' + x.verify + ' filletRow="' + x.filletRow + '" filletsCategory=' + x.filletsCategory +
    ' scrub1=' + x.scrub1 + ' scrub2=' + x.scrub2 + ' chamferTris=' + x.chamferTris + ' chamferVerify=' + x.chamferVerify +
    ' litPixels=' + probe.litPct + '%' + (x.error ? ' ERROR=' + x.error : ''));

  await br.close(); server.close();

  const edgesReported = x.edgeCount === 12;                          // a box-like extrude solid has 12 edges
  const pickedAnEdge = x.pickedCount === 1 && x.applyEnabled === true;
  const rounded = x.afterFillet > x.afterWall;                       // a rounded edge adds triangles
  const signedOK = x.signed === 2 && x.verify === true;              // wall + fillet, both signed, chain verifies
  const inOutliner = x.filletsCategory === true && /Round/.test(x.filletRow || '');
  const replayOK = x.scrub1 === x.afterWall && x.scrub2 === x.afterFillet;
  const exited = x.exited === true;
  const chamferOK = x.chamferTris > x.afterWall && x.chamferVerify === true;   // chamfer shoulder also folds + signs
  const drew = probe.litPct > 0.5;
  const pass = edgesReported && pickedAnEdge && rounded && signedOK && inOutliner && replayOK && exited && chamferOK && drew;
  console.log('  §BONSAI-FILLET VERDICT ' + (pass ? 'PASS' : 'FAIL') +
    ' — edgesReported=' + edgesReported + ' pickedAnEdge=' + pickedAnEdge + ' rounded=' + rounded +
    ' signed=' + signedOK + ' inOutlinerFillets=' + inOutliner + ' replayDeterministic=' + replayOK +
    ' exited=' + exited + ' chamfer=' + chamferOK + ' drew=' + drew);
  console.log('── W-BONSAI-FILLET ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
