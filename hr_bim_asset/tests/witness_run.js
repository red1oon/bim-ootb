// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-ALPHA witness. Each check NAMES the issue it proves (CLAUDE.md test mandate).
//   Run: node hr_bim_asset/tests/witness_run.js   — reads § lines; exit 0 = green. Read log after run.
'use strict';
var C = require('../connectors'), E = require('../engine'), R = require('../rules'), M = require('../models'), W = require('../watermark');
var checks = [];
function ok(tag, cond, msg) { checks.push({ tag: tag, ok: !!cond, msg: msg }); console.log('§HBA ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

// ---- ALPHA MODELS: the feature exists, demoable (singular records, watermarked) -------------------
var want = ['Tenancy', 'PropertyManagement', 'Strata', 'Asset'];
ok('M1-models-defined', want.every(function (n) { return M.model(n) && M.model(n).label; }), 'AD models defined: ' + want.map(function (n) { return M.model(n).label; }).join(' · '));
ok('M2-singular-record', want.every(function (n) { return M.records(n).length >= 1; }), 'every model has ≥1 demo record (alpha)');
ok('M3-watermarked', want.every(function (n) { return M.records(n).every(function (r) { return r._watermark === 'SAMPLE — NOT OFFICIAL'; }); }), 'every demo record carries the alpha watermark');
var a = M.records('Asset')[0];
ok('M4-asset-7D-link', a.bim_guid && a.iot_device && a.operator && a.vendor && a.personnel && a.next_due,
   'Asset links BIM(' + a.bim_guid + ') + IoT(' + a.iot_device + ') + operator/vendor/personnel + schedule(' + a.next_due + ')');

// ---- ENGINE: payroll (profile #1) is just one configuration of the generic RUN -------------------
var payElements = [
  { id: 'allowance', name: 'Allowance', side: 'ADD', rule: { kind: 'FIXED', amount: 200 } },
  { id: 'epf', name: 'EPF (demo)', side: 'SUB', rule: { kind: 'RATE', of: 'base', pct: 0.11 } },
  { id: 'tax', name: 'PCB (demo)', side: 'SUB', rule: { kind: 'BRACKET', of: 'gross', table: [[2000, 0], [4000, 0.03], [6000, 0.08], [1e12, 0.13]] } }
];
var payParties = [{ id: 'EMP001', base: 5000, elementIds: ['allowance', 'epf', 'tax'] }, { id: 'EMP002', base: 3000, elementIds: ['allowance', 'epf'] }];
var paySpec = { profile: 'payroll', period: '2026-06', parties: payParties, elements: payElements };
var run1 = E.runPeriod(paySpec);

// glass-box: EVERY line traces to its rule AND recomputes to the shown amount (no unexplained number)
var glassBox = run1.statements.every(function (s) {
  return s.lines.every(function (l) {
    if (!l.rule || !l.trace) return false;
    var el = payElements.filter(function (e) { return e.id === l.element; })[0];
    return R.evalRule(el.rule, { base: s.base, gross: s.gross }).amount === l.amount;
  });
});
ok('E1-glass-box', glassBox, 'every statement line cites a rule + recomputes exactly (self-explaining)');
ok('E2-net-consistent', run1.statements.every(function (s) { return s.net === R.round2(s.gross - s.subTotal); }), 'net == gross − Σdeductions for every statement');
ok('E3-watermark-out', run1.statements.every(function (s) { return s._watermark === 'SAMPLE — NOT OFFICIAL'; }), 'every payslip carries the alpha watermark');
ok('E3b-watermark-ms', E.runPeriod({ profile: 'payroll', period: '2026-06', parties: payParties, elements: payElements, locale: 'ms' }).statements[0]._watermark === 'CONTOH — TIDAK RASMI', 'MS locale → CONTOH — TIDAK RASMI');

// deterministic re-run: identical fingerprint + chain tip; replay-from-log == live
var run2 = E.runPeriod(paySpec);
ok('E4-deterministic', run1.runHash === run2.runHash && run1.chainTip === run2.chainTip, 'two runs → identical runHash + chainTip (bit-identical)');
ok('E5-replay-eq-live', E.replayHash(run1.log) === run1.runHash, 'fingerprint recomputed FROM THE SIGNED LOG == live (replay==live)');
var run3 = E.runPeriod({ profile: 'payroll', period: '2026-06', parties: [{ id: 'EMP001', base: 9999, elementIds: ['allowance', 'epf', 'tax'] }, payParties[1]], elements: payElements });
ok('E6-input-sensitive', run3.runHash !== run1.runHash, 'changing an input changes the fingerprint (not a frozen constant)');

// tamper-evident: amend a signed op param without re-sign → chain verification breaks
var forged = run1.log.map(function (o) { return Object.assign({}, o, { params: Object.assign({}, o.params) }); });
var calc = forged.filter(function (o) { return o.verb === 'CALC'; })[0]; calc.params.net = calc.params.net + 1;
ok('E7-tamper-evident', C.verifyChain(forged).ok === false, 'amending a signed op param breaks verifyChain (' + C.verifyChain(forged).why + ')');
ok('E8-gl-balanced', run1.gl.balanced && Math.abs(run1.gl.dr - run1.gl.cr) < 1e-9, 'payroll journal balances Dr=' + run1.gl.dr + ' Cr=' + run1.gl.cr);

// ---- SAME ENGINE, four profiles — payroll · tenancy · strata · maintenance -----------------------
var ten = E.runPeriod({ profile: 'tenancy', period: '2026-06',
  parties: [{ id: 'L-0001', base: 1800, term: { start: '2026-01', end: '2026-12' } },
            { id: 'L-EXP', base: 1000, term: { start: '2025-01', end: '2025-12' } }],   // out-of-term → excluded
  elements: [{ id: 'service', name: 'Service charge', side: 'ADD', rule: { kind: 'FIXED', amount: 120 } }] });
ok('P-tenancy-term', ten.statements.length === 1 && ten.statements[0].partyId === 'L-0001', 'tenancy run filters to in-term leases (1 of 2), GL dir ' + ten.dir);
ok('P-tenancy-gl', ten.gl.balanced, 'rent invoice journal balances (AR)');

var strata = E.runPeriod({ profile: 'strata', period: '2026-06',
  parties: [{ id: 'A-12-03', base: 280, elementIds: ['sinking'] }],
  elements: [{ id: 'sinking', name: 'Sinking fund', side: 'ADD', rule: { kind: 'RATE', of: 'base', pct: 0.2 } }] });
ok('P-strata', strata.statements.length === 1 && strata.statements[0].net === 336 && strata.gl.balanced, 'strata fee run (owner charge) net=336, GL balances');

var maint = E.runPeriod({ profile: 'maintenance', period: '2026-06',
  parties: [{ id: 'AHU-03', base: 0, elementIds: ['labor', 'parts'] }],
  elements: [{ id: 'labor', name: 'Labor', side: 'ADD', rule: { kind: 'FIXED', amount: 150 } },
             { id: 'parts', name: 'Parts', side: 'ADD', rule: { kind: 'FIXED', amount: 90 } }] });
ok('P-maintenance', maint.statements.length === 1 && maint.statements[0].net === 240 && maint.gl.balanced, 'maintenance work order (cost) net=240, GL balances');
ok('P-one-engine', [run1, ten, strata, maint].every(function (r) { return r.statements.length >= 1; }), 'ONE runPeriod served payroll · tenancy · strata · maintenance');

// ---- verdict --------------------------------------------------------------------------------------
var pass = checks.filter(function (c) { return c.ok; }).length, fail = checks.length - pass;
console.log('\n§HBA-ALPHA ' + pass + '/' + checks.length + ' PASS' + (fail ? (' — ' + fail + ' FAIL') : ''));
process.exit(fail ? 1 : 0);
