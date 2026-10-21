#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-ASI-POLICY (bim-compiler prompts/ERP_PRODUCT_ATTRIBUTE_ASI.md §4 AS-3; TWIN CARDINAL RULE). READ THE LOG: §ASP lines and the verdict §ASP-SUMMARY; the exit code alone is not evidence.
// THE ISSUE it proves/disproves: a shipment picks which lot/instance to take with MInOut.checkMaterialPolicy :2354-2475 -> MStorageOnHand.getWarehouse :398-533: instances whose guarantee date is NOT after the
//   movement date are skipped, order = locator priority, then DateMaterialPolicy (or the guarantee date when the product says "use guarantee date for material policy") ascending for FiFo / descending
//   for LiFo, then instance id, then bigger quantity first. The twin ordered by DateMaterialPolicy only, so an EXPIRED lot could be shipped and the guarantee-date policy was ignored.
//   Part 1 (ORACLE, ordinary use of makedoc, rolled back): a plain shipment of a product with no instances - legacy's auto-allocation rows vs the twin's (the no-instance path must not move).
//   Part 2 (TWIN-ONLY = NOTED-AS-DESIGNED, §62: the pilot has no stock with a guarantee date and no config may change): four storage rows (one expired, one no-instance, two lots) judged against
//   the Java ordering for FiFo, LiFo, guarantee-date policy, tie-break and the line-locator scope. Zero judged prints INCONCLUSIVE, never PASS.
//   Negative controls (MUST exit 1): ASP_BREAK=noexpiry (guarantee-date filter off) / nogdpolicy (product flag ignored) / notiebreak (instance-id tie-break off).
// Run: NODE_PATH=$HOME/bim-ootb/tests/node_modules:$HOME/bim-ootb/node_modules node erp/tests/witness_asi_policy.js   (pilot + oracle :8097)
'use strict';
var C = require('./dd_common.js');
var pass = 0, fail = 0, inc = 0, noted = 0, judged = 0, BREAK = process.env.ASP_BREAK || '';
var log = function (s) { console.log(s); };
var ok = function (id, n, c, d) { judged++; log((c === null ? '  ⚠ ' : c ? '  ✅ ' : '  ❌ ') + id + ' ' + n + (d ? ' — ' + d : '')); c === null ? inc++ : c ? pass++ : fail++; };
var note = function (id, d) { noted++; log('  ℹ NOTED-AS-DESIGNED ' + id + ' - ' + d); };

(async function main() {
  var H = await C.boot(), TODAY = H.TODAY, q = H.q, lc = C.lc, ML = H.ML;
  var ASI = require('../model_asi.js');
  if (process.env.ASP_DEBUG) { var ap0 = H.apply; H.apply = function (ops) { ops.filter(function (o) { return /m_storageonhand|m_inoutlinema/.test(o.table); }).forEach(function (o) { console.log('    §ASP-OP ' + o.op_type + ' ' + o.table + ' ' + JSON.stringify(o.fields || o.changes || o.id).slice(0, 200)); }); return ap0.apply(H, arguments); }; }
  var realStorages = ASI.storages;
  if (BREAK) ASI.storages = function (trx, o) {   // negative controls: each switches ONE clause of the rule off
    var rows = realStorages(trx, Object.assign({}, o, BREAK === 'noexpiry' ? { minGuaranteeDate: null } : {}));
    if (BREAK === 'nogdpolicy') { rows = realStorages(trx, o); var pr = trx.get('m_attributeset', 102); if (pr && pr.useguaranteedateformpolicy === 'Y') rows.sort(function (a, b) { return String(a.datematerialpolicy) < String(b.datematerialpolicy) ? (o.fifo ? -1 : 1) : (o.fifo ? 1 : -1); }); }
    if (BREAK === 'notiebreak') rows.sort(function (a, b) { return String(a.datematerialpolicy) < String(b.datematerialpolicy) ? -1 : String(a.datematerialpolicy) > String(b.datematerialpolicy) ? 1 : (o.fifo ? -1 : 1) * (Number(b.m_attributesetinstance_id) - Number(a.m_attributesetinstance_id)); });
    return rows;
  };
  log('§ASP-SEED patches ok=' + H.patchOk + ' failed=' + H.patchBad + ' today=' + TODAY + ' break=' + (BREAK || 'none'));
  var CTX = Object.assign({ date: TODAY }, H.ctx);
  var HDR = { AD_Org_ID: 11, C_DocTypeTarget_ID: 132, C_DocType_ID: 0, IsSOTrx: 'Y', C_BPartner_ID: 112, C_BPartner_Location_ID: 108, Bill_BPartner_ID: 112, Bill_Location_ID: 108, M_Warehouse_ID: 103,
    M_PriceList_ID: 101, C_Currency_ID: 100, C_PaymentTerm_ID: 108, SalesRep_ID: 101, PaymentRule: 'P', InvoiceRule: 'I', DeliveryRule: 'F', DeliveryViaRule: 'P', PriorityRule: '5', FreightCostRule: 'I',
    DocAction: 'CO', DateOrdered: TODAY, DateAcct: TODAY, DatePromised: TODAY };
  var sp = null, n = 0;
  var fresh = function () { if (sp) { H.rollback(sp); sp = null; } sp = 's' + (++n); H.begin(sp); };
  var day = function (k) { var d = new Date(TODAY + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10) + ' 00:00:00'; };
  var lineOf = function (prod, qty) { return { AD_Org_ID: 11, M_Product_ID: prod, QtyEntered: qty, QtyOrdered: qty, C_UOM_ID: 100, C_Tax_ID: 104, M_Warehouse_ID: 103 }; };
  var twinOrder = function (prod, qty, dt) {
    var t0 = new ML.Trx(q, H.env()), hf = lc(HDR); hf.c_doctypetarget_id = dt || 132; delete hf.c_doctype_id; hf.docstatus = 'DR'; hf.processed = 'N'; hf.isapproved = 'N'; hf.posted = 'N'; hf.totallines = 0; hf.grandtotal = 0;
    var h = H.run({ table: 'c_order', timing: 'SAVE', changes: ML.newPO(t0, 'c_order', Object.assign({ c_doctype_id: 0 }, hf)) }); if (!h.ok) return { ok: false, msg: 'order header: ' + (h.error || h.msg) };
    var oid = H.lastId('c_order');
    var lr = H.run({ table: 'c_orderline', timing: 'SAVE', changes: ML.newPO(t0, 'c_orderline', Object.assign({ c_order_id: oid, priceentered: 0, priceactual: 0, pricelist: 0, qtydelivered: 0, qtyinvoiced: 0, qtyreserved: 0, line: 10, isdescription: 'N', processed: 'N' }, lc(lineOf(prod, qty)))) });
    if (!lr.ok) return { ok: false, msg: 'order line: ' + (lr.error || lr.msg) };
    var co = H.docAction('c_order', oid, 'CO'); return { ok: !!co.ok, msg: co.msg || co.error || '', id: oid, olid: H.lastId('c_orderline') };
  };
  var loc = (q("SELECT m_locator_id AS l FROM m_locator WHERE m_warehouse_id=103 AND isdefault='Y'")[0] || q('SELECT m_locator_id AS l FROM m_locator WHERE m_warehouse_id=103')[0]).l;
  var shipOut = function (prod, qty, locator) {   // a shipment of `qty` completed on the twin -> the auto-generated MA rows in write order
    var od = twinOrder(prod, qty); if (!od.ok) return { ok: false, msg: 'fixture order: ' + od.msg };
    var h = H.save('m_inout', { c_order_id: od.id, ad_org_id: 11, c_doctype_id: 120, issotrx: 'Y', movementtype: 'C-', c_bpartner_id: 112, c_bpartner_location_id: 108, m_warehouse_id: 103, movementdate: TODAY, dateacct: TODAY, docaction: 'CO', docstatus: 'DR', deliveryrule: 'A', deliveryviarule: 'P', freightcostrule: 'I', priorityrule: '5', processed: 'N', posted: 'N' });
    if (!h.ok) return { ok: false, msg: 'shipment header: ' + (h.error || h.msg) };
    var iid = H.lastId('m_inout');
    var l = H.save('m_inoutline', { m_inout_id: iid, c_orderline_id: od.olid, line: 10, m_product_id: prod, movementqty: qty, qtyentered: qty, c_uom_id: 100, m_locator_id: locator || loc, ad_org_id: 11 });
    if (!l.ok) return { ok: false, msg: 'shipment line: ' + (l.error || l.msg) };
    var lid = H.lastId('m_inoutline'), r;
    try { r = H.docAction('m_inout', iid, 'CO'); } catch (e) { var lg = (H.logs || []).slice(-6).join(' | '); return { ok: false, msg: 'commit threw: ' + e.message + ' || last logs: ' + lg.slice(0, 600) }; }
    var ma = q('SELECT m_attributesetinstance_id AS asi, movementqty AS qty, substr(datematerialpolicy,1,10) AS dmp FROM m_inoutlinema WHERE m_inoutline_id=? ORDER BY rowid', [lid]);
    return { ok: !!r.ok, msg: r.msg || r.error || '', ma: ma, lid: lid };
  };
  var fmt = function (ma) { return ma.map(function (m) { return (m.asi || 0) + ':' + Number(m.qty); }).join(','); };

  // ── Part 1: ORACLE - no-instance path must not move (a shipment of Elm spanning the pilot's FiFo rows) ───────────────────
  var PRODS = q("SELECT DISTINCT s.m_product_id AS p FROM m_storageonhand s JOIN m_locator l ON l.m_locator_id=s.m_locator_id WHERE l.m_warehouse_id=103 AND s.qtyonhand>0 AND COALESCE(s.m_attributesetinstance_id,0)=0 LIMIT 1");
  note('P1', 'the pilot stock has no instances and no guarantee dates: Part 1 proves only that the instance-free allocation (MA rows) is unchanged; ordering by guarantee date is twin-only');
  if (PRODS.length) {
    var pid = PRODS[0].p;
    try {
      var L = (await C.oracle({ op: 'makedoc', ctx: CTX, header: { table: 'C_Order', fields: Object.assign({}, HDR, { C_DocTypeTarget_ID: 133 }) }, lines: [{ table: 'C_OrderLine', parentColumn: 'C_Order_ID', fields: lineOf(pid, 1) }], action: 'CO', queries: { ma: 'SELECT ma.m_attributesetinstance_id AS asi, ma.movementqty AS qty FROM m_inoutlinema ma JOIN m_inoutline l ON l.m_inoutline_id=ma.m_inoutline_id JOIN m_inout i ON i.m_inout_id=l.m_inout_id WHERE i.c_order_id=?' } })).doc;
      fresh(); var T1 = twinOrder(pid, 1, 133);   // 'On Credit Order' auto-creates the shipment, so there is an allocation to compare
      ok('P1-order', 'product ' + pid + ': legacy and twin both complete the 1-unit order', L.docStatus === 'CO' && T1.ok, 'legacy=' + L.docStatus + ' ' + (L.processMsg || '') + ' twin=' + T1.ok + ' ' + T1.msg);
      var lmA = (L.rows.ma || []).map(function (m) { return (m.asi || 0) + ':' + Number(m.qty); }).join(','), tmA = fmt(q('SELECT ma.m_attributesetinstance_id AS asi, ma.movementqty AS qty FROM m_inoutlinema ma JOIN m_inoutline l ON l.m_inoutline_id=ma.m_inoutline_id JOIN m_inout i ON i.m_inout_id=l.m_inout_id WHERE i.c_order_id=?', [T1.id]));
      log('§ASP P1 legacy MA=[' + lmA + '] twin MA=[' + tmA + ']');
      ok('P1-ma', 'the auto-generated allocation of the order\'s shipment is the same', lmA === '' ? null : lmA === tmA, 'legacy=[' + lmA + '] twin=[' + tmA + ']' + (lmA === '' ? ' (legacy made no allocation row - nothing judged)' : ''));
    } catch (e) { ok('P1', 'oracle reachable', false, String(e.message)); }
  } else ok('P1', 'a product with stock in warehouse 103', null, 'no stocked product found in the twin seed - Part 1 not judged');

  // ── Part 2: TWIN-ONLY ordering rule ────────────────────────────────────────────────────────────────────────────────────
  note('T', 'getWarehouse ordering with guarantee dates cannot be run in legacy (no such stock, no config change allowed); expected rows are the Java rule applied by hand to the fixture');
  var P = 133, asiSet = 102;
  var mk = function () {   // fixture: A1 (gd +10d, dmp -30d) A2 (gd -1d EXPIRED, dmp -60d) A3 (gd +100d, dmp -10d) none(asi 0, dmp -5d); plus A4 same dmp as A1 for the tie-break
    H.db.run('DELETE FROM m_storageonhand WHERE m_product_id=?', [P]);
    [[9101, 10], [9102, -1], [9103, 100], [9104, 10]].forEach(function (a) { H.db.run("INSERT INTO m_attributesetinstance (m_attributesetinstance_id, ad_client_id, ad_org_id, isactive, m_attributeset_id, guaranteedate, description) VALUES (?,11,0,'Y',?,?,?)", [a[0], asiSet, day(a[1]), 'A' + (a[0] - 9100)]); });
    // NB the Trx identifies a composite-key row by its _uu, so every fixture row carries one
    [[9101, -30, 5], [9102, -60, 5], [9103, -10, 5], [0, -5, 5], [9104, -30, 5]].forEach(function (s) { H.db.run("INSERT INTO m_storageonhand (m_product_id, m_locator_id, m_attributesetinstance_id, ad_client_id, ad_org_id, isactive, qtyonhand, datematerialpolicy, m_storageonhand_uu) VALUES (?,?,?,11,11,'Y',?,?,?)", [P, loc, s[0], s[2], day(s[1]), 'asp-' + s[0] + '-' + s[1]]); });
  };
  var setPolicy = function (fifo, gd) {
    H.db.run("UPDATE m_attributeset SET isguaranteedate='Y', useguaranteedateformpolicy=? WHERE m_attributeset_id=?", [gd ? 'Y' : 'N', asiSet]);
    H.db.run("UPDATE m_product_category SET mmpolicy=? WHERE m_product_category_id=(SELECT m_product_category_id FROM m_product WHERE m_product_id=?)", [fifo ? 'F' : 'L', P]);
  };
  var CASES = [
    { id: 'C1-fifo-skips-expired', fifo: true, gd: false, qty: 7, exp: '9101:5,9104:2', note: 'FiFo: oldest DateMaterialPolicy first; the EXPIRED lot (9102, dmp oldest) is skipped; 9101 and 9104 share a date -> lower instance id first' },
    { id: 'C2-lifo', fifo: false, gd: false, qty: 7, exp: '0:5,9103:2', note: 'LiFo: newest DateMaterialPolicy first (no-instance row dmp -5d, then 9103 dmp -10d)' },
    { id: 'C3-fifo-guarantee-policy', fifo: true, gd: true, qty: 7, exp: '0:5,9101:2', note: 'FiFo + product "use guarantee date for policy": order by COALESCE(GuaranteeDate, dmp): the no-instance row (dmp -5d) is before the lots (gd +10d / +100d); 9101 before 9104 (same gd, lower id)' },
    { id: 'C4-lifo-guarantee-policy', fifo: false, gd: true, qty: 7, exp: '9103:5,9104:2', note: 'LiFo + guarantee-date policy: latest key first: 9103 (gd +100d), then 9104 / 9101 (same gd, higher instance id first)' },
    { id: 'C5-over-delivery', fifo: true, gd: false, qty: 22, exp: '9101:5,9104:5,9103:5,0:5,0:2', note: 'more than is on hand (20 usable): the rest is a no-instance over-delivery row dated the movement date (merged by addOrCreate only into a same-instance same-date row)' }
  ];
  CASES.forEach(function (K) {
    fresh(); mk(); setPolicy(K.fifo, K.gd);
    var r = shipOut(P, K.qty), got = r.ma ? fmt(r.ma) : '';
    log('§ASP case=' + K.id + ' ok=' + r.ok + ' msg=' + r.msg + ' MA=[' + got + '] expected=[' + K.exp + ']');
    ok(K.id, K.note, !!r.ma && r.ma.length > 0 && got === K.exp, 'got=[' + got + '] expected=[' + K.exp + '] ' + (r.ok ? '' : 'complete refused: ' + r.msg));
  });
  // locator scope: stock in ANOTHER locator of the warehouse must not be used when the line names its locator
  fresh(); mk(); setPolicy(true, false);
  var base = q('SELECT * FROM m_locator WHERE m_locator_id=?', [loc])[0], other = 9300001;   // a second locator of the warehouse (twin-only fixture, rolled back with the case)
  var lcols = Object.keys(base), lrow = Object.assign({}, base, { m_locator_id: other, isdefault: 'N', value: 'ASP-L2', x: 'ASP', priorityno: 99, m_locator_uu: 'asp-loc-2' });
  H.db.run('INSERT INTO m_locator (' + lcols.join(',') + ') VALUES (' + lcols.map(function () { return '?'; }).join(',') + ')', lcols.map(function (k) { return lrow[k] === undefined ? null : lrow[k]; }));
  if (other) { H.db.run("INSERT INTO m_storageonhand (m_product_id, m_locator_id, m_attributesetinstance_id, ad_client_id, ad_org_id, isactive, qtyonhand, datematerialpolicy, m_storageonhand_uu) VALUES (?,?,0,11,11,'Y',50,?,'asp-other')", [P, other, day(-500)]);
    var r6 = shipOut(P, 3), g6 = r6.ma ? fmt(r6.ma) : '';
    ok('C6-line-locator-scope', 'a huge old row in ANOTHER locator is not used: the line\'s locator is searched only (getWarehouse M_Locator_ID>0)', g6 === '9101:3', 'got=[' + g6 + ']'); }
  else ok('C6-line-locator-scope', 'warehouse 103 has a second locator', null, 'none in the seed - not judged');

  var verdict = judged === 0 ? 'INCONCLUSIVE' : fail > 0 ? 'FAIL' : inc > 0 ? 'INCONCLUSIVE' : 'PASS';
  log('§ASP-SUMMARY verdict=' + verdict + ' judged=' + judged + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + ' noted_as_designed=' + noted + ' break=' + (BREAK || 'none'));
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(function (e) { console.log('§ASP-SUMMARY verdict=ERROR ' + (e && e.stack || e)); process.exit(2); });
