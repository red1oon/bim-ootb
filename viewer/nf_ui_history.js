// navigate_find family — part `ui_history` (original navigate_find.js lines 20–544).
// GENERATED move-only by scripts/split_closure.js (config scripts/split_configs/navigate_find.json) — edit this file
// normally from now on; regenerate only to re-split a branch that still edits the old single file. Names shared
// across parts live on `NF`; load order + the two-phase setup are in navigate_find.js.
(typeof window !== 'undefined' ? window : globalThis).__navigateFindParts = (typeof window !== 'undefined' ? window : globalThis).__navigateFindParts || {};
(typeof window !== 'undefined' ? window : globalThis).__navigateFindParts.ui_history = function __split_navigate_find_ui_history(NF, A, nav, getStartNavigation) {
  'use strict';
  var style, navHud, elHoverCb, _vhEnabled;   // hoisted to this part, as the single closure hoisted them
  // literal-valued constants, verbatim (evaluating a literal earlier changes nothing)
    // §S265 Phase 5: Search icon (Lucide) + input + mic button in search bar
    var _micSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>';
    var _searchSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>'; // §RP Material sub-toggle: 'material' (default) | 'category'

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
    var _vhCamTimer = null;


    function toggleAccRow(row) {
      [NF.elStoreyRow, NF.elTypeRow].forEach(function(r) { if (r !== row) r.classList.remove('expanded'); });
      NF.panel.classList.remove('results-expanded');
      row.classList.toggle('expanded');
    }

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
        try { NF._highlightLensReset(); NF._roomLensReset(); NF._clearShapeOverlays && NF._clearShapeOverlays();
              if (A.xrayOn && NF._hlXrayWasOff && A.toggleXray) { A.toggleXray(); NF._hlXrayWasOff = false; } }
        catch (e) {} finally { _restoring = false; }
        console.log('§VIEWLOG_RESTORE_NULL cleared lens');
        return;
      }
      _restoring = true;
      try {
        if (v.kind === 'axis') {
          NF._setTreeMode(v.axis);
        } else {
          var d = NF._viewToDrill(v);
          if (d.focus) NF._drillSelect(d.focus, v.label, v.tag, d.opts);
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
    // Replay the view at idx deterministically (no new push), then lerp camera to its pose.
    function _restoreView(idx) {
      if (idx < 0 || idx >= _viewHist.length) return;
      var v = _viewHist[idx];
      _viewIdx = idx;
      _restoring = true;
      try {
        if (v.kind === 'axis') {
          NF._setTreeMode(v.axis);
        } else {
          var d = NF._viewToDrill(v);
          if (d.focus) NF._drillSelect(d.focus, v.label, v.tag, d.opts);
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
      var open = NF.panel && NF.panel.style.display === 'block';
      if (!_vhBar) {
        _vhBar = document.createElement('div');
        _vhBar.id = 'find-viewhist-btns';
        _vhBar.style.cssText = 'position:fixed;bottom:32px;left:16px;z-index:25;display:flex;' +
          'gap:4px;align-items:center';
        var btnStyle = 'background:rgba(30,50,80,0.7);color:#4fc3f7;border:1px solid rgba(255,255,255,0.15);' +
          'border-radius:6px;padding:6px 10px;font-size:16px;cursor:pointer;backdrop-filter:blur(6px);' +
          'min-width:36px;text-align:center';
        _vhBack = document.createElement('button');
        _vhBack.id = 'find-vh-back'; _vhBack.title = _trl('ui_view_back', null, 'View back'); _vhBack.textContent = '↶';
        _vhBack.style.cssText = btnStyle;
        _vhBack.addEventListener('pointerup', function(e) { e.stopPropagation(); _vhBack_fn(); });
        _vhFwd = document.createElement('button');
        _vhFwd.id = 'find-vh-fwd'; _vhFwd.title = _trl('ui_view_forward', null, 'View forward'); _vhFwd.textContent = '↷';
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

  // phase-1 exports: other parts reach these through NF (same function objects)
  NF.toggleAccRow = toggleAccRow;
  NF._pushView = _pushView;
  NF._vhClear = _vhClear;
  NF._vhRender = _vhRender;

  return function () {   // phase 2: this part's setup statements, in original order

    // ── S275: CSS — slim accordion layout ──
    style = document.createElement('style');
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

    NF.panel = document.createElement('div');
    NF.panel.id = 'find-panel';
    NF.panel.className = 'bim-panel';
    NF._t = function(k, fb) { return (typeof _TRL !== 'undefined' && _TRL[k]) || fb; };
    NF.panel.innerHTML = [
      '<span class="bim-panel-close" id="find-close">&times;</span>',
      '<div class="find-search-bar">',
      '  <button id="find-mic-btn" title="' + NF._t('ui_tt_voice', 'Voice search') + '">' + _micSvg + '</button>',
      '  <input type="text" id="find-name" data-trl-placeholder="ui_find_placeholder" placeholder="' + NF._t('ui_find_placeholder', 'Count doors, Total cost…') + '">',
      '</div>',
      '<div id="find-chips"></div>',
      // §HOVER_NAME (HOVER_NAME.md): hidden on touch — no hover on mobile, don't ship a
      // control that silently does nothing there.
      '<div id="find-hover-row" style="display:' + (window._isMobile ? 'none' : 'flex') +
        ';align-items:center;gap:6px;padding:4px 10px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:11px;color:#ccc">',
      '  <input type="checkbox" id="find-hover-name-cb" style="cursor:pointer;margin:0">',
      '  <label for="find-hover-name-cb" style="cursor:pointer;user-select:none">' +
        NF._t('ui_hover_name', 'Hover name') + ' <span style="opacity:0.5">(&#39;)</span></label>',
      '</div>',
      // Hidden selects — still used for data binding
      '<select id="find-type" style="display:none"><option value="">' + NF._t('ui_find_all_types', 'All types') + '</option></select>',
      '<select id="find-storey" style="display:none"><option value="">' + NF._t('ui_all_storeys', 'All Storeys') + '</option></select>',
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
      '  <button id="find-isolate-btn" style="flex:1;padding:5px 8px;font-size:11px;border:1px solid rgba(79,195,247,0.4);border-radius:6px;background:rgba(79,195,247,0.15);color:#4fc3f7;cursor:pointer">\uD83D\uDD0D ' + NF._t('ui_find_isolate', 'Isolate') + '</button>',
      '  <button id="find-showall-btn" style="display:none;flex:1;padding:5px 8px;font-size:11px;border:1px solid rgba(255,255,255,0.2);border-radius:6px;background:rgba(255,255,255,0.08);color:#ccc;cursor:pointer">' + NF._t('ui_find_showall', 'Show all') + '</button>',
      '</div>',
      // S275: Selected item summary + inline navigate button
      // BIM\u2192Project TASK A: indicative 5D cost of the selection (docs/BIMtoProject.md \u00A7A)
      '<div id="find-selected"><span id="find-selected-text"></span><span id="find-selected-cost" title="Indicative 5D cost (active rate pack)"></span><button class="find-nav-inline" id="find-erp-btn" title="Push selection to ERP as a Project Order">\u203A ERP</button><a id="find-erp-open" target="_blank" rel="noopener" title="Open the created Project Order in iDempiere (GardenWorld)">open \u2197</a><a id="find-construction-open" target="_blank" rel="noopener" title="Open this building in iDempiere (Construction)">iDempiere \u2197</a><button class="find-nav-inline" id="find-navigate-btn" title="Navigate">\u25B6</button></div>',
      '<div id="find-results"></div>',
    ].join('');
    document.body.appendChild(NF.panel);
    // FIND_ASK_ANSWERS.md §D — Ask mode (find_ask.js, loaded just before this file in main.js)
    if (window.FindAsk && window.FindAsk.mount) { try { window.FindAsk.mount(A, NF.panel); } catch (eAsk) { console.warn('§ASK_MOUNT_ERR ' + eAsk.message); } }
    // §FIND_VIS_TRACE (diagnostic, 2026-07-06): a "Find box appears on its own at onset" bug
    // has been reported but not reproduced synthetically (cold load / simulated back-forward
    // both stayed hidden). Log a stack trace every time this panel's visibility flips, so the
    // NEXT real occurrence in the field pins down who/what set display=block.
    (function () {
      var _lastVis = NF.panel.style.display === 'block';
      new MutationObserver(function () {
        var vis = NF.panel.style.display === 'block';
        if (vis === _lastVis) return;
        _lastVis = vis;
        console.log('§FIND_VIS_TRACE display=' + NF.panel.style.display + ' at=' + Date.now() +
          '\n' + (new Error().stack));
      }).observe(NF.panel, { attributes: true, attributeFilter: ['style'] });
    })();
    // S265 Phase 5: make Find panel draggable — with a GENEROUS top grab-zone (user: the thin
    // default strip was "hard to drag, give me more margin to hold onto"). Taps inside still work.
    NF.panel._dragStrip = window._isMobile ? 96 : 64;  // ~2× the default 50/30
    if (A._makeDraggable) A._makeDraggable(NF.panel);
    // Pointer isolation
    NF.panel.addEventListener('pointerdown', function(e) { e.stopPropagation(); });

    // Nav HUD elements
    navHud = document.createElement('div');
    navHud.id = 'nav-hud';
    navHud.style.display = 'none';
    navHud.innerHTML = '<div id="nav-direction-cue"><span class="cue-icon"></span><div class="cue-label"></div></div>' +
      '<div id="nav-bottom-bar"></div>';
    document.body.appendChild(navHud);

    NF.elType = document.getElementById('find-type');
    NF.elStorey = document.getElementById('find-storey');
    NF.elName = document.getElementById('find-name');
    NF.elResults = document.getElementById('find-results');
    NF.elCount = document.getElementById('find-count');
    NF.elNavBtn = document.getElementById('find-navigate-btn');
    NF.elErpBtn = document.getElementById('find-erp-btn');   // BIM→Project TASK C: > to ERP push
    NF.elErpOpen = document.getElementById('find-erp-open'); // BIM→Project: deep-link to the created record
    NF.elConstructionOpen = document.getElementById('find-construction-open'); // §2026-07-04 A: Room/storey → Construction window
    NF._lastSelSet = null, NF._lastSelLabel = '';               // current selection, for the ERP push
    NF.elClose = document.getElementById('find-close');
    NF.elChips = document.getElementById('find-chips');
    // §HOVER_NAME: checkbox and the ' key drive ONE state — checkbox side of that contract.
    elHoverCb = document.getElementById('find-hover-name-cb');
    if (elHoverCb) {
      elHoverCb.addEventListener('change', function() {
        if (A.toggleHoverName) A.toggleHoverName('checkbox', elHoverCb.checked);
      });
    }
    NF.elMicBtn = document.getElementById('find-mic-btn');
    NF.elSelected = document.getElementById('find-selected');
    // §RevitParity A1: isolate controls
    NF.elIsoBar = document.getElementById('find-isolate-bar');
    NF.elIsoBtn = document.getElementById('find-isolate-btn');
    NF.elShowAllBtn = document.getElementById('find-showall-btn');

    // ── S275: Accordion row logic ──
    NF.elStoreyRow = document.getElementById('find-storey-row');
    NF.elStoreyHdr = document.getElementById('find-storey-hdr');
    NF.elStoreyBody = document.getElementById('find-storey-body');
    NF.elTypeRow = document.getElementById('find-type-row');
    NF.elTypeHdr = document.getElementById('find-type-hdr');
    NF.elTypeBody = document.getElementById('find-type-body');

    // §S280: Outliner tree — Storey/Disc toggle
    NF.elTree = document.getElementById('find-tree');
    // §FIND-GRIP: explicit drag-to-resize (pointer events → mouse + touch). setProperty important so it
    // beats the mobile media-query; persisted across sessions.
    NF.elTreeGrip = document.getElementById('find-tree-grip');
    if (NF.elTree && NF.elTreeGrip) {
      var _gY = 0, _gH = 0, _gripping = false;
      NF.elTreeGrip.addEventListener('pointerdown', function(e) {
        _gripping = true; _gY = e.clientY; _gH = NF.elTree.getBoundingClientRect().height;
        try { NF.elTreeGrip.setPointerCapture(e.pointerId); } catch (x) {}
        e.preventDefault();
      });
      NF.elTreeGrip.addEventListener('pointermove', function(e) {
        if (!_gripping) return;
        var h = Math.max(90, Math.min(window.innerHeight * 0.85, _gH + (e.clientY - _gY)));
        NF.elTree.style.setProperty('height', h + 'px', 'important');
        e.preventDefault();
      });
      var _gripEnd = function(e) {
        if (!_gripping) return; _gripping = false;
        try { NF.elTreeGrip.releasePointerCapture(e.pointerId); } catch (x) {}
        try { localStorage.setItem('findTreeH', NF.elTree.style.height); } catch (x) {}
        console.log('§FIND_GRIP resized h=' + NF.elTree.style.height);
      };
      NF.elTreeGrip.addEventListener('pointerup', _gripEnd);
      NF.elTreeGrip.addEventListener('pointercancel', _gripEnd);
      try { var _sh = localStorage.getItem('findTreeH'); if (_sh) NF.elTree.style.setProperty('height', _sh, 'important'); } catch (x) {}
    }
    // §FOCUS-ALL-DEPTHS: mark the last-clicked row at ANY level (storey/type/item) with the yellow band.
    // Capture phase so it fires even when inner row handlers stopPropagation. Single-focus (clear others).
    if (NF.elTree) {
      NF.elTree.addEventListener('pointerup', function(e) {
        var t = e.target, row = t && t.closest ? t.closest('.find-tree-row') : null;
        if (!row || !NF.elTree.contains(row)) return;
        NF.elTree.querySelectorAll('.find-tree-row.row-focus').forEach(function(r) { r.classList.remove('row-focus'); });
        row.classList.add('row-focus');
      }, true);
    }
    NF.elAxisBar = document.getElementById('find-outliner-bar');
    NF._treeMode = 'storey'; // 'storey' | 'disc' | 'room' | 'material' | 'phase'
    NF._treeRevealed = false; // §S280d: tree hidden until mode toggle pressed
    NF._roomGroupBy = 'storey'; // §RP Room sub-toggle: 'storey' (default) | 'type'
    NF._matGroupBy = 'material';
    _vhEnabled = (function() {
      try { return localStorage.getItem(VH_KEY) !== 'off'; } catch(e) { return true; } // default ON
    })();
    // §UHIST: register HOW the universal timeline restores a Find view moment.
    if (window.UniversalHistory && UniversalHistory.registerViewRestore) {
      UniversalHistory.registerViewRestore(_replayViewObj);
    }

    // §NAV_FIND_002: multi-select state (parent rows only). Plain=replace,
    // Ctrl/Cmd=toggle, Shift=range. Sets cleared only on Storey/Disc toggle.
    NF._selStoreys = new Set();
    NF._selDiscs = new Set();
    NF._anchor = null;
  };
};
