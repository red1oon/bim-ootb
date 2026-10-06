// navigate_find family — part `tree_lens` (original navigate_find.js lines 545–1277).
// GENERATED move-only by scripts/split_closure.js (config scripts/split_configs/navigate_find.json) — edit this file
// normally from now on; regenerate only to re-split a branch that still edits the old single file. Names shared
// across parts live on `NF`; load order + the two-phase setup are in navigate_find.js.
(typeof window !== 'undefined' ? window : globalThis).__navigateFindParts = (typeof window !== 'undefined' ? window : globalThis).__navigateFindParts || {};
(typeof window !== 'undefined' ? window : globalThis).__navigateFindParts.tree_lens = function __split_navigate_find_tree_lens(NF, A, nav, getStartNavigation) {
  'use strict';
  var _probeCacheT;   // hoisted to this part, as the single closure hoisted them
  // literal-valued constants, verbatim (evaluating a literal earlier changes nothing)

    // §S280: Audio thump — short click on mode toggle (lightweight, no file load)
    var _audioCtx = null;
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
    // §PLANT_ROOM_GATE_FIX Bug 2: smallest static filename->class map (NOT a general classifier —
    // mirrors bim-compiler config/building_taxonomy.yaml's building_classes exactly, which itself
    // cites WalkerDoctrine.md §1 LOCKED: residential = SampleHouse/Duplex/SampleCastle, complex =
    // Terminal/Clinic/Hospital/HHS). The Viewer has no building-class concept anywhere else (grep
    // confirmed zero hits before this change) — this reads A.DB_URL (the ?db= query param, a stable
    // filename per WalkerDoctrine's own fixed building list) rather than A.activeBuilding (the raw
    // elements_meta.building column, confirmed messy/inconsistent per-building — e.g. Clinic carries
    // 5 different discipline-suffixed values, Duplex carries the full IFC federation filename).
    var _RESIDENTIAL_BUILDINGS = ['duplex', 'samplehouse', 'samplecastle'];
    var _COMPLEX_BUILDINGS = ['terminal', 'clinic', 'hospital', 'hhs'];  // §MOBILE-BBOX: true → the lens auto-enabled the bbox shell on mobile (hide it on reset; user Alt+X is NOT lens-owned)

    // ══ §7 Room-to-room pathway (VIEWER_FIND_PANEL_ROOM_ACCURACY.md §7) ══
    // Room axis "Path" sub-mode: pick two rooms, route through the real door-adjacency graph
    // (common/room_graph.js — new, see that file's header for why no such graph existed before).
    var _pathGraphCache = null, _pathGraphBld = null;

    // §CORRIDOR-TYPE-LABEL (2026-07-14, user ask): Type-grouped room tree DISPLAY-only override —
    // a room whose centroid sits on a real, door+wall-verified hallway backbone
    // (common/hallway_backbone.js) shows as "Hall / Corridor" in the Type view instead of whatever
    // generic predefined_type it was compiled with. Never rewrites spatial_structure — same
    // per-building cache convention as _roomGraphFor() above.
    var _corridorLabelsCache = null, _corridorLabelsBld = null;
 // last plain/ctrl-tapped label, for Shift-range
    function _orderedParentLabels() {
      return Array.prototype.map.call(
        NF.elTree ? NF.elTree.querySelectorAll('[data-find-parent]') : [],
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
      if (!NF.elTree) return;
      var sel = (NF._treeMode === 'storey') ? NF._selStoreys : NF._selDiscs;
      NF.elTree.querySelectorAll('[data-find-parent]').forEach(function(row) {
        _setParentRowStyle(row, sel.has(row.getAttribute('data-find-parent')));
      });
    }
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
      if (NF._treeMode === 'room') { NF._roomLensReset(); NF._highlightLensReset(); NF._clearPathHighlight(); }
      // §PHASE_LENS/§MAT_SELECT: leaving Phase/Material tears down element highlight.
      if (NF._treeMode === 'phase' || NF._treeMode === 'material') NF._highlightLensReset();
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
      if (NF._mgLensOwned && NF._mergedGhost) {
        NF._mergedGhost.visible = false; NF._mgLensOwned = false;
        console.log('[MG] §BBOX_GHOST_STUCK_RESET hidden on axis change (was lens-owned)');
      }
      NF._treeMode = mode;
      // §NAV_FIND_002: axis change clears multi-select + restores full scene (unify engine)
      NF._selStoreys.clear(); NF._selDiscs.clear(); NF._anchor = null;
      if (A.filterStorey) A.filterStorey(null);
      if (A.filterDisc) A.filterDisc(null);
      if (A.filterByGuids) A.filterByGuids(null);
      if (NF.elIsoBar) NF.elIsoBar.style.display = 'none';
      _thump();
      _renderAxes(); // re-highlight the active pill
      if (NF.elTree) { NF.elTree.style.display = ''; NF._treeRevealed = true; if (NF.elTreeGrip) NF.elTreeGrip.style.display = 'flex'; }
      buildTree();
      console.log('§FIND_MODE_TOGGLE mode=' + mode);
      console.log('[RP-T3] §PERF_PROBE _setTreeMode(' + mode + ') total_ms=' + ((performance && performance.now) ? (performance.now() - _stmT0).toFixed(1) : '?')); // §13, the real per-tab-switch cost
      // §VIEWLOG: an axis change is a semantic view moment. Record it (skipped on replay/off).
      NF._pushView({ kind: 'axis', axis: mode, label: 'Axis: ' + mode, mode: 'axis' });
    }

    // §FB.2: whole-scene readers scope through ONE owner (streaming.js A.sceneScopeBuilding) — a merged
    // scene (>1 building, not City) is one model; everything else stays on A.activeBuilding as before.
    function _scopeBld() { return A.sceneScopeBuilding ? A.sceneScopeBuilding() : (A.activeBuilding || ''); }

    function buildTree() {
      if (!NF.elTree || !A.db) return;
      var bld = _scopeBld();
      var filter = NF.elName.value.trim().toLowerCase();
      NF.elTree.innerHTML = '';
      try {
        if (NF._treeMode === 'storey') { NF._buildStoreyTree(bld, filter); _applyParentHighlight(); }
        else if (NF._treeMode === 'disc') { NF._buildDiscTree(bld, filter); _applyParentHighlight(); }
        else if (NF._treeMode === 'room') NF._buildRoomTree();
        else if (NF._treeMode === 'material') NF._buildMaterialTree();
        else if (NF._treeMode === 'phase') NF._buildPhaseTree();
      } catch(e) { console.warn('§FIND_TREE error', e); }
    }
    function _partsCond(part) {
      if (part === 'STAIRWAY') return STAIR_LIKE.map(function(p) { return "ifc_class LIKE '" + p + "'"; }).join(' OR ');
      var words = (part === 'LIFT_SHAFT') ? NF.LIFT_KEYWORDS : NF.PLANT_KEYWORDS;
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
    function _buildingClass() {
      var src = String((A.DB_URL || '')).toLowerCase();
      for (var i = 0; i < _COMPLEX_BUILDINGS.length; i++) { if (src.indexOf(_COMPLEX_BUILDINGS[i]) >= 0) return 'complex'; }
      for (var i = 0; i < _RESIDENTIAL_BUILDINGS.length; i++) { if (src.indexOf(_RESIDENTIAL_BUILDINGS[i]) >= 0) return 'residential'; }
      return null; // unclassed (e.g. Garage, n=1 per scoreboard) — PLANT_ROOM stays hidden, same as residential
    }
    function _probeLenses() {
      var _plT0 = (performance && performance.now) ? performance.now() : 0; // §PERF_PROBE (2026-07-15j, §13)
      var _now = _plT0 || (Date.now ? Date.now() : 0);
      if (NF._probeCacheResult && (_now - _probeCacheT) < 50) {
        console.log('[RP-T3] §LENS_PROBE_DEDUP_HIT age_ms=' + (_now - _probeCacheT).toFixed(1));
        return NF._probeCacheResult;
      }
      var bld = _scopeBld();
      var room = false, material = false, phase = false;
      NF._roomHasVol = false;
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
              NF._roomHasVol = !!(vc.length && vc[0].values[0][0] > 0);
              if (NF._roomHasVol) room = true; // volume alone enables the Room axis
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
      console.log('[RP-T3] §LENS_PROBE room=' + room + ' roomVol=' + NF._roomHasVol + ' material=' + material + ' phase=' + phase + ' spaceCount=' + _needleSpaceCount + ' needleState=' + _needleState);
      console.log('[RP-T3] §PERF_PROBE _probeLenses ms=' + ((performance && performance.now) ? (performance.now() - _plT0).toFixed(1) : '?')); // §13
      NF._probeCacheResult = { room: room, material: material, phase: phase, spaceCount: _needleSpaceCount, needleState: _needleState };
      _probeCacheT = _now;
      return NF._probeCacheResult;
    }

    // Storey + Discipline always; Room/Material/Phase only when their data is present.
    // §A NEVER-BLANK: Storey+Disc are unconditional — built before any DB probe so the
    // axis bar can never empty (the cause of the shipped blank bar). When A.db isn't ready
    // yet, return just the two base pills; the data-gated pills fill in once probed.
    function _axes() {
      var ax = [{ key: 'storey', label: NF._t('ui_axis_storey', 'Storey') },
                { key: 'disc', label: NF._t('ui_axis_disc', 'Discipline') }];
      if (!A.db) return ax;
      var present = _probeLenses();
      _lastPresent = present; // §NEEDLE: cache for _renderNeedle()
      if (present.room) ax.push({ key: 'room', label: NF._t('ui_lens_room', 'Room') });
      if (present.material) ax.push({ key: 'material', label: NF._t('ui_lens_material', 'Material') });
      if (present.phase) ax.push({ key: 'phase', label: NF._t('ui_lens_phase', 'Phase') });
      return ax;
    }

    // §RULE1 SINGLE TOGGLE: the axis is ONE button, not a row of pills. It shows the current
    // axis and cycles to the next available one on each tap (storey→disc→[room]→[material]→
    // [phase]→storey). Room/Material/Phase only join the cycle when their data is present
    // (data-gated, §A never-blank keeps storey+disc always). One control, never multiple buttons.
    function _renderAxes() {
      if (!NF.elAxisBar) return;
      NF.elAxisBar.innerHTML = '';
      // §A NEVER-BLANK: _axes() always yields at least Storey+Disc, even before A.db.
      var ax = _axes();
      if (!ax.length) return;
      var idx = 0;
      for (var i = 0; i < ax.length; i++) { if (ax[i].key === NF._treeMode) { idx = i; break; } }
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
        for (var k = 0; k < a2.length; k++) { if (a2[k].key === NF._treeMode) { ci = k; break; } }
        _setTreeMode(a2[(ci + 1) % a2.length].key);
      });
      NF.elAxisBar.appendChild(btn);
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
      if (!NF.elAxisBar || !A.db || !_lastPresent || _lastPresent.needleState === 'none') return;
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
      NF.elAxisBar.appendChild(btn);
    }

    // §ROOM_WALKER_VERSION_STAMP (ROOM_INJECTOR_NEEDLE.md) — shared lazy-loader for the
    // room_walker.js port, used both by the version-check gate below and S2.2's actual compile,
    // so the script is fetched at most once per page regardless of which caller needs it first.
    async function _ensureRoomWalkerLoaded() {
      if (window.RoomWalker) return;
      await new Promise(function(resolve, reject) {
        var s = document.createElement('script');
        s.src = 'lib/room_walker.js?v=3'; // v3: §ROOM_WALKER_VERSION_STAMP stages 1+2 (ROOM_INJECTOR_NEEDLE.md)
        s.onload = function() { resolve(); };
        s.onerror = function() { reject(new Error('room_walker.js load failed')); };
        document.head.appendChild(s);
      });
      if (!window.RoomWalker) throw new Error('RoomWalker unavailable after load');
    }
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
        // §ROOM_WALKER_VERSION_STAMP stage 4 (ROOM_INJECTOR_NEEDLE.md) — FLEET-WIDE. Before
        // trusting an in-frame compiled set, check its stamped algorithm version against the
        // current ROOM_WALKER_V. Missing rooms_meta (every building compiled before this shipped)
        // or a version mismatch counts as stale, same treatment as §PATCH-FRAME-GUARD above.
        // Stage 3 piloted this on HHS only and confirmed the "recompute once, then stable, no
        // repeat trigger" settle behavior; stage 4 removes the exact-dbFile gate so every building
        // self-heals identically (verified on Terminal 48k-element large class — see
        // ROOM_INJECTOR_NEEDLE.md §Stage 4). Loading room_walker.js here to read its version
        // constant does NOT itself trigger a recompute (compileRooms is a separate call, made
        // only in the S2.2 fall-through below) — cheap, cached after first hit.
        var versionStale = false, storedV = null;
        var _dbFileNow = (A.DB_URL || '').slice((A.DB_URL || '').lastIndexOf('/') + 1).split('?')[0];
        if (inFrame) {
          try {
            await _ensureRoomWalkerLoaded();
            var _rmv = A.dbQuery("SELECT version FROM rooms_meta WHERE id=1");
            storedV = _rmv.length ? _rmv[0][0] : null;
            versionStale = storedV !== window.RoomWalker.ROOM_WALKER_V;
          } catch (eV) { versionStale = true; /* no rooms_meta table = compiled before this shipped */ }
          if (versionStale) {
            // §LOG-CLARITY (2026-07-21, live confusion found via user testing): this line was
            // console.warn — invisible whenever DevTools' console filter has "Warnings" unchecked,
            // which made a real, correctly-firing recompile look like it never ran. Every other
            // step of this same pipeline (§NEEDLE_INJECT/§NEEDLE_STAMP/§NEEDLE_PERSIST below) is
            // console.log; matching that here removes the filter-dependent blind spot.
            console.log('[NEEDLE] §NEEDLE_VERSION_STALE bld=' + (_dbFileNow || A.activeBuilding) + ' stored=' + storedV +
              ' current=' + (window.RoomWalker && window.RoomWalker.ROOM_WALKER_V) + ' — recompiling');
          }
        }
        if (inFrame && !versionStale) return { status: 'present', real: false };
        if (!inFrame) console.log('[NEEDLE] §NEEDLE_FRAME_STALE compiled rooms outside building extent — recompiling');
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
            // §PATCH_CHUNK: NEVER one giant A.db.run() here — a multi-thousand-statement patch
            // (Hospital: 9,466 statements) crashes the bundled sql-wasm.wasm "memory access out
            // of bounds" and bricks the SHARED wasm heap: every later dbQuery, the geo.db load
            // and streaming init all fail. Same chunker as A._applyPendingPatch (scene.js).
            var _ch = A._runSqlChunked(A.db, sqlText);
            applied = true;
            console.log('[NEEDLE] §PATCH_APPLY ' + dbFile + ' applied (' + sqlText.length + ' bytes, ' + _ch.statements + ' statements, ' + _ch.chunks + ' chunk(s)) from ' + patchUrl + ' [needle]');
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
          await _ensureRoomWalkerLoaded();
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

        // §ROOM_WALKER_VERSION_STAMP stage 4 — stamp rooms_meta after ANY inject source. The
        // walker's writeRooms() already stamps, but the patch source (S2.1) does NOT — proven via
        // the Terminal 3-reload witness (§STAGE4_RELOAD3): without this a patch-carrying building
        // recomputes on EVERY load (§NEEDLE_VERSION_STALE never clears, ~7s each on 48k elements)
        // because rooms_meta stays absent, so the fleet-wide version-check re-fires forever. This
        // is the one silent regression the widening could introduce (risk-cliff failure-mode (a)).
        // Idempotent INSERT OR REPLACE; the current ROOM_WALKER_V is authoritative for these rooms
        // (a shipped patch is regenerated by compile_rooms.py in ROOM_WALKER_V lockstep, stages 1+2).
        try {
          await _ensureRoomWalkerLoaded();
          var _rwvNow = (window.RoomWalker && window.RoomWalker.ROOM_WALKER_V) || '';
          A.db.run("CREATE TABLE IF NOT EXISTS rooms_meta (id INTEGER PRIMARY KEY CHECK(id=1), version TEXT, built_at TEXT, room_count INTEGER)");
          var _stmtRM = A.db.prepare("INSERT OR REPLACE INTO rooms_meta (id, version, built_at, room_count) VALUES (1, ?, ?, ?)");
          _stmtRM.run([_rwvNow, new Date().toISOString(), roomsN]); _stmtRM.free();
          console.log('[NEEDLE] §NEEDLE_STAMP rooms_meta version=' + _rwvNow + ' rooms=' + roomsN + ' source=' + source);
        } catch (eStamp) { console.warn('[NEEDLE] §NEEDLE_STAMP_FAIL ' + (eStamp && eStamp.message)); }

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
        NF._roomVolCache = null; NF._roomVolCacheBld = null; // §ROOM-VOL-CACHE: injected rooms invalidate it too
        // §TOUR_ROUTE_CACHE.md §6 — a stage-3 version-triggered recompile (§NEEDLE_VERSION_STALE
        // above) means the Fly tour's cached route was planned against the stale room set; bust it
        // in the same breath so the next Fly press re-plans against the fresh rooms instead of
        // fast-pathing straight past _ensureRoomsCore (guarded: tour.js may not be loaded).
        if (versionStale && A._tourCacheBust) A._tourCacheBust();
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

    async function _isolateLensGroup(lens, g) {
      if (!A.db || !A.filterByGuids) return;
      // §FIND_ENSURE_ROOMS: if a room self-heal is mid-flight (user entered the lens then tapped a
      // group on the pre-recompile tree before it rebuilt), wait for it so we isolate against the
      // current rel_contained_in_space rows — same single shared A.ensureRooms core, no 2nd path.
      if (lens === 'room' && A._ensureRoomsInflight) { try { await A._ensureRoomsInflight; } catch (e) {} }
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
      NF._emitIsolate(set, lens + '="' + g.label + '"');
      if (NF.elIsoBar) {
        NF.elIsoBar.style.display = 'flex';
        if (NF.elIsoBtn) NF.elIsoBtn.style.display = 'none';
        if (NF.elShowAllBtn) NF.elShowAllBtn.style.display = '';
      }
    }  // the connecting polyline + any path-only overlays (disposed on reset/mode-leave)

    function _roomGraphFor() {
      var RG = (typeof window !== 'undefined') && window.RoomGraph;
      if (!RG || !A.dbQuery) return null;
      if (_pathGraphCache && _pathGraphBld === A.activeBuilding) return _pathGraphCache;
      // §REAL-AABB (ROOM_GRAPH_REAL_AABB.md §4 item 3): resolve real door positions when possible —
      // graceful null (module not loaded, or A.db has no resolvable geometry) = today's coarse
      // center_x/y behaviour, unchanged. See common/door_real_position.js for the fallback contract.
      var doorRealXY = null;
      if (window.DoorRealPosition && A.db) {
        try { doorRealXY = window.DoorRealPosition.resolveDoorRealXY(A.db, A.libDb || A.db); }
        catch (e) { console.warn('[RP-PATH] §DOOR_REAL_AABB_ERR ' + (e && e.message)); doorRealXY = null; }
      }
      var g = RG.buildGraph(A.dbQuery, { log: function(m) { console.log('[RP-PATH] ' + m); }, doorRealXY: doorRealXY });
      _pathGraphCache = g; _pathGraphBld = A.activeBuilding;
      return g;
    }
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

  // phase-1 exports: other parts reach these through NF (same function objects)
  NF._orderedParentLabels = _orderedParentLabels;
  NF._applyParentHighlight = _applyParentHighlight;
  NF._setTreeMode = _setTreeMode;
  NF._scopeBld = _scopeBld;
  NF.buildTree = buildTree;
  NF._partsCond = _partsCond;
  NF._keywordTokenMatch = _keywordTokenMatch;
  NF._buildingClass = _buildingClass;
  NF._renderAxes = _renderAxes;
  NF._isolateLensGroup = _isolateLensGroup;
  NF._roomGraphFor = _roomGraphFor;
  NF._corridorLabelsFor = _corridorLabelsFor;

  return function () {   // phase 2: this part's setup statements, in original order
    // §FB.4: rebuild an OPEN panel when a merge finishes streaming, so the merged disciplines appear
    // without reopening. Closed panel → nothing (it rebuilds on open anyway).
    A._findRefreshTree = function(why) {
      if (NF.panel.style.display !== 'block') { console.log('§FIND_REFRESH skip=closed why=' + why); return; }
      NF.populateDropdowns();
      buildTree();
      console.log('§FIND_REFRESH why=' + why + ' mode=' + NF._treeMode + ' scope="' + _scopeBld() + '"');
    };

    // ══ §RP-T3: Axis pills — Room/Material/Phase fold INTO the toggle, data-gated ══
    // Engine: UNIFY — every axis group isolates via filterByGuids (W-LENS-ISOLATE).
    // An optional axis appears ONLY when its query returns rows (W-LENS-PROBE).
    // §RP Task A: a room has VOLUME data when spatial_structure carries center_*/size_*
    // columns AND at least one IfcSpace row is populated. _roomHasVol is cached per-open.
    NF._roomHasVol = false;
    // §FIND_ENSURE_ROOMS (ROOM_INJECTOR_NEEDLE.md, 2026-07-21): building name the Room lens has
    // already run A.ensureRooms({}) for this session, so entering/refreshing the room tree does not
    // re-fire the shared injection core on every filter keystroke / sub-toggle switch.
    NF._roomsEnsuredBld = null;
    NF.LIFT_KEYWORDS = ["liftdeur", "lift", "elevator", "aufzug", "fahrstuhl", "hoist"];
    NF.PLANT_KEYWORDS = ["vent", "duct", "fan", "ahu", "damper", "chiller", "condens", "fancoil", "pump"];
    // §ROOM_LENS_TAXONOMY (ROOM_LENS_VISUAL_HIGHLIGHT_SPEC.md §10, 2026-07-15): real evidence
    // already seen this session (Clinic doors named "M_Toilet Partition:0865 x 1500mm" near First
    // Floor R58/R59) — same word-boundary discipline as LIFT_KEYWORDS/PLANT_KEYWORDS above, applied
    // to a room's CONTAINED elements (rel_contained_in_space) rather than the room's own generic
    // "COMPILED INTERNAL" label, which carries no descriptive signal for real synthetic rooms.
    NF.RESTROOM_KEYWORDS = ["toilet", "restroom", "washroom", "lavatory", "wc"];
    NF._PARTS_GROUPS = [
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
    NF._probeCacheResult = null, _probeCacheT = 0;

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

    // ══ §RP Task A: Room volume lens — highlight room boxes, x-ray the rest ══
    // The Room axis ghosts the whole model (X-Ray) and draws a translucent cyan box at
    // each IfcSpace bbox (center+size from spatial_structure). Tapping a room brightens
    // THAT box. We do NOT inject IfcSpace meshes into the geometry stream — boxes are
    // plain THREE.Mesh added to A.scene, disposed on reset.
    NF._roomBoxes = [];      // { guid, name, mesh, center:{x,y,z} }
    NF._roomXrayWasOff = false;
    NF._hlXrayWasOff = false; // true → the Phase/Material highlight lens turned X-Ray on
    NF._mgLensOwned = false;  // cached per activeBuilding (rebuilding on every keystroke is wasteful)
    NF._pathFromGuid = '', NF._pathToGuid = '', NF._pathLastResult = null;
    NF._pathExtraMeshes = [];
    // FLY_TOUR_CORRIDOR_GRAPH.md §S2 — the Fly tour shares THIS cache (one graph per building,
    // never two). Read-only alias; invalidation stays in ensureRooms/needle above.
    A.getRoomGraph = _roomGraphFor;
  };
};
