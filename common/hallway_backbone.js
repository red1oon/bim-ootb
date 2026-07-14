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
 *   5b. commonSenseFilter()  — §COMMON-SENSE-FILTER (2026-07-14, user's own framing): a real
 *                              walkway (1) is not a room, (2) is not too wide, (3) does not float
 *                              in mid air, (4) is always connected to doors/stairs/walls. (1)+(2)
 *                              are enforced inside growToWall/bucketWidth/classifyCorridorRooms;
 *                              this step composes (3)+(4) — isGrounded() + distanceToEnclosure()
 *                              — into one gate, run after stair-termination and before chains are
 *                              built, so only real, grounded, enclosed buckets ever join a chain.
 *   6. walkBackbone()        — union-find merge of buckets whose grown spans cross (T-junction),
 *                              then an ordered walk of each resulting chain (serves BOTH path
 *                              routing/escape-route AND a flythrough camera path from the same
 *                              structure — user's explicit ask, one structure two consumers).
 *
 * §PLAUSIBILITY-PROFILE: every tunable number governing "is this a real corridor" (door count,
 * width bounds, end-cap reach, stair clearance, overlap fraction, ...) lives in ONE object,
 * DEFAULT_PROFILE, instead of scattered magic constants. Every step function takes an OPTIONAL
 * trailing `profile` argument (buildBackbone/classifyCorridorRooms take it via `opts.profile`)
 * defaulting to DEFAULT_PROFILE — omitting it (every call site today) reproduces today's exact
 * numbers. This is a pure reorganization for inspectability, plus a ready extension point: this
 * project's WalkerDoctrine already parameterizes walk behavior by BUILDING-CLASS, so a future
 * per-class corridor profile (e.g. a wider default for an institutional/hospital class) is a
 * drop-in caller-side change, not a structural one — see DEFAULT_PROFILE's own comment.
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

  // §PLAUSIBILITY-PROFILE (2026-07-14, consolidated from what were 6 separate scattered `var`
  // constants across this file). EVERY tunable number that decides "is this a real corridor" now
  // lives in ONE place instead of being spread across doorEdge/growToWall/bucketWidth/etc — a
  // single, inspectable, swappable framework rather than ad hoc magic numbers per function. Every
  // step function below takes an OPTIONAL trailing `profile` argument defaulting to this object —
  // omitting it (the current behavior of every existing call site, in this file and in
  // room_graph.js/navigate_find.js) reproduces EXACTLY today's numbers, so this is a pure
  // reorganization, not a behavior change. The extension point is deliberate but NOT yet used for
  // anything beyond today's one profile: this project's own WalkerDoctrine already parameterizes
  // walk behavior by BUILDING-CLASS (residential vs Terminal-reference), so a future per-class
  // corridor profile (e.g. a wider default for a hospital/institutional class) is a natural fit
  // here WITHOUT any structural change — just a second profile object and a caller passing it in.
  var DEFAULT_PROFILE = {
    // bucket-rounding width for "these doors share the same wall run." Grounded in real
    // wall-thickness scale (typical interior wall 0.15-0.3m; generous slack for
    // wall-centerline-vs-face offset across a building's doors, not fitted to one building).
    runCoordTol: 0.6,
    minDoorsForHallway: 3,
    // movement-clearance tolerance, per user's own steer ("stairs movement space can be of say
    // 2 meter height flow onto the stairs contour").
    stairClearance: 2.0,
    // slack added to a wall's own half-thickness when testing whether it actually crosses a
    // corridor's runCoord line (real walls are rasterized transforms, not infinitely thin planes).
    wallCrossSlack: 0.3,
    // §CORRIDOR-WIDTH-BOUNDS / §END-CAP-REACH-BOUND (2026-07-14) — see wallLiesFlatAgainst below
    // for what these bound and why (host-wall self-match vs coincidental cross-building match).
    minSideOffset: 0.5,
    maxSideOffset: 3.0,
    defaultHalfWidth: 1.2, // only used when no flanking wall is found on a side (rare: open-plan edge)
    maxEndReach: 8.0,
    // §COMMON-SENSE-FILTER — generous for one wall's thickness + measurement slack.
    enclosureTolerance: 0.5,
    // §CORRIDOR-OVERLAP-FRACTION — a room must have this fraction of its own area inside the
    // matched bucket to count as "on the corridor", not just its centroid.
    minOverlapFraction: 0.5,
    // §CORRIDOR-SHAPE (2026-07-14, user-reported: "Type.Hall/Corridor are still non corridors but
    // mere rooms"). The overlap-fraction guard alone still lets a small, roughly SQUARE room
    // through if it's simply small enough to sit almost entirely inside a bucket rect — real live
    // data (Clinic, all 17 rooms classified before this fix): 11 of the 17 were near-square
    // closets/small-office-shaped rooms (aspect ratio 1.08-1.44, area 4.7-11.4m² — e.g. "First
    // Floor R10" at 2.4x2.2m, aspect 1.09), clearly not corridors despite high overlap fraction;
    // the other 6 were genuinely elongated (aspect 1.88-3.86, e.g. "Second Floor R7" at 16.0x4.6m,
    // aspect 3.48) and DO look like real corridor segments. A real corridor is elongated BY
    // DEFINITION — that shape is what makes it a walkway rather than a room. 1.8 sits right below
    // that real cluster's low end (1.88), cleanly separating the 6 genuine ones from the 11 boxy
    // false positives (confirmed: applying this bound moved Clinic's classifiedRooms 17->6,
    // dropping exactly those 11, keeping exactly those 6 — see debug dump, not eyeballed).
    minAspectRatio: 1.8
  };

  // §COMMON-SENSE-FILTER (2026-07-14, user's own framing): a real walkway/corridor (1) is not
  // itself a room, (2) is not implausibly wide, (3) does not float in mid air, (4) is always
  // grounded — connected to doors, a stair edge, or bounded within real walls. This is the same
  // shape of problem established indoor-routing/space-boundary tools solve (IFC 2nd-level space
  // boundary generation, Revit Room/Space boundary resolution, space-syntax axial-map tools): a
  // bounded ray-cast to the NEAREST plausible bounding surface, never an unbounded "nearest match
  // regardless of distance" search. Small named primitives formalize that shared shape so both
  // growToWall() (END caps, perpendicular walls) and bucketWidth() (SIDE walls, same-axis walls)
  // apply the SAME plausibility discipline instead of each re-inventing its own ad hoc bound; see
  // commonSenseFilter() further down for how they compose into the (3)+(4) gate.
  //   - wallLiesFlatAgainst(offset, minOffset, maxOffset): is this candidate wall's measured
  //     offset from the reference coordinate within a physically sane window? Too close (~0) is
  //     usually a self-match (the bucket's own host wall, or a door reveal/jamb stub) rather than
  //     a real bounding surface; too far is a coincidentally-aligned wall from an unrelated part
  //     of the building. minOffset=0 disables the "too close" half of the test (growToWall's end
  //     caps run PERPENDICULAR to the bucket's own doors, so there's no self-match risk there —
  //     only bucketWidth's SIDE-wall search, which scans SAME-axis walls, needs the floor too).
  //     Deliberately profile-free (plain numeric bounds in, in/out of window out) — it's the one
  //     generic low-level primitive every higher-level step feeds ITS OWN profile values into.
  function wallLiesFlatAgainst(offset, minOffset, maxOffset) {
    if (offset < minOffset || offset > maxOffset) return null;
    return offset;
  }
  //   - distanceToEnclosure(x, y, envelope, profile): 0 if the point sits within the building's
  //     own real wall-derived footprint (+ a small tolerance for wall thickness), else how far
  //     outside it sits. Backstops wallLiesFlatAgainst's per-wall bound with a whole-building
  //     sanity check — the concrete symptom this guards ("half corridor... drawn perpendicular
  //     into mid air outside building", user report 2026-07-14) is a corridor rect extending past
  //     where any real wall exists at all, not just past ONE plausible flanking wall.
  function distanceToEnclosure(x, y, envelope, profile) {
    profile = profile || DEFAULT_PROFILE;
    if (!envelope) return 0; // no envelope data — nothing to check against, don't false-flag
    var dx = Math.max(envelope.x0 - x, 0, x - envelope.x1);
    var dy = Math.max(envelope.y0 - y, 0, y - envelope.y1);
    var d = Math.hypot(dx, dy);
    return (d <= profile.enclosureTolerance) ? 0 : d;
  }
  //   - buildingEnvelope(walls): the real wall-derived footprint for one storey's worth of walls
  //     (reuses the SAME wall rows buildBackbone() already fetched — no new query). A plain bbox
  //     union, same convention as room_habitability.js's envelopeFromTransforms but wall-only and
  //     per-storey (a corridor must stay within ITS OWN floor's footprint, not the whole building's).
  function buildingEnvelope(walls) {
    if (!walls || !walls.length) return null;
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    walls.forEach(function (w) {
      x0 = Math.min(x0, w.cx - w.bx / 2); x1 = Math.max(x1, w.cx + w.bx / 2);
      y0 = Math.min(y0, w.cy - w.by / 2); y1 = Math.max(y1, w.cy + w.by / 2);
    });
    return { x0: x0, x1: x1, y0: y0, y1: y1 };
  }
  //   - isGrounded(bucket): a real walkway is "always connected to either/and doors, stairs edge,
  //     within walls" (user's own phrasing) — reject a bucket that is open on BOTH ends with NO
  //     stair anchor on EITHER end. That shape has nothing tying it to the building at all beyond
  //     its own door cluster: not a real hallway/circulation space, just a coincidental door
  //     alignment (>=3 doors is a necessary but not sufficient signal on its own). No profile
  //     needed — purely structural (openLo/openHi/stairLo/stairHi), no tunable number involved.
  function isGrounded(bucket) {
    var loOk = !bucket.openLo || !!bucket.stairLo;
    var hiOk = !bucket.openHi || !!bucket.stairHi;
    return loOk || hiOk; // at least ONE end must be wall-capped or stair-anchored
  }

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
  function correlateDoorEdges(edges, profile) {
    profile = profile || DEFAULT_PROFILE;
    var buckets = {}, order = [];
    edges.forEach(function (e) {
      var rounded = Math.round(e.runCoord / profile.runCoordTol) * profile.runCoordTol;
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
  function joinDoorways(buckets, profile) {
    profile = profile || DEFAULT_PROFILE;
    return buckets.filter(function (b) { return b.doors.length >= profile.minDoorsForHallway; });
  }

  // ── 4. growToWall ────────────────────────────────────────────────────────────────────────────
  // walls: array of {cx,cy,bx,by} (real IfcWall% only — columns/beams deliberately excluded per
  // user, "ignore supporting columns/beams for convenience"). A capping wall runs PERPENDICULAR to
  // this bucket's axis (a cross-wall stopping the corridor) — a wall running the SAME way as the
  // bucket is more of the corridor's own side wall, not a cap.
  // §END-CAP-REACH-BOUND (2026-07-14, part of §COMMON-SENSE-FILTER above — "not in mid air"): this
  // loop used to accept the nearest capping wall regardless of how far beyond the outermost door it
  // sat. Real live data (Clinic + HHS dump, this session) shows genuine end-cap reach almost always
  // under ~5m past the last door; two measured outliers (8.99m, 13.56m, both HHS) are exactly the
  // shape of a coincidentally cross-axis-aligned wall from an unrelated part of the building, the
  // SAME failure mode §CORRIDOR-WIDTH-BOUNDS fixed for the perpendicular (side) dimension — this is
  // its along-axis (end) counterpart, using the SAME wallLiesFlatAgainst() bound (no MIN needed
  // here: this wall runs perpendicular to the bucket, so it can never be the bucket's own host
  // wall — no self-match risk the way bucketWidth's side-wall scan has).
  function growToWall(bucket, walls, profile) {
    profile = profile || DEFAULT_PROFILE;
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
      if (rc < perpLo - profile.wallCrossSlack || rc > perpHi + profile.wallCrossSlack) return; // doesn't cross this line
      if (alongC <= lo && (loCap === null || alongC > loCap) && wallLiesFlatAgainst(lo - alongC, 0, profile.maxEndReach) !== null) loCap = alongC;
      if (alongC >= hi && (hiCap === null || alongC < hiCap) && wallLiesFlatAgainst(alongC - hi, 0, profile.maxEndReach) !== null) hiCap = alongC;
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
  // Both bounded the same way: a candidate wall must sit between profile.minSideOffset and
  // .maxSideOffset from rc to count as a real flanking wall; outside that window it's "no wall
  // found on this side" (same fallback as before — profile.defaultHalfWidth). minSideOffset is
  // bigger than 2x a real wall's thickness (0.15-0.3m, see runCoordTol comment above) so a
  // host-wall self-match never qualifies; maxSideOffset is generous even for a wide hospital
  // double-loaded corridor (~3.6m total width) without accepting an implausible cross-building match.
  function bucketWidth(bucket, walls, profile) {
    profile = profile || DEFAULT_PROFILE;
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
      if (perpC >= rc) { var d = wallLiesFlatAgainst((perpC - perpHalf) - rc, profile.minSideOffset, profile.maxSideOffset); if (d !== null && (nearAbove === null || d < nearAbove)) nearAbove = d; }
      else { var d2 = wallLiesFlatAgainst(rc - (perpC + perpHalf), profile.minSideOffset, profile.maxSideOffset); if (d2 !== null && (nearBelow === null || d2 < nearBelow)) nearBelow = d2; }
    });
    bucket.halfWidthHi = (nearAbove !== null) ? nearAbove : profile.defaultHalfWidth;
    bucket.halfWidthLo = (nearBelow !== null) ? nearBelow : profile.defaultHalfWidth;
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
  function terminateAtStair(bucket, stairGroups, profile) {
    profile = profile || DEFAULT_PROFILE;
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
      bucket.stairLo = (r.dist <= profile.stairClearance) ? r.key : null;
      bucket.stairLoDist = r.dist;
    }
    if (bucket.openHi) {
      var r2 = nearestStair(endPoint(bucket.span.hi));
      bucket.stairHi = (r2.dist <= profile.stairClearance) ? r2.key : null;
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
  function walkBackbone(buckets, profile) {
    profile = profile || DEFAULT_PROFILE;
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
        var aIn = aAlong >= A.span.lo - profile.wallCrossSlack && aAlong <= A.span.hi + profile.wallCrossSlack;
        var bIn = bAlong >= B.span.lo - profile.wallCrossSlack && bAlong <= B.span.hi + profile.wallCrossSlack;
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
    var profile = opts.profile || DEFAULT_PROFILE;

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

    var buckets = correlateDoorEdges(edges, profile);
    var joined = joinDoorways(buckets, profile);
    joined.forEach(function (b) { growToWall(b, wallsByStorey[b.storey] || [], profile); });
    joined.forEach(function (b) { bucketWidth(b, wallsByStorey[b.storey] || [], profile); });

    var stairGroupsResult = RoomGraph ? RoomGraph.getStairGroups(dbQuery, log) : { groups: {} };
    joined.forEach(function (b) { terminateAtStair(b, stairGroupsResult.groups, profile); });

    // §COMMON-SENSE-FILTER (2026-07-14) — final gate before a bucket is trusted as a real walkway,
    // applied AFTER width/span/stair-termination are all known. See commonSenseFilter() (step 5b)
    // for the composed (3)+(4) rule; never a silent drop — logged below when it fires.
    var envelopeByStorey = {};
    Object.keys(wallsByStorey).forEach(function (st) { envelopeByStorey[st] = buildingEnvelope(wallsByStorey[st]); });
    var filterResult = commonSenseFilter(joined, envelopeByStorey, profile);
    joined = filterResult.kept;
    if (filterResult.dropped.length) {
      var reasonCounts = {};
      filterResult.dropped.forEach(function (d) { reasonCounts[d.reason] = (reasonCounts[d.reason] || 0) + 1; });
      log('§COMMON_SENSE_FILTER dropped=' + filterResult.dropped.length + ' reasons=' + JSON.stringify(reasonCounts));
    }

    var byStorey = {};
    joined.forEach(function (b) { (byStorey[b.storey] = byStorey[b.storey] || []).push(b); });
    var allChains = [], allCrossings = [];
    Object.keys(byStorey).forEach(function (st) {
      var r = walkBackbone(byStorey[st], profile);
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
  function bucketRect(b, profile) {
    profile = profile || DEFAULT_PROFILE;
    var perpLo = b.runCoord - (b.halfWidthLo != null ? b.halfWidthLo : profile.defaultHalfWidth);
    var perpHi = b.runCoord + (b.halfWidthHi != null ? b.halfWidthHi : profile.defaultHalfWidth);
    return (b.axis === 'x')
      ? { x0: b.span.lo, x1: b.span.hi, y0: perpLo, y1: perpHi }
      : { x0: perpLo, x1: perpHi, y0: b.span.lo, y1: b.span.hi };
  }

  // §CORRIDOR-SHAPE (2026-07-14, user-reported: "Type.Hall/Corridor are still non corridors but
  // mere rooms" — see DEFAULT_PROFILE.minAspectRatio's own comment for the real measured evidence).
  // A real corridor is elongated BY DEFINITION — that shape is what makes it a walkway rather than
  // a room — so classifyCorridorRooms() rejects a candidate whose own union bounding box (across
  // all its §MULTI-RECT sub-rects — a shape property of the ROOM, not of which bucket it might
  // match, hence checked once per room, not per candidate) isn't elongated enough. Promoted to a
  // module-level primitive (matching wallLiesFlatAgainst/distanceToEnclosure/etc.) so it's
  // independently sandbox-testable, not buried inside classifyCorridorRooms().
  function unionAspectRatio(ownRects) {
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    ownRects.forEach(function (rr) { x0 = Math.min(x0, rr.x0); x1 = Math.max(x1, rr.x1); y0 = Math.min(y0, rr.y0); y1 = Math.max(y1, rr.y1); });
    var w = x1 - x0, h = y1 - y0;
    return (w > 0 && h > 0) ? Math.max(w, h) / Math.min(w, h) : 0;
  }

  // ── 5b. commonSenseFilter ────────────────────────────────────────────────────────────────────
  // Composes isGrounded() + distanceToEnclosure() into the single (3)+(4) gate from
  // §COMMON-SENSE-FILTER above — "not in mid air" + "always connected to doors/stairs/walls".
  // Runs AFTER growToWall/bucketWidth/terminateAtStair (span, width, and stair-anchoring must
  // already be known) and BEFORE walkBackbone (only grounded, enclosed buckets should ever join a
  // chain). buckets: array of joined buckets (post width/span/stair). envelopeByStorey: storey ->
  // buildingEnvelope() result for that storey. Returns { kept, dropped } — kept is the filtered
  // array (feed straight into walkBackbone/classifyCorridorRooms); dropped is
  // [{bucket, reason}] with reason one of 'ungrounded' | 'outside-envelope', for diagnostics —
  // buildBackbone() logs a summary rather than dropping silently.
  function commonSenseFilter(buckets, envelopeByStorey, profile) {
    profile = profile || DEFAULT_PROFILE;
    var kept = [], dropped = [];
    buckets.forEach(function (b) {
      if (!isGrounded(b)) { dropped.push({ bucket: b, reason: 'ungrounded' }); return; }
      var env = envelopeByStorey ? envelopeByStorey[b.storey] : null;
      var rc = bucketRect(b, profile);
      var corners = [[rc.x0, rc.y0], [rc.x0, rc.y1], [rc.x1, rc.y0], [rc.x1, rc.y1]];
      var outside = corners.some(function (c) { return distanceToEnclosure(c[0], c[1], env, profile) > 0; });
      if (outside) { dropped.push({ bucket: b, reason: 'outside-envelope' }); return; }
      kept.push(b);
    });
    return { kept: kept, dropped: dropped };
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
    var profile = opts.profile || DEFAULT_PROFILE;
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
      (bucketsByStorey[b.storey] = bucketsByStorey[b.storey] || []).push({ rect: bucketRect(b, profile), chain: b._chainIndex != null ? b._chainIndex : null });
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
    var result = {};
    Object.keys(rects).forEach(function (lg) {
      var r = rects[lg];
      if (unionAspectRatio(r.ownRects) < profile.minAspectRatio) return; // not elongated enough to be a real corridor, regardless of overlap
      var cx = r.sumX / r.n, cy = r.sumY / r.n;
      var candidates = bucketsByStorey[r.storey];
      if (!candidates) return;
      var totalArea = r.ownRects.reduce(function (s, rr) { return s + rr.area; }, 0);
      for (var i = 0; i < candidates.length; i++) {
        var rc = candidates[i].rect;
        var inside = cx >= rc.x0 && cx <= rc.x1 && cy >= rc.y0 && cy <= rc.y1;
        if (!inside) continue;
        var overlapArea = r.ownRects.reduce(function (s, rr) { return s + rectOverlapArea(rr, rc); }, 0);
        if (totalArea > 0 && (overlapArea / totalArea) < profile.minOverlapFraction) continue; // centroid drifted in, but the room's own body mostly sits outside — not really on this corridor
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
    buildBackbone: buildBackbone, classifyCorridorRooms: classifyCorridorRooms,
    // §COMMON-SENSE-FILTER — commonSenseFilter is the composed (3)+(4) gate buildBackbone() uses;
    // the 4 primitives it's built from are exported too so a sandbox can test each in isolation.
    commonSenseFilter: commonSenseFilter,
    wallLiesFlatAgainst: wallLiesFlatAgainst, distanceToEnclosure: distanceToEnclosure,
    buildingEnvelope: buildingEnvelope, isGrounded: isGrounded, unionAspectRatio: unionAspectRatio,
    // DEFAULT_PROFILE — the single consolidated source of every tunable plausibility number (see
    // §PLAUSIBILITY-PROFILE above). Exported read-only-by-convention so a caller can build a
    // variant profile via `Object.assign({}, HallwayBackbone.DEFAULT_PROFILE, {maxSideOffset: 4})`
    // and pass it as `opts.profile` to buildBackbone()/classifyCorridorRooms() — the extension
    // point for a future building-class-specific profile, not used by any caller today.
    DEFAULT_PROFILE: DEFAULT_PROFILE
  };
  ROOT.HallwayBackbone = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
