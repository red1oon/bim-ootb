#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-POST-MOVEMENT (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §60; sibling of W-POST-MATCHPO §53). READ THE LOG: §WPM lines; exit code is not evidence.
// THE ISSUE: does the twin post an Inventory Move (M_Movement, Doc_Movement) like legacy? Legacy (Doc_Movement.java:60-330): per line DR/CR P_Asset at cost (cost detail of the move line, else current cost),
//   FROM locator/ASI -qty, TO locatorTo/ASITo +qty; reversal lines copy the original; between-org + costing level Organization -> MCostDetail.createMovement; and Doc.postLogic :851-870 Fact.balanceSegments
//   books the OO-element IsBalanced Due-To/Due-From lines when the two locators sit in different orgs. Every M_Movement the pilot has Completed (population printed as N) is re-posted by the REAL DocManager
//   (oracle postdoc, rolled back) and by model_post, once with the client's own costing and once with every schema forced to Standard. Compared per document: status + Fact_Acct (schema, account, DR, CR, qty, product; the deployed oracle bundle returns no line id),
//   and (org, locator, line) per fact against the pilot's own stored Fact_Acct (the oracle's factRows carry no org/locator). Zero judged prints INCONCLUSIVE, never PASS.
//   Negative control: LMV_BREAK=nosegments (model_post skips balanceSegments) must turn every inter-org document red.
// Run: node erp/tests/witness_post_movement_diff.js  (pilot + oracle :8097; NODE_PATH=bim-ootb/tests/node_modules)
'use strict';
var fs = require('fs'), path = require('path'), http = require('http');
var ERP = path.join(__dirname, '..');
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js'); }
var TODAY = process.env.TODAY || new Date().toISOString().slice(0, 10), DAY = TODAY + ' 00:00:00';
var log = function (s) { console.log(s); }, pass = 0, fail = 0, inc = 0;
var ok = function (id, n, c, d) { log((c === null ? '  ⚠ ' : c ? '  ✅ ' : '  ❌ ') + id + ' ' + n + (d ? ' — ' + d : '')); c === null ? inc++ : c ? pass++ : fail++; };
function oracle(body) { return new Promise(function (res, rej) { var d = JSON.stringify(body), rq = http.request({ host: '127.0.0.1', port: 8097, method: 'POST', headers: { 'Content-Length': Buffer.byteLength(d) } }, function (r) { var b = ''; r.on('data', function (c) { b += c; }); r.on('end', function () { try { res(JSON.parse(b)); } catch (e) { rej(new Error(b.slice(0, 300))); } }); }); rq.on('error', rej); rq.end(d); }); }

var DOCS_Q = "SELECT m.m_movement_id AS id, CASE WHEN EXISTS (SELECT 1 FROM m_movementline l JOIN m_locator a ON a.m_locator_id=l.m_locator_id JOIN m_locator b ON b.m_locator_id=l.m_locatorto_id WHERE l.m_movement_id=m.m_movement_id AND a.ad_org_id<>b.ad_org_id) THEN 'INTERORG' ELSE 'SAMEORG' END AS dbt FROM m_movement m WHERE m.ad_client_id=11 AND m.docstatus IN ('CO','CL') ORDER BY 1";
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
    var trx = new ML.Trx(q, env()), doc = trx.get('m_movement', id);
    if (!doc) return { err: 'no document in the twin seed' };
    var why = null; trx.say = function (l) { if (/§MODEL-(POST|ERR|UNPORTED)/.test(l)) why = (why ? why + ' | ' : '') + String(l).slice(0, 200); };
    var res; try { res = P.post(trx, 'm_movement', doc, { repost: true }); } catch (e) { return { err: 'EXC ' + String(e).slice(0, 200) }; }
    var rows = trx.groupOps().filter(function (o) { return o && o.table === 'fact_acct' && o.op_type === 'CRUD_CREATE'; }).map(function (o) { var f = o.fields; return { s: Number(f.c_acctschema_id), a: Number(f.account_id), dr: r2(f.amtacctdr), cr: r2(f.amtacctcr), qty: r2(f.qty), p: Number(f.m_product_id || 0), l: Number(f.line_id || 0), o: Number(f.ad_org_id || 0), loc: Number(f.m_locator_id || 0) }; });
    var after = trx.get('m_movement', id);
    return { rows: rows, posted: res, why: why, status: after ? String(after.posted) : '?' };
  }
  // FIXTURE SYNC (the W-COSTING-SWEEP precedent): legacy posts from the pilot's M_Cost / M_CostDetail / M_CostHistory (its history of postings: the stock-coverage split of an AveragePO IPV reads the current cost qty);
  //   the seed's cost rows have not lived that history, so the twin is fed the SAME rows and the comparison judges the posting maths, not the drift.
  ['m_costelement', 'm_cost', 'm_costdetail', 'm_costhistory'].forEach(function (t) {
    var have = q('PRAGMA table_info(' + t + ')').map(function (c) { return c.name.toLowerCase(); }), rows = pgRows('SELECT * FROM ' + t + ' WHERE ad_client_id=11');
    db.run('DELETE FROM ' + t + ' WHERE ad_client_id=11');
    rows.forEach(function (r) { var ks = Object.keys(r).filter(function (k) { return have.indexOf(k) >= 0; }); db.run('INSERT INTO ' + t + ' (' + ks.join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')', ks.map(function (k) { return r[k]; })); });
    log('§WPM-SYNC ' + t + ' rows=' + rows.length + ' from the pilot (client 11)');
  });
  // FIXTURE SYNC: the twin seed holds ONE M_Movement; the pilot's Completed moves (documents + lines + material-policy MA) are copied in so the SAME documents are judged on both sides.
  ['m_locator', 'm_movement', 'm_movementline', 'm_movementlinema'].forEach(function (t) {
    var have = q('PRAGMA table_info(' + t + ')').map(function (c) { return c.name.toLowerCase(); }), rows = pgRows('SELECT * FROM ' + t + ' WHERE ad_client_id=11');
    db.run('DELETE FROM ' + t + ' WHERE ad_client_id=11');
    rows.forEach(function (r) { var ks = Object.keys(r).filter(function (k) { return have.indexOf(k) >= 0; }); db.run('INSERT INTO ' + t + ' (' + ks.join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')', ks.map(function (k) { return r[k]; })); });
    log('§WPM-SYNC ' + t + ' rows=' + rows.length + ' from the pilot (client 11)');
  });
  db.run("DELETE FROM fact_acct WHERE ad_table_id=323");
  var stored = {}; pgRows('SELECT record_id AS r, c_acctschema_id AS s, account_id AS a, ad_org_id AS o, COALESCE(m_locator_id,0) AS loc, COALESCE(line_id,0) AS l FROM fact_acct WHERE ad_table_id=323').forEach(function (f) { (stored[f.r] = stored[f.r] || []).push([f.s, f.a, f.o, f.loc, f.l].join(':')); });
  var INV = { docs: 0, sch: 0, org: 0, val: 0, sign: 0 };
  var key = function (f) { return [f.s, f.a, f.dr, f.cr, f.qty, f.p].join(':'); }, okey = function (f) { return [f.s, f.a, f.o, f.loc, f.l].join(':'); };
  var docs = pgRows(DOCS_Q), byType = {}; log('§WPM POPULATION N=' + docs.length + ' Completed M_Movement in the pilot (client 11); in the twin after sync=' + docs.filter(function (d) { return q('SELECT 1 AS x FROM m_movement WHERE m_movement_id=?', [d.id]).length > 0; }).length + ' inter-org=' + docs.filter(function (d) { return d.dbt === 'INTERORG'; }).length);
  var METHODS = [null, 'S'], orig = q('SELECT c_acctschema_id AS id, costingmethod AS m FROM c_acctschema WHERE ad_client_id=11');
  for (var mi = 0; mi < METHODS.length; mi++) {
    var M = METHODS[mi], tag = M ? 'forced-' + M : 'own';
    orig.forEach(function (o) { db.run('UPDATE c_acctschema SET costingmethod=? WHERE c_acctschema_id=?', [M || o.m, o.id]); });
    for (var di = 0; di < docs.length; di++) {
      var d = docs[di]; if (!q('SELECT 1 AS x FROM m_movement WHERE m_movement_id=?', [d.id]).length) continue;
      var req = { op: 'postdoc', table: 'M_Movement', ids: [d.id], facts: true, ctx: CTX }; if (M) req.costingMethod = M;
      var L = (await oracle(req)).docs[0], T = twinFacts(d.id), k = tag + ' ' + d.dbt;
      var bt = byType[k] || (byType[k] = { match: 0, judged: 0, diffs: [], facts: 0 });
      if (T.err) { bt.judged++; bt.diffs.push(d.id + ': twin ' + T.err); log('§WPM doc=' + d.id + ' ' + k + ' TWIN-ERR ' + T.err); continue; }
      var legSt = L.error != null ? 'E:' + String(L.error).slice(0, 60) : String(L.posted), lf = (L.factRows || []).map(function (f) { return { s: f.s, a: f.a, dr: r2(f.dr), cr: r2(f.cr), qty: r2(f.qty), p: f.p }; }).map(key).sort();
      var twSt = T.status, tf = T.rows.map(key).sort(); bt.facts += lf.length;
      if (T.rows.length) { var sch = {}, org = {}, ln = {}, qbad = 0; T.rows.forEach(function (f) { var d = Number(f.dr) - Number(f.cr); sch[f.s] = (sch[f.s] || 0) + d; org[f.s + '|' + f.o] = (org[f.s + '|' + f.o] || 0) + d; if (f.l) { ln[f.s + '|' + f.l] = (ln[f.s + '|' + f.l] || 0) + d; if ((Number(f.dr) > 0) !== (Number(f.qty) > 0)) qbad++; } });
        var bad = function (m) { return Object.keys(m).filter(function (k) { return Math.abs(m[k]) > 0.005; }).length; }; INV.docs++; INV.sch += bad(sch); INV.org += bad(org); INV.val += bad(ln); INV.sign += qbad; }
      var same = String(L.posted) === twSt && JSON.stringify(lf) === JSON.stringify(tf);
      if (!M && stored[d.id]) { var so = stored[d.id].slice().sort(), to = T.rows.map(okey).sort(), osame = JSON.stringify(so) === JSON.stringify(to); bt.ojudged = (bt.ojudged || 0) + 1; if (osame) bt.omatch = (bt.omatch || 0) + 1; else { bt.odiffs = (bt.odiffs || []).concat(d.id); log('§WPM-ORG doc=' + d.id + ' DIFF\n      stored: ' + so.join(' ') + '\n      twin:   ' + to.join(' ')); } } bt.judged++; if (same) bt.match++; else bt.diffs.push(d.id);
      log('§WPM doc=' + d.id + ' ' + k + ' ' + (same ? 'EQUAL' : 'DIFF') + ' legacy=' + legSt + '/' + lf.length + ' twin=' + twSt + '/' + tf.length + (same ? '' : '\n      legacy: ' + lf.join(' ') + '\n      twin:   ' + tf.join(' ') + (T.why ? '\n      why: ' + T.why.slice(-200) : '')));
    }
  }
  orig.forEach(function (o) { db.run('UPDATE c_acctschema SET costingmethod=? WHERE c_acctschema_id=?', [o.m, o.id]); });
  ['own INTERORG', 'own SAMEORG', 'forced-S INTERORG', 'forced-S SAMEORG'].forEach(function (t) { var v = byType[t]; if (!v) { log('§WPM NOTED class "' + t + '": no shared M_Movement of this class (the pilot has only inter-org moves) - not judged, not a pass'); return; }
    ok('T-' + t, t + ': twin status + Fact_Acct == legacy on ' + v.judged + ' of ' + v.judged + ' M_Movement (legacy fact rows ' + v.facts + ')', v.match === v.judged, v.diffs.slice(0, 6).join(' | '));
    if (v.ojudged) ok('T-ORG-' + t, t + ': (org, locator, line) of every fact == the pilot\'s stored Fact_Acct on ' + v.ojudged + ' documents', v.omatch === v.ojudged, (v.odiffs || []).slice(0, 6).join(' | ')); });
  log('§WPM-INV twin accounting on ' + INV.docs + ' fact sets: unbalanced schemas=' + INV.sch + ' unbalanced (schema,org)=' + INV.org + ' value-not-conserved lines=' + INV.val + ' qty-sign-vs-direction errors=' + INV.sign);
  ok('T-INV', 'twin facts balance per schema and per org, value is conserved per move line, qty sign follows direction (' + INV.docs + ' fact sets)', INV.docs ? (INV.sch + INV.org + INV.val + INV.sign === 0) : null, INV.docs ? '' : 'VACUOUS');
  var anyFacts = Object.keys(byType).some(function (k) { return byType[k].facts > 0; }), anySeg = Object.keys(byType).some(function (k) { return /INTERORG/.test(k) && byType[k].judged > 0; });
  ok('T-FACTS', 'legacy booked at least one fact (otherwise nothing is judged)', anyFacts ? true : null, anyFacts ? '' : 'VACUOUS: legacy booked 0 rows');
  ok('T-SEGMENTS', 'at least one inter-org move is judged (the balanceSegments Due-To/Due-From lines are exercised)', anySeg ? true : null, anySeg ? '' : 'no inter-org fixture shared - balanceSegments not judged');
  log('§WPM-SUMMARY ' + (fail ? 'FAIL' : (inc || !docs.length) ? 'INCONCLUSIVE' : 'PASS') + ' break=' + (process.env.LMV_BREAK || 'none') + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc);
  process.exit(fail ? 1 : inc ? 3 : 0);
})().catch(function (e) { log('§WPM-ERROR ' + e.stack); process.exit(2); });
