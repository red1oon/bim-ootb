#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-WORLD-AT-T + W-COSIGN + W-BROADCAST (teams/ROADMAP.md §S10, Phase F — standalone).
//   Node-only witnesses over overlay/world_at_t.js · erp/cosign.js · overlay/broadcast.js — three Phase-F
//   differentiators, each a PURE deterministic fold of the ONE signed op-log, NON-INVENT, zero modeller/erp
//   runtime edits (connector STUB seam). Fixed ids/ts (no Date.now / Math.random). Each § names the issue.
//
//   W-WORLD-AT-T — the deterministic time-travel re-FOLD (NOT the flaky view-scrubber):
//     §PREFIX      — prefix(cut) = exactly the ops as-of the cut (ts / upToId / beforeId / index).
//     §WORLD-AT    — geom box re-folds to its value BEFORE a later MOVE, and to the moved value after.
//     §RECORD-AT   — an ERP field/status reads its value as-of T (before a later edit) vs now.
//     §BEFORE      — before(opId) rewinds to JUST BEFORE a named edit ("this doc before Bob's edit").
//     §VERIFY-PFX  — a prefix of a valid chain verifies; a tampered op in the prefix breaks it.
//     §DETERMINISM — shuffle arrival → identical fold; every folded guid traces to an INSERT (non-invent).
//   W-COSIGN — maker-checker four-eyes + legal signoff from the crypto we already keep:
//     §THRESHOLD   — requireCoSign: at/above threshold needs co-sign; below posts single-signed.
//     §PENDING     — a lone SUBMIT folds to 'Submitted' (awaiting checker) — never auto-approved.
//     §APPROVED    — maker SUBMIT + eligible DIFFERENT checker APPROVE → 'Approved' + legal memo carried.
//     §FOUR-EYES   — self-approval (checker == maker) REFUSED → stays 'Submitted'.
//     §ELIGIBLE    — an ineligible-role checker REFUSED → stays 'Submitted'.
//     §TAMPER      — a mutated log folds to 'tampered' (non-repudiation from the op sigs).
//   W-BROADCAST — the system-wide sticky = signed annot on the universal broadcast anchor:
//     §GATED       — only a broadcast-eligible author may emit; an ineligible emit throws (never minted).
//     §TARGET      — all / role:<R> / level:<N> reach the right viewers (level = that seniority and up).
//     §ACK-REVOKE  — recipients ACK; an admin REVOKE drops it from active; unacked sort first.
//     §VERIFY      — the broadcast log is tamper-evident; §NONINVENT every active ← a BROADCAST op.
//   Run: node teams/tests/poc_teams_s10.js 2>&1 | tee teams/logs/s10.log — then READ the log.
'use strict';
var path = require('path');
var C = require(path.join(__dirname, '..', 'connectors'));
var WT = require(path.join(__dirname, '..', 'overlay', 'world_at_t.js'));
var X = require(path.join(__dirname, '..', 'erp', 'cosign.js'));
var B = require(path.join(__dirname, '..', 'overlay', 'broadcast.js'));

var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
var T = 1719700000000;

// chain a raw op list into a signed log (arrival = append order; folds are total-order over ts,id).
function chain(ops) {
  var log = [];
  ops.forEach(function (o) { var tip = log.length ? log[log.length - 1].op_hash : 'GENESIS'; C.sign(o, tip); log.push(o); });
  return log;
}

// ════════════════════════════ W-WORLD-AT-T ════════════════════════════
(function () {
  console.log('\n═══ W-WORLD-AT-T — World = fold(History): re-fold a PREFIX → any record as-of any instant ═══\n');

  // a signed log mixing geom (a duct) + ERP (an invoice). The two edits we will rewind past:
  //   Duct-7 MOVED +5x at T+30 (by bob); INV-9 Amount edited 1000→1200 at T+40 (by bob).
  var log = chain([
    { id: 'i1', ts: T + 10, author: 'alice', branch: 'trunk', cls: 'geom', verb: 'INSERT', target: 'Duct-7',
      params: { box: { x: 0, y: 0, z: 0, w: 1, d: 1, h: 1 }, disc: 'MEP', cost: 100 } },
    { id: 'e1', ts: T + 20, author: 'alice', branch: 'trunk', cls: 'erp', verb: 'SET_STATUS', target: 'INV-9',
      params: { to: 'Drafted', fields: { Amount: 1000 } } },
    { id: 'm1', ts: T + 30, author: 'bob', branch: 'trunk', cls: 'geom', verb: 'MOVE', target: 'Duct-7',
      params: { dx: 5 } },
    { id: 'e2', ts: T + 40, author: 'bob', branch: 'trunk', cls: 'erp', verb: 'EDIT', target: 'INV-9',
      params: { fields: { Amount: 1200 } } }
  ]);

  // §PREFIX — the cut selects exactly the as-of ops.
  var pTs = WT.prefix(log, { ts: T + 25 }).map(function (o) { return o.id; });
  var pBefore = WT.prefix(log, { beforeId: 'm1' }).map(function (o) { return o.id; });
  var pUpto = WT.prefix(log, { upToId: 'm1' }).map(function (o) { return o.id; });
  verdict(pTs.join(',') === 'i1,e1' && pBefore.join(',') === 'i1,e1' && pUpto.join(',') === 'i1,e1,m1',
    '§PREFIX  ts/beforeId/upToId select the exact as-of slice',
    'ts≤T+25=[' + pTs + '] before(m1)=[' + pBefore + '] upTo(m1)=[' + pUpto + ']');

  // §WORLD-AT — the geom box re-folds to BEFORE the move at T+25, to AFTER it at T+35.
  var wBefore = WT.worldAt(log, { ts: T + 25 })['Duct-7'];
  var wAfter = WT.worldAt(log, { ts: T + 35 })['Duct-7'];
  verdict(wBefore.box.x === 0 && wAfter.box.x === 5,
    '§WORLD-AT  geom box as-of-T (before vs after the MOVE)', 'x@T+25=' + wBefore.box.x + ' x@T+35=' + wAfter.box.x);

  // §RECORD-AT — the invoice Amount as-of T+35 (1000, pre-edit) vs now (1200), each tagged who/when.
  var rMid = WT.recordAt(log, { ts: T + 35 }, { id: 'INV-9' });
  var rNow = WT.recordAt(log, {}, { id: 'INV-9' });
  verdict(rMid.fields.Amount.value === 1000 && rMid.fields.Amount.who === 'alice' &&
          rNow.fields.Amount.value === 1200 && rNow.fields.Amount.who === 'bob' && rNow.status.value === 'Drafted',
    '§RECORD-AT  ERP field as-of-T (pre-edit) vs now', 'Amount@T+35=' + rMid.fields.Amount.value + ' now=' + rNow.fields.Amount.value);

  // §BEFORE — "this invoice before Bob's edit (e2)" rewinds to just before that op.
  var rBefore = WT.before(log, 'e2', { id: 'INV-9' });
  verdict(rBefore.fields.Amount.value === 1000,
    '§BEFORE  rewind to JUST BEFORE a named edit (blame → time)', 'Amount before e2 = ' + rBefore.fields.Amount.value);

  // §VERIFY-PFX — a prefix of a valid chain verifies; a tampered op in the prefix breaks it.
  var okPfx = WT.verifyAt(log, { ts: T + 35 }).ok;
  var tampered = log.map(function (o) { return JSON.parse(JSON.stringify(o)); });
  tampered[2].params.dx = 999;                                   // forge the MOVE
  var brokePfx = !WT.verifyAt(tampered, { ts: T + 35 }).ok;
  verdict(okPfx && brokePfx, '§VERIFY-PFX  prefix tamper-evident', 'prefix ok=' + okPfx + ' tamperBreaks=' + brokePfx);

  // §DETERMINISM — shuffle arrival → identical fold; every folded guid traces to an INSERT op.
  var shuffled = log.slice().reverse();
  var sameFold = JSON.stringify(WT.worldAt(log, { ts: T + 35 })) === JSON.stringify(WT.worldAt(shuffled, { ts: T + 35 }));
  var inserted = log.filter(function (o) { return o.verb === 'INSERT'; }).map(function (o) { return o.target; });
  var noInvent = Object.keys(WT.worldAt(log, {})).every(function (g) { return inserted.indexOf(g) >= 0; });
  verdict(sameFold && noInvent, '§DETERMINISM  arrival-invariant fold + non-invent (guid ← INSERT)',
    'shuffleSame=' + sameFold + ' nonInvent=' + noInvent);

  console.log('\n' + (fails === 0 ? '✅ W-WORLD-AT-T 6/6 PASS' : '❌ ' + fails + ' FAIL (cumulative)') + '\n');
})();

// ════════════════════════════ W-COSIGN ════════════════════════════
(function () {
  var start = fails;
  console.log('═══ W-COSIGN — maker-checker four-eyes + legal signoff = two signatures on one doc ═══\n');

  var eligible = function (author, role) { return role === 'Mgr' || role === 'Approver'; };
  var THRESH = 5000;

  // §THRESHOLD — the policy decides co-sign vs single-sign by value.
  verdict(X.requireCoSign(8000, THRESH) === true && X.requireCoSign(1000, THRESH) === false,
    '§THRESHOLD  ≥ threshold needs co-sign; below posts single-signed', '8000→true 1000→false');

  // three high-value submissions (one maker = alice), then the pending snapshot, then three approvals.
  var log = [];
  log = X.submit(log, { id: 's1', ts: T + 10, author: 'alice', role: 'AP', doc: 'PO-1', amount: 8000, group: 'g1', legal: 'within DOA §3' }).log;
  log = X.submit(log, { id: 's2', ts: T + 12, author: 'alice', role: 'AP', doc: 'PO-2', amount: 9000, group: 'g2' }).log;
  log = X.submit(log, { id: 's3', ts: T + 14, author: 'alice', role: 'AP', doc: 'PO-3', amount: 7000, group: 'g3' }).log;

  // §PENDING — a lone SUBMIT is 'Submitted' (awaiting checker), never auto-approved.
  var pend = X.coSignState(log, 'PO-1', { eligible: eligible });
  verdict(pend.status === 'Submitted' && /awaiting checker/.test(pend.reason),
    '§PENDING  lone SUBMIT folds to pending (no self-flip)', 'PO-1=' + pend.status + ' (' + pend.reason + ')');

  log = X.approve(log, { id: 'a1', ts: T + 20, author: 'bob', role: 'Mgr', doc: 'PO-1', group: 'g1', legal: 'approved per DOA §3 — Mgr Bob' }).log;
  log = X.approve(log, { id: 'a2', ts: T + 22, author: 'alice', role: 'AP', doc: 'PO-2', group: 'g2' }).log;          // self-approval
  log = X.approve(log, { id: 'a3', ts: T + 24, author: 'dave', role: 'Clerk', doc: 'PO-3', group: 'g3' }).log;        // ineligible

  // §APPROVED — eligible DIFFERENT checker flips to Approved + carries the checker's legal memo.
  var ok = X.coSignState(log, 'PO-1', { eligible: eligible });
  verdict(ok.status === 'Approved' && ok.maker === 'alice' && ok.checker === 'bob' &&
          /Mgr Bob/.test(ok.legal) && ok.approvedAt === T + 20,
    '§APPROVED  four-eyes → Approved + legal signoff', 'PO-1=' + ok.status + ' ' + ok.maker + '→' + ok.checker + ' legal="' + ok.legal + '"');

  // §FOUR-EYES — checker == maker is REFUSED (segregation of duties).
  var self = X.coSignState(log, 'PO-2', { eligible: eligible });
  verdict(self.status === 'Submitted' && /self-approval/.test(self.reason),
    '§FOUR-EYES  self-approval refused', 'PO-2=' + self.status + ' (' + self.reason + ')');

  // §ELIGIBLE — an ineligible-role checker is REFUSED.
  var inel = X.coSignState(log, 'PO-3', { eligible: eligible });
  verdict(inel.status === 'Submitted' && /not eligible/.test(inel.reason),
    '§ELIGIBLE  ineligible checker refused', 'PO-3=' + inel.status + ' (' + inel.reason + ')');

  // §TAMPER — a mutated log folds to 'tampered' (non-repudiation: the sigs catch it).
  var bad = log.map(function (o) { return JSON.parse(JSON.stringify(o)); });
  bad[0].params.amount = 1;                                      // forge the submitted amount
  var tam = X.coSignState(bad, 'PO-1', { eligible: eligible });
  verdict(tam.status === 'tampered', '§TAMPER  mutated log → tampered', 'PO-1(forged)=' + tam.status);

  console.log('\n' + (fails === start ? '✅ W-COSIGN 6/6 PASS' : '❌ ' + (fails - start) + ' FAIL') + '\n');
})();

// ════════════════════════════ W-BROADCAST ════════════════════════════
(function () {
  var start = fails;
  console.log('═══ W-BROADCAST — system-wide sticky = signed annot on the universal broadcast anchor ═══\n');

  var eligible = function (author, role) { return role === 'SysAdmin'; };

  // §GATED — only a broadcast-eligible author may emit; an ineligible emit throws (never minted).
  var threw = false;
  try { B.emit([], { id: 'x', ts: T, author: 'clerk', role: 'Clerk', target: { scope: 'all' }, msg: 'nope', eligible: eligible }); }
  catch (e) { threw = true; }

  var log = [];
  log = B.emit(log, { id: 'b1', ts: T + 10, author: 'admin', role: 'SysAdmin', target: { scope: 'all' }, msg: 'period close Friday', eligible: eligible }).log;
  log = B.emit(log, { id: 'b2', ts: T + 20, author: 'admin', role: 'SysAdmin', target: { scope: 'role', value: 'AP' }, msg: 'AP recon today', eligible: eligible }).log;
  log = B.emit(log, { id: 'b3', ts: T + 30, author: 'admin', role: 'SysAdmin', target: { scope: 'level', value: 2 }, msg: 'managers sync', eligible: eligible }).log;
  verdict(threw && log.length === 3 && log.every(function (o) { return o.cls === 'annot' && o.verb === 'BROADCAST' && o.sig; }),
    '§GATED  eligible-only emit (ineligible throws)', 'ineligibleThrew=' + threw + ' emitted=' + log.length);

  // recipients ACK + an admin REVOKE.
  log = B.ack(log, { id: 'k1', ts: T + 40, author: 'bob', role: 'AP', bid: 'b1', ref: 'all' }).log;     // bob acks the 'all' note
  log = B.emit(log, { id: 'b4', ts: T + 45, author: 'admin', role: 'SysAdmin', target: { scope: 'all' }, msg: 'typo, ignore', eligible: eligible }).log;
  log = B.revoke(log, { id: 'rv', ts: T + 50, author: 'admin', role: 'SysAdmin', bid: 'b4', ref: 'all' }).log;

  var folded = B.foldBroadcasts(log);

  // §TARGET — all / role / level reach the right viewers (level = that seniority and up).
  var bob = B.broadcastsFor(folded, { user: 'bob', role: 'AP', level: 1 });        // all + role:AP, NOT level:2
  var carol = B.broadcastsFor(folded, { user: 'carol', role: 'Mgr', level: 3 });   // all + level:2, NOT role:AP
  var bobBids = bob.map(function (b) { return b.bid; }).sort();
  var carolBids = carol.map(function (b) { return b.bid; }).sort();
  verdict(bobBids.join(',') === 'b1,b2' && carolBids.join(',') === 'b1,b3',
    '§TARGET  all/role/level reach the right viewers', 'bob=[' + bobBids + '] carol=[' + carolBids + ']');

  // §ACK-REVOKE — b4 revoked → out of active; b1 acked by bob → sorts after the unacked b2.
  var b1 = folded.active.filter(function (b) { return b.bid === 'b1'; })[0];
  var revokedGone = folded.active.every(function (b) { return b.bid !== 'b4'; }) && folded.all.length === 4;
  var bobOrder = bob.map(function (b) { return b.bid + (b.acked ? '✓' : ''); }).join(',');   // b2 (unacked) before b1✓
  verdict(b1.acks.indexOf('bob') >= 0 && revokedGone && bobOrder === 'b2,b1✓',
    '§ACK-REVOKE  ack tracked · revoke drops active · unacked-first', 'b1.acks=[' + b1.acks + '] order=' + bobOrder + ' active=' + folded.active.length);

  // §VERIFY + §NONINVENT — tamper-evident; every active broadcast traces to a BROADCAST op.
  var okV = B.verify(log).ok;
  var bad = log.map(function (o) { return JSON.parse(JSON.stringify(o)); });
  bad[0].params.msg = 'EDITED';
  var brokeV = !B.verify(bad).ok;
  var emittedBids = log.filter(function (o) { return o.verb === 'BROADCAST'; }).map(function (o) { return o.params.bid; });
  var noInvent = folded.all.every(function (b) { return emittedBids.indexOf(b.bid) >= 0; });
  verdict(okV && brokeV && noInvent, '§VERIFY  tamper-evident + non-invent (active ← BROADCAST op)',
    'verify=' + okV + ' tamperBreaks=' + brokeV + ' nonInvent=' + noInvent);

  console.log('\n' + (fails === start ? '✅ W-BROADCAST 4/4 PASS' : '❌ ' + (fails - start) + ' FAIL') + '\n');
})();

console.log('──────────────────────────────────────────────');
console.log(fails === 0 ? '✅ W-S10 (WORLD-AT-T + COSIGN + BROADCAST) 16/16 PASS' : '❌ ' + fails + ' assertion(s) FAILED');
process.exit(fails === 0 ? 0 : 1);
