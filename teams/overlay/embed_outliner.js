// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — TEAMS EMBED OUTLINER (RESUME_TEAMS_UI_CONSISTENCY §R3). Renders the embed pane's
//   Outliner using the ONE canonical tab shell (teams_tabs.js) — the SAME blame-Tree / Chat-is-oplog /
//   Dashboard schema as teams/teams.html — so the Teams widget reads identically on both surfaces. Every
//   tab is filled from a fold ALREADY present in the embed (NON-INVENT):
//     • Tree      = per-anchor blame (dot_layer.recordBlame): who LAST touched each doc · action · when.
//     • Chat      = the signed op-log itself (the chat IS the log): author · verb · target · ts.
//     • Dashboard = involvement (erp_optics): who's on each doc + the hot cell.
//   Browser-only (needs document); strict no-op in node. Uses the SAME row/line classes the teams_view
//   renderers emit, so styling is shared, never forked.
'use strict';

var TT = (typeof require === 'function') ? require('./teams_tabs.js') : (typeof self !== 'undefined' ? self : this).TeamsTabs;
var DL = (typeof require === 'function') ? require('./dot_layer.js') : (typeof self !== 'undefined' ? self : this).TeamsDotLayer;

function _el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = String(txt); return e; }

// renderEmbedOutliner(pane, ops, opts) — mount the canonical tabs into `pane` and fill them from `ops`.
//   opts.involvement — optional erp_optics.involvement(ops) result for the Dashboard tab (else derived blank).
//   Returns the tab controller from mountTabs (or null in node).
function renderEmbedOutliner(pane, ops, opts) {
  if (typeof document === 'undefined' || !pane) return null;     // node: no-op
  opts = opts || {};
  ops = ops || [];
  var tabs = TT.mountTabs(pane, TT.CANONICAL_TABS, { active: 'tree' });
  if (!tabs) return null;

  // ── Tree = blame: one row per anchor, who LAST touched it (reuse dot_layer.recordBlame). ──
  var blame = DL.recordBlame(ops, {});
  Object.keys(blame).sort().forEach(function (anchor) {
    var b = blame[anchor];
    var row = _el('div', 'row');
    row.appendChild(_el('span', 'gdot', ''));
    row.appendChild(_el('span', 'nm', anchor));
    row.appendChild(_el('span', 'meta', [b.who, b.action, b.when].filter(function (x) { return x != null; }).join(' · ')));
    tabs.panes.tree.appendChild(row);
  });

  // ── Chat = the op-log itself (ordered by ts,id). Each op is a signed line. ──
  var ordered = ops.slice().sort(function (a, c) { return a.ts !== c.ts ? a.ts - c.ts : (a.id < c.id ? -1 : 1); });
  ordered.forEach(function (op) {
    var m = _el('div', 'cmsg');
    var top = _el('div', 'top');
    top.appendChild(_el('span', 'nm', op.author));
    top.appendChild(_el('span', 'mono', op.verb));
    top.appendChild(_el('span', 't', op.ts));
    m.appendChild(top);
    var p = (op.params || {});
    m.appendChild(_el('div', 'tx', (p.msg != null ? p.msg : op.target)));
    tabs.panes.chat.appendChild(m);
  });
  if (tabs.badges.chat) tabs.badges.chat.textContent = String(ordered.length);

  // ── Dashboard = involvement (who's on each doc + hot cell). ──
  var inv = opts.involvement;
  var dh = _el('h3', null, 'Involvement · who is on each doc'); tabs.panes.dash.appendChild(dh);
  if (inv && inv.hot) inv.hot.forEach(function (h, i) {
    var d = (inv.perDoc && inv.perDoc[h.doc]) || { participants: [] };
    var e = _el('div', 'pe');
    e.appendChild(_el('span', 'd' + (i === 0 ? ' hot' : ''), h.doc));
    e.appendChild(_el('span', 'n', h.count + ' people · ' + d.participants.join(', ')));
    tabs.panes.dash.appendChild(e);
  });

  return tabs;
}

var EO = { renderEmbedOutliner: renderEmbedOutliner };
if (typeof module === 'object' && module.exports) module.exports = EO;
else (typeof self !== 'undefined' ? self : this).TeamsEmbedOutliner = EO;
