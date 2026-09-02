// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — TEAMS APP (orchestration): builds the SampleHouse-like collaboration scenario
//   with the FROZEN engine, then folds it into the four §8 view-models the renderers consume.
//   PURE + deterministic + NON-INVENT: fixed edge-minted ids + ts (NO Date.now / NO Math.random);
//   every geometry box is explicit; the clash is COMPUTED by the gate (AABB), never asserted here.
//   This file is DATA-ONLY (no DOM) so it is node-testable — teams.html calls these, then hands the
//   returned models to TeamsView.render*. Consumes engine.js / gate.js / overlay/teams_view.js — never
//   forks them. prompts/RESUME_DISTRIBUTED_BRANCHES.md §2/§5/§7/§8. Read the log after every run.
'use strict';
var E    = (typeof require !== 'undefined') ? require('../engine')   : self.TeamsEngine;
var G    = (typeof require !== 'undefined') ? require('../gate')     : self.TeamsGate;
var View = (typeof require !== 'undefined') ? require('./teams_view'): self.TeamsView;

// fixed edge-minted clock + Project-Order baseline (INPUTS, never derived from wall time)
var T = 1719700000000;
var BASELINE = { STR: 1500 };   // 5D Project-Order budget for the structural discipline
var TOL = 0.1;                  // over-budget tolerance (10%)

function op(id, ts, branch, author, cls, verb, target, params) {
  return { id: id, ts: ts, branch: branch, author: author, cls: cls, verb: verb, target: target, params: params || {} };
}

// ─── buildScenario ──────────────────────────────────────────────────────────────
// An ARC trunk (the crafter) + two rebasing walker branches (MEP referenced read-only, STR = you).
// The STR MOVE drives Col-204 under the MEP Duct-7 → a REAL cross-discipline clash the gate finds.
// MEP forked one trunk-op behind STR, so at the current trunk tip MEP reads STALE, STR reads FRESH.
// Returns { trunkOps, branches:[{branch,ops}], merged } — merged = the union the gate folds.
function buildScenario() {
  // ---- trunk (ARC) ------------------------------------------------------------
  var trunkBr = E.makeBranch('trunk', 'ARC', { type: 'trunk' }, 'trunk');
  var trunk = [];
  trunk = E.append(trunk, trunkBr, op('t1', T + 10, 'trunk', 'ARC', E.GEOM, 'INSERT', 'Wall-W12',
    { box: { x: 4.4, y: 0, z: 0, w: 0.25, d: 8, h: 2.3 }, disc: 'ARC', cost: 0 })).log;  // h<duct z → no wall×duct clash
  var mepFork = trunk[trunk.length - 1].op_hash;            // MEP forks here (one op behind → stale)
  trunk = E.append(trunk, trunkBr, op('t2', T + 20, 'trunk', 'ARC', E.GEOM, 'INSERT', 'Wall-N4',
    { box: { x: 0, y: 0, z: 0, w: 10, d: 0.25, h: 3 }, disc: 'ARC', cost: 0 })).log;
  var strFork = trunk[trunk.length - 1].op_hash;            // STR forks here (current tip → fresh)

  // ---- MEP walker (referenced, read-only to STR) ------------------------------
  var mepBr = E.makeBranch('MEP', 'MEP', { type: 'discipline', value: 'MEP' }, 'walker', mepFork);
  var mep = [];
  mep = E.append(mep, mepBr, op('m1', T + 30, 'MEP', 'MEP', E.GEOM, 'INSERT', 'Duct-7',
    { box: { x: 1, y: 5, z: 2.4, w: 8, d: 0.5, h: 0.5 }, disc: 'MEP', cost: 800 })).log;

  // ---- STR walker (you) -------------------------------------------------------
  var strBr = E.makeBranch('STR', 'STR', { type: 'discipline', value: 'STR' }, 'walker', strFork);
  strBr.baseline = BASELINE.STR;                            // surfaces in the dashboard budget row
  var str = [];
  str = E.append(str, strBr, op('s1', T + 40, 'STR', 'STR', E.GEOM, 'INSERT', 'Col-201',
    { box: { x: 3, y: 2, z: 0, w: 0.4, d: 0.4, h: 3 }, disc: 'STR', cost: 1000 })).log;
  str = E.append(str, strBr, op('s2', T + 50, 'STR', 'STR', E.GEOM, 'INSERT', 'Col-204',
    { box: { x: 7, y: 2, z: 0, w: 0.45, d: 0.45, h: 3 }, disc: 'STR', cost: 1200 })).log;
  // the clash-causing edit: slide Col-204 +3.2m in y, under Duct-7
  str = E.append(str, strBr, op('s3', T + 60, 'STR', 'STR', E.GEOM, 'MOVE', 'Col-204', { dx: 0, dy: 3.2, dz: 0 })).log;
  // an annotation by MEP on the STR branch (cross-branch annot is allowed; geom is not) — the chat seam
  str = E.append(str, strBr, op('a1', T + 70, 'STR', 'MEP', E.ANNOT, 'POSTIT', 'Col-204',
    { message: 'Col-204 crosses my riser — please move it' })).log;

  var branches = [{ branch: mepBr, ops: mep }, { branch: strBr, ops: str }];
  var merged = trunk.concat(mep, str);                      // the full set the gate folds (order-free)
  return { trunkOps: trunk, branches: branches, merged: merged };
}

// ─── computeView ─────────────────────────────────────────────────────────────────
// Fold the scenario into the four §8 view-models. The settle is Tier-2 (precise, baseline'd); the
// ladder is taken against the ACTIVE walker = the one that is FRESH at the current trunk tip (the
// branch you are editing on). NON-INVENT: only engine/gate outputs flow into the models.
function computeView(scenario) {
  scenario = scenario || buildScenario();
  var trunkOps = scenario.trunkOps || [];
  var branchOps = [];
  scenario.branches.forEach(function (b) { branchOps = branchOps.concat(b.ops); });
  var trunkTip = trunkOps.length ? trunkOps[trunkOps.length - 1].op_hash : 'GENESIS';

  var settle = G.settle(branchOps, trunkOps, { baseline: BASELINE, tol: TOL });

  // active branch = the fresh walker you hold; ladder its verdict at the current trunk tip
  var active = scenario.branches.filter(function (b) {
    return E.freshness(b.branch, trunkTip) === 'fresh';
  })[0] || scenario.branches[scenario.branches.length - 1];
  var ladder = G.ladder(settle, active.branch, trunkTip);

  var branchObjs = scenario.branches.map(function (b) { return b.branch; });
  return {
    tree:    View.treeModel(scenario.merged, ladder),
    chat:    View.chatModel(scenario.merged, settle),
    dash:    View.dashboardModel(settle, branchObjs, trunkTip),
    markers: View.markerModel(ladder)
  };
}

var A = { T: T, BASELINE: BASELINE, TOL: TOL, buildScenario: buildScenario, computeView: computeView };
if (typeof module === 'object' && module.exports) module.exports = A;
else (typeof self !== 'undefined' ? self : this).TeamsApp = A;
