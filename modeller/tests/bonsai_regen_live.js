// W-BONSAI-REGEN — incremental regen cache witness (card §4#1 "the real core"). prompts/BONSAI_KERNEL_RESEARCH.md.
// CLAIM: geometry re-evaluation is now INCREMENTAL. The signed op_hash keys a worker-resident shape/mesh cache;
// re-folding an unchanged chain rebuilds ZERO occt shapes (all hits), adding one feature rebuilds exactly ONE,
// the result is byte-identical (deterministic), and clearing the model drops the cache. Single-lineage, content-
// addressed — the patent-safe regen (cloud branch&merge is the sensitive surface, not this).
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
  pg.on('console', m => { const t = m.text(); if (/^§(OPLOG|MODELLER|BONSAI|KRN)/.test(t)) console.log('  ' + t); });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 200)));
  await pg.goto(`http://localhost:${port}/modeller.html?regen=demo`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__regenDone === true', { timeout: 120000 }).catch(() => console.log('  ✗ timeout'));

  const x = await pg.evaluate(() => window.__regenResult || {}).catch(e => ({ err: String(e) }));
  const J = o => JSON.stringify(o);
  console.log('  §BONSAI-REGEN cold=' + J(x.cold) + ' warm=' + J(x.warm) + ' afterCut=' + J(x.afterCut) +
    ' afterClear=' + J(x.afterClear) + ' deterministic=' + x.deterministic + (x.error ? ' ERROR=' + x.error : ''));
  await br.close(); server.close();

  const c = x.cold || {}, w = x.warm || {}, ac = x.afterCut || {}, acl = x.afterClear || {};
  const coldFull = c.rebuilt === 3 && c.hits === 0;                 // cold cache → all 3 features rebuilt
  const warmAllHits = w.rebuilt === 0 && w.hits === 3;             // THE WIN: re-fold rebuilds NOTHING
  const incremental = ac.rebuilt === 1 && ac.hits === 3;           // adding a cut rebuilds only the cut
  const deterministic = x.deterministic === true;                  // identical geometry cached vs rebuilt
  const cacheDropped = acl.rebuilt === 1;                          // clear() dropped the cache → cold again
  const pass = coldFull && warmAllHits && incremental && deterministic && cacheDropped;
  console.log('  §BONSAI-REGEN VERDICT ' + (pass ? 'PASS' : 'FAIL') +
    ' — coldRebuildsAll=' + coldFull + ' refoldZeroRebuilds=' + warmAllHits + ' addOneRebuildsOne=' + incremental +
    ' deterministic=' + deterministic + ' clearDropsCache=' + cacheDropped);
  console.log('── W-BONSAI-REGEN ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
