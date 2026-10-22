#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-ASI-MOVEMANDATORY (bim-compiler prompts/ERP_PRODUCT_ATTRIBUTE_ASI.md §4 AS-7 + §7; TWIN CARDINAL RULE). READ THE LOG: §AMM lines and the verdict §AMM-SUMMARY; the exit code alone is not evidence.
// THE ISSUE it proves/disproves: legacy MMovement.prepareIt (MMovement.java:317-352, IDEMPIERE-1770) refuses to complete an Inventory Move whose product needs an instance (lot / serial / guarantee date) when the line has none:
//   OUTGOING (from side, `isASIMandatoryFor(null, true)`): a line without an instance needs hand-made allocation rows (MovementLineMA, not auto-generated) that add up to the moved quantity, else
//   "Line n: FillMandatory M_AttributeSetInstance_ID"; INCOMING (to side, `isASIMandatoryFor(null, false)`): a line without a target instance is refused "Line n: FillMandatory M_AttributeSetInstanceTo_ID".
//   Both are switched off per document table by an Attribute Set Exclude row (M_MovementLine, Sales Transaction Y/N). The twin answered every such move with a named refusal "mandatory ASI validation not ported",
//   even for the rules legacy accepts. ONE rule now: ModelAsi.asiMandatoryFor / excludeTableEntry (AS-2), shared with the order, shipment and inventory.
//   TWIN-ONLY = NOTED-AS-DESIGNED (§62): the pilot's attribute sets are all MandatoryType N, no config may change; the expected answer of every case is the Java rule applied by hand.
//   Zero judged prints INCONCLUSIVE, never PASS. Negative controls (MUST exit 1): MV_BREAK=nomandatory (outgoing check off) / noto (incoming check off) / noexclude (exclusions ignored).
// Run: NODE_PATH=$HOME/bim-ootb/tests/node_modules:$HOME/bim-ootb/node_modules node erp/tests/witness_asi_movemandatory.js
'use strict';
var C = require('./dd_common.js');
var pass = 0, fail = 0, inc = 0, noted = 0, judged = 0, BREAK = process.env.MV_BREAK || '';
var log = function (s) { console.log(s); };
var ok = function (id, n, c, d) { judged++; log((c === null ? '  ⚠ ' : c ? '  ✅ ' : '  ❌ ') + id + ' ' + n + (d ? ' — ' + d : '')); c === null ? inc++ : c ? pass++ : fail++; };
var note = function (id, d) { noted++; log('  ℹ NOTED-AS-DESIGNED ' + id + ' - ' + d); };

(async function main() {
  var H = await C.boot(), TODAY = H.TODAY, q = H.q, one = H.one;
  log('§AMM-SEED patches ok=' + H.patchOk + ' failed=' + H.patchBad + ' today=' + TODAY + ' break=' + (BREAK || 'none'));
  var sp = null, n = 0, fresh = function () { if (sp) { H.rollback(sp); sp = null; } sp = 's' + (++n); H.begin(sp); };
  var day = function (k) { var d = new Date(TODAY + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10) + ' 00:00:00'; };
  var PROD = 133, SET = 102, A1 = 9101, LOC1 = (q("SELECT m_locator_id AS l FROM m_locator WHERE m_warehouse_id=103 AND isdefault='Y'")[0] || q('SELECT m_locator_id AS l FROM m_locator WHERE m_warehouse_id=103')[0]).l, LOC2 = 9300003;
  var TBL = one("SELECT ad_table_id AS t FROM ad_table WHERE lower(tablename)='m_movementline'").t;
  var act = function (t, id, a) { return H.docAction(t, id, a, { noWorkflow: true }); };
  var onhand = function (loc, asi) { var r = one('SELECT COALESCE(SUM(qtyonhand),0) AS s FROM m_storageonhand WHERE m_locator_id=? AND m_product_id=? AND COALESCE(m_attributesetinstance_id,0)=?', [loc, PROD, asi || 0]); return Number(r.s); };
  var stock = function () { return 'L1/asi0=' + onhand(LOC1, 0) + ' L1/A1=' + onhand(LOC1, A1) + ' L2/asi0=' + onhand(LOC2, 0) + ' L2/A1=' + onhand(LOC2, A1); };

  var fixture = function (type, o) {   // product 133 / attribute set 102 with the given MandatoryType; stock 10 plain + 10 of lot A1 in locator 1; a second locator 2 of the same warehouse
    o = o || {}; fresh();
    var base = q('SELECT * FROM m_locator WHERE m_locator_id=?', [LOC1])[0], cols = Object.keys(base), r = Object.assign({}, base, { m_locator_id: LOC2, isdefault: 'N', value: 'AMM-L2', x: 'AMM', priorityno: 5, m_locator_uu: 'amm-loc-2' });
    H.db.run('INSERT INTO m_locator (' + cols.join(',') + ') VALUES (' + cols.map(function () { return '?'; }).join(',') + ')', cols.map(function (k) { return r[k] === undefined ? null : r[k]; }));
    H.db.run('DELETE FROM m_storageonhand WHERE m_product_id=?', [PROD]);
    H.db.run("INSERT INTO m_attributesetinstance (m_attributesetinstance_id, ad_client_id, ad_org_id, isactive, m_attributeset_id, guaranteedate, description) VALUES (?,11,0,'Y',?,?,'A1')", [A1, SET, day(100)]);
    [[0, 10], [A1, 10]].forEach(function (a) { H.db.run("INSERT INTO m_storageonhand (m_product_id, m_locator_id, m_attributesetinstance_id, ad_client_id, ad_org_id, isactive, qtyonhand, datematerialpolicy, m_storageonhand_uu) VALUES (?,?,?,11,11,'Y',?,?,?)", [PROD, LOC1, a[0], a[1], day(-30), 'amm-' + a[0]]); });
    H.db.run("UPDATE m_attributeset SET mandatorytype=?, isinstanceattribute=?, isguaranteedate='N', useguaranteedateformpolicy='N' WHERE m_attributeset_id=?", [type, o.instance === false ? 'N' : 'Y', SET]);
    H.db.run("UPDATE m_product_category_acct SET costinglevel=? WHERE m_product_category_id=(SELECT m_product_category_id FROM m_product WHERE m_product_id=?)", [o.batch ? 'B' : null, PROD]);
    (o.exclude || []).forEach(function (x, i) { H.db.run("INSERT INTO m_attributesetexclude (m_attributesetexclude_id, ad_client_id, ad_org_id, isactive, m_attributeset_id, ad_table_id, issotrx) VALUES (?,11,0,'Y',?,?,?)", [9100100 + i, SET, TBL, x]); });
  };
  var move = function (o) {   // an Inventory Move of 2 units from locator 1 to locator 2; o.asi = the line's instance, o.asiTo, o.ma = hand allocation [[asi, qty]]
    var h = H.save('m_movement', { AD_Org_ID: 11, C_DocType_ID: 143, MovementDate: TODAY, DocAction: 'CO', IsInTransit: 'N' }); if (!h.ok) return { ok: false, msg: 'header: ' + (h.error || h.msg) };
    var mid = H.lastId('m_movement'), f = { m_movement_id: mid, AD_Org_ID: 11, M_Product_ID: PROD, C_UOM_ID: 100, MovementQty: 2, QtyEntered: 2, M_Locator_ID: LOC1, M_LocatorTo_ID: LOC2, Line: 10 };
    if (o.asi) f.M_AttributeSetInstance_ID = o.asi; if (o.asiTo) f.M_AttributeSetInstanceTo_ID = o.asiTo;
    var l = H.save('m_movementline', f); if (!l.ok) return { ok: false, msg: 'line: ' + (l.error || l.msg) };
    var lid = H.lastId('m_movementline');
    (o.ma || []).forEach(function (m) { var r = H.save('m_movementlinema', { m_movementline_id: lid, m_attributesetinstance_id: m[0], movementqty: m[1], datematerialpolicy: day(-30), isautogenerated: 'N', ad_org_id: 11 }); if (!r.ok) throw new Error('MA row: ' + (r.error || r.msg)); });
    var r = act('m_movement', mid, 'CO'); return { ok: !!r.ok, msg: r.msg || r.error || '', mid: mid, status: (one('SELECT docstatus AS s FROM m_movement WHERE m_movement_id=?', [mid]) || {}).s };
  };
  var FROM = '@Line@ 10: @FillMandatory@ @M_AttributeSetInstance_ID@', TO = '@Line@ 10: @FillMandatory@ @M_AttributeSetInstanceTo_ID@';
  var CASES = [
    { id: 'M1-always-no-lot', n: 'MandatoryType Always, line without lot and no hand allocation: refused on the FROM side (:325-338)', f: ['Y'], m: {}, exp: FROM },
    { id: 'M2-always-allocated', n: 'Always, no lot on the line but hand allocation 2 of A1 and a target lot A1: completes; the lot moves', f: ['Y'], m: { ma: [[9101, 2]], asiTo: 9101 }, exp: 'CO', stock: 'L1/asi0=10 L1/A1=8 L2/asi0=0 L2/A1=2' },
    { id: 'M3-always-part-allocated', n: 'Always, hand allocation covers 1 of 2 units: refused on the FROM side (the manual rows must add up to the quantity)', f: ['Y'], m: { ma: [[9101, 1]], asiTo: 9101 }, exp: FROM },
    { id: 'M4-always-lot-on-line', n: 'Always, the line names lot A1 (target lot follows, MMovementLine.beforeSave :258-267): completes, lot A1 moves', f: ['Y'], m: { asi: 9101 }, exp: 'CO', stock: 'L1/asi0=10 L1/A1=8 L2/asi0=0 L2/A1=2' },
    { id: 'M5-always-no-target-lot', n: 'Always, FROM side satisfied by a full hand allocation but NO target lot: refused on the TO side (:341-348)', f: ['Y'], m: { ma: [[9101, 2]] }, exp: TO },
    { id: 'M6-when-shipping', n: 'MandatoryType When Shipping: a movement is neither a shipment nor a receipt in the sense of isASIMandatoryFor(null, ..), so no instance is demanded: completes', f: ['S'], m: {}, exp: 'CO', stock: 'L1/asi0=8 L1/A1=10 L2/asi0=2 L2/A1=0' },
    { id: 'M7-not-mandatory', n: 'MandatoryType Not mandatory (the pilot\'s sets): completes (control, plain stock moves)', f: ['N'], m: {}, exp: 'CO', stock: 'L1/asi0=8 L1/A1=10 L2/asi0=2 L2/A1=0' },
    { id: 'M8-not-instance-set', n: 'Always but the set is not an instance set (no lot / serial / guarantee date): isASIMandatoryFor is false: completes', f: ['Y', { instance: false }], m: {}, exp: 'CO', stock: 'L1/asi0=8 L1/A1=10 L2/asi0=2 L2/A1=0' },
    { id: 'M9-exclude-from-only', n: 'Always + exclusion (M_MovementLine, Sales Transaction Y) only: the FROM side is skipped but the TO side still refuses', f: ['Y', { exclude: ['Y'] }], m: {}, exp: TO },
    { id: 'M10-exclude-both', n: 'Always + exclusions for both directions: the document type is exempt: completes', f: ['Y', { exclude: ['Y', 'N'] }], m: {}, exp: 'CO', stock: 'L1/asi0=8 L1/A1=10 L2/asi0=2 L2/A1=0' },
    { id: 'M11-batchlot-costing', n: 'Batch/Lot costing makes an instance mandatory whatever the set says (MandatoryType Not mandatory): refused on the FROM side', f: ['N', { batch: true }], m: {}, exp: FROM }
  ];
  note('T', 'twin-only truth table (§62): expected answers are the Java rule applied by hand; the no-instance path against the live legacy is witness_movement_diff (regression, 40 oracle comparisons)');
  CASES.forEach(function (K) {
    fixture(K.f[0], K.f[1]);
    var before = stock(), r = move(K.m), after = stock(), got = r.ok ? 'CO' : r.msg, good = got === K.exp && (K.exp === 'CO' ? (!K.stock || after === K.stock) : after === before);
    log('§AMM case=' + K.id + ' got=[' + got + '] expected=[' + K.exp + '] stock before [' + before + '] after [' + after + ']');
    ok(K.id, K.n, good, 'got=[' + got + '] expected=[' + K.exp + ']' + (K.exp === 'CO' ? ' stock=' + after + (K.stock ? ' expected ' + K.stock : '') : ' (stock untouched: ' + (after === before) + ')'));
  });
  // M12: a lot-carrying move is voided: the reversal must complete too (its lines carry the lot)
  fixture('Y'); var m12 = move({ asi: 9101 }), v = m12.ok ? act('m_movement', m12.mid, 'VO') : { ok: false, msg: m12.msg };
  ok('M12-void-reverses', 'a completed Always-mandatory move of lot A1 is voided: the reversal completes and the lot is back where it was', m12.ok && v.ok && stock() === 'L1/asi0=10 L1/A1=10 L2/asi0=0 L2/A1=0', 'void ok=' + v.ok + ' ' + (v.msg || v.error || '') + ' stock=' + stock());

  var verdict = judged === 0 ? 'INCONCLUSIVE' : fail > 0 ? 'FAIL' : inc > 0 ? 'INCONCLUSIVE' : 'PASS';
  log('§AMM-SUMMARY verdict=' + verdict + ' judged=' + judged + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + ' noted_as_designed=' + noted + ' break=' + (BREAK || 'none'));
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(function (e) { console.log('§AMM-SUMMARY verdict=ERROR ' + (e && e.stack || e)); process.exit(2); });
