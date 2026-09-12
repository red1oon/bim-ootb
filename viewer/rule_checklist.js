// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// rule_checklist.js — GENERIC rule-checklist UI chassis (prompts/STRUCTURAL_SANITY.md T3/T5/T6).
// SHARED CHASSIS decision (see STRUCTURAL_SANITY.md "SHARED CHASSIS vs SEPARATE ENGINES"): this
// file carries the severity-grouped panel shape, zoomToGuid click, Mode-tint (color-keyed
// wireframe overlay) and the ?guid=&#check=rule share deep-link — parameterized so a second
// consumer (Egress, prompts/EGRESS_SANITY.md) can reuse every function here with ZERO new UI
// code, only its own rule evaluator + config. NOTHING Sanity-specific belongs in the chassis
// functions themselves (A.showRuleChecklist / A.showRuleModeTint / A.exitRuleModeTint /
// A.buildRuleDeepLink) — Sanity-specific glue (A.showStructuralSanity, the fallback rules
// constant) lives at the bottom of setupRuleChecklist(A), clearly separated.
//
// Browser-only glue file (unlike viewer/structural_sanity.js, which is portable/DOM-free) —
// plain global `function setupRuleChecklist(A) {...}` idiom, same as viewer/clash_narrow.js's
// `function setupClashNarrow(A) {...}`. PRAGMATIC HYBRID for testability: the row-grouping +
// HTML-string-building logic is split into pure, A-free/document-free functions at module scope
// (_buildRuleChecklistHtml, _buildRuleDeepLinkUrl) plus a pure material-config constant
// (RULE_TINT_MATERIAL_OPTS), all exported via module.exports at the bottom so
// tests/test_rule_checklist_panel.js and tests/test_rule_deeplink.js can require() and assert
// against them directly in Node — no jsdom, no live browser needed for that part (per
// STRUCTURAL_SANITY.md T3: "node-level render of the HTML string").
//
// Witnesses: tests/test_rule_checklist_panel.js, tests/test_rule_deeplink.js.

// ── Pure: Mode-tint material config (T5) — MUST match Clash Mode's exactly (measure.js
// A._enterClashMode ~line 1723: `new THREE.MeshBasicMaterial({color, wireframe:true,
// transparent:true, opacity:0.2, depthWrite:false})`). `color` is added per color-group by the
// caller (it varies; these four do not) — see A.showRuleModeTint below.
var RULE_TINT_MATERIAL_OPTS = { wireframe: true, transparent: true, opacity: 0.2, depthWrite: false };

// ── Pure: HTML-escape for a double-quoted HTML attribute / text node ──
function _rcEscAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Pure: escape for embedding inside a single-quoted onclick(...) JS string literal ──
// Same level of care as viewer/diff.js's row() template (guid.replace(/'/g, "\\'")) — not a
// full JS-string escaper, matches existing codebase risk tolerance for GUID-shaped values.
function _rcEscJs(s) {
  return String(s == null ? '' : s).replace(/'/g, "\\'");
}

function _rcBtnStyle(active) {
  return 'padding:4px 8px;border-radius:4px;border:1px solid rgba(255,255,255,0.15);cursor:pointer;font-size:10px;' +
    (active ? 'background:#1565c0;color:#fff' : 'background:rgba(255,255,255,0.05);color:#ccc');
}

// One row: guid/rule/severity carried via data-rc-guid/data-rc-rule/data-rc-severity. NO inline
// onclick — click/selection is delegated through ListKeyNav (_wireRowEvents below), exactly like
// Clash's row list (measure.js/scene.js clashListNav: "ALL clicks route through ListKeyNav so
// anchor/cursor track correctly"), not a per-row handler. Long-press (share) still reads these
// data- attributes via the same delegated listener.
function _rcRowHtml(r, colorMap) {
  var color = (colorMap && colorMap[r.severity]) || '#888';
  var name = String(r.name || '').substring(0, 30);
  var html = '<div class="rc-row" data-rc-guid="' + _rcEscAttr(r.guid) + '" data-rc-rule="' + _rcEscAttr(r.rule) + '" data-rc-severity="' + _rcEscAttr(r.severity) + '"' +
    ' style="padding:4px 6px;margin:2px 0;border-radius:4px;cursor:pointer;border-left:3px solid ' + color +
    ';background:rgba(255,255,255,0.03);transition:background 0.1s"' +
    ' onmouseover="this.style.background=\'rgba(255,255,255,0.08)\'" onmouseout="this.style.background=\'rgba(255,255,255,0.03)\'">';
  html += '<div style="color:' + color + ';font-size:10px;font-weight:600">' + _rcEscAttr(r.severity) + ' &middot; ' + _rcEscAttr(r.rule) + '</div>';
  html += '<div style="font-size:11px;color:#ddd">' + _rcEscAttr(r.ifc_class) + '</div>';
  html += '<div style="font-size:10px;color:#888">' + _rcEscAttr(name) + '</div>';
  if (r.storey) html += '<div style="font-size:9px;color:#666">' + _rcEscAttr(r.storey) + '</div>';
  if (r.ratio !== null && r.ratio !== undefined && !isNaN(r.ratio)) {
    html += '<div style="font-size:9px;color:#666">ratio=' + Number(r.ratio).toFixed(1) + '</div>';
  }
  html += '</div>';
  return html;
}

// ── Pure: prettify a raw rule name for display — 'span_depth_cantilever' -> 'Span Depth Cantilever'.
// Generic (works for Sanity's and Egress's rule names alike), no hardcoded per-rule label table.
function _rcPrettyRule(name) {
  return String(name || '').replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}

// One RULE SET within a severity tier — a rule's flagged elements are ONE finding to grasp, not
// N (§RULE_FILM_SET_PULSE, prompts/MEP_CLASH_REVEAL_MOVIE.md §77, bim-compiler repo: "509
// findings on Hospital are not 509 stories — they are six [rules]"). Collapsed by default,
// STATING THE SET TOTAL OUTRIGHT in the header (not "N of M visible" — there is no "visible"
// concept in a DOM list, but the same principle applies: the count must be graspable without
// expanding). Same click-to-expand mechanic as the old flat group, now one level deeper.
function _rcRuleSetHtml(ruleName, ruleRows, colorMap) {
  if (!ruleRows.length) return '';
  var color = (colorMap && colorMap[ruleRows[0].severity]) || '#888';
  // Header click is EXPAND/COLLAPSE ONLY — same as a Clash category toggle, "nothing during
  // category" (user directive, 2026-09-12). No camera move, no markers: this is a filter/grouping
  // level, not a selection. Selecting actual ITEMS (the rows underneath, once expanded) is what
  // drives the camera — via ListKeyNav, see _wireRowEvents below — matching Clash's own list
  // exactly instead of inventing a second, header-level selection concept.
  var html = '<div class="rc-ruleset">';
  html += '<div class="rc-ruleset-header" data-rc-rule="' + _rcEscAttr(ruleName) + '"' +
    ' onclick="var b=this.nextElementSibling; b.style.display = (b.style.display===\'none\')?\'block\':\'none\'; this.firstChild.textContent = (b.style.display===\'none\')?\'▸ \':\'▾ \';"' +
    ' style="cursor:pointer;font-size:10px;color:' + color + ';margin:3px 0 1px;padding:2px 4px;border-left:3px solid ' + color + ';background:rgba(255,255,255,0.02)">' +
    '<span>▸ </span>' + _rcEscAttr(_rcPrettyRule(ruleName)) + ' &mdash; ' + ruleRows.length + ' flagged</div>';
  html += '<div class="rc-ruleset-body" style="display:none;padding-left:6px">';
  for (var i = 0; i < ruleRows.length; i++) html += _rcRowHtml(ruleRows[i], colorMap);
  html += '</div></div>';
  return html;
}

// One severity group — CRITICAL/WARNING expanded by default, OPTIMIZED collapsed (matches
// clash-panel noise convention per UI MODEL: "only CRITICAL/WARNING expanded"). "Expanded" now
// means the LIST OF RULE SETS is visible (each still collapsed to its own count-only header) —
// the old behaviour dumped every individual element row here, which is exactly the "509 stories"
// spam the bake session independently diagnosed and fixed the same way (group by rule, state the
// total, let the viewer drill in). Collapse toggle is a plain click-to-expand div (no exact
// clash-panel group-collapse precedent found to mirror verbatim — brief allows this fallback).
function _rcGroupHtml(label, sevRows, headerColor, expanded, colorMap) {
  if (!sevRows.length) return '';
  var byRule = {}, ruleOrder = [];
  for (var i = 0; i < sevRows.length; i++) {
    var rn = sevRows[i].rule;
    if (!byRule[rn]) { byRule[rn] = []; ruleOrder.push(rn); }
    byRule[rn].push(sevRows[i]);
  }
  var html = '<div class="rc-group">';
  html += '<div class="rc-group-header" onclick="var b=this.nextElementSibling; b.style.display = (b.style.display===\'none\')?\'block\':\'none\';"' +
    ' style="cursor:pointer;font-size:11px;font-weight:600;color:' + headerColor + ';margin:6px 0 2px">' +
    (expanded ? '▾' : '▸') + ' ' + label + ' (' + sevRows.length + ' across ' + ruleOrder.length + (ruleOrder.length === 1 ? ' set' : ' sets') + ')</div>';
  html += '<div class="rc-group-body" style="display:' + (expanded ? 'block' : 'none') + '">';
  for (var j = 0; j < ruleOrder.length; j++) html += _rcRuleSetHtml(ruleOrder[j], byRule[ruleOrder[j]], colorMap);
  html += '</div></div>';
  return html;
}

// ── Pure: build the full panel HTML string (T3) ──
// config: { title, checkId, colorMap:{CRITICAL,WARNING,OPTIMIZED}, categories:[{label,ruleNames}], rows }
// activeCategory: a category `label` string to filter to, or null/undefined for the "All" view.
// Returns { html, counts:{CRITICAL,WARNING,OPTIMIZED} } — counts are of the (possibly filtered) rows shown.
function _buildRuleChecklistHtml(config, activeCategory) {
  config = config || {};
  var rows = config.rows || [];
  var colorMap = config.colorMap || {};
  var categories = config.categories || [];

  var activeCat = null;
  if (activeCategory) {
    for (var i = 0; i < categories.length; i++) {
      if (categories[i].label === activeCategory) { activeCat = categories[i]; break; }
    }
  }
  var filtered = activeCat
    ? rows.filter(function (r) { return activeCat.ruleNames.indexOf(r.rule) !== -1; })
    : rows;

  // "All" view groups by severity first (UI MODEL) — CRITICAL, then WARNING, then OPTIMIZED.
  // A category-filtered view reuses the same severity-grouped renderer for visual consistency.
  var bySev = { CRITICAL: [], WARNING: [], OPTIMIZED: [] };
  for (var j = 0; j < filtered.length; j++) {
    var r = filtered[j];
    var sev = (r.severity === 'CRITICAL' || r.severity === 'WARNING') ? r.severity : 'OPTIMIZED';
    bySev[sev].push(r);
  }
  var counts = { CRITICAL: bySev.CRITICAL.length, WARNING: bySev.WARNING.length, OPTIMIZED: bySev.OPTIMIZED.length };

  var html = '<div style="color:#4fc3f7;font-weight:bold;margin-bottom:6px">' + _rcEscAttr(config.title || 'Rule Checklist') + '</div>';

  // Toggle buttons: "All" default + one per config.categories entry (UI MODEL).
  html += '<div class="rc-toggles" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px">';
  html += '<button type="button" class="rc-toggle-btn" data-rc-cat="" onclick="APP._setRuleChecklistCategory(null)" style="' + _rcBtnStyle(!activeCat) + '">All</button>';
  for (var k = 0; k < categories.length; k++) {
    var c = categories[k];
    html += '<button type="button" class="rc-toggle-btn" data-rc-cat="' + _rcEscAttr(c.label) + '" onclick="APP._setRuleChecklistCategory(\'' + _rcEscJs(c.label) + '\')" style="' + _rcBtnStyle(activeCat === c) + '">' + _rcEscAttr(c.label) + '</button>';
  }
  // T8.8 — the Report button lives HERE, in the generic chassis, not in either panel's own glue.
  // Both A.showStructuralSanity and A.showEgressSanity render through this function, so one edit
  // gives both panels the button and a third rule panel added later inherits it for free. It
  // exports what the panel is CURRENTLY SHOWING (the filtered rows), so an applied category
  // filter is honoured rather than silently ignored.
  html += '<button type="button" class="rc-report-btn" onclick="APP._downloadRuleReport()" title="Download these findings as JSON" style="' + _rcBtnStyle(false) + ';margin-left:auto">\u2193 Report</button>';
  html += '</div>';

  html += '<div style="margin-top:2px;color:#888;font-size:11px">Click element to zoom &middot; long-press to share</div>';

  html += '<div class="rc-rows" style="margin-top:8px;max-height:50vh;overflow-y:auto;border-top:1px solid #333;padding-top:6px">';
  html += _rcGroupHtml('CRITICAL', bySev.CRITICAL, colorMap.CRITICAL || '#cc4444', true, colorMap);
  html += _rcGroupHtml('WARNING', bySev.WARNING, colorMap.WARNING || '#ffaa33', true, colorMap);
  html += _rcGroupHtml('OPTIMIZED', bySev.OPTIMIZED, colorMap.OPTIMIZED || '#44cc44', false, colorMap);
  if (!filtered.length) html += '<div style="color:#666;font-size:11px;padding:6px 0">No flags.</div>';
  html += '</div>';

  html += '<button type="button" onclick="this.parentElement.style.display=\'none\'" style="margin-top:6px;padding:5px 12px;background:#444;color:#ccc;border:none;border-radius:4px;cursor:pointer;font-size:11px;width:100%">Close</button>';

  return { html: html, counts: counts };
}

// ── Pure: deep-link URL builder (T6) — Node-testable without `location`/`document`. Formula is
// EXACTLY STRUCTURAL_SANITY.md's: origin + pathname + '?guid=' + encodeURIComponent(guid) +
// '#' + checkId + '=' + encodeURIComponent(rule) — note checkId itself is NOT encoded, per spec.
function _buildRuleDeepLinkUrl(p) {
  p = p || {};
  return (p.origin || '') + (p.pathname || '') + '?guid=' + encodeURIComponent(p.guid) +
    '#' + p.checkId + '=' + encodeURIComponent(p.rule);
}

// ── Pure: longest measured distance-to-exit, in steps — the bottom-status-bar headline stat
// (user directive, 2026-09-12: "longest path to exit — ## steps... indicative of the BIM
// capability of our model, not confusing"). Same real ratio (metres) already on every
// circulation_distance row (RoomGraph.escapeRoute()/shortestPath() distance — see
// egress_sanity.js's own header), just the WORST case across the whole evaluated set, converted
// to a step count. 0.75m/step is a standard adult-stride ergonomic convention from OUTSIDE this
// project (no stride-length constant exists anywhere in this codebase to extract) — same
// disclosure discipline as every other uncited number in this PR, labelled "~" (estimate) by the
// caller below, never presented as a measured fact. Returns null (never a fabricated "0 steps")
// when no circulation_distance row exists — mirrors EGRESS_SANITY.md's own "dropped, never 0s /
// 0 steps" contract for the same stat in the movie-bake spec this was modelled on
// (bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §59.4).
function _rcLongestExitSteps(rows) {
  var maxM = null;
  (rows || []).forEach(function (r) {
    if (r.rule !== 'circulation_distance' || r.ratio == null || isNaN(r.ratio)) return;
    if (maxM === null || r.ratio > maxM) maxM = r.ratio;
  });
  return maxM === null ? null : Math.round(maxM / 0.75);
}

// Momentary bottom-status-bar confirmation — same self-clearing convention as dlod_nav.js's own
// _statusMsg ("Auto-clears after 5s ONLY if nothing overwrote it"), reused here rather than a
// second status-message idiom. No-ops (never shows "0 steps") when there is nothing to say.
var _rcStatusClearT = null;
function _rcShowLongestExitStatus(A, rows) {
  if (!A || !A.status) return;
  var steps = _rcLongestExitSteps(rows);
  if (steps === null) return;
  var msg = 'Longest path to exit — ~' + steps + ' steps';
  A.status.textContent = msg;
  if (_rcStatusClearT) clearTimeout(_rcStatusClearT);
  _rcStatusClearT = setTimeout(function () {
    if (A.status.textContent === msg) A.status.textContent = '';
  }, 5000);
}

// ── Browser glue (T3/T4/T5/T6) ──
function setupRuleChecklist(A) {
  'use strict';

  // Registry of checkId -> opener function, so T6's deep-link consumption can reopen the right
  // panel generically (Egress adds `egress: A.showEgressSanity` later with zero edits here).
  A._ruleChecklistOpeners = A._ruleChecklistOpeners || {};

  A._ruleChecklistConfig = null;
  A._ruleChecklistActiveCategory = null;

  function renderPanel() {
    var config = A._ruleChecklistConfig;
    if (!config) return;
    var panel = document.getElementById('rule-checklist-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'rule-checklist-panel';
      panel.style.cssText = 'position:fixed;top:60px;left:16px;z-index:20;background:rgba(0,0,0,0.9);border-radius:8px;padding:12px 16px;border:1px solid rgba(255,255,255,0.1);backdrop-filter:blur(8px);font-size:12px;color:#ccc;min-width:240px;max-width:320px;max-height:70vh;display:flex;flex-direction:column';
      document.body.appendChild(panel);
      _wireRowEvents(panel);
    }
    var result = _buildRuleChecklistHtml(config, A._ruleChecklistActiveCategory);
    panel.innerHTML = result.html;
    panel.style.display = 'flex';
    console.log('§RULE_CHECKLIST checkId=' + config.checkId + ' category=' + (A._ruleChecklistActiveCategory || 'All') +
      ' critical=' + result.counts.CRITICAL + ' warning=' + result.counts.WARNING + ' optimized=' + result.counts.OPTIMIZED);
  }

  // ── T8.2/T8.8: Report download — GENERIC, driven entirely by the open panel's own config.
  // Nothing Sanity- or Egress-specific here: each panel puts `rulesUsed`/`rulesSource` (and
  // Egress its captured `roomGraph` facts) into the config it already passes to
  // A.showRuleChecklist, and this reads them back. A third rule panel gets Report for free.
  //
  // ⚠ It exports the FILTERED rows — what the panel is currently showing — so a category the
  // user has clicked is honoured, not silently ignored (T8.8). Download convention is the one
  // already in the tree at variation_order.js ~267: Blob -> a.download -> revokeObjectURL, plus
  // a §-tagged console line.
  A._downloadRuleReport = function () {
    var config = A._ruleChecklistConfig;
    if (!config) { console.warn('§RULE_REPORT_UNAVAILABLE no panel open'); return null; }
    if (typeof RuleReport === 'undefined') { console.warn('§RULE_REPORT_UNAVAILABLE rule_report.js not loaded'); return null; }
    // T8.12 — the panel renders WITHOUT witness (evidence is dead weight in a list you scroll).
    // An explicit export is the moment it earns its cost, so re-run the same evaluator with
    // witness:true here. Additive by construction — R12 asserts the counts do not move — so the
    // re-run cannot disagree with the panel above it. Falls back to the displayed rows if the
    // evaluator is unreachable, and says which it used in the § line.
    var rows = config.rows || [], witnessed = false;
    try {
      if (config.rulesUsed && A.dbQuery) {
        if (config.checkId === 'sanity' && typeof StructuralSanity !== 'undefined') {
          rows = StructuralSanity.evaluate(A.dbQuery, config.rulesUsed, { log: function () {}, witness: true }) || rows;
          witnessed = true;
        } else if (config.checkId === 'egress' && typeof EgressSanity !== 'undefined') {
          rows = EgressSanity.evaluate(A.dbQuery, config.rulesUsed, { log: function () {}, witness: true }) || rows;
          witnessed = true;
        }
      }
    } catch (e) { console.warn('§RULE_REPORT_WITNESS_FAIL ' + e.message + ' — exporting the displayed rows without evidence'); rows = config.rows || []; }
    var cat = A._ruleChecklistActiveCategory;
    if (cat) {
      var hit = (config.categories || []).filter(function (c) { return c.label === cat; })[0];
      if (hit) rows = rows.filter(function (r) { return hit.ruleNames.indexOf(r.rule) !== -1; });
    }
    var report = RuleReport.buildRuleReport({
      rows: rows,
      ruleDefs: config.rulesUsed ? [config.rulesUsed] : [],
      meta: {
        building: A.activeBuilding, db: A.activeBuilding,
        swVersion: (A._swCacheVersion || null),
        rulesSource: config.checkId === 'egress'
          ? { egress: config.rulesSource || 'unknown' }
          : { structural: config.rulesSource || 'unknown' },
        roomGraph: config.roomGraph || null,
        rulesOverlay: config.rulesOverlay || null,
        rulesProvenance: config.rulesProvenance || [],
        longestExitSteps: _rcLongestExitSteps(rows),
        // T8.11 — the panel has A.dbQuery, so it can review its own input the same way the CLI
        // does. Probes are read-only counts over elements_meta/element_transforms/
        // spatial_structure; if dbQuery is missing the section reports null, never "all clear".
        sufficiency: A.dbQuery ? RuleReport.runSufficiencyProbes(A.dbQuery, { log: console.log }) : null,
        populations: A.dbQuery ? RuleReport.rulePopulations(A.dbQuery) : null
      }
    });
    try {
      var blob = new Blob([RuleReport.toJson(report)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'RuleReport_' + (config.checkId || 'rules') + '_' + (A.activeBuilding || 'building') +
        '_' + new Date().toISOString().split('T')[0] + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { console.warn('§RULE_REPORT_DOWNLOAD_FAIL ' + e.message); }
    console.log('§RULE_REPORT checkId=' + config.checkId + ' category=' + (cat || 'All') +
      ' findings=' + report.totals.findings + ' rules=' + report.totals.rules +
      ' witness=' + (witnessed ? report.totals.withWitness : 'off') +
      ' rulesSource=' + JSON.stringify(report.rulesSource) +
      ' roomGraph=' + (report.roomGraph ? JSON.stringify(report.roomGraph) : 'null'));
    return report;
  };

  // Only VISIBLE rows are real ListKeyNav items — a row inside a collapsed rule-set (display:none
  // ancestor) is not on screen and must not be selectable/counted, unlike Clash's flat list which
  // has no per-row collapse to account for.
  function _rcVisibleRows(panel) {
    return Array.from(panel.querySelectorAll('[data-rc-guid]')).filter(function (el) {
      return el.offsetParent !== null;
    });
  }

  // Selection → camera/highlight, mirroring Clash's clashListNav onToggle EXACTLY (scene.js
  // ~line 2247): single item -> A.zoomToGuid (fly to it, as before); MULTIPLE items -> the
  // whole-set treatment — but using A.showRuleModeTint's real-shape wireframe instead of Clash's
  // dot spheres (a Sanity/Egress finding's own SHAPE is the point, a clash's point-of-intersection
  // has none — see A.zoomToGuids' own header in diff.js) plus the same pull-back camera move.
  function _rcOnSelect(guids) {
    guids = (guids || []).filter(Boolean);
    if (!guids.length) return;
    if (guids.length === 1) { if (A.zoomToGuid) A.zoomToGuid(guids[0]); return; }
    var cfg = A._ruleChecklistConfig;
    var colorMap = (cfg && cfg.colorMap) || {};
    var panel = document.getElementById('rule-checklist-panel');
    var map = {};
    if (panel) {
      guids.forEach(function (g) {
        var el = panel.querySelector('[data-rc-guid="' + g.replace(/"/g, '') + '"]');
        if (el) map[g] = el.getAttribute('data-rc-severity');
      });
    }
    if (A.showRuleModeTint) A.showRuleModeTint(map, colorMap);
    if (A.zoomToGuids) A.zoomToGuids(guids);
  }

  // Row long-press (350ms, cancel-on-move-10px, share deep-link) + click/selection, both event-
  // delegated on the panel's row-container div, attached ONCE (not per-row) — mirrors viewer/
  // measure.js's clash-row mechanics exactly (lines ~969-1034): pointerdown arms a 350ms long-
  // press timer, pointermove cancels past 10px (dx²+dy²>100), a quick tap (no long-press fired,
  // no move) routes through ListKeyNav's onClick so single/multi-select stay consistent with
  // Clash's own list instead of a bespoke per-row handler.
  function _wireRowEvents(panel) {
    var lp = null, fired = false, movedTooFar = false, sx = 0, sy = 0;
    var nav = (typeof window.makeListKeyNav === 'function')
      ? window.makeListKeyNav(
          function () { return _rcVisibleRows(panel); },
          function (indices) {
            var items = _rcVisibleRows(panel);
            _rcOnSelect(indices.map(function (i) { return items[i] && items[i].getAttribute('data-rc-guid'); }));
          },
          function (idx) {
            var items = _rcVisibleRows(panel);
            if (items[idx]) _rcOnSelect([items[idx].getAttribute('data-rc-guid')]);
          }
        )
      : null;
    if (nav && typeof window._registerPanel === 'function') {
      window._registerPanel('rule-checklist', panel, nav, function () { panel.style.display = 'none'; });
    }

    panel.addEventListener('pointerdown', function (ev) {
      var target = ev.target.closest('[data-rc-guid]');
      if (!target) return;
      fired = false; movedTooFar = false; sx = ev.clientX; sy = ev.clientY;
      lp = setTimeout(function () {
        if (movedTooFar) return;
        fired = true; lp = null;
        var guid = target.getAttribute('data-rc-guid');
        var rule = target.getAttribute('data-rc-rule');
        target.style.background = 'rgba(79,195,247,0.3)';
        setTimeout(function () { target.style.background = ''; }, 200);
        var cfg = A._ruleChecklistConfig;
        if (A.buildRuleDeepLink && cfg) A.buildRuleDeepLink({ guid: guid, checkId: cfg.checkId, rule: rule });
      }, 350);
    });
    panel.addEventListener('pointermove', function (ev) {
      if (!lp) return;
      var dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (dx * dx + dy * dy > 100) { movedTooFar = true; clearTimeout(lp); lp = null; }
    });
    panel.addEventListener('pointerup', function (ev) {
      if (lp) { clearTimeout(lp); lp = null; }
      if (fired || movedTooFar) return; // long-press already handled it, or it was a scroll
      var target = ev.target.closest('[data-rc-guid]');
      if (!target || !nav) return;
      var items = _rcVisibleRows(panel);
      var idx = items.indexOf(target);
      if (idx >= 0) nav.onClick(idx, ev);
    });
    panel.addEventListener('pointercancel', function () { if (lp) { clearTimeout(lp); lp = null; } });
  }

  // ── T3: A.showRuleChecklist(config[, activeCategory]) — GENERIC, config-driven, no
  // Sanity-hardcoding. Egress calls this with its own config (title/checkId/categories/rows),
  // zero new UI code (EGRESS_SANITY.md "UI — zero new UI code, generic chassis").
  A.showRuleChecklist = function (config, activeCategory) {
    A._ruleChecklistConfig = config;
    A._ruleChecklistActiveCategory = activeCategory || null;
    renderPanel();
  };

  // Toggle-button target (referenced from the HTML built by _buildRuleChecklistHtml).
  A._setRuleChecklistCategory = function (label) {
    A._ruleChecklistActiveCategory = label || null;
    renderPanel();
  };

  // ── T5: GENERIC Mode-tint — {guid: severity} map + a severity->color lookup. Mirrors Clash
  // Mode's technique (measure.js A._enterClashMode) EXACTLY (same InstancedMesh/MeshBasicMaterial
  // config, RULE_TINT_MATERIAL_OPTS above), but: (a) grouped by colorMap[severity] instead of
  // A.DISC_COLORS[discipline], and (b) only for the GUIDs present in guidSeverityMap — Clash Mode
  // tints the whole building, Sanity/Egress mode tints only the flagged subset. Because of (b),
  // only the FLAGGED elements' own streamed geometry is hidden (not the whole scene) — the rest
  // of the building stays visible for context.
  A._ruleTintMeshes = A._ruleTintMeshes || [];
  A._ruleTintActive = false;

  A.showRuleModeTint = function (guidSeverityMap, colorMap) {
    if (!A.scene || !A.dbQuery || typeof THREE === 'undefined') { console.warn('§RULE_TINT no scene/dbQuery/THREE'); return; }
    if (A._ruleTintActive) A.exitRuleModeTint();
    guidSeverityMap = guidSeverityMap || {};
    colorMap = colorMap || {};
    var guids = Object.keys(guidSeverityMap);
    if (!guids.length) { console.warn('§RULE_TINT no guids to tint'); return; }

    var guidSet = {};
    guids.forEach(function (g) { guidSet[g] = true; });
    A.collectMeshes(function (o) {
      return (o.isMesh || o.isInstancedMesh || o.isBatchedMesh || o.isLineSegments) &&
        o.userData && guidSet[o.userData.guid];
    }).forEach(function (o) {
      o.userData._ruleTintHidden = true;
      o.visible = false;
    });

    // Query bbox rows for just the flagged guids, chunked by ~900 per IN-clause (same pattern as
    // viewer/diff.js A._diffToVoRows ~line 308).
    var rowsByGuid = {};
    for (var i = 0; i < guids.length; i += 900) {
      var chunk = guids.slice(i, i + 900);
      var ph = chunk.map(function () { return '?'; }).join(',');
      var rows;
      try {
        rows = A.dbQuery('SELECT guid, center_x, center_y, center_z, bbox_x, bbox_y, bbox_z FROM element_transforms WHERE guid IN (' + ph + ')', chunk);
      } catch (e) { console.warn('§RULE_TINT query err ' + e.message); rows = []; }
      rows.forEach(function (r) { rowsByGuid[r[0]] = r; });
    }

    var byColor = {};
    guids.forEach(function (g) {
      var row = rowsByGuid[g];
      if (!row) return;
      var color = colorMap[guidSeverityMap[g]] || '#888888';
      (byColor[color] = byColor[color] || []).push(row);
    });

    var geo = new THREE.BoxGeometry(1, 1, 1);
    var _m4 = new THREE.Matrix4(), _pos = new THREE.Vector3(), _scl = new THREE.Vector3(), _quat = new THREE.Quaternion();
    A._ruleTintMeshes = [];
    var total = 0;
    for (var color in byColor) {
      var crows = byColor[color];
      var matOpts = Object.assign({ color: color }, RULE_TINT_MATERIAL_OPTS);
      var mat = new THREE.MeshBasicMaterial(matOpts);
      var iMesh = new THREE.InstancedMesh(geo, mat, crows.length);
      iMesh.frustumCulled = false;
      iMesh.renderOrder = -1;
      iMesh.userData.isRuleTintBbox = true;
      for (var j = 0; j < crows.length; j++) {
        var r = crows[j];
        var p = A.ifc2three(r[1], r[2], r[3]);
        var bx = r[4] || 0.3, by = r[5] || 0.3, bz = r[6] || 0.3;
        _pos.set(p.x, p.y, p.z);
        _scl.set(bx, bz, by);
        _m4.compose(_pos, _quat, _scl);
        iMesh.setMatrixAt(j, _m4);
      }
      iMesh.instanceMatrix.needsUpdate = true;
      A.scene.add(iMesh);
      A._ruleTintMeshes.push(iMesh);
      total += crows.length;
    }

    A._ruleTintActive = true;
    console.log('§RULE_TINT_ENTER elements=' + total + ' colors=' + Object.keys(byColor).length);
    if (A.markDirty) A.markDirty();
  };

  A.exitRuleModeTint = function () {
    if (!A._ruleTintActive) return;
    (A._ruleTintMeshes || []).forEach(function (m) {
      A.scene.remove(m);
      if (m.material) m.material.dispose();
    });
    if (A._ruleTintMeshes.length) A._ruleTintMeshes[0].geometry.dispose();
    A._ruleTintMeshes = [];

    // Restore hidden geometry — mirrors A._exitClashMode's restore logic (measure.js).
    A.collectMeshes(function (o) { return o.userData && o.userData._ruleTintHidden; }).forEach(function (o) {
      delete o.userData._ruleTintHidden;
      var storeyOk = A._storeyVisible ? A._storeyVisible(o.userData.storey) : true;
      var discOk = A.hiddenDiscs ? !A.hiddenDiscs.has(o.userData.disc) : true;
      o.visible = storeyOk && discOk;
    });

    A._ruleTintActive = false;
    console.log('§RULE_TINT_EXIT');
    if (A.markDirty) A.markDirty();
  };

  // ── T6: GENERIC share deep-link — {guid, checkId, rule} -> builds the URL, calls the EXISTING
  // A.shareUrl(url, title) (viewer/share.js, reused as-is, not reimplemented).
  A.buildRuleDeepLink = function (opts) {
    opts = opts || {};
    var url = _buildRuleDeepLinkUrl({
      origin: location.origin, pathname: location.pathname,
      guid: opts.guid, checkId: opts.checkId, rule: opts.rule
    });
    var title = (opts.checkId || 'Rule') + ' — ' + opts.rule;
    if (A.shareUrl) A.shareUrl(url, title);
    return url;
  };

  // ── T6 (continued): consume ?guid=&#checkId=rule ON LOAD. ⚠ CORRECTION to
  // STRUCTURAL_SANITY.md's own claim (§ line ~223-226): sitecam.js only ever BUILDS a ?guid= URL
  // (QR-code share, line ~300) — nothing in the codebase parses ?guid= on load. The real existing
  // precedent for "parse a URL param once geometry is ready and act on it" is viewer/config.js
  // A.FIND_GUID (`_params.get('find')`) consumed by viewer/hba_lens.js's own poll (~line 1122):
  // setInterval every 500ms gated on `A.guidMap && Object.keys(A.guidMap).length > 0 &&
  // !A.streaming`, capped at 240 tries (~120s) with a timeout warning. Mirrored here, generically
  // (checkId dispatched via the A._ruleChecklistOpeners registry, not hardcoded to 'sanity').
  try {
    var _rcParams = new URLSearchParams(location.search);
    var _rcGuid = _rcParams.get('guid');
    var _rcHash = (location.hash || '').replace(/^#/, '');
    var _rcCheckId = null, _rcRule = null;
    if (_rcHash) {
      var eq = _rcHash.indexOf('=');
      if (eq > 0) {
        _rcCheckId = decodeURIComponent(_rcHash.slice(0, eq));
        _rcRule = decodeURIComponent(_rcHash.slice(eq + 1));
      }
    }
    if (_rcGuid || _rcCheckId) {
      var _rcTries = 0;
      var _rcPoll = setInterval(function () {
        _rcTries++;
        var hasMesh = A.guidMap && Object.keys(A.guidMap).length > 0;
        if (!hasMesh || A.streaming) {
          if (_rcTries > 240) { clearInterval(_rcPoll); console.warn('§RULE_DEEPLINK_TIMEOUT guid=' + _rcGuid + ' checkId=' + _rcCheckId + ' rule=' + _rcRule); }
          return;
        }
        clearInterval(_rcPoll);
        console.log('§RULE_DEEPLINK guid=' + _rcGuid + ' checkId=' + _rcCheckId + ' rule=' + _rcRule);
        if (_rcGuid && A.zoomToGuid) A.zoomToGuid(_rcGuid);
        if (_rcCheckId && A._ruleChecklistOpeners[_rcCheckId]) {
          A._ruleChecklistOpeners[_rcCheckId]();
          if (_rcRule) {
            setTimeout(function () {
              var cfg = A._ruleChecklistConfig;
              if (!cfg || !cfg.categories) return;
              var cat = cfg.categories.filter(function (c) { return c.ruleNames.indexOf(_rcRule) !== -1; })[0];
              if (cat) A._setRuleChecklistCategory(cat.label);
            }, 0);
          }
        }
      }, 500);
    }
  } catch (e) { console.warn('§RULE_DEEPLINK_ERR ' + e.message); }

  // ── T4.3: A.showStructuralSanity() — Sanity-SPECIFIC glue (kept out of the generic chassis
  // functions above, and out of viewer/structural_sanity.js which stays DOM-free/portable per
  // brief). Loads viewer/rates/structural_rules.json via fetch, hardcoded-fallback pattern
  // mirroring viewer/rates.js loadSequenceRules() (fetch → apply; on any failure, fall back to
  // the SAME 5 rules already in structural_rules.json, copied verbatim, never invented numbers).
  // T8.13 §RULE_FALLBACK_ONE_SOURCE — the STRUCTURAL_RULES_FALLBACK constant that used to sit
  // here is GONE. It is now StructuralSanity.FALLBACK_RULES, in the module that owns the rule
  // semantics, because a second copy here is what let the film branch ship span_depth_concrete
  // 20/26 against main's cited 16/21. Handed to this session by the movie-bake session, which
  // found the two copies and (correctly, within its own branch) reported them identical.

  // T8.13 — the ONE place the viewer decides which rules file ran. Caches the answer on A so a
  // second panel open (or the Report button) reports the same source it actually used, and
  // exposes it as A._<kind>RulesSource for the report's provenance header. Returns the shape
  // RuleReport.loadRules defines: { rules, source, url, error }.
  var RULE_SETS = {
    structural: { url: 'rates/structural_rules.json', cache: '_structuralRulesCache', src: '_structuralRulesSource',
                  fallback: function () { return (typeof StructuralSanity !== 'undefined') ? StructuralSanity.FALLBACK_RULES : { structural_rules: [] }; } },
    egress:     { url: 'rates/egress_rules.json', cache: '_egressRulesCache', src: '_egressRulesSource',
                  fallback: function () { return (typeof EgressSanity !== 'undefined') ? EgressSanity.FALLBACK_RULES : { egress_rules: [] }; } }
  };

  // T8.14 — which jurisdiction's overlay to apply, selected EXACTLY the way rates.js already
  // selects its 16 cost packs: a URL param, else the stored pack, else none. Reusing that key
  // (`bim_5d_pack`) deliberately — a user who has chosen cidb2024_my for costs has stated their
  // jurisdiction once, and asking again in a second registry is how the two drift apart. Returns
  // null when nothing is selected, which is the ordinary case and NOT an error.
  function _rcOverlayId() {
    try {
      var p = new URLSearchParams(window.location.search).get('rules');
      if (p) return p;
    } catch (e) { /* no location (test/headless) — fall through */ }
    try { return localStorage.getItem('bim_5d_pack') || null; } catch (e) { return null; }
  }

  function _rcLoadRules(kind) {
    var cfg = RULE_SETS[kind];
    if (A[cfg.cache]) {
      return Promise.resolve({ rules: A[cfg.cache], source: A[cfg.src] || 'unknown', url: cfg.url, error: null,
        overlay: A._ruleOverlay || null, provenance: A._ruleProvenance || [] });
    }
    var fb = cfg.fallback();
    var oid = _rcOverlayId();
    var opts = oid ? { overlayUrl: 'rates/' + kind + '_rules_' + oid + '.json', overlayId: oid, log: console.log }
                   : { log: console.log };
    var go = (typeof RuleReport !== 'undefined')
      ? RuleReport.loadRules(typeof fetch === 'function' ? fetch.bind(window) : null, cfg.url, fb, opts)
      : Promise.resolve({ rules: fb, source: 'fallback', url: cfg.url, error: 'rule_report.js not loaded', overlay: null, provenance: [] });
    return go.then(function (r) {
      A[cfg.cache] = r.rules; A[cfg.src] = r.source;
      A._ruleOverlay = r.overlay || null; A._ruleProvenance = r.provenance || [];
      return r;
    });
  }

  A.showStructuralSanity = function () {
    // T8.4 — `fetched` vs `fallback` must reach the report. The §STRUCT_RULES_JSON line already
    // draws that distinction for the log; this carries the SAME fact into the config so a
    // downloaded report can never present the fallback constant above as an authored threshold.
    function runWith(rules, source) {
      if (typeof StructuralSanity === 'undefined' || !A.dbQuery) { console.warn('§STRUCT_SANITY_UNAVAILABLE no evaluator or dbQuery'); return; }
      var rows = StructuralSanity.evaluate(A.dbQuery, rules, { log: console.log });
      A.showRuleChecklist({
        title: 'Structural Sanity', checkId: 'sanity',
        rulesUsed: rules, rulesSource: source || 'unknown',
        rulesOverlay: A._ruleOverlay || null, rulesProvenance: A._ruleProvenance || [],
        colorMap: { CRITICAL: '#cc4444', WARNING: '#ffaa33', OPTIMIZED: '#44cc44' },
        categories: [
          { label: 'Floating Member', ruleNames: ['floating_member'] },
          { label: 'Span-Depth', ruleNames: ['span_depth_steel', 'span_depth_concrete', 'span_depth_cantilever'] },
          { label: 'Column Continuity', ruleNames: ['column_continuity'] }
        ],
        rows: rows
      });
    }
    if (A._structuralRulesCache) { runWith(A._structuralRulesCache, A._structuralRulesSource); return; }
    // T8.13 — ONE mechanism for "which rules file ran", shared with the film and the report.
    // The §STRUCT_RULES_JSON line is kept for log continuity; the fact now also travels as DATA.
    _rcLoadRules('structural').then(function (r) {
      console.log('§STRUCT_RULES_JSON loaded=' + (r.source === 'fetched' ? 'json' : 'fallback') +
        ' rules=' + ((r.rules.structural_rules || []).length) + (r.error ? ' error=' + r.error : ''));
      runWith(r.rules, r.source);
    });
  };

  // Register the opener for T6's deep-link registry (generic; Egress adds its own key later).
  A._ruleChecklistOpeners.sanity = A.showStructuralSanity;

  // ── EGRESS_SANITY.md T4: A.showEgressSanity() — Egress-SPECIFIC glue, zero new panel code,
  // same shape as A.showStructuralSanity() above (fetch rates/egress_rules.json, hardcoded-
  // fallback pattern mirroring rates.js loadSequenceRules(), same 3 rules copied verbatim from
  // egress_rules.json — never invented numbers). ──
  // T8.13 — EGRESS_RULES_FALLBACK likewise removed; see EgressSanity.FALLBACK_RULES.

  A.showEgressSanity = function () {
    function runWith(rules, source) {
      if (typeof EgressSanity === 'undefined' || !A.dbQuery) { console.warn('§EGRESS_UNAVAILABLE no evaluator or dbQuery'); return; }
      // room_graph.js is lazy-loaded (viewer/main.js APP.loadNavigate — 78KB saved on first paint,
      // not a static viewer.html <script>, unlike structural_sanity.js). Rules 2/3 need
      // window.RoomGraph; reuse the SAME existing loader Find/Navigate already use rather than
      // adding a second script-loading path.
      var go = function () {
        var rows = EgressSanity.evaluate(A.dbQuery, rules, { log: console.log });
        // T8.4 — §ROOM_GRAPH_EXITS's own numbers (exits / noRaster / doors). The evaluator calls
        // RoomGraph.buildGraph with its log SILENCED, so that line never reaches console here;
        // build it once more with a CAPTURING log purely to read the facts. buildGraph is
        // deterministic on the same dbQuery, so this observes the same graph the rules used — it
        // does not change any count. Null (with a stated reason in the report) if it cannot run.
        var rgFacts = null;
        try {
          if (window.RoomGraph && typeof RuleReport !== 'undefined') {
            var capt = [];
            window.RoomGraph.buildGraph(A.dbQuery, { log: function (m) { capt.push(m); } });
            rgFacts = RuleReport.parseRoomGraphExits(capt);
          }
        } catch (e) { console.warn('§RULE_REPORT_ROOMGRAPH_FACTS_FAIL ' + e.message); }
        A.showRuleChecklist({
          title: 'Egress', checkId: 'egress',
          rulesUsed: rules, rulesSource: source || 'unknown',
        rulesOverlay: A._ruleOverlay || null, rulesProvenance: A._ruleProvenance || [], roomGraph: rgFacts,
          colorMap: { CRITICAL: '#cc4444', WARNING: '#ffaa33', OPTIMIZED: '#44cc44' },
          categories: [
            { label: 'Isolated Room', ruleNames: ['isolated_room'] },
            { label: 'Circulation Distance', ruleNames: ['circulation_distance'] },
            { label: 'Door Width', ruleNames: ['door_clear_width'] }
          ],
          rows: rows
        });
        _rcShowLongestExitStatus(A, rows);
      };
      if (window.RoomGraph) { go(); return; }
      if (A.loadNavigate) A.loadNavigate().then(go).catch(function (e) { console.warn('§EGRESS_ROOMGRAPH_LOAD_FAIL ' + (e && e.message)); go(); });
      else go(); // defensive — evaluator itself logs §EGRESS_NO_ROOMGRAPH and skips rules 2/3
    }
    if (A._egressRulesCache) { runWith(A._egressRulesCache, A._egressRulesSource); return; }
    _rcLoadRules('egress').then(function (r) {
      console.log('§EGRESS_RULES_JSON loaded=' + (r.source === 'fetched' ? 'json' : 'fallback') +
        ' rules=' + ((r.rules.egress_rules || []).length) + (r.error ? ' error=' + r.error : ''));
      runWith(r.rules, r.source);
    });
  };
  A._ruleChecklistOpeners.egress = A.showEgressSanity;
}

// Pragmatic hybrid export (see file header): plain global `setupRuleChecklist(A)` for the
// browser, plus these pure sub-functions exported for Node testing.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildRuleChecklistHtml: _buildRuleChecklistHtml,
    buildRuleDeepLinkUrl: _buildRuleDeepLinkUrl,
    RULE_TINT_MATERIAL_OPTS: RULE_TINT_MATERIAL_OPTS,
    longestExitSteps: _rcLongestExitSteps
  };
}
