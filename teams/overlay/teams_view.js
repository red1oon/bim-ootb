// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — TEAMS VIEW LAYER (§8 Outliner: Tree/Chat/Dashboard + canvas markers).
//   TWO clean halves: (1) PURE view-model builders — deterministic, node-testable, NON-INVENT
//   (every field traced to an engine/gate output); (2) a DOM renderer that emits the mock's class
//   names so the existing CSS styles it (browser-only, no-ops in node). Consumes engine.js / gate.js
//   / chatlog.js — never forks them. prompts/RESUME_DISTRIBUTED_BRANCHES.md. Read the log after every run.
'use strict';
var E = (typeof require !== 'undefined') ? require('../engine') : self.TeamsEngine;
var G = (typeof require !== 'undefined') ? require('../gate') : self.TeamsGate;
var L = (typeof require !== 'undefined') ? require('../chatlog') : self.TeamsChatlog;

// ───────────────────────────────────────────────────────────────────────────
// shared: map a ladder color to the mock's css tone token (the ONLY translation;
// no value is invented — an unknown ladder color falls through to a logged default).
//   verified-red→red · verified-orange→orange · verified-green→green · stale→stale · provisional→prov
function cssTone(ladderColor) {
  switch (ladderColor) {
    case 'verified-red':    return 'red';
    case 'verified-orange': return 'orange';
    case 'verified-green':  return 'green';
    case 'stale':           return 'stale';
    case 'provisional':     return 'prov';
    default:                return 'green';
  }
}

// disc-keyed cost rollup over a folded world (derived, NON-INVENT — sums world[*].cost)
function foldCostFromWorld(world, disc) {
  var sum = 0;
  for (var g in world) if (world[g] && world[g].disc === disc) sum += (world[g].cost || 0);
  return sum;
}

// ═══ Half 1 — PURE view-model builders (no DOM, deterministic) ═══════════════

// treeModel: one row per element that received a ladder verdict. owner = blame author (last writer),
//   disc = folded world discipline, color = the ladder's own verdict for that guid (raw, traceable),
//   stale = (color === 'stale'). Ordered by guid for deterministic output.
//   `ops` = the merged op set folded by the settle/ladder (branch + referenced trunk).
function treeModel(ops, ladderResult) {
  ops = ops || [];
  var world = E.fold(ops);
  var bl = E.blame(ops);
  var elem = (ladderResult && ladderResult.elem) || {};
  return Object.keys(elem).sort().map(function (guid) {
    var color = elem[guid];
    return {
      guid: guid,
      owner: bl[guid] != null ? bl[guid] : (world[guid] ? world[guid].owner : null),
      disc: world[guid] ? world[guid].disc : null,
      color: color,
      stale: color === 'stale'
    };
  });
}

// chatModel: thin pass-through to the chatlog projection (the chat IS the signed log). Validate the
//   shape — every line must carry id/author/verb and a verdict — but never rewrite a value.
function chatModel(ops, gateResult) {
  var lines = L.render(ops || [], gateResult);
  if (!Array.isArray(lines)) throw new Error('chatModel: chatlog.render did not return an array');
  lines.forEach(function (ln, i) {
    if (ln.id == null || ln.verb == null || !ln.verdict || ln.verdict.kind == null)
      throw new Error('chatModel: malformed chat line at index ' + i);
  });
  return lines;
}

// dashboardModel: the §8 dashboard view-model.
//   matrix    = disc×disc clash-cell counts (TeamsGate.matrix over the settle clashes)
//   budgets[] = per branch: spent (Σ world cost for its disc) + overRatio (from settleResult.over)
//   freshness[] = per branch: fresh|stale vs the current trunk tip (engine.freshness)
function dashboardModel(settleResult, branches, trunkTip) {
  settleResult = settleResult || {};
  branches = branches || [];
  var world = settleResult.world || {};
  var over = settleResult.over || {};
  var budgets = branches.map(function (b) {
    var disc = (b.scope && b.scope.value) || b.id;
    var row = { branch: b.id, disc: disc, spent: foldCostFromWorld(world, disc),
                overRatio: over[disc] || 0 };
    if (b.baseline != null) row.base = b.baseline;          // only if the branch carries one
    return row;
  });
  var freshness = branches.map(function (b) {
    return { branch: b.id, state: E.freshness(b, trunkTip) };
  });
  return { matrix: G.matrix(settleResult.clashes || []), budgets: budgets, freshness: freshness };
}

// markerModel: canvas markers — one per ladder element, color = the ladder's own verdict (raw).
//   Ordered by guid; count === element count (the NON-INVENT invariant the witness asserts).
function markerModel(ladderResult) {
  var elem = (ladderResult && ladderResult.elem) || {};
  return Object.keys(elem).sort().map(function (guid) {
    return { guid: guid, color: elem[guid] };
  });
}

// ═══ Half 2 — DOM renderer (browser-only; no-ops in node) ════════════════════
// Pure DOM API only (createElement / textContent) — no innerHTML injection of data.

function _el(tag, cls, txt) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = String(txt);
  return e;
}
function _clear(root) { while (root.firstChild) root.removeChild(root.firstChild); }

// renderTree → rows matching `.row .bar .gdot.<tone> .nm .meta` (+ `.row.stale`)
function renderTree(rootEl, treeRows) {
  if (typeof document === 'undefined' || !rootEl) return;
  _clear(rootEl);
  (treeRows || []).forEach(function (r) {
    var row = _el('div', 'row' + (r.stale ? ' stale' : ''));
    row.style.setProperty('--c', 'var(--' + String(r.disc || 'dim').toLowerCase() + ')');
    row.appendChild(_el('span', 'bar'));
    row.appendChild(_el('span', 'gdot ' + cssTone(r.color)));
    row.appendChild(_el('span', 'nm', r.guid));
    row.appendChild(_el('span', 'meta', [r.owner, r.disc].filter(Boolean).join(' · ')));
    rootEl.appendChild(row);
  });
}

// renderChat → lines matching `.cmsg .top .nm/.mono/.t .tx .vb.<kind>`
function renderChat(rootEl, chatLines) {
  if (typeof document === 'undefined' || !rootEl) return;
  _clear(rootEl);
  (chatLines || []).forEach(function (ln) {
    var m = _el('div', 'cmsg');
    m.appendChild(_el('div', 'cav'));
    var body = _el('div');
    var top = _el('div', 'top');
    top.appendChild(_el('span', 'nm', ln.author));
    top.appendChild(_el('span', 'mono', ln.verb));
    top.appendChild(_el('span', 't', ln.ts));
    body.appendChild(top);
    body.appendChild(_el('div', 'tx', ln.msg));
    body.appendChild(_el('span', 'vb ' + ln.verdict.kind, ln.verdict.text));
    m.appendChild(body);
    rootEl.appendChild(m);
  });
}

// renderDashboard → `.mtx .cell.<tone>` matrix + `.rail` budget bars + `.fresh .fr .st.<state>`
function renderDashboard(rootEl, dash) {
  if (typeof document === 'undefined' || !rootEl || !dash) return;
  _clear(rootEl);

  // clash matrix — disciplines from the budgets (deterministic order), cell = count from matrix
  var disc = (dash.budgets || []).map(function (b) { return b.disc; });
  var mtx = _el('div', 'mtx');
  mtx.appendChild(_el('div', 'h'));
  disc.forEach(function (d) { mtx.appendChild(_el('div', 'h', d)); });
  disc.forEach(function (r) {
    mtx.appendChild(_el('div', 'rh', r));
    disc.forEach(function (c) {
      if (c === r) { mtx.appendChild(_el('div', 'cell x', '—')); return; }
      var key = [r, c].sort().join('×');
      var n = dash.matrix[key] || 0;
      mtx.appendChild(_el('div', 'cell ' + (n > 0 ? 'red' : 'green'), n));
    });
  });
  var mc = _el('div', 'card'); mc.appendChild(_el('h4', null, 'Clash matrix · discipline × discipline'));
  mc.appendChild(mtx); rootEl.appendChild(mc);

  // budget rails
  var bc = _el('div', 'card'); bc.appendChild(_el('h4', null, '5D budget vs Project Order'));
  (dash.budgets || []).forEach(function (b) {
    var over = b.overRatio || 0;
    var rail = _el('div', 'rail');
    var lab = _el('div', 'lab');
    lab.appendChild(_el('span', null, b.disc));
    lab.appendChild(_el('b', null, (over > 0 ? '+' + Math.round(over * 100) + '%' : 'on budget')));
    rail.appendChild(lab);
    var track = _el('div', 'track');
    var fill = _el('div', 'fill');
    fill.style.background = over > 0 ? 'var(--orange)' : 'var(--green)';
    fill.style.width = Math.max(0, Math.min(100, 48 + over * 100)) + '%';
    track.appendChild(fill); rail.appendChild(track); bc.appendChild(rail);
  });
  rootEl.appendChild(bc);

  // freshness list
  var fc = _el('div', 'card'); fc.appendChild(_el('h4', null, 'Branch freshness'));
  var fresh = _el('div', 'fresh');
  (dash.freshness || []).forEach(function (f) {
    var fr = _el('div', 'fr');
    fr.appendChild(_el('span', 'sw'));
    fr.appendChild(_el('span', 'nm', f.branch));
    var st = f.state === 'stale' ? 'stale' : 'sync';
    fr.appendChild(_el('span', 'st ' + st, st === 'sync' ? 'in sync' : 'stale'));
    fresh.appendChild(fr);
  });
  fc.appendChild(fresh); rootEl.appendChild(fc);
}

// renderMarkers → SVG `<circle class="mk <tone>">` per marker. `layout` maps guid→{x,y}
//   (object) or is a function(guid,i)→{x,y}; markers with no layout entry are skipped.
function renderMarkers(svgEl, markers, layout) {
  if (typeof document === 'undefined' || !svgEl) return;
  var NS = 'http://www.w3.org/2000/svg';
  // clear prior markers only (leave defs/scene intact)
  Array.prototype.slice.call(svgEl.querySelectorAll('circle.mk')).forEach(function (c) { c.remove(); });
  (markers || []).forEach(function (mk, i) {
    var pos = (typeof layout === 'function') ? layout(mk.guid, i) : (layout && layout[mk.guid]);
    if (!pos) return;
    var c = document.createElementNS(NS, 'circle');
    c.setAttribute('class', 'mk ' + cssTone(mk.color));
    c.setAttribute('cx', pos.x); c.setAttribute('cy', pos.y);
    c.setAttribute('r', pos.r != null ? pos.r : 7);
    c.setAttribute('data-guid', mk.guid);
    svgEl.appendChild(c);
  });
}

var V = {
  cssTone: cssTone,
  treeModel: treeModel, chatModel: chatModel, dashboardModel: dashboardModel, markerModel: markerModel,
  renderTree: renderTree, renderChat: renderChat, renderDashboard: renderDashboard, renderMarkers: renderMarkers
};
if (typeof module === 'object' && module.exports) module.exports = V;
else (typeof self !== 'undefined' ? self : this).TeamsView = V;
