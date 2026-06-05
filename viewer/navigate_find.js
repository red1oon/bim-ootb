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
      '#find-panel { top: 50%; right: 70px; transform: translateY(-50%);',
      '  width: 280px; max-width: 35vw; padding: 0; max-height: 70vh; overflow: hidden; }',
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
      '.find-acc-item.active { background: rgba(79,195,247,0.15); color: #4fc3f7; }',
      // Results — same accordion
      '#find-results { max-height: 0; overflow-y: auto; transition: max-height 0.2s ease; }',
      '#find-panel.results-expanded #find-results { max-height: 140px; }',
      '.find-result-item {',
      '  padding: 5px 10px; cursor: pointer;',
      '  border-bottom: 1px solid rgba(255,255,255,0.04);',
      '  transition: background 0.1s; font-size: 11px; display: flex; align-items: center; gap: 6px;',
      '}',
      '.find-result-item:hover { background: rgba(79,195,247,0.1); }',
      '.find-result-item.active { background: rgba(79,195,247,0.18); }',
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
      '.find-nav-inline { background: rgba(79,195,247,0.25); color: #4fc3f7; border: none;',
      '  border-radius: 6px; padding: 4px 8px; font-size: 13px; cursor: pointer;',
      '  flex-shrink: 0; min-width: 32px; min-height: 32px; transition: background 0.15s; }',
      '.find-nav-inline:hover { background: rgba(79,195,247,0.45); }',
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
      '  #find-tree { max-height: 120px !important; }',
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
      '<div id="find-tree" style="max-height:200px;overflow-y:auto;scrollbar-width:thin;display:none"></div>',
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
      '<div id="find-selected"><span id="find-selected-text"></span><button class="find-nav-inline" id="find-navigate-btn" title="Navigate">\u25B6</button></div>',
      '<div id="find-results"></div>',
    ].join('');
    document.body.appendChild(panel);
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
        row.style.background = 'linear-gradient(180deg,rgba(79,195,247,0.2) 0%,rgba(79,195,247,0.08) 100%)';
        row.style.borderLeftColor = '#4fc3f7';
        if (text) text.style.color = '#4fc3f7';
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
      // §RP Task A: leaving the Room axis tears down room boxes + shape overlays + restores opacity.
      if (_treeMode === 'room') { _roomLensReset(); _highlightLensReset(); }
      // §PHASE_LENS/§MAT_SELECT: leaving Phase/Material tears down element highlight.
      if (_treeMode === 'phase' || _treeMode === 'material') _highlightLensReset();
      _treeMode = mode;
      // §NAV_FIND_002: axis change clears multi-select + restores full scene (unify engine)
      _selStoreys.clear(); _selDiscs.clear(); _anchor = null;
      if (A.filterStorey) A.filterStorey(null);
      if (A.filterDisc) A.filterDisc(null);
      if (A.filterByGuids) A.filterByGuids(null);
      if (elIsoBar) elIsoBar.style.display = 'none';
      _thump();
      _renderAxes(); // re-highlight the active pill
      if (elTree) { elTree.style.display = ''; _treeRevealed = true; }
      buildTree();
      console.log('§FIND_MODE_TOGGLE mode=' + mode);
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
    function _probeLenses() {
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
      console.log('[RP-T3] §LENS_PROBE room=' + room + ' roomVol=' + _roomHasVol + ' material=' + material + ' phase=' + phase);
      return { room: room, material: material, phase: phase };
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
        if (o.disposeMat && o.mesh && o.mesh.material) o.mesh.material.dispose();
      });
      _shapeOverlays = [];
    }
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

    // solidOpacity (optional): for the kept-solid CONTEXT build (color==null), render it at this
    // opacity instead of fully opaque. Room lens passes 0.3 so the selected room shows THROUGH its
    // enclosing floor; Material/Type/Phase drills omit it → context stays solid (1.0), as before.
    // colorOpacity (optional, color path): render the highlight colour SEE-THROUGH at this opacity
    // (transparent, depthWrite off) instead of flat opaque — the "usual mesh highlight" look so the
    // item's real material reads through it. null → opaque (legacy).
    function _buildShapeMeshes(set, color, solidOpacity, colorOpacity) {
      if (!A.scene || typeof THREE === 'undefined' || !A.ifc2three || !A.meshCache || !set || !set.size) return 0;
      var rows = _getInstanceRows();
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
        depthWrite: colorOpacity == null, depthTest: colorOpacity == null }) : null;
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
        A.scene.add(inst);
        _shapeOverlays.push({ mesh: inst, disposeMat: true }); // cyan + clones are ours to dispose
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

    // Remove boxes, restore opacity (turn X-Ray off if WE turned it on), drop outline.
    function _roomLensReset() {
      _clearRoomBoxes();
      if (A.setOutline) A.setOutline([]);
      if (A.xrayOn && _roomXrayWasOff && A.toggleXray) A.toggleXray(); // restore opacity
      _roomXrayWasOff = false;
      if (A.markDirty) A.markDirty();
    }

    // §RP-SHAPE: the Room axis no longer paints translucent volume boxes (the old "ghost
    // over all storeys"). It shows the per-storey tree; tapping a room lights its real
    // CONTENTS (rel_contained_in_space) + keeps that storey solid + rest at 0.2 — the same
    // drill as Phase/Material. Nothing is drawn until a room is tapped.
    function _roomLensOn() {
      _clearRoomBoxes();
      console.log('[RP-TA] §ROOM_LENS mode=shape (no volume boxes; highlight on room tap)');
    }

    // §RP zoom-to-fit: frame the camera on a box (center+size, Three units). Reuses the
    // proven camera-lerp from diff.js zoomToGuid, but is box-based (works for rooms/phases/
    // elements that live in batched/instanced meshes, which zoomToGuid can't find). markDirty
    // every frame — the §S286 idle gate parks the loop, so the move won't render without it.
    // Shared camera fly-to: lerp to `dist` units from `center` along the standard iso offset,
    // easing over ~0.3s. markDirty each frame — the §S286 idle gate parks the loop otherwise.
    function _lerpCam(center, dist) {
      if (!A.camera || !A.controls || typeof THREE === 'undefined') return;
      var end = center.clone().add(new THREE.Vector3(0.5, 0.5, 0.7).normalize().multiplyScalar(dist));
      var start = A.camera.position.clone();
      var t = 0;
      function anim() {
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
    function _zoomToBoxFill(center, size, tag) {
      if (!A.camera || !size) return false;
      var dist = _fitDistForBox(size); _lerpCam(center, dist);
      console.log('[RP-TB] §' + (tag || 'GROUP_ZOOM') + ' fill dist=' + dist.toFixed(1) +
        ' size=' + size.x.toFixed(1) + 'x' + size.y.toFixed(1) + 'x' + size.z.toFixed(1));
      return true;
    }
    function _zoomToGroup(set) {
      var bb = _bboxOfGuids(set); if (!bb || !A.camera) return false;
      return _zoomToBoxFill(bb.center, bb.size, 'GROUP_ZOOM');
    }

    // §RP-SHAPE: tap a room → light its real CONTENTS (rel_contained_in_space) in cyan,
    // keep that storey solid, rest at 0.2 (same drill as Phase/Material). No box.
    function _roomSelect(guid) {
      var set = new Set(), name = guid, storeySet = null, zoomBox = null;
      try {
        var nm = A.dbQuery("SELECT s.name, p.name, s.center_x, s.center_y, s.center_z, s.size_x, s.size_y, s.size_z" +
          " FROM spatial_structure s LEFT JOIN spatial_structure p ON p.guid = s.parent_guid WHERE s.guid = ?", [guid]);
        if (nm.length) { name = nm[0][0] || guid; var storey = nm[0][1];
          if (storey) { storeySet = new Set();
            A.dbQuery("SELECT guid FROM elements_meta WHERE storey = ?", [storey])
              .forEach(function(r) { storeySet.add(r[0]); }); }
          // §ROOM_ZOOM: frame the room's VOLUME (center+size from spatial_structure), not its few
          // contained elements — a 2-element room would otherwise zoom to a tiny erroneous frame.
          var rw = nm[0];
          if (rw[2] != null && rw[5] != null && A.ifc2three && typeof THREE !== 'undefined') {
            var cc = A.ifc2three(rw[2], rw[3], rw[4]);  // IFC size → Three: x→x, z→y, y→z (bbox parity)
            zoomBox = { center: new THREE.Vector3(cc.x, cc.y, cc.z),
              size: new THREE.Vector3(Math.max(rw[5] || 0.5, 0.5), Math.max(rw[7] || 0.5, 0.5), Math.max(rw[6] || 0.5, 0.5)) };
          }
        }
        A.dbQuery("SELECT element_guid FROM rel_contained_in_space WHERE space_guid = ?", [guid])
          .forEach(function(r) { set.add(r[0]); });
      } catch (e) { console.warn('[RP-TA] §ROOM_SELECT_ERR', e.message); }
      // §DEPTH item: room CONTENTS = cyan item; enclosing storey = the 0.1 parent ghost; zoom frames the room VOLUME.
      // §DEPTH item: room CONTENTS = focus (solid + shine-thru) · enclosing storey = parent (solid) ·
      // building = grandparent → 0.2. Zoom frames the room VOLUME.
      _drillSelect(set, name, 'ROOM_SELECT', { isItem: true, parentSet: storeySet, zoomBox: zoomBox });
    }

    // §DEPTH consistency: a Room-tree floor/type HEADER tap is a GROUP select — route it through the
    // SAME B|G|I entry every other lens uses (was expand-only). Storey grouping → the floor's elements;
    // Type grouping → the union of that type's rooms' contents. Group depth = 1.0 solid + fit-zoom,
    // building(parent) = 0.1. (groupRooms = [{key,label}] for this header, captured at build time.)
    function _roomGroupSelect(gk, groupRooms) {
      var set = new Set();
      try {
        if (_roomGroupBy === 'type') {
          var keys = (groupRooms || []).map(function(r) { return r.key; });
          if (keys.length) {
            var ph = keys.map(function() { return '?'; }).join(',');
            A.dbQuery("SELECT element_guid FROM rel_contained_in_space WHERE space_guid IN (" + ph + ")", keys)
              .forEach(function(r) { set.add(r[0]); });
          }
        } else {
          A.dbQuery("SELECT guid FROM elements_meta WHERE storey = ?", [gk])
            .forEach(function(r) { set.add(r[0]); });
        }
      } catch (e) { console.warn('[RP-TA] §ROOM_GROUP_ERR', e.message); }
      _drillSelect(set, gk, 'ROOM_GROUP', { isItem: false }); // top-level group: floor solid, building 0.2
    }

    // §RP sub-toggle row [A | B] — a small two-pill regroup control inside a lens tree.
    function _subToggleRow(labelA, valA, labelB, valB, current, onPick) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;padding:6px 10px;align-items:center;border-bottom:1px solid rgba(255,255,255,0.05)';
      var hint = document.createElement('span');
      hint.style.cssText = 'font-size:10px;color:#888;margin-right:2px';
      hint.textContent = _t('ui_lens_group', 'group:');
      row.appendChild(hint);
      [[labelA, valA], [labelB, valB]].forEach(function(o) {
        var on = (current === o[1]);
        var b = document.createElement('button');
        b.textContent = o[0];
        b.style.cssText = 'padding:3px 10px;font-size:10px;font-weight:700;border-radius:5px;cursor:pointer;white-space:nowrap;' +
          'border:1px solid rgba(79,195,247,' + (on ? '0.7' : '0.25') + ');' +
          'background:rgba(79,195,247,' + (on ? '0.25' : '0.08') + ');color:' + (on ? '#fff' : '#4fc3f7') + ';';
        b.addEventListener('pointerup', function(e) { e.stopPropagation(); onPick(o[1]); });
        row.appendChild(b);
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
      if (_roomHasVol) {
        _roomLensOn();
        if (elIsoBar) {
          elIsoBar.style.display = 'flex';
          if (elIsoBtn) elIsoBtn.style.display = 'none';
          if (elShowAllBtn) elShowAllBtn.style.display = '';
        }
        elTree.appendChild(_subToggleRow(
          _t('ui_axis_storey', 'Storey'), 'storey', _t('ui_room_type', 'Type'), 'type',
          _roomGroupBy, function(v) { if (v !== _roomGroupBy) { _roomGroupBy = v; buildTree(); } }));
        var rooms = [];
        try {
          rooms = A.dbQuery("SELECT s.guid, s.name, p.name, s.object_type, s.predefined_type" +
            " FROM spatial_structure s LEFT JOIN spatial_structure p ON p.guid = s.parent_guid" +
            " WHERE s.type='IfcSpace' AND s.center_x IS NOT NULL ORDER BY p.name, s.name");
        } catch(e) { console.warn('[RP-TA] §ROOM_TREE_ERR', e.message); }
        var byGroup = {}, order = [], typed = 0;
        rooms.forEach(function(r) {
          var gk = (_roomGroupBy === 'type') ? (r[3] || r[4] || '(untyped)') : (r[2] || '(no storey)');
          if (_roomGroupBy === 'type' && (r[3] || r[4])) typed++;
          if (!byGroup[gk]) { byGroup[gk] = []; order.push(gk); }
          byGroup[gk].push({ key: r[0], label: r[1] || '(unnamed)' });
        });
        order.forEach(function(gk) {
          var groupRooms = byGroup[gk];
          var kids = groupRooms.map(function(rm) {
            return _treeNode(rm.label, '', 1, { onTap: function() { _roomSelect(rm.key); } });
          });
          // §DEPTH consistency: a floor/type header tap is a GROUP select (like Storey/Phase/Material) —
          // render it solid via the same B|G|I entry. (Was expand-only → "doesn't treat it as Group".)
          // Arrow still expands the children.
          elTree.appendChild(_treeNode(gk, groupRooms.length, 0,
            { children: kids, onTap: function() { _roomGroupSelect(gk, groupRooms); } }));
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
      if (!A.xrayOn && A.toggleXray) { A.toggleXray(); _hlXrayWasOff = true; } // rest → transparent

      // Build the visible window (inner→outer) + decide the building base (0.2 if it IS the next layer, else hidden).
      var layers = [], baseOp;
      if (isItem) {
        if (parentSet) layers.push({ set: parentSet, op: 1.0 });        // immediate parent: SOLID
        if (grandSet) { layers.push({ set: grandSet, op: 0.2 }); baseOp = 0; } // grandparent 0.2, building hidden
        else baseOp = 0.2;                                              // no grandparent → building IS the 0.2
      } else {
        if (parentSet) { layers.push({ set: parentSet, op: 0.2 }); baseOp = 0; } // nested group: parent 0.2, building hidden
        else baseOp = 0.2;                                             // top-level group → building IS the 0.2
      }
      _dimXrayTo(baseOp);
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
        var solid = _buildShapeMeshes(focusSet, null, 1.0);                       // focus in its real material, solid
        var hl = isItem ? _buildShapeMeshes(focusSet, 0x4fc3f7, null, 0.5) : 0;   // see-thru cyan shine (shines through)
        var zoomed = zoomBox ? _zoomToBoxFill(zoomBox.center, zoomBox.size, tag + '_ZOOM')
                   : (isItem ? _zoomToGuids(focusSet, 1.1) : _zoomToGroup(focusSet));
        if (A.markDirty) A.markDirty();
        console.log('[RP-TB] §' + tag + ' "' + label + '" ' + (isItem ? 'ITEM' : 'GROUP') + ' focus=' + focusN +
          ' solid=' + solid + ' hl=' + hl + ' anc=[' + ancLog.join(',') + '] base=' + baseOp +
          ' overlays=' + _shapeOverlays.length + ' zoom=' + (zoomed ? 'fit' : 'none') + ' xray=' + (A.xrayOn ? 'on' : 'off'));
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
        A.dbQuery("SELECT guid FROM elements_meta WHERE " + col + " IN (" + ph + ")", labels)
          .forEach(function(r) { set.add(r[0]); });
      } catch (e) { console.warn('[RP-TB] §AXIS_GROUP_ERR', e.message); }
      // top-level group: storey/disc solid, building 0.2.
      _drillSelect(set, labels.join(', '), (mode === 'storey' ? 'STOREY' : 'DISC') + '_SELECT', { isItem: false });
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
      var bld = A.activeBuilding || '';
      var total = 0;
      try {
        var tr = A.db.exec('SELECT COUNT(*) FROM elements_meta' + (bld ? ' WHERE building = ?' : ''), bld ? [bld] : []);
        if (tr.length) total = tr[0].values[0][0];
      } catch(e) { /* total stays 0 */ }
      console.log('[RP-A1] §FILTER visible=' + set.size + ' hidden=' + Math.max(0, total - set.size) +
        ' total=' + total + ' by=' + by);
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
      var row = document.createElement('div');
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
      arrow.style.cssText = 'font-size:' + (isParent ? '10px' : '8px') + ';opacity:0.5;width:12px;text-align:center;flex-shrink:0';
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
      // §NAV_FIND_002: tag parent rows so multi-select range/highlight can read DOM order
      if (isParent) row.setAttribute('data-find-parent', label);

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
        if (isParent && opts.multiSelect) {
          var sel = (_treeMode === 'storey') ? _selStoreys : _selDiscs;
          var ctrl = e.ctrlKey || e.metaKey;
          var shift = e.shiftKey;
          var mod = shift ? 'shift' : (ctrl ? 'ctrl' : 'plain');
          if (shift && _anchor !== null) {
            var labels = _orderedParentLabels();
            var ai = labels.indexOf(_anchor), bi = labels.indexOf(label);
            if (ai >= 0 && bi >= 0) {
              sel.clear();
              for (var k = Math.min(ai, bi); k <= Math.max(ai, bi); k++) sel.add(labels[k]);
            } else { sel.clear(); sel.add(label); _anchor = label; }
          } else if (ctrl) {
            if (sel.has(label)) sel.delete(label); else sel.add(label);
            _anchor = label;
          } else {
            sel.clear(); sel.add(label); _anchor = label;
          }
          _applyParentHighlight();
          var arr = Array.from(sel);
          _axisGroupSelect(_treeMode, arr); // §DEPTH: ghost rest 0.1 + selected solid (was filterStorey hide)
          console.log('§FIND_MULTISEL mode=' + _treeMode + ' sel=[' + arr.join(',') + '] n=' + arr.length + ' mod=' + mod);
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

        var node = _treeNode(disc, discCnt, 0, {
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
                  onTap: function() { _typeShapeDrill('discipline', disc, ifc, friendlyClass(ifc) + ' @ ' + disc); },
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
      _elMetaMap = null;  // §D drill: re-cache element labels for the (possibly new) building
      // Set search term and open
      panel.style.display = 'block';
      elName.value = searchTerm || '';
      // §S281: Defer item queries — only build tree (fast GROUP BY) on open.
      _renderAxes(); // §RULE1: single axis toggle (cycles storey→disc→room→material→phase)
      // §RULE1: with one toggle, the CURRENT axis tree is shown immediately (no hide-until-tap).
      if (elTree) { elTree.style.display = ''; _treeRevealed = true; }
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
    // §S275: Tap (not drag) outside find panel to close
    var _findPointerDown = { x: 0, y: 0 };
    document.addEventListener('pointerdown', function(e) {
      _findPointerDown.x = e.clientX; _findPointerDown.y = e.clientY;
    });
    document.addEventListener('pointerup', function(e) {
      if (panel.style.display === 'none') return;
      if (panel.contains(e.target)) return;
      if (e.target.closest && e.target.closest('[title="Find"]')) return;
      // Only close on tap — ignore drags (orbit/pan)
      var dx = e.clientX - _findPointerDown.x, dy = e.clientY - _findPointerDown.y;
      if (Math.sqrt(dx * dx + dy * dy) > 10) return;
      closeFindPanel();
    });

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
      if (_findMesh && A.setOutline) A.setOutline([_findMesh], 0x4fc3f7);  // blue outline through geometry
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
        document.getElementById('info-disc').textContent = rows[0][5] || '—';
        document.getElementById('info-material').textContent = rows[0][6] || '—';
        document.getElementById('info-panel').style.display = 'block';
        var snagRow = document.getElementById('snag-btn-row');
        if (snagRow) snagRow.style.display = A.walkModeActive ? 'block' : 'none';
        console.log('[S275] §FIND_INFO ' + rows[0][0] + ' "' + rows[0][1] + '" ' + rows[0][5] + ' ' + rows[0][4]);
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

    // ── Expose for navigate.js Section D and external callers ──
    A.clearHighlight = clearHighlight;
    A.highlightElement = highlightElement; // called by startNavigation in navigate.js
    A.findMainEntrance = findMainEntrance; // called by startNavigation in navigate.js
    A.friendlyName = friendlyName;         // called by startNavigation (nav.targetName)

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

  window.NavigateFind = { init: init };
})();
