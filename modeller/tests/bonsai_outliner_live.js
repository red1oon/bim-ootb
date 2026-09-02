// W-BONSAI-OUTLINER — Bonsai-faithful Outliner witness (prompts/BONSAI_KERNEL_RESEARCH.md Item 3 chrome).
// CLAIM: the modeller's left Outliner is a Blender-style feature tree driven by the SIGNED op-log —
// authored features appear grouped by category (Walls / Openings) with their grid reference, the Find
// box filters across categories, and clicking a row selects the feature (mirrored to the 3D pick state).
// The category model is registration-driven so Room/Phase/ERP categories slot in later (user direction).
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
  pg.on('console', m => { const t = m.text(); if (/^§(OUTLINER|OPLOG|MODELLER)/.test(t)) { logs.push(t); console.log('  ' + t); } });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 300)));
  await pg.goto(`http://localhost:${port}/modeller.html?outliner=demo`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__outlinerDone === true', { timeout: 120000 })
    .catch(() => console.log('  ✗ timeout waiting for __outlinerDone'));

  const x = await pg.evaluate(() => window.__outlinerResult || {}).catch(e => ({ err: String(e) }));
  await br.close(); server.close();

  console.log('  §BONSAI-OUTLINER rows=' + JSON.stringify(x.rows) + ' gridRef=' + x.hasGridRef +
    ' findFiltered=' + x.findFiltered + ' afterFind=' + JSON.stringify(x.afterFind) + ' selId=' + x.selId +
    (x.error ? ' ERROR=' + x.error : ''));

  const showsBoth = (x.rows || []).length === 2 && !!x.wallRow && !!x.openingRow;
  const gridRefOK = x.hasGridRef === true;                 // wall row carries its A-1 grid reference
  const findOK = x.findFiltered === true;                  // Find "opening" hides the wall row
  const selectOK = x.selId === 1;                          // clicking the wall row selects feature #1
  const pass = showsBoth && gridRefOK && findOK && selectOK;
  console.log('  §BONSAI-OUTLINER VERDICT ' + (pass ? 'PASS' : 'FAIL') +
    ' — bothCategories=' + showsBoth + ' gridRef=' + gridRefOK + ' find=' + findOK + ' clickSelect=' + selectOK);
  console.log('── W-BONSAI-OUTLINER ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
