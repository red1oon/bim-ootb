// SPDX-License-Identifier: GPL-2.0-only
// W-QUICKSETUP-LIVE — Quick setup + Setup check pill in the REAL idempiere.html (headless CPU, Playwright from ~/bim-ootb/tests/node_modules).
// ⚠ DO NOT REMOVE — spec bim-compiler prompts/ERP_DEPTH_FILM.md §QUICKSETUP + §SETUP-LENS. READ THE LOG: every verdict is a §QSL line.
// ISSUES it proves/disproves: (1) the legacy-identical wizard is UNCHANGED by default (quick box present, OFF, currency/admin/chart fields visible); (2) ticking Quick hides them and the tenant it
//   creates equals a tenant made through the long form with the same answers (per-table row counts for the new client + admin user name); (3) a currency-less country is REFUSED with an ask, no tenant created;
//   (4) the Setup check pill action lists the 10 lens lines for the logged-in client, read-only (db row count unchanged).
'use strict';
var http = require('http'), fs = require('fs'), path = require('path');
var { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');
var ROOT = path.join(__dirname, '..', '..'), MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream' };
var server = http.createServer(function (req, res) { var f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0])); fs.readFile(f, function (e, buf) { if (e) { res.writeHead(404); return res.end('404'); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(buf); }); });
var fails = 0, judged = 0; function ck(ok, what, info) { judged++; if (!ok) fails++; console.log('  §QSL-CHECK ' + (ok ? 'OK' : 'FAIL') + ' ' + what + (ok ? '' : ' ' + JSON.stringify(info))); }
(async function () {
  await new Promise(function (r) { server.listen(0, r); });
  var base = 'http://localhost:' + server.address().port, logs = [], errs = [];
  var browser = await chromium.launch({ args: ['--no-sandbox'] }), page = await browser.newPage();
  page.on('console', function (m) { var t = m.text(); if (t.indexOf('§') === 0) logs.push(t); }); page.on('pageerror', function (e) { errs.push(String(e)); });
  await page.goto(base + '/erp/idempiere.html', { waitUntil: 'networkidle' });
  await page.evaluate(function () { return new Promise(function (r) { var q = indexedDB.deleteDatabase('erp_cache'); q.onsuccess = q.onerror = q.onblocked = function () { r(); }; }); });
  await page.goto(base + '/erp/idempiere.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(function () { return !!window.__idmpDb; }, null, { timeout: 30000 });
  await page.waitForFunction(function () { return document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0; }, null, { timeout: 20000 });
  var q = function (sql) { return page.evaluate(function (s) { try { var r = window.__idmpDb.exec(s); return r.length ? r[0].values : []; } catch (e) { return []; } }, sql); };
  var counts = function (cid) { return page.evaluate(function (c) { var out = {}; ['c_elementvalue', 'c_period', 'c_doctype', 'c_tax', 'm_warehouse', 'c_bpartner', 'm_pricelist', 'ad_role', 'ad_sequence', 'c_acctschema'].forEach(function (t) { try { out[t] = window.__idmpDb.exec('SELECT COUNT(*) FROM ' + t + ' WHERE AD_Client_ID=' + c)[0].values[0][0]; } catch (e) { out[t] = null; } }); return out; }, cid); };
  var clientId = async function (n) { var r = await q("SELECT AD_Client_ID FROM AD_Client WHERE Name='" + n + "'"); return r.length ? r[0][0] : null; };
  var adminName = async function (cid) { var r = await q("SELECT u.Name FROM AD_User u JOIN AD_User_Roles ur ON ur.AD_User_ID=u.AD_User_ID JOIN AD_Role r ON r.AD_Role_ID=ur.AD_Role_ID WHERE r.AD_Client_ID=" + cid + " ORDER BY u.AD_User_ID LIMIT 1"); return r.length ? r[0][0] : null; };
  try {
    await page.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('System'))", { timeout: 6000 }); await page.waitForSelector('#idmp-login-step1:visible', { timeout: 8000 });
    await page.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('System'))", { timeout: 6000 }); await page.waitForSelector('#idmp-login-step2:visible', { timeout: 8000 }); await page.click('#idmp-login-ok');
    await page.waitForFunction(function () { return document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0; }, null, { timeout: 10000 });
    await page.evaluate(function () { document.querySelectorAll('#idmp-tree .idmp-row:not(.leaf)').forEach(function (r) { if (!r.parentElement.classList.contains('open')) r.click(); }); });
    var open = async function () { await page.click("#idmp-tree .idmp-row.leaf:has(.nm:text-is('Initial Tenant Setup'))", { timeout: 6000 }); await page.waitForSelector('[data-genesis-create]', { timeout: 8000 }); };
    // 1. default path unchanged
    await open();
    var vis = function (sel) { return page.evaluate(function (s) { var e = document.querySelector(s); return !!e && e.offsetParent !== null; }, sel); };
    ck(await page.evaluate(function () { var q = document.querySelector('[data-genesis-quick]'); return !!q && !q.checked; }), 'Quick setup box present and OFF by default', null);
    ck((await vis('[data-genesis-currency]')) && (await vis('[data-genesis-admin]')) && (await vis('[data-genesis-coa]')), 'default: currency, administrator and chart fields are all visible (legacy-identical form)', null);
    // 2. LONG tenant (USD, country 100, admin clientAdmin typed, default chart)
    await page.fill('[data-genesis-name]', 'LongCo'); await page.fill('[data-genesis-admin]', 'clientAdmin'); await page.click('[data-genesis-create]'); await page.waitForSelector('[data-genesis-enter]', { timeout: 30000 });
    // 3. QUICK tenant (same answers, derived)
    await open(); await page.check('[data-genesis-quick]');
    ck(!(await vis('[data-genesis-currency]')) && !(await vis('[data-genesis-admin]')) && !(await vis('[data-genesis-coa]')), 'Quick ON: currency, administrator and chart fields are hidden', null);
    var sum = await page.textContent('[data-genesis-quicksum]'); ck(/USD/.test(sum) && /clientAdmin/.test(sum), 'Quick summary names the derived currency and administrator', sum);
    await page.fill('[data-genesis-name]', 'QuickCo'); await page.click('[data-genesis-create]'); await page.waitForSelector('[data-genesis-enter]', { timeout: 30000 });
    var L = await clientId('LongCo'), Qc = await clientId('QuickCo'); ck(L != null && Qc != null && L !== Qc, 'both tenants created', { L: L, Q: Qc });
    var cl = await counts(L), cq = await counts(Qc); ck(JSON.stringify(cl) === JSON.stringify(cq) && Object.values(cl).every(function (v) { return v > 0; }), 'quick tenant rows == long tenant rows per table (10 tables, all > 0)', { long: cl, quick: cq });
    var al = await adminName(L), aq = await adminName(Qc); ck(al === aq && !!aq, 'administrator user name equal', { long: al, quick: aq });
    // 4. currency-less country refused
    var noCur = await q("SELECT C_Country_ID, Name FROM C_Country WHERE IsActive='Y' AND C_Currency_ID IS NULL ORDER BY C_Country_ID LIMIT 1");
    await open(); await page.check('[data-genesis-quick]'); await page.selectOption('[data-genesis-country]', String(noCur[0][0])); await page.fill('[data-genesis-name]', 'NoCurCo');
    var s2 = await page.textContent('[data-genesis-quicksum]'); ck(/Needs more/.test(s2) && /currency/.test(s2), 'country without currency: Quick says what it needs (' + noCur[0][1] + ')', s2);
    await page.click('[data-genesis-create]'); await page.waitForTimeout(600); ck((await clientId('NoCurCo')) === null, 'country without currency: NO tenant created (nothing invented)', null);
    // 5. Setup check pill on a resident client
    await page.evaluate(function () { location.reload(); }); await page.waitForFunction(function () { return !!window.__idmpDb; }, null, { timeout: 30000 });
    await page.waitForFunction(function () { return document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0; }, null, { timeout: 20000 });
    await page.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))", { timeout: 6000 }); await page.waitForSelector('#idmp-login-step1:visible', { timeout: 8000 });
    await page.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))", { timeout: 6000 }); await page.waitForSelector('#idmp-login-step2:visible', { timeout: 8000 }); await page.click('#idmp-login-ok');
    await page.waitForFunction(function () { return document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0; }, null, { timeout: 10000 });
    var before = await q('SELECT (SELECT COUNT(*) FROM C_BPartner)+(SELECT COUNT(*) FROM C_Invoice)+(SELECT COUNT(*) FROM AD_Client)');
    var manifest = await page.evaluate(function () { return fetch('pills_idmp.json').then(function (r) { return r.json(); }).then(function (m) { return m.pills.map(function (p) { return p.id; }); }); });
    ck(manifest.indexOf('setuplens') >= 0, 'pill manifest carries setuplens', manifest);
    await page.evaluate(function () { window.IdmpPillActions.setuplens(); }); await page.waitForSelector('[data-setuplens-row]', { timeout: 6000 });
    var rowsSL = await page.$$eval('[data-setuplens-row]', function (e) { return e.map(function (x) { return x.getAttribute('data-setuplens-row') + '=' + x.getAttribute('data-status'); }); });
    ck(rowsSL.length === 10 && rowsSL.every(function (r) { return /=OK$/.test(r); }), 'Setup check on GardenWorld lists 10 lines, all OK', rowsSL);
    var after = await q('SELECT (SELECT COUNT(*) FROM C_BPartner)+(SELECT COUNT(*) FROM C_Invoice)+(SELECT COUNT(*) FROM AD_Client)'); ck(JSON.stringify(before) === JSON.stringify(after), 'Setup check wrote nothing', { before: before, after: after });
  } catch (e) { errs.push('flow: ' + e.message); }
  ck(errs.length === 0, 'no page errors / flow errors', errs.slice(0, 3));
  logs.filter(function (l) { return /QUICKSETUP|SETUP-LENS/.test(l); }).forEach(function (l) { console.log('  ' + l.slice(0, 230)); });
  var v = !judged ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; console.log('§QSL-VERDICT ' + v + ' judged=' + judged + ' failed=' + fails);
  await browser.close(); server.close(); process.exit(v === 'PASS' ? 0 : 1);
})().catch(function (e) { console.log('§QSL-VERDICT CRASH ' + (e.stack || e)); process.exit(2); });
