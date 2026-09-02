// W-BONSAI-OUTLINER-INCR — Outliner INCREMENTAL rebuild witness (RESUME_MODELLER_POLISH.md #7, M8).
// CLAIM (the issue this proves): the old Outliner rebuilt BOTH sections — the seeded BOM-tree (the whole
// loaded building, thousands of nodes) AND the flat op-log groups — on EVERY `bonsai:oplog` change, so a
// geometry edit re-folded + re-parsed + re-wired the entire building tree → "jank at 100+ features". The fix
// renders each section to its own persistent container and string-diffs the freshly-built HTML: an unchanged
// section is left UNTOUCHED in the DOM. PROVEN HERE by DOM-NODE IDENTITY: a stamped seeded-tree node survives
// op-log commits (tree NOT rebuilt) but is dropped when the tree content actually changes (tree IS rebuilt);
// selection highlights by in-place restyle (no rebuild of either side). Robust to spurious extra paints — the
// asserts read the DOM, not the transient paint flag.
const http = require('http'), fs = require('fs'), path = require('path');
const MODELLER = path.join('/tmp/wt-outliner-incr', 'modeller');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.map': 'application/json' };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller.html';
  fs.readFile(path.join(MODELLER, p), (e, b) => {
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
  pg.on('console', m => { const t = m.text(); if (/^§(OUTLINER|MODELLER outliner-incr)/.test(t)) console.log('  ' + t.slice(0, 200)); });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 300)));
  await pg.goto(`http://localhost:${port}/modeller.html?outliner=incr`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__incrDone === true', { timeout: 120000 })
    .catch(() => console.log('  ✗ timeout waiting for __incrDone'));
  const x = await pg.evaluate(() => window.__incrResult || {}).catch(e => ({ err: String(e) }));
  await br.close(); server.close();

  console.log('  §INCR ' + JSON.stringify(x));
  // I1 first paint built the seeded tree, all 150 leaves present (correctness baseline).
  const I1 = x.firstFullPaint === true && x.treeRows0 === 150;
  // I2 a geometry commit reused the seeded tree DOM (stamped node survived) and added the Wall row to flats.
  const I2 = x.domIdentityKept === true && x.wallRowAppeared === true;
  // I3 a 2nd commit kept the tree cached and grew the flat group to 2 (still the same stamped DOM node).
  const I3 = x.wallCount === '2' && x.domStillKept === true;
  // I4 a REAL tree change rebuilt the tree section — the stale stamp is gone (and the flag agrees).
  const I4 = x.stampDropped === true && x.treeRebuiltOnChange === true;
  // I5 selecting a tree leaf restyled in place: no _paint ran and the row went active-blue.
  const I5 = x.selectNoRebuild === true && x.selectHighlighted === true;
  const checks = { I1, I2, I3, I4, I5 };
  Object.keys(checks).forEach(k => console.log('  ' + k + ' ' + (checks[k] ? 'PASS' : 'FAIL')));
  const pass = !x.error && Object.values(checks).every(Boolean);
  console.log('  §BONSAI-OUTLINER-INCR VERDICT ' + (pass ? 'PASS' : 'FAIL') + (x.error ? ' ERROR=' + x.error : ''));
  console.log('── W-BONSAI-OUTLINER-INCR ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
