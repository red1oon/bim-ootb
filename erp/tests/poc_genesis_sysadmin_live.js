// W-GENESIS-SYSADMIN-LIVE — Initial Tenant Setup reached the CANONICAL way in a real browser (SYSTEM_ADMIN_LANE
//   §SA1). Drives the whole System-Admin entry: front door lists the System(0) tenant → log in as System
//   Administrator → the menu carries "Initial Tenant Setup" (and ONLY that, for this leg) → click it → the genesis
//   wizard mounts EMBEDDED in the iDempiere chrome (no redirect) → ~3 inputs → a new tenant is born + installed
//   resident (reuses the shipped window.idmpInstallGenesis, #359) → it logs in. Gating: GardenWorld + the 5 demos
//   still list, 0 cross-leak; the genesis process is System-only (GardenWorld Admin never gets process-access 53161).
// Run: node tests/poc_genesis_sysadmin_live.js   (serves erp/ on a local port). §-log first — read the log.
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

// whitebox over the live in-page db (window.__idmpDb) — runs in the browser
function probe() {
  function rows(sql) { try { var r = window.__idmpDb.exec(sql); return r.length ? r[0].values : []; } catch (e) { return []; } }
  function one(sql) { var v = rows(sql); return v.length ? v[0][0] : null; }
  return {
    clients: rows("SELECT cl.AD_Client_ID, cl.Name FROM AD_Client cl JOIN AD_Role r ON r.AD_Client_ID=cl.AD_Client_ID AND r.IsActive='Y' " +
      "JOIN AD_User_Roles ur ON ur.AD_Role_ID=r.AD_Role_ID JOIN AD_User u ON u.AD_User_ID=ur.AD_User_ID AND u.IsActive='Y' " +
      "WHERE cl.IsActive='Y' GROUP BY cl.AD_Client_ID ORDER BY cl.AD_Client_ID").map(function (v) { return v[0] + ':' + v[1]; }),
    sysProcAccess: one("SELECT COUNT(*) FROM AD_Process_Access WHERE AD_Process_ID=53161 AND AD_Role_ID=0 AND IsActive='Y'"),
    // SECURITY — the genesis process must NOT be granted to any GardenWorld role (client 11)
    gwProcAccess: one("SELECT COUNT(*) FROM AD_Process_Access pa JOIN AD_Role r ON r.AD_Role_ID=pa.AD_Role_ID WHERE pa.AD_Process_ID=53161 AND r.AD_Client_ID=11"),
    gwBp: one("SELECT COUNT(*) FROM C_BPartner WHERE AD_Client_ID=11")
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

  // ── 1. front door — clean cache, boot, the System tenant must appear in the step-0 switcher ──────────────────────
  await page.goto(base + '/idempiere.html', { waitUntil: 'networkidle' });
  await page.evaluate(function () { return new Promise(function (r) { var q = indexedDB.deleteDatabase('erp_cache'); q.onsuccess = q.onerror = q.onblocked = function () { r(); }; }); });
  await page.goto(base + '/idempiere.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(function () { return !!window.__idmpDb; }, null, { timeout: 30000 });
  await page.waitForFunction(function () { return document.querySelector('#idmp-login-step0') && document.querySelector('#idmp-login-clients').children.length > 0; }, null, { timeout: 20000 });
  await page.waitForTimeout(300);
  var residentNames = await page.$$eval('#idmp-login-clients .idmp-login-user:not(.idmp-login-demo) .nm', function (els) { return els.map(function (e) { return e.textContent.trim(); }); });
  var demoNames = await page.$$eval('#idmp-login-clients .idmp-login-demo .nm', function (els) { return els.map(function (e) { return e.textContent.trim(); }); });

  // ── 2. log in as System Administrator (System tenant → System user → role 0) ─────────────────────────────────────
  var menuLeaves = [], wizardMounted = false, created = null, enterOk = false;
  try {
    await page.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('System'))", { timeout: 6000 });
    await page.waitForSelector('#idmp-login-step1:visible', { timeout: 8000 });
    await page.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('System'))", { timeout: 6000 });
    await page.waitForSelector('#idmp-login-step2:visible', { timeout: 8000 });
    await page.click('#idmp-login-ok');
    await page.waitForFunction(function () { return document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0; }, null, { timeout: 10000 });

    // ── 3. the menu carries "Initial Tenant Setup" (System-only). Expand folders + read leaves ───────────────────────
    menuLeaves = await page.evaluate(function () {
      document.querySelectorAll('#idmp-tree .idmp-row:not(.leaf)').forEach(function (r) { if (!r.parentElement.classList.contains('open')) r.click(); });
      return [].map.call(document.querySelectorAll('#idmp-tree .idmp-row.leaf .nm'), function (e) { return e.textContent.trim(); });
    });

    // ── 4. click it → the genesis wizard mounts in-chrome (no redirect) ─────────────────────────────────────────────
    await page.click("#idmp-tree .idmp-row.leaf:has(.nm:text-is('Initial Tenant Setup'))", { timeout: 6000 });
    await page.waitForSelector('[data-genesis-create]', { timeout: 8000 });
    wizardMounted = (await page.url()).indexOf('genesis.html') < 0;   // still on idempiere.html = embedded, not a redirect

    // ── 5. ~3 inputs → create → a new tenant is born + installed resident ───────────────────────────────────────────
    await page.fill('[data-genesis-name]', 'SysAcme');
    await page.click('[data-genesis-create]');
    await page.waitForSelector('[data-genesis-enter]', { timeout: 25000 });
    created = await page.evaluate(function () { try { var r = window.__idmpDb.exec("SELECT AD_Client_ID FROM AD_Client WHERE Name='SysAcme'"); return r.length && r[0].values.length ? r[0].values[0][0] : null; } catch (e) { return null; } });

    // ── 6. enter the new tenant → its user list shows ───────────────────────────────────────────────────────────────
    await page.click('[data-genesis-enter]');
    await page.waitForSelector('#idmp-login-step1:visible', { timeout: 8000 });
    enterOk = true;
  } catch (e) { pageErrors.push('flow: ' + e.message); }

  var p = await page.evaluate(probe);

  // ── verdict ──────────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('═══ W-GENESIS-SYSADMIN-LIVE — Initial Tenant Setup reached as System Administrator (canonical entry) ═══\n');
  logs.filter(function (l) { return /SYSTEM-TENANT|W-GENESIS-SYSADMIN-LIVE|GENESIS-RESIDENT-LIVE install|login-step0|IDEMPIERE-LOGIN/.test(l); }).forEach(function (l) { console.log('  ' + l); });
  console.log('\n  step0 resident=[' + residentNames.join(',') + ']  demos=[' + demoNames.join(',') + ']');
  console.log('  menu leaves=[' + menuLeaves.join(' · ') + ']');
  console.log('  wizardMounted=' + wizardMounted + '  created=SysAcme(' + created + ')  enter=' + enterOk);
  console.log('  probe → clients=[' + p.clients.join(',') + '] sysProcAccess=' + p.sysProcAccess + ' gwProcAccess=' + p.gwProcAccess + ' gwBp=' + p.gwBp + '\n');

  var L = logs.join('\n'), pass = 0, fail = 0;
  function ck(ok, msg) { (ok ? pass++ : fail++); console.log((ok ? '  ✓ ' : '  ✗ FAIL ') + msg); }
  ck(/§SYSTEM-TENANT ensure rows=7/.test(L), 'boot overlay installs the System(0) login surface (7 oracle rows)');
  ck(residentNames.indexOf('System') >= 0, 'the System tenant appears at the front door (step-0 switcher)');
  ck(residentNames.indexOf('GardenWorld') >= 0, 'GardenWorld still lists (gating — System added, nothing lost)');
  ck(demoNames.length >= 5, 'the 5 demo tenants still present at the front door (' + demoNames.length + ')');
  ck(/§IDEMPIERE-LOGIN user=System .*client=System\(0\)/.test(L), 'logs in as System Administrator, client 0');
  ck(menuLeaves.indexOf('Initial Tenant Setup') >= 0, 'the System menu carries "Initial Tenant Setup"');
  ck(/§W-GENESIS-SYSADMIN-LIVE wizard-mount proc=53161 in-chrome=Y/.test(L) && wizardMounted, 'clicking it mounts the wizard EMBEDDED in the chrome (no redirect to genesis.html)');
  ck(/§W-GENESIS-SYSADMIN-LIVE born client=SysAcme/.test(L), 'the wizard births a tenant from ~3 inputs');
  ck(/§W-GENESIS-SYSADMIN-LIVE created client=\d+ rows=\d+/.test(L), 'the born tenant is installed resident (idmpInstallGenesis)');
  ck(created != null && Number(created) >= 17, 'SysAcme is resident as a real AD_Client (id ' + created + ')');
  ck(p.clients.some(function (c) { return /:System$/.test(c); }) && p.clients.some(function (c) { return /:GardenWorld$/.test(c); }) && p.clients.some(function (c) { return /:SysAcme$/.test(c); }), 'login switcher now lists System + GardenWorld + SysAcme (0 leak)');
  ck(Number(p.sysProcAccess) === 1, 'the genesis process is granted to the System role (53161 → role 0)');
  ck(Number(p.gwProcAccess) === 0, 'SECURITY — the genesis process is NOT granted to any GardenWorld role (client admin cannot create a company)');
  ck(Number(p.gwBp) === 18, 'GardenWorld data untouched (18 BPartners) — 0 cross-leak');
  ck(enterOk, 'the new tenant ENTERS — its user list shows');
  ck(pageErrors.length === 0, 'zero page errors' + (pageErrors.length ? ' — ' + pageErrors[0] : ''));

  console.log('\n═══ W-GENESIS-SYSADMIN-LIVE: ' + pass + ' PASS / ' + fail + ' FAIL ═══');
  console.log(fail === 0 ? '✅ Initial Tenant Setup is now reached the canonical iDempiere way — System login → menu → wizard, System-only.' : '❌ gaps above.');
  await browser.close(); server.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error('test error', e); server.close(); process.exit(1); });
