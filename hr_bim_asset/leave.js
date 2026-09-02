// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — HR_BIM_ASSET LEAVE / ABSENCE (RESUME_HR_BIM_ASSET.md §RESUME NEXT#2, ★★★★ T1).
//   The spec's leave doctrine in three primitives: ACCRUAL = a signed op · BALANCE = a replay of the op-log ·
//   FEEDS PAYROLL = unpaid leave days become a SUB element on the deterministic pay run (engine.buildStatement).
//   Reuses the same connector seam as attendance (C.sign/verifyChain) — every accrual/take is SIGNED +
//   tamper-evident. NON-INVENT GATES:
//     • balance is REPLAYED from the ops alone (Σ ACCRUE − Σ TAKE) — never a stored/guessed number
//     • a TAKE beyond the available paid balance is split paid/unpaid by replay — the unpaid portion is REAL
//       overdraw, not a fabricated deduction; no unpaid days → no payroll line (no phantom)
//     • an incomplete/zero op is REFUSED (no signed op) — never a fabricated entry
//   The caller supplies `ts` + `dayRate` (no Date.now). Pure + deterministic. Read the log after every run.
(function () {
'use strict';
var _r = (typeof require !== 'undefined'), _g = (typeof self !== 'undefined' ? self : this);
var C = _r ? require('./connectors') : _g.HrConnectors;
var W = _r ? require('./watermark') : _g.HbaWatermark;

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

// leave-type policy: paid types DRAW a balance; an unpaid type is always Leave-Without-Pay. Default = paid
// unless named unpaid. Caller may override per type. (Non-invent: policy is an input, not a guess.)
var PAID_DEFAULT = { annual: true, sick: true, unpaid: false };
function isPaid(type, policy) { var p = policy || PAID_DEFAULT; return p[type] !== undefined ? !!p[type] : true; }

// build + sign ONE leave op onto a chain (shape matches Connectors.canonical → sign/verifyChain cover it).
function _signed(ev, prev) {
  var op = { id: 'LV:' + ev.employee + ':' + ev.type + '@' + ev.ts, ts: ev.ts, period: String(ev.ts).slice(0, 7),
    actor: ev.employee, cls: 'LEAVE', verb: ev.verb, target: ev.employee,
    params: { type: ev.type, days: ev.days, note: ev.note || null } };
  return C.sign(op, prev || 'GENESIS');
}
function _emit(verb, ev, prev) {
  if (!ev || !ev.employee || !ev.type || ev.ts == null || !(ev.days > 0)) return { refused: 'incomplete' };
  return { op: _signed({ employee: ev.employee, type: ev.type, days: ev.days, ts: ev.ts, note: ev.note, verb: verb }, prev) };
}
// accrue(+days) / take(−days). `prev` chains onto an existing log; omit for a fresh GENESIS op.
function accrue(ev, prev) { return _emit('ACCRUE', ev, prev); }
function take(ev, prev) { return _emit('TAKE', ev, prev); }

// the leave ops for an employee (+ optional type), in ts order.
function _ops(log, emp, type) {
  return (log || []).filter(function (o) { return o.cls === 'LEAVE' && o.target === emp && (!type || o.params.type === type); })
    .slice().sort(function (a, b) { return a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0; });
}

// BALANCE = REPLAY: Σ ACCRUE − Σ TAKE for emp+type. May be NEGATIVE if overdrawn (honest, not floored).
// asOf (optional ts) gives a point-in-time balance (carry-forward across periods).
function balance(log, emp, type, asOf) {
  var bal = 0, cut = (asOf != null) ? (typeof asOf === 'number' ? asOf : Date.parse(asOf)) : null;
  _ops(log, emp, type).forEach(function (o) { if (cut != null && Date.parse(o.ts) > cut) return; bal += (o.verb === 'ACCRUE' ? o.params.days : -o.params.days); });
  return round2(bal);
}

// CLASSIFY each TAKE into paid vs unpaid days by replaying a running per-type balance chronologically.
// unpaid type → all days unpaid. paid type → paid up to the balance available AT THAT MOMENT, remainder unpaid;
// the running balance then drops by the FULL take (so it can go negative = overdraw). Pure + deterministic.
function classify(log, emp, policy) {
  var running = {}, rows = [];
  _ops(log, emp).forEach(function (o) {
    var t = o.params.type, d = o.params.days;
    if (o.verb === 'ACCRUE') { running[t] = round2((running[t] || 0) + d); return; }
    var paid, unpaid;
    if (!isPaid(t, policy)) { paid = 0; unpaid = d; }
    else { var avail = running[t] || 0; paid = Math.max(0, Math.min(d, avail)); unpaid = round2(d - paid); running[t] = round2(avail - d); }
    rows.push({ ts: o.ts, period: o.period, type: t, days: d, paidDays: round2(paid), unpaidDays: round2(unpaid), op: o });
  });
  return rows;
}

// unpaid leave days TAKEN in a period (the figure that feeds payroll).
function unpaidDays(log, emp, period, policy) {
  return round2(classify(log, emp, policy).filter(function (r) { return r.period === period; })
    .reduce(function (s, r) { return s + r.unpaidDays; }, 0));
}

// THE PAYROLL FEED — turn unpaid leave days in a period into a SUB element for engine.buildStatement.
// dayRate is an INPUT (non-invent; e.g. base ÷ working-days). Returns null when there are no unpaid days
// (no phantom deduction). The element is a FIXED rule so the pay run stays glass-box (trace explains the £).
function leaveDeduction(log, emp, period, dayRate, policy) {
  var u = unpaidDays(log, emp, period, policy);
  if (!(u > 0)) return null;
  var amt = round2(u * dayRate);
  return { id: 'unpaid_leave', name: 'Leave without pay (' + u + 'd × ' + dayRate + ')', side: 'SUB',
    rule: { kind: 'FIXED', amount: amt }, _days: u, _dayRate: dayRate };
}

// a watermarked leave statement (a generated output → §DISCLAIMER). Balances are replayed; chainOk attests.
function summary(log, emp, period, policy, locale) {
  var types = {}; _ops(log, emp).forEach(function (o) { types[o.params.type] = true; });
  var bal = {}; Object.keys(types).sort().forEach(function (t) { bal[t] = balance(log, emp, t); });
  var rows = classify(log, emp, policy).filter(function (r) { return !period || r.period === period; });
  var out = { employee: emp, period: period || 'all', balances: bal,
    taken: round2(rows.reduce(function (s, r) { return s + r.days; }, 0)),
    unpaid: round2(rows.reduce(function (s, r) { return s + r.unpaidDays; }, 0)),
    chainOk: C.verifyChain((log || []).filter(function (o) { return o.cls === 'LEAVE'; })).ok,
    entries: rows.map(function (r) { return { period: r.period, type: r.type, days: r.days, unpaidDays: r.unpaidDays }; }) };
  return W ? W.stamp(out, locale || 'en') : out;
}

// deterministic fingerprint over the classified ledger (replay == live anchor).
function fingerprint(log, emp, policy) {
  var rows = classify(log, emp, policy).map(function (r) { return { p: r.period, t: r.type, d: r.days, u: r.unpaidDays }; });
  return C._util.sha256(C._util.stableStringify(rows));
}

// demonstrator leave log for the P8 viewer pane — the SAME accrue/take schedule already accepted by
// witness_leave.js L0-L9 (3×2d annual accrued Jan-Mar, 4d taken Apr, 5d taken May [splits paid2/unpaid3],
// 1d unpaid-type taken May) — reused per-employee, not re-invented. Independently signed+chained per emp.
function demoLog(emp) {
  var log = [];
  function add(fn, type, days, ts) {
    var prev = log.length ? log[log.length - 1].op_hash : 'GENESIS';
    var r = fn({ employee: emp, type: type, days: days, ts: ts }, prev);
    if (r.op) log.push(r.op);
  }
  add(accrue, 'annual', 2, '2026-01-31T00:00:00Z');
  add(accrue, 'annual', 2, '2026-02-28T00:00:00Z');
  add(accrue, 'annual', 2, '2026-03-31T00:00:00Z');
  add(take,   'annual', 4, '2026-04-10T00:00:00Z');
  add(take,   'annual', 5, '2026-05-12T00:00:00Z');
  add(take,   'unpaid', 1, '2026-05-20T00:00:00Z');
  return log;
}

var L = { PAID_DEFAULT: PAID_DEFAULT, isPaid: isPaid, accrue: accrue, take: take, balance: balance,
  classify: classify, unpaidDays: unpaidDays, leaveDeduction: leaveDeduction, summary: summary, fingerprint: fingerprint,
  demoLog: demoLog };
if (typeof module === 'object' && module.exports) module.exports = L;
else (typeof self !== 'undefined' ? self : this).HbaLeave = L;
})();
