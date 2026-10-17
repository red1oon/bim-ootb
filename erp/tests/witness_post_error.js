#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-POST-ERROR (bim-compiler prompts/ERP_DEPTH_FILM.md §UDP-7). READ THE LOG: §WPE lines; exit code is not evidence.
// THE ISSUE: when posting a document throws (legacy: AverageCostingNegativeQtyException from MCost.setCurrentQty), legacy leaves the document Posted='E'
//   with NO facts and NO cost rows from the attempt (DocManager savepoint rollback), and Doc.post stores an AD_Note PostingError-E with a fixed text.
//   The twin left Posted='N' and wrote nothing. Drives the model layer on the shipped seed: a warehouse order for product 137 whose m_cost.CurrentQty is
//   forced to 0 (the pilot state of the 660 'E' shipments) is completed. Oracle = the pilot's real note text (oracle op `postdoc`, rolled back) for the
//   same class, compared as a TEMPLATE (document no, date and the qty tokens normalized: SQLite REAL has no numeric scale, legacy prints 0.0/-1.0).
'use strict';
var fs = require('fs'), path = require('path'), http = require('http');
var ERP = path.join(__dirname, '..');
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js'); }
var TODAY = process.env.TODAY || new Date().toISOString().slice(0, 10), DAY = TODAY + ' 00:00:00';
var log = function (s) { console.log(s); }, pass = 0, fail = 0;
var ok = function (id, n, c, d) { log((c ? '  ✅ ' : '  ❌ ') + id + ' ' + n + (d ? ' — ' + d : '')); c ? pass++ : fail++; };
function oracle(body) { return new Promise(function (res, rej) { var d = JSON.stringify(body), rq = http.request({ host: '127.0.0.1', port: 8097, method: 'POST', headers: { 'Content-Length': Buffer.byteLength(d) } }, function (r) { var b = ''; r.on('data', function (c) { b += c; }); r.on('end', function () { try { res(JSON.parse(b)); } catch (e) { rej(new Error(b.slice(0, 300))); } }); }); rq.on('error', rej); rq.end(d); }); }
function pg(sql) { return JSON.parse(require('child_process').execFileSync('docker', ['exec', '-i', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'idempiere_pilot', '-tAq'], { input: "SET search_path=adempiere;\nSELECT coalesce(json_agg(t),'[]') FROM (" + sql + ') t', encoding: 'utf8' }).trim()); }

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
  function one(sql, p) { return q(sql, p || [])[0] || null; }
  // fixture: product 137 costed Average PO with nothing on hand in the cost (the pilot state behind the 660 'E' shipments)
  q("SELECT 1");
  db.run("UPDATE m_cost SET currentqty=0, cumulatedqty=0, cumulatedamt=0 WHERE m_product_id=137 AND m_costelement_id IN (SELECT m_costelement_id FROM m_costelement WHERE costingmethod IN ('A','a'))");
  var nCost = one("SELECT COUNT(*) AS n FROM m_cost WHERE m_product_id=137 AND currentqty=0").n;
  log('§WPE-FIXTURE m_cost rows of product 137 at currentqty 0: ' + nCost);
  var cost0 = JSON.stringify(q('SELECT m_costelement_id AS e, c_acctschema_id AS s, currentqty, cumulatedqty FROM m_cost WHERE m_product_id=137 ORDER BY 1,2'));
  var s = sale({ dt: 134, lines: [{ product: 137, qty: 1 }] });
  if (s.err) { log('§WPE INCONCLUSIVE ' + s.err); process.exit(3); }
  var io = one('SELECT * FROM m_inout WHERE c_order_id=? ORDER BY m_inout_id', [s.id]);
  log('§WPE shipment ' + (io && io.m_inout_id) + ' docstatus=' + (io && io.docstatus) + ' posted=' + (io && io.posted));
  ok('A0', 'population judged: the order produced a completed shipment', !!io && io.docstatus === 'CO', JSON.stringify(io && { id: io.m_inout_id, st: io.docstatus }));
  ok('A', 'the shipment is Posted=E (legacy Doc.post :680-686 + DocManager.save)', io && io.posted === 'E', 'posted=' + (io && io.posted));
  ok('B', 'no facts survive the failed post (DocManager savepoint rollback)', one('SELECT COUNT(*) AS n FROM fact_acct WHERE ad_table_id=319 AND record_id=?', [io.m_inout_id]).n === 0);
  ok('C', 'the cost rows are as before the attempt (rollback of the cost writes)', JSON.stringify(q('SELECT m_costelement_id AS e, c_acctschema_id AS s, currentqty, cumulatedqty FROM m_cost WHERE m_product_id=137 ORDER BY 1,2')) === cost0);
  var notes = q('SELECT n.*, m.value AS mv FROM ad_note n JOIN ad_message m ON m.ad_message_id=n.ad_message_id WHERE n.ad_table_id=319 AND n.record_id=?', [io.m_inout_id]);
  ok('D', 'one AD_Note PostingError-E for the shipment (client/org of the document, AD_User = the acting user (PO.getUpdatedBy = the session user, 100 here), Processed N)', notes.length === 1 && notes[0].mv === 'PostingError-E' && String(notes[0].ad_org_id) === String(io.ad_org_id) && String(notes[0].ad_user_id) === '100' && notes[0].processed === 'N', JSON.stringify(notes.map(function (n) { return [n.mv, n.ad_org_id, n.ad_user_id, n.processed]; })));
  // oracle: the real note on a pilot shipment in the same failure class
  var pid = pg("SELECT m_inout_id FROM m_inout WHERE posted='E' ORDER BY m_inout_id DESC LIMIT 1")[0].m_inout_id;
  var L = (await oracle({ op: 'postdoc', table: 'M_InOut', ids: [pid], ctx: { client: 11, org: 11, role: 102, user: 101 } })).docs[0];
  var norm = function (t) { return String(t).replace(/Document No=[^ ]+/, 'Document No=#').replace(/Account Date=[0-9\/]+/, 'Account Date=#').replace(/(Current Qty|New Current Qty)=-?[0-9.]+/g, '$1=#').replace(/Product=[^,]+/, 'Product=#'); };
  log('§WPE legacy posted=' + L.posted + ' note=' + (L.notes[0] && L.notes[0].text));
  log('§WPE twin   note=' + (notes[0] && notes[0].textmsg));
  ok('E0', 'legacy comparison is not vacuous (a real legacy note was produced, posted=E, no facts)', L.posted === 'E' && L.notes.length === 1 && L.facts === 0);
  ok('E', 'note text == legacy template (docno/date/qty/product normalized; SQLite REAL has no numeric scale)', notes[0] && norm(notes[0].textmsg) === norm(L.notes[0].text), norm(notes[0] && notes[0].textmsg) + '  <>  ' + norm(L.notes[0].text));
  ok('F', 'reference == legacy shape MInOut[id-docno,DocStatus=CO]', notes[0] && /^MInOut\[\d+-[^,\]]+,DocStatus=CO\]$/.test(notes[0].reference) && /^MInOut\[\d+-[^,\]]+,DocStatus=CO\]$/.test(L.notes[0].reference), (notes[0] && notes[0].reference) + ' | ' + L.notes[0].reference);
  log('§WPE-SUMMARY ' + (fail ? 'FAIL' : 'PASS') + ' ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(function (e) { log('§WPE-ERROR ' + e.stack); process.exit(2); });
