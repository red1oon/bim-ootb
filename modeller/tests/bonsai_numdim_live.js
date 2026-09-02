// W-BONSAI-NUMDIM — numeric dimension input witness (operability v3 leg 2). prompts/BONSAI_KERNEL_RESEARCH.md.
// CLAIM: dimensions are now TYPED, not hardcoded — a wall height of 5m and a sweep profile of 0.6m drive the
// geometry (was a fixed 3m extrude / 0.3m sweep). The inputs appear contextually with their mode.
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
  await pg.goto(`http://localhost:${port}/modeller.html?numdim=demo`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__numdimDone === true', { timeout: 120000 }).catch(() => console.log('  ✗ timeout'));

  const x = await pg.evaluate(() => window.__numdimResult || {}).catch(e => ({ err: String(e) }));
  console.log('  §BONSAI-NUMDIM depthShown=' + x.depthShown + ' wallZ=' + x.wallZ + ' profShown=' + x.profShown +
    ' sweepZ=' + x.sweepZ + ' verify=' + x.verify + (x.error ? ' ERROR=' + x.error : ''));
  await br.close(); server.close();

  const typedDepth = x.depthShown === true && Math.abs((x.wallZ || 0) - 5) < 0.1;     // 5m typed height (not the old 3)
  const typedProfile = x.profShown === true && Math.abs((x.sweepZ || 0) - 0.6) < 0.1; // 0.6m typed profile (not the old 0.3)
  const pass = typedDepth && typedProfile && x.verify === true;
  console.log('  §BONSAI-NUMDIM VERDICT ' + (pass ? 'PASS' : 'FAIL') +
    ' — typedExtrudeDepth=' + typedDepth + ' typedSweepProfile=' + typedProfile + ' verify=' + (x.verify === true));
  console.log('── W-BONSAI-NUMDIM ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
