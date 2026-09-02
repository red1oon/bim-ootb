// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — HR_BIM_ASSET RUN ENGINE (prompts/RESUME_HR_BIM_ASSET.md §PILLAR-4 keystone).
//   ONE generic periodic RUN: (period × parties × element-rules) → signed lines → GL. Direction-agnostic.
//   Profiles (minimal alpha — expand per a big user request):
//     payroll(OUT) · tenancy(IN) · strata(IN) · maintenance(COST)
//   Payroll is just profile #1. Pure + deterministic; depends ONLY on the connector seam. Read log after run.
'use strict';
var C = require('./connectors'), R = require('./rules'), W = require('./watermark');

var PROFILES = {
  payroll:     { doc: 'PAYRUN',  stmt: 'PAYSLIP',      dir: 'OUT',  glDr: 'wages_expense', glCr: 'net_pay_payable' },
  tenancy:     { doc: 'RENTRUN', stmt: 'RENT_INVOICE', dir: 'IN',   glDr: 'tenant_AR',     glCr: 'rent_income' },
  strata:      { doc: 'FEERUN',  stmt: 'FEE_NOTICE',   dir: 'IN',   glDr: 'owner_AR',      glCr: 'fee_income' },
  maintenance: { doc: 'PMRUN',   stmt: 'WORK_ORDER',   dir: 'COST', glDr: 'maint_expense', glCr: 'maint_payable' }
};

// in scope this period? leases/parcels may carry a term; everything else is perpetual.
function inScope(p, period) { return p.term ? (p.term.start <= period && period <= p.term.end) : true; }

// ONE statement for a party: base + Σ ADD − Σ SUB, every line citing its rule + trace (GLASS-BOX).
function buildStatement(party, elements, period) {
  var base = party.base || 0, ctx = { base: base, gross: base, period: period };
  Object.keys(party.ctx || {}).forEach(function (k) { ctx[k] = party.ctx[k]; });
  var lines = [], gross = base;
  function pick(side) { return elements.filter(function (e) { return e.side === side && (!party.elementIds || party.elementIds.indexOf(e.id) >= 0); }); }
  pick('ADD').forEach(function (e) { var r = R.evalRule(e.rule, ctx); gross = R.round2(gross + r.amount);
    lines.push({ element: e.id, name: e.name, side: 'ADD', amount: r.amount, rule: e.rule.kind, trace: r.trace }); });
  ctx.gross = gross;
  var subTotal = 0;
  pick('SUB').forEach(function (e) { var r = R.evalRule(e.rule, ctx); subTotal = R.round2(subTotal + r.amount);
    lines.push({ element: e.id, name: e.name, side: 'SUB', amount: r.amount, rule: e.rule.kind, trace: r.trace }); });
  return { partyId: party.id, base: base, gross: gross, subTotal: subTotal, net: R.round2(gross - subTotal), lines: lines };
}

function glFor(prof, s) {
  var lines = [{ acct: prof.glDr, dr: prof.dir === 'OUT' ? s.gross : s.net }, { acct: prof.glCr, cr: s.net }];
  if (prof.dir === 'OUT') s.lines.forEach(function (l) { if (l.side === 'SUB') lines.push({ acct: l.element + '_payable', cr: l.amount }); });
  return lines;
}

// deterministic fingerprint over the statements (sorted) — the replay==live anchor.
function runHash(statements) {
  var proj = statements.map(function (s) { return { id: s.partyId, net: s.net }; })
    .sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
  return C._util.sha256(C._util.stableStringify(proj));
}
// recompute the fingerprint FROM THE SIGNED LOG ALONE (replay-hash == live-hash).
function replayHash(log) {
  var proj = log.filter(function (o) { return o.verb === 'CALC'; })
    .map(function (o) { return { id: o.target, net: o.params.net }; })
    .sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
  return C._util.sha256(C._util.stableStringify(proj));
}

// run ONE period of ONE profile → signed op-log + statements + balanced GL.
function runPeriod(spec) {
  var prof = PROFILES[spec.profile]; if (!prof) throw new Error('unknown profile: ' + spec.profile);
  var locale = spec.locale || 'en';
  var statements = (spec.parties || []).filter(function (p) { return inScope(p, spec.period); })
    .map(function (p) { var s = buildStatement(p, spec.elements || [], spec.period); s.profile = spec.profile; s.period = spec.period; return W.stamp(s, locale); });
  C.reset(); var seq = 0, prev = 'GENESIS';
  function emit(cls, verb, target, params) {
    var op = { id: spec.period + '#' + seq, ts: 1 + seq, period: spec.period, actor: spec.actor || 'hba', cls: cls, verb: verb, target: target, params: params };
    seq++; C.sign(op, prev); prev = op.op_hash; C.persist(op); return op;
  }
  emit(prof.doc, 'OPEN', spec.profile, { period: spec.period, n: statements.length });
  statements.forEach(function (s) { emit(prof.stmt, 'CALC', s.partyId, { net: s.net, gross: s.gross, lines: s.lines }); });
  var gl = C.glPost([].concat.apply([], statements.map(function (s) { return glFor(prof, s); })));
  return { profile: spec.profile, period: spec.period, dir: prof.dir, statements: statements,
           log: C.log(), chainTip: prev, runHash: runHash(statements), gl: gl, locale: locale };
}

var E = { PROFILES: PROFILES, buildStatement: buildStatement, runPeriod: runPeriod, runHash: runHash, replayHash: replayHash, glFor: glFor };
if (typeof module === 'object' && module.exports) module.exports = E;
else (typeof self !== 'undefined' ? self : this).HbaEngine = E;
