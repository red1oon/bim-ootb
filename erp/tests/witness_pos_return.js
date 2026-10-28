#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-POS-RETURN (bim-compiler prompts/TEAMWORK_FRAMEWORK.md §42.2 "a return is a -1 order line", owner 2026-10-28; film evidence gap 6). CARDINAL RULE: the twin does what LEGACY does, it invents no return mechanism.
//   READ THE LOG after every run: every verdict is a §RET line, the exit code is not the evidence. A mutant that CRASHES is NOT a kill. INCONCLUSIVE when nothing was judged.
// THE ISSUE: the film says a return is a -1 order line. What does LEGACY iDempiere do with an I_Order line whose QtyOrdered is -1 on the POS Order doctype? MEASURED FROM LEGACY SOURCE (~/idempiere-dev-setup/idempiere, read 2026-10-28):
//   L1  ImportOrder.java:748  line.setQty(imp.getQtyOrdered()) - NO sign check anywhere in the import (no validation of QtyOrdered in the prepare/validate UPDATEs :90-300); the line is saved as given.
//   L2  MOrderLine.java:738-747 setQtyOrdered only enforces the product UOM precision (setScale), never the sign.  MOrder.java:1967,1979 prepareIt handles `QtyOrdered.signum() < 0` explicitly (legacy EXPECTS negative lines).
//   L3  MOrder.java:2198-2205,2257 completeIt on DocSubTypeSO WR (POS Order, C_DocType 135 here): shipment (createShipment) THEN invoice (createInvoice) - the same path for a negative line; no refusal.
//   L4  MOrder.java:2443  shipment MovementQty = QtyOrdered - QtyDelivered  => -1.  MInOut.java:1275-1285 / MInOut.java:1292-1301  MovementType comes from the SHIPMENT DOCTYPE (MMS, SOTrx) = 'C-' (Customer Shipment); it does NOT become 'C+' (Customer Returns).
//   L5  MInOut.java:1688-1691  Qty = sLine.getMovementQty(); if MovementType.charAt(1)=='-' Qty = Qty.negate()  => the M_Transaction is MovementType 'C-' with MovementQty +1 and MStorageOnHand.add(+1) (:1936-1948,:1914-1923): STOCK GOES UP by 1. For a product without ASI the MA path does the same: MInOut.java:1772-1773 QtyMA = QtyMA.negate() for a '-' type (the twin's live path, model_order.js 'qma').
//   L6  MOrder.java:2517-2521  invoice line QtyInvoiced = shipment line MovementQty (-1); invoice doctype = dt.getC_DocTypeInvoice_ID() (117 AR Invoice, DocBaseType ARI - NOT a credit memo ARC): an ordinary invoice with a NEGATIVE line and a NEGATIVE GrandTotal.
//   L7  Legacy's own return document is the RMA (M_RMA, MovementType 'C+', credit memo ARC). A -1 ticket line does NOT use it. The film must say what the -1 line does: a negative shipment (C-, +1 on hand) and a negative invoice.
// SPEC (the claims; every expectation below is computed from L1-L6 and the DICTIONARY, never copied from the twin):
//   RET0  PRECONDITION  the dictionary says what L3/L4/L6 assume: POS Order (135) is DocBaseType SOO / DocSubTypeSO WR; its shipment doctype is MMS with IsSOTrx=Y (=> 'C-'); its invoice doctype is ARI (not ARC). Non-vacuous: N>0 documents are judged in every case below.
//   RET1  CONTROL SALE  a +1 line (product 123, 65.00) through Import Orders (DocAction=CO): ONE order CO with GrandTotal=+65, ONE shipment C- with line +1, M_Transaction C- qty -1, on-hand -1 at the transaction's locator, ONE ARI invoice CO +65.
//   RET2  RETURN        a -1 line (same product, same price): the import REFUSES NOTHING (I_IsImported=Y, empty I_ErrorMsg), ONE order CO with line QtyOrdered=-1 and GrandTotal=-65; ONE shipment CO, MovementType C- (not C+), line MovementQty=-1;
//                       M_Transaction MovementType C- with MovementQty=+1 and on-hand +1 at the same locator; ONE invoice CO, doctype ARI (117), line QtyInvoiced=-1, GrandTotal=-65. No M_RMA made, no 'C+' transaction.
//   RET3  MIXED TICKET  one ticket with +2 of product 123 and -1 of product 130 (50.00): ONE order, two lines, GrandTotal=2*65-50=80; the shipment has lines +2 and -1; the on-hand moves -2 and +1 respectively; ONE invoice of 80 whose lines are +2 and -1.
//   RET4  ONCE          a second Import Orders run makes nothing new (document counts unchanged) - a return is not replayed.
// Every check names the issue it proves; INCONCLUSIVE when nothing was judged. Why NODE and not a browser: the claim is about the legacy model chain (import -> order -> shipment -> transaction -> invoice), which the page runs through the SAME ws_kernel/model_layer code as this Node harness (W-POS-SALES/W-IMPORT-ORDER boot);
//   a browser arm would only add the menu path, which W-HQ-CLERK already judges for Import Orders.
// MUTANTS (RET_MUTANTS=1): each rewrites the shipped twin in a mirror of COPIES (never symlinks), proves the rewrite APPLIED exactly once, and the named check must go FAIL in a child run that prints its verdict (a crash = not killed).
// Command: node --no-experimental-fetch erp/tests/witness_pos_return.js 2>&1 | tee /tmp/witness_pos_return.log
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = process.env.RET_ERP || path.join(__dirname, '..'), MUTANT = process.env.RET_MUTANT || '';
var SQLJS_DIR = process.env.SQLJS_DIR || '/home/red1/bim-ootb/tests/node_modules/sql.js';
if (!process.env.SQLJS) process.env.SQLJS = SQLJS_DIR;
var initSqlJs = require(SQLJS_DIR);
var _log = console.log, SEEN = [];
console.log = function () { SEEN.push(Array.prototype.join.call(arguments, ' ')); };          // the shipped § lines are kept, not printed
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 };
function check(cs, key, rule, ok, info) { var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §RET-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + JSON.stringify(info))); }
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }; var v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§RET-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed + (MUTANT ? ' mutant=' + MUTANT : '')); return v; }
function J(x) { return JSON.stringify(x); }
function guard(cs, key, rule, fn) { try { fn(); } catch (e) { check(cs, key, rule, false, 'threw: ' + (e && (e.message || e.stack) || String(e))); } }
var num = function (x) { return x == null ? null : Number(x); }, cents = function (x) { return Math.round(Number(x) * 100); };

(async function main() {
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIR, 'dist', f); } });
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); } catch (e) { /* idempotent self-heal, as the host loader */ } });
  require(path.join(ERP, 'ad_import_tables.js')).ensure(db); require(path.join(ERP, 'ad_rule.js')).ensure(db);
  var K = require(path.join(ERP, 'ws_kernel.js')), k = K.build(db), ML = k.ML, AP = require(path.join(ERP, 'ad_process.js'));
  var S = { clientId: 11, orgId: 11, userId: 100, roleId: 102, warehouseId: 103, actor: 'witness:pos-return' };
  function q(sql, p) { return k.q(sql, p || []); }
  function one(sql, p) { return q(sql, p)[0] || null; }
  function commit(fn) { var trx = new ML.Trx(k.q, Object.assign(k.env(S), { noPost: true })), r;       // posting is not part of this claim (W-POST-* judge it); a stock/document claim needs none
    try { r = fn(trx, ML) || { ok: true }; } catch (ex) { r = { ok: false, error: 'model threw: ' + (ex && ex.message) }; }
    var ok = r.ok !== false, ops = ok ? trx.groupOps() : []; if (ok && ops.length) k.commit(S, ops, {}); return Object.assign({}, r, { ok: ok, log: trx.log }); }
  function deposit(rows) { return commit(function (trx) { for (var i = 0; i < rows.length; i++) { var sv = ML.save(trx, 'i_order', null, ML.newPO(trx, 'i_order', rows[i])); if (!sv.ok) return { ok: false, error: sv.error }; } return { ok: true }; }); }
  function importOrders() { return commit(function (trx) { var r0 = AP.runInTrx(trx, 206, { params: { AD_Client_ID: 11, AD_Org_ID: 11, DocAction: 'CO' } }); return { ok: r0.ok, error: r0.summary, summary: r0.summary }; }); }
  function line(key, prod, qty, price) { return { i_isimported: 'N', issotrx: 'Y', documentno: key, doctypename: 'POS Order', m_product_id: prod, qtyordered: qty, priceactual: price, c_uom_id: 100, dateordered: '2026-10-28 00:00:00', ad_org_id: 11 }; }
  function onhand(prod, loc) { return num(one('SELECT COALESCE(SUM(qtyonhand),0) AS q FROM m_storageonhand WHERE m_product_id=? AND m_locator_id=?', [prod, loc]).q); }
  function counts() { var o = {}; ['c_order', 'c_orderline', 'm_inout', 'm_inoutline', 'm_transaction', 'c_invoice', 'c_invoiceline', 'm_rma'].forEach(function (t) { o[t] = one('SELECT count(*) AS n FROM ' + t).n; }); return o; }
  var SHIPPED = []; function keep(r) { (r.log || []).forEach(function (l) { if (/^§(IMPORT_ORDER|MODEL-ERR|PROC-)/.test(l)) SHIPPED.push(l); }); }
  say('§RET-LOAD erp=' + ERP + ' mutant=' + (MUTANT || 'none'));

  // ═══ RET0 the dictionary assumptions ═══
  var DT = {};
  guard('RET0', 'doctypes', 'POS Order (WR) -> shipment doctype MMS SOTrx=Y (movement type C-) and invoice doctype ARI (not ARC), read from the dictionary', function () {
    var pos = one("SELECT c_doctype_id AS id, docbasetype AS b, docsubtypeso AS s, c_doctypeshipment_id AS sh, c_doctypeinvoice_id AS inv FROM c_doctype WHERE name='POS Order' AND ad_client_id=11");
    var sh = pos && one('SELECT docbasetype AS b, issotrx AS so FROM c_doctype WHERE c_doctype_id=?', [pos.sh]), iv = pos && one('SELECT docbasetype AS b FROM c_doctype WHERE c_doctype_id=?', [pos.inv]);
    DT = { pos: pos && num(pos.id), ship: pos && num(pos.sh), inv: pos && num(pos.inv) };
    check('RET0', 'doctypes', 'POS Order ' + J(pos) + ' shipment doctype ' + J(sh) + ' invoice doctype ' + J(iv), !!pos && pos.b === 'SOO' && pos.s === 'WR' && !!sh && sh.b === 'MMS' && sh.so === 'Y' && !!iv && iv.b === 'ARI', { pos: pos, sh: sh, iv: iv });
  });

  // one ticket = deposit its lines, run Import Orders, then read EVERYTHING back with independent SQL
  function runTicket(key, lines) {
    var c0 = counts(), d = deposit(lines), imp = importOrders(); keep(imp);
    var io = q('SELECT i_isimported AS imp, i_errormsg AS err FROM i_order WHERE documentno=?', [key]);
    var ord = q('SELECT * FROM c_order WHERE documentno=?', [key]), o = ord[0];
    var ol = o ? q('SELECT * FROM c_orderline WHERE c_order_id=? ORDER BY line', [o.c_order_id]) : [];
    var ios = o ? q('SELECT * FROM m_inout WHERE c_order_id=?', [o.c_order_id]) : [], io1 = ios[0];
    var iol = io1 ? q('SELECT l.*, (SELECT t.movementtype FROM m_transaction t WHERE t.m_inoutline_id=l.m_inoutline_id) AS tt, (SELECT t.movementqty FROM m_transaction t WHERE t.m_inoutline_id=l.m_inoutline_id) AS tq, (SELECT COUNT(*) FROM m_transaction t WHERE t.m_inoutline_id=l.m_inoutline_id) AS tn FROM m_inoutline l WHERE m_inout_id=? ORDER BY line', [io1.m_inout_id]) : [];
    var invs = o ? q('SELECT * FROM c_invoice WHERE c_order_id=?', [o.c_order_id]) : [], iv = invs[0];
    var il = iv ? q('SELECT * FROM c_invoiceline WHERE c_invoice_id=? ORDER BY line', [iv.c_invoice_id]) : [];
    return { key: key, c0: c0, c1: counts(), dep: d, imp: imp, io: io, ord: ord, ol: ol, ios: ios, iol: iol, invs: invs, il: il };
  }
  // the shipment picks the locator itself (MStorageOnHand.getM_Locator_ID / default locator, MOrder.java:2452-2458): so the on-hand is watched at EVERY locator that holds the product
  function stockWatch(prods, fn) {                                                                                     // run fn; compare on-hand at EVERY locator that holds the product or received a transaction
    function snap() { var o = {}; prods.forEach(function (p) { q('SELECT m_locator_id AS l, SUM(qtyonhand) AS q FROM m_storageonhand WHERE m_product_id=? GROUP BY m_locator_id', [p]).forEach(function (r) { o[p + '@' + r.l] = num(r.q); }); }); return o; }
    var a = snap(), r = fn(), b = snap(), delta = {}; Object.keys(Object.assign({}, a, b)).forEach(function (kk) { var d = Math.round(((b[kk] || 0) - (a[kk] || 0)) * 1000) / 1000; if (d !== 0) delta[kk] = d; }); r.delta = delta; return r; }
  function sumDelta(r, prod) { return Object.keys(r.delta).filter(function (kk) { return kk.indexOf(prod + '@') === 0; }).reduce(function (s, kk) { return s + r.delta[kk]; }, 0); }
  var PRICE = { 123: 65, 130: 50 };

  // ═══ RET1 control sale ═══
  var R1 = null; guard('RET1', 'sale', 'the +1 control through Import Orders makes order/shipment/transaction/invoice with the sale signs', function () {
    R1 = stockWatch([123], function () { return runTicket('RET/SALE', [line('RET/SALE', 123, 1, 65)]); });
    var r = R1;
    check('RET1', 'sale', 'imported Y no error; ONE order CO +65; ONE shipment C- line +1; ONE transaction C- qty -1; on-hand -1; ONE ARI invoice CO +65 (doctype ' + DT.inv + ') line +1',
      r.dep.ok && r.io.length === 1 && r.io[0].imp === 'Y' && !String(r.io[0].err || '').trim() && r.ord.length === 1 && r.ord[0].docstatus === 'CO' && cents(r.ord[0].grandtotal) === 6500 && r.ol.length === 1 && num(r.ol[0].qtyordered) === 1
      && r.ios.length === 1 && r.ios[0].docstatus === 'CO' && r.ios[0].movementtype === 'C-' && r.iol.length === 1 && num(r.iol[0].movementqty) === 1 && r.iol[0].tt === 'C-' && num(r.iol[0].tq) === -1 && r.iol[0].tn === 1 && sumDelta(r, 123) === -1
      && r.invs.length === 1 && r.invs[0].docstatus === 'CO' && num(r.invs[0].c_doctype_id) === DT.inv && cents(r.invs[0].grandtotal) === 6500 && r.il.length === 1 && num(r.il[0].qtyinvoiced) === 1,
      { dep: r.dep.ok, io: r.io, ord: r.ord.map(function (x) { return [x.docstatus, x.grandtotal]; }), ios: r.ios.map(function (x) { return [x.docstatus, x.movementtype]; }), iol: r.iol, delta: r.delta, invs: r.invs.map(function (x) { return [x.docstatus, x.c_doctype_id, x.grandtotal]; }), il: r.il.map(function (x) { return x.qtyinvoiced; }) });
  });

  // ═══ RET2 the return ═══
  var R2 = null; guard('RET2', 'return', 'a -1 line is accepted and does the legacy thing: negative order, C- shipment of -1, transaction +1, on-hand +1, negative ARI invoice', function () {
    var rma0 = one('SELECT count(*) AS n FROM m_rma').n;
    R2 = stockWatch([123], function () { return runTicket('RET/RETURN', [line('RET/RETURN', 123, -1, 65)]); });
    var r = R2;
    check('RET2', 'accepted', 'Import Orders refuses nothing: the I_Order row is I_IsImported=Y with an empty I_ErrorMsg, summary "#1/1", ONE order for the key (L1: no sign check)',
      r.dep.ok && r.imp.ok && r.io.length === 1 && r.io[0].imp === 'Y' && !String(r.io[0].err || '').trim() && /#1\//.test(String(r.imp.summary)) && r.ord.length === 1, { io: r.io, summary: r.imp.summary, err: r.imp.error, orders: r.ord.length });
    check('RET2', 'order', 'ONE order CO on POS Order (135), ONE line with QtyOrdered=-1 and LineNetAmt=-65, GrandTotal=-65 (L2/L3)',
      r.ord.length === 1 && r.ord[0].docstatus === 'CO' && num(r.ord[0].c_doctype_id) === DT.pos && r.ol.length === 1 && num(r.ol[0].qtyordered) === -1 && cents(r.ol[0].linenetamt) === -6500 && cents(r.ord[0].grandtotal) === -6500, { ord: r.ord.map(function (x) { return [x.docstatus, x.c_doctype_id, x.grandtotal]; }), ol: r.ol.map(function (x) { return [x.qtyordered, x.linenetamt]; }) });
    check('RET2', 'shipment', 'ONE shipment CO whose MovementType is C- (NOT C+, L4) and whose line MovementQty is -1 (QtyOrdered-QtyDelivered)',
      r.ios.length === 1 && r.ios[0].docstatus === 'CO' && r.ios[0].movementtype === 'C-' && r.iol.length === 1 && num(r.iol[0].movementqty) === -1, { ios: r.ios.map(function (x) { return [x.docstatus, x.movementtype, x.c_doctype_id]; }), iol: r.iol.map(function (x) { return x.movementqty; }) });
    check('RET2', 'stock', 'ONE M_Transaction with MovementType C- and MovementQty +1 (L5: Qty = MovementQty.negate() for a "-" type) and the on-hand of product 123 goes UP by 1 (measured at every locator); the control sale (RET1) went DOWN by 1',
      r.iol.length === 1 && r.iol[0].tn === 1 && r.iol[0].tt === 'C-' && num(r.iol[0].tq) === 1 && sumDelta(r, 123) === 1 && R1 && sumDelta(R1, 123) === -1, { tn: r.iol[0] && r.iol[0].tn, tt: r.iol[0] && r.iol[0].tt, tq: r.iol[0] && r.iol[0].tq, delta: r.delta, control: R1 && R1.delta });
    check('RET2', 'invoice', 'ONE invoice CO on the POS Order\'s invoice doctype (' + DT.inv + ' = ARI, not a credit memo), line QtyInvoiced=-1, LineNetAmt=-65, GrandTotal=-65 (L6)',
      r.invs.length === 1 && r.invs[0].docstatus === 'CO' && num(r.invs[0].c_doctype_id) === DT.inv && r.il.length === 1 && num(r.il[0].qtyinvoiced) === -1 && cents(r.il[0].linenetamt) === -6500 && cents(r.invs[0].grandtotal) === -6500, { invs: r.invs.map(function (x) { return [x.docstatus, x.c_doctype_id, x.grandtotal]; }), il: r.il.map(function (x) { return [x.qtyinvoiced, x.linenetamt]; }) });
    check('RET2', 'no-rma', 'no RMA document and no C+ transaction was made (L7: a -1 line is not legacy\'s RMA return)', one('SELECT count(*) AS n FROM m_rma').n === rma0 && one("SELECT count(*) AS n FROM m_transaction WHERE movementtype='C+'").n === 0, { rma: one('SELECT count(*) AS n FROM m_rma').n - rma0, cplus: one("SELECT count(*) AS n FROM m_transaction WHERE movementtype='C+'").n });
  });

  // ═══ RET3 mixed ticket ═══
  var R3 = null; guard('RET3', 'mixed', 'one ticket with +2 of 123 and -1 of 130: one order of 80, shipment lines +2 / -1, stock -2 / +1, one invoice of 80', function () {
    R3 = stockWatch([123, 130], function () { return runTicket('RET/MIXED', [line('RET/MIXED', 123, 2, 65), line('RET/MIXED', 130, -1, 50)]); });
    var r = R3, byProd = function (rows, p) { return rows.filter(function (x) { return num(x.m_product_id) === p; })[0] || {}; };
    check('RET3', 'mixed', 'ONE order CO GrandTotal=80 (2*65-50) with 2 lines; ONE shipment C- lines +2 and -1 with transactions -2 and +1; on-hand 123: -2, 130: +1; ONE invoice CO of 80 with lines +2 and -1',
      r.dep.ok && r.ord.length === 1 && r.ord[0].docstatus === 'CO' && cents(r.ord[0].grandtotal) === 8000 && r.ol.length === 2
      && r.ios.length === 1 && r.ios[0].movementtype === 'C-' && r.iol.length === 2 && num(byProd(r.iol, 123).movementqty) === 2 && num(byProd(r.iol, 130).movementqty) === -1 && num(byProd(r.iol, 123).tq) === -2 && num(byProd(r.iol, 130).tq) === 1
      && sumDelta(r, 123) === -2 && sumDelta(r, 130) === 1 && r.invs.length === 1 && cents(r.invs[0].grandtotal) === 8000 && r.il.length === 2 && num(byProd(r.il, 123).qtyinvoiced) === 2 && num(byProd(r.il, 130).qtyinvoiced) === -1,
      { ord: r.ord.map(function (x) { return x.grandtotal; }), iol: r.iol.map(function (x) { return [x.m_product_id, x.movementqty, x.tq]; }), delta: r.delta, il: r.il.map(function (x) { return [x.m_product_id, x.qtyinvoiced]; }), invs: r.invs.map(function (x) { return x.grandtotal; }) });
  });

  // ═══ RET4 once ═══
  guard('RET4', 'again', 'a second Import Orders run makes nothing new (document counts unchanged): a return is not replayed', function () {
    var c0 = counts(), imp = importOrders(), c1 = counts(); keep(imp);
    check('RET4', 'again', 'summary "#0/0" and the counts of c_order/m_inout/m_transaction/c_invoice are unchanged (' + J(c0) + ')', imp.ok && /#0\/0/.test(String(imp.summary)) && J(c0) === J(c1), { summary: imp.summary, c0: c0, c1: c1 });
  });

  var kinds = {}; SHIPPED.forEach(function (l) { var kk = l.split(' ')[0]; kinds[kk] = (kinds[kk] || 0) + 1; });
  say('§RET-SHIPPED-LOG lines=' + SHIPPED.length + ' kinds=' + J(kinds));
  SHIPPED.filter(function (l) { return /^§IMPORT_ORDER/.test(l); }).forEach(function (l) { say('  ' + l.slice(0, 200)); });
  [['RET/SALE', R1], ['RET/RETURN', R2], ['RET/MIXED', R3]].forEach(function (x) { var r = x[1]; if (!r) return;
    say('  §RET-FACT ticket=' + x[0] + ' order_total=' + (r.ord[0] && r.ord[0].grandtotal) + ' shipment_type=' + (r.ios[0] && r.ios[0].movementtype) + ' shipment_qty=' + J(r.iol.map(function (y) { return y.movementqty; })) + ' transaction=' + J(r.iol.map(function (y) { return y.tt + ':' + y.tq; })) + ' onhand_delta=' + J(r.delta) + ' invoice_doctype=' + (r.invs[0] && r.invs[0].c_doctype_id) + ' invoice_total=' + (r.invs[0] && r.invs[0].grandtotal) + ' invoice_qty=' + J(r.il.map(function (y) { return y.qtyinvoiced; }))); });
  ['RET0', 'RET1', 'RET2', 'RET3', 'RET4'].map(verdict);
  var failedCases = Object.keys(CASES).filter(function (c) { return CASES[c].failed; });
  var all = !ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : 'PASS';
  say('§RET-RESULT verdict=' + all + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' failedCases=' + J(failedCases) + (MUTANT ? ' mutant=' + MUTANT : ''));
  var exitCode = all === 'PASS' ? 0 : 1;

  // ═══ mutants (RET_MUTANTS=1, parent run only) ═══
  if (process.env.RET_MUTANTS && !MUTANT) {
    var MUTS = [
      { name: 'invoice-qty-abs', file: 'model_invoice.js', from: 'C.ilSetQtyInvoiced(trx, iLine, sLine.movementqty);', to: 'C.ilSetQtyInvoiced(trx, iLine, Math.abs(Number(sLine.movementqty)));', kills: ['RET2.invoice', 'RET3.mixed'], what: 'the invoice of a negative shipment line is made positive' },
      { name: 'transaction-sign-abs', file: 'model_order.js', from: 'var qma = out ? D(ma.movementqty).negate() : D(ma.movementqty);', to: "var qma = out ? D(String(Math.abs(Number(ma.movementqty)))).negate() : D(ma.movementqty);", kills: ['RET2.stock', 'RET3.mixed'], what: 'a negative customer-shipment line still takes stock out (the MA path of MInOut.completeIt :1772)' },
      { name: 'import-qty-abs', file: 'processes/ImportOrder.js', from: "if (nz(line.get('c_uom_id')) !== 0) qty = qty.setScale(uomPrec(line.get('c_uom_id')), HU);", to: "if (nz(line.get('c_uom_id')) !== 0) qty = qty.setScale(uomPrec(line.get('c_uom_id')), HU); qty = qty.abs();", kills: ['RET2.order', 'RET3.mixed'], what: 'Import Orders forces positive quantities' },
      { name: 'shipment-qty-abs', file: 'model_order.js', from: "var MovementQty = D(oLine.qtyordered).subtract(D(oLine.qtydelivered));", to: "var MovementQty = D(oLine.qtyordered).subtract(D(oLine.qtydelivered)).abs();", kills: ['RET2.shipment', 'RET3.mixed'], what: 'the shipment line of a negative order line is positive' },
      { name: 'return-as-C-plus', file: 'model_order.js', from: "var mt = io.movementtype, out = mt.charAt(1) === '-'", to: "var mt = io.movementtype, out = mt.charAt(1) === '-' && D(ls0qty(trx, io)).signum() >= 0", kills: ['RET2.stock'], what: 'a negative shipment is treated as an incoming (C+) movement: the transaction keeps the -1 sign' }];
    // the last mutant needs a helper in scope: define it next to the anchor so the rewrite stays a one-place edit
    MUTS[4].to = "var ls0 = trx.find('m_inoutline', { m_inout_id: io.m_inout_id }), ls0q = ls0.length ? ls0[0].movementqty : 0, mt = io.movementtype, out = mt.charAt(1) === '-' && D(String(ls0q)).signum() >= 0";
    var killed = 0, applied = 0, notApplied = [], crashed = [], survived = [], jobs = [];
    MUTS.forEach(function (m) {
      var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'retmut_'));
      fs.readdirSync(ERP).forEach(function (f) { try { fs.symlinkSync(path.join(ERP, f), path.join(dir, f)); } catch (e) {} });
      fs.readdirSync(ERP).forEach(function (f) { var src = path.join(ERP, f), st = fs.statSync(src);                  // every .js/.html module and the callouts/processes/plugins folders are COPIED, never symlinked
        if ((st.isFile() && /\.(js|html)$/.test(f)) || (st.isDirectory() && (f === 'callouts' || f === 'processes' || f === 'plugins'))) { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} fs.cpSync(src, path.join(dir, f), { recursive: true }); } });
      var src2 = fs.readFileSync(path.join(dir, m.file), 'utf8'), have = src2.split(m.from).length - 1;
      if (have !== 1) { notApplied.push(m.name); say('§RET-MUTANT ' + m.name + ' NOT-APPLIED (anchor found ' + have + ' times, expected 1: the mutant proves nothing)'); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} return; }
      fs.writeFileSync(path.join(dir, m.file), src2.split(m.from).join(m.to)); applied++; jobs.push({ m: m, dir: dir });
    });
    for (var ji = 0; ji < jobs.length; ji++) {
      var job = jobs[ji], kk = cp.spawnSync(process.execPath, ['--no-experimental-fetch', __filename], { encoding: 'utf8', timeout: 600000, env: Object.assign({}, process.env, { RET_ERP: job.dir, RET_MUTANT: job.m.name, RET_MUTANTS: '' }) });
      var out = (kk.stdout || '') + (kk.stderr || ''), rl = out.split('\n').filter(function (l) { return /^§RET-RESULT /.test(l); })[0], failedLines = out.split('\n').filter(function (l) { return /§RET-CHECK .* FAIL /.test(l); });
      var named = job.m.kills.filter(function (kn) { return failedLines.some(function (l) { return l.indexOf('case=' + kn.split('.')[0] + ' key=' + kn.split('.')[1] + ' ') >= 0; }); });
      if (!rl) { crashed.push(job.m.name); say('§RET-MUTANT ' + job.m.name + ' CRASHED (no verdict line; a crash is NOT a kill) ' + out.split('\n').filter(function (l) { return /Error/.test(l); })[0]); }
      else if (/verdict=FAIL/.test(rl) && named.length) { killed++; say('§RET-MUTANT ' + job.m.name + ' KILLED by ' + named.join(' | ') + ' :: ' + job.m.what); }
      else { survived.push(job.m.name); say('§RET-MUTANT ' + job.m.name + ' SURVIVED verdict=' + (rl.match(/verdict=\w+/) || [''])[0] + ' expected ' + job.m.kills.join(' | ') + ' failedChecks=' + failedLines.length); }
      try { fs.rmSync(job.dir, { recursive: true, force: true }); } catch (e) {}
    }
    var nSel = jobs.length + notApplied.length, mv = (killed === nSel && !notApplied.length && !crashed.length && !survived.length) ? 'PASS' : 'FAIL';
    say('§RET-MUTANTS verdict=' + mv + ' total=' + nSel + ' applied=' + applied + ' killed=' + killed + ' notApplied=' + J(notApplied) + ' crashed=' + J(crashed) + ' survived=' + J(survived));
    if (mv !== 'PASS') exitCode = 1;
  }
  process.exit(exitCode);
})().catch(function (e) { say('§RET-RESULT verdict=FAIL harness: ' + (e && e.stack)); process.exit(2); });
