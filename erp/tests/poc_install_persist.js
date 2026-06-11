// ⚠ DO NOT REMOVE — Scope guard
// Scope: §-witness for INSTALL PERSISTENCE + SUCCESS-PATH (NEW_CLIENT_MGMT.md #4, W-INSTALL-PERSIST).
//   PROVES the issue: "going through the Install DIALOG (ErpPicker, mode=install) for Odoo ends at a verified
//   fold; it does NOT leave a resident Client-12 tenant — persist only fired on the ?shard= URL path." After
//   the fix, persist is DRIVEN FROM THE DIALOG success-path (window.idmpInstallShard, ONE shared install fn):
//     §A DIALOG-DRIVE  — open Install→Odoo→drop odoo_chain.json→fold verified→click Install → §ERP-INSTALL
//                        persisted=Y (the dialog button, not the URL, fired the persist).
//     §B SURVIVE-RELOAD— reload the BARE URL (no ?shard=) → the resident db still has Odoo(12); listClients
//                        surfaces it in the switcher (≥2 tenants). (the make-it-stick claim)
//     §C IDEMPOTENT    — re-install the SAME shard → AD_Client count + C_Order count UNCHANGED (INSERT OR
//                        IGNORE dedups; no dup tenant, no dup orders/accounts).
//     §D PREVIEW       — on the post-reload resident db, the FROZEN fold (DocPoster+PostResolver) derives the
//                        Odoo order to coverage:complete + balanced (the accounting view still lights up).
//   §-log first — READ tests/poc_install_persist.log before any conclusion.
// Run:  node tests/poc_install_persist.js 2>&1 | tee tests/poc_install_persist.log   (cwd = bim-ootb/erp)
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

// in-page: count login-able tenants (the switcher source) + the live Odoo footprint (idempotency guards)
const probe = () => {
  const q = (s) => { try { const r = window.__idmpDb.exec(s); return r.length ? r[0].values[0][0] : 0; } catch (e) { return -1; } };
  let tenants = -1; try { tenants = window.IdmpSession ? window.IdmpSession.listClients(window.__idmpDb).length : -2; } catch (e) {}
  return { tenants, clients: q('SELECT COUNT(*) FROM AD_Client'),
           odooClient: q('SELECT COUNT(*) FROM AD_Client WHERE AD_Client_ID=12'),
           odooOrders: q('SELECT COUNT(*) FROM C_Order WHERE AD_Client_ID=12'),
           odooVC: q('SELECT COUNT(*) FROM C_ValidCombination WHERE AD_Client_ID=12') };
};
// in-page: run the FROZEN fold over the resident db for an Odoo doc → coverage (complete iff nothing absent)
const previewCoverage = (table, id) => {
  try {
    if (!window.DocPoster || !window.PostResolver || !window.ERPPreview) return { err: 'engine-not-loaded' };
    const fdb = window.ERPPreview.facade(window.__idmpDb);
    const res = window.DocPoster.derivePostings(fdb, { table, id }, 101, window.PostResolver);
    if (!res || !res.lines) return { err: 'no-result' };
    return { lines: res.lines.length, absent: res.absent.length, balanced: !!res.balanced,
             coverage: res.absent.length ? 'partial' : 'complete' };
  } catch (e) { return { err: e.message }; }
};

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  ✗ FAIL: ' + m); } else { console.log('  ✓ ' + m); } };

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port, base = `http://localhost:${port}/idempiere.html`;
  const logs = [], errs = [];
  const browser = await chromium.launch();
  const ctx = await browser.newContext();        // fresh, empty IDB (no resident tenant yet)
  const page = await ctx.newPage();
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));
  const since = (tag) => logs.filter(l => l.indexOf(tag) >= 0).slice(-1)[0] || '(no ' + tag + ')';

  console.log('\n══ W-INSTALL-PERSIST — the Install dialog drives persist; the tenant survives a bare reload ══\n');

  // ── Phase 0: bare boot — single tenant, install fn exposed ──
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__idmpDb, null, { timeout: 15000 });
  await page.waitForTimeout(600);
  const p0 = await page.evaluate(probe);
  const hasFn = await page.evaluate(() => typeof window.idmpInstallShard === 'function');
  console.log('§INSTALL-P0 bare-boot tenants=' + p0.tenants + ' odooClient=' + p0.odooClient + ' idmpInstallShard=' + (hasFn ? 'fn' : 'MISSING'));
  ok(p0.tenants === 1, 'bare boot = 1 login-able tenant (GardenWorld); Odoo not yet resident');
  ok(p0.odooClient === 0, 'Odoo(12) absent before install');
  ok(hasFn, 'window.idmpInstallShard exposed (the dialog success-path can drive persist in-page)');

  // ── Phase A: drive the Install DIALOG end-to-end → the button fires persist ──
  await page.evaluate(() => window.ErpPicker.open({ mode: 'install' }));
  await page.waitForSelector('#ep-c-odoo', { timeout: 5000 });
  await page.click('#ep-c-odoo');                       // select Odoo (detection probe to :8069 fails in CI — fine)
  await page.waitForSelector('#ep-go:not([disabled])', { timeout: 5000 });
  await page.click('#ep-go');                           // confirm → staged Odoo panel
  await page.waitForSelector('#ep-chain', { state: 'attached', timeout: 5000 });   // the file input is hidden by design
  await page.setInputFiles('#ep-chain', path.join(ROOT, 'odoo_chain.json'));   // drop the agent's real chain
  await page.waitForSelector('#ep-install-go', { timeout: 8000 });             // fold verified → Install CTA shows
  console.log('§INSTALL-A fold-verified ' + since('§ODOO-MIGRATE-BROWSER'));
  await page.click('#ep-install-go');                  // ← the dialog button drives the install
  await page.waitForFunction(() => !!document.getElementById('ep-reload'), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
  const aInstall = since('§ERP-INSTALL'), aPersist = since('§IDEMPIERE shard-persist'), aShardIn = since('§IDEMPIERE shard-in');
  console.log('  ' + aShardIn);
  console.log('  ' + aPersist);
  console.log('  ' + aInstall);
  const pA = await page.evaluate(probe);
  ok(/persisted=Y/.test(aInstall), '§ERP-INSTALL reports persisted=Y (persist driven from the DIALOG, not the URL)');
  ok(/resident=Y/.test(aPersist), '§IDEMPIERE shard-persist resident=Y fired');
  ok(pA.odooClient === 1, 'Odoo(12) now in the live db after the dialog install');
  ok(await page.evaluate(() => !!document.getElementById('ep-reload')), 'dialog shows "Reload & switch tenant" CTA');

  // ── Phase B: reload the BARE URL → the tenant survived (switcher surfaces it) ──
  await page.goto(base, { waitUntil: 'networkidle' });   // no ?shard=, no ?client=
  await page.waitForFunction(() => !!window.__idmpDb, null, { timeout: 15000 });
  await page.waitForTimeout(500);
  const pB = await page.evaluate(probe);
  console.log('§INSTALL-B bare-reload tenants=' + pB.tenants + ' odooClient=' + pB.odooClient + ' odooOrders=' + pB.odooOrders);
  ok(pB.odooClient === 1, 'Odoo(12) SURVIVES a plain reload (no ?shard=) — install is actual, not transient');
  ok(pB.tenants >= 2, 'switcher surfaces (≥2 login-able tenants after install)');
  ok(pB.odooOrders === 27, 'all 27 Odoo orders survived the reload (got ' + pB.odooOrders + ')');

  // ── Phase C: idempotent re-install (same shard) → guarded no-op; no dup rows in PK-less junction tables ──
  // (the trap: c_invoicetax/c_ordertax have NO primary key → a blind re-merge doubles the tax → GL unbalances.
  //  the client-presence guard makes the second install a true skip; §D below re-checks the books still balance.)
  const reIn = await page.evaluate(() => window.idmpInstallShard('12-odoo.db'));
  await page.waitForTimeout(200);
  const pC = await page.evaluate(probe);
  const skipLog = since('§IDEMPIERE shard-skip');
  console.log('§INSTALL-C re-install already=' + (reIn && reIn.already ? 'Y' : 'N') + ' rows=' + (reIn && reIn.mRow)
    + ' | ' + skipLog);
  console.log('  clients=' + pB.clients + '→' + pC.clients + ' odooOrders=' + pB.odooOrders + '→' + pC.odooOrders + ' odooVC=' + pB.odooVC + '→' + pC.odooVC);
  ok(reIn && reIn.already === true && reIn.mRow === 0, 're-install is a GUARDED no-op (already-resident skip, 0 rows merged)');
  ok(pC.clients === pB.clients, 'AD_Client count unchanged on re-install (no dup tenant)');
  ok(pC.odooOrders === pB.odooOrders, 'C_Order count unchanged on re-install');
  ok(pC.odooVC === pB.odooVC, 'C_ValidCombination (accounts) count unchanged — no dup accounts');

  // ── Phase D: the accounting view still lights up — frozen fold derives the Odoo order to the cent ──
  const cov = await page.evaluate(([t, i]) => {
    if (!window.DocPoster || !window.PostResolver || !window.ERPPreview) return { err: 'engine-not-loaded' };
    try {
      const fdb = window.ERPPreview.facade(window.__idmpDb);
      const res = window.DocPoster.derivePostings(fdb, { table: t, id: i }, 101, window.PostResolver);
      if (!res || !res.lines) return { err: 'no-result' };
      return { lines: res.lines.length, absent: res.absent.length, balanced: !!res.balanced,
               sumDr: res.sumDr, sumCr: res.sumCr, basis: res.basis,
               coverage: res.absent.length ? 'partial' : 'complete' };
    } catch (e) { return { err: e.message }; }
  }, ['C_Invoice', 1200001]);
  console.log('§INSTALL-D preview C_Invoice:1200001 basis=' + cov.basis + ' coverage=' + cov.coverage + ' lines=' + cov.lines
    + ' absent=' + cov.absent + ' ΣDr=' + cov.sumDr + ' ΣCr=' + cov.sumCr + ' balanced=' + (cov.balanced ? 'Y' : 'N') + (cov.err ? ' err=' + cov.err : ''));
  ok(!cov.err && cov.coverage === 'complete', 'resident Odoo invoice derives coverage:complete (accounting view lights up)');
  ok(!cov.err && cov.balanced, 'derived journal is balanced (ΣDr==ΣCr) AFTER a re-install — the idempotency guard held (no double tax)');

  // ── SEEN: screenshot the logged-in app on the resident tenant ──
  await page.goto(base + '?client=odoo&login=Odoo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(__dirname, 'install_persist_resident.png') });
  console.log('§INSTALL-SHOT install_persist_resident.png (logged-in on the resident Odoo tenant)');

  console.log('\n' + (fails === 0 && errs.length === 0 ? '🟢 W-INSTALL-PERSIST PASS' : '🔴 W-INSTALL-PERSIST FAIL (' + fails + ' asserts, ' + errs.length + ' pageErrors)')
    + ' — the Install dialog drives persist; the tenant survives a bare reload, is switcher-visible, idempotent, and still folds to the cent. pageErrors=' + (errs.length ? errs.join('|') : 0));
  await browser.close();
  server.close();
  process.exit(fails === 0 && errs.length === 0 ? 0 : 1);
})().catch(e => { console.error('PROBE-ERR', e); server.close(); process.exit(2); });
