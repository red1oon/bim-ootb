#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-ODOO-FORM-LIVE (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §B4-IMPL-SPEC). WIRING on the real page (the values are W-ODOO-FORM's): READ THE LOG — every
//   verdict is a §OFL line, and the page's own §AD-FORM-GENERIC / §ODOO-FORM / §NINJA lines are printed; the exit code is not the evidence.
// THE ISSUE it proves/disproves: the generic renderer's new capabilities (G-a file parameter, G-b text cells, G-c locked rows, G-d the grid carried into Refresh) actually reach a
//   user: a tenant born on the page (production install path), the two plugins started, the menu leaf "Migrate from Odoo" opens the form, the two export files are picked, the
//   units are typed, Refresh predicts, Process commits as one signed group, and the tenant's tables grew by the summary's prediction. Headless Chromium, no GPU.
// Command: node erp/tests/witness_odoo_form_live.js
'use strict';
var path = require('path'), http = require('http'), fs = require('fs');
var ROOT = path.join(__dirname, '..', '..'), FIXD = path.join(__dirname, 'fixtures', 'odoo_export_2026-11-09');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.css': 'text/css', '.svg': 'image/svg+xml' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var judged = 0, fails = 0, J = JSON.stringify;
function check(key, ok, rule, info) { judged++; if (!ok) fails++; console.log('  §OFL-CHECK key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + J(info))); return ok; }
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
    for (var id of ['org.idempiere.ninja.migrate', 'org.kernel.odoo.migrate']) {
      var has = await pg.$('[data-oc-start="' + id + '"]'); if (has) { await pg.click('[data-oc-start="' + id + '"]'); await sleep(2500); }
    }
    var st = await pg.evaluate(function () { var R = window.PluginEngine && window.PluginEngine._reg && window.PluginEngine._reg(); var o = {};
      ['org.idempiere.ninja.migrate', 'org.kernel.odoo.migrate'].forEach(function (id) { var b = R && R.list().filter(function (x) { return x.id === id; })[0]; o[id] = b ? b.state : 'NOT-INSTALLED'; }); return o; });
    console.log('§OFL plugins ' + J(st));
    check('plugins', st['org.idempiere.ninja.migrate'] === 'ACTIVE' && st['org.kernel.odoo.migrate'] === 'ACTIVE', 'both bundles start on the page (installed stopped by plugin_overlay INSTALL_ONLY)', st);
    var inst = await pg.evaluate(async function () { var b = window.Genesis.birthTenant({ clientName: 'Odoo Live Co', currencyId: 100, currencyIso: 'USD', currencyPrecision: 2, adminUser: 'liveAdmin', dateAcct: '2026-11-09', countryId: 100 });
      var r = await window.idmpInstallGenesis(b); var role = window.__idmpDb.exec("SELECT ad_role_id FROM ad_role WHERE ad_client_id=" + r.clientId + " AND name LIKE '%Admin'"); return { r: r, role: role.length ? role[0].values[0][0] : null }; });
    console.log('§OFL tenant ' + J(inst));
    check('tenant', inst.r && inst.r.ok && inst.r.persisted, 'a tenant is born and installed on the page (persisted)', inst);
    await pg.close();
    // 2 — reload, log in as the new tenant's admin, open the menu leaf
    pg = await open();
    await login('Odoo Live Co', 'liveAdmin', inst.role);
    var leaf = await pg.evaluate(function () { var lf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="9542001"]'); if (!lf) return false; var n = lf.parentElement; while (n && n.id !== 'idmp-tree') { if (n.style) n.style.display = ''; n = n.parentElement; } lf.click(); return true; });
    check('menu', leaf, 'the new tenant admin sees the menu leaf "Migrate from Odoo" (9542001) and it opens', leaf, null);
    var shown = await pg.waitForSelector('[data-gform="org.kernel.odoo.MigrateFromOdoo"] [data-gform-param="Files"]', { timeout: 20000 }).then(function () { return true; }, function () { return false; });
    check('restored', logs.some(function (l) { return /§ODOO-FORM descriptor registered/.test(l); }) && logs.filter(function (l) { return /§PLUGIN-BOOT restored=/.test(l); }).length > 0, 'after the reload the started bundles are restored and the form descriptor registered', logs.filter(function (l) { return /§PLUGIN-BOOT/.test(l); }));
    check('form', shown, 'the generic renderer draws the form with a FILE parameter (G-a)', shown, null);
    // 3 — pick the two files (G-a), see the units as text cells (G-b) and the locked parents (G-c)
    await pg.setInputFiles('[data-gform-param="Files"]', [path.join(FIXD, 'odoo_migration.xlsx'), path.join(FIXD, 'manifest.json')]);
    await pg.waitForFunction(function () { return document.querySelectorAll('[data-gform-row]').length > 10; }, null, { timeout: 60000 }).catch(function () {});
    var g1 = await pg.evaluate(function () { return { rows: document.querySelectorAll('[data-gform-row]').length, text: document.querySelectorAll('[data-gform-cell-type="string"]').length,
      picks: Array.prototype.map.call(document.querySelectorAll('[data-gform-cell="erpunit"]'), function (i) { var dl = i.list; return dl ? Array.prototype.map.call(dl.options, function (o) { return o.value; }) : null; }), locked: document.querySelectorAll('[data-gform-locked] [data-gform-sel]:disabled').length,
      warn: Array.prototype.map.call(document.querySelectorAll('[data-gform-row]'), function (t) { return t.innerText; }).filter(function (t) { return /⚠/.test(t); }) }; });
    console.log('§OFL grid1 ' + J(g1));
    check('files', logs.some(function (l) { return /§AD-FORM-GENERIC file class=org\.kernel\.odoo\.MigrateFromOdoo param=Files files=\["odoo_migration\.xlsx/.test(l); }), 'the picked files are read on the page (G-a: .xlsx through the vendored SheetJS, .json parsed)', logs.filter(function (l) { return /§AD-FORM-GENERIC file/.test(l); }));
    check('units', g1.text === 6 && g1.picks.length === 3 && g1.warn.some(function (w) { return /Answer the unit/.test(w); }), 'the 3 units each have two text cells to answer — the ERP unit (a pick list, G-b) or a new unit code (§KEEP-UNIT-SPEC) — and the form says they must be answered', g1);
    check('picklist', g1.picks.length === 3 && g1.picks.every(function (p) { return p && ['Each', 'Day', 'Hour'].every(function (n) { return p.indexOf(n) >= 0; }); }), '§HARDEN-SPEC H7 / G-e: each unit cell is wired to a pick list of the tenant\'s units (input.list = a datalist holding Each, Day, Hour …)', { picks: (g1.picks || []).map(function (p) { return p && p.length; }) });
    check('locks', g1.locked >= 5, 'parents a ticked sheet needs are drawn locked (G-c)', g1);
    // 4 — answer the units, Refresh (G-d: the typed answers survive the recompute) -> the summary predicts
    await pg.evaluate(function () { var A = { 'Unit: Units': 'Each', 'Unit: Days': 'Day', 'Unit: Hours': 'Hour' };
      document.querySelectorAll('[data-gform-row]').forEach(function (tr) { var it = tr.children[1] && tr.children[1].innerText.trim(); var inp = tr.querySelector('[data-gform-cell="erpunit"]'); if (inp && A[it]) inp.value = A[it]; }); });
    var mark = logs.length;
    await pg.click('[data-gform="org.kernel.odoo.MigrateFromOdoo"] [data-gform-refresh]');
    await pg.waitForFunction(function () { return !Array.prototype.some.call(document.querySelectorAll('[data-gform-row]'), function (t) { return /⚠/.test(t.innerText); }); }, null, { timeout: 90000 }).catch(function () {});
    var sum = logs.slice(mark).filter(function (l) { return /§ODOO-FORM summary/.test(l); }).pop() || '';
    console.log('§OFL summary-line ' + sum.slice(0, 500));
    var kept = await pg.evaluate(function () { return Array.prototype.map.call(document.querySelectorAll('[data-gform-cell="erpunit"]'), function (i) { return i.value; }); });
    check('refresh', /§ODOO-FORM summary ok=true/.test(sum) && J(kept.slice().sort()) === J(['Day', 'Each', 'Hour']), 'Refresh carries the typed units into the recompute (G-d) and the dry run predicts (ok=true)', { sum: sum.slice(0, 200), kept: kept });
    var before = await pg.evaluate(function (cid) { return new Promise(function (res) { window.__crud.modelRun({ table: 'c_bpartner', timing: 'PROCESS', fn: function (trx) { var o = {};   // the TIP: the bundle + this session's committed op groups
      ['c_bpartner', 'm_product', 'm_inventoryline', 'c_elementvalue'].forEach(function (t) { o[t] = trx.q('SELECT count(*) AS n FROM ' + t + ' WHERE ad_client_id=?', [cid])[0].n; }); res(o); return { ok: true }; } }, function () {}); }); }, inst.r.clientId);
    // 5 — Process -> one signed group committed
    mark = logs.length;
    await pg.click('[data-gform="org.kernel.odoo.MigrateFromOdoo"] [data-gform-run]');
    await pg.waitForFunction(function () { var m = document.querySelector('[data-gform-msg]'); return m && /Migrated from Odoo|Not migrated|refused|Failed/i.test(m.innerText); }, null, { timeout: 120000 }).catch(function () {});
    await sleep(1500);
    var msg = await pg.evaluate(function () { var m = document.querySelector('[data-gform-msg]'); return m ? m.innerText : ''; });
    var commit = logs.slice(mark).filter(function (l) { return /§AD-FORM-GENERIC commit class=org\.kernel\.odoo/.test(l); }).pop() || '';
    console.log('§OFL process msg=' + J(msg.slice(0, 300)) + ' ' + commit);
    var after = await pg.evaluate(function (cid) { return new Promise(function (res) { window.__crud.modelRun({ table: 'c_bpartner', timing: 'PROCESS', fn: function (trx) { var o = {};   // the TIP: the bundle + this session's committed op groups
      ['c_bpartner', 'm_product', 'm_inventoryline', 'c_elementvalue'].forEach(function (t) { o[t] = trx.q('SELECT count(*) AS n FROM ' + t + ' WHERE ad_client_id=?', [cid])[0].n; }); res(o); return { ok: true }; } }, function () {}); }); }, inst.r.clientId);
    console.log('§OFL counts before=' + J(before) + ' after=' + J(after));
    check('process', /Migrated from Odoo/.test(msg) && /committed=true/.test(commit) && /verifyChain=ok/.test(commit), 'Process commits ONE signed group (verifyChain ok) and the form says what it migrated', { msg: msg, commit: commit });
    check('grew', after.c_bpartner - before.c_bpartner === 7 && after.m_product - before.m_product === 48 && after.m_inventoryline - before.m_inventoryline === 26 && after.c_elementvalue - before.c_elementvalue === 47,
      'the tenant grew by the summary\'s prediction on the page too (7 partners, 48 products, 26 stock lines, 47 accounts)', { before: before, after: after });
    var real = errs.filter(function (e) { return !/ResizeObserver/.test(e); });
    check('errors', real.length === 0, 'no page errors', real.slice(0, 3));
  } catch (e) { check('crash', false, 'the run completed', e && (e.stack || e.message)); }
  logs.filter(function (l) { return /§AD-FORM|§ODOO-FORM|§NINJA-PLUGIN|§PLUGIN|form/i.test(l) && !/§AD-FORM-GENERIC rows/.test(l); }).slice(-25).forEach(function (l) { console.log('   page-log: ' + l.slice(0, 300)); });
  logs.filter(function (l) { return /§NINJA-ERR/.test(l); }).slice(0, 12).forEach(function (l) { console.log('   page: ' + l); });
  await browser.close(); server.close();
  console.log('§OFL-VERDICT ' + (!judged ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS') + ' judged=' + judged + ' failed=' + fails);
  process.exit(!judged ? 3 : fails ? 1 : 0);
})();
