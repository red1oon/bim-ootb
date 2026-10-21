#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-ASI-MANDATORY (bim-compiler prompts/ERP_PRODUCT_ATTRIBUTE_ASI.md §4 AS-2; TWIN CARDINAL RULE). READ THE LOG: §ASM lines and the verdict §ASM-SUMMARY; the exit code alone is not evidence.
// THE ISSUE it proves/disproves: "Attribute Set Instance is mandatory" was never enforced on the twin: the MOrder.prepareIt check tested a column that does not exist on M_AttributeSet (ismandatory), treated
//   MandatoryType 'S' (When Shipping) as an order-time refusal, ignored Batch/Lot costing, IsInstanceAttribute and the set's excludes, and MInOut.prepareIt (:1510-1545) had NO check at all.
//   Part 1 (ORACLE, ordinary use of makedoc, rolled back): the pilot's three attribute sets are all MandatoryType N and every costing level is Client, so legacy completes a sales order for each
//   set-bearing product - the twin must complete the same (no spurious refusal). Part 2 (TWIN-ONLY = NOTED-AS-DESIGNED, §62: no pilot config may change, so a mandatory set cannot exist in legacy):
//   the twin DB is changed locally and the verdicts are the Java rule MProduct.isASIMandatoryFor :1028-1056 / MOrder.prepareIt :1633-1649 / MInOut.prepareIt :1510-1545 (truth table + three real
//   documents). Zero judged prints INCONCLUSIVE, never PASS. Negative controls (MUST exit 1): ASM_BREAK=nocheck (rule always false) / nowhenship (MInOut passes no type) / noexclude.
// Run: NODE_PATH=$HOME/bim-ootb/tests/node_modules:$HOME/bim-ootb/node_modules node erp/tests/witness_asi_mandatory.js   (pilot + oracle :8097)
'use strict';
var C = require('./dd_common.js');
var pass = 0, fail = 0, inc = 0, noted = 0, judged = 0, BREAK = process.env.ASM_BREAK || '';
var log = function (s) { console.log(s); };
var ok = function (id, n, c, d) { judged++; log((c === null ? '  ⚠ ' : c ? '  ✅ ' : '  ❌ ') + id + ' ' + n + (d ? ' — ' + d : '')); c === null ? inc++ : c ? pass++ : fail++; };
var note = function (id, d) { noted++; log('  ℹ NOTED-AS-DESIGNED ' + id + ' - ' + d); };

(async function main() {
  var H = await C.boot(), TODAY = H.TODAY, q = H.q, lc = C.lc, ML = H.ML;
  var ASI = require('../model_asi.js');
  var real = { amf: ASI.asiMandatoryFor, ex: ASI.excludeTableEntry };
  if (BREAK === 'nocheck') ASI.asiMandatoryFor = function () { return false; };
  if (BREAK === 'nowhenship') ASI.asiMandatoryFor = function (trx, p, t, so) { return real.amf(trx, p, null, so); };
  if (BREAK === 'noexclude') ASI.excludeTableEntry = function () { return false; };
  log('§ASM-SEED patches ok=' + H.patchOk + ' failed=' + H.patchBad + ' today=' + TODAY + ' break=' + (BREAK || 'none'));
  var CTX = Object.assign({ date: TODAY }, H.ctx);
  var HDR = { AD_Org_ID: 11, C_DocTypeTarget_ID: 133, C_DocType_ID: 0, IsSOTrx: 'Y', C_BPartner_ID: 112, C_BPartner_Location_ID: 108, Bill_BPartner_ID: 112, Bill_Location_ID: 108, M_Warehouse_ID: 103,
    M_PriceList_ID: 101, C_Currency_ID: 100, C_PaymentTerm_ID: 108, SalesRep_ID: 101, PaymentRule: 'P', InvoiceRule: 'I', DeliveryRule: 'F', DeliveryViaRule: 'P', PriorityRule: '5', FreightCostRule: 'I',
    DocAction: 'CO', DateOrdered: TODAY, DateAcct: TODAY, DatePromised: TODAY };
  var sp = null, n = 0;
  var fresh = function () { if (sp) { H.rollback(sp); sp = null; } sp = 's' + (++n); H.begin(sp); };
  var lineOf = function (prod, extra) { return Object.assign({ AD_Org_ID: 11, M_Product_ID: prod, QtyEntered: 1, QtyOrdered: 1, C_UOM_ID: 100, C_Tax_ID: 104, M_Warehouse_ID: 103 }, extra || {}); };
  // twin sales order: header + one line + CO -> { ok, msg, status }
  var twinOrder = function (line, dt) {
    var t0 = new ML.Trx(q, H.env()), hf = lc(HDR); hf.c_doctypetarget_id = dt || 132; delete hf.c_doctype_id; hf.docstatus = 'DR'; hf.processed = 'N'; hf.isapproved = 'N'; hf.posted = 'N'; hf.totallines = 0; hf.grandtotal = 0;
    var h = H.run({ table: 'c_order', timing: 'SAVE', changes: ML.newPO(t0, 'c_order', Object.assign({ c_doctype_id: 0 }, hf)) });
    if (!h.ok) return { ok: false, msg: 'header save refused: ' + (h.error || h.msg) };
    var oid = H.lastId('c_order');
    var lr = H.run({ table: 'c_orderline', timing: 'SAVE', changes: ML.newPO(t0, 'c_orderline', Object.assign({ c_order_id: oid, priceentered: 0, priceactual: 0, pricelist: 0, qtydelivered: 0, qtyinvoiced: 0, qtyreserved: 0, line: 10, isdescription: 'N', processed: 'N' }, lc(line))) });
    if (!lr.ok) return { ok: false, msg: 'line save refused: ' + (lr.error || lr.msg) };
    var co = H.docAction('c_order', oid, 'CO');
    return { ok: !!co.ok, msg: co.msg || co.error || '', status: (q('SELECT docstatus FROM c_order WHERE c_order_id=?', [oid])[0] || {}).docstatus, id: oid };
  };

  // ── Part 1: ORACLE pass-through (all sets MandatoryType N, costing level Client) ──────────────────────────────────────
  var PRODS = [{ id: 148, nm: 'TShirt-GL (set 100)' }, { id: 133, nm: 'PChair (set 102, serial no)' }, { id: 136, nm: 'Fertilizer#50 (set 101, lot)' }];
  for (var pi = 0; pi < PRODS.length; pi++) {
    var P = PRODS[pi], L;
    try { L = (await C.oracle({ op: 'makedoc', ctx: CTX, header: { table: 'C_Order', fields: HDR }, lines: [{ table: 'C_OrderLine', parentColumn: 'C_Order_ID', fields: lineOf(P.id) }], action: 'CO', queries: { hdr: 'SELECT docstatus FROM c_order WHERE c_order_id=?' } })).doc; }
    catch (e) { ok('ORACLE-' + P.id, 'oracle reachable', false, String(e.message)); continue; }
    if (L.exception) { ok('P1-' + P.id, 'legacy built the order', null, 'LEGACY-REFUSED ' + String(L.exception).slice(0, 160)); continue; }
    fresh(); var T1 = twinOrder(lineOf(P.id));
    ok('P1-' + P.id, P.nm + ': legacy docStatus=' + L.docStatus + ' - twin must complete the same', L.docStatus === 'CO' && T1.ok && T1.status === 'CO', 'legacy=' + L.docStatus + ' (' + (L.processMsg || '') + ') twin=' + T1.status + ' ' + T1.msg);
  }

  // ── Part 2a: the rule as a truth table (source transcription of MProduct.isASIMandatoryFor :1028-1056) ──────────────────
  note('T-TABLE', 'no legacy set can be mandatory (pilot config frozen, §62): expected values are the Java rule transcribed per case');
  var prod = function () { return q('SELECT * FROM m_product WHERE m_product_id=133')[0]; };
  var tr = new ML.Trx(q, H.env()), bad = [], cnt = 0;
  ['N', 'Y', 'S'].forEach(function (mt) { ['Y', 'N'].forEach(function (inst) { ['B', 'C'].forEach(function (cl) { [true, false].forEach(function (so) { [null, 'S'].forEach(function (arg) {
    fresh();
    H.db.run("UPDATE m_attributeset SET mandatorytype=?, isinstanceattribute=? WHERE m_attributeset_id=102", [mt, inst]);
    H.db.run("UPDATE m_product_category_acct SET costinglevel=? WHERE m_product_category_id=?", [cl === 'B' ? 'B' : null, prod().m_product_category_id]);
    var t2 = new ML.Trx(q, H.env()), got = ASI.asiMandatoryFor(t2, prod(), arg, so);
    var exp = cl === 'B' ? true : (inst === 'Y' && (so ? (mt === 'Y' || (mt === 'S' && arg === 'S')) : mt === 'Y'));
    cnt++; if (got !== exp) bad.push(mt + '/' + inst + '/' + cl + '/' + (so ? 'SO' : 'PO') + '/' + arg + ' got=' + got + ' exp=' + exp);
  }); }); }); }); });
  ok('T-TABLE', cnt + ' combinations (MandatoryType x IsInstanceAttribute x costing level x direction x type argument)', cnt === 48 && bad.length === 0, bad.slice(0, 5).join('; ') || undefined);

  // ── Part 2b: three real documents on the twin ────────────────────────────────────────────────────────────────────────
  var pv = prod().value;
  fresh(); H.db.run("UPDATE m_attributeset SET mandatorytype='Y' WHERE m_attributeset_id=102");
  var A = twinOrder(lineOf(133));
  ok('D1-order-always-no-asi', "set 'Always mandatory', sales order line without instance -> refused with the legacy words naming line and product", !A.ok && A.status !== 'CO' && new RegExp('IsMandatory.*Line.*#10.*M_Product_ID@=' + pv).test(A.msg), 'status=' + A.status + ' msg=' + A.msg);
  fresh(); H.db.run("UPDATE m_attributeset SET mandatorytype='Y' WHERE m_attributeset_id=102");
  var A2 = twinOrder(lineOf(133, { M_AttributeSetInstance_ID: 100 }));
  ok('D1b-order-always-with-asi', 'same set, line WITH an instance -> completes', A2.ok && A2.status === 'CO', 'status=' + A2.status + ' msg=' + A2.msg);
  fresh(); H.db.run("UPDATE m_attributeset SET mandatorytype='S' WHERE m_attributeset_id=102");
  var A3 = twinOrder(lineOf(133));
  ok('D2-order-whenshipping', "set 'When Shipping': a Standard Order (no auto shipment) completes (legacy passes type null at order time)", A3.ok && A3.status === 'CO', 'status=' + A3.status + ' msg=' + A3.msg);
  fresh(); H.db.run("UPDATE m_attributeset SET mandatorytype='S' WHERE m_attributeset_id=102");
  var A3b = twinOrder(lineOf(133), 133);
  ok('D2b-order-whenshipping-autoship', "same set on an 'On Credit Order' (auto-creates the shipment): the shipment's Prepare refuses, so the order does not complete (legacy MOrder.completeIt -> MInOut.prepareIt)", !A3b.ok && A3b.status !== 'CO', 'status=' + A3b.status + ' msg=' + A3b.msg);
  fresh(); H.db.run("UPDATE m_attributeset SET mandatorytype='Y' WHERE m_attributeset_id=102"); H.db.run("INSERT INTO m_attributesetexclude (m_attributesetexclude_id, ad_client_id, ad_org_id, isactive, m_attributeset_id, ad_table_id, issotrx) VALUES (9100001, 11, 0, 'Y', 102, 260, 'Y')");
  var A4 = twinOrder(lineOf(133));
  ok('D3-order-excluded', "set 'Always' but the set EXCLUDES C_OrderLine for sales (M_AttributeSetExclude) -> completes", A4.ok && A4.status === 'CO', 'status=' + A4.status + ' msg=' + A4.msg);
  fresh(); H.db.run("UPDATE m_attributeset SET mandatorytype='N' WHERE m_attributeset_id=102"); H.db.run("UPDATE m_product_category_acct SET costinglevel='B' WHERE m_product_category_id=?", [prod().m_product_category_id]);
  var A5 = twinOrder(lineOf(133));
  ok('D4-order-batchlot-costing', "costing level Batch/Lot -> instance mandatory even though the set says 'not mandatory'", !A5.ok && A5.status !== 'CO' && /IsMandatory/.test(A5.msg), 'status=' + A5.status + ' msg=' + A5.msg);

  // shipment (MInOut.prepareIt): header + line saved straight on the twin, then Prepare
  var loc = q("SELECT m_locator_id AS l FROM m_locator WHERE m_warehouse_id=103 AND isdefault='Y'")[0] || q('SELECT m_locator_id AS l FROM m_locator WHERE m_warehouse_id=103')[0];
  var shipment = function (extraLine, maRows) {
    var od = twinOrder(lineOf(133)); if (!od.ok) return { ok: false, msg: 'fixture order did not complete: ' + od.msg };   // an outgoing shipment line needs its order line (MInOutLine.beforeSave :655-662)
    var olid = H.lastId('c_orderline');
    var h = H.save('m_inout', { c_order_id: od.id, ad_org_id: 11, c_doctype_id: 120, issotrx: 'Y', movementtype: 'C-', c_bpartner_id: 112, c_bpartner_location_id: 108, m_warehouse_id: 103, movementdate: TODAY, dateacct: TODAY, docaction: 'CO', docstatus: 'DR', deliveryrule: 'A', deliveryviarule: 'P', freightcostrule: 'I', priorityrule: '5', processed: 'N', posted: 'N' });
    if (!h.ok) return { ok: false, msg: 'shipment header refused: ' + (h.error || h.msg) };
    var iid = H.lastId('m_inout');
    var l = H.save('m_inoutline', Object.assign({ m_inout_id: iid, c_orderline_id: olid, line: 10, m_product_id: 133, movementqty: 1, qtyentered: 1, c_uom_id: 100, m_locator_id: loc && loc.l, ad_org_id: 11 }, extraLine || {}));
    if (!l.ok) return { ok: false, msg: 'shipment line refused: ' + (l.error || l.msg) };
    var lid = H.lastId('m_inoutline');
    (maRows || []).forEach(function (m) { H.db.run('INSERT INTO m_inoutlinema (m_inoutline_id, m_attributesetinstance_id, ad_client_id, ad_org_id, isactive, movementqty, datematerialpolicy, isautogenerated) VALUES (?,?,11,11,\'Y\',?,?,?)', [lid, m.asi, m.qty, TODAY + ' 00:00:00', m.auto ? 'Y' : 'N']); });
    var r = H.docAction('m_inout', iid, 'PR');
    return { ok: !!r.ok, msg: r.msg || r.error || '', status: (q('SELECT docstatus FROM m_inout WHERE m_inout_id=?', [iid])[0] || {}).docstatus };
  };
  fresh(); H.db.run("UPDATE m_attributeset SET mandatorytype='S' WHERE m_attributeset_id=102");
  var S1 = shipment();
  ok('D5-shipment-whenshipping-no-asi', "set 'When Shipping', shipment line without instance and without allocation -> Prepare refused (legacy MInOut.java:1525-1541)", !S1.ok && S1.status !== 'IP' && new RegExp('IsMandatory.*Line.*#10.*M_Product_ID@=' + pv).test(S1.msg), 'status=' + S1.status + ' msg=' + S1.msg);
  fresh(); H.db.run("UPDATE m_attributeset SET mandatorytype='S' WHERE m_attributeset_id=102");
  var S2 = shipment({}, [{ asi: 100, qty: 1, auto: false }]);
  ok('D6-shipment-whenshipping-with-ma', 'same set, the line is covered by a manual allocation (MA) row for its full quantity -> Prepare passes', S2.ok && S2.status === 'IP', 'status=' + S2.status + ' msg=' + S2.msg);
  fresh(); H.db.run("UPDATE m_attributeset SET mandatorytype='S' WHERE m_attributeset_id=102");
  var S3 = shipment({}, [{ asi: 100, qty: 1, auto: true }]);
  ok('D7-shipment-auto-ma-does-not-count', 'an AUTO-generated allocation does not satisfy the rule (legacy sums only non-auto MA rows) -> refused', !S3.ok && S3.status !== 'IP', 'status=' + S3.status + ' msg=' + S3.msg);
  fresh(); H.db.run("UPDATE m_attributeset SET mandatorytype='N' WHERE m_attributeset_id=102");
  var S4 = shipment();
  ok('D8-shipment-not-mandatory', "set 'not mandatory' -> the shipment Prepare passes (no spurious refusal)", S4.ok && S4.status === 'IP', 'status=' + S4.status + ' msg=' + S4.msg);

  var verdict = judged === 0 ? 'INCONCLUSIVE' : fail > 0 ? 'FAIL' : inc > 0 ? 'INCONCLUSIVE' : 'PASS';
  log('§ASM-SUMMARY verdict=' + verdict + ' judged=' + judged + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + ' noted_as_designed=' + noted + ' break=' + (BREAK || 'none'));
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(function (e) { console.log('§ASM-SUMMARY verdict=ERROR ' + (e && e.stack || e)); process.exit(2); });
