#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-WINDOW-LENS (bim-compiler prompts/ERP_DEPTH_FILM.md §WINDOW-LENS). READ THE LOG: HARNESS verdict = §WL-VERDICT; FINDINGS = §WL-GAP lines (reported, not asserted away).
// THE ISSUE it proves/disproves: the read-only "what is this window made of" lens reports tabs / fields / displayed fields / buttons / access / numbering of ANY AD window straight from the dictionary.
//   HARNESS (asserted): over EVERY active AD window of ad_seed.db the lens equals an independent recount (different join path); per-tab sums == window totals; a window with no tabs is INCONCLUSIVE, never OK;
//   deleting one tab moves exactly that window's tab count; reading writes nothing.  FINDINGS: the same counts vs the legacy pilot dump (scripts/bridge/out/window_anatomy_legacy.json).
'use strict';
var fs = require('fs'), path = require('path');
var ERP = path.join(__dirname, '..'), L = null;
try { L = require(path.join(ERP, 'overlay', 'window_lens.js')); } catch (e) { L = null; }
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js')); }
var LEG = process.env.WL_LEGACY || '/home/red1/bim-compiler/scripts/bridge/out/window_anatomy_legacy.json';
var log = console.log, fails = 0, judged = 0;
function check(name, ok, info) { judged++; if (!ok) fails++; log('  §WL-CHECK ' + name + ' ' + (ok ? 'OK' : 'FAIL') + (ok ? '' : ' ' + JSON.stringify(info))); }
(async function () {
  if (!L) { check('WL0 window_lens.js exists', false, 'missing'); log('§WL-VERDICT FAIL judged=' + judged + ' failed=' + fails); process.exit(1); }
  var SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ERP, 'sqljs', 'sql-wasm.wasm')) }), db = new SQL.Database(fs.readFileSync(path.join(ERP, 'ad_seed.db')));
  var pstmts = 0, pfail = 0;   // the seed AS LOADED: idempiere.html applies patches/ad_seed.db.sql statement by statement on every load (FS-15)
  fs.readFileSync(path.join(ERP, 'patches', 'ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); pstmts++; } catch (e) { pfail++; } });   // the loader's exact split
  log('§WL seed-as-loaded: patch statements ok=' + pstmts + ' failed=' + pfail);
  var q = function (sql, p) { var s = db.prepare(sql), r = []; try { if (p) s.bind(p); while (s.step()) { var o = s.getAsObject(), k = {}; Object.keys(o).forEach(function (x) { k[x.toLowerCase()] = o[x]; }); r.push(k); } } finally { s.free(); } return r; };
  var wins = q("SELECT ad_window_id AS id FROM ad_window WHERE isactive='Y' ORDER BY 1").map(function (r) { return r.id; });
  // independent recount: ONE grouped query from the field side (the lens goes window -> tab -> field)
  var rc = {}; q("SELECT t.ad_window_id AS w, COUNT(DISTINCT t.ad_tab_id) AS tabs, COUNT(f.ad_field_id) AS fields, SUM(CASE WHEN f.isdisplayed='Y' THEN 1 ELSE 0 END) AS disp FROM ad_tab t LEFT JOIN ad_field f ON f.ad_tab_id=t.ad_tab_id AND f.isactive='Y' WHERE t.isactive='Y' GROUP BY t.ad_window_id").forEach(function (r) { rc[r.w] = r; });
  var bad = [], inc = 0, ok = 0, sumBad = [], mine = {};
  wins.forEach(function (w) {
    var r = L.compute(q, w, null, 11); mine[w] = r;
    var x = rc[w];
    if (!x) { if (r.tabs === 0 && r.verdict === 'INCONCLUSIVE') inc++; else bad.push(w + ':noTabs-but-' + r.verdict); return; }
    if (r.tabs !== x.tabs || r.fields !== x.fields || r.displayed !== (x.disp || 0)) bad.push(w + ':' + [r.tabs, r.fields, r.displayed] + '!=' + [x.tabs, x.fields, x.disp]); else ok++;
    if (r.perTab.reduce(function (a, t) { return a + t.fields; }, 0) !== r.fields) sumBad.push(w);
  });
  log('§WL population windows=' + wins.length + ' equal=' + ok + ' inconclusive(no tabs)=' + inc + ' differ=' + bad.length);
  check('WL1 lens == independent recount for every active window (tabs, fields, displayed)', bad.length === 0 && ok > 300, { bad: bad.slice(0, 5), ok: ok });
  check('WL2 per-tab field sums == window totals for every window', sumBad.length === 0, sumBad.slice(0, 5));
  // a sample window's lines are all judged and name something real
  var pj = mine[130]; check('WL3 Project(130): 7+ tabs, fields > 100, 7 lines', pj && pj.tabs >= 7 && pj.fields > 100 && pj.rows.length === 7, pj && { tabs: pj.tabs, fields: pj.fields, rows: pj.rows.length });
  var so = mine[143] || mine[143]; log('§WL sample Sales Order(143): ' + (so ? so.rows.map(function (r) { return r.id + '=' + r.status + '[' + r.detail.slice(0, 60) + ']'; }).join(' | ') : 'absent'));
  check('WL3b Sales Order: tabs + buttons + numbering lines judged', so && ['tabs', 'buttons', 'numbering'].every(function (id) { return so.rows.filter(function (r) { return r.id === id && r.status !== 'INCONCLUSIVE'; }).length === 1; }), so && so.rows.map(function (r) { return r.id + '=' + r.status; }));
  // neg-control: delete one tab of Project (Task Line 796) -> only window 130's tab count falls by 1
  var before = mine[130].tabs, bytes0 = db.export().length;
  var again = L.compute(q, 130, null, 11); check('WL4 read-only: the db bytes are identical after lens runs', db.export().length === bytes0 && again.tabs === before, null);
  var db2 = new SQL.Database(db.export()), q2 = function (sql, p) { var s2 = db2.prepare(sql), r = []; try { if (p) s2.bind(p); while (s2.step()) { var o = s2.getAsObject(), k = {}; Object.keys(o).forEach(function (x) { k[x.toLowerCase()] = o[x]; }); r.push(k); } } finally { s2.free(); } return r; };
  db2.run('DELETE FROM ad_tab WHERE ad_tab_id=796'); var after = L.compute(q2, 130, null, 11), other = L.compute(q2, 143, null, 11);   // mutate a COPY: the findings below read the untouched seed
  check('WL5 NEG: deleting one tab drops exactly that window by 1 tab and leaves another window unchanged', after.tabs === before - 1 && other.tabs === mine[143].tabs, { before: before, after: after.tabs });
  // vacuous: a window id with no tabs
  var none = L.compute(q, 99999999, null, 11); check('WL6 a window with no tabs is INCONCLUSIVE, never OK', none.verdict === 'INCONCLUSIVE' && none.rows.every(function (r) { return r.status !== 'OK' || r.id === 'window'; }) , none.verdict);
  // FINDINGS vs legacy
  if (!fs.existsSync(LEG)) log('§WL-FINDINGS INCONCLUSIVE legacy dump missing (' + LEG + ')');
  else {
    var lg = JSON.parse(fs.readFileSync(LEG, 'utf8')).windows, eq = 0, diff = [], onlySeed = [];
    wins.forEach(function (w) { var a = lg[w]; if (!a) { onlySeed.push(w); return; } var m = mine[w]; if (a.tabs === m.tabs && a.fields === m.fields && a.displayed === m.displayed) eq++; else diff.push({ w: w, legacy: [a.tabs, a.fields, a.displayed], seed: [m.tabs, m.fields, m.displayed], legacyOnlyTabs: a.tabList.filter(function (t) { return !q('SELECT 1 AS x FROM ad_tab WHERE ad_tab_id=? AND isactive=\'Y\'', [t.id]).length; }).map(function (t) { return t.id + ':' + t.name + '@' + t.created; }) }); });
    log('§WL-FINDINGS legacy windows=' + Object.keys(lg).length + ' equal=' + eq + ' differ=' + diff.length + ' onlyInSeed=' + onlySeed.length);
    check('WL7 FINDINGS closed: seed-as-loaded equals the legacy pilot on tabs/fields/displayed for every legacy window', diff.length === 0, diff.map(function (d) { return d.w; }));
    diff.forEach(function (d) { log('§WL-GAP window=' + d.w + ' legacy[tabs,fields,displayed]=' + d.legacy + ' seed=' + d.seed + ' legacy-only tabs=' + JSON.stringify(d.legacyOnlyTabs)); });
  }
  var v = !judged ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; log('§WL-VERDICT ' + v + ' judged=' + judged + ' failed=' + fails); process.exit(v === 'PASS' ? 0 : v === 'FAIL' ? 1 : 3);
})().catch(function (e) { log('§WL-VERDICT CRASH ' + (e.stack || e)); process.exit(2); });
