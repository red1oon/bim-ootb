#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-ORDER-PAYSCHED (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §46; sibling of W-COSTING-SWEEP). READ THE LOG: §WCS lines; exit code is not evidence.
// THE ISSUE: the twin refused to complete any order whose payment term has a schedule ('MPaymentTerm.applyOrder schedule not ported') and could not copy an order's schedule onto its invoice.
//   Fixture pair: legacy = oracle op `makedoc` (the same On Credit Order built through the REAL MOrder/MOrderLine, processIt(CO), rolled back); twin = the same field values through the model layer
//   (SAVE header + line, DOCACTION CO). Compared: C_OrderPaySchedule rows (due, discount, dates, valid) + IsPayScheduleValid, and the auto-invoice's C_InvoicePaySchedule (MOrder.createInvoice :2566).
//   Zero judged schedules prints INCONCLUSIVE, never PASS.
// Run: node erp/tests/witness_order_paysched_diff.js  (pilot + oracle :8097 with op makedoc; NODE_PATH=bim-ootb/tests/node_modules)
'use strict';
var fs = require('fs'), path = require('path'), http = require('http');
var ERP = path.join(__dirname, '..');
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js'); }
var TODAY = process.env.TODAY || new Date().toISOString().slice(0, 10), DAY = TODAY + ' 00:00:00';
var log = function (s) { console.log(s); }, pass = 0, fail = 0, inc = 0;
var ok = function (id, n, c, d) { log((c === null ? '  ⚠ ' : c ? '  ✅ ' : '  ❌ ') + id + ' ' + n + (d ? ' — ' + d : '')); c === null ? inc++ : c ? pass++ : fail++; };
function oracle(body) { return new Promise(function (res, rej) { var d = JSON.stringify(body), rq = http.request({ host: '127.0.0.1', port: 8097, method: 'POST', headers: { 'Content-Length': Buffer.byteLength(d) } }, function (r) { var b = ''; r.on('data', function (c) { b += c; }); r.on('end', function () { try { res(JSON.parse(b)); } catch (e) { rej(new Error(b.slice(0, 300))); } }); }); rq.on('error', rej); rq.end(d); }); }

var DOCS_Q = "SELECT i.c_invoice_id AS id, d.docbasetype AS dbt FROM c_invoice i JOIN c_doctype d ON d.c_doctype_id=i.c_doctype_id WHERE i.docstatus='CO' AND i.ad_client_id=11 ORDER BY 1";
function pgRows(sql) { return JSON.parse(require('child_process').execFileSync('docker', ['exec', '-i', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'idempiere_pilot', '-tAq'], { input: "SET search_path=adempiere;\nSELECT coalesce(json_agg(t),'[]') FROM (" + sql + ") t;\n", encoding: 'utf8', maxBuffer: 1 << 28 }).replace(/^SET\n/, '').trim()); }
var r2 = function (v) { return (Math.round(Number(v || 0) * 100) / 100).toFixed(2); };
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
        Object.keys(f).forEach(function (k) { f[k] = typeof f[k] === 'string' ? f[k].replace(/\{\{opref:(\d+)\}\}/g, function (m, d) { return String(ids[Number(d)]); }) : f[k]; f[k] = fix(f[k]); if (cs.indexOf(k) < 0) delete f[k]; });
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
  var P = require(path.join(ERP, 'model_post.js'));
  var CTX = { client: 11, org: 11, role: 102, user: 101 };
  function twinFacts(id) {
    var trx = new ML.Trx(q, env()), doc = trx.get('c_invoice', id);
    if (!doc) return { err: 'no document in the twin seed' };
    var why = null; trx.say = function (l) { if (/§MODEL-(POST|ERR|UNPORTED)/.test(l)) why = (why ? why + ' | ' : '') + String(l).slice(0, 200); };
    var res; try { res = P.post(trx, 'c_invoice', doc, { repost: true }); } catch (e) { return { err: 'EXC ' + String(e).slice(0, 200) }; }
    var rows = trx.groupOps().filter(function (o) { return o && o.table === 'fact_acct' && o.op_type === 'CRUD_CREATE'; }).map(function (o) { var f = o.fields; return { s: Number(f.c_acctschema_id), a: Number(f.account_id), dr: r2(f.amtacctdr), cr: r2(f.amtacctcr), qty: r2(f.qty), p: Number(f.m_product_id || 0) }; });
    return { rows: rows, posted: res, why: why };
  }
  var key = function (f) { return [f.s, f.a, f.dr, f.cr, f.qty, f.p].join(':'); };
  var CASES = [{ name: 'term108-even', product: 130, qty: 3 }, { name: 'term108-remainder', product: 126, qty: 1 }], judged = 0;
  var HDR = { AD_Org_ID: 11, C_DocTypeTarget_ID: 133, C_DocType_ID: 0, IsSOTrx: 'Y', C_BPartner_ID: 112, C_BPartner_Location_ID: 108, Bill_BPartner_ID: 112, Bill_Location_ID: 108, M_Warehouse_ID: 103,
    M_PriceList_ID: 101, C_Currency_ID: 100, C_PaymentTerm_ID: 108, SalesRep_ID: 101, PaymentRule: 'P', InvoiceRule: 'I', DeliveryRule: 'F', DeliveryViaRule: 'P', PriorityRule: '5', FreightCostRule: 'I',
    DocAction: 'CO', DateOrdered: TODAY, DateAcct: TODAY, DatePromised: TODAY };
  var Q = { ops: 'SELECT dueamt, discountamt, duedate, discountdate, isvalid FROM c_orderpayschedule WHERE c_order_id=? ORDER BY duedate',
    hdr: 'SELECT grandtotal, ispayschedulevalid, docstatus FROM c_order WHERE c_order_id=?',
    ips: 'SELECT s.dueamt, s.discountamt, s.duedate, s.discountdate, s.isvalid, i.ispayschedulevalid, i.grandtotal FROM c_invoicepayschedule s JOIN c_invoice i ON i.c_invoice_id=s.c_invoice_id WHERE i.c_order_id=? ORDER BY s.duedate' };
  var canon = function (rows) { return rows.map(function (r) { return Object.keys(r).sort().map(function (k) { var v = r[k]; return k + '=' + (/amt|total/.test(k) ? r2(v) : /date/.test(k) ? String(v).slice(0, 10) : String(v)); }).join(','); }).join(' | '); };
  var lc = function (o) { var x = {}; Object.keys(o).forEach(function (k) { x[k.toLowerCase()] = o[k]; }); return x; };
  for (var ci = 0; ci < CASES.length; ci++) {
    var C = CASES[ci], line = { AD_Org_ID: 11, M_Product_ID: C.product, QtyEntered: C.qty, QtyOrdered: C.qty, C_UOM_ID: 100, C_Tax_ID: 104, M_Warehouse_ID: 103 };
    var Lr = (await oracle({ op: 'makedoc', ctx: Object.assign({ date: TODAY }, CTX), header: { table: 'C_Order', fields: HDR }, lines: [{ table: 'C_OrderLine', parentColumn: 'C_Order_ID', fields: line }], action: 'CO', queries: Q })).doc;
    if (Lr.exception || Lr.docStatus !== 'CO') { log('§WOP case=' + C.name + ' LEGACY-REFUSED ' + (Lr.exception || Lr.processMsg)); continue; }
    var t0 = new ML.Trx(q, env()), hf = lc(HDR); delete hf.c_doctype_id; hf.docstatus = 'DR'; hf.processed = 'N'; hf.isapproved = 'N'; hf.posted = 'N'; hf.totallines = 0; hf.grandtotal = 0;
    var h = run({ table: 'c_order', timing: 'SAVE', changes: ML.newPO(t0, 'c_order', Object.assign({ c_doctype_id: 0 }, hf)) });
    if (!h.ok) { judged++; fail++; log('  ❌ ' + C.name + ' twin header save refused: ' + (h.error || h.msg)); continue; }
    var oid = one('SELECT MAX(c_order_id) AS id FROM c_order').id;
    var lr = run({ table: 'c_orderline', timing: 'SAVE', changes: ML.newPO(t0, 'c_orderline', Object.assign({ c_order_id: oid, priceentered: 0, priceactual: 0, pricelist: 0, qtydelivered: 0, qtyinvoiced: 0, qtyreserved: 0, line: 0, isdescription: 'N', processed: 'N' }, lc(line))) });
    if (!lr.ok) { judged++; fail++; log('  ❌ ' + C.name + ' twin line save refused: ' + (lr.error || lr.msg)); continue; }
    var co = run({ table: 'c_order', timing: 'DOCACTION', id: oid, action: 'CO' });
    var tw = {}; Object.keys(Q).forEach(function (k) { tw[k] = q(Q[k], [oid]); });
    ['ops', 'hdr', 'ips'].forEach(function (k) {
      var L1 = canon(Lr.rows[k] || []), T1 = canon(tw[k]); judged++;
      ok(C.name + ':' + k, C.name + ' ' + k + ' twin == legacy' + (k === 'ops' ? ' (C_OrderPaySchedule)' : k === 'ips' ? ' (auto-invoice C_InvoicePaySchedule, MOrder.createInvoice)' : ' (order header)'), co.ok && L1 === T1, (co.ok ? '' : 'twin complete refused: ' + (co.msg || co.error) + ' ') + 'legacy=' + L1 + ' twin=' + T1);
    });
    log('§WOP case=' + C.name + ' legacy order=' + Lr.id + ' twin order=' + oid + ' legacy ops=' + (Lr.rows.ops || []).length + ' ips=' + (Lr.rows.ips || []).length);
  }
  if (!judged) ok('T-VACUOUS', 'at least one case judged', null, 'legacy refused every case');
  log('§WOP-SUMMARY ' + (fail ? 'FAIL' : inc ? 'INCONCLUSIVE' : 'PASS') + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc);
  process.exit(fail ? 1 : inc ? 3 : 0);
})().catch(function (e) { log('§WOP-ERROR ' + e.stack); process.exit(2); });
