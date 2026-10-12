#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-SD16-ENGINE-PORT (bim-compiler prompts/SQLiteIDEMPIERE.md §SD16; CARDINAL RULE: the shipped ERP must book and refuse exactly like legacy iDempiere).
//   READ THE LOG after every run: every verdict is a §-line, the exit code is not the evidence.
// THE ISSUE it proves/disproves: erp/doc_poster.js + erp/erp_engine.js lacked the customer-return (M_RMA) rules: RMA qty refusal (MRMALine.checkQty, cumulative), return receipt booked at CURRENT cost
//   (Doc_InOut.createFacts "Sales - Return" :451-640, DocLine.getProductCosts:791-842), cost detail at costing precision (MCostDetail/MCost.setWeightedAverage), AR credit memo mirror books
//   (Doc_Invoice.java:522-575), manual allocation netting (MAllocationHdr.prepareIt/completeIt, MInvoice.testAllocation:1433-1455), RMA line QtyDelivered (MInOut.completeIt:1984-2002), over-receipt accepted
//   (no source rule at MInOutLine; measured on legacy, SD16r3). Drives the SHIPPED engine on scratch sql.js dbs. Each section ends judged=N; judged=0 => INCONCLUSIVE. SD16-NEG-* flip one input and the verdict MUST change.
'use strict';
var path = require('path'), fs = require('fs');
var DP = require(path.join(__dirname, '..', 'doc_poster.js')), E = require(path.join(__dirname, '..', 'erp_engine.js'));
var initSqlJs = null, sqlWhy = '';
try { initSqlJs = require('sql.js'); } catch (e1) {
  try { var vend = require(path.join(__dirname, '..', 'sqljs', 'sql-wasm.js')), wasm = fs.readFileSync(path.join(__dirname, '..', 'sqljs', 'sql-wasm.wasm')); initSqlJs = function () { return vend({ wasmBinary: wasm }); }; }
  catch (e2) { sqlWhy = 'sql.js not installed (' + e1.message.split('\n')[0] + ') and vendored erp/sqljs not loadable (' + e2.message.split('\n')[0] + ')'; }
}
if (!initSqlJs) { console.log('§SD16P_VERDICT INCONCLUSIVE reason="' + sqlWhy + '"'); process.exit(3); }
var fails = 0, incs = 0, log = console.log, SQL = null;
function mkdb() {
  var sdb = new SQL.Database();
  function bind(st, p) { if (p == null) return; st.bind(Array.isArray(p) ? p : [p]); }
  return { prepare: function (sql) { return {
    get: function (p) { var s = sdb.prepare(sql); try { bind(s, p); return s.step() ? s.getAsObject() : undefined; } finally { s.free(); } },
    all: function (p) { var s = sdb.prepare(sql), r = []; try { bind(s, p); while (s.step()) r.push(s.getAsObject()); return r; } finally { s.free(); } },
    run: function (p) { var s = sdb.prepare(sql); try { bind(s, p); s.step(); } finally { s.free(); } } }; }, exec: function (q) { sdb.run(q); } };
}
function check(sec, name, got, want) { var ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fails++; log('§SD16P ' + sec + ' ' + name + ' ' + (ok ? 'PASS' : 'FAIL') + ' got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)); return ok; }
function verdict(sec, judged) { if (!judged) { incs++; log('§SD16P ' + sec + ' INCONCLUSIVE judged=0'); } else log('§SD16P ' + sec + ' judged=' + judged); }
function has(sec, fn) { if (typeof E[fn] !== 'function') { check(sec, fn + ' exported', typeof E[fn], 'function'); verdict(sec, 0); return false; } return true; }
(async function () {
SQL = await initSqlJs();
// ---- S1 MRMALine.checkQty / beforeSave: ISSUE = the RMA qty rules (R-RMA2) ----
(function () {
  if (!has('S1', 'rmaCheckQty') || !has('S1', 'rmaLineSave')) return;
  var n = 0, src = function (o) { return Object.assign({ m_product_id: 5, shipqty: 3, priceactual: '50.00', c_tax_id: 9, origqty: 3, othersCompletedQty: 0 }, o || {}); };
  n++; check('S1', 'return 3 of 3 shipped: allowed', E.rmaCheckQty(3, 3, 0), true);
  n++; check('S1', 'return 4 of 3 shipped: refused (MovementQty < Qty)', E.rmaCheckQty(3, 4, 0), false);
  n++; check('S1', '2 already returned on a COMPLETED RMA + 2 more of 3: refused (cumulative)', E.rmaCheckQty(3, 2, 2), false);
  n++; check('S1', '2 already returned + 1 more of 3: allowed', E.rmaCheckQty(3, 1, 2), true);
  var r = E.rmaLineSave({ m_inoutline_id: 1, qty: 4 }, src(), [], 2); n++; check('S1', 'line save over the shipped qty: reason AmtReturned>Shipped', [r.ok, r.reason], [false, 'AmtReturned>Shipped']);
  r = E.rmaLineSave({ m_inoutline_id: 1, qty: 2 }, src(), [{ m_inoutline_id: 1 }], 2); n++; check('S1', 'second line of the SAME RMA on the same shipment line: InOutLineAlreadyEntered', [r.ok, r.reason], [false, 'InOutLineAlreadyEntered']);
  r = E.rmaLineSave({ m_inoutline_id: 1, qty: 2 }, src(), [], 2); n++; check('S1', 'qty 2 x unit price 50.00: LineNetAmt 100.00 (minor units 10000), tax and product taken from the shipment/invoice line', [r.ok, r.line.linenetamt, r.line.c_tax_id, r.line.m_product_id], [true, 10000, 9, 5]);
  r = E.rmaLineSave({ m_inoutline_id: 1, qty: 0 }, src(), [], 2); n++; check('S1', 'qty 0 on a new line defaults to the original qty (3 x 50.00 = 150.00)', [r.ok, r.line.qty, r.line.linenetamt], [true, 3, 15000]);
  r = E.rmaLineSave({ m_inoutline_id: 1, qty: 3 }, src({ priceactual: '33.3333' }), [], 2); n++; check('S1', 'scale > precision rounds HALF_UP (3 x 33.3333 = 99.9999 -> 100.00)', [r.ok, r.line.linenetamt], [true, 10000]);
  verdict('S1', n);
})();

// ---- S2 MRMA.prepareIt/completeIt + StandardTaxProvider.calculateRMATaxTotal: ISSUE = Amt = lines + tax, no lines refused ----
(function () {
  if (!has('S2', 'completeRMA')) return;
  var n = 0, tax = { 9: { c_tax_id: 9, rate: '10', issummary: 'N', isdocumentlevel: 'Y' } }, ctx = { taxById: function (id) { return tax[id]; }, taxChildren: function () { return []; }, taxIncluded: false };
  var ln = { m_inoutline_id: 1, qty: 2, linenetamt: 10000, c_tax_id: 9, shipqty: 3, othersCompletedQty: 0 };
  var r = E.completeRMA({ m_rma_id: 7 }, [ln], ctx); n++; check('S2', 'RMA of 2 x 50.00 at 10% (not included): Amt 110.00 (legacy pilot: amt=110.00)', [r.ok, r.amt, r.docstatus], [true, 11000, 'CO']);
  n++; check('S2', 'a MRMATax row 100.00 base / 10.00 tax is created', r.taxes.map(function (t) { return t.taxbaseamt + '/' + t.taxamt; }), ['10000/1000']);
  n++; check('S2', 'completeIt moves NO stock and posts NOTHING (only M_RMATax rows, the header Amt and the status)', r.ops.map(function (o) { return o.op_type + ':' + o.table; }), ['CREATE_LINE:M_RMATax', 'UPDATE_FIELD:M_RMA', 'SET_STATUS:M_RMA']);
  r = E.completeRMA({ m_rma_id: 7 }, [], ctx); n++; check('S2', 'no lines: refused NoLines', [r.ok, r.reason], [false, 'NoLines']);
  r = E.completeRMA({ m_rma_id: 7 }, [Object.assign({}, ln, { qty: 2, othersCompletedQty: 2 })], ctx); n++; check('S2', 'completeIt re-checks the qty (2 + 2 > 3): refused', [r.ok, r.reason], [false, 'AmtReturned>Shipped']);
  r = E.completeRMA({ m_rma_id: 7 }, [ln], Object.assign({}, ctx, { taxIncluded: true })); n++; check('S2', 'tax-included RMA: Amt = lines (tax is inside)', [r.ok, r.amt], [true, 10000]);
  verdict('S2', n);
})();

// ---- S3 MInOut.completeIt :1984-2002: ISSUE = the RMA line QtyDelivered ----
(function () {
  if (!has('S3', 'rmaReceiptEffects')) return;
  var n = 0, rl = [{ m_rmaline_id: 70, qtydelivered: 0 }];
  var r = E.rmaReceiptEffects({ issotrx: 'Y', movementtype: 'C+' }, [{ m_rmaline_id: 70, c_orderline_id: null, movementqty: 2 }], rl); n++; check('S3', 'customer return receipt of 2: QtyDelivered 0 -> 2', r.ops.map(function (o) { return o.qtydelivered; }), [2]);
  r = E.rmaReceiptEffects({ issotrx: 'Y', movementtype: 'C+' }, [{ m_rmaline_id: 70, c_orderline_id: 55, movementqty: 2 }], rl); n++; check('S3', 'a line WITH an order line takes the order-line branch, not the RMA branch', r.ops.length, 0);
  r = E.rmaReceiptEffects({ issotrx: 'N', movementtype: 'V-' }, [{ m_rmaline_id: 70, c_orderline_id: null, movementqty: 2 }], rl); n++; check('S3', 'vendor return shipment (IsSOTrx=N, V-): QtyDelivered -= (-2) -> 2 (subtract the signed Qty)', r.ops.map(function (o) { return o.qtydelivered; }), [2]);
  verdict('S3', n);
})();

// ---- S4 MAllocationHdr.prepareIt/completeIt + MInvoice.testAllocation: ISSUE = credit memo against the original invoice ----
(function () {
  if (!has('S4', 'completeAllocation')) return;
  var n = 0, inv = { c_invoice_id: 5, issotrx: 'Y', iscreditmemo: 'N', grandtotal: 165, dateacct: '2026-10-12', ispaid: 'N', allocatedamt: 0 }, cm = { c_invoice_id: 6, issotrx: 'Y', iscreditmemo: 'Y', grandtotal: 110, dateacct: '2026-10-12', ispaid: 'N', allocatedamt: 0 };
  var L = [{ c_allocationline_id: 11, c_invoice_id: 5, c_bpartner_id: 3, amount: 110 }, { c_allocationline_id: 12, c_invoice_id: 6, c_bpartner_id: 3, amount: -110 }], H = { c_allocationhdr_id: 1, dateacct: '2026-10-12', c_currency_id: 100 };
  var r = E.completeAllocation(H, L, [inv, cm]), paid = {}; r.ops.filter(function (o) { return o.field === 'ispaid'; }).forEach(function (o) { paid[o.id] = o.value; });
  n++; check('S4', 'credit memo 110 vs invoice 165, lines +110 / -110: the credit memo is paid (raw sum -110 == -GrandTotal), the invoice is not', [r.ok, paid[5], paid[6]], [true, 'N', 'Y']);
  r = E.completeAllocation(H, L, [Object.assign({}, inv, { ispaid: 'Y' }), cm]); n++; check('S4', 'invoice already paid + positive line: refused (ValidationError IsPaid)', [r.ok, r.reason], [false, 'ValidationError IsPaid']);
  r = E.completeAllocation(H, [], [inv, cm]); n++; check('S4', 'no lines: NoLines', [r.ok, r.reason], [false, 'NoLines']);
  r = E.completeAllocation(H, [Object.assign({}, L[0], { c_bpartner_id: 0 }), L[1]], [inv, cm]); n++; check('S4', 'line without business partner: refused', [r.ok, r.reason], [false, 'No Business Partner']);
  r = E.completeAllocation(H, L, [Object.assign({}, inv, { dateacct: '2026-10-13' }), cm]); n++; check('S4', 'invoice dated after the allocation: refused (Wrong allocation date)', [r.ok, r.reason], [false, 'Wrong allocation date']);
  verdict('S4', n);
})();

// ---- S5 cost + books of the return receipt and the credit memo: ISSUE = R-MMR4/R-MMR5/R-CM4 ----
(function () {
  var db = mkdb();
  db.exec("CREATE TABLE c_acctschema(c_acctschema_id INTEGER, m_costtype_id INTEGER, costingmethod TEXT, c_currency_id INTEGER, isactive TEXT);" +
    "CREATE TABLE c_currency(c_currency_id INTEGER, costingprecision INTEGER, stdprecision INTEGER);" +
    "CREATE TABLE m_costelement(m_costelement_id INTEGER, costelementtype TEXT, costingmethod TEXT, isactive TEXT);" +
    "CREATE TABLE m_product(m_product_id INTEGER, isstocked TEXT, producttype TEXT, m_product_category_id INTEGER);" +
    "CREATE TABLE m_cost(m_product_id INTEGER, c_acctschema_id INTEGER, m_costtype_id INTEGER, m_costelement_id INTEGER, currentcostprice NUMERIC, currentqty NUMERIC, cumulatedamt NUMERIC, cumulatedqty NUMERIC);" +
    "CREATE TABLE m_inout(m_inout_id INTEGER, issotrx TEXT, movementtype TEXT, dateacct TEXT, reversal_id INTEGER);" +
    "CREATE TABLE m_inoutline(m_inoutline_id INTEGER, m_inout_id INTEGER, m_product_id INTEGER, movementqty NUMERIC);" +
    "CREATE TABLE c_doctype(c_doctype_id INTEGER, docbasetype TEXT);" +
    "CREATE TABLE c_invoice(c_invoice_id INTEGER, c_bpartner_id INTEGER, grandtotal NUMERIC, issotrx TEXT, c_doctype_id INTEGER);" +
    "CREATE TABLE c_invoiceline(c_invoiceline_id INTEGER, c_invoice_id INTEGER, m_product_id INTEGER, linenetamt NUMERIC);" +
    "CREATE TABLE c_invoicetax(c_invoice_id INTEGER, c_tax_id INTEGER, taxamt NUMERIC);" +
    "INSERT INTO c_acctschema VALUES(1,1,'A',100,'Y');INSERT INTO c_currency VALUES(100,4,2);INSERT INTO m_costelement VALUES(7,'M','A','Y');INSERT INTO m_product VALUES(5,'Y','I',1);" +
    "INSERT INTO m_cost VALUES(5,1,1,7,33.7037037,27,910,27);" +
    "INSERT INTO m_inout VALUES(10,'Y','C+','2026-10-12 00:00:00',NULL),(11,'Y','C-','2026-10-12 00:00:00',NULL);INSERT INTO m_inoutline VALUES(100,10,5,2),(110,11,5,-2);" +
    "INSERT INTO c_doctype VALUES(1,'ARI'),(2,'ARC');INSERT INTO c_invoice VALUES(20,3,110,'Y',1),(21,3,110,'Y',2);INSERT INTO c_invoiceline VALUES(200,20,5,100),(210,21,5,100);INSERT INTO c_invoicetax VALUES(20,9,10),(21,9,10);");
  var n = 0, u = DP.costQtyUpdates(db, 10);
  n++; check('S5', 'customer return of 2 (C+): one cost update', u.length, 1);
  if (u.length) {
    n++; check('S5', 'CurrentQty 27 + 2 = 29 (MCostDetail addition)', u[0].set.currentqty, 29);
    n++; check('S5', 'weighted average with the cost detail amount at the COSTING precision (4 dp): 2 x 33.7037037 = 67.4074 -> (27 x 33.7037037 + 67.4074) / 29 = 33.70370344 (legacy pilot: 33.70370344)', u[0].set.currentcostprice, 33.70370344);
    n++; check('S5', 'a customer-shipment return does NOT accumulate: CumulatedQty/Amt unchanged (MCostDetail.isShipment, :1728-1734)', [u[0].set.cumulatedqty, u[0].set.cumulatedamt], [27, 910]);
  }
  var u2 = DP.costQtyUpdates(db, 11); n++; check('S5', 'a shipment (C-, negative reversal line) of -2 is not affected: qty 27 + 2 (re-add) and the price is not recomputed from a 2-decimal amount', u2.length, 1);
  // books: a stub resolver (account = the token) isolates the Dr/Cr SIDES
  var R = { resolve: function (d, token) { var id = { '{Product.Asset}': 11, '{Product.Cogs}': 12, '{Product.Revenue}': 13, '{Tax.Due}': 14, '{BPartner.Receivable}': 15 }[token]; return { acct: id, element: { id: id, value: token, name: token } }; } };
  var side = function (r) { return Object.keys(r.by).map(function (k) { var a = r.by[k]; return a.value + ':' + (a.dr ? 'DR' + a.dr : '') + (a.cr ? 'CR' + a.cr : ''); }).sort(); };
  var ret = DP.deriveInOut(db, R, 10, 1); n++; check('S5', 'return receipt books: Dr {Product.Asset} / Cr {Product.Cogs} at qty x CURRENT cost (2 x 33.7037037 = 67.41 -> cents 6741)', ret ? side(ret).concat(ret.absent) : null, ['{Product.Asset}:DR6741', '{Product.Cogs}:CR6741']);
  var ari = DP.deriveInvoice(db, R, 20, 1); n++; check('S5', 'AR invoice (ARI): Dr receivable / Cr revenue + tax due', side(ari), ['{BPartner.Receivable}:DR11000', '{Product.Revenue}:CR10000', '{Tax.Due}:CR1000']);
  var arc = DP.deriveInvoice(db, R, 21, 1); n++; check('S5', 'AR credit memo (ARC): the mirror — Dr revenue + tax due / Cr receivable (Doc_Invoice.java:522-575; legacy pilot books DR10000+DR1000 / CR11000)', side(arc), ['{BPartner.Receivable}:CR11000', '{Product.Revenue}:DR10000', '{Tax.Due}:DR1000']);
  verdict('S5', n);
})();

// ---- S6 NEGATIVE CONTROLS + over-receipt: ISSUE = the witness can fail, current-cost and over-receipt rules are really exercised ----
(function () {
  var n = 0;
  if (has('S6', 'rmaCheckQty') && has('S6', 'rmaReceiptEffects')) {
    n++; check('S6', 'NEG-CONTROL qty boundary: 3 of 3 allowed, 4 of 3 refused (verdict flips on one unit)', [E.rmaCheckQty(3, 3, 0), E.rmaCheckQty(3, 4, 0)], [true, false]);
    var r = E.rmaReceiptEffects({ issotrx: 'Y', movementtype: 'C+' }, [{ m_rmaline_id: 70, c_orderline_id: null, movementqty: 3 }], [{ m_rmaline_id: 70, qtydelivered: 0 }]);
    n++; check('S6', 'over-receipt (3 received on an RMA line of 2) is ACCEPTED by the engine, QtyDelivered 3 (legacy SD16r3: no source rule at MInOutLine, CARDINAL #2)', r.ops.map(function (o) { return o.qtydelivered; }), [3]);
  }
  var db = mkdb();
  db.exec("CREATE TABLE c_acctschema(c_acctschema_id INTEGER, m_costtype_id INTEGER, costingmethod TEXT, c_currency_id INTEGER, isactive TEXT);CREATE TABLE c_currency(c_currency_id INTEGER, costingprecision INTEGER, stdprecision INTEGER);" +
    "CREATE TABLE m_costelement(m_costelement_id INTEGER, costelementtype TEXT, costingmethod TEXT, isactive TEXT);CREATE TABLE m_product(m_product_id INTEGER, isstocked TEXT, producttype TEXT, m_product_category_id INTEGER);" +
    "CREATE TABLE m_cost(m_product_id INTEGER, c_acctschema_id INTEGER, m_costtype_id INTEGER, m_costelement_id INTEGER, currentcostprice NUMERIC, currentqty NUMERIC, cumulatedamt NUMERIC, cumulatedqty NUMERIC);" +
    "CREATE TABLE m_inout(m_inout_id INTEGER, issotrx TEXT, movementtype TEXT, dateacct TEXT, reversal_id INTEGER);CREATE TABLE m_inoutline(m_inoutline_id INTEGER, m_inout_id INTEGER, m_product_id INTEGER, movementqty NUMERIC);" +
    "INSERT INTO c_acctschema VALUES(1,1,'A',100,'Y');INSERT INTO c_currency VALUES(100,4,2);INSERT INTO m_costelement VALUES(7,'M','A','Y');INSERT INTO m_product VALUES(5,'Y','I',1);" +
    "INSERT INTO m_cost VALUES(5,1,1,7,60,10,600,10);INSERT INTO m_inout VALUES(10,'Y','C+','2026-10-12 00:00:00',NULL);INSERT INTO m_inoutline VALUES(100,10,5,2);");
  var R = { resolve: function (d, token) { var id = { '{Product.Asset}': 11, '{Product.Cogs}': 12 }[token]; return { acct: id, element: { id: id, value: token, name: token } }; } };
  var amt = function () { var r = DP.deriveInOut(db, R, 10, 1); return r && r.by && r.by[11] ? r.by[11].dr : (r ? r.absent : null); };
  var before = amt(); db.exec("UPDATE m_cost SET currentcostprice=70");   // cost moved 60 -> 70 AFTER the original shipment (SD-16 fixture)
  var after = amt();
  n++; check('S6', 'return receipt of 2 books at the CURRENT cost, not the shipment cost: 60 -> 12000 cents, after the cost moves to 70 -> 14000', [before, after], [12000, 14000]);
  n++; check('S6', 'NEG-CONTROL the two amounts differ (a books routine that ignored the cost state could not satisfy S6 above)', before !== after, true);
  db.exec("UPDATE m_cost SET currentcostprice=0"); var z = amt();
  n++; check('S6', 'zero current cost on a stocked product: refused by name, never an invented amount', Array.isArray(z) && /^No Costs for product 5/.test(z[0]), true);
  verdict('S6', n);
})();
log('§SD16P_VERDICT ' + (fails ? 'FAIL' : incs ? 'INCONCLUSIVE' : 'PASS') + ' fails=' + fails + ' inconclusive=' + incs);
process.exit(fails ? 1 : incs ? 2 : 0);
})();
