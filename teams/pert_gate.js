// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — TEAMS PERT / SCHEDULE MERGE-GATE (RESUME_TEAMS_UI_CONSISTENCY §3b.2 + §1a ③).
//   The context-free git engine (branch/merge/diff/blame) is UNIVERSAL and already done; the per-context
//   plug-in is the merge GATE. teams/gate.js is the SPATIAL plug-in (clash). THIS is its SCHEDULE/PERT twin
//   for the Viewer-side "What-If" branching ("construct this first? delay? resequence?"). SAME shape as
//   gate.js — hint (Tier-1 coarse/advisory) · settle (Tier-2 precise → per-task verdict) · ladder (staleness)
//   · matrix — but the conflict is a PERT one, NOT a spatial clash:
//     • DEPENDENCY violation — a task starts before a predecessor finishes (finish-to-start broken).
//     • DEPENDENCY cycle     — A→B→…→A (an impossible schedule).
//     • RESOURCE clash       — one resource booked in two overlapping windows (double-booking).
//   Every task folds the signed SCHEDULE op-log (NON-INVENT). Deterministic (total order, no Date.now).
//   Witness: teams/tests/poc_teams_pert_gate.js (W-PERT-GATE).
'use strict';
var E = (typeof require === 'function') ? require('./engine.js') : (typeof self !== 'undefined' ? self : this).TeamsEngine;

var SCHED = 'sched';

// foldSchedule — fold the SCHEDULE ops (in total order) into tasks: { id:{id,start,duration,end,deps,resource,cost,owner,ts} }.
//   Verbs: SCHEDULE (create) · RESCHEDULE (start/duration) · SETDEP (deps) · ASSIGN (resource) · DELETE. Last-writer wins.
function foldSchedule(ops) {
  var tasks = {};
  E.totalOrder(ops || []).forEach(function (op) {
    if (op.cls !== SCHED) return;
    var id = op.target, p = op.params || {};
    if (op.verb === 'SCHEDULE') {
      tasks[id] = { id: id, start: p.start || 0, duration: p.duration || 0, deps: (p.deps || []).slice(),
        resource: p.resource != null ? p.resource : null, cost: p.cost || 0, owner: op.author, ts: op.ts };
    } else if (tasks[id]) {
      var t = tasks[id];
      if (op.verb === 'RESCHEDULE') { if (p.start != null) t.start = p.start; if (p.duration != null) t.duration = p.duration; }
      else if (op.verb === 'SETDEP') { if (p.deps != null) t.deps = p.deps.slice(); }
      else if (op.verb === 'ASSIGN') { if (p.resource != null) t.resource = p.resource; if (p.cost != null) t.cost = p.cost; }
      else if (op.verb === 'DELETE') { delete tasks[id]; return; }
      t.owner = op.author; t.ts = op.ts;
    }
  });
  Object.keys(tasks).forEach(function (k) { tasks[k].end = tasks[k].start + tasks[k].duration; });
  return tasks;
}

// _cycles — dependency cycles via DFS (a back-edge to a GREY node). Returns de-duped sorted member arrays.
function _cycles(tasks, ids) {
  var WHITE = 0, GREY = 1, color = {}, cycles = [], stack = [];
  ids.forEach(function (i) { color[i] = WHITE; });
  function dfs(u) {
    color[u] = GREY; stack.push(u);
    (tasks[u].deps || []).forEach(function (v) {
      if (!tasks[v]) return;
      if (color[v] === GREY) { var idx = stack.indexOf(v); cycles.push(stack.slice(idx).slice().sort()); }
      else if (color[v] === WHITE) dfs(v);
    });
    color[u] = 2; stack.pop();
  }
  ids.forEach(function (i) { if (color[i] === WHITE) dfs(i); });
  var seen = {}, out = [];
  cycles.forEach(function (c) { var k = c.join(','); if (!seen[k]) { seen[k] = 1; out.push(c); } });
  return out;
}

// _conflicts — the PERT conflict set over folded tasks. `margin` widens windows for the coarse Tier-1 hint.
function _conflicts(tasks, margin) {
  margin = margin || 0;
  var ids = Object.keys(tasks).sort();
  var depViolations = [];
  ids.forEach(function (id) {
    var t = tasks[id];
    (t.deps || []).forEach(function (pid) {
      var p = tasks[pid]; if (!p) return;
      if (t.start < p.end - margin) depViolations.push({ task: id, pred: pid, by: p.end - t.start });   // finish-to-start broken
    });
  });
  var cycles = _cycles(tasks, ids);
  var resourceClashes = [];
  for (var i = 0; i < ids.length; i++) for (var j = i + 1; j < ids.length; j++) {
    var a = tasks[ids[i]], b = tasks[ids[j]];
    if (a.resource == null || a.resource !== b.resource) continue;
    var lo = Math.max(a.start, b.start), hi = Math.min(a.end, b.end);
    if (lo < hi + margin) resourceClashes.push({ a: ids[i], b: ids[j], resource: a.resource, overlap: Math.max(0, hi - lo) });
  }
  return { depViolations: depViolations, cycles: cycles, resourceClashes: resourceClashes };
}

// Tier-1 AWARENESS (mirror gate.hint): coarse, advisory — widen windows by `margin` → "might contend here".
function hint(branchOps, trunkOps, margin) {
  var tasks = foldSchedule((branchOps || []).concat(trunkOps || []));
  var cf = _conflicts(tasks, margin == null ? 2 : margin);
  return { tier: 1, state: 'provisional', conflicts: cf, world: tasks };
}

// Tier-2 INTEGRATION (mirror gate.settle): precise, margin 0. Per-task colour red>orange>green.
//   red = dependency violation / cycle / resource double-booking · orange = over a resource budget baseline · green = clean.
function settle(branchOps, trunkOps, opts) {
  opts = opts || {};
  var tasks = foldSchedule((branchOps || []).concat(trunkOps || []));
  var cf = _conflicts(tasks, 0);
  var red = {};
  cf.depViolations.forEach(function (d) { red[d.task] = 1; });
  cf.resourceClashes.forEach(function (c) { red[c.a] = red[c.b] = 1; });
  cf.cycles.forEach(function (cy) { cy.forEach(function (n) { red[n] = 1; }); });

  var over = {};
  if (opts.baseline) {
    var spent = {};
    Object.keys(tasks).forEach(function (k) { var t = tasks[k]; if (t.resource != null) spent[t.resource] = (spent[t.resource] || 0) + (t.cost || 0); });
    Object.keys(opts.baseline).forEach(function (res) {
      var base = opts.baseline[res], sp = spent[res] || 0;
      if (base && (sp - base) / base > (opts.tol || 0.1)) over[res] = (sp - base) / base;
    });
  }
  var elem = {};
  Object.keys(tasks).forEach(function (k) {
    var t = tasks[k];
    elem[k] = red[k] ? 'verified-red' : (t.resource != null && over[t.resource] ? 'verified-orange' : 'verified-green');
  });
  return { tier: 2, conflicts: cf, over: over, elem: elem, world: tasks };
}

// staleness overlay (mirror gate.ladder): a walker branch is STALE once the trunk tip advances past its fork.
function ladder(settleResult, branch, trunkTipNow) {
  var fresh = E.freshness(branch, trunkTipNow);
  if (fresh === 'stale') {
    var s = {}; Object.keys(settleResult.elem).forEach(function (g) { s[g] = 'stale'; });
    return { fresh: 'stale', elem: s, conflicts: settleResult.conflicts, note: 'trunk resequenced — re-fold to revalidate' };
  }
  return { fresh: 'fresh', elem: settleResult.elem, conflicts: settleResult.conflicts };
}

// per-resource conflict count (mirror gate.matrix → §8 dashboard cell counts).
function matrix(resourceClashes) {
  var m = {};
  (resourceClashes || []).forEach(function (c) { m[c.resource] = (m[c.resource] || 0) + 1; });
  return m;
}

var PG = { SCHED: SCHED, foldSchedule: foldSchedule, hint: hint, settle: settle, ladder: ladder, matrix: matrix };
if (typeof module === 'object' && module.exports) module.exports = PG;
else (typeof self !== 'undefined' ? self : this).TeamsPertGate = PG;
