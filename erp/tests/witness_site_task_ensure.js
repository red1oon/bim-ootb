#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-SITE-TASK-ENSURE (bim-compiler prompts/MOBILE_PERF.md WO-25; fix of PR #3519). READ THE LOG after every run: the exit code is not evidence. An arm that judged nothing prints INCONCLUSIVE.
// ISSUE THIS PROVES OR DISPROVES: PR #3519 (0a5065be) put the seven "Site Task" rows (R_StatusCategory 990001, R_Status 990001-990005, R_RequestType 990001) INTO erp/patches/ad_seed.db.sql. That file is
//   hashed into the Team BASE (erp/team_sync.js hashBase: seed file + patches/ad_seed.db.sql + patches/mfg.sql) and no base-upgrade path exists, so every already-paired team went 'base-mismatch'
//   (common/comm/comm_store.js checkBase; its operations then local-only, team_sync.js reason=base-mismatch). The rows are now a boot overlay (erp/ad_site_task_overlay.js ensure(db)), outside the base.
//   E1  the base hash of THIS tree == the base hash of the files at 0a5065be^ (read with git show), and != the one at 0a5065be (RED CONTROL: the defect is detected, red=1/1)
//   E2  fresh store (seed + the two hashed patches): no Site Task row; ensure adds exactly 7, each with its FIXED id and UU (the UUs and ids read from erp/patches/site_task.sql AS IT WAS at 0a5065be); a 2nd ensure adds 0
//   E3  a store that already has them from the old patch route (that site_task.sql applied): ensure adds 0, changes nothing; and the rows ensure makes are byte-identical to the rows the old patch made
//   E4  viewer/tests/witness_mission_processor.js (headless, Duplex) still ends as before: checks=8 fail=0 ... red=3/3 (INCONCLUSIVE only for its routed-path half)
//   E5  the eight witnesses whose BASE_PIN was restored pass (each run, verdict line listed)
// Run: node erp/tests/witness_site_task_ensure.js [--skip-children]   (E4 + E5 take about 20 minutes; --skip-children judges E1-E3 only and ends INCONCLUSIVE)
'use strict';
var fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
var ROOT = path.join(__dirname, '..', '..'), ERP = path.join(ROOT, 'erp');
var SQLJS_DIR = process.env.SQLJS_DIR || '/home/red1/bim-ootb/tests/node_modules/sql.js';
var initSqlJs = require(SQLJS_DIR);
var POST = '0a5065be', PRE = '0a5065be^';
var SKIP = process.argv.indexOf('--skip-children') > 0;
var judged = 0, fails = 0, inconc = [], red = { ok: 0, of: 0 };
function say(s) { console.log(s); }
function check(id, ok, rule, info) { judged++; if (!ok) fails++; say('  §SITE-TASK-CHECK ' + id + ' ' + (ok ? 'OK' : 'FAIL') + ' ' + rule + (info ? ' ' + JSON.stringify(info) : '')); }
function sha256(b) { return crypto.createHash('sha256').update(b).digest('hex'); }
function git(args) { return cp.execFileSync('git', ['-C', ROOT].concat(args), { maxBuffer: 1 << 28 }); }
// the team base as erp/team_sync.js hashBase computes it (an independent oracle: node): a manifest of the seed file's sha256 + size, then the two patches by POSITION (text, or MISSING)
function baseOf(buf, p0, p1) {
  var man = 'seed ' + sha256(buf) + ' ' + buf.length + '\n';
  [p0, p1].forEach(function (t, i) { man += '--patch ' + i + (t == null ? ' MISSING' : '\n' + t) + '\n'; });
  return sha256(Buffer.from(man, 'utf8'));
}
function atRev(rev, f) { try { return git(['show', rev + ':' + f]); } catch (e) { return null; } }
function baseAtRev(rev) { var s = atRev(rev, 'erp/ad_seed.db'), a = atRev(rev, 'erp/patches/ad_seed.db.sql'), m = atRev(rev, 'erp/patches/mfg.sql'); return baseOf(s, a == null ? null : a.toString('utf8'), m == null ? null : m.toString('utf8')); }
function baseOfTree() { var rd = function (f) { var p = path.join(ERP, f); return fs.existsSync(p) ? fs.readFileSync(p) : null; };
  var a = rd('patches/ad_seed.db.sql'), m = rd('patches/mfg.sql'); return baseOf(rd('ad_seed.db'), a == null ? null : a.toString('utf8'), m == null ? null : m.toString('utf8')); }
function runStatements(db, txt) { txt.split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) try { db.run(st); } catch (e) { /* the page's per-statement tolerance */ } }); }
function rowsOf(db, sql) { var r = db.exec(sql); return r.length ? r[0].values : []; }
var TABLES = [['r_statuscategory', 'r_statuscategory_id', 'r_statuscategory_uu'], ['r_status', 'r_status_id', 'r_status_uu'], ['r_requesttype', 'r_requesttype_id', 'r_requesttype_uu']];
function dump(db, exp) {   // the rows of the seven fixed ids, every column, as JSON (a fingerprint of what is in the store)
  return JSON.stringify(TABLES.map(function (t) { return rowsOf(db, 'SELECT * FROM ' + t[0] + ' WHERE ' + t[1] + ' IN (' + exp.ids[t[0]].join(',') + ') ORDER BY ' + t[1]); }));
}

(async function main() {
  say('═══ W-SITE-TASK-ENSURE — the Site Task rows outside the Team base ═══');
  // ── the expectation, read from the old patch AS IT WAS (the one place the fixed ids and UUs were written) ──
  var oldSql = git(['show', POST + ':erp/patches/site_task.sql']).toString('utf8');
  var exp = { uus: [], ids: { r_statuscategory: [], r_status: [], r_requesttype: [] } };
  oldSql.split('\n').filter(function (l) { return /^INSERT /.test(l); }).forEach(function (l) {
    var t = /INTO (\w+)/.exec(l)[1], id = /VALUES \((\d+),/.exec(l)[1], uu = /'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'/.exec(l)[1];
    exp.ids[t].push(Number(id)); exp.uus.push([t, uu]);
  });
  say('§SITE-TASK-EXPECT rows=' + exp.uus.length + ' ids=' + JSON.stringify(exp.ids) + ' (from ' + POST + ':erp/patches/site_task.sql)');

  // ── E1 ──
  var hPre = baseAtRev(PRE), hPost = baseAtRev(POST), hTree = baseOfTree();
  say('§SITE-TASK-BASE pre(' + PRE + ')=' + hPre + ' post(' + POST + ')=' + hPost + ' tree=' + hTree);
  check('E1', hTree === hPre && hPre !== hPost, 'the base hash of this tree == the one at ' + PRE + ' (the base did not move) and != the one at ' + POST + ' (the defect is detected)', { tree: hTree.slice(0, 12), pre: hPre.slice(0, 12), post: hPost.slice(0, 12) });
  red.of++; if (hPre !== hPost) red.ok++;

  // ── E2 ──
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIR, 'dist', f); } });
  function fresh() {   // seed file + the two hashed patches, nothing else = what a team member's base is
    var db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
    ['ad_seed.db.sql', 'mfg.sql'].forEach(function (pf) { var f = path.join(ERP, 'patches', pf); if (fs.existsSync(f)) runStatements(db, fs.readFileSync(f, 'utf8')); });
    return db;
  }
  var OV = require(path.join(ERP, 'ad_site_task_overlay.js'));
  var logs = [], _log = console.log; console.log = function () { logs.push(Array.prototype.join.call(arguments, ' ')); };
  var db2 = fresh(), before = TABLES.map(function (t) { return rowsOf(db2, 'SELECT count(*) FROM ' + t[0] + ' WHERE ' + t[1] + ' IN (' + exp.ids[t[0]].join(',') + ')')[0][0]; }).reduce(function (a, b) { return a + b; }, 0);
  var r1 = OV.ensure(db2), after = TABLES.map(function (t) { return rowsOf(db2, 'SELECT count(*) FROM ' + t[0] + ' WHERE ' + t[1] + ' IN (' + exp.ids[t[0]].join(',') + ')')[0][0]; });
  var uuOk = exp.uus.every(function (p) { var t = TABLES.filter(function (x) { return x[0] === p[0]; })[0]; return rowsOf(db2, 'SELECT count(*) FROM ' + t[0] + ' WHERE ' + t[2] + " = '" + p[1] + "'")[0][0] === 1; });
  var dump2 = dump(db2, exp), r2 = OV.ensure(db2);
  console.log = _log; logs.filter(function (l) { return /SITE_TASK_ENSURE/.test(l); }).forEach(function (l) { say('  ' + l); });
  check('E2', before === 0 && r1.added === 7 && uuOk && after.join() === '1,5,1' && r2.added === 0 && dump(db2, exp) === dump2,
    'fresh base has none of the seven rows; ensure adds 7 (1 category, 5 statuses, 1 type) each with its fixed id and UU; a second ensure adds 0 and changes nothing', { before: before, added1: r1.added, perTable: after, uuOk: uuOk, added2: r2.added });

  // ── E3 ──
  var db3 = fresh(); runStatements(db3, oldSql);
  var have3 = TABLES.map(function (t) { return rowsOf(db3, 'SELECT count(*) FROM ' + t[0] + ' WHERE ' + t[1] + ' IN (' + exp.ids[t[0]].join(',') + ')')[0][0]; });
  var d3 = dump(db3, exp), tot3 = TABLES.map(function (t) { return rowsOf(db3, 'SELECT count(*) FROM ' + t[0])[0][0]; }).join();
  console.log = function () {}; var r3 = OV.ensure(db3); console.log = _log;
  var tot3b = TABLES.map(function (t) { return rowsOf(db3, 'SELECT count(*) FROM ' + t[0])[0][0]; }).join();
  check('E3', have3.join() === '1,5,1' && r3.added === 0 && dump(db3, exp) === d3 && tot3 === tot3b && d3 === dump2,
    'a store that has the rows from the old patch route: ensure adds 0, changes nothing (row counts of the three tables too), and the rows ensure made on a fresh store are byte-identical to the old patch\'s', { old_route: have3, added: r3.added, totals_before: tot3, totals_after: tot3b, same_as_old_patch: d3 === dump2 });

  // ── E4 / E5 ──
  function run(args, tmo) { var r = cp.spawnSync('node', args, { cwd: ROOT, encoding: 'utf8', timeout: tmo, maxBuffer: 1 << 28 }); return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }; }
  if (SKIP) { inconc.push('E4', 'E5'); say('  ⚪ INCONCLUSIVE E4,E5 — --skip-children: the mission processor and the eight pinned witnesses were not run'); }
  else {
    var m = run(['viewer/tests/witness_mission_processor.js', 'Duplex_extracted'], 40 * 60 * 1000), mline = (m.out.split('\n').filter(function (l) { return /§W-MISSION-PREPARE building=/.test(l); }).pop()) || '';
    say('  E4 ' + mline);
    check('E4', /checks=8 fail=0 /.test(mline) && /red=3\/3/.test(mline), 'witness_mission_processor.js on the Duplex still ends checks=8 fail=0 red=3/3', { exit: m.code, line: mline });
    var W = ['acct_processor', 'import_invoice', 'import_order', 'import_payment', 'mf_lens', 'pos_sales', 'recurring', 'script_validator'], allOk = true, lines = [];
    W.forEach(function (w) {
      var r = run(['erp/tests/witness_' + w + '.js'], 20 * 60 * 1000), vl = r.out.split('\n').filter(function (l) { return /(RESULT|VERDICT)/.test(l) && !/MUTANTS/.test(l); });
      var ok = r.code === 0 && vl.length > 0 && vl.every(function (l) { return !/FAIL|INCONCLUSIVE/.test(l.replace(/(fail|failed|fails)=0/g, '')); });
      if (!ok) allOk = false; lines.push(w + ' exit=' + r.code + ' | ' + (vl.pop() || '(no verdict line)')); say('  E5 witness_' + w + ' ' + (ok ? 'OK' : 'FAIL') + ' exit=' + r.code + ' :: ' + (vl[vl.length - 1] || (r.out.split('\n').slice(-3).join(' / '))));
    });
    check('E5', allOk, 'the eight witnesses whose BASE_PIN was restored pass', { n: W.length });
  }
  var verdict = fails ? 'FAIL' : (inconc.length || !judged ? 'INCONCLUSIVE' : 'PASS');
  say('§W-SITE-TASK-ENSURE checks=' + judged + ' fail=' + fails + ' red=' + red.ok + '/' + red.of + ' verdict=' + verdict + (inconc.length ? ' inconclusive=' + inconc.join(',') : ''));
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(function (e) { say('§W-SITE-TASK-ENSURE CRASH ' + (e && e.stack || e)); process.exit(2); });
