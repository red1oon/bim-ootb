#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-SD16-ALLOCATION-MODEL-PATH (bim-compiler prompts/SQLiteIDEMPIERE.md §SD16; CARDINAL RULE: the shipped ERP must book exactly like legacy iDempiere).
//   READ THE LOG after every run: every verdict is a §-line, the exit code is not the evidence.
// THE ISSUE it proves/disproves: SD-16d (a customer return's AR credit memo allocated against the original invoice) is owned by the SHIPPED model layer (erp/model_invoice.js MAllocationHdr.prepareIt/completeIt
//   :412-560, MAllocationLine.processIt, invTestAllocation = MInvoice.testAllocation MInvoice.java:1433-1455, payTestAllocation = MPayment.testAllocation :966-982), NOT by an engine verb -- so the engine port carries no
//   completeAllocation (one implementation per responsibility). Through ModelLayer.run SAVE/DOCACTION on the shipped ad_seed.db + patches (sql.js): the credit memo becomes IsPaid when -GrandTotal is allocated; a short
//   allocation does not; an already-paid invoice with a positive line is refused; a fully allocated payment becomes IsAllocated, a partly allocated one does not. A case that cannot be driven prints INCONCLUSIVE.
'use strict';
var fs = require('fs'), path = require('path');
var ERP = path.join(__dirname, '..');
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js')); }
var TODAY = process.env.TODAY || new Date().toISOString().slice(0, 10), DAY = TODAY + ' 00:00:00';
var results = [], log = function (s) { console.log(s); };
function verdict(id, checks) {
  var judged = checks.length, failed = checks.filter(function (c) { return !c.ok; });
  checks.forEach(function (c) { log('  §SA-CHECK case=' + id + ' key=' + c.key + ' ' + (c.ok ? 'OK' : 'FAIL') + ' rule="' + c.rule + '"' + (c.ok ? '' : ' want=' + JSON.stringify(c.want) + ' got=' + JSON.stringify(c.got))); });
  var v = !judged ? 'INCONCLUSIVE' : failed.length ? 'FAIL' : 'PASS';
  log('§SA case=' + id + ' verdict=' + v + ' judged=' + judged + ' failed=' + failed.length); results.push({ id: id, v: v }); return v;
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

  function ins(t, o) { var cs = colsOf(t), f = Object.assign({}, o); f[t + '_id'] = newId(t); var ks = Object.keys(f).filter(function (k) { return cs.indexOf(k) >= 0; }); db.run('INSERT INTO ' + t + ' (' + ks.map(function (k) { return '"' + k + '"'; }).join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')', ks.map(function (k) { return f[k]; })); return f[t + '_id']; }
  var dt = function (b) { var r = one("SELECT c_doctype_id AS id FROM c_doctype WHERE ad_client_id=11 AND docbasetype=? AND isactive='Y' ORDER BY c_doctype_id LIMIT 1", [b]); return r && r.id; };
  var DT_ARI = dt('ARI'), DT_ARC = dt('ARC'), DT_CMA = dt('CMA');
  log('§SA-SEED doctypes ARI=' + DT_ARI + ' ARC=' + DT_ARC + ' CMA=' + DT_CMA);
  if (!DT_ARI || !DT_ARC || !DT_CMA) { verdict('SA-DRIVE', []); log('§SA_VERDICT INCONCLUSIVE'); process.exit(2); }
  function invoice(gt, doctype, paid) { return ins('c_invoice', { ad_client_id: 11, ad_org_id: 11, isactive: 'Y', issotrx: 'Y', c_bpartner_id: 112, c_bpartner_location_id: 108, c_currency_id: 100, c_doctype_id: doctype, c_doctypetarget_id: doctype, documentno: 'SA' + gt + doctype,
    dateinvoiced: DAY, dateacct: DAY, docstatus: 'CO', docaction: 'CL', processed: 'Y', posted: 'N', ispaid: paid || 'N', grandtotal: gt, totallines: gt, isapproved: 'Y', istaxincluded: 'N', m_pricelist_id: 101, c_paymentterm_id: 105 }); }
  function alloc(lines) {
    var h = run({ table: 'c_allocationhdr', timing: 'SAVE', changes: ML.newPO(new ML.Trx(q, env()), 'c_allocationhdr', { ad_org_id: 11, c_doctype_id: DT_CMA, c_currency_id: 100, datetrx: DAY, dateacct: DAY, docstatus: 'DR', docaction: 'CO', processed: 'N', isapproved: 'N', posted: 'N', isactive: 'Y', approvalamt: 0 }) });
    if (!h.ok) return { err: 'allocation header refused: ' + (h.error || h.msg) };
    var id = one('SELECT MAX(c_allocationhdr_id) AS id FROM c_allocationhdr').id;
    for (var i = 0; i < lines.length; i++) {
      var l = run({ table: 'c_allocationline', timing: 'SAVE', changes: ML.newPO(new ML.Trx(q, env()), 'c_allocationline', Object.assign({ c_allocationhdr_id: id, ad_org_id: 11, c_bpartner_id: 112, datetrx: DAY, discountamt: 0, writeoffamt: 0, overunderamt: 0, isactive: 'Y' }, lines[i])) });
      if (!l.ok) return { err: 'allocation line refused: ' + (l.error || l.msg) };
    }
    var c = run({ table: 'c_allocationhdr', timing: 'DOCACTION', id: id, action: 'CO' });
    return { id: id, ok: c.ok, msg: c.msg, status: one('SELECT docstatus FROM c_allocationhdr WHERE c_allocationhdr_id=?', [id]).docstatus };
  }
  var paidOf = function (id) { return one('SELECT ispaid FROM c_invoice WHERE c_invoice_id=?', [id]).ispaid; };
  function payment(amt) {
    var r = run({ table: 'c_payment', timing: 'SAVE', changes: ML.newPO(new ML.Trx(q, env()), 'c_payment', { ad_org_id: 11, c_doctype_id: 119, c_bankaccount_id: 101, c_bpartner_id: 112, c_currency_id: 100, payamt: amt, isreceipt: 'Y', tendertype: 'X',
      dateacct: DAY, datetrx: DAY, docstatus: 'DR', docaction: 'CO', processed: 'N', isapproved: 'N', isallocated: 'N', isprepayment: 'N', isoverunderpayment: 'N', overunderamt: 0, discountamt: 0, writeoffamt: 0, isonline: 'N', isreconciled: 'N', isdelayedcapture: 'N' }) });
    if (!r.ok) return { err: 'payment save refused: ' + (r.error || r.msg) };
    var id = one('SELECT MAX(c_payment_id) AS id FROM c_payment').id, c = run({ table: 'c_payment', timing: 'DOCACTION', id: id, action: 'CO' });
    return { id: id, ok: c.ok, status: one('SELECT docstatus FROM c_payment WHERE c_payment_id=?', [id]).docstatus };
  }
  function drive(id, fn) { var r = fn(); if (r.err) { log('§SA-NOTE ' + id + ' could not be driven: ' + r.err); return null; } return r; }

  // SA-NET: invoice 165, credit memo 110 (the SD-16 fixture); lines +110 on the invoice, -110 on the credit memo
  var inv = invoice(165, DT_ARI), cm = invoice(110, DT_ARC);
  var a1 = drive('SA-NET', function () { return alloc([{ c_invoice_id: inv, amount: 110 }, { c_invoice_id: cm, amount: -110 }]); });
  verdict('SA-NET', a1 ? [eq('allocation_completes', 'MAllocationHdr.completeIt => CO', [a1.ok, a1.status], [true, 'CO']),
    eq('credit_memo_paid', 'testAllocation: raw sum -110 == -GrandTotal (credit memo negated) => IsPaid Y (MInvoice.java:1433-1455)', paidOf(cm), 'Y'),
    eq('invoice_open', 'invoice 165 allocated 110 only => IsPaid stays N', paidOf(inv), 'N')] : []);
  // SA-NEG-SHORT: the SAME shape one unit short must flip the credit memo verdict
  var inv2 = invoice(165, DT_ARI), cm2 = invoice(110, DT_ARC);
  var a2 = drive('SA-NEG-SHORT', function () { return alloc([{ c_invoice_id: inv2, amount: 100 }, { c_invoice_id: cm2, amount: -100 }]); });
  verdict('SA-NEG-SHORT', a2 ? [eq('completes', 'a short allocation still completes', [a2.ok, a2.status], [true, 'CO']), eq('credit_memo_not_paid', 'NEG-CONTROL -100 against a 110 credit memo => IsPaid stays N (the verdict of SA-NET flips)', paidOf(cm2), 'N')] : []);
  // SA-PAID-REFUSED: prepareIt "ValidationError IsPaid" (an invoice already paid + a positive line amount)
  var inv3 = invoice(165, DT_ARI, 'Y'), cm3 = invoice(110, DT_ARC);
  var a3 = drive('SA-PAID-REFUSED', function () { return alloc([{ c_invoice_id: inv3, amount: 110 }, { c_invoice_id: cm3, amount: -110 }]); });
  verdict('SA-PAID-REFUSED', a3 ? [eq('refused', 'MAllocationHdr.prepareIt:412-516 IsPaid + positive amount => not completed', [a3.ok, a3.status !== 'CO'], [false, true]), eq('reason', 'the refusal names IsPaid', /IsPaid/i.test(String(a3.msg)), true), eq('credit_memo_untouched', 'nothing was allocated => credit memo IsPaid stays N', paidOf(cm3), 'N')] : []);
  // SA-PAYMENT: MAllocationLine.processIt -> MPayment.testAllocation (payment IsAllocated)
  var p1 = drive('SA-PAYMENT', function () { return payment(10); }), inv4 = invoice(165, DT_ARI), pa1 = p1 && drive('SA-PAYMENT', function () { return alloc([{ c_invoice_id: inv4, c_payment_id: p1.id, amount: 10 }]); });
  var isAl = function (id) { return one('SELECT isallocated FROM c_payment WHERE c_payment_id=?', [id]).isallocated; };
  verdict('SA-PAYMENT', p1 && pa1 ? [eq('payment_completed', 'the payment fixture completed', p1.status, 'CO'), eq('allocation_completes', 'allocation completes', [pa1.ok, pa1.status], [true, 'CO']), eq('payment_allocated', 'payment 10 fully allocated by a 10 line => IsAllocated Y (MPayment.testAllocation :966-982)', isAl(p1.id), 'Y')] : []);
  var p2 = drive('SA-NEG-PARTIAL', function () { return payment(10); }), inv5 = invoice(165, DT_ARI), pa2 = p2 && drive('SA-NEG-PARTIAL', function () { return alloc([{ c_invoice_id: inv5, c_payment_id: p2.id, amount: 5 }]); });
  verdict('SA-NEG-PARTIAL', p2 && pa2 ? [eq('payment_not_allocated', 'NEG-CONTROL payment 10 allocated only 5 => IsAllocated stays N (SA-PAYMENT flips)', isAl(p2.id), 'N')] : []);
  var bad = results.filter(function (r) { return r.v === 'FAIL'; }).length, inc = results.filter(function (r) { return r.v === 'INCONCLUSIVE'; }).length;
  log('§SA_VERDICT ' + (bad ? 'FAIL' : inc ? 'INCONCLUSIVE' : 'PASS') + ' cases=' + results.length + ' fail=' + bad + ' inconclusive=' + inc);
  process.exit(bad ? 1 : inc ? 2 : 0);
})();
