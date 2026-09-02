// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — TEAMS WORLD-AT-T (teams/ROADMAP.md §S10·A, Phase F — standalone, off-by-default).
//   The "time-travel" optic (IDEAS.md §A, TEAM_OPTICS.md §5.1): because World = fold(History), folding a
//   PREFIX of the ONE signed log renders any record/panel EXACTLY as it was at any instant. This is the
//   deterministic re-FOLD "as of T" — NOT the flaky view-scrubber (that merely restores a UI camera/view).
//   Pairs with hover-blame: click a who/when → `before(opId)` rewinds to just before that edit.
//
//   UNIVERSAL (BIM + ERP share the primitive): `worldAt` re-folds the geom world (via engine.fold);
//   `recordAt` re-folds an ERP record's fields/status. Both are pure prefix folds of the SAME log.
//   A prefix of a valid hash-chain is itself a valid chain → `verifyAt` proves the slice un-tampered.
//
//   PURE + deterministic (no Date.now / Math.random — the cut `T`/`opId` is an INPUT). NON-INVENT: every
//   folded value traces to a signed op in the prefix; nothing is synthesised. Depends only on the
//   connector seam + engine. Witness: teams/tests/poc_teams_s10.js (W-WORLD-AT-T).
'use strict';
var C = (typeof require !== 'undefined') ? require('../connectors') : self.TeamsConnectors;
var E = (typeof require !== 'undefined') ? require('../engine') : self.TeamsEngine;

// deterministic total order over the log: (ts, id) — both edge-minted INPUTS (§7), arrival-irrelevant.
function _order(ops) {
  return (ops || []).slice().sort(function (a, b) {
    return a.ts !== b.ts ? a.ts - b.ts : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
}

// prefix(ops, cut) — the slice of the log "as of" the cut, in total order. The cut selects ONE of:
//   { ts: T }        → every op with ts ≤ T            (time-travel to instant T, inclusive)
//   { upToId: id }   → through (and including) op `id` (inclusive boundary)
//   { beforeId: id } → strictly before op `id`         ("as it was before Bob's edit" — pairs with blame)
//   { index: n }     → the first n ops in total order
// NON-INVENT: an unknown/empty cut returns the WHOLE ordered log (identity) — never a guessed window.
function prefix(ops, cut) {
  var ord = _order(ops);
  cut = cut || {};
  if (cut.ts != null) return ord.filter(function (o) { return o.ts <= cut.ts; });
  if (cut.index != null) return ord.slice(0, Math.max(0, cut.index));
  if (cut.upToId != null || cut.beforeId != null) {
    var id = cut.upToId != null ? cut.upToId : cut.beforeId;
    var out = [];
    for (var i = 0; i < ord.length; i++) {
      if (ord[i].id === id) { if (cut.upToId != null) out.push(ord[i]); break; }
      out.push(ord[i]);
    }
    return out;
  }
  return ord;
}

// foldAt(ops, cut, foldFn) — apply ANY caller fold to the prefix (the general optic; worldAt/recordAt below
// are the two convenience folds). foldFn receives the ordered prefix array and returns the projection.
function foldAt(ops, cut, foldFn) { return foldFn(prefix(ops, cut)); }

// worldAt(ops, cut) — the geom world re-folded as of the cut (engine.fold = the canonical geom projection).
function worldAt(ops, cut) { return E.fold(prefix(ops, cut)); }

// recordAt(ops, cut, sel) — an ERP record (sel.table, sel.id) as of the cut: last value per field +
// last status, each tagged with who/when (the deeper grain of hover-blame, frozen at T). Pure fold —
// an op carries field changes in params.fields = { column: value }; status in params.to / params.status.
function recordAt(ops, cut, sel) {
  sel = sel || {};
  var fields = {}, status = null;
  prefix(ops, cut).forEach(function (op) {
    if (sel.table != null && op.table !== sel.table) return;
    if (sel.id != null && op.target !== sel.id) return;
    var p = op.params || {};
    if (p.fields) Object.keys(p.fields).forEach(function (c) { fields[c] = { value: p.fields[c], who: op.author, when: op.ts }; });
    var st = p.to != null ? p.to : (p.status != null ? p.status : null);
    if (st != null) status = { value: st, who: op.author, when: op.ts };
  });
  return { id: sel.id, fields: fields, status: status };
}

// before(ops, opId, sel?) — the record/world rewound to JUST BEFORE op `opId` (the blame "rewind there").
//   With sel → recordAt; without → worldAt. Convenience over prefix({beforeId}).
function before(ops, opId, sel) {
  return sel ? recordAt(ops, { beforeId: opId }, sel) : worldAt(ops, { beforeId: opId });
}

// verifyAt(ops, cut) — tamper-evidence of the slice: a prefix of a valid hash-chain is a valid chain
// (every op links prev_hash from GENESIS). Returns the connector verdict {ok, at?, why?}.
function verifyAt(ops, cut) { return C.verifyChain(prefix(ops, cut)); }

var W = { prefix: prefix, foldAt: foldAt, worldAt: worldAt, recordAt: recordAt, before: before, verifyAt: verifyAt };
if (typeof module === 'object' && module.exports) module.exports = W;
else (typeof self !== 'undefined' ? self : this).TeamsWorldAtT = W;
