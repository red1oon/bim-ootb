/**
 * grid_kinematics.js — §S270 Grid Kinematics Engine
 * Implementing NEW_FROM_REFERENCE.md §17.10.3 — Standalone Module Spec
 *
 * Pure-math engine for grid-drag recomposition. Owns ALL recomposition math.
 * Never touches Three.js, databases, or DOM. Returns command objects that
 * the caller (doc_canvas.js) applies to meshes.
 *
 * Three questions per attachment:
 *   WHAT is attached?   → relation (ATTACH, SPAN, EDGE_*, ROOF_EAVE, INTERIOR)
 *   HOW may it move?    → allowedAction (TRANSLATE, SCALE, EDGE_STRETCH, ROOF_VERTICES, ROOF_LIFT)
 *   WHAT cascades?      → cascades [{targetGuid, type, rule}]
 *
 * Design Invariants (§17.10.3, non-negotiable):
 *   1. Roof eave moves with grid. Ridge fixed. Linear t-interpolation by height.
 *   2. Engine is stateless re kernel_ops. Parent replays log on load.
 *   3. Only attach-map elements get commands. Others via bay-proportional.
 *   4. dragGrid() is pure: (positions, delta) → commands. Never mutates input.
 *   5. O(K) per drag where K = attached count. Pre-indexed by grid ID.
 */
(function(exports) {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────
  var ATTACH_TOL = 0.5;       // metres — max centerline-to-grid distance
  var EDGE_TOL   = 0.1;       // metres — edge detection tolerance (tighter)
  var MIN_WALL_WIDTH = 0.05;  // metres — minimum width after edge-stretch
  var FLAT_ROOF_TOL  = 0.05;  // metres — yRange below this = flat roof
  var RIDGE_BAND = 0.10;      // fraction — top 10% of yRange = ridge
  var EAVE_BAND  = 0.10;      // fraction — bottom 10% of yRange = eave

  // ── GridKinematicEngine ────────────────────────────────────────────────────

  /**
   * @param {Array} elementData — [{guid, x, y, z, bboxX, bboxY, bboxZ,
   *                                ifcClass, vertices?, scaleX?, scaleY?, scaleZ?}]
   * @param {Array} gridLines   — [{id, axis:'x'|'y'|'z', pos}]
   */
  function GridKinematicEngine(elementData, gridLines) {
    this._elements = elementData;
    this._gridLines = gridLines;

    // Index: id → grid line (with origPos snapshot)
    this._gridById = {};
    for (var i = 0; i < gridLines.length; i++) {
      var gl = gridLines[i];
      this._gridById[gl.id] = { axis: gl.axis, origPos: gl.pos, index: i };
    }

    // Index: guid → element
    this._elementByGuid = {};
    for (var ei = 0; ei < elementData.length; ei++) {
      this._elementByGuid[elementData[ei].guid] = elementData[ei];
    }

    // Attach map: gridId → [{guid, relation, edge, origPos, origHalfExtent, origScale, roofData?, cascades}]
    this._attachMap = {};

    // Interior elements: [{guid, origX, origY, origZ, bayX:[startId,endId], bayZ:[startId,endId]}]
    this._interiorElements = [];

    // Set of governed guids (for fast interior exclusion)
    this._governed = {};
  }

  // ── attachGridToElements() — Build attach map ─────────────────────────────

  GridKinematicEngine.prototype.attachGridToElements = function() {
    this._attachMap = {};
    this._interiorElements = [];
    this._governed = {};

    // Sorted grid positions per axis (for bay computation)
    this._sortedGrids = { x: [], y: [], z: [] };
    for (var gi = 0; gi < this._gridLines.length; gi++) {
      var gl = this._gridLines[gi];
      this._sortedGrids[gl.axis].push({ id: gl.id, pos: gl.pos });
    }
    for (var ax in this._sortedGrids) {
      this._sortedGrids[ax].sort(function(a, b) { return a.pos - b.pos; });
    }

    // Phase 1: Classify each element against each grid line
    for (var ei = 0; ei < this._elements.length; ei++) {
      var elem = this._elements[ei];
      this._classifyElement(elem);
    }

    // Phase 2: Discover cascades (e.g. WALL_HEIGHT_SCALE for roof lift)
    this._discoverCascades();

    // Phase 3: Identify interior (unattached) elements for bay-proportional
    for (var ui = 0; ui < this._elements.length; ui++) {
      var uElem = this._elements[ui];
      if (!this._governed[uElem.guid]) {
        this._classifyInterior(uElem);
      }
    }
  };

  /**
   * _classifyElement — attach one element to its best grid line per axis.
   * Each axis is independent: an element can attach to one X grid and one Z grid.
   */
  GridKinematicEngine.prototype._classifyElement = function(elem) {
    var axes = ['x', 'y', 'z'];
    var isRoof = elem.ifcClass === 'IfcRoof' || elem.ifcClass === 'IfcSlab:ROOF';

    for (var ai = 0; ai < axes.length; ai++) {
      var axis = axes[ai];
      var pos = elem[axis];
      if (pos === undefined || pos === null) continue;

      var halfExtent = _halfExtentForAxis(elem, axis);
      var scale = _scaleForAxis(elem, axis);

      // For roof elements on X/Z: use vertex-level attachment instead
      if (isRoof && elem.vertices && (axis === 'x' || axis === 'z')) {
        this._classifyRoofHorizontal(elem, axis);
        continue;
      }

      // For roof elements on Y: ROOF_LIFT (rigid translate)
      if (isRoof && axis === 'y') {
        this._classifyRoofVertical(elem);
        continue;
      }

      // Standard element classification on this axis
      var best = this._findBestGrid(pos, halfExtent, axis);
      if (best) {
        if (!this._attachMap[best.gridId]) this._attachMap[best.gridId] = [];
        this._attachMap[best.gridId].push({
          guid: elem.guid,
          relation: best.relation,
          axis: axis,
          edge: best.edge,
          origPos: pos,
          origHalfExtent: halfExtent,
          origScale: scale,
          roofData: null,
          cascades: []
        });
        this._governed[elem.guid] = true;
      }
    }
  };

  /**
   * _findBestGrid — find the best grid line for an element on a given axis.
   * Returns {gridId, relation, edge} or null.
   *
   * Priority: EDGE_LEFT/EDGE_RIGHT > ATTACH > SPAN
   * (Edge at boundary beats centerline proximity beats interior span)
   */
  GridKinematicEngine.prototype._findBestGrid = function(pos, halfExtent, axis) {
    var bestGridId = null;
    var bestDist = Infinity;
    var bestRelation = 'ATTACH';
    var bestEdge = 'near';

    for (var gi = 0; gi < this._gridLines.length; gi++) {
      var gl = this._gridLines[gi];
      if (gl.axis !== axis) continue;

      var gp = gl.pos;

      // Centerline proximity → ATTACH
      var dist = Math.abs(pos - gp);
      if (dist < ATTACH_TOL && dist < bestDist) {
        bestDist = dist;
        bestGridId = gl.id;
        bestRelation = 'ATTACH';
      }

      if (halfExtent > 0.05) {
        var lo = pos - halfExtent;
        var hi = pos + halfExtent;

        // Edge detection: grid at left or right edge (within EDGE_TOL)
        if (Math.abs(hi - gp) < EDGE_TOL) {
          bestGridId = gl.id;
          bestRelation = 'EDGE_RIGHT';
          bestDist = 0;
          bestEdge = 'right';
        } else if (Math.abs(lo - gp) < EDGE_TOL) {
          bestGridId = gl.id;
          bestRelation = 'EDGE_LEFT';
          bestDist = 0;
          bestEdge = 'left';
        } else if (gp > lo + 0.01 && gp < hi - 0.01) {
          // SPAN: grid inside body — lower priority than ATTACH and EDGE
          if (!bestGridId || (bestRelation !== 'ATTACH' && bestRelation !== 'EDGE_RIGHT' && bestRelation !== 'EDGE_LEFT')) {
            bestGridId = gl.id;
            bestRelation = 'SPAN';
            bestDist = 0;
            bestEdge = (gp - lo) < (hi - gp) ? 'near' : 'far';
          }
        }
      }
    }

    if (bestGridId !== null) {
      return { gridId: bestGridId, relation: bestRelation, edge: bestEdge };
    }
    return null;
  };

  /**
   * _classifyRoofHorizontal — attach roof eave vertices to X/Z grid lines.
   * Classifies vertices as eave/ridge/slope and stores pre-computed t values.
   */
  GridKinematicEngine.prototype._classifyRoofHorizontal = function(elem, axis) {
    var verts = elem.vertices; // Float32Array, xyz triplets
    if (!verts || verts.length < 3) return;

    var nVerts = verts.length / 3;
    var yMin = Infinity, yMax = -Infinity;
    for (var vi = 0; vi < nVerts; vi++) {
      var vy = verts[vi * 3 + 1]; // Y = height in Three.js
      if (vy < yMin) yMin = vy;
      if (vy > yMax) yMax = vy;
    }
    var yRange = yMax - yMin;
    var isFlat = yRange < FLAT_ROOF_TOL;

    // Axis index in Float32Array: x=0, z=2
    var axisIdx = (axis === 'x') ? 0 : 2;

    // For each grid line on this axis, find governed eave vertices
    for (var gi = 0; gi < this._gridLines.length; gi++) {
      var gl = this._gridLines[gi];
      if (gl.axis !== axis) continue;

      var vertexAttachments = []; // [{vertexIndex, t}]

      for (var vi2 = 0; vi2 < nVerts; vi2++) {
        var vPos = verts[vi2 * 3 + axisIdx];
        var vy2 = verts[vi2 * 3 + 1];

        // Is this vertex near the grid line?
        if (Math.abs(vPos - gl.pos) > ATTACH_TOL) continue;

        if (isFlat) {
          // Flat roof: all governed vertices get full delta (t=0)
          vertexAttachments.push({ vertexIndex: vi2, t: 0 });
        } else {
          // Sloped roof: compute t = height ratio
          var t = (vy2 - yMin) / yRange; // 0 at eave, 1 at ridge
          // Only govern non-ridge vertices (t < 1 - RIDGE_BAND gives partial delta)
          vertexAttachments.push({ vertexIndex: vi2, t: t });
        }
      }

      if (vertexAttachments.length > 0) {
        if (!this._attachMap[gl.id]) this._attachMap[gl.id] = [];
        this._attachMap[gl.id].push({
          guid: elem.guid,
          relation: isFlat ? 'ROOF_FLAT' : 'ROOF_EAVE',
          axis: axis,
          edge: null,
          origPos: elem[axis],
          origHalfExtent: _halfExtentForAxis(elem, axis),
          origScale: _scaleForAxis(elem, axis),
          roofData: {
            yMin: yMin,
            yMax: yMax,
            yRange: yRange,
            isFlat: isFlat,
            nVerts: nVerts,
            vertexGridAttach: vertexAttachments
          },
          cascades: []
        });
        this._governed[elem.guid] = true;
      }
    }
  };

  /**
   * _classifyRoofVertical — attach roof to Y-axis grid for ROOF_LIFT.
   * The entire roof translates rigidly when a Y-axis grid moves.
   */
  GridKinematicEngine.prototype._classifyRoofVertical = function(elem) {
    // Find eave Y (lowest vertex Y, or element y position)
    var eaveY = elem.y;
    if (elem.vertices && elem.vertices.length >= 3) {
      var nVerts = elem.vertices.length / 3;
      eaveY = Infinity;
      for (var vi = 0; vi < nVerts; vi++) {
        var vy = elem.vertices[vi * 3 + 1];
        if (vy < eaveY) eaveY = vy;
      }
    }

    // Find Y-axis grid line nearest to eave
    for (var gi = 0; gi < this._gridLines.length; gi++) {
      var gl = this._gridLines[gi];
      if (gl.axis !== 'y') continue;

      if (Math.abs(eaveY - gl.pos) < ATTACH_TOL) {
        if (!this._attachMap[gl.id]) this._attachMap[gl.id] = [];
        this._attachMap[gl.id].push({
          guid: elem.guid,
          relation: 'ROOF_LIFT',
          axis: 'y',
          edge: null,
          origPos: eaveY,
          origHalfExtent: 0,
          origScale: 1,
          roofData: {
            eaveY: eaveY,
            nVerts: elem.vertices ? elem.vertices.length / 3 : 0
          },
          cascades: []  // filled by _discoverCascades
        });
        this._governed[elem.guid] = true;
        break; // one Y-grid per roof
      }
    }
  };

  /**
   * _discoverCascades — find cascade relationships.
   * Currently: WALL_HEIGHT_SCALE — walls whose top edge is near a roof's eave Y.
   */
  GridKinematicEngine.prototype._discoverCascades = function() {
    // Collect all ROOF_LIFT attachments and their eave Y values
    var roofLifts = []; // [{gridId, attachIdx, eaveY}]
    for (var gid in this._attachMap) {
      var items = this._attachMap[gid];
      for (var ii = 0; ii < items.length; ii++) {
        if (items[ii].relation === 'ROOF_LIFT' && items[ii].roofData) {
          roofLifts.push({
            gridId: gid,
            attachIdx: ii,
            eaveY: items[ii].roofData.eaveY
          });
        }
      }
    }

    if (roofLifts.length === 0) return;

    // For each non-roof element, check if its top edge is near any roof eave
    for (var ei = 0; ei < this._elements.length; ei++) {
      var elem = this._elements[ei];
      if (elem.ifcClass === 'IfcRoof' || elem.ifcClass === 'IfcSlab:ROOF') continue;

      var elemY = elem.y || 0;
      var halfY = (elem.bboxY || 0) / 2;
      var topEdge = elemY + halfY;
      var origHeight = halfY * 2;
      if (origHeight < 0.01) continue; // skip elements with no Y extent

      for (var ri = 0; ri < roofLifts.length; ri++) {
        var rl = roofLifts[ri];
        if (Math.abs(topEdge - rl.eaveY) < ATTACH_TOL) {
          // This element's top is near the roof eave — cascade
          this._attachMap[rl.gridId][rl.attachIdx].cascades.push({
            targetGuid: elem.guid,
            type: 'WALL_HEIGHT_SCALE',
            origHeight: origHeight,
            origY: elemY,
            origScale: elem.scaleY || 1
          });
        }
      }
    }
  };

  /**
   * _classifyInterior — record an unattached element with its enclosing bays.
   */
  GridKinematicEngine.prototype._classifyInterior = function(elem) {
    var interior = { guid: elem.guid, origX: elem.x, origY: elem.y, origZ: elem.z };

    // For each axis, find the enclosing bay
    var axes = ['x', 'z']; // bay-proportional on X and Z
    for (var ai = 0; ai < axes.length; ai++) {
      var axis = axes[ai];
      var pos = elem[axis];
      if (pos === undefined || pos === null) continue;

      var sorted = this._sortedGrids[axis];
      var bayKey = 'bay' + axis.toUpperCase(); // bayX, bayZ
      interior[bayKey] = null;

      for (var bi = 0; bi < sorted.length - 1; bi++) {
        if (pos >= sorted[bi].pos - 0.01 && pos <= sorted[bi + 1].pos + 0.01) {
          interior[bayKey] = { startId: sorted[bi].id, endId: sorted[bi + 1].id };
          break;
        }
      }
    }

    this._interiorElements.push(interior);
  };

  // ── dragGrid(gridId, delta) — Compute transform commands ──────────────────

  /**
   * @param {string} gridId — ID of the moved grid line
   * @param {number} delta  — absolute displacement from original position
   * @returns {Array} commands — [{guid, action, axis, delta, ...}]
   */
  GridKinematicEngine.prototype.dragGrid = function(gridId, delta) {
    if (Math.abs(delta) < 0.001) return [];

    var grid = this._gridById[gridId];
    if (!grid) return [];

    var commands = [];
    var items = this._attachMap[gridId] || [];

    // Primary commands for attached elements
    for (var ii = 0; ii < items.length; ii++) {
      var item = items[ii];
      var cmd = this._computePrimaryCommand(item, delta, grid.axis);
      if (cmd) {
        commands.push(cmd);
      }

      // Cascade commands
      for (var ci = 0; ci < item.cascades.length; ci++) {
        var cascadeCmd = this._computeCascadeCommand(item.cascades[ci], delta, grid.axis);
        if (cascadeCmd) commands.push(cascadeCmd);
      }
    }

    // Bay-proportional for interior elements
    var bayCommands = this._computeBayProportional(gridId, delta);
    for (var bi = 0; bi < bayCommands.length; bi++) {
      commands.push(bayCommands[bi]);
    }

    return commands;
  };

  /**
   * _computePrimaryCommand — produce command for one attachment + delta.
   */
  GridKinematicEngine.prototype._computePrimaryCommand = function(item, delta, axis) {
    switch (item.relation) {

      case 'ATTACH':
        return { guid: item.guid, action: 'TRANSLATE', axis: axis, delta: delta };

      case 'SPAN':
        return this._computeScaleCommand(item, delta, axis);

      case 'EDGE_RIGHT':
        if (delta > 0) {
          // Grid moves away from body → stretch
          return this._computeScaleCommand(item, delta, axis, 'far');
        } else {
          // Grid moves into body → translate
          return { guid: item.guid, action: 'TRANSLATE', axis: axis, delta: delta };
        }

      case 'EDGE_LEFT':
        if (delta > 0) {
          // Grid moves into body → translate
          return { guid: item.guid, action: 'TRANSLATE', axis: axis, delta: delta };
        } else {
          // Grid moves away from body → stretch (check min width)
          var newHalf = item.origHalfExtent - delta / 2; // delta is negative, so this grows
          if (newHalf * 2 >= MIN_WALL_WIDTH) {
            return this._computeScaleCommand(item, delta, axis, 'near');
          } else {
            return { guid: item.guid, action: 'TRANSLATE', axis: axis, delta: delta };
          }
        }

      case 'ROOF_EAVE':
        return this._computeRoofVertexCommand(item, delta, axis);

      case 'ROOF_FLAT':
        // Flat roof: treat like slab SCALE
        return this._computeScaleCommand(item, delta, axis);

      case 'ROOF_LIFT':
        return { guid: item.guid, action: 'ROOF_LIFT', deltaY: delta };

      default:
        return null;
    }
  };

  /**
   * _computeScaleCommand — compute SCALE for SPAN / EDGE_STRETCH / ROOF_FLAT.
   */
  GridKinematicEngine.prototype._computeScaleCommand = function(item, delta, axis, edgeOverride) {
    var edge = edgeOverride || item.edge;
    var origWidth = item.origHalfExtent * 2;
    if (origWidth < 0.01) return { guid: item.guid, action: 'TRANSLATE', axis: axis, delta: delta };

    var newWidth = origWidth + (edge === 'far' ? delta : -delta);
    if (newWidth < 0.01) newWidth = 0.01;
    var scaleRatio = newWidth / origWidth;
    var newScale = item.origScale * scaleRatio;
    var translateDelta = (edge === 'near') ? delta : 0;

    return {
      guid: item.guid,
      action: 'SCALE',
      axis: axis,
      newScale: newScale,
      translateDelta: translateDelta,
      edge: edge
    };
  };

  /**
   * _computeRoofVertexCommand — produce ROOF_VERTICES command with per-vertex deltas.
   * Invariant: eave gets full delta, ridge gets zero, slope interpolates linearly by t.
   */
  GridKinematicEngine.prototype._computeRoofVertexCommand = function(item, delta, axis) {
    var rd = item.roofData;
    if (!rd || !rd.vertexGridAttach || rd.vertexGridAttach.length === 0) return null;

    // Build vertexDeltas: Float32Array with xyz per vertex (only governed verts get non-zero)
    var vertexDeltas = new Float32Array(rd.nVerts * 3);
    var axisIdx = (axis === 'x') ? 0 : 2;

    for (var vi = 0; vi < rd.vertexGridAttach.length; vi++) {
      var va = rd.vertexGridAttach[vi];
      // t=0 at eave (full delta), t=1 at ridge (zero delta)
      vertexDeltas[va.vertexIndex * 3 + axisIdx] = delta * (1 - va.t);
    }

    return {
      guid: item.guid,
      action: 'ROOF_VERTICES',
      axis: axis,
      delta: delta,
      vertexDeltas: vertexDeltas
    };
  };

  /**
   * _computeCascadeCommand — produce command for a cascade target.
   */
  GridKinematicEngine.prototype._computeCascadeCommand = function(cascade, delta, axis) {
    switch (cascade.type) {
      case 'WALL_HEIGHT_SCALE':
        // Wall grows taller: newScale = (origHeight + delta) / origHeight * origScale
        // Wall center shifts up by delta/2 (fixed base, growing top)
        var newHeight = cascade.origHeight + delta;
        if (newHeight < MIN_WALL_WIDTH) newHeight = MIN_WALL_WIDTH;
        var scaleRatio = newHeight / cascade.origHeight;
        return {
          guid: cascade.targetGuid,
          action: 'SCALE',
          axis: 'y',
          newScale: cascade.origScale * scaleRatio,
          translateDelta: delta / 2,
          edge: 'far'
        };

      default:
        return null;
    }
  };

  /**
   * _computeBayProportional — interior elements get proportional shift.
   */
  GridKinematicEngine.prototype._computeBayProportional = function(gridId, delta) {
    var commands = [];
    var grid = this._gridById[gridId];
    if (!grid) return commands;

    // Build current grid positions for the moved axis
    var axis = grid.axis;
    if (axis === 'y') return commands; // no bay-proportional on Y axis

    var origSorted = this._sortedGrids[axis];
    if (origSorted.length < 2) return commands;

    // Build current positions: original + delta for the moved grid
    var origPositions = [];
    var currPositions = [];
    for (var si = 0; si < origSorted.length; si++) {
      origPositions.push(origSorted[si].pos);
      currPositions.push(origSorted[si].id === gridId ? origSorted[si].pos + delta : origSorted[si].pos);
    }

    for (var ii = 0; ii < this._interiorElements.length; ii++) {
      var ie = this._interiorElements[ii];
      var pos = (axis === 'x') ? ie.origX : ie.origZ;
      if (pos === undefined || pos === null) continue;

      var d = _bayProportionalDelta(pos, origPositions, currPositions);
      if (Math.abs(d) > 0.001) {
        commands.push({ guid: ie.guid, action: 'TRANSLATE', axis: axis, delta: d });
      }
    }

    return commands;
  };

  // ── Inspection API ─────────────────────────────────────────────────────────

  GridKinematicEngine.prototype.getAttachMap = function() {
    return this._attachMap;
  };

  GridKinematicEngine.prototype.getInteriorElements = function() {
    return this._interiorElements;
  };

  GridKinematicEngine.prototype.getGridById = function(id) {
    return this._gridById[id] || null;
  };

  // ── Pure utility functions ─────────────────────────────────────────────────

  function _halfExtentForAxis(elem, axis) {
    if (axis === 'x') return (elem.bboxX || 0) / 2;
    if (axis === 'y') return (elem.bboxY || 0) / 2;
    if (axis === 'z') return (elem.bboxZ || 0) / 2;
    return 0;
  }

  function _scaleForAxis(elem, axis) {
    if (axis === 'x') return elem.scaleX || 1;
    if (axis === 'y') return elem.scaleY || 1;
    if (axis === 'z') return elem.scaleZ || 1;
    return 1;
  }

  /**
   * _bayProportionalDelta — compute proportional shift for an interior element.
   * @param {number} pos — element position on axis
   * @param {number[]} origGrid — sorted original grid positions
   * @param {number[]} currGrid — sorted current grid positions
   * @returns {number} delta to apply
   */
  function _bayProportionalDelta(pos, origGrid, currGrid) {
    if (origGrid.length < 2 || currGrid.length < 2) return 0;

    for (var i = 0; i < origGrid.length - 1; i++) {
      var lo = origGrid[i];
      var hi = origGrid[i + 1];
      if (pos >= lo - 0.01 && pos <= hi + 0.01) {
        var oldW = hi - lo;
        if (oldW < 0.01) continue;
        var t = (pos - lo) / oldW;
        var newLo = i < currGrid.length ? currGrid[i] : lo;
        var newHi = (i + 1) < currGrid.length ? currGrid[i + 1] : hi;
        var newW = newHi - newLo;
        return (newLo + t * newW) - pos;
      }
    }
    return 0;
  }

  // ── Exports ────────────────────────────────────────────────────────────────

  exports.GridKinematicEngine = GridKinematicEngine;

  // Export constants for testing
  exports.ATTACH_TOL = ATTACH_TOL;
  exports.EDGE_TOL = EDGE_TOL;
  exports.MIN_WALL_WIDTH = MIN_WALL_WIDTH;
  exports.FLAT_ROOF_TOL = FLAT_ROOF_TOL;

  // Export pure utility for testing
  exports._bayProportionalDelta = _bayProportionalDelta;

})(typeof module !== 'undefined' ? module.exports : (window.GridKinematics = {}));
