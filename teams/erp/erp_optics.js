// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — TEAMS ERP OPTICS (teams/ROADMAP.md §S5, Phase C — standalone, READ-ONLY demo).
//   The ERP Dashboard surfaces (ERP_CONTEXT.md §4/§5/§5.1/§5.2), all PURE folds of a seeded op-log —
//   ZERO edits to erp/ runtime (the two runtime touches are Phase D). Four optics:
//     evaluateGate — the §4 verdict ladder over two speculative branches (RED/ORANGE/GREEN + same-doc clash).
//     flowLens     — §5.1 process-mining: actual path · variants · bottleneck · (optional) conformance.
//     involvement  — §5 Dashboard: per-doc/flow participants · per-role headcount · who's active · hot cells.
//     organiser    — §5.2 Team tab: scope filter (mine↔anyone by role/project/loc/space) + multi-select charts.
//   PURE + deterministic (no Date.now / Math.random — `now`/`ts` are INPUTS). NON-INVENT (every datum ← an op).
//   Witness: teams/tests/poc_teams_erp_optics.js (W-ERP-GATE / W-ERP-FLOW / W-INVOLVE / W-ORGANISER).
'use strict';

function _order(ops) {
  return (ops || []).slice().sort(function (a, b) {
    return a.ts !== b.ts ? a.ts - b.ts : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
}
function _cents(n) { return Math.round(Number(n || 0) * 100); }

// ═══ 1) evaluateGate — the §4 ladder over branches (W-ERP-GATE) ═══════════════
// Per-op verdict: verified-RED (FSM-illegal | unbalanced POST | period-closed) · verified-ORANGE
// (rule-guard breach, e.g. GrandTotal > a SET_RULE threshold) · verified-GREEN (clean, official) ·
// provisional (clean, on an unaccepted speculative branch). PLUS the cross-branch "same-doc" clash set
// (two branches touching ONE doc = contention). opts: { rules:[{verb,to?,field,max}], fsm:{transitions:[[from,action,to]]}, closedPeriods:[] }.
function evaluateGate(ops, opts) {
  opts = opts || {};
  var rules = opts.rules || [], fsm = opts.fsm || null, closed = opts.closedPeriods || [];
  var ordered = _order(ops);

  // same-doc clash: a doc touched by >1 distinct branch (null = official).
  var byDoc = {};
  ordered.forEach(function (op) { (byDoc[op.target] = byDoc[op.target] || {})[op.branch == null ? '∅' : op.branch] = 1; });
  var clashes = Object.keys(byDoc).filter(function (d) { return Object.keys(byDoc[d]).length > 1; })
    .sort().map(function (d) { return { doc: d, branches: Object.keys(byDoc[d]).sort() }; });

  var verdicts = ordered.map(function (op) {
    var p = op.params || {}, speculative = op.branch != null;
    // RED — unbalanced POST
    if (op.verb === 'POST' && Array.isArray(p.lines)) {
      var dr = 0, cr = 0;
      p.lines.forEach(function (l) { dr += _cents(l.dr != null ? l.dr : l.amtacctdr); cr += _cents(l.cr != null ? l.cr : l.amtacctcr); });
      if (dr !== cr) return _v(op, 'verified-red', 'unbalanced POST ΣDR=' + dr + 'c ΣCR=' + cr + 'c');
    }
    // RED — FSM-illegal transition
    if (fsm && p.from != null) {
      var legal = (fsm.transitions || []).some(function (t) { return t[0] === p.from && t[1] === op.verb; });
      if (!legal) return _v(op, 'verified-red', 'FSM-illegal (' + p.from + ',' + op.verb + ')');
    }
    // RED — period closed
    if (p.period != null && closed.indexOf(p.period) >= 0) return _v(op, 'verified-red', 'period ' + p.period + ' closed');
    // ORANGE — rule-guard breach
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (r.verb && r.verb !== op.verb) continue;
      if (r.to != null && p.to !== r.to) continue;
      if (r.field != null && p[r.field] != null && Number(p[r.field]) > Number(r.max))
        return _v(op, 'verified-orange', r.field + '=' + p[r.field] + ' > limit ' + r.max);
    }
    // clean
    return _v(op, speculative ? 'provisional' : 'verified-green', speculative ? 'clean on branch ' + op.branch : 'clean');
  });
  var counts = {};
  verdicts.forEach(function (v) { counts[v.verdict] = (counts[v.verdict] || 0) + 1; });
  return { verdicts: verdicts, clashes: clashes, counts: counts };
}
function _v(op, verdict, why) { return { id: op.id, doc: op.target, verb: op.verb, branch: op.branch == null ? null : op.branch, verdict: verdict, why: why }; }

// ═══ 2) flowLens — process-mining over the op-log (W-ERP-FLOW) ═════════════════
// case = doc (op.target) · activity = verb · actor · ts. Discovers the ACTUAL path each case took,
// the variant set, and the bottleneck transition (max avg dwell). Optional conformance vs a `toBe`
// activity sequence (skipped / extra). ZERO setup — the log already IS the event log (§5.1).
function flowLens(ops, opts) {
  opts = opts || {};
  var ordered = _order(ops);
  // per-case ordered activities
  var cases = {};
  ordered.forEach(function (op) {
    (cases[op.target] = cases[op.target] || []).push({ activity: op.verb, actor: op.author, ts: op.ts });
  });
  // variants — distinct activity sequences with case counts
  var variants = {};
  Object.keys(cases).forEach(function (c) {
    var seq = cases[c].map(function (s) { return s.activity; }).join('→');
    (variants[seq] = variants[seq] || { seq: seq, count: 0, cases: [] });
    variants[seq].count++; variants[seq].cases.push(c);
  });
  var variantList = Object.keys(variants).map(function (k) { return variants[k]; })
    .sort(function (a, b) { return b.count !== a.count ? b.count - a.count : (a.seq < b.seq ? -1 : 1); });
  variantList.forEach(function (v) { v.cases.sort(); });
  // transitions — aggregate dwell across cases; bottleneck = max avg dwell
  var trans = {};
  Object.keys(cases).forEach(function (c) {
    var steps = cases[c];
    for (var i = 0; i < steps.length - 1; i++) {
      var key = steps[i].activity + '→' + steps[i + 1].activity, dt = steps[i + 1].ts - steps[i].ts;
      (trans[key] = trans[key] || { from: steps[i].activity, to: steps[i + 1].activity, count: 0, totalMs: 0 });
      trans[key].count++; trans[key].totalMs += dt;
    }
  });
  var transitions = Object.keys(trans).map(function (k) {
    var t = trans[k]; t.avgMs = t.totalMs / t.count; return t;
  }).sort(function (a, b) { return b.avgMs !== a.avgMs ? b.avgMs - a.avgMs : (a.from < b.from ? -1 : 1); });
  var bottleneck = transitions.length ? transitions[0] : null;
  // conformance vs a to-be reference (optional, §5.1 later slice)
  var conformance = null;
  if (opts.toBe) {
    conformance = {};
    Object.keys(cases).sort().forEach(function (c) {
      var seq = cases[c].map(function (s) { return s.activity; });
      var missing = opts.toBe.filter(function (a) { return seq.indexOf(a) < 0; });
      var extra = seq.filter(function (a) { return opts.toBe.indexOf(a) < 0; });
      conformance[c] = { conforms: missing.length === 0 && extra.length === 0, missing: missing, extra: extra };
    });
  }
  return { cases: cases, variants: variantList, transitions: transitions, bottleneck: bottleneck, conformance: conformance };
}

// ═══ 3) involvement — the Dashboard hook (W-INVOLVE) ══════════════════════════
// Per doc/flow: distinct participants, per-role headcount, who's active now (touched within
// opts.activeMs of opts.now — presence proxy from the log), and the HOT cells (most participants =
// the contention/bottleneck). flow grouping via opts.flowOf(op) or op.flow (default = doc itself).
function involvement(ops, opts) {
  opts = opts || {};
  var now = opts.now, activeMs = opts.activeMs != null ? opts.activeMs : 60 * 1000;
  var flowOf = opts.flowOf || function (op) { return op.flow != null ? op.flow : op.target; };
  function agg(keyOf) {
    var m = {};
    _order(ops).forEach(function (op) {
      var k = keyOf(op);
      var e = m[k] = m[k] || { participants: {}, roles: {}, active: {}, count: 0 };
      if (!e.participants[op.author]) { e.participants[op.author] = 1; if (op.role) e.roles[op.role] = (e.roles[op.role] || 0) + 1; }
      if (now != null && (now - op.ts) <= activeMs) e.active[op.author] = 1;
    });
    var out = {};
    Object.keys(m).forEach(function (k) {
      var e = m[k];
      out[k] = { participants: Object.keys(e.participants).sort(), roles: e.roles,
                 active: Object.keys(e.active).sort(), count: Object.keys(e.participants).length };
    });
    return out;
  }
  var perDoc = agg(function (op) { return op.target; });
  var perFlow = agg(flowOf);
  var hot = Object.keys(perDoc).map(function (d) { return { doc: d, count: perDoc[d].count }; })
    .sort(function (a, b) { return b.count !== a.count ? b.count - a.count : (a.doc < b.doc ? -1 : 1); });
  return { perDoc: perDoc, perFlow: perFlow, hot: hot };
}

// ═══ 4) organiser — the Team tab / 360 lens (W-ORGANISER) ═════════════════════
// scope: mine↔anyone narrowed by role/project/location/space (the anti-overwhelm dial, §5.2). charts:
// multi-select composition (involvement/flow/presence/nudges) over the SCOPED ops. broadcasts: signed
// annot ops with a `broadcast` anchor surface here (a system-wide post-it). All pure folds.
function scope(ops, filter) {
  filter = filter || {};
  return (ops || []).filter(function (op) {
    if (filter.mode === 'mine' && op.author !== filter.viewer) return false;
    if (filter.role != null && op.role !== filter.role) return false;
    if (filter.project != null && op.project !== filter.project) return false;
    if (filter.location != null && op.location !== filter.location) return false;
    if (filter.space != null && op.space !== filter.space) return false;
    return true;
  });
}
function broadcasts(ops) {
  return _order(ops).filter(function (op) {
    var p = op.params || {};
    return op.cls === 'annot' && ((p.anchor && p.anchor.kind === 'broadcast') || /^broadcast:/.test(String(op.target || '')));
  }).map(function (op) { return { id: op.id, author: op.author, ts: op.ts, msg: (op.params || {}).msg || '', target: op.target }; });
}
function charts(ops, selected, opts) {
  opts = opts || {};
  var out = {};
  (selected || []).forEach(function (kind) {
    if (kind === 'involvement') out.involvement = involvement(ops, opts);
    else if (kind === 'flow') out.flow = flowLens(ops, opts);
    else if (kind === 'presence') {
      var inv = involvement(ops, opts), who = {};
      Object.keys(inv.perDoc).forEach(function (d) { inv.perDoc[d].active.forEach(function (a) { who[a] = 1; }); });
      out.presence = { active: Object.keys(who).sort() };
    } else if (kind === 'nudges') {
      var inv2 = involvement(ops, opts), th = opts.nudgeThreshold != null ? opts.nudgeThreshold : 2;
      out.nudges = inv2.hot.filter(function (h) { return h.count > th; })
        .map(function (h) { return { doc: h.doc, why: h.count + ' participants > ' + th + ' (contention)' }; });
    } else throw new Error('erp_optics: unknown chart kind ' + kind);
  });
  return out;
}
function organiser(ops, filter, selected, opts) {
  var scoped = scope(ops, filter || {});
  return { scope: filter || {}, count: scoped.length, charts: charts(scoped, selected || [], opts),
           broadcasts: broadcasts(ops) };   // broadcasts are system-wide → not scope-filtered
}

var O = {
  evaluateGate: evaluateGate, flowLens: flowLens, involvement: involvement,
  scope: scope, charts: charts, broadcasts: broadcasts, organiser: organiser
};
if (typeof module === 'object' && module.exports) module.exports = O;
else (typeof self !== 'undefined' ? self : this).TeamsErpOptics = O;
