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

// One row: guid/rule carried via data-rc-guid/data-rc-rule (delegated long-press reads these,
// see _wireRuleChecklistRowEvents below); click → APP.zoomToGuid, exactly like diff.js's row().
function _rcRowHtml(r, colorMap) {
  var color = (colorMap && colorMap[r.severity]) || '#888';
  var guidJs = _rcEscJs(r.guid);
  var name = String(r.name || '').substring(0, 30);
  var html = '<div class="rc-row" data-rc-guid="' + _rcEscAttr(r.guid) + '" data-rc-rule="' + _rcEscAttr(r.rule) + '"' +
    ' onclick="APP.zoomToGuid(\'' + guidJs + '\')"' +
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
  // Clicking the header both expands the list AND frames the WHOLE set in one shot
  // (A.zoomToGuids, diff.js — union-bbox fit, same simple lerp as the single-element zoom, no
  // orbit/pull-back flourish per this codebase's existing click-to-zoom convention). GUIDs are
  // real IFC guids (base64-like, no commas) so a plain comma-join + split round-trips safely.
  var guidList = ruleRows.map(function (r) { return _rcEscJs(r.guid); }).join(',');
  var html = '<div class="rc-ruleset">';
  html += '<div class="rc-ruleset-header" data-rc-rule="' + _rcEscAttr(ruleName) + '"' +
    ' onclick="var b=this.nextElementSibling; b.style.display = (b.style.display===\'none\')?\'block\':\'none\'; this.firstChild.textContent = (b.style.display===\'none\')?\'▸ \':\'▾ \'; if (window.APP && APP.zoomToGuids) APP.zoomToGuids(\'' + guidList + '\'.split(\',\'));"' +
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

  // Row long-press (350ms, cancel-on-move-10px) — event delegation on the panel's row-container
  // div, attached ONCE (not per-row), mirrors viewer/measure.js's clash-row long-press mechanics
  // (lines ~969-1034) exactly: pointerdown arms a 350ms timer, pointermove cancels past 10px
  // (dx²+dy²>100), pointerup/pointercancel clear the timer.
  function _wireRowEvents(panel) {
    var lp = null, fired = false, movedTooFar = false, sx = 0, sy = 0;
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
    panel.addEventListener('pointerup', function () { if (lp) { clearTimeout(lp); lp = null; } });
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
  var STRUCTURAL_RULES_FALLBACK = {
    structural_rules: [
      { name: 'floating_member', applies_to: ['IfcBeam'], tolerance_m: 0.15, framing_dz_m: 0.4 },
      { name: 'span_depth_steel', applies_to: ['IfcBeam'], material: 'steel',
        name_hints: ['UB', 'UC', 'Channel', 'HSS'], cantilever: false,
        warning_ratio: 24, critical_ratio: 30, max_severity: 'WARNING' },
      { name: 'span_depth_concrete', applies_to: ['IfcBeam'], material: 'concrete',
        name_hints: ['Concrete', 'RC'], cantilever: false,
        warning_ratio: 20, critical_ratio: 26, max_severity: 'WARNING' },
      { name: 'span_depth_cantilever', applies_to: ['IfcBeam'], cantilever: true,
        warning_ratio: 12, critical_ratio: 16, max_severity: 'WARNING' },
      { name: 'column_continuity', applies_to: ['IfcColumn'], tolerance_m: 0.3 }
    ]
  };

  A.showStructuralSanity = function () {
    function runWith(rules) {
      if (typeof StructuralSanity === 'undefined' || !A.dbQuery) { console.warn('§STRUCT_SANITY_UNAVAILABLE no evaluator or dbQuery'); return; }
      var rows = StructuralSanity.evaluate(A.dbQuery, rules, { log: console.log });
      A.showRuleChecklist({
        title: 'Structural Sanity', checkId: 'sanity',
        colorMap: { CRITICAL: '#cc4444', WARNING: '#ffaa33', OPTIMIZED: '#44cc44' },
        categories: [
          { label: 'Floating Member', ruleNames: ['floating_member'] },
          { label: 'Span-Depth', ruleNames: ['span_depth_steel', 'span_depth_concrete', 'span_depth_cantilever'] },
          { label: 'Column Continuity', ruleNames: ['column_continuity'] }
        ],
        rows: rows
      });
    }
    if (A._structuralRulesCache) { runWith(A._structuralRulesCache); return; }
    fetch('rates/structural_rules.json').then(function (resp) {
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return resp.json();
    }).then(function (json) {
      A._structuralRulesCache = json;
      console.log('§STRUCT_RULES_JSON loaded=json rules=' + ((json.structural_rules || []).length));
      runWith(json);
    }).catch(function (err) {
      console.warn('§STRUCT_RULES_JSON loaded=fallback error=' + err.message);
      A._structuralRulesCache = STRUCTURAL_RULES_FALLBACK;
      runWith(STRUCTURAL_RULES_FALLBACK);
    });
  };

  // Register the opener for T6's deep-link registry (generic; Egress adds its own key later).
  A._ruleChecklistOpeners.sanity = A.showStructuralSanity;

  // ── EGRESS_SANITY.md T4: A.showEgressSanity() — Egress-SPECIFIC glue, zero new panel code,
  // same shape as A.showStructuralSanity() above (fetch rates/egress_rules.json, hardcoded-
  // fallback pattern mirroring rates.js loadSequenceRules(), same 3 rules copied verbatim from
  // egress_rules.json — never invented numbers). ──
  var EGRESS_RULES_FALLBACK = {
    egress_rules: [
      { name: 'door_clear_width', applies_to: ['IfcDoor'],
        warning_m: 0.85, critical_m: 0.80, max_severity: 'WARNING' },
      { name: 'circulation_distance', applies_to: ['room_graph_node'],
        target: 'exit_or_own_storey_circ', warning_m: 30, critical_m: 45, max_severity: 'WARNING' },
      { name: 'isolated_room', applies_to: ['room_graph_node'], target: 'own_storey_circ' }
    ]
  };

  A.showEgressSanity = function () {
    function runWith(rules) {
      if (typeof EgressSanity === 'undefined' || !A.dbQuery) { console.warn('§EGRESS_UNAVAILABLE no evaluator or dbQuery'); return; }
      // room_graph.js is lazy-loaded (viewer/main.js APP.loadNavigate — 78KB saved on first paint,
      // not a static viewer.html <script>, unlike structural_sanity.js). Rules 2/3 need
      // window.RoomGraph; reuse the SAME existing loader Find/Navigate already use rather than
      // adding a second script-loading path.
      var go = function () {
        var rows = EgressSanity.evaluate(A.dbQuery, rules, { log: console.log });
        A.showRuleChecklist({
          title: 'Egress', checkId: 'egress',
          colorMap: { CRITICAL: '#cc4444', WARNING: '#ffaa33', OPTIMIZED: '#44cc44' },
          categories: [
            { label: 'Isolated Room', ruleNames: ['isolated_room'] },
            { label: 'Circulation Distance', ruleNames: ['circulation_distance'] },
            { label: 'Door Width', ruleNames: ['door_clear_width'] }
          ],
          rows: rows
        });
      };
      if (window.RoomGraph) { go(); return; }
      if (A.loadNavigate) A.loadNavigate().then(go).catch(function (e) { console.warn('§EGRESS_ROOMGRAPH_LOAD_FAIL ' + (e && e.message)); go(); });
      else go(); // defensive — evaluator itself logs §EGRESS_NO_ROOMGRAPH and skips rules 2/3
    }
    if (A._egressRulesCache) { runWith(A._egressRulesCache); return; }
    fetch('rates/egress_rules.json').then(function (resp) {
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return resp.json();
    }).then(function (json) {
      A._egressRulesCache = json;
      console.log('§EGRESS_RULES_JSON loaded=json rules=' + ((json.egress_rules || []).length));
      runWith(json);
    }).catch(function (err) {
      console.warn('§EGRESS_RULES_JSON loaded=fallback error=' + err.message);
      A._egressRulesCache = EGRESS_RULES_FALLBACK;
      runWith(EGRESS_RULES_FALLBACK);
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
    RULE_TINT_MATERIAL_OPTS: RULE_TINT_MATERIAL_OPTS
  };
}
