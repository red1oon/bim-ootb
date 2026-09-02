// W-BOM-DROP-CENTER — DAGeVu modeller: dropping a BOM assembly CENTERS its footprint on the drop point.
// Before the fix, expandAssembly seats children CORNER-anchored ([0..W]) while the ghost box is CENTER-anchored
// ([-W/2..+W/2]), so the whole set landed in the +X/+Y quadrant, offset from the ghost by ≈(+W/2,+D/2) — the
// "scatter" in ModelBOMDrop.png. The fix (placeAssembly) shifts the expand origin back by the ROTATED half-extent.
// PROVES the issue: every committed leaf == the raw corner expansion shifted by exactly −(W/2,D/2) ⇒ footprint
// center on the drop. Level-agnostic (furniture SET … whole BUILDING — a cascade of BOMs). Drives the REAL
// placeAssembly via the in-page ?dropcenter=demo self-test (NO canvas pointer → bypasses the headless
// OrbitControls.setPointerCapture flake). prompts/BOM_DROP_SPATIAL_INVESTIGATION.md §RESULT fix (a).
const http = require('http'), fs = require('fs'), path = require('path');
const VIEWER = path.join(__dirname, '..');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm',
  '.json': 'application/json', '.css': 'text/css', '.map': 'application/json' };
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
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 160)));
  pg.on('console', m => { const t = m.text(); if (/dropcenter|recursion stop/.test(t)) console.log('  ' + t); });
  await pg.goto(`http://localhost:${port}/modeller.html?dropcenter=demo`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__dropCenterDone === true', { timeout: 45000 }).catch(() => {});
  const r = await pg.evaluate(() => window.__dropCenterResult || { error: 'no result' });
  await br.close(); server.close();
  console.log('  §DROPCENTER ' + JSON.stringify(r));
  const checks = {
    setPicked:       !!r.pick && r.committed > 1,                   // a real, multi-part SET was dropped
    committedAllN:   r.committed === r.N && r.N > 1,                // every expanded leaf committed
    shiftedHalf:     r.shifted === true,                           // EXACT: leaf == raw − (W/2,D/2)  ← the fix
    centeredOnDrop:  r.centeredOnDrop === true,                     // footprint center sits on the drop point (4,3)
    movedOffQuadrant: r.oldQuadrantOffset > 0.3,                   // the pre-fix scatter was non-trivial (real bug)
    chainVerifies:   r.verify === true                             // signed op-log still verifies
  };
  const pass = Object.values(checks).every(Boolean);
  console.log('  §DROPCENTER VERDICT ' + (pass ? 'PASS' : 'FAIL') + ' — ' +
    Object.entries(checks).map(([k, v]) => k + '=' + v).join(' '));
  process.exit(pass ? 0 : 1);
})().catch(e => { console.log('FATAL ' + e); process.exit(1); });
