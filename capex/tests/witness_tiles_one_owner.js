#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-TILES-ONE-OWNER (prompts/CAPEX_DASHBOARD.md §5.75 step 4). READ THE LOG; the exit code is not evidence.
// THE ISSUE it proves/disproves: every dashboard number existed TWICE (a PA_MeasureCalc row and a hand formula in capex/tiles.js), and a source without the rows silently showed the hand numbers.
// O1 X of N: N = every canonical key the page can draw (flatten over the sample). Each key is either one of the NAMED not-moved keys (stage, bim_documents, last_updated: §5.66) or it CHANGES to
//    "no data (CAPEX PA rows not installed)" when the rows are taken away - i.e. its value came from a PA row and from nowhere else. A key that keeps a number without the rows = a second owner.
// O2 with the rows the same keys are real values (not the no-rows text), and the PA path reports no error.
// O3 static: capex/tiles.js holds none of the moved formulas (no evm(, no classTile(, no EAC arithmetic, no SPI/CPI comparison) and pa_tiles.js starts from frame(), not from tiles.js compute().
// O4 twin(): a no-rows value against anything is INCONCLUSIVE, never MATCH.
// Break ONE_OWNER_BREAK=1: a hand formula is put back for one tile (total_projects counted in JS) -> O1 must FAIL on that key.
'use strict';
const fs = require('fs'), path = require('path'), H = require('./pa_harness.js'), T = require('../tiles.js'), log = console.log, BREAK = process.env.ONE_OWNER_BREAK === '1';
let judged = 0, fails = 0;
const ck = (n, ok, i) => { judged++; if (!ok) fails++; log('  §ONE_OWNER ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (i !== undefined ? ' ' + JSON.stringify(i).slice(0, 700) : '')); };
const NOT_MOVED = ['stage', 'bim_documents', 'last_updated'], NP = 'no data (' + T.NOPA + ')';
(async () => {
  await H.init();
  const snap = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'sample', 'pilot_snapshot.json'), 'utf8')), f = { today: '2026-11-04', status: 'all', org: '', category: '', project: '' };
  const without = Object.assign({}, snap, { pacalc: [] }), comp0 = T.compute;
  if (BREAK) T.compute = function (d, ff) { const r = comp0(d, ff); r.tiles.total_projects = { n: (d.projects || []).length, closed: 0 }; return r; };   // a hand formula back for one tile
  const withRows = H.compute(snap, f), noRows = H.PT.compute({ SQL: null, GE: null, AC: null, T, A: H.A, log: () => {} }, without, f);
  T.compute = comp0;
  const a = H.flatten(withRows.tiles), b = H.flatten(noRows.tiles), keys = Object.keys(a);
  log('§ONE_OWNER_DATA keys=' + keys.length + ' not_moved=' + JSON.stringify(NOT_MOVED) + ' pa_judged=' + withRows.pa.judged + ' no_rows_errors=' + JSON.stringify(noRows.pa.errors) + (BREAK ? ' (ONE_OWNER_BREAK=1: FAIL expected)' : ''));
  const moved = keys.filter(k => NOT_MOVED.indexOf(k) < 0), second = moved.filter(k => b[k] !== NP), unknownNotMoved = NOT_MOVED.filter(k => keys.indexOf(k) < 0);
  ck('O1 ' + (moved.length - second.length) + ' of ' + moved.length + ' moved keys read "' + NP + '" without the rows (N = ' + keys.length + ' drawn keys, ' + NOT_MOVED.length + ' named not-moved)', second.length === 0 && moved.length > 20 && !unknownNotMoved.length, { second_owner: second.map(k => k + '=' + b[k]), unknownNotMoved });
  const stillNoData = moved.filter(k => a[k] === NP);
  ck('O2 with the rows no moved key shows the no-rows text and the PA path has no error (' + withRows.pa.judged + ' rows judged)', stillNoData.length === 0 && withRows.pa.errors.length === 0 && withRows.pa.judged > 30, { stillNoData, errors: withRows.pa.errors.slice(0, 3) });
  const src = fs.readFileSync(path.join(__dirname, '..', 'tiles.js'), 'utf8'), pt = fs.readFileSync(path.join(__dirname, '..', 'pa_tiles.js'), 'utf8');
  const forbidden = [/function evm\(/, /classTile\(/, /basisDiffers\s*=/, /\bspi\b\s*[:=<>]/, /\bcpi\b\s*[:=<>]/, /fsum\[/, /overcommitted\.push/, /HOL\.ready/].filter(re => re.test(src)).map(String);
  ck('O3 tiles.js holds none of the moved formulas, and pa_tiles.js starts from frame()', forbidden.length === 0 && /deps\.T\.frame\(data, f\)/.test(pt) && !/base\.tiles/.test(pt), { forbidden, lines: src.split('\n').length });
  const tw = H.twin({ k: NP, m: '3' }, { k: '5', m: '3' }, () => {});
  ck('O4 twin(): a no-rows value is INCONCLUSIVE, never MATCH or DIFF', tw.inconclusive === 1 && tw.match === 1 && tw.diff === 0, tw);
  const v = fails ? 'FAIL' : 'PASS';
  log('§ONE_OWNER_VERDICT ' + v + ' judged=' + judged + ' fail=' + fails + (BREAK ? ' (ONE_OWNER_BREAK=1: FAIL expected)' : ''));
  process.exit(v === 'PASS' ? 0 : 1);
})().catch(e => { log('§ONE_OWNER_VERDICT FAIL harness ' + (e && e.stack || e)); process.exit(1); });
