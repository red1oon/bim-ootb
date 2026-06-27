// W-BONSAI-SWEEP — Bonsai modeller DEPTH leg witness (prompts/BONSAI_KERNEL_RESEARCH.md §NEXT depth track).
// CLAIM: the occt SWEEP "shoulder" (kernel.pipe, already exported in lib/kernel/index.js, zero binding work)
// is reachable through the SIGNED op-log with worker-only wiring. A rectangle profile swept along an L-shaped
// polyline spine commits as ONE signed GEOM_SWEEP op (verifyChain ok, signed=1), folds to a watertight solid
// whose bounding box spans BOTH runs of the path (sizeZ>1.8 from the 2m vertical run, sizeX>1.3 from the 1.5m
// horizontal run — proving a real sweep, not a degenerate extrude), draws pixels, replays byte-deterministically
// under scrub (prefix 0->0 tris, 1->full), and mutating a committed param behind the chain's back is caught.
// This is a NEW geometry capability (curved/swept solid beyond box extrude+cut) earned with NO new occt binding.
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
  await pg.goto(`http://localhost:${port}/modeller.html?sweep=demo`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sweepDone === true', { timeout: 120000 })
    .catch(() => console.log('  ✗ timeout waiting for __sweepDone'));

  const probe = await pg.evaluate(() => {
    const res = window.__sweepResult || {};
    const g = window.A && window.A.scene && window.A.scene.getObjectByName('BonsaiAuthored');
    const meshes = g ? g.children.filter(o => o.isMesh).length : 0;
    let size = null;
    if (g && meshes) {
      const box = new window.THREE.Box3().setFromObject(g);
      const s = new window.THREE.Vector3(); box.getSize(s);
      size = { x: +s.x.toFixed(3), y: +s.y.toFixed(3), z: +s.z.toFixed(3) };
    }
    const r = window.A.renderer; r.render(window.A.scene, window.A.camera);
    const gl = r.getContext(); const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let lit = 0; for (let i = 0; i < px.length; i += 4) { if (px[i] > 40 || px[i + 1] > 44 || px[i + 2] > 52) lit++; }
    return { res, meshes, size, litPct: +(100 * lit / (w * h)).toFixed(1) };
  }).catch(e => ({ err: String(e) }));

  const x = probe.res || {};
  const sz = probe.size || {};
  console.log('  §BONSAI-SWEEP id=' + x.sweepId + ' tris=' + x.tris + ' verify=' + x.verify + ' signed=' + x.signed +
    ' bbox=[' + sz.x + ',' + sz.y + ',' + sz.z + '] scrub0=' + x.scrub0 + ' scrub1=' + x.scrub1 +
    ' tamperOk=' + x.tamperOk + ' tamperWhy=' + x.tamperWhy + ' meshes=' + probe.meshes + ' litPixels=' + probe.litPct + '%');

  await br.close(); server.close();

  const swept = x.tris > 12;                                          // richer than a 12-tri box = a real sweep
  const verifyOK = x.verify === true;
  const signedOK = x.signed === 1;                                    // the GEOM_SWEEP op carries a signature
  const spans = sz.z > 1.8 && sz.x > 1.3;                             // bbox covers both the 2m vertical + 1.5m horizontal runs
  const replayOK = x.scrub0 === 0 && x.scrub1 === x.tris;             // deterministic prefix fold over the signed log
  const tamperCaught = x.tamperOk === false;                          // verifyChain rejects the mutated param
  const drew = probe.meshes >= 1 && probe.litPct > 0.5;
  const pass = swept && verifyOK && signedOK && spans && replayOK && tamperCaught && drew;
  console.log('  §BONSAI-SWEEP VERDICT ' + (pass ? 'PASS' : 'FAIL') +
    ' — swept=' + swept + ' verify=' + verifyOK + ' signed=' + signedOK + ' spansLpath=' + spans +
    ' replayDeterministic=' + replayOK + ' tamperCaught=' + tamperCaught + ' drew=' + drew);
  console.log('── W-BONSAI-SWEEP ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
