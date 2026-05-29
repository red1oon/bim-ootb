/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
/**
 * grid_drag.js — Grid Line Drag Editing with Rules-Driven Cascade
 *
 * Implementing 2D_024 spec — Witness: W-GRID-DRAG
 *
 * Single concern: pointer event handling + constraint logic for grid line
 * repositioning. After each drag gesture, cascades furniture/device/switch
 * positions per clearance rules from grid_rules.json. Shadow outlines show
 * proposed positions before commit.
 *
 * ALL constants come from grid_rules.json — zero hardcoded values.
 *
 * API:
 *   GridDrag.init(APP, state)        — wire pointer events
 *   GridDrag.loadRules(json)         — load rules from parsed JSON object
 *   GridDrag.enabled()               — true if drag in progress
 *   GridDrag.history()               — array of compound undo records
 *   GridDrag.undo()                  — revert last drag + cascade
 *   GridDrag.clamp(pos, idx, positions, axis, env, rules) — constraint maths
 *   GridDrag.snap(pos, snapM)        — snap to grid
 *   GridDrag.cascadeElements(axis, idx, oldPos, newPos, gridLines, db, rules) — cascade maths
 *   GridDrag.rules()                 — current rules (for tests)
 *
 * Log tags: §GRID_DRAG, §GRID_CASCADE, §GRID_SHADOW, §GRID_RULES
 */
var GridDrag = (function() {
  'use strict';

  // ── Rules (loaded from grid_rules.json, never hardcoded) ────────
  var R = null;  // parsed grid_rules.json

  // ── State ───────────────────────────────────────────────────────
  var A = null;            // APP reference
  var st = null;           // grid overlay state object
  var dragging = false;    // currently dragging?
  var dragLabel = null;    // label of line being dragged
  var dragAxis = null;     // 'X' or 'Y'
  var dragIdx = -1;        // index into xLines or yLines
  var dragStartIFC = 0;    // IFC position at drag start
  var origEnv = null;      // original building envelope (frozen at first drag)
  var hist = [];           // compound undo history
  var shadowGroup = null;  // THREE.Group for shadow outlines
  var longPressTimer = null; // long-press gate timer
  var longPressReady = false; // true after long press confirmed
  var pendingDown = null;     // stored pointerdown event for deferred drag start
  var LONG_PRESS_MS = 400;    // hold time before drag activates

  function log(msg) { console.log('[GridDrag] ' + msg); }

  // ── Rules loader ───────────────────────────────────────────────

  function loadRules(json) {
    R = json;
    log('§GRID_RULES loaded grid_move=' + JSON.stringify(R.grid_move) +
        ' clearance_count=' + (R.clearance || []).length);
  }

  function rules() { return R; }

  // ── Maths (all values from R.grid_move) ────────────────────────

  /** Snap position to grid (Rule 4) — snap_m from rules */
  function snap(pos, snapM) {
    var s = (snapM != null) ? snapM : R.grid_move.snap_m;
    return Math.round(pos / s) * s;
  }

  /**
   * Clamp a grid position within constraints (Rules 1-3 + max_step_m).
   * @param {number} pos        — proposed IFC position
   * @param {number} idx        — index in sorted positions array
   * @param {number[]} positions — all positions on this axis
   * @param {string} axis       — 'X' or 'Y'
   * @param {Object} envelope   — original building envelope {xMin,xMax,yMin,yMax}
   * @param {Object} moveRules  — R.grid_move or compatible object
   * @param {number} [startPos] — position at drag start (for max_step_m)
   * @returns {number} clamped position
   */
  function clamp(pos, idx, positions, axis, envelope, moveRules, startPos) {
    var mr = moveRules || R.grid_move;
    var n = positions.length;

    // Rule 1: cannot cross neighbours (min bay width)
    var lo = (idx > 0)     ? positions[idx - 1] + mr.min_bay_m : -Infinity;
    var hi = (idx < n - 1) ? positions[idx + 1] - mr.min_bay_m :  Infinity;

    // Rule 3: outermost grids have envelope limit
    if (idx === 0) {
      var envMin = (axis === 'X') ? envelope.xMin : envelope.yMin;
      lo = Math.max(lo, envMin - mr.max_extend_m);
    }
    if (idx === n - 1) {
      var envMax = (axis === 'X') ? envelope.xMax : envelope.yMax;
      hi = Math.min(hi, envMax + mr.max_extend_m);
    }

    // max_step_m: limit per gesture
    if (startPos != null && mr.max_step_m > 0) {
      lo = Math.max(lo, startPos - mr.max_step_m);
      hi = Math.min(hi, startPos + mr.max_step_m);
    }

    return Math.max(lo, Math.min(hi, pos));
  }

  // ── Cascade: reposition elements in affected bays ──────────────

  /**
   * Compute new positions for elements in affected bays after a grid line move.
   * Pure maths — no DOM/scene mutation. Returns array of {guid, oldX, oldY, newX, newY}.
   *
   * @param {string} axis     — 'X' or 'Y'
   * @param {number} idx      — index of moved grid line
   * @param {number} oldPos   — original IFC position of moved line
   * @param {number} newPos   — new IFC position of moved line
   * @param {Object[]} gridLines — sorted [{label, position}] on this axis
   * @param {Object} db       — sql.js database
   * @param {Object[]} clearanceRules — R.clearance array
   * @returns {Object[]} moves — [{guid, ifcClass, oldX, oldY, newX, newY, strategy}]
   */
  function cascadeElements(axis, idx, oldPos, newPos, gridLines, db, clearanceRules) {
    if (!db || !clearanceRules || !clearanceRules.length) return [];
    var delta = newPos - oldPos;
    if (Math.abs(delta) < 0.001) return [];

    // Build class filter from clearance rules
    var classSet = {};
    var ruleMap = {};
    for (var c = 0; c < clearanceRules.length; c++) {
      classSet[clearanceRules[c].class] = true;
      ruleMap[clearanceRules[c].class] = clearanceRules[c];
    }
    var classList = Object.keys(classSet);
    if (!classList.length) return [];

    // Affected bays: the bay before and after the moved grid line
    // Bay before: grid[idx-1] .. grid[idx] (old positions)
    // Bay after:  grid[idx]   .. grid[idx+1] (old positions)
    var bayRanges = [];
    if (idx > 0) {
      bayRanges.push({
        lo: gridLines[idx - 1].position,
        hi: oldPos,
        loNew: gridLines[idx - 1].position,
        hiNew: newPos,
        side: 'before'
      });
    }
    if (idx < gridLines.length - 1) {
      bayRanges.push({
        lo: oldPos,
        hi: gridLines[idx + 1].position,
        loNew: newPos,
        hiNew: gridLines[idx + 1].position,
        side: 'after'
      });
    }

    // Query elements in affected bays
    var coordCol = (axis === 'X') ? 'center_x' : 'center_y';
    var classPlaceholders = classList.map(function() { return '?'; }).join(',');
    var moves = [];

    for (var b = 0; b < bayRanges.length; b++) {
      var bay = bayRanges[b];
      var sql = 'SELECT t.guid, t.center_x, t.center_y, m.ifc_class ' +
                'FROM element_transforms t JOIN elements_meta m ON t.guid = m.guid ' +
                'WHERE m.ifc_class IN (' + classPlaceholders + ') ' +
                'AND t.' + coordCol + ' >= ? AND t.' + coordCol + ' <= ?';
      var params = classList.concat([bay.lo, bay.hi]);

      try {
        var result = db.exec(sql, params);
        if (!result || !result.length) continue;
        var rows = result[0].values;

        for (var r = 0; r < rows.length; r++) {
          var guid = rows[r][0];
          var cx = rows[r][1];
          var cy = rows[r][2];
          var cls = rows[r][3];
          var rule = ruleMap[cls];
          if (!rule) continue;

          var move = applyStrategy(rule.strategy, axis, cx, cy, bay, rule);
          if (move) {
            move.guid = guid;
            move.ifcClass = cls;
            move.strategy = rule.strategy;
            moves.push(move);
            log('§GRID_CASCADE guid=' + guid + ' class=' + cls + ' strategy=' + rule.strategy +
                ' old=(' + cx.toFixed(3) + ',' + cy.toFixed(3) + ')' +
                ' new=(' + move.newX.toFixed(3) + ',' + move.newY.toFixed(3) + ')');
          }
        }
      } catch (e) {
        log('§GRID_CASCADE query error: ' + e.message);
      }
    }

    log('§GRID_CASCADE axis=' + axis + ' idx=' + idx + ' delta=' + delta.toFixed(3) +
        ' elements=' + moves.length);
    return moves;
  }

  /**
   * Apply a positioning strategy to compute new element position.
   * @returns {Object|null} {oldX, oldY, newX, newY} or null if no move needed
   */
  function applyStrategy(strategy, axis, cx, cy, bay, rule) {
    var oldWidth = bay.hi - bay.lo;
    var newWidth = bay.hiNew - bay.loNew;
    if (oldWidth < 0.001) return null;

    // Normalised position within old bay (0..1)
    var coord = (axis === 'X') ? cx : cy;
    var t = (coord - bay.lo) / oldWidth;

    var newCoord;
    if (strategy === 'proportional') {
      // Scale position proportionally within new bay
      newCoord = bay.loNew + t * newWidth;
      // Enforce grid_min_m clearance from bay edges
      var gm = rule.grid_min_m || 0;
      newCoord = Math.max(bay.loNew + gm, Math.min(bay.hiNew - gm, newCoord));
    } else if (strategy === 'pin_to_wall') {
      // Stay at same distance from nearest bay edge (wall)
      var distLo = coord - bay.lo;
      var distHi = bay.hi - coord;
      if (distLo <= distHi) {
        // Pinned to low side
        newCoord = bay.loNew + distLo;
      } else {
        // Pinned to high side
        newCoord = bay.hiNew - distHi;
      }
      // Enforce wall_min_m
      var wm = rule.wall_min_m || 0;
      newCoord = Math.max(bay.loNew + wm, Math.min(bay.hiNew - wm, newCoord));
    } else if (strategy === 'center_bay') {
      // Place at center of new bay
      newCoord = (bay.loNew + bay.hiNew) / 2;
    } else {
      return null; // unknown strategy
    }

    // Build result
    var newX = (axis === 'X') ? newCoord : cx;
    var newY = (axis === 'Y') ? newCoord : cy;

    // Skip if no meaningful movement
    if (Math.abs(newX - cx) < 0.001 && Math.abs(newY - cy) < 0.001) return null;

    return { oldX: cx, oldY: cy, newX: newX, newY: newY };
  }

  // ── Shadow outlines ────────────────────────────────────────────

  /** Create shadow outline boxes for proposed element moves */
  function showShadows(moves) {
    clearShadows();
    if (!moves.length || !A || !A.scene) return;
    if (!R || !R.shadow) return;

    shadowGroup = new THREE.Group();
    shadowGroup.name = 'gridDragShadows';

    var color = new THREE.Color(R.shadow.color || '#ff6600');
    var opacity = R.shadow.opacity || 0.35;

    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      // Query bbox for this element
      var bbox = getElementBBox(m.guid);
      if (!bbox) continue;

      // Create wireframe box at new position
      var geom = new THREE.BoxGeometry(bbox.bx, bbox.bz, bbox.by); // Three: x=ifcX, y=ifcZ(up), z=ifcY(depth)
      var edges = new THREE.EdgesGeometry(geom);
      var mat = new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: opacity });
      var outline = new THREE.LineSegments(edges, mat);

      // Position in Three.js coords
      var tp = A.ifc2three(m.newX, m.newY, bbox.cz);
      outline.position.set(tp.x, tp.y, tp.z);
      outline.renderOrder = 1001;
      outline.userData.shadowGuid = m.guid;
      shadowGroup.add(outline);
    }

    A.scene.add(shadowGroup);
    A.markDirty();
    log('§GRID_SHADOW created=' + shadowGroup.children.length + ' outlines');
  }

  /** Remove all shadow outlines */
  function clearShadows() {
    if (shadowGroup && A && A.scene) {
      shadowGroup.traverse(function(obj) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
      A.scene.remove(shadowGroup);
    }
    shadowGroup = null;
  }

  // ── Drag visual feedback — red=origin, blue=proposed ────────────
  //
  // Red (ghost): where the grid line WAS — stays at the original position
  //   throughout the drag so the user always sees "where I came from."
  // Blue (proposed): where the grid line IS NOW — follows the pointer,
  //   shows "where it would land if I release."
  // Both are thin slabs spanning the building width, half-transparent.

  var dragGhostMesh = null;   // red — original position
  var dragProposedMesh = null; // blue — current proposed position

  /** Create a thin slab line at a single grid position */
  function makeDragSlab(axis, pos, color, opacity) {
    if (!st || !st.envCache || !A || !A.scene || !A.ifc2three) return null;
    var env = st.envCache;
    var halfW = 0.05; // 50mm wide slab — thin line, not a band

    var p0, p1, p2, p3;
    if (axis === 'X') {
      p0 = A.ifc2three(pos - halfW, env.yMin, env.zMin);
      p1 = A.ifc2three(pos + halfW, env.yMin, env.zMin);
      p2 = A.ifc2three(pos + halfW, env.yMax, env.zMin);
      p3 = A.ifc2three(pos - halfW, env.yMax, env.zMin);
    } else {
      p0 = A.ifc2three(env.xMin, pos - halfW, env.zMin);
      p1 = A.ifc2three(env.xMax, pos - halfW, env.zMin);
      p2 = A.ifc2three(env.xMax, pos + halfW, env.zMin);
      p3 = A.ifc2three(env.xMin, pos + halfW, env.zMin);
    }
    var groundY = p0.y - 0.02;
    var positions = new Float32Array([
      p0.x, groundY, p0.z,  p1.x, groundY, p1.z,  p2.x, groundY, p2.z,
      p0.x, groundY, p0.z,  p2.x, groundY, p2.z,  p3.x, groundY, p3.z
    ]);
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    var mat = new THREE.MeshBasicMaterial({
      color: color, transparent: true, opacity: opacity,
      side: THREE.DoubleSide, depthTest: false
    });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 998;
    A.scene.add(mesh);
    return mesh;
  }

  /** Dispose a drag slab mesh */
  function disposeSlab(mesh) {
    if (mesh && A && A.scene) {
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) mesh.material.dispose();
      A.scene.remove(mesh);
    }
    return null;
  }

  /** Show red ghost at origin (called once on drag start) */
  function showDragGhost(axis, originPos) {
    dragGhostMesh = disposeSlab(dragGhostMesh);
    dragGhostMesh = makeDragSlab(axis, originPos, 0xcc2222, 0.18);
  }

  /** Update blue proposed position (called on every pointer move) */
  function showDragBand(axis, fromPos, toPos) {
    dragProposedMesh = disposeSlab(dragProposedMesh);
    dragProposedMesh = makeDragSlab(axis, toPos, 0x2266cc, 0.22);
  }

  /** Clear both ghost and proposed */
  function clearDragBand() {
    dragGhostMesh = disposeSlab(dragGhostMesh);
    dragProposedMesh = disposeSlab(dragProposedMesh);
  }

  /** Get element bounding box from DB */
  function getElementBBox(guid) {
    if (!A || !A.db) return null;
    try {
      var r = A.db.exec(
        'SELECT center_x, center_y, center_z, bbox_x, bbox_y, bbox_z FROM element_transforms WHERE guid = ?',
        [guid]
      );
      if (!r || !r.length || !r[0].values.length) return null;
      var v = r[0].values[0];
      return { cx: v[0], cy: v[1], cz: v[2], bx: v[3], by: v[4], bz: v[5] };
    } catch (e) { return null; }
  }

  /** Move scene meshes matching cascade moves (visual sync with DB).
   *  direction: +1 = apply (forward), -1 = revert (undo) */
  function moveSceneMeshes(moves, direction) {
    if (!A || !A.scene || !moves.length) return;
    // Build guid→delta map in IFC coords
    var deltas = {};
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      deltas[m.guid] = {
        dx: (m.newX - m.oldX) * direction,
        dy: (m.newY - m.oldY) * direction
      };
    }
    // Traverse scene, shift matching meshes
    // ifc2three: dx_ifc → dx_three, dy_ifc → -dz_three
    var moved = 0;
    A.scene.traverse(function(obj) {
      if (!obj.isMesh || !obj.userData || !obj.userData.guid) return;
      var d = deltas[obj.userData.guid];
      if (!d) return;
      obj.position.x += d.dx;
      obj.position.z += -d.dy;
      moved++;
    });
    log('§DRAG_SCENE_MOVE meshes_moved=' + moved + ' elements=' + moves.length +
        ' direction=' + (direction > 0 ? 'forward' : 'revert'));
  }

  // ── Coordinate helpers ─────────────────────────────────────────

  /** Convert pointer event to IFC position on drag axis via ground-plane raycast */
  function pointerToIFC(evt) {
    if (!A || !A.camera || !A.renderer) return null;
    var rect = A.renderer.domElement.getBoundingClientRect();
    var ndcX = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
    var ndcY = -((evt.clientY - rect.top) / rect.height) * 2 + 1;

    var ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), A.camera);

    var entry = st.lineMeshes[dragLabel];
    var planeY = entry ? entry.v0.y : 0;
    var plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
    var hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plane, hit)) return null;

    if (dragAxis === 'X') {
      return hit.x + A.modelOffset.x;
    } else {
      return -hit.z + A.modelOffset.y;
    }
  }

  // ── Update scene objects ───────────────────────────────────────

  /** Shift a grid line + its bubbles by an IFC delta along its axis */
  function shiftLine(label, axis, delta) {
    var entry = st.lineMeshes[label];
    if (!entry) return;

    var dx = 0, dz = 0;
    if (axis === 'X') { dx = delta; } else { dz = -delta; }

    // Update line geometry
    var posAttr = entry.line.geometry.getAttribute('position');
    var arr = posAttr.array;
    arr[0] += dx; arr[2] += dz;
    arr[3] += dx; arr[5] += dz;
    posAttr.needsUpdate = true;

    entry.v0.x += dx; entry.v0.z += dz;
    entry.v1.x += dx; entry.v1.z += dz;
    entry.line.userData.gridPos += delta;

    // Shift bubbles
    if (st.gridGroup) {
      st.gridGroup.traverse(function(obj) {
        if (obj.isSprite && obj.userData.gridLabel === label) {
          obj.position.x += dx;
          obj.position.z += dz;
        }
      });
    }
  }

  function updateGridData(axis, idx, newPos) {
    var lines = (axis === 'X') ? st.gridData.xLines : st.gridData.yLines;
    if (lines && lines[idx]) lines[idx].position = newPos;
  }

  function rebuildAnnotations() {
    if (typeof DimChains !== 'undefined' && st.gridGroup && st.gridData && st.envCache) {
      DimChains.remove(st.gridGroup);
      DimChains.build(A, st.gridGroup, st.gridData, st.envCache, { bubbleScale: st.bubbleScale });
    }
    if (st.rebuildPanel) st.rebuildPanel(st.gridData);
  }

  // ── Drag event handlers ────────────────────────────────────────

  function onPointerDown(evt) {
    if (!st || !st.active || !st.gridGroup || !st.lineMeshes) return;
    if (!R) { log('§GRID_DRAG no rules loaded — drag disabled'); return; }
    if (evt.button !== 0) return;

    // Raycast to check if pointer is on a grid line/bubble
    var rect = A.renderer.domElement.getBoundingClientRect();
    var ndcX = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
    var ndcY = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
    var mouse = new THREE.Vector2(ndcX, ndcY);
    var ray = new THREE.Raycaster();
    ray.setFromCamera(mouse, A.camera);
    ray.params.Line = { threshold: 0.5 };

    var targets = [];
    st.gridGroup.traverse(function(obj) {
      if (obj.userData && obj.userData.gridLabel) targets.push(obj);
    });

    var hits = ray.intersectObjects(targets, false);
    if (!hits.length) return;

    var label = hits[0].object.userData.gridLabel;
    var axis = hits[0].object.userData.gridAxis;
    if (!axis && st.lineMeshes[label]) {
      axis = st.lineMeshes[label].line.userData.gridAxis;
    }
    if (!label || !axis) return;

    // Long-press gate: store pending drag, activate after LONG_PRESS_MS
    pendingDown = { label: label, axis: axis, evt: evt };
    longPressReady = false;
    if (longPressTimer) clearTimeout(longPressTimer);
    longPressTimer = setTimeout(function() {
      if (!pendingDown) return;
      longPressReady = true;
      startDrag(pendingDown.label, pendingDown.axis, pendingDown.evt);
    }, LONG_PRESS_MS);
  }

  /** Activate drag after long press confirmed */
  function startDrag(label, axis, evt) {
    var lines = (axis === 'X') ? st.gridData.xLines : st.gridData.yLines;
    var idx = -1;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].label === label) { idx = i; break; }
    }
    if (idx < 0) return;

    // Freeze original envelope on first drag
    if (!origEnv) {
      origEnv = {
        xMin: st.envCache.xMin, xMax: st.envCache.xMax,
        yMin: st.envCache.yMin, yMax: st.envCache.yMax
      };
    }

    dragging = true;
    dragLabel = label;
    dragAxis = axis;
    dragIdx = idx;
    dragStartIFC = lines[idx].position;

    if (st.lineMeshes[label]) {
      st.lineMeshes[label].line.material.color.setHex(0xff6600);
      st.lineMeshes[label].line.material.linewidth = 3;
    }
    if (A.controls) A.controls.enabled = false;

    // Red ghost at original position — "this is what you're holding"
    showDragGhost(dragAxis, dragStartIFC);

    // Status hint — tell the user what they can do
    if (A.status) {
      var bayInfo = '';
      if (idx > 0) bayInfo = ' | bay ' + lines[idx - 1].label + '-' + label + ': ' + ((lines[idx].position - lines[idx - 1].position) * 1000).toFixed(0) + 'mm';
      A.status.textContent = 'Dragging grid ' + label + ' (' + axis + ' @ ' + (dragStartIFC * 1000).toFixed(0) + 'mm)' + bayInfo;
    }

    // Implementing 2D_029 §3.3 — Witness: W-2D29
    // Show 3D grid planes on drag activation
    if (st && st.renderGridPlanesIn3D && st.gridData && st.envCache) {
      st.renderGridPlanesIn3D(st.gridData, st.envCache, R);
    }

    evt.preventDefault();
    evt.stopPropagation();
    log('§GRID_3D_DRAG axis=' + axis + ' label=' + label +
        ' from=' + dragStartIFC.toFixed(3));
    log('§GRID_DRAG start (long-press) label=' + label + ' axis=' + axis + ' idx=' + idx +
        ' pos=' + dragStartIFC.toFixed(3) + ' max_step=' + R.grid_move.max_step_m);
  }

  function onPointerMove(evt) {
    // If pointer moves before long-press completes, cancel — it's a pan/orbit, not drag
    if (pendingDown && !longPressReady) {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      pendingDown = null;
    }
    if (!dragging) return;

    var ifcPos = pointerToIFC(evt);
    if (ifcPos == null) return;

    var lines = (dragAxis === 'X') ? st.gridData.xLines : st.gridData.yLines;
    var positions = [];
    for (var i = 0; i < lines.length; i++) positions.push(lines[i].position);

    // Clamp with max_step_m from drag start
    var clamped = clamp(ifcPos, dragIdx, positions, dragAxis, origEnv, R.grid_move, dragStartIFC);
    var snapped = snap(clamped);

    var currentPos = lines[dragIdx].position;
    var delta = snapped - currentPos;
    if (Math.abs(delta) < 0.001) return;

    shiftLine(dragLabel, dragAxis, delta);
    updateGridData(dragAxis, dragIdx, snapped);
    rebuildAnnotations();

    // Live status: show from→to delta and current bay widths
    if (A.status) {
      var totalDelta = snapped - dragStartIFC;
      var sign = totalDelta >= 0 ? '+' : '';
      var bayStr = '';
      if (dragIdx > 0) bayStr = ' | bay: ' + ((snapped - lines[dragIdx - 1].position) * 1000).toFixed(0) + 'mm';
      if (dragIdx < lines.length - 1) bayStr += ' | ' + ((lines[dragIdx + 1].position - snapped) * 1000).toFixed(0) + 'mm';
      A.status.textContent = 'Grid ' + dragLabel + ': ' + sign + (totalDelta * 1000).toFixed(0) + 'mm' + bayStr;
    }

    // Orange band: highlight the drag range (from→to) on the grid overlay
    showDragBand(dragAxis, dragStartIFC, snapped);

    // Show shadow outlines for cascaded elements during drag
    var cascadeMoves = cascadeElements(
      dragAxis, dragIdx, dragStartIFC, snapped, lines, A.db, R.clearance
    );
    showShadows(cascadeMoves);

    A.markDirty();
    evt.preventDefault();
  }

  function onPointerUp(evt) {
    // Cancel long-press timer if released before threshold
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    pendingDown = null;
    longPressReady = false;
    if (!dragging) return;
    if (A.controls) A.controls.enabled = true;

    var lines = (dragAxis === 'X') ? st.gridData.xLines : st.gridData.yLines;
    var newPos = lines[dragIdx].position;
    var delta = newPos - dragStartIFC;

    if (Math.abs(delta) > 0.001) {
      // Compute final cascade
      var cascadeMoves = cascadeElements(
        dragAxis, dragIdx, dragStartIFC, newPos, lines, A.db, R.clearance
      );

      // Compound undo record: grid move + all cascaded elements
      var record = {
        grid: {
          label: dragLabel,
          axis: dragAxis,
          idx: dragIdx,
          oldPos: dragStartIFC,
          newPos: newPos,
          delta: delta
        },
        elements: cascadeMoves
      };
      hist.push(record);

      // Implementing 2D_031 §1 — Witness: W-2D31
      // Persist cascade element positions to element_transforms DB
      if (A.db && cascadeMoves.length) {
        for (var ci = 0; ci < cascadeMoves.length; ci++) {
          var cm = cascadeMoves[ci];
          try {
            A.db.run('UPDATE element_transforms SET center_x = ?, center_y = ? WHERE guid = ?',
                     [cm.newX, cm.newY, cm.guid]);
          } catch (e) { log('§DRAG_PERSIST_ERR guid=' + cm.guid + ' ' + e.message); }
        }
        log('§DRAG_PERSIST updated ' + cascadeMoves.length + ' element_transforms rows');
      }

      // Move scene meshes to match DB (visual sync)
      moveSceneMeshes(cascadeMoves, +1);

      // Implementing 2D_029 §4.3 — Witness: W-2D29
      // Commit grid move to kernel_ops log for persistence + undo
      if (window.KernelOps && A.db) {
        KernelOps.commitOp(A.db, 'GRID_MOVE', {
          axis:  dragAxis,
          label: dragLabel,
          from:  dragStartIFC,
          to:    newPos,
          cascade: cascadeMoves
        });
      }

      // Implementing 2D_029 §5 — Witness: W-2D29
      // Refresh cost panel with updated grid scope
      if (window.CostPanel && st && st.gridData) {
        CostPanel.refresh(A, st.gridData);
      }

      log('§GRID_3D_DRAG_END axis=' + dragAxis + ' label=' + dragLabel +
          ' final=' + newPos.toFixed(3) + ' cascaded=' + cascadeMoves.length);
      log('§GRID_DRAG label=' + dragLabel + ' axis=' + dragAxis +
          ' oldPos=' + dragStartIFC.toFixed(3) + ' newPos=' + newPos.toFixed(3) +
          ' delta=' + (delta >= 0 ? '+' : '') + delta.toFixed(3) +
          ' cascaded=' + cascadeMoves.length);
    } else {
      log('§GRID_DRAG cancel label=' + dragLabel + ' (no movement)');
    }

    // Clear shadows and drag band
    clearShadows();
    clearDragBand();

    // Reset visual
    if (st.lineMeshes[dragLabel]) {
      var defColor = A.lightTheme ? 0x444444 : 0xcccccc;
      st.lineMeshes[dragLabel].line.material.color.setHex(defColor);
      st.lineMeshes[dragLabel].line.material.linewidth = 1;
    }

    // Status: confirm the move or cancellation
    if (A.status) {
      if (Math.abs(delta) > 0.001) {
        A.status.textContent = 'Grid ' + dragLabel + ' moved ' + (delta >= 0 ? '+' : '') + (delta * 1000).toFixed(0) + 'mm — ' + cascadeMoves.length + ' elements cascaded';
      } else {
        A.status.textContent = 'Grid mode — ' + ((st.gridData.xLines || []).length + (st.gridData.yLines || []).length) + ' grid lines';
      }
    }

    // Implementing 2D_029 §3.3 — Witness: W-2D29
    // Remove 3D planes on drag end
    if (st && st.removeGridPlanes3D) st.removeGridPlanes3D();

    dragging = false;
    dragLabel = null;
    dragAxis = null;
    dragIdx = -1;

    A.markDirty();
    evt.preventDefault();
  }

  // ── Undo (compound: grid + cascade) ────────────────────────────

  function undo() {
    if (!hist.length) { log('§GRID_DRAG undo — nothing to undo'); return false; }
    var rec = hist.pop();

    // Revert grid line
    var g = rec.grid;
    var reverseDelta = g.oldPos - g.newPos;
    shiftLine(g.label, g.axis, reverseDelta);
    updateGridData(g.axis, g.idx, g.oldPos);
    rebuildAnnotations();

    log('§GRID_DRAG undo grid label=' + g.label + ' restored=' + g.oldPos.toFixed(3));

    // Revert cascaded elements in DB (restore oldPos)
    for (var i = 0; i < rec.elements.length; i++) {
      var el = rec.elements[i];
      if (A.db) {
        try {
          A.db.run('UPDATE element_transforms SET center_x = ?, center_y = ? WHERE guid = ?',
                   [el.oldX, el.oldY, el.guid]);
        } catch (e) { log('§DRAG_UNDO_PERSIST_ERR guid=' + el.guid + ' ' + e.message); }
      }
      log('§GRID_CASCADE undo guid=' + el.guid + ' class=' + el.ifcClass +
          ' restored=(' + el.oldX.toFixed(3) + ',' + el.oldY.toFixed(3) + ')');
    }
    log('§DRAG_UNDO_PERSIST reverted ' + rec.elements.length + ' element_transforms rows');

    // Revert scene meshes to old positions (visual sync)
    moveSceneMeshes(rec.elements, -1);

    clearShadows();
    A.markDirty();
    log('§GRID_DRAG undo complete — grid + ' + rec.elements.length + ' elements reverted');
    return true;
  }

  // ── Init ───────────────────────────────────────────────────────

  function init(APP, state) {
    A = APP;
    st = state;
    hist = [];
    origEnv = null;

    var canvas = A.renderer.domElement;
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);

    // Auto-load rules from grid_rules.json via fetch
    // §S282c: route through loadJsonWithOverrides so Settings edits (json_grid_rules) apply.
    if (!R) {
      var rulesUrl = 'grid_rules.json?v=2';
      var rulesLoader = (typeof window.loadJsonWithOverrides === 'function')
        ? window.loadJsonWithOverrides(rulesUrl, 'json_grid_rules')
        : fetch(rulesUrl).then(function(resp) {
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            return resp.json();
          });
      rulesLoader.then(function(json) {
        loadRules(json);
        // Implementing 2D_028 §5.1 — Witness: W-2D28
        // Share loaded rules globally so grid_overlay + section_cut can consume them
        window._gridRules = json;
        log('§GRID_RULES loaded — shared to window._gridRules');
      }).catch(function(e) {
        log('§GRID_RULES WARN: could not load grid_rules.json — ' + e.message);
      });
    }

    // Implementing 2D_029 §4.4 — Witness: W-2D29
    // Ctrl+Z = undo last kernel_op, Ctrl+Shift+Z = redo
    document.addEventListener('keydown', function (e) {
      if (!A || !A.db || !window.KernelOps) return;
      if (!st || !st.active) return;
      var key = (e.key || '').toLowerCase();
      if (e.ctrlKey && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        var op = KernelOps.undoOp(A.db);
        log('§GRID_UNDO attempt op=' + (op ? op.op_type : 'none'));
        if (op && op.op_type === 'GRID_MOVE') {
          applyReplayedMove(op.parameters.axis, op.parameters.label, op.parameters.from,
                            op.parameters.cascade, -1);
        }
      }
      if ((e.ctrlKey && key === 'z' && e.shiftKey) || (e.ctrlKey && key === 'y')) {
        e.preventDefault();
        var op = KernelOps.redoOp(A.db);
        log('§GRID_REDO attempt op=' + (op ? op.op_type : 'none'));
        if (op && op.op_type === 'GRID_MOVE') {
          applyReplayedMove(op.parameters.axis, op.parameters.label, op.parameters.to,
                            op.parameters.cascade, +1);
        }
      }
    });

    log('§GRID_DRAG init — pointer events wired');
  }

  /** Apply a replayed/undone/redone grid move: update grid data + rebuild scene.
   *  cascade: array of {guid, oldX, oldY, newX, newY} from KernelOps parameters.
   *  direction: +1 = apply forward (redo), -1 = revert (undo). */
  function applyReplayedMove(axis, label, targetPos, cascade, direction) {
    if (!st || !st.gridData) return;
    var lines = axis === 'X' ? st.gridData.xLines : st.gridData.yLines;
    if (!lines) return;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].label === label) {
        var delta = targetPos - lines[i].position;
        shiftLine(label, axis, delta);
        updateGridData(axis, i, targetPos);
        rebuildAnnotations();

        // Replay cascade element positions in DB + scene
        if (cascade && cascade.length && A.db) {
          for (var ci = 0; ci < cascade.length; ci++) {
            var cm = cascade[ci];
            var tx = direction > 0 ? cm.newX : cm.oldX;
            var ty = direction > 0 ? cm.newY : cm.oldY;
            try {
              A.db.run('UPDATE element_transforms SET center_x = ?, center_y = ? WHERE guid = ?',
                       [tx, ty, cm.guid]);
            } catch (e) { log('§REPLAY_PERSIST_ERR guid=' + cm.guid + ' ' + e.message); }
          }
          moveSceneMeshes(cascade, direction || 1);
          log('§GRID_REPLAY_CASCADE elements=' + cascade.length + ' direction=' + direction);
        }

        if (window.CostPanel) CostPanel.refresh(A, st.gridData);
        A.markDirty();
        log('§GRID_DRAG replayed label=' + label + ' pos=' + targetPos.toFixed(3));
        return;
      }
    }
  }

  return {
    init:              init,
    loadRules:         loadRules,
    rules:             rules,
    enabled:           function() { return dragging; },
    history:           function() { return hist.slice(); },
    undo:              undo,
    clamp:             clamp,
    snap:              snap,
    cascadeElements:   cascadeElements,
    applyStrategy:     applyStrategy,
    clearShadows:      clearShadows,
    applyReplayedMove: applyReplayedMove
  };
})();
