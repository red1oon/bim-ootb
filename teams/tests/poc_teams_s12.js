#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-REPLAY + W-NUDGE + W-FEATURE-STUB (teams/ROADMAP.md §S12, Phase F — standalone).
//   Node-only witnesses over overlay/replay.js · erp/nudges.js · overlay/feature_stub.js — pure deterministic
//   folds of the ONE signed log, NON-INVENT, zero modeller/erp runtime edits. Fixed ids/ts (no Date.now /
//   Math.random). Each § names the issue it proves.
//
//   W-REPLAY — replay-as-onboarding: step through a real completed flow, state re-folds AS-OF each step:
//     §STEPS    — makeReplay scopes a flow → ordered steps, each ← one op (O2 filtered out, non-invent).
//     §STATE-AT — stepState re-folds the record AS-OF a step: early step = pre-edit value, last = final.
//     §SCRIPT   — narrationScript = the workSummary digest (participants from the log).
//     §CURSOR   — step() clamps [0,n]; replaying twice is identical (deterministic).
//   W-NUDGE — ONE measured, dismissible nudge per item (variance vs a MEASURED baseline, not whitelist):
//     §SLOW     — a doc past the measured pXX dwell of its status → 'slow' (baseline ← the log).
//     §SKIPPED  — a doc missing an activity the measured MAJORITY variant has → 'skipped'.
//     §RATE     — an author above rateK × the measured median count → 'rate'.
//     §ONE-ITEM — at most ONE nudge per item (D5 is slow, not also skipped).
//     §REFUSE   — too few samples → NO nudge (measure-don't-invent), not a guessed alarm.
//     §DISMISS  — a signed DISMISS op folds one nudge out (deterministic).
//   W-FEATURE-STUB — the honest "new feature" placeholder (H):
//     §DECLARED — propose-changes is declared (status 'stub', blue-branch), visible in the list.
//     §HONEST   — descriptor is DISABLED; invoke returns not-implemented (NEVER fakes the action).
//     §UNKNOWN  — an unknown feature → unknown-feature (no invented descriptor).
//   Run: node teams/tests/poc_teams_s12.js 2>&1 | tee teams/logs/s12.log — then READ the log.
'use strict';
var path = require('path');
var R = require(path.join(__dirname, '..', 'overlay', 'replay.js'));
var NU = require(path.join(__dirname, '..', 'erp', 'nudges.js'));
var FS = require(path.join(__dirname, '..', 'overlay', 'feature_stub.js'));

var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
var T = 1719700000000, S = 1000;
function erp(id, ts, author, verb, doc, params) {
  return { id: id, ts: ts, author: author, role: null, branch: null, cls: 'erp', verb: verb, target: doc, params: params || {} };
}

// ════════════════════════════ W-REPLAY ════════════════════════════
(function () {
  console.log('\n═══ W-REPLAY — replay a real completed flow step-by-step; state re-folds AS-OF each step ═══\n');

  // a completed O1 flow (CREATE→SUBMIT→APPROVE→POST) with a mid-flow Amount edit; O2 is unrelated noise.
  var log = [
    erp('c1', T + 0 * S, 'alice', 'CREATE',  'O1', { to: 'Drafted', fields: { Amount: 1000 } }),
    erp('s1', T + 1 * S, 'alice', 'SUBMIT',  'O1', { to: 'Submitted' }),
    erp('a1', T + 2 * S, 'bob',   'APPROVE', 'O1', { to: 'Approved' }),
    erp('e1', T + 3 * S, 'bob',   'EDIT',    'O1', { fields: { Amount: 1200 } }),
    erp('p1', T + 4 * S, 'cara',  'POST',    'O1', { to: 'Posted' }),
    erp('x1', T + 1 * S, 'dave',  'CREATE',  'O2', { to: 'Drafted' })          // noise, scoped out
  ];

  var sess = R.makeReplay(log, { anchorKey: 'O1', classes: ['erp'] });
  var ids = sess.steps.map(function (s) { return s.opId; }).join(',');
  verdict(sess.n === 5 && ids === 'c1,s1,a1,e1,p1' && sess.steps[1].narration === 'Step 2/5 · alice SUBMIT O1 @ ' + (T + 1 * S),
    '§STEPS  scoped flow → ordered steps, O2 filtered (non-invent)', 'n=' + sess.n + ' ids=[' + ids + ']');

  // §STATE-AT — record AS-OF step 2 (post-SUBMIT, pre-edit) = 1000; AS-OF the last step = 1200 + Posted.
  var atSubmit = R.stepState(sess, 2, { id: 'O1' });
  var atEnd = R.stepState(sess, 5, { id: 'O1' });
  verdict(atSubmit.fields.Amount.value === 1000 && atEnd.fields.Amount.value === 1200 && atEnd.status.value === 'Posted',
    '§STATE-AT  re-fold record AS-OF step (pre-edit vs final)', 'Amount@2=' + atSubmit.fields.Amount.value + ' @5=' + atEnd.fields.Amount.value + ' status=' + atEnd.status.value);

  // §SCRIPT — narrationScript = the workSummary digest; participants from the log.
  var script = R.narrationScript(sess);
  verdict(script.count === 5 && script.participants.join(',') === 'alice,bob,cara',
    '§SCRIPT  narration = work-summary digest', 'steps=' + script.count + ' people=[' + script.participants.join(',') + ']');

  // §CURSOR — step() clamps [0,n]; replay is deterministic (same session twice → identical steps).
  var c0 = R.step(sess, 0, -1), cN = R.step(sess, sess.n, +1), c2 = R.step(sess, 1, +1);
  var twice = JSON.stringify(R.makeReplay(log, { anchorKey: 'O1', classes: ['erp'] }).steps) === JSON.stringify(sess.steps);
  verdict(c0 === 0 && cN === sess.n && c2 === 2 && twice,
    '§CURSOR  clamp [0,n] + deterministic', 'clampLo=' + c0 + ' clampHi=' + cN + ' fwd=' + c2 + ' deterministic=' + twice);

  console.log('\n' + (fails === 0 ? '✅ W-REPLAY 4/4 PASS' : '❌ ' + fails + ' FAIL (cumulative)') + '\n');
})();

// ════════════════════════════ W-NUDGE ════════════════════════════
(function () {
  var start = fails;
  console.log('═══ W-NUDGE — one measured, dismissible nudge per item (variance vs a MEASURED baseline) ═══\n');

  // 4 completed docs follow the majority path; D5 is stuck in Submitted; D6 skips APPROVE.
  function flow(doc, poster) {
    return [
      erp('c_' + doc, T + 0 * S, 'alice', 'CREATE',  doc, { to: 'Drafted' }),
      erp('s_' + doc, T + 1 * S, 'alice', 'SUBMIT',  doc, { to: 'Submitted' }),
      erp('a_' + doc, T + 3 * S, 'bob',   'APPROVE', doc, { to: 'Approved' }),    // Submitted-dwell = 2000
      erp('p_' + doc, T + 4 * S, poster,  'POST',    doc, { to: 'Posted' })
    ];
  }
  var log = flow('D1', 'cara').concat(flow('D2', 'cara'), flow('D3', 'dan'), flow('D4', 'dan'), [
    erp('c_D5', T + 0 * S, 'alice', 'CREATE', 'D5', { to: 'Drafted' }),
    erp('s_D5', T + 1 * S, 'alice', 'SUBMIT', 'D5', { to: 'Submitted' }),         // stuck (no approve)
    erp('c_D6', T + 0 * S, 'alice', 'CREATE', 'D6', { to: 'Drafted' }),
    erp('s_D6', T + 1 * S, 'alice', 'SUBMIT', 'D6', { to: 'Submitted' }),
    erp('p_D6', T + 5 * S, 'dan',   'POST',   'D6', { to: 'Posted' })             // skipped APPROVE
  ]);

  var res = NU.nudges(log, { now: T + 20 * S, terminal: ['Posted'], minSamples: 4 });
  var byItem = {}; res.nudges.forEach(function (n) { byItem[n.item] = n; });

  // §SLOW — D5 dwelled past the MEASURED pXX of Submitted dwell; baseline came from the log.
  verdict(byItem['D5'] && byItem['D5'].kind === 'slow' && /Submitted/.test(byItem['D5'].text) &&
          res.baselines.dwellP95['Submitted'] === byItem['D5'].measured.baseline,
    '§SLOW  doc past measured pXX dwell → slow', 'D5=' + (byItem['D5'] && byItem['D5'].text));

  // §SKIPPED — D6 is missing APPROVE that the measured majority variant has.
  verdict(byItem['D6'] && byItem['D6'].kind === 'skipped' && byItem['D6'].measured.missing.indexOf('APPROVE') >= 0 &&
          res.baselines.majoritySeq === 'CREATE→SUBMIT→APPROVE→POST',
    '§SKIPPED  doc missing the majority activity → skipped', 'D6 missing=' + (byItem['D6'] && byItem['D6'].measured.missing.join(',')) + ' majority=' + res.baselines.majoritySeq);

  // §RATE — alice's op-count is above rateK × the measured median author count.
  verdict(byItem['alice'] && byItem['alice'].kind === 'rate' && byItem['alice'].measured.count === 12 && res.baselines.rateNorm === 3,
    '§RATE  author above rateK × measured median → rate', 'alice=' + (byItem['alice'] && byItem['alice'].text));

  // §ONE-ITEM — D5 gets exactly ONE nudge (slow wins over its also-skipped candidacy).
  var d5count = res.nudges.filter(function (n) { return n.item === 'D5'; }).length;
  verdict(d5count === 1 && res.nudges.length === 3,
    '§ONE-ITEM  one nudge per item (never a wall)', 'D5 nudges=' + d5count + ' total=' + res.nudges.length);

  // §REFUSE — too few samples → NO nudge (measure-don't-invent), not a guessed "stuck" alarm.
  var thin = [erp('c0', T, 'zoe', 'CREATE', 'Z1', { to: 'Drafted' }), erp('s0', T + S, 'zoe', 'SUBMIT', 'Z1', { to: 'Submitted' })];
  var thinRes = NU.nudges(thin, { now: T + 99 * S, terminal: ['Posted'], minSamples: 4 });
  verdict(thinRes.nudges.length === 0 && thinRes.baselines.dwellP95['Submitted'] == null,
    '§REFUSE  insufficient samples → no nudge (non-invent)', 'nudges=' + thinRes.nudges.length + ' baseline=' + thinRes.baselines.dwellP95['Submitted']);

  // §DISMISS — a signed DISMISS op folds alice's rate nudge out.
  var dlog = NU.dismiss(log, { id: 'dm1', ts: T + 21 * S, author: 'mgr', item: 'alice' }).log;
  var after = NU.nudges(dlog, { now: T + 20 * S, terminal: ['Posted'], minSamples: 4 });
  var stillAlice = after.nudges.some(function (n) { return n.item === 'alice'; });
  verdict(!stillAlice && after.nudges.length === 2 && after.dismissed.indexOf('alice') >= 0,
    '§DISMISS  signed DISMISS folds a nudge out', 'aliceGone=' + (!stillAlice) + ' remaining=' + after.nudges.length);

  console.log('\n' + (fails === start ? '✅ W-NUDGE 6/6 PASS' : '❌ ' + (fails - start) + ' FAIL') + '\n');
})();

// ════════════════════════════ W-FEATURE-STUB ════════════════════════════
(function () {
  var start = fails;
  console.log('═══ W-FEATURE-STUB — the honest "new feature" placeholder (visible, never fakes) ═══\n');

  // §DECLARED — propose-changes is declared (stub, blue-branch) and visible in the list.
  var list = FS.listFeatures();
  var pc = FS.feature('propose-changes');
  verdict(list.length >= 1 && pc && pc.status === 'stub' && pc.blueBranch === true,
    '§DECLARED  propose-changes declared as a stub', 'features=' + list.length + ' status=' + (pc && pc.status));

  // §HONEST — the chip is DISABLED; invoke returns not-implemented (NEVER fakes the action).
  var d = FS.descriptor('propose-changes');
  var inv = FS.invoke('propose-changes');
  verdict(d.enabled === false && d.badge === 'soon' && inv.ok === false && inv.status === 'not-implemented',
    '§HONEST  disabled chip + invoke = not-implemented', 'enabled=' + d.enabled + ' invoke=' + inv.status);

  // §UNKNOWN — an unknown feature is rejected, never given an invented descriptor.
  verdict(FS.descriptor('bogus') === null && FS.invoke('bogus').status === 'unknown-feature',
    '§UNKNOWN  unknown feature rejected (no invention)', 'descriptor=null invoke=' + FS.invoke('bogus').status);

  console.log('\n' + (fails === start ? '✅ W-FEATURE-STUB 3/3 PASS' : '❌ ' + (fails - start) + ' FAIL') + '\n');
})();

console.log('──────────────────────────────────────────────');
console.log(fails === 0 ? '✅ W-S12 (REPLAY + NUDGE + FEATURE-STUB) 13/13 PASS' : '❌ ' + fails + ' assertion(s) FAILED');
process.exit(fails === 0 ? 0 : 1);
