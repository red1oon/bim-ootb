// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — TEAMS TAB SHELL (RESUME_TEAMS_UI_CONSISTENCY §R3). ONE tab markup/class set, shared by
//   the standalone Outliner (teams/teams.html) AND the embed pane — never a second tab schema. The canonical
//   markup, copied verbatim from teams.html's tabbed Outliner (blame-Tree / Chat-is-oplog / Dashboard):
//     <div class="tabs"><div class="tab on" data-t="tree">…</div>…</div>
//     <div class="pane" id="pane-tree">…</div> …
//   Switch = toggle `.tab.on` + show/hide `#pane-<id>` (identical to teams.html's `tab()`). The embed mounts
//   this shell inside the host `.bim-panel`, so the Teams Outliner reads as the SAME widget on both surfaces.
//
//   TWO halves: (1) PURE `tabsModel(defs)` — node-testable structural spec (ids, labels, pane ids); (2) a
//   browser `mountTabs(host, defs, opts)` DOM builder (no-op in node). Token-styled (§R4): the active band
//   resolves the host's `--idmp-blue` / `--accent`, never a hardcoded blue. Scoped to the pane (no leak).
//   Witness: teams/tests/tabs_consistent.js (W-TEAMS-TABS — schema parity with teams.html + switch + OFF).
'use strict';

// The canonical tab set — the SAME three tabs (and data-t ids) as teams/teams.html's Outliner.
var CANONICAL_TABS = [
  { id: 'tree', label: '🌳 Tree' },
  { id: 'chat', label: '💬 Chat', badge: true },     // badge = the live count span (class `n`), as in teams.html
  { id: 'dash', label: '📊 Dashboard' }
];

// ═══ Half 1 — PURE structural model (no DOM, deterministic) ════════════════════
// tabsModel(defs) → { tabs:[{id,label,paneId,badge}], paneIds:[…], activeId } — what the DOM builder emits.
function tabsModel(defs, opts) {
  opts = opts || {};
  var d = (defs && defs.length) ? defs : CANONICAL_TABS;
  var tabs = d.map(function (t) { return { id: t.id, label: t.label, paneId: 'pane-' + t.id, badge: !!t.badge }; });
  var activeId = opts.active || (tabs[0] && tabs[0].id) || null;
  return { tabs: tabs, paneIds: tabs.map(function (t) { return t.paneId; }), activeId: activeId };
}

// ═══ Half 2 — DOM builder (browser-only; strict no-op in node) ═════════════════
var _styleInjected = false;
function _injectStyle() {
  if (_styleInjected || typeof document === 'undefined') return;
  if (document.getElementById('teams-tabs-style')) { _styleInjected = true; return; }
  var css =
    '.teams-pane .tabs,.bim-panel .tabs{display:flex;gap:2px;padding:8px 8px 0;border-bottom:1px solid var(--idmp-border,var(--line,#cdd4de));margin:-14px -14px 10px}' +
    '.teams-pane .tab,.bim-panel .tab{padding:6px 10px;font-size:12px;font-weight:600;color:var(--idmp-muted,var(--dim,#6b7681));cursor:pointer;border-radius:6px 6px 0 0;user-select:none}' +
    '.teams-pane .tab.on,.bim-panel .tab.on{color:var(--idmp-blue,var(--accent,#1c5fa8));border-bottom:2px solid var(--idmp-blue,var(--accent,#1c5fa8))}' +
    '.teams-pane .tab .n,.bim-panel .tab .n{display:inline-block;min-width:14px;text-align:center;font-size:10px;background:var(--idmp-sel,#d6e6f7);color:var(--idmp-blue,#1c5fa8);border-radius:8px;padding:0 4px;margin-left:3px}';
  var st = document.createElement('style'); st.id = 'teams-tabs-style'; st.textContent = css;
  document.head.appendChild(st); _styleInjected = true;
}

// mountTabs(host, defs, opts) — build the canonical tab bar + panes into `host`. Returns
//   { bar, panes:{id:el}, badges:{id:el}, show(id), activeId }. opts.active picks the initial tab.
function mountTabs(host, defs, opts) {
  if (typeof document === 'undefined' || !host) return null;     // node: no-op
  opts = opts || {};
  _injectStyle();
  var model = tabsModel(defs, opts);
  var bar = document.createElement('div'); bar.className = 'tabs';
  var panes = {}, badges = {}, tabEls = {};
  model.tabs.forEach(function (t) {
    var tab = document.createElement('div');
    tab.className = 'tab' + (t.id === model.activeId ? ' on' : '');
    tab.setAttribute('data-t', t.id);
    tab.appendChild(document.createTextNode(t.label + (t.badge ? ' ' : '')));
    if (t.badge) { var n = document.createElement('span'); n.className = 'n'; n.textContent = '0'; tab.appendChild(n); badges[t.id] = n; }
    tab.addEventListener('click', function () { show(t.id); });
    bar.appendChild(tab); tabEls[t.id] = tab;
  });
  host.appendChild(bar);
  model.tabs.forEach(function (t) {
    var pane = document.createElement('div'); pane.className = 'pane'; pane.id = t.paneId;
    pane.style.display = (t.id === model.activeId) ? '' : 'none';
    host.appendChild(pane); panes[t.id] = pane;
  });
  function show(id) {                                            // identical behaviour to teams.html tab()
    model.tabs.forEach(function (t) {
      panes[t.id].style.display = (t.id === id) ? '' : 'none';
      tabEls[t.id].classList.toggle('on', t.id === id);
    });
    model.activeId = id;
    if (opts.onShow) opts.onShow(id);
  }
  return { bar: bar, panes: panes, badges: badges, show: show, get activeId() { return model.activeId; } };
}

var TT = { CANONICAL_TABS: CANONICAL_TABS, tabsModel: tabsModel, mountTabs: mountTabs };
if (typeof module === 'object' && module.exports) module.exports = TT;
else (typeof self !== 'undefined' ? self : this).TeamsTabs = TT;
