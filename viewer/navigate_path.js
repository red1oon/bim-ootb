/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// navigate_path.js — S233 Section C: Multi-storey path builder
// Interface: NavigatePath.init(A, nav)
// Reads from A (set by NavigateGrid.init): A.buildRouteTemplate, A.graphAStar,
//   A.graphPathToWaypoints, A.buildGrid, A.toCell, A.fromCell, A.astar,
//   A.findVerticalTransport, A.matchStairsToStoreys
// Reads: A.db, A.activeBuilding, A.walkStoreyLevels, A.cacheStoreyLevels
// Exposes on A: buildPath, buildSingleStoreyPath
// Witness: W-NAV

(function() {
  'use strict';

  function init(A, nav) {

    // ══════════════════════════════════════════════════════════════
    // SECTION C: BUILD FULL PATH (multi-storey)
    // ══════════════════════════════════════════════════════════════

    function buildPath(startIfc, targetIfc, targetStorey) {
      if (typeof A.cacheStoreyLevels === 'function' && (!A.walkStoreyLevels || A.walkStoreyLevels.length === 0)) {
        A.cacheStoreyLevels();
      }
      var levels = A.walkStoreyLevels || [];

      var startStorey = targetStorey;
      if (A.db) {
        try {
          var entrRows = A.db.exec(
            "SELECT m.storey, MIN(t.center_z) as min_z FROM elements_meta m" +
            " JOIN element_transforms t ON m.guid = t.guid" +
            " WHERE m.ifc_class IN ('IfcDoor','IfcDoorStandardCase')" +
            " GROUP BY m.storey HAVING min_z >= -0.5 ORDER BY min_z ASC LIMIT 1");
          if (entrRows.length > 0 && entrRows[0].values.length > 0) {
            startStorey = entrRows[0].values[0][0];
          }
        } catch(e) { /* fallback to targetStorey */ }
      }
      if (!startStorey && levels.length > 0) startStorey = levels[0].storey;
      console.log('[S233] §BUILD_PATH start=(' + startIfc.x.toFixed(1) + ',' + startIfc.y.toFixed(1) + ')' +
        ' target=(' + targetIfc.x.toFixed(1) + ',' + targetIfc.y.toFixed(1) + ')' +
        ' startStorey="' + startStorey + '" targetStorey="' + targetStorey + '"' +
        ' levels=' + levels.length + ' sameStorey=' + (startStorey === targetStorey));

      if (startStorey === targetStorey || levels.length < 2) {
        return buildSingleStoreyPath(startIfc, targetIfc, targetStorey);
      }

      var vt = A.findVerticalTransport();
      var links = A.matchStairsToStoreys(vt);

      var startLevel = -1, endLevel = -1;
      for (var li = 0; li < levels.length; li++) {
        if (levels[li].storey === startStorey) startLevel = li;
        if (levels[li].storey === targetStorey) endLevel = li;
      }
      if (startLevel < 0 || endLevel < 0) {
        return buildSingleStoreyPath(startIfc, targetIfc, targetStorey);
      }

      var waypoints = [];
      var currentPos = { x: startIfc.x, y: startIfc.y };
      var direction = endLevel > startLevel ? 1 : -1;

      for (var si = startLevel; si !== endLevel; si += direction) {
        var fromStorey = levels[si].storey;
        var toStorey = levels[si + direction].storey;

        var link = null;
        for (var lk = 0; lk < links.length; lk++) {
          if ((links[lk].fromStorey === fromStorey && links[lk].toStorey === toStorey) ||
              (links[lk].fromStorey === toStorey && links[lk].toStorey === fromStorey)) {
            link = links[lk]; break;
          }
        }

        if (link) {
          var stairPos = { x: link.x, y: link.y };
          var pathToStair = buildSingleStoreyPath(currentPos, stairPos, fromStorey);
          if (pathToStair) waypoints = waypoints.concat(pathToStair);

          waypoints.push({ x: link.x, y: link.y, z: levels[si + direction].floorZ,
            storey: toStorey, transition: direction > 0 ? 'up' : 'down', transitionName: toStorey });

          currentPos = { x: link.x, y: link.y };
        }
      }

      var finalPath = buildSingleStoreyPath(currentPos, targetIfc, targetStorey);
      if (finalPath) waypoints = waypoints.concat(finalPath);

      return waypoints.length > 0 ? waypoints : null;
    }

    function interpolateLine(startIfc, endIfc, storey) {
      var STEP = 4;
      var dx = endIfc.x - startIfc.x, dy = endIfc.y - startIfc.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var steps = Math.max(2, Math.ceil(dist / STEP));
      var floorZ = 0;
      if (A.walkStoreyLevels) {
        for (var li = 0; li < A.walkStoreyLevels.length; li++) {
          if (A.walkStoreyLevels[li].storey === storey) { floorZ = A.walkStoreyLevels[li].floorZ; break; }
        }
      }
      var wp = [];
      for (var i = 0; i <= steps; i++) {
        var t = i / steps;
        wp.push({ x: startIfc.x + dx * t, y: startIfc.y + dy * t, z: floorZ, storey: storey });
      }
      return wp;
    }

    function buildSingleStoreyPath(startIfc, endIfc, storey) {
      var template = A.buildRouteTemplate(storey);
      if (template && template.nodes.length >= 2) {
        var graphPath = A.graphAStar(template, startIfc, endIfc);
        console.log('[S233] §GRAPH_TRY start=(' + startIfc.x.toFixed(1) + ',' + startIfc.y.toFixed(1) + ')' +
          ' end=(' + endIfc.x.toFixed(1) + ',' + endIfc.y.toFixed(1) + ')' +
          ' result=' + (graphPath ? graphPath.length + ' nodes' : 'null'));
        if (graphPath && graphPath.length >= 2) {
          var wpFromGraph = A.graphPathToWaypoints(graphPath, startIfc, endIfc, storey);
          if (wpFromGraph && wpFromGraph.length >= 2) {
            console.log('[S233] §PATH_ROUTE_TEMPLATE storey="' + storey + '" graph_nodes=' + graphPath.length +
              ' waypoints=' + wpFromGraph.length + ' labels=[' +
              graphPath.map(function(n) { return n.label; }).join(', ') + ']');
            return wpFromGraph;
          }
        }
        console.log('[S233] §PATH_ROUTE_TEMPLATE_FAIL storey="' + storey + '" graphPath=' +
          (graphPath ? graphPath.length : 'null') + ' falling back to grid A*');
      }

      var g = A.buildGrid(storey);
      if (!g) {
        console.log('[S233] §PATH_NO_GRID storey="' + storey + '" using interpolated straight line');
        return interpolateLine(startIfc, endIfc, storey);
      }

      var sc = A.toCell(g, startIfc.x, startIfc.y);
      var ec = A.toCell(g, endIfc.x, endIfc.y);
      console.log('[S233] §PATH_GRID_ASTAR storey="' + storey + '"' +
        ' start_cell=(' + sc.c + ',' + sc.r + ') end_cell=(' + ec.c + ',' + ec.r + ')' +
        ' start_walkable=' + (g.grid[sc.r * g.cols + sc.c] === 0) +
        ' end_walkable=' + (g.grid[ec.r * g.cols + ec.c] === 0));
      var cellPath = A.astar(g, sc.c, sc.r, ec.c, ec.r);

      if (!cellPath) {
        console.log('[S233] §PATH_ASTAR_FAIL storey="' + storey + '" using interpolated straight line');
        return interpolateLine(startIfc, endIfc, storey);
      }

      var simplified = [cellPath[0]];
      for (var i = 1; i < cellPath.length - 1; i++) {
        var prev = cellPath[i - 1], cur = cellPath[i], next = cellPath[i + 1];
        var dx1 = cur.c - prev.c, dy1 = cur.r - prev.r;
        var dx2 = next.c - cur.c, dy2 = next.r - cur.r;
        if (dx1 !== dx2 || dy1 !== dy2) simplified.push(cur);
      }
      if (cellPath.length > 1) simplified.push(cellPath[cellPath.length - 1]);

      var MIN_STEP_CELLS = 2;
      var coalesced = [simplified[0]];
      for (var ci = 1; ci < simplified.length; ci++) {
        var last = coalesced[coalesced.length - 1];
        var dcx = simplified[ci].c - last.c, dcy = simplified[ci].r - last.r;
        var cellDist = Math.sqrt(dcx * dcx + dcy * dcy);
        if (cellDist < MIN_STEP_CELLS && ci < simplified.length - 1) continue;
        coalesced.push(simplified[ci]);
      }
      simplified = coalesced;

      var floorZ = 0;
      if (A.walkStoreyLevels) {
        for (var li2 = 0; li2 < A.walkStoreyLevels.length; li2++) {
          if (A.walkStoreyLevels[li2].storey === storey) { floorZ = A.walkStoreyLevels[li2].floorZ; break; }
        }
      }

      return simplified.map(function(cell) {
        var ifc = A.fromCell(g, cell.c, cell.r);
        return { x: ifc.x, y: ifc.y, z: floorZ, storey: storey };
      });
    }

    // ── Expose on A (called by navigate_engine.js) ──
    A.buildPath = buildPath;
    A.buildSingleStoreyPath = buildSingleStoreyPath;
  }

  window.NavigatePath = { init: init };
})();
