// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — TEAMS ENGINE: branches, scope/owner-gate, total-order, fold, blame, freshness.
//   Pure + deterministic; depends ONLY on the connector seam (connectors.js). No modeller code.
//   prompts/RESUME_DISTRIBUTED_BRANCHES.md §2/§5/§7. Read the log after every run.
'use strict';
var C = (typeof require !== 'undefined') ? require('./connectors') : (self.TeamsConnectors);

// op-classes (§5): geom = own-branch only (owner-gate) · annot = any branch · git = log mgmt
var GEOM = 'geom', ANNOT = 'annot', GIT = 'git';

function makeBranch(id, owner, scope, kind, forkTrunkTip) {
  return { id: id, owner: owner, scope: scope, kind: kind || 'walker', forkTrunkTip: forkTrunkTip || 'GENESIS' };
}

// owner-gate (G-SINGLE-WRITER, §4): a geom op may only be signed by the branch owner; annotations
// are allowed cross-branch (§5.2). Returns {ok, reason}. Pure check — no mutation.
function gateAppend(branch, op) {
  if (op.cls === GEOM && op.author !== branch.owner)
    return { ok: false, reason: 'owner-gate: ' + op.author + ' cannot write geom into ' + branch.id };
  if (op.cls === GEOM && op.branch !== branch.id)
    return { ok: false, reason: 'scope: geom op branch ' + op.branch + ' != ' + branch.id };
  return { ok: true };
}

// append a signed op to a log (chained off the log tip). Returns {ok, reason, log}.
function append(log, branch, op) {
  var g = gateAppend(branch, op);
  if (!g.ok) return { ok: false, reason: g.reason, log: log };
  var tip = log.length ? log[log.length - 1].op_hash : 'GENESIS';
  C.sign(op, tip);
  return { ok: true, log: log.concat([op]) };
}

// deterministic total order over a merged set: (ts, id) — both are edge-minted INPUTS (§7).
function totalOrder(ops) {
  return ops.slice().sort(function (a, b) {
    return a.ts !== b.ts ? a.ts - b.ts : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
}

// fold the ordered geom ops into a world: { guid: {guid,box,disc,cost,owner,lastTs} }.
// Verbs: INSERT (place) · MOVE (translate) · SIZE (scale) · DELETE (remove). Non-geom ignored.
function fold(ops) {
  var world = {};
  totalOrder(ops).forEach(function (op) {
    if (op.cls !== GEOM) return;
    var g = op.target, p = op.params || {};
    if (op.verb === 'INSERT') {
      world[g] = { guid: g, box: Object.assign({ x: 0, y: 0, z: 0, w: 0, d: 0, h: 0 }, p.box),
                   disc: p.disc, cost: p.cost || 0, owner: op.author, lastTs: op.ts };
    } else if (world[g]) {
      var e = world[g];
      if (op.verb === 'MOVE') { e.box.x += p.dx || 0; e.box.y += p.dy || 0; e.box.z += p.dz || 0; }
      else if (op.verb === 'SIZE') { if (p.w != null) e.box.w = p.w; if (p.d != null) e.box.d = p.d; if (p.h != null) e.box.h = p.h; if (p.cost != null) e.cost = p.cost; }
      else if (op.verb === 'DELETE') { delete world[g]; return; }
      e.owner = op.author; e.lastTs = op.ts;
    }
  });
  return world;
}

// blame map: guid -> last author that touched it, in total order (= the Outliner tint, §8).
function blame(ops) {
  var b = {};
  totalOrder(ops).forEach(function (op) { if (op.cls === GEOM && op.target) b[op.target] = op.author; });
  return b;
}

// freshness (§7): a walker branch is STALE the moment the trunk tip advances past its fork point.
function freshness(branch, trunkTipNow) {
  return (branch.kind === 'walker' && trunkTipNow !== branch.forkTrunkTip) ? 'stale' : 'fresh';
}

var E = { GEOM: GEOM, ANNOT: ANNOT, GIT: GIT, makeBranch: makeBranch, gateAppend: gateAppend,
          append: append, totalOrder: totalOrder, fold: fold, blame: blame, freshness: freshness };
if (typeof module === 'object' && module.exports) module.exports = E;
else (typeof self !== 'undefined' ? self : this).TeamsEngine = E;
