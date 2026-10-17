#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-COSTING-SWEEP (bim-compiler prompts/ERP_DEPTH_FILM.md §COSTING-SWEEP). READ THE LOG: §WCS lines; exit code is not evidence.
// THE ISSUE: do the twin's books for a document equal legacy's under each COSTING METHOD? For every document both dictionaries share (the GardenWorld demo
//   shipments/receipts, ids 100-108) the pilot re-posts it through the REAL DocManager inside a rolled-back trx with every schema forced to the method
//   (oracle op `postdoc` costingMethod+facts); the twin re-posts the same document with the same schema override through model_post. Compared per document:
//   the Fact_Acct lines (schema, account, Dr, Cr, qty, product). METHOD A is the harness CONTROL (the shipped GardenWorld method): if A differs the fixtures
//   have drifted and no other verdict is trusted (INCONCLUSIVE). Verdicts per method: MATCH x of N documents; DIFF lists the documents.
// Run: node tests/witness_costing_sweep.js [methods=A,S]  (cwd = bim-ootb/erp; pilot + oracle :8097 up)
'use strict';
var fs = require('fs'), path = require('path'), http = require('http');
var ERP = path.join(__dirname, '..');
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js'); }
var TODAY = process.env.TODAY || new Date().toISOString().slice(0, 10), DAY = TODAY + ' 00:00:00';
var log = function (s) { console.log(s); }, pass = 0, fail = 0, inc = 0;
var ok = function (id, n, c, d) { log((c === null ? '  ⚠ ' : c ? '  ✅ ' : '  ❌ ') + id + ' ' + n + (d ? ' — ' + d : '')); c === null ? inc++ : c ? pass++ : fail++; };
function oracle(body) { return new Promise(function (res, rej) { var d = JSON.stringify(body), rq = http.request({ host: '127.0.0.1', port: 8097, method: 'POST', headers: { 'Content-Length': Buffer.byteLength(d) } }, function (r) { var b = ''; r.on('data', function (c) { b += c; }); r.on('end', function () { try { res(JSON.parse(b)); } catch (e) { rej(new Error(b.slice(0, 300))); } }); }); rq.on('error', rej); rq.end(d); }); }
var METHODS = (process.argv[2] || 'A,S').split(','), DOCS = [100, 101, 102, 103, 104, 105, 106, 107, 108];
function pgRows(sql) { return JSON.parse(require('child_process').execFileSync('docker', ['exec', '-i', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'idempiere_pilot', '-tAq'], { input: "SET search_path=adempiere;\nSELECT coalesce(json_agg(t),'[]') FROM (" + sql + ') t', encoding: 'utf8', maxBuffer: 1 << 28 }).trim()); }
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
  function twinFacts(method, id) {
    db.run("UPDATE c_acctschema SET costingmethod=? WHERE ad_client_id=11", [method]);
    var trx = new ML.Trx(q, env()), doc = trx.get('m_inout', id);
    if (!doc) return { err: 'no document in the twin seed' };
    var why = null; trx.say = function (l) { if (/§MODEL-(POST|ERR|UNPORTED)/.test(l)) why = (why ? why + ' | ' : '') + String(l).slice(0, 200); };
    var res; try { res = P.post(trx, 'm_inout', doc, { repost: true }); } catch (e) { return { err: 'EXC ' + String(e).slice(0, 200) }; }
    var rows = trx.groupOps().filter(function (o) { return o && o.table === 'fact_acct' && o.op_type === 'CRUD_CREATE'; }).map(function (o) { var f = o.fields; return { s: Number(f.c_acctschema_id), a: Number(f.account_id), dr: r2(f.amtacctdr), cr: r2(f.amtacctcr), qty: r2(f.qty), p: Number(f.m_product_id || 0) }; });
    var nt = trx.groupOps().filter(function (o) { return o && o.table === 'ad_note' && o.op_type === 'CRUD_CREATE'; }).map(function (o) { return o.fields.textmsg; });
    return { rows: rows, posted: res, why: why, notes: nt };
  }
  // FIXTURE SYNC: the pilot's M_Cost / M_CostElement have lived through its posting history (average prices, quantities, elements added), the seed's have not.
  //   Legacy posts from ITS cost rows, so the twin is fed the SAME rows (the opts.factRows precedent) - the comparison then judges the posting maths, not the drift.
  (function () {
    ['m_costelement', 'm_cost', 'm_costdetail', 'm_costhistory'].forEach(function (t) {
      var have = q('PRAGMA table_info(' + t + ')').map(function (c) { return c.name.toLowerCase(); }), rows = pgRows('SELECT * FROM ' + t + ' WHERE ad_client_id=11');
      db.run('DELETE FROM ' + t + ' WHERE ad_client_id=11');
      rows.forEach(function (r) { var ks = Object.keys(r).filter(function (k) { return have.indexOf(k) >= 0; }); db.run('INSERT INTO ' + t + ' (' + ks.join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')', ks.map(function (k) { return r[k]; })); });
      log('§WCS-SYNC ' + t + ' rows=' + rows.length + ' from the pilot (client 11)');
    });
  })();
  var key = function (f) { return [f.s, f.a, f.dr, f.cr, f.qty, f.p].join(':'); };
  var verdicts = {};
  for (var mi = 0; mi < METHODS.length; mi++) {
    var m = METHODS[mi], match = 0, judged = 0, diffs = [];
    for (var di = 0; di < DOCS.length; di++) {
      var id = DOCS[di], L = (await oracle({ op: 'postdoc', table: 'M_InOut', ids: [id], facts: true, costingMethod: m, ctx: CTX })).docs[0], T = twinFacts(m, id);
      if (T.err) { diffs.push(id + ': twin ' + T.err); judged++; log('§WCS m=' + m + ' doc=' + id + ' TWIN-ERR ' + T.err); continue; }
      var legSt = L.error != null ? 'E' : String(L.posted), lf = legSt === 'Y' ? (L.factRows || []).map(function (f) { return { s: f.s, a: f.a, dr: r2(f.dr), cr: r2(f.cr), qty: r2(f.qty), p: f.p }; }).map(key).sort() : [];
      var twSt = T.rows.length ? 'Y' : /posted=E/.test(T.why || '') ? 'E' : /posted=N/.test(T.why || '') ? 'N' : '?', tf = T.rows.map(key).sort();
      var norm = function (t) { return String(t).replace(/Document No=[^ ]+/, 'Document No=#').replace(/Account Date=[0-9\/]+/, 'Account Date=#').replace(/-?\d+\.\d+|(?<=[=, ])-?\d+(?=[,)])/g, '#').replace(/\{\{opref:\d+\}\}/g, '#'); };
      var sumDr = function (a) { return a.filter(function (x) { return x.split(':')[0] === '101'; }).reduce(function (t, x) { return t + Number(x.split(':')[2]); }, 0).toFixed(2); };
      log('§WCS-FACT m=' + m + ' doc=' + id + ' status legacy=' + legSt + ' twin=' + twSt + ' schema101 Dr legacy=' + sumDr(lf) + ' twin=' + sumDr(tf));
      var legNote = L.notes && L.notes[0] ? norm(L.notes[0].text) : null, twNote = T.notes && T.notes[0] ? norm(T.notes[0]) : null;
      judged++; var same = legSt === twSt && JSON.stringify(lf) === JSON.stringify(tf) && (legSt === 'Y' || legNote === twNote); if (same) match++;
      else diffs.push(id + ' legacy=' + legSt + (L.error ? '(' + String(L.error).slice(0, 70) + ')' : '') + ' ' + lf.length + 'f  twin=' + twSt + ' ' + tf.length + 'f' + (T.why ? ' why=' + T.why.slice(-160) : ''));
      log('§WCS m=' + m + ' doc=' + id + ' ' + (same ? 'EQUAL' : 'DIFF') + ' legacy=' + legSt + '/' + lf.length + ' twin=' + twSt + '/' + tf.length + (same ? '' : (legNote !== twNote && legSt !== 'Y' ? '\n      note legacy: ' + legNote + '\n      note twin:   ' + twNote : '') + '\n      legacy: ' + lf.join(' ') + (L.error ? ' ERR ' + String(L.error).slice(0, 120) : '') + '\n      twin:   ' + tf.join(' ') + (T.why ? '\n      why: ' + T.why.slice(-200) : '')));
    }
    verdicts[m] = { match: match, judged: judged, diffs: diffs };
    log('§WCS-METHOD ' + m + ' MATCH ' + match + ' of ' + judged);
  }
  var ctl = verdicts.A;
  if (ctl && ctl.match !== ctl.judged) { ok('CONTROL', 'method A (the shipped GardenWorld method) reproduces legacy on the shared documents — else fixtures drifted', null, 'A ' + ctl.match + '/' + ctl.judged + ': ' + ctl.diffs.slice(0, 3).join(' | ')); }
  else if (ctl) ok('CONTROL', 'method A (control) ' + ctl.match + '/' + ctl.judged + ' documents equal legacy', true);
  METHODS.forEach(function (m) { if (m === 'A') return; var v = verdicts[m]; ok('M-' + m, 'method ' + m + ': twin books == legacy on ' + v.judged + ' shared documents', v.judged > 0 && v.match === v.judged, v.diffs.slice(0, 4).join(' | ')); });
  log('§WCS-SUMMARY ' + (fail ? 'FAIL' : inc ? 'INCONCLUSIVE' : 'PASS') + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc);
  process.exit(fail ? 1 : inc ? 3 : 0);
})().catch(function (e) { log('§WCS-ERROR ' + e.stack); process.exit(2); });
