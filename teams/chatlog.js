// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — TEAMS CHAT == THE SIGNED LOG (§8). The chat is NOT a side channel: every line
//   IS a signed op, projected to prose. Message = the op's own description, or a DETERMINISTIC render
//   of verb+params (never fabricated). Tamper-evident via the connector chain.
//   prompts/RESUME_DISTRIBUTED_BRANCHES.md. Read the log after every run.
'use strict';
var C = (typeof require !== 'undefined') ? require('./connectors') : self.TeamsConnectors;
var E = (typeof require !== 'undefined') ? require('./engine') : self.TeamsEngine;

// deterministic prose for an op with no author-written message (NON-INVENT — pure f(verb,target,params))
function describe(op) {
  var p = op.params || {}, t = op.target || '';
  switch (op.verb) {
    case 'INSERT': return t + ' placed (' + (p.disc || '?') + ')';
    case 'MOVE':   return t + ' moved (' + (p.dx || 0) + ',' + (p.dy || 0) + ',' + (p.dz || 0) + ')';
    case 'SIZE':   return t + ' sized' + (p.w != null ? ' w=' + p.w : '') + (p.cost != null ? ' $' + p.cost : '');
    case 'DELETE': return t + ' deleted';
    case 'POSTIT': return '📌 ' + (p.message || 'note') + (t ? ' on ' + t : '');
    case 'PUSH':   return 'pushed ' + (p.n || '') + ' ops → shared log';
    case 'REBASE': return 'rebased onto trunk ' + (p.onto || '');
    default:       return op.verb + (t ? ' ' + t : '');
  }
}

// verdict badge for a line, derived from the gate result (clash/over) or the op-class.
function verdictOf(op, gate) {
  if (op.cls === E.ANNOT) return { kind: 'annotation', text: 'annotation' };
  if (op.cls === E.GIT)   return { kind: 'git', text: op.verb.toLowerCase() };
  if (op.branch === 'trunk' || op.kind === 'trunk') return { kind: 'trunk', text: 'trunk' };
  if (gate) {
    var inClash = {}; (gate.clashes || []).forEach(function (c) { inClash[c.a] = inClash[c.b] = true; });
    if (inClash[op.target]) return { kind: 'red', text: 'verified RED' };
    if (gate.over && gate.over[(op.params || {}).disc]) return { kind: 'orange', text: 'over budget' };
  }
  return { kind: 'green', text: 'clean' };
}

// project the ordered log into chat lines (§8). Optional gate result colors the badges.
function render(ops, gate) {
  return E.totalOrder(ops).map(function (op) {
    return { id: op.id, author: op.author, ts: op.ts, cls: op.cls, verb: op.verb,
             msg: (op.params && op.params.message && op.cls !== 'annot') ? op.params.message : describe(op),
             verdict: verdictOf(op, gate) };
  });
}

// tamper-evidence: the chat history cannot be edited without breaking the chain.
function tamperCheck(ops) { return C.verifyChain(ops); }

var L = { describe: describe, verdictOf: verdictOf, render: render, tamperCheck: tamperCheck };
if (typeof module === 'object' && module.exports) module.exports = L;
else (typeof self !== 'undefined' ? self : this).TeamsChatlog = L;
