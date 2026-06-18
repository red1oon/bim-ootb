// W-CONNECT-BUS-MODELLER — P0 DOM leg: the Connect toggle is wired into the REAL modeller surface.
// CLAIM: modeller.html loads connect_scene.js, registers surface 'modeller', and the toolbar #b-connect
// button toggles the broker on/off (indicator + §-log) — proving the toggle lives on the actual surface,
// not just the harness. (occt/WASM may not finish on Node18 V8; the broker + button wiring do not need it.)
const http = require('http'), fs = require('fs'), path = require('path');
const VIEWER = path.join('/tmp/wt-connect', 'viewer');
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
  pg.on('console', m => { const t = m.text(); if (/^§CONNECT/.test(t)) console.log('  ' + t); });
  await pg.goto(`http://localhost:${port}/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction("window.Connect && document.getElementById('b-connect')", { timeout: 30000 })
    .catch(() => console.log('  ✗ timeout waiting for Connect+button'));

  const r = await pg.evaluate(() => {
    const btn = document.getElementById('b-connect');
    const registered = window.Connect && window.Connect._surface === 'modeller';
    const startOff = !window.Connect.on;
    btn.click(); const afterClick = { on: window.Connect.on, label: btn.querySelector('span').textContent, lit: btn.classList.contains('on') };
    btn.click(); const afterClick2 = { on: window.Connect.on, label: btn.querySelector('span').textContent };
    return { registered, startOff, afterClick, afterClick2, hasBtn: !!btn };
  }).catch(e => ({ err: String(e) }));

  await br.close(); server.close();
  console.log('  §CONNECT-MODELLER ' + JSON.stringify(r));
  const pass = r.registered && r.startOff && r.afterClick && r.afterClick.on === true &&
    r.afterClick.label === 'Connected' && r.afterClick.lit === true && r.afterClick2.on === false &&
    r.afterClick2.label === 'Connect';
  console.log('  §CONNECT-MODELLER VERDICT ' + (pass ? 'PASS' : 'FAIL'));
  process.exit(pass ? 0 : 1);
})();
