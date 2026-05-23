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

    // ── S265 Phase 5: CSS injection — uses .bim-panel base, find-specific overrides ──
    var style = document.createElement('style');
    style.textContent = [
      '#find-panel { top: 50%; right: 70px; transform: translateY(-50%);',
      '  width: 320px; max-width: 40vw; padding: 0; max-height: 70vh; overflow: hidden; }',
      '#find-panel .find-search-bar {',
      '  display: flex; align-items: center; gap: 6px; padding: 10px 14px 8px;',
      '  border-bottom: 1px solid rgba(255,255,255,0.08);',
      '}',
      '#find-panel .find-search-bar button { background: none; border: none; color: #888;',
      '  cursor: pointer; padding: 4px; flex-shrink: 0; display: flex; align-items: center; }',
      '#find-panel .find-search-bar button:hover { color: #4fc3f7; }',
      '#find-panel .find-search-bar button.listening { color: #f44336; }',
      '#find-panel .find-search-bar button svg { width: 18px; height: 18px; pointer-events: none; }',
      '#find-panel #find-name {',
      '  flex: 1; border: none; background: transparent; color: #e0e0e0;',
      '  font-size: 14px; outline: none; padding: 4px 0;',
      '  font-family: system-ui, sans-serif;',
      '}',
      '#find-panel #find-name::placeholder { color: rgba(255,255,255,0.25); }',
      '#find-panel .find-filters {',
      '  display: flex; gap: 6px; padding: 6px 14px;',
      '  border-bottom: 1px solid rgba(255,255,255,0.06);',
      '}',
      '#find-panel select {',
      '  flex: 1; padding: 5px 6px; background: rgba(0,0,0,0.3); color: #ccc;',
      '  border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; font-size: 11px;',
      '}',
      '#find-panel select option { background: #1a1a2e; color: #ccc; }',
      '#find-results { max-height: 280px; overflow-y: auto; }',
      '.find-result-item {',
      '  padding: 7px 14px; cursor: pointer;',
      '  border-bottom: 1px solid rgba(255,255,255,0.04);',
      '  transition: background 0.1s; font-size: 12px; display: flex; align-items: center; gap: 8px;',
      '}',
      '.find-result-item:hover { background: rgba(79,195,247,0.1); }',
      '.find-result-item.active { background: rgba(79,195,247,0.18); }',
      '.find-result-item .ri-icon { font-size: 13px; opacity: 0.4; flex-shrink: 0; }',
      '.find-result-item .ri-body { flex: 1; min-width: 0; }',
      '.find-result-item .ri-name { color: #e0e0e0; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '.find-result-item .ri-meta { color: #888; font-size: 10px; }',
      '#find-actions { padding: 8px 14px; display: flex; gap: 8px; border-top: 1px solid rgba(255,255,255,0.08); }',
      '#find-actions button { flex: 1; padding: 7px 0; border-radius: 8px; border: none; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.15s; }',
      '.find-nav-btn { background: rgba(79,195,247,0.2); color: #4fc3f7; }',
      '.find-nav-btn:hover { background: rgba(79,195,247,0.35); }',
      '#find-count { font-size: 10px; color: #666; padding: 3px 14px 1px; }',
      '#find-chips { display: flex; gap: 4px; padding: 4px 14px 6px; flex-wrap: wrap; }',
      '#find-chips button { background: rgba(255,255,255,0.06); color: #888; border: 1px solid rgba(255,255,255,0.08);',
      '  border-radius: 10px; padding: 2px 8px; font-size: 10px; cursor: pointer; white-space: nowrap; }',
      '#find-chips button:hover { color: #4fc3f7; border-color: rgba(79,195,247,0.3); }',
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
      '  #find-panel { right: 8px; left: 8px; max-width: none; width: auto; top: auto; bottom: 60px; transform: none; }',
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
      '  <button id="find-search-icon" title="Search">' + _searchSvg + '</button>',
      '  <input type="text" id="find-name" data-trl-placeholder="ui_find_placeholder" placeholder="' + _t('ui_find_placeholder', 'Search or ask: count doors, find pump...') + '">',
      '  <button id="find-mic-btn" title="' + _t('ui_tt_voice', 'Voice search') + '">' + _micSvg + '</button>',
      '</div>',
      '<div id="find-chips"></div>',
      '<div class="find-filters">',
      '  <select id="find-type"><option value="">' + _t('ui_find_all_types', 'All types') + '</option></select>',
      '  <select id="find-storey"><option value="">' + _t('ui_all_storeys', 'All Storeys') + '</option></select>',
      '</div>',
      '<div id="find-count"></div>',
      '<div id="find-results"></div>',
      '<div id="find-actions">',
      '  <button class="find-nav-btn" id="find-navigate-btn" data-action="navigate">' + _t('ui_find_navigate', '\u25B6 Navigate') + '</button>',
      '</div>',
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

    // ── S265 Phase 5: Voice mic inside Find panel ──
    var _SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var _recognition = null, _listening = false;
    if (_SR && elMicBtn) {
      elMicBtn.addEventListener('pointerup', function(e) {
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
              _handleInput(t);
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
      elMicBtn.style.display = 'none'; // no Web Speech API
    }

    // ── S265 Phase 5: Dual-purpose input — NLP queries vs element search ──
    // If input matches NLP pattern (count/cost/show/total), run NLP. Otherwise, element search.
    var _nlpRe = /^(count|how many|number of|total|cost|show|list|what|find|search)\b/i;
    function _handleInput(text) {
      var trimmed = (text || '').trim();
      if (!trimmed) { runSearch(); return; }
      // NLP query detection
      if (_nlpRe.test(trimmed) && A._nlpExecute) {
        A._nlpExecute(trimmed);
        // If NLP handled it (e.g. "find pump" opens this same panel), don't double-search
        return;
      }
      // Regular element search
      populateDropdowns();
      runSearch();
    }

    // ── S265 Phase 5: Context-aware chips from current building ──
    function buildChips() {
      if (!elChips || !A.db) return;
      elChips.innerHTML = '';
      var bld = A.activeBuilding || '';
      try {
        // Top 4 IFC classes by count
        var sql = 'SELECT ifc_class, COUNT(*) as cnt FROM elements_meta' +
          (bld ? ' WHERE building = ?' : '') + ' GROUP BY ifc_class ORDER BY cnt DESC LIMIT 4';
        var rows = A.db.exec(sql, bld ? [bld] : []);
        if (rows.length > 0) {
          rows[0].values.forEach(function(r) {
            var chip = document.createElement('button');
            chip.textContent = friendlyClass(r[0]);
            chip.addEventListener('pointerup', function(e) {
              e.stopPropagation();
              elType.value = r[0];
              populateDropdowns();
              runSearch();
            });
            elChips.appendChild(chip);
          });
        }
        // NLP quick-actions
        ['count doors', 'total cost'].forEach(function(ex) {
          var chip = document.createElement('button');
          chip.textContent = ex;
          chip.style.color = '#4fc3f7';
          chip.addEventListener('pointerup', function(e) {
            e.stopPropagation();
            elName.value = ex;
            _handleInput(ex);
          });
          elChips.appendChild(chip);
        });
      } catch (e) { /* ignore */ }
    }

    // ── Open find panel (called from pill, nlp.js, or directly) ──
    A.openFindPanel = function(searchTerm) {
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
      clearHighlight();
      // Set search term and open
      panel.style.display = 'block';
      elName.value = searchTerm || '';
      populateDropdowns();
      buildChips();
      if (searchTerm) { _handleInput(searchTerm); } else { runSearch(); }
      console.log('[S233] §NAV_FIND_OPEN term="' + (searchTerm || '') + '" voice=' + nav.voiceMode);
    };

    function closeFindPanel() {
      panel.style.display = 'none';
      if (nav.active) { if (A.stopNavigation) A.stopNavigation(); }
      clearHighlight();
      console.log('[S233] §FIND_CLOSE');
    }
    A.closeFindPanel = closeFindPanel; // exposed for nlp.js bar close
    elClose.onclick = closeFindPanel;
    // §S265: Tap outside find panel to close (mobile UX)
    document.addEventListener('pointerup', function(e) {
      if (panel.style.display === 'none') return;
      if (panel.contains(e.target)) return;
      // Don't close if tapping the Find pill button itself (it toggles)
      if (e.target.closest && e.target.closest('[title="Find"]')) return;
      closeFindPanel();
    });

    // ── Populate dropdowns — show all types/storeys, with match counts when searching ──
    function populateDropdowns() {
      if (!A.db) return;
      var bld = A.activeBuilding || '';
      var name = elName.value.trim();
      var savedType = elType.value;
      var savedStorey = elStorey.value;
      try {
        // Get match counts per type (only if there's a search term)
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

        // S275: Types filtered by selected storey (cross-filter)
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
          // Sort: types with matches first, then the rest
          var sorted = types[0].values.slice().sort(function(a, b) {
            var ma = matchByType[a[0]] || 0, mb = matchByType[b[0]] || 0;
            if (mb !== ma) return mb - ma; // matches first
            return b[1] - a[1]; // then by total count
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

        // Get match counts per storey
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

        // All storeys, sorted by elevation
        var storeySql = 'SELECT m.storey, COUNT(*) as cnt FROM elements_meta m' +
          ' JOIN element_transforms t ON m.guid = t.guid' +
          ' WHERE m.storey IS NOT NULL' + (bld ? ' AND m.building = ?' : '') +
          ' GROUP BY m.storey ORDER BY MIN(t.center_z)';
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
      } catch(e) { console.warn('[S233] dropdown error', e); }
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
        // Auto-select first result so Navigate works immediately after filter change
        if (nav.activeIdx < 0) selectResult(0);
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
      // Show navigate hint if results exist
      if (nav.results.length > 0) {
        elNavBtn.style.display = '';
        elNavBtn.textContent = typeof _TRL!=='undefined'&&_TRL.ui_find_navigate_sel||'\u25B6 Navigate to selected';
      }
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

      // S275: IFC bbox highlight from DB (same as picking.js — works for merged/batched)
      highlightElement(r.guid);

      // S275: Show standard IFC info panel (same as picking.js pointerup)
      showInfoPanel(r.guid);

      // S275: Fly camera to element — preserve viewing direction, just re-target
      var pos = A.ifc2three(r.cx, r.cy, r.cz);
      var center = new THREE.Vector3(pos.x, pos.y, pos.z);
      var dist = 5;
      try {
        var bboxRows = A.dbQuery(
          'SELECT bbox_x, bbox_y, bbox_z FROM element_transforms WHERE guid = ?', [r.guid]);
        if (bboxRows.length && bboxRows[0][0] != null) {
          dist = Math.max(bboxRows[0][0], bboxRows[0][1], bboxRows[0][2]) * 2 + 1;
        }
      } catch(e) { /* use default dist */ }
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

      // Update navigate button
      elNavBtn.textContent = typeof _TRL!=='undefined'&&_TRL.ui_find_navigate||'\u25B6 Navigate';
      elNavBtn.style.display = '';

      // Status feedback
      var dispName = friendlyName(r.element_name, r.ifc_class);
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
        new THREE.LineBasicMaterial({ color: 0xffff00, depthTest: false }));
      hlMesh.renderOrder = 999;
      hlMesh.position.copy(hlPos);
      A.scene.add(hlMesh);
      _highlight = hlMesh;
      window._pickHighlight = hlMesh; // share with picking.js so next pick clears it
      if (A.markDirty) A.markDirty();

      // Pulse animation — blink the highlight for visibility
      clearInterval(_highlightPulse);
      var vis = true;
      _highlightPulse = setInterval(function() {
        if (!_highlight) { clearInterval(_highlightPulse); return; }
        vis = !vis;
        _highlight.visible = vis;
        if (A.markDirty) A.markDirty();
      }, 400);
      // Stop pulsing after 6s — stay visible
      setTimeout(function() {
        clearInterval(_highlightPulse);
        if (_highlight) _highlight.visible = true;
        if (A.markDirty) A.markDirty();
      }, 6000);

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
    // Enter key triggers immediate search/NLP
    elName.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); _handleInput(elName.value); }
      if (e.key === 'Escape') { closeFindPanel(); }
    });

    function debounce(fn, ms) {
      var t; return function() { clearTimeout(t); t = setTimeout(fn, ms); };
    }

    // ── Wire navigate button — calls startNavigation from navigate.js ──
    elNavBtn.onclick = function() {
      if (nav.activeIdx < 0 && nav.results.length > 0) nav.activeIdx = 0;
      if (nav.activeIdx < 0) return;
      var startNav = getStartNavigation();
      if (startNav) startNav(nav.results[nav.activeIdx]);
    };

    // ── Expose for navigate.js Section D and external callers ──
    A.clearHighlight = clearHighlight;
    A.highlightElement = highlightElement; // called by startNavigation in navigate.js
    A.findMainEntrance = findMainEntrance; // called by startNavigation in navigate.js
    A.friendlyName = friendlyName;         // called by startNavigation (nav.targetName)

    console.log('[S233] §NAV_FIND_MODULE_LOADED panel=' + !!document.getElementById('find-panel'));
  }

  window.NavigateFind = { init: init };
})();
