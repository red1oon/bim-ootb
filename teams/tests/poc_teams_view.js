#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-VIEW (prompts/RESUME_DISTRIBUTED_BRANCHES.md §8).
//   Node-only witness over the PURE view-model builders in overlay/teams_view.js. Reuses the
//   two-branch SampleHouse-like scenario from poc_teams_cross_branch.js (Col-204 × Duct-7 clash +
//   over-budget STR + a stale branch) and proves the view-models reflect ONLY what the engine/gate
//   emit — no invented color, count, or verdict. Runs through the connector STUB seam, touches NO
//   modeller code. Fixed edge-minted ids + ts (no Date.now / Math.random).
//
//   ISSUES IT PROVES (named):
//     W-VIEW-TREE      — treeModel rows carry the blame author + the ladder color per element;
//                        a clashing element is red; a stale branch's elements are stale.
//     W-VIEW-CHAT      — chatModel === chatlog.render; a clash op's badge = 'red', a trunk op = 'trunk'.
//     W-VIEW-DASH      — dashboardModel.matrix counts the cross-disc clash cell; an over-budget branch
//                        has overRatio>tol; freshness marks the stale branch.
//     W-VIEW-NONINVENT — every model field traces to an engine/gate value: no color the ladder didn't
//                        emit; marker count === element count.
// Run: node teams/tests/poc_teams_view.js 2>&1 | tee teams/logs/view.log — then READ the log.
'use strict';
var path = require('path');
var RP = require(path.join(__dirname, '..', 'index.js'));
var V = require(path.join(__dirname, '..', 'overlay', 'teams_view.js'));
var E = RP.Engine, G = RP.Gate, L = RP.Chatlog;

var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }

var T = 1719700000000;
function op(id, ts, branch, author, cls, verb, target, params) {
  return { id: id, ts: ts, branch: branch, author: author, cls: cls, verb: verb, target: target, params: params || {} };
}

(function () {
  console.log('\n═══ W-VIEW — view-models reflect ONLY engine/gate output (non-invent) ═══\n');

  // ---- trunk (ARC, the crafter) -------------------------------------------------
  var trunk = [];
  var trunkBr = E.makeBranch('trunk', 'ARC', { type: 'trunk' }, 'trunk');
  trunk = E.append(trunk, trunkBr, op('t1', T + 10, 'trunk', 'ARC', E.GEOM, 'INSERT', 'Wall-W12',
    { box: { x: 4.4, y: 0, z: 0, w: 0.25, d: 8, h: 2.3 }, disc: 'ARC', cost: 0 })).log;
  trunk = E.append(trunk, trunkBr, op('t2', T + 20, 'trunk', 'ARC', E.GEOM, 'INSERT', 'Wall-N4',
    { box: { x: 0, y: 0, z: 0, w: 10, d: 0.25, h: 3 }, disc: 'ARC', cost: 0 })).log;
  var forkTip = trunk[trunk.length - 1].op_hash;

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
  str = E.append(str, strBr, op('s3', T + 60, 'STR', 'STR', E.GEOM, 'MOVE', 'Col-204', { dx: 0, dy: 3.2, dz: 0 })).log;

  var trunkRef = trunk.concat(mep);             // what STR references read-only
  var merged = str.concat(trunkRef);            // the full set the gate folds

  // settle with a Project-Order baseline → Col-204 RED (clash), Col-201 ORANGE (over budget)
  var s = G.settle(str, trunkRef, { baseline: { STR: 1500 }, tol: 0.1 });
  var ladderFresh = G.ladder(s, strBr, forkTip);                       // same fork tip → fresh

  // advance the trunk → the whole STR verdict goes STALE
  var trunk2 = E.append(trunk, trunkBr, op('t3', T + 70, 'trunk', 'ARC', E.GEOM, 'MOVE', 'Wall-N4', { dx: 0.05 })).log;
  var trunkTipNow = trunk2[trunk2.length - 1].op_hash;
  var ladderStale = G.ladder(s, strBr, trunkTipNow);

  // ── W-VIEW-TREE ──────────────────────────────────────────────────────────────
  var tree = V.treeModel(merged, ladderFresh);
  var byGuid = {}; tree.forEach(function (r) { byGuid[r.guid] = r; });

  verdict(byGuid['Col-204'] && byGuid['Col-204'].color === 'verified-red'
    && byGuid['Col-204'].owner === 'STR',
    'W-VIEW-TREE  Col-204 row: ladder=verified-red, blame owner=STR',
    byGuid['Col-204'] && (byGuid['Col-204'].color + '/' + byGuid['Col-204'].owner));
  verdict(byGuid['Col-201'] && byGuid['Col-201'].color === 'verified-orange'
    && byGuid['Col-201'].disc === 'STR',
    'W-VIEW-TREE  Col-201 row: over-budget orange, disc=STR', byGuid['Col-201'] && byGuid['Col-201'].color);
  verdict(byGuid['Duct-7'] && byGuid['Duct-7'].owner === 'MEP' && byGuid['Wall-W12'] && byGuid['Wall-W12'].owner === 'ARC',
    'W-VIEW-TREE  blame author per element (Duct-7=MEP, Wall-W12=ARC)');
  var guids = tree.map(function (r) { return r.guid; });
  verdict(JSON.stringify(guids) === JSON.stringify(guids.slice().sort()),
    'W-VIEW-TREE  rows ordered deterministically by guid', guids.join(','));
  var staleTree = V.treeModel(merged, ladderStale);
  verdict(staleTree.length > 0 && staleTree.every(function (r) { return r.stale && r.color === 'stale'; }),
    'W-VIEW-TREE  stale branch → every row stale=true, color=stale', staleTree.length + ' rows');

  // ── W-VIEW-CHAT ──────────────────────────────────────────────────────────────
  var chat = V.chatModel(merged, s);
  verdict(JSON.stringify(chat) === JSON.stringify(L.render(merged, s)),
    'W-VIEW-CHAT  chatModel === chatlog.render (thin pass-through)', chat.length + ' lines');
  var clashLine = chat.filter(function (ln) { return ln.verdict.kind === 'red'; });
  verdict(clashLine.length > 0 && clashLine.every(function (ln) { return ln.cls === E.GEOM; }),
    'W-VIEW-CHAT  clash op badge = red', clashLine.length + ' red line(s)');
  var trunkLine = chat.filter(function (ln) { return ln.verdict.kind === 'trunk'; });
  verdict(trunkLine.length > 0,
    'W-VIEW-CHAT  trunk op badge = trunk', trunkLine.length + ' trunk line(s)');

  // ── W-VIEW-DASH ──────────────────────────────────────────────────────────────
  var branches = [trunkBr, mepBr, strBr];
  var dashStale = V.dashboardModel(s, branches, trunkTipNow);
  verdict(dashStale.matrix['MEP×STR'] === 1,
    'W-VIEW-DASH  matrix counts the cross-disc clash cell MEP×STR=1', JSON.stringify(dashStale.matrix));
  var strBudget = dashStale.budgets.filter(function (b) { return b.branch === 'STR'; })[0];
  verdict(strBudget && strBudget.spent === 2200 && strBudget.overRatio > 0.1,
    'W-VIEW-DASH  STR branch over budget: spent=2200, overRatio>tol',
    strBudget && (strBudget.spent + ' / +' + Math.round(strBudget.overRatio * 100) + '%'));
  var strFresh = dashStale.freshness.filter(function (f) { return f.branch === 'STR'; })[0];
  verdict(strFresh && strFresh.state === 'stale',
    'W-VIEW-DASH  freshness marks STR stale after trunk advanced', strFresh && strFresh.state);
  var dashFresh = V.dashboardModel(s, branches, forkTip);
  var strFresh2 = dashFresh.freshness.filter(function (f) { return f.branch === 'STR'; })[0];
  verdict(strFresh2 && strFresh2.state === 'fresh',
    'W-VIEW-DASH  same fork tip → STR fresh', strFresh2 && strFresh2.state);

  // ── W-VIEW-NONINVENT ─────────────────────────────────────────────────────────
  var markers = V.markerModel(ladderFresh);
  var emitted = {}; Object.keys(ladderFresh.elem).forEach(function (g) { emitted[ladderFresh.elem[g]] = true; });
  var allTraced = markers.every(function (mk) { return emitted[mk.color]; })
    && tree.every(function (r) { return emitted[r.color]; });
  verdict(allTraced, 'W-VIEW-NONINVENT  no color appears that the ladder did not emit',
    'ladder colors {' + Object.keys(emitted).join(',') + '}');
  var elemCount = Object.keys(E.fold(merged)).length;
  verdict(markers.length === elemCount && markers.length === Object.keys(ladderFresh.elem).length,
    'W-VIEW-NONINVENT  marker count === element count', markers.length + ' === ' + elemCount);
  var markGuids = markers.map(function (m) { return m.guid; });
  verdict(JSON.stringify(markGuids) === JSON.stringify(markGuids.slice().sort()),
    'W-VIEW-NONINVENT  markers ordered deterministically by guid');

  var TOTAL = 14;
  var pass = TOTAL - fails;
  console.log('\n' + (fails === 0 ? '✅ W-VIEW ' + pass + '/' + TOTAL + ' PASS' : '❌ W-VIEW ' + pass + '/' + TOTAL + ' (' + fails + ' FAIL)') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})();
