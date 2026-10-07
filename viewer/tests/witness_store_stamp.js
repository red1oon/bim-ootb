// W-STORE-STAMP — issue (bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §BIM-CRUD, 2026-10-07): an open viewer tab kept its in-memory copy
//   of bim_analysis/bim_project_orders.db and its next push wrote old orders back after a seed reset. Writers now reuse the copy only while
//   ProjOrderState.storeStamp() is unchanged. Proof (real OPFS, real proj_order_state.js): write → stamp A; another writer rewrites → stamp B ≠ A;
//   seed reset removes the file → 'gone'. A stamp that cannot see these changes would let the stale write through → FAIL.
// Run: node viewer/tests/witness_store_stamp.js — read the log.
'use strict';
const { chromium } = require(require('os').homedir() + '/bim-ootb/tests/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const server = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') { r.writeHead(200, { 'Content-Type': 'text/html' }); return r.end('<!doctype html><script src="/viewer/proj_order_state.js"></script>'); }
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': 'text/javascript' }); r.end(b); }); });
(async () => {
  await new Promise(r => server.listen(0, r));
  const b = await chromium.launch(), page = await b.newPage();
  await page.goto('http://127.0.0.1:' + server.address().port + '/');
  const r = await page.evaluate(async () => {
    const S = window.ProjOrderState; if (!S || !S.storeStamp) return { err: 'no storeStamp' };
    const write = async (bytes) => { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('bim_analysis', { create: true });
      const w = await (await d.getFileHandle('bim_project_orders.db', { create: true })).createWritable(); await w.write(bytes); await w.close(); };
    try { await (await (await navigator.storage.getDirectory()).getDirectoryHandle('bim_analysis')).removeEntry('bim_project_orders.db'); } catch (e) {}
    const s0 = await S.storeStamp();
    await write(new Uint8Array(100)); const a = await S.storeStamp();
    await new Promise(r => setTimeout(r, 20));
    await write(new Uint8Array(140)); const bb = await S.storeStamp();
    await (await (await navigator.storage.getDirectory()).getDirectoryHandle('bim_analysis')).removeEntry('bim_project_orders.db');
    const c = await S.storeStamp();
    return { s0, a, b: bb, c };
  });
  console.log('§W-STORE-STAMP ' + JSON.stringify(r));
  const ok = !r.err && r.s0 === 'gone' && r.a !== 'gone' && r.b !== r.a && r.c === 'gone';
  console.log('§W-STORE-STAMP verdict=' + (r.err ? 'FAIL (' + r.err + ')' : ok ? 'PASS' : 'FAIL'));
  await b.close(); server.close(); process.exit(ok ? 0 : 1);
})();
