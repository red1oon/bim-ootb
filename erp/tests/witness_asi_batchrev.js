#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-ASI-BATCHREV (bim-compiler prompts/ERP_PRODUCT_ATTRIBUTE_ASI.md §4 AS-6 + §7; TWIN CARDINAL RULE). READ THE LOG: §ABR lines and the verdict §ABR-SUMMARY; the exit code alone is not evidence.
// THE ISSUE it proves/disproves: with Batch/Lot costing (costing level B) a shipment is costed lot by lot (one cost detail per MovementLineMA row). Voiding it must reverse EACH lot at the cost the shipment took
//   it at: Doc_InOut.java:330-380 reads the original line's cost detail for that lot (findReversalCostDetailAmt :1128-1139), negates it, and links the new detail to the original (Ref_CostDetail_ID). The twin
//   refused the posting of such a reversal by name ("Doc_InOut batch-lot reversal ... UNPORTED"), so a voided lot-costed shipment stayed unposted and the books kept the cost of goods that came back.
//   TWIN-ONLY = NOTED-AS-DESIGNED (§62): the pilot costs at Client level everywhere and has no lots, and no pilot config may change; judged by accounting practice: every schema balances, the reversal facts
//   are the originals negated, the cost details net to zero PER LOT (not a pooled average), stock is restored.
//   Cases: B1 void at unchanged cost; B2 the lot cost CHANGED between shipment and void (the reversal must still use the original per-lot amounts - a pooled/current-cost shortcut gives different numbers);
//   B4 the user allocates 13 on a 12-unit line -> refused; B3 a shipment line that names its own lot (ASI on the line, no MA walk) reverses through the plain path (control). Zero judged prints INCONCLUSIVE, never PASS.
//   Negative controls (MUST exit 1): LBL_BREAK=nofind (the original detail is not found -> pooled average) / norevmas (the reversal line's MA rows are not read -> one detail on instance 0) / fullpolicy (the material policy ignores the user's own allocation -> a second automatic set of rows and a double stock decrement).
// Run: NODE_PATH=$HOME/bim-ootb/tests/node_modules:$HOME/bim-ootb/node_modules node erp/tests/witness_asi_batchrev.js
'use strict';
var path = require('path');
var C = require('./dd_common.js');
var pass = 0, fail = 0, inc = 0, noted = 0, judged = 0, BREAK = process.env.LBL_BREAK || '';
var log = function (s) { console.log(s); };
var ok = function (id, n, c, d) { judged++; log((c === null ? '  ⚠ ' : c ? '  ✅ ' : '  ❌ ') + id + ' ' + n + (d ? ' — ' + d : '')); c === null ? inc++ : c ? pass++ : fail++; };
var note = function (id, d) { noted++; log('  ℹ NOTED-AS-DESIGNED ' + id + ' - ' + d); };
var r2 = function (v) { return (Math.round(Number(v || 0) * 100) / 100).toFixed(2); };

(async function main() {
  var H = await C.boot(), TODAY = H.TODAY, q = H.q, lc = C.lc, ML = H.ML;
  var P = require(path.join(H.ERP, 'model_post.js'));
  log('§ABR-SEED patches ok=' + H.patchOk + ' failed=' + H.patchBad + ' today=' + TODAY + ' break=' + (BREAK || 'none'));
  var CTX = Object.assign({ date: TODAY }, H.ctx), sp = null, n = 0;
  var fresh = function () { if (sp) { H.rollback(sp); sp = null; } sp = 's' + (++n); H.begin(sp); };
  var day = function (k) { var d = new Date(TODAY + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10) + ' 00:00:00'; };
  var HDR = { AD_Org_ID: 11, C_DocTypeTarget_ID: 132, C_DocType_ID: 0, IsSOTrx: 'Y', C_BPartner_ID: 112, C_BPartner_Location_ID: 108, Bill_BPartner_ID: 112, Bill_Location_ID: 108, M_Warehouse_ID: 103,
    M_PriceList_ID: 101, C_Currency_ID: 100, C_PaymentTerm_ID: 108, SalesRep_ID: 101, PaymentRule: 'P', InvoiceRule: 'I', DeliveryRule: 'F', DeliveryViaRule: 'P', PriorityRule: '5', FreightCostRule: 'I',
    DocAction: 'CO', DateOrdered: TODAY, DateAcct: TODAY, DatePromised: TODAY };
  var lineOf = function (prod, qty) { return { AD_Org_ID: 11, M_Product_ID: prod, QtyEntered: qty, QtyOrdered: qty, C_UOM_ID: 100, C_Tax_ID: 104, M_Warehouse_ID: 103 }; };
  var loc = (q("SELECT m_locator_id AS l FROM m_locator WHERE m_warehouse_id=103 AND isdefault='Y'")[0] || q('SELECT m_locator_id AS l FROM m_locator WHERE m_warehouse_id=103')[0]).l;
  var PROD = 133, SET = 102, A1 = 9101, A2 = 9102, COST1 = 10, COST2 = 14;
  var schemas = q('SELECT c_acctschema_id AS id FROM c_acctschema WHERE ad_client_id=11').map(function (r) { return r.id; });

  var fixture = function (batch) {   // product 133, two lots A1 (cost 10, 10 on hand, older) and A2 (cost 14, 10 on hand); costing level Batch/Lot on the product's category in every schema
    fresh();
    H.db.run('DELETE FROM m_storageonhand WHERE m_product_id=?', [PROD]);
    [[A1, 10], [A2, 14]].forEach(function (a, i) {
      H.db.run("INSERT INTO m_attributesetinstance (m_attributesetinstance_id, ad_client_id, ad_org_id, isactive, m_attributeset_id, guaranteedate, description) VALUES (?,11,0,'Y',?,?,?)", [a[0], SET, day(100), 'A' + (i + 1)]);
      H.db.run("INSERT INTO m_storageonhand (m_product_id, m_locator_id, m_attributesetinstance_id, ad_client_id, ad_org_id, isactive, qtyonhand, datematerialpolicy, m_storageonhand_uu) VALUES (?,?,?,11,11,'Y',10,?,?)", [PROD, loc, a[0], day(i ? -10 : -30), 'abr-' + a[0]]);
    });
    H.db.run("UPDATE m_attributeset SET isguaranteedate='N', useguaranteedateformpolicy='N' WHERE m_attributeset_id=?", [SET]);
    H.db.run("UPDATE m_product_category_acct SET costinglevel=? WHERE m_product_category_id=(SELECT m_product_category_id FROM m_product WHERE m_product_id=?)", [batch ? 'B' : null, PROD]);
    schemas.forEach(function (s) {
      H.db.run("DELETE FROM m_cost WHERE m_product_id=? AND c_acctschema_id=?", [PROD, s]);
      var el = q("SELECT m_costelement_id AS id FROM m_costelement WHERE ad_client_id=11 AND costingmethod=(SELECT costingmethod FROM c_acctschema WHERE c_acctschema_id=?) AND costelementtype='M'", [s])[0];
      [[A1, COST1], [A2, COST2]].forEach(function (a) {
        H.db.run("INSERT INTO m_cost (ad_client_id, ad_org_id, m_product_id, m_costtype_id, c_acctschema_id, m_costelement_id, m_attributesetinstance_id, isactive, currentcostprice, currentqty, cumulatedamt, cumulatedqty, futurecostprice, iscostfrozen, m_cost_uu) VALUES (11,0,?,100,?,?,?,'Y',?,10,?,10,0,'N',?)",
          [PROD, s, el ? el.id : 103, a[0], a[1], a[1] * 10, 'abr-c-' + s + '-' + a[0]]); });
    });
  };
  var twinOrder = function (prod, qty, olAsi) {   // Batch/Lot costing makes an instance mandatory on the ORDER line too (MProduct.isASIMandatoryFor, AS-2): the order line names a lot

    var t0 = new ML.Trx(q, H.env()), hf = lc(HDR); hf.c_doctypetarget_id = 132; delete hf.c_doctype_id; hf.docstatus = 'DR'; hf.processed = 'N'; hf.isapproved = 'N'; hf.posted = 'N'; hf.totallines = 0; hf.grandtotal = 0;
    var h = H.run({ table: 'c_order', timing: 'SAVE', changes: ML.newPO(t0, 'c_order', Object.assign({ c_doctype_id: 0 }, hf)) }); if (!h.ok) return { ok: false, msg: 'order header: ' + (h.error || h.msg) };
    var oid = H.lastId('c_order');
    var lr = H.run({ table: 'c_orderline', timing: 'SAVE', changes: ML.newPO(t0, 'c_orderline', Object.assign({ c_order_id: oid, priceentered: 0, priceactual: 0, pricelist: 0, qtydelivered: 0, qtyinvoiced: 0, qtyreserved: 0, line: 10, isdescription: 'N', processed: 'N' }, lc(Object.assign(lineOf(prod, qty), { M_AttributeSetInstance_ID: olAsi || 0 })))) });
    if (!lr.ok) return { ok: false, msg: 'order line: ' + (lr.error || lr.msg) };
    var co = H.docAction('c_order', oid, 'CO'); return { ok: !!co.ok, msg: co.msg || co.error || '', id: oid, olid: H.lastId('c_orderline') };
  };
  var shipOut = function (prod, qty, asiOnLine, manualMA) {   // a shipment completed on the twin: the line names its lot (asiOnLine) or the user allocates lots by hand (manualMA = [[asi, qty]], isAutoGenerated N - the only MA rows that satisfy a mandatory instance, MInOut.prepareIt :1527-1536)
    var od = twinOrder(prod, qty, asiOnLine || (manualMA && manualMA[0][0])); if (!od.ok) return { ok: false, msg: 'fixture order: ' + od.msg };
    var h = H.save('m_inout', { c_order_id: od.id, ad_org_id: 11, c_doctype_id: 120, issotrx: 'Y', movementtype: 'C-', c_bpartner_id: 112, c_bpartner_location_id: 108, m_warehouse_id: 103, movementdate: TODAY, dateacct: TODAY, docaction: 'CO', docstatus: 'DR', deliveryrule: 'A', deliveryviarule: 'P', freightcostrule: 'I', priorityrule: '5', processed: 'N', posted: 'N' });
    if (!h.ok) return { ok: false, msg: 'shipment header: ' + (h.error || h.msg) };
    var iid = H.lastId('m_inout');
    var f = { m_inout_id: iid, c_orderline_id: od.olid, line: 10, m_product_id: prod, movementqty: qty, qtyentered: qty, c_uom_id: 100, m_locator_id: loc, ad_org_id: 11 }; if (asiOnLine) f.m_attributesetinstance_id = asiOnLine;
    var l = H.save('m_inoutline', f); if (!l.ok) return { ok: false, msg: 'shipment line: ' + (l.error || l.msg) };
    var lid = H.lastId('m_inoutline');
    if (manualMA) for (var mi = 0; mi < manualMA.length; mi++) { var mr = H.save('m_inoutlinema', { m_inoutline_id: lid, m_attributesetinstance_id: manualMA[mi][0], movementqty: manualMA[mi][1], datematerialpolicy: day(mi ? -10 : -30), isautogenerated: 'N', ad_org_id: 11 }); if (!mr.ok) return { ok: false, msg: 'MA row: ' + (mr.error || mr.msg) }; }
    var r = H.docAction('m_inout', iid, 'CO');
    return { ok: !!r.ok, msg: r.msg || r.error || '', iid: iid, lid: lid };
  };
  // the document engine posts at completion and at void (DocumentEngine.postImmediate); read the outcome - status, and the engine's own posting line for it
  var post = function (id) {
    var row = q('SELECT posted FROM m_inout WHERE m_inout_id=?', [id])[0], mine = (H.logs || []).filter(function (l) { return /§MODEL-POST table=m_inout/.test(l) && (l.indexOf('id=' + id + ' ') >= 0 || /id=#new/.test(l)); }).slice(-1)[0];
    return { posted: row && row.posted === 'Y', status: row ? row.posted : '?', why: mine ? String(mine).slice(0, 240) : null };
  };
  var facts = function (id) { return q('SELECT c_acctschema_id AS s, account_id AS a, amtacctdr AS dr, amtacctcr AS cr, m_attributesetinstance_id AS asi FROM fact_acct WHERE ad_table_id=319 AND record_id=? ORDER BY fact_acct_id', [id]); };
  var cds = function (lineId) { return q('SELECT m_costdetail_id AS id, c_acctschema_id AS s, m_attributesetinstance_id AS asi, amt, qty, ref_costdetail_id AS ref FROM m_costdetail WHERE m_inoutline_id=? ORDER BY m_costdetail_id', [lineId]); };
  var balanced = function (rows) { var m = {}; rows.forEach(function (f) { m[f.s] = (m[f.s] || 0) + Number(f.dr || 0) - Number(f.cr || 0); }); return Object.keys(m).every(function (k) { return Math.abs(m[k]) < 0.005; }); };

  note('T', 'twin-only fixture (§62): the pilot costs at Client level and holds no lots; the expected values are the Java rule applied by hand: cost 10 / lot A1 and 14 / lot A2, 12 shipped = 10 from A1 + 2 from A2 (FiFo) = 128.00');

  // ── B1: void at unchanged cost ────────────────────────────────────────────────────────────────────────────────────────────
  fixture(true);
  var s1 = shipOut(PROD, 12, 0, [[A1, 10], [A2, 2]]);
  var st1 = q('SELECT m_attributesetinstance_id AS a, qtyonhand AS qty FROM m_storageonhand WHERE m_product_id=? ORDER BY m_attributesetinstance_id', [PROD]).map(function (r) { return r.a + ':' + Number(r.qty); }).join(',');
  ok('B1-ship', 'the 12-unit shipment completes with the user allocation A1 x10, A2 x2 (the shipment line has no lot of its own): exactly those two allocation rows (no second automatic set) and the stock leaves once: A1 0, A2 8', s1.ok && JSON.stringify(q('SELECT m_attributesetinstance_id AS a, movementqty AS m FROM m_inoutlinema WHERE m_inoutline_id=? ORDER BY rowid', [s1.lid]).map(function (m) { return m.a + ':' + Number(m.m); })) === JSON.stringify([A1 + ':10', A2 + ':2']) && st1 === A1 + ':0,' + A2 + ':8', s1.ok ? 'on hand ' + st1 + ' MA=' + q('SELECT m_attributesetinstance_id AS a, movementqty AS m, isautogenerated AS g FROM m_inoutlinema WHERE m_inoutline_id=?', [s1.lid]).map(function (m) { return m.a + ':' + Number(m.m) + m.g; }).join(',') : s1.msg);
  var p1 = post(s1.iid), cd1 = cds(s1.lid).filter(function (c) { return c.s === schemas[0]; });
  log('§ABR B1 shipment post: ' + JSON.stringify({ posted: p1.posted, status: p1.status, why: p1.why }) + ' cost details (schema ' + schemas[0] + '): ' + cd1.map(function (c) { return c.asi + ':amt=' + r2(c.amt) + ',qty=' + Number(c.qty); }).join(' '));
  ok('B1-orig-lotcost', 'the shipment posts and is costed lot by lot: A1 -100.00 x -10 (10 x 10) and A2 -28.00 x -2 (2 x 14); a shipment detail is negative', p1.status === 'Y' && cd1.length === 2 && r2(cd1[0].amt) === '-100.00' && r2(cd1[1].amt) === '-28.00', 'status=' + p1.status + ' ' + (p1.why || '') + ' details=' + cd1.map(function (c) { return c.asi + ':' + r2(c.amt); }).join(' '));
  var origFacts = facts(s1.iid);
  var vo = H.docAction('m_inout', s1.iid, 'VO'), rev = q('SELECT reversal_id AS r FROM m_inout WHERE m_inout_id=?', [s1.iid])[0], rid = rev && rev.r;
  ok('B1-void', 'the shipment is voided (reversal document created)', !!vo.ok && !!rid, 'ok=' + vo.ok + ' ' + (vo.msg || vo.error || '') + ' reversal=' + rid);
  var rline = rid ? q('SELECT m_inoutline_id AS id FROM m_inoutline WHERE m_inout_id=?', [rid])[0] : null;
  var p1r = rid ? post(rid) : { status: '?', why: 'no reversal' };
  var cd1r = rline ? cds(rline.id).filter(function (c) { return c.s === schemas[0]; }) : [], revFacts = rid ? facts(rid) : [];
  log('§ABR B1 reversal post: ' + JSON.stringify({ posted: p1r.posted, status: p1r.status, why: p1r.why }) + ' cost details: ' + cd1r.map(function (c) { return c.asi + ':amt=' + r2(c.amt) + ',qty=' + Number(c.qty) + ',ref=' + c.ref; }).join(' '));
  ok('B1-rev-posts', 'the reversal posts (no "batch-lot reversal" refusal) and every schema balances', p1r.status === 'Y' && revFacts.length > 0 && balanced(revFacts) && balanced(origFacts), 'status=' + p1r.status + ' ' + (p1r.why || '') + ' facts=' + revFacts.length);
  var negd = origFacts.length > 0 && revFacts.length === origFacts.length && origFacts.every(function (f, i) { var g = revFacts[i]; return f.s === g.s && f.a === g.a && r2(f.dr) === r2(g.cr) && r2(f.cr) === r2(g.dr); });
  ok('B1-rev-facts-negated', 'each reversal fact is the original with debit and credit swapped (the books net to zero)', negd, 'orig=' + origFacts.length + ' rev=' + revFacts.length);
  var perLot = cd1r.length === 2 && cd1r[0].asi === A1 && cd1r[1].asi === A2 && r2(cd1r[0].amt) === '100.00' && r2(cd1r[1].amt) === '28.00' && Number(cd1r[0].qty) === 10 && Number(cd1r[1].qty) === 2;
  ok('B1-rev-costdetail-per-lot', 'the reversal creates one cost detail PER LOT with the original amounts negated: A1 +100.00 x +10, A2 +28.00 x +2 (a pooled average would give 106.67 / 21.33)', perLot, cd1r.map(function (c) { return c.asi + ':' + r2(c.amt) + 'x' + Number(c.qty); }).join(' '));
  var refs = cd1r.length === 2 && cd1r.every(function (c, i) { return Number(c.ref) === Number(cd1[i].id); });
  ok('B1-rev-ref', 'each reversal cost detail points to the original lot\'s detail (Ref_CostDetail_ID)', refs, cd1r.map(function (c) { return c.ref; }).join(',') + ' vs ' + cd1.map(function (c) { return c.id; }).join(','));
  var net = {}; cd1.concat(cd1r).forEach(function (c) { net[c.asi] = net[c.asi] || { a: 0, q: 0 }; net[c.asi].a += Number(c.amt); net[c.asi].q += Number(c.qty); });
  ok('B1-net-zero-per-lot', 'original + reversal cost details net to zero amount and zero quantity for EACH lot', Object.keys(net).length === 2 && Object.keys(net).every(function (k) { return Math.abs(net[k].a) < 0.005 && Math.abs(net[k].q) < 0.0005; }), JSON.stringify(net));
  var st = q('SELECT m_attributesetinstance_id AS a, qtyonhand AS qty FROM m_storageonhand WHERE m_product_id=? ORDER BY m_attributesetinstance_id', [PROD]).map(function (r) { return r.a + ':' + Number(r.qty); }).join(',');
  ok('B1-stock-restored', 'the voided shipment puts the goods back into the lots they left: A1 10, A2 10', st === A1 + ':10,' + A2 + ':10', 'on hand ' + st);

  // ── B2: the lot cost moved between shipment and void ───────────────────────────────────────────────────────────────────
  fixture(true);
  var s2 = shipOut(PROD, 12, 0, [[A1, 10], [A2, 2]]), p2 = post(s2.iid);
  schemas.forEach(function (s) { H.db.run('UPDATE m_cost SET currentcostprice=? WHERE m_product_id=? AND c_acctschema_id=? AND m_attributesetinstance_id=?', [20, PROD, s, A1]); });   // lot A1 is now worth 20, not 10
  var vo2 = H.docAction('m_inout', s2.iid, 'VO'), rid2 = (q('SELECT reversal_id AS r FROM m_inout WHERE m_inout_id=?', [s2.iid])[0] || {}).r;
  var rl2 = rid2 ? q('SELECT m_inoutline_id AS id FROM m_inoutline WHERE m_inout_id=?', [rid2])[0] : null, p2r = rid2 ? post(rid2) : { status: '?' };
  var cd2 = rl2 ? cds(rl2.id).filter(function (c) { return c.s === schemas[0]; }) : [], f2 = rid2 ? facts(rid2) : [], fo2 = facts(s2.iid);
  log('§ABR B2 ship ' + p2.status + ' void ok=' + vo2.ok + ' reversal post=' + p2r.status + ' ' + (p2r.why || '') + ' details: ' + cd2.map(function (c) { return c.asi + ':' + r2(c.amt); }).join(' '));
  ok('B2-original-amounts', 'the lot cost changed (A1 10 -> 20) after shipping: the reversal still takes the ORIGINAL per-lot amounts (+100.00 / +28.00), not today\'s cost', p2.status === 'Y' && p2r.status === 'Y' && cd2.length === 2 && r2(cd2[0].amt) === '100.00' && r2(cd2[1].amt) === '28.00', cd2.map(function (c) { return c.asi + ':' + r2(c.amt); }).join(' ') + ' ' + (p2r.why || ''));
  ok('B2-books-net-zero', 'and the facts of shipment + reversal net to zero per account (balanced)', f2.length > 0 && balanced(f2) && f2.length === fo2.length && f2.every(function (f, i) { return r2(f.dr) === r2(fo2[i].cr) && r2(f.cr) === r2(fo2[i].dr); }), 'orig=' + fo2.length + ' rev=' + f2.length);

  // ── B4: the user allocates MORE than the line (legacy refuses) and exactly the line (no second, automatic allocation) ──────────────────────────────
  fixture(false);   // no Batch/Lot costing here: an instance is not mandatory, so the over-allocation rule (not the mandatory-instance rule) is what answers
  var s4 = shipOut(PROD, 12, 0, [[A1, 10], [A2, 3]]);
  ok('B4-over-allocation-refused', 'a hand allocation of 13 on a 12-unit line is refused at completion ("@Over_Qty_On_Attribute_Tab@ 10", MInOut.java:1723-1729), nothing is shipped', !s4.ok && /Over_Qty_On_Attribute_Tab/.test(s4.msg || '') && q('SELECT SUM(qtyonhand) AS s FROM m_storageonhand WHERE m_product_id=?', [PROD])[0].s === 20, 'ok=' + s4.ok + ' msg=' + (s4.msg || '') + ' on hand=' + q('SELECT SUM(qtyonhand) AS s FROM m_storageonhand WHERE m_product_id=?', [PROD])[0].s);

  // ── B3 (control): a line that names its lot reverses through the plain path ──────────────────────────────────────────────
  fixture(true);
  var s3 = shipOut(PROD, 4, A2), p3 = post(s3.iid), vo3 = H.docAction('m_inout', s3.iid, 'VO'), rid3 = (q('SELECT reversal_id AS r FROM m_inout WHERE m_inout_id=?', [s3.iid])[0] || {}).r;
  var p3r = rid3 ? post(rid3) : { status: '?' }, f3 = rid3 ? facts(rid3) : [], fo3 = facts(s3.iid);
  log('§ABR B3 line-with-lot ship ' + p3.status + ' ' + (p3.why || '') + ' void ok=' + vo3.ok + ' reversal ' + p3r.status + ' ' + (p3r.why || ''));
  ok('B3-named-lot-control', 'a shipment line that names lot A2 itself (no allocation walk) ships, posts, voids and reverses with netting books', s3.ok && p3.status === 'Y' && p3r.status === 'Y' && f3.length > 0 && balanced(f3) && f3.every(function (f, i) { return r2(f.dr) === r2(fo3[i].cr) && r2(f.cr) === r2(fo3[i].dr); }), 'ship=' + p3.status + ' rev=' + p3r.status + ' ' + (p3r.why || s3.msg || ''));

  var verdict = judged === 0 ? 'INCONCLUSIVE' : fail > 0 ? 'FAIL' : inc > 0 ? 'INCONCLUSIVE' : 'PASS';
  log('§ABR-SUMMARY verdict=' + verdict + ' judged=' + judged + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + ' noted_as_designed=' + noted + ' break=' + (BREAK || 'none'));
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(function (e) { console.log('§ABR-SUMMARY verdict=ERROR ' + (e && e.stack || e)); process.exit(2); });
