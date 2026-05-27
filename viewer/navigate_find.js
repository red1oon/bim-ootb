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
      '<div id="find-outliner-bar" style="display:flex;justify-content:center;padding:4px 10px;border-bottom:1px solid rgba(255,255,255,0.06)">',
      '  <button id="find-mode-toggle" style="padding:6px 16px;font-size:12px;font-weight:700;border:1px solid rgba(79,195,247,0.4);border-radius:6px;background:rgba(79,195,247,0.2);color:#4fc3f7;cursor:pointer;letter-spacing:0.5px;min-width:120px">Storey</button>',
      '</div>',
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
      // S275: Selected item summary + inline navigate button
      '<div id="find-selected"><span id="find-selected-text"></span><button class="find-nav-inline" id="find-navigate-btn" title="Navigate">\u25B6</button></div>',
      '<div id="find-results"></div>',
    ].join('');
    document.body.appendChild(panel);
    // S265 Phase 5: make Find panel draggable
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
    var elModeToggle = document.getElementById('find-mode-toggle');
    var _treeMode = 'storey'; // 'storey' or 'disc'
    var _treeRevealed = false; // §S280d: tree hidden until mode toggle pressed

    // §S280: Audio thump — short click on mode toggle (lightweight, no file load)
    var _audioCtx = null;
    function _thump() {
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

    function _setTreeMode(mode) {
      _treeMode = mode;
      if (elModeToggle) elModeToggle.textContent = mode === 'storey' ? 'Storey' : 'Discipline';
      // §S280d: Restore full scene visibility on toggle — reset both filters
      if (A.filterStorey) A.filterStorey(null);
      if (A.filterDisc) A.filterDisc(null);
      _thump();
      // §S280d: Reveal tree on first toggle press
      if (!_treeRevealed && elTree) { elTree.style.display = ''; _treeRevealed = true; }
      buildTree();
      console.log('§FIND_MODE_TOGGLE mode=' + mode);
    }
    if (elModeToggle) elModeToggle.addEventListener('pointerup', function(e) {
      e.stopPropagation();
      _setTreeMode(_treeMode === 'storey' ? 'disc' : 'storey');
    });

    function buildTree() {
      if (!elTree || !A.db) return;
      var bld = A.activeBuilding || '';
      var filter = elName.value.trim().toLowerCase();
      elTree.innerHTML = '';
      try {
        if (_treeMode === 'storey') _buildStoreyTree(bld, filter);
        else _buildDiscTree(bld, filter);
      } catch(e) { console.warn('§FIND_TREE error', e); }
    }

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
      // Click on label/badge = sticky filter (switching storeys replaces, no toggle-off)
      function _doTap(e) {
        e.stopPropagation();
        if (isParent && row.parentNode) {
          // Deselect all siblings
          row.parentNode.querySelectorAll('[data-active]').forEach(function(el) {
            el.removeAttribute('data-active');
            el.style.background = 'linear-gradient(180deg,rgba(255,255,255,0.06) 0%,rgba(255,255,255,0.02) 100%)';
            el.style.borderLeftColor = 'rgba(79,195,247,0.3)';
            el.querySelector('span:nth-child(2)').style.color = '#ddd';
          });
          row.setAttribute('data-active', '1');
          row.style.background = 'linear-gradient(180deg,rgba(79,195,247,0.2) 0%,rgba(79,195,247,0.08) 100%)';
          row.style.borderLeftColor = '#4fc3f7';
          text.style.color = '#4fc3f7';
        }
        if (opts.onTap) opts.onTap();
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
          onTap: function() {
            // §S280b: Storey tap = instant 3D filter. Sticky — close panel restores.
            if (A.filterStorey) A.filterStorey(storey);
          },
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
                  container.appendChild(_treeNode(friendlyClass(tp[0]), tp[1], 1, {
                    onTap: function() { elStorey.value = storey; elType.value = tp[0]; runSearch(); }
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
          onTap: function() {
            // §S280d: Disc tap = show only this discipline (like storey). Sticky — close restores.
            if (A.filterDisc) A.filterDisc(disc);
          },
          onExpand: function(container) {
            if (container._loaded) return;
            container._loaded = true;
            var typeSql = 'SELECT ifc_class, COUNT(*) as cnt FROM elements_meta' +
              ' WHERE discipline = ?' + (bld ? ' AND building = ?' : '') +
              ' GROUP BY ifc_class ORDER BY cnt DESC';
            var types = A.db.exec(typeSql, bld ? [disc, bld] : [disc]);
            if (types.length) {
              types[0].values.forEach(function(tp) {
                container.appendChild(_treeNode(friendlyClass(tp[0]), tp[1], 1, {
                  onTap: function() { elType.value = tp[0]; elStorey.value = ''; runSearch(); }
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
          // Enter/chip/voice → fire NLP
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
      // Set search term and open
      panel.style.display = 'block';
      elName.value = searchTerm || '';
      // §S281: Defer item queries — only build tree (fast GROUP BY) on open.
      // populateDropdowns + runSearch only when user clicks a type/storey or types a search.
      buildTree();
      buildChips();
      if (searchTerm) { _handleInput(searchTerm, true); }
      // No runSearch() on empty open — saves seconds of load time
      // S275: Auto-focus — panel system + input
      if (typeof window._focusPanel === 'function') window._focusPanel('find');
      // §S280: Mobile — don't steal focus (triggers virtual keyboard). User taps searchbox when ready.
      if (!window._isMobile) elName.focus();
      console.log('[S233] §NAV_FIND_OPEN term="' + (searchTerm || '') + '" voice=' + nav.voiceMode);
    };

    function closeFindPanel() {
      panel.style.display = 'none';
      if (nav.active) { if (A.stopNavigation) A.stopNavigation(); }
      clearHighlight();
      // §S280d: Restore full scene — clear storey + disc filters
      if (A.filterStorey) A.filterStorey(null);
      if (A.filterDisc) A.filterDisc(null);
      // §S280d: Reset tree visibility for next open
      _treeRevealed = false;
      if (elTree) elTree.style.display = 'none';
      // S275: Release panel focus so other panels (Clash, etc.) work
      if (typeof window._blurPanel === 'function') window._blurPanel();
      console.log('[S233] §FIND_CLOSE restored=full');
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
      // Arrow Up/Down — navigate results list
      if (e.key === 'ArrowDown' && nav.results.length > 0) {
        e.preventDefault();
        var next = nav.activeIdx < 0 ? 0 : Math.min(nav.activeIdx + 1, nav.results.length - 1);
        nav.activeIdx = next;
        var items = elResults.querySelectorAll('.find-result-item');
        items.forEach(function(el, i) { el.classList.toggle('active', i === next); });
        if (items[next]) items[next].scrollIntoView({ block: 'nearest' });
        // Show results if collapsed
        panel.classList.add('results-expanded');
        elSelected.style.display = 'none';
        return;
      }
      if (e.key === 'ArrowUp' && nav.results.length > 0) {
        e.preventDefault();
        var prev = nav.activeIdx <= 0 ? 0 : nav.activeIdx - 1;
        nav.activeIdx = prev;
        var items2 = elResults.querySelectorAll('.find-result-item');
        items2.forEach(function(el, i) { el.classList.toggle('active', i === prev); });
        if (items2[prev]) items2[prev].scrollIntoView({ block: 'nearest' });
        panel.classList.add('results-expanded');
        elSelected.style.display = 'none';
        return;
      }
      // Tab/Left/Right handled at panel level
    });
    // Make accordion headers focusable
    elStoreyHdr.tabIndex = 0;
    elTypeHdr.tabIndex = 0;
    elStoreyHdr.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleAccRow(elStoreyRow); }
      if (e.key === 'Escape') closeFindPanel();
    });
    elTypeHdr.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleAccRow(elTypeRow); }
      if (e.key === 'Escape') closeFindPanel();
    });

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

    // S275: Panel-level Left/Right/Up/Down/Tab navigation between interactive elements
    // Focusable cycle: search → storey → type → (navigate if visible)
    var _focusCycle = function() {
      var items = [elName, elStoreyHdr, elTypeHdr];
      var navBtn = document.getElementById('find-navigate-btn');
      if (navBtn && elSelected.style.display !== 'none') items.push(navBtn);
      return items;
    };
    // S275: Register Find panel with global keyboard nav system
    // Custom onKey wraps makeListKeyNav for Up/Down results + Left/Right focus cycle
    if (typeof window.makeListKeyNav === 'function' && typeof window._registerPanel === 'function') {
      var _resultNav = window.makeListKeyNav(
        function() {
          var items = [];
          elResults.querySelectorAll('.find-result-item').forEach(function(el) { items.push(el); });
          return items;
        },
        function() {},
        function(idx) {
          var items = [];
          elResults.querySelectorAll('.find-result-item').forEach(function(el) { items.push(el); });
          if (items[idx]) items[idx].click();
        }
      );
      var _findNav = {
        onKey: function(e) {
          // Left/Right: cycle focus between search → storey → type → navigate
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            var cycle = _focusCycle();
            var cur = cycle.indexOf(document.activeElement);
            if (cur < 0) cur = 0;
            var next = e.key === 'ArrowRight' ? (cur + 1) % cycle.length : (cur - 1 + cycle.length) % cycle.length;
            cycle[next].focus();
            cycle.forEach(function(el, i) {
              el.style.outline = (i === next) ? '2px solid #4fc3f7' : '';
              el.style.background = (i === next) ? 'rgba(79,195,247,0.2)' : '';
            });
            console.log('§FIND_NAV ' + e.key + ' → ' + next + '/' + cycle.length + ' el=' + (cycle[next].id || cycle[next].tagName));
            return;
          }
          // Enter/Space on accordion header: select highlighted item, or toggle expand/collapse
          if (e.key === 'Enter' || e.key === ' ') {
            if (document.activeElement === elStoreyHdr) {
              var activeS = elStoreyBody.querySelector('.find-acc-item.active');
              if (activeS && elStoreyRow.classList.contains('expanded')) { activeS.click(); return; }
              toggleAccRow(elStoreyRow); return;
            }
            if (document.activeElement === elTypeHdr) {
              var activeT = elTypeBody.querySelector('.find-acc-item.active');
              if (activeT && elTypeRow.classList.contains('expanded')) { activeT.click(); return; }
              toggleAccRow(elTypeRow); return;
            }
          }
          // Up/Down on storey header: expand and navigate storey items
          if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && document.activeElement === elStoreyHdr) {
            if (!elStoreyRow.classList.contains('expanded')) toggleAccRow(elStoreyRow);
            var items = elStoreyBody.querySelectorAll('.find-acc-item');
            if (!items.length) return;
            var active = elStoreyBody.querySelector('.find-acc-item.active');
            var idx = active ? Array.from(items).indexOf(active) : -1;
            var next = e.key === 'ArrowDown' ? Math.min(idx + 1, items.length - 1) : Math.max(idx - 1, 0);
            items.forEach(function(el, i) { el.classList.toggle('active', i === next); });
            items[next].scrollIntoView({ block: 'nearest' });
            console.log('§FIND_NAV storey ' + e.key + ' → ' + next + '/' + items.length);
            return;
          }
          // Up/Down on type header: expand and navigate type items
          if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && document.activeElement === elTypeHdr) {
            if (!elTypeRow.classList.contains('expanded')) toggleAccRow(elTypeRow);
            var items2 = elTypeBody.querySelectorAll('.find-acc-item');
            if (!items2.length) return;
            var active2 = elTypeBody.querySelector('.find-acc-item.active');
            var idx2 = active2 ? Array.from(items2).indexOf(active2) : -1;
            var next2 = e.key === 'ArrowDown' ? Math.min(idx2 + 1, items2.length - 1) : Math.max(idx2 - 1, 0);
            items2.forEach(function(el, i) { el.classList.toggle('active', i === next2); });
            items2[next2].scrollIntoView({ block: 'nearest' });
            console.log('§FIND_NAV type ' + e.key + ' → ' + next2 + '/' + items2.length);
            return;
          }
          // Enter on highlighted accordion item: select it
          if (e.key === 'Enter') {
            var activeStorey = elStoreyBody.querySelector('.find-acc-item.active');
            if (activeStorey && elStoreyRow.classList.contains('expanded')) { activeStorey.click(); return; }
            var activeType = elTypeBody.querySelector('.find-acc-item.active');
            if (activeType && elTypeRow.classList.contains('expanded')) { activeType.click(); return; }
          }
          // Up/Down on search input: delegate to result list nav
          _resultNav.onKey(e);
        }
      };
      window._registerPanel('find', panel, _findNav, closeFindPanel);
      console.log('§LISTNAV_WIRE panel=find');
    }

    console.log('[S233] §NAV_FIND_MODULE_LOADED panel=' + !!document.getElementById('find-panel'));
  }

  window.NavigateFind = { init: init };
})();
