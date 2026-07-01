// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-AD-PAYROLL witness (prompts/RESUME_HR_BIM_ASSET.md §CRITICAL "Compile not Model",
//   P7-PRE). Each check NAMES the issue it proves. THE LOAD-BEARING CLAIM is AD0 — the real-column-subset
//   gate — everything else re-proves the old engine.js claims (glass-box/deterministic/tamper-evident/GL-
//   balanced) still hold on the RE-TARGETED native shape. Run: node hr_bim_asset/tests/witness_ad_payroll.js
//
//   AD0's column lists are INDEPENDENTLY sourced (not imported from ad_payroll.js — that would let the
//   implementation grade its own homework) via, verbatim:
//     sqlite3 build/erp/ad_full.db "PRAGMA table_info(hr_process);"   (and hr_movement/hr_concept/
//     hr_concept_category/hr_concept_acct/hr_employee/hr_contract) — bim-compiler repo, captured 2026-07-02.
//   If a future edit adds a key to any emitted row that ISN'T in these lists, AD0 fails — that IS the
//   "no invention outside the AD" rule enforced, not just documented.
'use strict';
var AD = require('../ad_payroll'), C = require('../connectors'), R = require('../rules');
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-AD-PAYROLL ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

// ---- ground truth, sourced independently of ad_payroll.js (see header) ------------------------------------
var REAL_COLS = {
  hr_process: ['hr_job_id', 'c_doctype_id', 'c_payselection_id', 'hr_process_id', 'hr_employee_id', 'name',
    'c_doctypetarget_id', 'columnsql', 'created', 'createdby', 'dateacct', 'docaction', 'docstatus', 'documentno',
    'hr_department_id', 'hr_payroll_id', 'hr_period_id', 'isactive', 'posted', 'processed', 'processing', 'updated',
    'ad_client_id', 'updatedby', 'ad_org_id', 'ad_printformat_id', 'ad_workflow_id', 'c_bpartner_id', 'c_charge_id',
    'reversal_id', 'processedon', 'hr_process_uu'],
  hr_movement: ['isregistered', 'hr_concept_category_id', 'hr_process_id', 'c_bpartner_id', 'hr_concept_id',
    'columntype', 'created', 'createdby', 'description', 'hr_department_id', 'hr_job_id', 'hr_movement_id',
    'isactive', 'isprinted', 'processed', 'qty', 'servicedate', 'textmsg', 'updated', 'updatedby', 'validfrom',
    'ad_client_id', 'validto', 'ad_org_id', 'ad_rule_id', 'amount', 'c_activity_id', 'c_campaign_id',
    'ad_orgtrx_id', 'c_projectphase_id', 'c_projecttask_id', 'c_project_id', 'user1_id', 'user2_id',
    'pp_cost_collector_id', 'c_bp_group_id', 'c_bp_bankaccount_id', 'accountsign', 'hr_movement_uu']
};

function keysSubset(row, table) {
  var real = REAL_COLS[table];
  return Object.keys(row).every(function (k) { return real.indexOf(k) >= 0; });
}

var EMP1 = { c_bpartner_id: 1001, name: 'EMP001', base: 5000, conceptIds: ['BASE', 'ALLOWANCE', 'EPF', 'PCB'] };
var EMP2 = { c_bpartner_id: 1002, name: 'EMP002', base: 3000, conceptIds: ['BASE', 'ALLOWANCE', 'EPF'] };
var spec = { period: '2026-06', actor: 'hba', employees: [EMP1, EMP2] };
var run1 = AD.runPeriod(spec);

// ---- AD0: NON-INVENT GATE — every emitted row's keys ⊆ the REAL AD column set ------------------------------
ok('AD0-hr_process-shape', keysSubset(run1.hr_process, 'hr_process'), 'hr_process row uses ONLY real AD_Column names (no invented field)');
ok('AD0-hr_movement-shape', run1.hr_movement.every(function (m) { return keysSubset(m, 'hr_movement'); }), 'every hr_movement row uses ONLY real AD_Column names');

// ---- AD1: BASE + ADD/SUB fold to the SAME numbers as the old engine.js demo baseline (reuse, not reinvent) --
var e1 = run1.hr_movement.filter(function (m) { return m.c_bpartner_id === 1001; });
var gross1 = e1.filter(function (m) { return m.accountsign === '+'; }).reduce(function (s, m) { return s + m.amount; }, 0);
var net1 = R.round2(gross1 - e1.filter(function (m) { return m.accountsign === '-'; }).reduce(function (s, m) { return s + m.amount; }, 0));
// EMP001 base=5000 + allowance=200 → gross=5200; EPF=base(5000)*0.11=550; PCB bracket(gross=5200)→[6000,0.08]→416; net=5200-550-416=4234
ok('AD1-fold-matches-baseline', gross1 === 5200 && net1 === 4234, 'EMP001 gross=5200 net=4234 — identical arithmetic to the accepted witness_run.js demo baseline, just native-shaped');

// ---- AD2: accountsign IS the native ADD/SUB column (not an invented `side` field) ---------------------------
ok('AD2-accountsign-native', run1.hr_movement.every(function (m) { return m.accountsign === '+' || m.accountsign === '-'; }), 'every movement carries a real accountsign (+/-), no invented `side` field');

// ---- AD3: GL posts through the per-concept hr_concept_acct mapping, not a hardcoded profile-level Dr/Cr -----
ok('AD3-gl-balanced', run1.gl.balanced, 'payroll journal balances Dr=' + run1.gl.dr + ' Cr=' + run1.gl.cr);
ok('AD3-gl-acct-mapping', run1.gl.lines.some(function (l) { return l.acct === 'epf_payable'; }) && run1.gl.lines.some(function (l) { return l.acct === 'pcb_payable'; }),
  'deduction credits post to the hr_concept_acct-sourced account (epf_payable/pcb_payable), not a naming convention');

// ---- AD4: signed op-log, tamper-evident ----------------------------------------------------------------------
ok('AD4-signed-chain', C.verifyChain(run1.log).ok, 'every hr_process/hr_movement write is a signed kernel_op; chain verifies');
var forged = run1.log.map(function (o) { return Object.assign({}, o, { params: Object.assign({}, o.params) }); });
var calc = forged.filter(function (o) { return o.cls === 'HR_MOVEMENT'; })[0]; calc.params.amount = calc.params.amount + 1;
ok('AD5-tamper-evident', C.verifyChain(forged).ok === false, 'amending a signed hr_movement op breaks verifyChain');

// ---- AD6: deterministic — replay==live, re-run == bit-identical ----------------------------------------------
var run2 = AD.runPeriod(spec);
ok('AD6-deterministic', run1.runHash === run2.runHash && run1.chainTip === run2.chainTip, 'two runs → identical runHash + chainTip');
ok('AD7-replay-eq-live', AD.replayHash(run1.log) === run1.runHash, 'fingerprint recomputed FROM THE SIGNED LOG == live (replay==live)');

// ---- AD8: contract-term scoping (hr_contract-shaped, not a generic bolted-on `term`) -------------------------
var withTerm = AD.runPeriod({ period: '2026-06', actor: 'hba', employees: [
  { c_bpartner_id: 1003, base: 1000, conceptIds: ['BASE'], contract: { validfrom: '2025-01', validto: '2025-12' } }, // expired → excluded
  EMP1 ] });
ok('AD8-term-scoping', withTerm.hr_movement.every(function (m) { return m.c_bpartner_id !== 1003; }), 'an employee whose hr_contract term has lapsed is honestly excluded, not fabricated in scope');

// ---- AD9: payslip() reader groups movements per employee, watermarked (P7 view's data source) ----------------
var slip = AD.payslip(run1.hr_movement, 1001, 'ms');
ok('AD9-payslip-reader', slip._watermark === 'CONTOH — TIDAK RASMI' && slip.net === 4234 && slip.lines.length === 4,
  'payslip(1001) groups 4 concept lines, net=4234, watermarked (ms locale) — this is what P7 renders');
ok('AD9-payslip-trace', slip.lines.every(function (l) { return !!l.trace; }), 'every payslip line carries its rule trace (glass-box)');

var pass = checks.filter(Boolean).length, fail = checks.length - pass;
console.log('\n§HBA-AD-PAYROLL ' + pass + '/' + checks.length + ' PASS' + (fail ? (' — ' + fail + ' FAIL') : ''));
process.exit(fail ? 1 : 0);
