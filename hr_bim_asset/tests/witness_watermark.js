// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-WATERMARK witness (§DISCLAIMER acceptance — the LOAD-BEARING mark). The disclaimer
//   is enforced, not stated: this enumerates EVERY output-class surface the module produces and asserts each
//   carries the locale-aware CONTOH/SAMPLE mark. Acceptance = (# output surfaces) == (# carrying the mark);
//   ANY miss = FAIL. This is the §WATERMARK coverage check named in §DISCLAIMER. Run:
//     node hr_bim_asset/tests/witness_watermark.js
'use strict';
var E = require('../engine'), M = require('../models'), L = require('../lens'), T = require('../timeline'), Wm = require('../watermark');
var EN = Wm.mark('en'), MS = Wm.mark('ms');
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-WM ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }
function marked(o) { return o && (o._watermark === EN || o._watermark === MS); }

// enumerate the OUTPUT-CLASS SURFACES (label → array of artifacts that must each carry the mark)
var surfaces = {};

// 1. engine statements — one per profile (payslip · rent invoice · fee notice · work order)
var SPECS = {
  payroll:     { profile: 'payroll',     period: '2026-06', parties: [{ id: 'EMP1', base: 1000 }], elements: [{ id: 'epf', name: 'EPF', side: 'SUB', rule: { kind: 'RATE', of: 'base', pct: 0.11 } }] },
  tenancy:     { profile: 'tenancy',     period: '2026-06', parties: [{ id: 'L1', base: 1800, term: { start: '2026-01', end: '2026-12' } }], elements: [] },
  strata:      { profile: 'strata',      period: '2026-06', parties: [{ id: 'O1', base: 280 }], elements: [] },
  maintenance: { profile: 'maintenance', period: '2026-06', parties: [{ id: 'A1', base: 240 }], elements: [] }
};
surfaces['engine statements'] = Object.keys(SPECS).map(function (k) { return E.runPeriod(SPECS[k]).statements[0]; });

// 2. AD model records — every demo record of every model
surfaces['AD model records'] = ['Tenancy', 'PropertyManagement', 'Strata', 'Asset'].reduce(function (acc, m) { return acc.concat(M.records(m)); }, []);

// 3. Find-lens rows — tenancy + IoT
surfaces['lens rows'] = L.tenancyRows('2026-06').concat(L.iotRows());

// 4. derived PM schedule — the schedule container + every task (each exportable)
var pm = T.buildSchedule(M.records('Asset'), { from: '2026-07', months: 6 });
surfaces['PM schedule'] = [pm.schedule].concat(pm.tasks);

// ---- coverage: each surface, count carrying the mark == count of artifacts (no silent miss) ---------------
var totalArtifacts = 0, totalMarked = 0;
Object.keys(surfaces).forEach(function (label) {
  var arr = surfaces[label], n = arr.length, m = arr.filter(marked).length;
  totalArtifacts += n; totalMarked += m;
  ok('cover:' + label, n > 0 && m === n, label + ' — ' + m + '/' + n + ' carry the mark');
});
ok('TOTAL-coverage', totalArtifacts > 0 && totalMarked === totalArtifacts,
  'EVERY output surface carries the disclaimer: ' + totalMarked + '/' + totalArtifacts + ' (any miss = FAIL)');

// ---- locale: the SAME surface re-renders the right string per locale (MS = CONTOH, EN = SAMPLE) -----------
ok('locale-ms', E.runPeriod(Object.assign({ locale: 'ms' }, SPECS.payroll)).statements[0]._watermark === MS && MS === 'CONTOH — TIDAK RASMI',
  'MS locale → CONTOH — TIDAK RASMI');
ok('locale-en', E.runPeriod(Object.assign({ locale: 'en' }, SPECS.payroll)).statements[0]._watermark === EN && EN === 'SAMPLE — NOT OFFICIAL',
  'EN (default) locale → SAMPLE — NOT OFFICIAL');
ok('locale-pm-ms', T.buildSchedule(M.records('Asset'), { from: '2026-07', months: 1, locale: 'ms' }).schedule._watermark === MS,
  'derived PM schedule honours locale (MS → CONTOH)');

var pass = checks.filter(Boolean).length, fail = checks.length - pass;
console.log('\n§HBA-WM ' + pass + '/' + checks.length + ' PASS' + (fail ? (' — ' + fail + ' FAIL') : ''));
process.exit(fail ? 1 : 0);
