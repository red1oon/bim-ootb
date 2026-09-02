// W-BONSAI-ZTOP — H1 Z-drag in pure top view (RESUME_MODELLER_POLISH.md #9).
// CLAIM (the issue this proves): in a PURE top view the camera looks straight down −Z, so the 'z' move-drag
// plane (vertical, facing the camera) is parallel to the ray and Z-drag is a no-op. The fix detects the
// degeneracy (_camTopDown) and maps vertical SCREEN motion → world-Z (drag UP = +Z), magnitude = pixels ×
// world-per-pixel at the selection's depth. Witnessed deterministically: the detector is false in iso /
// true in top view, the pure screen→Z math has the right sign + magnitude, and a real pointermove in the
// wired screenZ branch sets _moveDrag.dz to the same value.
const http = require('http'), fs = require('fs'), path = require('path');
// 2026-07-08: was hardcoded to a long-dead worktree (/tmp/wt-outliner-incr) — serve THIS checkout instead.
const MODELLER = path.join(__dirname, '..');
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
  pg.on('console', m => { const t = m.text(); if (/^§MODELLER ztop/.test(t)) console.log('  ' + t.slice(0, 220)); });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 300)));
  await pg.goto(`http://localhost:${port}/modeller.html?ztop=demo`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__ztopDone === true', { timeout: 120000 })
    .catch(() => console.log('  ✗ timeout waiting for __ztopDone'));
  const x = await pg.evaluate(() => window.__ztopResult || {}).catch(e => ({ err: String(e) }));
  await br.close(); server.close();

  console.log('  §ZTOP ' + JSON.stringify(x));
  const near = (a, b) => Math.abs(a - b) < 1e-3;
  // Z1 the degeneracy detector: false under the iso camera, true in pure top view.
  const Z1 = x.isoTopDown === false && x.topTopDown === true;
  // Z2 sign: drag UP ⇒ +Z, drag DOWN ⇒ −Z, equal magnitude.
  const Z2 = x.dzUp > 0 && x.dzDown < 0 && near(x.dzUp, -x.dzDown);
  // Z3 magnitude: 100px × world-per-pixel (the pure screen→Z map).
  const Z3 = x.wpp > 0 && near(x.dzUp, x.dzExpected);
  // Z4 wiring: a real pointermove in screenZ mode set _moveDrag.dz to the same +Z value.
  const Z4 = x.wiredDz > 0 && near(x.wiredDz, x.dzExpected);
  const checks = { Z1, Z2, Z3, Z4 };
  Object.keys(checks).forEach(k => console.log('  ' + k + ' ' + (checks[k] ? 'PASS' : 'FAIL')));
  const pass = !x.error && Object.values(checks).every(Boolean);
  console.log('  §BONSAI-ZTOP VERDICT ' + (pass ? 'PASS' : 'FAIL') + (x.error ? ' ERROR=' + x.error : ''));
  console.log('── W-BONSAI-ZTOP ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
