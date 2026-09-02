// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness that vfs_detect.js is WIRED into the boot of erp.html + idempiere.html
//   (CONSTRAINT_MITIGATION_LANE item 3, browser-wiring step 1/5). Proves the §VFS line fires once at boot,
//   the result lands on window.__VFS, and on a no-COOP/COEP origin (localhost == GH Pages) it resolves to
//   IDB with misconfig=N (named, not a silent downgrade). Additive: asserts the page still boots (no error).
// PASS = §VFS logged on BOTH pages, backend=idb, misconfig=N, window.__VFS.backend=='idb', 0 page errors.
// Run:  node tests/poc_vfs_wire.js 2>&1 | tee tests/poc_vfs_wire.log   (cwd = bim-ootb/erp)
'use strict';
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html','.js':'text/javascript','.json':'application/json','.db':'application/octet-stream','.wasm':'application/wasm','.css':'text/css','.png':'image/png' };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/erp.html';
  fs.readFile(path.join(ROOT, p), (e, b) => {
    if (e) { r.writeHead(404); r.end('404'); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b);
  });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FAILS = [];
function check(name, cond, detail) { console.log((cond ? '   ✓ ' : '   ✗ ') + name + (detail ? ' — ' + detail : '')); if (!cond) FAILS.push(name); }

async function probe(br, port, page) {
  const pg = await br.newPage();
  const vfsLogs = []; const errs = [];
  pg.on('console', m => { const t = m.text(); if (/§VFS/.test(t)) vfsLogs.push(t); });
  pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(`http://localhost:${port}/${page}`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);   // let boot()/hydrate() run initSqlJs → §VFS
  const vfs = await pg.evaluate(() => window.__VFS || null);
  await pg.close();
  return { page, vfsLogs, vfs, errs };
}

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  console.log('═══ §VFS-WIRE — vfs_detect wired into erp.html + idempiere.html boot (item 3, 1/5) ═══');
  for (const page of ['erp.html', 'idempiere.html']) {
    const r = await probe(br, port, page);
    check(`${page}: §VFS logged at boot`, r.vfsLogs.length >= 1, r.vfsLogs[0] || 'none');
    check(`${page}: window.__VFS populated`, !!r.vfs, JSON.stringify(r.vfs));
    check(`${page}: backend=idb on no-COOP/COEP origin`, r.vfs && r.vfs.backend === 'idb', r.vfs && r.vfs.backend);
    check(`${page}: misconfig=N (no silent downgrade)`, r.vfs && r.vfs.misconfig === false);
    check(`${page}: no page errors`, r.errs.length === 0, r.errs.join('|'));
  }
  await br.close(); server.close();
  console.log('§VFS-WIRE OVERALL=' + (FAILS.length === 0 ? 'PASS' : 'FAIL (' + FAILS.join('; ') + ')'));
  process.exit(FAILS.length === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL ' + e.message); process.exit(2); });
