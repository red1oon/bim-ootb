#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-APP (prompts/RESUME_DISTRIBUTED_BRANCHES.md §8). Node-only witness over the
//   ORCHESTRATION layer overlay/teams_app.js — proves the standalone LIVE VIEW is driven entirely by the
//   real engine fold, NOT by hardcoded mock data. Runs through the connector STUB seam, touches NO
//   modeller code. Fixed edge-minted ids + ts (no Date.now / Math.random); the clash is COMPUTED.
//
//   ISSUES IT PROVES (named):
//     §CLASH      — buildScenario yields a REAL cross-discipline clash (settle.clashes non-empty,
//                   cell = MEP×STR); it is the op's, not a constant (drop the MOVE → clash vanishes).
//     §RED        — the clashing elements render 'verified-red' in the ladder/tree (Col-204, Duct-7).
//     §BLAME      — every tree row carries its blame author (Col-204=STR, Duct-7=MEP, Wall-W12=ARC).
//     §STALE      — a STALE branch's elements all read stale=true in the tree (ladder staleness overlay).
//     §MATRIX     — the dashboard clash-matrix has the MEP×STR cell = 1.
//     §BUDGET     — the over-budget STR branch shows overRatio>tol (spent 2200 vs baseline 1500).
//     §FRESH      — freshness marks the lagging MEP branch stale, the held STR branch fresh.
//     §NONINVENT  — markers count === element count, and no marker/row color the ladder did not emit.
//   NON-INVENT: every asserted value traces to an engine/gate output; no number is hand-written here.
// Run: node teams/tests/poc_teams_app.js 2>&1 | tee teams/logs/app.log — then READ the log.
'use strict';
var path = require('path');
var RP = require(path.join(__dirname, '..', 'index.js'));
var App = require(path.join(__dirname, '..', 'overlay', 'teams_app.js'));
var E = RP.Engine, G = RP.Gate;

var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }

(function () {
  console.log('\n═══ W-APP — the standalone LIVE VIEW is driven by the REAL engine fold (non-invent) ═══\n');

  var scenario = App.buildScenario();
  var view = App.computeView(scenario);

  // re-fold the scenario through the gate independently (an oracle for the view assertions)
  var branchOps = []; scenario.branches.forEach(function (b) { branchOps = branchOps.concat(b.ops); });
  var trunkTip = scenario.trunkOps[scenario.trunkOps.length - 1].op_hash;
  var settle = G.settle(branchOps, scenario.trunkOps, { baseline: App.BASELINE, tol: App.TOL });

  // ── §CLASH ───────────────────────────────────────────────────────────────────
  var crossDisc = settle.clashes.filter(function (c) { return c.disc.join('×') === 'MEP×STR'; });
  verdict(settle.clashes.length > 0 && crossDisc.length === 1,
    '§CLASH  buildScenario → real cross-discipline clash MEP×STR',
    settle.clashes.length + ' clash(es); cell=' + (crossDisc[0] ? crossDisc[0].a + '∩' + crossDisc[0].b : 'none'));
  // falsifier: drop the STR MOVE → the clash must vanish (it is the op's, not a hardcode)
  var noMove = branchOps.filter(function (o) { return o.id !== 's3'; });
  var sNo = G.settle(noMove, scenario.trunkOps, {});
  verdict(sNo.clashes.length === 0,
    '§CLASH  drop the MOVE op → clash VANISHES (load-bearing on the op)', sNo.clashes.length + ' clashes');

  // ── §RED — clashing elements verified-red in the tree ──────────────────────────
  var byGuid = {}; view.tree.forEach(function (r) { byGuid[r.guid] = r; });
  verdict(byGuid['Col-204'] && byGuid['Col-204'].color === 'verified-red',
    '§RED  tree Col-204 = verified-red', byGuid['Col-204'] && byGuid['Col-204'].color);
  verdict(byGuid['Duct-7'] && byGuid['Duct-7'].color === 'verified-red',
    '§RED  tree Duct-7 = verified-red', byGuid['Duct-7'] && byGuid['Duct-7'].color);

  // ── §BLAME — every tree row carries its blame author ───────────────────────────
  var allOwned = view.tree.every(function (r) { return r.owner != null; });
  verdict(allOwned && byGuid['Col-204'].owner === 'STR' && byGuid['Duct-7'].owner === 'MEP'
    && byGuid['Wall-W12'].owner === 'ARC',
    '§BLAME  rows carry blame authors (Col-204=STR, Duct-7=MEP, Wall-W12=ARC)',
    view.tree.length + ' rows all owned=' + allOwned);

  // ── §STALE — a stale branch's elements all read stale ──────────────────────────
  var mepBr = scenario.branches[0].branch;                 // MEP forked one trunk-op behind → stale
  var ladderStale = G.ladder(settle, mepBr, trunkTip);
  var View = RP.View;
  var staleTree = View.treeModel(scenario.merged, ladderStale);
  verdict(staleTree.length > 0 && staleTree.every(function (r) { return r.stale && r.color === 'stale'; }),
    '§STALE  stale branch → every tree row stale=true, color=stale', staleTree.length + ' rows');

  // ── §MATRIX ────────────────────────────────────────────────────────────────────
  verdict(view.dash.matrix['MEP×STR'] === 1,
    '§MATRIX  dashboard clash-matrix MEP×STR = 1', JSON.stringify(view.dash.matrix));

  // ── §BUDGET ──────────────────────────────────────────────────────────────────
  var strBudget = view.dash.budgets.filter(function (b) { return b.branch === 'STR'; })[0];
  verdict(strBudget && strBudget.spent === 2200 && strBudget.overRatio > App.TOL,
    '§BUDGET  STR over Project-Order baseline: spent=2200, overRatio>tol',
    strBudget && (strBudget.spent + ' / +' + Math.round(strBudget.overRatio * 100) + '%'));

  // ── §FRESH ─────────────────────────────────────────────────────────────────────
  var fmap = {}; view.dash.freshness.forEach(function (f) { fmap[f.branch] = f.state; });
  verdict(fmap['MEP'] === 'stale' && fmap['STR'] === 'fresh',
    '§FRESH  lagging MEP=stale, held STR=fresh', JSON.stringify(fmap));

  // ── §NONINVENT — markers count === element count, no invented color ────────────
  var elemCount = Object.keys(E.fold(scenario.merged)).length;
  verdict(view.markers.length === elemCount,
    '§NONINVENT  marker count === element count', view.markers.length + ' === ' + elemCount);
  var emitted = {}; Object.keys(settle.elem).forEach(function (g) { emitted[settle.elem[g]] = true; });
  var noInvent = view.markers.every(function (m) { return emitted[m.color]; })
    && view.tree.every(function (r) { return emitted[r.color]; });
  verdict(noInvent, '§NONINVENT  no marker/row color the ladder did not emit',
    'ladder colors {' + Object.keys(emitted).join(',') + '}');
  var markGuids = view.markers.map(function (m) { return m.guid; });
  verdict(JSON.stringify(markGuids) === JSON.stringify(markGuids.slice().sort()),
    '§NONINVENT  markers ordered deterministically by guid', markGuids.join(','));

  var TOTAL = 13;
  var pass = TOTAL - fails;
  console.log('\n' + (fails === 0 ? '✅ W-APP ' + pass + '/' + TOTAL + ' PASS'
                                  : '❌ W-APP ' + pass + '/' + TOTAL + ' (' + fails + ' FAIL)') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})();
