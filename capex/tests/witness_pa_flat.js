#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-PA-FLAT (prompts/CAPEX_DASHBOARD.md §5.66 PR B, re-based by §5.75 steps 4-5). READ THE LOG; the exit code is not evidence.
// HISTORY: until §5.75 step 4 this witness proved "PA rows == the hand formulas in capex/tiles.js" live, key by key and drill row by drill row. Step 4 DELETED those formulas, so that oracle no longer exists.
// WHAT IT PROVES NOW: the page's PA path (capex/pa_tiles.js + goal_engine over the sample's own PA rows) still gives, for every filter case, exactly what the hand formulas gave on their LAST commit:
//   capex/tests/pa_flat_golden.json was recorded BY THE HAND FORMULAS (tiles.js compute at the commit named in the file), when PA == hand held for all its cases. It is a regression pin of the page path,
//   not an oracle of the rows: the oracle of the rows is legacy's own engine (W-PA-TILES, pilot). A legitimate change of a PA row or of the sample changes these values: re-record ONLY with the reason
//   written in §5.75 (never to make a red run green).
// Cases: per recorded filter - F flat values equal · D drill keys, ids, order and the health / schedule / budget labels equal. An empty population is INCONCLUSIVE.
// Breaks (each must FAIL): PA_FLAT_BREAK=1 the Total row counts +1 · PA_DRILL_BREAK=1 the Red row selects every active project.
'use strict';
const fs = require('fs'), path = require('path'), H = require('./pa_harness.js');
const GOLD = JSON.parse(fs.readFileSync(path.join(__dirname, 'pa_flat_golden.json'), 'utf8')), SNAP = path.join(__dirname, '..', 'sample', 'pilot_snapshot.json'), log = console.log;
let judged = 0, fails = 0, inconc = 0, rowsJudged = 0, keysJudged = 0;
const ck = (n, ok, i) => { judged++; if (!ok) fails++; log('  §PA_FLAT ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (i !== undefined ? ' ' + JSON.stringify(i).slice(0, 700) : '')); };
(async () => {
  await H.init();
  const snap = JSON.parse(fs.readFileSync(SNAP, 'utf8')); let rows = null;
  if (process.env.PA_FLAT_BREAK === '1' || process.env.PA_DRILL_BREAK === '1') { rows = JSON.parse(JSON.stringify(snap.pacalc));
    if (process.env.PA_FLAT_BREAK === '1') rows.find(r => r.PA_MeasureCalc_UU === H.PT.BIND.total).SelectClause = 'SELECT COUNT(*)+1 FROM C_Project';
    if (process.env.PA_DRILL_BREAK === '1') rows.find(r => r.PA_MeasureCalc_UU === H.PT.BIND.red).WhereClause = "WHERE p.IsActive='Y'"; }
  log('§PA_FLAT_DATA golden recorded=' + GOLD.recorded + ' by the hand formulas at commit ' + GOLD.commit + ' cases=' + GOLD.cases.length + ' today=' + GOLD.today + ' sample pacalc=' + (snap.pacalc || []).length + (rows ? ' (BREAK: FAIL expected)' : ''));
  for (const c of GOLD.cases) {
    const f = Object.assign({ today: GOLD.today, org: '', category: '', project: '' }, c.filter), tag = JSON.stringify(c.filter);
    if (!c.population.P) { inconc++; log('  §PA_FLAT ' + tag + ' INCONCLUSIVE empty population'); continue; }
    let res; try { res = H.compute(snap, f, rows ? { rows } : null); } catch (e) { ck(tag + ' PA rows ran without error', false, String(e.message).slice(0, 200)); continue; }
    const flat = H.flatten(res.tiles), fbad = Object.keys(c.flat).concat(Object.keys(flat)).filter((k, i, a) => a.indexOf(k) === i && c.flat[k] !== flat[k]);
    ck(tag + ' F ' + (Object.keys(c.flat).length - fbad.length) + ' of ' + Object.keys(c.flat).length + ' flat values equal the recorded ones (pa_judged=' + res.pa.judged + ')', fbad.length === 0, fbad.slice(0, 5).map(k => k + ' recorded=' + c.flat[k] + ' pa=' + flat[k]));
    const keys = Object.keys(c.drill).concat(Object.keys(res.drill)).filter((k, i, a) => a.indexOf(k) === i), dbad = []; let n = 0;
    keys.forEach(k => { const a = JSON.stringify(c.drill[k]), b = res.drill[k] ? JSON.stringify(res.drill[k].map(r => [r.id, r.health, r.schedule, r.budget])) : undefined; n += (c.drill[k] || []).length; if (a !== b) dbad.push({ key: k, recorded: (c.drill[k] || []).length, pa: (res.drill[k] || []).length }); });
    keysJudged += keys.length; rowsJudged += n;
    ck(tag + ' D ' + (keys.length - dbad.length) + ' of ' + keys.length + ' drill keys equal (' + n + ' rows: ids, order, labels)', dbad.length === 0, dbad.slice(0, 5));
  }
  log('§PA_FLAT_DRILL keys_judged=' + keysJudged + ' rows_judged=' + rowsJudged);
  if (!rowsJudged) { inconc++; log('  §PA_FLAT DRILL INCONCLUSIVE no drill row was judged'); }
  const v = fails ? 'FAIL' : judged ? 'PASS' : 'INCONCLUSIVE';
  log('§PA_FLAT_VERDICT ' + v + ' judged=' + judged + ' fail=' + fails + ' inconclusive=' + inconc + (rows ? ' (BREAK: FAIL expected)' : ''));
  process.exit(v === 'PASS' ? 0 : 1);
})().catch(e => { log('§PA_FLAT_VERDICT FAIL harness ' + (e && e.stack || e)); process.exit(1); });
