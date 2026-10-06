// navigate_find family — part `highlight_cost` (original navigate_find.js lines 1279–1840).
// GENERATED move-only by scripts/split_closure.js (config scripts/split_configs/navigate_find.json). Below the `yield` every
// statement is the original text; the only edit is that a name owned by ANOTHER part is reached as NF.name.
// Edit this file normally from now on; regenerate only to re-split a branch that still edits the old single file.
(typeof window !== 'undefined' ? window : globalThis).__navigateFindParts = (typeof window !== 'undefined' ? window : globalThis).__navigateFindParts || {};
(typeof window !== 'undefined' ? window : globalThis).__navigateFindParts.highlight_cost = function* __split_navigate_find_highlight_cost(NF, A, nav, getStartNavigation) {
  'use strict';
  // phase 1 — publish this part's names that other parts use (same function objects; vars as live accessors)
  NF._clearPathHighlight = _clearPathHighlight;
  NF._findRoomPath = _findRoomPath;
  NF._clearHlOverlay = _clearHlOverlay;
  NF._highlightLensReset = _highlightLensReset;
  NF._clearShapeOverlays = _clearShapeOverlays;
  NF._isLargeBuilding = _isLargeBuilding;
  NF._buildMergedGhost = _buildMergedGhost;
  NF._getInstanceRows = _getInstanceRows;
  NF._instRowsForSet = _instRowsForSet;
  NF._updateSelCost = _updateSelCost;
  Object.defineProperty(NF, '_HL_CAP', { get: function () { return _HL_CAP; }, set: function (v) { _HL_CAP = v; }, enumerable: true });
  Object.defineProperty(NF, '_shapeOverlays', { get: function () { return _shapeOverlays; }, set: function (v) { _shapeOverlays = v; }, enumerable: true });
  Object.defineProperty(NF, '_mergedGhost', { get: function () { return _mergedGhost; }, set: function (v) { _mergedGhost = v; }, enumerable: true });
  Object.defineProperty(NF, '_mergedGhostBld', { get: function () { return _mergedGhostBld; }, set: function (v) { _mergedGhostBld = v; }, enumerable: true });
  Object.defineProperty(NF, '_surfaceConstructionLink', { get: function () { return _surfaceConstructionLink; }, set: function (v) { _surfaceConstructionLink = v; }, enumerable: true });
  Object.defineProperty(NF, '_showClassCost', { get: function () { return _showClassCost; }, set: function (v) { _showClassCost = v; }, enumerable: true });
  Object.defineProperty(NF, '_show4DWindow', { get: function () { return _show4DWindow; }, set: function (v) { _show4DWindow = v; }, enumerable: true });
  Object.defineProperty(NF, '_pushToErp', { get: function () { return _pushToErp; }, set: function (v) { _pushToErp = v; }, enumerable: true });
  yield;   // phase 2 resumes here, in this same scope: the original statements, in original order


    function _clearPathHighlight() {
      NF._pathExtraMeshes.forEach(function(m) {
        if (m.parent) m.parent.remove(m);
        if (m.geometry) m.geometry.dispose();
        if (m.material) m.material.dispose();
      });
      NF._pathExtraMeshes = [];
    }

    // Highlight the found path: brighten path-room shells, dim every other room shell, draw a
    // connecting line through the actual room centers (in path order), zoom to fit.
    function _drawPathHighlight(graph, result) {
      _clearPathHighlight();
      var pathSet = {}; result.path.forEach(function(g) { pathSet[g] = true; });
      NF._roomBoxes.forEach(function(rb) {
        if (rb.mesh && rb.mesh.material) {
          rb.mesh.material.opacity = pathSet[rb.guid] ? 0.55 : 0.04;
          rb.mesh.material.needsUpdate = true;
        }
      });
      if (A.scene && A.ifc2three && typeof THREE !== 'undefined') {
        // markers sit at the logical room/door waypoints (unchanged) …
        var pts = result.path.map(function(g) {
          var n = graph.nodesByGuid[g];
          var c = A.ifc2three(n.cx, n.cy, n.cz || 0);
          return new THREE.Vector3(c.x, c.y + 0.05, c.z); // +0.05 lift so the line clears room-shell faces
        });
        // … but the connecting LINE follows result.polyline — the real A*-on-walkable-raster route
        // (common/room_graph.js §RASTER-ASTAR, VIEWER_FIND_PANEL_ROOM_ACCURACY.md §13) — so it HUGS
        // real floor instead of cutting straight between graph waypoints (which §11 measured slicing
        // through walls / open atrium air). Additive: path/doors/distance and every marker/room-list/
        // zoom consumer below are UNCHANGED. Falls back to the room-center points if a stale cached
        // room_graph.js (pre-Stage-B) returns no polyline — never breaks the drawn line.
        var linePts = (result.polyline && result.polyline.length > 1) ? result.polyline.map(function(p) {
          var c = A.ifc2three(p.x, p.y, p.z || 0);
          return new THREE.Vector3(c.x, c.y + 0.05, c.z);
        }) : pts;
        if (pts.length > 1) {
          var geo = new THREE.BufferGeometry().setFromPoints(linePts);
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
          NF._pathExtraMeshes.push(line);
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
            A.scene.add(halo); NF._pathExtraMeshes.push(halo);
            var marker = new THREE.Mesh(markerGeo, markerMat);
            marker.position.copy(p); marker.renderOrder = 1005;
            A.scene.add(marker); NF._pathExtraMeshes.push(marker);
          });
          if (dotsDropped) console.log('[RP-PATH] §DOT_DROP endpoints dropped=' + dotsDropped + ' (within ' + DOT_DROP_DIST + 'm of their one neighbor)');
        }
      }
      // Zoom to fit the union of the path rooms' boxes.
      var bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
      result.path.forEach(function(g) {
        NF._roomBoxes.forEach(function(rb) {
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
        NF._zoomToBoxFill(center, size, 'ROOM_PATH_ZOOM', 1.4);
      }
      if (A.markDirty) A.markDirty();
    }

    // Run the graph + Dijkstra, log §ROOM_PATH (found) / §ROOM_PATH_NOT_FOUND (honest, no invented
    // connectivity), draw the result, and return it so the caller can render the room-list UI.
    function _findRoomPath(fromGuid, toGuid) {
      var RG = (typeof window !== 'undefined') && window.RoomGraph;
      var graph = NF._roomGraphFor();
      if (!RG || !graph) { console.warn('[RP-PATH] §ROOM_PATH_ERR RoomGraph not loaded'); return null; }
      var result = RG.shortestPath(graph, fromGuid, toGuid);
      var fromN = graph.nodesByGuid[fromGuid], toN = graph.nodesByGuid[toGuid];
      if (!result) {
        console.log('[RP-PATH] §ROOM_PATH_NOT_FOUND from=' + (fromN ? fromN.name : fromGuid) +
          ' to=' + (toN ? toN.name : toGuid) + ' — no door-connected route (disconnected component)');
        _clearPathHighlight();
        return null;
      }
      // §STOPS-VS-VIA: `rooms=[...]` used to list EVERY path anchor under a field named "rooms", which
      // is how the field came to read "12 rooms" for a 4-room route (the rest were corridor spine, door
      // and stair waypoints). Split it: `stops=` is the real room/exit sequence, `via=` is the way
      // between them. Same data, no extra query, and each field now means what it says.
      var stopNames = [], viaNames = [];
      result.path.forEach(function(g) {
        var n = graph.nodesByGuid[g] || {};
        if (n.kind === 'room' || n.kind === 'exit') stopNames.push(n.name); else viaNames.push(n.name);
      });
      var doorGuids = result.doors.map(function(d) { return d.guid; });
      // §ROOM_PATH_PRECISION (2026-07-25, §14's summary-first rule applied to this line): the old
      // form printed `hops=<doors.length> rooms=[<every path node's name>]`, which read as "12 rooms,
      // 6 doors" on the real Hospital capture when the truth was 4 distinct portals (one of them a
      // STAIR crossed on 3 storey hops, hence the same guid three times) and only 4 actual rooms —
      // the rest of `rooms=[]` were corridor-spine, door- and stair-WAYPOINTS. A reader could not
      // tell a real double-back from a repeated stair hop. Now: node KINDS are named, portals are
      // counted distinctly, and the drawn-polyline point count is on the same line, so the log alone
      // distinguishes "route revisits a door" from "one stair, three flights".
      var kindOf = function(g) { return (graph.nodesByGuid[g] || {}).kind || '?'; };
      var counts = {};
      result.path.forEach(function(g) { var k = kindOf(g); counts[k] = (counts[k] || 0) + 1; });
      var distinctDoors = {}; doorGuids.forEach(function(g) { distinctDoors[g] = (distinctDoors[g] || 0) + 1; });
      var repeated = Object.keys(distinctDoors).filter(function(g) { return distinctDoors[g] > 1; });
      console.log('[RP-PATH] §ROOM_PATH from=' + fromN.name + ' to=' + toN.name +
        ' hops=' + result.doors.length + ' portals=' + Object.keys(distinctDoors).length +
        ' anchors={' + Object.keys(counts).map(function(k) { return k + ':' + counts[k]; }).join(' ') + '}' +
        ' polyPts=' + ((result.polyline || []).length) +
        ' stops=[' + stopNames.join(',') + '] via=[' + viaNames.join(',') + ']' +
        ' doors=[' + doorGuids.join(',') + '] distance=' + result.distance.toFixed(2) + 'm' +
        (repeated.length ? ' repeatedPortals=[' + repeated.map(function(g) { return g + 'x' + distinctDoors[g]; }).join(',') + ']' : ''));
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
      if (NF._mgLensOwned && _mergedGhost) {           // §MOBILE-BBOX: lens-owned bbox shell → hide on reset (user Alt+X stays put)
        _mergedGhost.visible = false; NF._mgLensOwned = false;
        console.log('[MG] §MOBILE_BBOX_RESET hidden (lens-owned)');
      }
      if (A.xrayOn && NF._hlXrayWasOff && A.toggleXray) {
        A.toggleXray(); // WE turned x-ray on for the lens → turn it off (restores _origOpacity = 1)
        console.log('[RP-TB] §XRAY_RESTORE mode=off (lens-owned) xrayOn=' + A.xrayOn);
      } else if (A.xrayOn) {
        // §XRAY_UNDISTURB: the user had Alt+Z x-ray ON before the lens, and our _dimXrayTo overwrote
        // its normal 0.3 with the depth value (0.1/0). Put the normal x-ray opacity BACK so Alt+Z is
        // left exactly as the user had it — the depth lens must not disturb the manual x-ray.
        NF._dimXrayTo(0.3);
        console.log('[RP-TB] §XRAY_RESTORE mode=undisturb→0.3 (user-owned) xrayOn=' + A.xrayOn);
      }
      NF._hlXrayWasOff = false;
      if (A.markDirty) A.markDirty();
    }

    // Highlight a guid set: x-ray the rest (dim) + draw an element-precise box per match.
    // Returns the number of boxes drawn (element-precise meshes), capped at _HL_CAP.
    function _highlightGuids(set) {
      _clearHlOverlay();
      if (A.setOutline) A.setOutline([]);
      if (!A.scene || typeof THREE === 'undefined' || !A.ifc2three) return 0;
      if (!A.xrayOn && A.toggleXray) { A.toggleXray(); NF._hlXrayWasOff = true; }
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
        var _bCol = A._hasBuildingCol && A._hasBuildingCol(A.db) ? 'm.building' : "''";
        rows = A.dbQuery("SELECT t.center_x,t.center_y,t.center_z, t.bbox_x,t.bbox_y,t.bbox_z, m.ifc_class, m.discipline, " + _bCol +
          " FROM element_transforms t JOIN elements_meta m ON m.guid=t.guid WHERE t.center_x IS NOT NULL") || [];
      } catch (e) { console.log('[MG] §SHELL_GHOST_SKIP query ' + e.message); return null; }
      var byDisc = {};
      for (var i = 0; i < rows.length; i++) {
        var rr = rows[i]; if (!_isEnvelope(rr[6])) continue;
        var d = rr[7] || '_'; (byDisc[d] = byDisc[d] || []).push(rr);
      }
      var discs = Object.keys(byDisc);
      // §BBOX_GHOST_ALL — envelope-first, ALL-elements fallback (IFC_LARGE_PRIVATE_STRESS_TEST.md
      // §KUL002 — Witness: W-BBOX-GHOST-NOENVELOPE). _isEnvelope() matches only Wall|Slab|Roof|
      // CurtainWall|Covering|Plate. A plant/MEP model has NONE of those — KUL070 is 8 walls + 1 slab
      // in 25,029 elements — so this returned null, Alt+Z's bbox state drew nothing, and the
      // large-building shell path silently fell through to x-ray dim (that IS the "why is it
      // translucent" report). Do NOT widen _isEnvelope itself: for models that DO have an envelope
      // the filter is the point — it keeps the ghost a shell of far context (LTU 28,569 of 122,667,
      // Terminal 34,446 of 48,428). Widening globally would 4x LTU's box count and lose that meaning.
      // Falling back only when the envelope set is EMPTY changes nothing for those models and gives
      // an envelope-less model the boxes it does have. Cost is unchanged: instanced wireframe boxes
      // from element_transforms.bbox_*, one BoxGeometry + N instances (project_altx_ghost.md).
      // Threshold, not just empty: KUL070 has 9 envelope elements in 25,033 (0.04%) — non-zero, so an
      // "if empty" test misses it and the ghost still draws 9 boxes = visually nothing. Fire when the
      // envelope is absent OR negligible: <2% of elements AND <200 of them (BOTH, so a small building
      // with a genuinely thin envelope isn't caught by the ratio alone). Measured margin against the
      // fleet — nearest real case is Hospital at 4,518/63,415 = 7.1%, well clear of 2%:
      //   KUL070 9/25,033=0.04% → FALLBACK · Hospital 7.1% · JKR 12.1% · LTU 22.7% · Terminal 71.1% → unchanged.
      var _envN = 0;
      for (var k in byDisc) _envN += byDisc[k].length;
      // §BBOX_GHOST_PER_BLD (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §MERGED_DB, 2026-10-06): in a MERGED scene the
      // shell-or-all decision is per building. Road + bridge: the bridge's 587 ARC envelope pieces are 2.9 % of 19,903, so
      // the scene-wide test kept "envelope only" and the 15,164-element road (0 envelope classes) got no boxes at all.
      // One building → this block is skipped and the scene-wide rule below runs exactly as before.
      // Gate (NON-IMPACT): only a CIVIL building (rows in a rates.js SEQUENCE_CIVIL discipline) with 0 envelope elements switches
      // to "all"; every other building keeps the scene-wide rule. Fleet: 0 civil rows → Clinic's 5 buildings unchanged.
      // civil = every civil discipline code: rates.js CIVIL_RATES (includes the references CHAINAGE / ROW, which are civil but not
      // scheduled work) ∪ SEQUENCE_CIVIL — the schedule list alone left 333 references boxed by their building's envelope rule.
      var _civ = Object.assign({}, window.SEQUENCE_CIVIL || {}, window.CIVIL_RATES || {});
      var _blds = {};
      // v2 (ORDER-INDEPENDENCE, user 2026-10-06): the group is 'civil' for every civil-discipline element, else its building —
      // a one-shot import (road + bridge under one name) and two drops (two names) must draw the same boxes.
      var _grp = function (r) { return _civ[r[7]] ? '\u0000civil' : (r[8] || ''); };
      for (var bi = 0; bi < rows.length; bi++) { var bn = _grp(rows[bi]); var bs = _blds[bn] = _blds[bn] || { n: 0, env: 0, civ: 0 }; bs.n++; if (_isEnvelope(rows[bi][6])) bs.env++; if (_civ[rows[bi][7]]) bs.civ++; }
      var _bldNames = Object.keys(_blds);
      var _civBld = _bldNames.filter(function(bn) { return _blds[bn].civ > 0 && _blds[bn].env === 0; });
      if (_bldNames.length > 1 && _civBld.length) {
        var _allBld = {}, _plan = [];
        _bldNames.forEach(function(bn) { var bs = _blds[bn]; _allBld[bn] = _civBld.indexOf(bn) >= 0; _plan.push((bn === '\u0000civil' ? 'civil' : bn) + ':' + (_allBld[bn] ? 'all' : 'envelope') + ' ' + bs.env + '/' + bs.n); });
        byDisc = {};
        for (var pj = 0; pj < rows.length; pj++) {
          var pr = rows[pj]; if (!_allBld[_grp(pr)] && !_isEnvelope(pr[6])) continue;
          var pd = pr[7] || '_'; (byDisc[pd] = byDisc[pd] || []).push(pr);
        }
        discs = Object.keys(byDisc); _envN = -1;   // decided per building — skip the scene-wide fallback
        console.log('[MG] §BBOX_GHOST_PER_BLD ' + _plan.join(' · '));
      }
      if (_envN >= 0 && rows.length && (_envN === 0 || (_envN / rows.length < 0.02 && _envN < 200))) {
        byDisc = {};
        for (var j = 0; j < rows.length; j++) {
          var r2 = rows[j], d2 = r2[7] || '_';
          (byDisc[d2] = byDisc[d2] || []).push(r2);
        }
        discs = Object.keys(byDisc);
        console.log('[MG] §BBOX_GHOST_ALL envelope=' + _envN + '/' + rows.length +
          ' (' + (100 * _envN / rows.length).toFixed(2) + '%) too thin to be a shell — boxing ALL '
          + rows.length + ' elements, discs=' + discs.join(','));
      }
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
      if (g) { g.visible = true; NF._mgLensOwned = true; if (A.filterByGuids) A.filterByGuids(new Set()); }
      return { built: !!g, mgLensOwned: NF._mgLensOwned, ghostVisible: !!(g && g.visible) };
    };
    A._debugGhostLensOwned = function() { return { mgLensOwned: NF._mgLensOwned, ghostVisible: !!(_mergedGhost && _mergedGhost.visible) }; };
    A._setTreeMode = NF._setTreeMode;

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
        var a = agg[k], rt = R[a.cls], unit = rt ? rt.unit : 'EA', rate = rt ? rt.rate : 0, qty, unpriced = false;
        // §CIVIL_RATES — the SAME owner boq_charts.html uses: a civil discipline prices by DISCIPLINE (rates.js CIVIL_RATES),
        // never by the generic proxy class's building rate. rate null (no cited SoR) → qty carried, price 0, flagged unpriced.
        var _CR = (typeof window !== 'undefined' && window.CIVIL_RATES) || (typeof CIVIL_RATES !== 'undefined' ? CIVIL_RATES : null);
        var cr = (_CR && a.disc && a.disc.charAt(0) !== '_') ? _CR[a.disc] : null;
        if (cr) { rt = null; unit = cr.qtyBasis || 'EA'; rate = cr.rate != null ? cr.rate : 0; unpriced = cr.rate == null; }
        if (unit === 'M') qty = a.len; else if (unit === 'M2') qty = a.area; else if (unit === 'M3') qty = a.vol; else { unit = rt ? unit : 'EA'; qty = a.cnt; }
        elements += a.cnt;
        var row = { disc: a.disc, cls: a.cls, storey: a.storey, count: a.cnt, unit: unit, qty: qty, rate: rate, cost: Math.round(rate * qty) };
        if (unpriced) row.unpriced = true;
        priced.push(row);
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
      NF._lastSelSet = (set && set.size) ? set : null;            // remember selection for the > to ERP push
      NF._lastSelLabel = scopeLabel || '';
      // selection changed → any prior push's deep-link is now stale; hide it until this set is pushed
      if (NF.elErpOpen) { NF.elErpOpen.style.display = 'none'; NF.elErpOpen.removeAttribute('href'); NF.elErpOpen.title = 'Open the created Project Order in iDempiere (GardenWorld)'; }
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

    // ── §PROJ_PUSH / §S2 / §GOVERNANCE-GATE block — EXTRACTED VERBATIM to find_erp_push.js
    // (bim-compiler prompts/SCRIPT_LENGTH_REFACTOR_SEAMS.md §S59 candidate 2, 2026-08-23). All 8
    // functions (_ensureErpDb/_persistErpDb/_money/_foldClassTwin/_surfaceExistingOrder/
    // _surfaceConstructionLink/_showClassCost/_pushToErp) + their private helpers (_pct/_pushSfx/
    // _pushReject) moved with their comments; every dependency is passed EXPLICITLY below — the
    // closure-scope plumbing the survey named as this move's real cost. _selectionPriced/
    // _selectionCost/_updateSelCost deliberately STAYED above: no witness locks them, and per the
    // survey's own rule low witness coverage DISQUALIFIES a candidate. Locked end-to-end by
    // poc_find_erp_link_live.js + poc_construction_link_live.js (real browser, §-log asserted).
    // find_erp_push.js loads BEFORE this file in main.js's A.loadNavigate() module list.
    var _erpPush = (typeof window.FindErpPush !== 'undefined' && window.FindErpPush.create) ? window.FindErpPush.create({
      A: A, elErpOpen: NF.elErpOpen, elConstructionOpen: NF.elConstructionOpen,
      getLastSelSet: function () { return NF._lastSelSet; },      // selection state stays owned HERE (_updateSelCost writes it)
      getLastSelLabel: function () { return NF._lastSelLabel; },
      selectionPriced: _selectionPriced,                       // the inline pricing half, injected
      cur: _cur
    }) : null;
    if (!_erpPush) console.log('[RP-C] §ERP_PUSH_MODULE_ABSENT find_erp_push.js not loaded — ERP push surfaces inert (honest no-op)');
    var _surfaceExistingOrder = _erpPush ? _erpPush.surfaceExistingOrder : function () {};
    var _surfaceConstructionLink = _erpPush ? _erpPush.surfaceConstructionLink : function () {};
    var _showClassCost = _erpPush ? _erpPush.showClassCost : function () {};
    var _show4DWindow = _erpPush ? _erpPush.show4DWindow : function () {};   // S7 §S7-DO item 2, sibling of _showClassCost
    var _pushToErp = _erpPush ? _erpPush.pushToErp : function () { if (A.status) A.status.textContent = 'ERP push module not loaded'; };
    A._showClassCost = _showClassCost;   // exposed for applyFindScope + witnesses
    A._show4DWindow = _show4DWindow;
};
