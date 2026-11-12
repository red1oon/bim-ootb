#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-PA-FLAT (spec prompts/CAPEX_DASHBOARD.md §5.66 PR B). READ THE LOG: verdict = §PA_FLAT_VERDICT; the exit code alone is not evidence.
// THE ISSUE it proves/disproves: "the dashboard's numbers cannot come from iDempiere PA rows (what legacy and the twin both run) without changing a number the page shows today (capex/tiles.js)".
// Per data set × filter: capex/pa_tiles.js flat map (every slot run by erp/goal_engine.js from a PA_MeasureCalc row) == capex/tiles.js flat map, key by key. With Status = all nothing may differ.
//   With another Status, only the keys §5.66 D2 names (tiles.js ignored Status for them) may differ, and each such difference is printed. Any PA error (a slot with no row, a SQL failure) = FAIL.
// Data: (1) the twin's own 12-project scenario (capex/tools/twin_mockchain.js) with the CAPEX migration scripts applied to that store, so the PA rows are the store's own;
//   (2) the committed legacy snapshot capex/sample/pilot_snapshot.json (a real pilot read); it has no PA_MeasureCalc read type, so the store's rows from (1) are given to it (the same scripts legacy applied) — printed.
// A data set whose population is empty under a filter is counted INCONCLUSIVE for that filter, never PASS. Break: PA_FLAT_BREAK=1 makes the Total Projects row count one more → MUST FAIL.
// Usage: NODE_PATH=<bim-ootb>/node_modules node capex/tests/witness_pa_flat.js
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), initSqlJs = require('sql.js');
const ROOT = path.join(__dirname, '..', '..'), GE = require(path.join(ROOT, 'erp/goal_engine.js')), AC = require(path.join(ROOT, 'erp/ad_callout.js')), MA = require(path.join(ROOT, 'capex/tools/migration_apply.js'));
const A = require('../adapters.js'), T = require('../tiles.js'), PT = require('../pa_tiles.js');
['support', 'support_stock', 'views', 'currency', 'uom', 'pricing', 'tax', 'sqlfn'].forEach(m => require(path.join(ROOT, 'erp/callouts', m + '.js')));
const MIGDIR = path.join(ROOT, 'capex/legacy/migration/iD13/postgresql'), BREAK = process.env.PA_FLAT_BREAK === '1', log = console.log;
const D2 = ['total_projects', 'total_projects_closed', 'active_projects', 'active_projects_closing', 'completed_year', 'forecast_cost', 'proc_overcommitted', 'proc_nopo'];
let judged = 0, fails = 0, inconc = 0;
const ck = (n, ok, i) => { judged++; if (!ok) fails++; log('  §PA_FLAT ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (i !== undefined ? ' ' + JSON.stringify(i) : '')); };
const inc = (n, why) => { inconc++; log('  §PA_FLAT ' + n + ' INCONCLUSIVE ' + why); };
(async () => {
  const SQL = await initSqlJs(), deps = { SQL, GE, AC, T, A, log: m => log('    ' + m) };
  // (1) the twin scenario store + the CAPEX scripts
  const out = path.join(os.tmpdir(), 'pa_flat_' + process.pid + '.db'), { build } = require(path.join(ROOT, 'capex/tools/twin_mockchain.js')), TODAY = '2026-11-12';
  const _l = console.log, lines = []; console.log = (...a) => lines.push(a.join(' ')); let r; try { r = await build({ today: TODAY, out }); } finally { console.log = _l; }
  lines.filter(l => /§TWIN_MOCK_BUILT/.test(l)).forEach(l => log(l));
  if (!r || r.errs.length || !fs.existsSync(out)) { ck('W0 the twin scenario store was built', false, r && r.errs); return finish(); }
  const db = new SQL.Database(fs.readFileSync(out)); fs.unlinkSync(out);
  AC.RUNTIME.registerSqlFunctions((n, f) => db.create_function(n, f));
  let mig = 0, migBad = 0;
  fs.readdirSync(MIGDIR).filter(f => /\.sql$/.test(f)).sort().forEach(f => { const x = MA.apply(fs.readFileSync(path.join(MIGDIR, f), 'utf8'), { file: f, run: s => db.run(s), convertSql: AC.convertSql, log: () => {}, has: () => false }); mig += x.ok; migBad += x.failed; });
  if (BREAK) db.run("UPDATE pa_measurecalc SET selectclause='SELECT COUNT(*)+1 FROM C_Project' WHERE pa_measurecalc_uu='" + PT.BIND.total + "'");
  const twin = A.fromSqlite(db, {}); twin.source = 'sqlite';
  log('§PA_FLAT_DATA twin projects=' + twin.projects.length + ' pacalc=' + twin.pacalc.length + ' migration_statements ok=' + mig + ' failed=' + migBad + ' unavailable=[' + twin.unavailable.join(',') + ']' + (BREAK ? ' (PA_FLAT_BREAK=1: FAIL expected)' : ''));
  ck('W1 the CAPEX scripts applied to the store without a failed statement', migBad === 0, { ok: mig, failed: migBad });
  // (2) the legacy snapshot
  const snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'capex/sample/pilot_snapshot.json'), 'utf8')); snap.source = 'legacy';
  if (!snap.pacalc || !snap.pacalc.length) { snap.pacalc = twin.pacalc; snap.unavailable = (snap.unavailable || []).filter(u => u !== 'pacalc'); log('§PA_FLAT_DATA legacy snapshot has no PA_MeasureCalc rows: given the store\'s ' + twin.pacalc.length + ' (the same scripts legacy applied)'); }
  const snapDay = String((snap.meta && (snap.meta.takenAt || snap.meta.today)) || '2026-11-13').slice(0, 10);
  log('§PA_FLAT_DATA legacy projects=' + snap.projects.length + ' today=' + snapDay + ' unavailable=[' + (snap.unavailable || []).join(',') + ']');
  for (const [name, data, today] of [['twin', twin, TODAY], ['legacy', snap, snapDay]]) {
    const org = (data.projects.find(p => p.AD_Org_ID != null) || {}).AD_Org_ID, prj = (data.projects[0] || {}).Value;
    const filters = [];
    ['all', 'active', 'closed', 'inactive'].forEach(st => { filters.push({ status: st }); if (org != null) filters.push({ status: st, org: String(org) }); });
    if (prj) filters.push({ status: 'all', project: prj });
    for (const f0 of filters) {
      const f = Object.assign({ today }, f0), tag = name + ' ' + JSON.stringify(f0), P = PT.population(data, f);
      const a = T.flatten(T.compute(data, f).tiles), res = PT.compute(deps, data, f), b = T.flatten(res.tiles);
      if (res.pa.errors.length) { ck(tag + ' PA rows ran without error', false, res.pa.errors.slice(0, 4)); continue; }
      if (!P.length) { inc(tag, 'empty population'); continue; }
      const diff = Object.keys(a).filter(k => a[k] !== b[k]), bad = diff.filter(k => f.status === 'all' || D2.indexOf(k) < 0), named = diff.filter(k => bad.indexOf(k) < 0);
      named.forEach(k => log('    §PA_FLAT_D2 ' + tag + ' ' + k + ' tiles=' + JSON.stringify(a[k]) + ' pa=' + JSON.stringify(b[k])));
      bad.forEach(k => log('    §PA_FLAT_DIFF ' + tag + ' ' + k + ' tiles=' + JSON.stringify(a[k]) + ' pa=' + JSON.stringify(b[k])));
      ck(tag + ' population=' + P.length + ' keys=' + Object.keys(a).length + ' pa_judged=' + res.pa.judged + ' D2_named=' + named.length, bad.length === 0, bad.length ? bad : undefined);
    }
  }
  finish();
})().catch(e => { log('§PA_FLAT_VERDICT FAIL harness ' + (e && e.stack || e)); process.exit(1); });
function finish() {
  const v = fails ? 'FAIL' : judged ? 'PASS' : 'INCONCLUSIVE';
  log('§PA_FLAT_VERDICT ' + v + ' judged=' + judged + ' fail=' + fails + ' inconclusive=' + inconc + (BREAK ? ' (PA_FLAT_BREAK=1: FAIL expected)' : ''));
  process.exit(v === 'PASS' ? 0 : 1);
}
