// W-BONSAI-SKETCH — in-viewer leg 2 witness (prompts/BONSAI_KERNEL_RESEARCH.md Item 2 leg 2).
// CLAIM: on the alternative modeller, a deliberately NOISY hand-drawn quad is cleaned up by the
// planegcs constraint solver (auto H/V), the SOLVED profile drives a real occt solid via
// GEOM_EXTRUDE_POLY in the worker, and it lands in A.scene and draws. Proves the sketch->solve->
// extrude pipeline is interactive (driven from clicked points), not the hardcoded sample ops.
const http = require('http'), fs = require('fs'), path = require('path');
const VIEWER = path.join(__dirname, '..');   // serve THIS tree's modeller/ (was a stale hardcoded /tmp/wt-bonsai path)
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
  pg.on('console', m => { const t = m.text(); if (/^§(SKETCH|MODELLER|BONSAI)/.test(t)) { logs.push(t); console.log('  ' + t); } });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 300)));
  await pg.goto(`http://localhost:${port}/modeller.html?sketch=demo`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sketchDone === true', { timeout: 120000 })
    .catch(() => console.log('  ✗ timeout waiting for __sketchDone'));

  const probe = await pg.evaluate(() => {
    const res = window.__sketchResult || {};
    const g = window.A && window.A.scene && window.A.scene.getObjectByName('BonsaiAuthored');
    const meshes = g ? g.children.filter(o => o.isMesh).length : 0;
    const r = window.A.renderer; r.render(window.A.scene, window.A.camera);
    const gl = r.getContext(); const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let lit = 0; for (let i = 0; i < px.length; i += 4) { if (px[i] > 40 || px[i + 1] > 44 || px[i + 2] > 52) lit++; }
    return { res, meshes, litPct: +(100 * lit / (w * h)).toFixed(1) };
  }).catch(e => ({ err: String(e) }));

  const rs = probe.res || {};
  const sv = rs.solved || [];
  // The clicked corners were off-axis (p1.y=0.15, p2=(3.9,3.0), p3=(0.1,2.9)); after the solve all
  // 4 edges must come out axis-aligned and the anchor edge must snap flat (p1.y≈0, p3.x≈0).
  const snapped = sv.length === 4 && Math.abs(sv[1].y) < 1e-2 && Math.abs(sv[3].x) < 1e-2;
  console.log('  §BONSAI-SKETCH solved=' + JSON.stringify(sv.map(p => [+p.x.toFixed(3), +p.y.toFixed(3)])) +
    ' axisClean=' + rs.axisClean + '/' + rs.edges + ' snapped=' + snapped +
    ' meshes=' + probe.meshes + ' litPixels=' + probe.litPct + '%');

  await br.close(); server.close();

  const solveOK = rs.status === 0;
  const cleanOK = rs.axisClean === rs.edges && rs.edges === 4;
  const solidOK = rs.tris > 0 && probe.meshes >= 1 && probe.litPct > 0.5;
  const pass = solveOK && cleanOK && snapped && solidOK;
  console.log('  §BONSAI-SKETCH VERDICT ' + (pass ? 'PASS' : 'FAIL') +
    ' — solveStatus=' + rs.status + ' axisClean=' + rs.axisClean + '/' + rs.edges +
    ' snapped=' + snapped + ' tris=' + rs.tris + ' drew=' + solidOK);
  console.log('── W-BONSAI-SKETCH ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
