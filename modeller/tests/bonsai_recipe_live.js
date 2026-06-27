// W-BONSAI-RECIPE — in-viewer leg 3 witness (prompts/BONSAI_KERNEL_RESEARCH.md Item 2 leg 3).
// CLAIM: the modeller's op-log IS the feature tree and geometry is a deterministic FOLD over it.
// Commit a wall (#1), pick it, cut an opening as a CHILD of #1 (GEOM_CUT references the parent solid),
// then scrub history BACK (the opening disappears) and FORWARD (it returns byte-identically). Proves
// interactive opening-on-a-picked-wall + history-scrubber replay, on the alternative viewer.
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
  pg.on('console', m => { const t = m.text(); if (/^§(OPLOG|MODELLER|BONSAI)/.test(t)) { logs.push(t); console.log('  ' + t); } });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 300)));
  await pg.goto(`http://localhost:${port}/modeller.html?recipe=demo`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__recipeDone === true', { timeout: 120000 })
    .catch(() => console.log('  ✗ timeout waiting for __recipeDone'));

  const probe = await pg.evaluate(() => {
    const res = window.__recipeResult || {};
    const g = window.A && window.A.scene && window.A.scene.getObjectByName('BonsaiAuthored');
    const meshes = g ? g.children.filter(o => o.isMesh).length : 0;
    const sel = g && g.children.find(o => o.isMesh && o.material && o.material.emissive && o.material.emissive.getHex() !== 0);
    const r = window.A.renderer; r.render(window.A.scene, window.A.camera);
    const gl = r.getContext(); const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let lit = 0; for (let i = 0; i < px.length; i += 4) { if (px[i] > 40 || px[i + 1] > 44 || px[i + 2] > 52) lit++; }
    return { res, meshes, litPct: +(100 * lit / (w * h)).toFixed(1) };
  }).catch(e => ({ err: String(e) }));

  const x = probe.res || {};
  console.log('  §BONSAI-RECIPE wall#=' + x.wallId + ' picked=' + x.picked + ' afterWall=' + x.afterWall +
    ' afterCut=' + x.afterCut + ' scrubBack=' + x.scrubBack + ' scrubFwd=' + x.scrubFwd +
    ' rows=' + x.rows + ' meshes=' + probe.meshes + ' litPixels=' + probe.litPct + '%');

  await br.close(); server.close();

  const pickOK = x.picked === x.wallId && x.wallId != null;
  const cutChanged = x.afterCut > x.afterWall && x.afterWall > 0;       // opening added geometry
  const replayOK = x.scrubBack === x.afterWall && x.scrubFwd === x.afterCut;  // back=hole gone, fwd=hole back, deterministic
  const drew = probe.meshes >= 1 && probe.litPct > 0.5;
  const pass = pickOK && cutChanged && replayOK && drew && x.rows === 2;
  console.log('  §BONSAI-RECIPE VERDICT ' + (pass ? 'PASS' : 'FAIL') +
    ' — pick=' + pickOK + ' cutChanged=' + cutChanged + ' replayDeterministic=' + replayOK + ' drew=' + drew);
  console.log('── W-BONSAI-RECIPE ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
