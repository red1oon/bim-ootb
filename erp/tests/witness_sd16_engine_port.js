#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-SD16-ENGINE-PORT (bim-compiler prompts/SQLiteIDEMPIERE.md §SD16; CARDINAL RULE: the shipped ERP must book and refuse exactly like legacy iDempiere).
//   READ THE LOG after every run: every verdict is a §-line, the exit code is not the evidence.
// THE ISSUE it proves/disproves: erp/doc_poster.js + erp/erp_engine.js lacked the customer-return (M_RMA) rules: RMA qty refusal (MRMALine.checkQty, cumulative), return receipt booked at CURRENT cost
//   (Doc_InOut.createFacts "Sales - Return" :451-640, DocLine.getProductCosts:791-842), cost detail at costing precision (MCostDetail/MCost.setWeightedAverage), AR credit memo mirror books
//   (Doc_Invoice.java:522-575), manual allocation (owned by the shipped model layer erp/model_invoice.js, judged by witness_sd16_allocation_model_path.js; here: no duplicate verb), RMA line QtyDelivered (MInOut.completeIt:1984-2002), over-receipt accepted
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
var fails = 0, incs = 0, log = console.log, SQL = null, SHIPPED = true;
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
function section(id, fn) { try { fn(); } catch (e) { fails++; log('§SD16P ' + id + ' THREW ' + String(e && e.message).slice(0, 160) + ' FAIL'); } }
// ---- S1 MRMALine.checkQty / beforeSave: ISSUE = the RMA qty rules (R-RMA2) and lines WITHOUT a shipment line (MRMALine.java:305-398) ----
section('S1', function () {
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
  // finding 2 -- lines without a shipment line: no qty/duplicate check (the Java guards them with `if (m_ioLine != null)`), qty <= 0 and 0 => 1, Amt 0 => getUnitAmt, named refusals for the empty / both-set cases
  r = E.rmaLineSave({ m_inoutline_id: null, qty: 0, c_charge_id: 3 }, { unitamt: '25.00', c_tax_id: 9 }, [], 2); n++; check('S1', 'charge-only line (no shipment line): qty 0 => 1, Amt = the charge amount, LineNetAmt 25.00 -- no crash', r.ok ? [r.ok, r.line.qty, r.line.linenetamt, r.line.c_charge_id, r.line.m_inoutline_id] : r, [true, 1, 2500, 3, null]);
  r = E.rmaLineSave({ m_inoutline_id: null, qty: 4, m_product_id: 5 }, { unitamt: '10.005', c_tax_id: 9 }, [{ m_inoutline_id: null }], 2); n++; check('S1', 'product-only line, qty 4 with NO shipped qty to compare (4 > 3 would refuse on a shipment line), a SECOND shipment-less line is NOT InOutLineAlreadyEntered; 4 x 10.005 = 40.02 exact', r.ok ? [r.ok, r.line.linenetamt] : r, [true, 4002]);
  r = E.rmaLineSave({ m_inoutline_id: null, qty: 3, m_product_id: 5 }, { unitamt: '10.005', c_tax_id: 9 }, [], 2); n++; check('S1', 'scale 3 > precision 2 rounds HALF_UP (3 x 10.005 = 30.015 -> 30.02)', r.ok ? r.line.linenetamt : r, 3002);
  r = E.rmaLineSave({ m_inoutline_id: null, qty: 1 }, {}, [], 2); n++; check('S1', 'no shipment line, no charge, no product: FillShipLineOrProductOrCharge (MRMALine.java:313-318)', [r.ok, r.reason], [false, 'FillShipLineOrProductOrCharge']);
  r = E.rmaLineSave({ m_inoutline_id: null, qty: 1, m_product_id: 5, c_charge_id: 3 }, { unitamt: '1' }, [], 2); n++; check('S1', 'product AND charge: JustProductOrCharge (MRMALine.java:320-325)', [r.ok, r.reason], [false, 'JustProductOrCharge']);
  r = E.rmaLineSave({ m_inoutline_id: null, qty: 1, m_product_id: 5 }, {}, [], 2); n++; check('S1', 'shipment-less line with no unit amount available: refused by name, never a guessed price', [r.ok, /^ABSENT:unit amount/.test(r.reason || '')], [false, true]);
  r = E.rmaLineSave({ m_inoutline_id: 1, qty: 2 }, { m_product_id: 5, c_tax_id: 9 }, [], 2); n++; check('S1', 'shipment line whose source quantity/price is not supplied: refused by name (legacy IllegalStateException), no crash', [r.ok, /^ABSENT:/.test(r.reason || '')], [false, true]);
  r = E.rmaLineSave({ m_inoutline_id: 1, qty: 2 }, src({ priceactual: null }), [], 2); n++; check('S1', 'shipment line without an invoice/order unit price: refused by name', [r.ok, /^ABSENT:invoice\/order line unit price/.test(r.reason || '')], [false, true]);
  // finding 3 -- currency precision flows through the line save
  r = E.rmaLineSave({ m_inoutline_id: 1, qty: 2 }, src({ priceactual: '50.000' }), [], 3); n++; check('S1', '3-decimal currency: 2 x 50.000 => 100.000 = 100000 minor units, line says precision 3', r.ok ? [r.line.linenetamt, r.line.precision] : r, [100000, 3]);
  r = E.rmaLineSave({ m_inoutline_id: 1, qty: 3 }, src({ priceactual: '33.3333' }), [], 0); n++; check('S1', '0-decimal currency: 3 x 33.3333 = 99.9999 -> 100 minor units', r.ok ? [r.line.linenetamt, r.line.precision] : r, [100, 0]);
  // NEG-CONTROL: the shipment-line guards still bite where Java applies them (same qty 4, but WITH a shipment line of 3)
  r = E.rmaLineSave({ m_inoutline_id: 1, qty: 4, m_product_id: 5 }, src({ unitamt: '10.005' }), [], 2); n++; check('S1', 'NEG-CONTROL qty 4 WITH a shipment line (shipped 3) is still refused, so the shipment-less acceptance above is the Java branch and not a disabled check', [r.ok, r.reason], [false, 'AmtReturned>Shipped']);
  verdict('S1', n);
});

// ---- S2 MRMA.prepareIt/completeIt + StandardTaxProvider.calculateRMATaxTotal: ISSUE = Amt = lines + tax, no lines refused; currency precision; line shape ----
section('S2', function () {
  if (!has('S2', 'completeRMA')) return;
  var n = 0, tax = { 9: { c_tax_id: 9, rate: '10', issummary: 'N', isdocumentlevel: 'Y' } }, ctx = { taxById: function (id) { return tax[id]; }, taxChildren: function () { return []; }, taxIncluded: false };
  var ln = { m_inoutline_id: 1, qty: 2, linenetamt: 10000, c_tax_id: 9, shipqty: 3, othersCompletedQty: 0 };
  var r = E.completeRMA({ m_rma_id: 7 }, [ln], ctx); n++; check('S2', 'RMA of 2 x 50.00 at 10% (not included): Amt 110.00 (legacy pilot: amt=110.00)', [r.ok, r.amt, r.docstatus], [true, 11000, 'CO']);
  n++; check('S2', 'a MRMATax row 100.00 base / 10.00 tax is created', r.taxes.map(function (t) { return t.taxbaseamt + '/' + t.taxamt; }), ['10000/1000']);
  n++; check('S2', 'completeIt moves NO stock and posts NOTHING (only M_RMATax rows, the header Amt and the status)', r.ops.map(function (o) { return o.op_type + ':' + o.table; }), ['CREATE_LINE:M_RMATax', 'UPDATE_FIELD:M_RMA', 'SET_STATUS:M_RMA']);
  r = E.completeRMA({ m_rma_id: 7 }, [], ctx); n++; check('S2', 'no lines: refused NoLines', [r.ok, r.reason], [false, 'NoLines']);
  r = E.completeRMA({ m_rma_id: 7 }, [Object.assign({}, ln, { qty: 2, othersCompletedQty: 2 })], ctx); n++; check('S2', 'completeIt re-checks the qty (2 + 2 > 3): refused', [r.ok, r.reason], [false, 'AmtReturned>Shipped']);
  r = E.completeRMA({ m_rma_id: 7 }, [ln], Object.assign({}, ctx, { taxIncluded: true })); n++; check('S2', 'tax-included RMA: Amt = lines (tax is inside)', [r.ok, r.amt], [true, 10000]);
  // finding 3 -- the documented {line:...} shape (an rmaLineSave result + shipqty) gives the same answer as the flat shape; no NaN
  var sv = E.rmaLineSave({ m_inoutline_id: 1, qty: 2 }, { m_product_id: 5, shipqty: 3, priceactual: '50.00', c_tax_id: 9, origqty: 3, othersCompletedQty: 0 }, [], 2);
  r = E.completeRMA({ m_rma_id: 7 }, [Object.assign({}, sv, { shipqty: 3, othersCompletedQty: 0 })], ctx); n++; check('S2', 'documented shape (rmaLineSave result {ok,line} + shipqty) completes with the same Amt 110.00, not NaN', [r.ok, r.amt], [true, 11000]);
  r = E.completeRMA({ m_rma_id: 7 }, [{ m_inoutline_id: 1, qty: 2, c_tax_id: 9, shipqty: 3, othersCompletedQty: 0 }], ctx); n++; check('S2', 'a line with no linenetamt is refused by name (was NaN)', [r.ok, /^ABSENT:linenetamt/.test(r.reason || '')], [false, true]);
  r = E.completeRMA({ m_rma_id: 7 }, [{ m_inoutline_id: 1, qty: 2, linenetamt: 10000, c_tax_id: 9 }], ctx); n++; check('S2', 'a shipment-line row without shipqty is refused by name (was a false AmtReturned>Shipped)', [r.ok, /^ABSENT:shipqty/.test(r.reason || '')], [false, true]);
  r = E.completeRMA({ m_rma_id: 7 }, [Object.assign({}, sv, { shipqty: 3, othersCompletedQty: 0 })], Object.assign({}, ctx, { precision: 3 })); n++; check('S2', 'line saved at precision 2 completed at ctx precision 3: refused (precision-mismatch), not silently mis-scaled', [r.ok, /^precision-mismatch/.test(r.reason || '')], [false, true]);
  var cl = E.rmaLineSave({ m_inoutline_id: null, qty: 0, c_charge_id: 3 }, { unitamt: '25.00', c_tax_id: 9 }, [], 2);
  r = E.completeRMA({ m_rma_id: 7 }, [cl], ctx); n++; check('S2', 'a charge-only RMA (no shipment line, no shipqty) completes: 25.00 + 10% = 27.50', r.ok ? [r.ok, r.amt] : r, [true, 2750]);
  // finding 3 -- currency precision: 0- and 3-decimal currencies (calcTax is linear in the minor unit)
  var l0 = E.rmaLineSave({ m_inoutline_id: 1, qty: 2 }, { m_product_id: 5, shipqty: 3, priceactual: '50', c_tax_id: 9, origqty: 3, othersCompletedQty: 0 }, [], 0);
  r = E.completeRMA({ m_rma_id: 7 }, [Object.assign({}, l0, { shipqty: 3, othersCompletedQty: 0 })], Object.assign({}, ctx, { precision: 0 })); n++; check('S2', '0-decimal currency: 2 x 50 + 10% = 110 (minor units 110), MRMATax 100/10, header Amt 110', r.ok ? [r.amt, r.taxes.map(function (t) { return t.taxbaseamt + '/' + t.taxamt; }), r.ops.filter(function (o) { return o.field === 'amt'; })[0].value] : r, [110, ['100/10'], 110]);
  var l3 = E.rmaLineSave({ m_inoutline_id: 1, qty: 2 }, { m_product_id: 5, shipqty: 3, priceactual: '50.000', c_tax_id: 9, origqty: 3, othersCompletedQty: 0 }, [], 3);
  r = E.completeRMA({ m_rma_id: 7 }, [Object.assign({}, l3, { shipqty: 3, othersCompletedQty: 0 })], Object.assign({}, ctx, { precision: 3 })); n++; check('S2', '3-decimal currency: 2 x 50.000 + 10% = 110.000 (minor units 110000), MRMATax 100000/10000, header Amt 110', r.ok ? [r.amt, r.taxes.map(function (t) { return t.taxbaseamt + '/' + t.taxamt; }), r.ops.filter(function (o) { return o.field === 'amt'; })[0].value] : r, [110000, ['100000/10000'], 110]);
  // NEG-CONTROL: the same 3-decimal line at the DEFAULT precision would be mis-scaled by 10x -- the precision refusal above is what prevents it
  n++; check('S2', 'NEG-CONTROL a 3-decimal line fed to a precision-2 completion is NOT quietly accepted (verdict differs from the matching-precision run)', E.completeRMA({ m_rma_id: 7 }, [Object.assign({}, l3, { shipqty: 3, othersCompletedQty: 0 })], ctx).ok, false);
  verdict('S2', n);
});

// ---- S3 MInOut.completeIt :1984-2002: ISSUE = the RMA line QtyDelivered ----
section('S3', function () {
  if (!has('S3', 'rmaReceiptEffects')) return;
  var n = 0, rl = [{ m_rmaline_id: 70, qtydelivered: 0 }];
  var r = E.rmaReceiptEffects({ issotrx: 'Y', movementtype: 'C+' }, [{ m_rmaline_id: 70, c_orderline_id: null, movementqty: 2 }], rl); n++; check('S3', 'customer return receipt of 2: QtyDelivered 0 -> 2', r.ops.map(function (o) { return o.qtydelivered; }), [2]);
  r = E.rmaReceiptEffects({ issotrx: 'Y', movementtype: 'C+' }, [{ m_rmaline_id: 70, c_orderline_id: 55, movementqty: 2 }], rl); n++; check('S3', 'a line WITH an order line takes the order-line branch, not the RMA branch', r.ops.length, 0);
  r = E.rmaReceiptEffects({ issotrx: 'N', movementtype: 'V-' }, [{ m_rmaline_id: 70, c_orderline_id: null, movementqty: 2 }], rl); n++; check('S3', 'vendor return shipment (IsSOTrx=N, V-): QtyDelivered -= (-2) -> 2 (subtract the signed Qty)', r.ops.map(function (o) { return o.qtydelivered; }), [2]);
  verdict('S3', n);
});

// ---- S4 manual allocation (credit memo vs the original invoice): ISSUE = who owns MAllocationHdr.completeIt, and its sign/decimal rules ----
section('S4', function () {
  var n = 0;
  if (SHIPPED) {   // finding 5/4: the shipped ERP already owns this in erp/model_invoice.js (MAllocationHdr.prepareIt/completeIt, invTestAllocation, payTestAllocation) -- a second engine verb would be a duplicate implementation
    n++; check('S4', 'SHIPPED engine carries NO second completeAllocation (one implementation: model_invoice.js MAllocationHdr; judged through the model layer by witness_sd16_allocation_model_path.js)', typeof E.completeAllocation, 'undefined');
    return verdict('S4', n);
  }
  if (!has('S4', 'completeAllocation')) return;
  var inv = { c_invoice_id: 5, issotrx: 'Y', iscreditmemo: 'N', grandtotal: 165, dateacct: '2026-10-12', ispaid: 'N', allocatedamt: 0 }, cm = { c_invoice_id: 6, issotrx: 'Y', iscreditmemo: 'Y', grandtotal: 110, dateacct: '2026-10-12', ispaid: 'N', allocatedamt: 0 };
  var L = [{ c_allocationline_id: 11, c_invoice_id: 5, c_bpartner_id: 3, amount: 110 }, { c_allocationline_id: 12, c_invoice_id: 6, c_bpartner_id: 3, amount: -110 }], H = { c_allocationhdr_id: 1, dateacct: '2026-10-12', c_currency_id: 100 };
  var paidOf = function (r) { var p = {}; r.ops.filter(function (o) { return o.field === 'ispaid'; }).forEach(function (o) { p[o.id] = o.value; }); return p; };
  var r = E.completeAllocation(H, L, [inv, cm]), paid = paidOf(r);
  n++; check('S4', 'credit memo 110 vs invoice 165, lines +110 / -110: the credit memo is paid (raw sum -110 == -GrandTotal), the invoice is not', [r.ok, paid[5], paid[6]], [true, 'N', 'Y']);
  r = E.completeAllocation(H, L, [Object.assign({}, inv, { ispaid: 'Y' }), cm]); n++; check('S4', 'invoice already paid + positive line: refused (ValidationError IsPaid)', [r.ok, r.reason], [false, 'ValidationError IsPaid']);
  r = E.completeAllocation(H, [], [inv, cm]); n++; check('S4', 'no lines: NoLines', [r.ok, r.reason], [false, 'NoLines']);
  r = E.completeAllocation(H, [Object.assign({}, L[0], { c_bpartner_id: 0 }), L[1]], [inv, cm]); n++; check('S4', 'line without business partner: refused', [r.ok, r.reason], [false, 'No Business Partner']);
  r = E.completeAllocation(H, L, [Object.assign({}, inv, { dateacct: '2026-10-13' }), cm]); n++; check('S4', 'invoice dated after the allocation: refused (Wrong allocation date)', [r.ok, r.reason], [false, 'Wrong allocation date']);
  // finding 4 -- a line naming an invoice the caller did not supply is refused by name (was silently skipped = a partial allocation)
  r = E.completeAllocation(H, L, [inv]); n++; check('S4', 'line naming an invoice that was not supplied: refused by name, no partial allocation', [r.ok, /^ABSENT:invoice 6/.test(r.reason || '')], [false, true]);
  // finding 4 -- MAllocationLine.processIt -> MPayment.testAllocation (MPayment.java:966-982): the payment's IsAllocated follows
  var pay = { c_payment_id: 31, payamt: 110, isreceipt: 'Y', allocatedamt: 0 }, PL = [{ c_allocationline_id: 21, c_payment_id: 31, c_invoice_id: 5, c_bpartner_id: 3, amount: 110 }];
  var pof = function (r2) { return r2.ops.filter(function (o) { return o.table === 'C_Payment'; }).map(function (o) { return o.id + ':' + o.field + '=' + o.value; }); };
  r = E.completeAllocation(H, PL, [inv], [pay]); n++; check('S4', 'receipt 110 fully allocated by a 110 line: payment IsAllocated Y', pof(r), ['31:isallocated=Y']);
  r = E.completeAllocation(H, [Object.assign({}, PL[0], { amount: 50 })], [inv], [pay]); n++; check('S4', 'NEG-CONTROL receipt 110 allocated only 50: payment IsAllocated N', pof(r), ['31:isallocated=N']);
  r = E.completeAllocation(H, [Object.assign({}, PL[0], { amount: -80 })], [inv], [{ c_payment_id: 31, payamt: 80, isreceipt: 'N', allocatedamt: 0 }]); n++; check('S4', 'AP payment 80 (IsReceipt N): signed -80 == allocation line -80 => IsAllocated Y', pof(r), ['31:isallocated=Y']);
  r = E.completeAllocation(H, PL, [inv]); n++; check('S4', 'line naming a payment that was not supplied: refused by name', [r.ok, /^ABSENT:payment 31/.test(r.reason || '')], [false, true]);
  // finding 8 -- exact decimals: a 3-decimal credit memo is seen as paid; one milli-unit off is not (Math.round(x*100) cannot tell these apart)
  var cm3 = Object.assign({}, cm, { grandtotal: '110.125' }), inv3 = Object.assign({}, inv, { grandtotal: '165.125' });
  r = E.completeAllocation(H, [{ c_allocationline_id: 11, c_invoice_id: 5, c_bpartner_id: 3, amount: '110.125' }, { c_allocationline_id: 12, c_invoice_id: 6, c_bpartner_id: 3, amount: '-110.125' }], [inv3, cm3]); paid = paidOf(r); n++; check('S4', '3-decimal currency: credit memo 110.125 allocated -110.125 => paid Y', [paid[5], paid[6]], ['N', 'Y']);
  r = E.completeAllocation(H, [{ c_allocationline_id: 11, c_invoice_id: 5, c_bpartner_id: 3, amount: '110.124' }, { c_allocationline_id: 12, c_invoice_id: 6, c_bpartner_id: 3, amount: '-110.124' }], [inv3, cm3]); paid = paidOf(r); n++; check('S4', 'NEG-CONTROL one milli-unit short (-110.124 vs 110.125) => credit memo NOT paid (float x100 rounding would say paid)', [paid[6]], ['N']);
  // the AP / credit-memo sign rule has ONE owner (_invSign): AP invoice 80 allocated -80 is paid, the same lines on an AR invoice are not
  r = E.completeAllocation(H, [{ c_allocationline_id: 11, c_invoice_id: 8, c_bpartner_id: 3, amount: -80 }], [{ c_invoice_id: 8, issotrx: 'N', iscreditmemo: 'N', grandtotal: 80, dateacct: '2026-10-12', ispaid: 'N', allocatedamt: 0 }]); n++; check('S4', 'AP invoice 80 allocated -80: paid Y (sign negated for AP)', paidOf(r)[8], 'Y');
  r = E.completeAllocation(H, [{ c_allocationline_id: 11, c_invoice_id: 8, c_bpartner_id: 3, amount: -80 }], [{ c_invoice_id: 8, issotrx: 'Y', iscreditmemo: 'N', grandtotal: 80, dateacct: '2026-10-12', ispaid: 'N', allocatedamt: 0 }]); n++; check('S4', 'NEG-CONTROL the same line on an AR invoice: paid N', paidOf(r)[8], 'N');
  verdict('S4', n);
});

// ---- S5 cost + books of the return receipt and the credit memo: ISSUE = R-MMR4/R-MMR5/R-CM4 ----
section('S5', function () {
  var db = mkdb();
  db.exec("CREATE TABLE c_acctschema(c_acctschema_id INTEGER, m_costtype_id INTEGER, costingmethod TEXT, c_currency_id INTEGER, isactive TEXT);" +
    "CREATE TABLE c_currency(c_currency_id INTEGER, costingprecision INTEGER, stdprecision INTEGER);" +
    "CREATE TABLE m_costelement(m_costelement_id INTEGER, costelementtype TEXT, costingmethod TEXT, isactive TEXT);" +
    "CREATE TABLE m_product(m_product_id INTEGER, isstocked TEXT, producttype TEXT, m_product_category_id INTEGER);" +
    "CREATE TABLE m_cost(m_product_id INTEGER, c_acctschema_id INTEGER, m_costtype_id INTEGER, m_costelement_id INTEGER, currentcostprice NUMERIC, currentqty NUMERIC, cumulatedamt NUMERIC, cumulatedqty NUMERIC);" +
    "CREATE TABLE m_inout(m_inout_id INTEGER, issotrx TEXT, movementtype TEXT, dateacct TEXT, reversal_id INTEGER);" +
    "CREATE TABLE m_inoutline(m_inoutline_id INTEGER, m_inout_id INTEGER, m_product_id INTEGER, movementqty NUMERIC);" +
    "CREATE TABLE c_doctype(c_doctype_id INTEGER, docbasetype TEXT);" +
    "CREATE TABLE c_invoice(c_invoice_id INTEGER, c_bpartner_id INTEGER, grandtotal NUMERIC, issotrx TEXT, c_doctype_id INTEGER, c_doctypetarget_id INTEGER);" +
    "CREATE TABLE c_invoiceline(c_invoiceline_id INTEGER, c_invoice_id INTEGER, m_product_id INTEGER, linenetamt NUMERIC);" +
    "CREATE TABLE c_invoicetax(c_invoice_id INTEGER, c_tax_id INTEGER, taxamt NUMERIC);" +
    "INSERT INTO c_acctschema VALUES(1,1,'A',100,'Y');INSERT INTO c_currency VALUES(100,4,2);INSERT INTO m_costelement VALUES(7,'M','A','Y');INSERT INTO m_product VALUES(5,'Y','I',1);" +
    "INSERT INTO m_cost VALUES(5,1,1,7,33.7037037,27,910,27);" +
    "INSERT INTO m_inout VALUES(10,'Y','C+','2026-10-12 00:00:00',NULL),(11,'Y','C-','2026-10-12 00:00:00',NULL);INSERT INTO m_inoutline VALUES(100,10,5,2),(110,11,5,-2);" +
    "INSERT INTO c_doctype VALUES(1,'ARI'),(2,'ARC');" +
    "INSERT INTO c_invoice VALUES(20,3,110,'Y',1,1),(21,3,110,'Y',2,2),(22,3,110,'Y',0,2),(23,3,110,'Y',0,1);" +   // 22 = a DRAFT credit memo (C_DocType_ID 0, target ARC), 23 = a DRAFT AR invoice
    "INSERT INTO c_invoiceline VALUES(200,20,5,100),(210,21,5,100),(220,22,5,100),(230,23,5,100);INSERT INTO c_invoicetax VALUES(20,9,10),(21,9,10),(22,9,10),(23,9,10);");
  var n = 0, u = DP.costQtyUpdates(db, 10);
  n++; check('S5', 'customer return of 2 (C+): one cost update', u.length, 1);
  if (u.length) {
    n++; check('S5', 'CurrentQty 27 + 2 = 29 (MCostDetail addition)', u[0].set.currentqty, 29);
    n++; check('S5', 'weighted average with the cost detail amount at the COSTING precision (4 dp): 2 x 33.7037037 = 67.4074 -> (27 x 33.7037037 + 67.4074) / 29 = 33.70370344 (legacy pilot: 33.70370344)', u[0].set.currentcostprice, 33.70370344);
    n++; check('S5', 'a customer-shipment return does NOT accumulate: CumulatedQty/Amt unchanged (MCostDetail.isShipment, :1728-1734)', [u[0].set.cumulatedqty, u[0].set.cumulatedamt], [27, 910]);
  }
  // finding 9 -- the C- line of -2 is the reversal-style addition (sign -1 x -2 = +2): it re-adds via the 2-decimal books amount, NOT the 4-dp costing-precision amount the C+ branch uses.
  // hand-evaluated: amount 2 x 33.7037037 = 67.4074074 -> 67.41 (cents); (27 x 33.7037037 + 67.41) / 29 = 977.4099999 / 29 = 33.70379310 = 33.7037931 (8 dp)
  var u2 = DP.costQtyUpdates(db, 11); n++; check('S5', 'C- line of -2: one update, qty 27 + 2 = 29, price 33.7037931 (2-decimal amount) -- NOT 33.70370344 (the C+ branch), no accumulation', u2.length ? [u2.length, u2[0].set.currentqty, u2[0].set.currentcostprice, u2[0].set.cumulatedqty, u2[0].set.cumulatedamt] : [0], [1, 29, 33.7037931, 27, 910]);
  n++; check('S5', 'NEG-CONTROL the C+ return (33.70370344) and the C- re-add (33.7037931) price DIFFERENTLY from the same cost state, so a C- path routed through the C+ branch (or the reverse) is caught', u.length && u2.length ? u[0].set.currentcostprice !== u2[0].set.currentcostprice : null, true);
  // books: a stub resolver (account = the token) isolates the Dr/Cr SIDES
  var R = { resolve: function (d, token) { var id = { '{Product.Asset}': 11, '{Product.Cogs}': 12, '{Product.Revenue}': 13, '{Tax.Due}': 14, '{BPartner.Receivable}': 15 }[token]; return { acct: id, element: { id: id, value: token, name: token } }; } };
  var side = function (r) { return Object.keys(r.by).map(function (k) { var a = r.by[k]; return a.value + ':' + (a.dr ? 'DR' + a.dr : '') + (a.cr ? 'CR' + a.cr : ''); }).sort(); };
  var ret = DP.deriveInOut(db, R, 10, 1); n++; check('S5', 'return receipt books: Dr {Product.Asset} / Cr {Product.Cogs} at qty x CURRENT cost (2 x 33.7037037 = 67.41 -> cents 6741)', ret ? side(ret).concat(ret.absent) : null, ['{Product.Asset}:DR6741', '{Product.Cogs}:CR6741']);
  var ari = DP.deriveInvoice(db, R, 20, 1); n++; check('S5', 'AR invoice (ARI): Dr receivable / Cr revenue + tax due', side(ari), ['{BPartner.Receivable}:DR11000', '{Product.Revenue}:CR10000', '{Tax.Due}:CR1000']);
  var arc = DP.deriveInvoice(db, R, 21, 1); n++; check('S5', 'AR credit memo (ARC): the mirror -- Dr revenue + tax due / Cr receivable (Doc_Invoice.java:522-575; legacy pilot books DR10000+DR1000 / CR11000)', side(arc), ['{BPartner.Receivable}:CR11000', '{Product.Revenue}:DR10000', '{Tax.Due}:DR1000']);
  // finding 1 -- a DRAFT credit memo carries its type in C_DocTypeTarget_ID (C_DocType_ID = 0): the posting preview must still mirror it
  var drc = DP.deriveInvoice(db, R, 22, 1); n++; check('S5', 'DRAFT credit memo (C_DocType_ID 0, C_DocTypeTarget_ID ARC): mirrored books for the pre-completion preview', side(drc), ['{BPartner.Receivable}:CR11000', '{Product.Revenue}:DR10000', '{Tax.Due}:DR1000']);
  var dri = DP.deriveInvoice(db, R, 23, 1); n++; check('S5', 'NEG-CONTROL DRAFT AR invoice (C_DocType_ID 0, target ARI) is NOT mirrored', side(dri), ['{BPartner.Receivable}:DR11000', '{Product.Revenue}:CR10000', '{Tax.Due}:CR1000']);
  // regression found by the old-vs-new run: a posting db WITHOUT c_doctype (older seeds) must stay ARI, not throw "no such table"
  var db0 = mkdb(); db0.exec("CREATE TABLE c_invoice(c_invoice_id INTEGER, c_bpartner_id INTEGER, grandtotal NUMERIC, issotrx TEXT);CREATE TABLE c_invoiceline(c_invoiceline_id INTEGER, c_invoice_id INTEGER, m_product_id INTEGER, linenetamt NUMERIC);CREATE TABLE c_invoicetax(c_invoice_id INTEGER, c_tax_id INTEGER, taxamt NUMERIC);INSERT INTO c_invoice VALUES(1,3,110,'Y');INSERT INTO c_invoiceline VALUES(1,1,5,100);INSERT INTO c_invoicetax VALUES(1,9,10);");
  var nd = null; try { nd = side(DP.deriveInvoice(db0, R, 1, 1)); } catch (e) { nd = 'THREW ' + e.message; }
  n++; check('S5', 'posting db with NO c_doctype table: invoice books as ARI (no throw)', nd, ['{BPartner.Receivable}:DR11000', '{Product.Revenue}:CR10000', '{Tax.Due}:CR1000']);
  verdict('S5', n);
});

// ---- S6 ISSUE = books and cost detail AGREE for the return receipt (zero cost, reversal), the shared cost helper is byte-identical for shipments, over-receipt is accepted ----
section('S6', function () {
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
    "CREATE TABLE m_inout(m_inout_id INTEGER, issotrx TEXT, movementtype TEXT, dateacct TEXT, reversal_id INTEGER);CREATE TABLE m_inoutline(m_inoutline_id INTEGER, m_inout_id INTEGER, m_product_id INTEGER, movementqty NUMERIC, reversalline_id INTEGER);" +
    "INSERT INTO c_acctschema VALUES(1,1,'A',100,'Y');INSERT INTO c_currency VALUES(100,4,2);INSERT INTO m_costelement VALUES(7,'M','A','Y');INSERT INTO m_product VALUES(5,'Y','I',1),(6,'N','S',1);" +
    "INSERT INTO m_cost VALUES(5,1,1,7,60,10,600,10);" +
    "INSERT INTO m_inout VALUES(10,'Y','C+','2026-10-12 00:00:00',NULL),(12,'Y','C+','2026-10-12 00:00:00',10),(13,'Y','C-','2026-10-12 00:00:00',NULL),(14,'Y','C+','2026-10-12 00:00:00',NULL);" +
    "INSERT INTO m_inoutline VALUES(100,10,5,2,NULL),(120,12,5,-2,100),(130,13,5,2,NULL),(140,14,6,2,NULL);");
  var R = { resolve: function (d, token) { var id = { '{Product.Asset}': 11, '{Product.Cogs}': 12 }[token]; return { acct: id, element: { id: id, value: token, name: token } }; } };
  var amt = function () { var r = DP.deriveInOut(db, R, 10, 1); return r && r.by && r.by[11] ? r.by[11].dr : (r ? r.absent : null); };
  var before = amt(); db.exec("UPDATE m_cost SET currentcostprice=70");   // cost moved 60 -> 70 AFTER the original shipment (SD-16 fixture)
  var after = amt();
  n++; check('S6', 'return receipt of 2 books at the CURRENT cost, not the shipment cost: 60 -> 12000 cents, after the cost moves to 70 -> 14000', [before, after], [12000, 14000]);
  n++; check('S6', 'NEG-CONTROL the two amounts differ (a books routine that ignored the cost state could not satisfy S6 above)', before !== after, true);
  // finding 7 -- the shared per-line cost helper: the SHIPMENT books are unchanged (golden: qty 2 x 70 = 14000, Dr cogs / Cr asset)
  var sh = DP.deriveInOut(db, R, 13, 1); n++; check('S6', 'GOLDEN shipment (C-) books through the shared cost helper: Dr {Product.Cogs} / Cr {Product.Asset} 2 x 70 = 14000', sh ? [sh.by[12] && sh.by[12].dr, sh.by[11] && sh.by[11].cr, sh.absent.length] : null, [14000, 14000, 0]);
  // finding 6 -- books/cost agreement at ZERO cost: the posting error "No Costs for product 5" (Doc_InOut.java:535-545) leaves no books AND no cost detail
  n++; check('S6', 'cost 70, return receipt: one cost update (non-vacuous baseline for the zero-cost case)', DP.costQtyUpdates(db, 10).length, 1);
  db.exec("UPDATE m_cost SET currentcostprice=0");
  var z = DP.deriveInOut(db, R, 10, 1);
  n++; check('S6', 'zero current cost on a stocked product: books refused by name (No Costs), no accounts touched', [Object.keys(z.by).length, /^No Costs for product 5/.test(z.absent[0] || '')], [0, true]);
  n++; check('S6', 'the SAME document at zero cost moves no cost either (posting refused => no cost detail): costQtyUpdates = []', DP.costQtyUpdates(db, 10).length, 0);
  var u13 = DP.costQtyUpdates(db, 13); n++; check('S6', 'NEG-CONTROL other movements keep their previous path at zero cost: the C- shipment still reduces CurrentQty 10 -> 8', u13.length ? [u13.length, u13[0].set.currentqty] : [0], [1, 8]);
  var s14 = DP.deriveInOut(db, R, 14, 1), u14 = DP.costQtyUpdates(db, 14); n++; check('S6', 'a SERVICE return line (IsStocked N) is ignored by BOTH: no books, no "No Costs" error, no cost update', [Object.keys(s14.by).length, s14.absent.length, u14.length], [0, 0, 0]);
  // finding 10 -- the unported return REVERSAL (C+ with Reversal_ID): books empty AND named (G-SD10) AND no cost movement
  db.exec("UPDATE m_cost SET currentcostprice=70");
  var rv = DP.deriveInOut(db, R, 12, 1);
  n++; check('S6', 'return REVERSAL: books empty and named absent (G-SD10), never an invented amount', [Object.keys(rv.by).length, /G-SD10/.test(rv.absent[0] || '')], [0, true]);
  n++; check('S6', 'return REVERSAL: cost detail refused too (books and cost agree) -- the cost row does not change when the books are empty', DP.costQtyUpdates(db, 12).length, 0);
  n++; check('S6', 'NEG-CONTROL the same return WITHOUT Reversal_ID produces both books and a cost update', [Object.keys(DP.deriveInOut(db, R, 10, 1).by).length, DP.costQtyUpdates(db, 10).length], [2, 1]);
  verdict('S6', n);
});
log('§SD16P_VERDICT ' + (fails ? 'FAIL' : incs ? 'INCONCLUSIVE' : 'PASS') + ' fails=' + fails + ' inconclusive=' + incs);
process.exit(fails ? 1 : incs ? 2 : 0);
})();
