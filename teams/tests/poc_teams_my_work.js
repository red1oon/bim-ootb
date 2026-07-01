#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-ERP-MYWORK + W-FIELD-LINEAGE (teams/ROADMAP.md §S6, Phase C — read-only, zero impact).
//   Node-only over teams/erp/my_work.js: the "waiting-for-me" inbox + field-grain hover-blame, both PURE
//   folds of a SEEDED op-log (zero erp/ edits, no AD_ChangeLog removed). Deterministic (fixed ids/ts), NON-INVENT.
//     §MYWORK-ROLE     — Mgr sees docs awaiting approval; AP sees docs awaiting posting; disjoint inboxes.
//     §MYWORK-ASSIGN   — an explicit ASSIGN to the viewer lands in their inbox.
//     §MYWORK-MENTION  — an UNRESOLVED @mention is in the inbox; a RESOLVED one is not.
//     §MYWORK-TERMINAL — a posted/closed doc never waits (excluded).
//     §MYWORK-ORDER    — oldest-waiting first (most urgent).
//     §MYWORK-NONINVENT— every inbox item traces to a doc/op (no invented task).
//     §FIELD-LINEAGE   — dwell on (table,id,column) → reverse-chron value·who·when.
//     §FIELD-FILTER    — a different column returns only its own changes (isolation).
//     §FIELD-ZEROWRITE — lineage length == #ops that changed that field (pure fold, zero extra writes).
//     §FIELD-ADDITIVE  — record snapshot = last value per column (the fold ADDS history; AD_ChangeLog untouched).
//   Run: node teams/tests/poc_teams_my_work.js 2>&1 | tee teams/logs/my_work.log — then READ the log.
'use strict';
var path = require('path');
var M = require(path.join(__dirname, '..', 'erp', 'my_work.js'));

var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
var T = 1719700000000, S = 1000;
function erp(id, ts, author, verb, target, params, extra) {
  return Object.assign({ id: id, ts: ts, author: author, cls: 'erp', verb: verb, target: target, params: params || {} }, extra || {});
}

(function () {
  console.log('\n═══ W-ERP-MYWORK + W-FIELD-LINEAGE — the per-role inbox + field-grain history (log folds) ═══\n');

  // P2P statuses: drafted→Sales submit, submitted→Mgr approve, approved→AP post, posted=terminal.
  var responsible = { drafted: 'Sales', submitted: 'Mgr', approved: 'AP' };
  var terminal = ['posted', 'closed'];

  // docs at various stages + an assignment + post-its (annot mentions).
  var ops = [
    erp('o1', T + 1 * S, 'alice', 'SET_STATUS', 'O1', { to: 'submitted' }),   // awaits Mgr
    erp('o2', T + 2 * S, 'bob',   'SET_STATUS', 'O2', { to: 'approved' }),    // awaits AP
    erp('o3', T + 3 * S, 'cara',  'SET_STATUS', 'O3', { to: 'posted' }),      // terminal — waits for no one
    erp('o4', T + 4 * S, 'dave',  'SET_STATUS', 'O4', { to: 'submitted' }),   // awaits Mgr (older than O1? no, newer)
    erp('a1', T + 1 * S, 'lead',  'ASSIGN',     'O5', { assignee: 'alice' }), // assigned to alice
    erp('o5', T + 1 * S, 'alice', 'SET_STATUS', 'O5', { to: 'drafted' }),     // open
    // post-its: P1 mentions @bob unresolved; P2 mentions @bob but resolved.
    { id: 'p1', ts: T + 6 * S, author: 'cara', cls: 'annot', verb: 'PIN', target: 'O2', params: { pinId: 'P1', msg: 'pls check @bob', mentions: ['bob'] } },
    { id: 'p2', ts: T + 7 * S, author: 'cara', cls: 'annot', verb: 'PIN', target: 'O1', params: { pinId: 'P2', msg: 'fyi @bob', mentions: ['bob'] } },
    { id: 'r2', ts: T + 8 * S, author: 'bob',  cls: 'annot', verb: 'RESOLVE', target: 'O1', params: { pinId: 'P2' } }
  ];

  // §MYWORK-ROLE — Mgr (bob) sees O1+O4 (submitted); AP (cara) sees O2 (approved); disjoint.
  var mgr = M.myWork(ops, { viewer: 'bob', role: 'Mgr', responsible: responsible, terminal: terminal });
  var ap = M.myWork(ops, { viewer: 'cara', role: 'AP', responsible: responsible, terminal: terminal });
  var mgrDocs = mgr.items.filter(function (i) { return i.kind === 'action'; }).map(function (i) { return i.doc; }).sort();
  var apDocs = ap.items.filter(function (i) { return i.kind === 'action'; }).map(function (i) { return i.doc; }).sort();
  verdict(JSON.stringify(mgrDocs) === JSON.stringify(['O1', 'O4']) && JSON.stringify(apDocs) === JSON.stringify(['O2']),
    '§MYWORK-ROLE  per-role waiting-for-me', 'Mgr=[' + mgrDocs.join(',') + '] AP=[' + apDocs.join(',') + ']');

  // §MYWORK-ASSIGN — alice's inbox carries O5 (assigned to her).
  var alice = M.myWork(ops, { viewer: 'alice', role: 'Sales', responsible: responsible, terminal: terminal });
  verdict(alice.items.some(function (i) { return i.kind === 'assigned' && i.doc === 'O5'; }),
    '§MYWORK-ASSIGN  explicit assignment lands in inbox', 'alice assigned=' + alice.items.filter(function (i) { return i.kind === 'assigned'; }).map(function (i) { return i.doc; }).join(','));

  // §MYWORK-MENTION — bob has an unresolved mention (P1 on O2); the resolved one (P2 on O1) is NOT there.
  var bobMentions = mgr.items.filter(function (i) { return i.kind === 'mention'; }).map(function (i) { return i.doc; });
  verdict(bobMentions.indexOf('O2') >= 0 && bobMentions.indexOf('O1') < 0,
    '§MYWORK-MENTION  unresolved @mention in; resolved out', 'bob mentions=[' + bobMentions.join(',') + ']');

  // §MYWORK-TERMINAL — O3 (posted) is in nobody's action inbox.
  var anyHasO3 = mgr.items.concat(ap.items).concat(alice.items).some(function (i) { return i.doc === 'O3' && i.kind === 'action'; });
  verdict(!anyHasO3, '§MYWORK-TERMINAL  posted doc waits for no one', 'O3 in an action inbox = ' + anyHasO3);

  // §MYWORK-ORDER — Mgr inbox oldest-waiting first: O1 (t1) before O4 (t4).
  var mgrAction = mgr.items.filter(function (i) { return i.kind === 'action'; });
  verdict(mgrAction[0].doc === 'O1' && mgrAction[1].doc === 'O4' && mgrAction[0].since < mgrAction[1].since,
    '§MYWORK-ORDER  oldest-waiting first', mgrAction.map(function (i) { return i.doc; }).join('→'));

  // §MYWORK-NONINVENT — every item's doc appears as an op target.
  var targets = ops.map(function (o) { return o.target; });
  var allReal = mgr.items.concat(ap.items, alice.items).every(function (i) { return targets.indexOf(i.doc) >= 0; });
  verdict(allReal, '§MYWORK-NONINVENT  every item ← a real doc/op', 'allReal=' + allReal);

  // ════ W-FIELD-LINEAGE ════ — O1's doc_status changes over time + a GrandTotal edit.
  var fops = [
    erp('f1', T + 1 * S, 'alice', 'CREATE',     'O1', { fields: { doc_status: 'drafted', GrandTotal: 1000 } }, { table: 'C_Order' }),
    erp('f2', T + 2 * S, 'alice', 'EDIT',       'O1', { fields: { GrandTotal: 1200 } },                       { table: 'C_Order' }),
    erp('f3', T + 3 * S, 'mgr',   'SET_STATUS', 'O1', { fields: { doc_status: 'submitted' } },                { table: 'C_Order' }),
    erp('f4', T + 4 * S, 'bob',   'SET_STATUS', 'O1', { fields: { doc_status: 'approved' } },                 { table: 'C_Order' }),
    erp('f9', T + 2 * S, 'zed',   'SET_STATUS', 'O9', { fields: { doc_status: 'submitted' } },                { table: 'C_Order' }) // other record
  ];
  var lin = M.fieldLineage(fops, { table: 'C_Order', id: 'O1', column: 'doc_status' });
  // §FIELD-LINEAGE — reverse-chron value·who·when: approved(bob,t4) → submitted(mgr,t3) → drafted(alice,t1).
  verdict(lin.length === 3 && lin[0].value === 'approved' && lin[0].who === 'bob' && lin[0].when === T + 4 * S &&
          lin[2].value === 'drafted' && lin[2].who === 'alice',
    '§FIELD-LINEAGE  reverse-chron value·who·when', lin.map(function (e) { return e.value + '(' + e.who + ')'; }).join(' ← '));

  // §FIELD-FILTER — GrandTotal lineage is isolated (2 edits: 1000 then 1200).
  var gt = M.fieldLineage(fops, { table: 'C_Order', id: 'O1', column: 'GrandTotal' });
  verdict(gt.length === 2 && gt[0].value === 1200 && gt[1].value === 1000,
    '§FIELD-FILTER  column isolation', 'GrandTotal ' + gt.map(function (e) { return e.value; }).join(' ← '));

  // §FIELD-ZEROWRITE — lineage length == #ops that wrote that field (pure fold, no extra writes).
  var statusWrites = fops.filter(function (o) { return o.target === 'O1' && o.params.fields && 'doc_status' in o.params.fields; }).length;
  verdict(lin.length === statusWrites, '§FIELD-ZEROWRITE  fold == ops, zero extra writes', 'lineage=' + lin.length + ' ops=' + statusWrites);

  // §FIELD-ADDITIVE — record snapshot = last value per column (we ADD history; AD_ChangeLog untouched).
  var snap = M.recordFields(fops, { table: 'C_Order', id: 'O1' });
  verdict(snap.doc_status.value === 'approved' && snap.GrandTotal.value === 1200,
    '§FIELD-ADDITIVE  derived snapshot (AD_ChangeLog NOT removed)', 'doc_status=' + snap.doc_status.value + ' GrandTotal=' + snap.GrandTotal.value);

  var n = 10;
  console.log('\n' + (fails === 0 ? '✅ W-ERP-MYWORK + W-FIELD-LINEAGE ' + n + '/' + n + ' PASS' : '❌ ' + fails + '/' + n + ' FAIL') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})();
