#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-PROJ-PROCS (bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §PROJ-PROCS; CARDINAL RULE: the twin does what legacy iDempiere does). READ THE LOG after every run: every verdict is a
//   §PROJPROCS line, the exit code is not the evidence. A mutant that CRASHES is NOT a kill. INCONCLUSIVE when nothing was judged. Mutants: PROJPROCS_MUTANTS=1 (copies of the tree, each edit proven applied once).
// THE ISSUE: the Project window's process buttons Generate Order (164), Generate PO (225), Close Project (227), Copy Details (212) had no port (red1 W-RED1-RUN: 1 of 4); each must leave the SAME rows legacy leaves.
//   Every expected value below is derived BY HAND from the Java (file:line in processes/Project*.js, CopyFromProject.js, model_project.js) and from seed rows read by SQL - never from the port's own output.
//   P0 wired · G Generate Order · O Generate PO · C Close · K Copy Details · PH ProjectPhaseGenOrder (regression of the helpers it now shares; run on untouched main first).
// Command: node erp/tests/witness_project_procs.js         (PROJPROCS_ERP=<erp dir> runs against another tree; PROJPROCS_MUTANTS=1 for the mutant sweep)
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = process.env.PROJPROCS_ERP || path.join(__dirname, '..');
var MUTANT = process.env.PROJPROCS_MUTANT || '';
var SQLJS_DIR = process.env.SQLJS_DIR || '/home/red1/bim-ootb/tests/node_modules/sql.js';
if (!process.env.SQLJS) process.env.SQLJS = SQLJS_DIR;
var initSqlJs = require(SQLJS_DIR);
var _log = console.log, SEEN = [];
console.log = function () { var s = Array.prototype.join.call(arguments, ' '); SEEN.push(s); };
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 };
function check(cs, key, rule, ok, info) {
  var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 };
  c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §PROJPROCS-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + JSON.stringify(info)));
}
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }; var v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§PROJPROCS-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed + (MUTANT ? ' mutant=' + MUTANT : '')); return v; }
function J(x) { return JSON.stringify(x); }
function guard(cs, key, rule, fn) { try { fn(); } catch (e) { check(cs, key, rule, false, 'threw: ' + (e && (e.message || e.stack) || String(e))); } }
function reqERP(f) { return require(path.join(ERP, f)); }
function read(f) { try { return fs.readFileSync(path.join(ERP, f), 'utf8'); } catch (e) { return ''; } }
function r2(x) { return Math.round(Number(x) * 100) / 100; }
function num(x) { return x == null ? null : Number(x); }

(async function main() {
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIR, 'dist', f); } });
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); } catch (e) {} });
  var K = reqERP('ws_kernel.js'), k = K.build(db), ML = k.ML, AP = reqERP('ad_process.js');
  var S = { clientId: 11, orgId: 11, userId: 100, roleId: 102, warehouseId: 103, actor: 'witness:project-procs' };
  function q(sql, p) { return k.q(sql, p || []); }
  function one(sql, p) { return q(sql, p)[0] || null; }
  function commit(fn) {
    var trx = new ML.Trx(k.q, k.env(S)), r;
    try { r = fn(trx, ML) || { ok: true }; } catch (ex) { r = { ok: false, error: 'model threw: ' + (ex && ex.message) }; trx.say('§MODEL-ERR ' + (ex && ex.stack || ex)); }
    var ok = r.ok !== false, ops = ok ? trx.groupOps() : [], ids = []; if (ok && ops.length) ids = k.commit(S, ops, { ws: 'project_procs' });
    return Object.assign({}, r, { ok: ok, ops: ops, ids: ids, log: trx.log });
  }
  function lastId(t) { return one('SELECT MAX(' + t + '_id) AS m FROM ' + t).m; }
  // mk: one record through the model layer (a new row, defaults + registered beforeSave/afterSave), returns its key
  function mk(table, f) {
    var r = commit(function (trx) { var sv = ML.save(trx, table, null, ML.newPO(trx, table, Object.assign({ ad_client_id: 11, ad_org_id: 11 }, f))); return { ok: sv.ok, error: sv.error }; });
    if (!r.ok) throw new Error('fixture ' + table + ' refused: ' + r.error);
    return lastId(table);
  }
  var N = 0;
  function mkProject(f) { N++; return mk('c_project', Object.assign({ value: 'PP' + N + '-' + process.pid, name: 'PP project ' + N, c_currency_id: 100, m_pricelist_version_id: 104, m_warehouse_id: 103, c_bpartner_id: 117, c_bpartner_location_id: 112,
    ad_user_id: 104, c_paymentterm_id: 105, salesrep_id: 101, datecontract: '2026-11-01 00:00:00', datefinish: '2026-12-31 00:00:00', issummary: 'N', projectcategory: 'N' }, f || {})); }
  function mkLine(pid, f) { return mk('c_projectline', Object.assign({ c_project_id: pid }, f)); }
  var ALLLOG = [];
  function run(procId, rec, params) {
    var tx = null, r = commit(function (trx) { tx = AP.runInTrx(trx, procId, { tableId: 0, recordId: rec, params: params || {} }); return { ok: tx.ok, error: tx.summary }; });
    (r.log || []).forEach(function (l) { ALLLOG.push(l); });
    return { ok: r.ok, summary: tx && tx.summary, logs: (tx && tx.logs) || [], nops: r.ops.length, log: r.log || [], dispatched: tx && tx.dispatched };
  }
  say('§PROJPROCS-LOAD erp=' + ERP + ' mutant=' + (MUTANT || 'none'));
  var PROC = { genorder: 164, genpo: 225, close: 227, copy: 212, phasegen: 216 };

  // ═══ P0 wired ═══
  var CLS = { 164: 'ProjectGenOrder', 225: 'ProjectGenPO', 227: 'ProjectClose', 212: 'CopyFromProject' }, DECL = { 164: 0, 225: 4, 227: 0, 212: 1 };
  Object.keys(CLS).forEach(function (id) {
    guard('P0', 'ported-' + id, 'AD_Process ' + id + ' names org.compiere.process.' + CLS[id] + ' and that classname has a port (a defineProcess body)', function () {
      var row = one('SELECT classname AS c FROM ad_process WHERE ad_process_id=?', [Number(id)]);
      check('P0', 'ported-' + id, 'AD_Process ' + id + ' = org.compiere.process.' + CLS[id] + ' and AdProcess.JAVA holds it', !!row && row.c === 'org.compiere.process.' + CLS[id] && !!AP.JAVA[row.c], { row: row });
    });
    guard('P0', 'params-' + id, 'X of N: every AD_Process_Para of ' + id + ' is read by prepare(), no other', function () {
      var names = q("SELECT columnname AS c FROM ad_process_para WHERE ad_process_id=? AND isactive='Y' ORDER BY seqno", [Number(id)]).map(function (r) { return r.c; });
      var src = read('processes/' + CLS[id] + '.js'), used = (src.match(/name === '([A-Za-z_]+)'/g) || []).map(function (s) { return /'([^']+)'/.exec(s)[1]; });
      var X = names.filter(function (n) { return used.indexOf(n) >= 0; }).length;
      check('P0', 'params-' + id, 'declared ' + J(names) + ': X=' + X + ' of N=' + names.length + ' (expected N=' + DECL[id] + '); port reads ' + J(used), names.length === DECL[id] && X === names.length && used.length === names.length, { names: names, used: used });
    });
  });
  check('P0', 'old-handler-gone', 'the REGISTRY handler registerProjectGenOrder / projectGenGate / genOrderLines / GENORDER_SPEC is no longer exported (one implementation per responsibility)', AP.registerProjectGenOrder === undefined && AP.projectGenGate === undefined && AP.genOrderLines === undefined && AP.GENORDER_SPEC === undefined, {});
  var html = read('idempiere.html'), sw = read('sw.js');
  ['ProjectClose', 'ProjectGenOrder', 'ProjectGenPO', 'CopyFromProject', 'ProjectPhaseGenOrder'].forEach(function (c) {
    check('P0', 'wiring-' + c, 'idempiere.html loads processes/' + c + '.js and sw.js precaches it', new RegExp('<script src="processes/' + c + '\\.js\\?v=\\d+"').test(html) && sw.indexOf("'processes/" + c + ".js'") >= 0, {});
  });
  check('P0', 'ws-docaction-direct', 'MEASURED ON LEGACY (SG1): the web-service set_docaction runs po.processIt directly (ModelADServiceImpl:265), no workflow: ws_adinterface.js does not call runWorkflow', read('ws_adinterface.js').indexOf('ML.runWorkflow(') < 0, {});
  check('P0', 'html-no-engine-wiring', 'idempiere.html no longer calls registerProjectGenOrder', html.indexOf('registerProjectGenOrder(') < 0, {});

  // ═══ shared seed facts (read by SQL, never assumed) ═══
  var pv = 104, priceOf = function (prod) { return one('SELECT pricestd AS s, pricelist AS l FROM m_productprice WHERE m_pricelist_version_id=? AND m_product_id=? AND isactive=\'Y\'', [pv, prod]); };
  var WI = one("SELECT c_doctype_id AS d, docnosequence_id AS s FROM c_doctype WHERE ad_client_id=11 AND docsubtypeso='WI' AND issotrx='Y' AND isactive='Y'"), POO = one("SELECT c_doctype_id AS d, docnosequence_id AS s FROM c_doctype WHERE ad_client_id=11 AND docbasetype='POO' AND isdefault='Y' AND isactive='Y' ORDER BY ad_org_id DESC");
  var listId = one('SELECT m_pricelist_id AS p FROM m_pricelist_version WHERE m_pricelist_version_id=?', [pv]).p;
  function seqNext(s) { var r = one('SELECT currentnext AS n, incrementno AS i, prefix AS p FROM ad_sequence WHERE ad_sequence_id=?', [s]); return r; }
  function orderOf(id) { return one('SELECT * FROM c_order WHERE c_order_id=?', [id]); }
  function olines(oid) { return q('SELECT * FROM c_orderline WHERE c_order_id=? ORDER BY line, c_orderline_id', [oid]); }
  // price of a product on the version of a LIST valid at a date (independent of the pricing engine): the latest version with ValidFrom <= date
  function priceOnList(list, prod, date) { return one("SELECT pp.pricestd AS s, pp.pricelist AS l FROM m_productprice pp JOIN m_pricelist_version v ON v.m_pricelist_version_id=pp.m_pricelist_version_id WHERE v.m_pricelist_id=? AND pp.m_product_id=? AND date(v.validfrom)<=date(?) AND v.isactive='Y' ORDER BY v.validfrom DESC", [list, prod, date]); }
  function poListOf(bp) { var r = one('SELECT po_pricelist_id AS p FROM c_bpartner WHERE c_bpartner_id=?', [bp]); return r && r.p ? Number(r.p) : null; }   // MOrder.setBPartner :712-786 - a purchase order takes the vendor's PO price list when it has one
  var P123 = priceOf(123), P138 = priceOf(138), P137 = priceOf(137);
  say('§PROJPROCS-FACTS WI=' + J(WI) + ' POO=' + J(POO) + ' list=' + listId + ' p123=' + J(P123) + ' p138=' + J(P138) + ' p137=' + J(P137));

  // ═══ G Generate Order (ProjectGenOrder.java) ═══
  guard('G', 'G1', 'G1 two lines: a Sales On-Credit order from the project (header + lines), DocumentNo from the doc type sequence', function () {
    var pid = mkProject({ description: 'g1' }), l1 = mkLine(pid, { line: 10, m_product_id: 123, plannedqty: 10, plannedprice: 60, description: 'oak' }), l2 = mkLine(pid, { line: 20, m_product_id: 138, plannedqty: 8, plannedprice: 0, invoicedqty: 3, description: 'hoe' });
    var seq0 = seqNext(WI.s), nOrd0 = one('SELECT count(*) AS n FROM c_order').n, pl0 = q('SELECT * FROM c_projectline WHERE c_project_id=? ORDER BY c_projectline_id', [pid]);
    check('G', 'population', 'the fixture is not empty: 2 project lines, products priced on the project price list version, a WI doc type exists', !!P123 && !!P138 && !!WI && pl0.length === 2, { pl: pl0.length });
    var r = run(PROC.genorder, pid), pr = one('SELECT * FROM c_project WHERE c_project_id=?', [pid]);
    var o = one('SELECT * FROM c_order WHERE c_project_id=? ORDER BY c_order_id DESC', [pid]), ls = o ? olines(o.c_order_id) : [];
    say('  §PROJPROCS-G1 ok=' + r.ok + ' summary=' + J(r.summary) + ' order=' + J(o && [o.c_order_id, o.documentno, o.totallines, o.grandtotal]) + ' lines=' + J(ls.map(function (x) { return [x.line, x.m_product_id, x.qtyordered, x.priceactual, x.pricelist, x.discount, x.linenetamt, x.c_tax_id]; })));
    check('G', 'G1-run', 'the process ran ok and an order exists for the project', r.ok && !!o && one('SELECT count(*) AS n FROM c_order').n === nOrd0 + 1, { ok: r.ok, s: r.summary });
    if (!o) return;
    check('G', 'G1-header', 'header: Sales (IsSOTrx Y), doc type target = the On Credit order type (WI) ' + WI.d + ', project, partner/location/user/warehouse/payment term from the project, price list = that of the version (' + listId + '), description = project name, DateOrdered = DateContract, DatePromised = DateFinish, draft (DR)',
      o.issotrx === 'Y' && Number(o.c_doctypetarget_id) === Number(WI.d) && Number(o.c_project_id) === pid && Number(o.c_bpartner_id) === 117 && Number(o.c_bpartner_location_id) === 112 && Number(o.ad_user_id) === 104 && Number(o.bill_user_id) === 104 && Number(o.m_warehouse_id) === 103 && Number(o.c_paymentterm_id) === 105
      && Number(o.m_pricelist_id) === Number(listId) && o.description === pr.name && String(o.dateordered).slice(0, 10) === '2026-11-01' && String(o.datepromised).slice(0, 10) === '2026-12-31' && o.docstatus === 'DR', { o: o });
    var expNo = String(seq0.p || '') + String(seq0.n);
    check('G', 'G1-docno', 'DocumentNo = the doc type sequence\'s current next (' + expNo + ') and the sequence moved by its increment', o.documentno === expNo && Number(seqNext(WI.s).n) === Number(seq0.n) + Number(seq0.i), { got: o.documentno, want: expNo, seq: seqNext(WI.s) });
    check('G', 'G1-message', 'the answer is "@C_Order_ID@ <DocumentNo> (2)" (ProjectGenOrder.java :116-117)', new RegExp('^.+ ' + expNo + ' \\(2\\)$').test(r.summary || ''), { s: r.summary });
    var oak = ls[0] || {}, hoe = ls[1] || {};
    check('G', 'G1-count', 'one order line per project line (2), in Line order 10, 20, none other', ls.length === 2 && Number(oak.line) === 10 && Number(hoe.line) === 20, { n: ls.length });
    check('G', 'G1-oak', 'line 10 (Oak): Qty = Planned 10 - Invoiced 0, price = PlannedPrice 60 (the override), list price from the price list (' + P123.l + '), Discount = (list-60)*100/list HALF_UP 2 = ' + r2((P123.l - 60) * 100 / P123.l) + ', LineNetAmt = 10 x 60 = 600, a tax set, description kept',
      num(oak.qtyordered) === 10 && num(oak.priceactual) === 60 && num(oak.priceentered) === 60 && num(oak.pricelist) === Number(P123.l) && r2(oak.discount) === r2((P123.l - 60) * 100 / P123.l) && num(oak.linenetamt) === 600 && !!oak.c_tax_id && oak.description === 'oak' && Number(oak.m_product_id) === 123, { oak: oak });
    check('G', 'G1-hoe', 'line 20 (Hoe): Qty = Planned 8 - Invoiced 3 = 5, PlannedPrice 0 so the price list price (' + P138.s + ') stands, Discount = ' + r2((P138.l - P138.s) * 100 / P138.l) + ', LineNetAmt = 5 x ' + P138.s + ' = ' + r2(5 * P138.s),
      num(hoe.qtyordered) === 5 && num(hoe.priceactual) === Number(P138.s) && r2(hoe.discount) === r2((P138.l - P138.s) * 100 / P138.l) && num(hoe.linenetamt) === r2(5 * P138.s) && !!hoe.c_tax_id, { hoe: hoe });
    check('G', 'G1-total', 'the order\'s TotalLines = 600 + ' + r2(5 * P138.s) + ' = ' + r2(600 + 5 * P138.s), r2(o.totallines) === r2(600 + 5 * P138.s), { tl: o.totallines });
    var pl1 = q('SELECT * FROM c_projectline WHERE c_project_id=? ORDER BY c_projectline_id', [pid]);
    check('G', 'G1-lines-untouched', 'Java does not mark the project lines ordered: the project lines are exactly as before (no C_Order_ID, same Invoiced)', J(pl1.map(function (x) { return [x.c_order_id, x.invoicedqty, x.processed, x.plannedqty]; })) === J(pl0.map(function (x) { return [x.c_order_id, x.invoicedqty, x.processed, x.plannedqty]; })), { pl1: pl1.length });
    // G5 a second run: legacy has no duplicate guard (@todo in the Java)
    var r2_ = run(PROC.genorder, pid), orders = q('SELECT c_order_id, documentno FROM c_order WHERE c_project_id=?', [pid]);
    check('G', 'G5-rerun', 'a second run makes a SECOND order (the Java has only a @todo for duplicate prevention): 2 orders, 2 document numbers', r2_.ok && orders.length === 2 && orders[0].documentno !== orders[1].documentno, { n: orders.length, s: r2_.summary });
  });
  guard('G', 'G2', 'G2 refusals carry legacy\'s exact text and leave NO order and NO op', function () {
    var cases = [
      ['no price list', { m_pricelist_version_id: null }, 'Project has no Price List'],
      ['no warehouse', { m_warehouse_id: null }, 'Project has no Warehouse'],
      ['no partner location', { c_bpartner_location_id: null }, 'Project has no Business Partner/Location']
    ];
    cases.forEach(function (c) {
      var pid = mkProject(c[1]); mkLine(pid, { line: 10, m_product_id: 123, plannedqty: 1, plannedprice: 5 });
      var n0 = one('SELECT count(*) AS n FROM c_order').n, r = run(PROC.genorder, pid);
      check('G', 'G2-' + c[0].replace(/ /g, '-'), c[0] + ': the process fails with "' + c[2] + '" (ProjectGenOrder.getProject :126-131), no order is made, no op is committed', !r.ok && r.summary === c[2] && r.nops === 0 && one('SELECT count(*) AS n FROM c_order').n === n0, { ok: r.ok, s: r.summary, nops: r.nops });
    });
    var n0 = one('SELECT count(*) AS n FROM c_order').n, a = run(PROC.genorder, 987654321), b = run(PROC.genorder, 0);
    check('G', 'G2-not-found', 'an id that is no project: "Project not found C_Project_ID=987654321" (:124-125); id 0: "C_Project_ID == 0" (:67-68); nothing written', !a.ok && a.summary === 'Project not found C_Project_ID=987654321' && !b.ok && b.summary === 'C_Project_ID == 0' && a.nops === 0 && b.nops === 0 && one('SELECT count(*) AS n FROM c_order').n === n0, { a: a.summary, b: b.summary });
  });
  guard('G', 'G9', 'G9 MEASURED ON LEGACY (SG1/SG3): completing the order. The On Credit order makes a shipment and an invoice; their lines carry the project (the line getters fall back to the header, MOrderLine.java:541), and the invoice adds its GrandTotal to C_Project.InvoicedAmt (MInvoice.updateProjectInvoiceAmt :3596)', function () {
    var pid = mkProject({}); mkLine(pid, { line: 10, m_product_id: 137, plannedqty: 2, plannedprice: 0 }); mkLine(pid, { line: 20, plannedqty: 2, plannedprice: 5, description: 'no product' });
    var r = run(PROC.genorder, pid), o = one('SELECT * FROM c_order WHERE c_project_id=?', [pid]), inv0 = one('SELECT invoicedamt AS a FROM c_project WHERE c_project_id=?', [pid]).a;
    check('G', 'G10-product-less', 'MEASURED ON LEGACY (SG3): a PRODUCT-LESS project line is ordered too (default UOM, the Exempt tax: Tax.get with no product and no charge = getExemptTax), so the answer is (2) and the order has 2 lines; the Exempt line carries a C_Tax with IsTaxExempt=Y',
      r.ok && /\(2\)$/.test(r.summary || '') && !!o && olines(o.c_order_id).length === 2 && !!olines(o.c_order_id)[1].c_uom_id && (one('SELECT istaxexempt AS x FROM c_tax WHERE c_tax_id=?', [olines(o.c_order_id)[1].c_tax_id]) || {}).x === 'Y', { s: r.summary, l: o && olines(o.c_order_id).map(function (x) { return [x.line, x.c_uom_id, x.c_tax_id]; }) });
    if (!o) return;
    var co = commit(function (trx, M) { var d0 = trx.get('c_order', o.c_order_id); trx.update('c_order', d0, { docaction: 'CO' }); var x = M.processIt(trx, 'c_order', o.c_order_id, 'CO'); return { ok: x.ok, error: x.msg }; });
    var sh = one('SELECT * FROM m_inout WHERE c_order_id=?', [o.c_order_id]), inv = one('SELECT * FROM c_invoice WHERE c_order_id=?', [o.c_order_id]);
    check('G', 'G9-complete', 'the order completes and makes a shipment and an invoice', co.ok && !!sh && !!inv, { co: co.error });
    if (!sh || !inv) return;
    var sl = q('SELECT c_project_id AS p FROM m_inoutline WHERE m_inout_id=?', [sh.m_inout_id]), il = q('SELECT c_project_id AS p FROM c_invoiceline WHERE c_invoice_id=?', [inv.c_invoice_id]);
    check('G', 'G9-lines-project', 'every shipment line and invoice line carries the project (' + pid + ')', sl.length > 0 && il.length > 0 && sl.every(function (x) { return Number(x.p) === pid; }) && il.every(function (x) { return Number(x.p) === pid; }), { sl: sl, il: il });
    var after = one('SELECT invoicedamt AS a FROM c_project WHERE c_project_id=?', [pid]).a;
    check('G', 'G9-project-invoiced', 'C_Project.InvoicedAmt = ' + inv0 + ' + the invoice GrandTotal ' + inv.grandtotal, r2(after) === r2(Number(inv0) + Number(inv.grandtotal)) && Number(inv.grandtotal) > 0, { before: inv0, after: after, gt: inv.grandtotal });
  });
  guard('G', 'G8', 'G8 MEASURED ON LEGACY (:8108, W-PROJ-PROCS-LEGACY SG2f): a project without a Sales Representative cannot make an order - MOrder.setSalesRep_ID(0) sets a MANDATORY column to null, PO.set_Value remembers FillMandatory (PO.java:997-1004) and order.save() is false', function () {
    var pid = mkProject({ salesrep_id: null }); mkLine(pid, { line: 10, m_product_id: 123, plannedqty: 1, plannedprice: 5 });
    var n0 = one('SELECT count(*) AS n FROM c_order').n, r = run(PROC.genorder, pid);
    check('G', 'G8-no-salesrep', 'the process fails with "Could not create Order", no order, no op (legacy answer, measured)', !r.ok && r.summary === 'Could not create Order' && r.nops === 0 && one('SELECT count(*) AS n FROM c_order').n === n0, { ok: r.ok, s: r.summary });
    var pid2 = mkProject({ c_paymentterm_id: null }); mkLine(pid2, { line: 10, m_product_id: 123, plannedqty: 1, plannedprice: 5 });
    var r2 = run(PROC.genorder, pid2);
    check('G', 'G8-no-paymentterm', 'a project without a payment term (C_Order.C_PaymentTerm_ID is mandatory) is refused the same way', !r2.ok && r2.summary === 'Could not create Order' && r2.nops === 0, { s: r2.summary });
  });
  guard('G', 'G3', 'G3 a Service Charge project (category S): the Java saves the order FIRST and then throws - the process fails and the order is rolled back', function () {
    var pid = mkProject({ projectcategory: 'S' }); mkLine(pid, { line: 10, m_product_id: 123, plannedqty: 1, plannedprice: 5 });
    var seq0 = seqNext(WI.s), r = run(PROC.genorder, pid);
    check('G', 'G3-service', 'fails with "Service Charge Projects are on the TODO List" (:83-87); no order for the project survives; no op committed; the doc sequence did not move (the Trx was rolled back)',
      !r.ok && r.summary === 'Service Charge Projects are on the TODO List' && one('SELECT count(*) AS n FROM c_order WHERE c_project_id=?', [pid]).n === 0 && r.nops === 0 && Number(seqNext(WI.s).n) === Number(seq0.n), { ok: r.ok, s: r.summary, nops: r.nops });
  });
  guard('G', 'G4', 'G4 no lines: an order with 0 lines, message (0)', function () {
    var pid = mkProject({}), r = run(PROC.genorder, pid), o = one('SELECT * FROM c_order WHERE c_project_id=?', [pid]);
    check('G', 'G4-empty', 'the order header is saved before the lines (:75-76): an empty project gives an order with 0 lines and the answer "(0)"', r.ok && !!o && olines(o.c_order_id).length === 0 && /\(0\)$/.test(r.summary || ''), { s: r.summary });
  });
  guard('G', 'G6', 'G6 getLines has no IsActive filter: an inactive project line is ordered too', function () {
    var pid = mkProject({}); mkLine(pid, { line: 10, m_product_id: 137, plannedqty: 2, plannedprice: 0 }); var l2 = mkLine(pid, { line: 20, m_product_id: 137, plannedqty: 3, plannedprice: 0 });
    commit(function (trx) { var sv = ML.save(trx, 'c_projectline', trx.get('c_projectline', l2), { isactive: 'N' }); return { ok: sv.ok, error: sv.error }; });
    var r = run(PROC.genorder, pid), o = one('SELECT * FROM c_order WHERE c_project_id=?', [pid]);
    check('G', 'G6-inactive', 'both lines (one inactive) are on the order, qty 2 and 3', r.ok && !!o && olines(o.c_order_id).length === 2 && olines(o.c_order_id).map(function (x) { return num(x.qtyordered); }).join() === '2,3', { s: r.summary, ls: o && olines(o.c_order_id).length });
  });
  guard('G', 'G7', 'G7 a product that is not on the project price list: the line save is refused (ProductNotOnPriceListException, MOrderLine.java:846-849), the line is not counted', function () {
    var np = one("SELECT m_product_id AS p FROM m_product pr WHERE ad_client_id=11 AND isactive='Y' AND NOT EXISTS (SELECT 1 FROM m_productprice x WHERE x.m_pricelist_version_id=? AND x.m_product_id=pr.m_product_id) ORDER BY m_product_id", [pv]);
    check('G', 'G7-population', 'the seed has a product with no price on the version', !!np, {});
    if (!np) return;
    var pid = mkProject({}); mkLine(pid, { line: 10, m_product_id: 137, plannedqty: 1, plannedprice: 0 }); mkLine(pid, { line: 20, m_product_id: np.p, plannedqty: 1, plannedprice: 0 });
    var r = run(PROC.genorder, pid), o = one('SELECT * FROM c_order WHERE c_project_id=?', [pid]), ls = o ? olines(o.c_order_id) : [];
    check('G', 'G7-unpriced', 'the order has the one priced line only and the answer says (1)', r.ok && ls.length === 1 && Number(ls[0].m_product_id) === 137 && /\(1\)$/.test(r.summary || ''), { s: r.summary, n: ls.length });
  });

  // ═══ PH ProjectPhaseGenOrder (regression of the shared helpers) ═══
  guard('PH', 'PH1', 'PH1 a phase with lines and a task: order description = project name + " - " + phase name, lines then tasks', function () {
    var pid = mkProject({}), ph = mk('c_projectphase', { c_project_id: pid, name: 'Ph-A', seqno: 10 });
    mkLine(pid, { line: 10, m_product_id: 123, plannedqty: 4, plannedprice: 0, invoicedqty: 1, c_projectphase_id: ph, description: 'pl' });
    var tk = mk('c_projecttask', { c_projectphase_id: ph, name: 'Tk-A', seqno: 5, m_product_id: 137, qty: 4, description: 'td' });
    var pr = one('SELECT * FROM c_project WHERE c_project_id=?', [pid]), r = run(PROC.phasegen, ph), o = one('SELECT * FROM c_order WHERE c_project_id=?', [pid]), ls = o ? olines(o.c_order_id) : [];
    check('PH', 'PH1-run', 'the process ran ok and made one order (answer ends (2))', r.ok && !!o && /\(2\)$/.test(r.summary || ''), { ok: r.ok, s: r.summary });
    if (!o) return;
    check('PH', 'PH1-header', 'description = "' + pr.name + ' - Ph-A", Sales On Credit, price list ' + listId, o.description === pr.name + ' - Ph-A' && o.issotrx === 'Y' && Number(o.c_doctypetarget_id) === Number(WI.d) && Number(o.m_pricelist_id) === Number(listId), { d: o.description });
    var a = ls.filter(function (x) { return Number(x.m_product_id) === 123; })[0] || {}, b = ls.filter(function (x) { return Number(x.m_product_id) === 137; })[0] || {};
    check('PH', 'PH1-line', 'project line: Qty 4-1 = 3, price = list price ' + P123.s + ', LineNetAmt ' + r2(3 * P123.s) + ' (setPrice() then setDiscount())', num(a.qtyordered) === 3 && num(a.priceactual) === Number(P123.s) && num(a.linenetamt) === r2(3 * P123.s) && a.description === 'pl', { a: a });
    check('PH', 'PH1-task', 'task line: Line = SeqNo 5, Qty = task qty 4, price = list price ' + P137.s + ', LineNetAmt ' + r2(4 * P137.s) + ', description "Tk-A - td"', num(b.qtyordered) === 4 && Number(b.line) === 5 && num(b.priceactual) === Number(P137.s) && num(b.linenetamt) === r2(4 * P137.s) && b.description === 'Tk-A - td', { b: b });
  });
  guard('PH', 'PH2', 'PH2 a phase with its own product: ONE order line, price = the phase\'s PriceActual when non-zero', function () {
    var pid = mkProject({}), ph = mk('c_projectphase', { c_project_id: pid, name: 'Ph-B', seqno: 20, m_product_id: 137, qty: 2, priceactual: 7.5, description: 'pd' });
    var r = run(PROC.phasegen, ph), o = one('SELECT * FROM c_order WHERE c_project_id=?', [pid]), ls = o ? olines(o.c_order_id) : [];
    check('PH', 'PH2-phase-product', 'one line: Line = phase SeqNo 20, Qty 2, price 7.5 (override), LineNetAmt 15, answer (1)', r.ok && ls.length === 1 && Number(ls[0].line) === 20 && num(ls[0].qtyordered) === 2 && num(ls[0].priceactual) === 7.5 && num(ls[0].linenetamt) === 15 && /\(1\)$/.test(r.summary || ''), { s: r.summary, l: ls[0] });
    var n0 = one('SELECT count(*) AS n FROM c_order').n, pid2 = mkProject({ m_warehouse_id: null }), ph2 = mk('c_projectphase', { c_project_id: pid2, name: 'Ph-C', seqno: 1 }), r2_ = run(PROC.phasegen, ph2);
    check('PH', 'PH2-refusal', 'a phase of a project without a warehouse: "Project has no Warehouse" through the SHARED getProject, no order', !r2_.ok && r2_.summary === 'Project has no Warehouse' && one('SELECT count(*) AS n FROM c_order').n === n0, { s: r2_.summary });
  });

  // ═══ O Generate PO (ProjectGenPO.java) ═══
  var poBy = function (prod) { return one("SELECT * FROM m_product_po WHERE m_product_id=? AND isactive='Y' ORDER BY iscurrentvendor DESC", [prod]); };
  var V121 = poBy(133), V121b = poBy(134), V120 = poBy(138);
  var noPO = one("SELECT m_product_id AS p FROM m_product pr WHERE ad_client_id=11 AND isactive='Y' AND NOT EXISTS (SELECT 1 FROM m_product_po x WHERE x.m_product_id=pr.m_product_id AND x.isactive='Y') AND EXISTS (SELECT 1 FROM m_productprice y WHERE y.m_pricelist_version_id=? AND y.m_product_id=pr.m_product_id) ORDER BY m_product_id", [pv]);
  var anyOrder = one('SELECT MIN(c_order_id) AS o FROM c_order').o;
  function pOrder(plId) { var pl = one('SELECT c_orderpo_id AS o FROM c_projectline WHERE c_projectline_id=?', [plId]); return pl && pl.o ? orderOf(pl.o) : null; }
  guard('O', 'O1', 'O1 consolidated run over six lines', function () {
    check('O', 'population', 'the seed holds the vendors the case needs: 133 and 134 share a vendor, 138 has another, and a priced product with no PO record exists', !!V121 && !!V121b && !!V120 && V121.c_bpartner_id === V121b.c_bpartner_id && V121.c_bpartner_id !== V120.c_bpartner_id && !!noPO, { v: [V121 && V121.c_bpartner_id, V121b && V121b.c_bpartner_id, V120 && V120.c_bpartner_id], noPO: noPO });
    if (!V121 || !V121b || !V120 || !noPO) return;
    var pid = mkProject({});
    var A = mkLine(pid, { line: 10, m_product_id: 133, plannedqty: 4, description: 'a' }), B = mkLine(pid, { line: 20, m_product_id: 134, plannedqty: 2, description: 'b' }), C = mkLine(pid, { line: 30, m_product_id: 138, plannedqty: 6, description: 'c' });
    var D = mkLine(pid, { line: 40, description: 'd-noprod' }), E = mkLine(pid, { line: 50, m_product_id: 133, plannedqty: 1, description: 'e', c_orderpo_id: anyOrder }), G = mkLine(pid, { line: 60, m_product_id: noPO.p, plannedqty: 1, description: 'g' });
    var F = mkLine(pid, { line: 70, m_product_id: 138, plannedqty: 9, description: 'f-inactive' });
    commit(function (trx) { var sv = ML.save(trx, 'c_projectline', trx.get('c_projectline', F), { isactive: 'N' }); return { ok: sv.ok, error: sv.error }; });
    var seq0 = seqNext(POO.s), pl0 = {}; [D, E, F, G].forEach(function (id) { pl0[id] = J(one('SELECT * FROM c_projectline WHERE c_projectline_id=?', [id])); });
    var r = run(PROC.genpo, 0, { C_Project_ID: pid }), orders = q('SELECT * FROM c_order WHERE c_project_id=? ORDER BY c_order_id', [pid]);
    if (process.env.PROJPROCS_DEBUG) { orders.forEach(function (o) { say('  §DBG order ' + J(o)); olines(o.c_order_id).forEach(function (l) { say('  §DBG   line ' + J(l)); }); }); }
    say('  §PROJPROCS-O1 ok=' + r.ok + ' summary=' + J(r.summary) + ' orders=' + J(orders.map(function (o) { return [o.c_order_id, o.documentno, o.c_bpartner_id, o.issotrx]; })) + ' logs=' + J(r.logs.map(function (l) { return [l.id, l.msg, l.tableId, l.recordId]; })));
    check('O', 'O1-run', 'the process ran ok and the answer is empty (ProjectGenPO.java :119 returns "")', r.ok && (r.summary === '' || r.summary == null), { ok: r.ok, s: r.summary });
    check('O', 'O1-two-pos', 'consolidation: 2 purchase orders - one per vendor (vendor of 133/134 and vendor of 138) - not one per line', orders.length === 2 && orders.map(function (o) { return Number(o.c_bpartner_id); }).sort().join() === [V121.c_bpartner_id, V120.c_bpartner_id].map(Number).sort().join(), { n: orders.length });
    var o1 = orders.filter(function (o) { return Number(o.c_bpartner_id) === Number(V121.c_bpartner_id); })[0] || {}, o2 = orders.filter(function (o) { return Number(o.c_bpartner_id) === Number(V120.c_bpartner_id); })[0] || {};
    var wl1 = poListOf(V121.c_bpartner_id) || Number(listId), wl2 = poListOf(V120.c_bpartner_id) || Number(listId);
    check('O', 'O1-header', 'each PO is a purchase order (IsSOTrx N) on the default POO type ' + POO.d + ', carries the project, the project warehouse, the vendor, its price list = the vendor\'s PO price list when set else the project\'s (' + wl1 + ' / ' + wl2 + '), draft; DocumentNos run on the POO sequence in creation order (A creates the first)',
      orders.length === 2 && orders.every(function (o) { return o.issotrx === 'N' && Number(o.c_doctypetarget_id) === Number(POO.d) && Number(o.c_project_id) === pid && Number(o.m_warehouse_id) === 103 && o.docstatus === 'DR' && o.description === one('SELECT name AS n FROM c_project WHERE c_project_id=?', [pid]).n; })
      && Number(o1.m_pricelist_id) === wl1 && Number(o2.m_pricelist_id) === wl2 && Number(o1.c_order_id) < Number(o2.c_order_id) && o1.documentno === String(seq0.p || '') + String(seq0.n) && o2.documentno === String(seq0.p || '') + String(Number(seq0.n) + Number(seq0.i)), { o1: o1.documentno, o2: o2.documentno, seq0: seq0, pl: [o1.m_pricelist_id, o2.m_pricelist_id] });
    var l1 = olines(o1.c_order_id), l2 = olines(o2.c_order_id), p133 = priceOnList(wl1, 133, o1.dateordered), p134 = priceOnList(wl1, 134, o1.dateordered), p138 = priceOnList(wl2, 138, o2.dateordered);
    check('O', 'O1-lines', 'vendor 1\'s PO has 2 lines (133 qty 4 at ' + (p133 && p133.s) + ', 134 qty 2 at ' + (p134 && p134.s) + ' - the price list of ITS order), vendor 2\'s PO has 1 (138 qty 6 at ' + (p138 && p138.s) + '); line description from the project line; LineNetAmt = qty x price; a tax set',
      !!p133 && !!p134 && !!p138 && l1.length === 2 && l2.length === 1 && Number(l1[0].m_product_id) === 133 && num(l1[0].qtyordered) === 4 && num(l1[0].priceactual) === Number(p133.s) && num(l1[0].linenetamt) === r2(4 * p133.s) && l1[0].description === 'a'
      && Number(l1[1].m_product_id) === 134 && num(l1[1].qtyordered) === 2 && num(l1[1].priceactual) === Number(p134.s) && l1[1].description === 'b' && Number(l2[0].m_product_id) === 138 && num(l2[0].qtyordered) === 6 && num(l2[0].priceactual) === Number(p138.s) && !!l1[0].c_tax_id, { l1: l1.map(function (x) { return [x.m_product_id, x.qtyordered, x.priceactual]; }), l2: l2.map(function (x) { return [x.m_product_id, x.qtyordered, x.priceactual]; }), p: [p133, p134, p138] });
    var back = function (id) { return one('SELECT c_orderpo_id AS o FROM c_projectline WHERE c_projectline_id=?', [id]).o; };
    check('O', 'O1-writeback', 'the ordered project lines A,B point at vendor 1\'s PO and C at vendor 2\'s (C_OrderPO_ID, :221-222)', Number(back(A)) === Number(o1.c_order_id) && Number(back(B)) === Number(o1.c_order_id) && Number(back(C)) === Number(o2.c_order_id), { A: back(A), B: back(B), C: back(C) });
    check('O', 'O1-skipped', 'lines D (no product), E (already ordered), G (no PO record) and the inactive F are untouched, row for row', [D, E, F, G].every(function (id) { return J(one('SELECT * FROM c_projectline WHERE c_projectline_id=?', [id])) === pl0[id]; }), {});
    var msgs = r.logs.map(function (l) { return Number(l.id) + ':' + l.msg; });
    check('O', 'O1-skip-messages', 'the skips are logged by project line number with legacy\'s text: 40 "Line has no Product", 50 "Line was ordered previously", 60 "Product has no PO record"; the inactive line 70 says nothing (the loop filters IsActive, :108)',
      msgs.indexOf('40:Line has no Product') >= 0 && msgs.indexOf('50:Line was ordered previously') >= 0 && msgs.indexOf('60:Product has no PO record') >= 0 && !msgs.some(function (m) { return /^70:/.test(m); }), { msgs: msgs });
    var bl = r.logs.filter(function (l) { return Number(l.tableId) === 259; });
    check('O', 'O1-buffer-log', 'one log row per created order line (3), each "Purchase Order:<DocumentNo>" (Msg.getElement(lang, C_Order_ID, false) = the element PO name; MEASURED on :8108 SP1) of the order that line is on, on table C_Order (259), the record id = the log id = that order',
      bl.length === 3 && bl.every(function (l) { return /^Purchase Order:\d+$/.test(l.msg); }) && bl.map(function (l) { return /:(\d+)$/.exec(l.msg)[1]; }).sort().join() === [o1.documentno, o1.documentno, o2.documentno].sort().join() && bl.every(function (l) { return String(l.id) === String(l.recordId); }), { bl: bl.map(function (l) { return l.msg; }) });
    // O6 second run
    var n0 = one('SELECT count(*) AS n FROM c_order').n, r6 = run(PROC.genpo, 0, { C_Project_ID: pid }), m6 = r6.logs.map(function (l) { return Number(l.id) + ':' + l.msg; });
    check('O', 'O6-rerun', 'a second run orders nothing: no new PO; A,B,C are "Line was ordered previously"', r6.ok && one('SELECT count(*) AS n FROM c_order').n === n0 && ['10', '20', '30'].every(function (n) { return m6.indexOf(n + ':Line was ordered previously') >= 0; }), { m6: m6 });
  });
  guard('O', 'O2', 'O2 ConsolidateDocument = N: one PO per line', function () {
    if (!V121 || !V121b) return;
    var pid = mkProject({}); mkLine(pid, { line: 10, m_product_id: 133, plannedqty: 1 }); mkLine(pid, { line: 20, m_product_id: 134, plannedqty: 1 });
    var r = run(PROC.genpo, 0, { C_Project_ID: pid, ConsolidateDocument: 'N' }), orders = q('SELECT * FROM c_order WHERE c_project_id=?', [pid]);
    check('O', 'O2-no-consolidate', 'two lines of the same vendor give 2 POs of 1 line each', r.ok && orders.length === 2 && orders.every(function (o) { return olines(o.c_order_id).length === 1; }), { n: orders.length });
  });
  guard('O', 'O3', 'O3 a single project line, and a phase', function () {
    if (!V121 || !V121b || !V120) return;
    var pid = mkProject({}), ph = mk('c_projectphase', { c_project_id: pid, name: 'Ph-O', seqno: 1 });
    var a = mkLine(pid, { line: 10, m_product_id: 133, plannedqty: 1 }), b = mkLine(pid, { line: 20, m_product_id: 134, plannedqty: 2, c_projectphase_id: ph }), c = mkLine(pid, { line: 30, m_product_id: 138, plannedqty: 3, c_projectphase_id: ph });
    var r = run(PROC.genpo, 0, { C_Project_ID: pid, C_ProjectLine_ID: a }), ords = q('SELECT * FROM c_order WHERE c_project_id=?', [pid]), back = function (id) { return one('SELECT c_orderpo_id AS o FROM c_projectline WHERE c_projectline_id=?', [id]).o; };
    check('O', 'O3-line', 'C_ProjectLine_ID alone orders only that line: 1 PO, line a ordered, b and c not', r.ok && ords.length === 1 && !!back(a) && !back(b) && !back(c), { n: ords.length });
    var r2_ = run(PROC.genpo, 0, { C_Project_ID: pid, C_ProjectPhase_ID: ph }), ords2 = q('SELECT * FROM c_order WHERE c_project_id=?', [pid]);
    check('O', 'O3-phase', 'C_ProjectPhase_ID orders the phase\'s lines only: b and c ordered (2 more POs, two vendors), a untouched by this run (still its first PO)', r2_.ok && ords2.length === 3 && !!back(b) && !!back(c), { n: ords2.length });
  });
  guard('O', 'O4', 'O4 the purchase price chain when the price list gives 0 (ProjectGenPO.java :196-218): PricePO, else PriceLastPO, else PriceList, converted to the order currency', function () {
    // vendor 1 (133/134) orders on the project's list (no PO price list): the price row of 133 on its version is set to 0 (found, but 0)
    var vl = poListOf(V121 && V121.c_bpartner_id), ok = !!V121 && !!V121b && vl == null && !!priceOf(133) && !!priceOf(134);
    check('O', 'O4-population', 'vendor of 133/134 has no PO price list of its own (orders stay on the project list), and 133 and 134 are priced on the version', ok, { vl: vl });
    if (!ok) return;
    var row133 = one('SELECT * FROM m_productprice WHERE m_pricelist_version_id=? AND m_product_id=133', [pv]);
    var dt = one('SELECT isnopricelistcheck AS x FROM c_doctype WHERE c_doctype_id=?', [POO.d]).x, po133 = one('SELECT * FROM m_product_po WHERE m_product_id=133 AND c_bpartner_id=?', [V121.c_bpartner_id]);
    // O5: a product priced on NO list of the chain (the pricing engine falls back to the base price list, so removing a row is not enough) given a PO record of vendor 1 by this fixture
    var np = one("SELECT m_product_id AS p FROM m_product pr WHERE ad_client_id=11 AND isactive='Y' AND NOT EXISTS (SELECT 1 FROM m_productprice x WHERE x.m_product_id=pr.m_product_id) ORDER BY m_product_id");
    check('O', 'O5-population', 'the seed has a product priced on no price list at all (the "not on the price list" case is not vacuous)', !!np, {});
    if (!np) return;
    db.run("INSERT INTO m_product_po (m_product_id, c_bpartner_id, ad_client_id, ad_org_id, isactive, iscurrentvendor, c_uom_id, c_currency_id, pricelist, pricepo, pricelastpo, vendorproductno, discontinued) VALUES (?,?,11,0,'Y','Y',100,100,6,5,4,'FX','N')", [np.p, V121.c_bpartner_id]);
    var pid5 = mkProject({}); mkLine(pid5, { line: 10, m_product_id: np.p, plannedqty: 1 });
    var n0 = one('SELECT count(*) AS n FROM c_order').n, r5 = run(PROC.genpo, 0, { C_Project_ID: pid5 });
    check('O', 'O5-not-on-list', 'a product not on the price list, doc type IsNoPriceListCheck=N: the line save is refused (MOrderLine.java:846-849) and saveEx throws - the process FAILS and nothing is kept (no PO, no write-back)', !r5.ok && r5.nops === 0 && one('SELECT count(*) AS n FROM c_order').n === n0 && !one('SELECT c_orderpo_id AS o FROM c_projectline WHERE c_project_id=?', [pid5]).o, { ok: r5.ok, s: r5.summary });
    db.run('UPDATE c_doctype SET isnopricelistcheck=\'Y\' WHERE c_doctype_id=?', [POO.d]);
    var pid5b = mkProject({}); mkLine(pid5b, { line: 10, m_product_id: np.p, plannedqty: 1 });
    var r5b = run(PROC.genpo, 0, { C_Project_ID: pid5b }), o5b = one('SELECT * FROM c_order WHERE c_project_id=?', [pid5b]), l5b = o5b ? olines(o5b.c_order_id) : [];
    check('O', 'O5-no-check', 'the same product with a doc type that has IsNoPriceListCheck=Y is accepted: the list gives 0, so the price comes from the PO record (PricePO 5)', r5b.ok && l5b.length === 1 && num(l5b[0].priceactual) === 5, { s: r5b.summary, l: l5b[0] && l5b[0].priceactual });
    db.run('DELETE FROM m_product_po WHERE m_product_id=? AND c_bpartner_id=? AND vendorproductno=\'FX\'', [np.p, V121.c_bpartner_id]);
    db.run('UPDATE m_productprice SET pricestd=0, pricelist=0, pricelimit=0 WHERE m_pricelist_version_id=? AND m_product_id=133', [pv]);
    var steps = [['PricePO', { pricepo: 12.5, pricelastpo: 9, pricelist: 7 }, 12.5], ['PriceLastPO', { pricepo: 0, pricelastpo: 9, pricelist: 7 }, 9], ['PriceList', { pricepo: 0, pricelastpo: 0, pricelist: 7 }, 7]];
    steps.forEach(function (st) {
      db.run('UPDATE m_product_po SET pricepo=?, pricelastpo=?, pricelist=? WHERE m_product_id=133 AND c_bpartner_id=?', [st[1].pricepo, st[1].pricelastpo, st[1].pricelist, V121.c_bpartner_id]);
      var pid = mkProject({}); mkLine(pid, { line: 10, m_product_id: 133, plannedqty: 2 });
      var r = run(PROC.genpo, 0, { C_Project_ID: pid }), o = one('SELECT * FROM c_order WHERE c_project_id=?', [pid]), ls = o ? olines(o.c_order_id) : [];
      check('O', 'O4-' + st[0], 'list price 0, order in the list currency: the PO price is ' + st[0] + ' = ' + st[2] + '; PriceEntered the same; LineNetAmt = 2 x ' + st[2], r.ok && ls.length === 1 && num(ls[0].priceactual) === st[2] && num(ls[0].priceentered) === st[2] && num(ls[0].linenetamt) === 2 * st[2], { s: r.summary, l: ls[0] && [ls[0].priceactual, ls[0].priceentered, ls[0].linenetamt] });
    });
    // currency: the PO record in currency 102, converted with MConversionRate.convert (the seed's active 102 -> 100 rate)
    var rate = one("SELECT multiplyrate AS m FROM c_conversion_rate WHERE c_currency_id=102 AND c_currency_id_to=100 AND isactive='Y' ORDER BY validfrom DESC");
    check('O', 'O4-rate-population', 'the seed has an active 102 -> 100 rate (the conversion case is not vacuous)', !!rate, {});
    if (rate) {
      db.run('UPDATE m_product_po SET pricepo=10, pricelastpo=0, pricelist=0, c_currency_id=102 WHERE m_product_id=133 AND c_bpartner_id=?', [V121.c_bpartner_id]);
      var pidc = mkProject({}); mkLine(pidc, { line: 10, m_product_id: 133, plannedqty: 1 });
      var rc = run(PROC.genpo, 0, { C_Project_ID: pidc }), oc = one('SELECT * FROM c_order WHERE c_project_id=?', [pidc]), lc = oc ? olines(oc.c_order_id) : [], want = r2(10 * Number(rate.m));
      check('O', 'O4-currency', 'PricePO 10 in currency 102, order in 100: price = 10 x rate ' + rate.m + ' rounded HALF_UP to the currency precision = ' + want, rc.ok && lc.length === 1 && num(lc[0].priceactual) === want, { s: rc.summary, got: lc[0] && lc[0].priceactual, want: want });
    }
    // restore the seed rows this case changed
    db.run('UPDATE c_doctype SET isnopricelistcheck=? WHERE c_doctype_id=?', [dt || 'N', POO.d]);
    db.run('UPDATE m_productprice SET pricestd=?, pricelist=?, pricelimit=? WHERE m_pricelist_version_id=? AND m_product_id=133', [row133.pricestd, row133.pricelist, row133.pricelimit, pv]);
    db.run('UPDATE m_product_po SET pricepo=?, pricelastpo=?, pricelist=?, c_currency_id=? WHERE m_product_id=133 AND c_bpartner_id=?', [po133.pricepo, po133.pricelastpo, po133.pricelist, po133.c_currency_id, V121.c_bpartner_id]);
  });

  // ═══ C Close (ProjectClose.java) ═══
  guard('C', 'C1', 'C1 close: every line (active or not) and the project become Processed', function () {
    var pid = mkProject({}), a = mkLine(pid, { line: 10, m_product_id: 123, plannedqty: 2, plannedprice: 5 }), b = mkLine(pid, { line: 20, m_product_id: 138, plannedqty: 3, plannedprice: 4 }), c = mkLine(pid, { line: 30, m_product_id: 137, plannedqty: 1, plannedprice: 1 });
    commit(function (trx) { var sv = ML.save(trx, 'c_projectline', trx.get('c_projectline', c), { isactive: 'N' }); return { ok: sv.ok, error: sv.error }; });
    var P0 = one('SELECT * FROM c_project WHERE c_project_id=?', [pid]), L0 = q('SELECT * FROM c_projectline WHERE c_project_id=? ORDER BY c_projectline_id', [pid]);
    check('C', 'population', 'the fixture is not empty: 3 lines (one inactive), none processed, project open', L0.length === 3 && L0.every(function (x) { return x.processed === 'N'; }) && P0.processed === 'N', { n: L0.length });
    var r = run(PROC.close, pid), P1 = one('SELECT * FROM c_project WHERE c_project_id=?', [pid]), L1 = q('SELECT * FROM c_projectline WHERE c_project_id=? ORDER BY c_projectline_id', [pid]);
    function diffCols(x, y) { return Object.keys(x).filter(function (kk) { return String(x[kk]) !== String(y[kk]); }).sort(); }
    say('  §PROJPROCS-C1 ok=' + r.ok + ' summary=' + J(r.summary) + ' project cols changed=' + J(diffCols(P0, P1)) + ' lines changed=' + J(L0.map(function (x, i) { return diffCols(x, L1[i]); })));
    check('C', 'C1-closed', 'the process ran ok (answer empty); all 3 lines Processed=Y (the inactive one too) and the project Processed=Y', r.ok && (r.summary === '' || r.summary == null) && L1.length === 3 && L1.every(function (x) { return x.processed === 'Y'; }) && P1.processed === 'Y', { ok: r.ok, s: r.summary, lp: L1.map(function (x) { return x.processed; }), pp: P1.processed });
    var allowed = { processed: 1, updated: 1, updatedby: 1 };
    check('C', 'C1-only-processed', 'nothing else changes: on the project and on each line the changed columns are within {Processed, Updated, UpdatedBy} (the header sums recompute to the same values) - and Processed changed', diffCols(P0, P1).every(function (cc) { return allowed[cc]; }) && diffCols(P0, P1).indexOf('processed') >= 0 && L0.every(function (x, i) { var d = diffCols(x, L1[i]); return d.every(function (cc) { return allowed[cc]; }) && d.indexOf('processed') >= 0; }), { p: diffCols(P0, P1), l: L0.map(function (x, i) { return diffCols(x, L1[i]); }) });
    var r2_ = run(PROC.close, pid), P2 = one('SELECT * FROM c_project WHERE c_project_id=?', [pid]), L2 = q('SELECT * FROM c_projectline WHERE c_project_id=? ORDER BY c_projectline_id', [pid]);
    check('C', 'C2-again', 'closing a closed project succeeds again (the Java has no refusal) and leaves it closed with the same values', r2_.ok && P2.processed === 'Y' && L2.every(function (x) { return x.processed === 'Y'; }) && diffCols(P1, P2).every(function (cc) { return allowed[cc]; }), { ok: r2_.ok, s: r2_.summary });
  });
  guard('C', 'C3', 'C3 a project with no lines closes; C4 an id that is no project is refused with nothing written', function () {
    var pid = mkProject({}), r = run(PROC.close, pid);
    check('C', 'C3-no-lines', 'the project is Processed with 0 lines', r.ok && one('SELECT processed AS p FROM c_project WHERE c_project_id=?', [pid]).p === 'Y', { s: r.summary });
    var n0 = one("SELECT count(*) AS n FROM c_project WHERE processed='Y'").n, r4 = run(PROC.close, 987654321);
    check('C', 'C4-unknown', 'unknown id (MEASURED ON LEGACY, SC2): the Java makes a NEW empty MProject (client 0) and project.saveEx() on a session of client 11 is refused by PO.checkCrossTenant: "Cross tenant PO writing request detected from session  for table C_Project Record_ID=0"; no op committed, no project changed', !r4.ok && /^Cross tenant PO writing request detected from session .* for table C_Project Record_ID=0$/.test(r4.summary || '') && r4.nops === 0 && one("SELECT count(*) AS n FROM c_project WHERE processed='Y'").n === n0, { s: r4.summary });
  });

  // ═══ K Copy Details (CopyFromProject.java / MProject.copyDetailsFrom) ═══
  var dummyPhase = one('SELECT c_phase_id AS p FROM c_phase ORDER BY c_phase_id').p;
  function mkSource() {
    var s = mkProject({ name: 'K source' });
    var l1 = mkLine(s, { line: 10, m_product_id: 123, plannedqty: 10, plannedprice: 60, description: 'k-l1', invoicedqty: 2, invoicedamt: 120, c_orderpo_id: anyOrder, processed: 'Y' });
    var l2 = mkLine(s, { line: 20, m_product_id: 138, plannedqty: 3, plannedprice: 4, description: 'k-l2' });
    var p1 = mk('c_projectphase', { c_project_id: s, name: 'K-Ph1', seqno: 10, description: 'ph1d', qty: 3 }), p2 = mk('c_projectphase', { c_project_id: s, name: 'K-Ph2', seqno: 20, c_phase_id: dummyPhase, qty: 1 });
    var t1 = mk('c_projecttask', { c_projectphase_id: p1, name: 'K-T1', seqno: 1, qty: 2, description: 't1d' }), t2 = mk('c_projecttask', { c_projectphase_id: p2, name: 'K-T2', seqno: 1, qty: 1 });
    var lp = mkLine(s, { line: 30, m_product_id: 137, plannedqty: 5, plannedprice: 2, description: 'k-phase-line', c_projectphase_id: p1 });
    var lt = mkLine(s, { line: 40, m_product_id: 137, plannedqty: 6, plannedprice: 2, description: 'k-task-line', c_projectphase_id: p1, c_projecttask_id: t1, invoicedqty: 1 });
    return { s: s, l1: l1, l2: l2, p1: p1, p2: p2, t1: t1, t2: t2, lp: lp, lt: lt };
  }
  function proj(id) { return { lines: q('SELECT * FROM c_projectline WHERE c_project_id=? ORDER BY line, c_projectline_id', [id]), phases: q('SELECT * FROM c_projectphase WHERE c_project_id=? ORDER BY seqno', [id]),
    tasks: q('SELECT t.* FROM c_projecttask t JOIN c_projectphase p ON p.c_projectphase_id=t.c_projectphase_id WHERE p.c_project_id=? ORDER BY t.seqno, t.c_projecttask_id', [id]) }; }
  guard('K', 'K1', 'K1 copy details into an empty target', function () {
    var src = mkSource(), tgt = mkProject({ name: 'K target' }), S0 = proj(src.s);
    check('K', 'population', 'the source is not empty: 4 lines (2 plain, 1 phase line, 1 task line), 2 phases, 2 tasks', S0.lines.length === 4 && S0.phases.length === 2 && S0.tasks.length === 2, { l: S0.lines.length, p: S0.phases.length, t: S0.tasks.length });
    var r = run(PROC.copy, tgt, { C_Project_ID: src.s }), T = proj(tgt), S1 = proj(src.s);
    say('  §PROJPROCS-K1 ok=' + r.ok + ' summary=' + J(r.summary) + ' target lines=' + T.lines.length + ' phases=' + T.phases.length + ' tasks=' + T.tasks.length);
    check('K', 'K1-count', 'the answer is "@Copied@=8" = 2 plain lines + 2 phases + 2 tasks + 1 task line + 1 phase line (MProject.java:267-274, 360), translated "Copied=8"', r.ok && /^.*=8$/.test(r.summary || '') && /Copied/i.test(r.summary || ''), { s: r.summary });
    check('K', 'K1-tables', 'target rows: 2 plain lines + 1 phase line + 1 task line = 4 lines, 2 phases, 2 tasks; the SOURCE is unchanged', T.lines.length === 4 && T.phases.length === 2 && T.tasks.length === 2 && J(S1) === J(S0), { l: T.lines.length, p: T.phases.length, t: T.tasks.length });
    var plain = T.lines.filter(function (x) { return !x.c_projectphase_id && !x.c_projecttask_id; }), byDesc = function (d) { return T.lines.filter(function (x) { return x.description === d; })[0] || {}; };
    var c1 = byDesc('k-l1'), c2 = byDesc('k-l2'), cp = byDesc('k-phase-line'), ct = byDesc('k-task-line');
    check('K', 'K1-plain-lines', 'plain lines: product/qty/price/description copied; Invoiced Qty/Amt 0, C_OrderPO_ID and C_Order_ID empty, Processed N (MProject.copyLinesFrom :297-301), project = target, a new key',
      plain.length === 2 && Number(c1.c_project_id) === tgt && Number(c1.m_product_id) === 123 && num(c1.plannedqty) === 10 && num(c1.plannedprice) === 60 && num(c1.invoicedqty) === 0 && num(c1.invoicedamt) === 0 && !c1.c_orderpo_id && !c1.c_order_id && c1.processed === 'N' && Number(c1.c_projectline_id) !== src.l1
      && Number(c2.m_product_id) === 138 && num(c2.plannedqty) === 3, { c1: c1 });
    var pl1 = one('SELECT pricelimit AS l FROM m_productprice WHERE m_pricelist_version_id=? AND m_product_id=123', [pv]), pl2 = one('SELECT pricelimit AS l FROM m_productprice WHERE m_pricelist_version_id=? AND m_product_id=138', [pv]);
    check('K', 'K1-margin', 'MEASURED ON LEGACY (SK1): a copied line is saved through MProjectLine.beforeSave, which sets PlannedMarginAmt = (PlannedPrice - the price LIMIT on the project price list) x PlannedQty (getLimitPrice :170-182): Oak (60 - ' + pl1.l + ') x 10 = ' + r2((60 - pl1.l) * 10) + ', Hoe (4 - ' + pl2.l + ') x 3 = ' + r2((4 - pl2.l) * 3),
      num(c1.plannedmarginamt) === r2((60 - pl1.l) * 10) && num(c2.plannedmarginamt) === r2((4 - pl2.l) * 3), { c1: c1.plannedmarginamt, c2: c2.plannedmarginamt });
    var ph1 = T.phases.filter(function (x) { return x.name === 'K-Ph1'; })[0] || {}, ph2 = T.phases.filter(function (x) { return x.name === 'K-Ph2'; })[0] || {};
    check('K', 'K1-phases', 'phases: name/seqno/description/qty/C_Phase_ID copied, project = target, new keys, IsComplete N, C_Order_ID empty', Number(ph1.c_project_id) === tgt && ph1.description === 'ph1d' && num(ph1.qty) === 3 && Number(ph1.seqno) === 10 && ph1.iscomplete === 'N' && !ph1.c_order_id && Number(ph2.c_phase_id) === Number(dummyPhase) && Number(ph1.c_projectphase_id) !== src.p1, { ph1: ph1 });
    var t1 = T.tasks.filter(function (x) { return x.name === 'K-T1'; })[0] || {}, t2 = T.tasks.filter(function (x) { return x.name === 'K-T2'; })[0] || {};
    check('K', 'K1-tasks', 'tasks: each under the COPIED phase of the same name (not the source phase), name/seqno/qty/description copied', Number(t1.c_projectphase_id) === Number(ph1.c_projectphase_id) && Number(t2.c_projectphase_id) === Number(ph2.c_projectphase_id) && num(t1.qty) === 2 && t1.description === 't1d' && Number(t1.c_projecttask_id) !== src.t1, { t1: t1 });
    check('K', 'K1-phase-line', 'the phase line: project = target, phase = the copied phase, NO task, values copied', Number(cp.c_project_id) === tgt && Number(cp.c_projectphase_id) === Number(ph1.c_projectphase_id) && !cp.c_projecttask_id && num(cp.plannedqty) === 5, { cp: cp });
    check('K', 'K1-task-line', 'the task line: project = target, phase = copied phase, task = copied task; MProjectTask.copyLinesFrom does NOT reset Invoiced (legacy: InvoicedQty 1 stays)', Number(ct.c_project_id) === tgt && Number(ct.c_projectphase_id) === Number(ph1.c_projectphase_id) && Number(ct.c_projecttask_id) === Number(t1.c_projecttask_id) && num(ct.invoicedqty) === 1 && num(ct.plannedqty) === 6, { ct: ct });
    check('K', 'K5-phase-line-not-plain', 'a source line that has a phase is NOT also copied as a plain line: exactly one copy of k-phase-line and k-task-line', T.lines.filter(function (x) { return x.description === 'k-phase-line'; }).length === 1 && T.lines.filter(function (x) { return x.description === 'k-task-line'; }).length === 1, {});
    // K3 a processed target copies nothing
    var tg3 = mkProject({ name: 'K proc' }); commit(function (trx) { var sv = ML.save(trx, 'c_project', trx.get('c_project', tg3), { processed: 'Y' }); return { ok: sv.ok, error: sv.error }; });
    var r3 = run(PROC.copy, tg3, { C_Project_ID: src.s }), T3 = proj(tg3);
    check('K', 'K3-processed-target', 'a Processed target: the answer is Copied=0 and nothing was copied (MProject.copyDetailsFrom :269-270)', r3.ok && /=0$/.test(r3.summary || '') && T3.lines.length === 0 && T3.phases.length === 0, { s: r3.summary });
    // K4 a phase the target already has (same C_Phase_ID) is ignored
    var tg4 = mkProject({ name: 'K have' }), pre = mk('c_projectphase', { c_project_id: tg4, name: 'K-Pre', seqno: 1, c_phase_id: dummyPhase });
    var r4 = run(PROC.copy, tg4, { C_Project_ID: src.s }), T4 = proj(tg4);
    check('K', 'K4-existing-phase', 'the target already holds C_Phase_ID ' + dummyPhase + ': the source phase K-Ph2 is ignored with its task (copied = 2 plain + K-Ph1 + K-T1 + task line + phase line = 6); K-Pre stays alone with that C_Phase_ID',
      r4.ok && /=6$/.test(r4.summary || '') && T4.phases.length === 2 && T4.phases.filter(function (x) { return Number(x.c_phase_id) === Number(dummyPhase); }).length === 1 && T4.tasks.length === 1 && T4.tasks[0].name === 'K-T1', { s: r4.summary, ph: T4.phases.length, t: T4.tasks.length });
  });
  guard('K', 'K2', 'K2 refusals with legacy\'s text', function () {
    var src = mkProject({}), tgt = mkProject({}), n0 = one('SELECT count(*) AS n FROM c_projectline').n;
    var a = run(PROC.copy, 0, { C_Project_ID: src }), b = run(PROC.copy, tgt, {});
    check('K', 'K2-target-zero', 'target id 0: "Target C_Project_ID == 0" (CopyFromProject.java :70-71)', !a.ok && a.summary === 'Target C_Project_ID == 0' && a.nops === 0, { s: a.summary });
    check('K', 'K2-source-zero', 'no source parameter: "Source C_Project_ID == 0" (:72-73), nothing copied', !b.ok && b.summary === 'Source C_Project_ID == 0' && b.nops === 0 && one('SELECT count(*) AS n FROM c_projectline').n === n0, { s: b.summary });
  });

  // ═══ result ═══
  check('P0', 'no-unknown-para', 'no run printed §PROC-UNKNOWN-PARA for the four ports', ALLLOG.length > 0 && !ALLLOG.some(function (l) { return /^§PROC-UNKNOWN-PARA (ProjectGenOrder|ProjectGenPO|ProjectClose|CopyFromProject)/.test(l); }), {});
  var kinds = {}; ALLLOG.forEach(function (l) { var kk = l.split(' ')[0]; if (/^§(PROJECT-|PROC-|MODEL-SEVERE)/.test(kk)) kinds[kk] = (kinds[kk] || 0) + 1; });
  say('§PROJPROCS-SHIPPED-LOG kinds=' + J(kinds));
  ALLLOG.filter(function (l) { return /^§(MODEL-SEVERE|PROC-EXCEPTION)/.test(l); }).slice(0, 12).forEach(function (l) { say('  ' + l.slice(0, 240)); });
  var vs = ['P0', 'G', 'PH', 'O', 'C', 'K'].map(verdict), failedCases = Object.keys(CASES).filter(function (c) { return CASES[c].failed; });
  var all = !ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : 'PASS';
  say('§PROJPROCS-RESULT verdict=' + all + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' failedCases=' + J(failedCases) + (MUTANT ? ' mutant=' + MUTANT : ''));
  var exitCode = all === 'PASS' ? 0 : 1;

  if (process.env.PROJPROCS_MUTANTS && !MUTANT) {
    var MUTS = []; try { MUTS = require('./witness_project_procs_mutants.js'); } catch (e) { say('§PROJPROCS-MUTANT-ERR ' + e.message); }
    var killed = 0, applied = 0, notApplied = [], crashed = [], survived = [], jobs = [];
    MUTS.forEach(function (m) {
      var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projmut_'));
      fs.readdirSync(ERP).forEach(function (f) { try { fs.symlinkSync(path.join(ERP, f), path.join(dir, f)); } catch (e) {} });
      fs.readdirSync(ERP).forEach(function (f) { var src = path.join(ERP, f), st = fs.statSync(src);
        if ((st.isFile() && /\.(js|html|json)$/.test(f)) || (st.isDirectory() && (f === 'callouts' || f === 'processes' || f === 'product_icons'))) { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} fs.cpSync(src, path.join(dir, f), { recursive: true }); } });
      var ok = true;
      m.edits.forEach(function (ed) { var src = fs.readFileSync(path.join(dir, ed.file), 'utf8'), want = ed.count || 1, have = src.split(ed.from).length - 1;
        if (have !== want) { ok = false; say('§PROJPROCS-MUTANT-EDIT ' + m.name + ' ' + ed.file + ' found ' + have + ' time(s), expected ' + want); return; } fs.writeFileSync(path.join(dir, ed.file), src.split(ed.from).join(ed.to)); });
      if (!ok) { notApplied.push(m.name); say('§PROJPROCS-MUTANT ' + m.name + ' NOT-APPLIED'); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} return; }
      applied++; jobs.push({ m: m, dir: dir });
    });
    for (var ji = 0; ji < jobs.length; ji++) {
      var job = jobs[ji], out = await new Promise(function (resolve) { var ch = cp.spawn(process.execPath, [__filename], { env: Object.assign({}, process.env, { PROJPROCS_ERP: job.dir, PROJPROCS_MUTANT: job.m.name, PROJPROCS_MUTANTS: '' }) }), o = ''; ch.stdout.on('data', function (d) { o += d; }); ch.stderr.on('data', function (d) { o += d; }); ch.on('close', function () { resolve(o); }); });
      var m = job.m, rl = out.split('\n').filter(function (l) { return /^§PROJPROCS-RESULT /.test(l); })[0], fl = out.split('\n').filter(function (l) { return /§PROJPROCS-CHECK .* FAIL /.test(l); });
      var named = (m.kills || []).filter(function (kk) { return fl.some(function (l) { return l.indexOf('case=' + kk.split('.')[0] + ' key=' + kk.split('.')[1] + ' ') >= 0; }); });
      if (!rl) { crashed.push(m.name); say('§PROJPROCS-MUTANT ' + m.name + ' CRASHED (a crash is NOT a kill)'); }
      else if (/verdict=FAIL/.test(rl) && named.length) { killed++; say('§PROJPROCS-MUTANT ' + m.name + ' applied=1 KILLED by ' + named.join(' | ') + ' :: ' + m.what); }
      else { survived.push(m.name); say('§PROJPROCS-MUTANT ' + m.name + ' SURVIVED expected ' + (m.kills || []).join(' | ')); }
      try { fs.rmSync(job.dir, { recursive: true, force: true }); } catch (e) {}
    }
    var nSel = jobs.length + notApplied.length, mv = !MUTS.length ? 'INCONCLUSIVE' : (killed === nSel && !notApplied.length && !crashed.length && !survived.length) ? 'PASS' : 'FAIL';
    say('§PROJPROCS-MUTANTS verdict=' + mv + ' total=' + nSel + ' applied=' + applied + ' killed=' + killed + ' notApplied=' + J(notApplied) + ' crashed=' + J(crashed) + ' survived=' + J(survived));
    if (mv !== 'PASS') exitCode = 1;
  }
  process.exit(exitCode);
})().catch(function (e) { say('§PROJPROCS-RESULT verdict=FAIL harness: ' + (e && e.stack)); process.exit(2); });
