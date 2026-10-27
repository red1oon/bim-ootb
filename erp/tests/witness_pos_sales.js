#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-POS-SALES (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §9 + §11 + §12.7, prompts/TEAMWORK_FRAMEWORK.md §41 row G; CARDINAL RULE: the twin runs the LEGACY processes, it invents no business rule).
//   READ THE LOG after every run: every verdict is a §POSS line, the exit code is not the evidence. A mutant that CRASHES is NOT a kill: it must print its own FAIL verdict. INCONCLUSIVE when nothing was judged.
// THE ISSUE: a till deposits ONE sale as two legacy row kinds (I_Order lines + I_Payment tenders, same ticket key in DocumentNo). The owner (POS_PLUGIN_LOCAL_FIRST §9): ONE SQL view I_POSSales presents the sale, ONE head-office
//   process "Import POS Sales" unravels it through the LEGACY processes only (Import Orders 206 -> invoice link -> Import Payment 343), ALL-OR-NONE PER TICKET (legacy Import Orders is not: a failure abandons the rest and
//   the earlier orders stay - ImportOrder.java:786-790; Import Payment logs and continues). Everything is DICTIONARY DATA + one process class staged by the ERP-side POS integration PLUGIN (plugins/pos_integration.mjs, System
//   Administrator side, §11): no host code names the view, its window or its process, and Stop removes all of it.
// SPEC (the claims, written before the code; AD ids are the plugin's band 9538001-9538999, process 9538001):
//   PLUG   the bundle (erp/plugins/pos_integration.mjs + its hot chunk pos_import_sales.mjs) installs and starts (ACTIVE) on the registry with ONLY the generic extension points (ctx.dict / ctx.process / ctx.db); it creates the SQL view
//          i_possales (a VIEW in sqlite_master) + AD_Table IsView='Y'; AD_Process classname resolves to a registered port and its AD_Process_Para are exactly the ones the port reads (X of N); EVERY AD_Column of the table is a column of
//          the view and EVERY active AD_Field of its tab is an AD_Column of that table (X of N, AD-layer law: the denominator is the dictionary); access = AD_Process_Access AND AD_Window_Access for roles {0 System
//          Administrator, 102 GardenWorld Admin = the head-office clerk the W-HQ-CLERK witness uses} and NO other role; menu leaves (window + process) under Data Import (163) of tree 10; no host source names i_possales (zero host code); base hash unchanged.
//   VIEW   a 3-line ticket with 2 tenders (cash + card) -> the view shows ONE sale, lines=3, tenders=2, lines total = tenders total (independent SQL oracle over the I_ tables); a mismatched ticket shows its difference; tenders
//          without lines show as a sale with lines=0; a re-sent key shows as a SECOND row (imported vs pending). Non-vacuous: the card-number columns (CreditCardNumber/VV/ExpMM/ExpYY) are EMPTY on every deposited I_Payment row (n>0).
//   SALE   Import POS Sales over ticket K1 -> ONE completed C_Order, ONE completed C_Invoice (GrandTotal = the oracle), TWO completed receipts (cash + card) each allocated to that invoice (C_AllocationLine amounts = the
//          tender amounts), open amount (independent oracle over C_AllocationLine) = 0, invoice IsPaid; the receipts carry C_Invoice_ID and NO C_Order_ID; card columns still empty on the C_Payment; the I_ rows are Y with
//          C_Order_ID / C_Payment_ID; the whole run is ONE op group; the shipped §POSS-TICKET line says IMPORTED.
//   ISO    the DocumentNo parameter scopes the run to ONE ticket: other pending tickets (K2/K3/K4/K6) are untouched - rows still N, no document made for them (unmodified legacy processes read EVERY pending row; the process scopes them).
//   BATCH  one run over the rest: K4 (good) is imported; K2 (tenders total <> invoice total) is left WHOLE: no order, no invoice, no receipt, no allocation, rows E with I_ErrorMsg naming both totals; K3 (the order imports but a
//          tender is refused by Import Payment) is left WHOLE - the order Import Orders made INSIDE the ticket is undone (an order without its payments is never left); K6 (Import Orders refuses a line) keeps legacy's own ERR= text;
//          K5 (tenders without lines) is refused; K7 (K1's key re-sent) makes no second order and no second receipt. Good tickets are not blocked by bad ones (all-or-none per TICKET, not per batch).
//   RERUN  a third run makes NO new document of any kind (counts of c_order/c_orderline/c_invoice/m_inout/c_payment/c_allocationhdr unchanged) and leaves K1/K4's rows byte-identical (I_IsImported=Y is not read again).
//   STOP   Stop removes the view, every dictionary row of the band, the process class and the AD_Process row (running the process id then answers "not found"); the deposited I_ rows stay; the base hash is unchanged; a second
//          Start restores everything (idempotent).
// Every check names the issue it proves; INCONCLUSIVE when nothing was judged. Mutants (POSS_MUTANTS=1): each rewrites the shipped source in a mirror of COPIES, proves the rewrite APPLIED exactly once, and the named check
//   must go FAIL in a child run that prints its verdict (a crash = "not killed").
// Command: node erp/tests/witness_pos_sales.js            (add POSS_MUTANTS=1 for the mutant sweep)
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), crypto = require('crypto'), url = require('url');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = process.env.POSS_ERP || path.join(__dirname, '..');
var MUTANT = process.env.POSS_MUTANT || '';
var SQLJS_DIR = process.env.SQLJS_DIR || '/home/red1/bim-ootb/tests/node_modules/sql.js';
if (!process.env.SQLJS) process.env.SQLJS = SQLJS_DIR;                                      // ws_kernel.js reads it
var initSqlJs = require(SQLJS_DIR);
var _log = console.log, SEEN = [];
console.log = function () { var s = Array.prototype.join.call(arguments, ' '); SEEN.push(s); };     // the shipped § lines are evidence: captured, then re-printed selectively
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 };
function check(cs, key, rule, ok, info) {
  var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 };
  c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §POSS-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + JSON.stringify(info)));
}
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }; var v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§POSS-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed + (MUTANT ? ' mutant=' + MUTANT : '')); return v; }
function J(x) { return JSON.stringify(x); }
function guard(cs, key, rule, fn) { try { fn(); } catch (e) { check(cs, key, rule, false, 'threw: ' + (e && (e.message || e.stack) || String(e))); } }
function sha256(b) { return crypto.createHash('sha256').update(b).digest('hex'); }
var BASE_PIN = 'd35e8a75a3be06295e3a695381998c2bed38027071c27a5adcbd3b81f5ffaa52';       // team base of origin/main 9d092972 (the pin of W-IMPORT-ORDER / W-IMPORT-PAYMENT); a later INTENDED base change must move this pin on purpose
function baseOracle() {
  var buf = fs.readFileSync(path.join(ERP, 'ad_seed.db')), man = 'seed ' + sha256(buf) + ' ' + buf.length + '\n';
  ['ad_seed.db.sql', 'mfg.sql'].forEach(function (nm, i) { var f = path.join(ERP, 'patches', nm); man += '--patch ' + i + (fs.existsSync(f) ? '\n' + fs.readFileSync(f, 'utf8') : ' MISSING') + '\n'; });
  return sha256(Buffer.from(man, 'utf8'));
}
function reqERP(f) { return require(path.join(ERP, f)); }
function read(f) { try { return fs.readFileSync(path.join(ERP, f), 'utf8'); } catch (e) { return ''; } }
function num(x) { return x == null ? null : Number(x); }
function cents(x) { return Math.round(Number(x) * 100); }

var PID = 9538001, BAND_LO = 9538000, BAND_HI = 9538999, BUNDLE_ID = 'org.kernel.pos-integration', CLERK_ROLES = [0, 102];

(async function main() {
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIR, 'dist', f); } });
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  var pOk = 0, pFail = 0;                                                    // the self-heal patch, statement by statement (idempiere.html FS-15 loader)
  fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); pOk++; } catch (e) { pFail++; } });
  function q0(sql, params) {
    var st = db.prepare(sql), out = [];
    try { if (params && params.length) st.bind(params.map(function (v) { return v === undefined ? null : v; })); while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } }
    finally { st.free(); }
    return out;
  }
  var AR = null, AIT = null;
  try { AR = reqERP('ad_rule.js'); } catch (e) { /* named by the arms that need it */ }
  try { AIT = reqERP('ad_import_tables.js'); } catch (e) { /* idem */ }
  say('§POSS-LOAD erp=' + ERP + ' mutant=' + (MUTANT || 'none') + ' seedPatch ok=' + pOk + ' failed=' + pFail);
  if (AIT) AIT.ensure(db);
  if (AR) AR.ensure(db);
  var K = reqERP('ws_kernel.js'), k = K.build(db), ML = k.ML, AP = reqERP('ad_process.js'), PR = reqERP('plugin_registry.js');
  var S = { clientId: 11, orgId: 11, userId: 100, roleId: 102, warehouseId: 103, actor: 'witness:pos-sales' };
  function one(sql, p) { return k.q(sql, p || [])[0] || null; }
  function commit(fn, meta) {                                                // = ws_kernel inTrx: ONE Trx; on ok apply + journal its op group. Mutant children switch automatic accounting off (noPost): posting costs seconds and no claim here depends on it.
    var trx = new ML.Trx(k.q, Object.assign(k.env(S), MUTANT ? { noPost: true } : {})), r;
    try { r = fn(trx, ML) || { ok: true }; } catch (ex) { r = { ok: false, error: 'model threw: ' + (ex && ex.message) }; trx.say('§MODEL-ERR ' + (ex && ex.stack || ex)); }
    var ok = r.ok !== false, ops = ok ? trx.groupOps() : [], ids = []; if (ok && ops.length) ids = k.commit(S, ops, meta);
    return Object.assign({}, r, { ok: ok, ops: ops, ids: ids, log: trx.log, trx: trx });
  }
  function saveAll(rows) { return function (trx) { for (var i = 0; i < rows.length; i++) { var sv = ML.save(trx, rows[i].t, null, ML.newPO(trx, rows[i].t, rows[i].f));
       if (!sv.ok) return { ok: false, error: rows[i].t + ' #' + i + ': ' + sv.error }; } return { ok: true }; }; }

  // ═══ the plugin: installed on the registry exactly as the host does (generic extension points only) ═══
  var hostDb = { query: function (sql, p) { return q0(sql, p); }, run: function (sql, p) { db.run(sql, p || []); } };
  var host = { engineVersion: '1.0.0', db: hostDb, ops: { append: function () { return 1; } }, process: AP, docAction: ML,
    import: function (u) { return import(url.pathToFileURL(path.resolve(path.join(ERP, 'plugins'), u)).href); } };
  var reg = PR.create(host), mod = null, loadErr = null, started = null, startErr = null;
  try { mod = await import(url.pathToFileURL(path.join(ERP, 'plugins', 'pos_integration.mjs')).href); } catch (e) { loadErr = e && e.message; }
  if (mod) { try { await reg.installBundle(mod); started = await reg.startBundle(BUNDLE_ID); } catch (e) { startErr = e && e.message; } }
  function tableExists(t, type) { return q0("SELECT 1 AS x FROM sqlite_master WHERE type=? AND name=?", [type || 'table', t]).length > 0; }
  function bandCount() {                                                    // every dictionary row of the plugin's id band, over the tables it stages
    var n = 0, t = { ad_table: 'ad_table_id', ad_column: 'ad_column_id', ad_window: 'ad_window_id', ad_tab: 'ad_tab_id', ad_field: 'ad_field_id', ad_menu: 'ad_menu_id', ad_treenodemm: 'node_id', ad_process: 'ad_process_id', ad_process_para: 'ad_process_para_id' };
    Object.keys(t).forEach(function (tb) { n += q0('SELECT count(*) AS n FROM ' + tb + ' WHERE ' + t[tb] + ' BETWEEN ? AND ?', [BAND_LO, BAND_HI])[0].n; });
    n += q0('SELECT count(*) AS n FROM ad_process_access WHERE ad_process_id BETWEEN ? AND ?', [BAND_LO, BAND_HI])[0].n + q0('SELECT count(*) AS n FROM ad_window_access WHERE ad_window_id BETWEEN ? AND ?', [BAND_LO, BAND_HI])[0].n;
    return n;
  }
  var CLASSNAME = (q0('SELECT classname FROM ad_process WHERE ad_process_id=?', [PID])[0] || {}).classname || null;

  // ═══ PLUG ═══════════════════════════════════════════════════════════════════════════════════════════
  guard('PLUG', 'bundle-loads', 'erp/plugins/pos_integration.mjs imports and exports manifest + activate + deactivate (the plugin bundle exists)', function () {
    check('PLUG', 'bundle-loads', 'the bundle module loads with manifest.id ' + BUNDLE_ID + ', activate and deactivate', !!mod && mod.manifest && mod.manifest.id === BUNDLE_ID && typeof mod.activate === 'function' && typeof mod.deactivate === 'function', { err: loadErr });
  });
  guard('PLUG', 'starts', 'install + start on the plugin registry ends ACTIVE (every contribution went through ctx.dict / ctx.process / ctx.db)', function () {
    check('PLUG', 'starts', 'startBundle answers state ACTIVE', !!started && started.state === 'ACTIVE', { started: started, err: startErr });
  });
  guard('PLUG', 'view', 'i_possales is a SQL VIEW (sqlite_master type view) and AD_Table says IsView=Y TableName I_POSSales', function () {
    var t = q0("SELECT ad_table_id AS i, isview AS v, tablename AS n, accesslevel AS a FROM ad_table WHERE lower(tablename)='i_possales'")[0];
    check('PLUG', 'view', 'sqlite_master has VIEW i_possales (not a table) and AD_Table 9538001 IsView=Y', tableExists('i_possales', 'view') && !tableExists('i_possales', 'table') && !!t && num(t.i) === 9538001 && t.v === 'Y', { view: tableExists('i_possales', 'view'), t: t });
  });
  guard('PLUG', 'process-row', 'AD_Process 9538001 names a class that resolves to a registered port; AD_Process_Para are exactly what the port reads (X of N)', function () {
    var cls = CLASSNAME, reg_ = !!(cls && AP.JAVA[cls]);
    var names = q0("SELECT columnname AS c FROM ad_process_para WHERE ad_process_id=? AND isactive='Y' ORDER BY seqno", [PID]).map(function (r) { return r.c; });
    var src = read('plugins/pos_import_sales.mjs'), used = (src.match(/name === '([A-Za-z_]+)'/g) || []).map(function (s) { return /'([^']+)'/.exec(s)[1]; });
    var X = names.filter(function (n) { return used.indexOf(n) >= 0; }).length;
    check('PLUG', 'process-row', 'AD_Process.classname ' + cls + ' is registered in AdProcess.JAVA; dictionary parameters ' + J(names) + ' all read by the port (X=' + X + ' of N=' + names.length + '), port reads ' + J(used), reg_ && names.length === 4 && X === 4 && used.length === 4, { cls: cls, reg: reg_, names: names, used: used });
  });
  guard('PLUG', 'dict-x-of-n', 'every AD_Column of I_POSSales is a column of the view, and every active AD_Field of its tab is one of those AD_Columns (X of N from the dictionary)', function () {
    var cols = q0("SELECT lower(columnname) AS c FROM ad_column WHERE ad_table_id=9538001 AND isactive='Y'").map(function (r) { return r.c; }).sort();
    var phys = tableExists('i_possales', 'view') ? q0('PRAGMA table_info(i_possales)').map(function (r) { return String(r.name).toLowerCase(); }).sort() : [];
    var flds = q0("SELECT lower(c.columnname) AS c, c.ad_table_id AS t FROM ad_field f JOIN ad_tab t ON t.ad_tab_id=f.ad_tab_id LEFT JOIN ad_column c ON c.ad_column_id=f.ad_column_id WHERE t.ad_table_id=9538001 AND f.isactive='Y'");
    var Xc = cols.filter(function (c) { return phys.indexOf(c) >= 0; }).length, Xf = flds.filter(function (f) { return f.c && num(f.t) === 9538001 && cols.indexOf(f.c) >= 0; }).length;
    check('PLUG', 'dict-x-of-n', 'AD_Column X of N = ' + Xc + ' of ' + cols.length + ' are view columns and the view has no other (' + phys.length + '); AD_Field X of N = ' + Xf + ' of ' + flds.length + ' resolve to those columns; N>0',
      cols.length > 10 && Xc === cols.length && phys.length === cols.length && J(phys) === J(cols) && flds.length === cols.length && Xf === flds.length, { cols: cols.length, phys: phys.length, onlyDict: cols.filter(function (c) { return phys.indexOf(c) < 0; }), onlyPhys: phys.filter(function (c) { return cols.indexOf(c) < 0; }), fields: flds.length, Xf: Xf });
  });
  guard('PLUG', 'access', 'AD_Process_Access AND AD_Window_Access are active for exactly roles {0 System Administrator, 102 GardenWorld Admin = the head-office clerk} - no other role (the till role carries none of it)', function () {
    var pa = q0("SELECT ad_role_id AS r FROM ad_process_access WHERE ad_process_id=? AND isactive='Y' ORDER BY 1", [PID]).map(function (r) { return num(r.r); });
    var wa = q0("SELECT ad_role_id AS r FROM ad_window_access WHERE ad_window_id=9538001 AND isactive='Y' ORDER BY 1", []).map(function (r) { return num(r.r); });
    check('PLUG', 'access', 'process access roles ' + J(pa) + ' and window access roles ' + J(wa) + ' are both ' + J(CLERK_ROLES), J(pa) === J(CLERK_ROLES) && J(wa) === J(CLERK_ROLES), { pa: pa, wa: wa });
  });
  guard('PLUG', 'menu', 'two active menu leaves (window + process) sit under Data Import (163) in tree 10 - the same dictionary answer W-HQ-CLERK uses for "the clerk reaches it"', function () {
    var w = q0("SELECT m.ad_menu_id AS i FROM ad_menu m JOIN ad_treenodemm n ON n.node_id=m.ad_menu_id AND n.ad_tree_id=10 AND n.parent_id=163 WHERE m.isactive='Y' AND m.action='W' AND m.ad_window_id=9538001");
    var p = q0("SELECT m.ad_menu_id AS i FROM ad_menu m JOIN ad_treenodemm n ON n.node_id=m.ad_menu_id AND n.ad_tree_id=10 AND n.parent_id=163 WHERE m.isactive='Y' AND m.action='P' AND m.ad_process_id=?", [PID]);
    check('PLUG', 'menu', 'one window leaf and one process leaf under 163', w.length === 1 && p.length === 1, { w: w, p: p });
  });
  guard('PLUG', 'zero-host-code', 'no HOST source names i_possales, its window or its process (AD-layer law: no per-window code); the plugin files do (non-vacuous)', function () {
    var host_ = ['idempiere.html', 'ad_ui.js', 'ad_process.js', 'ad_gridtab.js', 'ad_toolbar.js', 'model_layer.js', 'model_order.js', 'model_invoice.js', 'plugin_registry.js', 'plugin_overlay.js', 'osgi_console.js', 'team_sync.js', 'ws_kernel.js', 'sw.js', 'processes/ImportOrder.js', 'processes/ImportPayment.js', 'ad_import_tables.js'];
    var hits = host_.filter(function (f) { return /i_possales|ImportPOSSales|9538001/i.test(read(f)); });
    var inPlug = /i_possales/i.test(read('plugins/pos_integration.mjs')) && /ImportPOSSales/.test(read('plugins/pos_import_sales.mjs'));
    check('PLUG', 'zero-host-code', 'host sources checked: ' + host_.length + ', mentioning the view/process: ' + J(hits) + ' (sw.js / plugin_overlay.js may list the FILE names only, never the table)', inPlug && hits.length === 0, { hits: hits, inPlug: inPlug });
  });
  check('PLUG', 'wiring', 'the host ships the two plugin files (sw.js precache) and installs the bundle STOPPED for the System Administrator to enable (plugin_overlay.js INSTALL_ONLY, like Web Services) - file names only', /'plugins\/pos_integration\.mjs'/.test(read('sw.js')) && /'plugins\/pos_import_sales\.mjs'/.test(read('sw.js')) && /INSTALL_ONLY = \[[^\]]*'plugins\/pos_integration\.mjs'/.test(read('plugin_overlay.js')), { sw: /pos_integration/.test(read('sw.js')), overlay: /pos_integration/.test(read('plugin_overlay.js')) });
  check('PLUG', 'base-hash', 'the team BASE hash (seed + the two hashed patch files) is byte-identical to origin/main: the plugin stages everything at runtime, no hashed file touched', baseOracle() === BASE_PIN, { got: baseOracle(), pin: BASE_PIN });

  // ═══ fixtures: a till deposits tickets (I_Order lines + I_Payment tenders, the SAME ticket key in DocumentNo) ═══
  var D1 = '2026-10-28 00:00:00';
  var KEY = { K1: 'POS1/2026-10-28/0101', K2: 'POS1/2026-10-28/0102', K3: 'POS1/2026-10-28/0103', K4: 'POS1/2026-10-28/0104', K5: 'POS1/2026-10-28/0105', K6: 'POS1/2026-10-28/0106', K8: 'POS1/2026-10-28/0108' };
  function lineRow(key, prod, qty, price, extra) { return { t: 'i_order', f: Object.assign({ i_isimported: 'N', issotrx: 'Y', documentno: key, doctypename: 'POS Order', m_product_id: prod, qtyordered: qty, priceactual: price, c_uom_id: 100, dateordered: D1, ad_org_id: 11 }, extra || {}) }; }
  function tenderRow(key, type, amt, extra) { return { t: 'i_payment', f: Object.assign({ i_isimported: 'N', documentno: key, doctypename: 'AR Receipt', iso_code: 'USD', payamt: amt, tendertype: type, datetrx: D1, ad_org_id: 11 }, extra || {}) }; }
  // K1: 3 lines (Oak Tree 2 x 65, Plum Tree 1 x 50, Patio Table 3 x 66) = 378 ; 2 tenders: cash 200 + card (Visa, terminal approval in the processor-response columns R_PnRef / R_AuthCode / R_Result / R_RespMsg + IsApproved; Orig_TrxID keeps its legacy meaning, the original transaction of a void) 178
  var K1ROWS = [lineRow(KEY.K1, 123, 2, 65), lineRow(KEY.K1, 130, 1, 50), lineRow(KEY.K1, 134, 3, 66), tenderRow(KEY.K1, 'X', 200), tenderRow(KEY.K1, 'C', 178, { creditcardtype: 'V', r_pnref: 'PNREF-K1-0001', r_authcode: 'AUTH-K1-0001', r_result: '0', r_respmsg: 'APPROVED', isapproved: 'Y' })];
  var K2ROWS = [lineRow(KEY.K2, 123, 1, 65), lineRow(KEY.K2, 130, 1, 50), tenderRow(KEY.K2, 'X', 100)];                                    // lines 115, tenders 100: a mismatch
  var K3ROWS = [lineRow(KEY.K3, 130, 1, 50), tenderRow(KEY.K3, 'X', 50, { doctypename: 'No Such Receipt Type' })];                         // totals match; Import Payment refuses the tender AFTER the order was made
  var K4ROWS = [lineRow(KEY.K4, 123, 1, 65), tenderRow(KEY.K4, 'C', 65, { creditcardtype: 'M', r_pnref: 'PNREF-K4-0001', r_authcode: 'AUTH-K4-0001', r_result: '0', r_respmsg: 'APPROVED', isapproved: 'Y' })];            // a good one-line, one-card-tender ticket
  var K5ROWS = [tenderRow(KEY.K5, 'X', 10)];                                                                                                // tenders without any lines
  var K6ROWS = [lineRow(KEY.K6, null, 1, 50, { productvalue: 'NO-SUCH-PRODUCT' }), tenderRow(KEY.K6, 'X', 50)];                          // Import Orders refuses the line (legacy ERR= text)
  var K8ROWS = [lineRow(KEY.K8, 130, 1, 50), tenderRow(KEY.K8, 'X', 60)];                                                                 // OVERPAID: tenders 60 against an invoice of 50 (Import Payment alone would settle the invoice and leave 10 unallocated)
  var K7ROWS = [lineRow(KEY.K1, 123, 2, 65), lineRow(KEY.K1, 130, 1, 50), lineRow(KEY.K1, 134, 3, 66), tenderRow(KEY.K1, 'X', 200), tenderRow(KEY.K1, 'C', 178, { creditcardtype: 'V', r_pnref: 'PNREF-K7-0001', r_authcode: 'AUTH-K7-0001', r_result: '0', r_respmsg: 'APPROVED', isapproved: 'Y' })];   // K1's key declared AGAIN after K1 was imported

  function irows(key) { return k.q('SELECT * FROM i_order WHERE documentno=? ORDER BY i_order_id', [key]); }
  function prowsOf(key) { return k.q('SELECT * FROM i_payment WHERE documentno=? ORDER BY i_payment_id', [key]); }
  function ordersFor(key) { return k.q('SELECT * FROM c_order WHERE documentno=? ORDER BY c_order_id', [key]); }
  function invoicesOfOrder(id) { return k.q('SELECT * FROM c_invoice WHERE c_order_id=? ORDER BY c_invoice_id', [id]); }
  function paysFor(key) { return k.q('SELECT * FROM c_payment WHERE documentno=? ORDER BY c_payment_id', [key]); }
  function alloc(payId) { return k.q("SELECT l.*, h.docstatus AS hdr_status FROM c_allocationline l JOIN c_allocationhdr h ON h.c_allocationhdr_id=l.c_allocationhdr_id WHERE l.c_payment_id=? ORDER BY l.c_allocationline_id", [payId]); }
  function openOracle(invId) {                                              // independent oracle: grandtotal - the allocated (amount + discount + writeoff) over allocation lines of COMPLETED headers
    var inv = one('SELECT grandtotal FROM c_invoice WHERE c_invoice_id=?', [invId]);
    var a = one("SELECT COALESCE(SUM(l.amount + l.discountamt + l.writeoffamt),0) AS s FROM c_allocationline l JOIN c_allocationhdr h ON h.c_allocationhdr_id=l.c_allocationhdr_id WHERE l.c_invoice_id=? AND h.docstatus IN ('CO','CL')", [invId]);
    return Math.round((Number(inv.grandtotal) - Number(a.s)) * 100) / 100;
  }
  function docCounts() { var o = {}; ['c_order', 'c_orderline', 'c_invoice', 'c_invoiceline', 'm_inout', 'c_payment', 'c_allocationhdr'].forEach(function (t) { o[t] = one('SELECT count(*) AS n FROM ' + t).n; }); return o; }
  function snapRows(key) { return J([irows(key), prowsOf(key)]); }
  var SHIPPED = [], RUNS = [];
  function runPOS(params, tag) {
    var jl0 = k.journal.length;
    var r = commit(function (trx) { var r0 = AP.runInTrx(trx, PID, { params: params || {} }); return { ok: r0.ok, r: r0, error: r0.summary }; }, { ws: 'import_pos_sales', tag: tag || '' });
    var poss = (r.log || []).filter(function (l) { return /^§POSS/.test(l); });
    (r.log || []).forEach(function (l) { if (/^§(POSS|IMPORT_ORDER|IMPORT_PAYMENT|PROC-UNPORTED|PROC-PARAM|PROC-UNKNOWN)/.test(l)) SHIPPED.push(l); });
    var logs = (r.r && r.r.logs) || [], out = { res: r, journal: k.journal.length - jl0, log: (r.log || []).slice(), poss: poss, summary: r.r && r.r.summary, logs: logs, tag: tag };
    RUNS.push(out); return out;
  }
  function tkt(run, key) { return run.poss.filter(function (l) { return /^§POSS-TICKET /.test(l) && l.indexOf(' key=' + key + ' ') > 0; })[0] || null; }
  var BANK = { C_BankAccount_ID: 100, AD_Client_ID: 11, AD_Org_ID: 11 };
  function P(extra) { return Object.assign({}, BANK, extra || {}); }

  // ═══ VIEW ═══════════════════════════════════════════════════════════════════════════════════════════
  guard('VIEW', 'deposit', 'the till declares K1..K6 and K8 as I_Order lines + I_Payment tenders through the ERP write path (ML.save, one op group)', function () {
    var d = commit(saveAll([].concat(K1ROWS, K2ROWS, K3ROWS, K4ROWS, K5ROWS, K6ROWS, K8ROWS)));
    check('VIEW', 'deposit', 'all tickets are declared: 3+2+1+1+0+1+1 = 9 I_Order lines and 2+1+1+1+1+1+1 = 8 tenders, every row I_IsImported=N, no C_Order/C_Payment for any key', d.ok && Object.keys(KEY).reduce(function (a, kk) { return a + irows(KEY[kk]).length; }, 0) === 9 && Object.keys(KEY).reduce(function (a, kk) { return a + prowsOf(KEY[kk]).length; }, 0) === 8 && Object.keys(KEY).every(function (kk) { return ordersFor(KEY[kk]).length === 0 && paysFor(KEY[kk]).length === 0; }), { ok: d.ok, err: d.error });
  });
  function viewRows(key) { return tableExists('i_possales', 'view') ? k.q('SELECT * FROM i_possales WHERE documentno=? ORDER BY i_possales_id', [key]) : []; }
  guard('VIEW', 'one-sale', 'K1 shows as ONE sale in the view with lines=3 and tenders=2', function () {
    var v = viewRows(KEY.K1);
    check('VIEW', 'one-sale', 'exactly one i_possales row for K1: Lines=3, Tenders=2, not imported', v.length === 1 && num(v[0].lines) === 3 && num(v[0].tenders) === 2 && v[0].i_isimported === 'N', v);
  });
  guard('VIEW', 'totals', 'K1 lines total equals tenders total, both against an independent SQL oracle over the I_ tables', function () {
    var v = viewRows(KEY.K1)[0] || {}, lo = one("SELECT SUM(qtyordered*priceactual) AS s FROM i_order WHERE documentno=?", [KEY.K1]).s, to = one("SELECT SUM(payamt) AS s FROM i_payment WHERE documentno=?", [KEY.K1]).s;
    check('VIEW', 'totals', 'LinesTotal=' + lo + ' TendersTotal=' + to + ' Difference=0 (378 = 200 + 178)', cents(lo) === 37800 && cents(to) === 37800 && cents(v.linestotal) === cents(lo) && cents(v.tenderstotal) === cents(to) && cents(v.difference) === 0, { v: v, lo: lo, to: to });
  });
  guard('VIEW', 'mismatch', 'K2 (lines 115, tenders 100) shows its Difference before any import: -15', function () {
    var v = viewRows(KEY.K2)[0] || {};
    check('VIEW', 'mismatch', 'LinesTotal 115, TendersTotal 100, Difference -15', cents(v.linestotal) === 11500 && cents(v.tenderstotal) === 10000 && cents(v.difference) === -1500, v);
  });
  guard('VIEW', 'orphan', 'K5 (tenders, no lines) is a visible sale with lines=0', function () {
    var v = viewRows(KEY.K5);
    check('VIEW', 'orphan', 'one row, Lines=0, Tenders=1, Difference = 10', v.length === 1 && num(v[0].lines) === 0 && num(v[0].tenders) === 1 && cents(v[0].difference) === 1000, v);
  });
  guard('VIEW', 'card-empty', 'the card-number columns are EMPTY on every deposited I_Payment row (PCI, POS_PLUGIN_LOCAL_FIRST §5): n>0 rows judged', function () {
    var rows = k.q("SELECT * FROM i_payment WHERE documentno IN ('" + Object.keys(KEY).map(function (kk) { return KEY[kk]; }).join("','") + "')"), bad = rows.filter(function (r) { return r.creditcardnumber != null || r.creditcardvv != null || r.creditcardexpmm != null || r.creditcardexpyy != null; });
    check('VIEW', 'card-empty', rows.length + ' deposited tender rows (incl. 2 card tenders): CreditCardNumber/VV/ExpMM/ExpYY all NULL on all of them', rows.length === 8 && bad.length === 0 && rows.filter(function (r) { return r.tendertype === 'C'; }).length === 2, { n: rows.length, bad: bad.length });
  });

  // ═══ SALE (run A: DocumentNo scopes the run to K1) and ISO ═══════════════════════════════════════════
  var snap0 = {}, c0 = docCounts();
  [KEY.K2, KEY.K3, KEY.K4, KEY.K5, KEY.K6, KEY.K8].forEach(function (kk) { snap0[kk] = snapRows(kk); });
  var A = null, K1 = {};
  guard('SALE', 'ran', 'Import POS Sales over ticket K1 (DocumentNo parameter) runs ok, answers "#1/0" (1 ticket imported, 0 refused) and prints the §POSS-TICKET line', function () {
    A = runPOS(P({ DocumentNo: KEY.K1 }), 'A-K1');
    check('SALE', 'ran', 'process ok, summary #1/0, §POSS-TICKET key=K1 result=IMPORTED', A.res.ok === true && A.summary === '#1/0' && /result=IMPORTED/.test(tkt(A, KEY.K1) || ''), { ok: A.res.ok, err: A.res.error, summary: A.summary, line: tkt(A, KEY.K1), poss: A.poss.slice(0, 4) });
  });
  guard('SALE', 'documents', 'ONE completed order, ONE completed invoice (GrandTotal 378 = the oracle), TWO completed receipts (200 + 178)', function () {
    var os_ = ordersFor(KEY.K1), o = os_[0] || {}, inv = o.c_order_id ? invoicesOfOrder(o.c_order_id) : [], ps = paysFor(KEY.K1);
    K1 = { order: o, inv: inv[0] || {}, pays: ps };
    check('SALE', 'one-order', 'exactly ONE c_order with the ticket key, DocStatus CO, doc type POS Order (Import Orders ran with DocAction CO, not its Prepare default)', os_.length === 1 && o.docstatus === 'CO' && num(o.c_doctype_id) === num(one("SELECT c_doctype_id AS d FROM c_doctype WHERE name='POS Order' AND ad_client_id=11").d), { n: os_.length, st: o.docstatus });
    check('SALE', 'one-invoice', 'exactly ONE c_invoice for that order, DocStatus CO, GrandTotal 378.00', inv.length === 1 && inv[0].docstatus === 'CO' && cents(inv[0].grandtotal) === 37800, inv.map(function (x) { return [x.docstatus, x.grandtotal]; }));
    check('SALE', 'two-receipts', 'exactly TWO c_payment with the ticket key, both DocStatus CO, IsReceipt Y, amounts {200,178}, tender types {X,C}, bank account 100', ps.length === 2 && ps.every(function (p) { return p.docstatus === 'CO' && p.isreceipt === 'Y' && num(p.c_bankaccount_id) === 100; }) && J(ps.map(function (p) { return cents(p.payamt); }).sort()) === J([17800, 20000]) && J(ps.map(function (p) { return p.tendertype; }).sort()) === J(['C', 'X']), ps.map(function (p) { return [p.docstatus, p.payamt, p.tendertype, p.c_bankaccount_id]; }));
  });
  guard('SALE', 'allocated', 'each receipt is ALLOCATED to the invoice (one completed allocation line = the tender amount), open amount 0 by the independent oracle, invoice IsPaid=Y', function () {
    var ps = K1.pays || [], inv = K1.inv || {};
    var al = ps.map(function (p) { return alloc(p.c_payment_id); });
    var invNow = inv.c_invoice_id ? one('SELECT * FROM c_invoice WHERE c_invoice_id=?', [inv.c_invoice_id]) : {};
    check('SALE', 'allocated', 'receipts allocated: ' + J(al.map(function (a) { return a.map(function (l) { return [l.c_invoice_id, l.amount, l.hdr_status]; }); })) + ' open=' + (inv.c_invoice_id ? openOracle(inv.c_invoice_id) : null) + ' IsPaid=' + invNow.ispaid,
      ps.length === 2 && al.every(function (a, i) { return a.length === 1 && num(a[0].c_invoice_id) === num(inv.c_invoice_id) && a[0].hdr_status === 'CO' && cents(a[0].amount) === cents(ps[i].payamt); }) && openOracle(inv.c_invoice_id) === 0 && invNow.ispaid === 'Y', { al: al.length, inv: inv.c_invoice_id });
  });
  guard('SALE', 'invoice-link', 'the glue step stamped the invoice id: the receipts carry C_Invoice_ID = the order\'s invoice and NO C_Order_ID (legacy POS receipts never link the order, MOrder.java:2374)', function () {
    var ps = K1.pays || [];
    check('SALE', 'invoice-link', 'both receipts: c_invoice_id = ' + (K1.inv && K1.inv.c_invoice_id) + ', c_order_id NULL', ps.length === 2 && ps.every(function (p) { return num(p.c_invoice_id) === num(K1.inv.c_invoice_id) && p.c_order_id == null; }), ps.map(function (p) { return [p.c_invoice_id, p.c_order_id]; }));
  });
  guard('SALE', 'rows', 'the I_ rows are marked: I_Order Y/Processed/C_Order_ID, I_Payment Y/Processed/C_Payment_ID of its own receipt', function () {
    var ir = irows(KEY.K1), pr = prowsOf(KEY.K1);
    check('SALE', 'rows', '3 I_Order rows Y with the order id; 2 I_Payment rows Y each pointing at a distinct receipt of the key', ir.length === 3 && ir.every(function (r) { return r.i_isimported === 'Y' && r.processed === 'Y' && num(r.c_order_id) === num(K1.order.c_order_id); }) && pr.length === 2 && pr.every(function (r) { return r.i_isimported === 'Y' && r.processed === 'Y' && (K1.pays || []).some(function (p) { return num(p.c_payment_id) === num(r.c_payment_id); }); }) && num(pr[0].c_payment_id) !== num(pr[1].c_payment_id), { ir: ir.map(function (r) { return [r.i_isimported, r.c_order_id]; }), pr: pr.map(function (r) { return [r.i_isimported, r.c_payment_id]; }) });
  });
  guard('SALE', 'card', 'the card receipt carries the card TYPE and the terminal approval in legacy\'s processor-response columns (R_PnRef, R_AuthCode, R_Result, R_RespMsg copied by Import Payment, ImportPayment.js:200), Orig_TrxID stays empty, and NO card number / VV / expiry on the C_Payment (n>0)', function () {
    var ps = K1.pays || [], card = ps.filter(function (p) { return p.tendertype === 'C'; })[0] || {}, cash = ps.filter(function (p) { return p.tendertype === 'X'; })[0] || {};
    check('SALE', 'card', 'card receipt: CreditCardType V, R_PnRef PNREF-K1-0001, R_AuthCode AUTH-K1-0001, R_Result 0, R_RespMsg APPROVED, Orig_TrxID NULL; cash receipt has no R_* approval; both receipts have CreditCardNumber/VV/ExpMM/ExpYY NULL', ps.length === 2 && card.creditcardtype === 'V' && card.r_pnref === 'PNREF-K1-0001' && card.r_authcode === 'AUTH-K1-0001' && String(card.r_result) === '0' && card.r_respmsg === 'APPROVED' && card.orig_trxid == null && cash.r_pnref == null && cash.r_authcode == null && ps.every(function (p) { return p.creditcardnumber == null && p.creditcardvv == null && p.creditcardexpmm == null && p.creditcardexpyy == null; }), ps.map(function (p) { return [p.tendertype, p.creditcardtype, p.r_pnref, p.r_authcode, p.r_result, p.orig_trxid, p.creditcardnumber, p.creditcardvv, p.creditcardexpmm, p.creditcardexpyy]; }));
  });
  guard('SALE', 'one-group', 'the whole run is ONE op group of the caller\'s transaction (ONE journal entry holding c_order, c_invoice, c_payment, c_allocationhdr, i_order, i_payment writes)', function () {
    var tabs = A ? A.res.ops.map(function (o2) { return o2.table; }).filter(function (v, i, a) { return a.indexOf(v) === i; }) : [];
    check('SALE', 'one-group', 'journal +1; tables ' + J(tabs), !!A && A.journal === 1 && ['c_order', 'c_invoice', 'c_payment', 'c_allocationhdr', 'i_order', 'i_payment'].every(function (t) { return tabs.indexOf(t) >= 0; }), { journal: A && A.journal, tabs: tabs });
  });
  guard('SALE', 'view-after', 'the view now shows K1 as imported (Y) with the order id', function () {
    var v = viewRows(KEY.K1);
    check('SALE', 'view-after', 'one row, I_IsImported=Y, C_Order_ID = the order', v.length === 1 && v[0].i_isimported === 'Y' && num(v[0].c_order_id) === num(K1.order.c_order_id), v);
  });
  guard('ISO', 'untouched', 'the DocumentNo parameter scopes the run: K2/K3/K4/K5/K6/K8 rows are byte-identical to before and no document exists for them; the only new documents are K1\'s', function () {
    var same_ = [KEY.K2, KEY.K3, KEY.K4, KEY.K5, KEY.K6, KEY.K8].every(function (kk) { return snapRows(kk) === snap0[kk]; });
    var none = [KEY.K2, KEY.K3, KEY.K4, KEY.K5, KEY.K6, KEY.K8].every(function (kk) { return ordersFor(kk).length === 0 && paysFor(kk).length === 0; });
    var c1 = docCounts();
    check('ISO', 'untouched', 'rows identical: ' + same_ + '; no order/receipt for the other keys: ' + none + '; counts delta = 1 order, 3 lines, 1 invoice, 2 receipts, 1 shipment', same_ && none && c1.c_order - c0.c_order === 1 && c1.c_orderline - c0.c_orderline === 3 && c1.c_invoice - c0.c_invoice === 1 && c1.c_payment - c0.c_payment === 2 && c1.m_inout - c0.m_inout === 1, { same: same_, none: none, c0: c0, c1: c1 });
  });

  // ═══ BATCH (run B: no key filter) ═══════════════════════════════════════════════════════════════════
  var B = null;
  guard('BATCH', 'declare-resend', 'K1\'s key is declared AGAIN after it was imported (a re-sent ticket); the view shows K1 as TWO sales (one imported, one pending)', function () {
    var d = commit(saveAll(K7ROWS)), v = viewRows(KEY.K1);
    check('BATCH', 'declare-resend', 'the resend was accepted as a declaration; the view has two K1 rows: one Y (lines 3, tenders 2) and one N (lines 3, tenders 2)', d.ok && v.length === 2 && v.filter(function (r) { return r.i_isimported === 'Y'; }).length === 1 && v.filter(function (r) { return r.i_isimported === 'N'; }).length === 1 && v.every(function (r) { return num(r.lines) === 3 && num(r.tenders) === 2; }), { ok: d.ok, err: d.error, v: v.map(function (r) { return [r.i_isimported, r.lines, r.tenders]; }) });
  });
  var c1b = docCounts(), K3order = null, factsBeforeB = one('SELECT count(*) AS n FROM fact_acct').n;
  guard('BATCH', 'ran', 'one run over every pending ticket: ok, answers "#1/6" (K4 imported; K2, K3, K5, K6, K8 and the resend refused) - a bad ticket does not stop a good one', function () {
    B = runPOS(P({}), 'B-all');
    check('BATCH', 'ran', 'process ok, summary #1/6; K4 IMPORTED; K2/K3/K5/K6/K8/K7 REFUSED', B.res.ok === true && B.summary === '#1/6' && /result=IMPORTED/.test(tkt(B, KEY.K4) || '') && [KEY.K2, KEY.K3, KEY.K5, KEY.K6, KEY.K8].every(function (kk) { return /result=REFUSED/.test(tkt(B, kk) || ''); }) && B.poss.filter(function (l) { return /result=REFUSED/.test(l); }).length === 6, { ok: B.res.ok, err: B.res.error, summary: B.summary, poss: B.poss });
  });
  guard('BATCH', 'good-imported', 'K4 (one line, one card tender) is imported like K1: order CO, invoice CO paid, open 0, one receipt', function () {
    var o = ordersFor(KEY.K4)[0] || {}, inv = o.c_order_id ? invoicesOfOrder(o.c_order_id)[0] || {} : {}, ps = paysFor(KEY.K4);
    check('BATCH', 'good-imported', 'order CO, invoice CO GrandTotal 65, one receipt CO 65 allocated, open 0, IsPaid', o.docstatus === 'CO' && inv.docstatus === 'CO' && cents(inv.grandtotal) === 6500 && ps.length === 1 && ps[0].docstatus === 'CO' && cents(ps[0].payamt) === 6500 && openOracle(inv.c_invoice_id) === 0 && one('SELECT ispaid AS p FROM c_invoice WHERE c_invoice_id=?', [inv.c_invoice_id]).p === 'Y', { o: o.docstatus, inv: inv.docstatus, ps: ps.length });
  });
  function noDocs(key) { var os_ = ordersFor(key); return os_.length === 0 && paysFor(key).length === 0 && k.q('SELECT 1 FROM c_invoice i JOIN c_order o ON o.c_order_id=i.c_order_id WHERE o.documentno=?', [key]).length === 0; }
  guard('BATCH', 'total-mismatch', 'K2 (tenders 100 <> invoice 115) is left WHOLE: no order, no invoice, no receipt, no allocation; rows E; I_ErrorMsg names both totals', function () {
    var ir = irows(KEY.K2), pr = prowsOf(KEY.K2), line = tkt(B, KEY.K2) || '';
    check('BATCH', 'total-mismatch', '0 documents for the key; 2 I_Order rows + 1 I_Payment row all E with an I_ErrorMsg containing 100.00 and 115.00; the TICKET line says REFUSED', noDocs(KEY.K2) && ir.length === 2 && pr.length === 1 && ir.concat(pr).every(function (r) { return r.i_isimported === 'E' && /100\.00/.test(r.i_errormsg || '') && /115\.00/.test(r.i_errormsg || ''); }) && /result=REFUSED/.test(line) && !/undone_order=none/.test(line), { docs: noDocs(KEY.K2), ir: ir.map(function (r) { return [r.i_isimported, r.i_errormsg]; }), line: line });
  });
  guard('BATCH', 'all-or-none', 'K3: Import Orders made the order INSIDE the ticket, Import Payment refused the tender -> the order is UNDONE (no order, no invoice, no shipment, no receipt for the key); rows E; legacy text kept', function () {
    var line = tkt(B, KEY.K3) || '', m = /undone_order=(\S+)/.exec(line), ir = irows(KEY.K3), pr = prowsOf(KEY.K3);
    var madeInside = (B.log || []).some(function (l) { return /^§IMPORT_ORDER .*orders=1 lines=1/.test(l); });
    K3order = m && m[1] !== 'none' ? m[1] : null;               // '#new:N' = the order id inside the ticket's transaction (never committed)
    check('BATCH', 'all-or-none', 'the order existed during the ticket (undone_order=' + K3order + ') and is gone after: no c_order/c_invoice/c_payment for the key, rows E, I_ErrorMsg keeps "Invalid DocTypeName"', !!K3order && noDocs(KEY.K3) && ir.concat(pr).every(function (r) { return r.i_isimported === 'E' && /Invalid DocTypeName/.test(r.i_errormsg || ''); }) && madeInside, { line: line, noDocs: noDocs(KEY.K3), rows: ir.concat(pr).map(function (r) { return [r.i_isimported, r.i_errormsg]; }), madeInside: madeInside });
  });
  guard('BATCH', 'overpay', 'K8 (tenders 60 against an invoice of 50) is refused whole: Import Payment alone would settle the invoice and leave 10 of the receipt unallocated, so ONLY the total check stops it', function () {
    var ir = irows(KEY.K8), pr = prowsOf(KEY.K8);
    check('BATCH', 'overpay', 'no order/invoice/receipt for the key; rows E; I_ErrorMsg names 60.00 and 50.00', noDocs(KEY.K8) && ir.length === 1 && pr.length === 1 && ir.concat(pr).every(function (r) { return r.i_isimported === 'E' && /60\.00/.test(r.i_errormsg || '') && /50\.00/.test(r.i_errormsg || ''); }), ir.concat(pr).map(function (r) { return [r.i_isimported, r.i_errormsg]; }));
  });
  guard('BATCH', 'order-refused', 'K6: Import Orders refuses the line (unknown product): no documents, legacy ERR= text on the rows', function () {
    var ir = irows(KEY.K6), pr = prowsOf(KEY.K6);
    check('BATCH', 'order-refused', 'no order/receipt; the I_Order row is E with legacy\'s "ERR=" text; the tender row is E and says why', noDocs(KEY.K6) && ir.length === 1 && ir[0].i_isimported === 'E' && /ERR=/.test(ir[0].i_errormsg || '') && pr.length === 1 && pr[0].i_isimported === 'E' && String(pr[0].i_errormsg || '').trim().length > 0, { ir: ir.map(function (r) { return [r.i_isimported, r.i_errormsg]; }), pr: pr.map(function (r) { return [r.i_isimported, r.i_errormsg]; }) });
  });
  guard('BATCH', 'orphan', 'K5: tenders with no ticket lines are refused: no receipt; row E saying so', function () {
    var pr = prowsOf(KEY.K5);
    check('BATCH', 'orphan', 'no receipt; the tender row E with a message naming the missing ticket lines', paysFor(KEY.K5).length === 0 && pr.length === 1 && pr[0].i_isimported === 'E' && /no ticket lines/i.test(pr[0].i_errormsg || ''), pr.map(function (r) { return [r.i_isimported, r.i_errormsg]; }));
  });
  guard('BATCH', 'resend', 'K7 (K1\'s key re-sent): no second order, no second receipt, K1\'s own documents unchanged; the pending rows are E', function () {
    var os_ = ordersFor(KEY.K1), ps = paysFor(KEY.K1), pend = irows(KEY.K1).filter(function (r) { return r.i_isimported !== 'Y'; }), pendP = prowsOf(KEY.K1).filter(function (r) { return r.i_isimported !== 'Y'; });
    check('BATCH', 'resend', 'still ONE order and TWO receipts for the key; 3 pending I_Order rows + 2 pending tenders, all E with a message; the order is the same id as before', os_.length === 1 && num(os_[0].c_order_id) === num(K1.order.c_order_id) && ps.length === 2 && pend.length === 3 && pendP.length === 2 && pend.concat(pendP).every(function (r) { return r.i_isimported === 'E' && String(r.i_errormsg || '').trim().length > 0; }), { os: os_.length, ps: ps.length, pend: pend.length, pendP: pendP.length });
  });
  guard('BATCH', 'counts', 'document counts after the batch: exactly K4\'s documents were added (1 order, 1 line, 1 invoice, 1 receipt, 1 shipment) - no K2/K3/K5/K6/K7 residue anywhere', function () {
    var c2 = docCounts();
    check('BATCH', 'counts', J(c2), c2.c_order - c1b.c_order === 1 && c2.c_orderline - c1b.c_orderline === 1 && c2.c_invoice - c1b.c_invoice === 1 && c2.c_payment - c1b.c_payment === 1 && c2.m_inout - c1b.m_inout === 1 && c2.c_allocationhdr - c1b.c_allocationhdr === 1, { c1b: c1b, c2: c2 });
  });
  guard('BATCH', 'no-posting-residue', 'accounting: the facts the batch left are exactly K4\'s documents\' facts (the undone tickets posted nothing that survived); n>0', function () {
    var T = { c_order: 259, c_invoice: 318, m_inout: 319, c_payment: 335, c_allocationhdr: 735 }, ids = [];
    var o4 = ordersFor(KEY.K4)[0], i4 = o4 ? invoicesOfOrder(o4.c_order_id)[0] : null, p4 = paysFor(KEY.K4)[0], io4 = o4 ? k.q('SELECT m_inout_id FROM m_inout WHERE c_order_id=?', [o4.c_order_id])[0] : null;
    var al4 = p4 ? k.q('SELECT DISTINCT l.c_allocationhdr_id AS i FROM c_allocationline l WHERE l.c_payment_id=?', [p4.c_payment_id])[0] : null;
    if (o4) ids.push([T.c_order, o4.c_order_id]); if (i4) ids.push([T.c_invoice, i4.c_invoice_id]); if (io4) ids.push([T.m_inout, io4.m_inout_id]); if (p4) ids.push([T.c_payment, p4.c_payment_id]); if (al4) ids.push([T.c_allocationhdr, al4.i]);
    var mine = ids.length ? one('SELECT count(*) AS n FROM fact_acct WHERE ' + ids.map(function (x) { return '(ad_table_id=' + x[0] + ' AND record_id=' + x[1] + ')'; }).join(' OR ')).n : 0;
    var delta = one('SELECT count(*) AS n FROM fact_acct').n - factsBeforeB;
    check('BATCH', 'no-posting-residue', 'fact_acct rows added by the batch = ' + delta + ', facts of K4\'s own documents = ' + mine, mine > 0 && delta === mine, { delta: delta, mine: mine, ids: ids });
  });
  guard('BATCH', 'shipped-log', 'the shipped §-log carries the evidence (§POSS-TICKET per ticket, §IMPORT_ORDER and §IMPORT_PAYMENT of the inner legacy runs); non-empty', function () {
    var n = B ? B.poss.filter(function (l) { return /^§POSS-TICKET /.test(l); }).length : 0, io = B ? B.log.filter(function (l) { return /^§IMPORT_ORDER /.test(l); }).length : 0, ip = B ? B.log.filter(function (l) { return /^§IMPORT_PAYMENT /.test(l); }).length : 0;
    check('BATCH', 'shipped-log', '§POSS-TICKET lines=' + n + ' (7 tickets), inner §IMPORT_ORDER runs=' + io + ' (>=1), §IMPORT_PAYMENT runs=' + ip + ' (>=1)', n === 7 && io >= 1 && ip >= 1, { n: n, io: io, ip: ip });
  });

  // ═══ RERUN ══════════════════════════════════════════════════════════════════════════════════════════
  function yRows(key) { return J([irows(key).filter(function (r) { return r.i_isimported === 'Y'; }), prowsOf(key).filter(function (r) { return r.i_isimported === 'Y'; })]); }
  var y1s = yRows(KEY.K1), y4s = yRows(KEY.K4), c2 = docCounts(), C = null;
  guard('RERUN', 'nothing-new', 'a third run makes no new document of any kind and leaves the imported rows of K1/K4 byte-identical; the refused tickets are refused again (#0/6)', function () {
    C = runPOS(P({}), 'C-rerun');
    var c3 = docCounts();
    check('RERUN', 'nothing-new', 'process ok, summary #0/6, counts of c_order/c_orderline/c_invoice/c_invoiceline/m_inout/c_payment/c_allocationhdr identical, the Y rows of K1 and K4 unchanged (n>0)', C.res.ok === true && C.summary === '#0/6' && J(c3) === J(c2) && yRows(KEY.K1) === y1s && yRows(KEY.K4) === y4s && JSON.parse(y1s)[0].length === 3 && JSON.parse(y4s)[0].length === 1, { ok: C.res.ok, summary: C.summary, c2: c2, c3: c3 });
  });

  // ═══ STOP ═══════════════════════════════════════════════════════════════════════════════════════════
  var nIO = one('SELECT count(*) AS n FROM i_order').n, nIP = one('SELECT count(*) AS n FROM i_payment').n;
  try {
    var before = { view: tableExists('i_possales', 'view'), band: bandCount(), cls: !!(CLASSNAME && AP.JAVA[CLASSNAME]) }, stopped = null, serr = null;
    try { stopped = await reg.stopBundle(BUNDLE_ID); } catch (e) { serr = e && e.message; }
    var after = { view: tableExists('i_possales', 'view'), band: bandCount(), cls: !!(CLASSNAME && AP.JAVA[CLASSNAME]) };
    var r2 = commit(function (trx) { var r0 = AP.runInTrx(trx, PID, { params: P({}) }); return { ok: r0.ok, r: r0, error: r0.summary }; });
    check('STOP', 'removes-all', 'before: view=' + before.view + ' bandRows=' + before.band + ' class=' + before.cls + '; after Stop: view=false bandRows=0 class=false; running the process id answers "not found"; I_Order/I_Payment rows kept (' + nIO + '/' + nIP + '); base hash == pin',
      before.view === true && before.band > 40 && before.cls === true && !after.view && after.band === 0 && !after.cls && /not found/i.test(String(r2.error || '')) && one('SELECT count(*) AS n FROM i_order').n === nIO && one('SELECT count(*) AS n FROM i_payment').n === nIP && baseOracle() === BASE_PIN && !serr, { stopped: stopped, err: serr, before: before, after: after, run: r2.error });
  } catch (e) { check('STOP', 'removes-all', 'Stop removes everything', false, 'threw: ' + (e && e.message)); }
  try {
    var again = await reg.startBundle(BUNDLE_ID), n1 = bandCount(), v1 = tableExists('i_possales', 'view'), c1_ = !!(CLASSNAME && AP.JAVA[CLASSNAME]);
    await reg.stopBundle(BUNDLE_ID); var n2 = bandCount();
    check('STOP', 'restart', 'a second Start restores view + class + the dictionary rows (' + n1 + '), a second Stop removes them again (' + n2 + ')', again.state === 'ACTIVE' && v1 && c1_ && n1 > 40 && n2 === 0 && !tableExists('i_possales', 'view'), { state: again.state, v: v1, c: c1_, n1: n1, n2: n2 });
  } catch (e) { check('STOP', 'restart', 'a second Start/Stop cycle works', false, 'threw: ' + (e && e.message)); }

  // ═══ shipped log + verdicts ═══════════════════════════════════════════════════════════════════════════
  check('PLUG', 'no-unknown-para', 'no run printed §PROC-UNKNOWN-PARA for the new process or the two legacy ones (every parameter sent is one prepare() reads); at least one run happened', RUNS.some(function (r) { return r.res.ok; }) && !SHIPPED.some(function (l) { return /^§PROC-UNKNOWN-PARA/.test(l); }), SHIPPED.filter(function (l) { return /UNKNOWN-PARA/.test(l); }).slice(0, 3));
  var kinds = {}; SHIPPED.forEach(function (l) { var kk = l.split(' ')[0]; kinds[kk] = (kinds[kk] || 0) + 1; });
  say('§POSS-SHIPPED-LOG lines=' + SHIPPED.length + ' kinds=' + J(kinds));
  RUNS.forEach(function (r) { r.poss.forEach(function (l) { say('  ' + r.tag + ' ' + l.slice(0, 330)); }); });
  var vs = ['PLUG', 'VIEW', 'SALE', 'ISO', 'BATCH', 'RERUN', 'STOP'].map(verdict);
  var failedCases = Object.keys(CASES).filter(function (c) { return CASES[c].failed; });
  var all = !ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : 'PASS';
  say('§POSS-RESULT verdict=' + all + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' failedCases=' + J(failedCases) + (MUTANT ? ' mutant=' + MUTANT : ''));
  var exitCode = all === 'PASS' ? 0 : 1;

  // ═══ mutants (POSS_MUTANTS=1, parent run only) ═══════════════════════════════════════════════════════
  if (process.env.POSS_MUTANTS && !MUTANT) {
    var MUTS = [];
    try { MUTS = require('./witness_pos_sales_mutants.js'); } catch (e) { say('§POSS-MUTANT-ERR no mutant table: ' + e.message); }
    var killed = 0, applied = 0, notApplied = [], crashed = [], survived = [], jobs = [];
    MUTS.forEach(function (m) {
      if (process.env.POSS_ONLY && !new RegExp(process.env.POSS_ONLY).test(m.name)) return;     // debugging aid: run a subset of the table
      var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'possmut_'));
      fs.readdirSync(ERP).forEach(function (f) { try { fs.symlinkSync(path.join(ERP, f), path.join(dir, f)); } catch (e) {} });
      // every .js/.html module (and callouts/, processes/, plugins/) is COPIED, never symlinked: node resolves a symlink to its real path, so a symlinked neighbour would bind to the witness's own instance. Big .db files and patches/ stay symlinks (read-only data).
      fs.readdirSync(ERP).forEach(function (f) { var src = path.join(ERP, f), st = fs.statSync(src);
        if ((st.isFile() && /\.(js|html)$/.test(f)) || (st.isDirectory() && (f === 'callouts' || f === 'processes' || f === 'plugins'))) { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} fs.cpSync(src, path.join(dir, f), { recursive: true }); } });
      var ok = true, byFile = {};
      m.edits.forEach(function (ed) { (byFile[ed.file] = byFile[ed.file] || []).push(ed); });     // ALL edits of one file are applied to ONE read of it (agent B's harness bug: two edits on one file lost the first)
      Object.keys(byFile).forEach(function (file) {
        var src = fs.readFileSync(path.join(dir, file), 'utf8');
        byFile[file].forEach(function (ed) {
          var want = ed.count || 1, have = src.split(ed.from).length - 1;
          if (have !== want) { ok = false; say('§POSS-MUTANT-EDIT ' + m.name + ' ' + file + ' found ' + have + ' time(s), expected ' + want); return; }
          src = src.split(ed.from).join(ed.to);
        });
        fs.writeFileSync(path.join(dir, file), src);
      });
      if (!ok) { notApplied.push(m.name); say('§POSS-MUTANT ' + m.name + ' NOT-APPLIED (source text not found exactly as counted: the mutant proves nothing)'); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} return; }
      applied++; jobs.push({ m: m, dir: dir });
    });
    await new Promise(function (resolve) {
      var next = 0, running = 0, POOL = Number(process.env.POSS_JOBS || 4);
      function pump() {
        while (running < POOL && next < jobs.length) (function (job) {
          running++;
          var child = cp.spawn(process.execPath, [__filename], { env: Object.assign({}, process.env, { POSS_ERP: job.dir, POSS_MUTANT: job.m.name, POSS_MUTANTS: '' }) }), out = '', timer = setTimeout(function () { child.kill('SIGKILL'); }, 900000);
          child.stdout.on('data', function (d) { out += d; }); child.stderr.on('data', function (d) { out += d; });
          child.on('close', function (code) {
            clearTimeout(timer); running--;
            var m = job.m, rl = out.split('\n').filter(function (l) { return /^§POSS-RESULT /.test(l); })[0], failedLines = out.split('\n').filter(function (l) { return /§POSS-CHECK .* FAIL /.test(l); });
            var named = (m.kills || []).some(function (kk) { return failedLines.some(function (l) { return l.indexOf('case=' + kk.split('.')[0] + ' key=' + kk.split('.')[1] + ' ') >= 0; }); });
            if (!rl) { crashed.push(m.name); say('§POSS-MUTANT ' + m.name + ' CRASHED (no verdict line; a crash is NOT a kill) exit=' + code + ' ' + out.split('\n').filter(function (l) { return /Error|error/.test(l); })[0]); }
            else if (/verdict=FAIL/.test(rl) && named) { killed++; say('§POSS-MUTANT ' + m.name + ' KILLED by ' + m.kills.filter(function (kk) { return failedLines.some(function (l) { return l.indexOf('case=' + kk.split('.')[0] + ' key=' + kk.split('.')[1] + ' ') >= 0; }); }).join(' | ') + ' :: ' + m.what); }
            else { survived.push(m.name); say('§POSS-MUTANT ' + m.name + ' SURVIVED verdict=' + (rl.match(/verdict=\w+/) || [''])[0] + ' expected to fail ' + (m.kills || []).join(' | ') + ' failedChecks=' + failedLines.length); }
            try { fs.rmSync(job.dir, { recursive: true, force: true }); } catch (e) {}
            if (next >= jobs.length && running === 0) resolve(); else pump();
          });
        })(jobs[next++]);
        if (!jobs.length) resolve();
      }
      pump();
    });
    var nSel = jobs.length + notApplied.length, mv = !MUTS.length ? 'INCONCLUSIVE' : (killed === nSel && !notApplied.length && !crashed.length && !survived.length) ? 'PASS' : 'FAIL';
    say('§POSS-MUTANTS verdict=' + mv + ' total=' + nSel + ' applied=' + applied + ' killed=' + killed + ' notApplied=' + J(notApplied) + ' crashed=' + J(crashed) + ' survived=' + J(survived));
    if (mv !== 'PASS') exitCode = 1;
  }
  process.exit(exitCode);
})().catch(function (e) { say('§POSS-RESULT verdict=FAIL harness: ' + (e && e.stack)); process.exit(2); });
