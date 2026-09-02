// W-BONSAI-EDIT — editability witness (operability leg 2). prompts/BONSAI_KERNEL_RESEARCH.md.
// CLAIM: you can now EDIT a model — DELETE a single feature, CASCADE-delete a parent (its cut child goes too,
// with no fold break), and UNDO/REDO (LIFO) — all via soft-delete (the kernel_ops `undone` flag, which is NOT
// in the signed payload) so the append-only chain stays VALID throughout. Fixes the "can't change/delete = fails
// basic AD usage" gap. Drives the engine edit API the toolbar buttons + Ctrl+Z/Del call.
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
  pg.on('console', m => { const t = m.text(); if (/^§(OPLOG|MODELLER|LIBRARY|KRN|BONSAI)/.test(t)) console.log('  ' + t); });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 200)));
  await pg.goto(`http://localhost:${port}/modeller.html?edit=demo`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__editDone === true', { timeout: 120000 }).catch(() => console.log('  ✗ timeout'));

  const x = await pg.evaluate(() => window.__editResult || {}).catch(e => ({ err: String(e) }));
  console.log('  §BONSAI-EDIT start=' + x.start + ' afterDeleteDoor=' + x.afterDeleteDoor + ' verifyA=' + x.verifyA +
    ' afterDeleteWall=' + x.afterDeleteWall + ' verifyB=' + x.verifyB +
    ' undo[' + x.u0 + '→' + x.u1 + '→' + x.u2 + '] redo[→' + x.r1 + '→' + x.r2 + '] verifyC=' + x.verifyC + (x.error ? ' ERROR=' + x.error : ''));
  await br.close(); server.close();

  const deleteOne = x.start === 3 && x.afterDeleteDoor === 2 && x.verifyA === true;        // single leaf delete, chain valid
  const cascade = x.afterDeleteWall === 0 && x.verifyB === true;                            // parent delete takes its cut child, no fold break
  const undoRedo = x.u0 === 2 && x.u1 === 1 && x.u2 === 0 && x.r1 === 1 && x.r2 === 2 && x.verifyC === true;  // LIFO, chain valid
  const pass = deleteOne && cascade && undoRedo;
  console.log('  §BONSAI-EDIT VERDICT ' + (pass ? 'PASS' : 'FAIL') +
    ' — deleteOneFeature=' + deleteOne + ' cascadeDeleteParent=' + cascade + ' undoRedoLIFO=' + undoRedo);
  console.log('── W-BONSAI-EDIT ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
