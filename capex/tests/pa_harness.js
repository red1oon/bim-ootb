// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — capex/tests/pa_harness.js (prompts/CAPEX_DASHBOARD.md §5.75 step 3). NOT a witness: the ONE node way to compute the dashboard's numbers the way the page does,
//   i.e. from PA_MeasureCalc ROWS through capex/pa_tiles.js + the kernel's goal_engine, so a node witness or tool no longer calls the hand formulas in tiles.js.
// Use:  const H = require('./pa_harness.js'); await H.init();  then H.compute(data, f) is SYNCHRONOUS and returns what tiles.js compute() returned: { tiles, drill, pop, formula, caveat } + pa { judged, errors }.
//   H.flatten / H.twin / H.projectDetail / H.FORMULA are tiles.js's own (presentation, not formulas).
// The rows: a data set that carries PA_MeasureCalc rows (entity `pacalc`: the twin store, a legacy snapshot) is computed from ITS rows. A data set with none (a synthetic fixture) is LENT the rows the
//   pilot server serves, as stored in capex/sample/pilot_snapshot.json (taken by legacy_snapshot.js --add pacalc, §5.75 step 1); H.lent counts those and init() says where the rows came from.
//   opts.rows = a row list to use instead (a witness falsifier: H.rows() returns a deep copy to mutate). A PA error is THROWN unless opts.allowErrors (a number silently missing is never a result).
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..', '..');
const T = require('../tiles.js'), A = require('../adapters.js'), PT = require('../pa_tiles.js');
let deps = null, ROWS = null;
const API = { lent: 0, T, A, PT, _sumBy: T._sumBy, flatten: T.flatten, twin: T.twin, FORMULA: T.FORMULA, CAVEAT: T.CAVEAT, PER_SOURCE: T.PER_SOURCE };
API.init = async function (opts) {
  if (deps) return API;
  const initSqlJs = require('sql.js'), SQL = await initSqlJs(), GE = require(path.join(ROOT, 'erp/goal_engine.js')), AC = require(path.join(ROOT, 'erp/ad_callout.js'));
  ['support', 'support_stock', 'views', 'currency', 'uom', 'pricing', 'tax', 'sqlfn'].forEach(m => require(path.join(ROOT, 'erp/callouts', m + '.js')));   // the host's SQL function ports (TRUNC, daysbetween ...)
  const snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'capex/sample/pilot_snapshot.json'), 'utf8'));
  ROWS = snap.pacalc || [];
  if (!ROWS.length) throw new Error('pa_harness: capex/sample/pilot_snapshot.json holds no PA_MeasureCalc rows (run capex/tools/legacy_snapshot.js --add pacalc)');
  deps = { SQL, GE, AC, T, A, log: (opts && opts.log) || function () {} };
  if (!(opts && opts.quiet)) console.log('§PA_HARNESS ready rows_to_lend=' + ROWS.length + ' (the pilot\'s PA_MeasureCalc rows in capex/sample/pilot_snapshot.json' + (snap.meta && snap.meta.added && snap.meta.added.pacalc ? ', taken ' + String(snap.meta.added.pacalc).slice(0, 10) : '') + ')');
  return API;
};
API.rows = function () { if (!ROWS) throw new Error('pa_harness: call await init() first'); return JSON.parse(JSON.stringify(ROWS)); };
API.compute = function (data, f, opts) {
  if (!deps) throw new Error('pa_harness: call await init() first');
  opts = opts || {}; let d = data;
  // lend when the data set lacks the bound CAPEX rows: no rows at all (a fixture), or a store that holds only the ERP's stock PA rows (the seed without the CAPEX pack). Its own rows are kept.
  const have = {}; (data.pacalc || []).forEach(r => { have[String(r.PA_MeasureCalc_UU)] = 1; });
  const lacks = Object.keys(PT.BIND).some(k => !have[PT.BIND[k]]);
  if (opts.rows) d = Object.assign({}, data, { pacalc: opts.rows, unavailable: (data.unavailable || []).filter(u => u !== 'pacalc') });
  else if (lacks) { d = Object.assign({}, data, { pacalc: (data.pacalc || []).concat(ROWS.filter(r => !have[String(r.PA_MeasureCalc_UU)])), unavailable: (data.unavailable || []).filter(u => u !== 'pacalc') }); API.lent++; }
  ['phaseRef', 'wf', 'currencies', 'orgs', 'phases', 'tasks', 'lines'].forEach(e => { if (d[e] == null && (d.unavailable || []).indexOf(e) < 0) { if (d === data) d = Object.assign({}, data); d[e] = []; } });   // a fixture that names only its own entities
  const r = PT.compute(deps, d, f || {});
  if (r.pa.errors.length && !opts.allowErrors) throw new Error('pa_harness: PA rows failed: ' + r.pa.errors.slice(0, 3).join(' | '));
  return r;
};
API.projectDetail = function (data, f, id, opts) { return T.projectDetail(data, f, id, function (d2, f2) { return API.compute(d2, f2, opts); }); };
module.exports = API;
