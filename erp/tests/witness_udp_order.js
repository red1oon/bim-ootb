#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-UDP-ORDER (bim-compiler prompts/ERP_DEPTH_FILM.md §UDP-ORDER). READ THE LOG: §UDPO lines; exit code is not evidence.
// THE ISSUE: does a window's header tab list its rows in the ORDER legacy lists them? Legacy = the real GridTab in the pilot JVM (oracle op
//   `initialquery` with ids: getOrderByClause :1760-1789 + PostgreSQL's ORDER BY under the DB collation glibc en_US.utf8, NULLs last on ASC).
//   Twin = the same rows (pilot data, same WHERE) put through SQLite's ORDER BY (what the grid did) and then AdGridTab.sortRows (the fix).
//   Judge per window: legacy's id sequence must be in non-decreasing order under the twin's comparator (equal keys may legally swap) and
//   the sets equal. Reports how many windows SQLite's ORDER BY alone gets wrong (the defect) and how many sortRows gets right.
// Run: NODE_PATH=/home/red1/bim-compiler/node_modules node erp/tests/witness_udp_order.js   (pilot postgres + oracle up)
'use strict';
var fs = require('fs'), path = require('path'), cp = require('child_process'), http = require('http');
var ERP = path.join(__dirname, '..'), log = console.log, PGDB = process.env.UDPO_PG_DB || 'idempiere_pilot', MAXROWS = +(process.env.UDPO_MAXROWS || 20000);
var G = require(path.join(ERP, 'ad_gridtab.js')), ADP = require(path.join(ERP, 'ad_parser.js')), F = require(path.join(ERP, 'ad_find.js'));
var initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js'));
var LOGIN = { client: 11, org: 11, role: 102, user: 101, wh: 103 };
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
  fs.readFileSync(path.join(ERP, 'patches', 'ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) try { db.run(st); } catch (e) {} });
  var q1 = function (sql) { var e = db.exec(sql); return e.length ? e[0].values : []; };
  var role = q1('SELECT IsAccessAllOrgs FROM AD_Role WHERE AD_Role_ID=' + LOGIN.role)[0] || ['N'];
  var showAdv = (q1('SELECT IsAccessAdvanced FROM AD_Role WHERE AD_Role_ID=' + LOGIN.role)[0] || ['N'])[0] === 'Y' ? 'Y' : 'N';   // the twin's #ShowAdvanced
  var orgs = pgRows('SELECT ad_org_id FROM ad_role_orgaccess WHERE ad_role_id=' + LOGIN.role + " AND isactive='Y'").map(function (r) { return r.ad_org_id; });
  var orgClause = role[0] === 'Y' ? null : 'AD_Org_ID IN (' + [0].concat(orgs).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(',') + ')';
  var pilotWin = {}; pgRows("SELECT ad_window_id FROM ad_window WHERE isactive='Y'").forEach(function (w) { pilotWin[w.ad_window_id] = 1; });
  var wins = q1("SELECT AD_Window_ID, WindowType, IsSOTrx FROM AD_Window WHERE IsActive='Y' ORDER BY AD_Window_ID").filter(function (w) { return pilotWin[w[0]]; });
  if (process.env.UDPO_WINDOWS) wins = wins.slice(0, +process.env.UDPO_WINDOWS);
  var R = { judged: 0, okFix: 0, okSqlite: 0, exact: 0, expr: [], bad: [], noAccess: 0, big: 0, lt2: 0 };
  var colTypes = {}, typesOf = function (tn) { if (!colTypes[tn]) { colTypes[tn] = {}; pgRows("SELECT lower(column_name) c, data_type d FROM information_schema.columns WHERE table_schema='adempiere' AND table_name='" + tn.toLowerCase() + "'").forEach(function (x) { colTypes[tn][x.c] = x.d; }); } return colTypes[tn]; };
  for (var wi = 0; wi < wins.length; wi++) {
    var wid = wins[wi][0], isTx = wins[wi][1] === 'T';
    var win; try { win = ADP.getWindow(db, wid); } catch (e) { win = null; }
    if (!win || !win.tabs || !win.tabs.length) continue;
    var tab = win.tabs[0], tn = tab.tableName, tm = G.open(db, win.tabs, 0), types = typesOf(tn);
    var key = tm.keyColumn && types[tm.keyColumn.toLowerCase()] ? tm.keyColumn : (types[(tn + '_UU').toLowerCase()] ? tn + '_UU' : null);   // a UU-keyed table / view: its _UU
    if (!key) { R.noIdentity = (R.noIdentity || []).concat([wid + ' ' + tn]); continue; }
    var o = await oracle({ op: 'initialquery', window: wid, ids: true, idColumn: key, ctx: LOGIN });
    if (!o.ok) { R.noAccess++; continue; }
    if (!o.ids || o.ids.length < 2) { R.lt2++; continue; }
    if (o.ids.indexOf('-1') >= 0 || o.ids.indexOf('null') >= 0) { R.noIdentity = (R.noIdentity || []).concat([wid + ' ' + tn + ' (no ' + key + ' field in the tab: GridTab.getKeyID=-1)']); continue; }
    if (o.ids.length > MAXROWS) { R.big++; continue; }
    var ctx = { '#AD_Client_ID': LOGIN.client, '#AD_Org_ID': LOGIN.org, '#AD_Role_ID': LOGIN.role, '#AD_User_ID': LOGIN.user, '#M_Warehouse_ID': LOGIN.wh, IsSOTrx: wins[wi][2] || 'Y', '#ShowAdvanced': showAdv };
    var access = []; if (types.ad_client_id) access.push('AD_Client_ID IN (0,' + LOGIN.client + ')'); if (orgClause && types.ad_org_id) access.push(orgClause);
    var gq = G.query(tm, function (n) { return ctx[n] != null ? ctx[n] : (ctx['#' + n] != null ? ctx['#' + n] : null); }, access);
    var where = [gq.where, isTx && types.processed && types.updated ? "(Processed='N' OR Updated>getDate()-1)" : null].filter(Boolean).join(' AND ');
    var sortFields = q1('SELECT c.ColumnName, f.SortNo FROM AD_Field f JOIN AD_Column c ON c.AD_Column_ID=f.AD_Column_ID WHERE f.AD_Tab_ID=' + tab.id + " AND f.IsActive='Y' AND c.IsActive='Y' ORDER BY f.SeqNo, f.IsDisplayed DESC").map(function (r) { return { columnName: r[0], sortNo: r[1] }; });
    var ob = G.orderByOf(gq.orderBy || '', sortFields, isTx, false);

    // the order columns (plain ones) + key, from the pilot, typed as the twin's seed holds them (timestamps as text with milliseconds)
    var plain = ob.split(',').map(function (t) { var m = /^\s*(?:[A-Za-z0-9_]+\.)?([A-Za-z0-9_]+)/.exec(t); return m ? m[1].toLowerCase() : null; }).filter(function (c) { return c && types[c]; });
    var cols = [key.toLowerCase()].concat(plain.filter(function (c) { return c !== key.toLowerCase(); }));
    var data;
    try { data = pgRows('SELECT ' + cols.map(function (c) { return /timestamp|date/.test(types[c]) ? "to_char(\"" + c + "\",'YYYY-MM-DD HH24:MI:SS.US') AS \"" + c + '"' : '"' + c + '"'; }).join(',') + ' FROM ' + tn + ' WHERE ' + where); }
    catch (e) { R.bad.push('window ' + wid + ' ' + tn + ' pilot read failed ' + (String(e.message).split('\n').filter(function (l) { return /ERROR/.test(l); })[0] || String(e.message).split('\n')[0])); continue; }
    var sdb = new SQL.Database();
    sdb.run('CREATE TABLE ' + tn + ' (' + cols.map(function (c) { return '"' + c + '"' + (/numeric|integer|bigint|double/.test(types[c]) ? ' NUMERIC' : ' TEXT'); }).join(',') + ')');
    var st = sdb.prepare('INSERT INTO ' + tn + ' VALUES (' + cols.map(function () { return '?'; }).join(',') + ')');
    data.forEach(function (r) { st.run(cols.map(function (c) { return r[c] == null ? null : r[c]; })); }); st.free();
    var e1; try { e1 = sdb.exec('SELECT * FROM ' + tn + ' ORDER BY ' + ob); } catch (er) { R.expr.push('window ' + wid + ' ' + tn + ' ORDER BY ' + ob + ' :: ' + er.message); sdb.close(); continue; }
    sdb.close();
    var rows = e1.length ? e1[0].values.map(function (v) { var o2 = {}; e1[0].columns.forEach(function (c, i) { o2[c] = v[i]; }); return o2; }) : [];
    var sqliteIds = rows.map(function (r) { return String(r[key.toLowerCase()]); });
    var srt = G.sortRows(rows, ob, F.collate), twinIds = srt.rows.map(function (r) { return String(r[key.toLowerCase()]); });
    if (!srt.applied) R.expr.push('window ' + wid + ' ' + tn + ' ORDER BY ' + ob + ' (expression: SQLite order kept)');
    // judge: legacy's sequence is ordered under the twin comparator, sets equal
    var byId = {}; srt.rows.forEach(function (r) { byId[String(r[key.toLowerCase()])] = r; });
    var rc = G.rowComparator(ob, F.collate);
    var seqOk = function (ids) {
      if (!rc.cmp) return null;
      for (var i = 1; i < ids.length; i++) if (rc.cmp(byId[ids[i - 1]], byId[ids[i]]) > 0) return 'inversion at ' + (i - 1) + ': ' + JSON.stringify(byId[ids[i - 1]]) + ' > ' + JSON.stringify(byId[ids[i]]);
      return null;
    };
    var leg = o.ids.map(String);
    R.judged++;
    var setSame = leg.slice().sort().join() === twinIds.slice().sort().join();
    var inv = setSame && leg.every(function (i) { return byId[i]; }) ? seqOk(leg) : 'set differs legacy=' + leg.length + ' twin=' + twinIds.length;
    if (!inv) R.okFix++; else R.bad.push('window ' + wid + ' ' + tn + ' ORDER BY ' + ob + ' :: ' + inv);
    if (sqliteIds.join() === leg.join()) R.okSqlite++;
    if (twinIds.join() === leg.join()) R.exact++;
  }
  var show = +(process.env.UDPO_SHOW || 12);
  R.bad.slice(0, show).forEach(function (l) { log('§UDPO DIFF ' + l.slice(0, 400)); });
  R.expr.slice(0, show).forEach(function (l) { log('§UDPO EXPR ' + l.slice(0, 300)); });
  log('§UDPO windows judged=' + R.judged + ' (no access=' + R.noAccess + ', <2 rows=' + R.lt2 + ', >' + MAXROWS + ' rows=' + R.big + ', no key or UU column to identify rows=' + (R.noIdentity || []).length + ' [' + (R.noIdentity || []).join('; ') + '])');
  log('§UDPO SQLite ORDER BY alone (the grid before the fix) gives legacy\'s exact sequence on ' + R.okSqlite + '/' + R.judged + ' windows');
  log('§UDPO twin sortRows: legacy order respected on ' + R.okFix + '/' + R.judged + ' (exact sequence ' + R.exact + '/' + R.judged + '; the rest differ only inside equal keys)');
  if (!R.judged) { log('§UDPO-VERDICT INCONCLUSIVE nothing judged'); process.exitCode = 3; return; }
  log('§UDPO-VERDICT ' + (R.okFix === R.judged ? 'PASS' : 'FAIL') + ' ' + R.okFix + '/' + R.judged);
  if (R.okFix !== R.judged) process.exitCode = 1;
})().catch(function (e) { log('§UDPO-VERDICT INCONCLUSIVE ' + (e.stack || e)); process.exitCode = 3; });
