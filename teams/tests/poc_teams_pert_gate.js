#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-PERT-GATE (RESUME_TEAMS_UI_CONSISTENCY §3b.2 + §1a ③). Node witness over the PURE
//   PERT/schedule merge-gate in pert_gate.js — the SCHEDULE-context twin of the spatial teams/gate.js. Every
//   task folds the signed SCHEDULE op-log (NON-INVENT); fixed edge-minted ids+ts (no Date.now). Zero erp/ edits.
//     §FOLD          — foldSchedule folds ops → tasks; RESCHEDULE is last-writer; end = start + duration.
//     §DEP-CLEAN     — a successor that starts AT/after its predecessor's end is clean (green).
//     §DEP-VIOLATION — a successor that starts BEFORE its predecessor ends → verified-red + the violation `by`.
//     §RESOURCE-CLASH— one resource booked in two overlapping windows → both tasks verified-red.
//     §CYCLE         — a dependency cycle A→B→A is detected and both nodes go red.
//     §TIER1-HINT    — coarse hint(margin) flags a near-miss the precise Tier-2 settle(margin 0) does NOT.
//     §LADDER-STALE  — staleness overlay paints every task `stale` when the branch is behind the trunk tip.
//     §MATRIX        — per-resource clash counts (the §8 dashboard cell counts).
//     §ORDER-INV     — shuffle op arrival → identical settle (folds in total order).
//   Run: node teams/tests/poc_teams_pert_gate.js 2>&1 | tee teams/logs/pert_gate.log — then READ the log.
'use strict';
var path = require('path');
var PG = require(path.join(__dirname, '..', 'pert_gate.js'));
var E = require(path.join(__dirname, '..', 'engine.js'));

var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
function jeq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

var T = 1719700000000;
function op(id, ts, author, verb, target, params) { return { id: id, ts: ts, author: author, branch: author, cls: 'sched', verb: verb, target: target, params: params || {} }; }

(function () {
  console.log('\n═══ W-PERT-GATE — schedule merge-gate: dependency + resource conflicts (gate.js\'s PERT twin) ═══\n');

  // ── scenario (NON-INVENT): a build schedule. Each conflict kind is kept on its OWN axis so the verdicts
  //   are unambiguous (the gate is right: a task is red if it has ANY conflict).
  //   found  [0,10) crane             green
  //   wall   [10,15) crane, dep found (10>=10 clean), no crane overlap with found → green  (DEP-CLEAN)
  //   roof   [12,17) hoist, dep wall  → DEP VIOLATION only (12<15 by 3), resource alone → red
  //   paint  [8,12) painter ; elec [9,12) painter → painter double-booked → both red       (RESOURCE-CLASH)
  //   g1     [20,25) crane ; g2 [22,27) crane → crane double-booked → both red (separate from wall)
  var ops = [
    op('o1', T + 1, 'pm', 'SCHEDULE', 'found', { start: 0, duration: 10, resource: 'crane', cost: 100 }),
    op('o2', T + 2, 'pm', 'SCHEDULE', 'wall', { start: 10, duration: 5, resource: 'crane', deps: ['found'], cost: 50 }),
    op('o3', T + 3, 'pm', 'SCHEDULE', 'roof', { start: 99, duration: 5, resource: 'hoist', deps: ['wall'] }),
    op('o3b', T + 4, 'pm', 'RESCHEDULE', 'roof', { start: 12 }),   // last-writer: roof moves to 12 → dep violation
    op('o4', T + 5, 'pm', 'SCHEDULE', 'paint', { start: 8, duration: 4, resource: 'painter' }),
    op('o5', T + 6, 'pm', 'SCHEDULE', 'elec', { start: 9, duration: 3, resource: 'painter' }),
    op('o6', T + 7, 'pm', 'SCHEDULE', 'g1', { start: 20, duration: 5, resource: 'crane' }),
    op('o7', T + 8, 'pm', 'SCHEDULE', 'g2', { start: 22, duration: 5, resource: 'crane' })
  ];

  // §FOLD
  var tasks = PG.foldSchedule(ops);
  verdict(tasks.roof.start === 12 && tasks.roof.end === 17 && tasks.wall.end === 15 && jeq(tasks.wall.deps, ['found']),
    '§FOLD  ops fold → tasks (RESCHEDULE last-writer; end=start+dur)', 'roof.start=' + tasks.roof.start + ' wall.end=' + tasks.wall.end);

  var s = PG.settle(ops, [], {});

  // §DEP-CLEAN — wall starts at 10 = found.end → no violation, green.
  var wallViol = s.conflicts.depViolations.filter(function (d) { return d.task === 'wall'; });
  verdict(wallViol.length === 0 && s.elem.wall === 'verified-green',
    '§DEP-CLEAN  successor at/after predecessor end = green', 'wall=' + s.elem.wall + ' viol=' + wallViol.length);

  // §DEP-VIOLATION — roof starts 12 < wall.end 15 → violation by 3, red.
  var roofViol = s.conflicts.depViolations.filter(function (d) { return d.task === 'roof' && d.pred === 'wall'; })[0];
  verdict(roofViol && roofViol.by === 3 && s.elem.roof === 'verified-red',
    '§DEP-VIOLATION  successor before predecessor end → red + `by`', 'roofViol=' + JSON.stringify(roofViol) + ' roof=' + s.elem.roof);

  // §RESOURCE-CLASH — painter double-booked (paint [8,12) vs elec [9,12)); both red.
  var painterClash = s.conflicts.resourceClashes.filter(function (c) { return c.resource === 'painter'; })[0];
  verdict(painterClash && s.elem.paint === 'verified-red' && s.elem.elec === 'verified-red',
    '§RESOURCE-CLASH  overlapping same-resource windows → both red', 'clash=' + JSON.stringify(painterClash));

  // §CYCLE — a separate A→B→A schedule.
  var cyc = [
    op('c1', T + 1, 'pm', 'SCHEDULE', 'A', { start: 0, duration: 5, deps: ['B'] }),
    op('c2', T + 2, 'pm', 'SCHEDULE', 'B', { start: 0, duration: 5, deps: ['A'] })
  ];
  var sc = PG.settle(cyc, [], {});
  verdict(sc.conflicts.cycles.length >= 1 && sc.elem.A === 'verified-red' && sc.elem.B === 'verified-red',
    '§CYCLE  dependency cycle detected → both red', 'cycles=' + JSON.stringify(sc.conflicts.cycles));

  // §TIER1-HINT — a near-miss: two crane tasks with a 1-unit gap. Tier-2 (margin 0) = clean; hint(margin 2) flags it.
  var near = [
    op('n1', T + 1, 'pm', 'SCHEDULE', 'x', { start: 0, duration: 5, resource: 'crane' }),
    op('n2', T + 2, 'pm', 'SCHEDULE', 'y', { start: 6, duration: 5, resource: 'crane' })   // gap of 1 (x ends 5, y starts 6)
  ];
  var tight = PG.settle(near, [], {}).conflicts.resourceClashes.length;
  var coarse = PG.hint(near, [], 2).conflicts.resourceClashes.length;
  verdict(tight === 0 && coarse === 1, '§TIER1-HINT  coarse hint flags a near-miss Tier-2 does not', 'settle=' + tight + ' hint=' + coarse);

  // §LADDER-STALE — a walker branch whose fork tip != current trunk tip → every task `stale`.
  var branch = E.makeBranch('b1', 'walker1', { value: 'crane' }, 'walker', 5);
  var lad = PG.ladder(s, branch, 9);     // trunk advanced 5 → 9
  var allStale = Object.keys(lad.elem).every(function (k) { return lad.elem[k] === 'stale'; });
  verdict(lad.fresh === 'stale' && allStale, '§LADDER-STALE  branch behind trunk → all tasks stale', 'fresh=' + lad.fresh + ' allStale=' + allStale);

  // §MATRIX — per-resource clash counts (crane: roof×wall = 1; painter: paint×elec = 1).
  var m = PG.matrix(s.conflicts.resourceClashes);
  verdict(m.crane === 1 && m.painter === 1, '§MATRIX  per-resource clash counts', JSON.stringify(m));

  // §ORDER-INV — shuffle arrival → identical settle.
  var rev = PG.settle(ops.slice().reverse(), [], {});
  verdict(jeq(rev, s), '§ORDER-INV  shuffle arrival → identical settle', 'equal=' + jeq(rev, s));

  var n = 9;
  console.log('\n' + (fails === 0 ? '✅ W-PERT-GATE ' + n + '/' + n + ' PASS' : '❌ ' + fails + ' FAIL') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})();
