// W-BONSAI-CONSTRAIN — Bonsai modeller DEPTH leg 3 witness (prompts/BONSAI_KERNEL_RESEARCH.md §NEXT depth track).
// CLAIM: the modeller now wires the richer planegcs constraint shoulders (we previously used only 2 of ~60 —
// horizontal_pp/vertical_pp). A deliberately non-rectangular quad (corners far from 90°, opposite sides not
// parallel) is cleaned by the line + parallel + perpendicular_ll family into a TRUE rectangle (mode 'rect'),
// and into a SQUARE once equal_length is added (mode 'square'), the solver succeeding (status 0); two points are
// made mirror-symmetric by p2p_symmetric_ppp (the fixed centre lands on their midpoint); and a Constrain toolbar
// button cycles the intent axis→rect→square. This is genuinely richer 2D parametrics earned with no new binding.
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
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage();
  pg.on('console', m => { const t = m.text(); if (/^§(SKETCH|MODELLER)/.test(t)) console.log('  ' + t); });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 300)));
  await pg.goto(`http://localhost:${port}/modeller.html?constrain=demo`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__constrainDone === true', { timeout: 120000 })
    .catch(() => console.log('  ✗ timeout waiting for __constrainDone'));

  const x = await pg.evaluate(() => window.__constrainResult || {}).catch(e => ({ err: String(e) }));
  const j = (o) => o ? ('status=' + o.status + ' cons=' + o.cons + ' maxCorner=' + o.m.maxCorner + '° par=' + o.m.par + '° sideRatio=' + o.m.sideRatio) : 'null';
  console.log('  §BONSAI-CONSTRAIN input.maxCorner=' + (x.input && x.input.maxCorner) + '°');
  console.log('  §BONSAI-CONSTRAIN axis   ' + j(x.axis));
  console.log('  §BONSAI-CONSTRAIN rect   ' + j(x.rect));
  console.log('  §BONSAI-CONSTRAIN square ' + j(x.square));
  console.log('  §BONSAI-CONSTRAIN sym    status=' + (x.sym && x.sym.status) + ' midErr=' + (x.sym && x.sym.midErr) +
    ' | btnExists=' + x.btnExists + ' cycleLabels=' + JSON.stringify(x.cycleLabels) + (x.error ? ' ERROR=' + x.error : ''));

  await br.close(); server.close();

  const inputNoisy = x.input && x.input.maxCorner > 3;                                   // the input really wasn't a rectangle
  const rectClean = x.rect && x.rect.status === 0 && x.rect.cons === 3 && x.rect.m.maxCorner < 0.5 && x.rect.m.par < 0.5;
  const squareClean = x.square && x.square.status === 0 && x.square.cons === 4 && x.square.m.maxCorner < 0.5 && x.square.m.sideRatio < 1.02;
  const symOK = x.sym && x.sym.status === 0 && x.sym.midErr < 1e-3;                      // centre is the midpoint ⇒ symmetric
  // W-E2E-SKETCH-CIRCLE + W-E2E-SKETCH-ARC: the mode cycle is now 5 stops — axis→rect→square→circle→arc→axis.
  const uiCycles = x.btnExists === true && JSON.stringify(x.cycleLabels) === JSON.stringify(['Rect', 'Square', 'Circle', 'Arc', 'Axis']);
  const pass = inputNoisy && rectClean && squareClean && symOK && uiCycles;
  console.log('  §BONSAI-CONSTRAIN VERDICT ' + (pass ? 'PASS' : 'FAIL') +
    ' — inputNoisy=' + inputNoisy + ' rectClean=' + rectClean + ' squareClean=' + squareClean + ' symmetry=' + symOK + ' uiCycles=' + uiCycles);
  console.log('── W-BONSAI-CONSTRAIN ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
