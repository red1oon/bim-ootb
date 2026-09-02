// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — HR ELEMENT-RULE EVALUATOR (§0.5 decision-table tier; RESUME_HR_PAYROLL_KERNEL.md).
//   Tiny, non-Turing, DETERMINISTIC: FIXED | RATE | BRACKET. Every eval returns a human `trace` so the
//   statement is GLASS-BOX (every number explains itself). No Date.now/Math.random/network. Read log after run.
'use strict';
function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

// evalRule(rule, ctx) -> { amount, trace }. ctx supplies the bases: base, gross, area, year, …
function evalRule(rule, ctx) {
  ctx = ctx || {};
  if (!rule) return { amount: 0, trace: 'none' };
  if (rule.kind === 'FIXED') return { amount: round2(rule.amount), trace: 'FIXED ' + rule.amount };
  if (rule.kind === 'RATE') {
    var basis = ctx[rule.of || 'base'] || 0;
    return { amount: round2(basis * rule.pct), trace: 'RATE ' + (rule.of || 'base') + '=' + basis + ' × ' + rule.pct };
  }
  if (rule.kind === 'BRACKET') {
    var b = ctx[rule.of || 'gross'] || 0, hit = null;
    for (var i = 0; i < rule.table.length; i++) { if (b <= rule.table[i][0]) { hit = rule.table[i]; break; } }
    if (!hit) hit = rule.table[rule.table.length - 1];
    return { amount: round2(b * hit[1]), trace: 'BRACKET ' + (rule.of || 'gross') + '=' + b + ' ≤' + hit[0] + ' → ×' + hit[1] };
  }
  throw new Error('unknown rule kind: ' + rule.kind);
}

var R = { evalRule: evalRule, round2: round2 };
if (typeof module === 'object' && module.exports) module.exports = R;
else (typeof self !== 'undefined' ? self : this).HrRules = R;
