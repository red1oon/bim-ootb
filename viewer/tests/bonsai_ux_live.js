// W-BONSAI-UX — interaction feedback witness (operability leg 4). prompts/BONSAI_KERNEL_RESEARCH.md.
// CLAIM: basic feedback works — Backspace undoes the last sketch point, Escape cancels the active mode, and the
// history timeline LABELS each step ("2/2 · Door", hover lists all steps) instead of a bare number.
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
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage();
  pg.on('console', m => { const t = m.text(); if (/^§(OPLOG|MODELLER|LIBRARY)/.test(t)) console.log('  ' + t); });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 200)));
  await pg.goto(`http://localhost:${port}/modeller.html?ux=demo`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__uxDone === true', { timeout: 120000 }).catch(() => console.log('  ✗ timeout'));

  const x = await pg.evaluate(() => window.__uxResult || {}).catch(e => ({ err: String(e) }));
  console.log('  §BONSAI-UX enteredSketch=' + x.enteredSketch + ' ptsBefore=' + x.ptsBefore + ' ptsAfter=' + x.ptsAfter +
    ' escExited=' + x.escExited + ' histLabel="' + x.histLabel + '" sliderTitle=' + JSON.stringify(x.sliderTitle) + (x.error ? ' ERROR=' + x.error : ''));
  await br.close(); server.close();

  const pointUndo = x.enteredSketch === true && x.ptsBefore === 3 && x.ptsAfter === 2;     // Backspace removed last point
  const escape = x.escExited === true;                                                      // Escape cancelled the mode
  const timelineLabelled = /· Door$/.test(x.histLabel || '') && /Wall/.test(x.sliderTitle || '') && /Door/.test(x.sliderTitle || '');
  const pass = pointUndo && escape && timelineLabelled;
  console.log('  §BONSAI-UX VERDICT ' + (pass ? 'PASS' : 'FAIL') +
    ' — backspacePointUndo=' + pointUndo + ' escapeCancels=' + escape + ' timelineLabelled=' + timelineLabelled);
  console.log('── W-BONSAI-UX ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
