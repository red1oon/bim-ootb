// W-BONSAI-GMPREVIEW — Move-Grid preview witness (operability v3 leg 1). prompts/BONSAI_KERNEL_RESEARCH.md.
// CLAIM: dragging a gridline now PREVIEWS its effect — affected walls tint live (blue=translate, orange=stretch)
// while dragging, the grabbable line hover-highlights, and nothing commits until release (then tints clear).
// Fixes the user's "move grid — can't tell what'll happen" gap. Drives the REAL UI handlers.
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
  pg.on('console', m => { const t = m.text(); if (/^§(OPLOG|MODELLER|GRIDMOVE|KRN)/.test(t)) console.log('  ' + t); });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 200)));
  await pg.goto(`http://localhost:${port}/modeller.html?gmpreview=demo`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__gmpreviewDone === true', { timeout: 120000 }).catch(() => console.log('  ✗ timeout'));

  const x = await pg.evaluate(() => window.__gmpreviewResult || {}).catch(e => ({ err: String(e) }));
  console.log('  §BONSAI-GMPREVIEW entered=' + x.entered + ' hoverPreview=' + x.hoverPreview + ' grabbed=' + x.grabbed +
    ' dragDelta=' + x.dragDelta + ' tintW1=' + x.tintW1 + ' tintW2=' + x.tintW2 +
    ' opsBeforeRelease=' + x.opsBeforeRelease + ' opsAfterRelease=' + x.opsAfterRelease + ' tintsClearedW1=' + x.tintsClearedW1 + ' verify=' + x.verify + (x.error ? ' ERROR=' + x.error : ''));
  await br.close(); server.close();

  const hover = x.hoverPreview === true;                                  // grabbable line highlights on hover
  const grabbed = !!x.grabbed && Math.abs((x.dragDelta || 0) - 1.5) < 0.3;
  const tintTranslate = (x.tintW1 || '').toLowerCase() === '#1e66c8';     // wall on the line moves rigidly (blue)
  const tintStretch = (x.tintW2 || '').toLowerCase() === '#c8731e';       // wall spanning to the line stretches (orange)
  const previewOnly = x.opsBeforeRelease === 0;                            // nothing committed during the drag
  const committedOnRelease = x.opsAfterRelease === 1 && x.verify === true; // one signed GEOM_GRID_MOVE on release
  const tintsCleared = (x.tintsClearedW1 || '').toLowerCase() === '#000000';
  const pass = hover && grabbed && tintTranslate && tintStretch && previewOnly && committedOnRelease && tintsCleared;
  console.log('  §BONSAI-GMPREVIEW VERDICT ' + (pass ? 'PASS' : 'FAIL') +
    ' — hoverHighlight=' + hover + ' grabbedAndDragged=' + grabbed + ' translateTint=' + tintTranslate +
    ' stretchTint=' + tintStretch + ' previewNotCommitted=' + previewOnly + ' committedOnRelease=' + committedOnRelease + ' tintsCleared=' + tintsCleared);
  console.log('── W-BONSAI-GMPREVIEW ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
