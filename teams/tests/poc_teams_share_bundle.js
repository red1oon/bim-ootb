#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-BUNDLE-SHARE + W-WORK-SUMMARY (teams/ROADMAP.md §S4, Phase B — standalone, zero impact).
//   Node-only over overlay/share_bundle.js: select post-its → one bundle → push to a channel (Team feed
//   on the SIGNED facilitator / WhatsApp-stub / link) → receiver round-trips back to deep-linked items.
//   Plus the on-the-fly work summary (what·who·when, exportable+editable). PURE folds, NON-INVENT,
//   deterministic (fixed ids/ts/now). Touches NO modeller code (connector STUB seam).
//     §SELECT       — select 'unresolved' / 'this-anchor' / 'all' = pure predicates over folded post-its.
//     §BUNDLE       — N post-its → one digest; each item carries note+anchor+status+a BCF deep-link.
//     §FEED-SIGNED  — dispatch→feed pushes a SIGNED BUNDLE op onto the facilitator; verifyChain ok.
//     §WHATSAPP     — dispatch→whatsapp = one batched text body carrying every note + deeplink.
//     §ROUND-TRIP   — receiver parses a shared bundle back to its items (tap → jump).
//     §NONINVENT-B  — bundle item count == selected count; every item ← a real post-it.
//     §SUMMARY      — workSummary folds a flow → ordered what·who·when rows + distinct participants.
//     §SUMMARY-EXPORT — summaryToText/Markdown render every row (the exportable replay/training script).
//     §SUMMARY-EDIT — the rows are plain data: edit one → re-export reflects it (editable).
//     §SUMMARY-ORDER-INV — shuffle op arrival → identical summary (total-order fold).
//   Run: node teams/tests/poc_teams_share_bundle.js 2>&1 | tee teams/logs/share_bundle.log — then READ the log.
'use strict';
var path = require('path');
var S = require(path.join(__dirname, '..', 'overlay', 'share_bundle.js'));
var P = require(path.join(__dirname, '..', 'overlay', 'postit.js'));
var F = require(path.join(__dirname, '..', 'facilitator.js'));

var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
var T = 1719700000000;

(function () {
  console.log('\n═══ W-BUNDLE-SHARE + W-WORK-SUMMARY — bunch-&-share + the log-as-report ═══\n');

  var docA = P.makeAnchor('doc', 'INV-001');
  var flowB = P.makeAnchor('flow', 'P2P');

  // a real signed post-it log → fold to post-it states.
  var log = [];
  log = P.pin(log, { id: 'p1', ts: T + 10, author: 'alice', anchor: docA,  msg: 'check tax @bob', visibility: 'shared' }).log;
  log = P.pin(log, { id: 'p2', ts: T + 20, author: 'bob',   anchor: docA,  msg: 'await approval', visibility: 'shared' }).log;
  log = P.pin(log, { id: 'p3', ts: T + 30, author: 'carol', anchor: flowB, msg: 'reorder spike',  visibility: 'shared' }).log;
  log = P.resolve(log, { id: 's1', ts: T + 40, author: 'bob', anchor: docA, pinId: 'p2' }).log;
  var posts = P.foldPostits(log);

  // §SELECT — unresolved = p1,p3 (p2 resolved); this-anchor doc:INV-001 = p1,p2.
  var unresolved = S.select(posts, 'unresolved');
  var thisDoc = S.select(posts, 'this-anchor', { anchorKey: 'doc:INV-001' });
  verdict(unresolved.length === 2 && unresolved.every(function (p) { return p.status !== 'resolved'; }) &&
          thisDoc.length === 2 && S.select(posts, 'all').length === 3,
    '§SELECT  pure selection predicates', 'unresolved=' + unresolved.length + ' doc=' + thisDoc.length + ' all=3');

  // §BUNDLE — N post-its → one digest; each item self-contained with a deep-link.
  var b = S.bundle(unresolved, { id: 'B1', title: 'Open issues' });
  var item0 = b.items[0];
  verdict(b.count === 2 && item0.deeplink === 'team://doc/INV-001#pin=p1' && item0.note === 'check tax @bob' && item0.status === 'open',
    '§BUNDLE  digest items carry note+anchor+status+deeplink', 'count=' + b.count + ' link=' + item0.deeplink);

  // §FEED-SIGNED — push the bundle onto the facilitator as a SIGNED op; chain verifies.
  var fac = F.makeFacilitator();
  var fed = S.dispatch(b, 'feed', { facilitator: fac, id: 'op-bundle-1', ts: T + 50, author: 'alice', branch: 'alice' });
  var chainOk = require(path.join(__dirname, '..', 'connectors.js')).verifyChain(fed.log).ok;
  verdict(fed.ok && fed.accepted === 1 && fed.op.cls === 'annot' && fed.op.verb === 'BUNDLE' && chainOk,
    '§FEED-SIGNED  signed BUNDLE op on the facilitator', 'accepted=' + fed.accepted + ' chainOk=' + chainOk);

  // §WHATSAPP — one batched text body carrying every note + deeplink.
  var wa = S.dispatch(b, 'whatsapp');
  var carriesAll = b.items.every(function (it) { return wa.text.indexOf(it.deeplink) >= 0 && wa.text.indexOf(it.note) >= 0; });
  verdict(wa.ok && carriesAll, '§WHATSAPP  batched text carries every item', 'len=' + wa.text.length + ' carriesAll=' + carriesAll);

  // §ROUND-TRIP — receiver parses a shared bundle back to its items (across channels).
  var rtFeed = S.receive(fed).length === 2;
  var rtLink = S.receive(S.dispatch(b, 'link', { facilitator: fac })).length === 2;
  var rtWa = S.receive(wa).length === 2;
  verdict(rtFeed && rtLink && rtWa, '§ROUND-TRIP  receiver recovers items (feed/link/whatsapp)',
    'feed=' + S.receive(fed).length + ' link=2 whatsapp=2');

  // §NONINVENT-B — bundle count == selected count; every item ← a real post-it.
  var srcIds = unresolved.map(function (p) { return p.pinId; }).sort();
  var itemIds = b.items.map(function (it) { return it.pinId; }).sort();
  verdict(b.count === unresolved.length && JSON.stringify(srcIds) === JSON.stringify(itemIds),
    '§NONINVENT-B  every bundle item ← a post-it', 'src=[' + srcIds.join(',') + '] items=[' + itemIds.join(',') + ']');

  // ════ W-WORK-SUMMARY ════ — a real P2P flow over generic signed ops.
  var flow = [
    { id: 'f1', ts: T + 100, author: 'alice', cls: 'erp', verb: 'CREATE',  target: 'flow:P2P' },
    { id: 'f2', ts: T + 110, author: 'bob',   cls: 'erp', verb: 'APPROVE', target: 'flow:P2P' },
    { id: 'f3', ts: T + 120, author: 'carol', cls: 'erp', verb: 'RECEIVE', target: 'flow:P2P' },
    { id: 'f4', ts: T + 130, author: 'alice', cls: 'erp', verb: 'POST',    target: 'flow:P2P' },
    { id: 'x1', ts: T + 140, author: 'dave',  cls: 'erp', verb: 'EDIT',    target: 'flow:OTHER' }   // out of scope
  ];
  var sum = S.workSummary(flow, { anchorKey: 'flow:P2P' });
  // §SUMMARY — ordered what·who·when, scoped, distinct participants (OTHER excluded).
  verdict(sum.count === 4 && sum.rows[0].what === 'CREATE flow:P2P' && sum.rows[3].who === 'alice' &&
          JSON.stringify(sum.participants) === JSON.stringify(['alice', 'bob', 'carol']),
    '§SUMMARY  what·who·when flow fold', 'steps=' + sum.count + ' people=' + sum.participants.length);

  // §SUMMARY-EXPORT — text + markdown render every row.
  var txt = S.summaryToText(sum), md = S.summaryToMarkdown(sum);
  var allRendered = sum.rows.every(function (r) { return txt.indexOf(r.what) >= 0 && md.indexOf(r.what) >= 0; });
  verdict(allRendered && md.split('\n').length === sum.rows.length + 2,
    '§SUMMARY-EXPORT  exportable replay/training script', 'txt+md render all ' + sum.count + ' rows');

  // §SUMMARY-EDIT — rows are plain data: edit one → re-export reflects it.
  sum.rows[1].what = 'APPROVE (edited)';
  verdict(S.summaryToText(sum).indexOf('APPROVE (edited)') >= 0, '§SUMMARY-EDIT  editable digest', 'edit reflects in export');

  // §SUMMARY-ORDER-INV — shuffle arrival → identical summary.
  var sum2 = S.workSummary(flow.slice().reverse(), { anchorKey: 'flow:P2P' });
  verdict(JSON.stringify(S.workSummary(flow, { anchorKey: 'flow:P2P' })) === JSON.stringify(sum2),
    '§SUMMARY-ORDER-INV  shuffle → identical summary', 'total-order fold');

  var n = 10;
  console.log('\n' + (fails === 0 ? '✅ W-BUNDLE-SHARE + W-WORK-SUMMARY ' + n + '/' + n + ' PASS' : '❌ ' + fails + '/' + n + ' FAIL') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})();
