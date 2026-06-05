// ⚠ DO NOT REMOVE — Scope guard
// Scope: whitebox §-witness PROVING whether Odoo "Client 12" is an ACTUAL migrated/resident tenant or a
//   TRANSIENT demo prop. Proves/disproves the report: "12-odoo.db loads via ?shard= but is NOT persisted —
//   the merged db is never written to IDB, so a reload without the param loses Client 12."
//   THREE checks, all on the REAL idempiere.html boot path (no mocks):
//     A) §C12-INMEM   — with ?shard=12-odoo.db, the in-memory db HAS AD_Client 12 (+ its products). (loads ✓)
//     B) §C12-IDB     — the PERSISTED IDB blob ('ad_seed_v13') does NOT contain Client 12.  (gap: not saved)
//     C) §C12-RELOAD  — reloading WITHOUT ?shard= → Client 12 is GONE.                      (consequence)
//   Verdict §C12-RESIDENT resident=<Y|N>: resident=Y only if the shard survives a no-param reload. Expected N
//   today — that N is the "make it stick" (persist + switcher) gap, i.e. migration is not yet actual.
//   §-log first — READ tests/poc_client12_resident.log before any conclusion.
// Run:  node tests/poc_client12_resident.js 2>&1 | tee tests/poc_client12_resident.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(__dirname + '/../../tests/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.db':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/idempiere.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});

// run inside the page: count Client-12 rows in the live in-memory db
const countInMem = () => {
  const q = (s) => { try { const r = window.__idmpDb.exec(s); return r.length ? r[0].values[0][0] : 0; } catch (e) { return -1; } };
  return { client: q("SELECT COUNT(*) FROM AD_Client WHERE AD_Client_ID=12"),
           products: q("SELECT COUNT(*) FROM M_Product WHERE AD_Client_ID=12") };
};
// run inside the page: open the PERSISTED idb blob and count Client-12 there (proves whether it was saved)
const countInIdb = () => new Promise((resolve) => {
  try {
    const req = indexedDB.open('erp_cache', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('blobs');
    req.onsuccess = () => {
      const g = req.result.transaction('blobs', 'readonly').objectStore('blobs').get('ad_seed_v13');
      g.onsuccess = () => {
        const buf = g.result;
        if (!buf || !window.SQL) return resolve({ blob: !!buf, client: -2 });
        try { const d = new window.SQL.Database(new Uint8Array(buf));
          const r = d.exec("SELECT COUNT(*) FROM AD_Client WHERE AD_Client_ID=12");
          const n = r.length ? r[0].values[0][0] : 0; d.close(); resolve({ blob: true, client: n }); }
        catch (e) { resolve({ blob: true, client: -3, err: e.message }); }
      };
      g.onerror = () => resolve({ blob: false, client: -4 });
    };
    req.onerror = () => resolve({ blob: false, client: -5 });
  } catch (e) { resolve({ blob: false, client: -6, err: e.message }); }
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const logs = [], errs = [];
  const browser = await chromium.launch();
  const ctx = await browser.newContext();          // fresh, empty IDB
  const page = await ctx.newPage();
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));

  // ── A) DEFAULT seed path (exercises the real IDB cache) + the Odoo shard merged in ──
  await page.goto(`http://localhost:${port}/idempiere.html?shard=12-odoo.db`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__idmpDb, null, { timeout: 15000 });
  await page.waitForTimeout(1200);
  const shardLog = logs.find(l => l.startsWith('§IDEMPIERE shard-in')) || '(no shard-in log)';
  const inmem = await page.evaluate(countInMem);
  console.log('§C12-INMEM ' + shardLog + ' | client12-rows=' + inmem.client + ' products=' + inmem.products);

  // ── B) what got PERSISTED? open the idb blob the app cached and look for Client 12 ──
  const idb = await page.evaluate(countInIdb);
  console.log('§C12-IDB persisted-blob=' + (idb.blob ? 'Y' : 'N') + ' client12-in-blob=' + idb.client
    + (idb.err ? ' err=' + idb.err : '') + '  (>=1 ⇒ saved/resident · 0 ⇒ base-only, shard NOT persisted)');

  // ── C) reload WITHOUT the shard param — does Client 12 survive? ──
  await page.goto(`http://localhost:${port}/idempiere.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__idmpDb, null, { timeout: 15000 });
  await page.waitForTimeout(800);
  const after = await page.evaluate(countInMem);
  console.log('§C12-RELOAD no-shard-param client12-rows=' + after.client + ' products=' + after.products
    + '  (0 ⇒ Client 12 GONE on reload ⇒ transient, not migrated)');

  const loadsViaShard = inmem.client >= 1;
  const persisted     = idb.client >= 1;
  const survivesReload = after.client >= 1;
  const resident = persisted && survivesReload;
  console.log('§C12-RESIDENT loadsViaShard=' + (loadsViaShard ? 'Y' : 'N')
    + ' persistedToIDB=' + (persisted ? 'Y' : 'N')
    + ' survivesReload=' + (survivesReload ? 'Y' : 'N')
    + ' → resident(actual-migration)=' + (resident ? 'Y' : 'N')
    + ' pageErrors=' + (errs.length ? errs.join('|') : 0));
  console.log('§C12-VERDICT ' + (resident
    ? 'Client 12 IS an actual resident migrated tenant.'
    : 'Client 12 is a TRANSIENT demo prop — loads via ?shard= but is NOT persisted and is LOST on a plain reload. '
      + 'The persist+switcher (make-it-stick) is the real migration gap, exactly as reported.'));

  await browser.close();
  server.close();
  // PASS = the test ran cleanly and rendered a verdict (it is a falsifier; resident=N today is the expected finding).
  process.exit(loadsViaShard && errs.length === 0 ? 0 : 1);
})().catch(e => { console.error('PROBE-ERR', e); server.close(); process.exit(2); });
