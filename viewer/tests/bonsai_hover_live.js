// W-BONSAI-HOVER — pre-pick hover witness (M3; MODELLER_DIRECT_MANIPULATION.md §0-RESULTS TIER 2).
// CLAIM: moving the cursor over a feature (no click) now gives it a FAINT glow (0x14324a, dimmer than the
// 0x2b5a8c selection glow) + a pointer cursor — the discoverability affordance the silent pick lacked. Empty
// space clears the glow + cursor; a SELECTED feature keeps its selection glow while a DIFFERENT feature is
// hovered; and hover is suppressed while a mouse button is held (so it never fights an orbit drag).
const http = require('http'), fs = require('fs'), path = require('path');
const VIEWER = path.join('/tmp/wt-hover', 'viewer');
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
  pg.on('console', m => { const t = m.text(); if (/^§(OPLOG|MODELLER|LIBRARY|BONSAI)/.test(t)) console.log('  ' + t); });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 300)));
  await pg.goto(`http://localhost:${port}/modeller.html?hover=demo`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__hoverDone === true', { timeout: 120000 })
    .catch(() => console.log('  ✗ timeout waiting for __hoverDone'));

  const x = await pg.evaluate(() => window.__hoverResult || {}).catch(e => ({ error: String(e) }));
  await br.close(); server.close();

  const ids = x.ids || [];
  console.log('  §HOVER ids=[' + ids.join(',') + '] HOVER_TINT=' + x.HOVER_TINT + ' SEL_TINT=' + x.SEL_TINT);
  console.log('  §HOVER (1) hoverAId=' + x.hoverAId + ' hoverAEmis=' + x.hoverAEmis + ' cursorOnA=' + JSON.stringify(x.cursorOnA));
  console.log('  §HOVER (2) hoverEmptyId=' + x.hoverEmptyId + ' emisAfterLeave=' + x.emisAfterLeave + ' cursorEmpty=' + JSON.stringify(x.cursorEmpty));
  console.log('  §HOVER (3) hoverBId=' + x.hoverBId + ' hoverBEmis=' + x.hoverBEmis + ' selAEmisWhileHoverB=' + x.selAEmisWhileHoverB);
  console.log('  §HOVER (4) hoverWhileButton=' + x.hoverWhileButton + ' bEmisWhileButton=' + x.bEmisWhileButton + (x.error ? '  ERROR=' + x.error : ''));

  const hoverGlows = x.hoverAId === ids[0] && x.hoverAEmis === x.HOVER_TINT && x.cursorOnA === 'pointer';
  const distinctFromSelection = x.HOVER_TINT !== x.SEL_TINT;
  const emptyClears = x.hoverEmptyId == null && x.emisAfterLeave === 0 && x.cursorEmpty === '';
  const keepsSelectionGlow = x.hoverBId === ids[1] && x.hoverBEmis === x.HOVER_TINT && x.selAEmisWhileHoverB === x.SEL_TINT;
  const suppressedWhileButton = x.hoverWhileButton == null && x.bEmisWhileButton === 0;

  const pass = hoverGlows && distinctFromSelection && emptyClears && keepsSelectionGlow && suppressedWhileButton;
  console.log('  §HOVER VERDICT ' + (pass ? 'PASS' : 'FAIL') +
    ' — hoverGlows=' + hoverGlows + ' distinctFromSelection=' + distinctFromSelection + ' emptyClears=' + emptyClears +
    ' keepsSelectionGlow=' + keepsSelectionGlow + ' suppressedWhileButton=' + suppressedWhileButton);
  console.log('── W-BONSAI-HOVER ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
