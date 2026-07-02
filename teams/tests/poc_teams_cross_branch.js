#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-GATE-CROSS-BRANCH (prompts/RESUME_DISTRIBUTED_BRANCHES.md §11/§13).
//   The smallest slice that proves the whole shape: two branch logs → ONE cross-discipline clash
//   cell that goes provisional (Tier-1 coarse hint) → verified-red (Tier-2 precise fold) → stale
//   (trunk advances). Plus the load-bearing falsifiers. Runs node-only over teams/ through
//   the connector STUB seam — touches NO modeller code. Read the log after every run.
//
//   ISSUES IT PROVES (named):
//     §HINT      — Tier-1 hint (inflated boxes) flags Col-204 × Duct-7 as a *possible* clash.
//     §SETTLE    — Tier-2 precise fold confirms Col-204 = verified-RED; a clean STR col = GREEN.
//     §BUDGET    — with a Project-Order baseline, an over-budget STR element = verified-ORANGE.
//     §STALE     — advance the trunk past the branch fork point → the verdict goes STALE (re-fold).
//     §ORDER-INV — shuffle the merged arrival order → identical settle (holder-irrelevant, §7).
//     §FALSIFIER — delete the STR MOVE op → clash VANISHES (green): the clash is the op's, not a hardcode.
//     §OWNER-GATE— a geom op by MEP into the STR branch is REFUSED; an annotation by MEP is ALLOWED.
//   NON-INVENT: fixed edge-minted ids + ts; boxes are explicit; the clash is computed (AABB), never asserted.
// Run: node teams/tests/poc_teams_cross_branch.js 2>&1 | tee teams/teams_cross_branch.log — then READ the log.
'use strict';
var path = require('path');
var RP = require(path.join(__dirname, '..', 'index.js'));
var E = RP.Engine, G = RP.Gate;

var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }

var T = 1719700000000;
function op(id, ts, branch, author, cls, verb, target, params) {
  return { id: id, ts: ts, branch: branch, author: author, cls: cls, verb: verb, target: target, params: params || {} };
}

(function () {
  console.log('\n═══ W-GATE-CROSS-BRANCH — two branches → one clash cell: provisional→verified→stale ═══\n');

  // ---- trunk (ARC, the crafter) -------------------------------------------------
  var trunk = [];
  var trunkBr = E.makeBranch('trunk', 'ARC', { type: 'trunk' }, 'trunk');
  trunk = E.append(trunk, trunkBr, op('t1', T + 10, 'trunk', 'ARC', E.GEOM, 'INSERT', 'Wall-W12',
    { box: { x: 4.4, y: 0, z: 0, w: 0.25, d: 8, h: 2.3 }, disc: 'ARC', cost: 0 })).log;  // h<duct z so no wall×duct clash
  trunk = E.append(trunk, trunkBr, op('t2', T + 20, 'trunk', 'ARC', E.GEOM, 'INSERT', 'Wall-N4',
    { box: { x: 0, y: 0, z: 0, w: 10, d: 0.25, h: 3 }, disc: 'ARC', cost: 0 })).log;
  var forkTip = trunk[trunk.length - 1].op_hash;   // STR forks off this trunk tip

  // ---- MEP (referenced, read-only to STR) ---------------------------------------
  var mep = [];
  var mepBr = E.makeBranch('MEP', 'MEP', { type: 'discipline', value: 'MEP' }, 'walker', forkTip);
  mep = E.append(mep, mepBr, op('m1', T + 30, 'MEP', 'MEP', E.GEOM, 'INSERT', 'Duct-7',
    { box: { x: 1, y: 5, z: 2.4, w: 8, d: 0.5, h: 0.5 }, disc: 'MEP', cost: 800 })).log;

  // ---- STR branch (you) ---------------------------------------------------------
  var strBr = E.makeBranch('STR', 'STR', { type: 'discipline', value: 'STR' }, 'walker', forkTip);
  var str = [];
  str = E.append(str, strBr, op('s1', T + 40, 'STR', 'STR', E.GEOM, 'INSERT', 'Col-201',
    { box: { x: 3, y: 2, z: 0, w: 0.4, d: 0.4, h: 3 }, disc: 'STR', cost: 1000 })).log;
  str = E.append(str, strBr, op('s2', T + 50, 'STR', 'STR', E.GEOM, 'INSERT', 'Col-204',
    { box: { x: 7, y: 2, z: 0, w: 0.45, d: 0.45, h: 3 }, disc: 'STR', cost: 1200 })).log;
  // the move that drives Col-204 under Duct-7 (the clash-causing edit)
  var moveOp = op('s3', T + 60, 'STR', 'STR', E.GEOM, 'MOVE', 'Col-204', { dx: 0, dy: 3.2, dz: 0 });
  str = E.append(str, strBr, moveOp).log;

  var trunkRef = trunk.concat(mep);   // what STR references read-only

  // §HINT — Tier-1 coarse
  var h = G.hint(str, trunkRef, 0.4);
  var hitClash = h.clashes.some(function (c) { return c.disc.join('') === 'MEPSTR'; });
  verdict(h.state === 'provisional' && hitClash, '§HINT  Tier-1 provisional flags Col-204 × Duct-7',
    h.clashes.length + ' coarse clash(es)');

  // §SETTLE — Tier-2 precise
  var s = G.settle(str, trunkRef, {});
  verdict(s.elem['Col-204'] === 'verified-red', '§SETTLE  Col-204 = verified-RED', s.elem['Col-204']);
  verdict(s.elem['Col-201'] === 'verified-green', '§SETTLE  clean Col-201 = verified-GREEN', s.elem['Col-201']);

  // §BUDGET — over Project-Order baseline → ORANGE on the non-clash STR element
  var sb = G.settle(str, trunkRef, { baseline: { STR: 1500 }, tol: 0.1 });
  verdict(!!sb.over['STR'], '§BUDGET  STR over baseline', '+' + Math.round((sb.over['STR'] || 0) * 100) + '%');
  verdict(sb.elem['Col-201'] === 'verified-orange', '§BUDGET  Col-201 = verified-ORANGE', sb.elem['Col-201']);

  // §STALE — trunk advances past the fork point → verdict invalid until re-fold
  var trunk2 = E.append(trunk, trunkBr, op('t3', T + 70, 'trunk', 'ARC', E.GEOM, 'MOVE', 'Wall-N4', { dx: 0.05 })).log;
  var trunkTipNow = trunk2[trunk2.length - 1].op_hash;
  var ladderStale = G.ladder(s, strBr, trunkTipNow);
  verdict(ladderStale.fresh === 'stale' && ladderStale.elem['Col-204'] === 'stale',
    '§STALE  trunk advanced → Col-204 = STALE', ladderStale.note);
  var ladderFresh = G.ladder(s, strBr, forkTip);
  verdict(ladderFresh.fresh === 'fresh' && ladderFresh.elem['Col-204'] === 'verified-red',
    '§STALE  same fork tip → stays verified-RED', ladderFresh.elem['Col-204']);

  // §ORDER-INV — shuffle merged order → identical settle (holder-irrelevant)
  var shuffled = G.settle(str.slice().reverse(), trunkRef.slice().reverse(), {});
  verdict(JSON.stringify(shuffled.elem) === JSON.stringify(s.elem),
    '§ORDER-INV  reversed arrival → identical verdict', 'holder-irrelevant');

  // §FALSIFIER — drop the MOVE op → clash gone (load-bearing on the op, not a hardcode)
  var strNoMove = str.filter(function (o) { return o.id !== 's3'; });
  var sNo = G.settle(strNoMove, trunkRef, {});
  verdict(sNo.elem['Col-204'] === 'verified-green' && sNo.clashes.length === 0,
    '§FALSIFIER  remove MOVE → Col-204 GREEN, 0 clashes', 'clash was the op’s');

  // §OWNER-GATE — geom by MEP into STR branch refused; annotation by MEP allowed
  var badGeom = E.gateAppend(strBr, op('x1', T + 80, 'STR', 'MEP', E.GEOM, 'MOVE', 'Col-204', { dx: 1 }));
  var okAnnot = E.gateAppend(strBr, op('a1', T + 81, 'STR', 'MEP', E.ANNOT, 'POSTIT', 'Col-204', { message: 'move it' }));
  verdict(!badGeom.ok && okAnnot.ok, '§OWNER-GATE  MEP geom REFUSED, MEP annotation ALLOWED', badGeom.reason);

  console.log('\n' + (fails === 0 ? '✅ W-GATE-CROSS-BRANCH 11/11 PASS' : '❌ ' + fails + ' FAIL') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})();
