// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — TEAMS DOT-LAYER (teams/ROADMAP.md §S2, Phase B — off-by-default, standalone).
//   The universal optics core (TEAM_OPTICS.md §1-3): the Team icon turns on a ZERO-FOOTPRINT dot
//   layer over the EXISTING screens — same code in BIM and ERP. One grammar: collapsed dot → hover
//   blurb → click. Clutter control = fan-out `+N`. Colour = signer (same person, same colour, both
//   products). Every dot is a fold of the signed op-log (NON-INVENT). Depends on NOTHING but the ops.
//
//   TWO halves (mirrors teams_view.js): (1) PURE view-model builders — deterministic, node-testable,
//   every field traced to an op; (2) a DOM renderer that emits mock class names + no-ops in node.
//   Witnesses: teams/tests/poc_teams_dot_layer.js — W-DOT-LAYER (off=nothing, person/post-it dots,
//   fan-out +N, colour=signer) + W-BLAME-RECORD / W-RECINFO (record-grain "who last touched, when").
//
//   HARD RULE (§9): **Team off = pixel-identical UI.** With opts.on falsy the model is empty and the
//   renderer draws nothing — zero new DOM, the host's pixels never move.
'use strict';

// ═══ shared pure helpers ═════════════════════════════════════════════════════

// anchor of an op — the record/element a dot pins to. Default = op.target (BIM element id / ERP doc
// id are the SAME primitive, TEAM_OPTICS §4). Override via opts.anchorOf for product-specific refs.
function _anchorOf(op, anchorOf) { return anchorOf ? anchorOf(op) : op.target; }

// colour = signer (TEAM_OPTICS §2). DETERMINISTIC hue from the signer/author string (djb2, the same
// hash family the kernel uses) → fixed sat/light. Same person → same colour everywhere; NON-INVENT
// (a pure function of the signer key, no palette table to drift). Returns an hsl() string.
function colorOf(signer) {
  var s = String(signer == null ? '' : signer), acc = 5381;
  for (var i = 0; i < s.length; i++) acc = ((acc << 5) + acc + s.charCodeAt(i)) | 0;
  var hue = ((acc % 360) + 360) % 360;
  return 'hsl(' + hue + ',65%,55%)';
}

// initials fallback (TEAM_OPTICS §2: "initials inside as fallback"). Deterministic, ≤2 chars.
function initialsOf(signer) {
  var parts = String(signer == null ? '' : signer).trim().split(/[\s_\-.]+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// deterministic total order over ops: (ts, id) — both edge-minted INPUTS (no Date.now/Math.random).
function _order(ops) {
  return (ops || []).slice().sort(function (a, b) {
    return a.ts !== b.ts ? a.ts - b.ts : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
}

// ═══ Half 1 — PURE view-model builders (no DOM, deterministic, NON-INVENT) ════

// recordBlame — W-RECINFO (TEAM_OPTICS §3.1, record grain): fold the log → who LAST touched each
// record and when. Pure + order-invariant (folds in total order, not arrival order). Returns
// { anchor: { who, when, action } }. This IS the `(i)` record-info blurb — the log is the history,
// zero extra writes, AD_ChangeLog made redundant. opts.classes filters which op-classes count
// (default: any non-annotation op — annotations don't "touch" the record's data).
function recordBlame(ops, opts) {
  opts = opts || {};
  var anchorOf = opts.anchorOf, classes = opts.classes || null;
  var b = {};
  _order(ops).forEach(function (op) {
    if (classes && classes.indexOf(op.cls) < 0) return;
    if (!classes && op.cls === 'annot') return;             // a post-it is not a data touch
    var a = _anchorOf(op, anchorOf);
    if (a == null) return;
    b[a] = { who: op.author, when: op.ts, action: op.verb }; // last in total order wins
  });
  return b;
}

// personDots — one dot per (anchor, person) who touched it, carrying that person's LAST action on
// that anchor (TEAM_OPTICS §2/§3.3 "who last touched / who's on it"). Colour = signer, initials
// fallback, hover-blurb = "name · action · ts". Ordered (anchor, then recency desc, then author) for
// deterministic fan-out. NON-INVENT — every dot is a real op's author.
function personDots(ops, opts) {
  opts = opts || {};
  var anchorOf = opts.anchorOf, classes = opts.classes || null;
  var seen = {};   // anchor → person → dot (kept = latest by total order)
  _order(ops).forEach(function (op) {
    if (classes && classes.indexOf(op.cls) < 0) return;
    if (!classes && op.cls === 'annot') return;
    var a = _anchorOf(op, anchorOf);
    if (a == null) return;
    (seen[a] = seen[a] || {})[op.author] = { kind: 'person', anchor: a, person: op.author,
      color: colorOf(op.author), initials: initialsOf(op.author), lastAction: op.verb, ts: op.ts,
      blurb: op.author + ' · ' + op.verb + ' · ' + op.ts };
  });
  var out = [];
  Object.keys(seen).sort().forEach(function (a) {
    var dots = Object.keys(seen[a]).map(function (p) { return seen[a][p]; });
    dots.sort(function (x, y) { return y.ts !== x.ts ? y.ts - x.ts : (x.person < y.person ? -1 : 1); });
    out = out.concat(dots);
  });
  return out;
}

// postitDots — one dot per post-it (a signed `annot` op, TEAM_OPTICS §4). Folds annot verbs so status
// is the LATEST: PIN/REPLY → open · RESOLVE → resolved · SNOOZE → snoozed. Resolved/snoozed → faded
// (TEAM_OPTICS §2). Colour = signer, hover-blurb = "msg — author · ts". A post-it carries a stable
// pinId (params.pinId or the creating op's id) so a later RESOLVE/SNOOZE updates the SAME dot.
function postitDots(ops, opts) {
  opts = opts || {};
  var anchorOf = opts.anchorOf;
  var pins = {};   // pinId → dot
  _order(ops).forEach(function (op) {
    if (op.cls !== 'annot') return;
    var p = op.params || {};
    var pinId = p.pinId != null ? p.pinId : op.id;
    var a = _anchorOf(op, anchorOf);
    if (op.verb === 'PIN' || !pins[pinId]) {
      pins[pinId] = { kind: 'postit', anchor: a, pinId: pinId, author: op.author,
        color: colorOf(op.author), ts: op.ts, status: 'open', msg: p.msg != null ? p.msg : '',
        faded: false, blurb: '' };
    }
    var d = pins[pinId];
    if (op.verb === 'RESOLVE') d.status = 'resolved';
    else if (op.verb === 'SNOOZE') d.status = 'snoozed';
    else if (op.verb === 'REOPEN') d.status = 'open';
    d.faded = (d.status === 'resolved' || d.status === 'snoozed');
    d.blurb = (d.msg || '(note)') + ' — ' + d.author + ' · ' + d.ts;
  });
  return Object.keys(pins).map(function (k) { return pins[k]; })
    .sort(function (x, y) { return x.ts !== y.ts ? x.ts - y.ts : (x.pinId < y.pinId ? -1 : 1); });
}

// clusterByAnchor — fan-out (TEAM_OPTICS §2 "clutter control"). Group dots of ONE kind by anchor; when
// > maxVisible land on one anchor, collapse to a `+N` cluster (visible head + overflow tail). Never a
// pile of overlapping dots. Deterministic: dots arrive pre-ordered; cluster keyed/sorted by anchor.
function clusterByAnchor(dots, opts) {
  opts = opts || {};
  var maxVisible = opts.maxVisible != null ? opts.maxVisible : 2;
  var byAnchor = {};
  (dots || []).forEach(function (d) { (byAnchor[d.anchor] = byAnchor[d.anchor] || []).push(d); });
  return Object.keys(byAnchor).sort().map(function (a) {
    var all = byAnchor[a];
    var overflow = Math.max(0, all.length - maxVisible);
    return { anchor: a, kind: all[0].kind, count: all.length, dots: all,
             visible: all.slice(0, maxVisible), overflow: overflow,
             badge: overflow > 0 ? '+' + overflow : null };
  });
}

// dotLayerModel — the top-level model the renderer consumes. opts.on falsy ⇒ EMPTY (the HARD RULE:
// Team off = pixel-identical UI). On ⇒ person clusters + post-it clusters, both fan-out, ordered.
function dotLayerModel(ops, opts) {
  opts = opts || {};
  if (!opts.on) return { on: false, clusters: [], persons: [], postits: [] };  // off = NO-OP
  var persons = personDots(ops, opts);
  var postits = postitDots(ops, opts);
  var clusters = clusterByAnchor(persons, opts).concat(clusterByAnchor(postits, opts));
  return { on: true, clusters: clusters, persons: persons, postits: postits };
}

// ═══ Half 2 — DOM renderer (browser-only; strict no-op in node OR when off) ═══
// Pure DOM API (createElement/textContent) — never innerHTML of data. Emits classes a mock CSS styles:
//   `.tdot.person` (style --c=colour, initials text) · `.tdot.postit` (+`.faded`) · `.tcluster .tbadge`
//   (+N). hover-blurb via title; click via opts.onDot(dot). layout maps anchor→{x,y} (obj or fn).
function renderDotLayer(rootEl, model, layout, opts) {
  if (typeof document === 'undefined' || !rootEl) return;        // node: no-op
  opts = opts || {};
  // clear ONLY our own nodes (leave the host screen intact — zero footprint)
  Array.prototype.slice.call(rootEl.querySelectorAll('.tcluster')).forEach(function (n) { n.remove(); });
  if (!model || !model.on) return;                               // off = draw NOTHING
  (model.clusters || []).forEach(function (cl) {
    var pos = (typeof layout === 'function') ? layout(cl.anchor) : (layout && layout[cl.anchor]);
    if (!pos) return;                                            // no placement → skip (non-invent)
    var wrap = document.createElement('span');
    wrap.className = 'tcluster ' + cl.kind;
    wrap.style.left = pos.x + 'px'; wrap.style.top = pos.y + 'px';
    wrap.setAttribute('data-anchor', cl.anchor);
    cl.visible.forEach(function (d) {
      var dot = document.createElement('span');
      dot.className = 'tdot ' + d.kind + (d.faded ? ' faded' : '');
      dot.style.setProperty('--c', d.color);
      if (d.kind === 'person') dot.textContent = d.initials;
      dot.title = d.blurb;                                       // hover = readable blurb (§1 grammar)
      if (opts.onDot) dot.addEventListener('click', function () { opts.onDot(d); });
      wrap.appendChild(dot);
    });
    if (cl.badge) {
      var b = document.createElement('span');
      b.className = 'tbadge'; b.textContent = cl.badge;          // +N fan-out cluster
      b.title = cl.count + ' on ' + cl.anchor;
      if (opts.onCluster) b.addEventListener('click', function () { opts.onCluster(cl); });
      wrap.appendChild(b);
    }
    rootEl.appendChild(wrap);
  });
}

var D = {
  colorOf: colorOf, initialsOf: initialsOf,
  recordBlame: recordBlame, personDots: personDots, postitDots: postitDots,
  clusterByAnchor: clusterByAnchor, dotLayerModel: dotLayerModel, renderDotLayer: renderDotLayer
};
if (typeof module === 'object' && module.exports) module.exports = D;
else (typeof self !== 'undefined' ? self : this).TeamsDotLayer = D;
