// W-BONSAI-PRELOAD — red-pill background-preload witness (prompts/BONSAI_MORPHEUS_WIRING.md).
// CLAIM: Bonsai.preload() background-fetches the heavy assets (occt wasm + a 2nd asset standing in for
// the iDempiere seed.db) with PER-ASSET STREAMED progress (the status shower), warms the kernel worker
// from the fetched bytes (single download), and authoring is instant afterward. This is the engine half
// of the Morpheus red-pill pulse: load occt-wasm + ad_seed.db in the background, show what's loading.
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
  pg.on('console', m => { const t = m.text(); if (/^§(BONSAI|MODELLER)/.test(t)) { logs.push(t); console.log('  ' + t); } });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 300)));
  await pg.goto(`http://localhost:${port}/modeller.html?preload=demo`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__preloadDone === true', { timeout: 120000 })
    .catch(() => console.log('  ✗ timeout waiting for __preloadDone'));

  const x = await pg.evaluate(() => window.__preloadResult || {}).catch(e => ({ err: String(e) }));
  await br.close(); server.close();

  console.log('  §BONSAI-PRELOAD events=' + x.events + ' occtStreamed=' + x.occtStreamed +
    ' occtDone=' + x.occtDone + ' seedDone=' + x.seedDone + ' tris=' + x.tris + ' bbox=[' + x.bbox + ']' +
    (x.error ? ' ERROR=' + x.error : ''));

  const streamedOK = x.occtStreamed > 1;                 // progress arrived in chunks (a real shower, not one blip)
  const bothDone = x.occtDone === true && x.seedDone === true;   // both assets reported complete
  const warmOK = x.tris === 12 && /0,0,0,4,0.2,3/.test(x.bbox || '');   // warm worker authored a wall at once
  const pass = streamedOK && bothDone && warmOK;
  console.log('  §BONSAI-PRELOAD VERDICT ' + (pass ? 'PASS' : 'FAIL') +
    ' — streamed=' + streamedOK + ' bothAssetsDone=' + bothDone + ' warmAuthor=' + warmOK);
  console.log('── W-BONSAI-PRELOAD ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
