// W-BONSAI-SIGNED — in-viewer leg 3b witness (prompts/BONSAI_KERNEL_RESEARCH.md Item 2 leg 3b).
// CLAIM: on the alternative modeller, authored geometry rides the SHIPPED SIGNED op-log (kernel_ops):
// each feature commits as a signed op-group (hash chain + edge signature), the chain verifies, the
// rendered solids are a deterministic fold of the verified log (scrub back/fwd identical), and mutating
// a committed parameter behind the chain's back is caught by verifyChain. One signed op-log now backs
// BOTH ERP records and BIM geometry, fully in-browser. Closes the doctrine loop of W-KERNEL-SIGNED, live.
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
  pg.on('console', m => { const t = m.text(); if (/^§(OPLOG|MODELLER|KRN|KERNEL_OPS)/.test(t)) { logs.push(t); console.log('  ' + t); } });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 300)));
  await pg.goto(`http://localhost:${port}/modeller.html?signed=demo`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__signedDone === true', { timeout: 120000 })
    .catch(() => console.log('  ✗ timeout waiting for __signedDone'));

  const probe = await pg.evaluate(() => {
    const res = window.__signedResult || {};
    const g = window.A && window.A.scene && window.A.scene.getObjectByName('BonsaiAuthored');
    const meshes = g ? g.children.filter(o => o.isMesh).length : 0;
    const r = window.A.renderer; r.render(window.A.scene, window.A.camera);
    const gl = r.getContext(); const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let lit = 0; for (let i = 0; i < px.length; i += 4) { if (px[i] > 40 || px[i + 1] > 44 || px[i + 2] > 52) lit++; }
    return { res, meshes, litPct: +(100 * lit / (w * h)).toFixed(1) };
  }).catch(e => ({ err: String(e) }));

  const x = probe.res || {};
  console.log('  §BONSAI-SIGNED wall#=' + x.wallId + ' verifyWall=' + x.verifyWall + ' verifyCut=' + x.verifyCut +
    ' signed=' + x.signed + ' afterWall=' + x.afterWall + ' afterCut=' + x.afterCut +
    ' scrubBack=' + x.scrubBack + ' scrubFwd=' + x.scrubFwd + ' tamperOk=' + x.tamperOk + ' tamperWhy=' + x.tamperWhy +
    ' meshes=' + probe.meshes + ' litPixels=' + probe.litPct + '%');

  await br.close(); server.close();

  const verifyOK = x.verifyWall === true && x.verifyCut === true;
  const signedOK = x.signed === 2;                                        // both committed ops carry a signature
  const cutChanged = x.afterCut > x.afterWall && x.afterWall > 0;
  const replayOK = x.scrubBack === x.afterWall && x.scrubFwd === x.afterCut;  // deterministic fold over the signed log
  const tamperCaught = x.tamperOk === false;                             // verifyChain rejects the mutated param
  const drew = probe.meshes >= 1 && probe.litPct > 0.5;
  const pass = verifyOK && signedOK && cutChanged && replayOK && tamperCaught && drew;
  console.log('  §BONSAI-SIGNED VERDICT ' + (pass ? 'PASS' : 'FAIL') +
    ' — verify=' + verifyOK + ' signed=' + signedOK + ' replayDeterministic=' + replayOK +
    ' tamperCaught=' + tamperCaught + ' drew=' + drew);
  console.log('── W-BONSAI-SIGNED ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
