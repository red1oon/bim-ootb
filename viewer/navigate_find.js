/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// navigate_find.js — S233 Section A: Find Panel
// Extracted from navigate.js. Interface: NavigateFind.init(A, nav, getStartNavigation)
// navigate_find.js reads: A.db, A.activeBuilding, A.scene, A.inputWasVoice,
//   A.walkModeActive, A.status, A.ifc2three, A.findMeshByGuid, A.buildingCentres
// navigate_find.js calls: A.stopNavigation, A.clearRouteCache (set by navigate.js)
// navigate_find.js exposes: A.openFindPanel, A.closeFindPanel, A.clearHighlight
// Witness: W-NAV

(function() {
  'use strict';

  function init(A, nav, getStartNavigation) {

    // ── S275: CSS — slim accordion layout ──
    var style = document.createElement('style');
    style.textContent = [
      // §FIND-PANEL-FIX (2026-07-11): self-contained position:fixed + display:none fallback.
      // .bim-panel (viewer.html) already sets position:fixed but NOT display:none, and
      // appendChild(panel) below runs before any toggle logic sets display — so the panel was
      // a plain visible block the instant it hit the DOM (the untraced §FIND_VIS_TRACE
      // "appears on its own at onset" bug, open since 2026-07-06). Every sibling panel avoids
      // this: wizard.js self-declares position, panels.js A.createPanel() explicitly hides on
      // creation. Do not drop this rule even if .bim-panel is later revisited.
      // §FIND-PANEL-FIX part 2 — "above browser top border": this rule used to center via
      // `top:50%; transform:translateY(-50%)`. panels.js §PANEL-AUTOPLACE fires on the panel's
      // first style mutation (init-time, _makeDraggable's cursor write, inline display '' ≠
      // 'none') and overwrites top to 54px inline — but never clears the CSS transform, so the
      // panel rendered translateY(-50%) ABOVE top:54 (measured top=-101.5 at height 311 on a
      // 1400×900 desktop — witness_find_panel_hidden_onload_2026-07-11.js). The centered look
      // never survived autoplace anyway, so declare top:54 (autoplace's own default) with NO
      // transform. The ≤600px media query below already sets its own top:60/transform:none.
      '#find-panel { position: fixed; top: 54px; right: 70px;',
      '  width: 280px; max-width: 35vw; padding: 0; max-height: 88vh; overflow: hidden; display: none; }',
      // Search bar
      '#find-panel .find-search-bar {',
      '  display: flex; align-items: center; gap: 4px; padding: 8px 10px 6px;',
      '  border-bottom: 1px solid rgba(255,255,255,0.08);',
      '}',
      '#find-panel .find-search-bar button { background: none; border: none; color: #888;',
      '  cursor: pointer; padding: 4px; flex-shrink: 0; display: flex; align-items: center; }',
      '#find-panel .find-search-bar button:hover { color: #4fc3f7; }',
      '#find-panel .find-search-bar button.listening { color: #f44336; }',
      '#find-panel .find-search-bar button svg { width: 16px; height: 16px; pointer-events: none; }',
      '#find-panel #find-name {',
      '  flex: 1; border: none; background: transparent; color: #e0e0e0;',
      '  font-size: 13px; outline: none; padding: 2px 0;',
      '  font-family: system-ui, sans-serif;',
      '}',
      '#find-panel #find-name::placeholder { color: rgba(255,255,255,0.25); }',
      // Accordion rows — collapsed = single line, expanded = scrollable list
      '.find-acc-row {',
      '  border-bottom: 1px solid rgba(255,255,255,0.06);',
      '  overflow: hidden; transition: max-height 0.2s ease;',
      '}',
      '.find-acc-header {',
      '  display: flex; align-items: center; justify-content: space-between;',
      '  padding: 6px 10px; cursor: pointer; font-size: 11px; color: #ccc;',
      '  user-select: none;',
      '  background: linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 100%);',
      '  border-left: 3px solid rgba(79,195,247,0.3);',
      '}',
      '.find-acc-header:hover { color: #4fc3f7; border-left-color: rgba(79,195,247,0.7); }',
      '.find-acc-header .fa-label { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '.find-acc-header .fa-chevron { font-size: 9px; opacity: 0.4; transition: transform 0.2s; margin-left: 4px; }',
      '.find-acc-row.expanded .fa-chevron { transform: rotate(180deg); }',
      '.find-acc-body { max-height: 0; overflow-y: auto; transition: max-height 0.2s ease; }',
      '.find-acc-row.expanded .find-acc-body { max-height: 180px; }',
      '.find-acc-item {',
      '  padding: 5px 10px; cursor: pointer; font-size: 11px; color: #ccc;',
      '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;',
      '}',
      '.find-acc-item:hover { background: rgba(79,195,247,0.1); color: #fff; }',
      '.find-acc-item.active { background: rgba(255,212,0,0.16); color: #ffd400; box-shadow: inset 2px 0 0 #ffd400; }',
      // Results — same accordion
      '#find-results { max-height: 0; overflow-y: auto; transition: max-height 0.2s ease; }',
      '#find-panel.results-expanded #find-results { max-height: 140px; }',
      '.find-result-item {',
      '  padding: 5px 10px; cursor: pointer;',
      '  border-bottom: 1px solid rgba(255,255,255,0.04);',
      '  transition: background 0.1s; font-size: 11px; display: flex; align-items: center; gap: 6px;',
      '}',
      '.find-result-item:hover { background: rgba(79,195,247,0.1); }',
      '.find-result-item.active { background: rgba(255,212,0,0.14); box-shadow: inset 2px 0 0 #ffd400; }',
      // §FOCUS: the last-clicked tree row at ANY depth — box-shadow survives the inline hover styles.
      '.find-tree-row.row-focus { background: rgba(255,212,0,0.14) !important; box-shadow: inset 3px 0 0 #ffd400 !important; }',
      // §TAP-RESPONSE: the tree/results are scroll lists; with default touch-action mobile waits ~300ms for a
      // possible double-tap-zoom, which eats the FIRST tap and makes the panel feel heavy. `manipulation` keeps
      // vertical pan (scroll) but drops the double-tap delay → single tap fires immediately, first time.
      '.find-tree-row, .find-acc-header, .find-acc-item, .find-result-item, #find-selected-text { touch-action: manipulation; }',
      '#find-tree, .find-acc-body, #find-results { touch-action: pan-y; }',
      '.find-result-item .ri-icon { font-size: 12px; opacity: 0.4; flex-shrink: 0; }',
      '.find-result-item .ri-body { flex: 1; min-width: 0; }',
      '.find-result-item .ri-name { color: #e0e0e0; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 11px; }',
      '.find-result-item .ri-meta { color: #888; font-size: 9px; }',
      // Selected summary — inline with navigate icon
      '#find-selected { display: none; align-items: center; padding: 5px 10px;',
      '  border-bottom: 1px solid rgba(255,255,255,0.06); gap: 6px; }',
      '#find-selected-text { flex: 1; font-size: 11px; color: #4fc3f7; cursor: pointer;',
      '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '#find-selected-text:hover { color: #fff; }',
      '#find-selected-cost { font-size: 11px; color: #ffc107; font-weight: 600; white-space: nowrap; margin: 0 8px; }',
      '.find-nav-inline { background: rgba(79,195,247,0.25); color: #4fc3f7; border: none;',
      '  border-radius: 6px; padding: 4px 8px; font-size: 13px; cursor: pointer;',
      '  flex-shrink: 0; min-width: 32px; min-height: 32px; transition: background 0.15s; }',
      '.find-nav-inline:hover { background: rgba(79,195,247,0.45); }',
      // BIM→Project (find-erp-deeplink): after a push, the created record's deep-link surfaces here as "open ↗"
      '#find-erp-open { display: none; background: rgba(76,175,80,0.28); color: #81c784;',
      '  border: none; border-radius: 6px; padding: 4px 8px; font-size: 12px; cursor: pointer;',
      '  flex-shrink: 0; min-height: 32px; line-height: 1.6; text-decoration: none; white-space: nowrap;',
      '  transition: background 0.15s; }',
      '#find-erp-open:hover { background: rgba(76,175,80,0.5); color: #fff; }',
      // §2026-07-04 thread A: Room/storey tap → "zoom to iDempiere" (the Construction AD_Window over the
      // building's compiled M_Warehouse row). Same shape as #find-erp-open, blue to read as a DIFFERENT
      // target (this building's Construction record, not a Project Order).
      '#find-construction-open { display: none; background: rgba(79,195,247,0.28); color: #4fc3f7;',
      '  border: none; border-radius: 6px; padding: 4px 8px; font-size: 12px; cursor: pointer;',
      '  flex-shrink: 0; min-height: 32px; line-height: 1.6; text-decoration: none; white-space: nowrap;',
      '  transition: background 0.15s; }',
      '#find-construction-open:hover { background: rgba(79,195,247,0.5); color: #fff; }',
      '#find-count { font-size: 9px; color: #666; padding: 2px 10px 0; }',
      // §S281: Chips visible as slim hint row
      '#find-chips { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 10px 6px; border-bottom: 1px solid rgba(255,255,255,0.06); }',
      '#find-chips button { background: rgba(79,195,247,0.12); border: 1px solid rgba(79,195,247,0.25); border-radius: 10px;',
      '  color: #4fc3f7; font-size: 10px; padding: 2px 8px; cursor: pointer; white-space: nowrap; }',
      '#find-chips button:hover { background: rgba(79,195,247,0.25); }',
      // Nav HUD
      '#nav-hud {',
      '  position: fixed; top: 0; left: 0; width: 100%; height: 100%;',
      '  pointer-events: none; z-index: 40;',
      '}',
      '#nav-direction-cue {',
      '  position: fixed; top: 30%; left: 50%; transform: translate(-50%, -50%);',
      '  background: rgba(79,195,247,0.4); border-radius: 16px;',
      '  font-size: 64px; padding: 20px 30px; color: #fff; text-align: center;',
      '  line-height: 1.2; opacity: 0; transition: opacity 0.3s;',
      '  pointer-events: none; z-index: 41;',
      '}',
      '#nav-direction-cue.visible { opacity: 1; }',
      '#nav-direction-cue .cue-label { font-size: 16px; font-weight: 600; margin-top: 4px; }',
      '#nav-bottom-bar {',
      '  position: fixed; bottom: 110px; left: 50%; transform: translateX(-50%);',
      '  background: rgba(79,195,247,0.3); backdrop-filter: blur(8px);',
      '  border-radius: 12px; padding: 10px 20px; color: #fff; font-size: 13px;',
      '  pointer-events: auto; z-index: 41; white-space: nowrap;',
      '  text-align: center;',
      '}',
      '@media (max-width: 600px) {',
      '  #find-panel { right: 8px; left: 8px; max-width: none; width: auto; top: 60px; bottom: auto; transform: none; max-height: 50vh; }',
      '  #find-panel.results-expanded #find-results { max-height: 140px; }',
      '  #find-tree { height: 150px; }',  // §FIND-GRIP: modest default; user drags the grip to grow (no hard cap)
      '}',
    ].join('\n');
    document.head.appendChild(style);

    // ══════════════════════════════════════════════════════════════
    // SECTION A: FIND PANEL
    // ══════════════════════════════════════════════════════════════

    var panel = document.createElement('div');
    panel.id = 'find-panel';
    panel.className = 'bim-panel';
    var _t = function(k, fb) { return (typeof _TRL !== 'undefined' && _TRL[k]) || fb; };
    // §S265 Phase 5: Search icon (Lucide) + input + mic button in search bar
    var _micSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>';
    var _searchSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>';
    panel.innerHTML = [
      '<span class="bim-panel-close" id="find-close">&times;</span>',
      '<div class="find-search-bar">',
      '  <button id="find-mic-btn" title="' + _t('ui_tt_voice', 'Voice search') + '">' + _micSvg + '</button>',
      '  <input type="text" id="find-name" data-trl-placeholder="ui_find_placeholder" placeholder="' + _t('ui_find_placeholder', 'Count doors, Total cost…') + '">',
      '</div>',
      '<div id="find-chips"></div>',
      // Hidden selects — still used for data binding
      '<select id="find-type" style="display:none"><option value="">' + _t('ui_find_all_types', 'All types') + '</option></select>',
      '<select id="find-storey" style="display:none"><option value="">' + _t('ui_all_storeys', 'All Storeys') + '</option></select>',
      // §S280: Outliner — Storey/Disc toggle + tree
      // §RevitParity Task 3 (W-AXIS): the toggle IS the lens — one data-gated axis row.
      // Storey/Discipline always; Room/Material/Phase pills appear only when their data is present.
      '<div id="find-outliner-bar" style="display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:6px;padding:6px 10px;border-bottom:1px solid rgba(255,255,255,0.06)"></div>',
      '<div id="find-tree" style="height:180px;min-height:90px;overflow-y:auto;scrollbar-width:thin;display:none"></div>',
      // §FIND-GRIP: explicit drag bar — works on mouse AND touch (native resize:vertical does not work on touch).
      '<div id="find-tree-grip" style="display:none;height:18px;cursor:ns-resize;touch-action:none;align-items:center;justify-content:center;background:rgba(255,255,255,0.05);border-top:1px solid rgba(255,255,255,0.10)"><span style="width:38px;height:4px;border-radius:2px;background:rgba(255,255,255,0.40);pointer-events:none"></span></div>',
      // Legacy accordion rows — hidden, kept for backward compat
      '<div class="find-acc-row" id="find-storey-row" style="display:none">',
      '  <div class="find-acc-header" id="find-storey-hdr"><span class="fa-label">All Storeys</span><span class="fa-chevron">\u25BC</span></div>',
      '  <div class="find-acc-body" id="find-storey-body"></div>',
      '</div>',
      '<div class="find-acc-row" id="find-type-row" style="display:none">',
      '  <div class="find-acc-header" id="find-type-hdr"><span class="fa-label">All Types</span><span class="fa-chevron">\u25BC</span></div>',
      '  <div class="find-acc-body" id="find-type-body"></div>',
      '</div>',
      '<div id="find-count"></div>',
      // \u00A7RevitParity A1 (W-FILTER-ISOLATE): isolate the current drill (type/storey/name) \u2014 hide the rest
      '<div id="find-isolate-bar" style="display:none;align-items:center;gap:6px;padding:4px 10px;border-bottom:1px solid rgba(255,255,255,0.06)">',
      '  <button id="find-isolate-btn" style="flex:1;padding:5px 8px;font-size:11px;border:1px solid rgba(79,195,247,0.4);border-radius:6px;background:rgba(79,195,247,0.15);color:#4fc3f7;cursor:pointer">\uD83D\uDD0D ' + _t('ui_find_isolate', 'Isolate') + '</button>',
      '  <button id="find-showall-btn" style="display:none;flex:1;padding:5px 8px;font-size:11px;border:1px solid rgba(255,255,255,0.2);border-radius:6px;background:rgba(255,255,255,0.08);color:#ccc;cursor:pointer">' + _t('ui_find_showall', 'Show all') + '</button>',
      '</div>',
      // S275: Selected item summary + inline navigate button
      // BIM\u2192Project TASK A: indicative 5D cost of the selection (docs/BIMtoProject.md \u00A7A)
      '<div id="find-selected"><span id="find-selected-text"></span><span id="find-selected-cost" title="Indicative 5D cost (active rate pack)"></span><button class="find-nav-inline" id="find-erp-btn" title="Push selection to ERP as a Project Order">\u203A ERP</button><a id="find-erp-open" target="_blank" rel="noopener" title="Open the created Project Order in iDempiere (GardenWorld)">open \u2197</a><a id="find-construction-open" target="_blank" rel="noopener" title="Open this building in iDempiere (Construction)">iDempiere \u2197</a><button class="find-nav-inline" id="find-navigate-btn" title="Navigate">\u25B6</button></div>',
      '<div id="find-results"></div>',
    ].join('');
    document.body.appendChild(panel);
    // §FIND_VIS_TRACE (diagnostic, 2026-07-06): a "Find box appears on its own at onset" bug
    // has been reported but not reproduced synthetically (cold load / simulated back-forward
    // both stayed hidden). Log a stack trace every time this panel's visibility flips, so the
    // NEXT real occurrence in the field pins down who/what set display=block.
    (function () {
      var _lastVis = panel.style.display === 'block';
      new MutationObserver(function () {
        var vis = panel.style.display === 'block';
        if (vis === _lastVis) return;
        _lastVis = vis;
        console.log('§FIND_VIS_TRACE display=' + panel.style.display + ' at=' + Date.now() +
          '\n' + (new Error().stack));
      }).observe(panel, { attributes: true, attributeFilter: ['style'] });
    })();
    // S265 Phase 5: make Find panel draggable — with a GENEROUS top grab-zone (user: the thin
    // default strip was "hard to drag, give me more margin to hold onto"). Taps inside still work.
    panel._dragStrip = window._isMobile ? 96 : 64;  // ~2× the default 50/30
    if (A._makeDraggable) A._makeDraggable(panel);
    // Pointer isolation
    panel.addEventListener('pointerdown', function(e) { e.stopPropagation(); });

    // Nav HUD elements
    var navHud = document.createElement('div');
    navHud.id = 'nav-hud';
    navHud.style.display = 'none';
    navHud.innerHTML = '<div id="nav-direction-cue"><span class="cue-icon"></span><div class="cue-label"></div></div>' +
      '<div id="nav-bottom-bar"></div>';
    document.body.appendChild(navHud);

    var elType = document.getElementById('find-type');
    var elStorey = document.getElementById('find-storey');
    var elName = document.getElementById('find-name');
    var elResults = document.getElementById('find-results');
    var elCount = document.getElementById('find-count');
    var elNavBtn = document.getElementById('find-navigate-btn');
    var elErpBtn = document.getElementById('find-erp-btn');   // BIM→Project TASK C: > to ERP push
    var elErpOpen = document.getElementById('find-erp-open'); // BIM→Project: deep-link to the created record
    var elConstructionOpen = document.getElementById('find-construction-open'); // §2026-07-04 A: Room/storey → Construction window
    var _lastSelSet = null, _lastSelLabel = '';               // current selection, for the ERP push
    var elClose = document.getElementById('find-close');
    var elChips = document.getElementById('find-chips');
    var elMicBtn = document.getElementById('find-mic-btn');
    var elSelected = document.getElementById('find-selected');
    // §RevitParity A1: isolate controls
    var elIsoBar = document.getElementById('find-isolate-bar');
    var elIsoBtn = document.getElementById('find-isolate-btn');
    var elShowAllBtn = document.getElementById('find-showall-btn');

    // ── S275: Accordion row logic ──
    var elStoreyRow = document.getElementById('find-storey-row');
    var elStoreyHdr = document.getElementById('find-storey-hdr');
    var elStoreyBody = document.getElementById('find-storey-body');
    var elTypeRow = document.getElementById('find-type-row');
    var elTypeHdr = document.getElementById('find-type-hdr');
    var elTypeBody = document.getElementById('find-type-body');

    function toggleAccRow(row) {
      [elStoreyRow, elTypeRow].forEach(function(r) { if (r !== row) r.classList.remove('expanded'); });
      panel.classList.remove('results-expanded');
      row.classList.toggle('expanded');
    }

    // §S280: Outliner tree — Storey/Disc toggle
    var elTree = document.getElementById('find-tree');
    // §FIND-GRIP: explicit drag-to-resize (pointer events → mouse + touch). setProperty important so it
    // beats the mobile media-query; persisted across sessions.
    var elTreeGrip = document.getElementById('find-tree-grip');
    if (elTree && elTreeGrip) {
      var _gY = 0, _gH = 0, _gripping = false;
      elTreeGrip.addEventListener('pointerdown', function(e) {
        _gripping = true; _gY = e.clientY; _gH = elTree.getBoundingClientRect().height;
        try { elTreeGrip.setPointerCapture(e.pointerId); } catch (x) {}
        e.preventDefault();
      });
      elTreeGrip.addEventListener('pointermove', function(e) {
        if (!_gripping) return;
        var h = Math.max(90, Math.min(window.innerHeight * 0.85, _gH + (e.clientY - _gY)));
        elTree.style.setProperty('height', h + 'px', 'important');
        e.preventDefault();
      });
      var _gripEnd = function(e) {
        if (!_gripping) return; _gripping = false;
        try { elTreeGrip.releasePointerCapture(e.pointerId); } catch (x) {}
        try { localStorage.setItem('findTreeH', elTree.style.height); } catch (x) {}
        console.log('§FIND_GRIP resized h=' + elTree.style.height);
      };
      elTreeGrip.addEventListener('pointerup', _gripEnd);
      elTreeGrip.addEventListener('pointercancel', _gripEnd);
      try { var _sh = localStorage.getItem('findTreeH'); if (_sh) elTree.style.setProperty('height', _sh, 'important'); } catch (x) {}
    }
    // §FOCUS-ALL-DEPTHS: mark the last-clicked row at ANY level (storey/type/item) with the yellow band.
    // Capture phase so it fires even when inner row handlers stopPropagation. Single-focus (clear others).
    if (elTree) {
      elTree.addEventListener('pointerup', function(e) {
        var t = e.target, row = t && t.closest ? t.closest('.find-tree-row') : null;
        if (!row || !elTree.contains(row)) return;
        elTree.querySelectorAll('.find-tree-row.row-focus').forEach(function(r) { r.classList.remove('row-focus'); });
        row.classList.add('row-focus');
      }, true);
    }
    var elAxisBar = document.getElementById('find-outliner-bar');
    var _treeMode = 'storey'; // 'storey' | 'disc' | 'room' | 'material' | 'phase'
    var _treeRevealed = false; // §S280d: tree hidden until mode toggle pressed
    var _roomGroupBy = 'storey'; // §RP Room sub-toggle: 'storey' (default) | 'type'
    var _matGroupBy = 'material'; // §RP Material sub-toggle: 'material' (default) | 'category'

    // ══ §VIEWLOG: Find-lens VIEW-HISTORY (standard undo/redo, read-only) ══════════
    // A sibling view-log — its OWN array + DOM. It records only SEMANTIC view moments
    // (axis change, group select, item select) so "back" steps through real moves, not
    // 20 hover micro-nudges. It NEVER touches kernel_ops or the grid undo: restore =
    // replay the stored params (_setTreeMode for axis, _drillSelect for group/item) then
    // lerp the camera to the stored pose. The _restoring guard stops a replay from
    // recording a new entry. Off-toggle persists in localStorage (default ON); when off,
    // recording stops AND the bar hides. Spec: prompts/FIND_VIEW_HISTORY.md.
    var _viewHist = [];      // [{kind:'axis'|'group'|'item', tag,label,mode, litGuids,groupGuids,ctxOpacity, axis, cam}]
    var _viewIdx = -1;       // index of the current view in _viewHist
    var _restoring = false;  // true while replaying — suppresses _pushView
    var _vhBar = null, _vhBack = null, _vhFwd = null, _vhMarks = null, _vhOffBtn = null;
    var VH_KEY = 'bim.findViewHist.on';
    var _vhEnabled = (function() {
      try { return localStorage.getItem(VH_KEY) !== 'off'; } catch(e) { return true; } // default ON
    })();
    var _vhCamTimer = null;

    // Snapshot the live camera pose (after a zoom settles) into the current view entry,
    // so restore lerps back to exactly where the user was looking.
    function _vhSnapCam(entry) {
      if (!entry || !A.camera || !A.controls) return;
      var p = A.camera.position, t = A.controls.target;
      entry.cam = { pos: { x: p.x, y: p.y, z: p.z }, target: { x: t.x, y: t.y, z: t.z } };
    }
    // Record a semantic view. Skipped while restoring or when the log is off.
    function _pushView(v) {
      if (_restoring) return;
      // §UHIST: the universal timeline is now the system of record. We keep the local
      // _viewHist as the replay source-of-truth (its restore logic), but the user-facing
      // bar + undo/redo live in UniversalHistory. Honour ITS off-toggle (the old per-lens
      // _vhEnabled toggle is retired — one toggle now).
      var on = !window.UniversalHistory || UniversalHistory.isEnabled();
      if (!on) return;
      // Standard undo/redo: a new move after stepping back drops the redo tail.
      if (_viewIdx < _viewHist.length - 1) _viewHist.length = _viewIdx + 1;
      _viewHist.push(v);
      _viewIdx = _viewHist.length - 1;
      // The deferred (rAF) zoom hasn't settled yet — snapshot the camera shortly after.
      // We snapshot into the SAME object `v` that UniversalHistory holds, so its restore
      // gets the settled camera pose too.
      if (_vhCamTimer) clearTimeout(_vhCamTimer);
      var entry = v;
      _vhCamTimer = setTimeout(function() { _vhSnapCam(entry); }, 450);
      // §UHIST: feed the universal merged timeline (kind:'view').
      if (window.UniversalHistory && UniversalHistory.pushView) UniversalHistory.pushView(v);
      console.log('§VIEWLOG_PUSH n=' + _viewHist.length + ' idx=' + _viewIdx +
        ' kind=' + v.kind + ' label="' + (v.label || v.axis || '') + '"');
    }
    // §UHIST: Replay a view OBJECT deterministically (no new push). Used by both the local
    // index restore AND the UniversalHistory view-restore callback (entry-based). A null v
    // means "no earlier view" → clear the lens overlays back to the plain scene.
    function _replayViewObj(v) {
      if (!v) { // undo past the first view → tear the lens down to plain scene
        _restoring = true;
        try { _highlightLensReset(); _roomLensReset(); _clearShapeOverlays && _clearShapeOverlays();
              if (A.xrayOn && _hlXrayWasOff && A.toggleXray) { A.toggleXray(); _hlXrayWasOff = false; } }
        catch (e) {} finally { _restoring = false; }
        console.log('§VIEWLOG_RESTORE_NULL cleared lens');
        return;
      }
      _restoring = true;
      try {
        if (v.kind === 'axis') {
          _setTreeMode(v.axis);
        } else {
          var d = _viewToDrill(v);
          if (d.focus) _drillSelect(d.focus, v.label, v.tag, d.opts);
        }
      } finally { _restoring = false; }
      if (v.cam) {
        var cam = v.cam;
        setTimeout(function() {
          if (!A.camera || !A.controls || typeof THREE === 'undefined') return;
          var end = new THREE.Vector3(cam.pos.x, cam.pos.y, cam.pos.z);
          var tgt = new THREE.Vector3(cam.target.x, cam.target.y, cam.target.z);
          var start = A.camera.position.clone(), st = A.controls.target.clone(), t = 0;
          (function anim() {
            t += 0.04; if (t > 1) t = 1; var e = 1 - Math.pow(1 - t, 3);
            A.camera.position.lerpVectors(start, end, e);
            A.controls.target.lerpVectors(st, tgt, e);
            A.controls.update(); if (A.markDirty) A.markDirty();
            if (t < 1) requestAnimationFrame(anim);
          })();
        }, 80);
      }
      console.log('§VIEWLOG_RESTORE kind=' + v.kind + ' label="' + (v.label || v.axis || '') +
        '" cam=' + (v.cam ? 'yes' : 'no'));
    }
    // §UHIST: register HOW the universal timeline restores a Find view moment.
    if (window.UniversalHistory && UniversalHistory.registerViewRestore) {
      UniversalHistory.registerViewRestore(_replayViewObj);
    }
    // Replay the view at idx deterministically (no new push), then lerp camera to its pose.
    function _restoreView(idx) {
      if (idx < 0 || idx >= _viewHist.length) return;
      var v = _viewHist[idx];
      _viewIdx = idx;
      _restoring = true;
      try {
        if (v.kind === 'axis') {
          _setTreeMode(v.axis);
        } else {
          var d = _viewToDrill(v);
          if (d.focus) _drillSelect(d.focus, v.label, v.tag, d.opts);
        }
      } finally { _restoring = false; }
      // Replay re-zooms via _drillSelect; for axis (no zoom) or to land exactly, lerp to
      // the stored pose. Defer so it runs after the replay's own rAF zoom is queued.
      if (v.cam) {
        var cam = v.cam;
        setTimeout(function() {
          if (!A.camera || !A.controls || typeof THREE === 'undefined') return;
          var end = new THREE.Vector3(cam.pos.x, cam.pos.y, cam.pos.z);
          var tgt = new THREE.Vector3(cam.target.x, cam.target.y, cam.target.z);
          var start = A.camera.position.clone(), st = A.controls.target.clone(), t = 0;
          (function anim() {
            t += 0.04; if (t > 1) t = 1; var e = 1 - Math.pow(1 - t, 3);
            A.camera.position.lerpVectors(start, end, e);
            A.controls.target.lerpVectors(st, tgt, e);
            A.controls.update(); if (A.markDirty) A.markDirty();
            if (t < 1) requestAnimationFrame(anim);
          })();
        }, 80);
      }
      _vhRender();
      console.log('§VIEWLOG_RESTORE idx=' + idx + ' kind=' + v.kind +
        ' label="' + (v.label || v.axis || '') + '" cam=' + (v.cam ? 'yes' : 'no'));
    }
    function _vhFwd2() { if (_viewIdx < _viewHist.length - 1) _restoreView(_viewIdx + 1); }
    function _vhClear() {
      _viewHist = []; _viewIdx = -1;
      if (_vhCamTimer) { clearTimeout(_vhCamTimer); _vhCamTimer = null; }
      _vhRender();
    }
    function _vhSetEnabled(on) {
      _vhEnabled = on;
      try { localStorage.setItem(VH_KEY, on ? 'on' : 'off'); } catch(e) {}
      _vhRender();
      console.log('§VIEWLOG_TOGGLE enabled=' + on);
    }
    // Build/refresh the view-history bar — mirrors the grid undo/redo bar look
    // (#undo-redo-btns, ↶ ↷). Shown only while the Find panel is open AND
    // recording is on AND ≥1 view exists; the off-icon (◷) is always visible.
    function _vhRender() {
      // §UHIST: the old find-only bar (#find-viewhist-btns) is RETIRED — the universal
      // timeline (universal_history.js, #universal-hist-btns) is the one bar now. Keep this
      // function as a no-op so all existing callers are harmless. Replay logic + _viewHist
      // remain (UniversalHistory delegates view-restore back to _replayViewObj).
      return;
    }
    function _vhRender_RETIRED() {
      var open = panel && panel.style.display === 'block';
      if (!_vhBar) {
        _vhBar = document.createElement('div');
        _vhBar.id = 'find-viewhist-btns';
        _vhBar.style.cssText = 'position:fixed;bottom:32px;left:16px;z-index:25;display:flex;' +
          'gap:4px;align-items:center';
        var btnStyle = 'background:rgba(30,50,80,0.7);color:#4fc3f7;border:1px solid rgba(255,255,255,0.15);' +
          'border-radius:6px;padding:6px 10px;font-size:16px;cursor:pointer;backdrop-filter:blur(6px);' +
          'min-width:36px;text-align:center';
        _vhBack = document.createElement('button');
        _vhBack.id = 'find-vh-back'; _vhBack.title = 'View back'; _vhBack.textContent = '↶';
        _vhBack.style.cssText = btnStyle;
        _vhBack.addEventListener('pointerup', function(e) { e.stopPropagation(); _vhBack_fn(); });
        _vhFwd = document.createElement('button');
        _vhFwd.id = 'find-vh-fwd'; _vhFwd.title = 'View forward'; _vhFwd.textContent = '↷';
        _vhFwd.style.cssText = btnStyle;
        _vhFwd.addEventListener('pointerup', function(e) { e.stopPropagation(); _vhFwd2(); });
        _vhMarks = document.createElement('div');
        _vhMarks.id = 'find-vh-marks';
        _vhMarks.style.cssText = 'display:flex;gap:3px;align-items:center;padding:0 4px';
        _vhOffBtn = document.createElement('button');
        _vhOffBtn.id = 'find-vh-off'; _vhOffBtn.style.cssText = btnStyle + ';font-size:13px';
        _vhOffBtn.addEventListener('pointerup', function(e) { e.stopPropagation(); _vhSetEnabled(!_vhEnabled); });
        _vhBar.appendChild(_vhBack); _vhBar.appendChild(_vhFwd);
        _vhBar.appendChild(_vhMarks); _vhBar.appendChild(_vhOffBtn);
        document.body.appendChild(_vhBar);
        console.log('§VIEWLOG_BAR added');
      }
      // off-icon reflects state: ◉ on (click to turn off), ◯ off (click to turn on)
      _vhOffBtn.textContent = _vhEnabled ? '◉' : '◯';
      _vhOffBtn.title = _vhEnabled ? 'View history ON — tap to turn off' : 'View history OFF — tap to turn on';
      _vhOffBtn.style.color = _vhEnabled ? '#4fc3f7' : '#888';
      // Bar visible only when panel open + recording on + something to step through.
      var showSteps = open && _vhEnabled && _viewHist.length > 0;
      _vhBar.style.display = (open && _vhEnabled) ? 'flex' : 'none';
      _vhBack.style.display = showSteps ? '' : 'none';
      _vhFwd.style.display = showSteps ? '' : 'none';
      _vhMarks.style.display = showSteps ? 'flex' : 'none';
      _vhBack.style.opacity = (_viewIdx > 0) ? '1' : '0.35';
      _vhFwd.style.opacity = (_viewIdx < _viewHist.length - 1) ? '1' : '0.35';
      if (showSteps) {
        _vhMarks.innerHTML = '';
        for (var i = 0; i < _viewHist.length; i++) {
          var dot = document.createElement('button');
          var on = (i === _viewIdx);
          dot.title = _viewHist[i].label || _viewHist[i].axis || ('view ' + (i + 1));
          dot.style.cssText = 'width:9px;height:9px;border-radius:50%;padding:0;cursor:pointer;' +
            'border:1px solid rgba(79,195,247,0.6);background:' +
            (on ? '#4fc3f7' : 'rgba(79,195,247,0.18)');
          (function(idx) { dot.addEventListener('pointerup', function(e) { e.stopPropagation(); _restoreView(idx); }); })(i);
          _vhMarks.appendChild(dot);
        }
      }
    }
    function _vhBack_fn() { if (_viewIdx > 0) _restoreView(_viewIdx - 1); }

    // §NAV_FIND_002: multi-select state (parent rows only). Plain=replace,
    // Ctrl/Cmd=toggle, Shift=range. Sets cleared only on Storey/Disc toggle.
    var _selStoreys = new Set();
    var _selDiscs = new Set();
    var _anchor = null; // last plain/ctrl-tapped label, for Shift-range
    function _orderedParentLabels() {
      return Array.prototype.map.call(
        elTree ? elTree.querySelectorAll('[data-find-parent]') : [],
        function(r) { return r.getAttribute('data-find-parent'); });
    }
    function _setParentRowStyle(row, active) {
      var text = row.querySelector('span:nth-child(2)');
      if (active) {
        row.setAttribute('data-active', '1');
        row.style.background = 'linear-gradient(180deg,rgba(255,212,0,0.22) 0%,rgba(255,212,0,0.07) 100%)'; // §FOCUS: yellow, matches the 3D highlight
        row.style.borderLeftColor = '#ffd400';
        if (text) text.style.color = '#ffd400';
      } else {
        row.removeAttribute('data-active');
        row.style.background = 'linear-gradient(180deg,rgba(255,255,255,0.06) 0%,rgba(255,255,255,0.02) 100%)';
        row.style.borderLeftColor = 'rgba(79,195,247,0.3)';
        if (text) text.style.color = '#ddd';
      }
    }
    function _applyParentHighlight() {
      if (!elTree) return;
      var sel = (_treeMode === 'storey') ? _selStoreys : _selDiscs;
      elTree.querySelectorAll('[data-find-parent]').forEach(function(row) {
        _setParentRowStyle(row, sel.has(row.getAttribute('data-find-parent')));
      });
    }

    // §S280: Audio thump — short click on mode toggle (lightweight, no file load)
    var _audioCtx = null;
    function _thump() {
      // §AUDIO: honour the global audio toggle (sfx.js). When audio is OFF, purge our own
      // context — close() frees the hardware audio resource (zero cost), and it is recreated
      // lazily on the next thump once audio is back on. Was: played + leaked a ctx regardless.
      var sfxOn = !(window.__sfx && typeof window.__sfx.isOn === 'function') || window.__sfx.isOn();
      if (!sfxOn) {
        if (_audioCtx) { try { _audioCtx.close(); } catch (e) {} _audioCtx = null; }
        return;
      }
      try {
        if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        var osc = _audioCtx.createOscillator();
        var gain = _audioCtx.createGain();
        osc.connect(gain); gain.connect(_audioCtx.destination);
        osc.frequency.value = 220;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.15, _audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 0.08);
        osc.start(); osc.stop(_audioCtx.currentTime + 0.08);
      } catch(e) { /* audio not available */ }
    }

    // §RP-T3: selecting an axis pill. Room/Material/Phase fold into the toggle as a
    // data-gated axis row. Tears down any active lens, clears multi-select + all filters
    // (unify engine), then lists the new axis groups.
    function _setTreeMode(mode) {
      var _stmT0 = (performance && performance.now) ? performance.now() : 0; // §PERF_PROBE (2026-07-15j, §13)
      // §RP Task A: leaving the Room axis tears down room boxes + shape overlays + restores opacity.
      if (_treeMode === 'room') { _roomLensReset(); _highlightLensReset(); _clearPathHighlight(); }
      // §PHASE_LENS/§MAT_SELECT: leaving Phase/Material tears down element highlight.
      if (_treeMode === 'phase' || _treeMode === 'material') _highlightLensReset();
      // Parts axis uses plain filterByGuids isolate (Room's FALLBACK contents-isolate path, not
      // the box/highlight lens) — no overlay to tear down; the unconditional filterByGuids(null)
      // a few lines below already resets it on every axis change.
      // §BBOX_GHOST_STUCK fix (2026-07-20, user: "when it accidentally turned to bbxes mode... does
      // not check back to solid"): _drillSelect()'s §BBOX_SHELL_DEFAULT auto-enables the merged-ghost
      // bbox shell on a Storey/Discipline drill for large buildings — but only room/phase/material
      // leaving reset it (via _roomLensReset/_highlightLensReset above). Storey/disc was never
      // checked, so switching axes away from a storey/disc drill left the ghost shell visible
      // forever. Made unconditional (not mode-gated) — resetting an already-false _mgLensOwned is a
      // safe no-op, and this way no future axis needs its own copy of this reset.
      if (_mgLensOwned && _mergedGhost) {
        _mergedGhost.visible = false; _mgLensOwned = false;
        console.log('[MG] §BBOX_GHOST_STUCK_RESET hidden on axis change (was lens-owned)');
      }
      _treeMode = mode;
      // §NAV_FIND_002: axis change clears multi-select + restores full scene (unify engine)
      _selStoreys.clear(); _selDiscs.clear(); _anchor = null;
      if (A.filterStorey) A.filterStorey(null);
      if (A.filterDisc) A.filterDisc(null);
      if (A.filterByGuids) A.filterByGuids(null);
      if (elIsoBar) elIsoBar.style.display = 'none';
      _thump();
      _renderAxes(); // re-highlight the active pill
      if (elTree) { elTree.style.display = ''; _treeRevealed = true; if (elTreeGrip) elTreeGrip.style.display = 'flex'; }
      buildTree();
      console.log('§FIND_MODE_TOGGLE mode=' + mode);
      console.log('[RP-T3] §PERF_PROBE _setTreeMode(' + mode + ') total_ms=' + ((performance && performance.now) ? (performance.now() - _stmT0).toFixed(1) : '?')); // §13, the real per-tab-switch cost
      // §VIEWLOG: an axis change is a semantic view moment. Record it (skipped on replay/off).
      _pushView({ kind: 'axis', axis: mode, label: 'Axis: ' + mode, mode: 'axis' });
    }

    function buildTree() {
      if (!elTree || !A.db) return;
      var bld = A.activeBuilding || '';
      var filter = elName.value.trim().toLowerCase();
      elTree.innerHTML = '';
      try {
        if (_treeMode === 'storey') { _buildStoreyTree(bld, filter); _applyParentHighlight(); }
        else if (_treeMode === 'disc') { _buildDiscTree(bld, filter); _applyParentHighlight(); }
        else if (_treeMode === 'room') _buildRoomTree();
        else if (_treeMode === 'material') _buildMaterialTree();
        else if (_treeMode === 'phase') _buildPhaseTree();
      } catch(e) { console.warn('§FIND_TREE error', e); }
    }

    // ══ §RP-T3: Axis pills — Room/Material/Phase fold INTO the toggle, data-gated ══
    // Engine: UNIFY — every axis group isolates via filterByGuids (W-LENS-ISOLATE).
    // An optional axis appears ONLY when its query returns rows (W-LENS-PROBE).
    // §RP Task A: a room has VOLUME data when spatial_structure carries center_*/size_*
    // columns AND at least one IfcSpace row is populated. _roomHasVol is cached per-open.
    var _roomHasVol = false;
    // §NEEDLE (ROOM_INJECTOR_NEEDLE.md): cached _probeLenses() result (incl. spaceCount, the raw
    // IfcSpace row count) so _renderNeedle() can gate on it without re-querying; whether an
    // injection is in flight (guards double-press).
    var _lastPresent = null;
    var _needleBusy = false;
    // §BUILDING-PARTS-TAXONOMY: STAIRWAY/LIFT_SHAFT/PLANT_ROOM keyword constants, ported verbatim
    // from bim-compiler build/building_parts_taxonomy.js (which itself reuses build/room_walker.js's
    // §STAIR-EXCLUDE / door-rescue constants — see prompts/BUILDING_PARTS_TAXONOMY.md in that repo,
    // witnessed 13/13 PASS on real Duplex/SampleCastle/Terminal/Hospital/Clinic IFC data). Existence-
    // only match against elements_meta.ifc_class / .element_name — no element_transforms JOIN
    // required (§PARENT-NO-TRANSFORM there: an IfcStair assembly parent frequently carries no
    // transform of its own, only its child IfcStairFlight does; an existence match is the correct
    // "does this building have one" signal, same choice this axis needs).
    var STAIR_LIKE = ["IfcStair%", "IfcRamp%"];
    var LIFT_KEYWORDS = ["liftdeur", "lift", "elevator", "aufzug", "fahrstuhl", "hoist"];
    var PLANT_KEYWORDS = ["vent", "duct", "fan", "ahu", "damper", "chiller", "condens", "fancoil", "pump"];
    // §ROOM_LENS_TAXONOMY (ROOM_LENS_VISUAL_HIGHLIGHT_SPEC.md §10, 2026-07-15): real evidence
    // already seen this session (Clinic doors named "M_Toilet Partition:0865 x 1500mm" near First
    // Floor R58/R59) — same word-boundary discipline as LIFT_KEYWORDS/PLANT_KEYWORDS above, applied
    // to a room's CONTAINED elements (rel_contained_in_space) rather than the room's own generic
    // "COMPILED INTERNAL" label, which carries no descriptive signal for real synthetic rooms.
    var RESTROOM_KEYWORDS = ["toilet", "restroom", "washroom", "lavatory", "wc"];
    function _partsCond(part) {
      if (part === 'STAIRWAY') return STAIR_LIKE.map(function(p) { return "ifc_class LIKE '" + p + "'"; }).join(' OR ');
      var words = (part === 'LIFT_SHAFT') ? LIFT_KEYWORDS : PLANT_KEYWORDS;
      // §PLANT_ROOM_GATE_FIX Bug 1: SQL stays a broad substring pre-filter (cheap, superset —
      // real matches never excluded here); the word-boundary discipline that actually rejects
      // false positives (e.g. "Preventer" containing "vent") runs in JS via _keywordTokenMatch()
      // below, applied to the rows this SQL returns. Kept as LIKE (not narrowed here) because
      // SQLite has no REGEXP/word-boundary operator built in — see FIND_PANEL_PLANT_ROOM_GATE_FIX.md.
      return words.map(function(w) { return "LOWER(element_name) LIKE '%" + w + "%'"; }).join(' OR ');
    }
    // §PLANT_ROOM_GATE_FIX Bug 1: real-data-driven word-boundary check (bim-compiler
    // prompts/FIND_PANEL_PLANT_ROOM_GATE_FIX.md) — confirmed against real element_name templates
    // across Duplex/Terminal/Hospital/Clinic/HHS (59 distinct templates surveyed) that these names
    // use TWO delimiter styles interchangeably: non-alphanumeric separators (space/colon/underscore/
    // hyphen — e.g. "M_Backflow Preventer_...") AND bare camelCase compounds with no separator at
    // all (e.g. "BottomDuct", "AirBox"). A plain regex \b is insufficient (it treats "_" as a word
    // character, so "_AHU_" would never trip a boundary) and exact-token matching is too strict (it
    // would reject genuine hits like "Ventilated" in "Wall Mounted Ventilated Fans"). This splits on
    // BOTH delimiter styles, then requires the keyword to be a TOKEN PREFIX (not mid-token) —
    // rejects "Preventer" (keyword "vent" appears mid-token, not at a token start) while keeping
    // "Duct" (from "BottomDuct", a camelCase-split token start) and "Ventilated"/"Vent" (prefix match).
    function _splitNameTokens(name) {
      var raw = String(name || '').split(/[^A-Za-z]+/).filter(Boolean);
      var out = [];
      raw.forEach(function(tok) {
        var start = 0;
        for (var i = 1; i < tok.length; i++) {
          if (/[a-z]/.test(tok.charAt(i - 1)) && /[A-Z]/.test(tok.charAt(i))) {
            out.push(tok.slice(start, i));
            start = i;
          }
        }
        out.push(tok.slice(start));
      });
      return out;
    }
    function _keywordTokenMatch(name, words) {
      var tokens = _splitNameTokens(name);
      return tokens.some(function(t) {
        var tl = t.toLowerCase();
        return words.some(function(w) { return tl.indexOf(w) === 0; });
      });
    }
    // §PLANT_ROOM_GATE_FIX Bug 2: smallest static filename->class map (NOT a general classifier —
    // mirrors bim-compiler config/building_taxonomy.yaml's building_classes exactly, which itself
    // cites WalkerDoctrine.md §1 LOCKED: residential = SampleHouse/Duplex/SampleCastle, complex =
    // Terminal/Clinic/Hospital/HHS). The Viewer has no building-class concept anywhere else (grep
    // confirmed zero hits before this change) — this reads A.DB_URL (the ?db= query param, a stable
    // filename per WalkerDoctrine's own fixed building list) rather than A.activeBuilding (the raw
    // elements_meta.building column, confirmed messy/inconsistent per-building — e.g. Clinic carries
    // 5 different discipline-suffixed values, Duplex carries the full IFC federation filename).
    var _RESIDENTIAL_BUILDINGS = ['duplex', 'samplehouse', 'samplecastle'];
    var _COMPLEX_BUILDINGS = ['terminal', 'clinic', 'hospital', 'hhs'];
    function _buildingClass() {
      var src = String((A.DB_URL || '')).toLowerCase();
      for (var i = 0; i < _COMPLEX_BUILDINGS.length; i++) { if (src.indexOf(_COMPLEX_BUILDINGS[i]) >= 0) return 'complex'; }
      for (var i = 0; i < _RESIDENTIAL_BUILDINGS.length; i++) { if (src.indexOf(_RESIDENTIAL_BUILDINGS[i]) >= 0) return 'residential'; }
      return null; // unclassed (e.g. Garage, n=1 per scoreboard) — PLANT_ROOM stays hidden, same as residential
    }
    var _PARTS_GROUPS = [
      { type: 'STAIRWAY', label: 'Stairway' },
      { type: 'LIFT_SHAFT', label: 'Lift Shaft' },
      { type: 'PLANT_ROOM', label: 'Plant Room' }
    ];
    // §PROBE-DEDUP (2026-07-15j, §13): a single axis-toggle tap calls _axes() TWICE — once in the
    // toggle button's own pointerup handler (to compute the NEXT axis from the CURRENT list) and
    // again inside _setTreeMode()'s _renderAxes() (to redraw the button showing the NEW state) —
    // each running _probeLenses()'s ~4 real COUNT queries against A.db. The DB's data-presence
    // (room/material/phase available) cannot legitimately change between these two calls in the
    // same synchronous tap; a short TTL memo collapses the pair into ONE real probe per tap without
    // risking staleness for genuine data changes (needle-inject etc. are always async, >>50ms away).
    var _probeCacheResult = null, _probeCacheT = 0;
    function _probeLenses() {
      var _plT0 = (performance && performance.now) ? performance.now() : 0; // §PERF_PROBE (2026-07-15j, §13)
      var _now = _plT0 || (Date.now ? Date.now() : 0);
      if (_probeCacheResult && (_now - _probeCacheT) < 50) {
        console.log('[RP-T3] §LENS_PROBE_DEDUP_HIT age_ms=' + (_now - _probeCacheT).toFixed(1));
        return _probeCacheResult;
      }
      var bld = A.activeBuilding || '';
      var room = false, material = false, phase = false;
      _roomHasVol = false;
      try {
        var hasSS = A.db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='spatial_structure'");
        var hasRel = A.db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='rel_contained_in_space'");
        if (hasSS.length) {
          if (hasRel.length) {
            var rc = A.db.exec("SELECT COUNT(*) FROM rel_contained_in_space");
            room = !!(rc.length && rc[0].values[0][0] > 0);
          }
          try {
            var ssCols = A.db.exec("PRAGMA table_info(spatial_structure)");
            var colNames = (ssCols.length ? ssCols[0].values : []).map(function(r) { return r[1]; });
            if (colNames.indexOf('center_x') >= 0 && colNames.indexOf('size_x') >= 0) {
              var vc = A.db.exec("SELECT COUNT(*) FROM spatial_structure" +
                " WHERE type='IfcSpace' AND center_x IS NOT NULL AND size_x IS NOT NULL");
              _roomHasVol = !!(vc.length && vc[0].values[0][0] > 0);
              if (_roomHasVol) room = true; // volume alone enables the Room axis
            }
          } catch(e) { /* _roomHasVol stays false */ }
        }
      } catch(e) { /* room stays false */ }
      // §NEEDLE (ROOM_INJECTOR_NEEDLE.md §STANDARDIZATION): three states, not a binary zero/non-
      // zero — compiled rows are tagged 'RM_'/'STC_' (room_walker.js's own guid convention, same
      // prefix the patch files use). ANY non-RM_ IfcSpace row means real extraction is present —
      // the needle must never show (never overwrite real data). All-RM_ rows (rooms present but
      // every one compiler-owned) → needle stays as a subtle RECOMPUTE action. Zero rows → the
      // original greyed-facet trigger.
      var _needleSpaceCount = 0, _needleState = 'none';
      try {
        var scQ = A.db.exec("SELECT COUNT(*), COUNT(CASE WHEN guid LIKE 'RM\\_%' ESCAPE '\\' THEN 1 END)" +
          " FROM spatial_structure WHERE type='IfcSpace'");
        var _total = scQ.length ? scQ[0].values[0][0] : 0;
        var _compiled = scQ.length ? scQ[0].values[0][1] : 0;
        _needleSpaceCount = _total;
        if (_total === 0) _needleState = 'zero';
        else if (_total === _compiled) _needleState = 'recompute'; // every row is RM_ (compiler-owned)
        else _needleState = 'none'; // at least one real (non-RM_) row present — never touch it
      } catch(e) { /* table missing → zero */ _needleState = 'zero'; }
      try {
        var mc = A.db.exec("SELECT COUNT(*) FROM elements_meta WHERE material_name IS NOT NULL" +
          (bld ? " AND building = ?" : ""), bld ? [bld] : []);
        material = !!(mc.length && mc[0].values[0][0] > 0);
      } catch(e) { /* material stays false */ }
      // §RP Task B: Phase axis = Time Machine's REAL generator (window.tmGenerateTimeline).
      // Available when elements exist AND either the generator is loaded OR a timeline
      // (kernel_ops ELEMENT_PLACE rows) already exists. Timeline generated lazily on select.
      try {
        var ec = A.db.exec("SELECT COUNT(*) FROM elements_meta" +
          (bld ? " WHERE building = ?" : ""), bld ? [bld] : []);
        var hasElems = !!(ec.length && ec[0].values[0][0] > 0);
        var genReady = (typeof window.tmGenerateTimeline === 'function');
        var opsExist = false;
        try {
          var oc = A.db.exec("SELECT COUNT(*) FROM kernel_ops WHERE undone=0 AND op_type='ELEMENT_PLACE'");
          opsExist = !!(oc.length && oc[0].values[0][0] > 0);
        } catch(e) { /* kernel_ops table may not exist yet */ }
        phase = hasElems && (genReady || opsExist);
      } catch(e) { /* phase stays false */ }
      console.log('[RP-T3] §LENS_PROBE room=' + room + ' roomVol=' + _roomHasVol + ' material=' + material + ' phase=' + phase + ' spaceCount=' + _needleSpaceCount + ' needleState=' + _needleState);
      console.log('[RP-T3] §PERF_PROBE _probeLenses ms=' + ((performance && performance.now) ? (performance.now() - _plT0).toFixed(1) : '?')); // §13
      _probeCacheResult = { room: room, material: material, phase: phase, spaceCount: _needleSpaceCount, needleState: _needleState };
      _probeCacheT = _now;
      return _probeCacheResult;
    }

    // Storey + Discipline always; Room/Material/Phase only when their data is present.
    // §A NEVER-BLANK: Storey+Disc are unconditional — built before any DB probe so the
    // axis bar can never empty (the cause of the shipped blank bar). When A.db isn't ready
    // yet, return just the two base pills; the data-gated pills fill in once probed.
    function _axes() {
      var ax = [{ key: 'storey', label: _t('ui_axis_storey', 'Storey') },
                { key: 'disc', label: _t('ui_axis_disc', 'Discipline') }];
      if (!A.db) return ax;
      var present = _probeLenses();
      _lastPresent = present; // §NEEDLE: cache for _renderNeedle()
      if (present.room) ax.push({ key: 'room', label: _t('ui_lens_room', 'Room') });
      if (present.material) ax.push({ key: 'material', label: _t('ui_lens_material', 'Material') });
      if (present.phase) ax.push({ key: 'phase', label: _t('ui_lens_phase', 'Phase') });
      return ax;
    }

    // §RULE1 SINGLE TOGGLE: the axis is ONE button, not a row of pills. It shows the current
    // axis and cycles to the next available one on each tap (storey→disc→[room]→[material]→
    // [phase]→storey). Room/Material/Phase only join the cycle when their data is present
    // (data-gated, §A never-blank keeps storey+disc always). One control, never multiple buttons.
    function _renderAxes() {
      if (!elAxisBar) return;
      elAxisBar.innerHTML = '';
      // §A NEVER-BLANK: _axes() always yields at least Storey+Disc, even before A.db.
      var ax = _axes();
      if (!ax.length) return;
      var idx = 0;
      for (var i = 0; i < ax.length; i++) { if (ax[i].key === _treeMode) { idx = i; break; } }
      var cur = ax[idx];
      var nxt = ax[(idx + 1) % ax.length];
      var btn = document.createElement('button');
      btn.id = 'find-axis-toggle';
      btn.setAttribute('data-axis', cur.key);
      // Current axis prominent; subtle hint of the next on tap. ONE button.
      btn.innerHTML = '<span style="font-size:9px;opacity:.55">' + (idx + 1) + '/' + ax.length + '</span>' +
        ' <span style="font-weight:800">' + cur.label + '</span>' +
        (ax.length > 1 ? ' <span style="font-size:9px;opacity:.5">⇄ ' + nxt.label + '</span>' : '');
      btn.style.cssText = 'min-width:160px;padding:6px 14px;font-size:12px;border-radius:7px;cursor:pointer;' +
        'white-space:nowrap;border:1px solid rgba(79,195,247,0.7);background:rgba(79,195,247,0.22);color:#fff;';
      btn.addEventListener('pointerup', function(e) {
        e.stopPropagation();
        var a2 = _axes(); // re-probe in case data changed
        var ci = 0;
        for (var k = 0; k < a2.length; k++) { if (a2[k].key === _treeMode) { ci = k; break; } }
        _setTreeMode(a2[(ci + 1) % a2.length].key);
      });
      elAxisBar.appendChild(btn);
      console.log('[RP-T3] §LENS_AXES toggle cur=' + cur.key + ' next=' + nxt.key +
        ' available=' + ax.map(function(a){ return a.key; }).join(','));
      _renderNeedle();
    }

    // ══ §NEEDLE (ROOM_INJECTOR_NEEDLE.md + §STANDARDIZATION) — one-press room injection ══
    // Three states, keyed off _lastPresent.needleState (set by _probeLenses()):
    //   'zero'      — no IfcSpace rows at all → Room axis absent from the cycle (S1's "greyed"),
    //                 needle shown prominent: "inject compiled rooms".
    //   'recompute' — rooms present but EVERY row is compiler-owned (RM_ guid prefix) → facets
    //                 work normally (Room axis in the cycle); needle STAYS, subtle, as an explicit
    //                 re-run action (standing policy: no auto-compute, user data only changes on
    //                 an explicit press).
    //   'none'      — at least one REAL (non-RM_) IfcSpace row → no needle, ever (S5 + never
    //                 overwrite real extraction).
    function _renderNeedle() {
      var old = document.getElementById('find-needle-btn');
      if (old && old.parentNode) old.parentNode.removeChild(old);
      if (!elAxisBar || !A.db || !_lastPresent || _lastPresent.needleState === 'none') return;
      var bld = A.activeBuilding || '';
      var btn = document.createElement('button');
      btn.id = 'find-needle-btn';
      btn.textContent = '💉';
      if (_lastPresent.needleState === 'zero') {
        console.log('[NEEDLE] §NEEDLE_DETECT bld=' + bld + ' rooms=' + _lastPresent.spaceCount);
        btn.title = 'No rooms in this building — inject compiled rooms';
        btn.style.cssText = 'margin-left:2px;padding:5px 9px;font-size:13px;border-radius:7px;' +
          'border:1px dashed rgba(255,255,255,0.35);background:rgba(255,255,255,0.05);' +
          'color:#999;cursor:pointer;opacity:0.85;';
      } else { // 'recompute'
        console.log('[NEEDLE] §NEEDLE_RECOMPUTE_AVAILABLE bld=' + bld + ' rooms=' + _lastPresent.spaceCount);
        btn.title = 'Recompute compiled rooms (replaces the previous compiled set)';
        btn.style.cssText = 'margin-left:2px;padding:4px 7px;font-size:12px;border-radius:7px;' +
          'border:1px solid rgba(79,195,247,0.3);background:rgba(255,255,255,0.03);' +
          'color:#4fc3f7;cursor:pointer;opacity:0.5;';
      }
      btn.addEventListener('pointerup', function(e) { e.stopPropagation(); _needleInject(btn); });
      elAxisBar.appendChild(btn);
    }

    // ══ FLY_TOUR_CORRIDOR_GRAPH.md §S1 — A.ensureRooms: the ONE shared injection core ══
    // Extracted verbatim from _needleInject (ROOM_INJECTOR_NEEDLE.md S2+S3+S4's cache half) so the
    // Fly tour can run the SAME patch→walker→IDB sequence without forking it. Semantics:
    //   - real (non-RM_) IfcSpace rows present → 'present', NEVER touched (needle 'none' state),
    //     force or not — never overwrite real extraction.
    //   - compiled rooms present, no force → 'present' (no auto-recompute; standing needle policy).
    //   - zero rooms, or compiled+{force:true} (the needle's recompute press) → inject.
    // Returns {status:'present'|'injected'|'error', source, rooms, rects}. Never throws.
    // Single-flight: concurrent callers (Fly prep + a needle press) share one run.
    A.ensureRooms = function(opts) {
      if (A._ensureRoomsInflight) return A._ensureRoomsInflight;
      A._ensureRoomsInflight = _ensureRoomsCore(opts);
      A._ensureRoomsInflight.finally(function() { A._ensureRoomsInflight = null; });
      return A._ensureRoomsInflight;
    };
    async function _ensureRoomsCore(opts) {
      opts = opts || {};
      if (!A.db) return { status: 'error', message: 'no db' };
      var state = 'zero';
      try {
        var scQ = A.db.exec("SELECT COUNT(*), COUNT(CASE WHEN guid LIKE 'RM\\_%' ESCAPE '\\' THEN 1 END)" +
          " FROM spatial_structure WHERE type='IfcSpace'");
        var total = scQ.length ? scQ[0].values[0][0] : 0;
        var compiled = scQ.length ? scQ[0].values[0][1] : 0;
        if (total === 0) state = 'zero';
        else if (total === compiled) state = 'recompute';
        else state = 'none'; // real extraction present
      } catch (e) { state = 'zero'; /* table missing */ }
      if (state === 'none') return { status: 'present', real: true };
      if (state === 'recompute' && !opts.force) {
        // §PATCH-FRAME-GUARD (boot half, 2026-07-17): the loader's self-heal applies
        // patches/<dbFile>.sql on EVERY load — a wrong-building patch (see the needle-side guard
        // below for the observed case) poisons the db before any press, and "rooms present"
        // would trust it forever. Compiler-owned rooms sitting OUTSIDE the building's own element
        // extent are objective corruption, not user data: fall through and recompile. Rooms
        // without coordinates to compare keep the existing trust-present behavior.
        var inFrame = true;
        try {
          var _e0 = A.dbQuery("SELECT MIN(center_x),MAX(center_x),MIN(center_y),MAX(center_y)" +
            " FROM element_transforms WHERE center_x IS NOT NULL")[0];
          var _r0 = A.dbQuery("SELECT MIN(center_x),MAX(center_x),MIN(center_y),MAX(center_y)" +
            " FROM spatial_structure WHERE type='IfcSpace' AND center_x IS NOT NULL")[0];
          if (_e0 && _r0 && _r0[0] !== null && _e0[0] !== null) {
            inFrame = _r0[1] >= _e0[0] && _r0[0] <= _e0[1] &&
                      _r0[3] >= _e0[2] && _r0[2] <= _e0[3];
          }
        } catch (eIf) { /* inFrame stays true */ }
        if (inFrame) return { status: 'present', real: false };
        console.warn('[NEEDLE] §NEEDLE_FRAME_STALE compiled rooms outside building extent — recompiling');
      }
      var bld = A.activeBuilding || '';
      var url = A.DB_URL || '';
      var dir = url.slice(0, url.lastIndexOf('/') + 1);
      var dbFile = url.slice(url.lastIndexOf('/') + 1).split('?')[0];
      var patchUrl = dir + 'patches/' + dbFile + '.sql';
      var source = null;
      try {
        // S2.1 — patch source (curated): same sql.js run() semantics as A._applyPendingPatch
        // (G1), applied directly to the LIVE db rather than a pre-load buffer.
        var applied = false;
        try {
          // §THIN-GRAPH-RECURE: a re-cure pass skips the patch source — the patch is exactly
          // what produced the rooms being re-cured (or was frame-dropped already); straight to
          // the walker.
          if (opts.skipPatch) throw new Error('skipPatch');
          var r = await fetch(patchUrl);
          if (r.ok) {
            var sqlText = await r.text();
            A.db.run(sqlText);
            applied = true;
            console.log('[NEEDLE] §PATCH_APPLY ' + dbFile + ' applied (' + sqlText.length + ' bytes) from ' + patchUrl + ' [needle]');
          } else {
            console.log('[NEEDLE] §PATCH_NONE ' + dbFile + ' (' + r.status + ') [needle]');
          }
        } catch (e) { console.warn('[NEEDLE] §NEEDLE_PATCH_ERR ' + (e && e.message)); }

        // §NEEDLE-COMPILED-CHECK: `applied` only means the patch SQL ran without throwing — for
        // HHS that patch is 4 lines regenerating storey_walkable_raster, NOT compiled room data
        // (the old patch that DID carry compiled rows was retired, PR #775). Trusting `applied`
        // alone skips RoomWalker entirely on a fresh DB, leaving raw uncompiled IfcSpace rows (no
        // room_guid, none of the WALL-SNAP/SUSPECT-LARGE/§MULTI-RECT fixes) — and then persists
        // that regressed state back into the IDB cache (§NEEDLE_PERSIST below), poisoning every
        // later reload too. Same missing-column class of bug already fixed once at this file's
        // `_roomsFromSpatialStructure` (~line 1887) via PRAGMA table_info — reuse that technique
        // to require actual compiled evidence (a `room_guid` column), not just a successful patch.
        var hasCompiledRooms = false;
        try {
          var ssColsCheck = A.dbQuery("PRAGMA table_info(spatial_structure)");
          hasCompiledRooms = ssColsCheck.some(function(c) { return c[1] === 'room_guid'; });
        } catch (eCols) { /* hasCompiledRooms stays false */ }

        // §PATCH-FRAME-GUARD (2026-07-17, found live via user console log): a patch fetched by
        // dbFile name can belong to a DIFFERENT building/frame than the db's actual content —
        // observed: Terminal_extracted.db.sql (OCI, extracted frame x≈630..695) applied onto
        // imported TerminalMerged content (x≈88..150). The rooms landed ~550m off the walls,
        // every door orphaned, and the walker never ran because room_guid existed
        // (§NEEDLE-COMPILED-CHECK trusted mere presence). Trust a patch only when its compiled
        // rooms actually sit ON this building: the room-center extent must INTERSECT the
        // element extent — pure measured comparison, no thresholds.
        var frameOk = false;
        if (applied && hasCompiledRooms) {
          try {
            var _ext = A.dbQuery("SELECT MIN(center_x),MAX(center_x),MIN(center_y),MAX(center_y)" +
              " FROM element_transforms WHERE center_x IS NOT NULL")[0];
            var _rext = A.dbQuery("SELECT MIN(center_x),MAX(center_x),MIN(center_y),MAX(center_y)" +
              " FROM spatial_structure WHERE type='IfcSpace' AND center_x IS NOT NULL")[0];
            if (_ext && _rext && _rext[0] !== null && _ext[0] !== null) {
              frameOk = _rext[1] >= _ext[0] && _rext[0] <= _ext[1] &&
                        _rext[3] >= _ext[2] && _rext[2] <= _ext[3];
            }
          } catch (eFg) { /* frameOk stays false */ }
          if (!frameOk) {
            console.warn('[NEEDLE] §NEEDLE_PATCH_MISMATCH patch rooms outside building extent — dropping patch rooms, walker takes over');
            try {
              A.db.run("DELETE FROM spatial_structure WHERE guid LIKE 'RM\\_%' ESCAPE '\\' OR guid LIKE 'STC\\_%' ESCAPE '\\';" +
                       "DELETE FROM rel_contained_in_space WHERE space_guid LIKE 'RM\\_%' ESCAPE '\\';");
            } catch (eDel) { console.warn('[NEEDLE] §NEEDLE_PATCH_MISMATCH cleanup err ' + (eDel && eDel.message)); }
          }
        }

        if (applied && hasCompiledRooms && frameOk) {
          source = 'patch';
        } else {
          // S2.2 — walker source (any building): lazy-load the room_walker JS port, compile
          // deterministically from walls/doors. Refuses honestly (roomsWritten=0) if the
          // building lacks them — never invents rooms.
          if (!window.RoomWalker) {
            await new Promise(function(resolve, reject) {
              var s = document.createElement('script');
              s.src = 'lib/room_walker.js?v=2'; // v2: §LOCAL-FRAME translation invariance (ROOM_WALKER_PHASE_INVARIANCE.md)
              s.onload = function() { resolve(); };
              s.onerror = function() { reject(new Error('room_walker.js load failed')); };
              document.head.appendChild(s);
            });
          }
          if (!window.RoomWalker) throw new Error('RoomWalker unavailable after load');
          window.RoomWalker.walk(A.db, { write: true });
          source = applied ? 'patch+walker' : 'walker';
        }

        var hasRoomGuidNow = false;
        try {
          var ssColsNow = A.dbQuery("PRAGMA table_info(spatial_structure)");
          hasRoomGuidNow = ssColsNow.some(function(c) { return c[1] === 'room_guid'; });
        } catch (eColsNow) { /* hasRoomGuidNow stays false */ }
        var cq = A.dbQuery("SELECT COUNT(*), COUNT(DISTINCT " + (hasRoomGuidNow ? 'room_guid' : 'guid') +
          ") FROM spatial_structure WHERE type='IfcSpace'");
        var rectsN = cq.length ? cq[0][0] : 0;
        var roomsN = cq.length ? cq[0][1] : 0;
        console.log('[NEEDLE] §NEEDLE_INJECT bld=' + bld + ' source=' + source + ' rooms=' + roomsN + ' rects=' + rectsN);

        // S3 — persist patched/injected bytes into the SAME IDB cache slot the loader reads
        // (G4), so rooms survive reload without re-injection. Never blocks on failure.
        try {
          var outBuf = A.db.export().buffer;
          var cacheDb = await A.openCacheDB();
          if (cacheDb) {
            await new Promise(function(resolve) {
              try {
                var tx = cacheDb.transaction(A.CACHE_STORE, 'readwrite');
                var req = tx.objectStore(A.CACHE_STORE).put(outBuf, url);
                req.onerror = function() { console.warn('[NEEDLE] §NEEDLE_PERSIST idb=fail err=' + req.error); };
                tx.oncomplete = function() { console.log('[NEEDLE] §NEEDLE_PERSIST idb=ok bytes=' + outBuf.byteLength); resolve(); };
                tx.onerror = function() { console.warn('[NEEDLE] §NEEDLE_PERSIST idb=fail tx-error'); resolve(); };
              } catch (e2) { console.warn('[NEEDLE] §NEEDLE_PERSIST idb=fail ' + e2.message); resolve(); }
            });
          } else {
            console.warn('[NEEDLE] §NEEDLE_PERSIST idb=fail no-cache-db');
          }
        } catch (e) { console.warn('[NEEDLE] §NEEDLE_PERSIST idb=fail ' + (e && e.message)); }

        // S4 (cache half) — invalidate the room-graph cache so PATH mode (and the Fly tour's
        // A.getRoomGraph) sees the new rooms without a reload.
        // §CORRIDOR-LABEL-CACHE-BUST (2026-07-14, real bug found via user report): needle-inject
        // recompiles rooms (HHS: 14 -> 71 real rooms) but this invalidation only ever cleared
        // _pathGraphCache — _corridorLabelsCache (added later, same per-building caching pattern)
        // was never included here, so a Type-tree opened BEFORE needle-inject finished could stay
        // stuck showing "no Hall/Corridor" for the rest of the session even after real corridor
        // rooms existed. Same fix, same site, same reason.
        _pathGraphCache = null; _pathGraphBld = null;
        _corridorLabelsCache = null; _corridorLabelsBld = null;
        _roomVolCache = null; _roomVolCacheBld = null; // §ROOM-VOL-CACHE: injected rooms invalidate it too
        return { status: 'injected', source: source, rooms: roomsN, rects: rectsN };
      } catch (e) {
        console.warn('[NEEDLE] §NEEDLE_INJECT_ERR ' + (e && e.message));
        return { status: 'error', message: (e && e.message) };
      }
    }

    // S2 (two sources, in order) + S3 (IDB persist) + S4 (ungrey/refresh) — UI shell over
    // A.ensureRooms (the extracted core above); behavior identical to the pre-refactor needle.
    async function _needleInject(btn) {
      if (_needleBusy || !A.db) return;
      _needleBusy = true; btn.disabled = true; btn.textContent = '…';
      try {
        var res = await A.ensureRooms({ force: true });
        if (res && res.status === 'injected') {
          // S4 (UI half) — ungrey + refresh: re-probe/re-render (the pill removes itself once
          // spaceCount > 0 — see _renderNeedle's own gate).
          _renderAxes();
          buildTree();
        } else {
          btn.disabled = false; btn.textContent = '💉';
        }
      } finally {
        _needleBusy = false;
      }
    }

    function _isolateLensGroup(lens, g) {
      if (!A.db || !A.filterByGuids) return;
      if (A.filterStorey) A.filterStorey(null);
      if (A.filterDisc) A.filterDisc(null);
      var set = new Set();
      try {
        if (lens === 'room') {
          A.dbQuery("SELECT element_guid FROM rel_contained_in_space WHERE space_guid = ?", [g.key])
            .forEach(function(r) { set.add(r[0]); });
        } else if (lens === 'material') {
          A.dbQuery("SELECT guid FROM elements_meta WHERE material_name = ?", [g.key])
            .forEach(function(r) { set.add(r[0]); });
        }
      } catch(e) { console.warn('[RP-T3] §LENS_ISOLATE_ERR', e.message); }
      if (!set.size) { console.log('[RP-A1] §FILTER_ISOLATE_EMPTY lens=' + lens + ' group="' + g.label + '"'); return; }
      _emitIsolate(set, lens + '="' + g.label + '"');
      if (elIsoBar) {
        elIsoBar.style.display = 'flex';
        if (elIsoBtn) elIsoBtn.style.display = 'none';
        if (elShowAllBtn) elShowAllBtn.style.display = '';
      }
    }

    // ══ §RP Task A: Room volume lens — highlight room boxes, x-ray the rest ══
    // The Room axis ghosts the whole model (X-Ray) and draws a translucent cyan box at
    // each IfcSpace bbox (center+size from spatial_structure). Tapping a room brightens
    // THAT box. We do NOT inject IfcSpace meshes into the geometry stream — boxes are
    // plain THREE.Mesh added to A.scene, disposed on reset.
    var _roomBoxes = [];      // { guid, name, mesh, center:{x,y,z} }
    var _roomXrayWasOff = false;
    var _hlXrayWasOff = false; // true → the Phase/Material highlight lens turned X-Ray on
    var _mgLensOwned = false;  // §MOBILE-BBOX: true → the lens auto-enabled the bbox shell on mobile (hide it on reset; user Alt+X is NOT lens-owned)

    // ══ §7 Room-to-room pathway (VIEWER_FIND_PANEL_ROOM_ACCURACY.md §7) ══
    // Room axis "Path" sub-mode: pick two rooms, route through the real door-adjacency graph
    // (common/room_graph.js — new, see that file's header for why no such graph existed before).
    var _pathGraphCache = null, _pathGraphBld = null;  // cached per activeBuilding (rebuilding on every keystroke is wasteful)
    var _pathFromGuid = '', _pathToGuid = '', _pathLastResult = null;
    var _pathExtraMeshes = [];  // the connecting polyline + any path-only overlays (disposed on reset/mode-leave)

    function _roomGraphFor() {
      var RG = (typeof window !== 'undefined') && window.RoomGraph;
      if (!RG || !A.dbQuery) return null;
      if (_pathGraphCache && _pathGraphBld === A.activeBuilding) return _pathGraphCache;
      var g = RG.buildGraph(A.dbQuery, { log: function(m) { console.log('[RP-PATH] ' + m); } });
      _pathGraphCache = g; _pathGraphBld = A.activeBuilding;
      return g;
    }
    // FLY_TOUR_CORRIDOR_GRAPH.md §S2 — the Fly tour shares THIS cache (one graph per building,
    // never two). Read-only alias; invalidation stays in ensureRooms/needle above.
    A.getRoomGraph = _roomGraphFor;

    // §CORRIDOR-TYPE-LABEL (2026-07-14, user ask): Type-grouped room tree DISPLAY-only override —
    // a room whose centroid sits on a real, door+wall-verified hallway backbone
    // (common/hallway_backbone.js) shows as "Hall / Corridor" in the Type view instead of whatever
    // generic predefined_type it was compiled with. Never rewrites spatial_structure — same
    // per-building cache convention as _roomGraphFor() above.
    var _corridorLabelsCache = null, _corridorLabelsBld = null;
    function _corridorLabelsFor() {
      var HB = (typeof window !== 'undefined') && window.HallwayBackbone;
      if (!HB || !A.dbQuery) return {};
      if (_corridorLabelsCache && _corridorLabelsBld === A.activeBuilding) return _corridorLabelsCache;
      var labels = {};
      try {
        labels = HB.classifyCorridorRooms(A.dbQuery, { log: function(m) { console.log('[RP-CORRIDOR] ' + m); } });
      } catch (eHb) { console.warn('[RP-CORRIDOR] §CORRIDOR_LABEL_ERR', eHb.message); }
      _corridorLabelsCache = labels; _corridorLabelsBld = A.activeBuilding;
      return labels;
    }

    function _clearPathHighlight() {
      _pathExtraMeshes.forEach(function(m) {
        if (m.parent) m.parent.remove(m);
        if (m.geometry) m.geometry.dispose();
        if (m.material) m.material.dispose();
      });
      _pathExtraMeshes = [];
    }

    // Highlight the found path: brighten path-room shells, dim every other room shell, draw a
    // connecting line through the actual room centers (in path order), zoom to fit.
    function _drawPathHighlight(graph, result) {
      _clearPathHighlight();
      var pathSet = {}; result.path.forEach(function(g) { pathSet[g] = true; });
      _roomBoxes.forEach(function(rb) {
        if (rb.mesh && rb.mesh.material) {
          rb.mesh.material.opacity = pathSet[rb.guid] ? 0.55 : 0.04;
          rb.mesh.material.needsUpdate = true;
        }
      });
      if (A.scene && A.ifc2three && typeof THREE !== 'undefined') {
        var pts = result.path.map(function(g) {
          var n = graph.nodesByGuid[g];
          var c = A.ifc2three(n.cx, n.cy, n.cz || 0);
          return new THREE.Vector3(c.x, c.y + 0.05, c.z); // +0.05 lift so the line clears room-shell faces
        });
        if (pts.length > 1) {
          var geo = new THREE.BufferGeometry().setFromPoints(pts);
          // §PATH_ORANGE (ROOM_LENS_VISUAL_HIGHLIGHT_SPEC.md §2/§9, 2026-07-15, supersedes the
          // earlier neon-green §PATH_NEON): bright orange reads cleanly against BOTH the purple
          // (habitable) and blue (corridor) room-shell category colors §9 introduced — green risked
          // blending into the blue-family boxes, red risked an unintended "danger/error" read; user's
          // own steer, verbatim: "bright orange as most bbxes drown the green dots". Thickness:
          // LineBasicMaterial.linewidth is silently ignored by nearly every browser/GPU (WebGL spec
          // limitation, unchanged from before) — a box-style scaled-duplicate trick (§BORDER_STRONG
          // above) doesn't transfer to an arbitrary polyline (no single center to scale about), so
          // legibility instead comes from a bigger core marker sphere + a larger, softer "halo" sphere
          // behind it at each waypoint (same "duplicate underneath" spirit as §BORDER_STRONG, applied
          // to spheres instead of box edges) — line itself stays a thin hairline, same as before.
          var PATH_COLOR = 0xff9100;
          var mat = new THREE.LineBasicMaterial({ color: PATH_COLOR, linewidth: 3, transparent: true, opacity: 0.95, depthTest: false });
          var line = new THREE.Line(geo, mat);
          line.renderOrder = 1003;
          A.scene.add(line);
          _pathExtraMeshes.push(line);
          var markerGeo = new THREE.SphereGeometry(0.22, 12, 12);
          var markerMat = new THREE.MeshBasicMaterial({ color: PATH_COLOR, transparent: true, opacity: 0.9, depthTest: false });
          var haloGeo = new THREE.SphereGeometry(0.38, 12, 12);
          var haloMat = new THREE.MeshBasicMaterial({ color: PATH_COLOR, transparent: true, opacity: 0.28, depthTest: false });
          // §DOT_DROP (ROOM_LENS_VISUAL_HIGHLIGHT_SPEC.md §6/§9, threshold measured against real
          // Clinic/HHS/Duplex data — see prompt file for the full distance survey): the path's own
          // FIRST/LAST marker sits redundantly close to its neighbor waypoint only in the rare
          // near-degenerate case (measured min 0.02m on HHS) — most room-center-to-door separations
          // are 2-8m (real room depth, not clutter). Drop ONLY an endpoint marker, and only when it's
          // genuinely within 1.0m of its one neighbor — never an interior waypoint (those are real,
          // distinct positions along the route, not a redundant pair).
          var DOT_DROP_DIST = 1.0;
          var skip = pts.map(function() { return false; });
          if (pts.length > 1 && pts[0].distanceTo(pts[1]) < DOT_DROP_DIST) skip[0] = true;
          if (pts.length > 1 && pts[pts.length - 1].distanceTo(pts[pts.length - 2]) < DOT_DROP_DIST) skip[pts.length - 1] = true;
          var dotsDropped = 0;
          pts.forEach(function(p, pi) {
            if (skip[pi]) { dotsDropped++; return; }
            var halo = new THREE.Mesh(haloGeo, haloMat);
            halo.position.copy(p); halo.renderOrder = 1004;
            A.scene.add(halo); _pathExtraMeshes.push(halo);
            var marker = new THREE.Mesh(markerGeo, markerMat);
            marker.position.copy(p); marker.renderOrder = 1005;
            A.scene.add(marker); _pathExtraMeshes.push(marker);
          });
          if (dotsDropped) console.log('[RP-PATH] §DOT_DROP endpoints dropped=' + dotsDropped + ' (within ' + DOT_DROP_DIST + 'm of their one neighbor)');
        }
      }
      // Zoom to fit the union of the path rooms' boxes.
      var bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
      result.path.forEach(function(g) {
        _roomBoxes.forEach(function(rb) {
          if (rb.guid !== g || !rb.center || !rb.size) return;
          var c = rb.center, s = rb.size;
          bx0 = Math.min(bx0, c.x - s.x / 2); bx1 = Math.max(bx1, c.x + s.x / 2);
          by0 = Math.min(by0, c.y - s.y / 2); by1 = Math.max(by1, c.y + s.y / 2);
          bz0 = Math.min(bz0, c.z - s.z / 2); bz1 = Math.max(bz1, c.z + s.z / 2);
        });
      });
      if (bx1 > bx0 && typeof THREE !== 'undefined') {
        var center = new THREE.Vector3((bx0 + bx1) / 2, (by0 + by1) / 2, (bz0 + bz1) / 2);
        var size = new THREE.Vector3(bx1 - bx0, by1 - by0, bz1 - bz0);
        _zoomToBoxFill(center, size, 'ROOM_PATH_ZOOM', 1.4);
      }
      if (A.markDirty) A.markDirty();
    }

    // Run the graph + Dijkstra, log §ROOM_PATH (found) / §ROOM_PATH_NOT_FOUND (honest, no invented
    // connectivity), draw the result, and return it so the caller can render the room-list UI.
    function _findRoomPath(fromGuid, toGuid) {
      var RG = (typeof window !== 'undefined') && window.RoomGraph;
      var graph = _roomGraphFor();
      if (!RG || !graph) { console.warn('[RP-PATH] §ROOM_PATH_ERR RoomGraph not loaded'); return null; }
      var result = RG.shortestPath(graph, fromGuid, toGuid);
      var fromN = graph.nodesByGuid[fromGuid], toN = graph.nodesByGuid[toGuid];
      if (!result) {
        console.log('[RP-PATH] §ROOM_PATH_NOT_FOUND from=' + (fromN ? fromN.name : fromGuid) +
          ' to=' + (toN ? toN.name : toGuid) + ' — no door-connected route (disconnected component)');
        _clearPathHighlight();
        return null;
      }
      var roomNames = result.path.map(function(g) { return graph.nodesByGuid[g].name; });
      var doorGuids = result.doors.map(function(d) { return d.guid; });
      console.log('[RP-PATH] §ROOM_PATH from=' + fromN.name + ' to=' + toN.name +
        ' hops=' + result.doors.length + ' rooms=[' + roomNames.join(',') + ']' +
        ' doors=[' + doorGuids.join(',') + '] distance=' + result.distance.toFixed(2) + 'm');
      _drawPathHighlight(graph, result);
      return result;
    }

    // §C ELEMENT-PRECISE: the Phase/Material highlight overlay. ONE InstancedMesh of unit
    // boxes — one box per matched element, positioned+scaled from element_transforms (same
    // bbox→Three mapping as the picker). Replaces the old whole-BatchedMesh OutlinePass,
    // which lit every neighbour in a batch when any one slot matched.
    var _hlOverlay = null;   // THREE.InstancedMesh | null
    var _HL_CAP = 4000;      // hard cap on highlighted boxes (no silent truncation — §-logged)
    var _shapeOverlays = []; // §RP-SHAPE: real-geometry overlays [{mesh, disposeMat}]

    function _clearHlOverlay() {
      if (_hlOverlay) {
        if (_hlOverlay.parent) _hlOverlay.parent.remove(_hlOverlay);
        if (_hlOverlay.geometry) _hlOverlay.geometry.dispose();
        if (_hlOverlay.material) _hlOverlay.material.dispose();
        _hlOverlay = null;
      }
    }

    // Tear down the element-highlight lens: drop overlay + outline, restore opacity.
    function _highlightLensReset() {
      _clearHlOverlay();
      _clearShapeOverlays();
      if (A.setOutline) A.setOutline([]);
      if (A.filterByGuids) A.filterByGuids(null);  // §SHELL: un-hide the base (shell-mode or old _USE_SHELL)
      if (_mgLensOwned && _mergedGhost) {           // §MOBILE-BBOX: lens-owned bbox shell → hide on reset (user Alt+X stays put)
        _mergedGhost.visible = false; _mgLensOwned = false;
        console.log('[MG] §MOBILE_BBOX_RESET hidden (lens-owned)');
      }
      if (A.xrayOn && _hlXrayWasOff && A.toggleXray) {
        A.toggleXray(); // WE turned x-ray on for the lens → turn it off (restores _origOpacity = 1)
        console.log('[RP-TB] §XRAY_RESTORE mode=off (lens-owned) xrayOn=' + A.xrayOn);
      } else if (A.xrayOn) {
        // §XRAY_UNDISTURB: the user had Alt+Z x-ray ON before the lens, and our _dimXrayTo overwrote
        // its normal 0.3 with the depth value (0.1/0). Put the normal x-ray opacity BACK so Alt+Z is
        // left exactly as the user had it — the depth lens must not disturb the manual x-ray.
        _dimXrayTo(0.3);
        console.log('[RP-TB] §XRAY_RESTORE mode=undisturb→0.3 (user-owned) xrayOn=' + A.xrayOn);
      }
      _hlXrayWasOff = false;
      if (A.markDirty) A.markDirty();
    }

    // Highlight a guid set: x-ray the rest (dim) + draw an element-precise box per match.
    // Returns the number of boxes drawn (element-precise meshes), capped at _HL_CAP.
    function _highlightGuids(set) {
      _clearHlOverlay();
      if (A.setOutline) A.setOutline([]);
      if (!A.scene || typeof THREE === 'undefined' || !A.ifc2three) return 0;
      if (!A.xrayOn && A.toggleXray) { A.toggleXray(); _hlXrayWasOff = true; }
      // Pull transforms for the matched guids (one query, filter in JS — ≤ few k rows).
      var rows = [];
      try {
        rows = A.dbQuery("SELECT guid, center_x, center_y, center_z, bbox_x, bbox_y, bbox_z" +
          " FROM element_transforms");
      } catch (e) { console.log('[RP-C] §HL_OVERLAY_ERR ' + e.message); }
      var hits = [];
      for (var i = 0; i < rows.length && hits.length < _HL_CAP; i++) {
        if (rows[i][1] != null && set.has(rows[i][0])) hits.push(rows[i]);
      }
      var capped = (rows.filter(function (r) { return r[1] != null && set.has(r[0]); }).length > hits.length);
      if (hits.length) {
        var geo = new THREE.BoxGeometry(1, 1, 1);
        var mat = new THREE.MeshBasicMaterial({
          color: 0x4fc3f7, transparent: true, opacity: 0.55,
          depthWrite: false, side: THREE.DoubleSide
        });
        var inst = new THREE.InstancedMesh(geo, mat, hits.length);
        var m = new THREE.Matrix4(), q = new THREE.Quaternion(),
            p = new THREE.Vector3(), s = new THREE.Vector3();
        for (var j = 0; j < hits.length; j++) {
          var r = hits[j];
          var c = A.ifc2three(r[1], r[2], r[3]);
          p.set(c.x, c.y, c.z);
          // IFC bbox → Three: X→X, Z→Y, Y→Z (parity with picking.js bbox highlight).
          s.set(Math.max(r[4] || 0.05, 0.05), Math.max(r[6] || 0.05, 0.05), Math.max(r[5] || 0.05, 0.05));
          m.compose(p, q, s);
          inst.setMatrixAt(j, m);
        }
        inst.instanceMatrix.needsUpdate = true;
        inst.renderOrder = 999;
        inst.userData._hlOverlay = true;
        A.scene.add(inst);
        _hlOverlay = inst;
      }
      console.log('[RP-C] §HL_OVERLAY boxes=' + hits.length + ' setSize=' + set.size +
        (capped ? ' CAPPED@' + _HL_CAP : '') + ' xray=' + (A.xrayOn ? 'on' : 'off'));
      if (A.markDirty) A.markDirty();
      return hits.length;
    }

    // §RP-SHAPE: real-geometry highlight (NOT a box). Reuses the renderer's decoded geometry
    // (A.meshCache[hash]) + its exact placement (ifc2three + euler(rotX,rotZ,-rotY), scale 1),
    // so the actual LOD mesh SHAPE lights up. Geometry is SHARED with the scene — NEVER dispose
    // it; materials here are fresh/cloned (opaque, so x-ray can't dim them) and ARE disposed.
    function _clearShapeOverlays() {
      _shapeOverlays.forEach(function(o) {
        if (o.mesh && o.mesh.parent) o.mesh.parent.remove(o.mesh);
        // §UNIFIED-SELECT: drop the per-overlay instance→guid map registered in _buildShapeMeshes
        // (so picking can never resolve a stale, removed overlay).
        if (o.mesh && A._instanceMeta) delete A._instanceMeta[o.mesh.id];
        if (o.disposeMat && o.mesh && o.mesh.material) o.mesh.material.dispose();
      });
      _shapeOverlays = [];
    }

    // §SHELL-GHOST (user): the building's OUTER SHELL — only envelope classes (walls/slabs/roof/curtain/
    // covering/plate, ~7% of elements) baked into ONE merged mesh, real LOD shapes, see-through 0.3,
    // colored by real material. ONE draw. NOT the whole building (full merge = 2.3GB; envelope ≈ ~150MB).
    // A persistent overlay (NOT in _shapeOverlays → never cleared on tap). Built deferred, after open.
    var _mergedGhost = null, _mergedGhostBld = null, _MG_VCAP = 60000000; // vert cap, bail above
    // §DESKTOP-BBOX-THRESHOLD (2026-07-15i, ROOM_LENS_VISUAL_HIGHLIGHT_SPEC.md §13): extend the
    // existing mobile-only bbox-shell default to desktop by real element count, so a large
    // building gets the light shell without needing window._isMobile. Threshold grounded against
    // actual elements_meta counts across the fleet (measured this session, /home/red1/bim-ootb/
    // buildings/*_extracted.db): Clinic=16114, HHS=6880 (both "small enough" per §12 — never want
    // the bbox default here) vs. Terminal=48428, Hospital=63415 (both real "large" buildings named
    // in §13's own framing) — 25000 sits with comfortable margin below every large building and
    // above every small one in the current fleet, not a guessed round number.
    var _LARGE_BUILDING_ELEM_THRESHOLD = 25000;
    var _elemCountCache = null, _elemCountCacheBld = null;
    function _isLargeBuilding() {
      if (!A.dbQuery) return false;
      if (_elemCountCacheBld === A.activeBuilding && _elemCountCache != null) return _elemCountCache > _LARGE_BUILDING_ELEM_THRESHOLD;
      try {
        var rows = A.dbQuery('SELECT COUNT(*) FROM elements_meta');
        _elemCountCache = (rows && rows[0]) ? rows[0][0] : 0;
        _elemCountCacheBld = A.activeBuilding;
        console.log('[RP-TA] §LARGE_BUILDING_CHECK elems=' + _elemCountCache + ' threshold=' + _LARGE_BUILDING_ELEM_THRESHOLD +
          ' large=' + (_elemCountCache > _LARGE_BUILDING_ELEM_THRESHOLD));
      } catch (e) { console.warn('[RP-TA] §LARGE_BUILDING_CHECK_ERR', e.message); return false; }
      return _elemCountCache > _LARGE_BUILDING_ELEM_THRESHOLD;
    }
    // Envelope = the outward-facing skin classes. Interior MEP/furniture/fittings excluded.
    function _isEnvelope(ifc) {
      if (!ifc) return false;
      return /^Ifc(Wall|Slab|Roof|CurtainWall|Covering|Plate)/.test(ifc);
    }
    function _buildMergedGhost() {
      if (!A.scene || typeof THREE === 'undefined' || !A.dbQuery || !A.ifc2three) { console.log('[MG] §SHELL_GHOST_SKIP deps'); return null; }
      if (_mergedGhost && _mergedGhostBld === A.activeBuilding) return _mergedGhost; // cached
      var t0 = (performance && performance.now) ? performance.now() : 0;
      // §BBOX-GHOST: draw the envelope as instanced WIREFRAME BOUNDING BOXES, grouped by discipline and
      // coloured with the SAME A.DISC_COLORS the load placeholders use (no new palette). Per-element bbox is
      // already in the DB, so this is INSTANT — no real-mesh merge, no EdgesGeometry (that was the Alt+X hang).
      var rows;
      try {
        rows = A.dbQuery("SELECT t.center_x,t.center_y,t.center_z, t.bbox_x,t.bbox_y,t.bbox_z, m.ifc_class, m.discipline" +
          " FROM element_transforms t JOIN elements_meta m ON m.guid=t.guid WHERE t.center_x IS NOT NULL") || [];
      } catch (e) { console.log('[MG] §SHELL_GHOST_SKIP query ' + e.message); return null; }
      var byDisc = {};
      for (var i = 0; i < rows.length; i++) {
        var rr = rows[i]; if (!_isEnvelope(rr[6])) continue;
        var d = rr[7] || '_'; (byDisc[d] = byDisc[d] || []).push(rr);
      }
      var discs = Object.keys(byDisc);
      if (!discs.length) { console.log('[MG] §BBOX_GHOST_EMPTY rows=' + rows.length); return null; }
      var group = new THREE.Group(), geo = new THREE.BoxGeometry(1, 1, 1), total = 0;
      var m4 = new THREE.Matrix4(), _pos = new THREE.Vector3(), _scl = new THREE.Vector3(), _q = new THREE.Quaternion();
      for (var di = 0; di < discs.length; di++) {
        var disc = discs[di], drows = byDisc[disc];
        var color = A.DISC_COLORS[disc] || A.DEFAULT_COLOR;   // EXACT same line as the load placeholders (streaming.js:215)
        var mat = new THREE.MeshBasicMaterial({ color: color, wireframe: true, transparent: true, opacity: 0.4, depthWrite: false });
        var im = new THREE.InstancedMesh(geo, mat, drows.length);
        im.frustumCulled = false; im.renderOrder = -1;   // per-child (matches #184's single-mesh renderOrder)
        for (var j = 0; j < drows.length; j++) {
          var r = drows[j], p = A.ifc2three(r[0], r[1], r[2]);
          _pos.set(p.x, p.y, p.z);
          _scl.set(r[3] || 0.3, r[5] || 0.3, r[4] || 0.3);   // bbox (x, z, y) — axis swap matches ifc2three
          m4.compose(_pos, _q, _scl);
          im.setMatrixAt(j, m4);
        }
        im.instanceMatrix.needsUpdate = true;
        group.add(im); total += drows.length;
      }
      group.renderOrder = -1;
      group.userData._mergedGhost = true;
      A.scene.add(group);
      _mergedGhost = group; _mergedGhostBld = A.activeBuilding;
      var ms = ((performance && performance.now) ? performance.now() : 0) - t0;
      console.log('[MG] §SHELL_GHOST_BBOX bld=' + A.activeBuilding + ' boxes=' + total + ' discs=' + discs.length +
        ' build_ms=' + ms.toFixed(0));
      if (A.markDirty) A.markDirty();
      return group;
    }
    function toggleMergedGhost() {
      // Alt+X: show the envelope ghost ALONE — hide every solid mesh via filterByGuids (VISIBILITY ONLY,
      // no material.opacity/color mutated → clean toggle, no residue). Off → everything restored.
      if (_mergedGhost && _mergedGhostBld === A.activeBuilding) {
        _mergedGhost.visible = !_mergedGhost.visible;
        if (A.filterByGuids) A.filterByGuids(_mergedGhost.visible ? new Set() : null); // on → hide solids; off → restore
        console.log('[MG] §GHOST_XRAY visible=' + _mergedGhost.visible + ' solids=' + (_mergedGhost.visible ? 'hidden' : 'shown'));
        if (A.markDirty) A.markDirty();
        return _mergedGhost.visible;
      }
      var _mg = _buildMergedGhost();
      if (_mg && A.filterByGuids) A.filterByGuids(new Set()); // first build → hide solids so the ghost stands alone
      return !!_mg;
    }
    window._mergeGhost = toggleMergedGhost;
    window.toggleGhostXray = toggleMergedGhost; // Alt+X — ghost x-ray (cached, cheap)
    window.ghostXrayOn = function() { return !!(_mergedGhost && _mergedGhost.visible && _mergedGhostBld === A.activeBuilding); }; // §GHOST_STATE — for pill/Help isActive
    // §BBOX_GHOST_STUCK_RESET witness hooks — exposed ONLY so the fix can be verified without
    // reverse-engineering the Find panel's DOM (same convention as A._showClassCost above). Forces
    // the exact precondition `_drillSelect()`'s §BBOX_SHELL_DEFAULT creates (lens-owned ghost, solids
    // hidden) without needing a real large-building drill click.
    A._debugForceGhostLensOwned = function() {
      var g = _buildMergedGhost();
      if (g) { g.visible = true; _mgLensOwned = true; if (A.filterByGuids) A.filterByGuids(new Set()); }
      return { built: !!g, mgLensOwned: _mgLensOwned, ghostVisible: !!(g && g.visible) };
    };
    A._debugGhostLensOwned = function() { return { mgLensOwned: _mgLensOwned, ghostVisible: !!(_mergedGhost && _mergedGhost.visible) }; };
    A._setTreeMode = _setTreeMode;

    // Build InstancedMeshes of the real geometry for `set`. color!=null → one cyan opaque
    // material (the highlighted item); color==null → opaque CLONE of each element's real
    // material (so the phase reads solid over the x-rayed base). Returns elements drawn.
    // §PERF: the element_instances⋈transforms⋈meta join is STATIC per building but was
    // re-run on EVERY drill (twice — solid+lit), marshalling the whole table through sql.js
    // each tap → the "panel responds late / unresponsive to touch". Cache it per activeBuilding;
    // the first drill pays the query, every subsequent tap reuses the rows.
    var _instRows = null, _instRowsBld = null;
    function _getInstanceRows() {
      if (_instRows && _instRowsBld === A.activeBuilding) return _instRows;
      try {
        _instRows = A.dbQuery("SELECT i.guid, i.geometry_hash, t.center_x, t.center_y, t.center_z," +
          " t.rotation_x, t.rotation_y, t.rotation_z, m.material_rgba, m.ifc_class" +
          " FROM element_instances i JOIN element_transforms t ON t.guid=i.guid" +
          " JOIN elements_meta m ON m.guid=i.guid") || [];
        _instRowsBld = A.activeBuilding;
        console.log('[RP-C] §INSTROWS_CACHED rows=' + _instRows.length + ' bld=' + A.activeBuilding);
      } catch (e) { console.log('[RP-C] §SHAPE_ERR ' + e.message); _instRows = []; }
      return _instRows;
    }
    // §PERF: the same join but for JUST this set's guids — instant for a room/item (a few rows) vs the
    // whole-building cache. Reuses the cache if it's already built (no point re-querying then).
    function _instRowsForSet(set) {
      if (_instRows && _instRowsBld === A.activeBuilding) return _instRows;  // cache already warm → use it
      var guids = [];
      set.forEach(function(g) { guids.push(g); });
      if (!guids.length) return [];
      var ph = guids.map(function() { return '?'; }).join(',');
      try {
        var r = A.dbQuery("SELECT i.guid, i.geometry_hash, t.center_x, t.center_y, t.center_z," +
          " t.rotation_x, t.rotation_y, t.rotation_z, m.material_rgba, m.ifc_class" +
          " FROM element_instances i JOIN element_transforms t ON t.guid=i.guid" +
          " JOIN elements_meta m ON m.guid=i.guid WHERE i.guid IN (" + ph + ")", guids) || [];
        console.log('[RP-C] §INSTROWS_SET rows=' + r.length + ' of set=' + guids.length + ' (direct, no full join)');
        return r;
      } catch (e) { console.log('[RP-C] §SHAPE_ERR_SET ' + e.message); return _getInstanceRows(); }
    }

    // ── §FIND_COST (BIM→Project TASK A, docs/BIMtoProject.md §A): indicative 5D cost of a selection ──
    // Same currency-free quantity basis as analysis_sidecar.js compute5D/apply5DRates (the consistency
    // invariant: round(rate×qty) in JS Number — BigDecimal is reserved for the ERP push, Task C).
    // Cost folds over the focusSet GUIDs, so EVERY selection kind (storey/disc/type/room/item/phase)
    // is handled uniformly. Bound params cap at 999 → chunk by 900. Non-invent: a class with no pack
    // rate contributes 0 (never a guessed price). Witness W-FIND-COST (tests/poc_find_cost.js).
    var _SELCOST_CAP = 30000;       // beyond this, the per-guid fold is too heavy for an indicative readout
    var _AREA_EXPR_SC =
      "MAX(t.bbox_x,t.bbox_y,t.bbox_z) * CASE " +
      "WHEN t.bbox_x>=t.bbox_y AND t.bbox_x>=t.bbox_z THEN MAX(t.bbox_y,t.bbox_z) " +
      "WHEN t.bbox_y>=t.bbox_x AND t.bbox_y>=t.bbox_z THEN MAX(t.bbox_x,t.bbox_z) " +
      "ELSE MAX(t.bbox_x,t.bbox_y) END";
    function _rates() { return (typeof window !== 'undefined' && window.RATES) || (typeof RATES !== 'undefined' ? RATES : {}); }
    function _cur() { return (typeof window !== 'undefined' && window._TRL && window._TRL.cur) || 'RM'; }
    function _pack() { return (typeof window !== 'undefined' && window.RATE_TEMPLATE_NAME) || 'hardcoded'; }
    // Priced rows for a selection at (disc,cls,storey) granularity — the apply5DRates shape the fold
    // engine (proj_fold.js) consumes. ONE source for both the bar cost (Task A) and the > to ERP push (Task C).
    function _selectionPriced(set) {
      var R = _rates();
      if (!set || !set.size || !A.dbQuery) return null;
      var guids = []; set.forEach(function (g) { guids.push(g); });
      if (guids.length > _SELCOST_CAP) return { capped: true, elements: guids.length, rows: [] };
      var agg = {}; // disc|cls|storey → {disc,cls,storey,cnt,len,area,vol}
      for (var i = 0; i < guids.length; i += 900) {
        var chunk = guids.slice(i, i + 900);
        var ph = chunk.map(function () { return '?'; }).join(',');
        var rows = A.dbQuery(
          "SELECT m.discipline, m.ifc_class, m.storey, COUNT(*) cnt, " +
          "SUM(MAX(t.bbox_x,t.bbox_y,t.bbox_z)) len, SUM(" + _AREA_EXPR_SC + ") area, " +
          "SUM(t.bbox_x*t.bbox_y*t.bbox_z) vol " +
          "FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid " +
          "WHERE m.guid IN (" + ph + ") AND t.bbox_x IS NOT NULL AND t.bbox_x>0 " +
          "GROUP BY m.discipline, m.ifc_class, m.storey", chunk) || [];
        rows.forEach(function (r) {
          var k = (r[0] || '_') + '|' + (r[1] || '_') + '|' + (r[2] || '_');
          var a = agg[k] || (agg[k] = { disc: r[0] || '_', cls: r[1] || '_', storey: r[2] || '_', cnt: 0, len: 0, area: 0, vol: 0 });
          a.cnt += r[3] || 0; a.len += r[4] || 0; a.area += r[5] || 0; a.vol += r[6] || 0;
        });
      }
      var priced = [], elements = 0;
      Object.keys(agg).forEach(function (k) {
        var a = agg[k], rt = R[a.cls], unit = rt ? rt.unit : 'EA', rate = rt ? rt.rate : 0, qty;
        if (unit === 'M') qty = a.len; else if (unit === 'M2') qty = a.area; else if (unit === 'M3') qty = a.vol; else { unit = rt ? unit : 'EA'; qty = a.cnt; }
        elements += a.cnt;
        priced.push({ disc: a.disc, cls: a.cls, storey: a.storey, count: a.cnt, unit: unit, qty: qty, rate: rate, cost: Math.round(rate * qty) });
      });
      return { capped: false, elements: elements, rows: priced };
    }
    function _selectionCost(set) {
      var p = _selectionPriced(set);
      if (!p) return null;
      if (p.capped) { console.log('[RP-C] §FIND_COST_SKIP elems=' + p.elements + ' > cap=' + _SELCOST_CAP); return { capped: true, elements: p.elements, cost: 0, cur: _cur(), pack: _pack() }; }
      var cost = p.rows.reduce(function (s, r) { return s + r.cost; }, 0);
      return { capped: false, elements: p.elements, cost: cost, cur: _cur(), pack: _pack() };
    }
    function _updateSelCost(set, scopeLabel) {
      _lastSelSet = (set && set.size) ? set : null;            // remember selection for the > to ERP push
      _lastSelLabel = scopeLabel || '';
      // selection changed → any prior push's deep-link is now stale; hide it until this set is pushed
      if (elErpOpen) { elErpOpen.style.display = 'none'; elErpOpen.removeAttribute('href'); elErpOpen.title = 'Open the created Project Order in iDempiere (GardenWorld)'; }
      var _eb0 = document.getElementById('find-erp-btn'); if (_eb0) _eb0.title = 'Push selection to ERP as a Project Order';
      // BIM→Project (find-erp-deeplink): purely-additive — if this building is ALREADY a folded Project
      // Order, surface the "open ↗" link to it on selection so the user opens the existing order instead
      // of re-creating it. Guarded + async; cannot affect cost/push/navigate (user: don't impact Find).
      try { _surfaceExistingOrder(set); } catch (e) {}
      var el = document.getElementById('find-selected-cost');
      if (!el) return;
      try {
        var res = _selectionCost(set);
        if (!res) { el.textContent = ''; return; }
        if (res.capped) { el.textContent = '~ ' + res.cur; el.title = 'Selection too large for indicative cost (' + res.elements + ' elements)'; return; }
        el.textContent = res.cur + ' ' + res.cost.toLocaleString(undefined, { maximumFractionDigits: 0 });
        el.title = 'Indicative 5D cost · ' + res.elements + ' elements · pack ' + res.pack;
        console.log('[RP-C] §FIND_COST scope="' + (scopeLabel || '') + '" elements=' + res.elements +
          ' cost=' + res.cost + ' cur=' + res.cur + ' pack=' + res.pack);
      } catch (e) { el.textContent = ''; console.log('[RP-C] §FIND_COST_ERR ' + e.message); }
    }

    // ── §PROJ_PUSH (BIM→Project TASK C, docs/BIMtoProject.md §C): > to ERP — fold the selection into
    // an iDempiere C_Project via the proven engine proj_fold.js (window.ProjFold). The fold is the
    // witnessed part (W-PROJ-PUSH/FOLD/SEQ, tests/poc_proj_push.js); here we wire the UI call path.
    // The writable ERP db is loaded lazily (fetch erp/ad_seed.db → sql.js) and the folded result is
    // persisted to OPFS (bim_project_orders.db) — a viewer-owned project-orders store. NOTE: the
    // cross-page hand-off so the ERP app reads it is the BIMtoERP §B write-path (follow-on).
    var _bimErpDb = null;
    function _ensureErpDb() {
      if (_bimErpDb) return Promise.resolve(_bimErpDb);
      var SQL = A._SQL || window.SQL || window._SQL_CACHED;   // viewer caches the sql.js factory as A._SQL (streaming.js:1343); window.SQL is only set on the ERP page
      if (!SQL || !window.ProjFold) return Promise.resolve(null);
      return APP.cachedFetch('../erp/ad_seed.db')
        .then(function (buf) { _bimErpDb = new SQL.Database(new Uint8Array(buf)); return _bimErpDb; })
        .catch(function (e) { console.log('[RP-C] §PROJ_PUSH_DBERR ' + e.message); return null; });
    }
    function _persistErpDb(db) {
      try {
        if (!navigator.storage || !navigator.storage.getDirectory) return Promise.resolve(false);
        var bytes = db.export();
        return navigator.storage.getDirectory()
          .then(function (root) { return root.getDirectoryHandle('bim_analysis', { create: true }); })
          .then(function (dir) { return dir.getFileHandle('bim_project_orders.db', { create: true }); })
          .then(function (fh) { return fh.createWritable(); })
          .then(function (w) { return w.write(bytes).then(function () { return w.close(); }); })
          .then(function () { return true; }).catch(function () { return false; });
      } catch (e) { return Promise.resolve(false); }
    }
    // ── §S2 (TM_4D5D_VARIANCE_LANE) — Zoom-Across cost fold ─────────────────────────────────────────────────
    // When the ERP "Zoom Across" pill lands the viewer on an IFC class, fold that class's STORED twin cost into
    // the #info-panel: the line's PlannedAmt (line grain) + the COMMITTED from its phase (c_projectphase_id →
    // C_ProjectPhase.CommittedAmt — line CommittedAmt is null on disk BY DESIGN, it earns at S5) + the whole
    // project pair (header scope). READ-only off the same ../erp/ad_seed.db the push path loaded. NO recompute.
    function _money(n) { n = Math.round(Number(n) || 0); var a = Math.abs(n), s = n < 0 ? '-' : '';
      if (a >= 1e6) return s + 'RM' + (a / 1e6).toFixed(1) + 'M'; if (a >= 1e3) return s + 'RM' + Math.round(a / 1e3) + 'K'; return s + 'RM' + a; }
    function _foldClassTwin(ifcClass) {
      return _ensureErpDb().then(function (db) {
        if (!db) return null;
        var building = A.activeBuilding;
        function ex(sql, p) { try { var r = db.exec(sql, p || []); return (r.length && r[0].values.length) ? r[0].values : null; } catch (e) { return null; } }
        var pr = ex("SELECT C_Project_ID,PlannedAmt,CommittedAmt FROM C_Project WHERE Value=?", [building]);
        if (!pr) return null;   // this building isn't a folded project → no cost fold
        var pid = pr[0][0], proj = { planned: Number(pr[0][1] || 0), committed: Number(pr[0][2] || 0) };
        var line = null, phase = null;
        var ln = ex("SELECT pl.PlannedAmt, pl.c_projectphase_id FROM C_ProjectLine pl JOIN M_Product p ON pl.M_Product_ID=p.M_Product_ID WHERE pl.C_Project_ID=? AND p.Value=?", [pid, ifcClass]);
        if (ln) {
          line = { planned: Number(ln[0][0] || 0), phaseId: ln[0][1] };
          var ph = ex("SELECT Name,PlannedAmt,CommittedAmt,StartDate FROM C_ProjectPhase WHERE C_ProjectPhase_ID=?", [ln[0][1]]);
          if (ph) phase = { name: ph[0][0], planned: Number(ph[0][1] || 0), committed: Number(ph[0][2] || 0), start: ph[0][3] };
        }
        return { building: building, projectId: pid, ifcClass: ifcClass, project: proj, line: line, phase: phase };
      }).catch(function (e) { console.log('§ZOOM-COST err=' + e.message); return null; });
    }
    // BIM→Project (find-erp-deeplink): when the active building ALREADY has a folded C_Project, surface
    // the existing "open ↗" deep-link on selection — so the user opens that Project Order rather than
    // re-creating it. PURELY ADDITIVE: reuses the proven _ensureErpDb + the same record URL _pushToErp
    // builds; only sets the elErpOpen link + tooltips; wrapped so it can NEVER affect cost/push/navigate.
    // (Slice-1 grain = project-level: the link opens the building's C_Project, window 130. Per-line/guid
    //  precision + the OPFS cross-session store are noted follow-ups in FIND_OPENLINK_EXISTING_ORDERLINE.md.)
    function _surfaceExistingOrder(set) {
      if (!elErpOpen || !set || !set.size) return;
      var mySet = set;                                   // race guard — selection may change before resolve
      _ensureErpDb().then(function (db) {
        if (!db || mySet !== _lastSelSet) return;        // db not available, or selection moved on
        var pid = null;
        try {
          var r = db.exec("SELECT C_Project_ID FROM C_Project WHERE Value=?", [A.activeBuilding]);
          pid = (r.length && r[0].values.length) ? r[0].values[0][0] : null;
        } catch (e) { return; }
        if (pid == null) return;                          // building not folded yet → keep create-push as-is
        var url = '../erp/idempiere.html?client=garden&window=130&record=' + encodeURIComponent(pid);
        elErpOpen.setAttribute('href', url);
        elErpOpen.style.display = 'inline-block';
        elErpOpen.title = 'Already in a Project Order — open it (no need to push again)';
        var btn = document.getElementById('find-erp-btn');
        if (btn) btn.title = 'Already a Project Order — use the “open ↗” link, or push to add more';
        console.log('[RP-C] §PROJ_LINK_EXISTING building="' + A.activeBuilding + '" project=' + pid + ' url=' + url);
      }).catch(function () { /* additive — never impact Find */ });
    }
    // §2026-07-04 thread A ("zoom to iDempiere" from Room/storey) — a Building already compiles onto a real
    // M_Warehouse row (HBA's ad_tenancy.js compileBuilding, threaded onto A._hbaTenancySpec.warehouse by
    // hba_lens.js's bindStoreysFromModel) and a SECOND AD_Window "Construction" now exists over that same
    // row (scripts/seed_hba_construction.js) alongside window 139. Room-tap/storey-tap surfaces an "iDempiere
    // ↗" link to it — building-grain (the same warehouse record for every room in this building, honestly;
    // there is no per-room AD_Window, only per-room M_Locator/M_Product, which is a different, deeper link
    // not in scope here). PURELY ADDITIVE: only touches #find-construction-open; HBA absent/inactive →
    // honest no-op (never fabricates a warehouse id), same discipline as _surfaceExistingOrder above.
    //
    // §GOVERNANCE-GATE (design review, 2026-07-04): compileBuilding's `warehouse.m_warehouse_id` is a REAL
    // persisted id only once ERP governance has resolved (`_hbaTenancySpec._governed===true` — a DB hit via
    // erpQuery, ad_tenancy.js); before that it's a throwaway session-local mint (always the literal `1`) that
    // matches nothing in the real dictionary. A link built off the ungoverned id would SOMETIMES 404/point at
    // the wrong record depending on load timing — that's a correctness bug, not a feature gap. Gate on it.
    function _surfaceConstructionLink(guid, label) {
      if (!elConstructionOpen) return;
      elConstructionOpen.style.display = 'none';
      elConstructionOpen.removeAttribute('href');
      try {
        var HL = (typeof HBALens !== 'undefined') ? HBALens : (typeof window !== 'undefined' ? window.HBALens : null);
        var spec = A._hbaTenancySpec;
        var whId = spec && spec.warehouse ? spec.warehouse.m_warehouse_id : null;
        if (!HL || !HL.erpLink || !HL.AD_WINDOWS || whId == null || !spec._governed) {
          console.log('[RP-TA] §CONSTRUCTION_LINK skip guid=' + guid + ' (HBA inactive, no compiled warehouse, or not yet governed — honest no-op)');
          return;
        }
        var url = HL.erpLink(HL.AD_WINDOWS.CONSTRUCTION, whId);
        elConstructionOpen.setAttribute('href', url);
        elConstructionOpen.style.display = 'inline-block';
        elConstructionOpen.title = 'Open ' + (A.buildingName || 'this building') + ' in iDempiere (Construction) — via ' + (label || guid);
        console.log('[RP-TA] §CONSTRUCTION_LINK guid=' + guid + ' warehouse=' + whId + ' url=' + url);
      } catch (e) { console.log('[RP-TA] §CONSTRUCTION_LINK err=' + e.message); }
    }
    function _pct(planned, committed) { return planned > 0 ? Math.round((committed - planned) * 100 / planned) : 0; }
    function _showClassCost(ifcClass, matchCount, guid) {
      var box = document.getElementById('info-cost'); if (!box) return;
      box.style.display = 'none';
      _foldClassTwin(ifcClass).then(function (t) {
        if (!t) { console.log('§ZOOM-COST skip — no twin for class="' + ifcClass + '"'); return; }
        var pj = t.project, pjPct = _pct(pj.planned, pj.committed);
        var html = '<div style="color:#4fc3f7;font-weight:bold;margin-bottom:3px">Cost variance <span style="font-size:9px;color:#888;font-weight:normal">· from records</span></div>';
        if (t.phase) {   // the committed actual lives at phase/control-account grain
          var phPct = _pct(t.phase.planned, t.phase.committed), over = t.phase.committed >= t.phase.planned;
          html += '<div><span class="label">' + ifcClass + '</span>: <span class="value">' + _money(t.line ? t.line.planned : 0) + ' planned</span></div>';
          html += '<div><span class="label">Phase ' + t.phase.name + '</span>: <span class="value">' + _money(t.phase.planned) + ' → ' + _money(t.phase.committed) +
            ' <b style="color:' + (over ? '#ff6b6b' : '#26a69a') + '">(' + (phPct >= 0 ? '+' : '') + phPct + '%)</b></span></div>';
        }
        html += '<div><span class="label">Project ' + t.building + '</span>: <span class="value">' + _money(pj.planned) + ' → ' + _money(pj.committed) +
          ' <b style="color:' + (pj.committed >= pj.planned ? '#ff6b6b' : '#26a69a') + '">(' + (pjPct >= 0 ? '+' : '') + pjPct + '%)</b></span></div>';
        // "View at this moment" — freeze TM on the moment this thing is built. With a guid (a specific picked
        // element) → §360-IDENTITY tmJumpToElement (the EXACT item); else fall back to the class's phase window.
        var canElem = guid && typeof window.tmJumpToElement === 'function';
        var canPhase = t.phase && typeof window.tmJumpToPhase === 'function';
        if (canElem || canPhase) {
          html += '<div style="margin-top:6px"><button id="info-cost-tm" style="background:#1565c0;color:#fff;border:none;border-radius:4px;padding:4px 10px;font-size:11px;cursor:pointer">⏱ View at this moment</button></div>';
        }
        box.innerHTML = html;
        box.style.display = 'block';
        var ipnl = document.getElementById('info-panel'); if (ipnl) ipnl.style.display = 'block';
        var jb = document.getElementById('info-cost-tm');
        if (jb) jb.addEventListener('click', function (e) {
          e.stopPropagation();
          if (canElem) { console.log('§ZOOM-COST_JUMP_ELEM class="' + ifcClass + '" guid="' + guid + '"'); window.tmJumpToElement(guid); }
          else { console.log('§ZOOM-COST_JUMP class="' + ifcClass + '" phase="' + t.phase.name + '"'); window.tmJumpToPhase(t.phase.name); }
        });
        console.log('§ZOOM-COST class="' + ifcClass + '" matches=' + (matchCount || 0) + ' linePlanned=' + (t.line ? t.line.planned : 'n/a') +
          ' phase="' + (t.phase ? t.phase.name : '-') + '" phasePlanned=' + (t.phase ? t.phase.planned : '-') + ' phaseCommitted=' + (t.phase ? t.phase.committed : '-') +
          ' projPlanned=' + pj.planned + ' projCommitted=' + pj.committed + ' projPct=' + pjPct + '%');
      });
    }
    A._showClassCost = _showClassCost;   // exposed for applyFindScope + witnesses

    // BIM→Project: every › ERP push outcome gets audio + a clear status (user: "good practice — a status
    // message, with audio feedback; happy audio when it succeeds"). Reuses the SFX engine (window.__sfx,
    // rows in sfx.json — NOT hardcoded synth, the wh_walk/PRE-PINNED-FACT idiom). Silent if audio is off.
    function _pushSfx(id) {
      var sfx = window.__sfx, ok = !!(sfx && typeof sfx.play === 'function' && id);
      if (ok) { try { sfx.play(id); } catch (e) { ok = false; } }
      console.log('[RP-C] §PROJ_PUSH_AUDIO id=' + id + ' sfx=' + (ok ? 'played' : 'absent'));
    }
    function _pushReject(msg) { if (A.status) A.status.textContent = msg; _pushSfx('erp_reject'); }
    function _pushToErp() {
      var set = _lastSelSet;
      if (!set || !set.size) { _pushReject('Select something to push to ERP'); return; }
      if (!window.ProjFold) { _pushReject('ERP push engine not loaded'); console.log('[RP-C] §PROJ_PUSH_DEFER ProjFold absent'); return; }
      var building = A.activeBuilding;
      var priced = _selectionPriced(set);
      // no priced rows = nothing costable (e.g. a single element, or an old-schema model whose transforms
      // carry no bbox sizes). Say so + a low cue, instead of looking like the push silently did nothing.
      if (!priced || !priced.rows.length) { _pushReject('Nothing costable in selection — pick a type/storey group (this model may lack element sizes)'); console.log('[RP-C] §PROJ_PUSH_DEFER no priced rows (elements=' + (priced ? priced.elements : 0) + ')'); return; }
      if (A.status) A.status.textContent = 'Folding Project Order…';
      _ensureErpDb().then(function (db) {
        if (!db) { _pushReject('ERP db unavailable for push'); console.log('[RP-C] §PROJ_PUSH_DEFER no ERP db'); return; }
        var opts = {
          seqRules: window.SEQUENCE_RULES || {}, laborRates: window.LABOR_RATES || {},
          packCurrencyISO: _cur(), now: (function () { try { return new Date().toISOString().replace('T', ' ').slice(0, 19); } catch (e) { return '2026-01-01 00:00:00'; } })()
        };
        var r = window.ProjFold.foldProjectOrder(db, building, priced.rows, opts);
        console.log('[RP-C] §PROJ_PUSH project="' + building + '" scope="' + _lastSelLabel + '" phases=+' + r.created.phases +
          ' tasks=+' + r.created.tasks + ' lines=+' + r.created.lines + ' products=+' + r.created.products +
          ' order=' + (r.orderId || '-') + ' plannedAmt=' + r.plannedAmt);
        // §F9 — when BlueFuture is engaged, route the pushed Project Order onto the active blue branch
        // (op-log + projection tag) so it's a speculative UNOFFICIAL draft, invisible to official chrome
        // until accepted on the timeline. No-op in the plain viewer (BlueFuture/BlueFold absent → white push).
        try {
          var _bf = window.BlueFuture, _bfold = window.BlueFold;
          if (_bf && _bfold && _bf.isBlue && _bf.isBlue() && r.created.projects) {
            var _br = _bf.branchId ? _bf.branchId() : (_bf.readBranch && _bf.readBranch());
            var _tags = [{ table: 'C_Project', idCol: 'C_Project_ID', id: r.projectId }];
            if (r.orderId) _tags.push({ table: 'C_Order', idCol: 'C_Order_ID', id: r.orderId });
            _bfold.commitBlue(db, _br, [{ op_type: 'PROJECT_FOLD', output_guid: String(r.projectId), params: { building: building, plannedAmt: String(r.plannedAmt) } }], _tags)
              .then(function (b) { console.log('[RP-C] §PROJ_PUSH_BLUE branch=' + _br + ' ok=' + (b && b.ok) + ' ops=' + JSON.stringify(b && b.opIds) + ' (speculative — invisible to official chrome)'); });
          }
        } catch (e) { console.log('[RP-C] §PROJ_PUSH_BLUE_ERR ' + e.message); }
        // §F4 — the PM control readout (contract sum + EVM) on the freshly folded project.
        var ctrl = null;
        if (window.ProjControl && r.projectId) {
          try {
            ctrl = window.ProjControl.projectControl(db, r.projectId);
            console.log('[RP-C] §PROJ_CONTROL project="' + building + '" original=' + ctrl.contract.original +
              ' approvedVOs=' + ctrl.contract.approvedVOs + ' revised=' + ctrl.contract.revised +
              ' bac=' + ctrl.evm.bac + ' pv=' + ctrl.evm.pv + ' ev=' + ctrl.evm.ev + ' ac=' + ctrl.evm.ac +
              ' cv=' + ctrl.evm.cv + ' sv=' + ctrl.evm.sv + ' cpi=' + ctrl.evm.cpi + ' spi=' + ctrl.evm.spi +
              ' %complete=' + ctrl.evm.percentComplete + (ctrl.note ? ' note="' + ctrl.note + '"' : ''));
          } catch (e) { console.log('[RP-C] §PROJ_CONTROL_ERR ' + e.message); }
        }
        _persistErpDb(db).then(function (ok) {
          console.log('[RP-C] §PROJ_PUSH_PERSIST opfs=' + ok + ' store=bim_project_orders.db');
          var revised = ctrl ? Number(ctrl.contract.revised) : Number(r.plannedAmt);
          if (A.status) A.status.textContent = 'Project Order: ' + r.created.lines + ' lines · contract ' + _cur() + ' ' +
            revised.toLocaleString(undefined, { maximumFractionDigits: 0 }) + (ok ? ' (saved)' : '');
          // BIM→Project (find-erp-deeplink): surface the created record's deep-link at the ERP spot. The OPFS
          // store above is overlaid onto GardenWorld at iDempiere boot (bim_orders_overlay.js), so this URL
          // lands on the real C_Project (window 130) AFTER the standard GW login (role/access kept by design).
          if (elErpOpen && r && r.projectId != null) {
            var url = '../erp/idempiere.html?client=garden&window=130&record=' + encodeURIComponent(r.projectId);
            elErpOpen.setAttribute('href', url);
            elErpOpen.style.display = 'inline-block';
            _pushSfx('erp_pushed');   // happy chime — Project Order folded + deep-link ready
            console.log('[RP-C] §PROJ_PUSH_LINK project=' + r.projectId + ' order=' + (r.orderId || '-') + ' url=' + url);
          }
        });
      });
    }

    // solidOpacity (optional): for the kept-solid CONTEXT build (color==null), render it at this
    // opacity instead of fully opaque. Room lens passes 0.3 so the selected room shows THROUGH its
    // enclosing floor; Material/Type/Phase drills omit it → context stays solid (1.0), as before.
    // colorOpacity (optional, color path): render the highlight colour SEE-THROUGH at this opacity
    // (transparent, depthWrite off) instead of flat opaque — the "usual mesh highlight" look so the
    // item's real material reads through it. null → opaque (legacy).
    function _buildShapeMeshes(set, color, solidOpacity, colorOpacity, clipPlanes) {
      if (!A.scene || typeof THREE === 'undefined' || !A.ifc2three || !A.meshCache || !set || !set.size) return 0;
      // §PERF: a room/item is a handful of guids — fetch ONLY those (instant) instead of marshalling the
      // whole 122k join through sql.js (the multi-second freeze on the first sub-panel click). Big groups
      // (a storey) still use the cached full join. Threshold keeps the IN-list SQL small.
      var rows = (set.size <= 1500) ? _instRowsForSet(set) : _getInstanceRows();
      if (!rows.length) return 0;
      var groups = {}, total = 0, missing = 0;
      for (var i = 0; i < rows.length && total < _HL_CAP; i++) {
        var r = rows[i];
        if (r[2] == null || !set.has(r[0])) continue;
        var hash = r[1];
        if (!hash || !A.meshCache[hash]) { missing++; continue; }
        var key = color != null ? hash : (hash + '|' + (r[8] || '_'));
        if (!groups[key]) groups[key] = { hash: hash, rgba: r[8], ifc: r[9], els: [] };
        groups[key].els.push(r); total++;
      }
      // colorOpacity set → see-through highlight that SHINES THROUGH occluders (depthTest off) so the
      // small final item stays visible even zoomed-out / behind other geometry.
      var cyan = color != null ? new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide,
        transparent: colorOpacity != null, opacity: colorOpacity != null ? colorOpacity : 1,
        depthWrite: colorOpacity == null, depthTest: colorOpacity == null,
        clippingPlanes: clipPlanes || null, clipIntersection: false }) : null;
      var made = 0, m4 = new THREE.Matrix4(), eu = new THREE.Euler(),
          q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
      for (var k in groups) {
        var g = groups[k], geo = A.meshCache[g.hash];
        var mat;
        if (cyan) mat = cyan;
        else {
          var base = A._getMaterial ? A._getMaterial(g.rgba, g.ifc) : null;
          mat = base ? base.clone() : new THREE.MeshStandardMaterial({ color: 0xcccccc });
          if (solidOpacity != null && solidOpacity < 1) {
            // §DEPTH ghost (0.2 ancestor): SHINE THROUGH the hidden base. The dimmed base is opacity-0
            // but still writes depth → it OCCLUDED this 0.2 overlay (deeper group "showed only solid,
            // no 0.2"). depthTest off + low renderOrder draws it under the solid focus, through the
            // invisible base. (Witnessed: ghost 0.20 dT0 dW0 ro1; Hospital intermediate anc=[0.2×N].)
            mat.transparent = true; mat.opacity = solidOpacity; mat.depthWrite = false; mat.depthTest = false;
          } else {
            mat.transparent = false; mat.opacity = 1; mat.depthWrite = true;
          }
          if (clipPlanes) { mat.clippingPlanes = clipPlanes; mat.clipIntersection = false; }  // §ROOM-CLIP
        }
        var inst = new THREE.InstancedMesh(geo, mat, g.els.length);
        inst.frustumCulled = false;
        for (var j = 0; j < g.els.length; j++) {
          var e = g.els[j], p = A.ifc2three(e[2], e[3], e[4]);
          pos.set(p.x, p.y, p.z);
          eu.set(e[5] || 0, e[7] || 0, -(e[6] || 0));
          q.setFromEuler(eu); m4.compose(pos, q, sc);
          inst.setMatrixAt(j, m4);
        }
        inst.instanceMatrix.needsUpdate = true;
        // ghost(0.2)=1 draws first (under), solid focus=2, cyan shine=3 on top
        inst.renderOrder = color != null ? 3 : ((solidOpacity != null && solidOpacity < 1) ? 1 : 2);
        inst.userData._shapeOverlay = true;
        // §UNIFIED-SELECT: map each overlay instance back to its real element guid so a 3D tap on
        // the overlay (picking.js instanced path) resolves the element — this is what lets a re-tap
        // on a focused/selected element DESELECT it (the overlay sits over the x-ray-dimmed base, so
        // without this the tap hits a guid-less mesh and the toggle never fires). Cleared in
        // _clearShapeOverlays. inst.id is globally unique → never collides with real scene meshes.
        A._instanceMeta = A._instanceMeta || {};
        A._instanceMeta[inst.id] = g.els.map(function (e) { return { guid: e[0] }; });
        A.scene.add(inst);
        _shapeOverlays.push({ mesh: inst, disposeMat: true }); // clones are ours to dispose
        made += g.els.length;
      }
      if (missing) console.log('[RP-C] §SHAPE_MISS hashes_not_streamed=' + missing + ' (set=' + set.size + ')');
      return made;
    }

    // §RP: drop the x-rayed rest to a given opacity (phase drill wants 0.2, harder than the
    // default 0.3). toggleXray already stored _origOpacity, so X-Ray OFF still restores to 1.
    // Our shape overlays use fresh materials (not in _matCache / flagged) → unaffected.
    function _dimXrayTo(op) {
      if (!A.xrayOn) return;
      var c = A._matCache || {}, ks = Object.keys(c), n = 0, samp = [];
      if (ks.length) {
        ks.forEach(function(k) { var m = c[k]; if (m) { m.transparent = true; m.opacity = op; m.needsUpdate = true; n++; } });
        for (var z = 0; z < Math.min(4, ks.length); z++) { var mm = c[ks[z]]; if (mm) samp.push(mm.opacity.toFixed(2) + (mm.transparent ? 'T' : 'F')); }
      } else if (A.scene) {
        A.scene.traverse(function(o) {
          if (o.isMesh && o.material && !(o.userData && (o.userData._shapeOverlay || o.userData._hlOverlay))) {
            o.material.transparent = true; o.material.opacity = op; o.material.needsUpdate = true; n++;
            if (samp.length < 4) samp.push(o.material.opacity.toFixed(2) + (o.material.transparent ? 'T' : 'F'));
          }
        });
      }
      // §-log the READBACK (actual post-set opacity) — proves the dim really took to `op` (test reads this).
      console.log('[RP-TB] §XRAY_DIM opacity=' + op + ' mats=' + (ks.length ? n : 'scene:' + n) +
        ' readback=[' + samp.join(',') + '] cache=' + ks.length + ' xrayOn=' + A.xrayOn);
      if (A.markDirty) A.markDirty();
    }

    function _clearRoomBoxes() {
      _roomBoxes.forEach(function(rb) {
        if (rb.mesh) {
          if (rb.mesh.parent) rb.mesh.parent.remove(rb.mesh);
          if (rb.mesh.geometry) rb.mesh.geometry.dispose();
          if (rb.mesh.material) rb.mesh.material.dispose();
        }
      });
      _roomBoxes = [];
    }

    var _USE_SHELL = false;                                   // §SHELL: parked — bbox-boundary too sparse (28 elems); needs class/PVS
    // §SHELL: the building's OUTFACING shell — elements whose bbox touches the outer building bbox (within
    // MARGIN of any of the 6 faces): exterior walls, floor + roof slabs. The deep interior (MEP, furniture
    // — the triangle-heavy occluded bulk) is excluded. Inline + cached per building. The dim context then
    // renders ONLY these (hidden rest = zero draw) → far fewer triangles, the real lever (geometry, not fill).
    var _extCache = null, _extBld = null;
    function _exteriorGuids() {
      if (_extCache && _extBld === A.activeBuilding) return _extCache;
      var set = new Set();
      try {
        var rows = A.dbQuery("SELECT guid, center_x, center_y, center_z, bbox_x, bbox_y, bbox_z" +
          " FROM element_transforms WHERE center_x IS NOT NULL") || [];
        var minx = Infinity, miny = Infinity, minz = Infinity, maxx = -Infinity, maxy = -Infinity, maxz = -Infinity;
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i], cx = r[1], cy = r[2], cz = r[3], hx = (r[4] || 0) / 2, hy = (r[5] || 0) / 2, hz = (r[6] || 0) / 2;
          if (cx - hx < minx) minx = cx - hx; if (cy - hy < miny) miny = cy - hy; if (cz - hz < minz) minz = cz - hz;
          if (cx + hx > maxx) maxx = cx + hx; if (cy + hy > maxy) maxy = cy + hy; if (cz + hz > maxz) maxz = cz + hz;
        }
        var M = 1.5;
        for (var j = 0; j < rows.length; j++) {
          var e = rows[j], ex = e[1], ey = e[2], ez = e[3], bx = (e[4] || 0) / 2, by = (e[5] || 0) / 2, bz = (e[6] || 0) / 2;
          if (ex - bx <= minx + M || ex + bx >= maxx - M || ey - by <= miny + M ||
              ey + by >= maxy - M || ez - bz <= minz + M || ez + bz >= maxz - M) set.add(e[0]);
        }
      } catch ( err) { console.warn('[RP-TB] §SHELL_ERR', err.message); }
      _extCache = set; _extBld = A.activeBuilding;
      console.log('[RP-TB] §SHELL exterior=' + set.size + ' (outfacing-shell dim context)');
      return set;
    }

    // §ROOM_LENS_TAXONOMY (ROOM_LENS_VISUAL_HIGHLIGHT_SPEC.md §2): category → shell/cuboid color
    // pair (fill, wire). 'habitable' keeps the purple this file already used for the single
    // selected-room cuboid (§ROOM-CUBOID below) — now a real per-CATEGORY color, not just a
    // selection-only accent. 'corridor' keeps the pre-existing default blue (was every room's
    // fixed default before this change — now deliberate, corridor-only). 'utilities' is a muted
    // dark grey — reads as "present, low-priority" without an alarming/error connotation.
    // §DEEP-PALETTE (2026-07-15l, user-reported live pre-deploy test on a large building, this
    // session): the bulk room-shine-through shell (_drawRoomShell below) always draws at a fixed
    // 10% opacity — tuned against the dark x-ray-dimmed backdrop, where a faint pastel tint reads
    // fine. The desktop bbox-shell default (§DESKTOP-BBOX-THRESHOLD, this same session) puts large
    // buildings on a much LIGHTER wireframe backdrop instead — the same 10% wash of a pastel hue
    // (0x9c6ade etc.) blends toward near-white there ("bland whitish", user's own words). Fix:
    // deepen the base hues themselves (user's own pick over a mode-aware-opacity/outline
    // alternative) so even a thin 10% wash still carries visible color against a light background.
    // `wire` (the SELECTED single room's bright cuboid border, §ROOM-CUBOID) is untouched — it
    // already renders near-opaque, not the washed-out case this fixes, and a lighter wire against a
    // now-deeper fill is if anything MORE legible than before.
    var ROOM_CATEGORY_COLORS = {
      habitable: { fill: 0x6a1b9a, wire: 0xd8b4fe },
      corridor: { fill: 0x0277bd, wire: 0x7fd6fb },
      restroom: { fill: 0x6d4c41, wire: 0xbcaaa4 },   // §RESTROOM-CLASS: wet sanitary room = brown (Material brown 600/200)
      kitchen: { fill: 0xff8f00, wire: 0xffe082 },    // §KITCHEN-CLASS: food-service room = amber (Material amber 800/200)
      bedroom: { fill: 0x00796b, wire: 0x80cbc4 },    // §BEDROOM-CLASS: sleeping room = teal (Material teal 700/200)
      utilities: { fill: 0x212121, wire: 0x5a5a5a }
    };
    function _categoryColor(category) {
      return ROOM_CATEGORY_COLORS[category] || ROOM_CATEGORY_COLORS.habitable;
    }
    // §RP-SHELL (option 3): a room's drawable OUTLINE is its IfcSpace volume (center+size), not a
    // mesh. Draw it as a translucent shine-through box so the Room axis shows the room MAP and a
    // selected room reads as a bright shell with its contents dimmer inside.
    function _drawRoomShell(center, size, opacity, color) {
      if (!A.scene || typeof THREE === 'undefined') return null;
      var geo = new THREE.BoxGeometry(size.x, size.y, size.z);
      var mat = new THREE.MeshBasicMaterial({ color: color || 0x4fc3f7, transparent: true,
        opacity: opacity, depthWrite: false, side: THREE.DoubleSide });
      var mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(center);
      mesh.renderOrder = 998;           // over the x-rayed model, under the cyan item overlay (999)
      mesh.userData._roomShell = true;
      A.scene.add(mesh);
      return mesh;
    }
    // §ROOM-CUBOID-STALE-FIX (2026-07-13, user-reported screenshot RoomOverSize.png): every call
    // pushed a NEW fill/wire/wireOuter trio into `_roomBoxes` under the SAME fixed guid keys, but
    // never removed the PREVIOUS trio first — the dim-other-shells pass in _roomSelect() (which
    // runs before this) only lowers old cuboid meshes to opacity 0.04, it never disposes them, so
    // an earlier-selected (possibly larger) room's cuboid lingered in the scene as a faint ghost
    // box — most visible in its wireframe (depthTest:false → always draws on top regardless of
    // opacity). Strip any existing cuboid entries first so exactly ONE selected-room cuboid exists.
    function _clearRoomCuboid() {
      var kept = [];
      _roomBoxes.forEach(function(rb) {
        if (rb.guid === '_cuboidFill' || rb.guid === '_cuboidFillGlow' || rb.guid === '_cuboidWireOuter' || rb.guid === '_cuboidWire') {
          if (rb.mesh) {
            if (rb.mesh.parent) rb.mesh.parent.remove(rb.mesh);
            if (rb.mesh.geometry) rb.mesh.geometry.dispose();
            if (rb.mesh.material) rb.mesh.material.dispose();
          }
        } else kept.push(rb);
      });
      _roomBoxes = kept;
    }
    // §ROOM-CUBOID: the SELECTED room as a crisp soft-purple box — faint translucent fill + a bright
    // WIREFRAME of the 12 cuboid edges that shines THROUGH geometry (depthTest off), so the room
    // reads as a clean volume from any angle. Both tracked in _roomBoxes for disposal.
    // §FILL-SHINE-THROUGH (2026-07-15p, user-reported live testing: "it highlights with the box
    // shines thru, but the purplish interiors does not"): the wire border already sets
    // `depthTest: false` (shines through occluding geometry, see lineMat below) but the fill's
    // MeshBasicMaterial never set depthTest at all — defaults to true, so it's occluded by any
    // real wall/floor in front of it, unlike its own border. Same §BORDER_STRONG "duplicate mesh
    // underneath" trick this function already uses for the wire, applied to the fill: a dim
    // depthTest:false glow layer draws first (always visible, ~90% of the crisp opacity — the
    // user's own "-10%" ask), then the normal depth-tested fill draws on top at full opacity
    // wherever genuinely unoccluded. Net: dim-but-visible through walls, brighter where actually
    // in view — a real depth cue, "always shines thru" per the user's own framing. True per-layer
    // graduated falloff (their stretch "-5% per additional layer") would need real depth-peeling
    // (multi-pass, real GPU cost) for an effect a human eye won't reliably distinguish past one
    // tier anyway — this two-tier version gets the same PERCEIVED result far more cheaply.
    // §SELECT-PULSE (2026-07-15o, user's own pick, "cheap doesn't bog or lag"): a brief settle-in
    // pulse on selection — starts oversized/dim, eases down to resting scale/opacity over 300ms —
    // draws the eye to what just got picked instead of an instant flat cut. Pure JS scale/opacity
    // tween, same requestAnimationFrame + generation-counter pattern _lerpCam already uses (a
    // newer pulse or a fresh _clearRoomCuboid supersedes any in-flight one — never two competing
    // animations, never a leaked rAF loop after the mesh is gone).
    var _pulseId = 0;
    function _drawRoomCuboid(center, size, category) {
      if (!A.scene || typeof THREE === 'undefined') return;
      _clearRoomCuboid();
      var myPulse = ++_pulseId;
      var cc = _categoryColor(category); // §ROOM_LENS_TAXONOMY: selected room reads as a BRIGHTER
      // version of its own category color (purple/blue/dark), not a 4th unrelated fixed hue.
      var boxGeo = new THREE.BoxGeometry(size.x, size.y, size.z);
      var FILL_GLOW_RATIO = 0.9; // §FILL-SHINE-THROUGH: dim layer = 90% of the crisp layer's opacity
      var glowMat = new THREE.MeshBasicMaterial({ color: cc.fill, transparent: true, opacity: 0.5 * FILL_GLOW_RATIO,
        depthWrite: false, depthTest: false, side: THREE.DoubleSide });
      var fillGlow = new THREE.Mesh(boxGeo, glowMat); fillGlow.position.copy(center);
      fillGlow.renderOrder = 997; fillGlow.userData._roomShell = true; // draws first — always visible through walls
      A.scene.add(fillGlow); _roomBoxes.push({ guid: '_cuboidFillGlow', mesh: fillGlow });
      var fillMat = new THREE.MeshBasicMaterial({ color: cc.fill, transparent: true, opacity: 0.5,
        depthWrite: false, side: THREE.DoubleSide });
      var fill = new THREE.Mesh(boxGeo, fillMat); fill.position.copy(center);
      fill.renderOrder = 998; fill.userData._roomShell = true; // draws after — depth-tested, full opacity only where genuinely unoccluded
      A.scene.add(fill); _roomBoxes.push({ guid: '_cuboidFill', mesh: fill });
      var edges = new THREE.EdgesGeometry(boxGeo);
      var lineMat = new THREE.LineBasicMaterial({ color: cc.wire, transparent: true, opacity: 1.0, depthTest: false });
      var wire = new THREE.LineSegments(edges, lineMat); wire.position.copy(center);
      // §BORDER_STRONG: LineBasicMaterial.linewidth is silently ignored by nearly every browser/GPU
      // (WebGL spec limitation) -- a real 1px line reads as weak against a busy scene no matter the
      // opacity. Fake a thicker border with a second, slightly-scaled duplicate wireframe underneath.
      var wire2 = new THREE.LineSegments(edges, lineMat.clone());
      wire2.material.opacity = 0.5;
      wire2.scale.set(1.015, 1.015, 1.015);
      wire2.position.copy(center);
      wire2.renderOrder = 1001; wire2.userData._roomShell = true;
      A.scene.add(wire2); _roomBoxes.push({ guid: '_cuboidWireOuter', mesh: wire2 });
      wire.renderOrder = 1002; wire.userData._roomShell = true;
      A.scene.add(wire); _roomBoxes.push({ guid: '_cuboidWire', mesh: wire });

      var restFillOp = 0.5, restWireScale = 1.0, restWire2Scale = 1.015, overshoot = 0.09;
      var t = 0;
      function pulseFrame() {
        if (myPulse !== _pulseId) return; // superseded — a newer selection or a reset already took over
        t += 0.06; if (t > 1) t = 1;
        var e = 1 - Math.pow(1 - t, 3); // ease-out, matches _lerpCam's easing
        var k = (1 - e); // 1 at start, 0 at rest
        fill.material.opacity = restFillOp + k * 0.3;              // starts brighter (0.8), settles to 0.5
        fillGlow.material.opacity = (restFillOp + k * 0.3) * FILL_GLOW_RATIO; // stays proportional to the crisp layer
        wire.scale.setScalar(restWireScale + k * overshoot);       // starts oversized, eases down to resting scale
        wire2.scale.setScalar(restWire2Scale + k * overshoot);
        if (A.markDirty) A.markDirty();
        if (t < 1) requestAnimationFrame(pulseFrame);
        else { fill.material.opacity = restFillOp; fillGlow.material.opacity = restFillOp * FILL_GLOW_RATIO; wire.scale.setScalar(restWireScale); wire2.scale.setScalar(restWire2Scale); if (A.markDirty) A.markDirty(); }
      }
      requestAnimationFrame(pulseFrame);
    }

    // §ROOM-SHELL (user): the room's REAL bounding surfaces — the walls/floor/ceiling most exposed to
    // the cuboid. Per face, pick the element adjacent to that face plane (within BAND) with the most
    // overlap over the face span; for the 2 horizontal faces, the largest flat plate below (floor) and
    // above (ceiling). Same bbox-adjacency maths the flood-fill uses. Coords are IFC (the DB space).
    // rw = [name, parentName, cx,cy,cz, sx,sy,sz] from spatial_structure.
    function _roomBoundingGuids(rw) {
      var set = new Set();
      if (!rw || rw[2] == null || rw[5] == null || !A.dbQuery) return set;
      var cx = rw[2], cy = rw[3], cz = rw[4], hx = (rw[5] || 0) / 2, hy = (rw[6] || 0) / 2, hz = (rw[7] || 0) / 2;
      var BAND = 0.9, rows = [];
      try {
        rows = A.dbQuery(
          "SELECT m.guid, m.ifc_class, t.center_x,t.center_y,t.center_z, t.bbox_x,t.bbox_y,t.bbox_z" +
          " FROM element_transforms t JOIN elements_meta m ON m.guid=t.guid" +
          " WHERE (m.ifc_class LIKE 'IfcWall%' OR m.ifc_class LIKE 'IfcSlab%' OR m.ifc_class LIKE 'IfcCovering%' OR m.ifc_class LIKE 'IfcRoof%')" +
          // §ROOM-AABB: candidate if its BBOX overlaps the room's expanded box (center may be far away —
          // a storey-spanning floor slab must still qualify). center-proximity missed those → no floor.
          " AND t.center_x - t.bbox_x/2 <= ? AND t.center_x + t.bbox_x/2 >= ?" +
          " AND t.center_y - t.bbox_y/2 <= ? AND t.center_y + t.bbox_y/2 >= ?" +
          " AND t.center_z - t.bbox_z/2 <= ? AND t.center_z + t.bbox_z/2 >= ?",
          [cx + hx + BAND, cx - hx - BAND, cy + hy + BAND, cy - hy - BAND, cz + hz + BAND, cz - hz - BAND]) || [];
      } catch (e) { console.warn('[RP-TA] §ROOM_BOUND_ERR', e.message); return set; }
      var faces = {}, ovl = function (a0, a1, b0, b1) { return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)); };
      function pick(k, g, s) { if (s > 0 && (!faces[k] || s > faces[k].s)) faces[k] = { g: g, s: s }; }
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i], ic = r[1] || '', ex = r[2], ey = r[3], ez = r[4], bx = r[5] || 0, by = r[6] || 0, bz = r[7] || 0;
        var x0 = ex - bx / 2, x1 = ex + bx / 2, y0 = ey - by / 2, y1 = ey + by / 2;
        if (ic.indexOf('Wall') >= 0) {
          if (bx >= by) {                                  // X-running wall → bounds a Y face
            var oX = ovl(x0, x1, cx - hx, cx + hx);
            if (Math.abs(ey - (cy - hy)) <= BAND) pick('yMin', r[0], oX);
            if (Math.abs(ey - (cy + hy)) <= BAND) pick('yMax', r[0], oX);
          } else {                                         // Y-running wall → bounds an X face
            var oY = ovl(y0, y1, cy - hy, cy + hy);
            if (Math.abs(ex - (cx - hx)) <= BAND) pick('xMin', r[0], oY);
            if (Math.abs(ex - (cx + hx)) <= BAND) pick('xMax', r[0], oY);
          }
        } else if (bz < Math.min(bx, by)) {                // flat plate → floor (below) / ceiling (above)
          var area = ovl(x0, x1, cx - hx, cx + hx) * ovl(y0, y1, cy - hy, cy + hy);
          if (area > 0) { if (ez <= cz) pick('floor', r[0], area + (cz - ez)); else pick('ceil', r[0], area + (ez - cz)); }
        }
      }
      var fk = []; for (var k in faces) { set.add(faces[k].g); fk.push(k); }
      console.log('[RP-TA] §ROOM_BOUND faces=[' + fk.join(',') + '] n=' + set.size + ' from ' + rows.length + ' candidates');
      return set;
    }
    // §ROOM-CLIP: 6 world-space planes at the cuboid faces (+margin) so a picked bounding mesh renders
    // ONLY its in-room portion — a storey floor slab / long wall is trimmed to this room. THREE.Plane
    // keeps points where normal·p + constant ≥ 0; inward normals + clipIntersection=false → inside box.
    function _boxClipPlanes(center, size, m) {
      if (typeof THREE === 'undefined') return null;
      m = m || 0;
      var c = center, hx = size.x / 2 + m, hy = size.y / 2 + m, hz = size.z / 2 + m;
      return [
        new THREE.Plane(new THREE.Vector3(-1, 0, 0), c.x + hx),
        new THREE.Plane(new THREE.Vector3(1, 0, 0), -(c.x - hx)),
        new THREE.Plane(new THREE.Vector3(0, -1, 0), c.y + hy),
        new THREE.Plane(new THREE.Vector3(0, 1, 0), -(c.y - hy)),
        new THREE.Plane(new THREE.Vector3(0, 0, -1), c.z + hz),
        new THREE.Plane(new THREE.Vector3(0, 0, 1), -(c.z - hz))
      ];
    }
    // All IfcSpace volumes mapped to Three space (IFC size → Three: x→x, z→y, y→z — bbox parity).
    // §ROOM-HAB (VIEWER_FIND_PANEL_ROOM_ACCURACY.md Task 1): filters out non-habitable spaces
    // (Roof/Shaft/Void/Plant/... voids, real OR synthetic) via the shared window.RoomHabitability
    // classifier (common/room_habitability.js, ported from disc_walker.js's spaceHabitable()) —
    // this is a DISPLAY filter only, distinct from the Modeller's stricter real-vs-synthetic
    // (RM_/≈ prefix) exclusion; the Room Lens intentionally still shows synthetic compile_rooms.py
    // rooms, it just must not show one labelled Roof/Shaft/etc as if it were a normal room.
    // §MULTI-RECT (ROOM_INJECTION_HYBRID.md §8/§9): a compiled room may be N spatial_structure rows
    // (one per sub-rectangle) sharing `room_guid` — the LOGICAL room key. Group by it (falling back
    // to `guid` for real IfcSpace / pre-§8 data with no room_guid column) so the Room Lens renders
    // the UNION of a room's sub-rect boxes, not one undersized/border-hugging inscribed rectangle
    // and not N disconnected boxes each masquerading as its own room. Ports the SAME guarded-query +
    // grouping shape already proven by `viewer/hba_lens.js` `bindStoreysFromModel` (W-HBA-MULTIRECT
    // 6/6) — that is the reference pattern for this fix, not re-derived from scratch. Returns a FLAT
    // array (one entry per sub-rect box, `guid` = the LOGICAL room guid so callers can group/count
    // by it) — habitability is evaluated ONCE per logical room (name/predefined_type/object_type are
    // identical across a room's sub-rect set per §8's own design), never per sub-rect.
    // §ROOM-VOL-CACHE (2026-07-15n, user-reported "panel tabbing refresh" lag + user's own
    // "queries perhaps need to pre stored lazily" diagnosis — correct instinct, same gap this
    // session already closed for the Phase axis via _phaseCache): unlike _phaseCache/
    // _probeCacheResult, _allRoomVolumes() had NO cache at all — the full SQL query + per-room
    // habitability/utility classification (measured live on Terminal: 30-60ms) reran from
    // scratch on EVERY single Room-axis entry, not just the first. The THREE.Mesh shells
    // themselves still get disposed+recreated each entry (_clearRoomBoxes() in _roomLensOn(),
    // unavoidable — meshes are scene-owned, not reusable across a dispose cycle) but that part
    // alone measured only ~3-4ms; caching the query+classification result removes the other
    // 30-60ms. Same invalidation convention as _phaseCache/_probeCacheResult: reset only on a
    // fresh openFindPanel() (building may have changed) or a real data change (needle-inject),
    // never on a plain axis re-entry within one open session.
    var _roomVolCache = null, _roomVolCacheBld = null;
    function _allRoomVolumes() {
      if (_roomVolCache && _roomVolCacheBld === A.activeBuilding) {
        console.log('[RP-TA] §ROOM_VOL_CACHE_HIT boxes=' + _roomVolCache.length);
        return _roomVolCache;
      }
      var _t0 = (performance && performance.now) ? performance.now() : 0; // §PERF_PROBE (2026-07-15j, §13)
      var out = [];
      if (!A.ifc2three || typeof THREE === 'undefined') return out;
      var RH = window.RoomHabitability;
      var env = RH ? RH.envelopeFromTransforms(A.dbQuery) : null;
      var excluded = 0;
      try {
        var rows;
        // §MULTI-RECT guard: A.dbQuery (viewer/helpers.js) never THROWS on a bad column reference —
        // it catches internally and returns [] (logging §HELPERS_QUERY_ERR), unlike the try/catch
        // double-query shape hba_lens.js uses in the Modeller context. Selecting a nonexistent
        // `room_guid` column here would therefore silently return ZERO rows with no fallback ever
        // firing — verified directly this session (pre-§8 DBs regressed to boxes=0 until this was
        // fixed). Probe the column via PRAGMA table_info first instead (same technique
        // `_probeLenses()` already uses a few lines up in this file for `center_x`/`size_x`).
        var hasRoomGuid = false;
        try {
          var ssCols = A.dbQuery("PRAGMA table_info(spatial_structure)");
          hasRoomGuid = ssCols.some(function(c) { return c[1] === 'room_guid'; });
        } catch (eCols) { /* hasRoomGuid stays false */ }
        rows = A.dbQuery("SELECT s.guid, s.name, s.center_x, s.center_y, s.center_z, s.size_x, s.size_y, s.size_z," +
          " s.object_type, s.predefined_type" + (hasRoomGuid ? ", s.room_guid" : ", NULL") + ", p.name" +
          " FROM spatial_structure s LEFT JOIN spatial_structure p ON p.guid = s.parent_guid" +
          " WHERE s.type='IfcSpace' AND s.center_x IS NOT NULL AND s.size_x IS NOT NULL");
        var groups = {}, order = [];
        (rows || []).forEach(function(r) {
          var lg = r[10] || r[0];   // logical room guid: room_guid, falling back to this row's own guid
          if (!groups[lg]) {
            groups[lg] = { guid: lg, name: r[1],
              // §ROOM-TYPE-FALLTHROUGH: object_type is 'COMPILED' for every synthetic room — no single
              // field reliably carries the habitability keyword (verified directly: some synthetic sets
              // tag the void in `name` only — e.g. buildings/Duplex_extracted.db's "≈ Roof R1" with
              // predefined_type generically 'INTERNAL' — others tag it in predefined_type — e.g. HHS's
              // 'INTERNAL_DOORPART'). Join object_type/predefined_type/name and let spaceHabitable's
              // token match find the keyword wherever it actually is — never invents a label, just
              // widens which already-real field is checked. Representative fields (name/type) come from
              // the FIRST row seen for this logical guid — identical across the set per §8's own design.
              label: [r[8], r[9], r[1]].filter(Boolean).join(' '), z1: -Infinity, rects: [],
              cx: r[2], cy: r[3], sx: r[5], sy: r[6], storey: r[11] || '' };
            order.push(lg);
          }
          var g = groups[lg];
          var z1 = r[4] + (r[7] || 0) / 2;
          if (z1 > g.z1) g.z1 = z1;   // conservative: if ANY sub-rect pokes above the envelope, check catches it
          g.rects.push({ cx: r[2], cy: r[3], cz: r[4], sx: r[5], sy: r[6], sz: r[7] });
        });
        // §ROOM_LENS_TAXONOMY (ROOM_LENS_VISUAL_HIGHLIGHT_SPEC.md §2/§10): category per logical
        // room, for the room-shell FILL COLOR (not the Type-tree list — that's computed
        // independently in _buildRoomTree(), same underlying signals, deliberately not unified
        // into one shared cache yet — a follow-up cleanup, not a correctness issue, since both call
        // the SAME deterministic classifiers on the SAME data and can never disagree).
        // 'corridor'/'restroom'/'utilities' each get a distinct shell color; every other real room
        // stays 'habitable'. §RESTROOM-CLASS (2026-07-17): a wet sanitary room (toilet/WC/bathroom)
        // is now its OWN brown hue — it reads as a different KIND of space from a living room at a
        // glance, matching the richer Type-tree sub-category it always carried.
        var corridorLabelsShell = _corridorLabelsFor();
        // §UTILITY-CONTENT-BATCH (2026-07-15, real perf fix — see room_habitability.js's own
        // comment for the Hospital hang this replaces): ONE batched classification call for every
        // logical room, not one call per room — was 2 SQL queries PER ROOM (600+ on Hospital's 311
        // rooms), now exactly 2 total regardless of building size.
        var utilityShellGuids = {};
        if (RH && RH.classifyUtilityRooms) {
          try {
            var shellRoomDescs = order.map(function(lg) {
              var g = groups[lg];
              return { guid: lg, cx: g.cx, cy: g.cy, sx: g.sx, sy: g.sy, storey: g.storey };
            });
            utilityShellGuids = RH.classifyUtilityRooms(shellRoomDescs, A.dbQuery);
          } catch (eUcShell) { /* leave everything habitable — never invent */ }
        }
        order.forEach(function(lg) {
          var g = groups[lg];
          if (RH) {
            var v = RH.spaceHabitable({ label: g.label, z1: g.z1 }, env);
            if (!v.ok) {
              excluded++;
              console.log('[RP-TA] §ROOM_VOL_NONHAB ' + (g.name || g.guid) + ' (' + g.guid + ') excluded — ' + v.why);
              return;
            }
          }
          var category = 'habitable';
          // Most-specific wins: corridor (spatial) first — a corridor is never a named room; then
          // the labelled room types (restroom/kitchen/bedroom, mutually exclusive by name); then
          // the generic utility/void spatial signal last. Everything else stays 'habitable'.
          if (corridorLabelsShell[lg]) category = 'corridor';
          else if (RH && RH.classifyRestroom && RH.classifyRestroom(g.label)) category = 'restroom';
          else if (RH && RH.classifyKitchen && RH.classifyKitchen(g.label)) category = 'kitchen';
          else if (RH && RH.classifyBedroom && RH.classifyBedroom(g.label)) category = 'bedroom';
          else if (utilityShellGuids[lg]) category = 'utilities';
          g.rects.forEach(function(rc) {
            var c = A.ifc2three(rc.cx, rc.cy, rc.cz);
            out.push({ guid: g.guid, name: g.name, category: category,
              center: new THREE.Vector3(c.x, c.y, c.z),
              size: new THREE.Vector3(Math.max(rc.sx || 0.3, 0.3), Math.max(rc.sz || 0.3, 0.3), Math.max(rc.sy || 0.3, 0.3)) });
          });
        });
        var kept = order.length - excluded;
        // Key names kept BACKWARD-COMPATIBLE with witness_room_lens_hab.js's existing
        // /habitable=(\d+) excluded=(\d+)/ regex (habitable = logical ROOM count, same semantic as
        // before this fix, when 1 row = 1 room); `boxes=` is the NEW field — sub-rect box count,
        // equal to habitable on any single-rect building (regression signal) and > habitable only
        // where §8 multi-rect data exists.
        console.log('[RP-TA] §ROOM_VOL_COUNT habitable=' + kept + ' excluded=' + excluded +
          ' boxes=' + out.length + (RH ? '' : ' (RoomHabitability NOT loaded — filter skipped)'));
        console.log('[RP-TA] §PERF_PROBE _allRoomVolumes ms=' + ((performance && performance.now) ? (performance.now() - _t0).toFixed(1) : '?')); // §13
        _roomVolCache = out; _roomVolCacheBld = A.activeBuilding; // §ROOM-VOL-CACHE: only the clean success path is cached
        return out;
      } catch (e) { console.warn('[RP-TA] §ROOM_VOL_ERR', e.message); }
      console.log('[RP-TA] §ROOM_VOL_COUNT habitable=' + out.length + ' excluded=' + excluded +
        ' boxes=' + out.length + (RH ? '' : ' (RoomHabitability NOT loaded — filter skipped)'));
      console.log('[RP-TA] §PERF_PROBE _allRoomVolumes ms=' + ((performance && performance.now) ? (performance.now() - _t0).toFixed(1) : '?')); // §13
      return out; // exception path — never cached, so the next entry retries fresh rather than sticking with a partial result
    }

    // Remove boxes, restore opacity (turn X-Ray off if WE turned it on), drop outline.
    function _roomLensReset() {
      _clearRoomBoxes();
      if (A.setOutline) A.setOutline([]);
      if (A.filterByGuids) A.filterByGuids(null);  // §SHELL: un-hide the base (shell-mode or old _USE_SHELL)
      // §ROOM-LENS-BBOX-DEFAULT teardown: symmetric with the bbox-shell branch _roomLensOn() below
      // takes on a large building — same lensOwned convention _highlightLensReset() already uses.
      if (_mgLensOwned && _mergedGhost) {
        _mergedGhost.visible = false; _mgLensOwned = false;
        console.log('[MG] §ROOM_LENS_BBOX_RESET hidden (lens-owned)');
      }
      if (A.xrayOn && _roomXrayWasOff && A.toggleXray) A.toggleXray(); // WE turned x-ray on → turn it off (restores _origOpacity=1)
      else if (A.xrayOn) _dimXrayTo(0.3); // §XRAY_UNDISTURB: user had Alt+Z on before Find → our _dimXrayTo(0.12) lingers; put the normal 0.3 back
      _roomXrayWasOff = false;
      if (A.markDirty) A.markDirty();
    }

    // §RP-SHELL (option 3): the Room axis ghosts the building and draws EVERY room as a
    // shine-through shell (IfcSpace volume) — the instant room map. Tapping a room brightens its
    // shell + dims its contents inside it (see _roomSelect). Shells live in _roomBoxes, disposed
    // on reset/axis-switch.
    // §ROOM-LENS-BBOX-DEFAULT (2026-07-15m, user-reported live pre-deploy "large overhead low
    // speed" on a real large building): this always used to force full x-ray + dim EVERY real
    // element to 0.12 opacity — a genuine PER-FRAME GPU render cost (thousands of individually
    // x-rayed meshes redrawn every orbit/pan frame), not something the earlier §PERF_PROBE JS
    // timers could see (those measure one-shot synchronous JS work, not ongoing paint cost). The
    // Room axis is this feature's own most-used view, yet it never picked up the desktop
    // bbox-shell default (§DESKTOP-BBOX-THRESHOLD) — that only covered _drillSelect()'s group-tap
    // path, a completely separate function. Fix: large buildings now get the SAME light bbox-
    // wireframe ghost + hidden real geometry _drillSelect() already uses, instead of x-ray-dim —
    // real geometry rendering drops from thousands of individually-shaded meshes to one instanced
    // wireframe draw call per discipline (measured 115ms ONE-TIME build cost on Terminal's 34446
    // envelope boxes, cached per building thereafter) plus zero ongoing x-ray shading cost.
    function _roomLensOn() {
      var _rlT0 = (performance && performance.now) ? performance.now() : 0; // §PERF_PROBE (2026-07-15j, §13)
      _clearRoomBoxes();
      var _large = (typeof _isLargeBuilding === 'function') && _isLargeBuilding();
      if (_large && A.filterByGuids) {
        var _mg = (_mergedGhost && _mergedGhostBld === A.activeBuilding) ? _mergedGhost : _buildMergedGhost();
        if (_mg) {
          _mg.visible = true; _mgLensOwned = true;
          A.filterByGuids(new Set()); // hide every real mesh — bbox ghost is the surrounding context
          console.log('[MG] §ROOM_LENS_BBOX_DEFAULT large building → bbox ghost instead of x-ray-dim');
        } else { // bbox build failed (deps missing) — fall back to the proven x-ray path, never worse
          if (!A.xrayOn && A.toggleXray) { A.toggleXray(); _roomXrayWasOff = true; }
          _dimXrayTo(0.12);
        }
      } else {
        if (!A.xrayOn && A.toggleXray) { A.toggleXray(); _roomXrayWasOff = true; } // ghost the rest
        _dimXrayTo(0.12);
      }
      var vols = _allRoomVolumes();
      // §MULTI-RECT: `vols` is FLAT (one entry per sub-rect box; `guid` is the LOGICAL room guid).
      // Draw one shell per sub-rect (their union IS the room's real footprint) but count ROOMS by
      // distinct guid — same "N rects = ONE logical room" convention W-ROOM-FILL/W-HBA-MULTIRECT
      // already proved for hba_lens.js's outline drawing.
      var rooms = {}, catCounts = {}, synCount = 0;
      vols.forEach(function(v) {
        var fillColor = _categoryColor(v.category).fill;
        // §SYNTHETIC-HONESTY (WalkerDoctrine §14: a computed/approximate room must never be
        // presented as real): a compiled room (guid 'RM_…' or an '≈'-prefixed name) is drawn
        // FAINTER than a real extracted IfcSpace, so the wash itself signals data provenance.
        var syn = /^RM_/.test(v.guid || '') || /^\s*≈/.test(v.name || '');
        if (syn) synCount++;
        var mesh = _drawRoomShell(v.center, v.size, syn ? 0.06 : 0.12, fillColor);
        if (mesh) _roomBoxes.push({ guid: v.guid, name: v.name, mesh: mesh, center: v.center, size: v.size, category: v.category, synthetic: syn });
        rooms[v.guid] = true;
        catCounts[v.category] = (catCounts[v.category] || 0) + 1;
      });
      console.log('[RP-TA] §ROOM_LENS_CATEGORY habitable=' + (catCounts.habitable || 0) +
        ' corridor=' + (catCounts.corridor || 0) + ' restroom=' + (catCounts.restroom || 0) +
        ' kitchen=' + (catCounts.kitchen || 0) + ' bedroom=' + (catCounts.bedroom || 0) +
        ' utilities=' + (catCounts.utilities || 0) + ' | synthetic=' + synCount + ' real=' + (vols.length - synCount));
      if (A.markDirty) A.markDirty();
      console.log('[RP-TA] §ROOM_LENS mode=shell rooms=' + Object.keys(rooms).length +
        ' shells=' + _roomBoxes.length + ' (all rooms shine-through; building ghost=0.12)');
      console.log('[RP-TA] §PERF_PROBE _roomLensOn total_ms=' + ((performance && performance.now) ? (performance.now() - _rlT0).toFixed(1) : '?')); // §13
    }

    // §RP zoom-to-fit: frame the camera on a box (center+size, Three units). Reuses the
    // proven camera-lerp from diff.js zoomToGuid, but is box-based (works for rooms/phases/
    // elements that live in batched/instanced meshes, which zoomToGuid can't find). markDirty
    // every frame — the §S286 idle gate parks the loop, so the move won't render without it.
    // Shared camera fly-to: lerp to `dist` units from `center` along the standard iso offset,
    // easing over ~0.3s. markDirty each frame — the §S286 idle gate parks the loop otherwise.
    var _lerpId = 0, _lerpHooked = false;
    function _lerpCam(center, dist) {
      if (!A.camera || !A.controls || typeof THREE === 'undefined') return;
      // §FLY-YIELD: the moment the user grabs the controls (OrbitControls 'start'), cancel any in-flight
      // fly — otherwise the lerp keeps writing target+position and fights the pull ("hits back").
      if (!_lerpHooked && A.controls.addEventListener) {
        A.controls.addEventListener('start', function() { _lerpId++; });
        _lerpHooked = true;
      }
      var myId = ++_lerpId;                          // a newer fly or a user grab supersedes this one
      var end = center.clone().add(new THREE.Vector3(0.5, 0.5, 0.7).normalize().multiplyScalar(dist));
      var start = A.camera.position.clone();
      var t = 0;
      function anim() {
        if (myId !== _lerpId) return;                // superseded / user took over → stop writing the camera
        t += 0.04; if (t > 1) t = 1;
        var e = 1 - Math.pow(1 - t, 3);
        A.camera.position.lerpVectors(start, end, e);
        A.controls.target.copy(center);
        A.controls.update();
        if (A.markDirty) A.markDirty();
        if (t < 1) requestAnimationFrame(anim);
      }
      anim();
    }
    // Item zoom: maxDim*factor heuristic — a tight frame on a small lit item.
    function _zoomToBox(center, size, factor) {
      _lerpCam(center, Math.max(size.x, size.y, size.z) * (factor || 3) + 1);  // §FILL: small pad
    }
    // §DEPTH box-fit: distance so the box's PROJECTED extent fills the frame from the iso view
    // angle. The old bounding-SPHERE fit overshot (the box sits small inside its sphere → "doesn't
    // fill the screen"); this projects the 8 corners onto the camera right/up/forward basis and fits
    // width AND height to the frustum — so a whole storey/phase/material/room actually FILLS the view.
    function _fitDistForBox(size) {
      var dir = new THREE.Vector3(0.5, 0.5, 0.7).normalize();   // matches _lerpCam offset direction
      var fwd = dir.clone().negate();
      var right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
      var up = new THREE.Vector3().crossVectors(right, fwd).normalize();
      var hx = size.x / 2, hy = size.y / 2, hz = size.z / 2, hW = 0, hH = 0, hD = 0, c = new THREE.Vector3();
      for (var sx = -1; sx <= 1; sx += 2) for (var sy = -1; sy <= 1; sy += 2) for (var sz = -1; sz <= 1; sz += 2) {
        c.set(sx * hx, sy * hy, sz * hz);
        hW = Math.max(hW, Math.abs(c.dot(right))); hH = Math.max(hH, Math.abs(c.dot(up))); hD = Math.max(hD, Math.abs(c.dot(fwd)));
      }
      var tanV = Math.tan((A.camera.fov || 50) * Math.PI / 360);  // tan(fov/2)
      var tanH = tanV * (A.camera.aspect || 1);
      // Fit the box's CENTER cross-section so it FILLS the frame. Only a SMALL fraction of the
      // half-depth is added (full hD pushed the camera way back on elongated storeys → "doesn't
      // fill"); 0.3·hD keeps the near face off the near-plane without losing the fill. 1.03 breathing.
      return (Math.max(hH / tanV, hW / tanH) + hD * 0.3) * 1.03;
    }
    function _zoomToBoxFill(center, size, tag, mult) {
      if (!A.camera || !size) return false;
      var dist = _fitDistForBox(size) * (mult || 1);   // mult>1 pulls the camera back (room picks: not too near)
      _lerpCam(center, dist);
      console.log('[RP-TB] §' + (tag || 'GROUP_ZOOM') + ' fill dist=' + dist.toFixed(1) + ' mult=' + (mult || 1) +
        ' size=' + size.x.toFixed(1) + 'x' + size.y.toFixed(1) + 'x' + size.z.toFixed(1));
      return true;
    }
    function _zoomToGroup(set) {
      var bb = _bboxOfGuids(set); if (!bb || !A.camera) return false;
      return _zoomToBoxFill(bb.center, bb.size, 'GROUP_ZOOM');
    }

    // §ROOM-GUID-AWARE (2026-07-13, real bug found live: user-reported a multi-rect room's
    // Find-panel selection binding to one small SUB-RECT instead of the room's own overall extent
    // — reported symptoms "still too small" + "shifted into a wall" both traced to this). Verified
    // on real data: HHS alone has 18/70 logical rooms split across 2-4 spatial_structure rows
    // (§MULTI-RECT, a real, intentional compile feature for L-shaped/irregular rooms) sharing one
    // `room_guid`, e.g. RM_Level_1_12 (9.95x7.96m, the real room) + RM_Level_1_12b (2.0x1.7m, a
    // small offshoot ~7m away) both named "≈ Level 1 R12" — clicking either shows only ONE piece.
    // This is the SAME gap ROOM_INTELLIGENCE_SCOREBOARD.md already named ("_roomSelect() sibling
    // function still not room_guid-aware") — not a new invention, a previously-flagged fix landing
    // now. Shared by both callers (WalkerDoctrine §10: one function, not two separate point-fixes)
    // — mirrors the SAME room_guid-probe + fallback shape _allRoomVolumes() already uses correctly
    // for the Room Lens shell view, just computing a UNION bbox (min/max corner across every
    // sub-rect) instead of keeping each sub-rect as its own shell. Byte-identical fallback for any
    // schema/row without room_guid (older DBs, real non-compiled IfcSpace rows): falls through to
    // the exact single-row query this replaces.
    function _roomUnionBBox(guid) {
      if (!guid || !A.dbQuery) return null;
      var hasRoomGuid = false;
      try {
        var ssCols = A.dbQuery("PRAGMA table_info(spatial_structure)");
        hasRoomGuid = ssCols.some(function(c) { return c[1] === 'room_guid'; });
      } catch (eCols) { /* hasRoomGuid stays false -> single-row fallback below */ }
      // §ROOM-GUID-AWARE robustness: `guid` may be EITHER the group's canonical room_guid OR one
      // individual sub-rect's own guid (e.g. a scene click resolving to "RM_Level_1_12b" directly,
      // not via the now-deduped Find-panel list) — resolve to the canonical logical guid FIRST,
      // then union every row sharing it, so the result is correct regardless of which guid a caller
      // happens to pass. Caught by direct verification (node, this session): querying by a sub-rect's
      // own guid without this resolve step returned rectCount=1 (that one sub-rect only), not the
      // room's full union.
      var logicalGuid = guid;
      if (hasRoomGuid) {
        try {
          var rg = A.dbQuery("SELECT room_guid FROM spatial_structure WHERE guid = ? AND type='IfcSpace'", [guid]);
          if (rg.length && rg[0][0]) logicalGuid = rg[0][0];
        } catch (eRg) {}
      }
      var rows;
      try {
        rows = A.dbQuery("SELECT s.guid, s.name, p.name, s.center_x, s.center_y, s.center_z, s.size_x, s.size_y, s.size_z" +
          " FROM spatial_structure s LEFT JOIN spatial_structure p ON p.guid = s.parent_guid" +
          " WHERE s.type='IfcSpace' AND (s.guid = ?" + (hasRoomGuid ? " OR s.room_guid = ?" : "") + ")",
          hasRoomGuid ? [logicalGuid, logicalGuid] : [logicalGuid]);
      } catch (e) { console.warn('[RP-TA] §ROOM_UNION_ERR', e.message); return null; }
      if (!rows || !rows.length) return null;
      var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      var name = rows[0][1], storey = rows[0][2];
      rows.forEach(function (r) {
        var cx = r[3], cy = r[4], cz = r[5], sx = r[6] || 0, sy = r[7] || 0, sz = r[8] || 0;
        if (cx == null) return;
        x0 = Math.min(x0, cx - sx / 2); x1 = Math.max(x1, cx + sx / 2);
        y0 = Math.min(y0, cy - sy / 2); y1 = Math.max(y1, cy + sy / 2);
        z0 = Math.min(z0, cz - sz / 2); z1 = Math.max(z1, cz + sz / 2);
      });
      if (!isFinite(x0)) return null;
      var out = { name: name, storey: storey, rectCount: rows.length,
        cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, cz: (z0 + z1) / 2, sx: x1 - x0, sy: y1 - y0, sz: z1 - z0 };
      console.log('[RP-TA] §ROOM_UNION_BBOX guid=' + guid + ' rects=' + out.rectCount +
        ' box=' + out.sx.toFixed(2) + 'x' + out.sy.toFixed(2) + 'x' + out.sz.toFixed(2) +
        ' center=' + out.cx.toFixed(2) + ',' + out.cy.toFixed(2) + ',' + out.cz.toFixed(2));
      return out;
    }

    // §RP-SHAPE: tap a room → light its real CONTENTS (rel_contained_in_space) in cyan,
    // keep that storey solid, rest at 0.2 (same drill as Phase/Material). No box.
    // §CORRIDOR-ROOM-BACKPROP (2026-07-14): a `CORRIDOR_ROOM::*` guid has NO spatial_structure row
    // — it's a synthetic room node injected by room_graph.js's buildGraph() for a real, door+wall-
    // verified hallway bucket that room-compilation never turned into a room. _roomUnionBBox()
    // would correctly return null for it (nothing to query), so build the SAME {name,storey,
    // rectCount,cx,cy,cz,sx,sy,sz} shape directly from the room graph's own node instead — real
    // measured position/span either way, just a different (in-memory, not DB) source. sz (height)
    // has no measured real ceiling for a synthetic hallway node — per user steer (2026-07-14): this
    // box is for PATH-OF-MOVEMENT first, not volumetric/ceiling accuracy, so a 2.0m human-clearance
    // height is enough even where the real ceiling is much taller (a foyer/atrium-fronted corridor,
    // say) — same movement-clearance convention as common/hallway_backbone.js's STAIR_CLEARANCE.
    // Real ceiling height (for equipment placement etc) is Modeller's job later, not this walkway box.
    var CORRIDOR_BOX_CLEARANCE_HEIGHT = 2.0;
    function _corridorRoomBBox(guid) {
      var graph = _roomGraphFor();
      var n = graph && graph.nodesByGuid && graph.nodesByGuid[guid];
      if (!n || n.kind !== 'room' || !n.rects || !n.rects.length) return null;
      var rc = n.rects[0];
      return { name: n.name, storey: n.storey, rectCount: 1,
        cx: n.cx, cy: n.cy, cz: n.cz, sx: rc.x1 - rc.x0, sy: rc.y1 - rc.y0, sz: CORRIDOR_BOX_CLEARANCE_HEIGHT };
    }

    function _roomSelect(guid) {
      if (_categoryRevealOn) _clearCategoryReveal(); // a leaf tap commits to one room — any active headline reveal is now stale
      var set = new Set(), name = guid, storeySet = null, zoomBox = null;
      var isCorridorRoom = guid.indexOf('CORRIDOR_ROOM::') === 0;
      if (!isCorridorRoom) { try { _surfaceConstructionLink(guid, guid); } catch (e) {} }
      try {
        var rw = isCorridorRoom ? _corridorRoomBBox(guid) : _roomUnionBBox(guid);
        if (rw) { name = rw.name || guid; var storey = rw.storey;
          if (storey) { storeySet = new Set();
            A.dbQuery("SELECT guid FROM elements_meta WHERE storey = ?", [storey])
              .forEach(function(r) { storeySet.add(r[0]); }); }
          // §ROOM_ZOOM: frame the room's VOLUME (center+size from spatial_structure, UNIONED across
          // every §MULTI-RECT sub-rect this logical room owns), not its few contained elements — a
          // 2-element room would otherwise zoom to a tiny erroneous frame.
          if (rw.cx != null && rw.sx != null && A.ifc2three && typeof THREE !== 'undefined') {
            var cc = A.ifc2three(rw.cx, rw.cy, rw.cz);  // IFC size → Three: x→x, z→y, y→z (bbox parity)
            zoomBox = { center: new THREE.Vector3(cc.x, cc.y, cc.z),
              size: new THREE.Vector3(Math.max(rw.sx || 0.5, 0.5), Math.max(rw.sz || 0.5, 0.5), Math.max(rw.sy || 0.5, 0.5)) };
          }
        }
      } catch (e) { console.warn('[RP-TA] §ROOM_SELECT_ERR', e.message); }
      // dim every overview shell so the picked room stands alone
      _roomBoxes.forEach(function(rb) {
        if (rb.mesh && rb.mesh.material) { rb.mesh.material.opacity = 0.04; rb.mesh.material.needsUpdate = true; }
      });
      // §ROOM_HIGHLIGHT (2026-07-12, VIEWER_FIND_PANEL_ROOM_ACCURACY.md §8): the abstract single-box
      // cuboid (_drawRoomCuboid — ONE mesh, no seams) is now the PRIMARY highlight whenever the room's
      // volume (zoomBox) is known. The real-bounding-element lookup (_roomBoundingGuids) still runs and
      // still drives the storey-dim/x-ray/zoom-to-fit side effects via _drillSelect — it's just no
      // longer what LIGHTS UP: multiple adjacent real elements each getting their own yellow fill/
      // silhouette read as fragmented "cut" seams where they meet. Real-element highlight only remains
      // the default when no room volume is available to draw a cuboid from.
      // §ROOM-GUID-AWARE: _roomBoundingGuids expects the array shape [name,parentName,cx,cy,cz,sx,sy,sz]
      // — build it from the UNION bbox (rw, above) so real-wall lookup scans the room's whole footprint,
      // not just one sub-rect.
      var bound = _roomBoundingGuids(rw ? [rw.name, null, rw.cx, rw.cy, rw.cz, rw.sx, rw.sy, rw.sz] : null);
      // §ROOM_LENS_TAXONOMY: a CORRIDOR_ROOM::* guid IS a corridor by construction (no lookup
      // needed — it never has a _roomBoxes shell entry since _allRoomVolumes() only queries real
      // spatial_structure rows); every other room's category was already computed once by
      // _roomLensOn() and lives on its _roomBoxes entry — reuse it, never recompute.
      var selCategory = 'habitable';
      if (isCorridorRoom) selCategory = 'corridor';
      else { var rbMatch = _roomBoxes.filter(function(rb) { return rb.guid === guid; })[0];
        if (rbMatch && rbMatch.category) selCategory = rbMatch.category; }
      // §CUBOID-PAINT-ORDER (2026-07-15, user-reported live testing: "purple does not shine thru
      // in solid or x-ray mode, only bbox mode"): _drawRoomCuboid()'s shine-through trick
      // (depthTest:false + a high renderOrder, both the §BORDER_STRONG wire and #797's
      // §FILL-SHINE-THROUGH glow) only controls PAINT ORDER when the renderer actually sorts by
      // renderOrder. Selecting a room in the Find panel ALWAYS auto-enables X-Ray if it wasn't
      // already on (see the `!A.xrayOn && A.toggleXray` calls a few lines below, inside
      // _drillSelect's caller chain) — and A.toggleXray() sets `A.renderer.sortObjects =
      // !A.xrayOn` (viewer/tools.js, a real perf optimization for X-Ray's many-material update).
      // With sortObjects FALSE, three.js ignores renderOrder entirely and paints in raw
      // scene-graph traversal order instead — so whichever mesh was ADDED to the scene LAST wins
      // the pixel, regardless of renderOrder. _drawRoomCuboid() used to run BEFORE _drillSelect()
      // below, so the cuboid was added FIRST and _drillSelect's own context/ghost overlay meshes
      // (added after) painted OVER it — hiding the "shines through" glow specifically in the
      // sortObjects=false state this feature normally runs in. "Bbox" mode only looked unaffected
      // because it replaces most real geometry with thin wireframes, leaving little solid pixel
      // coverage to reveal the same underlying bug. Fix: call _drillSelect FIRST so the cuboid is
      // always the LAST thing added to the scene each selection — correct on top regardless of
      // sortObjects state, no change to the X-Ray perf optimization itself.
      if (bound.size && zoomBox) {
        var _clip = _boxClipPlanes(zoomBox.center, zoomBox.size, 0.7);   // confine the ancestor shell to the cuboid (+0.7m)
        console.log('[RP-TA] §ROOM_HIGHLIGHT mode=cuboid guid=' + guid + ' bound=' + bound.size +
          ' box=' + zoomBox.size.x.toFixed(1) + 'x' + zoomBox.size.y.toFixed(1) + 'x' + zoomBox.size.z.toFixed(1) + ' margin=0.7');
        _drillSelect(bound, name, 'ROOM_SELECT', { isItem: true, parentSet: storeySet, zoomBox: zoomBox, clipPlanes: _clip, zoomMult: 1.8, suppressHighlight: true });
        _drawRoomCuboid(zoomBox.center, zoomBox.size, selCategory);
      } else if (bound.size) {
        console.log('[RP-TA] §ROOM_HIGHLIGHT mode=bounding-elements guid=' + guid + ' (no zoomBox available)');
        _drillSelect(bound, name, 'ROOM_SELECT', { isItem: true, parentSet: storeySet, zoomBox: zoomBox, zoomMult: 1.8 });
      } else {
        console.log('[RP-TA] §ROOM_HIGHLIGHT mode=' + (zoomBox ? 'cuboid' : 'cuboid-fallback') + ' guid=' + guid + ' (no bounding mesh found)');
        _drillSelect(storeySet || new Set([guid]), name, 'ROOM_SELECT', { isItem: false, zoomBox: zoomBox });
        if (zoomBox) _drawRoomCuboid(zoomBox.center, zoomBox.size, selCategory);
      }
    }

    // §ROOM_LENS_TAXONOMY (ROOM_LENS_VISUAL_HIGHLIGHT_SPEC.md §3/§9, 2026-07-15): a NEW, lightweight
    // "reveal" for a Storey or Type headline tap — camera stays put, that group's own room-shell
    // boxes brighten to their real category color, every real door serving those rooms lights up
    // brown, tapping the SAME headline again clears it. This REPLACES the old _roomGroupSelect
    // isolate-drill for normal room headers specifically (user's own framing: today's immediate
    // zoom/isolate on a header tap is premature for someone still building a mental map of the
    // floor — the reveal is the lighter first move; a single ROOM's leaf tap keeps the existing
    // zoom-in unchanged, see _roomSelect). Raw Parts-migrated groups (Stairs/Lift-Shaft/Plant-Room)
    // still use `_isolatePartsGroup` at the header level (see the render loop below) — those were
    // never IfcSpace rows, there's no room-shell/category concept to reveal for them.
    var _categoryRevealOn = null;   // null | the currently-revealed group key (gk)
    var _revealDoorMeshes = [];     // brown door-marker meshes, disposed on toggle-off/switch
    function _clearCategoryReveal() {
      _revealDoorMeshes.forEach(function(m) {
        if (m.parent) m.parent.remove(m);
        if (m.geometry) m.geometry.dispose();
        if (m.material) m.material.dispose();
      });
      _revealDoorMeshes = [];
      _roomBoxes.forEach(function(rb) {
        if (rb.mesh && rb.mesh.material && rb.mesh.userData && rb.mesh.userData._roomShell) {
          rb.mesh.material.opacity = 0.10;   // §RP-SHELL's own baseline shine-through opacity
          rb.mesh.material.needsUpdate = true;
        }
      });
      _categoryRevealOn = null;
      if (A.markDirty) A.markDirty();
    }
    // Real door positions for a set of room guids — reuses room_graph.js's ALREADY-COMPUTED
    // door-to-room edges (E1/E2/E9, each carrying the door's own real guid/position via its
    // 'doorwp' node) instead of a new query; never invented, same graph the Path sub-mode uses.
    function _doorPositionsForRooms(guids) {
      var graph = _roomGraphFor();
      if (!graph) return [];
      var guidSet = {}; guids.forEach(function(g) { guidSet[g] = true; });
      var seen = {}, out = [];
      graph.edges.forEach(function(e) {
        if (!e.doorGuid || seen[e.doorGuid]) return;
        if (!guidSet[e.a] && !guidSet[e.b]) return;
        seen[e.doorGuid] = true;
        var n = graph.nodesByGuid[e.doorGuid];
        if (n) out.push({ guid: e.doorGuid, x: n.cx, y: n.cy, z: n.cz || 0 });
      });
      // §DOOR-REAL-BOX (2026-07-15k, ROOM_LENS_VISUAL_HIGHLIGHT_SPEC.md §5/§12 "real door mesh/box
      // instead of a sphere marker"): one batched query for every door's REAL measured footprint
      // (bbox_x/bbox_y, real leaf width) + yaw (rotation_z) — same discipline as classifyUtilityRooms
      // just above (never one query per marker). Never invents a size: a door missing a row here
      // just keeps its position with sizeX/sizeY/yaw undefined, and the caller falls back to the
      // old sphere for that one marker only (never a fabricated box dimension).
      if (out.length && A.dbQuery) {
        try {
          var ph = out.map(function() { return '?'; }).join(',');
          var rows = A.dbQuery('SELECT guid, bbox_x, bbox_y, bbox_z, rotation_z FROM element_transforms WHERE guid IN (' + ph + ')',
            out.map(function(o) { return o.guid; }));
          var byGuid = {};
          rows.forEach(function(r) { byGuid[r[0]] = { sizeX: r[1], sizeY: r[2], sizeZ: r[3], yaw: r[4] }; });
          out.forEach(function(o) {
            var d = byGuid[o.guid];
            if (d) { o.sizeX = d.sizeX; o.sizeY = d.sizeY; o.sizeZ = d.sizeZ; o.yaw = d.yaw; }
          });
        } catch (e) { console.warn('[RP-TA] §DOOR_BOX_DIM_ERR', e.message); }
      }
      return out;
    }
    function _revealCategoryGroup(gk, groupRooms) {
      if (_categoryRevealOn === gk) { _clearCategoryReveal(); console.log('[RP-TA] §CATEGORY_REVEAL off gk="' + gk + '"'); return; }
      _clearCategoryReveal(); // mutually exclusive — switching categories clears the previous one first
      var guidSet = {};
      (groupRooms || []).forEach(function(rm) { guidSet[rm.key] = true; });
      var brightened = 0;
      _roomBoxes.forEach(function(rb) {
        if (rb.mesh && rb.mesh.material && guidSet[rb.guid]) {
          rb.mesh.material.opacity = 0.55;   // same "brightened" level _drawPathHighlight already uses for path-member shells
          rb.mesh.material.needsUpdate = true;
          brightened++;
        }
      });
      var doorPositions = _doorPositionsForRooms(Object.keys(guidSet));
      if (A.scene && A.ifc2three && typeof THREE !== 'undefined' && doorPositions.length) {
        // §DOOR-REAL-BOX: a box sized to the door's own real bbox_x/bbox_y/bbox_z + yawed by its
        // real rotation_z reads as an actual door leaf, not an arbitrary sphere — real measured
        // data, not invented. Every door SHARES one geometry+material per (sizeX,sizeY,sizeZ)
        // combo would be ideal but doors legitimately vary in size building-to-building; a fresh
        // BoxGeometry per marker is cheap (this reveal is capped at one room-category's doors,
        // never the whole building) and disposed on toggle-off (see _clearCategoryReveal above).
        var sphereGeo = null; // lazy singleton fallback, only built if a door is missing dims
        var doorMat = new THREE.MeshBasicMaterial({ color: 0x8d5524, transparent: true, opacity: 0.85, depthTest: false });
        var boxCount = 0, sphereCount = 0;
        doorPositions.forEach(function(p) {
          var c = A.ifc2three(p.x, p.y, p.z);
          var m;
          if (p.sizeX > 0 && p.sizeY > 0) {
            var geo = new THREE.BoxGeometry(p.sizeX, (p.sizeZ > 0 ? p.sizeZ : 2.0), p.sizeY);
            m = new THREE.Mesh(geo, doorMat);
            m.rotation.y = -(p.yaw || 0); // ifc2three's Y-up convention: yaw sign flips vs. IFC's Z-up rotation_z
            boxCount++;
          } else {
            if (!sphereGeo) sphereGeo = new THREE.SphereGeometry(0.2, 10, 10);
            m = new THREE.Mesh(sphereGeo, doorMat);
            sphereCount++;
          }
          m.position.set(c.x, c.y + 0.05, c.z);
          m.renderOrder = 1002;
          A.scene.add(m);
          _revealDoorMeshes.push(m);
        });
        console.log('[RP-TA] §DOOR_MARKER_SHAPE boxes=' + boxCount + ' spheres(no-real-dims-fallback)=' + sphereCount);
      }
      _categoryRevealOn = gk;
      if (A.markDirty) A.markDirty();
      console.log('[RP-TA] §CATEGORY_REVEAL on gk="' + gk + '" rooms=' + brightened + ' doors=' + doorPositions.length);
    }

    // §RP sub-toggle row [A | B | ...] — a small N-pill regroup control inside a lens tree.
    // §7 (VIEWER_FIND_PANEL_ROOM_ACCURACY.md): generalized from a fixed 2-pill signature to an
    // options array so the Room axis could grow a 3rd "Path" pill without a second control type.
    // Old (labelA,valA,labelB,valB,current,onPick) call shape still works — normalized below.
    function _subToggleRow(a, b, c, d, e, f) {
      var options, current, onPick;
      if (Array.isArray(a)) { options = a; current = b; onPick = c; }
      else { options = [{ label: a, val: b }, { label: c, val: d }]; current = e; onPick = f; }
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;padding:6px 10px;align-items:center;border-bottom:1px solid rgba(255,255,255,0.05)';
      var hint = document.createElement('span');
      hint.style.cssText = 'font-size:10px;color:#888;margin-right:2px';
      hint.textContent = _t('ui_lens_group', 'group:');
      row.appendChild(hint);
      options.forEach(function(o) {
        var on = (current === o.val);
        var btn = document.createElement('button');
        btn.textContent = o.label;
        btn.style.cssText = 'padding:3px 10px;font-size:10px;font-weight:700;border-radius:5px;cursor:pointer;white-space:nowrap;' +
          'border:1px solid rgba(79,195,247,' + (on ? '0.7' : '0.25') + ');' +
          'background:rgba(79,195,247,' + (on ? '0.25' : '0.08') + ');color:' + (on ? '#fff' : '#4fc3f7') + ';';
        btn.addEventListener('pointerup', function(e) { e.stopPropagation(); onPick(o.val); });
        row.appendChild(btn);
      });
      return row;
    }

    // §RP-T3 axis builders — list the groups for Room / Material / Phase.
    function _buildRoomTree() {
      // §RP Task A: with volume data the Room axis is a HIGHLIGHT lens (rooms glow,
      // model x-rayed) — NOT a contents isolate. Tapping focuses a room (box + zoom-to-fit).
      // §RP Room sub-toggle: group rooms [Storey | Type]. Storey (default) nests rooms under
      // their IfcBuildingStorey (spatial_structure.parent_guid). Type nests by object_type/
      // predefined_type (null → "(untyped)" — non-invent; populates on DBs that carry it).
      if (_categoryRevealOn) { _revealDoorMeshes.forEach(function(m) { if (m.parent) m.parent.remove(m); if (m.geometry) m.geometry.dispose(); if (m.material) m.material.dispose(); }); _revealDoorMeshes = []; _categoryRevealOn = null; } // _roomLensOn() below rebuilds _roomBoxes from scratch — any reveal state is now stale, drop it before it leaks door meshes
      if (_roomHasVol) {
        _roomLensOn();
        if (elIsoBar) {
          elIsoBar.style.display = 'flex';
          if (elIsoBtn) elIsoBtn.style.display = 'none';
          if (elShowAllBtn) elShowAllBtn.style.display = '';
        }
        elTree.appendChild(_subToggleRow([
            { label: _t('ui_axis_storey', 'Storey'), val: 'storey' },
            { label: _t('ui_room_type', 'Type'), val: 'type' },
            { label: _t('ui_room_path', 'Path'), val: 'path' }
          ], _roomGroupBy, function(v) { if (v !== _roomGroupBy) { _roomGroupBy = v; buildTree(); } }));
        // §7 Path sub-mode: two-room picker + Dijkstra route over the real door-adjacency graph
        // (common/room_graph.js). Own render path — no Storey/Type grouping list underneath.
        if (_roomGroupBy === 'path') {
          if (elIsoBar) elIsoBar.style.display = 'none'; // no isolate concept for a path — it's a highlight, not a filter
          _buildPathPanel();
          console.log('[RP-T3] §LENS_GROUPS lens=room mode=path');
          return;
        }
        _clearPathHighlight(); // leaving Path sub-mode — drop its line/zoom-only overlay (room shells stay, dims are reset by _roomLensOn above)
        // §ROOM-GUID-AWARE (see _roomUnionBBox above): probe room_guid so a §MULTI-RECT logical
        // room (N spatial_structure rows, one per sub-rect) collapses to ONE list entry instead of
        // N identically-named duplicates each selecting only its own sub-rect (real bug, confirmed
        // live 2026-07-13: HHS's "≈ Level 1 R12" listed twice, one entry only 2.0x1.7m — a small
        // offshoot ~7m from the room's real 9.95x7.96m body).
        var hasRoomGuidTree = false;
        try {
          var ssColsTree = A.dbQuery("PRAGMA table_info(spatial_structure)");
          hasRoomGuidTree = ssColsTree.some(function(c) { return c[1] === 'room_guid'; });
        } catch (eColsTree) {}
        var rooms = [];
        try {
          rooms = A.dbQuery("SELECT s.guid, s.name, p.name, s.object_type, s.predefined_type," +
            " s.center_x, s.center_y, s.size_x, s.size_y" +
            (hasRoomGuidTree ? ", s.room_guid" : ", NULL") +
            " FROM spatial_structure s LEFT JOIN spatial_structure p ON p.guid = s.parent_guid" +
            " WHERE s.type='IfcSpace' AND s.center_x IS NOT NULL ORDER BY p.name, s.name");
        } catch(e) { console.warn('[RP-TA] §ROOM_TREE_ERR', e.message); }
        var corridorLabels = (_roomGroupBy === 'type') ? _corridorLabelsFor() : {};
        // §ROOM_LENS_TAXONOMY: Restrooms — one batched keyword-matched query (same SQL broad
        // pre-filter + _keywordTokenMatch word-boundary discipline as LIFT_KEYWORDS/PLANT_KEYWORDS
        // above), not N per-room queries. Maps through rel_contained_in_space's raw space_guid to
        // this room's LOGICAL guid (a §MULTI-RECT room's sub-rects all share one room_guid).
        var restroomLogicalGuids = {};
        if (_roomGroupBy === 'type') {
          try {
            var rawToLogical = {};
            rooms.forEach(function(r) { rawToLogical[r[0]] = r[9] || r[0]; });
            var restroomCond = RESTROOM_KEYWORDS.map(function(w) { return "LOWER(m.element_name) LIKE '%" + w + "%'"; }).join(' OR ');
            var rrows = A.dbQuery("SELECT rc.space_guid, m.element_name FROM rel_contained_in_space rc" +
              " JOIN elements_meta m ON m.guid = rc.element_guid WHERE (" + restroomCond + ")");
            rrows.forEach(function(rr) {
              if (!_keywordTokenMatch(rr[1], RESTROOM_KEYWORDS)) return;
              var lg = rawToLogical[rr[0]];
              if (lg) restroomLogicalGuids[lg] = true;
            });
          } catch (eRr) { console.warn('[RP-TA] §RESTROOM_MATCH_ERR', eRr.message); }
        }
        // §ROOM_LENS_TAXONOMY / §UTILITY-CONTENT-BATCH: Utilities — real element-composition
        // signal (ACMV IfcFlowSegment / STR IfcFooting dominated, zero real door nearby), see
        // common/room_habitability.js classifyUtilityRooms(). ONE batched call for every logical
        // room here (2 SQL queries total) instead of a per-room call — a per-room version of this
        // caused a real hang on Hospital (311 rooms, see that file's own comment for the measured
        // detail) before this fix.
        var utilityLogicalGuids = {};
        if (_roomGroupBy === 'type' && window.RoomHabitability && window.RoomHabitability.classifyUtilityRooms) {
          try {
            var seenForUtil = {}, utilRoomDescs = [];
            rooms.forEach(function(r) {
              var lg2 = r[9] || r[0];
              if (seenForUtil[lg2]) return;
              seenForUtil[lg2] = true;
              utilRoomDescs.push({ guid: lg2, cx: r[5], cy: r[6], sx: r[7], sy: r[8], storey: r[2] || '' });
            });
            utilityLogicalGuids = window.RoomHabitability.classifyUtilityRooms(utilRoomDescs, A.dbQuery);
          } catch (eUc) { /* leave everything unclassified — never invent */ }
        }
        var byGroup = {}, order = [], typed = 0, seenLogical = {}, dupRects = 0;
        rooms.forEach(function(r) {
          // §ROOM-TYPE-FALLTHROUGH (VIEWER_FIND_PANEL_ROOM_ACCURACY.md Task 2): object_type
          // (r[3]) is 'COMPILED' for EVERY synthetic room — that's not a useful Type-view bucket,
          // so fall through to predefined_type (r[4], e.g. INTERNAL_DOORPART/INTERNAL_SMALL/
          // INTERNAL) instead of masking it. Real IfcSpace rows (object_type a real IFC type, e.g.
          // 'Office') still group by object_type first, unchanged.
          var logicalGuid = r[9] || r[0];   // room_guid, falling back to this row's own guid
          // §CORRIDOR-TYPE-LABEL: a real hallway-backbone match OVERRIDES whatever generic
          // predefined_type this room compiled with — takes priority over the fallthrough below,
          // since it's a stronger, door+wall-verified signal, not a compile-time placeholder.
          // §ROOM_LENS_TAXONOMY precedence (richest/strongest real signal first): Utilities (element
          // composition) > Corridor (door+wall backbone) > Restrooms (contained-element keyword) >
          // existing object_type/predefined_type fallthrough. A room can only carry ONE typeKey —
          // Utilities wins first since it's the strongest "this isn't occupiable at all" signal.
          var corridorMatch = corridorLabels[logicalGuid];
          var typeKey = utilityLogicalGuids[logicalGuid] ? 'Utilities' :
            (corridorMatch ? 'Hall / Corridor' :
            (restroomLogicalGuids[logicalGuid] ? 'Restrooms' :
            ((r[3] && r[3] !== 'COMPILED') ? r[3] : r[4])));
          var gk = (_roomGroupBy === 'type') ? (typeKey || '(untyped)') : (r[2] || '(no storey)');
          if (seenLogical[logicalGuid]) { dupRects++; return; }   // §MULTI-RECT: 1 entry per logical room
          seenLogical[logicalGuid] = true;
          if (_roomGroupBy === 'type' && typeKey) typed++;
          if (!byGroup[gk]) { byGroup[gk] = []; order.push(gk); }
          byGroup[gk].push({ key: logicalGuid, label: r[1] || '(unnamed)' });
        });
        // §CORRIDOR-ROOM-BACKPROP: `graph.nodes` (from _roomGraphFor(), same source the Path
        // sub-mode already uses) includes `CORRIDOR_ROOM::*` synthetic nodes for real hallway
        // buckets with NO spatial_structure row at all — the SQL query above can never see these,
        // it only reads real rows. Add them here so "return more results" (user ask) actually
        // reaches the Type/Storey tree too, not just the Path picker (which already lists them for
        // free via graph.nodes). Real, measured position/span either way — see _corridorRoomBBox.
        var corridorRoomCount = 0;
        try {
          var pathGraph = _roomGraphFor();
          if (pathGraph) {
            pathGraph.nodes.forEach(function (n) {
              if (n.guid.indexOf('CORRIDOR_ROOM::') !== 0) return;
              var gk2 = (_roomGroupBy === 'type') ? 'Hall / Corridor' : (n.storey || '(no storey)');
              if (!byGroup[gk2]) { byGroup[gk2] = []; order.push(gk2); }
              byGroup[gk2].push({ key: n.guid, label: n.name });
              corridorRoomCount++;
            });
          }
        } catch (eCr) { console.warn('[RP-T3] §CORRIDOR_ROOM_TREE_ERR', eCr.message); }
        // §ROOM_LENS_TAXONOMY (ROOM_LENS_VISUAL_HIGHLIGHT_SPEC.md §10): Stairs/Lift-Shaft/
        // Plant-Room — migrated OUT of the retired Parts axis into Room > Type (§8), same real
        // queries as that axis used, just a new tree location. Type-mode ONLY (mirrors Hall/
        // Corridor's own type-only gating above) — these are functional categories, not a
        // per-storey concept the way a real room's own storey is. Each entry carries `raw:true`
        // (+ `rawGuids` for a multi-row physical stair) so the render loop below isolates it via
        // `_isolatePartsGroup` (raw element/guid-set isolate) instead of `_roomSelect` (room-volume
        // cuboid+zoom) — these were never IfcSpace rows, there is no room volume to draw.
        var partsInjectedCount = 0;
        if (_roomGroupBy === 'type') {
          try {
            var bldClassTree = _buildingClass();
            // §STAIR-GROUPS-REUSE: real physical-stair grouping (room_graph.js's own trusted
            // extractor, WalkerDoctrine §10) — a genuine improvement over the retired Parts axis's
            // raw `ifc_class LIKE 'IfcStair%'` count, which over-counted individual flight/run rows
            // as separate stairs (Clinic: 7/8/13 depending on phrasing vs getStairGroups()'s
            // correct 4 — see room_graph.js §STAIR-GROUPS comment).
            if (window.RoomGraph && window.RoomGraph.getStairGroups) {
              var sg = window.RoomGraph.getStairGroups(A.dbQuery, function() {});
              if (sg.order.length) {
                byGroup['Stairs'] = sg.order.map(function(key) {
                  var gr = sg.groups[key];
                  return { key: gr.guids[0], label: key, raw: true, rawGuids: gr.guids };
                });
                order.push('Stairs');
                partsInjectedCount += sg.order.length;
              }
            }
            _PARTS_GROUPS.forEach(function(pg) {
              if (pg.type === 'STAIRWAY') return; // handled above via getStairGroups()
              // §PLANT_ROOM_GATE_FIX Bug 2, unchanged gate — carried over verbatim from the retired Parts axis.
              if (pg.type === 'PLANT_ROOM' && bldClassTree !== 'complex') {
                console.log('[RP-T3] §PARTS_CLASS_GATE type=PLANT_ROOM buildingClass=' + bldClassTree + ' -> hidden (complex-only)');
                return;
              }
              var prows = [];
              try { prows = A.dbQuery("SELECT guid, element_name FROM elements_meta WHERE (" + _partsCond(pg.type) + ")"); }
              catch (ePt) { console.warn('[RP-T3] §PARTS_MIGRATE_ERR', pg.type, ePt.message); }
              var words = (pg.type === 'LIFT_SHAFT') ? LIFT_KEYWORDS : PLANT_KEYWORDS;
              var beforeP = prows.length;
              prows = prows.filter(function(r) { return _keywordTokenMatch(r[1], words); });
              if (prows.length !== beforeP) {
                console.log('[RP-T3] §PARTS_WORD_BOUNDARY_FILTER type=' + pg.type + ' before=' + beforeP + ' after=' + prows.length);
              }
              if (!prows.length) return;
              var gk3 = (pg.type === 'LIFT_SHAFT') ? 'Lift Shaft' : 'Plant Room';
              byGroup[gk3] = prows.map(function(r) { return { key: r[0], label: r[1] || '(unnamed)', raw: true }; });
              order.push(gk3);
              partsInjectedCount += prows.length;
            });
          } catch (ePm) { console.warn('[RP-T3] §PARTS_MIGRATE_ERR', ePm.message); }
        }
        if (partsInjectedCount) console.log('[RP-T3] §PARTS_MIGRATED_TO_TYPE rows=' + partsInjectedCount);
        if (dupRects) console.log('[RP-T3] §ROOM_TREE_DEDUP collapsed ' + dupRects + ' §MULTI-RECT sub-rect row(s) into their logical room entry');
        if (corridorRoomCount) console.log('[RP-T3] §CORRIDOR_ROOM_TREE added ' + corridorRoomCount + ' backprop-injected corridor room(s)');
        order.forEach(function(gk) {
          var groupRooms = byGroup[gk];
          var kids = groupRooms.map(function(rm) {
            return _treeNode(rm.label, '', 1, { onTap: function() {
              if (rm.raw) _isolatePartsGroup(rm.label, rm.rawGuids || [rm.key]);
              else _roomSelect(rm.key);
            } });
          });
          // §DEPTH / §ROOM_LENS_TAXONOMY: a floor/type header tap now does the NEW lightweight
          // reveal (§3/§9 above) for a normal room group — camera stays put, that group's own
          // shells brighten + doors light up brown, tap again to clear. A raw Parts-migrated group
          // (Stairs/Lift-Shaft/Plant-Room) keeps the old isolate-drill (`_isolatePartsGroup`) —
          // those were never room volumes, there's no shell to reveal. Arrow still expands children.
          elTree.appendChild(_treeNode(gk, groupRooms.length, 0,
            { children: kids, onTap: function() {
                if (groupRooms.length && groupRooms[0].raw) {
                  var allGuids = [];
                  groupRooms.forEach(function(rm) { (rm.rawGuids || [rm.key]).forEach(function(g) { allGuids.push(g); }); });
                  _isolatePartsGroup(gk, allGuids);
                } else _revealCategoryGroup(gk, groupRooms);
            } }));
        });
        console.log('[RP-T3] §LENS_GROUPS lens=room mode=volume groupBy=' + _roomGroupBy +
          ' groups=' + order.length + ' rooms=' + rooms.length +
          (_roomGroupBy === 'type' ? ' typed=' + typed + '/' + rooms.length : ''));
        return;
      }
      // Fallback (DB without bbox columns): contents-isolate, the prior behaviour.
      var groups = [];
      try {
        groups = A.dbQuery("SELECT ss.guid, ss.name, COUNT(rc.element_guid) FROM spatial_structure ss" +
          " LEFT JOIN rel_contained_in_space rc ON rc.space_guid = ss.guid" +
          " WHERE ss.type='IfcSpace' GROUP BY ss.guid, ss.name ORDER BY ss.name")
          .map(function(r) { return { key: r[0], label: r[1] || '(unnamed)', count: r[2] }; });
      } catch(e) { console.warn('[RP-T3] §ROOM_TREE_ERR', e.message); }
      groups.forEach(function(g) {
        elTree.appendChild(_treeNode(g.label, g.count, 0, { onTap: function() { _isolateLensGroup('room', g); } }));
      });
      console.log('[RP-T3] §LENS_GROUPS lens=room mode=contents groups=' + groups.length);
    }

    // §7 Path sub-mode UI: a From/To room picker + Find button, results rendered as tappable
    // room rows (reusing _treeNode → _roomSelect, same as every other lens list) with the real
    // door name/guid printed between consecutive hops.
    function _buildPathPanel() {
      var graph = _roomGraphFor();
      var wrap = document.createElement('div');
      if (!graph || !graph.nodes.length) {
        wrap.style.cssText = 'color:#888;font-size:11px;padding:14px 10px';
        wrap.textContent = _t('ui_room_path_unavailable', 'No room graph available for this building.');
        elTree.appendChild(wrap);
        return;
      }
      wrap.style.cssText = 'padding:8px 10px;display:flex;flex-direction:column;gap:6px';
      var sorted = graph.nodes.slice().sort(function(a, b) {
        if (a.storey !== b.storey) return a.storey < b.storey ? -1 : 1;
        return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
      });
      function mkSelect(id, placeholder) {
        var sel = document.createElement('select');
        sel.id = id;
        sel.style.cssText = 'flex:1;min-width:0;padding:5px 6px;font-size:11px;border-radius:5px;' +
          'border:1px solid rgba(255,255,255,0.2);background:#1a1a1a;color:#ddd';
        var opt0 = document.createElement('option');
        opt0.value = ''; opt0.textContent = placeholder;
        sel.appendChild(opt0);
        sorted.forEach(function(n) {
          var opt = document.createElement('option');
          opt.value = n.guid;
          opt.textContent = n.name + ' · ' + (n.label || n.name) + ' (' + n.storey + ')';
          sel.appendChild(opt);
        });
        return sel;
      }
      var row1 = document.createElement('div');
      row1.style.cssText = 'display:flex;gap:6px;align-items:center';
      var selFrom = mkSelect('find-path-from', _t('ui_room_path_from', 'From room…'));
      var selTo = mkSelect('find-path-to', _t('ui_room_path_to', 'To room…'));
      selFrom.value = _pathFromGuid; selTo.value = _pathToGuid;
      selFrom.addEventListener('pointerdown', function(e) { e.stopPropagation(); });
      selTo.addEventListener('pointerdown', function(e) { e.stopPropagation(); });
      selFrom.addEventListener('change', function(e) { e.stopPropagation(); _pathFromGuid = selFrom.value; });
      selTo.addEventListener('change', function(e) { e.stopPropagation(); _pathToGuid = selTo.value; });
      row1.appendChild(selFrom);
      var arrow = document.createElement('span'); arrow.textContent = '→'; arrow.style.cssText = 'color:#666;flex-shrink:0';
      row1.appendChild(arrow);
      row1.appendChild(selTo);
      wrap.appendChild(row1);

      var btn = document.createElement('button');
      btn.textContent = _t('ui_room_path_find', 'Find Path');
      btn.style.cssText = 'padding:6px 10px;font-size:11px;font-weight:700;border-radius:6px;cursor:pointer;' +
        'border:1px solid rgba(79,195,247,0.6);background:rgba(79,195,247,0.18);color:#fff';
      var resultBox = document.createElement('div');
      resultBox.style.cssText = 'display:flex;flex-direction:column;gap:2px';
      btn.addEventListener('pointerup', function(e) {
        e.stopPropagation();
        if (!_pathFromGuid || !_pathToGuid) {
          resultBox.innerHTML = '';
          resultBox.textContent = _t('ui_room_path_pick_both', 'Pick a From and a To room.');
          resultBox.style.cssText = 'font-size:11px;color:#e67e22;padding:6px 2px';
          return;
        }
        if (_pathFromGuid === _pathToGuid) {
          resultBox.innerHTML = '';
          resultBox.textContent = _t('ui_room_path_same', 'From and To are the same room.');
          resultBox.style.cssText = 'font-size:11px;color:#e67e22;padding:6px 2px';
          return;
        }
        var res = _findRoomPath(_pathFromGuid, _pathToGuid);
        _pathLastResult = res;
        resultBox.style.cssText = 'display:flex;flex-direction:column;gap:2px';
        _renderPathResult(resultBox, graph, res);
      });
      wrap.appendChild(btn);
      wrap.appendChild(resultBox);
      elTree.appendChild(wrap);

      // Re-render a previous result if the user left and re-entered Path mode with the same picks.
      if (_pathLastResult && _pathFromGuid && _pathToGuid) _renderPathResult(resultBox, graph, _pathLastResult);
    }

    function _renderPathResult(box, graph, res) {
      box.innerHTML = '';
      if (!res) {
        var msg = document.createElement('div');
        msg.style.cssText = 'font-size:11px;color:#e67e22;padding:6px 2px';
        msg.textContent = _t('ui_room_path_none', 'No door-connected path — these rooms are on disconnected parts of the building.');
        box.appendChild(msg);
        return;
      }
      var hdr = document.createElement('div');
      hdr.style.cssText = 'font-size:10px;color:#4fc3f7;padding:4px 2px 2px';
      hdr.textContent = res.doors.length + (res.doors.length === 1 ? ' door · ' : ' doors · ') + res.distance.toFixed(1) + 'm';
      box.appendChild(hdr);
      res.path.forEach(function(guid, i) {
        var n = graph.nodesByGuid[guid];
        box.appendChild(_treeNode((i + 1) + '. ' + n.name + ' · ' + (n.label || n.name), '', 1,
          { onTap: function() { _roomSelect(guid); } }));
        if (i < res.doors.length) {
          var d = document.createElement('div');
          d.style.cssText = 'padding:2px 10px 2px 34px;font-size:9px;color:#777;display:flex;align-items:center;gap:4px';
          d.textContent = '└─ door: ' + (res.doors[i].name || res.doors[i].guid);
          d.title = 'door guid: ' + res.doors[i].guid;
          box.appendChild(d);
        }
      });
    }

    // Isolate a raw element group (Stairs/Lift-Shaft/Plant-Room — see §ROOM_LENS_TAXONOMY in
    // _buildRoomTree(), the sole caller now that the standalone Parts axis is retired) — plain
    // filterByGuids, no highlight/box overlay to own or tear down. Mirrors _isolateLensGroup's tail
    // (isoBar show) but takes the guid set directly since the caller already has the rows in hand.
    // §RAW-ISOLATE-TOGGLE (2026-07-15, real user report on Hospital: "stairs does not untoggle" —
    // tapping Stairs a 2nd time just re-ran the same isolate instead of clearing it, unlike the
    // new category reveal (§ROOM_LENS_TAXONOMY §3) which DOES toggle off on repeat tap. User also
    // confirmed switching BETWEEN raw groups already worked ("plants/stairs untoggle each other" —
    // a new isolate naturally replaces the old one); only the SAME-label-twice case was missing.
    // `label` is the tracking key for both header taps ("Stairs") and individual leaf taps (a
    // specific stair's own name) — tapping the exact same one again clears back to normal.
    var _rawIsolateOn = null;
    function _isolatePartsGroup(label, guids) {
      if (!A.db || !A.filterByGuids) return;
      if (_rawIsolateOn === label) {
        A.filterByGuids(null);
        _rawIsolateOn = null;
        if (elIsoBtn) elIsoBtn.style.display = '';
        if (elShowAllBtn) elShowAllBtn.style.display = 'none';
        if (A.markDirty) A.markDirty();
        console.log('[RP-A1] §FILTER_ISOLATE_TOGGLE_OFF lens=parts group="' + label + '"');
        return;
      }
      if (A.filterStorey) A.filterStorey(null);
      if (A.filterDisc) A.filterDisc(null);
      var set = new Set(guids);
      if (!set.size) { console.log('[RP-A1] §FILTER_ISOLATE_EMPTY lens=parts group="' + label + '"'); return; }
      _emitIsolate(set, 'parts="' + label + '"');
      _rawIsolateOn = label;
      if (elIsoBar) {
        elIsoBar.style.display = 'flex';
        if (elIsoBtn) elIsoBtn.style.display = 'none';
        if (elShowAllBtn) elShowAllBtn.style.display = '';
      }
    }

    // §ROOM_LENS_TAXONOMY (2026-07-15): the standalone Parts axis (STAIRWAY/LIFT_SHAFT/PLANT_ROOM)
    // is RETIRED — its tree-building loop now lives inline inside _buildRoomTree()'s Type sub-mode
    // (see §ROOM_LENS_TAXONOMY comment there), reusing the SAME `_PARTS_GROUPS`/`_partsCond`/
    // `_keywordTokenMatch`/`_buildingClass` this file still keeps below, plus `_isolatePartsGroup`
    // immediately above (still called from there). Removed here: the old `present.parts` axis-pill
    // gate, the `_treeMode === 'parts'` dispatch, and this function's own tree-walk (dead code once
    // its ONLY caller was removed) — Room is now the one axis a user reaches Stairs/Lift-Shaft/
    // Plant-Room/Restrooms/Hall-Corridor/Utilities through, via the Type sub-toggle.

    // §MAT_SELECT: Material axis is a HIGHLIGHT lens (parity with Room/Phase).
    // §RP Material category — SQL-DERIVED (heuristic, deterministic) from material_name
    // keywords. Labelled "(derived)" in the UI/§-log per the resolved decision — this is NOT
    // an extracted IfcMaterial.Category. Coarse construction buckets; "Other" = no keyword hit.
    function _deriveCategory(name) {
      var n = (name || '').toLowerCase();
      if (/concrete|cast-in|footing|foundation|grout|screed/.test(n)) return 'Concrete';
      if (/steel|metal|rebar|alumin|iron|brass|copper/.test(n)) return 'Metal';
      if (/wood|timber|plywood|mdf|oak|pine|lumber/.test(n)) return 'Wood';
      if (/glass|glazing|glazed/.test(n)) return 'Glass';
      if (/gypsum|plaster|drywall|stud|partition|sheathing/.test(n)) return 'Drywall/Partition';
      if (/brick|masonry|block|cmu|stone/.test(n)) return 'Masonry';
      if (/insulation|insul|rockwool|fiberglass/.test(n)) return 'Insulation';
      if (/tile|ceramic|porcelain/.test(n)) return 'Tile';
      if (/paint|finish|coating|render|stucco/.test(n)) return 'Finish';
      if (/membrane|waterproof|vapou?r|roofing|bitumen/.test(n)) return 'Membrane';
      if (/carpet|vinyl|laminate|flooring/.test(n)) return 'Flooring';
      if (/default|generic|unnamed/.test(n)) return 'Generic';
      return 'Other';
    }

    // §MAT_SELECT: Material axis is a HIGHLIGHT lens (parity with Room/Phase). Sub-toggle
    // [Material | Category]: Material (default) = flat list by name; Category = SQL-derived
    // buckets, each expandable to its materials. Tap = element-precise highlight + x-ray rest.
    function _buildMaterialTree() {
      elTree.appendChild(_subToggleRow(
        _t('ui_lens_material', 'Material'), 'material', _t('ui_lens_category', 'Category') + ' *', 'category',
        _matGroupBy, function(v) { if (v !== _matGroupBy) { _matGroupBy = v; buildTree(); } }));
      var rows = [];
      try { rows = A.dbQuery("SELECT guid, material_name FROM elements_meta WHERE material_name IS NOT NULL"); }
      catch(e) { console.warn('[RP-T3] §MAT_TREE_ERR', e.message); }
      if (_matGroupBy === 'category') {
        var byCat = {}, catOrder = [];
        rows.forEach(function(r) {
          var cat = _deriveCategory(r[1]);
          if (!byCat[cat]) { byCat[cat] = { count: 0, mats: {} }; catOrder.push(cat); }
          byCat[cat].count++; byCat[cat].mats[r[1]] = (byCat[cat].mats[r[1]] || 0) + 1;
        });
        catOrder.sort(function(a, b) { return byCat[b].count - byCat[a].count; });
        catOrder.forEach(function(cat) {
          var kids = Object.keys(byCat[cat].mats).sort().map(function(mn) {
            return _treeNode(mn, byCat[cat].mats[mn], 1, { onTap: function() { _materialSelectByName(mn); } });
          });
          elTree.appendChild(_treeNode(cat + ' (derived)', byCat[cat].count, 0,
            { children: kids, onTap: function() { _materialSelectByCategory(cat); } }));
        });
        console.log('[RP-T3] §LENS_GROUPS lens=material groupBy=category source=SQL-derived cats=' +
          catOrder.length + ' mats=' + new Set(rows.map(function(r) { return r[1]; })).size);
        return;
      }
      var counts = {}, matOrder = [];
      rows.forEach(function(r) { if (counts[r[1]] == null) { counts[r[1]] = 0; matOrder.push(r[1]); } counts[r[1]]++; });
      matOrder.sort(function(a, b) { return counts[b] - counts[a]; });
      matOrder.forEach(function(mn) {
        elTree.appendChild(_treeNode(mn, counts[mn], 0, { onTap: function() { _materialSelectByName(mn); } }));
      });
      console.log('[RP-T3] §LENS_GROUPS lens=material groupBy=material groups=' + matOrder.length);
    }

    function _materialHighlight(label, set) {
      // §RP-SHAPE: material select now lights the elements' REAL shapes (cyan) + rest at 0.2,
      // same as the phase drill. No parent group to keep solid → phaseSet null.
      _drillSelect(set, label, 'MAT_SELECT', { isItem: false }); // top-level group: material solid, building 0.2
    }

    function _materialSelectByName(name) {
      var set = new Set();
      try { A.dbQuery("SELECT guid FROM elements_meta WHERE material_name = ?", [name]).forEach(function(r) { set.add(r[0]); }); }
      catch(e) { console.warn('[RP-T3] §MAT_SELECT_ERR', e.message); }
      _materialHighlight(name, set);
    }

    function _materialSelectByCategory(cat) {
      var set = new Set();
      try {
        A.dbQuery("SELECT guid, material_name FROM elements_meta WHERE material_name IS NOT NULL")
          .forEach(function(r) { if (_deriveCategory(r[1]) === cat) set.add(r[0]); });
      } catch(e) { console.warn('[RP-T3] §MAT_SELECT_ERR', e.message); }
      _materialHighlight(cat + ' (derived)', set);
    }

    // ══ §RP Task B: Phase axis = Time Machine's REAL timeline generator ══
    // Source of truth = window.tmGenerateTimeline() (time_machine.js injectGantt). It writes
    // one ELEMENT_PLACE row per element into kernel_ops (timestamp = install order,
    // parameters = JSON {phase,...}). We trigger it lazily ONCE (cached), then read
    // kernel_ops ORDER BY timestamp, grouping output_guid by parameters.phase.
    var _phaseCache = null;  // { order:[name...], byPhase:{ name:{guids:Set,count,firstTs} } }
    var _tmGenTried = false; // ran tmGenerateTimeline once

    function _readKernelOps() {
      var rows = [];
      try {
        rows = A.dbQuery("SELECT output_guid, parameters, timestamp FROM kernel_ops" +
          " WHERE undone = 0 AND op_type = 'ELEMENT_PLACE' ORDER BY timestamp");
      } catch(e) {
        console.log('[RP-TB] §PHASE_LENS gen=real source=kernel_ops status="read error: ' + e.message + '" phases=0');
        return null;
      }
      if (!rows.length) return null;
      var byPhase = {};
      rows.forEach(function(r) {
        var guid = r[0], ts = r[2];
        var ph = 'Architecture';
        try { var p = JSON.parse(r[1]); if (p && p.phase) ph = p.phase; } catch(e) {}
        if (!byPhase[ph]) byPhase[ph] = { guids: new Set(), count: 0, firstTs: ts };
        if (guid != null) { byPhase[ph].guids.add(guid); byPhase[ph].count++; }
        if (ts < byPhase[ph].firstTs) byPhase[ph].firstTs = ts;
      });
      var order = Object.keys(byPhase).sort(function(a, b) {
        return byPhase[a].firstTs - byPhase[b].firstTs || (a < b ? -1 : 1);
      });
      _phaseCache = { order: order, byPhase: byPhase };
      return _phaseCache;
    }

    function _generatePhases() {
      if (_phaseCache) return _phaseCache;
      var pc = _readKernelOps();
      if (pc) return pc;
      if (!_tmGenTried) {
        _tmGenTried = true;
        if (typeof window.tmGenerateTimeline !== 'function') {
          console.log('[RP-TB] §PHASE_LENS gen=real source=kernel_ops status="tmGenerateTimeline absent (time_machine.js not loaded)" phases=0');
          return null;
        }
        var ok = false;
        try { ok = window.tmGenerateTimeline(); }
        catch(e) { console.log('[RP-TB] §PHASE_LENS gen=real source=kernel_ops status="generator threw: ' + e.message + '" phases=0'); return null; }
        if (!ok) {
          console.log('[RP-TB] §PHASE_LENS gen=real source=kernel_ops status="generator returned false (no elements)" phases=0');
          return null;
        }
        pc = _readKernelOps();
        if (pc) return pc;
      }
      console.log('[RP-TB] §PHASE_LENS gen=real source=kernel_ops status="kernel_ops empty after generate" phases=0');
      return null;
    }

    function _buildPhaseTree() {
      if (_phaseCache) { _renderPhaseList(_phaseCache, 'cached'); return; }
      var hint = document.createElement('div');
      hint.style.cssText = 'padding:10px;font-size:11px;color:#4fc3f7';
      hint.textContent = _t('ui_phase_generating', 'Timeline generating…');
      elTree.appendChild(hint);
      setTimeout(function() {
        if (_treeMode !== 'phase') return; // user switched axis meanwhile
        var pc = _generatePhases();
        elTree.innerHTML = '';
        if (!pc) {
          var msg = document.createElement('div');
          msg.style.cssText = 'padding:10px;font-size:11px;color:#888';
          msg.textContent = _t('ui_phase_unavailable', 'Timeline unavailable (generator not loaded).');
          elTree.appendChild(msg);
          return;
        }
        _renderPhaseList(pc, 'fresh');
      }, 0);
    }

    // §D drill helpers ───────────────────────────────────────────────────────────
    var _PHASE_ELEM_CAP = 250;     // max element leaves listed per phase/task (no silent cap)
    var _elMetaMap = null;         // guid → {name, cls}, lazily cached per Find-open

    function _elMeta() {
      if (_elMetaMap) return _elMetaMap;
      _elMetaMap = {};
      try {
        A.dbQuery("SELECT guid, element_name, ifc_class FROM elements_meta")
          .forEach(function(r) { _elMetaMap[r[0]] = { name: r[1], cls: r[2] }; });
      } catch(e) { /* map stays empty */ }
      return _elMetaMap;
    }
    function _elLabel(g) {
      var em = _elMeta()[g];
      return (em && em.name) || (em && em.cls && friendlyClass(em.cls)) || (g ? g.substring(0, 10) : '?');
    }

    // World-space bbox (Three units) enclosing a guid set, from element_transforms.
    function _bboxOfGuids(set) {
      if (!set || !set.size || typeof THREE === 'undefined' || !A.ifc2three) return null;
      var rows = [];
      try { rows = A.dbQuery("SELECT guid, center_x, center_y, center_z, bbox_x, bbox_y, bbox_z FROM element_transforms"); }
      catch(e) { return null; }
      var minx = Infinity, miny = Infinity, minz = Infinity, maxx = -Infinity, maxy = -Infinity, maxz = -Infinity, n = 0;
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (r[1] == null || !set.has(r[0])) continue;
        var c = A.ifc2three(r[1], r[2], r[3]);
        var hx = Math.max(r[4] || 0.05, 0.05) / 2, hy = Math.max(r[6] || 0.05, 0.05) / 2, hz = Math.max(r[5] || 0.05, 0.05) / 2;
        if (c.x - hx < minx) minx = c.x - hx; if (c.y - hy < miny) miny = c.y - hy; if (c.z - hz < minz) minz = c.z - hz;
        if (c.x + hx > maxx) maxx = c.x + hx; if (c.y + hy > maxy) maxy = c.y + hy; if (c.z + hz > maxz) maxz = c.z + hz;
        n++;
      }
      if (!n) return null;
      return { center: new THREE.Vector3((minx + maxx) / 2, (miny + maxy) / 2, (minz + maxz) / 2),
               size: new THREE.Vector3(maxx - minx, maxy - miny, maxz - minz) };
    }
    function _zoomToGuids(set, factor) { var bb = _bboxOfGuids(set); if (bb) _zoomToBox(bb.center, bb.size, factor); return !!bb; }

    // §RP-SHAPE drill: x-ray the rest (transparent), keep the WHOLE PHASE solid (real-geometry
    // opaque overlay), and light the SELECTED item's real SHAPE in cyan. Never hides. `phaseSet`
    // (optional) is the parent phase's guids — the part kept solid; `set` is what's lit.
    // §DEPTH — ONE uniform model across every lens (Storey·Disc·Room·Material·Phase). The view is
    // a pure function of selection depth; NO per-lens custom rendering:
    //   • rest of building = 0.1 GHOST, always (never hidden).
    //   • GROUP selected (litSet empty, only groupSet) → group = 1.0 SOLID natural material +
    //     zoom-to-FIT the group (fills the frame). No cyan — solid IS the "you are here".
    //   • ITEM selected (litSet present) → item = bright cyan, its group drops to 0.5 (semi),
    //     item zoom 1.1. The 0.1↔0.5 gap + colour (not another opacity step) carries the hierarchy.
    // Callers: group-select passes (null, …, groupSet); item-select passes (itemSet, …, groupSet).
    // ctxOpacity overrides the item-mode group opacity (default 0.5); group mode is always 1.0.
    // zoomBox (optional, item mode): a {center,size} to FRAME instead of the lit set — e.g. a Room
    // frames its whole VOLUME (its 2 contained elements would zoom to a tiny erroneous frame).
    var _drillRAF1 = null, _drillRAF2 = null;
    // §DEPTH — ONE windowed model (user-designed), uniform across every lens. Reading OUTWARD from
    // the focus (the thing you tapped):
    //   focus  = solid  (+ a SEE-THROUGH cyan mesh-highlight if it's the FINAL ITEM — the item is the
    //            smallest thing, so solid alone vanishes when zoomed out; the shine-thru keeps it found)
    //   1 out  = 0.2     ── EXCEPT a final item keeps its parent SOLID and pushes 0.2 to the grandparent
    //   beyond = hidden (0)
    // So GROUP focus: [solid] [parent 0.2] [hidden…].  ITEM focus: [solid+shine] [parent solid] [grand 0.2] [hidden…].
    // When the outermost visible layer IS the building (shallow focus), it is the 0.2 (base) and there
    // is no "hidden" beyond it. Callers pass opts = { isItem, parentSet, grandSet, zoomBox }.
    function _drillSelect(focusSet, label, tag, opts) {
      opts = opts || {};
      if (_drillRAF1) { cancelAnimationFrame(_drillRAF1); _drillRAF1 = null; }
      if (_drillRAF2) { cancelAnimationFrame(_drillRAF2); _drillRAF2 = null; }
      if (A.filterStorey) A.filterStorey(null);
      if (A.filterDisc) A.filterDisc(null);
      if (A.filterByGuids) A.filterByGuids(null); // never isolate — x-ray + shape highlight only
      var focusN = focusSet ? focusSet.size : 0;
      if (!focusN) { console.log('[RP-TB] §' + tag + ' "' + label + '" elems=0'); return; }
      var isItem = !!opts.isItem, parentSet = opts.parentSet || null, grandSet = opts.grandSet || null, zoomBox = opts.zoomBox || null;

      // §VIEWLOG: record the focus + ancestor chain so the timeline can REPLAY this exact view.
      _pushView({
        kind: isItem ? 'item' : 'group', tag: tag, label: label, mode: _treeMode, isItem: isItem,
        focusGuids: Array.from(focusSet),
        parentGuids: parentSet ? Array.from(parentSet) : [],
        grandGuids: grandSet ? Array.from(grandSet) : []
      });

      _clearShapeOverlays();
      _clearHlOverlay();
      if (A.setOutline) A.setOutline([]); // §YELLOW-PICK: drop any prior item outline (group select clears it)
      // §SHELL-MODE: when the merged ghost shell is built it IS the surroundings — so drop the whole
      // x-ray machinery and the ancestor context overlays. A frame becomes: selection solid + ONE shell mesh.
      var _shell = !!(_mergedGhost && _mergedGhost.visible);
      // §MOBILE-BBOX-DEFAULT: the translucent ghost shell (_dimXrayTo whole model) is too heavy on mobile.
      // Default mobile Find/drill to the cheap bbox-wireframe shell (Alt+X envelope) — i.e. bboxes during layering.
      // §DESKTOP-BBOX-THRESHOLD: same reasoning applies on desktop once the building itself is large
      // (initial-load weight, not the per-tab-switch cost tracked separately) — extend the same default
      // there by real element count instead of gating on window._isMobile alone. Cached build → only
      // the first drill pays for it either way.
      if (!_shell && (window._isMobile || _isLargeBuilding())) {
        var _mg = (_mergedGhost && _mergedGhostBld === A.activeBuilding) ? _mergedGhost : _buildMergedGhost();
        if (_mg) { _mg.visible = true; _shell = true; _mgLensOwned = true; console.log('[MG] §BBOX_SHELL_DEFAULT Find→bbox (no heavy x-ray) mobile=' + !!window._isMobile + ' large=' + _isLargeBuilding() + ' lensOwned=1'); }
      }
      if (!_shell && !A.xrayOn && A.toggleXray) { A.toggleXray(); _hlXrayWasOff = true; } // x-ray path: rest → transparent

      // Build the visible window (inner→outer) + decide the building base (0.2 if it IS the next layer, else hidden).
      var layers = [], baseOp;
      if (_shell) {
        // §SLIDING-WINDOW: ghost shell = far context. Keep ONLY the immediate parent SOLID (peers of an
        // item / the floor of a layer); the selection draws solid+highlighted on top. Grandparent+ drop
        // into the shell. Hide the base (shell covers it), NO x-ray. Drill deeper → window slides down.
        // §PERF-FREEZE-FIX (2026-07-16): a whole-storey parentSet drawn SOLID means _buildShapeMeshes
        // clones a real (often shader-perturbed via onBeforeCompile — see streaming.js _getMaterial)
        // material per unique hash/class group for EVERY element in it, fresh on every tap (never
        // cached) — cheap for a handful of peers, but on a large building's storey (thousands of
        // elements, many disciplines) this clone storm is what froze the tab (live user report:
        // "Script terminated by timeout" stack landing inside _buildShapeMeshes's clone loop, fired
        // from this exact RAF1 ancestor-layer build on a Find-panel room/corridor tap on Terminal).
        // _shell mode now auto-triggers for large buildings (`_isLargeBuilding()` above), so this
        // path — previously reached mostly via manual Alt+X or mobile on SMALL buildings, where a
        // storey-sized parentSet is small too — now fires on EVERY Find-panel tap on Terminal/
        // Hospital, where a storey can be thousands of elements. The ghost shell already IS "the far
        // context" per this block's own comment above, so skip the redundant expensive solid draw
        // once parentSet is too big to be cheap — reusing the SAME 1500-element fast-path cutoff
        // `_buildShapeMeshes` itself already uses for its row-query threshold (line ~1667) rather
        // than inventing a new number. Small parentSets (mobile-bbox-shell on a normal-size building)
        // keep the existing solid-parent behavior unchanged — this only skips the large case that froze.
        if (parentSet && parentSet.size <= 1500) layers.push({ set: parentSet, op: 1.0 });   // immediate parent SOLID (small only)
        if (A.filterByGuids) A.filterByGuids(new Set());           // hide base — shell is the surroundings
        baseOp = 'shell';
      } else {
        if (isItem) {
          if (parentSet) layers.push({ set: parentSet, op: 1.0 });        // immediate parent: SOLID
          if (grandSet) { layers.push({ set: grandSet, op: 0.2 }); baseOp = 0; } // grandparent 0.2, building hidden
          else baseOp = 0.2;                                              // no grandparent → building IS the 0.2
        } else {
          if (parentSet) { layers.push({ set: parentSet, op: 0.2 }); baseOp = 0; } // nested group: parent 0.2, building hidden
          else baseOp = 0.2;                                             // top-level group → building IS the 0.2
        }
        if (_USE_SHELL && A.filterByGuids) { A.filterByGuids(_exteriorGuids()); _dimXrayTo(0.3); }
        else _dimXrayTo(baseOp);
      }
      if (elIsoBar) {
        elIsoBar.style.display = 'flex';
        if (elIsoBtn) elIsoBtn.style.display = 'none';
        if (elShowAllBtn) elShowAllBtn.style.display = '';
      }
      if (A.markDirty) A.markDirty(); // immediate: the base dims THIS frame → the tap is acknowledged at once

      // §PERF: build the heavy overlays OFF the pointer thread so the tap returns instantly.
      _drillRAF1 = requestAnimationFrame(function() {
        _drillRAF1 = null;
        // ancestors inner→outer, each excluding all inner sets (avoid z-fight / double-draw)
        var excl = new Set(focusSet), ancLog = [];
        for (var li = 0; li < layers.length; li++) {
          var L = layers[li], s = new Set();
          L.set.forEach(function(g) { if (!excl.has(g)) s.add(g); });
          L.set.forEach(function(g) { excl.add(g); });
          var nn = _buildShapeMeshes(s, null, L.op >= 1 ? 1.0 : L.op);
          ancLog.push(L.op + '×' + nn);
        }
        // §YELLOW-PICK: the selected ITEM renders SOLID in its real material with a crisp YELLOW edge
        // outline — replaces the cyan shine-through, which washed out against the discipline blues
        // (user). Applies to EVERY lens (room/disc/phase/material/type). Outline the element-precise
        // overlay meshes so the glow can't bleed onto batch-neighbours (the §C OutlinePass-on-batched
        // bug). OutlinePass is desktop-only → mobile falls back to a faint yellow fill.
        var _before = _shapeOverlays.length;
        var _clip = opts.clipPlanes || null;
        var solid = _buildShapeMeshes(focusSet, null, 1.0, null, _clip);          // focus solid, real material (clipped for rooms)
        var hl = 0;
        // §ROOM_HIGHLIGHT: caller already drew its own primary highlight (the purple room cuboid) and
        // only wants the ancestor-dim/zoom-to-fit side effects from this focusSet — skip the per-element
        // yellow fill/silhouette entirely so it can't read as fragmented "cut" seams (VIEWER_FIND_PANEL_ROOM_ACCURACY.md §8).
        if (opts.suppressHighlight) {
          // no-op: hl stays 0, real materials from `solid` above still render normally (undimmed, clipped to the room volume)
        } else if (isItem && _clip) {
          // §ROOM-CLIP: room shell is confined to the cuboid via clip planes; OutlinePass can't clip,
          // so a clipped yellow fill over the real surfaces marks the room instead of the silhouette.
          hl = _buildShapeMeshes(focusSet, 0xffd400, null, 0.4, _clip);
        } else {
          // §YELLOW-SILHOUETTE: applies to the SELECTION whether it's a final item OR a group (storey/
          // type/disc) — the focus meshes are instanced-by-hash so a 3000-pipe group is a handful of
          // objects, cheap to outline. The selected set always reads with the same yellow silhouette.
          var _focusMeshes = [];
          for (var _fi = _before; _fi < _shapeOverlays.length; _fi++) _focusMeshes.push(_shapeOverlays[_fi].mesh);
          if (A._outlinePass && A.setOutline && _focusMeshes.length) {
            // §YELLOW-PICK silhouette: outline traces the item's outer SHAPE (OutlinePass is a
            // silhouette pass — no internal edges). Set the HIDDEN-edge colour to the same yellow so
            // the outline SHINES THROUGH the solid storey/building — orbit around and it's always a
            // visible outline of the item. Thicker, around the shape, never into it.
            A.setOutline(_focusMeshes, 0xffd400);                  // visible silhouette = yellow
            A._outlinePass.hiddenEdgeColor.set(0xffd400);          // occluded silhouette = same yellow (shines thru)
            A._outlinePass.edgeThickness = 3;                      // thicker
            A._outlinePass.edgeStrength = 6;
            A._outlinePass.edgeGlow = 0.3;
            hl = _focusMeshes.length;
          } else {
            hl = _buildShapeMeshes(focusSet, 0xffd400, null, 0.35);               // mobile fallback: faint yellow fill
          }
        }
        var zoomed = zoomBox ? _zoomToBoxFill(zoomBox.center, zoomBox.size, tag + '_ZOOM', opts.zoomMult)
                   : (isItem ? _zoomToGuids(focusSet, 1.1) : _zoomToGroup(focusSet));
        if (A.markDirty) A.markDirty();
        console.log('[RP-TB] §' + tag + ' "' + label + '" ' + (isItem ? 'ITEM' : 'GROUP') + ' focus=' + focusN +
          ' solid=' + solid + ' hl=' + hl + ' anc=[' + ancLog.join(',') + '] base=' + baseOp +
          ' overlays=' + _shapeOverlays.length + ' zoom=' + (zoomed ? 'fit' : 'none') + ' xray=' + (A.xrayOn ? 'on' : 'off'));
        _updateSelCost(focusSet, tag + ':' + label);   // BIM→Project TASK A: indicative 5D cost on the bar
      });
    }
    // Build the (focusSet, opts) pair for _drillSelect from a recorded view object (timeline replay).
    function _viewToDrill(v) {
      var focus = (v.focusGuids && v.focusGuids.length) ? new Set(v.focusGuids)
        : (v.litGuids && v.litGuids.length) ? new Set(v.litGuids)
        : (v.groupGuids && v.groupGuids.length) ? new Set(v.groupGuids) : null;
      var isItem = (v.isItem != null) ? v.isItem : !!(v.litGuids && v.litGuids.length);
      var parent = (v.parentGuids && v.parentGuids.length) ? new Set(v.parentGuids)
        : (!v.focusGuids && v.groupGuids && v.groupGuids.length) ? new Set(v.groupGuids) : null; // legacy
      var grand = (v.grandGuids && v.grandGuids.length) ? new Set(v.grandGuids) : null;
      return { focus: focus, opts: { isItem: isItem, parentSet: parent, grandSet: grand } };
    }
    function _phaseGuids(name) {
      return (_phaseCache && _phaseCache.byPhase[name]) ? _phaseCache.byPhase[name].guids : null;
    }
    function _phaseSelect(name) {
      var pc = _phaseCache;
      if (!pc || !pc.byPhase[name]) return;
      _drillSelect(pc.byPhase[name].guids, name, 'PHASE_SELECT', { isItem: false }); // top-level group: phase solid, building 0.2
    }
    // task = nested group in phase → task solid, phase 0.2, building hidden.
    function _taskSelect(set, label, phaseName) { _drillSelect(set, label, 'TASK_SELECT', { isItem: false, parentSet: _phaseGuids(phaseName) }); }
    // element = final item in phase → element solid+shine, phase solid (parent), building 0.2 (grandparent).
    function _elementSelect(guid, phaseName) { _drillSelect(new Set([guid]), _elLabel(guid), 'ELEM_SELECT', { isItem: true, parentSet: _phaseGuids(phaseName) }); }
    // §RP-SHAPE: storey/disc Type-leaf tap → light that type's real shapes (cyan), keep the
    // whole storey/disc solid, rest at 0.2. (col is a fixed identifier: 'storey' | 'discipline'.)
    function _typeShapeDrill(col, val, ifc, label) {
      var iset = new Set(), gset = new Set();
      try {
        A.dbQuery("SELECT guid FROM elements_meta WHERE " + col + " = ? AND ifc_class = ?", [val, ifc])
          .forEach(function(r) { iset.add(r[0]); });
        A.dbQuery("SELECT guid FROM elements_meta WHERE " + col + " = ?", [val])
          .forEach(function(r) { gset.add(r[0]); });
      } catch (e) { console.warn('[RP-TB] §TYPE_DRILL_ERR', e.message); }
      // Type = nested group within a storey/disc → type solid, storey/disc 0.2 (parent), building hidden.
      _drillSelect(iset, label, 'TYPE_SELECT', { isItem: false, parentSet: gset });
    }

    // §DEPTH storey/disc axis (find-lens-local, decision B): route the multi-select union through
    // the uniform group depth — selected storeys/discs = 1.0 SOLID + fit-zoom, REST = 0.1 ghost
    // (was A.filterStorey/Diss which HID the rest). Empty selection restores the full scene. The
    // SHARED A.filterStorey/filterDisc (the storey side-panel's isolate) are deliberately untouched.
    function _axisGroupSelect(mode, labels) {
      if (!labels || !labels.length) {
        if (A.filterStorey) A.filterStorey(null);
        if (A.filterDisc) A.filterDisc(null);
        _highlightLensReset();
        console.log('[RP-TB] §AXIS_GROUP_CLEAR mode=' + mode);
        return;
      }
      var col = (mode === 'storey') ? 'storey' : 'discipline';
      var set = new Set();
      try {
        var ph = labels.map(function() { return '?'; }).join(',');
        // `labels` are always raw codes (data-find-parent values) — the query never sees the friendly word.
        A.dbQuery("SELECT guid FROM elements_meta WHERE " + col + " IN (" + ph + ")", labels)
          .forEach(function(r) { set.add(r[0]); });
      } catch (e) { console.warn('[RP-TB] §AXIS_GROUP_ERR', e.message); }
      // top-level group: storey/disc solid, building 0.2. Display-only friendly relabel for disc.
      var _dispLabels = (mode === 'disc') ? labels.map(friendlyDisc) : labels;
      _drillSelect(set, _dispLabels.join(', '), (mode === 'storey' ? 'STOREY' : 'DISC') + '_SELECT', { isItem: false });
    }

    // §RP-SHAPE L4: storey/disc → type → INDIVIDUAL ITEM. Lazy children for a Type leaf.
    // Tap an item → light just that item's real shape (cyan), keep the WHOLE TYPE solid, rest 0.2.
    // (The user's literal "Level1 > Fixture > item" spec.) Mirrors Phase → task → element.
    function _typeItemChildren(container, col, val, ifc) {
      var guids = [];
      try {
        A.dbQuery("SELECT guid FROM elements_meta WHERE " + col + " = ? AND ifc_class = ?", [val, ifc])
          .forEach(function(r) { guids.push(r[0]); });
      } catch (e) { console.warn('[RP-TB] §TYPE_ITEMS_ERR', e.message); }
      var typeSet = new Set(guids);   // whole type = the item's PARENT (solid)
      // grandparent = the whole storey/disc → rendered 0.2; building beyond = hidden.
      var storeySet = new Set();
      try { A.dbQuery("SELECT guid FROM elements_meta WHERE " + col + " = ?", [val]).forEach(function(r) { storeySet.add(r[0]); }); } catch (e) {}
      var capped = guids.length > _PHASE_ELEM_CAP;
      guids.slice(0, _PHASE_ELEM_CAP).forEach(function(g) {
        container.appendChild(_treeNode(_elLabel(g), '', 2, {
          // §DEPTH item: item solid+shine · type=parent solid · storey=grandparent 0.2 · building hidden
          onTap: function() { _drillSelect(new Set([g]), _elLabel(g), 'ITEM_SELECT', { isItem: true, parentSet: typeSet, grandSet: storeySet }); }
        }));
      });
      if (capped) {
        var more = document.createElement('div');
        more.style.cssText = 'padding:4px 34px;font-size:10px;color:#888';
        more.textContent = '… ' + (guids.length - _PHASE_ELEM_CAP) + ' more (list capped at ' + _PHASE_ELEM_CAP + ')';
        container.appendChild(more);
      }
      console.log('[RP-TB] §TYPE_ITEMS ' + col + '="' + val + '" ifc=' + ifc + ' items=' + guids.length +
        (capped ? ' shown=' + _PHASE_ELEM_CAP + ' CAPPED' : ''));
    }

    // Lazy children for a phase node: Phase → task → element when task_elements is populated,
    // else Phase → element directly (kernel-only timelines, e.g. tasks table empty). Never hide.
    function _buildPhaseChildren(container, phaseName, hasTasks) {
      var b = _phaseCache && _phaseCache.byPhase[phaseName];
      if (!b) return;
      var guids = Array.from(b.guids);
      if (hasTasks) {
        var tmap = {}, tnames = {};
        try { A.dbQuery("SELECT guid, task_id FROM task_elements").forEach(function(r) { tmap[r[0]] = r[1]; }); } catch(e) {}
        try { A.dbQuery("SELECT task_id, name FROM tasks").forEach(function(r) { tnames[r[0]] = r[1]; }); } catch(e) {}
        var byTask = {}, taskOrder = [];
        guids.forEach(function(g) {
          var tid = tmap[g];
          var tk = (tid != null) ? (tnames[tid] || ('Task ' + tid)) : '(no task)';
          if (!byTask[tk]) { byTask[tk] = []; taskOrder.push(tk); }
          byTask[tk].push(g);
        });
        taskOrder.forEach(function(tk) {
          var tg = byTask[tk];
          var elKids = tg.slice(0, _PHASE_ELEM_CAP).map(function(g) {
            return _treeNode(_elLabel(g), '', 2, { onTap: function() { _elementSelect(g, phaseName); } });
          });
          container.appendChild(_treeNode(tk, tg.length, 1,
            { children: elKids, onTap: function() { _taskSelect(new Set(tg), tk, phaseName); } }));
        });
        console.log('[RP-TB] §PHASE_CHILDREN phase="' + phaseName + '" tasks=' + taskOrder.length + ' elems=' + guids.length);
        return;
      }
      var capped = guids.length > _PHASE_ELEM_CAP;
      guids.slice(0, _PHASE_ELEM_CAP).forEach(function(g) {
        container.appendChild(_treeNode(_elLabel(g), '', 1, { onTap: function() { _elementSelect(g, phaseName); } }));
      });
      if (capped) {
        var more = document.createElement('div');
        more.style.cssText = 'padding:4px 22px;font-size:10px;color:#888';
        more.textContent = '… ' + (guids.length - _PHASE_ELEM_CAP) + ' more (list capped at ' + _PHASE_ELEM_CAP + ')';
        container.appendChild(more);
      }
      console.log('[RP-TB] §PHASE_CHILDREN phase="' + phaseName + '" elems=' + guids.length +
        (capped ? ' shown=' + _PHASE_ELEM_CAP + ' CAPPED' : ''));
    }

    function _renderPhaseList(pc, status) {
      elTree.innerHTML = '';
      var hasTasks = false;
      try { var tc = A.dbQuery("SELECT COUNT(*) FROM task_elements"); hasTasks = !!(tc.length && tc[0][0] > 0); } catch(e) {}
      pc.order.forEach(function(name) {
        var b = pc.byPhase[name];
        // Phase parent: label tap = darken+highlight+zoom the whole phase; arrow = drill open.
        elTree.appendChild(_treeNode(name, b.count, 0, {
          children: true,
          onTap: function() { _phaseSelect(name); },
          onExpand: function(container) {
            if (container._loaded) return;
            container._loaded = true;
            _buildPhaseChildren(container, name, hasTasks);
          }
        }));
      });
      console.log('[RP-TB] §PHASE_LENS gen=real source=kernel_ops phases=' + pc.order.length +
        ' tasks=' + (hasTasks ? 'yes' : 'none(kernel-only)') + ' status=' + status);
    }

    // ── §RevitParity A1: Isolate the current drill — hide everything except the matched set ──
    // opts (optional) overrides the drill scope: {type, storey, disc, name}.
    function _isolateGuidSet(opts) {
      opts = opts || {};
      var set = new Set();
      if (!A.db) return set;
      var bld = A.activeBuilding || '';
      var type = 'type' in opts ? opts.type : elType.value;
      var storey = 'storey' in opts ? opts.storey : elStorey.value;
      var disc = opts.disc || '';
      var name = 'name' in opts ? opts.name : elName.value.trim();
      var sql = 'SELECT m.guid FROM elements_meta m WHERE 1=1';
      var params = [];
      if (bld) { sql += ' AND m.building = ?'; params.push(bld); }
      if (type) { sql += ' AND m.ifc_class = ?'; params.push(type); }
      if (storey) { sql += ' AND m.storey = ?'; params.push(storey); }
      if (disc) { sql += ' AND m.discipline = ?'; params.push(disc); }
      if (name) { sql += ' AND (LOWER(m.element_name) LIKE LOWER(?) OR LOWER(m.ifc_class) LIKE LOWER(?))'; params.push('%' + name + '%', '%' + name + '%'); }
      try {
        var rows = A.db.exec(sql, params);
        if (rows.length) rows[0].values.forEach(function(r) { set.add(r[0]); });
      } catch(e) { console.warn('[RP-A1] §FILTER_ISOLATE_ERR', e.message); }
      return set;
    }

    // Hand the isolate set to the viewer + emit the W-FILTER-ISOLATE witness.
    function _emitIsolate(set, by) {
      A.filterByGuids(set);
      // §ISOLATE_ZOOM (FIND_PANEL_ISOLATE_NO_CAMERA_ZOOM.md): isolate-tap only used to filter
      // visibility, never reframed the camera — reuse the SAME group-fit primitive _drillSelect/
      // focusElement already call, so an isolate on an off-screen target actually flies to it.
      var zoomed = _zoomToGroup(set);
      var bld = A.activeBuilding || '';
      var total = 0;
      try {
        var tr = A.db.exec('SELECT COUNT(*) FROM elements_meta' + (bld ? ' WHERE building = ?' : ''), bld ? [bld] : []);
        if (tr.length) total = tr[0].values[0][0];
      } catch(e) { /* total stays 0 */ }
      console.log('[RP-A1] §FILTER visible=' + set.size + ' hidden=' + Math.max(0, total - set.size) +
        ' total=' + total + ' by=' + by + ' zoom=' + (zoomed ? 'fit' : 'none'));
    }

    function applyIsolate() {
      if (!A.db || !A.filterByGuids) return;
      if (A.filterStorey) A.filterStorey(null);
      if (A.filterDisc) A.filterDisc(null);
      var set = _isolateGuidSet();
      if (!set.size) { console.log('[RP-A1] §FILTER_ISOLATE_EMPTY'); return; }
      _emitIsolate(set, '{type:"' + elType.value + '",storey:"' + elStorey.value + '",name:"' + elName.value.trim() + '"}');
      updateIsolateBar();
    }

    // §RevitParity W-LEAF-ISOLATE: a Type leaf tap (1) refreshes the items list to that
    // drill AND (2) isolates the 3D to the exact branch (storey+type or disc+type).
    function isolateLeaf(opts, by) {
      if (!A.db || !A.filterByGuids) return;
      elStorey.value = ('storey' in opts) ? (opts.storey || '') : '';
      elType.value = opts.type || '';
      runSearch();
      if (A.filterStorey) A.filterStorey(null);
      if (A.filterDisc) A.filterDisc(null);
      var set = _isolateGuidSet(opts);
      if (!set.size) { console.log('[RP-A1] §FILTER_ISOLATE_EMPTY by=' + by); return; }
      _emitIsolate(set, by);
      if (elIsoBar) {
        elIsoBar.style.display = 'flex';
        if (elIsoBtn) elIsoBtn.style.display = 'none';
        if (elShowAllBtn) elShowAllBtn.style.display = '';
      }
    }

    function clearIsolate() {
      if (A.filterByGuids) A.filterByGuids(null);
      if (_roomBoxes.length || _roomXrayWasOff) _roomLensReset();
      // §XRAY_UNDISTURB: reset whenever x-ray is on — not just when WE turned it on — so a lens exit
      // restores the user's manual Alt+Z x-ray to its normal 0.3 (was: left at the depth 0.1/0).
      if (_hlXrayWasOff || A.xrayOn || (A._outlinePass && A._outlinePass.enabled)) _highlightLensReset();
      if (elIsoBar) elIsoBar.style.display = 'none';
      updateIsolateBar();
      console.log('[RP-A1] §FILTER_RESET');
    }

    function updateIsolateBar() {
      if (!elIsoBar) return;
      var hasFilter = !!(elType.value || elStorey.value || elName.value.trim());
      var hasResults = nav.results.length > 0;
      console.log('[RP-A1] §FILTER_BAR hasFilter=' + hasFilter + ' hasResults=' + hasResults +
        ' type="' + elType.value + '" storey="' + elStorey.value + '" name="' + elName.value.trim() + '" n=' + nav.results.length);
      if (hasFilter && hasResults) {
        elIsoBar.style.display = 'flex';
        var isolating = !!A.activeGuidFilter;
        if (elIsoBtn) elIsoBtn.style.display = isolating ? 'none' : '';
        if (elShowAllBtn) elShowAllBtn.style.display = isolating ? '' : 'none';
      } else {
        elIsoBar.style.display = 'none';
      }
    }
    if (elIsoBtn) elIsoBtn.addEventListener('pointerup', function(e) { e.stopPropagation(); applyIsolate(); });
    if (elShowAllBtn) elShowAllBtn.addEventListener('pointerup', function(e) { e.stopPropagation(); clearIsolate(); });

    function _treeNode(label, count, level, opts) {
      opts = opts || {};
      // §DISC_LABELS display-only relabel: `value` is the underlying identity used for
      // multi-select/query/data-find-parent (defaults to `label` — unchanged for every other
      // axis). Disc mode passes opts.value = the raw code while `label` carries the friendly word.
      var value = (opts.value !== undefined && opts.value !== null) ? opts.value : label;
      var row = document.createElement('div');
      row.className = 'find-tree-row'; // §FOCUS: tag every row (any depth) so the last-clicked gets the band
      var isParent = level === 0;
      row.style.cssText = 'padding:' + (isParent ? '7px 10px' : '4px 10px 4px ' + (22 + level * 12) + 'px') +
        ';cursor:pointer;font-size:' + (isParent ? '12px' : '11px') +
        ';color:' + (isParent ? '#ddd' : '#aaa') +
        ';font-weight:' + (isParent ? '600' : '400') +
        ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:6px' +
        (isParent ? ';border-bottom:1px solid rgba(255,255,255,0.06)' +
          ';background:linear-gradient(180deg,rgba(255,255,255,0.06) 0%,rgba(255,255,255,0.02) 100%)' +
          ';border-left:3px solid rgba(79,195,247,0.3)' : '');
      var arrow = document.createElement('span');
      // §EXPAND-HITZONE (user): the expand "+" was a 12px glyph — the only expand affordance on
      // storey/disc parent rows (label-tap there = select). Make the arrow a BIG tap target: a wider
      // column + full row height (align-self:stretch + flex-center keeps the glyph put). Rows WITH
      // children additionally reclaim the left gutter into the tap zone (below) so it extends to the
      // LEFT of the "+". flex-center keeps the glyph visually where it was.
      arrow.style.cssText = 'font-size:' + (isParent ? '10px' : '8px') + ';opacity:0.5;width:16px;' +
        'text-align:center;flex-shrink:0;align-self:stretch;display:flex;align-items:center;justify-content:center';
      arrow.textContent = opts.children ? '\u25B8' : '';
      var text = document.createElement('span');
      text.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis';
      text.textContent = label;
      var badge = document.createElement('span');
      badge.style.cssText = 'font-size:' + (isParent ? '10px' : '9px') + ';color:' + (isParent ? '#4fc3f7' : '#666') + ';flex-shrink:0;font-weight:400';
      badge.textContent = '(' + count + ')';
      row.appendChild(arrow);
      row.appendChild(text);
      row.appendChild(badge);
      // §NAV_FIND_002: tag parent rows so multi-select range/highlight can read DOM order.
      // Tag with `value` (raw code for disc, same as label elsewhere) — this is what
      // _selDiscs/_axisGroupSelect/the SQL query actually key on, never the friendly text.
      if (isParent) row.setAttribute('data-find-parent', value);

      // Hover
      row.addEventListener('pointerenter', function() {
        if (!row.getAttribute('data-active')) {
          row.style.background = isParent ? 'linear-gradient(180deg,rgba(79,195,247,0.12) 0%,rgba(79,195,247,0.04) 100%)' : 'rgba(79,195,247,0.08)';
          if (isParent) row.style.borderLeftColor = 'rgba(79,195,247,0.7)';
        }
      });
      row.addEventListener('pointerleave', function() {
        if (!row.getAttribute('data-active')) {
          row.style.background = isParent ? 'linear-gradient(180deg,rgba(255,255,255,0.06) 0%,rgba(255,255,255,0.02) 100%)' : '';
          if (isParent) row.style.borderLeftColor = 'rgba(79,195,247,0.3)';
        }
      });

      // Expand/collapse children — lazy-loaded on first expand
      var childContainer = null;
      var expanded = false;
      if (opts.children) {
        childContainer = document.createElement('div');
        childContainer.style.display = 'none';
        // If children is an array (pre-built), append them
        if (Array.isArray(opts.children)) {
          opts.children.forEach(function(c) { childContainer.appendChild(c); });
        }
        // Otherwise children===true means lazy — onExpand fills the container
      }

      // §S280b: Arrow = expand/collapse only. Label = sticky 3D filter. No toggle-off.
      // Close panel = restore full scene.
      if (childContainer) {
        arrow.style.cursor = 'pointer';
        // §EXPAND-HITZONE: extend the tap area to the LEFT of the "+" by eating the row's left gutter
        // (negative margin pulls the box left to the row edge; equal padding pushes the glyph back so
        // it stays put visually). Now the whole left strip + the wider taller arrow toggles expand.
        var _leftPad = isParent ? 10 : (22 + level * 12);
        arrow.style.marginLeft = '-' + _leftPad + 'px';
        arrow.style.paddingLeft = _leftPad + 'px';
        arrow.title = 'Expand';
        arrow.addEventListener('pointerup', function(e) {
          e.stopPropagation();
          expanded = !expanded;
          if (expanded && opts.onExpand) opts.onExpand(childContainer);
          childContainer.style.display = expanded ? 'block' : 'none';
          arrow.textContent = expanded ? '\u25BE' : '\u25B8';
          // Arrow never touches 3D — neutral action
        });
      }
      // §NAV_FIND_002: parent rows = multi-select layer (storey/disc).
      // Plain=replace, Ctrl/Cmd=toggle, Shift=range. Children → opts.onTap.
      function _doTap(e) {
        e.stopPropagation();
        console.log('[RP-TA] §TAP_FIRE "' + label + '" pType=' + (e.pointerType || '?')); // §TAP-RESPONSE witness: 1 log per genuine tap
        if (isParent && opts.multiSelect) {
          var sel = (_treeMode === 'storey') ? _selStoreys : _selDiscs;
          var ctrl = e.ctrlKey || e.metaKey;
          var shift = e.shiftKey;
          var mod = shift ? 'shift' : (ctrl ? 'ctrl' : 'plain');
          // §DISC_LABELS: identity/selection keys off `value` (raw code), never the friendly `label`.
          if (shift && _anchor !== null) {
            var labels = _orderedParentLabels();
            var ai = labels.indexOf(_anchor), bi = labels.indexOf(value);
            if (ai >= 0 && bi >= 0) {
              sel.clear();
              for (var k = Math.min(ai, bi); k <= Math.max(ai, bi); k++) sel.add(labels[k]);
            } else { sel.clear(); sel.add(value); _anchor = value; }
          } else if (ctrl) {
            if (sel.has(value)) sel.delete(value); else sel.add(value);
            _anchor = value;
          } else {
            sel.clear(); sel.add(value); _anchor = value;
          }
          _applyParentHighlight();
          var arr = Array.from(sel);
          _axisGroupSelect(_treeMode, arr); // §DEPTH: ghost rest 0.1 + selected solid (was filterStorey hide)
          console.log('§FIND_MULTISEL mode=' + _treeMode + ' sel=[' + arr.join(',') + '] n=' + arr.length + ' mod=' + mod);
          // BIM→Project TASK A/C: a storey/disc selection IS a WBS level to price & push, so reveal the
          // #find-selected bar (cost span + > ERP) for GROUP scopes too — previously it only showed on a
          // single result-item click (line ~3027), so a group's cost + push button were never visible.
          var _elSelText = document.getElementById('find-selected-text');
          if (arr.length) {
            // Display friendly words for disc mode; storey codes are already human (e.g. "Level 1").
            var _dispArr = (_treeMode === 'disc') ? arr.map(friendlyDisc) : arr;
            if (_elSelText) _elSelText.textContent = _dispArr.join(', ') + ' · ' + arr.length + ' ' + _treeMode + (arr.length > 1 ? 's' : '');
            elSelected.style.display = 'flex';
          } else {
            elSelected.style.display = 'none';
          }
          return;
        }
        if (opts.onTap) { opts.onTap(); return; }
        // §FIX-ROOMSTUCK: a group row with children but no onTap/multiSelect (the Room lens
        // Storey/Type groups) must expand on LABEL tap too. Previously only the 12px arrow
        // toggled it, so tapping the room-group row did nothing — the Room lens "got stuck".
        // Route the label tap to the arrow's existing expand handler.
        if (childContainer && arrow) {
          arrow.dispatchEvent(new PointerEvent('pointerup', { bubbles: false }));
          console.log('[RP-TA] §GROUP_EXPAND_VIA_LABEL "' + label + '"');
        }
      }
      text.addEventListener('pointerup', _doTap);
      badge.addEventListener('pointerup', _doTap);

      var frag = document.createDocumentFragment();
      frag.appendChild(row);
      if (childContainer) frag.appendChild(childContainer);
      return frag;
    }

    // §S280: Storey mode — parent nodes instant, children lazy-load on expand
    function _buildStoreyTree(bld, filter) {
      var storeySql = 'SELECT storey, COUNT(*) as cnt FROM elements_meta' +
        ' WHERE storey IS NOT NULL' + (bld ? ' AND building = ?' : '') +
        ' GROUP BY storey ORDER BY storey';
      var storeys = A.db.exec(storeySql, bld ? [bld] : []);
      if (!storeys.length) return;

      storeys[0].values.forEach(function(sr) {
        var storey = sr[0];
        var storeyCnt = sr[1];
        if (!storey) return;
        if (filter && storey.toLowerCase().indexOf(filter) < 0) return;

        var node = _treeNode(storey, storeyCnt, 0, {
          children: true, // signal: has children, loaded lazily
          multiSelect: true, // §NAV_FIND_002: _doTap manages selection + filter
          onExpand: function(container) {
            if (container._loaded) return;
            container._loaded = true;
            // Lazy: spaces/rooms (large→small), fallback to types
            var spaceSql = 'SELECT element_name, COUNT(*) as cnt FROM elements_meta' +
              ' WHERE storey = ? AND ifc_class IN (\'IfcSpace\',\'IfcRoom\',\'IfcZone\')' +
              (bld ? ' AND building = ?' : '') +
              ' GROUP BY element_name ORDER BY cnt DESC';
            var spaces = A.db.exec(spaceSql, bld ? [storey, bld] : [storey]);
            if (spaces.length && spaces[0].values.length) {
              spaces[0].values.forEach(function(sp) {
                container.appendChild(_treeNode(sp[0] || '(unnamed)', sp[1], 1, {
                  onTap: function() { elStorey.value = storey; elName.value = sp[0] || ''; runSearch(); }
                }));
              });
            } else {
              var typeSql = 'SELECT ifc_class, COUNT(*) as cnt FROM elements_meta' +
                ' WHERE storey = ?' + (bld ? ' AND building = ?' : '') +
                ' GROUP BY ifc_class ORDER BY cnt DESC LIMIT 10';
              var types = A.db.exec(typeSql, bld ? [storey, bld] : [storey]);
              if (types.length) {
                types[0].values.forEach(function(tp) {
                  var ifc = tp[0];
                  container.appendChild(_treeNode(friendlyClass(ifc), tp[1], 1, {
                    children: true, // §RP-SHAPE L4: arrow expands → individual items
                    // §RP-SHAPE: tap a Type leaf → light that type's shapes, storey solid, rest 0.2
                    onTap: function() { _typeShapeDrill('storey', storey, ifc, friendlyClass(ifc) + ' @ ' + storey); },
                    onExpand: function(c) { if (c._loaded) return; c._loaded = true; _typeItemChildren(c, 'storey', storey, ifc); }
                  }));
                });
              }
            }
            console.log('§FIND_TREE_LAZY storey=' + storey + ' children=' + container.childElementCount);
          }
        });
        elTree.appendChild(node);
      });
      console.log('§FIND_TREE mode=storey storeys=' + storeys[0].values.length);
    }

    // §S280: Disc mode — parent nodes instant, children lazy-load on expand
    function _buildDiscTree(bld, filter) {
      var discSql = 'SELECT discipline, COUNT(*) as cnt FROM elements_meta' +
        ' WHERE discipline IS NOT NULL' + (bld ? ' AND building = ?' : '') +
        ' GROUP BY discipline ORDER BY cnt DESC';
      var discs = A.db.exec(discSql, bld ? [bld] : []);
      if (!discs.length) return;

      discs[0].values.forEach(function(dr) {
        var disc = dr[0];
        var discCnt = dr[1];
        if (!disc) return;
        if (filter && disc.toLowerCase().indexOf(filter) < 0) return;

        // §DISC_LABELS: render the friendly word, but `value: disc` keeps the raw code as the
        // multi-select/query identity (data-find-parent, _selDiscs, A.filterDisc — unchanged).
        var node = _treeNode(friendlyDisc(disc), discCnt, 0, {
          value: disc,
          children: true,
          multiSelect: true, // §NAV_FIND_002: _doTap manages selection + filter
          onExpand: function(container) {
            if (container._loaded) return;
            container._loaded = true;
            var typeSql = 'SELECT ifc_class, COUNT(*) as cnt FROM elements_meta' +
              ' WHERE discipline = ?' + (bld ? ' AND building = ?' : '') +
              ' GROUP BY ifc_class ORDER BY cnt DESC';
            var types = A.db.exec(typeSql, bld ? [disc, bld] : [disc]);
            if (types.length) {
              types[0].values.forEach(function(tp) {
                var ifc = tp[0];
                container.appendChild(_treeNode(friendlyClass(ifc), tp[1], 1, {
                  children: true, // §RP-SHAPE L4: arrow expands → individual items
                  // §RP-SHAPE: tap a Type leaf → light that type's shapes, discipline solid, rest 0.2
                  onTap: function() { _typeShapeDrill('discipline', disc, ifc, friendlyClass(ifc) + ' @ ' + friendlyDisc(disc)); },
                  onExpand: function(c) { if (c._loaded) return; c._loaded = true; _typeItemChildren(c, 'discipline', disc, ifc); }
                }));
              });
            }
            console.log('§FIND_TREE_LAZY disc=' + disc + ' children=' + container.childElementCount);
          }
        });
        elTree.appendChild(node);
      });
      console.log('§FIND_TREE mode=disc discs=' + discs[0].values.length);
    }

    // Tap selected text → re-expand results list
    var elSelText = document.getElementById('find-selected-text');
    if (elSelText) elSelText.addEventListener('pointerup', function(e) {
      e.stopPropagation();
      panel.classList.add('results-expanded');
      elSelected.style.display = 'none';
      [elStoreyRow, elTypeRow].forEach(function(r) { r.classList.remove('expanded'); });
    });

    // ── S265 Phase 5: Voice mic inside Find panel ──
    var _SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var _recognition = null, _listening = false;
    if (_SR && elMicBtn) {
      elMicBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (_listening) { _recognition.stop(); return; }
        _recognition = new _SR();
        _recognition.continuous = false;
        _recognition.interimResults = true;
        _recognition.lang = 'en-US';
        _recognition.onstart = function() {
          _listening = true;
          elMicBtn.classList.add('listening');
          console.log('§FIND_VOICE_START');
        };
        _recognition.onresult = function(ev) {
          for (var i = ev.resultIndex; i < ev.results.length; i++) {
            var t = ev.results[i][0].transcript;
            if (ev.results[i].isFinal) {
              elName.value = t;
              elName.style.fontStyle = 'normal';
              A.inputWasVoice = true;
              _handleInput(t, true);
              console.log('§FIND_VOICE_FINAL "' + t + '"');
            } else {
              elName.value = t;
              elName.style.fontStyle = 'italic';
            }
          }
        };
        _recognition.onerror = function(ev) { console.log('§FIND_VOICE_ERR ' + ev.error); };
        _recognition.onend = function() {
          _listening = false;
          elMicBtn.classList.remove('listening');
          elName.style.fontStyle = 'normal';
        };
        _recognition.start();
      });
    } else if (elMicBtn) {
      elMicBtn.style.opacity = '0.4';
      elMicBtn.style.cursor = 'default';
      elMicBtn.title = 'Voice not supported';
    }
    // S275: Mic icon bright blue to match navigate button
    if (elMicBtn) elMicBtn.style.color = '#4fc3f7';

    // ── S265 Phase 5: Dual-purpose input — NLP queries vs element search ──
    // NLP only fires on Enter or chip click (explicit=true), never on live typing.
    var _nlpRe = /^(count|how many|number of|total|cost|show|list|what|find|search)\b/i;
    function _handleInput(text, explicit) {
      var trimmed = (text || '').trim();
      if (!trimmed) { elResults.innerHTML = ''; elCount.textContent = ''; return; }
      // NLP query detection
      if (_nlpRe.test(trimmed) && A._nlpExecute) {
        if (explicit) {
          A._nlpExecute(trimmed);
          return;
        }
        // Live typing of NLP phrase → show hint, don't run element search
        elResults.innerHTML = '<div style="color:#4fc3f7;font-size:11px;padding:8px 10px;opacity:0.7">Press Enter \u21B5</div>';
        elCount.textContent = '';
        return;
      }
      // Regular element search
      populateDropdowns();
      buildTree();
      runSearch();
    }

    // §S281: Three diverse hint chips — NLP examples only, no DB query
    function buildChips() {
      if (!elChips) return;
      elChips.innerHTML = '';
      try {
        ['count doors', 'total cost', 'show structure'].forEach(function(ex) {
          var chip = document.createElement('button');
          chip.textContent = ex;
          chip.addEventListener('pointerup', function(e) {
            e.stopPropagation();
            elName.value = ex;
            _handleInput(ex, true);
          });
          elChips.appendChild(chip);
        });
      } catch (e) { /* ignore */ }
    }

    // ── Open find panel (called from pill, nlp.js, or directly) ──
    A.openFindPanel = function(searchTerm) {
      // S275: Toggle — if already open with no search term, close it
      if (!searchTerm && panel.style.display === 'block') {
        closeFindPanel();
        return;
      }
      nav.voiceMode = !!A.inputWasVoice;
      // Exit walk mode from previous navigation — ensures next Navigate starts from main entrance
      if (A.walkModeActive) {
        if (nav.active) { if (A.stopNavigation) A.stopNavigation(); }
        A.walkModeActive = false;
        if (A.controls) A.controls.enabled = true;
        if (A.camera) A.camera.rotation.reorder('XYZ');
        var walkBtn = document.getElementById('walk-mode-btn');
        if (walkBtn) walkBtn.classList.remove('active');
        console.log('[S233] §FIND_OPEN_RESET_WALK exited walk mode for fresh search');
      }
      // Full reset — clear previous search state
      nav.results = [];
      nav.activeIdx = -1;
      nav.gridCache = {}; // clear stale grid caches
      if (A.clearRouteCache) A.clearRouteCache(); // clear route templates too
      elType.value = '';
      elStorey.value = '';
      elResults.innerHTML = '';
      elCount.textContent = '';
      elSelected.style.display = 'none';
      panel.classList.remove('results-expanded');
      [elStoreyRow, elTypeRow].forEach(function(r) { r.classList.remove('expanded'); });
      clearHighlight();
      // §RevitParity A1/Task A/B: fresh open clears any prior isolate + lens overlays
      if (A.filterByGuids) A.filterByGuids(null);
      _roomLensReset();
      _highlightLensReset();
      if (elIsoBar) elIsoBar.style.display = 'none';
      _phaseCache = null; // fresh timeline per open (building may have changed)
      _probeCacheResult = null; // §PROBE-DEDUP: fresh probe per open too, same reasoning
      _roomVolCache = null; _roomVolCacheBld = null; // §ROOM-VOL-CACHE: same reasoning
      _elMetaMap = null;  // §D drill: re-cache element labels for the (possibly new) building
      // Set search term and open
      panel.style.display = 'block';
      elName.value = searchTerm || '';
      // §S281: Defer item queries — only build tree (fast GROUP BY) on open.
      _renderAxes(); // §RULE1: single axis toggle (cycles storey→disc→room→material→phase)
      // §RULE1: with one toggle, the CURRENT axis tree is shown immediately (no hide-until-tap).
      if (elTree) { elTree.style.display = ''; _treeRevealed = true; if (elTreeGrip) elTreeGrip.style.display = 'flex'; }
      buildTree();
      buildChips();
      if (searchTerm) { _handleInput(searchTerm, true); }
      // S275: Auto-focus — panel system + input
      if (typeof window._focusPanel === 'function') window._focusPanel('find');
      // §S280: Mobile — don't steal focus (triggers virtual keyboard). User taps searchbox when ready.
      if (!window._isMobile) elName.focus();
      // §VIEWLOG: fresh view-history per open (building may have changed); show the bar.
      _vhClear();
      _vhRender();
      console.log('[S233] §NAV_FIND_OPEN term="' + (searchTerm || '') + '" voice=' + nav.voiceMode);
    };

    function closeFindPanel() {
      panel.style.display = 'none';
      if (nav.active) { if (A.stopNavigation) A.stopNavigation(); }
      clearHighlight();
      // §NAV_FIND_002: exit KEEPS the storey/disc + guid filter applied. Only the
      // axis pills restore full scene. (was: filterStorey/Disc(null))
      // §RP Task A/B: but lens OVERLAYS (room boxes, lens x-ray, outline) are visual
      // cruft — always tear them down on close so nothing lingers invisibly.
      _roomLensReset();
      _highlightLensReset();
      // §PICK-BBOX-LEAK (user): the picking.js-owned bbox (window._pickHighlight, a LineSegments
      // EdgesGeometry) is a SHARED global cleared only when a NEW pick happens — clearHighlight()
      // above disposes it ONLY when it === the Find-local _highlight (and early-returns when that's
      // null). So a bbox from a 3D tap / info-panel re-highlight survives Find discard (scene + GPU
      // leak). Own it here unconditionally: remove from scene + dispose its geometry. (Material is
      // the shared A._bboxMaterial singleton — never dispose that.)
      if (window._pickHighlight) {
        if (window._pickHighlight.parent) window._pickHighlight.parent.remove(window._pickHighlight);
        if (window._pickHighlight.geometry) window._pickHighlight.geometry.dispose();
        window._pickHighlight = null;
        if (A.markDirty) A.markDirty();
      }
      if (elIsoBar) elIsoBar.style.display = 'none';
      // §S280d: Reset tree visibility for next open
      _treeRevealed = false;
      if (elTree) elTree.style.display = 'none';
      // S275: Release panel focus so other panels (Clash, etc.) work
      if (typeof window._blurPanel === 'function') window._blurPanel();
      var _kept = Array.from(_treeMode === 'storey' ? _selStoreys : _selDiscs);
      // §VIEWLOG: tear down the view-history with the panel (sibling layer, read-only).
      _vhClear();
      _vhRender();
      console.log('[S233] §FIND_CLOSE restored=none kept=[' + _kept.join(',') + ']');
    }
    A.closeFindPanel = closeFindPanel; // exposed for nlp.js bar close
    elClose.onclick = closeFindPanel;
    // §S275 (user): tap OUTSIDE the Find panel must NOT close it — only Esc or the × button do.
    // The outside-tap-to-close handler was removed; the panel stays put while you click the model.

    // ── Populate dropdowns — show all types/storeys, with match counts when searching ──
    // §S280: Two-phase dropdowns — storeys appear instantly, types load in background
    var _typesTimer = 0;

    function populateDropdowns() {
      if (!A.db) return;
      var bld = A.activeBuilding || '';
      var name = elName.value.trim();
      var savedType = elType.value;
      var savedStorey = elStorey.value;
      try {
        // ── Phase 1 (sync): Storeys — fast query, no JOIN ──
        var matchByStorey = {};
        if (name) {
          var msSql = 'SELECT storey, COUNT(*) as cnt FROM elements_meta WHERE storey IS NOT NULL' +
            ' AND (LOWER(element_name) LIKE LOWER(?) OR LOWER(ifc_class) LIKE LOWER(?))' +
            (bld ? ' AND building = ?' : '') + ' GROUP BY storey';
          var msParams = ['%' + name + '%', '%' + name + '%'];
          if (bld) msParams.push(bld);
          var msRows = A.db.exec(msSql, msParams);
          if (msRows.length > 0) msRows[0].values.forEach(function(r) { matchByStorey[r[0]] = r[1]; });
        }

        // Storeys — simple GROUP BY, no JOIN to element_transforms
        var storeySql = 'SELECT storey, COUNT(*) as cnt FROM elements_meta' +
          ' WHERE storey IS NOT NULL' + (bld ? ' AND building = ?' : '') +
          ' GROUP BY storey ORDER BY storey';
        var storeys = A.db.exec(storeySql, bld ? [bld] : []);
        elStorey.innerHTML = '<option value="">All storeys</option>';
        if (storeys.length > 0) {
          storeys[0].values.forEach(function(r) {
            if (!r[0]) return;
            var opt = document.createElement('option');
            opt.value = r[0];
            var mc = matchByStorey[r[0]];
            opt.textContent = r[0] + (mc ? ' \u2714 ' + mc + ' matches' : '') + ' (' + r[1] + ')';
            if (mc) opt.style.fontWeight = 'bold';
            elStorey.appendChild(opt);
          });
        }
        if (savedStorey) elStorey.value = savedStorey;

        // Storey accordion
        elStoreyBody.innerHTML = '';
        var stAll = document.createElement('div');
        stAll.className = 'find-acc-item' + (!savedStorey ? ' active' : '');
        stAll.textContent = 'All Storeys';
        stAll.addEventListener('pointerup', function(e) {
          e.stopPropagation(); elStorey.value = ''; elStoreyRow.classList.remove('expanded');
          elStoreyHdr.querySelector('.fa-label').textContent = 'All Storeys';
          populateDropdowns(); runSearch();
        });
        elStoreyBody.appendChild(stAll);
        if (storeys.length > 0) {
          storeys[0].values.forEach(function(r) {
            if (!r[0]) return;
            var div = document.createElement('div');
            div.className = 'find-acc-item' + (savedStorey === r[0] ? ' active' : '');
            var mc = matchByStorey[r[0]];
            div.textContent = r[0] + (mc ? ' \u2714' + mc : '') + ' (' + r[1] + ')';
            div.addEventListener('pointerup', function(e) {
              e.stopPropagation(); elStorey.value = r[0]; elStoreyRow.classList.remove('expanded');
              elStoreyHdr.querySelector('.fa-label').textContent = r[0];
              populateDropdowns(); runSearch();
            });
            elStoreyBody.appendChild(div);
          });
        }
        elStoreyHdr.querySelector('.fa-label').textContent = savedStorey || 'All Storeys';
        console.log('§FIND_DD_STOREYS count=' + (storeys.length > 0 ? storeys[0].values.length : 0));

      } catch(e) { console.warn('[S233] storey dropdown error', e); }

      // ── Phase 2 (deferred): Types — heavier queries run after paint ──
      clearTimeout(_typesTimer);
      _typesTimer = setTimeout(function() { _populateTypes(bld, name, savedType, savedStorey); }, 0);
    }

    function _populateTypes(bld, name, savedType, savedStorey) {
      if (!A.db) return;
      try {
        var matchByType = {};
        if (name) {
          var mtSql = 'SELECT ifc_class, COUNT(*) as cnt FROM elements_meta WHERE' +
            ' (LOWER(element_name) LIKE LOWER(?) OR LOWER(ifc_class) LIKE LOWER(?))' +
            (bld ? ' AND building = ?' : '') +
            (savedStorey ? ' AND storey = ?' : '') + ' GROUP BY ifc_class';
          var mtParams = ['%' + name + '%', '%' + name + '%'];
          if (bld) mtParams.push(bld);
          if (savedStorey) mtParams.push(savedStorey);
          var mtRows = A.db.exec(mtSql, mtParams);
          if (mtRows.length > 0) mtRows[0].values.forEach(function(r) { matchByType[r[0]] = r[1]; });
        }

        var typeWhere = bld || savedStorey ? ' WHERE' : '';
        var typeClauses = [];
        var typeParams = [];
        if (bld) { typeClauses.push('building = ?'); typeParams.push(bld); }
        if (savedStorey) { typeClauses.push('storey = ?'); typeParams.push(savedStorey); }
        if (typeClauses.length) typeWhere += ' ' + typeClauses.join(' AND ');
        var typeSql = 'SELECT ifc_class, COUNT(*) as cnt FROM elements_meta' +
          typeWhere + ' GROUP BY ifc_class ORDER BY cnt DESC';
        var types = A.db.exec(typeSql, typeParams);
        elType.innerHTML = '<option value="">All types</option>';
        if (types.length > 0) {
          var sorted = types[0].values.slice().sort(function(a, b) {
            var ma = matchByType[a[0]] || 0, mb = matchByType[b[0]] || 0;
            if (mb !== ma) return mb - ma;
            return b[1] - a[1];
          });
          sorted.forEach(function(r) {
            var opt = document.createElement('option');
            opt.value = r[0];
            var mc = matchByType[r[0]];
            opt.textContent = friendlyClass(r[0]) + (mc ? ' \u2714 ' + mc + ' matches' : '') + ' (' + r[1] + ')';
            if (mc) opt.style.fontWeight = 'bold';
            elType.appendChild(opt);
          });
        }
        if (savedType) elType.value = savedType;

        // Type accordion
        elTypeBody.innerHTML = '';
        var tyAll = document.createElement('div');
        tyAll.className = 'find-acc-item' + (!savedType ? ' active' : '');
        tyAll.textContent = 'All Types';
        tyAll.addEventListener('pointerup', function(e) {
          e.stopPropagation(); elType.value = ''; elTypeRow.classList.remove('expanded');
          elTypeHdr.querySelector('.fa-label').textContent = 'All Types';
          populateDropdowns(); runSearch();
        });
        elTypeBody.appendChild(tyAll);
        if (types.length > 0) {
          var tSorted = types[0].values.slice().sort(function(a, b) {
            var ma = matchByType[a[0]] || 0, mb = matchByType[b[0]] || 0;
            if (mb !== ma) return mb - ma;
            return b[1] - a[1];
          });
          tSorted.forEach(function(r) {
            var div = document.createElement('div');
            div.className = 'find-acc-item' + (savedType === r[0] ? ' active' : '');
            var mc = matchByType[r[0]];
            div.textContent = friendlyClass(r[0]) + (mc ? ' \u2714' + mc : '') + ' (' + r[1] + ')';
            div.addEventListener('pointerup', function(e) {
              e.stopPropagation(); elType.value = r[0]; elTypeRow.classList.remove('expanded');
              elTypeHdr.querySelector('.fa-label').textContent = friendlyClass(r[0]);
              populateDropdowns(); runSearch();
            });
            elTypeBody.appendChild(div);
          });
        }
        elTypeHdr.querySelector('.fa-label').textContent = savedType ? friendlyClass(savedType) : 'All Types';
        console.log('§FIND_DD_TYPES count=' + (types.length > 0 ? types[0].values.length : 0));

      } catch(e) { console.warn('[S233] type dropdown error', e); }
    }

    // ── Run search query ──
    function runSearch() {
      nav.results = [];
      nav.activeIdx = -1;
      elResults.innerHTML = '';
      elCount.textContent = '';
      if (!A.db) return;

      var bld = A.activeBuilding || '';
      var type = elType.value;
      var storey = elStorey.value;
      var name = elName.value.trim();

      var sql = 'SELECT m.guid, m.ifc_class, m.element_name, m.storey, m.discipline,' +
        ' t.center_x, t.center_y, t.center_z' +
        ' FROM elements_meta m JOIN element_transforms t ON m.guid = t.guid WHERE 1=1';
      var params = [];
      if (bld) { sql += ' AND m.building = ?'; params.push(bld); }
      if (type) { sql += ' AND m.ifc_class = ?'; params.push(type); }
      if (storey) { sql += ' AND m.storey = ?'; params.push(storey); }
      if (name) { sql += ' AND (LOWER(m.element_name) LIKE LOWER(?) OR LOWER(m.ifc_class) LIKE LOWER(?))'; params.push('%' + name + '%', '%' + name + '%'); }
      sql += ' ORDER BY m.storey, m.ifc_class, m.element_name LIMIT 50';

      try {
        var rows = A.db.exec(sql, params);
        if (rows.length > 0) {
          nav.results = rows[0].values.map(function(r) {
            return { guid: r[0], ifc_class: r[1], element_name: r[2], storey: r[3], discipline: r[4], cx: r[5], cy: r[6], cz: r[7] };
          });
        }
      } catch(e) { console.warn('[S233] search error', e); }

      if (nav.results.length > 0) {
        elCount.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_find_matches||'{n} found').replace('{n}', nav.results.length);
        renderResults();
        // No auto-select — user picks from the list. Navigate auto-selects first if needed.
      } else {
        // No results — find nearest suggestions
        var suggestions = findSuggestions(bld, name);
        elCount.textContent = typeof _TRL!=='undefined'&&_TRL.ui_find_no_matches||'0 matches';
        renderSuggestions(suggestions, name);
      }
      console.log('[S233] §NAV_FIND_SEARCH query="' + name + '" results=' + nav.results.length);
    }

    // ── Nearest-match suggestions when search returns 0 ──
    function findSuggestions(bld, name) {
      if (!A.db || !name) return [];
      var suggestions = [];

      // Strategy 1: match each word separately (user typed "fire pum" → match "fire" OR "pum")
      var words = name.toLowerCase().split(/\s+/).filter(function(w) { return w.length >= 2; });
      if (words.length > 0) {
        var wordClauses = words.map(function() { return '(LOWER(m.element_name) LIKE ? OR LOWER(m.ifc_class) LIKE ?)'; });
        var wordParams = [];
        words.forEach(function(w) { wordParams.push('%' + w + '%', '%' + w + '%'); });
        var sql = 'SELECT DISTINCT m.element_name, m.ifc_class, m.storey, COUNT(*) as cnt' +
          ' FROM elements_meta m WHERE (' + wordClauses.join(' OR ') + ')' +
          (bld ? ' AND m.building = ?' : '') +
          ' GROUP BY m.element_name, m.ifc_class, m.storey ORDER BY cnt DESC LIMIT 8';
        if (bld) wordParams.push(bld);
        try {
          var rows = A.db.exec(sql, wordParams);
          if (rows.length > 0) {
            rows[0].values.forEach(function(r) {
              suggestions.push({ name: r[0], ifc_class: r[1], storey: r[2], count: r[3], reason: 'partial match' });
            });
          }
        } catch(e) { /* ignore */ }
      }

      // Strategy 2: if still nothing, check if filters (type/storey) are too restrictive
      if (suggestions.length === 0 && (elType.value || elStorey.value)) {
        var relaxSql = 'SELECT DISTINCT m.element_name, m.ifc_class, m.storey, COUNT(*) as cnt' +
          ' FROM elements_meta m WHERE (LOWER(m.element_name) LIKE LOWER(?) OR LOWER(m.ifc_class) LIKE LOWER(?))' +
          (bld ? ' AND m.building = ?' : '') +
          ' GROUP BY m.element_name, m.ifc_class, m.storey ORDER BY cnt DESC LIMIT 5';
        var relaxParams = ['%' + name + '%', '%' + name + '%'];
        if (bld) relaxParams.push(bld);
        try {
          var rRows = A.db.exec(relaxSql, relaxParams);
          if (rRows.length > 0) {
            rRows[0].values.forEach(function(r) {
              suggestions.push({ name: r[0], ifc_class: r[1], storey: r[2], count: r[3], reason: 'try removing filters' });
            });
          }
        } catch(e) { /* ignore */ }
      }

      // Strategy 3: show what IS available (top element names containing any 3+ char substring)
      if (suggestions.length === 0 && name.length >= 3) {
        var sub = name.substring(0, 3).toLowerCase();
        var subSql = 'SELECT DISTINCT m.element_name, m.ifc_class, m.storey, COUNT(*) as cnt' +
          ' FROM elements_meta m WHERE LOWER(m.element_name) LIKE ?' +
          (bld ? ' AND m.building = ?' : '') +
          ' GROUP BY m.element_name, m.ifc_class, m.storey ORDER BY cnt DESC LIMIT 5';
        var subParams = ['%' + sub + '%'];
        if (bld) subParams.push(bld);
        try {
          var sRows = A.db.exec(subSql, subParams);
          if (sRows.length > 0) {
            sRows[0].values.forEach(function(r) {
              suggestions.push({ name: r[0], ifc_class: r[1], storey: r[2], count: r[3], reason: 'similar' });
            });
          }
        } catch(e) { /* ignore */ }
      }

      console.log('[S233] §FIND_SUGGEST count=' + suggestions.length + ' for="' + name + '"');
      return suggestions;
    }

    // ── Render suggestions as clickable items ──
    function renderSuggestions(suggestions, originalTerm) {
      elResults.innerHTML = '';
      if (suggestions.length === 0) {
        elResults.innerHTML = '<div style="color:rgba(255,224,160,0.4);font-size:12px;padding:8px;">' +
          'No elements matching "' + escHtml(originalTerm) + '"</div>';
        return;
      }
      var hdr = document.createElement('div');
      hdr.style.cssText = 'color:rgba(255,224,160,0.5);font-size:11px;padding:4px 0 6px 0;';
      hdr.textContent = typeof _TRL!=='undefined'&&_TRL.ui_find_did_you_mean||'Did you mean:';
      elResults.appendChild(hdr);

      suggestions.forEach(function(s) {
        var div = document.createElement('div');
        div.className = 'find-result-item';
        var sDispName = friendlyName(s.name, s.ifc_class);
        var sDispClass = friendlyClass(s.ifc_class);
        div.innerHTML = '<div class="ri-name">' + escHtml(sDispName) + '</div>' +
          '<div class="ri-meta">' + escHtml(sDispClass) + ' &middot; ' + escHtml(s.storey || '?') +
          ' &middot; ' + s.count + ' found' +
          (s.reason === 'try removing filters' ? ' &middot; <em>try removing filters</em>' : '') + '</div>';
        // Click suggestion → put it in search box and re-search
        div.onclick = function() {
          elName.value = s.name || s.ifc_class;
          // Clear restrictive filters if suggestion came from relaxed search
          if (s.reason === 'try removing filters') {
            elType.value = '';
            elStorey.value = '';
          }
          populateDropdowns();
          runSearch();
        };
        elResults.appendChild(div);
      });
    }

    // ── Render result list ──
    function renderResults() {
      elResults.innerHTML = '';
      elSelected.style.display = 'none';
      panel.classList.add('results-expanded'); // expand to show results
      nav.results.forEach(function(r, i) {
        var div = document.createElement('div');
        div.className = 'find-result-item';
        var dispName = friendlyName(r.element_name, r.ifc_class);
        var dispClass = friendlyClass(r.ifc_class);
        var icon = classIcon(r.ifc_class);
        div.innerHTML = '<span class="ri-icon">' + icon + '</span>' +
          '<div class="ri-body"><div class="ri-name">' + escHtml(dispName) + '</div>' +
          '<div class="ri-meta">' + escHtml(dispClass) + ' · ' + escHtml(r.storey || '?') + '</div></div>';
        // Both onclick (desktop) and touchend (mobile) — touchend avoids scroll/tap conflict
        function handleTap(e) {
          e.stopPropagation();
          // §FOCUS-BG: keep a persistent background on the row the user last clicked.
          elResults.querySelectorAll('.find-result-item.active').forEach(function(el) { el.classList.remove('active'); });
          div.classList.add('active');
          selectResult(i);
        }
        div.addEventListener('click', handleTap);
        // Mobile: track touch start to discriminate tap vs scroll
        var touchStartY = 0;
        div.addEventListener('touchstart', function(e) {
          if (e.touches.length === 1) touchStartY = e.touches[0].clientY;
        }, { passive: true });
        div.addEventListener('touchend', function(e) {
          if (e.changedTouches && e.changedTouches.length === 1) {
            var dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
            if (dy < 10) { e.preventDefault(); handleTap(e); }
          }
        });
        elResults.appendChild(div);
      });
      // Navigate button is inside #find-selected — no separate hint needed
    }

    function escHtml(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    // ── Humanise IFC names for display ──
    // "M_Single-Flush:0762 x 2032mm:0762 x 2032mm:150173" → "Single-Flush 762×2032mm"
    // "IfcFlowTerminal" → "Flow Terminal"
    function friendlyName(elementName, ifcClass) {
      var name = elementName || '';
      // Strip Revit prefix (M_, C_, etc.) and trailing Revit ID (":123456")
      name = name.replace(/^[A-Z]_/, '');
      // Split on colon — take first meaningful part
      var parts = name.split(':').filter(function(p) { return p.trim(); });
      if (parts.length >= 2) {
        // First part = type, second = dimensions usually
        var typePart = parts[0].trim();
        var dimPart = parts[1].trim();
        // If last part is just a number (Revit ID), drop it
        var lastPart = parts[parts.length - 1].trim();
        if (/^\d{4,}$/.test(lastPart)) parts.pop();
        // Deduplicate: "0762 x 2032mm:0762 x 2032mm" → just one
        var seen = {};
        var unique = [];
        parts.forEach(function(p) {
          var key = p.trim().toLowerCase();
          if (!seen[key]) { seen[key] = true; unique.push(p.trim()); }
        });
        name = unique.join(' \u2014 '); // em dash
      }
      // If still empty, humanise IFC class
      if (!name || name.length < 2) name = friendlyClass(ifcClass);
      return name;
    }

    function friendlyClass(ifcClass) {
      if (!ifcClass) return '?';
      // "IfcFlowTerminal" → "Flow Terminal", "IfcWallStandardCase" → "Wall"
      var c = ifcClass.replace(/^Ifc/, '').replace(/StandardCase$/, '').replace(/Standard$/, '');
      // Insert space before capitals: "FlowTerminal" → "Flow Terminal"
      c = c.replace(/([a-z])([A-Z])/g, '$1 $2');
      return c;
    }

    // §OUTLINER_TAXONOMY_REDESIGN.md §2 Layer 1: DISPLAY-ONLY word mapping for the raw discipline
    // CODE stored in elements_meta.discipline (ACMV/ELEC/PLB/FP/MEP/STR/ARC). Every filter/query/
    // A.filterDisc still runs on the raw code — this only swaps the rendered text. Fixed list, no
    // invented mapping for a code outside it (unmapped code falls back to itself, never blank).
    var DISC_LABELS = {
      ACMV: 'Air-Conditioning', ELEC: 'Electrical', PLB: 'Plumbing', PLMB: 'Plumbing',
      FP: 'Fire Protection', STR: 'Structure', ARC: 'Architecture', MEP: 'Mechanical & Electrical'
    };
    function friendlyDisc(code) { return DISC_LABELS[code] || code; }

    function classIcon(ifcClass) {
      var c = (ifcClass || '').toLowerCase();
      if (c.includes('door')) return '\uD83D\uDEAA';
      if (c.includes('wall')) return '\u25A8';
      if (c.includes('window')) return '\u25A1';
      if (c.includes('stair')) return '\u2B06';
      if (c.includes('slab') || c.includes('floor')) return '\u25AC';
      if (c.includes('column')) return '\u2502';
      if (c.includes('beam')) return '\u2500';
      if (c.includes('roof')) return '\u25B3';
      if (c.includes('pipe') || c.includes('flow')) return '\u25CB';
      if (c.includes('space') || c.includes('room')) return '\u25A2';
      return '\u25C6';
    }

    // ── Select result → IFC bbox highlight + info panel + fly-to (S275) ──
    // Camera flies to element. Navigate button handles the walk-to experience (from main door).
    function selectResult(idx) {
      nav.activeIdx = idx;
      // Update active class
      var items = elResults.querySelectorAll('.find-result-item');
      items.forEach(function(el, i) { el.classList.toggle('active', i === idx); });

      var r = nav.results[idx];
      if (!r) return;

      // §S280d: Restore full scene visibility before fly-to (undo storey/disc filter)
      if (A.filterStorey) A.filterStorey(null);
      if (A.filterDisc) A.filterDisc(null);

      // S275: IFC bbox highlight from DB (same as picking.js — works for merged/batched)
      highlightElement(r.guid);

      // S275: Show standard IFC info panel (same as picking.js pointerup)
      showInfoPanel(r.guid);

      // S275: Fly camera to element — preserve viewing direction, just re-target
      var pos = A.ifc2three(r.cx, r.cy, r.cz);
      var center = new THREE.Vector3(pos.x, pos.y, pos.z);
      var dist = 3;
      try {
        var bboxRows = A.dbQuery(
          'SELECT bbox_x, bbox_y, bbox_z FROM element_transforms WHERE guid = ?', [r.guid]);
        if (bboxRows.length && bboxRows[0][0] != null) {
          dist = Math.max(bboxRows[0][0], bboxRows[0][1], bboxRows[0][2]) * 1.5 + 0.5;  // §S277d: tighter zoom
        }
      } catch(e) { /* use default dist */ }
      // §S280: Find highlight — OutlinePass only, no dim/transparency (GPU-friendly)
      if (typeof _restoreIsolation === 'function') _restoreIsolation(A);
      var _findMesh = null;
      A.scene.traverse(function(obj) {
        if (_findMesh) return;
        if (obj.userData && obj.userData.guid === r.guid) _findMesh = obj;
      });
      if (_findMesh && A.setOutline) A.setOutline([_findMesh], 0xffd400);  // §HL: yellow — SAME as the final item highlight (was blue)
      // Keep camera's current viewing direction — just move to frame the new element
      var camDir = A.camera.position.clone().sub(A.controls.target).normalize();
      var end = center.clone().add(camDir.multiplyScalar(dist));
      var startPos = A.camera.position.clone();
      var startTarget = A.controls.target.clone();
      var t = 0;
      if (_flyAnim) cancelAnimationFrame(_flyAnim);
      function animFly() {
        t += 0.02; // slower steps → smoother
        if (t > 1) t = 1;
        // ease-in-out: slow departure, fast middle, slow arrival
        var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        A.camera.position.lerpVectors(startPos, end, e);
        A.controls.target.lerpVectors(startTarget, center, e);
        A.controls.update();
        if (t < 1) { _flyAnim = requestAnimationFrame(animFly); } else { _flyAnim = null; }
      }
      animFly();

      // S275: Collapse results to selected summary — slim panel
      var dispName = friendlyName(r.element_name, r.ifc_class);
      var dispClass = friendlyClass(r.ifc_class);
      var elSelText = document.getElementById('find-selected-text');
      if (elSelText) elSelText.textContent = classIcon(r.ifc_class) + ' ' + dispName + ' · ' + dispClass;
      if (r.guid) _updateSelCost(new Set([r.guid]), 'ITEM:' + dispName);   // BIM→Project TASK A: cost on the bar
      elSelected.style.display = 'flex';
      panel.classList.remove('results-expanded');
      [elStoreyRow, elTypeRow].forEach(function(row) { row.classList.remove('expanded'); });

      // Update navigate button
      // Navigate ▶ is inline in selected row — always visible when selected

      // Status feedback
      if (A.status) A.status.textContent = dispName + ' · ' + (r.storey || '?');

      console.log('[S275] §NAV_FIND_SELECT idx=' + idx + ' guid=' + r.guid +
        ' flyTo=(' + center.x.toFixed(1) + ',' + center.y.toFixed(1) + ',' + center.z.toFixed(1) + ')');
    }

    // ── S275: Show IFC info panel — same data as picking.js ──
    function showInfoPanel(guid) {
      try {
        var rows = A.dbQuery(
          'SELECT m.ifc_class, m.element_name, m.guid, m.building, m.storey, m.discipline, m.material_rgba' +
          ' FROM elements_meta m WHERE m.guid = ?', [guid]);
        if (!rows.length) return;
        document.getElementById('info-class').textContent = rows[0][0] || '—';
        document.getElementById('info-name').textContent = rows[0][1] || '—';
        document.getElementById('info-guid').textContent = rows[0][2] || '—';
        document.getElementById('info-building').textContent = rows[0][3] || '—';
        document.getElementById('info-storey').textContent = rows[0][4] || '—';
        document.getElementById('info-disc').textContent = rows[0][5] ? friendlyDisc(rows[0][5]) : '—';
        document.getElementById('info-material').textContent = rows[0][6] || '—';
        document.getElementById('info-panel').style.display = 'block';
        var snagRow = document.getElementById('snag-btn-row');
        if (snagRow) snagRow.style.display = A.walkModeActive ? 'block' : 'none';
        console.log('[S275] §FIND_INFO ' + rows[0][0] + ' "' + rows[0][1] + '" ' + rows[0][5] + ' ' + rows[0][4]);
        // §FIND_INFO_COST — cost is STANDARD on the info panel for ANY selected item (360-baseline, user
        // decree): fold the twin Planned→Committed for this element's class, same as a Zoom-Across landing.
        // No twin (un-priced building) → _showClassCost hides the cost box gracefully. (TM_4D5D_VARIANCE_LANE)
        // Pass the guid so "⏱ View at this moment" freezes TM on THIS element (§360-IDENTITY), not just its phase.
        if (rows[0][0]) _showClassCost(rows[0][0], 1, guid);
      } catch(e) {
        console.log('[S275] §FIND_INFO_ERR ' + e.message);
      }
    }

    // ── Highlight element (yellow IFC bbox from DB — same as picking.js) ──
    var _highlight = null;
    var _highlightPulse = null;
    var _flyAnim = null; // S275: running fly-to animation frame
    function highlightElement(guid) {
      clearHighlight();
      // Clear picking.js highlight too (shared global)
      if (window._pickHighlight) {
        if (window._pickHighlight.parent) window._pickHighlight.parent.remove(window._pickHighlight);
        window._pickHighlight.geometry.dispose();
        window._pickHighlight.material.dispose();
        window._pickHighlight = null;
      }
      // DB-based bbox (works for merged/batched/instanced — same as picking.js)
      var hlPos = new THREE.Vector3();
      var hlSizeX = 0.3, hlSizeY = 0.3, hlSizeZ = 0.3;
      try {
        var bboxRows = A.dbQuery(
          'SELECT center_x, center_y, center_z, bbox_x, bbox_y, bbox_z FROM element_transforms WHERE guid = ?',
          [guid]);
        if (bboxRows.length && bboxRows[0][0] != null) {
          var dbC = A.ifc2three(bboxRows[0][0], bboxRows[0][1], bboxRows[0][2]);
          hlPos.set(dbC.x, dbC.y, dbC.z);
          hlSizeX = bboxRows[0][3] || 0.3;  // IFC X → Three X
          hlSizeY = bboxRows[0][5] || 0.3;  // IFC Z → Three Y
          hlSizeZ = bboxRows[0][4] || 0.3;  // IFC Y → Three Z
        }
      } catch(e) { /* fallback to 0.3 cube at origin */ }

      var hlGeo = new THREE.BoxGeometry(
        Math.max(hlSizeX, 0.01), Math.max(hlSizeY, 0.01), Math.max(hlSizeZ, 0.01));
      var hlEdges = new THREE.EdgesGeometry(hlGeo);
      hlGeo.dispose();
      var hlMesh = new THREE.LineSegments(hlEdges,
        A._bboxMaterial);
      hlMesh.renderOrder = 999;
      hlMesh.position.copy(hlPos);
      A.scene.add(hlMesh);
      _highlight = hlMesh;
      window._pickHighlight = hlMesh; // share with picking.js so next pick clears it
      if (A.markDirty) A.markDirty();

      // S275: Solid highlight — no flashing, consistent with picking.js

      console.log('[S275] §NAV_FIND_HIGHLIGHT guid=' + guid +
        ' pos=(' + hlPos.x.toFixed(1) + ',' + hlPos.y.toFixed(1) + ',' + hlPos.z.toFixed(1) + ')' +
        ' size=(' + hlSizeX.toFixed(2) + ',' + hlSizeY.toFixed(2) + ',' + hlSizeZ.toFixed(2) + ')');
    }
    function clearHighlight() {
      clearInterval(_highlightPulse);
      if (_highlight) {
        if (_highlight.parent) _highlight.parent.remove(_highlight);
        if (_highlight.geometry) _highlight.geometry.dispose();
        if (_highlight.material) _highlight.material.dispose();
        if (window._pickHighlight === _highlight) window._pickHighlight = null;
        _highlight = null;
        if (A.markDirty) A.markDirty();
      }
    }

    // ── Find main entrance — furthest exterior door on ground floor from building centre ──
    function findMainEntrance() {
      if (!A.db) return null;
      try {
        // Get the storey with the MOST doors at or above ground level (z >= 0).
        // "TOF Footing" at z=-1 is underground — not a real entrance.
        var stRows = A.db.exec(
          "SELECT m.storey, COUNT(*) as cnt, MIN(t.center_z) as min_z FROM elements_meta m" +
          " JOIN element_transforms t ON m.guid = t.guid" +
          " WHERE m.ifc_class IN ('IfcDoor', 'IfcDoorStandardCase')" +
          " GROUP BY m.storey HAVING min_z >= -0.5 ORDER BY min_z ASC, cnt DESC LIMIT 1");
        var lowestStorey = (stRows.length > 0 && stRows[0].values.length > 0) ? stRows[0].values[0][0] : null;

        // Get all doors on ground floor
        var sql = "SELECT t.center_x, t.center_y, t.center_z FROM elements_meta m" +
          " JOIN element_transforms t ON m.guid = t.guid" +
          " WHERE m.ifc_class IN ('IfcDoor', 'IfcDoorStandardCase')";
        var params = [];
        if (lowestStorey) { sql += ' AND m.storey = ?'; params.push(lowestStorey); }
        var rows = A.db.exec(sql, params);
        if (!rows.length || !rows[0].values.length) return null;

        // Find building centre
        var bldCentre = Object.values(A.buildingCentres || {})[0];
        if (!bldCentre) return rows[0].values[0] ? { x: rows[0].values[0][0], y: rows[0].values[0][1], z: rows[0].values[0][2] } : null;

        // Pick door FURTHEST from building centre = most likely exterior/main entrance
        var best = null, bestDist = -1;
        for (var i = 0; i < rows[0].values.length; i++) {
          var dx = rows[0].values[i][0] - bldCentre.ix;
          var dy = rows[0].values[i][1] - bldCentre.iy;
          var dist = dx * dx + dy * dy;
          if (dist > bestDist) { bestDist = dist; best = { x: rows[0].values[i][0], y: rows[0].values[i][1], z: rows[0].values[i][2] }; }
        }
        console.log('[S233] §NAV_ENTRANCE door=(' + best.x.toFixed(1) + ',' + best.y.toFixed(1) + ',' + best.z.toFixed(1) +
          ') dist=' + Math.sqrt(bestDist).toFixed(1) + 'm from centre' +
          ' bldCentre=(' + (bldCentre?bldCentre.ix.toFixed(1):'?') + ',' + (bldCentre?bldCentre.iy.toFixed(1):'?') + ')' +
          ' storey="' + (lowestStorey||'?') + '" doors=' + rows[0].values.length);
        return best;
      } catch(e) {
        console.warn('[S233] §NAV_ENTRANCE_ERR', e.message);
        return null;
      }
    }

    // ── Filter change listeners — all filters cross-update dropdowns + results ──
    elType.onchange = function() { populateDropdowns(); runSearch(); };
    elStorey.onchange = function() { populateDropdowns(); runSearch(); };
    elName.addEventListener('input', debounce(function() {
      _handleInput(elName.value);
    }, 300));
    // S275: Keyboard navigation — Enter/Escape/Arrow keys
    elName.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        // If results visible and one is highlighted, select it; else search
        if (nav.results.length > 0 && nav.activeIdx >= 0) {
          selectResult(nav.activeIdx);
        } else {
          _handleInput(elName.value, true);
        }
        return;
      }
      if (e.key === 'Escape') { closeFindPanel(); return; }
      // §S282b: ArrowDown/Up → delegate to PanelNav (fixes ArrowDown-from-input bug)
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && window._findPanelNav) {
        e.preventDefault();
        e.stopPropagation(); // prevent global handler double-fire
        window._findPanelNav.onKey(e);
        return;
      }
    });
    // Make accordion headers focusable (PanelNav handles Enter/Space/Escape)
    elStoreyHdr.tabIndex = 0;
    elTypeHdr.tabIndex = 0;

    function debounce(fn, ms) {
      var t; return function() { clearTimeout(t); t = setTimeout(fn, ms); };
    }

    // ── Wire navigate button — calls startNavigation from navigate.js ──
    elNavBtn.tabIndex = 0;
    elNavBtn.onclick = function() {
      if (nav.activeIdx < 0 && nav.results.length > 0) nav.activeIdx = 0;
      if (nav.activeIdx < 0) return;
      var startNav = getStartNavigation();
      if (startNav) startNav(nav.results[nav.activeIdx]);
    };
    elNavBtn.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeFindPanel();
    });

    // ── BIM→Project TASK C: wire the > to ERP button (folds the selection via window.ProjFold) ──
    if (elErpBtn) { elErpBtn.tabIndex = 0; elErpBtn.onclick = function () { _pushToErp(); }; }

    // ── §S6 what-if RE-HOMED → Time Machine (§ARCH-OWNERSHIP: TM owns 4D/5D, Find is a satellite).
    //    The launch now lives on the TM clock-pill surface (time_machine.js tm-whatif button). ──

    // ── Expose for navigate.js Section D and external callers ──
    A.clearHighlight = clearHighlight;
    A.highlightElement = highlightElement; // called by startNavigation in navigate.js
    A.findMainEntrance = findMainEntrance; // called by startNavigation in navigate.js
    A.friendlyName = friendlyName;         // called by startNavigation (nav.targetName)

    // §FOCUS-ELEM (HISTORY_SCRUB_FIX §1): the NEUTRAL shared focus primitive. Lights a guid set as
    // its real SHAPE MESH — cyan shine-through (depthTest off → visible through occluders) — with
    // the rest ghosted to 0.1 (the depth model), and (optionally) frames it. DECOUPLED from Find:
    // a 3D tap (picking.js), a Find drill, and a read-only history-restore all route HERE — none
    // "pretends to be Find". NEVER the legacy yellow bbox box. Read-only: mutates nothing.
    //   guids: a guid string, an array of guids, or a Set.
    //   opts.item  (default true)  → single-element/item focus (1.1 tight zoom); false → group frame.
    //   opts.frame (default true)  → also move the camera to frame it. picking.js passes false on a
    //                                LIVE tap (don't hijack the camera); history-restore frames.
    A.focusElement = function (guids, opts) {
      opts = opts || {};
      if (!A.scene || typeof THREE === 'undefined') { console.log('[RP-TB] §FOCUS_ELEM skip=no-scene'); return 0; }
      var set = (guids instanceof Set) ? guids
              : new Set((Array.isArray(guids) ? guids : [guids]).filter(Boolean));
      if (!set.size) { console.log('[RP-TB] §FOCUS_ELEM skip=empty'); return 0; }
      // §UNIFIED-SELECT (user "drop cyan"): ONE select look for pick / Find zoom-to / history-restore.
      // Ghost the rest (0.1), draw the focus in its OWN real material (SOLID), and mark it with the
      // OutlinePass silhouette — the S277 Bonsai outline. NO cyan shine-through fill (the depth-model
      // "bright-blue item" is retired; the outline reads the selection cleanly on its real material).
      _clearShapeOverlays();
      _clearHlOverlay();
      if (A.setOutline) A.setOutline([]);
      // §PERF-50K (user, 2026-07-06, #672): full per-material X-Ray (A.toggleXray iterates every
      // material, flips transparent/opacity/side, forces a pipeline recompile) was ALWAYS
      // auto-engaged here on every selection — fine at small scale, but "too heavy" once a
      // building crosses ~50k elements (the same threshold time_machine.js already uses for
      // its own perf cliff, LARGE_BUILDING). Above that, obscure the rest via the cheap
      // VISIBILITY-only A.filterByGuids (the same primitive Alt+X's ghost/bbox mode already
      // uses) instead of touching material state at all. Below threshold: unchanged.
      // §PERF-50K-SINGLE-PICK (2026-07-17, user: a single 3D click reads as "whole building
      // disappears" on a >50k building like Hospital (63,182 elements) — the cheap filter hides
      // EVERYTHING except the one selected element, instead of the expected translucent ghost.
      // First attempt gated this on set.size>1 (single vs multi-item) — WRONG signal, corrected
      // same day per user: "Find Panel yes u need [cheap filter] because it is zooming to item.
      // In pure select touch by user an item has no zooming action." The real distinguishing
      // factor is whether this call ZOOMS (opts.frame !== false, checked again further down at
      // the actual _zoomToGuids/_zoomToGroup call) — a camera transition is the situation the
      // original #672 perf concern was really about, not selection count. Confirmed against every
      // caller: picking.js's direct-click handler is the ONLY one passing frame:false; Find-panel
      // results, Zoom-Across, and history-restore (universal_history.js) all leave frame unset and
      // zoom. So: a plain click never zooms and always gets proper x-ray-dim regardless of
      // building size; every zooming caller can still fall back to the cheap filter on large
      // buildings, matching #672's original intent exactly.
      var _bigBuilding = (A.activeBuildingTotal || 0) > 50000 && (opts.frame !== false);
      if (_bigBuilding) {
        if (A.filterByGuids) A.filterByGuids(set);   // hide everything except the selection
      } else {
        if (!A.xrayOn && A.toggleXray) { A.toggleXray(); _hlXrayWasOff = true; } // x-ray path: rest → transparent
        _dimXrayTo(0.1);                                                          // §DEPTH: rest = 0.1 ghost
      }
      // color=null → opaque clone of each element's REAL material; solidOpacity=1 → fully solid.
      var _ovBefore = _shapeOverlays.length;
      var lit = _buildShapeMeshes(set, null, 1, null);
      var _ovMeshes = [];
      for (var _oi = _ovBefore; _oi < _shapeOverlays.length; _oi++) _ovMeshes.push(_shapeOverlays[_oi].mesh);
      // §YELLOW-SILHOUETTE: IDENTICAL treatment to the Find drill (_drillSelect) so a 3D pick, a Find
      // zoom-to and a history-restore all read the same — yellow silhouette that SHINES THROUGH the
      // ghosted rest (hidden-edge same yellow). Mobile/no-OutlinePass → faint yellow fill fallback.
      if (A._outlinePass && A.setOutline && _ovMeshes.length) {
        A.setOutline(_ovMeshes, 0xffd400);
        A._outlinePass.hiddenEdgeColor.set(0xffd400);
        A._outlinePass.edgeThickness = 3;
        A._outlinePass.edgeStrength = 6;
        A._outlinePass.edgeGlow = 0.3;
      } else if (!_ovMeshes.length || !A._outlinePass) {
        _buildShapeMeshes(set, 0xffd400, null, 0.35); // fallback: faint yellow fill (no silhouette pass)
      }
      var zoomed = false;
      if (opts.frame !== false) zoomed = (opts.item === false) ? _zoomToGroup(set) : _zoomToGuids(set, 1.1);
      if (A.markDirty) A.markDirty();
      console.log('[RP-TB] §FOCUS_ELEM guids=' + set.size + ' lit=' + lit + ' outline=' + _ovMeshes.length +
        ' frame=' + (opts.frame !== false) + ' zoom=' + (zoomed ? 'fit' : 'none') + ' xray=' + (A.xrayOn ? 'on' : 'off') +
        ' mode=' + (_bigBuilding ? 'filter-cheap(>50k)' : 'xray-dim'));
      return lit;
    };
    // Read-only teardown — drop the focus overlay + restore x-ray (same path as a lens reset).
    // §SHAKE-OUT (user, 2026-07-06): "Both [X-Ray and Bbox] should shake out of their states upon
    // click outside or select again to deselect item." _highlightLensReset() deliberately PRESERVES
    // a manually-toggled Alt+Z mode (X-Ray restored to its normal 0.3 dim, ghost left alone) for its
    // OTHER callers (room/phase/material lens switches elsewhere in this file) — that nuance stays.
    // But THIS is the neutral deselect/click-outside primitive picking.js calls on every empty-click
    // and re-click-to-deselect; the user wants those two triggers to fully exit BOTH view modes, not
    // just tear down the focus highlight. Scoped here (not in _highlightLensReset itself) so the
    // other lens-reset call sites keep their existing manual-toggle-preserving behavior.
    A.clearFocusElement = function () {
      _highlightLensReset();
      if (A.xrayOn && A.toggleXray) { A.toggleXray(); console.log('[RP-TB] §SHAKE_OUT xray→off'); }
      if (typeof window.ghostXrayOn === 'function' && window.ghostXrayOn() && window.toggleGhostXray) {
        window.toggleGhostXray(); console.log('[RP-TB] §SHAKE_OUT ghost→off');
      }
      console.log('[RP-TB] §FOCUS_ELEM_CLEAR');
    };

    // ── Zoom-Across SCOPE consume (ZOOM_ACROSS_SCOPE_SESSION §SPEC) ─────────────────────────────────────────
    // §BUGFIX 2026-07-13 (user report: "the ERP drawer at the bottom does not appear [after Zoom Across
    // lands]; only when exiting the building and back to it, it is") — root cause: A.focusElement only
    // does the 3D highlight (ghost/outline/zoom); it never touches #find-selected (the bottom bar with
    // the cost figure + "› ERP" push + "open ↗"/"iDempiere ↗" links). Every OTHER selection path (a
    // single result-item click, line ~3940; a storey/disc GROUP tap, line ~3117) explicitly reveals that
    // bar via elSelected.style.display='flex' + _updateSelCost(set,label) — applyFindScope (the THIRD
    // selection path, boot-time auto-Find from the ERP pill) never did. Re-entering the building later
    // hits one of the other two paths, which is why a manual re-select "fixed" it. Mirrors the GROUP-tap
    // fix (§FIND_MULTISEL, line ~3117) exactly — same reveal, same _updateSelCost call.
    function _revealSelectedBar(set, label) {
      var elSelText = document.getElementById('find-selected-text');
      if (!set || !set.size) { if (elSelected) elSelected.style.display = 'none'; return; }
      if (elSelText) elSelText.textContent = label;
      if (elSelected) elSelected.style.display = 'flex';
      try { _updateSelCost(set, label); } catch (e) { console.log('§ZOOM-SCOPE_BAR_ERR ' + e.message); }
    }
    // The ERP "Zoom Across" pill cold-opens the viewer with ?find=<scope>; we run the INCUMBENT Find on it and
    // light the matches with the SAME highlighter a pick/Find-zoom uses (A.focusElement). NO parallel highlighter.
    //   scope = a comma-separated guid set  → focus those elements directly.
    //   scope = a single IFC class (default) → drive the Find panel (elName→class) and focus the result set.
    A.applyFindScope = function (scope) {
      scope = String(scope || '').trim();
      if (!scope) { console.log('§ZOOM-SCOPE skip=empty'); return 0; }
      // §ARCH-OWNERSHIP (FUSED_4D5D_WEDGE_LANE): if the Time Machine is OPEN it is the OWNER/consumer —
      // it shows the pinpointed element AT ITS MOMENT (tmJumpToElement). Else Find is the default floor
      // (cost/location users care about WHAT/WHERE, not the schedule). Mechanism = "TM-if-open, else Find".
      var _tmSt = null; try { _tmSt = window.tmGetState && window.tmGetState(); } catch (e) {}
      var tmOpen = !!(_tmSt && _tmSt.active && typeof window.tmJumpToElement === 'function');

      // guid-set: has a comma OR isn't an Ifc* class token → treat as explicit element ids.
      if (scope.indexOf(',') >= 0 || !/^ifc[a-z]/i.test(scope)) {
        var guids = scope.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        var guidSet = new Set(guids);
        var lit = A.focusElement(guidSet, { item: guids.length === 1 });
        _revealSelectedBar(guidSet, guids.length === 1 ? ('Zoom Across · 1 item') : ('Zoom Across · ' + guids.length + ' items'));
        if (tmOpen && guids.length) {
          try { window.tmJumpToElement(guids[0]); } catch (e) {}   // TM consumes: jump to its construction moment
          console.log('§ZOOM-SCOPE route=tm kind=guids n=' + guids.length + ' moment=' + guids[0]);
        } else {
          console.log('§ZOOM-SCOPE route=find kind=guids n=' + guids.length + ' lit=' + lit);
        }
        return guids.length;
      }
      // IFC class: reuse the Find panel + runSearch so the UI reflects the scope and one code path filters.
      if (A.openFindPanel) try { A.openFindPanel(); } catch (e) {}
      elName.value = scope;
      try { populateDropdowns(); } catch (e) {}
      runSearch();
      var set = new Set((nav.results || []).map(function (r) { return r.guid; }).filter(Boolean));
      if (set.size) A.focusElement(set, { item: false });
      _revealSelectedBar(set, friendlyClass(scope) + ' · ' + set.size + (set.size === 1 ? ' item' : ' items'));
      if (tmOpen && set.size) {
        var firstG = (nav.results || []).map(function (r) { return r.guid; }).filter(Boolean)[0];
        if (firstG) { try { window.tmJumpToElement(firstG); } catch (e) {} }   // TM consumes the class's first element
        console.log('§ZOOM-SCOPE route=tm kind=class scope="' + scope + '" matches=' + set.size + ' moment=' + (firstG || '-'));
      } else {
        console.log('§ZOOM-SCOPE route=find kind=class scope="' + scope + '" matches=' + set.size);
      }
      // §S2 — fold this class's twin cost into the #info-panel (Planned→Committed pair, from records).
      try { _showClassCost(scope, set.size); } catch (e) { console.log('§ZOOM-COST wire_err=' + e.message); }
      return set.size;
    };

    // §S282b: _focusCycle removed — PanelNav handles zone cycling
    // §S282b: PanelNav replaces _findNav — universal zone-based keyboard nav
    // Fixes ArrowDown-from-input bug: input → storey header (not empty result list)
    if (typeof window.PanelNav === 'function') {
      window._findPanelNav = PanelNav({
        id: 'find',
        panel: panel,
        zones: [
          { id: 'search', el: elName, type: 'input' },
          { id: 'storeys', header: elStoreyHdr,
            items: function() { return elStoreyBody.querySelectorAll('.find-acc-item'); },
            onSelect: function(el) { el.click(); },
            onExpand: function(z, open) {
              if (open === true && !elStoreyRow.classList.contains('expanded')) toggleAccRow(elStoreyRow);
              else if (open !== true) toggleAccRow(elStoreyRow);
            }
          },
          { id: 'types', header: elTypeHdr,
            items: function() { return elTypeBody.querySelectorAll('.find-acc-item'); },
            onSelect: function(el) { el.click(); },
            onExpand: function(z, open) {
              if (open === true && !elTypeRow.classList.contains('expanded')) toggleAccRow(elTypeRow);
              else if (open !== true) toggleAccRow(elTypeRow);
            }
          },
          { id: 'results',
            items: function() { return elResults.querySelectorAll('.find-result-item'); },
            onSelect: function(el) { el.click(); }
          }
        ],
        onClose: closeFindPanel
      });
      console.log('§PANEL_NAV_FIND wired zones=4');
    } else if (typeof window._registerPanel === 'function') {
      // Fallback: register without PanelNav (panel_nav.js not loaded)
      window._registerPanel('find', panel, null, closeFindPanel);
    }

    console.log('[S233] §NAV_FIND_MODULE_LOADED panel=' + !!document.getElementById('find-panel'));
  }

  console.log('§NAV_FIND_VERSION v41 — yellow-outline + focus-bg(tree+results) + adjustable-panel');
  window.NavigateFind = { init: init };

  // §MERGE-GHOST auto-trigger: open viewer with #...ghost → build the merged glass shell with no taps.
  // Loads the lens module (so _mergeGhost exists) once geometry is streamed, then builds once.
  // NOTE: read location.SEARCH (query) — the viewer rewrites location.hash with live camera coords,
  // which wipes a #ghost flag before geometry streams. The query string survives. (hash kept as fallback.)
  if (typeof window !== 'undefined' && location && /ghost/.test(location.search + location.hash)) {
    var _mgTries = 0, _mgPoll = setInterval(function () {
      _mgTries++;
      var A = window.APP || window.A;
      if (!A) { if (_mgTries > 200) clearInterval(_mgPoll); return; }
      var ready = A.meshCache && Object.keys(A.meshCache).length > 20;
      if (!ready) { if (_mgTries > 200) clearInterval(_mgPoll); return; }
      if (typeof window._mergeGhost !== 'function') { if (A.loadNavigate) A.loadNavigate(); return; }
      // §FLY-NO-AUTO-GHOST (2026-07-16, live report "bboxes turning on after some secs"): the Fly
      // tour lazy-loads this module (ensureRooms pre-step), which armed this ghost=1 auto-trigger
      // MID-FLIGHT — the shell built under the running tour. Never build while a tour is active;
      // keep polling and build once the tour ends. Non-tour behavior unchanged.
      if (A.walkMode || A.flyActive || A._flyPreparing) return;
      clearInterval(_mgPoll);
      console.log('[MG] §SHELL_GHOST_AUTO meshCacheKeys=' + Object.keys(A.meshCache).length + ' (deferred build)');
      // build AFTER the panel is interactive — never block open
      var _go = function () { window._mergeGhost(); };
      if (window.requestIdleCallback) requestIdleCallback(_go, { timeout: 2000 }); else setTimeout(_go, 600);
    }, 400);
  }

})();
