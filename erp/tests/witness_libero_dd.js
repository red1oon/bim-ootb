#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-LIBERO-DD (prompts/mfg/LIBERO_DD_SPEC.md §4-§5). READ THE LOG: §LDD lines and the verdict §LDD-VERDICT; the exit code alone is not evidence.
// THE ISSUE it proves/disproves: with the Libero bundle ACTIVE, MFG_Validator keeps PP_MRP in step with Distribution Orders (MPPMRP.DD_Order / DD_OrderLine :1034-1133) and a COMPLETED M_Movement updates the DD line's QtyInTransit /
//   QtyDelivered and the order's IsInTransit (MFG_Validator :322-358). The pilot has NO Libero bundle, so there is no oracle for these hooks: every expected value below is HAND-COMPUTED from the Java quoted next to it, from rows
//   read independently of the code under test (locators/warehouses straight from the seed). The core DD order and movement documents they sit on ARE oracle-compared (witness_dd_order_diff.js, witness_movement_diff.js).
//   The UI path is used (DOCACTION through the document workflow: the document is saved after processIt, MWFActivity.performWork :1131-1140), the bundle through the real plugin START (lazy).
// Negative control (MUST exit 1): LDD_BREAK=nomove (the M_Movement DOC_AFTER_COMPLETE validator removed) -> H5/H6 red. Zero judged prints INCONCLUSIVE, never PASS.
// Run: NODE_PATH=$HOME/bim-ootb/tests/node_modules:$HOME/bim-ootb/node_modules node erp/tests/witness_libero_dd.js
'use strict';
var C = require('./dd_common.js');
var pass = 0, fail = 0, inc = 0, judged = 0, BREAK = process.env.LDD_BREAK || '';
var log = function (s) { console.log(s); };
var ok = function (id, n, c, d) { judged++; log((c === null ? '  ⚠ ' : c ? '  ✅ ' : '  ❌ ') + id + ' ' + n + (d && !c ? ' — ' + (typeof d === 'object' ? JSON.stringify(d) : d) : '')); c === null ? inc++ : c ? pass++ : fail++; };

(async function main() {
  var H = await C.boot(), TODAY = H.TODAY, q = H.q, one = H.one, MV = H.MV;
  log('§LDD-SEED patches ok=' + H.patchOk + ' failed=' + H.patchBad + ' today=' + TODAY + ' break=' + (BREAK || 'none'));
  // ── H0 the bundle: lazy trigger on DD_Order, then ACTIVE with the DD hooks and the Doc_DDOrder class registered ──────────────────────
  var tokens = {}, ops = [], hostDb = { query: q, run: function (sql, p) { H.db.run(sql, p || []); } };
  var host = { engineVersion: '1.0.0', db: hostDb, ops: { append: function (t) { ops.push(t); return ops.length; } }, modelval: MV, callout: H.A, process: require('../ad_process.js'), postTokens: tokens, docAction: H.ML,
    docClass: require('../doc_poster.js'), docFsm: H.FSM, import: function (u) { return import(u); } };
  var reg = H.PR.create(host), _l = console.log; console.log = function () {};
  await reg.installBundle('file://' + require('path').join(H.ERP, 'plugins', 'libero_manufacturing.mjs')); await reg.startBundle('org.idempiere.mfg');
  var pend = reg.hasPending({ table: 'dd_order' }), pendMv = reg.hasPending({ table: 'm_movement' }), st0 = reg.get('org.idempiere.mfg').state;
  await reg.need({ table: 'dd_order' }); var st1 = reg.get('org.idempiere.mfg').state; console.log = _l;
  var has = function (t, tm) { return !!((MV.REGISTRY[t] || {})[tm] || []).length; };
  log('§LDD-H0 after START state=' + st0 + ' pending(dd_order)=' + pend + ' pending(m_movement)=' + pendMv + ' -> after need(dd_order) state=' + st1 + ' hooks dd_orderline.AFTER_NEW=' + has('dd_orderline', 'AFTER_NEW') + ' m_movement.AFTER_COMPLETE=' + has('m_movement', 'AFTER_COMPLETE'));
  ok('H0', 'DD_Order / M_Movement are lazy triggers of the Libero bundle: STARTING with them pending, the first demand ACTIVATES it and registers the DD + movement validators', st0 === 'STARTING' && pend === true && pendMv === true && st1 === 'ACTIVE' && has('dd_order', 'AFTER_CHANGE') && has('dd_orderline', 'BEFORE_DELETE') && has('m_movement', 'AFTER_COMPLETE') && !!require('../doc_poster.js').docClassFor('dd_order'), { st0: st0, pend: pend, st1: st1 });
  if (BREAK === 'nomove') { var arr = (MV.REGISTRY.m_movement || {}).AFTER_COMPLETE || []; arr.splice(0, arr.length); }

  // ── independent facts (read from the seed, not from the code under test) ──────────────────────────────────────────────────────
  var loc = function (id) { return one('SELECT m_locator_id, ad_org_id, m_warehouse_id FROM m_locator WHERE m_locator_id=?', [id]); };
  var SRC = loc(101), TGT = loc(102), TRN = loc(50000), BP = 112, BP2 = 113, PROD = 124, QTY = 7, PROMISED = '2026-11-05';
  var wh = function (id) { return one('SELECT isintransit FROM m_warehouse WHERE m_warehouse_id=?', [id]); };
  log('§LDD-FACT source locator 101 org=' + SRC.ad_org_id + ' wh=' + SRC.m_warehouse_id + ' | target locator 102 org=' + TGT.ad_org_id + ' wh=' + TGT.m_warehouse_id + ' | transit locator 50000 wh=' + TRN.m_warehouse_id + ' isInTransit=' + wh(TRN.m_warehouse_id).isintransit + ' | target wh isInTransit=' + wh(TGT.m_warehouse_id).isintransit);
  var HDR = { ad_org_id: 11, c_doctype_id: 50012, c_bpartner_id: BP, c_bpartner_location_id: 108, m_warehouse_id: 103, salesrep_id: 101, dateordered: TODAY, datepromised: TODAY, issotrx: 'N', isindispute: 'N', isintransit: 'N', docaction: 'CO' };
  var LNf = function (id, qty) { return { dd_order_id: id, ad_org_id: 11, line: 10, m_product_id: PROD, c_uom_id: 100, qtyentered: qty, qtyordered: qty, isinvoiced: 'N', m_locator_id: 101, m_locatorto_id: 102, dateordered: TODAY, datepromised: PROMISED }; };
  var mrp = function (lid) { return q('SELECT * FROM pp_mrp WHERE dd_orderline_id=? ORDER BY typemrp', [lid]); };
  var rowsOf = function (lid) { return mrp(lid).map(function (m) { return m.ordertype + '/' + m.typemrp + ' ' + m.name + ' org=' + m.ad_org_id + ' wh=' + m.m_warehouse_id + ' p=' + m.m_product_id + ' qty=' + Number(m.qty) + ' ' + m.docstatus + ' bp=' + m.c_bpartner_id; }); };
  var wf = function (table, id, action) { return H.docAction(table, id, action, {}); };   // the UI path: workflow, then PO.save of the document
  var expect = function (lid, st, qty, names, bp) {   // hand-computed rows: MPPMRP.DD_OrderLine :1066-1131
    return ['DOO/D ' + names[0] + ' org=' + SRC.ad_org_id + ' wh=' + SRC.m_warehouse_id + ' p=' + PROD + ' qty=' + qty + ' ' + st + ' bp=' + bp, 'DOO/S ' + names[1] + ' org=' + TGT.ad_org_id + ' wh=' + TGT.m_warehouse_id + ' p=' + PROD + ' qty=' + qty + ' ' + st + ' bp=' + bp];
  };
  var NEWN = ['NewDemandDistOrder', 'NewSupplyDistOrder'], OLDN = ['DemandDistOrder', 'SupplyDistOrder'];

  // ── H1 a DRAFT order with one line: the LINE hook books both rows at once (MFG_Validator :250-254 has no DocStatus test; MPPMRP.DD_Order does) ─────────────
  var hh = H.save('dd_order', HDR); var oid = H.lastId('dd_order'); var nHdr = Number(one('SELECT COUNT(*) AS n FROM pp_mrp WHERE dd_order_id=?', [oid]).n);
  var ll = H.save('dd_orderline', LNf(oid, QTY)); var lid = H.lastId('dd_orderline');
  var r1 = rowsOf(lid), e1 = expect(lid, 'DR', QTY, NEWN, 'null');
  log('§LDD-H1 order ' + oid + ' line ' + lid + ' header saved ok=' + hh.ok + ' rows after header=' + nHdr + ' ; after line: ' + JSON.stringify(r1));
  ok('H1', 'HAND (MPPMRP.DD_OrderLine :1066-1131): a Drafted order books NOTHING from its header (DD_Order acts on IP/CO only :1036) but each new LINE books one DOO/D row at the SOURCE locator (org ' + SRC.ad_org_id + ', wh ' + SRC.m_warehouse_id + ') and one DOO/S row at the TARGET locator (org ' + TGT.ad_org_id + ', wh ' + TGT.m_warehouse_id + '), qty ' + QTY + ', DR', hh.ok && ll.ok && nHdr === 0 && JSON.stringify(r1) === JSON.stringify(e1), { r1: r1, want: e1 });
  // ── H2 prepare: DocStatus DR -> IP is a source column of the header: DD_Order re-runs every line (names lose the "New" prefix) and stamps DocStatus / BPartner on every row ──
  var p2 = wf('dd_order', oid, 'PR');
  var r2 = rowsOf(lid), e2 = expect(lid, 'IP', QTY, OLDN, BP);
  var dl = one('SELECT qtyreserved FROM dd_orderline WHERE dd_orderline_id=?', [lid]);
  log('§LDD-H2 prepare ok=' + p2.ok + ' reserved=' + dl.qtyreserved + ' rows=' + JSON.stringify(r2));
  ok('H2', 'HAND (MPPMRP.DD_Order :1034-1053): InProgress -> every line re-booked (names Demand/SupplyDistOrder), setDD_Order stamps DocStatus IP + C_BPartner_ID ' + BP + ' on all rows; still exactly 2 rows', p2.ok && Number(dl.qtyreserved) === QTY && JSON.stringify(r2) === JSON.stringify(e2) && mrp(lid).length === 2, { r2: r2, want: e2 });
  // ── H3 QtyOrdered 7 -> 9 is a line source column: both rows follow (qty = QtyOrdered - QtyDelivered) ────────────────────────────────────────────────
  var u3 = H.update('dd_orderline', lid, { qtyordered: 9, qtyentered: 9 }); var r3 = rowsOf(lid), e3 = expect(lid, 'IP', 9, OLDN, BP);
  ok('H3', 'HAND (:1074-1078, :1107-1111): QtyOrdered ' + QTY + ' -> 9 re-books both rows with qty 9 - 0', u3.ok && JSON.stringify(r3) === JSON.stringify(e3), { r3: r3, want: e3, err: u3.error });
  // ── H3b the partner of the header is the other source column: all rows of the order take it (:1045-1053) ───────────────────────────────────────────
  var u3b = H.update('dd_order', oid, { c_bpartner_id: BP2 }); var r3b = rowsOf(lid), e3b = expect(lid, 'IP', 9, OLDN, BP2);
  ok('H3b', 'HAND (:1045-1053): C_BPartner_ID ' + BP + ' -> ' + BP2 + ' on the header stamps the new partner on every PP_MRP row of the order', u3b.ok && JSON.stringify(r3b) === JSON.stringify(e3b), { r3b: r3b, want: e3b, err: u3b.error });
  // ── H4 complete: IP -> CO; rows follow; the Doc_DDOrder class lets the completion through and posts nothing ─────────────────────────────────────────
  var c4 = wf('dd_order', oid, 'CO'); var ord4 = one('SELECT docstatus, posted, processed FROM dd_order WHERE dd_order_id=?', [oid]), nFact = Number(one('SELECT COUNT(*) AS n FROM fact_acct WHERE ad_table_id=53037 AND record_id=?', [oid]).n);
  var r4 = rowsOf(lid), e4 = expect(lid, 'CO', 9, OLDN, BP2);
  log('§LDD-H4 complete ok=' + c4.ok + ' order=' + JSON.stringify(ord4) + ' facts=' + nFact + ' rows=' + JSON.stringify(r4));
  ok('H4', 'HAND (DD_Order :1036 + :1045): Completed -> rows DocStatus CO; HAND (Doc_DDOrder / Doc.java:611-613): the completion goes through, Posted stays N, no Fact_Acct', c4.ok && ord4.docstatus === 'CO' && ord4.posted === 'N' && nFact === 0 && JSON.stringify(r4) === JSON.stringify(e4), { c4: c4.msg, ord4: ord4, r4: r4 });
  // ── H5 movement 1 INTO the transit warehouse (101 -> 50000): QtyInTransit += 9, ConfirmedQty := 0, IsInTransit Y; MRP qty unchanged (QtyDelivered did not move) ──────
  var mh = H.save('m_movement', { ad_org_id: 11, c_doctype_id: 143, movementdate: TODAY, docaction: 'CO', isintransit: 'N', dd_order_id: oid }); var m1 = H.lastId('m_movement');
  H.save('m_movementline', { m_movement_id: m1, ad_org_id: 11, line: 10, m_product_id: PROD, c_uom_id: 100, movementqty: 9, qtyentered: 9, m_locator_id: 101, m_locatorto_id: 50000, dd_orderline_id: lid });
  var c5 = wf('m_movement', m1, 'CO'); var l5 = one('SELECT qtyintransit, qtydelivered, qtyreserved, confirmedqty FROM dd_orderline WHERE dd_orderline_id=?', [lid]), o5 = one('SELECT isintransit FROM dd_order WHERE dd_order_id=?', [oid]);
  var r5 = rowsOf(lid);
  log('§LDD-H5 movement ' + m1 + ' complete ok=' + c5.ok + ' status=' + c5.status + ' ' + (c5.msg || '') + ' line=' + JSON.stringify(l5) + ' order.isInTransit=' + o5.isintransit + ' rows=' + JSON.stringify(r5));
  ok('H5', 'HAND (MFG_Validator :333-337, :349): into the in-transit warehouse -> QtyInTransit 0+9 = 9, QtyDelivered 0, ConfirmedQty 0, order IsInTransit Y; PP_MRP qty stays 9-0 = 9 (QtyInTransit is no MRP source column)',
    c5.ok && Number(l5.qtyintransit) === 9 && Number(l5.qtydelivered) === 0 && Number(l5.confirmedqty) === 0 && o5.isintransit === 'Y' && JSON.stringify(r5) === JSON.stringify(e4), { c5: c5.msg, l5: l5, o5: o5, r5: r5 });
  // ── H6 movement 2 OUT of transit to the destination (50000 -> 102): QtyInTransit -= 9 -> 0, QtyDelivered += 9, IsInTransit N, reserveStock releases the 9, MRP qty = 9 - 9 = 0 ────────
  H.save('m_movement', { ad_org_id: 11, c_doctype_id: 143, movementdate: TODAY, docaction: 'CO', isintransit: 'N', dd_order_id: oid }); var m2 = H.lastId('m_movement');
  H.save('m_movementline', { m_movement_id: m2, ad_org_id: 11, line: 10, m_product_id: PROD, c_uom_id: 100, movementqty: 9, qtyentered: 9, m_locator_id: 50000, m_locatorto_id: 102, dd_orderline_id: lid });
  var c6 = wf('m_movement', m2, 'CO'); var l6 = one('SELECT qtyintransit, qtydelivered, qtyreserved FROM dd_orderline WHERE dd_orderline_id=?', [lid]), o6 = one('SELECT isintransit, volume, weight FROM dd_order WHERE dd_order_id=?', [oid]);
  var r6 = rowsOf(lid), e6 = expect(lid, 'CO', 0, OLDN, BP2);
  log('§LDD-H6 movement ' + m2 + ' complete ok=' + c6.ok + ' status=' + c6.status + ' ' + (c6.msg || '') + ' line=' + JSON.stringify(l6) + ' order=' + JSON.stringify(o6) + ' rows=' + JSON.stringify(r6));
  ok('H6', 'HAND (MFG_Validator :338-342, :349-351 + reserveStock): out of transit -> QtyInTransit 9-9 = 0, QtyDelivered 0+9 = 9, order IsInTransit N, reserveStock finds QtyOrdered 9 - QtyReserved 9 - QtyDelivered 9 = -9 so QtyReserved 9 -> 0, and the QtyDelivered change re-books MRP qty 9-9 = 0 on both rows',
    c6.ok && Number(l6.qtyintransit) === 0 && Number(l6.qtydelivered) === 9 && Number(l6.qtyreserved) === 0 && o6.isintransit === 'N' && JSON.stringify(r6) === JSON.stringify(e6), { c6: c6.msg, l6: l6, o6: o6, r6: r6 });
  // ── H7 void: DD_Order is a DocAction, so a voided header runs deleteMRP (:168-172), which deletes ONLY DR / VO rows (:559-562): a Drafted order's rows go, an InProgress order's rows stay (upstream) ──
  H.save('dd_order', HDR); var oD = H.lastId('dd_order'); H.save('dd_orderline', LNf(oD, 3)); var lD = H.lastId('dd_orderline'); var beforeD = mrp(lD).length;
  var v7 = wf('dd_order', oD, 'VO'); var afterD = mrp(lD).length;
  H.save('dd_order', HDR); var oI = H.lastId('dd_order'); H.save('dd_orderline', LNf(oI, 4)); var lI = H.lastId('dd_orderline'); wf('dd_order', oI, 'PR'); var beforeI = mrp(lI).map(function (m) { return m.docstatus; }).join(',');
  var v7b = wf('dd_order', oI, 'VO'); var afterI = mrp(lI).map(function (m) { return m.docstatus; }).join(','); var stI = one('SELECT docstatus FROM dd_order WHERE dd_order_id=?', [oI]).docstatus;
  log('§LDD-H7 draft order ' + oD + ': rows ' + beforeD + ' -> ' + afterD + ' (void ok=' + v7.ok + ') ; in-progress order ' + oI + ' (' + stI + '): rows ' + beforeI + ' -> ' + afterI);
  ok('H7', 'HAND (deleteMRP :559-562): voiding a Drafted order deletes its 2 DR rows; voiding an InProgress order keeps its 2 IP rows (upstream deletes only DR/VO)', v7.ok && beforeD === 2 && afterD === 0 && v7b.ok && stI === 'VO' && beforeI === 'IP,IP' && afterI === 'IP,IP', { beforeD: beforeD, afterD: afterD, beforeI: beforeI, afterI: afterI, stI: stI });
  // ── H8 delete a draft LINE: BEFORE_DELETE -> deleteMRP removes that line's DR rows ─────────────────────────────────────────────────────────────────
  H.save('dd_order', HDR); var oL = H.lastId('dd_order'); H.save('dd_orderline', LNf(oL, 2)); var lL = H.lastId('dd_orderline'); var bL = mrp(lL).length;
  var dr = H.run({ table: 'dd_orderline', timing: 'PROCESS', fn: function (trx) { var r = H.ML.remove(trx, 'dd_orderline', trx.get('dd_orderline', lL)); return { ok: r.ok, error: r.error }; } }); var aL = mrp(lL).length;
  ok('H8', 'HAND (MFG_Validator PO_BEFORE_DELETE :168-172 + deleteMRP): deleting a Drafted line deletes its 2 DR MRP rows', dr.ok && bL === 2 && aL === 0, { bL: bL, aL: aL, err: dr.error });
  // ── H9 PO_BEFORE_NEW of M_Movement is registered upstream (:73) but never handled: this bundle registers no BEFORE_NEW validator on it ──────────────────────
  var bn = ((MV.REGISTRY.m_movement || {}).BEFORE_NEW || []).filter(function (h) { return /Libero/.test(h.name); }).length;
  log('§LDD-H9 Libero validators on m_movement: ' + JSON.stringify(Object.keys(MV.REGISTRY.m_movement || {}).map(function (tm) { return tm + ':' + MV.REGISTRY.m_movement[tm].filter(function (h) { return /Libero/.test(h.name); }).length; })));
  ok('H9', 'HAND (MFG_Validator :73 registers PO_BEFORE_NEW on M_Movement, doHandleEvent has no branch for it): nothing to port - the bundle registers no M_Movement BEFORE_NEW hook', bn === 0, { bn: bn });
  // ── H10 the Doc class is the bundle's: with the bundle STOPPED a Distribution Order cannot be completed any more (no Doc_DDOrder - the oracle shows the same exception, witness_dd_order_diff R3) ──
  console.log = function () {}; await reg.stopBundle('org.idempiere.mfg'); console.log = _l;
  H.save('dd_order', HDR); var oS = H.lastId('dd_order'); H.save('dd_orderline', LNf(oS, 1)); var c10 = wf('dd_order', oS, 'CO');
  log('§LDD-H10 bundle state=' + reg.get('org.idempiere.mfg').state + ' complete ok=' + c10.ok + ' msg=' + (c10.msg || c10.error || ''));
  ok('H10', 'HAND (DefaultDocumentFactory :97-107): without the bundle (no Doc_DDOrder) completing a Distribution Order fails "Doc Class invalid", and its line/header hooks are gone', !c10.ok && /Doc Class invalid: Doc_DDOrder/.test(String(c10.msg || c10.error)) && !has('dd_orderline', 'AFTER_NEW'), { c10: c10.msg || c10.error });

  if (!judged) ok('T-VACUOUS', 'at least one check judged', null, 'nothing was judged');
  var verdict = fail ? 'FAIL' : (inc || !judged) ? 'INCONCLUSIVE' : 'PASS';
  log('§LDD-VERDICT ' + verdict + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + ' break=' + (BREAK || 'none'));
  process.exit(verdict === 'PASS' ? 0 : verdict === 'FAIL' ? 1 : 3);
})().catch(function (e) { console.log('§LDD-ERROR ' + (e.stack || e)); process.exit(2); });
