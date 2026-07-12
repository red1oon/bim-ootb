/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * room_graph.js — §7 room-to-room adjacency graph + pathfinding
 * (prompts/Modeller/DISC_Walker/VIEWER_FIND_PANEL_ROOM_ACCURACY.md §7, 2026-07-11).
 * OCCUPANT UPGRADE (prompts/Modeller/DISC_Walker/OCCUPANT_PATHFINDER.md, 2026-07-12): the graph
 * below this point is E1-only (door touches >=2 rooms). That undercounts how people actually walk —
 * "it need not be door to door... along the hallway... even thru the stairs" (user intent, verbatim
 * in the spec). This file adds three more edge kinds on top of the untouched E1 logic:
 *   E2 — a door that touches exactly ONE room (previously discarded as "deadend") is that room's
 *        real door onto un-compiled circulation space (hallway/concourse) — rescued as room<->CIRC.
 *   E3 — stair/ramp flights (elements_meta IfcStairFlight/IfcRampFlight) bridge two storeys'
 *        circulation nodes, vertically, so cross-storey paths exist at all.
 *   E4 — the existing nonRoomDoors detection (a door name-filtered out of the room test, e.g. a
 *        building's few non-room-facing doors) becomes an N-EXIT node — free escape-route targets.
 * API-COMPATIBLE BY CONSTRUCTION: `graph.nodes` (the array the Viewer's From/To room picker
 * enumerates directly, viewer/navigate_find.js `_buildPathPanel()`) stays ROOM-ONLY, exactly as
 * before — CIRC/EXIT/waypoint entries are added ONLY to `graph.nodesByGuid` (a plain map, never
 * iterated as an array anywhere in this codebase), so every existing consumer keeps working with
 * ZERO edits. `shortestPath()`'s exposed `path` never contains a bare CIRC node guid either — see
 * that function's header for the waypoint-substitution rule that keeps the drawn polyline hugging
 * real door/stair positions, not an invented storey centroid.
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
 *   1 candidate  → the room's own door onto circulation (E2 rescue — see file header above)
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

  // §STAIR-GROUP: collapse a multi-flight stair's individual Run rows (Run 1/Run 2/... or a
  // trailing ":N" index — both real naming conventions measured across Terminal/JKR/Duplex source
  // data, see OCCUPANT_PATHFINDER.md POC log) to ONE base key per PHYSICAL stair. Order matters:
  // try " Run N" first — some names ALSO end in ":<ID>" (the flight's own numeric id), and
  // stripping ":\d+$" unconditionally would eat that id too (measured bug, POC run 1).
  var RUN_SUFFIX_RE = /\s+Run\s+\d+$/;
  var INDEX_SUFFIX_RE = /:\d+$/;
  function stairBaseKey(name) {
    var n = String(name || '');
    if (RUN_SUFFIX_RE.test(n)) return n.replace(RUN_SUFFIX_RE, '');
    return n.replace(INDEX_SUFFIX_RE, '');
  }

  // Build the room-adjacency graph from the SAME building db the Room Lens already reads.
  // Returns { nodes:[{guid,name,label,storey,rects,cx,cy}] (ROOM NODES ONLY — see file header),
  //           edges:[{a,b,doorGuid,doorName,storey,kind,ambiguous?}],
  //           nodesByGuid:{guid:node} (superset: rooms + circ + exit + waypoints), stats:{...} }.
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
          guid: lg, kind: 'room', name: r[1] || lg,
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
    var roomOrder = order.slice(); // §API-COMPAT: exposed graph.nodes stays room-only (see file header)

    // §STOREY-Z: derive each storey's z from its own rooms' average center_z (robust even where an
    // IfcBuildingStorey row's own center_z is NULL — measured on Duplex, see POC log) — needed to
    // work out which two storeys a stair/ramp flight bridges (E3).
    var storeyZSum = {}, storeyZN = {};
    roomOrder.forEach(function (lg) {
      var g = nodes[lg];
      storeyZSum[g.storey] = (storeyZSum[g.storey] || 0) + g.cz;
      storeyZN[g.storey] = (storeyZN[g.storey] || 0) + 1;
    });
    var storeyZ = {};
    Object.keys(storeyZSum).forEach(function (s) { storeyZ[s] = storeyZSum[s] / storeyZN[s]; });
    var storeysSorted = Object.keys(storeyZ).sort(function (a, b) { return storeyZ[a] - storeyZ[b]; });

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

    function circNode(storey, cx, cy, cz) {
      var cg = 'CIRC::' + storey;
      if (!nodes[cg]) {
        nodes[cg] = { guid: cg, kind: 'circ', name: 'Circulation — ' + storey, storey: storey,
          cx: cx, cy: cy, cz: cz };
        order.push(cg);
      }
      return cg;
    }

    var edges = [], deadend = 0, orphan = 0, ambiguous = 0, nonRoomDoors = 0, e2 = 0;
    doorRows.forEach(function (d) {
      var guid = d[0], name = d[1] || '', storey = d[2] || '', dx = d[3], dy = d[4], dz = d[5], bx = d[6] || 0, by = d[7] || 0;
      if (!isRoomDoor(name)) { nonRoomDoors++; return; }
      var buf = Math.max(bx, by) / 2 + DOOR_BUFFER_SLACK;
      var cands = [];
      roomOrder.forEach(function (lg) {
        var g = nodes[lg];
        if (g.storey !== storey) return; // per-storey, same discipline as compile_rooms.py storey_doors()
        var best = Infinity;
        for (var i = 0; i < g.rects.length; i++) best = Math.min(best, rectDist(g.rects[i], dx, dy));
        if (best <= buf) cands.push({ lg: lg, dist: best });
      });
      cands.sort(function (p, q) { return p.dist - q.dist; });
      if (cands.length >= 2) {
        edges.push({ a: cands[0].lg, b: cands[1].lg, doorGuid: guid, doorName: name, storey: storey,
          kind: 'E1', ambiguous: cands.length > 2, hitCount: cands.length });
        if (cands.length > 2) {
          ambiguous++;
          log('§ROOM_GRAPH_AMBIGUOUS_DOOR "' + name + '" candidates=' + cands.length +
            ' picked=' + cands[0].lg + ',' + cands[1].lg);
        }
      } else if (cands.length === 1) {
        deadend++; e2++;
        var cg = circNode(storey, dx, dy, dz);
        // §API-COMPAT-WAYPOINT: register the door's OWN real guid as a rendering waypoint for this
        // circ hop (see shortestPath() below) — a real position, not a storey centroid.
        if (!nodes[guid]) nodes[guid] = { guid: guid, kind: 'doorwp', name: name, storey: storey, cx: dx, cy: dy, cz: dz };
        edges.push({ a: cands[0].lg, b: cg, doorGuid: guid, doorName: name, storey: storey, kind: 'E2', wpA: null, wpB: guid });
      } else {
        orphan++;
      }
    });

    // ── E3: stair/ramp flights bridge two storeys' circulation nodes ──
    var flightRows = [];
    try {
      flightRows = dbQuery("SELECT m.guid, m.element_name, t.center_x, t.center_y, t.center_z, t.bbox_z" +
        ' FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid' +
        " WHERE (m.ifc_class LIKE 'IfcStairFlight%' OR m.ifc_class LIKE 'IfcRampFlight%') AND t.center_z IS NOT NULL") || [];
    } catch (eFl) { log('§ROOM_GRAPH_STAIR_ERR ' + eFl.message); }

    var flightGroups = {}, flightGroupOrder = [];
    flightRows.forEach(function (f) {
      var key = stairBaseKey(f[1]);
      if (!flightGroups[key]) {
        flightGroups[key] = { guids: [], cx: 0, cy: 0, n: 0, zlo: Infinity, zhi: -Infinity };
        flightGroupOrder.push(key);
      }
      var gr = flightGroups[key];
      gr.guids.push(f[0]);
      gr.cx += f[2]; gr.cy += f[3]; gr.n++;
      var cz = f[4], bz = f[5] || 0;
      gr.zlo = Math.min(gr.zlo, cz - bz / 2);
      gr.zhi = Math.max(gr.zhi, cz + bz / 2);
    });

    var e3 = 0, e3Skipped = 0;
    flightGroupOrder.forEach(function (key) {
      var gr = flightGroups[key];
      if (gr.n === 0) return;
      var gcx = gr.cx / gr.n, gcy = gr.cy / gr.n;
      // Rule (measured against real Terminal + JKR data, OCCUPANT_PATHFINDER.md POC log): prefer
      // storeys whose OWN z sits INSIDE the flight group's [zlo,zhi] span (the flight physically
      // reaches that floor's elevation) — bridge the lowest and highest such storey. When exactly
      // ONE storey is contained (the common real case — a flight's bbox usually reaches only one
      // storey's z exactly, extending past it toward the real partner floor without quite
      // reaching that floor's own z too), use whichever side's extension is a SUBSTANTIAL share
      // (>=30%) of the flight's own span to pick the real neighbour storey — never invent a
      // bridge in a direction with no storey there (verified: this correctly excludes Terminal's
      // below-grade entrance stairs, whose upward poke past Aras Tanah is only ~24% of their span).
      var contained = storeysSorted.filter(function (s) { return gr.zlo <= storeyZ[s] && storeyZ[s] <= gr.zhi; });
      var sA, sB;
      if (contained.length >= 2) {
        sA = contained[0]; sB = contained[contained.length - 1];
      } else if (contained.length === 1) {
        var s0 = contained[0], idx = storeysSorted.indexOf(s0);
        var downExt = storeyZ[s0] - gr.zlo, upExt = gr.zhi - storeyZ[s0];
        var span = gr.zhi - gr.zlo;
        var hasBelow = idx - 1 >= 0, hasAbove = idx + 1 < storeysSorted.length;
        var upOk = hasAbove && upExt >= 0.3 * span;
        var downOk = hasBelow && downExt >= 0.3 * span;
        var nbrIdx;
        if (upOk && (!downOk || upExt >= downExt)) nbrIdx = idx + 1;
        else if (downOk) nbrIdx = idx - 1;
        else { e3Skipped++; return; }
        sA = s0; sB = storeysSorted[nbrIdx];
      } else {
        var below = storeysSorted.filter(function (s) { return storeyZ[s] <= gr.zlo; });
        var above = storeysSorted.filter(function (s) { return storeyZ[s] >= gr.zhi; });
        if (!below.length || !above.length) { e3Skipped++; return; }
        sA = below[below.length - 1]; sB = above[0];
      }
      var zA = storeyZ[sA], zB = storeyZ[sB];
      var circA = circNode(sA, gcx, gcy, zA), circB = circNode(sB, gcx, gcy, zB);
      // §API-COMPAT-WAYPOINT: two synthetic-but-deterministic waypoint guids (this flight group's
      // own representative guid + a side suffix) at the flight's real low/high z — used to render
      // the vertical hop hugging the actual stair, not a storey centroid (see shortestPath()).
      var repGuid = gr.guids[0];
      var loWp = repGuid + '::lo', hiWp = repGuid + '::hi';
      if (!nodes[loWp]) nodes[loWp] = { guid: loWp, kind: 'stairwp', name: key + ' (lower)', cx: gcx, cy: gcy, cz: gr.zlo };
      if (!nodes[hiWp]) nodes[hiWp] = { guid: hiWp, kind: 'stairwp', name: key + ' (upper)', cx: gcx, cy: gcy, cz: gr.zhi };
      var wpForA = (zA <= zB) ? loWp : hiWp, wpForB = (zA <= zB) ? hiWp : loWp;
      edges.push({ a: circA, b: circB, doorGuid: repGuid, doorName: key, storey: sA + ' / ' + sB,
        kind: 'E3', w: Math.abs(gr.zhi - gr.zlo), wpA: wpForA, wpB: wpForB });
      e3++;
    });

    // ── E4: escape — the existing nonRoomDoors detection becomes an N-EXIT node (free fire-escape
    // target); connect the nearest room-or-circ node on that storey (real distance, not invented).
    var exits = 0, e4 = 0;
    doorRows.forEach(function (d) {
      var guid = d[0], name = d[1] || '', storey = d[2] || '', dx = d[3], dy = d[4], dz = d[5];
      if (isRoomDoor(name)) return; // only the name-filtered set — see file header
      var exitGuid = 'EXIT::' + guid;
      nodes[exitGuid] = { guid: exitGuid, kind: 'exit', name: 'Exit — ' + (name || guid), storey: storey,
        cx: dx, cy: dy, cz: dz };
      order.push(exitGuid); exits++;
      var best = null, bestD = Infinity;
      order.forEach(function (lg) {
        var g = nodes[lg];
        if (g.guid === exitGuid || g.storey !== storey) return;
        if (g.kind !== 'room' && g.kind !== 'circ') return;
        var dd = Math.hypot(g.cx - dx, g.cy - dy);
        if (dd < bestD) { bestD = dd; best = lg; }
      });
      if (best) {
        edges.push({ a: best, b: exitGuid, doorGuid: guid, doorName: name, storey: storey, kind: 'E4', w: bestD });
        e4++;
      }
    });

    var circCount = order.filter(function (lg) { return nodes[lg].kind === 'circ'; }).length;
    log('§ROOM_GRAPH nodes=' + roomOrder.length + ' doors=' + doorRows.length + ' nonRoomDoors=' + nonRoomDoors +
      ' edges=' + edges.filter(function (e) { return e.kind === 'E1'; }).length +
      ' deadend=' + deadend + ' orphan=' + orphan + ' ambiguous=' + ambiguous +
      ' circ=' + circCount + ' stairs=' + e3 + ' (skipped=' + e3Skipped + ') exits=' + exits + ' e2=' + e2);

    return {
      nodes: roomOrder.map(function (lg) { return nodes[lg]; }), // §API-COMPAT: room-only, see file header
      edges: edges,
      nodesByGuid: nodes, // superset: room + circ + exit + waypoint entries, see file header
      stats: { doors: doorRows.length, nonRoomDoors: nonRoomDoors,
        edges: edges.filter(function (e) { return e.kind === 'E1'; }).length,
        deadend: deadend, orphan: orphan, ambiguous: ambiguous,
        circ: circCount, stairs: e3, stairsSkipped: e3Skipped, exits: exits, e2: e2 }
    };
  }

  // Degree per node guid (edge count, ambiguous edges count too — they ARE real edges, just tie-broken).
  // Room-only by construction (graph.nodes is room-only) — unchanged from the pre-occupant-graph
  // behavior; a room's degree DOES reflect its new E2/E4 edges (edges reference real room guids on
  // one side), it simply never reports a degree FOR a circ/exit node (those aren't in graph.nodes).
  function degree(graph) {
    var deg = {};
    graph.nodes.forEach(function (n) { deg[n.guid] = 0; });
    graph.edges.forEach(function (e) { deg[e.a] = (deg[e.a] || 0) + 1; deg[e.b] = (deg[e.b] || 0) + 1; });
    return deg;
  }

  // Connected-component id per node guid (for "is every room reachable from every other" honesty check).
  // Room-only by construction (unchanged from pre-occupant-graph behavior — only counts E1 edges,
  // since an edge is only followed when BOTH endpoints are already-seeded room guids). Kept this way
  // deliberately: this is a separate, pre-existing function the spec doesn't ask to extend: only
  // shortestPath() is specified to walk the full occupant graph (circ/exit included).
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

  // §OCCUPANT-DIJKSTRA: walks the FULL graph — rooms + circ + exit nodes, E1-E4 edges — weighted by
  // real 3D distance (E1: room-center to room-center, unchanged formula so Duplex's existing
  // door-connected paths are byte-identical, see OCCUPANT_PATHFINDER.md W-PATH-DUPLEX-REGRESSION;
  // E2/E3/E4: the edge's own measured `w`, computed at buildGraph time from real door/flight/exit
  // positions). Internal only — shortestPath() below builds the adjacency and reconstructs the
  // EXPOSED path from this.
  function _buildAdjacency(graph) {
    var adj = {};
    graph.nodesByGuid && Object.keys(graph.nodesByGuid).forEach(function (g) { adj[g] = []; });
    graph.edges.forEach(function (e) {
      var a = e.a, b = e.b;
      if (!(a in adj) || !(b in adj)) return;
      var w;
      if (e.kind === 'E1' || e.kind == null) {
        var ga = graph.nodesByGuid[a], gb = graph.nodesByGuid[b];
        w = Math.hypot(ga.cx - gb.cx, ga.cy - gb.cy);
      } else {
        w = (typeof e.w === 'number') ? e.w : Math.hypot(
          graph.nodesByGuid[a].cx - graph.nodesByGuid[b].cx, graph.nodesByGuid[a].cy - graph.nodesByGuid[b].cy);
      }
      adj[a].push({ to: b, w: w, e: e, arriveSide: 'b' });
      adj[b].push({ to: a, w: w, e: e, arriveSide: 'a' });
    });
    return adj;
  }

  function _dijkstraCore(graph, adj, fromGuid, toGuid) {
    if (!adj[fromGuid] || !adj[toGuid]) return null;
    var dist = {}, prev = {}, visited = {};
    Object.keys(adj).forEach(function (g) { dist[g] = Infinity; });
    dist[fromGuid] = 0;
    var pq = [fromGuid];
    while (pq.length) {
      pq.sort(function (a, b) { return dist[a] - dist[b]; });
      var u = pq.shift();
      if (visited[u]) continue;
      visited[u] = true;
      if (u === toGuid) break;
      (adj[u] || []).forEach(function (edge) {
        var nd = dist[u] + edge.w;
        if (nd < dist[edge.to]) { dist[edge.to] = nd; prev[edge.to] = { from: u, edge: edge.e, arriveSide: edge.arriveSide }; pq.push(edge.to); }
      });
    }
    if (dist[toGuid] === Infinity) return null;
    return { dist: dist, prev: prev };
  }

  // §PUBLIC-HOP: what guid to expose in the returned `path` for a node we just arrived at. Rooms
  // and exits already carry a REAL position (their own guid is fine, unchanged for rooms — exactly
  // today's behavior). A CIRC node is an internal bookkeeping node only (one per storey, no single
  // real-world point actually walked) — never exposed directly; substituted with the specific
  // door/stair waypoint the arriving EDGE carries, so the drawn line hugs the real walk instead of
  // bending toward an invented storey centroid (OCCUPANT_PATHFINDER.md SPEC).
  function _publicHop(graph, arrivedGuid, edge, arriveSide) {
    var n = graph.nodesByGuid[arrivedGuid];
    if (!n || n.kind === 'room' || n.kind === 'exit') return arrivedGuid;
    if (n.kind === 'circ' && edge) {
      var wp = (arriveSide === 'a') ? edge.wpA : edge.wpB;
      if (wp && graph.nodesByGuid[wp]) return wp;
    }
    return arrivedGuid; // defensive fallback — should not happen with a well-formed edge
  }

  // Dijkstra shortest path over the FULL occupant graph. SAME SIGNATURE / SAME RESULT SHAPE as
  // before ({path, doors, distance}) — every existing consumer (viewer/navigate_find.js) needs
  // zero edits: `path` entries still resolve via `graph.nodesByGuid[g]` to a real {cx,cy,cz,name}
  // (rooms as before; circ hops now surface as a real door/stair waypoint instead, see _publicHop).
  function shortestPath(graph, fromGuid, toGuid) {
    if (fromGuid === toGuid) return { path: [fromGuid], doors: [], distance: 0 };
    var adj = _buildAdjacency(graph);
    var core = _dijkstraCore(graph, adj, fromGuid, toGuid);
    if (!core) return null;
    var path = [toGuid], doors = [], cur = toGuid;
    while (cur !== fromGuid) {
      var p = core.prev[cur];
      if (!p) return null; // defensive — should not happen if dist[toGuid] finite
      doors.unshift({ guid: p.edge.doorGuid, name: p.edge.doorName });
      var publicCur = _publicHop(graph, cur, p.edge, p.arriveSide);
      path[0] = publicCur; // replace the just-pushed guid with its public form
      path.unshift(p.from);
      cur = p.from;
    }
    return { path: path, doors: doors, distance: core.dist[toGuid] };
  }

  // §ESCAPE-ROUTE (OCCUPANT_PATHFINDER.md SPEC — "falls out" of shortestPath, not a separate
  // feature): nearest N-EXIT node from a room, by the same Dijkstra used for Room-Path.
  function escapeRoute(graph, fromGuid, opts) {
    opts = opts || {};
    var log = opts.log || function () {};
    var adj = _buildAdjacency(graph);
    if (!adj[fromGuid]) { log('§ESCAPE_ROUTE from=' + fromGuid + ' NO_GRAPH_NODE'); return null; }
    // Dijkstra from fromGuid across the whole graph (no fixed target), then pick the closest EXIT.
    var dist = {}, prev = {}, visited = {};
    Object.keys(adj).forEach(function (g) { dist[g] = Infinity; });
    dist[fromGuid] = 0;
    var pq = [fromGuid];
    while (pq.length) {
      pq.sort(function (a, b) { return dist[a] - dist[b]; });
      var u = pq.shift();
      if (visited[u]) continue;
      visited[u] = true;
      (adj[u] || []).forEach(function (edge) {
        var nd = dist[u] + edge.w;
        if (nd < dist[edge.to]) { dist[edge.to] = nd; prev[edge.to] = { from: u, edge: edge.e, arriveSide: edge.arriveSide }; pq.push(edge.to); }
      });
    }
    var bestExit = null, bestD = Infinity;
    Object.keys(graph.nodesByGuid).forEach(function (g) {
      if (graph.nodesByGuid[g].kind === 'exit' && dist[g] < bestD) { bestD = dist[g]; bestExit = g; }
    });
    if (!bestExit) { log('§ESCAPE_ROUTE from=' + fromGuid + ' NO_EXIT_REACHABLE'); return null; }
    var path = [bestExit], doors = [], cur = bestExit;
    while (cur !== fromGuid) {
      var p = prev[cur];
      if (!p) { log('§ESCAPE_ROUTE from=' + fromGuid + ' RECONSTRUCT_FAIL'); return null; }
      doors.unshift({ guid: p.edge.doorGuid, name: p.edge.doorName });
      path[0] = _publicHop(graph, cur, p.edge, p.arriveSide);
      path.unshift(p.from);
      cur = p.from;
    }
    var result = { path: path, doors: doors, distance: dist[bestExit], exitGuid: bestExit };
    log('§ESCAPE_ROUTE from=' + fromGuid + ' exit=' + bestExit + ' hops=' + doors.length + ' distance=' + dist[bestExit].toFixed(1));
    return result;
  }

  var API = {
    buildGraph: buildGraph, degree: degree, components: components, shortestPath: shortestPath,
    escapeRoute: escapeRoute, isRoomDoor: isRoomDoor, stairBaseKey: stairBaseKey, DOOR_BUFFER_SLACK: DOOR_BUFFER_SLACK
  };
  ROOT.RoomGraph = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
