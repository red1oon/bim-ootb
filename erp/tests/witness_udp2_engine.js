#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-UDP2-ENGINE (bim-compiler prompts/ERP_DEPTH_FILM.md §UDP-2). READ THE LOG: §UDP2E lines; exit code is not evidence.
// THE ISSUES:
//   A. Does the twin's Saved Parameter / Last Run list (AdProcess.pinstanceList) equal the REAL MPInstance.get for every
//      (process,user,client) that has runs on the pilot - same entries, same order, same labels? Oracle = the OSGi bundle
//      op `pinstances` (scripts/pilot/oracle, :8097) calling MPInstance.get inside the running legacy server.
//   B. Does a stored parameter set survive the twin's load (parasToParams = loadParameters) and save (paramsToParas =
//      saveParameters) unchanged, for every parameter row on the pilot, against the SEED's process dictionary?
//      (SeqNo is NOT compared: the pilot's rows come from the server-side writer, SeqNo = AD_Process_Para.SeqNo; the ZK dialog
//      writes the field INDEX, ProcessParameterPanel.java:919 - the twin dialog follows ZK. It only orders paramsStr.)
// Run: NODE_PATH=/home/red1/bim-compiler/node_modules node erp/tests/witness_udp2_engine.js   (pilot postgres + oracle up)
'use strict';
var fs = require('fs'), path = require('path'), cp = require('child_process'), http = require('http');
var ERP = path.join(__dirname, '..'), log = console.log, PGDB = process.env.UDP2_PG_DB || 'idempiere_pilot';
var A = require(path.join(ERP, 'ad_process.js')), Database = require('better-sqlite3');
function psql(sql) {
  return cp.execFileSync('docker', ['exec', '-i', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', PGDB, '-tAq'],
    { input: 'SET search_path=adempiere;\n' + sql, encoding: 'utf8', maxBuffer: 256 << 20 }).trim();
}
function pgRows(sql) { return JSON.parse(psql("SELECT coalesce(json_agg(t),'[]') FROM (" + sql + ') t')); }
function oracle(body) {
  return new Promise(function (res, rej) {
    var data = JSON.stringify(body), rq = http.request({ host: '127.0.0.1', port: 8097, method: 'POST', headers: { 'Content-Length': Buffer.byteLength(data) } }, function (r) {
      var b = ''; r.on('data', function (c) { b += c; }); r.on('end', function () { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
    });
    rq.on('error', rej); rq.setTimeout(60000, function () { rq.destroy(new Error('oracle timeout')); }); rq.end(data);
  });
}
(async function () {
  if (typeof A.pinstanceList !== 'function') { log('§UDP2E-VERDICT FAIL AdProcess.pinstanceList absent (no Saved Parameter engine)'); process.exitCode = 1; return; }
  var T = function (cols) { return cols.split(',').map(function (c) { c = c.trim(); return c + '::text AS ' + c; }).join(','); };
  var PI = pgRows('SELECT ' + T('ad_pinstance_id, ad_process_id, ad_user_id, ad_client_id, name, isactive, created, ad_language_id, ad_printformat_id, reporttype, issummary') + ' FROM ad_pinstance');
  var PP = pgRows('SELECT ' + T('ad_pinstance_id, seqno, parametername, p_string, p_string_to, p_number, p_number_to, p_date, p_date_to, info, info_to') + ' FROM ad_pinstance_para');
  var isRep = {}; pgRows("SELECT ad_process_id::text id FROM ad_process WHERE isreport='Y'").forEach(function (x) { isRep[x.id] = true; });
  var lr = pgRows("SELECT ad_client_id::text c, value FROM ad_sysconfig WHERE name='LASTRUN_RECORD_COUNT' AND isactive='Y'"), lrN = {}; lr.forEach(function (x) { lrN[x.c] = +x.value; });
  var msg = psql("SELECT msgtext FROM ad_message WHERE value='LastRun'");
  log('§UDP2E pilot runs=' + PI.length + ' paras=' + PP.length + ' LASTRUN_RECORD_COUNT=' + JSON.stringify(lrN) + ' msg="' + msg + '"');

  // A. list == MPInstance.get, per group
  var groups = {}; PI.forEach(function (i) { groups[i.ad_process_id + '/' + i.ad_user_id + '/' + i.ad_client_id] = 1; });
  var keys = Object.keys(groups).sort(), same = 0, bad = [], nonEmpty = 0, roleOf = {}, orgOf = {}, tieOnly = [];
  pgRows("SELECT ad_client_id::text c, min(ad_role_id) r FROM ad_role WHERE isactive='Y' GROUP BY ad_client_id").forEach(function (x) { roleOf[x.c] = x.r; });
  pgRows("SELECT ad_client_id::text c, min(ad_org_id) o FROM ad_org WHERE isactive='Y' AND issummary='N' AND ad_org_id>0 GROUP BY ad_client_id").forEach(function (x) { orgOf[x.c] = x.o; });
  roleOf['11'] = 102; orgOf['11'] = 11;   // GardenWorld: GardenWorld Admin / HQ (the oracle's own default login)
  for (var gi = 0; gi < keys.length; gi++) {
    var k = keys[gi].split('/'), proc = +k[0], user = +k[1], client = +k[2];
    var role = roleOf[client] != null ? roleOf[client] : 0, org = orgOf[client] != null ? orgOf[client] : 0;
    var o = await oracle({ op: 'pinstances', process: proc, ctx: { client: client, user: user, org: org, role: role } });
    if (!o.ok) { bad.push(keys[gi] + ' ORACLE-ERROR ' + o.error); continue; }
    var want = o.list.map(function (x) { return x.id + ':' + x.name; });
    var got = A.pinstanceList(PI, PP, { processId: proc, userId: user, clientId: client, isReport: !!isRep[k[0]],
      lastRunCount: lrN[k[2]] != null ? lrN[k[2]] : lrN['0'] != null ? lrN['0'] : 5, lastRunMsg: msg }).map(function (x) { return x.id + ':' + x.name; });
    if (want.length) nonEmpty++;
    if (want.join(',') === got.join(',')) { same++; continue; }
    // legacy sorts ORDER BY Created DESC only: rows with an EQUAL Created come back in heap order (undefined). Re-run the twin with the
    // tie order Java happened to use; equal then = the same algorithm, the difference is legacy's own indeterminism (counted apart).
    var jpos = {}; o.list.forEach(function (x, i) { jpos[String(x.id)] = i; });
    var opt2 = { processId: proc, userId: user, clientId: client, isReport: !!isRep[k[0]], lastRunCount: lrN[k[2]] != null ? lrN[k[2]] : lrN['0'] != null ? lrN['0'] : 5, lastRunMsg: msg,
      tieKey: function (r) { var p = jpos[String(r.ad_pinstance_id)]; return p != null ? p : 1e9 + Number(r.ad_pinstance_id); } };
    var got2 = A.pinstanceList(PI, PP, opt2).map(function (x) { return x.id + ':' + x.name; });
    if (got2.join(',') === want.join(',')) { same++; tieOnly.push(keys[gi]); }
    else bad.push(keys[gi] + ' java=[' + want.join(',') + '] twin=[' + got.join(',') + ']');
  }
  bad.slice(0, 6).forEach(function (l) { log('§UDP2E A-DIFF ' + l); });
  log('§UDP2E A groups=' + keys.length + ' nonEmpty=' + nonEmpty + ' same=' + same + ' (of which equal only under the tie order legacy happened to use - rows with an identical Created, PG heap order: ' + tieOnly.length + ' [' + tieOnly.join(' ') + '])');

  // B. load -> save round trip against the SEED dictionary (readProcess = what the twin dialog renders)
  var seed = new Database(path.join(ERP, 'ad_seed.db'), { readonly: true }), byInst = {}, judgedB = 0, okB = 0, badB = [], noProc = 0;
  PP.forEach(function (p) { (byInst[p.ad_pinstance_id] = byInst[p.ad_pinstance_id] || []).push(p); });
  var procOf = {}; PI.forEach(function (i) { procOf[i.ad_pinstance_id] = i.ad_process_id; });
  var pilotField = {}, notField = 0; pgRows("SELECT ad_process_id::text p, columnname c FROM ad_process_para WHERE isactive='Y'").forEach(function (x) { pilotField[x.p + '/' + x.c] = 1; });
  // the VALUE a field ends up holding: legacy loadParameters reads P_Date, else P_String, else a non-zero P_Number (a server-side writer may
  // have stored a date as P_String - the dialog's re-save then writes P_Date: same value, so compare the value, not the column)
  var val = function (p, to) { var d = to ? p.p_date_to : p.p_date, st = to ? p.p_string_to : p.p_string, n = to ? p.p_number_to : p.p_number;
    if (d != null) return 'v:' + String(d).slice(0, 10); if (st != null) return 'v:' + (/^\d{4}-\d{2}-\d{2}/.test(st) ? st.slice(0, 10) : st); if (n != null && Number(n) !== 0) return 'v:' + Number(n); return 'v:null'; };
  var num = function (x) { return x == null ? null : Number(x); }, day = function (x) { return x == null ? null : String(x).slice(0, 10); };
  Object.keys(byInst).forEach(function (iid) {
    var proc; try { proc = A.readProcess(seed, +procOf[iid]); } catch (e) { noProc++; return; }
    var rows = byInst[iid], info = {};
    rows.forEach(function (r) { info[r.parametername] = { v: r.info, vTo: r.info_to }; });
    proc.paras.forEach(function (pp) { if (!pp.isRange && info[pp.columnName]) info[pp.columnName] = info[pp.columnName].v; });
    var back = A.paramsToParas(proc, A.parasToParams(proc, rows), info), bk = {};
    back.forEach(function (r) { bk[r.parametername] = r; });
    rows.forEach(function (r) {
      if (!pilotField[procOf[iid] + '/' + r.parametername]) { notField++; return; }   // loadParameters walks the FIELDS; a row naming no field is ignored by legacy too
      judgedB++;
      var b = bk[r.parametername], why = [];
      if (!b) why.push('lost');
      else {
        if (val(r) !== val(b)) why.push('value ' + val(r) + '->' + val(b));
        if (val(r, 1) !== val(b, 1)) why.push('value_to ' + val(r, 1) + '->' + val(b, 1));
      }
      if (why.length) badB.push('inst=' + iid + ' proc=' + procOf[iid] + ' ' + r.parametername + ': ' + why.join('; ')); else okB++;
    });
  });
  badB.slice(0, +(process.env.UDP2_SHOW || 8)).forEach(function (l) { log('§UDP2E B-DIFF ' + l); });
  log('§UDP2E B para rows judged=' + judgedB + ' roundtrip-same=' + okB + ' differ=' + badB.length + ' (rows naming no field of the process, ignored by legacy too: ' + notField + '; runs whose process is not in the seed: ' + noProc + ')');

  if (!keys.length || !nonEmpty || !judgedB) { log('§UDP2E-VERDICT INCONCLUSIVE nothing judged'); process.exitCode = 3; return; }
  if (same === keys.length && okB === judgedB) log('§UDP2E-VERDICT PASS A ' + same + '/' + keys.length + ' groups == MPInstance.get · B ' + okB + '/' + judgedB + ' para rows round-trip');
  else { log('§UDP2E-VERDICT FAIL A ' + same + '/' + keys.length + ' · B ' + okB + '/' + judgedB); process.exitCode = 1; }
})().catch(function (e) { log('§UDP2E-VERDICT INCONCLUSIVE ' + (e.stack || e)); process.exitCode = 3; });
