// W-BONSAI-GRID — in-viewer "2D correlation" witness (prompts/BONSAI_KERNEL_RESEARCH.md Item 3, grid).
// CLAIM: the modeller's architectural authoring grid lets you sketch IN CORRELATION with a column grid —
// clicks near gridlines snap onto them, so every authored wall corner lands EXACTLY on a gridline and
// carries an architectural reference (A-1, B-1…). This is the modeller counterpart of the shipped grid
// overlay: in the viewer the grid is detected from a model; here it is the input the design correlates to.
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
  pg.on('console', m => { const t = m.text(); if (/^§(GRID|OPLOG|MODELLER)/.test(t)) { logs.push(t); console.log('  ' + t); } });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 300)));
  await pg.goto(`http://localhost:${port}/modeller.html?grid=demo`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__gridDone === true', { timeout: 120000 })
    .catch(() => console.log('  ✗ timeout waiting for __gridDone'));

  const x = await pg.evaluate(() => window.__gridResult || {}).catch(e => ({ err: String(e) }));
  await br.close(); server.close();

  const corners = x.corners || [];
  const refs = corners.map(c => c.ref).join(' ');
  console.log('  §BONSAI-GRID snapped=' + JSON.stringify((x.snapped || []).map(s => [s.x, s.y])) +
    ' corners=' + JSON.stringify(corners.map(c => c.p)) + ' refs=[' + refs + '] allOnGrid=' + x.allOnGrid +
    ' tris=' + x.tris + (x.error ? ' ERROR=' + x.error : ''));

  // expected: the 4 clicks snap onto grid nodes A1(0,0) B1(4,0) B2(4,3) A2(0,3) and the solved wall keeps them.
  const expectRefs = ['A-1', 'B-1', 'B-2', 'A-2'];
  const refsOK = corners.length === 4 && expectRefs.every((r, i) => corners[i].ref === r);
  const onGridOK = x.allOnGrid === true;
  const solidOK = x.tris > 0;
  const pass = refsOK && onGridOK && solidOK;
  console.log('  §BONSAI-GRID VERDICT ' + (pass ? 'PASS' : 'FAIL') +
    ' — cornersOnGrid=' + onGridOK + ' gridRefs=' + refsOK + ' (' + refs + ') solid=' + solidOK);
  console.log('── W-BONSAI-GRID ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
