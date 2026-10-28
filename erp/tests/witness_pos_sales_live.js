#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-POS-SALES-LIVE (bim-compiler prompts/TEAMWORK_FRAMEWORK.md §41.1 row G "Open: Node only", §42 film evidence gap 4; CARDINAL RULE: the page runs the same legacy ports as W-POS-SALES, nothing is staged by host code). READ THE LOG after every run:
//   every verdict is a §POSL line, the exit code is not the evidence. A mutant that CRASHES is NOT a kill. INCONCLUSIVE when nothing was judged.
// THE ISSUE: W-POS-SALES (Node, 43/0) proved the plugin's dictionary, view and process in a Node boot. Nothing proved them in the REAL page: that the System Administrator can enable the INSTALL_ONLY bundle from Plugins & Releases, that CREATE VIEW goes through
//   the host's writable db, that the menu leaves under Data Import (163) render for the head-office clerk and for no till role, that the window opens and SHOWS the tickets the till deposited, that the process dialog runs with its 4 parameters, and that one
//   ticket becomes ONE order, ONE invoice, TWO receipts allocated, open 0, while a mismatched ticket stays whole. The film may only show what this witness proves.
// SPEC (one plain GardenWorld page, no team pipe; every business step is a click on the page's own menu / dialog; the till's deposit uses the ERP write path (applyOp) only, like W-HQ-CLERK H1; expectations come from the DICTIONARY and independent SQL):
//   POSL0 PRECONDITION  fresh browser profile: the bundle org.kernel.pos-integration is INSTALLED and not ACTIVE; no view i_possales; 0 dictionary rows in the plugin's id band 9538001-9538999.
//   POSL1 ENABLE        logged in as System Administrator (client System, role 0), Plugins & Releases (the page's own OSGi console) lists the bundle "Installed" with Start enabled; one click on Start: the registry says ACTIVE, §POSS-PLUGIN start is logged, i_possales is a VIEW in
//                       sqlite_master (CREATE VIEW went through the host's writable db), AD_Table IsView=Y, the band holds > 40 dictionary rows, 0 page errors.
//   POSL2 MENU X of N   for every loginable role of the dictionary (0, 1000000, 102, 103, 200001, 50004 = N=6, from AD_Role x AD_User_Roles) and both entries (window 9538001, process 9538002): the leaf is in the menu tree iff the dictionary says so (AD_Menu active +
//                       AD_TreeNodeMM tree 10 + AD_Window_Access / AD_Process_Access for that role): X of 12. Non-vacuous: the sweep must find the leaves for roles {0, 102} and for NO other role; both leaves hang under Data Import (163).
//   POSL3 WINDOW        as the clerk (102) after the till deposited K1 (3 order lines + cash 200 + card 178) and K2 (2 lines 115 + cash 100): the menu leaf opens the "Import POS Sale" window (toolbar present, grid headers = the displayed AD_Field names, X of N), and the grid SHOWS
//                       K1 (Lines 3, Tenders 2, Difference 0) and K2 (Lines 2, Tenders 1, Difference -15) - the rows exist only in the session's op-log, so a view window that reads the bare bundle shows none (the defect this arm was written to expose).
//   POSL4 DIALOG        the process leaf opens the dialog with exactly the 4 AD_Process_Para rows (order, mandatory flag), C_BankAccount_ID mandatory; running it WITHOUT the bank account is refused by the page (mandatory gate), not by the port.
//   POSL5 ONE TICKET    Run with DocumentNo = K1 and bank 100: result "OK #1/0"; ONE C_Order CO with 3 lines, ONE C_Invoice CO with GrandTotal = 378 (independent oracle over the lines) IsPaid=Y, TWO C_Payment CO (200 + 178) both carrying that C_Invoice_ID, two allocation
//                       lines on that invoice summing to 378 so open = 0 (independent oracle), the card receipt carries R_PnRef/R_AuthCode of the terminal's approval and the cash one none; the I_ rows read Y. K2 is untouched (scoped run): rows N, no order.
//   POSL6 BATCH         a second run without the ticket number: K2 (tenders 100 against lines 115) is left WHOLE - I_IsImported=E with I_ErrorMsg naming both totals, no order, no invoice, no receipt, no allocation made for it - and K1 is not touched again (counts unchanged).
//   POSL7 TILL ROLE     in a second page on the same profile the bundle is restored ACTIVE at boot (persisted); a deep link ?process=9538001 as role 103 logs DENIED and opens no dialog; the same link as role 102 (positive control) opens the dialog.
//   POSL8 0 page errors on every page of the run.
// Every check names the issue it proves. MUTANTS (POSL_MUTANTS=1): the page served with one rule broken, each must turn >= 1 named arm red (a crashed child is NOT a kill): access leaks to role 103 (POSL2), CREATE VIEW skipped (POSL1), the process menu leaf dropped (POSL2),
//   the ticket-number scope ignored (POSL5), the view window reads the bare bundle (POSL3 - the host fix reverted).
// Run: node erp/tests/witness_pos_sales_live.js 2>&1 | tee /tmp/witness_pos_sales_live.log        (POSL_NO_MUT=1 skips the mutants; POSL_ONLY_ARMS=1 is the mutant child mode)
// FILM EVIDENCE: prints §FILM_EVT lines (film6/FILM_EVT.md §3) for the clerk's Import POS Sales run, only after the arm that proves it is green.
'use strict';
var path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
var ROOT = path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.css': 'text/css' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var fails = 0, judged = 0, errors = 0, ARMS = {}, QUIET = !!process.env.POSL_ONLY_ARMS, MUT = process.env.POSL_MUT ? JSON.parse(process.env.POSL_MUT) : null, SEQ = 0, EVT = [];
function verdict(arm, ok, label, detail) { judged++; ARMS[arm] = ARMS[arm] || 0; if (!ok) { fails++; ARMS[arm]++; } if (!QUIET) console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + arm + ' ' + label + (detail ? ' — ' + detail : '')); return ok; }
function say(s) { if (!QUIET) console.log(s); }
function evt(o) { if (QUIET || MUT) return; var line = '§FILM_EVT ' + Object.entries(Object.assign({ seq: ++SEQ, ts: Date.now() }, o)).map(function (kv) { return kv[0] + '=' + (/[\s"]/.test(String(kv[1])) ? JSON.stringify(String(kv[1])) : kv[1]); }).join(' '); EVT.push(line); console.log(line); }
var J = JSON.stringify, num = function (x) { return x == null ? null : Number(x); }, cents = function (x) { return Math.round(Number(x) * 100); };
var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
var PID = 9538001, WIN_LEAF = 9538001, PROC_LEAF = 9538002, BAND_LO = 9538000, BAND_HI = 9538999, BUNDLE = 'org.kernel.pos-integration', CLERK_ROLES = [0, 102];
var D1 = '2026-10-28 00:00:00', K1 = 'POS1/2026-10-28/0101', K2 = 'POS1/2026-10-28/0102';

(async function () {
  say('═══ W-POS-SALES-LIVE — Import POS Sales on the real page: enable, menu, window, dialog, one ticket (§41.1 row G open item) ═══' + (MUT ? '  MUTANT=' + J(MUT).slice(0, 120) : '') + '\n');
  var cur = { over: {} };
  var server = http.createServer(function (req, res) {
    var u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
    if (cur.over[p]) { res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(cur.over[p]); return; }
    var f = path.join(ROOT, p === '/' ? '/erp/idempiere.html' : p);
    if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  if (MUT) { var orig = fs.readFileSync(path.join(ROOT, MUT.file), 'utf8'); if (orig.split(MUT.from).length !== 2) { console.log('§POSL_CRASH MUTATION DID NOT APPLY (anchor not found exactly once) ' + MUT.file); process.exit(2); } cur.over[MUT.file] = orig.replace(MUT.from, function () { return MUT.to; }); }
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + server.address().port;
  var browser = await reqPw().chromium.launch({ args: ['--disable-gpu'] });
  var ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  async function finishRun() { var red = Object.keys(ARMS).filter(function (k) { return ARMS[k]; }); console.log('§POSL_ARMS red=' + (red.length ? red.join(',') : 'none') + ' judged=' + judged); await browser.close(); server.close(); return red; }

  async function openPage(query) {
    var pg = await ctx.newPage(), logs = [], errs = [];
    pg.on('console', function (m) { logs.push(m.text()); }); pg.on('pageerror', function (e) { errs.push(e.message); errors++; });
    await pg.goto(base + '/erp/idempiere.html?lang=en_US' + (query || ''), { waitUntil: 'load' });
    await pg.waitForFunction(function () { return !!window.__idmpDb && document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0; }, null, { timeout: 120000 });
    await sleep(2500);                                                                                       // the built-in bundles install after boot (plugin_overlay _builtins)
    return { pg: pg, logs: logs, errs: errs };
  }
  var P = await openPage('');
  var pg = P.pg, logs = P.logs;
  var db = function (sql) { return pg.evaluate(function (q) { var r = window.__idmpDb.exec(q); if (!r.length) return []; var cols = r[0].columns; return r[0].values.map(function (v) { var o = {}; cols.forEach(function (c, i) { o[c.toLowerCase()] = v[i]; }); return o; }); }, sql); };
  var rows = function (sql) { return pg.evaluate(function (q) { return new Promise(function (res) { window.__crud.modelRun({ table: 'c_order', timing: 'PROCESS', fn: function (trx) { res(trx.q(q)); return { ok: true }; } }, function () {}); }); }, sql); };   // the tip: bundle + this session's committed ops
  var count = function (re) { return logs.filter(function (l) { return re.test(l); }).length; };
  var bundleState = function () { return pg.evaluate(function (id) { var r = window.PluginEngine && window.PluginEngine._reg(); var b = r && r.list().filter(function (x) { return x.id === id; })[0]; return b ? b.state : null; }, BUNDLE); };
  var bandRows = function () { var t = { ad_table: 'ad_table_id', ad_column: 'ad_column_id', ad_window: 'ad_window_id', ad_tab: 'ad_tab_id', ad_field: 'ad_field_id', ad_menu: 'ad_menu_id', ad_process: 'ad_process_id', ad_process_para: 'ad_process_para_id' }, parts = Object.keys(t).map(function (tb) { return '(SELECT count(*) FROM ' + tb + ' WHERE ' + t[tb] + ' BETWEEN ' + BAND_LO + ' AND ' + BAND_HI + ')'; });
    return db('SELECT ' + parts.join('+') + ' AS n').then(function (r) { return Number(r[0].n); }); };
  var viewKind = function () { return db("SELECT type FROM sqlite_master WHERE name='i_possales'").then(function (r) { return r.length ? r[0].type : null; }); };
  var leaf = function (id) { return pg.evaluate(function (id) { return !!document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); }, id); };
  var clickLeaf = function (id) { return pg.evaluate(function (id) { var lf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); if (!lf) return false; var n = lf.parentElement; while (n && n.id !== 'idmp-tree') { if (n.classList && n.classList.contains('idmp-node')) n.classList.add('open'); n = n.parentElement; } lf.click(); return true; }, id); };
  var leafUnder = function (id, parent) { return pg.evaluate(function (a) { var lf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + a.id + '"]'); var n = lf && lf.parentElement; while (n && n.id !== 'idmp-tree') { var h = n.classList && n.classList.contains('idmp-node') && n.querySelector(':scope > .idmp-row'); if (h && h.getAttribute('data-menu-id') === String(a.p)) return true; n = n.parentElement; } return false; }, { id: id, p: parent }); };
  async function switchTo(client, user, role) {
    await pg.click('#idmp-switch-btn'); await sleep(600);
    if (await pg.isVisible('#idmp-login-clients')) await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('" + client + "'))");
    await pg.waitForSelector('#idmp-login-users .idmp-login-user', { timeout: 15000 });
    await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('" + user + "'))"); await pg.waitForSelector('#idmp-login-step2:visible');
    await pg.selectOption('#idmp-login-role', String(role)); await pg.click('#idmp-login-ok');
    await pg.waitForFunction(function () { return document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0; }, null, { timeout: 60000 }); await sleep(1500);
    return pg.evaluate(function () { return window.APP.roleId; });
  }
  async function firstLogin(client, user) {
    await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('" + client + "'))"); await pg.waitForSelector('#idmp-login-step1:visible');
    await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('" + user + "'))"); await pg.waitForSelector('#idmp-login-step2:visible');
    await pg.click('#idmp-login-ok');
    await pg.waitForFunction(function () { return document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0; }, null, { timeout: 60000 }); await sleep(1200);
    return pg.evaluate(function () { return window.APP.roleId; });
  }
  var create = function (table, fields) { return pg.evaluate(function (a) { return new Promise(function (res) { var once = function (e) { if (e.detail && String(e.detail.table).toLowerCase() === a.t) { window.removeEventListener('overlay:committed', once); res(e.detail.createdId); } }; window.addEventListener('overlay:committed', once); window.__crud.applyOp({ op_type: 'CRUD_CREATE', key: a.t, table: a.t, verb: 'create', fields: a.f }); setTimeout(function () { res(null); }, 8000); }); }, { t: table, f: fields }); };
  var line = function (key, prod, qty, price) { return { ad_client_id: 11, ad_org_id: 11, i_isimported: 'N', issotrx: 'Y', documentno: key, doctypename: 'POS Order', m_product_id: prod, qtyordered: qty, priceactual: price, c_uom_id: 100, dateordered: D1 }; };
  var tender = function (key, type, amt, extra) { return Object.assign({ ad_client_id: 11, ad_org_id: 11, i_isimported: 'N', documentno: key, doctypename: 'AR Receipt', iso_code: 'USD', payamt: amt, tendertype: type, datetrx: D1 }, extra || {}); };
  var proc = {                                                                                              // the process pane of a menu-launched process lives in #idmp-content
    params: function () { return pg.$$eval('#idmp-content [data-proc-param]', function (els) { return els.map(function (e) { var f = e.closest('.fld'); return { col: e.getAttribute('data-proc-param'), mand: !!(f && f.classList.contains('mand')), val: e.value, tag: e.tagName }; }); }); },
    text: function () { return pg.evaluate(function () { return (document.querySelector('#idmp-content') || { innerText: '' }).innerText.replace(/\s+/g, ' ').slice(0, 600); }); },
    set: async function (col, v) { var s = '#idmp-content [data-proc-param="' + col + '"]', tag = await pg.$eval(s, function (e) { return e.tagName; }); if (tag === 'SELECT') await pg.selectOption(s, String(v)); else await pg.fill(s, String(v)); await sleep(250); },
    run: async function (refusal) { var n0 = logs.length; await pg.click('#idmp-content [data-proc-run]');
      if (refusal) { await sleep(2000); return proc.text(); }                                                         // a refused run prints its error in place; there is no "OK" to wait for
      await pg.waitForFunction(function () { return /OK #\d+\/\d+|Failed/.test((document.querySelector('#idmp-content') || {}).innerText || ''); }, null, { timeout: 90000 }).catch(function () {});   // NOT the stale "mandatory" text of an earlier refusal
      var t0 = Date.now(), tl = null; while (Date.now() - t0 < 90000 && !logs.slice(n0).some(function (l) { return /^§PROC-COMMIT proc=9538001 .*committed=/.test(l); })) { if (tl == null && logs.slice(n0).some(function (l) { return /^§AD-PROC-LIVE proc=9538001 /.test(l); })) tl = Date.now(); if (tl != null && Date.now() - tl > 30000) break; await sleep(400); }      // a run with nothing to write commits nothing: give the commit 30 s after the process answered, then go on      // the dialog answers before the op group is signed and committed: wait for the shipped §PROC-COMMIT line
      await sleep(600); return proc.text(); },
    open: async function () { var ok = await clickLeaf(PROC_LEAF); var shown = await pg.waitForSelector('#idmp-content [data-proc-run]', { timeout: 20000 }).then(function () { return true; }, function () { return false; }); await sleep(600); return ok && shown; }
  };

  // ───────────────── POSL0 precondition ─────────────────
  say('§S0 fresh profile, nothing enabled');
  var st0 = await bundleState(), v0 = await viewKind(), b0 = await bandRows();
  verdict('POSL0', st0 === 'INSTALLED' && v0 === null && b0 === 0, 'fresh profile: bundle ' + BUNDLE + ' is ' + st0 + ' (INSTALLED, not ACTIVE), no view i_possales, ' + b0 + ' dictionary rows in the band', J({ st0: st0, v0: v0, b0: b0 }));

  // ───────────────── POSL1 the System Administrator enables it ─────────────────
  say('§S1 System Administrator (client System, role 0) -> Plugins & Releases -> Start');
  var role0 = await firstLogin('System', 'System');
  var leafBefore = await leaf(PROC_LEAF);
  await pg.evaluate(function () { window.PluginRelease.open(); }); await pg.waitForSelector('#pr-osgi table.oc-t', { timeout: 10000 }); await sleep(600);
  var rowBefore = await pg.evaluate(function () { var tr = Array.prototype.filter.call(document.querySelectorAll('#pr-osgi tbody tr'), function (t) { return /POS integration/.test(t.innerText); })[0]; if (!tr) return null; var st = tr.querySelector('.oc-st'), a = tr.querySelector('[data-oc-start]'); return { status: st && st.textContent.trim(), startEnabled: !!a && !/\boff\b/.test(a.className) }; });
  var n1 = logs.length;
  if (rowBefore) { await pg.click('[data-oc-start="' + BUNDLE + '"]'); await sleep(3000); }
  var rowAfter = await pg.evaluate(function () { var tr = Array.prototype.filter.call(document.querySelectorAll('#pr-osgi tbody tr'), function (t) { return /POS integration/.test(t.innerText); })[0]; var st = tr && tr.querySelector('.oc-st'); return st && st.textContent.trim(); });
  var stA = await bundleState(), vA = await viewKind(), bA = await bandRows(), tv = await db("SELECT isview FROM ad_table WHERE ad_table_id=9538001");
  var started = logs.slice(n1).some(function (l) { return /§POSS-PLUGIN start view=i_possales/.test(l); });
  verdict('POSL1', role0 === 0 && rowBefore && /Installed/i.test(rowBefore.status) && rowBefore.startEnabled && !leafBefore, 'as System Administrator (APP.roleId=' + role0 + ') the console lists the bundle ' + J(rowBefore) + ' and the menu has no POS leaf yet', J({ role0: role0, rowBefore: rowBefore, leafBefore: leafBefore }));
  verdict('POSL1', stA === 'ACTIVE' && /Active/i.test(String(rowAfter)) && started && vA === 'view' && tv.length === 1 && tv[0].isview === 'Y' && bA > 40, 'one click on Start: registry ' + stA + ', console row "' + rowAfter + '", §POSS-PLUGIN start logged, i_possales is a ' + vA + ' in sqlite_master (CREATE VIEW through the host writable db), AD_Table IsView=Y, ' + bA + ' band rows', J({ stA: stA, rowAfter: rowAfter, started: started, vA: vA, bA: bA }));
  await pg.evaluate(function () { window.PluginRelease.close(); });

  // ───────────────── POSL2 menu X of N over the dictionary's roles ─────────────────
  say('§S2 menu sweep: 6 roles x 2 entries (dictionary vs the page)');
  var roleSet = (await db("SELECT DISTINCT r.ad_role_id AS id, u.name AS user, c.name AS client FROM ad_user_roles ur JOIN ad_user u ON u.ad_user_id=ur.ad_user_id AND u.isactive='Y' JOIN ad_role r ON r.ad_role_id=ur.ad_role_id AND r.isactive='Y' JOIN ad_client c ON c.ad_client_id=r.ad_client_id WHERE ur.isactive='Y' AND r.ad_client_id IN (0,11) AND u.name IN ('System','GardenAdmin','WebService') ORDER BY 1")).map(function (r) { return { id: Number(r.id), user: r.user, client: r.client }; });
  var seen = {}; roleSet = roleSet.filter(function (r) { if (seen[r.id]) return false; seen[r.id] = 1; return true; });
  var expectLeaf = async function (roleId, kind, id) { var q = kind === 'W'
    ? "SELECT (SELECT count(*) FROM ad_menu m JOIN ad_treenodemm n ON n.node_id=m.ad_menu_id AND n.ad_tree_id=10 AND n.parent_id=163 WHERE m.ad_menu_id=" + WIN_LEAF + " AND m.isactive='Y' AND m.action='W') AS menu, (SELECT count(*) FROM ad_window_access a WHERE a.ad_window_id=" + id + " AND a.ad_role_id=" + roleId + " AND a.isactive='Y') AS acc"
    : "SELECT (SELECT count(*) FROM ad_menu m JOIN ad_treenodemm n ON n.node_id=m.ad_menu_id AND n.ad_tree_id=10 AND n.parent_id=163 WHERE m.ad_menu_id=" + PROC_LEAF + " AND m.isactive='Y' AND m.action='P') AS menu, (SELECT count(*) FROM ad_process_access a WHERE a.ad_process_id=" + id + " AND a.ad_role_id=" + roleId + " AND a.isactive='Y') AS acc";
    var r = (await db(q))[0]; return Number(r.menu) > 0 && Number(r.acc) > 0; };
  var sweep = [], okN = 0, totN = 0, shownRoles = [];
  for (var si = 0; si < roleSet.length; si++) {
    var rs = roleSet[si], got = await switchTo(rs.client, rs.user, rs.id);                                                         // every role is a fresh login: the menu tree is built at login, so role 0 is re-entered AFTER the bundle started
    var gw = await leaf(WIN_LEAF), gp = await leaf(PROC_LEAF), ew = await expectLeaf(rs.id, 'W', WIN_LEAF), ep = await expectLeaf(rs.id, 'P', PID);
    totN += 2; okN += (gw === ew ? 1 : 0) + (gp === ep ? 1 : 0); if (gw || gp) shownRoles.push(rs.id);
    var under = (gw && await leafUnder(WIN_LEAF, 163)) || !gw, under2 = (gp && await leafUnder(PROC_LEAF, 163)) || !gp;
    sweep.push({ role: rs.id, as: rs.user, active: Number(got), win: [ew, gw], proc: [ep, gp], under163: under && under2 });
  }
  verdict('POSL2', roleSet.length === 6 && okN === totN && totN === 12 && sweep.every(function (r) { return r.active === r.role && r.under163; }), 'menu leaves match the dictionary for every loginable role: X of N = ' + okN + ' of ' + totN + ' (roles ' + roleSet.map(function (r) { return r.id; }).join('/') + ' x [window leaf, process leaf]); each present leaf hangs under Data Import (163)', J(sweep));
  verdict('POSL2', J(shownRoles.sort(function (a, b) { return a - b; })) === J(CLERK_ROLES), 'non-vacuous: the leaves are in the tree of exactly the roles ' + J(CLERK_ROLES) + ' (clerk 102, System Administrator 0) and of NO till / stock / web-service role', 'shown for ' + J(shownRoles));

  // ───────────────── the clerk session: the till has deposited K1 and K2 ─────────────────
  var roleC = await switchTo('GardenWorld', 'GardenAdmin', 102);
  say('§S3 the till deposits K1 (3 lines + cash 200 + card 178) and K2 (2 lines 115 + cash 100) through the ERP write path; role ' + roleC + ' is the clerk');
  var dep = [];
  [[123, 2, 65], [130, 1, 50], [134, 3, 66]].forEach(function (l) { dep.push(['i_order', line(K1, l[0], l[1], l[2])]); });
  dep.push(['i_payment', tender(K1, 'X', 200)], ['i_payment', tender(K1, 'C', 178, { creditcardtype: 'V', r_pnref: 'PNREF-K1-0001', r_authcode: 'AUTH-K1-0001', r_result: '0', r_respmsg: 'APPROVED', isapproved: 'Y' })]);
  [[123, 1, 65], [130, 1, 50]].forEach(function (l) { dep.push(['i_order', line(K2, l[0], l[1], l[2])]); });
  dep.push(['i_payment', tender(K2, 'X', 100)]);
  var made = []; for (var di = 0; di < dep.length; di++) made.push(await create(dep[di][0], dep[di][1]));
  var ioOra = await rows("SELECT documentno AS k, count(*) AS n, SUM(qtyordered*priceactual) AS t FROM i_order WHERE documentno IN ('" + K1 + "','" + K2 + "') GROUP BY documentno ORDER BY 1");
  var ipOra = await rows("SELECT documentno AS k, count(*) AS n, SUM(payamt) AS t FROM i_payment WHERE documentno IN ('" + K1 + "','" + K2 + "') GROUP BY documentno ORDER BY 1");
  var oraK = {}; ioOra.forEach(function (r) { oraK[r.k] = { lines: Number(r.n), lt: Number(r.t) }; }); ipOra.forEach(function (r) { oraK[r.k].tenders = Number(r.n); oraK[r.k].tt = Number(r.t); });
  say('   independent oracle over the tip: ' + J(oraK) + ' created=' + J(made));
  for (var ei = 0; ei < 3; ei++) evt({ actor: 'till', kind: 'local', queue: 1, text: 'ticket line written', step: 'P0' });
  evt({ actor: 'till', kind: 'local', queue: 2, text: 'tenders written', step: 'P0' });

  // ───────────────── POSL3 the window ─────────────────
  say('§S4 the clerk opens the window from the menu leaf');
  var opened = await clickLeaf(WIN_LEAF);
  await pg.waitForSelector('#idmp-toolbar [data-tb="process"]', { timeout: 30000 }).catch(function () {}); await sleep(2500);
  var tb = await pg.evaluate(function () { return !!document.querySelector('#idmp-toolbar [data-tb="new"]') && getComputedStyle(document.querySelector('#idmp-toolbar')).display !== 'none'; });
  var grid = await pg.evaluate(function () { var t = Array.prototype.filter.call(document.querySelectorAll('#idmp-content table'), function (x) { return /Ticket No/.test(x.innerText); })[0]; if (!t) return null; return { head: Array.prototype.map.call(t.querySelectorAll('thead th'), function (h) { return h.innerText.trim(); }).filter(Boolean), body: Array.prototype.map.call(t.querySelectorAll('tbody tr'), function (r) { return Array.prototype.map.call(r.querySelectorAll('td'), function (c) { return c.innerText.trim(); }); }) }; });
  var dispFields = (await db("SELECT name FROM ad_field WHERE ad_tab_id=9538001 AND isdisplayed='Y' AND isactive='Y' ORDER BY seqnogrid, seqno")).map(function (r) { return r.name; });
  var headOk = grid && dispFields.every(function (n) { return grid.head.some(function (h) { return h === n || h.indexOf(n) === 0; }); });
  var rowsFor = function (k) { return grid ? grid.body.filter(function (r) { return r.some(function (c) { return c === k; }); }) : []; };
  var r1 = rowsFor(K1)[0], r2 = rowsFor(K2)[0], ix = function (n) { return grid ? grid.head.findIndex(function (h) { return h.indexOf(n) === 0; }) : -1; };
  var cell = function (r, n) { return r ? r[ix(n) + (r.length - grid.head.length)] : undefined; };                                              // the grid row has a leading selection cell
  verdict('POSL3', opened && tb && !!grid && headOk && dispFields.length === 13, 'menu leaf ' + WIN_LEAF + ' opens the window: toolbar present, grid headers cover the ' + dispFields.length + ' displayed AD_Field names (X of N = ' + (grid ? dispFields.filter(function (n) { return grid.head.some(function (h) { return h === n || h.indexOf(n) === 0; }); }).length : 0) + ' of ' + dispFields.length + ')', J({ opened: opened, tb: tb, head: grid && grid.head }));
  verdict('POSL3', !!r1 && !!r2 && Number(cell(r1, 'Lines')) === 3 && Number(cell(r1, 'Tenders')) === 2 && cents(String(cell(r1, 'Difference')).replace(/,/g, '')) === 0 && Number(cell(r2, 'Lines')) === 2 && Number(cell(r2, 'Tenders')) === 1 && cents(String(cell(r2, 'Difference')).replace(/,/g, '')) === -1500,
    'the grid SHOWS the till\'s tickets: K1 Lines 3 / Tenders 2 / Difference 0 and K2 Lines 2 / Tenders 1 / Difference -15 (oracle ' + J(oraK) + ')', J({ grid_rows: grid && grid.body.length, r1: r1, r2: r2 }));
  if (r1 && r2) { evt({ actor: 'clerk', kind: 'note', cls: 'n', text: 'sales window: tickets side by side', step: 'P1' }); }

  // ───────────────── POSL4 the dialog ─────────────────
  say('§S5 the clerk opens the process from the menu leaf');
  var dlgOpen = await proc.open();
  verdict('POSL4', dlgOpen, 'the process menu leaf ' + PROC_LEAF + ' opens the dialog', 'opened=' + dlgOpen);
  PROCARMS: {
  if (!dlgOpen) break PROCARMS;                                                                                       // nothing to judge without the dialog; POSL4 is already red
  var paras = await proc.params();
  var dictPara = await db("SELECT columnname AS col, ismandatory AS mand FROM ad_process_para WHERE ad_process_id=" + PID + " AND isactive='Y' ORDER BY seqno");
  var paraOk = 0, paraTot = 0; dictPara.forEach(function (d, i) { paraTot += 2; if (paras[i] && paras[i].col === d.col) paraOk++; if (paras[i] && paras[i].mand === (d.mand === 'Y')) paraOk++; });
  verdict('POSL4', dictPara.length === 4 && paras.length === 4 && paraOk === paraTot && paras.filter(function (p) { return p.mand; }).map(function (p) { return p.col; }).join() === 'C_BankAccount_ID', 'the dialog renders exactly the AD_Process_Para rows (order, mandatory flag): X of N = ' + paraOk + ' of ' + paraTot + ' over ' + dictPara.length + ' parameters; only C_BankAccount_ID is mandatory', J(paras.map(function (p) { return p.col + (p.mand ? '*' : ''); })));
  await proc.set('AD_Client_ID', 11); await proc.set('AD_Org_ID', 11); await proc.set('DocumentNo', K1);
  var nMand = logs.length, txtMand = await proc.run(true);
  var ordsBeforeBank = await rows("SELECT count(*) AS n FROM c_order WHERE documentno='" + K1 + "'");
  verdict('POSL4', /Cannot run.*missing mandatory.*C_BankAccount_ID/.test(txtMand) && !/OK #/.test(txtMand) && Number(ordsBeforeBank[0].n) === 0 && !logs.slice(nMand).some(function (l) { return /^§POSS client=/.test(l); }), 'Run WITHOUT the bank account is refused by the page\'s mandatory gate (no port ran, no order made)', txtMand.slice(0, 120));

  // ───────────────── POSL5 one ticket ─────────────────
  say('§S6 Run for ticket K1 (DocumentNo scopes the run), bank 100');
  await proc.set('C_BankAccount_ID', 100);
  var n5 = logs.length, text5 = await proc.run();
  var l5 = logs.slice(n5);
  var ord = await rows("SELECT c_order_id AS id, docstatus AS ds, grandtotal AS gt, (SELECT count(*) FROM c_orderline l WHERE l.c_order_id=o.c_order_id) AS nl FROM c_order o WHERE documentno='" + K1 + "'");
  var inv = ord.length ? await rows("SELECT c_invoice_id AS id, docstatus AS ds, grandtotal AS gt, ispaid AS paid FROM c_invoice WHERE c_order_id=" + ord[0].id) : [];
  var pays = inv.length ? await rows("SELECT c_payment_id AS id, docstatus AS ds, payamt AS a, c_invoice_id AS inv, c_order_id AS ord, r_pnref AS pn, r_authcode AS au, tendertype AS tt FROM c_payment WHERE documentno='" + K1 + "' ORDER BY payamt") : [];
  var al = inv.length ? await rows("SELECT l.c_payment_id AS pay, l.amount AS a, h.docstatus AS ds FROM c_allocationline l JOIN c_allocationhdr h ON h.c_allocationhdr_id=l.c_allocationhdr_id WHERE l.c_invoice_id=" + inv[0].id) : [];
  var openAmt = inv.length ? Math.round((Number(inv[0].gt) - al.filter(function (x) { return x.ds === 'CO' || x.ds === 'CL'; }).reduce(function (s, x) { return s + Number(x.a); }, 0)) * 100) / 100 : null;
  var ioK1 = await rows("SELECT i_isimported AS imp, c_order_id AS o FROM i_order WHERE documentno='" + K1 + "'"), ipK1 = await rows("SELECT i_isimported AS imp, c_payment_id AS p FROM i_payment WHERE documentno='" + K1 + "'");
  var ordK2a = await rows("SELECT count(*) AS n FROM c_order WHERE documentno='" + K2 + "'"), ioK2a = await rows("SELECT i_isimported AS imp FROM i_order WHERE documentno='" + K2 + "'");
  say('   dialog result: ' + text5.slice(0, 160));
  if (process.env.POSL_DEBUG) l5.forEach(function (l) { say('   DBG ' + l.slice(0, 300)); });
  l5.filter(function (l) { return /^§(POSS|IMPORT_ORDER|IMPORT_PAYMENT|AD-PROC-LIVE proc=9538001|PROC-COMMIT)/.test(l); }).forEach(function (l) { say('   ' + l.slice(0, 220)); });
  verdict('POSL5', /OK #1\/0/.test(text5) && ord.length === 1 && ord[0].ds === 'CO' && Number(ord[0].nl) === 3 && cents(ord[0].gt) === cents(oraK[K1].lt) && inv.length === 1 && inv[0].ds === 'CO' && cents(inv[0].gt) === cents(oraK[K1].lt) && inv[0].paid === 'Y',
    'the dialog answers "OK #1/0": ONE C_Order CO with 3 lines (GrandTotal ' + (ord[0] && ord[0].gt) + ' = oracle ' + oraK[K1].lt + '), ONE C_Invoice CO with GrandTotal ' + (inv[0] && inv[0].gt) + ', IsPaid=' + (inv[0] && inv[0].paid), J({ text: text5.slice(0, 80), ord: ord, inv: inv }));
  verdict('POSL5', pays.length === 2 && pays.every(function (p) { return p.ds === 'CO' && inv.length && Number(p.inv) === Number(inv[0].id) && p.ord == null; }) && J(pays.map(function (p) { return cents(p.a); })) === J([17800, 20000]) && al.length === 2 && al.every(function (x) { return x.ds === 'CO'; }) && cents(al.reduce(function (s, x) { return s + Number(x.a); }, 0)) === cents(oraK[K1].tt) && openAmt === 0,
    'TWO receipts CO (178 + 200) each carrying the invoice and NO order, two allocation lines summing to ' + oraK[K1].tt + ' = the tenders, open amount (independent oracle) = ' + openAmt, J({ pays: pays.map(function (p) { return [p.a, p.inv]; }), al: al.map(function (x) { return [x.a, x.ds]; }), open: openAmt }));
  var card = pays.filter(function (p) { return p.tt === 'C'; })[0], cash = pays.filter(function (p) { return p.tt === 'X'; })[0];
  verdict('POSL5', !!card && card.pn === 'PNREF-K1-0001' && card.au === 'AUTH-K1-0001' && !!cash && cash.pn == null && cash.au == null && ioK1.length === 3 && ioK1.every(function (r) { return r.imp === 'Y' && r.o != null; }) && ipK1.length === 2 && ipK1.every(function (r) { return r.imp === 'Y' && r.p != null; }) && /result=IMPORTED/.test(l5.filter(function (l) { return /^§POSS-TICKET /.test(l); }).join('|')),
    'the card receipt carries the terminal\'s approval (R_PnRef, R_AuthCode), the cash one none; the 3 I_Order + 2 I_Payment rows read Y with their document ids; the shipped §POSS-TICKET line says IMPORTED', J({ card: card && [card.pn, card.au], cash: cash && [cash.pn, cash.au], io: ioK1, ip: ipK1 }));
  verdict('POSL5', Number(ordK2a[0].n) === 0 && ioK2a.length === 2 && ioK2a.every(function (r) { return r.imp === 'N'; }), 'ISO: the run was scoped to K1 - K2 is untouched (rows still N, no order made)', J({ orders: ordK2a[0].n, io: ioK2a }));
  if (/OK #1\/0/.test(text5) && ord.length === 1) {
    evt({ actor: 'clerk', kind: 'run', process: 'Import POS Sales', text: 'ticket imported', step: 'P1' });
    evt({ actor: 'clerk', kind: 'note', cls: 'ok', text: 'one order, one invoice, two receipts', step: 'P1' });
  }
  await pg.click('#idmp-content [data-procdlg-ok], #idmp-content [data-proc-close]').catch(function () {});

  // ───────────────── POSL6 batch ─────────────────
  say('§S7 Run again WITHOUT the ticket number: the mismatched K2 stays whole');
  var cnt = async function () { var o = {}; for (var t of ['c_order', 'c_orderline', 'c_invoice', 'c_payment', 'c_allocationhdr', 'm_inout']) o[t] = Number((await rows('SELECT count(*) AS n FROM ' + t))[0].n); return o; };
  var c6a = await cnt();
  await proc.open(); await proc.set('AD_Client_ID', 11); await proc.set('AD_Org_ID', 11); await proc.set('C_BankAccount_ID', 100);
  var n6 = logs.length, text6 = await proc.run(), l6 = logs.slice(n6), c6b = await cnt();
  var ordK2 = await rows("SELECT count(*) AS n FROM c_order WHERE documentno='" + K2 + "'"), ioK2 = await rows("SELECT i_isimported AS imp, i_errormsg AS err FROM i_order WHERE documentno='" + K2 + "'"), ipK2 = await rows("SELECT i_isimported AS imp, c_payment_id AS p FROM i_payment WHERE documentno='" + K2 + "'");
  var payK2 = await rows("SELECT count(*) AS n FROM c_payment WHERE documentno='" + K2 + "'");
  say('   dialog result: ' + text6.slice(0, 160)); l6.filter(function (l) { return /^§POSS/.test(l); }).forEach(function (l) { say('   ' + l.slice(0, 260)); });
  var errTxt = (ioK2[0] && ioK2[0].err) || '';
  verdict('POSL6', /OK #0\/1/.test(text6) && Number(ordK2[0].n) === 0 && Number(payK2[0].n) === 0 && ioK2.length === 2 && ioK2.every(function (r) { return r.imp === 'E' && /115/.test(r.err) && /100/.test(r.err); }) && ipK2.every(function (r) { return r.p == null; }) && J(c6a) === J(c6b),
    'the mismatched K2 is left WHOLE: "OK #0/1", rows E with I_ErrorMsg naming both totals ("' + String(errTxt).slice(0, 110) + '"), no order / receipt for it, and no document of any kind was added anywhere (counts unchanged)', J({ before: c6a, after: c6b, io: ioK2 }));
  if (/OK #0\/1/.test(text6)) evt({ actor: 'clerk', kind: 'refuse', cls: 'bad', text: 'totals differ: ticket left whole, with reason', step: 'P2' });
  // POSL6b a third run: nothing new anywhere (K1 is not replayed; K2 is refused again, whole)
  var c7a = await cnt(), snap7a = J(await rows("SELECT i_isimported AS i, c_order_id AS o FROM i_order WHERE documentno='" + K1 + "' ORDER BY i_order_id"));
  await proc.open(); await proc.set('AD_Client_ID', 11); await proc.set('AD_Org_ID', 11); await proc.set('C_BankAccount_ID', 100);
  var text7 = await proc.run(), c7b = await cnt(), snap7b = J(await rows("SELECT i_isimported AS i, c_order_id AS o FROM i_order WHERE documentno='" + K1 + "' ORDER BY i_order_id"));
  verdict('POSL6', /OK #0\/[01]/.test(text7) && J(c7a) === J(c7b) && snap7a === snap7b && JSON.parse(snap7a).length === 3, 'RERUN: a third run answers "' + (/OK #\d+\/\d+/.exec(text7) || [''])[0] + '" and adds no document of any kind; K1\'s 3 rows are byte-identical (Y is not read again)', J({ c7a: c7a, c7b: c7b }));
  if (/OK #0\/[01]/.test(text7) && J(c7a) === J(c7b)) evt({ actor: 'clerk', kind: 'run', process: 'Import POS Sales', text: 'second run: nothing new', step: 'P3' });

  }   // PROCARMS

  // ───────────────── POSL7 the till role ─────────────────
  say('§S8 a second page on the same profile: the bundle is restored; the till role is refused');
  var P2 = await openPage('&process=' + PID);
  async function deepLink(pgx, logsx, user, role) {
    await pgx.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await pgx.waitForSelector('#idmp-login-step1:visible');
    await pgx.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('" + user + "'))"); await pgx.waitForSelector('#idmp-login-step2:visible');
    await pgx.selectOption('#idmp-login-role', String(role)); await pgx.click('#idmp-login-ok');
    await pgx.waitForFunction(function () { return document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0; }, null, { timeout: 60000 }); await sleep(2500);
    return { denied: logsx.some(function (l) { return /§AD-PROC-LIVE deeplink proc=9538001 DENIED/.test(l); }), dialog: !!(await pgx.$('#idmp-content [data-proc-run]')) };
  }
  var restored = await P2.pg.evaluate(function (id) { var r = window.PluginEngine && window.PluginEngine._reg(); var b = r && r.list().filter(function (x) { return x.id === id; })[0]; return b ? b.state : null; }, BUNDLE);
  var dn = await deepLink(P2.pg, P2.logs, 'GardenAdmin', 103);
  var P3 = await openPage('&process=' + PID), ok102 = await deepLink(P3.pg, P3.logs, 'GardenAdmin', 102);
  verdict('POSL7', restored === 'ACTIVE' && dn.denied && !dn.dialog && ok102.dialog && !ok102.denied, 'second page: bundle restored ' + restored + ' at boot; ?process=' + PID + ' as role 103 logs DENIED and opens no dialog (' + J(dn) + '); the same link as role 102 opens the dialog (' + J(ok102) + ')', J({ restored: restored, dn: dn, ok102: ok102 }));

  verdict('POSL8', errors === 0, '0 page errors on every page of the run', 'errors=' + errors + (errors ? ' ' + P.errs.concat(P2.errs, P3.errs).slice(0, 2).join(' | ') : ''));
  say('§POSL_EVT lines=' + EVT.length);
  var red = await finishRun();
  if (QUIET) process.exit(red.length ? 1 : 0);
  if (red.length) { console.log('§POSL_VERDICT FAIL judged=' + judged + ' fails=' + fails + ' red=' + red.join(',') + ' mutants=NOT RUN (the base run is red) pageerrors=' + errors); process.exit(1); }
  if (judged === 0) { console.log('§POSL_VERDICT INCONCLUSIVE nothing was judged'); process.exit(3); }
  if (process.env.POSL_NO_MUT) { console.log('§POSL_VERDICT PASS judged=' + judged + ' fails=0 mutants=skipped pageerrors=' + errors + ' film_evt=' + EVT.length); process.exit(0); }
  var M = [
    ['access leaks to the till-side role 103 (an extra AD_Process_Access / AD_Window_Access row)', { file: '/erp/plugins/pos_integration.mjs', from: 'ROLES = [[0, 0], [102, 11]]', to: 'ROLES = [[0, 0], [102, 11], [103, 11]]' }, ['POSL2', 'POSL7']],
    ['CREATE VIEW is skipped (the host never makes i_possales)', { file: '/erp/plugins/pos_integration.mjs', from: 'db.run(VIEW_SQL);', to: '/* view skipped */' }, ['POSL1']],
    ['the process menu leaf is not in the tree', { file: '/erp/plugins/pos_integration.mjs', from: 'rows: [node(M_WIN, 25), node(M_PROC, 26)]', to: 'rows: [node(M_WIN, 25)]' }, ['POSL2', 'POSL4']],
    ['the DocumentNo scope is ignored (a scoped run imports every pending ticket)', { file: '/erp/plugins/pos_import_sales.mjs', from: "name === 'DocumentNo'", to: "name === 'DocumentNo_ignored'" }, ['POSL5', 'POSL4']],
    ['the view window reads the bare bundle (the host fix for view tabs reverted)', { file: '/erp/idempiere.html', from: 'ADD.readRecords(_tableIsView(tab.tableName) ? _tipDb() : db, tab.tableName, where, orderBy)', to: 'ADD.readRecords(db, tab.tableName, where, orderBy)' }, ['POSL3']]];
  var cp = require('child_process'), muts = [];
  for (var m of M) {
    var kk = cp.spawnSync(process.execPath, [__filename], { encoding: 'utf8', timeout: 1500000, env: Object.assign({}, process.env, { POSL_ONLY_ARMS: '1', POSL_MUT: JSON.stringify(m[1]) }) });
    var mm = /§POSL_ARMS red=(\S+)/.exec(kk.stdout || '');
    muts.push(mm ? { name: m[0], expect: m[2], red: mm[1] !== 'none' ? mm[1].split(',') : [] } : { name: m[0], error: 'CRASHED (not a kill) ' + String((kk.stdout || '') + (kk.stderr || '')).split('\n').filter(Boolean).slice(-3).join(' ') });
  }
  console.log('\n§POSL_MUTANTS');
  var killed = 0;
  muts.forEach(function (m) { var ok = !m.error && m.expect.some(function (e) { return m.red.indexOf(e) !== -1; }); if (ok) killed++; else fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + m.name + ' -> ' + (m.error || 'red arms: ' + (m.red.join(', ') || 'NONE (survivor)') + ' (expected one of ' + m.expect.join('/') + ')')); });
  console.log('§POSL_VERDICT ' + (fails ? 'FAIL' : 'PASS') + ' judged=' + judged + ' fails=' + fails + ' mutants_killed=' + killed + '/' + muts.length + ' pageerrors=' + errors + ' film_evt=' + EVT.length);
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.log('§POSL_CRASH ' + (e && e.stack || e)); process.exit(2); });
