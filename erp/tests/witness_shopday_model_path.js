#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// ⚠ DO NOT REMOVE — W-SHOPDAY-MODEL-PATH (bim-compiler prompts/SQLiteIDEMPIERE.md §SHOPDAY-RUN-2; CARDINAL RULE: the shipped ERP must refuse/default exactly like legacy iDempiere).
//   READ THE LOG after every run: every verdict is a §-line, the exit code is not the evidence.
// THE ISSUE it proves/disproves: through the SHIPPED model layer (ModelLayer.run SAVE / DOCACTION on the shipped erp/ad_seed.db + patches, sql.js, recorded clock) --
//   MP-PRICELIST   an order saved with NO price list takes the client's default SO list (MOrder.beforeSave:1282-1291 + setM_PriceList_ID:908-917 -> currency / IsTaxIncluded
//                  follow the list) on GardenWorld; on a fresh-client-like seed (no active SO list) the save is REFUSED (legacy NPE "pl is null"); an explicit list is kept.
//   MP-PERIOD      a Payment and a Shipment completed in a CLOSED period are refused "@PeriodClosed@" (MPayment.prepareIt:1917-1923, MInOut.prepareIt:1453-1457) by the model layer's
//                  T.periodOpen -- the single shipped implementation; the same documents in an OPEN period complete (negative control).
//   A case that cannot be driven prints INCONCLUSIVE, never PASS.
'use strict';
var fs = require('fs'), path = require('path');
var ERP = path.join(__dirname, '..');
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js')); }
var TODAY = process.env.TODAY || new Date().toISOString().slice(0, 10), DAY = TODAY + ' 00:00:00';
var results = [], log = function (s) { console.log(s); };
function verdict(id, checks) {
  var judged = checks.length, failed = checks.filter(function (c) { return !c.ok; });
  checks.forEach(function (c) { log('  §MP-CHECK case=' + id + ' key=' + c.key + ' ' + (c.ok ? 'OK' : 'FAIL') + ' rule="' + c.rule + '"' + (c.ok ? '' : ' want=' + JSON.stringify(c.want) + ' got=' + JSON.stringify(c.got))); });
  var v = !judged ? 'INCONCLUSIVE' : failed.length ? 'FAIL' : 'PASS';
  log('§MP case=' + id + ' verdict=' + v + ' judged=' + judged + ' failed=' + failed.length); results.push({ id: id, v: v }); return v;
}
function eq(key, rule, got, want) { return { key: key, rule: rule, ok: JSON.stringify(got) === JSON.stringify(want), got: got, want: want }; }

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

  var locator = (one('SELECT m_locator_id AS l FROM m_locator WHERE m_warehouse_id=103 ORDER BY isdefault DESC, m_locator_id LIMIT 1') || {}).l;
  function orderHdr(over) {
    return run({ table: 'c_order', timing: 'SAVE', changes: ML.newPO(new ML.Trx(q, env()), 'c_order', Object.assign({ ad_org_id: 11, c_doctypetarget_id: 132, c_doctype_id: 0, issotrx: 'Y', c_bpartner_id: 112, c_bpartner_location_id: 108,
      bill_bpartner_id: 112, bill_location_id: 108, m_warehouse_id: 103, c_paymentterm_id: 105, salesrep_id: 101, paymentrule: 'P', invoicerule: 'I', deliveryrule: 'A', deliveryviarule: 'P', priorityrule: '5', freightcostrule: 'I',
      dateordered: DAY, dateacct: DAY, datepromised: DAY, docstatus: 'DR', docaction: 'CO', totallines: 0, grandtotal: 0, isapproved: 'N', processed: 'N', posted: 'N', isdiscountprinted: 'N', isdropship: 'N', isselected: 'N',
      sendemail: 'N', isinvoiced: 'N', isdelivered: 'N', isprinted: 'N' }, over)) });
  }
  function lastOrder() { return one('SELECT * FROM c_order ORDER BY c_order_id DESC LIMIT 1'); }

  // ── MP-PRICELIST ──
  var n0 = one('SELECT COUNT(*) AS n FROM c_order').n;
  var r1 = orderHdr({ m_pricelist_id: 0, c_currency_id: 0, istaxincluded: 'N' }), o1 = r1.ok ? lastOrder() : null;
  if (!r1.ok) log('§MP-NOTE gardenworld default refused: ' + (r1.error || r1.msg) + ' log=' + JSON.stringify((r1.log || []).slice(-3)));
  verdict('MP-PRICELIST-GARDENWORLD', [eq('saved', 'MOrder.beforeSave:1282-1291 default list found => save succeeds', r1.ok, true),
    eq('list_default_so', 'ORDER BY IsDefault DESC: GardenWorld SO lists are 101 Standard (IsDefault Y) and 103 Export (N) => 101', o1 && o1.m_pricelist_id, 101),
    eq('currency_follows', 'setM_PriceList_ID:908-917 -> C_Currency_ID of the list (101 -> 100)', o1 && o1.c_currency_id, 100)]);
  var r2_ = orderHdr({ m_pricelist_id: 103, c_currency_id: 102 }), o2 = r2_.ok ? lastOrder() : null;
  verdict('MP-PRICELIST-EXPLICIT', [eq('kept', 'an explicit price list is kept as is (103 Export)', [r2_.ok, o2 && o2.m_pricelist_id], [true, 103])]);
  // fresh-client-like: MSetup gives a client only IsSOPriceList=N lists (measured on the pilot, SD-12z)
  db.run("UPDATE m_pricelist SET issopricelist='N' WHERE ad_client_id=11");
  var nB = one('SELECT COUNT(*) AS n FROM c_order').n, r3 = orderHdr({ m_pricelist_id: 0, c_currency_id: 0 }), nA = one('SELECT COUNT(*) AS n FROM c_order').n;
  verdict('MP-PRICELIST-FRESH-CLIENT', [eq('refused', 'no active SO list => legacy NPE "pl is null" (MOrder.java:910-911) => the save is REFUSED', r3.ok, false),
    eq('nothing_written', 'a refused save writes no order row', nA - nB, 0), eq('reason_named', 'the refusal says why', /price list/i.test(String(r3.error || r3.msg || '')), true)]);
  var r4 = orderHdr({ m_pricelist_id: 0, issotrx: 'N', c_doctypetarget_id: 126 }), o4 = r4.ok ? lastOrder() : null;
  verdict('MP-PRICELIST-NEG-CONTROL', [eq('purchase_unaffected', 'NEG-CONTROL the PURCHASE order still defaults (after the fresh-client flip every list is IsSOPriceList=N; IsDefault DESC picks 101 Standard)', [r4.ok, o4 && Number(o4.m_pricelist_id)], [true, 101])]);

  // ── MP-PERIOD ── (explicit period control: AutoPeriodControl=N so C_PeriodControl decides, as MSetup'd clients do after the user closes a period)
  db.run("UPDATE c_acctschema SET autoperiodcontrol='N' WHERE ad_client_id=11");
  var per = one("SELECT c_period_id AS id FROM c_period WHERE ad_client_id=11 AND periodtype='S' AND date(startdate)<=date(?) AND date(enddate)>=date(?) ORDER BY c_period_id LIMIT 1", [TODAY, TODAY]);
  function setPeriod(dbt, st) {
    if (!per) return;
    if (one('SELECT 1 AS x FROM c_periodcontrol WHERE c_period_id=? AND docbasetype=?', [per.id, dbt])) db.run('UPDATE c_periodcontrol SET periodstatus=? WHERE c_period_id=? AND docbasetype=?', [st, per.id, dbt]);
    else db.run('INSERT INTO c_periodcontrol (c_periodcontrol_id, ad_client_id, ad_org_id, isactive, c_period_id, docbasetype, periodstatus, periodaction, processed) VALUES (?,11,0,\'Y\',?,?,?,\'N\',\'N\')', [newId('c_periodcontrol'), per.id, dbt, st]);
  }
  function payment() {
    var r = run({ table: 'c_payment', timing: 'SAVE', changes: ML.newPO(new ML.Trx(q, env()), 'c_payment', { ad_org_id: 11, c_doctype_id: 119, c_bankaccount_id: 101, c_bpartner_id: 112, c_currency_id: 100, payamt: 10, isreceipt: 'Y', tendertype: 'X',
      dateacct: DAY, datetrx: DAY, docstatus: 'DR', docaction: 'CO', processed: 'N', isapproved: 'N', isallocated: 'N', isprepayment: 'N', isoverunderpayment: 'N', overunderamt: 0, discountamt: 0, writeoffamt: 0, isonline: 'N', isreconciled: 'N', isdelayedcapture: 'N' }) });
    if (!r.ok) return { err: 'payment save refused: ' + (r.error || r.msg) };
    var id = one('SELECT MAX(c_payment_id) AS id FROM c_payment').id, c = run({ table: 'c_payment', timing: 'DOCACTION', id: id, action: 'CO' });
    return { id: id, ok: c.ok, msg: c.msg, status: one('SELECT docstatus FROM c_payment WHERE c_payment_id=?', [id]).docstatus };
  }
  function shipment() {
    var h = run({ table: 'm_inout', timing: 'SAVE', changes: ML.newPO(new ML.Trx(q, env()), 'm_inout', { ad_org_id: 11, c_doctype_id: 120, issotrx: 'Y', movementtype: 'C-', c_bpartner_id: 112, c_bpartner_location_id: 108, m_warehouse_id: 103,
      movementdate: DAY, dateacct: DAY, docstatus: 'DR', docaction: 'CO', processed: 'N', isapproved: 'N', posted: 'N', isprinted: 'N', isintransit: 'N', isdropship: 'N', deliveryrule: 'A', deliveryviarule: 'P', priorityrule: '5', freightcostrule: 'I', sendemail: 'N' }) });
    if (!h.ok) return { err: 'shipment header refused: ' + (h.error || h.msg) };
    var id = one('SELECT MAX(m_inout_id) AS id FROM m_inout').id;
    var l = run({ table: 'm_inoutline', timing: 'SAVE', changes: ML.newPO(new ML.Trx(q, env()), 'm_inoutline', { m_inout_id: id, ad_org_id: 11, m_product_id: 137, m_locator_id: locator, movementqty: 1, qtyentered: 1, line: 10, processed: 'N', isdescription: 'N', isinvoiced: 'N' }) });
    if (!l.ok) return { err: 'shipment line refused: ' + (l.error || l.msg) };
    var c = run({ table: 'm_inout', timing: 'DOCACTION', id: id, action: 'CO' });
    return { id: id, ok: c.ok, msg: c.msg, status: one('SELECT docstatus FROM m_inout WHERE m_inout_id=?', [id]).docstatus };
  }
  function judge(id, what, dbt, fn) {
    if (!per) return verdict(id, []);
    setPeriod(dbt, 'C'); var cl = fn(); setPeriod(dbt, 'O'); var op = fn();
    if (cl.err || op.err) { log('§MP-NOTE ' + id + ' could not be driven: ' + (cl.err || op.err)); return verdict(id, []); }
    return verdict(id, [eq('closed_refused', what + ' in a CLOSED period is refused (@PeriodClosed@), document stays out of CO', [cl.ok, cl.status !== 'CO'], [false, true]),
      eq('closed_reason', 'the refusal is the period test', /PeriodClosed|period/i.test(String(cl.msg)), true),
      eq('open_completes', 'NEG-CONTROL the same document in an OPEN period completes', [op.ok, op.status], [true, 'CO'])]);
  }
  judge('MP-PERIOD-PAYMENT', 'MPayment.prepareIt:1917-1923 Payment', 'ARR', payment);
  judge('MP-PERIOD-SHIPMENT', 'MInOut.prepareIt:1453-1457 Shipment', 'MMS', shipment);
  var bad = results.filter(function (r) { return r.v === 'FAIL'; }).length, inc = results.filter(function (r) { return r.v === 'INCONCLUSIVE'; }).length;
  log('§MP_VERDICT ' + (bad ? 'FAIL' : inc ? 'INCONCLUSIVE' : 'PASS') + ' cases=' + results.length + ' fail=' + bad + ' inconclusive=' + inc);
  process.exit(bad ? 1 : inc ? 2 : 0);
})();

