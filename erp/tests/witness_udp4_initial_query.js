#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-UDP4-ENGINE (bim-compiler prompts/ERP_DEPTH_FILM.md §UDP-4). READ THE LOG: §UDP4E lines; exit code is not evidence.
// THE ISSUES, for EVERY window both dictionaries have (X of N), logged in as GardenAdmin on the pilot data:
//   A. Does the twin decide what legacy decides when the window opens - only-current-rows (transaction window) and Find-first
//      (high volume, or too many rows) - AdGridTab.initialDecision over the SEED dictionary vs the REAL GridWindow/GridTab
//      (oracle op `initialquery`, AbstractADWindowContent :416-422 + initialQuery :899-991)?
//   B. For each transaction window whose header table has rows: are the header rows the twin's initial WHERE selects (tab WhereClause
//      parsed with the login context + client/org access + the only-current clause, run on the pilot DB) EXACTLY the rows the real
//      GridTab selects (GridTable :437-446 through the real classes)?
//   INCONCLUSIVE if nothing judged.
// Run: NODE_PATH=/home/red1/bim-compiler/node_modules node erp/tests/witness_udp4_initial_query.js   (pilot postgres + oracle up)
'use strict';
var fs = require('fs'), path = require('path'), cp = require('child_process'), http = require('http');
var ERP = path.join(__dirname, '..'), log = console.log, PGDB = process.env.UDP4_PG_DB || 'idempiere_pilot';
var G = require(path.join(ERP, 'ad_gridtab.js')), ADP = require(path.join(ERP, 'ad_parser.js'));
var initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js'));
var LOGIN = process.env.UDP4_LOGIN === 'system' ? { client: 0, org: 0, role: 0, user: 100, wh: 0 } : { client: 11, org: 11, role: 102, user: 101, wh: 103 };   // GardenAdmin, or System (UDP4_LOGIN=system)
function psql(sql) {
  return cp.execFileSync('docker', ['exec', '-i', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', PGDB, '-tAq'],
    { input: 'SET search_path=adempiere;\n' + sql, encoding: 'utf8', maxBuffer: 1 << 30 }).trim();
}
function pgRows(sql) { return JSON.parse(psql("SELECT coalesce(json_agg(t),'[]') FROM (" + sql + ') t')); }
function oracle(body) {
  return new Promise(function (res, rej) {
    var data = JSON.stringify(body), rq = http.request({ host: '127.0.0.1', port: 8097, method: 'POST', headers: { 'Content-Length': Buffer.byteLength(data) } }, function (r) {
      var b = ''; r.on('data', function (c) { b += c; }); r.on('end', function () { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
    });
    rq.on('error', rej); rq.setTimeout(180000, function () { rq.destroy(new Error('oracle timeout')); }); rq.end(data);
  });
}
(async function () {
  var SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ERP, 'sqljs', 'sql-wasm.wasm')) }), db = new SQL.Database(fs.readFileSync(path.join(ERP, 'ad_seed.db')));
  var ok = 0, bad = 0;
  fs.readFileSync(path.join(ERP, 'patches', 'ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); ok++; } catch (e) { bad++; } });
  var q1 = function (sql) { var e = db.exec(sql); return e.length ? e[0].values : []; };
  var gmax = (q1("SELECT value FROM ad_sysconfig WHERE name='GLOBAL_MAX_QUERY_RECORDS' AND ad_client_id IN (0," + LOGIN.client + ") ORDER BY ad_client_id DESC")[0] || [null])[0];
  var role = (q1('SELECT MaxQueryRecords, ConfirmQueryRecords, IsAccessAllOrgs FROM AD_Role WHERE AD_Role_ID=' + LOGIN.role)[0]) || [0, 0, 'N'];
  log('§UDP4E seed-as-loaded patch ok=' + ok + ' failed=' + bad + ' GLOBAL_MAX_QUERY_RECORDS=' + gmax + ' role ' + LOGIN.role + ' max=' + role[0] + ' confirm=' + role[1] + ' allOrgs=' + role[2]);
  // the login's org access on the PILOT (the data is the pilot's): MRole org access list
  var orgs = pgRows('SELECT ad_org_id FROM ad_role_orgaccess WHERE ad_role_id=' + LOGIN.role + " AND isactive='Y'").map(function (r) { return r.ad_org_id; });
  var orgClause = role[2] === 'Y' ? null : 'AD_Org_ID IN (' + [0].concat(orgs).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(',') + ')';
  var pilotWin = {}; pgRows("SELECT ad_window_id FROM ad_window WHERE isactive='Y'").forEach(function (w) { pilotWin[w.ad_window_id] = 1; });
  var wins = q1("SELECT AD_Window_ID, WindowType, IsSOTrx FROM AD_Window WHERE IsActive='Y' ORDER BY AD_Window_ID").filter(function (w) { return pilotWin[w[0]]; });
  if (process.env.UDP4_WINDOWS) wins = wins.slice(0, +process.env.UDP4_WINDOWS);
  log('§UDP4E windows in both dictionaries=' + wins.length);
  var A = { judged: 0, same: 0, bad: [], oracleErr: [] }, B = { judged: 0, same: 0, bad: [], empty: 0, noProcessed: [] };
  var colsOf = {}, pgCols = function (tn) { if (!colsOf[tn]) { colsOf[tn] = {}; pgRows("SELECT lower(column_name) c FROM information_schema.columns WHERE table_schema='adempiere' AND table_name='" + tn.toLowerCase() + "'").forEach(function (x) { colsOf[tn][x.c] = 1; }); } return colsOf[tn]; };
  for (var wi = 0; wi < wins.length; wi++) {
    var wid = wins[wi][0], isTx = wins[wi][1] === 'T', isSO = wins[wi][2] || 'Y';
    var win; try { win = ADP.getWindow(db, wid); } catch (e) { win = null; }
    if (!win || !win.tabs || !win.tabs.length) continue;
    var tab = win.tabs[0], tn = tab.tableName, tm = G.open(db, win.tabs, 0);
    var hv = (q1("SELECT COALESCE(t.IsHighVolume, tb.IsHighVolume) FROM AD_Tab t JOIN AD_Table tb ON tb.AD_Table_ID=t.AD_Table_ID WHERE t.AD_Tab_ID=" + tab.id)[0] || ['N'])[0] === 'Y';
    var tabMax = (q1('SELECT MaxQueryRecords FROM AD_Tab WHERE AD_Tab_ID=' + tab.id)[0] || [0])[0];
    var ctx = { '#AD_Client_ID': LOGIN.client, '#AD_Org_ID': LOGIN.org, '#AD_Role_ID': LOGIN.role, '#AD_User_ID': LOGIN.user, '#M_Warehouse_ID': LOGIN.wh, IsSOTrx: isSO, '#Date': new Date().toISOString().slice(0, 10) };
    var cols = pgCols(tn), access = [];
    if (cols.ad_client_id) access.push('AD_Client_ID IN (0,' + LOGIN.client + ')');
    if (orgClause && cols.ad_org_id) access.push(orgClause);
    var gq = G.query(tm, function (n) { return ctx[n] != null ? ctx[n] : (ctx['#' + n] != null ? ctx['#' + n] : null); }, access);
    var countAll = function () { try { return +psql('SELECT count(*) FROM ' + tn + (gq.where ? ' WHERE ' + gq.where : '')); } catch (e) { return -1; } };
    var dec = G.initialDecision({ isTransaction: isTx, isHighVolume: hv, tabMax: tabMax, roleMax: role[0], globalMax: gmax, roleConfirm: role[1], countAll: countAll });
    var o = await oracle({ op: 'initialquery', window: wid, ids: isTx, ctx: { client: LOGIN.client, org: LOGIN.org, role: LOGIN.role, user: LOGIN.user, wh: LOGIN.wh } });
    if (!o.ok && /^no window/.test(o.error)) { A.noAccess = (A.noAccess || 0) + 1; continue; }   // GridWindow.get refuses: this login has no access (judged in the other login's pass)
    if (!o.ok) { A.oracleErr.push(wid + ' ' + tn + ' ' + String(o.error).slice(0, 160)); continue; }
    A.judged++;
    if (o.isTransaction === dec.onlyCurrentRows && o.findFirst === dec.findFirst) A.same++;
    else A.bad.push('window ' + wid + ' ' + tn + ' java={tx:' + o.isTransaction + ',hv:' + o.isHighVolume + ',find:' + o.findFirst + ',n:' + o.countAll + ',max:' + o.maxQuery + '} twin={tx:' + dec.onlyCurrentRows + ',hv:' + hv + ',find:' + dec.findFirst + ',n:' + dec.countAll + '}');
    if (isTx && o.ids) {
      if (!cols.processed || !cols.updated) { B.noProcessed.push(wid + ' ' + tn); continue; }
      if (!o.ids.length) { B.empty++; }
      var where = [gq.where, G.onlyCurrentClause('pg')].filter(Boolean).join(' AND '), tw;
      try { tw = psql('SELECT ' + tn + '_ID FROM ' + tn + ' WHERE ' + where).split('\n').filter(Boolean).sort(); } catch (e) { tw = ['ERR ' + String(e.message).split('\n')[0]]; }
      B.judged++;
      var lg = o.ids.slice().sort();
      if (tw.join() === lg.join()) B.same++; else B.bad.push('window ' + wid + ' ' + tn + ' legacy=' + lg.length + ' twin=' + tw.length + ' twinWhere=' + where + (tw[0] && /^ERR/.test(tw[0]) ? ' ' + tw[0] : ''));
    }
  }
  var show = +(process.env.UDP4_SHOW || 10);
  A.bad.slice(0, show).forEach(function (l) { log('§UDP4E A-DIFF ' + l); });
  A.oracleErr.slice(0, show).forEach(function (l) { log('§UDP4E A-ORACLE-ERROR ' + l); });
  B.bad.slice(0, show).forEach(function (l) { log('§UDP4E B-DIFF ' + l.slice(0, 700)); });
  if (B.noProcessed.length) log('§UDP4E B transaction windows whose header table has no Processed/Updated column (legacy appends the clause anyway): ' + B.noProcessed.join(', '));
  log('§UDP4E A open decision: windows=' + A.judged + ' same=' + A.same + ' (no access for this login: ' + (A.noAccess || 0) + ', oracle error: ' + A.oracleErr.length + ')');
  log('§UDP4E B transaction-window header rows: windows=' + B.judged + ' same=' + B.same + ' (of which legacy shows 0 rows: ' + B.empty + ')');
  log('§UDP4E login=' + JSON.stringify(LOGIN));
  if (!A.judged || (!B.judged && LOGIN.client !== 0)) { log('§UDP4E-VERDICT INCONCLUSIVE nothing judged'); process.exitCode = 3; return; }
  var pass = A.same === A.judged && B.same === B.judged && A.oracleErr.length === 0;
  log('§UDP4E-VERDICT ' + (pass ? 'PASS' : 'FAIL') + ' A ' + A.same + '/' + A.judged + ' · B ' + B.same + '/' + B.judged);
  if (!pass) process.exitCode = 1;
})().catch(function (e) { log('§UDP4E-VERDICT INCONCLUSIVE ' + (e.stack || e)); process.exitCode = 3; });
