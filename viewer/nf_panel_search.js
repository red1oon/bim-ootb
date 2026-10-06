// navigate_find family — part `panel_search` (original navigate_find.js lines 4237–5287).
// GENERATED move-only by scripts/split_closure.js (config scripts/split_configs/navigate_find.json) — edit this file
// normally from now on; regenerate only to re-split a branch that still edits the old single file. Names shared
// across parts live on `NF`; load order + the two-phase setup are in navigate_find.js.
(typeof window !== 'undefined' ? window : globalThis).__navigateFindParts = (typeof window !== 'undefined' ? window : globalThis).__navigateFindParts || {};
(typeof window !== 'undefined' ? window : globalThis).__navigateFindParts.panel_search = function __split_navigate_find_panel_search(NF, A, nav, getStartNavigation) {
  'use strict';
  // literal-valued constants, verbatim (evaluating a literal earlier changes nothing)
    // §S275 (user): tap OUTSIDE the Find panel must NOT close it — only Esc or the × button do.
    // The outside-tap-to-close handler was removed; the panel stays put while you click the model.

    // ── Populate dropdowns — show all types/storeys, with match counts when searching ──
    // §S280: Two-phase dropdowns — storeys appear instantly, types load in background
    var _typesTimer = 0;

    // §OUTLINER_TAXONOMY_REDESIGN.md §2 Layer 1: DISPLAY-ONLY word mapping for the raw discipline
    // CODE stored in elements_meta.discipline (ACMV/ELEC/PLB/FP/MEP/STR/ARC). Every filter/query/
    // A.filterDisc still runs on the raw code — this only swaps the rendered text. Fixed list, no
    // invented mapping for a code outside it (unmapped code falls back to itself, never blank).
    var DISC_LABELS = {
      ACMV: 'Air-Conditioning', ELEC: 'Electrical', PLB: 'Plumbing', PLMB: 'Plumbing',
      FP: 'Fire Protection', STR: 'Structure', ARC: 'Architecture', MEP: 'Mechanical & Electrical'
    };

    // ── Highlight element (yellow IFC bbox from DB — same as picking.js) ──
    var _highlight = null;
    var _highlightPulse = null;
    var _flyAnim = null;

    function _handleInput(text, explicit) {
      // FIND_ASK_ANSWERS.md §D — while Ask is active, typed/voice/chip text drives the Ask catalog
      if (A.askIsActive && A.askIsActive()) { A.askInput((text || '').trim(), explicit); return; }
      var trimmed = (text || '').trim();
      if (!trimmed) { NF.elResults.innerHTML = ''; NF.elCount.textContent = ''; return; }
      // NLP query detection
      if (NF._nlpRe.test(trimmed) && A._nlpExecute) {
        if (explicit) {
          A._nlpExecute(trimmed);
          return;
        }
        // Live typing of NLP phrase → show hint, don't run element search
        NF.elResults.innerHTML = '<div style="color:#4fc3f7;font-size:11px;padding:8px 10px;opacity:0.7">Press Enter \u21B5</div>';
        NF.elCount.textContent = '';
        return;
      }
      // Regular element search
      populateDropdowns();
      NF.buildTree();
      runSearch();
    }

    // §S281: Three diverse hint chips — NLP examples only, no DB query
    function buildChips() {
      if (!NF.elChips) return;
      NF.elChips.innerHTML = '';
      try {
        ['count doors', 'total cost', 'show structure'].forEach(function(ex) {
          var chip = document.createElement('button');
          chip.textContent = ex;
          chip.addEventListener('pointerup', function(e) {
            e.stopPropagation();
            NF.elName.value = ex;
            _handleInput(ex, true);
          });
          NF.elChips.appendChild(chip);
        });
      } catch (e) { /* ignore */ }
    }

    function closeFindPanel() {
      NF.panel.style.display = 'none';
      if (nav.active) { if (A.stopNavigation) A.stopNavigation(); }
      clearHighlight();
      // §NAV_FIND_002: exit KEEPS the storey/disc + guid filter applied. Only the
      // axis pills restore full scene. (was: filterStorey/Disc(null))
      // §RP Task A/B: but lens OVERLAYS (room boxes, lens x-ray, outline) are visual
      // cruft — always tear them down on close so nothing lingers invisibly.
      NF._roomLensReset();
      NF._highlightLensReset();
      // §REVEAL-LEAK-ON-EXIT (2026-07-26, user-reported live testing): same gap as openFindPanel's
      // fresh-open reset above — _roomLensReset() never touches _revealDoorMeshes (category-reveal
      // brown doors) or _pathExtraMeshes (Path sub-mode line+markers), both separate arrays. Without
      // this they survive closeFindPanel() and leak into the scene after the panel is gone.
      NF._clearCategoryReveal();
      NF._clearPathHighlight();
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
      if (NF.elIsoBar) NF.elIsoBar.style.display = 'none';
      // §S280d: Reset tree visibility for next open
      NF._treeRevealed = false;
      if (NF.elTree) NF.elTree.style.display = 'none';
      // S275: Release panel focus so other panels (Clash, etc.) work
      if (typeof window._blurPanel === 'function') window._blurPanel();
      var _kept = Array.from(NF._treeMode === 'storey' ? NF._selStoreys : NF._selDiscs);
      // §VIEWLOG: tear down the view-history with the panel (sibling layer, read-only).
      NF._vhClear();
      NF._vhRender();
      console.log('[S233] §FIND_CLOSE restored=none kept=[' + _kept.join(',') + ']');
    }

    function populateDropdowns() {
      if (!A.db) return;
      var bld = NF._scopeBld();
      var name = NF.elName.value.trim();
      var savedType = NF.elType.value;
      var savedStorey = NF.elStorey.value;
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
        NF.elStorey.innerHTML = '<option value="">All storeys</option>';
        if (storeys.length > 0) {
          storeys[0].values.forEach(function(r) {
            if (!r[0]) return;
            var opt = document.createElement('option');
            opt.value = r[0];
            var mc = matchByStorey[r[0]];
            opt.textContent = r[0] + (mc ? ' \u2714 ' + mc + ' matches' : '') + ' (' + r[1] + ')';
            if (mc) opt.style.fontWeight = 'bold';
            NF.elStorey.appendChild(opt);
          });
        }
        if (savedStorey) NF.elStorey.value = savedStorey;

        // Storey accordion
        NF.elStoreyBody.innerHTML = '';
        var stAll = document.createElement('div');
        stAll.className = 'find-acc-item' + (!savedStorey ? ' active' : '');
        stAll.textContent = _trl('ui_all_storeys', null, 'All Storeys');
        stAll.addEventListener('pointerup', function(e) {
          e.stopPropagation(); NF.elStorey.value = ''; NF.elStoreyRow.classList.remove('expanded');
          NF.elStoreyHdr.querySelector('.fa-label').textContent = _trl('ui_all_storeys', null, 'All Storeys');
          populateDropdowns(); runSearch();
        });
        NF.elStoreyBody.appendChild(stAll);
        if (storeys.length > 0) {
          storeys[0].values.forEach(function(r) {
            if (!r[0]) return;
            var div = document.createElement('div');
            div.className = 'find-acc-item' + (savedStorey === r[0] ? ' active' : '');
            var mc = matchByStorey[r[0]];
            div.textContent = r[0] + (mc ? ' \u2714' + mc : '') + ' (' + r[1] + ')';
            div.addEventListener('pointerup', function(e) {
              e.stopPropagation(); NF.elStorey.value = r[0]; NF.elStoreyRow.classList.remove('expanded');
              NF.elStoreyHdr.querySelector('.fa-label').textContent = r[0];
              populateDropdowns(); runSearch();
            });
            NF.elStoreyBody.appendChild(div);
          });
        }
        NF.elStoreyHdr.querySelector('.fa-label').textContent = savedStorey || 'All Storeys';
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
        NF.elType.innerHTML = '<option value="">All types</option>';
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
            NF.elType.appendChild(opt);
          });
        }
        if (savedType) NF.elType.value = savedType;

        // Type accordion
        NF.elTypeBody.innerHTML = '';
        var tyAll = document.createElement('div');
        tyAll.className = 'find-acc-item' + (!savedType ? ' active' : '');
        tyAll.textContent = _trl('ui_all_types', null, 'All Types');
        tyAll.addEventListener('pointerup', function(e) {
          e.stopPropagation(); NF.elType.value = ''; NF.elTypeRow.classList.remove('expanded');
          NF.elTypeHdr.querySelector('.fa-label').textContent = _trl('ui_all_types', null, 'All Types');
          populateDropdowns(); runSearch();
        });
        NF.elTypeBody.appendChild(tyAll);
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
              e.stopPropagation(); NF.elType.value = r[0]; NF.elTypeRow.classList.remove('expanded');
              NF.elTypeHdr.querySelector('.fa-label').textContent = friendlyClass(r[0]);
              populateDropdowns(); runSearch();
            });
            NF.elTypeBody.appendChild(div);
          });
        }
        NF.elTypeHdr.querySelector('.fa-label').textContent = savedType ? friendlyClass(savedType) : 'All Types';
        console.log('§FIND_DD_TYPES count=' + (types.length > 0 ? types[0].values.length : 0));

      } catch(e) { console.warn('[S233] type dropdown error', e); }
    }

    // ── Run search query ──
    function runSearch() {
      nav.results = [];
      nav.activeIdx = -1;
      NF.elResults.innerHTML = '';
      NF.elCount.textContent = '';
      if (!A.db) return;

      var bld = NF._scopeBld();
      var type = NF.elType.value;
      var storey = NF.elStorey.value;
      var name = NF.elName.value.trim();

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
        NF.elCount.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_find_matches||'{n} found').replace('{n}', nav.results.length);
        renderResults();
        // No auto-select — user picks from the list. Navigate auto-selects first if needed.
      } else {
        // No results — find nearest suggestions
        var suggestions = findSuggestions(bld, name);
        NF.elCount.textContent = typeof _TRL!=='undefined'&&_TRL.ui_find_no_matches||'0 matches';
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
      if (suggestions.length === 0 && (NF.elType.value || NF.elStorey.value)) {
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
      NF.elResults.innerHTML = '';
      if (suggestions.length === 0) {
        NF.elResults.innerHTML = '<div style="color:rgba(255,224,160,0.4);font-size:12px;padding:8px;">' +
          'No elements matching "' + escHtml(originalTerm) + '"</div>';
        return;
      }
      var hdr = document.createElement('div');
      hdr.style.cssText = 'color:rgba(255,224,160,0.5);font-size:11px;padding:4px 0 6px 0;';
      hdr.textContent = typeof _TRL!=='undefined'&&_TRL.ui_find_did_you_mean||'Did you mean:';
      NF.elResults.appendChild(hdr);

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
          NF.elName.value = s.name || s.ifc_class;
          // Clear restrictive filters if suggestion came from relaxed search
          if (s.reason === 'try removing filters') {
            NF.elType.value = '';
            NF.elStorey.value = '';
          }
          populateDropdowns();
          runSearch();
        };
        NF.elResults.appendChild(div);
      });
    }

    // ── Render result list ──
    function renderResults() {
      NF.elResults.innerHTML = '';
      NF.elSelected.style.display = 'none';
      NF.panel.classList.add('results-expanded'); // expand to show results
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
          NF.elResults.querySelectorAll('.find-result-item.active').forEach(function(el) { el.classList.remove('active'); });
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
        NF.elResults.appendChild(div);
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
      var items = NF.elResults.querySelectorAll('.find-result-item');
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
      if (r.guid) NF._updateSelCost(new Set([r.guid]), 'ITEM:' + dispName);   // BIM→Project TASK A: cost on the bar
      NF.elSelected.style.display = 'flex';
      NF.panel.classList.remove('results-expanded');
      [NF.elStoreyRow, NF.elTypeRow].forEach(function(row) { row.classList.remove('expanded'); });

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
        if (rows[0][0]) NF._showClassCost(rows[0][0], 1, guid);
        // S7 §S7-DO item 2 — same pick, the persisted 4D window (task grain, sibling #info-4d block).
        // guid-only (no class needed): windowForGuid reads task_elements straight off the guid.
        NF._show4DWindow(guid);
      } catch(e) {
        console.log('[S275] §FIND_INFO_ERR ' + e.message);
      }
    } // S275: running fly-to animation frame
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

    function debounce(fn, ms) {
      var t; return function() { clearTimeout(t); t = setTimeout(fn, ms); };
    }

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
      if (!set || !set.size) { if (NF.elSelected) NF.elSelected.style.display = 'none'; return; }
      if (elSelText) elSelText.textContent = label;
      if (NF.elSelected) NF.elSelected.style.display = 'flex';
      try { NF._updateSelCost(set, label); } catch (e) { console.log('§ZOOM-SCOPE_BAR_ERR ' + e.message); }
    }

  // phase-1 exports: other parts reach these through NF (same function objects)
  NF._handleInput = _handleInput;
  NF.populateDropdowns = populateDropdowns;
  NF.runSearch = runSearch;
  NF.friendlyClass = friendlyClass;
  NF.friendlyDisc = friendlyDisc;

  return function () {   // phase 2: this part's setup statements, in original order

    // ── Open find panel (called from pill, nlp.js, or directly) ──
    A.openFindPanel = function(searchTerm) {
      // S275: Toggle — if already open with no search term, close it
      if (!searchTerm && NF.panel.style.display === 'block') {
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
      NF.elType.value = '';
      NF.elStorey.value = '';
      NF.elResults.innerHTML = '';
      NF.elCount.textContent = '';
      NF.elSelected.style.display = 'none';
      NF.panel.classList.remove('results-expanded');
      [NF.elStoreyRow, NF.elTypeRow].forEach(function(r) { r.classList.remove('expanded'); });
      clearHighlight();
      // §RevitParity A1/Task A/B: fresh open clears any prior isolate + lens overlays
      if (A.filterByGuids) A.filterByGuids(null);
      NF._roomLensReset();
      NF._highlightLensReset();
      // §REVEAL-LEAK-ON-EXIT (2026-07-26, user-reported live testing: category-reveal doors and the
      // Path highlight survived a Find-panel close/reopen): _roomLensReset() only tears down
      // _roomBoxes — the category reveal's OWN door meshes (_revealDoorMeshes) and the Path
      // sub-mode's line/markers (_pathExtraMeshes) are separate arrays neither reset touches. Clear
      // both explicitly, same as every other overlay this open path already resets.
      NF._clearCategoryReveal();
      NF._clearPathHighlight();
      if (NF.elIsoBar) NF.elIsoBar.style.display = 'none';
      NF._phaseCache = null; // fresh timeline per open (building may have changed)
      NF._probeCacheResult = null; // §PROBE-DEDUP: fresh probe per open too, same reasoning
      NF._roomVolCache = null; NF._roomVolCacheBld = null; // §ROOM-VOL-CACHE: same reasoning
      NF._elMetaMap = null;  // §D drill: re-cache element labels for the (possibly new) building
      // Set search term and open
      NF.panel.style.display = 'block';
      NF.elName.value = searchTerm || '';
      // §S281: Defer item queries — only build tree (fast GROUP BY) on open.
      NF._renderAxes(); // §RULE1: single axis toggle (cycles storey→disc→room→material→phase)
      // §RULE1: with one toggle, the CURRENT axis tree is shown immediately (no hide-until-tap).
      if (NF.elTree) { NF.elTree.style.display = ''; NF._treeRevealed = true; if (NF.elTreeGrip) NF.elTreeGrip.style.display = 'flex'; }
      NF.buildTree();
      buildChips();
      if (searchTerm) { _handleInput(searchTerm, true); }
      // S275: Auto-focus — panel system + input
      if (typeof window._focusPanel === 'function') window._focusPanel('find');
      // §S280: Mobile — don't steal focus (triggers virtual keyboard). User taps searchbox when ready.
      if (!window._isMobile) NF.elName.focus();
      // §VIEWLOG: fresh view-history per open (building may have changed); show the bar.
      NF._vhClear();
      NF._vhRender();
      console.log('[S233] §NAV_FIND_OPEN term="' + (searchTerm || '') + '" voice=' + nav.voiceMode);
    };
    A.closeFindPanel = closeFindPanel; // exposed for nlp.js bar close
    // §CINEMA_GHOST_RESET (2026-07-21, broadened after user correction — the ghost shell can be
    // visible for TWO independent reasons that don't track each other: auto-engaged by a Find-panel
    // lens (_mgLensOwned=true, torn down by closeFindPanel/_setTreeMode/etc.) OR manually toggled via
    // the Alt+Z 3-state cycle (tools.js `cycleXrayBboxMode` → `toggleMergedGhost`, which flips
    // `_mergedGhost.visible` alone and NEVER touches `_mgLensOwned` — confirmed reading it directly).
    // The original version of this fix only checked `_mgLensOwned`, so a manually-toggled-on ghost
    // (e.g. cycled to Bbox mode via Alt+Z, or via the old Alt+X before it was merged into that cycle)
    // survived into Alt+C untouched — likely the actual scenario hit live, since no Find-panel drill
    // was involved. Fixed to key off VISIBILITY, not ownership — a cinematic film should never show
    // the ghost shell regardless of how it got turned on.
    A.resetCinemaGhostLens = function() {
      if (NF._mergedGhost && NF._mergedGhost.visible) {
        NF._mergedGhost.visible = false;
        if (A.filterByGuids) A.filterByGuids(null); // restore solids — mirrors toggleMergedGhost's own off-path
        var _wasAuto = NF._mgLensOwned; NF._mgLensOwned = false;
        console.log('[MG] §CINEMA_GHOST_RESET hidden (' + (_wasAuto ? 'lens-owned' : 'manually toggled') + ', cinema orbit starting)');
      }
    };
    NF.elClose.onclick = closeFindPanel;

    // ── Filter change listeners — all filters cross-update dropdowns + results ──
    NF.elType.onchange = function() { populateDropdowns(); runSearch(); };
    NF.elStorey.onchange = function() { populateDropdowns(); runSearch(); };
    NF.elName.addEventListener('input', debounce(function() {
      _handleInput(NF.elName.value);
    }, 300));
    // S275: Keyboard navigation — Enter/Escape/Arrow keys
    NF.elName.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        // If results visible and one is highlighted, select it; else search
        if (nav.results.length > 0 && nav.activeIdx >= 0) {
          selectResult(nav.activeIdx);
        } else {
          _handleInput(NF.elName.value, true);
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
    NF.elStoreyHdr.tabIndex = 0;
    NF.elTypeHdr.tabIndex = 0;

    // ── Wire navigate button — calls startNavigation from navigate.js ──
    NF.elNavBtn.tabIndex = 0;
    NF.elNavBtn.onclick = function() {
      if (nav.activeIdx < 0 && nav.results.length > 0) nav.activeIdx = 0;
      if (nav.activeIdx < 0) return;
      var startNav = getStartNavigation();
      if (startNav) startNav(nav.results[nav.activeIdx]);
    };
    NF.elNavBtn.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeFindPanel();
    });

    // ── BIM→Project TASK C: wire the > to ERP button (folds the selection via window.ProjFold) ──
    if (NF.elErpBtn) { NF.elErpBtn.tabIndex = 0; NF.elErpBtn.onclick = function () { NF._pushToErp(); }; }

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
      NF._clearShapeOverlays();
      NF._clearHlOverlay();
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
        if (!A.xrayOn && A.toggleXray) { A.toggleXray(); NF._hlXrayWasOff = true; } // x-ray path: rest → transparent
        NF._dimXrayTo(0.1);                                                          // §DEPTH: rest = 0.1 ghost
      }
      // color=null → opaque clone of each element's REAL material; solidOpacity=1 → fully solid.
      var _ovBefore = NF._shapeOverlays.length;
      var lit = NF._buildShapeMeshes(set, null, 1, null);
      var _ovMeshes = [];
      for (var _oi = _ovBefore; _oi < NF._shapeOverlays.length; _oi++) _ovMeshes.push(NF._shapeOverlays[_oi].mesh);
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
        NF._buildShapeMeshes(set, 0xffd400, null, 0.35); // fallback: faint yellow fill (no silhouette pass)
      }
      var zoomed = false;
      if (opts.frame !== false) zoomed = (opts.item === false) ? NF._zoomToGroup(set) : NF._zoomToGuids(set, 1.1);
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
      NF._highlightLensReset();
      if (A.xrayOn && A.toggleXray) { A.toggleXray(); console.log('[RP-TB] §SHAKE_OUT xray→off'); }
      if (typeof window.ghostXrayOn === 'function' && window.ghostXrayOn() && window.toggleGhostXray) {
        window.toggleGhostXray(); console.log('[RP-TB] §SHAKE_OUT ghost→off');
      }
      console.log('[RP-TB] §FOCUS_ELEM_CLEAR');
    };
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
      NF.elName.value = scope;
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
      try { NF._showClassCost(scope, set.size); } catch (e) { console.log('§ZOOM-COST wire_err=' + e.message); }
      return set.size;
    };

    // §S282b: _focusCycle removed — PanelNav handles zone cycling
    // §S282b: PanelNav replaces _findNav — universal zone-based keyboard nav
    // Fixes ArrowDown-from-input bug: input → storey header (not empty result list)
    if (typeof window.PanelNav === 'function') {
      window._findPanelNav = PanelNav({
        id: 'find',
        panel: NF.panel,
        zones: [
          { id: 'search', el: NF.elName, type: 'input' },
          { id: 'storeys', header: NF.elStoreyHdr,
            items: function() { return NF.elStoreyBody.querySelectorAll('.find-acc-item'); },
            onSelect: function(el) { el.click(); },
            onExpand: function(z, open) {
              if (open === true && !NF.elStoreyRow.classList.contains('expanded')) NF.toggleAccRow(NF.elStoreyRow);
              else if (open !== true) NF.toggleAccRow(NF.elStoreyRow);
            }
          },
          { id: 'types', header: NF.elTypeHdr,
            items: function() { return NF.elTypeBody.querySelectorAll('.find-acc-item'); },
            onSelect: function(el) { el.click(); },
            onExpand: function(z, open) {
              if (open === true && !NF.elTypeRow.classList.contains('expanded')) NF.toggleAccRow(NF.elTypeRow);
              else if (open !== true) NF.toggleAccRow(NF.elTypeRow);
            }
          },
          { id: 'results',
            items: function() { return NF.elResults.querySelectorAll('.find-result-item'); },
            onSelect: function(el) { el.click(); }
          }
        ],
        onClose: closeFindPanel
      });
      console.log('§PANEL_NAV_FIND wired zones=4');
    } else if (typeof window._registerPanel === 'function') {
      // Fallback: register without PanelNav (panel_nav.js not loaded)
      window._registerPanel('find', NF.panel, null, closeFindPanel);
    }

    console.log('[S233] §NAV_FIND_MODULE_LOADED panel=' + !!document.getElementById('find-panel'));
  };
};
