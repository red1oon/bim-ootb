#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-SAP-MIGRATE-LIVE (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §SAP-SPEC). WIRING on the real page (the values are W-SAP-MIGRATE's): READ THE LOG — every
//   verdict is a §SAPL line, and the page's own §AD-FORM-GENERIC / §ODOO-FORM / §SAP-ALPHA lines are printed; the exit code is not the evidence.
// THE ISSUE it proves/disproves: the "Migrate from SAP Business One (alpha)" form reaches a user on the real page — the plugin started by the System Administrator, a tenant born on
//   the page, its admin opens the menu leaf (9544001), picks the sap_export.json the agent wrote (here: the agent run against the local mock Service Layer serving SAP's guide
//   examples), sets the cut-over, Refresh predicts, Process commits ONE signed group, the alpha report reaches the console. Headless Chromium, no GPU. No live Business One (CONN).
// Command: node erp/tests/witness_sap_migrate_live.js
'use strict';
var path = require('path'), http = require('http'), fs = require('fs');
var ROOT = path.join(__dirname, '..', '..'), FIXD = path.join(__dirname, 'fixtures', 'sap_b1_guide');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.css': 'text/css', '.svg': 'image/svg+xml' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var judged = 0, fails = 0, J = JSON.stringify;
function check(key, ok, rule, info) { judged++; if (!ok) fails++; console.log('  §SAPL-CHECK key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + J(info))); return ok; }
var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

(async function () {
  var server = http.createServer(function (req, res) {
    var u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname), f = path.join(ROOT, p === '/' ? '/erp/idempiere.html' : p);
    if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + server.address().port, browser = await reqPw().chromium.launch({ args: ['--disable-gpu'] });
  var ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } }), logs = [], errs = [];
  async function open() {
    var pg = await ctx.newPage(); pg.on('console', function (m) { logs.push(m.text()); }); pg.on('pageerror', function (e) { errs.push(e.message); });
    await pg.goto(base + '/erp/idempiere.html?lang=en_US', { waitUntil: 'load' });
    await pg.waitForFunction(function () { return !!window.__idmpDb && document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0; }, null, { timeout: 120000 });
    await sleep(2500); return pg;
  }
  try {
    // 1 — start the two plugins (the System Administrator's Enable), then birth + install a tenant (its admin role is granted the form at install)
    var pg = await open();
    async function login(client, user, role) {
      await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('" + client + "'))");
      await pg.waitForSelector('#idmp-login-users .idmp-login-user', { timeout: 15000 });
      await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('" + user + "'))"); await pg.waitForSelector('#idmp-login-step2:visible');
      if (role != null) { try { await pg.selectOption('#idmp-login-role', String(role)); } catch (e) {} }
      await pg.click('#idmp-login-ok');
      await pg.waitForFunction(function () { return document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0; }, null, { timeout: 60000 }); await sleep(1500);
    }
    await login('System', 'System', 0);   // only the System Administrator may start a bundle (plugin console rule)
    // the administrator's path: Plugins & Releases -> Start (it persists the started state, so a reload restores it)
    await pg.evaluate(function () { window.PluginRelease.open(); }); await pg.waitForSelector('#pr-osgi table.oc-t', { timeout: 15000 }); await sleep(800);
    for (var id of ['org.idempiere.ninja.migrate', 'org.kernel.sap.migrate']) {
      var has = await pg.$('[data-oc-start="' + id + '"]'); if (has) { await pg.click('[data-oc-start="' + id + '"]'); await sleep(2500); }
    }
    var st = await pg.evaluate(function () { var R = window.PluginEngine && window.PluginEngine._reg && window.PluginEngine._reg(); var o = {};
      ['org.idempiere.ninja.migrate', 'org.kernel.sap.migrate'].forEach(function (id) { var b = R && R.list().filter(function (x) { return x.id === id; })[0]; o[id] = b ? b.state : 'NOT-INSTALLED'; }); return o; });
    console.log('§SAPL plugins ' + J(st));
    check('plugins', st['org.idempiere.ninja.migrate'] === 'ACTIVE' && st['org.kernel.sap.migrate'] === 'ACTIVE', 'both bundles start on the page (installed stopped by plugin_overlay INSTALL_ONLY)', st);
    var inst = await pg.evaluate(async function () { var b = window.Genesis.birthTenant({ clientName: 'B1 Live', currencyId: 100, currencyIso: 'USD', currencyPrecision: 2, adminUser: 'b1Live', dateAcct: '2026-11-09', countryId: 100 });
      var r = await window.idmpInstallGenesis(b); var role = window.__idmpDb.exec("SELECT ad_role_id FROM ad_role WHERE ad_client_id=" + r.clientId + " AND name LIKE '%Admin'"); return { r: r, role: role.length ? role[0].values[0][0] : null }; });
    console.log('§SAPL tenant ' + J(inst));
    check('tenant', inst.r && inst.r.ok && inst.r.persisted, 'a tenant is born and installed on the page (persisted)', inst);
    await pg.close();
    // the export file: the agent itself, run against the local mock Service Layer (SAP's guide examples) — the same as W-SAP-MIGRATE
    var MOCK = require('./sap_sl_mock.js'), mk = await MOCK.start(JSON.parse(fs.readFileSync(path.join(FIXD, 'rows.json'), 'utf8')));
    var exp = await require('../sap_agent/agent.js').run({ url: mk.url, company: 'SBODEMOUS', user: 'manager', password: 'mock' }, null, function (l) { console.log('  ' + l); }); mk.close();
    var PKG = path.join(require('os').tmpdir(), 'sap_export.json'); fs.writeFileSync(PKG, JSON.stringify(exp));
    // 2 — reload, log in as the new tenant's admin, open the menu leaf
    pg = await open();
    await login('B1 Live', 'b1Live', inst.role);
    var leaf = await pg.evaluate(function () { var lf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="9544001"]'); if (!lf) return false; var n = lf.parentElement; while (n && n.id !== 'idmp-tree') { if (n.style) n.style.display = ''; n = n.parentElement; } lf.click(); return true; });
    check('menu', leaf, 'the new tenant admin sees the menu leaf "Migrate from SAP Business One (alpha)" (9544001) and it opens', leaf);
    var shown = await pg.waitForSelector('[data-gform="org.kernel.sap.MigrateFromB1"] [data-gform-param="Files"]', { timeout: 20000 }).then(function () { return true; }, function () { return false; });
    check('form', shown, 'the generic renderer draws the form: a file parameter and a date', shown);
    await pg.setInputFiles('[data-gform-param="Files"]', [PKG]);
    await pg.fill('[data-gform-param="Cutover"]', '2026-11-09');
    await pg.click('[data-gform="org.kernel.sap.MigrateFromB1"] [data-gform-refresh]');
    await pg.waitForFunction(function () { return document.querySelectorAll('[data-gform-row]').length > 5; }, null, { timeout: 90000 }).catch(function () {});
    var g1 = await pg.evaluate(function () { var u = {}; document.querySelectorAll('[data-gform-row]').forEach(function (tr) { var it = tr.children[1] && tr.children[1].innerText.trim(), inp = tr.querySelector('[data-gform-cell="erpunit"]'); if (inp) u[it] = inp.value; });
      return { rows: document.querySelectorAll('[data-gform-row]').length, units: u, alpha: Array.prototype.some.call(document.querySelectorAll('[data-gform-row]'), function (t) { return /ALPHA/.test(t.innerText); }) }; });
    console.log('§SAPL grid1 ' + J(g1));
    check('no-unit-question', Object.keys(g1.units).length === 0, 'the guide\'s items carry no unit, so the form asks none (they take the client\'s default unit, ImportProduct.java:304-311)', g1.units);
    check('alpha-label', g1.alpha, 'the screen says ALPHA (not yet run against a live SAP Business One)', g1);
    await pg.evaluate(function () { document.querySelectorAll('[data-gform-row]').forEach(function (tr) { var inp = tr.querySelector('[data-gform-cell="erpunit"]'); if (inp && !inp.value) inp.value = 'Each'; }); });
    var mark = logs.length;
    await pg.click('[data-gform="org.kernel.sap.MigrateFromB1"] [data-gform-refresh]');
    await pg.waitForFunction(function () { return !Array.prototype.some.call(document.querySelectorAll('[data-gform-row]'), function (t) { return /⚠/.test(t.innerText); }); }, null, { timeout: 120000 }).catch(function () {});
    var sum = logs.slice(mark).filter(function (l) { return /§ODOO-FORM summary/.test(l); }).pop() || '';
    console.log('§SAPL summary-line ' + sum.slice(0, 600));
    check('refresh', /§ODOO-FORM summary ok=true/.test(sum) && /refused=0/.test(sum), 'Refresh: the dry run predicts every sheet, refused 0', sum.slice(0, 300));
    var before = await pg.evaluate(function (cid) { return new Promise(function (res) { window.__crud.modelRun({ table: 'c_bpartner', timing: 'PROCESS', fn: function (trx) { var o = {};
      ['c_bpartner', 'm_product', 'm_inventoryline', 'c_elementvalue'].forEach(function (t) { o[t] = trx.q('SELECT count(*) AS n FROM ' + t + ' WHERE ad_client_id=?', [cid])[0].n; }); res(o); return { ok: true }; } }, function () {}); }); }, inst.r.clientId);
    mark = logs.length;
    await pg.click('[data-gform="org.kernel.sap.MigrateFromB1"] [data-gform-run]');
    await pg.waitForFunction(function () { var m = document.querySelector('[data-gform-msg]'); return m && /Migrated from|Not migrated|refused|Failed/i.test(m.innerText); }, null, { timeout: 180000 }).catch(function () {});
    await sleep(1500);
    var msg = await pg.evaluate(function () { var m = document.querySelector('[data-gform-msg]'); return m ? m.innerText : ''; });
    var commit = logs.slice(mark).filter(function (l) { return /§AD-FORM-GENERIC commit class=org\.kernel\.sap/.test(l); }).pop() || '';
    var alphaLines = logs.filter(function (l) { return /^§SAP-ALPHA /.test(l); });
    console.log('§SAPL process msg=' + J(msg.slice(0, 300)) + ' ' + commit + ' alphaLines=' + alphaLines.length);
    var after = await pg.evaluate(function (cid) { return new Promise(function (res) { window.__crud.modelRun({ table: 'c_bpartner', timing: 'PROCESS', fn: function (trx) { var o = {};
      ['c_bpartner', 'm_product', 'm_inventoryline', 'c_elementvalue'].forEach(function (t) { o[t] = trx.q('SELECT count(*) AS n FROM ' + t + ' WHERE ad_client_id=?', [cid])[0].n; }); res(o); return { ok: true }; } }, function () {}); }); }, inst.r.clientId);
    console.log('§SAPL counts before=' + J(before) + ' after=' + J(after));
    check('process', /Migrated from SAP Business One \(alpha\)/.test(msg) && /committed=true/.test(commit) && /verifyChain=ok/.test(commit), 'Process commits ONE signed group (verifyChain ok) and the form says what it migrated', { msg: msg, commit: commit });
    check('grew', after.c_bpartner - before.c_bpartner === 1 && after.m_product - before.m_product === 3 && after.m_inventoryline - before.m_inventoryline === 0 && after.c_elementvalue - before.c_elementvalue === 1,
      'the tenant grew by W-SAP-MIGRATE\'s prediction on the page too (1 partner, 3 items, 1 account, no stock)', { before: before, after: after });
    check('alpha-log', alphaLines.some(function (l) { return /§SAP-ALPHA result Migrated/.test(l); }) && alphaLines.length > 20, 'the alpha report reaches the console (§SAP-ALPHA lines) with the result line', alphaLines.length);
    var real = errs.filter(function (e) { return !/ResizeObserver/.test(e); });
    check('errors', real.length === 0, 'no page errors', real.slice(0, 3));
  } catch (e) { check('crash', false, 'the run completed', e && (e.stack || e.message)); }
  logs.filter(function (l) { return /§AD-FORM|§SAP-FORM|§ODOO-FORM|§PLUGIN/i.test(l) && !/§AD-FORM-GENERIC rows/.test(l); }).slice(-20).forEach(function (l) { console.log('   page-log: ' + l.slice(0, 300)); });
  logs.filter(function (l) { return /§NINJA-ERR/.test(l); }).slice(0, 12).forEach(function (l) { console.log('   page: ' + l); });
  await browser.close(); server.close();
  console.log('§SAPL-VERDICT ' + (!judged ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS') + ' judged=' + judged + ' failed=' + fails);
  process.exit(!judged ? 3 : fails ? 1 : 0);
})();
