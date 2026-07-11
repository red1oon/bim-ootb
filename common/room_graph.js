/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * room_graph.js — §7 room-to-room adjacency graph + pathfinding
 * (prompts/Modeller/DISC_Walker/VIEWER_FIND_PANEL_ROOM_ACCURACY.md §7, 2026-07-11).
 *
 * WHY THIS IS NEW: checked directly (see the spec doc) — no room-to-room adjacency graph exists
 * anywhere in this pipeline before this file. `scripts/compile_rooms.py`'s door-rescue computes
 * PER-ROOM door adjacency only ("does room X have a door nearby, for the flood-fill's own
 * classification"), never room-to-room connectivity. `build/room_type_classifier.js`'s
 * `countAdjacentDoors()` extends the same per-room test to a COUNT, still per-room.
 *
 * PROVENANCE — reuses, does not reinvent, the existing door-adjacency buffer test:
 * `scripts/compile_rooms.py` `_door_adjacent()` (DOOR_BUFFER_SLACK = RES = 0.20m, buffer =
 * max(door.bbox_x, door.bbox_y)/2 + DOOR_BUFFER_SLACK around the door's own real footprint) and
 * `_is_room_door()` (name-keyword exclusion for lift/elevator doors — real doors, not room
 * evidence, found on real SampleCastle data). This file's new contribution is applying that SAME
 * per-room test to EVERY room on the door's storey and recording which room(s) it falls inside —
 * a door whose buffered point falls inside exactly 2 rooms' footprints is a real, measured edge
 * between those 2 rooms, carrying the door's own real guid (edge provenance, not inferred).
 *
 * §MULTI-RECT aware: a room may be N spatial_structure rows sharing `room_guid` (grouped the same
 * way `viewer/navigate_find.js` `_allRoomVolumes()` already does) — a door counts as touching the
 * room if it hits ANY of that room's sub-rects.
 *
 * DISTANCE, not buffered-containment, is the match rule (measured directly against real Duplex
 * data — see spec doc §7 witness): for each room on the door's storey, compute the point-to-AABB
 * distance from the door's own center to that room's rect-set (0 if the point already falls
 * inside a rect, else the Euclidean distance to its nearest edge). A room is a CANDIDATE if that
 * distance is within the door's own buffer radius (max(bbox_x,bbox_y)/2 + DOOR_BUFFER_SLACK — same
 * constant compile_rooms.py uses, just as an acceptance radius here instead of a box-inflation).
 * An earlier "inflate every room's box by the buffer and count containment hits" version was tried
 * first and produced WRONG edges on real Duplex data — 3-way buffer overlaps on tightly-packed
 * rooms (e.g. Level 2's Bathroom/Utility/Bedroom cluster) resolved to the two rooms with the
 * closest CENTERS to the door, which is not the same as the two rooms the door actually opens
 * between (verified by hand: door `150478` sits literally inside Bedroom A203's rect (distance 0)
 * and 0.07m off Hallway A201's edge — center-distance wrongly preferred Bathroom A204 instead).
 * Distance-to-nearest-edge fixes this because the two REAL neighbours are always at ~0 distance
 * (the door sits on/inside their shared boundary); a merely-nearby third room is farther.
 *
 * Match counts, per door (all measured + §-logged by `buildGraph`, never invented):
 *   0 candidates → orphan door (log only, no edge — e.g. a door whose room's data is missing bbox)
 *   1 candidate  → dead-end/exterior door (the room's own front door to outside — real, no edge)
 *   2 candidates → the normal case: one real edge, carrying the door's own guid
 *   3+ candidates → ambiguous (buffer overlap on tightly-packed rooms) — logged, edge drawn between
 *              the 2 CLOSEST-BY-DISTANCE candidates (a measured tie-break, not a guess)
 *
 * Caller contract: `dbQuery(sql, params)` returns an array of row-ARRAYS (positional, the same
 * `A.dbQuery` convention `common/room_habitability.js` already assumes) — this module is DB/file
 * I/O-free otherwise, so it runs identically in the browser (viewer/modeller) and in a node
 * witness script against sql.js/better-sqlite3.
 */
(function () {
  'use strict';
  var ROOT = (typeof window !== 'undefined') ? window : {};

  // Ported verbatim from scripts/compile_rooms.py — see file header. Not a new number.
  var DOOR_BUFFER_SLACK = 0.20;
  // §DOOR-NOT-ROOM ported verbatim from scripts/compile_rooms.py NON_ROOM_DOOR_NAMES.
  var NON_ROOM_DOOR_NAMES = ['liftdeur', 'lift', 'elevator', 'aufzug', 'fahrstuhl', 'hoist'];
  function isRoomDoor(name) {
    var n = String(name || '').toLowerCase();
    for (var i = 0; i < NON_ROOM_DOOR_NAMES.length; i++) if (n.indexOf(NON_ROOM_DOOR_NAMES[i]) >= 0) return false;
    return true;
  }

  // Build the room-adjacency graph from the SAME building db the Room Lens already reads.
  // Returns { nodes:[{guid,name,label,storey,rects,cx,cy}], edges:[{a,b,doorGuid,doorName,storey,ambiguous?}],
  //           nodesByGuid:{guid:node}, stats:{...} }.
  function buildGraph(dbQuery, opts) {
    opts = opts || {};
    var log = opts.log || function () {};
    var nodes = {}, order = [];
    var hasRoomGuid = false;
    try {
      var cols = dbQuery('PRAGMA table_info(spatial_structure)') || [];
      hasRoomGuid = cols.some(function (c) { return c[1] === 'room_guid'; });
    } catch (eCols) { /* hasRoomGuid stays false */ }

    var spaceRows = [];
    try {
      spaceRows = dbQuery('SELECT s.guid, s.name, s.object_type, s.predefined_type, s.center_x, s.center_y, ' +
        's.size_x, s.size_y, p.name, s.center_z' + (hasRoomGuid ? ', s.room_guid' : ', NULL') +
        ' FROM spatial_structure s LEFT JOIN spatial_structure p ON p.guid = s.parent_guid' +
        " WHERE s.type='IfcSpace' AND s.center_x IS NOT NULL AND s.size_x IS NOT NULL") || [];
    } catch (eSp) { log('§ROOM_GRAPH_SPACE_ERR ' + eSp.message); return { nodes: [], edges: [], nodesByGuid: {} }; }

    spaceRows.forEach(function (r) {
      var lg = r[10] || r[0]; // logical room guid: room_guid, falling back to this row's own guid (§MULTI-RECT)
      if (!nodes[lg]) {
        nodes[lg] = {
          guid: lg, name: r[1] || lg,
          label: [r[2], r[3], r[1]].filter(Boolean).join(' '),
          storey: r[8] || '(no storey)', rects: [], _sumx: 0, _sumy: 0, _sumz: 0, _n: 0
        };
        order.push(lg);
      }
      var g = nodes[lg];
      g.rects.push({ x0: r[4] - r[6] / 2, x1: r[4] + r[6] / 2, y0: r[5] - r[7] / 2, y1: r[5] + r[7] / 2 });
      g._sumx += r[4]; g._sumy += r[5]; g._sumz += (r[9] || 0); g._n++;
    });
    order.forEach(function (lg) {
      var g = nodes[lg];
      g.cx = g._sumx / g._n; g.cy = g._sumy / g._n; g.cz = g._sumz / g._n;
      delete g._sumx; delete g._sumy; delete g._sumz; delete g._n;
    });

    var doorRows = [];
    try {
      doorRows = dbQuery('SELECT m.guid, m.element_name, m.storey, t.center_x, t.center_y, t.center_z, t.bbox_x, t.bbox_y' +
        ' FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid' +
        " WHERE m.ifc_class LIKE 'IfcDoor%' AND m.discipline='ARC' AND t.center_x IS NOT NULL") || [];
    } catch (eDr) { log('§ROOM_GRAPH_DOOR_ERR ' + eDr.message); }

    // Point-to-AABB distance: 0 if (px,py) already inside [x0,x1]x[y0,y1], else Euclidean
    // distance to the nearest edge/corner.
    function rectDist(rc, px, py) {
      var dx = Math.max(rc.x0 - px, 0, px - rc.x1);
      var dy = Math.max(rc.y0 - py, 0, py - rc.y1);
      return Math.hypot(dx, dy);
    }

    var edges = [], deadend = 0, orphan = 0, ambiguous = 0, nonRoomDoors = 0;
    doorRows.forEach(function (d) {
      var guid = d[0], name = d[1] || '', storey = d[2] || '', dx = d[3], dy = d[4], bx = d[6] || 0, by = d[7] || 0;
      if (!isRoomDoor(name)) { nonRoomDoors++; return; }
      var buf = Math.max(bx, by) / 2 + DOOR_BUFFER_SLACK;
      var cands = [];
      order.forEach(function (lg) {
        var g = nodes[lg];
        if (g.storey !== storey) return; // per-storey, same discipline as compile_rooms.py storey_doors()
        var best = Infinity;
        for (var i = 0; i < g.rects.length; i++) best = Math.min(best, rectDist(g.rects[i], dx, dy));
        if (best <= buf) cands.push({ lg: lg, dist: best });
      });
      cands.sort(function (p, q) { return p.dist - q.dist; });
      if (cands.length >= 2) {
        edges.push({ a: cands[0].lg, b: cands[1].lg, doorGuid: guid, doorName: name, storey: storey,
          ambiguous: cands.length > 2, hitCount: cands.length });
        if (cands.length > 2) {
          ambiguous++;
          log('§ROOM_GRAPH_AMBIGUOUS_DOOR "' + name + '" candidates=' + cands.length +
            ' picked=' + cands[0].lg + ',' + cands[1].lg);
        }
      } else if (cands.length === 1) {
        deadend++;
      } else {
        orphan++;
      }
    });

    log('§ROOM_GRAPH nodes=' + order.length + ' doors=' + doorRows.length + ' nonRoomDoors=' + nonRoomDoors +
      ' edges=' + edges.length + ' deadend=' + deadend + ' orphan=' + orphan + ' ambiguous=' + ambiguous);

    return {
      nodes: order.map(function (lg) { return nodes[lg]; }),
      edges: edges,
      nodesByGuid: nodes,
      stats: { doors: doorRows.length, nonRoomDoors: nonRoomDoors, edges: edges.length, deadend: deadend, orphan: orphan, ambiguous: ambiguous }
    };
  }

  // Degree per node guid (edge count, ambiguous edges count too — they ARE real edges, just tie-broken).
  function degree(graph) {
    var deg = {};
    graph.nodes.forEach(function (n) { deg[n.guid] = 0; });
    graph.edges.forEach(function (e) { deg[e.a] = (deg[e.a] || 0) + 1; deg[e.b] = (deg[e.b] || 0) + 1; });
    return deg;
  }

  // Connected-component id per node guid (for "is every room reachable from every other" honesty check).
  function components(graph) {
    var adj = {};
    graph.nodes.forEach(function (n) { adj[n.guid] = []; });
    graph.edges.forEach(function (e) { if (adj[e.a] && adj[e.b]) { adj[e.a].push(e.b); adj[e.b].push(e.a); } });
    var comp = {}, cid = 0;
    graph.nodes.forEach(function (n) {
      if (comp[n.guid] != null) return;
      var stack = [n.guid]; comp[n.guid] = cid;
      while (stack.length) {
        var u = stack.pop();
        (adj[u] || []).forEach(function (v) { if (comp[v] == null) { comp[v] = cid; stack.push(v); } });
      }
      cid++;
    });
    return comp;
  }

  // Dijkstra shortest path, weighted by real room-center-to-room-center distance (metres) — a
  // measured weight (not hop-count), so a path through a long shared corridor is not falsely
  // preferred over a short direct door-to-door hop just because both are "1 hop".
  function shortestPath(graph, fromGuid, toGuid) {
    if (fromGuid === toGuid) return { path: [fromGuid], doors: [], distance: 0 };
    var adj = {};
    graph.nodes.forEach(function (n) { adj[n.guid] = []; });
    graph.edges.forEach(function (e) {
      if (!adj[e.a] || !adj[e.b]) return;
      var ga = graph.nodesByGuid[e.a], gb = graph.nodesByGuid[e.b];
      var w = Math.hypot(ga.cx - gb.cx, ga.cy - gb.cy);
      adj[e.a].push({ to: e.b, doorGuid: e.doorGuid, doorName: e.doorName, w: w });
      adj[e.b].push({ to: e.a, doorGuid: e.doorGuid, doorName: e.doorName, w: w });
    });
    if (!adj[fromGuid] || !adj[toGuid]) return null;
    var dist = {}, prev = {}, visited = {};
    graph.nodes.forEach(function (n) { dist[n.guid] = Infinity; });
    dist[fromGuid] = 0;
    var pq = [fromGuid];
    while (pq.length) {
      pq.sort(function (a, b) { return dist[a] - dist[b]; });
      var u = pq.shift();
      if (visited[u]) continue;
      visited[u] = true;
      if (u === toGuid) break;
      (adj[u] || []).forEach(function (e) {
        var nd = dist[u] + e.w;
        if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = { from: u, doorGuid: e.doorGuid, doorName: e.doorName }; pq.push(e.to); }
      });
    }
    if (dist[toGuid] === Infinity) return null;
    var path = [toGuid], doors = [], cur = toGuid;
    while (cur !== fromGuid) {
      var p = prev[cur];
      if (!p) return null; // defensive — should not happen if dist[toGuid] finite
      doors.unshift({ guid: p.doorGuid, name: p.doorName });
      path.unshift(p.from);
      cur = p.from;
    }
    return { path: path, doors: doors, distance: dist[toGuid] };
  }

  var API = {
    buildGraph: buildGraph, degree: degree, components: components, shortestPath: shortestPath,
    isRoomDoor: isRoomDoor, DOOR_BUFFER_SLACK: DOOR_BUFFER_SLACK
  };
  ROOT.RoomGraph = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
