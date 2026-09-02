// W-BONSAI-VIEWER — in-viewer leg 1 witness (prompts/BONSAI_KERNEL_RESEARCH.md Item 2).
// CLAIM: the SHIPPING modeller surface (modeller.html + bonsai_kernel.js + bonsai_kernel_worker.js)
// folds a kernel_ops op-row through occt-wasm IN A MODULE WORKER and the resulting solid lands in
// the alternative viewer's THREE scene (A.scene) and REALLY DRAWS — on the production three.js stack,
// without touching viewer.html. Wall bbox matches the kernel; the opening cut changes the geometry.
// Run: node viewer/tests/bonsai_kernel_live.js   (puppeteer borrowed from ~/bim-compiler)
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
  pg.on('console', m => { const t = m.text(); if (/^§(BONSAI|MODELLER)/.test(t)) { logs.push(t); console.log('  ' + t); } });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 300)));
  await pg.goto(`http://localhost:${port}/modeller.html?author=both`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__authorDone === true', { timeout: 120000 })
    .catch(() => console.log('  ✗ timeout waiting for __authorDone'));

  // In-scene proof: count meshes under the BonsaiAuthored group, and lit pixels actually drawn.
  const probe = await pg.evaluate(() => {
    const g = window.A && window.A.scene && window.A.scene.getObjectByName('BonsaiAuthored');
    const meshes = g ? g.children.filter(o => o.isMesh).length : 0;
    // lit-pixel count: read the framebuffer, count non-background pixels
    const r = window.A.renderer; r.render(window.A.scene, window.A.camera);
    const gl = r.getContext(); const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let lit = 0; for (let i = 0; i < px.length; i += 4) {
      // background is 0x14161c (20,22,28). count pixels noticeably brighter than bg.
      if (px[i] > 40 || px[i + 1] > 44 || px[i + 2] > 52) lit++;
    }
    return { meshes, litPct: +(100 * lit / (w * h)).toFixed(1) };
  }).catch(e => ({ err: String(e) }));
  console.log('  §BONSAI-VIEWER inSceneMeshes=' + probe.meshes + ' litPixels=' + probe.litPct + '%');

  await br.close(); server.close();

  // Verdict assembled from the captured shipping-module logs.
  const wall = logs.find(t => /§BONSAI author op=GEOM_EXTRUDE/.test(t));
  const open = logs.find(t => /§BONSAI author op=GEOM_OPENING/.test(t));
  const wallOK = wall && /tris=12/.test(wall) && /bbox=\[0,0,0,4,0.2,3\]/.test(wall) && /inScene=true/.test(wall);
  const openOK = open && /inScene=true/.test(open) && !/tris=12\b/.test(open); // cut changed the tri count
  const drew = probe.meshes >= 2 && probe.litPct > 0.5;
  const pass = wallOK && openOK && drew;
  console.log('  §BONSAI-VIEWER VERDICT ' + (pass ? 'PASS' : 'FAIL') +
    ' — wallOK=' + !!wallOK + ' openingOK=' + !!openOK + ' meshes=' + probe.meshes + ' drew=' + drew);
  console.log('── W-BONSAI-VIEWER ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
