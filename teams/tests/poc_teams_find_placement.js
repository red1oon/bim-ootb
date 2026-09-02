#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-FIND-PLACEMENT (RESUME_TEAMS_UI_CONSISTENCY §R6 + §1a). Node-only witness over the
//   PURE placement model in overlay/find_placement.js. ONE Role×Spine matrix rendered two ways — the SAME
//   dot_layer engine, only `anchorOf` differs. Every dot/role/count folds the signed op-log (NON-INVENT);
//   fixed edge-minted ids+ts (no Date.now/Math.random). Touches NO modeller code.
//     §OFF-NOOP       — on:false → empty model (HARD RULE: off = pixel-identical UI).
//     §DESIGN-SPINE   — design pivot: dots land on Project→Element by element id; parent = project.
//     §OPERATE-SPINE  — operate pivot: SAME engine, anchorOf = room guid → dots on Storey→Rooms.
//     §SAME-ENGINE    — design & operate over the SAME ops produce the SAME cluster shape (only anchor key differs).
//     §STOREY-ROLLUP  — parent (storey/project) rolls up child dots → `+N` density cluster (HR's grammar).
//     §BY-ROLE        — leaf + parent partition by ROLE = distinct persons per role, traced to ops.
//     §UNPLACED       — an op whose anchor has NO spine node is reported as `unplaced`, never invented onto a row.
//     §ORDER-INV      — shuffle op arrival → identical model (folds in total order, holder-irrelevant).
//   Run: node teams/tests/poc_teams_find_placement.js 2>&1 | tee teams/logs/find_placement.log — then READ the log.
'use strict';
var path = require('path');
var FP = require(path.join(__dirname, '..', 'overlay', 'find_placement.js'));

var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
function jeq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

var T = 1719700000000;
function op(id, ts, author, role, verb, target, params, cls) {
  return { id: id, ts: ts, author: author, role: role, cls: cls || 'bim', verb: verb, target: target, params: params || {} };
}

(function () {
  console.log('\n═══ W-FIND-PLACEMENT — one Role×Spine matrix, two renderings (design / operate), same engine ═══\n');

  // ── scenario (NON-INVENT): a Hospital project, 2 storeys. Same crew acts on elements; the SAME elements
  //    map to rooms in the operate spine. Roles = construction disciplines (design) → FM roles reuse the same partition.
  //    L1: ROOM-A {ARC: ada · STR: stan} ; ROOM-B {MEP: mary}.  L2: ROOM-C {ARC: ada, ARC: ana, STR: stan, MEP: mary, MEP: moe} → fan-out.
  var ops = [
    op('o1', T + 10, 'ada',  'ARC', 'PLACE', 'EL-A'),
    op('o2', T + 20, 'stan', 'STR', 'PLACE', 'EL-A'),
    op('o3', T + 30, 'mary', 'MEP', 'ROUTE', 'EL-B'),
    op('o4', T + 40, 'ada',  'ARC', 'PLACE', 'EL-C'),
    op('o5', T + 50, 'ana',  'ARC', 'EDIT',  'EL-C'),
    op('o6', T + 60, 'stan', 'STR', 'PLACE', 'EL-C'),
    op('o7', T + 70, 'mary', 'MEP', 'ROUTE', 'EL-C'),
    op('o8', T + 80, 'moe',  'MEP', 'EDIT',  'EL-C'),
    op('o9', T + 90, 'ghost','ARC', 'EDIT',  'EL-ORPHAN')   // anchor has NO spine node → must be `unplaced`
  ];

  // DESIGN spine: Project→Element (anchor = element id). Leaf id == op.target.
  var designSpine = { mode: 'design', leaves: [
    { id: 'EL-A', parent: 'L1', label: 'Wall A' }, { id: 'EL-B', parent: 'L1', label: 'Duct B' },
    { id: 'EL-C', parent: 'L2', label: 'Slab C' }
  ] };
  // OPERATE spine: Storey→Rooms (anchor = room guid). The SAME elements are hosted by rooms; anchorOf maps EL-→GUID-.
  var el2guid = { 'EL-A': 'GUID-A', 'EL-B': 'GUID-B', 'EL-C': 'GUID-C', 'EL-ORPHAN': 'GUID-ORPHAN' };
  var operateSpine = { mode: 'operate', leaves: [
    { id: 'GUID-A', parent: 'L1', label: 'Room A' }, { id: 'GUID-B', parent: 'L1', label: 'Room B' },
    { id: 'GUID-C', parent: 'L2', label: 'Room C' }
  ] };

  // §OFF-NOOP
  var off = FP.placementModel(ops, designSpine, { on: false });
  verdict(off.on === false && off.leaves.length === 0 && off.parents.length === 0,
    '§OFF-NOOP  on:false → empty model (pixel-identical)', 'leaves=' + off.leaves.length + ' parents=' + off.parents.length);

  // §DESIGN-SPINE — anchor by element id; EL-A has 2 people (ada,stan), EL-C has 5 (ada,ana,stan,mary,moe).
  var dz = FP.placementModel(ops, designSpine, { on: true, mode: 'design', anchorOf: function (o) { return o.target; }, maxVisible: 2 });
  var elA = dz.leaves.filter(function (l) { return l.id === 'EL-A'; })[0];
  var elC = dz.leaves.filter(function (l) { return l.id === 'EL-C'; })[0];
  verdict(dz.mode === 'design' && elA && elA.count === 2 && elA.parent === 'L1' && elC && elC.count === 5,
    '§DESIGN-SPINE  Project→Element by element id', 'EL-A=' + (elA && elA.count) + ' EL-C=' + (elC && elC.count));

  // §OPERATE-SPINE — SAME engine, anchorOf = room guid. EL-→GUID- mapping; same counts on the room rows.
  var oz = FP.placementModel(ops, operateSpine, { on: true, mode: 'operate', anchorOf: function (o) { return el2guid[o.target]; }, maxVisible: 2 });
  var roomA = oz.leaves.filter(function (l) { return l.id === 'GUID-A'; })[0];
  var roomC = oz.leaves.filter(function (l) { return l.id === 'GUID-C'; })[0];
  verdict(oz.mode === 'operate' && roomA && roomA.count === 2 && roomC && roomC.count === 5,
    '§OPERATE-SPINE  Storey→Rooms by room guid (same engine)', 'GUID-A=' + (roomA && roomA.count) + ' GUID-C=' + (roomC && roomC.count));

  // §SAME-ENGINE — design leaf-counts (sorted) === operate leaf-counts: only the anchor KEY differs.
  var dCounts = dz.leaves.map(function (l) { return l.count; }).sort();
  var oCounts = oz.leaves.map(function (l) { return l.count; }).sort();
  verdict(jeq(dCounts, oCounts) && jeq(dCounts, [2, 1, 5].sort()),
    '§SAME-ENGINE  design & operate = identical cluster shape', 'design=' + JSON.stringify(dCounts) + ' operate=' + JSON.stringify(oCounts));

  // §STOREY-ROLLUP — L2 (only EL-C/Room-C) rolls up 5 dots → +3 density badge (maxVisible 2). L1 = 3 dots (EL-A 2 + EL-B 1).
  var L2 = dz.parents.filter(function (p) { return p.id === 'L2'; })[0];
  var L1 = dz.parents.filter(function (p) { return p.id === 'L1'; })[0];
  verdict(L2 && L2.count === 5 && L2.badge === '+3' && L1 && L1.count === 3,
    '§STOREY-ROLLUP  parent +N density cluster (HR grammar)', 'L2 count=' + (L2 && L2.count) + ' badge=' + (L2 && L2.badge) + ' L1 count=' + (L1 && L1.count));

  // §BY-ROLE — EL-C partition: ARC=[ada,ana], STR=[stan], MEP=[mary,moe]. Parent L2 same (only Room C under it).
  var brC = elC.byRole;
  verdict(jeq(brC.ARC, ['ada', 'ana']) && jeq(brC.STR, ['stan']) && jeq(brC.MEP, ['mary', 'moe']) && jeq(L2.byRole.ARC, ['ada', 'ana']),
    '§BY-ROLE  distinct persons per role (leaf + parent), traced to ops', 'EL-C=' + JSON.stringify(brC));

  // §UNPLACED — EL-ORPHAN has no spine node → 1 unplaced, and it appears on NO leaf/parent.
  var ghostOnLeaf = dz.leaves.some(function (l) { return l.byRole && Object.keys(l.byRole).some(function (r) { return l.byRole[r].indexOf('ghost') >= 0; }); });
  verdict(dz.unplaced === 1 && !ghostOnLeaf,
    '§UNPLACED  off-spine op reported, never invented onto a row', 'unplaced=' + dz.unplaced + ' ghostPlaced=' + ghostOnLeaf);

  // §ORDER-INV — reverse arrival order → identical model.
  var rev = FP.placementModel(ops.slice().reverse(), designSpine, { on: true, mode: 'design', anchorOf: function (o) { return o.target; }, maxVisible: 2 });
  verdict(jeq(rev, dz), '§ORDER-INV  shuffle arrival → identical model', 'equal=' + jeq(rev, dz));

  var n = 8;
  console.log('\n' + (fails === 0 ? '✅ W-FIND-PLACEMENT ' + n + '/' + n + ' PASS' : '❌ ' + fails + ' FAIL') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})();
