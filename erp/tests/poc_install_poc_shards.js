// ⚠ DO NOT REMOVE — Scope guard
// Scope: §-witness for the SAP/Oracle/Dynamics PoC TENANTS + the tenant-switcher truth
// (IMPORT_EXPAND_POC.md §P-1/§P-2/§L-1, W-POC-SHARDS).
//   PROVES the issues:
//   (1) "the import covers only iDempiere/Odoo — SAP/Oracle/Dynamics are dead 'coming' cards" → after the
//       fix, INSTALL mode installs a master-matching PoC tenant for each (documented demo model, honest claim).
//   (2) the user's "could not choose more clients at login" → witnessed switcher truth: bare seed = ONE
//       login-able tenant → Step 0 auto-skips BY DESIGN; after installs Step 0 lists GardenWorld + N; each
//       tenant logs in via its OWN <Tenant> Admin user (System user 10 = System Administrator(0) only).
//   Phases:
//     §P0 BARE       — 1 login-able tenant (GardenWorld); SAP/Oracle/Dynamics cards show 'PoC tenant' badge
//                      in install mode; claim panel glyph-scan=0 (Lucide-only regression).
//     §P1 INSTALL ×3 — dialog-drive Install for sap/oracle/dynamics → §ERP-INSTALL persisted=Y each.
//     §P2 MASTERS    — exact per-shard master counts land (SFLIGHT 14 BP + 10 products · SCOTT 4 groups +
//                      14 employees · CRONUS 14 items + 5 customers) — nothing invented, counts logged.
//     §P3 SWITCHER   — listClients = 4 tenants (GardenWorld + 3 PoC); each PoC tenant has ≥1 login user
//                      (its own Admin); System user(10) appears for NO tenant client (PoC scope, by design).
//     §P4 GUARD      — re-install sap → already-resident skip, 0 rows.
//   §-log first — READ tests/poc_install_poc_shards.log before any conclusion.
// Run:  node tests/poc_install_poc_shards.js 2>&1 | tee tests/poc_install_poc_shards.log   (cwd = bim-ootb/erp)
'use strict';
let chromium;
try { ({ chromium } = require(__dirname + '/../../tests/node_modules/playwright')); }
catch (e) { ({ chromium } = require(process.env.HOME + '/bim-ootb/tests/node_modules/playwright')); }
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/idempiere.html';
  const fsPath = p.indexOf('/common/') === 0 ? path.join(ROOT, '..', p) : path.join(ROOT, p);
  fs.readFile(fsPath, (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  ✗ FAIL: ' + m); } else { console.log('  ✓ ' + m); } };

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port, base = `http://localhost:${port}/idempiere.html`;
  const logs = [], errs = [];
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();   // fresh IDB
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));
  const since = (tag) => logs.filter(l => l.indexOf(tag) >= 0).slice(-1)[0] || '(no ' + tag + ')';

  console.log('\n══ W-POC-SHARDS — SAP/Oracle/Dynamics PoC tenants install; the switcher truth ══\n');

  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__idmpDb, null, { timeout: 15000 });
  await page.waitForTimeout(600);

  // ── §P0: bare seed = 1 tenant (the user's "could not choose" — Step 0 auto-skips BY DESIGN) ──
  const bare = await page.evaluate(() => window.IdmpSession.listClients(window.__idmpDb).length);
  console.log('§POC-P0 bare-seed tenants=' + bare + ' (Step 0 auto-skips at 1 — nothing to choose until an install)');
  ok(bare === 1, 'bare seed = 1 login-able tenant → the login switcher has nothing to offer BY DESIGN');

  // PoC badge + claim panel render (and stay Lucide-clean)
  await page.evaluate(() => window.ErpPicker.open({ mode: 'install' }));
  await page.waitForSelector('#ep-c-sap', { timeout: 5000 });
  await page.waitForTimeout(1500);                              // detection settles (re-renders badges)
  const badge = await page.evaluate(() => (document.getElementById('ep-b-sap') || {}).textContent || '');
  ok(/PoC tenant/.test(badge), 'SAP card badge = "PoC tenant" in install mode (was "coming soon")');
  await page.click('#ep-c-sap');
  await page.waitForSelector('#ep-go:not([disabled])', { timeout: 5000 });
  await page.click('#ep-go');
  await page.waitForSelector('#ep-install-go', { timeout: 5000 });
  const scan = await page.evaluate(() => {
    const el = document.getElementById('ep-overlay');
    const hits = (el.innerHTML.match(/[☀-➿⬀-⯿⧉■-◿]|[\uD83C-\uDBFF][\uDC00-\uDFFF]/g) || []);
    const claim = (el.querySelector('.ep-lock') || {}).textContent || '';
    return { glyphs: hits.length, pocClaim: /PoC tenant/.test(claim) && /not a live extraction/.test(claim) };
  });
  console.log('§POC-P0 claim-panel glyphs=' + scan.glyphs + ' honest-poc-claim=' + (scan.pocClaim ? 'Y' : 'N'));
  ok(scan.glyphs === 0, 'PoC claim panel scans Lucide-clean (zero glyph codepoints)');
  ok(scan.pocClaim, 'claim text is HONEST: names the reference model, says "not a live extraction"');

  // ── §P1: install all three from the dialog ──
  const installOne = async (key) => {
    await page.evaluate(() => { const b = document.getElementById('ep-back'); if (b) b.click(); });
    await page.waitForSelector('#ep-c-' + key, { timeout: 5000 });
    await page.click('#ep-c-' + key);
    await page.waitForSelector('#ep-go:not([disabled])', { timeout: 5000 });
    await page.click('#ep-go');
    await page.waitForSelector('#ep-install-go', { timeout: 5000 });
    await page.click('#ep-install-go');
    await page.waitForFunction(() => !!document.getElementById('ep-reload'), null, { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(300);
    return since('§ERP-INSTALL');
  };
  for (const key of ['sap', 'oracle', 'dynamics']) {
    const line = await installOne(key);
    console.log('§POC-P1 ' + line);
    ok(new RegExp('erp=' + key + ' .*persisted=Y').test(line), key + ' installed from the dialog (persisted=Y)');
  }
  await page.evaluate(() => window.ErpPicker.close());

  // ── §P2: exact master counts land (the "master tables can be matched" proof) ──
  const counts = await page.evaluate(() => {
    const q = (s) => { try { const r = window.__idmpDb.exec(s); return r.length ? Number(r[0].values[0][0]) : 0; } catch (e) { return -1; } };
    return {
      sapBP: q("SELECT COUNT(*) FROM C_BPartner WHERE AD_Client_ID=14"),
      sapProd: q("SELECT COUNT(*) FROM M_Product WHERE AD_Client_ID=14"),
      oraGrp: q("SELECT COUNT(*) FROM C_BP_Group WHERE AD_Client_ID=15"),
      oraEmp: q("SELECT COUNT(*) FROM C_BPartner WHERE AD_Client_ID=15 AND IsEmployee='Y'"),
      dynProd: q("SELECT COUNT(*) FROM M_Product WHERE AD_Client_ID=16"),
      dynCust: q("SELECT COUNT(*) FROM C_BPartner WHERE AD_Client_ID=16 AND IsCustomer='Y'"),
      kingJob: (function () { try { const r = window.__idmpDb.exec("SELECT Description FROM C_BPartner WHERE AD_Client_ID=15 AND Name='KING'"); return r.length ? String(r[0].values[0][0]) : ''; } catch (e) { return ''; } })()
    };
  });
  console.log('§POC-P2 sap BP=' + counts.sapBP + ' products=' + counts.sapProd
    + ' · oracle groups=' + counts.oraGrp + ' employees=' + counts.oraEmp
    + ' · dynamics items=' + counts.dynProd + ' customers=' + counts.dynCust
    + ' · KING="' + counts.kingJob + '"');
  ok(counts.sapBP === 14 && counts.sapProd === 10, 'SFLIGHT masters matched: 14 carriers→C_BPartner, 10 connections→M_Product');
  ok(counts.oraGrp === 4 && counts.oraEmp === 14, 'SCOTT masters matched: 4 DEPT→C_BP_Group, 14 EMP→C_BPartner employees');
  ok(counts.dynProd === 14 && counts.dynCust === 5, 'CRONUS masters matched: 14 items→M_Product, 5 customers→C_BPartner');
  ok(/PRESIDENT/.test(counts.kingJob), 'spot value: KING is PRESIDENT (the documented SCOTT row, not invented)');

  // ── §P3: the switcher truth (the user\'s login question, answered from the log) ──
  const sw = await page.evaluate(() => {
    const cs = window.IdmpSession.listClients(window.__idmpDb);
    const perClient = {};
    cs.forEach(c => { perClient[c.id] = window.IdmpSession.usersForClient(window.__idmpDb, c.id).map(u => u.name); });
    return { tenants: cs.map(c => c.name + '(' + c.id + ')'), perClient };
  });
  console.log('§POC-P3 switcher tenants=[' + sw.tenants.join(', ') + ']');
  Object.keys(sw.perClient).forEach(id => console.log('  client ' + id + ' users=[' + sw.perClient[id].join(', ') + ']'));
  // 5 = System(0) + GardenWorld + 3 PoC — the shard's SystemAdmin frame makes System(0) login-able too,
  // exactly as the existing 12/13 shards do (poc_install_persist: shard-in 1→3 clients). Real-iDempiere-like:
  // the System client is where SuperUser/System belongs; tenants are entered via their own Admin users.
  ok(sw.tenants.length === 5, 'switcher now lists 5 tenants (System + GardenWorld + 3 PoC) — Step 0 WILL render');
  ok([14, 15, 16].every(id => (sw.perClient[id] || []).length >= 1), 'every PoC tenant is login-able via its own Admin user');
  ok([14, 15, 16].every(id => !(sw.perClient[id] || []).some(n => /^System$/.test(n))),
    'System user(10) enters NO tenant client — SuperUser scope = System Administrator(0) only, by design (document, not fix)');

  // ── §P4: guarded re-install ──
  const reIn = await page.evaluate(() => window.idmpInstallShard('14-sap.db'));
  console.log('§POC-P4 re-install sap already=' + (reIn && reIn.already ? 'Y' : 'N') + ' rows=' + (reIn && reIn.mRow));
  ok(reIn && reIn.already === true && reIn.mRow === 0, 're-install = guarded no-op (already-resident skip)');

  console.log('\n' + (fails === 0 && errs.length === 0 ? '🟢 W-POC-SHARDS PASS' : '🔴 W-POC-SHARDS FAIL (' + fails + ' asserts, ' + errs.length + ' pageErrors)')
    + ' — three PoC tenants install, masters match the documented models, the switcher fills up. pageErrors=' + (errs.length ? errs.join('|') : 0));
  await browser.close();
  server.close();
  process.exit(fails === 0 && errs.length === 0 ? 0 : 1);
})().catch(e => { console.error('PROBE-ERR', e); server.close(); process.exit(2); });
