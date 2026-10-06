// navigate_find family — part `trees` (original navigate_find.js lines 2850–3825).
// GENERATED move-only by scripts/split_closure.js (config scripts/split_configs/navigate_find.json) — edit this file
// normally from now on; regenerate only to re-split a branch that still edits the old single file. Names shared
// across parts live on `NF`; load order + the two-phase setup are in navigate_find.js.
(typeof window !== 'undefined' ? window : globalThis).__navigateFindParts = (typeof window !== 'undefined' ? window : globalThis).__navigateFindParts || {};
(typeof window !== 'undefined' ? window : globalThis).__navigateFindParts.trees = function __split_navigate_find_trees(NF, A, nav, getStartNavigation) {
  'use strict';
  // literal-valued constants, verbatim (evaluating a literal earlier changes nothing)

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
    var _rawIsolateOn = null;  // { order:[name...], byPhase:{ name:{guids:Set,count,firstTs} } }
    var _tmGenTried = false;

    // §D drill helpers ───────────────────────────────────────────────────────────
    var _PHASE_ELEM_CAP = 250;

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


    // §RP-T3 axis builders — list the groups for Room / Material / Phase.
    function _buildRoomTree() {
      // §FIND_ENSURE_ROOMS (ROOM_INJECTOR_NEEDLE.md): the Room lens reads spatial_structure /
      // rel_contained_in_space directly (below + in _isolateLensGroup) and used to depend on Fly
      // Tour / Cinema/MaxQ / DLOD-nav ('o') having called A.ensureRooms() FIRST in the same page
      // session — pure order-of-operations luck. Call the ONE shared injection core here so Find
      // stops relying on another feature to warm it. Non-force (this is NOT the needle's force:true
      // recompute button): it respects the Stage-4 version-check trust path — ~9ms when already
      // fresh, pays the real recompile only once. Guarded per-building so keystrokes/sub-toggles
      // don't re-fire it. A real self-heal (status==='injected') rebuilds the tree so the user sees
      // current (post-recompile) rooms instead of the stale set that was on screen.
      if (A.ensureRooms && NF._roomsEnsuredBld !== (A.activeBuilding || '')) {
        NF._roomsEnsuredBld = A.activeBuilding || '';
        A.ensureRooms({}).then(function(res) {
          if (res && res.status === 'injected') {
            console.log('[RP-T3] §FIND_ENSURE_ROOMS self-heal bld=' + NF._roomsEnsuredBld + ' source=' + res.source + ' rooms=' + res.rooms + ' — rebuilding room tree');
            if (NF._treeMode === 'room') NF.buildTree();
          } else {
            console.log('[RP-T3] §FIND_ENSURE_ROOMS current bld=' + NF._roomsEnsuredBld + ' status=' + (res && res.status));
          }
        }).catch(function(e) {
          NF._roomsEnsuredBld = null; // failed — allow a later room-lens entry to retry
          console.warn('[RP-T3] §FIND_ENSURE_ROOMS_ERR ' + (e && e.message));
        });
      }
      // §RP Task A: with volume data the Room axis is a HIGHLIGHT lens (rooms glow,
      // model x-rayed) — NOT a contents isolate. Tapping focuses a room (box + zoom-to-fit).
      // §RP Room sub-toggle: group rooms [Storey | Type]. Storey (default) nests rooms under
      // their IfcBuildingStorey (spatial_structure.parent_guid). Type nests by object_type/
      // predefined_type (null → "(untyped)" — non-invent; populates on DBs that carry it).
      if (NF._categoryRevealOn) { NF._revealDoorMeshes.forEach(function(m) { if (m.parent) m.parent.remove(m); if (m.geometry) m.geometry.dispose(); if (m.material) m.material.dispose(); }); NF._revealDoorMeshes = []; NF._categoryRevealOn = null; } // _roomLensOn() below rebuilds _roomBoxes from scratch — any reveal state is now stale, drop it before it leaks door meshes
      if (NF._roomHasVol) {
        NF._roomLensOn();
        if (NF.elIsoBar) {
          NF.elIsoBar.style.display = 'flex';
          if (NF.elIsoBtn) NF.elIsoBtn.style.display = 'none';
          if (NF.elShowAllBtn) NF.elShowAllBtn.style.display = '';
        }
        NF.elTree.appendChild(NF._subToggleRow([
            { label: NF._t('ui_axis_storey', 'Storey'), val: 'storey' },
            { label: NF._t('ui_room_type', 'Type'), val: 'type' },
            { label: NF._t('ui_room_path', 'Path'), val: 'path' }
          ], NF._roomGroupBy, function(v) { if (v !== NF._roomGroupBy) { NF._roomGroupBy = v; NF.buildTree(); } }));
        // §7 Path sub-mode: two-room picker + Dijkstra route over the real door-adjacency graph
        // (common/room_graph.js). Own render path — no Storey/Type grouping list underneath.
        if (NF._roomGroupBy === 'path') {
          if (NF.elIsoBar) NF.elIsoBar.style.display = 'none'; // no isolate concept for a path — it's a highlight, not a filter
          _buildPathPanel();
          console.log('[RP-T3] §LENS_GROUPS lens=room mode=path');
          return;
        }
        NF._clearPathHighlight(); // leaving Path sub-mode — drop its line/zoom-only overlay (room shells stay, dims are reset by _roomLensOn above)
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
        var corridorLabels = (NF._roomGroupBy === 'type') ? NF._corridorLabelsFor() : {};
        // §ROOM_LENS_TAXONOMY: Restrooms — one batched keyword-matched query (same SQL broad
        // pre-filter + _keywordTokenMatch word-boundary discipline as LIFT_KEYWORDS/PLANT_KEYWORDS
        // above), not N per-room queries. Maps through rel_contained_in_space's raw space_guid to
        // this room's LOGICAL guid (a §MULTI-RECT room's sub-rects all share one room_guid).
        var restroomLogicalGuids = {};
        if (NF._roomGroupBy === 'type') {
          try {
            var rawToLogical = {};
            rooms.forEach(function(r) { rawToLogical[r[0]] = r[9] || r[0]; });
            var restroomCond = NF.RESTROOM_KEYWORDS.map(function(w) { return "LOWER(m.element_name) LIKE '%" + w + "%'"; }).join(' OR ');
            var rrows = A.dbQuery("SELECT rc.space_guid, m.element_name FROM rel_contained_in_space rc" +
              " JOIN elements_meta m ON m.guid = rc.element_guid WHERE (" + restroomCond + ")");
            rrows.forEach(function(rr) {
              if (!NF._keywordTokenMatch(rr[1], NF.RESTROOM_KEYWORDS)) return;
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
        if (NF._roomGroupBy === 'type' && window.RoomHabitability && window.RoomHabitability.classifyUtilityRooms) {
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
          var gk = (NF._roomGroupBy === 'type') ? (typeKey || '(untyped)') : (r[2] || '(no storey)');
          if (seenLogical[logicalGuid]) { dupRects++; return; }   // §MULTI-RECT: 1 entry per logical room
          seenLogical[logicalGuid] = true;
          if (NF._roomGroupBy === 'type' && typeKey) typed++;
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
          var pathGraph = NF._roomGraphFor();
          if (pathGraph) {
            pathGraph.nodes.forEach(function (n) {
              if (n.guid.indexOf('CORRIDOR_ROOM::') !== 0) return;
              var gk2 = (NF._roomGroupBy === 'type') ? 'Hall / Corridor' : (n.storey || '(no storey)');
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
        if (NF._roomGroupBy === 'type') {
          try {
            var bldClassTree = NF._buildingClass();
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
            NF._PARTS_GROUPS.forEach(function(pg) {
              if (pg.type === 'STAIRWAY') return; // handled above via getStairGroups()
              // §PLANT_ROOM_GATE_FIX Bug 2, unchanged gate — carried over verbatim from the retired Parts axis.
              if (pg.type === 'PLANT_ROOM' && bldClassTree !== 'complex') {
                console.log('[RP-T3] §PARTS_CLASS_GATE type=PLANT_ROOM buildingClass=' + bldClassTree + ' -> hidden (complex-only)');
                return;
              }
              var prows = [];
              try { prows = A.dbQuery("SELECT guid, element_name FROM elements_meta WHERE (" + NF._partsCond(pg.type) + ")"); }
              catch (ePt) { console.warn('[RP-T3] §PARTS_MIGRATE_ERR', pg.type, ePt.message); }
              var words = (pg.type === 'LIFT_SHAFT') ? NF.LIFT_KEYWORDS : NF.PLANT_KEYWORDS;
              var beforeP = prows.length;
              prows = prows.filter(function(r) { return NF._keywordTokenMatch(r[1], words); });
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
            return NF._treeNode(rm.label, '', 1, { onTap: function() {
              if (rm.raw) _isolatePartsGroup(rm.label, rm.rawGuids || [rm.key]);
              else NF._roomSelect(rm.key);
            } });
          });
          // §DEPTH / §ROOM_LENS_TAXONOMY: a floor/type header tap now does the NEW lightweight
          // reveal (§3/§9 above) for a normal room group — camera stays put, that group's own
          // shells brighten + doors light up brown, tap again to clear. A raw Parts-migrated group
          // (Stairs/Lift-Shaft/Plant-Room) keeps the old isolate-drill (`_isolatePartsGroup`) —
          // those were never room volumes, there's no shell to reveal. Arrow still expands children.
          NF.elTree.appendChild(NF._treeNode(gk, groupRooms.length, 0,
            { children: kids, onTap: function() {
                if (groupRooms.length && groupRooms[0].raw) {
                  var allGuids = [];
                  groupRooms.forEach(function(rm) { (rm.rawGuids || [rm.key]).forEach(function(g) { allGuids.push(g); }); });
                  _isolatePartsGroup(gk, allGuids);
                } else NF._revealCategoryGroup(gk, groupRooms);
            } }));
        });
        console.log('[RP-T3] §LENS_GROUPS lens=room mode=volume groupBy=' + NF._roomGroupBy +
          ' groups=' + order.length + ' rooms=' + rooms.length +
          (NF._roomGroupBy === 'type' ? ' typed=' + typed + '/' + rooms.length : ''));
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
        NF.elTree.appendChild(NF._treeNode(g.label, g.count, 0, { onTap: function() { NF._isolateLensGroup('room', g); } }));
      });
      console.log('[RP-T3] §LENS_GROUPS lens=room mode=contents groups=' + groups.length);
    }

    // §7 Path sub-mode UI: a From/To room picker + Find button, results rendered as tappable
    // room rows (reusing _treeNode → _roomSelect, same as every other lens list) with the real
    // door name/guid printed between consecutive hops.
    function _buildPathPanel() {
      var graph = NF._roomGraphFor();
      var wrap = document.createElement('div');
      if (!graph || !graph.nodes.length) {
        wrap.style.cssText = 'color:#888;font-size:11px;padding:14px 10px';
        wrap.textContent = NF._t('ui_room_path_unavailable', 'No room graph available for this building.');
        NF.elTree.appendChild(wrap);
        return;
      }
      wrap.style.cssText = 'padding:8px 10px;display:flex;flex-direction:column;gap:6px';
      // §SEALED-ROOM (2026-08-03): a room the graph itself marked unreachable (common/room_graph.js
      // — zero edges even after E1/E2/E6 rescue, A*-verified) is not offered as a From/To target —
      // it still exists as real data (Room lens etc. are untouched), it just can't be routed to.
      var sorted = graph.nodes.filter(function(n) { return !n.sealed; }).sort(function(a, b) {
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
      var selFrom = mkSelect('find-path-from', NF._t('ui_room_path_from', 'From room…'));
      var selTo = mkSelect('find-path-to', NF._t('ui_room_path_to', 'To room…'));
      selFrom.value = NF._pathFromGuid; selTo.value = NF._pathToGuid;
      selFrom.addEventListener('pointerdown', function(e) { e.stopPropagation(); });
      selTo.addEventListener('pointerdown', function(e) { e.stopPropagation(); });
      selFrom.addEventListener('change', function(e) { e.stopPropagation(); NF._pathFromGuid = selFrom.value; });
      selTo.addEventListener('change', function(e) { e.stopPropagation(); NF._pathToGuid = selTo.value; });
      row1.appendChild(selFrom);
      var arrow = document.createElement('span'); arrow.textContent = '→'; arrow.style.cssText = 'color:#666;flex-shrink:0';
      row1.appendChild(arrow);
      row1.appendChild(selTo);
      wrap.appendChild(row1);

      var btn = document.createElement('button');
      btn.textContent = NF._t('ui_room_path_find', 'Find Path');
      btn.style.cssText = 'padding:6px 10px;font-size:11px;font-weight:700;border-radius:6px;cursor:pointer;' +
        'border:1px solid rgba(79,195,247,0.6);background:rgba(79,195,247,0.18);color:#fff';
      var resultBox = document.createElement('div');
      resultBox.style.cssText = 'display:flex;flex-direction:column;gap:2px';
      btn.addEventListener('pointerup', function(e) {
        e.stopPropagation();
        if (!NF._pathFromGuid || !NF._pathToGuid) {
          resultBox.innerHTML = '';
          resultBox.textContent = NF._t('ui_room_path_pick_both', 'Pick a From and a To room.');
          resultBox.style.cssText = 'font-size:11px;color:#e67e22;padding:6px 2px';
          return;
        }
        if (NF._pathFromGuid === NF._pathToGuid) {
          resultBox.innerHTML = '';
          resultBox.textContent = NF._t('ui_room_path_same', 'From and To are the same room.');
          resultBox.style.cssText = 'font-size:11px;color:#e67e22;padding:6px 2px';
          return;
        }
        var res = NF._findRoomPath(NF._pathFromGuid, NF._pathToGuid);
        NF._pathLastResult = res;
        resultBox.style.cssText = 'display:flex;flex-direction:column;gap:2px';
        _renderPathResult(resultBox, graph, res);
      });
      wrap.appendChild(btn);
      wrap.appendChild(resultBox);
      NF.elTree.appendChild(wrap);

      // Re-render a previous result if the user left and re-entered Path mode with the same picks.
      if (NF._pathLastResult && NF._pathFromGuid && NF._pathToGuid) _renderPathResult(resultBox, graph, NF._pathLastResult);
    }

    function _renderPathResult(box, graph, res) {
      box.innerHTML = '';
      if (!res) {
        var msg = document.createElement('div');
        msg.style.cssText = 'font-size:11px;color:#e67e22;padding:6px 2px';
        msg.textContent = NF._t('ui_room_path_none', 'No door-connected path — these rooms are on disconnected parts of the building.');
        box.appendChild(msg);
        return;
      }
      // §PATH_PANEL_KINDS (2026-07-25, real user screenshots `RoomsPath{Top,Front,Side}View.png`):
      // this list used to render EVERY `res.path` entry as a numbered ROOM stop and pair it with
      // `res.doors[i]` POSITIONALLY. The two arrays are neither the same length nor the same
      // sequence — `path` carries room nodes AND corridor-spine / door / stair waypoints, `doors`
      // carries one entry per traversed portal edge — so the panel showed a DOOR
      // ("M_Single-Flush:0915 x 2134mm_Wood:668663") as numbered stop 4, printed
      // "└─ door: Stair:180mm max riser 280mm going" under three corridor rows, listed the same
      // corridor twice, and headed the list "6 doors" when the route crosses 4 distinct portals
      // (one a stair, counted once per storey hop). Fixed by rendering each anchor BY ITS OWN KIND
      // straight off the path — no positional zip can go out of step — and counting portals
      // distinctly in the header. Same data, no new query.
      var stairNamePrefixes = [];
      Object.keys(graph.nodesByGuid).forEach(function(g) {
        var n = graph.nodesByGuid[g];
        if (n && n.kind === 'stairwp' && n.name) stairNamePrefixes.push(String(n.name).replace(/ \((lower|upper)\)$/, ''));
      });
      var isStairPortal = function(d) {
        var nm = String((d && d.name) || '');
        return stairNamePrefixes.some(function(p) { return p && nm.indexOf(p) === 0; });
      };
      var seen = {}, nDoor = 0, nStair = 0;
      (res.doors || []).forEach(function(d) {
        if (!d || seen[d.guid]) return;
        seen[d.guid] = 1;
        if (isStairPortal(d)) nStair++; else nDoor++;
      });
      var hdr = document.createElement('div');
      hdr.style.cssText = 'font-size:10px;color:#4fc3f7;padding:4px 2px 2px';
      hdr.textContent = nDoor + (nDoor === 1 ? ' door' : ' doors') +
        (nStair ? ' · ' + nStair + (nStair === 1 ? ' stair' : ' stairs') : '') +
        ' · ' + res.distance.toFixed(1) + 'm';
      box.appendChild(hdr);
      var stopNo = 0, lastCorridorKey = null;
      res.path.forEach(function(guid) {
        var n = graph.nodesByGuid[guid];
        if (!n) return;
        if (n.kind === 'room' || n.kind === 'exit') {
          lastCorridorKey = null;
          stopNo++;
          box.appendChild(NF._treeNode(stopNo + '. ' + n.name + ' · ' + (n.label || n.name), '', 1,
            { onTap: function() { NF._roomSelect(guid); } }));
          return;
        }
        // waypoint anchors: shown as the WAY you get there, indented under the previous stop
        var lead = '', title = '';
        if (n.kind === 'doorwp') { lead = '└─ through door: ' + n.name; title = 'door guid: ' + guid; lastCorridorKey = null; }
        else if (n.kind === 'stairwp') { lead = '└─ via stair: ' + n.name; title = 'stair waypoint: ' + guid; lastCorridorKey = null; }
        else { // spine / circ — one line per continuous corridor run, not one per bucket
          var key = 'corr|' + (n.storey || '');
          if (key === lastCorridorKey) return;
          lastCorridorKey = key;
          lead = '└─ along ' + (n.name || 'corridor');
          title = 'circulation waypoint: ' + guid;
        }
        var d = document.createElement('div');
        d.style.cssText = 'padding:2px 10px 2px 34px;font-size:9px;color:#777;display:flex;align-items:center;gap:4px';
        d.textContent = lead;
        d.title = title;
        box.appendChild(d);
      });
    }
    function _isolatePartsGroup(label, guids) {
      if (!A.db || !A.filterByGuids) return;
      if (_rawIsolateOn === label) {
        A.filterByGuids(null);
        _rawIsolateOn = null;
        if (NF.elIsoBtn) NF.elIsoBtn.style.display = '';
        if (NF.elShowAllBtn) NF.elShowAllBtn.style.display = 'none';
        if (A.markDirty) A.markDirty();
        console.log('[RP-A1] §FILTER_ISOLATE_TOGGLE_OFF lens=parts group="' + label + '"');
        return;
      }
      if (A.filterStorey) A.filterStorey(null);
      if (A.filterDisc) A.filterDisc(null);
      var set = new Set(guids);
      if (!set.size) { console.log('[RP-A1] §FILTER_ISOLATE_EMPTY lens=parts group="' + label + '"'); return; }
      NF._emitIsolate(set, 'parts="' + label + '"');
      _rawIsolateOn = label;
      if (NF.elIsoBar) {
        NF.elIsoBar.style.display = 'flex';
        if (NF.elIsoBtn) NF.elIsoBtn.style.display = 'none';
        if (NF.elShowAllBtn) NF.elShowAllBtn.style.display = '';
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
      NF.elTree.appendChild(NF._subToggleRow(
        NF._t('ui_lens_material', 'Material'), 'material', NF._t('ui_lens_category', 'Category') + ' *', 'category',
        NF._matGroupBy, function(v) { if (v !== NF._matGroupBy) { NF._matGroupBy = v; NF.buildTree(); } }));
      var rows = [];
      try { rows = A.dbQuery("SELECT guid, material_name FROM elements_meta WHERE material_name IS NOT NULL"); }
      catch(e) { console.warn('[RP-T3] §MAT_TREE_ERR', e.message); }
      if (NF._matGroupBy === 'category') {
        var byCat = {}, catOrder = [];
        rows.forEach(function(r) {
          var cat = _deriveCategory(r[1]);
          if (!byCat[cat]) { byCat[cat] = { count: 0, mats: {} }; catOrder.push(cat); }
          byCat[cat].count++; byCat[cat].mats[r[1]] = (byCat[cat].mats[r[1]] || 0) + 1;
        });
        catOrder.sort(function(a, b) { return byCat[b].count - byCat[a].count; });
        catOrder.forEach(function(cat) {
          var kids = Object.keys(byCat[cat].mats).sort().map(function(mn) {
            return NF._treeNode(mn, byCat[cat].mats[mn], 1, { onTap: function() { _materialSelectByName(mn); } });
          });
          NF.elTree.appendChild(NF._treeNode(cat + ' (derived)', byCat[cat].count, 0,
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
        NF.elTree.appendChild(NF._treeNode(mn, counts[mn], 0, { onTap: function() { _materialSelectByName(mn); } }));
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
    } // ran tmGenerateTimeline once

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
      NF._phaseCache = { order: order, byPhase: byPhase };
      return NF._phaseCache;
    }

    function _generatePhases() {
      if (NF._phaseCache) return NF._phaseCache;
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
        if (ok && typeof ok.then === 'function') {
          // §GANTT_REFOLD_HANG: the generator is async now (chunk-yielding injectGantt) — ops are
          // not in kernel_ops yet. Report generating; the next Phase-axis open re-reads kernel_ops.
          ok.then(function (good) { console.log('[RP-TB] §PHASE_LENS gen=real async-done ok=' + !!good + ' — reopen the Phase axis to read kernel_ops'); });
          console.log('[RP-TB] §PHASE_LENS gen=real source=kernel_ops status="generator running async (chunk-yield); reopen to load" phases=0');
          return null;
        }
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
      if (NF._phaseCache) { _renderPhaseList(NF._phaseCache, 'cached'); return; }
      var hint = document.createElement('div');
      hint.style.cssText = 'padding:10px;font-size:11px;color:#4fc3f7';
      hint.textContent = NF._t('ui_phase_generating', 'Timeline generating…');
      NF.elTree.appendChild(hint);
      setTimeout(function() {
        if (NF._treeMode !== 'phase') return; // user switched axis meanwhile
        var pc = _generatePhases();
        NF.elTree.innerHTML = '';
        if (!pc) {
          var msg = document.createElement('div');
          msg.style.cssText = 'padding:10px;font-size:11px;color:#888';
          msg.textContent = NF._t('ui_phase_unavailable', 'Timeline unavailable (generator not loaded).');
          NF.elTree.appendChild(msg);
          return;
        }
        _renderPhaseList(pc, 'fresh');
      }, 0);
    }         // guid → {name, cls}, lazily cached per Find-open

    function _elMeta() {
      if (NF._elMetaMap) return NF._elMetaMap;
      NF._elMetaMap = {};
      try {
        A.dbQuery("SELECT guid, element_name, ifc_class FROM elements_meta")
          .forEach(function(r) { NF._elMetaMap[r[0]] = { name: r[1], cls: r[2] }; });
      } catch(e) { /* map stays empty */ }
      return NF._elMetaMap;
    }
    function _elLabel(g) {
      var em = _elMeta()[g];
      return (em && em.name) || (em && em.cls && NF.friendlyClass(em.cls)) || (g ? g.substring(0, 10) : '?');
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
    function _zoomToGuids(set, factor) { var bb = _bboxOfGuids(set); if (bb) NF._zoomToBox(bb.center, bb.size, factor); return !!bb; }
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
      NF._pushView({
        kind: isItem ? 'item' : 'group', tag: tag, label: label, mode: NF._treeMode, isItem: isItem,
        focusGuids: Array.from(focusSet),
        parentGuids: parentSet ? Array.from(parentSet) : [],
        grandGuids: grandSet ? Array.from(grandSet) : []
      });

      NF._clearShapeOverlays();
      NF._clearHlOverlay();
      if (A.setOutline) A.setOutline([]); // §YELLOW-PICK: drop any prior item outline (group select clears it)
      // §SHELL-MODE: when the merged ghost shell is built it IS the surroundings — so drop the whole
      // x-ray machinery and the ancestor context overlays. A frame becomes: selection solid + ONE shell mesh.
      var _shell = !!(NF._mergedGhost && NF._mergedGhost.visible);
      // §MOBILE-BBOX-DEFAULT: the translucent ghost shell (_dimXrayTo whole model) is too heavy on mobile.
      // Default mobile Find/drill to the cheap bbox-wireframe shell (Alt+X envelope) — i.e. bboxes during layering.
      // §DESKTOP-BBOX-THRESHOLD: same reasoning applies on desktop once the building itself is large
      // (initial-load weight, not the per-tab-switch cost tracked separately) — extend the same default
      // there by real element count instead of gating on window._isMobile alone. Cached build → only
      // the first drill pays for it either way.
      if (!_shell && (window._isMobile || NF._isLargeBuilding())) {
        var _mg = (NF._mergedGhost && NF._mergedGhostBld === A.activeBuilding) ? NF._mergedGhost : NF._buildMergedGhost();
        if (_mg) { _mg.visible = true; _shell = true; NF._mgLensOwned = true; console.log('[MG] §BBOX_SHELL_DEFAULT Find→bbox (no heavy x-ray) mobile=' + !!window._isMobile + ' large=' + NF._isLargeBuilding() + ' lensOwned=1'); }
      }
      if (!_shell && !A.xrayOn && A.toggleXray) { A.toggleXray(); NF._hlXrayWasOff = true; } // x-ray path: rest → transparent

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
        if (NF._USE_SHELL && A.filterByGuids) { A.filterByGuids(NF._exteriorGuids()); NF._dimXrayTo(0.3); }
        else NF._dimXrayTo(baseOp);
      }
      if (NF.elIsoBar) {
        NF.elIsoBar.style.display = 'flex';
        if (NF.elIsoBtn) NF.elIsoBtn.style.display = 'none';
        if (NF.elShowAllBtn) NF.elShowAllBtn.style.display = '';
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
          var nn = NF._buildShapeMeshes(s, null, L.op >= 1 ? 1.0 : L.op);
          ancLog.push(L.op + '×' + nn);
        }
        // §YELLOW-PICK: the selected ITEM renders SOLID in its real material with a crisp YELLOW edge
        // outline — replaces the cyan shine-through, which washed out against the discipline blues
        // (user). Applies to EVERY lens (room/disc/phase/material/type). Outline the element-precise
        // overlay meshes so the glow can't bleed onto batch-neighbours (the §C OutlinePass-on-batched
        // bug). OutlinePass is desktop-only → mobile falls back to a faint yellow fill.
        var _before = NF._shapeOverlays.length;
        var _clip = opts.clipPlanes || null;
        var solid = NF._buildShapeMeshes(focusSet, null, 1.0, null, _clip);          // focus solid, real material (clipped for rooms)
        var hl = 0;
        // §ROOM_HIGHLIGHT: caller already drew its own primary highlight (the purple room cuboid) and
        // only wants the ancestor-dim/zoom-to-fit side effects from this focusSet — skip the per-element
        // yellow fill/silhouette entirely so it can't read as fragmented "cut" seams (VIEWER_FIND_PANEL_ROOM_ACCURACY.md §8).
        if (opts.suppressHighlight) {
          // no-op: hl stays 0, real materials from `solid` above still render normally (undimmed, clipped to the room volume)
        } else if (isItem && _clip) {
          // §ROOM-CLIP: room shell is confined to the cuboid via clip planes; OutlinePass can't clip,
          // so a clipped yellow fill over the real surfaces marks the room instead of the silhouette.
          hl = NF._buildShapeMeshes(focusSet, 0xffd400, null, 0.4, _clip);
        } else {
          // §YELLOW-SILHOUETTE: applies to the SELECTION whether it's a final item OR a group (storey/
          // type/disc) — the focus meshes are instanced-by-hash so a 3000-pipe group is a handful of
          // objects, cheap to outline. The selected set always reads with the same yellow silhouette.
          var _focusMeshes = [];
          for (var _fi = _before; _fi < NF._shapeOverlays.length; _fi++) _focusMeshes.push(NF._shapeOverlays[_fi].mesh);
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
            hl = NF._buildShapeMeshes(focusSet, 0xffd400, null, 0.35);               // mobile fallback: faint yellow fill
          }
        }
        var zoomed = zoomBox ? NF._zoomToBoxFill(zoomBox.center, zoomBox.size, tag + '_ZOOM', opts.zoomMult)
                   : (isItem ? _zoomToGuids(focusSet, 1.1) : NF._zoomToGroup(focusSet));
        if (A.markDirty) A.markDirty();
        console.log('[RP-TB] §' + tag + ' "' + label + '" ' + (isItem ? 'ITEM' : 'GROUP') + ' focus=' + focusN +
          ' solid=' + solid + ' hl=' + hl + ' anc=[' + ancLog.join(',') + '] base=' + baseOp +
          ' overlays=' + NF._shapeOverlays.length + ' zoom=' + (zoomed ? 'fit' : 'none') + ' xray=' + (A.xrayOn ? 'on' : 'off'));
        NF._updateSelCost(focusSet, tag + ':' + label);   // BIM→Project TASK A: indicative 5D cost on the bar
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
      return (NF._phaseCache && NF._phaseCache.byPhase[name]) ? NF._phaseCache.byPhase[name].guids : null;
    }
    function _phaseSelect(name) {
      var pc = NF._phaseCache;
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
        NF._highlightLensReset();
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
      var _dispLabels = (mode === 'disc') ? labels.map(NF.friendlyDisc) : labels;
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
        container.appendChild(NF._treeNode(_elLabel(g), '', 2, {
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
      var b = NF._phaseCache && NF._phaseCache.byPhase[phaseName];
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
            return NF._treeNode(_elLabel(g), '', 2, { onTap: function() { _elementSelect(g, phaseName); } });
          });
          container.appendChild(NF._treeNode(tk, tg.length, 1,
            { children: elKids, onTap: function() { _taskSelect(new Set(tg), tk, phaseName); } }));
        });
        console.log('[RP-TB] §PHASE_CHILDREN phase="' + phaseName + '" tasks=' + taskOrder.length + ' elems=' + guids.length);
        return;
      }
      var capped = guids.length > _PHASE_ELEM_CAP;
      guids.slice(0, _PHASE_ELEM_CAP).forEach(function(g) {
        container.appendChild(NF._treeNode(_elLabel(g), '', 1, { onTap: function() { _elementSelect(g, phaseName); } }));
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
      NF.elTree.innerHTML = '';
      var hasTasks = false;
      try { var tc = A.dbQuery("SELECT COUNT(*) FROM task_elements"); hasTasks = !!(tc.length && tc[0][0] > 0); } catch(e) {}
      pc.order.forEach(function(name) {
        var b = pc.byPhase[name];
        // Phase parent: label tap = darken+highlight+zoom the whole phase; arrow = drill open.
        NF.elTree.appendChild(NF._treeNode(name, b.count, 0, {
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

  // phase-1 exports: other parts reach these through NF (same function objects)
  NF._buildRoomTree = _buildRoomTree;
  NF._buildMaterialTree = _buildMaterialTree;
  NF._buildPhaseTree = _buildPhaseTree;
  NF._bboxOfGuids = _bboxOfGuids;
  NF._zoomToGuids = _zoomToGuids;
  NF._drillSelect = _drillSelect;
  NF._viewToDrill = _viewToDrill;
  NF._typeShapeDrill = _typeShapeDrill;
  NF._axisGroupSelect = _axisGroupSelect;
  NF._typeItemChildren = _typeItemChildren;

  return function () {   // phase 2: this part's setup statements, in original order

    // ══ §RP Task B: Phase axis = Time Machine's REAL timeline generator ══
    // Source of truth = window.tmGenerateTimeline() (time_machine.js injectGantt). It writes
    // one ELEMENT_PLACE row per element into kernel_ops (timestamp = install order,
    // parameters = JSON {phase,...}). We trigger it lazily ONCE (cached), then read
    // kernel_ops ORDER BY timestamp, grouping output_guid by parameters.phase.
    NF._phaseCache = null;     // max element leaves listed per phase/task (no silent cap)
    NF._elMetaMap = null;
  };
};
