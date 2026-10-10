#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-VOID-REVERSAL (bim-compiler prompts/SQLiteIDEMPIERE_PORT_BRIEF.md §VOID-1; CARDINAL RULE: the shipped ERP must void
//   exactly like legacy iDempiere). READ THE LOG after every run: every verdict is a §-line, the exit code is not the evidence.
// THE ISSUE it proves/disproves: before this lane `erp/model_order.js` MOrder.voidIt REFUSED to void a completed Sales Order that had
//   a completed shipment or invoice ("createReversals … not ported"), where legacy (MOrder.voidIt :2680 → createReversals :2764-2842)
//   reverse-corrects them INSIDE the same transaction. Each case drives the MODEL LAYER the page runs (ModelLayer.run SAVE / DOCACTION
//   through the Process_Order workflow, the shipped erp/ad_seed.db + its self-heal patch, sql.js with the callout SQL functions, the
//   recorded clock = today) and judges the result against the LEGACY RULE (cite per check), never against our own output:
//     W-VOID-UNSHIPPED  standard order (no documents) — VO, lines zero, reservation released (regression guard: worked before)
//     W-VOID-SHIPPED    warehouse order (shipment only) — the shipment reverse-corrected (RE/RE, stock back, books swapped)
//     W-VOID-POS        POS order (shipment + invoice) — the S12 shape measured on the pilot (closure of c_order 1000736)
//     W-VOID-TAXED      POS order, CT Sales 6% — the S12b shape (reversal tax row negated, Tax-Due leg)
//     W-VOID-PAID       on-credit order whose invoice a payment settled — the payment allocation reversed (inactive, RE, ^), payment
//                       unallocated, invoice-vs-reversal allocation (MInvoice.reverse :2785-2812, the O2C5 shape)
//     W-VOID-ATOMIC     a validator refuses the shipment's reverse-correct mid-void → ok=false, ZERO ops, db unchanged
//     NEG-UNPOSTED      negative control: the original shipment's books deleted before the void → the reversal cannot be posted
//                       ("Original Shipment/Receipt not posted yet", Doc_InOut :298) → the books check MUST report FAIL
//   A case that cannot be driven prints INCONCLUSIVE, never PASS.
'use strict';
var fs = require('fs'), path = require('path');
var ERP = path.join(__dirname, '..');
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js'); }

var TODAY = process.env.TODAY || new Date().toISOString().slice(0, 10), DAY = TODAY + ' 00:00:00';
var results = [], log = function (s) { console.log(s); };
function verdict(id, checks) {
  var judged = checks.length, failed = checks.filter(function (c) { return !c.ok; });
  checks.forEach(function (c) { log('  §W-VOID-CHECK case=' + id + ' key=' + c.key + ' ' + (c.ok ? 'OK' : 'FAIL') + ' rule="' + c.rule + '"' + (c.ok ? '' : ' want=' + JSON.stringify(c.want) + ' got=' + JSON.stringify(c.got))); });
  var v = !judged ? 'INCONCLUSIVE' : failed.length ? 'FAIL' : 'PASS';
  log('§W-VOID case=' + id + ' verdict=' + v + ' judged=' + judged + ' failed=' + failed.length);
  results.push({ id: id, v: v }); return v;
}
function eq(key, rule, got, want) { var g = JSON.stringify(got), w = JSON.stringify(want); return { key: key, rule: rule, ok: g === w, got: got, want: want }; }
function r2(v) { return Math.round(Number(v || 0) * 100) / 100; }

(async function main() {
  var SQL = await initSqlJs();
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  var pOk = 0, pFail = 0;                                                    // idempiere.html's FS-15 self-heal loader, statement by statement
  fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); pOk++; } catch (e) { pFail++; } });
  log('§W-VOID-SEED ad_seed.db + patches/ad_seed.db.sql statements=' + pOk + ' failed=' + pFail + ' today=' + TODAY);
  var A = require(path.join(ERP, 'ad_callout.js'));
  ['support', 'support_stock', 'views', 'currency', 'uom', 'pricing', 'tax', 'sqlfn'].forEach(function (m) { require(path.join(ERP, 'callouts', m + '.js')); });
  A.RUNTIME.registerSqlFunctions(function (n, f) { db.create_function(n, f); });   // crud_overlay.js:364 — the host registers the PL/pgSQL ports
  var ML = require(path.join(ERP, 'model_layer.js'));
  ['model_trade', 'model_ctor', 'model_cost', 'model_match', 'model_order', 'model_invoice', 'model_post'].forEach(function (m) { require(path.join(ERP, m + '.js')); });
  var MV = require(path.join(ERP, 'ad_modelval.js'));

  function q(sql, params) {                                                  // crud_overlay._modelQuery: lower-case row keys
    var st = db.prepare(sql), out = [];
    try { if (params && params.length) st.bind(params.map(function (v) { return v === undefined ? null : v; })); while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } }
    finally { st.free(); }
    return out;
  }
  var uu = 0, clock = Date.parse(DAY.replace(' ', 'T') + 'Z') + 9 * 3600 * 1000;
  function env() { clock += 1000; return { client: 11, org: 11, user: 100, role: 102, date: DAY, now: TODAY + ' 09:00:00', nowMillis: clock, uuid: function () { uu++; return '00000000-0000-4000-8000-' + ('000000000000' + uu).slice(-12); } }; }
  // apply an op-group the way commitGroup + the listTip fold do (CREATE gets a fresh key, {__opRef} resolved, UPDATE/DELETE by key)
  var cols = {}, nextId = {};
  function colsOf(t) { if (!cols[t]) cols[t] = q('PRAGMA table_info(' + t + ')').map(function (c) { return c.name.toLowerCase(); }); return cols[t]; }
  function newId(t) { if (nextId[t] == null) { var m = q('SELECT MAX(' + t + '_id) AS m FROM ' + t)[0]; nextId[t] = Math.max(Number(m.m || 0), 9000000); } return ++nextId[t]; }
  function apply(ops) {
    var ids = [], fix = function (v) { return v && typeof v === 'object' && v.__opRef != null ? ids[v.__opRef] : v; };
    ops.forEach(function (o, i) {
      var t = o.table, cs = colsOf(t); if (!cs.length) { ids[i] = null; return; }
      if (o.op_type === 'CRUD_CREATE') {
        var f = Object.assign({}, o.fields), pk = t + '_id';
        if (cs.indexOf(pk) >= 0) { f[pk] = newId(t); ids[i] = f[pk]; } else ids[i] = f[t + '_uu'];
        Object.keys(f).forEach(function (k) { f[k] = fix(f[k]); if (cs.indexOf(k) < 0) delete f[k]; });
        var ks = Object.keys(f); db.run('INSERT INTO ' + t + ' (' + ks.map(function (k) { return '"' + k + '"'; }).join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')', ks.map(function (k) { return f[k] === undefined ? null : f[k]; }));
      } else if (o.op_type === 'CRUD_UPDATE') {
        var kk = Object.keys(o.changes).filter(function (k) { return cs.indexOf(k) >= 0; });
        if (kk.length) db.run('UPDATE ' + t + ' SET ' + kk.map(function (k) { return '"' + k + '"=?'; }).join(',') + ' WHERE ' + (o.idCol || t + '_id') + '=?', kk.map(function (k) { return fix(o.changes[k].new); }).concat([fix(o.id)]));
        ids[i] = fix(o.id);
      } else if (o.op_type === 'CRUD_DELETE') db.run('DELETE FROM ' + t + ' WHERE ' + (o.idCol || t + '_id') + '=?', [fix(o.id)]);
    });
    return ids;
  }
  function run(spec) { var r = ML.run(q, env(), spec); (r.log || []).forEach(function (l) { if (/§MODEL-(ERR|SEVERE|POST|NAMED|UNPORTED)/.test(l)) log('    ' + String(l).slice(0, 300)); }); if (r.ok) apply(r.ops); return r; }
  function one(sql, p) { return q(sql, p || [])[0] || null; }

  // ── a Sales Order through the model SAVE path (header, lines priced by MOrderLine.beforeSave) then DocAction CO ──
  function sale(opt) {
    var org = opt.org || 11, wh = opt.wh || 103, bp = 112, loc = 108;
    var h = run({ table: 'c_order', timing: 'SAVE', changes: ML.newPO(new ML.Trx(q, env()), 'c_order', { ad_org_id: org, c_doctypetarget_id: opt.dt, c_doctype_id: 0, issotrx: 'Y', c_bpartner_id: bp, c_bpartner_location_id: loc,
      bill_bpartner_id: bp, bill_location_id: loc, m_warehouse_id: wh, m_pricelist_id: 101, c_currency_id: 100, c_paymentterm_id: 105, salesrep_id: 101, paymentrule: opt.paymentrule || 'P',
      invoicerule: 'I', deliveryrule: 'A', deliveryviarule: opt.deliveryVia || 'P', priorityrule: '5', freightcostrule: 'I', dateordered: DAY, dateacct: DAY, datepromised: DAY, docstatus: 'DR', docaction: 'CO',
      totallines: 0, grandtotal: 0, isapproved: 'N', processed: 'N', posted: 'N', isdiscountprinted: 'N', istaxincluded: 'N', isdropship: 'N', isselected: 'N', sendemail: 'N', isinvoiced: 'N', isdelivered: 'N', isprinted: 'N' }) });
    if (!h.ok) return { err: 'header save refused: ' + (h.error || h.msg) };
    var oid = one('SELECT MAX(c_order_id) AS id FROM c_order').id;
    for (var i = 0; i < opt.lines.length; i++) {
      var l = opt.lines[i];
      var r = run({ table: 'c_orderline', timing: 'SAVE', changes: ML.newPO(new ML.Trx(q, env()), 'c_orderline', { c_order_id: oid, ad_org_id: org, m_product_id: l.product, qtyentered: l.qty, qtyordered: l.qty,
        c_tax_id: l.tax || 104, priceentered: 0, priceactual: 0, pricelist: 0, qtydelivered: 0, qtyinvoiced: 0, qtyreserved: 0, line: 0, isdescription: 'N', processed: 'N' }) });
      if (!r.ok) return { err: 'line save refused: ' + (r.error || r.msg) };
    }
    var c = run({ table: 'c_order', timing: 'DOCACTION', id: oid, action: 'CO' });
    if (!c.ok) return { err: 'complete refused: ' + c.msg };
    return { id: oid };
  }
  function voidOrder(oid) { return run({ table: 'c_order', timing: 'DOCACTION', id: oid, action: 'VO' }); }
  function snapStock(p, wh) { var r = one('SELECT COALESCE(SUM(s.qtyonhand),0) AS q FROM m_storageonhand s JOIN m_locator l ON l.m_locator_id=s.m_locator_id WHERE s.m_product_id=? AND l.m_warehouse_id=?', [p, wh]); return Number(r.q); }
  function snapResv(p, wh) { var r = one('SELECT COALESCE(SUM(qty),0) AS q FROM m_storagereservation WHERE m_product_id=? AND m_warehouse_id=? AND issotrx=\'Y\'', [p, wh]); return Number(r.q); }
  function snapCost(p) { return q('SELECT c_acctschema_id AS s, m_costelement_id AS e, currentqty AS q, cumulatedqty AS cq, cumulatedamt AS ca FROM m_cost WHERE m_product_id=? AND m_costelement_id IN (102,103) ORDER BY 1,2', [p]); }
  // BP 112: the stored columns + the LEGACY open-item formula evaluated independently of model_trade (MBPartner.setTotalOpenBalance :711-757:
  // Σ invoiceOpen()×MultiplierAP over unpaid CO/CL invoices − Σ paymentAvailable over unallocated CO/CL payments; invoiceopen = the shipped PL/pgSQL port, callouts/sqlfn.js)
  function legacyOpen(bp) {
    A.bind(q); var tot = 0;
    q("SELECT c_invoice_id AS id, issotrx AS so FROM c_invoice WHERE c_bpartner_id=? AND ispaid='N' AND docstatus IN ('CO','CL')", [bp]).forEach(function (i) { tot += Number(one('SELECT invoiceopen(?,0) AS v', [i.id]).v || 0) * (i.so === 'Y' ? 1 : -1); });
    q("SELECT c_payment_id AS id, payamt AS a, isreceipt AS r FROM c_payment WHERE c_bpartner_id=? AND isallocated='N' AND c_charge_id IS NULL AND docstatus IN ('CO','CL')", [bp]).forEach(function (p) {
      var al = Number(one("SELECT COALESCE(SUM(l.amount),0) AS v FROM c_allocationline l JOIN c_allocationhdr h ON h.c_allocationhdr_id=l.c_allocationhdr_id WHERE l.c_payment_id=? AND h.isactive='Y'", [p.id]).v);
      tot -= Number(p.a) * (p.r === 'Y' ? 1 : -1) - al; });
    return r2(tot);
  }
  function snapBP() { var b = one('SELECT totalopenbalance AS o, so_creditused AS c, actuallifetimevalue AS l FROM c_bpartner WHERE c_bpartner_id=112'); return { o: r2(b.o), f: legacyOpen(112), c: r2(b.c), l: r2(b.l) }; }
  function bpChecks(bp0, payDelta) { var b = snapBP(); return [eq('bp_formula', 'MBPartner.setTotalOpenBalance formula over the documents: the void nets the sale out' + (payDelta ? ', leaving the payment unallocated (O2C5)' : ''), b.f, r2(bp0.f - (payDelta || 0))),
    eq('bp_stored', 'MAllocationHdr.updateBP :954-968 stores that formula', b.o, b.f), eq('bp_credit_life', 'CreditManagerInvoice: +GT on the sale, −GT on its reversal → SO_CreditUsed / ActualLifeTimeValue back', [b.c, b.l], [bp0.c, bp0.l])]; }
  function facts(t, id) { return q('SELECT c_acctschema_id AS s, account_id AS a, amtacctdr AS dr, amtacctcr AS cr, qty FROM fact_acct WHERE ad_table_id=? AND record_id=? ORDER BY c_acctschema_id, account_id, amtacctdr, amtacctcr', [t, id]).map(function (f) { return f.s + ':' + f.a + ':' + r2(f.dr) + ':' + r2(f.cr) + ':' + Number(f.qty || 0); }); }
  function swapped(fs0) { return fs0.map(function (s) { var p = s.split(':'); return p[0] + ':' + p[1] + ':' + p[3] + ':' + p[2] + ':' + (-Number(p[4])); }).sort(); }
  function negated(fs0) { return fs0.map(function (s) { var p = s.split(':'); return p[0] + ':' + p[1] + ':' + r2(-Number(p[2])) + ':' + r2(-Number(p[3])) + ':' + (-Number(p[4])); }).sort(); }
  var VOIDED = (one("SELECT msgtext AS m FROM ad_message WHERE value='Voided'") || {}).m;
  var INV_LABEL = (one("SELECT name AS n FROM ad_element WHERE lower(columnname)='c_invoice_id'") || {}).n;

  // the legacy rule set for one voided order's reversals (MInOut.reverse :2743-2893, MInvoice.reverse :2626-2814, Doc_InOut :288-327,
  // FactLine.setAmtSource with IsAllowNegativePosting=Y, Doc_AllocationHdr :199-213/:347-357) — shape measured on the pilot (§VOID-1)
  function judgeReversals(oid, want) {
    var c = [], o = one('SELECT * FROM c_order WHERE c_order_id=?', [oid]);
    c.push(eq('order', 'MOrder.voidIt :2753-2757 + DocumentEngine.voidIt → VO', [o.docstatus, o.docaction, r2(o.totallines), r2(o.grandtotal), o.processed, o.description], ['VO', '--', 0, 0, 'Y', VOIDED]));
    q('SELECT * FROM c_orderline WHERE c_order_id=? ORDER BY line', [oid]).forEach(function (l, i) {
      c.push(eq('line' + l.line, 'MOrder.voidIt :2702-2712 "<Voided> (<qty>)" + Qty 0; reversals restored Delivered/Invoiced/Reserved', [r2(l.qtyordered), r2(l.qtyentered), r2(l.linenetamt), l.description, r2(l.qtyreserved), r2(l.qtydelivered), r2(l.qtyinvoiced)], [0, 0, 0, VOIDED + ' (' + want.qty[i] + ')', 0, 0, 0]));
    });
    var ios = q('SELECT * FROM m_inout WHERE c_order_id=? ORDER BY m_inout_id', [oid]);
    c.push(eq('shipments', 'createReversals :2793-2804 — completed shipment RE + reversal RE', ios.map(function (x) { return x.docstatus + '/' + x.docaction; }), want.ship ? ['RE/--', 'RE/--'] : []));
    if (want.ship && ios.length === 2) {
      var so = ios[0], sr = ios[1];
      c.push(eq('ship_link', 'MInOut.reverse :2858-2889 Reversal_ID both ways, "{->orig)" / "(rev<-)", same MovementType/C_Order_ID', [String(so.reversal_id), String(sr.reversal_id), sr.description, so.description, sr.movementtype, String(sr.c_order_id), so.posted, sr.posted],
        [String(sr.m_inout_id), String(so.m_inout_id), '{->' + so.documentno + ')', '(' + sr.documentno + '<-)', so.movementtype, String(oid), 'Y', 'Y']));
      var ol = q('SELECT * FROM m_inoutline WHERE m_inout_id=? ORDER BY line', [so.m_inout_id]), rl = q('SELECT * FROM m_inoutline WHERE m_inout_id=? ORDER BY line', [sr.m_inout_id]);
      c.push(eq('ship_lines', 'MInOut.reverse :2793-2807 MovementQty negated, ReversalLine_ID', rl.map(function (l, i) { return [r2(l.movementqty), String(l.reversalline_id)]; }), ol.map(function (l) { return [r2(-l.movementqty), String(l.m_inoutline_id)]; })));
      var maO = [], maR = []; ol.forEach(function (l) { q('SELECT movementqty AS q, datematerialpolicy AS d FROM m_inoutlinema WHERE m_inoutline_id=?', [l.m_inoutline_id]).forEach(function (m) { maO.push(r2(-m.q) + '@' + String(m.d).slice(0, 10)); }); });
      rl.forEach(function (l) { q('SELECT movementqty AS q, datematerialpolicy AS d FROM m_inoutlinema WHERE m_inoutline_id=?', [l.m_inoutline_id]).forEach(function (m) { maR.push(r2(m.q) + '@' + String(m.d).slice(0, 10)); }); });
      c.push(eq('ship_ma', 'MInOut.reverse :2808-2819 MA copied, qty negated, same DateMaterialPolicy', maR.sort(), maO.sort()));
      var fo = facts(319, so.m_inout_id), fr = facts(319, sr.m_inout_id);
      c.push(eq('post_ship_rev', 'Doc_InOut :288-327 updateReverseLine — the original books, Dr/Cr swapped, qty negated (both schemas)', fr.slice().sort(), fo.length ? swapped(fo) : ['<original not posted>']));
      var cdO = q('SELECT c_acctschema_id AS s, m_costdetail_id AS id, amt, qty FROM m_costdetail WHERE m_inoutline_id IN (' + ol.map(function (l) { return l.m_inoutline_id; }).join(',') + ') ORDER BY 1', []);
      var cdR = q('SELECT c_acctschema_id AS s, ref_costdetail_id AS ref, amt, qty, isbackdate AS b FROM m_costdetail WHERE m_inoutline_id IN (' + rl.map(function (l) { return l.m_inoutline_id; }).join(',') + ') ORDER BY 1', []);
      c.push(eq('cost_detail_rev', 'Doc_InOut :389-404 createShipment(amt = original cost, qty, Ref_CostDetail_ID = original detail) → IsBackDate Y', cdR.map(function (x) { return [x.s, String(x.ref), r2(x.amt), r2(x.qty), x.b]; }), cdO.map(function (x) { return [x.s, String(x.id), r2(-x.amt), r2(-x.qty), 'Y']; })));
    }
    var ivs = q('SELECT * FROM c_invoice WHERE c_order_id=? ORDER BY c_invoice_id', [oid]);
    c.push(eq('invoices', 'createReversals :2826-2837 — completed invoice RE + reversal RE', ivs.map(function (x) { return x.docstatus + '/' + x.docaction; }), want.inv ? ['RE/--', 'RE/--'] : []));
    if (want.inv && ivs.length === 2) {
      var io0 = ivs[0], ir = ivs[1];
      c.push(eq('inv_link', 'MInvoice.reverse :2733-2783 Reversal_ID both ways, "{->orig)"/"(rev<-)", IsPaid Y/Y, C_Payment_ID 0, GrandTotal negated', [String(io0.reversal_id), String(ir.reversal_id), ir.description, io0.description, io0.ispaid, ir.ispaid, io0.c_payment_id, ir.c_payment_id, r2(ir.grandtotal), io0.posted, ir.posted],
        [String(ir.c_invoice_id), String(io0.c_invoice_id), '{->' + io0.documentno + ')', '(' + ir.documentno + '<-)', 'Y', 'Y', null, null, r2(-io0.grandtotal), 'Y', 'Y']));
      var lo = q('SELECT * FROM c_invoiceline WHERE c_invoice_id=? ORDER BY line', [io0.c_invoice_id]), lr = q('SELECT * FROM c_invoiceline WHERE c_invoice_id=? ORDER BY line', [ir.c_invoice_id]);
      c.push(eq('inv_lines', 'MInvoice.reverse :2710-2732 Qty/LineNetAmt/TaxAmt negated, prices kept; :2762-2775 M_InOutLine_ID cleared', lr.map(function (l) { return [r2(l.qtyinvoiced), r2(l.linenetamt), r2(l.taxamt), r2(l.priceactual), l.m_inoutline_id]; }), lo.map(function (l) { return [r2(-l.qtyinvoiced), r2(-l.linenetamt), r2(-l.taxamt), r2(l.priceactual), null]; })));
      c.push(eq('inv_lines_orig_unlinked', 'MInvoice.reverse :2762-2775 / MInOut.reverse :2829-2856 — original lines lose M_InOutLine_ID', lo.map(function (l) { return l.m_inoutline_id; }), lo.map(function () { return null; })));
      var to = q('SELECT c_tax_id AS t, taxbaseamt AS b, taxamt AS a FROM c_invoicetax WHERE c_invoice_id=? ORDER BY 1', [io0.c_invoice_id]), tr = q('SELECT c_tax_id AS t, taxbaseamt AS b, taxamt AS a FROM c_invoicetax WHERE c_invoice_id=? ORDER BY 1', [ir.c_invoice_id]);
      c.push(eq('invoice_tax_rev', 'MInvoiceLine.afterSave → tax from the negated lines (S12b 105:-2000:-120)', tr.map(function (x) { return x.t + ':' + r2(x.b) + ':' + r2(x.a); }), to.map(function (x) { return x.t + ':' + r2(-x.b) + ':' + r2(-x.a); })));
      c.push(eq('post_inv_rev', 'Doc_Invoice: the reversal posts its NEGATIVE amounts on the same side (IsAllowNegativePosting=Y)', facts(318, ir.c_invoice_id).slice().sort(), negated(facts(318, io0.c_invoice_id))));
      var al = q('SELECT l.c_allocationhdr_id AS h, l.c_invoice_id AS i, l.c_payment_id AS p, l.amount AS a, l.c_order_id AS o, l.isactive AS act FROM c_allocationline l WHERE l.c_invoice_id IN (?,?) ORDER BY l.c_allocationline_id', [io0.c_invoice_id, ir.c_invoice_id]);
      var newA = al.filter(function (x) { return !x.p; }), hdr = newA.length ? one('SELECT * FROM c_allocationhdr WHERE c_allocationhdr_id=?', [newA[0].h]) : null;
      c.push(eq('inv_allocation', 'MInvoice.reverse :2785-2812 "Invoice: orig/rev" CO, +GT orig / −GT rev, C_Order_ID filled (MAllocationLine.beforeSave)', hdr ? [hdr.docstatus, hdr.description, newA.map(function (x) { return [x.i === io0.c_invoice_id ? 'orig' : 'rev', r2(x.a), String(x.o)]; })] : null,
        [ 'CO', INV_LABEL + ': ' + io0.documentno + '/' + ir.documentno, [['orig', r2(io0.grandtotal), String(oid)], ['rev', r2(-io0.grandtotal), String(oid)]] ]));
      if (hdr) c.push(eq('post_inv_alloc', 'Doc_AllocationHdr :347-357 AR CR per line (lines carry C_Order_ID → the :199-213 skip does not fire; pilot: 4 facts on every reversal allocation)', facts(735, hdr.c_allocationhdr_id).length, 4));
      if (want.paid) {
        var pa = al.filter(function (x) { return x.p; }), ph = pa.length ? one('SELECT * FROM c_allocationhdr WHERE c_allocationhdr_id=?', [pa[0].h]) : null, pay = pa.length ? one('SELECT * FROM c_payment WHERE c_payment_id=?', [pa[0].p]) : null;
        c.push(eq('pay_alloc_reversed', 'MAllocationHdr.reverseIt :904-945 inactive, RE, DocumentNo^, lines inactive + 0, facts deleted; payment IsAllocated N', ph ? [ph.isactive, ph.docstatus, /\^$/.test(ph.documentno), pa.map(function (x) { return [x.act, r2(x.a)]; }), facts(735, ph.c_allocationhdr_id).length, pay.isallocated, pay.docstatus] : null,
          ['N', 'RE', true, [['N', 0]], 0, 'N', 'CO']));
      }
    }
    return c;
  }

  // ═══ W-VOID-UNSHIPPED ═══
  (function () {
    var resv0 = snapResv(137, 103), s = sale({ dt: 132, lines: [{ product: 137, qty: 2 }] });
    if (s.err) return verdict('W-VOID-UNSHIPPED', []), log('  §W-VOID-INCONCLUSIVE ' + s.err);
    var resv1 = snapResv(137, 103), v = voidOrder(s.id);
    log('§W-VOID-RUN case=W-VOID-UNSHIPPED order=' + s.id + ' ok=' + v.ok + ' status=' + v.status + ' ops=' + v.ops.length + (v.msg ? ' msg="' + v.msg + '"' : ''));
    var c = [eq('ok', 'MOrder.voidIt returns true', v.ok, true), eq('reserved_on_complete', 'MOrder.reserveStock :1925 reserved the ordered qty', resv1 - resv0, 2), eq('reserved_after_void', 'MOrder.voidIt :2735 reserveStock(VO) releases it', snapResv(137, 103) - resv0, 0)];
    verdict('W-VOID-UNSHIPPED', v.ok ? c.concat(judgeReversals(s.id, { qty: [2], ship: false, inv: false })) : c);
  })();
  // ═══ W-VOID-SHIPPED ═══
  (function () {
    var st0 = snapStock(137, 103), cost0 = snapCost(137), s = sale({ dt: 134, lines: [{ product: 137, qty: 3 }] });
    if (s.err) { log('  §W-VOID-INCONCLUSIVE ' + s.err); return verdict('W-VOID-SHIPPED', []); }
    var st1 = snapStock(137, 103), v = voidOrder(s.id);
    log('§W-VOID-RUN case=W-VOID-SHIPPED order=' + s.id + ' ok=' + v.ok + ' status=' + v.status + ' ops=' + v.ops.length + (v.msg ? ' msg="' + v.msg + '"' : ''));
    var c = [eq('ok', 'MOrder.voidIt → createReversals → MInOut.reverseCorrectIt', v.ok, true), eq('stock_sold', 'MInOut.completeIt took 3', st1 - st0, -3), eq('stock_delta', 'the reversal (C-, qty −3) puts it back', snapStock(137, 103) - st0, 0),
      eq('cost_qty_and_cumulated', 'MCostDetail.process :1741-1780 average elements: qty back, cumulated restored on the reversal (pilot m_costhistory)', snapCost(137), cost0)];
    verdict('W-VOID-SHIPPED', v.ok ? c.concat(judgeReversals(s.id, { qty: [3], ship: true, inv: false })) : c);
  })();
  // ═══ W-VOID-POS (S12 shape) ═══
  var posOrder = null;
  (function () {
    var st0 = snapStock(137, 103), resv0 = snapResv(137, 103), bp0 = snapBP(), s = sale({ dt: 135, lines: [{ product: 137, qty: 1 }] });
    if (s.err) { log('  §W-VOID-INCONCLUSIVE ' + s.err); return verdict('W-VOID-POS', []); }
    posOrder = s.id;
    var v = voidOrder(s.id);
    log('§W-VOID-RUN case=W-VOID-POS order=' + s.id + ' ok=' + v.ok + ' status=' + v.status + ' ops=' + v.ops.length + ' opTables=' + JSON.stringify(v.ops.reduce(function (m, x) { var k = x.table + ':' + x.op_type.replace('CRUD_', ''); m[k] = (m[k] || 0) + 1; return m; }, {})) + (v.msg ? ' msg="' + v.msg + '"' : ''));
    var logs = q("SELECT ad_table_id AS t, deltaqty AS d FROM m_storagereservationlog WHERE m_product_id=137 ORDER BY rowid DESC LIMIT 2").reverse().map(function (x) { return x.t + ':' + r2(x.d); });
    var c = [eq('ok', 'MOrder.voidIt → createReversals', v.ok, true), eq('stock_delta', 'S12 stock net {}', snapStock(137, 103) - st0, 0), eq('reservation_delta', 'reversal +1 (MInOut :1748-1760) then voidIt −1 (reserveStock)', snapResv(137, 103) - resv0, 0),
      eq('reservation_log', 'pilot 1000736: 320:+1 (reversal line) then 260:-1 (order line)', logs, ['320:1', '260:-1'])].concat(bpChecks(bp0, 0));
    verdict('W-VOID-POS', v.ok ? c.concat(judgeReversals(s.id, { qty: [1], ship: true, inv: true })) : c);
  })();
  // ═══ W-VOID-TAXED (S12b shape) ═══
  (function () {
    var s = sale({ dt: 135, lines: [{ product: 137, qty: 1, tax: 105 }] });
    if (s.err) { log('  §W-VOID-INCONCLUSIVE ' + s.err); return verdict('W-VOID-TAXED', []); }
    var iv = one('SELECT c_invoice_id AS id FROM c_invoice WHERE c_order_id=?', [s.id]), tx = iv ? q('SELECT taxamt FROM c_invoicetax WHERE c_invoice_id=?', [iv.id]) : [];
    var v = voidOrder(s.id);
    log('§W-VOID-RUN case=W-VOID-TAXED order=' + s.id + ' ok=' + v.ok + ' status=' + v.status + ' ops=' + v.ops.length + (v.msg ? ' msg="' + v.msg + '"' : ''));
    var c = [eq('ok', 'MOrder.voidIt → createReversals', v.ok, true), eq('tax_nonzero', 'the case is taxed (6%)', tx.length === 1 && r2(tx[0].taxamt) !== 0, true)];
    verdict('W-VOID-TAXED', v.ok ? c.concat(judgeReversals(s.id, { qty: [1], ship: true, inv: true })) : c);
  })();
  // ═══ W-VOID-PAID ═══
  (function () {
    var bp0 = snapBP(), s = sale({ dt: 133, lines: [{ product: 137, qty: 2 }] });
    if (s.err) { log('  §W-VOID-INCONCLUSIVE ' + s.err); return verdict('W-VOID-PAID', []); }
    var iv = one('SELECT * FROM c_invoice WHERE c_order_id=?', [s.id]);
    var p = run({ table: 'c_payment', timing: 'SAVE', changes: ML.newPO(new ML.Trx(q, env()), 'c_payment', { ad_org_id: 11, c_doctype_id: 119, c_bankaccount_id: 100, c_bpartner_id: 112, c_invoice_id: iv.c_invoice_id, c_currency_id: 100,
      payamt: iv.grandtotal, tendertype: 'X', datetrx: DAY, dateacct: DAY, docstatus: 'DR', docaction: 'CO' }) });
    var pid = one('SELECT MAX(c_payment_id) AS id FROM c_payment').id, pc = p.ok ? run({ table: 'c_payment', timing: 'DOCACTION', id: pid, action: 'CO' }) : p;
    var paid = one('SELECT ispaid FROM c_invoice WHERE c_invoice_id=?', [iv.c_invoice_id]).ispaid;
    log('§W-VOID-RUN case=W-VOID-PAID payment=' + pid + ' ok=' + pc.ok + ' invoicePaid=' + paid);
    if (!pc.ok || paid !== 'Y') { log('  §W-VOID-INCONCLUSIVE payment did not settle the invoice: ' + (pc.msg || pc.error)); return verdict('W-VOID-PAID', []); }
    var v = voidOrder(s.id);
    log('§W-VOID-RUN case=W-VOID-PAID order=' + s.id + ' ok=' + v.ok + ' status=' + v.status + ' ops=' + v.ops.length + (v.msg ? ' msg="' + v.msg + '"' : ''));
    var pay = r2(iv.grandtotal), c = [eq('ok', 'MOrder.voidIt → MInvoice.reverseCorrectIt → reverseAllocations', v.ok, true)].concat(bpChecks(bp0, pay));
    verdict('W-VOID-PAID', v.ok ? c.concat(judgeReversals(s.id, { qty: [2], ship: true, inv: true, paid: true })) : c);
  })();
  // ═══ W-VOID-ATOMIC ═══
  (function () {
    var s = sale({ dt: 135, lines: [{ product: 137, qty: 1 }] });
    if (s.err) { log('  §W-VOID-INCONCLUSIVE ' + s.err); return verdict('W-VOID-ATOMIC', []); }
    var armed = true; MV.registerValidator('M_InOut', 'BEFORE_REVERSECORRECT', 'witness.refuse', function () { return armed ? 'witness refuses the reverse-correct' : null; });
    var before = JSON.stringify([q('SELECT COUNT(*) AS n FROM m_inout')[0], q('SELECT COUNT(*) AS n FROM c_invoice')[0], q('SELECT COUNT(*) AS n FROM fact_acct')[0], one('SELECT docstatus FROM c_order WHERE c_order_id=?', [s.id])]);
    var v = voidOrder(s.id); armed = false;
    var after = JSON.stringify([q('SELECT COUNT(*) AS n FROM m_inout')[0], q('SELECT COUNT(*) AS n FROM c_invoice')[0], q('SELECT COUNT(*) AS n FROM fact_acct')[0], one('SELECT docstatus FROM c_order WHERE c_order_id=?', [s.id])]);
    log('§W-VOID-RUN case=W-VOID-ATOMIC order=' + s.id + ' ok=' + v.ok + ' ops=' + v.ops.length + ' msg="' + v.msg + '"');
    verdict('W-VOID-ATOMIC', [eq('refused', 'a refusal anywhere in createReversals fails the void (MOrder.java:2798-2800 return false)', v.ok, false), eq('zero_ops', 'ModelLayer.run: ok=false → ops=[] (one trxName rolls back)', v.ops.length, 0),
      eq('db_unchanged', 'nothing was applied', after, before), eq('msg_names_it', 'the refusal names the shipment', /Could not reverse Shipment/.test(v.msg || ''), true)]);
  })();
  // ═══ NEG-UNPOSTED (negative control) ═══
  (function () {
    var s = sale({ dt: 135, lines: [{ product: 137, qty: 1 }] });
    if (s.err) { log('  §W-VOID-INCONCLUSIVE ' + s.err); return verdict('NEG-UNPOSTED', []); }
    var sh = one('SELECT m_inout_id AS id FROM m_inout WHERE c_order_id=?', [s.id]);
    db.run('DELETE FROM fact_acct WHERE ad_table_id=319 AND record_id=?', [sh.id]); db.run("UPDATE m_inout SET posted='N' WHERE m_inout_id=?", [sh.id]);
    var v = voidOrder(s.id), c = judgeReversals(s.id, { qty: [1], ship: true, inv: true }), bad = c.filter(function (x) { return !x.ok; }).map(function (x) { return x.key; });
    log('§W-VOID-RUN case=NEG-UNPOSTED order=' + s.id + ' ok=' + v.ok + ' failingKeys=' + bad.join(','));
    var rv = one('SELECT posted FROM m_inout WHERE c_order_id=? AND reversal_id IS NOT NULL ORDER BY m_inout_id DESC', [s.id]);
    verdict('NEG-UNPOSTED', [eq('books_check_detects', 'the witness reports FAIL on post_ship_rev when the original was never posted', bad.indexOf('post_ship_rev') >= 0, true),
      eq('reversal_not_posted', 'Doc_InOut :298 "Original Shipment/Receipt not posted yet" → the reversal stays Posted=N', rv && rv.posted, 'N')]);
  })();

  var pass = results.filter(function (r) { return r.v === 'PASS'; }).length, fail = results.filter(function (r) { return r.v === 'FAIL'; }).length, inc = results.filter(function (r) { return r.v === 'INCONCLUSIVE'; }).length;
  log('§W-VOID-SUMMARY cases=' + results.length + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + ' verdict=' + (fail ? 'FAIL' : inc || !results.length ? 'INCONCLUSIVE' : 'PASS'));
  process.exit(fail || inc ? 1 : 0);
})().catch(function (e) { console.log('§W-VOID-ERROR ' + (e && e.stack || e)); process.exit(2); });
