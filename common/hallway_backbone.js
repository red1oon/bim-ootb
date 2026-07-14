/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * hallway_backbone.js — §HALLWAY-BACKBONE (2026-07-14, bim-compiler
 * prompts/FUNCTIONAL_SPACE_MGMT_NEXT_SESSION.md). Compiles a real, door+wall-grounded corridor
 * spine per storey from the SAME building db common/room_graph.js already reads. Verb chain
 * (matches the spec doc's step numbering 1:1):
 *   1. doorEdge(door)        — wall-run-axis from the door's OWN bbox aspect ratio.
 *   2. correlateDoorEdges()  — bucket-matrix keyed by (storey, axis, roundedRunCoord).
 *   3. joinDoorways()        — buckets with >=3 aligned doors = hallway-candidate.
 *   4. growToWall()          — extend the bucket's span until a REAL perpendicular wall caps it.
 *   5. terminateAtStair()    — an open (uncapped) end near a stair is a connecting space, not a
 *                              dead-end. Reuses room_graph.js's getStairGroups() — WalkerDoctrine
 *                              §10, the ONE trusted stair extractor, not a fresh ad-hoc query.
 *   6. walkBackbone()        — union-find merge of buckets whose grown spans cross (T-junction),
 *                              then an ordered walk of each resulting chain (serves BOTH path
 *                              routing/escape-route AND a flythrough camera path from the same
 *                              structure — user's explicit ask, one structure two consumers).
 *
 * WHY: room_graph.js's shortestPath() currently rescues a room's lone door onto ONE
 * per-storey `CIRC::<storey>` blob (see room_graph.js buildGraph() E2) and its _legalizePath()
 * detour only re-routes a chord that CROSSES A WALL — a chord that stays in open space but cuts
 * diagonally across a real corridor (not hugging its centerline) is "legal" and never detoured.
 * Both are why a rendered room-to-room path can visibly float through open space instead of
 * following the real hallway/stairway route (user-reported, 2026-07-14). This module's spine
 * nodes are meant to REPLACE that single blob with real, ordered waypoints along the actual
 * corridor, so shortestPath()'s own Dijkstra naturally routes through them — not just a rendering
 * patch. escapeRoute() reuses the exact same graph, so it inherits the fix for free, no separate
 * feature.
 *
 * DESIGN PRINCIPLE (user, 2026-07-14): the bucket/array-set is deliberately generic (storey, axis,
 * runCoord) — not hard-wired to doors only. Any element that corroborates a space's identity
 * (railings, stairs, walls, doors) can roll into the same structure later; this file's `doorEdge`
 * is one instance of an "edge contributor," not the only one that will ever exist.
 *
 * Caller contract: same dual-mode `dbQuery(sql)` -> array-of-row-arrays convention as
 * room_graph.js — DB/file I/O-free, runs identically in-browser and in a node witness script.
 */
(function () {
  'use strict';
  var ROOT = (typeof window !== 'undefined') ? window : {};
  var RoomGraph = (typeof module !== 'undefined' && module.exports) ? require('./room_graph.js') : ROOT.RoomGraph;

  // §RUN_COORD_TOL: bucket-rounding width for "these doors share the same wall run." Grounded in
  // real wall-thickness scale (typical interior wall 0.15-0.3m; this is generous slack for
  // wall-centerline-vs-face offset across a building's doors, not fitted to one building's data).
  var RUN_COORD_TOL = 0.6;
  var MIN_DOORS_FOR_HALLWAY = 3;
  // §STAIR_CLEARANCE: movement-clearance tolerance, per user's own steer ("stairs movement space
  // can be of say 2 meter height flow onto the stairs contour").
  var STAIR_CLEARANCE = 2.0;
  // Slack added to a wall's own half-thickness when testing whether it actually crosses a
  // corridor's runCoord line (real walls are rasterized transforms, not infinitely thin planes).
  var WALL_CROSS_SLACK = 0.3;

  // ── 1. doorEdge ──────────────────────────────────────────────────────────────────────────────
  // d: {guid, name, storey, cx, cy, bx, by}. rotation_z is NOT used — measured across this
  // extracted data (2026-07-14 scratch session) as always 0, unusable as an axis signal. The
  // door's OWN bbox aspect ratio is the real, measured signal instead: a door wide in X sits in a
  // wall that runs along X (cluster candidates share Y); wide in Y sits in a Y-running wall.
  function doorEdge(d) {
    var wideX = d.bx >= d.by;
    return wideX
      ? { guid: d.guid, name: d.name, storey: d.storey, axis: 'x', runCoord: d.cy, alongCoord: d.cx, cx: d.cx, cy: d.cy }
      : { guid: d.guid, name: d.name, storey: d.storey, axis: 'y', runCoord: d.cx, alongCoord: d.cy, cx: d.cx, cy: d.cy };
  }

  // ── 2. correlateDoorEdges ────────────────────────────────────────────────────────────────────
  function correlateDoorEdges(edges) {
    var buckets = {}, order = [];
    edges.forEach(function (e) {
      var rounded = Math.round(e.runCoord / RUN_COORD_TOL) * RUN_COORD_TOL;
      var key = e.storey + '|' + e.axis + '|' + rounded.toFixed(2);
      if (!buckets[key]) {
        buckets[key] = { key: key, storey: e.storey, axis: e.axis, runCoord: rounded, doors: [] };
        order.push(key);
      }
      buckets[key].doors.push(e);
    });
    return order.map(function (k) { return buckets[k]; });
  }

  // ── 3. joinDoorways ──────────────────────────────────────────────────────────────────────────
  function joinDoorways(buckets) {
    return buckets.filter(function (b) { return b.doors.length >= MIN_DOORS_FOR_HALLWAY; });
  }

  // ── 4. growToWall ────────────────────────────────────────────────────────────────────────────
  // walls: array of {cx,cy,bx,by} (real IfcWall% only — columns/beams deliberately excluded per
  // user, "ignore supporting columns/beams for convenience"). A capping wall runs PERPENDICULAR to
  // this bucket's axis (a cross-wall stopping the corridor) — a wall running the SAME way as the
  // bucket is more of the corridor's own side wall, not a cap.
  function growToWall(bucket, walls) {
    var alongs = bucket.doors.map(function (d) { return d.alongCoord; });
    var lo = Math.min.apply(null, alongs), hi = Math.max.apply(null, alongs);
    var rc = bucket.runCoord;
    var loCap = null, hiCap = null;
    walls.forEach(function (w) {
      var wWideX = w.bx >= w.by;
      var wAxis = wWideX ? 'x' : 'y';
      if (wAxis === bucket.axis) return; // must run the OTHER way to cap this corridor
      var alongC = (bucket.axis === 'x') ? w.cx : w.cy;
      var perpLo = (bucket.axis === 'x') ? (w.cy - w.by / 2) : (w.cx - w.bx / 2);
      var perpHi = (bucket.axis === 'x') ? (w.cy + w.by / 2) : (w.cx + w.bx / 2);
      if (rc < perpLo - WALL_CROSS_SLACK || rc > perpHi + WALL_CROSS_SLACK) return; // doesn't cross this line
      if (alongC <= lo && (loCap === null || alongC > loCap)) loCap = alongC;
      if (alongC >= hi && (hiCap === null || alongC < hiCap)) hiCap = alongC;
    });
    bucket.span = { lo: (loCap !== null) ? loCap : lo, hi: (hiCap !== null) ? hiCap : hi };
    bucket.openLo = (loCap === null);
    bucket.openHi = (hiCap === null);
    return bucket;
  }

  // §CORRIDOR-WIDTH (2026-07-14): the corridor's own SIDE walls run the SAME axis as the bucket
  // (unlike growToWall's END caps, which run perpendicular) — find the nearest one flanking
  // runCoord on each side, so the backbone carries a REAL measured width, not just a centerline.
  // WHY: room_graph.js's `_pointWalkable()` falls back to "is this point inside a compiled room
  // rect" when a storey has no walkable raster — by that fallback's own documented design, real
  // open corridor floor (no room modeled there) reads as illegal. Feeding this measured width back
  // into that legality test (see room_graph.js wiring) lets a real, wall-bounded corridor register
  // as walkable even without a raster, instead of every corridor chord failing detour.
  var DEFAULT_HALF_WIDTH = 1.2; // m — only used when no flanking wall is found on that side (rare: an open-plan edge)
  // §CORRIDOR-WIDTH-BOUNDS (2026-07-14, user-reported: false-positive rate + a mis-ID'd corridor
  // shell on Clinic Second Floor, "taking the narrow wall next to it"). bucketWidth()'s wall scan
  // had NO plausibility bounds on the flanking-wall distance — two failure modes confirmed on real
  // live data (see §HOW-TO-TEST-LIVE dump this session):
  //  - TOO CLOSE: the corridor's OWN door-hosting wall runs the SAME axis as the corridor (doors are
  //    cut INTO it), so it always satisfies this loop's "runs alongside" test too, at ~0 offset from
  //    rc — `Math.max(d, 0)` then clamped that self-match in as the "nearest" wall, collapsing the
  //    whole side to 0. Confirmed live: Clinic Second Floor's runCoord=45 bucket (8 doors) came out
  //    halfWidthLo=halfWidthHi=0.00 — a literal zero-thickness rect, not a walkable corridor.
  //  - TOO FAR: with no real nearby flanking wall, the loop still accepted whatever same-axis wall
  //    was nearest even if that was a coincidentally-aligned wall far across the building. Confirmed
  //    live on HHS: halfWidthLo up to ~7.8m on one side, ballooning bucketRect() into an 8m-wide
  //    strip that then swallowed large unrelated rooms (e.g. a 242m² room, 57% area overlap) as
  //    false-positive "Hall / Corridor" matches.
  // Both bounded the same way: a candidate wall must sit between MIN and MAX_SIDE_OFFSET from rc to
  // count as a real flanking wall; outside that window it's "no wall found on this side" (same
  // fallback as before — DEFAULT_HALF_WIDTH). MIN is bigger than 2x a real wall's thickness
  // (0.15-0.3m, see RUN_COORD_TOL comment above) so a host-wall self-match never qualifies; MAX is
  // generous even for a wide hospital double-loaded corridor (~3.6m total width) without accepting
  // an implausible cross-building match.
  var MIN_SIDE_OFFSET = 0.5;
  var MAX_SIDE_OFFSET = 3.0;
  function bucketWidth(bucket, walls) {
    var rc = bucket.runCoord, lo = bucket.span.lo, hi = bucket.span.hi;
    var nearAbove = null, nearBelow = null;
    walls.forEach(function (w) {
      var wWideX = w.bx >= w.by;
      var wAxis = wWideX ? 'x' : 'y';
      if (wAxis !== bucket.axis) return; // only the corridor's OWN side walls (same run direction)
      var alongC = (bucket.axis === 'x') ? w.cx : w.cy;
      var alongHalf = (bucket.axis === 'x') ? (w.bx / 2) : (w.by / 2);
      if (alongC + alongHalf < lo || alongC - alongHalf > hi) return; // must run alongside this corridor
      var perpC = (bucket.axis === 'x') ? w.cy : w.cx;
      var perpHalf = (bucket.axis === 'x') ? (w.by / 2) : (w.bx / 2);
      if (perpC >= rc) { var d = (perpC - perpHalf) - rc; if (d >= MIN_SIDE_OFFSET && d <= MAX_SIDE_OFFSET && (nearAbove === null || d < nearAbove)) nearAbove = d; }
      else { var d2 = rc - (perpC + perpHalf); if (d2 >= MIN_SIDE_OFFSET && d2 <= MAX_SIDE_OFFSET && (nearBelow === null || d2 < nearBelow)) nearBelow = d2; }
    });
    bucket.halfWidthHi = (nearAbove !== null) ? nearAbove : DEFAULT_HALF_WIDTH;
    bucket.halfWidthLo = (nearBelow !== null) ? nearBelow : DEFAULT_HALF_WIDTH;
    return bucket;
  }

  // Point-to-AABB distance (same convention as room_graph.js's rectDist): 0 if inside, else
  // Euclidean distance to the nearest edge/corner.
  function _rectDist(x0, y0, x1, y1, px, py) {
    var dx = Math.max(x0 - px, 0, px - x1);
    var dy = Math.max(y0 - py, 0, py - y1);
    return Math.hypot(dx, dy);
  }

  // ── 5. terminateAtStair ──────────────────────────────────────────────────────────────────────
  // stairGroups: the `groups` map from RoomGraph.getStairGroups(dbQuery, log) — the ONE trusted
  // stair extractor (WalkerDoctrine §10), reused here rather than a fresh ad-hoc IfcStair% query.
  function terminateAtStair(bucket, stairGroups, storeyOf) {
    var rc = bucket.runCoord;
    function endPoint(along) {
      return (bucket.axis === 'x') ? { x: along, y: rc } : { x: rc, y: along };
    }
    function nearestStair(pt) {
      var best = null, bestD = Infinity;
      Object.keys(stairGroups).forEach(function (key) {
        var gr = stairGroups[key];
        if (gr.xlo === Infinity) return; // no XY footprint captured (defensive, shouldn't happen)
        var d = _rectDist(gr.xlo, gr.ylo, gr.xhi, gr.yhi, pt.x, pt.y);
        if (d < bestD) { bestD = d; best = key; }
      });
      return { key: best, dist: bestD };
    }
    if (bucket.openLo) {
      var r = nearestStair(endPoint(bucket.span.lo));
      bucket.stairLo = (r.dist <= STAIR_CLEARANCE) ? r.key : null;
      bucket.stairLoDist = r.dist;
    }
    if (bucket.openHi) {
      var r2 = nearestStair(endPoint(bucket.span.hi));
      bucket.stairHi = (r2.dist <= STAIR_CLEARANCE) ? r2.key : null;
      bucket.stairHiDist = r2.dist;
    }
    return bucket;
  }

  // ── 6. walkBackbone ──────────────────────────────────────────────────────────────────────────
  // Union-find merge of buckets whose grown spans CROSS (T-junction): an x-run bucket's runCoord
  // falls inside a y-run bucket's span, AND that y-run bucket's runCoord falls inside the x-run
  // bucket's span. Returns { chains: [[bucket,...ordered...], ...] } — each chain is an ORDERED
  // path (not just a graph), per the user's explicit ask: the same structure feeds both path
  // routing (door-to-door must have a clear corridor-hugging route) and a flythrough camera path.
  // §CROSSING-IDENTITY (2026-07-14, real bug found via user screenshot): crossings/chains
  // reference the actual BUCKET OBJECTS, not positional array indices. buildBackbone() calls this
  // function once PER STOREY (a fresh, separately-indexed `buckets` array each time) — an
  // index-based crossing (`{a:i, b:j}`) would only be valid relative to THAT call's own local
  // array, but was being looked up against the GLOBAL cross-storey `joined` array by the caller
  // (room_graph.js), so a First-Floor local index could silently resolve to a completely different
  // Second-Floor bucket. Confirmed live: a phantom `spine(First Floor)->spine(Second Floor)`
  // edge with no real stair between them. Object references have no such ambiguity — safe to
  // compare by `===` since these are the SAME objects returned in `joined`/`chains`.
  function walkBackbone(buckets) {
    var n = buckets.length;
    var parent = buckets.map(function (_, i) { return i; });
    function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
    function union(a, b) { var ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; }

    var crossings = []; // {a,b,x,y} — a and b are real bucket OBJECTS (see §CROSSING-IDENTITY)
    for (var i = 0; i < n; i++) {
      for (var j = i + 1; j < n; j++) {
        var A = buckets[i], B = buckets[j];
        if (A.storey !== B.storey || A.axis === B.axis) continue;
        var xB = (A.axis === 'x') ? B.runCoord : A.runCoord; // the shared crossing point
        var yB = (A.axis === 'x') ? A.runCoord : B.runCoord;
        var aAlong = (A.axis === 'x') ? xB : yB;
        var bAlong = (B.axis === 'x') ? xB : yB;
        var aIn = aAlong >= A.span.lo - WALL_CROSS_SLACK && aAlong <= A.span.hi + WALL_CROSS_SLACK;
        var bIn = bAlong >= B.span.lo - WALL_CROSS_SLACK && bAlong <= B.span.hi + WALL_CROSS_SLACK;
        if (aIn && bIn) {
          union(i, j);
          crossings.push({ a: A, b: B, x: xB, y: yB });
        }
      }
    }

    var groups = {};
    for (var k = 0; k < n; k++) { var r = find(k); (groups[r] = groups[r] || []).push(k); }

    var chains = Object.keys(groups).map(function (r) {
      var idxs = groups[r];
      var idxBuckets = idxs.map(function (ix) { return buckets[ix]; });
      // Order the chain by a simple traversal: start at a bucket with only one crossing (a real
      // end), walk crossing-to-crossing. Falls back to insertion order if the chain has no clean
      // single-degree start (e.g. a loop) — never invents a position, just doesn't over-claim order.
      var localCross = crossings.filter(function (c) { return idxBuckets.indexOf(c.a) >= 0 && idxBuckets.indexOf(c.b) >= 0; });
      var degree = new Map(); idxBuckets.forEach(function (b) { degree.set(b, 0); });
      localCross.forEach(function (c) { degree.set(c.a, degree.get(c.a) + 1); degree.set(c.b, degree.get(c.b) + 1); });
      var starts = idxBuckets.filter(function (b) { return degree.get(b) <= 1; });
      var startB = starts.length ? starts[0] : idxBuckets[0];
      var visited = new Set(), ordered = [], cur = startB;
      while (cur !== undefined && !visited.has(cur)) {
        visited.add(cur); ordered.push(cur);
        var next = localCross.find(function (c) { return (c.a === cur || c.b === cur) && !visited.has(c.a === cur ? c.b : c.a); });
        cur = next ? (next.a === cur ? next.b : next.a) : undefined;
      }
      idxBuckets.forEach(function (b) { if (!visited.has(b)) ordered.push(b); }); // stray members (loop remnants), appended not dropped
      return {
        buckets: ordered,
        crossings: localCross,
        storey: idxBuckets[0].storey
      };
    });
    return { chains: chains, crossings: crossings };
  }

  // ── Orchestrator ─────────────────────────────────────────────────────────────────────────────
  // dbQuery: same convention as room_graph.js. opts.log optional. Returns
  // { buckets, joined, chains, crossings, stats }.
  function buildBackbone(dbQuery, opts) {
    opts = opts || {};
    var log = opts.log || function () {};

    var doorRows = dbQuery("SELECT m.guid, m.element_name, m.storey, t.center_x, t.center_y, " +
      "COALESCE(t.bbox_x,0) bx, COALESCE(t.bbox_y,0) by2 " +
      "FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid " +
      "WHERE m.ifc_class LIKE 'IfcDoor%' AND m.discipline='ARC' AND t.center_x IS NOT NULL") || [];
    var wallRows = dbQuery("SELECT m.storey, t.center_x, t.center_y, COALESCE(t.bbox_x,0) bx, COALESCE(t.bbox_y,0) by2 " +
      "FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid " +
      "WHERE m.ifc_class LIKE 'IfcWall%' AND m.discipline='ARC' AND t.center_x IS NOT NULL") || [];

    var edges = doorRows.map(function (d) {
      return doorEdge({ guid: d[0], name: d[1], storey: d[2] || '', cx: d[3], cy: d[4], bx: d[5], by: d[6] });
    });
    var wallsByStorey = {};
    wallRows.forEach(function (w) {
      var st = w[0] || '';
      (wallsByStorey[st] = wallsByStorey[st] || []).push({ cx: w[1], cy: w[2], bx: w[3], by: w[4] });
    });

    var buckets = correlateDoorEdges(edges);
    var joined = joinDoorways(buckets);
    joined.forEach(function (b) { growToWall(b, wallsByStorey[b.storey] || []); });
    joined.forEach(function (b) { bucketWidth(b, wallsByStorey[b.storey] || []); });

    var stairGroupsResult = RoomGraph ? RoomGraph.getStairGroups(dbQuery, log) : { groups: {} };
    joined.forEach(function (b) { terminateAtStair(b, stairGroupsResult.groups); });

    var byStorey = {};
    joined.forEach(function (b) { (byStorey[b.storey] = byStorey[b.storey] || []).push(b); });
    var allChains = [], allCrossings = [];
    Object.keys(byStorey).forEach(function (st) {
      var r = walkBackbone(byStorey[st]);
      r.chains.forEach(function (ch) {
        var chainIndex = allChains.length + r.chains.indexOf(ch);
        ch.buckets.forEach(function (b) { b._chainIndex = chainIndex; });
      });
      allChains = allChains.concat(r.chains);
      allCrossings = allCrossings.concat(r.crossings);
    });

    var openEnds = 0, stairTerminated = 0;
    joined.forEach(function (b) {
      if (b.openLo) { openEnds++; if (b.stairLo) stairTerminated++; }
      if (b.openHi) { openEnds++; if (b.stairHi) stairTerminated++; }
    });
    var stats = {
      doors: doorRows.length, walls: wallRows.length, buckets: buckets.length,
      joined: joined.length, chains: allChains.length, crossings: allCrossings.length,
      openEnds: openEnds, stairTerminated: stairTerminated, stairGroups: stairGroupsResult.order.length
    };
    log('§HALLWAY_BACKBONE buckets=' + stats.buckets + ' joined=' + stats.joined + ' chains=' + stats.chains +
      ' crossings=' + stats.crossings + ' openEnds=' + stats.openEnds + ' stairTerminated=' + stats.stairTerminated +
      ' stairGroups=' + stats.stairGroups);

    return { buckets: buckets, joined: joined, chains: allChains, crossings: allCrossings, stats: stats };
  }

  // A bucket's real walkable footprint as an AABB rect — span along its axis, measured
  // (or default) half-width perpendicular. Used by room_graph.js's _pointWalkable() fallback so a
  // real corridor registers as walkable even on a storey with no raster.
  function bucketRect(b) {
    var perpLo = b.runCoord - (b.halfWidthLo != null ? b.halfWidthLo : DEFAULT_HALF_WIDTH);
    var perpHi = b.runCoord + (b.halfWidthHi != null ? b.halfWidthHi : DEFAULT_HALF_WIDTH);
    return (b.axis === 'x')
      ? { x0: b.span.lo, x1: b.span.hi, y0: perpLo, y1: perpHi }
      : { x0: perpLo, x1: perpHi, y0: b.span.lo, y1: b.span.hi };
  }

  // §CORRIDOR-TYPE-LABEL (2026-07-14, user ask: "long corridors well named under Type.Hall/
  // Corridor" — resume doc §OPEN #2's UX ask, superseded signal now the verified backbone instead
  // of the old undercounting hallwayness() formula). DISPLAY-TIME classification only — does NOT
  // rewrite spatial_structure/predefined_type (that's compile-time, Sacred-file/mined-pipeline
  // territory, a bigger cross-repo change); a caller (e.g. the Find panel's Type-grouped room
  // tree) asks "which already-compiled rooms sit on a real hallway spine" and overrides the
  // DISPLAYED label only, non-destructively, for any already-compiled/patched building without a
  // new extraction run. A room qualifies iff its own rect-set CENTROID falls inside a joined
  // (>=3-door) bucket's real measured rect (bucketRect) on the same storey — real, measured
  // evidence (the bucket only exists because of real doors + real walls), not a shape/area guess.
  // Returns a map: { logicalRoomGuid: { chain: chainIndex|null } } for every matched room.
  function classifyCorridorRooms(dbQuery, opts) {
    opts = opts || {};
    var log = opts.log || function () {};
    var backbone = buildBackbone(dbQuery, opts);
    if (!backbone.joined.length) return {};

    var hasRoomGuid = false;
    try {
      var cols = dbQuery('PRAGMA table_info(spatial_structure)') || [];
      hasRoomGuid = cols.some(function (c) { return c[1] === 'room_guid'; });
    } catch (eCols) { /* stays false */ }

    // storey name comes via the parent IfcBuildingStorey row's own name — same join-through-parent
    // convention room_graph.js buildGraph() and navigate_find.js's room tree both already use.
    var spaceRows = dbQuery("SELECT s.guid, p.name" + (hasRoomGuid ? ', s.room_guid' : ', NULL') +
      ', s.center_x, s.center_y, s.size_x, s.size_y' +
      ' FROM spatial_structure s LEFT JOIN spatial_structure p ON p.guid = s.parent_guid' +
      " WHERE s.type='IfcSpace' AND s.center_x IS NOT NULL AND s.size_x IS NOT NULL") || [];

    // rects: logicalGuid -> {storey, sumX, sumY, n, ownRects: [{x0,x1,y0,y1,area}]}. A logical room
    // can be a §MULTI-RECT union of several spatial_structure rows (see navigate_find.js's own
    // dedup comment) — ownRects keeps each row's own footprint so the overlap-fraction guard below
    // can measure against the room's REAL total area, not just its averaged centroid.
    var rects = {};
    spaceRows.forEach(function (r) {
      var logicalGuid = r[2] || r[0];
      var storey = r[1] || '';
      if (!rects[logicalGuid]) rects[logicalGuid] = { storey: storey, sumX: 0, sumY: 0, n: 0, ownRects: [] };
      var g = rects[logicalGuid];
      g.sumX += r[3]; g.sumY += r[4]; g.n++;
      var sx = r[5], sy = r[6];
      g.ownRects.push({ x0: r[3] - sx / 2, x1: r[3] + sx / 2, y0: r[4] - sy / 2, y1: r[4] + sy / 2, area: sx * sy });
    });

    var bucketsByStorey = {};
    backbone.joined.forEach(function (b, bi) {
      (bucketsByStorey[b.storey] = bucketsByStorey[b.storey] || []).push({ rect: bucketRect(b), chain: b._chainIndex != null ? b._chainIndex : null });
    });

    function rectOverlapArea(a, c) {
      var ox = Math.max(0, Math.min(a.x1, c.x1) - Math.max(a.x0, c.x0));
      var oy = Math.max(0, Math.min(a.y1, c.y1) - Math.max(a.y0, c.y0));
      return ox * oy;
    }

    // §CORRIDOR-OVERLAP-FRACTION (2026-07-14, user-reported false-positive rate — 31/32 "Hall /
    // Corridor" matches on HHS were not real corridors). Centroid-inside-bucketRect ALONE is too
    // permissive: a generously-sized bucket rect (even after §CORRIDOR-WIDTH-BOUNDS above) can still
    // swallow a room many times its own size whose centroid merely happens to fall inside it. Require
    // the room's OWN measured footprint to substantially OVERLAP the bucket rect too — same
    // overlap-area discipline room_graph.js's §CORRIDOR-ROOM-BACKPROP already uses for the inverse
    // check (there: skip injecting a synthetic corridor room where a real room already sits). Here:
    // a room only counts as "on the corridor" if at least half its own area sits inside the bucket —
    // a real hallway segment (itself compiled as one or more IfcSpace rows) satisfies this trivially
    // (its own footprint effectively IS the corridor strip); an adjacent office/room whose centroid
    // drifted into an oversized rect does not.
    var MIN_OVERLAP_FRACTION = 0.5;
    var result = {};
    Object.keys(rects).forEach(function (lg) {
      var r = rects[lg];
      var cx = r.sumX / r.n, cy = r.sumY / r.n;
      var candidates = bucketsByStorey[r.storey];
      if (!candidates) return;
      var totalArea = r.ownRects.reduce(function (s, rr) { return s + rr.area; }, 0);
      for (var i = 0; i < candidates.length; i++) {
        var rc = candidates[i].rect;
        var inside = cx >= rc.x0 && cx <= rc.x1 && cy >= rc.y0 && cy <= rc.y1;
        if (!inside) continue;
        var overlapArea = r.ownRects.reduce(function (s, rr) { return s + rectOverlapArea(rr, rc); }, 0);
        if (totalArea > 0 && (overlapArea / totalArea) < MIN_OVERLAP_FRACTION) continue; // centroid drifted in, but the room's own body mostly sits outside — not really on this corridor
        result[lg] = { chain: candidates[i].chain };
        break;
      }
    });
    log('§CORRIDOR_TYPE_LABEL classifiedRooms=' + Object.keys(result).length + ' / ' + Object.keys(rects).length);
    return result;
  }

  var API = {
    doorEdge: doorEdge, correlateDoorEdges: correlateDoorEdges, joinDoorways: joinDoorways,
    growToWall: growToWall, bucketWidth: bucketWidth, bucketRect: bucketRect,
    terminateAtStair: terminateAtStair, walkBackbone: walkBackbone,
    buildBackbone: buildBackbone, classifyCorridorRooms: classifyCorridorRooms
  };
  ROOT.HallwayBackbone = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
