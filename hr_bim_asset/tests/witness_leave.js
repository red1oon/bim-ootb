// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-LEAVE witness (§RESUME NEXT#2 — Leave/Absence, ★★★★ T1). Each check NAMES the
//   issue it proves. Load-bearing claims: ACCRUAL is a SIGNED op (tamper-evident); BALANCE is a REPLAY of
//   the op-log (Σ ACCRUE − Σ TAKE, carry-forward, may overdraw — honest); a TAKE beyond the paid balance is
//   split paid/unpaid by replay; the unpaid days FEED PAYROLL as a SUB element that drops net pay on the
//   already-witnessed deterministic pay run, GL still balanced; no unpaid days → no phantom line.
//   Run: node hr_bim_asset/tests/witness_leave.js
'use strict';
var Lv = require('../leave'), E = require('../engine'), C = require('../connectors');
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-LEAVE ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

var EMP = 'EMP001';
// build a SIGNED, chained leave log. accrue 2 annual days Jan/Feb/Mar (=6), then take against it.
var log = [];
function add(fn, type, days, ts) {
  var prev = log.length ? log[log.length - 1].op_hash : 'GENESIS';
  var r = fn({ employee: EMP, type: type, days: days, ts: ts }, prev);
  if (r.op) log.push(r.op);
  return r;
}
add(Lv.accrue, 'annual', 2, '2026-01-31T00:00:00Z');
add(Lv.accrue, 'annual', 2, '2026-02-28T00:00:00Z');
add(Lv.accrue, 'annual', 2, '2026-03-31T00:00:00Z');     // balance now 6
add(Lv.take,   'annual', 4, '2026-04-10T00:00:00Z');     // paid 4 (avail 6→2)
add(Lv.take,   'annual', 5, '2026-05-12T00:00:00Z');     // paid 2, UNPAID 3 (avail 2→-3)
add(Lv.take,   'unpaid', 1, '2026-05-20T00:00:00Z');     // UNPAID 1 (unpaid type)

// ---- L0: every accrual/take is SIGNED and the chain verifies ---------------------------------------------
ok('L0-signed-chain', log.length === 6 && log.every(function (o) { return o.sig && o.op_hash; }) && C.verifyChain(log).ok,
  'accrual + take are signed kernel_ops; verifyChain OK (tamper-evident ledger)');

// ---- L1: BALANCE = REPLAY (Σ ACCRUE − Σ TAKE), and carry-forward via asOf ---------------------------------
ok('L1-balance-replay', Lv.balance(log, EMP, 'annual') === -3,
  'annual balance replayed from ops = 6 accrued − 9 taken = -3 (overdraw shown honestly, not floored)');
var asOfMar = Date.parse('2026-03-31T12:00:00Z');
ok('L2-carry-forward', Lv.balance(log, EMP, 'annual', asOfMar) === 6,
  'point-in-time balance (asOf end-Mar, before any take) = 6 — accruals carry forward across periods');

// ---- L3: a TAKE beyond the balance is SPLIT paid/unpaid by replay ----------------------------------------
var cl = Lv.classify(log, EMP);
var apr = cl.filter(function (r) { return r.period === '2026-04'; })[0];
var mayAnnual = cl.filter(function (r) { return r.period === '2026-05' && r.type === 'annual'; })[0];
ok('L3-split', apr.paidDays === 4 && apr.unpaidDays === 0 && mayAnnual.paidDays === 2 && mayAnnual.unpaidDays === 3,
  'Apr take(4) fully paid; May take(5) splits paid 2 / unpaid 3 (the real overdraw) — non-invent');

// ---- L4: unpaid days in May = 3 (annual overdraw) + 1 (unpaid type) = 4 ----------------------------------
ok('L4-unpaid-period', Lv.unpaidDays(log, EMP, '2026-05') === 4 && Lv.unpaidDays(log, EMP, '2026-04') === 0,
  'unpaidDays(May)=4 (3 overdraw + 1 LWP); unpaidDays(Apr)=0');

// ---- L5: FEEDS PAYROLL — unpaid days become a SUB on the deterministic pay run, net drops, GL balances ----
var DAY_RATE = 100;
var ded = Lv.leaveDeduction(log, EMP, '2026-05', DAY_RATE);
ok('L5a-deduction', ded && ded.side === 'SUB' && ded.rule.kind === 'FIXED' && ded.rule.amount === 400 && ded._days === 4,
  'leaveDeduction → a SUB element of 4d × 100 = 400 for the pay run (glass-box FIXED rule)');
var party = { id: EMP, base: 3000 };
var without = E.runPeriod({ profile: 'payroll', period: '2026-05', actor: 'hba', parties: [party], elements: [] });
var withLv = E.runPeriod({ profile: 'payroll', period: '2026-05', actor: 'hba', parties: [party], elements: [ded] });
var s0 = without.statements[0], s1 = withLv.statements[0];
ok('L5b-net-drops', s0.net === 3000 && s1.net === 2600 && s1.lines.some(function (l) { return l.element === 'unpaid_leave' && l.amount === 400; }),
  'pay run WITHOUT leave net=3000; WITH unpaid leave net=2600 (−400) and the SUB line is present');
ok('L5c-gl-balanced', without.gl.balanced && withLv.gl.balanced && withLv.gl.dr === 3000 && withLv.gl.cr === 3000,
  'GL still balances with the leave deduction (Dr wages 3000 = Cr net 2600 + Cr unpaid_leave_payable 400)');

// ---- L6: no phantom — a period with no unpaid leave yields NO deduction line ------------------------------
ok('L6-no-phantom', Lv.leaveDeduction(log, EMP, '2026-04', DAY_RATE) === null,
  'April had only paid leave → leaveDeduction = null (no fabricated deduction line)');

// ---- L7: tamper-evident — amend a TAKE days after signing → verifyChain breaks at that op -----------------
var tampered = JSON.parse(JSON.stringify(log));
tampered[4].params.days = 1;                              // forge the May overdraw away
var v = C.verifyChain(tampered);
ok('L7-tamper', v.ok === false && v.at === 4 && v.why === 'op_hash',
  'editing a signed leave op breaks verifyChain (the balance cannot be silently rewritten)');

// ---- L8: REPLAY == LIVE — fingerprint stable across rebuilds; summary carries the watermark ---------------
ok('L8-deterministic', Lv.fingerprint(log, EMP) === Lv.fingerprint(JSON.parse(JSON.stringify(log)), EMP),
  'classified ledger fingerprint is deterministic (replay == live)');
var sum = Lv.summary(log, EMP, '2026-05', null, 'ms');
ok('L9-watermark', sum._watermark === 'CONTOH — TIDAK RASMI' && sum.balances.annual === -3 && sum.unpaid === 4 && sum.chainOk === true,
  'leave summary is a watermarked output (locale ms) with replayed balances + chainOk');

// ---- L10: an incomplete op is REFUSED (no signed op, no fabricated entry) ---------------------------------
var r = Lv.take({ employee: EMP, type: 'annual', days: 0, ts: '2026-06-01T00:00:00Z' });
ok('L10-refuse', r.refused === 'incomplete' && !r.op,
  'a zero/incomplete take is REFUSED — never a fabricated leave entry');

var pass = checks.filter(Boolean).length, fail = checks.length - pass;
console.log('\n§HBA-LEAVE ' + pass + '/' + checks.length + ' PASS' + (fail ? (' — ' + fail + ' FAIL') : ''));
process.exit(fail ? 1 : 0);
