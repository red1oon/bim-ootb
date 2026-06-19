// W-BONSAI-ROTATE-GROUP — DAGeVu modeller: rotate a MULTI-SELECT group about its shared centroid (polish item 2).
// Each selected child gets one signed GEOM_ROTATE (spins it about its own centre) + a GEOM_MOVE that orbits its
// centre about the SET centroid by the same angle. Drives the REAL commitRotate via the in-page ?grouprot=demo
// self-test (no canvas pointer dispatch → dodges the headless OrbitControls.setPointerCapture flake). Proves: two
// doors at (0,0)&(4,0) rotated +90° about centroid (2,0) → A→(2,-2), B→(2,2); centroid fixed; each door's own
// extents swap (it spun too, not just translated); 2 ROTATE + 2 MOVE; chain verifies; scrub is reversible.
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
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 200)));
  pg.on('console', m => { const t = m.text(); if (/grouprot-done/.test(t)) console.log('  ' + t); });
  await pg.goto(`http://localhost:${port}/modeller.html?grouprot=demo`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__groupRotDone === true', { timeout: 60000 }).catch(() => {});
  const r = await pg.evaluate(() => window.__groupRotResult || { error: 'no result' });
  await br.close(); server.close();
  console.log('  §GROUPROT ' + JSON.stringify(r));
  const checks = {
    asymmetric:    r.asymmetric === true,          // door is non-square → its orientation change is observable
    orbited:       r.orbited === true,             // A→(2,-2), B→(2,2): each child orbited the centroid
    centroidFixed: r.centroidFixed === true,       // the set centroid stayed put (true rotation about centroid)
    eachSpun:      r.eachSpun === true,            // each child's OWN extents swapped (it rotated, not just moved)
    twoRotate:     r.rotOps === 2,                 // one signed GEOM_ROTATE per child
    twoMove:       r.moveOps === 2,                // one orbit GEOM_MOVE per off-centroid child
    chainVerifies: r.verify === true,
    reversible:    r.reversible === true           // scrub back restores the originals at (0,0) & (4,0)
  };
  const pass = Object.values(checks).every(Boolean);
  console.log('  §GROUPROT VERDICT ' + (pass ? 'PASS' : 'FAIL') + ' — ' +
    Object.entries(checks).map(([k, v]) => k + '=' + v).join(' '));
  process.exit(pass ? 0 : 1);
})().catch(e => { console.log('FATAL ' + e); process.exit(1); });
