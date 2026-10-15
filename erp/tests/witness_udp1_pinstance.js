#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-UDP1-PINSTANCE (bim-compiler prompts/ERP_DEPTH_FILM.md §UDP-1). READ THE LOG: §UDP1 lines; exit code is not evidence.
// THE ISSUE: does a --masters migration carry a user's Saved Parameters and "Last Run" list (MPInstance.get,
//   MPInstance.java:527-585) - or does it discard them (DENY_EXACT dropped ad_pinstance/_para whole)?
//   Oracle = the vanilla GardenWorld pilot. Denominator = every (process,user,client) group with a run on the pilot.
//   One throwaway NAMED run (copy of a real run + paras) is inserted for the duration and removed after.
//   Negative control: MIGRATOR=<origin/main copy> must print §UDP1-VERDICT FAIL.
// Run: NODE_PATH=/home/red1/bim-compiler/node_modules node erp/tests/witness_udp1_pinstance.js   (pilot postgres up)
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
var ERP = path.join(__dirname, '..'), log = console.log;
var PGDB = process.env.UDP1_PG_DB || 'idempiere_pilot', NAME = 'W-UDP1 saved';
var MIGRATOR = process.env.MIGRATOR || path.join(ERP, 'idempiere_agent', 'migrate_agent.js');
var WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'udp1-')), OUT = path.join(WORK, 'out.db');
var initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js'));   // vendored: NODE_PATH (needed for the migrator's better-sqlite3) would pick a mismatched sql.js
function psql(sql) {
  return cp.execFileSync('docker', ['exec', '-i', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', PGDB, '-tAq'],
    { input: 'SET search_path=adempiere;\n' + sql, encoding: 'utf8', maxBuffer: 256 << 20 }).trim();
}
function pgRows(sql) { var j = psql("SELECT coalesce(json_agg(t),'[]') FROM (" + sql + ') t'); return JSON.parse(j); }

// The legacy algorithm, verbatim in shape: named (Name IS NOT NULL, active, ORDER BY Name) then unnamed active
// ORDER BY Created DESC, dedup on getParamsStr (paras by SeqNo, ParameterName + report fields), stop at N or 10*N rows.
var PFIELDS = ['parametername', 'p_string', 'p_string_to', 'p_number', 'p_number_to', 'p_date', 'p_date_to', 'info', 'info_to'];
function legacyList(inst, paras, isReport, n) {
  var byInst = {};
  paras.forEach(function (p) { (byInst[p.ad_pinstance_id] = byInst[p.ad_pinstance_id] || []).push(p); });
  function pstr(i) {
    var ps = (byInst[i.ad_pinstance_id] || []).slice().sort(function (a, b) { return (+a.seqno - +b.seqno) || String(a.parametername).localeCompare(String(b.parametername)); });
    var s = ps.map(function (p) { return '(' + PFIELDS.map(function (f) { return String(p[f]); }).join('|') + '|)'; }).join('');
    if (isReport[i.ad_process_id]) s += i.ad_language_id + '|' + i.ad_printformat_id + i.ad_language_id + i.reporttype + i.issummary;
    return s;
  }
  var out = [], seen = [];
  inst.filter(function (i) { return i.name != null && i.isactive === 'Y'; }).sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; })
    .forEach(function (i) { out.push('N:' + i.ad_pinstance_id + ':' + i.name); seen.push(pstr(i)); });
  if (n > 0) {
    var un = inst.filter(function (i) { return i.name == null && i.isactive === 'Y'; })
      .sort(function (a, b) { return a.created < b.created ? 1 : a.created > b.created ? -1 : (+b.ad_pinstance_id - +a.ad_pinstance_id); });
    var run = 0;
    for (var k = 0; k < un.length; k++) {
      var s = pstr(un[k]);
      if (seen.indexOf(s) < 0) { out.push('L:' + un[k].ad_pinstance_id); seen.push(s); if (++run === n) break; }
      if (k + 1 === 10 * n) break;
    }
  }
  return out;
}

var INST_COLS = 'ad_pinstance_id, ad_process_id, ad_user_id, ad_client_id, name, isactive, created, ad_language_id, ad_printformat_id, reporttype, issummary';
var PARA_COLS = 'ad_pinstance_id, seqno, ' + PFIELDS.join(', ');
var newId = null;
function cleanup() {   // also on 'exit': a crash must never leave the throwaway run on the pilot
  if (!newId) return; var id = newId; newId = null;
  psql('DELETE FROM ad_pinstance_para WHERE ad_pinstance_id=' + id + "; DELETE FROM ad_pinstance WHERE ad_pinstance_id=" + id + " AND name='" + NAME + "';");
  log('§UDP1 throwaway run ' + id + ' removed (left=' + psql('SELECT count(*) FROM ad_pinstance WHERE ad_pinstance_id=' + id) + ')');
}
process.on('exit', cleanup);
(async function () {
  var rc = 0;
  try {
    // 1. throwaway named run = copy of the newest client-11 run that has parameters
    var src = psql("SELECT p.ad_pinstance_id FROM ad_pinstance p WHERE p.ad_client_id=11 AND p.name IS NULL AND EXISTS (SELECT 1 FROM ad_pinstance_para x WHERE x.ad_pinstance_id=p.ad_pinstance_id) ORDER BY p.created DESC LIMIT 1");
    if (!src) { log('§UDP1-VERDICT INCONCLUSIVE no client-11 run with parameters on the pilot'); process.exit(3); }
    newId = +psql('SELECT max(ad_pinstance_id)+1 FROM ad_pinstance');
    psql("INSERT INTO ad_pinstance SELECT (jsonb_populate_record(null::ad_pinstance, to_jsonb(p) || jsonb_build_object('ad_pinstance_id'," + newId +
      ",'name','" + NAME + "','created',now(),'ad_pinstance_uu',gen_random_uuid()::text))).* FROM ad_pinstance p WHERE p.ad_pinstance_id=" + src + ";\n" +
      "INSERT INTO ad_pinstance_para SELECT (jsonb_populate_record(null::ad_pinstance_para, to_jsonb(x) || jsonb_build_object('ad_pinstance_id'," + newId +
      ",'ad_pinstance_para_uu',gen_random_uuid()::text))).* FROM ad_pinstance_para x WHERE x.ad_pinstance_id=" + src + ';');
    var nParas = +psql('SELECT count(*) FROM ad_pinstance_para WHERE ad_pinstance_id=' + newId);
    log('§UDP1 throwaway named run id=' + newId + ' (copy of ' + src + ') paras=' + nParas);

    // 2. run the migrator, masters mode, on the tables the dropdown reads
    var mlog = path.join(WORK, 'migrate.log'), env = Object.assign({}, process.env, {
      ERP_PG_DB: PGDB, ERP_MASTERS: '1', ERP_CLIENT: '11', ERP_OUT: OUT, ERP_INSTANCES: path.join(WORK, 'instances.json'), ERP_TABLES: 'ad_pinstance,ad_pinstance_para,ad_pinstance_log,ad_sysconfig,ad_process' });
    var r = cp.spawnSync('node', [MIGRATOR, '--masters'], { env: env, encoding: 'utf8', maxBuffer: 256 << 20 });
    fs.writeFileSync(mlog, (r.stdout || '') + (r.stderr || ''));
    log('§UDP1 migrator=' + MIGRATOR + ' rc=' + r.status + ' log=' + mlog);
    fs.readFileSync(mlog, 'utf8').split('\n').filter(function (l) { return /§MIGRATE-ROWFILTER|masters-scope|Error/.test(l); }).forEach(function (l) { log('§UDP1 migrator| ' + l); });
    if (r.status !== 0 || !fs.existsSync(OUT)) { log('§UDP1-VERDICT INCONCLUSIVE migrator failed (read ' + mlog + ')'); rc = 3; return; }

    // 3. legacy lists on the pilot vs on the migrated SQLite, for EVERY group
    var SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ERP, 'sqljs', 'sql-wasm.wasm')) }), db = new SQL.Database(fs.readFileSync(OUT));
    function lite(sql) { try { var e = db.exec(sql); if (!e.length) return []; return e[0].values.map(function (v) { var o = {}; e[0].columns.forEach(function (c, i) { o[c.toLowerCase()] = v[i] == null ? null : String(v[i]); }); return o; }); } catch (x) { return null; } }
    var castT = function (cols) { return cols.split(', ').map(function (c) { return c + '::text AS ' + c; }).join(', '); };
    var PI = pgRows('SELECT ' + castT(INST_COLS) + ' FROM ad_pinstance'), PP = pgRows('SELECT ' + castT(PARA_COLS) + ' FROM ad_pinstance_para');
    var LI = lite('SELECT ' + INST_COLS + ' FROM ad_pinstance'), LP = lite('SELECT ' + PARA_COLS + ' FROM ad_pinstance_para');
    log('§UDP1 rows pilot inst=' + PI.length + ' para=' + PP.length + ' | migrated inst=' + (LI ? LI.length : 'TABLE-ABSENT') + ' para=' + (LP ? LP.length : 'TABLE-ABSENT'));
    LI = LI || []; LP = LP || [];
    var isReport = {}; pgRows("SELECT ad_process_id::text id FROM ad_process WHERE isreport='Y'").forEach(function (x) { isReport[x.id] = true; });
    var lastN = {}; pgRows("SELECT ad_client_id::text c, value FROM ad_sysconfig WHERE name='LASTRUN_RECORD_COUNT' AND isactive='Y'").forEach(function (x) { lastN[x.c] = +x.value; });
    var nFor = function (c) { return lastN[c] != null ? lastN[c] : lastN['0'] != null ? lastN['0'] : 5; };
    var grp = function (rows) { var g = {}; rows.forEach(function (i) { var k = i.ad_process_id + '/' + i.ad_user_id + '/' + i.ad_client_id; (g[k] = g[k] || []).push(i); }); return g; };
    var GP = grp(PI), GL = grp(LI), keys = Object.keys(GP).sort(), judged = 0, same = 0, nonEmpty = 0, bad = [];
    keys.forEach(function (k) {
      var c = k.split('/')[2], a = legacyList(GP[k], PP, isReport, nFor(c)), b = legacyList(GL[k] || [], LP, isReport, nFor(c));
      judged++; if (a.length) nonEmpty++;
      if (a.join(',') === b.join(',')) same++; else bad.push(k + ' pilot=[' + a.join(',') + '] migrated=[' + b.join(',') + ']');
    });
    bad.slice(0, 8).forEach(function (l) { log('§UDP1 DIFF ' + l); });
    var named = LI.filter(function (i) { return String(i.ad_pinstance_id) === String(newId); })[0], namedParas = LP.filter(function (p) { return String(p.ad_pinstance_id) === String(newId); }).length;
    log('§UDP1 named run in migrated db: ' + (named ? 'YES name="' + named.name + '"' : 'NO') + ' paras=' + namedParas + '/' + nParas);
    log('§UDP1 groups judged=' + judged + ' nonEmpty=' + nonEmpty + ' same=' + same + ' differ=' + bad.length);
    if (!judged || !nonEmpty) { log('§UDP1-VERDICT INCONCLUSIVE nothing judged'); rc = 3; }
    else if (same === judged && named && namedParas === nParas) log('§UDP1-VERDICT PASS ' + same + '/' + judged + ' groups give the same Saved Parameter + Last Run list; the named run arrived with ' + namedParas + ' paras');
    else { log('§UDP1-VERDICT FAIL ' + same + '/' + judged + ' groups same; named run ' + (named ? 'kept' : 'LOST') + ' paras ' + namedParas + '/' + nParas); rc = 1; }
  } finally {
    cleanup();
    process.exitCode = rc;
  }
})().catch(function (e) { log('§UDP1-VERDICT INCONCLUSIVE ' + (e.stack || e)); process.exitCode = 3; });
