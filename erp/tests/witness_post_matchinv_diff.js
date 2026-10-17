#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-POST-MATCHINV (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §46; sibling of W-COSTING-SWEEP). READ THE LOG: §WCS lines; exit code is not evidence.
// THE ISSUE: does the twin's model layer post a Matched Invoice (M_MatchInv, Doc_MatchInv) to the same Fact_Acct as legacy? Every invoice both dictionaries share is re-posted by the pilot
//   through the REAL DocManager inside a rolled-back trx (oracle op `postdoc`, facts) and by the twin through model_post. Compared per document: status (Y/N/E) and the Fact_Acct lines
//   (schema, account, Dr, Cr, qty, product). A document class with no shared document prints INCONCLUSIVE, never PASS. Gap it targets: 'Doc_Invoice API not ported in model_post'.
// Run: node erp/tests/witness_post_invoice_diff.js  (pilot + oracle :8097 up; NODE_PATH=bim-ootb/tests/node_modules)
'use strict';
var fs = require('fs'), path = require('path'), http = require('http');
var ERP = path.join(__dirname, '..');
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js'); }
var TODAY = process.env.TODAY || new Date().toISOString().slice(0, 10), DAY = TODAY + ' 00:00:00';
var log = function (s) { console.log(s); }, pass = 0, fail = 0, inc = 0;
var ok = function (id, n, c, d) { log((c === null ? '  ⚠ ' : c ? '  ✅ ' : '  ❌ ') + id + ' ' + n + (d ? ' — ' + d : '')); c === null ? inc++ : c ? pass++ : fail++; };
function oracle(body) { return new Promise(function (res, rej) { var d = JSON.stringify(body), rq = http.request({ host: '127.0.0.1', port: 8097, method: 'POST', headers: { 'Content-Length': Buffer.byteLength(d) } }, function (r) { var b = ''; r.on('data', function (c) { b += c; }); r.on('end', function () { try { res(JSON.parse(b)); } catch (e) { rej(new Error(b.slice(0, 300))); } }); }); rq.on('error', rej); rq.end(d); }); }

var DOCS_Q = "SELECT m.m_matchinv_id AS id, d.docbasetype AS dbt FROM m_matchinv m JOIN c_invoiceline il ON il.c_invoiceline_id=m.c_invoiceline_id JOIN c_invoice i ON i.c_invoice_id=il.c_invoice_id JOIN c_doctype d ON d.c_doctype_id=i.c_doctype_id WHERE m.ad_client_id=11 ORDER BY 1";
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
    var trx = new ML.Trx(q, env()), doc = trx.get('m_matchinv', id);
    if (!doc) return { err: 'no document in the twin seed' };
    var why = null; trx.say = function (l) { if (/§MODEL-(POST|ERR|UNPORTED)/.test(l)) why = (why ? why + ' | ' : '') + String(l).slice(0, 200); };
    var res; try { res = P.post(trx, 'm_matchinv', doc, { repost: true }); } catch (e) { return { err: 'EXC ' + String(e).slice(0, 200) }; }
    var rows = trx.groupOps().filter(function (o) { return o && o.table === 'fact_acct' && o.op_type === 'CRUD_CREATE'; }).map(function (o) { var f = o.fields; return { s: Number(f.c_acctschema_id), a: Number(f.account_id), dr: r2(f.amtacctdr), cr: r2(f.amtacctcr), qty: r2(f.qty), p: Number(f.m_product_id || 0) }; });
    return { rows: rows, posted: res, why: why };
  }
  // FIXTURE SYNC (the W-COSTING-SWEEP precedent): legacy posts from the pilot's M_Cost / M_CostDetail / M_CostHistory (its history of postings: the stock-coverage split of an AveragePO IPV reads the current cost qty);
  //   the seed's cost rows have not lived that history, so the twin is fed the SAME rows and the comparison judges the posting maths, not the drift.
  ['m_costelement', 'm_cost', 'm_costdetail', 'm_costhistory'].forEach(function (t) {
    var have = q('PRAGMA table_info(' + t + ')').map(function (c) { return c.name.toLowerCase(); }), rows = pgRows('SELECT * FROM ' + t + ' WHERE ad_client_id=11');
    db.run('DELETE FROM ' + t + ' WHERE ad_client_id=11');
    rows.forEach(function (r) { var ks = Object.keys(r).filter(function (k) { return have.indexOf(k) >= 0; }); db.run('INSERT INTO ' + t + ' (' + ks.join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')', ks.map(function (k) { return r[k]; })); });
    log('§WPI-SYNC ' + t + ' rows=' + rows.length + ' from the pilot (client 11)');
  });
  var key = function (f) { return [f.s, f.a, f.dr, f.cr, f.qty, f.p].join(':'); };
  var docs = pgRows(DOCS_Q), byType = {}; log('§WPI twin m_matchinv rows=' + JSON.stringify(q('SELECT COUNT(*) AS n, MIN(m_matchinv_id) AS lo FROM m_matchinv')) + ' first pilot=' + JSON.stringify(docs[0])); log('§WPI docs from the pilot=' + docs.length + ' in the twin=' + docs.filter(function (d) { return q('SELECT 1 AS x FROM m_matchinv WHERE m_matchinv_id=?', [d.id]).length > 0; }).length);
  for (var di = 0; di < docs.length; di++) {
    var d = docs[di], inTwin = q('SELECT 1 AS x FROM m_matchinv WHERE m_matchinv_id=?', [d.id]).length > 0;
    if (!inTwin) continue;
    var L = (await oracle({ op: 'postdoc', table: 'M_MatchInv', ids: [d.id], facts: true, ctx: CTX })).docs[0], T = twinFacts(d.id);
    var bt = byType[d.dbt] || (byType[d.dbt] = { match: 0, judged: 0, diffs: [] });
    if (T.err) { bt.judged++; bt.diffs.push(d.id + ': twin ' + T.err); log('§WPI doc=' + d.id + ' ' + d.dbt + ' TWIN-ERR ' + T.err); continue; }
    var legSt = L.error != null ? 'E' : String(L.posted), lf = legSt === 'Y' ? (L.factRows || []).map(function (f) { return { s: f.s, a: f.a, dr: r2(f.dr), cr: r2(f.cr), qty: r2(f.qty), p: f.p }; }).map(key).sort() : [];
    var twSt = T.rows.length ? 'Y' : /posted=E/.test(T.why || '') ? 'E' : /posted=N/.test(T.why || '') ? 'N' : '?', tf = T.rows.map(key).sort();
    var same = legSt === twSt && JSON.stringify(lf) === JSON.stringify(tf); bt.judged++; if (same) bt.match++; else bt.diffs.push(d.id);
    log('§WPI doc=' + d.id + ' ' + d.dbt + ' ' + (same ? 'EQUAL' : 'DIFF') + ' legacy=' + legSt + '/' + lf.length + ' twin=' + twSt + '/' + tf.length + (same ? '' : '\n      legacy: ' + lf.join(' ') + '\n      twin:   ' + tf.join(' ') + (T.why ? '\n      why: ' + T.why.slice(-200) : '')));
  }
  ['API', 'APC', 'ARI', 'ARC'].forEach(function (t) { var v = byType[t]; if (!v) { ok('T-' + t, t + ': a shared M_MatchInv of ' + t + ' invoice to judge', null, 'none shared between the pilot and the twin seed'); return; }
    ok('T-' + t, t + ': twin books == legacy on ' + v.judged + ' shared invoice(s)', v.match === v.judged, v.diffs.slice(0, 6).join(' | ')); });
  log('§WPI-SUMMARY ' + (fail ? 'FAIL' : inc ? 'INCONCLUSIVE' : 'PASS') + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc);
  process.exit(fail ? 1 : inc ? 3 : 0);
})().catch(function (e) { log('§WPI-ERROR ' + e.stack); process.exit(2); });
