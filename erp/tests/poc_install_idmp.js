// ⚠ DO NOT REMOVE — Scope guard
// Scope: §-witness for iDempiere DIALOG-INSTALL (NEW_CLIENT_MGMT.md #5-install / IDMP_FULLWIDTH_SEED §4,
// W-INSTALL-IDMP — mirrors PR #260's poc_install_persist pattern for the Odoo tenant).
//   PROVES the issue: the un-banded 13-idempiere.db shard collided with ad_seed.db's own GardenWorld
//   PRIMARY KEYS → INSERT OR IGNORE silently dropped every tenant row (client-13 orders landed = 0) —
//   the dialog wiring was BUILT then REVERTED because it silently failed. After the PK RE-BAND
//   (gen_ad_idmp.sh 2b, CL*100000 band — W-IDMP-REBAND) + the FULL-WIDTH seed (real PG PKs):
//     §A DIALOG-DRIVE  — Install→iDempiere→install-tenant panel→click Install → §ERP-INSTALL persisted=Y
//                        (no chain drop: the shard is pre-verified against its OWN fact_acct).
//     §B SURVIVE-RELOAD— bare reload (no ?shard=) → iDempiere(13) resident, all 8 orders, ≥2 tenants.
//     §C IDEMPOTENT    — re-install → guarded no-op (client-presence skip; PK dedup backs it).
//     §D PREVIEW       — frozen fold derives client-13 invoice 1300100 coverage:complete + balanced.
//   §-log first — READ tests/poc_install_idmp.log before any conclusion.
// Run:  node tests/poc_install_idmp.js 2>&1 | tee tests/poc_install_idmp.log   (cwd = bim-ootb/erp)
'use strict';
let chromium;   // repo-relative first; worktrees have no node_modules → the shared ~/bim-ootb checkout's
try { ({ chromium } = require(__dirname + '/../../tests/node_modules/playwright')); }
catch (e) { ({ chromium } = require(process.env.HOME + '/bim-ootb/tests/node_modules/playwright')); }
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

// in-page: login-able tenants + the client-13 footprint (PK-collision + idempotency probes)
const probe = () => {
  const q = (s) => { try { const r = window.__idmpDb.exec(s); return r.length ? r[0].values[0][0] : 0; } catch (e) { return -1; } };
  let tenants = -1; try { tenants = window.IdmpSession ? window.IdmpSession.listClients(window.__idmpDb).length : -2; } catch (e) {}
  return { tenants, clients: q('SELECT COUNT(*) FROM AD_Client'),
           idmpClient: q('SELECT COUNT(*) FROM AD_Client WHERE AD_Client_ID=13'),
           idmpOrders: q('SELECT COUNT(*) FROM C_Order WHERE AD_Client_ID=13'),
           idmpRoles:  q('SELECT COUNT(*) FROM ad_role WHERE ad_client_id=13'),
           idmpTax:    q('SELECT COUNT(*) FROM c_invoicetax WHERE ad_client_id=13') };
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

  console.log('\n══ W-INSTALL-IDMP — the re-banded iDempiere shard installs from the dialog and survives reload ══\n');

  // ── Phase 0: bare boot — single tenant, no client 13 ──
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__idmpDb, null, { timeout: 15000 });
  await page.waitForTimeout(600);
  const p0 = await page.evaluate(probe);
  console.log('§IDMP-INSTALL-P0 bare-boot tenants=' + p0.tenants + ' idmpClient=' + p0.idmpClient);
  ok(p0.tenants === 1, 'bare boot = 1 login-able tenant (GardenWorld); iDempiere(13) not yet resident');
  ok(p0.idmpClient === 0, 'iDempiere(13) absent before install');

  // ── Phase A: drive the Install DIALOG end-to-end (no chain drop — shard is pre-verified) ──
  await page.evaluate(() => window.ErpPicker.open({ mode: 'install' }));
  await page.waitForSelector('#ep-c-idempiere', { timeout: 5000 });
  await page.click('#ep-c-idempiere');
  await page.waitForSelector('#ep-go:not([disabled])', { timeout: 5000 });
  await page.click('#ep-go');                           // confirm → install-tenant panel (#5-install route)
  await page.waitForSelector('#ep-install-go', { timeout: 8000 });
  console.log('§IDMP-INSTALL-A ' + since('§ERP-PICKER install-tenant'));
  await page.click('#ep-install-go');                   // ← the dialog button drives the install
  await page.waitForFunction(() => !!document.getElementById('ep-reload'), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
  const aInstall = since('§ERP-INSTALL'), aPersist = since('§IDEMPIERE shard-persist'), aShardIn = since('§IDEMPIERE shard-in');
  console.log('  ' + aShardIn);
  console.log('  ' + aPersist);
  console.log('  ' + aInstall);
  const pA = await page.evaluate(probe);
  ok(/persisted=Y/.test(aInstall), '§ERP-INSTALL reports persisted=Y (dialog-driven persist)');
  ok(pA.idmpClient === 1, 'iDempiere(13) in the live db after the dialog install');
  ok(pA.idmpOrders === 8, 'all 8 client-13 orders LANDED (PK re-band: was 0 un-banded — the #5-install bug) got=' + pA.idmpOrders);
  ok(pA.idmpRoles === 4, 'client-13 roles landed (identity-family band: login path exists) got=' + pA.idmpRoles);
  ok(await page.evaluate(() => !!document.getElementById('ep-reload')), 'dialog shows "Reload & switch tenant" CTA');

  // ── Phase B: bare reload → the tenant survived ──
  await page.goto(base, { waitUntil: 'networkidle' });   // no ?shard=, no ?client=
  await page.waitForFunction(() => !!window.__idmpDb, null, { timeout: 15000 });
  await page.waitForTimeout(500);
  const pB = await page.evaluate(probe);
  console.log('§IDMP-INSTALL-B bare-reload tenants=' + pB.tenants + ' idmpClient=' + pB.idmpClient + ' idmpOrders=' + pB.idmpOrders);
  ok(pB.idmpClient === 1, 'iDempiere(13) SURVIVES a plain reload — install is actual, not transient');
  ok(pB.tenants >= 2, 'switcher surfaces (≥2 login-able tenants after install)');
  ok(pB.idmpOrders === 8, 'all 8 client-13 orders survived the reload (got ' + pB.idmpOrders + ')');

  // ── Phase C: idempotent re-install → guarded no-op; tax junctions must not double ──
  const reIn = await page.evaluate(() => window.idmpInstallShard('13-idempiere.db'));
  await page.waitForTimeout(200);
  const pC = await page.evaluate(probe);
  console.log('§IDMP-INSTALL-C re-install already=' + (reIn && reIn.already ? 'Y' : 'N') + ' rows=' + (reIn && reIn.mRow)
    + ' | ' + since('§IDEMPIERE shard-skip'));
  console.log('  clients=' + pB.clients + '→' + pC.clients + ' idmpOrders=' + pB.idmpOrders + '→' + pC.idmpOrders + ' idmpTax=' + pB.idmpTax + '→' + pC.idmpTax);
  ok(reIn && reIn.already === true && reIn.mRow === 0, 're-install is a GUARDED no-op (already-resident skip, 0 rows merged)');
  ok(pC.idmpOrders === pB.idmpOrders, 'C_Order count unchanged on re-install');
  ok(pC.idmpTax === pB.idmpTax, 'c_invoicetax count unchanged — no tax doubling (PK dedup + guard)');

  // ── Phase D: the accounting view lights up — frozen fold derives the banded invoice to the cent ──
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
  }, ['C_Invoice', 1300100]);
  console.log('§IDMP-INSTALL-D preview C_Invoice:1300100 basis=' + cov.basis + ' coverage=' + cov.coverage + ' lines=' + cov.lines
    + ' absent=' + cov.absent + ' ΣDr=' + cov.sumDr + ' ΣCr=' + cov.sumCr + ' balanced=' + (cov.balanced ? 'Y' : 'N') + (cov.err ? ' err=' + cov.err : ''));
  ok(!cov.err && cov.coverage === 'complete', 'resident client-13 invoice derives coverage:complete (banded ids resolve end-to-end)');
  ok(!cov.err && cov.balanced, 'derived journal balanced (ΣDr==ΣCr) after re-install');

  // ── SEEN: screenshot the logged-in app on the resident tenant ──
  await page.goto(base + '?client=idempiere&login=GardenAdmin', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(__dirname, 'install_idmp_resident.png') });
  console.log('§IDMP-INSTALL-SHOT install_idmp_resident.png (logged in on the resident iDempiere tenant)');

  console.log('\n' + (fails === 0 && errs.length === 0 ? '🟢 W-INSTALL-IDMP PASS' : '🔴 W-INSTALL-IDMP FAIL (' + fails + ' asserts, ' + errs.length + ' pageErrors)')
    + ' — the re-banded shard installs beside GardenWorld from the dialog, survives reload, idempotent, folds to the cent. pageErrors=' + (errs.length ? errs.join('|') : 0));
  await browser.close();
  server.close();
  process.exit(fails === 0 && errs.length === 0 ? 0 : 1);
})().catch(e => { console.error('PROBE-ERR', e); server.close(); process.exit(2); });
