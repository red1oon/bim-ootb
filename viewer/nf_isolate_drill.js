// navigate_find family — part `isolate_drill` (original navigate_find.js lines 3829–4236).
// GENERATED move-only by scripts/split_closure.js (config scripts/split_configs/navigate_find.json). Below the `yield` every
// statement is the original text; the only edit is that a name owned by ANOTHER part is reached as NF.name.
// Edit this file normally from now on; regenerate only to re-split a branch that still edits the old single file.
(typeof window !== 'undefined' ? window : globalThis).__navigateFindParts = (typeof window !== 'undefined' ? window : globalThis).__navigateFindParts || {};
(typeof window !== 'undefined' ? window : globalThis).__navigateFindParts.isolate_drill = function* __split_navigate_find_isolate_drill(NF, A, nav, getStartNavigation) {
  'use strict';
  // phase 1 — publish this part's names that other parts use (same function objects; vars as live accessors)
  NF._emitIsolate = _emitIsolate;
  NF._treeNode = _treeNode;
  NF._buildStoreyTree = _buildStoreyTree;
  NF._buildDiscTree = _buildDiscTree;
  Object.defineProperty(NF, '_nlpRe', { get: function () { return _nlpRe; }, set: function (v) { _nlpRe = v; }, enumerable: true });
  yield;   // phase 2 resumes here, in this same scope: the original statements, in original order


    // ── §RevitParity A1: Isolate the current drill — hide everything except the matched set ──
    // opts (optional) overrides the drill scope: {type, storey, disc, name}.
    function _isolateGuidSet(opts) {
      opts = opts || {};
      var set = new Set();
      if (!A.db) return set;
      var bld = NF._scopeBld();
      var type = 'type' in opts ? opts.type : NF.elType.value;
      var storey = 'storey' in opts ? opts.storey : NF.elStorey.value;
      var disc = opts.disc || '';
      var name = 'name' in opts ? opts.name : NF.elName.value.trim();
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
      var zoomed = NF._zoomToGroup(set);
      var bld = NF._scopeBld();
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
      _emitIsolate(set, '{type:"' + NF.elType.value + '",storey:"' + NF.elStorey.value + '",name:"' + NF.elName.value.trim() + '"}');
      updateIsolateBar();
    }

    // §RevitParity W-LEAF-ISOLATE: a Type leaf tap (1) refreshes the items list to that
    // drill AND (2) isolates the 3D to the exact branch (storey+type or disc+type).
    function isolateLeaf(opts, by) {
      if (!A.db || !A.filterByGuids) return;
      NF.elStorey.value = ('storey' in opts) ? (opts.storey || '') : '';
      NF.elType.value = opts.type || '';
      NF.runSearch();
      if (A.filterStorey) A.filterStorey(null);
      if (A.filterDisc) A.filterDisc(null);
      var set = _isolateGuidSet(opts);
      if (!set.size) { console.log('[RP-A1] §FILTER_ISOLATE_EMPTY by=' + by); return; }
      _emitIsolate(set, by);
      if (NF.elIsoBar) {
        NF.elIsoBar.style.display = 'flex';
        if (NF.elIsoBtn) NF.elIsoBtn.style.display = 'none';
        if (NF.elShowAllBtn) NF.elShowAllBtn.style.display = '';
      }
    }

    function clearIsolate() {
      if (A.filterByGuids) A.filterByGuids(null);
      if (NF._roomBoxes.length || NF._roomXrayWasOff) NF._roomLensReset();
      // §XRAY_UNDISTURB: reset whenever x-ray is on — not just when WE turned it on — so a lens exit
      // restores the user's manual Alt+Z x-ray to its normal 0.3 (was: left at the depth 0.1/0).
      if (NF._hlXrayWasOff || A.xrayOn || (A._outlinePass && A._outlinePass.enabled)) NF._highlightLensReset();
      if (NF.elIsoBar) NF.elIsoBar.style.display = 'none';
      updateIsolateBar();
      console.log('[RP-A1] §FILTER_RESET');
    }

    function updateIsolateBar() {
      if (!NF.elIsoBar) return;
      var hasFilter = !!(NF.elType.value || NF.elStorey.value || NF.elName.value.trim());
      var hasResults = nav.results.length > 0;
      console.log('[RP-A1] §FILTER_BAR hasFilter=' + hasFilter + ' hasResults=' + hasResults +
        ' type="' + NF.elType.value + '" storey="' + NF.elStorey.value + '" name="' + NF.elName.value.trim() + '" n=' + nav.results.length);
      if (hasFilter && hasResults) {
        NF.elIsoBar.style.display = 'flex';
        var isolating = !!A.activeGuidFilter;
        if (NF.elIsoBtn) NF.elIsoBtn.style.display = isolating ? 'none' : '';
        if (NF.elShowAllBtn) NF.elShowAllBtn.style.display = isolating ? '' : 'none';
      } else {
        NF.elIsoBar.style.display = 'none';
      }
    }
    if (NF.elIsoBtn) NF.elIsoBtn.addEventListener('pointerup', function(e) { e.stopPropagation(); applyIsolate(); });
    if (NF.elShowAllBtn) NF.elShowAllBtn.addEventListener('pointerup', function(e) { e.stopPropagation(); clearIsolate(); });

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
        arrow.title = _trl('ui_expand', null, 'Expand');
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
          var sel = (NF._treeMode === 'storey') ? NF._selStoreys : NF._selDiscs;
          var ctrl = e.ctrlKey || e.metaKey;
          var shift = e.shiftKey;
          var mod = shift ? 'shift' : (ctrl ? 'ctrl' : 'plain');
          // §DISC_LABELS: identity/selection keys off `value` (raw code), never the friendly `label`.
          if (shift && NF._anchor !== null) {
            var labels = NF._orderedParentLabels();
            var ai = labels.indexOf(NF._anchor), bi = labels.indexOf(value);
            if (ai >= 0 && bi >= 0) {
              sel.clear();
              for (var k = Math.min(ai, bi); k <= Math.max(ai, bi); k++) sel.add(labels[k]);
            } else { sel.clear(); sel.add(value); NF._anchor = value; }
          } else if (ctrl) {
            if (sel.has(value)) sel.delete(value); else sel.add(value);
            NF._anchor = value;
          } else {
            sel.clear(); sel.add(value); NF._anchor = value;
          }
          NF._applyParentHighlight();
          var arr = Array.from(sel);
          NF._axisGroupSelect(NF._treeMode, arr); // §DEPTH: ghost rest 0.1 + selected solid (was filterStorey hide)
          console.log('§FIND_MULTISEL mode=' + NF._treeMode + ' sel=[' + arr.join(',') + '] n=' + arr.length + ' mod=' + mod);
          // BIM→Project TASK A/C: a storey/disc selection IS a WBS level to price & push, so reveal the
          // #find-selected bar (cost span + > ERP) for GROUP scopes too — previously it only showed on a
          // single result-item click (line ~3027), so a group's cost + push button were never visible.
          var _elSelText = document.getElementById('find-selected-text');
          if (arr.length) {
            // Display friendly words for disc mode; storey codes are already human (e.g. "Level 1").
            var _dispArr = (NF._treeMode === 'disc') ? arr.map(NF.friendlyDisc) : arr;
            if (_elSelText) _elSelText.textContent = _dispArr.join(', ') + ' · ' + arr.length + ' ' + NF._treeMode + (arr.length > 1 ? 's' : '');
            NF.elSelected.style.display = 'flex';
          } else {
            NF.elSelected.style.display = 'none';
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
                  onTap: function() { NF.elStorey.value = storey; NF.elName.value = sp[0] || ''; NF.runSearch(); }
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
                  container.appendChild(_treeNode(NF.friendlyClass(ifc), tp[1], 1, {
                    children: true, // §RP-SHAPE L4: arrow expands → individual items
                    // §RP-SHAPE: tap a Type leaf → light that type's shapes, storey solid, rest 0.2
                    onTap: function() { NF._typeShapeDrill('storey', storey, ifc, NF.friendlyClass(ifc) + ' @ ' + storey); },
                    onExpand: function(c) { if (c._loaded) return; c._loaded = true; NF._typeItemChildren(c, 'storey', storey, ifc); }
                  }));
                });
              }
            }
            console.log('§FIND_TREE_LAZY storey=' + storey + ' children=' + container.childElementCount);
          }
        });
        NF.elTree.appendChild(node);
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
        var node = _treeNode(NF.friendlyDisc(disc), discCnt, 0, {
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
                container.appendChild(_treeNode(NF.friendlyClass(ifc), tp[1], 1, {
                  children: true, // §RP-SHAPE L4: arrow expands → individual items
                  // §RP-SHAPE: tap a Type leaf → light that type's shapes, discipline solid, rest 0.2
                  onTap: function() { NF._typeShapeDrill('discipline', disc, ifc, NF.friendlyClass(ifc) + ' @ ' + NF.friendlyDisc(disc)); },
                  onExpand: function(c) { if (c._loaded) return; c._loaded = true; NF._typeItemChildren(c, 'discipline', disc, ifc); }
                }));
              });
            }
            console.log('§FIND_TREE_LAZY disc=' + disc + ' children=' + container.childElementCount);
          }
        });
        NF.elTree.appendChild(node);
      });
      console.log('§FIND_TREE mode=disc discs=' + discs[0].values.length);
    }

    // Tap selected text → re-expand results list
    var elSelText = document.getElementById('find-selected-text');
    if (elSelText) elSelText.addEventListener('pointerup', function(e) {
      e.stopPropagation();
      NF.panel.classList.add('results-expanded');
      NF.elSelected.style.display = 'none';
      [NF.elStoreyRow, NF.elTypeRow].forEach(function(r) { r.classList.remove('expanded'); });
    });

    // ── S265 Phase 5: Voice mic inside Find panel ──
    var _SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var _recognition = null, _listening = false;
    if (_SR && NF.elMicBtn) {
      NF.elMicBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (_listening) { _recognition.stop(); return; }
        _recognition = new _SR();
        _recognition.continuous = false;
        _recognition.interimResults = true;
        _recognition.lang = 'en-US';
        _recognition.onstart = function() {
          _listening = true;
          NF.elMicBtn.classList.add('listening');
          console.log('§FIND_VOICE_START');
        };
        _recognition.onresult = function(ev) {
          for (var i = ev.resultIndex; i < ev.results.length; i++) {
            var t = ev.results[i][0].transcript;
            if (ev.results[i].isFinal) {
              NF.elName.value = t;
              NF.elName.style.fontStyle = 'normal';
              A.inputWasVoice = true;
              NF._handleInput(t, true);
              console.log('§FIND_VOICE_FINAL "' + t + '"');
            } else {
              NF.elName.value = t;
              NF.elName.style.fontStyle = 'italic';
            }
          }
        };
        _recognition.onerror = function(ev) { console.log('§FIND_VOICE_ERR ' + ev.error); };
        _recognition.onend = function() {
          _listening = false;
          NF.elMicBtn.classList.remove('listening');
          NF.elName.style.fontStyle = 'normal';
        };
        _recognition.start();
      });
    } else if (NF.elMicBtn) {
      NF.elMicBtn.style.opacity = '0.4';
      NF.elMicBtn.style.cursor = 'default';
      NF.elMicBtn.title = _trl('ui_voice_unsupported', null, 'Voice not supported');
    }
    // S275: Mic icon bright blue to match navigate button
    if (NF.elMicBtn) NF.elMicBtn.style.color = '#4fc3f7';

    // ── S265 Phase 5: Dual-purpose input — NLP queries vs element search ──
    // NLP only fires on Enter or chip click (explicit=true), never on live typing.
    var _nlpRe = /^(count|how many|number of|total|cost|show|list|what|find|search)\b/i;
};
