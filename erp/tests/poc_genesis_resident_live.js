// W-GENESIS-RESIDENT-LIVE — drive the FULL genesis→resident flow in a real browser (sql.js + IndexedDB):
//   genesis.html births a tenant + posts to the cent → "Install as resident tenant" → idb handoff → redirect to
//   idempiere.html?installGenesis=1 → boot allocates a free band, re-bands + merges + grants + persists → the login
//   switcher lists the born tenant → it enters → its invoice data + account chain resolve, 0 cross-leak, 0 errors.
// Run: node tests/poc_genesis_resident_live.js   (serves erp/ on a local port). §-log first — read the log.
'use strict';
var http = require('http'), fs = require('fs'), path = require('path');
var { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');

var ROOT = path.join(__dirname, '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream' };
var server = http.createServer(function (req, res) {
  var f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, function (e, buf) {
    if (e) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(buf);
  });
});

// whitebox queries over the live in-page db (window.__idmpDb) — runs in the browser
function probe() {
  function one(sql) { try { var r = window.__idmpDb.exec(sql); return r.length && r[0].values.length ? r[0].values[0][0] : null; } catch (e) { return 'ERR:' + e.message; } }
  function rows(sql) { try { var r = window.__idmpDb.exec(sql); return r.length ? r[0].values.map(function (v) { return v[0]; }) : []; } catch (e) { return []; } }
  var clients = rows("SELECT cl.Name FROM AD_Client cl JOIN AD_Role r ON r.AD_Client_ID=cl.AD_Client_ID AND r.IsActive='Y' " +
    "JOIN AD_User_Roles ur ON ur.AD_Role_ID=r.AD_Role_ID JOIN AD_User u ON u.AD_User_ID=ur.AD_User_ID AND u.IsActive='Y' " +
    "WHERE cl.IsActive='Y' GROUP BY cl.AD_Client_ID ORDER BY cl.AD_Client_ID");
  var acmeId = one("SELECT AD_Client_ID FROM AD_Client WHERE Name='AcmeCo'");
  var roleId = one("SELECT AD_Role_ID FROM AD_Role WHERE AD_Client_ID=" + acmeId + " AND Name LIKE '%Admin%'");
  return {
    clients: clients,
    acmeId: acmeId,
    windowAccess: one("SELECT COUNT(*) FROM AD_Window_Access WHERE AD_Role_ID=" + roleId),
    invGrand: one("SELECT grandtotal FROM C_Invoice WHERE AD_Client_ID=" + acmeId),
    invClientScoped: one("SELECT COUNT(*) FROM C_Invoice WHERE AD_Client_ID=" + acmeId),
    receivableValue: one("SELECT ev.Value FROM C_Invoice i JOIN C_BP_Customer_Acct ba ON ba.C_BPartner_ID=i.C_BPartner_ID " +
      "JOIN C_ValidCombination vc ON vc.C_ValidCombination_ID=ba.C_Receivable_Acct " +
      "JOIN C_ElementValue ev ON ev.C_ElementValue_ID=vc.Account_ID WHERE i.AD_Client_ID=" + acmeId),
    gwBp: one("SELECT COUNT(*) FROM C_BPartner WHERE AD_Client_ID=11"),
    acmeChart: one("SELECT COUNT(*) FROM C_ElementValue WHERE AD_Client_ID=" + acmeId)
  };
}

(async function () {
  await new Promise(function (r) { server.listen(0, r); });
  var port = server.address().port, base = 'http://localhost:' + port;
  var logs = [], pageErrors = [];
  var browser = await chromium.launch({ args: ['--no-sandbox'] });
  var page = await browser.newPage();
  page.on('console', function (m) { var t = m.text(); if (t.indexOf('§') === 0) logs.push(t); });
  page.on('pageerror', function (e) { pageErrors.push(String(e)); });

  // ── 1. genesis.html — birth + post, then install ─────────────────────────────────────────────────────────────
  await page.goto(base + '/genesis.html', { waitUntil: 'networkidle' });
  await page.evaluate(function () { return new Promise(function (r) { var q = indexedDB.deleteDatabase('erp_cache'); q.onsuccess = q.onerror = q.onblocked = function () { r(); }; }); });
  await page.click('#go');
  await page.waitForSelector('#install-resident', { timeout: 20000 });
  await page.click('#install-resident');

  // ── 2. redirect → idempiere.html?installGenesis=1 — boot installs the born tenant ───────────────────────────────
  await page.waitForURL(/installGenesis=1/, { timeout: 20000 });
  await page.waitForFunction(function () { return !!window.__idmpDb; }, null, { timeout: 30000 });
  await page.waitForFunction(function () { return document.querySelector('#idmp-login-step0') && document.querySelector('#idmp-login-clients').children.length > 0; }, null, { timeout: 20000 });
  await page.waitForTimeout(400);

  var p = await page.evaluate(probe);
  var step0Names = await page.$$eval('#idmp-login-clients .nm', function (els) { return els.map(function (e) { return e.textContent.trim(); }); });

  // ── 3. enter — click the born tenant → its user list ──────────────────────────────────────────────────────────
  var entered = false, enterUser = null;
  try {
    await page.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('AcmeCo'))", { timeout: 5000 });
    await page.waitForSelector('#idmp-login-step1:visible', { timeout: 8000 });
    enterUser = (await page.$$eval('#idmp-login-users .nm', function (els) { return els.map(function (e) { return e.textContent.trim(); }); })).join(',');
    entered = true;
  } catch (e) { pageErrors.push('enter-step: ' + e.message); }

  // ── 4. persistence — reload WITHOUT the param: the born tenant must STILL be resident (it stuck) ────────────────
  await page.goto(base + '/idempiere.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(function () { return !!window.__idmpDb; }, null, { timeout: 30000 });
  await page.waitForTimeout(400);
  var pReload = await page.evaluate(function () { try { var r = window.__idmpDb.exec("SELECT AD_Client_ID FROM AD_Client WHERE Name='AcmeCo'"); return r.length && r[0].values.length ? r[0].values[0][0] : null; } catch (e) { return null; } });

  // ── verdict ───────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('═══ W-GENESIS-RESIDENT-LIVE — a born tenant becomes a RESIDENT, login-able client in a REAL browser ═══\n');
  logs.filter(function (l) { return /GENESIS-RESIDENT-LIVE|CRITIC-FRONTDOOR|login-step0/.test(l); }).forEach(function (l) { console.log('  ' + l); });
  console.log('  probe → clients=[' + p.clients.join(',') + '] acme=' + p.acmeId + ' winAccess=' + p.windowAccess
    + ' inv$=' + p.invGrand + ' receivable=' + p.receivableValue + ' chart=' + p.acmeChart + ' gwBp=' + p.gwBp);
  console.log('  step0 DOM names=[' + step0Names.join(',') + ']  enteredUser=' + enterUser + '  reloadAcme=' + pReload + '\n');

  var L = logs.join('\n'), pass = 0, fail = 0;
  function ck(ok, msg) { (ok ? pass++ : fail++); console.log((ok ? '  ✓ ' : '  ✗ FAIL ') + msg); }
  ck(/§W-GENESIS-RESIDENT-LIVE handoff client=AcmeCo groups=7/.test(L), 'genesis.html births + hands off the bundle (G1..G7)');
  ck(/§GENESIS-RESIDENT-LIVE install name=AcmeCo client=17 rows=\d+ grants=\d+/.test(L), 'boot installs the born tenant (reband+merge+grant) at client 17');
  ck(/§GENESIS-RESIDENT-LIVE persist .* resident=Y/.test(L), 'merged tenant persisted to the resident cache');
  ck(Number(p.acmeId) === 17, 'born tenant is resident as AD_Client 17');
  ck(p.clients.indexOf('AcmeCo') >= 0 && p.clients.indexOf('GardenWorld') >= 0, 'login switcher lists BOTH AcmeCo and GardenWorld (0 leak)');
  ck(step0Names.indexOf('AcmeCo') >= 0, 'the born tenant appears in the step-0 switcher DOM');
  ck(Number(p.windowAccess) > 300, 'born admin role has a workable menu (full dictionary window access) — ' + p.windowAccess);
  ck(Number(p.invClientScoped) >= 1 && Number(p.invGrand) === 109, 'the invoice window renders ITS data ($109 invoice scoped to client 17)');
  ck(String(p.receivableValue) === '12110', 'the invoice account chain resolves to the oracle receivable (12110) — posts to the cent');
  ck(Number(p.gwBp) === 18, 'GardenWorld data untouched (18 BPartners) — 0 cross-leak');
  ck(entered, 'the born tenant ENTERS — its user list shows (' + enterUser + ')');
  ck(Number(pReload) === 17, 'the born tenant STICKS — still resident after a plain reload (no param)');
  ck(pageErrors.length === 0, 'zero page errors' + (pageErrors.length ? ' — ' + pageErrors[0] : ''));

  console.log('\n═══ W-GENESIS-RESIDENT-LIVE: ' + pass + ' PASS / ' + fail + ' FAIL ═══');
  console.log(fail === 0 ? '✅ A born tenant is now a RESIDENT client you log in to and work — Initial Client Setup is USABLE on our engine.' : '❌ gaps above.');
  await browser.close(); server.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error('test error', e); server.close(); process.exit(1); });
