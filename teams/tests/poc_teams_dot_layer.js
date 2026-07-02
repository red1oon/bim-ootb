#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-DOT-LAYER + W-BLAME-RECORD (teams/ROADMAP.md §S2, Phase B — standalone, zero impact).
//   Node-only witness over the PURE builders in overlay/dot_layer.js. Every dot is a fold of a signed
//   op-log (NON-INVENT); fixed edge-minted ids + ts (no Date.now / Math.random). Touches NO modeller code.
//     §OFF-NOOP      — Team OFF (on:false) → empty model (the HARD RULE: off = pixel-identical UI).
//     §PERSON-DOT    — person dots = who-touched-each-anchor, last action carried, colour+initials.
//     §POSTIT-DOT    — post-it dots from `annot` ops; RESOLVE/SNOOZE → status + faded; PIN stays open.
//     §FANOUT        — many dots on one anchor → +N cluster (visible head + overflow), never a pile.
//     §COLOR-SIGNER  — same author → same colour everywhere; distinct authors → distinct colours.
//     §ORDER-INV     — shuffle op arrival → identical model (folds in total order, holder-irrelevant).
//     §NONINVENT     — every person dot traces to an op author; cluster counts == dot counts.
//     §RECINFO       — record-grain blame: who LAST touched each record, + when + action.
//     §RECINFO-LAST  — a later op by another author overwrites who (last-writer in total order).
//     §RECINFO-LOADBEARING — drop the last op → blame reverts to the prior author (not a hardcode).
//   Run: node teams/tests/poc_teams_dot_layer.js 2>&1 | tee teams/logs/dot_layer.log — then READ the log.
'use strict';
var path = require('path');
var D = require(path.join(__dirname, '..', 'overlay', 'dot_layer.js'));

var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }

var T = 1719700000000;
function op(id, ts, author, cls, verb, target, params) {
  return { id: id, ts: ts, author: author, cls: cls, verb: verb, target: target, params: params || {} };
}

(function () {
  console.log('\n═══ W-DOT-LAYER + W-BLAME-RECORD — universal dot optics = pure folds of the signed log ═══\n');

  // ── scenario: 3 ERP records, several actors, plus post-its. cls 'erp' = a data touch; 'annot' = post-it.
  //    INV-001: alice creates, bob edits, alice posts → last toucher alice; 2 persons.
  //    INV-002: carol creates → 1 person.
  //    SO-9   : dave/erin/frank/gita/hank all touch → 5 persons (fan-out +N).
  var ops = [
    op('a1', T + 10, 'alice', 'erp', 'CREATE', 'INV-001'),
    op('b1', T + 20, 'bob',   'erp', 'EDIT',   'INV-001'),
    op('a2', T + 30, 'alice', 'erp', 'POST',   'INV-001'),
    op('c1', T + 40, 'carol', 'erp', 'CREATE', 'INV-002'),
    op('d1', T + 50, 'dave',  'erp', 'CREATE', 'SO-9'),
    op('e1', T + 60, 'erin',  'erp', 'EDIT',   'SO-9'),
    op('f1', T + 70, 'frank', 'erp', 'EDIT',   'SO-9'),
    op('g1', T + 80, 'gita',  'erp', 'EDIT',   'SO-9'),
    op('h1', T + 90, 'hank',  'erp', 'EDIT',   'SO-9'),
    // post-its (annot): one open on INV-001, one resolved on INV-002
    op('p1', T + 100, 'bob',   'annot', 'PIN',     'INV-001', { pinId: 'P1', msg: 'check tax line' }),
    op('p2', T + 110, 'carol', 'annot', 'PIN',     'INV-002', { pinId: 'P2', msg: 'await approval' }),
    op('p3', T + 120, 'carol', 'annot', 'RESOLVE', 'INV-002', { pinId: 'P2' })
  ];

  // §OFF-NOOP — Team OFF → empty model (renders nothing).
  var off = D.dotLayerModel(ops, { on: false });
  verdict(off.on === false && off.clusters.length === 0 && off.persons.length === 0,
    '§OFF-NOOP  Team off → empty model', 'clusters=' + off.clusters.length + ' (host pixels untouched)');

  var m = D.dotLayerModel(ops, { on: true, maxVisible: 2 });

  // §PERSON-DOT — INV-001 has 2 persons; alice's dot carries her LAST action (POST), with colour+initials.
  var inv1 = m.persons.filter(function (d) { return d.anchor === 'INV-001'; });
  var alice = inv1.filter(function (d) { return d.person === 'alice'; })[0];
  verdict(inv1.length === 2 && alice && alice.lastAction === 'POST' && /^hsl\(/.test(alice.color) && alice.initials === 'AL',
    '§PERSON-DOT  who-touched + last action + colour/initials', 'INV-001 persons=' + inv1.length + ' alice.last=' + (alice && alice.lastAction) + ' init=' + (alice && alice.initials));

  // §POSTIT-DOT — P1 open (not faded); P2 resolved → faded.
  var p1 = m.postits.filter(function (d) { return d.pinId === 'P1'; })[0];
  var p2 = m.postits.filter(function (d) { return d.pinId === 'P2'; })[0];
  verdict(p1 && p1.status === 'open' && !p1.faded && p2 && p2.status === 'resolved' && p2.faded,
    '§POSTIT-DOT  post-it status fold + fade', 'P1=' + (p1 && p1.status) + '/faded=' + (p1 && p1.faded) + ' P2=' + (p2 && p2.status) + '/faded=' + (p2 && p2.faded));

  // §FANOUT — SO-9 (5 persons, maxVisible 2) → cluster with 2 visible + '+3' badge.
  var so9 = m.clusters.filter(function (c) { return c.anchor === 'SO-9' && c.kind === 'person'; })[0];
  verdict(so9 && so9.count === 5 && so9.visible.length === 2 && so9.overflow === 3 && so9.badge === '+3',
    '§FANOUT  +N cluster collapses overlap', 'SO-9 count=' + (so9 && so9.count) + ' visible=' + (so9 && so9.visible.length) + ' badge=' + (so9 && so9.badge));

  // §COLOR-SIGNER — same author → same colour (call twice); distinct authors → distinct colours.
  var sameAlice = D.colorOf('alice') === D.colorOf('alice');
  var authors = ['alice', 'bob', 'carol', 'dave', 'erin', 'frank', 'gita', 'hank'];
  var colors = {}; authors.forEach(function (a) { colors[D.colorOf(a)] = (colors[D.colorOf(a)] || 0) + 1; });
  var distinct = Object.keys(colors).length;
  verdict(sameAlice && distinct >= 7, '§COLOR-SIGNER  colour = signer (stable + distinct)', 'alice stable=' + sameAlice + ' distinct ' + distinct + '/8 authors');

  // §ORDER-INV — shuffle arrival → identical model JSON (folds in total order, not arrival order).
  var shuffled = ops.slice().reverse();
  var m2 = D.dotLayerModel(shuffled, { on: true, maxVisible: 2 });
  verdict(JSON.stringify(m) === JSON.stringify(m2), '§ORDER-INV  shuffle → identical model', 'total-order fold, holder-irrelevant');

  // §NONINVENT — every person dot is a real op author; cluster counts sum to dot counts.
  var dotAuthors = m.persons.map(function (d) { return d.person; });
  var opAuthors = ops.filter(function (o) { return o.cls === 'erp'; }).map(function (o) { return o.author; });
  var allReal = dotAuthors.every(function (a) { return opAuthors.indexOf(a) >= 0; });
  var personClusters = m.clusters.filter(function (c) { return c.kind === 'person'; });
  var clusterSum = personClusters.reduce(function (s, c) { return s + c.count; }, 0);
  verdict(allReal && clusterSum === m.persons.length, '§NONINVENT  every dot traces to an op; counts match',
    'allReal=' + allReal + ' clusterΣ=' + clusterSum + ' persons=' + m.persons.length);

  // ════ W-BLAME-RECORD (W-RECINFO) ════
  var rb = D.recordBlame(ops, {});
  // §RECINFO — who LAST touched each record + when + action (annot ops excluded — not a data touch).
  verdict(rb['INV-001'] && rb['INV-001'].who === 'alice' && rb['INV-001'].action === 'POST' && rb['INV-001'].when === T + 30 &&
          rb['SO-9'].who === 'hank' && rb['INV-002'].who === 'carol',
    '§RECINFO  record-grain who/when/action', 'INV-001=' + rb['INV-001'].who + '@' + rb['INV-001'].action + ' SO-9=' + rb['SO-9'].who);

  // §RECINFO-LAST — bob's edit then alice's POST → last-writer is alice (not bob).
  verdict(rb['INV-001'].who === 'alice', '§RECINFO-LAST  later op overwrites (last-writer)', 'alice POST > bob EDIT');

  // §RECINFO-LOADBEARING — drop alice's POST (a2) → INV-001 reverts to bob (the prior toucher), not a hardcode.
  var rb2 = D.recordBlame(ops.filter(function (o) { return o.id !== 'a2'; }), {});
  verdict(rb2['INV-001'].who === 'bob', '§RECINFO-LOADBEARING  drop last op → reverts to prior', 'INV-001 → ' + rb2['INV-001'].who);

  // sanity: the DOM renderer is a strict no-op in node (no document) — must not throw.
  var threw = false; try { D.renderDotLayer(null, m, {}); } catch (e) { threw = true; }
  verdict(!threw, '§RENDER-NOOP  renderDotLayer no-ops safely in node', 'no DOM → no throw');

  var n = 11;
  console.log('\n' + (fails === 0 ? '✅ W-DOT-LAYER + W-BLAME-RECORD ' + n + '/' + n + ' PASS' : '❌ ' + fails + '/' + n + ' FAIL') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})();
