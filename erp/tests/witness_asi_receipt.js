#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-ASI-RECEIPT (bim-compiler prompts/ERP_PRODUCT_ATTRIBUTE_ASI.md §4 AS-4; TWIN CARDINAL RULE). READ THE LOG: §ASR lines and the verdict §ASR-SUMMARY; the exit code alone is not evidence.
// THE ISSUE it proves/disproves: (1) a goods receipt did not first fill the product's NEGATIVE stock rows (MInOut.checkMaterialPolicy :2386-2430 -> autoBalanceNegative :2477-2500): the twin booked the whole
//   quantity at the movement date, leaving old negative rows open forever and a different stock-by-date picture than legacy. (2) A receipt line of a product whose Attribute Set says "Auto Generate Lot"
//   got no lot (MInOutLine.beforeSave :685-696 -> MAttributeSetInstance.generateLot :444-459).
//   Part 1 (ORACLE, ordinary use of makedoc, rolled back): the pilot already holds negative on-hand rows for product 123 (left by earlier shipments); a Material Receipt completed in legacy and in the
//   twin (rows synced from the pilot) must write the same allocation (M_InOutLineMA instance/qty/date) and leave the same storage picture. Part 2 (TWIN-ONLY = NOTED-AS-DESIGNED, §62: no pilot set has
//   Auto Generate Lot and config may not change): the lot-generation judged by invariants. Zero judged prints INCONCLUSIVE, never PASS.
//   Negative controls (MUST exit 1): ASR_BREAK=nonegative (negative rows ignored) / nolotgen (auto-generate off).
// Run: NODE_PATH=$HOME/bim-ootb/tests/node_modules:$HOME/bim-ootb/node_modules node erp/tests/witness_asi_receipt.js   (pilot + oracle :8097)
'use strict';
var C = require('./dd_common.js');
var pass = 0, fail = 0, inc = 0, noted = 0, judged = 0, BREAK = process.env.ASR_BREAK || '';
var log = function (s) { console.log(s); };
var ok = function (id, n, c, d) { judged++; log((c === null ? '  ⚠ ' : c ? '  ✅ ' : '  ❌ ') + id + ' ' + n + (d ? ' — ' + d : '')); c === null ? inc++ : c ? pass++ : fail++; };
var note = function (id, d) { noted++; log('  ℹ NOTED-AS-DESIGNED ' + id + ' - ' + d); };

(async function main() {
  var H = await C.boot(), TODAY = H.TODAY, q = H.q, lc = C.lc;
  var ASI = require('../model_asi.js');
  if (BREAK === 'nonegative') ASI.negatives = function () { return []; };
  if (BREAK === 'nolotgen') { var c0 = ASI.create; ASI.create = function (trx, o) { return o.mode === 'generateLot' ? { ok: true, asi: 0 } : c0(trx, o); }; }
  log('§ASR-SEED patches ok=' + H.patchOk + ' failed=' + H.patchBad + ' today=' + TODAY + ' break=' + (BREAK || 'none'));
  var CTX = Object.assign({ date: TODAY }, H.ctx), sp = null, n = 0;
  var fresh = function () { if (sp) { H.rollback(sp); sp = null; } sp = 's' + (++n); H.begin(sp); };
  var RH = { AD_Org_ID: 11, C_DocType_ID: 122, IsSOTrx: 'N', MovementType: 'V+', C_BPartner_ID: 114, C_BPartner_Location_ID: 109, M_Warehouse_ID: 103, MovementDate: TODAY, DateAcct: TODAY, DocAction: 'CO', DeliveryRule: 'A', DeliveryViaRule: 'P', FreightCostRule: 'I', PriorityRule: '5' };
  var RL = function (prod, qty) { return { AD_Org_ID: 11, M_Product_ID: prod, MovementQty: qty, QtyEntered: qty, C_UOM_ID: 100, M_Locator_ID: 101, Line: 10 }; };
  var twinReceipt = function (prod, qty) {
    var h = H.save('m_inout', Object.assign(lc(RH), { docstatus: 'DR', processed: 'N', posted: 'N' })); if (!h.ok) return { ok: false, msg: 'header: ' + (h.error || h.msg) };
    var iid = H.lastId('m_inout'), l = H.save('m_inoutline', { m_inout_id: iid, line: 10, m_product_id: prod, movementqty: qty, qtyentered: qty, c_uom_id: 100, m_locator_id: 101, ad_org_id: 11 });
    if (!l.ok) return { ok: false, msg: 'line: ' + (l.error || l.msg) };
    var lid = H.lastId('m_inoutline'), r = H.docAction('m_inout', iid, 'CO');
    return { ok: !!r.ok, msg: r.msg || r.error || '', iid: iid, lid: lid, status: (q('SELECT docstatus FROM m_inout WHERE m_inout_id=?', [iid])[0] || {}).docstatus };
  };
  var maOf = function (lid) { return q('SELECT m_attributesetinstance_id AS asi, movementqty AS qty, substr(datematerialpolicy,1,10) AS dmp FROM m_inoutlinema WHERE m_inoutline_id=?', [lid]).map(function (m) { return (m.asi || 0) + ':' + Number(m.qty) + ':' + m.dmp; }).sort().join(' '); };
  var stor = function (prod) { return q('SELECT m_attributesetinstance_id AS asi, substr(datematerialpolicy,1,10) AS dmp, qtyonhand AS qty FROM m_storageonhand WHERE m_product_id=? AND m_locator_id=101 ORDER BY dmp, asi', [prod]).map(function (s) { return (s.asi || 0) + '@' + s.dmp + '=' + Number(s.qty); }).join(' '); };

  // ── Part 1: ORACLE vs twin on the pilot's real negative rows ───────────────────────────────────────────────────────────────
  var PROD = 123, rows = [];
  try { rows = (await C.oracle({ op: 'sql', sql: "select m_attributesetinstance_id as asi, qtyonhand as qty, to_char(datematerialpolicy,'YYYY-MM-DD HH24:MI:SS') as dmp, m_storageonhand_uu as uu from m_storageonhand where m_product_id=123 and m_locator_id=101 and ad_client_id=11" })).rows || []; }
  catch (e) { ok('P1-sync', 'oracle reachable', false, String(e.message)); }
  var negs = rows.filter(function (r) { return Number(r.qty) < 0; });
  log('§ASR-PILOT product=' + PROD + ' locator=101 rows=' + rows.length + ' negative=' + negs.length + ' sum=' + negs.reduce(function (a, r) { return a + Number(r.qty); }, 0));
  if (negs.length < 2) ok('P1', 'the pilot holds at least two negative rows for the product', null, 'only ' + negs.length + ' - Part 1 not judged');
  else {
    var total = -negs.reduce(function (a, r) { return a + Number(r.qty); }, 0);
    var CASES = [{ id: 'P1a-partial', qty: Math.floor(total / 2) }, { id: 'P1b-more-than-negatives', qty: total + 700 }];
    for (var ci = 0; ci < CASES.length; ci++) {
      var K = CASES[ci], L;
      try { L = (await C.oracle({ op: 'makedoc', ctx: CTX, header: { table: 'M_InOut', fields: RH }, lines: [{ table: 'M_InOutLine', parentColumn: 'M_InOut_ID', fields: RL(PROD, K.qty) }], action: 'CO',
        queries: { ma: "select ma.m_attributesetinstance_id as asi, ma.movementqty as qty, to_char(ma.datematerialpolicy,'YYYY-MM-DD') as dmp from m_inoutlinema ma join m_inoutline l on l.m_inoutline_id=ma.m_inoutline_id where l.m_inout_id=?" } })).doc; }
      catch (e) { ok('ORACLE-' + K.id, 'oracle reachable', false, String(e.message)); continue; }
      if (L.exception || L.docStatus !== 'CO') { ok(K.id, 'legacy completed the receipt', null, 'LEGACY ' + (L.exception || L.processMsg)); continue; }
      fresh();
      H.db.run('DELETE FROM m_storageonhand WHERE m_product_id=? AND m_locator_id=101', [PROD]);
      rows.forEach(function (r) { H.db.run("INSERT INTO m_storageonhand (m_product_id, m_locator_id, m_attributesetinstance_id, ad_client_id, ad_org_id, isactive, qtyonhand, datematerialpolicy, m_storageonhand_uu) VALUES (?,101,?,11,11,'Y',?,?,?)", [PROD, r.asi || 0, r.qty, r.dmp, r.uu]); });
      var T1 = twinReceipt(PROD, K.qty);
      var lma = (L.rows.ma || []).map(function (m) { return (m.asi || 0) + ':' + Number(m.qty) + ':' + m.dmp; }).sort().join(' '), tma = T1.lid ? maOf(T1.lid) : '';
      log('§ASR case=' + K.id + ' qty=' + K.qty + ' legacy MA=[' + lma + '] twin MA=[' + tma + '] twin=' + T1.status + ' ' + T1.msg);
      ok(K.id + '-ma', 'receipt of ' + K.qty + ': allocation rows (instance:qty:date) equal to legacy', T1.ok && lma !== '' && lma === tma, 'legacy=[' + lma + '] twin=[' + tma + '] ' + (T1.ok ? '' : T1.msg));
      // the stock picture afterwards: every pilot negative row the receipt filled is now 0 in the twin
      var after = q('SELECT substr(datematerialpolicy,1,10) AS dmp, qtyonhand AS qty FROM m_storageonhand WHERE m_product_id=? AND m_locator_id=101 AND m_attributesetinstance_id=0 ORDER BY dmp', [PROD]);
      var exp = {}; negs.forEach(function (r) { exp[r.dmp.slice(0, 10)] = Number(r.qty); });
      var left = K.qty; Object.keys(exp).sort().forEach(function (d) { var take = Math.min(left, -exp[d]); exp[d] += take; left -= take; }); if (left > 0) exp[TODAY] = (exp[TODAY] || 0) + left;
      var bad = Object.keys(exp).filter(function (d) { var a = after.filter(function (x) { return x.dmp === d; })[0]; return Math.abs((a ? Number(a.qty) : 0) - exp[d]) > 1e-9; });
      ok(K.id + '-storage', 'storage by date after the receipt = each negative row filled oldest first, the rest at the movement date', bad.length === 0, bad.length ? 'differs on ' + bad.join(',') : undefined);
    }
  }

  // ── Part 2: TWIN-ONLY auto-generate lot ────────────────────────────────────────────────────────────────────────────────────
  note('P2', 'no pilot Attribute Set has Auto Generate Lot and config may not change (§62): judged by invariants of MInOutLine.beforeSave :685-696 / generateLot :444-459');
  fresh(); H.db.run("UPDATE m_attributeset SET isautogeneratelot='Y' WHERE m_attributeset_id=101");
  var ctl0 = q('SELECT currentnext FROM m_lotctl WHERE m_lotctl_id=100')[0].currentnext;
  var T2 = twinReceipt(136, 5), ln = T2.lid ? q('SELECT m_attributesetinstance_id AS asi FROM m_inoutline WHERE m_inoutline_id=?', [T2.lid])[0] : null;
  var gen = ln && Number(ln.asi) > 0 ? q('SELECT * FROM m_attributesetinstance WHERE m_attributesetinstance_id=?', [ln.asi])[0] : null;
  log('§ASR P2 completed=' + T2.ok + ' line.asi=' + (ln && ln.asi) + ' asi=' + JSON.stringify(gen));
  ok('P2-line-asi', 'a receipt line of an Auto-Generate-Lot product gets an instance on save', !!gen, 'line asi=' + (ln && ln.asi) + ' ' + T2.msg);
  ok('P2-lot', 'the instance carries the next lot number and an M_Lot row; Serial No and Guarantee Date are NOT generated (generateLot makes the lot only)', !!gen && gen.lot === String(ctl0) && !gen.serno && !gen.guaranteedate && q('SELECT 1 FROM m_lot WHERE name=? AND m_product_id=136', [String(ctl0)]).length === 1, gen && 'lot=' + gen.lot + ' expected ' + ctl0);
  ok('P2-counter', 'the Lot Control counter advanced by its increment', Number(q('SELECT currentnext FROM m_lotctl WHERE m_lotctl_id=100')[0].currentnext) === Number(ctl0) + 1, 'now ' + q('SELECT currentnext FROM m_lotctl WHERE m_lotctl_id=100')[0].currentnext);
  ok('P2-storage', 'the received quantity sits in storage under THAT instance (stock by lot)', !!gen && q('SELECT qtyonhand AS q FROM m_storageonhand WHERE m_product_id=136 AND m_attributesetinstance_id=?', [ln.asi]).reduce(function (a, r) { return a + Number(r.q); }, 0) === 5, 'rows=' + JSON.stringify(q('SELECT m_attributesetinstance_id AS a, qtyonhand AS q FROM m_storageonhand WHERE m_product_id=136 AND m_attributesetinstance_id>0')));
  fresh(); H.db.run("UPDATE m_attributeset SET isautogeneratelot='N' WHERE m_attributeset_id=101");
  var T3 = twinReceipt(136, 5), ln3 = T3.lid ? q('SELECT m_attributesetinstance_id AS asi FROM m_inoutline WHERE m_inoutline_id=?', [T3.lid])[0] : null;
  ok('P2-off', 'flag N: no instance is generated (control)', !!ln3 && !Number(ln3.asi), 'line asi=' + (ln3 && ln3.asi));

  var verdict = judged === 0 ? 'INCONCLUSIVE' : fail > 0 ? 'FAIL' : inc > 0 ? 'INCONCLUSIVE' : 'PASS';
  log('§ASR-SUMMARY verdict=' + verdict + ' judged=' + judged + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + ' noted_as_designed=' + noted + ' break=' + (BREAK || 'none'));
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(function (e) { console.log('§ASR-SUMMARY verdict=ERROR ' + (e && e.stack || e)); process.exit(2); });
