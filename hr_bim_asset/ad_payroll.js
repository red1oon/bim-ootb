// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — PAYROLL RE-TARGETED ONTO NATIVE iDempiere AD TABLES (prompts/RESUME_HR_BIM_ASSET.md
//   §CRITICAL "Compile not Model", P7-PRE). SUPERSEDES engine.js's payroll profile (which stays in place,
//   untouched, only because witness_leave.js still depends on it — do not delete it in this pass).
//
//   NON-INVENT GATE: every row shape below uses ONLY column names verified to exist in the REAL iDempiere
//   dictionary — checked against `~/idempiere-dev-setup/idempiere` upstream source AND this project's own
//   compiled `build/erp/ad_full.db` (`PRAGMA table_info(<table>)`), not assumed from memory. The witness
//   (`tests/witness_ad_payroll.js`) holds an INDEPENDENTLY-sourced copy of those column lists and asserts
//   every emitted row's keys are a SUBSET — the enforcement of "no invention outside the AD," not just prose.
//
//   Tables compiled into: hr_process (the run) · hr_movement (the calculated line, one row per employee ×
//   concept) · hr_concept / hr_concept_category (the pay-element rule's IDENTITY) · hr_concept_acct (the GL
//   account mapping) · hr_employee / hr_contract (the party + term). What stays OURS on top (not invented,
//   not native either): the declarative JSON rule + `.trace` (rules.js) as the execution engine for
//   `hr_concept` — native iDempiere only offers an opaque `AD_Rule` script here, ours is glass-box AND
//   auditable, a genuine improvement kept deliberately. Same for the signed op-log (W-SIGN) wrapping every
//   hr_process/hr_movement write — no native AD table is tamper-evident or replay-verifiable; that's real,
//   additive value sitting ON TOP of the native rows, not competing with them.
//
//   Demo concept rates (BASE/ALLOWANCE/EPF/PCB) are the SAME accepted demo baseline already witnessed in
//   `tests/witness_run.js` (E1-E8) — reused, not re-invented — and remain flagged as demo/unsourced pending
//   §RESEARCH GATE (P9, paused) before any real statutory rate replaces them.
'use strict';
(function () {
var _r = (typeof require !== 'undefined');
var C = _r ? require('./connectors') : (self.HrConnectors);
var R = _r ? require('./rules') : (self.HrRules);
var W = _r ? require('./watermark') : (self.HbaWatermark);

// ---- native hr_concept_category rows (the EARNINGS/DEDUCTIONS grouping the native dictionary expects) ----
var CATEGORIES = {
  EARNINGS:   { hr_concept_category_id: 1, value: 'EARNINGS',   name: 'Earnings' },
  DEDUCTIONS: { hr_concept_category_id: 2, value: 'DEDUCTIONS', name: 'Deductions' }
};

// ---- native hr_concept rows (identity only — `accountsign` IS the native ADD/SUB column, not invented) ----
// `rule` is OUR execution-engine attachment (rules.js shape), keyed by the real `value` business key — the
// honest substitute for native iDempiere's opaque `ad_rule_id` AD_Rule script (see file header).
var CONCEPTS = {
  BASE:      { hr_concept_id: 1, value: 'BASE',      name: 'Base Salary',     hr_concept_category_id: 1, accountsign: '+', type: 'D', columntype: 'A', rule: null }, // amount = employee.base directly
  ALLOWANCE: { hr_concept_id: 2, value: 'ALLOWANCE',  name: 'Allowance',       hr_concept_category_id: 1, accountsign: '+', type: 'D', columntype: 'A', rule: { kind: 'FIXED', amount: 200 } },
  EPF:       { hr_concept_id: 3, value: 'EPF',        name: 'EPF (demo)',     hr_concept_category_id: 2, accountsign: '-', type: 'D', columntype: 'A', rule: { kind: 'RATE', of: 'base', pct: 0.11 } },
  PCB:       { hr_concept_id: 4, value: 'PCB',        name: 'PCB (demo)',     hr_concept_category_id: 2, accountsign: '-', type: 'D', columntype: 'A', rule: { kind: 'BRACKET', of: 'gross', table: [[2000, 0], [4000, 0.03], [6000, 0.08], [1e12, 0.13]] } },
  // amount is PER-EMPLOYEE-PER-PERIOD (leave.js's leaveDeduction), same reason BASE.rule is null — fed via
  // emp.extra, not evaluated by rules.js. Closes the P8 leave→payroll seam onto the native shape (was engine.js).
  UNPAID_LEAVE: { hr_concept_id: 5, value: 'UNPAID_LEAVE', name: 'Leave without pay', hr_concept_category_id: 2, accountsign: '-', type: 'D', columntype: 'A', rule: null }
};

// ---- native hr_concept_acct rows — the GL account mapping the deduction side posts through -----------------
// BASE/ALLOWANCE fold into the process-level wages_expense/net_pay_payable control accounts (below); only the
// DEDUCTIONS concepts need a per-concept payable account (mirrors the old engine.js `l.element + '_payable'`
// naming, now sourced from a lookup table instead of a string convention).
var CONCEPT_ACCT = {
  EPF: { hr_concept_acct_id: 1, hr_concept_id: 3, hr_expense_acct: 'epf_payable', c_acctschema_id: 1 },
  PCB: { hr_concept_acct_id: 2, hr_concept_id: 4, hr_expense_acct: 'pcb_payable', c_acctschema_id: 1 },
  UNPAID_LEAVE: { hr_concept_acct_id: 3, hr_concept_id: 5, hr_expense_acct: 'unpaid_leave_payable', c_acctschema_id: 1 }
};
var WAGES_EXPENSE_ACCT = 'wages_expense', NET_PAY_PAYABLE_ACCT = 'net_pay_payable';

function conceptsInScope(ids) {
  var all = Object.keys(CONCEPTS).map(function (k) { return CONCEPTS[k]; });
  return ids ? all.filter(function (c) { return ids.indexOf(c.value) >= 0; }) : all;
}

// term scoping — an employee may carry an hr_contract-shaped term {validfrom, validto}; no term = perpetual.
function inScope(emp, period) {
  var t = emp.contract; return t ? (t.validfrom <= period && period <= t.validto) : true;
}

// ONE employee's hr_movement rows for this period (base + ADD-then-SUB, gross/net folded exactly as before).
function buildMovements(emp, period, hr_process_id, seedId) {
  var base = emp.base || 0, ctx = { base: base, gross: base }, rows = [], gross = base;
  var wanted = conceptsInScope(emp.conceptIds);
  rows.push({ hr_movement_id: seedId(), hr_process_id: hr_process_id, c_bpartner_id: emp.c_bpartner_id,
    hr_concept_id: CONCEPTS.BASE.hr_concept_id, hr_concept_category_id: CONCEPTS.BASE.hr_concept_category_id,
    amount: R.round2(base), accountsign: '+', qty: 1, servicedate: period, description: 'FIXED ' + base });
  wanted.filter(function (c) { return c.accountsign === '+' && c.value !== 'BASE'; }).forEach(function (c) {
    var e = R.evalRule(c.rule, ctx); gross = R.round2(gross + e.amount);
    rows.push({ hr_movement_id: seedId(), hr_process_id: hr_process_id, c_bpartner_id: emp.c_bpartner_id,
      hr_concept_id: c.hr_concept_id, hr_concept_category_id: c.hr_concept_category_id,
      amount: e.amount, accountsign: '+', qty: 1, servicedate: period, description: e.trace });
  });
  ctx.gross = gross;
  wanted.filter(function (c) { return c.accountsign === '-'; }).forEach(function (c) {
    var e = R.evalRule(c.rule, ctx);
    rows.push({ hr_movement_id: seedId(), hr_process_id: hr_process_id, c_bpartner_id: emp.c_bpartner_id,
      hr_concept_id: c.hr_concept_id, hr_concept_category_id: c.hr_concept_category_id,
      amount: e.amount, accountsign: '-', qty: 1, servicedate: period, description: e.trace });
  });
  // variable per-employee-per-period deductions computed elsewhere (e.g. leave.js leaveDeduction()) — fed in
  // by VALUE (the concept's real business key), not evaluated here; no line when the caller supplies none
  // (no phantom deduction, matching leave.js's own L6 "no phantom" guarantee).
  (emp.extra || []).forEach(function (x) {
    var c = CONCEPTS[x.value]; if (!c || !(x.amount > 0)) return;
    rows.push({ hr_movement_id: seedId(), hr_process_id: hr_process_id, c_bpartner_id: emp.c_bpartner_id,
      hr_concept_id: c.hr_concept_id, hr_concept_category_id: c.hr_concept_category_id,
      amount: R.round2(x.amount), accountsign: c.accountsign, qty: 1, servicedate: period, description: x.trace || ('FIXED ' + x.amount) });
  });
  return rows;
}

function sumBy(rows, sign) { return R.round2(rows.filter(function (r) { return r.accountsign === sign; }).reduce(function (s, r) { return s + r.amount; }, 0)); }

// GL lines for one employee's movements — Dr wages_expense=gross, Cr net_pay_payable=net, Cr <acct>=each deduction.
function glFor(movements) {
  var gross = sumBy(movements, '+'), ded = sumBy(movements, '-'), net = R.round2(gross - ded);
  var lines = [{ acct: WAGES_EXPENSE_ACCT, dr: gross }, { acct: NET_PAY_PAYABLE_ACCT, cr: net }];
  movements.filter(function (r) { return r.accountsign === '-'; }).forEach(function (r) {
    var concept = Object.keys(CONCEPTS).filter(function (k) { return CONCEPTS[k].hr_concept_id === r.hr_concept_id; })[0];
    var acct = CONCEPT_ACCT[concept]; lines.push({ acct: acct ? acct.hr_expense_acct : concept + '_payable', cr: r.amount });
  });
  return { lines: lines, gross: gross, net: net };
}

// deterministic fingerprint over the movements (sorted by party+concept) — the replay==live anchor.
function runHash(allMovements) {
  var proj = allMovements.map(function (m) { return { p: m.c_bpartner_id, c: m.hr_concept_id, a: m.amount, s: m.accountsign }; })
    .sort(function (a, b) { return (a.p + a.c) < (b.p + b.c) ? -1 : (a.p + a.c) > (b.p + b.c) ? 1 : 0; });
  return C._util.sha256(C._util.stableStringify(proj));
}
function replayHash(log) {
  var proj = log.filter(function (o) { return o.cls === 'HR_MOVEMENT'; })
    .map(function (o) { return { p: o.target, c: o.params.hr_concept_id, a: o.params.amount, s: o.params.accountsign }; })
    .sort(function (a, b) { return (a.p + a.c) < (b.p + b.c) ? -1 : (a.p + a.c) > (b.p + b.c) ? 1 : 0; });
  return C._util.sha256(C._util.stableStringify(proj));
}

// run ONE payroll period → an hr_process row + hr_movement rows + signed op-log + balanced GL.
// spec = { period, employees: [{c_bpartner_id, name, base, conceptIds, contract:{validfrom,validto}}], actor, locale }
function runPeriod(spec) {
  var locale = spec.locale || 'en';
  var seed = 0; function seedId() { return ++seed; }
  var employees = (spec.employees || []).filter(function (e) { return inScope(e, spec.period); });
  var hr_process = { hr_process_id: 1, hr_payroll_id: 1, hr_period_id: spec.period, documentno: 'PAY-' + spec.period,
    docstatus: 'DR', docaction: 'CO', posted: 'N', processed: 'N', dateacct: spec.period };

  C.reset(); var opSeq = 0, prev = 'GENESIS';
  function emit(cls, verb, target, params) {
    var op = { id: spec.period + '#' + opSeq, ts: 1 + opSeq, period: spec.period, actor: spec.actor || 'hba',
      cls: cls, verb: verb, target: target, params: params };
    opSeq++; C.sign(op, prev); prev = op.op_hash; C.persist(op); return op;
  }
  emit('HR_PROCESS', 'OPEN', hr_process.hr_process_id, { period: spec.period, n: employees.length });

  var allMovements = [], glLines = [], drTotal = 0, crTotal = 0;
  employees.forEach(function (emp) {
    var movs = buildMovements(emp, spec.period, hr_process.hr_process_id, seedId);
    movs.forEach(function (m) { emit('HR_MOVEMENT', 'CALC', emp.c_bpartner_id, m); });
    allMovements = allMovements.concat(movs);
    var g = glFor(movs); g.lines.forEach(function (l) { glLines.push(l); drTotal += (l.dr || 0); crTotal += (l.cr || 0); });
  });
  hr_process.processed = 'Y'; hr_process.posted = employees.length ? 'Y' : 'N';
  emit('HR_PROCESS', 'POST', hr_process.hr_process_id, { n: employees.length, dr: R.round2(drTotal), cr: R.round2(crTotal) });

  return { hr_process: hr_process, hr_movement: allMovements, gl: C.glPost(glLines),
    log: C.log(), chainTip: prev, runHash: runHash(allMovements), locale: locale };
}

// convenience reader for a view (P7): one employee's payslip, grouped from hr_movement rows, watermarked.
function payslip(hr_movement, c_bpartner_id, locale) {
  var rows = hr_movement.filter(function (m) { return m.c_bpartner_id === c_bpartner_id; });
  var gross = sumBy(rows, '+'), net = R.round2(gross - sumBy(rows, '-'));
  var out = { c_bpartner_id: c_bpartner_id, gross: gross, net: net,
    lines: rows.map(function (r) {
      var v = Object.keys(CONCEPTS).filter(function (k) { return CONCEPTS[k].hr_concept_id === r.hr_concept_id; })[0];
      return { concept: v, name: CONCEPTS[v] ? CONCEPTS[v].name : v, accountsign: r.accountsign, amount: r.amount, trace: r.description };
    }) };
  return W ? W.stamp(out, locale || 'en') : out;
}

// demonstrator payroll spec for the P7 viewer pane — the SAME EMP001/EMP002 identities+concepts already
// accepted by witness_ad_payroll.js AD1 (EMP001 gross=5200/net=4234) — reused, not re-invented. Payroll
// identity (c_bpartner_id) has no spatial binding to check (unlike Occupancy/Asset), so this seeds
// unconditionally rather than gating on a guid resolving — the honesty gate here is "reuse the accepted
// numbers", not "resolve to a mesh".
function demoSpec() {
  return { period: '2026-06', actor: 'hba', locale: 'en', employees: [
    { c_bpartner_id: 1001, name: 'EMP001', base: 5000, conceptIds: ['BASE', 'ALLOWANCE', 'EPF', 'PCB'] },
    { c_bpartner_id: 1002, name: 'EMP002', base: 3000, conceptIds: ['BASE', 'ALLOWANCE', 'EPF'] }
  ] };
}

var AD = { CATEGORIES: CATEGORIES, CONCEPTS: CONCEPTS, CONCEPT_ACCT: CONCEPT_ACCT,
  WAGES_EXPENSE_ACCT: WAGES_EXPENSE_ACCT, NET_PAY_PAYABLE_ACCT: NET_PAY_PAYABLE_ACCT,
  runPeriod: runPeriod, runHash: runHash, replayHash: replayHash, payslip: payslip, glFor: glFor, demoSpec: demoSpec };
if (typeof module === 'object' && module.exports) module.exports = AD;
else (typeof self !== 'undefined' ? self : this).HbaAdPayroll = AD;
})();
