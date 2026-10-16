#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-RMA-WINDOW-PATH (bim-compiler prompts/SQLiteIDEMPIERE.md §RMA-WINDOW-PORT; CARDINAL RULE: a customer return done in the shipped UI behaves like legacy iDempiere).
//   READ THE LOG after every run: every verdict is a §RW line, the exit code is not the evidence.
// THE ISSUE it proves/disproves: the RMA verbs (rmaCheckQty/rmaLineSave/completeRMA/rmaReceiptEffects) were engine-only; the shipped generic save/doc-action path (ModelLayer, the same path the
//   Customer RMA / Customer Return / Invoice windows use) did not refuse an over-shipped RMA line, did not compute M_RMA.Amt/M_RMATax at CO, did not add the return receipt qty to
//   M_RMALine.QtyDelivered nor the credit memo qty to QtyInvoiced. Expected values are the legacy-measured SD-16 values (110.00 = 2 x 50.00 + 10%, tax row 100.00/10.00, QtyDelivered 2,
//   QtyInvoiced 2, refusal "AmtReturned>Shipped", cumulative refusal, over-receipt accepted -> QtyDelivered 5). A case that cannot be driven prints INCONCLUSIVE, never PASS.
'use strict';
var fs = require('fs'), path = require('path');
var ERP = path.join(__dirname, '..');
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js')); }
var TODAY = process.env.TODAY || new Date().toISOString().slice(0, 10), DAY = TODAY + ' 00:00:00';
var results = [], log = function (s) { console.log(s); };
function verdict(id, checks) {
  var judged = checks.length, failed = checks.filter(function (c) { return !c.ok; });
  checks.forEach(function (c) { log('  §RW-CHECK case=' + id + ' key=' + c.key + ' ' + (c.ok ? 'OK' : 'FAIL') + ' rule="' + c.rule + '"' + (c.ok ? '' : ' want=' + JSON.stringify(c.want) + ' got=' + JSON.stringify(c.got))); });
  var v = !judged ? 'INCONCLUSIVE' : failed.length ? 'FAIL' : 'PASS';
  log('§RW case=' + id + ' verdict=' + v + ' judged=' + judged + ' failed=' + failed.length); results.push({ id: id, v: v }); return v;
}
function eq(key, rule, got, want) { return { key: key, rule: rule, ok: JSON.stringify(got) === JSON.stringify(want), got: got, want: want }; }

(async function main() {
  var SQL = await initSqlJs();
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  var pOk = 0, pFail = 0, setupBad = [];                                                    // idempiere.html's FS-15 self-heal loader, statement by statement
  fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); pOk++; } catch (e) { pFail++; log('§RW-SETUP patch statement failed: ' + String(e.message).slice(0, 120)); } });
  if (pFail) setupBad.push('patches/ad_seed.db.sql ' + pFail + ' statements failed');
  log('§RW-SEED ad_seed.db + patches/ad_seed.db.sql statements=' + pOk + ' failed=' + pFail + ' today=' + TODAY);
  var A = require(path.join(ERP, 'ad_callout.js'));
  ['support', 'support_stock', 'views', 'currency', 'uom', 'pricing', 'tax', 'sqlfn'].forEach(function (m) { require(path.join(ERP, 'callouts', m + '.js')); });
  A.RUNTIME.registerSqlFunctions(function (n, f) { db.create_function(n, f); });
  var ML = require(path.join(ERP, 'model_layer.js'));
  var mods = ['model_trade', 'model_ctor', 'model_cost', 'model_match', 'model_order', 'model_invoice', 'model_master'];
  if (fs.existsSync(path.join(ERP, 'model_rma.js'))) mods.push('model_rma'); else log('§RW-NOTE erp/model_rma.js absent: the cases below judge the code as shipped without it');
  mods.push('model_post');
  mods.forEach(function (m) { require(path.join(ERP, m + '.js')); });
  var MV = require(path.join(ERP, 'ad_modelval.js'));
  var E = require(path.join(ERP, 'erp_engine.js')), DP = require(path.join(ERP, 'doc_poster.js'));

  function q(sql, params) {
    var st = db.prepare(sql), out = [];
    try { if (params && params.length) st.bind(params.map(function (v) { return v === undefined ? null : v; })); while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } }
    finally { st.free(); }
    return out;
  }
  function one(sql, p) { return q(sql, p || [])[0] || null; }
  // b3 shim (crud_overlay._mvB3): the BEFORE_SAVE validators read the db through .prepare().get()/.all()
  var b3 = { prepare: function (sql) { return { get: function () { return q(sql, [].slice.call(arguments))[0]; }, all: function () { return q(sql, [].slice.call(arguments)); } }; } };
  var hooksOk = {};
  Object.keys(MV).forEach(function (m) { if (/^install[A-Z].*SaveHooks$/.test(m) && typeof MV[m] === 'function') { try { MV[m](b3); hooksOk[m] = true; } catch (e) { log('§RW-SETUP hook installer ' + m + ' threw: ' + String(e.message).slice(0, 100)); } } });
  ['installMRMASaveHooks', 'installMInOutSaveHooks', 'installMInvoiceSaveHooks'].forEach(function (m) { if (!hooksOk[m]) setupBad.push('validator installer ' + m + ' not installed'); });
  if (typeof MV.installDefaultHooks === 'function') { try { MV.installDefaultHooks(); } catch (e) { setupBad.push('installDefaultHooks threw: ' + e.message); } }

  var uu = 0, clock = Date.parse(DAY.replace(' ', 'T') + 'Z') + 9 * 3600 * 1000;
  function env() { clock += 1000; return { client: 11, org: 11, user: 100, role: 102, date: DAY, now: TODAY + ' 09:00:00', nowMillis: clock, uuid: function () { uu++; return '00000000-0000-4000-8000-' + ('000000000000' + uu).slice(-12); } }; }
  var cols = {}, nextId = {};
  function colsOf(t) { if (!cols[t]) cols[t] = q('PRAGMA table_info(' + t + ')').map(function (c) { return c.name.toLowerCase(); }); return cols[t]; }
  function newId(t) { if (nextId[t] == null) { var m = q('SELECT MAX(' + t + '_id) AS m FROM ' + t)[0]; nextId[t] = Math.max(Number(m.m || 0), 9000000); } return ++nextId[t]; }
  function insertRow(t, f) {
    var cs = colsOf(t); f = Object.assign({}, f); if (cs.indexOf(t + '_id') >= 0 && f[t + '_id'] == null) f[t + '_id'] = newId(t);
    var ks = Object.keys(f).filter(function (k) { return cs.indexOf(k) >= 0; });
    db.run('INSERT INTO ' + t + ' (' + ks.map(function (k) { return '"' + k + '"'; }).join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')', ks.map(function (k) { return f[k] === undefined ? null : f[k]; }));
    return f[t + '_id'];
  }
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
  function run(spec) { var r = ML.run(q, env(), spec); (r.log || []).forEach(function (l) { if (/§MODEL-(ERR|SEVERE|POST|NAMED|UNPORTED)/.test(l)) log('    ' + String(l).slice(0, 260)); }); if (r.ok) apply(r.ops); return r; }

  // uiSave — the window's Save as crud_overlay does it: BEFORE_SAVE validators (+ derived) -> model beforeSave (+ derived) -> the HOST writes the row -> model AFTER_SAVE (ops appended).
  function uiSave(table, fields, id) {
    var old = id != null ? one('SELECT * FROM ' + table + ' WHERE ' + table + '_id=?', [id]) : null;
    var rec = Object.assign({}, old || {}, fields), info = { table: table, record: rec, recordOld: old };
    var v = MV.fireHooks('BEFORE_SAVE', info, {});
    if (!v.ok) return { ok: false, error: v.error };
    if (info.derived) Object.keys(info.derived).forEach(function (k) { rec[k] = info.derived[k]; });
    var b = ML.run(q, env(), { table: table, timing: 'BEFORE_SAVE', record: rec, old: old, isNew: !old });
    if (!b.ok) return { ok: false, error: b.error || b.msg };
    Object.keys(b.derived || {}).forEach(function (k) { rec[k] = b.derived[k]; });
    var base = { ad_client_id: 11, ad_org_id: 11, isactive: 'Y' };
    if (!old) { rec = Object.assign({}, base, rec); id = insertRow(table, rec); }
    else { var cs = colsOf(table), ks = Object.keys(rec).filter(function (k) { return cs.indexOf(k) >= 0 && k !== table + '_id'; }); db.run('UPDATE ' + table + ' SET ' + ks.map(function (k) { return '"' + k + '"=?'; }).join(',') + ' WHERE ' + table + '_id=?', ks.map(function (k) { return rec[k] === undefined ? null : rec[k]; }).concat([id])); }
    var row = one('SELECT * FROM ' + table + ' WHERE ' + table + '_id=?', [id]);
    var a = run({ table: table, timing: 'AFTER_SAVE', record: row, isNew: !old, old: old });
    if (!a.ok) { return { ok: false, error: a.error || a.msg, id: id }; }
    return { ok: true, id: id };
  }
  function docact(table, id, action) { var r = run({ table: table, timing: 'DOCACTION', id: id, action: action }); var d = one('SELECT docstatus FROM ' + table + ' WHERE ' + table + '_id=?', [id]); return { ok: r.ok, msg: r.msg, status: d && d.docstatus }; }
  function drive(id, fn) { try { var r = fn(); if (r && r.err) { log('§RW-NOTE ' + id + ' could not be driven: ' + r.err); return null; } return r; } catch (e) { log('§RW-NOTE ' + id + ' threw: ' + String(e && e.stack || e).slice(0, 300)); return null; } }

  // ── FIXTURE (direct rows, as the SD-16 harness' completed sale): order -> shipment CO -> invoice CO of QTY x PRICE at a 10% tax (legacy numbers: 3 x 50.00, 10%) ──
  var WHORG = (one('SELECT ad_org_id AS o FROM m_warehouse WHERE m_warehouse_id=103') || {}).o, PROD = 128, BP = 112, BPL = 108, WH = 103, LOC = (one('SELECT m_locator_id AS l FROM m_locator WHERE m_warehouse_id=103 ORDER BY isdefault DESC, m_locator_id LIMIT 1') || {}).l;
  var TAX10 = insertRow('c_tax', { c_tax_id: 9100001, ad_client_id: 11, ad_org_id: 0, name: 'RW 10%', rate: 10, isdocumentlevel: 'Y', issummary: 'N', c_taxcategory_id: (one('SELECT c_taxcategory_id AS c FROM c_tax WHERE c_tax_id=104') || {}).c, validfrom: '2000-01-01', isactive: 'Y', istaxexempt: 'N', sopotype: 'B', requirestaxcertificate: 'N', isdefault: 'N' });
  q("SELECT * FROM c_tax_acct WHERE c_tax_id=104").forEach(function (a) { var b = Object.assign({}, a, { c_tax_id: TAX10 }); delete b.c_tax_acct_uu; insertRow('c_tax_acct', b); });
  var DT = function (n) { var r = one('SELECT c_doctype_id AS id FROM c_doctype WHERE ad_client_id=11 AND name=?', [n]); return r && r.id; };
  var DT_RMA = DT('Customer Return Material'), DT_MMR = DT('MM Customer Return'), DT_ARC = DT('AR Credit Memo'), DT_MMS = DT('MM Shipment'), DT_ARI = DT('AR Invoice');
  var DT_VRMA = DT('Vendor Return Material'), DT_VMS = DT('MM Vendor Return'), DT_MMRV = DT('MM Receipt'), DT_API = DT('AP Invoice'), DT_APC = DT('AP CreditMemo');
  db.run("UPDATE c_doctype SET isshipconfirm='N' WHERE c_doctype_id=?", [DT_MMR]);   // FIXTURE: MSetup's 'MM Customer Return' has no confirmation (GardenWorld's has: createConfirmation is a named gap, model_order.js:371)
  log('§RW-SEED doctypes RMA=' + DT_RMA + ' MMR=' + DT_MMR + ' ARC=' + DT_ARC + ' MMS=' + DT_MMS + ' ARI=' + DT_ARI + ' locator=' + LOC + ' tax10=' + TAX10);
  // current Average PO cost 70.00 (the shipment shipped at an older cost): R-MMR4 -- a customer return books at the CURRENT cost, so 2 x 70.00 = 140.00
  var mc = one('SELECT * FROM m_cost WHERE m_product_id=? AND m_costelement_id=103 AND c_acctschema_id=101', [PROD]);
  if (mc) db.run('UPDATE m_cost SET currentcostprice=70, currentqty=0 WHERE m_product_id=? AND m_costelement_id=103 AND c_acctschema_id=101', [PROD]);
  else { var base = one('SELECT * FROM m_cost WHERE m_product_id=? AND c_acctschema_id=101 LIMIT 1', [PROD]); insertRow('m_cost', Object.assign({}, base, { m_costelement_id: 103, currentcostprice: 70, currentqty: 0, m_cost_uu: null })); }
  var cnt = 0;
  function sale(qty, price, vendor, cur) {
    cnt++; var SO = vendor ? 'N' : 'Y';
    var o = insertRow('c_order', { ad_client_id: 11, ad_org_id: 11, issotrx: SO, documentno: 'RWO' + cnt, docstatus: 'CO', docaction: 'CL', processed: 'Y', c_doctype_id: vendor ? 0 : 132, c_doctypetarget_id: vendor ? 126 : 132, c_bpartner_id: BP, c_bpartner_location_id: BPL, bill_bpartner_id: BP, bill_location_id: BPL,
      m_warehouse_id: WH, m_pricelist_id: 101, c_currency_id: cur || 100, c_paymentterm_id: 105, dateordered: DAY, dateacct: DAY, grandtotal: qty * price * 1.1, totallines: qty * price, isapproved: 'Y' });
    var ol = insertRow('c_orderline', { ad_client_id: 11, ad_org_id: 11, c_order_id: o, line: 10, m_product_id: PROD, c_uom_id: 100, qtyordered: qty, qtyentered: qty, qtydelivered: qty, qtyinvoiced: qty, priceactual: price, priceentered: price, c_tax_id: TAX10, linenetamt: qty * price, c_currency_id: cur || 100, m_warehouse_id: WH });
    var io = insertRow('m_inout', { ad_client_id: 11, ad_org_id: 11, issotrx: SO, documentno: 'RWS' + cnt, docstatus: 'CO', docaction: 'CL', processed: 'Y', c_doctype_id: vendor ? DT_MMRV : DT_MMS, movementtype: vendor ? 'V+' : 'C-', c_bpartner_id: BP, c_bpartner_location_id: BPL, m_warehouse_id: WH, c_order_id: o, movementdate: DAY, dateacct: DAY, posted: 'N', isapproved: 'Y', deliveryrule: 'A', deliveryviarule: 'P', priorityrule: '5', freightcostrule: 'I' });
    var il = insertRow('m_inoutline', { ad_client_id: 11, ad_org_id: 11, m_inout_id: io, line: 10, m_product_id: PROD, c_orderline_id: ol, c_uom_id: 100, m_locator_id: LOC, movementqty: qty, qtyentered: qty, processed: 'Y', isinvoiced: 'Y', m_attributesetinstance_id: 0 });
    var iv = insertRow('c_invoice', { ad_client_id: 11, ad_org_id: 11, issotrx: SO, documentno: 'RWI' + cnt, docstatus: 'CO', docaction: 'CL', processed: 'Y', c_doctype_id: vendor ? DT_API : DT_ARI, c_doctypetarget_id: vendor ? DT_API : DT_ARI, c_bpartner_id: BP, c_bpartner_location_id: BPL, c_order_id: o, c_currency_id: cur || 100, m_pricelist_id: 101, c_paymentterm_id: 105,
      dateinvoiced: DAY, dateacct: DAY, grandtotal: qty * price * 1.1, totallines: qty * price, ispaid: 'N', isapproved: 'Y', posted: 'N', paymentrule: 'P', istaxincluded: 'N' });
    var ivl = insertRow('c_invoiceline', { ad_client_id: 11, ad_org_id: 11, c_invoice_id: iv, line: 10, m_product_id: PROD, c_orderline_id: ol, m_inoutline_id: il, c_uom_id: 100, qtyentered: qty, qtyinvoiced: qty, priceentered: price, priceactual: price, linenetamt: qty * price, c_tax_id: TAX10 });
    return { order: o, shipment: io, shipline: il, invoice: iv, invline: ivl };
  }
  function rmaHeader(s, dtype, vendor) { return uiSave('m_rma', { c_doctype_id: dtype || DT_RMA, issotrx: vendor ? 'N' : 'Y', inout_id: s.shipment, m_rmatype_id: 100, name: 'RW RMA', docstatus: 'DR', docaction: 'CO', processed: 'N' }); }
  function rmaLine(h, s, qty) { return uiSave('m_rmaline', { m_rma_id: h, m_inoutline_id: s.shipline, qty: qty, processed: 'N' }); }
  var rl = function (id) { return one('SELECT * FROM m_rmaline WHERE m_rmaline_id=?', [id]); };
  var rm = function (id) { return one('SELECT * FROM m_rma WHERE m_rma_id=?', [id]); };
  var n = function (v) { return Number(v); };

  // ── RW-LINE: MRMALine.beforeSave (MRMALine.java:305-398) through the window save path ──
  var s1 = sale(3, 50);
  var h1 = drive('RW-LINE', function () { var r = rmaHeader(s1); return r.ok ? r : { err: 'RMA header refused: ' + r.error }; });
  var lOK = h1 && uiSave('m_rmaline', { m_rma_id: h1.id, m_inoutline_id: s1.shipline, qty: 2, processed: 'N' });
  var L1 = lOK && lOK.ok ? rl(lOK.id) : null;
  verdict('RW-LINE', L1 ? [eq('line_saved', 'qty 2 of 3 shipped is accepted', lOK.ok, true),
    eq('amt', 'Amt = the invoice line PriceActual 50 (MRMALine.init :130-141)', n(L1.amt), 50), eq('linenetamt', 'LineNetAmt = Amt x Qty = 100.00 (getTotalAmt)', n(L1.linenetamt), 100),
    eq('product_tax', 'product from the shipment line, tax from the invoice line (:376-381)', [n(L1.m_product_id), n(L1.c_tax_id)], [PROD, TAX10]), eq('lineno', 'Line = MAX(Line)+10 (:383-388)', n(L1.line), 10),
    eq('qtydelivered', 'QtyDelivered defaults 0 (setInitialDefaults)', n(L1.qtydelivered), 0)] : []);
  var over = h1 && uiSave('m_rmaline', { m_rma_id: h1.id, m_inoutline_id: s1.shipline, qty: 4, processed: 'N' });
  verdict('RW-REFUSE-QTY', over ? [eq('refused', 'qty 4 > shipped 3 is refused at save (MRMALine.beforeSave checkQty)', over.ok, false), eq('reason', 'legacy reason AmtReturned>Shipped', /AmtReturned>Shipped/.test(String(over.error)), true)] : []);
  var dup = h1 && uiSave('m_rmaline', { m_rma_id: h1.id, m_inoutline_id: s1.shipline, qty: 1, processed: 'N' });
  verdict('RW-REFUSE-DUP', dup ? [eq('refused', 'a second line of the SAME RMA on the same shipment line is refused', dup.ok, false), eq('reason', 'InOutLineAlreadyEntered (:338-348)', /InOutLineAlreadyEntered/.test(String(dup.error)), true)] : []);
  var edge = drive('RW-NEG-QTY', function () { var s = sale(3, 50), h = rmaHeader(s); return h.ok ? { s: s, h: h } : { err: 'hdr' }; });
  var edgeL = edge && uiSave('m_rmaline', { m_rma_id: edge.h.id, m_inoutline_id: edge.s.shipline, qty: 3, processed: 'N' });
  verdict('RW-NEG-QTY', edgeL ? [eq('accepted', 'NEG-CONTROL qty 3 == shipped 3 is accepted (so the qty-4 refusal above is the rule, not a disabled save)', edgeL.ok, true)] : []);

  // ── RW-CO: MRMA.prepareIt/completeIt (MRMA.java:347-481) ──
  var cc0 = { fa: n(one('SELECT COUNT(*) AS c FROM fact_acct').c), tr: n(one('SELECT COUNT(*) AS c FROM m_transaction').c) };
  var co1 = h1 && L1 ? docact('m_rma', h1.id, 'CO') : null;
  var H1 = co1 ? rm(h1.id) : null, tx1 = []; try { tx1 = H1 ? q('SELECT taxbaseamt, taxamt FROM m_rmatax WHERE m_rma_id=?', [h1.id]) : []; } catch (e) { log('§RW-NOTE m_rmatax table absent from the bundle'); }
  verdict('RW-CO', co1 ? [eq('completed', 'RMA CO -> CO', [co1.ok, co1.status], [true, 'CO']), eq('amt', 'M_RMA.Amt = 2 x 50.00 + 10% = 110.00 (legacy SD16a amt=110.00)', n(H1.amt), 110),
    eq('tax_rows', 'one M_RMATax 100.00 base / 10.00 tax (legacy SD16a)', tx1.map(function (t) { return n(t.taxbaseamt) + '/' + n(t.taxamt); }), ['100/10']),
    eq('processed', 'Processed Y on header and lines (setProcessed propagates)', [H1.processed, rl(L1.m_rmaline_id).processed], ['Y', 'Y']),
    eq('no_books_no_stock', 'completeIt books NOTHING and moves NO stock (R-RMA3)', [n(one('SELECT COUNT(*) AS c FROM fact_acct').c) - cc0.fa, n(one('SELECT COUNT(*) AS c FROM m_transaction').c) - cc0.tr], [0, 0])] : []);
  var nol = drive('RW-NOLINES', function () { var s = sale(3, 50), h = rmaHeader(s); return h.ok ? h : { err: 'hdr' }; });
  var nolCo = nol && docact('m_rma', nol.id, 'CO');
  verdict('RW-NOLINES', nolCo ? [eq('refused', 'RMA with no lines does not complete', nolCo.status !== 'CO', true), eq('reason', '@NoLines@', /NoLines|No Lines/i.test(String(nolCo.msg)), true)] : []);
  // cumulative: a second RMA for 2 more on the SAME shipment line while the first is CO (3 shipped, 2 returned)
  var h2 = h1 && co1 && co1.status === 'CO' ? rmaHeader(s1) : null;
  var cum = h2 && h2.ok ? uiSave('m_rmaline', { m_rma_id: h2.id, m_inoutline_id: s1.shipline, qty: 2, processed: 'N' }) : null;
  var cum1 = h2 && h2.ok ? uiSave('m_rmaline', { m_rma_id: h2.id, m_inoutline_id: s1.shipline, qty: 1, processed: 'N' }) : null;
  verdict('RW-CUMULATIVE', cum ? [eq('refused', 'second RMA of 2 on a shipment line of 3 with 2 already on a COMPLETED RMA is refused (SD16r2)', cum.ok, false), eq('reason', 'AmtReturned>Shipped', /AmtReturned>Shipped/.test(String(cum.error)), true),
    eq('neg_control', 'NEG-CONTROL 1 more (2 + 1 = 3) is accepted', cum1 && cum1.ok, true)] : []);

  // ── RW-RECEIPT: customer return receipt (MInOut.beforeSave :1333-1338, completeIt :1984-2002) ──
  var onhand = function () { return n((one('SELECT COALESCE(SUM(qtyonhand),0) AS q FROM m_storageonhand WHERE m_product_id=?', [PROD]) || {}).q); };
  function receipt(rmaId, rmaLineId, qty, doctype) {
    var h = uiSave('m_inout', { ad_org_id: WHORG, c_doctype_id: doctype || DT_MMR, issotrx: 'Y', m_rma_id: rmaId, c_bpartner_id: BP, c_bpartner_location_id: BPL, m_warehouse_id: WH, movementdate: DAY, dateacct: DAY, docstatus: 'DR', docaction: 'CO', processed: 'N', isapproved: 'N', posted: 'N', deliveryrule: 'A', deliveryviarule: 'P', priorityrule: '5', freightcostrule: 'I' });
    if (!h.ok) return { err: 'receipt header refused: ' + h.error };
    var l = uiSave('m_inoutline', { m_inout_id: h.id, m_rmaline_id: rmaLineId, m_product_id: PROD, c_uom_id: 100, m_locator_id: LOC, movementqty: qty, qtyentered: qty, line: 10, processed: 'N', m_attributesetinstance_id: 0 });
    if (!l.ok) return { err: 'receipt line refused: ' + l.error };
    return { id: h.id, line: l.id };
  }
  var stock0 = onhand(), rc1 = h1 && co1 && co1.status === 'CO' ? drive('RW-RECEIPT', function () { return receipt(h1.id, L1.m_rmaline_id, 2); }) : null;
  var rcCo = rc1 ? docact('m_inout', rc1.id, 'CO') : null, RC = rc1 ? one('SELECT * FROM m_inout WHERE m_inout_id=?', [rc1.id]) : null;
  if (rcCo) log('§RW-NOTE receipt CO msg=' + rcCo.msg);
  verdict('RW-RECEIPT', rcCo ? [eq('doctype', 'doc type forced to the RMA type C_DocTypeShipment_ID (MM Customer Return)', n(RC.c_doctype_id), DT_MMR), eq('movementtype', 'MovementType C+ (Customer Returns)', RC.movementtype, 'C+'),
    eq('completed', 'return receipt CO', [rcCo.ok, rcCo.status], [true, 'CO']), eq('stock', 'stock +2 (C+ keeps the sign, MInOut.completeIt)', onhand() - stock0, 2),
    eq('qtydelivered', 'RMA line QtyDelivered 2 (legacy SD16b rma_delivered 2)', n(rl(L1.m_rmaline_id).qtydelivered), 2)] : []);
  // over-receipt: legacy ACCEPTS a receipt of 3 against an RMA line of 2 (SD16r3), QtyDelivered 2 + ... here 3 on a fresh RMA of 2
  var s3 = sale(3, 50), h3 = drive('RW-OVERRECEIPT', function () { var h = rmaHeader(s3); if (!h.ok) return { err: 'hdr' }; var l = rmaLine(h.id, s3, 2); return l.ok ? { h: h.id, l: l.id } : { err: 'line' }; });
  var co3 = h3 && docact('m_rma', h3.h, 'CO'), r3 = co3 && co3.status === 'CO' ? drive('RW-OVERRECEIPT', function () { return receipt(h3.h, h3.l, 3); }) : null, r3co = r3 && docact('m_inout', r3.id, 'CO');
  verdict('RW-OVERRECEIPT', r3co ? [eq('accepted', 'return receipt of 3 against an RMA line of 2 completes (no source rule, legacy SD16r3 ACCEPTS)', [r3co.ok, r3co.status], [true, 'CO']), eq('qtydelivered', 'QtyDelivered 3', n(rl(h3.l).qtydelivered), 3)] : []);

  // ── RW-CM: AR credit memo from the RMA line (MInvoice.setRMA :2993-3020, MInvoiceLine.setRMALine, completeIt :2171-2185) ──
  function creditMemo(h, s, rmaLineId, recvLine, qty, price) {
    var hd = uiSave('c_invoice', { c_doctypetarget_id: DT_ARC, c_doctype_id: 0, issotrx: 'Y', m_rma_id: h, c_bpartner_id: BP, c_bpartner_location_id: BPL, c_currency_id: 100, m_pricelist_id: 101, c_paymentterm_id: 105, dateinvoiced: DAY, dateacct: DAY, docstatus: 'DR', docaction: 'CO', processed: 'N', posted: 'N', paymentrule: 'P', istaxincluded: 'N', totallines: 0, grandtotal: 0, ispaid: 'N', isapproved: 'N' });
    if (!hd.ok) return { err: 'credit memo header refused: ' + hd.error };
    var ln = uiSave('c_invoiceline', { c_invoice_id: hd.id, line: 10, m_product_id: PROD, m_inoutline_id: recvLine, m_rmaline_id: rmaLineId, c_uom_id: 100, qtyentered: qty, qtyinvoiced: qty, priceentered: price, priceactual: price, linenetamt: qty * price, c_tax_id: TAX10 });
    if (!ln.ok) return { err: 'credit memo line refused: ' + ln.error };
    return { id: hd.id, line: ln.id };
  }
  var cm1 = rcCo && rcCo.status === 'CO' ? drive('RW-CM', function () { return creditMemo(h1.id, s1, L1.m_rmaline_id, rc1.line, 2, 50); }) : null;
  var cmCo = cm1 ? docact('c_invoice', cm1.id, 'CO') : null, CM = cm1 ? one('SELECT * FROM c_invoice WHERE c_invoice_id=?', [cm1.id]) : null;
  verdict('RW-CM', cmCo ? [eq('completed', 'credit memo CO', [cmCo.ok, cmCo.status], [true, 'CO']), eq('grand_total', 'GrandTotal 110.00 (legacy SD16c)', n(CM.grandtotal), 110), eq('qtyinvoiced', 'RMA line QtyInvoiced 2 (legacy SD16c rma_invoiced 2)', n(rl(L1.m_rmaline_id).qtyinvoiced), 2)] : []);

  // ── RW-BOOKS: the posting preview path (doc_poster) derives the legacy books from what the model path left ──
  var Rstub = { resolve: function (d, token) { var id = { '{Product.Asset}': 11, '{Product.Cogs}': 12, '{Product.Revenue}': 13, '{Tax.Due}': 14, '{BPartner.Receivable}': 15 }[token]; return { acct: id, element: { id: id, value: token, name: token } }; } };
  var b3p = { prepare: function (sql) { return { get: function (p) { return q(sql, p == null ? [] : Array.isArray(p) ? p : [p])[0]; }, all: function (p) { return q(sql, p == null ? [] : Array.isArray(p) ? p : [p]); }, run: function () {} }; }, exec: function () {} };
  function books(table, id) { try { var r = DP.derivePostings(b3p, { table: table, id: id }, 101, Rstub); return r && r.lines ? r.lines : []; } catch (e) { return [{ err: String(e.message).slice(0, 120) }]; } }
  var sideSum = function (ls, acct, side) { return ls.filter(function (l) { return Number(l.account_id) === acct; }).reduce(function (a, l) { return a + Number(l[side === 'dr' ? 'amtacctdr' : 'amtacctcr'] || 0); }, 0); };
  var bk = rcCo ? books('M_InOut', rc1.id) : null, bc = cmCo ? books('C_Invoice', cm1.id) : null;
  verdict('RW-BOOKS-RECEIPT', bk && bk.length && !bk[0].err ? [eq('dr_asset_cr_cogs', 'Dr {Product.Asset} / Cr {Product.Cogs} = 2 x CURRENT cost 70.00 = 140.00, not the shipment cost (Doc_InOut "Sales - Return" :451-640, R-MMR4)', [sideSum(bk, 11, 'dr'), sideSum(bk, 12, 'cr')], [140, 140])] : (bk ? (log('§RW-NOTE books receipt: ' + JSON.stringify(bk).slice(0, 200)), []) : []));
  verdict('RW-BOOKS-CM', bc && bc.length && !bc[0].err ? [eq('revenue', 'Dr revenue 100.00', sideSum(bc, 13, 'dr'), 100), eq('tax', 'Dr tax due 10.00', sideSum(bc, 14, 'dr'), 10), eq('receivable', 'Cr receivable 110.00 (mirror of ARI)', sideSum(bc, 15, 'cr'), 110)] : (bc ? (log('§RW-NOTE books cm: ' + JSON.stringify(bc).slice(0, 200)), []) : []));

  // ── RW-VENDOR: the SAME generic path for Vendor RMA (IsSOTrx N): line save + CO, no table branch ──
  var sv = sale(3, 50, true), hv = drive('RW-VENDOR', function () { var h = rmaHeader(sv, DT_VRMA, true); return h.ok ? h : { err: 'vendor RMA header refused: ' + h.error }; });
  var lv = hv && uiSave('m_rmaline', { m_rma_id: hv.id, m_inoutline_id: sv.shipline, qty: 4, processed: 'N' }), lv2 = hv && uiSave('m_rmaline', { m_rma_id: hv.id, m_inoutline_id: sv.shipline, qty: 2, processed: 'N' });
  var cov = lv2 && lv2.ok ? docact('m_rma', hv.id, 'CO') : null;
  verdict('RW-VENDOR', cov ? [eq('over_refused', 'vendor RMA line 4 > received 3 refused (AmtReturned>Shipped)', [lv.ok, /AmtReturned>Shipped/.test(String(lv.error))], [false, true]), eq('completed', 'vendor RMA CO', [cov.ok, cov.status], [true, 'CO']),
    eq('amt', 'Amt = 2 x 50 + 10% = 110.00 (the order price list is tax-excluded)', n(rm(hv.id).amt), 110)] : []);


  // ── RW-AMT-EDIT: MRMALine.beforeSave :365-377 re-sets Amt = getUnitAmt() on EVERY save of a shipment-line row (legacy overwrites a user-entered Amt); completions keep it ──
  var s4 = sale(2, 50), h4 = drive('RW-AMT-EDIT', function () { var h = rmaHeader(s4); if (!h.ok) return { err: 'hdr' }; var l = rmaLine(h.id, s4, 2); return l.ok ? { h: h.id, l: l.id } : { err: 'line ' + l.error }; });
  var ed = h4 && uiSave('m_rmaline', { amt: 40 }, h4.l);
  var afterEdit = h4 ? n(rl(h4.l).amt) : null;
  var co4 = h4 && docact('m_rma', h4.h, 'CO'), rc4 = co4 && co4.status === 'CO' ? drive('RW-AMT-EDIT', function () { return receipt(h4.h, h4.l, 2); }) : null, rc4co = rc4 && docact('m_inout', rc4.id, 'CO');
  var cm4 = rc4co && rc4co.status === 'CO' ? drive('RW-AMT-EDIT', function () { return creditMemo(h4.h, s4, h4.l, rc4.line, 2, 50); }) : null, cm4co = cm4 && docact('c_invoice', cm4.id, 'CO');
  verdict('RW-AMT-EDIT', cm4co && cm4co.status === 'CO' ? [eq('edit_saved', 'the edit of Amt to 40 saves', ed.ok, true), eq('legacy_reprice', 'Amt is re-derived from the invoice line on save (legacy :365-377): 50, not 40', afterEdit, 50),
    eq('survives', 'Amt/LineNetAmt unchanged by the return receipt and credit memo completions (their rmaLine.save re-runs beforeSave, same answer)', [n(rl(h4.l).amt), n(rl(h4.l).linenetamt), n(rm(h4.h).amt)], [50, 100, 110]),
    eq('qty_flow', 'QtyDelivered 2 / QtyInvoiced 2 after both completions', [n(rl(h4.l).qtydelivered), n(rl(h4.l).qtyinvoiced)], [2, 2])] : []);

  // ── RW-MULTITAX: two tax rates on one RMA, re-prepare deletes the old M_RMATax rows exactly (StandardTaxProvider.calculateRMATaxTotal :293-364, MRMA.calculateTaxTotal :395) ──
  var TAX5 = insertRow('c_tax', { c_tax_id: 9100002, ad_client_id: 11, ad_org_id: 0, name: 'RW 5%', rate: 5, isdocumentlevel: 'Y', issummary: 'N', c_taxcategory_id: (one('SELECT c_taxcategory_id AS c FROM c_tax WHERE c_tax_id=104') || {}).c, validfrom: '2000-01-01', isactive: 'Y', istaxexempt: 'N', sopotype: 'B', requirestaxcertificate: 'N', isdefault: 'N' });
  var s5 = sale(2, 50), il2 = insertRow('m_inoutline', { ad_client_id: 11, ad_org_id: 11, m_inout_id: s5.shipment, line: 20, m_product_id: PROD, c_uom_id: 100, m_locator_id: LOC, movementqty: 2, qtyentered: 2, processed: 'Y', isinvoiced: 'Y', m_attributesetinstance_id: 0 });
  insertRow('c_invoiceline', { ad_client_id: 11, ad_org_id: 11, c_invoice_id: s5.invoice, line: 20, m_product_id: PROD, m_inoutline_id: il2, c_uom_id: 100, qtyentered: 2, qtyinvoiced: 2, priceentered: 30, priceactual: 30, linenetamt: 60, c_tax_id: TAX5 });
  var h5 = drive('RW-MULTITAX', function () { var h = rmaHeader(s5); if (!h.ok) return { err: 'hdr' }; var a = rmaLine(h.id, s5, 2), b = uiSave('m_rmaline', { m_rma_id: h.id, m_inoutline_id: il2, qty: 2, processed: 'N' }); return a.ok && b.ok ? { h: h.id } : { err: 'lines ' + a.error + b.error }; });
  var pr1 = h5 && docact('m_rma', h5.h, 'PR'), pr2 = h5 && docact('m_rma', h5.h, 'PR');
  var taxRows = function () { return q('SELECT c_tax_id, taxbaseamt, taxamt FROM m_rmatax WHERE m_rma_id=? ORDER BY c_tax_id', [h5.h]).map(function (t) { return t.c_tax_id + ':' + n(t.taxbaseamt) + '/' + n(t.taxamt); }); };
  var rowsAfterPR2 = h5 ? taxRows() : null, co5 = h5 && docact('m_rma', h5.h, 'CO');
  verdict('RW-MULTITAX', co5 ? [eq('prepared_twice', 'PR twice -> IP (re-prepare)', [pr1.status, pr2.status], ['IP', 'IP']), eq('rows_after_reprepare', 'exactly two M_RMATax rows after two prepares (old rows deleted exactly, no key collision)', rowsAfterPR2, [TAX10 + ':100/10', TAX5 + ':60/3']),
    eq('completed', 'CO', [co5.ok, co5.status], [true, 'CO']), eq('rows_after_co', 'still two rows after CO', taxRows(), [TAX10 + ':100/10', TAX5 + ':60/3']), eq('amt', 'Amt = 100 + 60 + 10 + 3 = 173.00', n(rm(h5.h).amt), 173)] : []);

  // ── RW-DECIMALS: exact decimal arithmetic (no float money), checkQty exact (0.1 + 0.2 == 0.3), 0- and 3-decimal currencies ──
  var s6 = sale(1, 1.005), h6 = drive('RW-DEC-HALFUP', function () { var h = rmaHeader(s6); if (!h.ok) return { err: 'hdr' }; var l = rmaLine(h.id, s6, 1); return l.ok ? { h: h.id, l: l.id } : { err: 'line ' + l.error }; });
  var co6 = h6 && docact('m_rma', h6.h, 'CO');
  verdict('RW-DEC-HALFUP', co6 ? [eq('linenet', '1 x 1.005 -> 1.01 HALF_UP (a float Math.round(1.005*100) gives 1.00)', n(rl(h6.l).linenetamt), 1.01), eq('amt', 'Amt = 1.01 + 10% of 1.01 (0.10) = 1.11', n(rm(h6.h).amt), 1.11)] : []);
  var s7 = sale(0.3, 50), h7a = drive('RW-DEC-CUM', function () { var h = rmaHeader(s7); if (!h.ok) return { err: 'hdr' }; var l = rmaLine(h.id, s7, 0.1); return l.ok ? { h: h.id } : { err: 'line ' + l.error }; });
  var co7 = h7a && docact('m_rma', h7a.h, 'CO'), h7b = co7 && co7.status === 'CO' ? rmaHeader(s7) : null, l7b = h7b && h7b.ok ? rmaLine(h7b.id, s7, 0.2) : null, l7c = h7b && h7b.ok ? uiSave('m_rmaline', { m_rma_id: h7b.id, m_inoutline_id: s7.shipline, qty: 0.3, processed: 'N' }) : null;
  verdict('RW-DEC-CUM', l7b ? [eq('accepted', '0.1 returned + 0.2 more of 0.3 shipped is accepted (float 0.1+0.2 > 0.3 would refuse)', l7b.ok, true), eq('neg', 'NEG-CONTROL 0.3 more (0.1 + 0.3 > 0.3) is refused', [l7c.ok, /AmtReturned>Shipped/.test(String(l7c.error))], [false, true])] : []);
  var curFix = function (id, p) { db.run('UPDATE c_currency SET stdprecision=? WHERE c_currency_id=?', [p, id]); };
  [[300, 0, 100, 'RW-DEC-PREC0'], [321, 3, 100, 'RW-DEC-PREC3']].forEach(function (c) {
    var sx = sale(3, 33.3333, false, c[0]), hx = drive(c[3], function () { var h = rmaHeader(sx); if (!h.ok) return { err: 'hdr' }; var l = rmaLine(h.id, sx, 3); return l.ok ? { h: h.id, l: l.id } : { err: 'line ' + l.error }; });
    var cx = hx && docact('m_rma', hx.h, 'CO'), px = hx ? n(one('SELECT stdprecision AS p FROM c_currency WHERE c_currency_id=?', [c[0]]).p) : null;
    verdict(c[3], cx ? [eq('precision', 'currency StdPrecision ' + c[1], px, c[1]), eq('linenet', '3 x 33.3333 = 99.9999 rounds HALF_UP to ' + c[1] + ' decimals = 100', n(rl(hx.l).linenetamt), 100), eq('amt', '10% tax on 100 -> Amt 110', n(rm(hx.h).amt), 110)] : []);
  });

  // ── RW-REVERSE: reversal receipt / reversal credit memo carry the NEGATIVE qty into QtyDelivered / QtyInvoiced (MInOut.completeIt Qty = MovementQty, reversal line negated; MInvoice reverse completeIt adds the negated QtyInvoiced) ──
  var stockBeforeRv = onhand(), rvRc = rcCo && rcCo.status === 'CO' ? docact('m_inout', rc1.id, 'RC') : null;
  verdict('RW-REVERSE-RECEIPT', rvRc ? [eq('reversed', 'receipt reverse-corrected', [rvRc.ok, rvRc.status], [true, 'RE']), eq('qtydelivered', 'QtyDelivered 2 + (-2) = 0 (reversal line is -2)', n(rl(L1.m_rmaline_id).qtydelivered), 0), eq('stock', 'stock -2 (the reversal receipt moves the returned 2 back out)', onhand() - stockBeforeRv, -2)] : []);
  var rvCm = cmCo && cmCo.status === 'CO' ? docact('c_invoice', cm1.id, 'RC') : null;
  verdict('RW-REVERSE-CM', rvCm ? [eq('reversed', 'credit memo reverse-corrected', [rvCm.ok, rvCm.status], [true, 'RE']), eq('qtyinvoiced', 'QtyInvoiced 2 + (-2) = 0', n(rl(L1.m_rmaline_id).qtyinvoiced), 0)] : []);

  // ── RW-VOID / RW-CLOSE / RW-NOIMPL: MRMA.voidIt :681-754, closeIt :494-507, reverseCorrectIt/reverseAccrualIt/reActivateIt "not implemented, return false" ──
  var vOpen = r3co && r3co.status === 'CO' ? docact('m_rma', h3.h, 'VO') : null;   // h3 has a completed (not reversed) return receipt
  verdict('RW-VOID-REFUSED', vOpen ? [eq('refused', 'void refused while a return receipt of the RMA is not VO/RE (RMACannotBeVoided)', [vOpen.ok, vOpen.status], [false, 'CO']), eq('reason', 'message names the refusal', /RMACannotBeVoided|cannot be voided/i.test(String(vOpen.msg)), true)] : []);
  var s8 = sale(3, 50), h8 = drive('RW-VOID', function () { var h = rmaHeader(s8); if (!h.ok) return { err: 'hdr' }; var l = rmaLine(h.id, s8, 2); return l.ok ? { h: h.id, l: l.id } : { err: 'line ' + l.error }; });
  var co8 = h8 && docact('m_rma', h8.h, 'CO'), vo8 = co8 && co8.status === 'CO' ? docact('m_rma', h8.h, 'VO') : null;
  verdict('RW-VOID', vo8 ? [eq('voided', 'RMA with no receipt voids -> VO', [vo8.ok, vo8.status], [true, 'VO']), eq('line_zero', 'line Qty 0, Amt 0, LineNetAmt 0', [n(rl(h8.l).qty), n(rl(h8.l).amt), n(rl(h8.l).linenetamt)], [0, 0, 0]),
    eq('header_zero', 'header Amt 0; M_RMATax amounts 0', [n(rm(h8.h).amt), q('SELECT taxbaseamt+taxamt AS t FROM m_rmatax WHERE m_rma_id=?', [h8.h]).map(function (t) { return n(t.t); })], [0, [0]]),
    eq('description', 'line + header descriptions carry "Voided"', [/Voided \(2\)/.test(rl(h8.l).description), /Voided/.test(rm(h8.h).description)], [true, true]), eq('processed', 'Processed Y, DocAction --', [rm(h8.h).processed, rm(h8.h).docaction], ['Y', '--'])] : []);
  var s9 = sale(3, 50), h9 = drive('RW-CLOSE', function () { var h = rmaHeader(s9); if (!h.ok) return { err: 'hdr' }; var l = rmaLine(h.id, s9, 2); return l.ok ? { h: h.id } : { err: 'line ' + l.error }; });
  var co9 = h9 && docact('m_rma', h9.h, 'CO'), cl9 = co9 && co9.status === 'CO' ? docact('m_rma', h9.h, 'CL') : null;
  var rc9 = cl9 && docact('m_rma', h9.h, 'RC'), ra9 = cl9 && docact('m_rma', h9.h, 'RA'), re9 = cl9 && docact('m_rma', h9.h, 'RE');
  verdict('RW-CLOSE', cl9 ? [eq('closed', 'RMA close -> CL', [cl9.ok, cl9.status], [true, 'CL']), eq('amt_kept', 'close keeps the lines and Amt (closeIt only fires the validators)', n(rm(h9.h).amt), 110),
    eq('not_implemented', 'reverseCorrect / reverseAccrual / reActivate return false like MRMA (not implemented)', [rc9.ok, ra9.ok, re9.ok], [false, false, false]), eq('status_kept', 'and leave the status CL', rm(h9.h).docstatus, 'CL')] : []);

  // ── RW-DENOM: the dictionary's RMA-related windows through the generic grid-tab layer (ad_parser + ad_gridtab), WITHOUT Save: rows and parent id per tab (AD-LAYER LAW witness-what-the-user-sees) ──
  global.window = global.window || {};
  var ADParser = require(path.join(ERP, 'ad_parser.js')), GT = require(path.join(ERP, 'ad_gridtab.js'));
  var _l = console.log; console.log = function () {};
  var WINS = [320, 331, 53097, 53098, 53099], tabRows = [];
  WINS.forEach(function (wid) {
    ADParser.init(db); var tabs = ADParser.getTabs(db, wid);
    tabs.forEach(function (tab, i) {
      var tm = GT.open(db, tabs, i), row = { window: wid, tab: tab.id, name: tab.name, table: tab.tableName, level: tm.tabLevel, verdict: 'INCONCLUSIVE', reason: '' };
      var has = one("SELECT 1 AS x FROM sqlite_master WHERE type IN ('table','view') AND lower(name)=lower(?)", [tab.tableName]);
      if (!has) { row.reason = 'table absent from bundle'; row.verdict = 'GAP'; tabRows.push(row); return; }
      try {
        if (tm.tabLevel === 0) {
          var qq = GT.query(tm, function () { return null; }, []), c = n(one('SELECT COUNT(*) AS c FROM ' + tab.tableName + (qq.where ? ' WHERE ' + qq.where : '')).c);
          row.rows = c; if (c > 0) row.verdict = 'PASS'; else row.reason = 'VACUOUS: no rows'; tabRows.push(row); return;
        }
        var pTab = tabs[tm.parentIndex], pk = GT.keyColumn(pTab), eff = tm.parentColumn || tm.linkColumn;
        if (!tm.isDetail || !tm.linkColumn) { row.reason = 'no link column'; row.verdict = 'GAP'; tabRows.push(row); return; }
        var best = one('SELECT c.' + tm.linkColumn + ' AS v FROM ' + tab.tableName + ' c JOIN ' + pTab.tableName + ' p ON p.' + eff + '=c.' + tm.linkColumn + ' GROUP BY c.' + tm.linkColumn + ' ORDER BY COUNT(*) DESC LIMIT 1');
        if (!best) { row.reason = 'VACUOUS: no child rows'; tabRows.push(row); return; }
        var prow = one('SELECT * FROM ' + pTab.tableName + ' WHERE ' + eff + '=?', [best.v]) || {};
        var q2 = GT.query(tm, function (nm) { var x = GT.value(prow, String(nm).replace(/^[#$]/, '')); return x == null ? null : x; }, []);
        var got = q('SELECT * FROM ' + tab.tableName + ' WHERE ' + q2.where), oracle = n(one('SELECT COUNT(*) AS c FROM ' + tab.tableName + ' WHERE ' + tm.linkColumn + '=?' + (tm.whereClause && tm.whereClause.indexOf('@') < 0 ? ' AND (' + tm.whereClause + ')' : ''), [best.v]).c);
        var allParent = got.every(function (r) { return String(r[tm.linkColumn.toLowerCase()]) === String(best.v); });
        row.rows = got.length; row.parent = best.v; row.verdict = (got.length === oracle && got.length > 0 && allParent && !q2.parentNeedSave) ? 'PASS' : 'GAP';
        if (row.verdict === 'GAP') row.reason = 'count=' + got.length + ' oracle=' + oracle + ' allParent=' + allParent + ' needSave=' + q2.parentNeedSave;
      } catch (e) { row.verdict = 'GAP'; row.reason = 'threw ' + String(e.message).slice(0, 100); }
      tabRows.push(row);
    });
  });
  console.log = _l;
  tabRows.forEach(function (r) { log('§RW-DENOM window=' + r.window + ' tab=' + r.tab + ' "' + r.name + '" table=' + r.table + ' level=' + r.level + ' rows=' + (r.rows == null ? '-' : r.rows) + (r.parent != null ? ' parent=' + r.parent : '') + ' verdict=' + r.verdict + (r.reason ? ' reason=' + r.reason : '')); });
  var dp = tabRows.filter(function (r) { return r.verdict === 'PASS'; }).length, dg = tabRows.filter(function (r) { return r.verdict === 'GAP'; }).length, di = tabRows.filter(function (r) { return r.verdict === 'INCONCLUSIVE'; }).length;
  log('§RW-DENOM-TOTAL windows=' + WINS.length + ' tabs=' + tabRows.length + ' pass=' + dp + ' gap=' + dg + ' inconclusive=' + di + ' (X of N: ' + dp + ' of ' + tabRows.length + ')');
  verdict('RW-DENOM', tabRows.length ? [eq('no_gap', 'no RMA-related tab is a GAP (link/rows/parent id wrong, or table absent)', dg, 0), eq('judged', 'the sweep judged >= 8 tabs PASS (not vacuous)', dp >= 8, true), eq('windows_open', 'all 5 dictionary windows resolved tabs', tabRows.reduce(function (a, r) { a[r.window] = 1; return a; }, {}) && Object.keys(tabRows.reduce(function (a, r) { a[r.window] = 1; return a; }, {})).length, 5)] : []);
  if (setupBad.length) { log('§RW-SETUP-BAD ' + setupBad.join(' | ')); log('§RW_VERDICT INCONCLUSIVE setup=' + setupBad.length + ' (nothing above may be read as PASS)'); process.exit(2); }
  var bad = results.filter(function (r) { return r.v === 'FAIL'; }).length, inc = results.filter(function (r) { return r.v === 'INCONCLUSIVE'; }).length;
  log('§RW_VERDICT ' + (bad ? 'FAIL' : inc ? 'INCONCLUSIVE' : 'PASS') + ' cases=' + results.length + ' fail=' + bad + ' inconclusive=' + inc);
  process.exit(bad ? 1 : inc ? 2 : 0);
})();
