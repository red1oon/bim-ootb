/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// navigate_grid.js — S233 Sections B/B3/B4: Occupancy Grid + A* + Route Templates
// Interface: NavigateGrid.init(A, nav)
// Reads: A.db, A.activeBuilding, A.walkStoreyLevels
// Writes nav: nav.gridCache
// Exposes on A: buildGrid, toCell, fromCell, astar, findNearestWalkable,
//   findVerticalTransport, matchStairsToStoreys,
//   buildRouteTemplate, graphAStar, nearestNode, graphPathToWaypoints,
//   getRouteTemplate, clearRouteCache
// Witness: W-NAV

(function() {
  'use strict';

  function init(A, nav) {

    // ══════════════════════════════════════════════════════════════
    // SECTION B: OCCUPANCY GRID + A* PATHFINDING
    // ══════════════════════════════════════════════════════════════

    var CELL_SIZE = 2; // metres

    // Build occupancy grid for a storey from DB wall/column positions
    function buildGrid(storey) {
      if (nav.gridCache[storey]) return nav.gridCache[storey];
      if (!A.db) return null;

      var bld = A.activeBuilding || '';
      var bbSql = 'SELECT MIN(t.center_x), MAX(t.center_x), MIN(t.center_y), MAX(t.center_y)' +
        ' FROM elements_meta m JOIN element_transforms t ON m.guid = t.guid' +
        ' WHERE m.storey = ?' + (bld ? ' AND m.building = ?' : '');
      var bbParams = [storey]; if (bld) bbParams.push(bld);
      var bbRows;
      try { bbRows = A.db.exec(bbSql, bbParams); } catch(e) { return null; }
      if (!bbRows.length || !bbRows[0].values.length) return null;

      var r = bbRows[0].values[0];
      var minX = r[0], maxX = r[1], minY = r[2], maxY = r[3];
      minX -= CELL_SIZE; minY -= CELL_SIZE; maxX += CELL_SIZE; maxY += CELL_SIZE;

      var cols = Math.ceil((maxX - minX) / CELL_SIZE);
      var rows = Math.ceil((maxY - minY) / CELL_SIZE);
      if (cols < 1 || rows < 1 || cols > 500 || rows > 500) return null;

      var grid = new Uint8Array(cols * rows);

      var wallSql = 'SELECT t.center_x, t.center_y' +
        ' FROM elements_meta m JOIN element_transforms t ON m.guid = t.guid' +
        ' WHERE m.storey = ? AND m.ifc_class IN ' +
        "('IfcWall','IfcWallStandardCase','IfcColumn','IfcCurtainWall','IfcRailing')" +
        (bld ? ' AND m.building = ?' : '');
      var wallParams = [storey]; if (bld) wallParams.push(bld);
      try {
        var wallRows = A.db.exec(wallSql, wallParams);
        if (wallRows.length > 0) {
          wallRows[0].values.forEach(function(w) {
            var cx = Math.floor((w[0] - minX) / CELL_SIZE);
            var cy = Math.floor((w[1] - minY) / CELL_SIZE);
            for (var dx = -1; dx <= 1; dx++) {
              for (var dy = -1; dy <= 1; dy++) {
                var nx = cx + dx, ny = cy + dy;
                if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
                  grid[ny * cols + nx] = 1;
                }
              }
            }
          });
        }
      } catch(e) { /* no walls */ }

      var doorCells = {};
      try {
        var doorSql = 'SELECT t.center_x, t.center_y FROM elements_meta m' +
          ' JOIN element_transforms t ON m.guid = t.guid' +
          ' WHERE m.storey = ? AND m.ifc_class IN (\'IfcDoor\',\'IfcDoorStandardCase\')' +
          (bld ? ' AND m.building = ?' : '');
        var doorParams = [storey]; if (bld) doorParams.push(bld);
        var doorRows = A.db.exec(doorSql, doorParams);
        if (doorRows.length > 0) {
          doorRows[0].values.forEach(function(d) {
            var cx2 = Math.floor((d[0] - minX) / CELL_SIZE);
            var cy2 = Math.floor((d[1] - minY) / CELL_SIZE);
            if (cx2 >= 0 && cx2 < cols && cy2 >= 0 && cy2 < rows) {
              doorCells[cy2 * cols + cx2] = true;
              grid[cy2 * cols + cx2] = 0;
            }
          });
        }
      } catch(e) { /* no doors */ }

      var occupied = 0;
      for (var gi = 0; gi < grid.length; gi++) { if (grid[gi] === 1) occupied++; }
      var result = { grid: grid, cols: cols, rows: rows, minX: minX, minY: minY, doorCells: doorCells };
      nav.gridCache[storey] = result;
      console.log('[S233] §GRID_BUILD storey="' + storey + '" ' + cols + 'x' + rows + '=' + (cols*rows) +
        ' cells occupied=' + occupied + ' walkable=' + (cols*rows - occupied) +
        ' doors=' + Object.keys(doorCells).length +
        ' bbox=(' + minX.toFixed(1) + ',' + minY.toFixed(1) + ')→(' + maxX.toFixed(1) + ',' + maxY.toFixed(1) + ')');
      return result;
    }

    function toCell(g, ix, iy) {
      return { c: Math.floor((ix - g.minX) / CELL_SIZE), r: Math.floor((iy - g.minY) / CELL_SIZE) };
    }
    function fromCell(g, c, r) {
      return { x: g.minX + (c + 0.5) * CELL_SIZE, y: g.minY + (r + 0.5) * CELL_SIZE };
    }

    function astar(g, startC, startR, endC, endR) {
      if (startC < 0 || startC >= g.cols || startR < 0 || startR >= g.rows) return null;
      if (endC < 0 || endC >= g.cols || endR < 0 || endR >= g.rows) return null;

      if (g.grid[startR * g.cols + startC] === 1) {
        var sc = findNearestWalkable(g, startC, startR);
        if (!sc) return null;
        startC = sc.c; startR = sc.r;
      }
      if (g.grid[endR * g.cols + endC] === 1) {
        var ec = findNearestWalkable(g, endC, endR);
        if (!ec) return null;
        endC = ec.c; endR = ec.r;
      }

      var key = function(c, r) { return r * g.cols + c; };
      var open = [{ c: startC, r: startR, g: 0, f: 0 }];
      var closed = {};
      var parent = {};
      var gScore = {};
      gScore[key(startC, startR)] = 0;

      var endKey = key(endC, endR);
      var dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
      var maxIter = g.cols * g.rows * 2;
      var iter = 0;

      while (open.length > 0 && iter++ < maxIter) {
        var bestI = 0;
        for (var oi = 1; oi < open.length; oi++) {
          if (open[oi].f < open[bestI].f) bestI = oi;
        }
        var cur = open.splice(bestI, 1)[0];
        var ck = key(cur.c, cur.r);
        if (ck === endKey) {
          var path = [{ c: endC, r: endR }];
          var pk = endKey;
          while (parent[pk] !== undefined) {
            pk = parent[pk];
            path.unshift({ c: pk % g.cols, r: Math.floor(pk / g.cols) });
          }
          return path;
        }
        closed[ck] = true;

        for (var di = 0; di < dirs.length; di++) {
          var nc = cur.c + dirs[di][0], nr = cur.r + dirs[di][1];
          if (nc < 0 || nc >= g.cols || nr < 0 || nr >= g.rows) continue;
          var nk = key(nc, nr);
          if (closed[nk]) continue;
          if (g.grid[nk] === 1) continue;

          var moveCost = (dirs[di][0] !== 0 && dirs[di][1] !== 0) ? 1.414 : 1.0;
          if (g.doorCells && g.doorCells[nk]) moveCost *= 0.5;
          var ng = cur.g + moveCost;

          if (gScore[nk] === undefined || ng < gScore[nk]) {
            gScore[nk] = ng;
            parent[nk] = ck;
            var hx = nc - endC, hy = nr - endR;
            var h = Math.sqrt(hx * hx + hy * hy);
            var inOpen = false;
            for (var oj = 0; oj < open.length; oj++) {
              if (key(open[oj].c, open[oj].r) === nk) {
                open[oj].g = ng; open[oj].f = ng + h;
                inOpen = true; break;
              }
            }
            if (!inOpen) open.push({ c: nc, r: nr, g: ng, f: ng + h });
          }
        }
      }
      return null;
    }

    function findNearestWalkable(g, c, r) {
      for (var radius = 1; radius < 20; radius++) {
        for (var dx = -radius; dx <= radius; dx++) {
          for (var dy = -radius; dy <= radius; dy++) {
            if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
            var nx = c + dx, ny = r + dy;
            if (nx >= 0 && nx < g.cols && ny >= 0 && ny < g.rows && g.grid[ny * g.cols + nx] === 0) {
              return { c: nx, r: ny };
            }
          }
        }
      }
      return null;
    }

    // ══════════════════════════════════════════════════════════════
    // SECTION B3: VERTICAL TRANSPORT — STAIRS & LIFTS
    // ══════════════════════════════════════════════════════════════

    function findVerticalTransport() {
      if (!A.db) return [];
      var bld = A.activeBuilding || '';
      var sql = 'SELECT m.guid, m.ifc_class, t.center_x, t.center_y, t.center_z' +
        ' FROM elements_meta m JOIN element_transforms t ON m.guid = t.guid' +
        " WHERE m.ifc_class IN ('IfcStair','IfcStairFlight','IfcTransportElement')" +
        (bld ? ' AND m.building = ?' : '');
      try {
        var rows = A.db.exec(sql, bld ? [bld] : []);
        if (!rows.length) return [];
        return rows[0].values.map(function(r) {
          return { guid: r[0], ifc_class: r[1], x: r[2], y: r[3], z: r[4] };
        });
      } catch(e) { return []; }
    }

    function matchStairsToStoreys(vt) {
      var levels = A.walkStoreyLevels || [];
      if (levels.length < 2) return [];
      var links = [];
      vt.forEach(function(s) {
        var bestFrom = null, bestTo = null, bestDist = Infinity;
        for (var i = 0; i < levels.length - 1; i++) {
          var midZ = (levels[i].floorZ + levels[i + 1].floorZ) / 2;
          var dist = Math.abs(s.z - midZ);
          if (dist < bestDist) {
            bestDist = dist;
            bestFrom = levels[i];
            bestTo = levels[i + 1];
          }
        }
        if (bestFrom && bestTo) {
          links.push({ x: s.x, y: s.y, fromStorey: bestFrom.storey, toStorey: bestTo.storey,
            fromZ: bestFrom.floorZ, toZ: bestTo.floorZ, ifc_class: s.ifc_class });
        }
      });
      console.log('[S233] §VERT_TRANSPORT ' + links.length + ' storey links from ' + vt.length + ' stairs/lifts');
      return links;
    }

    // ══════════════════════════════════════════════════════════════
    // SECTION B4: ROUTE TEMPLATE — Precomputed Corridor Graph
    // ══════════════════════════════════════════════════════════════

    var routeTemplateCache = {};
    A.clearRouteCache = function() { routeTemplateCache = {}; };

    function buildRouteTemplate(storey) {
      if (routeTemplateCache[storey]) return routeTemplateCache[storey];

      var g = buildGrid(storey);
      if (!g) return null;

      var nodes = [];
      var nodeMap = {};

      if (g.doorCells) {
        var doorKeys = Object.keys(g.doorCells);
        for (var di = 0; di < doorKeys.length; di++) {
          var dk = parseInt(doorKeys[di]);
          var dc = dk % g.cols, dr = Math.floor(dk / g.cols);
          var key = dc + ',' + dr;
          if (!nodeMap[key]) {
            var ifc = fromCell(g, dc, dr);
            nodeMap[key] = nodes.length;
            nodes.push({ id: 'door_' + di, c: dc, r: dr, x: ifc.x, y: ifc.y, label: 'Door', type: 'door' });
          }
        }
      }

      var cardinals = [[0,-1],[0,1],[-1,0],[1,0]];
      for (var jr = 1; jr < g.rows - 1; jr++) {
        for (var jc = 1; jc < g.cols - 1; jc++) {
          if (g.grid[jr * g.cols + jc] !== 0) continue;
          var walkCount = 0;
          for (var cd = 0; cd < 4; cd++) {
            var nc = jc + cardinals[cd][0], nr = jr + cardinals[cd][1];
            if (nc >= 0 && nc < g.cols && nr >= 0 && nr < g.rows && g.grid[nr * g.cols + nc] === 0) {
              walkCount++;
            }
          }
          if (walkCount >= 3 || walkCount === 1) {
            var jkey = jc + ',' + jr;
            if (!nodeMap[jkey]) {
              var jifc = fromCell(g, jc, jr);
              var jtype = walkCount >= 3 ? 'junction' : 'endpoint';
              nodeMap[jkey] = nodes.length;
              nodes.push({ id: jtype + '_' + nodes.length, c: jc, r: jr, x: jifc.x, y: jifc.y,
                label: jtype === 'junction' ? 'Junction' : 'End', type: jtype });
            }
          }
        }
      }

      if (nodes.length < 2) {
        console.log('[S233] §ROUTE_TEMPLATE_SKIP storey="' + storey + '" nodes=' + nodes.length + ' (too few)');
        return null;
      }

      var edgeSet = {};
      var MAX_BFS = 80;

      for (var ni = 0; ni < nodes.length; ni++) {
        var visited = {};
        var queue = [{ c: nodes[ni].c, r: nodes[ni].r, dist: 0 }];
        visited[nodes[ni].c + ',' + nodes[ni].r] = true;

        while (queue.length > 0) {
          var cur = queue.shift();
          if (cur.dist > MAX_BFS) continue;

          var ck = cur.c + ',' + cur.r;
          if (ck !== nodes[ni].c + ',' + nodes[ni].r && nodeMap[ck] !== undefined) {
            var nj = nodeMap[ck];
            var lo = Math.min(ni, nj), hi = Math.max(ni, nj);
            var ekey = lo + ',' + hi;
            var edgeDist = cur.dist * CELL_SIZE;
            if (!edgeSet[ekey] || edgeDist < edgeSet[ekey]) {
              edgeSet[ekey] = edgeDist;
            }
            continue;
          }

          var dirs8 = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
          for (var dd = 0; dd < dirs8.length; dd++) {
            var nnc = cur.c + dirs8[dd][0], nnr = cur.r + dirs8[dd][1];
            if (nnc < 0 || nnc >= g.cols || nnr < 0 || nnr >= g.rows) continue;
            var nk2 = nnc + ',' + nnr;
            if (visited[nk2]) continue;
            if (g.grid[nnr * g.cols + nnc] !== 0) continue;
            visited[nk2] = true;
            var stepDist = (dirs8[dd][0] !== 0 && dirs8[dd][1] !== 0) ? 1.414 : 1.0;
            queue.push({ c: nnc, r: nnr, dist: cur.dist + stepDist });
          }
        }
      }

      var edges = [];
      var ekeys = Object.keys(edgeSet);
      for (var ek = 0; ek < ekeys.length; ek++) {
        var parts = ekeys[ek].split(',');
        edges.push({ from: parseInt(parts[0]), to: parseInt(parts[1]), cost: edgeSet[ekeys[ek]] });
      }

      var connected = {};
      for (var ei2 = 0; ei2 < edges.length; ei2++) {
        connected[edges[ei2].from] = true;
        connected[edges[ei2].to] = true;
      }
      for (var oi = 0; oi < nodes.length; oi++) {
        if (connected[oi]) continue;
        var bestJ = -1, bestD = Infinity;
        for (var oj = 0; oj < nodes.length; oj++) {
          if (oj === oi || !connected[oj]) continue;
          var odx = nodes[oi].x - nodes[oj].x, ody = nodes[oi].y - nodes[oj].y;
          var od = Math.sqrt(odx * odx + ody * ody);
          if (od < bestD) { bestD = od; bestJ = oj; }
        }
        if (bestJ >= 0) {
          edges.push({ from: oi, to: bestJ, cost: bestD });
          connected[oi] = true;
        }
      }

      labelNodes(nodes, storey);

      var template = { nodes: nodes, edges: edges, storey: storey, nodeMap: nodeMap, grid: g };
      routeTemplateCache[storey] = template;

      console.log('[S233] §ROUTE_TEMPLATE storey="' + storey + '" nodes=' + nodes.length +
        ' edges=' + edges.length + ' types=' +
        nodes.reduce(function(acc, n) { acc[n.type] = (acc[n.type] || 0) + 1; return acc; }, {}));

      return template;
    }

    function labelNodes(nodes, storey) {
      if (!A.db) return;
      var bld = A.activeBuilding || '';
      try {
        var sql = 'SELECT m.element_name, t.center_x, t.center_y FROM elements_meta m' +
          ' JOIN element_transforms t ON m.guid = t.guid' +
          " WHERE m.ifc_class IN ('IfcSpace','IfcRoom')" +
          ' AND m.storey = ?' + (bld ? ' AND m.building = ?' : '');
        var params = [storey]; if (bld) params.push(bld);
        var rows = A.db.exec(sql, params);
        if (!rows.length || !rows[0].values.length) return;

        var spaces = rows[0].values.map(function(r) { return { name: r[0], x: r[1], y: r[2] }; });

        for (var i = 0; i < nodes.length; i++) {
          var bestSpace = null, bestDist = Infinity;
          for (var si = 0; si < spaces.length; si++) {
            var sdx = nodes[i].x - spaces[si].x, sdy = nodes[i].y - spaces[si].y;
            var sd = sdx * sdx + sdy * sdy;
            if (sd < bestDist) { bestDist = sd; bestSpace = spaces[si]; }
          }
          if (bestSpace && Math.sqrt(bestDist) < 10) {
            nodes[i].label = bestSpace.name || nodes[i].label;
          }
        }
      } catch(e) { /* no spaces */ }
    }

    function graphAStar(template, startIfc, endIfc) {
      var nodes = template.nodes;
      var edges = template.edges;

      var startNode = nearestNode(nodes, startIfc.x, startIfc.y);
      var endNode = nearestNode(nodes, endIfc.x, endIfc.y);
      if (startNode < 0 || endNode < 0) return null;
      if (startNode === endNode) {
        return [nodes[startNode], nodes[endNode]];
      }

      var adj = {};
      for (var i = 0; i < nodes.length; i++) adj[i] = [];
      for (var ei = 0; ei < edges.length; ei++) {
        adj[edges[ei].from].push({ to: edges[ei].to, cost: edges[ei].cost });
        adj[edges[ei].to].push({ to: edges[ei].from, cost: edges[ei].cost });
      }

      var open = [{ node: startNode, g: 0, f: 0 }];
      var closed = {};
      var gScore = {};
      var parent = {};
      gScore[startNode] = 0;

      var maxIter = nodes.length * 10;
      var iter = 0;

      while (open.length > 0 && iter++ < maxIter) {
        var bestI = 0;
        for (var oi = 1; oi < open.length; oi++) {
          if (open[oi].f < open[bestI].f) bestI = oi;
        }
        var cur = open.splice(bestI, 1)[0];
        if (cur.node === endNode) {
          var path = [endNode];
          var pk = endNode;
          while (parent[pk] !== undefined) {
            pk = parent[pk];
            path.unshift(pk);
          }
          return path.map(function(ni) { return nodes[ni]; });
        }
        closed[cur.node] = true;

        var neighbours = adj[cur.node] || [];
        for (var ai = 0; ai < neighbours.length; ai++) {
          var nb = neighbours[ai];
          if (closed[nb.to]) continue;
          var ng = cur.g + nb.cost;
          if (gScore[nb.to] === undefined || ng < gScore[nb.to]) {
            gScore[nb.to] = ng;
            parent[nb.to] = cur.node;
            var hx = nodes[nb.to].x - nodes[endNode].x, hy = nodes[nb.to].y - nodes[endNode].y;
            var h = Math.sqrt(hx * hx + hy * hy);
            var inOpen = false;
            for (var oj = 0; oj < open.length; oj++) {
              if (open[oj].node === nb.to) {
                open[oj].g = ng; open[oj].f = ng + h;
                inOpen = true; break;
              }
            }
            if (!inOpen) open.push({ node: nb.to, g: ng, f: ng + h });
          }
        }
      }
      console.log('[S233] §GRAPH_ASTAR_FAIL startNode=' + startNode + ' endNode=' + endNode +
        ' visited=' + Object.keys(closed).length + '/' + nodes.length);
      return null;
    }

    function nearestNode(nodes, x, y) {
      var best = -1, bestDist = Infinity;
      for (var i = 0; i < nodes.length; i++) {
        var dx = nodes[i].x - x, dy = nodes[i].y - y;
        var d = dx * dx + dy * dy;
        if (d < bestDist) { bestDist = d; best = i; }
      }
      return best;
    }

    function graphPathToWaypoints(graphPath, startIfc, endIfc, storey) {
      if (!graphPath || graphPath.length < 1) return null;

      var floorZ = 0;
      if (A.walkStoreyLevels) {
        for (var li = 0; li < A.walkStoreyLevels.length; li++) {
          if (A.walkStoreyLevels[li].storey === storey) { floorZ = A.walkStoreyLevels[li].floorZ; break; }
        }
      }

      var STEP = 4;
      var waypoints = [];
      var points = [{ x: startIfc.x, y: startIfc.y, label: 'Start' }];
      for (var gi = 0; gi < graphPath.length; gi++) {
        points.push({ x: graphPath[gi].x, y: graphPath[gi].y, label: graphPath[gi].label || '' });
      }
      points.push({ x: endIfc.x, y: endIfc.y, label: 'Destination' });

      for (var pi = 0; pi < points.length - 1; pi++) {
        var ax = points[pi].x, ay = points[pi].y;
        var bx = points[pi + 1].x, by = points[pi + 1].y;
        var dx = bx - ax, dy = by - ay;
        var segDist = Math.sqrt(dx * dx + dy * dy);
        var segSteps = Math.max(1, Math.ceil(segDist / STEP));

        for (var si = 0; si < segSteps; si++) {
          var t = si / segSteps;
          var wp = { x: ax + dx * t, y: ay + dy * t, z: floorZ, storey: storey };
          if (si === 0 && points[pi].label) wp.label = points[pi].label;
          waypoints.push(wp);
        }
      }
      waypoints.push({ x: endIfc.x, y: endIfc.y, z: floorZ, storey: storey, label: 'Destination' });

      return waypoints;
    }

    // ── Expose on A (called by navigate_path.js and navigate_controls.js) ──
    A.buildGrid = buildGrid;
    A.toCell = toCell;
    A.fromCell = fromCell;
    A.astar = astar;
    A.findNearestWalkable = findNearestWalkable;
    A.findVerticalTransport = findVerticalTransport;
    A.matchStairsToStoreys = matchStairsToStoreys;
    A.buildRouteTemplate = buildRouteTemplate;
    A.graphAStar = graphAStar;
    A.nearestNode = nearestNode;
    A.graphPathToWaypoints = graphPathToWaypoints;
    A.getRouteTemplate = function(storey) { return routeTemplateCache[storey] || null; };
  }

  window.NavigateGrid = { init: init };
})();
