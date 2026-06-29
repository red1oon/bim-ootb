// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — TEAMS MERGE GATE + COLOR LADDER (§6 two tiers, §7 ladder).
//   Unions two branch logs, asks the connector gate for a Tier-1 hint (coarse) then a Tier-2
//   verdict (precise), and resolves each element/cell to provisional|verified-*|stale.
//   prompts/RESUME_DISTRIBUTED_BRANCHES.md. Read the log after every run.
'use strict';
var C = (typeof require !== 'undefined') ? require('./connectors') : self.TeamsConnectors;
var E = (typeof require !== 'undefined') ? require('./engine') : self.TeamsEngine;

// Tier-1 AWARENESS: coarse, advisory, fast. Inflate boxes by `margin` → "might clash here".
function hint(branchOps, trunkOps, margin) {
  var world = E.fold(branchOps.concat(trunkOps));
  var g = C.evaluateGate(world, { margin: margin == null ? 0.4 : margin });
  return { tier: 1, state: 'provisional', clashes: g.clashes, world: world };
}

// Tier-2 INTEGRATION: precise, authoritative. margin 0. Adds budget (ORANGE) over a baseline.
function settle(branchOps, trunkOps, opts) {
  opts = opts || {};
  var world = E.fold(branchOps.concat(trunkOps));
  var g = C.evaluateGate(world, { margin: 0 });
  var inClash = {}; g.clashes.forEach(function (c) { inClash[c.a] = inClash[c.b] = true; });

  // budget: branch cost vs Project-Order baseline → ORANGE if over tolerance
  var over = {};
  if (opts.baseline) Object.keys(opts.baseline).forEach(function (disc) {
    var spent = C.foldCost(world, disc), base = opts.baseline[disc];
    if (base && (spent - base) / base > (opts.tol || 0.1)) over[disc] = (spent - base) / base;
  });

  // per-element color (§7): red (clash) > orange (over budget) > green
  var elem = {};
  Object.keys(world).forEach(function (gid) {
    elem[gid] = inClash[gid] ? 'verified-red' : (over[world[gid].disc] ? 'verified-orange' : 'verified-green');
  });
  return { tier: 2, clashes: g.clashes, over: over, elem: elem, world: world };
}

// apply the staleness overlay (§7): if the branch's fork point is behind trunk, the whole verdict
// is STALE until re-fold — it was computed against an old trunk.
function ladder(settleResult, branch, trunkTipNow) {
  var fresh = E.freshness(branch, trunkTipNow);
  if (fresh === 'stale') {
    var s = {}; Object.keys(settleResult.elem).forEach(function (g) { s[g] = 'stale'; });
    return { fresh: 'stale', elem: s, clashes: settleResult.clashes, note: 'trunk advanced — re-fold to revalidate' };
  }
  return { fresh: 'fresh', elem: settleResult.elem, clashes: settleResult.clashes };
}

// roll element states up into a discipline×discipline clash-matrix cell count (§8 dashboard).
function matrix(clashes) {
  var m = {};
  clashes.forEach(function (c) { var k = c.disc.join('×'); m[k] = (m[k] || 0) + 1; });
  return m;
}

var G = { hint: hint, settle: settle, ladder: ladder, matrix: matrix };
if (typeof module === 'object' && module.exports) module.exports = G;
else (typeof self !== 'undefined' ? self : this).TeamsGate = G;
