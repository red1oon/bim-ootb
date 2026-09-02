// W-BONSAI-CAMERA — camera fit + view presets witness (operability v4). prompts/BONSAI_KERNEL_RESEARCH.md.
// CLAIM: you can navigate — Zoom-to-fit frames geometry that's off-screen (orbit target jumps to its centre at a
// sensible distance), and the View button cycles to a Top (plan) view. Fixes "no zoom-to-fit / no view presets".
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
  pg.on('console', m => { const t = m.text(); if (/^§(OPLOG|MODELLER|KRN)/.test(t)) console.log('  ' + t); });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 200)));
  await pg.goto(`http://localhost:${port}/modeller.html?camera=demo`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__cameraDone === true', { timeout: 120000 }).catch(() => console.log('  ✗ timeout'));

  const x = await pg.evaluate(() => window.__cameraResult || {}).catch(e => ({ err: String(e) }));
  console.log('  §BONSAI-CAMERA centerX=' + x.centerX + ' targetBeforeX=' + x.targetBeforeX + ' targetAfterX=' + x.targetAfterX +
    ' camDist=' + x.camDist + ' viewLabel=' + x.viewLabel + ' topIsAbove=' + x.topIsAbove + (x.error ? ' ERROR=' + x.error : ''));
  await br.close(); server.close();

  const wasOffFrame = Math.abs((x.targetBeforeX || 0) - (x.centerX || 0)) > 10;        // geometry started far from the view
  const fitFramed = Math.abs((x.targetAfterX || 0) - (x.centerX || 0)) < 0.6;          // Fit moved the orbit target onto it
  const saneDist = x.camDist > 1 && x.camDist < 30;                                     // framed at a reasonable distance
  const topPreset = x.viewLabel === 'Top' && x.topIsAbove === true;                     // View cycled to a plan view
  const pass = wasOffFrame && fitFramed && saneDist && topPreset;
  console.log('  §BONSAI-CAMERA VERDICT ' + (pass ? 'PASS' : 'FAIL') +
    ' — startedOffFrame=' + wasOffFrame + ' fitFramedGeometry=' + fitFramed + ' saneDistance=' + saneDist + ' topViewPreset=' + topPreset);
  console.log('── W-BONSAI-CAMERA ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
