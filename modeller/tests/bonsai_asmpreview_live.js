// W-BONSAI-ASM-PREVIEW — M7 rich assembly-drop preview (RESUME_MODELLER_POLISH.md #6).
// CLAIM (the issue this proves): the assembly drop preview showed only ONE enclosing aabb footprint box, not
// the N child placements — the user couldn't see what the set actually looks like before dropping. The fix
// renders the N CHILD boxes at their real landing positions (the SAME dropLeaves transform the commit uses),
// merged into one ghost, cached per (hash,yaw,elev) and translated to the cursor each move. Witnessed: the ghost
// carries N×36 indices (N boxes, not 1), every child box centroid sits on its leaf's landing, a cursor move
// shifts every vertex rigidly, and a building-sized drop returns an honest {tooMany} cap (never throws).
const http = require('http'), fs = require('fs'), path = require('path');
const MODELLER = path.join('/tmp/wt-asm', 'modeller');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.map': 'application/json' };
const VIEWER = path.join('/tmp/wt-asm', 'viewer');   // dagevu_catalog.json lives here (shared data, fetched by the modeller)
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller.html';
  fs.readFile(path.join(MODELLER, p), (e, b) => {
    if (!e) { r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); return; }
    fs.readFile(path.join(VIEWER, p), (e2, b2) => {      // fall back to the shared viewer data dir (catalog/geometries)
      if (e2) { r.writeHead(404); r.end('404 ' + p); return; }
      r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b2);
    });
  });
});
(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
           '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage();
  pg.on('console', m => { const t = m.text(); if (/^§MODELLER asm/.test(t)) console.log('  ' + t.slice(0, 240)); });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 300)));
  await pg.goto(`http://localhost:${port}/modeller.html?asmpreview=demo`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__asmPreviewDone === true', { timeout: 120000 })
    .catch(() => console.log('  ✗ timeout waiting for __asmPreviewDone'));
  const x = await pg.evaluate(() => window.__asmPreviewResult || {}).catch(e => ({ err: String(e) }));
  await br.close(); server.close();

  console.log('  §ASMPREVIEW ' + JSON.stringify(x));
  // A1 the ghost is N child boxes, not one aabb box (N×36 indices, N≥2).
  const A1 = x.N >= 2 && x.boxCount === x.N && x.boxesPerLeaf === true;
  // A2 every child box centroid sits on its leaf's real landing position.
  const A2 = x.boxesAtLanding === true && x.matched === x.N;
  // A3 a cursor move translates the cached cluster rigidly (function + wired showGhost path).
  const A3 = x.translateExact === true && x.ghostRich === true && x.ghostMoved === true;
  // A4 the biggest assembly is handled without throwing (child boxes or an honest cap).
  const A4 = x.bigOk === true && x.bigN >= 2;
  const checks = { A1, A2, A3, A4 };
  Object.keys(checks).forEach(k => console.log('  ' + k + ' ' + (checks[k] ? 'PASS' : 'FAIL')));
  const pass = !x.error && Object.values(checks).every(Boolean);
  console.log('  §BONSAI-ASM-PREVIEW VERDICT ' + (pass ? 'PASS' : 'FAIL') + (x.error ? ' ERROR=' + x.error : ''));
  console.log('── W-BONSAI-ASM-PREVIEW ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
