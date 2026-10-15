#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-UDP3-ENGINE (bim-compiler prompts/ERP_DEPTH_FILM.md §UDP-3). READ THE LOG: §UDP3E lines; exit code is not evidence.
// THE ISSUES:
//   A. Does the twin pick the SAME Simple-tab fields as legacy (initFind) for every header tab - twin dictionary (seed) vs the pilot's?
//   B. Does a Simple query built by the twin (AdFind.simpleQuery) select EXACTLY the records legacy selects? Values come from a REAL pilot
//      row of each tab; legacy = the same restrictions rebuilt through the REAL MQuery in the pilot JVM (oracle op `findquery`), run on the
//      pilot DB. The twin's WHERE runs twice: PG dialect on the pilot DB, SQLite dialect on a sql.js copy of the same rows.
//   C. Advanced rows (every operator, AND / OR / AND NOT / OR NOT, brackets) - same id-set judge, Code-shaped rows into both.
//   D. AD_UserQuery.Code round-trips byte-equal through parseCode/codeOf (the pilot's own rows + every query built in B/C).
//   Denominator = header tabs (TabLevel 0) of windows both dictionaries have. INCONCLUSIVE if nothing judged.
// Run: NODE_PATH=/home/red1/bim-compiler/node_modules node erp/tests/witness_udp3_find_engine.js   (pilot postgres + oracle up)
//   UDP3_TABS=n caps the tab count (default all); UDP3_MAXROWS skips tables bigger than that (default 200000).
'use strict';
var fs = require('fs'), path = require('path'), cp = require('child_process'), http = require('http');
var ERP = path.join(__dirname, '..'), log = console.log, PGDB = process.env.UDP3_PG_DB || 'idempiere_pilot', CLIENT = 11;
var F = require(path.join(ERP, 'ad_find.js')), Database = require('better-sqlite3');
var initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js'));
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
    rq.on('error', rej); rq.setTimeout(120000, function () { rq.destroy(new Error('oracle timeout')); }); rq.end(data);
  });
}
var FIELD_SQL = function (tabId) {
  return "SELECT c.columnname AS \"columnName\", f.name AS name, COALESCE(f.ad_reference_id, c.ad_reference_id) AS \"displayType\", " +
    "COALESCE(f.ad_reference_value_id, c.ad_reference_value_id) AS \"refValueId\", " +
    "CASE WHEN COALESCE(f.isselectioncolumn, c.isselectioncolumn)='Y' THEN 1 ELSE 0 END AS \"isSelectionColumn\", c.seqnoselection AS \"seqNoSelection\", " +
    "CASE WHEN f.isdisplayed='Y' THEN 1 ELSE 0 END AS \"isDisplayed\", COALESCE(f.columnsql, c.columnsql) AS \"columnSQL\", " +
    "CASE WHEN c.isencrypted='Y' OR f.isencrypted='Y' THEN 1 ELSE 0 END AS \"isEncrypted\" " +
    "FROM ad_field f JOIN ad_column c ON c.ad_column_id=f.ad_column_id WHERE f.ad_tab_id=" + tabId + " AND f.isactive='Y' AND c.isactive='Y' ORDER BY f.isdisplayed DESC, f.seqno";
};
var norm = function (fs2) { return fs2.map(function (f) { f.isSelectionColumn = !!+f.isSelectionColumn; f.isDisplayed = !!+f.isDisplayed; f.isEncrypted = !!+f.isEncrypted; if (f.columnSQL === '') f.columnSQL = null; return f; }); };
function oracleRows(restrictions, fieldsByCol) {   // twin restrictions -> the rows FindWindow would hand MQuery (simple mode)
  return restrictions.map(function (r) { return { col: r.col, op: r.op, v: r.v == null ? null : String(r.v), v2: r.v2 == null ? null : String(r.v2), type: r.type || 'string' }; });
}
(async function () {
  var seed = new Database(path.join(ERP, 'ad_seed.db'), { readonly: true });
  var seedQ = function (sql) { return seed.prepare(sql).all(); };
  var SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ERP, 'sqljs', 'sql-wasm.wasm')) });
  // tabs both dictionaries have
  var pilotTabs = {}; pgRows("SELECT t.ad_tab_id, t.ad_table_id, tb.tablename, t.ad_tab_uu FROM ad_tab t JOIN ad_table tb ON tb.ad_table_id=t.ad_table_id JOIN ad_window w ON w.ad_window_id=t.ad_window_id WHERE t.tablevel=0 AND t.isactive='Y' AND w.isactive='Y' AND tb.isview='N'").forEach(function (t) { pilotTabs[t.ad_tab_id] = t; });
  var tabs = seedQ("SELECT t.AD_Tab_ID AS id, tb.TableName AS tn, t.AD_Tab_UU AS uu, t.IsLookupOnlySelection AS los FROM AD_Tab t JOIN AD_Table tb ON tb.AD_Table_ID=t.AD_Table_ID WHERE t.TabLevel=0 AND t.IsActive='Y' ORDER BY t.AD_Tab_ID")
    .filter(function (t) { return pilotTabs[t.id]; });
  if (process.env.UDP3_TABS) tabs = tabs.slice(0, +process.env.UDP3_TABS);
  var MAXROWS = +(process.env.UDP3_MAXROWS || 200000);
  log('§UDP3E tabs in both dictionaries (header, table not a view)=' + tabs.length);
  var A = { judged: 0, same: 0, bad: [] }, B = { judged: 0, pg: 0, lite: 0, bad: [], noRow: 0, skippedBig: 0, noKey: 0 }, C = { judged: 0, pg: 0, lite: 0, bad: [] }, D = { judged: 0, same: 0, bad: [] };
  var pgIds = function (tn, key, where) { return psql('SELECT ' + key + ' FROM ' + tn + ' WHERE ' + where + ' AND ' + tn + '.AD_Client_ID IN (0,' + CLIENT + ') ORDER BY 1').split('\n').filter(Boolean); };
  for (var ti = 0; ti < tabs.length; ti++) {
    var t = tabs[ti], tn = pilotTabs[t.id].tablename, key = tn + '_ID';
    var sf = norm(seedQ(FIELD_SQL(t.id).replace(/f\.name/g, 'f.Name'))), pf = norm(pgRows(FIELD_SQL(t.id)));
    var sSel = F.findFields(sf, { isLookupOnlySelection: t.los === 'Y' }), pSel = F.findFields(pf, { isLookupOnlySelection: false });
    var sNames = sSel.selection.map(function (f) { return f.columnName; }).join(','), pNames = pSel.selection.map(function (f) { return f.columnName; }).join(',');
    A.judged++; if (sNames === pNames) A.same++; else A.bad.push(tn + '(' + t.id + ') seed=[' + sNames + '] pilot=[' + pNames + ']');
    // B. data: does the table have the key + rows?
    var cols = {}; pgRows("SELECT lower(column_name) c, data_type d FROM information_schema.columns WHERE table_schema='adempiere' AND table_name='" + tn.toLowerCase() + "'").forEach(function (x) { cols[x.c] = x.d; });
    if (!cols[key.toLowerCase()] || !cols.ad_client_id) { B.noKey++; continue; }
    var nRows = +psql('SELECT count(*) FROM ' + tn + ' WHERE ad_client_id IN (0,' + CLIENT + ')');
    if (!nRows) { B.noRow++; continue; }
    if (nRows > MAXROWS) { B.skippedBig++; continue; }
    var sel = sSel.selection.filter(function (f) { return !f.columnSQL && cols[f.columnName.toLowerCase()]; });
    if (!sel.length) { B.noRow++; continue; }
    var used = {}; used[key.toLowerCase()] = 1; used.ad_client_id = 1; used.created = 1; sel.forEach(function (f) { used[f.columnName.toLowerCase()] = 1; });
    sf.forEach(function (f) { if (!f.columnSQL && cols[f.columnName.toLowerCase()]) used[f.columnName.toLowerCase()] = 1; });
    var ucols = Object.keys(used).filter(function (c) { return cols[c]; });
    var dq = function (c) { return '"' + c + '"'; };   // a column may be a reserved word (AD_WF_Node.Limit)
    var data = pgRows('SELECT ' + ucols.map(function (c) { return /timestamp|date/.test(cols[c]) ? "to_char(" + dq(c) + ",'YYYY-MM-DD HH24:MI:SS') AS " + dq(c) : dq(c); }).join(',') + ' FROM ' + tn + ' WHERE ad_client_id IN (0,' + CLIENT + ')');
    var db = new SQL.Database(); db.create_function('pgcollate', F.collate);
    db.run('CREATE TABLE ' + tn + ' (' + ucols.map(function (c) { return dq(c) + (/numeric|integer|bigint|double/.test(cols[c]) ? ' NUMERIC' : ' TEXT'); }).join(',') + ')');
    var ins = db.prepare('INSERT INTO ' + tn + ' VALUES (' + ucols.map(function () { return '?'; }).join(',') + ')');
    data.forEach(function (r) { ins.run(ucols.map(function (c) { var v = r[c]; return v == null ? null : typeof v === 'object' ? JSON.stringify(v) : v; })); });
    ins.free();
    var liteIds = function (where) { var e = db.exec('SELECT ' + key + ' FROM ' + tn + ' WHERE ' + where + ' AND ' + tn + '.AD_Client_ID IN (0,' + CLIENT + ') ORDER BY 1'); return e.length ? e[0].values.map(function (v) { return String(v[0]); }).sort() : []; };
    var src = data.filter(function (r) { return sel.some(function (f) { var v = r[f.columnName.toLowerCase()]; return v != null && v !== ''; }); }).slice(-1)[0];
    if (!src) { B.noRow++; db.close(); continue; }
    var valueOf = function (f) {
      var v = src[f.columnName.toLowerCase()]; if (v == null || v === '') return undefined;
      if (F.isSearchLike(f)) return String(v).slice(0, 3);   // a prefix: exercises UPPER(..) LIKE 'ABC%'
      return F.valueType(f) === 'date' ? String(v).slice(0, 10) : String(v);
    };
    var queries = sel.map(function (f) { var o = {}; var v = valueOf(f); if (v !== undefined) o[f.columnName] = v; return o; }).filter(function (o) { return Object.keys(o).length; });
    var all = {}; queries.forEach(function (o) { Object.assign(all, o); }); if (queries.length > 1) queries.push(all);
    for (var qi = 0; qi < queries.length; qi++) {
      var vals = queries[qi], pgQ = F.simpleQuery(sel, vals, { table: tn, dialect: 'pg', tabUU: t.uu }), liteQ = F.simpleQuery(sel, vals, { table: tn, dialect: 'sqlite', tabUU: t.uu });
      var o = await oracle({ op: 'findquery', table: tn, key: key, client: CLIENT, mode: 'simple', rows: oracleRows(pgQ.restrictions) });
      B.judged++;
      if (!o.ok) { B.bad.push(tn + ' ' + JSON.stringify(vals) + ' ORACLE ' + o.error); continue; }
      var leg = o.ids.slice().sort(), tp, tl;
      try { tp = pgIds(tn, key, pgQ.where).sort(); } catch (e) { tp = ['ERR ' + String(e.message).split('\n')[0]]; }
      try { tl = liteIds(liteQ.where); } catch (e) { tl = ['ERR ' + e.message]; }
      if (tp.join() === leg.join()) B.pg++; else B.bad.push('pg ' + tn + ' ' + JSON.stringify(vals) + ' legacy=' + leg.length + ' twin=' + tp.length + ' | legacyWhere=' + o.where + ' | twinWhere=' + pgQ.where);
      if (tl.join() === leg.join()) B.lite++; else B.bad.push('sqlite ' + tn + ' ' + JSON.stringify(vals) + ' legacy=' + leg.length + ' twin=' + tl.length + ' | twinWhere=' + liteQ.where);
      D.judged++; var rt = F.codeOf(F.parseCode(pgQ.code).rows); if (rt === pgQ.code) D.same++; else D.bad.push(tn + ' code=' + pgQ.code + ' rt=' + rt);
    }
    // C. advanced: per tab, the operators over its first selection field of each value class + connectors + brackets
    var byCol = {}; sf.forEach(function (f) { byCol[f.columnName] = f; });
    var pick = function (type) { return sel.filter(function (f) { return F.valueType(f) === type && src[f.columnName.toLowerCase()] != null; })[0]; };
    var cases = [], O = F.OP;
    ['string', 'int', 'num', 'date'].forEach(function (ty) {
      var f = pick(ty); if (!f) return; var v = String(src[f.columnName.toLowerCase()]); if (ty === 'date') v = v.slice(0, 10) + ' 00:00:00.0';
      var cn = f.columnName, ops = ty === 'string' ? [O.EQUAL, O.NOT_EQUAL, O.ILIKE, O.LIKE, O.NOT_LIKE, O.GREATER, O.LESS_EQUAL, O.NULL, O.NOT_NULL] : [O.EQUAL, O.NOT_EQUAL, O.GREATER, O.GREATER_EQUAL, O.LESS, O.LESS_EQUAL, O.BETWEEN, O.NULL, O.NOT_NULL];
      ops.forEach(function (op) {
        var vv = op === O.ILIKE ? v.slice(0, 2).toLowerCase() + '%' : (op === O.LIKE || op === O.NOT_LIKE) ? v.slice(0, 2) + '%' : (op === O.NULL || op === O.NOT_NULL) ? '' : v;
        cases.push([{ column: cn, op: op, v: vv, v2: op === O.BETWEEN ? vv : '', andOr: '', lB: '', rB: '', tabUU: t.uu }]);
      });
    });
    if (sel.length >= 2) {
      var f1 = sel[0], f2 = sel[1], v1 = src[f1.columnName.toLowerCase()], v2 = src[f2.columnName.toLowerCase()];
      if (v1 != null && v2 != null) ['AND', 'OR', 'AND NOT', 'OR NOT'].forEach(function (ao) {
        cases.push([{ column: f1.columnName, op: O.NOT_EQUAL, v: String(F.valueType(f1) === 'date' ? String(v1).slice(0, 10) + ' 00:00:00.0' : v1), v2: '', andOr: 'AND', lB: '(', rB: '', tabUU: t.uu },
          { column: f2.columnName, op: O.EQUAL, v: String(F.valueType(f2) === 'date' ? String(v2).slice(0, 10) + ' 00:00:00.0' : v2), v2: '', andOr: ao, lB: '', rB: ')', tabUU: t.uu },
          { column: f1.columnName, op: O.NOT_NULL, v: '', v2: '', andOr: ao, lB: '', rB: '', tabUU: t.uu }]);
      });
    }
    for (var ci = 0; ci < cases.length; ci++) {
      var rows = cases[ci], code = F.codeOf(rows), parsed = F.parseCode(code).rows;
      D.judged++; if (F.codeOf(parsed) === code) D.same++; else D.bad.push(tn + ' adv code rt');
      var fieldOf = function (c) { return byCol[c] || null; };
      var aPg = F.advancedQuery(tn, parsed, fieldOf, { dialect: 'pg', tabUU: t.uu }), aLite = F.advancedQuery(tn, parsed, fieldOf, { dialect: 'sqlite', tabUU: t.uu });
      var orows = parsed.map(function (r) { var f = byCol[r.column]; return { col: f.columnSQL || f.columnName, op: r.op, v: r.v === '' ? null : r.v, v2: r.v2 === '' ? null : r.v2, type: F.valueType(f), andOr: r.andOr || 'AND', lB: r.lB, rB: r.rB }; })
        .filter(function (r) { return r.v != null || r.op === O.NULL || r.op === O.NOT_NULL; });
      var o2 = await oracle({ op: 'findquery', table: tn, key: key, client: CLIENT, mode: 'advanced', rows: orows });
      C.judged++;
      if (!o2.ok && /PSQLException/.test(o2.error)) { C.legacyError = (C.legacyError || []).concat([tn + ' code=' + code + ' :: ' + String(o2.error).replace(/^.*ERROR: /, '')]); C.judged--; continue; }   // legacy's own SQL fails (open decision, as R5)
      if (!o2.ok) { C.bad.push(tn + ' ORACLE ' + o2.error + ' code=' + code); continue; }
      var leg2 = o2.ids.slice().sort(), tp2, tl2;
      try { tp2 = pgIds(tn, key, aPg.where).sort(); } catch (e) { tp2 = ['ERR ' + String(e.message).split('\n')[0]]; }
      try { tl2 = liteIds(aLite.where); } catch (e) { tl2 = ['ERR ' + e.message]; }
      if (tp2.join() === leg2.join()) C.pg++; else C.bad.push('pg ' + tn + ' code=' + code + ' legacy=' + leg2.length + ' twin=' + tp2.length + ' | legacyWhere=' + o2.where + ' | twinWhere=' + aPg.where);
      if (tl2.join() === leg2.join()) C.lite++; else C.bad.push('sqlite ' + tn + ' code=' + code + ' legacy=' + leg2.length + ' twin=' + tl2.length + ' | twinWhere=' + aLite.where);
    }
    db.close();
    if ((ti + 1) % 25 === 0) log('§UDP3E progress tabs=' + (ti + 1) + '/' + tabs.length + ' B ' + B.pg + '/' + B.judged + ' C ' + C.pg + '/' + C.judged);
  }
  pgRows('SELECT code FROM ad_userquery').forEach(function (r) { D.judged++; var rt = F.parseCode(r.code); var back = rt.sql != null ? '@SQL=' + rt.sql : F.codeOf(rt.rows, rt.history); if (back === r.code) D.same++; else D.bad.push('pilot userquery code=' + r.code + ' rt=' + back); });
  // E. the saved-query list == MUserQuery.get (oracle op `userqueries`), with throwaway queries of every kind on one tab (removed after)
  var E = { judged: 0, same: 0, bad: [] }, TAB = 186, base = +psql('SELECT max(ad_userquery_id) FROM ad_userquery') + 1000, made = [];
  var kinds = [[11, 101, null, 'W-UDP3 E mine'], [11, 0, null, 'W-UDP3 E user0'], [11, null, null, 'W-UDP3 E client'], [0, null, null, 'W-UDP3 E all users'],
    [11, null, 102, 'W-UDP3 E role'], [11, null, 103, 'W-UDP3 E other role'], [11, 100, null, 'W-UDP3 E other user'], [11, 101, null, 'A W-UDP3 E first']];
  try {
    kinds.forEach(function (k, i) { var id = base + i; made.push(id);
      psql("INSERT INTO ad_userquery (ad_userquery_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, name, ad_user_id, ad_role_id, ad_tab_id, ad_table_id, code, ad_userquery_uu, isdefault) VALUES (" +
        id + ',' + k[0] + ",0,'Y',now(),100,now(),100,'" + k[3] + "'," + (k[1] == null ? 'NULL' : k[1]) + ',' + (k[2] == null ? 'NULL' : k[2]) + ',' + TAB + ",259,'DocStatus<^>=<^>CO<^><^><^><^><^>',gen_random_uuid(),'N')"); });
    var UQ = pgRows('SELECT ad_userquery_id::text, ad_client_id::text, ad_user_id::text, ad_role_id::text, ad_tab_id::text, name, code, isactive FROM ad_userquery');
    var tabsQ = {}; UQ.forEach(function (r) { tabsQ[r.ad_tab_id] = 1; });
    var incl = function (role) { return pgRows("SELECT included_role_id::text r FROM ad_role_included WHERE ad_role_id=" + role + " AND isactive='Y'").map(function (x) { return x.r; }); };
    var ctxs = [{ clientId: 11, userId: 101, roleId: 102, org: 11 }, { clientId: 11, userId: 100, roleId: 103, org: 11 }, { clientId: 0, userId: 100, roleId: 0, org: 0 }];
    for (var tq in tabsQ) for (var ci2 = 0; ci2 < ctxs.length; ci2++) {
      var cx = ctxs[ci2], o3 = await oracle({ op: 'userqueries', tab: +tq, ctx: { client: cx.clientId, user: cx.userId, role: cx.roleId, org: cx.org } });
      E.judged++;
      if (!o3.ok) { E.bad.push('tab=' + tq + ' ctx=' + JSON.stringify(cx) + ' ORACLE ' + o3.error); continue; }
      var want = o3.list.map(function (x) { return x.id + ':' + x.name + ':' + (x.canSave ? 'S' : '-'); });
      var tc = { clientId: cx.clientId, userId: cx.userId, roleId: cx.roleId, includedRoles: incl(cx.roleId) };
      var got = F.userQueryList(UQ, tq, tc).map(function (r) { return r.ad_userquery_id + ':' + r.name + ':' + (F.userCanSave(r, tc) ? 'S' : '-'); });
      if (want.join('|') === got.join('|')) E.same++; else E.bad.push('tab=' + tq + ' ctx=' + JSON.stringify(cx) + ' java=[' + want.join('|') + '] twin=[' + got.join('|') + ']');
    }
  } finally { if (made.length) psql('DELETE FROM ad_userquery WHERE ad_userquery_id IN (' + made.join(',') + ')'); log('§UDP3E throwaway user queries removed: ' + made.length + ' (left=' + psql('SELECT count(*) FROM ad_userquery WHERE ad_userquery_id IN (' + made.join(',') + ')') + ')'); }
  var show = +(process.env.UDP3_SHOW || 8);
  E.bad.slice(0, show).forEach(function (l) { log('§UDP3E E-DIFF ' + l); });
  log('§UDP3E E saved-query lists (tab x login)=' + E.judged + ' same=' + E.same);
  A.bad.slice(0, show).forEach(function (l) { log('§UDP3E A-DIFF ' + l); });
  B.bad.slice(0, show).forEach(function (l) { log('§UDP3E B-DIFF ' + l.slice(0, 900)); });
  C.bad.slice(0, show).forEach(function (l) { log('§UDP3E C-DIFF ' + l.slice(0, 900)); });
  D.bad.slice(0, show).forEach(function (l) { log('§UDP3E D-DIFF ' + l.slice(0, 400)); });
  log('§UDP3E A selection fields: tabs=' + A.judged + ' same=' + A.same);
  log('§UDP3E B simple queries=' + B.judged + ' pg-same=' + B.pg + ' sqlite-same=' + B.lite + ' (tabs without rows/fields=' + B.noRow + ', table >' + MAXROWS + ' rows skipped=' + B.skippedBig + ', no key/client column=' + B.noKey + ')');
  log('§UDP3E C advanced queries=' + C.judged + ' pg-same=' + C.pg + ' sqlite-same=' + C.lite + ' (LEGACY-ERROR, not judged - legacy offers the operator but its own SQL fails; the twin answers: ' + (C.legacyError || []).length + ')');
  (C.legacyError || []).slice(0, show).forEach(function (l) { log('§UDP3E C-LEGACY-ERROR ' + l.slice(0, 300)); });
  log('§UDP3E D code round-trips=' + D.judged + ' same=' + D.same);
  if (!A.judged || !B.judged || !C.judged) { log('§UDP3E-VERDICT INCONCLUSIVE nothing judged'); process.exitCode = 3; return; }
  var pass = A.same === A.judged && B.pg === B.judged && B.lite === B.judged && C.pg === C.judged && C.lite === C.judged && D.same === D.judged && E.judged > 0 && E.same === E.judged;
  log('§UDP3E-VERDICT ' + (pass ? 'PASS' : 'FAIL') + ' A ' + A.same + '/' + A.judged + ' · B pg ' + B.pg + '/' + B.judged + ' sqlite ' + B.lite + '/' + B.judged + ' · C pg ' + C.pg + '/' + C.judged + ' sqlite ' + C.lite + '/' + C.judged + ' · D ' + D.same + '/' + D.judged + ' · E ' + E.same + '/' + E.judged);
  if (!pass) process.exitCode = 1;
})().catch(function (e) { log('§UDP3E-VERDICT INCONCLUSIVE ' + (e.stack || e)); process.exitCode = 3; });
