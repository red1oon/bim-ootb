// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — TEAMS REPLAY-ONBOARDING (teams/ROADMAP.md §S12·D, Phase F — standalone, off-by-default).
//   "Watch how this was done", always current (IDEAS.md §D): the log is a deterministic event stream, so a
//   newbie REPLAYS a real completed flow step-by-step, narrated by the chat-is-log + the work summary —
//   training that is never stale because it IS the real history, not a manual. A step-recorder over the ONE
//   signed log: each step = one signed op; the cursor re-FOLDS the world/record AS-OF that step (World-at-T).
//
//   PURE + deterministic (no Date.now / Math.random — ids/ts are INPUTS; steps = total-order of the real
//   ops). NON-INVENT: every step traces to an op; nothing is staged. Reuses share_bundle.workSummary (the
//   narration script) + world_at_t (the as-of-step state). Witness: teams/tests/poc_teams_s12.js (W-REPLAY).
'use strict';
var SB = (typeof require !== 'undefined') ? require('./share_bundle') : self.TeamsShareBundle;
var WT = (typeof require !== 'undefined') ? require('./world_at_t') : self.TeamsWorldAtT;

function _order(ops) {
  return (ops || []).slice().sort(function (a, b) {
    return a.ts !== b.ts ? a.ts - b.ts : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
}
// the same scope predicate the work summary uses (a flow/doc + an optional period + op-classes).
function _scopePredicate(opts) {
  return function (op) {
    if (opts.classes && opts.classes.indexOf(op.cls) < 0) return false;
    if (opts.anchorKey != null && op.target !== opts.anchorKey) return false;
    if (opts.from != null && op.ts < opts.from) return false;
    if (opts.to != null && op.ts > opts.to) return false;
    return true;
  };
}

// makeReplay(ops, opts) — a deterministic step-recorder over a scoped flow. opts = { anchorKey?, from?,
//   to?, classes? } (same scoping as workSummary). Returns a session:
//     { steps:[{ i, n, what, who, when, verb, target, opId, narration }], n, participants, scope, _ops }.
//   `_ops` = the FULL log (kept so a step can re-fold the world AS-OF that op over the whole timeline).
function makeReplay(ops, opts) {
  opts = opts || {};
  var full = _order(ops);
  var scoped = full.filter(_scopePredicate(opts));
  var n = scoped.length;
  var steps = scoped.map(function (op, idx) {
    return { i: idx + 1, n: n, what: op.verb + ' ' + op.target, who: op.author, when: op.ts,
             verb: op.verb, target: op.target, opId: op.id,
             narration: 'Step ' + (idx + 1) + '/' + n + ' · ' + op.author + ' ' + op.verb + ' ' + op.target + ' @ ' + op.ts };
  });
  var who = {}; steps.forEach(function (s) { who[s.who] = 1; });
  return { steps: steps, n: n, participants: Object.keys(who).sort(),
           scope: { anchorKey: opts.anchorKey || null, from: opts.from != null ? opts.from : null, to: opts.to != null ? opts.to : null },
           _ops: ops };
}

// stepState(session, i, sel?) — the world/record AS-OF step i (cursor 1..n). With `sel` ({table?,id})
//   → recordAt (the doc as it stood at that step); without → worldAt (the geom world). Re-fold of the
//   prefix UP TO that step's op over the full timeline — exact + deterministic. Out-of-range → null.
function stepState(session, i, sel) {
  if (!session || i < 1 || i > session.n) return null;
  var opId = session.steps[i - 1].opId;
  return sel ? WT.recordAt(session._ops, { upToId: opId }, sel) : WT.worldAt(session._ops, { upToId: opId });
}

// narrationScript(session) — the full narrated script (the workSummary digest = the training text).
function narrationScript(session) {
  return SB.workSummary(session._ops, session.scope);    // workSummary re-scopes identically (NON-INVENT)
}

// step(session, cursor, dir) — advance/rewind the cursor, clamped to [0, n] (0 = before step 1). Pure.
function step(session, cursor, dir) {
  var c = (cursor || 0) + (dir < 0 ? -1 : 1);
  return c < 0 ? 0 : c > session.n ? session.n : c;
}

var R = { makeReplay: makeReplay, stepState: stepState, narrationScript: narrationScript, step: step };
if (typeof module === 'object' && module.exports) module.exports = R;
else (typeof self !== 'undefined' ? self : this).TeamsReplay = R;
