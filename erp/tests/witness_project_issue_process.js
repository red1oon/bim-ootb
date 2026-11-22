#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-PROJECT-ISSUE-PROC (bim-ootb prompts/CAPEX_DASHBOARD.md §INTERNAL-UAT IU1; bim-compiler prompts/SQLiteIDEMPIERE.md §UAT-LEDGER row 6; TWIN CARDINAL RULE: the Kernel does what legacy iDempiere does).
//   READ THE LOG after every run: every verdict is a §PIPROC line, the exit code is not the evidence. INCONCLUSIVE when nothing was judged. PIPROC_BREAK=1 unregisters the port: the witness must FAIL (that is the RED state).
// THE ISSUE: the menu process "Issue to Project" (AD_Process 224, org.compiere.process.ProjectIssue) had no port: the Kernel answered "classname not in registry", so the UAT guide's C4.2 (issue products to a Work Order
//   project from a locator) could not be done, and the refusal legacy gives a project of category General ("Project not Work Order or Asset =N", ProjectIssue.java:117-119) did not exist either.
// Every expected value is derived BY HAND from ProjectIssue.java / MProjectIssue.java / MProjectLine.java (file:line in processes/ProjectIssue.js) and seed rows read by SQL, never from the port's own output.
//   W wired · R category refusal · A plain issue (Locator, Product, MovementQty, MovementDate) · D defaults (Qty 1) · E missing locator/product · L project-line variant · U receipt/expense variants named not ported.
// Command: node erp/tests/witness_project_issue_process.js        (PIPROC_ERP=<erp dir> runs against another tree)
'use strict';
var fs = require('fs'), path = require('path');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = process.env.PIPROC_ERP || path.join(__dirname, '..'), BREAK = process.env.PIPROC_BREAK === '1';
var SQLJS_DIR = process.env.SQLJS_DIR || '/home/red1/bim-ootb/tests/node_modules/sql.js';
if (!process.env.SQLJS) process.env.SQLJS = SQLJS_DIR;
var initSqlJs = require(SQLJS_DIR);
var _log = console.log, SEEN = [];
console.log = function () { var s = Array.prototype.join.call(arguments, ' '); SEEN.push(s); };
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 }, INC = 0;
function check(cs, key, rule, ok, info) {
  var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 };
  c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §PIPROC-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + JSON.stringify(info)));
}
function inconclusive(cs, key, why) { INC++; say('  §PIPROC-CHECK case=' + cs + ' key=' + key + ' INCONCLUSIVE ' + why); }
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }; var v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§PIPROC-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed + (BREAK ? ' break=1' : '')); return v; }
function J(x) { return JSON.stringify(x); }
function guard(cs, key, rule, fn) { try { fn(); } catch (e) { check(cs, key, rule, false, 'threw: ' + (e && (e.message || e.stack) || String(e))); } }
function reqERP(f) { return require(path.join(ERP, f)); }
function read(f) { try { return fs.readFileSync(path.join(ERP, f), 'utf8'); } catch (e) { return ''; } }

(async function main() {
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIR, 'dist', f); } });
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); } catch (e) {} });
  var K = reqERP('ws_kernel.js'), k = K.build(db), ML = k.ML, AP = reqERP('ad_process.js');
  reqERP('model_projectissue.js');                          // MProjectIssue registers into the ModelLayer (the page loads it by its own script tag; ws_kernel does not)
  if (BREAK) delete AP.JAVA['org.compiere.process.ProjectIssue'];   // the break switch: the port is gone, AD_Process 224 answers "has no port" again (RED)
  var S = { clientId: 11, orgId: 11, userId: 100, roleId: 102, warehouseId: 103, actor: 'witness:project-issue-process' };
  function q(sql, p) { return k.q(sql, p || []); }
  function one(sql, p) { return q(sql, p)[0] || null; }
  function commit(fn) {
    var trx = new ML.Trx(k.q, k.env(S)), r;
    try { r = fn(trx, ML) || { ok: true }; } catch (ex) { r = { ok: false, error: 'model threw: ' + (ex && ex.message) }; trx.say('§MODEL-ERR ' + (ex && ex.stack || ex)); }
    var ok = r.ok !== false, ops = ok ? trx.groupOps() : [], ids = []; if (ok && ops.length) ids = k.commit(S, ops, { ws: 'project_issue_process' });
    return Object.assign({}, r, { ok: ok, ops: ops, ids: ids, log: trx.log });
  }
  function lastId(t) { return one('SELECT MAX(' + t + '_id) AS m FROM ' + t).m; }
  function mk(table, f) {
    var r = commit(function (trx) { var sv = ML.save(trx, table, null, ML.newPO(trx, table, Object.assign({ ad_client_id: 11, ad_org_id: 11 }, f))); return { ok: sv.ok, error: sv.error }; });
    if (!r.ok) throw new Error('fixture ' + table + ' refused: ' + r.error);
    return lastId(table);
  }
  var N = 0;
  function mkProject(f) { N++; return mk('c_project', Object.assign({ value: 'PI' + N + '-' + process.pid, name: 'PI project ' + N, c_currency_id: 100, m_pricelist_version_id: 104, m_warehouse_id: 103, c_bpartner_id: 117, c_bpartner_location_id: 112,
    ad_user_id: 104, c_paymentterm_id: 105, salesrep_id: 101, datecontract: '2026-11-01 00:00:00', datefinish: '2026-12-31 00:00:00', issummary: 'N', projectcategory: 'W' }, f || {})); }
  var ALLLOG = [];
  function run(params) {                                    // the menu process: no record, the project is the C_Project_ID parameter
    var tx = null, r = commit(function (trx) { tx = AP.runInTrx(trx, 224, { tableId: 0, recordId: 0, params: params || {} }); return { ok: tx.ok, error: tx.summary }; });
    (r.log || []).forEach(function (l) { ALLLOG.push(l); });
    return { ok: r.ok, summary: tx && tx.summary, logs: (tx && tx.logs) || [], nops: r.ops.length, log: r.log || [], dispatched: tx && tx.dispatched };
  }
  var DAY = String(k.env(S).date || '').slice(0, 10);
  say('§PIPROC-LOAD erp=' + ERP + ' break=' + (BREAK ? 1 : 0) + ' sessionDay=' + DAY);
  function issues(pid) { return q('SELECT * FROM c_projectissue WHERE c_project_id=? ORDER BY line, c_projectissue_id', [pid]); }
  function plines(pid) { return q('SELECT * FROM c_projectline WHERE c_project_id=? ORDER BY line, c_projectline_id', [pid]); }
  function onhand(prod, loc) { return Number(one('SELECT COALESCE(SUM(qtyonhand),0) AS v FROM m_storageonhand WHERE m_product_id=? AND m_locator_id=?', [prod, loc]).v); }
  function nTx() { return Number(one('SELECT count(*) AS n FROM m_transaction').n); }
  var near = function (a, b) { return Math.abs(Number(a) - Number(b)) < 1e-6; };
  var PROD = 139, LOC = 101;

  // ═══ W wired ═══
  guard('W', 'ported', 'AD_Process 224 names org.compiere.process.ProjectIssue and that classname has a port (a defineProcess body) - was "classname not in registry"', function () {
    var row = one('SELECT classname AS c, ad_process_id AS id FROM ad_process WHERE ad_process_id=224');
    check('W', 'ported', 'AD_Process 224 = org.compiere.process.ProjectIssue and AdProcess.JAVA holds it', !!row && row.c === 'org.compiere.process.ProjectIssue' && !!AP.JAVA[row.c], { row: row });
  });
  guard('W', 'params', 'X of N: every AD_Process_Para of 224 is read by prepare(), no other', function () {
    var names = q("SELECT columnname AS c FROM ad_process_para WHERE ad_process_id=224 AND isactive='Y' ORDER BY seqno").map(function (r) { return r.c; });
    var src = read('processes/ProjectIssue.js'), used = (src.match(/name === '([A-Za-z_]+)'/g) || []).map(function (s) { return /'([^']+)'/.exec(s)[1]; });
    var X = names.filter(function (n) { return used.indexOf(n) >= 0; }).length;
    check('W', 'params', 'declared ' + J(names) + ': X=' + X + ' of N=' + names.length + '; port reads ' + J(used), names.length === 10 && X === names.length && used.length === names.length, { names: names, used: used });
  });
  var html = read('idempiere.html'), sw = read('sw.js'), mods = read('modules.json');
  check('W', 'wiring', 'idempiere.html loads processes/ProjectIssue.js, sw.js precaches it, modules.json lists it (twice: tag + precache order, once as a module)', /<script src="processes\/ProjectIssue\.js\?v=\d+"/.test(html) && sw.indexOf("'processes/ProjectIssue.js'") >= 0 && (mods.match(/processes\/ProjectIssue\.js/g) || []).length >= 3, {});
  // the ISSUE as the Kernel answers it today: the process run must dispatch, not answer "absent-handler"
  var probe = run({ C_Project_ID: 0 });
  check('W', 'dispatches', 'running AD_Process 224 dispatches a port (the answer is the process\'s own, not "Failed to create new process instance ... has no port")', probe.dispatched !== false && !/no port|not in registry/.test(String(probe.summary)), { s: probe.summary, d: probe.dispatched });
  verdict('W');

  // ═══ R the refusal: ProjectIssue.java:115-119 ═══
  guard('R', 'R1', 'a project of category General (N) is REFUSED with the Java text "Project not Work Order or Asset =N", and nothing is written (the UAT guide C4.1 step, ledger row 6)', function () {
    var p = mkProject({ projectcategory: 'N' }), t0 = nTx(), o0 = onhand(PROD, LOC), r = run({ C_Project_ID: p, M_Locator_ID: LOC, M_Product_ID: PROD, MovementQty: 2 });
    check('R', 'R1', 'category N: refused, text exact, 0 issues, 0 project lines, no transaction, on-hand unchanged, no ops committed',
      r.ok === false && r.summary === 'Project not Work Order or Asset =N' && !issues(p).length && !plines(p).length && nTx() === t0 && near(onhand(PROD, LOC), o0) && r.nops === 0, { ok: r.ok, s: r.summary, n: issues(p).length });
  });
  guard('R', 'R2', 'category S (Service) is refused too, the text carries the category', function () {
    var p = mkProject({ projectcategory: 'S' }), r = run({ C_Project_ID: p, M_Locator_ID: LOC, M_Product_ID: PROD, MovementQty: 1 });
    check('R', 'R2', 'category S: refused with "=S"', r.ok === false && r.summary === 'Project not Work Order or Asset =S' && !issues(p).length, { s: r.summary });
  });
  guard('R', 'R3', 'no such project (id 999999): new MProject(ctx, id) is an empty project whose category is null: "=null"', function () {
    var r = run({ C_Project_ID: 999999, M_Locator_ID: LOC, M_Product_ID: PROD, MovementQty: 1 });
    check('R', 'R3', 'refused with "Project not Work Order or Asset =null"', r.ok === false && r.summary === 'Project not Work Order or Asset =null', { s: r.summary });
  });
  verdict('R');

  // ═══ A the plain issue: issueInventory :320-348 ═══
  var pA = null;
  guard('A', 'A1', 'Work Order (W) + Locator + Product + MovementQty 3 + MovementDate: ONE issue, completed; a project line takes it', function () {
    pA = mkProject({ projectcategory: 'W' });
    var o0 = onhand(PROD, LOC), t0 = nTx(), r = run({ C_Project_ID: pA, M_Locator_ID: LOC, M_Product_ID: PROD, MovementQty: 3, MovementDate: '2026-11-10', Description: 'IU1 plain' });
    var is = issues(pA), pl = plines(pA), i = is[0] || {}, l = pl[0] || {}, tx = q('SELECT movementtype AS t, movementqty AS q FROM m_transaction WHERE c_projectissue_id=?', [i.c_projectissue_id || -1]);
    check('A', 'A1-run', 'the process ran ok and answers "Created 1" (ProjectIssue.java:347 "@Created@ 1")', r.ok === true && /1$/.test(String(r.summary)) && /Created/i.test(String(r.summary)), { ok: r.ok, s: r.summary });
    check('A', 'A1-issue', 'exactly one issue: line 10 (getNextLine), product 139, locator 101, qty 3, date 2026-11-10, description kept, DocStatus CO, Processed Y',
      is.length === 1 && Number(i.line) === 10 && Number(i.m_product_id) === PROD && Number(i.m_locator_id) === LOC && near(i.movementqty, 3) && String(i.movementdate).slice(0, 10) === '2026-11-10' && i.description === 'IU1 plain' && i.docstatus === 'CO' && i.processed === 'Y', { is: is });
    check('A', 'A1-line', 'exactly one project line: line 10 (MProjectLine(project) setLine), product 139, CommittedQty 3 (setMProjectIssue), C_ProjectIssue_ID = the issue',
      pl.length === 1 && Number(l.line) === 10 && Number(l.m_product_id) === PROD && near(l.committedqty, 3) && Number(l.c_projectissue_id) === Number(i.c_projectissue_id), { pl: pl });
    check('A', 'A1-stock', 'on-hand ' + o0 + ' -> ' + onhand(PROD, LOC) + ' (-3) and exactly one W+ transaction of -3 for the issue (MProjectIssue.doComplete :213-218)', near(o0 - onhand(PROD, LOC), 3) && tx.length === 1 && tx[0].t === 'W+' && near(tx[0].q, -3) && nTx() === t0 + 1, { tx: tx });
    check('A', 'A1-log', 'the process log row carries (issue line 10, movement date, qty 3) - addLog(pi.getLine(), pi.getMovementDate(), pi.getMovementQty(), null) :346', r.logs.length === 1 && Number(r.logs[0].id) === 10 && Number(r.logs[0].number) === 3, { logs: r.logs });
    check('A', 'A1-balance', 'the project balance moved by the issue (MProjectIssue.updateBalanceAmt, cost of the issue; amount judged by W-PROJECT-ISSUE / W-PROJECT-ISSUE-COST) and is > 0', Number(one('SELECT projectbalanceamt AS b FROM c_project WHERE c_project_id=?', [pA]).b) > 0, {});
  });
  guard('A', 'A2', 'a second plain issue to the same project takes lines 20 and 20 (getNextLine per table: issue 20, project line 20)', function () {
    var r = run({ C_Project_ID: pA, M_Locator_ID: LOC, M_Product_ID: PROD, MovementQty: 1 }), is = issues(pA), pl = plines(pA);
    check('A', 'A2', 'two issues (10, 20) and two project lines (10, 20)', r.ok && is.length === 2 && Number(is[1].line) === 20 && pl.length === 2 && Number(pl[1].line) === 20, { ok: r.ok, s: r.summary, il: is.map(function (x) { return x.line; }), pl: pl.map(function (x) { return x.line; }) });
  });
  guard('A', 'A3', 'category A (Asset project) is accepted like W (:117-118)', function () {
    var p = mkProject({ projectcategory: 'A' }), r = run({ C_Project_ID: p, M_Locator_ID: LOC, M_Product_ID: PROD, MovementQty: 1 });
    check('A', 'A3', 'asset project: ran ok, one issue completed', r.ok === true && issues(p).length === 1 && issues(p)[0].docstatus === 'CO', { s: r.summary });
  });
  verdict('A');

  // ═══ D defaults :327-328 ═══
  guard('D', 'D1', 'MovementQty empty -> 1 (Set to Qty 1); MovementDate empty -> today (the session day); Description empty -> none', function () {
    var p = mkProject({ projectcategory: 'W' }), o0 = onhand(PROD, LOC), r = run({ C_Project_ID: p, M_Locator_ID: LOC, M_Product_ID: PROD }), i = issues(p)[0] || {};
    check('D', 'D1', 'qty 1, date = ' + DAY + ', no description, on-hand -1', r.ok === true && near(i.movementqty, 1) && String(i.movementdate).slice(0, 10) === DAY && (i.description == null || i.description === '') && near(o0 - onhand(PROD, LOC), 1), { s: r.summary, i: i });
  });
  guard('D', 'D2', 'MovementQty 0 -> 1 as well (signum() == 0)', function () {
    var p = mkProject({ projectcategory: 'W' }), r = run({ C_Project_ID: p, M_Locator_ID: LOC, M_Product_ID: PROD, MovementQty: 0 }), i = issues(p)[0] || {};
    check('D', 'D2', 'qty 1', r.ok === true && near(i.movementqty, 1), { s: r.summary, i: i });
  });
  verdict('D');

  // ═══ E missing mandatory ═══
  guard('E', 'E1', 'no Locator: "Locator missing" (:126-127), nothing written', function () {
    var p = mkProject({ projectcategory: 'W' }), r = run({ C_Project_ID: p, M_Product_ID: PROD, MovementQty: 1 });
    check('E', 'E1', 'refused "Locator missing", no issue, no line', r.ok === false && r.summary === 'Locator missing' && !issues(p).length && !plines(p).length, { s: r.summary });
  });
  guard('E', 'E2', 'Locator but no Product: "No Product" (:324-325), nothing written', function () {
    var p = mkProject({ projectcategory: 'W' }), r = run({ C_Project_ID: p, M_Locator_ID: LOC, MovementQty: 1 });
    check('E', 'E2', 'refused "No Product", no issue, no line', r.ok === false && r.summary === 'No Product' && !issues(p).length && !plines(p).length, { s: r.summary });
  });
  verdict('E');

  // ═══ L the project-line variant: issueProjectLine :281-313 ═══
  guard('L', 'L1', 'a project line with a product and PlannedQty 4: the issue takes the line\'s product and PlannedQty, the SAME line is updated (no second line), its description goes to the issue', function () {
    var p = mkProject({ projectcategory: 'W' }), line = mk('c_projectline', { c_project_id: p, m_product_id: PROD, plannedqty: 4, plannedprice: 0, description: 'IU1 line text' }), o0 = onhand(PROD, LOC);
    var r = run({ C_Project_ID: p, M_Locator_ID: LOC, C_ProjectLine_ID: line }), is = issues(p), pl = plines(p), l = pl[0] || {}, i = is[0] || {};
    check('L', 'L1', 'ran ok "Created 1"; one issue qty 4 CO with the line description; still ONE project line, now C_ProjectIssue_ID = the issue, CommittedQty 4; on-hand -4',
      r.ok === true && /Created/i.test(String(r.summary)) && is.length === 1 && near(i.movementqty, 4) && i.docstatus === 'CO' && i.description === 'IU1 line text' && pl.length === 1 && Number(l.c_projectissue_id) === Number(i.c_projectissue_id) && near(l.committedqty, 4) && near(o0 - onhand(PROD, LOC), 4), { s: r.summary, is: is, pl: pl });
  });
  guard('L', 'L2', 'PlannedQty 0 -> the issue is of qty 1 and the line\'s PlannedQty becomes 1 (:291-292)', function () {
    var p = mkProject({ projectcategory: 'W' }), line = mk('c_projectline', { c_project_id: p, m_product_id: PROD, plannedqty: 0, plannedprice: 0 }), r = run({ C_Project_ID: p, M_Locator_ID: LOC, C_ProjectLine_ID: line }), i = issues(p)[0] || {}, l = plines(p)[0] || {};
    check('L', 'L2', 'issue qty 1, line PlannedQty 1, CommittedQty 1', r.ok === true && near(i.movementqty, 1) && near(l.plannedqty, 1) && near(l.committedqty, 1), { s: r.summary, i: i, l: l });
  });
  guard('L', 'L3', 'a project line without a product: "Projet Line has no Product" (the Java spelling, :285-286)', function () {
    var p = mkProject({ projectcategory: 'W' }), line = mk('c_projectline', { c_project_id: p, plannedqty: 1, plannedprice: 0, m_product_category_id: null }), r = run({ C_Project_ID: p, M_Locator_ID: LOC, C_ProjectLine_ID: line });
    check('L', 'L3', 'refused, nothing issued', r.ok === false && r.summary === 'Projet Line has no Product' && !issues(p).length, { s: r.summary });
  });
  guard('L', 'L4', 'issuing the same line twice: "Projet Line already been issued" (:287-288); the second run writes nothing', function () {
    var p = mkProject({ projectcategory: 'W' }), line = mk('c_projectline', { c_project_id: p, m_product_id: PROD, plannedqty: 1, plannedprice: 0 }), a = run({ C_Project_ID: p, M_Locator_ID: LOC, C_ProjectLine_ID: line }), o1 = onhand(PROD, LOC), b = run({ C_Project_ID: p, M_Locator_ID: LOC, C_ProjectLine_ID: line });
    check('L', 'L4', 'first ok, second refused with the exact text, still one issue, stock untouched', a.ok === true && b.ok === false && b.summary === 'Projet Line already been issued' && issues(p).length === 1 && near(onhand(PROD, LOC), o1), { a: a.summary, b: b.summary });
  });
  verdict('L');

  // ═══ U variants named not ported (an explicit refusal, never a faked "Created") ═══
  guard('U', 'U1', 'a Receipt (M_InOut_ID) and an Expense Report (S_TimeExpense_ID) are NOT ported: the run is refused naming the Java method, no issue written', function () {
    var p = mkProject({ projectcategory: 'W' }), a = run({ C_Project_ID: p, M_InOut_ID: 100 }), b = run({ C_Project_ID: p, S_TimeExpense_ID: 100 });
    check('U', 'U1', 'both refused with §PROC-UNPORTED naming issueReceipt / issueExpense, nothing written', a.ok === false && /issueReceipt/.test(String(a.summary)) && b.ok === false && /issueExpense/.test(String(b.summary)) && !issues(p).length, { a: a.summary, b: b.summary });
    say('  §PIPROC-NAMED not ported: ProjectIssue.issueReceipt (M_InOut_ID) and issueExpense (S_TimeExpense_ID) - their cost branches (MProjectIssue.java:559-566) are unported in model_projectissue.js; the UAT guide C4.2 does not use them');
  });
  verdict('U');

  // ═══ the shipped § log is primary evidence ═══
  var logHits = ALLLOG.filter(function (l) { return /§PROJECT-ISSUE-PROC/.test(l); });
  check('LOG', 'seen', 'the port printed its own §PROJECT-ISSUE-PROC line per issue (variant=inventory and variant=projectline both seen)', logHits.some(function (l) { return /variant=inventory/.test(l); }) && logHits.some(function (l) { return /variant=projectline/.test(l); }), { n: logHits.length });
  logHits.slice(0, 3).forEach(function (l) { say('  ' + l); });
  verdict('LOG');

  var v = ALL.failed ? 'FAIL' : (ALL.judged && !INC) ? 'PASS' : 'INCONCLUSIVE';
  say('§PIPROC-RESULT verdict=' + v + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' inconclusive=' + INC + (BREAK ? ' (BREAK: FAIL expected)' : ''));
  process.exit(v === 'PASS' ? 0 : 1);
})().catch(function (e) { _log('§PIPROC-ERROR ' + (e && e.stack || e)); process.exit(2); });
