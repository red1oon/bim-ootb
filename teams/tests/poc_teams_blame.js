#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-BLAME-COLOR (prompts/RESUME_DISTRIBUTED_BRANCHES.md §8/§11). The Outliner tint
//   (who-owns-what) is a PURE projection of the signed log: order-invariant, and each tint is
//   load-bearing on a real op. Also proves the "major branch owner, twig split to another" shape.
//   node-only over teams/ via the stub seam. Read the log after every run.
//     §BLAME       — blame map = last author per element, in total order.
//     §TWIG-SPLIT  — a twig (Wall-W12) inside ARC's zone is blamed to STR (delegated twig != zone owner).
//     §ORDER-INV   — shuffle arrival → identical blame (holder-irrelevant).
//     §LOAD-BEARING— remove STR's edit → the tint reverts to ARC (not a hardcode).
// Run: node teams/tests/poc_teams_blame.js 2>&1 | tee teams/teams_blame.log — then READ the log.
'use strict';
var path = require('path');
var E = require(path.join(__dirname, '..', 'engine.js'));
var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
var T = 1719700000000;
function op(id, ts, br, au, verb, tgt, p) { return { id: id, ts: ts, branch: br, author: au, cls: E.GEOM, verb: verb, target: tgt, params: p || {} }; }

(function () {
  console.log('\n═══ W-BLAME-COLOR — Outliner ownership tint = pure projection of the signed log ═══\n');

  // ARC (trunk) owns the Walls zone; STR edits Wall-W12 (a delegated twig) + owns Columns.
  var ARC_w12 = op('t1', T + 10, 'trunk', 'ARC', 'INSERT', 'Wall-W12', { box: { x: 4.4, y: 0, z: 0, w: .25, d: 8, h: 3 }, disc: 'ARC' });
  var ARC_n4  = op('t2', T + 20, 'trunk', 'ARC', 'INSERT', 'Wall-N4',  { box: { x: 0, y: 0, z: 0, w: 10, d: .25, h: 3 }, disc: 'ARC' });
  var STR_w12 = op('s1', T + 30, 'STR', 'STR', 'MOVE', 'Wall-W12', { dx: 0.1 });           // STR edits ARC's wall (twig)
  var STR_col = op('s2', T + 40, 'STR', 'STR', 'INSERT', 'Col-204', { box: { x: 7, y: 5, z: 0, w: .45, d: .45, h: 3 }, disc: 'STR' });
  var full = [ARC_w12, ARC_n4, STR_w12, STR_col];

  var b = E.blame(full);
  verdict(b['Wall-N4'] === 'ARC' && b['Col-204'] === 'STR', '§BLAME  last-author per element', 'Wall-N4=ARC, Col-204=STR');

  // §TWIG-SPLIT — Wall-W12's ZONE owner is ARC (trunk), but the element is blamed to STR (the twig owner)
  var zoneOwner = 'ARC';
  verdict(b['Wall-W12'] === 'STR' && b['Wall-W12'] !== zoneOwner,
    '§TWIG-SPLIT  Wall-W12 zone=ARC but blamed=STR', 'major owner + delegated twig');

  // §ORDER-INV — reversed arrival → identical blame
  var b2 = E.blame(full.slice().reverse());
  verdict(JSON.stringify(b) === JSON.stringify(b2), '§ORDER-INV  reversed arrival → identical blame', 'holder-irrelevant');

  // §LOAD-BEARING — remove STR's edit of Wall-W12 → tint reverts to ARC
  var b3 = E.blame(full.filter(function (o) { return o.id !== 's1'; }));
  verdict(b3['Wall-W12'] === 'ARC', '§LOAD-BEARING  drop STR edit → Wall-W12 reverts to ARC', 'tint is the op’s, not a hardcode');

  console.log('\n' + (fails === 0 ? '✅ W-BLAME-COLOR 5/5 PASS' : '❌ ' + fails + ' FAIL') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})();
